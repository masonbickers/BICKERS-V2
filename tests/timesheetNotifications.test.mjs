import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  getPreviousTimesheetWeekStart,
  isTimesheetReminderEmployee,
  isTimesheetSubmitted,
  resolveEmployeeUserUid,
} from "../src/app/utils/timesheetNotifications.js";

const reminderRouteSource = readFileSync(
  new URL("../src/app/api/timesheets/reminders/route.js", import.meta.url),
  "utf8"
);
const firestoreRulesSource = readFileSync(
  new URL("../firestore.rules", import.meta.url),
  "utf8"
);

test("previous timesheet week uses the prior Monday", () => {
  assert.equal(
    getPreviousTimesheetWeekStart(new Date("2026-08-04T12:00:00Z")),
    "2026-07-27"
  );
  assert.equal(
    getPreviousTimesheetWeekStart(new Date("2026-08-03T00:30:00Z")),
    "2026-07-27"
  );
});

test("submitted and approved variants are complete", () => {
  assert.equal(isTimesheetSubmitted(null), false);
  assert.equal(isTimesheetSubmitted({ status: "draft" }), false);
  assert.equal(isTimesheetSubmitted({ submitted: true }), true);
  assert.equal(isTimesheetSubmitted({ status: "submitted" }), true);
  assert.equal(isTimesheetSubmitted({ approvedAt: "2026-08-03T09:00:00Z" }), true);
});

test("service-only, freelance, disabled, and test employees are excluded", () => {
  assert.equal(isTimesheetReminderEmployee({ userCode: "1001", role: "user" }), true);
  assert.equal(isTimesheetReminderEmployee({ userCode: "1002", role: "service" }), false);
  assert.equal(isTimesheetReminderEmployee({ userCode: "1003", jobTitle: "Freelance driver" }), false);
  assert.equal(isTimesheetReminderEmployee({ userCode: "1004", active: false }), false);
  assert.equal(isTimesheetReminderEmployee({ userCode: "1005", name: "Test Employee" }), false);
});

test("employee resolves to its canonical linked user", () => {
  const users = [
    { id: "user-a", employeeId: "employee-a", email: "a@example.com" },
    { id: "user-b", email: "b@example.com" },
  ];
  assert.equal(resolveEmployeeUserUid({ id: "employee-a" }, users), "user-a");
  assert.equal(resolveEmployeeUserUid({ id: "employee-b", email: "b@example.com" }, users), "user-b");
  assert.equal(resolveEmployeeUserUid({ id: "employee-c" }, users), "");
});

test("web reminders persist a durable employee inbox item", () => {
  assert.match(reminderRouteSource, /adminPatchDocument\("employeeNotifications"/);
  assert.match(reminderRouteSource, /notificationId/);
  assert.match(reminderRouteSource, /inboxSaved: true/);
  assert.match(firestoreRulesSource, /match \/employeeNotifications\/\{notificationId\}/);
  assert.match(firestoreRulesSource, /resource\.data\.employeeId/);
});
