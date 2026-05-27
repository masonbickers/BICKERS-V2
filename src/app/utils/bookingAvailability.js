"use client";

import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";

const MAX_IN_VALUES = 10;
const LEGACY_HOLIDAY_CACHE_KEY = "booking-availability-legacy-holidays:v1";
const LEGACY_HOLIDAY_TTL_MS = 30 * 60 * 1000;

let legacyHolidayPromise = null;
let legacyHolidayCache = null;

const debugBookingLoads = (...args) => {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem("debugBookingLoads") === "1") {
      console.log("[booking-load]", ...args);
    }
  } catch {
    // Debug logging is optional.
  }
};

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const chunk = (values, size = MAX_IN_VALUES) => {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

export const normaliseDateKey = (value) => String(value || "").slice(0, 10);

export const uniqueDateKeys = (values = []) =>
  Array.from(new Set((values || []).map(normaliseDateKey).filter(Boolean))).sort();

const dedupeDocs = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    if (row?.id) map.set(row.id, row);
  });
  return Array.from(map.values());
};

export const enumerateYmdRange = (start, end) => {
  const s = normaliseDateKey(start);
  const e = normaliseDateKey(end || start);
  if (!s || !e) return [];

  const parseUtcDate = (ymd) => {
    const [year, month, day] = ymd.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day));
  };

  const startDate = parseUtcDate(s);
  const endDate = parseUtcDate(e);
  if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];
  if (startDate > endDate) return [];

  const out = [];
  for (const cursor = new Date(startDate); cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    out.push(cursor.toISOString().slice(0, 10));
  }
  return out;
};

export const holidayDateKeysFromRange = (startDate, endDate) =>
  enumerateYmdRange(startDate, endDate || startDate);

export const holidayDateKeysFromRecord = (record = {}) => {
  if (Array.isArray(record.holidayDateKeys) && record.holidayDateKeys.length) {
    return uniqueDateKeys(record.holidayDateKeys);
  }

  const toYmd = (value) => {
    if (!value) return "";
    const dateToYmd = (date) => {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    if (typeof value?.toDate === "function") return dateToYmd(value.toDate());
    if (value instanceof Date) return dateToYmd(value);
    return normaliseDateKey(value);
  };

  return holidayDateKeysFromRange(toYmd(record.startDate), toYmd(record.endDate || record.startDate));
};

const queryByChunks = async (db, collectionName, fieldName, operator, values) => {
  const keys = uniqueDateKeys(values);
  if (!keys.length) return [];

  const rows = [];
  for (const part of chunk(keys)) {
    const snap = await getDocs(query(collection(db, collectionName), where(fieldName, operator, part)));
    snap.docs.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
  }
  return dedupeDocs(rows);
};

const readLegacyHolidayCache = () => {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(LEGACY_HOLIDAY_CACHE_KEY) || "null");
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > LEGACY_HOLIDAY_TTL_MS) return null;
    return parsed.value || null;
  } catch {
    return null;
  }
};

const writeLegacyHolidayCache = (value) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      LEGACY_HOLIDAY_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), value })
    );
  } catch {
    // Cache is optional.
  }
};

const backfillHolidayDateKeys = async (db, rows = []) => {
  const missing = (rows || [])
    .map((row) => ({ id: row.id, holidayDateKeys: holidayDateKeysFromRecord(row) }))
    .filter((row) => row.id && row.holidayDateKeys.length);
  if (!missing.length) return;

  for (const part of chunk(missing, 400)) {
    const batch = writeBatch(db);
    part.forEach((row) => {
      batch.update(doc(db, "holidays", row.id), { holidayDateKeys: row.holidayDateKeys });
    });
    await batch.commit();
  }

  debugBookingLoads("legacy holiday date keys backfilled", missing.length);
};

const loadLegacyHolidays = async (db) => {
  if (legacyHolidayCache) return legacyHolidayCache;
  const cached = readLegacyHolidayCache();
  if (cached) {
    legacyHolidayCache = cached;
    return cached;
  }
  if (legacyHolidayPromise) return legacyHolidayPromise;

  legacyHolidayPromise = getDocs(collection(db, "holidays"))
    .then((snap) => {
      const value = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((row) => !Array.isArray(row.holidayDateKeys) || row.holidayDateKeys.length === 0);
      legacyHolidayCache = value;
      writeLegacyHolidayCache(value);
      backfillHolidayDateKeys(db, value).catch((err) => {
        console.warn("[availability] legacy holiday backfill failed:", err);
      });
      return value;
    })
    .finally(() => {
      legacyHolidayPromise = null;
    });

  return legacyHolidayPromise;
};

export const loadBookingAvailabilityForDates = async (
  db,
  selectedDates,
  { currentBookingId = "" } = {}
) => {
  const dateKeys = uniqueDateKeys(selectedDates);
  if (!dateKeys.length) {
    return { bookings: [], holidays: [], unavailableNotes: [], maintenanceBookings: [] };
  }

  const startedAt = nowMs();
  const [bookings, scopedHolidays, notes, maintenanceBookings, legacyHolidays] = await Promise.all([
    queryByChunks(db, "bookings", "bookingDates", "array-contains-any", dateKeys),
    queryByChunks(db, "holidays", "holidayDateKeys", "array-contains-any", dateKeys).catch((err) => {
      console.warn("[availability] holidayDateKeys query failed:", err);
      return [];
    }),
    queryByChunks(db, "notes", "date", "in", dateKeys),
    queryByChunks(db, "maintenanceBookings", "bookingDates", "array-contains-any", dateKeys),
    loadLegacyHolidays(db).catch((err) => {
      console.warn("[availability] legacy holiday fallback failed:", err);
      return [];
    }),
  ]);

  const dateSet = new Set(dateKeys);
  const legacyMatches = legacyHolidays.filter((holiday) =>
    holidayDateKeysFromRecord(holiday).some((dateKey) => dateSet.has(dateKey))
  );

  const availability = {
    bookings: bookings.filter((booking) => !currentBookingId || booking.id !== currentBookingId),
    holidays: dedupeDocs([...scopedHolidays, ...legacyMatches]),
    unavailableNotes: notes.filter((note) => note.blocksEmployeeBooking === true),
    maintenanceBookings,
  };

  debugBookingLoads(
    "availability loaded",
    dateKeys.length,
    "date(s)",
    Math.round(nowMs() - startedAt),
    "ms"
  );

  return availability;
};

export const loadVehicleChecksForVehicles = async (db, vehicleIds = []) => {
  const ids = Array.from(new Set((vehicleIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) return [];

  const rows = [];
  for (const part of chunk(ids)) {
    const snap = await getDocs(query(collection(db, "vehicleChecks"), where("vehicleId", "in", part)));
    snap.docs.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
  }
  return dedupeDocs(rows);
};
