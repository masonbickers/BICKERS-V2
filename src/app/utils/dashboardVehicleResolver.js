const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();
const upper = (value) => text(value).toUpperCase();

const addToBucket = (map, key, vehicle) => {
  if (!key) return;
  if (!map[key]) map[key] = [];
  map[key].push(vehicle);
};

const uniqueMatch = (map, key) => {
  const matches = map[key] || [];
  return matches.length === 1 ? matches[0] : null;
};

export const buildDashboardVehicleRegister = (vehicles = []) => {
  const byId = {};
  const byRegistration = {};
  const byName = {};

  for (const vehicle of Array.isArray(vehicles) ? vehicles : []) {
    if (!vehicle || typeof vehicle !== "object") continue;
    const id = text(vehicle.id);
    if (id) byId[id] = vehicle;
    addToBucket(
      byRegistration,
      upper(vehicle.registration || vehicle.reg || vehicle.registrationNumber),
      vehicle
    );
    addToBucket(byName, lower(vehicle.name || vehicle.vehicleName), vehicle);
  }

  return { byId, byRegistration, byName };
};

const unresolvedVehicle = (reference, resolution) => {
  const source = reference && typeof reference === "object" ? reference : {};
  const raw = typeof reference === "object" ? "" : text(reference);
  return {
    name: text(source.name || source.vehicleName || source.label || raw),
    registration: upper(
      source.registration || source.reg || source.registrationNumber || ""
    ),
    __vehicleResolution: resolution,
  };
};

export const resolveDashboardVehicle = (reference, register) => {
  if (reference === null || reference === undefined || reference === "") return null;
  const lookup = register || buildDashboardVehicleRegister([]);
  const source = reference && typeof reference === "object" ? reference : {};
  const raw = typeof reference === "object" ? "" : text(reference);

  const idCandidates = [
    source.id,
    source.vehicleId,
    source.vehicleDocumentId,
    source.documentId,
    raw,
  ]
    .map(text)
    .filter(Boolean);
  for (const id of idCandidates) {
    if (lookup.byId?.[id]) return lookup.byId[id];
  }

  const registration = upper(
    source.registration || source.reg || source.registrationNumber || raw
  );
  const registrationMatch = uniqueMatch(lookup.byRegistration || {}, registration);
  if (registrationMatch) return registrationMatch;

  const name = lower(source.name || source.vehicleName || source.label || raw);
  const nameMatches = lookup.byName?.[name] || [];
  if (nameMatches.length === 1) return nameMatches[0];
  if (nameMatches.length > 1) return unresolvedVehicle(reference, "ambiguous-name");

  return unresolvedVehicle(reference, "not-found");
};

export const resolveDashboardVehicles = (references, register) => {
  const resolved = [];
  const seenIds = new Set();

  for (const reference of Array.isArray(references) ? references : []) {
    const vehicle = resolveDashboardVehicle(reference, register);
    if (!vehicle) continue;
    const id = text(vehicle.id);
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);
    resolved.push(vehicle);
  }

  return resolved;
};

export const resolveDashboardVehicleDisplays = (references, register) =>
  (Array.isArray(references) ? references : []).flatMap((reference) => {
    const resolved = resolveDashboardVehicle(reference, register);
    if (!resolved) return [];
    if (!reference || typeof reference !== "object") return [resolved];

    const sourceName = text(reference.name || reference.vehicleName || reference.label);
    const sourceRegistration = upper(
      reference.registration || reference.reg || reference.registrationNumber
    );
    const sourceManufacturer = text(reference.manufacturer);
    const sourceModel = text(reference.model);

    return [{
      ...resolved,
      ...(sourceName ? { name: sourceName } : {}),
      ...(sourceRegistration ? { registration: sourceRegistration } : {}),
      ...(sourceManufacturer ? { manufacturer: sourceManufacturer } : {}),
      ...(sourceModel ? { model: sourceModel } : {}),
    }];
  });
