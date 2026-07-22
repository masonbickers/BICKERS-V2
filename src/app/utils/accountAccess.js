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

function normalizedAccessRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (["platformadmin", "platform admin", "superadmin", "super admin"].includes(value)) {
    return "platformAdmin";
  }
  if (["admin", "companyadmin", "company admin"].includes(value)) return "admin";
  return "user";
}

export function isModuleEnabledForUser(record = {}, moduleKey = "") {
  const key = String(moduleKey || "").trim();
  if (!key) return true;

  const canonicalFlags = record?.featureFlags;
  if (canonicalFlags && typeof canonicalFlags === "object" && Object.hasOwn(canonicalFlags, key)) {
    return canonicalFlags[key] !== false;
  }

  const legacyFlags = record?.features;
  if (legacyFlags && typeof legacyFlags === "object" && Object.hasOwn(legacyFlags, key)) {
    return legacyFlags[key] !== false;
  }

  return true;
}

export function hasRequiredWorkspaceAccess(record = {}, workspaces = []) {
  const required = (Array.isArray(workspaces) ? workspaces : [workspaces])
    .map((workspace) => String(workspace || "").trim())
    .filter(Boolean);
  if (!required.length) return true;

  const role = normalizedAccessRole(record?.role);
  if (role === "admin" || role === "platformAdmin") return true;

  const appAccess = record?.appAccess;
  return !!appAccess && typeof appAccess === "object"
    && required.some((workspace) => appAccess[workspace] === true);
}
