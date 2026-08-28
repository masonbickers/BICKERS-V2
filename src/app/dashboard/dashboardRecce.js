const recceTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const bookingIdForRecceEvent = (event) => event?.__bookingId || event?.id || "";

export function mapReccesByBooking(rows = []) {
  const map = {};

  rows.forEach((row) => {
    const data = typeof row?.data === "function" ? row.data() : row || {};
    const answers = data.answers || {};
    const bookingId = data.bookingId || answers.bookingId;
    if (!bookingId) return;

    const recce = {
      id: row?.id || data.id,
      status: data.status || "submitted",
      notes: String(
        data.notes ||
          answers.notes ||
          answers.additionalNotes ||
          answers.accessNotes ||
          answers.risks ||
          ""
      ).trim(),
      answers,
      createdAt: data.createdAt || null,
    };

    const current = map[bookingId];
    if (!current || recceTimestampMs(recce.createdAt) >= recceTimestampMs(current.createdAt)) {
      map[bookingId] = recce;
    }
  });

  return map;
}
