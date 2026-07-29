const dateOnly = (value) => {
  if (!value) return "";
  if (typeof value?.toDate === "function") return dateOnly(value.toDate());
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

export const resolveMaintenanceBookedOn = ({
  bookingId = "",
  summaryBookingId = "",
  summaryBookedOn = "",
  bookingCreatedAt = "",
  fallbackISO = "",
} = {}) => {
  const createdOn = dateOnly(bookingCreatedAt);
  if (createdOn) return createdOn;

  const sameBooking =
    String(bookingId || "").trim() &&
    String(bookingId || "").trim() === String(summaryBookingId || "").trim();

  if (sameBooking) {
    const existingBookedOn = dateOnly(summaryBookedOn);
    if (existingBookedOn) return existingBookedOn;
  }

  return dateOnly(fallbackISO);
};
