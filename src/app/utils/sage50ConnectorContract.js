import { getAccountingMappingReadiness } from "./accountingMappings.js";
import { INVOICE_STATUSES, calculateInvoiceTotals } from "./invoiceLifecycle.js";

export const SAGE_INTEGRATION_PRODUCT = "sage_50_accounts_uk";
export const SAGE_50_CONNECTOR_CONTRACT_VERSION = 2;

const text = (value) => String(value ?? "").trim();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function londonDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid invoice request date is required.");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validateSage50ExportCandidate(invoice = {}) {
  const errors = [];
  if (text(invoice.status) !== INVOICE_STATUSES.APPROVED) {
    errors.push("Invoice must be approved.");
  }
  if (text(invoice.sageSync?.status) !== "pending") {
    errors.push("Invoice must be prepared for export.");
  }
  if (!text(invoice.bookingId)) errors.push("Booking ID is required.");
  if (!text(invoice.draftReference)) errors.push("Draft reference is required.");
  if (!text(invoice.currency)) errors.push("Currency is required.");
  if (!text(invoice.customer?.sageCustomerId)) {
    errors.push("Sage customer reference is required.");
  }
  getAccountingMappingReadiness(invoice).blockers.forEach((blocker) => {
    if (!errors.includes(blocker.message)) errors.push(blocker.message);
  });
  return errors;
}

export function createSage50ExportJob({
  invoice,
  tenantId,
  requestedBy,
  requestedAt = new Date().toISOString(),
} = {}) {
  const cleanTenantId = text(tenantId);
  if (!cleanTenantId) throw new Error("A server-derived tenant ID is required.");
  const errors = validateSage50ExportCandidate(invoice);
  if (errors.length) throw new Error(errors.join("\n"));

  const totals = calculateInvoiceTotals(invoice.lines);
  const requestedAtIso = text(requestedAt);
  const requestedInvoiceDate = text(invoice.invoiceDate || invoice.issueDate);
  const invoiceDate = ISO_DATE.test(requestedInvoiceDate)
    ? requestedInvoiceDate
    : londonDateKey(requestedAtIso);
  return {
    contractVersion: SAGE_50_CONNECTOR_CONTRACT_VERSION,
    product: SAGE_INTEGRATION_PRODUCT,
    jobId: `invoice:${cleanTenantId}:${text(invoice.bookingId)}:${text(invoice.draftReference)}`,
    idempotencyKey: `sage50-sales-invoice:${cleanTenantId}:${text(invoice.draftReference)}`,
    tenantId: cleanTenantId,
    operation: "create_sales_invoice",
    requestedAt: requestedAtIso,
    requestedBy: text(requestedBy) || "Unknown",
    invoice: {
      bookingId: text(invoice.bookingId),
      jobNumber: text(invoice.jobNumber),
      draftReference: text(invoice.draftReference),
      invoiceDate,
      currency: text(invoice.currency),
      purchaseOrderNumber: text(invoice.purchaseOrderNumber) || null,
      paymentTermsDays: Number(invoice.paymentTermsDays ?? 0),
      customer: {
        sageCustomerId: text(invoice.customer?.sageCustomerId),
        legalName: text(invoice.customer?.name),
        billingCountry: text(invoice.customer?.billingCountry),
      },
      sourceQuoteNumber: text(invoice.sourceQuote?.quoteNumber),
      lines: totals.lines.map((line, index) => ({
        lineNumber: index + 1,
        sourceLineId: text(line.sourceLineId) || null,
        description: text(line.description),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        nominalCode: text(line.nominalCode),
        taxCode: text(line.taxCode),
        net: line.net,
        tax: line.tax,
        gross: line.gross,
      })),
      totals: {
        net: totals.net,
        tax: totals.tax,
        gross: totals.gross,
      },
    },
  };
}

export function validateSage50ConnectorResult(result = {}) {
  const errors = [];
  if (Number(result.contractVersion) !== SAGE_50_CONNECTOR_CONTRACT_VERSION) {
    errors.push("Unsupported connector contract version.");
  }
  if (text(result.product) !== SAGE_INTEGRATION_PRODUCT) {
    errors.push("Connector result has the wrong Sage product.");
  }
  if (!text(result.jobId)) errors.push("Connector job ID is required.");
  if (!["succeeded", "failed"].includes(text(result.outcome))) {
    errors.push("Connector outcome must be succeeded or failed.");
  }
  if (text(result.outcome) === "succeeded") {
    if (!text(result.sageInvoiceId)) errors.push("Sage invoice ID is required.");
    if (!text(result.invoiceNumber)) errors.push("Sage invoice number is required.");
    if (!ISO_DATE.test(text(result.postedDate))) {
      errors.push("Sage posted date is required in YYYY-MM-DD format.");
    }
  }
  if (text(result.outcome) === "failed" && !text(result.error?.message)) {
    errors.push("A connector error message is required.");
  }
  return errors;
}
