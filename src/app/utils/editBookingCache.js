"use client";

const EDIT_BOOKING_CACHE_PREFIX = "edit-booking-prefill:v1:";
const EDIT_BOOKING_CACHE_TTL_MS = 5 * 60 * 1000;

const cacheKeyForBooking = (id) =>
  `${EDIT_BOOKING_CACHE_PREFIX}${String(id || "").trim()}`;

const serialiseForSession = (value) => {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialiseForSession);
  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, nestedValue]) => {
      acc[key] = serialiseForSession(nestedValue);
      return acc;
    }, {});
  }
  return value;
};

export function cacheBookingForEdit(booking) {
  if (typeof window === "undefined" || !booking?.id) return;
  try {
    window.sessionStorage.setItem(
      cacheKeyForBooking(booking.id),
      JSON.stringify({
        savedAt: Date.now(),
        booking: serialiseForSession(booking),
      })
    );
  } catch {
    // The cache is only a speed boost.
  }
}

export function readCachedBookingForEdit(id) {
  if (typeof window === "undefined" || !id) return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(cacheKeyForBooking(id)) || "null");
    if (!parsed?.booking || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > EDIT_BOOKING_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(cacheKeyForBooking(id));
      return null;
    }
    return { ...parsed.booking, id: String(id) };
  } catch {
    return null;
  }
}
