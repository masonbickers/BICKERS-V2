import {
  adminCreateDocument,
  adminPatchDocument,
  adminReadDocumentWithMetadata,
} from "../../../_firebaseAdminRest.js";
import { verifyCustomerLookupLease } from "../../../../utils/sage50CustomerLookup.js";
import {
  authenticateConnector,
  connectorError,
} from "../connectors/_lib.js";

export const CUSTOMER_LOOKUP_COLLECTION = "sage50CustomerLookupJobs";
const text = (value) => String(value || "").trim();

export async function authenticateLookupConnector(req, rawLookupJobId) {
  const connectorAuth = await authenticateConnector(req);
  if (connectorAuth.error) return connectorAuth;
  const lookupJobId = text(rawLookupJobId);
  if (!lookupJobId || lookupJobId.length > 180 || lookupJobId.includes("/")) {
    return { error: connectorError("Valid customer lookup job ID is required.", 400) };
  }
  const snapshot = await adminReadDocumentWithMetadata(
    CUSTOMER_LOOKUP_COLLECTION,
    lookupJobId
  );
  if (!snapshot) return { error: connectorError("Customer lookup job not found.", 404) };
  const job = snapshot.data;
  if (
    job.connectorId !== connectorAuth.connector.connectorId ||
    job.tenantId !== connectorAuth.connector.tenantId
  ) {
    return { error: connectorError("Customer lookup job access denied.", 403) };
  }
  return {
    connector: connectorAuth.connector,
    lookupJobId,
    job,
    updateTime: snapshot.updateTime,
  };
}

export function lookupLeaseToken(req, body = {}) {
  return text(req.headers.get("x-sage-lease-token") || body.leaseToken);
}

export function validateLookupLease(job, connectorId, leaseToken, nowMs = Date.now()) {
  if (job.claimedBy !== connectorId) return "Lookup job is not leased to this connector.";
  if (!verifyCustomerLookupLease(leaseToken, job.leaseTokenHash)) {
    return "Invalid lookup job lease.";
  }
  const expiry = Date.parse(job.leaseExpiresAt || "");
  if (!Number.isFinite(expiry) || expiry <= nowMs) return "Lookup job lease has expired.";
  return "";
}

export async function updateLookupWithPrecondition(lookupJobId, patch, updateTime) {
  return adminPatchDocument(CUSTOMER_LOOKUP_COLLECTION, lookupJobId, patch, {
    preconditionUpdateTime: updateTime,
  });
}

export async function writeCustomerLookupAudit({
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
    targetType: "sage50CustomerLookup",
    targetId: job?.lookupJobId || "",
    companyId: job?.tenantId || "",
    action,
    area: "Sage 50 customer lookup",
    before: null,
    after: null,
    details,
    createdAt: now,
  });
}
