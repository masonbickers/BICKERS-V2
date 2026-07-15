const INACTIVE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "lost",
  "postponed",
  "deleted",
  "complete",
  "completed",
  "dnh",
  "dnx",
  "enquiry",
]);

const VEHICLE_STATUS_MAP = {
  confirmed: "confirmed",
  maintenance: "maintenance",
  "first pencil": "first-pencil",
  "first-pencil": "first-pencil",
  "1st pencil": "first-pencil",
  "second pencil": "second-pencil",
  "second-pencil": "second-pencil",
  "2nd pencil": "second-pencil",
};

const compactText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const clean = (value) => String(value || "").trim();

const normalizeText = (value) => clean(value).replace(/\s+/g, " ").toLowerCase();

const parseYmd = (value) => {
  const [year, month, day] = clean(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const toYmd = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const direct = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  }
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  if (typeof value?.seconds === "number") {
    const date = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const enumerateYmdRange = (startYmd, endYmd) => {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd || startYmd);
  if (!start || !end || start > end) return [];

  const out = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

const uniqueSorted = (values = []) =>
  Array.from(new Set(values.map((value) => clean(value).slice(0, 10)).filter(Boolean))).sort();

const expandBookingDates = (booking = {}) => {
  if (Array.isArray(booking.bookingDates) && booking.bookingDates.length) {
    return uniqueSorted(booking.bookingDates.map(toYmd));
  }
  const date = toYmd(booking.date);
  const start = toYmd(booking.startDate || booking.startDateISO);
  const end = toYmd(booking.endDate || booking.endDateISO);
  if (date) return [date];
  if (start && end) return enumerateYmdRange(start, end);
  if (start) return [start];
  return [];
};

const normalizeVehicleStatus = (status) => {
  const key = normalizeText(status);
  return VEHICLE_STATUS_MAP[key] || key;
};

function displayStatus(status) {
  const normalized = normalizeVehicleStatus(status);
  if (normalized === "confirmed") return "Confirmed";
  if (normalized === "maintenance") return "Maintenance";
  if (normalized === "first-pencil") return "First Pencil";
  if (normalized === "second-pencil") return "Second Pencil";
  return clean(status) || "Unknown";
}

const isActiveBooking = (booking = {}) => {
  if (booking.deleted === true || booking.isDeleted === true) return false;
  const status = normalizeText(booking.status);
  if (!status) return true;
  return !INACTIVE_STATUSES.has(status);
};

const bookingLabel = (booking = {}) =>
  clean(
    booking.production ||
      booking.client ||
      booking.productionCompany ||
      booking.company ||
      booking.name ||
      booking.quoteTitle ||
      ""
  ) || "Unknown booking";

const bookingReference = (booking = {}) => clean(booking.quoteNumber) || clean(booking.jobNumber) || clean(booking.id) || "Booking";

const identityMatchSource = (identityType, usedFromId) => {
  if (identityType === "vehicleId" || identityType === "employeeId" || identityType === "assetId") return "id";
  if (identityType === "registration") return "registration";
  if (identityType === "email") return "email";
  return "name-fallback";
};

const buildIdentity = (raw = {}) => {
  const source = raw && typeof raw === "object" ? raw : { name: raw };
  const compact = (value) => compactText(value);
  const addKey = (list, type, value) => {
    const compacted = compact(value);
    if (compacted) list.push({ type, raw: clean(value), compact: compacted });
  };

  return {
    label: clean(
      source.name ||
        source.vehicleName ||
        source.employeeName ||
        source.displayName ||
        source.assetName ||
        source.equipmentName ||
        source.label ||
        source.registration ||
        source.reg ||
        source.serialNumber ||
        source.serial ||
        source.email ||
        source.emailAddress ||
        source.code ||
        source.employeeCode ||
        source.userCode ||
        source.id ||
        source.vehicleId ||
        source.equipmentId ||
        source.assetId ||
        source.trailerId ||
        String(raw || "").trim()
    ),
    keys: {
      vehicleId: compact(source.id || source.vehicleId || source.key),
      employeeId: compact(source.id || source.employeeId || source.uid || source.userId),
      assetId: compact(source.id || source.equipmentId || source.assetId || source.trailerId || source.vehicleId),
      registration: compact(source.registration || source.reg || source.numberPlate || source.serialNumber || source.serial),
      employeeCode: compact(source.code || source.employeeCode || source.userCode),
      email: compact(source.email || source.emailAddress),
      name: compact(source.name || source.vehicleName || source.employeeName || source.displayName || source.label || source.assetName || source.equipmentName),
    },
  };
};

const pickIdentitySource = (source = {}) => {
  if (source.vehicleId) return { type: "vehicleId", key: `vehicleId:${source.vehicleId}`, raw: source.vehicleId };
  if (source.employeeId) return { type: "employeeId", key: `employeeId:${source.employeeId}`, raw: source.employeeId };
  if (source.assetId) return { type: "assetId", key: `assetId:${source.assetId}`, raw: source.assetId };
  if (source.registration) return { type: "registration", key: `registration:${source.registration}`, raw: source.registration };
  if (source.email) return { type: "email", key: `email:${source.email}`, raw: source.email };
  if (source.employeeCode) return { type: "employeeCode", key: `employeeCode:${source.employeeCode}`, raw: source.employeeCode };
  return { type: "name", key: `name:${compactText(source.name)}`, raw: source.name };
};

const vehicleStatusLabel = (booking, lockContext) => {
  const statusById =
    booking && typeof booking.vehicleStatus === "object" ? booking.vehicleStatus[lockContext.vehicleKey] : "";
  if (statusById) return normalizeVehicleStatus(statusById);

  const bookingStatus = normalizeVehicleStatus(booking.status);
  return bookingStatus || "unknown";
};

export {
  INACTIVE_STATUSES,
  compactText,
  clean,
  normalizeText,
  parseYmd,
  toYmd,
  enumerateYmdRange,
  uniqueSorted,
  expandBookingDates,
  normalizeVehicleStatus,
  displayStatus,
  isActiveBooking,
  bookingLabel,
  bookingReference,
  identityMatchSource,
  buildIdentity,
  pickIdentitySource,
  vehicleStatusLabel,
};

