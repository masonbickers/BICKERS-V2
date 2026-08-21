const U_CRANE_PATTERN = /\bu[\s-]?crane\b/i;

export const isUCraneVehicle = (vehicle) => {
  if (!vehicle || typeof vehicle !== "object") return false;
  return [
    vehicle.category,
    vehicle.group,
    vehicle.name,
    vehicle.label,
    vehicle.type,
    vehicle.department,
    vehicle.division,
  ]
    .filter(Boolean)
    .some((value) => U_CRANE_PATTERN.test(String(value)));
};

const normalizeVehicleKey = (value) => String(value || "").trim().toLowerCase();

export const isUCraneBooking = (booking, vehicles = []) => {
  if (!booking || typeof booking !== "object") return false;
  if (booking.isUCrane === true || booking.uCrane === true) return true;

  if (
    [booking.bookingType, booking.type, booking.category, booking.department, booking.division]
      .filter(Boolean)
      .some((value) => U_CRANE_PATTERN.test(String(value)))
  ) {
    return true;
  }

  const vehicleLookup = new Map();
  (Array.isArray(vehicles) ? vehicles : []).forEach((vehicle) => {
    [vehicle?.id, vehicle?.name, vehicle?.registration, vehicle?.registrationNumber]
      .map(normalizeVehicleKey)
      .filter(Boolean)
      .forEach((key) => vehicleLookup.set(key, vehicle));
  });

  return (Array.isArray(booking.vehicles) ? booking.vehicles : []).some((entry) => {
    if (entry && typeof entry === "object" && isUCraneVehicle(entry)) return true;

    const candidate = entry && typeof entry === "object"
      ? entry.id || entry.vehicleId || entry.value || entry.name || entry.registration
      : entry;
    if (U_CRANE_PATTERN.test(String(candidate || ""))) return true;

    return isUCraneVehicle(vehicleLookup.get(normalizeVehicleKey(candidate)));
  });
};

export const normalizeUCraneArmFitted = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([vehicleId, fitted]) => [String(vehicleId || "").trim(), fitted !== false])
      .filter(([vehicleId]) => Boolean(vehicleId))
  );
};

export const isUCraneArmFitted = (configuration, vehicleId) =>
  normalizeUCraneArmFitted(configuration)[String(vehicleId || "").trim()] !== false;

export const buildUCraneArmFittedForSave = ({
  vehicleIds = [],
  vehicleLookup = {},
  configuration = {},
} = {}) => {
  const normalizedConfiguration = normalizeUCraneArmFitted(configuration);
  return Object.fromEntries(
    (Array.isArray(vehicleIds) ? vehicleIds : [])
      .map((vehicleId) => String(vehicleId || "").trim())
      .filter(Boolean)
      .filter((vehicleId) => isUCraneVehicle(vehicleLookup?.byId?.[vehicleId]))
      .map((vehicleId) => [
        vehicleId,
        normalizedConfiguration[vehicleId] !== false,
      ])
  );
};
