import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMaintenanceScheduleExceptionAlert,
  buildMaintenanceVorAlert,
  buildMaintenanceWarningAlerts,
  normalizeAlertRecipients,
} from "../src/app/utils/maintenanceAlerts.js";

const vehicle = {
  id: "vehicle-1",
  category: "HGV",
  registration: "AB12 CDE",
  nextPMI: "2026-08-17",
  nextBrakeTest: "2026-08-17",
  pmiFreq: 8,
  brakeTestFreq: 8,
};

test("PMI and brake warnings open in the ISO week before the due week", () => {
  const alerts = buildMaintenanceWarningAlerts(vehicle, { asOfDate: "2026-08-10" });
  assert.deepEqual(alerts.map((alert) => alert.maintenanceTypeId), ["pmi", "brake_test"]);
  assert.ok(alerts.every((alert) => alert.severity === "warning"));
});

test("warnings remain urgent during the due week and stay visible when overdue", () => {
  assert.ok(buildMaintenanceWarningAlerts(vehicle, { asOfDate: "2026-08-18" }).every((alert) => alert.severity === "urgent"));
  assert.equal(buildMaintenanceWarningAlerts(vehicle, { asOfDate: "2026-08-09" }).length, 0);
  const overdue = buildMaintenanceWarningAlerts(vehicle, { asOfDate: "2026-08-24" });
  assert.equal(overdue.length, 2);
  assert.ok(overdue.every((alert) => alert.dueState === "overdue"));
});

test("removed PMI and brake-test lines do not produce stale expiry warnings", () => {
  const alerts = buildMaintenanceWarningAlerts(
    {
      ...vehicle,
      hiddenAdditionalMaintenance: ["pmiInspection", "brakeTest"],
    },
    { asOfDate: "2026-08-18" }
  );

  assert.deepEqual(alerts, []);
});

test("automatic VOR alert has a stable id and unresolved reasons", () => {
  const alert = buildMaintenanceVorAlert(vehicle, {
    startedDate: "2026-08-24",
    reasons: { pmi: { type: "pmi", resolvedAt: "" } },
  });
  assert.equal(alert.id, "maintenance-vor-vehicle-1-2026-08-24");
  assert.deepEqual(alert.maintenanceTypeIds, ["pmi"]);
  assert.equal(
    buildMaintenanceVorAlert(vehicle, {
      startedDate: "2026-08-24",
      reasons: { mot: { type: "mot", resolvedAt: "" } },
    }),
    null
  );
});

test("a booked appointment outside its legal ISO week creates an immediate warning", () => {
  const alert = buildMaintenanceScheduleExceptionAlert({
    id: "booking-1",
    companyId: "company-1",
    vehicleId: "vehicle-1",
    vehicleLabel: "U-Crane Lorry 01 (AY65 FNV)",
    status: "Booked",
    appointmentDateISO: "2026-08-13",
    scheduleExceptionReason: "Testing outside-week move",
    items: [
      { maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-05", legalDueIsoWeek: "2026-W32" },
      { maintenanceTypeId: "brake_test", legalDueDateISO: "2026-08-05", legalDueIsoWeek: "2026-W32" },
    ],
  });

  assert.equal(alert.alertType, "schedule_exception");
  assert.equal(alert.dueIsoWeek, "2026-W32");
  assert.equal(alert.appointmentDateISO, "2026-08-13");
  assert.match(alert.message, /legal deadline remains 2026-W32/);
});

test("same-week and completed appointments do not create schedule-exception warnings", () => {
  const booking = {
    id: "booking-1",
    vehicleId: "vehicle-1",
    status: "Booked",
    appointmentDateISO: "2026-08-06",
    items: [{ maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-05", legalDueIsoWeek: "2026-W32" }],
  };
  assert.equal(buildMaintenanceScheduleExceptionAlert(booking), null);
  assert.equal(
    buildMaintenanceScheduleExceptionAlert({ ...booking, status: "Completed", appointmentDateISO: "2026-08-13" }),
    null
  );
});

test("an appointment before its due date does not warn when it is in an earlier ISO week", () => {
  assert.equal(buildMaintenanceScheduleExceptionAlert({
    id: "booking-early",
    vehicleId: "vehicle-1",
    status: "Booked",
    appointmentDateISO: "2026-07-31",
    items: [{
      maintenanceTypeId: "pmi",
      legalDueDateISO: "2026-08-07",
      legalDueIsoWeek: "2026-W32",
    }],
  }), null);
});

test("recipient configuration is normalized and deduplicated", () => {
  assert.deepEqual(normalizeAlertRecipients([" Ops@Example.com ", "bad"], "ops@example.com"), ["ops@example.com"]);
});
