import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildEquipmentPrepRecordId,
  buildVehiclePrepRecordId,
  getEquipmentPrepRecord,
  getVehiclePrepRecord,
  indexAppVehiclePrepRecords,
  isCurrentOrFuturePrepJob,
  isEquipmentPrepped,
  isVehiclePrepped,
  mergePrepRecordSources,
  shouldShowPrepStatus,
} from "../src/app/dashboard/dashboardVehiclePrep.js";

const bookingModalSource = readFileSync(
  new URL("../src/app/components/ViewBookingModal.jsx", import.meta.url),
  "utf8"
);

test("web and app use one deterministic prep record per booking and vehicle", () => {
  assert.equal(
    buildVehiclePrepRecordId("booking/1", "vehicle/2"),
    "job_booking%2F1__vehicle_vehicle%2F2"
  );
});

test("equipment prep uses a distinct deterministic record identity", () => {
  assert.equal(
    buildEquipmentPrepRecordId("booking/1", "equipment/2"),
    "job_booking%2F1__equipment_equipment%2F2"
  );
});

test("booking viewer can mark vehicle prep with a human audit identity", () => {
  assert.match(bookingModalSource, /doc\(db, "vehiclePrepRecords", prepRecordId\)/);
  assert.match(bookingModalSource, /completedByUid:/);
  assert.match(bookingModalSource, /completedByEmployeeId:/);
  assert.match(bookingModalSource, /completedByName:/);
  assert.match(bookingModalSource, /completedByCode:/);
  assert.match(bookingModalSource, /Select employee/);
  assert.match(bookingModalSource, /selectedEmployee\?\.employeeId/);
  assert.match(bookingModalSource, /"Mark prepped"/);
  assert.match(bookingModalSource, /Prepped\{preparedBy \?/);
});

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

test("vehicles without a completed prep record remain pending", () => {
  assert.equal(isVehiclePrepped({}, event, 0), false);
});

test("past jobs hide pending prep while retaining completed prep history", () => {
  const referenceDate = new Date(2026, 7, 28, 12);
  const pastCalendarEvent = {
    start: new Date(2026, 7, 27),
    end: new Date(2026, 7, 28),
  };
  const originalEnd = pastCalendarEvent.end.getTime();

  assert.equal(isCurrentOrFuturePrepJob(pastCalendarEvent, referenceDate), false);
  assert.equal(shouldShowPrepStatus(pastCalendarEvent, false, referenceDate), false);
  assert.equal(shouldShowPrepStatus(pastCalendarEvent, true, referenceDate), true);
  assert.equal(pastCalendarEvent.end.getTime(), originalEnd);
});

test("jobs ending today and future dated jobs still show pending prep", () => {
  const referenceDate = new Date(2026, 7, 28, 12);

  assert.equal(
    isCurrentOrFuturePrepJob({ end: new Date(2026, 7, 29) }, referenceDate),
    true
  );
  assert.equal(
    isCurrentOrFuturePrepJob({ endDate: "2026-08-28" }, referenceDate),
    true
  );
  assert.equal(
    isCurrentOrFuturePrepJob({ bookingDates: ["2026-08-27"] }, referenceDate),
    false
  );
});

test("booking viewer uses the past-job prep visibility rule", () => {
  assert.match(bookingModalSource, /shouldShowPrepStatus\(prepEvent, isPrepped\)/);
  assert.match(bookingModalSource, /!fromDeleted && showPrepStatus/);
});

test("Diary recognises a prep completed from the employee app", () => {
  const appRecords = indexAppVehiclePrepRecords([
    {
      id: "booking-1__vehicle-1",
      bookingId: "booking-1",
      vehicleId: "vehicle-1",
      prepDate: "2026-08-28",
      completed: true,
      completedByName: "Mason",
    },
  ]);
  const appEvent = {
    ...event,
    vehicles: [{ id: "vehicle-1", name: "Tracking Car" }],
  };

  assert.equal(getVehiclePrepRecord(appRecords, appEvent, 0)?.completedByName, "Mason");
  assert.equal(isVehiclePrepped(appRecords, appEvent, 0), true);
});

test("Diary resolves independently prepped equipment", () => {
  const equipmentRecords = indexAppVehiclePrepRecords([
    {
      id: "booking-1__equipment-a-frame",
      bookingId: "booking-1",
      assetType: "equipment",
      equipmentId: "A-Frame 01",
      equipmentName: "A-Frame 01",
      prepDate: "2026-08-28",
      completed: true,
      completedByName: "Alex",
    },
  ]);
  const equipmentEvent = {
    ...event,
    equipment: ["A-Frame 01", "Tow Dolly"],
  };

  assert.equal(getEquipmentPrepRecord(equipmentRecords, equipmentEvent, 0)?.completedByName, "Alex");
  assert.equal(isEquipmentPrepped(equipmentRecords, equipmentEvent, 0), true);
  assert.equal(isEquipmentPrepped(equipmentRecords, equipmentEvent, 1), false);
});
