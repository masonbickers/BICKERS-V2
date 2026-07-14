import {
  clean,
  compactText,
  toYmd,
  expandBookingDates,
  normalizeVehicleStatus,
  displayStatus,
  isActiveBooking,
  bookingLabel,
  bookingReference,
  buildIdentity,
  pickIdentitySource,
} from "./resourceLockCore.js";

const DEFAULT_SCOPE = "default";

const sanitizeDocIdPart = (value) => {
  const safe = compactText(value || "default");
  return safe || "default";
};

const normalizeStatusText = (value) => {
  const normalized = normalizeVehicleStatus(value);
  if (normalized) return normalized;
  return clean(value).toLowerCase();
};

const VEHICLE_BLOCKING_BY_REQUESTED = {
  confirmed: new Set(["confirmed", "first-pencil", "second-pencil", "maintenance"]),
  maintenance: new Set(["confirmed", "first-pencil", "second-pencil", "maintenance"]),
  "first-pencil": new Set(["confirmed", "first-pencil", "maintenance"]),
  "second-pencil": new Set(["confirmed", "maintenance"]),
};

const asBooking = (booking = {}) => ({
  id: booking.id || "",
  status: booking.status || "",
  vehicleStatus: booking.vehicleStatus || {},
  quoteNumber: booking.quoteNumber || "",
  jobNumber: booking.jobNumber || "",
  reference: bookingReference(booking),
  label: bookingLabel(booking),
  production: booking.production || booking.company || booking.client || "",
});

const statusSourceTag = (type) => {
  if (!type) return "booking.status";
  return `vehicleStatus.${type}`;
};

const statusLookupCandidates = (resource, identity) => {
  const candidateSet = new Set();
  const addCandidate = (value) => {
    const raw = clean(value);
    if (!raw) return;
    candidateSet.add(raw);
    candidateSet.add(raw.toLowerCase());
    candidateSet.add(compactText(raw));
  };

  if (resource && typeof resource === "object") {
    addCandidate(resource.id);
    addCandidate(resource.vehicleId);
    addCandidate(resource.key);
    addCandidate(resource.registration);
    addCandidate(resource.reg);
    addCandidate(resource.name);
    addCandidate(resource.vehicleName);
    addCandidate(resource.label);
  }

  addCandidate(identity?.raw);
  addCandidate(identity?.type === "name" ? identity?.raw : identity?.key?.split(":")[1]);

  return Array.from(candidateSet);
};

const resolveVehicleStatus = ({ booking, vehicleSource, identity }) => {
  const statuses = booking.vehicleStatus;
  if (!vehicleSource || typeof statuses !== "object") {
    return {
      normalizedStatus: normalizeStatusText(booking.status),
      rawStatus: booking.status || "",
      source: "booking.status",
      sourceType: "booking",
      matchedKey: "",
    };
  }

  const map = new Map();
  Object.entries(statuses).forEach(([rawKey, rawValue]) => {
    const normalizedValue = normalizeVehicleStatus(rawValue);
    if (!normalizedValue) return;
    const base = clean(rawKey);
    if (!base) return;
    const compact = compactText(base);
    [base, base.toLowerCase(), compact].forEach((candidate) => {
      if (!candidate) return;
      if (!map.has(candidate)) map.set(candidate, { status: normalizedValue, raw: clean(rawValue), source: `vehicleStatus.${base}` });
      if (!map.has(candidate.toLowerCase()) && candidate !== base.toLowerCase()) {
        map.set(candidate.toLowerCase(), { status: normalizedValue, raw: clean(rawValue), source: `vehicleStatus.${base}` });
      }
    });
  });

  const candidates = statusLookupCandidates(vehicleSource, identity);
  for (const candidate of candidates) {
    const found = map.get(candidate);
    if (found) return { ...found, matchedKey: candidate, sourceType: "vehicleStatus" };
  }

  return {
    normalizedStatus: normalizeStatusText(booking.status),
    rawStatus: booking.status || "",
    source: "booking.status",
    sourceType: "bookingStatus",
    matchedKey: "",
  };
};

const buildResourceId = (identityObj, fallback) => {
  const picked = pickIdentitySource(identityObj);
  if (picked?.key) return picked.key;
  const fallbackValue = compactText(fallback || "");
  return fallbackValue ? `name:${fallbackValue}` : "name:unknown";
};

const buildResourceIdentity = (value, options = {}) => {
  const identity = buildIdentity(value);
  const picked = pickIdentitySource(identity);
  const resourceLabel = identity.label || picked.raw || clean(value);
  const resourceId = buildResourceId(identity, resourceLabel);
  const sourceField = options.forceSource || picked.type;
  return {
    identity,
    picked,
    resourceLabel,
    resourceId,
    identitySource: sourceField,
    sourceUsed: statusSourceTag(sourceField),
    sourceOfMatch: options.forceSource || picked.type,
    identitySourceType: options.forceSource || picked.type,
  };
};

const normalizeByDateArray = (rawDates = []) =>
  Array.from(new Set(rawDates.map(toYmd).filter(Boolean))).sort();

const collectVehicleSources = (booking = {}) => {
  if (Array.isArray(booking.vehicles)) return booking.vehicles;
  const direct = [booking.vehicle, booking.vehicleId, booking.vehicleName, booking.registration, booking.reg];
  return direct.filter(Boolean);
};

const collectCrewSourcesForDate = (booking = {}, date) => {
  const byDate =
    booking.employeesByDate && typeof booking.employeesByDate === "object" ? booking.employeesByDate : {};
  const day = byDate[date];
  if (Array.isArray(day) && day.length) return day;
  return Array.isArray(booking.employees) ? booking.employees : [];
};

const collectEquipmentSources = (booking = {}) =>
  Array.isArray(booking.equipment) ? booking.equipment : [];

const makeLock = ({
  booking,
  scope,
  resourceType,
  resourceId,
  resourceLabel,
  resourceStatus,
  resourceStatusSource,
  resourceIdentitySource,
  date,
  sourceFieldUsed,
}) => ({
  scope: scope || DEFAULT_SCOPE,
  resourceType,
  resourceId,
  resourceLabel,
  date,
  identitySource: resourceIdentitySource || "name-fallback",
  sourceFieldUsed: sourceFieldUsed || "",
  status: resourceStatus || "",
  statusSource: resourceStatusSource || "booking.status",
  bookingId: booking.id || "",
  bookingStatus: normalizeStatusText(booking.status),
  bookingStatusLabel: displayStatus(booking.status),
  jobNumber: bookingReference(booking),
  production: bookingLabel(booking),
  bookingDatesUsed: booking._expandedDates || [],
  startDate: toYmd(booking.startDate || booking.startDateISO),
  endDate: toYmd(booking.endDate || booking.endDateISO),
  lockStatus:
    resourceType === "vehicle"
      ? normalizeVehicleStatus(resourceStatus || booking.status || "")
      : "booked",
});

const addDebug = (entries, label, payload, enabled = false) => {
  if (!enabled || typeof console === "undefined") return;
  console.log(`[resource-locks:${label}]`, payload);
  entries.push({ label, payload });
};

const buildResourceLockDocId = ({ resourceType, resourceId, date, scope = DEFAULT_SCOPE }) => {
  const safeScope = sanitizeDocIdPart(scope);
  const safeType = sanitizeDocIdPart(resourceType || "resource");
  const safeId = sanitizeDocIdPart(resourceId || "unknown");
  const safeDate = sanitizeDocIdPart(date || "unknown-date");
  return `${safeScope}_${safeType}_${safeId}_${safeDate}`;
};

const deriveBookingResourceLocks = (bookingPayload = {}, options = {}) => {
  const booking = asBooking(bookingPayload);
  const scope = options.scope || bookingPayload.scope || DEFAULT_SCOPE;
  const includeInactive = options.includeInactive || false;
  const selectedResources = options.resourceTypes || ["vehicle", "crew", "equipment"];
  const debug = Boolean(options.debug);
  const debugLog = [];

  const expandedDates = normalizeByDateArray(expandBookingDates(bookingPayload));
  if (!expandedDates.length) {
    return {
      locks: [],
      warnings: [
        {
          bookingId: booking.id,
          category: "missing-dates",
          message: "Booking has no parseable date range.",
          fieldsPresent: ["bookingDates", "date", "startDate", "endDate"],
        },
      ],
      skipped: {
        reason: "missing-dates",
        bookingId: booking.id,
        status: booking.status || "",
        jobNumber: booking.reference,
        production: booking.label,
      },
      debug: debugLog,
    };
  }

  const status = normalizeStatusText(booking.status);
  const bookingIsActive = isActiveBooking(bookingPayload);
  if (!includeInactive && !bookingIsActive) {
    return {
      locks: [],
      warnings: [
        {
          bookingId: booking.id,
          category: "inactive-booking",
          message: `Booking status ${booking.status || "unknown"} is inactive for locking.`,
          fieldsPresent: ["status"],
        },
      ],
      skipped: {
        reason: "inactive",
        bookingId: booking.id,
        status: booking.status || "",
        jobNumber: booking.reference,
        production: booking.label,
      },
      debug: debugLog,
    };
  }

  const warningItems = [];
  const lockRows = [];
  if (selectedResources.includes("vehicle")) {
    const vehicleSources = collectVehicleSources(bookingPayload);
    if (!vehicleSources.length) {
      warningItems.push({
        category: "missing-resources",
        bookingId: booking.id,
        message: "Vehicle booking has no parseable vehicle source(s).",
      });
    }

    vehicleSources.forEach((vehicleSource) => {
      const identityBundle = buildResourceIdentity(vehicleSource, { forceSource: "vehicleId" });
      const statusResolution = resolveVehicleStatus({
        booking: bookingPayload,
        vehicleSource,
        identity: identityBundle.identity,
      });
      const resourceStatus = statusResolution.normalizedStatus || status;
      const sourceOfMatch = statusResolution.source || statusSourceTag(statusResolution.sourceType);

      const warnings = !identityBundle.identity.vehicleId && !identityBundle.identity.registration;
      if (warnings) {
        warningItems.push({
          bookingId: booking.id,
          category: "vehicle name fallback",
          message: `Vehicle lock for ${identityBundle.resourceLabel || booking.id} has weak identity.`,
          fieldsPresent: identityBundle.resourceId,
          sourceUsed: identityBundle.sourceOfMatch || "name-fallback",
        });
      }

      expandedDates.forEach((date) => {
        const lock = makeLock({
          booking: bookingPayload,
          scope,
          resourceType: "vehicle",
          resourceId: identityBundle.resourceId,
          resourceLabel: identityBundle.resourceLabel,
          resourceStatus,
          resourceStatusSource: sourceOfMatch,
          resourceIdentitySource: identityBundle.identitySourceType,
          date,
          sourceFieldUsed: sourceOfMatch,
        });
        lock.lockDocId = buildResourceLockDocId({
          scope,
          resourceType: lock.resourceType,
          resourceId: lock.resourceId,
          date,
        });
        lockRows.push(lock);
      });
    });
  }

  if (selectedResources.includes("crew")) {
    expandedDates.forEach((date) => {
      const dayCrew = collectCrewSourcesForDate(bookingPayload, date);
      dayCrew.forEach((crewSource) => {
        const identityBundle = buildResourceIdentity(crewSource);
        const lock = makeLock({
          booking: bookingPayload,
          scope,
          resourceType: "crew",
          resourceId: identityBundle.resourceId,
          resourceLabel: identityBundle.resourceLabel,
          date,
          resourceIdentitySource: identityBundle.identitySourceType,
          sourceFieldUsed: identityBundle.sourceOfMatch || "",
        });
        lock.lockDocId = buildResourceLockDocId({
          scope,
          resourceType: lock.resourceType,
          resourceId: lock.resourceId,
          date,
        });
        lockRows.push(lock);
      });
    });
  }

  if (selectedResources.includes("equipment")) {
    collectEquipmentSources(bookingPayload).forEach((equipmentSource) => {
      const identityBundle = buildResourceIdentity(equipmentSource);
      expandedDates.forEach((date) => {
        const lock = makeLock({
          booking: bookingPayload,
          scope,
          resourceType: "equipment",
          resourceId: identityBundle.resourceId,
          resourceLabel: identityBundle.resourceLabel,
          date,
          resourceIdentitySource: identityBundle.identitySourceType,
          sourceFieldUsed: identityBundle.sourceOfMatch || "",
        });
        lock.lockDocId = buildResourceLockDocId({
          scope,
          resourceType: lock.resourceType,
          resourceId: lock.resourceId,
          date,
        });
        lockRows.push(lock);
      });
    });
  }

  addDebug(
    debugLog,
    "derive-start",
    {
      bookingId: booking.id,
      status: booking.status || "",
      dateCount: expandedDates.length,
      lockCount: lockRows.length,
      resourceTypes: selectedResources,
    },
    debug
  );

  return {
    locks: lockRows,
    warnings: warningItems,
    skipped: null,
    debug: debugLog,
  };
};

const checkVehiclePairConflict = (requestedStatus, existingStatus) => {
  const req = normalizeStatusText(requestedStatus);
  const existing = normalizeStatusText(existingStatus);
  if (!req || !existing) return "allowed";
  const blocked = VEHICLE_BLOCKING_BY_REQUESTED[req]?.has(existing);
  if (blocked) return "blocked";
  return "allowed";
};

const normalizeLockStatusForConflict = (lock = {}) => {
  if (!lock || !lock.resourceType) return "";
  if (lock.resourceType !== "vehicle") return "booked";
  return normalizeVehicleStatus(lock.lockStatus || lock.status || lock.bookingStatus || "");
};

const toFlatLockList = (docs = []) => {
  const out = [];
  (Array.isArray(docs) ? docs : []).forEach((doc) => {
    if (!doc) return;
    const docData = typeof doc.data === "function" ? doc.data() : doc;
    if (!docData || !docData.resourceType || !docData.resourceId || !docData.date) return;
    const entries = Array.isArray(docData.locks) && docData.locks.length ? docData.locks : [docData];
    entries.forEach((entry) => {
      if (!entry || !entry.date || entry.resourceId == null || entry.resourceType == null) return;
      const bookingId = entry.lock?.bookingId || entry.bookingId;
      out.push({
        resourceType: entry.resourceType || docData.resourceType,
        resourceId: entry.resourceId || docData.resourceId,
        date: entry.date || docData.date,
        bookingId: bookingId || "",
        status: entry.lock?.lockStatus || entry.lockStatus || entry.status || "",
        bookingStatus: entry.lock?.bookingStatus || entry.bookingStatus || "",
        jobNumber: entry.lock?.jobNumber || entry.jobNumber || "",
        production: entry.lock?.production || entry.production || "",
        bookingLabel: entry.lock?.production || entry.production || "",
        raw: entry,
      });
    });
  });
  return out;
};

const formatLockConflictEntry = (entry) => {
  return {
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    resourceLabel: entry.resourceLabel,
    date: entry.date,
    currentBookingId: entry.current.bookingId,
    currentBookingLabel: entry.current.production,
    currentBookingReference: entry.current.jobNumber,
    currentBookingStatus: entry.current.bookingStatusLabel || entry.current.bookingStatus,
    currentVehicleStatus: entry.current.lockStatus || "",
    comparedBookingId: entry.compared.bookingId,
    comparedBookingLabel: entry.compared.production,
    comparedBookingReference: entry.compared.jobNumber,
    comparedBookingStatus: entry.compared.bookingStatus,
    comparedVehicleStatus: entry.compared.lockStatus || "",
    result: entry.result,
    sourceOfIdentityMatch: entry.current.identitySource || "",
  };
};

const checkResourceLockConflicts = (newLocks = [], existingLockDocs = [], options = {}) => {
  const ignoreBookingId = options.ignoreBookingId || options.currentBookingId || "";
  const debug = Boolean(options.debug);
  const debugLog = [];

  const conflicts = [];
  const conflictByType = { vehicle: [], crew: [], equipment: [] };
  const dedup = new Set();

  const currentLocks = Array.isArray(newLocks) ? newLocks : [];
  const existingLocks = toFlatLockList(existingLockDocs);

  currentLocks.forEach((current) => {
    existingLocks.forEach((existing) => {
      if (!current || !existing) return;
      if (current.resourceType !== existing.resourceType) return;
      if (current.resourceId !== existing.resourceId) return;
      if (current.date !== existing.date) return;
      if (current.bookingId && existing.bookingId && current.bookingId === existing.bookingId) return;
      if (ignoreBookingId && existing.bookingId === ignoreBookingId) return;
      if (ignoreBookingId && current.bookingId === ignoreBookingId && existing.bookingId !== ignoreBookingId) {
        // allow; still compared because new lock may exist from edit
      }

      const currentStatus = normalizeLockStatusForConflict(current);
      const existingStatus = normalizeLockStatusForConflict(existing);
      let result = "allowed";
      if (current.resourceType === "vehicle") {
        result = checkVehiclePairConflict(currentStatus, existingStatus);
      } else {
        result = "blocked";
      }

      const conflict = {
        resourceType: current.resourceType,
        resourceId: current.resourceId,
        resourceLabel: current.resourceLabel || current.resourceId,
        date: current.date,
        resourceStatus: currentStatus,
        current: {
          bookingId: current.bookingId || "",
          production: current.production || "",
          jobNumber: current.jobNumber || "",
          bookingStatus: current.bookingStatusLabel || current.bookingStatus || "",
          lockStatus: current.lockStatus || currentStatus,
          identitySource: current.identitySource,
          date: current.date,
          resourceId: current.resourceId,
          sourceFieldUsed: current.sourceFieldUsed || "",
        },
        compared: {
          bookingId: existing.bookingId || "",
          production: existing.production || "",
          jobNumber: existing.jobNumber || "",
          bookingStatus: existing.bookingStatus || "",
          lockStatus: existing.lockStatus || existingStatus,
          bookingDatesUsed: (existing.raw?.bookingDates || existing.raw?.bookingDatesUsed || []).join(", "),
          startDate: existing.raw?.startDate || "",
          endDate: existing.raw?.endDate || "",
          sourceOfMatch: existing.sourceOfIdentityMatch || "id",
        },
        lockStatusA: currentStatus,
        lockStatusB: existingStatus,
        resourceTypeConflict: current.resourceType,
        result,
      };
      conflict.current.date = current.date;

      if (result === "blocked") {
        if (!dedup.has(JSON.stringify(formatLockConflictEntry(conflict)))) {
          const formatted = formatLockConflictEntry(conflict);
          dedup.add(JSON.stringify(formatted));
          conflicts.push(formatted);
          conflictByType[current.resourceType].push(formatted);
        }
      }

      if (debug) {
        const debugEntry = {
          currentBookingId: current.bookingId,
          comparedBookingId: existing.bookingId,
          currentResource: current.resourceLabel,
          comparedResource: existing.resourceId,
          date: current.date,
          resourceType: current.resourceType,
          resourceStatusCurrent: currentStatus,
          resourceStatusCompared: existingStatus,
          result,
        };
        debugLog.push(debugEntry);
      }
    });
  });

  const result = {
    hasBlockingConflicts: conflicts.length > 0,
    conflicts,
    vehicleConflicts: conflictByType.vehicle,
    crewConflicts: conflictByType.crew,
    equipmentConflicts: conflictByType.equipment,
    debug: {
      checkedPairs: currentLocks.length * existingLocks.length,
      ignoreBookingId,
      logs: debugLog,
    },
  };

  if (debug) {
    result.debug.normalized = {
      currentLocks: currentLocks.length,
      existingLocks: existingLocks.length,
    };
  }

  return result;
};

const formatResourceLockConflictMessage = (conflicts = []) => {
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return "No resource lock conflicts detected.";
  }

  const lines = conflicts.map((conflict, index) => {
    const date = conflict.date || "";
    const resourceType = clean(conflict.resourceType);
    const resourceLabel = conflict.resourceLabel || conflict.resourceId || "";
    const currentBooking = `${conflict.currentBookingLabel || "Unknown booking"} (${conflict.currentBookingReference || "N/A"})`;
    const comparedBooking = `${conflict.comparedBookingLabel || "Unknown booking"} (${conflict.comparedBookingReference || "N/A"})`;
    const currentStatus = conflict.currentBookingStatus || "unknown";
    const comparedStatus = conflict.comparedBookingStatus || "unknown";
    return `${index + 1}. ${resourceType} conflict for ${resourceLabel} on ${date}: ${currentBooking} [${currentStatus}] clashes with ${comparedBooking} [${comparedStatus}].`;
  });

  return [
    "Resource lock conflicts detected:",
    ...lines,
    "",
    `Total conflicts: ${conflicts.length}`,
  ].join("\n");
};

class ResourceLockConflictError extends Error {
  constructor(conflicts, message = "Resource lock conflict(s) blocking save.") {
    super(message);
    this.name = "ResourceLockConflictError";
    this.conflicts = conflicts;
  }
}

async function saveBookingWithResourceLocks({
  runTransaction,
  writeBooking,
  readLockDocs,
  upsertLockDocs,
  deleteLockDocs = async () => {},
  db = null,
  bookingPayload,
  currentBookingId = "",
  oldBookingPayload = null,
  scope = DEFAULT_SCOPE,
  options = {},
}) {
  if (!runTransaction || typeof runTransaction !== "function") {
    throw new Error("saveBookingWithResourceLocks requires a runTransaction-style function for scaffolding.");
  }
  if (!writeBooking || typeof writeBooking !== "function") {
    throw new Error("saveBookingWithResourceLocks requires writeBooking callback for scaffolding.");
  }
  if (!readLockDocs || typeof readLockDocs !== "function") {
    throw new Error("saveBookingWithResourceLocks requires readLockDocs callback for scaffolding.");
  }
  if (!upsertLockDocs || typeof upsertLockDocs !== "function") {
    throw new Error("saveBookingWithResourceLocks requires upsertLockDocs callback for scaffolding.");
  }

  const derivedNew = deriveBookingResourceLocks(bookingPayload, { scope, ...options });
  if (derivedNew.skipped) {
    return { skipped: derivedNew.skipped, warnings: derivedNew.warnings, locks: [] };
  }

  const newLocks = derivedNew.locks;
  const oldLocks = oldBookingPayload ? deriveBookingResourceLocks(oldBookingPayload, { scope, ...options }).locks : [];
  const lockIds = new Set();
  const registerId = (lock) => {
    if (lock?.lockDocId) {
      lockIds.add(lock.lockDocId);
      return;
    }
    lockIds.add(buildResourceLockDocId(lock));
  };
  newLocks.forEach(registerId);
  oldLocks.forEach(registerId);

  const existingLockDocs = await readLockDocs(Array.from(lockIds));
  const conflictResult = checkResourceLockConflicts(newLocks, existingLockDocs, {
    ignoreBookingId: currentBookingId,
    debug: options.debug,
  });
  if (conflictResult.hasBlockingConflicts) {
    throw new ResourceLockConflictError(conflictResult.conflicts, formatResourceLockConflictMessage(conflictResult.conflicts));
  }

  return runTransaction(async (transaction) => {
    await writeBooking(transaction, bookingPayload, oldBookingPayload);
    await upsertLockDocs(transaction, newLocks, {
      scope,
      db,
      options,
      existingLockDocs,
    });
    await deleteLockDocs(transaction, oldLocks, newLocks);
    return { bookingPayload, locks: newLocks, conflicts: conflictResult };
  });
}

export {
  deriveBookingResourceLocks,
  buildResourceLockDocId,
  checkResourceLockConflicts,
  formatResourceLockConflictMessage,
  ResourceLockConflictError,
  saveBookingWithResourceLocks,
  normalizeStatusText,
};
