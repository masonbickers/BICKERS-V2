export const MAINTENANCE_JOB_STATUSES = [
  "planned",
  "awaiting_parts",
  "in_progress",
  "qa",
  "complete",
  "closed",
];

const DUE_FIELD_CANDIDATES = {
  mot: ["nextMOT", "motDate", "motDue"],
  service: ["nextService", "serviceDate", "serviceDue"],
  inspection: ["inspectionDate"],
  rfl: ["nextRFL"],
  tachoInspection: ["nextTachoInspection"],
  brakeTest: ["nextBrakeTest"],
  pmi: ["nextPMIInspection"],
  tachoDownload: ["nextTachoDownload"],
  tailLift: ["nextTailLiftInspection"],
  loler: ["nextLOLERInspection"],
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

