const text = (value) => String(value ?? "").trim();
const looksLikeDocumentId = (value) =>
  /^[A-Za-z0-9_-]{18,28}$/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value);

export function formatVehicleRecord(vehicle = {}) {
  const name = text(vehicle.name || vehicle.vehicleName || vehicle.label);
  const registration = text(vehicle.registration || vehicle.reg).toUpperCase();
  if (name && registration) return `${name} (${registration})`;
  return name || registration;
}

export function resolveVehicleDisplay(value, lookup = {}, { fallbackToRaw = true } = {}) {
  const raw =
    value && typeof value === "object"
      ? text(value.id || value.vehicleId || value.registration || value.reg || value.name)
      : text(value);
  const record =
    lookup.byId?.[raw] ||
    lookup.byReg?.[raw.toUpperCase()] ||
    lookup.byName?.[raw.toLowerCase()] ||
    (value && typeof value === "object" ? value : null);
  const formatted = formatVehicleRecord(record || {});
  if (formatted) return formatted;
  if (!fallbackToRaw) return "";
  return looksLikeDocumentId(raw) ? "Vehicle" : raw;
}

export function formatVehicleList(values = [], lookup = {}, options) {
  if (!Array.isArray(values)) return "";
  return Array.from(
    new Set(values.map((value) => resolveVehicleDisplay(value, lookup, options)).filter(Boolean))
  ).join(", ");
}
