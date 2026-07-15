import test from "node:test";
import assert from "node:assert/strict";

import {
  calendarDayDifference,
  normalizeDate,
} from "../src/app/utils/dateNormalization.mjs";

test("normalizes native dates and Firestore timestamps", () => {
  const native = new Date(2026, 6, 15, 12, 30);
  assert.equal(normalizeDate(native)?.getTime(), native.getTime());
  assert.equal(normalizeDate({ toDate: () => native })?.getTime(), native.getTime());
  assert.equal(
    normalizeDate({ seconds: Math.floor(native.getTime() / 1000), nanoseconds: 0 })?.getTime(),
    Math.floor(native.getTime() / 1000) * 1000
  );
});

test("accepts ISO and date-only strings and rejects invalid input", () => {
  assert.equal(normalizeDate("2026-07-15")?.getDate(), 15);
  assert.equal(normalizeDate("2026-07-15T10:30:00Z")?.getUTCDate(), 15);
  assert.equal(normalizeDate("not-a-date"), null);
  assert.equal(calendarDayDifference(null), null);
});

test("calendar differences remain stable across UK DST boundaries", () => {
  assert.equal(
    calendarDayDifference(
      new Date("2026-03-30T00:30:00+01:00"),
      new Date("2026-03-29T00:30:00+00:00")
    ),
    1
  );
  assert.equal(
    calendarDayDifference(
      new Date("2026-10-26T00:30:00Z"),
      new Date("2026-10-25T00:30:00+01:00")
    ),
    1
  );
});
