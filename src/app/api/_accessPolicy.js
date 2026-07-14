export function evaluateActiveMember({ verifiedUser, userData, role, expectedCompanyId = "", allowedRoles = [] }) {
  if (!verifiedUser?.uid) return { allowed: false, status: 401, reason: "Not signed in" };
  if (!userData) return { allowed: false, status: 403, reason: "Missing user access record" };
  if (userData.isEnabled !== true) return { allowed: false, status: 403, reason: "Account disabled" };
  if (userData.credentialResetRequired === true) {
    return { allowed: false, status: 403, reason: "Credential reset required" };
  }
  const companyId = String(userData.companyId || "").trim();
  if (!companyId) return { allowed: false, status: 403, reason: "Missing company membership" };
  if (expectedCompanyId && companyId !== expectedCompanyId && role !== "platformAdmin") {
    return { allowed: false, status: 403, reason: "Cross-company access denied" };
  }
  if (allowedRoles.length && !allowedRoles.includes(role)) {
    return { allowed: false, status: 403, reason: "Role access denied" };
  }
  return { allowed: true, companyId };
}
