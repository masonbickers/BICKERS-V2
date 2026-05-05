export function toDateLike(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, y, m, d] = match;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const ukMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (ukMatch) {
      const [, d, m, y, hh = "0", mm = "0"] = ukMatch;
      const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateOnlyString(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = toDateLike(value);
  if (!parsed) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateForDisplay(value) {
  const parsed = toDateLike(value);
  if (!parsed) return String(value || "").trim();
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((item) => String(item)) : [];
}

function mergeStringArrays(...values) {
  return Array.from(new Set(values.flatMap((value) => asStringArray(value))));
}

function asPhotoMap(primary, secondary) {
  const source = primary && typeof primary === "object" ? primary : {};
  const fallback = secondary && typeof secondary === "object" ? secondary : {};
  const out = {};
  const keys = new Set([...Object.keys(source), ...Object.keys(fallback)]);
  keys.forEach((key) => {
    const normalized = mergeStringArrays(source[key], fallback[key]);
    if (normalized.length) out[key] = normalized;
  });
  return out;
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeWheelInspection(value) {
  const source = asPlainObject(value);
  const positions = ["frontLeft", "frontRight", "rearLeft", "rearRight"];
  return positions.reduce((out, position) => {
    const item = asPlainObject(source[position]);
    out[position] = {
      tread: String(item.tread || "").trim(),
      pressure: String(item.pressure || "").trim(),
      brakeWear: String(item.brakeWear || "").trim(),
      note: String(item.note || "").trim(),
    };
    return out;
  }, {});
}

function normalizeMonitorReport(value) {
  return Array.isArray(value)
    ? value.map((item) => ({
        key: String(item?.key || "").trim(),
        source: item?.source === "wheel" ? "wheel" : "checklist",
        title: String(item?.title || "").trim(),
        value: String(item?.value || "").trim(),
        unit: String(item?.unit || "").trim(),
        details: String(item?.details || "").trim(),
      }))
    : [];
}

function normalizeDefectActions(value) {
  const source = asPlainObject(value);
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      {
        key: String(item?.key || key || "").trim(),
        metric: ["checklist", "tread", "brakeWear"].includes(item?.metric) ? item.metric : "checklist",
        wheelKey: String(item?.wheelKey || "").trim(),
        wheelLabel: String(item?.wheelLabel || "").trim(),
        title: String(item?.title || "").trim(),
        value: String(item?.value || "").trim(),
        unit: String(item?.unit || "").trim(),
        description: String(item?.description || "").trim(),
        action: ["repaired", "replaced", "not_repaired"].includes(item?.action) ? item.action : "",
        note: String(item?.note || "").trim(),
        defectReportId: String(item?.defectReportId || "").trim(),
      },
    ])
  );
}

function normalizeAdvisoryActions(value) {
  const source = asPlainObject(value);
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      {
        key: String(item?.key || key || "").trim(),
        title: String(item?.title || "").trim(),
        details: String(item?.details || "").trim(),
        source: String(item?.source || "").trim(),
        value: String(item?.value || "").trim(),
        unit: String(item?.unit || "").trim(),
        status: ["monitoring", "fixed", "replaced"].includes(item?.status) ? item.status : "monitoring",
        note: String(item?.note || "").trim(),
        updatedAt: String(item?.updatedAt || "").trim(),
        updatedBy: String(item?.updatedBy || "").trim(),
      },
    ])
  );
}

export function normalizeServiceRecord(record = {}) {
  const normalized = { ...record };

  normalized.vehicleId = String(record.vehicleId || record.selectedVehicleId || "").trim();
  normalized.vehicleName = String(record.vehicleName || record.vehicle || "").trim();
  normalized.registration = String(record.registration || record.reg || "").trim();
  normalized.vehicleSearch = String(record.vehicleSearch || "").trim();
  normalized.odometer = String(record.odometer || "").trim();
  normalized.serviceType = String(record.serviceType || "").trim();
  normalized.workSummary = String(record.workSummary || "").trim();
  normalized.partsUsed = String(record.partsUsed || "").trim();
  normalized.extraNotes = String(record.extraNotes || "").trim();
  normalized.signedBy = String(record.signedBy || record.provider || "").trim();
  normalized.manufacturer = String(record.manufacturer || "").trim();
  normalized.model = String(record.model || "").trim();

  normalized.serviceDateOnly =
    dateOnlyString(record.serviceDateOnly) ||
    dateOnlyString(record.serviceDate) ||
    dateOnlyString(record.createdAt);

  normalized.serviceTime = String(record.serviceTime || "").trim();
  normalized.serviceDate =
    String(record.serviceDate || "").trim() ||
    [normalized.serviceDateOnly, normalized.serviceTime].filter(Boolean).join(" ");
  normalized.serviceDateDisplay = formatDateForDisplay(normalized.serviceDateOnly || normalized.serviceDate);

  normalized.nextServiceDate =
    dateOnlyString(record.nextServiceDate) ||
    dateOnlyString(record.nextService) ||
    "";
  normalized.nextService = normalized.nextServiceDate || String(record.nextService || "").trim();
  normalized.nextServiceDateDisplay = formatDateForDisplay(normalized.nextServiceDate || normalized.nextService);

  normalized.photoURIs = mergeStringArrays(record.photoURIs, record.photoURLs);
  normalized.photoURLs = normalized.photoURIs;
  normalized.checkPhotoURIs = asPhotoMap(record.checkPhotoURIs, record.checkPhotoURLs);
  normalized.checkPhotoURLs = normalized.checkPhotoURIs;

  normalized.checks = asPlainObject(record.checks);
  normalized.checkRatings = asPlainObject(record.checkRatings);
  normalized.checkNA = asPlainObject(record.checkNA);
  normalized.checkNotes = asPlainObject(record.checkNotes);
  normalized.wheelInspection = normalizeWheelInspection(record.wheelInspection);
  normalized.monitorReport = normalizeMonitorReport(record.monitorReport);
  normalized.serviceDefectActions = normalizeDefectActions(record.serviceDefectActions);
  normalized.advisoryActions = normalizeAdvisoryActions(record.advisoryActions);
  normalized.repairSummary = String(record.repairSummary || "").trim();
  normalized.repairReason = String(record.repairReason || "").trim();
  normalized.linkedDefect = asPlainObject(record.linkedDefect);
  normalized.completedBy = String(record.completedBy || "").trim();

  return normalized;
}
