import fs from "node:fs";
import path from "node:path";
import { TENANT_COLLECTION_MANIFEST } from "../src/app/config/tenantCollections.js";
import { getAdminDb, getAdminStorage } from "../src/app/api/_firebaseAdmin.js";
import { collectLegacyStoragePaths, targetStoragePath } from "./lib/tenantMigration.mjs";

const apply = process.argv.includes("--apply");
const companyArg = process.argv.find((arg) => arg.startsWith("--company-id="));
const companyId = String(companyArg?.slice("--company-id=".length) || "").trim();

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith("#") || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(\"|')(.*)\1$/, "$2").replace(/\\n/g, "\n");
  }
}
loadEnv(path.resolve(".env.local"));

async function main() {
  if (!companyId) throw new Error("Pass --company-id=<company id>. Dry-run is the default.");
  if (apply && companyId !== "bickers-action") throw new Error("Apply is restricted to bickers-action.");

  const db = getAdminDb();
  const bucket = getAdminStorage().bucket();
  const paths = new Set();
  for (const collectionName of TENANT_COLLECTION_MANIFEST) {
    const snapshot = await db.collection(collectionName).get();
    snapshot.docs.forEach((doc) => collectLegacyStoragePaths(doc.data() || {}, paths));
  }

  const report = { mode: apply ? "apply" : "dry-run", companyId, discovered: paths.size, copied: 0, existing: 0, unresolved: [] };
  for (const sourcePath of [...paths].sort()) {
    const targetPath = targetStoragePath(sourcePath, companyId);
    const [sourceExists, targetExists] = await Promise.all([
      bucket.file(sourcePath).exists().then(([exists]) => exists),
      bucket.file(targetPath).exists().then(([exists]) => exists),
    ]);
    if (targetExists) {
      report.existing += 1;
      continue;
    }
    if (!sourceExists) {
      report.unresolved.push({ sourcePath, targetPath, reason: "source object missing" });
      continue;
    }
    if (apply) {
      await bucket.file(sourcePath).copy(bucket.file(targetPath));
      report.copied += 1;
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.unresolved.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Storage migration stopped: ${error?.message || error}`);
  process.exitCode = 1;
});
