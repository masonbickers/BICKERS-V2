import {
  MAINTENANCE_RECORD_SCHEMA_VERSION,
  normalizeMaintenanceRecord,
} from "./maintenanceRecord.js";

const text = (value) => String(value || "").trim();

const dateOnly = (value) => {
  if (!value) return "";
  if (typeof value?.toDate === "function") return dateOnly(value.toDate());
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : dateOnly(parsed);
};

const bookingDates = (booking = {}) => {
  const explicit = Array.isArray(booking.bookingDates)
    ? booking.bookingDates.map(dateOnly).filter(Boolean)
    : [];
  if (explicit.length) return explicit;
  return [
    booking.appointmentDateISO,
    booking.startDateISO,
    booking.endDateISO,
    booking.appointmentDate,
    booking.startDate,
    booking.endDate,
    booking.date,
  ]
    .map(dateOnly)
    .filter(Boolean);
};

export const isVorAffectedMaintenanceBooking = (
  booking = {},
  { offRoadDate = "" } = {}
) => {
  const status = text(booking.status).toLowerCase();
  if (["completed", "complete", "cancelled", "canceled", "declined", "deleted", "closed"].includes(status)) {
    return false;
  }
  const typeIds = [
    ...safeExplicitTypeIds(booking.maintenanceTypeIds),
    ...safeExplicitTypeIds([booking.maintenanceTypeId]),
    ...(Array.isArray(booking.items)
      ? booking.items.map((item) => text(item?.maintenanceTypeId).toLowerCase()).filter(Boolean)
      : []),
  ];
  const isPmiOrBrake = typeIds.some((item) => ["pmi", "brake_test"].includes(item));
  if (!isPmiOrBrake) return false;
  const dates = bookingDates(booking);
  const start = dateOnly(offRoadDate);
  return start ? dates.some((date) => date >= start) : dates.length > 0;
};

function safeExplicitTypeIds(values) {
  return Array.isArray(values)
    ? values.map((item) => text(item).toLowerCase()).filter(Boolean)
    : [];
}

export const getVehicleVorStartDate = (vehicle = {}) => {
  const history = Array.isArray(vehicle.vorHistory) ? vehicle.vorHistory : [];
  const activeRecord =
    history.find(
      (record) =>
        record?.status === "open" &&
        (record.id === vehicle.activeVorRecordId || !vehicle.activeVorRecordId)
    ) || history.find((record) => record?.status === "open") || null;
  return dateOnly(
    activeRecord?.offRoadDate ||
      vehicle.maintenanceCountdownPause?.startedDate ||
      vehicle.complianceVor?.startedDate ||
      vehicle.vorStartedAt
  );
};

export const isPendingReturnInspectionBooking = (booking = {}, vehicle = {}) => {
  const pending = vehicle.pendingReturnInspection || {};
  if (text(pending.status).toLowerCase() !== "inspection_required") return false;
  if (text(pending.bookingId)) return text(booking.id) === text(pending.bookingId);
  const expectedDate = dateOnly(pending.inspectionDate);
  if (!expectedDate || !bookingDates(booking).includes(expectedDate)) return false;
  const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
  const typeIds = new Set(canonical.items.map((item) => text(item.maintenanceTypeId).toLowerCase()));
  return typeIds.has("pmi") && typeIds.has("brake_test");
};

export const isVorInspectionCancellationCandidate = (
  booking = {},
  { vehicle = {}, offRoadDate = "" } = {}
) =>
  isVorAffectedMaintenanceBooking(booking, {
    offRoadDate: offRoadDate || getVehicleVorStartDate(vehicle),
  }) && !isPendingReturnInspectionBooking(booking, vehicle);

export const getVorInspectionCancellationCandidates = (
  bookings = [],
  { vehicle = {}, offRoadDate = "" } = {}
) =>
  (Array.isArray(bookings) ? bookings : []).filter((booking) =>
    isVorInspectionCancellationCandidate(booking, { vehicle, offRoadDate })
  );

export const buildVorInspectionCancellationPatch = (
  booking = {},
  {
    cancelledAt = new Date().toISOString(),
    cancelledBy = null,
    cancellationSource = "vehicle_vor_reconciliation",
    sourceRecordId = "",
    reason = "Vehicle is VOR; previous PMI/brake plans are no longer valid",
  } = {}
) => {
  const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
  const affectedTypeIds = new Set(["pmi", "brake_test"]);
  const hasUnaffectedItems = canonical.items.some(
    (item) => !affectedTypeIds.has(text(item.maintenanceTypeId).toLowerCase())
  );
  const nextStatus = hasUnaffectedItems ? "Booked" : "Cancelled";
  const actor =
    text(cancelledBy?.email || cancelledBy?.name || cancelledBy?.uid || cancelledBy) || "system";
  const historyEntry = {
    action: "Cancelled for VOR",
    user: actor,
    timestamp: cancelledAt,
    source: cancellationSource,
    changes: [
      `Status: ${text(booking.status) || canonical.status || "Blank"} -> ${nextStatus}`,
      hasUnaffectedItems
        ? `PMI/brake items cancelled; unrelated appointment items preserved`
        : `Reason: ${reason}`,
    ],
  };
  return {
    status: nextStatus,
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    items: canonical.items.map((item) => ({
      ...item,
      status: affectedTypeIds.has(text(item.maintenanceTypeId).toLowerCase())
        ? "cancelled"
        : item.status,
    })),
    cancellationReason: reason,
    cancellationSource,
    cancellationSourceRecordId: text(sourceRecordId),
    cancelledAtISO: cancelledAt,
    cancelledBy,
    lastEditedBy: actor,
    lastEditedByUid: text(cancelledBy?.uid),
    history: [...(Array.isArray(booking.history) ? booking.history : []), historyEntry],
    updatedAt: cancelledAt,
  };
};
