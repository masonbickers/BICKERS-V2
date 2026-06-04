"use client";

import { getDocs } from "firebase/firestore";
import { tenantCollectionQuery } from "@/app/utils/firestoreAccess";

const CACHE_KEY = "booking-form-reference-data:v1";
const CONTACTS_CACHE_KEY = "booking-form-saved-contacts:v2";
const CACHE_TTL_MS = 10 * 60 * 1000;

let referenceCache = null;
let referenceCacheKey = "";
let referencePromise = null;
let referencePromiseKey = "";
let contactsCache = null;
let contactsCacheKey = "";
let contactsPromise = null;
let contactsPromiseKey = "";

const cacheKeyForAccess = (baseKey, accessState) => {
  const companyId = String(accessState?.userDoc?.companyId || "").trim() || "platform";
  const uid = String(accessState?.user?.uid || "").trim() || "anonymous";
  return `${baseKey}:${companyId}:${uid}`;
};

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

const HIDDEN_VEHICLE_CATEGORY_GROUPS = new Set([
  "taurus",
  "number plates on retention",
  "number plate retention",
  "number plate retebtion",
]);

const readSessionCache = (key) => {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || "null");
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.value || null;
  } catch {
    return null;
  }
};

const writeSessionCache = (key, value) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Ignore storage failures; memory cache still helps during this tab session.
  }
};

const vehicleCategoryGroup = (vehicle = {}) =>
  String(vehicle.category || "").trim() || "Uncategorised";

const shouldShowVehicleCategory = (group) =>
  !HIDDEN_VEHICLE_CATEGORY_GROUPS.has(String(group || "").trim().toLowerCase());

const sortVehicleGroupEntries = (groups) =>
  Object.fromEntries(
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, list]) => [
        group,
        [...list].sort((a, b) =>
          String(a.name || a.registration || "").localeCompare(String(b.name || b.registration || ""))
        ),
      ])
  );

const buildReferenceData = ({ empSnap, vehicleSnap, equipSnap }) => {
  const allEmployees = empSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (emp) =>
        emp.archived !== true &&
        emp.isArchived !== true &&
        emp.active !== false &&
        emp.appDisabled !== true
    );

  const employeeList = allEmployees
    .filter((emp) => {
      const titles = Array.isArray(emp.jobTitle) ? emp.jobTitle : [emp.jobTitle];
      return titles.some((t) => {
        const title = String(t || "").trim().toLowerCase();
        return title === "driver" || title === "precision driver" || title.includes("driver");
      });
    })
    .map((emp) => ({ id: emp.id, name: emp.name || emp.fullName || emp.id }));

  const freelancerList = allEmployees
    .filter((emp) => {
      const titles = Array.isArray(emp.jobTitle) ? emp.jobTitle : [emp.jobTitle];
      return titles.some((t) => {
        const val = String(t || "").toLowerCase();
        return val === "freelance" || val === "freelancer";
      });
    })
    .map((emp) => ({ id: emp.id, name: emp.name || emp.fullName || emp.id }));

  const nameToCode = {};
  for (const emp of allEmployees) {
    const nm = String(emp.name || emp.fullName || "").trim().toLowerCase();
    const code = String(emp.userCode || "").trim();
    if (nm && code) nameToCode[nm] = code;
  }

  const vehicleGroups = {};
  const byId = {};
  const byReg = {};
  const byName = {};

  vehicleSnap.docs.forEach((docSnap) => {
    const v = docSnap.data() || {};
    const id = docSnap.id;
    const name = String(v.name || "").trim();
    const registration = String(v.registration || "").trim();
    if (!name && !registration) return;

    const group = vehicleCategoryGroup(v);
    const info = { id, name, registration, group, ...v };

    if (id) byId[id] = info;
    if (registration) byReg[registration.toUpperCase()] = info;
    if (name) byName[name.toLowerCase()] = info;

    if (shouldShowVehicleCategory(group)) {
      if (!vehicleGroups[group]) vehicleGroups[group] = [];
      vehicleGroups[group].push(info);
    }
  });

  const equipmentGroups = {};
  equipSnap.docs.forEach((docSnap) => {
    const e = docSnap.data() || {};
    const category = String(e.category || "Other").trim() || "Other";
    const name = String(e.name || e.label || "").trim();
    if (!name) return;
    if (!equipmentGroups[category]) equipmentGroups[category] = [];
    equipmentGroups[category].push(name);
  });

  Object.keys(equipmentGroups).forEach((category) => {
    equipmentGroups[category].sort((a, b) => a.localeCompare(b));
  });

  const openEquipGroups = {};
  Object.keys(equipmentGroups).forEach((category) => {
    openEquipGroups[category] = false;
  });

  return {
    allEmployees,
    employeeList,
    freelancerList,
    nameToCode,
    vehicleGroups: sortVehicleGroupEntries(vehicleGroups),
    vehicleLookup: { byId, byReg, byName },
    equipmentGroups,
    openEquipGroups,
  };
};

export const loadBookingFormReferenceData = async (db, { accessState, force = false } = {}) => {
  const scopedCacheKey = cacheKeyForAccess(CACHE_KEY, accessState);
  if (!force && referenceCache && referenceCacheKey === scopedCacheKey) {
    debugBookingLoads("reference data cache hit");
    return referenceCache;
  }
  if (!force) {
    const sessionValue = readSessionCache(scopedCacheKey);
    if (sessionValue) {
      referenceCache = sessionValue;
      debugBookingLoads("reference data session cache hit");
      return sessionValue;
    }
    if (referencePromise && referencePromiseKey === scopedCacheKey) return referencePromise;
  }

  const startedAt = nowMs();
  referencePromiseKey = scopedCacheKey;
  referencePromise = Promise.all([
    getDocs(tenantCollectionQuery(db, "employees", accessState)),
    getDocs(tenantCollectionQuery(db, "vehicles", accessState)),
    getDocs(tenantCollectionQuery(db, "equipment", accessState)),
  ])
    .then(([empSnap, vehicleSnap, equipSnap]) => {
      const value = buildReferenceData({ empSnap, vehicleSnap, equipSnap });
      referenceCache = value;
      referenceCacheKey = scopedCacheKey;
      writeSessionCache(scopedCacheKey, value);
      debugBookingLoads("reference data loaded", Math.round(nowMs() - startedAt), "ms");
      return value;
    })
    .finally(() => {
      referencePromise = null;
      referencePromiseKey = "";
    });

  return referencePromise;
};

export const loadSavedContacts = async (db, { accessState, force = false } = {}) => {
  const scopedCacheKey = CONTACTS_CACHE_KEY;
  if (!force && contactsCache && contactsCacheKey === scopedCacheKey) {
    debugBookingLoads("saved contacts cache hit");
    return contactsCache;
  }
  if (!force) {
    const sessionValue = readSessionCache(scopedCacheKey);
    if (sessionValue) {
      contactsCache = sessionValue;
      debugBookingLoads("saved contacts session cache hit");
      return sessionValue;
    }
    if (contactsPromise && contactsPromiseKey === scopedCacheKey) return contactsPromise;
  }

  const startedAt = nowMs();
  contactsPromiseKey = scopedCacheKey;
  contactsPromise = getDocs(tenantCollectionQuery(db, "contacts", accessState))
    .then((snap) => {
      const value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      contactsCache = value;
      contactsCacheKey = scopedCacheKey;
      writeSessionCache(scopedCacheKey, value);
      debugBookingLoads("saved contacts loaded", value.length, "contacts", Math.round(nowMs() - startedAt), "ms");
      return value;
    })
    .finally(() => {
      contactsPromise = null;
      contactsPromiseKey = "";
    });

  return contactsPromise;
};
