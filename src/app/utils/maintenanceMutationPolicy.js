import {
  maintenanceDateOnly,
  maintenanceIsoWeekLabel,
  normalizeMaintenanceRecordStatus,
} from "./maintenanceRecord.js";

export const assertInitialMaintenanceStatus = (value) => {
  const status = normalizeMaintenanceRecordStatus(value || "booked");
  if (!["requested", "booked"].includes(status)) {
    throw new Error("New bookings may only start as Requested or Booked.");
  }
  return status;
};

export const assertMaintenanceTransition = (currentValue, nextValue) => {
  const current = normalizeMaintenanceRecordStatus(currentValue);
  const next = normalizeMaintenanceRecordStatus(nextValue);
  const allowed = {
    requested: new Set(["requested", "booked"]),
    booked: new Set(["booked", "in_progress", "deferred"]),
    in_progress: new Set(["in_progress", "booked", "deferred"]),
    deferred: new Set(["deferred", "booked"]),
  };
  if (!allowed[current]?.has(next)) {
    throw new Error(`Invalid maintenance transition: ${current} -> ${next}.`);
  }
  return next;
};

export const rescheduleCrossesLegalIsoWeek = (legalWeeks = [], bookingDates = []) => {
  const expected = new Set((legalWeeks || []).filter(Boolean));
  return expected.size > 0 && (bookingDates || []).some(
    (date) => !expected.has(maintenanceIsoWeekLabel(date))
  );
};

export const isDvsaResultForCompletion = (testCompletedDate, maintenanceCompletedDate) => {
  const testDate = maintenanceDateOnly(testCompletedDate);
  const completedDate = maintenanceDateOnly(maintenanceCompletedDate);
  return Boolean(testDate && completedDate && testDate >= completedDate);
};
