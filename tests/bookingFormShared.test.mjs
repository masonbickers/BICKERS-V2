import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExistingJobDetailsLookup,
  mergeBookingContacts,
  normalizeJobNumberForLookup,
} from "../src/app/utils/bookingFormShared.js";

test("normalizes job numbers for matching user input", () => {
  assert.equal(normalizeJobNumberForLookup("  Ab-9309  "), "ab-9309");
});

test("builds reusable production details from bookings with the same job number", () => {
  const lookup = buildExistingJobDetailsLookup([
    {
      jobNumber: "9309",
      client: "Older Productions",
      production: "Older Project",
      updatedAt: "2026-07-01T10:00:00.000Z",
    },
    {
      jobNumber: " 9309 ",
      client: "Bickers Films",
      production: "Summer Campaign",
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(lookup["9309"], {
    client: "Bickers Films",
    production: "Summer Campaign",
    additionalContacts: [],
    bookingCount: 2,
  });
});

test("uses the newest non-empty value for each reusable field", () => {
  const lookup = buildExistingJobDetailsLookup([
    {
      jobNumber: "9309",
      client: "Bickers Films",
      production: "Summer Campaign",
      updatedAt: "2026-07-01T10:00:00.000Z",
    },
    {
      jobNumber: "9309",
      client: "Updated Films",
      production: "",
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(lookup["9309"], {
    client: "Updated Films",
    production: "Summer Campaign",
    additionalContacts: [],
    bookingCount: 2,
  });
});

test("reuses the newest booking contact list for an existing job", () => {
  const lookup = buildExistingJobDetailsLookup([
    {
      jobNumber: "9309",
      additionalContacts: [{ name: "Older Contact", email: "older@example.com" }],
      updatedAt: "2026-07-01T10:00:00.000Z",
    },
    {
      jobNumber: "9309",
      additionalContacts: [
        { department: "Production", name: "Alex Smith", email: "alex@example.com", number: "01234" },
      ],
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(lookup["9309"].additionalContacts, [
    {
      department: "Production",
      departmentOther: "",
      name: "Alex Smith",
      email: "alex@example.com",
      phone: "01234",
    },
  ]);
});

test("merges existing job contacts without deleting or duplicating entered contacts", () => {
  const merged = mergeBookingContacts(
    [{ name: "Alex Smith", email: "alex@example.com" }],
    [
      { name: "Alex Duplicate", email: "ALEX@example.com" },
      { name: "Jamie Jones", phone: "07700 900123" },
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, "Alex Smith");
  assert.equal(merged[1].name, "Jamie Jones");
});
