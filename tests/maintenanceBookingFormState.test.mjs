import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_EQUIPMENT_SELECTION,
  equipmentSelectionKey,
  equipmentSelectionsEqual,
  maintenanceBookingParticipatesInConflict,
  maintenanceBookingsCompete,
  normalizeEquipmentSelection,
} from "../src/app/utils/maintenanceBookingFormState.js";

test("only non-terminal maintenance records participate in booking conflicts", () => {
  for (const status of ["Archived", "Cancelled", "Declined", "Deleted", "Closed", "Superseded", "Completed"]) {
    assert.equal(maintenanceBookingParticipatesInConflict({ status }), false, status);
  }
  for (const status of ["Requested", "Booked", "In Progress", "Deferred", ""]) {
    assert.equal(maintenanceBookingParticipatesInConflict({ status }), true, status || "legacy blank");
  }
});

test("omitted equipment uses a stable empty selection", () => {
  assert.equal(equipmentSelectionKey(EMPTY_EQUIPMENT_SELECTION), "[]");
  assert.equal(equipmentSelectionKey([]), "[]");
  assert.equal(equipmentSelectionsEqual(EMPTY_EQUIPMENT_SELECTION, []), true);
});

test("selection identity depends on content rather than array identity", () => {
  assert.equal(
    equipmentSelectionKey(["Crane 1", "Camera 2"]),
    equipmentSelectionKey(["Crane 1", "Camera 2"])
  );
  assert.equal(equipmentSelectionsEqual(["Crane 1"], ["Crane 2"]), false);
});

test("equipment selections are trimmed, de-duplicated and empty-safe", () => {
  assert.deepEqual(
    normalizeEquipmentSelection([" Crane 1 ", "", null, "Crane 1", "Camera 2"]),
    ["Crane 1", "Camera 2"]
  );
});

test("different maintenance types can share the same workshop date", () => {
  assert.equal(maintenanceBookingsCompete({ type: "MOT" }, "SERVICE"), false);
  assert.equal(maintenanceBookingsCompete({ type: "SERVICE" }, "MOT"), false);
  assert.equal(
    maintenanceBookingsCompete(
      { type: "INSPECTION", maintenanceTypeIds: ["pmi"] },
      "SERVICE"
    ),
    false
  );
});

test("duplicate maintenance requirements remain hard conflicts", () => {
  assert.equal(maintenanceBookingsCompete({ type: "MOT" }, "MOT"), true);
  assert.equal(maintenanceBookingsCompete({ type: "SERVICE" }, "SERVICE"), true);
  assert.equal(
    maintenanceBookingsCompete(
      { type: "INSPECTION", maintenanceTypeIds: ["pmi"] },
      "INSPECTION",
      ["pmi", "brake_test"]
    ),
    true
  );
  assert.equal(
    maintenanceBookingsCompete(
      { type: "INSPECTION", maintenanceTypeIds: ["tacho_inspection"] },
      "INSPECTION",
      ["pmi"]
    ),
    false
  );
});

test("create and edit booking forms share the same overlap policy", async () => {
  const { readFile } = await import("node:fs/promises");
  const [createSource, editSource] = await Promise.all([
    readFile(new URL("../src/app/components/MaintenanceBookingForm.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/components/EditMaintenanceBookingForm.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(createSource, /maintenanceBookingsCompete/);
  assert.match(editSource, /maintenanceBookingsCompete/);
  assert.match(createSource, /maintenanceBookingParticipatesInConflict/);
  assert.match(editSource, /maintenanceBookingParticipatesInConflict/);
  assert.match(createSource, /Existing maintenance on this date — allowed/);
  assert.match(editSource, /Existing maintenance on this date — allowed/);
  assert.match(createSource, /Optional workshop details/);
  assert.match(editSource, /Optional workshop details/);
  assert.match(createSource, /motExpiryAcknowledged/);
  assert.match(editSource, /motExpiryAcknowledged/);
  assert.match(createSource, /I acknowledge that the MOT will be expired on the appointment date/);
  assert.match(editSource, /I acknowledge that the MOT will be expired on the appointment date/);
  assert.doesNotMatch(createSource, /<details className=\{layoutStyles\.(bookingSettings|additionalDetails)\}/);
  assert.doesNotMatch(editSource, /<details className=\{layoutStyles\.(bookingSettings|additionalDetails)\}/);
  assert.doesNotMatch(createSource, /Cost \(optional\)/);
  assert.doesNotMatch(createSource, /Saves to <b>maintenanceBookings<\/b>/);
});
