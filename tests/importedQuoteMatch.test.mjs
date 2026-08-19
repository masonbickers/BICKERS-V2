import assert from "node:assert/strict";
import test from "node:test";

import { hasImportedQuoteSelection, verifiedImportedQuoteNumber } from "../src/app/utils/importedQuoteMatch.js";

const booking = {
  id: "booking-liverpool",
  jobNumber: "9155",
  importedQuoteNumber: "Q9155-001",
  importedQuoteMatch: {
    method: "exact-job-and-date",
    bookingId: "booking-liverpool",
    jobNumber: "9155",
    quoteNumber: "Q9155-001",
    matchedDates: ["2026-08-18"],
  },
};

test("accepts an imported quote only with exact booking, job and date proof", () => {
  assert.equal(hasImportedQuoteSelection(booking), true);
  assert.equal(verifiedImportedQuoteNumber(booking), "Q9155-001");
});

test("rejects a same-job quote linked to the wrong diary booking", () => {
  assert.equal(verifiedImportedQuoteNumber({ ...booking, id: "booking-manchester" }), "");
});

test("rejects mismatched jobs, quote numbers and missing dates", () => {
  assert.equal(verifiedImportedQuoteNumber({ ...booking, jobNumber: "9156" }), "");
  assert.equal(verifiedImportedQuoteNumber({ ...booking, importedQuoteNumber: "Q9155-004" }), "");
  assert.equal(verifiedImportedQuoteNumber({ ...booking, importedQuoteMatch: { ...booking.importedQuoteMatch, matchedDates: [] } }), "");
});
