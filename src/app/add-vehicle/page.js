// src/app/add-vehicle/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import { ArrowLeft, Save } from "lucide-react";

/* UI tokens */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowMd: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandBorder: "#c8d6e3",
  brandSoft: "#edf3f8",
  danger: "#dc2626",
};

const shell = { minHeight: "100vh", background: UI.bg, color: UI.text };
const main = { flex: 1, padding: "16px 16px 32px", maxWidth: 1280, margin: "0 auto" };
const headerRow = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const h1 = { margin: 0, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0 };
const sub = { marginTop: 6, fontSize: 13.5, lineHeight: 1.45, color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const sectionTitle = { margin: "0 0 10px", fontSize: 15, fontWeight: 950, color: UI.text };

const grid = { display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 10 };
const col = (span) => ({ gridColumn: `span ${span}`, minWidth: 0 });

const label = { display: "block", marginBottom: 4, fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: 0 };
const input = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: 13,
  background: "#fff",
  color: UI.text,
  outline: "none",
};
const textarea = { ...input, minHeight: 92, resize: "vertical" };

const btn = (bg = "#fff", fg = UI.text, bd = "1px solid #e5e7eb") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  border: bg === UI.brand ? `1px solid ${UI.brand}` : bd === "1px solid #e5e7eb" ? `1px solid ${UI.brandBorder}` : bd,
  background:
    bg === UI.brand
      ? "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)"
      : "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: bg === UI.brand ? "#fff" : fg,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  boxShadow:
    bg === UI.brand
      ? "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)"
      : "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
  fontSize: 12.5,
  lineHeight: 1.2,
});

const helpText = { marginTop: 6, fontSize: 12, color: UI.muted };
const RETENTION_PLATE_CATEGORY = "Number Plates On Retention";
const INITIAL_FORM_DATA = {
  name: "",
  registration: "",
  category: "",
  manufacturer: "",
  model: "",
  odometer: "",
  notes: "",
  retentionExpiry: "",
  plateType: "retention",
  plateExpiryFreq: "",
  lastService: "",
  serviceFreq: "",
  nextService: "",
  lastMOT: "",
  motFreq: "",
  nextMOT: "",
  taxStatus: "Taxed",
  insuranceStatus: "Insured",
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

export default function AddVehiclePage() {
  const router = useRouter();
  const [isNumberPlateMode, setIsNumberPlateMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [existingCategories, setExistingCategories] = useState([]);

  const [formData, setFormData] = useState({ ...INITIAL_FORM_DATA });

  useEffect(() => {
    setIsNumberPlateMode(new URLSearchParams(window.location.search).get("type") === "number-plate");
  }, []);

  useEffect(() => {
    if (!isNumberPlateMode) return;
    setFormData((prev) => ({
      ...prev,
      category: RETENTION_PLATE_CATEGORY,
      taxStatus: "N/A",
      insuranceStatus: "N/A",
    }));
  }, [isNumberPlateMode]);

  // Pull categories from existing vehicles so the dropdown stays consistent
  useEffect(() => {
    const loadCats = async () => {
      try {
        const snap = await getDocs(collection(db, "vehicles"));
        const cats = snap.docs
          .map((d) => d.data()?.category)
          .filter(Boolean);
        const unique = Array.from(new Set([...cats, RETENTION_PLATE_CATEGORY])).sort((a, b) => String(a).localeCompare(String(b)));
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
    const numeric = ["odometer", "serviceFreq", "motFreq", "plateExpiryFreq"];
    const v = numeric.includes(name) ? (value === "" ? "" : String(value).replace(/[^\d]/g, "")) : value;

    setFormData((prev) => ({
      ...prev,
      [name]: v,
      ...(name === "plateType" && value === "trade" ? { plateExpiryFreq: "52" } : {}),
    }));
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
    if (isNumberPlateMode) return formData.registration.trim();

    return (
      formData.name.trim() &&
      formData.registration.trim() &&
      formData.category.trim()
    );
  }, [formData, isNumberPlateMode]);

  const hasUnsavedChanges = useMemo(() => {
    const baseline = isNumberPlateMode
      ? {
          ...INITIAL_FORM_DATA,
          category: RETENTION_PLATE_CATEGORY,
          taxStatus: "N/A",
          insuranceStatus: "N/A",
        }
      : INITIAL_FORM_DATA;

    return Object.entries(formData).some(([key, value]) => {
      return String(value || "").trim() !== String(baseline[key] || "").trim();
    });
  }, [formData, isNumberPlateMode]);

  const handleSubmit = async (e, options = {}) => {
    e?.preventDefault?.();
    if (!canSave || saving) return false;

    const { navigateOnSuccess = true } = options;

    setSaving(true);
    try {
      const odometerValue = isNumberPlateMode || formData.odometer === "" ? "" : Number(formData.odometer);

      // Build clean payload (avoid empty strings where possible)
      const payload = {
        name: isNumberPlateMode ? (formData.name.trim() || formData.registration.trim()) : formData.name.trim(),
        registration: formData.registration.trim(),
        reg: formData.registration.trim(),
        registrationNumber: formData.registration.trim(),
        category: isNumberPlateMode ? RETENTION_PLATE_CATEGORY : formData.category.trim(),
        recordType: isNumberPlateMode ? "numberPlateRetention" : "vehicle",
        plateType: isNumberPlateMode ? formData.plateType || "retention" : "",
        plateExpiryFreq: isNumberPlateMode && formData.plateType === "trade" ? "52" : formData.plateExpiryFreq || "",

        manufacturer: isNumberPlateMode ? "" : formData.manufacturer.trim(),
        make: isNumberPlateMode ? "" : formData.manufacturer.trim(),
        model: isNumberPlateMode ? "" : formData.model.trim(),

        odometer: odometerValue,
        mileage: odometerValue,
        serviceOdometer: odometerValue,
        notes: formData.notes || "",
        retentionExpiry: isNumberPlateMode ? formData.retentionExpiry || "" : "",

        lastService: isNumberPlateMode ? "" : formData.lastService || "",
        serviceFreq: isNumberPlateMode ? "" : formData.serviceFreq || "",
        nextService: isNumberPlateMode ? "" : formData.nextService || "",
        nextServiceDate: isNumberPlateMode ? "" : formData.nextService || "",
        serviceDueDate: isNumberPlateMode ? "" : formData.nextService || "",

        lastMOT: isNumberPlateMode ? "" : formData.lastMOT || "",
        lastMot: isNumberPlateMode ? "" : formData.lastMOT || "",
        motFreq: isNumberPlateMode ? "" : formData.motFreq || "",
        nextMOT: isNumberPlateMode ? "" : formData.nextMOT || "",
        nextMot: isNumberPlateMode ? "" : formData.nextMOT || "",
        nextMotDate: isNumberPlateMode ? "" : formData.nextMOT || "",
        motDueDate: isNumberPlateMode ? "" : formData.nextMOT || "",

        taxStatus: isNumberPlateMode ? "N/A" : formData.taxStatus || "Taxed",
        insuranceStatus: isNumberPlateMode ? "N/A" : formData.insuranceStatus || "Insured",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "vehicles"), payload);

      alert(isNumberPlateMode ? "Number plate added" : "Vehicle added");
      if (navigateOnSuccess) {
        router.push("/vehicles");
        router.refresh?.();
      }
      return true;
    } catch (err) {
      console.error("Error adding vehicle:", err);
      alert("Failed to add vehicle");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => router.push("/vehicles");

  useUnsavedChangesGuard({
    enabled: true,
    isDirty: hasUnsavedChanges && !saving,
    onSave: () => handleSubmit(null, { navigateOnSuccess: false }),
  });

  if (isNumberPlateMode) {
    return (
      <HeaderSidebarLayout>
        <div style={shell}>
          <main style={{ ...main, maxWidth: 860 }}>
            <div style={headerRow}>
              <div>
                <h1 style={h1}>Add Retention Plate</h1>
                <div style={sub}>Create a simple number plate record and track the retention expiry date.</div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="add-vehicle-action" style={btn("#fff", UI.text)} onClick={handleCancel}>
                  <ArrowLeft size={15} />
                  Cancel
                </button>
                <button
                  type="button"
                  className="add-vehicle-action"
                  style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                  onClick={handleSubmit}
                  disabled={!canSave || saving}
                  title={!canSave ? "Fill Number Plate" : ""}
                >
                  <Save size={15} />
                  {saving ? "Saving..." : "Save Number Plate"}
                </button>
              </div>
            </div>

            <div style={{ height: 14 }} />

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
              <div style={{ ...card, padding: 12 }}>
                <div style={sectionTitle}>Number Plate Details</div>

                <div className="add-vehicle-form-grid" style={grid}>
                  <div style={col(6)}>
                    <label style={label}>Number Plate *</label>
                    <input
                      name="registration"
                      value={formData.registration}
                      onChange={handleChange}
                      style={input}
                      placeholder="e.g., AB12 CDE"
                    />
                  </div>

                  <div style={col(6)}>
                    <label style={label}>{formData.plateType === "trade" ? "Trade Plate Expiry" : "Retention Expiry"}</label>
                    <input
                      type="date"
                      name="retentionExpiry"
                      value={formData.retentionExpiry}
                      onChange={handleChange}
                      style={input}
                    />
                  </div>

                  <div style={col(6)}>
                    <label style={label}>Plate Type</label>
                    <select name="plateType" value={formData.plateType} onChange={handleChange} style={input}>
                      <option value="retention">Retention plate</option>
                      <option value="trade">Trade plate</option>
                    </select>
                  </div>

                  <div style={col(6)}>
                    <label style={label}>Expiry Frequency (weeks)</label>
                    <input
                      name="plateExpiryFreq"
                      value={formData.plateType === "trade" ? "52" : formData.plateExpiryFreq}
                      onChange={handleChange}
                      style={input}
                      inputMode="numeric"
                      readOnly={formData.plateType === "trade"}
                    />
                  </div>

                  <div style={col(12)}>
                    <label style={label}>Category</label>
                    <input value={RETENTION_PLATE_CATEGORY} readOnly style={{ ...input, background: "#f8fafc" }} />
                  </div>

                  <div style={col(12)}>
                    <label style={label}>Notes</label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      style={textarea}
                      placeholder="Retention certificate details, owner notes, or reminders..."
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="add-vehicle-action" style={btn("#fff", UI.text)} onClick={handleCancel}>
                  <ArrowLeft size={15} />
                  Cancel
                </button>
                <button
                  type="submit"
                  className="add-vehicle-action"
                  style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                  disabled={!canSave || saving}
                >
                  <Save size={15} />
                  {saving ? "Saving..." : "Save Number Plate"}
                </button>
              </div>
            </form>
          </main>
        </div>

        <style jsx global>{`
          input:disabled, select:disabled, textarea:disabled { opacity: 0.7; cursor: not-allowed; }
          button:disabled { opacity: 0.7; cursor: not-allowed; }
          input:focus, select:focus, textarea:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: #9fb7cf !important; }
          .add-vehicle-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowMd} !important; }
          @media (max-width: 820px) {
            .add-vehicle-form-grid > div { grid-column: span 12 !important; }
          }
        `}</style>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <div style={shell}>
        <main style={main}>
          <div style={headerRow}>
            <div>
              <h1 style={h1}>{isNumberPlateMode ? "Add Retention Plate" : "Add Vehicle"}</h1>
              <div style={sub}>
                {isNumberPlateMode
                  ? "Create a simple number plate record and track the retention expiry date."
                  : "Create a new vehicle record. Next MOT/Service can auto-calc from last date + frequency."}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="add-vehicle-action" style={btn("#fff", UI.text)} onClick={handleCancel}>
                <ArrowLeft size={15} />
                Cancel
              </button>
              <button
                type="button"
                className="add-vehicle-action"
                style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                onClick={handleSubmit}
                disabled={!canSave || saving}
                title={!canSave ? (isNumberPlateMode ? "Fill Number Plate" : "Fill Name, Registration, and Category") : ""}
              >
                <Save size={15} />
                {saving ? "Saving..." : "Save Vehicle"}
              </button>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            {/* Main details */}
            <div style={{ ...card, padding: 12 }}>
              <div style={sectionTitle}>Main Information</div>

              <div className="add-vehicle-form-grid" style={grid}>
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
                    <option value="">Select category...</option>
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
                  <textarea name="notes" value={formData.notes} onChange={handleChange} style={textarea} placeholder="Anything useful: quirks, kit, keys, restrictions..." />
                </div>
              </div>
            </div>

            {/* Maintenance */}
            <div style={{ ...card, padding: 12 }}>
              <div style={sectionTitle}>Maintenance</div>

              <div className="add-vehicle-form-grid" style={grid}>
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
              <button type="button" className="add-vehicle-action" style={btn("#fff", UI.text)} onClick={handleCancel}>
                <ArrowLeft size={15} />
                Cancel
              </button>
              <button
                type="submit"
                className="add-vehicle-action"
                style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)}
                disabled={!canSave || saving}
              >
                <Save size={15} />
                {saving ? "Saving..." : "Save Vehicle"}
              </button>
            </div>
          </form>
        </main>
      </div>

      <style jsx global>{`
        input:disabled, select:disabled, textarea:disabled { opacity: 0.7; cursor: not-allowed; }
        button:disabled { opacity: 0.7; cursor: not-allowed; }
        input:focus, select:focus, textarea:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: #9fb7cf !important; }
        .add-vehicle-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowMd} !important; }
        @media (max-width: 820px) {
          .add-vehicle-form-grid > div { grid-column: span 12 !important; }
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}
