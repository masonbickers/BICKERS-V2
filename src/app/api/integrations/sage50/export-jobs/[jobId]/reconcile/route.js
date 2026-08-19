import {
  adminCommitDocumentPatches,
  adminReadDocumentWithMetadata,
} from "@/app/api/_firebaseAdminRest";
import {
  canAccessCompany,
  jsonError,
  requireActiveUserFromRequest,
} from "@/app/api/admin/_lib";
import { buildSage50Reconciliation } from "@/app/utils/sage50Reconciliation";
import { ensureIssuedInvoiceDocument } from "@/app/utils/issuedInvoiceDocumentService";
import { getDeploymentSupplier } from "@/app/config/deploymentConfig";
import {
  EXPORT_JOB_COLLECTION,
  writeExportJobAudit,
} from "../../_lib.js";

export const runtime = "nodejs";

const text = (value) => String(value || "").trim();

export async function POST(req, context) {
  try {
    const auth = await requireActiveUserFromRequest(req, { module: "finance" });
    if (auth.error) return auth.error;
    const { jobId: rawJobId } = await context.params;
    const jobId = text(rawJobId);
    if (!jobId || jobId.length > 180 || jobId.includes("/")) {
      return jsonError("Valid export job ID is required.", 400);
    }
    const jobSnapshot = await adminReadDocumentWithMetadata(EXPORT_JOB_COLLECTION, jobId);
    if (!jobSnapshot) return jsonError("Export job not found.", 404);
    const job = jobSnapshot.data;
    if (!canAccessCompany(auth.userData, job.tenantId)) {
      return jsonError("Export job company access denied.", 403);
    }
    const [invoiceSnapshot, bookingSnapshot] = await Promise.all([
      adminReadDocumentWithMetadata("invoiceQueue", job.invoiceId),
      adminReadDocumentWithMetadata("bookings", job.invoiceId),
    ]);
    if (!invoiceSnapshot || !bookingSnapshot) {
      return jsonError("Linked invoice or booking not found.", 404);
    }
    const actor = auth.verifiedUser.email || auth.verifiedUser.uid || "Authenticated finance user";
    const now = new Date().toISOString();
    const reconciliation = buildSage50Reconciliation({
      job,
      invoice: invoiceSnapshot.data,
      booking: { id: job.invoiceId, ...bookingSnapshot.data },
      actor,
      now,
      supplier: getDeploymentSupplier(),
    });

    if (!reconciliation.idempotent) {
      await adminCommitDocumentPatches([
        {
          collection: EXPORT_JOB_COLLECTION,
          documentId: jobId,
          patch: reconciliation.job,
          updateTime: jobSnapshot.updateTime,
        },
        {
          collection: "invoiceQueue",
          documentId: job.invoiceId,
          patch: reconciliation.invoice,
          updateTime: invoiceSnapshot.updateTime,
        },
        {
          collection: "bookings",
          documentId: job.invoiceId,
          patch: reconciliation.booking,
          updateTime: bookingSnapshot.updateTime,
        },
      ]);
      await writeExportJobAudit({
        action: "sage50_export_job_reconciled",
        actor: { uid: auth.verifiedUser.uid, email: auth.verifiedUser.email, role: auth.userData.role },
        job: reconciliation.job,
        details: {
          invoiceNumber: reconciliation.invoice.invoiceNumber,
          sageInvoiceId: reconciliation.invoice.sageSync?.sageInvoiceId,
          postedDate: reconciliation.invoice.issueDate,
        },
        now,
      });
    }

    const issuedDocument = await ensureIssuedInvoiceDocument({
      invoiceId: job.invoiceId,
      actor: {
        uid: auth.verifiedUser.uid,
        email: auth.verifiedUser.email,
        role: auth.userData.role,
      },
      now,
    });

    return Response.json({
      ok: true,
      idempotent: reconciliation.idempotent,
      invoice: reconciliation.invoice,
      issuedDocument: issuedDocument.metadata,
      job: {
        jobId: reconciliation.job.jobId,
        status: reconciliation.job.status,
        invoiceReconciled: true,
        reconciledAt: reconciliation.job.reconciledAt,
      },
    });
  } catch (error) {
    console.error("[sage50 export reconciliation]", error);
    const message = error?.message || "Could not reconcile Sage 50 export.";
    return jsonError(message, /required|must|match|only|successful|approved/i.test(message) ? 400 : 409);
  }
}
