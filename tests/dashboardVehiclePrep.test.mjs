import test from "node:test";
import assert from "node:assert/strict";
import {
  getVehiclePrepRecord,
  isVehiclePrepped,
  mergePrepRecordSources,
} from "../src/app/dashboard/dashboardVehiclePrep.js";

const event = {
  id: "booking-1__date_group__0",
  __bookingId: "booking-1",
  startDate: "2026-08-28",
};

test("diary resolves prep state by booking, vehicle position and outing date", () => {
  const records = {
    "booking-1::0::Tracking Car::2026-08-28": { completed: true, preparedBy: "Mason" },
    "booking-1::1::Low Loader::2026-08-28": { completed: false },
  };

  assert.equal(getVehiclePrepRecord(records, event, 0)?.preparedBy, "Mason");
  assert.equal(isVehiclePrepped(records, event, 0), true);
  assert.equal(isVehiclePrepped(records, event, 1), false);
});

test("removed prep records do not show as ready on the diary", () => {
  const records = {
    "booking-1::0::Tracking Car::2026-08-28": { completed: true, removed: true },
  };

  assert.equal(isVehiclePrepped(records, event, 0), false);
});

test("shared prep records override older browser records", () => {
  const key = "booking-1::0::Tracking Car::2026-08-28";
  const merged = mergePrepRecordSources(
    { [key]: { completed: false } },
    { [key]: { completed: true } }
  );

  assert.equal(merged[key].completed, true);
});
