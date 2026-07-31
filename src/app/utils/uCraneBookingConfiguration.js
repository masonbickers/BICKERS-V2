const U_CRANE_PATTERN = /\bu[\s-]?crane\b/i;

export const isUCraneVehicle = (vehicle) => {
  if (!vehicle || typeof vehicle !== "object") return false;
  return [vehicle.category, vehicle.group, vehicle.name, vehicle.type]
    .filter(Boolean)
    .some((value) => U_CRANE_PATTERN.test(String(value)));
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
