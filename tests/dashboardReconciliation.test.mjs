import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHolidayCalendarTitle,
  buildHolidayEmployeeLabel,
} from "../src/app/utils/dashboardHolidayLabels.js";
import {
  reconcileMaintenanceEventVehicle,
} from "../src/app/utils/maintenanceCalendar.js";

test("maintenance cards refresh their vehicle name and registration from the register", () => {
  const event = {
    vehicleId: "vehicle-1",
    vehicleLabel: "Low Loader 02/ U-C",
    maintenanceType: "WORK",
    provider: "ROY HUMPHREY BODY SHOP",
    title: "Low Loader 02/ U-C - WORK - ROY HUMPHREY BODY SHOP",
  };
  const vehicle = {
    id: "vehicle-1",
    name: "Low Loader 02/ U-C",
    registration: "AB12 CDE",
  };

  const reconciled = reconcileMaintenanceEventVehicle(event, vehicle);

  assert.equal(
    reconciled.title,
    "Low Loader 02/ U-C (AB12 CDE) - WORK - ROY HUMPHREY BODY SHOP"
  );
  assert.equal(reconciled.vehicleRegistration, "AB12 CDE");
  assert.equal(reconciled.vehicleResolution, "register");
});

test("maintenance cards mark a missing vehicle as unresolved", () => {
  const reconciled = reconcileMaintenanceEventVehicle(
    {
      vehicleId: "missing",
      title: "Stale vehicle - WORK",
    },
    null
  );

  assert.equal(reconciled.vehicleResolution, "not-found");
  assert.equal(reconciled.title, "Stale vehicle - WORK");
});

test("same-day AM and PM holidays receive distinct calendar titles", () => {
  const base = {
    startDate: "2026-07-28",
    endDate: "2026-07-28",
    startHalfDay: true,
  };

  assert.equal(
    buildHolidayCalendarTitle("Jamie Evans-Payne", {
      ...base,
      startAMPM: "AM",
    }),
    "Jamie Evans-Payne (AM half-day) - Holiday"
  );
  assert.equal(
    buildHolidayCalendarTitle("Jamie Evans-Payne", {
      ...base,
      startAMPM: "PM",
    }),
    "Jamie Evans-Payne (PM half-day) - Holiday"
  );
});

test("full-day holiday employee labels remain unchanged", () => {
  assert.equal(
    buildHolidayEmployeeLabel("Sophie Albrow", {
      startDate: "2026-07-28",
      endDate: "2026-07-28",
    }),
    "Sophie Albrow"
  );
});
