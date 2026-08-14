import { hasImportedQuoteSelection, verifiedImportedQuoteNumber } from "./importedQuoteMatch.js";

const asText = (value) => String(value ?? "").trim();

export const toMoneyNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = asText(value);
  if (!text || /^(tbc|n\/a|f\.?o\.?c\.?|production)$/i.test(text)) return null;
  const negative = /^\s*-|^\s*\(/.test(text) || /\b(less|discount)\b/i.test(text);
  const parsed = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
};

const CATEGORY_RULES = [
  ["discount", /discount|\bless\b|credit/i],
  ["accommodation", /hotel|accommodation|overnight|lodging/i],
  ["travel", /travel|mileage|mile\b|fuel|ferry|toll|parking|train|flight/i],
  ["labour", /labour|labor|crew|operator|driver|technician|engineer|prep day|shoot day|overtime|hourly rate/i],
  ["vehicle", /vehicle|camera car|tracking car|tracking vehicle|truck|lorry|van\b|trailer|low loader|4x4|quad|atv|motorcycle|motorbike|\bbike\b|twizzy|crane/i],
  ["equipment", /equipment|camera|mount|rig\b|head\b|arm\b|lens|monitor|wireless|remote|battery|generator|lighting/i],
];

export const classifyQuoteLine = ({ description = "", section = "" } = {}) => {
  const haystack = `${section} ${description}`;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return category;
  }
  if (/equipment/i.test(section)) return "equipment";
  if (/labour|labor/i.test(section)) return "labour";
  if (/travel/i.test(section)) return "travel";
  return "other";
};

export const quoteIdentity = (value = "") => {
  const text = asText(value).toUpperCase().replace(/\.(XLSX?|PDF)$/i, "");
  const revisionMatch = text.match(/(?:\bREV(?:ISION)?[\s_-]*|[-_ ]R)(\d+)\b/i);
  const revision = revisionMatch ? Number(revisionMatch[1]) : 0;
  const quoteMatch = text.match(/\bQ?\d{3,6}[-_/]\d{1,4}[A-Z]?\b/i);
  const quoteNumber = quoteMatch ? quoteMatch[0].replace(/_/g, "-").toUpperCase() : text;
  const family = quoteNumber.replace(/(?:\bREV(?:ISION)?[\s_-]*|[-_ ]R)\d+\b/gi, "").trim();
  return { quoteNumber, family: family || quoteNumber, revision };
};

const numericTotal = (line) => {
  const amount = toMoneyNumber(line?.lineTotal ?? line?.total ?? line?.amount);
  if (amount === null) return null;
  return classifyQuoteLine(line) === "discount" ? -Math.abs(amount) : amount;
};

export const summariseExtractedLines = (lines = []) => {
  const categoryTotals = {};
  const activeLines = [];
  for (const raw of Array.isArray(lines) ? lines : []) {
    const amount = numericTotal(raw);
    if (amount === null || amount === 0) continue;
    const category = classifyQuoteLine(raw);
    const line = { ...raw, category, lineTotal: amount };
    activeLines.push(line);
    categoryTotals[category] = (categoryTotals[category] || 0) + amount;
  }
  const calculatedTotal = activeLines.reduce((sum, line) => sum + line.lineTotal, 0);
  return { activeLines, categoryTotals, calculatedTotal };
};

const dateValue = (value) => {
  const date = value?.toDate?.() || (value && typeof value === "object" && Number.isFinite(value.seconds)
    ? new Date(value.seconds * 1000)
    : new Date(value || ""));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const chooseLatestRevision = (rows) => [...rows].sort((a, b) => {
  const revisionDifference = Number(b.revision || 0) - Number(a.revision || 0);
  if (revisionDifference) return revisionDifference;
  return dateValue(b.extractedAt || b.updatedAt) - dateValue(a.extractedAt || a.updatedAt);
})[0];

const quoteSequence = (quote = {}) => {
  const identity = quoteIdentity(quote.quoteNumber || quote.source?.name || "");
  const match = identity.quoteNumber.match(/[-_/](\d{1,4})([A-Z]?)$/i);
  if (!match) return 0;
  const suffix = match[2] ? match[2].toUpperCase().charCodeAt(0) - 64 : 0;
  return Number(match[1]) * 100 + suffix;
};

const chooseRepresentativeQuote = (rows) => [...rows].sort((a, b) => {
  const sequenceDifference = quoteSequence(b) - quoteSequence(a);
  if (sequenceDifference) return sequenceDifference;
  const revisionDifference = Number(b.revision || 0) - Number(a.revision || 0);
  if (revisionDifference) return revisionDifference;
  return dateValue(b.extractedAt || b.updatedAt) - dateValue(a.extractedAt || a.updatedAt);
})[0];

export const selectQuoteEvidence = (extractions = []) => {
  const usable = (Array.isArray(extractions) ? extractions : []).filter((row) =>
    row && row.includedInInsights === true && row.matchConfidence === "exact" && row.reviewStatus !== "rejected"
  );
  const families = new Map();
  usable.forEach((row) => {
    const identity = quoteIdentity(row.quoteNumber || row.source?.name || "");
    const key = `${row.bookingId || row.jobNumber || "unknown"}::${row.quoteFamily || identity.family}`;
    if (!families.has(key)) families.set(key, []);
    families.get(key).push({ ...row, revision: Number(row.revision ?? identity.revision), quoteFamily: row.quoteFamily || identity.family });
  });

  const latestQuotes = [...families.values()].map(chooseLatestRevision);
  const byBooking = new Map();
  latestQuotes.forEach((row) => {
    const key = row.bookingId || row.jobNumber || "unknown";
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key).push(row);
  });

  const selectedBookings = [];
  const ambiguousBookings = [];
  for (const [bookingId, rows] of byBooking) {
    const explicitlySelected = rows.filter((row) => row.selectedForBooking === true || row.accepted === true);
    if (explicitlySelected.length === 1) selectedBookings.push({ bookingId, quote: explicitlySelected[0] });
    else if (!explicitlySelected.length && rows.length === 1) selectedBookings.push({ bookingId, quote: rows[0], selection: "only_quote" });
    else {
      const quote = chooseRepresentativeQuote(rows);
      selectedBookings.push({ bookingId, quote, selection: "latest_quote_number" });
      ambiguousBookings.push({ bookingId, selectedQuoteNumber: quote.quoteNumber, quotes: rows });
    }
  }
  return { latestQuotes, selectedBookings, ambiguousBookings };
};

export const quoteBookingStatus = (value) => {
  const status = asText(value).toLowerCase();
  if (/complete|invoiced|paid/.test(status)) return "Complete";
  if (/confirm/.test(status)) return "Confirmed";
  if (/pencil/.test(status)) return "Pencil";
  return "Other";
};

export const quoteBookingDate = (booking = {}) => {
  const workDateCandidates = [
    ...(Array.isArray(booking.bookingDates) ? booking.bookingDates : []),
    ...(Array.isArray(booking.dates) ? booking.dates : []),
    booking.date,
    booking.bookingDate,
    booking.firstBookingDate,
    booking.startDate,
  ];
  const workDateTimestamps = workDateCandidates.map(dateValue).filter(Boolean);
  if (workDateTimestamps.length) return new Date(Math.min(...workDateTimestamps));
  const createdTimestamp = dateValue(booking.createdAt);
  return createdTimestamp ? new Date(createdTimestamp) : null;
};

export const quoteTimelineDate = (booking = {}, quote = {}) => {
  const bookingDate = quoteBookingDate(booking);
  if (bookingDate) return bookingDate;
  const candidates = [
    quote.bookingDate,
    quote.firstBookingDate,
    quote.startDate,
    quote.shootDate,
    /^\d{4}-\d{2}$/.test(asText(quote.bookingMonth)) ? `${quote.bookingMonth}-01` : null,
  ];
  for (const value of candidates) {
    const timestamp = dateValue(value);
    if (timestamp) return new Date(timestamp);
  }
  return null;
};

const bookingMonth = (booking = {}, quote = {}) => {
  const date = quoteTimelineDate(booking, quote);
  return date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` : "Unknown";
};

const bookingClient = (booking = {}) => asText(booking.client || booking.productionCompany || booking.company || booking.customerName) || "Unknown client";

export const normaliseVehicleName = (value) => asText(value)
  .replace(/\s+/g, " ")
  .replace(/\bNo\.?\s*(\d+)\b/gi, "No.$1")
  .trim() || "Unclassified vehicle";

const ranked = (map, keyName) => [...map.entries()]
  .map(([name, value]) => ({ [keyName]: name, value }))
  .sort((a, b) => b.value - a.value || String(a[keyName]).localeCompare(String(b[keyName])));

export const buildQuoteRevenueInsights = (extractions = [], bookings = []) => {
  const bookingMap = new Map();
  (Array.isArray(bookings) ? bookings : []).forEach((booking) => {
    if (booking.id || booking.bookingId) bookingMap.set(String(booking.id || booking.bookingId), booking);
    if (booking.jobNumber) bookingMap.set(String(booking.jobNumber), booking);
  });
  const selectedExtractions = (Array.isArray(extractions) ? extractions : []).filter((row) => {
    const booking = bookingMap.get(String(row.bookingId || ""));
    if (!booking || !hasImportedQuoteSelection(booking)) return true;
    const selectedNumber = verifiedImportedQuoteNumber(booking);
    if (!selectedNumber) return false;
    const selectedFamily = quoteIdentity(selectedNumber).family;
    const rowFamily = asText(row.quoteFamily) || quoteIdentity(row.quoteNumber || row.source?.name || "").family;
    return rowFamily === selectedFamily;
  });
  const evidence = selectQuoteEvidence(selectedExtractions);
  const selectedValue = evidence.selectedBookings.reduce((sum, item) => sum + (toMoneyNumber(item.quote.documentTotal ?? item.quote.calculatedTotal) || 0), 0);
  const portfolioValue = evidence.latestQuotes.reduce((sum, quote) => sum + (toMoneyNumber(quote.documentTotal ?? quote.calculatedTotal) || 0), 0);
  let completedRevenue = 0;
  let confirmedValue = 0;
  let pencilValue = 0;
  const byClient = new Map();
  const byMonth = new Map();
  const timelineByMonth = new Map();
  const byCategory = new Map();
  const byVehicle = new Map();
  const quoteRows = [];

  evidence.selectedBookings.forEach(({ bookingId, quote }) => {
    const booking = bookingMap.get(String(bookingId)) || {};
    const amount = toMoneyNumber(quote.documentTotal ?? quote.calculatedTotal) || 0;
    const status = quoteBookingStatus(booking.status || quote.bookingStatus);
    if (status === "Complete") completedRevenue += amount;
    if (status === "Confirmed") confirmedValue += amount;
    if (status === "Pencil") pencilValue += amount;
    const client = quote.productionCompany || bookingClient(booking);
    const timelineDate = quoteTimelineDate(booking, quote);
    const month = bookingMonth(booking, quote);
    byClient.set(client, (byClient.get(client) || 0) + amount);
    byMonth.set(month, (byMonth.get(month) || 0) + amount);
    const timeline = timelineByMonth.get(month) || { month, value: 0, complete: 0, confirmed: 0, pencil: 0, other: 0, jobs: 0 };
    timeline.value += amount;
    timeline.jobs += 1;
    timeline[status.toLowerCase()] += amount;
    timelineByMonth.set(month, timeline);
    Object.entries(quote.categoryTotals || {}).forEach(([category, total]) => byCategory.set(category, (byCategory.get(category) || 0) + (toMoneyNumber(total) || 0)));
    const vehicleNames = [];
    (quote.lineItems || []).forEach((line) => {
      if ((line.category || classifyQuoteLine(line)) !== "vehicle") return;
      const name = normaliseVehicleName(line.assetName || line.description);
      const current = byVehicle.get(name) || { value: 0, lineCount: 0, bookings: new Set() };
      current.value += numericTotal(line) || 0;
      current.lineCount += 1;
      current.bookings.add(String(bookingId));
      byVehicle.set(name, current);
      vehicleNames.push(name);
    });
    quoteRows.push({
      id: quote.id || `${bookingId}-${quote.quoteNumber}`,
      bookingId,
      jobNumber: quote.jobNumber || booking.jobNumber || "",
      quoteNumber: quote.quoteNumber || "",
      revision: Number(quote.revision || 0),
      status,
      bookingDate: timelineDate?.toISOString().slice(0, 10) || "",
      dateSource: quoteBookingDate(booking) ? "booking" : timelineDate ? "quote timeline" : "unknown",
      client,
      production: quote.production || booking.production || "",
      location: quote.location || booking.location || "",
      shootDates: quote.shootDates || "",
      serviceDescription: quote.serviceDescription || "",
      total: amount,
      categoryTotals: quote.categoryTotals || {},
      vehicles: [...new Set(vehicleNames)],
      activeLineCount: (quote.lineItems || []).length,
      source: quote.source || {},
    });
  });

  const vehicleRanking = [...byVehicle.entries()].map(([vehicle, stats]) => ({
    vehicle,
    value: stats.value,
    bookings: stats.bookings.size,
    lineCount: stats.lineCount,
    average: stats.bookings.size ? stats.value / stats.bookings.size : 0,
  })).sort((a, b) => b.value - a.value || a.vehicle.localeCompare(b.vehicle));
  const completedCount = evidence.selectedBookings.filter(({ bookingId, quote }) => quoteBookingStatus(bookingMap.get(String(bookingId))?.status || quote.bookingStatus) === "Complete").length;

  return {
    totals: {
      extractedDocuments: extractions.length,
      exactMatchDocuments: extractions.filter((row) => row?.includedInInsights === true && row?.matchConfidence === "exact").length,
      reviewDocuments: extractions.filter((row) => row?.includedInInsights !== true || row?.matchConfidence !== "exact").length,
      latestQuoteDocuments: evidence.latestQuotes.length,
      selectedBookings: evidence.selectedBookings.length,
      ambiguousBookings: evidence.ambiguousBookings.length,
      quotedBookingValue: selectedValue,
      quotePortfolioValue: portfolioValue,
      completedRevenue,
      confirmedValue,
      pencilValue,
      averageBookingValue: evidence.selectedBookings.length ? selectedValue / evidence.selectedBookings.length : 0,
      averageCompletedValue: completedCount ? completedRevenue / completedCount : 0,
    },
    byClient: ranked(byClient, "client"),
    byMonth: ranked(byMonth, "month").sort((a, b) => String(a.month).localeCompare(String(b.month))),
    timeline: [...timelineByMonth.values()].sort((a, b) => String(a.month).localeCompare(String(b.month))),
    byCategory: ranked(byCategory, "category"),
    byVehicle: vehicleRanking,
    quoteRows: quoteRows.sort((a, b) => String(b.bookingDate).localeCompare(String(a.bookingDate)) || String(b.jobNumber).localeCompare(String(a.jobNumber), undefined, { numeric: true })),
    ambiguousBookings: evidence.ambiguousBookings,
  };
};
