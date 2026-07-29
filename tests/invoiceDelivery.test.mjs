import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInvoiceDeliveryState } from "../src/app/utils/invoiceLifecycle.js";

test("normalises invoice delivery independently from lifecycle and Sage state", () => {
  assert.deepEqual(createInvoiceDeliveryState(), {
    status: "not_sent",
    recipient: null,
    subject: null,
    attemptCount: 0,
    lastAttemptAt: null,
    sentAt: null,
    provider: null,
    providerMessageId: null,
    sentBy: null,
    error: null,
  });
  const failed = createInvoiceDeliveryState({
    status: "failed",
    attemptCount: 2,
    recipient: "accounts@example.com",
    error: { code: "provider_error", message: "Try again" },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.attemptCount, 2);
  assert.equal(failed.error.code, "provider_error");
});

test("protected delivery sends the stored authoritative PDF without regenerating it", () => {
  const route = readFileSync(
    new URL("../src/app/api/invoices/[id]/delivery/route.js", import.meta.url),
    "utf8"
  );
  assert.match(route, /requireActiveUserFromRequest\(req\)/);
  assert.match(route, /invoice\.issuedDocument\.storagePath/);
  assert.match(route, /adminDownloadStorageObject/);
  assert.match(route, /issuedDocument\.sha256/);
  assert.match(route, /sendServerEmail/);
  assert.match(route, /contentType: "application\/pdf"/);
  assert.doesNotMatch(route, /renderIssuedInvoicePdf|ensureIssuedInvoiceDocument/);
});

test("delivery is recipient-bound, audited and retry-safe", () => {
  const route = readFileSync(
    new URL("../src/app/api/invoices/[id]/delivery/route.js", import.meta.url),
    "utf8"
  );
  assert.match(route, /issuedSnapshot\.customer\?\.email/);
  assert.match(route, /Recipient must match the accounts-payable email captured in the issued snapshot/);
  assert.match(route, /invoice_delivery_attempted/);
  assert.match(route, /invoice_delivered/);
  assert.match(route, /invoice_delivery_failed/);
  assert.match(route, /Idempotency|idempotencyKey/);
  assert.match(route, /preconditionUpdateTime/);
});

test("invoice workspace exposes sent, failed and retry states", () => {
  const page = readFileSync(
    new URL("../src/app/invoice/[id]/page.js", import.meta.url),
    "utf8"
  );
  assert.match(page, /sendIssuedInvoice/);
  assert.match(page, /Retry sending invoice/);
  assert.match(page, /Invoice sent/);
  assert.match(page, /Delivery error/);
});
