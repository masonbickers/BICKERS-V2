"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
  danger: "#b91c1c",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const card = { ...surface, padding: 16 };

const label = { display: "block", fontSize: 12, fontWeight: 900, color: UI.text, marginBottom: 6 };
const hint = { color: UI.muted, fontSize: 12, marginTop: 6 };

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 13.5,
  background: "#fff",
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const divider = { height: 1, background: "#e5e7eb", margin: "14px 0" };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  if (kind === "danger") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #fecaca",
      background: "#fee2e2",
      color: "#991b1b",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    padding: "10px 12px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
};

const focusCss = `
  input:focus, select:focus, textarea:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
`;

export default function AddEmployeePage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    dob: "",
    licenceNumber: "",
    jobTitle: "", // keep as string here; your list page handles array OR string
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
      await addDoc(collection(db, "employees"), {
        ...formData,
        createdAt: serverTimestamp(),
      });
      alert("✅ Employee added");
      router.push("/employees");
    } catch (err) {
      console.error("Error adding employee:", err);
      alert("❌ Failed to add employee");
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
            <div style={sub}>Create a new employee record. Keep names consistent with bookings.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={chip}>Employees</span>
            <button style={btn("ghost")} type="button" onClick={handleCancel}>
              Back
            </button>
          </div>
        </div>

        <section style={card}>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <div style={grid2}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Full name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Mason Bickers"
                  style={input}
                />
                <div style={hint}>This is what you’ll see across HR pages and booking summaries.</div>
              </div>

              <div>
                <label style={label}>Mobile number</label>
                <input
                  type="tel"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleChange}
                  required
                  placeholder="e.g. 07…"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="name@company.com"
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Date of birth</label>
                <input
                  type="date"
                  name="dob"
                  value={formData.dob}
                  onChange={handleChange}
                  required
                  style={input}
                />
              </div>

              <div>
                <label style={label}>Driving licence number</label>
                <input
                  type="text"
                  name="licenceNumber"
                  value={formData.licenceNumber}
                  onChange={handleChange}
                  required
                  placeholder="Licence number"
                  style={input}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Job title</label>
                <input
                  type="text"
                  name="jobTitle"
                  value={formData.jobTitle}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Precision Driver"
                  style={input}
                />
                <div style={hint}>Tip: if you use multiple titles, separate with commas (your list page can show badges).</div>
              </div>
            </div>

            <div style={divider} />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button style={btn("danger")} type="button" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button style={btn()} type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save employee"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}
