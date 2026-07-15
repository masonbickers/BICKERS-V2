const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeDate(value) {
  if (value == null || value === "") return null;

  let candidate = value;
  if (typeof candidate?.toDate === "function") {
    try {
      candidate = candidate.toDate();
    } catch {
      return null;
    }
  } else if (
    typeof candidate === "object" &&
    Number.isFinite(candidate?.seconds)
  ) {
    candidate = new Date(
      candidate.seconds * 1000 + Math.floor((candidate.nanoseconds || 0) / 1_000_000)
    );
  } else if (typeof candidate === "string") {
    const match = candidate.match(DATE_ONLY);
    candidate = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : new Date(candidate);
  } else if (!(candidate instanceof Date)) {
    candidate = new Date(candidate);
  }

  if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) return null;
  return new Date(candidate.getTime());
}

export function calendarDayNumber(value) {
  const date = normalizeDate(value);
  if (!date) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function calendarDayDifference(value, from = new Date()) {
  const targetDay = calendarDayNumber(value);
  const fromDay = calendarDayNumber(from);
  if (targetDay == null || fromDay == null) return null;
  return targetDay - fromDay;
}
