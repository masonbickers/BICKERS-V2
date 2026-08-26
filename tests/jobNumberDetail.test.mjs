import assert from "node:assert/strict";
import test from "node:test";

import {
  REOPENED_BOOKING_STATUS,
  buildReopenBookingPayload,
  isLockedJobStatus,
  lockedBookingMessage,
} from "../src/app/utils/jobNumberDetail.js";

test("recognizes every view-only Job Number status", () => {
  for (const status of ["DNH", "Cancelled", "canceled", "Postponed", "Lost"]) {
    assert.equal(isLockedJobStatus(status), true, status);
  }

  for (const status of ["Enquiry", "Confirmed", "Complete", "Ready to Invoice", "Paid", "Deleted"]) {
    assert.equal(isLockedJobStatus(status), false, status);
  }
});

test("builds a complete reopen transition without restoring cleared crew", () => {
  const job = {
    id: "booking-1",
    status: "DNH",
    bookingDates: ["2026-08-26"],
    vehicles: [{ id: "vehicle-1", name: "Tracking Car" }],
    vehicleStatus: { "vehicle-1": "DNH" },
    employees: [],
    employeesByDate: {},
    allocatedCrewCount: 0,
    requiredCrewCount: 1,
    attachments: [{ name: "job.pdf", url: "https://example.test/job.pdf" }],
    statusReasons: ["Weather"],
    history: [],
  };
  const timestamp = "2026-08-26T08:30:00.000Z";

  const payload = buildReopenBookingPayload(job, {
    timestamp,
    actor: { email: "editor@example.test", uid: "editor-1" },
  });

  assert.equal(payload.status, REOPENED_BOOKING_STATUS);
  assert.deepEqual(payload.vehicleStatus, {
    "vehicle-1": "Enquiry",
    "Tracking Car": "Enquiry",
  });
  assert.equal(payload.allocatedCrewCountDerived, 0);
  assert.equal(payload.requiredCrewCountDerived, 1);
  assert.equal(payload.lifecycle.currentStatus, "Enquiry");
  assert.equal(payload.lifecycle.closedAt, null);
  assert.equal(payload.statusHistory.at(-1).from, "DNH");
  assert.equal(payload.statusHistory.at(-1).to, "Enquiry");
  assert.equal(payload.lastEditedBy, "editor@example.test");
  assert.equal(payload.history.at(-1).action, "Reopened");
  assert.equal("employees" in payload, false);
  assert.equal("attachments" in payload, false);
  assert.deepEqual(job.statusReasons, ["Weather"]);
});

test("uses clear locked-state copy", () => {
  assert.equal(
    lockedBookingMessage("dnh"),
    "This booking is marked DNH and is view-only. Invoicing and timesheets are not required."
  );
});
