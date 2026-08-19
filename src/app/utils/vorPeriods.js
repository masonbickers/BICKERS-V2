import {
  getConfiguredMaintenanceFrequencyWeeks,
  getIsoWeekLabel,
  syncVehicleOperatingStatus,
} from "./maintenanceSchema.js";
import {
  buildComplianceReleasePatch,
  complianceVorReleaseBlocker,
  getCurrentHgvVorStartDate,
} from "./hgvCompliance.js";

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

const visibleVorHistory = (vehicle = {}, excludedRecordId = "") =>
  (Array.isArray(vehicle?.vorHistory) ? vehicle.vorHistory : []).filter((record) => {
    const status = text(record?.status).toLowerCase();
    return (
      text(record?.id) !== text(excludedRecordId) &&
      !["archived", "deleted", "superseded"].includes(status)
    );
  });

const vorPeriodBounds = (record = {}) => ({
  start: dateOnly(record.offRoadDate || record.startedAt),
  end: dateOnly(record.returnedDate || record.completedAt) || "9999-12-31",
});

const periodsOverlap = (left = {}, right = {}) => {
  const a = vorPeriodBounds(left);
  const b = vorPeriodBounds(right);
  return Boolean(a.start && b.start && a.start <= b.end && b.start <= a.end);
};

export const assertVorHistoryIntegrity = (vehicle = {}) => {
  const openPeriods = visibleVorHistory(vehicle).filter(
    (record) => text(record?.status).toLowerCase() === "open"
  );
  if (openPeriods.length > 1) {
    throw new Error("This vehicle has contradictory open VOR/SORN periods. Correct the history before continuing.");
  }
  return true;
};

export const assertVorPeriodDoesNotOverlap = (
  vehicle = {},
  candidate = {},
  { excludedRecordId = "" } = {}
) => {
  const conflict = visibleVorHistory(vehicle, excludedRecordId).find((record) =>
    periodsOverlap(record, candidate)
  );
  if (conflict) {
    throw new Error(
      `This VOR/SORN period overlaps the existing period starting ${vorPeriodBounds(conflict).start}.`
    );
  }
  return true;
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
  assertVorHistoryIntegrity(vehicle);
  if (visibleVorHistory(vehicle).some((record) => text(record?.status).toLowerCase() === "open")) {
    throw new Error("This vehicle already has an open VOR/SORN period.");
  }
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
  assertVorPeriodDoesNotOverlap(vehicle, record);

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
  assertVorHistoryIntegrity(vehicle);
  const history = Array.isArray(vehicle.vorHistory) ? vehicle.vorHistory : [];
  const activeRecord =
    history.find(
      (record) =>
        text(record?.status).toLowerCase() === "open" &&
        (record.id === vehicle.activeVorRecordId || !vehicle.activeVorRecordId)
    ) || null;
  const activeRecordId = vehicle.activeVorRecordId || activeRecord?.id || "";
  if (!activeRecord || !activeRecordId) {
    throw new Error("This vehicle does not have an open VOR/SORN period to return from.");
  }
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

export const canReleaseVehicleAfterCompletedCompliance = (vehicle = {}) => {
  const state = text(vehicle.complianceVor?.state).toLowerCase();
  const pmiCompletionDate = dateOnly(
    vehicle.complianceVor?.freshPmiCompletedAt ||
      vehicle.complianceVor?.reasons?.pmi?.completionDate ||
      vehicle.lastPMI ||
      vehicle.eightWeekInspectionStart
  );
  const brakeCompletionDate = dateOnly(
    vehicle.complianceVor?.reasons?.brake_test?.completionDate || vehicle.lastBrakeTest
  );
  const hasCompletedPair = Boolean(
    pmiCompletionDate &&
      brakeCompletionDate &&
      pmiCompletionDate === brakeCompletionDate
  );
  const vorStartDate = getCurrentHgvVorStartDate(vehicle);
  const hasFreshCompletedPair = Boolean(
    hasCompletedPair &&
      vorStartDate &&
      pmiCompletionDate >= vorStartDate &&
      brakeCompletionDate >= vorStartDate
  );
  const hasPendingReturnInspection =
    text(vehicle.pendingReturnInspection?.status).toLowerCase() === "inspection_required";

  return (
    hasFreshCompletedPair &&
    (state === "ready_for_release" || (state === "clear" && hasPendingReturnInspection)) &&
    !complianceVorReleaseBlocker(vehicle)
  );
};

export const releaseVehicleAfterCompletedCompliance = (
  vehicle = {},
  declaration = {},
  {
    completedAt = new Date().toISOString(),
    releasedBy = null,
  } = {}
) => {
  const complianceVor = vehicle.complianceVor || {};
  if (!canReleaseVehicleAfterCompletedCompliance(vehicle)) {
    throw new Error("Complete all required PMI and brake-test work before releasing this vehicle.");
  }
  const blocker = complianceVorReleaseBlocker(vehicle);
  if (blocker) throw new Error(blocker);

  const pendingReturnInspection = vehicle.pendingReturnInspection || null;
  const pmiCompletionDate = dateOnly(
    complianceVor.freshPmiCompletedAt ||
      complianceVor.reasons?.pmi?.completionDate ||
      vehicle.lastPMI ||
      vehicle.eightWeekInspectionStart
  );
  const brakeCompletionDate = dateOnly(
    complianceVor.reasons?.brake_test?.completionDate || vehicle.lastBrakeTest
  );
  const restoredNextPmi = pendingReturnInspection
    ? addWeeks(
        pmiCompletionDate,
        getConfiguredMaintenanceFrequencyWeeks(vehicle, "pmi")
      )
    : "";
  const restoredNextBrakeTest = pendingReturnInspection
    ? addWeeks(
        brakeCompletionDate,
        getConfiguredMaintenanceFrequencyWeeks(vehicle, "brake_test")
      )
    : "";
  const returned = returnVehicleFromVor(
    vehicle,
    {
      ...declaration,
      firstUseInspectionDate: pmiCompletionDate,
    },
    { completedAt }
  );
  const releasePatch = buildComplianceReleasePatch(returned, {
    releasedAt: completedAt,
    releasedBy,
  });

  return {
    ...returned,
    ...releasePatch,
    ...(restoredNextPmi
      ? {
          nextPMI: restoredNextPmi,
          nextEightWeekInspection: restoredNextPmi,
          nextLorryInspection: restoredNextPmi,
          pmiISOWeek: getIsoWeekLabel(restoredNextPmi),
          eightWeekInspectionISOWeek: getIsoWeekLabel(restoredNextPmi),
          lorryInspectionISOWeek: getIsoWeekLabel(restoredNextPmi),
        }
      : {}),
    ...(restoredNextBrakeTest
      ? {
          nextBrakeTest: restoredNextBrakeTest,
          brakeISOWeek: getIsoWeekLabel(restoredNextBrakeTest),
        }
      : {}),
    complianceVor: {
      ...releasePatch.complianceVor,
      releaseMethod: "completed_compliance_inspections",
      releaseEvidence: {
        pmiCompletionDate,
        brakeCompletionDate,
        supersededPendingReturnInspection: pendingReturnInspection,
      },
    },
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

export const vehicleReturnInspectionBookingIntent = (vehicle = {}) => {
  const pending = vehicle.pendingReturnInspection || {};
  const appointmentDateISO = dateOnly(pending.inspectionDate);
  const vehicleId = text(vehicle.id);
  if (
    text(pending.status).toLowerCase() !== "inspection_required" ||
    !appointmentDateISO ||
    !vehicleId
  ) {
    return null;
  }
  return {
    vehicleId,
    vehicleLabel: text(vehicle.name || vehicle.registration || vehicle.reg),
    type: "INSPECTION",
    status: "Booked",
    maintenanceTypeIds: ["pmi", "brake_test"],
    appointmentDateISO,
    sourceDueDateISO: appointmentDateISO,
    sourceDueKey: `vor-return:${vehicleId}:${appointmentDateISO}`,
    notes: "Required combined PMI and brake-test inspection before return to fleet.",
    origin: "vehicle_vor_return",
    sourceVorPeriodId: text(vehicle.activeVorRecordId),
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

export const addHistoricVorPeriod = (vehicle = {}, input = {}, options = {}) => {
  assertVorHistoryIntegrity(vehicle);
  const record = buildHistoricVorPeriod(input);
  assertVorPeriodDoesNotOverlap(vehicle, record);
  return {
    ...vehicle,
    vorHistory: [...(Array.isArray(vehicle.vorHistory) ? vehicle.vorHistory : []), record],
    vorHistoryLastMutatedAt: options.mutatedAt || new Date().toISOString(),
    vorHistoryLastMutatedBy: normalizeVorAuditUser(options.mutatedBy),
  };
};

export const historicVorFirstUseBookingIntent = (vehicle = {}, period = {}) => {
  const appointmentDateISO = dateOnly(period.firstUseInspectionDate);
  if (!appointmentDateISO) return null;
  const vehicleId = text(vehicle.id);
  const periodId = text(period.id);
  return {
    vehicleId,
    vehicleLabel: text(vehicle.name || vehicle.registration || vehicle.reg),
    type: "INSPECTION",
    status: "Booked",
    maintenanceTypeIds: ["pmi", "brake_test"],
    appointmentDateISO,
    sourceDueDateISO: appointmentDateISO,
    sourceDueKey: `historic-vor-first-use:${vehicleId}:${periodId}:${appointmentDateISO}`,
    notes: `First-use inspection following historic VOR/SORN period ${periodId}.`,
    origin: "historic_vor_first_use",
    sourceVorPeriodId: periodId,
  };
};

const historicVorAuditSnapshot = (record = {}) => ({
  status: text(record.status),
  offRoadDate: dateOnly(record.offRoadDate || record.startedAt),
  returnedDate: dateOnly(record.returnedDate || record.completedAt),
  offRoadOdometer: text(record.offRoadOdometer),
  returnOdometer: text(record.returnOdometer),
  reason: text(record.reason),
  approvedBy: text(record.approvedBy),
  approvedPosition: text(record.approvedPosition),
  removedBy: text(record.removedBy),
  removedPosition: text(record.removedPosition),
  firstUseInspectionDate: dateOnly(record.firstUseInspectionDate),
  operatorLicenceNumber: text(record.operatorLicenceNumber),
});

const normalizeVorAuditUser = (user = {}) => ({
  uid: text(user.uid),
  name: text(user.name || user.displayName || user.email) || "Unknown",
  email: text(user.email),
});

export const isHistoricallyMigratedVorPeriod = (record = {}) =>
  record?.migrated === true || text(record?.source).toLowerCase() === "historic_migration";

export const isAutomaticComplianceVorPeriod = (record = {}) => {
  const source = text(record?.source).toLowerCase();
  const id = text(record?.id).toLowerCase();
  const approver = text(record?.approvedBy).toLowerCase();
  const reason = text(record?.reason).toLowerCase();
  return (
    source === "automatic_compliance" ||
    id.startsWith("compliance-vor-") ||
    approver === "hgv compliance system" ||
    reason.startsWith("automatic compliance vor:")
  );
};

export const isAdminCorrectableVorPeriod = (record = {}) =>
  isHistoricallyMigratedVorPeriod(record) || isAutomaticComplianceVorPeriod(record);

export const correctHistoricVorPeriod = (
  record = {},
  changes = {},
  { reason, correctedAt = new Date().toISOString(), correctedBy = {} } = {}
) => {
  if (!isAdminCorrectableVorPeriod(record)) {
    throw new Error("Only migrated or automatic compliance VOR/SORN periods can be corrected here.");
  }
  if (!text(reason)) throw new Error("Enter a reason for correcting this historic period.");

  const corrected = buildHistoricVorPeriod({
    id: record.id,
    registration: changes.registration ?? record.registration,
    operatorLicenceNumber:
      changes.operatorLicenceNumber ?? record.operatorLicenceNumber,
    offRoadDate: changes.offRoadDate ?? record.offRoadDate,
    returnedDate: changes.returnedDate ?? record.returnedDate,
    offRoadOdometer: changes.offRoadOdometer ?? record.offRoadOdometer,
    returnOdometer: changes.returnOdometer ?? record.returnOdometer,
    approvedBy: changes.approvedBy ?? record.approvedBy,
    approvedPosition: changes.approvedPosition ?? record.approvedPosition,
    removedBy: changes.removedBy ?? record.removedBy,
    removedPosition: changes.removedPosition ?? record.removedPosition,
    reason: changes.reason ?? record.reason,
    firstUseInspectionDate:
      changes.firstUseInspectionDate ?? record.firstUseInspectionDate,
    migratedBy: record.migratedBy,
  });
  const missingRequiredField = [
    [corrected.offRoadDate, "start date"],
    [corrected.returnedDate, "return date"],
    [corrected.approvedBy, "VOR approver"],
    [corrected.approvedPosition, "approver position"],
    [corrected.removedBy, "return authoriser"],
    [corrected.removedPosition, "return authoriser position"],
    [corrected.reason, "VOR/SORN reason"],
  ].find(([value]) => !text(value));
  if (missingRequiredField) {
    throw new Error(`Enter the ${missingRequiredField[1]} before saving this correction.`);
  }
  const auditUser = normalizeVorAuditUser(correctedBy);
  const migratedRecord = isHistoricallyMigratedVorPeriod(record);
  return {
    ...record,
    ...corrected,
    source: record.source || (isAutomaticComplianceVorPeriod(record) ? "automatic_compliance" : corrected.source),
    migrated: record.migrated === true,
    migratedAt: migratedRecord ? (record.migratedAt || corrected.migratedAt) : record.migratedAt,
    migratedBy: migratedRecord ? (record.migratedBy || corrected.migratedBy) : record.migratedBy,
    correctedAt,
    correctedBy: auditUser,
    correctionReason: text(reason),
    auditHistory: [
      ...(Array.isArray(record.auditHistory) ? record.auditHistory : []),
      {
        action: "corrected",
        at: correctedAt,
        by: auditUser,
        reason: text(reason),
        previous: historicVorAuditSnapshot(record),
      },
    ],
  };
};

export const correctVehicleHistoricVorPeriod = (
  vehicle = {},
  recordId,
  changes = {},
  options = {}
) => {
  assertVorHistoryIntegrity(vehicle);
  const history = Array.isArray(vehicle.vorHistory) ? vehicle.vorHistory : [];
  const current = history.find((record) => text(record?.id) === text(recordId));
  if (!current) throw new Error("Historic VOR/SORN period no longer exists.");
  const corrected = correctHistoricVorPeriod(current, changes, options);
  assertVorPeriodDoesNotOverlap(vehicle, corrected, { excludedRecordId: recordId });
  return {
    ...vehicle,
    vorHistory: history.map((record) => text(record?.id) === text(recordId) ? corrected : record),
  };
};

export const archiveHistoricVorPeriod = (
  record = {},
  { reason, archivedAt = new Date().toISOString(), archivedBy = {} } = {}
) => {
  if (!isAdminCorrectableVorPeriod(record)) {
    throw new Error("Only migrated or automatic compliance VOR/SORN periods can be archived here.");
  }
  if (!text(reason)) throw new Error("Enter a reason for archiving this historic period.");
  const auditUser = normalizeVorAuditUser(archivedBy);
  return {
    ...record,
    status: "archived",
    archivedAt,
    archivedBy: auditUser,
    archiveReason: text(reason),
    auditHistory: [
      ...(Array.isArray(record.auditHistory) ? record.auditHistory : []),
      {
        action: "archived",
        at: archivedAt,
        by: auditUser,
        reason: text(reason),
        previous: historicVorAuditSnapshot(record),
      },
    ],
  };
};

export const archiveVehicleHistoricVorPeriod = (
  vehicle = {},
  recordId,
  options = {}
) => {
  assertVorHistoryIntegrity(vehicle);
  const history = Array.isArray(vehicle.vorHistory) ? vehicle.vorHistory : [];
  const current = history.find((record) => text(record?.id) === text(recordId));
  if (!current) throw new Error("Historic VOR/SORN period no longer exists.");
  const archived = archiveHistoricVorPeriod(current, options);
  return {
    ...vehicle,
    vorHistory: history.map((record) => text(record?.id) === text(recordId) ? archived : record),
  };
};
