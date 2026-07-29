import {
  adminCreateDocument,
  adminPatchDocument,
  adminReadDocumentWithMetadata,
} from "../../../_firebaseAdminRest.js";
import { verifyLeaseToken } from "../../../../utils/sage50ExportQueue.js";
import {
  authenticateConnector,
  connectorError,
} from "../connectors/_lib.js";

export const EXPORT_JOB_COLLECTION = "sage50ExportJobs";

const text = (value) => String(value || "").trim();

export async function authenticateJobConnector(req, rawJobId) {
  const connectorAuth = await authenticateConnector(req);
  if (connectorAuth.error) return connectorAuth;
  const jobId = text(rawJobId);
  if (!jobId || jobId.length > 180 || jobId.includes("/")) {
    return { error: connectorError("Valid export job ID is required.", 400) };
  }
  const snapshot = await adminReadDocumentWithMetadata(EXPORT_JOB_COLLECTION, jobId);
  if (!snapshot) return { error: connectorError("Export job not found.", 404) };
  const job = snapshot.data;
  if (
    job.connectorId !== connectorAuth.connector.connectorId ||
    job.tenantId !== connectorAuth.connector.tenantId
  ) {
    return { error: connectorError("Export job access denied.", 403) };
  }
  return { connector: connectorAuth.connector, jobId, job, updateTime: snapshot.updateTime };
}

export function leaseTokenFromRequest(req, body = {}) {
  return text(req.headers.get("x-sage-lease-token") || body.leaseToken);
}

export function validateActiveLease(job, connectorId, leaseToken, nowMs = Date.now()) {
  if (job.claimedBy !== connectorId) return "Export job is not leased to this connector.";
  if (!verifyLeaseToken(leaseToken, job.leaseTokenHash)) return "Invalid export job lease.";
  const expiry = Date.parse(job.leaseExpiresAt || "");
  if (!Number.isFinite(expiry) || expiry <= nowMs) return "Export job lease has expired.";
  return "";
}

export async function updateJobWithPrecondition(jobId, patch, updateTime) {
  return adminPatchDocument(EXPORT_JOB_COLLECTION, jobId, patch, {
    preconditionUpdateTime: updateTime,
  });
}

export async function writeExportJobAudit({
  action,
  connector = null,
  actor = null,
  job,
  details = {},
  now = new Date().toISOString(),
}) {
  await adminCreateDocument("adminAuditLogs", {
    actorUid: actor?.uid || connector?.connectorId || "",
    actorEmail: actor?.email || "",
    actorRole: actor?.role || (connector ? "machine" : "finance"),
    targetType: "sage50ExportJob",
    targetId: job?.jobId || "",
    companyId: job?.tenantId || "",
    action,
    area: "Sage 50 export queue",
    before: null,
    after: null,
    details,
    createdAt: now,
  });
}
