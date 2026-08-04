import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnnualMaintenanceForecast,
  reconcileAnnualMaintenanceForecast,
} from "../src/app/utils/maintenanceForecast.js";
import { buildAdditionalMaintenanceCompletionPatch } from "../src/app/utils/additionalMaintenanceCompletion.js";
import { ADDITIONAL_MAINTENANCE_WORKFLOWS } from "../src/app/utils/maintenanceSchema.js";

const vehicle = {
  id: "vehicle-1",
  companyId: "company-1",
  name: "Test HGV",
  registration: "AB12 CDE",
  nextMOT: "2026-09-30",
  nextService: "2026-10-01",
  serviceFreq: 52,
  nextPMI: "2026-01-05",
  pmiFreq: 8,
  nextBrakeTest: "2026-01-07",
  brakeTestFreq: 8,
  nextTacho: "2026-02-02",
  tachoFreq: 26,
  hiddenAdditionalMaintenance: ["tailLift", "loler", "tachoDownload"],
};

test("annual forecast creates MOT, service and only the next inspection appointment", () => {
  const records = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  assert.equal(records.length, 3);
  assert.ok(records.every((record) => record.status === "booked"));
  assert.ok(records.every((record) => record.forecastYear === 2026));
  assert.ok(records.every((record) => record.origin.source === "automatic_schedule"));
  assert.ok(records.every((record) => record.schedule.appointmentDateISO.startsWith("2026-")));
  assert.ok(records.some((record) => record.items.some((item) => item.maintenanceTypeId === "mot")));
  assert.ok(records.some((record) => record.items.some((item) => item.maintenanceTypeId === "service")));
  assert.equal(
    records.filter((record) => record.items.some((item) => item.maintenanceTypeId === "pmi")).length,
    1
  );
  assert.ok(!records.some((record) => record.items.some((item) => item.maintenanceTypeId === "tacho_inspection")));
  assert.ok(!records.some((record) => record.items.some((item) => item.maintenanceTypeId === "tail_lift")));
});

test("VOR suppresses old PMI and brake plans until a fresh return inspection is scheduled", () => {
  const vorVehicle = {
    ...vehicle,
    operationalStatus: "VOR",
    fleetStatus: "VOR",
    vehicleStatus: "VOR",
  };
  const suppressed = buildAnnualMaintenanceForecast({ vehicle: vorVehicle, year: 2026 });
  assert.ok(
    !suppressed.some((record) =>
      record.items.some((item) => ["pmi", "brake_test"].includes(item.maintenanceTypeId))
    )
  );
  assert.ok(suppressed.some((record) => record.items.some((item) => item.maintenanceTypeId === "mot")));
  assert.ok(suppressed.some((record) => record.items.some((item) => item.maintenanceTypeId === "service")));

  const returnVehicle = {
    ...vorVehicle,
    nextPMI: "2026-08-18",
    nextBrakeTest: "2026-08-18",
    pendingReturnInspection: {
      status: "inspection_required",
      inspectionDate: "2026-08-18",
    },
  };
  const returnForecast = buildAnnualMaintenanceForecast({ vehicle: returnVehicle, year: 2026 });
  const returnInspection = returnForecast.find((record) =>
    record.items.some((item) => item.maintenanceTypeId === "pmi")
  );
  assert.equal(returnInspection.schedule.appointmentDateISO, "2026-08-18");
  assert.deepEqual(
    returnInspection.items.map((item) => item.maintenanceTypeId).sort(),
    ["brake_test", "pmi"]
  );
});

test("inspection-scoped forecast excludes MOT and service without superseding them", () => {
  const forecast = buildAnnualMaintenanceForecast({
    vehicle,
    year: 2026,
    includedTypeIds: ["pmi", "brake_test"],
  });
  assert.ok(forecast.length > 0);
  assert.ok(forecast.every((record) =>
    record.items.every((item) => ["pmi", "brake_test"].includes(item.maintenanceTypeId))
  ));

  const motBooking = {
    id: "preserved-mot",
    vehicleId: vehicle.id,
    type: "MOT",
    maintenanceTypeIds: ["mot"],
    status: "Booked",
    bookingDates: ["2026-09-30"],
    appointmentDateISO: "2026-09-30",
    requirementKey: "legacy-mot-key",
    origin: { source: "automatic_schedule" },
    forecastYear: 2026,
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [motBooking],
    vehicleId: vehicle.id,
    year: 2026,
    todayISO: "2026-08-03",
    includedTypeIds: ["pmi", "brake_test"],
  });
  assert.ok(!result.supersede.some((record) => record.id === motBooking.id));
});

test("a PMI-only vehicle still gets one inspection booking type", () => {
  const records = buildAnnualMaintenanceForecast({
    vehicle: {
      id: "pmi-only",
      companyId: "company-1",
      nextPMI: "2026-09-14",
      pmiFreq: 8,
      motNotApplicable: true,
      serviceNotApplicable: true,
      hiddenAdditionalMaintenance: ["brakeTest"],
    },
    year: 2026,
    includedTypeIds: ["pmi", "brake_test"],
  });
  assert.ok(records.length > 0);
  assert.ok(records.every((record) => record.type === "INSPECTION"));
  assert.ok(records.every((record) =>
    record.items.length === 1 && record.items[0].maintenanceTypeId === "pmi"
  ));
});

test("same-week PMI and brake requirements become one appointment on the earliest date", () => {
  const records = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  const combined = records.find((record) =>
    record.items.some((item) => item.legalDueDateISO === "2026-01-05")
  );
  assert.deepEqual(
    combined.items.map((item) => item.maintenanceTypeId).sort(),
    ["brake_test", "pmi"]
  );
  assert.equal(combined.schedule.appointmentDateISO, "2026-01-05");
  assert.deepEqual(
    combined.items.map((item) => item.legalDueDateISO),
    ["2026-01-05", "2026-01-07"]
  );
});

test("forecast ids are deterministic and rerunning reconciliation creates nothing", () => {
  const first = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  const second = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  assert.deepEqual(first.map((record) => record.id), second.map((record) => record.id));
  const existingBookings = first.map((record) => ({
    ...record,
    id: record.id,
    status: "Booked",
    bookingDates: record.schedule.bookingDates,
    appointmentDateISO: record.schedule.appointmentDateISO,
  }));
  const result = reconcileAnnualMaintenanceForecast({
    forecast: second,
    existingBookings,
    vehicleId: vehicle.id,
    year: 2026,
  });
  assert.equal(result.create.length, 0);
  assert.equal(result.preserve.length, first.length);
});

test("terminal cycles block recreation and manually moved automatic records are preserved", () => {
  const forecast = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  const completed = forecast[0];
  const staleManual = {
    ...forecast[1],
    id: "manually-moved",
    requirementKey: "old-cycle",
    status: "Booked",
    bookingDates: ["2026-12-01"],
    appointmentDateISO: "2026-12-01",
    scheduleManuallyAdjusted: true,
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [
      {
        ...completed,
        id: completed.id,
        status: "Completed",
        bookingDates: completed.schedule.bookingDates,
        appointmentDateISO: completed.schedule.appointmentDateISO,
      },
      staleManual,
    ],
    vehicleId: vehicle.id,
    year: 2026,
    todayISO: "2026-01-01",
  });
  assert.ok(result.blocked.some((record) => record.id === completed.id));
  assert.ok(!result.supersede.some((record) => record.id === staleManual.id));
});

test("untouched future automatic appointments are superseded after a schedule change", () => {
  const stale = {
    id: "stale-auto",
    companyId: "company-1",
    vehicleId: vehicle.id,
    type: "INSPECTION",
    maintenanceTypeIds: ["pmi"],
    status: "Booked",
    bookingDates: ["2026-11-10"],
    appointmentDateISO: "2026-11-10",
    sourceDueDateISO: "2026-11-10",
    requirementKey: "old-cycle",
    origin: { source: "automatic_schedule", sourceId: vehicle.id },
    forecastYear: 2026,
    scheduleManuallyAdjusted: false,
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast: buildAnnualMaintenanceForecast({ vehicle, year: 2026 }),
    existingBookings: [stale],
    vehicleId: vehicle.id,
    year: 2026,
    todayISO: "2026-08-01",
  });
  assert.deepEqual(result.supersede.map((record) => record.id), ["stale-auto"]);
});

test("HGV completion produces only the next combined PMI/brake appointment", () => {
  const workflows = ADDITIONAL_MAINTENANCE_WORKFLOWS.filter((workflow) =>
    ["pmi", "brake_test"].includes(workflow.maintenanceTypeId)
  );
  const completedHgv = {
    id: "hgv-completed-2026-08-03",
    companyId: "company-1",
    category: "HGV",
    name: "Completed HGV",
    registration: "HG03 AUG",
    pmiFreq: 8,
    brakeTestFreq: 8,
    motNotApplicable: true,
    serviceNotApplicable: true,
    hiddenAdditionalMaintenance: ["tachoInspection", "tachoDownload", "tailLift", "loler"],
  };
  const completionPatch = buildAdditionalMaintenanceCompletionPatch({
    vehicle: completedHgv,
    workflows,
    completedDate: "2026-08-03",
    completedAt: "2026-08-03T12:00:00.000Z",
    bookingId: "completed-combined-inspection",
  });
  const forecastVehicle = { ...completedHgv, ...completionPatch };
  const forecast = [
    ...buildAnnualMaintenanceForecast({ vehicle: forecastVehicle, year: 2026 }),
    ...buildAnnualMaintenanceForecast({ vehicle: forecastVehicle, year: 2027 }),
  ];
  const inspectionAppointments = forecast
    .filter((record) => record.items.some((item) => item.maintenanceTypeId === "pmi"));

  assert.equal(completionPatch.nextPMI, "2026-09-28");
  assert.equal(completionPatch.nextBrakeTest, "2026-09-28");
  assert.deepEqual(
    inspectionAppointments.map((record) => record.schedule.appointmentDateISO),
    ["2026-09-28"]
  );
  assert.deepEqual(
    inspectionAppointments[0].items.map((item) => item.maintenanceTypeId).sort(),
    ["brake_test", "pmi"]
  );

  const persisted = forecast.map((record) => ({
    ...record,
    status: "Booked",
    bookingDates: record.schedule.bookingDates,
    appointmentDateISO: record.schedule.appointmentDateISO,
  }));
  const repeated = [2026, 2027].map((year) =>
    reconcileAnnualMaintenanceForecast({
      forecast: buildAnnualMaintenanceForecast({ vehicle: forecastVehicle, year }),
      existingBookings: persisted,
      vehicleId: forecastVehicle.id,
      year,
      todayISO: "2026-08-03",
    })
  );
  assert.ok(repeated.every((result) => result.create.length === 0));
  assert.ok(repeated.every((result) => result.supersede.length === 0));
});

test("forecast reconciliation preserves terminal, manual, and manually moved records", () => {
  const forecast = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  const terminal = ["Completed", "Cancelled", "Archived"].map((status, index) => ({
    ...forecast[index],
    id: `${status.toLowerCase()}-cycle`,
    status,
    bookingDates: forecast[index].schedule.bookingDates,
    appointmentDateISO: forecast[index].schedule.appointmentDateISO,
  }));
  const manual = {
    id: "manual-appointment",
    vehicleId: vehicle.id,
    status: "Booked",
    requirementKey: "manual-cycle",
    appointmentDateISO: "2026-12-10",
    bookingDates: ["2026-12-10"],
    origin: { source: "manual", sourceId: "user-1" },
  };
  const moved = {
    ...forecast[3],
    id: "manually-moved-automatic",
    requirementKey: "moved-old-cycle",
    status: "Booked",
    appointmentDateISO: "2026-12-11",
    bookingDates: ["2026-12-11"],
    scheduleManuallyAdjusted: true,
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [...terminal, manual, moved],
    vehicleId: vehicle.id,
    year: 2026,
    todayISO: "2026-08-03",
  });

  assert.deepEqual(result.blocked.map((record) => record.status).sort(), ["Cancelled", "Completed"]);
  assert.ok(result.preserve.some((record) => record.id === "archived-cycle"));
  assert.ok(result.create.some((record) =>
    record.requirementKey === forecast[2].requirementKey && record.id !== "archived-cycle"
  ));
  assert.ok(!result.supersede.some((record) => record.id === manual.id));
  assert.ok(!result.supersede.some((record) => record.id === moved.id));
});

test("archived automatic cycles get one deterministic active replacement without changing the archive", () => {
  const desired = buildAnnualMaintenanceForecast({ vehicle, year: 2026 })[0];
  const archived = {
    ...desired,
    id: desired.id,
    status: "Archived",
    bookingDates: desired.schedule.bookingDates,
    appointmentDateISO: desired.schedule.appointmentDateISO,
  };
  const first = reconcileAnnualMaintenanceForecast({
    forecast: [desired],
    existingBookings: [archived],
    vehicleId: vehicle.id,
    year: 2026,
  });

  assert.equal(first.create.length, 1);
  assert.notEqual(first.create[0].id, archived.id);
  assert.deepEqual(first.preserve.map((record) => record.id), [archived.id]);
  assert.equal(first.supersede.length, 0);

  const replacement = {
    ...first.create[0],
    status: "Booked",
    bookingDates: first.create[0].schedule.bookingDates,
    appointmentDateISO: first.create[0].schedule.appointmentDateISO,
  };
  const repeated = reconcileAnnualMaintenanceForecast({
    forecast: [desired],
    existingBookings: [archived, replacement],
    vehicleId: vehicle.id,
    year: 2026,
  });
  assert.equal(repeated.create.length, 0);
  assert.deepEqual(repeated.preserve.map((record) => record.id), [replacement.id]);
});
