const dateOnly = (value) => {
  if (!value) return "";
  if (typeof value?.toDate === "function") return dateOnly(value.toDate());
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
};

export const normalizeMaintenanceType = (type) => {
  const value = String(type || "").trim().toUpperCase();
  return ["MOT", "SERVICE", "INSPECTION", "WORK"].includes(value) ? value : "WORK";
};

export const bookingToDateKeys = (booking = {}) => {
  const explicit = Array.isArray(booking.bookingDates)
    ? booking.bookingDates.map(dateOnly).filter(Boolean)
    : [];
  if (explicit.length) return [...new Set(explicit)].sort();
  const appointment = dateOnly(booking.appointmentDateISO || booking.appointmentDate || booking.date);
  if (appointment) return [appointment];
  const start = dateOnly(booking.startDateISO || booking.startDate);
  const end = dateOnly(booking.endDateISO || booking.endDate || start);
  if (!start || !end || start > end) return [];
  const result = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const finish = new Date(`${end}T12:00:00Z`);
  while (cursor <= finish && result.length < 370) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
};
