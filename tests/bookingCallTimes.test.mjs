import test from "node:test";
import assert from "node:assert/strict";

import { buildBookingCallTimePayload } from "../src/app/utils/bookingCallTimes.js";

test("an empty per-day selection explicitly clears stored call times", () => {
  assert.deepEqual(
    buildBookingCallTimePayload({
      bookingDates: ["2026-08-16", "2026-08-17", "2026-08-18"],
      callTimesByDate: {
        "2026-08-16": "",
        "2026-08-17": "",
        "2026-08-18": "",
      },
      isRange: true,
    }),
    { callTime: "", callTimesByDate: {} }
  );
});

test("keeps only selected call times for current booking dates", () => {
  assert.deepEqual(
    buildBookingCallTimePayload({
      bookingDates: ["2026-08-16", "2026-08-17"],
      callTimesByDate: {
        "2026-08-16": "08:00",
        "2026-08-17": "",
        "2026-08-20": "06:00",
      },
      isRange: true,
    }),
    { callTime: "", callTimesByDate: { "2026-08-16": "08:00" } }
  );
});

test("synchronizes a single-day call time and clears it when removed", () => {
  assert.deepEqual(
    buildBookingCallTimePayload({
      bookingDates: ["2026-08-16"],
      callTimesByDate: { "2026-08-16": "09:30" },
    }),
    { callTime: "09:30", callTimesByDate: { "2026-08-16": "09:30" } }
  );

  assert.deepEqual(
    buildBookingCallTimePayload({
      bookingDates: ["2026-08-16"],
      callTimesByDate: { "2026-08-16": "" },
    }),
    { callTime: "", callTimesByDate: {} }
  );
});
