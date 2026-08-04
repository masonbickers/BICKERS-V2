import {
  getIsoWeekLabel,
  isMotNotApplicable,
  syncVehicleOperatingStatus,
} from "./maintenanceSchema.js";

export const HGV_COMPLIANCE_MIGRATION_VERSION = 1;
export const HGV_COMPLIANCE_TYPES = Object.freeze(["pmi", "brake_test"]);

const text = (value) => String(value || "").trim();
const safeArray = (value) => (Array.isArray(value) ? value : []);

export const complianceDateOnly = (value) => {
  if (!value) return "";
  if (typeof value?.toDate === "function") return complianceDateOnly(value.toDate());
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : complianceDateOnly(parsed);
};

const localDate = (value) => {
  const match = complianceDateOnly(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isoWeekStart = (value) => {
  const date = localDate(value);
  if (!date) return null;
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
};

const addDays = (value, days) => {
  const date = localDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return complianceDateOnly(date);
};

export const addComplianceWeeks = (value, weeks) =>
  addDays(value, Math.max(1, Number(weeks || 0) || 1) * 7);

export const isHgvComplianceVehicle = (vehicle = {}) => {
  const category = text(vehicle.category).toLowerCase();
  if (category === "hgv" || category === "hgv trailers" || category === "hgv trailer") {
    return true;
  }
  const haystack = [vehicle.category, vehicle.type, vehicle.name, vehicle.manufacturer, vehicle.model]
    .map((value) => text(value).toLowerCase())
    .join(" ");
  return haystack.includes("lorry") || haystack.includes("transport");
};

export const isOffFleetVehicle = (vehicle = {}) =>
  [
    vehicle.operationalStatus,
    vehicle.fleetStatus,
    vehicle.vehicleStatus,
    vehicle.availabilityStatus,
    vehicle.status,
  ].some((value) => text(value).toLowerCase() === "off fleet");

const hiddenMaintenance = (vehicle) =>
  new Set(safeArray(vehicle?.hiddenAdditionalMaintenance).map((value) => text(value).toLowerCase()));

export const isHgvComplianceTypeEnabled = (vehicle = {}, type) => {
  if (!isHgvComplianceVehicle(vehicle)) return false;
  const hidden = hiddenMaintenance(vehicle);
  if (type === "mot") return !isMotNotApplicable(vehicle);
  if (type === "pmi") {
    return !hidden.has("pmi") && !hidden.has("pmiinspection");
  }
  if (type === "brake_test") {
    return !hidden.has("brake_test") && !hidden.has("braketest");
  }
  return false;
};

export const getHgvComplianceDueDates = (vehicle = {}) => ({
  pmi: complianceDateOnly(vehicle.nextPMI || vehicle.nextEightWeekInspection),
  brake_test: complianceDateOnly(vehicle.nextBrakeTest),
  mot: complianceDateOnly(
    vehicle.nextMOT ||
      vehicle.nextMot ||
      vehicle.nextMotDate ||
      vehicle.motDueDate ||
      vehicle.motExpiryDate
  ),
});

const getCompletionHistory = (vehicle, type) => {
  if (type === "pmi") {
    return [
      ...safeArray(vehicle.pmiHistory),
      ...safeArray(vehicle.eightWeekInspectionHistory),
    ].filter((entry) => text(entry?.source).toLowerCase() !== "vehicle_creation");
  }
  if (type === "brake_test") {
    return safeArray(vehicle.brakeTestHistory).filter(
      (entry) => text(entry?.source).toLowerCase() !== "vehicle_creation"
    );
  }
  if (type === "mot") {
    const dvsaPassed = safeArray(vehicle.dvsaMotTests)
      .filter((item) => text(item?.testResult).toUpperCase() === "PASSED")
      .map((item) => ({
        completedDate: item.completedDate,
        source: "dvsa",
        motTestNumber: item.motTestNumber || "",
      }));
    return [
      ...safeArray(vehicle.motHistory).filter(
        (entry) => text(entry?.source).toLowerCase() !== "vehicle_creation"
      ),
      ...dvsaPassed,
    ];
  }
  return [];
};

const getLatestHgvCompletion = (vehicle, type, asOfDate = new Date()) => {
  const asOfDateISO = complianceDateOnly(asOfDate);
  return (
  getCompletionHistory(vehicle, type)
    .map((entry) => ({
      entry,
      completedDate: complianceDateOnly(
        entry?.completedDate || entry?.date || entry?.inspectionDate
      ),
    }))
    .filter((item) => item.completedDate && (!asOfDateISO || item.completedDate <= asOfDateISO))
    .sort((left, right) => left.completedDate.localeCompare(right.completedDate))
    .at(-1) || null
  );
};

export const getLatestHgvCompletionDate = (vehicle, type, asOfDate = new Date()) =>
  getLatestHgvCompletion(vehicle, type, asOfDate)?.completedDate || "";

export const getHgvComplianceVorDisplayRows = (vehicle = {}) => {
  const pendingReturnInspection = vehicle.pendingReturnInspection || {};
  if (
    text(pendingReturnInspection.status).toLowerCase() === "inspection_required" &&
    complianceDateOnly(pendingReturnInspection.inspectionDate)
  ) {
    const inspectionDate = complianceDateOnly(pendingReturnInspection.inspectionDate);
    return ["brake_test", "pmi"].map((type) => ({
      type,
      status: "return_inspection_required",
      date: inspectionDate,
    }));
  }

  return Object.values(vehicle?.complianceVor?.reasons || {})
    .map((reason) => ({
      type: reason?.type || "",
      status: reason?.resolvedAt ? "resolved" : "expired",
      date: complianceDateOnly(reason?.resolvedAt ? reason?.completionDate : reason?.dueDate),
    }))
    .filter((reason) => HGV_COMPLIANCE_TYPES.includes(text(reason.type).toLowerCase()));
};

export const isComplianceDueWeekPast = (dueDate, asOfDate = new Date()) => {
  const dueWeekStart = isoWeekStart(dueDate);
  const asOf = localDate(asOfDate);
  if (!dueWeekStart || !asOf) return false;
  const firstDayAfterDueWeek = new Date(dueWeekStart);
  firstDayAfterDueWeek.setDate(firstDayAfterDueWeek.getDate() + 7);
  return asOf.getTime() >= firstDayAfterDueWeek.getTime();
};

const normalizeReason = (reason = {}, type) => ({
  type,
  dueDate: complianceDateOnly(reason.dueDate),
  dueIsoWeek: text(reason.dueIsoWeek),
  triggeredAt: text(reason.triggeredAt),
  resolvedAt: text(reason.resolvedAt),
  completionDate: complianceDateOnly(reason.completionDate),
  completionRef: text(reason.completionRef),
});

export const evaluateHgvCompliance = (
  vehicle = {},
  { asOfDate = new Date(), evaluatedAt = new Date().toISOString() } = {}
) => {
  if (!isHgvComplianceVehicle(vehicle) || isOffFleetVehicle(vehicle)) {
    return {
      complianceVor: vehicle.complianceVor || { state: "clear", reasons: {} },
      shouldStartVor: false,
      unresolvedTypes: [],
    };
  }

  const previous = vehicle.complianceVor || {};
  const reasons = Object.fromEntries(
    Object.entries(previous.reasons || {}).map(([type, reason]) => [
      type,
      normalizeReason(reason, type),
    ])
  );
  const dueDates = getHgvComplianceDueDates(vehicle);
  let shouldStartVor = false;

  HGV_COMPLIANCE_TYPES.forEach((type) => {
    if (!isHgvComplianceTypeEnabled(vehicle, type)) {
      if (reasons[type] && !reasons[type].resolvedAt) {
        reasons[type] = { ...reasons[type], resolvedAt: evaluatedAt };
      }
      return;
    }
    const dueDate = dueDates[type];
    if (!dueDate) return;
    const latestCompletion = getLatestHgvCompletion(vehicle, type, asOfDate);
    const overdue = isComplianceDueWeekPast(dueDate, asOfDate);
    const existing = reasons[type];

    if (overdue) {
      if (!existing || existing.resolvedAt || existing.dueDate !== dueDate) {
        reasons[type] = {
          type,
          dueDate,
          dueIsoWeek: getIsoWeekLabel(dueDate),
          triggeredAt: evaluatedAt,
          resolvedAt: "",
          completionDate: "",
          completionRef: "",
        };
        shouldStartVor = true;
      }
      return;
    }

    if (existing && !existing.resolvedAt && latestCompletion?.completedDate) {
      reasons[type] = {
        ...existing,
        resolvedAt: evaluatedAt,
        completionDate: latestCompletion.completedDate,
        completionRef: text(
          latestCompletion.entry?.bookingId ||
            latestCompletion.entry?.motTestNumber ||
            latestCompletion.entry?.sourceRecordId
        ),
      };
    }
  });

  const unresolvedTypes = HGV_COMPLIANCE_TYPES.filter(
    (type) => reasons[type] && !reasons[type].resolvedAt
  );
  const wasActive = ["active", "ready_for_release"].includes(text(previous.state).toLowerCase());
  const startedDate = complianceDateOnly(previous.startedDate || previous.triggeredAt);
  const latestPmi = getLatestHgvCompletionDate(vehicle, "pmi", asOfDate);
  const freshPmiCompletedAt =
    startedDate && latestPmi && latestPmi >= startedDate
      ? latestPmi
      : complianceDateOnly(previous.freshPmiCompletedAt);
  const state = unresolvedTypes.length
    ? "active"
    : wasActive || shouldStartVor
      ? "ready_for_release"
      : "clear";

  return {
    shouldStartVor: shouldStartVor || (unresolvedTypes.length > 0 && !wasActive),
    unresolvedTypes,
    complianceVor: {
      version: 1,
      state,
      startedDate:
        complianceDateOnly(previous.startedDate) ||
        (state !== "clear" ? complianceDateOnly(asOfDate) : ""),
      triggeredAt: text(previous.triggeredAt) || (state !== "clear" ? evaluatedAt : ""),
      reasons,
      freshPmiCompletedAt,
      releaseRequired: state !== "clear",
      lastEvaluatedAt: evaluatedAt,
      releasedAt: text(previous.releasedAt),
      releasedBy: previous.releasedBy || null,
    },
  };
};

const appendUniqueHistory = (history, entry) => {
  const key = `${entry.maintenanceTypeId}|${entry.completedDate}`;
  if (
    safeArray(history).some(
      (item) =>
        `${item?.maintenanceTypeId || entry.maintenanceTypeId}|${complianceDateOnly(item?.completedDate)}` ===
        key
    )
  ) {
    return safeArray(history);
  }
  return [...safeArray(history), entry].sort((a, b) =>
    complianceDateOnly(a?.completedDate).localeCompare(complianceDateOnly(b?.completedDate))
  );
};

export const buildHgvComplianceMigrationPatch = (
  vehicle = {},
  { migratedAt = new Date().toISOString() } = {}
) => {
  if (!isHgvComplianceVehicle(vehicle)) return { patch: {}, issues: [] };
  if (Number(vehicle.hgvComplianceMigrationVersion || 0) >= HGV_COMPLIANCE_MIGRATION_VERSION) {
    return { patch: {}, issues: [] };
  }

  const patch = {};
  const issues = [];
  const addLegacy = (type, dateValue, historyField, maintenanceTypeId, label) => {
    const completedDate = complianceDateOnly(dateValue);
    if (!completedDate) {
      if (dateValue) issues.push(`${type}: invalid completion date ${String(dateValue)}`);
      return;
    }
    patch[historyField] = appendUniqueHistory(
      patch[historyField] || vehicle[historyField],
      {
      maintenanceTypeId,
      label,
      completedDate,
      completedAt: migratedAt,
      source: "legacy_vehicle_field",
      migrated: true,
      documents: [],
      }
    );
  };

  let canonicalPmiHistory = safeArray(vehicle.pmiHistory);
  safeArray(vehicle.eightWeekInspectionHistory).forEach((entry) => {
    const completedDate = complianceDateOnly(
      entry?.completedDate || entry?.date || entry?.inspectionDate
    );
    if (!completedDate) {
      issues.push("PMI: invalid legacy eight-week history date");
      return;
    }
    canonicalPmiHistory = appendUniqueHistory(canonicalPmiHistory, {
      ...entry,
      maintenanceTypeId: "pmi",
      label: entry?.label || "PMI inspection",
      completedDate,
      completedAt: entry?.completedAt || entry?.recordedAt || migratedAt,
      source: entry?.source || "legacy_eight_week_history",
      migrated: true,
      documents: safeArray(entry?.documents),
    });
  });
  if (canonicalPmiHistory.length !== safeArray(vehicle.pmiHistory).length) {
    patch.pmiHistory = canonicalPmiHistory;
  }

  addLegacy("PMI", vehicle.lastPMI || vehicle.eightWeekInspectionStart, "pmiHistory", "pmi", "PMI inspection");
  addLegacy("Brake test", vehicle.lastBrakeTest, "brakeTestHistory", "brake_test", "Brake test");

  let motHistory = safeArray(vehicle.motHistory);
  safeArray(vehicle.dvsaMotTests)
    .filter((item) => text(item?.testResult).toUpperCase() === "PASSED")
    .forEach((item) => {
      const completedDate = complianceDateOnly(item?.completedDate);
      if (!completedDate) {
        if (item?.completedDate) {
          issues.push(`MOT: invalid DVSA completion date ${String(item.completedDate)}`);
        }
        return;
      }
      motHistory = appendUniqueHistory(motHistory, {
        maintenanceTypeId: "mot",
        label: "MOT",
        completedDate,
        completedAt: migratedAt,
        source: "dvsa",
        migrated: true,
        motTestNumber: text(item?.motTestNumber),
        documents: [],
      });
    });
  if (motHistory.length !== safeArray(vehicle.motHistory).length) patch.motHistory = motHistory;

  const pmiHistory = patch.pmiHistory || safeArray(vehicle.pmiHistory);
  const latestPmiHistory = pmiHistory
    .map((entry) => complianceDateOnly(entry?.completedDate))
    .filter(Boolean)
    .sort()
    .at(-1) || "";
  const storedLastPMI = complianceDateOnly(
    vehicle.lastPMI || vehicle.eightWeekInspectionStart
  );
  if (storedLastPMI && latestPmiHistory && storedLastPMI !== latestPmiHistory) {
    issues.push(
      `PMI: Last PMI ${storedLastPMI} conflicts with latest history ${latestPmiHistory}; latest completion retained`
    );
  }
  const lastPMI = [storedLastPMI, latestPmiHistory].filter(Boolean).sort().at(-1) || "";
  const pmiFrequency = Math.max(1, Number(vehicle.pmiFreq || 8) || 8);
  if (lastPMI) {
    const calculatedNextPMI = addComplianceWeeks(lastPMI, pmiFrequency);
    const storedNextPMI = complianceDateOnly(
      vehicle.nextPMI || vehicle.nextEightWeekInspection
    );
    patch.lastPMI = lastPMI;
    patch.pmiFreq = String(pmiFrequency);
    patch.nextPMI =
      storedNextPMI && storedNextPMI > lastPMI
        ? storedNextPMI
        : calculatedNextPMI;
    patch.pmiISOWeek = getIsoWeekLabel(patch.nextPMI);
    patch.eightWeekInspectionStart = lastPMI;
    patch.nextEightWeekInspection = patch.nextPMI;
    patch.eightWeekInspectionISOWeek = patch.pmiISOWeek;
    if (vehicle.futurePmiHistoryCleanupLocked !== true) {
      patch.eightWeekInspectionHistory = pmiHistory;
    }
  }
  patch.hgvComplianceMigrationVersion = HGV_COMPLIANCE_MIGRATION_VERSION;
  patch.hgvComplianceMigratedAt = migratedAt;

  return { patch, issues };
};

export const syncCanonicalPmiAliases = (
  vehicle = {},
  { asOfDate = new Date() } = {}
) => {
  const asOfDateISO = complianceDateOnly(asOfDate);
  const sourceHistory = safeArray(vehicle.pmiHistory).length
    ? safeArray(vehicle.pmiHistory)
    : safeArray(vehicle.eightWeekInspectionHistory);
  const pmiHistory = sourceHistory.filter((entry) => {
    const completedDate = complianceDateOnly(
      entry?.completedDate || entry?.date || entry?.inspectionDate
    );
    return !completedDate || !asOfDateISO || completedDate <= asOfDateISO;
  });
  const latestHistoryDate = pmiHistory
    .filter((entry) => text(entry?.source).toLowerCase() !== "vehicle_creation")
    .map((entry) => complianceDateOnly(entry?.completedDate || entry?.date || entry?.inspectionDate))
    .filter(Boolean)
    .sort()
    .at(-1) || "";
  const storedLastPMI = complianceDateOnly(vehicle.lastPMI || vehicle.eightWeekInspectionStart);
  const validStoredLastPMI = storedLastPMI && (!asOfDateISO || storedLastPMI <= asOfDateISO)
    ? storedLastPMI
    : "";
  const lastPMI = [validStoredLastPMI, latestHistoryDate].filter(Boolean).sort().at(-1) || "";
  const nextPMI = complianceDateOnly(vehicle.nextPMI || vehicle.nextEightWeekInspection);
  const aliases = {
    lastPMI,
    nextPMI,
    pmiFreq: String(Math.max(1, Number(vehicle.pmiFreq || 8) || 8)),
    pmiISOWeek: getIsoWeekLabel(nextPMI),
    pmiHistory,
    eightWeekInspectionStart: lastPMI,
    nextEightWeekInspection: nextPMI,
    eightWeekInspectionISOWeek: getIsoWeekLabel(nextPMI),
  };
  if (vehicle.futurePmiHistoryCleanupLocked !== true) {
    aliases.eightWeekInspectionHistory = pmiHistory;
  }
  return aliases;
};

export const complianceVorReleaseBlocker = (vehicle = {}) => {
  const complianceVor = vehicle.complianceVor || {};
  const unresolved = Object.values(complianceVor.reasons || {}).filter(
    (reason) =>
      reason &&
      ["pmi", "brake_test"].includes(text(reason.type).toLowerCase()) &&
      !reason.resolvedAt
  );
  if (unresolved.length) {
    return `Complete all overdue compliance items before release: ${unresolved
      .map((reason) => String(reason.type || "").replace("_", " ").toUpperCase())
      .join(", ")}.`;
  }
  return "";
};

export const complianceVorReturnInspectionBlocker = (
  _vehicle = {},
  _options = {}
) => "";

export const buildComplianceReleasePatch = (
  vehicle = {},
  { releasedAt = new Date().toISOString(), releasedBy = null } = {}
) => ({
  ...syncVehicleOperatingStatus({}, "Active"),
  complianceVor: {
    ...(vehicle.complianceVor || {}),
    state: "clear",
    releaseRequired: false,
    releasedAt,
    releasedBy,
    lastEvaluatedAt: releasedAt,
  },
});
