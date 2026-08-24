import { normaliseCustomerFinanceProfile } from "./accountingMappings.js";

export const CONTACT_FINANCE_PROFILE_COLLECTION = "contactFinanceProfiles";
export const CONTACT_FINANCE_PROFILE_SCHEMA_VERSION = 1;

const SAGE_OWNED_FIELDS = [
  "sageCustomerId",
  "sageCustomerMappingStatus",
  "sageCustomerMappedAt",
  "sageCustomerMappedBy",
];

export function buildContactFinanceProfile({
  contact = {},
  incoming = {},
  existing = null,
  actor = {},
  now = new Date().toISOString(),
} = {}) {
  const normalized = normaliseCustomerFinanceProfile({
    ...contact,
    financeProfile: incoming,
  });
  const previous = existing ? normaliseCustomerFinanceProfile(existing) : null;
  if (previous) {
    SAGE_OWNED_FIELDS.forEach((field) => {
      normalized[field] = previous[field];
    });
  }
  return {
    ...normalized,
    contactId: String(contact.id || existing?.contactId || "").trim(),
    companyId: String(contact.companyId || existing?.companyId || "").trim(),
    schemaVersion: CONTACT_FINANCE_PROFILE_SCHEMA_VERSION,
    updatedAt: now,
    updatedBy: String(actor.email || actor.uid || "Authenticated finance user").trim(),
  };
}

export function mergeContactFinanceProfile(contact = {}, profile = null) {
  return profile ? { ...contact, financeProfile: normaliseCustomerFinanceProfile(profile) } : contact;
}

export function contactFinanceProfileEquivalent(left, right) {
  return JSON.stringify(normaliseCustomerFinanceProfile(left || {})) ===
    JSON.stringify(normaliseCustomerFinanceProfile(right || {}));
}
