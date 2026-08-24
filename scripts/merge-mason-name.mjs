import fs from "node:fs";
import path from "node:path";

const FROM_NAME = "Mason Bickers";
const TO_NAME = "Mason 2Bickers";
const COLLECTIONS = [
  "users",
  "employees",
  "bookings",
  "deletedBookings",
  "holidays",
  "notes",
  "timesheets",
  "timesheetQueries",
  "workBookings",
  "invoiceQueue",
  "maintenanceBookings",
  "maintenanceJobs",
  "vehicleChecks",
  "vehiclePrepRecords",
  "sickLeave",
];

let adminListDocuments;
let adminPatchDocument;

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

function replaceValue(value) {
  if (typeof value === "string") {
    return value.includes(FROM_NAME) ? value.replaceAll(FROM_NAME, TO_NAME) : value;
  }

  if (Array.isArray(value)) {
    const next = value.map(replaceValue);
    return dedupeNameArray(next);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceValue(item)]));
  }

  return value;
}

function dedupeNameArray(value) {
  if (!Array.isArray(value)) return value;
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const key = typeof item === "string" ? item.trim().toLowerCase() : JSON.stringify(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildPatch(data = {}) {
  const patch = {};
  for (const [key, value] of Object.entries(data)) {
    const next = replaceValue(value);
    if (stableJson(next) !== stableJson(value)) {
      patch[key] = next;
    }
  }

  if (Object.keys(patch).length) {
    patch.updatedAt = new Date().toISOString();
    patch.updatedBy = "repair:merge-mason-name";
  }

  return patch;
}

function labelFor(data = {}) {
  return String(
    data.jobNumber ||
      data.employeeName ||
      data.name ||
      data.employee ||
      data.email ||
      data.title ||
      data.date ||
      data.weekStart ||
      ""
  ).trim();
}

async function main() {
  loadEnvFileIfNeeded();
  ({ adminListDocuments, adminPatchDocument } = await import("../src/app/api/_firebaseAdminRest.js"));

  const dryRun = !process.argv.includes("--write");
  const report = {
    mode: dryRun ? "dry-run" : "write",
    from: FROM_NAME,
    to: TO_NAME,
    collections: [],
  };

  for (const collectionName of COLLECTIONS) {
    const docs = await adminListDocuments(collectionName);
    const changes = [];

    for (const { id, data } of docs) {
      const patch = buildPatch(data || {});
      const fields = Object.keys(patch).filter((field) => !["updatedAt", "updatedBy"].includes(field));
      if (!fields.length) continue;

      changes.push({
        id,
        label: labelFor(data || {}),
        fields,
        patch,
      });

      if (!dryRun) {
        await adminPatchDocument(collectionName, id, patch);
      }
    }

    report.collections.push({
      collection: collectionName,
      changed: changes.length,
      examples: changes.slice(0, 20).map(({ id, label, fields }) => ({ id, label, fields })),
    });
  }

  report.totalChanged = report.collections.reduce((sum, row) => sum + row.changed, 0);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("Merge Mason name failed:", error);
  process.exitCode = 1;
});
