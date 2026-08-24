import { shouldDeductYardLunch } from "./timesheetLunch.js";
import { computeOnSetBreakdown } from "./timesheetOnSetHours.js";

const text = (value) => String(value ?? "").trim();
const LUNCH_DEDUCT_HOURS = 0.5;

function numericValue(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function toMinutes(value) {
  const match = text(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function elapsedHours(start, end) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes == null || endMinutes == null) return 0;
  let minutes = endMinutes - startMinutes;
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes / 60);
}

function yardSegments(entry = {}) {
  if (Array.isArray(entry.yardSegments)) return entry.yardSegments;
  if (entry.leaveTime && entry.arriveBack) {
    return [{ start: entry.leaveTime, end: entry.arriveBack }];
  }
  if (entry.start && entry.end) return [{ start: entry.start, end: entry.end }];
  return [];
}

function invoiceHourSummary(entry = {}, dayName = "") {
  const storedHours = numericValue(
    entry.standardHours,
    entry.standardHrs,
    entry.approvedHours,
    entry.hours,
    entry.totalHours
  );
  const storedOvertime = numericValue(
    entry.overtimeHours,
    entry.overtimeHrs,
    entry.otHours
  );
  if (storedHours != null) {
    return { hours: storedHours, overtimeHours: storedOvertime ?? 0 };
  }

  const rawMode = text(entry.mode || "yard").toLowerCase();
  if (["off", "holiday", "bankholiday", "unpaid"].includes(rawMode)) {
    return { hours: 0, overtimeHours: storedOvertime ?? 0 };
  }

  if (rawMode === "onset") {
    const breakdown = computeOnSetBreakdown(entry);
    return {
      hours: breakdown.totalHrs,
      overtimeHours:
        storedOvertime ?? breakdown.onSetOvertimeHrs + breakdown.preCallHrs,
    };
  }

  if (rawMode === "travel") {
    return {
      hours: elapsedHours(entry.leaveTime, entry.arriveTime),
      overtimeHours: storedOvertime ?? 0,
    };
  }

  if (rawMode === "office") {
    return {
      hours: elapsedHours(entry.startTime, entry.endTime),
      overtimeHours: storedOvertime ?? 0,
    };
  }

  const isTurnaround =
    entry.turnaround === true ||
    entry.turnaroundDay === true ||
    (entry.isTurnaround === true && rawMode === "yard");
  let hours = yardSegments(entry).reduce(
    (total, segment) => total + elapsedHours(segment?.start, segment?.end),
    0
  );
  if (!isTurnaround && entry.yardTravelEnabled) {
    hours += elapsedHours(entry.yardTravelLeaveTime, entry.yardTravelArriveTime);
  }
  if (!isTurnaround && hours > 0 && shouldDeductYardLunch(entry, dayName)) {
    hours -= LUNCH_DEDUCT_HOURS;
  }
  hours = Math.max(0, hours);

  return {
    hours,
    overtimeHours: storedOvertime ?? Math.max(0, hours - 8.5),
  };
}

export function formatTimesheetHours(value) {
  const numericHours = Number(value);
  const totalMinutes = Number.isFinite(numericHours)
    ? Math.max(0, Math.round(numericHours * 60))
    : 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours && !minutes) return "0 hrs";
  return [
    hours ? `${hours} hr${hours === 1 ? "" : "s"}` : "",
    minutes ? `${minutes} min` : "",
  ].filter(Boolean).join(" ");
}

export function timesheetLinksBooking(timesheet = {}, bookingId = "") {
  const target = text(bookingId);
  if (!target) return false;
  if (text(timesheet.bookingId) === target || text(timesheet.jobId) === target) return true;
  if (
    Array.isArray(timesheet.jobSnapshot?.bookingIds) &&
    timesheet.jobSnapshot.bookingIds.some((id) => text(id) === target)
  ) return true;
  if (
    Object.values(timesheet.days || {}).some((entry) => text(entry?.bookingId) === target)
  ) return true;
  return Object.values(timesheet.jobSnapshot?.byDay || {}).some(
    (bookings) =>
      Array.isArray(bookings) &&
      bookings.some((booking) => text(booking?.bookingId) === target)
  );
}

function weekDate(weekStart, dayName) {
  const start = new Date(weekStart);
  if (Number.isNaN(start.getTime())) return null;
  const dayIndex = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  }[text(dayName).toLowerCase()];
  if (dayIndex === undefined) return null;
  const date = new Date(start);
  date.setDate(start.getDate() + dayIndex);
  return date.toISOString();
}

export function invoiceTimesheetRows(timesheets = [], bookingId = "") {
  const target = text(bookingId);
  return timesheets.flatMap((timesheet) => {
    if (!timesheetLinksBooking(timesheet, target)) return [];
    const snapshotByDay = timesheet.jobSnapshot?.byDay || {};
    const linkedDays = Object.entries(timesheet.days || {}).filter(([day, entry]) => {
      if (text(entry?.bookingId) === target) return true;
      return (
        Array.isArray(snapshotByDay[day]) &&
        snapshotByDay[day].some((booking) => text(booking?.bookingId) === target)
      );
    });
    if (!linkedDays.length) {
      return [{ ...timesheet, ...invoiceHourSummary(timesheet) }];
    }
    return linkedDays.map(([day, entry]) => {
      const hourSummary = invoiceHourSummary(entry, day);
      return {
        ...timesheet,
        ...entry,
        id: `${timesheet.id || timesheet.employeeId || "timesheet"}-${day}`,
        sourceTimesheetId: timesheet.id || null,
        date: entry.date || entry.dateISO || weekDate(timesheet.weekStart, day),
        ...hourSummary,
        status:
          entry.status ||
          timesheet.status ||
          timesheet.approvalStatus ||
          timesheet.workflowStatus ||
          "",
      };
    });
  });
}
