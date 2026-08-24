import {
  adminListDocuments,
  adminReadDocumentWithMetadata,
} from "../../../../_firebaseAdminRest.js";
import {
  createCustomerLookupLease,
  lookupCanBeClaimed,
} from "../../../../../utils/sage50CustomerLookup.js";
import { connectorReadyForReadOnly } from "../../../../../utils/sage50ConnectorIdentity.js";
import {
  authenticateConnector,
  connectorError,
} from "../../connectors/_lib.js";
import {
  CUSTOMER_LOOKUP_COLLECTION,
  updateLookupWithPrecondition,
  writeCustomerLookupAudit,
} from "../_lib.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const auth = await authenticateConnector(req);
    if (auth.error) return auth.error;
    const connector = auth.connector;
    if (!connectorReadyForReadOnly(connector)) {
      return connectorError("Connector read-only capability is not ready.", 409);
    }
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const rows = await adminListDocuments(CUSTOMER_LOOKUP_COLLECTION, {
      maxDocuments: 500,
    });
    const candidates = rows
      .filter(({ data }) =>
        data.tenantId === connector.tenantId &&
        data.connectorId === connector.connectorId &&
        lookupCanBeClaimed(data, nowDate.getTime())
      )
      .sort((a, b) => String(a.data.createdAt).localeCompare(String(b.data.createdAt)));
    for (const candidate of candidates) {
      const snapshot = await adminReadDocumentWithMetadata(
        CUSTOMER_LOOKUP_COLLECTION,
        candidate.id
      );
      if (!snapshot || !lookupCanBeClaimed(snapshot.data, nowDate.getTime())) continue;
      const previousStatus = snapshot.data.status;
      const lease = createCustomerLookupLease(nowDate);
      const next = {
        ...snapshot.data,
        status: "claimed",
        attemptCount: Number(snapshot.data.attemptCount || 0) + 1,
        claimedAt: now,
        claimedBy: connector.connectorId,
        leaseTokenHash: lease.tokenHash,
        leaseExpiresAt: lease.expiresAt,
        processingStartedAt: null,
        updatedAt: now,
      };
      try {
        await updateLookupWithPrecondition(candidate.id, next, snapshot.updateTime);
      } catch {
        continue;
      }
      await writeCustomerLookupAudit({
        action: previousStatus === "queued"
          ? "sage50_customer_lookup_claimed"
          : "sage50_customer_lookup_reclaimed",
        connector,
        job: next,
        details: { previousStatus, attemptCount: next.attemptCount },
        now,
      });
      return Response.json({
        ok: true,
        lookup: {
          contractVersion: next.contractVersion,
          product: next.product,
          operation: next.operation,
          lookupJobId: next.lookupJobId,
          query: next.query,
          maxResults: next.maxResults,
          attemptCount: next.attemptCount,
        },
        leaseToken: lease.token,
        leaseExpiresAt: lease.expiresAt,
      });
    }
    return Response.json({ ok: true, lookup: null });
  } catch (error) {
    console.error("[sage50 customer lookup claim]", error);
    return connectorError("Could not claim customer lookup.", 500);
  }
}
