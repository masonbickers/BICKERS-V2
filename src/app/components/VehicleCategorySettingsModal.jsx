"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { db } from "../../../firebaseConfig";
import {
  DEFAULT_VEHICLE_COMPLIANCE_SETTINGS,
  normalizeVehicleCategoryColor,
  normalizeVehicleCategoryMeta,
  normalizeVehicleCategoryName,
  normalizeVehicleComplianceSettings,
  saveVehicleFleetSettings,
  uniqueVehicleCategoryNames,
} from "@/app/utils/vehicleCategorySettings";

const RETENTION_PLATE_CATEGORY = "Number Plates On Retention";

const UI = {
  radius: "var(--radius-md)",
  radiusSm: "var(--radius-md)",
  border: "var(--border-default)",
  bg: "var(--color-canvas)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  brand: "var(--color-brand)",
  brandBorder: "var(--color-brand-border)",
  danger: "var(--legacy-color-dc2626)",
  dangerSoft: "var(--color-danger-soft)",
  amberSoft: "var(--color-warning-soft)",
};

const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15,23,42,0.38)",
  display: "grid",
  placeItems: "center",
  padding: 18,
};

const modal = {
  width: "min(1040px, 100%)",
  maxHeight: "calc(100vh - 36px)",
  overflow: "auto",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: "0 24px 60px rgba(15,23,42,0.24)",
  color: UI.text,
};

const header = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  padding: 14,
  borderBottom: UI.border,
  background: UI.card,
};

const body = { padding: 14, display: "grid", gap: "var(--space-3)" };

const input = {
  width: "100%",
  minHeight: 34,
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: "var(--font-size-sm)",
  background: "var(--color-white)",
  color: UI.text,
};

const btn = (kind = "ghost") => {
  const primary = kind === "primary";
  const danger = kind === "danger";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 34,
    padding: "7px 10px",
    borderRadius: UI.radiusSm,
    border: danger ? `1px solid ${UI.danger}` : primary ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
    background: danger
      ? UI.danger
      : primary
      ? "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--color-brand) 100%)"
      : "linear-gradient(180deg, var(--color-white) 0%, var(--legacy-color-f8fbfe) 100%)",
    color: danger || primary ? "var(--color-white)" : UI.text,
    fontWeight: 850,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12.5,
  };
};

const iconButton = {
  ...btn("ghost"),
  width: 34,
  padding: 0,
};

const label = {
  fontSize: 11,
  color: UI.muted,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0,
  marginBottom: "var(--space-1)",
};

const norm = (value) => String(value || "").trim().toLowerCase();

const buildOrderedMeta = (categoryList, currentMeta = {}) =>
  uniqueVehicleCategoryNames(categoryList).reduce((acc, category, index) => {
    acc[category] = {
      ...(currentMeta[category] || {}),
      order: index,
      color: normalizeVehicleCategoryColor(currentMeta[category]?.color),
    };
    return acc;
  }, {});

const sortRowsByOrder = (a, b, meta) => {
  const aOrder = Number(meta[a.category]?.order);
  const bOrder = Number(meta[b.category]?.order);
  const aHasOrder = Number.isFinite(aOrder);
  const bHasOrder = Number.isFinite(bOrder);
  if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;
  return a.category.localeCompare(b.category);
};

export default function VehicleCategorySettingsModal({
  categories = [],
  settings = null,
  vehicles = [],
  onClose,
  onSaved,
}) {
  const baseCategories = useMemo(
    () => uniqueVehicleCategoryNames(settings?.categories?.length ? settings.categories : categories),
    [categories, settings?.categories]
  );
  const initialCategoryMeta = useMemo(
    () => normalizeVehicleCategoryMeta(baseCategories, settings?.categoryMeta || {}),
    [baseCategories, settings?.categoryMeta]
  );
  const initialCompliance = useMemo(
    () => normalizeVehicleComplianceSettings(settings?.compliance || DEFAULT_VEHICLE_COMPLIANCE_SETTINGS),
    [settings?.compliance]
  );

  const [newCategory, setNewCategory] = useState("");
  const [edits, setEdits] = useState({});
  const [categoryMeta, setCategoryMeta] = useState(initialCategoryMeta);
  const [compliance, setCompliance] = useState(initialCompliance);
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCategoryMeta(initialCategoryMeta);
  }, [initialCategoryMeta]);

  useEffect(() => {
    setCompliance(initialCompliance);
  }, [initialCompliance]);

  const rows = useMemo(() => {
    const usage = new Map();
    vehicles.forEach((vehicle) => {
      const name = normalizeVehicleCategoryName(vehicle?.category);
      if (!name) return;
      const key = norm(name);
      usage.set(key, (usage.get(key) || 0) + 1);
    });

    return baseCategories
      .map((category) => ({
        category,
        count: usage.get(norm(category)) || 0,
        protected: norm(category) === norm(RETENTION_PLATE_CATEGORY),
      }))
      .sort((a, b) => sortRowsByOrder(a, b, categoryMeta));
  }, [baseCategories, categoryMeta, vehicles]);

  const categoryExists = (value, except = "") => {
    const key = norm(value);
    const exceptKey = norm(except);
    return rows.some((row) => norm(row.category) === key && norm(row.category) !== exceptKey);
  };

  const saveSettings = async (nextCategories, nextMeta = categoryMeta, nextCompliance = compliance) => {
    const saved = await saveVehicleFleetSettings(db, {
      categories: nextCategories,
      categoryMeta: nextMeta,
      compliance: nextCompliance,
    });
    setCategoryMeta(saved.categoryMeta);
    setCompliance(saved.compliance);
    onSaved?.(saved);
    return saved;
  };

  const handleAdd = async () => {
    const clean = normalizeVehicleCategoryName(newCategory);
    if (!clean) {
      setMessage("Enter a category name first.");
      return;
    }
    if (categoryExists(clean)) {
      setMessage("That category already exists.");
      return;
    }

    const nextCategories = [...baseCategories, clean];
    const nextMeta = buildOrderedMeta(nextCategories, {
      ...categoryMeta,
      [clean]: { order: nextCategories.length - 1, color: "" },
    });

    setSavingKey("add");
    setMessage("");
    try {
      await saveSettings(nextCategories, nextMeta);
      setNewCategory("");
      setMessage("Category added.");
    } catch (error) {
      console.error("Failed to add vehicle category:", error);
      setMessage(error?.code === "permission-denied" ? "Permission denied. Only admins can manage vehicle categories." : "Could not add category.");
    } finally {
      setSavingKey("");
    }
  };

  const handleSaveRow = async (oldCategory) => {
    const clean = normalizeVehicleCategoryName(edits[oldCategory] ?? oldCategory);
    if (!clean) {
      setMessage("Enter the category name first.");
      return;
    }
    if (norm(oldCategory) === norm(RETENTION_PLATE_CATEGORY) && norm(clean) !== norm(oldCategory)) {
      setMessage("Retention plate category cannot be renamed.");
      return;
    }
    if (categoryExists(clean, oldCategory)) {
      setMessage("Another category already uses that name.");
      return;
    }

    const affected = vehicles.filter((vehicle) => norm(vehicle?.category) === norm(oldCategory));
    const nextCategories = baseCategories.map((category) => (norm(category) === norm(oldCategory) ? clean : category));
    const nextMeta = { ...categoryMeta };
    nextMeta[clean] = {
      ...(categoryMeta[oldCategory] || {}),
      color: normalizeVehicleCategoryColor(categoryMeta[oldCategory]?.color),
    };
    if (norm(clean) !== norm(oldCategory)) delete nextMeta[oldCategory];
    const orderedMeta = buildOrderedMeta(nextCategories, nextMeta);

    setSavingKey(`save:${oldCategory}`);
    setMessage("");
    try {
      if (norm(clean) !== norm(oldCategory)) {
        await Promise.all(
          affected.map((vehicle) => updateDoc(doc(db, "vehicles", vehicle.id), { category: clean }))
        );
      }
      await saveSettings(nextCategories, orderedMeta);
      setEdits((current) => ({ ...current, [oldCategory]: clean }));
      setMessage(norm(clean) === norm(oldCategory) ? "Category settings saved." : `Renamed ${oldCategory} to ${clean}.`);
    } catch (error) {
      console.error("Failed to save vehicle category:", error);
      setMessage(error?.code === "permission-denied" ? "Permission denied. This user cannot save category settings." : "Could not save category.");
    } finally {
      setSavingKey("");
    }
  };

  const handleMove = async (category, direction) => {
    const ordered = rows.map((row) => row.category);
    const index = ordered.findIndex((item) => norm(item) === norm(category));
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;

    const nextCategories = [...ordered];
    [nextCategories[index], nextCategories[nextIndex]] = [nextCategories[nextIndex], nextCategories[index]];
    const nextMeta = buildOrderedMeta(nextCategories, categoryMeta);

    setSavingKey(`move:${category}`);
    setMessage("");
    try {
      await saveSettings(nextCategories, nextMeta);
      setMessage("Display order saved.");
    } catch (error) {
      console.error("Failed to save vehicle category order:", error);
      setMessage(error?.code === "permission-denied" ? "Permission denied. Only admins can manage vehicle categories." : "Could not save display order.");
    } finally {
      setSavingKey("");
    }
  };

  const handleColorChange = (category, value) => {
    setCategoryMeta((current) => ({
      ...current,
      [category]: {
        ...(current[category] || {}),
        color: normalizeVehicleCategoryColor(value),
      },
    }));
  };

  const handleRemove = async (category) => {
    const row = rows.find((item) => norm(item.category) === norm(category));
    if (!row) return;
    if (row.protected) {
      setMessage("Retention plate category cannot be removed.");
      return;
    }
    if (row.count > 0) {
      setMessage(`Cannot remove ${category}; it is used by ${row.count} vehicle${row.count === 1 ? "" : "s"}. Rename it instead, or reassign those vehicles first.`);
      return;
    }

    const nextCategories = baseCategories.filter((item) => norm(item) !== norm(category));
    const nextMeta = { ...categoryMeta };
    delete nextMeta[category];

    setSavingKey(`remove:${category}`);
    setMessage("");
    try {
      await saveSettings(nextCategories, buildOrderedMeta(nextCategories, nextMeta));
      setMessage("Category removed.");
    } catch (error) {
      console.error("Failed to remove vehicle category:", error);
      setMessage(error?.code === "permission-denied" ? "Permission denied. Only admins can manage vehicle categories." : "Could not remove category.");
    } finally {
      setSavingKey("");
    }
  };

  const handleComplianceChange = (field, value) => {
    const numeric = value === "" ? "" : String(value).replace(/[^\d]/g, "");
    setCompliance((current) => ({ ...current, [field]: numeric }));
  };

  const handleSaveCompliance = async () => {
    const normalized = normalizeVehicleComplianceSettings(compliance);
    setSavingKey("compliance");
    setMessage("");
    try {
      await saveSettings(baseCategories, buildOrderedMeta(baseCategories, categoryMeta), normalized);
      setMessage("Compliance settings saved.");
    } catch (error) {
      console.error("Failed to save vehicle compliance settings:", error);
      setMessage(error?.code === "permission-denied" ? "Permission denied. Only admins can save compliance settings." : "Could not save compliance settings.");
    } finally {
      setSavingKey("");
    }
  };

  const complianceFields = [
    ["insuranceWarningDays", "Insurance warning days"],
    ["taxRflWarningDays", "Tax/RFL warning days"],
    ["retentionPlateWarningDays", "Retention plate warning days"],
    ["tradePlateWarningDays", "Trade plate warning days"],
    ["tradePlateExpiryWeeks", "Trade plate expiry default weeks"],
  ];

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Fleet settings">
      <div style={modal}>
        <div style={header}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Fleet settings</h2>
            <div style={{ marginTop: "var(--space-1)", color: UI.muted, fontSize: "var(--font-size-sm)" }}>
              Manage category names, display order, list colours, and compliance defaults.
            </div>
          </div>
          <button type="button" style={btn("ghost")} onClick={onClose}>
            <X size={15} />
            Close
          </button>
        </div>

        <div style={body}>
          <section style={{ border: UI.border, borderRadius: UI.radius, padding: "var(--space-3)", background: UI.bg }}>
            <div style={label}>Add category</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "var(--space-2)" }}>
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAdd();
                }}
                style={input}
                placeholder="e.g. Tracking Vehicles"
              />
              <button type="button" style={btn("primary")} onClick={handleAdd} disabled={savingKey === "add"}>
                <Plus size={15} />
                Add
              </button>
            </div>
          </section>

          {message ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--space-2)",
                padding: "9px 10px",
                borderRadius: UI.radius,
                border: UI.border,
                background: message.includes("Cannot") || message.includes("Permission") || message.includes("Could not") ? UI.dangerSoft : UI.amberSoft,
                color: UI.text,
                fontSize: "var(--font-size-sm)",
                fontWeight: 800,
              }}
            >
              <AlertTriangle size={15} />
              <span>{message}</span>
            </div>
          ) : null}

          <section style={{ border: UI.border, borderRadius: UI.radius, overflowX: "auto", overflowY: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "88px minmax(170px, 0.9fr) 76px 92px minmax(220px, 1fr) auto auto",
                gap: "var(--space-2)",
                alignItems: "center",
                minWidth: 930,
                padding: "8px 10px",
                background: "var(--legacy-color-f6f8fb)",
                color: UI.muted,
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
              }}
            >
              <span>Order</span>
              <span>Category</span>
              <span>Vehicles</span>
              <span>Colour</span>
              <span>Rename</span>
              <span>Save</span>
              <span>Remove</span>
            </div>

            {rows.length ? (
              rows.map((row, index) => {
                const renameValue = edits[row.category] ?? row.category;
                const color = normalizeVehicleCategoryColor(categoryMeta[row.category]?.color) || "var(--color-brand)";
                return (
                  <div
                    key={row.category}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "88px minmax(170px, 0.9fr) 76px 92px minmax(220px, 1fr) auto auto",
                      gap: "var(--space-2)",
                      alignItems: "center",
                      minWidth: 930,
                      padding: "9px 10px",
                      borderTop: UI.border,
                    }}
                  >
                    <div style={{ display: "flex", gap: "var(--space-1)" }}>
                      <button
                        type="button"
                        style={iconButton}
                        onClick={() => handleMove(row.category, -1)}
                        disabled={index === 0 || savingKey === `move:${row.category}`}
                        title="Move up"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        style={iconButton}
                        onClick={() => handleMove(row.category, 1)}
                        disabled={index === rows.length - 1 || savingKey === `move:${row.category}`}
                        title="Move down"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontWeight: 850 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: UI.border }} />
                      <span>{row.category}</span>
                    </div>
                    <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>{row.count}</div>
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => handleColorChange(row.category, event.target.value)}
                      style={{ width: 48, height: 34, padding: 2, borderRadius: UI.radiusSm, border: UI.border, background: "var(--color-white)" }}
                      title="Category colour"
                    />
                    <input
                      value={renameValue}
                      onChange={(event) => setEdits((current) => ({ ...current, [row.category]: event.target.value }))}
                      style={input}
                      disabled={row.protected}
                    />
                    <button
                      type="button"
                      style={btn("ghost")}
                      onClick={() => handleSaveRow(row.category)}
                      disabled={savingKey === `save:${row.category}`}
                    >
                      <Save size={14} />
                      Save
                    </button>
                    <button
                      type="button"
                      style={btn("danger")}
                      onClick={() => handleRemove(row.category)}
                      disabled={row.protected || row.count > 0 || savingKey === `remove:${row.category}`}
                      title={row.count > 0 ? "Only unused categories can be removed" : ""}
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "var(--space-3)", color: UI.muted, fontSize: "var(--font-size-sm)" }}>No categories found yet.</div>
            )}
          </section>

          <section style={{ border: UI.border, borderRadius: UI.radius, padding: "var(--space-3)", background: UI.bg }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={label}>Compliance settings</div>
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>
                  Controls warning colours and trade plate default renewal frequency.
                </div>
              </div>
              <button type="button" style={btn("primary")} onClick={handleSaveCompliance} disabled={savingKey === "compliance"}>
                <Save size={14} />
                Save Compliance
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 10,
                marginTop: 10,
              }}
            >
              {complianceFields.map(([field, fieldLabel]) => (
                <div key={field}>
                  <label style={label}>{fieldLabel}</label>
                  <input
                    value={compliance[field] ?? ""}
                    onChange={(event) => handleComplianceChange(field, event.target.value)}
                    style={input}
                    inputMode="numeric"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
