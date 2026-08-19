import test from "node:test";
import assert from "node:assert/strict";

import {
  complianceState,
  createRateHistoryEntry,
  deriveOnboardingChecklist,
  getEmployeeAbsenceSummary,
  getPersonnelCompliance,
  pickPrivateEmployeeFields,
  withoutPrivateEmployeeFields,
} from "../src/app/utils/employeePersonnel.js";

test("private employee fields are separated from operational fields", () => {
  const employee = { name: "Alex", jobTitle: ["Driver"], nationalInsuranceNumber: "QQ123", medical: { notes: "Private" } };
  assert.deepEqual(withoutPrivateEmployeeFields(employee), { name: "Alex", jobTitle: ["Driver"] });
  assert.deepEqual(pickPrivateEmployeeFields(employee), {
    nationalInsuranceNumber: "QQ123",
    medical: { notes: "Private" },
  });
});

test("compliance boundaries match the 30, 60 and 90 day policy", () => {
  const today = new Date(2026, 0, 1);
  assert.equal(complianceState("2025-12-31", today).state, "overdue");
  assert.equal(complianceState("2026-01-31", today).state, "urgent");
  assert.equal(complianceState("2026-03-02", today).state, "warning");
  assert.equal(complianceState("2026-04-01", today).state, "notice");
  assert.equal(complianceState("2026-04-02", today).state, "current");
});

test("personnel compliance includes expiring uploaded documents", () => {
  const summary = getPersonnelCompliance(
    { passport: { expiryDate: "2026-01-15" }, personnelDocuments: [{ title: "Training", expiryDate: "2026-02-01" }] },
    new Date(2026, 0, 1)
  );
  assert.equal(summary.dueWithin90Days, 2);
  assert.equal(summary.tone, "danger");
});

test("derived onboarding checklist completes evidence-backed tasks", () => {
  const rows = deriveOnboardingChecklist({
    address: "1 High Street",
    nationalInsuranceNumber: "QQ123",
    payrollNumber: "42",
    rightToWorkChecked: true,
    emergencyContacts: [{ name: "Sam", phone: "07000" }],
    workSchedule: { timezone: "Europe/London" },
    appAccess: { user: true },
  });
  assert.equal(rows.find((row) => row.id === "profile").completed, true);
  assert.equal(rows.find((row) => row.id === "policy").completed, false);
});

test("absence summary matches employee IDs and accounts for half days", () => {
  const summary = getEmployeeAbsenceSummary({
    employee: { id: "emp-1", name: "Alex", holidayAllowance: 20 },
    year: 2026,
    holidays: [{ employeeId: "emp-1", startDate: "2026-01-05", endDate: "2026-01-05", startHalfDay: true, status: "approved", paidStatus: "Paid" }],
    sickLeave: [{ employeeId: "emp-1", startDate: "2026-01-06", endDate: "2026-01-07", status: "recorded" }],
  });
  assert.equal(summary.approvedPaidDays, 0.5);
  assert.equal(summary.remainingPaidDays, 19.5);
  assert.equal(summary.sickDays, 2);
});

test("rate history stores only changed fields", () => {
  const entry = createRateHistoryEntry({
    previous: { workshopRate: 10, overtimeRate: 20 },
    next: { workshopRate: 12, overtimeRate: 20 },
    effectiveDate: "2026-01-01",
    reason: "Annual review",
    changedBy: "admin@example.com",
  });
  assert.deepEqual(entry.changes, [{ field: "workshopRate", from: 10, to: 12 }]);
});
