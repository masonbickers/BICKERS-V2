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

const text = (value, max = 500) => String(value || "").trim().slice(0, max);

export async function POST(req, context) {
  try {
    const { jobId } = await context.params;
    const auth = await authenticateJobConnector(req, jobId);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    if (
      auth.job.status === "failed" &&
      auth.job.result?.error?.code === (text(body.error?.code || body.errorCode, 80) || null) &&
      auth.job.result?.error?.message === text(body.error?.message || body.errorMessage)
    ) {
      return Response.json({
        ok: true,
        jobId: auth.job.jobId,
        status: "failed",
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
      return connectorError("Only a processing export job can fail.", 409);
    }
    const now = new Date().toISOString();
    const result = {
      contractVersion: auth.job.contractVersion,
      product: auth.job.product,
      jobId: auth.job.jobId,
      outcome: "failed",
      completedAt: now,
      sageInvoiceId: null,
      invoiceNumber: null,
      error: {
        code: text(body.error?.code || body.errorCode, 80) || null,
        message: text(body.error?.message || body.errorMessage),
        retryable: body.error?.retryable === true || body.retryable === true,
      },
    };
    const errors = validateSage50ConnectorResult(result);
    if (errors.length) return connectorError(errors.join("\n"), 400);
    const next = {
      ...auth.job,
      status: "failed",
      completedAt: now,
      result,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: now,
    };
    await updateJobWithPrecondition(auth.jobId, next, auth.updateTime);
    await writeExportJobAudit({
      action: "sage50_export_job_failed",
      connector: auth.connector,
      job: next,
      details: {
        errorCode: result.error.code,
        retryable: result.error.retryable,
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
    console.error("[sage50 export failed]", error);
    return connectorError("Could not fail export job.", 409);
  }
}
