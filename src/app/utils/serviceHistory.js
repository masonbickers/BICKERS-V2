import { mergeMaintenanceHistory } from "./inspectionHistory.js";
import { getServiceRecordPresentation } from "./servicePresentation.js";

const dateOnly = (value) => {
  if (!value) return "";
  if (typeof value?.toDate === "function") return dateOnly(value.toDate());
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const ukDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ukDate) return `${ukDate[3]}-${ukDate[2]}-${ukDate[1]}`;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

const isCoreServiceRecord = (record = {}) => {
  if (String(record?.maintenanceTypeId || "").trim().toLowerCase() === "service") return true;
  return /\bservice\b/i.test(
    [record?.serviceType, record?.title, record?.bookingRef].filter(Boolean).join(" ")
  );
};

export const resolveLatestCoreServiceCompletionDate = ({
  vehicle = {},
  serviceRecords = [],
} = {}) => {
  const candidates = [
    dateOnly(vehicle?.lastService || vehicle?.lastServiceDate),
    ...(Array.isArray(vehicle?.serviceHistory) ? vehicle.serviceHistory : []).map((item) =>
      dateOnly(item?.completedDate || item?.sortDate)
    ),
    ...(Array.isArray(serviceRecords) ? serviceRecords : [])
      .filter(isCoreServiceRecord)
      .map((record) => dateOnly(record?.serviceDateOnly || record?.serviceDate || record?.completedDate || record?.completedAt)),
  ].filter(Boolean);

  return candidates.sort((a, b) => b.localeCompare(a))[0] || "";
};

export const ensureServiceHistoryForLastService = (
  history,
  lastService,
  { recordedAt = "" } = {}
) => {
  const completedDate = dateOnly(lastService);
  const existing = Array.isArray(history) ? history.filter(Boolean) : [];
  if (!completedDate) return existing;
  if (existing.some((item) => dateOnly(item?.completedDate || item?.sortDate) === completedDate)) {
    return existing;
  }

  return mergeMaintenanceHistory(existing, {
    completedDate,
    bookingRef: "Recorded service date",
    notes: "Recorded from the vehicle Last Service field; no linked service completion record.",
    recordedAt,
  });
};

export const buildServiceHistoryItems = ({
  vehicle = {},
  serviceRecords = [],
} = {}) => {
  const stored = ensureServiceHistoryForLastService(
    vehicle?.serviceHistory,
    vehicle?.lastService || vehicle?.lastServiceDate
  );
  const structured = (Array.isArray(serviceRecords) ? serviceRecords : []).map((record) => {
    const presentation = getServiceRecordPresentation(record);
    const completedDate = presentation.dateOnly;
    return {
      completedDate,
      sortDate: completedDate,
      serviceRecordId: String(record?.id || "").trim(),
      serviceType: presentation.serviceType,
      title: presentation.title,
      provider: presentation.provider,
      bookingRef: presentation.bookingRef,
      notes: record?.workSummary || record?.extraNotes || "",
      location: presentation.location,
      odometer: record?.odometer || "",
      partsUsed: record?.partsUsed || "",
      cost: "",
      sourceLabel: "Service record",
    };
  });
  const legacy = stored.map((item) => {
    const completedDate = dateOnly(item?.completedDate || item?.sortDate);
    return {
      ...item,
      completedDate,
      sortDate: completedDate,
      maintenanceBookingId: String(item?.bookingId || "").trim(),
      sourceLabel: item?.bookingId ? "Completed service booking" : "Vehicle service date",
    };
  });

  const structuredDates = new Set(structured.map((item) => item.completedDate).filter(Boolean));
  const seenLegacyKeys = new Set();
  const uniqueLegacy = legacy.filter((item) => {
    if (!item.completedDate || structuredDates.has(item.completedDate)) return false;
    const key = item.maintenanceBookingId || item.serviceRecordId || [
      item.completedDate,
      item.bookingRef,
      item.provider,
      item.notes,
    ].join("|");
    if (seenLegacyKeys.has(key)) return false;
    seenLegacyKeys.add(key);
    return true;
  });

  return [...structured.filter((item) => item.completedDate), ...uniqueLegacy]
    .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")));
};
