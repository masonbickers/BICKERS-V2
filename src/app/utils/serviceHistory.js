import { mergeMaintenanceHistory } from "./inspectionHistory.js";

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
    const completedDate = dateOnly(
      record?.serviceDateOnly || record?.serviceDate || record?.serviceDateDisplay
    );
    return {
      completedDate,
      sortDate: completedDate,
      serviceRecordId: String(record?.id || "").trim(),
      provider: record?.signedBy || "",
      bookingRef: record?.serviceType || "",
      notes: record?.workSummary || record?.extraNotes || "",
      location: record?.registration || "",
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

  const seenDates = new Set();
  return [...structured, ...legacy]
    .filter((item) => {
      if (!item.completedDate || seenDates.has(item.completedDate)) return false;
      seenDates.add(item.completedDate);
      return true;
    })
    .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")));
};
