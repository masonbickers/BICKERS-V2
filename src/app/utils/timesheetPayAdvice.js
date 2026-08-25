import { getCreditValue } from "./bookingAnalytics.js";
import { computeTimesheetDayBreakdown } from "./timesheetHours.js";

const LEGACY_ON_SET_BLOCK_HOURS = 10;
const MAX_REASONABLE_TRACKING_UNITS_PER_DAY = 2.5;
const TRAVEL_MEAL_RETURN_JOURNEY_MINUTES = 5 * 60;

function boolish(value) {
  if (value === true) return true;
  if (value === false) return false;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "y";
}

function normaliseNote(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function isHalfTravelNote(value) {
  const note = normaliseNote(value);
  return (
    note.includes("1/2 travel day") ||
    note.includes("1/2 day travel") ||
    note.includes("half travel day") ||
    note.includes("half day travel")
  );
}

function hasTimePair(entry, startKey, endKey) {
  return Boolean(entry?.[startKey] && entry?.[endKey]);
}

export function normaliseTrackingUnitRate(value) {
  const rate = Number(value || 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate < 100 ? rate * LEGACY_ON_SET_BLOCK_HOURS : rate;
}

export function normalisePayAdviceRates(baseRates = {}, rateOverrides = {}) {
  const rates = {
    ...baseRates,
    ...Object.fromEntries(
      Object.entries(rateOverrides || {}).map(([key, value]) => [key, Number(value || 0)])
    ),
  };

  return {
    ...rates,
    onSetRate: normaliseTrackingUnitRate(rates.onSetRate),
  };
}

export function normalisePayAdviceRowOverride(override = {}) {
  if (!override || typeof override !== "object") return {};
  const result = { ...override };
  const legacyOnSetHours = Number(result.onSetHrs);

  if (
    Number.isFinite(legacyOnSetHours) &&
    Math.abs(legacyOnSetHours) > MAX_REASONABLE_TRACKING_UNITS_PER_DAY
  ) {
    result.onSetHrs = legacyOnSetHours / LEGACY_ON_SET_BLOCK_HOURS;
  }

  return result;
}

export function computePayAdvicePayrollRow({
  card = {},
  primaryJob = null,
  isCancellationPayDay = false,
} = {}) {
  const entry = card.entry || {};
  const mode = String(card.mode || entry.mode || "off").trim().toLowerCase();
  const day = card.day || "";
  const dayNote =
    primaryJob?.dayNoteType ||
    primaryJob?.dayNote ||
    entry.dayNoteType ||
    entry.dayNote ||
    entry.dayNotes ||
    "";
  const breakdown = computeTimesheetDayBreakdown(entry, day, {
    previousDayOvernight: card.previousDayOvernight,
  });
  const hasRecordedTravel = hasTimePair(entry, "leaveTime", "arriveTime");
  const hasRecordedOnSet = hasTimePair(entry, "callTime", "wrapTime");
  const isTurnaroundPayDay = mode === "turnaround";

  let trackingUnits = getCreditValue(dayNote);
  if (trackingUnits === 0 && mode === "onset" && hasRecordedOnSet) trackingUnits = 1;
  if (trackingUnits === 0 && mode === "travel" && primaryJob && hasRecordedTravel) trackingUnits = 1;
  if (trackingUnits === 0 && (isTurnaroundPayDay || isCancellationPayDay)) trackingUnits = 1;

  let workshopHrs = 0;
  if (mode === "yard") {
    workshopHrs = trackingUnits > 0 ? breakdown.yardWork / 60 : breakdown.total / 60;
  } else if (mode === "workshop") {
    workshopHrs = breakdown.total / 60;
  } else if (card.isPaidHolidayDay) {
    workshopHrs = card.paidHolidayHoursToUse || card.paidHolidayHours || 0;
  }

  let travelHrs = 0;
  if (trackingUnits === 0 && mode === "travel" && hasRecordedTravel) {
    travelHrs = breakdown.travelDay / 60;
  } else if (mode === "onset") {
    travelHrs = (breakdown.outboundTravel + breakdown.paidEarly + breakdown.returnAfterStandard) / 60;
  }

  let sundayHrs = 0;
  if (day === "Sunday" && mode === "travel" && trackingUnits === 0) {
    sundayHrs = travelHrs;
    travelHrs = 0;
  }

  const onSetOvertimeHrs =
    mode === "onset" ? (breakdown.onSetOvertime + breakdown.precall) / 60 : 0;
  const overtimeHrs = ["yard", "workshop"].includes(mode)
    ? Math.max(0, workshopHrs - 8.5)
    : 0;
  const hasPayableWork =
    workshopHrs > 0 ||
    travelHrs > 0 ||
    sundayHrs > 0 ||
    trackingUnits > 0 ||
    onSetOvertimeHrs > 0;
  const weekendSupplementUnits =
    hasPayableWork && (day === "Saturday" || day === "Sunday") ? 1 : 0;
  const hasExplicitTravelMeal =
    boolish(entry.travelLunchSup) || boolish(entry.travelPD) || boolish(entry.mealSup);
  const hasQualifyingReturnTravelMeal =
    mode === "onset" &&
    !boolish(entry.overnight) &&
    breakdown.returnTravel >= TRAVEL_MEAL_RETURN_JOURNEY_MINUTES;
  const travelMealUnits =
    hasExplicitTravelMeal || isHalfTravelNote(dayNote) || hasQualifyingReturnTravelMeal ? 1 : 0;

  return {
    workshopHrs,
    overtimeHrs,
    travelHrs,
    sundayHrs,
    onSetHrs: trackingUnits,
    onSetOvertimeHrs,
    weekendSupplementUnits,
    overnightUnits: boolish(entry.overnight) ? 1 : 0,
    travelMealUnits,
    preCallHrs: 0,
    dailyTotalHrs: breakdown.total / 60,
  };
}

export function calculatePayAdviceRowTotal(row = {}, rates = {}) {
  const total =
    (Number(row.workshopHrs) || 0) * (Number(rates.workshopRate) || 0) +
    (Number(row.overtimeHrs) || 0) * (Number(rates.overtimeRate) || 0) +
    (Number(row.travelHrs) || 0) * (Number(rates.travelRate) || 0) +
    (Number(row.sundayHrs) || 0) * (Number(rates.sundayRate) || 0) +
    (Number(row.onSetHrs) || 0) * (Number(rates.onSetRate) || 0) +
    (Number(row.onSetOvertimeHrs) || 0) * (Number(rates.onSetOvertimeRate) || 0) +
    (Number(row.weekendSupplementUnits) || 0) *
      (Number(rates.weekendSupplementRate) || 0) +
    (Number(row.overnightUnits) || 0) * (Number(rates.overnightRate) || 0) +
    (Number(row.travelMealUnits) || 0) * (Number(rates.travelMealRate) || 0);

  return Number(total.toFixed(2));
}

export function calculatePayAdviceTotals(rows = [], rates = {}) {
  const totalFor = (key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);

  const totals = {
    workshopHrs: totalFor("workshopHrs"),
    overtimeHrs: totalFor("overtimeHrs"),
    travelHrs: totalFor("travelHrs"),
    sundayHrs: totalFor("sundayHrs"),
    onSetHrs: totalFor("onSetHrs"),
    onSetOvertimeHrs: totalFor("onSetOvertimeHrs"),
    weekendSupplementUnits: totalFor("weekendSupplementUnits"),
    overnightUnits: totalFor("overnightUnits"),
    travelMealUnits: totalFor("travelMealUnits"),
    preCallHrs: 0,
    dailyTotalHrs: totalFor("dailyTotalHrs"),
    workshopAmount: Number((totalFor("workshopHrs") * rates.workshopRate).toFixed(2)),
    overtimeAmount: Number((totalFor("overtimeHrs") * rates.overtimeRate).toFixed(2)),
    travelAmount: Number((totalFor("travelHrs") * rates.travelRate).toFixed(2)),
    sundayAmount: Number((totalFor("sundayHrs") * rates.sundayRate).toFixed(2)),
    onSetAmount: Number((totalFor("onSetHrs") * rates.onSetRate).toFixed(2)),
    onSetOvertimeAmount: Number(
      (totalFor("onSetOvertimeHrs") * rates.onSetOvertimeRate).toFixed(2)
    ),
    weekendSupplementAmount: Number(
      (totalFor("weekendSupplementUnits") * rates.weekendSupplementRate).toFixed(2)
    ),
    overnightAmount: Number((totalFor("overnightUnits") * rates.overnightRate).toFixed(2)),
    travelMealAmount: Number((totalFor("travelMealUnits") * rates.travelMealRate).toFixed(2)),
  };

  totals.totalMonetary = Number(
    (
      totals.workshopAmount +
      totals.overtimeAmount +
      totals.travelAmount +
      totals.sundayAmount +
      totals.onSetAmount +
      totals.onSetOvertimeAmount +
      totals.weekendSupplementAmount +
      totals.overnightAmount +
      totals.travelMealAmount
    ).toFixed(2)
  );

  return totals;
}
