import crypto from "node:crypto";
import { hashConnectorCredential, verifyConnectorCredential } from "./sage50ConnectorIdentity.js";

export const SAGE_50_EXPORT_JOB_STATUSES = Object.freeze([
  "queued",
  "claimed",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);

export const CLAIM_LEASE_MS = 2 * 60 * 1000;
export const PROCESSING_LEASE_MS = 5 * 60 * 1000;

const text = (value) => String(value ?? "").trim();

export function exportJobDocumentId(idempotencyKey) {
  return `s50job-${crypto.createHash("sha256").update(text(idempotencyKey)).digest("hex").slice(0, 40)}`;
}

export function createLease(now = new Date(), durationMs = CLAIM_LEASE_MS) {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashConnectorCredential(token),
    expiresAt: new Date(now.getTime() + durationMs).toISOString(),
  };
}

export function verifyLeaseToken(token, expectedHash) {
  return verifyConnectorCredential(token, expectedHash);
}

export function leaseIsExpired(job = {}, nowMs = Date.now()) {
  const expiry = Date.parse(job.leaseExpiresAt || "");
  return !Number.isFinite(expiry) || expiry <= nowMs;
}

export function jobCanBeClaimed(job = {}, nowMs = Date.now()) {
  return job.status === "queued" ||
    (["claimed", "processing"].includes(job.status) && leaseIsExpired(job, nowMs));
}

export function createExportQueueRecord({ contract, connectorId, now } = {}) {
  return {
    ...contract,
    invoiceId: contract.invoice.bookingId,
    connectorId: text(connectorId),
    status: "queued",
    attemptCount: 0,
    claimedAt: null,
    claimedBy: null,
    leaseTokenHash: null,
    leaseExpiresAt: null,
    processingStartedAt: null,
    completedAt: null,
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function publicExportJobStatus(job = {}) {
  return {
    jobId: job.jobId,
    idempotencyKey: job.idempotencyKey,
    invoiceId: job.invoiceId,
    draftReference: job.invoice?.draftReference || null,
    jobNumber: job.invoice?.jobNumber || null,
    tenantId: job.tenantId,
    connectorId: job.connectorId,
    status: job.status,
    attemptCount: Number(job.attemptCount || 0),
    claimedAt: job.claimedAt || null,
    leaseExpiresAt: job.leaseExpiresAt || null,
    processingStartedAt: job.processingStartedAt || null,
    completedAt: job.completedAt || null,
    invoiceReconciled: job.invoiceReconciled === true,
    reconciledAt: job.reconciledAt || null,
    result: job.result
      ? {
          outcome: job.result.outcome,
          completedAt: job.result.completedAt || null,
          postedDate: job.result.postedDate || null,
          sageInvoiceId: job.result.sageInvoiceId || null,
          invoiceNumber: job.result.invoiceNumber || null,
          error: job.result.error || null,
        }
      : null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
  };
}
