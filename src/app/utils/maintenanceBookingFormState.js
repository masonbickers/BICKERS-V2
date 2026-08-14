export const EMPTY_EQUIPMENT_SELECTION = Object.freeze([]);

export const normalizeEquipmentSelection = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

export const equipmentSelectionKey = (value) =>
  JSON.stringify(normalizeEquipmentSelection(value));

export const equipmentSelectionsEqual = (left, right) =>
  equipmentSelectionKey(left) === equipmentSelectionKey(right);

const TERMINAL_CONFLICT_STATUSES = new Set([
  "archived",
  "cancelled",
  "canceled",
  "declined",
  "deleted",
  "closed",
  "superseded",
  "completed",
  "complete",
]);

export const maintenanceBookingParticipatesInConflict = (booking = {}) => {
  const status = String(booking.status || booking.bookingStatus || "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z]/g, "");
  return !TERMINAL_CONFLICT_STATUSES.has(status);
};

const normalizedBookingType = (value) => {
  const type = String(value || "").trim().toUpperCase();
  if (type === "MOT" || type === "SERVICE" || type === "INSPECTION" || type === "WORK") {
    return type;
  }
  return "WORK";
};

const inspectionTypeIds = (booking = {}) =>
  new Set(
    [
      ...(Array.isArray(booking.maintenanceTypeIds) ? booking.maintenanceTypeIds : []),
      ...(Array.isArray(booking.items)
        ? booking.items.map((item) => item?.maintenanceTypeId)
        : []),
    ]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
  );

/**
 * Same-day MOT, service and inspection work may share one workshop visit.
 * Only another booking for the same maintenance requirement is a hard conflict.
 */
export const maintenanceBookingsCompete = (
  existingBooking = {},
  requestedType,
  requestedMaintenanceTypeIds = []
) => {
  const existingType = normalizedBookingType(
    existingBooking.type || existingBooking.maintenanceType
  );
  const nextType = normalizedBookingType(requestedType);
  if (existingType !== nextType) return false;
  if (nextType !== "INSPECTION") return true;

  const existingIds = inspectionTypeIds(existingBooking);
  const requestedIds = new Set(
    (Array.isArray(requestedMaintenanceTypeIds) ? requestedMaintenanceTypeIds : [])
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (!existingIds.size || !requestedIds.size) return true;
  return [...existingIds].some((typeId) => requestedIds.has(typeId));
};
