import "server-only";

import crypto from "node:crypto";
import {
  adminDownloadStorageObject,
  adminPatchDocument,
  adminReadDocumentWithMetadata,
  adminReadStorageObjectMetadata,
  adminUploadStorageObject,
} from "../api/_firebaseAdminRest.js";
import { renderIssuedInvoicePdf } from "./issuedInvoicePdf.js";

const text = (value) => String(value ?? "").trim();

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

export function issuedSnapshotChecksum(snapshot) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(snapshot)))
    .digest("hex");
}

export function issuedDocumentStoragePath(invoice) {
  const tenantId = text(invoice?.companyId);
  const invoiceId = text(invoice?.bookingId || invoice?.id);
  const number = text(invoice?.issuedSnapshot?.invoiceNumber || invoice?.invoiceNumber);
  if (!tenantId || !invoiceId || !number) {
    throw new Error("Issued invoice identity is incomplete.");
  }
  const filenamePart = number.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `companies/${tenantId}/issued-invoices/${invoiceId}/${filenamePart || "invoice"}.pdf`;
}

function actorSnapshot(actor) {
  if (actor && typeof actor === "object") {
    return {
      uid: text(actor.uid) || null,
      email: text(actor.email) || null,
      role: text(actor.role) || null,
    };
  }
  return { uid: null, email: text(actor) || null, role: null };
}

export async function ensureIssuedInvoiceDocument({
  invoiceId,
  invoiceSnapshot = null,
  actor,
  now = new Date().toISOString(),
} = {}) {
  const current = invoiceSnapshot || (await adminReadDocumentWithMetadata("invoiceQueue", invoiceId));
  if (!current) throw new Error("Invoice not found.");
  const invoice = current.data;
  if (invoice.status !== "issued" || !invoice.issuedSnapshot) {
    throw new Error("Only an issued invoice with an immutable issued snapshot can have a final document.");
  }

  const sourceSnapshotSha256 = issuedSnapshotChecksum(invoice.issuedSnapshot);
  const existing = invoice.issuedDocument;
  if (existing?.status === "stored") {
    if (text(existing.sourceSnapshotSha256) !== sourceSnapshotSha256) {
      throw new Error("Stored issued document does not match the immutable issued snapshot.");
    }
    const storageMetadata = await adminReadStorageObjectMetadata(existing.storagePath);
    if (!storageMetadata) throw new Error("Stored issued invoice PDF is missing.");
    return { metadata: existing, idempotent: true };
  }

  const pdf = renderIssuedInvoicePdf(invoice.issuedSnapshot);
  const sha256 = crypto.createHash("sha256").update(pdf).digest("hex");
  const storagePath = issuedDocumentStoragePath({ id: invoiceId, ...invoice });
  let storageMetadata;
  try {
    storageMetadata = await adminUploadStorageObject(storagePath, pdf, {
      contentType: "application/pdf",
      mustNotExist: true,
    });
  } catch (error) {
    if (Number(error?.status) !== 412) throw error;
    const stored = await adminDownloadStorageObject(storagePath);
    if (!stored || crypto.createHash("sha256").update(stored).digest("hex") !== sha256) {
      throw new Error("An immutable issued document already exists with different content.");
    }
    storageMetadata = await adminReadStorageObjectMetadata(storagePath);
  }

  const generatedBy = actorSnapshot(actor);
  const filename = `${text(invoice.issuedSnapshot.invoiceNumber).replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
  const metadata = {
    schemaVersion: 1,
    status: "stored",
    storagePath,
    filename,
    contentType: "application/pdf",
    byteLength: pdf.byteLength,
    sha256,
    sourceSnapshotSha256,
    storageGeneration: text(storageMetadata?.generation) || null,
    generatedAt: now,
    generatedBy,
  };
  const audit = [
    ...(Array.isArray(invoice.audit) ? invoice.audit : []),
    {
      action: "issued_document_stored",
      fromStatus: "issued",
      toStatus: "issued",
      at: now,
      by: generatedBy.email || generatedBy.uid || "Trusted server",
      reason: "Authoritative issued invoice PDF stored.",
      metadata: {
        storagePath,
        sha256,
        sourceSnapshotSha256,
      },
    },
  ];

  try {
    await adminPatchDocument(
      "invoiceQueue",
      invoiceId,
      { issuedDocument: metadata, audit, updatedAt: now },
      { preconditionUpdateTime: current.updateTime }
    );
  } catch (error) {
    const latest = await adminReadDocumentWithMetadata("invoiceQueue", invoiceId);
    if (
      latest?.data?.issuedDocument?.status === "stored" &&
      latest.data.issuedDocument.sha256 === sha256 &&
      latest.data.issuedDocument.sourceSnapshotSha256 === sourceSnapshotSha256
    ) {
      return { metadata: latest.data.issuedDocument, idempotent: true };
    }
    throw error;
  }

  return { metadata, idempotent: false };
}
