import {
  validateSage50ConnectorResult,
} from "../../../../../../utils/sage50ConnectorContract.js";
import { connectorError } from "../../../connectors/_lib.js";
import {
  authenticateJobConnector,
  leaseTokenFromRequest,
  updateJobWithPrecondition,
  validateActiveLease,
  writeExportJobAudit,
} from "../../_lib.js";

export const runtime = "nodejs";

const text = (value) => String(value || "").trim();

export async function POST(req, context) {
  try {
    const { jobId } = await context.params;
    const auth = await authenticateJobConnector(req, jobId);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    if (
      auth.job.status === "succeeded" &&
      auth.job.result?.sageInvoiceId === text(body.sageInvoiceId) &&
      auth.job.result?.invoiceNumber === text(body.invoiceNumber) &&
      auth.job.result?.postedDate === text(body.postedDate)
    ) {
      return Response.json({
        ok: true,
        jobId: auth.job.jobId,
        status: "succeeded",
        invoiceLifecycleChanged: false,
      });
    }
    const leaseError = validateActiveLease(
      auth.job,
      auth.connector.connectorId,
      leaseTokenFromRequest(req, body)
    );
    if (leaseError) return connectorError(leaseError, 409);
    if (auth.job.status !== "processing") {
      return connectorError("Only a processing export job can succeed.", 409);
    }
    const now = new Date().toISOString();
    const result = {
      contractVersion: auth.job.contractVersion,
      product: auth.job.product,
      jobId: auth.job.jobId,
      outcome: "succeeded",
      completedAt: now,
      postedDate: text(body.postedDate),
      sageInvoiceId: text(body.sageInvoiceId),
      invoiceNumber: text(body.invoiceNumber),
      error: null,
    };
    const errors = validateSage50ConnectorResult(result);
    if (errors.length) return connectorError(errors.join("\n"), 400);
    const next = {
      ...auth.job,
      status: "succeeded",
      completedAt: now,
      result,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: now,
    };
    await updateJobWithPrecondition(auth.jobId, next, auth.updateTime);
    await writeExportJobAudit({
      action: "sage50_export_job_succeeded",
      connector: auth.connector,
      job: next,
      details: {
        sageInvoiceId: result.sageInvoiceId,
        invoiceNumber: result.invoiceNumber,
        invoiceLifecycleChanged: false,
      },
      now,
    });
    return Response.json({
      ok: true,
      jobId: next.jobId,
      status: next.status,
      invoiceLifecycleChanged: false,
    });
  } catch (error) {
    console.error("[sage50 export succeeded]", error);
    return connectorError("Could not complete export job.", 409);
  }
}
