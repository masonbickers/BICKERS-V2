// src/app/employees/[id]/edit/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

import { db } from "../../../../firebaseConfig";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";

/* ───────────────────────────────────────────
   Mini design system (matches your Holiday page)
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
};

const pageWrap = {
  padding: "24px 18px 40px",
  background: UI.bg,
  minHeight: "100vh",
};

const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};

const h1 = {
  color: UI.text,
  fontSize: 26,
  lineHeight: 1.15,
  fontWeight: 900,
  letterSpacing: "-0.01em",
  margin: 0,
};

const sub = { color: UI.muted, fontSize: 13 };

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
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
      color: "#7f1d1d",
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

const mono = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

function Pill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "#93c5fd" : "#e5e7eb"}`,
        background: active ? UI.brandSoft : "#fff",
        color: UI.text,
        fontSize: 12.5,
        fontWeight: 900,
        cursor: "pointer",
        userSelect: "none",
        transition: "all 120ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#93c5fd")}
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = active ? "#93c5fd" : "#e5e7eb")
      }
    >
      {children}
    </button>
  );
}

const inputBase = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  color: UI.text,
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontWeight: 900,
  color: UI.text,
  fontSize: 13,
};

const helperStyle = { marginTop: 6, color: UI.muted, fontSize: 12 };

/* ── Utils ─────────────────────────────────────────────────────────────── */
const asStr = (v) => (v == null ? "" : String(v));
const asDateInput = (v) => {
  // supports "YYYY-MM-DD", timestamp string, Date, Firestore Timestamp
  if (!v) return "";
  if (typeof v === "string") {
    // already date input
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    if (!Number.isNaN(+d)) return d.toISOString().slice(0, 10);
    return "";
  }
  if (v?.toDate) {
    const d = v.toDate();
    return Number.isNaN(+d) ? "" : d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return Number.isNaN(+v) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(+d) ? "" : d.toISOString().slice(0, 10);
  }
  return "";
};

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const employeeId = params?.id;

  const jobOptions = useMemo(
    () => [
      "Driver",
      "Freelance",
      "Workshop",
      "Head and Arm Tech",
      "U-Crane Driver",
      "Transport Driver",
      "Arm Operator",
      "Stunts",
      "Camera Operator",
    ],
    []
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    dob: "",
    licenceNumber: "",
    jobTitle: [], // ✅ array
  });

  useEffect(() => {
    const fetchEmployee = async () => {
      if (!employeeId) return;
      setLoading(true);
      try {
        const docRef = doc(db, "employees", employeeId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          alert("Employee not found");
          router.push("/employees");
          return;
        }

        const data = docSnap.data() || {};
        const jt = Array.isArray(data.jobTitle)
          ? data.jobTitle
          : [data.jobTitle].filter(Boolean);

        setFormData({
          name: asStr(data.name || data.fullName || ""),
          mobile: asStr(data.mobile || ""),
          email: asStr(data.email || ""),
          dob: asDateInput(data.dob || data.dateOfBirth || ""),
          licenceNumber: asStr(data.licenceNumber || data.licenseNumber || ""),
          jobTitle: jt,
        });
      } catch (err) {
        console.error("Error fetching employee:", err);
        alert("❌ Failed to load employee");
        router.push("/employees");
      } finally {
        setLoading(false);
      }
    };

    fetchEmployee();
  }, [employeeId, router]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const toggleJob = (job) => {
    setFormData((prev) => {
      const next = prev.jobTitle.includes(job)
        ? prev.jobTitle.filter((j) => j !== job)
        : [...prev.jobTitle, job];
      return { ...prev, jobTitle: next };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeId) return;

    setSaving(true);
    try {
      const docRef = doc(db, "employees", employeeId);
      await updateDoc(docRef, {
        ...formData,
        // keep dob as YYYY-MM-DD string (matches your other pages)
        dob: formData.dob || "",
        jobTitle: Array.isArray(formData.jobTitle) ? formData.jobTitle : [],
      });
      alert("✅ Employee updated");
      router.push("/employees");
    } catch (err) {
      console.error("Error updating employee:", err);
      alert("❌ Failed to update employee");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => router.push("/employees");

  const handleDelete = async () => {
    if (!employeeId) return;

    const confirmDelete = confirm("Are you sure you want to delete this employee?");
    if (!confirmDelete) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "employees", employeeId));
      alert("🗑️ Employee deleted");
      router.push("/employees");
    } catch (err) {
      console.error("Error deleting employee:", err);
      alert("❌ Failed to delete employee");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Edit Employee</h1>
            <div style={sub}>
              ID: <b style={mono}>{employeeId || "—"}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={handleCancel} style={btn("ghost")}>
              ← Back
            </button>
            <button type="button" onClick={handleDelete} style={btn("danger")} disabled={deleting || loading}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <button type="submit" form="edit-employee-form" style={btn()} disabled={saving || loading}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.85fr)",
            gap: UI.gap,
            alignItems: "start",
          }}
        >
          {/* LEFT: Form */}
          <div style={{ ...surface, padding: 14 }}>
            {loading ? (
              <div style={{ padding: 14, color: UI.muted, fontWeight: 800 }}>Loading employee…</div>
            ) : (
              <form
                id="edit-employee-form"
                onSubmit={handleSubmit}
                style={{ display: "grid", gap: 14 }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      style={inputBase}
                      placeholder="e.g. Sam Smith"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Mobile Number</label>
                    <input
                      name="mobile"
                      type="tel"
                      value={formData.mobile}
                      onChange={handleChange}
                      required
                      style={inputBase}
                      placeholder="e.g. 07…"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Email</label>
                    <input
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      style={inputBase}
                      placeholder="e.g. name@company.com"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Date of Birth</label>
                    <input
                      name="dob"
                      type="date"
                      value={formData.dob}
                      onChange={handleChange}
                      required
                      style={inputBase}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Driving Licence Number</label>
                    <input
                      name="licenceNumber"
                      type="text"
                      value={formData.licenceNumber}
                      onChange={handleChange}
                      required
                      style={inputBase}
                      placeholder="Licence number"
                    />
                    <div style={helperStyle}>Stored on the employee document as <span style={mono}>licenceNumber</span>.</div>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
                  <div style={{ fontWeight: 950, color: UI.text, marginBottom: 6 }}>
                    Job Title(s)
                  </div>
                  <div style={{ color: UI.muted, fontSize: 12, marginBottom: 10 }}>
                    Select one or more roles (saved as an array in <span style={mono}>jobTitle</span>).
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {jobOptions.map((job) => (
                      <Pill
                        key={job}
                        active={formData.jobTitle.includes(job)}
                        onClick={() => toggleJob(job)}
                      >
                        {formData.jobTitle.includes(job) ? "✓ " : ""}{job}
                      </Pill>
                    ))}
                  </div>
                </div>

                {/* Mobile bottom actions (nice when header buttons off-screen) */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                    paddingTop: 6,
                  }}
                >
                  <button type="button" onClick={handleCancel} style={btn("ghost")}>
                    Cancel
                  </button>
                  <button type="submit" style={btn()} disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* RIGHT: Summary */}
          <div style={{ display: "grid", gap: UI.gap, position: "sticky", top: 16 }}>
            <div style={{ ...surface, padding: 14 }}>
              <div style={{ fontWeight: 950, fontSize: 15, marginBottom: 8, color: UI.text }}>
                Summary
              </div>

              {loading ? (
                <div style={{ color: UI.muted, fontSize: 13 }}>Loading…</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Name
                    </div>
                    <div style={{ fontWeight: 950, color: UI.text }}>{formData.name || "—"}</div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Roles
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(formData.jobTitle?.length ? formData.jobTitle : ["—"]).map((j) => (
                        <span
                          key={j}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            background: "#f1f5f9",
                            color: UI.text,
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {j}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Contact
                    </div>
                    <div style={{ color: UI.text, fontWeight: 800, fontSize: 13.5 }}>
                      {formData.mobile || "—"}
                      <br />
                      {formData.email || "—"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                    <button type="button" onClick={handleCancel} style={btn("ghost")}>
                      Back to Employees
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      style={btn("danger")}
                      disabled={deleting || loading}
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ ...surface, padding: 14, background: UI.brandSoft, border: "1px solid #dbeafe" }}>
              <div style={{ fontWeight: 950, color: UI.text, marginBottom: 6 }}>Tip</div>
              <div style={{ color: UI.muted, fontSize: 13 }}>
                This page uses the same styling tokens as your Holiday Overview page so everything feels consistent.
              </div>
            </div>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
