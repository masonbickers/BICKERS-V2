import assert from "node:assert/strict";
import test from "node:test";

import {
  formatVehicleList,
  formatVehicleRecord,
  resolveVehicleDisplay,
} from "../src/app/utils/vehicleDisplay.js";

const astra = {
  id: "pUpVzQC9rPtwWX0tAOT3",
  name: "Astra K Series 2016",
  registration: "ab12 cde",
};

const lookup = {
  byId: { [astra.id]: astra },
  byReg: { "AB12 CDE": astra },
  byName: { "astra k series 2016": astra },
};

test("formats a vehicle name and registration", () => {
  assert.equal(formatVehicleRecord(astra), "Astra K Series 2016 (AB12 CDE)");
});

test("resolves a stored Firestore vehicle id to its display name", () => {
  assert.equal(resolveVehicleDisplay(astra.id, lookup), "Astra K Series 2016 (AB12 CDE)");
});

test("never exposes an unresolved Firestore vehicle id", () => {
  assert.equal(resolveVehicleDisplay(astra.id), "Vehicle");
});

test("resolves legacy registration and embedded vehicle values", () => {
  assert.equal(resolveVehicleDisplay("ab12 cde", lookup), "Astra K Series 2016 (AB12 CDE)");
  assert.equal(resolveVehicleDisplay({ name: "Low Loader", reg: "xy99 zzz" }), "Low Loader (XY99 ZZZ)");
});

test("formats and de-duplicates mixed vehicle arrays", () => {
  assert.equal(
    formatVehicleList([astra.id, "AB12 CDE", { name: "Low Loader" }], lookup),
    "Astra K Series 2016 (AB12 CDE), Low Loader"
  );
});
