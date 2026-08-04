import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  isSelectableVehicleOperatingStatus,
} from "../src/app/utils/maintenanceSchema.js";
import {
  buildAdditionalMaintenanceCompletionPatch,
} from "../src/app/utils/additionalMaintenanceCompletion.js";
import {
  isCompletedMaintenanceBooking,
  reconcileBookingCompletionHistory,
} from "../src/app/utils/inspectionHistory.js";
import {
  appendMaintenanceDocumentToHistory,
  buildMaintenanceDocument,
  removeMaintenanceDocument,
  removeMaintenanceDocumentFromHistory,
} from "../src/app/utils/maintenanceDocuments.js";
import {
  buildMaintenanceHistoryRows,
} from "../src/app/utils/maintenanceHistory.js";
import {
  applyVorCountdownResume,
  returnVehicleFromVor,
  scheduleVehicleReturnInspection,
  startVehicleVorPeriod,
} from "../src/app/utils/vorPeriods.js";
import {
  buildVorTimelineEvents,
  isArchivedTimelineRecord,
  mergeVehicleTimelineEvents,
  partitionVehicleTimelineEvents,
  timelineMaintenanceBookingLabel,
  timelineMaintenanceOriginLabel,
} from "../src/app/utils/vehicleTimelineEvents.js";
import {
  buildCompletedInspectionDates,
  hasActiveInspectionWindow,
  buildLivePlannerEvents,
} from "../src/app/hgv-compliance/hgvPlanner.js";
import {
  buildVehicleDueEvents,
} from "../src/app/utils/maintenanceCalendar.js";
import { buildAnnualMaintenanceForecast } from "../src/app/utils/maintenanceForecast.js";
import {
  buildVorInspectionCancellationPatch,
  getVorInspectionCancellationCandidates,
  isVorAffectedMaintenanceBooking,
} from "../src/app/utils/vorBookingPolicy.js";
import {
  buildHgvComplianceMigrationPatch,
  complianceVorReleaseBlocker,
  complianceVorReturnInspectionBlocker,
  evaluateHgvCompliance,
  getHgvComplianceVorDisplayRows,
  getLatestHgvCompletionDate,
  isHgvComplianceVehicle,
  isOffFleetVehicle,
  syncCanonicalPmiAliases,
} from "../src/app/utils/hgvCompliance.js";

const baseVehicle = {
  id: "vehicle-1",
  companyId: "company-1",
  registration: "RU55 GLC",
  operationalStatus: "Active",
  fleetStatus: "Active",
  vehicleStatus: "Active",
  nextMOT: "2026-09-01",
  nextService: "2026-10-01",
  nextEightWeekInspection: "2026-08-20",
  nextBrakeTest: "2026-08-01",
  nextPMI: "2026-08-01",
  pmiFreq: "8",
};

test("blank operating-status selections cannot resolve a vehicle to Active", () => {
  assert.equal(isSelectableVehicleOperatingStatus(""), false);
  assert.equal(isSelectableVehicleOperatingStatus("Select..."), false);
  assert.equal(isSelectableVehicleOperatingStatus("Active"), true);
  assert.equal(isSelectableVehicleOperatingStatus("VOR"), true);
});

test("booked PMI and brake work cannot be treated as completion history", () => {
  const booked = {
    id: "inspection-booking-1",
    vehicleId: "vehicle-1",
    type: "INSPECTION",
    status: "Booked",
    appointmentDateISO: "2026-08-03",
    completedAtISO: "",
    maintenanceTypeIds: ["pmi", "brake_test"],
  };

  assert.equal(
    isCompletedMaintenanceBooking(booked, { type: "INSPECTION", vehicleId: "vehicle-1" }),
    false
  );
  assert.equal(
    isCompletedMaintenanceBooking(
      { ...booked, status: "Completed", completedAtISO: "2026-08-03" },
      { type: "INSPECTION", vehicleId: "vehicle-1" }
    ),
    true
  );

  const reconciled = reconcileBookingCompletionHistory(
    [
      { bookingId: booked.id, completedDate: "2026-08-03" },
      { bookingId: "completed-1", completedDate: "2026-06-08" },
      { completedDate: "2026-04-13", source: "legacy_vehicle_field" },
    ],
    [booked, { id: "completed-1", status: "Completed", type: "INSPECTION" }]
  );
  assert.deepEqual(reconciled.history, [
    { bookingId: "completed-1", completedDate: "2026-06-08" },
    { completedDate: "2026-04-13", source: "legacy_vehicle_field" },
  ]);
  assert.deepEqual(reconciled.removed, [
    { bookingId: booked.id, completedDate: "2026-08-03" },
  ]);
});

test("VOR cancels only future open PMI and brake bookings", () => {
  const policy = { offRoadDate: "2026-08-02" };
  assert.equal(
    isVorAffectedMaintenanceBooking(
      { type: "INSPECTION", status: "Booked", appointmentDateISO: "2026-08-10" },
      policy
    ),
    true
  );
  assert.equal(
    isVorAffectedMaintenanceBooking(
      { maintenanceTypeIds: ["brake_test"], status: "Planned", bookingDates: ["2026-08-12"] },
      policy
    ),
    true
  );
  assert.equal(
    isVorAffectedMaintenanceBooking(
      { type: "INSPECTION", status: "Completed", appointmentDateISO: "2026-08-10" },
      policy
    ),
    false
  );
  assert.equal(
    isVorAffectedMaintenanceBooking(
      { type: "MOT", status: "Booked", appointmentDateISO: "2026-08-10" },
      policy
    ),
    false
  );
});

test("VOR terminally cancels every invalid future inspection plan but preserves return work", () => {
  const vehicle = {
    id: "vehicle-1",
    operationalStatus: "VOR",
    activeVorRecordId: "vor-1",
    vorHistory: [{ id: "vor-1", status: "open", offRoadDate: "2026-08-02" }],
    pendingReturnInspection: {
      status: "inspection_required",
      inspectionDate: "2026-08-18",
    },
  };
  const bookings = [
    {
      id: "requested-pmi",
      vehicleId: "vehicle-1",
      maintenanceTypeIds: ["pmi"],
      status: "Requested",
      appointmentDateISO: "2026-08-10",
    },
    {
      id: "mixed-in-progress",
      vehicleId: "vehicle-1",
      maintenanceTypeIds: ["brake_test", "repair"],
      status: "In Progress",
      appointmentDateISO: "2026-08-12",
    },
    {
      id: "fresh-return",
      vehicleId: "vehicle-1",
      maintenanceTypeIds: ["pmi", "brake_test"],
      status: "Booked",
      appointmentDateISO: "2026-08-18",
    },
    {
      id: "mot",
      vehicleId: "vehicle-1",
      maintenanceTypeIds: ["mot"],
      status: "Booked",
      appointmentDateISO: "2026-08-20",
    },
  ];
  const candidates = getVorInspectionCancellationCandidates(bookings, { vehicle });
  assert.deepEqual(candidates.map((booking) => booking.id), [
    "requested-pmi",
    "mixed-in-progress",
  ]);
  const patch = buildVorInspectionCancellationPatch(candidates[0], {
    cancelledAt: "2026-08-04T12:00:00.000Z",
    cancelledBy: { uid: "user-1", email: "fleet@example.com" },
    cancellationSource: "vehicle_vor_transition",
    sourceRecordId: "vor-1",
  });
  assert.equal(patch.status, "Cancelled");
  assert.ok(patch.items.every((item) => item.status === "cancelled"));
  assert.equal(patch.cancellationSource, "vehicle_vor_transition");
  assert.equal(patch.cancellationSourceRecordId, "vor-1");
});

test("a completed inspection creates exactly eight active ISO weeks", () => {
  const completedDates = ["2026-02-02"];

  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 5), false);
  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 6), true);
  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 13), true);
  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 14), false);

  const completedAgain = [...completedDates, "2026-09-01"];
  assert.equal(hasActiveInspectionWindow(completedAgain, 2026, 36), true);
  assert.equal(hasActiveInspectionWindow(completedAgain, 2026, 43), true);
  assert.equal(hasActiveInspectionWindow(completedAgain, 2026, 44), false);
});

test("vehicle creation dates remain planned until an explicit completion is recorded", () => {
  const vehicle = {
    id: "vehicle-new",
    category: "HGV",
    registration: "NEW HGV",
    pmiHistory: [
      {
        completedDate: "2026-07-31",
        source: "vehicle_creation",
      },
    ],
    brakeTestHistory: [
      {
        completedDate: "2026-07-31",
        source: "vehicle_creation",
      },
    ],
  };

  assert.equal(getLatestHgvCompletionDate(vehicle, "pmi"), "");
  assert.equal(getLatestHgvCompletionDate(vehicle, "brake_test"), "");
  assert.deepEqual(
    buildCompletedInspectionDates({
      vehicles: [vehicle],
      registrations: ["NEW HGV"],
    }).get("NEWHGV") || [],
    []
  );

  const explicitlyCompleted = {
    ...vehicle,
    pmiHistory: [
      ...vehicle.pmiHistory,
      {
        completedDate: "2026-07-31",
        completedAt: "2026-07-31T12:00:00.000Z",
        source: "dashboard_maintenance_appointment",
      },
    ],
  };
  assert.equal(getLatestHgvCompletionDate(explicitlyCompleted, "pmi"), "2026-07-31");
  assert.deepEqual(
    buildCompletedInspectionDates({
      vehicles: [explicitlyCompleted],
      registrations: ["NEW HGV"],
    }).get("NEWHGV"),
    ["2026-07-31"]
  );
});

test("HGV categories use end-of-ISO-week grace before automatic VOR", () => {
  const vehicle = {
    category: "HGV",
    nextPMI: "2026-08-10",
    nextBrakeTest: "2026-08-10",
    nextMOT: "2026-08-10",
  };
  assert.equal(isHgvComplianceVehicle(vehicle), true);
  assert.equal(
    evaluateHgvCompliance(vehicle, {
      asOfDate: "2026-08-16",
      evaluatedAt: "2026-08-16T12:00:00.000Z",
    }).complianceVor.state,
    "clear"
  );
  const overdue = evaluateHgvCompliance(vehicle, {
    asOfDate: "2026-08-17",
    evaluatedAt: "2026-08-17T00:05:00.000Z",
  });
  assert.equal(overdue.complianceVor.state, "active");
  assert.deepEqual(overdue.unresolvedTypes, ["pmi", "brake_test"]);
  const motOnlyOverdue = evaluateHgvCompliance(
    {
      category: "HGV",
      nextPMI: "2027-08-10",
      nextBrakeTest: "2027-08-10",
      nextMOT: "2026-08-10",
    },
    {
      asOfDate: "2026-08-17",
      evaluatedAt: "2026-08-17T00:05:00.000Z",
    }
  );
  assert.equal(motOnlyOverdue.complianceVor.state, "clear");
  assert.deepEqual(motOnlyOverdue.unresolvedTypes, []);
});

test("ISO year boundaries retain grace through Sunday of week 53", () => {
  const vehicle = {
    category: "HGV Trailers",
    nextPMI: "2026-12-31",
    nextBrakeTest: "2027-06-01",
    motNotApplicable: true,
  };
  assert.equal(
    evaluateHgvCompliance(vehicle, { asOfDate: "2027-01-03" }).complianceVor.state,
    "clear"
  );
  assert.equal(
    evaluateHgvCompliance(vehicle, { asOfDate: "2027-01-04" }).complianceVor.state,
    "active"
  );
});

test("Off Fleet and MOT-not-applicable vehicles are not overwritten by compliance", () => {
  const offFleet = {
    category: "HGV",
    operationalStatus: "Off Fleet",
    nextPMI: "2026-01-01",
    nextBrakeTest: "2026-01-01",
    nextMOT: "2026-01-01",
  };
  assert.equal(isOffFleetVehicle(offFleet), true);
  assert.equal(
    evaluateHgvCompliance(offFleet, { asOfDate: "2026-08-01" }).shouldStartVor,
    false
  );

  const motNotApplicable = evaluateHgvCompliance(
    {
      category: "HGV Trailers",
      motNotApplicable: true,
      nextPMI: "2027-01-01",
      nextBrakeTest: "2027-01-01",
      nextMOT: "2026-01-01",
    },
    { asOfDate: "2026-08-01" }
  );
  assert.equal(motNotApplicable.unresolvedTypes.includes("mot"), false);
});

test("VOR return depends on PMI and brake work, not DVSA MOT data", () => {
  const vehicle = {
    category: "HGV",
    dvsaMotTests: [
      { testResult: "PASSED", completedDate: "2026-07-01", expiryDate: "2027-06-30" },
    ],
    complianceVor: {
      state: "active",
      startedDate: "2026-08-17",
      reasons: {
        pmi: {
          type: "pmi",
          dueDate: "2026-08-10",
          resolvedAt: "2026-08-18T12:00:00.000Z",
        },
        brake_test: {
          type: "brake_test",
          dueDate: "2026-08-10",
          resolvedAt: "",
        },
      },
      freshPmiCompletedAt: "",
    },
  };
  assert.match(complianceVorReleaseBlocker(vehicle), /BRAKE TEST/);
  assert.equal(
    complianceVorReturnInspectionBlocker(vehicle, { asOfDate: "2026-08-18" }),
    ""
  );
  const allResolved = {
    ...vehicle,
    complianceVor: {
      ...vehicle.complianceVor,
      reasons: {
        ...vehicle.complianceVor.reasons,
        brake_test: {
          ...vehicle.complianceVor.reasons.brake_test,
          resolvedAt: "2026-08-18T12:00:00.000Z",
        },
      },
    },
  };
  assert.equal(complianceVorReleaseBlocker(allResolved, { asOfDate: "2026-08-18" }), "");
  assert.equal(
    complianceVorReleaseBlocker(
      {
        ...allResolved,
        dvsaMotTests: [],
        complianceVor: {
          ...allResolved.complianceVor,
          reasons: {
            ...allResolved.complianceVor.reasons,
            mot: { type: "mot", dueDate: "2026-07-01", resolvedAt: "" },
          },
        },
      },
      { asOfDate: "2026-08-18" }
    ),
    ""
  );
  assert.equal(
    complianceVorReturnInspectionBlocker(
      { ...vehicle, dvsaMotTests: [] },
      { asOfDate: "2026-08-18" }
    ),
    ""
  );
});

test("combined HGV appointment writes separate PMI and brake histories without activating VOR", () => {
  const workflows = ADDITIONAL_MAINTENANCE_WORKFLOWS.filter((workflow) =>
    ["pmi", "brake_test"].includes(workflow.maintenanceTypeId)
  );
  const vehicle = {
    category: "HGV",
    operationalStatus: "VOR",
    pmiFreq: 8,
    brakeTestFreq: 8,
    nextPMI: "2026-08-10",
    nextBrakeTest: "2026-08-10",
    nextMOT: "2027-01-01",
    dvsaMotTests: [
      { testResult: "PASSED", completedDate: "2026-01-02", expiryDate: "2027-01-01" },
    ],
    complianceVor: {
      state: "active",
      startedDate: "2026-08-17",
      triggeredAt: "2026-08-17T00:05:00.000Z",
      reasons: {
        pmi: { type: "pmi", dueDate: "2026-08-10", triggeredAt: "2026-08-17T00:05:00.000Z" },
        brake_test: { type: "brake_test", dueDate: "2026-08-10", triggeredAt: "2026-08-17T00:05:00.000Z" },
      },
    },
  };
  const patch = buildAdditionalMaintenanceCompletionPatch({
    vehicle,
    workflows,
    completedDate: "2026-08-18",
    completedAt: "2026-08-18T12:00:00.000Z",
    bookingId: "inspection-1",
    auditUser: { uid: "user-1", email: "fleet@example.com" },
  });

  assert.equal(patch.pmiHistory.at(-1).bookingId, "inspection-1");
  assert.equal(patch.brakeTestHistory.at(-1).bookingId, "inspection-1");
  assert.equal(patch.nextPMI, "2026-10-13");
  assert.equal(patch.nextBrakeTest, "2026-10-13");
  assert.equal(patch.operationalStatus, undefined);
  assert.equal(patch.complianceVor.state, "ready_for_release");
  assert.deepEqual(patch.eightWeekInspectionHistory, patch.pmiHistory);
  assert.equal(complianceVorReleaseBlocker({ ...vehicle, ...patch }), "");

  const repeated = buildAdditionalMaintenanceCompletionPatch({
    vehicle: { ...vehicle, ...patch },
    workflows,
    completedDate: "2026-08-18",
    completedAt: "2026-08-18T12:30:00.000Z",
    bookingId: "inspection-1",
    auditUser: { uid: "user-1", email: "fleet@example.com" },
  });
  assert.equal(
    repeated.pmiHistory.filter((entry) => entry.bookingId === "inspection-1").length,
    1
  );
  assert.equal(
    repeated.brakeTestHistory.filter((entry) => entry.bookingId === "inspection-1").length,
    1
  );
});

test("return-to-fleet declaration schedules PMI and brake only, then completion activates the vehicle", () => {
  const vorVehicle = startVehicleVorPeriod(
    {
      ...baseVehicle,
      category: "HGV",
      dvsaMotTests: [
        { testResult: "PASSED", completedDate: "2026-03-11", expiryDate: "2027-03-31" },
      ],
    },
    {
      offRoadDate: "2026-08-01",
      odometer: "594500",
      approvedBy: "Fleet Manager",
      approvedPosition: "Transport Manager",
      reason: "Repairs",
    },
    { recordId: "vor-return-1", startedAt: "2026-08-01T08:00:00.000Z" }
  );
  const pendingInspection = scheduleVehicleReturnInspection(
    vorVehicle,
    {
      inspectionDate: "2026-08-18",
      odometer: "594574",
      removedBy: "Fleet Manager",
      removedPosition: "Transport Manager",
      signature: "Fleet Manager",
    },
    { requestedAt: "2026-08-04T10:30:00.000Z" }
  );

  assert.equal(pendingInspection.operationalStatus, "VOR");
  assert.equal(pendingInspection.nextPMI, "2026-08-18");
  assert.equal(pendingInspection.nextEightWeekInspection, "2026-08-18");
  assert.equal(pendingInspection.nextBrakeTest, "2026-08-18");
  assert.equal(pendingInspection.pendingReturnInspection.status, "inspection_required");
  assert.equal(pendingInspection.vorHistory[0].status, "open");
  assert.deepEqual(getHgvComplianceVorDisplayRows(pendingInspection), [
    {
      type: "brake_test",
      status: "return_inspection_required",
      date: "2026-08-18",
    },
    {
      type: "pmi",
      status: "return_inspection_required",
      date: "2026-08-18",
    },
  ]);
  const returnAppointments = buildAnnualMaintenanceForecast({
    vehicle: pendingInspection,
    year: 2026,
    includedTypeIds: ["pmi", "brake_test"],
  });
  assert.equal(returnAppointments.length, 1);
  assert.equal(returnAppointments[0].schedule.appointmentDateISO, "2026-08-18");
  assert.deepEqual(
    returnAppointments[0].items.map((item) => item.maintenanceTypeId).sort(),
    ["brake_test", "pmi"]
  );

  const workflows = ADDITIONAL_MAINTENANCE_WORKFLOWS.filter((workflow) =>
    ["pmi", "brake_test"].includes(workflow.maintenanceTypeId)
  );
  const completed = buildAdditionalMaintenanceCompletionPatch({
    vehicle: pendingInspection,
    workflows,
    completedDate: "2026-08-18",
    completedAt: "2026-08-18T12:00:00.000Z",
    bookingId: "return-inspection-1",
    auditUser: { uid: "user-1", email: "fleet@example.com" },
  });

  assert.equal(completed.operationalStatus, "Active");
  assert.equal(completed.fleetStatus, "Active");
  assert.equal(completed.vehicleStatus, "Active");
  assert.equal(completed.pendingReturnInspection, null);
  assert.equal(completed.vorHistory[0].status, "closed");
  assert.equal(completed.vorHistory[0].returnedDate, "2026-08-18");
  assert.equal(completed.vorHistory[0].firstUseInspectionDate, "2026-08-18");
  assert.equal(completed.nextPMI, "2026-10-13");
  assert.equal(completed.nextBrakeTest, "2026-10-13");
});

test("planner expands one combined system inspection booking into PMI and brake events", () => {
  const events = buildLivePlannerEvents({
    vehicles: [{
      id: "hgv-1",
      category: "HGV",
      registration: "MX05VHW",
      nextPMI: "2026-08-10",
      nextBrakeTest: "2026-08-10",
    }],
    bookings: [
      {
        id: "inspection-1",
        vehicleId: "hgv-1",
        type: "INSPECTION",
        maintenanceTypeIds: ["pmi", "brake_test"],
        status: "Booked",
        appointmentDateISO: "2026-08-10",
      },
      {
        id: "archived-inspection",
        vehicleId: "hgv-1",
        type: "INSPECTION",
        maintenanceTypeIds: ["pmi", "brake_test"],
        status: "Archived",
        appointmentDateISO: "2026-08-10",
      },
    ],
    year: 2026,
    registrations: ["MX05VHW"],
    asOfDate: "2026-08-03",
  });
  assert.deepEqual(
    events.map((event) => event.type).sort(),
    ["brake", "inspection"]
  );
});

test("planner shows audited PMI and brake-test completion history", () => {
  const events = buildLivePlannerEvents({
    vehicles: [{
      id: "hgv-test",
      category: "HGV",
      registration: "HGV",
      lastPMI: "2026-08-03",
      lastBrakeTest: "2026-08-03",
      nextPMI: "2026-09-28",
      nextBrakeTest: "2026-09-28",
      pmiFreq: 8,
      pmiHistory: [
        { maintenanceTypeId: "pmi", completedDate: "2026-08-03", source: "booking", bookingId: "pmi-1" },
      ],
      brakeTestHistory: [
        { maintenanceTypeId: "brake_test", completedDate: "2026-08-03", source: "booking", bookingId: "brake-1" },
      ],
    }],
    bookings: [],
    year: 2026,
    registrations: ["HGV"],
  });
  const completed = events.filter((event) => event.status === "completed");
  assert.deepEqual(
    completed.map((event) => [event.type, event.date]).sort(),
    [["brake", "2026-08-03"], ["inspection", "2026-08-03"]]
  );
  assert.equal(events.some((event) => ["due", "projected"].includes(event.status)), false);
});

test("future HGV planner uses only active saved compliance, MOT and service appointments", () => {
  const events = buildLivePlannerEvents({
    vehicles: [{
      id: "hgv-future",
      category: "HGV",
      registration: "HGVFUT",
      nextPMI: "2026-09-28",
      nextBrakeTest: "2026-09-28",
      nextMOT: "2026-10-01",
      nextService: "2026-10-02",
    }],
    bookings: [
      {
        id: "active-inspection",
        vehicleId: "hgv-future",
        maintenanceTypeIds: ["pmi", "brake_test"],
        status: "Booked",
        appointmentDateISO: "2026-09-28",
      },
      {
        id: "active-mot",
        vehicleId: "hgv-future",
        maintenanceTypeIds: ["mot"],
        status: "Booked",
        appointmentDateISO: "2026-10-01",
      },
      {
        id: "active-service",
        vehicleId: "hgv-future",
        maintenanceTypeIds: ["service"],
        status: "Booked",
        appointmentDateISO: "2026-10-02",
      },
      {
        id: "archived-duplicate",
        vehicleId: "hgv-future",
        maintenanceTypeIds: ["pmi", "brake_test"],
        status: "Archived",
        appointmentDateISO: "2026-09-28",
      },
    ],
    year: 2026,
    registrations: ["HGVFUT"],
    asOfDate: "2026-08-03",
  });

  assert.deepEqual(
    events.map((event) => [event.type, event.status, event.date]),
    [
      ["inspection", "booked", "2026-09-28"],
      ["brake", "booked", "2026-09-28"],
      ["mot", "booked", "2026-10-01"],
      ["service", "booked", "2026-10-02"],
    ]
  );
});

test("future completion history is rejected by PMI aliases and never rendered as completed", () => {
  const vehicle = {
    id: "hgv-future-history",
    category: "HGV",
    registration: "HGVHIST",
    lastPMI: "2026-07-01",
    nextPMI: "2026-08-10",
    pmiHistory: [
      { completedDate: "2026-07-01", bookingId: "valid-pmi" },
      { completedDate: "2026-09-28", bookingId: "false-future-pmi" },
    ],
    eightWeekInspectionHistory: [
      { completedDate: "2026-07-01", bookingId: "valid-pmi" },
      { completedDate: "2026-09-28", bookingId: "false-future-pmi" },
    ],
  };
  const aliases = syncCanonicalPmiAliases(vehicle, { asOfDate: "2026-08-03" });
  assert.deepEqual(
    aliases.pmiHistory.map((entry) => entry.completedDate),
    ["2026-07-01"]
  );
  assert.deepEqual(aliases.eightWeekInspectionHistory, aliases.pmiHistory);
  assert.equal(aliases.lastPMI, "2026-07-01");
  assert.equal(aliases.nextPMI, "2026-08-10");

  const events = buildLivePlannerEvents({
    vehicles: [vehicle],
    bookings: [{
      id: "next-inspection",
      vehicleId: vehicle.id,
      maintenanceTypeIds: ["pmi", "brake_test"],
      status: "Booked",
      appointmentDateISO: "2026-08-10",
    }],
    year: 2026,
    registrations: [vehicle.registration],
    asOfDate: "2026-08-03",
  });
  assert.equal(
    events.some((event) => event.status === "completed" && event.date === "2026-09-28"),
    false
  );
  assert.equal(
    events.some((event) => event.status === "booked" && event.date === "2026-08-10"),
    true
  );
});

test("planner shows recorded last-completed fields without inventing a booking", () => {
  const events = buildLivePlannerEvents({
    vehicles: [{
      id: "hgv-test",
      category: "HGV",
      registration: "HGV",
      lastPMI: "2026-08-03",
      lastBrakeTest: "2026-08-03",
      nextPMI: "2026-09-28",
      nextBrakeTest: "2026-09-28",
      pmiFreq: 8,
      pmiHistory: [],
      brakeTestHistory: [],
    }],
    bookings: [],
    year: 2026,
    registrations: ["HGV"],
  });
  const recorded = events.filter(
    (event) => event.status === "completed" && event.date === "2026-08-03"
  );
  assert.deepEqual(recorded.map((event) => event.type).sort(), ["brake", "inspection"]);
  assert.ok(recorded.every((event) => event.source === "vehicle_last_completed_date"));
  assert.ok(recorded.every((event) => event.bookingId === ""));
});

test("planner does not duplicate a completion already present in history", () => {
  const events = buildLivePlannerEvents({
    vehicles: [{
      id: "hgv-test",
      category: "HGV",
      registration: "HGV",
      lastPMI: "2026-08-03",
      pmiHistory: [{ completedDate: "2026-08-03", bookingId: "pmi-1" }],
    }],
    bookings: [],
    year: 2026,
    registrations: ["HGV"],
  });
  assert.equal(
    events.filter((event) => event.type === "inspection" && event.status === "completed" && event.date === "2026-08-03").length,
    1
  );
});

test("VOR planner hides calculated dates but keeps explicitly rebooked compliance work", () => {
  const vehicle = {
    ...baseVehicle,
    category: "HGV",
    operationalStatus: "VOR",
    fleetStatus: "VOR",
    vehicleStatus: "VOR",
    pmiHistory: [{ maintenanceTypeId: "pmi", completedDate: "2026-06-01" }],
  };
  const events = buildLivePlannerEvents({
    vehicles: [vehicle],
    bookings: [
      {
        id: "vor-work-1",
        vehicleId: vehicle.id,
        type: "INSPECTION",
        maintenanceTypeIds: ["pmi", "brake_test"],
        appointmentDateISO: "2026-08-10",
        status: "Booked",
      },
    ],
    year: 2026,
    registrations: [vehicle.registration],
  });

  assert.equal(events.some((event) => ["due", "projected"].includes(event.status)), false);
  assert.equal(events.some((event) => event.bookingId === "vor-work-1" && event.status === "booked"), true);
});

test("maintenance diary auto-groups PMI and brake test dates in the same ISO week", () => {
  const events = buildVehicleDueEvents([
    {
      id: "hgv-1",
      category: "HGV",
      registration: "MX05 VHW",
      nextPMI: "2026-08-03",
      nextBrakeTest: "2026-08-07",
      hiddenAdditionalMaintenance: [],
    },
  ]);
  const appointments = events.filter(
    (event) => event.kind === "MAINTENANCE_APPOINTMENT" &&
      event.bookingStatus === "Appointment"
  );
  assert.equal(appointments.length, 1);
  assert.deepEqual(
    appointments[0].maintenanceTypeIds.sort(),
    ["brake_test", "pmi"]
  );
  assert.equal(appointments[0].sourceDueIsoWeek, "2026-W32");
  assert.equal(appointments[0].appointmentDateISO, "2026-08-03");
});

test("legacy HGV dates backfill once into auditable canonical histories", () => {
  const vehicle = {
    category: "HGV",
    lastPMI: "2026-06-15",
    nextPMI: "2026-08-10",
    lastBrakeTest: "2026-06-15",
    dvsaMotTests: [
      {
        completedDate: "2025-10-01",
        testResult: "PASSED",
        motTestNumber: "mot-1",
      },
    ],
  };
  const first = buildHgvComplianceMigrationPatch(vehicle, {
    migratedAt: "2026-07-31T10:00:00.000Z",
  });
  assert.equal(first.patch.pmiHistory.length, 1);
  assert.equal(first.patch.brakeTestHistory.length, 1);
  assert.equal(first.patch.motHistory.length, 1);
  assert.equal(first.patch.eightWeekInspectionStart, "2026-06-15");

  const second = buildHgvComplianceMigrationPatch({ ...vehicle, ...first.patch });
  assert.deepEqual(second.patch, {});
});

test("Active → VOR → Active keeps maintenance validity dates running", () => {
  const vorVehicle = startVehicleVorPeriod(
    baseVehicle,
    {
      offRoadDate: "2026-07-01",
      odometer: "10822",
      approvedBy: "Fleet Manager",
      approvedPosition: "Transport Manager",
      reason: "Body repairs",
    },
    {
      recordId: "vor-1",
      startedAt: "2026-07-01T08:00:00.000Z",
    }
  );

  assert.equal(vorVehicle.operationalStatus, "VOR");
  assert.equal(vorVehicle.fleetStatus, "VOR");
  assert.equal(vorVehicle.vehicleStatus, "VOR");
  assert.equal(vorVehicle.maintenanceCountdownPause.status, "not_paused");
  assert.equal(vorVehicle.maintenanceCountdownPause.policy, "continues_while_vor");
  assert.equal(vorVehicle.vorHistory[0].status, "open");

  const activeVehicle = returnVehicleFromVor(
    vorVehicle,
    {
      returnedDate: "2026-07-15",
      odometer: "10840",
      removedBy: "Fleet Manager",
      removedPosition: "Transport Manager",
      signature: "Fleet Manager",
    },
    { completedAt: "2026-07-15T10:00:00.000Z" }
  );

  assert.equal(activeVehicle.operationalStatus, "Active");
  assert.equal(activeVehicle.fleetStatus, "Active");
  assert.equal(activeVehicle.vehicleStatus, "Active");
  assert.equal(activeVehicle.vorHistory[0].status, "closed");
  assert.equal(activeVehicle.vorHistory[0].durationDays, 14);
  assert.equal(activeVehicle.nextPMI, baseVehicle.nextPMI);
  assert.equal(activeVehicle.nextBrakeTest, baseVehicle.nextBrakeTest);
  assert.equal(activeVehicle.nextMOT, baseVehicle.nextMOT);
  assert.equal(activeVehicle.maintenanceCountdownPause.status, "not_paused");
});

test("legacy VOR countdown migration helper remains deterministic", () => {
  const result = applyVorCountdownResume(baseVehicle, {
    offRoadDate: "2026-07-01",
    returnedDate: "2026-07-15",
    dueDates: {
      mot: "2026-09-01",
      service: "2026-10-01",
      brake_test: "2026-08-01",
    },
  });

  assert.equal(result.durationDays, 14);
  assert.equal(result.updates.nextMOT, "2026-09-15");
  assert.equal(result.updates.nextService, "2026-10-15");
  assert.equal(result.updates.nextBrakeTest, "2026-08-15");
});

test("completing an appointment updates every additional maintenance type", () => {
  const vehicle = {};
  ADDITIONAL_MAINTENANCE_WORKFLOWS.forEach((workflow) => {
    vehicle[workflow.frequencyField] = workflow.maintenanceTypeId === "tacho_inspection" ? 104 : 8;
    vehicle[workflow.historyField] = [];
  });

  const patch = buildAdditionalMaintenanceCompletionPatch({
    vehicle,
    workflows: ADDITIONAL_MAINTENANCE_WORKFLOWS,
    completedDate: "2026-07-13",
    completedAt: "2026-07-13T12:00:00.000Z",
  });

  ADDITIONAL_MAINTENANCE_WORKFLOWS.forEach((workflow) => {
    assert.equal(patch[workflow.lastField], "2026-07-13", workflow.maintenanceTypeId);
    assert.match(patch[workflow.nextField], /^\d{4}-\d{2}-\d{2}$/, workflow.maintenanceTypeId);
    assert.equal(
      patch[workflow.historyField].at(-1).maintenanceTypeId,
      workflow.maintenanceTypeId
    );
    assert.equal(patch[workflow.historyField].at(-1).completedDate, "2026-07-13");
  });
  assert.equal(patch.nextTacho, "2028-07-10");
  assert.equal(patch.nextBrakeTest, "2026-09-07");
  assert.equal(patch.nextPMI, "2026-09-07");
  assert.equal(patch.nextTachoDownload, "2026-09-07");
  assert.equal(patch.nextTailLift, "2026-09-07");
  assert.equal(patch.nextLoler, "2026-09-07");
});

test("document upload metadata is preserved and deletion removes vehicle and history copies", () => {
  const document = buildMaintenanceDocument({
    file: { name: "pmi-sheet.pdf", type: "application/pdf", size: 2048 },
    url: "https://files.example/pmi-sheet.pdf",
    storagePath: "companies/company-1/vehicles/vehicle-1/pmi-sheet.pdf",
    maintenanceTypeId: "pmi",
    source: "appointment",
    sourceRecordId: "booking-1",
    uploadedAt: "2026-07-13T12:00:00.000Z",
    uploadedBy: {
      uid: "user-1",
      name: "Mason Bickers",
      email: "mason@example.com",
    },
  });
  const history = appendMaintenanceDocumentToHistory([], {
    maintenanceTypeId: "pmi",
    label: "PMI inspection",
    completedDate: "2026-07-13",
    document,
  });

  assert.equal(document.source, "appointment");
  assert.equal(document.uploadedAt, "2026-07-13T12:00:00.000Z");
  assert.equal(document.uploadedBy.uid, "user-1");
  assert.equal(history[0].documents[0].storagePath, document.storagePath);
  assert.deepEqual(removeMaintenanceDocument([document], document), []);
  assert.deepEqual(
    removeMaintenanceDocumentFromHistory(history, document)[0].documents,
    []
  );
});

test("history matching uses exact maintenance type identifiers", () => {
  const tachoInspection = ADDITIONAL_MAINTENANCE_WORKFLOWS.find(
    (workflow) => workflow.maintenanceTypeId === "tacho_inspection"
  );
  const pmi = ADDITIONAL_MAINTENANCE_WORKFLOWS.find(
    (workflow) => workflow.maintenanceTypeId === "pmi"
  );
  const bookings = [
    { id: "ti", maintenanceTypeId: "tacho_inspection", completedDate: "2026-07-01" },
    { id: "td", maintenanceTypeId: "tacho_download", completedDate: "2026-07-02" },
    { id: "pmi", maintenanceTypeId: "pmi", completedDate: "2026-07-03" },
    {
      id: "combined",
      maintenanceTypeId: "brake_test",
      maintenanceTypeIds: ["brake_test", "pmi"],
      appointmentDateISO: "2026-07-05",
    },
    { id: "generic", type: "INSPECTION", completedDate: "2026-07-04" },
  ];

  assert.deepEqual(
    buildMaintenanceHistoryRows({ vehicle: {}, bookings, workflow: tachoInspection }).map(
      (row) => row.id
    ),
    ["booking-ti"]
  );
  assert.deepEqual(
    buildMaintenanceHistoryRows({ vehicle: {}, bookings, workflow: pmi }).map(
      (row) => row.id
    ),
    ["booking-pmi", "booking-combined"]
  );
});

test("maintenance history remains empty while the vehicle record is loading", () => {
  const brakeTest = ADDITIONAL_MAINTENANCE_WORKFLOWS.find(
    (workflow) => workflow.maintenanceTypeId === "brake_test"
  );

  assert.deepEqual(
    buildMaintenanceHistoryRows({
      vehicle: null,
      bookings: null,
      workflow: brakeTest,
    }),
    []
  );
});

test("maintenance history hides archived rows without removing active or completed records", () => {
  const pmi = ADDITIONAL_MAINTENANCE_WORKFLOWS.find(
    (workflow) => workflow.maintenanceTypeId === "pmi"
  );
  const vehicle = {
    pmiHistory: [
      { id: "completed", completedDate: "2026-08-03", status: "Completed" },
      { id: "archived-history", completedDate: "2026-07-01", status: "Archived" },
    ],
  };
  const bookings = [
    {
      id: "booked",
      maintenanceTypeId: "pmi",
      appointmentDateISO: "2026-09-28",
      status: "Booked",
    },
    {
      id: "archived-booking",
      maintenanceTypeId: "pmi",
      appointmentDateISO: "2027-01-18",
      status: "Archived",
    },
  ];

  assert.deepEqual(
    buildMaintenanceHistoryRows({ vehicle, bookings, workflow: pmi }).map((row) => row.id),
    ["stored-0", "booking-booked"]
  );
});

test("maintenance history merges one completed booking with its vehicle history record", () => {
  const pmi = ADDITIONAL_MAINTENANCE_WORKFLOWS.find(
    (workflow) => workflow.maintenanceTypeId === "pmi"
  );
  const vehicle = {
    pmiHistory: [
      {
        bookingId: "inspection-1",
        completedDate: "2026-08-03",
        status: "Completed",
        notes: "Combined inspection completed.",
        documents: [{ id: "vehicle-document", url: "https://example.test/pmi.pdf" }],
      },
    ],
  };
  const bookings = [
    {
      id: "inspection-1",
      maintenanceTypeIds: ["pmi", "brake_test"],
      completedDate: "2026-08-03",
      status: "Completed",
      provider: "Test workshop",
      documents: [{ id: "vehicle-document", url: "https://example.test/pmi.pdf" }],
    },
  ];

  const rows = buildMaintenanceHistoryRows({ vehicle, bookings, workflow: pmi });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookingId, "inspection-1");
  assert.equal(rows[0].provider, "Test workshop");
  assert.equal(rows[0].notes, "Combined inspection completed.");
  assert.equal(rows[0].documents.length, 1);
});

test("timeline records both boundaries and the full VOR period", () => {
  const events = buildVorTimelineEvents({
    vorHistory: [
      {
        id: "vor-1",
        offRoadDate: "2026-07-01",
        returnedDate: "2026-07-15",
        durationDays: 14,
        reason: "Body repairs",
        firstUseInspectionDate: "2026-07-15",
      },
    ],
  });

  assert.deepEqual(
    events.map((event) => [event.date, event.title]),
    [
      ["2026-07-01", "Status changed: Active → VOR"],
      ["2026-07-15", "Status changed: VOR → Active"],
    ]
  );
  assert.match(events[1].description, /14 days/);
  assert.ok(events[1].details.includes("First-use PMI: 15/07/2026"));
});

test("timeline hides archived records and merges one combined inspection completion", () => {
  assert.equal(isArchivedTimelineRecord({ status: "Archived" }), true);
  assert.equal(isArchivedTimelineRecord({ status: "Booked" }), false);

  const events = mergeVehicleTimelineEvents([
    {
      id: "legacy",
      type: "inspection",
      date: "2026-08-03",
      title: "Safety inspection completed",
      description: "Inspection completed.",
      details: [],
      tone: "warning",
      bookingId: "inspection-1",
      maintenanceTypeIds: ["pmi"],
      timelineKind: "maintenance_completion",
    },
    {
      id: "brake-history",
      type: "inspection",
      date: "2026-08-03",
      title: "Brake test",
      description: "Brake test completed.",
      details: ["Provider: Test workshop"],
      tone: "warning",
      bookingId: "inspection-1",
      maintenanceTypeIds: ["brake_test"],
      timelineKind: "maintenance_completion",
    },
    {
      id: "booking",
      type: "inspection",
      date: "2026-08-03",
      title: "INSPECTION · Completed",
      description: "Maintenance booking activity.",
      details: ["Ref: PMI-1"],
      tone: "success",
      bookingId: "inspection-1",
      maintenanceTypeIds: ["pmi", "brake_test"],
      timelineKind: "maintenance_completion",
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "PMI and brake test completed");
  assert.equal(events[0].tone, "success");
  assert.deepEqual(events[0].details, ["Provider: Test workshop", "Ref: PMI-1"]);
});

test("timeline orders upcoming nearest-first and past activity most-recent-first", () => {
  const groups = partitionVehicleTimelineEvents(
    [
      { id: "future-far", date: "2027-07-30", timelineKind: "maintenance_booking" },
      { id: "past-old", date: "2026-06-01", timelineKind: "maintenance_completion" },
      { id: "future-near", date: "2026-09-28", timelineKind: "maintenance_booking" },
      { id: "past-near", date: "2026-08-03", timelineKind: "maintenance_completion" },
      { id: "today-booked", date: "2026-08-04", timelineKind: "maintenance_booking" },
      { id: "today-completed", date: "2026-08-04", timelineKind: "maintenance_completion" },
    ],
    "2026-08-04"
  );

  assert.deepEqual(groups.upcoming.map((event) => event.id), [
    "today-booked",
    "future-near",
    "future-far",
  ]);
  assert.deepEqual(groups.past.map((event) => event.id), [
    "today-completed",
    "past-near",
    "past-old",
  ]);
});

test("timeline describes maintenance bookings by their exact contents and origin", () => {
  assert.equal(
    timelineMaintenanceBookingLabel({ maintenanceTypeIds: ["pmi", "brake_test"] }),
    "PMI + brake test inspection"
  );
  assert.equal(
    timelineMaintenanceBookingLabel({ maintenanceTypeIds: ["pmi"] }),
    "PMI inspection"
  );
  assert.equal(
    timelineMaintenanceBookingLabel({ maintenanceTypeIds: ["brake_test"] }),
    "Brake test"
  );
  assert.equal(
    timelineMaintenanceOriginLabel({ origin: { source: "automatic_schedule" } }),
    "Automatic forecast appointment"
  );
  assert.equal(
    timelineMaintenanceOriginLabel({
      origin: { source: "automatic_schedule" },
      scheduleManuallyAdjusted: true,
    }),
    "Automatic appointment manually moved"
  );
  assert.equal(
    timelineMaintenanceOriginLabel({ origin: { source: "manual" } }),
    "Manual appointment"
  );
});

test("timeline and maintenance-history reads use the single-company compatibility query", async () => {
  const [accessSource, timelineSource, historySource] = await Promise.all([
    readFile(new URL("../src/app/utils/firestoreAccess.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/app/vehicle-edit/[id]/timeline/page.js", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL(
        "../src/app/vehicle-edit/[id]/maintenance-history/[type]/page.js",
        import.meta.url
      ),
      "utf8"
    ),
  ]);

  assert.doesNotMatch(accessSource, /where\("companyId",\s*"==",\s*gate\.companyId\)/);
  assert.match(accessSource, /companyId:\s*gate\.companyId\s*\|\|\s*SINGLE_COMPANY_ID/);
  assert.doesNotMatch(timelineSource, /getDoc\(doc\(db,\s*"vehicles"/);
  assert.doesNotMatch(historySource, /getDoc\(doc\(db,\s*"vehicles"/);
  assert.ok(
    (timelineSource.match(/tenantCollectionQuery\(/g) || []).length >= 3
  );
  assert.ok(
    (historySource.match(/tenantCollectionQuery\(/g) || []).length >= 2
  );
});
