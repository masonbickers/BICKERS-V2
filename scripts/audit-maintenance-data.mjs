import fs from "node:fs";
import path from "node:path";

import { auditMaintenanceDataset } from "../src/app/utils/maintenanceDataAudit.js";

const COLLECTIONS = [
  "maintenanceBookings",
  "maintenanceJobs",
  "workBookings",
  "vehicleChecks",
  "vehicleIssues",
  "defectReports",
  "serviceRecords",
  "vehicles",
];

function loadEnvFileIfNeeded() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL && process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) return;
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value.replace(/\\n/g, "\n");
    }
  }
}

async function main() {
  loadEnvFileIfNeeded();
  const { listFirestoreDocuments } = await import("./lib/firebase-admin-readonly.mjs");
  const companyArg = process.argv.find((argument) => argument.startsWith("--company="));
  const companyId = companyArg ? companyArg.slice("--company=".length).trim() : "";
  const entries = await Promise.all(
    COLLECTIONS.map(async (collectionName) => {
      const documents = await listFirestoreDocuments(collectionName);
      const rows = documents
        .map(({ id, data }) => ({ id, ...(data || {}) }))
        .filter((row) => !companyId || String(row.companyId || "").trim() === companyId);
      return [collectionName, rows];
    })
  );
  const report = auditMaintenanceDataset(Object.fromEntries(entries));
  console.log(JSON.stringify({ ...report, companyId: companyId || "all" }, null, 2));
}

main().catch((error) => {
  console.error("Maintenance data audit failed:", error);
  process.exitCode = 1;
});
