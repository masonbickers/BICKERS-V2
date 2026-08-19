import assert from "node:assert/strict";
import test from "node:test";

import {
  getAuthoritativeDvsaMotExpiry,
  resolveCompletedMotExpiry,
} from "../src/app/utils/motExpiry.js";

test("keeps the DVSA expiry when MOT completion frequency produces a different date", () => {
  const vehicle = {
    nextMOT: "2027-03-12",
    dvsaLatestMot: {
      completedDate: "2026-03-13",
      expiryDate: "2027-03-20",
      motTestNumber: "227962824835",
      testResult: "PASSED",
    },
  };

  assert.equal(getAuthoritativeDvsaMotExpiry(vehicle), "2027-03-20");
  assert.equal(
    resolveCompletedMotExpiry({
      vehicle,
      fallbackExpiry: "2027-03-12",
    }),
    "2027-03-20"
  );
});

test("uses the newest passed DVSA test rather than a newer failed test", () => {
  const vehicle = {
    dvsaLatestMot: {
      completedDate: "2026-03-20",
      testResult: "FAILED",
    },
    dvsaMotTests: [
      {
        completedDate: "2026-03-20",
        testResult: "FAILED",
      },
      {
        completedDate: "2026-03-13",
        expiryDate: "2027-03-20",
        testResult: "PASSED",
      },
      {
        completedDate: "2025-03-14",
        expiryDate: "2026-03-20",
        testResult: "PASSED",
      },
    ],
  };

  assert.equal(getAuthoritativeDvsaMotExpiry(vehicle), "2027-03-20");
});

test("falls back to the frequency calculation when no DVSA expiry is saved", () => {
  assert.equal(
    resolveCompletedMotExpiry({
      vehicle: {},
      fallbackExpiry: "2027-03-12",
    }),
    "2027-03-12"
  );
});

test("does not reuse an older DVSA expiry for a newly completed MOT", () => {
  const vehicle = {
    dvsaMotTests: [{
      completedDate: "2025-08-01",
      expiryDate: "2026-07-31",
      testResult: "PASSED",
    }],
  };
  assert.equal(
    resolveCompletedMotExpiry({
      vehicle,
      completedDate: "2026-08-04",
      fallbackExpiry: "2027-08-03",
    }),
    ""
  );
});
