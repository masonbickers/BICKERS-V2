import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBookedMetaByVehicle,
  isOpenMaintenanceBooking,
} from "../src/app/utils/maintenanceCalendar.js";

test("only MOT and SERVICE bookings mark vehicle due events as booked", () => {
  const result = buildBookedMetaByVehicle([
    {
      vehicleId: "vehicle-1",
      type: "MOT",
      appointmentDate: "2026-08-10",
      status: "booked",
    },
    {
      vehicleId: "vehicle-1",
      type: "SERVICE",
      appointmentDate: "2026-08-12",
      status: "booked",
    },
    {
      vehicleId: "vehicle-2",
      type: "WORK",
      appointmentDate: "2026-08-11",
      status: "booked",
    },
    {
      vehicleId: "vehicle-3",
      type: "INSPECTION",
      appointmentDate: "2026-08-13",
      status: "booked",
    },
    {
      vehicleId: "vehicle-4",
      type: "REPAIR",
      appointmentDate: "2026-08-14",
      status: "booked",
    },
  ]);

  assert.equal(result["vehicle-1"].mot.has, true);
  assert.equal(result["vehicle-1"].service.has, true);
  assert.equal(result["vehicle-1"].mot.earliestAppt.getDate(), 10);
  assert.equal(result["vehicle-1"].service.earliestAppt.getDate(), 12);
  assert.equal(result["vehicle-2"], undefined);
  assert.equal(result["vehicle-3"], undefined);
  assert.equal(result["vehicle-4"], undefined);
});

test("open maintenance bookings exclude terminal statuses for every booking type", () => {
  const now = new Date("2026-07-28T12:00:00");

  for (const type of ["MOT", "SERVICE", "WORK", "INSPECTION"]) {
    assert.equal(
      isOpenMaintenanceBooking(
        { type, status: "Completed", appointmentDateISO: "2026-08-10" },
        now
      ),
      false,
      `${type} completed booking`
    );
  }

  for (const status of ["Cancelled", "Closed", "Deleted", "Declined"]) {
    assert.equal(
      isOpenMaintenanceBooking(
        { type: "WORK", status, appointmentDateISO: "2026-08-10" },
        now
      ),
      false,
      status
    );
  }
});

test("open maintenance bookings exclude stale dates and retain today or future work", () => {
  const now = new Date("2026-07-28T12:00:00");

  assert.equal(
    isOpenMaintenanceBooking(
      { type: "WORK", status: "Booked", appointmentDateISO: "2026-04-01" },
      now
    ),
    false
  );
  assert.equal(
    isOpenMaintenanceBooking(
      { type: "SERVICE", status: "Booked", appointmentDateISO: "2026-07-28" },
      now
    ),
    true
  );
  assert.equal(
    isOpenMaintenanceBooking(
      {
        type: "INSPECTION",
        status: "Booked",
        bookingDates: ["2026-07-29", "2026-07-30"],
      },
      now
    ),
    true
  );
});
