import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnnualMaintenanceForecast,
  reconcileAnnualMaintenanceForecast,
} from "../src/app/utils/maintenanceForecast.js";
import { buildAdditionalMaintenanceCompletionPatch } from "../src/app/utils/additionalMaintenanceCompletion.js";
import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  RECURRING_MAINTENANCE_WORKFLOWS,
} from "../src/app/utils/maintenanceSchema.js";

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

test("every registry type forecasts only with an authoritative MOT date or positive frequency", () => {
  RECURRING_MAINTENANCE_WORKFLOWS.forEach((workflow, index) => {
    const configured = {
      id: `registry-${workflow.maintenanceTypeId}`,
      companyId: "company-1",
      motNotApplicable: workflow.maintenanceTypeId !== "mot",
      serviceNotApplicable: workflow.maintenanceTypeId !== "service",
      [workflow.nextField]: `2026-11-${String(index + 1).padStart(2, "0")}`,
      [workflow.frequencyField]: 6,
    };
    const records = buildAnnualMaintenanceForecast({
      vehicle: configured,
      year: 2026,
      includedTypeIds: [workflow.maintenanceTypeId],
    });
    assert.equal(records.length, 1, workflow.maintenanceTypeId);
    assert.equal(records[0].items[0].maintenanceTypeId, workflow.maintenanceTypeId);
    assert.equal(records[0].status, "requested");

    if (workflow.maintenanceTypeId !== "mot") {
      const withoutFrequency = { ...configured, [workflow.frequencyField]: "" };
      assert.equal(buildAnnualMaintenanceForecast({
        vehicle: withoutFrequency,
        year: 2026,
        includedTypeIds: [workflow.maintenanceTypeId],
      }).length, 0, `${workflow.maintenanceTypeId} without frequency`);
    }
  });
});

test("forecast creates one unarranged due item for every configured recurring type", () => {
  const records = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  assert.equal(records.length, 4);
  assert.ok(records.every((record) => record.status === "requested"));
  assert.ok(records.every((record) => record.forecastYear === 2026));
  assert.ok(records.every((record) => record.origin.source === "automatic_schedule"));
  assert.ok(records.every((record) => record.schedule.appointmentDateISO === ""));
  assert.ok(records.every((record) => record.schedule.bookingDates.length === 0));
  assert.ok(records.some((record) => record.items.some((item) => item.maintenanceTypeId === "mot")));
  assert.ok(records.some((record) => record.items.some((item) => item.maintenanceTypeId === "service")));
  assert.equal(
    records.filter((record) => record.items.some((item) => item.maintenanceTypeId === "pmi")).length,
    1
  );
  assert.ok(records.some((record) => record.items.some((item) => item.maintenanceTypeId === "tacho_inspection")));
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
  assert.equal(returnInspection.sourceDueDateISO, "2026-08-18");
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

test("same-week PMI and brake requirements become one due item preserving both dates", () => {
  const records = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  const combined = records.find((record) =>
    record.items.some((item) => item.legalDueDateISO === "2026-01-05")
  );
  assert.deepEqual(
    combined.items.map((item) => item.maintenanceTypeId).sort(),
    ["brake_test", "pmi"]
  );
  assert.equal(combined.sourceDueDateISO, "2026-01-05");
  assert.equal(combined.schedule.appointmentDateISO, "");
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

test("returning from VOR reactivates a system-cancelled appointment when its date is unchanged", () => {
  const forecast = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  const due = forecast[0];
  const cancelled = {
    ...due,
    id: due.id,
    status: "Cancelled",
    bookingDates: [due.sourceDueDateISO],
    appointmentDateISO: due.sourceDueDateISO,
    cancellationSource: "vehicle_vor_transition",
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast: [due],
    existingBookings: [cancelled],
    vehicleId: vehicle.id,
    year: 2026,
    restoreVorCancelledAppointments: true,
  });

  assert.equal(result.reactivate.length, 1);
  assert.equal(result.reactivate[0].source.id, cancelled.id);
  assert.equal(result.restore.length, 0);
  assert.equal(result.create.length, 0);
});

test("returning from VOR creates a replacement appointment when the due date changed", () => {
  const forecast = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  const due = forecast[0];
  const cancelled = {
    ...due,
    id: due.id,
    status: "Cancelled",
    bookingDates: ["2026-01-01"],
    appointmentDateISO: "2026-01-01",
    cancellationSource: "vehicle_vor_transition",
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast: [due],
    existingBookings: [cancelled],
    vehicleId: vehicle.id,
    year: 2026,
    restoreVorCancelledAppointments: true,
  });

  assert.equal(result.reactivate.length, 0);
  assert.equal(result.restore.length, 1);
  assert.equal(result.restore[0].appointmentDateISO, due.sourceDueDateISO);
  assert.notEqual(result.restore[0].record.id, cancelled.id);
  assert.equal(result.create.length, 0);
});

test("ordinary user cancellations remain terminal during forecast reconciliation", () => {
  const forecast = buildAnnualMaintenanceForecast({ vehicle, year: 2026 });
  const due = forecast[0];
  const cancelled = {
    ...due,
    id: due.id,
    status: "Cancelled",
    bookingDates: [due.sourceDueDateISO],
    appointmentDateISO: due.sourceDueDateISO,
    cancellationSource: "user_cancellation",
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast: [due],
    existingBookings: [cancelled],
    vehicleId: vehicle.id,
    year: 2026,
    restoreVorCancelledAppointments: true,
  });

  assert.equal(result.reactivate.length, 0);
  assert.equal(result.restore.length, 0);
  assert.equal(result.blocked.length, 1);
});

test("existing confirmed bookings are protected after a schedule change", () => {
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
  assert.deepEqual(result.supersede.map((record) => record.id), []);
  assert.ok(result.preserve.some((record) => record.id === "stale-auto"));
});

test("only obsolete untouched automatic requested items are superseded", () => {
  const stale = {
    id: "stale-requested",
    companyId: "company-1",
    vehicleId: vehicle.id,
    type: "INSPECTION",
    maintenanceTypeIds: ["pmi"],
    status: "Requested",
    sourceDueDateISO: "2026-11-10",
    requirementKey: "old-requested-cycle",
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
  assert.deepEqual(result.supersede.map((record) => record.id), ["stale-requested"]);
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
    inspectionAppointments.map((record) => record.sourceDueDateISO),
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

  assert.deepEqual(result.blocked.map((record) => record.status).sort(), ["Archived", "Cancelled", "Completed"]);
  assert.ok(result.blocked.some((record) => record.id === "archived-cycle"));
  assert.ok(!result.create.some((record) => record.requirementKey === forecast[2].requirementKey));
  assert.ok(!result.supersede.some((record) => record.id === manual.id));
  assert.ok(!result.supersede.some((record) => record.id === moved.id));
});

test("archived automatic cycles get one deterministic active replacement without changing the archive", () => {
  const desired = buildAnnualMaintenanceForecast({ vehicle, year: 2026 })[0];
  const archived = {
    ...desired,
    id: desired.id,
    status: "Archived",
    archiveReason: "Schedule changed; replaced by canonical forecast.",
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

test("trusted company context makes all seven modern legacy-vehicle bookings exact matches", () => {
  const cases = [
    ["trailer-1-service", "service", "2027-06-28"],
    ["trailer-1-mot", "mot", "2027-06-30"],
    ["lifting-van-mot", "mot", "2029-06-29"],
    ["trailer-2-service", "service", "2027-01-30"],
    ["trailer-2-mot", "mot", "2027-01-31"],
    ["low-loader-1-service", "service", "2027-06-29"],
    ["low-loader-1-mot", "mot", "2027-06-30"],
  ];

  cases.forEach(([id, type, dueDate]) => {
    const sourceVehicle = {
      id,
      [`next${type === "mot" ? "MOT" : "Service"}`]: dueDate,
      ...(type === "service" ? { serviceFreq: 52 } : {}),
      motNotApplicable: type !== "mot",
      serviceNotApplicable: type !== "service",
    };
    const forecast = buildAnnualMaintenanceForecast({
      vehicle: sourceVehicle,
      year: Number(dueDate.slice(0, 4)),
      companyId: "bickers-action",
      includedTypeIds: [type],
    });
    assert.equal(forecast.length, 1, id);
    assert.match(forecast[0].requirementKey, /\|bickers-action\|/);

    const existing = {
      ...forecast[0],
      id: `existing-${id}`,
      status: "Booked",
      bookingDates: [dueDate],
      appointmentDateISO: dueDate,
    };
    const result = reconcileAnnualMaintenanceForecast({
      forecast,
      existingBookings: [existing],
      vehicleId: id,
      year: Number(dueDate.slice(0, 4)),
      includedTypeIds: [type],
    });
    assert.equal(result.create.length, 0, id);
    assert.deepEqual(result.preserve.map((record) => record.id), [existing.id], id);
  });
});

test("one Dax-style confirmed legacy MOT in the legal ISO week suppresses a new due item", () => {
  const dax = {
    id: "dax-vehicle",
    companyId: "bickers-action",
    name: "Dax",
    registration: "EO74 AOJ",
    nextMOT: "2027-12-16",
    serviceNotApplicable: true,
  };
  const forecast = buildAnnualMaintenanceForecast({ vehicle: dax, year: 2027, includedTypeIds: ["mot"] });
  const legacy = {
    id: "legacy-dax-mot",
    companyId: "bickers-action",
    vehicleId: dax.id,
    vehicleLabel: "Completely different stored label",
    title: "Unrelated title text",
    type: "MOT",
    status: "Booked",
    appointmentDate: "2027-12-17T00:00:00Z",
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [legacy],
    vehicleId: dax.id,
    year: 2027,
    includedTypeIds: ["mot"],
  });
  assert.equal(result.create.length, 0);
  assert.deepEqual(result.preserve.map((record) => record.id), [legacy.id]);
  assert.deepEqual(result.ambiguous, []);
});

test("legacy fallback rejects different weeks, cross-company records and matching names on another vehicle", () => {
  const sourceVehicle = {
    id: "target-vehicle",
    companyId: "company-1",
    name: "Shared Name",
    registration: "SAME REG",
    nextMOT: "2027-12-16",
  };
  const forecast = buildAnnualMaintenanceForecast({ vehicle: sourceVehicle, year: 2027, includedTypeIds: ["mot"] });
  const base = {
    type: "MOT",
    status: "Booked",
    appointmentDateISO: "2027-12-17",
    name: sourceVehicle.name,
    registration: sourceVehicle.registration,
  };
  const cases = [
    { ...base, id: "different-week", companyId: "company-1", vehicleId: sourceVehicle.id, appointmentDateISO: "2027-12-23" },
    { ...base, id: "cross-company", companyId: "company-2", vehicleId: sourceVehicle.id },
    { ...base, id: "same-name-other-vehicle", companyId: "company-1", vehicleId: "other-vehicle" },
  ];
  cases.forEach((candidate) => {
    const result = reconcileAnnualMaintenanceForecast({
      forecast,
      existingBookings: [candidate],
      vehicleId: sourceVehicle.id,
      year: 2027,
      includedTypeIds: ["mot"],
    });
    assert.equal(result.create.length, 1, candidate.id);
  });
});

test("ambiguous Dax-style legacy matches are reported and do not auto-match", () => {
  const sourceVehicle = { id: "ambiguous-vehicle", companyId: "company-1", nextMOT: "2027-12-16" };
  const forecast = buildAnnualMaintenanceForecast({ vehicle: sourceVehicle, year: 2027, includedTypeIds: ["mot"] });
  const candidates = ["legacy-a", "legacy-b"].map((id) => ({
    id,
    companyId: "company-1",
    vehicleId: sourceVehicle.id,
    type: "MOT",
    status: "Booked",
    appointmentDateISO: "2027-12-17",
  }));
  const result = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: candidates,
    vehicleId: sourceVehicle.id,
    year: 2027,
    includedTypeIds: ["mot"],
  });
  assert.equal(result.create.length, 0);
  assert.deepEqual(result.ambiguous.map((record) => record.id).sort(), ["legacy-a", "legacy-b"]);
  assert.deepEqual(result.preserve.map((record) => record.id).sort(), ["legacy-a", "legacy-b"]);
});

test("active legal-date matches outrank exact-key automatic archives for all nine copied-data overlaps", () => {
  const cases = [
    { name: "U-Crane Trailer 3 Service", id: "u-crane-trailer-3", type: "service", due: "2027-08-09" },
    { name: "U-Crane Trailer 3 MOT", id: "u-crane-trailer-3", type: "mot", due: "2027-08-11" },
    { name: "Low Loader Trailer 2 combined PMI/Brake Test", id: "low-loader-trailer-2", type: "combined", pmiDue: "2026-10-12", brakeDue: "2026-10-14" },
    { name: "Low Loader Trailer 2 Service", id: "low-loader-trailer-2", type: "service", due: "2027-02-15" },
    { name: "Low Loader Trailer 2 MOT", id: "low-loader-trailer-2", type: "mot", due: "2027-02-17" },
    { name: "U-Crane Trailer 1 combined PMI/Brake Test", id: "u-crane-trailer-1", type: "combined", pmiDue: "2026-09-07", brakeDue: "2026-09-09", moved: true },
    { name: "Mini Cooper S MOT", id: "mini-cooper-s", type: "mot", due: "2027-05-19" },
    { name: "U-Crane Trailer 2 combined PMI/Brake Test", id: "u-crane-trailer-2", type: "combined", pmiDue: "2026-11-02", brakeDue: "2026-11-04" },
    { name: "Low Loader Trailer 1 combined PMI/Brake Test", id: "low-loader-trailer-1", type: "combined", pmiDue: "2026-12-07", brakeDue: "2026-12-09" },
  ];

  cases.forEach((item) => {
    const combined = item.type === "combined";
    const includedTypeIds = combined ? ["pmi", "brake_test"] : [item.type];
    const vehicleForCase = {
      id: item.id,
      companyId: "bickers-action",
      name: item.name,
      motNotApplicable: item.type !== "mot",
      serviceNotApplicable: item.type !== "service",
      ...(item.type === "mot" ? { nextMOT: item.due } : {}),
      ...(item.type === "service" ? { nextService: item.due, serviceFreq: 52 } : {}),
      ...(combined ? {
        nextPMI: item.pmiDue,
        pmiFreq: 8,
        nextBrakeTest: item.brakeDue,
        brakeTestFreq: 8,
      } : {}),
    };
    const due = item.due || item.pmiDue;
    const forecast = buildAnnualMaintenanceForecast({
      vehicle: vehicleForCase,
      year: Number(due.slice(0, 4)),
      includedTypeIds,
    });
    assert.equal(forecast.length, 1, item.name);
    const desired = forecast[0];
    const archived = {
      ...desired,
      id: desired.id,
      status: "Archived",
      archiveReason: "Future schedule reset; replaced by canonical forecast.",
      origin: { source: "automatic_schedule", sourceId: item.id },
    };
    const archivedBefore = structuredClone(archived);
    const legacyRequirementKey = desired.requirementKey.replace(
      "|bickers-action|",
      "|legacy|"
    );
    const active = {
      ...desired,
      id: `active-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      status: "Booked",
      requirementKey: legacyRequirementKey,
      sourceDueKey: legacyRequirementKey,
      bookingDates: [combined ? item.brakeDue : item.due],
      appointmentDateISO: combined ? item.brakeDue : item.due,
      scheduleManuallyAdjusted: item.moved === true,
      origin: { source: "vehicle_maintenance_schedule", sourceId: item.id },
    };
    const result = reconcileAnnualMaintenanceForecast({
      forecast,
      existingBookings: [archived, active],
      vehicleId: item.id,
      year: Number(due.slice(0, 4)),
      includedTypeIds,
    });

    assert.equal(result.create.length, 0, item.name);
    assert.deepEqual(result.preserve.map((record) => record.id), [active.id], item.name);
    assert.deepEqual(archived, archivedBefore, `${item.name} archive remains unchanged`);
  });
});

test("active legal matching stays company/date scoped and reports ambiguity without proposing a write", () => {
  const scopedVehicle = {
    id: "priority-scope-vehicle",
    companyId: "bickers-action",
    nextService: "2027-03-08",
    serviceFreq: 52,
    motNotApplicable: true,
  };
  const forecast = buildAnnualMaintenanceForecast({
    vehicle: scopedVehicle,
    year: 2027,
    includedTypeIds: ["service"],
  });
  const desired = forecast[0];
  const archived = {
    ...desired,
    status: "Archived",
    archiveReason: "Future schedule reset; automatic obsolete record.",
    origin: { source: "automatic_schedule", sourceId: scopedVehicle.id },
  };
  const activeFor = (id, overrides = {}) => ({
    ...desired,
    id,
    status: "Booked",
    requirementKey: `maintenance-requirement-v1|legacy|${scopedVehicle.id}|service@2027-03-08`,
    sourceDueKey: `maintenance-requirement-v1|legacy|${scopedVehicle.id}|service@2027-03-08`,
    bookingDates: ["2027-03-15"],
    appointmentDateISO: "2027-03-15",
    ...overrides,
  });

  const wrongCompany = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [archived, activeFor("other-company", { companyId: "another-company" })],
    vehicleId: scopedVehicle.id,
    year: 2027,
    includedTypeIds: ["service"],
  });
  assert.equal(wrongCompany.create.length, 1);

  const laterCycle = activeFor("later-cycle", {
    items: desired.items.map((entry) => ({ ...entry, legalDueDateISO: "2027-04-05", legalDueIsoWeek: "2027-W14" })),
    sourceDueDateISO: "2027-04-05",
  });
  const wrongDate = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [archived, laterCycle],
    vehicleId: scopedVehicle.id,
    year: 2027,
    includedTypeIds: ["service"],
  });
  assert.equal(wrongDate.create.length, 1);

  const candidates = [activeFor("active-a"), activeFor("active-b", {
    requirementKey: `maintenance-requirement-v1|legacy|${scopedVehicle.id}|service@2027-03-08|second`,
    sourceDueKey: `maintenance-requirement-v1|legacy|${scopedVehicle.id}|service@2027-03-08|second`,
  })];
  const ambiguous = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [archived, ...candidates],
    vehicleId: scopedVehicle.id,
    year: 2027,
    includedTypeIds: ["service"],
  });
  assert.equal(ambiguous.create.length, 0);
  assert.deepEqual(ambiguous.ambiguous.map((record) => record.id).sort(), ["active-a", "active-b"]);
});

test("explicit legal date matches despite a different workshop date and preserves a manual move", () => {
  const sourceVehicle = { id: "moved-service", companyId: "company-1", nextService: "2026-10-01", serviceFreq: 52 };
  const forecast = buildAnnualMaintenanceForecast({ vehicle: sourceVehicle, year: 2026, includedTypeIds: ["service"] });
  const moved = {
    id: "moved-booking",
    companyId: "company-1",
    vehicleId: sourceVehicle.id,
    type: "SERVICE",
    maintenanceTypeIds: ["service"],
    status: "Booked",
    requirementKey: "maintenance-requirement-v1|company-1|moved-service|service@2026-09-30",
    sourceDueDateISO: "2026-10-01",
    sourceDueIsoWeek: "2026-W40",
    appointmentDateISO: "2026-10-15",
    bookingDates: ["2026-10-15"],
    scheduleManuallyAdjusted: true,
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [moved],
    vehicleId: sourceVehicle.id,
    year: 2026,
    includedTypeIds: ["service"],
  });
  assert.equal(result.create.length, 0);
  assert.deepEqual(result.preserve.map((record) => record.id), [moved.id]);
});

test("PMI-only does not satisfy a combined PMI and brake legal week", () => {
  const hgv = {
    id: "combined-hgv",
    companyId: "company-1",
    nextPMI: "2026-09-28",
    pmiFreq: 8,
    nextBrakeTest: "2026-09-30",
    brakeTestFreq: 8,
    motNotApplicable: true,
    serviceNotApplicable: true,
  };
  const forecast = buildAnnualMaintenanceForecast({ vehicle: hgv, year: 2026, includedTypeIds: ["pmi", "brake_test"] });
  const pmiOnly = {
    id: "pmi-only-existing",
    companyId: "company-1",
    vehicleId: hgv.id,
    type: "INSPECTION",
    maintenanceTypeIds: ["pmi"],
    status: "Booked",
    sourceDueDateISO: "2026-09-28",
    appointmentDateISO: "2026-09-29",
  };
  const result = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: [pmiOnly],
    vehicleId: hgv.id,
    year: 2026,
    includedTypeIds: ["pmi", "brake_test"],
  });
  assert.equal(result.create.length, 1);
  assert.deepEqual(result.create[0].items.map((item) => item.maintenanceTypeId).sort(), ["brake_test", "pmi"]);
});

test("automatic obsolete archives allow replacements while manual archives remain protected", () => {
  [
    ["gmc-tacho", "tacho_inspection", "2026-11-09"],
    ["mobile-workshop-loler", "loler", "2026-09-16"],
  ].forEach(([vehicleId, type, date]) => {
    const sourceVehicle = {
      id: vehicleId,
      companyId: "company-1",
      nextMOT: "",
      motNotApplicable: true,
      serviceNotApplicable: true,
      [type === "loler" ? "nextLoler" : "nextTacho"]: date,
      [type === "loler" ? "lolerFreq" : "tachoFreq"]: 52,
    };
    const forecast = buildAnnualMaintenanceForecast({ vehicle: sourceVehicle, year: 2026, includedTypeIds: [type] });
    const archived = {
      ...forecast[0],
      id: forecast[0].id,
      status: "Archived",
      origin: { source: "automatic_schedule", sourceId: vehicleId },
      archiveReason: "Future schedule reset; automatic non-core appointment removed from the active diary.",
    };
    const result = reconcileAnnualMaintenanceForecast({
      forecast,
      existingBookings: [archived],
      vehicleId,
      year: 2026,
      includedTypeIds: [type],
    });
    assert.equal(result.create.length, 1, type);
    assert.notEqual(result.create[0].id, archived.id, type);
    assert.deepEqual(result.preserve.map((record) => record.id), [archived.id], type);
  });

  const desired = buildAnnualMaintenanceForecast({ vehicle, year: 2026 })[0];
  const manualArchive = {
    ...desired,
    id: "manual-archive",
    status: "Archived",
    origin: { source: "manual", sourceId: "user-1" },
  };
  const protectedResult = reconcileAnnualMaintenanceForecast({
    forecast: [desired],
    existingBookings: [manualArchive],
    vehicleId: vehicle.id,
    year: 2026,
  });
  assert.equal(protectedResult.create.length, 0);
  assert.deepEqual(protectedResult.blocked.map((record) => record.id), [manualArchive.id]);
});
