import {
  createInvoiceCustomerSnapshot,
  getAccountingMappingReadiness,
} from "./accountingMappings.js";

export const INVOICE_SCHEMA_VERSION = 1;

export const SAGE_SYNC_STATUSES = Object.freeze([
  "not_ready",
  "ready",
  "pending",
  "syncing",
  "synced",
  "failed",
]);

export const INVOICE_DELIVERY_STATUSES = Object.freeze([
  "not_sent",
  "sending",
  "sent",
  "failed",
]);

export const INVOICE_STATUSES = Object.freeze({
  DRAFT: "draft",
  APPROVED: "approved",
  ISSUED: "issued",
  PART_PAID: "part_paid",
  PAID: "paid",
  VOID: "void",
});

export const INVOICE_TRANSITIONS = Object.freeze({
  draft: ["approved", "void"],
  approved: ["draft", "issued", "void"],
  issued: ["part_paid", "paid", "void"],
  part_paid: ["paid", "void"],
  paid: [],
  void: [],
});

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundMoney = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;

export function createSageSyncState(overrides = {}) {
  const status = SAGE_SYNC_STATUSES.includes(text(overrides.status))
    ? text(overrides.status)
    : "not_ready";
  const error =
    overrides.error && typeof overrides.error === "object"
      ? {
          code: text(overrides.error.code) || null,
          message: text(overrides.error.message) || null,
        }
      : null;
  return {
    status,
    sageInvoiceId: text(overrides.sageInvoiceId) || null,
    sageCustomerId: text(overrides.sageCustomerId) || null,
    lastAttemptAt: text(overrides.lastAttemptAt) || null,
    syncedAt: text(overrides.syncedAt) || null,
    error,
  };
}

export function createInvoiceDeliveryState(overrides = {}) {
  const status = INVOICE_DELIVERY_STATUSES.includes(text(overrides.status))
    ? text(overrides.status)
    : "not_sent";
  return {
    status,
    recipient: text(overrides.recipient) || null,
    subject: text(overrides.subject) || null,
    attemptCount: Math.max(0, Math.floor(number(overrides.attemptCount))),
    lastAttemptAt: text(overrides.lastAttemptAt) || null,
    sentAt: text(overrides.sentAt) || null,
    provider: text(overrides.provider) === "resend" ? "resend" : null,
    providerMessageId: text(overrides.providerMessageId) || null,
    sentBy:
      overrides.sentBy && typeof overrides.sentBy === "object"
        ? {
            uid: text(overrides.sentBy.uid) || null,
            email: text(overrides.sentBy.email) || null,
            role: text(overrides.sentBy.role) || null,
          }
        : null,
    error:
      overrides.error && typeof overrides.error === "object"
        ? {
            code: text(overrides.error.code) || null,
            message: text(overrides.error.message) || null,
          }
        : null,
  };
}

export function getSageReadiness(invoice = {}) {
  const blockers = [];
  if (text(invoice.status) !== INVOICE_STATUSES.APPROVED) {
    blockers.push({
      code: "invoice_not_approved",
      message: "Invoice must be approved before accounting sync.",
    });
  }
  if (!text(invoice.draftReference)) {
    blockers.push({
      code: "draft_reference_missing",
      message: "Draft reference is missing.",
    });
  }
  blockers.push(...getAccountingMappingReadiness(invoice).blockers);
  if (!text(invoice.currency)) {
    blockers.push({
      code: "currency_missing",
      message: "Invoice currency is missing.",
    });
  }
  if (!text(invoice.sourceQuote?.quoteNumber)) {
    blockers.push({
      code: "source_quote_missing",
      message: "Source quote is missing.",
    });
  }
  if (!invoiceLinesWithQuantity(invoice.lines).length) {
    blockers.push({
      code: "invoice_lines_missing",
      message: "At least one invoice line is required.",
    });
  } else {
  }
  return { ready: blockers.length === 0, blockers };
}

export function getInvoiceApprovalReadiness(invoice = {}) {
  const validationBlockers = validateInvoice(invoice).map((message, index) => ({
    code: `invoice_validation_${index + 1}`,
    message,
  }));
  const mappingBlockers = getAccountingMappingReadiness(invoice).blockers;
  const blockers = [...validationBlockers, ...mappingBlockers].filter(
    (blocker, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.code === blocker.code &&
          candidate.line === blocker.line &&
          candidate.message === blocker.message
      ) === index
  );
  return { ready: blockers.length === 0, blockers };
}

export function normaliseSageSyncState(invoice = {}) {
  const current = createSageSyncState(invoice.sageSync);
  const readiness = getSageReadiness(invoice);
  const readinessControlled = ["not_ready", "ready"].includes(current.status);
  return {
    ...current,
    status: readinessControlled
      ? readiness.ready
        ? "ready"
        : "not_ready"
      : current.status,
  };
}

const draftIdentityPart = (value) =>
  text(value)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/^-+|-+$/g, "");

export function createDraftReference(booking = {}) {
  const jobNumber = draftIdentityPart(booking.jobNumber || "JOB");
  const bookingId = draftIdentityPart(booking.id);
  if (!bookingId) {
    throw new Error("A persisted booking ID is required to create an invoice draft reference.");
  }
  return `DRAFT-${jobNumber || "JOB"}-${bookingId}`;
}

export function isLegacyLocalInvoiceNumber(invoiceNumber, jobNumber) {
  const linkedJobNumber = draftIdentityPart(jobNumber);
  return Boolean(
    linkedJobNumber &&
      text(invoiceNumber).toUpperCase() === `INV-${linkedJobNumber.toUpperCase()}`
  );
}

export function normaliseInvoiceIdentity(invoice = {}, booking = {}) {
  const linkedBooking = {
    id: booking.id || invoice.bookingId,
    jobNumber: booking.jobNumber || invoice.jobNumber,
  };
  const status = text(invoice.status).toLowerCase();
  const safelyUnissued =
    ["", INVOICE_STATUSES.DRAFT, INVOICE_STATUSES.APPROVED].includes(status) &&
    !text(invoice.issuedAt);
  const legacyLocalNumber =
    safelyUnissued &&
    isLegacyLocalInvoiceNumber(invoice.invoiceNumber, linkedBooking.jobNumber);

  return {
    ...invoice,
    draftReference:
      text(invoice.draftReference) || createDraftReference(linkedBooking),
    invoiceNumber: legacyLocalNumber ? null : text(invoice.invoiceNumber) || null,
    ...(legacyLocalNumber
      ? { legacyLocalInvoiceNumber: text(invoice.invoiceNumber) }
      : {}),
  };
}

export function parseInvoiceRecord(invoice = {}, booking = {}) {
  const withIdentity = normaliseInvoiceIdentity(invoice, booking);
  return {
    ...withIdentity,
    internalFinanceNotes: text(withIdentity.internalFinanceNotes),
    sageSync: normaliseSageSyncState(withIdentity),
    delivery: createInvoiceDeliveryState(withIdentity.delivery),
  };
}

export function serialiseInvoiceForPersistence(invoice = {}, existingInvoice = null) {
  const parsed = parseInvoiceRecord(invoice, {
    id: invoice.bookingId,
    jobNumber: invoice.jobNumber,
  });
  const selectedTotals = calculateInvoiceTotals(
    invoiceLinesWithQuantity(parsed.lines)
  );
  const persisted = {
    ...parsed,
    lines: selectedTotals.lines,
    totals: {
      net: selectedTotals.net,
      tax: selectedTotals.tax,
      gross: selectedTotals.gross,
    },
  };
  const existingSync = existingInvoice
    ? createSageSyncState(existingInvoice.sageSync)
    : null;
  const readiness = getSageReadiness(persisted);
  const protectedSync =
    existingSync && !["not_ready", "ready"].includes(existingSync.status)
      ? existingSync
      : {
          ...(existingSync || createSageSyncState()),
          status: readiness.ready ? "ready" : "not_ready",
          sageCustomerId: text(parsed.customer?.sageCustomerId) || null,
        };
  return {
    ...persisted,
    sageSync: protectedSync,
  };
}

export function getInvoiceDraftReferenceDisplay(invoice = {}) {
  const jobNumber = draftIdentityPart(invoice.jobNumber);
  if (jobNumber) return `DRAFT-${jobNumber}`;
  return text(invoice.draftReference) || "Draft reference unavailable";
}

export function getInvoiceIdentityDisplay(invoice = {}) {
  const invoiceNumber = text(invoice.invoiceNumber);
  return {
    isDraft: !invoiceNumber,
    documentLabel: invoiceNumber ? "Tax invoice" : "Draft invoice",
    officialNumber: invoiceNumber || "Pending",
    draftReference: getInvoiceDraftReferenceDisplay(invoice),
  };
}

export function normaliseInvoiceLine(line = {}, index = 0) {
  const quantity = number(line.quantity ?? line.qty);
  const unitPrice = number(line.unitPrice);
  const taxRate = number(line.taxRate ?? 20);
  return {
    id: text(line.id) || `line-${index + 1}`,
    sourceLineId: text(line.sourceLineId || line.id),
    section: text(line.section),
    description: text(line.description),
    quantity,
    unitPrice,
    taxRate,
    nominalCode: text(line.nominalCode),
    taxCode: text(line.taxCode),
    notes: text(line.notes),
  };
}

const isSelectableQuoteLine = (line = {}) =>
  text(line.totalMode || "auto").toLowerCase() !== "discount";

export function invoiceLinesWithQuantity(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map((line, index) => normaliseInvoiceLine(line, index))
    .filter((line) => line.quantity > 0);
}

export function calculateInvoiceTotals(lines = []) {
  const calculatedLines = lines.map((raw, index) => {
    const line = normaliseInvoiceLine(raw, index);
    const net = roundMoney(line.quantity * line.unitPrice);
    const tax = roundMoney(net * (line.taxRate / 100));
    return { ...line, net, tax, gross: roundMoney(net + tax) };
  });
  return {
    lines: calculatedLines,
    net: roundMoney(calculatedLines.reduce((sum, line) => sum + line.net, 0)),
    tax: roundMoney(calculatedLines.reduce((sum, line) => sum + line.tax, 0)),
    gross: roundMoney(calculatedLines.reduce((sum, line) => sum + line.gross, 0)),
  };
}

export function duplicateInvoiceLineForEditing(lines = [], index = -1, id = `line-${Date.now()}`) {
  const source = lines[index];
  if (!source) return [...lines];
  const duplicate = {
    ...source,
    id,
    sourceLineId: "",
    section: text(source.section) || "Additional charges",
  };
  return [...lines.slice(0, index + 1), duplicate, ...lines.slice(index + 1)];
}

export function excludeInvoiceLineForEditing(lines = [], index = -1) {
  return lines.map((line, lineIndex) =>
    lineIndex === index ? { ...line, quantity: 0 } : line
  );
}

export function restoreInvoiceLineFromQuote(lines = [], index = -1, sourceLines = []) {
  const target = lines[index];
  if (!target) return [...lines];
  const sourceLine = sourceLines.find(
    (line) => text(line.id) === text(target.sourceLineId)
  );
  const restoredQuantity = number(sourceLine?.qty ?? sourceLine?.quantity) || 1;
  return lines.map((line, lineIndex) =>
    lineIndex === index ? { ...line, quantity: restoredQuantity } : line
  );
}

export function hydrateInvoiceDraftForEditing(invoice = {}) {
  if (text(invoice.status).toLowerCase() !== INVOICE_STATUSES.DRAFT) return invoice;

  const savedLines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const sourceLines = Array.isArray(invoice.sourceQuote?.snapshot?.lineItems)
    ? invoice.sourceQuote.snapshot.lineItems
    : [];
  if (!sourceLines.length) return invoice;

  const savedBySource = new Map();
  savedLines.forEach((line, index) => {
    const key = text(line.sourceLineId || line.id);
    if (key) savedBySource.set(key, normaliseInvoiceLine(line, index));
  });

  const sourceKeys = new Set();
  const editorLines = sourceLines
    .filter(isSelectableQuoteLine)
    .map((sourceLine, index) => {
      const sourceKey = text(sourceLine.id) || `quote-line-${index + 1}`;
      sourceKeys.add(sourceKey);
      const quoteLine = normaliseInvoiceLine(
        {
          ...sourceLine,
          id: sourceKey,
          sourceLineId: sourceKey,
          quantity: sourceLine.qty,
          taxRate: sourceLine.taxRate ?? 20,
        },
        index
      );
      const savedLine = savedBySource.get(sourceKey);
      return savedLine
        ? normaliseInvoiceLine(
            {
              ...quoteLine,
              ...savedLine,
              id: savedLine.id || quoteLine.id,
              sourceLineId: sourceKey,
            },
            index
          )
        : quoteLine;
    });

  savedLines.forEach((line, index) => {
    const sourceKey = text(line.sourceLineId || line.id);
    if (!sourceKey || !sourceKeys.has(sourceKey)) {
      editorLines.push(normaliseInvoiceLine(line, editorLines.length + index));
    }
  });

  const totals = calculateInvoiceTotals(editorLines);
  return {
    ...invoice,
    lines: totals.lines,
    totals: { net: totals.net, tax: totals.tax, gross: totals.gross },
  };
}

export function resolveAcceptedQuote(booking = {}) {
  const versions = Array.isArray(booking.quoteVersions) ? booking.quoteVersions : [];
  const acceptedNumber = text(booking.acceptedQuoteNumber);
  const quoteNumber = (quote = {}) =>
    text(quote.quoteNumber || quote.number || quote.quoteNo || quote.reference);
  const withCanonicalNumber = (quote) => {
    if (!quote) return null;
    const resolvedNumber = quoteNumber(quote) || acceptedNumber;
    return resolvedNumber ? { ...quote, quoteNumber: resolvedNumber } : null;
  };

  const explicitlySelected = acceptedNumber
    ? versions.find((quote) => quoteNumber(quote) === acceptedNumber)
    : null;
  if (explicitlySelected) return withCanonicalNumber(explicitlySelected);

  const acceptedVersion = versions.find(
    (quote) => ["accepted", "approved"].includes(text(quote.status).toLowerCase())
  );
  if (acceptedVersion) return withCanonicalNumber(acceptedVersion);

  const legacyQuote = booking.quote && typeof booking.quote === "object" ? booking.quote : null;
  if (
    legacyQuote &&
    (acceptedNumber || ["accepted", "approved"].includes(text(legacyQuote.status).toLowerCase()))
  ) {
    return withCanonicalNumber(legacyQuote);
  }

  const completedJob = /complete|completed|ready to invoice|invoiced|paid/.test(
    text(booking.status).toLowerCase().replace(/[_-]+/g, " ")
  );
  if (completedJob) {
    const latestSavedVersion = versions.at(-1);
    if (latestSavedVersion) return withCanonicalNumber(latestSavedVersion);
    if (legacyQuote) return withCanonicalNumber(legacyQuote);
  }

  return null;
}

export function createInvoiceDraftFromQuote({
  booking = {},
  quote,
  actor = "",
  now = new Date().toISOString(),
  taxRate = 20,
} = {}) {
  if (!quote || !text(quote.quoteNumber)) {
    throw new Error("An approved saved quote is required before an invoice draft can be created.");
  }

  const sourceLines = Array.isArray(quote.lineItems) ? quote.lineItems : [];
  const invoiceLines = sourceLines
    .filter(isSelectableQuoteLine)
    .map((line, index) =>
      normaliseInvoiceLine(
        {
          ...line,
          sourceLineId: line.id,
          quantity: line.qty,
          taxRate,
        },
        index
      )
    );
  const totals = calculateInvoiceTotals(invoiceLines);

  return {
    schemaVersion: INVOICE_SCHEMA_VERSION,
    bookingId: text(booking.id),
    jobNumber: text(booking.jobNumber || booking.id),
    companyId: text(booking.companyId),
    status: INVOICE_STATUSES.DRAFT,
    draftReference: createDraftReference(booking),
    // The external accounting system is the authority for this value.
    invoiceNumber: null,
    sageSync: createSageSyncState(),
    delivery: createInvoiceDeliveryState(),
    currency: "GBP",
    customer: createInvoiceCustomerSnapshot({}, {
      name: text(booking.client || quote.client),
      contactName: text(booking.invoiceContactName),
      email: text(booking.invoiceContactEmail),
      phone: text(booking.invoiceContactPhone),
      address: text(booking.invoiceAddress || booking.clientAddress),
    }),
    purchaseOrderNumber: text(booking.finance?.poNumber || booking.poNumber),
    issueDate: "",
    dueDate: "",
    paymentTermsDays: 30,
    sourceQuote: {
      quoteNumber: text(quote.quoteNumber),
      version: number(quote.version),
      savedAt: text(quote.savedAt || quote.updatedAt),
      acceptedAt: text(quote.acceptedAt || booking.quoteAcceptedAt),
      snapshot: {
        quoteName: text(quote.quoteName),
        notes: text(quote.notes),
        lineItems: sourceLines.map((line) => ({ ...line })),
        subtotal: number(quote.subtotal),
      },
    },
    lines: totals.lines,
    totals: { net: totals.net, tax: totals.tax, gross: totals.gross },
    notes: "",
    internalFinanceNotes: "",
    changeReason: "",
    payments: [],
    audit: [
      {
        action: "created_from_quote",
        fromStatus: null,
        toStatus: INVOICE_STATUSES.DRAFT,
        at: now,
        by: text(actor) || "Unknown",
        reason: `Created from approved job quote ${text(quote.quoteNumber)}`,
      },
    ],
    createdAt: now,
    createdBy: text(actor) || "Unknown",
    updatedAt: now,
    updatedBy: text(actor) || "Unknown",
  };
}

export function canTransitionInvoice(fromStatus, toStatus) {
  return (INVOICE_TRANSITIONS[text(fromStatus)] || []).includes(text(toStatus));
}

export function transitionInvoice(invoice, toStatus, { actor = "", reason = "", now = new Date().toISOString() } = {}) {
  const fromStatus = text(invoice?.status);
  if (!canTransitionInvoice(fromStatus, toStatus)) {
    throw new Error(`Invoice cannot move from ${fromStatus || "unknown"} to ${toStatus}.`);
  }
  if (toStatus === INVOICE_STATUSES.ISSUED && !text(invoice?.invoiceNumber)) {
    throw new Error("A Sage invoice number is required before issue.");
  }
  const totals = calculateInvoiceTotals(invoice.lines);
  return {
    ...invoice,
    status: toStatus,
    lines: totals.lines,
    totals: { net: totals.net, tax: totals.tax, gross: totals.gross },
    approvedAt: toStatus === INVOICE_STATUSES.APPROVED ? now : invoice.approvedAt || "",
    issuedAt: toStatus === INVOICE_STATUSES.ISSUED ? now : invoice.issuedAt || "",
    paidAt: toStatus === INVOICE_STATUSES.PAID ? now : invoice.paidAt || "",
    voidedAt: toStatus === INVOICE_STATUSES.VOID ? now : invoice.voidedAt || "",
    updatedAt: now,
    updatedBy: text(actor) || "Unknown",
    audit: [
      ...(Array.isArray(invoice.audit) ? invoice.audit : []),
      {
        action: "status_changed",
        fromStatus,
        toStatus,
        at: now,
        by: text(actor) || "Unknown",
        reason: text(reason),
      },
    ],
  };
}

export function validateInvoice(invoice = {}) {
  const errors = [];
  if (invoice.schemaVersion !== INVOICE_SCHEMA_VERSION) errors.push("Unsupported invoice schema version.");
  if (!text(invoice.bookingId)) errors.push("Booking is required.");
  if (
    invoice.schemaVersion === INVOICE_SCHEMA_VERSION &&
    !text(invoice.draftReference)
  ) {
    errors.push("Draft reference is required.");
  }
  if (!text(invoice.sourceQuote?.quoteNumber)) errors.push("Approved job quote is required.");
  if (!text(invoice.customer?.name)) errors.push("Customer name is required.");
  if (!Array.isArray(invoice.lines) || !invoice.lines.length) errors.push("At least one invoice line is required.");
  if (
    invoice.sageSync &&
    !SAGE_SYNC_STATUSES.includes(text(invoice.sageSync.status))
  ) {
    errors.push("Unsupported Sage sync status.");
  }
  (invoice.lines || []).forEach((line, index) => {
    if (!text(line.description)) errors.push(`Line ${index + 1} requires a description.`);
    if (number(line.quantity) < 0) errors.push(`Line ${index + 1} quantity cannot be negative.`);
  });
  if (
    [INVOICE_STATUSES.APPROVED, INVOICE_STATUSES.ISSUED].includes(text(invoice.status))
  ) {
    getAccountingMappingReadiness(invoice).blockers.forEach((blocker) => {
      errors.push(blocker.message);
    });
  }
  return errors;
}
