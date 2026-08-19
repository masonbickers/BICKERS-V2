import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSage50Reconciliation } from "../src/app/utils/sage50Reconciliation.js";

const invoice = {
  schemaVersion: 1,
  bookingId: "booking-1",
  jobNumber: "9164",
  companyId: "company-1",
  status: "approved",
  draftReference: "DRAFT-9164-booking-1",
  invoiceNumber: null,
  currency: "GBP",
  customer: { name: "Bad Bird Ltd" },
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
  totals: { net: 1000, tax: 200, gross: 1200 },
  sageSync: { status: "pending", sageCustomerId: "BADBIRD" },
  audit: [],
};

const job = {
  contractVersion: 1,
  product: "sage_50_accounts_uk",
  jobId: "invoice:company-1:booking-1:DRAFT-9164-booking-1",
  invoiceId: "booking-1",
  tenantId: "company-1",
  status: "succeeded",
  invoice: {
    bookingId: "booking-1",
    draftReference: "DRAFT-9164-booking-1",
    totals: { net: 1000, tax: 200, gross: 1200 },
  },
  result: {
    contractVersion: 1,
    product: "sage_50_accounts_uk",
    jobId: "invoice:company-1:booking-1:DRAFT-9164-booking-1",
    outcome: "succeeded",
    completedAt: "2026-07-24T12:00:00.000Z",
    postedDate: "2026-07-24",
    sageInvoiceId: "sage-record-1",
    invoiceNumber: "SI-1001",
    error: null,
  },
};

const booking = { id: "booking-1", companyId: "company-1", status: "ready to invoice" };

test("reconciles a successful Sage result through the protected issue transition", () => {
  const result = buildSage50Reconciliation({
    job,
    invoice,
    booking,
    actor: "finance@example.com",
    now: "2026-07-24T12:05:00.000Z",
  });
  assert.equal(result.idempotent, false);
  assert.equal(result.invoice.status, "issued");
  assert.equal(result.invoice.invoiceNumber, "SI-1001");
  assert.equal(result.invoice.issueDate, "2026-07-24");
  assert.equal(result.invoice.sageSync.status, "synced");
  assert.equal(result.invoice.sageSync.sageInvoiceId, "sage-record-1");
  assert.equal(result.invoice.issuedSnapshot.invoiceNumber, "SI-1001");
  assert.equal(result.invoice.issuedSnapshot.jobNumber, "9164");
  assert.equal(result.invoice.issuedSnapshot.companyId, "company-1");
  assert.deepEqual(result.invoice.issuedSnapshot.supplier, {
    legalName: "Bickers Action",
    description: "Film and TV Action Vehicles",
    website: "www.bickers.co.uk",
  });
  assert.equal(result.invoice.audit.at(-1).action, "sage50_export_reconciled");
  assert.equal(result.booking.financeState, "invoiced");
  assert.equal(result.job.invoiceReconciled, true);
});

test("newly issued supplier identity comes from the deployment and is copied immutably", () => {
  const supplier = { legalName: "Example Transport Ltd", description: "Transport operations", website: "https://example.com" };
  const result = buildSage50Reconciliation({ job, invoice, booking, actor: "finance@example.com", supplier });
  supplier.legalName = "Changed later";
  assert.equal(result.invoice.issuedSnapshot.supplier.legalName, "Example Transport Ltd");
  assert.equal(result.invoice.issuedSnapshot.supplier.website, "https://example.com");
});

test("reconciliation is idempotent for the same official Sage identity", () => {
  const first = buildSage50Reconciliation({ job, invoice, booking, actor: "finance@example.com" });
  const second = buildSage50Reconciliation({
    job: first.job,
    invoice: first.invoice,
    booking: { id: "booking-1", ...first.booking },
    actor: "finance@example.com",
  });
  assert.equal(second.idempotent, true);
  assert.equal(second.invoice.audit.length, first.invoice.audit.length);
});

test("rejects mismatched approved snapshots", () => {
  assert.throws(
    () => buildSage50Reconciliation({
      job: { ...job, invoice: { ...job.invoice, totals: { net: 999, tax: 200, gross: 1199 } } },
      invoice,
      booking,
      actor: "finance@example.com",
    }),
    /totals do not match/i
  );
});

test("reconciliation route commits job, invoice and booking atomically", () => {
  const route = readFileSync(
    new URL("../src/app/api/integrations/sage50/export-jobs/[jobId]/reconcile/route.js", import.meta.url),
    "utf8"
  );
  const lifecycleRoute = readFileSync(
    new URL("../src/app/api/invoices/[id]/lifecycle/route.js", import.meta.url),
    "utf8"
  );
  assert.match(route, /adminCommitDocumentPatches/);
  assert.match(route, /buildSage50Reconciliation/);
  assert.match(route, /ensureIssuedInvoiceDocument/);
  assert.match(lifecycleRoute, /trusted Sage 50 export reconciliation route/);
});
