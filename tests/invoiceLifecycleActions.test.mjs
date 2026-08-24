import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INVOICE_STATUSES,
  createInvoiceDraftFromQuote,
  resolveAcceptedQuote,
} from "../src/app/utils/invoiceLifecycle.js";
import {
  INVOICE_LIFECYCLE_ACTIONS,
  applyProtectedInvoiceAction,
  buildProtectedDraftSave,
} from "../src/app/utils/invoiceLifecycleActions.js";

const booking = {
  id: "booking-1",
  jobNumber: "9164",
  companyId: "company-1",
  client: "Bad Bird",
  acceptedQuoteNumber: "Q9164-001",
  quoteVersions: [
    {
      quoteNumber: "Q9164-001",
      status: "Accepted",
      lineItems: [
        {
          id: "line-1",
          description: "Tracking vehicle",
          qty: 1,
          unitPrice: 1000,
          totalMode: "auto",
          nominalCode: "4000",
          taxCode: "T1",
        },
      ],
    },
  ],
};

const createDraft = () => {
  const draft = createInvoiceDraftFromQuote({
    booking,
    quote: resolveAcceptedQuote(booking),
    actor: "creator@example.com",
    now: "2026-07-24T08:00:00.000Z",
  });
  return {
    ...draft,
    customer: {
      ...draft.customer,
      contactId: "contact-1",
      sageCustomerId: "SAGE-CUSTOMER-1",
      sageCustomerMappingStatus: "mapped",
    },
  };
};

test("protected draft save strips attempted authoritative lifecycle changes", () => {
  const draft = createDraft();
  const saved = buildProtectedDraftSave({
    incoming: {
      ...draft,
      status: "paid",
      invoiceNumber: "FAKE-1",
      paidAt: "2026-07-24T09:00:00.000Z",
      sageSync: { status: "synced", sageInvoiceId: "fake" },
    },
    booking,
    actor: "finance@example.com",
    now: "2026-07-24T09:05:00.000Z",
  });
  assert.equal(saved.status, INVOICE_STATUSES.DRAFT);
  assert.equal(saved.invoiceNumber, null);
  assert.equal(saved.paidAt, "");
  assert.equal(saved.sageSync.sageInvoiceId, null);
  assert.equal(saved.audit.at(-1).action, "draft_created");
});

test("protected draft save persists internal finance notes without changing the public note", () => {
  const draft = createDraft();
  const saved = buildProtectedDraftSave({
    incoming: {
      ...draft,
      notes: "Thank you for your business.",
      internalFinanceNotes: "Check the agreed mileage before approval.",
    },
    booking,
    actor: "finance@example.com",
    now: "2026-07-24T09:05:00.000Z",
  });
  assert.equal(saved.notes, "Thank you for your business.");
  assert.equal(saved.internalFinanceNotes, "Check the agreed mileage before approval.");
});

test("approval runs through the canonical transition and writes actor audit", () => {
  const approved = applyProtectedInvoiceAction({
    invoice: createDraft(),
    action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
    actor: "finance@example.com",
    now: "2026-07-24T10:00:00.000Z",
  });
  assert.equal(approved.status, INVOICE_STATUSES.APPROVED);
  assert.equal(approved.approvedAt, "2026-07-24T10:00:00.000Z");
  assert.equal(approved.audit.at(-1).by, "finance@example.com");
});

test("protected approval enforces a required customer PO policy", () => {
  const invoice = {
    ...createDraft(),
    customer: { ...createDraft().customer, poRequirement: "required" },
    purchaseOrderNumber: "",
  };
  assert.throws(
    () => applyProtectedInvoiceAction({
      invoice,
      action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
      actor: "finance@example.com",
    }),
    /requires a PO number/i
  );
});

test("returning an invoice to draft requires a reason", () => {
  const approved = applyProtectedInvoiceAction({
    invoice: createDraft(),
    action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
    actor: "finance@example.com",
  });
  assert.throws(
    () =>
      applyProtectedInvoiceAction({
        invoice: approved,
        action: INVOICE_LIFECYCLE_ACTIONS.RETURN_TO_DRAFT,
        actor: "finance@example.com",
      }),
    /reason is required/i
  );
});

test("export preparation changes Sage transport state without issuing invoice", () => {
  const approved = applyProtectedInvoiceAction({
    invoice: createDraft(),
    action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
    actor: "finance@example.com",
  });
  const pending = applyProtectedInvoiceAction({
    invoice: approved,
    action: INVOICE_LIFECYCLE_ACTIONS.PREPARE_FOR_EXPORT,
    actor: "finance@example.com",
    now: "2026-07-24T11:00:00.000Z",
  });
  assert.equal(pending.status, INVOICE_STATUSES.APPROVED);
  assert.equal(pending.invoiceNumber, null);
  assert.equal(pending.sageSync.status, "pending");
  assert.equal(pending.audit.at(-1).action, "accounting_export_prepared");
});

test("external issue confirmation requires external identities", () => {
  const approved = applyProtectedInvoiceAction({
    invoice: createDraft(),
    action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
    actor: "finance@example.com",
  });
  const pending = applyProtectedInvoiceAction({
    invoice: approved,
    action: INVOICE_LIFECYCLE_ACTIONS.PREPARE_FOR_EXPORT,
    actor: "finance@example.com",
  });
  assert.throws(
    () =>
      applyProtectedInvoiceAction({
        invoice: pending,
        action: INVOICE_LIFECYCLE_ACTIONS.CONFIRM_EXTERNAL_ISSUE,
        actor: "admin@example.com",
      }),
    /invoice number and Sage invoice ID/i
  );
  const issued = applyProtectedInvoiceAction({
    invoice: pending,
    action: INVOICE_LIFECYCLE_ACTIONS.CONFIRM_EXTERNAL_ISSUE,
    actor: "admin@example.com",
    invoiceNumber: "SI-1001",
    sageInvoiceId: "sage-invoice-1",
    postedDate: "2026-07-24",
    now: "2026-07-24T12:00:00.000Z",
  });
  assert.equal(issued.status, INVOICE_STATUSES.ISSUED);
  assert.equal(issued.invoiceNumber, "SI-1001");
  assert.equal(issued.sageSync.status, "synced");
  assert.equal(issued.sageSync.sageInvoiceId, "sage-invoice-1");
});

test("voiding requires a reason and remains audited", () => {
  assert.throws(
    () =>
      applyProtectedInvoiceAction({
        invoice: createDraft(),
        action: INVOICE_LIFECYCLE_ACTIONS.VOID,
        actor: "finance@example.com",
      }),
    /reason is required/i
  );
  const voided = applyProtectedInvoiceAction({
    invoice: createDraft(),
    action: INVOICE_LIFECYCLE_ACTIONS.VOID,
    actor: "finance@example.com",
    reason: "Duplicate draft",
  });
  assert.equal(voided.status, INVOICE_STATUSES.VOID);
  assert.equal(voided.audit.at(-1).reason, "Duplicate draft");
});

test("an externally issued invoice cannot be locally voided", () => {
  const approved = applyProtectedInvoiceAction({
    invoice: createDraft(),
    action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
    actor: "finance@example.com",
  });
  const pending = applyProtectedInvoiceAction({
    invoice: approved,
    action: INVOICE_LIFECYCLE_ACTIONS.PREPARE_FOR_EXPORT,
    actor: "finance@example.com",
  });
  const issued = applyProtectedInvoiceAction({
    invoice: pending,
    action: INVOICE_LIFECYCLE_ACTIONS.CONFIRM_EXTERNAL_ISSUE,
    actor: "admin@example.com",
    invoiceNumber: "SI-1002",
    sageInvoiceId: "sage-invoice-2",
    postedDate: "2026-07-24",
  });
  assert.throws(
    () =>
      applyProtectedInvoiceAction({
        invoice: issued,
        action: INVOICE_LIFECYCLE_ACTIONS.VOID,
        actor: "finance@example.com",
        reason: "Local correction",
      }),
    /accounting void confirmation/i
  );
});

test("manual payment lifecycle actions are rejected", () => {
  assert.throws(
    () =>
      applyProtectedInvoiceAction({
        invoice: createDraft(),
        action: "mark_paid",
        actor: "finance@example.com",
      }),
    /cannot be changed manually/i
  );
});

test("invoice workspace contains no direct authoritative Firestore writes", () => {
  const source = readFileSync(
    new URL("../src/app/invoice/[id]/page.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /\b(setDoc|updateDoc)\s*\(/);
  assert.doesNotMatch(source, /\btransitionInvoice\s*\(/);
});

test("invoice workspace saves the current draft before preview and approval", () => {
  const source = readFileSync(
    new URL("../src/app/invoice/[id]/page.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /openInvoiceDocument[\s\S]*?await persistInvoice\(currentInvoice/);
  assert.match(source, /action === "approve"[\s\S]*?await saveDraft\(\)/);
  assert.match(source, /expectedUpdatedAt: currentInvoice\.updatedAt/);
});

test("customer-facing invoice surfaces never reference internal finance notes", () => {
  for (const relativePath of [
    "../src/app/invoice-view/[id]/page.js",
    "../src/app/utils/issuedInvoicePdf.js",
    "../src/app/api/invoices/[id]/delivery/route.js",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /internalFinanceNotes/);
  }
});

test("lifecycle route requires protected finance authentication", () => {
  const source = readFileSync(
    new URL(
      "../src/app/api/invoices/[id]/lifecycle/route.js",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(source, /requireFinanceFromRequest\(req\)/);
  assert.match(source, /canAccessCompany/);
});

test("Firestore rules make invoice lifecycle records server-write-only", () => {
  const source = readFileSync(
    new URL("../firestore.rules", import.meta.url),
    "utf8"
  );
  const invoiceRule = source.match(
    /match \/invoiceQueue\/\{docId\} \{([\s\S]*?)\n    \}/
  )?.[1] || "";
  assert.match(invoiceRule, /allow read: if hasUserAccess\(\)/);
  assert.match(invoiceRule, /&& isFinanceReviewer\(\)/);
  assert.match(invoiceRule, /&& financeCompanyAllowed\(resource\.data\)/);
  assert.match(invoiceRule, /allow create, update, delete: if false/);
});
