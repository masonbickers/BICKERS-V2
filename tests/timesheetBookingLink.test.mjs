import test from "node:test";
import assert from "node:assert/strict";
import {
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
