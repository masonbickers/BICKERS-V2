import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_EQUIPMENT_SELECTION,
  equipmentSelectionKey,
  equipmentSelectionsEqual,
  normalizeEquipmentSelection,
} from "../src/app/utils/maintenanceBookingFormState.js";

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
