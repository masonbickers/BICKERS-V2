import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_QUOTE_DOCUMENT_DEFAULTS,
  createQuoteDocumentSnapshot,
  resolveNewQuoteBickersContact,
  resolveQuoteDocumentSnapshot,
} from "../src/app/utils/quoteDocumentDefaults.js";

test("new quotes snapshot current document defaults and contact precedence", () => {
  const defaults = { defaultBickersContact: "Sophie", footerApprovalText: "Approval", footerInfoText: "Contact", vatText: "VAT extra" };
  assert.equal(resolveNewQuoteBickersContact({ defaultBickersContact: "Adam" }, defaults), "Adam");
  assert.equal(resolveNewQuoteBickersContact({}, defaults), "Sophie");
  assert.equal(resolveNewQuoteBickersContact({}, {}), "Adam Eastall");
  assert.deepEqual(createQuoteDocumentSnapshot(defaults), { footerApprovalText: "Approval", footerInfoText: "Contact", vatText: "VAT extra" });
});

test("legacy saved quotes retain legacy wording when no snapshot exists", () => {
  assert.deepEqual(resolveQuoteDocumentSnapshot({}), {
    footerApprovalText: LEGACY_QUOTE_DOCUMENT_DEFAULTS.footerApprovalText,
    footerInfoText: LEGACY_QUOTE_DOCUMENT_DEFAULTS.footerInfoText,
    vatText: LEGACY_QUOTE_DOCUMENT_DEFAULTS.vatText,
  });
});
