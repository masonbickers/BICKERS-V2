import assert from "node:assert/strict";
import test from "node:test";

import {
  assertInitialMaintenanceStatus,
  assertMaintenanceTransition,
  isDvsaResultForCompletion,
  rescheduleCrossesLegalIsoWeek,
} from "../src/app/utils/maintenanceMutationPolicy.js";

test("new legal maintenance records start only requested or booked", () => {
  assert.equal(assertInitialMaintenanceStatus("Requested"), "requested");
  assert.equal(assertInitialMaintenanceStatus("Booked"), "booked");
  for (const status of ["Completed", "Cancelled", "Archived", "In Progress"]) {
    assert.throws(() => assertInitialMaintenanceStatus(status), /only start/);
  }
});

test("terminal transitions cannot be manufactured through editing", () => {
  assert.equal(assertMaintenanceTransition("Requested", "Booked"), "booked");
  assert.equal(assertMaintenanceTransition("Booked", "In Progress"), "in_progress");
  assert.throws(() => assertMaintenanceTransition("Booked", "Completed"), /Invalid maintenance transition/);
  assert.throws(() => assertMaintenanceTransition("Completed", "Booked"), /Invalid maintenance transition/);
});

test("crossing the legal ISO week is detected independently of React", () => {
  assert.equal(rescheduleCrossesLegalIsoWeek(["2026-W32"], ["2026-08-05"]), false);
  assert.equal(rescheduleCrossesLegalIsoWeek(["2026-W32"], ["2026-08-12"]), true);
});

test("DVSA confirmation must be for the newly completed MOT", () => {
  assert.equal(isDvsaResultForCompletion("2026-08-04", "2026-08-04"), true);
  assert.equal(isDvsaResultForCompletion("2025-08-04", "2026-08-04"), false);
});
