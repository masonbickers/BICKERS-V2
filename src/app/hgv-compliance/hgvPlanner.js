import { isVehicleOutOfUse } from "../utils/maintenanceSchema.js";
import {
  getHgvComplianceDueDates,
  isHgvComplianceTypeEnabled,
  isHgvComplianceVehicle,
  isOffFleetVehicle,
} from "../utils/hgvCompliance.js";

export const normalizeRegistration = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

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

export function vehicleStatusForIsoWeek(
  vehicle,
  status,
  year,
  week,
  useWholeYearStatus = false,
  completedInspectionDates = []
) {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  if (normalizedStatus === "OFF FLEET") return "OFF FLEET";
  if (completedInspectionDates.length) {
    return hasActiveInspectionWindow(
      completedInspectionDates,
      year,
      week,
      vehicle?.pmiFreq || 8
    )
      ? ""
      : "VOR";
  }
  if (normalizedStatus !== "VOR") return "";
  if (useWholeYearStatus) return "VOR";

  const periods = (Array.isArray(vehicle?.vorHistory) ? vehicle.vorHistory : [])
    .map((record) => ({
      start: parseIsoDate(record?.offRoadDate || record?.startedAt),
      end: parseIsoDate(record?.returnedDate || record?.completedAt),
    }))
    .filter((period) => period.start);

  if (!periods.length) return "VOR";

  const range = isoWeekRange(year, week);
  return periods.some(
    (period) =>
      period.start.getTime() <= range.end.getTime() &&
      (!period.end || period.end.getTime() >= range.start.getTime())
  )
    ? "VOR"
    : "";
}

export function hgvComplianceStatusForIsoWeek(
  vehicle,
  status,
  year,
  week,
  useWholeYearStatus = false,
  completedInspectionDates = []
) {
  void completedInspectionDates;
  const baseStatus = vehicleStatusForIsoWeek(
    vehicle,
    status,
    year,
    week,
    useWholeYearStatus,
    []
  );
  if (baseStatus === "OFF FLEET" || baseStatus === "VOR") return baseStatus;
  if (!vehicle || !isHgvComplianceVehicle(vehicle)) return baseStatus;

  const targetStart = isoWeekRange(year, week).start.getTime();
  const dueDates = getHgvComplianceDueDates(vehicle);
  const hasExpiredRequirement = ["pmi", "brake_test", "mot"].some((type) => {
    if (!isHgvComplianceTypeEnabled(vehicle, type)) return false;
    const dueParts = getIsoWeekParts(dueDates[type]);
    if (!dueParts) return false;
    const firstWeekAfterDue = isoWeekRange(dueParts.year, dueParts.week).start;
    firstWeekAfterDue.setDate(firstWeekAfterDue.getDate() + 7);
    return targetStart >= firstWeekAfterDue.getTime();
  });
  return hasExpiredRequirement ? "VOR" : "";
}

export const formatDate = (value) => {
  const date = parseIsoDate(value);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "-";
};

const addWeeks = (value, weeks) => {
  const date = parseIsoDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + Number(weeks || 0) * 7);
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
  const isScheduleEntry = ["due", "projected", "planned", "booked"].includes(status);
  const maintenanceType = plannerMaintenanceType(event.type);
  const vehicleName = resolveVehicleLabel(vehicle || {}, registration || "Unknown vehicle");

  return {
    ...event,
    id: "",
    plannerEventId: String(event.id || ""),
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
    disableBookingActions: !isScheduleEntry,
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
  firstDate(
    booking.completedDate,
    booking.dateCompleted,
    booking.completedAtISO,
    booking.appointmentDateISO,
    booking.startDateISO,
    booking.appointmentDate,
    booking.startDate,
    booking.date
  );

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
    const normalizedStatus = String(booking.status || "").trim().toLowerCase();
    if (!normalizedStatus.includes("complete")) return;
    const registration =
      vehicleById.get(String(booking.vehicleId || "")) ||
      normalizeRegistration(booking.registration || booking.vehicleRegistration);
    add(registration, bookingDate(booking));
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
      activeUntilDate.setDate(activeUntilDate.getDate() + durationWeeks * 7);
      const activeUntil = activeUntilDate.getTime();
      return targetWeekStart >= activeFrom && targetWeekStart < activeUntil;
    }
  );
}

const vehicleDueEvents = (vehicle, registration) => [
  {
    date: firstDate(vehicle.nextEightWeekInspection, vehicle.nextPMI),
    type: "inspection",
    status: "due",
    label: "PMI due",
  },
  {
    date: firstDate(vehicle.nextBrakeTest),
    type: "brake",
    status: "due",
    label: "Brake test due",
  },
  {
    date: firstDate(
      vehicle.nextMOT,
      vehicle.nextMot,
      vehicle.nextMotDate,
      vehicle.motDueDate,
      vehicle.motExpiryDate
    ),
    type: "mot",
    status: "due",
    label: "MOT due",
  },
].filter((event) => event.date).map((event) => ({ ...event, registration }));

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

  bookings.forEach((booking) => {
    const date = bookingDate(booking);
    const types = bookingTypes(booking);
    if (!types.length || !date) return;
    const linked = vehiclesById.get(String(booking.vehicleId || ""));
    const registration =
      linked?.registration ||
      normalizeRegistration(booking.registration || booking.vehicleRegistration);
    if (!allowed.has(registration)) return;
    const normalizedStatus = String(booking.status || "").trim().toLowerCase().replaceAll("_", " ");
    if (["archived", "cancelled", "canceled", "declined", "deleted"].includes(normalizedStatus)) return;
    const isCompleted = ["completed", "complete", "closed"].includes(normalizedStatus);
    const isActiveBooking = ["booked", "in progress", "planned", "scheduled"].includes(normalizedStatus);
    if (isCompleted ? date > todayISO : !isActiveBooking || date < todayISO) return;
    types.forEach((type) => {
      add({
        registration,
        date,
        type,
        status: isCompleted ? "completed" : "booked",
        label: `${type} ${isCompleted ? "completed" : "booked"}`,
        bookingId: booking.id || "",
      });
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function vehicleStatus(vehicle, importedStatus = "AVAILABLE") {
  if (vehicle) {
    if (isOffFleetVehicle(vehicle)) return "OFF FLEET";
    return isVehicleOutOfUse(vehicle) ? "VOR" : "ACTIVE";
  }
  return importedStatus === "OFF FLEET" ? "OFF FLEET" : importedStatus === "VOR" ? "VOR" : "PDF ONLY";
}
