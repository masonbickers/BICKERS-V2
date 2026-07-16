import test from "node:test";
import assert from "node:assert/strict";
import { buildFleetBuckets, buildFollowUpQueue, buildPreparationQueue, buildSchedulingConflicts, buildWindowCounts, normalizeVehicleKey } from "../src/app/home/homeDashboard.js";

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
