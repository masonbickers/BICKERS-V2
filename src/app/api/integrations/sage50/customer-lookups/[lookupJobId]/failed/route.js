import { connectorError } from "../../../connectors/_lib.js";
import {
  authenticateLookupConnector,
  lookupLeaseToken,
  updateLookupWithPrecondition,
  validateLookupLease,
  writeCustomerLookupAudit,
} from "../../_lib.js";

export const runtime = "nodejs";
const text = (value, max = 300) => String(value || "").trim().slice(0, max);

export async function POST(req, context) {
  try {
    const { lookupJobId } = await context.params;
    const auth = await authenticateLookupConnector(req, lookupJobId);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    if (auth.job.status === "failed") {
      return Response.json({
        ok: true,
        lookupJobId: auth.job.lookupJobId,
        status: "failed",
      });
    }
    const leaseError = validateLookupLease(
      auth.job,
      auth.connector.connectorId,
      lookupLeaseToken(req, body)
    );
    if (leaseError) return connectorError(leaseError, 409);
    if (!["claimed", "processing"].includes(auth.job.status)) {
      return connectorError("Only an active customer lookup can fail.", 409);
    }
    const now = new Date().toISOString();
    const error = {
      code: text(body.code, 80) || "lookup_failed",
      message: text(body.message) || "Read-only Sage customer lookup failed.",
      retryable: body.retryable === true,
    };
    const next = {
      ...auth.job,
      status: "failed",
      error,
      completedAt: now,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: now,
    };
    await updateLookupWithPrecondition(auth.lookupJobId, next, auth.updateTime);
    await writeCustomerLookupAudit({
      action: "sage50_customer_lookup_failed",
      connector: auth.connector,
      job: next,
      details: { errorCode: error.code, retryable: error.retryable },
      now,
    });
    return Response.json({
      ok: true,
      lookupJobId: next.lookupJobId,
      status: next.status,
    });
  } catch (error) {
    console.error("[sage50 customer lookup failed]", error);
    return connectorError("Could not fail customer lookup.", 409);
  }
}
