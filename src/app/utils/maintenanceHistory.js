import { normalizeMaintenanceDocumentList } from "./maintenanceDocuments.js";
import { getMaintenanceTypeId } from "./maintenanceSchema.js";

const safeArr = (value) => (Array.isArray(value) ? value : []);

export const maintenanceDateOnly = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(parsed?.getTime?.())
    ? ""
    : parsed.toISOString().slice(0, 10);
};

export const maintenanceBookingDate = (booking = {}) =>
  booking.completedDate ||
  booking.completedAt ||
  booking.appointmentDateISO ||
  booking.appointmentDate ||
  booking.startDateISO ||
  booking.startDate ||
  booking.createdAt;

export const buildMaintenanceHistoryRows = ({
  vehicle = {},
  bookings = [],
  workflow,
} = {}) => {
  if (!workflow) return [];
  const typeId = workflow.maintenanceTypeId;
  const rows = safeArr(vehicle[workflow.historyField]).map((item, index) => ({
    id: `stored-${index}`,
    maintenanceTypeId: typeId,
    date: item.completedDate || item.date || item.completedAt,
    nextDueDate: item.nextDueDate || item.nextDate || "",
    status: item.status || "Completed",
    provider: item.provider || "",
    bookingRef: item.bookingRef || "",
    odometer: item.odometer || "",
    notes: item.notes || item.description || "",
    documents: normalizeMaintenanceDocumentList(item.documents, {
      maintenanceTypeId: typeId,
      source: "history",
      sourceRecordId: item.id || item.completedDate || "",
      uploadedAt: item.completedAt || item.completedDate || "",
    }),
    source: "Vehicle inspection history",
  }));

  bookings
    .filter((booking) => getMaintenanceTypeId(booking) === typeId)
    .forEach((booking) => {
      rows.push({
        id: `booking-${booking.id}`,
        maintenanceTypeId: typeId,
        date: maintenanceBookingDate(booking),
        nextDueDate: booking.nextDueDate || "",
        status: booking.status || "Booked",
        provider: booking.provider || "",
        bookingRef: booking.bookingRef || "",
        odometer: booking.odometer || "",
        notes: booking.notes || booking.bookingNotes || "",
        documents: normalizeMaintenanceDocumentList(
          [
            ...safeArr(booking.documents),
            ...safeArr(booking.attachments),
            ...safeArr(booking.files),
          ],
          {
            maintenanceTypeId: typeId,
            source: "appointment",
            sourceRecordId: booking.id,
            uploadedAt: maintenanceBookingDate(booking),
          }
        ),
        source: "Maintenance booking",
      });
    });

  if (
    vehicle[workflow.lastField] &&
    !rows.some(
      (row) =>
        maintenanceDateOnly(row.date) ===
        maintenanceDateOnly(vehicle[workflow.lastField])
    )
  ) {
    rows.push({
      id: "current-recorded-date",
      maintenanceTypeId: typeId,
      date: vehicle[workflow.lastField],
      nextDueDate: vehicle[workflow.nextField],
      status: "Recorded",
      provider: "",
      bookingRef: "",
      odometer: "",
      notes: "Current date stored on the vehicle record.",
      documents: [],
      source: "Vehicle record",
    });
  }

  return rows
    .filter((row) => maintenanceDateOnly(row.date))
    .sort((left, right) =>
      maintenanceDateOnly(right.date).localeCompare(
        maintenanceDateOnly(left.date)
      )
    );
};
