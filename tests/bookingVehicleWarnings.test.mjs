import test from "node:test";
import assert from "node:assert/strict";

import { buildBookingVehicleWarnings } from "../src/app/utils/bookingVehicleWarnings.js";

test("VOR vehicles remain visible as a Work Diary warning", () => {
  const warnings = buildBookingVehicleWarnings(
    [{ id: "van-1", name: "Camera Van", registration: "AB12 CDE", operationalStatus: "VOR" }],
    { bookingDate: "2026-08-20" }
  );

  assert.deepEqual(warnings, ["VOR: Camera Van (AB12 CDE)"]);
});

test("HGV inspection due before the booking date creates a warning", () => {
  const warnings = buildBookingVehicleWarnings(
    [{
      id: "hgv-1",
      name: "Transporter",
      registration: "HG12 VEE",
      category: "HGV",
      operationalStatus: "Active",
      nextPMI: "2026-08-12",
    }],
    { bookingDate: "2026-08-20" }
  );

  assert.deepEqual(warnings, [
    "HGV INSPECTION DUE BEFORE BOOKING: Transporter (HG12 VEE) — due 12 Aug 2026",
  ]);
});

test("VOR HGVs with an inspection due before work create one combined warning", () => {
  const warnings = buildBookingVehicleWarnings(
    [{
      id: "hgv-2",
      name: "Heavy Unit",
      registration: "HG22 VOR",
      category: "HGV",
      fleetStatus: "VOR",
      nextEightWeekInspection: "2026-08-10",
    }],
    { bookingDate: "2026-08-20" }
  );

  assert.deepEqual(warnings, [
    "VOR / HGV INSPECTION DUE BEFORE BOOKING: Heavy Unit (HG22 VOR) — due 10 Aug 2026",
  ]);
});

test("inspection due on or after the booking date does not warn", () => {
  const warnings = buildBookingVehicleWarnings(
    [{ category: "HGV", name: "In-date HGV", nextPMI: "2026-08-20" }],
    { bookingDate: "2026-08-20" }
  );

  assert.deepEqual(warnings, []);
});
