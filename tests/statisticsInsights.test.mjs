import test from "node:test";
import assert from "node:assert/strict";
import { buildBookingAnalytics } from "../src/app/utils/bookingAnalytics.js";
import { canonicalBookingStatus, bookingOutcomeCategory } from "../src/app/utils/bookingLifecycle.js";
import { DEFAULT_BICKERS_BUSINESS_RULES, validateBickersBusinessRules } from "../src/app/utils/bickersBusinessRules.js";
import { buildStatisticsInsightSnapshot, redactSnapshotForVariant } from "../src/app/utils/statisticsInsightSnapshot.js";
import { londonClock } from "../src/app/utils/londonTime.js";

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
