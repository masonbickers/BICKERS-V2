import test from "node:test";
import assert from "node:assert/strict";

import {
  blockingStatusesForPriorityEdit,
  canAutoAssignVehicleAsSecondPencil,
  canRetainVehiclePriorityOnEdit,
  existingVehicleStatusesConflictWithRequested,
  isPriorityVehicleStatus,
} from "../src/app/utils/bookingVehiclePriority.js";

test("a first pencil can take priority over an existing second pencil", () => {
  assert.equal(
    existingVehicleStatusesConflictWithRequested(["Second Pencil"], "First Pencil"),
    false
  );
  assert.equal(
    existingVehicleStatusesConflictWithRequested(["Second Pencil"], "Confirmed"),
    false
  );
});

test("priority and maintenance conflicts still block first pencil", () => {
  assert.equal(
    existingVehicleStatusesConflictWithRequested(["First Pencil"], "First Pencil"),
    true
  );
  assert.equal(
    existingVehicleStatusesConflictWithRequested(["Confirmed"], "First Pencil"),
    true
  );
  assert.equal(
    existingVehicleStatusesConflictWithRequested(["Maintenance"], "First Pencil"),
    true
  );
});

test("second pencil still cannot stack behind another second pencil", () => {
  assert.equal(
    existingVehicleStatusesConflictWithRequested(["Second Pencil"], "Second Pencil"),
    true
  );
  assert.equal(
    existingVehicleStatusesConflictWithRequested(["First Pencil"], "Second Pencil"),
    false
  );
});

test("confirmed and first-pencil conflicts can fall back to second pencil", () => {
  assert.equal(canAutoAssignVehicleAsSecondPencil(["First Pencil"], "Confirmed"), true);
  assert.equal(canAutoAssignVehicleAsSecondPencil(["Confirmed"], "First Pencil"), true);
});

test("second-pencil fallback stays blocked by another second pencil or maintenance", () => {
  assert.equal(
    canAutoAssignVehicleAsSecondPencil(["First Pencil", "Second Pencil"], "Confirmed"),
    false
  );
  assert.equal(
    canAutoAssignVehicleAsSecondPencil(["Confirmed", "Maintenance"], "First Pencil"),
    false
  );
  assert.equal(canAutoAssignVehicleAsSecondPencil(["First Pencil"], "Maintenance"), false);
});

test("confirmed and first-pencil vehicle allocations hold priority", () => {
  assert.equal(isPriorityVehicleStatus("Confirmed"), true);
  assert.equal(isPriorityVehicleStatus(" First Pencil "), true);
  assert.equal(isPriorityVehicleStatus("Second Pencil"), false);
});

test("editing an existing first pencil retains priority on its original dates", () => {
  assert.equal(
    canRetainVehiclePriorityOnEdit({
      originalStatus: "First Pencil",
      requestedStatus: "First Pencil",
      originalDates: ["2026-08-05", "2026-08-06"],
      requestedDates: ["2026-08-05", "2026-08-06"],
    }),
    true
  );
});

test("retained priority ignores only a competing second pencil", () => {
  assert.deepEqual(
    blockingStatusesForPriorityEdit(
      ["Second Pencil", "Maintenance", "First Pencil"],
      true
    ),
    ["Maintenance", "First Pencil"]
  );
  assert.deepEqual(
    blockingStatusesForPriorityEdit(["Second Pencil"], false),
    ["Second Pencil"]
  );
});

test("priority is retained when an existing first pencil is confirmed", () => {
  assert.equal(
    canRetainVehiclePriorityOnEdit({
      originalStatus: "First Pencil",
      requestedStatus: "Confirmed",
      originalDates: ["2026-08-05"],
      requestedDates: ["2026-08-05"],
    }),
    true
  );
});

test("priority exception does not cover new dates or second-pencil allocations", () => {
  assert.equal(
    canRetainVehiclePriorityOnEdit({
      originalStatus: "First Pencil",
      requestedStatus: "First Pencil",
      originalDates: ["2026-08-05"],
      requestedDates: ["2026-08-05", "2026-08-06"],
    }),
    false
  );
  assert.equal(
    canRetainVehiclePriorityOnEdit({
      originalStatus: "Second Pencil",
      requestedStatus: "First Pencil",
      originalDates: ["2026-08-05"],
      requestedDates: ["2026-08-05"],
    }),
    false
  );
});
