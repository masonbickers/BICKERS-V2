import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/app/review-queue/CompletionReviewDialog.js", import.meta.url),
  "utf8"
);
const reviewQueueSource = fs.readFileSync(
  new URL("../src/app/review-queue/page.js", import.meta.url),
  "utf8"
);

test("completion review opens an accepted quote in the read-only preview", () => {
  assert.match(source, /`\/quote-view\/\$\{job\.id\}\?quote=\$\{encodeURIComponent\(quoteNumber\)\}`/);
  assert.doesNotMatch(source, /const quoteHref[\s\S]{0,180}`\/quote\/\$\{job\.id\}/);
});

test("an existing completed review can move straight to Ready to Invoice", () => {
  const handler = reviewQueueSource.match(/const markReadyForInvoicing = async \(job\) => \{[\s\S]*?\n  \};/)?.[0] || "";

  assert.match(handler, /if \(job\?\.readyToInvoice === true\)/);
  assert.match(handler, /setQuickStatus\(job, "Ready to Invoice"/);
});

test("Ready to Invoice opens completion review for missing essentials but does not block on warnings", () => {
  const handler = reviewQueueSource.match(/const markReadyForInvoicing = async \(job\) => \{[\s\S]*?\n  \};/)?.[0] || "";

  assert.match(handler, /if \(completionErrors\.length\) \{\s*openCompletionDialog\(job\)/);
  assert.match(handler, /if \(readiness\.blockers\.length\)/);
  assert.doesNotMatch(handler, /\.\.\.readiness\.warnings/);
});

test("completion review exposes separate Complete and Ready to Invoice actions", () => {
  assert.match(source, /submit\("complete"\)/);
  assert.match(source, /submit\("ready_to_invoice"\)/);
  assert.match(source, /"Saving…" : "Complete"/);
  assert.match(source, /"Sending…" : "Ready to Invoice"/);

  const handler = reviewQueueSource.match(/const completeJobWithDetails = async \([\s\S]*?\n  \};/)?.[0] || "";
  assert.match(handler, /const readyForInvoicing = action === "ready_to_invoice"/);
  assert.match(handler, /readyToInvoice: readyForInvoicing/);
  assert.match(handler, /readyForInvoicing \? COMPLETION_REVIEW_DESTINATION_STATUS : "Complete"/);
});
