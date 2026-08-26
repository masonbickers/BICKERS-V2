import test from "node:test";
import assert from "node:assert/strict";

import {
  hasMeaningfulCreateBookingDraft,
  isEmptyCreateBookingDraftEntry,
} from "../src/app/utils/createBookingDraft.js";

test("does not save a newly opened, untouched booking as a draft", () => {
  assert.equal(
    hasMeaningfulCreateBookingDraft({
      jobNumber: "9251",
      status: "First Pencil",
      shootType: "Day",
      requiredCrewCount: 1,
    }),
    false
  );
});

test("does not save an untouched enquiry as a draft", () => {
  assert.equal(
    hasMeaningfulCreateBookingDraft(
      { jobNumber: "9251", status: "Enquiry", shootType: "Day" },
      { initialStatus: "Enquiry" }
    ),
    false
  );
});

test("saves genuinely entered booking details", () => {
  assert.equal(hasMeaningfulCreateBookingDraft({ client: "Gymshark Ltd" }), true);
  assert.equal(hasMeaningfulCreateBookingDraft({ po: "PO-1001" }), true);
  assert.equal(hasMeaningfulCreateBookingDraft({ status: "Confirmed" }), true);
});

test("identifies legacy untouched booking and enquiry drafts as empty", () => {
  assert.equal(
    isEmptyCreateBookingDraftEntry({
      title: "9251",
      data: {
        jobNumber: "9251",
        status: "First Pencil",
        shootType: "Day",
        requiredCrewCount: 1,
      },
    }),
    true
  );
  assert.equal(
    isEmptyCreateBookingDraftEntry({
      title: "Untitled Draft",
      data: { status: "Enquiry", shootType: "Day" },
    }),
    true
  );
});

test("never classifies partially completed booking drafts as empty", () => {
  assert.equal(isEmptyCreateBookingDraftEntry({ data: { client: "Gymshark Ltd" } }), false);
  assert.equal(isEmptyCreateBookingDraftEntry({ data: { startDate: "2026-08-28" } }), false);
  assert.equal(isEmptyCreateBookingDraftEntry({ data: { vehicles: ["vehicle-1"] } }), false);
  assert.equal(isEmptyCreateBookingDraftEntry({ data: { notes: "Hold for confirmation" } }), false);
});
