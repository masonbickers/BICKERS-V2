const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate();
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

const parseNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const quoteSuffixNumber = (quoteNumber = "") => {
  const match = publicQuoteNumber(quoteNumber).match(/(?:^|-)(\d{1,4})$/);
  return match ? Number(match[1]) : 0;
};

const splitQuoteRevision = (quoteNumber = "") => {
  const text = String(quoteNumber || "").trim();
  const match = text.match(/^(.+)\.(\d+)$/);
  return {
    base: (match ? match[1] : text).trim(),
    revision: match?.[2] ? Number(match[2]) : 0,
  };
};

const publicQuoteNumber = (quoteNumber = "") => splitQuoteRevision(quoteNumber).base;

const jobSortNumber = (jobNumber = "") => {
  const match = String(jobNumber || "").trim().match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
};

const normaliseQuoteVersions = (booking = {}) => {
  const versions = Array.isArray(booking.quoteVersions)
    ? booking.quoteVersions.filter((entry) => entry && typeof entry === "object")
    : [];
  const legacyQuote =
    booking.quote && typeof booking.quote === "object" && !versions.length ? [booking.quote] : [];
  return [...versions, ...legacyQuote];
};

export const money = (value) =>
  parseNumber(value).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const formatQuoteDate = (raw) => {
  const date = parseDate(raw);
  if (!date) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const displayQuoteNumber = (quoteNumber = "", jobNumber = "") => {
  const text = publicQuoteNumber(quoteNumber);
  if (!text) return "";
  const job = String(jobNumber || "").trim();
  if (job) {
    const escapedJob = job.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`^Q?${escapedJob}[-_\\s]+(.+)$`, "i"));
    if (match?.[1]) return match[1];
  }
  const suffixMatch = text.match(/^[A-Z]?\d+[-_\s]+(.+)$/i);
  return suffixMatch?.[1] || text;
};

export const completedQuoteLabel = (quote = {}) => {
  const jobNumber = String(quote.jobNumber || "").trim();
  const quoteNumber = String(quote.displayQuoteNumber || displayQuoteNumber(quote.quoteNumber, jobNumber) || "").trim();
  return jobNumber && quoteNumber ? `#${jobNumber}-${quoteNumber}` : jobNumber ? `#${jobNumber}` : quoteNumber || "-";
};

export const completedQuoteName = (quote = {}) => {
  const name = String(quote.quoteName || quote.displayName || "").trim();
  if (name) return name;
  return String(quote.templateName || quote.templateFile || "").trim();
};

const completedQuoteKey = (row = {}) =>
  [
    row.bookingId || "",
    String(row.jobNumber || "").trim().toLowerCase(),
    String(row.displayQuoteNumber || publicQuoteNumber(row.quoteNumber) || "").trim().toLowerCase(),
  ].join("|");

const latestQuoteRow = (current, candidate) => {
  if (!current) return candidate;
  const currentTime = current.savedDate?.getTime() || 0;
  const candidateTime = candidate.savedDate?.getTime() || 0;
  if (candidateTime !== currentTime) return candidateTime > currentTime ? candidate : current;
  return (candidate.sourceIndex || 0) > (current.sourceIndex || 0) ? candidate : current;
};

export const getCompletedQuoteRows = (bookings = []) => {
  const rows = bookings
    .flatMap((booking) =>
      normaliseQuoteVersions(booking)
        .filter((quote) => quote.savedAt || quote.updatedAt || quote.quoteNumber || quote.lineItems?.length)
        .map((quote, index) => {
          const quoteNumber = String(quote.quoteNumber || booking.quoteNumber || "").trim();
          const savedDate = parseDate(quote.savedAt || quote.updatedAt || quote.createdAt);
          const row = {
            id: `${booking.id || booking.jobNumber || "booking"}-${quoteNumber || index}`,
            bookingId: booking.id,
            jobNumber: quote.jobNumber || booking.jobNumber || "",
            quoteNumber,
            displayQuoteNumber: displayQuoteNumber(quoteNumber, quote.jobNumber || booking.jobNumber || ""),
            quoteSort: quoteSuffixNumber(quoteNumber),
            client: quote.client || booking.client || "",
            production: booking.production || quote.production || "",
            location: quote.location || booking.location || "",
            status: quote.status || "Draft",
            quoteName: completedQuoteName(quote),
            subtotal: parseNumber(quote.subtotal),
            savedAt: quote.savedAt || quote.updatedAt || quote.createdAt || "",
            savedDate,
            savedBy: quote.savedBy || quote.updatedBy || "",
            templateName: quote.templateName || quote.templateFile || "",
            lineCount: Array.isArray(quote.lineItems) ? quote.lineItems.length : 0,
            sourceIndex: index,
          };
          return { ...row, label: completedQuoteLabel(row) };
        })
    );

  const dedupedRows = Array.from(
    rows
      .reduce((map, row) => {
        const key = completedQuoteKey(row);
        map.set(key, latestQuoteRow(map.get(key), row));
        return map;
      }, new Map())
      .values()
  );

  return dedupedRows
    .sort((a, b) => {
      const jobCompare = jobSortNumber(a.jobNumber) - jobSortNumber(b.jobNumber);
      if (jobCompare) return jobCompare;
      const quoteCompare = a.quoteSort - b.quoteSort;
      if (quoteCompare) return quoteCompare;
      return (a.savedDate?.getTime() || 0) - (b.savedDate?.getTime() || 0);
    });
};

export const quoteMatchesSearch = (quote, term = "") => {
  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return true;
  return [quote.jobNumber, quote.quoteNumber, quote.quoteName, quote.client, quote.production, quote.location, quote.status, quote.templateName]
    .some((value) => String(value || "").toLowerCase().includes(needle));
};
