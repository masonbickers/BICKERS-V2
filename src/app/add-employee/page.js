"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { cleanAccessEmail } from "@/app/utils/appAccessRecords";
import { tenantPayload, useDataAccessState } from "@/app/utils/firestoreAccess";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Contact,
  IdCard,
  Mail,
  Phone,
  Save,
  UserPlus,
} from "lucide-react";

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

/* Mini design system */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const card = { ...surface, padding: 12 };

const label = { display: "block", fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", marginBottom: 6 };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 6, lineHeight: 1.4 };

const input = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const divider = { height: 1, background: "#dde5ee", margin: "4px 0" };

const chip = {
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};

const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: 0 };

const formShell = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 300px",
  gap: UI.gap,
  alignItems: "start",
};

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const focusCss = `
  input:focus, select:focus, textarea:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
  button:disabled { opacity: .55; cursor: not-allowed; }
  @media (max-width: 1180px) {
    .add-employee-form-shell,
    .add-employee-grid { grid-template-columns: 1fr !important; }
  }
`;

export default function AddEmployeePage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    dob: "",
    licenceNumber: "",
    jobTitle: "",
  });

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      const name = String(formData.name || "").trim();
      const email = cleanAccessEmail(formData.email);
      const phoneNumber = String(formData.mobile || "").trim();
      await addDoc(collection(db, "employees"), tenantPayload(dataAccessState, {
        ...formData,
        name,
        fullName: name,
        employeeName: name,
        email,
        emails: [email].filter(Boolean),
        isEnabled: true,
        active: true,
        appAccess: { user: true, service: false },
        defaultWorkspace: "user",
        role: "user",
        isService: false,
        phoneNumber,
        createdAt: serverTimestamp(),
      }));
      clearBookingReferenceCache();
      alert("Employee added");
      router.push("/employees");
    } catch (err) {
      console.error("Error adding employee:", err);
      alert("Failed to add employee");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => router.push("/employees");

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>

      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Add employee</h1>
            <div style={sub}>Employee details, contact and licence information.</div>
          </div>
          <button style={btn("ghost")} type="button" onClick={handleCancel}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-employee-form-shell" style={formShell}>
          <section style={card}>
            <div style={sectionHeader}>
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <span style={iconBox(UI.brand, UI.brandSoft)}>
                  <UserPlus size={17} />
                </span>
                <div>
                  <h2 style={titleMd}>Employee Details</h2>
                  <div style={hint}>Personal details, contact and licence information.</div>
                </div>
              </div>
              <span style={chip}>New record</span>
            </div>

            <div className="add-employee-grid" style={grid2}>
              <Field icon={Contact} labelText="Full name" full>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Mason Bickers"
                  style={input}
                />
              </Field>

              <Field icon={Phone} labelText="Mobile number">
                <input
                  type="tel"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleChange}
                  required
                  placeholder="e.g. 07..."
                  style={input}
                />
              </Field>

              <Field icon={Mail} labelText="Email">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="name@company.com"
                  style={input}
                />
              </Field>

              <Field icon={CalendarDays} labelText="Date of birth">
                <input
                  type="date"
                  name="dob"
                  value={formData.dob}
                  onChange={handleChange}
                  required
                  style={input}
                />
              </Field>

              <Field icon={IdCard} labelText="Driving licence number">
                <input
                  type="text"
                  name="licenceNumber"
                  value={formData.licenceNumber}
                  onChange={handleChange}
                  required
                  placeholder="Licence number"
                  style={input}
                />
              </Field>

              <Field icon={BriefcaseBusiness} labelText="Job title" full>
                <input
                  type="text"
                  name="jobTitle"
                  value={formData.jobTitle}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Precision Driver"
                  style={input}
                />
              </Field>
            </div>
          </section>

          <aside style={{ display: "grid", gap: UI.gap }}>
            <section style={card}>
              <div style={sectionHeader}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <span style={iconBox("#15803d", "#ecfdf3", "#bbf7d0")}>
                    <Save size={17} />
                  </span>
                  <div>
                    <h2 style={titleMd}>Actions</h2>
                  </div>
                </div>
              </div>

              <div style={divider} />

              <div style={{ display: "grid", gap: 8 }}>
                <button style={btn()} type="submit" disabled={saving}>
                  <Save size={14} /> {saving ? "Saving..." : "Save employee"}
                </button>
                <button style={btn("ghost")} type="button" onClick={handleCancel} disabled={saving}>
                  Cancel
                </button>
              </div>
            </section>

            <section style={card}>
              <div style={sectionHeader}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <span style={iconBox("#7c3aed", "#f5f3ff", "#ddd6fe")}>
                    <IdCard size={17} />
                  </span>
                  <div>
                    <h2 style={titleMd}>Required Fields</h2>
                    <div style={hint}>Name, contact, date of birth, licence and job title.</div>
                  </div>
                </div>
              </div>
              <div style={divider} />
              <div style={{ display: "grid", gap: 8, color: UI.muted, fontSize: 12.5, lineHeight: 1.45 }}>
                <div>Full name</div>
                <div>Mobile number and email</div>
                <div>Driving licence number</div>
              </div>
            </section>
          </aside>
        </form>
      </div>
    </HeaderSidebarLayout>
  );
}

function Field({ icon: Icon, labelText, full = false, children }) {
  return (
    <div style={full ? { gridColumn: "1 / -1" } : undefined}>
      <label style={label}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon size={13} />
          {labelText}
        </span>
      </label>
      {children}
    </div>
  );
}
