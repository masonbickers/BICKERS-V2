import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuoteRevenueInsights,
  classifyQuoteLine,
  quoteIdentity,
  quoteTimelineDate,
  normaliseVehicleName,
  selectQuoteEvidence,
  summariseExtractedLines,
  toMoneyNumber,
} from "../src/app/utils/quoteExtraction.js";

test("normalises quote money and classifies operational lines", () => {
  assert.equal(toMoneyNumber("£1,240.50"), 1240.5);
  assert.equal(toMoneyNumber("F.O.C"), null);
  assert.equal(classifyQuoteLine({ section: "Equipment", description: "Tracking vehicle" }), "vehicle");
  assert.equal(classifyQuoteLine({ section: "Labour Rates", description: "Shoot day" }), "labour");
});

test("discounts reduce the calculated quoted value", () => {
  const summary = summariseExtractedLines([
    { section: "Equipment", description: "Camera rig", total: 1000 },
    { section: "Equipment", description: "Equipment Discount", total: 150 },
  ]);
  assert.equal(summary.calculatedTotal, 850);
  assert.deepEqual(summary.categoryTotals, { equipment: 1000, discount: -150 });
});

test("collapses revisions and uses the latest quote number for multiple options", () => {
  const rows = [
    { bookingId: "b1", quoteNumber: "Q1000-001", revision: 0, documentTotal: 1000, includedInInsights: true, matchConfidence: "exact" },
    { bookingId: "b1", quoteNumber: "Q1000-001", revision: 2, documentTotal: 1200, includedInInsights: true, matchConfidence: "exact" },
    { bookingId: "b1", quoteNumber: "Q1000-002", documentTotal: 1500, includedInInsights: true, matchConfidence: "exact" },
    { bookingId: "b2", quoteNumber: "Q1001-001", documentTotal: 900, includedInInsights: true, matchConfidence: "exact" },
  ];
  const selected = selectQuoteEvidence(rows);
  assert.equal(selected.latestQuotes.length, 3);
  assert.equal(selected.selectedBookings.length, 2);
  assert.equal(selected.selectedBookings.find((row) => row.bookingId === "b1").quote.documentTotal, 1500);
  assert.equal(selected.ambiguousBookings.length, 1);
});

test("treats Complete quote value as invoiced revenue", () => {
  const insights = buildQuoteRevenueInsights([
    {
      bookingId: "b1",
      quoteNumber: "Q1000-001",
      includedInInsights: true,
      matchConfidence: "exact",
      documentTotal: 1200,
      productionCompany: "Studio One",
      categoryTotals: { vehicle: 700, labour: 500 },
      lineItems: [{ description: "Tracking vehicle", category: "vehicle", lineTotal: 700 }],
    },
  ], [{ id: "b1", firstBookingDate: "2026-07-01", status: "Complete" }]);
  assert.equal(insights.totals.quotedBookingValue, 1200);
  assert.equal(insights.totals.completedRevenue, 1200);
  assert.equal(insights.totals.averageCompletedValue, 1200);
  assert.equal(insights.byVehicle[0].value, 700);
});

test("excludes a quote unless its job match is explicitly exact", () => {
  const selected = selectQuoteEvidence([
    { bookingId: "b1", quoteNumber: "Q1000-001", documentTotal: 1000, includedInInsights: true, matchConfidence: "mismatch" },
    { bookingId: "b2", quoteNumber: "Q1001-001", documentTotal: 900, includedInInsights: true },
  ]);
  assert.equal(selected.selectedBookings.length, 0);
});

test("extracts a stable quote family and revision", () => {
  assert.deepEqual(quoteIdentity("Q8866-002 REV 3.xlsx"), { quoteNumber: "Q8866-002", family: "Q8866-002", revision: 3 });
  assert.deepEqual(quoteIdentity("Q8805-005A - Capital.xlsx"), { quoteNumber: "Q8805-005A", family: "Q8805-005A", revision: 0 });
});

test("normalises harmless vehicle spelling differences for one total", () => {
  assert.equal(normaliseVehicleName("Artic  Low Loader No1"), "Artic Low Loader No.1");
  assert.equal(normaliseVehicleName("Artic Low Loader No. 1"), "Artic Low Loader No.1");
});

test("uses extracted work month when a future quote has no booking date yet", () => {
  assert.equal(
    quoteTimelineDate({ id: "b1" }, { bookingMonth: "2027-03" }).toISOString().slice(0, 10),
    "2027-03-01",
  );
  const insights = buildQuoteRevenueInsights([
    {
      bookingId: "b1",
      quoteNumber: "Q2000-001",
      includedInInsights: true,
      matchConfidence: "exact",
      documentTotal: 2500,
      bookingMonth: "2027-03",
      bookingStatus: "First Pencil",
    },
  ], [{ id: "b1", status: "First Pencil" }]);
  assert.equal(insights.timeline[0].month, "2027-03");
  assert.equal(insights.timeline[0].pencil, 2500);
  assert.equal(insights.quoteRows[0].dateSource, "quote timeline");
});

test("uses the earliest canonical work date when legacy firstBookingDate disagrees", () => {
  assert.equal(
    quoteTimelineDate({ firstBookingDate: "2026-12-02", bookingDates: ["2026-09-02"] }).toISOString().slice(0, 10),
    "2026-09-02",
  );
});

test("does not use creation time when a real future work date exists", () => {
  assert.equal(
    quoteTimelineDate({ createdAt: "2026-07-01", bookingDates: ["2026-09-02"] }).toISOString().slice(0, 10),
    "2026-09-02",
  );
});

test("uses only the explicitly matched imported quote for each booking instance", () => {
  const extractions = [
    { bookingId: "aug", jobNumber: "9155", quoteNumber: "Q9155-001", documentTotal: 1000, includedInInsights: true, matchConfidence: "exact" },
    { bookingId: "aug", jobNumber: "9155", quoteNumber: "Q9155-004", documentTotal: 9000, includedInInsights: true, matchConfidence: "exact" },
    { bookingId: "sep", jobNumber: "9155", quoteNumber: "Q9155-001", documentTotal: 1000, includedInInsights: true, matchConfidence: "exact" },
    { bookingId: "sep", jobNumber: "9155", quoteNumber: "Q9155-002", documentTotal: 2000, includedInInsights: true, matchConfidence: "exact" },
    { bookingId: "review", jobNumber: "9155", quoteNumber: "Q9155-004", documentTotal: 9000, includedInInsights: true, matchConfidence: "exact" },
  ];
  const insights = buildQuoteRevenueInsights(extractions, [
    { id: "aug", jobNumber: "9155", status: "First Pencil", importedQuoteNumber: "Q9155-001", importedQuoteMatch: { method: "exact-job-and-date", bookingId: "aug", jobNumber: "9155", quoteNumber: "Q9155-001", matchedDates: ["2026-08-18"] } },
    { id: "sep", jobNumber: "9155", status: "First Pencil", importedQuoteNumber: "Q9155-002", importedQuoteMatch: { method: "exact-job-and-date", bookingId: "sep", jobNumber: "9155", quoteNumber: "Q9155-002", matchedDates: ["2026-09-29"] } },
    { id: "review", jobNumber: "9155", status: "First Pencil", importedQuoteNumber: null },
  ]);
  assert.equal(insights.totals.selectedBookings, 2);
  assert.equal(insights.totals.quotedBookingValue, 3000);
  assert.deepEqual(insights.quoteRows.map((row) => row.quoteNumber).sort(), ["Q9155-001", "Q9155-002"]);
});
