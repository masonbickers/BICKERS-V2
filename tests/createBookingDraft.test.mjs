import test from "node:test";
import assert from "node:assert/strict";

import { hasMeaningfulCreateBookingDraft } from "../src/app/utils/createBookingDraft.js";

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
