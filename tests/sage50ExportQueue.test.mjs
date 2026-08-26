import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createExportQueueRecord,
  createLease,
  exportJobDocumentId,
  jobCanBeClaimed,
  nextExportRetryAt,
  publicExportJobStatus,
  verifyLeaseToken,
} from "../src/app/utils/sage50ExportQueue.js";

test("derives a deterministic export document ID from the idempotency key", () => {
  const key = "sage50-sales-invoice:company-1:DRAFT-9164-booking-1";
  assert.equal(exportJobDocumentId(key), exportJobDocumentId(key));
  assert.notEqual(exportJobDocumentId(key), exportJobDocumentId(`${key}-other`));
});

test("creates a canonical queued record from the existing connector contract", () => {
  const record = createExportQueueRecord({
    contract: {
      contractVersion: 2,
      product: "sage_50_accounts_uk",
      jobId: "invoice:company-1:booking-1:DRAFT-1",
      idempotencyKey: "key-1",
      tenantId: "company-1",
      operation: "create_sales_invoice",
      invoice: { bookingId: "booking-1" },
    },
    connectorId: "connector-1",
    now: "2026-07-24T12:00:00.000Z",
  });
  assert.equal(record.status, "queued");
  assert.equal(record.attemptCount, 0);
  assert.equal(record.invoiceId, "booking-1");
});

test("retryable failures wait before a bounded retry", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const nextAttemptAt = nextExportRetryAt(1, now);
  const job = { status: "retry_wait", attemptCount: 1, nextAttemptAt };
  assert.equal(jobCanBeClaimed(job, now.getTime()), false);
  assert.equal(jobCanBeClaimed(job, Date.parse(nextAttemptAt)), true);
  assert.equal(jobCanBeClaimed({ ...job, attemptCount: 3 }, Date.parse(nextAttemptAt)), false);
});

test("lease tokens are secret and expired leases can be recovered", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const lease = createLease(now, 60_000);
  assert.equal(verifyLeaseToken(lease.token, lease.tokenHash), true);
  assert.equal(verifyLeaseToken("wrong", lease.tokenHash), false);
  assert.equal(jobCanBeClaimed({ status: "claimed", leaseExpiresAt: lease.expiresAt }, now.getTime()), false);
  assert.equal(jobCanBeClaimed({ status: "claimed", leaseExpiresAt: lease.expiresAt }, now.getTime() + 60_001), true);
});

test("safe status excludes payload and lease secrets", () => {
  const status = publicExportJobStatus({
    jobId: "job-1",
    idempotencyKey: "key-1",
    invoiceId: "invoice-1",
    tenantId: "company-1",
    status: "processing",
    leaseTokenHash: "secret",
    invoice: { draftReference: "DRAFT-1", customer: { sageCustomerId: "PRIVATE" } },
  });
  assert.equal(status.draftReference, "DRAFT-1");
  assert.equal("leaseTokenHash" in status, false);
  assert.equal("invoice" in status, false);
});

test("claim and callbacks use Firestore concurrency preconditions and never issue invoices", () => {
  const claim = readFileSync(
    new URL("../src/app/api/integrations/sage50/export-jobs/claim/route.js", import.meta.url),
    "utf8"
  );
  const helper = readFileSync(
    new URL("../src/app/api/integrations/sage50/export-jobs/_lib.js", import.meta.url),
    "utf8"
  );
  const succeeded = readFileSync(
    new URL("../src/app/api/integrations/sage50/export-jobs/[jobId]/succeeded/route.js", import.meta.url),
    "utf8"
  );
  const queue = readFileSync(
    new URL("../src/app/api/integrations/sage50/export-jobs/route.js", import.meta.url),
    "utf8"
  );
  const failed = readFileSync(
    new URL("../src/app/api/integrations/sage50/export-jobs/[jobId]/failed/route.js", import.meta.url),
    "utf8"
  );
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(claim, /updateJobWithPrecondition/);
  assert.match(claim, /connectorReadyForInvoiceWrite/);
  assert.match(queue, /connectorReadyForInvoiceWrite/);
  assert.match(failed, /nextExportRetryAt/);
  assert.match(helper, /preconditionUpdateTime/);
  assert.equal(succeeded.includes('adminPatchDocument("invoiceQueue"'), false);
  assert.equal(succeeded.includes("invoiceLifecycleChanged: false"), true);
  assert.equal(rules.includes("match /sage50ExportJobs/{jobId}"), true);
});
