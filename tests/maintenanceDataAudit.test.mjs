import assert from "node:assert/strict";
import test from "node:test";

import {
  auditMaintenanceDataset,
  buildFuturePmiHistoryCleanupPatch,
  buildFuturePmiHistoryCleanupPreview,
  buildFutureMaintenanceResetPreview,
} from "../src/app/utils/maintenanceDataAudit.js";

test("maintenance audit reports invalid, orphaned, conflicting and duplicate records", () => {
  const report = auditMaintenanceDataset({
    forecastYear: 2026,
    vehicles: [{ id: "vehicle-1", nextPMI: "2026-08-10" }],
    maintenanceBookings: [
      {
        id: "booking-1",
        vehicleId: "vehicle-1",
        type: "INSPECTION",
        maintenanceTypeIds: ["pmi"],
        status: "Booked",
        appointmentDateISO: "2026-08-04",
        sourceDueDateISO: "2026-08-03",
        sourceDueKey: "pmi__vehicle-1__2026-08-03",
      },
      {
        id: "booking-2",
        vehicleId: "vehicle-1",
        type: "INSPECTION",
        maintenanceTypeIds: ["pmi"],
        status: "Booked",
        appointmentDateISO: "2026-08-04",
        sourceDueDateISO: "2026-08-03",
        sourceDueKey: "pmi__vehicle-1__2026-08-03",
      },
      {
        id: "booking-3",
        vehicleId: "missing-vehicle",
        type: "SERVICE",
        status: "Booked",
      },
    ],
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.summary.duplicateGroupCount, 1);
  assert.equal(report.summary.orphanVehicleCount, 1);
  assert.equal(report.summary.dueDateConflictCount, 2);
  assert.equal(report.summary.invalidRecordCount, 1);
  assert.equal(report.summary.automaticPatchCount, 1);
  assert.equal(report.summary.missingRequestedRecordCount, 1);
  assert.equal(report.summary.manualReviewCount, 3);
  assert.deepEqual(report.orphanVehicleIds, ["missing-vehicle"]);
});

test("maintenance reconciliation terminally cancels existing VOR inspection plans once", () => {
  const vehicle = {
    id: "vor-vehicle",
    operationalStatus: "VOR",
    fleetStatus: "VOR",
    vehicleStatus: "VOR",
    activeVorRecordId: "vor-record",
    vorHistory: [{ id: "vor-record", status: "open", offRoadDate: "2026-08-02" }],
    nextPMI: "2026-08-10",
    nextBrakeTest: "2026-08-10",
  };
  const booking = {
    id: "old-inspection",
    vehicleId: "vor-vehicle",
    type: "INSPECTION",
    maintenanceTypeIds: ["pmi", "brake_test"],
    status: "Booked",
    appointmentDateISO: "2026-08-10",
  };
  const first = auditMaintenanceDataset({
    vehicles: [vehicle],
    maintenanceBookings: [booking],
    forecastYear: 2026,
  });
  assert.equal(first.vorInspectionCancellationCandidates.length, 1);
  assert.equal(first.vorInspectionCancellationCandidates[0].automaticPatch.status, "Cancelled");

  const repairedBooking = {
    ...booking,
    ...first.vorInspectionCancellationCandidates[0].automaticPatch,
  };
  const second = auditMaintenanceDataset({
    vehicles: [vehicle],
    maintenanceBookings: [repairedBooking],
    forecastYear: 2026,
  });
  assert.equal(second.vorInspectionCancellationCandidates.length, 0);
});

test("maintenance audit previews safe repairs for legacy VOR-shifted compliance dates", () => {
  const report = auditMaintenanceDataset({
    vehicles: [
      {
        id: "vehicle-vor",
        maintenanceCountdownPause: { status: "resumed", durationDays: 14 },
        pmiFreq: 8,
        brakeTestFreq: 8,
        nextPMI: "2026-09-15",
        nextBrakeTest: "2026-09-15",
        nextMOT: "2027-02-01",
        pmiHistory: [{ completedDate: "2026-07-01", source: "booking" }],
        brakeTestHistory: [{ completedDate: "2026-07-02", source: "booking" }],
        dvsaMotTests: [
          { testResult: "PASSED", completedDate: "2026-01-10", expiryDate: "2027-01-09" },
        ],
      },
    ],
  });

  const repair = report.reconciliationPreview.find(
    (item) => item.action === "repair_legacy_vor_shifted_due_dates"
  );
  assert.equal(report.readOnly, true);
  assert.equal(report.summary.automaticPatchCount, 2);
  assert.equal(report.summary.missingRequestedRecordCount, 1);
  assert.equal(repair.automaticPatch.nextPMI, "2026-08-26");
  assert.equal(repair.automaticPatch.nextBrakeTest, "2026-08-27");
  assert.equal(repair.automaticPatch.nextMOT, "2027-01-09");
});

test("maintenance audit groups same-week PMI and brake requirements into one idempotent request", () => {
  const input = {
    forecastYear: 2026,
    vehicles: [{
      id: "vehicle-combined",
      companyId: "company-1",
      name: "HGV Test",
      nextPMI: "2026-08-03",
      nextBrakeTest: "2026-08-07",
    }],
  };
  const first = auditMaintenanceDataset(input);
  const second = auditMaintenanceDataset(input);
  assert.equal(first.requestedRecordCandidates.length, 1);
  assert.equal(first.requestedRecordCandidates[0].action, "create_missing_booked_appointment");
  assert.equal(first.requestedRecordCandidates[0].automaticPatch.status, "Booked");
  assert.deepEqual(first.requestedRecordCandidates[0].automaticPatch.bookingDates, ["2026-08-03"]);
  assert.deepEqual(
    first.requestedRecordCandidates[0].automaticPatch.items
      .map((item) => item.maintenanceTypeId)
      .sort(),
    ["brake_test", "pmi"]
  );
  assert.equal(
    first.requestedRecordCandidates[0].documentId,
    second.requestedRecordCandidates[0].documentId
  );
});

test("maintenance audit only proposes a legacy link for one exact canonical match", () => {
  const report = auditMaintenanceDataset({
    vehicles: [{ id: "vehicle-1" }],
    maintenanceBookings: [{
      id: "canonical-1",
      vehicleId: "vehicle-1",
      type: "WORK",
      maintenanceTypeIds: ["repair"],
      status: "Booked",
      appointmentDateISO: "2026-08-03",
      sourceDueDateISO: "2026-08-03",
    }],
    maintenanceJobs: [{
      id: "legacy-1",
      assetId: "vehicle-1",
      type: "repair",
      plannedDate: "2026-08-03",
    }],
  });
  assert.equal(report.exactLegacyJobLinks.length, 1);
  assert.deepEqual(report.exactLegacyJobLinks[0].automaticPatch, {
    canonicalMaintenanceBookingId: "canonical-1",
  });
});

test("future schedule reset is read-only and protects manual, moved and terminal records", () => {
  const preview = buildFutureMaintenanceResetPreview({
    asOfDate: "2026-08-03",
    forecastYears: [2026],
    vehicles: [{
      id: "hgv-1",
      companyId: "company-1",
      nextPMI: "2026-09-28",
      nextBrakeTest: "2026-09-28",
      pmiFreq: 8,
      brakeTestFreq: 8,
      pmiHistory: [{ completedDate: "2026-09-01", source: "maintenance_booking" }],
    }],
    maintenanceBookings: [
      {
        id: "auto-future",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["pmi", "brake_test"],
        status: "Booked",
        bookingDates: ["2026-09-28"],
        sourceDueDateISO: "2026-09-28",
        origin: { source: "automatic_schedule" },
      },
      {
        id: "auto-later-inspection",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["pmi", "brake_test"],
        status: "Booked",
        bookingDates: ["2026-11-23"],
        sourceDueDateISO: "2026-11-23",
        origin: { source: "automatic_schedule" },
      },
      {
        id: "moved-future",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["pmi", "brake_test"],
        status: "Booked",
        bookingDates: ["2026-11-24"],
        sourceDueDateISO: "2026-11-23",
        origin: { source: "automatic_schedule" },
        scheduleManuallyAdjusted: true,
      },
      {
        id: "edited-future",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["pmi", "brake_test"],
        status: "Booked",
        bookingDates: ["2026-11-23"],
        sourceDueDateISO: "2026-11-23",
        origin: { source: "automatic_schedule" },
        history: [{ action: "Edited", user: "person@example.com" }],
      },
      {
        id: "manual-future",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["service"],
        status: "Booked",
        bookingDates: ["2026-10-01"],
        sourceDueDateISO: "2026-10-01",
        origin: { source: "manual" },
      },
      {
        id: "manual-inspection",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["pmi"],
        status: "Booked",
        bookingDates: ["2026-10-03"],
        sourceDueDateISO: "2026-10-03",
        origin: { source: "manual" },
      },
      {
        id: "missing-origin-inspection",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["brake_test"],
        status: "Booked",
        bookingDates: ["2026-10-03"],
        sourceDueDateISO: "2026-10-03",
      },
      {
        id: "automatic-mot",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["mot"],
        status: "Booked",
        bookingDates: ["2026-10-04"],
        sourceDueDateISO: "2026-10-04",
        origin: { source: "automatic_schedule" },
      },
      {
        id: "automatic-tacho",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["tacho_download"],
        status: "Booked",
        bookingDates: ["2026-10-05"],
        sourceDueDateISO: "2026-10-05",
        origin: { source: "automatic_schedule" },
      },
      {
        id: "mixed-mot-inspection",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["mot", "pmi"],
        status: "Booked",
        bookingDates: ["2026-10-06"],
        sourceDueDateISO: "2026-10-06",
        origin: { source: "automatic_schedule" },
      },
      {
        id: "completed-future",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["pmi"],
        status: "Completed",
        bookingDates: ["2026-10-02"],
        sourceDueDateISO: "2026-10-02",
        origin: { source: "automatic_schedule" },
      },
      {
        id: "past-auto",
        vehicleId: "hgv-1",
        maintenanceTypeIds: ["pmi"],
        status: "Booked",
        bookingDates: ["2026-07-01"],
        sourceDueDateISO: "2026-07-01",
        origin: { source: "automatic_schedule" },
      },
    ],
  });

  assert.equal(preview.readOnly, true);
  assert.equal(preview.mode, "dry_run");
  assert.deepEqual(
    preview.archiveCandidates.map((item) => item.documentId),
    ["automatic-tacho", "auto-later-inspection"]
  );
  assert.deepEqual(
    preview.protectedRecords.map((item) => [item.documentId, item.protectionReason]),
    [
      ["moved-future", "manually_moved"],
      ["edited-future", "human_edited"],
      ["manual-inspection", "manual_or_unverified_source"],
      ["missing-origin-inspection", "manual_or_unverified_source"],
      ["completed-future", "terminal_completed"],
    ]
  );
  assert.deepEqual(
    preview.preservedCoreRecords.map((item) => item.documentId),
    ["manual-future", "automatic-mot", "mixed-mot-inspection"]
  );
  assert.deepEqual(preview.summary.archiveByType, [
    { key: "brake_test + pmi", count: 1 },
    { key: "tacho_download", count: 1 },
  ]);
  assert.deepEqual(
    preview.preservedInspectionRecords.map((item) => item.documentId),
    ["auto-future"]
  );
  assert.equal(preview.summary.rebuildCandidateCount, 0);
  assert.equal(preview.futureCompletionAnomalies.length, 1);
  assert.equal(preview.futureCompletionAnomalies[0].completionDateISO, "2026-09-01");
  assert.deepEqual(preview.rebuildCandidates, []);
  assert.equal("automaticPatch" in preview.archiveCandidates[0], false);
});

test("future schedule cleanup keeps the nearest inspection and is idempotent", () => {
  const vehicles = [{
    id: "hgv-1",
    companyId: "company-1",
    nextPMI: "2026-09-28",
    nextBrakeTest: "2026-09-28",
    pmiFreq: 8,
    brakeTestFreq: 8,
  }];
  const originalBookings = ["2026-09-28", "2026-11-23", "2027-01-18"].map((date, index) => ({
    id: `legacy-auto-inspection-${index + 1}`,
    vehicleId: "hgv-1",
    maintenanceTypeIds: ["pmi", "brake_test"],
    status: "Booked",
    bookingDates: [date],
    sourceDueDateISO: date,
    origin: { source: "automatic_schedule" },
  }));
  const first = buildFutureMaintenanceResetPreview({
    asOfDate: "2026-08-03",
    forecastYears: [2026],
    vehicles,
    maintenanceBookings: originalBookings,
  });
  assert.deepEqual(
    first.preservedInspectionRecords.map((item) => item.documentId),
    ["legacy-auto-inspection-1"]
  );
  assert.deepEqual(
    first.archiveCandidates.map((item) => item.documentId),
    ["legacy-auto-inspection-2", "legacy-auto-inspection-3"]
  );
  assert.equal(first.rebuildCandidates.length, 0);

  const archivedIds = new Set(first.archiveCandidates.map((candidate) => candidate.documentId));
  const rebuiltBookings = originalBookings.map((booking) =>
    archivedIds.has(booking.id) ? { ...booking, status: "Archived" } : booking
  );
  const second = buildFutureMaintenanceResetPreview({
    asOfDate: "2026-08-03",
    forecastYears: [2026],
    vehicles,
    maintenanceBookings: rebuiltBookings,
  });
  assert.equal(second.archiveCandidates.length, 0);
  assert.equal(second.rebuildCandidates.length, 0);
  assert.deepEqual(
    second.preservedInspectionRecords.map((item) => item.documentId),
    ["legacy-auto-inspection-1"]
  );
});

test("future schedule cleanup deterministically prefers a combined inspection on the nearest date", () => {
  const booking = (id, maintenanceTypeIds, date) => ({
    id,
    vehicleId: "hgv-1",
    maintenanceTypeIds,
    status: "Booked",
    bookingDates: [date],
    sourceDueDateISO: date,
    origin: { source: "automatic_schedule" },
  });
  const preview = buildFutureMaintenanceResetPreview({
    asOfDate: "2026-08-03",
    maintenanceBookings: [
      booking("nearest-pmi", ["pmi"], "2026-09-28"),
      booking("nearest-combined", ["pmi", "brake_test"], "2026-09-28"),
      booking("later-combined", ["pmi", "brake_test"], "2026-11-23"),
    ],
  });

  assert.deepEqual(
    preview.preservedInspectionRecords.map((item) => item.documentId),
    ["nearest-combined"]
  );
  assert.deepEqual(
    preview.archiveCandidates.map((item) => item.documentId),
    ["nearest-pmi", "later-combined"]
  );
});

test("future PMI history cleanup removes only impossible PMI completions and archives exact copies", () => {
  const vehicle = {
    id: "hgv-history-1",
    pmiHistory: [
      { completedDate: "2026-08-10", bookingId: "future-pmi-1", notes: "false completion" },
      { completedDate: "2026-07-01", bookingId: "past-pmi-1", notes: "valid completion" },
    ],
    eightWeekInspectionHistory: [
      { completedDate: "2026-09-21", bookingId: "future-pmi-2", source: "legacy" },
    ],
    serviceHistory: [{ completedDate: "2026-10-01", bookingId: "future-service" }],
    motHistory: [{ completedDate: "2026-11-01", bookingId: "future-mot" }],
    lastPMI: "2026-09-21",
    eightWeekInspectionStart: "2026-09-21",
    nextPMI: "2026-08-10",
    nextEightWeekInspection: "2026-08-10",
  };

  const preview = buildFuturePmiHistoryCleanupPreview({
    vehicles: [vehicle],
    asOfDate: "2026-08-03",
  });
  assert.equal(preview.readOnly, true);
  assert.equal(preview.summary.candidateVehicleCount, 1);
  assert.equal(preview.summary.historyEntryCount, 2);
  assert.equal(preview.summary.futureMarkerFieldCount, 2);
  assert.equal(preview.summary.preservedNonPmiAnomalyCount, 2);
  assert.deepEqual(preview.candidates[0].affectedHistoryFields, [
    "eightWeekInspectionHistory",
    "pmiHistory",
  ]);

  const cleanup = buildFuturePmiHistoryCleanupPatch(vehicle, {
    asOfDate: "2026-08-03",
    archivedAt: "2026-08-03T16:30:00.000Z",
    actor: "admin@example.com",
  });
  assert.equal(cleanup.removedEntries.length, 2);
  assert.deepEqual(cleanup.patch.pmiHistory, [vehicle.pmiHistory[1]]);
  assert.deepEqual(cleanup.patch.eightWeekInspectionHistory, []);
  assert.equal(cleanup.patch.lastPMI, "2026-07-01");
  assert.equal(cleanup.patch.eightWeekInspectionStart, "2026-07-01");
  assert.equal("nextPMI" in cleanup.patch, false);
  assert.equal("nextEightWeekInspection" in cleanup.patch, false);
  assert.equal("serviceHistory" in cleanup.patch, false);
  assert.equal("motHistory" in cleanup.patch, false);
  assert.equal(cleanup.patch.archivedFuturePmiHistory.length, 2);
  assert.deepEqual(
    cleanup.patch.archivedFuturePmiHistory.map((entry) => entry.originalEntry),
    [vehicle.pmiHistory[0], vehicle.eightWeekInspectionHistory[0]]
  );

  const second = buildFuturePmiHistoryCleanupPreview({
    vehicles: [{ ...vehicle, ...cleanup.patch }],
    asOfDate: "2026-08-03",
  });
  assert.equal(second.summary.candidateVehicleCount, 0);
  assert.equal(second.summary.historyEntryCount, 0);
  assert.equal(second.summary.preservedNonPmiAnomalyCount, 2);

  const replayedVehicle = {
    ...vehicle,
    ...cleanup.patch,
    eightWeekInspectionHistory: [vehicle.eightWeekInspectionHistory[0]],
  };
  const repeatedCleanup = buildFuturePmiHistoryCleanupPatch(replayedVehicle, {
    asOfDate: "2026-08-03",
    archivedAt: "2026-08-03T16:45:00.000Z",
    actor: "admin@example.com",
  });
  assert.equal(repeatedCleanup.removedEntries.length, 1);
  assert.equal(repeatedCleanup.patch.archivedFuturePmiHistory.length, 2);
});

test("future PMI history cleanup repairs a future last-PMI marker without changing due dates", () => {
  const vehicle = {
    id: "hgv-marker-only",
    lastPMI: "2026-09-01",
    lastEightWeekInspection: "2026-09-01",
    pmiHistory: [{ completedDate: "2026-07-15", source: "maintenance_booking" }],
    nextPMI: "2026-08-31",
    nextEightWeekInspection: "2026-08-31",
  };
  const preview = buildFuturePmiHistoryCleanupPreview({
    vehicles: [vehicle],
    asOfDate: "2026-08-03",
  });
  assert.equal(preview.summary.historyEntryCount, 0);
  assert.equal(preview.summary.futureMarkerFieldCount, 2);
  assert.equal(preview.summary.candidateVehicleCount, 1);

  const cleanup = buildFuturePmiHistoryCleanupPatch(vehicle, {
    asOfDate: "2026-08-03",
    archivedAt: "2026-08-03T16:30:00.000Z",
  });
  assert.equal(cleanup.patch.lastPMI, "2026-07-15");
  assert.equal(cleanup.patch.lastEightWeekInspection, "2026-07-15");
  assert.equal("nextPMI" in cleanup.patch, false);
  assert.equal("nextEightWeekInspection" in cleanup.patch, false);
});
