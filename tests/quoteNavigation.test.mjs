import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiaryBookingReturnTo,
  buildQuoteHref,
  buildSavedQuoteUrl,
  isSafeInternalPath,
  safeInternalPath,
} from "../src/app/utils/quoteNavigation.js";

test("diary return destinations preserve date and view and reopen the booking", () => {
  assert.equal(
    buildDiaryBookingReturnTo({
      pathname: "/dashboard",
      search: "?date=2026-10-03&view=week",
      bookingId: "booking 9309",
    }),
    "/dashboard?date=2026-10-03&view=week&booking=booking+9309"
  );
});

test("a stale booking parameter is replaced without losing other diary filters", () => {
  assert.equal(
    buildDiaryBookingReturnTo({
      pathname: "/dashboard?date=2026-10-03",
      search: "?view=month&booking=old",
      bookingId: "new",
    }),
    "/dashboard?date=2026-10-03&view=month&booking=new"
  );
});

test("quote routes preserve selected revisions, embedding, and safe return paths", () => {
  assert.equal(
    buildQuoteHref({
      mode: "view",
      bookingId: "booking/1",
      quoteNumber: "Q9309-003.2",
      returnTo: "/dashboard?date=2026-10-03&view=week&booking=booking%2F1",
      embed: true,
    }),
    "/quote-view/booking%2F1?quote=Q9309-003.2&returnTo=%2Fdashboard%3Fdate%3D2026-10-03%26view%3Dweek%26booking%3Dbooking%252F1&embed=1"
  );
});

test("unsafe return destinations are rejected", () => {
  assert.equal(isSafeInternalPath("//example.com/steal"), false);
  assert.equal(isSafeInternalPath("https://example.com/steal"), false);
  assert.equal(safeInternalPath("//example.com/steal", "/edit-booking/1"), "/edit-booking/1");
  assert.equal(
    buildQuoteHref({
      mode: "edit",
      bookingId: "1",
      quoteNumber: "Q1-001",
      returnTo: "https://example.com/steal",
    }),
    "/quote/1?quote=Q1-001"
  );
});

test("saving selects the saved quote while preserving builder context", () => {
  assert.equal(
    buildSavedQuoteUrl({
      pathname: "/quote/booking-1",
      search:
        "?quote=Q9309-003&returnTo=%2Fdashboard%3Fdate%3D2026-10-03%26view%3Dweek&embed=1&action=new",
      quoteNumber: "Q9309-004.1",
    }),
    "/quote/booking-1?quote=Q9309-004.1&returnTo=%2Fdashboard%3Fdate%3D2026-10-03%26view%3Dweek&embed=1"
  );
});
