// src/app/employees/[id]/edit/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

import { auth, db } from "../../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  where,
} from "firebase/firestore";
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
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  green: "#15803d",
  greenSoft: "#ecfdf3",
  greenBorder: "#bbf7d0",
  red: "#b91c1c",
  redSoft: "#fff1f2",
  redBorder: "#fecdd3",
};

const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
};

const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const h1 = {
  color: UI.text,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: 0,
  margin: 0,
};

const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const btn = (kind = "primary") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
  if (kind === "ghost") {
    return {
      ...base,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
    };
  }
  if (kind === "danger") {
    return {
      ...base,
      border: `1px solid ${UI.redBorder}`,
      background: UI.redSoft,
      color: UI.red,
    };
  }
  return {
    ...base,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(31,75,122,0.16)",
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
        padding: "6px 9px",
        borderRadius: 999,
        border: `1px solid ${active ? UI.brandBorder : "#d7dee8"}`,
        background: active ? UI.brandSoft : "#fff",
        color: UI.text,
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        userSelect: "none",
        transition: "all 120ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = UI.brandBorder)}
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = active ? UI.brandBorder : "#d7dee8")
      }
    >
      {children}
    </button>
  );
}

const inputBase = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: 13,
  outline: "none",
  background: "#fff",
  color: UI.text,
};

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

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontWeight: 900,
  color: UI.muted,
  fontSize: 11.5,
  textTransform: "uppercase",
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
  const [archiving, setArchiving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [accessErrors, setAccessErrors] = useState({});
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
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
    employeeCode: "",
    userCode: "",
    code: "",
    uid: "",
    authUid: "",
    archived: false,
    active: true,
    appDisabled: false,
  });

  useEffect(() => {
    let roleUnsub = null;
    const unsub = auth?.onAuthStateChanged?.((u) => {
      setUserEmail((u?.email || "").toLowerCase());
      roleUnsub?.();
      roleUnsub = null;
      if (!u?.uid) {
        setUserRole("");
        return;
      }
      roleUnsub = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => setUserRole(String(snap.data()?.role || "").toLowerCase()),
        () => setUserRole("")
      );
    });
    return () => {
      roleUnsub?.();
      unsub?.();
    };
  }, []);

  const isAdmin = useMemo(
    () => ADMIN_EMAILS.includes(userEmail) || userRole === "admin",
    [userEmail, userRole]
  );

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
          employeeCode: asStr(data.employeeCode || data.userCode || data.code || ""),
          userCode: asStr(data.userCode || data.employeeCode || data.code || ""),
          code: asStr(data.code || data.userCode || data.employeeCode || ""),
          uid: asStr(data.uid || ""),
          authUid: asStr(data.authUid || ""),
          archived: data.archived === true || data.isArchived === true || data.active === false,
          active: data.active !== false && data.archived !== true && data.isArchived !== true,
          appDisabled: data.appDisabled === true,
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
      const normalizedAppAccess = {
        user: !!formData?.appAccess?.user,
        service: !!formData?.appAccess?.service,
      };
      const normalizedDefaultWorkspace =
        formData.defaultWorkspace === "service" ? "service" : "user";
      const normalizedPayrollRates = Object.fromEntries(
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
      );
      const linkedUserId = String(formData.uid || formData.authUid || "").trim();
      const userRef = linkedUserId ? doc(db, "users", linkedUserId) : null;
      const updatedBy =
        auth?.currentUser?.email ||
        auth?.currentUser?.uid ||
        "";
      const employeeName = String(formData.name || formData.fullName || formData.employeeName || "").trim();
      const employeeCode = String(formData.employeeCode || formData.userCode || formData.code || "").trim();

      await Promise.all([
        setDoc(docRef, {
        ...formData,
        name: employeeName,
        fullName: employeeName,
        employeeName,
        ...(employeeCode ? { employeeCode, userCode: employeeCode, code: employeeCode } : {}),
        // keep dob as YYYY-MM-DD string (matches your other pages)
        dob: formData.dob || "",
        jobTitle: Array.isArray(formData.jobTitle) ? formData.jobTitle : [],
        role: effectiveRole,
        isService: !!normalizedAppAccess.service,
        active: formData.archived ? false : formData.active !== false,
        archived: !!formData.archived,
        isArchived: !!formData.archived,
        appDisabled: !!formData.appDisabled,
        appAccess: normalizedAppAccess,
        defaultWorkspace: normalizedDefaultWorkspace,
        payrollRates: normalizedPayrollRates,
        updatedAt: serverTimestamp(),
        updatedBy,
      }, { merge: true }),
        ...(userRef
          ? [
              setDoc(
                userRef,
                {
                  role: effectiveRole,
                  isService: !!normalizedAppAccess.service,
                  active: formData.archived ? false : formData.active !== false,
                  archived: !!formData.archived,
                  isArchived: !!formData.archived,
                  appDisabled: !!formData.appDisabled,
                  appAccess: normalizedAppAccess,
                  defaultWorkspace: normalizedDefaultWorkspace,
                  email: String(formData.email || "").trim().toLowerCase(),
                  name: employeeName,
                  fullName: employeeName,
                  phone: formData.mobile || "",
                  updatedAt: serverTimestamp(),
                  updatedBy,
                },
                { merge: true }
              ),
            ]
          : []),
        setDoc(settingsRef, {
          travelRate: globalPayrollRates.travelRate === "" ? "" : Number(globalPayrollRates.travelRate),
          overnightRate: globalPayrollRates.overnightRate === "" ? "" : Number(globalPayrollRates.overnightRate),
          travelMealRate:
            globalPayrollRates.travelMealRate === "" ? "" : Number(globalPayrollRates.travelMealRate),
          updatedAt: serverTimestamp(),
          updatedBy,
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

  const findLinkedUserRefs = async () => {
    const refs = [];
    const seen = new Set();
    const addRef = (ref) => {
      if (!ref?.path || seen.has(ref.path)) return;
      seen.add(ref.path);
      refs.push(ref);
    };

    const linkedUserId = String(formData.uid || formData.authUid || "").trim();
    if (linkedUserId) addRef(doc(db, "users", linkedUserId));

    const email = String(formData.email || "").trim().toLowerCase();
    if (email) {
      const snap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      snap.docs.forEach((row) => addRef(row.ref));
    }

    return refs;
  };

  const handleArchiveEmployee = async () => {
    if (!employeeId) return;

    if (!isAdmin) {
      setSaveError("Only admins can archive employees.");
      return;
    }

    const confirmArchive = confirm(
      "Archive this employee from the whole system? They will be hidden from active use and app access will be switched off, but historic bookings and timesheets will be kept."
    );
    if (!confirmArchive) return;

    setArchiving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const archivedBy = auth?.currentUser?.email || auth?.currentUser?.uid || "";
      const userRefs = await findLinkedUserRefs();
      const archivePatch = {
        active: false,
        archived: true,
        isArchived: true,
        appDisabled: true,
        archivedAt: serverTimestamp(),
        archivedBy,
        appAccess: { user: false, service: false },
        role: "archived",
        isService: false,
        updatedAt: serverTimestamp(),
        updatedBy: archivedBy,
      };

      await Promise.all([
        setDoc(doc(db, "employees", employeeId), archivePatch, { merge: true }),
        ...userRefs.map((ref) =>
          setDoc(
            ref,
            {
              active: false,
              archived: true,
              isArchived: true,
              disabled: true,
              appDisabled: true,
              appAccess: { user: false, service: false },
              role: "archived",
              updatedAt: serverTimestamp(),
              updatedBy: archivedBy,
            },
            { merge: true }
          )
        ),
      ]);

      setFormData((prev) => ({
        ...prev,
        active: false,
        archived: true,
        appDisabled: true,
        appAccess: { user: false, service: false },
        role: "archived",
        isService: false,
      }));
      setSaveMessage("Employee archived and removed from active system access.");
    } catch (err) {
      console.error("Error archiving employee:", err);
      setSaveError("Failed to archive employee.");
    } finally {
      setArchiving(false);
    }
  };

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
        <div style={{ width: "100%", maxWidth: 1600, margin: "0 auto" }}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Edit Employee</h1>
            <div style={sub}>
              ID: <b style={mono}>{employeeId || "—"}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={handleCancel} style={btn("ghost")}>
              ← Back
            </button>
            <button
              type="button"
              onClick={handleArchiveEmployee}
              style={btn("danger")}
              disabled={archiving || loading || formData.archived}
              title="Hide employee from active system use and switch off app access"
            >
              {formData.archived ? "Archived" : archiving ? "Archivingâ€¦" : "Archive Employee"}
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
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.65fr)",
            gap: UI.gap,
            alignItems: "start",
          }}
        >
          {/* LEFT: Form */}
          <div style={{ ...surface, padding: 12 }}>
            {loading ? (
              <div style={{ padding: 14, color: UI.muted, fontWeight: 800 }}>Loading employee…</div>
            ) : (
              <form
                id="edit-employee-form"
                onSubmit={handleSubmit}
                style={{ display: "grid", gap: 12 }}
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

                <div style={{ borderTop: UI.border, paddingTop: 12 }}>
                  <div style={{ fontWeight: 800, color: UI.text, marginBottom: 5, fontSize: 15 }}>
                    Job Title(s)
                  </div>
                  <div style={{ color: UI.muted, fontSize: 12, marginBottom: 10 }}>
                    Select one or more roles (saved as an array in <span style={mono}>jobTitle</span>).
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
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

                <div style={{ borderTop: UI.border, paddingTop: 12, display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: UI.text, marginBottom: 5, fontSize: 15 }}>
                      Access & Role
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Control whether this employee can use the User workspace, the Service workspace, or both.
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                      border: UI.border,
                      borderRadius: UI.radiusSm,
                      background: "#f8fbfd",
                      padding: 10,
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
                  <div style={{ borderTop: UI.border, paddingTop: 12, display: "grid", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: UI.text, marginBottom: 5, fontSize: 15 }}>
                        Payroll Rates
                      </div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Admin-only rates used by finance on the weekly pay advice sheet.
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                      Travel, overnight, and travel meal are shared company-wide rates and update all employees.
                    </div>
                  </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
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
                            step={
                              field === "travelMealRate"
                                ? "1"
                                : field === "overnightRate"
                                  ? "0.1"
                                  : "0.01"
                            }
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
            <div style={{ ...surface, padding: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: UI.text }}>
                Summary
              </div>

              {loading ? (
                <div style={{ color: UI.muted, fontSize: 13 }}>Loading…</div>
              ) : (
                <div style={{ display: "grid", gap: 9 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Name
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 850, color: UI.text }}>{formData.name || "—"}</div>
                      {formData.archived ? (
                        <span style={{ ...chip, background: UI.redSoft, color: UI.red, borderColor: UI.redBorder }}>
                          Archived
                        </span>
                      ) : null}
                    </div>
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
                            padding: "5px 9px",
                            borderRadius: 999,
                            border: `1px solid ${UI.brandBorder}`,
                            background: UI.brandSoft,
                            color: UI.text,
                            fontSize: 12,
                            fontWeight: 800,
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
                      onClick={handleArchiveEmployee}
                      style={btn("danger")}
                      disabled={archiving || loading || formData.archived}
                    >
                      {formData.archived ? "Archived" : archiving ? "Archivingâ€¦" : "Archive Employee"}
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

            <div style={{ ...surface, padding: 12, background: UI.brandSoft, border: `1px solid ${UI.brandBorder}` }}>
              <div style={{ fontWeight: 800, color: UI.text, marginBottom: 6 }}>Archive behavior</div>
              <div style={{ color: UI.muted, fontSize: 13 }}>
                Archiving removes active access and hides the employee from current booking lists while keeping old records readable.
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
