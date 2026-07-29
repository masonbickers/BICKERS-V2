const text = (value) => String(value ?? "").trim();
const STANDARD_VAT_RATE = 0.2;
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export const findAcceptedQuoteSnapshot = (job = {}, quotes = []) => {
  const acceptedNumber = text(job.acceptedQuoteNumber);
  if (acceptedNumber) {
    return quotes.find((quote) => text(quote?.quoteNumber) === acceptedNumber) || null;
  }
  const explicitlyApproved = quotes.find((quote) =>
    ["accepted", "approved"].includes(text(quote?.status).toLowerCase())
  );
  if (explicitlyApproved) return explicitlyApproved;

  const completedJob = /complete|completed|ready to invoice|invoiced|paid/.test(
    text(job.status).toLowerCase().replace(/[_-]+/g, " ")
  );
  return completedJob ? quotes.at(-1) || null : null;
};

const explicitAmount = (entry = {}) =>
  numberOrNull(entry.netAmount ?? entry.amount ?? entry.value ?? entry.total);

const classifyAdjustment = (entry = {}, collectionName = "") => {
  const kind = text(entry.type || entry.kind || entry.category || collectionName).toLowerCase();
  if (/deduction|discount|credit|reduction/.test(kind)) return "deduction";
  return "addition";
};

export const resolveStructuredAdjustments = (job = {}) => {
  const collections = [
    ["variations", job.variations],
    ["additional charges", job.additionalCharges],
    ["expenses", job.expenses],
    ["adjustments", job.adjustments],
    ["deductions", job.deductions],
    ["discounts", job.discounts],
  ];
  const records = collections.flatMap(([collectionName, entries]) =>
    Array.isArray(entries)
      ? entries
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const amount = explicitAmount(entry);
            if (amount === null) return null;
            const type = classifyAdjustment(entry, collectionName);
            return {
              type,
              amount: Math.abs(amount),
              reason: text(entry.reason || entry.description || entry.name),
              source: text(entry.source || entry.origin || collectionName),
              clientApprovalEvidence: Boolean(
                entry.clientApproved ||
                entry.approvalEvidence ||
                entry.clientApprovalEvidence ||
                entry.approvalAttachment
              ),
            };
          })
          .filter(Boolean)
      : []
  );
  const additions = records
    .filter((record) => record.type === "addition")
    .reduce((sum, record) => sum + record.amount, 0);
  const deductions = records
    .filter((record) => record.type === "deduction")
    .reduce((sum, record) => sum + record.amount, 0);
  return { records, additions, deductions, hasStructuredData: records.length > 0 };
};

export const resolveQuoteDiscount = (quote = {}) => {
  const amount = numberOrNull(
    quote.discountAmount ?? quote.discountTotal ?? quote.totals?.discount
  );
  const percentage = numberOrNull(quote.discountPercentage ?? quote.discountPercent);
  const discountLines = Array.isArray(quote.lineItems)
    ? quote.lineItems.filter((line) =>
        text(line?.totalMode).toLowerCase() === "discount" ||
        /discount/i.test(`${text(line?.section)} ${text(line?.description)}`)
      )
    : [];
  return {
    amount,
    percentage,
    present: amount !== null || percentage !== null || discountLines.length > 0,
    lineDescription: discountLines.map((line) => text(line.description)).filter(Boolean).join(", "),
  };
};

export const resolveAcceptanceEvidence = (job = {}, quote = {}) => {
  const method = text(
    quote.acceptanceMethod || job.quoteAcceptanceMethod || job.acceptanceMethod
  ).toLowerCase();
  const evidence = quote.acceptanceEvidence || job.quoteAcceptanceEvidence || job.acceptanceEvidence;
  const evidenceText = text(
    typeof evidence === "object"
      ? evidence.type || evidence.name || evidence.method
      : evidence
  ).toLowerCase();
  const combined = `${method} ${evidenceText}`;
  if (/email/.test(combined)) return { label: "Email evidence attached", warning: false };
  if (/signed|signature/.test(combined)) return { label: "Signed quote attached", warning: false };
  if (/purchase order|\\bpo\\b/.test(combined)) return { label: "Purchase order used as acceptance", warning: false };
  if (/verbal|phone/.test(combined)) return { label: "Verbal acceptance recorded", warning: false };
  return { label: "No acceptance evidence recorded", warning: true };
};

export const resolvePoPosition = (job = {}) => {
  const number = text(job.poNumber || job.purchaseOrder || job.reference || job.po);
  const requirement =
    job.poRequired ?? job.purchaseOrderRequired ?? job.requiresPurchaseOrder ?? job.finance?.poRequired;
  let status = "PO status unknown";
  if (number) status = "Provided";
  else if (requirement === false) status = "PO not required";
  else if (/pending/i.test(text(job.poStatus))) status = "PO pending";
  else if (requirement === true) status = "PO missing";
  const value = numberOrNull(job.poValue ?? job.purchaseOrderValue ?? job.finance?.poValue);
  return { number, status, value };
};

export const buildCommercialPosition = ({ job = {}, quote = null } = {}) => {
  // Quote prices are stored and presented excluding VAT. Older quote snapshots often
  // only contain `subtotal` or `total`, so never interpret `total` as VAT-inclusive.
  const acceptedNet = numberOrNull(
    quote?.subtotal ?? quote?.totals?.net ?? quote?.total
  );
  const explicitVat = numberOrNull(
    quote?.vatTotal ?? quote?.taxTotal ?? quote?.totals?.vat ?? quote?.totals?.tax
  );
  const vat = explicitVat ?? (acceptedNet === null ? null : acceptedNet * STANDARD_VAT_RATE);
  const gross = acceptedNet === null || vat === null ? null : acceptedNet + vat;
  const adjustments = resolveStructuredAdjustments(job);
  const expectedNet =
    acceptedNet === null ? null : acceptedNet + adjustments.additions - adjustments.deductions;
  const variance = acceptedNet === null || expectedNet === null ? null : expectedNet - acceptedNet;
  const variancePercentage =
    variance === null || !acceptedNet ? null : (variance / acceptedNet) * 100;
  return {
    acceptedNet,
    vat,
    gross,
    currency: text(quote?.currency || job.currency || job.finance?.currency),
    adjustments,
    expectedNet,
    variance,
    variancePercentage,
    discount: resolveQuoteDiscount(quote || {}),
    evidence: resolveAcceptanceEvidence(job, quote || {}),
    po: resolvePoPosition(job),
  };
};
