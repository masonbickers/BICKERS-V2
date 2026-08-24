import "server-only";

import {
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import {
  canAccessCompany,
  jsonError,
  requireFinanceFromRequest,
} from "@/app/api/admin/_lib";
import {
  CONTACT_FINANCE_PROFILE_COLLECTION,
  buildContactFinanceProfile,
} from "@/app/utils/contactFinanceProfiles";

export const runtime = "nodejs";

const safeId = (value) => {
  const id = String(value || "").trim();
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};

async function authorisedContact(req, context) {
  const auth = await requireFinanceFromRequest(req);
  if (auth.error) return { response: auth.error };
  const { contactId: rawContactId } = await context.params;
  const contactId = safeId(rawContactId);
  if (!contactId) return { response: jsonError("Valid contact ID is required.", 400) };
  const contact = await adminReadDocument("contacts", contactId);
  if (!contact) return { response: jsonError("Contact not found.", 404) };
  if (!canAccessCompany(auth.userData, contact.companyId)) {
    return { response: jsonError("Contact company access denied.", 403) };
  }
  return { auth, contactId, contact: { id: contactId, ...contact } };
}

export async function GET(req, context) {
  try {
    const access = await authorisedContact(req, context);
    if (access.response) return access.response;
    const profile = await adminReadDocument(CONTACT_FINANCE_PROFILE_COLLECTION, access.contactId);
    if (profile && String(profile.companyId || "").trim() !== String(access.contact.companyId || "").trim()) {
      return jsonError("Contact finance profile company does not match the contact.", 409);
    }
    const legacy = !profile && access.contact.financeProfile
      ? {
          contactId: access.contactId,
          companyId: access.contact.companyId,
          ...access.contact.financeProfile,
          legacySource: true,
        }
      : null;
    return Response.json({ ok: true, profile: profile ? { id: access.contactId, ...profile } : legacy });
  } catch (error) {
    return jsonError(error?.message || "Could not load the customer finance profile.", 500);
  }
}

export async function PUT(req, context) {
  try {
    const access = await authorisedContact(req, context);
    if (access.response) return access.response;
    const body = await req.json().catch(() => ({}));
    const stored = await adminReadDocument(CONTACT_FINANCE_PROFILE_COLLECTION, access.contactId);
    if (stored && String(stored.companyId || "").trim() !== String(access.contact.companyId || "").trim()) {
      return jsonError("Contact finance profile company does not match the contact.", 409);
    }
    const existing = stored || access.contact.financeProfile || null;
    const now = new Date().toISOString();
    const profile = buildContactFinanceProfile({
      contact: access.contact,
      incoming: body.profile || body,
      existing,
      actor: access.auth.verifiedUser,
      now,
    });
    await adminPatchDocument(CONTACT_FINANCE_PROFILE_COLLECTION, access.contactId, profile);
    return Response.json({ ok: true, profile: { id: access.contactId, ...profile } });
  } catch (error) {
    console.error("[contact finance profile update]", error);
    return jsonError(error?.message || "Could not update the customer finance profile.", 500);
  }
}
