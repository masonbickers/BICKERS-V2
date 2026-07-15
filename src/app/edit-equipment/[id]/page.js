// src/app/edit-equipment/[id]/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const BOOKING_REFERENCE_CACHE_PREFIX = "booking-form-reference-data:v1";

const clearBookingReferenceCache = () => {
  if (typeof window === "undefined") return;
  try {
    Object.keys(window.sessionStorage || {}).forEach((key) => {
      if (key.startsWith(BOOKING_REFERENCE_CACHE_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    });
  } catch {
    // Cache invalidation is best-effort.
  }
};

const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 6,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid var(--legacy-color-e5e7eb)",
  bg: "var(--color-surface-subtle)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-subtle)",
  brand: "var(--color-info)",
  red: "var(--legacy-color-dc2626)",
};

const pageWrap = { padding: "10px 18px 14px", background: UI.bg, minHeight: "100vh" };
const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 5,
  flexWrap: "wrap",
  marginBottom: 6,
};
const title = { margin: 0, fontSize: "var(--font-size-xl)", fontWeight: 950, letterSpacing: "-0.01em", color: UI.text };
const subtitle = { marginTop: 2, fontSize: "var(--font-size-xs)", color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const panel = { ...card, padding: "var(--space-2)" };
const sectionTitle = {
  margin: "0 0 5px",
  fontSize: 13.5,
  fontWeight: 950,
  color: UI.text,
  letterSpacing: ".01em",
};
const sectionMeta = { marginTop: -2, marginBottom: 5, fontSize: 11.5, color: UI.muted };

const grid = { display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 6 };
const col = (span) => ({ gridColumn: `span ${span}` });

const label = {
  display: "block",
  marginBottom: 2,
  fontSize: "var(--font-size-xs)",
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const input = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--legacy-color-e5e7eb)",
  fontSize: 12.5,
  background: "var(--color-white)",
  color: UI.text,
  outline: "none",
};

const textarea = { ...input, minHeight: 180, resize: "vertical", lineHeight: 1.35 };
const helpText = { marginTop: 6, fontSize: "var(--font-size-xs)", color: UI.muted };

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-1)",
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: "1px solid var(--legacy-color-d1d5db)",
      background: "var(--color-white)",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
    };
  }
  if (kind === "danger") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-1)",
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.red}`,
      background: UI.red,
      color: "var(--color-white)",
      fontWeight: 950,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-1)",
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "var(--color-white)",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
};

const parseLocalDateOnly = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const addWeeksToISO = (isoDate, weeks) => {
  const d = parseLocalDateOnly(isoDate);
  const w = Number(weeks || 0);
  if (!d || !w) return "";
  d.setDate(d.getDate() + w * 7);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const NEW_CATEGORY_OPTION = "__new_category__";

export default function EditEquipmentPage() {
  const router = useRouter();
  const { id } = useParams();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [equipment, setEquipment] = useState(null);
  const [existingCategories, setExistingCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState("");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "equipment", operation: "load equipment categories" });
      setExistingCategories([]);
      return;
    }
    const loadCats = async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "equipment", dataAccessState));
        const cats = snap.docs.map((d) => d.data()?.category).filter(Boolean);
        const unique = Array.from(new Set(cats)).sort((a, b) => String(a).localeCompare(String(b)));
        setExistingCategories(unique);
      } catch (e) {
        if (!handleFirestoreAccessError(e, { collectionName: "equipment", operation: "load equipment categories" })) {
          console.error("Load equipment categories failed:", e);
        }
      }
    };
    loadCats();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const fetchEquipment = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const refDoc = doc(db, "equipment", id);
        const snap = await getDoc(refDoc);
        if (snap.exists()) {
          const nextEquipment = { id: snap.id, ...snap.data() };
          setEquipment(nextEquipment);
          setInitialSnapshot(JSON.stringify(nextEquipment));
        } else {
          alert("Equipment not found.");
          router.push("/equipment");
        }
      } catch (e) {
        console.error("Fetch equipment failed:", e);
        alert("Failed to load equipment.");
      } finally {
        setLoading(false);
      }
    };
    fetchEquipment();
  }, [id, router]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "category") {
      if (value === NEW_CATEGORY_OPTION) {
        setIsCreatingCategory(true);
        setEquipment((prev) => ({ ...(prev || {}), category: newCategory.trim() }));
        return;
      }
      setIsCreatingCategory(false);
      setNewCategory("");
      setEquipment((prev) => ({ ...(prev || {}), category: value }));
      return;
    }

    const numeric = ["inspectionFrequency"];
    const nextValue =
      numeric.includes(name) ? (value === "" ? "" : String(value).replace(/[^\d]/g, "")) : value;

    setEquipment((prev) => ({ ...(prev || {}), [name]: nextValue }));
  };

  useEffect(() => {
    setEquipment((prev) => {
      if (!prev) return prev;
      const li = prev.lastInspection;
      const fq = prev.inspectionFrequency;
      if (!li || !fq) return prev;
      const calc = addWeeksToISO(li, fq);
      if (!calc || prev.nextInspection === calc) return prev;
      return { ...prev, nextInspection: calc };
    });
  }, [equipment?.lastInspection, equipment?.inspectionFrequency]);

  const canSave = useMemo(() => {
    if (!equipment) return false;
    return (equipment.name || "").trim() && (equipment.category || "").trim();
  }, [equipment]);

  const hasUnsavedChanges = useMemo(() => {
    if (!equipment || !initialSnapshot) return false;
    return JSON.stringify(equipment) !== initialSnapshot;
  }, [equipment, initialSnapshot]);

  const handleSave = async (options = {}) => {
    if (!equipment || !id || saving) return false;
    if (!canSave) {
      alert("Please fill Name and Category.");
      return false;
    }

    const { navigateOnSuccess = true } = options;

    setSaving(true);
    try {
      const refDoc = doc(db, "equipment", id);
      const { id: _ignore, ...rest } = equipment;

      const payload = {
        ...rest,
        name: (rest.name || "").trim(),
        category: (rest.category || "").trim(),
        serialNumber: (rest.serialNumber || "").trim(),
        asset: (rest.asset || "").trim(),
        location: (rest.location || "").trim(),
        status: rest.status || "Available",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(refDoc, tenantPayload(dataAccessState, payload));
      clearBookingReferenceCache();
      alert("Equipment updated.");
      setInitialSnapshot(JSON.stringify({ ...equipment, ...payload }));
      if (navigateOnSuccess) {
        router.push("/equipment");
        router.refresh?.();
      }
      return true;
    } catch (e) {
      console.error("Update equipment failed:", e);
      alert("Could not save changes.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || deleting) return;
    const ok = window.confirm("Are you sure you want to delete this equipment?");
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "equipment", id));
      alert("Equipment deleted.");
      router.push("/equipment");
      router.refresh?.();
    } catch (e) {
      console.error("Delete equipment failed:", e);
      alert("Failed to delete equipment.");
    } finally {
      setDeleting(false);
    }
  };

  useUnsavedChangesGuard({
    enabled: !loading,
    isDirty: hasUnsavedChanges && !saving && !deleting,
    onSave: () => handleSave({ navigateOnSuccess: false }),
  });

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={{ ...panel, color: UI.muted }}>Loading...</div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  if (!equipment) return null;

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={topBar}>
          <div>
            <h1 style={title}>Edit Equipment</h1>
            <div style={subtitle}>
              Edit details, inspection dates, and notes for{" "}
              <strong style={{ color: UI.text }}>{equipment.name || "Unnamed"}</strong>
              {equipment.asset ? (
                <>
                  {" "}
                  - Asset <strong style={{ color: UI.text }}>{equipment.asset}</strong>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button style={btn("ghost")} onClick={() => router.back()} disabled={saving || deleting}>
              Back
            </button>
            <button style={btn()} onClick={handleSave} disabled={!canSave || saving || deleting}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button style={btn("danger")} onClick={handleDelete} disabled={saving || deleting} title="Delete equipment">
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={panel}>
            <div>
              <h2 style={sectionTitle}>Equipment Information</h2>
              <div style={sectionMeta}>Core details used in the equipment overview and status tracking.</div>
            </div>

            <div style={grid}>
              <div style={col(4)}>
                <label style={label}>Name *</label>
                <input
                  name="name"
                  value={equipment.name || ""}
                  onChange={handleChange}
                  style={input}
                  placeholder="e.g., Monitor Kit"
                />
              </div>

              <div style={col(4)}>
                <label style={label}>Serial Number</label>
                <input
                  name="serialNumber"
                  value={equipment.serialNumber || ""}
                  onChange={handleChange}
                  style={input}
                />
              </div>

              <div style={col(4)}>
                <label style={label}>Category *</label>
                <select
                  name="category"
                  value={isCreatingCategory ? NEW_CATEGORY_OPTION : equipment.category || ""}
                  onChange={handleChange}
                  style={input}
                >
                  <option value="">Select category...</option>
                  {existingCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {equipment.category && !existingCategories.includes(equipment.category) ? (
                    <option value={equipment.category}>{equipment.category}</option>
                  ) : null}
                  <option value={NEW_CATEGORY_OPTION}>+ Add new category</option>
                </select>
                {isCreatingCategory ? (
                  <input
                    value={newCategory}
                    onChange={(e) => {
                      const next = e.target.value;
                      setNewCategory(next);
                      setEquipment((prev) => ({ ...(prev || {}), category: next }));
                    }}
                    style={{ ...input, marginTop: "var(--space-2)" }}
                    placeholder="Type new category name"
                    required
                  />
                ) : null}
                <div style={helpText}>Categories control grouping in Equipment Overview.</div>
              </div>

              <div style={col(3)}>
                <label style={label}>Status</label>
                <select name="status" value={equipment.status || "Available"} onChange={handleChange} style={input}>
                  <option value="Available">Available</option>
                  <option value="Not Available">Not Available</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Off-site">Off-site</option>
                </select>
              </div>

              <div style={col(3)}>
                <label style={label}>Asset No.</label>
                <input name="asset" value={equipment.asset || ""} onChange={handleChange} style={input} />
              </div>

              <div style={col(6)}>
                <label style={label}>Location</label>
                <input
                  name="location"
                  value={equipment.location || ""}
                  onChange={handleChange}
                  style={input}
                  placeholder="e.g., Workshop / Truck 2"
                />
              </div>
            </div>
          </div>

          <div style={panel}>
            <div>
              <h2 style={sectionTitle}>Inspection</h2>
              <div style={sectionMeta}>Track the last inspection date and the next due date.</div>
            </div>

            <div style={grid}>
              <div style={col(4)}>
                <label style={label}>Last Inspection</label>
                <input
                  type="date"
                  name="lastInspection"
                  value={equipment.lastInspection || ""}
                  onChange={handleChange}
                  style={input}
                />
              </div>

              <div style={col(4)}>
                <label style={label}>Frequency (weeks)</label>
                <input
                  name="inspectionFrequency"
                  value={equipment.inspectionFrequency || ""}
                  onChange={handleChange}
                  style={input}
                  inputMode="numeric"
                  placeholder="e.g., 26"
                />
              </div>

              <div style={col(4)}>
                <label style={label}>Next Inspection Due</label>
                <input
                  type="date"
                  name="nextInspection"
                  value={equipment.nextInspection || ""}
                  onChange={handleChange}
                  style={input}
                />
                <div style={helpText}>Auto-calculates when Last Inspection + Frequency are set.</div>
              </div>
            </div>
          </div>

          <div style={panel}>
            <div>
              <h2 style={sectionTitle}>Notes</h2>
              <div style={sectionMeta}>Use this for usage notes, issues, missing parts, or inspection context.</div>
            </div>
            <textarea
              name="notes"
              value={equipment.notes || ""}
              onChange={handleChange}
              style={textarea}
              placeholder="Usage notes, missing parts, inspection notes, certificates..."
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button style={btn("ghost")} onClick={() => router.back()} disabled={saving || deleting}>
              Cancel
            </button>
            <button style={btn()} onClick={handleSave} disabled={!canSave || saving || deleting}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        input:focus,
        select:focus,
        textarea:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29, 78, 216, 0.14);
          border-color: var(--color-info-border) !important;
        }
        select option {
          background: var(--color-white);
          color: var(--color-text);
        }
        input:disabled,
        select:disabled,
        textarea:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}
