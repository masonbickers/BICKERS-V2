import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMaintenanceBickersReference,
  buildNextRequestedMaintenanceRecords,
  buildRequestedMaintenanceRecord,
  buildScheduledMaintenanceBooking,
  buildMaintenanceReschedule,
  calculateNextMaintenanceDue,
  completeCanonicalMaintenanceItems,
  formatMaintenanceBickersReference,
  getMaintenanceDueState,
  maintenanceCompletionEvidenceIssues,
  maintenanceRequirementDocumentId,
  maintenanceRequirementKey,
  normalizeMaintenanceRecord,
  validateMaintenanceRecord,
} from "../src/app/utils/maintenanceRecord.js";

test("Bickers maintenance references accept only permanent numeric sequences", () => {
  assert.equal(formatMaintenanceBickersReference(1), "000001");
  assert.equal(formatMaintenanceBickersReference(999999), "999999");
  assert.equal(buildMaintenanceBickersReference({ bickersReference: "000123" }), "000123");
  assert.equal(buildMaintenanceBickersReference({ bickersReference: "WH31TMQKMX" }), "");
  assert.equal(buildMaintenanceBickersReference({}), "");
});

test("requested maintenance records have deterministic idempotency keys without booking dates", () => {
  const requested = buildRequestedMaintenanceRecord({
    companyId: "company-1",
    vehicleId: "vehicle-1",
    vehicleLabel: "Truck 1 (AB12 CDE)",
    items: [
      { maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-03" },
      { maintenanceTypeId: "brake_test", legalDueDateISO: "2026-08-03" },
    ],
  });
  assert.equal(requested.status, "requested");
  assert.deepEqual(requested.schedule.bookingDates, []);
  assert.equal(
    requested.requirementKey,
    maintenanceRequirementKey({ companyId: "company-1", vehicleId: "vehicle-1", items: requested.items })
  );
  assert.match(maintenanceRequirementDocumentId(requested.requirementKey), /^req_[a-z0-9]+_[a-z0-9]+$/);
  assert.equal(requested.bickersReference, undefined);
});

test("scheduled maintenance records are booked automatically on the legal schedule date", () => {
  const scheduled = buildScheduledMaintenanceBooking({
    companyId: "company-1",
    vehicleId: "vehicle-1",
    items: [
      { maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-05" },
      { maintenanceTypeId: "brake_test", legalDueDateISO: "2026-08-07" },
    ],
  });
  assert.equal(scheduled.status, "booked");
  assert.equal(scheduled.schedule.appointmentDateISO, "2026-08-05");
  assert.deepEqual(scheduled.schedule.bookingDates, ["2026-08-05"]);
  assert.deepEqual(scheduled.items.map((item) => item.status), ["booked", "booked"]);
  assert.deepEqual(scheduled.items.map((item) => item.legalDueDateISO), ["2026-08-05", "2026-08-07"]);
});

test("completed PMI and brake items create one next unarranged due item using configured frequency", () => {
  const canonicalRecord = normalizeMaintenanceRecord({
    id: "booking-1",
    companyId: "company-1",
    vehicleId: "vehicle-1",
    type: "INSPECTION",
    status: "Booked",
    appointmentDateISO: "2026-08-03",
    maintenanceTypeIds: ["pmi", "brake_test"],
  });
  const next = buildNextRequestedMaintenanceRecords({
    canonicalRecord,
    completedTypeIds: ["pmi", "brake_test"],
    completionDateISO: "2026-08-03",
    vehicle: { pmiFreq: 8, brakeTestFreq: 8 },
  });
  assert.equal(next.length, 1);
  assert.equal(next[0].status, "requested");
  assert.equal(next[0].schedule.appointmentDateISO, "");
  assert.deepEqual(next[0].schedule.bookingDates, []);
  assert.deepEqual(next[0].items.map((item) => item.maintenanceTypeId), ["pmi", "brake_test"]);
  assert.deepEqual(next[0].items.map((item) => item.legalDueDateISO), ["2026-09-28", "2026-09-28"]);
});

test("PMI and brake completion reports missing evidence per item", () => {
  const record = normalizeMaintenanceRecord({
    vehicleId: "vehicle-1",
    type: "INSPECTION",
    status: "Booked",
    appointmentDateISO: "2026-08-03",
    maintenanceTypeIds: ["pmi", "brake_test"],
  });
  assert.deepEqual(
    maintenanceCompletionEvidenceIssues(record, ["pmi", "brake_test"]),
    ["missing_evidence:pmi", "missing_evidence:brake_test"]
  );
  assert.deepEqual(
    maintenanceCompletionEvidenceIssues(record, ["pmi"], { pmi: [{ name: "pmi.pdf" }] }),
    []
  );
});

test("canonical records keep legal due dates separate from booked diary dates", () => {
  const record = normalizeMaintenanceRecord({
    id: "booking-1",
    vehicleId: "vehicle-1",
    type: "INSPECTION",
    maintenanceTypeIds: ["pmi", "brake_test"],
    status: "Booked",
    appointmentDateISO: "2026-08-05",
    sourceDueDateISO: "2026-08-03",
    sourceDueIsoWeek: "2026-W32",
  });

  assert.deepEqual(record.items.map((item) => item.maintenanceTypeId), ["pmi", "brake_test"]);
  assert.equal(record.schedule.appointmentDateISO, "2026-08-05");
  assert.equal(record.items[0].legalDueDateISO, "2026-08-03");
  assert.equal(validateMaintenanceRecord(record).ok, true);

  const moved = buildMaintenanceReschedule(record, ["2026-08-17"]);
  assert.equal(moved.schedule.appointmentDateISO, "2026-08-17");
  assert.equal(moved.schedule.bookedIsoWeeks[0], "2026-W34");
  assert.equal(moved.items[0].legalDueDateISO, "2026-08-03");
  assert.equal(moved.items[0].legalDueIsoWeek, "2026-W32");
});

test("PMI and brake test use their configured frequency from successful completion", () => {
  assert.equal(
    calculateNextMaintenanceDue({ maintenanceTypeId: "pmi", completedDate: "2026-08-18", frequencyWeeks: 8 }),
    "2026-10-13"
  );
  assert.equal(
    calculateNextMaintenanceDue({ maintenanceTypeId: "brake_test", completedDate: "2026-08-18", frequencyWeeks: 8 }),
    "2026-10-13"
  );
});

test("combined PMI and brake-test items can be completed independently", () => {
  const record = normalizeMaintenanceRecord({
    id: "inspection-1",
    vehicleId: "vehicle-1",
    type: "INSPECTION",
    status: "Booked",
    appointmentDateISO: "2026-08-18",
    maintenanceTypeIds: ["pmi", "brake_test"],
  });
  const partial = completeCanonicalMaintenanceItems(record, ["pmi"], "2026-08-18");
  assert.equal(partial.allCompleted, false);
  assert.equal(partial.items.find((item) => item.maintenanceTypeId === "pmi").status, "completed");
  assert.equal(partial.items.find((item) => item.maintenanceTypeId === "brake_test").status, "booked");
  assert.equal(partial.items.find((item) => item.maintenanceTypeId === "pmi").evidenceStatus, "pending");

  const complete = completeCanonicalMaintenanceItems(partial, ["brake_test"], "2026-08-19");
  assert.equal(complete.allCompleted, true);
});

test("partial inspection recurrence recombines only when resulting due dates share an ISO week", () => {
  const canonicalRecord = normalizeMaintenanceRecord({
    id: "inspection-partial",
    companyId: "company-1",
    vehicleId: "vehicle-1",
    type: "INSPECTION",
    status: "Booked",
    appointmentDateISO: "2026-08-18",
    maintenanceTypeIds: ["pmi", "brake_test"],
  });
  const combined = buildNextRequestedMaintenanceRecords({
    canonicalRecord,
    completedTypeIds: ["brake_test"],
    completionDateISO: "2026-08-19",
    vehicle: {
      pmiFreq: 8,
      brakeTestFreq: 8,
      nextPMI: "2026-10-13",
    },
  });
  assert.equal(combined.length, 1);
  assert.deepEqual(
    combined[0].items.map((item) => item.maintenanceTypeId).sort(),
    ["brake_test", "pmi"]
  );

  const separate = buildNextRequestedMaintenanceRecords({
    canonicalRecord,
    completedTypeIds: ["brake_test"],
    completionDateISO: "2026-08-19",
    vehicle: {
      pmiFreq: 8,
      brakeTestFreq: 8,
      nextPMI: "2026-10-20",
    },
  });
  assert.deepEqual(separate[0].items.map((item) => item.maintenanceTypeId), ["brake_test"]);
});

test("PMI and brake work can complete before delayed paperwork arrives", () => {
  const record = normalizeMaintenanceRecord({
    id: "inspection-delayed-evidence",
    vehicleId: "vehicle-1",
    type: "INSPECTION",
    status: "Booked",
    appointmentDateISO: "2026-08-18",
    maintenanceTypeIds: ["pmi", "brake_test"],
  });

  const completed = completeCanonicalMaintenanceItems(
    record,
    ["pmi", "brake_test"],
    "2026-08-18"
  );

  assert.equal(completed.allCompleted, true);
  assert.deepEqual(
    completed.items.map((item) => item.evidenceStatus),
    ["pending", "pending"]
  );
  assert.deepEqual(
    maintenanceCompletionEvidenceIssues(completed, ["pmi", "brake_test"]),
    ["missing_evidence:pmi", "missing_evidence:brake_test"]
  );
});

test("service recurrence uses the configured number of weeks", () => {
  assert.equal(
    calculateNextMaintenanceDue({ maintenanceTypeId: "service", completedDate: "2026-08-18", frequencyWeeks: 52 }),
    "2027-08-17"
  );
  assert.equal(
    calculateNextMaintenanceDue({ maintenanceTypeId: "service", completedDate: "2024-02-29", frequencyWeeks: 52 }),
    "2025-02-27"
  );
});

test("missing or zero frequency does not create recurrence", () => {
  assert.equal(calculateNextMaintenanceDue({ maintenanceTypeId: "service", completedDate: "2026-08-18" }), "");
  assert.equal(calculateNextMaintenanceDue({ maintenanceTypeId: "pmi", completedDate: "2026-08-18", frequencyWeeks: 0 }), "");
});

test("MOT next due date comes only from the DVSA expiry", () => {
  assert.equal(
    calculateNextMaintenanceDue({
      maintenanceTypeId: "mot",
      completedDate: "2026-08-18",
      dvsaExpiryDate: "2027-08-17",
    }),
    "2027-08-17"
  );
  assert.equal(
    calculateNextMaintenanceDue({ maintenanceTypeId: "mot", completedDate: "2026-08-18" }),
    ""
  );
});

test("PMI and brake warnings begin one week early and VOR starts after the due week", () => {
  const warning = getMaintenanceDueState({
    maintenanceTypeId: "pmi",
    dueDate: "2026-08-12",
    asOfDate: "2026-08-03",
  });
  assert.equal(warning.state, "warning");
  assert.equal(warning.vorRequired, false);
  assert.equal(warning.warningStartDateISO, "2026-08-03");

  const due = getMaintenanceDueState({
    maintenanceTypeId: "pmi",
    dueDate: "2026-08-12",
    asOfDate: "2026-08-16",
  });
  assert.equal(due.state, "due");
  assert.equal(due.vorRequired, false);

  const overdue = getMaintenanceDueState({
    maintenanceTypeId: "pmi",
    dueDate: "2026-08-12",
    asOfDate: "2026-08-17",
  });
  assert.equal(overdue.state, "overdue");
  assert.equal(overdue.vorRequired, true);
});
