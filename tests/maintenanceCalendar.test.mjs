import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActiveInspectionMetaByVehicle,
  buildBookedMetaByVehicle,
  buildMaintenanceBookingEvents,
  buildMaintenanceCalendarEvents,
  dedupeMaintenanceCalendarEvents,
  getMaintenanceRecordDisplayDates,
  getMaintenanceDisplayType,
  getUnarrangedMaintenanceDueDate,
  buildMaintenanceBookingDraftFromDueEvent,
  buildVehicleDueEvents,
  isConfirmedMaintenanceBooking,
  isMaintenanceCalendarEventDraggable,
  isMaintenanceMoveOutsideDueWeek,
  isOpenMaintenanceBooking,
  shouldExcludeFromWorkDiary,
} from "../src/app/utils/maintenanceCalendar.js";

test("maintenance display dates distinguish legal due, workshop and completion dates", () => {
  const requested = getMaintenanceRecordDisplayDates({
    status: "Requested",
    maintenanceTypeIds: ["pmi"],
    items: [{ maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-07" }],
  });
  assert.equal(requested.displayDateISO, "2026-08-07");
  assert.equal(requested.appointmentDateISO, "");

  const booked = getMaintenanceRecordDisplayDates({
    status: "Booked",
    bookingDates: ["2026-08-12"],
    maintenanceTypeIds: ["pmi"],
    items: [{ maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-07" }],
  });
  assert.equal(booked.displayDateISO, "2026-08-12");
  assert.equal(booked.legalDueDateISO, "2026-08-07");

  const completed = getMaintenanceRecordDisplayDates({
    status: "Completed",
    bookingDates: ["2026-08-12"],
    maintenanceTypeIds: ["pmi"],
    items: [{ maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-07", completionDateISO: "2026-08-13" }],
  });
  assert.equal(completed.displayDateISO, "2026-08-13");
});

test("canonical calendar pipeline ignores raw vehicle due fields and includes requested records and active jobs", () => {
  const events = buildMaintenanceCalendarEvents({
    vehicles: [{
      id: "mercedes",
      name: "Mercedes A45s",
      registration: "M2 SON",
      nextPMI: "2026-08-06",
      nextBrakeTest: "2026-08-06",
    }, {
      id: "lorry-1",
      name: "U-Crane Lorry 01",
    }],
    maintenanceBookings: [{
      id: "requested-pmi",
      companyId: "bickers-action",
      vehicleId: "lorry-1",
      vehicleLabel: "U-Crane Lorry 01",
      type: "INSPECTION",
      status: "Requested",
      items: [{ maintenanceTypeId: "pmi", status: "requested", legalDueDateISO: "2026-08-05" }],
    }],
    maintenanceJobs: [{
      id: "job-1",
      assetId: "lorry-1",
      assetLabel: "U-Crane Lorry 01",
      status: "in_progress",
      plannedDate: "2026-08-07",
      type: "repair",
    }, {
      id: "job-completed",
      assetId: "lorry-1",
      status: "completed",
      plannedDate: "2026-08-08",
      type: "repair",
    }],
    asOfDate: "2026-08-01",
  });

  assert.deepEqual(events.map((event) => event.__collection).sort(), [
    "maintenanceBookings",
    "maintenanceJobs",
  ]);
  assert.equal(events.some((event) => event.vehicleId === "mercedes"), false);
  assert.equal(events.find((event) => event.__collection === "maintenanceBookings")?.bookingStatus, "Due — not yet arranged");
});

test("canonical calendar pipeline keeps one preferred record per requirement", () => {
  const common = {
    companyId: "bickers-action",
    vehicleId: "vehicle-1",
    vehicleLabel: "Vehicle 1",
    type: "SERVICE",
    items: [{ maintenanceTypeId: "service", legalDueDateISO: "2026-08-12" }],
  };
  const events = buildMaintenanceCalendarEvents({
    vehicles: [{ id: "vehicle-1", name: "Vehicle 1" }],
    maintenanceBookings: [
      { ...common, id: "requested-copy", status: "Requested" },
      { ...common, id: "completed-record", status: "Completed", appointmentDateISO: "2026-08-10" },
      { ...common, id: "cancelled-copy", status: "Cancelled", appointmentDateISO: "2026-08-11" },
    ],
    asOfDate: "2026-08-01",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].__parentId, "completed-record");
  assert.equal(events[0].bookingStatus, "Completed");
  assert.equal(isMaintenanceCalendarEventDraggable(events[0]), false);
});

test("canonical calendar excludes orphaned bookings and jobs for deleted vehicles", () => {
  const events = buildMaintenanceCalendarEvents({
    vehicles: [{ id: "active-vehicle", name: "Active Vehicle" }],
    maintenanceBookings: [{
      id: "orphan-booking",
      vehicleId: "deleted-vehicle",
      type: "INSPECTION",
      status: "Booked",
      appointmentDateISO: "2026-08-05",
      items: [{ maintenanceTypeId: "pmi", legalDueDateISO: "2026-08-05" }],
    }],
    maintenanceJobs: [{
      id: "orphan-job",
      assetId: "deleted-vehicle",
      status: "in_progress",
      plannedDate: "2026-08-05",
    }],
  });

  assert.deepEqual(events, []);
});

test("moving a booking outside its legal ISO week requires an exception reason", () => {
  const event = {
    legalDueIsoWeek: "2026-W32",
    canonicalItems: [
      { maintenanceTypeId: "pmi", legalDueIsoWeek: "2026-W32" },
      { maintenanceTypeId: "brake_test", legalDueIsoWeek: "2026-W32" },
    ],
  };
  assert.equal(isMaintenanceMoveOutsideDueWeek(event, "2026-08-05"), false);
  assert.equal(isMaintenanceMoveOutsideDueWeek(event, "2026-08-17"), true);
});

test("maintenance events are kept out of the work diary regardless of source or state", () => {
  assert.equal(
    shouldExcludeFromWorkDiary({ status: "Maintenance", __collection: "maintenanceBookings", bookingStatus: "Booked" }),
    true
  );
  assert.equal(
    shouldExcludeFromWorkDiary({ status: "Maintenance", __collection: "maintenanceJobs" }),
    true
  );
  assert.equal(
    shouldExcludeFromWorkDiary({ status: "Maintenance", bookingStatus: "Completed" }),
    true
  );
  assert.equal(shouldExcludeFromWorkDiary({ status: "Confirmed" }), false);
});

test("combined inspection bookings use the same PMI and brake label as maintenance appointments", () => {
  assert.equal(
    getMaintenanceDisplayType({
      type: "INSPECTION",
      maintenanceTypeIds: ["pmi", "brake_test"],
    }),
    "Brake test / PMI inspection"
  );
});

test("partially completed inspections label only the outstanding booking item", () => {
  const events = buildMaintenanceBookingEvents([{
    id: "partial-inspection",
    vehicleId: "vehicle-1",
    vehicleLabel: "HGV test",
    type: "INSPECTION",
    status: "Booked",
    appointmentDateISO: "2026-08-03",
    maintenanceTypeIds: ["pmi", "brake_test"],
    items: [
      { maintenanceTypeId: "pmi", status: "completed", completionDateISO: "2026-08-03" },
      { maintenanceTypeId: "brake_test", status: "booked" },
    ],
  }]);

  assert.equal(events.length, 1);
  assert.equal(events[0].maintenanceTypeLabel, "Brake test");
  assert.deepEqual(events[0].maintenanceTypeIds, ["brake_test"]);
  assert.match(events[0].title, /HGV test - Brake test/);
});

test("completed inspection labels reflect only items recorded as completed", () => {
  const events = buildMaintenanceBookingEvents([{
    id: "legacy-partial-completion",
    vehicleId: "vehicle-1",
    vehicleLabel: "HGV test",
    type: "INSPECTION",
    status: "Completed",
    appointmentDateISO: "2026-08-03",
    maintenanceTypeIds: ["pmi", "brake_test"],
    items: [
      { maintenanceTypeId: "pmi", status: "completed", completionDateISO: "2026-08-03" },
      { maintenanceTypeId: "brake_test", status: "booked" },
    ],
  }]);

  assert.equal(events.length, 1);
  assert.equal(events[0].maintenanceTypeLabel, "PMI inspection");
  assert.deepEqual(events[0].maintenanceTypeIds, ["pmi"]);
});

test("whole-booking completion updates only the canonical items selected for completion", async () => {
  const serviceSource = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/app/api/maintenance/bookings/_service.js", import.meta.url), "utf8")
  );
  assert.match(
    serviceSource,
    /completionVehiclePatch\(\{ booking, vehicle, typeIds: available,[\s\S]*?allCompleted: completed\.allCompleted \}\)/
  );
});

test("requested canonical records render on their legal due date as not arranged", () => {
  const events = buildMaintenanceBookingEvents([
    {
      id: "requested-1",
      vehicleId: "vehicle-1",
      vehicleLabel: "Truck 1",
      type: "INSPECTION",
      maintenanceTypeIds: ["pmi", "brake_test"],
      status: "Requested",
      items: [
        { maintenanceTypeId: "pmi", status: "requested", legalDueDateISO: "2026-08-05" },
        { maintenanceTypeId: "brake_test", status: "requested", legalDueDateISO: "2026-08-05" },
      ],
    },
  ], { asOfDate: "2026-07-01" });
  assert.equal(events.length, 1);
  assert.equal(events[0].bookingStatus, "Due — not yet arranged");
  assert.equal(events[0].recordStatus, "requested");
  assert.equal(events[0].dueState, "upcoming");
  assert.equal(events[0].start.getDate(), 5);
});

test("confirmed booking cards retain separate workshop and legal due dates", () => {
  const events = buildMaintenanceBookingEvents([{
    id: "confirmed-service",
    vehicleId: "vehicle-1",
    vehicleLabel: "Truck 1",
    type: "SERVICE",
    status: "Booked",
    appointmentDateISO: "2026-08-05",
    items: [{
      maintenanceTypeId: "service",
      status: "booked",
      legalDueDateISO: "2026-08-12",
    }],
  }], { asOfDate: "2026-08-01" });
  assert.equal(events.length, 1);
  assert.equal(events[0].bookingStatus, "Confirmed booking");
  assert.equal(events[0].start.getDate(), 5);
  assert.equal(events[0].legalDueDateISO, "2026-08-12");
});

test("archived and superseded maintenance records never render as duplicate calendar cards", () => {
  const baseBooking = {
    vehicleId: "vehicle-1",
    vehicleLabel: "Truck 1",
    type: "INSPECTION",
    maintenanceTypeIds: ["pmi", "brake_test"],
    appointmentDateISO: "2026-08-05",
  };
  const events = buildMaintenanceBookingEvents([
    { ...baseBooking, id: "active-1", status: "Booked" },
    { ...baseBooking, id: "archived-1", status: "Archived" },
    { ...baseBooking, id: "superseded-1", status: "Superseded" },
  ]);

  assert.equal(events.length, 1);
  assert.match(events[0].id, /^active-1__/);
  assert.equal(
    isOpenMaintenanceBooking(
      { ...baseBooking, status: "Archived" },
      new Date("2026-08-03T12:00:00")
    ),
    false
  );
});

test("a saved inspection booking replaces its generated PMI and brake reminder", () => {
  const events = dedupeMaintenanceCalendarEvents([
    {
      id: "booking-1__2026-08-03",
      __collection: "maintenanceBookings",
      kind: "INSPECTION_BOOKING",
      vehicleId: "vehicle-1",
      start: new Date(2026, 7, 3),
      maintenanceTypeIds: ["pmi", "brake_test"],
    },
    {
      id: "appointment:vehicle-1:2026-08-03",
      __collection: "vehicleDueDates",
      kind: "MAINTENANCE_APPOINTMENT",
      vehicleId: "vehicle-1",
      appointmentDateISO: "2026-08-03",
      maintenanceTypeIds: ["brake_test", "pmi"],
    },
  ]);

  assert.deepEqual(events.map((event) => event.id), ["booking-1__2026-08-03"]);
});

test("a completed service suppresses an older requested due marker for the same vehicle", () => {
  const events = dedupeMaintenanceCalendarEvents([
    {
      id: "service-due__2026-08-18",
      __collection: "maintenanceBookings",
      recordStatus: "requested",
      vehicleId: "bmw-1",
      canonicalItems: [{
        maintenanceTypeId: "service",
        status: "requested",
        legalDueDateISO: "2026-08-18",
      }],
      start: new Date(2026, 7, 18),
    },
    {
      id: "service-completed__2026-08-19",
      __collection: "maintenanceBookings",
      recordStatus: "completed",
      vehicleId: "bmw-1",
      canonicalItems: [{
        maintenanceTypeId: "service",
        status: "completed",
        completionDateISO: "2026-08-19",
      }],
      start: new Date(2026, 7, 19),
    },
  ]);

  assert.deepEqual(events.map((event) => event.id), ["service-completed__2026-08-19"]);
});

test("a completed service does not suppress a later service cycle", () => {
  const events = dedupeMaintenanceCalendarEvents([
    {
      id: "service-completed__2026-08-19",
      __collection: "maintenanceBookings",
      recordStatus: "completed",
      vehicleId: "bmw-1",
      canonicalItems: [{
        maintenanceTypeId: "service",
        status: "completed",
        completionDateISO: "2026-08-19",
      }],
      start: new Date(2026, 7, 19),
    },
    {
      id: "next-service-due__2027-08-18",
      __collection: "maintenanceBookings",
      recordStatus: "requested",
      vehicleId: "bmw-1",
      canonicalItems: [{
        maintenanceTypeId: "service",
        status: "requested",
        legalDueDateISO: "2027-08-18",
      }],
      start: new Date(2027, 7, 18),
    },
  ]);

  assert.deepEqual(events.map((event) => event.id), [
    "service-completed__2026-08-19",
    "next-service-due__2027-08-18",
  ]);
});

test("both calendar pages use the shared inspection appointment renderer", async () => {
  const { readFile } = await import("node:fs/promises");
  const [panelSource, dashboardSource, vehicleHomeSource] = await Promise.all([
    readFile(new URL("../src/app/components/MaintenanceCalendarPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/dashboard/DashboardPageImpl.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/vehicle-home/page.js", import.meta.url), "utf8"),
  ]);
  assert.match(panelSource, /kind === "INSPECTION_BOOKING" \? `\$\{event\?\.maintenanceTypeLabel \|\| displayType\} appointment`/);
  assert.match(dashboardSource, /<MaintenanceCalendarPanel/);
  assert.match(vehicleHomeSource, /<MaintenanceCalendarPanel/);
});
import { CALENDAR_REMINDER_WORKFLOW_KEYS } from "../src/app/utils/maintenanceSchema.js";

test("dashboard register reminders remain limited to the previous Brake and PMI scope", () => {
  assert.deepEqual(
    CALENDAR_REMINDER_WORKFLOW_KEYS,
    ["brake_test", "pmi"]
  );
});

test("dragging a due reminder creates a booking draft without moving its legal due week", () => {
  const draft = buildMaintenanceBookingDraftFromDueEvent({
    id: "appointment:vehicle-1:2026-08-03:pmi_brake_test",
    __collection: "vehicleDueDates",
    kind: "MAINTENANCE_APPOINTMENT",
    vehicleId: "vehicle-1",
    appointmentDateISO: "2026-08-03",
    sourceDueIsoWeek: "2026-W32",
    maintenanceTypeIds: ["pmi", "brake_test"],
  }, "2026-08-17");

  assert.equal(draft.type, "INSPECTION");
  assert.equal(draft.defaultDate, "2026-08-17");
  assert.equal(draft.sourceDueDate, "2026-08-03");
  assert.equal(draft.sourceDueIsoWeek, "2026-W32");
  assert.deepEqual(draft.defaultMaintenanceTypeIds, ["pmi", "brake_test"]);
});

test("requested canonical cards open the matching MOT and service booking forms", () => {
  const baseEvent = {
    id: "requested-record__2026-08-04",
    __collection: "maintenanceBookings",
    __parentId: "requested-record",
    vehicleId: "vehicle-1",
    dueDate: "2026-08-04",
    sourceDueIsoWeek: "2026-W32",
  };

  const serviceDraft = buildMaintenanceBookingDraftFromDueEvent({
    ...baseEvent,
    kind: "SERVICE_BOOKING",
  }, "2026-08-04");
  assert.equal(serviceDraft.type, "SERVICE");
  assert.deepEqual(serviceDraft.defaultMaintenanceTypeIds, []);

  const motDraft = buildMaintenanceBookingDraftFromDueEvent({
    ...baseEvent,
    kind: "MOT_BOOKING",
  }, "2026-08-04");
  assert.equal(motDraft.type, "MOT");
  assert.deepEqual(motDraft.defaultMaintenanceTypeIds, []);

  const inspectionDraft = buildMaintenanceBookingDraftFromDueEvent({
    ...baseEvent,
    kind: "INSPECTION_BOOKING",
    maintenanceTypeIds: ["pmi", "brake_test"],
  }, "2026-08-04");
  assert.equal(inspectionDraft.type, "INSPECTION");
  assert.deepEqual(inspectionDraft.defaultMaintenanceTypeIds, ["pmi", "brake_test"]);
});

test("vehicle due events do not turn tacho, LOLER or tail-lift dates into appointments", () => {
  const events = buildVehicleDueEvents([{
    id: "vehicle-1",
    nextBrakeTest: "2026-08-01",
    nextTacho: "2026-08-02",
    nextTachoDownload: "2026-08-03",
    nextLoler: "2026-08-04",
    nextTailLift: "2026-08-05",
  }]);

  const appointmentEvents = events.filter((event) => event.kind === "MAINTENANCE_APPOINTMENT");
  assert.equal(appointmentEvents.length, 1);
  assert.deepEqual(appointmentEvents[0].maintenanceKeys, ["brake_test"]);
});

test("only MOT and SERVICE bookings mark vehicle due events as booked", () => {
  const now = new Date("2026-07-28T12:00:00");
  const result = buildBookedMetaByVehicle([
    {
      vehicleId: "vehicle-1",
      type: "MOT",
      appointmentDate: "2026-08-10",
      status: "booked",
    },
    {
      vehicleId: "vehicle-1",
      type: "SERVICE",
      appointmentDate: "2026-08-12",
      status: "booked",
    },
    {
      vehicleId: "vehicle-2",
      type: "WORK",
      appointmentDate: "2026-08-11",
      status: "booked",
    },
    {
      vehicleId: "vehicle-3",
      type: "INSPECTION",
      appointmentDate: "2026-08-13",
      status: "booked",
    },
    {
      vehicleId: "vehicle-4",
      type: "REPAIR",
      appointmentDate: "2026-08-14",
      status: "booked",
    },
  ], now);

  assert.equal(result["vehicle-1"].mot.has, true);
  assert.equal(result["vehicle-1"].service.has, true);
  assert.equal(result["vehicle-1"].mot.earliestAppt.getDate(), 10);
  assert.equal(result["vehicle-1"].service.earliestAppt.getDate(), 12);
  assert.equal(result["vehicle-2"], undefined);
  assert.equal(result["vehicle-3"], undefined);
  assert.equal(result["vehicle-4"], undefined);
});

test("completed, inactive and stale MOT or SERVICE bookings do not mark due events as booked", () => {
  const now = new Date("2026-07-28T12:00:00");
  const result = buildBookedMetaByVehicle([
    { vehicleId: "completed-mot", type: "MOT", status: "Completed", appointmentDateISO: "2026-08-10" },
    { vehicleId: "complete-service", type: "SERVICE", status: "Complete", appointmentDateISO: "2026-08-10" },
    { vehicleId: "cancelled-mot", type: "MOT", status: "Cancelled", appointmentDateISO: "2026-08-10" },
    { vehicleId: "closed-service", type: "SERVICE", status: "Closed", appointmentDateISO: "2026-08-10" },
    { vehicleId: "deleted-mot", type: "MOT", status: "Deleted", appointmentDateISO: "2026-08-10" },
    { vehicleId: "declined-service", type: "SERVICE", status: "Declined", appointmentDateISO: "2026-08-10" },
    { vehicleId: "stale-mot", type: "MOT", status: "Booked", appointmentDateISO: "2026-07-01" },
  ], now);

  assert.deepEqual(result, {});
});

test("only open inspection bookings mark dashboard inspection weeks as booked", () => {
  const now = new Date("2026-07-28T12:00:00");
  const result = buildActiveInspectionMetaByVehicle([
    {
      id: "open",
      vehicleId: "vehicle-1",
      type: "INSPECTION",
      status: "Booked",
      bookingDates: ["2026-07-29", "2026-07-30"],
      sourceDueKey: "inspection_due__vehicle-1__2026-07-30",
      sourceDueIsoWeek: "2026-W31",
    },
    {
      id: "completed",
      vehicleId: "vehicle-2",
      type: "INSPECTION",
      status: "Completed",
      appointmentDateISO: "2026-08-05",
      sourceDueIsoWeek: "2026-W32",
    },
    {
      id: "stale",
      vehicleId: "vehicle-3",
      type: "INSPECTION",
      status: "Booked",
      appointmentDateISO: "2026-07-01",
    },
  ], now);

  assert.equal(result["vehicle-1"].bookings.length, 1);
  assert.equal(result["vehicle-1"].sourceDueKeys.has("inspection_due__vehicle-1__2026-07-30"), true);
  assert.equal(result["vehicle-1"].sourceDueWeeks.has("2026-W31"), true);
  assert.equal(result["vehicle-1"].bookedWeeks.has("2026-W31"), true);
  assert.equal(result["vehicle-2"], undefined);
  assert.equal(result["vehicle-3"], undefined);
});

test("completed bookings remain historical calendar events but cannot be dragged", () => {
  const events = buildMaintenanceBookingEvents([
    {
      id: "completed-service",
      vehicleId: "vehicle-1",
      vehicleLabel: "Test Vehicle",
      type: "SERVICE",
      status: "Completed",
      appointmentDateISO: "2026-07-20",
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].bookingStatus, "Completed");
  assert.equal(isMaintenanceCalendarEventDraggable(events[0]), false);
  assert.equal(
    isMaintenanceCalendarEventDraggable({
      ...events[0],
      status: "Maintenance",
      bookingStatus: "Booked",
    }),
    true
  );
  assert.equal(
    isMaintenanceCalendarEventDraggable({
      kind: "MAINTENANCE_APPOINTMENT",
      vehicleId: "vehicle-1",
      bookingStatus: "Completed",
    }),
    false
  );
});

test("open maintenance bookings exclude terminal statuses for every booking type", () => {
  const now = new Date("2026-07-28T12:00:00");

  for (const type of ["MOT", "SERVICE", "WORK", "INSPECTION"]) {
    assert.equal(
      isOpenMaintenanceBooking(
        { type, status: "Completed", appointmentDateISO: "2026-08-10" },
        now
      ),
      false,
      `${type} completed booking`
    );
  }

  for (const status of ["Cancelled", "Closed", "Deleted", "Declined"]) {
    assert.equal(
      isOpenMaintenanceBooking(
        { type: "WORK", status, appointmentDateISO: "2026-08-10" },
        now
      ),
      false,
      status
    );
  }
});

test("open maintenance bookings exclude stale dates and retain today or future work", () => {
  const now = new Date("2026-07-28T12:00:00");

  assert.equal(
    isOpenMaintenanceBooking(
      { type: "WORK", status: "Booked", appointmentDateISO: "2026-04-01" },
      now
    ),
    false
  );
  assert.equal(
    isOpenMaintenanceBooking(
      { type: "SERVICE", status: "Booked", appointmentDateISO: "2026-07-28" },
      now
    ),
    true
  );
  assert.equal(
    isOpenMaintenanceBooking(
      {
        type: "INSPECTION",
        status: "Booked",
        bookingDates: ["2026-07-29", "2026-07-30"],
      },
      now
    ),
    true
  );
});

test("confirmed bookings exclude untouched automatic due-date schedules", () => {
  const automaticDue = {
    type: "SERVICE",
    status: "Booked",
    bookingDates: ["2026-08-22"],
    sourceDueDateISO: "2026-08-22",
    origin: { source: "automatic_schedule" },
    scheduleManuallyAdjusted: false,
  };

  assert.equal(isConfirmedMaintenanceBooking(automaticDue), false);
  assert.equal(getUnarrangedMaintenanceDueDate(automaticDue, "service"), "2026-08-22");
  const [automaticDueEvent] = buildMaintenanceBookingEvents([automaticDue]);
  assert.equal(automaticDueEvent.recordStatus, "requested");
  assert.equal(automaticDueEvent.bookingStatus, "Due — not yet arranged");
  assert.equal(automaticDueEvent.start.getFullYear(), 2026);
  assert.equal(automaticDueEvent.start.getMonth(), 7);
  assert.equal(automaticDueEvent.start.getDate(), 22);
  assert.equal(
    isConfirmedMaintenanceBooking({ ...automaticDue, arrangedAt: "2026-08-20T09:00:00Z" }),
    true
  );
  assert.equal(
    getUnarrangedMaintenanceDueDate(
      { ...automaticDue, arrangedAt: "2026-08-20T09:00:00Z" },
      "service"
    ),
    ""
  );
  assert.equal(
    isConfirmedMaintenanceBooking({
      type: "SERVICE",
      status: "Booked",
      bookingDates: ["2026-08-22"],
      origin: { source: "manual" },
    }),
    true
  );
});
