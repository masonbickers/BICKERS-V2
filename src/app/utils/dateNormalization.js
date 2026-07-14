export function normalizeDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value?.toDate === "function") return normalizeDate(value.toDate());
  if (value && typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    const milliseconds = Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1_000_000;
    return normalizeDate(new Date(milliseconds));
  }
  if (typeof value === "string") {
    const raw = value.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]);
      const day = Number(dateOnly[3]);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        ? date
        : null;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calendarDayNumber(value) {
  const date = normalizeDate(value);
  return date ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000 : null;
}

export function calendarDayDifference(target, from = new Date()) {
  const targetDay = calendarDayNumber(target);
  const fromDay = calendarDayNumber(from);
  if (targetDay == null || fromDay == null) return null;
  return targetDay - fromDay;
}
