const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const PRIORITY_VEHICLE_STATUSES = new Set(["confirmed", "first pencil"]);
const SECOND_PENCIL_BLOCKING_STATUSES = new Set(["second pencil", "maintenance"]);
const VEHICLE_BLOCKING_STATUSES = new Set([
  ...PRIORITY_VEHICLE_STATUSES,
  ...SECOND_PENCIL_BLOCKING_STATUSES,
]);

export const isPriorityVehicleStatus = (status) =>
  PRIORITY_VEHICLE_STATUSES.has(normalizeStatus(status));

export const existingVehicleStatusesConflictWithRequested = (
  existingStatuses = [],
  requestedStatus = ""
) => {
  const requested = normalizeStatus(requestedStatus);
  const existing = existingStatuses.map(normalizeStatus).filter(Boolean);

  if (!VEHICLE_BLOCKING_STATUSES.has(requested)) return false;
  if (requested === "second pencil") {
    return existing.some((status) => SECOND_PENCIL_BLOCKING_STATUSES.has(status));
  }
  if (PRIORITY_VEHICLE_STATUSES.has(requested)) {
    return existing.some(
      (status) => PRIORITY_VEHICLE_STATUSES.has(status) || status === "maintenance"
    );
  }
  return existing.some((status) => VEHICLE_BLOCKING_STATUSES.has(status));
};

export const canAutoAssignVehicleAsSecondPencil = (
  existingStatuses = [],
  requestedStatus = ""
) => {
  if (!isPriorityVehicleStatus(requestedStatus)) return false;

  const normalizedExisting = existingStatuses.map(normalizeStatus).filter(Boolean);
  return (
    normalizedExisting.some((status) => PRIORITY_VEHICLE_STATUSES.has(status)) &&
    !normalizedExisting.some((status) => SECOND_PENCIL_BLOCKING_STATUSES.has(status))
  );
};

export const blockingStatusesForPriorityEdit = (existingStatuses = [], retainPriority = false) =>
  retainPriority
    ? existingStatuses.filter((status) => normalizeStatus(status) !== "second pencil")
    : existingStatuses;

export const canRetainVehiclePriorityOnEdit = ({
  originalStatus,
  requestedStatus,
  originalDates = [],
  requestedDates = [],
} = {}) => {
  if (!isPriorityVehicleStatus(originalStatus) || !isPriorityVehicleStatus(requestedStatus)) {
    return false;
  }

  const originalDateSet = new Set(
    (originalDates || []).map((date) => String(date || "").slice(0, 10)).filter(Boolean)
  );
  const nextDates = (requestedDates || [])
    .map((date) => String(date || "").slice(0, 10))
    .filter(Boolean);

  return nextDates.length > 0 && nextDates.every((date) => originalDateSet.has(date));
};
