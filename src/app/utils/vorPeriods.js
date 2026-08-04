import {
  getIsoWeekLabel,
  syncVehicleOperatingStatus,
} from "./maintenanceSchema.js";

const text = (value) => String(value || "").trim();
const DAY_MS = 86400000;

export const VOR_COUNTDOWN_DEFINITIONS = Object.freeze([
  { key: "mot", fields: ["nextMOT", "nextMot", "nextMotDate", "motDueDate", "motExpiryDate"], isoField: "motISOWeek" },
  { key: "service", fields: ["nextService", "nextServiceDate", "serviceDueDate"], isoField: "serviceISOWeek" },
  { key: "eight_week_inspection", fields: ["nextEightWeekInspection"], isoField: "eightWeekInspectionISOWeek" },
  { key: "road_tax", fields: ["nextRFL"], isoField: "rflISOWeek" },
  { key: "tacho_inspection", fields: ["nextTacho"], isoField: "tachoISOWeek" },
  { key: "brake_test", fields: ["nextBrakeTest"], isoField: "brakeISOWeek" },
  { key: "pmi", fields: ["nextPMI"], isoField: "pmiISOWeek" },
  { key: "tacho_download", fields: ["nextTachoDownload"], isoField: "tachoDownloadISOWeek" },
  { key: "tail_lift", fields: ["nextTailLift"], isoField: "tailLiftISOWeek" },
  { key: "loler", fields: ["nextLoler"], isoField: "lolerISOWeek" },
  { key: "tacho_calibration", fields: ["nextTachoCalibration"], isoField: "tachoCalibrationISOWeek" },
  { key: "lorry_inspection", fields: ["nextLorryInspection"], isoField: "lorryInspectionISOWeek" },
]);

const toLocalDate = (value) => {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateOnly = (value) => {
  const date = toLocalDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const calculateVorDurationDays = (startDate, returnDate) => {
  const start = toLocalDate(startDate);
  const end = toLocalDate(returnDate);
  if (!start || !end || end.getTime() < start.getTime()) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
};

export const shiftMaintenanceDate = (value, days) => {
  const date = toLocalDate(value);
  const numericDays = Number(days || 0);
  if (!date || !Number.isFinite(numericDays)) return "";
  date.setDate(date.getDate() + numericDays);
  return dateOnly(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`
  );
};

export const captureMaintenanceCountdowns = (vehicle = {}) =>
  Object.fromEntries(
    VOR_COUNTDOWN_DEFINITIONS.map((definition) => [
      definition.key,
      definition.fields.map((field) => text(vehicle[field])).find(Boolean) || "",
    ])
  );

export const buildVorPauseState = (vehicle = {}, offRoadDate, recordId = "") => ({
  status: "paused",
  recordId,
  startedDate: dateOnly(offRoadDate),
  startedAt: new Date().toISOString(),
  dueDates: captureMaintenanceCountdowns(vehicle),
});

const addWeeks = (value, weeks) => {
  const start = toLocalDate(value);
  const frequency = Number(weeks || 0);
  if (!start || !Number.isFinite(frequency) || frequency <= 0) return "";
  start.setDate(start.getDate() + Math.round(frequency) * 7);
  return dateOnly(
    `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
      start.getDate()
    ).padStart(2, "0")}`
  );
};

export const startVehicleVorPeriod = (
  vehicle = {},
  {
    offRoadDate,
    odometer = "",
    approvedBy = "",
    approvedPosition = "",
    reason = "",
    operatorLicenceNumber = "",
  } = {},
  {
    recordId = `vor-${Date.now()}`,
    startedAt = new Date().toISOString(),
  } = {}
) => {
  const record = {
    id: recordId,
    status: "open",
    registration: text(vehicle.registration || vehicle.reg),
    operatorLicenceNumber: text(operatorLicenceNumber),
    offRoadDate: dateOnly(offRoadDate),
    offRoadOdometer: text(odometer),
    approvedBy: text(approvedBy),
    approvedPosition: text(approvedPosition),
    reason: text(reason),
    maintenanceDueDatesAtStart: captureMaintenanceCountdowns(vehicle),
    countdownPolicy: "continues_while_vor",
    startedAt,
  };

  return {
    ...syncVehicleOperatingStatus(vehicle, "VOR"),
    vorStartedAt: startedAt,
    activeVorRecordId: recordId,
    maintenanceCountdownPause: {
      status: "not_paused",
      policy: "continues_while_vor",
      recordId,
      startedDate: dateOnly(offRoadDate),
    },
    vorHistory: [...(Array.isArray(vehicle.vorHistory) ? vehicle.vorHistory : []), record],
  };
};

export const applyVorCountdownResume = (
  vehicle = {},
  { offRoadDate, returnedDate, dueDates = null } = {}
) => {
  const durationDays = calculateVorDurationDays(offRoadDate, returnedDate);
  if (durationDays === null) return { updates: {}, durationDays: null };
  const snapshot =
    dueDates && typeof dueDates === "object" && Object.keys(dueDates).length
      ? dueDates
      : captureMaintenanceCountdowns(vehicle);
  const updates = {};

  VOR_COUNTDOWN_DEFINITIONS.forEach((definition) => {
    const originalDate = text(snapshot[definition.key]);
    if (!originalDate) return;
    const shiftedDate = shiftMaintenanceDate(originalDate, durationDays);
    if (!shiftedDate) return;
    definition.fields.forEach((field) => {
      updates[field] = shiftedDate;
    });
    if (definition.isoField) updates[definition.isoField] = getIsoWeekLabel(shiftedDate);
  });

  return { updates, durationDays };
};

export const returnVehicleFromVor = (
  vehicle = {},
  {
    returnedDate,
    odometer = "",
    removedBy = "",
    removedPosition = "",
    signature = "",
    firstUseInspectionDate = "",
  } = {},
  { completedAt = new Date().toISOString() } = {}
) => {
  const history = Array.isArray(vehicle.vorHistory) ? vehicle.vorHistory : [];
  const activeRecord =
    history.find(
      (record) =>
        record.id === vehicle.activeVorRecordId ||
        (!vehicle.activeVorRecordId && record.status === "open")
    ) || null;
  const activeRecordId = vehicle.activeVorRecordId || activeRecord?.id || "";
  const offRoadDate =
    activeRecord?.offRoadDate || vehicle.maintenanceCountdownPause?.startedDate;
  const durationDays = calculateVorDurationDays(offRoadDate, returnedDate);
  if (durationDays === null) {
    throw new Error(
      "The return date must be on or after the date the vehicle was taken off the fleet."
    );
  }
  const firstUseDate = dateOnly(firstUseInspectionDate);
  const updatedHistory = history.map((record) =>
    record.id === activeRecordId || (!activeRecordId && record.status === "open")
      ? {
          ...record,
          status: "closed",
          returnedDate: dateOnly(returnedDate),
          returnOdometer: text(odometer),
          removedBy: text(removedBy),
          removedPosition: text(removedPosition),
          signature: text(signature),
          firstUseInspectionDate: firstUseDate,
          durationDays,
          countdownPolicy: "continues_while_vor",
          completedAt,
        }
      : record
  );

  return {
    ...syncVehicleOperatingStatus(vehicle, "Active"),
    vorEndedAt: completedAt,
    activeVorRecordId: "",
    maintenanceCountdownPause: {
      ...(vehicle.maintenanceCountdownPause || {}),
      status: "not_paused",
      policy: "continues_while_vor",
      returnedDate: dateOnly(returnedDate),
      returnedAt: completedAt,
      durationDays,
    },
    vorHistory: updatedHistory,
    odometer: text(odometer),
    pendingReturnInspection: null,
  };
};

export const scheduleVehicleReturnInspection = (
  vehicle = {},
  {
    inspectionDate,
    odometer = "",
    removedBy = "",
    removedPosition = "",
    signature = "",
  } = {},
  { requestedAt = new Date().toISOString() } = {}
) => {
  const normalizedInspectionDate = dateOnly(inspectionDate);
  const history = Array.isArray(vehicle.vorHistory) ? vehicle.vorHistory : [];
  const activeRecord =
    history.find(
      (record) =>
        record.id === vehicle.activeVorRecordId ||
        (!vehicle.activeVorRecordId && record.status === "open")
    ) || null;
  const activeRecordId = vehicle.activeVorRecordId || activeRecord?.id || "";
  const offRoadDate =
    activeRecord?.offRoadDate || vehicle.maintenanceCountdownPause?.startedDate;
  if (calculateVorDurationDays(offRoadDate, normalizedInspectionDate) === null) {
    throw new Error(
      "The return inspection date must be on or after the date the vehicle was taken off the fleet."
    );
  }

  const declaration = {
    inspectionDate: normalizedInspectionDate,
    odometer: text(odometer),
    removedBy: text(removedBy),
    removedPosition: text(removedPosition),
    signature: text(signature),
    requestedAt,
  };
  const updatedHistory = history.map((record) =>
    record.id === activeRecordId || (!activeRecordId && record.status === "open")
      ? {
          ...record,
          plannedReturnInspectionDate: normalizedInspectionDate,
          returnOdometer: declaration.odometer,
          removedBy: declaration.removedBy,
          removedPosition: declaration.removedPosition,
          signature: declaration.signature,
          returnInspectionRequestedAt: requestedAt,
        }
      : record
  );

  return {
    ...syncVehicleOperatingStatus(vehicle, "VOR"),
    nextPMI: normalizedInspectionDate,
    nextEightWeekInspection: normalizedInspectionDate,
    pmiISOWeek: getIsoWeekLabel(normalizedInspectionDate),
    eightWeekInspectionISOWeek: getIsoWeekLabel(normalizedInspectionDate),
    nextBrakeTest: normalizedInspectionDate,
    brakeISOWeek: getIsoWeekLabel(normalizedInspectionDate),
    pendingReturnInspection: {
      status: "inspection_required",
      ...declaration,
    },
    vorHistory: updatedHistory,
  };
};

export const buildReturnInspectionCompletionPatch = (
  vehicle = {},
  { completedDate, bookingId = "" } = {},
  { completedAt = new Date().toISOString() } = {}
) => {
  const pending = vehicle?.pendingReturnInspection || null;
  const normalizedCompletedDate = dateOnly(completedDate);
  if (
    !pending ||
    text(pending.status).toLowerCase() !== "inspection_required" ||
    !normalizedCompletedDate
  ) {
    return null;
  }

  const expectedBookingId = text(pending.bookingId);
  const expectedDate = dateOnly(pending.inspectionDate);
  const isExpectedInspection = expectedBookingId
    ? expectedBookingId === text(bookingId)
    : expectedDate === normalizedCompletedDate;
  if (!isExpectedInspection) return null;

  const returned = returnVehicleFromVor(
    vehicle,
    {
      returnedDate: normalizedCompletedDate,
      odometer: pending.odometer,
      removedBy: pending.removedBy,
      removedPosition: pending.removedPosition,
      signature: pending.signature,
      firstUseInspectionDate: normalizedCompletedDate,
    },
    { completedAt }
  );

  return {
    ...syncVehicleOperatingStatus({}, "Active"),
    vorEndedAt: returned.vorEndedAt,
    activeVorRecordId: returned.activeVorRecordId,
    maintenanceCountdownPause: returned.maintenanceCountdownPause,
    vorHistory: returned.vorHistory,
    odometer: returned.odometer,
    pendingReturnInspection: null,
  };
};

export const buildHistoricVorPeriod = ({
  id = `vor-history-${Date.now()}`,
  registration = "",
  offRoadDate,
  returnedDate,
  reason,
  approvedBy,
  approvedPosition,
  removedBy,
  removedPosition,
  firstUseInspectionDate = "",
  operatorLicenceNumber = "",
  offRoadOdometer = "",
  returnOdometer = "",
  migratedBy = {},
}) => {
  const durationDays = calculateVorDurationDays(offRoadDate, returnedDate);
  if (durationDays === null) throw new Error("Historic VOR return date must be on or after its start date.");
  if (
    firstUseInspectionDate &&
    (dateOnly(firstUseInspectionDate) < dateOnly(offRoadDate) ||
      dateOnly(firstUseInspectionDate) > dateOnly(returnedDate))
  ) {
    throw new Error("Historic first-use inspection must fall within the VOR/SORN period.");
  }
  return {
    id,
    status: "closed",
    source: "historic_migration",
    migrated: true,
    migratedAt: new Date().toISOString(),
    migratedBy: {
      uid: text(migratedBy.uid),
      name: text(migratedBy.name || migratedBy.email) || "Unknown",
      email: text(migratedBy.email),
    },
    registration: text(registration),
    operatorLicenceNumber: text(operatorLicenceNumber),
    offRoadDate: dateOnly(offRoadDate),
    returnedDate: dateOnly(returnedDate),
    offRoadOdometer: text(offRoadOdometer),
    returnOdometer: text(returnOdometer),
    reason: text(reason),
    approvedBy: text(approvedBy),
    approvedPosition: text(approvedPosition),
    removedBy: text(removedBy),
    removedPosition: text(removedPosition),
    firstUseInspectionDate: dateOnly(firstUseInspectionDate),
    durationDays,
    startedAt: `${dateOnly(offRoadDate)}T00:00:00.000Z`,
    completedAt: `${dateOnly(returnedDate)}T00:00:00.000Z`,
  };
};
