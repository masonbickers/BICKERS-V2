import {
  INVOICE_STATUSES,
  calculateInvoiceTotals,
  createDraftReference,
  createSageSyncState,
  getSageReadiness,
  getInvoiceApprovalReadiness,
  parseInvoiceRecord,
  serialiseInvoiceForPersistence,
  transitionInvoice,
  validateInvoice,
} from "./invoiceLifecycle.js";
export const INVOICE_LIFECYCLE_ACTIONS = Object.freeze({
  SAVE_DRAFT: "save_draft",
  APPROVE: "approve",
  RETURN_TO_DRAFT: "return_to_draft",
  PREPARE_FOR_EXPORT: "prepare_for_export",
  CONFIRM_EXTERNAL_ISSUE: "confirm_external_issue",
  VOID: "void",
});

const text = (value) => String(value ?? "").trim();

const EDITABLE_DRAFT_FIELDS = Object.freeze([
  "currency",
  "customer",
  "purchaseOrderNumber",
  "paymentTermsDays",
  "sourceQuote",
  "lines",
  "totals",
  "notes",
  "internalFinanceNotes",
  "dates",
  "client",
  "location",
]);

function auditEvent({
  action,
  invoice,
  actor,
  now,
  reason = "",
  metadata = null,
}) {
  return [
    ...(Array.isArray(invoice.audit) ? invoice.audit : []),
    {
      action,
      fromStatus: invoice.status || null,
      toStatus: invoice.status || null,
      at: now,
      by: actor,
      reason: text(reason),
      ...(metadata ? { metadata } : {}),
    },
  ];
}

export function buildProtectedDraftSave({
  incoming,
  existing = null,
  booking,
  actor,
  now = new Date().toISOString(),
} = {}) {
  if (!incoming || typeof incoming !== "object") {
    throw new Error("Invoice draft payload is required.");
  }
  if (existing && existing.status !== INVOICE_STATUSES.DRAFT) {
    throw new Error("Only draft invoices can be edited.");
  }

  const base = existing
    ? parseInvoiceRecord(existing, booking)
    : parseInvoiceRecord(
        {
          ...incoming,
          status: INVOICE_STATUSES.DRAFT,
          invoiceNumber: null,
          sageSync: createSageSyncState(),
          approvedAt: "",
          issuedAt: "",
          paidAt: "",
          voidedAt: "",
          audit: [],
          createdAt: now,
          createdBy: actor,
        },
        booking
      );
  const editable = EDITABLE_DRAFT_FIELDS.reduce((patch, field) => {
    if (existing && field === "sourceQuote") return patch;
    if (field in incoming) patch[field] = incoming[field];
    return patch;
  }, {});
  const totals = calculateInvoiceTotals(editable.lines || base.lines || []);
  const candidate = {
    ...base,
    ...editable,
    bookingId: text(booking?.id || base.bookingId),
    jobNumber: text(booking?.jobNumber || base.jobNumber),
    companyId: text(booking?.companyId || base.companyId),
    draftReference: existing?.draftReference || createDraftReference(booking),
    status: INVOICE_STATUSES.DRAFT,
    invoiceNumber: null,
    lines: totals.lines,
    totals: { net: totals.net, tax: totals.tax, gross: totals.gross },
    approvedAt: "",
    issuedAt: "",
    paidAt: "",
    voidedAt: "",
    updatedAt: now,
    updatedBy: actor,
    audit: existing
      ? base.audit
      : [
          {
            action: "draft_created",
            fromStatus: null,
            toStatus: INVOICE_STATUSES.DRAFT,
            at: now,
            by: actor,
            reason: `Created from quote ${text(incoming.sourceQuote?.quoteNumber)}`,
          },
        ],
  };
  const serialised = serialiseInvoiceForPersistence(candidate, existing);
  const errors = validateInvoice(serialised);
  if (errors.length) throw new Error(errors.join("\n"));
  return serialised;
}

export function applyProtectedInvoiceAction({
  invoice,
  action,
  actor,
  reason = "",
  invoiceNumber = "",
  sageInvoiceId = "",
  postedDate = "",
  now = new Date().toISOString(),
} = {}) {
  const current = parseInvoiceRecord(invoice, {
    id: invoice?.bookingId,
    jobNumber: invoice?.jobNumber,
  });
  const cleanActor = text(actor) || "Unknown";

  if (action === INVOICE_LIFECYCLE_ACTIONS.APPROVE) {
    const readiness = getInvoiceApprovalReadiness(current);
    if (!readiness.ready) {
      throw new Error(readiness.blockers.map((blocker) => blocker.message).join("\n"));
    }
    return transitionInvoice(current, INVOICE_STATUSES.APPROVED, {
      actor: cleanActor,
      reason,
      now,
    });
  }

  if (action === INVOICE_LIFECYCLE_ACTIONS.RETURN_TO_DRAFT) {
    if (!text(reason)) throw new Error("A reason is required to return an invoice to draft.");
    if (["pending", "syncing"].includes(current.sageSync?.status)) {
      throw new Error("Invoice cannot return to draft while accounting export is pending.");
    }
    return transitionInvoice(current, INVOICE_STATUSES.DRAFT, {
      actor: cleanActor,
      reason,
      now,
    });
  }

  if (action === INVOICE_LIFECYCLE_ACTIONS.PREPARE_FOR_EXPORT) {
    if (current.status !== INVOICE_STATUSES.APPROVED) {
      throw new Error("Only an approved invoice can be prepared for export.");
    }
    if (!["not_ready", "ready"].includes(current.sageSync?.status)) {
      throw new Error("Invoice already has an active or completed accounting sync state.");
    }
    const readiness = getSageReadiness(current);
    if (!readiness.ready) {
      throw new Error(readiness.blockers.map((blocker) => blocker.message).join("\n"));
    }
    return {
      ...current,
      sageSync: {
        ...createSageSyncState(current.sageSync),
        status: "pending",
        error: null,
      },
      updatedAt: now,
      updatedBy: cleanActor,
      audit: auditEvent({
        action: "accounting_export_prepared",
        invoice: current,
        actor: cleanActor,
        now,
        reason,
      }),
    };
  }

  if (action === INVOICE_LIFECYCLE_ACTIONS.CONFIRM_EXTERNAL_ISSUE) {
    if (!text(invoiceNumber) || !text(sageInvoiceId)) {
      throw new Error("External invoice number and Sage invoice ID are required.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(postedDate))) {
      throw new Error("A valid Sage posted date is required.");
    }
    if (!["pending", "syncing"].includes(current.sageSync?.status)) {
      throw new Error("Invoice must be pending or syncing before external issue confirmation.");
    }
    const issued = transitionInvoice(
      { ...current, invoiceNumber: text(invoiceNumber) },
      INVOICE_STATUSES.ISSUED,
      { actor: cleanActor, reason: reason || "Confirmed by external accounting", now }
    );
    return {
      ...issued,
      issueDate: text(postedDate),
      sageSync: {
        ...createSageSyncState(current.sageSync),
        status: "synced",
        sageInvoiceId: text(sageInvoiceId),
        syncedAt: now,
        error: null,
      },
    };
  }

  if (action === INVOICE_LIFECYCLE_ACTIONS.VOID) {
    if (!text(reason)) throw new Error("A reason is required to void an invoice.");
    if ([INVOICE_STATUSES.ISSUED, INVOICE_STATUSES.PART_PAID].includes(current.status)) {
      throw new Error("Externally issued invoices require accounting void confirmation.");
    }
    if (["pending", "syncing"].includes(current.sageSync?.status)) {
      throw new Error("Invoice cannot be voided while accounting export is pending.");
    }
    return transitionInvoice(current, INVOICE_STATUSES.VOID, {
      actor: cleanActor,
      reason,
      now,
    });
  }

  if (
    ["record_manual_payment_override", "mark_paid", "mark_part_paid"].includes(
      action
    )
  ) {
    throw new Error("Payment status cannot be changed manually.");
  }

  throw new Error("Unsupported invoice lifecycle action.");
}
