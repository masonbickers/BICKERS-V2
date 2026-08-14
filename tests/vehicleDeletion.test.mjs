import test from "node:test";
import assert from "node:assert/strict";

import {
  VEHICLE_BOOKING_COLLECTIONS,
  isRecordLinkedToVehicle,
  linkedVehicleBookingDocuments,
} from "../src/app/utils/vehicleDeletion.js";

test("vehicle deletion covers canonical and legacy maintenance booking sources", () => {
  assert.deepEqual(VEHICLE_BOOKING_COLLECTIONS.map((item) => item.collection), [
    "maintenanceBookings",
    "maintenanceJobs",
    "workBookings",
  ]);
});

test("maintenance jobs can link through vehicleId or assetId", () => {
  assert.equal(isRecordLinkedToVehicle({ vehicleId: "vehicle-1" }, "vehicle-1", ["vehicleId", "assetId"]), true);
  assert.equal(isRecordLinkedToVehicle({ assetId: "vehicle-1" }, "vehicle-1", ["vehicleId", "assetId"]), true);
  assert.equal(isRecordLinkedToVehicle({ assetId: "vehicle-2" }, "vehicle-1", ["vehicleId", "assetId"]), false);
});

test("linked booking selection preserves records from another tenant", () => {
  const selected = linkedVehicleBookingDocuments({
    vehicleId: "vehicle-1",
    vehicleFields: ["vehicleId"],
    companyId: "company-1",
    documents: [
      { id: "same-tenant", data: { vehicleId: "vehicle-1", companyId: "company-1" } },
      { id: "legacy", data: { vehicleId: "vehicle-1" } },
      { id: "other-tenant", data: { vehicleId: "vehicle-1", companyId: "company-2" } },
      { id: "other-vehicle", data: { vehicleId: "vehicle-2", companyId: "company-1" } },
    ],
  });

  assert.deepEqual(selected.map((document) => document.id), ["same-tenant", "legacy"]);
});
