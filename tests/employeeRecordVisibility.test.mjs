import assert from "node:assert/strict";
import test from "node:test";

import {
  createCurrentEmployeeDirectory,
  employeeDisplayName,
  isCurrentEmployeeRecord,
  shouldShowInHolidayUsageOverview,
} from "../src/app/utils/employeeRecordVisibility.js";

test("removed and inactive employee records are not current", () => {
  assert.equal(isCurrentEmployeeRecord({ name: "Active Employee" }), true);
  assert.equal(isCurrentEmployeeRecord({ name: "Removed", removed: true }), false);
  assert.equal(isCurrentEmployeeRecord({ name: "Deleted", isDeleted: true }), false);
  assert.equal(isCurrentEmployeeRecord({ name: "Archived", archived: true }), false);
  assert.equal(isCurrentEmployeeRecord({ name: "App access disabled", isEnabled: false }), true);
  assert.equal(isCurrentEmployeeRecord({ name: "Former", employmentStatus: "Ended" }), false);
});

test("historic records only resolve when their employee is still current", () => {
  const directory = createCurrentEmployeeDirectory([
    { id: "active-id", name: "Sophie Albrow", employeeCode: "1001" },
    { id: "removed-id", name: "Tim Rogers", employeeCode: "1002", active: false },
  ]);

  assert.equal(employeeDisplayName(directory.resolve({ employee: "Sophie Albrow" })), "Sophie Albrow");
  assert.equal(employeeDisplayName(directory.resolve({ employeeCode: "1001" })), "Sophie Albrow");
  assert.equal(directory.matches({ employee: "Tim Rogers" }), false);
  assert.equal(directory.matches({ employeeId: "removed-id" }), false);
  assert.equal(directory.matches({ employee: "Historic Deleted Employee" }), false);
});

test("employee aliases resolve old holiday identity fields", () => {
  const directory = createCurrentEmployeeDirectory([
    {
      id: "employee-1",
      name: "Jamie Evans-Payne",
      previousNames: ["Jamie Evans"],
      email: "jamie@example.com",
    },
  ]);

  assert.equal(directory.matches({ employee: "  JAMIE   EVANS  " }), true);
  assert.equal(directory.matches({ employeeEmail: "jamie@example.com" }), true);
});

test("Paul Bickers is excluded from the holiday usage overview", () => {
  assert.equal(shouldShowInHolidayUsageOverview("Paul Bickers"), false);
  assert.equal(shouldShowInHolidayUsageOverview("  PAUL   BICKERS  "), false);
  assert.equal(shouldShowInHolidayUsageOverview("Sophie Albrow"), true);
});
