"use client";

import { getDocs } from "firebase/firestore";
import { tenantCollectionQuery } from "@/app/utils/firestoreAccess";

const LEGACY_HOLIDAY_CACHE_KEY = "booking-availability-legacy-holidays:v1";
const LEGACY_HOLIDAY_TTL_MS = 30 * 60 * 1000;

let legacyHolidayPromise = null;
let legacyHolidayPromiseKey = "";
let legacyHolidayCache = null;
let legacyHolidayCacheKey = "";

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

const cacheKeyForAccess = (baseKey, accessState) => {
  const companyId = String(accessState?.userDoc?.companyId || "").trim() || "platform";
  const uid = String(accessState?.user?.uid || "").trim() || "anonymous";
  return `${baseKey}:${companyId}:${uid}`;
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

const matchesFieldConstraint = (row, fieldName, operator, values) => {
  const keys = new Set(uniqueDateKeys(values));
  if (!keys.size) return false;
  const value = row?.[fieldName];

  if (fieldName === "bookingDates" && operator === "array-contains-any") {
    const matchFromArray = Array.isArray(value) && value.some((item) => keys.has(normaliseDateKey(item)));
    if (matchFromArray) return true;

    const asDate = (raw) => {
      if (!raw) return "";
      if (typeof raw?.toDate === "function") {
        const d = raw.toDate();
        if (Number.isNaN(d.getTime())) return "";
        return d.toISOString().slice(0, 10);
      }
      if (typeof raw === "string") return raw.slice(0, 10);
      if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? "" : raw.toISOString().slice(0, 10);
      return "";
    };

    const date = normaliseDateKey(row.date);
    if (date && keys.has(date)) return true;

    const start = normaliseDateKey(asDate(row.startDate || row.date));
    const end = normaliseDateKey(asDate(row.endDate || row.startDate || row.date));
    if (!start || !end) return false;

    const toMs = (key) => {
      const [year, month, day] = String(key).split("-").map(Number);
      if (!year || !month || !day) return NaN;
      return Date.UTC(year, month - 1, day);
    };

    const startMs = toMs(start);
    const endMs = toMs(end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;

    const rangeStart = Math.min(startMs, endMs);
    const rangeEnd = Math.max(startMs, endMs);

    return Array.from(keys).some((key) => {
      const dayMs = toMs(key);
      if (Number.isNaN(dayMs)) return false;
      return dayMs >= rangeStart && dayMs <= rangeEnd;
    });
  }

  if (operator === "array-contains-any") {
    return Array.isArray(value) && value.some((item) => keys.has(normaliseDateKey(item)));
  }

  if (operator === "in") {
    return keys.has(normaliseDateKey(value));
  }

  return false;
};

const queryByChunks = async (db, collectionName, fieldName, operator, values, { accessState } = {}) => {
  const keys = uniqueDateKeys(values);
  if (!keys.length) return [];

  const snap = await getDocs(tenantCollectionQuery(db, collectionName, accessState));
  const rows = snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((row) => matchesFieldConstraint(row, fieldName, operator, keys));
  return dedupeDocs(rows);
};

const readLegacyHolidayCache = (cacheKey) => {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(cacheKey) || "null");
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > LEGACY_HOLIDAY_TTL_MS) return null;
    return parsed.value || null;
  } catch {
    return null;
  }
};

const writeLegacyHolidayCache = (cacheKey, value) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      cacheKey,
      JSON.stringify({ savedAt: Date.now(), value })
    );
  } catch {
    // Cache is optional.
  }
};

const loadLegacyHolidays = async (db, { accessState } = {}) => {
  const scopedCacheKey = cacheKeyForAccess(LEGACY_HOLIDAY_CACHE_KEY, accessState);
  if (legacyHolidayCache && legacyHolidayCacheKey === scopedCacheKey) return legacyHolidayCache;
  const cached = readLegacyHolidayCache(scopedCacheKey);
  if (cached) {
    legacyHolidayCache = cached;
    legacyHolidayCacheKey = scopedCacheKey;
    return cached;
  }
  if (legacyHolidayPromise && legacyHolidayPromiseKey === scopedCacheKey) return legacyHolidayPromise;

  legacyHolidayPromiseKey = scopedCacheKey;
  legacyHolidayPromise = getDocs(tenantCollectionQuery(db, "holidays", accessState))
    .then((snap) => {
      const value = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((row) => !Array.isArray(row.holidayDateKeys) || row.holidayDateKeys.length === 0);
      legacyHolidayCache = value;
      legacyHolidayCacheKey = scopedCacheKey;
      writeLegacyHolidayCache(scopedCacheKey, value);
      return value;
    })
    .finally(() => {
      legacyHolidayPromise = null;
      legacyHolidayPromiseKey = "";
    });

  return legacyHolidayPromise;
};

export const loadBookingAvailabilityForDates = async (
  db,
  selectedDates,
  { accessState, currentBookingId = "" } = {}
) => {
  const dateKeys = uniqueDateKeys(selectedDates);
  if (!dateKeys.length) {
    return { bookings: [], holidays: [], unavailableNotes: [], maintenanceBookings: [] };
  }

  const startedAt = nowMs();
  const [bookings, scopedHolidays, notes, maintenanceBookings, legacyHolidays] = await Promise.all([
    queryByChunks(db, "bookings", "bookingDates", "array-contains-any", dateKeys, { accessState }),
    queryByChunks(db, "holidays", "holidayDateKeys", "array-contains-any", dateKeys, { accessState }).catch((err) => {
      console.warn("[availability] holidayDateKeys query failed:", err);
      return [];
    }),
    queryByChunks(db, "notes", "date", "in", dateKeys, { accessState }),
    queryByChunks(db, "maintenanceBookings", "bookingDates", "array-contains-any", dateKeys, { accessState }),
    loadLegacyHolidays(db, { accessState }).catch((err) => {
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

export const loadVehicleChecksForVehicles = async (db, vehicleIds = [], { accessState } = {}) => {
  const ids = Array.from(new Set((vehicleIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) return [];

  const allowedIds = new Set(ids);
  const snap = await getDocs(tenantCollectionQuery(db, "vehicleChecks", accessState));
  const rows = snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((row) => allowedIds.has(String(row.vehicleId || "").trim()));
  return dedupeDocs(rows);
};
