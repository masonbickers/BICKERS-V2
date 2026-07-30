import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
} from "../src/app/utils/maintenanceSchema.js";
import {
  buildAdditionalMaintenanceCompletionPatch,
} from "../src/app/utils/additionalMaintenanceCompletion.js";
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
  startVehicleVorPeriod,
} from "../src/app/utils/vorPeriods.js";
import {
  buildVorTimelineEvents,
} from "../src/app/utils/vehicleTimelineEvents.js";

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

test("Active → VOR → Active stores a closed period and restarts first-use PMI", () => {
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
  assert.equal(vorVehicle.maintenanceCountdownPause.status, "paused");
  assert.equal(vorVehicle.vorHistory[0].status, "open");

  const activeVehicle = returnVehicleFromVor(
    vorVehicle,
    {
      returnedDate: "2026-07-15",
      odometer: "10840",
      removedBy: "Fleet Manager",
      removedPosition: "Transport Manager",
      signature: "Fleet Manager",
      firstUseInspectionDate: "2026-07-15",
    },
    { completedAt: "2026-07-15T10:00:00.000Z" }
  );

  assert.equal(activeVehicle.operationalStatus, "Active");
  assert.equal(activeVehicle.fleetStatus, "Active");
  assert.equal(activeVehicle.vehicleStatus, "Active");
  assert.equal(activeVehicle.vorHistory[0].status, "closed");
  assert.equal(activeVehicle.vorHistory[0].durationDays, 14);
  assert.equal(activeVehicle.lastPMI, "2026-07-15");
  assert.equal(activeVehicle.nextPMI, "2026-09-09");
  assert.equal(activeVehicle.pmiHistory[0].maintenanceTypeId, "pmi");
  assert.equal(activeVehicle.pmiHistory[0].source, "vor_return");
});

test("maintenance schedules pause for the exact VOR duration", () => {
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
    ["booking-pmi"]
  );
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
