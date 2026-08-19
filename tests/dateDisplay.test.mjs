import test from "node:test";
import assert from "node:assert/strict";

import { formatUkDate, formatUkDateTime, toDisplayDate } from "../src/app/utils/dateDisplay.js";

test("formats stored ISO dates as full UK dates", () => {
  assert.equal(formatUkDate("2026-09-07"), "07/09/2026");
  assert.equal(formatUkDate("2026-09-07T00:00:00.000Z"), "07/09/2026");
});

test("preserves already formatted UK dates", () => {
  assert.equal(formatUkDate("07/09/2026"), "07/09/2026");
});

test("supports Firestore-like timestamps and date-times", () => {
  assert.equal(formatUkDate({ seconds: 1788739200 }), "07/09/2026");
  assert.match(formatUkDateTime(new Date(2026, 8, 7, 14, 5)), /^07\/09\/2026 14:05$/);
});

test("uses the supplied fallback for missing or invalid values", () => {
  assert.equal(formatUkDate("", "Not recorded"), "Not recorded");
  assert.equal(formatUkDate("not-a-date", "Not recorded"), "Not recorded");
  assert.equal(toDisplayDate("not-a-date"), null);
});
