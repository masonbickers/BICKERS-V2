import fs from "node:fs";
import path from "node:path";
import { TENANT_COLLECTION_MANIFEST } from "../src/app/config/tenantCollections.js";
import { getAdminDb } from "../src/app/api/_firebaseAdmin.js";
import {
  classifyCompany,
  collectLegacyStoragePaths,
  normalizeUserAccessRecord,
  rewriteStorageReferences,
} from "./lib/tenantMigration.mjs";

const apply = process.argv.includes("--apply");
const companyArg = process.argv.find((arg) => arg.startsWith("--company-id="));
const checkpointArg = process.argv.find((arg) => arg.startsWith("--checkpoint="));
const companyId = String(companyArg?.slice("--company-id=".length) || "").trim();
const collections = ["users", ...TENANT_COLLECTION_MANIFEST];

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith("#") || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(\"|')(.*)\1$/, "$2").replace(/\\n/g, "\n");
  }
}

loadEnv(path.resolve(".env.local"));

if (!companyId) {
  console.error("Pass --company-id=<company id>. Dry-run is the default; mutation also requires --apply.");
  process.exit(1);
}
if (apply && companyId !== "bickers-action") {
  console.error("This reviewed cutover only permits --company-id=bickers-action.");
  process.exit(1);
}

const checkpointPath = path.resolve(
  checkpointArg?.slice("--checkpoint=".length) || `.migration-state/company-backfill-${companyId}.json`
);

function loadCheckpoint() {
  if (!apply || !fs.existsSync(checkpointPath)) return { completedCollections: [] };
  const parsed = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  if (parsed.companyId !== companyId) throw new Error("Checkpoint company does not match this run.");
  return parsed;
}

function saveCheckpoint(checkpoint) {
  if (!apply) return;
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  const tempPath = `${checkpointPath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, checkpointPath);
}

async function scan(db) {
  const results = [];
  const documents = new Map();
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).get();
    const rows = snapshot.docs.map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() || {} }));
    documents.set(collectionName, rows);
    const counts = { total: rows.length, missing: 0, target: 0, conflict: 0, legacyStorageRefs: 0 };
    for (const row of rows) {
      counts[classifyCompany(row.data, companyId)] += 1;
      counts.legacyStorageRefs += collectLegacyStoragePaths(row.data).size;
      if (collectionName === "users") normalizeUserAccessRecord(row.data, { id: row.id, companyId });
    }
    results.push({ collection: collectionName, ...counts });
  }
  return { results, documents };
}

async function applyCollection(db, collectionName, rows) {
  let changed = 0;
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = db.batch();
    let batchChanges = 0;
    for (const row of rows.slice(offset, offset + 400)) {
      const scoped = collectionName === "users"
        ? normalizeUserAccessRecord(row.data, { id: row.id, companyId })
        : { ...rewriteStorageReferences(row.data, companyId), companyId };
      if (JSON.stringify(scoped) === JSON.stringify(row.data)) continue;
      batch.set(row.ref, scoped, { merge: false });
      batchChanges += 1;
    }
    if (batchChanges) await batch.commit();
    changed += batchChanges;
  }
  return changed;
}

async function main() {
  const db = getAdminDb();
  const startedAt = new Date().toISOString();
  const before = await scan(db);
  const conflicts = before.results.reduce((sum, row) => sum + row.conflict, 0);
  if (conflicts) {
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", companyId, before: before.results }, null, 2));
    throw new Error(`${conflicts} conflicting non-empty companyId value(s) found; no writes were made.`);
  }

  const checkpoint = loadCheckpoint();
  const completed = new Set(checkpoint.completedCollections || []);
  const changed = {};
  if (apply) {
    for (const collectionName of collections) {
      if (completed.has(collectionName)) continue;
      changed[collectionName] = await applyCollection(db, collectionName, before.documents.get(collectionName) || []);
      completed.add(collectionName);
      saveCheckpoint({
        companyId,
        completedCollections: [...completed],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const after = apply ? await scan(db) : null;
  const remaining = after?.results.reduce((sum, row) => sum + row.missing + row.conflict, 0) || 0;
  const report = {
    mode: apply ? "apply" : "dry-run",
    companyId,
    startedAt,
    finishedAt: new Date().toISOString(),
    checkpointPath: apply ? checkpointPath : null,
    before: before.results,
    changed,
    after: after?.results || null,
    acceptance: apply ? { missingOrConflictingCompanyIds: remaining, passed: remaining === 0 } : null,
  };
  console.log(JSON.stringify(report, null, 2));
  if (remaining) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Company migration stopped: ${error?.message || error}`);
  process.exitCode = 1;
});
