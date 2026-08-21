import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMotConfirmationFields,
  isDvsaCronAuthorized,
  runMotSyncBatch,
  withBoundedRetry,
} from "../src/app/utils/motSyncExecution.js";
import {
  buildMotDvsaReconciliationPlan,
  motReconciliationJobId,
} from "../src/app/utils/motMaintenanceReconciliation.js";

test("DVSA cron authentication fails closed", () => {
  assert.equal(isDvsaCronAuthorized("Bearer correct", "correct"), true);
  assert.equal(isDvsaCronAuthorized("Bearer wrong", "correct"), false);
  assert.equal(isDvsaCronAuthorized("Bearer undefined", ""), false);
});

test("DVSA calls use bounded retries only for retryable failures", async () => {
  let attempts = 0;
  const value = await withBoundedRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error("temporary"), { response: { status: 503 } });
    return "ok";
  }, { maxAttempts: 3, wait: async () => {} });
  assert.equal(value, "ok");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(withBoundedRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error("bad request"), { response: { status: 400 } });
  }, { maxAttempts: 3, wait: async () => {} }), /bad request/);
  assert.equal(attempts, 1);
});

test("MOT completion stays awaiting when DVSA only has the previous test", () => {
  const result = buildMotConfirmationFields({
    motAwaitingDvsaCompletionDate: "2026-08-04",
    motAwaitingDvsaBookingId: "mot-new",
  }, {
    lastMOT: "2025-08-01",
    nextMOT: "2026-08-01",
    latestPassedMot: { completedDate: "2025-08-01" },
  }, "2026-08-04T12:00:00Z");
  assert.equal(result.confirmsNewMot, false);
  assert.deepEqual(result.patch, {
    motAwaitingDvsaConfirmation: true,
    motDvsaConfirmationStatus: "awaiting",
  });
});

test("DVSA confirmation creates one deterministic requested MOT successor", () => {
  const vehicle = {
    id: "vehicle-1",
    companyId: "company-1",
    registration: "AB12 CDE",
    motAwaitingDvsaCompletionDate: "2026-08-04",
    motAwaitingDvsaBookingId: "mot-booking-1",
  };
  const patch = buildMotConfirmationFields(vehicle, {
    lastMOT: "2026-08-04",
    nextMOT: "2027-08-03",
    latestPassedMot: { completedDate: "2026-08-04" },
  }, "2026-08-05T09:00:00.000Z").patch;
  const first = buildMotDvsaReconciliationPlan({
    vehicle,
    vehiclePatch: patch,
    nowISO: "2026-08-05T09:00:00.000Z",
  });
  const second = buildMotDvsaReconciliationPlan({
    vehicle,
    vehiclePatch: patch,
    nowISO: "2026-08-05T09:00:00.000Z",
  });
  assert.equal(first.requestedRecord.status, "Requested");
  assert.deepEqual(first.requestedRecord.bookingDates, []);
  assert.equal(first.requestedRecord.items[0].legalDueDateISO, "2027-08-03");
  assert.equal(first.dueItemId, second.dueItemId);
  assert.equal(first.jobId, motReconciliationJobId("mot-booking-1", "2026-08-04"));
});

test("cron reports partial upstream failure while updating healthy vehicles", async () => {
  const updated = [];
  const results = await runMotSyncBatch({
    vehicles: [
      { id: "good", registration: "GOOD1" },
      { id: "bad", registration: "BAD1" },
      { id: "skip", registration: "" },
    ],
    getAccessToken: async () => "token",
    shouldSync: (vehicle) => Boolean(vehicle.registration),
    registrationFor: (vehicle) => vehicle.registration,
    fetchHistory: async (vrm) => {
      if (vrm === "BAD1") throw Object.assign(new Error("DVSA unavailable"), { response: { status: 503 } });
      return { nextMOT: "2027-08-04" };
    },
    buildPatch: (_vehicle, history) => ({ nextMOT: history.nextMOT }),
    updateVehicle: async (vehicle, patch) => updated.push({ vehicle, patch }),
    now: (() => {
      const times = [1_700_000_000_000, 1_700_000_000_125];
      return () => times.shift();
    })(),
  });
  assert.deepEqual({ checked: results.checked, updated: results.updated, failed: results.failed, skipped: results.skipped }, {
    checked: 2, updated: 1, failed: 1, skipped: 1,
  });
  assert.equal(results.failures[0].vehicleId, "bad");
  assert.equal(results.failures[0].status, 503);
  assert.equal(results.durationMs, 125);
  assert.equal(updated.length, 1);
});

test("fleet MOT sync uses bounded concurrency and preserves result order", async () => {
  let active = 0;
  let peakActive = 0;
  const release = [];
  const vehicles = Array.from({ length: 6 }, (_, index) => ({
    id: `vehicle-${index}`,
    registration: `REG${index}`,
  }));

  const run = runMotSyncBatch({
    vehicles,
    getAccessToken: async () => "token",
    shouldSync: () => true,
    registrationFor: (vehicle) => vehicle.registration,
    fetchHistory: async (vrm) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => release.push(resolve));
      active -= 1;
      return { nextMOT: `2027-08-${vrm.slice(3).padStart(2, "0")}` };
    },
    buildPatch: (_vehicle, history) => ({ nextMOT: history.nextMOT }),
    updateVehicle: async () => {},
    maxConcurrency: 3,
  });

  while (release.length < 3) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 3);
  release.splice(0).forEach((resolve) => resolve());
  while (release.length < 3) await new Promise((resolve) => setImmediate(resolve));
  release.splice(0).forEach((resolve) => resolve());

  const results = await run;
  assert.equal(peakActive, 3);
  assert.deepEqual(
    results.updatedVehicles.map((entry) => entry.vehicleId),
    vehicles.map((vehicle) => vehicle.id)
  );
});
