// src/app/employees/[id]/edit/page.js
"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

import { auth, db, storage } from "../../../../firebaseConfig";
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
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  deriveRoleFromAccess,
  resolveDefaultWorkspace,
  getWorkspaceRoute,
  validateEmployeeAccessDraft,
} from "@/app/utils/accessControl";
import {
  DEFAULT_COMPANY_ID,
  buildEmployeeAccessPatch,
  buildUserAccessPatch,
  cleanAccessEmail,
} from "@/app/utils/appAccessRecords";
import { UI_TOKENS } from "@/app/utils/uiTokens";

const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
];

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

const EMPTY_EMERGENCY_CONTACT = {
  name: "",
  relationship: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

const EMPTY_PERSONNEL_DOCUMENT = {
  type: "",
  title: "",
  reference: "",
  expiryDate: "",
  documentUrl: "",
  notes: "",
};

const EMPTY_PASSPORT = {
  number: "",
  country: "",
  expiryDate: "",
  documentUrl: "",
  notes: "",
};

const EMPTY_DRIVING_LICENCE = {
  number: "",
  categories: "",
  expiryDate: "",
  checkCode: "",
  points: "",
  documentUrl: "",
  notes: "",
};

const EMPTY_MEDICAL = {
  allergies: "",
  conditions: "",
  medication: "",
  notes: "",
};

/* ───────────────────────────────────────────
   Mini design system (matches your Holiday page)
─────────────────────────────────────────── */
const UI = UI_TOKENS;

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
      background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
      color: UI.text,
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
    };
  }
  if (kind === "danger") {
    return {
      ...base,
      border: `1px solid ${UI.redBorder}`,
      background: UI.redSoft,
      color: UI.var(--color-danger),
    };
  }
  return {
    ...base,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, var(--color-brand-hover) 0%, var(--color-brand) 100%)",
    color: "var(--color-white)",
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
        border: `1px solid ${active ? UI.brandBorder : "var(--color-border)"}`,
        background: active ? UI.brandSoft : "var(--color-surface)",
        color: UI.text,
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        userSelect: "none",
        transition: "all 120ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = UI.brandBorder)}
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = active ? UI.brandBorder : "var(--color-border)")
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
  background: "var(--color-surface)",
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
    tone === "error" ? "1px solid var(--color-danger-border)" : "1px solid var(--color-success-border)",
  background: tone === "error" ? "var(--color-danger-soft)" : "var(--color-success-soft)",
  color: tone === "error" ? "var(--color-danger)" : "var(--color-success)",
});

const personnelSection = {
  borderTop: UI.border,
  paddingTop: 12,
  display: "grid",
  gap: 10,
};

const personnelHeader = {
  fontWeight: 850,
  color: UI.text,
  marginBottom: 4,
  fontSize: 15,
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const textareaBase = {
  ...inputBase,
  minHeight: 74,
  resize: "vertical",
};

/* ── Utils ─────────────────────────────────────────────────────────────── */
const asStr = (v) => (v == null ? "" : String(v));
const objectHasValue = (obj = {}) =>
  Object.values(obj || {}).some((value) => String(value ?? "").trim());

const normalizeRows = (rows, emptyRow) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => ({ ...emptyRow, ...(row || {}) }))
    .filter(objectHasValue);

const safeFileName = (name = "document") =>
  String(name || "document")
    .trim()
    .replace(/[^\w.\-() ]+/g, "_")
    .slice(0, 120) || "document";

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
  const [passportFile, setPassportFile] = useState(null);
  const [drivingLicenceFile, setDrivingLicenceFile] = useState(null);
  const [documentFiles, setDocumentFiles] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
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
    companyId: DEFAULT_COMPANY_ID,
    archived: false,
    active: true,
    appDisabled: false,
    address: "",
    postcode: "",
    nationalInsuranceNumber: "",
    startDate: "",
    employmentStatus: "Active",
    contractType: "",
    payrollNumber: "",
    rightToWorkChecked: false,
    rightToWorkExpiry: "",
    passport: EMPTY_PASSPORT,
    drivingLicence: EMPTY_DRIVING_LICENCE,
    medical: EMPTY_MEDICAL,
    emergencyContacts: [],
    personnelDocuments: [],
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
        const personnelFile = data.personnelFile || {};
        const passport = {
          ...EMPTY_PASSPORT,
          ...(personnelFile.passport || {}),
          ...(data.passport || {}),
          number: asStr(data.passportNumber || data.passport?.number || personnelFile.passport?.number || ""),
          country: asStr(data.passportCountry || data.passport?.country || personnelFile.passport?.country || ""),
          expiryDate: asDateInput(
            data.passportExpiry || data.passport?.expiryDate || personnelFile.passport?.expiryDate || ""
          ),
          documentUrl: asStr(
            data.passportDocumentUrl || data.passport?.documentUrl || personnelFile.passport?.documentUrl || ""
          ),
          notes: asStr(data.passportNotes || data.passport?.notes || personnelFile.passport?.notes || ""),
        };
        const drivingLicence = {
          ...EMPTY_DRIVING_LICENCE,
          ...(personnelFile.drivingLicence || {}),
          ...(data.drivingLicence || {}),
          number: asStr(
            data.licenceNumber ||
              data.licenseNumber ||
              data.drivingLicence?.number ||
              personnelFile.drivingLicence?.number ||
              ""
          ),
          categories: asStr(
            data.drivingLicenceCategories ||
              data.drivingLicence?.categories ||
              personnelFile.drivingLicence?.categories ||
              ""
          ),
          expiryDate: asDateInput(
            data.drivingLicenceExpiry ||
              data.drivingLicence?.expiryDate ||
              personnelFile.drivingLicence?.expiryDate ||
              ""
          ),
          checkCode: asStr(
            data.drivingLicenceCheckCode ||
              data.drivingLicence?.checkCode ||
              personnelFile.drivingLicence?.checkCode ||
              ""
          ),
          points: asStr(
            data.drivingLicencePoints || data.drivingLicence?.points || personnelFile.drivingLicence?.points || ""
          ),
          documentUrl: asStr(
            data.drivingLicenceDocumentUrl ||
              data.drivingLicence?.documentUrl ||
              personnelFile.drivingLicence?.documentUrl ||
              ""
          ),
          notes: asStr(data.drivingLicenceNotes || data.drivingLicence?.notes || personnelFile.drivingLicence?.notes || ""),
        };
        const medical = {
          ...EMPTY_MEDICAL,
          ...(personnelFile.medical || {}),
          ...(data.medical || {}),
          allergies: asStr(data.allergies || data.medical?.allergies || personnelFile.medical?.allergies || ""),
          conditions: asStr(data.medicalConditions || data.medical?.conditions || personnelFile.medical?.conditions || ""),
          medication: asStr(data.medication || data.medical?.medication || personnelFile.medical?.medication || ""),
          notes: asStr(data.medicalNotes || data.medical?.notes || personnelFile.medical?.notes || ""),
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
          companyId: asStr(data.companyId || DEFAULT_COMPANY_ID),
          archived: data.archived === true || data.isArchived === true || data.active === false,
          active: data.active !== false && data.archived !== true && data.isArchived !== true,
          appDisabled: data.appDisabled === true,
          address: asStr(data.address || personnelFile.address || ""),
          postcode: asStr(data.postcode || personnelFile.postcode || ""),
          nationalInsuranceNumber: asStr(data.nationalInsuranceNumber || data.niNumber || personnelFile.nationalInsuranceNumber || ""),
          startDate: asDateInput(data.startDate || data.employmentStartDate || personnelFile.startDate || ""),
          employmentStatus: asStr(data.employmentStatus || personnelFile.employmentStatus || "Active"),
          contractType: asStr(data.contractType || personnelFile.contractType || ""),
          payrollNumber: asStr(data.payrollNumber || personnelFile.payrollNumber || ""),
          rightToWorkChecked: data.rightToWorkChecked === true || personnelFile.rightToWorkChecked === true,
          rightToWorkExpiry: asDateInput(data.rightToWorkExpiry || personnelFile.rightToWorkExpiry || ""),
          passport,
          drivingLicence,
          medical,
          emergencyContacts: normalizeRows(
            data.emergencyContacts || personnelFile.emergencyContacts,
            EMPTY_EMERGENCY_CONTACT
          ),
          personnelDocuments: normalizeRows(
            data.personnelDocuments || personnelFile.documents,
            EMPTY_PERSONNEL_DOCUMENT
          ),
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
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
  };

  const handleNestedChange = (section, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [field]: value,
      },
    }));
  };

  const updateEmergencyContact = (index, field, value) => {
    setFormData((prev) => {
      const rows = [...(prev.emergencyContacts || [])];
      rows[index] = { ...EMPTY_EMERGENCY_CONTACT, ...(rows[index] || {}), [field]: value };
      return { ...prev, emergencyContacts: rows };
    });
  };

  const addEmergencyContact = () => {
    setFormData((prev) => ({
      ...prev,
      emergencyContacts: [...(prev.emergencyContacts || []), { ...EMPTY_EMERGENCY_CONTACT }],
    }));
  };

  const removeEmergencyContact = (index) => {
    setFormData((prev) => ({
      ...prev,
      emergencyContacts: (prev.emergencyContacts || []).filter((_, i) => i !== index),
    }));
  };

  const updatePersonnelDocument = (index, field, value) => {
    setFormData((prev) => {
      const rows = [...(prev.personnelDocuments || [])];
      rows[index] = { ...EMPTY_PERSONNEL_DOCUMENT, ...(rows[index] || {}), [field]: value };
      return { ...prev, personnelDocuments: rows };
    });
  };

  const addPersonnelDocument = () => {
    setFormData((prev) => ({
      ...prev,
      personnelDocuments: [...(prev.personnelDocuments || []), { ...EMPTY_PERSONNEL_DOCUMENT }],
    }));
  };

  const removePersonnelDocument = (index) => {
    setFormData((prev) => ({
      ...prev,
      personnelDocuments: (prev.personnelDocuments || []).filter((_, i) => i !== index),
    }));
    setDocumentFiles((prev) => {
      const next = {};
      Object.entries(prev || {}).forEach(([key, value]) => {
        const numericKey = Number(key);
        if (numericKey < index) next[numericKey] = value;
        if (numericKey > index) next[numericKey - 1] = value;
      });
      return next;
    });
  };

  const uploadPersonnelFile = async (file, folder, progressKey) => {
    if (!file || !employeeId) return null;
    const originalName = file.name || "document";
    const storagePath = `hr/personnel/${employeeId}/${folder}/${Date.now()}_${safeFileName(originalName)}`;
    const fileRef = storageRef(storage, storagePath);
    const task = uploadBytesResumable(fileRef, file, {
      contentType: file.type || "application/octet-stream",
    });

    setUploadProgress((prev) => ({ ...prev, [progressKey]: 0 }));

    await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snapshot) => {
          const pct = snapshot.totalBytes
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;
          setUploadProgress((prev) => ({ ...prev, [progressKey]: pct }));
        },
        reject,
        resolve
      );
    });

    const url = await getDownloadURL(task.snapshot.ref);
    setUploadProgress((prev) => ({ ...prev, [progressKey]: 100 }));

    return {
      documentUrl: url,
      storagePath,
      fileName: originalName,
      fileType: file.type || "",
      fileSize: file.size || 0,
      uploadedAt: new Date().toISOString(),
    };
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
    setUploadProgress({});
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
      const employeeEmail = cleanAccessEmail(formData.email);
      const employeeCode = String(formData.employeeCode || formData.userCode || formData.code || "").trim();
      let passport = {
        ...EMPTY_PASSPORT,
        ...(formData.passport || {}),
        number: String(formData.passport?.number || "").trim(),
        country: String(formData.passport?.country || "").trim(),
        expiryDate: formData.passport?.expiryDate || "",
        documentUrl: String(formData.passport?.documentUrl || "").trim(),
        notes: String(formData.passport?.notes || "").trim(),
      };
      let drivingLicence = {
        ...EMPTY_DRIVING_LICENCE,
        ...(formData.drivingLicence || {}),
        number: String(formData.licenceNumber || formData.drivingLicence?.number || "").trim(),
        categories: String(formData.drivingLicence?.categories || "").trim(),
        expiryDate: formData.drivingLicence?.expiryDate || "",
        checkCode: String(formData.drivingLicence?.checkCode || "").trim(),
        points: String(formData.drivingLicence?.points || "").trim(),
        documentUrl: String(formData.drivingLicence?.documentUrl || "").trim(),
        notes: String(formData.drivingLicence?.notes || "").trim(),
      };
      const medical = {
        ...EMPTY_MEDICAL,
        ...(formData.medical || {}),
        allergies: String(formData.medical?.allergies || "").trim(),
        conditions: String(formData.medical?.conditions || "").trim(),
        medication: String(formData.medical?.medication || "").trim(),
        notes: String(formData.medical?.notes || "").trim(),
      };
      const emergencyContacts = normalizeRows(formData.emergencyContacts, EMPTY_EMERGENCY_CONTACT);
      let rawPersonnelDocuments = (Array.isArray(formData.personnelDocuments) ? formData.personnelDocuments : []).map((row) => ({
        ...EMPTY_PERSONNEL_DOCUMENT,
        ...(row || {}),
      }));

      if (passportFile) {
        const upload = await uploadPersonnelFile(passportFile, "passport", "passport");
        if (upload) passport = { ...passport, ...upload };
      }

      if (drivingLicenceFile) {
        const upload = await uploadPersonnelFile(drivingLicenceFile, "driving-licence", "drivingLicence");
        if (upload) drivingLicence = { ...drivingLicence, ...upload };
      }

      for (const [indexKey, file] of Object.entries(documentFiles || {})) {
        const index = Number(indexKey);
        if (!file || Number.isNaN(index)) continue;
        if (!rawPersonnelDocuments[index]) {
          rawPersonnelDocuments[index] = { ...EMPTY_PERSONNEL_DOCUMENT };
        }
        const upload = await uploadPersonnelFile(file, "documents", `document-${index}`);
        if (upload) {
          rawPersonnelDocuments[index] = {
            ...rawPersonnelDocuments[index],
            ...upload,
            title: rawPersonnelDocuments[index].title || upload.fileName,
          };
        }
      }

      const personnelDocuments = normalizeRows(rawPersonnelDocuments, EMPTY_PERSONNEL_DOCUMENT);
      const personnelFile = {
        address: String(formData.address || "").trim(),
        postcode: String(formData.postcode || "").trim(),
        nationalInsuranceNumber: String(formData.nationalInsuranceNumber || "").trim(),
        startDate: formData.startDate || "",
        employmentStatus: String(formData.employmentStatus || "").trim(),
        contractType: String(formData.contractType || "").trim(),
        payrollNumber: String(formData.payrollNumber || "").trim(),
        rightToWorkChecked: !!formData.rightToWorkChecked,
        rightToWorkExpiry: formData.rightToWorkExpiry || "",
        passport,
        drivingLicence,
        medical,
        emergencyContacts,
        documents: personnelDocuments,
      };
      const accessEmployeeDraft = {
        ...formData,
        name: employeeName,
        fullName: employeeName,
        employeeName,
        email: employeeEmail,
        mobile: formData.mobile || "",
        phoneNumber: formData.phoneNumber || formData.mobile || "",
        companyId: formData.companyId || DEFAULT_COMPANY_ID,
        uid: linkedUserId,
        authUid: linkedUserId,
        active: formData.archived ? false : formData.active !== false,
        archived: !!formData.archived,
        appDisabled: !!formData.appDisabled,
        appAccess: normalizedAppAccess,
        defaultWorkspace: normalizedDefaultWorkspace,
        role: effectiveRole,
      };
      const employeeAccessPatch = linkedUserId
        ? buildEmployeeAccessPatch({
            uid: linkedUserId,
            employeeId,
            employee: accessEmployeeDraft,
          })
        : {
            companyId: formData.companyId || DEFAULT_COMPANY_ID,
            email: employeeEmail,
            emails: [employeeEmail].filter(Boolean),
            isEnabled: formData.archived ? false : formData.active !== false && !formData.appDisabled,
            appAccess: normalizedAppAccess,
            defaultWorkspace: normalizedDefaultWorkspace,
            role: "user",
            isService: !!normalizedAppAccess.service,
          };
      const userAccessPatch = linkedUserId
        ? buildUserAccessPatch({
            uid: linkedUserId,
            employeeId,
            employee: accessEmployeeDraft,
            user: { role: effectiveRole },
          })
        : null;

      await Promise.all([
        setDoc(docRef, {
        ...formData,
        ...employeeAccessPatch,
        name: employeeName,
        fullName: employeeName,
        employeeName,
        ...(employeeCode ? { employeeCode, userCode: employeeCode, code: employeeCode } : {}),
        // keep dob as YYYY-MM-DD string (matches your other pages)
        dob: formData.dob || "",
        address: personnelFile.address,
        postcode: personnelFile.postcode,
        nationalInsuranceNumber: personnelFile.nationalInsuranceNumber,
        startDate: personnelFile.startDate,
        employmentStatus: personnelFile.employmentStatus,
        contractType: personnelFile.contractType,
        payrollNumber: personnelFile.payrollNumber,
        rightToWorkChecked: personnelFile.rightToWorkChecked,
        rightToWorkExpiry: personnelFile.rightToWorkExpiry,
        passport,
        passportNumber: passport.number,
        passportCountry: passport.country,
        passportExpiry: passport.expiryDate,
        passportDocumentUrl: passport.documentUrl,
        drivingLicence,
        licenceNumber: drivingLicence.number,
        drivingLicenceExpiry: drivingLicence.expiryDate,
        drivingLicenceCategories: drivingLicence.categories,
        drivingLicenceCheckCode: drivingLicence.checkCode,
        drivingLicenceDocumentUrl: drivingLicence.documentUrl,
        medical,
        emergencyContacts,
        personnelDocuments,
        personnelFile,
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
                  ...userAccessPatch,
                  active: formData.archived ? false : formData.active !== false,
                  archived: !!formData.archived,
                  isArchived: !!formData.archived,
                  appDisabled: !!formData.appDisabled,
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
      clearBookingReferenceCache();
      setSaveMessage("Employee access and profile updated.");
      setPassportFile(null);
      setDrivingLicenceFile(null);
      setDocumentFiles({});
      setUploadProgress({});
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
        <div className={layoutStyles.extracted1}>
        {/* Header */}
        <div className={layoutStyles.extracted2}>
          <div>
            <h1 style={h1}>Employee Personnel File</h1>
            <div style={sub}>
              Employee record ID: <b className={layoutStyles.extracted3}>{employeeId || "—"}</b>
            </div>
          </div>

          <div className={layoutStyles.extracted4}>
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
              {formData.archived ? "Archived" : archiving ? "Archiving..." : "Archive Employee"}
            </button>
            <button type="button" onClick={handleDelete} style={btn("danger")} disabled={deleting || loading}>
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button type="submit" form="edit-employee-form" style={btn()} disabled={saving || loading}>
              {saving ? "Saving..." : "Save Changes"}
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
                className={layoutStyles.extracted5}
              >
                <div className={layoutStyles.extracted6}>
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

                  <div>
                    <label style={labelStyle}>Employee code</label>
                    <input
                      name="employeeCode"
                      type="text"
                      value={formData.employeeCode}
                      onChange={handleChange}
                      style={inputBase}
                      placeholder="Internal code"
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Payroll number</label>
                    <input
                      name="payrollNumber"
                      type="text"
                      value={formData.payrollNumber}
                      onChange={handleChange}
                      style={inputBase}
                      placeholder="Payroll reference"
                    />
                  </div>
                </div>

                <div style={personnelSection}>
                  <div>
                    <div style={personnelHeader}>Personnel File</div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      HR details kept on the employee record for compliance and day-to-day admin.
                    </div>
                  </div>

                  <div className={layoutStyles.extracted7}>
                    <div className={layoutStyles.extracted8}>
                      <label style={labelStyle}>Home address</label>
                      <textarea
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        style={textareaBase}
                        placeholder="Address"
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Postcode</label>
                      <input name="postcode" value={formData.postcode} onChange={handleChange} style={inputBase} />
                    </div>

                    <div>
                      <label style={labelStyle}>National insurance number</label>
                      <input
                        name="nationalInsuranceNumber"
                        value={formData.nationalInsuranceNumber}
                        onChange={handleChange}
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Start date</label>
                      <input name="startDate" type="date" value={formData.startDate} onChange={handleChange} style={inputBase} />
                    </div>

                    <div>
                      <label style={labelStyle}>Employment status</label>
                      <select name="employmentStatus" value={formData.employmentStatus} onChange={handleChange} style={inputBase}>
                        <option value="Active">Active</option>
                        <option value="Probation">Probation</option>
                        <option value="On leave">On leave</option>
                        <option value="Leaver">Leaver</option>
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Contract type</label>
                      <select name="contractType" value={formData.contractType} onChange={handleChange} style={inputBase}>
                        <option value="">Select...</option>
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Casual">Casual</option>
                        <option value="Freelance">Freelance</option>
                        <option value="Zero-hours">Zero-hours</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={personnelSection}>
                  <div>
                    <div style={personnelHeader}>Passport & Right To Work</div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Store passport details, right-to-work checks and links to scanned documents.
                    </div>
                  </div>

                  <div className={layoutStyles.extracted9}>
                    <div>
                      <label style={labelStyle}>Passport number</label>
                      <input
                        value={formData.passport?.number || ""}
                        onChange={(e) => handleNestedChange("passport", "number", e.target.value)}
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Issuing country</label>
                      <input
                        value={formData.passport?.country || ""}
                        onChange={(e) => handleNestedChange("passport", "country", e.target.value)}
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Passport expiry</label>
                      <input
                        type="date"
                        value={formData.passport?.expiryDate || ""}
                        onChange={(e) => handleNestedChange("passport", "expiryDate", e.target.value)}
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Document link</label>
                      <input
                        type="text"
                        value={formData.passport?.documentUrl || ""}
                        onChange={(e) => handleNestedChange("passport", "documentUrl", e.target.value)}
                        style={inputBase}
                        placeholder="https://..."
                      />
                      {formData.passport?.documentUrl ? (
                        <a href={formData.passport.documentUrl} target="_blank" rel="noopener noreferrer" style={helperStyle}>
                          Open
                        </a>
                      ) : null}
                    </div>

                    <div>
                      <label style={labelStyle}>Upload passport file</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.webp"
                        onChange={(e) => setPassportFile(e.target.files?.[0] || null)}
                        style={inputBase}
                      />
                      <div style={helperStyle}>
                        {passportFile
                          ? `${passportFile.name} selected${uploadProgress.passport != null ? ` - ${uploadProgress.passport}%` : ""}`
                          : "Choose a file, then press Save Changes to upload."}
                      </div>
                    </div>

                    <label className={layoutStyles.extracted10}>
                      <input
                        type="checkbox"
                        name="rightToWorkChecked"
                        checked={!!formData.rightToWorkChecked}
                        onChange={handleChange}
                      />
                      Right to work checked
                    </label>

                    <div>
                      <label style={labelStyle}>Right-to-work expiry</label>
                      <input
                        name="rightToWorkExpiry"
                        type="date"
                        value={formData.rightToWorkExpiry}
                        onChange={handleChange}
                        style={inputBase}
                      />
                    </div>

                    <div className={layoutStyles.extracted11}>
                      <label style={labelStyle}>Passport notes</label>
                      <textarea
                        value={formData.passport?.notes || ""}
                        onChange={(e) => handleNestedChange("passport", "notes", e.target.value)}
                        style={textareaBase}
                      />
                    </div>
                  </div>
                </div>

                <div style={personnelSection}>
                  <div>
                    <div style={personnelHeader}>Driving Licence</div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Licence number is also saved as <span className={layoutStyles.extracted12}>licenceNumber</span> for existing booking screens.
                    </div>
                  </div>

                  <div className={layoutStyles.extracted13}>
                    <div>
                      <label style={labelStyle}>Licence number</label>
                      <input
                        name="licenceNumber"
                        value={formData.licenceNumber}
                        onChange={(e) => {
                          handleChange(e);
                          handleNestedChange("drivingLicence", "number", e.target.value);
                        }}
                        required
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Expiry date</label>
                      <input
                        type="date"
                        value={formData.drivingLicence?.expiryDate || ""}
                        onChange={(e) => handleNestedChange("drivingLicence", "expiryDate", e.target.value)}
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Categories</label>
                      <input
                        value={formData.drivingLicence?.categories || ""}
                        onChange={(e) => handleNestedChange("drivingLicence", "categories", e.target.value)}
                        style={inputBase}
                        placeholder="B, C1, C, BE..."
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>DVLA check code</label>
                      <input
                        value={formData.drivingLicence?.checkCode || ""}
                        onChange={(e) => handleNestedChange("drivingLicence", "checkCode", e.target.value)}
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Points / endorsements</label>
                      <input
                        value={formData.drivingLicence?.points || ""}
                        onChange={(e) => handleNestedChange("drivingLicence", "points", e.target.value)}
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Document link</label>
                      <input
                        type="text"
                        value={formData.drivingLicence?.documentUrl || ""}
                        onChange={(e) => handleNestedChange("drivingLicence", "documentUrl", e.target.value)}
                        style={inputBase}
                        placeholder="https://..."
                      />
                      {formData.drivingLicence?.documentUrl ? (
                        <a href={formData.drivingLicence.documentUrl} target="_blank" rel="noopener noreferrer" style={helperStyle}>
                          Open
                        </a>
                      ) : null}
                    </div>

                    <div className={layoutStyles.extracted14}>
                      <label style={labelStyle}>Upload licence file</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.webp"
                        onChange={(e) => setDrivingLicenceFile(e.target.files?.[0] || null)}
                        style={inputBase}
                      />
                      <div style={helperStyle}>
                        {drivingLicenceFile
                          ? `${drivingLicenceFile.name} selected${uploadProgress.drivingLicence != null ? ` - ${uploadProgress.drivingLicence}%` : ""}`
                          : "Choose a file, then press Save Changes to upload."}
                      </div>
                    </div>

                    <div className={layoutStyles.extracted15}>
                      <label style={labelStyle}>Licence notes</label>
                      <textarea
                        value={formData.drivingLicence?.notes || ""}
                        onChange={(e) => handleNestedChange("drivingLicence", "notes", e.target.value)}
                        style={textareaBase}
                      />
                    </div>
                  </div>
                </div>

                <div style={personnelSection}>
                  <div className={layoutStyles.extracted16}>
                    <div>
                      <div style={personnelHeader}>Emergency Contacts</div>
                      <div style={{ color: UI.muted, fontSize: 12 }}>Add one or more contacts for emergencies.</div>
                    </div>
                    <button type="button" style={btn("ghost")} onClick={addEmergencyContact}>
                      Add contact
                    </button>
                  </div>

                  {(formData.emergencyContacts || []).length === 0 ? (
                    <div style={helperStyle}>No emergency contacts added yet.</div>
                  ) : null}

                  {(formData.emergencyContacts || []).map((contact, index) => (
                    <div key={index} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10, display: "grid", gap: 10 }}>
                      <div className={layoutStyles.extracted17}>
                        <div style={{ fontWeight: 850, color: UI.text }}>Contact {index + 1}</div>
                        <button type="button" style={btn("danger")} onClick={() => removeEmergencyContact(index)}>
                          Remove
                        </button>
                      </div>
                      <div className={layoutStyles.extracted18}>
                        <div>
                          <label style={labelStyle}>Name</label>
                          <input value={contact.name || ""} onChange={(e) => updateEmergencyContact(index, "name", e.target.value)} style={inputBase} />
                        </div>
                        <div>
                          <label style={labelStyle}>Relationship</label>
                          <input value={contact.relationship || ""} onChange={(e) => updateEmergencyContact(index, "relationship", e.target.value)} style={inputBase} />
                        </div>
                        <div>
                          <label style={labelStyle}>Phone</label>
                          <input value={contact.phone || ""} onChange={(e) => updateEmergencyContact(index, "phone", e.target.value)} style={inputBase} />
                        </div>
                        <div>
                          <label style={labelStyle}>Email</label>
                          <input value={contact.email || ""} onChange={(e) => updateEmergencyContact(index, "email", e.target.value)} style={inputBase} />
                        </div>
                        <div className={layoutStyles.extracted19}>
                          <label style={labelStyle}>Address / notes</label>
                          <textarea value={contact.address || contact.notes || ""} onChange={(e) => updateEmergencyContact(index, "address", e.target.value)} style={textareaBase} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={personnelSection}>
                  <div>
                    <div style={personnelHeader}>Medical Notes</div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>Keep only work-relevant notes needed for safety and emergency response.</div>
                  </div>
                  <div className={layoutStyles.extracted20}>
                    <div>
                      <label style={labelStyle}>Allergies</label>
                      <textarea value={formData.medical?.allergies || ""} onChange={(e) => handleNestedChange("medical", "allergies", e.target.value)} style={textareaBase} />
                    </div>
                    <div>
                      <label style={labelStyle}>Conditions</label>
                      <textarea value={formData.medical?.conditions || ""} onChange={(e) => handleNestedChange("medical", "conditions", e.target.value)} style={textareaBase} />
                    </div>
                    <div>
                      <label style={labelStyle}>Medication</label>
                      <textarea value={formData.medical?.medication || ""} onChange={(e) => handleNestedChange("medical", "medication", e.target.value)} style={textareaBase} />
                    </div>
                    <div>
                      <label style={labelStyle}>Other medical notes</label>
                      <textarea value={formData.medical?.notes || ""} onChange={(e) => handleNestedChange("medical", "notes", e.target.value)} style={textareaBase} />
                    </div>
                  </div>
                </div>

                <div style={personnelSection}>
                  <div className={layoutStyles.extracted21}>
                    <div>
                      <div style={personnelHeader}>Other Documents</div>
                      <div style={{ color: UI.muted, fontSize: 12 }}>Contracts, training certificates, permits and any other HR documents.</div>
                    </div>
                    <button type="button" style={btn("ghost")} onClick={addPersonnelDocument}>
                      Add document
                    </button>
                  </div>

                  {(formData.personnelDocuments || []).length === 0 ? (
                    <div style={helperStyle}>No additional documents added yet.</div>
                  ) : null}

                  {(formData.personnelDocuments || []).map((documentRow, index) => (
                    <div key={index} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10, display: "grid", gap: 10 }}>
                      <div className={layoutStyles.extracted22}>
                        <div style={{ fontWeight: 850, color: UI.text }}>Document {index + 1}</div>
                        <button type="button" style={btn("danger")} onClick={() => removePersonnelDocument(index)}>
                          Remove
                        </button>
                      </div>
                      <div className={layoutStyles.extracted23}>
                        <div>
                          <label style={labelStyle}>Type</label>
                          <input value={documentRow.type || ""} onChange={(e) => updatePersonnelDocument(index, "type", e.target.value)} style={inputBase} placeholder="Contract, training, permit..." />
                        </div>
                        <div>
                          <label style={labelStyle}>Title</label>
                          <input value={documentRow.title || ""} onChange={(e) => updatePersonnelDocument(index, "title", e.target.value)} style={inputBase} />
                        </div>
                        <div>
                          <label style={labelStyle}>Reference</label>
                          <input value={documentRow.reference || ""} onChange={(e) => updatePersonnelDocument(index, "reference", e.target.value)} style={inputBase} />
                        </div>
                        <div>
                          <label style={labelStyle}>Expiry / review date</label>
                          <input type="date" value={documentRow.expiryDate || ""} onChange={(e) => updatePersonnelDocument(index, "expiryDate", e.target.value)} style={inputBase} />
                        </div>
                        <div className={layoutStyles.extracted24}>
                          <label style={labelStyle}>Document link</label>
                          <input type="text" value={documentRow.documentUrl || ""} onChange={(e) => updatePersonnelDocument(index, "documentUrl", e.target.value)} style={inputBase} placeholder="https://..." />
                          {documentRow.documentUrl ? (
                            <a href={documentRow.documentUrl} target="_blank" rel="noopener noreferrer" style={helperStyle}>
                              Open
                            </a>
                          ) : null}
                        </div>
                        <div className={layoutStyles.extracted25}>
                          <label style={labelStyle}>Upload file</label>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.heic,.webp"
                            onChange={(e) =>
                              setDocumentFiles((prev) => ({
                                ...prev,
                                [index]: e.target.files?.[0] || null,
                              }))
                            }
                            style={inputBase}
                          />
                          <div style={helperStyle}>
                            {documentFiles[index]
                              ? `${documentFiles[index].name} selected${
                                  uploadProgress[`document-${index}`] != null
                                    ? ` - ${uploadProgress[`document-${index}`]}%`
                                    : ""
                                }`
                              : "Choose a file, then press Save Changes to upload."}
                          </div>
                        </div>
                        <div className={layoutStyles.extracted26}>
                          <label style={labelStyle}>Notes</label>
                          <textarea value={documentRow.notes || ""} onChange={(e) => updatePersonnelDocument(index, "notes", e.target.value)} style={textareaBase} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: UI.border, paddingTop: 12 }}>
                  <div style={{ fontWeight: 800, color: UI.text, marginBottom: 5, fontSize: 15 }}>
                    Job Title(s)
                  </div>
                  <div style={{ color: UI.muted, fontSize: 12, marginBottom: 10 }}>
                    Select one or more roles (saved as an array in <span className={layoutStyles.extracted27}>jobTitle</span>).
                  </div>

                  <div className={layoutStyles.extracted28}>
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

                  <div className={layoutStyles.extracted29}>
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
                      <div style={{ ...helperStyle, color: "var(--color-danger)", fontWeight: 700 }}>
                        {accessErrors.defaultWorkspace}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      border: UI.border,
                      borderRadius: UI.radiusSm,
                      background: "var(--color-surface-subtle)",
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
                      Routing target: <span className={layoutStyles.extracted30}>{routingPreview}</span>
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

                    <div className={layoutStyles.extracted31}>
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
                  className={layoutStyles.extracted32}
                >
                  <button type="button" onClick={handleCancel} style={btn("ghost")}>
                    Cancel
                  </button>
                  <button type="submit" style={btn()} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
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
                <div className={layoutStyles.extracted33}>
                  <div className={layoutStyles.extracted34}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Name
                    </div>
                    <div className={layoutStyles.extracted35}>
                      <div style={{ fontWeight: 850, color: UI.text }}>{formData.name || "—"}</div>
                      {formData.archived ? (
                        <span style={{ ...chip, background: UI.redSoft, color: UI.var(--color-danger), borderColor: UI.redBorder }}>
                          Archived
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className={layoutStyles.extracted36}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Roles
                    </div>
                    <div className={layoutStyles.extracted37}>
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

                  <div className={layoutStyles.extracted38}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Contact
                    </div>
                    <div style={{ color: UI.text, fontWeight: 800, fontSize: 13.5 }}>
                      {formData.mobile || "—"}
                      <br />
                      {formData.email || "—"}
                    </div>
                  </div>

                  <div className={layoutStyles.extracted39}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Personnel file
                    </div>
                    <div className={layoutStyles.extracted40}>
                      <span style={{ ...chip, background: formData.passport?.number || formData.passport?.documentUrl ? "var(--color-success-soft)" : "var(--color-surface-subtle)" }}>
                        Passport: {formData.passport?.number || formData.passport?.documentUrl ? "Added" : "Missing"}
                      </span>
                      <span style={{ ...chip, background: formData.licenceNumber || formData.drivingLicence?.documentUrl ? "var(--color-success-soft)" : "var(--color-surface-subtle)" }}>
                        Licence: {formData.licenceNumber || formData.drivingLicence?.documentUrl ? "Added" : "Missing"}
                      </span>
                      <span style={{ ...chip, background: (formData.emergencyContacts || []).length ? "var(--color-success-soft)" : "var(--color-surface-subtle)" }}>
                        Emergency: {(formData.emergencyContacts || []).length || 0}
                      </span>
                      <span style={{ ...chip, background: (formData.personnelDocuments || []).length ? "var(--color-info-soft)" : "var(--color-surface-subtle)" }}>
                        Docs: {(formData.personnelDocuments || []).length || 0}
                      </span>
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Start: <b style={{ color: UI.text }}>{formData.startDate || "—"}</b> · Status:{" "}
                      <b style={{ color: UI.text }}>{formData.employmentStatus || "—"}</b>
                    </div>
                  </div>

                  <div className={layoutStyles.extracted41}>
                    <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                      Access
                    </div>
                    <div className={layoutStyles.extracted42}>
                      <span style={{ ...chip, background: formData.appAccess.user ? "var(--color-success-soft)" : "var(--color-surface-subtle)" }}>
                        User: {formData.appAccess.user ? "On" : "Off"}
                      </span>
                      <span style={{ ...chip, background: formData.appAccess.service ? "var(--color-info-soft)" : "var(--color-surface-subtle)" }}>
                        Service: {formData.appAccess.service ? "On" : "Off"}
                      </span>
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Effective role: <b style={{ color: UI.text }}>{effectiveRole}</b>
                    </div>
                  <div style={{ color: UI.muted, fontSize: 12 }}>
                    Route target: <span className={layoutStyles.extracted43}>{routingPreview}</span>
                  </div>
                  </div>

                  {isAdmin ? (
                    <div className={layoutStyles.extracted44}>
                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                        Payroll Rates
                      </div>
                      <div className={layoutStyles.extracted45}>
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
                          <div key={label} className={layoutStyles.extracted46}>
                            <span style={{ color: UI.muted }}>{label}</span>
                            <span style={{ color: UI.text, fontWeight: 800 }}>
                              {value === "" || value == null ? "—" : value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className={layoutStyles.extracted47}>
                    <button type="button" onClick={handleCancel} style={btn("ghost")}>
                      Back to Employees
                    </button>
                    <button
                      type="button"
                      onClick={handleArchiveEmployee}
                      style={btn("danger")}
                      disabled={archiving || loading || formData.archived}
                    >
                      {formData.archived ? "Archived" : archiving ? "Archiving..." : "Archive Employee"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      style={btn("danger")}
                      disabled={deleting || loading}
                    >
                      {deleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ ...surface, padding: 12, background: UI.brandSoft, border: `1px solid ${UI.brandBorder}` }}>
              <div style={{ fontWeight: 800, color: UI.text, marginBottom: 6 }}>Personnel file storage</div>
              <div style={{ color: UI.muted, fontSize: 13 }}>
                Passport, licence, emergency contacts, medical notes and document links are saved on the employee document under the personnel file.
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
