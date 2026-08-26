const ADMIN_ROLES = new Set([
  "admin",
  "companyadmin",
  "company admin",
  "platformadmin",
  "platform admin",
  "superadmin",
  "super admin",
]);

export function hasFinanceAccess(user = {}) {
  if (
    !user ||
    user.isEnabled === false ||
    user.active === false ||
    user.archived === true ||
    user.isArchived === true ||
    user.disabled === true ||
    user.appDisabled === true
  ) {
    return false;
  }
  const role = String(user.role || "").trim().toLowerCase();
  return ADMIN_ROLES.has(role) || user.financeAccess === true;
}

export function financeAccessDecision(user = {}) {
  return hasFinanceAccess(user)
    ? { allowed: true, status: 200, error: null }
    : { allowed: false, status: 403, error: "Finance access is required." };
}
