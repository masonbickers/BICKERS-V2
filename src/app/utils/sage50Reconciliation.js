import {
  INVOICE_LIFECYCLE_ACTIONS,
  applyProtectedInvoiceAction,
} from "./invoiceLifecycleActions.js";
import { validateSage50ConnectorResult } from "./sage50ConnectorContract.js";

const text = (value) => String(value ?? "").trim();
const money = (value) => Math.round(Number(value || 0) * 100);

export function buildSage50Reconciliation({
  job,
  invoice,
  booking,
  actor,
  now = new Date().toISOString(),
} = {}) {
  if (!job || job.status !== "succeeded" || job.result?.outcome !== "succeeded") {
    throw new Error("Only a successful Sage 50 export job can be reconciled.");
  }
  const resultErrors = validateSage50ConnectorResult(job.result);
  if (resultErrors.length) throw new Error(resultErrors.join("\n"));
  if (!invoice || !booking) throw new Error("Linked invoice and booking are required.");
  if (
    text(job.invoiceId) !== text(invoice.bookingId) ||
    text(job.invoiceId) !== text(booking.id) ||
    text(job.tenantId) !== text(invoice.companyId) ||
    text(job.tenantId) !== text(booking.companyId)
  ) {
    throw new Error("Export job, invoice and booking identity do not match.");
  }
  if (text(job.invoice?.draftReference) !== text(invoice.draftReference)) {
    throw new Error("Export job does not match the approved invoice snapshot.");
  }
  if (
    money(job.invoice?.totals?.gross) !== money(invoice.totals?.gross) ||
    money(job.invoice?.totals?.net) !== money(invoice.totals?.net) ||
    money(job.invoice?.totals?.tax) !== money(invoice.totals?.tax)
  ) {
    throw new Error("Export job totals do not match the approved invoice snapshot.");
  }

  const alreadyReconciled =
    invoice.status === "issued" &&
    text(invoice.invoiceNumber) === text(job.result.invoiceNumber) &&
    text(invoice.sageSync?.sageInvoiceId) === text(job.result.sageInvoiceId);
  if (alreadyReconciled) {
    return {
      idempotent: true,
      invoice,
      booking,
      job: {
        ...job,
        reconciledAt: job.reconciledAt || invoice.issuedAt || now,
        reconciledBy: job.reconciledBy || text(actor),
        invoiceReconciled: true,
      },
    };
  }
  if (invoice.status !== "approved") {
    throw new Error("Linked invoice must still be approved.");
  }

  const issued = applyProtectedInvoiceAction({
    invoice,
    action: INVOICE_LIFECYCLE_ACTIONS.CONFIRM_EXTERNAL_ISSUE,
    actor,
    reason: `Reconciled from Sage 50 export job ${text(job.jobId)}`,
    invoiceNumber: job.result.invoiceNumber,
    sageInvoiceId: job.result.sageInvoiceId,
    postedDate: job.result.postedDate,
    now,
  });
  const reconciliationAudit = {
    action: "sage50_export_reconciled",
    fromStatus: "approved",
    toStatus: "issued",
    at: now,
    by: text(actor) || "Unknown",
    reason: `Official Sage 50 invoice ${text(job.result.invoiceNumber)}`,
    metadata: {
      exportJobId: text(job.jobId),
      sageInvoiceId: text(job.result.sageInvoiceId),
      postedDate: text(job.result.postedDate),
    },
  };
  const issuedSnapshot = {
    schemaVersion: 1,
    invoiceNumber: issued.invoiceNumber,
    issueDate: issued.issueDate,
    dueDate: issued.dueDate || null,
    bookingId: issued.bookingId,
    jobNumber: issued.jobNumber || null,
    draftReference: issued.draftReference,
    companyId: issued.companyId,
    currency: issued.currency,
    customer: issued.customer,
    purchaseOrderNumber: issued.purchaseOrderNumber || null,
    paymentTermsDays: issued.paymentTermsDays,
    sourceQuote: issued.sourceQuote,
    lines: issued.lines,
    totals: issued.totals,
    notes: issued.notes || null,
    supplier: {
      legalName: "Bickers Action",
      description: "Film and TV Action Vehicles",
      website: "www.bickers.co.uk",
    },
    sageInvoiceId: issued.sageSync.sageInvoiceId,
    exportJobId: text(job.jobId),
    reconciledAt: now,
    reconciledBy: text(actor),
  };
  const nextInvoice = {
    ...issued,
    issuedSnapshot,
    audit: [...(issued.audit || []), reconciliationAudit],
  };
  const { id: _bookingId, ...bookingData } = booking;
  const nextBooking = {
    ...bookingData,
    status: "invoiced",
    financeState: "invoiced",
    readyToInvoice: false,
    invoicedAt: nextInvoice.issuedAt,
    invoiceNumber: nextInvoice.invoiceNumber,
    invoiceTotal: nextInvoice.totals?.gross ?? null,
    updatedAt: now,
  };
  const nextJob = {
    ...job,
    reconciledAt: now,
    reconciledBy: text(actor),
    invoiceReconciled: true,
    updatedAt: now,
  };
  return {
    idempotent: false,
    invoice: nextInvoice,
    booking: nextBooking,
    job: nextJob,
  };
}
