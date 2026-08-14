import { adminListDocuments } from "@/app/api/_firebaseAdminRest";
import { requireStatisticsUser } from "@/app/api/statistics/_auth";
import { buildQuoteRevenueInsights } from "@/app/utils/quoteExtraction";

export const dynamic = "force-dynamic";

const dateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "object" && Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const bookingDates = (booking = {}) => {
  const values = [
    ...(Array.isArray(booking.bookingDates) ? booking.bookingDates : []),
    ...(Array.isArray(booking.dates) ? booking.dates : []),
    booking.date,
    booking.bookingDate,
    booking.firstBookingDate,
    booking.startDate,
  ];
  return [...new Map(values.map(dateValue).filter(Boolean).map((date) => [date.getTime(), date])).values()]
    .sort((a, b) => a.getTime() - b.getTime());
};

const extractionDate = (extraction = {}) => {
  const candidates = [
    extraction.bookingDate,
    extraction.firstBookingDate,
    extraction.startDate,
    extraction.shootDate,
    /^\d{4}-\d{2}$/.test(String(extraction.bookingMonth || "")) ? `${extraction.bookingMonth}-01` : null,
  ];
  for (const candidate of candidates) {
    const date = dateValue(candidate);
    if (date) return date;
  }
  return null;
};

const timelineDates = (booking = {}, extractionDatesByBooking = new Map()) => {
  const dates = bookingDates(booking);
  if (dates.length) return dates;
  const keys = [booking.id, booking.jobNumber].map((value) => String(value || "")).filter(Boolean);
  return keys.flatMap((key) => extractionDatesByBooking.get(key) || []);
};

const isPastBooking = (booking, today = new Date()) => {
  const status = String(booking.status || "").toLowerCase();
  if (/completed|invoiced|paid|cancelled|declined/.test(status)) return true;
  const dates = bookingDates(booking);
  return dates.length ? Math.max(...dates.map((date) => date.getTime())) < today.getTime() : false;
};

export async function GET(req) {
  const access = await requireStatisticsUser(req);
  if (access.error) return access.error;
  if (access.variant !== "management") {
    return Response.json({ error: "Finance management access is required." }, { status: 403 });
  }

  const [bookingDocs, extractionDocs] = await Promise.all([
    adminListDocuments("bookings"),
    adminListDocuments("quoteExtractions"),
  ]);
  const companyId = access.companyId;
  const allBookings = bookingDocs
    .filter(({ data }) => !data.companyId || String(data.companyId) === companyId)
    .map(({ id, data }) => ({ id, ...data }));
  const allIds = new Set(allBookings.flatMap((booking) => [String(booking.id), String(booking.jobNumber || "")]).filter(Boolean));
  const extractions = extractionDocs
    .filter(({ data }) => (!data.companyId || String(data.companyId) === companyId) && allIds.has(String(data.bookingId || data.jobNumber || "")))
    .map(({ id, data }) => ({ id, ...data }));
  const exactExtractions = extractions.filter((row) => row.includedInInsights === true && row.matchConfidence === "exact");
  const extractionDatesByBooking = new Map();
  exactExtractions.forEach((row) => {
    const date = extractionDate(row);
    if (!date) return;
    [row.bookingId, row.jobNumber].map((value) => String(value || "")).filter(Boolean).forEach((key) => {
      if (!extractionDatesByBooking.has(key)) extractionDatesByBooking.set(key, []);
      extractionDatesByBooking.get(key).push(date);
    });
  });

  const url = new URL(req.url);
  const period = url.searchParams.get("period") || "all";
  const status = url.searchParams.get("status") || "all";
  const includeFuture = url.searchParams.get("includeFuture") !== "false";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  const futureEnd = new Date(today);
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 30);
  else if (period === "90d") start.setUTCDate(start.getUTCDate() - 90);
  else if (period === "ytd") start.setUTCMonth(0, 1);
  else if (/^\d{4}$/.test(period)) start.setUTCFullYear(Number(period), 0, 1);
  if (period === "future30") futureEnd.setUTCDate(futureEnd.getUTCDate() + 30);
  else if (period === "future90") futureEnd.setUTCDate(futureEnd.getUTCDate() + 90);
  else if (period === "future365") futureEnd.setUTCFullYear(futureEnd.getUTCFullYear() + 1);
  const filteredBookings = allBookings.filter((booking) => {
    const dates = timelineDates(booking, extractionDatesByBooking);
    const date = dates[0] || null;
    const periodMatch = period === "all" ||
      (period === "future" && date && date > today) ||
      (["future30", "future90", "future365"].includes(period) && date && date > today && date <= futureEnd) ||
      (date && date >= start && (["30d", "90d", "ytd"].includes(period) ? date <= today : true) && (!/^\d{4}$/.test(period) || date.getUTCFullYear() === Number(period)));
    const normalizedStatus = /complete|invoiced|paid/i.test(booking.status || "") ? "complete" : /confirm/i.test(booking.status || "") ? "confirmed" : /pencil/i.test(booking.status || "") ? "pencil" : "other";
    const futureMatch = includeFuture || !date || date <= today;
    return periodMatch && futureMatch && (status === "all" || normalizedStatus === status);
  });
  const filteredIds = new Set(filteredBookings.flatMap((booking) => [String(booking.id), String(booking.jobNumber || "")]).filter(Boolean));
  const filteredExtractions = extractions.filter((row) => filteredIds.has(String(row.bookingId || row.jobNumber || "")));

  return Response.json({
    generatedAt: new Date().toISOString(),
    scope: "all-bookings",
    bookingCount: allBookings.length,
    quotedBookingCount: new Set(exactExtractions.map((row) => row.bookingId)).size,
    extractionCoverage: allBookings.length ? Math.round((new Set(exactExtractions.map((row) => row.bookingId)).size / allBookings.length) * 1000) / 10 : 0,
    filters: { period, status, includeFuture },
    availableYears: [...new Set(allBookings.flatMap((booking) => timelineDates(booking, extractionDatesByBooking).map((date) => date.getUTCFullYear())))].sort((a, b) => b - a),
    filteredBookingCount: filteredBookings.length,
    insights: buildQuoteRevenueInsights(filteredExtractions, filteredBookings),
  });
}
