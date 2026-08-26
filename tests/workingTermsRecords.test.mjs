import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptanceMatchesEmployee,
  workingTermsStatusForEmployee,
} from "../src/app/utils/workingTermsRecords.js";

const employee = { id: "employee-1", authUid: "user-1", email: "person@example.com" };

test("working terms records match employee, auth and email identities", () => {
  assert.equal(acceptanceMatchesEmployee({ employeeId: "employee-1" }, employee), true);
  assert.equal(acceptanceMatchesEmployee({ userId: "user-1" }, employee), true);
  assert.equal(acceptanceMatchesEmployee({ email: "PERSON@example.com" }, employee), true);
  assert.equal(acceptanceMatchesEmployee({ userId: "someone-else" }, employee), false);
});

test("current signed terms take precedence over older acceptances", () => {
  const status = workingTermsStatusForEmployee(employee, [
    { employeeId: "employee-1", accepted: true, documentVersion: "1.0", acceptedAt: "2026-06-23T10:00:00Z" },
    { userId: "user-1", accepted: true, documentVersion: "1.1", acceptedAt: "2026-08-19T10:00:00Z" },
  ]);
  assert.equal(status.key, "signed");
  assert.equal(status.record.documentVersion, "1.1");
});

test("older acceptance is outdated and no acceptance is unsigned", () => {
  assert.equal(
    workingTermsStatusForEmployee(employee, [{ employeeId: "employee-1", accepted: true, documentVersion: "1.0" }]).key,
    "outdated"
  );
  assert.equal(workingTermsStatusForEmployee(employee, []).key, "unsigned");
});
