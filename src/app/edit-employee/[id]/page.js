// src/app/employees/[id]/edit/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

import { auth, db } from "../../../../firebaseConfig";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import {
  deriveRoleFromAccess,
  resolveDefaultWorkspace,
  getWorkspaceRoute,
  validateEmployeeAccessDraft,
} from "@/app/utils/accessControl";

const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

const EMPTY_PAYROLL_RATES = {
  workshopRate: "",
  overtimeRate: "",
  travelRate: "",
  sundayRate: "",
  onSetRate: "",
  onSetOvertimeRate: "",
  weekendSupplementRate: "",
  overnightRate: "",
  travelMealRate: "",
};

const EMPTY_GLOBAL_PAYROLL_RATES = {
  travelRate: "",
  overnightRate: "",
  travelMealRate: "",
};

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

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontWeight: 900,
  color: UI.text,
  fontSize: 13,
};

const helperStyle = { marginTop: 6, color: UI.muted, fontSize: 12 };
const inlineNotice = (tone = "success") => ({
  padding: "8px 10px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  border:
    tone === "error" ? "1px solid #fecdd3" : "1px solid #bbf7d0",
  background: tone === "error" ? "#fff1f2" : "#ecfdf5",
  color: tone === "error" ? "#9f1239" : "#166534",
});

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
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [accessErrors, setAccessErrors] = useState({});
  const [userEmail, setUserEmail] = useState("");
  const [globalPayrollRates, setGlobalPayrollRates] = useState(EMPTY_GLOBAL_PAYROLL_RATES);

  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    dob: "",
    licenceNumber: "",
    jobTitle: [], //  array
    role: "employee",
    isService: false,
    appAccess: { user: true, service: false },
    defaultWorkspace: "user",
    payrollRates: EMPTY_PAYROLL_RATES,
  });

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged?.((u) => {
      setUserEmail((u?.email || "").toLowerCase());
    });
    return () => unsub?.();
  }, []);

  const isAdmin = useMemo(() => ADMIN_EMAILS.includes(userEmail), [userEmail]);

  useEffect(() => {
    const fetchEmployee = async () => {
      if (!employeeId) return;
      setLoading(true);
      try {
        const docRef = doc(db, "employees", employeeId);
        const settingsRef = doc(db, "settings", "payrollRates");
        const [docSnap, settingsSnap] = await Promise.all([getDoc(docRef), getDoc(settingsRef)]);

        if (!docSnap.exists()) {
          alert("Employee not found");
          router.push("/employees");
          return;
        }

        const data = docSnap.data() || {};
        const sharedRates = settingsSnap.exists()
          ? {
              ...EMPTY_GLOBAL_PAYROLL_RATES,
              ...(settingsSnap.data() || {}),
            }
          : EMPTY_GLOBAL_PAYROLL_RATES;
        const jt = Array.isArray(data.jobTitle)
          ? data.jobTitle
          : [data.jobTitle].filter(Boolean);
        const loadedAccess = {
          user:
            typeof data?.appAccess?.user === "boolean"
              ? data.appAccess.user
              : !(data.isService === true || String(data.role || "").trim().toLowerCase() === "service"),
          service:
            typeof data?.appAccess?.service === "boolean"
              ? data.appAccess.service
              : data.isService === true ||
                ["service", "hybrid"].includes(String(data.role || "").trim().toLowerCase()),
        };

        setGlobalPayrollRates({
          travelRate:
            sharedRates.travelRate === "" || sharedRates.travelRate == null ? "" : Number(sharedRates.travelRate),
          overnightRate:
            sharedRates.overnightRate === "" || sharedRates.overnightRate == null ? "" : Number(sharedRates.overnightRate),
          travelMealRate:
            sharedRates.travelMealRate === "" || sharedRates.travelMealRate == null
              ? ""
              : Number(sharedRates.travelMealRate),
        });

        setFormData({
          name: asStr(data.name || data.fullName || ""),
          mobile: asStr(data.mobile || ""),
          email: asStr(data.email || ""),
          dob: asDateInput(data.dob || data.dateOfBirth || ""),
          licenceNumber: asStr(data.licenceNumber || data.licenseNumber || ""),
          jobTitle: jt,
          role:
            String(data.role || "").trim().toLowerCase() === "service"
              ? "service"
              : String(data.role || "").trim().toLowerCase() === "hybrid"
                ? "hybrid"
                : "employee",
          isService: data.isService === true,
          appAccess: loadedAccess,
          defaultWorkspace: resolveDefaultWorkspace(data, loadedAccess),
          payrollRates: {
            ...EMPTY_PAYROLL_RATES,
            ...(data.payrollRates || {}),
            travelRate:
              sharedRates.travelRate === "" || sharedRates.travelRate == null
                ? data.payrollRates?.travelRate ?? ""
                : Number(sharedRates.travelRate),
            overnightRate:
              sharedRates.overnightRate === "" || sharedRates.overnightRate == null
                ? data.payrollRates?.overnightRate ?? ""
                : Number(sharedRates.overnightRate),
            travelMealRate:
              sharedRates.travelMealRate === "" || sharedRates.travelMealRate == null
                ? data.payrollRates?.travelMealRate ?? ""
                : Number(sharedRates.travelMealRate),
          },
        });
      } catch (err) {
        console.error("Error fetching employee:", err);
        alert(" Failed to load employee");
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

  const handleAccessToggle = (workspace) => {
    setSaveMessage("");
    setSaveError("");
    setAccessErrors({});
    setFormData((prev) => {
      const nextAccess = {
        ...prev.appAccess,
        [workspace]: !prev.appAccess?.[workspace],
      };

      const fallbackWorkspace = nextAccess.user ? "user" : nextAccess.service ? "service" : prev.defaultWorkspace;

      return {
        ...prev,
        appAccess: nextAccess,
        isService: !!nextAccess.service,
        role: deriveRoleFromAccess(nextAccess),
        defaultWorkspace:
          prev.defaultWorkspace === workspace && !nextAccess[workspace]
            ? fallbackWorkspace
            : prev.defaultWorkspace,
      };
    });
  };

  const handleDefaultWorkspaceChange = (e) => {
    const nextWorkspace = e.target.value;
    setSaveMessage("");
    setSaveError("");
    setAccessErrors({});
    setFormData((prev) => ({
      ...prev,
      defaultWorkspace: nextWorkspace,
    }));
  };

  const handlePayrollRateChange = (field, value) => {
    setSaveMessage("");
    setSaveError("");
    if (field === "travelRate" || field === "overnightRate" || field === "travelMealRate") {
      setGlobalPayrollRates((prev) => ({
        ...prev,
        [field]: value,
      }));
      setFormData((prev) => ({
        ...prev,
        payrollRates: {
          ...(prev.payrollRates || EMPTY_PAYROLL_RATES),
          [field]: value,
        },
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      payrollRates: {
        ...(prev.payrollRates || EMPTY_PAYROLL_RATES),
        [field]: value,
      },
    }));
  };

  const effectiveRole = deriveRoleFromAccess(formData.appAccess || {});
  const routingPreview = getWorkspaceRoute(formData.defaultWorkspace || "user");

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

    const validation = validateEmployeeAccessDraft(formData);
    setAccessErrors(validation.errors || {});
    setSaveMessage("");
    setSaveError("");

    if (!validation.isValid) {
      setSaveError("Please fix the access settings before saving.");
      return;
    }

    if (!isAdmin) {
      setSaveError("Only admins can update employee access or payroll settings.");
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "employees", employeeId);
      const settingsRef = doc(db, "settings", "payrollRates");
      await Promise.all([
        setDoc(docRef, {
        ...formData,
        // keep dob as YYYY-MM-DD string (matches your other pages)
        dob: formData.dob || "",
        jobTitle: Array.isArray(formData.jobTitle) ? formData.jobTitle : [],
        role: effectiveRole,
        isService: !!formData?.appAccess?.service,
        appAccess: {
          user: !!formData?.appAccess?.user,
          service: !!formData?.appAccess?.service,
        },
        defaultWorkspace: formData.defaultWorkspace === "service" ? "service" : "user",
        payrollRates: Object.fromEntries(
          Object.entries(formData.payrollRates || {}).map(([key, value]) => [
            key,
            key === "travelRate"
              ? globalPayrollRates.travelRate === ""
                ? ""
                : Number(globalPayrollRates.travelRate)
              : key === "overnightRate"
                ? globalPayrollRates.overnightRate === ""
                  ? ""
                  : Number(globalPayrollRates.overnightRate)
                : key === "travelMealRate"
                  ? globalPayrollRates.travelMealRate === ""
                    ? ""
                    : Number(globalPayrollRates.travelMealRate)
                : value === ""
                  ? ""
                  : Number(value),
          ])
        ),
        updatedAt: serverTimestamp(),
        updatedBy:
          auth?.currentUser?.email ||
          auth?.currentUser?.uid ||
          "",
      }, { merge: true }),
        setDoc(settingsRef, {
          travelRate: globalPayrollRates.travelRate === "" ? "" : Number(globalPayrollRates.travelRate),
          overnightRate: globalPayrollRates.overnightRate === "" ? "" : Number(globalPayrollRates.overnightRate),
          travelMealRate:
            globalPayrollRates.travelMealRate === "" ? "" : Number(globalPayrollRates.travelMealRate),
          updatedAt: serverTimestamp(),
          updatedBy:
            auth?.currentUser?.email ||
            auth?.currentUser?.uid ||
            "",
        }, { merge: true }),
      ]);
      setSaveMessage("Employee access and profile updated.");
    } catch (err) {
      console.error("Error updating employee:", err);
      setSaveError("Failed to update employee.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => router.push("/employees");

  const handleDelete = async () => {
    if (!employeeId) return;

    if (!isAdmin) {
      setSaveError("Only admins can delete employees.");
      return;
    }

    const confirmDelete = confirm("Are you sure you want to delete this employee?");
    if (!confirmDelete) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "employees", employeeId));
      alert(" Employee deleted");
      router.push("/employees");
    } catch (err) {
      console.error("Error deleting employee:", err);
      alert(" Failed to delete employee");
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
                        {formData.jobTitle.includes(job) ? "Yes " : ""}{job}
                      </Pill>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, display: "grid", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 950, color: UI.text, marginBottom: 6 }}>
                      Access & Role
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Control whether this employee can use the User workspace, the Service workspace, or both.
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => handleAccessToggle("user")}
                      style={{
                        ...btn(formData.appAccess.user ? "primary" : "ghost"),
                        justifyContent: "space-between",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <span>User app access</span>
                      <span>{formData.appAccess.user ? "On" : "Off"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAccessToggle("service")}
                      style={{
                        ...btn(formData.appAccess.service ? "primary" : "ghost"),
                        justifyContent: "space-between",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <span>Service app access</span>
                      <span>{formData.appAccess.service ? "On" : "Off"}</span>
                    </button>
                  </div>

                  {accessErrors.appAccess && <div style={inlineNotice("error")}>{accessErrors.appAccess}</div>}

                  <div>
                    <label style={labelStyle}>Default workspace</label>
                    <select
                      value={formData.defaultWorkspace}
                      onChange={handleDefaultWorkspaceChange}
                      style={inputBase}
                    >
                      {formData.appAccess.user && <option value="user">User</option>}
                      {formData.appAccess.service && <option value="service">Service</option>}
                    </select>
                    <div style={helperStyle}>
                      Dual-access users will land here unless they have an active workspace saved locally.
                    </div>
                    {accessErrors.defaultWorkspace && (
                      <div style={{ ...helperStyle, color: "#9f1239", fontWeight: 700 }}>
                        {accessErrors.defaultWorkspace}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      border: "1px solid #dbe2ea",
                      borderRadius: UI.radiusSm,
                      background: "#f8fbfd",
                      padding: 12,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, color: UI.muted, textTransform: "uppercase" }}>
                      Access preview
                    </div>
                    <div style={{ color: UI.text, fontWeight: 900 }}>
                      Effective role: {effectiveRole}
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Routing target: <span style={mono}>{routingPreview}</span>
                    </div>
                  </div>
                </div>

                {isAdmin ? (
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, display: "grid", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 950, color: UI.text, marginBottom: 6 }}>
                        Payroll Rates
                      </div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Admin-only rates used by finance on the weekly pay advice sheet.
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                      Travel, overnight, and travel meal are shared company-wide rates and update all employees.
                    </div>
                  </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      {[
                        ["workshopRate", "Workshop rate"],
                        ["overtimeRate", "Overtime rate"],
                        ["travelRate", "Travel rate (Universal)"],
                        ["sundayRate", "Sunday rate"],
                        ["onSetRate", "On set rate"],
                        ["onSetOvertimeRate", "On set O/T rate"],
                        ["weekendSupplementRate", "Sa/Su unit rate"],
                        ["overnightRate", "Overnight rate (Universal)"],
                        ["travelMealRate", "Travel meal rate (Universal)"],
                      ].map(([field, label]) => (
                        <div key={field}>
                          <label style={labelStyle}>{label}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={
                              field === "travelRate" || field === "overnightRate" || field === "travelMealRate"
                                ? globalPayrollRates?.[field] ?? ""
                                : formData.payrollRates?.[field] ?? ""
                            }
                            onChange={(e) => handlePayrollRateChange(field, e.target.value)}
                            style={inputBase}
                            placeholder="0.00"
                          />
                          {field === "travelRate" || field === "overnightRate" || field === "travelMealRate" ? (
                            <div style={helperStyle}>Shared across all employees.</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {saveError && <div style={inlineNotice("error")}>{saveError}</div>}
                {saveMessage && <div style={inlineNotice()}>{saveMessage}</div>}

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

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Access
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ ...chip, background: formData.appAccess.user ? "#ecfdf5" : "#f8fafc" }}>
                        User: {formData.appAccess.user ? "On" : "Off"}
                      </span>
                      <span style={{ ...chip, background: formData.appAccess.service ? "#eff6ff" : "#f8fafc" }}>
                        Service: {formData.appAccess.service ? "On" : "Off"}
                      </span>
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Effective role: <b style={{ color: UI.text }}>{effectiveRole}</b>
                    </div>
                  <div style={{ color: UI.muted, fontSize: 12 }}>
                    Route target: <span style={mono}>{routingPreview}</span>
                  </div>
                  </div>

                  {isAdmin ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                        Payroll Rates
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {[
                          ["Workshop", formData.payrollRates?.workshopRate],
                          ["Overtime", formData.payrollRates?.overtimeRate],
                          ["Travel", globalPayrollRates?.travelRate],
                          ["Sunday", formData.payrollRates?.sundayRate],
                          ["On Set", formData.payrollRates?.onSetRate],
                          ["On Set O/T", formData.payrollRates?.onSetOvertimeRate],
                          ["Sa/Su Unit", formData.payrollRates?.weekendSupplementRate],
                          ["Overnight", globalPayrollRates?.overnightRate],
                          ["Travel Meal", globalPayrollRates?.travelMealRate],
                        ].map(([label, value]) => (
                          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                            <span style={{ color: UI.muted }}>{label}</span>
                            <span style={{ color: UI.text, fontWeight: 800 }}>
                              {value === "" || value == null ? "—" : value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

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
