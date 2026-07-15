import { buildBookingAnalytics, normaliseBookingForAnalytics } from "./bookingAnalytics.js";
import { bookingOutcomeCategory, canonicalBookingStatus } from "./bookingLifecycle.js";
import { mergeBickersBusinessRules } from "./bickersBusinessRules.js";

const DAY_MS = 86400000;
const round1 = (value) => Math.round(Number(value || 0) * 10) / 10;
const safeNumber = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
};

const parseDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "object" && Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfUtcDay = (value) => {
  const date = parseDate(value) || new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
const inRange = (date, start, endExclusive) => date && date >= start && date < endExclusive;
const percentChange = (current, previous) => previous ? round1(((current - previous) / previous) * 100) : null;

const bookingAnchorDate = (booking, normalised) =>
  parseDate(normalised.firstDate || booking.firstBookingDate || booking.createdAt);

const reliableQuoteValue = (booking) => {
  const quote = booking.quote && typeof booking.quote === "object" ? booking.quote : {};
  const accepted = String(quote.status || booking.quoteStatus || "").trim().toLowerCase() === "accepted";
  return accepted
    ? safeNumber(quote.subtotal, quote.total, booking.acceptedQuoteTotal, booking.quoteTotal)
    : null;
};

const reliableInvoiceValue = (booking) =>
  safeNumber(booking.finance?.total, booking.invoiceTotal, booking.invoiceAmount);

const isPaid = (booking) => {
  const status = canonicalBookingStatus(booking.status);
  const invoiceStatus = String(booking.invoiceStatus || booking.financeStatus || "").trim().toLowerCase();
  return status === "Paid" || ["paid", "settled"].includes(invoiceStatus) || Boolean(booking.finance?.paidAt || booking.paidAt);
};

const isInvoiced = (booking) => {
  const status = canonicalBookingStatus(booking.status);
  const invoiceStatus = String(booking.invoiceStatus || booking.financeStatus || "").trim().toLowerCase();
  return ["Invoiced", "Paid"].includes(status) || ["invoiced", "paid", "settled"].includes(invoiceStatus) || Boolean(booking.finance?.invoicedAt || booking.invoicedAt);
};

const clientConcentration = (analytics) => {
  const top = analytics.topClients?.[0];
  return analytics.totals.bookingCount && top
    ? { client: top.name, bookings: top.count, percent: round1((top.count / analytics.totals.bookingCount) * 100) }
    : { client: "", bookings: 0, percent: 0 };
};

const coreComplete = (booking, normalised) =>
  Boolean(normalised.dates.length && String(booking.status || "").trim() && /^\d{4}$/.test(String(booking.jobNumber || "").trim()));

const groupLossReasons = (rows) => {
  const counts = new Map();
  rows.forEach(({ raw }) => {
    const reasons = Array.isArray(raw.statusReasons) ? raw.statusReasons : [];
    reasons.forEach((reason) => {
      const label = String(reason || "").trim();
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
};

export function buildStatisticsInsightSnapshot(bookings = [], options = {}) {
  const now = startOfUtcDay(options.now || new Date());
  const rules = mergeBickersBusinessRules(options.rules);
  const currentStart = addDays(now, -30);
  const previousStart = addDays(now, -60);
  const trendStart = addDays(now, -365);
  const in14Days = addDays(now, 15);
  const in30Days = addDays(now, 31);

  const rows = bookings.map((raw) => {
    const normalised = normaliseBookingForAnalytics(raw);
    return { raw, normalised, anchor: bookingAnchorDate(raw, normalised) };
  });
  const currentRows = rows.filter((row) => inRange(row.anchor, currentStart, addDays(now, 1)));
  const previousRows = rows.filter((row) => inRange(row.anchor, previousStart, currentStart));
  const trendRows = rows.filter((row) => inRange(row.anchor, trendStart, addDays(now, 1)));
  const currentAnalytics = buildBookingAnalytics(currentRows.map((row) => row.raw));
  const previousAnalytics = buildBookingAnalytics(previousRows.map((row) => row.raw));
  const trendAnalytics = buildBookingAnalytics(trendRows.map((row) => row.raw));

  const upcoming = (endExclusive) => rows.filter(({ normalised }) =>
    normalised.dates.some((date) => inRange(parseDate(`${date}T00:00:00.000Z`), now, endExclusive))
      && !["lost"].includes(normalised.statusCategory)
  );

  const decidedRows = rows.filter(({ raw }) => bookingOutcomeCategory(raw.status) !== "open");
  const won = decidedRows.filter(({ raw }) => bookingOutcomeCategory(raw.status) === "won").length;
  const lostRows = decidedRows.filter(({ raw }) => bookingOutcomeCategory(raw.status) === "lost");

  const invoiceRows = rows.filter(({ raw }) => isInvoiced(raw));
  const valuedInvoiceRows = invoiceRows.filter(({ raw }) => reliableInvoiceValue(raw) !== null);
  const unpaidRows = invoiceRows.filter(({ raw }) => !isPaid(raw));
  const valuedUnpaidRows = unpaidRows.filter(({ raw }) => reliableInvoiceValue(raw) !== null);
  const quoteRows = rows.filter(({ raw }) => reliableQuoteValue(raw) !== null);
  const staleInvoiceDays = Number(rules.thresholds.staleInvoiceDays || 30);
  const staleInvoices = unpaidRows.filter(({ raw }) => {
    const invoicedAt = parseDate(raw.finance?.invoicedAt || raw.invoicedAt);
    return invoicedAt && (now.getTime() - invoicedAt.getTime()) / DAY_MS >= staleInvoiceDays;
  });

  const completeCore = currentRows.filter(({ raw, normalised }) => coreComplete(raw, normalised)).length;
  const dataQualityRate = currentRows.length ? round1((completeCore / currentRows.length) * 100) : 100;
  const concentration = clientConcentration(currentAnalytics);

  const snapshot = {
    schemaVersion: 1,
    asOf: now.toISOString(),
    companyId: options.companyId || rules.companyId || "bickers-action",
    periods: {
      current30: { start: currentStart.toISOString(), end: now.toISOString() },
      previous30: { start: previousStart.toISOString(), end: currentStart.toISOString() },
      rolling12Months: { start: trendStart.toISOString(), end: now.toISOString() },
    },
    current30: {
      bookings: currentAnalytics.totals.bookingCount,
      bookingDays: currentAnalytics.totals.bookingDays,
      shootDays: currentAnalytics.totals.shootDays,
      credits: round1(currentAnalytics.totals.credits),
      confirmed: currentAnalytics.totals.confirmed,
      tentative: currentAnalytics.totals.tentative,
      won: currentAnalytics.totals.won,
      lost: currentAnalytics.totals.lost,
    },
    previous30: {
      bookings: previousAnalytics.totals.bookingCount,
      bookingDays: previousAnalytics.totals.bookingDays,
      shootDays: previousAnalytics.totals.shootDays,
      credits: round1(previousAnalytics.totals.credits),
    },
    changes: {
      bookingsPercent: percentChange(currentAnalytics.totals.bookingCount, previousAnalytics.totals.bookingCount),
      bookingDaysPercent: percentChange(currentAnalytics.totals.bookingDays, previousAnalytics.totals.bookingDays),
      shootDaysPercent: percentChange(currentAnalytics.totals.shootDays, previousAnalytics.totals.shootDays),
    },
    pipeline: {
      next14Days: upcoming(in14Days).length,
      next30Days: upcoming(in30Days).length,
      tentative: rows.filter(({ normalised }) => normalised.statusCategory === "tentative").length,
      confirmed: rows.filter(({ normalised }) => normalised.statusCategory === "confirmed").length,
    },
    outcomes: {
      won,
      lost: lostRows.length,
      decided: won + lostRows.length,
      conversionRate: won + lostRows.length ? round1((won / (won + lostRows.length)) * 100) : 0,
      lossReasons: groupLossReasons(lostRows),
    },
    rolling12Months: {
      bookings: trendAnalytics.totals.bookingCount,
      bookingDays: trendAnalytics.totals.bookingDays,
      monthly: trendAnalytics.byMonth,
      monthsWithData: trendAnalytics.byMonth.filter((month) => month.month !== "Unknown").length,
    },
    clients: { top: concentration },
    finance: {
      invoiceCoveragePercent: invoiceRows.length ? round1((valuedInvoiceRows.length / invoiceRows.length) * 100) : 100,
      invoicedJobs: invoiceRows.length,
      invoicedValue: round1(valuedInvoiceRows.reduce((sum, row) => sum + reliableInvoiceValue(row.raw), 0)),
      unpaidJobs: unpaidRows.length,
      unpaidValue: round1(valuedUnpaidRows.reduce((sum, row) => sum + reliableInvoiceValue(row.raw), 0)),
      staleInvoiceJobs: staleInvoices.length,
      acceptedQuoteCoveragePercent: rows.length ? round1((quoteRows.length / rows.length) * 100) : 100,
      acceptedQuoteValue: round1(quoteRows.reduce((sum, row) => sum + reliableQuoteValue(row.raw), 0)),
    },
    dataQuality: {
      coreComplete: completeCore,
      inScope: currentRows.length,
      rate: dataQualityRate,
      missingDates: currentAnalytics.dataQuality.missingDates,
      missingStatus: currentAnalytics.dataQuality.missingStatus,
      missingJobNumber: currentAnalytics.dataQuality.missingJobNumber,
      invalidJobNumber: currentAnalytics.dataQuality.invalidJobNumber,
      missingQuote: currentAnalytics.dataQuality.missingQuote,
      missingAttachments: currentAnalytics.dataQuality.missingAttachments,
    },
  };

  snapshot.signals = detectStatisticsSignals(snapshot, rules);
  snapshot.evidenceCatalog = buildEvidenceCatalog(snapshot);
  return snapshot;
}

export function detectStatisticsSignals(snapshot, rulesInput = {}) {
  const rules = mergeBickersBusinessRules(rulesInput);
  const thresholds = rules.thresholds;
  const signals = [];
  const enough = snapshot.current30.bookings >= Number(thresholds.minimumComparisonJobs)
    && snapshot.previous30.bookings >= Number(thresholds.minimumComparisonJobs);
  if (enough && snapshot.changes.bookingsPercent !== null && Math.abs(snapshot.changes.bookingsPercent) >= Number(thresholds.materialChangePercent)) {
    signals.push({ id: "booking_change", type: snapshot.changes.bookingsPercent < 0 ? "risk" : "opportunity", severity: "medium" });
  }
  if (snapshot.clients.top.percent >= Number(thresholds.clientConcentrationPercent) && snapshot.current30.bookings >= Number(thresholds.minimumComparisonJobs)) {
    signals.push({ id: "client_concentration", type: "risk", severity: "medium" });
  }
  if (snapshot.finance.staleInvoiceJobs > 0) signals.push({ id: "stale_invoices", type: "risk", severity: "high" });
  if (snapshot.dataQuality.rate < Number(thresholds.dataQualityWarningPercent)) signals.push({ id: "data_quality", type: "data_quality", severity: "medium" });
  return signals;
}

export function buildEvidenceCatalog(snapshot) {
  return [
    { id: "bookings_30d", label: "Bookings in the last 30 days", value: snapshot.current30.bookings, comparison: snapshot.changes.bookingsPercent, unit: "jobs" },
    { id: "booking_days_30d", label: "Booking days in the last 30 days", value: snapshot.current30.bookingDays, comparison: snapshot.changes.bookingDaysPercent, unit: "days" },
    { id: "pipeline_30d", label: "Bookings scheduled in the next 30 days", value: snapshot.pipeline.next30Days, comparison: null, unit: "jobs" },
    { id: "conversion", label: "Decided-outcome conversion", value: snapshot.outcomes.conversionRate, comparison: null, unit: "%" },
    { id: "client_concentration", label: `Largest client share${snapshot.clients.top.client ? ` (${snapshot.clients.top.client})` : ""}`, value: snapshot.clients.top.percent, comparison: null, unit: "%" },
    { id: "data_quality", label: "Core booking data completeness", value: snapshot.dataQuality.rate, comparison: null, unit: "%" },
    { id: "unpaid_value", label: "Known unpaid invoice value", value: snapshot.finance.unpaidValue, comparison: null, unit: "GBP", financeOnly: true },
    { id: "stale_invoices", label: "Invoices unpaid beyond the configured threshold", value: snapshot.finance.staleInvoiceJobs, comparison: null, unit: "jobs", financeOnly: true },
    { id: "invoice_coverage", label: "Invoice value coverage", value: snapshot.finance.invoiceCoveragePercent, comparison: null, unit: "%", financeOnly: true },
  ];
}

export function redactSnapshotForVariant(snapshot, variant = "booking") {
  if (variant === "management") return snapshot;
  const { finance, ...rest } = snapshot;
  return {
    ...rest,
    evidenceCatalog: (snapshot.evidenceCatalog || []).filter((item) => !item.financeOnly),
    signals: (snapshot.signals || []).filter((item) => item.id !== "stale_invoices"),
  };
}
