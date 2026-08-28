export const PREP_STORAGE_KEYS = [
  "preplist:vehicle-checks:v2",
  "preplist:vehicle-checks:v4",
];

const identityPart = (value, fallback) =>
  encodeURIComponent(String(value || "").trim() || fallback);

export function buildVehiclePrepRecordId(bookingId, vehicleId) {
  return `job_${identityPart(bookingId, "unknown-job")}__vehicle_${identityPart(
    vehicleId,
    "unknown-vehicle"
  )}`;
}

export function buildEquipmentPrepRecordId(bookingId, equipmentId) {
  return `job_${identityPart(bookingId, "unknown-job")}__equipment_${identityPart(
    equipmentId,
    "unknown-equipment"
  )}`;
}

const toDateSafe = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toYmd = (value) => {
  const date = toDateSafe(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function mergePrepRecordSources(...sources) {
  return sources.reduce((merged, source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) return merged;
    return { ...merged, ...source };
  }, {});
}

export function indexAppVehiclePrepRecords(records) {
  if (!Array.isArray(records)) return {};

  return records.reduce((indexed, record, index) => {
    if (!record || typeof record !== "object") return indexed;
    const key = String(record.id || `app-record-${index}`).trim();
    return key ? { ...indexed, [`app::${key}`]: record } : indexed;
  }, {});
}

const normalizedVehicleKeys = (vehicle) => {
  const values =
    vehicle && typeof vehicle === "object"
      ? [
          vehicle.id,
          vehicle.vehicleId,
          vehicle.registration,
          vehicle.reg,
          vehicle.plate,
          vehicle.name,
        ]
      : [vehicle];

  return new Set(
    values
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
};

const normalizedEquipmentKeys = (equipment) => {
  const values =
    equipment && typeof equipment === "object"
      ? [
          equipment.id,
          equipment.equipmentId,
          equipment.name,
          equipment.label,
          equipment.description,
        ]
      : [equipment];

  return new Set(
    values
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
};

export function getVehiclePrepRecord(records, event, vehicleIndex) {
  if (!records || typeof records !== "object" || !event) return null;

  const bookingId = String(event.__bookingId || event.id || "").trim();
  const outingYmd = toYmd(event.startDate || event.date || event.start);
  if (!bookingId || !outingYmd || !Number.isInteger(vehicleIndex)) return null;

  const vehicleKeys = normalizedVehicleKeys(event.vehicles?.[vehicleIndex]);
  const appRecord = Object.values(records).find((record) => {
    if (!record || typeof record !== "object") return false;
    if (String(record.bookingId || "").trim() !== bookingId) return false;
    const recordVehicleKeys = normalizedVehicleKeys({
      id: record.vehicleId,
      registration: record.registration,
      name: record.vehicleName,
    });
    const sameVehicle = [...recordVehicleKeys].some((key) => vehicleKeys.has(key));
    const prepDate = toYmd(record.prepDate || record.date);
    return sameVehicle && (!prepDate || prepDate === outingYmd);
  });

  if (appRecord) return appRecord;

  const prefix = `${bookingId}::${vehicleIndex}::`;
  const suffix = `::${outingYmd}`;
  const matchingKey = Object.keys(records).find(
    (key) => key.startsWith(prefix) && key.endsWith(suffix)
  );

  return matchingKey ? records[matchingKey] || null : null;
}

export function isVehiclePrepped(records, event, vehicleIndex) {
  const record = getVehiclePrepRecord(records, event, vehicleIndex);
  return Boolean(record?.completed && !record?.removed);
}

export function getEquipmentPrepRecord(records, event, equipmentIndex) {
  if (!records || typeof records !== "object" || !event) return null;

  const bookingId = String(event.__bookingId || event.id || "").trim();
  const outingYmd = toYmd(event.startDate || event.date || event.start);
  if (!bookingId || !outingYmd || !Number.isInteger(equipmentIndex)) return null;

  const equipmentKeys = normalizedEquipmentKeys(event.equipment?.[equipmentIndex]);
  const appRecord = Object.values(records).find((record) => {
    if (!record || typeof record !== "object") return false;
    if (String(record.bookingId || "").trim() !== bookingId) return false;
    const recordEquipmentKeys = normalizedEquipmentKeys({
      id: record.equipmentId,
      name: record.equipmentName,
    });
    if (!recordEquipmentKeys.size) return false;
    const sameEquipment = [...recordEquipmentKeys].some((key) => equipmentKeys.has(key));
    const prepDate = toYmd(record.prepDate || record.date);
    return sameEquipment && (!prepDate || prepDate === outingYmd);
  });

  return appRecord || null;
}

export function isEquipmentPrepped(records, event, equipmentIndex) {
  const record = getEquipmentPrepRecord(records, event, equipmentIndex);
  return Boolean(record?.completed && !record?.removed);
}
