import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActiveInspectionMetaByVehicle,
  buildBookedMetaByVehicle,
  buildMaintenanceBookingEvents,
  buildVehicleDueEvents,
  isMaintenanceCalendarEventDraggable,
  isOpenMaintenanceBooking,
} from "../src/app/utils/maintenanceCalendar.js";
import { CALENDAR_REMINDER_WORKFLOW_KEYS } from "../src/app/utils/maintenanceSchema.js";

test("dashboard register reminders remain limited to the previous Brake and PMI scope", () => {
  assert.deepEqual(
    CALENDAR_REMINDER_WORKFLOW_KEYS,
    ["brake_test", "pmi"]
  );
});

test("vehicle due events do not turn tacho, LOLER or tail-lift dates into appointments", () => {
  const events = buildVehicleDueEvents([{
    id: "vehicle-1",
    nextBrakeTest: "2026-08-01",
    nextTacho: "2026-08-02",
    nextTachoDownload: "2026-08-03",
    nextLoler: "2026-08-04",
    nextTailLift: "2026-08-05",
  }]);

  const appointmentEvents = events.filter((event) => event.kind === "MAINTENANCE_APPOINTMENT");
  assert.equal(appointmentEvents.length, 1);
  assert.deepEqual(appointmentEvents[0].maintenanceKeys, ["brake_test"]);
});

test("only MOT and SERVICE bookings mark vehicle due events as booked", () => {
  const now = new Date("2026-07-28T12:00:00");
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
  ], now);

  assert.equal(result["vehicle-1"].mot.has, true);
  assert.equal(result["vehicle-1"].service.has, true);
  assert.equal(result["vehicle-1"].mot.earliestAppt.getDate(), 10);
  assert.equal(result["vehicle-1"].service.earliestAppt.getDate(), 12);
  assert.equal(result["vehicle-2"], undefined);
  assert.equal(result["vehicle-3"], undefined);
  assert.equal(result["vehicle-4"], undefined);
});

test("completed, inactive and stale MOT or SERVICE bookings do not mark due events as booked", () => {
  const now = new Date("2026-07-28T12:00:00");
  const result = buildBookedMetaByVehicle([
    { vehicleId: "completed-mot", type: "MOT", status: "Completed", appointmentDateISO: "2026-08-10" },
    { vehicleId: "complete-service", type: "SERVICE", status: "Complete", appointmentDateISO: "2026-08-10" },
    { vehicleId: "cancelled-mot", type: "MOT", status: "Cancelled", appointmentDateISO: "2026-08-10" },
    { vehicleId: "closed-service", type: "SERVICE", status: "Closed", appointmentDateISO: "2026-08-10" },
    { vehicleId: "deleted-mot", type: "MOT", status: "Deleted", appointmentDateISO: "2026-08-10" },
    { vehicleId: "declined-service", type: "SERVICE", status: "Declined", appointmentDateISO: "2026-08-10" },
    { vehicleId: "stale-mot", type: "MOT", status: "Booked", appointmentDateISO: "2026-07-01" },
  ], now);

  assert.deepEqual(result, {});
});

test("only open inspection bookings mark dashboard inspection weeks as booked", () => {
  const now = new Date("2026-07-28T12:00:00");
  const result = buildActiveInspectionMetaByVehicle([
    {
      id: "open",
      vehicleId: "vehicle-1",
      type: "INSPECTION",
      status: "Booked",
      bookingDates: ["2026-07-29", "2026-07-30"],
      sourceDueKey: "inspection_due__vehicle-1__2026-07-30",
      sourceDueIsoWeek: "2026-W31",
    },
    {
      id: "completed",
      vehicleId: "vehicle-2",
      type: "INSPECTION",
      status: "Completed",
      appointmentDateISO: "2026-08-05",
      sourceDueIsoWeek: "2026-W32",
    },
    {
      id: "stale",
      vehicleId: "vehicle-3",
      type: "INSPECTION",
      status: "Booked",
      appointmentDateISO: "2026-07-01",
    },
  ], now);

  assert.equal(result["vehicle-1"].bookings.length, 1);
  assert.equal(result["vehicle-1"].sourceDueKeys.has("inspection_due__vehicle-1__2026-07-30"), true);
  assert.equal(result["vehicle-1"].sourceDueWeeks.has("2026-W31"), true);
  assert.equal(result["vehicle-1"].bookedWeeks.has("2026-W31"), true);
  assert.equal(result["vehicle-2"], undefined);
  assert.equal(result["vehicle-3"], undefined);
});

test("completed bookings remain historical calendar events but cannot be dragged", () => {
  const events = buildMaintenanceBookingEvents([
    {
      id: "completed-service",
      vehicleId: "vehicle-1",
      vehicleLabel: "Test Vehicle",
      type: "SERVICE",
      status: "Completed",
      appointmentDateISO: "2026-07-20",
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].bookingStatus, "Completed");
  assert.equal(isMaintenanceCalendarEventDraggable(events[0]), false);
  assert.equal(
    isMaintenanceCalendarEventDraggable({
      ...events[0],
      status: "Maintenance",
      bookingStatus: "Booked",
    }),
    true
  );
  assert.equal(
    isMaintenanceCalendarEventDraggable({
      kind: "MAINTENANCE_APPOINTMENT",
      vehicleId: "vehicle-1",
      bookingStatus: "Completed",
    }),
    false
  );
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
