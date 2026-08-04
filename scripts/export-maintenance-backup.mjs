import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const COLLECTIONS = Object.freeze([
  "maintenanceBookings",
  "maintenanceJobs",
  "maintenanceReconciliationJobs",
  "workBookings",
  "vehicleChecks",
  "vehicleIssues",
  "defectReports",
  "serviceRecords",
  "vehicles",
]);

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

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function main() {
  loadEnvFileIfNeeded();
  const { listFirestoreDocumentsRaw } = await import("./lib/firebase-admin-readonly.mjs");
  const exportedAt = new Date().toISOString();
  const timestamp = exportedAt.replace(/[:.]/g, "-");
  const outputDirectory = path.resolve(
    process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length) ||
      ".firebase/maintenance-backups"
  );
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });

  const entries = await Promise.all(
    COLLECTIONS.map(async (collectionName) => {
      const documents = await listFirestoreDocumentsRaw(collectionName);
      return [collectionName, documents];
    })
  );
  const collections = Object.fromEntries(entries);
  const payload = {
    format: "firestore-rest-maintenance-backup-v1",
    projectId:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      "bickers-booking",
    exportedAt,
    readOnly: true,
    collections,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const digest = sha256(serialized);
  const backupPath = path.join(outputDirectory, `maintenance-${timestamp}.json`);
  const manifestPath = `${backupPath}.sha256`;
  fs.writeFileSync(backupPath, serialized, { mode: 0o600, flag: "wx" });
  fs.writeFileSync(manifestPath, `${digest}  ${path.basename(backupPath)}\n`, {
    mode: 0o600,
    flag: "wx",
  });

  console.log(JSON.stringify({
    backupPath,
    manifestPath,
    sha256: digest,
    exportedAt,
    counts: Object.fromEntries(
      Object.entries(collections).map(([collectionName, documents]) => [collectionName, documents.length])
    ),
  }, null, 2));
}

main().catch((error) => {
  console.error("Maintenance backup failed:", error);
  process.exitCode = 1;
});
