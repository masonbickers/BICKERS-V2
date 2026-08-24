import {
  adminCommitDocumentPatches,
  adminListDocuments,
  adminReadDocumentWithMetadata,
} from "../../../../../_firebaseAdminRest.js";
import {
  canAccessCompany,
  jsonError,
  requireFinanceFromRequest,
} from "../../../../../admin/_lib.js";
import { normaliseCustomerFinanceProfile } from "../../../../../../utils/accountingMappings.js";
import { CONTACT_FINANCE_PROFILE_COLLECTION } from "../../../../../../utils/contactFinanceProfiles.js";
import { sanitiseCustomerLookupResults } from "../../../../../../utils/sage50CustomerLookup.js";
import {
  CUSTOMER_LOOKUP_COLLECTION,
  writeCustomerLookupAudit,
} from "../../_lib.js";

export const runtime = "nodejs";
const text = (value) => String(value || "").trim();
const safeId = (value) => {
  const id = text(value);
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};

export async function POST(req, context) {
  try {
    const auth = await requireFinanceFromRequest(req);
    if (auth.error) return auth.error;
    const { lookupJobId: rawLookupJobId } = await context.params;
    const lookupJobId = safeId(rawLookupJobId);
    if (!lookupJobId) return jsonError("Valid customer lookup job ID is required.", 400);
    const body = await req.json().catch(() => ({}));
    const sageCustomerId = text(body.sageCustomerId);
    const lookupSnapshot = await adminReadDocumentWithMetadata(
      CUSTOMER_LOOKUP_COLLECTION,
      lookupJobId
    );
    if (!lookupSnapshot) return jsonError("Customer lookup job not found.", 404);
    const lookup = lookupSnapshot.data;
    if (!canAccessCompany(auth.userData, lookup.tenantId)) {
      return jsonError("Customer lookup company access denied.", 403);
    }
    if (lookup.status !== "succeeded") {
      return jsonError("Only a successful customer lookup can be confirmed.", 409);
    }
    const selected = sanitiseCustomerLookupResults(lookup.results)
      .find((result) => result.sageCustomerId === sageCustomerId);
    if (!selected) return jsonError("Select a verified result from this lookup.", 400);
    if (!selected.isActive) return jsonError("Inactive Sage customer accounts cannot be mapped.", 400);
    if (lookup.confirmedResult) {
      if (lookup.confirmedResult.sageCustomerId === selected.sageCustomerId) {
        return Response.json({ ok: true, idempotent: true, mapping: lookup.confirmedResult });
      }
      return jsonError("This lookup has already confirmed a different mapping.", 409);
    }
    const contactSnapshot = await adminReadDocumentWithMetadata("contacts", lookup.contactId);
    if (!contactSnapshot) return jsonError("Local customer not found.", 404);
    if (
      text(contactSnapshot.data.companyId) !== text(lookup.tenantId) ||
      !canAccessCompany(auth.userData, contactSnapshot.data.companyId)
    ) {
      return jsonError("Local customer company access denied.", 403);
    }
    const [profiles, contacts] = await Promise.all([
      adminListDocuments(CONTACT_FINANCE_PROFILE_COLLECTION, { maxDocuments: 1000 }),
      adminListDocuments("contacts", { maxDocuments: 1000 }),
    ]);
    const duplicateProfile = profiles.find(({ id, data }) =>
      id !== lookup.contactId &&
      text(data.companyId) === text(lookup.tenantId) &&
      text(data.sageCustomerId) === selected.sageCustomerId
    );
    const duplicateLegacyContact = contacts.find(({ id, data }) =>
      id !== lookup.contactId &&
      text(data.companyId) === text(lookup.tenantId) &&
      text(normaliseCustomerFinanceProfile(data).sageCustomerId) === selected.sageCustomerId
    );
    if (duplicateProfile || duplicateLegacyContact) {
      return jsonError("This Sage customer account is already mapped to another local customer.", 409);
    }

    const now = new Date().toISOString();
    const actor = {
      uid: auth.verifiedUser.uid,
      email: auth.verifiedUser.email,
      role: auth.userData.role,
    };
    const existingFinanceProfile = await adminReadDocumentWithMetadata(
      CONTACT_FINANCE_PROFILE_COLLECTION,
      lookup.contactId
    );
    if (
      existingFinanceProfile &&
      text(existingFinanceProfile.data.companyId) !== text(lookup.tenantId)
    ) {
      return jsonError("Customer finance profile company mismatch.", 409);
    }
    const financeProfile = {
      ...normaliseCustomerFinanceProfile(
        existingFinanceProfile?.data || contactSnapshot.data.financeProfile || contactSnapshot.data
      ),
      contactId: lookup.contactId,
      companyId: lookup.tenantId,
      schemaVersion: 1,
      sageCustomerId: selected.sageCustomerId,
      sageCustomerMappingStatus: "mapped",
      sageCustomerMappedAt: now,
      sageCustomerMappedBy: actor.email || actor.uid,
    };
    const confirmedResult = {
      sageCustomerId: selected.sageCustomerId,
      accountReference: selected.accountReference,
      name: selected.name,
    };
    const nextLookup = {
      ...lookup,
      confirmedResult,
      confirmedAt: now,
      confirmedBy: actor,
      updatedAt: now,
    };
    await adminCommitDocumentPatches([
      {
        collection: CONTACT_FINANCE_PROFILE_COLLECTION,
        documentId: lookup.contactId,
        patch: financeProfile,
        ...(existingFinanceProfile?.updateTime
          ? { updateTime: existingFinanceProfile.updateTime }
          : {}),
      },
      {
        collection: CUSTOMER_LOOKUP_COLLECTION,
        documentId: lookupJobId,
        patch: nextLookup,
        updateTime: lookupSnapshot.updateTime,
      },
    ]);
    await writeCustomerLookupAudit({
      action: "sage50_customer_mapping_confirmed",
      actor,
      job: nextLookup,
      details: {
        contactId: lookup.contactId,
        sageCustomerId: selected.sageCustomerId,
        accountReference: selected.accountReference,
        sageCustomerName: selected.name,
      },
      now,
    });
    return Response.json({ ok: true, idempotent: false, mapping: confirmedResult });
  } catch (error) {
    console.error("[sage50 customer mapping confirmation]", error);
    return jsonError(error?.message || "Could not confirm Sage customer mapping.", 409);
  }
}
