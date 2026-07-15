import test from "node:test";
import assert from "node:assert/strict";
import { buildBookingAnalytics } from "../src/app/utils/bookingAnalytics.js";
import { buildNextLifecycle, canonicalBookingStatus, bookingOutcomeCategory } from "../src/app/utils/bookingLifecycle.js";
import { DEFAULT_BICKERS_BUSINESS_RULES, validateBickersBusinessRules } from "../src/app/utils/bickersBusinessRules.js";
import { buildFilteredStatisticsSectionAnalysis, buildStatisticsInsightSnapshot, redactSnapshotForVariant } from "../src/app/utils/statisticsInsightSnapshot.js";
import { londonClock } from "../src/app/utils/londonTime.js";
import { buildMonthlyVisualSummary, getStatisticsMonthPhase } from "../src/app/utils/statisticsVisualAnalysis.js";

const booking = (id, status, date, extra = {}) => ({ id, jobNumber: id, client: "Production A", status, bookingDates: [date], notesByDate: { [date]: "On Set" }, ...extra });

test("canonical lifecycle includes finance close-out aliases", () => {
  assert.equal(canonicalBookingStatus("ready_to_invoice"), "Ready to Invoice");
  assert.equal(canonicalBookingStatus("settled"), "Paid");
  assert.equal(bookingOutcomeCategory("Invoiced"), "won");
});

test("conversion uses decided outcomes and excludes open pipeline", () => {
  const analytics = buildBookingAnalytics([
    booking("1001", "Complete", "2026-07-01"),
    booking("1002", "Paid", "2026-07-02"),
    booking("1003", "Lost", "2026-07-03"),
    booking("1004", "Confirmed", "2026-07-04"),
    booking("1005", "First Pencil", "2026-07-05"),
  ]);
  assert.equal(analytics.totals.decidedOutcomes, 3);
  assert.equal(analytics.totals.conversionRate, 66.7);
  assert.equal(analytics.totals.confirmed, 1);
  assert.equal(analytics.totals.tentative, 1);
});

test("snapshot compares periods and reports only reliable finance values", () => {
  const rows = [
    booking("1001", "Invoiced", "2026-07-10", { finance: { total: 1200, invoicedAt: "2026-06-01" } }),
    booking("1002", "Invoiced", "2026-07-09"),
    booking("1003", "Confirmed", "2026-06-12"),
  ];
  const snapshot = buildStatisticsInsightSnapshot(rows, { now: new Date("2026-07-15T08:00:00Z"), rules: DEFAULT_BICKERS_BUSINESS_RULES });
  assert.equal(snapshot.current30.bookings, 2);
  assert.equal(snapshot.previous30.bookings, 1);
  assert.equal(snapshot.finance.unpaidJobs, 2);
  assert.equal(snapshot.finance.unpaidValue, 1200);
  assert.equal(snapshot.finance.invoiceCoveragePercent, 50);
});

test("booking-team snapshot contains no finance object or finance evidence", () => {
  const snapshot = buildStatisticsInsightSnapshot([booking("1001", "Paid", "2026-07-10", { invoiceTotal: 900 })], { now: new Date("2026-07-15T08:00:00Z") });
  const redacted = redactSnapshotForVariant(snapshot, "booking");
  assert.equal("finance" in redacted, false);
  assert.equal(redacted.evidenceCatalog.some((item) => item.financeOnly), false);
  assert.equal("financeQuality" in redacted.sections, false);
});

test("completed-month analysis uses first scheduled date and a preceding six-month baseline", () => {
  const rows = [
    booking("1001", "Confirmed", "2026-05-12"),
    booking("1002", "Confirmed", "2026-06-03"),
    booking("1003", "Confirmed", "2026-06-20"),
    { id: "1004", jobNumber: "1004", client: "Production A", status: "Confirmed", createdAt: "2026-07-05" },
  ];
  const snapshot = buildStatisticsInsightSnapshot(rows, { now: new Date("2026-07-15T08:00:00Z") });
  assert.equal(snapshot.sections.overview.target.month, "2026-06");
  assert.equal(snapshot.sections.overview.target.bookings, 2);
  assert.equal(snapshot.sections.overview.previous.bookings, 1);
  assert.equal(snapshot.sections.overview.sixMonthAverage.bookings, 0.2);
  assert.equal(snapshot.dataQuality.missingDates, 1);
});

test("confirmation lead times report averages, medians, samples and coverage", () => {
  const rows = Array.from({ length: 5 }, (_, index) => booking(String(1100 + index), "Confirmed", `2026-06-${String(index + 10).padStart(2, "0")}`, {
    createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T09:00:00Z`,
    lifecycle: {
      firstPencilAt: `2026-06-${String(index + 1).padStart(2, "0")}T09:00:00Z`,
      confirmedAt: `2026-06-${String(index + 6).padStart(2, "0")}T09:00:00Z`,
    },
  }));
  const snapshot = buildStatisticsInsightSnapshot(rows, { now: new Date("2026-07-15T08:00:00Z") });
  assert.equal(snapshot.sections.trends.createdToConfirmed.sampleSize, 5);
  assert.equal(snapshot.sections.trends.createdToConfirmed.coveragePercent, 100);
  assert.equal(snapshot.sections.trends.pencilToConfirmed.averageDays, 5);
  assert.equal(snapshot.sections.trends.pencilToConfirmed.medianDays, 5);
  assert.equal(snapshot.sections.trends.pencilToConfirmed.confidence, "high");
});

test("first lifecycle timestamps survive reopening", () => {
  const initial = { openedAt: "2026-06-01T09:00:00Z", confirmedAt: "2026-06-05T09:00:00Z" };
  const reopened = buildNextLifecycle(initial, "Confirmed", "First Pencil", "2026-06-08T09:00:00Z");
  const reconfirmed = buildNextLifecycle(reopened, "First Pencil", "Confirmed", "2026-06-10T09:00:00Z");
  assert.equal(reconfirmed.confirmedAt, "2026-06-05T09:00:00Z");
});

test("filtered booking-team analysis never exposes finance commentary", () => {
  const sections = buildFilteredStatisticsSectionAnalysis([
    booking("1201", "Invoiced", "2026-07-10", { invoiceTotal: 500 }),
  ], { now: new Date("2026-07-15T08:00:00Z"), rangeLabel: "Last 30 days", variant: "booking" });
  assert.equal("financeQuality" in sections, false);
  assert.equal(sections.overview.mode, "filtered");
  assert.match(sections.overview.summary, /1 bookings match Last 30 days/);
});

test("default Bickers rules validate and lifecycle cannot be reordered", () => {
  assert.equal(validateBickersBusinessRules(DEFAULT_BICKERS_BUSINESS_RULES).valid, true);
  const invalid = { ...DEFAULT_BICKERS_BUSINESS_RULES, lifecycle: [...DEFAULT_BICKERS_BUSINESS_RULES.lifecycle].reverse() };
  assert.equal(validateBickersBusinessRules(invalid).valid, false);
});

test("06:00 London cron guard handles GMT and BST", () => {
  assert.deepEqual(londonClock(new Date("2026-01-15T06:00:00Z")), { day: "2026-01-15", hour: 6 });
  assert.deepEqual(londonClock(new Date("2026-07-15T05:00:00Z")), { day: "2026-07-15", hour: 6 });
  assert.equal(londonClock(new Date("2026-07-15T06:00:00Z")).hour, 7);
});

test("chart summary uses six calendar months including months with no bookings", () => {
  const summary = buildMonthlyVisualSummary([
    { label: "Jan 26", total: 42 },
    { label: "Feb 26", total: 52 },
    { label: "Mar 26", total: 45 },
    { label: "Apr 26", total: 46 },
    { label: "May 26", total: 33 },
    { label: "Jun 26", total: 33 },
    { label: "Jul 26", total: 39 },
  ], "Jobs", "total", new Date("2026-07-15T08:00:00Z"));

  assert.match(summary, /June 2026 recorded 33 jobs, unchanged from May 2026/);
  assert.match(summary, /9\.2% below the preceding six-month average of 36\.3/);
  assert.match(summary, /July 2026 onward is forward pipeline and incomplete, not a forecast/);
});

test("chart month phase separates completed results from pipeline", () => {
  const now = new Date("2026-07-15T08:00:00Z");
  assert.equal(getStatisticsMonthPhase("Jun 26", now), "completed");
  assert.equal(getStatisticsMonthPhase("Jul 26", now), "pipeline");
  assert.equal(getStatisticsMonthPhase("Aug 26", now), "pipeline");
});
