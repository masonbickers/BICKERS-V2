import assert from "node:assert/strict";
import test from "node:test";

import { buildPlannerMaintenanceModalEvent } from "../src/app/hgv-compliance/hgvPlanner.js";

const vehicle = {
  id: "vehicle-1",
  name: "Test HGV",
  registration: "HGV123",
};

test("linked planner entries open as saved maintenance bookings", () => {
  const result = buildPlannerMaintenanceModalEvent({
    event: {
      bookingId: "booking-1",
      registration: "HGV123",
      type: "mot",
      date: "2026-08-03",
      status: "completed",
    },
    vehicle,
    booking: { id: "booking-1", vehicleId: "vehicle-1", type: "MOT" },
  });

  assert.equal(result.__collection, "maintenanceBookings");
  assert.equal(result.id, "booking-1");
  assert.equal(result.__parentId, "booking-1");
  assert.equal(result.plannerSourceLabel, "Saved maintenance booking");
  assert.equal(result.disableBookingActions, false);
});

test("unlinked completed entries open as read-only maintenance records", () => {
  const result = buildPlannerMaintenanceModalEvent({
    event: {
      id: "history-1",
      registration: "HGV123",
      type: "inspection_brake",
      date: "2026-08-03",
      status: "completed",
      source: "vehicle_last_completed_date",
      label: "PMI + brake test completed",
    },
    vehicle,
  });

  assert.equal(result.__collection, "hgvPlannerHistory");
  assert.equal(result.id, "");
  assert.equal(result.plannerEventId, "history-1");
  assert.equal(result.completedAtISO, "2026-08-03");
  assert.equal(result.title, "Test HGV");
  assert.equal(result.notes, "PMI + Brake Test Completed");
  assert.deepEqual(result.maintenanceTypeIds, ["pmi", "brake_test"]);
  assert.equal(result.plannerSourceLabel, "Recorded vehicle completion date");
  assert.equal(result.disableBookingActions, true);
});

test("calculated due entries open consistently and remain bookable", () => {
  const result = buildPlannerMaintenanceModalEvent({
    event: {
      registration: "HGV123",
      type: "inspection",
      date: "2026-09-28",
      status: "due",
    },
    vehicle,
  });

  assert.equal(result.__collection, "vehicleDueDates");
  assert.equal(result.kind, "INSPECTION");
  assert.equal(result.dueDate, "2026-09-28");
  assert.equal(result.plannerSourceLabel, "Calculated due date");
  assert.equal(result.disableBookingActions, false);
});
