import { dateOnlyString, toDateLike } from "./serviceRecordCompat";

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeServiceHistory(history) {
  if (typeof history === "string" && history.trim()) {
    return [
      {
        completedDate: "",
        bookingId: null,
        serviceRecordId: "",
        provider: "",
        bookingRef: "",
        notes: history.trim(),
        recordedAt: "",
        location: "",
        odometer: null,
        partsUsed: "",
      },
    ];
  }

  return asArray(history).map((item) => ({
    ...item,
    completedDate:
      dateOnlyString(
        item?.completedDate ||
          item?.date ||
          item?.serviceDateOnly ||
          item?.serviceDate ||
          item?.createdAt
      ) || "",
    serviceRecordId: String(item?.serviceRecordId || "").trim(),
    provider: String(item?.provider || "").trim(),
    bookingRef: String(item?.bookingRef || item?.type || "").trim(),
    notes: String(item?.notes || item?.summary || "").trim(),
    recordedAt: item?.recordedAt || item?.date || "",
    location: String(item?.location || "").trim(),
    odometer: item?.odometer ?? item?.mileage ?? null,
    partsUsed: String(item?.partsUsed || "").trim(),
  }));
}

function normalizeDefects(defects) {
  return asArray(defects).map((item) => ({
    ...item,
    description: String(item?.description || "").trim(),
    severity: String(item?.severity || "").trim(),
    priority: String(item?.priority || "").trim(),
    offRoad: !!item?.offRoad,
    reportedBy: String(item?.reportedBy || "").trim(),
    notes: String(item?.notes || "").trim(),
    status: String(item?.status || "").trim() || "open",
    createdAt: item?.createdAt || "",
  }));
}

export function normalizeVehicleRecord(raw = {}) {
  const serviceDate = dateOnlyString(
    firstNonEmpty(raw.nextService, raw.nextServiceDate, raw.serviceDueDate, raw.nextSvc)
  );
  const motDate = dateOnlyString(
    firstNonEmpty(raw.nextMOT, raw.nextMot, raw.nextMotDate, raw.motDueDate, raw.motExpiryDate)
  );
  const lastService = dateOnlyString(firstNonEmpty(raw.lastService, raw.lastServiceDate));
  const lastMot = dateOnlyString(firstNonEmpty(raw.lastMOT, raw.lastMot, raw.lastMotDate));

  return {
    ...raw,
    name: String(firstNonEmpty(raw.name, raw.vehicleName) || "").trim(),
    vehicleName: String(firstNonEmpty(raw.vehicleName, raw.name) || "").trim(),
    registration: String(firstNonEmpty(raw.registration, raw.reg) || "").trim(),
    reg: String(firstNonEmpty(raw.reg, raw.registration) || "").trim(),
    lastService,
    nextService: serviceDate,
    nextServiceDate: serviceDate,
    lastMOT: lastMot,
    nextMOT: motDate,
    nextMot: motDate,
    nextMotDate: motDate,
    motPrecheckStatus: String(raw.motPrecheckStatus || "").trim(),
    motPrecheckDate: String(raw.motPrecheckDate || "").trim(),
    preChecksSummary: String(raw.preChecksSummary || "").trim(),
    preChecksNotes: String(raw.preChecksNotes || "").trim(),
    preChecks: raw.preChecks && typeof raw.preChecks === "object" ? raw.preChecks : {},
    preChecksFiles: asArray(raw.preChecksFiles),
    serviceHistoryFiles: asArray(raw.serviceHistoryFiles),
    defects: normalizeDefects(raw.defects),
    serviceHistory: normalizeServiceHistory(raw.serviceHistory),
    taxStatus: String(raw.taxStatus || "").trim(),
    insuranceStatus: String(raw.insuranceStatus || "").trim(),
    mileage: raw.mileage ?? null,
    __nextServiceDateObj: toDateLike(serviceDate),
    __nextMotDateObj: toDateLike(motDate),
  };
}
