import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import {
  INVOICE_LIFECYCLE_ACTIONS,
  applyProtectedInvoiceAction,
  buildProtectedDraftSave,
} from "../src/app/utils/invoiceLifecycleActions.js";
import {
  calculateInvoiceTotals,
  createInvoiceDeliveryState,
  createInvoiceDraftFromQuote,
  getSageReadiness,
  resolveAcceptedQuote,
} from "../src/app/utils/invoiceLifecycle.js";
import {
  createInvoiceCustomerSnapshot,
} from "../src/app/utils/accountingMappings.js";
import { buildFinanceReadiness } from "../src/app/utils/financeReadiness.js";
import {
  FINANCE_GROUPS,
  buildFinanceRows,
  classifyFinanceRecord,
} from "../src/app/utils/financeInvoiceClassification.js";
import {
  createSage50ExportJob,
  validateSage50ConnectorResult,
} from "../src/app/utils/sage50ConnectorContract.js";
import {
  createExportQueueRecord,
  createLease,
  exportJobDocumentId,
  jobCanBeClaimed,
  verifyLeaseToken,
} from "../src/app/utils/sage50ExportQueue.js";
import { buildSage50Reconciliation } from "../src/app/utils/sage50Reconciliation.js";
import { renderIssuedInvoicePdf } from "../src/app/utils/issuedInvoicePdf.js";

const times = Object.freeze({
  handoff: "2026-08-03T08:00:00.000Z",
  draft: "2026-08-03T08:10:00.000Z",
  saved: "2026-08-03T08:20:00.000Z",
  approved: "2026-08-03T08:30:00.000Z",
  reopened: "2026-08-03T08:35:00.000Z",
  reapproved: "2026-08-03T08:40:00.000Z",
  queued: "2026-08-03T08:45:00.000Z",
  claimed: "2026-08-03T08:46:00.000Z",
  processing: "2026-08-03T08:47:00.000Z",
  succeeded: "2026-08-03T08:48:00.000Z",
  reconciled: "2026-08-03T08:49:00.000Z",
  documented: "2026-08-03T08:50:00.000Z",
  delivered: "2026-08-03T08:51:00.000Z",
});

const actors = Object.freeze({
  operations: "test.operations@bickers.invalid",
  finance: "test.finance@bickers.invalid",
  system: "test.reconciliation@bickers.invalid",
  connector: "TEST-CONNECTOR-01",
});

const contact = Object.freeze({
  id: "test-contact-humour",
  companyId: "test-tenant-bickers",
  name: "Humour Productions Test Ltd",
  phone: "020 7946 0000",
  financeProfile: {
    billingLegalName: "Humour Productions Test Ltd",
    billingTradingName: "Humour Test",
    billingAddress: {
      line1: "1 Test Production Way",
      line2: "",
      city: "London",
      county: "",
      postcode: "W1T 1AA",
    },
    billingCountry: "GB",
    accountsPayableContact: "Test Accounts",
    accountsPayableEmail: "accounts.test@example.invalid",
    companyRegistrationNumber: "TEST000001",
    vatNumber: "GB000000000",
    defaultCurrency: "GBP",
    defaultPaymentTerms: 30,
    poRequirement: "required",
    sageCustomerId: "TEST-HUM001",
    sageCustomerMappingStatus: "mapped",
    sageCustomerMappedAt: "2026-08-01T10:00:00.000Z",
    sageCustomerMappedBy: actors.finance,
  },
});

const quote = Object.freeze({
  quoteNumber: "QTEST-9301-002",
  version: 2,
  status: "accepted",
  quoteName: "Test tracking vehicle and crew",
  savedAt: "2026-08-01T09:00:00.000Z",
  acceptedAt: "2026-08-01T10:00:00.000Z",
  subtotal: 1800,
  lineItems: Object.freeze([
    Object.freeze({
      id: "quote-line-vehicle",
      description: "Test tracking vehicle",
      qty: 1,
      unitPrice: 1200,
      nominalCode: "4000",
      taxCode: "T1",
      totalMode: "auto",
    }),
    Object.freeze({
      id: "quote-line-crew",
      description: "Test precision driver",
      qty: 1,
      unitPrice: 600,
      nominalCode: "4001",
      taxCode: "T1",
      totalMode: "auto",
    }),
  ]),
});

const booking = Object.freeze({
  id: "test-booking-9301",
  companyId: "test-tenant-bickers",
  jobNumber: "9301",
  client: "Humour Productions Test Ltd",
  location: "London test location",
  status: "completed",
  readyToInvoice: true,
  operationalReviewComplete: true,
  acceptedQuoteNumber: quote.quoteNumber,
  quoteVersions: Object.freeze([quote]),
  poRequired: true,
  poNumber: "PO-TEST-9301",
  timesheetsRequired: true,
  invoiceContactName: "Test Accounts",
  invoiceContactEmail: "accounts.test@example.invalid",
  crew: Object.freeze([
    Object.freeze({ employeeId: "test-crew-01", name: "Test Crew Member" }),
  ]),
  vehicles: Object.freeze([
    Object.freeze({ vehicleId: "test-vehicle-01", name: "Test Tracking Vehicle" }),
  ]),
});

const timesheet = Object.freeze({
  id: "test-timesheet-9301",
  bookingId: booking.id,
  employeeId: "test-crew-01",
  employeeName: "Test Crew Member",
  status: "approved",
  standardHours: 10,
  overtimeHours: 2,
});

const clone = (value) => structuredClone(value);
const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};
const classification = (currentBooking, invoice = null) =>
  buildFinanceRows({
    bookings: [currentBooking],
    invoices: invoice ? [{ id: currentBooking.id, ...invoice }] : [],
  });

function claimJob(job, connectorId, now) {
  if (job.connectorId !== connectorId || !jobCanBeClaimed(job, Date.parse(now))) {
    throw new Error("Connector cannot claim this export job.");
  }
  const lease = createLease(new Date(now));
  return {
    lease,
    job: {
      ...job,
      status: "claimed",
      attemptCount: job.attemptCount + 1,
      claimedAt: now,
      claimedBy: connectorId,
      leaseTokenHash: lease.tokenHash,
      leaseExpiresAt: lease.expiresAt,
      updatedAt: now,
    },
  };
}

function applySimulatedSuccess(job, result) {
  if (job.status === "succeeded") {
    if (
      job.result?.sageInvoiceId === result.sageInvoiceId &&
      job.result?.invoiceNumber === result.invoiceNumber &&
      job.result?.postedDate === result.postedDate
    ) {
      return { job, idempotent: true };
    }
    throw new Error("Conflicting successful connector callback rejected.");
  }
  if (job.status !== "processing") {
    throw new Error("Only a processing export job can succeed.");
  }
  const errors = validateSage50ConnectorResult(result);
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    idempotent: false,
    job: {
      ...job,
      status: "succeeded",
      completedAt: result.completedAt,
      result,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      updatedAt: result.completedAt,
    },
  };
}

function completeSimulatedDelivery({ invoice, pdf, sentIds }) {
  assert.equal(invoice.status, "issued");
  assert.equal(invoice.issuedDocument.status, "stored");
  assert.equal(digest(pdf), invoice.issuedDocument.sha256);
  const recipient = invoice.issuedSnapshot.customer.email;
  const idempotencyKey = `invoice-delivery:${invoice.companyId}:${invoice.bookingId}`;
  if (sentIds.has(idempotencyKey)) {
    return { invoice, idempotent: true };
  }
  sentIds.add(idempotencyKey);
  const delivery = {
    ...createInvoiceDeliveryState(invoice.delivery),
    status: "sent",
    recipient,
    subject: `Invoice ${invoice.issuedSnapshot.invoiceNumber} from Bickers Action`,
    attemptCount: 1,
    lastAttemptAt: times.delivered,
    sentAt: times.delivered,
    provider: "resend",
    providerMessageId: "test-message-0001",
    sentBy: { uid: "test-finance", email: actors.finance, role: "finance" },
  };
  return {
    idempotent: false,
    invoice: {
      ...invoice,
      delivery,
      audit: [
        ...invoice.audit,
        {
          action: "invoice_delivery_attempted",
          at: times.delivered,
          by: actors.finance,
        },
        {
          action: "invoice_delivered",
          at: times.delivered,
          by: actors.finance,
          metadata: { documentSha256: digest(pdf) },
        },
      ],
    },
  };
}

test("accepted quote reaches one immutable delivered invoice through simulated Sage 50", () => {
  const originalQuoteJson = JSON.stringify(quote);
  const audit = [
    { action: "finance_handoff", at: times.handoff, by: actors.operations },
  ];

  const accepted = resolveAcceptedQuote(booking);
  assert.equal(accepted.quoteNumber, quote.quoteNumber);
  assert.deepEqual(accepted.lineItems, quote.lineItems);

  const readiness = buildFinanceReadiness({
    job: booking,
    timesheets: [timesheet],
    acceptedQuoteNumber: accepted.quoteNumber,
    readyForInvoicing: true,
    hasPurchaseOrder: true,
  });
  assert.equal(readiness.blockers.length, 0);
  assert.equal(readiness.warnings.length, 0);
  assert.ok(
    buildFinanceReadiness({
      job: booking,
      timesheets: [],
      acceptedQuoteNumber: "",
      readyForInvoicing: false,
      hasPurchaseOrder: false,
    }).blockers.length >= 3
  );
  assert.deepEqual(classification(booking).map((row) => row.group), [
    FINANCE_GROUPS.READY_FOR_FINANCE,
  ]);

  const invoiceStore = new Map();
  const initialDraft = createInvoiceDraftFromQuote({
    booking,
    quote: accepted,
    actor: actors.finance,
    now: times.draft,
  });
  initialDraft.customer = createInvoiceCustomerSnapshot(contact);
  const draft = buildProtectedDraftSave({
    incoming: initialDraft,
    booking,
    actor: actors.finance,
    now: times.draft,
  });
  invoiceStore.set(booking.id, draft);
  const repeatedDraft = invoiceStore.get(booking.id) || createInvoiceDraftFromQuote({
    booking,
    quote: accepted,
  });
  assert.equal(invoiceStore.size, 1);
  assert.equal(repeatedDraft.draftReference, draft.draftReference);
  assert.equal(draft.invoiceNumber, null);
  assert.equal(draft.sourceQuote.quoteNumber, quote.quoteNumber);
  audit.push({ action: "invoice_created", at: times.draft, by: actors.finance });

  const variedLines = [
    ...draft.lines,
    {
      id: "invoice-line-overtime",
      description: "Test approved overtime",
      quantity: 2,
      unitPrice: 100,
      taxRate: 20,
      nominalCode: "4001",
      taxCode: "T1",
    },
  ];
  const variedTotals = calculateInvoiceTotals(variedLines);
  const saved = buildProtectedDraftSave({
    existing: draft,
    booking,
    actor: actors.finance,
    now: times.saved,
    incoming: {
      ...draft,
      lines: variedLines,
      totals: { net: 1, tax: 1, gross: 1 },
      status: "issued",
      invoiceNumber: "BROWSER-ATTEMPT",
      sageSync: { status: "synced", sageInvoiceId: "BROWSER-ATTEMPT" },
    },
  });
  assert.deepEqual(saved.totals, {
    net: variedTotals.net,
    tax: variedTotals.tax,
    gross: variedTotals.gross,
  });
  assert.deepEqual(saved.totals, { net: 2000, tax: 400, gross: 2400 });
  assert.equal(saved.totals.net - quote.subtotal, 200);
  assert.equal(saved.status, "draft");
  assert.equal(saved.invoiceNumber, null);
  assert.equal(saved.sageSync.sageInvoiceId, null);
  assert.equal(JSON.stringify(quote), originalQuoteJson);
  audit.push({ action: "draft_saved", at: times.saved, by: actors.finance });

  assert.throws(
    () =>
      applyProtectedInvoiceAction({
        invoice: {
          ...saved,
          lines: saved.lines.map((line, index) =>
            index === 0 ? { ...line, nominalCode: "" } : line
          ),
        },
        action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
        actor: actors.finance,
        now: times.approved,
      }),
    /nominal code/i
  );

  let approved = applyProtectedInvoiceAction({
    invoice: saved,
    action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
    actor: actors.finance,
    reason: "Acceptance-test finance approval",
    now: times.approved,
  });
  const firstApprovedSnapshot = deepFreeze(clone(approved));
  assert.throws(
    () => buildProtectedDraftSave({
      existing: approved,
      incoming: approved,
      booking,
      actor: actors.finance,
    }),
    /only draft/i
  );
  assert.throws(
    () => applyProtectedInvoiceAction({
      invoice: approved,
      action: INVOICE_LIFECYCLE_ACTIONS.RETURN_TO_DRAFT,
      actor: actors.finance,
    }),
    /reason/i
  );
  const reopened = applyProtectedInvoiceAction({
    invoice: approved,
    action: INVOICE_LIFECYCLE_ACTIONS.RETURN_TO_DRAFT,
    actor: actors.finance,
    reason: "Acceptance-test approval correction",
    now: times.reopened,
  });
  approved = applyProtectedInvoiceAction({
    invoice: reopened,
    action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
    actor: actors.finance,
    reason: "Acceptance-test reapproval",
    now: times.reapproved,
  });
  const approvedSnapshot = deepFreeze(clone(approved));
  assert.equal(firstApprovedSnapshot.status, "approved");
  assert.equal(approvedSnapshot.status, "approved");
  assert.throws(() => {
    approvedSnapshot.totals.gross = 1;
  }, TypeError);
  assert.equal(JSON.stringify(quote), originalQuoteJson);
  audit.push({ action: "invoice_approved", at: times.reapproved, by: actors.finance });
  assert.deepEqual(classification(booking, approved).map((row) => row.group), [
    FINANCE_GROUPS.APPROVED,
  ]);

  const prepared = applyProtectedInvoiceAction({
    invoice: approved,
    action: INVOICE_LIFECYCLE_ACTIONS.PREPARE_FOR_EXPORT,
    actor: actors.finance,
    reason: "Acceptance-test simulated Sage export",
    now: times.queued,
  });
  assert.equal(getSageReadiness(approved).ready, true);
  assert.equal(prepared.status, "approved");
  assert.equal(prepared.sageSync.status, "pending");
  assert.deepEqual(classification(booking, prepared).map((row) => row.group), [
    FINANCE_GROUPS.EXPORT_PENDING,
  ]);

  const connector = {
    connectorId: actors.connector,
    tenantId: booking.companyId,
    status: "online",
    connectorVersion: "test-connector-1.0",
    sageVersion: "SIMULATED-NO-SDO",
    sdoVersion: "SIMULATED-NO-SDO",
  };
  assert.equal(connector.status, "online");
  const contract = createSage50ExportJob({
    invoice: prepared,
    tenantId: booking.companyId,
    requestedBy: actors.finance,
    requestedAt: times.queued,
  });
  assert.deepEqual(contract.invoice.totals, approvedSnapshot.totals);
  assert.equal(contract.invoice.customer.sageCustomerId, contact.financeProfile.sageCustomerId);
  assert.equal(contract.invoice.lines[0].nominalCode, "4000");
  assert.equal(contract.invoice.lines[0].taxCode, "T1");
  const queueId = exportJobDocumentId(contract.idempotencyKey);
  const queueStore = new Map();
  queueStore.set(
    queueId,
    createExportQueueRecord({
      contract,
      connectorId: connector.connectorId,
      now: times.queued,
    })
  );
  queueStore.set(queueId, queueStore.get(queueId));
  assert.equal(queueStore.size, 1);
  const newerCandidate = {
    ...queueStore.get(queueId),
    jobId: "invoice:test-tenant-bickers:newer-test-job",
    createdAt: "2026-08-03T08:45:30.000Z",
  };
  const oldestEligible = [newerCandidate, queueStore.get(queueId)]
    .filter((job) => jobCanBeClaimed(job, Date.parse(times.claimed)))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
  assert.equal(oldestEligible.jobId, contract.jobId);
  audit.push({ action: "sage50_export_job_queued", at: times.queued, by: actors.finance });

  const claimed = claimJob(queueStore.get(queueId), connector.connectorId, times.claimed);
  queueStore.set(queueId, claimed.job);
  assert.equal(verifyLeaseToken(claimed.lease.token, claimed.job.leaseTokenHash), true);
  assert.throws(
    () => claimJob(queueStore.get(queueId), "TEST-CONNECTOR-OTHER", times.claimed),
    /cannot claim/i
  );
  audit.push({ action: "sage50_export_job_claimed", at: times.claimed, by: "system" });
  let exportJob = {
    ...claimed.job,
    status: "processing",
    processingStartedAt: times.processing,
    updatedAt: times.processing,
  };
  assert.equal(prepared.status, "approved");
  assert.equal(
    classifyFinanceRecord({
      booking,
      invoice: { ...prepared, sageSync: { ...prepared.sageSync, status: "syncing" } },
    }).group,
    FINANCE_GROUPS.EXPORTING
  );

  const successResult = {
    contractVersion: contract.contractVersion,
    product: contract.product,
    jobId: contract.jobId,
    outcome: "succeeded",
    completedAt: times.succeeded,
    postedDate: "2026-08-03",
    sageInvoiceId: "TEST-SAGE-RECORD-0001",
    invoiceNumber: "TEST-SAGE-0001",
    error: null,
  };
  assert.deepEqual(validateSage50ConnectorResult(successResult), []);
  const succeeded = applySimulatedSuccess(exportJob, successResult);
  assert.equal(succeeded.idempotent, false);
  exportJob = succeeded.job;
  assert.equal(
    applySimulatedSuccess(exportJob, clone(successResult)).idempotent,
    true
  );
  assert.throws(
    () =>
      applySimulatedSuccess(exportJob, {
        ...successResult,
        invoiceNumber: "TEST-SAGE-CONFLICT",
      }),
    /conflicting/i
  );
  assert.equal(prepared.invoiceNumber, null);
  assert.equal(prepared.status, "approved");
  audit.push({ action: "sage50_export_job_succeeded", at: times.succeeded, by: "system" });

  const reconciled = buildSage50Reconciliation({
    job: exportJob,
    invoice: prepared,
    booking,
    actor: actors.system,
    now: times.reconciled,
  });
  assert.equal(reconciled.idempotent, false);
  assert.equal(reconciled.invoice.status, "issued");
  assert.equal(reconciled.invoice.invoiceNumber, "TEST-SAGE-0001");
  assert.equal(reconciled.invoice.sageSync.sageInvoiceId, "TEST-SAGE-RECORD-0001");
  assert.equal(reconciled.booking.financeState, "invoiced");
  assert.equal(reconciled.booking.readyToInvoice, false);
  assert.deepEqual(reconciled.invoice.issuedSnapshot.totals, contract.invoice.totals);
  const duplicateReconciliation = buildSage50Reconciliation({
    job: reconciled.job,
    invoice: reconciled.invoice,
    booking: { id: booking.id, ...reconciled.booking },
    actor: actors.system,
    now: "2026-08-03T09:00:00.000Z",
  });
  assert.equal(duplicateReconciliation.idempotent, true);
  assert.equal(
    duplicateReconciliation.invoice.audit.length,
    reconciled.invoice.audit.length
  );
  audit.push(
    { action: "sage50_export_reconciled", at: times.reconciled, by: "system" },
    { action: "invoice_issued", at: times.reconciled, by: "system" }
  );

  const pdf = renderIssuedInvoicePdf(reconciled.invoice.issuedSnapshot);
  const pdfSha256 = digest(pdf);
  const sourceSnapshotSha256 = digest(
    Buffer.from(JSON.stringify(reconciled.invoice.issuedSnapshot))
  );
  const issuedDocument = {
    status: "stored",
    storagePath: `companies/${booking.companyId}/issued-invoices/${booking.id}/TEST-SAGE-0001.pdf`,
    filename: "TEST-SAGE-0001.pdf",
    contentType: "application/pdf",
    byteLength: pdf.byteLength,
    sha256: pdfSha256,
    sourceSnapshotSha256,
    storageGeneration: "test-generation-1",
    generatedAt: times.documented,
  };
  let issued = {
    ...reconciled.invoice,
    issuedDocument,
    audit: [
      ...reconciled.invoice.audit,
      { action: "issued_document_stored", at: times.documented, by: actors.system },
    ],
  };
  assert.match(pdf.toString("latin1"), /TEST-SAGE-0001/);
  assert.doesNotMatch(pdf.toString("latin1"), new RegExp(issued.draftReference));
  assert.equal(digest(renderIssuedInvoicePdf(issued.issuedSnapshot)), pdfSha256);
  const mutatedLiveBooking = { ...reconciled.booking, client: "Changed After Issue" };
  const mutatedLiveContact = { ...contact, name: "Changed After Issue" };
  assert.notEqual(mutatedLiveBooking.client, booking.client);
  assert.notEqual(mutatedLiveContact.name, issued.issuedSnapshot.customer.name);
  assert.equal(digest(renderIssuedInvoicePdf(issued.issuedSnapshot)), pdfSha256);
  audit.push({ action: "issued_document_stored", at: times.documented, by: "system" });

  const sentIds = new Set();
  const delivered = completeSimulatedDelivery({ invoice: issued, pdf, sentIds });
  assert.equal(delivered.idempotent, false);
  issued = delivered.invoice;
  assert.equal(issued.delivery.status, "sent");
  assert.equal(issued.delivery.recipient, issued.issuedSnapshot.customer.email);
  assert.equal(issued.status, "issued");
  const duplicateDelivery = completeSimulatedDelivery({ invoice: issued, pdf, sentIds });
  assert.equal(duplicateDelivery.idempotent, true);
  assert.equal(duplicateDelivery.invoice.delivery.attemptCount, 1);
  audit.push({ action: "invoice_delivered", at: times.delivered, by: actors.finance });
  assert.deepEqual(classification({ id: booking.id, ...reconciled.booking }, issued).map((row) => row.group), [
    FINANCE_GROUPS.ISSUED,
  ]);

  const requiredAuditActions = [
    "finance_handoff",
    "invoice_created",
    "draft_saved",
    "invoice_approved",
    "sage50_export_job_queued",
    "sage50_export_job_claimed",
    "sage50_export_job_succeeded",
    "sage50_export_reconciled",
    "invoice_issued",
    "issued_document_stored",
    "invoice_delivered",
  ];
  assert.deepEqual(audit.map((event) => event.action), requiredAuditActions);
  assert.deepEqual(
    audit.map((event) => event.at),
    [...audit.map((event) => event.at)].sort()
  );
  assert.ok(audit.every((event) => event.by));
  assert.doesNotMatch(JSON.stringify(audit), /leaseToken|credential|privateKey|lineItems/);
  assert.equal(JSON.stringify(quote), originalQuoteJson);
});

test("acceptance negative paths preserve finance and tenant authority", () => {
  const baseDraft = createInvoiceDraftFromQuote({
    booking,
    quote,
    actor: actors.finance,
    now: times.draft,
  });
  const mapped = {
    ...baseDraft,
    customer: createInvoiceCustomerSnapshot(contact),
  };
  const missingCustomer = {
    ...mapped,
    customer: { ...mapped.customer, sageCustomerId: null },
  };
  assert.throws(
    () => applyProtectedInvoiceAction({
      invoice: missingCustomer,
      action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
      actor: actors.finance,
    }),
    /not mapped to Sage/i
  );
  for (const field of ["nominalCode", "taxCode"]) {
    assert.throws(
      () => applyProtectedInvoiceAction({
        invoice: {
          ...mapped,
          lines: mapped.lines.map((line, index) =>
            index === 0 ? { ...line, [field]: "" } : line
          ),
        },
        action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
        actor: actors.finance,
      }),
      field === "nominalCode" ? /nominal code/i : /Sage tax code/i
    );
  }

  const protectedDraft = buildProtectedDraftSave({
    incoming: {
      ...mapped,
      invoiceNumber: "BROWSER-NUMBER",
      status: "paid",
      paidAt: times.draft,
      sageSync: { status: "synced", sageInvoiceId: "BROWSER-SAGE" },
    },
    booking,
    actor: actors.finance,
    now: times.draft,
  });
  assert.equal(protectedDraft.invoiceNumber, null);
  assert.equal(protectedDraft.status, "draft");
  assert.equal(protectedDraft.paidAt, "");
  assert.equal(protectedDraft.sageSync.sageInvoiceId, null);
  assert.throws(
    () => applyProtectedInvoiceAction({
      invoice: protectedDraft,
      action: "mark_paid",
      actor: actors.finance,
    }),
    /cannot be changed manually/i
  );

  const approved = applyProtectedInvoiceAction({
    invoice: protectedDraft,
    action: INVOICE_LIFECYCLE_ACTIONS.APPROVE,
    actor: actors.finance,
    now: times.approved,
  });
  assert.throws(
    () => {
      const connector = { status: "offline" };
      if (connector.status !== "online") {
        throw new Error("An online Sage 50 connector is required.");
      }
    },
    /online Sage 50 connector/i
  );
  const prepared = applyProtectedInvoiceAction({
    invoice: approved,
    action: INVOICE_LIFECYCLE_ACTIONS.PREPARE_FOR_EXPORT,
    actor: actors.finance,
    now: times.queued,
  });
  const contract = createSage50ExportJob({
    invoice: prepared,
    tenantId: booking.companyId,
    requestedBy: actors.finance,
    requestedAt: times.queued,
  });
  const failedJob = {
    ...createExportQueueRecord({
      contract,
      connectorId: actors.connector,
      now: times.queued,
    }),
    status: "failed",
    result: {
      contractVersion: contract.contractVersion,
      product: contract.product,
      jobId: contract.jobId,
      outcome: "failed",
      completedAt: times.succeeded,
      sageInvoiceId: null,
      invoiceNumber: null,
      error: { code: "TEST_FAILURE", message: "Test-only connector failure" },
    },
  };
  assert.equal(prepared.status, "approved");
  assert.equal(prepared.invoiceNumber, null);
  assert.throws(
    () => buildSage50Reconciliation({
      job: failedJob,
      invoice: prepared,
      booking,
      actor: actors.system,
    }),
    /only a successful/i
  );

  const successJob = {
    ...failedJob,
    status: "succeeded",
    result: {
      contractVersion: contract.contractVersion,
      product: contract.product,
      jobId: contract.jobId,
      outcome: "succeeded",
      completedAt: times.succeeded,
      postedDate: "2026-08-03",
      sageInvoiceId: "TEST-SAGE-RECORD-0001",
      invoiceNumber: "TEST-SAGE-0001",
      error: null,
    },
  };
  assert.throws(
    () => buildSage50Reconciliation({
      job: successJob,
      invoice: prepared,
      booking: { ...booking, companyId: "test-tenant-other" },
      actor: actors.system,
    }),
    /identity do not match/i
  );
  assert.equal(jobCanBeClaimed(successJob, Date.parse(times.reconciled)), false);

  const lifecycleRoute = readFileSync(
    new URL("../src/app/api/invoices/[id]/lifecycle/route.js", import.meta.url),
    "utf8"
  );
  const reconciliationRoute = readFileSync(
    new URL(
      "../src/app/api/integrations/sage50/export-jobs/[jobId]/reconcile/route.js",
      import.meta.url
    ),
    "utf8"
  );
  const deliveryRoute = readFileSync(
    new URL("../src/app/api/invoices/[id]/delivery/route.js", import.meta.url),
    "utf8"
  );
  const firestoreRules = readFileSync(
    new URL("../firestore.rules", import.meta.url),
    "utf8"
  );
  const storageRules = readFileSync(
    new URL("../storage.rules", import.meta.url),
    "utf8"
  );
  assert.match(lifecycleRoute, /Use the trusted Sage 50 export reconciliation route/);
  assert.match(reconciliationRoute, /canAccessCompany/);
  assert.match(deliveryRoute, /recipient must match/i);
  assert.match(deliveryRoute, /invoice-delivery:/);
  assert.match(firestoreRules, /invoiceQueue[\s\S]*allow create, update, delete: if false/);
  assert.match(firestoreRules, /sage50ExportJobs[\s\S]*allow read, write: if false/);
  assert.match(storageRules, /issued-invoices[\s\S]*allow read, write: if false/);
});
