"use client";

const FIELD_LABELS = [
  ["type", "Type"],
  ["vehicleLabel", "Vehicle"],
  ["status", "Status"],
  ["isMultiDay", "Multi-day"],
  ["bookingDates", "Booking dates"],
  ["appointmentDateISO", "Appointment date"],
  ["startDateISO", "Start date"],
  ["endDateISO", "End date"],
  ["completedAtISO", "Completed date"],
  ["provider", "Provider"],
  ["bookingRef", "Booking ref"],
  ["location", "Location"],
  ["cost", "Cost"],
  ["notes", "Notes"],
  ["equipment", "Equipment"],
  ["sourceDueDateISO", "Source due date"],
  ["sourceDueIsoWeek", "Source ISO week"],
  ["sourceDueKey", "Source due key"],
];

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value;
  return String(value).trim();
}

function valuesEqual(left, right) {
  const a = normalizeValue(left);
  const b = normalizeValue(right);
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatValue(value) {
  if (Array.isArray(value)) {
    const clean = value.map((item) => String(item || "").trim()).filter(Boolean);
    return clean.length ? clean.join(", ") : "None";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const clean = String(value || "").trim();
  return clean || "Blank";
}

export function buildMaintenanceChangeList(previousBooking = {}, nextBooking = {}) {
  return FIELD_LABELS.reduce((changes, [key, label]) => {
    if (valuesEqual(previousBooking?.[key], nextBooking?.[key])) return changes;
    changes.push(
      `${label}: ${formatValue(previousBooking?.[key])} -> ${formatValue(nextBooking?.[key])}`
    );
    return changes;
  }, []);
}

export function getMaintenanceAuditIdentity(user) {
  return {
    email: user?.email || "Unknown",
    uid: user?.uid || "",
  };
}

export function buildMaintenanceHistoryEntry({ action, user, timestamp, changes = [] }) {
  return {
    action,
    user: user?.email || "Unknown",
    userUid: user?.uid || "",
    timestamp,
    changes,
    details: changes.length ? changes.join("\n") : `${action} maintenance booking`,
  };
}
