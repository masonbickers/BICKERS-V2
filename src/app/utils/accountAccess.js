export function isAccountDisabled(record = {}) {
  return (
    record?.isEnabled === false ||
    record?.active === false ||
    record?.archived === true ||
    record?.isArchived === true ||
    record?.disabled === true ||
    record?.appDisabled === true ||
    String(record?.role || "").trim().toLowerCase() === "archived"
  );
}

export function hasCanonicalAccessRecord(record) {
  return Boolean(record && typeof record === "object" && String(record.uid || "").trim());
}

export function hasCompanyAccess(record = {}) {
  return String(record?.companyId || "").trim().length > 0;
}

export function hasServiceWorkspaceAccess(record = {}) {
  const role = String(record?.role || "").trim().toLowerCase().replaceAll(/[^a-z]/g, "");
  if (["admin", "companyadmin", "platformadmin", "superadmin"].includes(role)) return true;
  return (
    record?.appAccess?.service === true ||
    record?.isService === true ||
    ["service", "workshop", "hybrid"].includes(role)
  );
}

const cleanIdentityValue = (value) => String(value || "").trim();
const normalizeIdentityEmail = (value) => cleanIdentityValue(value).toLowerCase();
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const explicitUid = (value) => {
  const uid = cleanIdentityValue(value);
  return UID_PATTERN.test(uid) ? uid : "";
};

const recordClerkIds = (record = {}) =>
  [record?.clerkUserId, record?.auth?.clerkUserId].map(cleanIdentityValue).filter(Boolean);

const recordEmails = (record = {}) =>
  ["email", "workEmail", "personalEmail", "emailAddress", "contactEmail"]
    .map((key) => normalizeIdentityEmail(record?.[key]))
    .filter(Boolean);

/**
 * Resolve the canonical user document using explicit Clerk/Firebase identity links.
 * Email is checked as an integrity constraint, never used as the identity key.
 */
export function resolveCanonicalClerkAccessRecord(
  users = [],
  { clerkUserId = "", clerkUser = {}, email = "" } = {}
) {
  const sessionClerkId = cleanIdentityValue(clerkUserId);
  const verifiedEmail = normalizeIdentityEmail(email);
  const rows = Array.isArray(users) ? users : [];

  const rawClerkUids = [clerkUser?.externalId, clerkUser?.privateMetadata?.firebaseUid]
    .map(cleanIdentityValue)
    .filter(Boolean);
  const normalizedClerkUids = rawClerkUids.map(explicitUid);
  const clerkUids = [...new Set(normalizedClerkUids.filter(Boolean))];
  if (normalizedClerkUids.some((uid) => !uid) || clerkUids.length > 1) {
    return { error: "conflicting_clerk_uid_links" };
  }

  const clerkLinkedRows = rows.filter(({ data }) => recordClerkIds(data).includes(sessionClerkId));
  if (clerkLinkedRows.length > 1) return { error: "duplicate_clerk_links" };

  const uidCandidates = [...clerkUids];
  const linkedRow = clerkLinkedRows[0] || null;
  if (linkedRow) {
    const linkedUid = explicitUid(linkedRow.data?.uid);
    if (!linkedUid || cleanIdentityValue(linkedRow.id) !== linkedUid) {
      return { error: "canonical_uid_conflict" };
    }
    uidCandidates.push(linkedUid);
  }

  const uniqueUids = [...new Set(uidCandidates)];
  if (uniqueUids.length !== 1) return { error: "canonical_link_required" };

  const uid = uniqueUids[0];
  const canonicalRows = rows.filter(({ id }) => cleanIdentityValue(id) === uid);
  if (canonicalRows.length !== 1) return { error: "canonical_link_required" };

  const row = canonicalRows[0];
  const data = row?.data || {};
  if (explicitUid(data.uid) !== uid || (linkedRow && linkedRow !== row)) {
    return { error: "canonical_uid_conflict" };
  }

  const linkedClerkIds = recordClerkIds(data);
  if (
    new Set(linkedClerkIds).size > 1 ||
    (linkedClerkIds.length > 0 && !linkedClerkIds.includes(sessionClerkId))
  ) {
    return { error: "canonical_clerk_link_conflict" };
  }

  const canonicalEmails = recordEmails(data);
  if (canonicalEmails.length > 0 && !canonicalEmails.includes(verifiedEmail)) {
    return { error: "canonical_email_conflict" };
  }

  return { uid, row, userData: data };
}
