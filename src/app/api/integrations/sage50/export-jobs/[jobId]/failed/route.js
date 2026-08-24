import {
  validateSage50ConnectorResult,
} from "../../../../../../utils/sage50ConnectorContract.js";
import {
  MAX_EXPORT_JOB_ATTEMPTS,
  nextExportRetryAt,
} from "../../../../../../utils/sage50ExportQueue.js";
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
      ["failed", "retry_wait"].includes(auth.job.status) &&
      auth.job.result?.error?.code === (text(body.error?.code || body.errorCode, 80) || null) &&
      auth.job.result?.error?.message === text(body.error?.message || body.errorMessage)
    ) {
      return Response.json({
        ok: true,
        jobId: auth.job.jobId,
        status: auth.job.status,
        nextAttemptAt: auth.job.nextAttemptAt || null,
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
    const shouldRetry = result.error.retryable &&
      Number(auth.job.attemptCount || 0) < MAX_EXPORT_JOB_ATTEMPTS;
    const next = {
      ...auth.job,
      status: shouldRetry ? "retry_wait" : "failed",
      completedAt: shouldRetry ? null : now,
      nextAttemptAt: shouldRetry ? nextExportRetryAt(auth.job.attemptCount, new Date(now)) : null,
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
        retryScheduled: shouldRetry,
        nextAttemptAt: next.nextAttemptAt,
        invoiceLifecycleChanged: false,
      },
      now,
    });
    return Response.json({
      ok: true,
      jobId: next.jobId,
      status: next.status,
      nextAttemptAt: next.nextAttemptAt,
      invoiceLifecycleChanged: false,
    });
  } catch (error) {
    console.error("[sage50 export failed]", error);
    return connectorError("Could not fail export job.", 409);
  }
}
