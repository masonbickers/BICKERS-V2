import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeLegacyTimesheet,
  planTimesheetMigration,
} from "../scripts/migrate-timesheet-contract.mjs";

test("normalizes casing, workflow state, and employee identity", () => {
  const normalized = normalizeLegacyTimesheet(
    {
      employeeCode: "0042",
      weekStart: "2026-07-13",
      days: { Monday: { mode: "yard" } },
      submitted: true,
    },
    { id: "emp-42", name: "Alex Smith", email: "ALEX@BICKERS.CO.UK" }
  );
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.employeeId, "emp-42");
  assert.equal(normalized.employeeEmail, "alex@bickers.co.uk");
  assert.equal(normalized.status, "submitted");
  assert.deepEqual(normalized.days.monday, { mode: "yard" });
});

test("copies safe random ids, reports collisions, and leaves malformed records for review", () => {
  const employees = [{ id: "emp-42", data: { userCode: "0042", name: "Alex Smith" } }];
  const plan = planTimesheetMigration(
    [
      { id: "random", data: { employeeCode: "0042", weekStart: "2026-07-13", days: {} } },
      { id: "0042_2026-07-20", data: { employeeCode: "0042", weekStart: "2026-07-20", days: {} } },
      { id: "collision", data: { employeeCode: "0042", weekStart: "2026-07-20", days: {} } },
      { id: "unknown", data: { days: {} } },
    ],
    employees
  );
  assert.deepEqual(plan.map((item) => item.action), [
    "copy",
    "normalize",
    "collision",
    "manual-review",
  ]);
});
