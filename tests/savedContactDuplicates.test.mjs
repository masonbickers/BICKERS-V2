import assert from "node:assert/strict";
import test from "node:test";

import {
  analyseSavedContactDuplicates,
  canonicalContactEmail,
  createMergedContactPayload,
  normaliseContactPhone,
} from "../src/app/utils/savedContactDuplicates.js";

const contacts = [
  { id: "anna-a", name: "Anna Jurek", email: "seance.pm@gmail.com", department: "Production" },
  { id: "anna-b", name: "Anna Jurek", email: "seancepm@gmail.com", department: "Production" },
  { id: "ella-a", name: "Ella Parla", email: "ella@example.com", phone: "07917 773 952" },
  { id: "ella-b", name: "Ella Parla", email: "ella@other.example", phone: "+44 7917 773952" },
  { id: "josh-a", name: "Joshua J A Smith", email: "joshua@example.com" },
  { id: "josh-b", name: "Joshua Smith", email: "joshua.smith@example.com" },
];

test("canonicalises Gmail dots and UK phone prefixes", () => {
  assert.equal(canonicalContactEmail("Seance.PM+jobs@googlemail.com"), "seancepm@gmail.com");
  assert.equal(normaliseContactPhone("+44 7917 773952"), "07917773952");
});

test("separates strong duplicates from name-only possible matches", () => {
  const audit = analyseSavedContactDuplicates(contacts);
  assert.deepEqual(audit.strongGroups.map((group) => group.contacts.map(({ id }) => id)), [
    ["anna-a", "anna-b"],
    ["ella-a", "ella-b"],
  ]);
  assert.deepEqual(audit.possibleGroups.map((group) => group.contacts.map(({ id }) => id)), [
    ["josh-a", "josh-b"],
  ]);
});

test("builds a merge payload that preserves alternate details", () => {
  const payload = createMergedContactPayload(contacts.slice(2, 4), "ella-a");
  assert.equal(payload.email, "ella@example.com");
  assert.equal(payload.phone, "07917 773 952");
  assert.deepEqual(payload.alternateEmails, ["ella@other.example"]);
  assert.deepEqual(payload.alternatePhones, []);
  assert.deepEqual(payload.mergedContactIds, ["ella-b"]);
  assert.equal(payload.alternateContactDetails[0].id, "ella-b");
});
