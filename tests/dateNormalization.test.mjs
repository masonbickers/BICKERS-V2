import test from "node:test";
import assert from "node:assert/strict";
import { calendarDayDifference, normalizeDate } from "../src/app/utils/dateNormalization.js";

test("normalizes native dates and Firestore-style timestamps", () => {
  const native = new Date(2026, 6, 14, 20, 30);
  assert.equal(normalizeDate(native)?.getTime(), native.getTime());
  assert.equal(normalizeDate({ toDate: () => native })?.getTime(), native.getTime());
  assert.equal(normalizeDate({ seconds: Math.floor(native.getTime() / 1000) })?.getSeconds(), native.getSeconds());
});

test("parses ISO and local date-only strings and rejects invalid input", () => {
  assert.equal(normalizeDate("2026-07-14")?.getDate(), 14);
  assert.equal(normalizeDate("2026-07-14T10:30:00Z")?.toISOString(), "2026-07-14T10:30:00.000Z");
  assert.equal(normalizeDate("2026-02-30"), null);
  assert.equal(normalizeDate("not-a-date"), null);
});

test("calendar differences are stable across UK DST boundaries", () => {
  assert.equal(calendarDayDifference("2026-03-30", "2026-03-28"), 2);
  assert.equal(calendarDayDifference("2026-10-26", "2026-10-24"), 2);
  assert.equal(calendarDayDifference("2026-07-14", "2026-07-14T23:59:59+01:00"), 0);
});
