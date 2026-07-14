import fs from "node:fs";
import path from "node:path";

const OUTPUT_FILE = path.join(process.cwd(), "tmp", "resource-lock-audit-report.json");
const OUTPUT_CONFLICTS_CSV = path.join(process.cwd(), "tmp", "resource-lock-conflicts.csv");
const OUTPUT_WARNINGS_CSV = path.join(process.cwd(), "tmp", "resource-lock-identity-warnings.csv");
const OUTPUT_SKIPPED_CSV = path.join(process.cwd(), "tmp", "resource-lock-skipped-bookings.csv");
const DEFAULT_SCOPE = "default";

const INACTIVE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "lost",
  "postponed",
  "deleted",
  "complete",
  "completed",
  "dnh",
  "dnx",
  "enquiry",
]);

const VEHICLE_CONFLICTS_BY_REQUESTED = {
  confirmed: new Set(["confirmed", "first-pencil", "second-pencil", "maintenance"]),
  maintenance: new Set(["confirmed", "first-pencil", "second-pencil", "maintenance"]),
  "first-pencil": new Set(["confirmed", "first-pencil", "maintenance"]),
  "second-pencil": new Set(["confirmed", "maintenance"]),
};

const DEFAULT_OPTIONS = {
  json: false,
  status: "active",
  resource: "",
  limit: 0,
  includeInactive: false,
  conflictsOnly: false,
  warningsOnly: false,
  writeCsv: false,
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

      const [, key, rawValue] = match;
      if (process.env[key]) return;
      let value = rawValue.trim();
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
    if (arg === "--json") options.json = true;
    if (arg === "--conflicts-only") options.conflictsOnly = true;
    if (arg === "--warnings-only") options.warningsOnly = true;
    if (arg === "--include-inactive") options.includeInactive = true;
    if (arg === "--write-review-csv") options.writeCsv = true;

    if (arg.startsWith("--resource=")) {
      const resource = arg.slice("--resource=".length).trim().toLowerCase();
      if (["vehicle", "crew", "equipment"].includes(resource)) options.resource = resource;
    }

    if (arg.startsWith("--status=")) {
      const status = arg.slice("--status=".length).trim().toLowerCase();
      if (["active", "all"].includes(status)) options.status = status;
    }

    if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length)) || 0;
  });

  if (options.includeInactive) options.status = "all";
  return options;
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function slugKey(value) {
  return compactText(value) || "unknown";
}

function toYmd(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const direct = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  if (typeof value?.seconds === "number") {
    const date = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function parseYmd(value) {
  const [year, month, day] = clean(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function enumerateYmdRange(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd || startYmd);
  if (!start || !end || start > end) return [];
  const out = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function uniqueSorted(values = []) {
  return Array.from(new Set(values.map((value) => clean(value).slice(0, 10)).filter(Boolean))).sort();
}

function expandBookingDates(booking = {}) {
  if (Array.isArray(booking.bookingDates) && booking.bookingDates.length) {
    return uniqueSorted(booking.bookingDates.map(toYmd));
  }

  const date = toYmd(booking.date);
  const start = toYmd(booking.startDate || booking.startDateISO);
  const end = toYmd(booking.endDate || booking.endDateISO);
  if (date) return [date];
  if (start && end) return enumerateYmdRange(start, end);
  if (start) return [start];
  return [];
}

function normalizeVehicleStatus(status) {
  const value = normalizeText(status);
  if (!value) return "";
  if (value === "confirmed") return "confirmed";
  if (value === "maintenance") return "maintenance";
  if (value === "first pencil" || value === "first-pencil" || value === "1st pencil") return "first-pencil";
  if (value === "second pencil" || value === "second-pencil" || value === "2nd pencil") return "second-pencil";
  return value;
}

function displayStatus(status) {
  const value = normalizeVehicleStatus(status);
  if (value === "confirmed") return "Confirmed";
  if (value === "maintenance") return "Maintenance";
  if (value === "first-pencil") return "First Pencil";
  if (value === "second-pencil") return "Second Pencil";
  return clean(status) || "Unknown";
}

function isActiveBooking(booking = {}) {
  if (booking.deleted === true || booking.isDeleted === true) return false;
  const status = normalizeText(booking.status);
  if (!status) return true;
  return !INACTIVE_STATUSES.has(status);
}

function bookingLabel(booking = {}) {
  return (
    clean(booking.production) ||
    clean(booking.client) ||
    clean(booking.productionCompany) ||
    clean(booking.company) ||
    clean(booking.name) ||
    "Unknown booking"
  );
}

function bookingReference(booking = {}) {
  return clean(booking.quoteNumber) || clean(booking.jobNumber) || clean(booking.id) || "Booking";
}

function addIdentityKey(keys, type, value, source, matched = false) {
  const compact = compactText(value);
  if (!compact) return;
  keys.push({ type, key: `${type}:${compact}`, raw: clean(value), source, matched: !!matched });
}

function pickIdentity(keys, fallbackLabel) {
  if (keys.length) {
    const stablePriority = ["vehicleId", "employeeId", "assetId", "registration", "email", "employeeCode", "assetCode", "employeeName", "name"];
    for (const type of stablePriority) {
      const candidate = keys.find((entry) => entry.type === type);
      if (candidate) return candidate;
    }
    return keys[0];
  }
  return { type: "name", key: `name:${slugKey(fallbackLabel)}`, raw: clean(fallbackLabel) };
}

function identitySourceTag(identity) {
  if (identity.type === "vehicleId" || identity.type === "employeeId" || identity.type === "assetId") return "id";
  if (identity.type === "registration") return "registration";
  return "name-fallback";
}

function identityWarningsBySource({
  booking,
  resourceType,
  resourceCategory,
  identity,
  keys,
  label,
  missingRegistrationHint = false,
}) {
  const warnings = [];
  const typeKey = identity.type;
  const hasStableId =
    keys.some((entry) => ["vehicleId", "employeeId", "assetId", "employeeCode", "registration", "email"].includes(entry.type));

  if (!hasStableId) {
    warnings.push({
      category: `${resourceCategory} missing stable id`,
      resourceType,
      resourceId: identity.key,
      resourceLabel: label,
      bookingId: booking.id,
      jobNumber: bookingReference(booking),
      production: bookingLabel(booking),
      status: booking.status || "",
      sourceUsed: identitySourceTag(identity),
      message: `${resourceType} ${label || identity.key} lacks a stable id/code identity.`,
    });
  }

  if (!["name"].includes(typeKey) && typeKey !== "name-fallback") {
    // no-op, ensures identity source is represented in output
  }

  if (typeKey === "name" || typeKey === "name-fallback") {
    warnings.push({
      category: `${resourceCategory} using name fallback`,
      resourceType,
      resourceId: identity.key,
      resourceLabel: label,
      bookingId: booking.id,
      jobNumber: bookingReference(booking),
      production: bookingLabel(booking),
      status: booking.status || "",
      sourceUsed: identitySourceTag(identity),
      message: `${resourceType} ${label || identity.key} is matched by fallback identity.`,
    });
  }

  if (missingRegistrationHint) {
    warnings.push({
      category: `${resourceCategory} missing registration/serial`,
      resourceType,
      resourceId: identity.key,
      resourceLabel: label,
      bookingId: booking.id,
      jobNumber: bookingReference(booking),
      production: bookingLabel(booking),
      status: booking.status || "",
      sourceUsed: identitySourceTag(identity),
      message: `${resourceType} ${label || identity.key} has no registration/serial to match reliably.`,
    });
  }

  return warnings;
}

function vehicleIdentity(vehicle) {
  const source = vehicle && typeof vehicle === "object" ? vehicle : { name: vehicle };
  const label =
    clean(source.name) ||
    clean(source.vehicleName) ||
    clean(source.label) ||
    clean(source.registration) ||
    clean(source.reg) ||
    clean(vehicle);
  const keys = [];
  addIdentityKey(keys, "vehicleId", source.id || source.vehicleId || source.key, "vehicle");
  addIdentityKey(keys, "registration", source.registration || source.reg || source.numberPlate || source.plate, "vehicle");
  addIdentityKey(keys, "name", source.name || source.vehicleName || source.label || vehicle, "vehicle");
  return { identity: pickIdentity(keys, label), keys, label };
}

function crewIdentity(crew) {
  const source = crew && typeof crew === "object" ? crew : { name: crew };
  const label =
    clean(source.name) ||
    clean(source.employeeName) ||
    clean(source.displayName) ||
    clean(source.email) ||
    clean(source.emailAddress) ||
    clean(source.employeeCode) ||
    clean(source.code) ||
    clean(crew);
  const keys = [];
  addIdentityKey(keys, "employeeId", source.id || source.employeeId || source.uid || source.userId, "crew");
  addIdentityKey(keys, "email", source.email || source.emailAddress, "crew");
  addIdentityKey(keys, "employeeCode", source.code || source.employeeCode || source.userCode, "crew");
  addIdentityKey(keys, "name", source.name || source.employeeName || source.displayName || crew, "crew");
  return { identity: pickIdentity(keys, label), keys, label };
}

function assetIdentity(asset) {
  const source = asset && typeof asset === "object" ? asset : { name: asset };
  const label =
    clean(source.name) ||
    clean(source.label) ||
    clean(source.assetName) ||
    clean(source.equipmentName) ||
    clean(source.registration) ||
    clean(source.reg) ||
    clean(source.serialNumber) ||
    clean(source.serial) ||
    clean(source.numberPlate) ||
    clean(asset);
  const keys = [];
  addIdentityKey(keys, "assetId", source.id || source.equipmentId || source.assetId || source.trailerId || source.vehicleId, "equipment");
  addIdentityKey(keys, "registration", source.registration || source.reg || source.serialNumber || source.serial || source.numberPlate, "equipment");
  addIdentityKey(keys, "name", source.name || source.label || source.assetName || source.equipmentName || asset, "equipment");
  return { identity: pickIdentity(keys, label), keys, label };
}

function buildVehicleStatusIndex(vehicleStatus = {}) {
  const index = new Map();
  if (!vehicleStatus || typeof vehicleStatus !== "object") return index;
  Object.entries(vehicleStatus).forEach(([rawKey, rawValue]) => {
    const status = normalizeVehicleStatus(rawValue);
    if (!status) return;
    const normalizedKey = clean(rawKey);
    const normalizedLower = normalizedKey.toLowerCase();
    const normalizedCompact = compactText(rawKey);
    [normalizedKey, normalizedLower, normalizedCompact].forEach((candidate) => {
      if (!candidate || index.has(candidate)) return;
      index.set(candidate, status);
    });
  });
  return index;
}

function resolveVehicleLockStatus(booking, sourceVehicle, identity) {
  const index = buildVehicleStatusIndex(booking.vehicleStatus || {});
  const candidateSet = new Set([identity.raw, identity.key.split(":").pop()]);
  if (sourceVehicle && typeof sourceVehicle === "object") {
    [
      sourceVehicle.id,
      sourceVehicle.vehicleId,
      sourceVehicle.key,
      sourceVehicle.registration,
      sourceVehicle.reg,
      sourceVehicle.numberPlate,
      sourceVehicle.name,
      sourceVehicle.vehicleName,
      sourceVehicle.label,
    ].forEach((value) => {
      const raw = clean(value);
      if (!raw) return;
      candidateSet.add(raw);
      candidateSet.add(raw.toLowerCase());
      candidateSet.add(compactText(raw));
    });
  }

  for (const candidate of candidateSet) {
    if (index.has(candidate)) {
      return { lockStatus: index.get(candidate), statusSource: `vehicleStatus.${candidate}` };
    }
  }

  return {
    lockStatus: normalizeVehicleStatus(booking.status),
    statusSource: "booking.status",
  };
}

function lockDocId({ scope, resourceType, resourceId, date }) {
  return [scope, resourceType, slugKey(resourceId), date].join("_");
}

function makeLockEntry({
  booking,
  resourceType,
  resourceId,
  resourceLabel,
  date,
  lockStatus,
  statusSource,
  identitySource,
}) {
  const scope = clean(booking.companyId) || DEFAULT_SCOPE;
  return {
    lockDocId: lockDocId({ scope, resourceType, resourceId, date }),
    scope,
    resourceType,
    resourceId,
    resourceLabel,
    date,
    identitySource,
    datesUsed: booking._expandedDates,
    lock: {
      bookingId: booking.id,
      jobNumber: bookingReference(booking),
      production: bookingLabel(booking),
      bookingStatus: displayStatus(booking.status),
      bookingStatusRaw: clean(booking.status),
      lockStatus,
      lockStatusLabel: displayStatus(lockStatus),
      statusSource,
      resourceLabel,
      startDate: toYmd(booking.startDate || booking.startDateISO),
      endDate: toYmd(booking.endDate || booking.endDateISO),
    },
  };
}

function deriveVehicleLocks(booking) {
  const dates = booking._expandedDates;
  const vehicles = Array.isArray(booking.vehicles)
    ? booking.vehicles
    : [booking.vehicle, booking.vehicleId, booking.vehicleName, booking.registration, booking.reg].filter(Boolean);
  const locks = [];
  const warnings = [];

  vehicles.forEach((vehicle) => {
    const resolved = vehicleIdentity(vehicle);
    const { lockStatus, statusSource } = resolveVehicleLockStatus(booking, vehicle, resolved.identity);
    if (!lockStatus) return;

    warnings.push(
      ...identityWarningsBySource({
        booking,
        resourceType: "vehicle",
        resourceCategory: "vehicle",
        identity: resolved.identity,
        keys: resolved.keys,
        label: resolved.label,
        missingRegistrationHint: !resolved.keys.some((entry) => entry.type === "registration"),
      })
    );

    dates.forEach((date) => {
      locks.push(
        makeLockEntry({
          booking,
          resourceType: "vehicle",
          resourceId: resolved.identity.key,
          resourceLabel: resolved.label || resolved.identity.raw || resolved.identity.key,
          date,
          lockStatus,
          statusSource,
          identitySource: resolved.identity.type,
        })
      );
    });
  });

  return { locks, warnings };
}

function deriveCrewLocks(booking) {
  const dates = booking._expandedDates;
  const employees = Array.isArray(booking.employees) ? booking.employees : [];
  const byDate = booking.employeesByDate && typeof booking.employeesByDate === "object" ? booking.employeesByDate : {};
  const locks = [];
  const warnings = [];

  dates.forEach((date) => {
    const dayEmployees = Array.isArray(byDate[date]) && byDate[date].length ? byDate[date] : employees;
    dayEmployees.forEach((crew) => {
      const resolved = crewIdentity(crew);
      warnings.push(
        ...identityWarningsBySource({
          booking,
          resourceType: "crew",
          resourceCategory: "crew",
          identity: resolved.identity,
          keys: resolved.keys,
          label: resolved.label,
        })
      );

      locks.push(
        makeLockEntry({
          booking,
          resourceType: "crew",
          resourceId: resolved.identity.key,
          resourceLabel: resolved.label || resolved.identity.raw || resolved.identity.key,
          date,
          lockStatus: "booked",
          statusSource: "booking.employees/employeesByDate",
          identitySource: resolved.identity.type,
        })
      );
    });
  });

  return { locks, warnings };
}

function deriveEquipmentLocks(booking) {
  const dates = booking._expandedDates;
  const equipment = Array.isArray(booking.equipment) ? booking.equipment : [];
  const locks = [];
  const warnings = [];

  equipment.forEach((asset) => {
    const resolved = assetIdentity(asset);
    warnings.push(
      ...identityWarningsBySource({
        booking,
        resourceType: "equipment",
        resourceCategory: "equipment",
        identity: resolved.identity,
        keys: resolved.keys,
        label: resolved.label,
        missingRegistrationHint: !resolved.keys.some((entry) => entry.type === "registration"),
      })
    );
    dates.forEach((date) => {
      locks.push(
        makeLockEntry({
          booking,
          resourceType: "equipment",
          resourceId: resolved.identity.key,
          resourceLabel: resolved.label || resolved.identity.raw || resolved.identity.key,
          date,
          lockStatus: "booked",
          statusSource: "booking.equipment",
          identitySource: resolved.identity.type,
        })
      );
    });
  });

  return { locks, warnings };
}

function vehicleStatusesConflict(left, right) {
  const leftStatus = normalizeVehicleStatus(left);
  const rightStatus = normalizeVehicleStatus(right);
  if (!leftStatus || !rightStatus) return false;
  return (
    VEHICLE_CONFLICTS_BY_REQUESTED[leftStatus]?.has(rightStatus) ||
    VEHICLE_CONFLICTS_BY_REQUESTED[rightStatus]?.has(leftStatus) ||
    false
  );
}

function lockEntriesConflict(left, right) {
  if (left.lock.bookingId === right.lock.bookingId) return false;
  if (left.resourceType !== right.resourceType) return false;
  if (left.resourceId !== right.resourceId) return false;
  if (left.date !== right.date) return false;
  if (left.resourceType === "vehicle") {
    return vehicleStatusesConflict(left.lock.lockStatus, right.lock.lockStatus);
  }
  return true;
}

function getConflictType(left, right) {
  if (left.resourceType === "vehicle") return "vehicle status conflict";
  if (left.resourceType === "crew") return "crew conflict";
  return "equipment conflict";
}

function rangeFromDates(dates = []) {
  const sorted = uniqueSorted(dates);
  if (!sorted.length) return "";
  const ranges = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = parseYmd(rangeEnd);
    const next = parseYmd(sorted[i]);
    if (!prev || !next) {
      ranges.push(rangeStart === rangeEnd ? rangeStart : `${rangeStart} to ${rangeEnd}`);
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
      continue;
    }
    if ((next.getTime() - prev.getTime()) / 86400000 === 1) {
      rangeEnd = sorted[i];
      continue;
    }
    ranges.push(rangeStart === rangeEnd ? rangeStart : `${rangeStart} to ${rangeEnd}`);
    rangeStart = sorted[i];
    rangeEnd = sorted[i];
  }
  ranges.push(rangeStart === rangeEnd ? rangeStart : `${rangeStart} to ${rangeEnd}`);
  return ranges.join(", ");
}

function lockEntrySummary(entry) {
  return {
    bookingId: entry.lock.bookingId,
    jobNumber: entry.lock.jobNumber,
    production: entry.lock.production,
    status: entry.lock.bookingStatus,
    vehicleStatus: entry.lock.lockStatus,
    startDate: entry.lock.startDate,
    endDate: entry.lock.endDate,
    bookingDatesUsed: entry.datesUsed,
    resourceId: entry.resourceId,
    resourceLabel: entry.resourceLabel,
    sourceOfIdentityMatch: identitySourceTag(entry),
  };
}

function suggestFix(conflict, includeWarnings) {
  const left = conflict.left;
  const right = conflict.right;

  const leftWeak = includeWarnings.some((entry) => entry.bookingId === left.bookingId && /name fallback|missing/.test(entry.category));
  const rightWeak = includeWarnings.some((entry) => entry.bookingId === right.bookingId && /name fallback|missing/.test(entry.category));

  if (left.lock.bookingStatus === "Confirmed" || right.lock.bookingStatus === "Confirmed") {
    if (leftWeak || rightWeak) {
      return "add missing vehicle id/registration if identity is weak and correct identity fields to reduce wrong matches";
    }
  }

  if (left.lock.lockStatus === "first-pencil" && right.lock.lockStatus === "first-pencil") {
    return "change one booking to Second Pencil where possible, or move one booking to non-overlapping dates";
  }

  if (left.bookingStatus !== "Confirmed" && right.bookingStatus !== "Confirmed") {
    return "cancel/delete inactive booking if old, then re-run audit, otherwise move dates";
  }

  if (leftWeak || rightWeak) {
    return "add missing vehicle id/registration if identity is weak";
  }

  return "manually accept conflict only if operationally intentional";
}

function suggestFixGeneric(type) {
  if (type === "vehicle status conflict") return "change one First Pencil hold to Second Pencil, or move dates";
  if (type === "crew conflict") return "remove/replace crew member on one booking or move dates";
  return "remove/replace asset on one booking or move dates";
}

function detectConflicts(locks, identityWarnings) {
  const byDoc = new Map();
  const rawConflicts = [];

  locks.forEach((lock) => {
    const existing = byDoc.get(lock.lockDocId) || [];
    existing.forEach((other) => {
      if (!lockEntriesConflict(lock, other)) return;
      rawConflicts.push({
        resourceType: lock.resourceType,
        resourceId: lock.resourceId,
        resourceLabel: lock.resourceLabel || other.resourceLabel,
        conflictType: getConflictType(lock, other),
        date: lock.date,
        left: lockEntrySummary(lock),
        right: lockEntrySummary(other),
        leftRaw: lock,
        rightRaw: other,
      });
    });
    existing.push(lock);
    byDoc.set(lock.lockDocId, existing);
  });

  const grouped = new Map();

  rawConflicts.forEach((conflict) => {
    const leftKey = `${conflict.left.bookingId}|${conflict.left.jobNumber}|${conflict.left.status}`;
    const rightKey = `${conflict.right.bookingId}|${conflict.right.jobNumber}|${conflict.right.status}`;
    const ordered = [leftKey, rightKey].sort();
    const key = [
      conflict.resourceType,
      conflict.resourceId,
      conflict.resourceLabel,
      ordered[0],
      ordered[1],
      conflict.conflictType,
      conflict.left.sourceOfIdentityMatch,
      conflict.right.sourceOfIdentityMatch,
    ].join("|");
    const bucket = grouped.get(key) || {
      resourceType: conflict.resourceType,
      resourceId: conflict.resourceId,
      resourceLabel: conflict.resourceLabel,
      conflictType: conflict.conflictType,
      bookingA: conflict.left,
      bookingB: conflict.right,
      dates: [],
      dateList: [],
      leftRaw: conflict.leftRaw,
      rightRaw: conflict.rightRaw,
      sourceOfIdentityMatchA: conflict.left.sourceOfIdentityMatch,
      sourceOfIdentityMatchB: conflict.right.sourceOfIdentityMatch,
    };
    bucket.dates.push(conflict.date);
    bucket.dateList = bucket.dates;
    grouped.set(key, bucket);
  });

  return Array.from(grouped.values()).map((bucket) => {
    const dates = uniqueSorted(bucket.dates);
    return {
      resourceType: bucket.resourceType,
      resourceId: bucket.resourceId,
      resourceLabel: bucket.resourceLabel,
      conflictType: bucket.conflictType,
      bookingA: bucket.bookingA,
      bookingB: bucket.bookingB,
      leftRaw: bucket.leftRaw,
      rightRaw: bucket.rightRaw,
      dateRange: rangeFromDates(dates),
      dateCount: dates.length,
      dates,
      sourceOfIdentityMatchA: bucket.sourceOfIdentityMatchA,
      sourceOfIdentityMatchB: bucket.sourceOfIdentityMatchB,
      suggestedFix: "",
      identityWarnings: identityWarnings,
    };
  });
}

function decorateConflicts(conflicts) {
  return conflicts.map((conflict) => ({
    ...conflict,
    suggestedFix: suggestFix(
      { left: { ...conflict.bookingA, ...{ bookingStatus: conflict.bookingA.status } }, right: { ...conflict.bookingB, ...{ bookingStatus: conflict.bookingB.status } } },
      conflict.identityWarnings
    ),
  }));
}

function detectDuplicateLabelWarnings(locks) {
  const byTypeLabel = new Map();
  const warnings = [];

  locks.forEach((lock) => {
    const key = `${lock.resourceType}:${compactText(lock.resourceLabel)}`;
    if (!compactText(lock.resourceLabel)) return;
    const existing = byTypeLabel.get(key) || {
      type: lock.resourceType,
      label: lock.resourceLabel,
      ids: new Set(),
      bookings: new Set(),
    };
    existing.ids.add(lock.resourceId);
    existing.bookings.add(lock.lock.bookingId);
    byTypeLabel.set(key, existing);
  });

  byTypeLabel.forEach((entry) => {
    if (entry.ids.size <= 1) return;
    warnings.push({
      category: "possible duplicate labels",
      resourceType: entry.type,
      resourceId: Array.from(entry.ids).join(", "),
      resourceLabel: entry.label,
      bookingId: "",
      jobNumber: "",
      production: "",
      status: "",
      sourceUsed: "label-collision",
      message: `${entry.type} label ${entry.label} is used by ${entry.ids.size} resources.`,
    });
  });

  return warnings;
}

function summarizeSkipped(skippedBookings) {
  return skippedBookings.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
}

function csvEscape(value = "") {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    const line = headers.map((header) => csvEscape(row[header] ?? "")).join(",");
    lines.push(line);
  });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function buildConflictRows(conflicts = []) {
  return conflicts.map((conflict) => ({
    conflictType: conflict.conflictType,
    resourceType: conflict.resourceType,
    resourceLabel: conflict.resourceLabel,
    resourceId: conflict.resourceId,
    dateRange: conflict.dateRange,
    dateCount: conflict.dateCount,
    bookingA_id: conflict.bookingA.bookingId,
    bookingA_jobNumber: conflict.bookingA.jobNumber,
    bookingA_production: conflict.bookingA.production,
    bookingA_status: conflict.bookingA.status,
    bookingA_vehicleStatus: conflict.bookingA.vehicleStatus,
    bookingA_startDate: conflict.bookingA.startDate,
    bookingA_endDate: conflict.bookingA.endDate,
    bookingA_bookingDates: conflict.bookingA.bookingDatesUsed.join(" | "),
    bookingA_resourceId: conflict.bookingA.resourceId,
    bookingA_resourceLabel: conflict.bookingA.resourceLabel,
    bookingA_identityMatch: conflict.bookingA.sourceOfIdentityMatch,
    bookingB_id: conflict.bookingB.bookingId,
    bookingB_jobNumber: conflict.bookingB.jobNumber,
    bookingB_production: conflict.bookingB.production,
    bookingB_status: conflict.bookingB.status,
    bookingB_vehicleStatus: conflict.bookingB.vehicleStatus,
    bookingB_startDate: conflict.bookingB.startDate,
    bookingB_endDate: conflict.bookingB.endDate,
    bookingB_bookingDates: conflict.bookingB.bookingDatesUsed.join(" | "),
    bookingB_resourceId: conflict.bookingB.resourceId,
    bookingB_resourceLabel: conflict.bookingB.resourceLabel,
    bookingB_identityMatch: conflict.bookingB.sourceOfIdentityMatch,
    suggestedFix: conflict.suggestedFix || suggestFixGeneric(conflict.conflictType),
  }));
}

function buildWarningRows(warnings = []) {
  return warnings.map((warning) => ({
    category: warning.category,
    resourceType: warning.resourceType,
    resourceId: warning.resourceId,
    resourceLabel: warning.resourceLabel,
    bookingId: warning.bookingId,
    jobNumber: warning.jobNumber,
    production: warning.production,
    status: warning.status || "",
    sourceUsed: warning.sourceUsed || "",
    message: warning.message,
  }));
}

function buildSkippedRows(skippedBookings = []) {
  return skippedBookings.map((entry) => ({
    bookingId: entry.bookingId,
    jobNumber: entry.jobNumber || "",
    production: entry.production || "",
    status: entry.status || "",
    reasonSkipped: entry.reason,
    fieldsPresent: entry.fieldsPresent,
  }));
}

function printTextReport(report, options) {
  const { summary, conflicts = [], identityWarnings = [], skippedBookings = [] } = report;

  if (!options.warningsOnly) {
    console.log("Resource lock audit dry run");
    console.log("===========================");
    console.log(`Bookings scanned: ${summary.totalBookingsScanned}`);
    console.log(`Active bookings scanned: ${summary.activeBookingsScanned}`);
    console.log(`Inactive bookings skipped: ${summary.inactiveBookingsSkipped}`);
    console.log(`Bookings skipped due to missing dates: ${summary.bookingsSkippedMissingDates}`);
    console.log(`Bookings skipped due to missing resources: ${summary.bookingsSkippedMissingResources}`);
    console.log(`Lock docs that would be created: ${summary.totalLockDocsWouldCreate}`);
    console.log(`Vehicle locks: ${summary.vehicleLocks}`);
    console.log(`Crew locks: ${summary.crewLocks}`);
    console.log(`Equipment locks: ${summary.equipmentLocks}`);
    console.log("");
    console.log("Conflicts");
    console.log("---------");
    console.log(`Vehicle: ${summary.vehicleConflicts}`);
    console.log(`Crew: ${summary.crewConflicts}`);
    console.log(`Equipment: ${summary.equipmentConflicts}`);

    if (conflicts.length) {
      console.log("");
      console.log("Grouped conflicts");
      console.log("---------------");
      conflicts.forEach((conflict, index) => {
        console.log(
          `${index + 1}. ${conflict.conflictType} | ${conflict.resourceType} ${conflict.resourceLabel}`
        );
        console.log(`   Dates: ${conflict.dateRange}`);
        console.log(
          `   Booking A: ${conflict.bookingA.production}, job ${conflict.bookingA.jobNumber}, ${conflict.bookingA.status} (${conflict.bookingA.vehicleStatus || "-"})`
        );
        console.log(
          `   Booking B: ${conflict.bookingB.production}, job ${conflict.bookingB.jobNumber}, ${conflict.bookingB.status} (${conflict.bookingB.vehicleStatus || "-"})`
        );
        console.log(`   Suggested fix: ${conflict.suggestedFix || suggestFixGeneric(conflict.conflictType)}`);
      });
    }
  }

  if (!options.conflictsOnly) {
    if (!options.warningsOnly && conflicts.length) console.log("");
    console.log("Identity warnings");
    console.log("----------------");
    console.log(`Total: ${summary.identityWarnings}`);
    Object.entries(summary.warningBreakdown).forEach(([category, count]) => {
      console.log(`${category}: ${count}`);
    });
  }

  if (!options.warningsOnly) {
    console.log("");
    console.log("Skipped bookings");
    console.log("---------------");
    if (!skippedBookings.length) {
      console.log("None");
    } else {
      skippedBookings.forEach((entry, index) => {
        console.log(
          `${index + 1}. ${entry.reason} | ${entry.bookingId} | ${entry.jobNumber || "-"} | ${entry.production || "-"} | ${entry.status || "-"} | fields: ${entry.fieldsPresent}`
        );
      });
    }
  }

  console.log("");
  console.log(`JSON report written to ${OUTPUT_FILE}`);
  if (options.writeCsv) {
    console.log(`CSV conflicts written to ${OUTPUT_CONFLICTS_CSV}`);
    console.log(`CSV warnings written to ${OUTPUT_WARNINGS_CSV}`);
    console.log(`CSV skipped written to ${OUTPUT_SKIPPED_CSV}`);
  }
}

function dedupeSkips(skippedBookings) {
  return skippedBookings.map((booking) => {
    const fieldsPresent = [];
    if (booking.hasOwnProperty("bookingDates")) fieldsPresent.push("bookingDates");
    if (booking.hasOwnProperty("date")) fieldsPresent.push("date");
    if (booking.hasOwnProperty("startDate")) fieldsPresent.push("startDate");
    if (booking.hasOwnProperty("endDate")) fieldsPresent.push("endDate");
    if (booking.hasOwnProperty("vehicles")) fieldsPresent.push("vehicles");
    if (booking.hasOwnProperty("equipment")) fieldsPresent.push("equipment");
    if (booking.hasOwnProperty("employees")) fieldsPresent.push("employees");
    if (booking.hasOwnProperty("employeesByDate")) fieldsPresent.push("employeesByDate");
    return {
      ...booking,
      fieldsPresent: fieldsPresent.join(", "),
    };
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnvFileIfNeeded();
  const { adminListDocuments } = await import("../src/app/api/_firebaseAdminRest.js");
  const docs = await adminListDocuments("bookings");

  const limitedDocs = options.limit > 0 ? docs.slice(0, options.limit) : docs;
  const locks = [];
  const rawWarnings = [];
  const skipped = [];
  let inactiveBookingsSkipped = 0;
  let activeBookingsScanned = 0;

  limitedDocs.forEach(({ id, data }) => {
    const booking = {
      id,
      ...(data || {}),
      _raw: data || {},
    };

    const bookingIsActive = isActiveBooking(booking);
    if (!bookingIsActive && options.status === "active") {
      inactiveBookingsSkipped += 1;
      skipped.push({
        bookingId: id,
        reason: "inactive",
        status: booking.status || "",
        jobNumber: bookingReference(booking),
        production: bookingLabel(booking),
        ...data,
      });
      return;
    }

    const dates = expandBookingDates(booking);
    booking._expandedDates = dates;
    if (!dates.length) {
      skipped.push({
        bookingId: id,
        reason: "missing-dates",
        status: booking.status || "",
        jobNumber: bookingReference(booking),
        production: bookingLabel(booking),
        ...data,
      });
      return;
    }

    if (bookingIsActive || options.status === "all") {
      activeBookingsScanned += bookingIsActive ? 1 : 0;
      const batches = [];
      if (!options.resource || options.resource === "vehicle") {
        batches.push(deriveVehicleLocks(booking));
      }
      if (!options.resource || options.resource === "crew") {
        batches.push(deriveCrewLocks(booking));
      }
      if (!options.resource || options.resource === "equipment") {
        batches.push(deriveEquipmentLocks(booking));
      }
      const before = locks.length;
      batches.forEach((batch) => {
        locks.push(...batch.locks);
        rawWarnings.push(...batch.warnings);
      });
      if (locks.length === before) {
        skipped.push({
          bookingId: id,
          reason: "missing-resources",
          status: booking.status || "",
          jobNumber: bookingReference(booking),
          production: bookingLabel(booking),
          ...data,
        });
      }
    }
  });

  const duplicateWarnings = detectDuplicateLabelWarnings(locks);
  const identityWarnings = [...rawWarnings, ...duplicateWarnings];
  const groupedConflicts = decorateConflicts(detectConflicts(locks, identityWarnings));
  const skippedDetails = dedupeSkips(skipped);

  const lockDocIds = new Set(locks.map((lock) => lock.lockDocId));

  const warningBreakdown = {
    "vehicle missing stable id": identityWarnings.filter((warning) => warning.category === "vehicle missing stable id").length,
    "vehicle using name fallback": identityWarnings.filter((warning) => warning.category === "vehicle using name fallback").length,
    "vehicle missing registration": identityWarnings.filter((warning) => warning.category === "vehicle missing registration/serial").length,
    "crew missing stable id": identityWarnings.filter((warning) => warning.category === "crew missing stable id").length,
    "crew using name fallback": identityWarnings.filter((warning) => warning.category === "crew using name fallback").length,
    "equipment missing stable id": identityWarnings.filter((warning) => warning.category === "equipment missing stable id").length,
    "equipment using name fallback": identityWarnings.filter((warning) => warning.category === "equipment using name fallback").length,
    "equipment missing serial/registration": identityWarnings.filter((warning) => warning.category === "equipment missing registration/serial").length,
    "possible duplicate labels": identityWarnings.filter((warning) => warning.category === "possible duplicate labels").length,
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: options.status === "active" ? "dry-run-active" : "dry-run-all",
    resourceFilter: options.resource || "all",
    totalBookingsScanned: limitedDocs.length,
    activeBookingsScanned,
    inactiveBookingsSkipped,
    bookingsSkippedMissingDates: skipped.filter((item) => item.reason === "missing-dates").length,
    bookingsSkippedMissingResources: skipped.filter((item) => item.reason === "missing-resources").length,
    skippedBookingsByReason: summarizeSkipped(skipped),
    totalLockDocsWouldCreate: lockDocIds.size,
    totalLockEntriesWouldCreate: locks.length,
    vehicleLocks: locks.filter((lock) => lock.resourceType === "vehicle").length,
    crewLocks: locks.filter((lock) => lock.resourceType === "crew").length,
    equipmentLocks: locks.filter((lock) => lock.resourceType === "equipment").length,
    conflicts: groupedConflicts.length,
    vehicleConflicts: groupedConflicts.filter((conflict) => conflict.resourceType === "vehicle").length,
    crewConflicts: groupedConflicts.filter((conflict) => conflict.resourceType === "crew").length,
    equipmentConflicts: groupedConflicts.filter((conflict) => conflict.resourceType === "equipment").length,
    identityWarnings: identityWarnings.length,
    warningBreakdown,
  };

  const report = {
    summary,
    conflicts: groupedConflicts,
    identityWarnings,
    skippedBookings: skippedDetails,
    wouldCreateLocks: Array.from(lockDocIds)
      .sort()
      .map((lockDocId) => {
        const entries = locks.filter((lock) => lock.lockDocId === lockDocId);
        const first = entries[0];
        return {
          lockDocId,
          scope: first.scope,
          resourceType: first.resourceType,
          resourceId: first.resourceId,
          resourceLabel: first.resourceLabel,
          date: first.date,
          locks: entries.map((entry) => ({
            bookingId: entry.lock.bookingId,
            jobNumber: entry.lock.jobNumber,
            production: entry.lock.production,
            bookingStatus: entry.lock.bookingStatus,
            lockStatus: entry.lock.lockStatus,
            statusSource: entry.lock.statusSource,
            resourceId: entry.resourceId,
            identitySource: entry.identitySource,
          })),
        };
      }),
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  if (options.writeCsv) {
    writeCsv(
      OUTPUT_CONFLICTS_CSV,
      [
        "conflictType",
        "resourceType",
        "resourceLabel",
        "resourceId",
        "dateRange",
        "dateCount",
        "bookingA_id",
        "bookingA_jobNumber",
        "bookingA_production",
        "bookingA_status",
        "bookingA_vehicleStatus",
        "bookingA_startDate",
        "bookingA_endDate",
        "bookingA_bookingDates",
        "bookingA_resourceId",
        "bookingA_resourceLabel",
        "bookingA_identityMatch",
        "bookingB_id",
        "bookingB_jobNumber",
        "bookingB_production",
        "bookingB_status",
        "bookingB_vehicleStatus",
        "bookingB_startDate",
        "bookingB_endDate",
        "bookingB_bookingDates",
        "bookingB_resourceId",
        "bookingB_resourceLabel",
        "bookingB_identityMatch",
        "suggestedFix",
      ],
      buildConflictRows(groupedConflicts)
    );

    writeCsv(
      OUTPUT_WARNINGS_CSV,
      ["category", "resourceType", "resourceId", "resourceLabel", "bookingId", "jobNumber", "production", "status", "sourceUsed", "message"],
      buildWarningRows(identityWarnings)
    );

    writeCsv(
      OUTPUT_SKIPPED_CSV,
      ["bookingId", "jobNumber", "production", "status", "reasonSkipped", "fieldsPresent"],
      buildSkippedRows(skippedDetails)
    );
  }

  if (!options.json && !options.warningsOnly && options.conflictsOnly) {
    const filteredReport = {
      ...report,
      summary: { ...report.summary, identityWarnings: identityWarnings.length },
      identityWarnings: [],
      skippedBookings: [],
      wouldCreateLocks: [],
    };
    printTextReport(filteredReport, options);
  } else if (!options.conflictsOnly && options.warningsOnly && !options.json) {
    const filteredReport = {
      ...report,
      conflicts: [],
      skippedBookings: [],
      wouldCreateLocks: [],
    };
    printTextReport(filteredReport, options);
  } else if (!options.warningsOnly && options.conflictsOnly) {
    printTextReport(report, options);
  } else if (!options.conflictsOnly && options.warningsOnly) {
    printTextReport(report, options);
  } else {
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report, options);
    }
  }

  if (!options.conflictsOnly && options.writeCsv) {
    // keep process exit clear if no conflicts for easier automation
    if (groupedConflicts.length === 0 && identityWarnings.length === 0) {
      process.exitCode = 0;
    }
  }

  if (groupedConflicts.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("Resource lock audit failed:", error);
  process.exitCode = 1;
});
