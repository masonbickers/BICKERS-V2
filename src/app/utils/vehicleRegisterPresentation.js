import {
  isMotNotApplicable,
  isServiceNotApplicable,
} from "./maintenanceSchema.js";

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();

export const RETENTION_PLATE_CATEGORY = "Number Plates On Retention";

export const isRetentionPlateRecord = (vehicle = {}) =>
  lower(vehicle.category) === lower(RETENTION_PLATE_CATEGORY) ||
  vehicle.recordType === "numberPlateRetention";

export const getRegisterComplianceState = (vehicle = {}, type) => {
  if (isRetentionPlateRecord(vehicle)) {
    return { status: "not-applicable", value: "", reason: "Retained number plate" };
  }

  const normalizedType = lower(type);
  const notApplicable =
    normalizedType === "mot"
      ? isMotNotApplicable(vehicle)
      : normalizedType === "service"
        ? isServiceNotApplicable(vehicle)
        : false;
  if (notApplicable) {
    return { status: "not-applicable", value: "", reason: "Explicitly exempt" };
  }

  const value =
    normalizedType === "mot"
      ? text(
          vehicle.nextMOT ||
            vehicle.nextMot ||
            vehicle.nextMotDate ||
            vehicle.motDueDate ||
            vehicle.motExpiryDate
        )
      : text(
          vehicle.nextService ||
            vehicle.nextServiceDate ||
            vehicle.serviceDueDate ||
            vehicle.nextSvc
        );

  return value
    ? { status: "dated", value, reason: "" }
    : { status: "missing", value: "", reason: "No date or exemption recorded" };
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const countUniqueVehiclesByDeadlineState = (
  vehicleDeadlines = [],
  now = new Date()
) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let overdue = 0;
  let soon = 0;

  for (const row of Array.isArray(vehicleDeadlines) ? vehicleDeadlines : []) {
    let vehicleOverdue = false;
    let vehicleSoon = false;

    for (const deadline of Array.isArray(row?.deadlines) ? row.deadlines : []) {
      const date = toDate(deadline?.value);
      if (!date) continue;
      const dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const diff = Math.floor((dueDate - today) / 86400000);
      if (diff < 0) vehicleOverdue = true;
      else if (diff <= Number(deadline?.warningDays || 0)) vehicleSoon = true;
    }

    if (vehicleOverdue) overdue++;
    if (vehicleSoon) soon++;
  }

  return { overdue, soon };
};
