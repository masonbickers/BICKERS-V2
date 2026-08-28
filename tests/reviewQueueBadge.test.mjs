import test from "node:test";
import assert from "node:assert/strict";

import { countConfirmedIncompleteJobs } from "../src/app/utils/reviewQueueBadge.js";

const now = new Date("2026-08-28T12:00:00+01:00");

test("counts confirmed past jobs awaiting completion", () => {
  assert.equal(countConfirmedIncompleteJobs([
    { jobNumber: "9301", status: "Confirmed", bookingDates: ["2026-08-27"] },
    { jobNumber: "9114.2", status: " confirmed ", date: "2026-08-26" },
  ], now), 2);
});

test("excludes future, ready-to-invoice, paid, and non-job records", () => {
  assert.equal(countConfirmedIncompleteJobs([
    { jobNumber: "9301", status: "Confirmed", date: "2026-08-28" },
    { jobNumber: "9302", status: "Confirmed", date: "2026-08-27", readyToInvoice: true },
    { jobNumber: "9303", status: "Confirmed", date: "2026-08-27", invoiceStatus: "Paid" },
    { jobNumber: "9304", status: "Complete", date: "2026-08-27" },
    { jobNumber: "draft", status: "Confirmed", date: "2026-08-27" },
  ], now), 0);
});

test("uses the latest date for multi-day jobs", () => {
  assert.equal(countConfirmedIncompleteJobs([
    { jobNumber: "9305", status: "Confirmed", bookingDates: ["2026-08-20", "2026-08-29"] },
  ], now), 0);
});
