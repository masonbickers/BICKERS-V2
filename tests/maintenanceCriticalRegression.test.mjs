import assert from "node:assert/strict";
import test from "node:test";

import { buildFirestoreCommitWrites } from "../src/app/utils/firestoreCommitPlanning.js";
import {
  calculateNextMaintenanceDue,
  completeCanonicalMaintenanceItems,
  maintenanceIsoWeekLabel,
  maintenanceRequirementDocumentId,
  maintenanceRequirementKey,
} from "../src/app/utils/maintenanceRecord.js";
import {
  assertInitialMaintenanceStatus,
  buildAtomicRescheduleWriteSet,
} from "../src/app/utils/maintenanceMutationPolicy.js";
import { isVorAffectedMaintenanceBooking } from "../src/app/utils/vorBookingPolicy.js";

test("creation rejects completed and cancelled legal records", () => {
  assert.throws(() => assertInitialMaintenanceStatus("Completed"), /only start as Requested or Booked/);
  assert.throws(() => assertInitialMaintenanceStatus("Cancelled"), /only start as Requested or Booked/);
});

test("actual completion date remains independent from appointment date", () => {
  const completed = completeCanonicalMaintenanceItems({
    schedule: { bookingDates: ["2026-08-04"] },
    items: [{ maintenanceTypeId: "service", status: "booked", completionDateISO: "" }],
  }, ["service"], "2026-08-06");
  assert.equal(completed.items[0].completionDateISO, "2026-08-06");
  assert.notEqual(completed.items[0].completionDateISO, completed.schedule.bookingDates[0]);
});

test("a tacho-only INSPECTION is preserved when the vehicle becomes VOR", () => {
  assert.equal(isVorAffectedMaintenanceBooking({
    type: "INSPECTION",
    status: "Booked",
    appointmentDateISO: "2026-08-10",
    maintenanceTypeIds: ["tacho_inspection"],
  }, { offRoadDate: "2026-08-04" }), false);
});

test("rescheduling commits booking and vehicle summary fields together", () => {
  const writes = buildAtomicRescheduleWriteSet({
    bookingId: "booking-1",
    bookingUpdateTime: "2026-08-04T10:00:00Z",
    bookingPatch: { bookingDates: ["2026-08-12"], appointmentDateISO: "2026-08-12" },
    vehicleId: "vehicle-1",
    vehiclePatch: { inspectionAppointmentDate: "2026-08-12", inspectionBookingId: "booking-1" },
  });
  assert.deepEqual(writes.map((write) => write.collection), ["maintenanceBookings", "vehicles"]);
  assert.equal(writes[0].patch.appointmentDateISO, writes[1].patch.inspectionAppointmentDate);
  assert.throws(() => buildAtomicRescheduleWriteSet({
    bookingId: "booking-1",
    bookingPatch: { bookingDates: ["2026-08-12"] },
    vehicleId: "vehicle-1",
    vehiclePatch: { inspectionAppointmentDate: "2026-08-13" },
  }), /must match/);
});

test("concurrent completion and reforecast attempts remain idempotent", async () => {
  const completionPlan = buildFirestoreCommitWrites([{
    collection: "maintenanceBookings",
    documentId: "booking-1",
    patch: { status: "Completed" },
    updateTime: "version-1",
  }], "projects/test/databases/(default)/documents");
  assert.equal(completionPlan[0].currentDocument.updateTime, "version-1");
  let currentUpdateTime = "version-1";
  const complete = async () => {
    if (completionPlan[0].currentDocument.updateTime !== currentUpdateTime) throw new Error("FAILED_PRECONDITION");
    currentUpdateTime = "version-2";
  };
  const completionOutcomes = await Promise.allSettled([complete(), complete()]);
  assert.deepEqual(completionOutcomes.map((outcome) => outcome.status).sort(), ["fulfilled", "rejected"]);

  const requirementKey = maintenanceRequirementKey({
    companyId: "company-a",
    vehicleId: "vehicle-1",
    maintenanceTypeIds: ["pmi", "brake_test"],
    legalDueDateISO: "2026-09-29",
  });
  const id = maintenanceRequirementDocumentId(requirementKey);
  const planned = buildFirestoreCommitWrites([{
    collection: "maintenanceBookings",
    documentId: id,
    patch: { requirementKey, status: "Requested" },
    exists: false,
  }], "projects/test/databases/(default)/documents");
  assert.equal(planned[0].currentDocument.exists, false);

  const documents = new Set();
  const commit = async () => {
    const name = planned[0].update.name;
    if (planned[0].currentDocument.exists === false && documents.has(name)) {
      throw new Error("FAILED_PRECONDITION");
    }
    documents.add(name);
    return name;
  };
  const forecastOutcomes = await Promise.allSettled([commit(), commit()]);
  assert.deepEqual(forecastOutcomes.map((outcome) => outcome.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(documents.size, 1);
});

test("PMI and brake can complete separately or together", () => {
  const record = {
    items: [
      { maintenanceTypeId: "pmi", status: "booked" },
      { maintenanceTypeId: "brake_test", status: "booked" },
    ],
  };
  const pmiOnly = completeCanonicalMaintenanceItems(record, ["pmi"], "2026-08-04");
  assert.equal(pmiOnly.allCompleted, false);
  assert.deepEqual(pmiOnly.items.map((item) => item.status), ["completed", "booked"]);
  const together = completeCanonicalMaintenanceItems(record, ["pmi", "brake_test"], "2026-08-04");
  assert.equal(together.allCompleted, true);
  assert.deepEqual(together.completedTypeIds, ["pmi", "brake_test"]);
});

test("service recurrence handles leap day and ISO week-year boundaries", () => {
  assert.equal(calculateNextMaintenanceDue({ maintenanceTypeId: "service", completedDate: "2024-02-29" }), "2025-02-28");
  assert.equal(maintenanceIsoWeekLabel("2025-12-29"), "2026-W01");
  assert.equal(maintenanceIsoWeekLabel("2027-01-03"), "2026-W53");
  assert.equal(maintenanceIsoWeekLabel("2027-01-04"), "2027-W01");
});
