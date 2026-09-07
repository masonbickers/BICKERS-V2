import { normalizeMaintenanceRecord } from "./maintenanceRecord.js";

export function vehicleInspectionEntries(bookings = [], vehicleId, preferredDate = "") {
  return bookings
    .filter((booking) => booking.id && booking.vehicleId === vehicleId)
    .map((booking) => {
      const record = normalizeMaintenanceRecord(booking, { id: booking.id });
      const items = record.items.filter((item) => ["pmi", "brake_test"].includes(item.maintenanceTypeId));
      const date = items.map((item) => item.completionDateISO).filter(Boolean).sort().at(-1) ||
        record.schedule.appointmentDateISO || record.schedule.bookingDates[0] || booking.schedule?.bookingDates?.[0] ||
        items.map((item) => item.legalDueDateISO).find(Boolean) || "";
      return { booking, items, date, status: record.status };
    })
    .filter((entry) => entry.items.length && !["cancelled", "archived"].includes(entry.status))
    .sort((a, b) => Number(Boolean(preferredDate) && b.date === preferredDate) - Number(Boolean(preferredDate) && a.date === preferredDate) || b.date.localeCompare(a.date));
}
