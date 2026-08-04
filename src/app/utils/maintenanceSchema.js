export const MAINTENANCE_JOB_STATUSES = [
  "planned",
  "awaiting_parts",
  "in_progress",
  "qa",
  "complete",
  "closed",
];

export const ADDITIONAL_MAINTENANCE_WORKFLOWS = Object.freeze([
  { key: "tacho_inspection", maintenanceTypeId: "tacho_inspection", label: "Tacho inspection", dueKey: "tachoInspection", lastField: "lastTacho", nextField: "nextTacho", frequencyField: "tachoFreq", isoWeekField: "tachoISOWeek", historyField: "tachoInspectionHistory", documentsField: "tachoInspectionDocuments" },
  { key: "brake_test", maintenanceTypeId: "brake_test", label: "Brake test", dueKey: "brakeTest", lastField: "lastBrakeTest", nextField: "nextBrakeTest", frequencyField: "brakeTestFreq", isoWeekField: "brakeISOWeek", historyField: "brakeTestHistory", documentsField: "brakeTestDocuments" },
  { key: "pmi", maintenanceTypeId: "pmi", label: "PMI inspection", dueKey: "pmi", lastField: "lastPMI", nextField: "nextPMI", frequencyField: "pmiFreq", isoWeekField: "pmiISOWeek", historyField: "pmiHistory", documentsField: "pmiDocuments" },
  { key: "tacho_download", maintenanceTypeId: "tacho_download", label: "Tacho download", dueKey: "tachoDownload", lastField: "lastTachoDownload", nextField: "nextTachoDownload", frequencyField: "tachoDownloadFreq", isoWeekField: "tachoDownloadISOWeek", historyField: "tachoDownloadHistory", documentsField: "tachoDownloadDocuments" },
  { key: "tail_lift", maintenanceTypeId: "tail_lift", label: "Tail-lift inspection", dueKey: "tailLift", lastField: "lastTailLift", nextField: "nextTailLift", frequencyField: "tailLiftFreq", isoWeekField: "tailLiftISOWeek", historyField: "tailLiftHistory", documentsField: "tailLiftDocuments" },
  { key: "loler", maintenanceTypeId: "loler", label: "LOLER", dueKey: "loler", lastField: "lastLoler", nextField: "nextLoler", frequencyField: "lolerFreq", isoWeekField: "lolerISOWeek", historyField: "lolerHistory", documentsField: "lolerDocuments" },
]);

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
