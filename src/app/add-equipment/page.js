// src/app/add-equipment/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────── Mini design system (match your newer pages) ───────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 16,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowMd: "0 10px 26px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
};

const shell = { minHeight: "100vh", background: UI.bg, color: UI.text };
const main = { flex: 1, padding: "24px 18px 40px", maxWidth: 1200, margin: "0 auto" };
const headerRow = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};
const h1 = { margin: 0, fontSize: 28, fontWeight: 950, letterSpacing: "-0.01em" };
const sub = { marginTop: 6, fontSize: 12.5, color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const sectionTitle = { margin: "0 0 10px", fontSize: 14, fontWeight: 950, color: UI.text };

const grid = { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 };
const col = (span) => ({ gridColumn: `span ${span}` });

const label = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};
const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
  outline: "none",
};
const textarea = { ...input, minHeight: 220, resize: "vertical" };
const helpText = { marginTop: 6, fontSize: 12, color: UI.muted };

const btn = (bg = "#fff", fg = UI.text, bd = "1px solid #e5e7eb") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: bd,
  background: bg,
  color: fg,
  fontWeight: 950,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
});

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

export default function AddEquipmentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [existingCategories, setExistingCategories] = useState([]);

  const [equipment, setEquipment] = useState({
    name: "",
    serialNumber: "",
    category: "",
    status: "Available",
    asset: "",
    location: "",
    lastInspection: "",
    inspectionFrequency: "",
    nextInspection: "",
    notes: "",
  });

  // Pull existing categories so it stays consistent with your overview grouping
  useEffect(() => {
    const loadCats = async () => {
      try {
        const snap = await getDocs(collection(db, "equipment"));
        const cats = snap.docs.map((d) => d.data()?.category).filter(Boolean);
        const unique = Array.from(new Set(cats)).sort((a, b) => String(a).localeCompare(String(b)));
        setExistingCategories(unique);
      } catch (e) {
        console.error("Load equipment categories failed:", e);
      }
    };
    loadCats();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    const numeric = ["inspectionFrequency"];
    const v = numeric.includes(name) ? (value === "" ? "" : String(value).replace(/[^\d]/g, "")) : value;

    setEquipment((prev) => ({ ...prev, [name]: v }));
  };

  // Auto-calc nextInspection
  useEffect(() => {
    if (equipment.lastInspection && equipment.inspectionFrequency) {
      const calc = addWeeksToISO(equipment.lastInspection, equipment.inspectionFrequency);
      if (calc && (!equipment.nextInspection || equipment.nextInspection === calc)) {
        setEquipment((p) => ({ ...p, nextInspection: calc }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment.lastInspection, equipment.inspectionFrequency]);

  const canSave = useMemo(() => {
    return equipment.name.trim() && equipment.category.trim();
  }, [equipment.name, equipment.category]);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!canSave || saving) return;

    setSaving(true);
    try {
      const payload = {
        name: equipment.name.trim(),
        serialNumber: (equipment.serialNumber || "").trim(),
        category: equipment.category.trim(),
        status: equipment.status || "Available",
        asset: (equipment.asset || "").trim(),
        location: (equipment.location || "").trim(),
        lastInspection: equipment.lastInspection || "",
        inspectionFrequency: equipment.inspectionFrequency || "",
        nextInspection: equipment.nextInspection || "",
        notes: equipment.notes || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "equipment"), payload);
      alert("✅ Equipment added.");
      router.push("/equipment");
      router.refresh?.();
    } catch (err) {
      console.error("Error saving equipment:", err);
      alert("❌ Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={shell}>
        <main style={main}>
          <div style={headerRow}>
            <div>
              <h1 style={h1}>Add Equipment</h1>
              <div style={sub}>Create a new equipment record. Next inspection can auto-calc from last date + frequency.</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={btn("#fff", UI.text)} onClick={() => router.back()}>
                ← Cancel
              </button>
              <button
                style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                onClick={handleSave}
                disabled={!canSave || saving}
                title={!canSave ? "Fill Name and Category" : ""}
              >
                {saving ? "Saving…" : "Save Equipment"}
              </button>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <form onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
            <div style={{ ...card, padding: 14 }}>
              <div style={sectionTitle}>Equipment Information</div>

              <div style={grid}>
                <div style={col(4)}>
                  <label style={label}>Name *</label>
                  <input
                    name="name"
                    value={equipment.name}
                    onChange={handleChange}
                    style={input}
                    placeholder="e.g., Rigging Kit"
                    required
                  />
                </div>

                <div style={col(4)}>
                  <label style={label}>Serial Number</label>
                  <input
                    name="serialNumber"
                    value={equipment.serialNumber}
                    onChange={handleChange}
                    style={input}
                    placeholder="Optional"
                  />
                </div>

                <div style={col(4)}>
                  <label style={label}>Category *</label>
                  <select name="category" value={equipment.category} onChange={handleChange} style={input} required>
                    <option value="">Select category…</option>
                    {existingCategories.length ? (
                      existingCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Rigging">Rigging</option>
                        <option value="Safety">Safety</option>
                        <option value="Electrical">Electrical</option>
                        <option value="Comms">Comms</option>
                        <option value="Misc">Misc</option>
                      </>
                    )}
                  </select>
                  <div style={helpText}>Categories are used to group the list on the Equipment Overview page.</div>
                </div>

                <div style={col(3)}>
                  <label style={label}>Status</label>
                  <select name="status" value={equipment.status} onChange={handleChange} style={input}>
                    <option value="Available">Available</option>
                    <option value="Not Available">Not Available</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Off-site">Off-site</option>
                  </select>
                </div>

                <div style={col(3)}>
                  <label style={label}>Asset No.</label>
                  <input name="asset" value={equipment.asset} onChange={handleChange} style={input} placeholder="Optional" />
                </div>

                <div style={col(6)}>
                  <label style={label}>Location</label>
                  <input name="location" value={equipment.location} onChange={handleChange} style={input} placeholder="e.g., Workshop / Truck 1 / Store" />
                </div>
              </div>
            </div>

            <div style={{ ...card, padding: 14 }}>
              <div style={sectionTitle}>Inspection</div>

              <div style={grid}>
                <div style={col(4)}>
                  <label style={label}>Last Inspection</label>
                  <input type="date" name="lastInspection" value={equipment.lastInspection} onChange={handleChange} style={input} />
                </div>

                <div style={col(4)}>
                  <label style={label}>Frequency (weeks)</label>
                  <input
                    name="inspectionFrequency"
                    value={equipment.inspectionFrequency}
                    onChange={handleChange}
                    style={input}
                    placeholder="e.g., 26"
                    inputMode="numeric"
                  />
                  <div style={helpText}>If set, Next Inspection will auto-calculate.</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Next Inspection Due</label>
                  <input type="date" name="nextInspection" value={equipment.nextInspection} onChange={handleChange} style={input} />
                </div>
              </div>
            </div>

            <div style={{ ...card, padding: 14 }}>
              <div style={sectionTitle}>Notes</div>
              <textarea
                name="notes"
                value={equipment.notes}
                onChange={handleChange}
                style={textarea}
                placeholder="Anything useful: defects, missing parts, usage notes, certificate refs…"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={btn("#fff", UI.text)} onClick={() => router.back()}>
                Cancel
              </button>
              <button
                type="submit"
                style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                disabled={!canSave || saving}
              >
                {saving ? "Saving…" : "Save Equipment"}
              </button>
            </div>
          </form>
        </main>
      </div>

      <style jsx global>{`
        input:disabled, select:disabled, textarea:disabled { opacity: 0.7; cursor: not-allowed; }
        button:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>
    </HeaderSidebarLayout>
  );
}
