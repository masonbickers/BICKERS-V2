import { normaliseBookingForAnalytics } from "./bookingAnalytics.js";
import { canonicalBookingStatus } from "./bookingLifecycle.js";

const CLOSED_OR_INACTIVE_STATUSES = new Set([
  "Cancelled",
  "Complete",
  "Ready to Invoice",
  "Invoiced",
  "Paid",
  "DNH",
  "Deleted",
  "Lost",
  "Postponed",
]);

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const shiftMonth = (key, amount) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + amount, 1);
  return monthKey(date);
};

const monthLabel = (key) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!match) return key;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
};

const summariseMonth = (normalised, key) => {
  const rows = normalised.filter((booking) => booking.bookingMonth === key);
  return {
    key,
    label: monthLabel(key),
    jobs: rows.length,
    bookingDays: rows.reduce((sum, booking) => sum + booking.bookingDayCount, 0),
    shootDays: rows.reduce((sum, booking) => sum + booking.shootDayCount, 0),
  };
};

export function selectActiveUpcomingBookings(bookings = [], { now = new Date(), limit = 6 } = {}) {
  const start = dayKey(now);
  return bookings
    .map((booking) => {
      const normalised = normaliseBookingForAnalytics(booking);
      const status = canonicalBookingStatus(normalised.status);
      const nextDate = normalised.dates.find((date) => date >= start) || "";
      return { booking, status, nextDate };
    })
    .filter(({ status, nextDate }) => nextDate && !CLOSED_OR_INACTIVE_STATUSES.has(status))
    .sort((left, right) => left.nextDate.localeCompare(right.nextDate) || String(left.booking.jobNumber || left.booking.id).localeCompare(String(right.booking.jobNumber || right.booking.id)))
    .slice(0, limit)
    .map(({ booking }) => booking);
}

export function buildStatisticsCurrentActions(bookings = [], { now = new Date() } = {}) {
  const start = dayKey(now);
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 30);
  const end = dayKey(endDate);
  const normalised = bookings.map((booking) => ({ raw: booking, normalised: normaliseBookingForAnalytics(booking) }));
  const confirmedUpcoming = normalised.filter(({ normalised: booking }) =>
    canonicalBookingStatus(booking.status) === "Confirmed" && booking.dates.some((date) => date >= start && date <= end)
  );
  const allocationGaps = confirmedUpcoming.filter(({ normalised: booking }) =>
    !booking.employees.length || !booking.vehicles.length || !booking.equipment.length
  );
  const missingCrew = confirmedUpcoming.filter(({ normalised: booking }) => !booking.employees.length);
  const missingVehicles = confirmedUpcoming.filter(({ normalised: booking }) => !booking.vehicles.length);
  const missingEquipment = confirmedUpcoming.filter(({ normalised: booking }) => !booking.equipment.length);
  const actionRequired = normalised.filter(({ normalised: booking }) => canonicalBookingStatus(booking.status) === "Action Required");
  const readyToInvoice = normalised.filter(({ normalised: booking }) => canonicalBookingStatus(booking.status) === "Ready to Invoice");
  const coreDataGaps = normalised.filter(({ raw, normalised: booking }) =>
    !booking.dates.length || !String(raw.status || "").trim() || !/^\d{4}$/.test(String(raw.jobNumber || "").trim())
  );

  const ids = (rows) => rows.map(({ raw }) => raw.id).filter(Boolean);
  return {
    confirmedUpcoming: confirmedUpcoming.length,
    confirmedUpcomingIds: ids(confirmedUpcoming),
    allocationGaps: allocationGaps.length,
    allocationGapIds: ids(allocationGaps),
    missingCrew: missingCrew.length,
    missingCrewIds: ids(missingCrew),
    missingVehicles: missingVehicles.length,
    missingVehicleIds: ids(missingVehicles),
    missingEquipment: missingEquipment.length,
    missingEquipmentIds: ids(missingEquipment),
    actionRequired: actionRequired.length,
    actionRequiredIds: ids(actionRequired),
    readyToInvoice: readyToInvoice.length,
    readyToInvoiceIds: ids(readyToInvoice),
    coreDataGaps: coreDataGaps.length,
    coreDataGapIds: ids(coreDataGaps),
  };
}

export function selectStatisticsAudienceAction(actions = {}, variant = "booking") {
  if (variant === "management") {
    return {
      id: "ready-to-invoice",
      label: "Ready to invoice",
      value: Number(actions.readyToInvoice || 0),
      hint: "Open the finance queue",
      href: "/finance-queue",
    };
  }

  return {
    id: "core-data-gaps",
    label: "Core data gaps",
    value: Number(actions.coreDataGaps || 0),
    hint: "Missing dates, status or valid job number",
  };
}

export function buildStatisticsMonthComparison(bookings = [], { now = new Date(), targetMonth = "" } = {}) {
  const currentMonth = monthKey(now);
  const target = /^\d{4}-\d{2}$/.test(targetMonth) && targetMonth < currentMonth
    ? targetMonth
    : shiftMonth(currentMonth, -1);
  const previous = shiftMonth(target, -1);
  const normalised = bookings.map(normaliseBookingForAnalytics);
  const current = summariseMonth(normalised, target);
  const prior = summariseMonth(normalised, previous);
  return {
    current,
    previous: prior,
    deltaJobs: current.jobs - prior.jobs,
    deltaBookingDays: current.bookingDays - prior.bookingDays,
    deltaShootDays: current.shootDays - prior.shootDays,
  };
}

export function shouldShowStatisticsAnalysis({ analysis, stale = false, filtered = false } = {}) {
  return Boolean(analysis && (filtered || !stale));
}
