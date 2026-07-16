import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAttentionQueue,
  buildFleetBuckets,
  buildFollowUpQueue,
  buildOperationalSummary,
  buildPreparationQueue,
  buildSchedulingConflicts,
  buildWindowCounts,
  filterCalendarEvents,
  normalizeVehicleKey,
} from "../src/app/home/homeDashboard.js";

const now = new Date("2026-07-15T09:00:00.000Z");

test("window counts include boundaries and retain unknown statuses in total", () => {
  const events = [
    { start: now, status: "confirmed" },
    { start: "2026-07-22T09:00:00.000Z", status: "first pencil" },
    { start: "2026-07-16T09:00:00.000Z", status: "custom" },
    { start: "2026-07-22T09:00:01.000Z", status: "confirmed" },
    { start: null, status: "confirmed" },
  ];
  assert.deepEqual(buildWindowCounts(events, now, 7), { total: 3, enquiry: 0, "first pencil": 1, "second pencil": 0, confirmed: 1 });
});

test("follow-ups are bounded, filtered, and ordered", () => {
  const events = [
    { id: "late", status: "first pencil", start: "2026-07-18T09:00:00.000Z" },
    { id: "early", status: "first pencil", start: "2026-07-15T10:00:00.000Z" },
    { id: "wrong", status: "confirmed", start: "2026-07-15T11:00:00.000Z" },
    { id: "outside", status: "first pencil", start: "2026-07-18T09:00:01.000Z" },
  ];
  assert.deepEqual(buildFollowUpQueue(events, now).map((event) => event.id), ["early", "late"]);
});

test("preparation queue handles missing dates and vehicle labels", () => {
  const events = [
    { id: "b", start: "2026-07-16T09:00:00.000Z", vehicles: [{ registration: "ab12" }], equipment: ["Ramp"], jobNumber: "2" },
    { id: "missing", start: null, vehicles: [], equipment: [], jobNumber: "3" },
  ];
  const result = buildPreparationQueue(events, [{ id: "b", notes: "Check straps" }], now, (vehicle) => vehicle.registration.toUpperCase());
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].vehicles, ["AB12"]);
  assert.equal(result[0].notes, "Check straps");
});

test("vehicle keys normalize ids, registrations, whitespace, and case", () => {
  assert.equal(normalizeVehicleKey({ id: " Vehicle-1 " }), "vehicle-1");
  assert.equal(normalizeVehicleKey({ registration: " AB12 CDE " }), "ab12 cde");
});

test("scheduling conflicts deduplicate repeated vehicle assignments", () => {
  const vehicle = { id: "v1", registration: "AB12" };
  const conflicts = buildSchedulingConflicts([
    { id: "firm", status: "confirmed", start: "2026-07-16", end: "2026-07-18", vehicles: [vehicle] },
    { id: "second", status: "second pencil", start: "2026-07-17", end: "2026-07-17", vehicles: [vehicle, vehicle] },
    { id: "separate", status: "second pencil", start: "2026-07-19", end: "2026-07-20", vehicles: [vehicle] },
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].second.id, "second");
});

test("fleet buckets exclude booked items and classify date boundaries", () => {
  const buckets = buildFleetBuckets([
    { id: "mot-overdue", kind: "MOT", dueDate: "2026-07-14" },
    { id: "service-soon", kind: "SERVICE", dueDate: "2026-08-05" },
    { id: "booked", kind: "MOT", dueDate: "2026-07-16", booked: true },
    { id: "outside", kind: "SERVICE", dueDate: "2026-08-06" },
    { id: "missing", kind: "MOT" },
  ], now);
  assert.deepEqual(buckets.overdueMOT.map((item) => item.id), ["mot-overdue"]);
  assert.deepEqual(buckets.serviceDueSoon.map((item) => item.id), ["service-soon"]);
  assert.equal(buckets.motDueSoon.length, 0);
  assert.equal(buckets.overdueService.length, 0);
});

test("operational summary exposes periods, actions, and unavailable data", () => {
  const summary = buildOperationalSummary({
    events: [{ start: "2026-07-20", status: "confirmed" }],
    referenceDate: now,
    windowDays: 14,
    followUps: [{ id: "pencil" }],
    preparation: [{ id: "prep" }],
    conflicts: [{ id: "conflict" }],
    overdueMOT: [{ id: "mot" }],
    availability: { fleet: false },
  });
  assert.deepEqual(summary.map((item) => item.period), [
    "Next 14 days",
    "Starting within 72 hours",
    "Starting within 2 days",
    "All future overlaps",
    "MOT and service today",
  ]);
  assert.equal(summary[0].value, 1);
  assert.equal(summary[1].actionTarget.type, "first-pencil");
  assert.equal(summary[4].value, null);
  assert.equal(summary[4].available, false);
});

test("attention queue ranks severity, deduplicates, and ignores invalid records", () => {
  const conflict = {
    vehicle: { id: "v1", registration: "AB12" },
    second: { id: "second", jobNumber: "J2", start: "2026-07-18" },
    firm: { id: "firm", jobNumber: "J1" },
  };
  const queue = buildAttentionQueue({
    conflicts: [conflict, conflict, { second: {}, firm: {} }],
    overdueMOT: [{ id: "v2", vehicleLabel: "Truck 2", dueDate: "invalid" }],
    followUps: [{ id: "follow", jobNumber: "J3", client: "Client", start: "2026-07-16" }],
    preparation: [{ id: "prep", jobNumber: "J4", start: "2026-07-15", vehicles: [] }],
  });
  assert.deepEqual(queue.map((item) => item.severity), ["critical", "critical", "urgent", "upcoming"]);
  assert.equal(queue.filter((item) => item.type === "scheduling-conflict").length, 1);
  assert.equal(queue.find((item) => item.type === "mot-overdue").dueAt, null);
  assert.deepEqual(queue[0].actionTarget, { kind: "booking", id: "second" });
});

test("calendar source filtering supports multiple and empty selections", () => {
  const events = [
    { id: "booking", sourceType: "booking" },
    { id: "maintenance", sourceType: "maintenance" },
    { id: "holiday", sourceType: "holiday" },
  ];
  assert.deepEqual(filterCalendarEvents(events, ["booking", "holiday"]).map((event) => event.id), ["booking", "holiday"]);
  assert.deepEqual(filterCalendarEvents(events, []), []);
});
