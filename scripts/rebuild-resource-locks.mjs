import fs from "node:fs";
import path from "node:path";

import {
  deriveBookingResourceLocks,
  buildResourceLockDocId,
  checkResourceLockConflicts,
} from "../src/app/utils/resourceLocks.js";

const DEFAULT_SCOPE = "default";
const DEFAULT_COLLECTION = "resourceLocks";
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "tmp");
const OUTPUT_FILE = path.join(DEFAULT_OUTPUT_DIR, "resource-lock-rebuild-report.json");
const OUTPUT_CONFLICTS_CSV = path.join(DEFAULT_OUTPUT_DIR, "resource-lock-rebuild-conflicts.csv");
const OUTPUT_SUMMARY_CSV = path.join(DEFAULT_OUTPUT_DIR, "resource-lock-rebuild-summary.csv");
const FIRESTORE_BATCH_LIMIT = 400;

const DEFAULT_OPTIONS = {
  scope: DEFAULT_SCOPE,
  write: false,
  confirm: false,
  forceConflicts: false,
  writeCsv: false,
  status: "active",
};

function loadEnvFileIfNeeded() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return;
      const [, key, raw] = match;
      if (process.env[key]) return;
      let value = raw.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.replace(/\\n/g, "\n");
    });
  }
}

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  argv.forEach((arg) => {
    if (arg === "--write") options.write = true;
    if (arg === "--confirm") options.confirm = true;
    if (arg === "--force-conflicts") options.forceConflicts = true;
    if (arg === "--write-review-csv") options.writeCsv = true;
    if (arg.startsWith("--scope=")) {
      options.scope = String(arg.slice("--scope=".length) || "").trim() || DEFAULT_SCOPE;
    }
    if (arg.startsWith("--status=")) {
      const value = arg.slice("--status=".length).trim().toLowerCase();
      if (["active", "all"].includes(value)) {
        options.status = value;
      }
    }
  });

  if (options.write && !options.confirm) {
    options.error = "Write mode requires --write --confirm.";
  }
  if (options.confirm && !options.write) {
    options.error = "Cannot use --confirm without --write.";
  }

  return options;
}

function toSafeCsv(value = "") {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsvRow(row = {}, headers = []) {
  return headers.map((header) => toSafeCsv(row[header] ?? "")).join(",");
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  rows.forEach((row) => lines.push(toCsvRow(row, headers)));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function safeString(value) {
  return String(value ?? "").trim();
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.entries(value).reduce((acc, [key, nested]) => {
          acc[key] = toFirestoreValue(nested);
          return acc;
        }, {}),
      },
    };
  }
  return { stringValue: String(value) };
}

function collectFieldFlags(booking = {}) {
  const fieldsPresent = [];
  if (booking.hasOwnProperty("bookingDates")) fieldsPresent.push("bookingDates");
  if (booking.hasOwnProperty("date")) fieldsPresent.push("date");
  if (booking.hasOwnProperty("startDate")) fieldsPresent.push("startDate");
  if (booking.hasOwnProperty("endDate")) fieldsPresent.push("endDate");
  if (booking.hasOwnProperty("startDateISO")) fieldsPresent.push("startDateISO");
  if (booking.hasOwnProperty("endDateISO")) fieldsPresent.push("endDateISO");
  if (booking.hasOwnProperty("vehicles")) fieldsPresent.push("vehicles");
  if (booking.hasOwnProperty("vehicle")) fieldsPresent.push("vehicle");
  if (booking.hasOwnProperty("employees")) fieldsPresent.push("employees");
  if (booking.hasOwnProperty("employeesByDate")) fieldsPresent.push("employeesByDate");
  if (booking.hasOwnProperty("equipment")) fieldsPresent.push("equipment");
  return fieldsPresent.join(", ");
}

function bookingSummaryLine(booking = {}) {
  return {
    bookingId: safeString(booking.id),
    jobNumber: safeString(booking.quoteNumber || booking.jobNumber || booking.id),
    production: safeString(booking.production || booking.client || booking.productionCompany || booking.company || booking.name),
    status: safeString(booking.status),
    reason: booking.reason || "",
    fieldsPresent: booking.fieldsPresent || "",
  };
}

function buildConflictRows(conflicts = []) {
  return conflicts.map((conflict) => ({
    resourceType: conflict.resourceType,
    resourceId: conflict.resourceId,
    resourceLabel: conflict.resourceLabel,
    date: conflict.date,
    currentBookingId: conflict.currentBookingId,
    currentBookingReference: conflict.currentBookingReference || "",
    currentBookingLabel: conflict.currentBookingLabel || "",
    currentBookingStatus: conflict.currentBookingStatus || "",
    comparedBookingId: conflict.comparedBookingId,
    comparedBookingReference: conflict.comparedBookingReference || "",
    comparedBookingLabel: conflict.comparedBookingLabel || "",
    comparedBookingStatus: conflict.comparedBookingStatus || "",
    currentVehicleStatus: conflict.currentVehicleStatus || "",
    comparedVehicleStatus: conflict.comparedVehicleStatus || "",
    sourceOfIdentityMatch: conflict.sourceOfIdentityMatch || "",
    result: conflict.result || "",
  }));
}

function buildSummaryRows(summary) {
  return [
    {
      generatedAt: summary.generatedAt,
      scope: summary.scope,
      writeMode: summary.writeMode,
      writeRequested: summary.writeRequested,
      confirmed: summary.confirmed,
      forceConflicts: summary.forceConflicts,
      mode: summary.mode,
      bookingsScanned: summary.bookingsScanned,
      activeBookingsScanned: summary.activeBookingsScanned,
      inactiveBookingsSkipped: summary.inactiveBookingsSkipped,
      missingDateSkipped: summary.bookingsSkippedMissingDates,
      missingResourceSkipped: summary.bookingsSkippedMissingResources,
      locksDerived: summary.locksDerived,
      lockDocsToWrite: summary.lockDocsToWrite,
      vehicleLockCount: summary.vehicleLockCount,
      crewLockCount: summary.crewLockCount,
      equipmentLockCount: summary.equipmentLockCount,
      conflictCount: summary.conflictCount,
      vehicleConflicts: summary.vehicleConflicts,
      crewConflicts: summary.crewConflicts,
      equipmentConflicts: summary.equipmentConflicts,
      identityWarningCount: summary.identityWarningCount,
      skippedBookingsCount: summary.skippedBookingsCount,
      writtenDocs: summary.writtenDocs || 0,
      deletedDocs: summary.deletedDocs || 0,
      reportFile: OUTPUT_FILE,
    },
  ];
}

function toBatchWrites(collectionName, docsToDelete = [], docsToUpsert = []) {
  const docRef = (docId) =>
    `projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "bickers-booking"}/databases/(default)/documents/${collectionName}/${encodeURIComponent(docId)}`;

  const writes = [];
  docsToDelete.forEach((docId) => {
    writes.push({ delete: docRef(docId) });
  });
  docsToUpsert.forEach((doc) => {
    const payload = {
      name: docRef(doc.lockDocId),
      fields: Object.entries(doc).reduce((acc, [key, value]) => {
        if (key === "lockDocId") return acc;
        acc[key] = toFirestoreValue(value);
        return acc;
      }, {}),
    };
    writes.push({ update: payload });
  });

  return writes;
}

function chunkArray(values = [], size = FIRESTORE_BATCH_LIMIT) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

async function commitWrites(token, writes = [], label = "commit") {
  if (!writes.length) return;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "bickers-booking"}/databases/(default)/documents:commit`;
  const chunks = chunkArray(writes, FIRESTORE_BATCH_LIMIT);
  for (const chunk of chunks) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ writes: chunk }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Firestore ${label} failed: ${res.status} ${text}`);
    }
  }
}

function buildLockDocMap(locks = []) {
  const map = new Map();
  locks.forEach((lock) => {
    const lockDocId = lock.lockDocId || buildResourceLockDocId(lock);
    if (!map.has(lockDocId)) {
      map.set(lockDocId, {
        lockDocId,
        scope: lock.scope || DEFAULT_SCOPE,
        resourceType: lock.resourceType || "vehicle",
        resourceId: lock.resourceId || "unknown",
        resourceLabel: lock.resourceLabel || lock.resourceId || "unknown",
        date: lock.date || "",
        locks: [],
      });
    }
    map.get(lockDocId).locks.push({
      bookingId: lock.bookingId || "",
      status: lock.lockStatus || lock.status || "",
      statusSource: lock.statusSource || "booking.status",
      bookingStatus: lock.bookingStatus || "",
      bookingStatusLabel: lock.bookingStatusLabel || "",
      jobNumber: lock.jobNumber || "",
      production: lock.production || "",
      resourceId: lock.resourceId || "",
      resourceLabel: lock.resourceLabel || lock.resourceId || "",
      startDate: lock.startDate || "",
      endDate: lock.endDate || "",
      bookingDatesUsed: lock.bookingDatesUsed || [],
      bookingDate: lock.date || "",
      lockStatus: lock.lockStatus || "",
      identitySource: lock.identitySource || "",
      sourceFieldUsed: lock.sourceFieldUsed || "",
    });
  });

  return Array.from(map.values());
}

function appendLocksToDocMap(docMap, locks = []) {
  const grouped = buildLockDocMap(locks);
  grouped.forEach((doc) => {
    const existing = docMap.get(doc.lockDocId) || {
      lockDocId: doc.lockDocId,
      scope: doc.scope,
      resourceType: doc.resourceType,
      resourceId: doc.resourceId,
      resourceLabel: doc.resourceLabel,
      date: doc.date,
      locks: [],
    };
    existing.locks.push(...doc.locks);
    docMap.set(doc.lockDocId, existing);
  });
}

function buildSkipsReport(skipped = []) {
  return skipped.map((entry) => ({
    bookingId: safeString(entry.bookingId),
    jobNumber: safeString(entry.jobNumber),
    production: safeString(entry.production),
    status: safeString(entry.status),
    reasonSkipped: entry.reason,
    fieldsPresent: entry.fieldsPresent,
  }));
}

async function run() {
  loadEnvFileIfNeeded();
  const options = parseArgs(process.argv.slice(2));
  if (options.error) {
    throw new Error(options.error);
  }

  const { adminListDocuments, getFirebaseAdminAccessToken } = await import("../src/app/api/_firebaseAdminRest.js");
  const docs = await adminListDocuments("bookings");

  const bookingsScanned = docs.length;
  let activeBookingsScanned = 0;
  let inactiveBookingsSkipped = 0;
  const skippedBookings = [];
  const allLocks = [];
  const identityWarnings = [];
  const conflicts = [];
  const docMapForConflicts = new Map();

  docs.forEach(({ id, data }) => {
    const booking = { id, ...(data || {}) };
    const derived = deriveBookingResourceLocks(booking, {
      scope: options.scope,
      includeInactive: options.status === "all",
    });

    if (derived.skipped) {
      if (derived.skipped.reason === "inactive") inactiveBookingsSkipped += 1;
      const skipped = {
        bookingId: booking.id || "",
        reason: derived.skipped.reason || "unknown",
        status: booking.status || "",
        jobNumber: booking.quoteNumber || booking.jobNumber || booking.id || "",
        production: booking.production || booking.client || booking.productionCompany || booking.company || booking.name || "",
        fieldsPresent: collectFieldFlags(booking),
        booking: bookingSummaryLine(booking),
      };
      skippedBookings.push(skipped);
      return;
    }

    if (!derived.locks || !derived.locks.length) {
      skippedBookings.push({
        bookingId: booking.id || "",
        reason: "missing-resources",
        status: booking.status || "",
        jobNumber: booking.quoteNumber || booking.jobNumber || booking.id || "",
        production: booking.production || booking.client || booking.productionCompany || booking.company || booking.name || "",
        fieldsPresent: collectFieldFlags(booking),
      });
      return;
    }

    const isActiveBooking = String((booking.status || "").trim()) ? String((booking.status || "").toLowerCase()) : "";
    if (options.status === "active") {
      if (!isActiveBooking || !["cancelled", "canceled", "lost", "postponed", "deleted", "complete", "completed", "dnh", "dnx", "enquiry"].includes(isActiveBooking)) {
        activeBookingsScanned += 1;
      }
    } else {
      activeBookingsScanned += 1;
    }

    (derived.warnings || []).forEach((warning) => {
      identityWarnings.push({
        category: warning.category || "identity warning",
        resourceType: warning.resourceType || "",
        resourceId: warning.resourceId || warning.resourceKey || "",
        resourceLabel: warning.resourceLabel || "",
        bookingId: warning.bookingId || booking.id || "",
        status: warning.status || booking.status || "",
        sourceUsed: warning.sourceUsed || "",
        message: warning.message || warning.reason || "",
      });
    });

    const localConflict = checkResourceLockConflicts(derived.locks, Array.from(docMapForConflicts.values()), {
      debug: false,
    });
    if (localConflict?.conflicts?.length) {
      localConflict.conflicts.forEach((entry) => conflicts.push(entry));
    }

    appendLocksToDocMap(docMapForConflicts, derived.locks);
    derived.locks.forEach((lock) => {
      allLocks.push({ ...lock, _sourceBookingId: booking.id });
    });
  });

  const lockDocsToWrite = Array.from(docMapForConflicts.values()).map((doc) => ({
    ...doc,
    locks: doc.locks,
    scope: doc.scope,
    updatedAt: nowIso(),
    rebuiltAt: nowIso(),
    generatedBy: "rebuild-resource-locks",
  }));

  const vehicleConflicts = conflicts.filter((c) => c.resourceType === "vehicle");
  const crewConflicts = conflicts.filter((c) => c.resourceType === "crew");
  const equipmentConflicts = conflicts.filter((c) => c.resourceType === "equipment");
  const conflictRows = buildConflictRows(conflicts);

  const summary = {
    generatedAt: nowIso(),
    scope: options.scope,
    writeMode: false,
    writeRequested: options.write,
    confirmed: options.confirm,
    forceConflicts: options.forceConflicts,
    mode: options.status === "all" ? "all" : "active-only",
    bookingsScanned,
    activeBookingsScanned,
    inactiveBookingsSkipped,
    bookingsSkippedMissingDates: skippedBookings.filter((item) => item.reason === "missing-dates").length,
    bookingsSkippedMissingResources: skippedBookings.filter((item) => item.reason === "missing-resources").length,
    locksDerived: allLocks.length,
    lockDocsToWrite: lockDocsToWrite.length,
    vehicleLockCount: allLocks.filter((lock) => lock.resourceType === "vehicle").length,
    crewLockCount: allLocks.filter((lock) => lock.resourceType === "crew").length,
    equipmentLockCount: allLocks.filter((lock) => lock.resourceType === "equipment").length,
    conflictCount: conflicts.length,
    vehicleConflicts: vehicleConflicts.length,
    crewConflicts: crewConflicts.length,
    equipmentConflicts: equipmentConflicts.length,
    identityWarningCount: identityWarnings.length,
    skippedBookingsCount: skippedBookings.length,
    identityWarnings,
    skippedBookings: buildSkipsReport(skippedBookings),
    conflicts: conflictRows,
  };

  fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("resource-lock rebuild (dry run)");
  console.log("==============================");
  console.log(`Scope: ${options.scope}`);
  console.log(`Write mode: ${options.write ? "enabled" : "dry-run"}`);
  console.log(`Bookings scanned: ${bookingsScanned}`);
  console.log(`Active bookings scanned: ${activeBookingsScanned}`);
  console.log(`Inactive skipped: ${inactiveBookingsSkipped}`);
  console.log(`Skipped (missing dates): ${summary.bookingsSkippedMissingDates}`);
  console.log(`Skipped (missing resources): ${summary.bookingsSkippedMissingResources}`);
  console.log(`Lock docs that would be written: ${lockDocsToWrite.length}`);
  console.log(`Vehicle locks: ${summary.vehicleLockCount}`);
  console.log(`Crew locks: ${summary.crewLockCount}`);
  console.log(`Equipment locks: ${summary.equipmentLockCount}`);
  console.log(`Conflict count: ${conflicts.length}`);
  console.log(`Identity warnings: ${identityWarnings.length}`);
  console.log(`Report written: ${OUTPUT_FILE}`);

  if (options.writeCsv) {
    writeCsv(OUTPUT_CONFLICTS_CSV, [
      "resourceType",
      "resourceId",
      "resourceLabel",
      "date",
      "currentBookingId",
      "currentBookingReference",
      "currentBookingLabel",
      "currentBookingStatus",
      "comparedBookingId",
      "comparedBookingReference",
      "comparedBookingLabel",
      "comparedBookingStatus",
      "currentVehicleStatus",
      "comparedVehicleStatus",
      "sourceOfIdentityMatch",
      "result",
    ], conflictRows);
    writeCsv(OUTPUT_SUMMARY_CSV, [
      "generatedAt",
      "scope",
      "writeMode",
      "writeRequested",
      "confirmed",
      "forceConflicts",
      "mode",
      "bookingsScanned",
      "activeBookingsScanned",
      "inactiveBookingsSkipped",
      "bookingsSkippedMissingDates",
      "bookingsSkippedMissingResources",
      "locksDerived",
      "lockDocsToWrite",
      "vehicleLockCount",
      "crewLockCount",
      "equipmentLockCount",
      "conflictCount",
      "vehicleConflicts",
      "crewConflicts",
      "equipmentConflicts",
      "identityWarningCount",
      "skippedBookingsCount",
      "writtenDocs",
      "deletedDocs",
      "reportFile",
    ], buildSummaryRows(summary));
    console.log(`CSV outputs: ${OUTPUT_CONFLICTS_CSV}`);
    console.log(`CSV outputs: ${OUTPUT_SUMMARY_CSV}`);
  }

  if (conflicts.length > 0) {
    console.log(`Blocking conflicts detected: ${conflicts.length}`);
    if (!options.write || !options.confirm) {
      console.log("Dry-run complete. Resolve conflicts before write mode.");
    }
    if (options.write && !options.forceConflicts) {
      process.exitCode = 2;
      return;
    }
  }

  if (!options.write) {
    console.log("No writes performed (read-only mode).");
    return;
  }

  if (options.forceConflicts) {
    console.log("WARNING: --force-conflicts is enabled. Write will proceed despite blocking conflicts.");
  }

  const token = await getFirebaseAdminAccessToken();
  const existingDocs = await adminListDocuments(DEFAULT_COLLECTION);
  const existingScopeDocs = existingDocs.filter((item) => {
    const scopeFromId = safeString(item.id).startsWith(`${options.scope}_`);
    const scopeFromData = safeString(item.data?.scope) === options.scope;
    return scopeFromId || scopeFromData;
  });

  const keepDocIds = new Set(lockDocsToWrite.map((doc) => doc.lockDocId));
  const staleDocs = existingScopeDocs.filter((doc) => !keepDocIds.has(doc.id)).map((doc) => doc.id);

  const docsToWrite = lockDocsToWrite.map((doc) => ({
    ...doc,
    updatedAt: nowIso(),
    rebuiltAt: nowIso(),
    generatedBy: "rebuild-resource-locks",
  }));

  const deleteWrites = toBatchWrites(DEFAULT_COLLECTION, staleDocs, []);
  const upsertWrites = toBatchWrites(DEFAULT_COLLECTION, [], docsToWrite);
  await commitWrites(token, deleteWrites, "delete");
  await commitWrites(token, upsertWrites, "upsert");

  const finalSummary = {
    ...summary,
    writeMode: true,
    writtenDocs: docsToWrite.length,
    deletedDocs: staleDocs.length,
    existingDocsForScope: existingScopeDocs.length,
    reportAtWriteCompletion: nowIso(),
  };
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(finalSummary, null, 2)}\n`, "utf8");
  if (options.writeCsv) {
    writeCsv(OUTPUT_SUMMARY_CSV, [
      "generatedAt",
      "scope",
      "writeMode",
      "writeRequested",
      "confirmed",
      "forceConflicts",
      "mode",
      "bookingsScanned",
      "activeBookingsScanned",
      "inactiveBookingsSkipped",
      "bookingsSkippedMissingDates",
      "bookingsSkippedMissingResources",
      "locksDerived",
      "lockDocsToWrite",
      "vehicleLockCount",
      "crewLockCount",
      "equipmentLockCount",
      "conflictCount",
      "vehicleConflicts",
      "crewConflicts",
      "equipmentConflicts",
      "identityWarningCount",
      "skippedBookingsCount",
      "writtenDocs",
      "deletedDocs",
      "existingDocsForScope",
      "reportFile",
    ], [finalSummary]);
  }

  console.log(`Write complete. Deleted ${staleDocs.length}; wrote ${docsToWrite.length} lock docs.`);
  console.log(`Report updated: ${OUTPUT_FILE}`);
}

run().catch((error) => {
  console.error("resource-lock rebuild failed:", error);
  process.exitCode = 1;
});
