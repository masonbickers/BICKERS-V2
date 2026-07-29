import {
  sanitiseCustomerLookupResults,
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
    if (auth.job.status === "succeeded") {
      return Response.json({
        ok: true,
        lookupJobId: auth.job.lookupJobId,
        status: "succeeded",
      });
    }
    const leaseError = validateLookupLease(
      auth.job,
      auth.connector.connectorId,
      lookupLeaseToken(req, body)
    );
    if (leaseError) return connectorError(leaseError, 409);
    if (auth.job.status !== "processing") {
      return connectorError("Only a processing customer lookup can succeed.", 409);
    }
    const results = sanitiseCustomerLookupResults(body.results);
    const now = new Date().toISOString();
    const next = {
      ...auth.job,
      status: "succeeded",
      results,
      error: null,
      completedAt: now,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: now,
    };
    await updateLookupWithPrecondition(auth.lookupJobId, next, auth.updateTime);
    await writeCustomerLookupAudit({
      action: "sage50_customer_lookup_succeeded",
      connector: auth.connector,
      job: next,
      details: { resultCount: results.length },
      now,
    });
    return Response.json({
      ok: true,
      lookupJobId: next.lookupJobId,
      status: next.status,
      resultCount: results.length,
    });
  } catch (error) {
    console.error("[sage50 customer lookup succeeded]", error);
    return connectorError(error?.message || "Could not complete customer lookup.", 400);
  }
}
