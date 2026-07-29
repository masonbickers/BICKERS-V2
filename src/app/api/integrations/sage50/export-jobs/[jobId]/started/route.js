import {
  PROCESSING_LEASE_MS,
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

export async function POST(req, context) {
  try {
    const { jobId } = await context.params;
    const auth = await authenticateJobConnector(req, jobId);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const leaseToken = leaseTokenFromRequest(req, body);
    const leaseError = validateActiveLease(
      auth.job,
      auth.connector.connectorId,
      leaseToken
    );
    if (leaseError) return connectorError(leaseError, 409);
    if (auth.job.status === "processing") {
      return Response.json({
        ok: true,
        jobId: auth.job.jobId,
        status: auth.job.status,
        leaseExpiresAt: auth.job.leaseExpiresAt,
      });
    }
    if (auth.job.status !== "claimed") {
      return connectorError("Only a claimed export job can start processing.", 409);
    }
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const next = {
      ...auth.job,
      status: "processing",
      processingStartedAt: now,
      leaseExpiresAt: new Date(nowDate.getTime() + PROCESSING_LEASE_MS).toISOString(),
      updatedAt: now,
    };
    await updateJobWithPrecondition(auth.jobId, next, auth.updateTime);
    await writeExportJobAudit({
      action: "sage50_export_job_processing_started",
      connector: auth.connector,
      job: next,
      details: { attemptCount: next.attemptCount },
      now,
    });
    return Response.json({
      ok: true,
      jobId: next.jobId,
      status: next.status,
      leaseExpiresAt: next.leaseExpiresAt,
    });
  } catch (error) {
    console.error("[sage50 export started]", error);
    return connectorError("Could not start export job.", 409);
  }
}
