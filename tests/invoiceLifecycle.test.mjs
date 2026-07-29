import test from "node:test";
import assert from "node:assert/strict";
import {
  INVOICE_STATUSES,
  calculateInvoiceTotals,
  createDraftReference,
  createInvoiceDraftFromQuote,
  createSageSyncState,
  getInvoiceIdentityDisplay,
  getSageReadiness,
  hydrateInvoiceDraftForEditing,
  isLegacyLocalInvoiceNumber,
  normaliseInvoiceIdentity,
  parseInvoiceRecord,
  resolveAcceptedQuote,
  serialiseInvoiceForPersistence,
  transitionInvoice,
  validateInvoice,
} from "../src/app/utils/invoiceLifecycle.js";

const booking = {
  id: "booking-1",
  jobNumber: "1234",
  client: "Example Productions",
  acceptedQuoteNumber: "1234-Q1-R2",
  quoteVersions: [
    { quoteNumber: "1234-Q1", status: "Draft", lineItems: [] },
    {
      quoteNumber: "1234-Q1-R2",
      version: 2,
      status: "Accepted",
      savedAt: "2026-07-01T10:00:00.000Z",
      lineItems: [
        { id: "a", section: "Crew", description: "Technician", qty: "2", unitPrice: "500", totalMode: "auto" },
        { id: "b", description: "TBC extra", qty: "", unitPrice: "50", totalMode: "tbc" },
      ],
    },
  ],
};

test("resolves the explicitly accepted quote version", () => {
  assert.equal(resolveAcceptedQuote(booking).quoteNumber, "1234-Q1-R2");
});

test("resolves the latest saved quote after the job is completed", () => {
  const resolved = resolveAcceptedQuote({
    status: "Ready to Invoice",
    quoteVersions: [
      { quoteNumber: "Q9164-001", lineItems: [] },
      { quoteNumber: "Q9164-002", lineItems: [] },
    ],
  });
  assert.equal(resolved.quoteNumber, "Q9164-002");
});

test("adds the selected quote number to a legacy accepted quote snapshot", () => {
  const resolved = resolveAcceptedQuote({
    acceptedQuoteNumber: "Q9164-002",
    quoteVersions: [{ status: "Accepted", lineItems: [{ description: "Vehicle" }] }],
  });
  assert.equal(resolved.quoteNumber, "Q9164-002");
});

test("creates an editable invoice draft while preserving the quote snapshot", () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
    actor: "finance@example.com",
    now: "2026-07-02T09:00:00.000Z",
  });
  assert.equal(draft.draftReference, "DRAFT-1234-booking-1");
  assert.equal(draft.invoiceNumber, null);
  assert.deepEqual(draft.sageSync, {
    status: "not_ready",
    sageInvoiceId: null,
    sageCustomerId: null,
    lastAttemptAt: null,
    syncedAt: null,
    error: null,
  });
  assert.equal(draft.status, INVOICE_STATUSES.DRAFT);
  assert.equal(draft.sourceQuote.quoteNumber, "1234-Q1-R2");
  assert.equal(draft.sourceQuote.snapshot.lineItems.length, 2);
  assert.equal(draft.lines.length, 2);
  assert.deepEqual(draft.totals, { net: 1000, tax: 200, gross: 1200 });
  draft.lines[0].unitPrice = 550;
  assert.equal(draft.sourceQuote.snapshot.lineItems[0].unitPrice, "500");
});

test("persists only selected quantities and restores all quote lines for editing", () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
  });
  const saved = serialiseInvoiceForPersistence(draft);
  assert.deepEqual(saved.lines.map((line) => line.description), ["Technician"]);

  const editor = hydrateInvoiceDraftForEditing(saved);
  assert.deepEqual(
    editor.lines.map((line) => [line.description, line.quantity]),
    [
      ["Technician", 2],
      ["TBC extra", 0],
    ]
  );
});

test("keeps Sage transport state separate from invoice lifecycle state", () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
  });
  const approved = transitionInvoice(draft, "approved");
  assert.equal(approved.status, "approved");
  assert.equal(approved.sageSync.status, "not_ready");
});

test("derives Sage readiness from approved invoice accounting fields", () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
  });
  const approved = transitionInvoice(
    {
      ...draft,
      customer: {
        ...draft.customer,
        contactId: "contact-1",
        sageCustomerId: "SAGE-CUSTOMER-1",
        sageCustomerMappingStatus: "mapped",
      },
      lines: draft.lines.map((line) => ({
        ...line,
        nominalCode: "4000",
        taxCode: "T1",
      })),
    },
    "approved"
  );
  assert.deepEqual(getSageReadiness(approved), { ready: true, blockers: [] });
  const serialised = serialiseInvoiceForPersistence(approved, draft);
  assert.equal(serialised.status, "approved");
  assert.equal(serialised.sageSync.status, "ready");
});

test("reports missing nominal and tax mappings as Sage readiness blockers", () => {
  const approved = transitionInvoice(
    {
      ...createInvoiceDraftFromQuote({
      booking,
      quote: resolveAcceptedQuote(booking),
      }),
      customer: {
        name: "Example Productions",
        contactId: "contact-1",
        billingCountry: "GB",
        sageCustomerId: "SAGE-CUSTOMER-1",
        sageCustomerMappingStatus: "mapped",
      },
    },
    "approved"
  );
  assert.deepEqual(
    getSageReadiness(approved).blockers.map((blocker) => blocker.code),
    ["nominal_code_missing", "tax_code_missing"]
  );
});

test("parses old invoice records with safe Sage defaults", () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
  });
  delete draft.sageSync;
  const parsed = parseInvoiceRecord(draft, booking);
  assert.equal(parsed.sageSync.status, "not_ready");
  assert.equal(parsed.sageSync.sageInvoiceId, null);
});

test("ordinary persistence cannot overwrite integration-owned Sage transport state", () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
  });
  const existing = {
    ...draft,
    sageSync: createSageSyncState({
      status: "syncing",
      sageInvoiceId: "sage-id-1",
      lastAttemptAt: "2026-07-24T09:00:00.000Z",
    }),
  };
  const serialised = serialiseInvoiceForPersistence(
    {
      ...existing,
      sageSync: {
        status: "synced",
        sageInvoiceId: "tampered",
      },
    },
    existing
  );
  assert.equal(serialised.sageSync.status, "syncing");
  assert.equal(serialised.sageSync.sageInvoiceId, "sage-id-1");
});

test("rejects unknown Sage sync statuses", () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
  });
  assert.deepEqual(
    validateInvoice({
      ...draft,
      sageSync: { ...draft.sageSync, status: "sent_somewhere" },
    }),
    ["Unsupported Sage sync status."]
  );
});

test("keeps the draft reference stable when a saved draft is loaded", () => {
  const original = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
  });
  const loaded = normaliseInvoiceIdentity(original, booking);
  assert.equal(loaded.draftReference, original.draftReference);
  assert.equal(loaded.invoiceNumber, null);
});

test("uses the unique persisted booking ID in each draft reference", () => {
  const first = createDraftReference({ id: "booking-A7F3", jobNumber: "9164" });
  const second = createDraftReference({ id: "booking-B8G4", jobNumber: "9164" });
  assert.equal(first, "DRAFT-9164-booking-A7F3");
  assert.notEqual(first, second);
});

test("classifies only the exact historical local number for the linked job", () => {
  assert.equal(isLegacyLocalInvoiceNumber("INV-9164", "9164"), true);
  assert.equal(isLegacyLocalInvoiceNumber("SI-9164", "9164"), false);
  assert.equal(isLegacyLocalInvoiceNumber("INV-9999", "9164"), false);
});

test("preserves a legacy local number while treating it as unissued", () => {
  const compatible = normaliseInvoiceIdentity(
    {
      bookingId: "booking-legacy",
      jobNumber: "9164",
      status: "draft",
      invoiceNumber: "INV-9164",
    },
    { id: "booking-legacy", jobNumber: "9164" }
  );
  assert.equal(compatible.invoiceNumber, null);
  assert.equal(compatible.legacyLocalInvoiceNumber, "INV-9164");
  assert.equal(compatible.draftReference, "DRAFT-9164-booking-legacy");
});

test("does not overwrite a genuine external invoice number", () => {
  const compatible = normaliseInvoiceIdentity(
    {
      bookingId: "booking-issued",
      jobNumber: "9164",
      status: "issued",
      invoiceNumber: "SI-12345",
    },
    { id: "booking-issued", jobNumber: "9164" }
  );
  assert.equal(compatible.invoiceNumber, "SI-12345");
});

test("describes a numberless preview as a draft and keeps identities separate", () => {
  const identity = getInvoiceIdentityDisplay({
    jobNumber: "9164",
    draftReference: "DRAFT-9164-booking-A7F3",
    invoiceNumber: null,
  });
  assert.equal(identity.documentLabel, "Draft invoice");
  assert.equal(identity.officialNumber, "Pending");
  assert.equal(identity.draftReference, "DRAFT-9164");
});

test("calculates VAT per line and totals", () => {
  const totals = calculateInvoiceTotals([
    { description: "A", quantity: 2, unitPrice: 10, taxRate: 20 },
    { description: "B", quantity: 1, unitPrice: 5, taxRate: 0 },
  ]);
  assert.deepEqual({ net: totals.net, tax: totals.tax, gross: totals.gross }, { net: 25, tax: 4, gross: 29 });
});

test("requires Sage to assign a number before an approved invoice can be issued", () => {
  const draft = createInvoiceDraftFromQuote({ booking, quote: resolveAcceptedQuote(booking) });
  assert.throws(() => transitionInvoice(draft, "issued"), /cannot move/);
  const approved = transitionInvoice(draft, "approved");
  assert.throws(() => transitionInvoice(approved, "issued"), /Sage invoice number/);
  const issued = transitionInvoice(
    { ...approved, invoiceNumber: "SI-12345" },
    "issued"
  );
  assert.equal(issued.status, "issued");
  assert.equal(issued.invoiceNumber, "SI-12345");
  assert.equal(issued.audit.at(-1).fromStatus, "approved");
});

test("validates required authoritative fields", () => {
  assert.deepEqual(validateInvoice({}), [
    "Unsupported invoice schema version.",
    "Booking is required.",
    "Approved job quote is required.",
    "Customer name is required.",
    "At least one invoice line is required.",
  ]);
});

test("requires a draft reference on new-schema invoice records", () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
  });
  assert.deepEqual(validateInvoice({ ...draft, draftReference: "" }), [
    "Draft reference is required.",
  ]);
});
