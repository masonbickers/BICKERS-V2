import {
  maintenanceDateOnly,
  normalizeMaintenanceRecord,
  validateMaintenanceRecord,
} from "./maintenanceRecord.js";
import {
  INSPECTION_MAINTENANCE_TYPE_IDS,
  buildAnnualMaintenanceForecast,
  buildAnnualMaintenancePersistencePayload,
  reconcileAnnualMaintenanceForecast,
} from "./maintenanceForecast.js";
import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  RECURRING_MAINTENANCE_WORKFLOWS,
  isVehicleOutOfUse,
} from "./maintenanceSchema.js";
import {
  buildVorInspectionCancellationPatch,
  getVehicleVorStartDate,
  isVorInspectionCancellationCandidate,
} from "./vorBookingPolicy.js";

const safeArray = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value || "").trim();
const AUTOMATIC_SCHEDULE_SOURCES = new Set([
  "automatic_schedule",
  "vehicle_maintenance_schedule",
  "maintenance_schedule",
  "completion_recurrence",
  "safe_reconciliation",
]);
const ACTIVE_SCHEDULE_STATUSES = new Set(["requested", "booked", "in_progress", "deferred"]);
const TERMINAL_SCHEDULE_STATUSES = new Set(["completed", "cancelled", "archived"]);
const CORE_PRESERVED_TYPE_IDS = new Set(["mot", "service"]);
const RECURRING_TYPE_IDS = new Set(
  RECURRING_MAINTENANCE_WORKFLOWS.map((workflow) => workflow.maintenanceTypeId)
);
export const FUTURE_SCHEDULE_RESET_GENERATION = "next_inspection_only_v2";
export const FUTURE_PMI_HISTORY_CLEANUP_POLICY = "remove_future_pmi_completion_history_only_v1";
const PMI_HISTORY_FIELDS = ["pmiHistory", "eightWeekInspectionHistory"];
const PMI_LAST_MARKER_FIELDS = ["lastPMI", "lastEightWeekInspection", "eightWeekInspectionStart"];
const HUMAN_EDIT_ACTION_TERMS = ["edit", "reschedul", "mov", "date chang", "schedule chang"];

const increment = (target, key) => {
  const safeKey = text(key) || "missing";
  target[safeKey] = (target[safeKey] || 0) + 1;
};

const addWeeks = (value, weeks) => {
  const date = maintenanceDateOnly(value);
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  parsed.setDate(parsed.getDate() + Math.max(1, Number(weeks || 0) || 1) * 7);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate()
  ).padStart(2, "0")}`;
};

const latestCompletionDate = (histories = []) =>
  histories
    .flatMap((history) => safeArray(history))
    .filter((entry) => text(entry?.source).toLowerCase() !== "vehicle_creation")
    .map((entry) => maintenanceDateOnly(entry?.completedDate || entry?.date || entry?.inspectionDate))
    .filter(Boolean)
    .sort()
    .at(-1) || "";

const buildLegacyVorReconciliation = (vehicle = {}) => {
  const pause = vehicle.maintenanceCountdownPause || {};
  if (text(pause.status).toLowerCase() !== "resumed" || pause.policy === "continues_while_vor") {
    return null;
  }
  const patch = {};
  const lastPmi = latestCompletionDate([vehicle.pmiHistory, vehicle.eightWeekInspectionHistory]);
  const nextPmi = addWeeks(lastPmi, Number(vehicle.pmiFreq || 8) || 8);
  if (nextPmi && vehicleDueDate(vehicle, "pmi") !== nextPmi) {
    Object.assign(patch, {
      lastPMI: lastPmi,
      eightWeekInspectionStart: lastPmi,
      nextPMI: nextPmi,
      nextEightWeekInspection: nextPmi,
    });
  }
  const lastBrake = latestCompletionDate([vehicle.brakeTestHistory]);
  const nextBrake = addWeeks(lastBrake, Number(vehicle.brakeTestFreq || 8) || 8);
  if (nextBrake && vehicleDueDate(vehicle, "brake_test") !== nextBrake) {
    Object.assign(patch, { lastBrakeTest: lastBrake, nextBrakeTest: nextBrake });
  }
  const dvsaMotExpiry = safeArray(vehicle.dvsaMotTests)
    .filter((item) => text(item?.testResult).toUpperCase() === "PASSED")
    .map((item) => maintenanceDateOnly(item?.expiryDate))
    .filter(Boolean)
    .sort()
    .at(-1) || "";
  if (dvsaMotExpiry && vehicleDueDate(vehicle, "mot") !== dvsaMotExpiry) {
    Object.assign(patch, {
      nextMOT: dvsaMotExpiry,
      nextMot: dvsaMotExpiry,
      nextMotDate: dvsaMotExpiry,
      motDueDate: dvsaMotExpiry,
      motExpiryDate: dvsaMotExpiry,
    });
  }
  if (!Object.keys(patch).length) return null;
  return {
    collection: "vehicles",
    documentId: text(vehicle.id),
    action: "repair_legacy_vor_shifted_due_dates",
    reason: "Legacy VOR countdown shifting conflicts with the current non-pausing compliance policy",
    automaticPatch: patch,
  };
};

const vehicleDueDate = (vehicle = {}, typeId) => {
  const fields = {
    mot: ["nextMOT", "nextMot", "nextMotDate", "motDueDate", "motExpiryDate"],
    service: ["nextService", "nextServiceDate"],
    pmi: ["nextPMI", "nextEightWeekInspection"],
    brake_test: ["nextBrakeTest"],
    tacho_inspection: ["nextTacho", "nextTachoInspection"],
    tacho_download: ["nextTachoDownload"],
    tail_lift: ["nextTailLift", "nextTailLiftInspection"],
    loler: ["nextLoler", "nextLOLER", "nextLOLERInspection"],
    tacho_calibration: ["nextTachoCalibration"],
  }[typeId] || [];
  return fields.map((field) => maintenanceDateOnly(vehicle[field])).find(Boolean) || "";
};

const scheduledDateForRecord = (record = {}) =>
  record.schedule?.bookingDates?.[0] ||
  record.items?.map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] ||
  "";

const sourceForRecord = (source = {}, canonical = {}) =>
  text(
    source.origin?.source ||
      canonical.origin?.source ||
      source.source ||
      source.sourceCollection
  ).toLowerCase();

const maintenanceTypeIdsForRecord = (record = {}) =>
  safeArray(record.items).map((item) => item.maintenanceTypeId).filter(Boolean).sort();

const isInspectionOnly = (maintenanceTypeIds = []) =>
  maintenanceTypeIds.length > 0 &&
  maintenanceTypeIds.every((typeId) => INSPECTION_MAINTENANCE_TYPE_IDS.includes(typeId));

const resetHistoryEntries = (source = {}) => [
  ...safeArray(source.history),
  ...safeArray(source.audit?.history),
];

const hasHumanScheduleEdit = (source = {}) => {
  const historyShowsEdit = resetHistoryEntries(source).some((entry) => {
    const action = text(entry?.action).toLowerCase();
    return HUMAN_EDIT_ACTION_TERMS.some((term) => action.includes(term));
  });
  if (historyShowsEdit) return true;

  const createdBy = text(source.createdBy || source.audit?.createdBy).toLowerCase();
  const lastEditedBy = text(source.lastEditedBy || source.audit?.updatedBy).toLowerCase();
  return Boolean(createdBy && lastEditedBy && createdBy !== lastEditedBy);
};

const countBy = (items = [], selector) => {
  const counts = new Map();
  safeArray(items).forEach((item) => {
    const key = text(selector(item)) || "missing";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => left.key.localeCompare(right.key));
};

export const classifyFutureMaintenanceResetBooking = (
  source = {},
  { asOfDate = maintenanceDateOnly(new Date()) } = {}
) => {
  const todayISO = maintenanceDateOnly(asOfDate) || maintenanceDateOnly(new Date());
  const canonical = normalizeMaintenanceRecord(source, { id: source.id });
  const appointmentDateISO = scheduledDateForRecord(canonical);
  const maintenanceTypeIds = maintenanceTypeIdsForRecord(canonical);
  const originSource = sourceForRecord(source, canonical);
  const result = {
    source,
    canonical,
    appointmentDateISO,
    maintenanceTypeIds,
    originSource,
    classification: "ignored",
    protectionReason: "",
  };

  if (!appointmentDateISO || appointmentDateISO < todayISO) return result;
  if (maintenanceTypeIds.some((typeId) => CORE_PRESERVED_TYPE_IDS.has(typeId))) {
    return {
      ...result,
      classification: "preserved_core",
      protectionReason: "contains_mot_or_service",
    };
  }
  if (!maintenanceTypeIds.length) {
    return { ...result, classification: "protected", protectionReason: "missing_maintenance_type" };
  }
  if (TERMINAL_SCHEDULE_STATUSES.has(canonical.status)) {
    return {
      ...result,
      classification: "protected",
      protectionReason: `terminal_${canonical.status}`,
    };
  }
  if (source.scheduleManuallyAdjusted === true) {
    return { ...result, classification: "protected", protectionReason: "manually_moved" };
  }
  if (hasHumanScheduleEdit(source)) {
    return { ...result, classification: "protected", protectionReason: "human_edited" };
  }
  if (["booked", "in_progress", "deferred"].includes(canonical.status)) {
    return { ...result, classification: "protected", protectionReason: "confirmed_booking" };
  }
  if (!ACTIVE_SCHEDULE_STATUSES.has(canonical.status)) {
    return { ...result, classification: "protected", protectionReason: "non_active_status" };
  }
  if (!AUTOMATIC_SCHEDULE_SOURCES.has(originSource)) {
    return {
      ...result,
      classification: "protected",
      protectionReason: "manual_or_unverified_source",
    };
  }
  if (isInspectionOnly(maintenanceTypeIds)) {
    if (!text(canonical.vehicleId)) {
      return { ...result, classification: "protected", protectionReason: "missing_vehicle" };
    }
    return {
      ...result,
      classification: "eligible_inspection",
    };
  }
  if (maintenanceTypeIds.every((typeId) => RECURRING_TYPE_IDS.has(typeId))) {
    return {
      ...result,
      classification: "protected",
      protectionReason: "canonical_recurring_due_item",
    };
  }
  return { ...result, classification: "archive" };
};

const futureCompletionAnomaliesForVehicle = (vehicle = {}, asOfDate = "") => {
  const historyFields = [
    ...ADDITIONAL_MAINTENANCE_WORKFLOWS.map((workflow) => ({
      field: workflow.historyField,
      maintenanceTypeId: workflow.maintenanceTypeId,
    })),
    { field: "eightWeekInspectionHistory", maintenanceTypeId: "pmi" },
    { field: "serviceHistory", maintenanceTypeId: "service" },
    { field: "motHistory", maintenanceTypeId: "mot" },
  ];
  const seen = new Set();
  return historyFields.flatMap(({ field, maintenanceTypeId }) =>
    safeArray(vehicle[field]).flatMap((entry, index) => {
      const completionDateISO = maintenanceDateOnly(
        entry?.completionDateISO ||
          entry?.completedDate ||
          entry?.inspectionDate ||
          entry?.date ||
          entry?.completedAt
      );
      if (!completionDateISO || completionDateISO <= asOfDate) return [];
      const key = [maintenanceTypeId, completionDateISO, text(entry?.id || entry?.bookingId)].join("|");
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        vehicleId: text(vehicle.id),
        maintenanceTypeId,
        historyField: field,
        historyIndex: index,
        completionDateISO,
        source: text(entry?.source),
        reason: "A completed-history date is in the future and must be reviewed manually",
      }];
    })
  );
};

const historyCompletionDate = (entry = {}) =>
  maintenanceDateOnly(
    entry?.completionDateISO ||
      entry?.completedDate ||
      entry?.inspectionDate ||
      entry?.date ||
      entry?.completedAt
  );

const futurePmiHistoryEntriesForVehicle = (vehicle = {}, asOfDate = "") =>
  PMI_HISTORY_FIELDS.flatMap((historyField) =>
    safeArray(vehicle[historyField]).flatMap((entry, historyIndex) => {
      const completionDateISO = historyCompletionDate(entry);
      if (!completionDateISO || completionDateISO <= asOfDate) return [];
      return [{
        historyField,
        historyIndex,
        completionDateISO,
        bookingId: text(entry?.bookingId),
        source: text(entry?.source),
        originalEntry: entry,
      }];
    })
  );

const latestValidPmiCompletionDate = (vehicle = {}, asOfDate = "") => {
  const historyDates = PMI_HISTORY_FIELDS.flatMap((historyField) =>
    safeArray(vehicle[historyField])
      .filter((entry) => text(entry?.source).toLowerCase() !== "vehicle_creation")
      .map(historyCompletionDate)
      .filter((date) => date && date <= asOfDate)
  );
  const validStoredMarkers = PMI_LAST_MARKER_FIELDS
    .map((field) => maintenanceDateOnly(vehicle[field]))
    .filter((date) => date && date <= asOfDate);
  return [...historyDates, ...validStoredMarkers].sort().at(-1) || "";
};

export const buildFuturePmiHistoryCleanupPreview = ({
  vehicles = [],
  asOfDate = maintenanceDateOnly(new Date()),
} = {}) => {
  const todayISO = maintenanceDateOnly(asOfDate) || maintenanceDateOnly(new Date());
  const candidates = safeArray(vehicles).flatMap((vehicle) => {
    const entries = futurePmiHistoryEntriesForVehicle(vehicle, todayISO);
    const futureMarkerFields = PMI_LAST_MARKER_FIELDS.filter((field) => {
      const date = maintenanceDateOnly(vehicle[field]);
      return date && date > todayISO;
    });
    if (!entries.length && !futureMarkerFields.length) return [];
    return [{
      collection: "vehicles",
      documentId: text(vehicle.id),
      vehicleId: text(vehicle.id),
      historyEntryCount: entries.length,
      affectedHistoryFields: [...new Set(entries.map((entry) => entry.historyField))].sort(),
      futureMarkerFields,
      latestValidCompletionDateISO: latestValidPmiCompletionDate(vehicle, todayISO),
      entries,
      reason: "Future-dated PMI completion history would be removed from active history and retained in the vehicle cleanup archive",
    }];
  }).sort((left, right) => left.documentId.localeCompare(right.documentId));
  const preservedNonPmiAnomalies = safeArray(vehicles)
    .flatMap((vehicle) => futureCompletionAnomaliesForVehicle(vehicle, todayISO))
    .filter((item) => item.maintenanceTypeId !== "pmi");
  const historyEntryCount = candidates.reduce(
    (total, candidate) => total + candidate.historyEntryCount,
    0
  );

  return {
    mode: "dry_run",
    readOnly: true,
    policy: FUTURE_PMI_HISTORY_CLEANUP_POLICY,
    asOfDate: todayISO,
    candidates,
    preservedNonPmiAnomalies,
    summary: {
      candidateVehicleCount: candidates.length,
      historyEntryCount,
      futureMarkerFieldCount: candidates.reduce(
        (total, candidate) => total + candidate.futureMarkerFields.length,
        0
      ),
      preservedNonPmiAnomalyCount: preservedNonPmiAnomalies.length,
      entriesByField: countBy(
        candidates.flatMap((candidate) => candidate.entries),
        (entry) => entry.historyField
      ),
    },
  };
};

export const buildFuturePmiHistoryCleanupPatch = (
  vehicle = {},
  {
    asOfDate = maintenanceDateOnly(new Date()),
    archivedAt = new Date().toISOString(),
    actor = "admin",
  } = {}
) => {
  const todayISO = maintenanceDateOnly(asOfDate) || maintenanceDateOnly(new Date());
  const removedEntries = [];
  const patch = {};

  PMI_HISTORY_FIELDS.forEach((historyField) => {
    const originalHistory = safeArray(vehicle[historyField]);
    const retainedHistory = originalHistory.filter((entry, historyIndex) => {
      const completionDateISO = historyCompletionDate(entry);
      if (!completionDateISO || completionDateISO <= todayISO) return true;
      removedEntries.push({
        historyField,
        historyIndex,
        completionDateISO,
        bookingId: text(entry?.bookingId),
        source: text(entry?.source),
        originalEntry: entry,
      });
      return false;
    });
    if (retainedHistory.length !== originalHistory.length) {
      patch[historyField] = retainedHistory;
    }
  });

  const futureMarkerFields = PMI_LAST_MARKER_FIELDS.filter((field) => {
    const date = maintenanceDateOnly(vehicle[field]);
    return date && date > todayISO;
  });
  const latestValidCompletionDateISO = latestValidPmiCompletionDate(
    { ...vehicle, ...patch },
    todayISO
  );
  futureMarkerFields.forEach((field) => {
    patch[field] = latestValidCompletionDateISO;
  });

  if (!removedEntries.length && !futureMarkerFields.length) {
    return {
      patch: {},
      removedEntries: [],
      futureMarkerFields: [],
      latestValidCompletionDateISO,
    };
  }

  const existingArchive = safeArray(vehicle.archivedFuturePmiHistory);
  const archiveKey = (entry = {}) => [
    text(entry.originalHistoryField || entry.historyField),
    maintenanceDateOnly(entry.completionDateISO),
    text(entry.bookingId || entry.originalEntry?.bookingId),
  ].join("|");
  const archivedKeys = new Set(existingArchive.map(archiveKey));
  const archiveEntries = removedEntries.map((entry) => ({
    maintenanceTypeId: "pmi",
    originalHistoryField: entry.historyField,
    originalHistoryIndex: entry.historyIndex,
    completionDateISO: entry.completionDateISO,
    bookingId: entry.bookingId,
    source: entry.source,
    reasonCode: "future_completion_date",
    archivedAtISO: archivedAt,
    archivedBy: actor,
    originalEntry: entry.originalEntry,
  })).filter((entry) => !archivedKeys.has(archiveKey(entry)));
  patch.archivedFuturePmiHistory = [
    ...existingArchive,
    ...archiveEntries,
  ];
  patch.futurePmiHistoryCleanupHistory = [
    ...safeArray(vehicle.futurePmiHistoryCleanupHistory),
    {
      action: "Removed false future PMI completion history",
      timestamp: archivedAt,
      user: actor,
      asOfDate: todayISO,
      removedEntryCount: removedEntries.length,
      repairedMarkerFields: futureMarkerFields,
      latestValidCompletionDateISO,
      source: "future_pmi_history_cleanup",
    },
  ];
  patch.futurePmiHistoryCleanupLocked = true;
  patch.updatedAt = archivedAt;
  patch.lastEditedBy = actor;

  return {
    patch,
    removedEntries,
    futureMarkerFields,
    latestValidCompletionDateISO,
  };
};

export const buildFutureMaintenanceResetPreview = ({
  maintenanceBookings = [],
  vehicles = [],
  asOfDate = maintenanceDateOnly(new Date()),
} = {}) => {
  const todayISO = maintenanceDateOnly(asOfDate) || maintenanceDateOnly(new Date());

  const assessed = maintenanceBookings.map((source) =>
    classifyFutureMaintenanceResetBooking(source, { asOfDate: todayISO })
  );

  const eligibleInspectionsByVehicle = new Map();
  assessed.forEach((entry) => {
    if (entry.classification !== "eligible_inspection") return;
    const vehicleId = text(entry.canonical.vehicleId);
    eligibleInspectionsByVehicle.set(vehicleId, [
      ...(eligibleInspectionsByVehicle.get(vehicleId) || []),
      entry,
    ]);
  });
  eligibleInspectionsByVehicle.forEach((entries) => {
    entries.sort((left, right) => {
      const dateCompare = left.appointmentDateISO.localeCompare(right.appointmentDateISO);
      if (dateCompare) return dateCompare;
      // On the same date prefer the record covering both PMI and brake test,
      // then fall back to the deterministic document id.
      const coverageCompare = right.maintenanceTypeIds.length - left.maintenanceTypeIds.length;
      if (coverageCompare) return coverageCompare;
      return text(left.canonical.id).localeCompare(text(right.canonical.id));
    });
  });
  const preservedInspectionEntries = [...eligibleInspectionsByVehicle.values()]
    .map((entries) => entries[0])
    .filter(Boolean);
  const laterInspectionEntries = [...eligibleInspectionsByVehicle.values()]
    .flatMap((entries) => entries.slice(1));

  const automaticArchiveEntries = assessed.filter((entry) => entry.classification === "archive");
  const archiveCandidates = [...automaticArchiveEntries, ...laterInspectionEntries].map((entry) => {
    const { canonical, appointmentDateISO, originSource, maintenanceTypeIds } = entry;
    const laterInspection = entry.classification === "eligible_inspection";
    return {
      collection: "maintenanceBookings",
      documentId: canonical.id,
      vehicleId: canonical.vehicleId,
      appointmentDateISO,
      maintenanceTypeIds,
      status: canonical.status,
      originSource,
      archiveReasonCode: laterInspection ? "later_automatic_inspection" : "automatic_non_core_type",
      reason: laterInspection
        ? "Later automatic Inspection would be archived; the nearest upcoming Inspection is preserved"
        : "Automatic non-core appointment would be archived and will not be rebuilt",
    };
  }).sort((left, right) =>
    `${left.appointmentDateISO}|${left.vehicleId}|${left.documentId}`.localeCompare(
      `${right.appointmentDateISO}|${right.vehicleId}|${right.documentId}`
    )
  );
  const protectedRecords = assessed.flatMap((entry) => {
    if (entry.classification !== "protected") return [];
    const {
      canonical,
      appointmentDateISO,
      originSource,
      maintenanceTypeIds,
      protectionReason,
    } = entry;
    return [{
      collection: "maintenanceBookings",
      documentId: canonical.id,
      vehicleId: canonical.vehicleId,
      appointmentDateISO,
      maintenanceTypeIds,
      status: canonical.status,
      originSource,
      protectionReason,
      reason: "Protected from automatic cleanup",
    }];
  });
  const preservedCoreRecords = assessed.flatMap((entry) => {
    if (entry.classification !== "preserved_core") return [];
    return [{
      collection: "maintenanceBookings",
      documentId: entry.canonical.id,
      vehicleId: entry.canonical.vehicleId,
      appointmentDateISO: entry.appointmentDateISO,
      maintenanceTypeIds: entry.maintenanceTypeIds,
      status: entry.canonical.status,
      originSource: entry.originSource,
      protectionReason: entry.protectionReason,
      reason: "MOT and service appointments are outside the reset scope",
    }];
  });
  const preservedInspectionRecords = preservedInspectionEntries.map((entry) => ({
      collection: "maintenanceBookings",
      documentId: entry.canonical.id,
      vehicleId: entry.canonical.vehicleId,
      appointmentDateISO: entry.appointmentDateISO,
      maintenanceTypeIds: entry.maintenanceTypeIds,
      status: entry.canonical.status,
      originSource: entry.originSource,
      protectionReason: "nearest_future_inspection",
      reason: "Nearest upcoming automatic Inspection is preserved",
    })).sort((left, right) =>
      `${left.appointmentDateISO}|${left.vehicleId}|${left.documentId}`.localeCompare(
        `${right.appointmentDateISO}|${right.vehicleId}|${right.documentId}`
      )
    );

  // Later cycles are intentionally not rebuilt. Completion of the preserved
  // next Inspection advances the vehicle due dates and creates its successor.
  const rebuildCandidates = [];
  const futureCompletionAnomalies = vehicles.flatMap((vehicle) =>
    futureCompletionAnomaliesForVehicle(vehicle, todayISO)
  );

  return {
    mode: "dry_run",
    readOnly: true,
    policy: "keep_nearest_future_inspection_per_vehicle",
    asOfDate: todayISO,
    forecastYears: [],
    archiveCandidates,
    protectedRecords,
    preservedCoreRecords,
    preservedInspectionRecords,
    rebuildCandidates,
    futureCompletionAnomalies,
    summary: {
      archiveCandidateCount: archiveCandidates.length,
      protectedRecordCount: protectedRecords.length,
      preservedCoreRecordCount: preservedCoreRecords.length,
      preservedInspectionRecordCount: preservedInspectionRecords.length,
      rebuildCandidateCount: rebuildCandidates.length,
      futureCompletionAnomalyCount: futureCompletionAnomalies.length,
      archiveByType: countBy(
        archiveCandidates,
        (item) => safeArray(item.maintenanceTypeIds).join(" + ")
      ),
      protectedByReason: countBy(protectedRecords, (item) => item.protectionReason),
      preservedCoreByType: countBy(
        preservedCoreRecords,
        (item) => safeArray(item.maintenanceTypeIds).join(" + ")
      ),
      preservedInspectionByType: countBy(
        preservedInspectionRecords,
        (item) => safeArray(item.maintenanceTypeIds).join(" + ")
      ),
      rebuildByType: countBy(
        rebuildCandidates,
        (item) => safeArray(item.maintenanceTypeIds).join(" + ")
      ),
    },
  };
};

export const auditMaintenanceDataset = ({
  maintenanceBookings = [],
  maintenanceJobs = [],
  workBookings = [],
  vehicleChecks = [],
  vehicleIssues = [],
  defectReports = [],
  serviceRecords = [],
  vehicles = [],
  companyId = "",
  forecastYear = new Date().getFullYear(),
  asOfDate = maintenanceDateOnly(new Date()),
} = {}) => {
  const generatedAt = new Date().toISOString();
  const vehicleById = new Map(vehicles.map((vehicle) => [text(vehicle.id), vehicle]));
  const statusCounts = {};
  const typeCounts = {};
  const invalidRecords = [];
  const orphanVehicleIds = new Set();
  const dueDateConflicts = [];
  const duplicateCandidates = new Map();
  let equipmentOnlyBookingCount = 0;

  const canonicalRecords = maintenanceBookings.map((booking) => {
    const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
    const validation = validateMaintenanceRecord(canonical);
    increment(statusCounts, canonical.status);
    canonical.items.forEach((item) => increment(typeCounts, item.maintenanceTypeId));

    if (!validation.ok) {
      invalidRecords.push({ id: canonical.id, issues: validation.issues });
    }
    if (!canonical.vehicleId && canonical.equipment.length) equipmentOnlyBookingCount += 1;
    if (canonical.vehicleId && !vehicleById.has(canonical.vehicleId)) {
      orphanVehicleIds.add(canonical.vehicleId);
    }

    const vehicle = vehicleById.get(canonical.vehicleId);
    canonical.items.forEach((item) => {
      const storedDue = vehicleDueDate(vehicle, item.maintenanceTypeId);
      const active = ["requested", "booked", "in_progress", "deferred"].includes(canonical.status);
      if (active && item.legalDueDateISO && storedDue && item.legalDueDateISO !== storedDue) {
        dueDateConflicts.push({
          bookingId: canonical.id,
          vehicleId: canonical.vehicleId,
          maintenanceTypeId: item.maintenanceTypeId,
          bookingLegalDueDateISO: item.legalDueDateISO,
          vehicleDueDateISO: storedDue,
        });
      }
    });

    const key = canonical.legacy.sourceDueKey || [
      canonical.vehicleId,
      canonical.items.map((item) => item.maintenanceTypeId).sort().join("+"),
      canonical.items.map((item) => item.legalDueDateISO).filter(Boolean).sort().join("+"),
      canonical.schedule.bookingDates.join("+"),
      canonical.status,
    ].join("|");
    if (key.replaceAll("|", "")) {
      duplicateCandidates.set(key, [...(duplicateCandidates.get(key) || []), canonical.id]);
    }
    return canonical;
  });
  const annualForecastReviews = vehicles.map((vehicle) => {
    const forecast = buildAnnualMaintenanceForecast({
      vehicle,
      year: Number(forecastYear),
      companyId: text(vehicle.companyId) || text(companyId),
    });
    return {
      vehicle,
      result: reconcileAnnualMaintenanceForecast({
        forecast,
        existingBookings: maintenanceBookings,
        vehicleId: text(vehicle.id),
        year: Number(forecastYear),
      }),
    };
  });
  const vorInspectionCancellationCandidates = vehicles.flatMap((vehicle) => {
    if (!isVehicleOutOfUse(vehicle)) return [];
    const offRoadDate = getVehicleVorStartDate(vehicle);
    if (!offRoadDate) return [];
    return maintenanceBookings
      .filter(
        (booking) =>
          text(booking.vehicleId) === text(vehicle.id) &&
          isVorInspectionCancellationCandidate(booking, { vehicle, offRoadDate })
      )
      .map((booking) => ({
        collection: "maintenanceBookings",
        documentId: text(booking.id),
        vehicleId: text(vehicle.id),
        action: "cancel_invalid_vor_inspection_requirement",
        reason:
          "Vehicle is VOR; this previous PMI/brake plan is invalid until a fresh return inspection is scheduled",
        automaticPatch: buildVorInspectionCancellationPatch(booking, {
          cancelledAt: generatedAt,
          cancelledBy: "safe_reconciliation",
          cancellationSource: "vehicle_vor_reconciliation",
          sourceRecordId: text(vehicle.activeVorRecordId),
        }),
      }));
  });
  const scheduledAppointmentCandidates = annualForecastReviews.flatMap(({ result }) =>
    result.create.map((record) => ({
      collection: "maintenanceBookings",
      documentId: record.id,
      action: "create_missing_requested_due_item",
      reason: `${record.items.map((item) => item.maintenanceTypeId).join(" + ")} has no canonical ${forecastYear} due item`,
      idempotentKey: record.requirementKey,
      automaticPatch: buildAnnualMaintenancePersistencePayload(record, {
        createdBy: "safe_reconciliation",
      }),
    }))
  );
  const reforecastCandidates = annualForecastReviews.flatMap(({ result }) =>
    result.supersede.map((record) => ({
      collection: "maintenanceBookings",
      documentId: record.id,
      action: "supersede_untouched_automatic_appointment",
      reason: `Untouched automatic appointment is no longer part of the ${forecastYear} vehicle schedule`,
      automaticPatch: {
        status: "Archived",
        archiveReason: "Schedule changed; replaced by the canonical annual forecast.",
      },
    }))
  );
  const suppressedDuplicateReviews = annualForecastReviews.flatMap(({ result }) =>
    result.duplicate.map((record) => ({
      collection: "maintenanceBookings",
      documentId: record.id,
      action: "review_duplicate_requirement_key",
      reason: "More than one saved appointment uses the same legal requirement key",
      automaticPatch: null,
    }))
  );
  const ambiguousLegacyMatches = annualForecastReviews.flatMap(({ result }) =>
    safeArray(result.ambiguous).map((record) => ({
      collection: "maintenanceBookings",
      documentId: record.id,
      action: "review_ambiguous_legacy_requirement_match",
      reason: "More than one confirmed legacy booking could cover the same legal requirement",
      automaticPatch: null,
    }))
  );
  const completedWithoutEvidence = canonicalRecords.flatMap((record) =>
    record.items
      .filter((item) =>
        item.status === "completed" &&
        ["pmi", "brake_test"].includes(item.maintenanceTypeId) &&
        item.evidenceStatus !== "attached"
      )
      .map((item) => ({
        bookingId: record.id,
        vehicleId: record.vehicleId,
        maintenanceTypeId: item.maintenanceTypeId,
        completionDateISO: item.completionDateISO,
      }))
  );
  const exactLegacyJobLinks = maintenanceJobs.flatMap((job) => {
    const vehicleId = text(job.assetId || job.vehicleId);
    const typeId = text(job.type).toLowerCase();
    const date = maintenanceDateOnly(job.plannedDate || job.dueDate);
    if (!vehicleId || !typeId || !date) return [];
    const matches = canonicalRecords.filter((record) =>
      record.vehicleId === vehicleId &&
      record.items.some((item) => item.maintenanceTypeId === typeId) &&
      (record.schedule.bookingDates.includes(date) ||
        record.items.some((item) => item.legalDueDateISO === date))
    );
    if (matches.length !== 1) return [];
    return [{
      collection: "maintenanceJobs",
      documentId: text(job.id),
      action: "link_exact_canonical_record",
      reason: `Unique exact match on vehicle, type and date to ${matches[0].id}`,
      automaticPatch: { canonicalMaintenanceBookingId: matches[0].id },
    }];
  });
  const legacyVorReconciliation = vehicles.map(buildLegacyVorReconciliation).filter(Boolean);
  const reconciliationPreview = [
    ...invalidRecords.map((record) => ({
      collection: "maintenanceBookings",
      documentId: record.id,
      action: "manual_link_or_archive",
      reason: record.issues.join(", "),
      automaticPatch: null,
    })),
    ...dueDateConflicts.map((conflict) => ({
      collection: "maintenanceBookings",
      documentId: conflict.bookingId,
      action: "review_active_booking_against_vehicle_due_date",
      reason: `${conflict.maintenanceTypeId} legal due ${conflict.bookingLegalDueDateISO} conflicts with vehicle due ${conflict.vehicleDueDateISO}`,
      automaticPatch: null,
    })),
    ...legacyVorReconciliation,
    ...exactLegacyJobLinks,
    ...vorInspectionCancellationCandidates,
    ...scheduledAppointmentCandidates,
    ...reforecastCandidates,
    ...suppressedDuplicateReviews,
    ...ambiguousLegacyMatches,
  ];
  const futureScheduleReset = buildFutureMaintenanceResetPreview({
    maintenanceBookings,
    vehicles,
    asOfDate,
  });
  const futurePmiHistoryCleanup = buildFuturePmiHistoryCleanupPreview({
    vehicles,
    asOfDate,
  });

  return {
    schemaVersion: 1,
    generatedAt,
    readOnly: true,
    sourceCounts: {
      maintenanceBookings: maintenanceBookings.length,
      maintenanceJobs: maintenanceJobs.length,
      workBookings: workBookings.length,
      vehicleChecks: vehicleChecks.length,
      vehicleIssues: vehicleIssues.length,
      defectReports: defectReports.length,
      serviceRecords: serviceRecords.length,
      vehicles: vehicles.length,
    },
    canonicalBookingCount: canonicalRecords.length,
    equipmentOnlyBookingCount,
    statusCounts,
    typeCounts,
    invalidRecords,
    orphanVehicleIds: [...orphanVehicleIds].sort(),
    dueDateConflicts,
    completedWithoutEvidence,
    exactLegacyJobLinks,
    requestedRecordCandidates: scheduledAppointmentCandidates,
    scheduledAppointmentCandidates,
    reforecastCandidates,
    vorInspectionCancellationCandidates,
    duplicateGroups: [...duplicateCandidates.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({ key, ids }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    ambiguousLegacyMatches,
    reconciliationPreview,
    futureScheduleReset,
    futurePmiHistoryCleanup,
    summary: {
      invalidRecordCount: invalidRecords.length,
      orphanVehicleCount: orphanVehicleIds.size,
      dueDateConflictCount: dueDateConflicts.length,
      duplicateGroupCount: [...duplicateCandidates.values()].filter((ids) => ids.length > 1).length,
      automaticPatchCount: reconciliationPreview.filter((item) => item.automaticPatch).length,
      manualReviewCount: reconciliationPreview.filter((item) => !item.automaticPatch).length,
      missingRequestedRecordCount: scheduledAppointmentCandidates.length,
      missingBookedAppointmentCount: scheduledAppointmentCandidates.length,
      reforecastAppointmentCount: reforecastCandidates.length,
      vorInspectionCancellationCount: vorInspectionCancellationCandidates.length,
      exactLegacyLinkCount: exactLegacyJobLinks.length,
      completedWithoutEvidenceCount: completedWithoutEvidence.length,
      ambiguousLegacyMatchCount: ambiguousLegacyMatches.length,
    },
  };
};

export const selectSafeMaintenanceReconciliationActions = (report = {}) => {
  const conflictingVehicleTypes = new Set(
    safeArray(report.dueDateConflicts).map((conflict) =>
      `${text(conflict?.vehicleId)}|${text(conflict?.maintenanceTypeId).toLowerCase()}`
    )
  );
  const safeActionNames = new Set([
    "create_missing_booked_appointment",
    "create_missing_requested_due_item",
    "supersede_untouched_automatic_appointment",
    "link_exact_canonical_record",
    "cancel_invalid_vor_inspection_requirement",
  ]);

  return safeArray(report.reconciliationPreview).filter((item) => {
    if (!safeActionNames.has(item?.action) || !item?.automaticPatch) return false;
    if (item.action !== "create_missing_requested_due_item") return true;
    const vehicleId = text(item.automaticPatch.vehicleId);
    return !safeArray(item.automaticPatch.items).some((maintenanceItem) =>
      conflictingVehicleTypes.has(
        `${vehicleId}|${text(maintenanceItem?.maintenanceTypeId).toLowerCase()}`
      )
    );
  });
};
