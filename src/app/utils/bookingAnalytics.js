import { bookingStatusCategory, canonicalBookingStatus } from "./bookingLifecycle.js";

const CREDIT_TYPES = [
  { dayType: "half_travel_day", value: 0.5, matches: ["1/2 travel day", "1/2 day travel", "half travel day", "half day travel"] },
  { dayType: "travel_time", value: 0.25, matches: ["travel time"] },
  { dayType: "night_shoot", value: 1, matches: ["nightshoot", "night shoot"] },
  { dayType: "travel_day", value: 1, matches: ["travel day"] },
  { dayType: "on_set", value: 1, matches: ["on set", "onset"] },
  { dayType: "rehearsal_day", value: 1, matches: ["rehearsal day", "rehearsal"] },
  { dayType: "standby_day", value: 1, matches: ["standby day", "stand by day", "standby"] },
  { dayType: "split_day", value: 1, matches: ["split day", "spilt day"] },
];

const cleanText = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");

const displayName = (value, fallback = "Unknown") => {
  if (typeof value === "string") return value.trim() || fallback;
  if (!value || typeof value !== "object") return fallback;
  return (
    value.name ||
    value.label ||
    value.fullName ||
    [value.firstName, value.lastName].filter(Boolean).join(" ").trim() ||
    value.registration ||
    value.id ||
    fallback
  );
};

const isFourDigitJobNumber = (value) => /^\d{4}$/.test(String(value || "").trim());

export function normaliseDate(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const sliced = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(sliced) ? sliced : null;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}

export function getBookingDates(booking = {}) {
  if (Array.isArray(booking.bookingDates) && booking.bookingDates.length) {
    return Array.from(new Set(booking.bookingDates.map(normaliseDate).filter(Boolean))).sort();
  }

  const start = normaliseDate(booking.startDate || booking.date);
  const end = normaliseDate(booking.endDate || booking.date);

  if (!start) return [];
  if (!end || start === end) return [start];

  const dates = [];
  const current = new Date(`${start}T00:00:00.000Z`);
  const final = new Date(`${end}T00:00:00.000Z`);

  while (current <= final) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export function getDayNote(booking = {}, date) {
  const existingDay = Array.isArray(booking.bookingDays)
    ? booking.bookingDays.find((day) => day?.date === date)
    : null;

  const raw =
    existingDay?.note ||
    booking.notesByDate?.[date] ||
    booking.dayNotes?.[date] ||
    booking.noteByDate?.[date] ||
    "";

  if (cleanText(raw) === "other") {
    return (
      existingDay?.otherNote ||
      booking.notesByDate?.[`${date}-other`] ||
      booking.dayNotes?.[`${date}-other`] ||
      booking.noteByDate?.[`${date}-other`] ||
      "Other"
    );
  }

  return raw;
}

export function classifyDay(note = "") {
  const clean = cleanText(note);

  for (const type of CREDIT_TYPES) {
    if (type.matches.some((pattern) => clean.includes(pattern))) return type.dayType;
  }

  return "other";
}

export function getCreditValue(note = "") {
  const clean = cleanText(note);

  for (const type of CREDIT_TYPES) {
    if (type.matches.some((pattern) => clean.includes(pattern))) return type.value;
  }

  return 0;
}

export function getStatusCategory(status = "") {
  const category = bookingStatusCategory(canonicalBookingStatus(status));
  return category === "active" ? "open" : category;
}

const isReadyToInvoice = (status = "") => cleanText(status).includes("ready to invoice");
const isPaid = (booking = {}) => {
  const status = cleanText(booking.status);
  const invoiceStatus = cleanText(booking.invoiceStatus);
  return status === "paid" || status === "settled" || invoiceStatus.includes("paid");
};
const isComplete = (status = "") => {
  const clean = cleanText(status);
  return clean === "complete" || clean === "completed";
};

const numberFrom = (...values) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const isBickersPayableHotel = (booking = {}) => {
  const paidBy = cleanText(booking.hotel?.paidBy || booking.hotelPaidBy || "");
  return paidBy === "bickers" || paidBy === "unknown" || paidBy === "";
};

export function normaliseBookingForAnalytics(booking = {}) {
  const dates = getBookingDates(booking);
  const firstDate = dates[0] || null;
  const lastDate = dates[dates.length - 1] || null;

  const days = dates.map((date) => {
    const existingDay = Array.isArray(booking.bookingDays)
      ? booking.bookingDays.find((day) => day?.date === date)
      : null;
    const note = existingDay?.note || getDayNote(booking, date);
    const dayType = existingDay?.dayType || classifyDay(note);
    const creditValue =
      typeof existingDay?.creditValue === "number" ? existingDay.creditValue : getCreditValue(note);

    return {
      date,
      note,
      dayType,
      creditValue,
      shootType: existingDay?.shootType || booking.shootType || null,
      callTime: existingDay?.callTime || booking.callTimesByDate?.[date] || booking.callTime || null,
    };
  });

  const creditTotal = days.reduce((sum, day) => sum + Number(day.creditValue || 0), 0);
  const status = booking.status || booking.statusCanonical || "Unknown";
  const statusCategory = getStatusCategory(status);

  const hotelNights = numberFrom(booking.hotel?.nights, booking.hotelNights, booking.hotelNumberOfNights);
  const hotelPricePerNight = numberFrom(
    booking.hotel?.pricePerNight,
    booking.hotelPricePerNight,
    booking.hotelCostPerNight,
    booking.costPerNight
  );
  const hotelTotal = numberFrom(
    booking.hotel?.total,
    booking.hotelTotal,
    booking.hotelTotalCost,
    hotelNights * hotelPricePerNight
  );
  const hotelPaidBy = booking.hotel?.paidBy || booking.hotelPaidBy || "Unknown";
  const hasHotel = Boolean(booking.hotel?.hasHotel ?? booking.hasHotel ?? (hotelNights || hotelTotal));
  const payableTotal = hasHotel && isBickersPayableHotel(booking) ? hotelTotal : 0;

  return {
    id: booking.id,
    jobNumber: booking.jobNumber || "",
    client: booking.client || "Unknown client",
    location: booking.location || "",
    status,
    statusCategory,

    dates,
    days,
    firstDate,
    lastDate,
    bookingMonth: firstDate ? firstDate.slice(0, 7) : "Unknown",
    bookingDayCount: dates.length,
    isMultiDayBooking: dates.length > 1,

    creditTotal,
    shootDayCount: days.filter((day) => ["on_set", "night_shoot", "rehearsal_day"].includes(day.dayType)).length,
    travelDayCount: days.filter((day) => ["travel_day", "half_travel_day", "travel_time"].includes(day.dayType)).length,
    nightShootCount: days.filter((day) => day.dayType === "night_shoot").length,

    employees: booking.employees || booking.employeeNames || [],
    vehicles: booking.vehicles || [],
    equipment: booking.equipment || [],
    employeeCount: numberFrom(booking.employeeCount, booking.allocatedCrewCount, booking.employees?.length),
    vehicleCount: numberFrom(booking.vehicleCount, booking.vehicles?.length),
    equipmentCount: numberFrom(booking.equipmentCount, booking.equipment?.length),

    hasHS: Boolean(booking.hasHS),
    hasRiskAssessment: Boolean(booking.hasRiskAssessment),
    hasAttachments: Boolean(
      booking.hasAttachments || booking.quoteUrl || booking.pdfURL || booking.pdfUrl || booking.attachments?.length
    ),
    hasQuote: Boolean(booking.quoteUrl || booking.pdfURL || booking.pdfUrl),
    hasGeneralNotes: Boolean(String(booking.generalNotes || booking.notes || "").trim()),
    hasJobNumber: Boolean(String(booking.jobNumber || "").trim()),
    hasOldSchemaOnly: !Array.isArray(booking.bookingDays) || booking.bookingDays.length === 0,

    hotel: {
      hasHotel,
      paidBy: hotelPaidBy,
      nights: hotelNights,
      pricePerNight: hotelPricePerNight,
      total: hotelTotal,
      payableTotal,
    },

    createdAt: normaliseDate(booking.createdAt),
    updatedAt: normaliseDate(booking.updatedAt),
  };
}

export function buildBookingAnalytics(bookings = []) {
  const normalised = bookings.map(normaliseBookingForAnalytics);

  const totals = {
    bookingCount: normalised.length,
    bookingDays: normalised.reduce((sum, b) => sum + b.bookingDayCount, 0),
    credits: normalised.reduce((sum, b) => sum + b.creditTotal, 0),
    shootDays: normalised.reduce((sum, b) => sum + b.shootDayCount, 0),
    travelDays: normalised.reduce((sum, b) => sum + b.travelDayCount, 0),
    nightShoots: normalised.reduce((sum, b) => sum + b.nightShootCount, 0),
    confirmed: normalised.filter((b) => b.statusCategory === "confirmed").length,
    tentative: normalised.filter((b) => b.statusCategory === "tentative").length,
    won: normalised.filter((b) => b.statusCategory === "won").length,
    lost: normalised.filter((b) => b.statusCategory === "lost").length,
    open: normalised.filter((b) => b.statusCategory === "open").length,
    hotelCost: normalised.reduce((sum, b) => sum + b.hotel.payableTotal, 0),
  };
  const decidedOutcomes = totals.won + totals.lost;
  totals.decidedOutcomes = decidedOutcomes;
  totals.conversionRate = decidedOutcomes ? Math.round((totals.won / decidedOutcomes) * 1000) / 10 : 0;
  totals.lostRate = totals.bookingCount ? Math.round((totals.lost / totals.bookingCount) * 1000) / 10 : 0;

  const dataQuality = {
    missingDates: 0,
    missingDayNotes: 0,
    missingStatus: 0,
    missingJobNumber: 0,
    invalidJobNumber: 0,
    missingAttachments: 0,
    missingQuote: 0,
    missingNotes: 0,
    oldSchemaBookings: 0,
  };

  const financeReadiness = {
    readyToInvoice: 0,
    completeNotPaid: 0,
    paid: 0,
    missingQuote: 0,
    missingAttachments: 0,
    missingNotes: 0,
  };

  const hotelStats = {
    hotelJobs: 0,
    totalHotelNights: 0,
    totalHotelCost: 0,
    bickersPayableHotelCost: 0,
    averageCostPerNight: 0,
    productionPaidHotelJobs: 0,
  };

  const statusCounts = new Map();
  const clientMap = new Map();
  const vehicleMap = new Map();
  const employeeMap = new Map();
  const equipmentMap = new Map();

  const addUsage = (map, name, booking) => {
    const cleanName = String(name || "").trim();
    if (!cleanName) return;
    const current = map.get(cleanName) || { name: cleanName, count: 0, bookingDays: 0, credits: 0, bookingIds: [] };
    current.count += 1;
    current.bookingDays += booking.bookingDayCount;
    current.credits += booking.creditTotal;
    if (booking.id) current.bookingIds.push(booking.id);
    map.set(cleanName, current);
  };

  const byMonth = {};

  normalised.forEach((booking, index) => {
    const raw = bookings[index] || {};
    const status = String(booking.status || "").trim();
    const rawStatus = String(raw.status || "").trim();

    if (!booking.dates.length) dataQuality.missingDates += 1;
    if (booking.dates.length && booking.days.some((day) => !String(day.note || "").trim())) dataQuality.missingDayNotes += 1;
    if (!rawStatus) dataQuality.missingStatus += 1;
    if (!booking.hasJobNumber) dataQuality.missingJobNumber += 1;
    if (booking.hasJobNumber && !isFourDigitJobNumber(booking.jobNumber)) dataQuality.invalidJobNumber += 1;
    if (!booking.hasAttachments) dataQuality.missingAttachments += 1;
    if (!booking.hasQuote) dataQuality.missingQuote += 1;
    if (!booking.hasGeneralNotes) dataQuality.missingNotes += 1;
    if (booking.hasOldSchemaOnly) dataQuality.oldSchemaBookings += 1;

    if (isReadyToInvoice(status)) financeReadiness.readyToInvoice += 1;
    if (isComplete(status) && !isPaid(raw)) financeReadiness.completeNotPaid += 1;
    if (isPaid(raw)) financeReadiness.paid += 1;
    if (!booking.hasQuote) financeReadiness.missingQuote += 1;
    if (!booking.hasAttachments) financeReadiness.missingAttachments += 1;
    if (!booking.hasGeneralNotes) financeReadiness.missingNotes += 1;

    if (booking.hotel.hasHotel) {
      hotelStats.hotelJobs += 1;
      hotelStats.totalHotelNights += booking.hotel.nights;
      hotelStats.totalHotelCost += booking.hotel.total;
      hotelStats.bickersPayableHotelCost += booking.hotel.payableTotal;
      if (cleanText(booking.hotel.paidBy) === "production") hotelStats.productionPaidHotelJobs += 1;
    }

    statusCounts.set(status || "Unknown", (statusCounts.get(status || "Unknown") || 0) + 1);
    addUsage(clientMap, booking.client, booking);
    booking.vehicles.forEach((vehicle) => addUsage(vehicleMap, displayName(vehicle, ""), booking));
    booking.employees.forEach((employee) => addUsage(employeeMap, displayName(employee, ""), booking));
    booking.equipment.forEach((equipment) => addUsage(equipmentMap, displayName(equipment, ""), booking));

    if (!byMonth[booking.bookingMonth]) {
      byMonth[booking.bookingMonth] = {
        month: booking.bookingMonth,
        bookings: 0,
        bookingDays: 0,
        credits: 0,
        shootDays: 0,
        travelDays: 0,
        nightShoots: 0,
      };
    }

    byMonth[booking.bookingMonth].bookings += 1;
    byMonth[booking.bookingMonth].bookingDays += booking.bookingDayCount;
    byMonth[booking.bookingMonth].credits += booking.creditTotal;
    byMonth[booking.bookingMonth].shootDays += booking.shootDayCount;
    byMonth[booking.bookingMonth].travelDays += booking.travelDayCount;
    byMonth[booking.bookingMonth].nightShoots += booking.nightShootCount;
  });

  hotelStats.averageCostPerNight = hotelStats.totalHotelNights
    ? Math.round((hotelStats.bickersPayableHotelCost / hotelStats.totalHotelNights) * 100) / 100
    : 0;

  const usageSort = (items) =>
    [...items].sort((a, b) => b.count - a.count || b.bookingDays - a.bookingDays || a.name.localeCompare(b.name));

  const statusBreakdown = [...statusCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    bookings: normalised,
    totals,
    byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    dataQuality,
    topClients: usageSort(clientMap.values()),
    topVehicles: usageSort(vehicleMap.values()),
    topEmployees: usageSort(employeeMap.values()),
    topEquipment: usageSort(equipmentMap.values()),
    statusBreakdown,
    financeReadiness,
    hotelStats,
  };
}
