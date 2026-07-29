import test from "node:test";
import assert from "node:assert/strict";
import {
  SAGE_INTEGRATION_PRODUCT,
  createSage50ExportJob,
  validateSage50ConnectorResult,
  validateSage50ExportCandidate,
} from "../src/app/utils/sage50ConnectorContract.js";

const candidate = {
  status: "approved",
  bookingId: "booking-1",
  jobNumber: "9164",
  draftReference: "DRAFT-9164-booking-1",
  currency: "GBP",
  purchaseOrderNumber: "PO-1",
  paymentTermsDays: 30,
  customer: {
    name: "Bad Bird Ltd",
    contactId: "contact-1",
    billingCountry: "GB",
    sageCustomerId: "BADBIRD",
    sageCustomerMappingStatus: "mapped",
  },
  sourceQuote: { quoteNumber: "Q9164-002" },
  lines: [{
    id: "line-1",
    description: "Tracking vehicle",
    quantity: 1,
    unitPrice: 1000,
    taxRate: 20,
    nominalCode: "4000",
    taxCode: "T1",
  }],
  sageSync: { status: "pending" },
};

test("uses only the confirmed Sage 50 Accounts UK target", () => {
  assert.equal(SAGE_INTEGRATION_PRODUCT, "sage_50_accounts_uk");
});

test("builds a deterministic tenant-scoped connector job", () => {
  const job = createSage50ExportJob({
    invoice: candidate,
    tenantId: "company-1",
    requestedBy: "finance@example.com",
    requestedAt: "2026-07-24T12:00:00.000Z",
  });
  assert.equal(job.product, "sage_50_accounts_uk");
  assert.equal(job.tenantId, "company-1");
  assert.equal(job.idempotencyKey, "sage50-sales-invoice:company-1:DRAFT-9164-booking-1");
  assert.deepEqual(job.invoice.totals, { net: 1000, tax: 200, gross: 1200 });
  assert.equal(job.invoice.lines[0].nominalCode, "4000");
  assert.equal(job.invoice.lines[0].taxCode, "T1");
  assert.equal("credentials" in job, false);
});

test("rejects incomplete or unprepared export candidates", () => {
  const errors = validateSage50ExportCandidate({
    ...candidate,
    sageSync: { status: "ready" },
    lines: [{ ...candidate.lines[0], nominalCode: "" }],
  });
  assert.match(errors.join(" "), /prepared for export/i);
  assert.match(errors.join(" "), /nominal code/i);
});

test("validates connector success and failure results", () => {
  assert.deepEqual(validateSage50ConnectorResult({
    contractVersion: 1,
    product: "sage_50_accounts_uk",
    jobId: "job-1",
    outcome: "succeeded",
    postedDate: "2026-07-24",
    sageInvoiceId: "sage-id-1",
    invoiceNumber: "12345",
  }), []);
  assert.match(validateSage50ConnectorResult({
    contractVersion: 1,
    product: "sage_50_accounts_uk",
    jobId: "job-1",
    outcome: "failed",
  }).join(" "), /error message/i);
});
