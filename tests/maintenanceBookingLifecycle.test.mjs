import assert from "node:assert/strict";
import test from "node:test";

import { resolveMaintenanceBookedOn } from "../src/app/utils/maintenanceBookingLifecycle.js";

test("completion preserves the original booked-on date for the same booking", () => {
  assert.equal(
    resolveMaintenanceBookedOn({
      bookingId: "booking-1",
      summaryBookingId: "booking-1",
      summaryBookedOn: "2026-02-10",
      bookingCreatedAt: "2026-02-10T09:00:00.000Z",
      fallbackISO: "2026-03-13",
    }),
    "2026-02-10"
  );
});

test("the booking creation date repairs an already overwritten summary date", () => {
  assert.equal(
    resolveMaintenanceBookedOn({
      bookingId: "booking-1",
      summaryBookingId: "booking-1",
      summaryBookedOn: "2026-03-13",
      bookingCreatedAt: "2026-02-10T09:00:00.000Z",
      fallbackISO: "2026-03-13",
    }),
    "2026-02-10"
  );
});

test("a new booking uses its creation date rather than its completion date", () => {
  assert.equal(
    resolveMaintenanceBookedOn({
      bookingId: "booking-2",
      summaryBookingId: "old-booking",
      summaryBookedOn: "2025-01-01",
      bookingCreatedAt: "2026-02-12T14:30:00.000Z",
      fallbackISO: "2026-03-13",
    }),
    "2026-02-12"
  );
});
