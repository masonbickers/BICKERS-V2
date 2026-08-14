export const MAINTENANCE_JOB_STATUSES = [
  "planned",
  "awaiting_parts",
  "in_progress",
  "qa",
  "complete",
  "closed",
];

// One registry owns every genuinely recurring workshop-maintenance workflow.
// Frequencies are stored as weeks throughout the current vehicle data model.
// Legacy eight-week / lorry inspection fields are aliases of PMI, not a
// separate recurring requirement.
export const RECURRING_MAINTENANCE_WORKFLOWS = Object.freeze([
  { key: "mot", maintenanceTypeId: "mot", label: "MOT", dueKey: "mot", lastField: "lastMOT", lastFields: ["lastMOT", "lastMot"], nextField: "nextMOT", nextFields: ["nextMOT", "nextMot", "motExpiryDate", "dvsaMotExpiryDate"], frequencyField: "motFreq", frequencyFields: ["motFreq"], isoWeekField: "motISOWeek", historyField: "motHistory", documentsField: "motDocuments", warningWeeks: 3, autoVorAfterDueWeek: true, dvsaAuthoritative: true },
  { key: "service", maintenanceTypeId: "service", label: "Service", dueKey: "service", lastField: "lastService", lastFields: ["lastService"], nextField: "nextService", nextFields: ["nextService", "nextServiceDate"], frequencyField: "serviceFreq", frequencyFields: ["serviceFreq"], isoWeekField: "serviceISOWeek", historyField: "serviceHistory", documentsField: "serviceDocuments", warningWeeks: 4, autoVorAfterDueWeek: false },
  { key: "pmi", maintenanceTypeId: "pmi", label: "PMI inspection", dueKey: "pmi", lastField: "lastPMI", lastFields: ["lastPMI", "lastEightWeekInspection", "eightWeekInspectionStart", "lastLorryInspection"], nextField: "nextPMI", nextFields: ["nextPMI", "nextPMIInspection", "nextEightWeekInspection", "nextLorryInspection"], frequencyField: "pmiFreq", frequencyFields: ["pmiFreq", "eightWeekInspectionFreq", "lorryInspectionFreq"], isoWeekField: "pmiISOWeek", historyField: "pmiHistory", documentsField: "pmiDocuments", warningWeeks: 1, autoVorAfterDueWeek: true },
  { key: "brake_test", maintenanceTypeId: "brake_test", label: "Brake test", dueKey: "brakeTest", lastField: "lastBrakeTest", lastFields: ["lastBrakeTest"], nextField: "nextBrakeTest", nextFields: ["nextBrakeTest"], frequencyField: "brakeTestFreq", frequencyFields: ["brakeTestFreq"], isoWeekField: "brakeISOWeek", historyField: "brakeTestHistory", documentsField: "brakeTestDocuments", warningWeeks: 1, autoVorAfterDueWeek: true },
  { key: "tacho_inspection", maintenanceTypeId: "tacho_inspection", label: "Tacho inspection", dueKey: "tachoInspection", lastField: "lastTacho", lastFields: ["lastTacho", "lastTachoInspection"], nextField: "nextTacho", nextFields: ["nextTacho", "nextTachoInspection"], frequencyField: "tachoFreq", frequencyFields: ["tachoFreq", "tachoInspectionFreq"], isoWeekField: "tachoISOWeek", historyField: "tachoInspectionHistory", documentsField: "tachoInspectionDocuments", warningWeeks: 3, autoVorAfterDueWeek: false },
  { key: "tacho_download", maintenanceTypeId: "tacho_download", label: "Tacho download", dueKey: "tachoDownload", lastField: "lastTachoDownload", lastFields: ["lastTachoDownload"], nextField: "nextTachoDownload", nextFields: ["nextTachoDownload"], frequencyField: "tachoDownloadFreq", frequencyFields: ["tachoDownloadFreq"], isoWeekField: "tachoDownloadISOWeek", historyField: "tachoDownloadHistory", documentsField: "tachoDownloadDocuments", warningWeeks: 3, autoVorAfterDueWeek: false },
  { key: "tail_lift", maintenanceTypeId: "tail_lift", label: "Tail-lift inspection", dueKey: "tailLift", lastField: "lastTailLift", lastFields: ["lastTailLift"], nextField: "nextTailLift", nextFields: ["nextTailLift", "nextTailLiftInspection"], frequencyField: "tailLiftFreq", frequencyFields: ["tailLiftFreq"], isoWeekField: "tailLiftISOWeek", historyField: "tailLiftHistory", documentsField: "tailLiftDocuments", warningWeeks: 3, autoVorAfterDueWeek: false },
  { key: "loler", maintenanceTypeId: "loler", label: "LOLER", dueKey: "loler", lastField: "lastLoler", lastFields: ["lastLoler", "lastLOLER"], nextField: "nextLoler", nextFields: ["nextLoler", "nextLOLER", "nextLOLERInspection"], frequencyField: "lolerFreq", frequencyFields: ["lolerFreq", "lOLERFreq"], isoWeekField: "lolerISOWeek", historyField: "lolerHistory", documentsField: "lolerDocuments", warningWeeks: 3, autoVorAfterDueWeek: false },
  { key: "tacho_calibration", maintenanceTypeId: "tacho_calibration", label: "Tacho calibration", dueKey: "tachoCalibration", lastField: "lastTachoCalibration", lastFields: ["lastTachoCalibration"], nextField: "nextTachoCalibration", nextFields: ["nextTachoCalibration"], frequencyField: "tachoCalibrationFreq", frequencyFields: ["tachoCalibrationFreq"], isoWeekField: "tachoCalibrationISOWeek", historyField: "tachoCalibrationHistory", documentsField: "tachoCalibrationDocuments", warningWeeks: 3, autoVorAfterDueWeek: false },
]);

export const getRecurringMaintenanceWorkflow = (maintenanceTypeId) =>
  RECURRING_MAINTENANCE_WORKFLOWS.find(
    (workflow) => workflow.maintenanceTypeId === String(maintenanceTypeId || "").trim().toLowerCase()
  ) || null;

export const getConfiguredMaintenanceFrequencyWeeks = (vehicle = {}, workflowOrTypeId) => {
  const workflow = typeof workflowOrTypeId === "object"
    ? workflowOrTypeId
    : getRecurringMaintenanceWorkflow(workflowOrTypeId);
  if (!workflow) return 0;
  return (workflow.frequencyFields || [workflow.frequencyField])
    .map((field) => Number(vehicle?.[field] || 0))
    .find((value) => Number.isFinite(value) && value > 0) || 0;
};

export const ADDITIONAL_MAINTENANCE_WORKFLOWS = Object.freeze(
  RECURRING_MAINTENANCE_WORKFLOWS.filter(
    (workflow) => !["mot", "service"].includes(workflow.maintenanceTypeId)
  )
);

// The main diary historically surfaced only these register-derived reminders.
// Other maintenance workflows remain available in the maintenance system, but
// must not be presented as booked calendar appointments.
export const CALENDAR_REMINDER_WORKFLOW_KEYS = Object.freeze([
  "brake_test",
  "pmi",
]);

export const CORE_MAINTENANCE_TYPE_IDS = Object.freeze({
  MOT: "mot",
  SERVICE: "service",
  INSPECTION: "eight_week_inspection",
  WORK: "work",
});

export const maintenanceTypeIdForCoreType = (type) =>
  CORE_MAINTENANCE_TYPE_IDS[String(type || "").trim().toUpperCase()] || "work";

export const getMaintenanceTypeId = (record = {}) =>
  String(record?.maintenanceTypeId || "").trim().toLowerCase();

const DUE_FIELD_CANDIDATES = {
  mot: ["nextMOT", "nextMot", "nextMotDate", "motDate", "motDue", "motDueDate", "motExpiryDate"],
  service: ["nextService", "nextServiceDate", "serviceDate", "serviceDue", "serviceDueDate", "nextSvc"],
  inspection: ["nextEightWeekInspection", "eightWeekInspectionStart", "inspectionDate"],
  rfl: ["nextRFL"],
  tachoInspection: ["nextTacho", "nextTachoInspection"],
  brakeTest: ["nextBrakeTest"],
  pmi: ["nextPMI", "nextPMIInspection"],
  tachoDownload: ["nextTachoDownload"],
  tailLift: ["nextTailLift", "nextTailLiftInspection"],
  loler: ["nextLoler", "nextLOLER", "nextLOLERInspection"],
  tachoCalibration: ["nextTachoCalibration"],
};

const OUT_OF_USE_STATUS_VALUES = new Set([
  "vor",
  "out of use",
  "out-of-use",
  "out_of_use",
  "inactive",
  "off road",
  "off-road",
  "off_road",
]);

export const ACTIVE_VEHICLE_STATUS = "Active";
export const VOR_VEHICLE_STATUS = "VOR";

export const isSelectableVehicleOperatingStatus = (value) =>
  [ACTIVE_VEHICLE_STATUS, VOR_VEHICLE_STATUS].includes(String(value || "").trim());

export const normalizeVehicleOperatingStatus = (valueOrAsset = {}) => {
  const values =
    valueOrAsset && typeof valueOrAsset === "object"
      ? [
          valueOrAsset.operationalStatus,
          valueOrAsset.fleetStatus,
          valueOrAsset.vehicleStatus,
          valueOrAsset.availabilityStatus,
          valueOrAsset.status,
        ]
      : [valueOrAsset];
  return values.some((value) =>
    OUT_OF_USE_STATUS_VALUES.has(String(value || "").trim().toLowerCase())
  )
    ? VOR_VEHICLE_STATUS
    : ACTIVE_VEHICLE_STATUS;
};

export const syncVehicleOperatingStatus = (asset = {}, status) => {
  const normalized = normalizeVehicleOperatingStatus(status);
  return {
    ...asset,
    operationalStatus: normalized,
    fleetStatus: normalized,
    vehicleStatus: normalized,
  };
};

export const isMotNotApplicable = (asset = {}) =>
  asset?.motNotApplicable === true ||
  asset?.motApplicable === false ||
  String(asset?.motStatus || "").trim().toLowerCase() === "n/a" ||
  String(asset?.motStatus || "").trim().toLowerCase() === "not applicable";

export const isServiceNotApplicable = (asset = {}) =>
  asset?.serviceNotApplicable === true ||
  asset?.serviceApplicable === false ||
  String(asset?.serviceStatus || "").trim().toLowerCase() === "n/a" ||
  String(asset?.serviceStatus || "").trim().toLowerCase() === "not applicable";

export const isVehicleOutOfUse = (asset = {}) => {
  return normalizeVehicleOperatingStatus(asset) === VOR_VEHICLE_STATUS;
};

export const toDateSafe = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const ymd = (value) => {
  const d = toDateSafe(value);
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const getIsoWeekParts = (value) => {
  const date = toDateSafe(value);
  if (!date) return null;

  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);

  return { year: utc.getUTCFullYear(), week };
};

export const getIsoWeekLabel = (value) => {
  const parts = getIsoWeekParts(value);
  if (!parts) return "";
  return `${parts.year}-W${String(parts.week).padStart(2, "0")}`;
};

export const buildAssetLabel = (asset) => {
  if (!asset) return "";
  const name = String(asset.name || asset.vehicleName || asset.displayName || asset.model || "").trim();
  const reg = String(asset.registration || asset.reg || asset.regNumber || asset.regNo || "").trim().toUpperCase();
  if (name && reg) return `${name} (${reg})`;
  if (name) return name;
  if (reg) return reg;
  return String(asset.id || "").trim();
};

export const getCanonicalDueDate = (asset, type) => {
  if (type === "mot" && isMotNotApplicable(asset)) return null;
  if (type === "service" && isServiceNotApplicable(asset)) return null;
  const fields = DUE_FIELD_CANDIDATES[type] || [];
  for (const key of fields) {
    const value = toDateSafe(asset?.[key]);
    if (value) return value;
  }
  return null;
};

export const normalizeAssetRecord = (raw = {}) => {
  const dueDates = {};
  Object.keys(DUE_FIELD_CANDIDATES).forEach((type) => {
    dueDates[type] = getCanonicalDueDate(raw, type);
  });

  return {
    ...raw,
    id: String(raw.id || raw.vehicleId || raw.assetId || "").trim(),
    assetLabel: buildAssetLabel(raw),
    outOfUse: isVehicleOutOfUse(raw),
    dueDates,
  };
};

export const createMaintenanceJobPayload = ({
  assetId = "",
  assetLabel = "",
  type = "service",
  title = "",
  dueDate = "",
  plannedDate = "",
  priority = "normal",
  notes = "",
  createdBy = "",
  source = "manual",
  sourceRef = "",
}) => {
  const now = new Date().toISOString();
  const cleanType = String(type || "service").trim().toLowerCase();

  return {
    assetId: String(assetId || "").trim(),
    assetLabel: String(assetLabel || "").trim(),
    type: cleanType,
    maintenanceTypeId: cleanType,
    title: String(title || `${cleanType.toUpperCase()} job`).trim(),
    status: "planned",
    priority: String(priority || "normal").trim().toLowerCase(),
    dueDate: String(dueDate || "").trim(),
    plannedDate: String(plannedDate || "").trim(),
    startedAt: "",
    completedAt: "",
    closedAt: "",
    notes: String(notes || "").trim(),
    source: String(source || "manual"),
    sourceRef: String(sourceRef || "").trim(),
    createdBy: String(createdBy || "Unknown"),
    updatedBy: String(createdBy || "Unknown"),
    createdAt: now,
    updatedAt: now,
  };
};
