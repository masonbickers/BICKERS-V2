import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCanonicalLocationRanking,
  canonicalizeLocation,
  normalizeLocationKey,
} from "../src/app/utils/locationNormalization.js";

test("location keys ignore harmless spelling-format differences", () => {
  assert.equal(normalizeLocationKey("  LONDON?  "), "london");
  assert.equal(normalizeLocationKey("Long-cross"), "long cross");
  assert.equal(canonicalizeLocation("London?").label, "London");
});

test("approved wording aliases resolve to a canonical location", () => {
  assert.deepEqual(canonicalizeLocation("London Area"), {
    key: "london",
    label: "London",
    isAlias: true,
  });
});

test("location rankings merge aliases and retain every booking id", () => {
  const rows = buildCanonicalLocationRanking([
    { id: "a", location: "London" },
    { id: "b", location: " london " },
    { id: "c", location: "London?" },
    { id: "d", location: "London Area" },
    { id: "e", location: "London Road" },
  ]);

  assert.equal(rows[0].label, "London");
  assert.equal(rows[0].value, 4);
  assert.deepEqual(rows[0].bookingIds.sort(), ["a", "b", "c", "d"]);
  assert.equal(rows[1].label, "London Road");
  assert.equal(rows[1].value, 1);
});

