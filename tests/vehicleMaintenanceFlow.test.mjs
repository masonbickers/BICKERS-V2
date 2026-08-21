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
  addHistoricVorPeriod,
  archiveHistoricVorPeriod,
  archiveVehicleHistoricVorPeriod,
  assertVorHistoryIntegrity,
  assertVorPeriodDoesNotOverlap,
  buildHistoricVorPeriod,
  canReleaseVehicleAfterCompletedCompliance,
  correctHistoricVorPeriod,
  correctVehicleHistoricVorPeriod,
  historicVorFirstUseBookingIntent,
  releaseVehicleAfterCompletedCompliance,
  returnVehicleFromVor,
  scheduleVehicleReturnInspection,
  startVehicleVorPeriod,
  vehicleReturnInspectionBookingIntent,
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
  buildPlannerInspectionEvidenceDates,
  hasActiveInspectionWindow,
  buildLivePlannerEvents,
  hgvComplianceStatusForIsoWeek,
  isReturnInspectionScheduledForIsoWeek,
  isVorPeriodStartingInIsoWeek,
  plannerStartingVorPeriodsForIsoWeek,
  summarizeInspectionRequirements,
  vehicleStatusForIsoWeek,
  vorHistoryPeriodsForIsoWeek,
  vorHistoryStatusForIsoWeek,
} from "../src/app/hgv-compliance/hgvPlanner.js";
import {
  buildVehicleDueEvents,
} from "../src/app/utils/maintenanceCalendar.js";
import {
  mergeVehicleRealtimeState,
  shouldApplyRealtimeSnapshot,
} from "../src/app/utils/vehicleRealtime.js";
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
  brakeTestFreq: "8",
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
      { type: "INSPECTION", maintenanceTypeIds: ["pmi"], status: "Booked", appointmentDateISO: "2026-08-10" },
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
  for (const maintenanceTypeId of ["tacho_inspection", "tacho_download", "tail_lift", "loler"]) {
    assert.equal(
      isVorAffectedMaintenanceBooking({
        type: "INSPECTION",
        maintenanceTypeIds: [maintenanceTypeId],
        status: "Booked",
        appointmentDateISO: "2026-08-10",
      }, policy),
      false,
      `${maintenanceTypeId} must not be inferred as PMI or brake work`
    );
  }
  assert.equal(
    isVorAffectedMaintenanceBooking({
      type: "INSPECTION",
      maintenanceTypeIds: ["tacho_inspection", "pmi"],
      status: "Booked",
      appointmentDateISO: "2026-08-10",
    }, policy),
    true,
    "mixed appointments are affected only when an exact PMI/brake id is present"
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

  const mixedPatch = buildVorInspectionCancellationPatch(bookings[1], {
    cancelledAt: "2026-08-04T12:00:00.000Z",
    cancelledBy: { uid: "user-1", email: "fleet@example.com" },
  });
  assert.equal(mixedPatch.status, "Booked");
  assert.equal(mixedPatch.items.find((item) => item.maintenanceTypeId === "brake_test").status, "cancelled");
  assert.notEqual(mixedPatch.items.find((item) => item.maintenanceTypeId === "repair").status, "cancelled");
});

test("a completed inspection remains active through its legal due ISO week", () => {
  const completedDates = ["2026-02-02"];

  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 5), false);
  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 6), true);
  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 13), true);
  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 14), true);
  assert.equal(hasActiveInspectionWindow(completedDates, 2026, 15), false);

  const completedAgain = [...completedDates, "2026-09-01"];
  assert.equal(hasActiveInspectionWindow(completedAgain, 2026, 36), true);
  assert.equal(hasActiveInspectionWindow(completedAgain, 2026, 43), true);
  assert.equal(hasActiveInspectionWindow(completedAgain, 2026, 44), true);
  assert.equal(hasActiveInspectionWindow(completedAgain, 2026, 45), false);

  const currentlyVorVehicle = {
    category: "HGV",
    pmiFreq: 8,
    nextPMI: "2026-03-31",
    nextBrakeTest: "2026-03-31",
    nextMOT: "2027-01-01",
  };
  assert.equal(
    hgvComplianceStatusForIsoWeek(currentlyVorVehicle, "ACTIVE", 2026, 14, false, ["2026-03-31"]),
    ""
  );
  assert.equal(
    hgvComplianceStatusForIsoWeek(currentlyVorVehicle, "ACTIVE", 2026, 21, false, ["2026-03-31"]),
    ""
  );
  assert.equal(
    hgvComplianceStatusForIsoWeek(currentlyVorVehicle, "ACTIVE", 2026, 22, false, ["2026-03-31"]),
    ""
  );
  assert.equal(
    hgvComplianceStatusForIsoWeek(currentlyVorVehicle, "ACTIVE", 2026, 23, false, ["2026-03-31"]),
    "VOR"
  );
});

test("a scheduled inspection completion clears a stale automatic VOR after Sunday", () => {
  const vehicle = {
    id: "mx05",
    category: "HGV",
    registration: "MX05VHW",
    operationalStatus: "VOR",
    pmiFreq: 8,
    vorHistory: [{
      id: "compliance-vor-2026-08-17",
      status: "open",
      offRoadDate: "2026-08-17",
      approvedBy: "HGV compliance system",
      reason: "Automatic compliance VOR: PMI, BRAKE TEST",
    }],
  };
  const bookings = [{
    id: "mx05-inspection",
    vehicleId: vehicle.id,
    registration: vehicle.registration,
    type: "INSPECTION",
    status: "Booked",
    maintenanceTypeIds: ["pmi", "brake_test"],
    items: [
      {
        maintenanceTypeId: "pmi",
        status: "completed",
        completionDateISO: "2026-08-10",
        legalDueDateISO: "2026-08-10",
      },
      {
        maintenanceTypeId: "brake_test",
        status: "completed",
        completionDateISO: "2026-08-10",
        legalDueDateISO: "2026-08-10",
      },
    ],
  }];

  const completedDates = buildCompletedInspectionDates({
    vehicles: [vehicle],
    bookings,
    registrations: [vehicle.registration],
    asOfDate: "2026-08-20",
  }).get(vehicle.registration);

  assert.deepEqual(completedDates, ["2026-08-10"]);
  assert.equal(
    vehicleStatusForIsoWeek(vehicle, "VOR", 2026, 34, false, completedDates, "2026-08-20"),
    ""
  );
  assert.deepEqual(
    plannerStartingVorPeriodsForIsoWeek(
      vehicle,
      "VOR",
      2026,
      34,
      false,
      completedDates,
      "2026-08-20"
    ),
    []
  );
});

test("inspection evidence does not clear a manual open VOR", () => {
  const vehicle = {
    category: "HGV",
    operationalStatus: "VOR",
    pmiFreq: 8,
    vorHistory: [{
      id: "manual-vor-1",
      status: "open",
      offRoadDate: "2026-08-17",
      approvedBy: "Transport Manager",
      reason: "Body repairs",
    }],
  };

  assert.equal(
    vehicleStatusForIsoWeek(
      vehicle,
      "VOR",
      2026,
      34,
      false,
      ["2026-08-10"],
      "2026-08-20"
    ),
    "VOR"
  );
  assert.equal(
    plannerStartingVorPeriodsForIsoWeek(
      vehicle,
      "VOR",
      2026,
      34,
      false,
      ["2026-08-10"],
      "2026-08-20"
    ).length,
    1
  );
});

test("the planner reconstructs elapsed expired-VOR gaps between inspections", () => {
  const vehicle = {
    category: "HGV",
    operationalStatus: "Active",
    pmiFreq: 8,
  };
  const completedDates = ["2026-05-06", "2026-07-17"];

  assert.equal(
    vehicleStatusForIsoWeek(vehicle, "ACTIVE", 2026, 18, false, completedDates, "2026-08-07"),
    ""
  );
  assert.equal(
    vehicleStatusForIsoWeek(vehicle, "ACTIVE", 2026, 27, false, completedDates, "2026-08-07"),
    ""
  );
  assert.equal(
    vehicleStatusForIsoWeek(vehicle, "ACTIVE", 2026, 28, false, completedDates, "2026-08-07"),
    "VOR"
  );
  assert.equal(
    vehicleStatusForIsoWeek(vehicle, "ACTIVE", 2026, 29, false, completedDates, "2026-08-07"),
    "VOR"
  );
  assert.equal(
    vehicleStatusForIsoWeek(vehicle, "ACTIVE", 2026, 30, false, completedDates, "2026-08-07"),
    ""
  );
  assert.equal(
    vehicleStatusForIsoWeek(vehicle, "ACTIVE", 2026, 40, false, completedDates, "2026-08-07"),
    ""
  );
});

test("historical imported inspections drive VOR gaps without treating MOT-only events as PMI", () => {
  const result = buildPlannerInspectionEvidenceDates(
    new Map([["MX05VHW", ["2024-11-18"]]]),
    [
      { registration: "MX05VHW", date: "2025-01-13", type: "imported" },
      { registration: "MX05VHW", date: "2025-03-21", type: "imported" },
      { registration: "MX05VHW", date: "2025-05-05", type: "inspection", status: "completed" },
      { registration: "MX05VHW", date: "2025-05-30", type: "mot", status: "completed" },
      { registration: "MX05VHW", date: "2025-06-02", type: "inspection", status: "booked" },
    ]
  );

  assert.deepEqual(result.get("MX05VHW"), [
    "2024-11-18",
    "2025-01-13",
    "2025-03-21",
    "2025-05-05",
  ]);
  assert.equal(
    vehicleStatusForIsoWeek(
      { category: "HGV", pmiFreq: 8 },
      "ACTIVE",
      2025,
      12,
      false,
      result.get("MX05VHW"),
      "2026-08-07"
    ),
    "VOR"
  );
  assert.equal(
    vehicleStatusForIsoWeek(
      { category: "HGV", pmiFreq: 8 },
      "ACTIVE",
      2025,
      13,
      false,
      result.get("MX05VHW"),
      "2026-08-07"
    ),
    ""
  );
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

test("ready-for-release VOR uses completed inspections without scheduling duplicates", () => {
  const vorVehicle = startVehicleVorPeriod(
    {
      ...baseVehicle,
      nextPMI: "2026-09-28",
      nextBrakeTest: "2026-09-28",
      complianceVor: {
        state: "ready_for_release",
        releaseRequired: true,
        freshPmiCompletedAt: "2026-08-03",
        reasons: {
          pmi: {
            type: "pmi",
            dueDate: "2026-07-27",
            resolvedAt: "2026-08-03T12:00:00.000Z",
            completionDate: "2026-08-03",
          },
          brake_test: {
            type: "brake_test",
            dueDate: "2026-07-27",
            resolvedAt: "2026-08-03T12:00:00.000Z",
            completionDate: "2026-08-03",
          },
        },
      },
    },
    {
      offRoadDate: "2026-08-01",
      odometer: "100000",
      approvedBy: "Transport Manager",
      approvedPosition: "Transport Manager",
      reason: "Overdue inspection",
    },
    { recordId: "compliance-vor-1", startedAt: "2026-08-01T08:00:00.000Z" }
  );
  vorVehicle.complianceVor = { state: "clear", releaseRequired: false, reasons: {} };
  vorVehicle.lastPMI = "2026-08-03";
  vorVehicle.lastBrakeTest = "2026-08-03";
  vorVehicle.pendingReturnInspection = {
    status: "inspection_required",
    inspectionDate: "2026-08-04",
    requestedAt: "2026-08-04T10:00:00.000Z",
  };
  vorVehicle.nextPMI = "2026-08-04";
  vorVehicle.nextEightWeekInspection = "2026-08-04";
  vorVehicle.nextBrakeTest = "2026-08-04";
  assert.equal(canReleaseVehicleAfterCompletedCompliance(vorVehicle), true);
  assert.deepEqual(
    getHgvComplianceVorDisplayRows(vorVehicle).map((row) => row.status),
    ["resolved", "resolved"]
  );

  const released = releaseVehicleAfterCompletedCompliance(
    vorVehicle,
    {
      returnedDate: "2026-08-04",
      odometer: "100120",
      removedBy: "Fleet Manager",
      removedPosition: "Transport Manager",
      signature: "Fleet Manager",
    },
    {
      completedAt: "2026-08-04T12:00:00.000Z",
      releasedBy: { uid: "user-1", email: "fleet@example.com" },
    }
  );

  assert.equal(released.operationalStatus, "Active");
  assert.equal(released.complianceVor.state, "clear");
  assert.equal(released.complianceVor.releaseRequired, false);
  assert.equal(released.complianceVor.releaseMethod, "completed_compliance_inspections");
  assert.equal(
    released.complianceVor.releaseEvidence.supersededPendingReturnInspection.inspectionDate,
    "2026-08-04"
  );
  assert.equal(released.vorHistory.at(-1).status, "closed");
  assert.equal(released.vorHistory.at(-1).firstUseInspectionDate, "2026-08-03");
  assert.equal(released.pendingReturnInspection, null);
  assert.equal(released.nextPMI, "2026-09-28");
  assert.equal(released.nextBrakeTest, "2026-09-28");
});

test("completion document arrays remain flat in vehicle document and history fields", () => {
  const workflows = ADDITIONAL_MAINTENANCE_WORKFLOWS.filter((workflow) =>
    ["pmi", "brake_test"].includes(workflow.maintenanceTypeId)
  );
  const pmiDocument = buildMaintenanceDocument({
    file: { name: "pmi-sheet.pdf", type: "application/pdf", size: 2048 },
    url: "https://files.example/pmi-sheet.pdf",
    storagePath: "vehicles/vehicle-1/pmi-sheet.pdf",
    maintenanceTypeId: "pmi",
    source: "maintenance_booking",
    sourceRecordId: "inspection-1",
  });
  const patch = buildAdditionalMaintenanceCompletionPatch({
    vehicle: { category: "HGV", pmiFreq: 8, brakeTestFreq: 8 },
    workflows,
    completedDate: "2026-08-18",
    bookingId: "inspection-1",
    documentsByKey: { pmi: [pmiDocument], brake_test: [] },
  });

  assert.equal(patch.pmiDocuments.length, 1);
  assert.equal(Array.isArray(patch.pmiDocuments[0]), false);
  assert.equal(patch.pmiHistory.at(-1).documents.length, 1);
  assert.equal(Array.isArray(patch.pmiHistory.at(-1).documents[0]), false);
  assert.deepEqual(patch.brakeTestHistory.at(-1).documents, []);
  assert.equal("brakeTestDocuments" in patch, false);
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
  assert.equal(canReleaseVehicleAfterCompletedCompliance(pendingInspection), false);
  assert.deepEqual(vehicleReturnInspectionBookingIntent(pendingInspection), {
    vehicleId: pendingInspection.id,
    vehicleLabel: pendingInspection.name || pendingInspection.registration || pendingInspection.reg,
    type: "INSPECTION",
    status: "Booked",
    maintenanceTypeIds: ["pmi", "brake_test"],
    appointmentDateISO: "2026-08-18",
    sourceDueDateISO: "2026-08-18",
    sourceDueKey: `vor-return:${pendingInspection.id}:2026-08-18`,
    notes: "Required combined PMI and brake-test inspection before return to fleet.",
    origin: "vehicle_vor_return",
    sourceVorPeriodId: "vor-return-1",
  });
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
  assert.deepEqual(
    getHgvComplianceVorDisplayRows({
      ...pendingInspection,
      complianceVor: {
        ...pendingInspection.complianceVor,
        state: "ready_for_release",
      },
    }).map((row) => row.status),
    ["return_inspection_required", "return_inspection_required"]
  );
  const returnAppointments = buildAnnualMaintenanceForecast({
    vehicle: pendingInspection,
    year: 2026,
    includedTypeIds: ["pmi", "brake_test"],
  });
  assert.equal(returnAppointments.length, 1);
  assert.equal(returnAppointments[0].sourceDueDateISO, "2026-08-18");
  assert.equal(returnAppointments[0].status, "requested");
  assert.deepEqual(returnAppointments[0].schedule.bookingDates, []);
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
    events.filter((event) => event.status === "booked").map((event) => event.type).sort(),
    ["brake", "inspection"]
  );
});

test("planner marks recurring PMI and brake inspections due for 12 months", () => {
  const vehicle = {
    id: "year-ahead-hgv",
    category: "HGV",
    registration: "YEAR12",
    nextPMI: "2026-08-10",
    nextBrakeTest: "2026-08-10",
    pmiFreq: 8,
    brakeTestFreq: 8,
  };
  const common = {
    vehicles: [vehicle],
    bookings: [],
    registrations: [vehicle.registration],
    asOfDate: "2026-08-07",
  };

  const events2026 = buildLivePlannerEvents({ ...common, year: 2026 });
  const events2027 = buildLivePlannerEvents({ ...common, year: 2027 });

  assert.deepEqual(
    events2026.filter((event) => event.type === "inspection").map((event) => event.date),
    ["2026-08-10", "2026-10-05", "2026-11-30"]
  );
  assert.deepEqual(
    events2027.filter((event) => event.type === "inspection").map((event) => event.date),
    ["2027-01-25", "2027-03-22", "2027-05-17", "2027-07-12"]
  );
  assert.ok([...events2026, ...events2027].every((event) => event.status === "requested"));
  assert.ok([...events2026, ...events2027].every((event) => event.source === "year_ahead_forecast"));
});

test("saved inspection appointments replace the matching year-ahead due markers", () => {
  const vehicle = {
    id: "booked-year-ahead-hgv",
    category: "HGV",
    registration: "BOOK12",
    nextPMI: "2026-08-10",
    nextBrakeTest: "2026-08-10",
    pmiFreq: 8,
    brakeTestFreq: 8,
  };
  const events = buildLivePlannerEvents({
    vehicles: [vehicle],
    bookings: [{
      id: "booked-first-cycle",
      vehicleId: vehicle.id,
      status: "Booked",
      appointmentDateISO: "2026-08-12",
      maintenanceTypeIds: ["pmi", "brake_test"],
      items: [
        { maintenanceTypeId: "pmi", status: "booked", legalDueDateISO: "2026-08-10" },
        { maintenanceTypeId: "brake_test", status: "booked", legalDueDateISO: "2026-08-10" },
      ],
    }],
    year: 2026,
    registrations: [vehicle.registration],
    asOfDate: "2026-08-07",
  });

  assert.equal(events.filter((event) => event.status === "booked").length, 2);
  assert.equal(events.some((event) => event.status === "requested" && event.date === "2026-08-10"), false);
  assert.equal(events.some((event) => event.status === "requested" && event.date === "2026-10-05"), true);
});

test("an early inspection booking retains its later legal due-week marker", () => {
  const vehicle = {
    id: "early-booked-hgv",
    category: "HGV",
    registration: "EARLY8",
    nextPMI: "2026-10-05",
    nextBrakeTest: "2026-10-05",
    pmiFreq: 8,
    brakeTestFreq: 8,
  };
  const events = buildLivePlannerEvents({
    vehicles: [vehicle],
    bookings: [{
      id: "early-inspection",
      vehicleId: vehicle.id,
      status: "Booked",
      appointmentDateISO: "2026-07-27",
      maintenanceTypeIds: ["pmi", "brake_test"],
      items: [
        { maintenanceTypeId: "pmi", status: "booked", legalDueDateISO: "2026-08-10" },
        { maintenanceTypeId: "brake_test", status: "booked", legalDueDateISO: "2026-08-10" },
      ],
    }],
    year: 2026,
    registrations: [vehicle.registration],
    asOfDate: "2026-07-20",
  });

  assert.deepEqual(
    events
      .filter((event) => ["booked", "due"].includes(event.status))
      .map((event) => [
        event.type,
        event.status,
        event.date,
        event.isLegalDueReference || false,
        event.bookingId || "",
        event.linkedBookingId || "",
      ]),
    [
      ["inspection", "booked", "2026-07-27", false, "early-inspection", ""],
      ["brake", "booked", "2026-07-27", false, "early-inspection", ""],
      ["inspection", "due", "2026-08-10", true, "", "early-inspection"],
      ["brake", "due", "2026-08-10", true, "", "early-inspection"],
    ]
  );
  assert.equal(events.some((event) => event.status === "requested" && event.date === "2026-10-05"), true);
});

test("planner shows canonical requested TEST requirements in their legal due week", () => {
  const vehicle = {
    id: "test-hgv",
    category: "HGV",
    registration: "TE5T",
    nextPMI: "2026-08-07",
    nextBrakeTest: "2026-08-07",
    nextMOT: "2026-08-07",
    nextService: "2026-08-07",
  };
  const requested = [
    {
      id: "test-inspection",
      vehicleId: vehicle.id,
      status: "Requested",
      requirementKey: "maintenance-requirement-v1|company|test-hgv|pmi:2026-08-07,brake_test:2026-08-07",
      maintenanceTypeIds: ["pmi", "brake_test"],
      items: [
        { maintenanceTypeId: "pmi", status: "requested", legalDueDateISO: "2026-08-07" },
        { maintenanceTypeId: "brake_test", status: "requested", legalDueDateISO: "2026-08-07" },
      ],
    },
    ...["mot", "service"].map((maintenanceTypeId) => ({
      id: `test-${maintenanceTypeId}`,
      vehicleId: vehicle.id,
      status: "Requested",
      requirementKey: `maintenance-requirement-v1|company|test-hgv|${maintenanceTypeId}:2026-08-07`,
      maintenanceTypeIds: [maintenanceTypeId],
      items: [{ maintenanceTypeId, status: "requested", legalDueDateISO: "2026-08-07" }],
    })),
  ];

  const events = buildLivePlannerEvents({
    vehicles: [vehicle],
    bookings: requested,
    year: 2026,
    registrations: [vehicle.registration],
    asOfDate: "2026-08-05",
  });
  const canonicalEvents = events.filter((event) => event.source === "maintenance_booking");

  assert.deepEqual(
    canonicalEvents.map((event) => [event.type, event.status, event.date, event.week]),
    [
      ["inspection", "requested", "2026-08-07", 32],
      ["brake", "requested", "2026-08-07", 32],
      ["mot", "requested", "2026-08-07", 32],
      ["service", "requested", "2026-08-07", 32],
    ]
  );
  assert.ok(canonicalEvents.every((event) => event.legalDueDateISO === "2026-08-07"));
  assert.ok(canonicalEvents.every((event) => event.appointmentDateISO === ""));
  assert.equal(events.some((event) => event.source === "year_ahead_forecast"), true);
});

test("planner keeps the current combined inspection and removes the older requested PMI", () => {
  const vehicle = {
    id: "duplicate-inspection-hgv",
    category: "HGV",
    registration: "DUP1",
    nextPMI: "2026-10-02",
    nextBrakeTest: "2026-10-02",
  };
  const events = buildLivePlannerEvents({
    vehicles: [vehicle],
    bookings: [
      {
        id: "old-requested-pmi",
        vehicleId: vehicle.id,
        status: "Requested",
        maintenanceTypeIds: ["pmi"],
        items: [
          { maintenanceTypeId: "pmi", status: "requested", legalDueDateISO: "2026-10-02" },
        ],
      },
      {
        id: "current-combined-inspection",
        vehicleId: vehicle.id,
        status: "Booked",
        maintenanceTypeIds: ["pmi", "brake_test"],
        bookingDates: ["2026-09-30"],
        items: [
          { maintenanceTypeId: "pmi", status: "booked", legalDueDateISO: "2026-10-02" },
          { maintenanceTypeId: "brake_test", status: "booked", legalDueDateISO: "2026-10-02" },
        ],
      },
    ],
    year: 2026,
    registrations: [vehicle.registration],
    asOfDate: "2026-08-20",
  });

  assert.deepEqual(
    events
      .filter((event) => event.source === "maintenance_booking")
      .map((event) => [event.type, event.status, event.date, event.bookingId]),
    [
      ["inspection", "booked", "2026-09-30", "current-combined-inspection"],
      ["brake", "booked", "2026-09-30", "current-combined-inspection"],
    ]
  );
});

test("planner prefers a requested combined PMI and brake inspection over a standalone PMI request", () => {
  const vehicle = {
    id: "requested-duplicate-hgv",
    category: "HGV",
    registration: "DUP2",
    nextPMI: "2026-10-02",
    nextBrakeTest: "2026-10-02",
  };
  const events = buildLivePlannerEvents({
    vehicles: [vehicle],
    bookings: [
      {
        id: "standalone-requested-pmi",
        vehicleId: vehicle.id,
        status: "Requested",
        maintenanceTypeIds: ["pmi"],
        items: [
          { maintenanceTypeId: "pmi", status: "requested", legalDueDateISO: "2026-10-02" },
        ],
      },
      {
        id: "requested-combined-inspection",
        vehicleId: vehicle.id,
        status: "Requested",
        maintenanceTypeIds: ["pmi", "brake_test"],
        items: [
          { maintenanceTypeId: "pmi", status: "requested", legalDueDateISO: "2026-10-01" },
          { maintenanceTypeId: "brake_test", status: "requested", legalDueDateISO: "2026-10-01" },
        ],
      },
    ],
    year: 2026,
    registrations: [vehicle.registration],
    asOfDate: "2026-08-20",
  });

  assert.deepEqual(
    events
      .filter((event) => event.source === "maintenance_booking")
      .map((event) => [event.type, event.status, event.date, event.bookingId]),
    [
      ["inspection", "requested", "2026-10-01", "requested-combined-inspection"],
      ["brake", "requested", "2026-10-01", "requested-combined-inspection"],
    ]
  );
});

test("planner prefers a canonical completed booking over its linked vehicle-history copy", () => {
  const events = buildLivePlannerEvents({
    vehicles: [{
      id: "low-loader-1",
      category: "HGV",
      registration: "AY65LNO",
      motHistory: [
        { completedDate: "2026-05-18", bookingId: "mot-booking-1", source: "booking" },
      ],
      dvsaMotTests: [
        { completedDate: "2026-04-29", testResult: "PASSED" },
      ],
    }],
    bookings: [{
      id: "mot-booking-1",
      vehicleId: "low-loader-1",
      status: "Completed",
      maintenanceTypeIds: ["mot"],
      startDateISO: "2026-05-18",
      endDateISO: "2026-05-20",
      items: [{
        maintenanceTypeId: "mot",
        status: "completed",
        completionDateISO: "2026-05-20",
      }],
    }],
    year: 2026,
    registrations: ["AY65LNO"],
    asOfDate: "2026-08-05",
  });

  const motEvents = events.filter((event) => event.type === "mot");
  assert.deepEqual(motEvents.map((event) => event.date), ["2026-04-29", "2026-05-20"]);
  assert.equal(motEvents[1].source, "maintenance_booking");
  assert.equal(motEvents[1].bookingId, "mot-booking-1");
});

test("planner summaries count distinct inspection requirements by legal due date", () => {
  const summary = summarizeInspectionRequirements([
    { type: "inspection", status: "requested", registration: "TE5T", requirementKey: "req-test", legalDueDateISO: "2026-08-07" },
    { type: "brake", status: "requested", registration: "TE5T", requirementKey: "req-test", legalDueDateISO: "2026-08-07" },
    { type: "inspection", status: "booked", registration: "HGV1", requirementKey: "req-booked", legalDueDateISO: "2026-08-04", date: "2026-08-12" },
    { type: "inspection", status: "completed", registration: "OLD", requirementKey: "req-complete", legalDueDateISO: "2026-08-01" },
    { type: "mot", status: "requested", registration: "TE5T", requirementKey: "req-mot", legalDueDateISO: "2026-08-07" },
  ], "2026-08-05");

  assert.deepEqual(summary, { dueSoon: 1, overdue: 1 });
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
  assert.equal(events.some((event) => event.status === "requested"), true);
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
        items: [
          { maintenanceTypeId: "pmi", status: "booked", legalDueDateISO: "2026-09-21" },
          { maintenanceTypeId: "brake_test", status: "booked", legalDueDateISO: "2026-09-21" },
        ],
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
    events
      .filter((event) => event.status === "booked")
      .map((event) => [event.type, event.status, event.date]),
    [
      ["inspection", "booked", "2026-09-28"],
      ["brake", "booked", "2026-09-28"],
      ["mot", "booked", "2026-10-01"],
      ["service", "booked", "2026-10-02"],
    ]
  );
  assert.equal(events[0].legalDueDateISO, "2026-09-21");
  assert.equal(events[0].appointmentDateISO, "2026-09-28");
  assert.equal(
    events.some(
      (event) => event.source === "year_ahead_forecast" && event.date === "2026-11-23"
    ),
    true
  );
});

test("deferred planner records use a workshop date when present and otherwise retain the legal due date", () => {
  const vehicle = { id: "hgv-deferred", category: "HGV", registration: "DEFER1" };
  const events = buildLivePlannerEvents({
    vehicles: [vehicle],
    bookings: [
      {
        id: "deferred-pmi",
        vehicleId: vehicle.id,
        status: "Deferred",
        requirementKey: "deferred-pmi-key",
        maintenanceTypeIds: ["pmi"],
        appointmentDateISO: "2026-09-04",
        items: [{ maintenanceTypeId: "pmi", status: "deferred", legalDueDateISO: "2026-08-28" }],
      },
      {
        id: "deferred-service",
        vehicleId: vehicle.id,
        status: "Deferred",
        requirementKey: "deferred-service-key",
        maintenanceTypeIds: ["service"],
        items: [{ maintenanceTypeId: "service", status: "deferred", legalDueDateISO: "2026-08-21" }],
      },
    ],
    year: 2026,
    registrations: [vehicle.registration],
    asOfDate: "2026-08-05",
  });

  assert.deepEqual(
    events.map((event) => [event.type, event.status, event.date, event.legalDueDateISO]),
    [
      ["service", "deferred", "2026-08-21", "2026-08-21"],
      ["inspection", "due", "2026-08-28", "2026-08-28"],
      ["inspection", "deferred", "2026-09-04", "2026-08-28"],
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

  assert.equal(
    events.some((event) => ["due", "projected", "requested"].includes(event.status)),
    false
  );
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

test("historic VOR periods shade only overlapping ISO weeks while the vehicle is Active", () => {
  const vehicle = {
    category: "HGV",
    operationalStatus: "Active",
    vorHistory: [{
      id: "historic-vor-1",
      status: "closed",
      source: "historic_migration",
      offRoadDate: "2026-07-01",
      returnedDate: "2026-07-15",
    }],
  };

  assert.equal(vorHistoryStatusForIsoWeek(vehicle, 2026, 26), "");
  assert.equal(vorHistoryStatusForIsoWeek(vehicle, 2026, 27), "VOR");
  assert.equal(vorHistoryStatusForIsoWeek(vehicle, 2026, 28), "VOR");
  assert.equal(vorHistoryStatusForIsoWeek(vehicle, 2026, 29), "VOR");
  assert.equal(vorHistoryStatusForIsoWeek(vehicle, 2026, 30), "");
  assert.equal(vehicleStatusForIsoWeek(vehicle, "ACTIVE", 2026, 28), "VOR");
  assert.equal(vehicleStatusForIsoWeek(vehicle, "ACTIVE", 2026, 30), "");
  assert.equal(vorHistoryPeriodsForIsoWeek(vehicle, 2026, 28)[0].id, "historic-vor-1");
  assert.equal(isVorPeriodStartingInIsoWeek(vehicle.vorHistory[0], 2026, 27), true);
  assert.equal(isVorPeriodStartingInIsoWeek(vehicle.vorHistory[0], 2026, 28), false);
});

test("duplicate VOR history records produce one planner period", () => {
  const duplicatedPeriod = {
    id: "vor-compliance-vor-2026-07-31",
    status: "open",
    offRoadDate: "2026-07-31",
  };
  const vehicle = {
    category: "HGV",
    operationalStatus: "VOR",
    vorHistory: [duplicatedPeriod, { ...duplicatedPeriod }],
  };

  const periods = vorHistoryPeriodsForIsoWeek(vehicle, 2026, 31);
  assert.equal(periods.length, 1);
  assert.equal(periods[0].id, duplicatedPeriod.id);
});

test("a pending return inspection suppresses VOR only in its scheduled ISO week", () => {
  const vehicle = {
    category: "HGV",
    operationalStatus: "VOR",
    pendingReturnInspection: {
      status: "inspection_required",
      inspectionDate: "2026-08-07",
    },
    vorHistory: [{
      id: "open-vor-1",
      status: "open",
      offRoadDate: "2026-07-31",
    }],
  };

  assert.equal(isReturnInspectionScheduledForIsoWeek(vehicle, 2026, 31), false);
  assert.equal(isReturnInspectionScheduledForIsoWeek(vehicle, 2026, 32), true);
  assert.equal(vehicleStatusForIsoWeek(vehicle, "VOR", 2026, 31), "VOR");
  assert.equal(vehicleStatusForIsoWeek(vehicle, "VOR", 2026, 32), "");
  assert.equal(vehicleStatusForIsoWeek(vehicle, "VOR", 2026, 33), "VOR");
  assert.equal(hgvComplianceStatusForIsoWeek(vehicle, "VOR", 2026, 32), "");

  const completedVehicle = {
    ...vehicle,
    operationalStatus: "Active",
    pendingReturnInspection: null,
    vorHistory: [{
      id: "closed-vor-1",
      status: "closed",
      offRoadDate: "2026-07-31",
      returnedDate: "2026-08-06",
      firstUseInspectionDate: "2026-08-07",
    }],
  };
  assert.equal(isReturnInspectionScheduledForIsoWeek(completedVehicle, 2026, 32), true);
  assert.equal(vehicleStatusForIsoWeek(completedVehicle, "ACTIVE", 2026, 31), "VOR");
  assert.equal(vehicleStatusForIsoWeek(completedVehicle, "ACTIVE", 2026, 32), "");
});

test("historic VOR week status crosses ISO years and ignores archived periods", () => {
  const vehicle = {
    category: "HGV",
    operationalStatus: "Active",
    vorHistory: [
      {
        id: "year-boundary-vor",
        status: "closed",
        offRoadDate: "2026-12-30",
        returnedDate: "2027-01-05",
      },
      {
        id: "archived-vor",
        status: "archived",
        offRoadDate: "2027-01-11",
        returnedDate: "2027-01-17",
      },
    ],
  };

  assert.equal(vorHistoryStatusForIsoWeek(vehicle, 2026, 53), "VOR");
  assert.equal(vorHistoryStatusForIsoWeek(vehicle, 2027, 1), "VOR");
  assert.equal(vorHistoryStatusForIsoWeek(vehicle, 2027, 2), "");
});

test("weekly historic VOR status remains separate from current compliance status", () => {
  const vehicle = {
    category: "HGV",
    operationalStatus: "Active",
    nextPMI: "2026-09-30",
    nextBrakeTest: "2026-09-30",
    nextMOT: "2026-09-30",
    vorHistory: [{
      status: "closed",
      offRoadDate: "2026-06-29",
      returnedDate: "2026-07-05",
    }],
  };

  assert.equal(hgvComplianceStatusForIsoWeek(vehicle, "ACTIVE", 2026, 27), "VOR");
  assert.equal(hgvComplianceStatusForIsoWeek(vehicle, "ACTIVE", 2026, 28), "");
});

test("realtime vehicle updates refresh VOR state without overwriting unsaved form fields", () => {
  const localVehicle = {
    id: "vehicle-1",
    name: "Unsaved edited name",
    notes: "Unsaved notes",
    operationalStatus: "Active",
    vorHistory: [],
  };
  const remoteVehicle = {
    id: "vehicle-1",
    name: "Stored name",
    notes: "Stored notes",
    operationalStatus: "VOR",
    vorHistory: [{ id: "vor-1", status: "open", offRoadDate: "2026-08-05" }],
  };

  assert.deepEqual(mergeVehicleRealtimeState(localVehicle, remoteVehicle), {
    ...localVehicle,
    operationalStatus: "VOR",
    vorHistory: remoteVehicle.vorHistory,
  });
});

test("realtime views ignore pending local writes and apply confirmed snapshots", () => {
  assert.equal(shouldApplyRealtimeSnapshot({ hasPendingWrites: true }), false);
  assert.equal(shouldApplyRealtimeSnapshot({ hasPendingWrites: false }), true);
  assert.equal(shouldApplyRealtimeSnapshot({}), true);
});

test("historic VOR corrections retain previous values and audit identity", () => {
  const original = buildHistoricVorPeriod({
    id: "historic-vor-1",
    registration: "R400PBC",
    offRoadDate: "2026-06-01",
    returnedDate: "2026-06-08",
    offRoadOdometer: "1000",
    returnOdometer: "1050",
    approvedBy: "Original approver",
    approvedPosition: "Transport manager",
    removedBy: "Original return authoriser",
    removedPosition: "Director",
    reason: "Original reason",
    migratedBy: { uid: "user-1", name: "Importer", email: "importer@example.com" },
  });
  const corrected = correctHistoricVorPeriod(
    original,
    { returnedDate: "2026-06-10", returnOdometer: "1075" },
    {
      reason: "Return date entered incorrectly",
      correctedAt: "2026-08-05T10:00:00.000Z",
      correctedBy: { uid: "admin-1", name: "Admin", email: "admin@example.com" },
    }
  );

  assert.equal(corrected.returnedDate, "2026-06-10");
  assert.equal(corrected.returnOdometer, "1075");
  assert.equal(corrected.durationDays, 9);
  assert.equal(corrected.migratedAt, original.migratedAt);
  assert.equal(corrected.auditHistory.length, 1);
  assert.equal(corrected.auditHistory[0].action, "corrected");
  assert.equal(corrected.auditHistory[0].previous.returnedDate, "2026-06-08");
  assert.equal(corrected.auditHistory[0].previous.returnOdometer, "1050");
});

test("historic VOR archival is non-destructive and requires a reason", () => {
  const original = buildHistoricVorPeriod({
    id: "historic-vor-archive",
    registration: "R400PBC",
    offRoadDate: "2026-05-01",
    returnedDate: "2026-05-05",
    approvedBy: "Approver",
    approvedPosition: "Transport manager",
    removedBy: "Return authoriser",
    removedPosition: "Director",
    reason: "Workshop repair",
  });
  const archived = archiveHistoricVorPeriod(original, {
    reason: "Duplicate migrated period",
    archivedAt: "2026-08-05T10:15:00.000Z",
    archivedBy: { uid: "admin-1", name: "Admin" },
  });

  assert.equal(archived.status, "archived");
  assert.equal(archived.offRoadDate, original.offRoadDate);
  assert.equal(archived.returnedDate, original.returnedDate);
  assert.equal(archived.auditHistory[0].previous.reason, "Workshop repair");
  assert.throws(
    () => archiveHistoricVorPeriod(original, { reason: "" }),
    /reason for archiving/i
  );
});

test("admins can correct or archive a closed automatic compliance VOR without deleting evidence", () => {
  const automatic = {
    id: "compliance-vor-2026-07-31",
    status: "closed",
    source: "automatic_compliance",
    registration: "R400PBC",
    offRoadDate: "2026-07-31",
    returnedDate: "2026-08-05",
    firstUseInspectionDate: "2026-05-05",
    offRoadOdometer: "594574",
    returnOdometer: "594574",
    approvedBy: "HGV compliance system",
    approvedPosition: "Automated compliance control",
    removedBy: "mb",
    removedPosition: "mb",
    reason: "Automatic compliance VOR: PMI, BRAKE TEST",
  };
  const corrected = correctHistoricVorPeriod(
    automatic,
    { firstUseInspectionDate: "2026-08-05" },
    { reason: "Corrected first-use date", correctedBy: { uid: "admin-1" } }
  );

  assert.equal(corrected.firstUseInspectionDate, "2026-08-05");
  assert.equal(corrected.source, "automatic_compliance");
  assert.equal(corrected.migrated, false);
  assert.equal(corrected.auditHistory[0].previous.firstUseInspectionDate, "2026-05-05");

  const archived = archiveHistoricVorPeriod(automatic, {
    reason: "Test compliance period created in error",
    archivedBy: { uid: "admin-1" },
  });
  assert.equal(archived.status, "archived");
  assert.equal(archived.offRoadDate, "2026-07-31");
  assert.equal(archived.auditHistory[0].previous.status, "closed");
});

test("VOR transitions reject contradictory open periods", () => {
  const vehicle = {
    operationalStatus: "VOR",
    activeVorRecordId: "vor-1",
    vorHistory: [{ id: "vor-1", status: "open", offRoadDate: "2026-08-01" }],
  };

  assert.throws(
    () => startVehicleVorPeriod(vehicle, { offRoadDate: "2026-08-05" }),
    /already has an open/i
  );
  assert.equal(assertVorHistoryIntegrity(vehicle), true);
  assert.throws(
    () => assertVorHistoryIntegrity({
      vorHistory: [
        { id: "one", status: "open", offRoadDate: "2026-08-01" },
        { id: "two", status: "open", offRoadDate: "2026-08-02" },
      ],
    }),
    /contradictory open/i
  );
});

test("historic VOR additions cannot overlap retained evidence", () => {
  const vehicle = {
    operationalStatus: "Active",
    vorHistory: [{
      id: "existing",
      status: "closed",
      offRoadDate: "2026-06-01",
      returnedDate: "2026-06-10",
    }],
  };

  assert.throws(
    () => addHistoricVorPeriod(vehicle, {
      id: "overlap",
      offRoadDate: "2026-06-05",
      returnedDate: "2026-06-12",
      reason: "Imported correction",
    }),
    /overlaps the existing period/i
  );
  assert.equal(vehicle.vorHistory.length, 1);
});

test("VOR history has no maintenance booking side effects", () => {
  const maintenanceBookings = [{ id: "booking-1", status: "Booked", vehicleId: "vehicle-1" }];
  const vehicle = {
    id: "vehicle-1",
    operationalStatus: "Active",
    vorHistory: [],
  };
  const updated = addHistoricVorPeriod(vehicle, {
    id: "historic-only",
    offRoadDate: "2026-05-01",
    returnedDate: "2026-05-03",
    reason: "Historic evidence",
  });

  assert.equal(updated.vorHistory.length, 1);
  assert.deepEqual(maintenanceBookings, [{ id: "booking-1", status: "Booked", vehicleId: "vehicle-1" }]);
  assert.equal(Object.prototype.hasOwnProperty.call(updated, "maintenanceBookings"), false);
});

test("historic VOR lifecycle updates timeline and planner without changing current status or maintenance dates", () => {
  const original = {
    id: "vehicle-e2e",
    registration: "E2EVOR",
    operationalStatus: "Active",
    fleetStatus: "Active",
    nextPMI: "2026-09-28",
    nextBrakeTest: "2026-09-28",
    nextMOT: "2027-03-01",
    vorHistory: [],
  };
  const added = addHistoricVorPeriod(original, {
    id: "historic-e2e",
    registration: "E2EVOR",
    offRoadDate: "2026-07-01",
    returnedDate: "2026-07-15",
    approvedBy: "Transport Manager",
    approvedPosition: "Transport Manager",
    removedBy: "Fleet Manager",
    removedPosition: "Fleet Manager",
    reason: "Historic workshop repair",
  });

  assert.equal(added.operationalStatus, "Active");
  assert.equal(added.nextPMI, original.nextPMI);
  assert.equal(added.nextBrakeTest, original.nextBrakeTest);
  assert.equal(added.nextMOT, original.nextMOT);
  assert.equal(buildVorTimelineEvents(added).some((event) => event.sourceRecordId === "historic-e2e"), true);
  assert.equal(vorHistoryStatusForIsoWeek(added, 2026, 27), "VOR");
  assert.equal(vorHistoryStatusForIsoWeek(added, 2026, 29), "VOR");

  const corrected = correctVehicleHistoricVorPeriod(
    added,
    "historic-e2e",
    { returnedDate: "2026-07-12" },
    { reason: "Corrected from source document", correctedBy: { uid: "admin" } }
  );
  const realtimeCorrected = mergeVehicleRealtimeState(added, corrected);
  assert.equal(realtimeCorrected.vorHistory[0].returnedDate, "2026-07-12");
  assert.equal(vorHistoryStatusForIsoWeek(realtimeCorrected, 2026, 29), "");
  assert.equal(realtimeCorrected.operationalStatus, "Active");

  const archived = archiveVehicleHistoricVorPeriod(corrected, "historic-e2e", {
    reason: "Duplicate historic evidence",
    archivedBy: { uid: "admin" },
  });
  const realtimeArchived = mergeVehicleRealtimeState(corrected, archived);
  assert.equal(realtimeArchived.vorHistory[0].status, "archived");
  assert.equal(vorHistoryStatusForIsoWeek(realtimeArchived, 2026, 27), "");
  assert.equal(buildVorTimelineEvents(realtimeArchived).length, 0);
  assert.equal(realtimeArchived.nextPMI, original.nextPMI);
  assert.equal(realtimeArchived.nextBrakeTest, original.nextBrakeTest);
});

test("historic VOR first-use dates create a canonical combined inspection booking intent", () => {
  const intent = historicVorFirstUseBookingIntent(
    { id: "vehicle-r400", name: "Low Loader 02/U-C", registration: "R400 PBC" },
    { id: "historic-r400", firstUseInspectionDate: "2026-08-07" }
  );

  assert.deepEqual(intent.maintenanceTypeIds, ["pmi", "brake_test"]);
  assert.equal(intent.status, "Booked");
  assert.equal(intent.appointmentDateISO, "2026-08-07");
  assert.equal(intent.sourceDueDateISO, "2026-08-07");
  assert.equal(intent.sourceVorPeriodId, "historic-r400");
  assert.match(intent.sourceDueKey, /historic-vor-first-use:vehicle-r400:historic-r400:2026-08-07/);
  assert.equal(historicVorFirstUseBookingIntent({ id: "vehicle-r400" }, { id: "historic-r400" }), null);
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
