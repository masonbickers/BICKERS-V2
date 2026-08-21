import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeVehicleAssetNumber,
  syncVehicleAssetNumberAliases,
} from "../src/app/utils/vehicleAssetNumber.js";

test("normalizes numeric vehicle asset numbers to four digits", () => {
  assert.equal(normalizeVehicleAssetNumber("2"), "0002");
  assert.equal(normalizeVehicleAssetNumber("0103"), "0103");
  assert.equal(normalizeVehicleAssetNumber(""), "");
});

test("normalizes Sage asset-number aliases", () => {
  const vehicle = syncVehicleAssetNumberAliases({
    sageAssetNumber: "103",
  });

  assert.equal(vehicle.assetNumber, "0103");
  assert.equal(vehicle.sageAssetNumber, "0103");
});
