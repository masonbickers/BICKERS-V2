import assert from "node:assert/strict";
import test from "node:test";

import {
  NIGHT_SHOOT_DISPLAY_MODES,
  normalizeNightShootDisplayMode,
  shouldHighlightNightShootJobNumber,
  shouldUseFullNightShootBlock,
} from "../src/app/dashboard/dashboardNightShootDisplay.js";

const nightBooking = { status: "Confirmed", shootType: "Night" };

test("night shoot display defaults to the existing full-block style", () => {
  assert.equal(
    normalizeNightShootDisplayMode(undefined),
    NIGHT_SHOOT_DISPLAY_MODES.FULL_BLOCK
  );
  assert.equal(
    normalizeNightShootDisplayMode("unexpected-value"),
    NIGHT_SHOOT_DISPLAY_MODES.FULL_BLOCK
  );
  assert.equal(shouldUseFullNightShootBlock(nightBooking, undefined), true);
});

test("job-number mode swaps the pink highlight away from the full booking block", () => {
  assert.equal(
    shouldUseFullNightShootBlock(nightBooking, NIGHT_SHOOT_DISPLAY_MODES.JOB_NUMBER),
    false
  );
  assert.equal(
    shouldHighlightNightShootJobNumber(nightBooking, NIGHT_SHOOT_DISPLAY_MODES.JOB_NUMBER),
    true
  );
});

test("day bookings keep their normal status colour in either mode", () => {
  const dayBooking = { status: "Confirmed", shootType: "Day" };

  assert.equal(
    shouldUseFullNightShootBlock(dayBooking, NIGHT_SHOOT_DISPLAY_MODES.FULL_BLOCK),
    false
  );
  assert.equal(
    shouldHighlightNightShootJobNumber(dayBooking, NIGHT_SHOOT_DISPLAY_MODES.JOB_NUMBER),
    false
  );
});

test("inactive statuses that were not pink before remain status-coloured", () => {
  const completedNightBooking = { status: "Complete", shootType: "Night" };

  assert.equal(
    shouldUseFullNightShootBlock(completedNightBooking, NIGHT_SHOOT_DISPLAY_MODES.FULL_BLOCK),
    false
  );
  assert.equal(
    shouldHighlightNightShootJobNumber(completedNightBooking, NIGHT_SHOOT_DISPLAY_MODES.JOB_NUMBER),
    false
  );
});
