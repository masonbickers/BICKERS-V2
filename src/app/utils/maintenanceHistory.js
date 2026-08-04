import { normalizeMaintenanceDocumentList } from "./maintenanceDocuments.js";
import { getMaintenanceTypeId } from "./maintenanceSchema.js";

const safeArr = (value) => (Array.isArray(value) ? value : []);
const isArchivedHistoryStatus = (value) =>
  ["archive", "archived"].includes(String(value || "").trim().toLowerCase());
const isCompletedHistoryStatus = (value) =>
  ["complete", "completed"].includes(String(value || "").trim().toLowerCase());
const maintenanceDocumentKey = (document = {}) =>
  String(
    document.id ||
      document.storagePath ||
      document.url ||
      `${document.name || "document"}|${document.uploadedAt || ""}`
  ).trim();
const mergeMaintenanceDocuments = (...lists) => {
  const seen = new Set();
  return lists.flatMap(safeArr).filter((document) => {
    const key = maintenanceDocumentKey(document);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const bookingMaintenanceTypeIds = (booking = {}) => new Set(
  [
    getMaintenanceTypeId(booking),
    ...safeArr(booking.maintenanceTypeIds),
    ...safeArr(booking.items).map((item) => item?.maintenanceTypeId),
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
);

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
  const safeVehicle = vehicle && typeof vehicle === "object" ? vehicle : {};
  const typeId = workflow.maintenanceTypeId;
  const rows = safeArr(safeVehicle[workflow.historyField]).map((item, index) => ({
    id: `stored-${index}`,
    bookingId: String(item.bookingId || item.sourceRecordId || "").trim(),
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

  safeArr(bookings)
    .filter((booking) => bookingMaintenanceTypeIds(booking).has(typeId))
    .forEach((booking) => {
      rows.push({
        id: `booking-${booking.id}`,
        bookingId: String(booking.id || "").trim(),
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
    safeVehicle[workflow.lastField] &&
    !rows.some(
      (row) =>
        maintenanceDateOnly(row.date) ===
        maintenanceDateOnly(safeVehicle[workflow.lastField])
    )
  ) {
    rows.push({
      id: "current-recorded-date",
      maintenanceTypeId: typeId,
      date: safeVehicle[workflow.lastField],
      nextDueDate: safeVehicle[workflow.nextField],
      status: "Recorded",
      provider: "",
      bookingRef: "",
      odometer: "",
      notes: "Current date stored on the vehicle record.",
      documents: [],
      source: "Vehicle record",
    });
  }

  const visibleRows = rows
    .filter(
      (row) =>
        maintenanceDateOnly(row.date) &&
        !isArchivedHistoryStatus(row.status)
    );
  const mergedRows = visibleRows.reduce((result, row) => {
    if (!isCompletedHistoryStatus(row.status)) {
      result.push(row);
      return result;
    }
    const rowDate = maintenanceDateOnly(row.date);
    const existing = result.find(
      (candidate) =>
        isCompletedHistoryStatus(candidate.status) &&
        ((row.bookingId && candidate.bookingId === row.bookingId) ||
          maintenanceDateOnly(candidate.date) === rowDate)
    );
    if (!existing) {
      result.push(row);
      return result;
    }
    existing.bookingId = existing.bookingId || row.bookingId;
    existing.nextDueDate = existing.nextDueDate || row.nextDueDate;
    existing.provider = existing.provider || row.provider;
    existing.bookingRef = existing.bookingRef || row.bookingRef;
    existing.odometer = existing.odometer || row.odometer;
    existing.notes = existing.notes || row.notes;
    existing.documents = mergeMaintenanceDocuments(existing.documents, row.documents);
    return result;
  }, []);

  return mergedRows
    .sort((left, right) =>
      maintenanceDateOnly(left.date).localeCompare(
        maintenanceDateOnly(right.date)
      )
    );
};
