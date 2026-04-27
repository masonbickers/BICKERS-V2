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

function asStringArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((item) => String(item)) : [];
}

function asPhotoMap(primary, secondary) {
  const source = primary && typeof primary === "object" ? primary : secondary && typeof secondary === "object" ? secondary : {};
  const out = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    const normalized = asStringArray(value);
    if (normalized.length) out[key] = normalized;
  });
  return out;
}

export function normalizeServiceRecord(record = {}) {
  const normalized = { ...record };

  normalized.serviceDateOnly =
    dateOnlyString(record.serviceDateOnly) ||
    dateOnlyString(record.serviceDate) ||
    dateOnlyString(record.createdAt);

  normalized.serviceTime = String(record.serviceTime || "").trim();
  normalized.serviceDate =
    String(record.serviceDate || "").trim() ||
    [normalized.serviceDateOnly, normalized.serviceTime].filter(Boolean).join(" ");

  normalized.nextServiceDate =
    dateOnlyString(record.nextServiceDate) ||
    dateOnlyString(record.nextService) ||
    "";
  normalized.nextService = normalized.nextServiceDate || String(record.nextService || "").trim();

  normalized.photoURIs = asStringArray(record.photoURIs || record.photoURLs);
  normalized.photoURLs = normalized.photoURIs;
  normalized.checkPhotoURIs = asPhotoMap(record.checkPhotoURIs, record.checkPhotoURLs);
  normalized.checkPhotoURLs = normalized.checkPhotoURIs;

  normalized.checks = record.checks && typeof record.checks === "object" ? record.checks : {};
  normalized.checkRatings =
    record.checkRatings && typeof record.checkRatings === "object" ? record.checkRatings : {};
  normalized.checkNA = record.checkNA && typeof record.checkNA === "object" ? record.checkNA : {};
  normalized.checkNotes =
    record.checkNotes && typeof record.checkNotes === "object" ? record.checkNotes : {};

  return normalized;
}
