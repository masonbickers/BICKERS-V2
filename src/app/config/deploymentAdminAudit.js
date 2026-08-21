const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const normalizeRole = (value) => String(value ?? "").trim().toLowerCase();

export function auditDeploymentAdminRoles(users = [], config = {}) {
  const platformEmails = new Set((config.emergencyPlatformAdminEmails || []).map(normalizeEmail).filter(Boolean));
  const adminEmails = new Set((config.emergencyAdminEmails || []).map(normalizeEmail).filter(Boolean));
  platformEmails.forEach((email) => adminEmails.add(email));
  const byEmail = new Map();
  for (const row of users) {
    const data = row?.data || row || {};
    const email = normalizeEmail(data.email);
    if (email && !byEmail.has(email)) byEmail.set(email, data);
  }

  const mismatches = [];
  for (const email of adminEmails) {
    const expectedRole = platformEmails.has(email) ? "platformAdmin" : "admin";
    const record = byEmail.get(email);
    if (!record) {
      mismatches.push({ email, expectedRole, actualRole: "missing", status: "missing" });
      continue;
    }
    const actualRole = normalizeRole(record.role);
    if (record.isEnabled === false) {
      mismatches.push({ email, expectedRole, actualRole: actualRole || "missing", status: "disabled" });
      continue;
    }
    if (actualRole !== expectedRole.toLowerCase()) {
      mismatches.push({ email, expectedRole, actualRole: actualRole || "missing", status: "role_mismatch" });
    }
  }
  return { checked: adminEmails.size, mismatches };
}
