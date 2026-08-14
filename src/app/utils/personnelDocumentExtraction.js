const clean = (value) => String(value ?? "").trim();

export const PERSONNEL_DOCUMENT_TYPES = new Set(["passport", "drivingLicence"]);

export function normalizePersonnelDocumentType(value) {
  const normalized = clean(value).toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "passport") return "passport";
  if (["drivinglicence", "driverlicence", "drivinglicense", "driverlicense"].includes(normalized)) {
    return "drivingLicence";
  }
  return "";
}

export function normalizeExtractedDate(value) {
  const raw = clean(value);
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? "" : raw;
  }

  const ukMatch = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!ukMatch) return "";
  const [, day, month, year] = ukMatch;
  return normalizeExtractedDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
}

export function normalizePersonnelDocumentExtraction(value = {}, requestedType = "") {
  const documentType = normalizePersonnelDocumentType(value.documentType || requestedType);
  const visibleFields = Array.isArray(value.visibleFields)
    ? value.visibleFields.map(clean).filter(Boolean).slice(0, 20)
    : [];

  return {
    documentType,
    number: clean(value.number),
    countryOfIssue: clean(value.countryOfIssue),
    issueDate: normalizeExtractedDate(value.issueDate),
    expiryDate: normalizeExtractedDate(value.expiryDate),
    categories: clean(value.categories),
    points: clean(value.points),
    checkCode: clean(value.checkCode),
    visibleFields,
    warning: clean(value.warning),
  };
}

