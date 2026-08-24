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

export const getMaintenanceScheduleRule = ({
  type,
  legalDueDate,
  legalDueWeeks = [],
  bookingDates = [],
} = {}) => {
  const normalizedType = String(type || "").trim().toUpperCase();
  const dates = (Array.isArray(bookingDates) ? bookingDates : [])
    .map(maintenanceDateOnly)
    .filter(Boolean)
    .sort();
  const dueDate = maintenanceDateOnly(legalDueDate);
  const outsideScheduledWeek = rescheduleCrossesLegalIsoWeek(legalDueWeeks, dates);
  const afterDueDate = Boolean(dueDate && dates.some((date) => date > dueDate));
  // An earlier workshop slot is compliant even if it falls in the previous ISO
  // week. The ISO-week exception exists to flag work arranged after the due
  // date, not preventative work completed before it is due.
  const outsideLegalWeek = outsideScheduledWeek && (!dueDate || afterDueDate);

  if (normalizedType === "MOT") {
    return {
      outsideLegalWeek,
      requiresAcknowledgement: afterDueDate,
      requiresExceptionReason: false,
      blocked: false,
      state: afterDueDate ? "after_expiry" : "allowed",
    };
  }

  if (normalizedType === "SERVICE") {
    return {
      outsideLegalWeek,
      requiresAcknowledgement: false,
      requiresExceptionReason: false,
      blocked: false,
      state: outsideLegalWeek ? "service_advisory" : "allowed",
    };
  }

  const requiresExceptionReason = normalizedType === "INSPECTION" && outsideLegalWeek;
  return {
    outsideLegalWeek,
    requiresAcknowledgement: false,
    requiresExceptionReason,
    blocked: false,
    state: requiresExceptionReason ? "inspection_exception" : "allowed",
  };
};

export const isDvsaResultForCompletion = (testCompletedDate, maintenanceCompletedDate) => {
  const testDate = maintenanceDateOnly(testCompletedDate);
  const completedDate = maintenanceDateOnly(maintenanceCompletedDate);
  return Boolean(testDate && completedDate && testDate >= completedDate);
};

export const buildAtomicRescheduleWriteSet = ({
  bookingId,
  bookingPatch,
  bookingUpdateTime,
  vehicleId,
  vehiclePatch,
}) => {
  const dates = Array.isArray(bookingPatch?.bookingDates) ? bookingPatch.bookingDates : [];
  const summaryAppointment = Object.entries(vehiclePatch || {}).find(
    ([key, value]) => /(AppointmentDate|BookingDate)$/.test(key) && value
  )?.[1];
  if (dates.length === 1 && summaryAppointment && summaryAppointment !== dates[0]) {
    throw new Error("Booking and vehicle summary appointment dates must match.");
  }
  return [{
    collection: "maintenanceBookings",
    documentId: bookingId,
    patch: bookingPatch,
    updateTime: bookingUpdateTime,
  },
  ...(vehicleId && vehiclePatch
    ? [{ collection: "vehicles", documentId: vehicleId, patch: vehiclePatch, exists: true }]
    : []),
  ];
};
