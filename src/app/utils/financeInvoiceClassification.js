const text = (value) => String(value ?? "").trim();

export const FINANCE_GROUPS = Object.freeze({
  READY_FOR_FINANCE: "ready_for_finance",
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  EXPORT_PENDING: "export_pending",
  EXPORTING: "exporting",
  SYNC_FAILED: "sync_failed",
  ISSUED: "issued",
  PART_PAID: "part_paid",
  PAID: "paid",
  VOID: "void",
  DISPUTED: "disputed",
  CREDITED: "credited",
  WRITTEN_OFF: "written_off",
  EXCEPTION: "exception",
});

export const FINANCE_GROUP_LABELS = Object.freeze({
  ready_for_finance: "Ready for Finance",
  draft: "Draft",
  pending_approval: "Awaiting Approval",
  approved: "Approved",
  export_pending: "Pending Export",
  exporting: "Exporting",
  sync_failed: "Sync Failed",
  issued: "Issued",
  part_paid: "Part Paid",
  paid: "Paid",
  void: "Void",
  disputed: "Disputed",
  credited: "Credited",
  written_off: "Written Off",
  exception: "Data Issue",
});

const CANONICAL_INVOICE_STATES = new Set([
  FINANCE_GROUPS.DRAFT,
  FINANCE_GROUPS.PENDING_APPROVAL,
  FINANCE_GROUPS.APPROVED,
  FINANCE_GROUPS.EXPORT_PENDING,
  FINANCE_GROUPS.EXPORTING,
  FINANCE_GROUPS.SYNC_FAILED,
  FINANCE_GROUPS.ISSUED,
  FINANCE_GROUPS.PART_PAID,
  FINANCE_GROUPS.PAID,
  FINANCE_GROUPS.VOID,
  FINANCE_GROUPS.DISPUTED,
  FINANCE_GROUPS.CREDITED,
  FINANCE_GROUPS.WRITTEN_OFF,
]);

const normaliseRawStatus = (value) => {
  const extracted =
    value && typeof value === "object"
      ? value.value ?? value.name ?? value.status ?? ""
      : value;
  return text(extracted).toLowerCase().replace(/[\s-]+/g, "_");
};

export function resolveInvoiceLifecycleStatus(value) {
  const rawStatus = normaliseRawStatus(value);
  if (CANONICAL_INVOICE_STATES.has(rawStatus)) {
    return { status: rawStatus, isLegacy: false, rawStatus };
  }
  const legacyMap = {
    invoiced: FINANCE_GROUPS.ISSUED,
    invoice_sent: FINANCE_GROUPS.ISSUED,
    billed: FINANCE_GROUPS.ISSUED,
    settled: FINANCE_GROUPS.PAID,
  };
  if (legacyMap[rawStatus]) {
    return {
      status: legacyMap[rawStatus],
      isLegacy: true,
      rawStatus,
    };
  }
  return { status: "", isLegacy: false, rawStatus };
}

const bookingFinanceMarker = (booking = {}) =>
  normaliseRawStatus(
    booking.financeState ||
      booking.invoiceStatus ||
      booking.finance?.status ||
      booking.status
  );

const invoiceOutstanding = (invoice = {}) => {
  const explicit = Number(invoice.outstandingBalance);
  if (Number.isFinite(explicit)) return explicit;
  const gross = Number(invoice.totals?.gross);
  const paid = Number(invoice.amountPaid);
  return Number.isFinite(gross) && Number.isFinite(paid) ? gross - paid : null;
};

export function classifyFinanceRecord({
  booking = null,
  invoice = null,
  activeInvoiceCount = invoice ? 1 : 0,
} = {}) {
  const warnings = [];
  const bookingMarker = bookingFinanceMarker(booking || {});

  if (activeInvoiceCount > 1) {
    warnings.push("Multiple active invoices are linked to this booking.");
  }

  if (invoice) {
    const resolved = resolveInvoiceLifecycleStatus(invoice.status);
    if (!resolved.status) {
      warnings.push(
        `Invoice status “${text(invoice.status) || "missing"}” cannot be safely mapped.`
      );
    }
    if (
      resolved.status === FINANCE_GROUPS.ISSUED &&
      !text(invoice.invoiceNumber)
    ) {
      warnings.push("Issued invoice has no official invoice number.");
    }
    if (
      bookingMarker === "paid" &&
      ![FINANCE_GROUPS.PAID, FINANCE_GROUPS.PART_PAID].includes(resolved.status)
    ) {
      warnings.push("Booking is marked paid but the linked invoice is not paid.");
    }
    const outstanding = invoiceOutstanding(invoice);
    if (
      resolved.status === FINANCE_GROUPS.PAID &&
      outstanding !== null &&
      outstanding > 0.005
    ) {
      warnings.push("Paid invoice has a non-zero outstanding balance.");
    }

    const sageStatus = normaliseRawStatus(invoice.sageSync?.status);
    const approvedTransportGroup =
      resolved.status === FINANCE_GROUPS.APPROVED
        ? {
            pending: FINANCE_GROUPS.EXPORT_PENDING,
            syncing: FINANCE_GROUPS.EXPORTING,
            failed: FINANCE_GROUPS.SYNC_FAILED,
          }[sageStatus] || FINANCE_GROUPS.APPROVED
        : resolved.status;
    const group =
      warnings.length || !resolved.status
        ? FINANCE_GROUPS.EXCEPTION
        : approvedTransportGroup;
    return {
      group,
      label: FINANCE_GROUP_LABELS[group] || group,
      invoiceStatus: resolved.status || null,
      isLegacyStatus: resolved.isLegacy,
      legacyStatus: resolved.isLegacy ? resolved.rawStatus : null,
      warnings,
    };
  }

  if (["invoiced", "issued", "paid", "settled"].includes(bookingMarker)) {
    warnings.push(
      `Booking is marked ${bookingMarker.replace(/_/g, " ")} but has no linked invoice record.`
    );
    return {
      group: FINANCE_GROUPS.EXCEPTION,
      label: FINANCE_GROUP_LABELS.exception,
      invoiceStatus: null,
      isLegacyStatus: true,
      legacyStatus: bookingMarker,
      warnings,
    };
  }

  if (booking?.readyToInvoice === true) {
    return {
      group: FINANCE_GROUPS.READY_FOR_FINANCE,
      label: FINANCE_GROUP_LABELS.ready_for_finance,
      invoiceStatus: null,
      isLegacyStatus: false,
      legacyStatus: null,
      warnings,
    };
  }

  return null;
}

export function buildFinanceRows({ bookings = [], invoices = [] } = {}) {
  const invoicesByBooking = new Map();
  for (const invoice of invoices) {
    const bookingId = text(invoice.bookingId || invoice.id);
    if (!bookingId) continue;
    const linked = invoicesByBooking.get(bookingId) || [];
    linked.push(invoice);
    invoicesByBooking.set(bookingId, linked);
  }

  const bookingIds = new Set();
  const rows = [];
  for (const booking of bookings) {
    const bookingId = text(booking.id);
    bookingIds.add(bookingId);
    const linkedInvoices = invoicesByBooking.get(bookingId) || [];
    const invoice = linkedInvoices
      .slice()
      .sort((a, b) =>
        text(b.updatedAt || b.createdAt).localeCompare(text(a.updatedAt || a.createdAt))
      )[0] || null;
    const classification = classifyFinanceRecord({
      booking,
      invoice,
      activeInvoiceCount: linkedInvoices.filter(
        (item) => resolveInvoiceLifecycleStatus(item.status).status !== FINANCE_GROUPS.VOID
      ).length,
    });
    if (classification) {
      rows.push({ ...booking, ...invoice, id: invoice?.id || bookingId, bookingId, booking, invoice, ...classification });
    }
  }

  for (const [bookingId, linkedInvoices] of invoicesByBooking) {
    if (bookingIds.has(bookingId)) continue;
    const invoice = linkedInvoices[0];
    const classification = classifyFinanceRecord({
      invoice,
      activeInvoiceCount: linkedInvoices.length,
    });
    rows.push({
      ...invoice,
      id: invoice.id,
      bookingId,
      booking: null,
      invoice,
      ...classification,
    });
  }
  return rows;
}

export function countFinanceGroups(rows = []) {
  return rows.reduce((counts, row) => {
    counts[row.group] = (counts[row.group] || 0) + 1;
    return counts;
  }, {});
}

export function financeRowMatchesSearch(row, query) {
  const needle = text(query).toLowerCase();
  if (!needle) return true;
  return [
    row.jobNumber,
    row.client,
    row.customer?.name,
    row.draftReference,
    row.invoiceNumber,
    row.purchaseOrderNumber,
    row.poNumber,
    row.finance?.poNumber,
  ].some((value) => text(value).toLowerCase().includes(needle));
}
