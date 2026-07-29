import crypto from "node:crypto";
import {
  hashConnectorCredential,
  verifyConnectorCredential,
} from "./sage50ConnectorIdentity.js";

export const SAGE_50_CUSTOMER_LOOKUP_STATUSES = Object.freeze([
  "queued",
  "claimed",
  "processing",
  "succeeded",
  "failed",
  "expired",
  "cancelled",
]);
export const LOOKUP_CONTRACT_VERSION = 1;
export const LOOKUP_CLAIM_LEASE_MS = 2 * 60 * 1000;
export const LOOKUP_PROCESSING_LEASE_MS = 5 * 60 * 1000;
export const LOOKUP_JOB_TTL_MS = 10 * 60 * 1000;
export const LOOKUP_MAX_RESULTS = 25;

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);

export function normaliseCustomerLookupQuery(value) {
  return text(value, 100).replace(/\s+/g, " ");
}

export function createCustomerLookupRecord({
  tenantId,
  connectorId,
  contactId,
  query,
  requestedBy,
  now = new Date(),
} = {}) {
  const cleanQuery = normaliseCustomerLookupQuery(query);
  if (cleanQuery.length < 2) throw new Error("Search text must contain at least two characters.");
  const lookupJobId = `s50lookup-${crypto.randomUUID()}`;
  return {
    contractVersion: LOOKUP_CONTRACT_VERSION,
    product: "sage_50_accounts_uk",
    operation: "search_customers_read_only",
    lookupJobId,
    tenantId: text(tenantId, 180),
    connectorId: text(connectorId, 180),
    contactId: text(contactId, 180),
    query: cleanQuery,
    maxResults: LOOKUP_MAX_RESULTS,
    status: "queued",
    attemptCount: 0,
    claimedAt: null,
    claimedBy: null,
    leaseTokenHash: null,
    leaseExpiresAt: null,
    processingStartedAt: null,
    completedAt: null,
    expiresAt: new Date(now.getTime() + LOOKUP_JOB_TTL_MS).toISOString(),
    results: [],
    error: null,
    confirmedResult: null,
    confirmedAt: null,
    confirmedBy: null,
    requestedAt: now.toISOString(),
    requestedBy: text(requestedBy, 254),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function createCustomerLookupLease(now = new Date(), durationMs = LOOKUP_CLAIM_LEASE_MS) {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashConnectorCredential(token),
    expiresAt: new Date(now.getTime() + durationMs).toISOString(),
  };
}

export function verifyCustomerLookupLease(token, expectedHash) {
  return verifyConnectorCredential(token, expectedHash);
}

export function lookupIsExpired(job = {}, nowMs = Date.now()) {
  const expiry = Date.parse(job.expiresAt || "");
  return Number.isFinite(expiry) && expiry <= nowMs;
}

export function lookupCanBeClaimed(job = {}, nowMs = Date.now()) {
  if (lookupIsExpired(job, nowMs)) return false;
  if (job.status === "queued") return true;
  if (!["claimed", "processing"].includes(job.status)) return false;
  const leaseExpiry = Date.parse(job.leaseExpiresAt || "");
  return !Number.isFinite(leaseExpiry) || leaseExpiry <= nowMs;
}

export function sanitiseCustomerLookupResults(results) {
  if (!Array.isArray(results)) throw new Error("Customer lookup results must be an array.");
  const seen = new Set();
  return results.slice(0, LOOKUP_MAX_RESULTS).flatMap((raw) => {
    const sageCustomerId = text(raw?.sageCustomerId || raw?.accountReference, 80);
    const accountReference = text(raw?.accountReference || sageCustomerId, 80);
    const name = text(raw?.name, 160);
    if (!sageCustomerId || !accountReference || !name || seen.has(sageCustomerId)) return [];
    seen.add(sageCustomerId);
    return [{
      sageCustomerId,
      accountReference,
      name,
      addressSummary: text(raw?.addressSummary, 240) || null,
      postcode: text(raw?.postcode, 20) || null,
      email: text(raw?.email, 254).toLowerCase() || null,
      phone: text(raw?.phone, 40) || null,
      currency: text(raw?.currency, 8).toUpperCase() || null,
      isActive: raw?.isActive !== false,
    }];
  });
}

export function publicCustomerLookup(job = {}) {
  const effectiveStatus =
    !["succeeded", "failed", "cancelled", "expired"].includes(job.status) &&
    lookupIsExpired(job)
      ? "expired"
      : job.status;
  return {
    lookupJobId: job.lookupJobId,
    contactId: job.contactId,
    query: job.query,
    status: effectiveStatus,
    attemptCount: Number(job.attemptCount || 0),
    results: effectiveStatus === "succeeded" ? sanitiseCustomerLookupResults(job.results) : [],
    error: effectiveStatus === "failed"
      ? {
          code: text(job.error?.code, 80) || null,
          message: text(job.error?.message, 300) || "Lookup failed.",
          retryable: job.error?.retryable === true,
        }
      : null,
    expiresAt: job.expiresAt || null,
    completedAt: job.completedAt || null,
    confirmedResult: job.confirmedResult || null,
    confirmedAt: job.confirmedAt || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
  };
}
