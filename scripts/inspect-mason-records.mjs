import fs from "node:fs";
import path from "node:path";

let adminListDocuments;

function loadEnvFileIfNeeded() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL && process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return;
  }

  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key]) continue;

      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.replace(/\\n/g, "\n");
    }
  }
}

const clean = (value) => String(value || "").trim();
const lower = (value) => clean(value).toLowerCase();
const text = (row) => JSON.stringify(row || {}).toLowerCase();
const isMasonLike = (row) => /mason|2bickers|masonbickers|icloud/.test(text(row));
const scanCollections = [
  "users",
  "employees",
  "bookings",
  "deletedBookings",
  "holidays",
  "notes",
  "timesheets",
  "timesheetQueries",
  "adminAuditLogs",
];

function pickRecord(row = {}) {
  return {
    id: row.id,
    uid: clean(row.uid),
    authUid: clean(row.authUid),
    employeeId: clean(row.employeeId),
    email: lower(row.email || row.workEmail || row.personalEmail || row.emailAddress),
    name: clean(row.name),
    displayName: clean(row.displayName),
    fullName: clean(row.fullName),
    employeeName: clean(row.employeeName),
    role: clean(row.role),
    companyId: clean(row.companyId),
    isEnabled: row.isEnabled,
    appAccess: row.appAccess,
    createdAt: clean(row.createdAt),
    updatedAt: clean(row.updatedAt),
    updatedBy: clean(row.updatedBy),
    accessMirroredAt: clean(row.accessMirroredAt),
  };
}

function pickAudit(row = {}) {
  return {
    id: row.id,
    action: clean(row.action),
    area: clean(row.area),
    actorEmail: clean(row.actorEmail || row.actor?.email),
    actorUid: clean(row.actorUid || row.actor?.uid),
    targetType: clean(row.targetType),
    targetId: clean(row.targetId || row.targetUserId),
    createdAt: clean(row.createdAt),
    beforeName: clean(row.before?.name || row.before?.displayName || row.before?.fullName || row.before?.employeeName),
    afterName: clean(row.after?.name || row.after?.displayName || row.after?.fullName || row.after?.employeeName),
    beforeEmail: lower(row.before?.email),
    afterEmail: lower(row.after?.email),
    details: row.details || null,
  };
}

async function main() {
  loadEnvFileIfNeeded();
  ({ adminListDocuments } = await import("../src/app/api/_firebaseAdminRest.js"));

  const [userDocs, employeeDocs, auditDocs] = await Promise.all([
    adminListDocuments("users"),
    adminListDocuments("employees"),
    adminListDocuments("adminAuditLogs"),
  ]);

  const users = userDocs.map(({ id, data }) => ({ id, ...(data || {}) })).filter(isMasonLike);
  const employees = employeeDocs.map(({ id, data }) => ({ id, ...(data || {}) })).filter(isMasonLike);
  const audits = auditDocs
    .map(({ id, data }) => ({ id, ...(data || {}) }))
    .filter(isMasonLike)
    .sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)));

  const collectionMentions = [];
  for (const collectionName of scanCollections) {
    const docs = await adminListDocuments(collectionName);
    const rows = docs
      .map(({ id, data }) => ({ id, ...(data || {}) }))
      .filter((row) => /mason bickers|mason 2bickers|2bickers/i.test(JSON.stringify(row || {})));
    collectionMentions.push({
      collection: collectionName,
      count: rows.length,
      masonBickers: rows.filter((row) => /mason bickers/i.test(JSON.stringify(row || {}))).length,
      mason2Bickers: rows.filter((row) => /mason 2bickers|2bickers/i.test(JSON.stringify(row || {}))).length,
      examples: rows.slice(0, 12).map((row) => ({
        id: row.id,
        label: clean(row.jobNumber || row.employeeName || row.name || row.email || row.title || row.date || row.weekStart),
      })),
    });
  }

  const byEmail = {};
  [...users, ...employees].forEach((row) => {
    const email = lower(row.email || row.workEmail || row.personalEmail || row.emailAddress);
    if (!email) return;
    byEmail[email] = (byEmail[email] || 0) + 1;
  });

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        users: users.map(pickRecord),
        employees: employees.map(pickRecord),
        duplicateEmails: Object.entries(byEmail)
          .filter(([, count]) => count > 1)
          .map(([email, count]) => ({ email, count })),
        collectionMentions,
        auditLogs: audits.slice(0, 30).map(pickAudit),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Mason record inspection failed:", error);
  process.exitCode = 1;
});
