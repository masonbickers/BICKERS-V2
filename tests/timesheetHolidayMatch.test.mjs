import test from "node:test";
import assert from "node:assert/strict";
import {
  holidayMatchesTimesheetEmployee,
  isApprovedHolidayForTimesheet,
} from "../src/app/utils/timesheetHolidayMatch.js";

test("only approved or accepted holidays affect a timesheet", () => {
  assert.equal(isApprovedHolidayForTimesheet({ status: "approved" }), true);
  assert.equal(isApprovedHolidayForTimesheet({ status: "accepted" }), true);
  assert.equal(isApprovedHolidayForTimesheet({ status: "requested" }), false);
  assert.equal(isApprovedHolidayForTimesheet({ status: "declined" }), false);
  assert.equal(isApprovedHolidayForTimesheet({ status: "cancelled" }), false);
  assert.equal(isApprovedHolidayForTimesheet({ approved: true }), true);
  assert.equal(isApprovedHolidayForTimesheet({}), false);
});

test("does not match a holiday merely because the employee created it", () => {
  const timesheet = { employeeCode: "7575", employeeName: "Max Bickers", employeeId: "max-id" };
  const holiday = {
    employeeCode: "1234",
    employeeName: "Another Employee",
    createdBy: "Max Bickers",
    owner: "max-id",
  };

  assert.equal(holidayMatchesTimesheetEmployee(timesheet, holiday), false);
});

test("does not match employees that share only part of a name", () => {
  const timesheet = { employeeName: "Max Bickers" };
  const holiday = { employeeName: "Mason Bickers" };

  assert.equal(holidayMatchesTimesheetEmployee(timesheet, holiday), false);
});

test("matches exact employee codes before weaker identity fields", () => {
  const timesheet = { employeeCode: "07575", employeeName: "Max Bickers" };
  const holiday = { employeeCode: "7575", employeeName: "Max Bickers" };

  assert.equal(holidayMatchesTimesheetEmployee(timesheet, holiday), true);
});

test("a conflicting employee code cannot be rescued by a matching name", () => {
  const timesheet = { employeeCode: "7575", employeeName: "Max Bickers" };
  const holiday = { employeeCode: "1234", employeeName: "Max Bickers" };

  assert.equal(holidayMatchesTimesheetEmployee(timesheet, holiday), false);
});

test("supports legacy exact-name holidays when neither side has a stronger comparable id", () => {
  const timesheet = { employeeName: "Max Bickers" };
  const holiday = { employee: "  max bickers  " };

  assert.equal(holidayMatchesTimesheetEmployee(timesheet, holiday), true);
});
