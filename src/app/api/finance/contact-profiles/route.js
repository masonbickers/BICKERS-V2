import "server-only";

import { adminListDocuments } from "@/app/api/_firebaseAdminRest";
import {
  canAccessCompany,
  jsonError,
  requireFinanceFromRequest,
} from "@/app/api/admin/_lib";
import { CONTACT_FINANCE_PROFILE_COLLECTION } from "@/app/utils/contactFinanceProfiles";
import { normaliseCustomerFinanceProfile } from "@/app/utils/accountingMappings";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const auth = await requireFinanceFromRequest(req);
    if (auth.error) return auth.error;
    const requestedCompanyId = String(new URL(req.url).searchParams.get("companyId") || "").trim();
    const companyId = requestedCompanyId || String(auth.userData.companyId || "").trim();
    if (!companyId || !canAccessCompany(auth.userData, companyId)) {
      return jsonError("Finance profile company access denied.", 403);
    }
    const [rows, contacts] = await Promise.all([
      adminListDocuments(CONTACT_FINANCE_PROFILE_COLLECTION, { maxDocuments: 1000 }),
      adminListDocuments("contacts", { maxDocuments: 1000 }),
    ]);
    const companyContacts = contacts.filter(
      ({ data }) => String(data.companyId || "") === companyId
    );
    const contactIds = new Set(companyContacts.map(({ id }) => id));
    const profiles = new Map(
      rows
        .filter(({ id, data }) => contactIds.has(id) && String(data.companyId || "") === companyId)
        .map(({ id, data }) => [id, { id, ...data }])
    );
    companyContacts
      .filter(({ data }) => data.financeProfile)
      .forEach(({ id, data }) => {
        if (!profiles.has(id)) {
          profiles.set(id, {
            id,
            contactId: id,
            companyId,
            ...normaliseCustomerFinanceProfile(data),
            legacySource: true,
          });
        }
      });
    return Response.json({
      ok: true,
      profiles: [...profiles.values()],
    });
  } catch (error) {
    console.error("[contact finance profiles]", error);
    return jsonError(error?.message || "Could not load customer finance profiles.", 500);
  }
}
