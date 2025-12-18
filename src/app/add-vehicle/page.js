// src/app/add-vehicle/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";

/* ───────────────── Mini design system (matches your newer pages) ───────────────── */
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
  danger: "#dc2626",
};

const shell = { minHeight: "100vh", background: UI.bg, color: UI.text };
const main = { flex: 1, padding: "24px 18px 40px", maxWidth: 1200, margin: "0 auto" };
const headerRow = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const h1 = { margin: 0, fontSize: 28, fontWeight: 950, letterSpacing: "-0.01em" };
const sub = { marginTop: 6, fontSize: 12.5, color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const sectionTitle = { margin: "0 0 10px", fontSize: 14, fontWeight: 950, color: UI.text };

const grid = { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 };
const col = (span) => ({ gridColumn: `span ${span}` });

const label = { display: "block", marginBottom: 6, fontSize: 12, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: ".04em" };
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
const textarea = { ...input, minHeight: 120, resize: "vertical" };

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

const helpText = { marginTop: 6, fontSize: 12, color: UI.muted };

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

export default function AddVehiclePage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [existingCategories, setExistingCategories] = useState([]);

  const [formData, setFormData] = useState({
    // match your newer vehicle schema naming
    name: "",
    registration: "",

    category: "",

    manufacturer: "",
    model: "",

    odometer: "",
    notes: "",

    // maintenance core (keep consistent with edit page keys)
    lastService: "",
    serviceFreq: "", // weeks
    nextService: "",

    lastMOT: "",
    motFreq: "", // weeks
    nextMOT: "",

    // statuses used across your app
    taxStatus: "Taxed",
    insuranceStatus: "Insured",
  });

  // Pull categories from existing vehicles so the dropdown stays consistent
  useEffect(() => {
    const loadCats = async () => {
      try {
        const snap = await getDocs(collection(db, "vehicles"));
        const cats = snap.docs
          .map((d) => d.data()?.category)
          .filter(Boolean);
        const unique = Array.from(new Set(cats)).sort((a, b) => String(a).localeCompare(String(b)));
        setExistingCategories(unique);
      } catch (e) {
        console.error("Load categories failed:", e);
      }
    };
    loadCats();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // numeric fields
    const numeric = ["odometer", "serviceFreq", "motFreq"];
    const v = numeric.includes(name) ? (value === "" ? "" : String(value).replace(/[^\d]/g, "")) : value;

    setFormData((prev) => ({ ...prev, [name]: v }));
  };

  // Auto-calc next dates if user provides last + freq and next is blank or matches previous calc
  useEffect(() => {
    if (formData.lastMOT && formData.motFreq) {
      const calc = addWeeksToISO(formData.lastMOT, formData.motFreq);
      if (calc && (!formData.nextMOT || formData.nextMOT === calc)) {
        setFormData((p) => ({ ...p, nextMOT: calc }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.lastMOT, formData.motFreq]);

  useEffect(() => {
    if (formData.lastService && formData.serviceFreq) {
      const calc = addWeeksToISO(formData.lastService, formData.serviceFreq);
      if (calc && (!formData.nextService || formData.nextService === calc)) {
        setFormData((p) => ({ ...p, nextService: calc }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.lastService, formData.serviceFreq]);

  const canSave = useMemo(() => {
    return (
      formData.name.trim() &&
      formData.registration.trim() &&
      formData.category.trim()
    );
  }, [formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave || saving) return;

    setSaving(true);
    try {
      // Build clean payload (avoid empty strings where possible)
      const payload = {
        name: formData.name.trim(),
        registration: formData.registration.trim(),
        category: formData.category.trim(),

        manufacturer: formData.manufacturer.trim(),
        model: formData.model.trim(),

        odometer: formData.odometer === "" ? "" : Number(formData.odometer),
        notes: formData.notes || "",

        lastService: formData.lastService || "",
        serviceFreq: formData.serviceFreq || "",
        nextService: formData.nextService || "",

        lastMOT: formData.lastMOT || "",
        motFreq: formData.motFreq || "",
        nextMOT: formData.nextMOT || "",

        taxStatus: formData.taxStatus || "Taxed",
        insuranceStatus: formData.insuranceStatus || "Insured",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "vehicles"), payload);

      alert("✅ Vehicle added");
      router.push("/vehicles");
      router.refresh?.();
    } catch (err) {
      console.error("Error adding vehicle:", err);
      alert("❌ Failed to add vehicle");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => router.push("/vehicles");

  return (
    <HeaderSidebarLayout>
      <div style={shell}>
        <main style={main}>
          <div style={headerRow}>
            <div>
              <h1 style={h1}>Add Vehicle</h1>
              <div style={sub}>Create a new vehicle record. Next MOT/Service can auto-calc from last date + frequency.</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={btn("#fff", UI.text)} onClick={handleCancel}>
                ← Cancel
              </button>
              <button
                style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                onClick={handleSubmit}
                disabled={!canSave || saving}
                title={!canSave ? "Fill Name, Registration, and Category" : ""}
              >
                {saving ? "Saving…" : "Save Vehicle"}
              </button>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            {/* Main details */}
            <div style={{ ...card, padding: 14 }}>
              <div style={sectionTitle}>Main Information</div>

              <div style={grid}>
                <div style={col(4)}>
                  <label style={label}>Name *</label>
                  <input name="name" value={formData.name} onChange={handleChange} style={input} placeholder="e.g., Silverado" />
                </div>

                <div style={col(4)}>
                  <label style={label}>Registration *</label>
                  <input name="registration" value={formData.registration} onChange={handleChange} style={input} placeholder="e.g., AB12 CDE" />
                </div>

                <div style={col(4)}>
                  <label style={label}>Category *</label>
                  <select name="category" value={formData.category} onChange={handleChange} style={input} required>
                    <option value="">Select category…</option>
                    {existingCategories.length ? (
                      existingCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))
                    ) : (
                      <>
                        <option value="Fleet Vehicle">Fleet Vehicle</option>
                        <option value="Lifting Vans">Lifting Vans</option>
                        <option value="Bike">Bike</option>
                        <option value="Lorry">Lorry</option>
                        <option value="Taurus">Taurus</option>
                        <option value="Electric Tracking Vehicles">Electric Tracking Vehicles</option>
                        <option value="Pod Cars">Pod Cars</option>
                        <option value="HGV Trailers">HGV Trailers</option>
                      </>
                    )}
                  </select>
                </div>

                <div style={col(3)}>
                  <label style={label}>Manufacturer</label>
                  <input name="manufacturer" value={formData.manufacturer} onChange={handleChange} style={input} placeholder="e.g., Volkswagen" />
                </div>

                <div style={col(3)}>
                  <label style={label}>Model</label>
                  <input name="model" value={formData.model} onChange={handleChange} style={input} placeholder="e.g., Amarok" />
                </div>

                <div style={col(3)}>
                  <label style={label}>Odometer</label>
                  <input name="odometer" value={formData.odometer} onChange={handleChange} style={input} placeholder="e.g., 124000" inputMode="numeric" />
                </div>

                <div style={col(3)}>
                  <label style={label}>Tax Status</label>
                  <select name="taxStatus" value={formData.taxStatus} onChange={handleChange} style={input}>
                    <option value="Taxed">Taxed</option>
                    <option value="Sorn">SORN</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>

                <div style={col(3)}>
                  <label style={label}>Insurance Status</label>
                  <select name="insuranceStatus" value={formData.insuranceStatus} onChange={handleChange} style={input}>
                    <option value="Insured">Insured</option>
                    <option value="Not Insured">Not Insured</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>

                <div style={col(9)}>
                  <label style={label}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} style={textarea} placeholder="Anything useful: quirks, kit, keys, restrictions…" />
                </div>
              </div>
            </div>

            {/* Maintenance */}
            <div style={{ ...card, padding: 14 }}>
              <div style={sectionTitle}>Maintenance</div>

              <div style={grid}>
                {/* MOT */}
                <div style={col(12)}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: UI.text, marginBottom: 8 }}>MOT</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Last MOT</label>
                  <input type="date" name="lastMOT" value={formData.lastMOT} onChange={handleChange} style={input} />
                </div>

                <div style={col(4)}>
                  <label style={label}>MOT Frequency (weeks)</label>
                  <input name="motFreq" value={formData.motFreq} onChange={handleChange} style={input} placeholder="e.g., 52" inputMode="numeric" />
                  <div style={helpText}>If set, Next MOT will auto-calculate.</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Next MOT</label>
                  <input type="date" name="nextMOT" value={formData.nextMOT} onChange={handleChange} style={input} />
                </div>

                {/* Service */}
                <div style={col(12)}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: UI.text, margin: "10px 0 8px" }}>Service</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Last Service</label>
                  <input type="date" name="lastService" value={formData.lastService} onChange={handleChange} style={input} />
                </div>

                <div style={col(4)}>
                  <label style={label}>Service Frequency (weeks)</label>
                  <input name="serviceFreq" value={formData.serviceFreq} onChange={handleChange} style={input} placeholder="e.g., 26" inputMode="numeric" />
                  <div style={helpText}>If set, Next Service will auto-calculate.</div>
                </div>

                <div style={col(4)}>
                  <label style={label}>Next Service</label>
                  <input type="date" name="nextService" value={formData.nextService} onChange={handleChange} style={input} />
                </div>
              </div>
            </div>

            {/* Footer actions (redundant + nice UX) */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={btn("#fff", UI.text)} onClick={handleCancel}>
                Cancel
              </button>
              <button
                type="submit"
                style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                disabled={!canSave || saving}
              >
                {saving ? "Saving…" : "Save Vehicle"}
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
