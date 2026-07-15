const normalizeText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const compactText = (value) =>
  normalizeText(value).replace(/[^a-z0-9]/g, "");

const toYmd = (value) => {
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

const uniqueSorted = (values = []) =>
  Array.from(new Set((values || []).map((value) => String(value || "").slice(0, 10)).filter(Boolean))).sort();

const expandBookingDates = (booking = {}) => {
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
};

const intersectDates = (left = [], right = []) => {
  const rightSet = new Set(uniqueSorted(right));
  return uniqueSorted(left).filter((date) => rightSet.has(date));
};

const buildDateRanges = (dates = []) => {
  const sorted = uniqueSorted(dates);
  if (!sorted.length) return [];
  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index];
    const prevDate = parseYmd(end);
    const nextDate = parseYmd(next);
    if (prevDate && nextDate && (nextDate.getTime() - prevDate.getTime()) / 86400000 === 1) {
      end = next;
      continue;
    }
    ranges.push(start === end ? start : `${start} to ${end}`);
    start = next;
    end = next;
  }

  ranges.push(start === end ? start : `${start} to ${end}`);
  return ranges;
};

const addIdentityKey = (keys, type, value) => {
  const compact = compactText(value);
  if (compact) keys.add(`${type}:${compact}`);
};

const crewIdentity = (crew) => {
  const source = crew && typeof crew === "object" ? crew : { name: crew };
  const keys = new Set();
  addIdentityKey(keys, "employeeId", source.id || source.employeeId || source.uid || source.userId);
  addIdentityKey(keys, "employeeCode", source.code || source.employeeCode || source.userCode);
  addIdentityKey(keys, "email", source.email || source.emailAddress);
  addIdentityKey(keys, "name", source.name || source.employeeName || source.displayName || crew);
  const label =
    source.name ||
    source.employeeName ||
    source.displayName ||
    source.email ||
    source.employeeCode ||
    source.code ||
    String(crew || "").trim();
  return { keys: Array.from(keys), label: String(label || "").trim() };
};

const assetIdentity = (asset) => {
  const source = asset && typeof asset === "object" ? asset : { name: asset };
  const keys = new Set();
  addIdentityKey(keys, "assetId", source.id || source.equipmentId || source.assetId || source.trailerId || source.vehicleId);
  addIdentityKey(keys, "registration", source.registration || source.reg || source.serialNumber || source.serial || source.numberPlate);
  addIdentityKey(keys, "name", source.name || source.label || source.assetName || source.equipmentName || asset);
  const label =
    source.name ||
    source.label ||
    source.assetName ||
    source.equipmentName ||
    source.registration ||
    source.serialNumber ||
    String(asset || "").trim();
  return { keys: Array.from(keys), label: String(label || "").trim() };
};

const buildAssignmentsByDate = ({ dates = [], resources = [], resourcesByDate = {}, identityFn }) => {
  const dateKeys = uniqueSorted(dates);
  const result = {};
  dateKeys.forEach((date) => {
    const dateResources =
      resourcesByDate && Array.isArray(resourcesByDate[date]) && resourcesByDate[date].length
        ? resourcesByDate[date]
        : resources;
    result[date] = (Array.isArray(dateResources) ? dateResources : [])
      .map(identityFn)
      .filter((entry) => entry.keys.length && entry.label);
  });
  return result;
};

const resolveBookingLabel = (booking = {}) =>
  booking.production ||
  booking.client ||
  booking.productionCompany ||
  booking.company ||
  booking.name ||
  "Unknown booking";

const resolveBookingReference = (booking = {}) => booking.quoteNumber || booking.jobNumber || booking.id || "Booking";

const NON_RESOURCE_HOLDING_STATUSES = new Set([
  "cancelled",
  "canceled",
  "lost",
  "postponed",
  "deleted",
  "complete",
  "completed",
  "dnh",
  "enquiry",
]);

const isResourceHoldingBooking = (booking = {}) => {
  const status = normalizeText(booking.status);
  if (!status) return true;
  return !NON_RESOURCE_HOLDING_STATUSES.has(status);
};

const shouldDebug = (debug, localStorageKey) => {
  if (debug) return true;
  if (typeof window === "undefined" || !localStorageKey) return false;
  try {
    return window.localStorage.getItem(localStorageKey) === "1";
  } catch {
    return false;
  }
};

const findResourceConflicts = ({
  type,
  currentAssignmentsByDate,
  comparedBookings,
  comparedDatesByBooking,
  comparedResourcesForBooking,
  identityFn,
  currentBookingLabel,
  debugLog,
}) => {
  const conflictsByKey = {};

  comparedBookings.forEach((booking) => {
    const comparedDates = comparedDatesByBooking(booking);
    const overlapDates = intersectDates(Object.keys(currentAssignmentsByDate), comparedDates);
    const comparedAssignments = buildAssignmentsByDate({
      dates: overlapDates,
      resources: comparedResourcesForBooking(booking),
      resourcesByDate: type === "crew" ? booking.employeesByDate : {},
      identityFn,
    });

    overlapDates.forEach((date) => {
      const currentResources = currentAssignmentsByDate[date] || [];
      const comparedResources = comparedAssignments[date] || [];
      currentResources.forEach((current) => {
        comparedResources.forEach((compared) => {
          const matchedKey = current.keys.find((key) => compared.keys.includes(key));
          const matched = Boolean(matchedKey);
          debugLog("resource-compare", {
            type,
            date,
            currentBookingLabel,
            currentResource: current.label,
            comparedBookingId: booking.id || "",
            comparedBookingLabel: resolveBookingLabel(booking),
            comparedBookingStatus: booking.status || "",
            comparedBookingDateRange: buildDateRanges(comparedDates),
            comparedResource: compared.label,
            matchedResourceIdentity: matchedKey || "",
            overlapDetected: true,
            finalConflictResult: matched ? "blocked" : "allowed",
          });
          if (!matched) return;

          const conflictKey = `${type}:${matchedKey}:${booking.id || resolveBookingReference(booking)}`;
          const existing = conflictsByKey[conflictKey] || {
            type,
            resourceLabel: current.label || compared.label,
            currentBookingLabel,
            conflictingBookingId: booking.id || "",
            conflictingBookingLabel: resolveBookingLabel(booking),
            conflictingBookingReference: resolveBookingReference(booking),
            conflictingBookingStatus: booking.status || "",
            matchedIdentity: matchedKey,
            dates: new Set(),
          };
          existing.dates.add(date);
          conflictsByKey[conflictKey] = existing;
        });
      });
    });
  });

  return Object.values(conflictsByKey).map((entry) => ({
    ...entry,
    dateList: uniqueSorted(entry.dates),
    dateRanges: buildDateRanges(entry.dates),
    dates: undefined,
  }));
};

export const formatResourceConflictLines = (conflicts = []) =>
  conflicts.map((conflict) => {
    const resourceType = conflict.type === "crew" ? "Crew" : "Equipment";
    const dateLabel = conflict.dateRanges?.length ? conflict.dateRanges.join(", ") : "selected date(s)";
    return `${resourceType}: ${conflict.resourceLabel} on ${conflict.currentBookingLabel} conflicts with ${conflict.conflictingBookingLabel} (${conflict.conflictingBookingReference}) on ${dateLabel}. Status: ${conflict.conflictingBookingStatus || "Unknown"}.`;
  });

export const analyzeResourceConflicts = ({
  allBookings = [],
  selectedDates = [],
  selectedCrew = [],
  selectedCrewByDate = {},
  selectedEquipment = [],
  excludeBookingId = "",
  currentBookingLabel = "Current booking",
  debug = false,
  debugContext = {},
}) => {
  const dateKeys = uniqueSorted(selectedDates);
  const isDebugEnabled = shouldDebug(debug, "debugResourceConflicts");
  const debugLog = (...args) => {
    if (isDebugEnabled && typeof console !== "undefined") {
      console.log("[resource-conflict]", ...args);
    }
  };

  const comparedBookings = (Array.isArray(allBookings) ? allBookings : []).filter(
    (booking) =>
      booking?.id &&
      (!excludeBookingId || booking.id !== excludeBookingId) &&
      isResourceHoldingBooking(booking)
  );

  const crewAssignmentsByDate = buildAssignmentsByDate({
    dates: dateKeys,
    resources: selectedCrew,
    resourcesByDate: selectedCrewByDate,
    identityFn: crewIdentity,
  });
  const equipmentAssignmentsByDate = buildAssignmentsByDate({
    dates: dateKeys,
    resources: selectedEquipment,
    identityFn: assetIdentity,
  });

  debugLog("analysis-start", {
    currentBookingId: debugContext.currentBookingId || "",
    selectedDates: dateKeys,
    assignedCrew: Object.values(crewAssignmentsByDate).flat().map((entry) => entry.label),
    assignedEquipment: Object.values(equipmentAssignmentsByDate).flat().map((entry) => entry.label),
    comparedBookingCount: comparedBookings.length,
  });

  const crewConflicts = findResourceConflicts({
    type: "crew",
    currentAssignmentsByDate: crewAssignmentsByDate,
    comparedBookings,
    comparedDatesByBooking: expandBookingDates,
    comparedResourcesForBooking: (booking) => booking.employees || [],
    identityFn: crewIdentity,
    currentBookingLabel,
    debugLog,
  });

  const equipmentConflicts = findResourceConflicts({
    type: "equipment",
    currentAssignmentsByDate: equipmentAssignmentsByDate,
    comparedBookings,
    comparedDatesByBooking: expandBookingDates,
    comparedResourcesForBooking: (booking) => booking.equipment || [],
    identityFn: assetIdentity,
    currentBookingLabel,
    debugLog,
  });

  const result = {
    crewConflicts,
    equipmentConflicts,
    hasBlockingConflicts: crewConflicts.length > 0 || equipmentConflicts.length > 0,
    warnings: [],
    debug: {
      selectedDateCount: dateKeys.length,
      comparedBookingCount: comparedBookings.length,
    },
  };

  debugLog("analysis-result", {
    currentBookingId: debugContext.currentBookingId || "",
    crewConflictCount: crewConflicts.length,
    equipmentConflictCount: equipmentConflicts.length,
    hasBlockingConflicts: result.hasBlockingConflicts,
  });

  return result;
};
