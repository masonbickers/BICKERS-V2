export function countConfirmedIncompleteJobs(bookings = [], now = new Date()) {
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  return bookings.filter((job) => {
    if (!/^\d{4}(?:\.\d+)?$/.test(String(job?.jobNumber ?? "").trim())) return false;
    if (String(job?.status || "").toLowerCase().trim() !== "confirmed") return false;
    if (job?.readyToInvoice === true) return false;

    const invoiceStatus = String(job?.invoiceStatus || "").toLowerCase().trim();
    if (invoiceStatus.includes("paid") || job?.finance?.paidAt) return false;

    const rawDates = Array.isArray(job?.bookingDates) && job.bookingDates.length
      ? job.bookingDates
      : job?.date
        ? [job.date]
        : [];
    const dates = rawDates
      .map((raw) => {
        if (typeof raw?.toDate === "function") return raw.toDate();
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
      })
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (!dates.length) return false;

    const lastWorkDate = new Date(dates[dates.length - 1]);
    lastWorkDate.setHours(0, 0, 0, 0);
    return lastWorkDate.getTime() < todayMidnight.getTime();
  }).length;
}
