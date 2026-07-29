import {
  LOOKUP_PROCESSING_LEASE_MS,
} from "../../../../../../utils/sage50CustomerLookup.js";
import { connectorError } from "../../../connectors/_lib.js";
import {
  authenticateLookupConnector,
  lookupLeaseToken,
  updateLookupWithPrecondition,
  validateLookupLease,
  writeCustomerLookupAudit,
} from "../../_lib.js";

export const runtime = "nodejs";

export async function POST(req, context) {
  try {
    const { lookupJobId } = await context.params;
    const auth = await authenticateLookupConnector(req, lookupJobId);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const leaseError = validateLookupLease(
      auth.job,
      auth.connector.connectorId,
      lookupLeaseToken(req, body)
    );
    if (leaseError) return connectorError(leaseError, 409);
    if (auth.job.status === "processing") {
      return Response.json({
        ok: true,
        lookupJobId: auth.job.lookupJobId,
        status: "processing",
        leaseExpiresAt: auth.job.leaseExpiresAt,
      });
    }
    if (auth.job.status !== "claimed") {
      return connectorError("Only a claimed customer lookup can start.", 409);
    }
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const next = {
      ...auth.job,
      status: "processing",
      processingStartedAt: now,
      leaseExpiresAt: new Date(
        nowDate.getTime() + LOOKUP_PROCESSING_LEASE_MS
      ).toISOString(),
      updatedAt: now,
    };
    await updateLookupWithPrecondition(auth.lookupJobId, next, auth.updateTime);
    await writeCustomerLookupAudit({
      action: "sage50_customer_lookup_processing_started",
      connector: auth.connector,
      job: next,
      details: { attemptCount: next.attemptCount },
      now,
    });
    return Response.json({
      ok: true,
      lookupJobId: next.lookupJobId,
      status: next.status,
      leaseExpiresAt: next.leaseExpiresAt,
    });
  } catch (error) {
    console.error("[sage50 customer lookup started]", error);
    return connectorError("Could not start customer lookup.", 409);
  }
}
