import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STATISTICS_FILTERS,
  getPreviousMonthKey,
  getStatisticsDateRange,
  matchesStatisticsFilters,
} from "../src/app/utils/statisticsFilters.js";
import { getStatusCategory } from "../src/app/utils/bookingAnalytics.js";

test("date presets produce stable range boundaries", () => {
  const now = new Date(2026, 6, 15, 14, 30);
  const thirty = getStatisticsDateRange("30d", "", now);
  assert.equal(thirty.start.getFullYear(), 2026);
  assert.equal(thirty.start.getMonth(), 5);
  assert.equal(thirty.start.getDate(), 15);

  const month = getStatisticsDateRange("month", "2026-02", now);
  assert.equal(month.start.getDate(), 1);
  assert.equal(month.end.getDate(), 28);
  assert.equal(month.end.getHours(), 23);
  assert.deepEqual(getStatisticsDateRange("all", "", now), { start: null, end: null });
});

test("combined filters require every selected facet and the date window", () => {
  const row = {
    status: "Confirmed",
    client: "North Films",
    vehicles: ["Sprinter - AB12 CDE"],
    employees: ["Alex Smith"],
    dates: ["2026-07-10"],
    createdAt: "2026-06-01",
    searchText: "1042 North Films London Alex Smith Sprinter",
  };
  const range = getStatisticsDateRange("month", "2026-07", new Date(2026, 6, 15));
  const filters = { ...DEFAULT_STATISTICS_FILTERS, status: "Confirmed", client: "North Films", employee: "Alex Smith", search: "London" };
  assert.equal(matchesStatisticsFilters(row, filters, range), true);
  assert.equal(matchesStatisticsFilters(row, { ...filters, vehicle: "Crane" }, range), false);
  assert.equal(matchesStatisticsFilters(row, filters, getStatisticsDateRange("month", "2026-05", new Date())), false);
});

test("clearing filters restores the documented defaults", () => {
  assert.deepEqual({ ...DEFAULT_STATISTICS_FILTERS }, {
    rangeMode: "12m",
    search: "",
    status: "All",
    client: "all",
    vehicle: "all",
    employee: "all",
  });
});

test("month comparison uses the immediately preceding calendar month", () => {
  assert.equal(getPreviousMonthKey("2026-07"), "2026-06");
  assert.equal(getPreviousMonthKey("2026-01"), "2025-12");
});

test("status categorisation remains compatible with dashboard groups", () => {
  assert.equal(getStatusCategory("Confirmed"), "confirmed");
  assert.equal(getStatusCategory("Paid"), "won");
  assert.equal(getStatusCategory("Cancelled"), "lost");
  assert.equal(getStatusCategory("First Pencil"), "tentative");
});
