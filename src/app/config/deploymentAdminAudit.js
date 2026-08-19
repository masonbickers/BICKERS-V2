const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeRole = (value) => {
  const role = String(value || "").trim().toLowerCase();
  if (role === "platformadmin") return "platformAdmin";
  if (role === "admin") return "admin";
  return "user";
};

export function auditDeploymentAdminRoles(users = [], config = {}) {
  const canonicalByEmail = new Map();
  for (const row of users) {
    const record = row?.data && typeof row.data === "object" ? row.data : row;
    const email = normalizeEmail(record?.email);
    if (email) canonicalByEmail.set(email, record);
  }

  const expected = new Map();
  for (const email of config.emergencyAdminEmails || []) expected.set(normalizeEmail(email), "admin");
  for (const email of config.emergencyPlatformAdminEmails || []) expected.set(normalizeEmail(email), "platformAdmin");

  const mismatches = [];
  for (const [email, expectedRole] of expected) {
    const record = canonicalByEmail.get(email);
    const actualRole = normalizeRole(record?.role);
    const disabled = record?.isEnabled === false || record?.disabled === true || record?.archived === true;
    const roleMatches = expectedRole === "platformAdmin"
      ? actualRole === "platformAdmin"
      : actualRole === "admin" || actualRole === "platformAdmin";
    if (!record || disabled || !roleMatches) {
      mismatches.push({
        email,
        expectedRole,
        actualRole: record ? actualRole : "missing",
        status: !record ? "missing" : disabled ? "disabled" : "role_mismatch",
      });
    }
  }
  return { checked: expected.size, mismatches };
}
