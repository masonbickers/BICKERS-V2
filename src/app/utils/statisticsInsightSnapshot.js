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
  parseDate(normalised.firstDate || booking.firstBookingDate);

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

const monthKey = (value) => {
  const date = parseDate(value);
  return date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` : "";
};

const monthDate = (key) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : null;
};

const shiftMonth = (key, amount) => {
  const date = monthDate(key);
  if (!date) return "";
  date.setUTCMonth(date.getUTCMonth() + amount);
  return monthKey(date);
};

const monthName = (key) => {
  const date = monthDate(key);
  return date ? date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "Unknown month";
};

const average = (values) => values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
};

const firstHistoryDate = (booking, status) => {
  const wanted = canonicalBookingStatus(status);
  return (Array.isArray(booking.statusHistory) ? booking.statusHistory : [])
    .map((entry) => ({ status: canonicalBookingStatus(entry?.to || entry?.status), date: parseDate(entry?.changedAt || entry?.timestamp || entry?.date) }))
    .filter((entry) => entry.status === wanted && entry.date)
    .sort((a, b) => a.date - b.date)[0]?.date || null;
};

const lifecycleDate = (booking, field, status) => parseDate(booking.lifecycle?.[field]) || firstHistoryDate(booking, status);

const durationSummary = (rows, fromDate, toDate, minimumSample) => {
  const eligible = rows.filter((row) => toDate(row.raw));
  const durations = eligible.map((row) => {
    const from = fromDate(row.raw);
    const to = toDate(row.raw);
    if (!from || !to || to < from) return null;
    return round1((to.getTime() - from.getTime()) / DAY_MS);
  }).filter(Number.isFinite);
  const coveragePercent = eligible.length ? round1((durations.length / eligible.length) * 100) : 0;
  const confidence = durations.length < minimumSample ? "low" : coveragePercent >= 80 ? "high" : "medium";
  return { averageDays: average(durations), medianDays: median(durations), sampleSize: durations.length, eligible: eligible.length, coveragePercent, confidence };
};

const bookingMonthStats = (rows, key) => {
  const selected = rows.filter((row) => monthKey(row.anchor) === key);
  const analytics = buildBookingAnalytics(selected.map((row) => row.raw));
  return {
    month: key,
    label: monthName(key),
    bookings: analytics.totals.bookingCount,
    bookingDays: analytics.totals.bookingDays,
    shootDays: analytics.totals.shootDays,
    credits: round1(analytics.totals.credits),
  };
};

const stageDuration = (rows, fromField, fromStatus, toField, toStatus, minimumSample) =>
  durationSummary(
    rows,
    ({ lifecycle = {}, ...booking }) => parseDate(lifecycle[fromField]) || firstHistoryDate({ ...booking, lifecycle }, fromStatus),
    ({ lifecycle = {}, ...booking }) => parseDate(lifecycle[toField]) || firstHistoryDate({ ...booking, lifecycle }, toStatus),
    minimumSample
  );

const allocationGaps = (rows, now) => {
  const end = addDays(now, 31);
  const upcomingConfirmed = rows.filter(({ normalised }) =>
    normalised.statusCategory === "confirmed" && normalised.dates.some((date) => inRange(parseDate(`${date}T00:00:00.000Z`), now, end))
  );
  const missingCrew = upcomingConfirmed.filter(({ normalised }) => !normalised.employees.length).length;
  const missingVehicles = upcomingConfirmed.filter(({ normalised }) => !normalised.vehicles.length).length;
  const missingEquipment = upcomingConfirmed.filter(({ normalised }) => !normalised.equipment.length).length;
  return { upcomingConfirmed: upcomingConfirmed.length, missingCrew, missingVehicles, missingEquipment, jobsWithAnyGap: upcomingConfirmed.filter(({ normalised }) => !normalised.employees.length || !normalised.vehicles.length || !normalised.equipment.length).length };
};

function buildSectionSnapshot(rows, now, rules, finance, targetMonthOverride = "") {
  const latestCompletedMonth = /^\d{4}-\d{2}$/.test(String(targetMonthOverride || "")) ? targetMonthOverride : shiftMonth(monthKey(now), -1);
  const previousMonth = shiftMonth(latestCompletedMonth, -1);
  const sixMonthKeys = Array.from({ length: 6 }, (_, index) => shiftMonth(latestCompletedMonth, index - 6));
  const target = bookingMonthStats(rows, latestCompletedMonth);
  const previous = bookingMonthStats(rows, previousMonth);
  const baselineMonths = sixMonthKeys.map((key) => bookingMonthStats(rows, key));
  const sixMonthAverage = {
    bookings: average(baselineMonths.map((item) => item.bookings)),
    bookingDays: average(baselineMonths.map((item) => item.bookingDays)),
    shootDays: average(baselineMonths.map((item) => item.shootDays)),
    credits: average(baselineMonths.map((item) => item.credits)),
  };
  const currentOpen = bookingMonthStats(rows, monthKey(now));
  const minimumSample = Number(rules.thresholds.minimumLeadTimeSample || 5);
  const confirmedInTarget = rows.filter(({ raw }) => monthKey(lifecycleDate(raw, "confirmedAt", "Confirmed")) === latestCompletedMonth);
  const createdToConfirmed = durationSummary(
    confirmedInTarget,
    (booking) => parseDate(booking.createdAt || booking.lifecycle?.openedAt),
    (booking) => lifecycleDate(booking, "confirmedAt", "Confirmed"),
    minimumSample
  );
  const pencilToConfirmed = durationSummary(
    confirmedInTarget,
    (booking) => lifecycleDate(booking, "firstPencilAt", "First Pencil"),
    (booking) => lifecycleDate(booking, "confirmedAt", "Confirmed"),
    minimumSample
  );
  const targetAnalytics = buildBookingAnalytics(rows.filter((row) => monthKey(row.anchor) === latestCompletedMonth).map((row) => row.raw));
  const concentration = clientConcentration(targetAnalytics);
  const gaps = allocationGaps(rows, now);
  const stageDurations = {
    completeToReady: stageDuration(rows, "completedAt", "Complete", "readyToInvoiceAt", "Ready to Invoice", minimumSample),
    readyToInvoiced: stageDuration(rows, "readyToInvoiceAt", "Ready to Invoice", "invoicedAt", "Invoiced", minimumSample),
    invoicedToPaid: stageDuration(rows, "invoicedAt", "Invoiced", "paidAt", "Paid", minimumSample),
  };
  return {
    overview: {
      target,
      previous,
      sixMonthAverage,
      baselineMonths,
      currentOpen,
      changes: {
        bookingsVsPreviousPercent: percentChange(target.bookings, previous.bookings),
        bookingsVsSixMonthAveragePercent: percentChange(target.bookings, sixMonthAverage.bookings),
        bookingDaysVsPreviousPercent: percentChange(target.bookingDays, previous.bookingDays),
        shootDaysVsPreviousPercent: percentChange(target.shootDays, previous.shootDays),
      },
      confidence: target.bookings >= Number(rules.thresholds.minimumComparisonJobs) && previous.bookings >= Number(rules.thresholds.minimumComparisonJobs) ? "high" : "low",
    },
    trends: { period: target.label, createdToConfirmed, pencilToConfirmed, conversionRate: targetAnalytics.totals.conversionRate, decidedOutcomes: targetAnalytics.totals.decidedOutcomes },
    resources: { period: target.label, sampleSize: target.bookings, topClient: concentration, ...gaps },
    financeQuality: {
      readyToInvoice: finance.readyToInvoice,
      completeNotPaid: finance.completeNotPaid,
      stageDurations,
    },
  };
}

export function formatStatisticsEvidence(item) {
  if (!item) return "";
  const value = item.unit === "GBP" ? `£${Number(item.value || 0).toLocaleString("en-GB")}` : `${item.value}${item.unit === "%" ? "%" : ` ${item.unit || ""}`}`.trim();
  const comparison = Number.isFinite(item.comparison) ? ` (${item.comparison >= 0 ? "+" : ""}${item.comparison}% vs ${item.comparisonLabel || "comparison period"})` : "";
  const benchmark = Number.isFinite(item.benchmark) ? `; ${item.benchmarkLabel || "benchmark"}: ${item.benchmark}${item.unit === "%" ? "%" : ` ${item.unit || ""}`}` : "";
  const sample = Number.isFinite(item.sampleSize) ? `; sample ${item.sampleSize}${Number.isFinite(item.coveragePercent) ? ` (${item.coveragePercent}% coverage)` : ""}` : "";
  return `${item.label}: ${value}${comparison}${benchmark}${sample}`;
}

const movementWords = (value, baseline) => {
  if (!Number.isFinite(value)) return `cannot be compared reliably with ${baseline}`;
  if (Math.abs(value) < 5) return `was broadly level with ${baseline}`;
  return `was ${Math.abs(value)}% ${value > 0 ? "above" : "below"} ${baseline}`;
};

export function buildDeterministicSectionContent(snapshot, variant = "booking") {
  const sections = snapshot.sections || {};
  const overview = sections.overview || {};
  const trends = sections.trends || {};
  const resources = sections.resources || {};
  const finance = sections.financeQuality || {};
  const target = overview.target || {};
  const previous = overview.previous || {};
  const change = overview.changes || {};
  const minimumComparison = Number(snapshot.analysisConfig?.minimumComparisonJobs || 5);
  const leadSentence = (metric, label) => metric?.sampleSize >= Number(snapshot.analysisConfig?.minimumLeadTimeSample || 5)
    ? `${label} averaged ${metric.averageDays} days (median ${metric.medianDays}) across ${metric.sampleSize} bookings with ${metric.coveragePercent}% timestamp coverage.`
    : `${label} has only ${metric?.sampleSize || 0} reliable booking records, so no firm comparison is shown.`;
  const result = {
    overview: {
      summary: overview.confidence === "low"
        ? `${target.label || "The latest completed month"} contained ${target.bookings || 0} bookings and ${target.bookingDays || 0} booking days. The comparison sample is below the approved minimum of ${minimumComparison} bookings in both periods, so month-on-month and six-month movements are shown as evidence but not interpreted as a firm trend. The open current month contains ${overview.currentOpen?.bookings || 0} scheduled bookings and is not a forecast.`
        : `${target.label || "The latest completed month"} contained ${target.bookings || 0} bookings, ${movementWords(change.bookingsVsPreviousPercent, previous.label || "the previous month")} and ${movementWords(change.bookingsVsSixMonthAveragePercent, "the preceding six-month average")}. Booking days totalled ${target.bookingDays || 0}; the open current month currently contains ${overview.currentOpen?.bookings || 0} scheduled bookings and is not a forecast.`,
      evidenceIds: ["overview_month_bookings", "overview_booking_days", "overview_current_pipeline"],
      confidence: overview.confidence || "low",
      caveat: "The current month is incomplete. Comparisons describe movement and do not establish its cause.",
      actionKey: "statistics",
    },
    trends: {
      summary: `${leadSentence(trends.createdToConfirmed, "Created-to-confirmed time")} ${leadSentence(trends.pencilToConfirmed, "First-Pencil-to-confirmed time")} ${trends.decidedOutcomes >= minimumComparison ? `Decided-outcome conversion was ${trends.conversionRate || 0}% in ${trends.period || "the period"}.` : `Only ${trends.decidedOutcomes || 0} decided outcomes were recorded in ${trends.period || "the period"}, so no conversion conclusion is shown.`}`,
      evidenceIds: ["trends_created_to_confirmed", "trends_pencil_to_confirmed", "trends_conversion"],
      confidence: trends.createdToConfirmed?.confidence === "high" && trends.pencilToConfirmed?.confidence === "high" ? "high" : trends.createdToConfirmed?.confidence === "low" && trends.pencilToConfirmed?.confidence === "low" ? "low" : "medium",
      caveat: "Lead-time metrics exclude bookings with missing or conflicting lifecycle timestamps.",
      actionKey: "statistics",
    },
    resources: {
      summary: resources.topClient?.client && resources.sampleSize >= minimumComparison ? `${resources.topClient.client} represented ${resources.topClient.percent}% of bookings in ${resources.period}. ${resources.jobsWithAnyGap} of ${resources.upcomingConfirmed} confirmed jobs in the next 30 days currently have no recorded crew, vehicle or equipment allocation.` : `The client sample for ${resources.period || "the period"} is below the approved minimum, so no concentration conclusion is shown. ${resources.jobsWithAnyGap || 0} of ${resources.upcomingConfirmed || 0} upcoming confirmed jobs currently have a recorded allocation gap.`,
      evidenceIds: ["resources_client_concentration", "resources_upcoming_confirmed", "resources_allocation_gaps"],
      confidence: resources.upcomingConfirmed >= 5 ? "high" : "medium",
      caveat: "Allocation counts show recorded demand and gaps, not resource capacity or employee performance.",
      actionKey: "bookings",
    },
  };
  if (variant === "management" && finance) {
    result.financeQuality = {
      summary: `${finance.readyToInvoice || 0} jobs are ready to invoice and ${finance.completeNotPaid || 0} completed jobs are not recorded as paid. Known unpaid value and finance-stage timing are shown only where reliable values and lifecycle timestamps exist.`,
      evidenceIds: ["finance_ready_to_invoice", "finance_unpaid_value", "finance_data_quality"],
      confidence: snapshot.dataQuality?.rate >= 90 ? "high" : "medium",
      caveat: "Missing invoice values are excluded, never assumed to be zero.",
      actionKey: "finance_queue",
    };
  }
  return result;
}

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
  const qualityRows = rows.filter((row) => inRange(row.anchor, currentStart, addDays(now, 1)) || (!row.anchor && inRange(parseDate(row.raw.createdAt), currentStart, addDays(now, 1))));
  const currentAnalytics = buildBookingAnalytics(currentRows.map((row) => row.raw));
  const previousAnalytics = buildBookingAnalytics(previousRows.map((row) => row.raw));
  const trendAnalytics = buildBookingAnalytics(trendRows.map((row) => row.raw));
  const allAnalytics = buildBookingAnalytics(rows.map((row) => row.raw));
  const qualityAnalytics = buildBookingAnalytics(qualityRows.map((row) => row.raw));

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

  const completeCore = qualityRows.filter(({ raw, normalised }) => coreComplete(raw, normalised)).length;
  const dataQualityRate = qualityRows.length ? round1((completeCore / qualityRows.length) * 100) : 100;
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
    analysisConfig: {
      minimumComparisonJobs: Number(rules.thresholds.minimumComparisonJobs || 5),
      minimumLeadTimeSample: Number(rules.thresholds.minimumLeadTimeSample || 5),
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
      inScope: qualityRows.length,
      rate: dataQualityRate,
      missingDates: qualityAnalytics.dataQuality.missingDates,
      missingStatus: qualityAnalytics.dataQuality.missingStatus,
      missingJobNumber: qualityAnalytics.dataQuality.missingJobNumber,
      invalidJobNumber: qualityAnalytics.dataQuality.invalidJobNumber,
      missingQuote: qualityAnalytics.dataQuality.missingQuote,
      missingAttachments: qualityAnalytics.dataQuality.missingAttachments,
    },
  };

  snapshot.sections = buildSectionSnapshot(rows, now, rules, allAnalytics.financeReadiness, options.targetMonth);

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
  const sections = snapshot.sections || {};
  const overview = sections.overview || {};
  const trends = sections.trends || {};
  const resources = sections.resources || {};
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
    { id: "overview_month_bookings", section: "overview", label: `${overview.target?.label || "Completed month"} bookings`, value: overview.target?.bookings || 0, comparison: overview.changes?.bookingsVsPreviousPercent, comparisonLabel: overview.previous?.label || "previous month", benchmark: overview.sixMonthAverage?.bookings, benchmarkLabel: "preceding six-month average", unit: "jobs", period: overview.target?.label, confidence: overview.confidence },
    { id: "overview_booking_days", section: "overview", label: `${overview.target?.label || "Completed month"} booking days`, value: overview.target?.bookingDays || 0, comparison: overview.changes?.bookingDaysVsPreviousPercent, comparisonLabel: overview.previous?.label || "previous month", benchmark: overview.sixMonthAverage?.bookingDays, benchmarkLabel: "preceding six-month average", unit: "days", period: overview.target?.label, confidence: overview.confidence },
    { id: "overview_current_pipeline", section: "overview", label: `${overview.currentOpen?.label || "Current month"} scheduled pipeline (incomplete)`, value: overview.currentOpen?.bookings || 0, comparison: null, unit: "jobs", period: overview.currentOpen?.label, confidence: "high" },
    { id: "trends_created_to_confirmed", section: "trends", label: "Average created-to-confirmed time", value: trends.createdToConfirmed?.averageDays ?? "Insufficient data", unit: "days", period: trends.period, sampleSize: trends.createdToConfirmed?.sampleSize || 0, coveragePercent: trends.createdToConfirmed?.coveragePercent || 0, median: trends.createdToConfirmed?.medianDays, confidence: trends.createdToConfirmed?.confidence || "low" },
    { id: "trends_pencil_to_confirmed", section: "trends", label: "Average First-Pencil-to-confirmed time", value: trends.pencilToConfirmed?.averageDays ?? "Insufficient data", unit: "days", period: trends.period, sampleSize: trends.pencilToConfirmed?.sampleSize || 0, coveragePercent: trends.pencilToConfirmed?.coveragePercent || 0, median: trends.pencilToConfirmed?.medianDays, confidence: trends.pencilToConfirmed?.confidence || "low" },
    { id: "trends_conversion", section: "trends", label: `Decided-outcome conversion in ${trends.period || "the completed month"}`, value: trends.conversionRate || 0, unit: "%", period: trends.period, sampleSize: trends.decidedOutcomes || 0, confidence: trends.decidedOutcomes >= snapshot.analysisConfig.minimumComparisonJobs ? "high" : "low" },
    { id: "resources_client_concentration", section: "resources", label: `Largest client booking share${resources.topClient?.client ? ` (${resources.topClient.client})` : ""}`, value: resources.topClient?.percent || 0, unit: "%", period: resources.period, confidence: resources.topClient?.bookings >= snapshot.analysisConfig.minimumComparisonJobs ? "high" : "medium" },
    { id: "resources_upcoming_confirmed", section: "resources", label: "Confirmed jobs in the next 30 days", value: resources.upcomingConfirmed || 0, unit: "jobs", period: "Next 30 days", confidence: "high" },
    { id: "resources_allocation_gaps", section: "resources", label: "Upcoming confirmed jobs with a recorded allocation gap", value: resources.jobsWithAnyGap || 0, unit: "jobs", period: "Next 30 days", confidence: "high", details: { missingCrew: resources.missingCrew || 0, missingVehicles: resources.missingVehicles || 0, missingEquipment: resources.missingEquipment || 0 } },
    { id: "finance_ready_to_invoice", section: "financeQuality", label: "Jobs ready to invoice", value: sections.financeQuality?.readyToInvoice || 0, unit: "jobs", period: "Current queue", confidence: "high", financeOnly: true },
    { id: "finance_unpaid_value", section: "financeQuality", label: "Known unpaid invoice value", value: snapshot.finance.unpaidValue, unit: "GBP", period: "Current invoiced jobs", confidence: snapshot.finance.invoiceCoveragePercent >= 80 ? "high" : "medium", financeOnly: true },
    { id: "finance_data_quality", section: "financeQuality", label: "Core booking data completeness", value: snapshot.dataQuality.rate, unit: "%", period: "Last 30 days", confidence: "high", financeOnly: true },
  ];
}

export function redactSnapshotForVariant(snapshot, variant = "booking") {
  if (variant === "management") return snapshot;
  const { finance, ...rest } = snapshot;
  return {
    ...rest,
    sections: snapshot.sections ? Object.fromEntries(Object.entries(snapshot.sections).filter(([key]) => key !== "financeQuality")) : {},
    evidenceCatalog: (snapshot.evidenceCatalog || []).filter((item) => !item.financeOnly),
    signals: (snapshot.signals || []).filter((item) => item.id !== "stale_invoices"),
  };
}

export function buildFilteredStatisticsSectionAnalysis(bookings = [], options = {}) {
  const now = startOfUtcDay(options.now || new Date());
  const rules = mergeBickersBusinessRules(options.rules);
  const variant = options.variant === "management" ? "management" : "booking";
  const rangeLabel = String(options.rangeLabel || "the filtered range");
  const minimumComparison = Number(rules.thresholds.minimumComparisonJobs || 5);
  if (/^\d{4}-\d{2}$/.test(String(options.targetMonth || "")) && String(options.targetMonth) < monthKey(now)) {
    const full = buildStatisticsInsightSnapshot(bookings, { now, rules, targetMonth: options.targetMonth });
    const snapshot = redactSnapshotForVariant(full, variant);
    const content = buildDeterministicSectionContent(snapshot, variant);
    const catalog = new Map(snapshot.evidenceCatalog.map((item) => [item.id, item]));
    return Object.fromEntries(Object.entries(content).map(([key, section]) => [key, {
      ...section,
      evidence: section.evidenceIds.map((id) => ({ ...catalog.get(id), text: formatStatisticsEvidence(catalog.get(id)) })),
      mode: "filtered",
    }]));
  }
  const rows = bookings.map((raw) => {
    const normalised = normaliseBookingForAnalytics(raw);
    return { raw, normalised, anchor: bookingAnchorDate(raw, normalised) };
  });
  const analytics = buildBookingAnalytics(bookings);
  const minimumSample = Number(rules.thresholds.minimumLeadTimeSample || 5);
  const confirmedRows = rows.filter(({ raw }) => lifecycleDate(raw, "confirmedAt", "Confirmed"));
  const createdToConfirmed = durationSummary(confirmedRows, (booking) => parseDate(booking.createdAt || booking.lifecycle?.openedAt), (booking) => lifecycleDate(booking, "confirmedAt", "Confirmed"), minimumSample);
  const pencilToConfirmed = durationSummary(confirmedRows, (booking) => lifecycleDate(booking, "firstPencilAt", "First Pencil"), (booking) => lifecycleDate(booking, "confirmedAt", "Confirmed"), minimumSample);
  const concentration = clientConcentration(analytics);
  const gaps = allocationGaps(rows, now);
  const invoiceRows = rows.filter(({ raw }) => isInvoiced(raw));
  const unpaidRows = invoiceRows.filter(({ raw }) => !isPaid(raw));
  const valuedUnpaidRows = unpaidRows.filter(({ raw }) => reliableInvoiceValue(raw) !== null);
  const invoiceCoveragePercent = invoiceRows.length ? round1((invoiceRows.filter(({ raw }) => reliableInvoiceValue(raw) !== null).length / invoiceRows.length) * 100) : 100;
  const evidence = [
    { id: "filtered_jobs", section: "overview", label: `Bookings in ${rangeLabel}`, value: analytics.totals.bookingCount, unit: "jobs", period: rangeLabel, confidence: "high" },
    { id: "filtered_booking_days", section: "overview", label: `Booking days in ${rangeLabel}`, value: analytics.totals.bookingDays, unit: "days", period: rangeLabel, confidence: "high" },
    { id: "filtered_shoot_days", section: "overview", label: `Shoot days in ${rangeLabel}`, value: analytics.totals.shootDays, unit: "days", period: rangeLabel, confidence: "high" },
    { id: "filtered_created_to_confirmed", section: "trends", label: "Average created-to-confirmed time", value: createdToConfirmed.averageDays ?? "Insufficient data", unit: "days", period: rangeLabel, sampleSize: createdToConfirmed.sampleSize, coveragePercent: createdToConfirmed.coveragePercent, median: createdToConfirmed.medianDays, confidence: createdToConfirmed.confidence },
    { id: "filtered_pencil_to_confirmed", section: "trends", label: "Average First-Pencil-to-confirmed time", value: pencilToConfirmed.averageDays ?? "Insufficient data", unit: "days", period: rangeLabel, sampleSize: pencilToConfirmed.sampleSize, coveragePercent: pencilToConfirmed.coveragePercent, median: pencilToConfirmed.medianDays, confidence: pencilToConfirmed.confidence },
    { id: "filtered_conversion", section: "trends", label: "Decided-outcome conversion", value: analytics.totals.conversionRate, unit: "%", period: rangeLabel, sampleSize: analytics.totals.decidedOutcomes, confidence: analytics.totals.decidedOutcomes >= Number(rules.thresholds.minimumComparisonJobs) ? "high" : "low" },
    { id: "filtered_client_concentration", section: "resources", label: `Largest client booking share${concentration.client ? ` (${concentration.client})` : ""}`, value: concentration.percent, unit: "%", period: rangeLabel, confidence: analytics.totals.bookingCount >= Number(rules.thresholds.minimumComparisonJobs) ? "high" : "low" },
    { id: "filtered_upcoming_confirmed", section: "resources", label: "Confirmed jobs in the next 30 days", value: gaps.upcomingConfirmed, unit: "jobs", period: "Next 30 days", confidence: "high" },
    { id: "filtered_allocation_gaps", section: "resources", label: "Upcoming confirmed jobs with a recorded allocation gap", value: gaps.jobsWithAnyGap, unit: "jobs", period: "Next 30 days", confidence: "high", details: { missingCrew: gaps.missingCrew, missingVehicles: gaps.missingVehicles, missingEquipment: gaps.missingEquipment } },
  ];
  if (variant === "management") {
    evidence.push(
      { id: "filtered_ready_invoice", section: "financeQuality", label: "Jobs ready to invoice", value: analytics.financeReadiness.readyToInvoice, unit: "jobs", period: rangeLabel, confidence: "high", financeOnly: true },
      { id: "filtered_unpaid_value", section: "financeQuality", label: "Known unpaid invoice value", value: round1(valuedUnpaidRows.reduce((sum, row) => sum + reliableInvoiceValue(row.raw), 0)), unit: "GBP", period: rangeLabel, confidence: invoiceCoveragePercent >= 80 ? "high" : "medium", financeOnly: true },
      { id: "filtered_data_quality", section: "financeQuality", label: "Bookings missing a scheduled date", value: analytics.dataQuality.missingDates, unit: "jobs", period: rangeLabel, confidence: "high", financeOnly: true }
    );
  }
  const leadSummary = (metric, label) => metric.sampleSize >= minimumSample
    ? `${label} averaged ${metric.averageDays} days (median ${metric.medianDays}) across ${metric.sampleSize} bookings with ${metric.coveragePercent}% timestamp coverage.`
    : `${label} has only ${metric.sampleSize} reliable records in this selection, so no firm comparison is shown.`;
  const sections = {
    overview: {
      summary: `${analytics.totals.bookingCount} bookings match ${rangeLabel}, covering ${analytics.totals.bookingDays} booking days and ${analytics.totals.shootDays} shoot days. This is a filtered total, so no unrelated calendar-period comparison has been added.`,
      evidenceIds: ["filtered_jobs", "filtered_booking_days", "filtered_shoot_days"],
      confidence: "high",
      caveat: "Changing filters changes both the numerator and the population in scope.",
      actionKey: "statistics",
    },
    trends: {
      summary: `${leadSummary(createdToConfirmed, "Created-to-confirmed time")} ${leadSummary(pencilToConfirmed, "First-Pencil-to-confirmed time")} ${analytics.totals.decidedOutcomes >= minimumComparison ? `Decided-outcome conversion is ${analytics.totals.conversionRate}% for this selection.` : `Only ${analytics.totals.decidedOutcomes} decided outcomes are in this selection, so no conversion conclusion is shown.`}`,
      evidenceIds: ["filtered_created_to_confirmed", "filtered_pencil_to_confirmed", "filtered_conversion"],
      confidence: createdToConfirmed.confidence === "high" && pencilToConfirmed.confidence === "high" ? "high" : "medium",
      caveat: "Missing or conflicting lifecycle timestamps are excluded rather than treated as zero.",
      actionKey: "statistics",
    },
    resources: {
      summary: concentration.client && analytics.totals.bookingCount >= minimumComparison ? `${concentration.client} represents ${concentration.percent}% of bookings in this selection. ${gaps.jobsWithAnyGap} of ${gaps.upcomingConfirmed} confirmed jobs in the next 30 days have no recorded crew, vehicle or equipment allocation.` : `The filtered client sample is below the approved minimum, so no concentration conclusion is shown. ${gaps.jobsWithAnyGap} of ${gaps.upcomingConfirmed} upcoming confirmed jobs have a recorded allocation gap.`,
      evidenceIds: ["filtered_client_concentration", "filtered_upcoming_confirmed", "filtered_allocation_gaps"],
      confidence: analytics.totals.bookingCount >= Number(rules.thresholds.minimumComparisonJobs) ? "high" : "low",
      caveat: "Allocation counts do not measure capacity or individual performance.",
      actionKey: "bookings",
    },
  };
  if (variant === "management") {
    sections.financeQuality = {
      summary: `${analytics.financeReadiness.readyToInvoice} jobs in this selection are ready to invoice. Known unpaid value is £${round1(valuedUnpaidRows.reduce((sum, row) => sum + reliableInvoiceValue(row.raw), 0)).toLocaleString("en-GB")}, based on ${invoiceCoveragePercent}% invoice-value coverage.`,
      evidenceIds: ["filtered_ready_invoice", "filtered_unpaid_value", "filtered_data_quality"],
      confidence: invoiceCoveragePercent >= 80 ? "high" : "medium",
      caveat: "Missing invoice values are excluded and are not assumed to be zero.",
      actionKey: "finance_queue",
    };
  }
  const catalog = new Map(evidence.map((item) => [item.id, item]));
  return Object.fromEntries(Object.entries(sections).map(([key, section]) => [key, {
    ...section,
    evidence: section.evidenceIds.map((id) => ({ ...catalog.get(id), text: formatStatisticsEvidence(catalog.get(id)) })),
    mode: "filtered",
  }]));
}
