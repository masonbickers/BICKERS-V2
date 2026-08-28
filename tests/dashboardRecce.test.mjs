import assert from "node:assert/strict";
import test from "node:test";

import {
  bookingIdForRecceEvent,
  mapReccesByBooking,
} from "../src/app/dashboard/dashboardRecce.js";

test("uses the original booking id for grouped Diary events", () => {
  assert.equal(
    bookingIdForRecceEvent({
      id: "booking-1__date_group__0",
      __bookingId: "booking-1",
    }),
    "booking-1"
  );
  assert.equal(bookingIdForRecceEvent({ id: "booking-2" }), "booking-2");
});

test("maps app recce notes from answers onto the matching booking", () => {
  const result = mapReccesByBooking([
    {
      id: "booking-1__2026-08-28__MB",
      data: () => ({
        bookingId: "booking-1",
        status: "submitted",
        answers: { notes: "Gate access is narrow" },
        createdAt: "2026-08-28T08:00:00.000Z",
      }),
    },
  ]);

  assert.equal(result["booking-1"].notes, "Gate access is narrow");
  assert.equal(result["booking-1"].status, "submitted");
});

test("maps admin fallback rows and keeps the latest recce for each booking", () => {
  const result = mapReccesByBooking([
    {
      id: "older",
      bookingId: "booking-1",
      notes: "Old notes",
      createdAt: "2026-08-27T08:00:00.000Z",
    },
    {
      id: "latest",
      bookingId: "booking-1",
      answers: { notes: "Latest notes" },
      createdAt: { seconds: 1787907600 },
    },
  ]);

  assert.equal(result["booking-1"].id, "latest");
  assert.equal(result["booking-1"].notes, "Latest notes");
});
