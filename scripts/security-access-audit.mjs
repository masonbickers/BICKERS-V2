import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "src", "app");

const firestoreOps = [
  "getDoc",
  "getDocs",
  "onSnapshot",
  "setDoc",
  "updateDoc",
  "addDoc",
  "deleteDoc",
  "writeBatch",
  "runTransaction",
];

const storageOps = [
  "uploadBytes",
  "uploadBytesResumable",
  "uploadString",
  "getDownloadURL",
  "deleteObject",
];

const writeOps = new Set(["setDoc", "updateDoc", "addDoc", "deleteDoc", "writeBatch", "runTransaction"]);

const sensitiveCollections = new Set([
  "users",
  "settings",
  "platformCompanies",
  "adminAuditLogs",
  "loginSecurityLogs",
]);

const companyScopedCollections = new Set([
  "bookings",
  "employees",
  "vehicles",
  "equipment",
  "holidays",
  "notes",
  "recces",
  "shiftChangeRequests",
  "maintenance",
  "maintenanceBookings",
  "maintenanceJobs",
  "motPreChecks",
  "serviceRecords",
  "defectReports",
  "defects",
  "vehicleChecks",
  "vehicleIssues",
  "vehicleUsageNotes",
  "vehiclePrepRecords",
  "workBookings",
  "timesheets",
  "contacts",
  "invoiceQueue",
  "deletedBookings",
  "sickLeave",
  "uCraneFreelancers",
  "lorries",
  "timesheetQueries",
  "hsRegister",
  "hsCheckRecords",
  "ppeIssueRecords",
  "employeeTrainingRecords",
]);

const explicitlyTenantScopedRules = new Set([
  "bookings",
  "contacts",
  "deletedBookings",
  "defects",
  "employees",
  "equipment",
  "employeeTrainingRecords",
  "holidays",
  "hsCheckRecords",
  "hsRegister",
  "invoiceQueue",
  "lorries",
  "maintenance",
  "maintenanceBookings",
  "maintenanceJobs",
  "notes",
  "motPreChecks",
  "ppeIssueRecords",
  "recces",
  "serviceRecords",
  "shiftChangeRequests",
  "defectReports",
  "sickLeave",
  "timesheets",
  "timesheetQueries",
  "uCraneFreelancers",
  "vehicleChecks",
  "vehicleIssues",
  "vehiclePrepRecords",
  "vehicles",
  "vehicleUsageNotes",
  "workBookings",
]);

const adminUiFiles = [
  "src/app/admin/page.js",
  "src/app/platform-admin/_components/PlatformAdminShell.jsx",
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function lineNumberForOffset(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function collectStringCollections(source) {
  const collections = new Set();
  const collectionPattern = /collection\s*\(\s*db\s*,\s*["']([^"']+)["']/g;
  const docPattern = /doc\s*\(\s*db\s*,\s*["']([^"']+)["']/g;

  for (const pattern of [collectionPattern, docPattern]) {
    for (const match of source.matchAll(pattern)) {
      collections.add(match[1]);
    }
  }

  return [...collections].sort();
}

function collectFirestoreOperations(source) {
  const operations = [];
  for (const op of firestoreOps) {
    const pattern = new RegExp(`\\b${op}\\s*\\(`, "g");
    for (const match of source.matchAll(pattern)) {
      operations.push({
        op,
        line: lineNumberForOffset(source, match.index || 0),
      });
    }
  }
  return operations.sort((a, b) => a.line - b.line || a.op.localeCompare(b.op));
}

function collectStorageOperations(source) {
  const operations = [];
  for (const op of storageOps) {
    const pattern = new RegExp(`\\b${op}\\s*\\(`, "g");
    for (const match of source.matchAll(pattern)) {
      operations.push({
        op,
        line: lineNumberForOffset(source, match.index || 0),
      });
    }
  }
  return operations.sort((a, b) => a.line - b.line || a.op.localeCompare(b.op));
}

function collectStoragePathHints(source) {
  const hints = new Set();
  const stringPathPattern = /ref\s*\(\s*storage[^,]*,\s*([`"'])([^`"']+)\1/g;
  for (const match of source.matchAll(stringPathPattern)) {
    hints.add(match[2].replace(/\$\{[^}]+\}/g, "${...}"));
  }
  return [...hints].sort();
}

function classifyFile(file, source) {
  const fileRel = rel(file);
  const isClient = /^\s*["']use client["']\s*;?/m.test(source);
  const importsFirestore = /from\s+["']firebase\/firestore["']/.test(source);
  const importsStorage = /from\s+["']firebase\/storage["']/.test(source) || source.includes("firebase/storage");
  if (!isClient || (!importsFirestore && !importsStorage)) return null;

  const collections = importsFirestore ? collectStringCollections(source) : [];
  const operations = importsFirestore ? collectFirestoreOperations(source) : [];
  const storageOperations = importsStorage ? collectStorageOperations(source) : [];
  const storagePathHints = importsStorage ? collectStoragePathHints(source) : [];
  const sensitive = collections.filter((name) => sensitiveCollections.has(name));
  const writes = operations.filter((item) => writeOps.has(item.op));
  const companyCollections = collections.filter((name) => companyScopedCollections.has(name));
  const unscopedCompanyCollections = companyCollections.filter((name) => !explicitlyTenantScopedRules.has(name));
  const route =
    fileRel.startsWith("src/app/")
      ? `/${fileRel
          .replace(/^src\/app\//, "")
          .replace(/\/page\.(js|jsx|ts|tsx)$/, "")
          .replace(/\.(js|jsx|ts|tsx)$/, "")
          .replace(/\[([^\]]+)\]/g, ":$1")
          .replace(/^page$/, "")}`
      : fileRel;
  const adminGateRisk =
    adminUiFiles.includes(fileRel) &&
    (source.includes('doc(db, "users"') ||
      source.includes("doc(db, 'users'") ||
      source.includes('collection(db, "users"') ||
      source.includes("collection(db, 'users'"));

  return {
    file: fileRel,
    route,
    operations,
    storageOperations,
    storagePathHints,
    collections,
    sensitive,
    writes,
    companyCollections,
    unscopedCompanyCollections,
    adminGateRisk,
  };
}

const results = walk(appDir).map((file) => classifyFile(file, fs.readFileSync(file, "utf8"))).filter(Boolean);
const sensitiveResults = results.filter((item) => item.sensitive.length > 0 || item.adminGateRisk);
const adminGateRisks = results.filter((item) => item.adminGateRisk);
const writeResults = results.filter((item) => item.writes.length > 0);
const unscopedResults = results.filter((item) => item.unscopedCompanyCollections.length > 0);
const storageResults = results.filter((item) => item.storageOperations.length > 0);
const collectionSummary = new Map();

for (const item of results) {
  for (const collection of item.collections) {
    const row = collectionSummary.get(collection) || { reads: 0, writes: 0, files: new Set() };
    row.files.add(item.file);
    if (item.operations.some((op) => !writeOps.has(op.op))) row.reads += 1;
    if (item.writes.length > 0) row.writes += 1;
    collectionSummary.set(collection, row);
  }
}

console.log("BAS security access audit");
console.log("=========================");
console.log(`Client files with Firestore usage: ${results.length}`);
console.log(`Client files touching sensitive collections: ${sensitiveResults.length}`);
console.log(`Admin/platform gate direct users reads: ${adminGateRisks.length}`);
console.log(`Client files with Firestore writes: ${writeResults.length}`);
console.log(`Client files touching company collections without explicit tenant-scoped rules: ${unscopedResults.length}`);
console.log(`Client files with Storage operations: ${storageResults.length}`);
console.log("");

console.log("Collection summary");
console.log("------------------");
for (const [collection, row] of [...collectionSummary.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const sensitive = sensitiveCollections.has(collection) ? " sensitive" : "";
  const tenant = companyScopedCollections.has(collection)
    ? explicitlyTenantScopedRules.has(collection)
      ? " tenant-scoped"
      : " tenant-risk"
    : "";
  console.log(`- ${collection}: files ${row.files.size}, read files ${row.reads}, write files ${row.writes}${sensitive}${tenant}`);
}
console.log("");

console.log("Client Firestore writes");
console.log("-----------------------");
for (const item of writeResults) {
  const opSummary = item.writes.map((op) => `${op.op}@${op.line}`).join(", ");
  console.log(`- ${item.route} (${item.file})`);
  console.log(`  collections: ${item.collections.join(", ") || "(dynamic only)"}`);
  console.log(`  writes: ${opSummary}`);
}
console.log("");

console.log("Client Storage operations");
console.log("-------------------------");
for (const item of storageResults) {
  const opSummary = item.storageOperations.map((op) => `${op.op}@${op.line}`).join(", ");
  console.log(`- ${item.route} (${item.file})`);
  console.log(`  operations: ${opSummary}`);
  console.log(`  path hints: ${item.storagePathHints.join(", ") || "(dynamic only)"}`);
}
console.log("");

console.log("Company isolation risks");
console.log("-----------------------");
if (unscopedResults.length === 0) {
  console.log("- None found in static scan.");
} else {
  for (const item of unscopedResults) {
    console.log(`- ${item.route} (${item.file})`);
    console.log(`  collections without explicit tenant-scoped rules: ${item.unscopedCompanyCollections.join(", ")}`);
  }
}
console.log("");

console.log("Sensitive collection touchpoints");
console.log("--------------------------------");
for (const item of sensitiveResults) {
  const opSummary = item.operations.map((op) => `${op.op}@${op.line}`).join(", ");
  console.log(`- ${item.route} (${item.file})`);
  console.log(`  collections: ${item.collections.join(", ") || "(dynamic only)"}`);
  console.log(`  sensitive: ${item.sensitive.join(", ") || "(none)"}`);
  console.log(`  operations: ${opSummary || "(none)"}`);
  if (item.adminGateRisk) {
    console.log("  risk: admin/platform gate still reads users from the browser");
  }
}

if (adminGateRisks.length > 0) {
  console.error("");
  console.error("Failing: admin/platform gate files must use server bootstrap, not direct users reads.");
  process.exitCode = 1;
}
