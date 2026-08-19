import {
  buildAssetLabel,
  getCanonicalDueDate,
  isVehicleOutOfUse,
  ymd,
} from "./maintenanceSchema.js";
import { isHgvComplianceVehicle } from "./hgvCompliance.js";

const formatUkDate = (value) => {
  const dateKey = ymd(value);
  if (!dateKey) return "unknown date";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const inspectionDueDate = (vehicle) =>
  getCanonicalDueDate(vehicle, "pmi") ||
  getCanonicalDueDate(vehicle, "inspection");

export const buildBookingVehicleWarnings = (
  vehicles = [],
  { bookingDate = null } = {}
) => {
  const bookingDateKey = ymd(bookingDate);
  const warnings = [];

  (Array.isArray(vehicles) ? vehicles : []).forEach((vehicle) => {
    if (!vehicle || typeof vehicle !== "object") return;
    if (["ambiguous-name", "not-found"].includes(vehicle.__vehicleResolution)) return;

    const label = buildAssetLabel(vehicle) || "Unknown vehicle";
    const isVor = isVehicleOutOfUse(vehicle);
    const dueDate = isHgvComplianceVehicle(vehicle)
      ? inspectionDueDate(vehicle)
      : null;
    const dueDateKey = ymd(dueDate);
    const inspectionDueBeforeBooking = Boolean(
      bookingDateKey && dueDateKey && dueDateKey < bookingDateKey
    );

    if (isVor && inspectionDueBeforeBooking) {
      warnings.push(
        `VOR / HGV INSPECTION DUE BEFORE BOOKING: ${label} — due ${formatUkDate(dueDate)}`
      );
      return;
    }

    if (isVor) {
      warnings.push(`VOR: ${label}`);
      return;
    }

    if (inspectionDueBeforeBooking) {
      warnings.push(
        `HGV INSPECTION DUE BEFORE BOOKING: ${label} — due ${formatUkDate(dueDate)}`
      );
    }
  });

  return warnings;
};
