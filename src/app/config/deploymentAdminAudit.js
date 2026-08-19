const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeRole = (value) => {
  const role = String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (role === "platformadmin" || role === "superadmin") return "platformAdmin";
  if (role === "admin" || role === "companyadmin") return "admin";
  return "user";
};

export function auditDeploymentAdminRoles(users = [], config = {}, options = {}) {
  const canonicalByEmail = new Map();
  for (const row of users) {
    const record = row?.data && typeof row.data === "object" ? row.data : row;
    const email = normalizeEmail(record?.email);
    if (!email) continue;
    const candidates = canonicalByEmail.get(email) || [];
    candidates.push({ id: String(row?.id || ""), record });
    canonicalByEmail.set(email, candidates);
  }

  const expected = new Map();
  for (const email of config.emergencyAdminEmails || []) expected.set(normalizeEmail(email), "admin");
  for (const email of config.emergencyPlatformAdminEmails || []) expected.set(normalizeEmail(email), "platformAdmin");

  const mismatches = [];
  for (const [email, expectedRole] of expected) {
    const candidates = canonicalByEmail.get(email) || [];
    const linkedUid = String(
      options?.canonicalUidByEmail instanceof Map
        ? options.canonicalUidByEmail.get(email) || ""
        : options?.canonicalUidByEmail?.[email] || ""
    ).trim();
    const selected = linkedUid
      ? candidates.filter(({ id, record }) =>
          id === linkedUid || String(record?.uid || "").trim() === linkedUid
        )
      : candidates;
    const record = selected.length === 1 ? selected[0].record : null;
    if (selected.length !== 1) {
      mismatches.push({
        email,
        expectedRole,
        actualRole: selected.length ? "ambiguous" : "missing",
        rawRole: "",
        status: candidates.length > 1 ? "ambiguous_identity" : "missing",
      });
      continue;
    }
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
        rawRole: record ? String(record?.role || "") : "",
        status: !record ? "missing" : disabled ? "disabled" : "role_mismatch",
      });
    }
  }
  return { checked: expected.size, mismatches };
}
