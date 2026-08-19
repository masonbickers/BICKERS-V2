import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSickLeaveDisplayRows,
  employeeInitials,
  formatSickLeaveDate,
  sickLeaveNoteText,
  sickLeavePaymentStatus,
  summarizeSickLeaveRows,
} from "../src/app/utils/sickLeavePresentation.js";

const employees = [
  { id: "employee-1", name: "Sophie Albrow", email: "sophie@example.com" },
  { id: "employee-2", name: "Brian", email: "brian@example.com" },
];

const records = [
  { id: "old", employeeId: "employee-2", startDate: "2026-04-10", endDate: "2026-04-10", days: 1, reason: "Cold" },
  { id: "new", employeeId: "employee-1", startDate: "2026-08-11", endDate: "2026-08-12", days: 2, reason: "Flu", notes: "Unpaid" },
];

test("sick leave display rows sort by absence date rather than creation order", () => {
  assert.deepEqual(
    buildSickLeaveDisplayRows(records, employees).map(({ record }) => record.id),
    ["new", "old"]
  );
  assert.deepEqual(
    buildSickLeaveDisplayRows(records, employees, { sort: "oldest" }).map(({ record }) => record.id),
    ["old", "new"]
  );
});

test("sick leave search covers employee, reason and notes", () => {
  assert.equal(buildSickLeaveDisplayRows(records, employees, { search: "sophie" }).length, 1);
  assert.equal(buildSickLeaveDisplayRows(records, employees, { search: "unpaid" }).length, 1);
  assert.equal(buildSickLeaveDisplayRows(records, employees, { search: "cold" })[0].record.id, "old");
});

test("sick leave labels use readable UK dates and explicit pay status", () => {
  assert.equal(formatSickLeaveDate("2026-08-11"), "11 Aug 2026");
  assert.equal(sickLeavePaymentStatus("PAID - stay home"), "Paid");
  assert.equal(sickLeavePaymentStatus("Unpaid"), "Unpaid");
  assert.equal(sickLeaveNoteText("Unpaid"), "");
  assert.equal(sickLeaveNoteText("PAID - stay home"), "PAID - stay home");
  assert.equal(employeeInitials("Sophie Albrow"), "SA");
  assert.equal(employeeInitials("Brian"), "BR");
});

test("sick leave summary totals displayed records", () => {
  assert.deepEqual(summarizeSickLeaveRows(buildSickLeaveDisplayRows(records, employees)), {
    people: 2,
    totalDays: 3,
  });
});
