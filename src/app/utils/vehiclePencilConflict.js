import {
  collectVehicleIdentityKeys,
  normalizeVehicleKeysListForLookup,
} from "./bookingFormShared";

const VEHICLE_PRIORITY_ORDER = [
  "",
  "Bickers",
  "DNH",
  "Second Pencil",
  "First Pencil",
  "Confirmed",
  "Maintenance",
];

const VEHICLE_PRIORITY = VEHICLE_PRIORITY_ORDER.reduce((acc, status, index) => {
  acc[status] = index;
  return acc;
}, {});

const HOLDING_STATUSES = new Set(["Second Pencil", "First Pencil", "Confirmed", "Maintenance"]);
const CONFIRMED_DOMINANT = new Set(["Confirmed", "Maintenance"]);
const FIRST_LIKE_STATUSES = new Set(["First Pencil", "Confirmed", "Maintenance"]);

const CONFLICT_BY_REQUESTED_STATUS = {
  // A second pencil is a backup hold. It can sit behind First Pencil, but not Confirmed.
  "Second Pencil": new Set(["Confirmed", "Maintenance"]),
  "First Pencil": new Set(["First Pencil", "Confirmed", "Maintenance"]),
  Confirmed: new Set(["Second Pencil", "First Pencil", "Confirmed", "Maintenance"]),
};

const normalizeVehicleStatus = (rawStatus) => {
  const value = String(rawStatus || "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (lower === "second pencil") return "Second Pencil";
  if (lower === "first pencil") return "First Pencil";
  if (lower === "confirmed") return "Confirmed";
  if (lower === "maintenance") return "Maintenance";
  return value;
};

const statusPriority = (status) => VEHICLE_PRIORITY[normalizeVehicleStatus(status)] || 0;

const normaliseVehicleText = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();

const isHoldingStatus = (status) => HOLDING_STATUSES.has(normalizeVehicleStatus(status));
const isFirstLikeStatus = (status) => FIRST_LIKE_STATUSES.has(normalizeVehicleStatus(status));

const doesStatusConflict = (requestedStatus, existingStatus) => {
  const requested = normalizeVehicleStatus(requestedStatus);
  const existing = normalizeVehicleStatus(existingStatus);

  if (!requested || !existing) return false;

  if (requested === "Second Pencil") {
    return CONFLICT_BY_REQUESTED_STATUS["Second Pencil"].has(existing);
  }

  if (requested === "First Pencil") {
    return CONFLICT_BY_REQUESTED_STATUS["First Pencil"].has(existing);
  }

  if (requested === "Confirmed") {
    return CONFLICT_BY_REQUESTED_STATUS.Confirmed.has(existing);
  }

  return false;
};

const classifyVehicleConflictOutcome = (requestedStatus, existingStatus) => {
  const requested = normalizeVehicleStatus(requestedStatus);
  const existing = normalizeVehicleStatus(existingStatus);
  const conflict = doesStatusConflict(requested, existing);

  if (!conflict) return "allowed";
  if (requested === "Confirmed" && existing === "Second Pencil") return "warning";
  return "blocked";
};

const toUtcDate = (value) => {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    if (Number.isNaN(date.getTime())) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  if (typeof value?.seconds === "number") {
    const seconds = value.seconds;
    const nanos = value.nanoseconds || 0;
    const date = new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
    if (Number.isNaN(date.getTime())) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const toYmd = (value) => {
  if (!value) return "";
  if (typeof value !== "string") {
    const parsed = toUtcDate(value);
    return parsed ? parsed.toISOString().slice(0, 10) : "";
  }
  const direct = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = toUtcDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
};

const parseYmd = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const enumerateYmdRange = (startYmd, endYmd) => {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return [];
  const out = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

const toDateSet = (dates) => {
  const out = new Set();
  if (!Array.isArray(dates)) return out;
  dates.forEach((date) => {
    const key = toYmd(date);
    if (key) out.add(key);
  });
  return out;
};

const setToSortedArray = (setLike) =>
  Array.from(new Set(setLike || []))
    .map((value) => String(value || "").slice(0, 10))
    .filter(Boolean)
    .sort();

const compactVehicleText = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();

const canonicalVehicleIdentityKey = (rawValue, vehicleLookup = {}) => {
  const normalized = normalizeVehicleKeysListForLookup([rawValue], vehicleLookup);
  if (normalized.length) return normalized[0];
  return String(rawValue || "").trim();
};

const collectStatusLookupVariants = (value) => {
  const seen = new Set();
  const add = (candidate) => {
    const text = String(candidate || "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
  };

  add(value);
  if (!value) return Array.from(seen);

  add(String(value).trim().toLowerCase());
  add(String(value).trim().toUpperCase());
  const compact = compactVehicleText(value);
  add(compact);
  add(compact.toLowerCase());

  return Array.from(seen);
};

const buildVehicleStatusLookupIndex = (vehicleStatus = {}) => {
  const index = {};
  if (!vehicleStatus || typeof vehicleStatus !== "object") return index;

  Object.entries(vehicleStatus).forEach(([rawKey, rawValue]) => {
    const status = String(rawValue || "").trim();
    if (!status) return;
    collectStatusLookupVariants(rawKey).forEach((key) => {
      if (!key) return;
      if (!(key in index)) index[key] = status;
    });
  });

  return index;
};

const canonicalizeVehicleKeySet = (rawValues = [], vehicleLookup = {}) => {
  const keys = new Set();
  const values = Array.isArray(rawValues) ? rawValues : [rawValues];
  values.forEach((value) => {
    if (value && typeof value === "object") {
      collectVehicleIdentityKeys(value, vehicleLookup).forEach((candidate) => {
        const normalized = String(candidate || "").trim();
        if (normalized) keys.add(normalized);
      });
      const directLookup = canonicalVehicleIdentityKey(value, vehicleLookup);
      if (directLookup) keys.add(directLookup);
      return;
    }

    const canonical = canonicalVehicleIdentityKey(value, vehicleLookup);
    if (canonical) keys.add(canonical);
  });
  return keys;
};

const resolveVehicleStatus = ({
  booking,
  bookingVehicleSources = [],
  vehicleId,
  vehicleStatusLookup = {},
  fallbackStatus = "",
  vehicleLookup = {},
}) => {
  const { byId = {}, byReg = {}, byName = {} } = vehicleLookup;
  const candidateKeys = new Set();

  const addCandidate = (value) => {
    if (value === undefined || value === null) return;
    collectStatusLookupVariants(value).forEach((candidate) => {
      if (candidate) candidateKeys.add(candidate);
    });
  };

  const addLookupDerivedCandidates = (value) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;

    const compactText = normaliseVehicleText(text);
    const upperText = text.toUpperCase();
    const lowerText = text.toLowerCase();

    const byRegVehicle = byReg[upperText] || byReg[compactText] || byReg[upperText.replace(/\s+/g, "")];
    if (byRegVehicle) {
      addCandidate(byRegVehicle.id);
      addCandidate(byRegVehicle.registration);
      addCandidate(byRegVehicle.name);
      addCandidate(byRegVehicle.vehicleName);
    }

    const byNameVehicle = byName[lowerText] || byName[text];
    if (byNameVehicle) {
      addCandidate(byNameVehicle.id);
      addCandidate(byNameVehicle.registration);
      addCandidate(byNameVehicle.name);
      addCandidate(byNameVehicle.vehicleName);
    }

    const byIdVehicle = byId[text];
    if (byIdVehicle) {
      addCandidate(byIdVehicle.id);
      addCandidate(byIdVehicle.registration);
      addCandidate(byIdVehicle.name);
      addCandidate(byIdVehicle.vehicleName);
    }

    const byIdVehicleCompact = byId[compactText];
    if (byIdVehicleCompact) {
      addCandidate(byIdVehicleCompact.id);
      addCandidate(byIdVehicleCompact.registration);
      addCandidate(byIdVehicleCompact.name);
      addCandidate(byIdVehicleCompact.vehicleName);
    }
  };

  const vehicleIdKey = String(vehicleId || "").trim();
  if (vehicleIdKey) {
    addCandidate(vehicleIdKey);
  }

  const matchedVehicle = byId[vehicleIdKey];
  if (matchedVehicle) {
    addCandidate(matchedVehicle.id);
    addCandidate(matchedVehicle.registration);
    addCandidate(matchedVehicle.name);
    addCandidate(matchedVehicle.vehicleName);
  }

  (bookingVehicleSources || []).forEach((source) => {
    if (!source && source !== 0) return;

    if (typeof source === "object") {
      const maybeId = String(source.id || source.vehicleId || "").trim();
      const maybeReg = String(source.registration || source.reg || "").trim();
      const maybeName = String(source.name || source.vehicleName || "").trim();
      addCandidate(maybeId);
      addCandidate(maybeReg);
      addCandidate(maybeName);
      addLookupDerivedCandidates(maybeId);
      addLookupDerivedCandidates(maybeReg);
      addLookupDerivedCandidates(maybeName);

      const resolvedById = byId[maybeId];
      if (resolvedById) {
        addCandidate(resolvedById.id);
        addCandidate(resolvedById.registration);
        addCandidate(resolvedById.name);
        addCandidate(resolvedById.vehicleName);
      }
      return;
    }

    const text = String(source || "").trim();
    if (!text) return;
    addCandidate(text);
    addLookupDerivedCandidates(text);

    const lookup = byName[text.toLowerCase()] || byName[text.toUpperCase()] || byName[text];
    const lookupById = byId[text];
    const lookupByReg =
      byReg[text.toUpperCase()] || byReg[compactVehicleText(text)] || byReg[text.toLowerCase()];

    [lookup, lookupById, lookupByReg]
      .filter(Boolean)
      .forEach((entry) => {
        addCandidate(entry.id);
        addCandidate(entry.registration);
        addCandidate(entry.name);
        addCandidate(entry.vehicleName);
      });
  });

  for (const key of candidateKeys) {
    const rawStatus = vehicleStatusLookup[key];
    if (!rawStatus) continue;
    return {
      status: normalizeVehicleStatus(rawStatus),
      rawStatus,
      matchedKey: key,
      source: `vehicleStatus.${key}`,
      sourceType: "vehicleStatus",
    };
  }

  return {
    status: normalizeVehicleStatus(fallbackStatus),
    rawStatus: fallbackStatus,
    matchedKey: "",
    source: "booking.status",
    sourceType: "bookingStatus",
  };
};

const resolveVehicleStatusInfo = ({
  booking,
  bookingVehicleSources = [],
  vehicleId,
  vehicleStatusLookup = {},
  fallbackStatus = "",
  vehicleLookup = {},
  selectedVehicleId = "",
  selectedVehicleStatuses = {},
  selectedDefaultStatus = "Confirmed",
}) => {
  const vehicleStatusResolution = resolveVehicleStatus({
    booking,
    bookingVehicleSources,
    vehicleId,
    vehicleStatusLookup,
    fallbackStatus,
    vehicleLookup,
  });

  const selectedStatusSource = Object.prototype.hasOwnProperty.call(
    selectedVehicleStatuses || {},
    selectedVehicleId
  )
    ? {
        source: `selectedVehicleStatuses.${selectedVehicleId}`,
        sourceType: "vehicleStatusMap",
        value: selectedVehicleStatuses[selectedVehicleId],
      }
    : {
        source: "selectedDefaultStatus",
        sourceType: "bookingStatus",
        value: selectedDefaultStatus,
      };

  return {
    vehicleStatusResolution,
    selectedStatusSource,
  };
};

const unionSets = (a, b) => {
  const result = new Set(a);
  (b || []).forEach((item) => result.add(item));
  return result;
};

const intersectSets = (left, right) => {
  const out = new Set();
  left.forEach((value) => {
    if (right.has(value)) out.add(value);
  });
  return out;
};

const differenceSets = (left, right) => {
  const out = new Set();
  left.forEach((value) => {
    if (!right.has(value)) out.add(value);
  });
  return out;
};

const buildDateRanges = (sortedDates = []) => {
  if (!sortedDates.length) return [];
  const dates = [...sortedDates];
  const ranges = [];

  let rangeStart = dates[0];
  let rangeEnd = dates[0];

  for (let i = 1; i < dates.length; i += 1) {
    const next = dates[i];
    const prev = parseYmd(rangeEnd);
    const nextDate = parseYmd(next);

    if (!prev || !nextDate) {
      ranges.push([rangeStart, rangeEnd]);
      rangeStart = next;
      rangeEnd = next;
      continue;
    }

    if ((nextDate.getTime() - prev.getTime()) / 86400000 === 1) {
      rangeEnd = next;
      continue;
    }

    ranges.push([rangeStart, rangeEnd]);
    rangeStart = next;
    rangeEnd = next;
  }

  ranges.push([rangeStart, rangeEnd]);
  return ranges;
};

const formatDateRanges = (dates = []) =>
  buildDateRanges(setToSortedArray(dates)).map(([start, end]) =>
    start === end ? start : `${start} to ${end}`
  );

const expandBookingDates = (booking = {}) => {
  if (Array.isArray(booking.bookingDates) && booking.bookingDates.length) {
    return booking.bookingDates.map((value) => toYmd(value)).filter(Boolean);
  }

  const date = toYmd(booking.date);
  const start = toYmd(booking.startDate);
  const end = toYmd(booking.endDate);
  if (date) return [date];
  if (start && end) return enumerateYmdRange(start, end);
  return [];
};

const getVehicleLabel = (vehicleId, vehicleLookup = {}) => {
  const byId = vehicleLookup?.byId || {};
  const vehicle = byId[vehicleId] || {};
  return [vehicle.name, vehicle.registration].filter(Boolean).join(" - ") || vehicleId;
};

const getVehicleDebugInfo = (vehicleId, bookingVehicleSources = [], vehicleLookup = {}) => {
  const byId = vehicleLookup?.byId || {};
  const vehicle = byId[vehicleId] || {};
  const matchingSource = (bookingVehicleSources || []).find((source) => {
    if (!source || typeof source !== "object") return false;
    return String(source.id || source.vehicleId || "").trim() === String(vehicleId || "").trim();
  });
  const name =
    vehicle.name ||
    vehicle.vehicleName ||
    matchingSource?.name ||
    matchingSource?.vehicleName ||
    "";
  const registration =
    vehicle.registration ||
    matchingSource?.registration ||
    matchingSource?.reg ||
    "";

  return {
    vehicleName: String(name || "").trim(),
    vehicleRegistration: String(registration || "").trim(),
    vehicleLabel: [name, registration].filter(Boolean).join(" - ") || vehicleId,
  };
};

const resolveBookingLabel = (booking = {}) => {
  return (
    booking.production ||
    booking.client ||
    booking.productionCompany ||
    booking.company ||
    booking.name ||
    "Unknown booking"
  );
};

const resolveBookingReference = (booking = {}) => {
  return booking.quoteNumber || booking.jobNumber || booking.id || "Booking";
};

const compareStatusPriorityDesc = (left, right) =>
  statusPriority(right) - statusPriority(left);

const collectDates = (bookingRows, targetDates) => {
  const allBookingRows = Array.isArray(bookingRows) ? bookingRows : [];
  const targetSet = toDateSet(targetDates);
  return allBookingRows
    .map((booking) => {
      if (!booking || !booking.id) return null;
      const bookingDates = expandBookingDates(booking);
      const overlap = bookingDates.filter((date) => targetSet.has(date));
      if (!overlap.length) return null;
      return { booking, overlapSet: new Set(overlap) };
    })
    .filter(Boolean);
};

const collectAllBookingDates = (bookingRows) =>
  setToSortedArray(
    (Array.isArray(bookingRows) ? bookingRows : []).flatMap((booking) => expandBookingDates(booking))
  );

/**
 * Analyse vehicle pencil conflicts against booking data.
 * Priority (high -> low): Confirmed -> First Pencil -> Second Pencil -> other states.
 * Confirmed is treated as highest priority hold and blocks both first and second pencils.
 * First Pencil blocks other first-pencil/confirmed holds and can release second-pencil holds
 * on date ranges that stop overlapping.
 */
const analyzeVehiclePencilConflicts = ({
  allBookings = [],
  vehicleLookup = {},
  selectedDates = [],
  selectedVehicleIds = [],
  selectedVehicleStatuses = {},
  selectedDefaultStatus = "Confirmed",
  previousDates = [],
  previousVehicleIds = [],
  previousVehicleStatuses = {},
  previousDefaultStatus = "Confirmed",
  excludeBookingId = "",
  debug = false,
  debugContext = {},
}) => {
  const selectedDateSet = toDateSet(selectedDates);
  const previousDateSet = toDateSet(previousDates);
  const unionDateSet = unionSets(selectedDateSet, previousDateSet);
  if (!selectedDateSet.size && !previousDateSet.size) {
    return {
      vehicleBlockingStatusesById: {},
      vehicleBlockingStatusById: {},
      bookedVehicleIds: [],
      heldVehicleIds: [],
      requestedConflictByVehicleId: {},
      requestedConflictList: [],
      upgradeOpportunities: [],
      blockedSecondAffectedBookingsByVehicleId: {},
      blockedSecondAffectedBookings: [],
    };
  }

  const isDebugEnabled = Boolean(
    debug ||
      (typeof debugContext?.localStorageKey === "string" &&
        (() => {
          try {
            return window?.localStorage?.getItem(debugContext.localStorageKey) === "1";
          } catch {
            return false;
          }
        })())
  );

  const debugLog = (...args) => {
    if (isDebugEnabled && typeof console !== "undefined") {
      console.log("[vehicle-pencil-conflict]", ...args);
    }
  };

  if (isDebugEnabled) {
    debugLog("analysis-start", {
      currentBookingId: debugContext.currentBookingId || "",
      currentBookingLabel: debugContext.currentBookingLabel || "",
      currentBookingStatus: debugContext.currentBookingStatus || "",
      currentStartDate: debugContext.currentStartDate || "",
      currentEndDate: debugContext.currentEndDate || "",
      currentVehicleIds: Array.from(new Set((debugContext.currentVehicleIds || []).filter(Boolean))),
      currentVehicleRawValues: debugContext.currentVehicleRawValues || [],
      currentVehicleStatuses: debugContext.currentVehicleStatuses || [],
      selectedDateCount: selectedDateSet.size,
      previousDateCount: previousDateSet.size,
    });
  }

  const allVehicleIdCandidates = Array.isArray(selectedVehicleIds)
    ? selectedVehicleIds
    : Object.keys(vehicleLookup?.byId || {});
  const requestedVehicleKeySet = canonicalizeVehicleKeySet(allVehicleIdCandidates, vehicleLookup);
  const requestedVehicleKeys = Array.from(requestedVehicleKeySet);
  const previousVehicleKeySet = canonicalizeVehicleKeySet(previousVehicleIds, vehicleLookup);
  const previousVehicleKeys = Array.from(previousVehicleKeySet);

  const analysisVehicleIds = new Set([
    ...requestedVehicleKeys,
    ...previousVehicleKeys,
  ]);

  const getRequestedStatusForVehicle = (vehicleId) =>
    normalizeVehicleStatus(selectedVehicleStatuses?.[vehicleId] || selectedDefaultStatus);
  const getPreviousStatusForVehicle = (vehicleId) =>
    normalizeVehicleStatus(previousVehicleStatuses?.[vehicleId] || previousDefaultStatus);

  const previousFirstLikeByVehicle = {};
  const requestedFirstLikeByVehicle = {};

  analysisVehicleIds.forEach((vehicleId) => {
    const previousStatus = getPreviousStatusForVehicle(vehicleId);
    if (isFirstLikeStatus(previousStatus) && previousDateSet.size) {
      previousFirstLikeByVehicle[vehicleId] = previousDateSet;
    }

    const requestedStatus = getRequestedStatusForVehicle(vehicleId);
    if (isFirstLikeStatus(requestedStatus) && selectedDateSet.size) {
      requestedFirstLikeByVehicle[vehicleId] = selectedDateSet;
    }
  });

  const occupancyByVehicleDate = {};
  const secondHoldingsByVehicleAndBooking = {};

  const relevantBookings = collectDates(allBookings, unionDateSet);

  relevantBookings.forEach(({ booking, overlapSet }) => {
    if (booking.id === excludeBookingId) return;

    const bookingVehicleSources = Array.isArray(booking.vehicles)
      ? booking.vehicles
      : [
          booking.vehicle,
          booking.vehicleId,
          booking.vehicleName,
          booking.registration,
          booking.reg,
          ...(typeof booking.vehicles === "string" ? [booking.vehicles] : []),
        ];

    const bookingDefaultStatus = normalizeVehicleStatus(booking.status);
    const resolvedVehicleIds = normalizeVehicleKeysListForLookup(bookingVehicleSources, vehicleLookup);
    const bookingVehicleMatchKeys = Array.from(
      new Set(collectVehicleIdentityKeys(bookingVehicleSources, vehicleLookup))
    );
    const candidateVehicleKeys = Array.from(
      new Set(
        [...resolvedVehicleIds, ...bookingVehicleMatchKeys].map((candidate) =>
          canonicalVehicleIdentityKey(candidate, vehicleLookup)
        )
      )
    ).filter(Boolean);
    const perVehicleStatusLookup = buildVehicleStatusLookupIndex(booking.vehicleStatus || {});
    const bookingStartDate = toYmd(
      booking.startDate || booking.date || booking.dateISO || booking.startDateISO || ""
    );
    const bookingEndDate = toYmd(
      booking.endDate || booking.startDate || booking.endDateISO || ""
    );
    const selectedVehicleSet = new Set(requestedVehicleKeys);
    const matchingVehicleKeys = candidateVehicleKeys.filter((vehicleId) =>
      selectedVehicleSet.has(vehicleId)
    );

    if (isDebugEnabled) {
      debugLog("compare-booking", {
        currentBookingId: debugContext.currentBookingId || "",
        comparedBookingId: booking.id,
        comparedBookingStatus: bookingDefaultStatus,
        comparedBookingSource: "booking.status",
        comparedBookingStatusSource: "booking.status",
        comparedBookingStartDate: bookingStartDate,
        comparedBookingEndDate: bookingEndDate,
        comparedBookingLabel:
          booking.production || booking.productionCompany || booking.client || booking.name || booking.id || "",
        comparedBookingReference:
          booking.quoteNumber || booking.jobNumber || booking.id || "",
        comparedBookingVehicleSources: bookingVehicleSources
          .filter((value) => value !== undefined && value !== null)
          .filter(
            (value) =>
              typeof value !== "object" ||
              Boolean(value.id || value.vehicleId || value.registration || value.name || value.vehicleName)
          )
          .slice(0, 6),
        dateOverlapDetected: overlapSet.size > 0,
        overlapDates: setToSortedArray(overlapSet),
        matchedVehicleIds: candidateVehicleKeys,
        sameVehicleDetected: matchingVehicleKeys.length > 0,
        requestedVehicleIds: Array.from(selectedVehicleSet),
        requestedVehicleNormalizedIds: requestedVehicleKeys,
        requestedVehicleReference: debugContext.currentBookingReference || debugContext.currentBookingId || "",
        requestedVehicleMatchKeys: requestedVehicleKeys,
        requestedVehicleRawValues: debugContext.currentVehicleRawValues || [],
        requestedVehicleStatuses: debugContext.currentVehicleStatuses || [],
      });
    }

    if (!candidateVehicleKeys.length) {
      if (isDebugEnabled) {
        debugLog("booking-vehicle-lookup-failed", { bookingId: booking.id, bookingVehicleSources });
      }
      return;
    }

    if (!matchingVehicleKeys.length) {
      if (isDebugEnabled) {
        debugLog("compare-booking-skip", {
          currentBookingId: debugContext.currentBookingId || "",
          comparedBookingId: booking.id,
          comparedBookingStatus: bookingDefaultStatus,
          reason: "No matching vehicle id/token with requested conflict scope",
          selectedVehicleIds: Array.from(selectedVehicleSet),
          comparedVehicleMatchKeys: bookingVehicleMatchKeys,
        });
      }
      return;
    }

    matchingVehicleKeys.forEach((vehicleId) => {
      if (!analysisVehicleIds.has(vehicleId)) return;
      const { vehicleStatusResolution, selectedStatusSource } = resolveVehicleStatusInfo({
        booking,
        bookingVehicleSources,
        vehicleId,
        vehicleStatusLookup: perVehicleStatusLookup,
        fallbackStatus: bookingDefaultStatus,
        vehicleLookup,
        selectedVehicleId: vehicleId,
        selectedVehicleStatuses,
        selectedDefaultStatus,
      });
      const effectiveStatus = vehicleStatusResolution.status;
      const vehicleDebugInfo = getVehicleDebugInfo(vehicleId, bookingVehicleSources, vehicleLookup);

      if (isDebugEnabled) {
        debugLog("compare-vehicle-status", {
          currentBookingId: debugContext.currentBookingId || "",
          comparedBookingId: booking.id,
          bookingJobStatus: bookingDefaultStatus,
          comparedBookingDateRange: [bookingStartDate, bookingEndDate],
          comparedVehicleId: vehicleId,
          vehicleName: vehicleDebugInfo.vehicleName,
          vehicleRegistration: vehicleDebugInfo.vehicleRegistration,
          vehicleLevelStatusFieldFound: vehicleStatusResolution.sourceType === "vehicleStatus",
          vehicleLevelStatusKey: vehicleStatusResolution.matchedKey,
          vehicleLevelStatusRaw:
            vehicleStatusResolution.sourceType === "vehicleStatus"
              ? vehicleStatusResolution.rawStatus
              : "",
          comparedVehicleStatusSource: vehicleStatusResolution.source,
          comparedVehicleStatusSourceType: vehicleStatusResolution.sourceType,
          comparedVehicleResolvedStatus: effectiveStatus || "",
          finalNormalizedStatus: effectiveStatus || "",
          bookingLevelStatus: bookingDefaultStatus,
          dateOverlap: overlapSet.size > 0,
          requestedVehicleMatchKeys: Array.from(selectedVehicleSet),
          requestedVehicleNormalizedMatchKeys: requestedVehicleKeys,
          requestedVehicleStatusSource: selectedStatusSource.source,
          requestedVehicleStatusSourceType: selectedStatusSource.sourceType,
          requestedVehicleStatusValue: normalizeVehicleStatus(selectedStatusSource.value),
          requestedBookingReference: debugContext.currentBookingReference || debugContext.currentBookingId || "",
          requestedBookingLabel: debugContext.currentBookingLabel || "",
          comparedBookingLabel:
            booking.production || booking.productionCompany || booking.client || booking.name || booking.id || "",
          comparedBookingReference:
            booking.quoteNumber || booking.jobNumber || booking.id || "",
          requestedExpandedDates: setToSortedArray(selectedDateSet),
          requestedStartDate: debugContext.currentStartDate || "",
          comparedVehicleMatchKeys: bookingVehicleMatchKeys,
        });
      }

      if (isDebugEnabled) {
        debugLog("booking-compared", {
          currentBookingId: debugContext.currentBookingId || "",
          comparedBookingId: booking.id,
          comparedBookingStatus: effectiveStatus,
          comparedBookingStatusSource: vehicleStatusResolution.sourceType,
          comparedBookingStartDate: bookingStartDate,
          comparedBookingEndDate: bookingEndDate,
          sameVehicle: true,
          comparedVehicleId: vehicleId,
          comparedVehicleMatchKeys: bookingVehicleMatchKeys,
          requestedVehicleMatchId: matchingVehicleKeys[0] || "",
          requestedExpandedDates: setToSortedArray(selectedDateSet),
          comparedExpandedDates: setToSortedArray(overlapSet),
        });
      }

      if (!effectiveStatus) return;

      const bookingInfo = {
        bookingId: booking.id,
        bookingLabel: resolveBookingLabel(booking),
        bookingReference: resolveBookingReference(booking),
        bookingStatus: effectiveStatus,
      };

      occupancyByVehicleDate[vehicleId] = occupancyByVehicleDate[vehicleId] || {};
      overlapSet.forEach((date) => {
        if (!occupancyByVehicleDate[vehicleId][date]) {
          occupancyByVehicleDate[vehicleId][date] = [];
        }

        occupancyByVehicleDate[vehicleId][date].push({
          ...bookingInfo,
          status: effectiveStatus,
          date,
        });
      });

      if (effectiveStatus === "Second Pencil") {
        const holdingKey = `${vehicleId}::${booking.id}`;
        const secondHolding = secondHoldingsByVehicleAndBooking[holdingKey] || {
          vehicleId,
          bookingId: booking.id,
          bookingLabel: bookingInfo.bookingLabel,
          bookingReference: bookingInfo.bookingReference,
          dates: new Set(),
        };

        overlapSet.forEach((date) => secondHolding.dates.add(date));
        secondHoldingsByVehicleAndBooking[holdingKey] = secondHolding;
      }
    });
  });

  const vehicleBlockingStatusesById = {};
  const vehicleBlockingStatusById = {};
  const bookedVehicleIds = [];
  const heldVehicleIds = [];
  const requestedConflictByVehicleId = {};
  const requestedConflictList = [];
  const blockedSecondAffectedBookings = [];
  const blockedSecondAffectedBookingsByVehicleId = {};

  Object.entries(occupancyByVehicleDate).forEach(([vehicleId, byDate]) => {
    const requestedStatus = getRequestedStatusForVehicle(vehicleId);
    const conflictsByBooking = {};
    const blockingStatuses = new Set();
    const allDateSet = new Set(Object.keys(byDate));

    Object.entries(byDate).forEach(([date, entries]) => {
      entries.forEach((entry) => {
        if (isHoldingStatus(entry.status)) {
          blockingStatuses.add(entry.status);
        }

        if (selectedDateSet.has(date)) {
          const conflict = doesStatusConflict(requestedStatus, entry.status);
          const conflictOutcome = classifyVehicleConflictOutcome(requestedStatus, entry.status);
          if (isDebugEnabled) {
            debugLog("conflict-check", {
              requestedBookingId: debugContext.currentBookingId || "",
              date,
              overlappingDates: [date],
              requestedVehicleId: vehicleId,
              requestedVehicleMatchKeys: requestedVehicleKeys,
              requestedVehicleNormalizedIds: requestedVehicleKeys,
              requestedStatus,
              requestedVehicleLevelStatusSource: selectedVehicleStatuses?.[vehicleId]
                ? `selectedVehicleStatuses.${vehicleId}`
                : "selectedDefaultStatus",
              requestedVehicleLevelStatusValue: requestedStatus,
              comparedBookingId: entry.bookingId,
              comparedVehicleId: vehicleId,
              comparedBookingLabel: entry.bookingLabel || entry.bookingReference || entry.bookingId,
              comparedBookingReference: entry.bookingReference || entry.bookingId,
              comparedExpandedDates: [date],
              comparedBookingStatus: entry.bookingStatus,
              comparedVehicleStatus: entry.status,
              comparedVehicleStatusSource: "vehicle-aware",
              conflictDetected: conflict,
              result: conflictOutcome,
              finalResult: conflict ? conflictOutcome : "allowed",
              dateOverlapDetected: true,
            });
          }

          if (conflict) {
            const byBooking = conflictsByBooking[entry.bookingId] || {
              bookingId: entry.bookingId,
              bookingLabel: entry.bookingLabel,
              bookingReference: entry.bookingReference,
              bookingStatus: entry.bookingStatus,
              dates: new Set(),
              vehicleMatchKeys: new Set(),
            };
            byBooking.dates.add(date);
            byBooking.vehicleMatchKeys.add(vehicleId);
            conflictsByBooking[entry.bookingId] = byBooking;

            if (requestedStatus === "Confirmed" && entry.status === "Second Pencil") {
              const key = `${vehicleId}::${entry.bookingId}::${entry.bookingReference}`;
              if (!blockedSecondAffectedBookings.includes(key)) {
                blockedSecondAffectedBookings.push(key);
              }

              const byVehicle = blockedSecondAffectedBookingsByVehicleId[vehicleId] || [];
              if (!byVehicle.some((item) => item.bookingId === entry.bookingId)) {
                byVehicle.push({
                  bookingId: entry.bookingId,
                  bookingLabel: entry.bookingLabel,
                  bookingReference: entry.bookingReference,
                  bookingStatus: entry.bookingStatus,
                  vehicleId,
                  vehicleMatchKeys: [vehicleId],
                  vehicleLabel: getVehicleLabel(vehicleId, vehicleLookup),
                  dateRanges: formatDateRanges([date]),
                  dateList: [date],
                });
                blockedSecondAffectedBookingsByVehicleId[vehicleId] = byVehicle;
              }
            }
          }
        }
      });
    });

    if (blockingStatuses.size) {
      const statusList = setToSortedArray(blockingStatuses);
      statusList.sort(compareStatusPriorityDesc);
      vehicleBlockingStatusesById[vehicleId] = statusList;
      vehicleBlockingStatusById[vehicleId] = statusList[0];
      bookedVehicleIds.push(vehicleId);

      const requestedHasConflict = selectedDateSet.size
        ? allDateSet.some((date) => {
            const hasConflictDate = selectedDateSet.has(date);
            if (!hasConflictDate) return false;
            return byDate[date].some((entry) => doesStatusConflict(requestedStatus, entry.status));
          })
        : false;

      if (requestedHasConflict) {
        requestedConflictByVehicleId[vehicleId] = {
          vehicleId,
          requestedStatus,
          conflicts: Object.values(conflictsByBooking)
            .map((entry) => ({
              bookingId: entry.bookingId,
              bookingLabel: entry.bookingLabel,
              bookingReference: entry.bookingReference,
              bookingStatus: entry.bookingStatus,
              dateRanges: formatDateRanges(entry.dates),
              dateList: setToSortedArray(entry.dates),
              vehicleId,
              vehicleLabel: getVehicleLabel(vehicleId, vehicleLookup),
              vehicleMatchKeys: Array.from(
                new Set([vehicleId, ...(entry.vehicleMatchKeys ? Array.from(entry.vehicleMatchKeys) : [])])
              ),
            })),
        };

        requestedConflictByVehicleId[vehicleId].conflicts.forEach((entry) => requestedConflictList.push(entry));
      }
      return;
    }

    if (allDateSet.size) heldVehicleIds.push(vehicleId);
  });

  const upgradeOpportunities = [];
  Object.entries(previousFirstLikeByVehicle).forEach(([vehicleId, prevDates]) => {
    const requestedDates = requestedFirstLikeByVehicle[vehicleId] || new Set();
    const released = differenceSets(prevDates, requestedDates);
    if (!released.size) return;

    const releasedDates = setToSortedArray(released);
    const releasedDateSet = new Set(releasedDates);

    Object.values(secondHoldingsByVehicleAndBooking)
      .filter((entry) => entry.vehicleId === vehicleId)
      .forEach((entry) => {
        const overlaps = intersectSets(entry.dates, releasedDateSet);
        if (!overlaps.size) return;

        const openDates = [];
        overlaps.forEach((date) => {
          const dayConflicts = (occupancyByVehicleDate[vehicleId]?.[date] || []).filter(
            (candidate) =>
              candidate.bookingId !== entry.bookingId &&
              isFirstLikeStatus(candidate.status)
          );

          if (!dayConflicts.length) {
            openDates.push(date);
          }
        });

        if (!openDates.length) return;

        upgradeOpportunities.push({
          vehicleId,
          vehicleLabel: getVehicleLabel(vehicleId, vehicleLookup),
          vehicleMatchKeys: [vehicleId],
          bookingId: entry.bookingId,
          bookingLabel: entry.bookingLabel,
          bookingReference: entry.bookingReference,
          bookingStatus: "Second Pencil",
          upgradableDateRanges: formatDateRanges(openDates),
          upgradableDates: setToSortedArray(openDates),
          upgradableDateCount: openDates.length,
        });
      });
  });

  const result = {
    vehicleBlockingStatusesById,
    vehicleBlockingStatusById,
    bookedVehicleIds,
    heldVehicleIds,
    requestedConflictByVehicleId,
    requestedConflictList,
    upgradeOpportunities,
    blockedSecondAffectedBookingsByVehicleId,
    blockedSecondAffectedBookings: Array.from(new Set(blockedSecondAffectedBookings)),
  };

  if (isDebugEnabled) {
    debugLog("analysis-result", {
      requestedConflictVehicles: result.requestedConflictList.length,
      bookedVehicleCount: result.bookedVehicleIds.length,
      heldVehicleCount: result.heldVehicleIds.length,
      upgradeOpportunityCount: result.upgradeOpportunities.length,
      blockedSecondBookingCount: result.blockedSecondAffectedBookings.length,
    });
  }

  return result;
};

const analyzeCurrentSecondPencilUpgradeOpportunities = ({
  allBookings = [],
  vehicleLookup = {},
  targetDates = [],
  debug = false,
  debugContext = {},
}) => {
  const scanDates = targetDates?.length ? targetDates : collectAllBookingDates(allBookings);
  const targetDateSet = toDateSet(scanDates);
  if (!targetDateSet.size) return [];

  const isDebugEnabled = Boolean(debug);
  const debugLog = (...args) => {
    if (isDebugEnabled && typeof console !== "undefined") {
      console.log("[vehicle-pencil-conflict]", ...args);
    }
  };

  const occupancyByVehicleDate = {};
  const secondHoldingsByVehicleBooking = {};
  const relevantBookings = collectDates(allBookings, scanDates);

  relevantBookings.forEach(({ booking, overlapSet }) => {
    const bookingVehicleSources = Array.isArray(booking.vehicles)
      ? booking.vehicles
      : [
          booking.vehicle,
          booking.vehicleId,
          booking.vehicleName,
          booking.registration,
          booking.reg,
          ...(typeof booking.vehicles === "string" ? [booking.vehicles] : []),
        ];
    const bookingDefaultStatus = normalizeVehicleStatus(booking.status);
    const perVehicleStatusLookup = buildVehicleStatusLookupIndex(booking.vehicleStatus || {});
    const resolvedVehicleIds = normalizeVehicleKeysListForLookup(bookingVehicleSources, vehicleLookup);
    const bookingVehicleMatchKeys = Array.from(
      new Set(collectVehicleIdentityKeys(bookingVehicleSources, vehicleLookup))
    );
    const candidateVehicleKeys = Array.from(
      new Set(
        [...resolvedVehicleIds, ...bookingVehicleMatchKeys].map((candidate) =>
          canonicalVehicleIdentityKey(candidate, vehicleLookup)
        )
      )
    ).filter(Boolean);

    candidateVehicleKeys.forEach((vehicleId) => {
      const vehicleStatusResolution = resolveVehicleStatus({
        booking,
        bookingVehicleSources,
        vehicleId,
        vehicleStatusLookup: perVehicleStatusLookup,
        fallbackStatus: bookingDefaultStatus,
        vehicleLookup,
      });
      const effectiveStatus = vehicleStatusResolution.status;
      const vehicleDebugInfo = getVehicleDebugInfo(vehicleId, bookingVehicleSources, vehicleLookup);
      if (!effectiveStatus) return;

      if (isDebugEnabled) {
        debugLog("dashboard-upgrade-scan-vehicle", {
          currentDashboardDate: debugContext.currentDate || "",
          bookingId: booking.id,
          bookingJobStatus: bookingDefaultStatus,
          vehicleId,
          vehicleName: vehicleDebugInfo.vehicleName,
          vehicleRegistration: vehicleDebugInfo.vehicleRegistration,
          vehicleLevelStatusFieldFound: vehicleStatusResolution.sourceType === "vehicleStatus",
          vehicleLevelStatusKey: vehicleStatusResolution.matchedKey,
          vehicleLevelStatusRaw:
            vehicleStatusResolution.sourceType === "vehicleStatus"
              ? vehicleStatusResolution.rawStatus
              : "",
          sourceFieldUsed: vehicleStatusResolution.source,
          finalNormalizedStatus: effectiveStatus,
          overlapDates: setToSortedArray(overlapSet),
        });
      }

      occupancyByVehicleDate[vehicleId] = occupancyByVehicleDate[vehicleId] || {};
      overlapSet.forEach((date) => {
        occupancyByVehicleDate[vehicleId][date] = occupancyByVehicleDate[vehicleId][date] || [];
        occupancyByVehicleDate[vehicleId][date].push({
          bookingId: booking.id,
          bookingLabel: resolveBookingLabel(booking),
          bookingReference: resolveBookingReference(booking),
          status: effectiveStatus,
          date,
        });
      });

      if (effectiveStatus === "Second Pencil") {
        const key = `${vehicleId}::${booking.id}`;
        const entry = secondHoldingsByVehicleBooking[key] || {
          vehicleId,
          vehicleLabel: getVehicleLabel(vehicleId, vehicleLookup),
          bookingId: booking.id,
          bookingLabel: resolveBookingLabel(booking),
          bookingReference: resolveBookingReference(booking),
          dates: new Set(),
        };
        overlapSet.forEach((date) => entry.dates.add(date));
        secondHoldingsByVehicleBooking[key] = entry;
      }
    });
  });

  const opportunities = [];
  Object.values(secondHoldingsByVehicleBooking).forEach((entry) => {
    const openDates = [];
    entry.dates.forEach((date) => {
      const firstLikeAhead = (occupancyByVehicleDate[entry.vehicleId]?.[date] || []).some(
        (candidate) =>
          candidate.bookingId !== entry.bookingId &&
          isFirstLikeStatus(candidate.status)
      );
      if (!firstLikeAhead) openDates.push(date);
    });
    if (!openDates.length) return;
    opportunities.push({
      vehicleId: entry.vehicleId,
      vehicleLabel: entry.vehicleLabel,
      bookingId: entry.bookingId,
      bookingLabel: entry.bookingLabel,
      bookingReference: entry.bookingReference,
      bookingStatus: "Second Pencil",
      upgradableDateRanges: formatDateRanges(openDates),
      upgradableDates: setToSortedArray(openDates),
      upgradableDateCount: openDates.length,
    });
  });

  if (isDebugEnabled) {
    debugLog("dashboard-upgrade-scan-result", {
      opportunityCount: opportunities.length,
      bookingIds: opportunities.map((item) => item.bookingId),
    });
  }

  return opportunities;
};

export {
  analyzeVehiclePencilConflicts,
  analyzeCurrentSecondPencilUpgradeOpportunities,
  normalizeVehicleStatus,
  doesStatusConflict,
  expandBookingDates,
  formatDateRanges,
  statusPriority,
};
