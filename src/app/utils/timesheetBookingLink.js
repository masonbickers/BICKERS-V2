const text = (value) => String(value ?? "").trim();

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
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  }[dayName];
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
    if (!linkedDays.length) return [timesheet];
    return linkedDays.map(([day, entry]) => ({
      ...timesheet,
      ...entry,
      id: `${timesheet.id || timesheet.employeeId || "timesheet"}-${day}`,
      sourceTimesheetId: timesheet.id || null,
      date: entry.date || weekDate(timesheet.weekStart, day),
      hours:
        entry.standardHours ??
        entry.standardHrs ??
        entry.approvedHours ??
        entry.hours ??
        0,
      overtimeHours: entry.overtimeHours ?? entry.overtimeHrs ?? 0,
      status:
        entry.status ||
        timesheet.status ||
        timesheet.approvalStatus ||
        timesheet.workflowStatus ||
        "",
    }));
  });
}
