import {
  adminPatchDocument,
  adminReadDocument,
} from "../../../_firebaseAdminRest.js";
import {
  canAccessCompany,
  jsonError,
  requireFinanceFromRequest,
} from "../../../admin/_lib.js";
import {
  createCustomerLookupRecord,
  publicCustomerLookup,
} from "../../../../utils/sage50CustomerLookup.js";
import { connectorReadyForReadOnly } from "../../../../utils/sage50ConnectorIdentity.js";
import { findTenantConnector } from "../connectors/_lib.js";
import {
  CUSTOMER_LOOKUP_COLLECTION,
  writeCustomerLookupAudit,
} from "./_lib.js";

export const runtime = "nodejs";
const text = (value) => String(value || "").trim();
const safeId = (value) => {
  const id = text(value);
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};

export async function GET(req) {
  try {
    const auth = await requireFinanceFromRequest(req);
    if (auth.error) return auth.error;
    const lookupJobId = safeId(new URL(req.url).searchParams.get("lookupJobId"));
    if (!lookupJobId) return jsonError("Valid customer lookup job ID is required.", 400);
    const job = await adminReadDocument(CUSTOMER_LOOKUP_COLLECTION, lookupJobId);
    if (!job) return jsonError("Customer lookup job not found.", 404);
    if (!canAccessCompany(auth.userData, job.tenantId)) {
      return jsonError("Customer lookup company access denied.", 403);
    }
    return Response.json({ ok: true, lookup: publicCustomerLookup(job) });
  } catch (error) {
    return jsonError(error?.message || "Could not read customer lookup.", 500);
  }
}

export async function POST(req) {
  try {
    const auth = await requireFinanceFromRequest(req);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const contactId = safeId(body.contactId);
    if (!contactId) return jsonError("Valid local customer ID is required.", 400);
    const contact = await adminReadDocument("contacts", contactId);
    if (!contact) return jsonError("Local customer not found.", 404);
    const tenantId = text(contact.companyId);
    if (!tenantId || !canAccessCompany(auth.userData, tenantId)) {
      return jsonError("Customer company access denied.", 403);
    }
    const connectorRow = await findTenantConnector(tenantId);
    if (!connectorRow || !connectorReadyForReadOnly(connectorRow.data)) {
      return jsonError("An online, read-only-capable Sage 50 connector is required.", 409);
    }
    const now = new Date();
    const actor =
      auth.verifiedUser.email || auth.verifiedUser.uid || "Authenticated finance user";
    const record = createCustomerLookupRecord({
      tenantId,
      connectorId: connectorRow.data.connectorId,
      contactId,
      query: body.query,
      requestedBy: actor,
      now,
    });
    await adminPatchDocument(
      CUSTOMER_LOOKUP_COLLECTION,
      record.lookupJobId,
      record,
      { mustNotExist: true }
    );
    await writeCustomerLookupAudit({
      action: "sage50_customer_lookup_queued",
      actor: {
        uid: auth.verifiedUser.uid,
        email: auth.verifiedUser.email,
        role: auth.userData.role,
      },
      job: record,
      details: { contactId, query: record.query, connectorId: record.connectorId },
      now: now.toISOString(),
    });
    return Response.json(
      { ok: true, lookup: publicCustomerLookup(record) },
      { status: 201 }
    );
  } catch (error) {
    console.error("[sage50 customer lookup queue]", error);
    return jsonError(error?.message || "Could not queue customer lookup.", 400);
  }
}
