export const PREP_STORAGE_KEYS = [
  "preplist:vehicle-checks:v2",
  "preplist:vehicle-checks:v4",
];

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

export function getVehiclePrepRecord(records, event, vehicleIndex) {
  if (!records || typeof records !== "object" || !event) return null;

  const bookingId = String(event.__bookingId || event.id || "").trim();
  const outingYmd = toYmd(event.startDate || event.date || event.start);
  if (!bookingId || !outingYmd || !Number.isInteger(vehicleIndex)) return null;

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
