import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPlannerRegistrationOrder,
  buildPlannerMaintenanceModalEvent,
  importedPlannerEventKey,
  isImportedPlannerEventHidden,
  isComplianceVorStartingInIsoWeek,
  getIsoWeekParts,
  orderPlannerRegistrations,
  orderPlannerRegistrationsByFleet,
  reconcileImportedPlannerEvents,
} from "../src/app/hgv-compliance/hgvPlanner.js";
import {
  HGV_EXCEL_REGISTRATION_ORDER,
  HGV_PLANNER_YEARS,
  getImportedPlannerYear,
} from "../src/app/hgv-compliance/hgvPlannerData.js";

const vehicle = {
  id: "vehicle-1",
  name: "Test HGV",
  registration: "HGV123",
};

test("every imported document date is in its correct ISO week without exact duplicates", () => {
  const seen = new Set();

  HGV_PLANNER_YEARS.forEach((plannerYear) => {
    getImportedPlannerYear(plannerYear).events.forEach((event) => {
      const actualWeek = getIsoWeekParts(event.date);
      assert.deepEqual(
        actualWeek,
        { year: plannerYear, week: event.week },
        `${event.registration} ${event.date} is not in ${plannerYear}-W${event.week}`
      );

      const identity = `${event.registration}|${event.date}`;
      assert.equal(seen.has(identity), false, `duplicate imported marker ${identity}`);
      seen.add(identity);
    });
  });
});

test("future overdue inspections do not predict VOR before the vehicle actually changes status", () => {
  const complianceVehicle = {
    ...vehicle,
    category: "HGV",
    pmiInspectionEnabled: true,
    brakeTestEnabled: true,
    nextPMI: "2026-08-05",
    nextBrakeTest: "2026-08-05",
    pmiFreq: 8,
  };

  assert.equal(
    isComplianceVorStartingInIsoWeek(complianceVehicle, "ACTIVE", 2026, 32, []),
    false
  );
  assert.equal(
    isComplianceVorStartingInIsoWeek(complianceVehicle, "ACTIVE", 2026, 33, []),
    false
  );
  assert.equal(
    isComplianceVorStartingInIsoWeek(complianceVehicle, "ACTIVE", 2026, 34, []),
    false
  );
});

test("a completed inspection prevents an automatic VOR start", () => {
  const complianceVehicle = {
    ...vehicle,
    category: "HGV",
    pmiInspectionEnabled: true,
    brakeTestEnabled: true,
    nextPMI: "2026-08-05",
    nextBrakeTest: "2026-08-05",
    pmiFreq: 8,
  };

  assert.equal(
    isComplianceVorStartingInIsoWeek(
      complianceVehicle,
      "ACTIVE",
      2026,
      33,
      ["2026-08-05"]
    ),
    false
  );
});

test("current planner vehicles follow the operational fleet order and append new assets", () => {
  const result = orderPlannerRegistrations(
    ["C302151", "TE5T", "C608232", "AY65LNO", "HGV", "R400PBC", "S800PBC"],
    HGV_EXCEL_REGISTRATION_ORDER
  );

  assert.deepEqual(result, [
    "HGV",
    "S800PBC",
    "AY65LNO",
    "R400PBC",
    "C302151",
    "C608232",
    "TE5T",
  ]);
});

test("current planner groups HGVs, trailers and off-fleet with Active before VOR", () => {
  const registrations = ["TRAILVOR", "HGVVOR", "OFFONE", "HGVA", "TRAILA"];
  const vehicles = new Map([
    ["TRAILVOR", { name: "U-Crane Trailer 1" }],
    ["HGVVOR", { name: "Mobile Workshop" }],
    ["OFFONE", { name: "Old Trailer", operationalStatus: "Off Fleet" }],
    ["HGVA", { name: "U-Crane Lorry" }],
    ["TRAILA", { name: "Low Loader Trailer" }],
  ]);
  const statuses = new Map([
    ["TRAILVOR", "VOR"], ["HGVVOR", "VOR"], ["OFFONE", "OFF FLEET"],
    ["HGVA", "ACTIVE"], ["TRAILA", "ACTIVE"],
  ]);

  assert.deepEqual(
    orderPlannerRegistrationsByFleet(registrations, vehicles, statuses, registrations),
    ["HGVA", "HGVVOR", "TRAILA", "TRAILVOR", "OFFONE"]
  );
});

test("manual planner order takes priority and new vehicles retain their automatic position", () => {
  assert.deepEqual(
    applyPlannerRegistrationOrder(
      ["HGV1", "HGV2", "TRAILER1", "NEWTRAILER"],
      ["TRAILER1", "HGV1", "HGV2"]
    ),
    ["TRAILER1", "HGV1", "HGV2", "NEWTRAILER"]
  );
});

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

test("linked requested entries retain legal and workshop dates for the details modal", () => {
  const result = buildPlannerMaintenanceModalEvent({
    event: {
      bookingId: "booking-requested",
      registration: "HGV123",
      type: "inspection",
      date: "2026-08-07",
      status: "requested",
      legalDueDateISO: "2026-08-07",
      appointmentDateISO: "",
      requirementKey: "requirement-1",
    },
    vehicle,
    booking: {
      id: "booking-requested",
      vehicleId: "vehicle-1",
      type: "INSPECTION",
      status: "Requested",
      items: [{ maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-07" }],
    },
  });

  assert.equal(result.legalDueDateISO, "2026-08-07");
  assert.equal(result.appointmentDateISO, "");
  assert.equal(result.requirementKey, "requirement-1");
  assert.equal(result.items[0].legalDueDateISO, "2026-08-07");
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

test("imported planner entries have a stable hide key and respect vehicle exclusions", () => {
  const event = {
    id: "pdf-2026-48",
    year: 2026,
    week: 27,
    registration: "R400 PBC",
    date: "2026-06-29",
    type: "imported",
    source: "ISO WEEK CALENDAR.pdf",
  };
  const eventKey = "pdf|2026|27|R400PBC|2026-06-29|imported";

  assert.equal(importedPlannerEventKey(event), eventKey);
  assert.equal(isImportedPlannerEventHidden(vehicle, event), false);
  assert.equal(
    isImportedPlannerEventHidden(
      { ...vehicle, hgvPlannerHiddenImportedEventKeys: [eventKey] },
      event
    ),
    true
  );

  const result = buildPlannerMaintenanceModalEvent({ event, vehicle });
  assert.equal(result.plannerEventKey, eventKey);
  assert.equal(result.__collection, "hgvPlannerHistory");
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

test("12-month forecast entries open as due and remain bookable", () => {
  const result = buildPlannerMaintenanceModalEvent({
    event: {
      id: "year-ahead-vehicle-1-pmi-2027-03-15",
      registration: "HGV123",
      type: "inspection_brake",
      date: "2027-03-15",
      status: "requested",
      source: "year_ahead_forecast",
      legalDueDateISO: "2027-03-15",
      requirementKey: "year-ahead|vehicle-1|pmi:2027-03-15",
    },
    vehicle,
  });

  assert.equal(result.__collection, "vehicleDueDates");
  assert.equal(result.kind, "INSPECTION");
  assert.equal(result.dueDate, "2027-03-15");
  assert.deepEqual(result.maintenanceTypeIds, ["pmi", "brake_test"]);
  assert.equal(result.plannerSourceLabel, "12-month forward inspection plan");
  assert.equal(result.disableBookingActions, false);
});

test("legal due references remain separate from their linked booking", () => {
  const result = buildPlannerMaintenanceModalEvent({
    event: {
      id: "legal-due-reference",
      registration: "HGV123",
      type: "inspection_brake",
      date: "2026-08-20",
      status: "due",
      source: "booking_legal_due_reference",
      legalDueDateISO: "2026-08-20",
      appointmentDateISO: "2026-08-07",
      isLegalDueReference: true,
      linkedBookingId: "booking-early",
    },
    vehicle,
  });

  assert.equal(result.__collection, "vehicleDueDates");
  assert.equal(result.id, "");
  assert.equal(result.linkedBookingId, "booking-early");
  assert.equal(result.dueDate, "2026-08-20");
  assert.equal(result.disableBookingActions, true);
});

test("imported evidence is reconciled without hiding unmatched or ambiguous entries", () => {
  const importedEvents = [
    { id: "represented", year: 2026, week: 20, registration: "HGV123", date: "2026-05-12", type: "imported" },
    { id: "unmatched", year: 2026, week: 21, registration: "HGV123", date: "2026-05-18", type: "imported" },
    { id: "ambiguous", year: 2026, week: 22, registration: "HGV123", date: "2026-05-25", type: "imported" },
    { id: "excluded", year: 2026, week: 23, registration: "HGV123", date: "2026-06-01", type: "imported" },
    { id: "vor-marker", year: 2026, week: 24, registration: "HGV123", date: "2026-06-08", type: "imported_vor" },
  ];
  const exclusionKey = importedPlannerEventKey(importedEvents[3]);
  const reconciliation = reconcileImportedPlannerEvents({
    importedEvents,
    canonicalEvents: [
      { registration: "HGV123", date: "2026-05-12", type: "inspection", bookingId: "booking-1" },
      { registration: "HGV123", date: "2026-05-25", type: "mot", bookingId: "booking-2" },
      { registration: "HGV123", date: "2026-05-26", type: "service", bookingId: "booking-3" },
    ],
    vehicles: [{
      ...vehicle,
      hgvPlannerHiddenImportedEventKeys: [exclusionKey],
      vorHistory: [{ id: "historic-vor", status: "closed", offRoadDate: "2026-06-08", returnedDate: "2026-06-12" }],
    }],
  });

  assert.deepEqual(reconciliation.represented.map(({ event }) => event.id).sort(), ["represented", "vor-marker"]);
  assert.deepEqual(reconciliation.unmatched.map((event) => event.id), ["unmatched"]);
  assert.deepEqual(reconciliation.ambiguous.map(({ event }) => event.id), ["ambiguous"]);
  assert.equal(reconciliation.ambiguous[0].matches.length, 2);
  assert.deepEqual(reconciliation.excluded.map(({ event }) => event.id), ["excluded"]);
  assert.equal(reconciliation.excluded[0].exclusionKey, exclusionKey);
});

test("combined PMI and brake booking represents one imported marker", () => {
  const result = reconcileImportedPlannerEvents({
    importedEvents: [{ id: "pdf", year: 2026, week: 26, registration: "HGV123", date: "2026-06-25", type: "imported" }],
    canonicalEvents: [
      { registration: "HGV123", date: "2026-06-25", type: "inspection", bookingId: "combined-1" },
      { registration: "HGV123", date: "2026-06-25", type: "brake", bookingId: "combined-1" },
    ],
    vehicles: [vehicle],
  });

  assert.equal(result.represented.length, 1);
  assert.equal(result.represented[0].matches.length, 2);
  assert.deepEqual(result.ambiguous, []);
});

test("same-week MOT retains a PMI only when the surrounding PDF cadence is approximately eight weeks", () => {
  const cadenceEvents = [
    { id: "previous", year: 2025, week: 14, registration: "AY65LNO", date: "2025-03-31", type: "imported" },
    { id: "mot-week", year: 2025, week: 22, registration: "AY65LNO", date: "2025-05-26", type: "imported" },
    { id: "next", year: 2025, week: 30, registration: "AY65LNO", date: "2025-07-21", type: "imported" },
  ];
  const result = reconcileImportedPlannerEvents({
    importedEvents: [cadenceEvents[1]],
    cadenceEvents,
    canonicalEvents: [
      { registration: "AY65LNO", date: "2025-05-30", type: "mot", source: "dvsa" },
    ],
    vehicles: [{ ...vehicle, registration: "AY65LNO" }],
  });

  assert.deepEqual(result.represented, []);
  assert.equal(result.inferred.length, 1);
  assert.equal(result.inferred[0].event.type, "inspection");
  assert.equal(result.inferred[0].event.status, "completed");
  assert.equal(result.inferred[0].event.source, "imported_pmi_cadence");
  assert.equal(result.inferred[0].event.sourceEventKey, "pdf|2025|22|AY65LNO|2025-05-26|imported");
  assert.deepEqual(result.inferred[0].cadence, {
    previousDate: "2025-03-31",
    nextDate: "2025-07-21",
    previousGapDays: 56,
    nextGapDays: 56,
  });
});

test("same-week MOT does not infer a PMI when the surrounding cadence is irregular", () => {
  const cadenceEvents = [
    { id: "previous", year: 2025, week: 18, registration: "AY65LNO", date: "2025-04-28", type: "imported" },
    { id: "mot-week", year: 2025, week: 22, registration: "AY65LNO", date: "2025-05-26", type: "imported" },
    { id: "next", year: 2025, week: 30, registration: "AY65LNO", date: "2025-07-21", type: "imported" },
  ];
  const result = reconcileImportedPlannerEvents({
    importedEvents: [cadenceEvents[1]],
    cadenceEvents,
    canonicalEvents: [
      { registration: "AY65LNO", date: "2025-05-30", type: "mot", source: "dvsa" },
    ],
    vehicles: [{ ...vehicle, registration: "AY65LNO" }],
  });

  assert.equal(result.inferred.length, 0);
  assert.equal(result.represented.length, 1);
});
