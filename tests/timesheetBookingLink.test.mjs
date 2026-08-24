import test from "node:test";
import assert from "node:assert/strict";
import {
  formatTimesheetHours,
  invoiceTimesheetRows,
  timesheetLinksBooking,
} from "../src/app/utils/timesheetBookingLink.js";

const bookingId = "b4BxYg2N9xaXk3mX7Ush";

test("does not link a timesheet by reused job number alone", () => {
  const unrelated = {
    id: "legacy-shaun",
    employeeName: "Shaun Brundle",
    jobNumber: "9210",
  };
  assert.equal(timesheetLinksBooking(unrelated, bookingId), false);
  assert.deepEqual(invoiceTimesheetRows([unrelated], bookingId), []);
});

test("finds a crew timesheet linked through its nested booking day", () => {
  const maxTimesheet = {
    id: "max-week",
    employeeName: "Max Bickers",
    weekStart: "2026-06-29",
    status: "Submitted",
    days: {
      Sunday: {
        bookingId,
        standardHours: 15.5,
        overtimeHours: 0,
        startTime: "03:30",
        endTime: "19:00",
      },
    },
  };
  const rows = invoiceTimesheetRows([maxTimesheet], bookingId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employeeName, "Max Bickers");
  assert.equal(rows[0].hours, 15.5);
  assert.equal(rows[0].date, "2026-07-05T00:00:00.000Z");
});

test("supports snapshot booking links used by the job summary", () => {
  const timesheet = {
    id: "snapshot-linked",
    employeeName: "Max Bickers",
    weekStart: "2026-06-29",
    jobSnapshot: {
      bookingIds: [bookingId],
      byDay: { Sunday: [{ bookingId }] },
    },
    days: { Sunday: { standardHours: 15.5 } },
  };
  assert.equal(timesheetLinksBooking(timesheet, bookingId), true);
  assert.equal(invoiceTimesheetRows([timesheet], bookingId)[0].hours, 15.5);
});

test("calculates a linked raw travel day saved by the timesheet app", () => {
  const timesheet = {
    id: "3514_2026-08-03",
    employeeName: "Toby Oxley",
    weekStart: "2026-08-03",
    status: "approved",
    days: {
      sunday: {
        bookingId,
        mode: "travel",
        leaveTime: "18:15",
        arriveTime: "21:30",
        overnight: true,
      },
    },
  };

  const rows = invoiceTimesheetRows([timesheet], bookingId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hours, 3.25);
  assert.equal(rows[0].overtimeHours, 0);
  assert.equal(rows[0].date, "2026-08-09T00:00:00.000Z");
});

test("calculates a linked raw on-set day saved by the timesheet app", () => {
  const timesheet = {
    id: "3514_2026-08-10",
    employeeName: "Toby Oxley",
    weekStart: "2026-08-10",
    status: "approved",
    days: {
      Monday: {
        bookingId,
        mode: "onset",
        leaveTime: "06:45",
        arriveTime: "07:00",
        callTime: "08:00",
        wrapTime: "15:00",
        arriveBack: "21:30",
      },
    },
  };

  const rows = invoiceTimesheetRows([timesheet], bookingId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hours, 14.75);
  assert.equal(rows[0].overtimeHours, 0);
  assert.equal(rows[0].date, "2026-08-10T00:00:00.000Z");
});

test("includes pre-call and on-set overtime in the invoice OT total", () => {
  const timesheet = {
    id: "9453_2026-08-10",
    employeeName: "Test Employee",
    weekStart: "2026-08-10",
    status: "approved",
    days: {
      Thursday: {
        bookingId,
        mode: "onset",
        leaveTime: "04:30",
        arriveTime: "06:30",
        precallDuration: "07:30",
        callTime: "08:00",
        wrapTime: "19:00",
      },
    },
  };

  const rows = invoiceTimesheetRows([timesheet], bookingId);
  assert.equal(rows[0].hours, 14.5);
  assert.equal(rows[0].overtimeHours, 1.5);
});

test("formats invoice timesheet totals as exact hours and minutes", () => {
  assert.equal(formatTimesheetHours(3.25), "3 hrs 15 min");
  assert.equal(formatTimesheetHours(14.75), "14 hrs 45 min");
  assert.equal(formatTimesheetHours(0), "0 hrs");
});
