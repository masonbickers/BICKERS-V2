import {
  adminListDocuments,
  adminReadDocumentWithMetadata,
} from "../../../../_firebaseAdminRest.js";
import {
  createLease,
  jobCanBeClaimed,
} from "../../../../../utils/sage50ExportQueue.js";
import { connectorReadyForInvoiceWrite } from "../../../../../utils/sage50ConnectorIdentity.js";
import {
  authenticateConnector,
  connectorError,
} from "../../connectors/_lib.js";
import {
  EXPORT_JOB_COLLECTION,
  updateJobWithPrecondition,
  writeExportJobAudit,
} from "../_lib.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const auth = await authenticateConnector(req);
    if (auth.error) return auth.error;
    const connector = auth.connector;
    if (!connectorReadyForInvoiceWrite(connector)) {
      return connectorError(
        "Connector company binding, invoice-write capability and posting enablement are required.",
        409
      );
    }
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const rows = await adminListDocuments(EXPORT_JOB_COLLECTION, { maxDocuments: 500 });
    const candidates = rows
      .filter(({ data }) =>
        data.tenantId === connector.tenantId &&
        data.connectorId === connector.connectorId &&
        jobCanBeClaimed(data, nowDate.getTime())
      )
      .sort((a, b) => String(a.data.createdAt).localeCompare(String(b.data.createdAt)));

    for (const candidate of candidates) {
      const snapshot = await adminReadDocumentWithMetadata(EXPORT_JOB_COLLECTION, candidate.id);
      if (!snapshot || !jobCanBeClaimed(snapshot.data, nowDate.getTime())) continue;
      const previousStatus = snapshot.data.status;
      const lease = createLease(nowDate);
      const next = {
        ...snapshot.data,
        status: "claimed",
        attemptCount: Number(snapshot.data.attemptCount || 0) + 1,
        claimedAt: now,
        claimedBy: connector.connectorId,
        leaseTokenHash: lease.tokenHash,
        leaseExpiresAt: lease.expiresAt,
        processingStartedAt: null,
        nextAttemptAt: null,
        completedAt: null,
        result: null,
        updatedAt: now,
      };
      try {
        await updateJobWithPrecondition(candidate.id, next, snapshot.updateTime);
      } catch {
        continue;
      }
      await writeExportJobAudit({
        action: previousStatus === "queued"
          ? "sage50_export_job_claimed"
          : previousStatus === "retry_wait"
          ? "sage50_export_job_retry_claimed"
          : "sage50_export_job_reclaimed_after_lease_expiry",
        connector,
        job: next,
        details: { attemptCount: next.attemptCount, previousStatus },
        now,
      });
      return Response.json({
        ok: true,
        queueJobId: candidate.id,
        job: {
          contractVersion: next.contractVersion,
          product: next.product,
          jobId: next.jobId,
          idempotencyKey: next.idempotencyKey,
          tenantId: next.tenantId,
          operation: next.operation,
          requestedAt: next.requestedAt,
          requestedBy: next.requestedBy,
          invoice: next.invoice,
          attemptCount: next.attemptCount,
        },
        leaseToken: lease.token,
        leaseExpiresAt: lease.expiresAt,
      });
    }
    return Response.json({ ok: true, job: null });
  } catch (error) {
    console.error("[sage50 export claim]", error);
    return connectorError("Could not claim export job.", 500);
  }
}
