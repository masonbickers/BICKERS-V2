import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardVehicleRegister,
  resolveDashboardVehicle,
  resolveDashboardVehicleDisplays,
  resolveDashboardVehicles,
} from "../src/app/utils/dashboardVehicleResolver.js";

const vehicles = [
  {
    id: "vehicle-1",
    name: "Lifting Van",
    registration: "AB12 CDE",
    nextMOT: "2027-01-10",
    insuranceStatus: "Insured",
  },
  {
    id: "vehicle-2",
    name: "Lifting Van",
    registration: "XY34 ZZZ",
    nextMOT: "2027-05-20",
    insuranceStatus: "Insured",
  },
  {
    id: "vehicle-3",
    name: "Camera Car",
    registration: "CA11 MER",
    nextMOT: "2027-04-15",
  },
];

const register = buildDashboardVehicleRegister(vehicles);

test("document ID wins and stale embedded compliance fields are discarded", () => {
  const result = resolveDashboardVehicle(
    {
      id: "vehicle-1",
      name: "Old vehicle name",
      registration: "OLD REG",
      nextMOT: "2020-01-01",
      insuranceStatus: "Not insured",
    },
    register
  );

  assert.equal(result, vehicles[0]);
  assert.equal(result.nextMOT, "2027-01-10");
  assert.equal(result.insuranceStatus, "Insured");
});

test("unique registration resolves to the current register record", () => {
  assert.equal(
    resolveDashboardVehicle(
      { name: "Legacy label", registration: "ca11 mer", nextMOT: "2020-01-01" },
      register
    ),
    vehicles[2]
  );
});

test("duplicate legacy names fail safely instead of selecting the first vehicle", () => {
  const result = resolveDashboardVehicle("Lifting Van", register);

  assert.equal(result.id, undefined);
  assert.equal(result.name, "Lifting Van");
  assert.equal(result.__vehicleResolution, "ambiguous-name");
  assert.equal(result.nextMOT, undefined);
});

test("a unique legacy name resolves to the current register record", () => {
  assert.equal(resolveDashboardVehicle("Camera Car", register), vehicles[2]);
});

test("resolved master vehicles are deduplicated by document ID", () => {
  const result = resolveDashboardVehicles(
    ["vehicle-3", { id: "vehicle-3", nextMOT: "2020-01-01" }],
    register
  );

  assert.deepEqual(result, [vehicles[2]]);
});

test("work diary display preserves booking labels while using current compliance data", () => {
  const result = resolveDashboardVehicleDisplays(
    [{
      id: "vehicle-1",
      name: "Booked vehicle label",
      registration: "BOOKED REG",
      nextMOT: "2020-01-01",
      insuranceStatus: "Not insured",
    }],
    register
  );

  assert.equal(result[0].name, "Booked vehicle label");
  assert.equal(result[0].registration, "BOOKED REG");
  assert.equal(result[0].nextMOT, "2027-01-10");
  assert.equal(result[0].insuranceStatus, "Insured");
});

test("work diary display does not remove duplicate booking vehicle rows", () => {
  const result = resolveDashboardVehicleDisplays(
    [{ id: "vehicle-3", name: "Camera Car A" }, { id: "vehicle-3", name: "Camera Car B" }],
    register
  );

  assert.deepEqual(result.map((vehicle) => vehicle.name), ["Camera Car A", "Camera Car B"]);
});
