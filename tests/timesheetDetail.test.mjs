import test from "node:test";
import assert from "node:assert/strict";

import {
  combineTimesheetDayHours,
  getHolidayDayMeta,
  getTimesheetWorkflowStatus,
  getWeekEndingDate,
  holidayMatchesTimesheetEmployee,
  isApprovedHolidayRecord,
  isPendingHolidayRecord,
  normalizeTimesheetDays,
  parseTimesheetDocumentId,
  timesheetDocumentId,
  timesheetDetailPath,
  toDateKey,
} from "../src/app/utils/timesheetDetail.js";

test("builds canonical encoded timesheet detail paths", () => {
  assert.equal(timesheetDetailPath("EMP 1_2026-07-13"), "/timesheet-id/EMP%201_2026-07-13");
  assert.equal(timesheetDocumentId(" 0042 ", "2026-07-13"), "0042_2026-07-13");
  assert.deepEqual(parseTimesheetDocumentId("EMP_1_2026-07-13"), {
    employeeCode: "EMP_1",
    weekStart: "2026-07-13",
  });
});

test("normalizes legacy title-case day keys to the canonical lowercase schema", () => {
  const days = normalizeTimesheetDays({
    Monday: { mode: "yard" },
    tuesday: { mode: "travel" },
  });
  assert.deepEqual(days.monday, { mode: "yard" });
  assert.deepEqual(days.tuesday, { mode: "travel" });
  assert.equal(days.sunday, null);
});

test("derives the canonical workflow status", () => {
  assert.equal(getTimesheetWorkflowStatus({}), "draft");
  assert.equal(getTimesheetWorkflowStatus({ submitted: true }), "submitted");
  assert.equal(getTimesheetWorkflowStatus({ status: "approved" }), "approved");
});

test("only approved, accepted, or legacy-approved leave affects totals", () => {
  assert.equal(isApprovedHolidayRecord({ status: "approved" }), true);
  assert.equal(isApprovedHolidayRecord({ status: "accepted" }), true);
  assert.equal(isApprovedHolidayRecord({ approved: true }), true);
  assert.equal(isApprovedHolidayRecord({ status: "requested" }), false);
  assert.equal(isApprovedHolidayRecord({ status: "declined" }), false);
  assert.equal(isApprovedHolidayRecord({ status: "delete_requested" }), false);
  assert.equal(isApprovedHolidayRecord({ status: "cancelled" }), false);
  assert.equal(isApprovedHolidayRecord({ status: "approved", deleted: true }), false);
  assert.equal(isPendingHolidayRecord({ status: "requested" }), true);
  assert.equal(isPendingHolidayRecord({}), true);
});

test("matches stable employee identities and never shared name fragments", () => {
  const timesheet = { employeeCode: "EMP-1", employeeName: "Alex Smith" };
  assert.equal(holidayMatchesTimesheetEmployee(timesheet, { employeeCode: "EMP-1" }), true);
  assert.equal(
    holidayMatchesTimesheetEmployee(timesheet, { employeeCode: "EMP-2", employeeName: "Alex Smith" }),
    false
  );
  assert.equal(holidayMatchesTimesheetEmployee(timesheet, { employeeName: "Jordan Smith" }), false);
  assert.equal(holidayMatchesTimesheetEmployee(timesheet, { employeeName: " alex smith " }), true);
});

test("applies half days only to their multi-day boundaries", () => {
  const holiday = {
    startDate: "2026-07-13",
    endDate: "2026-07-15",
    startHalfDay: true,
    startAMPM: "PM",
    endHalfDay: true,
    endAMPM: "AM",
  };

  assert.deepEqual(getHolidayDayMeta(holiday, "2026-07-13"), {
    applies: true,
    halfDay: true,
    period: "PM",
  });
  assert.deepEqual(getHolidayDayMeta(holiday, "2026-07-14"), {
    applies: true,
    halfDay: false,
    period: "",
  });
  assert.deepEqual(getHolidayDayMeta(holiday, "2026-07-15"), {
    applies: true,
    halfDay: true,
    period: "AM",
  });
});

test("preserves the selected AM or PM period on single-date half days", () => {
  assert.deepEqual(
    getHolidayDayMeta(
      {
        startDate: "2026-07-16",
        endDate: "2026-07-16",
        startHalfDay: true,
        startAMPM: "PM",
      },
      "2026-07-16"
    ),
    { applies: true, halfDay: true, period: "PM" }
  );
  assert.deepEqual(
    getHolidayDayMeta(
      {
        startDate: "2026-07-17",
        endDate: "2026-07-17",
        startHalfDay: true,
        startAMPM: "AM",
      },
      "2026-07-17"
    ),
    { applies: true, halfDay: true, period: "AM" }
  );
});

test("adds worked time to a paid half holiday", () => {
  assert.equal(
    combineTimesheetDayHours({ workedHours: 4, holidayHours: 4, holidayKind: "half", mode: "yard" }),
    8
  );
  assert.equal(
    combineTimesheetDayHours({ workedHours: 8, holidayHours: 8, holidayKind: "full", mode: "holiday" }),
    8
  );
});

test("calculates Sunday as week ending", () => {
  assert.equal(toDateKey(getWeekEndingDate("2026-07-13")), "2026-07-19");
});
