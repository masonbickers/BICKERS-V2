import {
  getConfiguredMaintenanceFrequencyWeeks,
  isVehicleOutOfUse,
} from "../utils/maintenanceSchema.js";
import {
  getHgvComplianceDueDates,
  isHgvComplianceTypeEnabled,
  isHgvComplianceVehicle,
  isOffFleetVehicle,
} from "../utils/hgvCompliance.js";
import {
  getMaintenanceRecordDisplayDates,
  selectCanonicalMaintenanceBookings,
} from "../utils/maintenanceCalendar.js";
import { isAutomaticComplianceVorPeriod } from "../utils/vorPeriods.js";

export const normalizeRegistration = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export const importedPlannerEventKey = (event = {}) =>
  [
    "pdf",
    Number(event.year || 0),
    Number(event.week || 0),
    normalizeRegistration(event.registration),
    toIsoDate(event.date),
    String(event.type || "imported").trim().toLowerCase(),
  ].join("|");

export const isImportedPlannerEventHidden = (vehicle = {}, event = {}) => {
  const hiddenKeys = Array.isArray(vehicle?.hgvPlannerHiddenImportedEventKeys)
    ? vehicle.hgvPlannerHiddenImportedEventKeys
    : [];
  return hiddenKeys.includes(importedPlannerEventKey(event));
};

const canonicalPlannerIdentity = (event = {}) =>
  String(
    event.bookingId ||
    event.requirementKey ||
    `${event.source || "canonical"}|${event.registration}|${event.date}|${event.type}`
  );

const PMI_CADENCE_MIN_DAYS = 49;
const PMI_CADENCE_MAX_DAYS = 63;

const daysBetweenPlannerDates = (left, right) => {
  const leftDate = parseIsoDate(left);
  const rightDate = parseIsoDate(right);
  if (!leftDate || !rightDate) return null;
  return Math.round((rightDate.getTime() - leftDate.getTime()) / 86400000);
};

const importedCadenceEvidence = (event, cadenceEvents = []) => {
  const registration = normalizeRegistration(event?.registration);
  const eventDate = toIsoDate(event?.date);
  if (!registration || !eventDate || event?.type !== "imported") return null;

  const sequence = (Array.isArray(cadenceEvents) ? cadenceEvents : [])
    .filter(
      (candidate) =>
        candidate?.type === "imported" &&
        normalizeRegistration(candidate?.registration) === registration &&
        toIsoDate(candidate?.date)
    )
    .sort((left, right) => toIsoDate(left.date).localeCompare(toIsoDate(right.date)));
  const index = sequence.findIndex(
    (candidate) =>
      candidate === event ||
      (candidate?.id && event?.id && candidate.id === event.id)
  );
  if (index <= 0 || index >= sequence.length - 1) return null;

  const previousDate = toIsoDate(sequence[index - 1]?.date);
  const nextDate = toIsoDate(sequence[index + 1]?.date);
  const previousGapDays = daysBetweenPlannerDates(previousDate, eventDate);
  const nextGapDays = daysBetweenPlannerDates(eventDate, nextDate);
  const withinCadence = (days) =>
    Number.isFinite(days) &&
    days >= PMI_CADENCE_MIN_DAYS &&
    days <= PMI_CADENCE_MAX_DAYS;

  return withinCadence(previousGapDays) && withinCadence(nextGapDays)
    ? { previousDate, nextDate, previousGapDays, nextGapDays }
    : null;
};

const inferImportedPmiAlongsideMot = (event, matches, cadenceEvents) => {
  if (!matches.length || matches.some((match) => match?.type !== "mot")) return null;
  const cadence = importedCadenceEvidence(event, cadenceEvents);
  if (!cadence) return null;

  return {
    event: {
      ...event,
      id: `${event.id || importedPlannerEventKey(event)}-inferred-pmi`,
      type: "inspection",
      status: "completed",
      source: "imported_pmi_cadence",
      sourceEventKey: importedPlannerEventKey(event),
      label: "PMI completed - inferred from the surrounding eight-week PDF cadence",
      inferred: true,
    },
    matches,
    cadence,
    reason: "eight_week_pmi_cadence_alongside_mot",
  };
};

const importedVorHistoryMatches = (event = {}, vehicle = {}) => {
  const eventDate = toIsoDate(event.date);
  const eventWeek = getIsoWeekParts(eventDate);
  return (Array.isArray(vehicle?.vorHistory) ? vehicle.vorHistory : [])
    .filter(isVisibleVorPeriod)
    .filter((period) => {
      const start = toIsoDate(period?.offRoadDate || period?.startedAt);
      const end = toIsoDate(period?.returnedDate || period?.completedAt) || "9999-12-31";
      if (!start || !eventDate) return false;
      if (eventDate >= start && eventDate <= end) return true;
      const startWeek = getIsoWeekParts(start);
      return Boolean(
        eventWeek && startWeek && eventWeek.year === startWeek.year && eventWeek.week === startWeek.week
      );
    });
};

/**
 * Reconciles immutable Excel/PDF evidence against canonical bookings and vehicle history.
 * Explicit imported-entry exclusions remain a separate audited bucket and are never lost.
 */
export function reconcileImportedPlannerEvents({
  importedEvents = [],
  canonicalEvents = [],
  cadenceEvents = importedEvents,
  vehicles = [],
} = {}) {
  const vehiclesByRegistration = new Map(
    (Array.isArray(vehicles) ? vehicles : []).map((vehicle) => [
      resolveVehicleRegistration(vehicle),
      vehicle,
    ])
  );
  const result = { unmatched: [], represented: [], inferred: [], ambiguous: [], excluded: [] };

  (Array.isArray(importedEvents) ? importedEvents : []).forEach((event) => {
    const registration = normalizeRegistration(event?.registration);
    const vehicle = vehiclesByRegistration.get(registration);
    if (isImportedPlannerEventHidden(vehicle, event)) {
      result.excluded.push({ event, exclusionKey: importedPlannerEventKey(event) });
      return;
    }

    if (event?.type === "imported_vor") {
      const matches = importedVorHistoryMatches(event, vehicle);
      if (matches.length === 1) result.represented.push({ event, matches });
      else if (matches.length > 1) result.ambiguous.push({ event, matches, reason: "multiple_vor_periods" });
      else result.unmatched.push(event);
      return;
    }

    const eventDate = toIsoDate(event?.date);
    const eventWeek = getIsoWeekParts(eventDate);
    const candidates = (Array.isArray(canonicalEvents) ? canonicalEvents : []).filter((candidate) => {
      if (normalizeRegistration(candidate?.registration) !== registration) return false;
      const candidateDate = toIsoDate(candidate?.date);
      if (candidateDate === eventDate) return true;
      const candidateWeek = getIsoWeekParts(candidateDate);
      return Boolean(
        eventWeek && candidateWeek && eventWeek.year === candidateWeek.year && eventWeek.week === candidateWeek.week
      );
    });
    const identities = new Map();
    candidates.forEach((candidate) => {
      const key = canonicalPlannerIdentity(candidate);
      identities.set(key, [...(identities.get(key) || []), candidate]);
    });
    const matches = [...identities.values()];
    if (matches.length === 1) {
      const inferred = inferImportedPmiAlongsideMot(event, matches[0], cadenceEvents);
      if (inferred) result.inferred.push(inferred);
      else result.represented.push({ event, matches: matches[0] });
    }
    else if (matches.length > 1) result.ambiguous.push({ event, matches: matches.flat(), reason: "multiple_canonical_records" });
    else result.unmatched.push(event);
  });

  return result;
}

export function orderPlannerRegistrations(registrations = [], preferredOrder = []) {
  const unique = [...new Set(
    (Array.isArray(registrations) ? registrations : [])
      .map(normalizeRegistration)
      .filter(Boolean)
  )];
  const preferredRank = new Map(
    (Array.isArray(preferredOrder) ? preferredOrder : [])
      .map(normalizeRegistration)
      .filter(Boolean)
      .map((registration, index) => [registration, index])
  );

  return unique.sort((left, right) => {
    const leftRank = preferredRank.get(left);
    const rightRank = preferredRank.get(right);
    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
    if (leftRank !== undefined) return -1;
    if (rightRank !== undefined) return 1;
    return left.localeCompare(right);
  });
}

export function applyPlannerRegistrationOrder(registrations = [], preferredOrder = []) {
  const available = [...new Set(
    (Array.isArray(registrations) ? registrations : [])
      .map(normalizeRegistration)
      .filter(Boolean)
  )];
  const availableSet = new Set(available);
  const preferred = [...new Set(
    (Array.isArray(preferredOrder) ? preferredOrder : [])
      .map(normalizeRegistration)
      .filter((registration) => availableSet.has(registration))
  )];
  const preferredSet = new Set(preferred);

  return [
    ...preferred,
    ...available.filter((registration) => !preferredSet.has(registration)),
  ];
}

export function orderPlannerRegistrationsByFleet(
  registrations = [],
  vehiclesByRegistration = new Map(),
  statusesByRegistration = new Map(),
  preferredOrder = []
) {
  const stableOrder = orderPlannerRegistrations(registrations, preferredOrder);
  const stableRank = new Map(stableOrder.map((registration, index) => [registration, index]));
  const fleetRank = (registration) => {
    const vehicle = vehiclesByRegistration.get(registration) || {};
    const status = String(statusesByRegistration.get(registration) || "ACTIVE").trim().toUpperCase();
    const label = String([
      resolveVehicleLabel(vehicle),
      vehicle.category,
      vehicle.vehicleType,
      vehicle.assetType,
    ].filter(Boolean).join(" ")).toLowerCase();
    const offFleet = status === "OFF FLEET" || isOffFleetVehicle(vehicle);
    const trailer = /\btrailer\b/.test(label);
    return {
      group: offFleet ? 2 : trailer ? 1 : 0,
      lifecycle: status === "VOR" ? 1 : 0,
    };
  };

  return [...stableOrder].sort((left, right) => {
    const leftRank = fleetRank(left);
    const rightRank = fleetRank(right);
    return leftRank.group - rightRank.group ||
      leftRank.lifecycle - rightRank.lifecycle ||
      stableRank.get(left) - stableRank.get(right);
  });
}

export const toIsoDate = (value) => {
  if (!value) return "";
  if (typeof value?.toDate === "function") return toIsoDate(value.toDate());
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = text.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);
  if (uk) return `${uk[3]}-${uk[2]}-${uk[1]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : toIsoDate(parsed);
};

export const parseIsoDate = (value) => {
  const match = toIsoDate(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getIsoWeekParts = (value) => {
  const source = parseIsoDate(value);
  if (!source) return null;
  const date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year, week };
};

export const isVorPeriodStartingInIsoWeek = (period = {}, year, week) => {
  const start = getIsoWeekParts(period?.offRoadDate || period?.startedAt);
  return Boolean(start && start.year === Number(year) && start.week === Number(week));
};

export const weeksInIsoYear = (year) =>
  getIsoWeekParts(`${Number(year)}-12-28`)?.week || 52;

const isoWeekRange = (year, week) => {
  const januaryFourth = new Date(Number(year), 0, 4, 12);
  const januaryFourthDay = januaryFourth.getDay() || 7;
  const start = new Date(januaryFourth);
  start.setDate(januaryFourth.getDate() - januaryFourthDay + 1 + (Number(week) - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
};

const isVisibleVorPeriod = (record = {}) =>
  !["archived", "deleted", "superseded"].includes(
    String(record?.status || "").trim().toLowerCase()
  );

const vorPeriodIdentity = (record = {}) => {
  const id = String(record?.id || "").trim();
  if (id) return `id:${id}`;

  const start = toIsoDate(record?.offRoadDate || record?.startedAt);
  const end = toIsoDate(record?.returnedDate || record?.completedAt) || "open";
  return start ? `dates:${start}:${end}` : "";
};

export function vorHistoryPeriodsForIsoWeek(vehicle, year, week) {
  const range = isoWeekRange(year, week);
  const matchingPeriods = (Array.isArray(vehicle?.vorHistory) ? vehicle.vorHistory : [])
    .filter(isVisibleVorPeriod)
    .filter((record) => {
      const start = parseIsoDate(record?.offRoadDate || record?.startedAt);
      const end = parseIsoDate(record?.returnedDate || record?.completedAt);
      return (
        start &&
        start.getTime() <= range.end.getTime() &&
        (!end || end.getTime() >= range.start.getTime())
      );
    });

  const uniquePeriods = new Map();
  matchingPeriods.forEach((record, index) => {
    uniquePeriods.set(vorPeriodIdentity(record) || `record:${index}`, record);
  });
  return [...uniquePeriods.values()];
}

export function vorHistoryStatusForIsoWeek(vehicle, year, week) {
  return vorHistoryPeriodsForIsoWeek(vehicle, year, week).length ? "VOR" : "";
}

export function isReturnInspectionScheduledForIsoWeek(vehicle, year, week) {
  const pending = vehicle?.pendingReturnInspection || {};
  const pendingStatus = String(pending.status || "").trim().toLowerCase();
  const inspectionDates = [
    ...(["inspection_required", "pending"].includes(pendingStatus)
      ? [pending.inspectionDate]
      : []),
    ...(Array.isArray(vehicle?.vorHistory) ? vehicle.vorHistory : [])
      .filter(isVisibleVorPeriod)
      .flatMap((period) => [
        period?.firstUseInspectionDate,
        period?.plannedReturnInspectionDate,
      ]),
  ].filter(Boolean);
  return inspectionDates.some((inspectionDate) => {
    const inspectionWeek = getIsoWeekParts(inspectionDate);
    return Boolean(
      inspectionWeek &&
        inspectionWeek.year === Number(year) &&
        inspectionWeek.week === Number(week)
    );
  });
}

export function vehicleStatusForIsoWeek(
  vehicle,
  status,
  year,
  week,
  useWholeYearStatus = false,
  completedInspectionDates = [],
  asOfDate = new Date()
) {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  if (normalizedStatus === "OFF FLEET") return "OFF FLEET";
  // The booked first-use inspection week is the planner transition week. The
  // vehicle remains canonically VOR until completion, but the weekly planner
  // must not paint that same ISO week as unavailable.
  if (isReturnInspectionScheduledForIsoWeek(vehicle, year, week)) return "";
  const targetWeekStart = isoWeekRange(year, week).start.getTime();
  const currentWeek = getIsoWeekParts(asOfDate);
  const currentWeekStart = currentWeek
    ? isoWeekRange(currentWeek.year, currentWeek.week).start.getTime()
    : null;
  const completionDates = Array.isArray(completedInspectionDates)
    ? completedInspectionDates
    : [];
  const priorCompletionDates = completionDates.filter((dateValue) => {
    const parts = getIsoWeekParts(dateValue);
    return Boolean(
      parts && isoWeekRange(parts.year, parts.week).start.getTime() < targetWeekStart
    );
  });
  const historicPeriods = vorHistoryPeriodsForIsoWeek(vehicle, year, week);
  const isStaleAutomaticVor =
    historicPeriods.length > 0 &&
    historicPeriods.every(
      (period) =>
        String(period?.status || "").trim().toLowerCase() === "open" &&
        isAutomaticComplianceVorPeriod(period)
    ) &&
    priorCompletionDates.length > 0 &&
    hasActiveInspectionWindow(
      priorCompletionDates,
      year,
      week,
      vehicle?.pmiFreq || 8
    );
  if (historicPeriods.length > 0 && !isStaleAutomaticVor) return "VOR";

  // Reconstruct only elapsed compliance gaps. Once an eight-week inspection
  // window has expired, past weeks remain VOR until the next completed PMI.
  // Current and future weeks still rely on live/recorded VOR state so the
  // planner never predicts a future VOR prematurely.
  const isElapsedWeek = currentWeekStart !== null && targetWeekStart < currentWeekStart;
  if (
    isElapsedWeek &&
    priorCompletionDates.length > 0 &&
    !hasActiveInspectionWindow(
      priorCompletionDates,
      year,
      week,
      vehicle?.pmiFreq || 8
    )
  ) {
    return "VOR";
  }

  if (normalizedStatus !== "VOR") return "";
  const hasRecordedPeriods = (Array.isArray(vehicle?.vorHistory) ? vehicle.vorHistory : [])
    .filter(isVisibleVorPeriod)
    .some((record) => parseIsoDate(record?.offRoadDate || record?.startedAt));
  void useWholeYearStatus;
  return !hasRecordedPeriods ? "VOR" : "";
}

export function hgvComplianceStatusForIsoWeek(
  vehicle,
  status,
  year,
  week,
  useWholeYearStatus = false,
  completedInspectionDates = []
) {
  const baseStatus = vehicleStatusForIsoWeek(
    vehicle,
    status,
    year,
    week,
    useWholeYearStatus,
    completedInspectionDates
  );
  return baseStatus;
}

export function plannerStartingVorPeriodsForIsoWeek(
  vehicle,
  status,
  year,
  week,
  useWholeYearStatus = false,
  completedInspectionDates = [],
  asOfDate = new Date()
) {
  const effectiveStatus = vehicleStatusForIsoWeek(
    vehicle,
    status,
    year,
    week,
    useWholeYearStatus,
    completedInspectionDates,
    asOfDate
  );
  if (effectiveStatus !== "VOR") return [];
  return vorHistoryPeriodsForIsoWeek(vehicle, year, week).filter((period) =>
    isVorPeriodStartingInIsoWeek(period, year, week)
  );
}

export function buildPlannerInspectionEvidenceDates(
  completedDatesByRegistration = new Map(),
  importedEvidenceEvents = []
) {
  const result = new Map(
    [...completedDatesByRegistration.entries()].map(([registration, dates]) => [
      normalizeRegistration(registration),
      [...new Set((Array.isArray(dates) ? dates : []).map(toIsoDate).filter(Boolean))].sort(),
    ])
  );

  (Array.isArray(importedEvidenceEvents) ? importedEvidenceEvents : []).forEach((event) => {
    if (!["imported", "inspection", "inspection_brake"].includes(event?.type)) return;
    if (event?.type !== "imported" && event?.status !== "completed") return;
    const registration = normalizeRegistration(event?.registration);
    const date = toIsoDate(event?.date);
    if (!registration || !date) return;
    result.set(
      registration,
      [...new Set([...(result.get(registration) || []), date])].sort()
    );
  });

  return result;
}

/**
 * Returns true for the first ISO week of a recorded VOR period or an elapsed
 * historical inspection gap. It never forecasts a future VOR marker.
 */
export function isComplianceVorStartingInIsoWeek(
  vehicle,
  status,
  year,
  week,
  completedInspectionDates = []
) {
  const currentStatus = hgvComplianceStatusForIsoWeek(
    vehicle,
    status,
    year,
    week,
    false,
    completedInspectionDates
  );
  if (currentStatus !== "VOR") return false;

  const previousWeekDate = isoWeekRange(year, week).start;
  previousWeekDate.setDate(previousWeekDate.getDate() - 7);
  const previousWeek = getIsoWeekParts(previousWeekDate);
  if (!previousWeek) return false;

  return hgvComplianceStatusForIsoWeek(
    vehicle,
    status,
    previousWeek.year,
    previousWeek.week,
    false,
    completedInspectionDates
  ) !== "VOR";
}

export const formatDate = (value) => {
  const date = parseIsoDate(value);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";
};

const addWeeks = (value, weeks) => {
  const date = parseIsoDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + Number(weeks || 0) * 7);
  return toIsoDate(date);
};

const addYears = (value, years) => {
  const date = parseIsoDate(value);
  if (!date) return "";
  date.setFullYear(date.getFullYear() + Number(years || 0));
  return toIsoDate(date);
};

const firstDate = (...values) => values.map(toIsoDate).find(Boolean) || "";

const historyContainsVehicleCreationDate = (histories, dateValue) => {
  const date = toIsoDate(dateValue);
  if (!date) return false;
  return histories.some((history) =>
    (Array.isArray(history) ? history : []).some(
      (entry) =>
        String(entry?.source || "").trim().toLowerCase() === "vehicle_creation" &&
        firstDate(entry?.completedDate, entry?.date, entry?.inspectionDate) === date
    )
  );
};

export function resolveVehicleRegistration(vehicle = {}) {
  return normalizeRegistration(
    vehicle.registration ||
      vehicle.reg ||
      vehicle.regNumber ||
      vehicle.regNo ||
      vehicle.plate ||
      vehicle.numberPlate
  );
}

export function resolveVehicleLabel(vehicle = {}, fallback = "") {
  return String(
    vehicle.assetLabel ||
      vehicle.name ||
      vehicle.vehicleName ||
      [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ") ||
      fallback
  ).trim();
}

const plannerMaintenanceType = (type) => {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "mot") return "MOT";
  if (normalized === "service") return "SERVICE";
  return "INSPECTION";
};

const plannerMaintenanceTypeIds = (type) => {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "mot") return ["mot"];
  if (normalized === "service") return ["service"];
  if (normalized === "brake") return ["brake_test"];
  if (normalized === "inspection_brake") return ["pmi", "brake_test"];
  return ["pmi"];
};

const plannerSourceLabel = (event = {}, hasBooking = false) => {
  if (hasBooking) return "Saved maintenance booking";
  if (event.source === "imported_pmi_cadence") return "Inferred from imported eight-week PMI cadence";
  if (event.source === "year_ahead_forecast") return "12-month forward inspection plan";
  if (event.source === "vehicle_last_completed_date") return "Recorded vehicle completion date";
  if (event.status === "completed") return "Completed maintenance history";
  if (event.status === "due") return "Calculated due date";
  if (event.status === "projected") return "Auto-projected schedule";
  if (event.type === "imported" || event.type === "imported_vor") return "Imported planner history";
  return "Vehicle maintenance schedule";
};

const formatPlannerEventLabel = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bMot\b/g, "MOT")
    .replace(/\bPmi\b/g, "PMI")
    .replace(/\bVor\b/g, "VOR")
    .replace(/\bDvsa\b/g, "DVSA");

export function buildPlannerMaintenanceModalEvent({ event = {}, vehicle = null, booking = null } = {}) {
  const bookingId = String(event.bookingId || booking?.id || "").trim();
  const vehicleId = String(booking?.vehicleId || vehicle?.id || "").trim();
  const registration = normalizeRegistration(
    event.registration || booking?.registration || resolveVehicleRegistration(vehicle || {})
  );

  if (bookingId) {
    return {
      ...event,
      ...(booking || {}),
      id: bookingId,
      __parentId: bookingId,
      __collection: "maintenanceBookings",
      kind: "",
      vehicleId,
      registration,
      plannerSourceLabel: plannerSourceLabel(event, true),
      disableBookingActions: false,
    };
  }

  const status = String(event.status || "recorded").trim().toLowerCase();
  const isScheduleEntry = ["due", "projected", "requested", "planned", "booked"].includes(status);
  const maintenanceType = plannerMaintenanceType(event.type);
  const vehicleName = resolveVehicleLabel(vehicle || {}, registration || "Unknown vehicle");

  return {
    ...event,
    id: "",
    plannerEventId: String(event.id || ""),
    plannerEventKey: String(event.sourceEventKey || importedPlannerEventKey(event)),
    __collection: isScheduleEntry ? "vehicleDueDates" : "hgvPlannerHistory",
    kind: isScheduleEntry ? maintenanceType : "",
    maintenanceType,
    maintenanceTypeIds: plannerMaintenanceTypeIds(event.type),
    vehicleId,
    registration,
    title: vehicleName,
    notes: formatPlannerEventLabel(event.label),
    start: event.date,
    dueDate: isScheduleEntry ? event.date : "",
    completedAtISO: status === "completed" ? event.date : "",
    bookingStatus: event.status || "Recorded",
    vehicles: vehicleId
      ? [{ id: vehicleId, name: vehicleName, registration }]
      : [],
    plannerSourceLabel: plannerSourceLabel(event, false),
    disableBookingActions: event.isLegalDueReference ? true : !isScheduleEntry,
  };
}

const bookingTypes = (booking = {}) => {
  const ids = [
    ...(Array.isArray(booking.maintenanceTypeIds) ? booking.maintenanceTypeIds : []),
    ...(Array.isArray(booking.items)
      ? booking.items.map((item) => item?.maintenanceTypeId)
      : []),
  ].map((item) => String(item || "").trim().toLowerCase());
  const selected = [];
  if (ids.includes("pmi") || ids.includes("eight_week_inspection")) selected.push("inspection");
  if (ids.includes("brake_test")) selected.push("brake");
  if (ids.includes("mot")) selected.push("mot");
  if (ids.includes("service")) selected.push("service");
  if (selected.length) return [...new Set(selected)];
  const type = String(
    booking.type || booking.maintenanceType || booking.category || booking.title || ""
  ).toUpperCase();
  if (type.includes("BRAKE")) return ["brake"];
  if (type.includes("MOT")) return ["mot"];
  if (type.includes("SERVICE")) return ["service"];
  if (type.includes("INSPECTION") || type.includes("PMI")) return ["inspection"];
  return [];
};

const bookingDate = (booking = {}) =>
  getMaintenanceRecordDisplayDates(booking).displayDateISO;

export function buildCompletedInspectionDates({
  vehicles = [],
  bookings = [],
  registrations = [],
  asOfDate = new Date(),
}) {
  const allowed = new Set(registrations.map(normalizeRegistration));
  const todayISO = toIsoDate(asOfDate);
  const vehicleById = new Map();
  const datesByRegistration = new Map();
  const add = (registrationValue, dateValue) => {
    const registration = normalizeRegistration(registrationValue);
    const date = toIsoDate(dateValue);
    if (
      !registration ||
      !date ||
      (todayISO && date > todayISO) ||
      (allowed.size && !allowed.has(registration))
    ) return;
    datesByRegistration.set(
      registration,
      [...new Set([...(datesByRegistration.get(registration) || []), date])].sort()
    );
  };

  vehicles.forEach((vehicle) => {
    const registration = resolveVehicleRegistration(vehicle);
    if (!registration || (allowed.size && !allowed.has(registration))) return;
    if (vehicle.id) vehicleById.set(String(vehicle.id), registration);
    [vehicle.eightWeekInspectionHistory, vehicle.pmiHistory].forEach((history) => {
      (Array.isArray(history) ? history : []).forEach((entry) => {
        if (String(entry?.source || "").trim().toLowerCase() === "vehicle_creation") return;
        add(
          registration,
          firstDate(entry.completedDate, entry.date, entry.inspectionDate)
        );
      });
    });
    const recordedLastPmi = firstDate(vehicle.lastPMI, vehicle.lastEightWeekInspection);
    if (
      recordedLastPmi &&
      !historyContainsVehicleCreationDate(
        [vehicle.eightWeekInspectionHistory, vehicle.pmiHistory],
        recordedLastPmi
      )
    ) {
      add(registration, recordedLastPmi);
    }
  });

  bookings.forEach((booking) => {
    if (!bookingTypes(booking).includes("inspection")) return;
    const dateInfo = getMaintenanceRecordDisplayDates(booking);
    const inspectionItem = dateInfo.canonicalItems.find((item) =>
      ["pmi", "eight_week_inspection"].includes(
        String(item?.maintenanceTypeId || "").trim().toLowerCase()
      )
    );
    const normalizedStatus = String(
      inspectionItem?.status || dateInfo.status || booking.status || ""
    ).trim().toLowerCase();
    if (!normalizedStatus.includes("complete")) return;
    const registration =
      vehicleById.get(String(booking.vehicleId || "")) ||
      normalizeRegistration(booking.registration || booking.vehicleRegistration);
    add(
      registration,
      inspectionItem?.completionDateISO ||
        dateInfo.completionDateISO ||
        bookingDate(booking)
    );
  });

  return datesByRegistration;
}

export function hasActiveInspectionWindow(
  completedInspectionDates,
  year,
  week,
  frequencyWeeks = 8
) {
  const targetWeekStart = isoWeekRange(year, week).start.getTime();
  const durationWeeks = Math.max(1, Number(frequencyWeeks || 8) || 8);
  return (Array.isArray(completedInspectionDates) ? completedInspectionDates : []).some(
    (dateValue) => {
      const parts = getIsoWeekParts(dateValue);
      if (!parts) return false;
      const activeFrom = isoWeekRange(parts.year, parts.week).start.getTime();
      const activeUntilDate = isoWeekRange(parts.year, parts.week).start;
      // A frequency of eight weeks makes the inspection due during the ISO
      // week eight weeks after completion. That entire due week remains legal;
      // VOR begins on the following Monday if the work is still outstanding.
      activeUntilDate.setDate(activeUntilDate.getDate() + (durationWeeks + 1) * 7);
      const activeUntil = activeUntilDate.getTime();
      return targetWeekStart >= activeFrom && targetWeekStart < activeUntil;
    }
  );
}

const sameIsoWeek = (left, right) => {
  const leftWeek = getIsoWeekParts(left);
  const rightWeek = getIsoWeekParts(right);
  return Boolean(
    leftWeek &&
      rightWeek &&
      leftWeek.year === rightWeek.year &&
      leftWeek.week === rightWeek.week
  );
};

const buildYearAheadInspectionDueEvents = ({
  vehicle,
  registration,
  existingEvents,
  asOfDate,
}) => {
  if (isVehicleOutOfUse(vehicle) || isOffFleetVehicle(vehicle)) return [];

  const todayISO = toIsoDate(asOfDate);
  const horizonISO = addYears(todayISO, 1);
  if (!todayISO || !horizonISO) return [];

  const dueDates = getHgvComplianceDueDates(vehicle);
  const definitions = [
    {
      complianceType: "pmi",
      eventType: "inspection",
      fallbackDate: firstDate(vehicle.lastPMI, vehicle.lastEightWeekInspection),
      label: "PMI due — not arranged",
    },
    {
      complianceType: "brake_test",
      eventType: "brake",
      fallbackDate: firstDate(vehicle.lastBrakeTest),
      label: "Brake test due — not arranged",
    },
  ];
  const plannedEvents = (Array.isArray(existingEvents) ? existingEvents : []).filter(
    (event) =>
      event.registration === registration &&
      ["requested", "booked", "deferred"].includes(event.status)
  );

  return definitions.flatMap(({ complianceType, eventType, fallbackDate, label }) => {
    if (!isHgvComplianceTypeEnabled(vehicle, complianceType)) return [];
    const frequencyWeeks = Math.max(
      1,
      getConfiguredMaintenanceFrequencyWeeks(vehicle, complianceType) || 8
    );
    let dueDate = dueDates[complianceType] || addWeeks(fallbackDate, frequencyWeeks);
    const forecast = [];
    let iterations = 0;

    while (dueDate && dueDate <= horizonISO && iterations < 200) {
      if (dueDate >= todayISO) {
        const isAlreadyArranged = plannedEvents.some(
          (event) =>
            event.type === eventType &&
            [event.legalDueDateISO, event.date].some((date) => sameIsoWeek(date, dueDate))
        );
        if (!isAlreadyArranged) {
          forecast.push({
            id: `year-ahead-${vehicle.id || registration}-${complianceType}-${dueDate}`,
            registration,
            date: dueDate,
            type: eventType,
            status: "requested",
            source: "year_ahead_forecast",
            label,
            bookingId: "",
            requirementKey: `year-ahead|${vehicle.id || registration}|${complianceType}:${dueDate}`,
            legalDueDateISO: dueDate,
            appointmentDateISO: "",
          });
        }
      }
      dueDate = addWeeks(dueDate, frequencyWeeks);
      iterations += 1;
    }

    return forecast;
  });
};

export function buildLivePlannerEvents({
  vehicles = [],
  bookings = [],
  year,
  registrations = [],
  asOfDate = new Date(),
}) {
  const allowed = new Set(registrations.map(normalizeRegistration));
  const vehiclesById = new Map();
  const vehiclesByRegistration = new Map();
  const todayISO = toIsoDate(asOfDate);

  vehicles.filter(isHgvComplianceVehicle).forEach((vehicle) => {
    const registration = resolveVehicleRegistration(vehicle);
    if (!registration || !allowed.has(registration)) return;
    vehiclesByRegistration.set(registration, vehicle);
    if (vehicle.id) vehiclesById.set(String(vehicle.id), { vehicle, registration });
  });

  const events = [];
  const dedupe = new Set();
  const add = (event) => {
    const parts = getIsoWeekParts(event.date);
    if (!parts || parts.year !== Number(year) || !allowed.has(event.registration)) return;
    const key = `${event.registration}|${event.date}|${event.type}|${event.status}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);
    events.push({ ...event, year: parts.year, week: parts.week });
  };

  vehiclesByRegistration.forEach((vehicle, registration) => {
    const histories = [
      ["inspection", vehicle.pmiHistory],
      ["inspection", vehicle.eightWeekInspectionHistory],
      ["brake", vehicle.brakeTestHistory],
      ["mot", vehicle.motHistory],
      [
        "mot",
        (Array.isArray(vehicle.dvsaMotTests) ? vehicle.dvsaMotTests : [])
          .filter((entry) => String(entry?.testResult || "").toUpperCase() === "PASSED")
          .map((entry) => ({ ...entry, source: "dvsa" })),
      ],
    ];
    histories.forEach(([type, history]) => {
      (Array.isArray(history) ? history : []).forEach((entry) => {
        if (String(entry?.source || "").trim().toLowerCase() === "vehicle_creation") return;
        const date = firstDate(entry.completedDate, entry.date, entry.inspectionDate);
        if (date && (!todayISO || date <= todayISO)) {
          add({
            registration,
            date,
            type,
            status: "completed",
            source: entry?.source || "vehicle_history",
            label: `${type === "inspection" ? "PMI" : type} completed`,
            bookingId: entry?.bookingId || "",
          });
        }
      });
    });

    const recordedCompletionDates = [
      {
        type: "inspection",
        date: firstDate(vehicle.lastPMI, vehicle.lastEightWeekInspection),
        histories: [vehicle.pmiHistory, vehicle.eightWeekInspectionHistory],
        label: "PMI recorded complete",
      },
      {
        type: "brake",
        date: firstDate(vehicle.lastBrakeTest),
        histories: [vehicle.brakeTestHistory],
        label: "Brake test recorded complete",
      },
    ];
    recordedCompletionDates.forEach(({ type, date, histories: sourceHistories, label }) => {
      if (
        !date ||
        (todayISO && date > todayISO) ||
        historyContainsVehicleCreationDate(sourceHistories, date)
      ) return;
      add({
        registration,
        date,
        type,
        status: "completed",
        source: "vehicle_last_completed_date",
        label,
        bookingId: "",
      });
    });

  });

  selectCanonicalMaintenanceBookings(bookings).forEach((booking) => {
    const dateInfo = getMaintenanceRecordDisplayDates(booking);
    const types = bookingTypes(booking);
    if (!types.length || !dateInfo.displayDateISO) return;
    const linked = vehiclesById.get(String(booking.vehicleId || ""));
    const registration =
      linked?.registration ||
      normalizeRegistration(booking.registration || booking.vehicleRegistration);
    if (!allowed.has(registration)) return;
    const plannerStatus = dateInfo.status === "completed"
      ? "completed"
      : dateInfo.status === "requested"
        ? "requested"
        : dateInfo.status === "deferred"
          ? "deferred"
          : "booked";
    types.forEach((type) => {
      const itemTypeId = type === "inspection"
        ? "pmi"
        : type === "brake"
          ? "brake_test"
          : type;
      const item = dateInfo.canonicalItems.find(
        (candidate) => candidate.maintenanceTypeId === itemTypeId
      );
      const date = plannerStatus === "requested"
        ? toIsoDate(item?.legalDueDateISO) || dateInfo.legalDueDateISO
        : plannerStatus === "deferred" && !dateInfo.appointmentDateISO
          ? toIsoDate(item?.legalDueDateISO) || dateInfo.legalDueDateISO
          : plannerStatus === "completed"
            ? toIsoDate(item?.completionDateISO) || dateInfo.completionDateISO || dateInfo.displayDateISO
            : dateInfo.displayDateISO;
      if (!date || (plannerStatus === "completed" && todayISO && date > todayISO)) return;
      add({
        registration,
        date,
        type,
        status: plannerStatus,
        source: "maintenance_booking",
        label: `${type} ${plannerStatus === "requested" ? "due — not arranged" : plannerStatus}`,
        bookingId: booking.id || "",
        requirementKey: dateInfo.requirementKey,
        legalDueDateISO: toIsoDate(item?.legalDueDateISO) || dateInfo.legalDueDateISO,
        appointmentDateISO: dateInfo.appointmentDateISO,
      });

      const legalDueDateISO = toIsoDate(item?.legalDueDateISO) || dateInfo.legalDueDateISO;
      const appointmentDateISO = dateInfo.appointmentDateISO;
      if (
        ["inspection", "brake"].includes(type) &&
        ["booked", "deferred"].includes(plannerStatus) &&
        legalDueDateISO &&
        appointmentDateISO &&
        !sameIsoWeek(legalDueDateISO, appointmentDateISO)
      ) {
        add({
          registration,
          date: legalDueDateISO,
          type,
          status: "due",
          source: "booking_legal_due_reference",
          label: `${type} legal due date`,
          bookingId: "",
          linkedBookingId: booking.id || "",
          requirementKey: dateInfo.requirementKey,
          legalDueDateISO,
          appointmentDateISO,
          isLegalDueReference: true,
        });
      }
    });
  });

  vehiclesByRegistration.forEach((vehicle, registration) => {
    buildYearAheadInspectionDueEvents({
      vehicle,
      registration,
      existingEvents: events,
      asOfDate,
    }).forEach(add);
  });

  const currentEvents = events.filter((event) => {
    if (
      event.source !== "maintenance_booking" ||
      event.status !== "requested" ||
      !["inspection", "brake"].includes(event.type)
    ) {
      return true;
    }

    const requestedDueDate = event.legalDueDateISO || event.date;
    const isCombinedInspectionBooking = (target) =>
      Boolean(target.bookingId) && events.some((sibling) =>
        sibling !== target &&
        sibling.bookingId === target.bookingId &&
        sibling.registration === target.registration &&
        ["inspection", "brake"].includes(sibling.type) &&
        sibling.type !== target.type
      );
    const requestedEventIsCombined = isCombinedInspectionBooking(event);
    return !events.some((candidate) =>
      candidate !== event &&
      candidate.source === "maintenance_booking" &&
      (
        ["booked", "deferred"].includes(candidate.status) ||
        (
          candidate.status === "requested" &&
          !requestedEventIsCombined &&
          isCombinedInspectionBooking(candidate)
        )
      ) &&
      candidate.registration === event.registration &&
      candidate.type === event.type &&
      sameIsoWeek(candidate.legalDueDateISO || candidate.date, requestedDueDate)
    );
  });

  const canonicalBookingEvents = new Set(
    currentEvents
      .filter((event) => event.source === "maintenance_booking" && event.bookingId)
      .map((event) => `${event.registration}|${event.bookingId}|${event.type}`)
  );

  return currentEvents
    .filter(
      (event) =>
        event.source === "maintenance_booking" ||
        !event.bookingId ||
        !canonicalBookingEvents.has(`${event.registration}|${event.bookingId}|${event.type}`)
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeInspectionRequirements(events = [], asOfDate = new Date()) {
  const todayISO = toIsoDate(asOfDate);
  const seen = new Set();
  const dueDates = [];

  (Array.isArray(events) ? events : []).forEach((event) => {
    if (event?.type !== "inspection") return;
    if (!["requested", "booked", "deferred"].includes(event?.status)) return;
    const dueDate = toIsoDate(event?.legalDueDateISO || event?.date);
    if (!dueDate) return;
    const key = event?.requirementKey || event?.bookingId || `${event?.registration}|${dueDate}`;
    if (seen.has(key)) return;
    seen.add(key);
    dueDates.push(dueDate);
  });

  const today = parseIsoDate(todayISO);
  const difference = (value) => {
    const date = parseIsoDate(value);
    return date && today ? Math.round((date.getTime() - today.getTime()) / 86400000) : null;
  };
  return {
    dueSoon: dueDates.filter((date) => {
      const days = difference(date);
      return days !== null && days >= 0 && days <= 56;
    }).length,
    overdue: dueDates.filter((date) => (difference(date) ?? 0) < 0).length,
  };
}

export function vehicleStatus(vehicle, importedStatus = "AVAILABLE") {
  if (vehicle) {
    if (isOffFleetVehicle(vehicle)) return "OFF FLEET";
    return isVehicleOutOfUse(vehicle) ? "VOR" : "ACTIVE";
  }
  return importedStatus === "OFF FLEET" ? "OFF FLEET" : importedStatus === "VOR" ? "VOR" : "PDF ONLY";
}
