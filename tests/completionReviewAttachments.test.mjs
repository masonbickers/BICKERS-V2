import test from "node:test";
import assert from "node:assert/strict";

import { buildCompletionAttachmentPatch } from "../src/app/utils/completionReviewAttachments.js";

const existing = [
  { name: "quote.pdf", type: "application/pdf", url: "https://files/quote.pdf" },
  { name: "quote.xls", type: "application/vnd.ms-excel", url: "https://files/quote.xls" },
];

test("removes a selected quote attachment and retains other job documents", () => {
  assert.deepEqual(buildCompletionAttachmentPatch(existing, [0]), {
    changed: true,
    attachments: [existing[1]],
    pdfUrl: null,
  });
});

test("adds a replacement quote PDF after staged removals", () => {
  const replacement = {
    name: "replacement.pdf",
    type: "application/pdf",
    url: "https://files/replacement.pdf",
  };

  assert.deepEqual(buildCompletionAttachmentPatch(existing, [0], replacement), {
    changed: true,
    attachments: [existing[1], replacement],
    pdfUrl: replacement.url,
  });
});

test("leaves attachments untouched when the dialog has no document changes", () => {
  assert.deepEqual(buildCompletionAttachmentPatch(existing), {
    changed: false,
    attachments: existing,
    pdfUrl: existing[0].url,
  });
});
