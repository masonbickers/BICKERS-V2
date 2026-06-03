import fs from "node:fs";
import path from "node:path";

const TARGET_COMPANY_ID = "bickers-action";
const REQUIRED_USER_FIELDS = ["uid", "email", "role", "companyId", "isEnabled", "appAccess"];

const COLLECTIONS = [
  "users",
  "employees",
  "bookings",
  "deletedBookings",
  "vehicles",
  "equipment",
  "holidays",
  "notes",
  "serviceRecords",
  "defectReports",
  "maintenanceBookings",
  "maintenanceJobs",
  "vehicleIssues",
  "sickLeave",
  "uCraneFreelancers",
  "invoiceQueue",
  "timesheets",
  "vehicleChecks",
  "workBookings",
  "timesheetQueries",
];

let adminListDocuments;
let adminPatchDocument;

const clean = (value) => String(value || "").trim();

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

function missingUserFields(user) {
  return REQUIRED_USER_FIELDS.filter((field) => {
    if (field === "appAccess") return !user.appAccess || typeof user.appAccess !== "object";
    if (field === "isEnabled") return typeof user.isEnabled !== "boolean";
    return !clean(user[field]);
  });
}

function canUpdateDoc(collectionName, doc) {
  const companyId = clean(doc.companyId);
  if (companyId) {
    return { allowed: false, reason: `already has companyId ${companyId}` };
  }

  if (collectionName === "users") {
    const missing = missingUserFields(doc);
    if (missing.length !== 1 || missing[0] !== "companyId") {
      return { allowed: false, reason: `user missing fields: ${missing.join(", ") || "none"}` };
    }
  }

  return { allowed: true, reason: "" };
}

async function updateCollection(collectionName) {
  const docs = await adminListDocuments(collectionName);
  const result = {
    collection: collectionName,
    total: docs.length,
    updated: 0,
    skipped: 0,
    errors: [],
    skippedExamples: [],
  };

  for (const { id, data } of docs) {
    const decision = canUpdateDoc(collectionName, data || {});
    if (!decision.allowed) {
      result.skipped += 1;
      if (result.skippedExamples.length < 10) {
        result.skippedExamples.push({ id, reason: decision.reason });
      }
      continue;
    }

    try {
      await adminPatchDocument(collectionName, id, {
        companyId: TARGET_COMPANY_ID,
      });
      result.updated += 1;
    } catch (error) {
      result.errors.push({
        id,
        message: error?.message || String(error),
      });
    }
  }

  return result;
}

async function main() {
  loadEnvFileIfNeeded();
  ({ adminListDocuments, adminPatchDocument } = await import("../src/app/api/_firebaseAdminRest.js"));

  const startedAt = new Date().toISOString();
  const results = [];

  for (const collectionName of COLLECTIONS) {
    results.push(await updateCollection(collectionName));
  }

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: "apply",
    targetCompanyId: TARGET_COMPANY_ID,
    summary: {
      updated: results.reduce((sum, row) => sum + row.updated, 0),
      skipped: results.reduce((sum, row) => sum + row.skipped, 0),
      errors: results.reduce((sum, row) => sum + row.errors.length, 0),
    },
    results,
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.summary.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("CompanyId backfill failed:", error);
  process.exitCode = 1;
});
