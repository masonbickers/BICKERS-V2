import test from "node:test";
import assert from "node:assert/strict";

import {
  getHolidayCarryOverWindow,
  resolveHolidayCarryOver,
} from "../src/app/utils/holidayCarryOver.js";

test("shows carry-over during January through March", () => {
  assert.equal(getHolidayCarryOverWindow(2026, new Date(2026, 0, 1)).active, true);
  assert.equal(getHolidayCarryOverWindow(2026, new Date(2026, 2, 31, 23, 59)).active, true);
});

test("hides carry-over from 1 April onwards", () => {
  const april = getHolidayCarryOverWindow(2026, new Date(2026, 3, 1));
  const august = getHolidayCarryOverWindow(2026, new Date(2026, 7, 12));

  assert.equal(april.active, false);
  assert.equal(april.deadlinePassed, true);
  assert.equal(august.active, false);
});

test("expires only the carry-over not used before April", () => {
  assert.deepEqual(
    resolveHolidayCarryOver({
      carried: 4.5,
      usedByDeadline: 4,
      year: 2026,
      now: new Date(2026, 7, 12),
    }),
    {
      active: false,
      deadlinePassed: true,
      start: new Date(2026, 0, 1),
      deadline: new Date(2026, 3, 1),
      granted: 4.5,
      used: 4,
      effective: 4,
      expired: 0.5,
    }
  );
});

test("keeps the full carry-over available before the deadline", () => {
  const result = resolveHolidayCarryOver({
    carried: 4.5,
    usedByDeadline: 1,
    year: 2026,
    now: new Date(2026, 1, 1),
  });

  assert.equal(result.effective, 4.5);
  assert.equal(result.expired, 0);
});
