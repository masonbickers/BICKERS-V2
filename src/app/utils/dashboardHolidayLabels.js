const text = (value) => String(value ?? "").trim();

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isTrue = (value) =>
  value === true || text(value).toLowerCase() === "true";

export const getSingleDayHolidayHalf = (holiday = {}) => {
  if (!isTrue(holiday.startHalfDay)) return "";

  const start = toDate(holiday.startDate);
  const end = toDate(holiday.endDate || holiday.startDate);
  if (
    !start ||
    !end ||
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  ) {
    return "";
  }

  const period = text(
    holiday.startAMPM || holiday.halfDayPeriod || holiday.halfDayType
  ).toUpperCase();
  return period === "PM" ? "PM" : "AM";
};

export const buildHolidayEmployeeLabel = (employee, holiday = {}) => {
  const name = text(employee) || "Unknown";
  const half = getSingleDayHolidayHalf(holiday);
  return half ? `${name} (${half} half-day)` : name;
};

export const buildHolidayCalendarTitle = (employee, holiday = {}) =>
  `${buildHolidayEmployeeLabel(employee, holiday)} - Holiday`;
