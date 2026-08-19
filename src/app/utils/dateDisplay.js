const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;
const UK_DATE_ONLY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function toDisplayDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return toDisplayDate(value.toDate());
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.seconds === "number") {
    return toDisplayDate(new Date(value.seconds * 1000));
  }

  if (typeof value === "string") {
    const raw = value.trim();
    const iso = raw.match(ISO_DATE_ONLY);
    if (iso) {
      const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const uk = raw.match(UK_DATE_ONLY);
    if (uk) {
      const date = new Date(Number(uk[3]), Number(uk[2]) - 1, Number(uk[1]), 12);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatUkDate(value, fallback = "-") {
  const date = toDisplayDate(value);
  if (!date) return fallback;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatUkDateTime(value, fallback = "-") {
  const date = toDisplayDate(value);
  if (!date) return fallback;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${formatUkDate(date, fallback)} ${hours}:${minutes}`;
}

export function datePickerValues(values) {
  return (Array.isArray(values) ? values : []).map((value) => toDisplayDate(value)).filter(Boolean);
}
