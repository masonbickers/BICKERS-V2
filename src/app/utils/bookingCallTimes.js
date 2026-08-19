export function buildBookingCallTimePayload({
  bookingDates = [],
  callTimesByDate = {},
  isRange = false,
  useCustomDates = false,
} = {}) {
  const dates = Array.isArray(bookingDates) ? bookingDates : [];
  const source = callTimesByDate && typeof callTimesByDate === "object" ? callTimesByDate : {};
  const savedByDate = {};

  dates.forEach((date) => {
    const dateKey = String(date || "").trim();
    const time = String(source[dateKey] || "").trim();
    if (dateKey && time) savedByDate[dateKey] = time;
  });

  const firstDate = String(dates[0] || "").trim();
  const singleConsecutiveDate = dates.length === 1 && !isRange && !useCustomDates;

  return {
    callTime: singleConsecutiveDate ? savedByDate[firstDate] || "" : "",
    // Always include the map. An empty object is an intentional instruction
    // to clear previously stored per-day call times during an update.
    callTimesByDate: savedByDate,
  };
}
