import crypto from "node:crypto";
import {
  adminDownloadStorageObject,
  adminPatchDocument,
  adminReadDocumentWithMetadata,
} from "../../../_firebaseAdminRest.js";
import {
  canAccessCompany,
  jsonError,
  requireActiveUserFromRequest,
} from "../../../admin/_lib.js";
import { createInvoiceDeliveryState } from "../../../../utils/invoiceLifecycle.js";
import { sendServerEmail } from "../../../../utils/serverEmailTransport.js";

export const runtime = "nodejs";

const text = (value) => String(value ?? "").trim();
const safeId = (value) => {
  const id = text(value);
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};
const validEmail = (value) =>
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
  !/[\r\n]/.test(value);
const escapeHtml = (value) =>
  text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function actorSnapshot(auth) {
  return {
    uid: text(auth.verifiedUser.uid) || null,
    email: text(auth.verifiedUser.email) || null,
    role: text(auth.userData.role) || null,
  };
}

function auditEvent({ action, invoice, actor, now, recipient, reason, metadata = {} }) {
  return {
    action,
    fromStatus: invoice.status,
    toStatus: invoice.status,
    at: now,
    by: actor.email || actor.uid || "Authenticated finance user",
    reason,
    metadata: { recipient, ...metadata },
  };
}

export async function POST(req, context) {
  let invoiceId = "";
  let sendingSnapshot = null;
  let actor = null;
  let recipient = "";
  let subject = "";
  let attemptAt = "";
  try {
    const auth = await requireActiveUserFromRequest(req);
    if (auth.error) return auth.error;
    const { id: rawId } = await context.params;
    invoiceId = safeId(rawId);
    if (!invoiceId) return jsonError("Valid invoice ID is required.", 400);
    const body = await req.json().catch(() => ({}));
    const current = await adminReadDocumentWithMetadata("invoiceQueue", invoiceId);
    if (!current) return jsonError("Invoice not found.", 404);
    const invoice = current.data;
    if (!canAccessCompany(auth.userData, invoice.companyId)) {
      return jsonError("Invoice company access denied.", 403);
    }
    if (invoice.status !== "issued" || !invoice.issuedSnapshot) {
      return jsonError("Only an issued invoice can be delivered.", 409);
    }
    if (invoice.issuedDocument?.status !== "stored" || !text(invoice.issuedDocument.storagePath)) {
      return jsonError("The authoritative issued PDF must be stored before delivery.", 409);
    }

    const canonicalRecipient = text(invoice.issuedSnapshot.customer?.email).toLowerCase();
    recipient = text(body.recipient || canonicalRecipient).toLowerCase();
    if (!validEmail(recipient)) {
      return jsonError("A valid accounts-payable recipient email is required.", 400);
    }
    if (!canonicalRecipient || recipient !== canonicalRecipient) {
      return jsonError(
        "Recipient must match the accounts-payable email captured in the issued snapshot.",
        400
      );
    }

    const delivery = createInvoiceDeliveryState(invoice.delivery);
    if (delivery.status === "sent") {
      if (delivery.recipient !== recipient) {
        return jsonError("This invoice was already delivered to a different recipient.", 409);
      }
      return Response.json({ ok: true, idempotent: true, delivery });
    }
    if (delivery.status === "sending") {
      const lastAttempt = new Date(delivery.lastAttemptAt).getTime();
      if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < 15 * 60 * 1000) {
        return jsonError("Invoice delivery is already in progress.", 409);
      }
    }

    actor = actorSnapshot(auth);
    attemptAt = new Date().toISOString();
    subject = `Invoice ${text(invoice.issuedSnapshot.invoiceNumber)} from Bickers Action`;
    const attemptCount = delivery.attemptCount + 1;
    const sending = {
      ...delivery,
      status: "sending",
      recipient,
      subject,
      attemptCount,
      lastAttemptAt: attemptAt,
      sentAt: null,
      provider: "resend",
      providerMessageId: null,
      sentBy: actor,
      error: null,
    };
    const attemptAudit = auditEvent({
      action: "invoice_delivery_attempted",
      invoice,
      actor,
      now: attemptAt,
      recipient,
      reason: attemptCount === 1 ? "Issued invoice delivery started." : "Issued invoice delivery retried.",
      metadata: { attemptCount },
    });
    await adminPatchDocument(
      "invoiceQueue",
      invoiceId,
      {
        delivery: sending,
        audit: [...(Array.isArray(invoice.audit) ? invoice.audit : []), attemptAudit],
        updatedAt: attemptAt,
      },
      { preconditionUpdateTime: current.updateTime }
    );
    sendingSnapshot = await adminReadDocumentWithMetadata("invoiceQueue", invoiceId);

    const pdf = await adminDownloadStorageObject(invoice.issuedDocument.storagePath);
    if (!pdf) throw Object.assign(new Error("The stored issued invoice PDF is missing."), {
      code: "issued_pdf_missing",
    });
    const checksum = crypto.createHash("sha256").update(pdf).digest("hex");
    if (checksum !== text(invoice.issuedDocument.sha256)) {
      throw Object.assign(new Error("The stored issued invoice PDF failed its checksum validation."), {
        code: "issued_pdf_checksum_mismatch",
      });
    }

    const customerName =
      text(invoice.issuedSnapshot.customer?.contactName) ||
      text(invoice.issuedSnapshot.customer?.name) ||
      "Accounts Payable";
    const invoiceNumber = text(invoice.issuedSnapshot.invoiceNumber);
    const result = await sendServerEmail({
      to: recipient,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
          <p>Dear ${escapeHtml(customerName)},</p>
          <p>Please find attached invoice <strong>${escapeHtml(invoiceNumber)}</strong>.</p>
          <p>The attached PDF is the final issued invoice for your records.</p>
          <p>Kind regards,<br>Bickers Action</p>
        </div>
      `,
      text: [
        `Dear ${customerName},`,
        "",
        `Please find attached invoice ${invoiceNumber}.`,
        "The attached PDF is the final issued invoice for your records.",
        "",
        "Kind regards,",
        "Bickers Action",
      ].join("\n"),
      attachments: [{
        filename: invoice.issuedDocument.filename,
        content: pdf,
        contentType: "application/pdf",
      }],
      idempotencyKey: `invoice-delivery:${text(invoice.companyId)}:${invoiceId}`,
    });

    const sentAt = new Date().toISOString();
    const sent = {
      ...sending,
      status: "sent",
      sentAt,
      provider: result.provider,
      providerMessageId: result.messageId,
      error: null,
    };
    const sentAudit = auditEvent({
      action: "invoice_delivered",
      invoice,
      actor,
      now: sentAt,
      recipient,
      reason: "Authoritative issued invoice PDF delivered.",
      metadata: {
        attemptCount,
        provider: result.provider,
        providerMessageId: result.messageId,
        documentSha256: checksum,
      },
    });
    await adminPatchDocument(
      "invoiceQueue",
      invoiceId,
      {
        delivery: sent,
        audit: [...(sendingSnapshot?.data?.audit || []), sentAudit],
        updatedAt: sentAt,
      },
      { preconditionUpdateTime: sendingSnapshot?.updateTime }
    );
    return Response.json({ ok: true, idempotent: false, delivery: sent });
  } catch (error) {
    console.error("[invoice delivery]", error);
    if (invoiceId && sendingSnapshot && actor && recipient) {
      try {
        const failedAt = new Date().toISOString();
        const currentDelivery = createInvoiceDeliveryState(sendingSnapshot.data.delivery);
        const failed = {
          ...currentDelivery,
          status: "failed",
          error: {
            code: text(error?.code) || "delivery_failed",
            message: text(error?.message) || "Invoice delivery failed.",
          },
        };
        const failedAudit = auditEvent({
          action: "invoice_delivery_failed",
          invoice: sendingSnapshot.data,
          actor,
          now: failedAt,
          recipient,
          reason: failed.error.message,
          metadata: {
            attemptCount: failed.attemptCount,
            errorCode: failed.error.code,
          },
        });
        await adminPatchDocument(
          "invoiceQueue",
          invoiceId,
          {
            delivery: failed,
            audit: [...(sendingSnapshot.data.audit || []), failedAudit],
            updatedAt: failedAt,
          },
          { preconditionUpdateTime: sendingSnapshot.updateTime }
        );
      } catch (writeError) {
        console.error("[invoice delivery failure audit]", writeError);
      }
    }
    return jsonError(error?.message || "Invoice delivery failed.", 502);
  }
}
