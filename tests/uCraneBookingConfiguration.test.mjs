import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUCraneArmFittedForSave,
  isUCraneArmFitted,
  isUCraneVehicle,
  normalizeUCraneArmFitted,
} from "../src/app/utils/uCraneBookingConfiguration.js";

test("identifies U-Crane vehicles from category or name", () => {
  assert.equal(isUCraneVehicle({ category: "U-Crane" }), true);
  assert.equal(isUCraneVehicle({ name: "GLC 63s - U-CRANE DYNAMIC" }), true);
  assert.equal(isUCraneVehicle({ category: "Pod Cars", name: "Tracking car" }), false);
});

test("existing bookings default to having the arm fitted", () => {
  assert.equal(isUCraneArmFitted(undefined, "vehicle-1"), true);
  assert.equal(isUCraneArmFitted({}, "vehicle-1"), true);
});

test("an explicit false value records vehicle-only use", () => {
  assert.equal(
    isUCraneArmFitted({ "vehicle-1": false }, "vehicle-1"),
    false
  );
});

test("normalization keeps only usable vehicle keys and boolean meaning", () => {
  assert.deepEqual(
    normalizeUCraneArmFitted({
      " vehicle-1 ": false,
      "vehicle-2": true,
      "": false,
      "vehicle-3": "false",
    }),
    {
      "vehicle-1": false,
      "vehicle-2": true,
      "vehicle-3": true,
    }
  );
});

test("save payload contains only selected U-Crane vehicles", () => {
  const vehicleLookup = {
    byId: {
      crane: { id: "crane", category: "U-Crane" },
      pod: { id: "pod", category: "Pod Cars" },
    },
  };

  assert.deepEqual(
    buildUCraneArmFittedForSave({
      vehicleIds: ["crane", "pod"],
      vehicleLookup,
      configuration: { crane: false, pod: false },
    }),
    { crane: false }
  );
});
