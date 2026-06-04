"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export const VEHICLE_CATEGORY_SETTINGS_COLLECTION = "settings";
export const VEHICLE_CATEGORY_SETTINGS_DOC_ID = "vehicleCategories";

export const DEFAULT_VEHICLE_COMPLIANCE_SETTINGS = {
  insuranceWarningDays: 7,
  taxRflWarningDays: 21,
  retentionPlateWarningDays: 365,
  tradePlateWarningDays: 31,
  tradePlateExpiryWeeks: 52,
};

export const normalizeVehicleCategoryName = (value) => String(value || "").trim();

export const uniqueVehicleCategoryNames = (values = []) => {
  const seen = new Set();
  const out = [];

  values.forEach((value) => {
    const clean = normalizeVehicleCategoryName(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  });

  return out;
};

export const normalizeVehicleCategoryColor = (value) => {
  const clean = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean.toLowerCase() : "";
};

const normalizePositiveInteger = (value, fallback, max = 3650) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(max, Math.round(numeric)));
};

export const normalizeVehicleComplianceSettings = (settings = {}) => ({
  insuranceWarningDays: normalizePositiveInteger(
    settings.insuranceWarningDays,
    DEFAULT_VEHICLE_COMPLIANCE_SETTINGS.insuranceWarningDays
  ),
  taxRflWarningDays: normalizePositiveInteger(
    settings.taxRflWarningDays,
    DEFAULT_VEHICLE_COMPLIANCE_SETTINGS.taxRflWarningDays
  ),
  retentionPlateWarningDays: normalizePositiveInteger(
    settings.retentionPlateWarningDays,
    DEFAULT_VEHICLE_COMPLIANCE_SETTINGS.retentionPlateWarningDays
  ),
  tradePlateWarningDays: normalizePositiveInteger(
    settings.tradePlateWarningDays,
    DEFAULT_VEHICLE_COMPLIANCE_SETTINGS.tradePlateWarningDays
  ),
  tradePlateExpiryWeeks: normalizePositiveInteger(
    settings.tradePlateExpiryWeeks,
    DEFAULT_VEHICLE_COMPLIANCE_SETTINGS.tradePlateExpiryWeeks
  ),
});

export const normalizeVehicleCategoryMeta = (categories = [], categoryMeta = {}) => {
  const meta = categoryMeta && typeof categoryMeta === "object" ? categoryMeta : {};
  const lowerMeta = Object.entries(meta).reduce((acc, [key, value]) => {
    acc[String(key || "").trim().toLowerCase()] = value || {};
    return acc;
  }, {});

  return uniqueVehicleCategoryNames(categories).reduce((acc, category, index) => {
    const source = meta[category] || lowerMeta[category.toLowerCase()] || {};
    const order = normalizePositiveInteger(source.order, index, 9999);
    const color = normalizeVehicleCategoryColor(source.color);
    acc[category] = { order, color };
    return acc;
  }, {});
};

export const normalizeVehicleFleetSettings = (data = {}) => {
  const categories = uniqueVehicleCategoryNames(Array.isArray(data.categories) ? data.categories : []);
  return {
    categories,
    categoryMeta: normalizeVehicleCategoryMeta(categories, data.categoryMeta || {}),
    compliance: normalizeVehicleComplianceSettings(data.compliance || {}),
  };
};

export const vehicleCategorySettingsRef = (db) =>
  doc(db, VEHICLE_CATEGORY_SETTINGS_COLLECTION, VEHICLE_CATEGORY_SETTINGS_DOC_ID);

export const loadVehicleFleetSettings = async (db) => {
  const snap = await getDoc(vehicleCategorySettingsRef(db));
  if (!snap.exists()) return normalizeVehicleFleetSettings();
  return normalizeVehicleFleetSettings(snap.data() || {});
};

export const loadVehicleCategorySettings = async (db) => {
  const settings = await loadVehicleFleetSettings(db);
  return settings.categories;
};

export const saveVehicleFleetSettings = async (db, settings = {}) => {
  const cleanCategories = uniqueVehicleCategoryNames(settings.categories || []);
  const cleanSettings = {
    categories: cleanCategories,
    categoryMeta: normalizeVehicleCategoryMeta(cleanCategories, settings.categoryMeta || {}),
    compliance: normalizeVehicleComplianceSettings(settings.compliance || {}),
  };

  await setDoc(
    vehicleCategorySettingsRef(db),
    {
      ...cleanSettings,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return cleanSettings;
};

export const saveVehicleCategorySettings = async (db, categories = []) => {
  const cleanCategories = uniqueVehicleCategoryNames(categories);
  await setDoc(
    vehicleCategorySettingsRef(db),
    {
      categories: cleanCategories,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return cleanCategories;
};
