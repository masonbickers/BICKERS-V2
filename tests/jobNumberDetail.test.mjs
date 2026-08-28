import assert from "node:assert/strict";
import test from "node:test";

import {
  REOPENED_BOOKING_STATUS,
  buildJobFileRows,
  buildReopenBookingPayload,
  formatJobContacts,
  formatJobLocation,
  formatProductionIdentity,
  getJobNumberBackLabel,
  getStatusTransitionWarnings,
  isLockedJobStatus,
  lockedBookingMessage,
  normalizeJobContacts,
} from "../src/app/utils/jobNumberDetail.js";

test("shows production company and production without duplicating matching names", () => {
  assert.equal(formatProductionIdentity({ client: "BBC", production: "Top Gear" }), "BBC · Top Gear");
  assert.equal(formatProductionIdentity({ client: "BBC" }), "BBC");
  assert.equal(formatProductionIdentity({ production: "Lineage" }), "Lineage");
  assert.equal(formatProductionIdentity({ client: "BBC", production: "bbc" }), "BBC");
  assert.equal(formatProductionIdentity({}), "Booking");
});

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

test("deduplicates primary and additional contacts while preserving and enriching the primary", () => {
  const contacts = normalizeJobContacts({
    contactName: "Joshua Smith",
    contactEmail: "Joshua@Example.com",
    additionalContacts: [
      { name: "Joshua Smith", email: "joshua@example.com", phone: "07980 270602" },
      { name: "Joshua Smith", department: "Production", phone: "07980 270602" },
      { name: "Sam Jones", department: "Accounts", email: "sam@example.com" },
    ],
  });

  assert.deepEqual(contacts, [
    {
      department: "Production",
      name: "Joshua Smith",
      email: "Joshua@Example.com",
      phone: "07980 270602",
    },
    {
      department: "Accounts",
      name: "Sam Jones",
      email: "sam@example.com",
      phone: "",
    },
  ]);
  assert.equal(
    formatJobContacts({ contactName: "Joshua Smith", contactEmail: "joshua@example.com" }),
    "Joshua Smith\njoshua@example.com"
  );

  assert.deepEqual(
    normalizeJobContacts({
      contactPhone: "07980 270602",
      additionalContacts: [
        { name: "Joshua Smith", department: "Production", phone: "07980270602" },
      ],
    }),
    [
      {
        department: "Production",
        name: "Joshua Smith",
        email: "",
        phone: "07980 270602",
      },
    ]
  );
});

test("only title-cases locations that are entirely lowercase", () => {
  assert.equal(formatJobLocation("north london"), "North London");
  assert.equal(formatJobLocation("korea"), "Korea");
  assert.equal(formatJobLocation("BBC Studios"), "BBC Studios");
  assert.equal(formatJobLocation("North London"), "North London");
});

test("uses contextual Job Number back labels", () => {
  assert.equal(getJobNumberBackLabel("/enquiry"), "Back to Enquiries");
  assert.equal(getJobNumberBackLabel("/enquiry?chase=needs-action"), "Back to Enquiries");
  assert.equal(getJobNumberBackLabel("/job-home"), "Back to Jobs Sheets");
});

test("returns warnings only for guarded target statuses", () => {
  const bookingBlockers = [
    { key: "vehicle", label: "Vehicle assigned", actionLabel: "Assign vehicle" },
    { key: "contact", label: "Booking contact added", actionLabel: "Add contact" },
  ];
  const invoiceBlockers = [
    { key: "status", label: "Status complete" },
    { key: "PO", label: "PO reference", actionLabel: "Add PO" },
    { key: "timesheets", label: "Linked timesheets", actionLabel: "Review timesheets" },
  ];

  assert.deepEqual(
    getStatusTransitionWarnings({ targetStatus: "Complete", bookingBlockers, invoiceBlockers }),
    ["Assign vehicle", "Add contact"]
  );
  assert.deepEqual(
    getStatusTransitionWarnings({ targetStatus: "Ready to Invoice", bookingBlockers, invoiceBlockers }),
    ["Add PO", "Review timesheets"]
  );
  assert.deepEqual(
    getStatusTransitionWarnings({ targetStatus: "Needs Action", bookingBlockers, invoiceBlockers }),
    []
  );
});

test("renders a current PDF once and synthesizes a row only when needed", () => {
  const currentUrl = "https://files.example/current.pdf";
  const matching = buildJobFileRows({
    currentPdfUrl: currentUrl,
    attachments: [
      { name: "Current job.pdf", url: currentUrl, size: 1024 },
      { name: "Notes.pdf", url: "https://files.example/notes.pdf" },
    ],
  });
  assert.equal(matching.length, 2);
  assert.equal(matching[0].isCurrentPdf, true);
  assert.equal(matching[0].isSynthetic, false);

  const unmatched = buildJobFileRows({
    currentPdfUrl: currentUrl,
    attachments: [{ name: "Notes.pdf", url: "https://files.example/notes.pdf" }],
  });
  assert.equal(unmatched.length, 2);
  assert.deepEqual(unmatched[0], {
    name: "Current PDF",
    url: currentUrl,
    isCurrentPdf: true,
    isSynthetic: true,
  });
});
