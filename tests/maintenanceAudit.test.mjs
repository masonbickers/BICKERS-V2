import assert from "node:assert/strict";
import test from "node:test";

import { buildMaintenanceCreatedHistoryEntry } from "../src/app/utils/maintenanceAudit.js";

test("created maintenance history includes booking reference, location, and cost", () => {
  const entry = buildMaintenanceCreatedHistoryEntry({
    booking: {
      type: "WORK",
      vehicleLabel: "Audi A3",
      status: "Booked",
      appointmentDateISO: "2026-08-10",
      provider: "Example Garage",
      bookingRef: "REF-123",
      location: "London",
      cost: "250.00",
    },
    user: { email: "tester@example.com", uid: "user-1" },
    timestamp: "2026-07-28T12:00:00.000Z",
  });

  assert.equal(entry.action, "Created");
  assert.equal(entry.user, "tester@example.com");
  assert.match(entry.details, /Booking ref: Blank -> REF-123/);
  assert.match(entry.details, /Location: Blank -> London/);
  assert.match(entry.details, /Cost: Blank -> 250.00/);
});
