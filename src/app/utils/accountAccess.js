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
