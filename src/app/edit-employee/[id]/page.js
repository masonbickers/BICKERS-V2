// src/app/employees/[id]/edit/page.js
"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import PersonnelDocumentViewer from "@/app/components/PersonnelDocumentViewer";
import {
  PeopleFleetHeaderActions,
  PeopleFleetPage,
  PeopleFleetPageHeader,
} from "@/app/components/PeopleFleetPage";
import { Alert, Badge, Button, FormField, Input, Modal, Textarea } from "@/app/components/ui";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  ExternalLink,
  FileSignature,
  History,
  ListChecks,
  PauseCircle,
  PlayCircle,
  Save,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserRound,
} from "lucide-react";

import { auth, db, storage } from "../../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  onSnapshot,
  where,
  writeBatch,
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
import WorkScheduleEditor from "@/app/components/WorkScheduleEditor";
import { DEFAULT_WORK_SCHEDULE, normalizeWorkSchedule } from "@/app/utils/activityTracking";
import { useAuth } from "@/app/context/authContext";
import { tenantCollectionQuery } from "@/app/utils/firestoreAccess";
import { formatUkDate } from "@/app/utils/dateDisplay";
import {
  EMPLOYEE_PERSONNEL_COLLECTION,
  PRIVATE_EMPLOYEE_FIELDS,
  checklistProgress,
  createRateHistoryEntry,
  deriveOffboardingChecklist,
  deriveOnboardingChecklist,
  getEmployeeAbsenceSummary,
  getPersonnelCompliance,
  mergeEmployeePersonnel,
  pickPrivateEmployeeFields,
  withoutPrivateEmployeeFields,
} from "@/app/utils/employeePersonnel";
import {
  formatWorkingTermsDate,
  workingTermsStatusForEmployee,
} from "@/app/utils/workingTermsRecords";

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
  precisionDriverRate: "",
  precisionDriverOvertimeRate: "",
  weekendSupplementRate: "",
  overnightRate: "",
  travelMealRate: "",
};

const EMPTY_GLOBAL_PAYROLL_RATES = {
  travelRate: "",
  overnightRate: "",
  travelMealRate: "",
};

const INDIVIDUAL_PAYROLL_RATE_FIELDS = [
  "workshopRate",
  "overtimeRate",
  "sundayRate",
  "onSetRate",
  "onSetOvertimeRate",
  "precisionDriverRate",
  "precisionDriverOvertimeRate",
  "weekendSupplementRate",
];

const pickRates = (source = {}, fields = INDIVIDUAL_PAYROLL_RATE_FIELDS) =>
  Object.fromEntries(fields.map((field) => [field, source?.[field] ?? ""]));

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
  countryOfIssue: "",
  issueDate: "",
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
      color: "var(--color-danger)",
    };
  }
  return {
    ...base,
    border: `1px solid ${UI.brand}`,
    background: "var(--button-primary-background)",
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
const todayInput = () => new Date().toISOString().slice(0, 10);
const inactiveEmploymentStatuses = new Set(["paused", "ended", "leaver"]);
const isEmploymentInactive = (status) => inactiveEmploymentStatuses.has(String(status || "").trim().toLowerCase());
const employmentBadgeVariant = (status, archived = false) => {
  if (archived) return "danger";
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paused" || normalized === "on leave") return "warning";
  if (normalized === "ended" || normalized === "leaver") return "neutral";
  if (normalized === "probation") return "info";
  return "success";
};
const hasMeaningfulValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized) && !["-", "/", "0", "none", "n/a", "na"].includes(normalized);
};

const getInitials = (name = "") =>
  String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";

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
  const authAccess = useAuth() || {};

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
  const [lifecycleAction, setLifecycleAction] = useState("");
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [lifecycleDraft, setLifecycleDraft] = useState({
    effectiveDate: todayInput(),
    expectedReturnDate: "",
    reason: "",
  });
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [accessErrors, setAccessErrors] = useState({});
  const [financeAccessBusy, setFinanceAccessBusy] = useState(false);
  const [passportFile, setPassportFile] = useState(null);
  const [drivingLicenceFile, setDrivingLicenceFile] = useState(null);
  const [documentFiles, setDocumentFiles] = useState({});
  const [expandedDocuments, setExpandedDocuments] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [documentExtraction, setDocumentExtraction] = useState({
    passport: { status: "idle", message: "" },
    drivingLicence: { status: "idle", message: "" },
  });
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  const [globalPayrollRates, setGlobalPayrollRates] = useState(EMPTY_GLOBAL_PAYROLL_RATES);
  const [globalPayrollRateHistory, setGlobalPayrollRateHistory] = useState([]);
  const [baselinePayrollRates, setBaselinePayrollRates] = useState(EMPTY_PAYROLL_RATES);
  const [baselineGlobalPayrollRates, setBaselineGlobalPayrollRates] = useState(EMPTY_GLOBAL_PAYROLL_RATES);
  const [rateChangeOpen, setRateChangeOpen] = useState(false);
  const [rateChangeDraft, setRateChangeDraft] = useState({ effectiveDate: todayInput(), reason: "" });
  const rateChangeApprovalRef = useRef(null);
  const [absenceData, setAbsenceData] = useState({ holidays: [], sickLeave: [], bankHolidayDates: new Set() });
  const [workingTermsRecords, setWorkingTermsRecords] = useState(null);
  const [workingTermsError, setWorkingTermsError] = useState("");

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
    financeAccess: false,
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
    employmentStatusEffectiveDate: "",
    employmentStatusReason: "",
    expectedReturnDate: "",
    endDate: "",
    employmentHistory: [],
    accessBeforeEmploymentChange: null,
    onboardingChecklist: [],
    offboardingChecklist: [],
    payrollRateHistory: [],
    contractType: "",
    payrollNumber: "",
    rightToWorkChecked: false,
    rightToWorkExpiry: "",
    passport: EMPTY_PASSPORT,
    drivingLicence: EMPTY_DRIVING_LICENCE,
    medical: EMPTY_MEDICAL,
    emergencyContacts: [],
    personnelDocuments: [],
    workSchedule: DEFAULT_WORK_SCHEDULE,
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
      if (!employeeId || !authAccess.accessReady) return;
      if (!authAccess.isAdmin) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const docRef = doc(db, "employees", employeeId);
        const personnelRef = doc(db, EMPLOYEE_PERSONNEL_COLLECTION, employeeId);
        const settingsRef = doc(db, "settings", "payrollRates");
        const termsRequest = authAccess.user?.getIdToken
          ? authAccess.user.getIdToken().then(async (idToken) => {
              const response = await fetch(`/api/admin/working-terms?employeeId=${encodeURIComponent(employeeId)}`, {
                headers: { Authorization: `Bearer ${idToken}` },
                cache: "no-store",
              });
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(payload.error || "Working Terms records could not be loaded.");
              return { records: Array.isArray(payload.records) ? payload.records : [], error: "" };
            }).catch((error) => ({ records: null, error: error.message || "Working Terms records could not be loaded." }))
          : Promise.resolve({ records: null, error: "Working Terms records could not be loaded." });
        const [docSnap, settingsSnap, privateSnap, termsResult] = await Promise.all([
          getDoc(docRef),
          getDoc(settingsRef),
          getDoc(personnelRef).catch(() => null),
          termsRequest,
        ]);
        setWorkingTermsRecords(termsResult.records);
        setWorkingTermsError(termsResult.error);

        if (!docSnap.exists()) {
          systemDialogs.showSystemNotification("Employee not found");
          router.push("/employees");
          return;
        }

        const operationalData = docSnap.data() || {};
        const privateData = privateSnap?.exists?.() ? privateSnap.data() || {} : {};
        const data = mergeEmployeePersonnel(operationalData, privateData);
        const sharedRates = settingsSnap.exists()
          ? {
              ...EMPTY_GLOBAL_PAYROLL_RATES,
              ...(settingsSnap.data() || {}),
            }
          : EMPTY_GLOBAL_PAYROLL_RATES;
        setGlobalPayrollRateHistory(
          Array.isArray(settingsSnap.data()?.history) ? settingsSnap.data().history : []
        );
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
          countryOfIssue: asStr(
            data.drivingLicenceCountry ||
              data.drivingLicence?.countryOfIssue ||
              personnelFile.drivingLicence?.countryOfIssue ||
              ""
          ),
          issueDate: asDateInput(
            data.drivingLicenceIssueDate ||
              data.drivingLicence?.issueDate ||
              personnelFile.drivingLicence?.issueDate ||
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

        const loadedGlobalRates = {
          travelRate:
            sharedRates.travelRate === "" || sharedRates.travelRate == null ? "" : Number(sharedRates.travelRate),
          overnightRate:
            sharedRates.overnightRate === "" || sharedRates.overnightRate == null ? "" : Number(sharedRates.overnightRate),
          travelMealRate:
            sharedRates.travelMealRate === "" || sharedRates.travelMealRate == null
              ? ""
              : Number(sharedRates.travelMealRate),
        };
        const loadedPayrollRates = {
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
        };
        setGlobalPayrollRates(loadedGlobalRates);
        setBaselineGlobalPayrollRates(loadedGlobalRates);
        setBaselinePayrollRates(loadedPayrollRates);

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
          financeAccess: data.financeAccess === true,
          employeeCode: asStr(data.employeeCode || data.userCode || data.code || ""),
          userCode: asStr(data.userCode || data.employeeCode || data.code || ""),
          code: asStr(data.code || data.userCode || data.employeeCode || ""),
          uid: asStr(data.uid || ""),
          authUid: asStr(data.authUid || ""),
          companyId: asStr(data.companyId || DEFAULT_COMPANY_ID),
          archived: data.archived === true || data.isArchived === true,
          active: data.active !== false && data.archived !== true && data.isArchived !== true,
          appDisabled: data.appDisabled === true,
          address: asStr(data.address || personnelFile.address || ""),
          postcode: asStr(data.postcode || personnelFile.postcode || ""),
          nationalInsuranceNumber: asStr(data.nationalInsuranceNumber || data.niNumber || personnelFile.nationalInsuranceNumber || ""),
          startDate: asDateInput(data.startDate || data.employmentStartDate || personnelFile.startDate || ""),
          employmentStatus: asStr(data.employmentStatus || personnelFile.employmentStatus || "Active"),
          employmentStatusEffectiveDate: asDateInput(
            data.employmentStatusEffectiveDate || personnelFile.employmentStatusEffectiveDate || ""
          ),
          employmentStatusReason: asStr(
            data.employmentStatusReason || personnelFile.employmentStatusReason || ""
          ),
          expectedReturnDate: asDateInput(data.expectedReturnDate || personnelFile.expectedReturnDate || ""),
          endDate: asDateInput(data.endDate || data.employmentEndDate || personnelFile.endDate || ""),
          employmentHistory: Array.isArray(data.employmentHistory) ? data.employmentHistory : [],
          onboardingChecklist: Array.isArray(data.onboardingChecklist) ? data.onboardingChecklist : [],
          offboardingChecklist: Array.isArray(data.offboardingChecklist) ? data.offboardingChecklist : [],
          payrollRateHistory: Array.isArray(data.payrollRateHistory) ? data.payrollRateHistory : [],
          accessBeforeEmploymentChange:
            data.accessBeforeEmploymentChange && typeof data.accessBeforeEmploymentChange === "object"
              ? data.accessBeforeEmploymentChange
              : null,
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
          workSchedule: normalizeWorkSchedule(data.workSchedule || DEFAULT_WORK_SCHEDULE),
          payrollRates: loadedPayrollRates,
        });

        try {
          const dataAccessState = {
            user: authAccess.user,
            userDoc: authAccess.userDoc,
            isEnabled: authAccess.isEnabled,
            accessReady: authAccess.accessReady,
          };
          const [holidaySnap, sickSnap, bankHolidayResponse] = await Promise.all([
            getDocs(tenantCollectionQuery(db, "holidays", dataAccessState)),
            getDocs(tenantCollectionQuery(db, "sickLeave", dataAccessState)),
            fetch("https://www.gov.uk/bank-holidays.json", { cache: "no-store" }).catch(() => null),
          ]);
          const bankHolidayPayload = bankHolidayResponse?.ok ? await bankHolidayResponse.json() : {};
          const bankHolidayDates = new Set(
            Object.values(bankHolidayPayload || {})
              .flatMap((division) => (Array.isArray(division?.events) ? division.events : []))
              .map((event) => String(event?.date || ""))
              .filter(Boolean)
          );
          setAbsenceData({
            holidays: holidaySnap.docs.map((row) => ({ id: row.id, ...row.data() })),
            sickLeave: sickSnap.docs.map((row) => ({ id: row.id, ...row.data() })),
            bankHolidayDates,
          });
        } catch (absenceError) {
          console.warn("Employee absence summary could not be loaded:", absenceError);
        }
      } catch (err) {
        console.error("Error fetching employee:", err);
        systemDialogs.showSystemNotification(" Failed to load employee");
        router.push("/employees");
      } finally {
        setLoading(false);
      }
    };

    fetchEmployee();
  }, [authAccess.accessReady, authAccess.isAdmin, authAccess.isEnabled, authAccess.user, authAccess.userDoc, employeeId, router]);

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
    const nextIndex = (formData.personnelDocuments || []).length;
    setExpandedDocuments((expanded) => ({ ...expanded, [nextIndex]: true }));
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
    setExpandedDocuments((prev) => {
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

  const extractPersonnelDocument = async (file, documentType) => {
    if (!file || !["passport", "drivingLicence"].includes(documentType)) return;
    setDocumentExtraction((prev) => ({
      ...prev,
      [documentType]: { status: "reading", message: "Reading visible details…" },
    }));

    try {
      const idToken = await auth.currentUser?.getIdToken?.();
      if (!idToken) throw new Error("Please sign in again before reading the document.");

      const body = new FormData();
      body.append("documentType", documentType);
      body.append("file", file);
      const response = await fetch("/api/personnel/document-extraction", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "The document could not be read.");

      const extracted = payload?.extraction || {};
      setFormData((prev) => {
        if (documentType === "passport") {
          return {
            ...prev,
            passport: {
              ...(prev.passport || {}),
              ...(extracted.number ? { number: extracted.number } : {}),
              ...(extracted.countryOfIssue ? { country: extracted.countryOfIssue } : {}),
              ...(extracted.expiryDate ? { expiryDate: extracted.expiryDate } : {}),
            },
          };
        }

        const nextNumber = extracted.number || prev.licenceNumber || prev.drivingLicence?.number || "";
        return {
          ...prev,
          licenceNumber: nextNumber,
          drivingLicence: {
            ...(prev.drivingLicence || {}),
            ...(extracted.number ? { number: extracted.number } : {}),
            ...(extracted.countryOfIssue ? { countryOfIssue: extracted.countryOfIssue } : {}),
            ...(extracted.issueDate ? { issueDate: extracted.issueDate } : {}),
            ...(extracted.expiryDate ? { expiryDate: extracted.expiryDate } : {}),
            ...(extracted.categories ? { categories: extracted.categories } : {}),
            ...(extracted.points ? { points: extracted.points } : {}),
            ...(extracted.checkCode ? { checkCode: extracted.checkCode } : {}),
          },
        };
      });

      const fieldCount = Array.isArray(extracted.visibleFields) ? extracted.visibleFields.length : 0;
      setDocumentExtraction((prev) => ({
        ...prev,
        [documentType]: {
          status: "complete",
          message: extracted.warning ||
            (fieldCount
              ? `Read ${fieldCount} visible field${fieldCount === 1 ? "" : "s"}. Review them, then save changes.`
              : "No supported details were clearly visible. You can enter them manually."),
        },
      }));
    } catch (error) {
      setDocumentExtraction((prev) => ({
        ...prev,
        [documentType]: { status: "error", message: error?.message || "The document could not be read." },
      }));
    }
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

  const handleFinanceAccessToggle = async () => {
    const linkedUserId = String(formData.authUid || formData.uid || "").trim();
    if (!linkedUserId || financeAccessBusy) {
      setSaveError("Link this employee to a user account before granting finance access.");
      return;
    }
    setFinanceAccessBusy(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in again before changing finance access.");
      const nextFinanceAccess = formData.financeAccess !== true;
      const response = await fetch(`/api/admin/users/${encodeURIComponent(linkedUserId)}/finance-access`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ financeAccess: nextFinanceAccess, employeeId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Finance access could not be updated.");
      setFormData((current) => ({ ...current, financeAccess: body.financeAccess === true }));
      setSaveMessage(body.financeAccess ? "Finance access granted." : "Finance access revoked.");
    } catch (error) {
      setSaveError(error?.message || "Finance access could not be updated.");
    } finally {
      setFinanceAccessBusy(false);
    }
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

  const onboardingChecklist = useMemo(
    () => deriveOnboardingChecklist({ ...formData, id: employeeId }),
    [employeeId, formData]
  );
  const offboardingChecklist = useMemo(
    () => deriveOffboardingChecklist({ ...formData, id: employeeId }),
    [employeeId, formData]
  );
  const onboardingProgress = useMemo(() => checklistProgress(onboardingChecklist), [onboardingChecklist]);
  const offboardingProgress = useMemo(() => checklistProgress(offboardingChecklist), [offboardingChecklist]);
  const complianceSummary = useMemo(() => getPersonnelCompliance(formData), [formData]);
  const workingTermsStatus = useMemo(
    () => Array.isArray(workingTermsRecords)
      ? workingTermsStatusForEmployee({ ...formData, id: employeeId }, workingTermsRecords)
      : null,
    [employeeId, formData, workingTermsRecords]
  );
  const absenceSummary = useMemo(
    () =>
      getEmployeeAbsenceSummary({
        employee: { ...formData, id: employeeId },
        holidays: absenceData.holidays,
        sickLeave: absenceData.sickLeave,
        bankHolidayDates: absenceData.bankHolidayDates,
      }),
    [absenceData, employeeId, formData]
  );

  const toggleChecklistItem = (field, rows, item) => {
    if (item.completedBy === "System") return;
    const changedBy = auth?.currentUser?.email || auth?.currentUser?.uid || "";
    setFormData((prev) => ({
      ...prev,
      [field]: rows.map((row) =>
        row.id === item.id
          ? {
              ...row,
              completed: !row.completed,
              completedAt: !row.completed ? new Date().toISOString() : "",
              completedBy: !row.completed ? changedBy : "",
            }
          : row
      ),
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

    const individualRatePreview = createRateHistoryEntry({
      previous: pickRates(baselinePayrollRates),
      next: pickRates(formData.payrollRates),
      effectiveDate: todayInput(),
      reason: "preview",
    });
    const globalRatePreview = createRateHistoryEntry({
      previous: baselineGlobalPayrollRates,
      next: globalPayrollRates,
      effectiveDate: todayInput(),
      reason: "preview",
    });
    if ((individualRatePreview || globalRatePreview) && !rateChangeApprovalRef.current) {
      setRateChangeDraft({ effectiveDate: todayInput(), reason: "" });
      setRateChangeOpen(true);
      return;
    }
    const approvedRateChange = rateChangeApprovalRef.current;
    rateChangeApprovalRef.current = null;

    setSaving(true);
    setUploadProgress({});
    try {
      const docRef = doc(db, "employees", employeeId);
      const personnelRef = doc(db, EMPLOYEE_PERSONNEL_COLLECTION, employeeId);
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
      const updatedBy = auth?.currentUser?.email || auth?.currentUser?.uid || "";
      const employeeRateHistoryEntry = approvedRateChange
        ? createRateHistoryEntry({
            previous: pickRates(baselinePayrollRates),
            next: pickRates(normalizedPayrollRates),
            effectiveDate: approvedRateChange.effectiveDate,
            reason: approvedRateChange.reason,
            changedBy: updatedBy,
          })
        : null;
      const globalRateHistoryEntry = approvedRateChange
        ? createRateHistoryEntry({
            previous: baselineGlobalPayrollRates,
            next: globalPayrollRates,
            effectiveDate: approvedRateChange.effectiveDate,
            reason: approvedRateChange.reason,
            changedBy: updatedBy,
          })
        : null;
      const linkedUserId = String(formData.uid || formData.authUid || "").trim();
      const userRef = linkedUserId ? doc(db, "users", linkedUserId) : null;
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
        countryOfIssue: String(formData.drivingLicence?.countryOfIssue || "").trim(),
        issueDate: formData.drivingLicence?.issueDate || "",
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
        employmentStatusEffectiveDate: formData.employmentStatusEffectiveDate || "",
        employmentStatusReason: String(formData.employmentStatusReason || "").trim(),
        expectedReturnDate: formData.expectedReturnDate || "",
        endDate: formData.endDate || "",
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

      const nextEmployeeRateHistory = [
        ...(formData.payrollRateHistory || []),
        ...(employeeRateHistoryEntry ? [employeeRateHistoryEntry] : []),
      ].slice(-100);
      const nextGlobalRateHistory = [
        ...globalPayrollRateHistory,
        ...(globalRateHistoryEntry ? [globalRateHistoryEntry] : []),
      ].slice(-100);
      const privateRecord = {
        ...pickPrivateEmployeeFields({
          ...formData,
          dob: formData.dob || "",
          address: personnelFile.address,
          postcode: personnelFile.postcode,
          nationalInsuranceNumber: personnelFile.nationalInsuranceNumber,
          payrollNumber: personnelFile.payrollNumber,
          payrollRates: normalizedPayrollRates,
          rightToWorkChecked: personnelFile.rightToWorkChecked,
          rightToWorkExpiry: personnelFile.rightToWorkExpiry,
          passport,
          drivingLicence,
          medical,
          emergencyContacts,
          personnelDocuments,
          personnelFile,
          onboardingChecklist,
          offboardingChecklist,
          payrollRateHistory: nextEmployeeRateHistory,
        }),
        employeeId,
        companyId: formData.companyId || DEFAULT_COMPANY_ID,
        schemaVersion: 1,
        updatedAt: serverTimestamp(),
        updatedBy,
      };
      const operationalRecord = withoutPrivateEmployeeFields({
        ...Object.fromEntries(
          Object.entries(formData).filter(([field]) => field !== "financeAccess")
        ),
        ...employeeAccessPatch,
        name: employeeName,
        fullName: employeeName,
        employeeName,
        ...(employeeCode ? { employeeCode, userCode: employeeCode, code: employeeCode } : {}),
        startDate: personnelFile.startDate,
        employmentStatus: personnelFile.employmentStatus,
        employmentStatusEffectiveDate: personnelFile.employmentStatusEffectiveDate,
        contractType: personnelFile.contractType,
        jobTitle: Array.isArray(formData.jobTitle) ? formData.jobTitle : [],
        role: effectiveRole,
        isService: !!normalizedAppAccess.service,
        active: formData.archived ? false : formData.active !== false,
        archived: !!formData.archived,
        isArchived: !!formData.archived,
        appDisabled: !!formData.appDisabled,
        appAccess: normalizedAppAccess,
        defaultWorkspace: normalizedDefaultWorkspace,
        updatedAt: serverTimestamp(),
        updatedBy,
      });
      const legacyPrivateDeletes = Object.fromEntries(
        PRIVATE_EMPLOYEE_FIELDS.map((field) => [field, deleteField()])
      );
      const currentUser = auth.currentUser;
      const idToken = await currentUser?.getIdToken();
      if (!idToken) throw new Error("Sign in again before saving this employee.");
      const personnelResponse = await fetch(
        `/api/admin/employees/${encodeURIComponent(employeeId)}/personnel`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ privateRecord }),
        }
      );
      const personnelResult = await personnelResponse.json().catch(() => ({}));
      if (!personnelResponse.ok) {
        throw new Error(personnelResult.error || "Private employee details could not be saved.");
      }
      const batch = writeBatch(db);
      batch.set(docRef, { ...operationalRecord, ...legacyPrivateDeletes }, { merge: true });
      if (userRef) {
        batch.set(
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
        );
      }
      batch.set(
        settingsRef,
        {
          travelRate: globalPayrollRates.travelRate === "" ? "" : Number(globalPayrollRates.travelRate),
          overnightRate: globalPayrollRates.overnightRate === "" ? "" : Number(globalPayrollRates.overnightRate),
          travelMealRate:
            globalPayrollRates.travelMealRate === "" ? "" : Number(globalPayrollRates.travelMealRate),
          history: nextGlobalRateHistory,
          updatedAt: serverTimestamp(),
          updatedBy,
        },
        { merge: true }
      );
      await batch.commit();
      setBaselinePayrollRates(normalizedPayrollRates);
      setBaselineGlobalPayrollRates({ ...globalPayrollRates });
      setGlobalPayrollRateHistory(nextGlobalRateHistory);
      setFormData((current) => ({ ...current, payrollRateHistory: nextEmployeeRateHistory }));
      try {
        if (currentUser) {
          await fetch("/api/admin/activity-tracking/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({
              employeeId,
              companyId: formData.companyId || DEFAULT_COMPANY_ID,
              workSchedule: normalizeWorkSchedule(formData.workSchedule),
            }),
          });
        }
      } catch (auditError) {
        console.warn("Employee work schedule audit could not be recorded:", auditError);
      }
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

  const openLifecycleDialog = (action) => {
    setLifecycleDraft({
      effectiveDate: todayInput(),
      expectedReturnDate: action === "pause" ? formData.expectedReturnDate || "" : "",
      reason: "",
    });
    setSaveError("");
    setLifecycleAction(action);
  };

  const handleLifecycleAction = async () => {
    if (!employeeId || !lifecycleAction) return;
    if (!isAdmin) {
      setSaveError("Only admins can change employment status.");
      return;
    }

    const effectiveDate = String(lifecycleDraft.effectiveDate || "").trim();
    const reason = String(lifecycleDraft.reason || "").trim();
    if (!effectiveDate || !reason) {
      setSaveError("Add an effective date and reason for the employment change.");
      return;
    }

    setLifecycleSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const changedBy = auth?.currentUser?.email || auth?.currentUser?.uid || "";
      const isReactivating = lifecycleAction === "reactivate";
      const nextStatus = lifecycleAction === "pause" ? "Paused" : lifecycleAction === "end" ? "Ended" : "Active";
      const priorAccess =
        formData.accessBeforeEmploymentChange && typeof formData.accessBeforeEmploymentChange === "object"
          ? formData.accessBeforeEmploymentChange
          : {
              appAccess: { ...(formData.appAccess || { user: true, service: false }) },
              defaultWorkspace: formData.defaultWorkspace || "user",
              role: effectiveRole,
              isService: !!formData.isService,
            };
      const restoredAppAccess = isReactivating
        ? {
            user: priorAccess?.appAccess?.user !== false,
            service: priorAccess?.appAccess?.service === true,
          }
        : { user: false, service: false };
      const restoredRole = isReactivating ? deriveRoleFromAccess(restoredAppAccess) : effectiveRole;
      const historyEntry = {
        id: `${Date.now()}-${lifecycleAction}`,
        action: lifecycleAction,
        status: nextStatus,
        effectiveDate,
        expectedReturnDate: lifecycleAction === "pause" ? lifecycleDraft.expectedReturnDate || "" : "",
        reason,
        changedAt: new Date().toISOString(),
        changedBy,
      };
      const employmentHistory = [...(formData.employmentHistory || []), historyEntry].slice(-100);
      const lifecyclePatch = {
        employmentStatus: nextStatus,
        employmentStatusEffectiveDate: effectiveDate,
        employmentStatusReason: reason,
        expectedReturnDate: lifecycleAction === "pause" ? lifecycleDraft.expectedReturnDate || "" : "",
        endDate: lifecycleAction === "end" ? effectiveDate : "",
        employmentEndDate: lifecycleAction === "end" ? effectiveDate : "",
        employmentHistory,
        active: isReactivating,
        archived: false,
        isArchived: false,
        appDisabled: !isReactivating,
        appAccess: restoredAppAccess,
        defaultWorkspace: isReactivating ? priorAccess.defaultWorkspace || "user" : formData.defaultWorkspace || "user",
        role: restoredRole,
        isService: isReactivating ? !!restoredAppAccess.service : !!formData.isService,
        accessBeforeEmploymentChange: isReactivating ? null : priorAccess,
        updatedAt: serverTimestamp(),
        updatedBy: changedBy,
      };
      const userRefs = await findLinkedUserRefs();
      const operationalLifecyclePatch = withoutPrivateEmployeeFields(lifecyclePatch);
      const privateLifecyclePatch = {
        ...pickPrivateEmployeeFields(lifecyclePatch),
        employeeId,
        companyId: formData.companyId || DEFAULT_COMPANY_ID,
        offboardingChecklist: deriveOffboardingChecklist({ ...formData, ...lifecyclePatch }),
        updatedAt: serverTimestamp(),
        updatedBy: changedBy,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "employees", employeeId), operationalLifecyclePatch, { merge: true });
      batch.set(doc(db, EMPLOYEE_PERSONNEL_COLLECTION, employeeId), privateLifecyclePatch, { merge: true });
      userRefs.forEach((ref) => {
        batch.set(
          ref,
          {
            employeeId,
            employmentStatus: nextStatus,
            employmentStatusEffectiveDate: effectiveDate,
            active: isReactivating,
            archived: false,
            isArchived: false,
            disabled: !isReactivating,
            appDisabled: !isReactivating,
            isEnabled: isReactivating,
            appAccess: restoredAppAccess,
            defaultWorkspace: lifecyclePatch.defaultWorkspace,
            role: restoredRole,
            isService: lifecyclePatch.isService,
            updatedAt: serverTimestamp(),
            updatedBy: changedBy,
          },
          { merge: true }
        );
      });
      await batch.commit();

      const lifecycleStatePatch = { ...lifecyclePatch };
      delete lifecycleStatePatch.updatedAt;
      setFormData((prev) => ({ ...prev, ...lifecycleStatePatch, updatedBy: changedBy }));
      clearBookingReferenceCache();
      setLifecycleAction("");
      setSaveMessage(
        lifecycleAction === "pause"
          ? "Employment paused and software access disabled."
          : lifecycleAction === "end"
            ? "Employment ended. The personnel file and historic records have been retained."
            : "Employee reactivated and previous software access restored."
      );
    } catch (err) {
      console.error("Error changing employment status:", err);
      setSaveError("Failed to change employment status.");
    } finally {
      setLifecycleSaving(false);
    }
  };

  const handleArchiveEmployee = async () => {
    if (!employeeId) return;

    if (!isAdmin) {
      setSaveError("Only admins can archive employees.");
      return;
    }

    const confirmArchive = await systemDialogs.confirmSystem(
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

    const confirmDelete = await systemDialogs.confirmSystem("Are you sure you want to delete this employee?");
    if (!confirmDelete) return;

    setDeleting(true);
    try {
      const userRefs = await findLinkedUserRefs();
      const batch = writeBatch(db);
      batch.delete(doc(db, "employees", employeeId));
      batch.delete(doc(db, EMPLOYEE_PERSONNEL_COLLECTION, employeeId));
      userRefs.forEach((ref) => {
        batch.set(
          ref,
          {
            active: false,
            disabled: true,
            appDisabled: true,
            isEnabled: false,
            appAccess: { user: false, service: false },
            employeeDeletedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      systemDialogs.showSystemNotification(" Employee deleted");
      router.push("/employees");
    } catch (err) {
      console.error("Error deleting employee:", err);
      systemDialogs.showSystemNotification(" Failed to delete employee");
    } finally {
      setDeleting(false);
    }
  };

  const personnelReadiness = [
    {
      key: "passport",
      label: "Passport",
      href: "#passport",
      complete: [formData.passport?.number, formData.passport?.documentUrl].some(hasMeaningfulValue),
    },
    {
      key: "licence",
      label: "Driving licence",
      href: "#licence",
      complete: [formData.licenceNumber, formData.drivingLicence?.documentUrl].some(hasMeaningfulValue),
    },
    {
      key: "emergency",
      label: "Emergency contact",
      href: "#emergency",
      complete: (formData.emergencyContacts || []).some((contact) =>
        [contact?.name, contact?.phone, contact?.email].some(hasMeaningfulValue)
      ),
    },
    {
      key: "documents",
      label: "HR documents",
      href: "#documents",
      complete: (formData.personnelDocuments || []).some((documentRow) =>
        [documentRow?.type, documentRow?.title, documentRow?.reference, documentRow?.documentUrl].some(hasMeaningfulValue)
      ),
    },
  ];
  const completedPersonnelSections = personnelReadiness.filter((item) => item.complete).length;
  const employmentInactive = isEmploymentInactive(formData.employmentStatus) || formData.active === false;
  const employmentEnded = ["ended", "leaver"].includes(String(formData.employmentStatus || "").trim().toLowerCase());
  const lifecycleDialogCopy = {
    pause: {
      eyebrow: "Pause employment",
      title: `Pause ${formData.name || "employee"}`,
      description: "Removes the employee from active work and disables software access while retaining their personnel file.",
      confirm: "Pause employment",
    },
    end: {
      eyebrow: "End employment",
      title: `End ${formData.name || "employee"}'s employment`,
      description: "Records them as a former employee and removes access without deleting historic bookings, timesheets or HR records.",
      confirm: "End employment",
    },
    reactivate: {
      eyebrow: "Return to employment",
      title: `Reactivate ${formData.name || "employee"}`,
      description: "Returns the employee to active work and restores the workspace access they had previously.",
      confirm: "Reactivate employee",
    },
  }[lifecycleAction];

  return (
    <HeaderSidebarLayout>
      <PeopleFleetPage className={layoutStyles.page}>
        <div className={layoutStyles.extracted1}>
        <PeopleFleetPageHeader
          title={loading ? "Employee personnel file" : formData.name || "Employee personnel file"}
          subtitle={
            <span className={layoutStyles.recordMeta}>
              Personnel file <span aria-hidden="true">·</span> Record <code>{employeeId || "—"}</code>
            </span>
          }
          actions={
            <PeopleFleetHeaderActions>
              <Button variant="secondary" onClick={handleCancel}>
                <ArrowLeft size={16} /> Employees
              </Button>
              <details className={layoutStyles.moreActions}>
                <summary><span>More</span><ChevronDown size={15} /></summary>
                <div>
                  {employmentInactive && !formData.archived ? (
                    <button type="button" data-tone="success" onClick={() => openLifecycleDialog("reactivate")}>
                      <PlayCircle size={15} /> Reactivate employment
                    </button>
                  ) : (
                    <>
                      <button type="button" data-tone="warning" onClick={() => openLifecycleDialog("pause")} disabled={loading}>
                        <PauseCircle size={15} /> Pause employment
                      </button>
                      <button type="button" data-tone="danger" onClick={() => openLifecycleDialog("end")} disabled={loading}>
                        <UserMinus size={15} /> End employment
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    data-tone="danger"
                    onClick={handleArchiveEmployee}
                    disabled={archiving || loading || formData.archived}
                  >
                    <Archive size={15} />
                    {formData.archived ? "Employee archived" : archiving ? "Archiving…" : "Archive employee"}
                  </button>
                  <button type="button" data-tone="danger" onClick={handleDelete} disabled={deleting || loading}>
                    <Trash2 size={15} /> {deleting ? "Deleting…" : "Delete record permanently"}
                  </button>
                </div>
              </details>
              <Button type="submit" form="edit-employee-form" loading={saving} disabled={loading}>
                <Save size={16} /> Save changes
              </Button>
            </PeopleFleetHeaderActions>
          }
        />

        {saveError ? <Alert variant="danger" className={layoutStyles.pageAlert}>{saveError}</Alert> : null}
        {saveMessage ? <Alert variant="success" className={layoutStyles.pageAlert}><CheckCircle2 size={17} /> {saveMessage}</Alert> : null}

        {employmentInactive && !loading && !formData.archived ? (
          <Alert variant="warning" className={layoutStyles.lifecycleAlert}>
            <Clock3 size={18} />
            <div>
              <strong>Employment {String(formData.employmentStatus || "inactive").toLowerCase()}</strong>
              <span>
                Effective {formatUkDate(formData.employmentStatusEffectiveDate || formData.endDate, "date not recorded")}
                {formData.employmentStatusReason ? ` · ${formData.employmentStatusReason}` : ""}
              </span>
            </div>
            {isAdmin ? <Button size="sm" variant="secondary" onClick={() => openLifecycleDialog("reactivate")}>Reactivate</Button> : null}
          </Alert>
        ) : null}

        <nav className={layoutStyles.sectionNav} aria-label="Employee file sections">
          <a href="#overview">Overview</a>
          <a href="#profile">Profile</a>
          <a href="#employment">Employment</a>
          <a href="#checklist">Checklist</a>
          <a href="#working-terms">Working Terms</a>
          <a href="#compliance">Compliance</a>
          <a href="#passport">Right to work</a>
          <a href="#licence">Licence</a>
          <a href="#emergency">Emergency</a>
          <a href="#documents">Documents</a>
          <a href="#access">Access & pay</a>
        </nav>

        {/* Content */}
        <div className={layoutStyles.contentGrid}>
          {/* LEFT: Form */}
          <div className={layoutStyles.formPanel}>
            {loading ? (
              <div style={{ padding: 14, color: UI.muted, fontWeight: 800 }}>Loading employee…</div>
            ) : !authAccess.isAdmin ? (
              <Alert variant="danger">Only administrators can open private employee personnel files.</Alert>
            ) : (
              <form
                id="edit-employee-form"
                onSubmit={handleSubmit}
                className={`${layoutStyles.extracted5} ${layoutStyles.employeeForm}`}
              >
                <section id="overview" className={layoutStyles.formSection}>
                  <div className={layoutStyles.sectionHeading}>
                    <span><ShieldCheck size={18} /></span>
                    <div>
                      <h2>Personnel overview</h2>
                      <p>Employment, onboarding, compliance and absence information in one place.</p>
                    </div>
                  </div>
                  <div className={layoutStyles.overviewGrid}>
                    <a href="#employment" className={layoutStyles.overviewCard}>
                      <span>Employment</span>
                      <strong>{formData.employmentStatus || "Active"}</strong>
                      <small>{formData.startDate ? `Started ${formatUkDate(formData.startDate)}` : "Start date missing"}</small>
                    </a>
                    <a href="#checklist" className={layoutStyles.overviewCard}>
                      <span>Onboarding</span>
                      <strong>{onboardingProgress.complete}/{onboardingProgress.total}</strong>
                      <small>{onboardingProgress.percentage}% complete</small>
                    </a>
                    <a href="#compliance" className={layoutStyles.overviewCard} data-tone={complianceSummary.tone}>
                      <span>Compliance</span>
                      <strong>{complianceSummary.dueWithin90Days}</strong>
                      <small>{complianceSummary.dueWithin90Days ? "items due within 90 days" : "No upcoming expiries"}</small>
                    </a>
                    <a href="#absence" className={layoutStyles.overviewCard}>
                      <span>Absence this year</span>
                      <strong>{absenceSummary.approvedPaidDays} days</strong>
                      <small>{absenceSummary.sickDays} sick · {absenceSummary.pendingRequests} pending</small>
                    </a>
                  </div>
                  {complianceSummary.dueItems.length ? (
                    <Alert variant={complianceSummary.tone}>
                      <AlertTriangle size={17} /> {complianceSummary.dueItems.length} compliance item{complianceSummary.dueItems.length === 1 ? " needs" : "s need"} attention within 90 days.
                    </Alert>
                  ) : null}
                  <div id="absence" className={layoutStyles.absenceSummary}>
                    <div><span>Holiday allowance</span><strong>{absenceSummary.allowance || "—"}</strong></div>
                    <div><span>Paid used</span><strong>{absenceSummary.approvedPaidDays}</strong></div>
                    <div><span>Paid remaining</span><strong>{absenceSummary.allowance ? absenceSummary.remainingPaidDays : "—"}</strong></div>
                    <div><span>Sick days</span><strong>{absenceSummary.sickDays}</strong></div>
                    <div><span>Next leave</span><strong>{formatUkDate(absenceSummary.nextLeaveDate, "None")}</strong></div>
                    <div className={layoutStyles.absenceLinks}>
                      <Button as="a" href={`/holiday-usage?employeeId=${employeeId}`} variant="secondary" size="sm"><CalendarClock size={15} /> Holiday details</Button>
                      <Button as="a" href={`/sick-leave?employeeId=${employeeId}`} variant="secondary" size="sm">Sick leave</Button>
                    </div>
                  </div>
                </section>

                <section id="profile" className={layoutStyles.formSection}>
                  <div className={layoutStyles.sectionHeading}>
                    <span><UserRound size={18} /></span>
                    <div>
                      <h2>Profile & contact</h2>
                      <p>The details used throughout bookings, timesheets and staff records.</p>
                    </div>
                  </div>
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
                </section>

                <section id="employment" className={layoutStyles.formSection}>
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
                      <select
                        name="employmentStatus"
                        value={formData.employmentStatus}
                        onChange={handleChange}
                        style={inputBase}
                        disabled={employmentInactive}
                      >
                        <option value="Active">Active</option>
                        <option value="Probation">Probation</option>
                        <option value="On leave">On leave</option>
                        {isEmploymentInactive(formData.employmentStatus) ? (
                          <option value={formData.employmentStatus}>{formData.employmentStatus} — managed below</option>
                        ) : null}
                      </select>
                      {employmentInactive ? <div style={helperStyle}>Use Reactivate employee below to return this person to active employment.</div> : null}
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

                  <div className={layoutStyles.lifecyclePanel} data-status={String(formData.employmentStatus || "active").toLowerCase()}>
                    <div className={layoutStyles.lifecycleHeader}>
                      <span className={layoutStyles.lifecycleIcon}><History size={18} /></span>
                      <div>
                        <span>Employment lifecycle</span>
                        <strong>{formData.employmentStatus || "Active"}</strong>
                        <small>
                          {formData.employmentStatusEffectiveDate
                            ? `Effective ${formatUkDate(formData.employmentStatusEffectiveDate)}`
                            : "No status change recorded"}
                          {formData.expectedReturnDate ? ` · Expected back ${formatUkDate(formData.expectedReturnDate)}` : ""}
                        </small>
                      </div>
                      <Badge variant={employmentBadgeVariant(formData.employmentStatus, formData.archived)}>
                        {formData.archived ? "Archived" : formData.employmentStatus || "Active"}
                      </Badge>
                    </div>

                    {formData.employmentStatusReason ? (
                      <p className={layoutStyles.lifecycleReason}>{formData.employmentStatusReason}</p>
                    ) : null}

                    {isAdmin && !formData.archived ? (
                      <div className={layoutStyles.lifecycleActions}>
                        {employmentInactive ? (
                          <Button type="button" size="sm" onClick={() => openLifecycleDialog("reactivate")}>
                            <PlayCircle size={15} /> Reactivate employee
                          </Button>
                        ) : (
                          <>
                            <Button type="button" size="sm" variant="secondary" onClick={() => openLifecycleDialog("pause")}>
                              <PauseCircle size={15} /> Pause employment
                            </Button>
                            <Button type="button" size="sm" variant="danger" onClick={() => openLifecycleDialog("end")}>
                              <UserMinus size={15} /> End employment
                            </Button>
                          </>
                        )}
                      </div>
                    ) : null}

                    {(formData.employmentHistory || []).length ? (
                      <details className={layoutStyles.lifecycleHistory}>
                        <summary>View employment history ({formData.employmentHistory.length})</summary>
                        <ol>
                          {[...(formData.employmentHistory || [])].reverse().slice(0, 8).map((entry, index) => (
                            <li key={entry.id || `${entry.changedAt}-${index}`}>
                              <span><strong>{entry.status || entry.action}</strong><small>{formatUkDate(entry.effectiveDate, "No date")}</small></span>
                              <p>{entry.reason || "No reason recorded"}</p>
                              <small>{entry.changedBy ? `Changed by ${entry.changedBy}` : ""}</small>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                </section>

                <section id="checklist" className={layoutStyles.formSection}>
                  <div className={layoutStyles.sectionHeading}>
                    <span><ListChecks size={18} /></span>
                    <div>
                      <h2>{employmentEnded ? "Offboarding checklist" : "Onboarding checklist"}</h2>
                      <p>Evidence-backed tasks complete automatically; administrative confirmations remain manual and audited.</p>
                    </div>
                  </div>
                  <div className={layoutStyles.checklistProgress}>
                    <div>
                      <span>{employmentEnded ? "Offboarding" : "Onboarding"}</span>
                      <strong>
                        {employmentEnded ? offboardingProgress.complete : onboardingProgress.complete}/
                        {employmentEnded ? offboardingProgress.total : onboardingProgress.total} complete
                      </strong>
                    </div>
                    <span className={layoutStyles.progressTrack}>
                      <span style={{ width: `${employmentEnded ? offboardingProgress.percentage : onboardingProgress.percentage}%` }} />
                    </span>
                  </div>
                  <div className={layoutStyles.checklistList}>
                    {(employmentEnded ? offboardingChecklist : onboardingChecklist).map((item) => (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={item.completed}
                        key={item.id}
                        disabled={item.completedBy === "System"}
                        onClick={() =>
                          toggleChecklistItem(
                            employmentEnded ? "offboardingChecklist" : "onboardingChecklist",
                            employmentEnded ? offboardingChecklist : onboardingChecklist,
                            item
                          )
                        }
                      >
                        <span>{item.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
                        <span><strong>{item.label}</strong><small>{item.completedBy === "System" ? "Completed from personnel evidence" : item.completed ? `Completed by ${item.completedBy || "administrator"}` : "Mark complete"}</small></span>
                      </button>
                    ))}
                  </div>
                </section>

                <section id="working-terms" className={layoutStyles.formSection}>
                  <div className={layoutStyles.sectionHeading}>
                    <span><FileSignature size={18} /></span>
                    <div>
                      <h2>Working Terms</h2>
                      <p>Read-only acceptance evidence captured by the Bickers app.</p>
                    </div>
                    {workingTermsStatus ? <Badge variant={workingTermsStatus.tone}>{workingTermsStatus.label}</Badge> : null}
                  </div>

                  {workingTermsError ? <Alert variant="warning">{workingTermsError}</Alert> : null}
                  {!workingTermsError && !workingTermsStatus ? (
                    <div className={layoutStyles.termsLoading}>Loading signature record…</div>
                  ) : null}
                  {workingTermsStatus?.key === "unsigned" ? (
                    <Alert variant="warning">No Working Terms acceptance record is linked to this employee.</Alert>
                  ) : null}
                  {workingTermsStatus?.record ? (
                    <div className={layoutStyles.termsRecord}>
                      <dl className={layoutStyles.termsFacts}>
                        <div><dt>Signed by</dt><dd>{workingTermsStatus.record.fullName || "Not recorded"}</dd></div>
                        <div><dt>Signed</dt><dd>{formatWorkingTermsDate(workingTermsStatus.record.acceptedAt)}</dd></div>
                        <div><dt>Document</dt><dd>{workingTermsStatus.record.documentTitle || "Bickers Action Working Terms"}</dd></div>
                        <div><dt>Version</dt><dd>{workingTermsStatus.record.documentVersion || "Not recorded"}</dd></div>
                        <div><dt>Effective date</dt><dd>{workingTermsStatus.record.documentEffectiveDate || "Not recorded"}</dd></div>
                        <div><dt>Account email</dt><dd>{workingTermsStatus.record.email || "Not recorded"}</dd></div>
                        <div><dt>App version</dt><dd>{workingTermsStatus.record.signedFromAppVersion || "Not recorded"}</dd></div>
                        <div><dt>Platform</dt><dd>{workingTermsStatus.record.signedFromPlatform || "Not recorded"}</dd></div>
                      </dl>
                      <div className={layoutStyles.signatureRecord}>
                        <span>Captured signature</span>
                        <svg viewBox="0 0 390 180" role="img" aria-label={`Signature captured for ${workingTermsStatus.record.fullName || "employee"}`}>
                          <path d={workingTermsStatus.record.signatureSvgPath || ""} />
                        </svg>
                      </div>
                      <div className={layoutStyles.termsActions}>
                        <Button as="a" href="bickersapp://working-terms" variant="secondary">
                          <ExternalLink size={15} /> View Working Terms in app
                        </Button>
                        <small>This acceptance is immutable and cannot be edited from the personnel file.</small>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section id="compliance" className={layoutStyles.formSection}>
                  <div className={layoutStyles.sectionHeading}>
                    <span><ShieldCheck size={18} /></span>
                    <div>
                      <h2>Personnel compliance</h2>
                      <p>Expiry dates are evaluated automatically using the 90, 60 and 30-day warning policy.</p>
                    </div>
                  </div>
                  <div className={layoutStyles.complianceList}>
                    {complianceSummary.items.map((item) => (
                      <a key={item.key} href={item.href} data-tone={item.tone}>
                        <span><strong>{item.label}</strong><small>{formatUkDate(item.expiryDate, "Expiry date not recorded")}</small></span>
                        <Badge variant={item.tone}>
                          {item.state === "overdue"
                            ? `${Math.abs(item.daysRemaining)} days overdue`
                            : item.daysRemaining == null
                              ? "Missing date"
                              : item.state === "current"
                                ? "Current"
                                : `${item.daysRemaining} days left`}
                        </Badge>
                      </a>
                    ))}
                  </div>
                </section>

                <section id="passport" className={layoutStyles.formSection}>
                  <div>
                    <div style={personnelHeader}>Passport & Right To Work</div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Images and PDFs are read by the configured AI document service. Check every extracted value before saving.
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
                      <label style={labelStyle}>Passport document</label>
                      <PersonnelDocumentViewer
                        url={formData.passport?.documentUrl || ""}
                        title={`${formData.name || "Employee"} passport`}
                        type="Passport"
                      />
                      <details className={layoutStyles.advancedLink}>
                        <summary>Edit document URL</summary>
                        <input
                          type="url"
                          value={formData.passport?.documentUrl || ""}
                          onChange={(e) => handleNestedChange("passport", "documentUrl", e.target.value)}
                          style={inputBase}
                          placeholder="https://..."
                        />
                      </details>
                    </div>

                    <div>
                      <label style={labelStyle}>Upload passport file</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setPassportFile(file);
                          if (file) extractPersonnelDocument(file, "passport");
                        }}
                        style={inputBase}
                      />
                      <div style={helperStyle}>
                        {passportFile
                          ? `${passportFile.name} selected${uploadProgress.passport != null ? ` - ${uploadProgress.passport}% uploaded` : ""}`
                          : "Choose an image or PDF to read its details, then save to upload it."}
                      </div>
                      {documentExtraction.passport.message ? (
                        <div
                          role="status"
                          style={{
                            ...helperStyle,
                            marginTop: 5,
                            color: documentExtraction.passport.status === "error" ? "var(--color-danger)" : UI.text,
                          }}
                        >
                          {documentExtraction.passport.message}
                        </div>
                      ) : null}
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
                </section>

                <section id="licence" className={layoutStyles.formSection}>
                  <div>
                    <div style={personnelHeader}>Driving Licence</div>
                    <div style={{ color: UI.muted, fontSize: 12 }}>
                      Images and PDFs are read for visible details. Licence number is also saved as <span className={layoutStyles.extracted12}>licenceNumber</span> for existing booking screens.
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
                      <label style={labelStyle}>Country of issue</label>
                      <input
                        value={formData.drivingLicence?.countryOfIssue || ""}
                        onChange={(e) => handleNestedChange("drivingLicence", "countryOfIssue", e.target.value)}
                        style={inputBase}
                        placeholder="United Kingdom"
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Issue date</label>
                      <input
                        type="date"
                        value={formData.drivingLicence?.issueDate || ""}
                        onChange={(e) => handleNestedChange("drivingLicence", "issueDate", e.target.value)}
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
                      <div style={helperStyle}>UK photocard licences do not normally print current penalty points; enter them manually if they are not visible.</div>
                    </div>

                    <div>
                      <label style={labelStyle}>Licence document</label>
                      <PersonnelDocumentViewer
                        url={formData.drivingLicence?.documentUrl || ""}
                        title={`${formData.name || "Employee"} driving licence`}
                        type="Driving licence"
                      />
                      <details className={layoutStyles.advancedLink}>
                        <summary>Edit document URL</summary>
                        <input
                          type="url"
                          value={formData.drivingLicence?.documentUrl || ""}
                          onChange={(e) => handleNestedChange("drivingLicence", "documentUrl", e.target.value)}
                          style={inputBase}
                          placeholder="https://..."
                        />
                      </details>
                    </div>

                    <div className={layoutStyles.extracted14}>
                      <label style={labelStyle}>Upload licence file</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setDrivingLicenceFile(file);
                          if (file) extractPersonnelDocument(file, "drivingLicence");
                        }}
                        style={inputBase}
                      />
                      <div style={helperStyle}>
                        {drivingLicenceFile
                          ? `${drivingLicenceFile.name} selected${uploadProgress.drivingLicence != null ? ` - ${uploadProgress.drivingLicence}% uploaded` : ""}`
                          : "Choose an image or PDF to read its details, then save to upload it."}
                      </div>
                      {documentExtraction.drivingLicence.message ? (
                        <div
                          role="status"
                          style={{
                            ...helperStyle,
                            marginTop: 5,
                            color: documentExtraction.drivingLicence.status === "error" ? "var(--color-danger)" : UI.text,
                          }}
                        >
                          {documentExtraction.drivingLicence.message}
                        </div>
                      ) : null}
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
                </section>

                <section id="emergency" className={layoutStyles.formSection}>
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
                </section>

                <section id="medical" className={layoutStyles.formSection}>
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
                </section>

                <section id="documents" className={layoutStyles.formSection}>
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

                  <div className={layoutStyles.documentList}>
                  {(formData.personnelDocuments || []).map((documentRow, index) => (
                    <details
                      key={index}
                      className={layoutStyles.documentDisclosure}
                      open={!!expandedDocuments[index]}
                      onToggle={(event) => {
                        const isOpen = event.currentTarget.open;
                        setExpandedDocuments((prev) =>
                          prev[index] === isOpen ? prev : { ...prev, [index]: isOpen }
                        );
                      }}
                    >
                      <summary className={layoutStyles.documentSummary}>
                        <span className={layoutStyles.documentNumber}>{index + 1}</span>
                        <span className={layoutStyles.documentIdentity}>
                          <strong>{documentRow.title || `Untitled document ${index + 1}`}</strong>
                          <span>{[documentRow.type, documentRow.reference].filter(Boolean).join(" · ") || "No type or reference"}</span>
                        </span>
                        {documentRow.expiryDate ? (
                          <span className={layoutStyles.documentExpiry}>Review {documentRow.expiryDate}</span>
                        ) : null}
                        <ChevronDown size={17} aria-hidden="true" />
                      </summary>
                      <div className={layoutStyles.documentEditor}>
                        <div className={layoutStyles.documentEditorActions}>
                          <span>Edit document details</span>
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
                          <label style={labelStyle}>Saved document</label>
                          <PersonnelDocumentViewer
                            url={documentRow.documentUrl || ""}
                            title={documentRow.title || `Document ${index + 1}`}
                            type={documentRow.type || "Personnel document"}
                            compact
                          />
                          <details className={layoutStyles.advancedLink}>
                            <summary>Edit document URL</summary>
                            <input
                              type="url"
                              value={documentRow.documentUrl || ""}
                              onChange={(e) => updatePersonnelDocument(index, "documentUrl", e.target.value)}
                              style={inputBase}
                              placeholder="https://..."
                            />
                          </details>
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
                    </details>
                  ))}
                  </div>
                </section>

                <section id="roles" className={layoutStyles.formSection}>
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
                </section>

                <section id="access" className={layoutStyles.formSection}>
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

                    <button
                      type="button"
                      onClick={handleFinanceAccessToggle}
                      disabled={financeAccessBusy || !(formData.authUid || formData.uid)}
                      style={{
                        ...btn(formData.financeAccess ? "primary" : "ghost"),
                        justifyContent: "space-between",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <span>Finance access</span>
                      <span>{financeAccessBusy ? "Saving…" : formData.financeAccess ? "On" : "Off"}</span>
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
                </section>

                {isAdmin ? (
                  <section id="payroll" className={layoutStyles.formSection}>
                    <div>
                      <div style={{ fontWeight: 800, color: UI.text, marginBottom: 5, fontSize: 15 }}>
                        Working Schedule
                      </div>
                      <WorkScheduleEditor
                        value={formData.workSchedule}
                        onChange={(workSchedule) => setFormData((previous) => ({ ...previous, workSchedule }))}
                      />
                    </div>

                    <div style={{ borderTop: UI.border, paddingTop: 12 }}>
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
                  </div>

                    <div className={layoutStyles.extracted31}>
                      {[
                        ["workshopRate", "Workshop rate"],
                        ["overtimeRate", "Overtime rate"],
                        ["travelRate", "Travel rate (Universal)"],
                        ["sundayRate", "Sunday rate"],
                        ["onSetRate", "Tracking on set (10-hour unit)"],
                        ["onSetOvertimeRate", "Tracking O/T rate"],
                        ["precisionDriverRate", "Precision driver day rate"],
                        ["precisionDriverOvertimeRate", "Precision driver O/T rate"],
                        ["weekendSupplementRate", "Sa/Su/NS/BH unit rate"],
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
                    <details className={layoutStyles.rateHistory}>
                      <summary>Individual rate history ({formData.payrollRateHistory?.length || 0})</summary>
                      {(formData.payrollRateHistory || []).length ? (
                        <ol>
                          {[...(formData.payrollRateHistory || [])].reverse().slice(0, 10).map((entry) => (
                            <li key={entry.id}>
                              <div><strong>{formatUkDate(entry.effectiveDate, "No effective date")}</strong><small>{entry.reason || "No reason"}</small></div>
                              <div>
                                {(entry.changes || []).map((change) => (
                                  <span key={change.field}>{change.field}: {change.from === "" ? "—" : change.from} → {change.to === "" ? "—" : change.to}</span>
                                ))}
                              </div>
                              <small>{entry.changedBy || "Unknown administrator"}</small>
                            </li>
                          ))}
                        </ol>
                      ) : <p>No individual rate changes recorded yet.</p>}
                    </details>
                  </section>
                ) : null}

                <div className={layoutStyles.extracted32}>
                  <Button type="button" variant="secondary" onClick={handleCancel}>Cancel</Button>
                  <Button type="submit" loading={saving}><Save size={16} /> Save changes</Button>
                </div>
              </form>
            )}
          </div>

          {/* RIGHT: Summary */}
          <aside className={layoutStyles.summaryColumn} aria-label="Employee file summary">
            <section className={layoutStyles.summaryCard}>
              {loading ? (
                <div className={layoutStyles.summaryLoading}>Loading employee summary…</div>
              ) : (
                <>
                  <div className={layoutStyles.employeeSummary}>
                    <span className={layoutStyles.avatar}>{getInitials(formData.name)}</span>
                    <div>
                      <div className={layoutStyles.summaryNameRow}>
                        <h2>{formData.name || "Unnamed employee"}</h2>
                        <Badge variant={employmentBadgeVariant(formData.employmentStatus, formData.archived)}>
                          {formData.archived ? "Archived" : formData.employmentStatus || "Active"}
                        </Badge>
                      </div>
                      <p>{formData.email || "No email"}</p>
                      <p>{formData.mobile || "No mobile"}</p>
                    </div>
                  </div>

                  <div className={layoutStyles.completionBlock}>
                    <div className={layoutStyles.completionHeading}>
                      <div>
                        <span>Personnel file readiness</span>
                        <strong>{completedPersonnelSections === 4 ? "File ready" : `${4 - completedPersonnelSections} items need attention`}</strong>
                      </div>
                      <span>{completedPersonnelSections}/4</span>
                    </div>
                    <span className={layoutStyles.progressTrack} aria-label={`${completedPersonnelSections} of 4 personnel file sections complete`}>
                      <span style={{ width: `${completedPersonnelSections * 25}%` }} />
                    </span>
                    <div className={layoutStyles.readinessList}>
                      {personnelReadiness.map((item) => (
                        <a key={item.key} href={item.href} className={item.complete ? layoutStyles.ready : layoutStyles.missing}>
                          {item.complete ? <Check size={15} /> : <Circle size={15} />}
                          <span>{item.label}</span>
                          <small>{item.complete ? "Added" : "Add details"}</small>
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className={layoutStyles.summarySection}>
                    <h3>Role & access</h3>
                    <div className={layoutStyles.badgeList}>
                      {(formData.jobTitle?.length ? formData.jobTitle : ["No role added"]).map((job) => <Badge key={job}>{job}</Badge>)}
                    </div>
                    <div className={layoutStyles.accessRow}>
                      <Badge variant={formData.appAccess.user ? "success" : "neutral"}>User {formData.appAccess.user ? "on" : "off"}</Badge>
                      <Badge variant={formData.appAccess.service ? "info" : "neutral"}>Service {formData.appAccess.service ? "on" : "off"}</Badge>
                    </div>
                    <p>Effective role: <strong>{effectiveRole}</strong></p>
                  </div>

                  <dl className={layoutStyles.quickFacts}>
                    <div><dt>Employment</dt><dd>{formData.employmentStatus || "Not added"}</dd></div>
                    <div><dt>Started</dt><dd>{formatUkDate(formData.startDate, "Not added")}</dd></div>
                    <div><dt>Employee code</dt><dd>{formData.employeeCode || "Not added"}</dd></div>
                    <div><dt>Payroll no.</dt><dd>{formData.payrollNumber || "Not added"}</dd></div>
                  </dl>

                  {isAdmin ? (
                    <details className={layoutStyles.payrollSummary}>
                      <summary>Payroll rate summary <ChevronDown size={15} /></summary>
                      <div>
                        {[
                          ["Workshop", formData.payrollRates?.workshopRate],
                          ["Overtime", formData.payrollRates?.overtimeRate],
                          ["Travel", globalPayrollRates?.travelRate],
                          ["Sunday", formData.payrollRates?.sundayRate],
                          ["On set", formData.payrollRates?.onSetRate],
                          ["On set O/T", formData.payrollRates?.onSetOvertimeRate],
                          ["Precision driver", formData.payrollRates?.precisionDriverRate],
                          ["Precision driver O/T", formData.payrollRates?.precisionDriverOvertimeRate],
                          ["Sa/Su unit", formData.payrollRates?.weekendSupplementRate],
                          ["Overnight", globalPayrollRates?.overnightRate],
                          ["Travel meal", globalPayrollRates?.travelMealRate],
                        ].map(([label, value]) => (
                          <div key={label}><span>{label}</span><strong>{value === "" || value == null ? "—" : value}</strong></div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </>
              )}
            </section>

            {completedPersonnelSections < 4 && !loading ? (
              <div className={layoutStyles.attentionCard}>
                <AlertTriangle size={18} />
                <div><strong>File needs attention</strong><span>Complete the highlighted items before treating this personnel file as ready.</span></div>
              </div>
            ) : null}
          </aside>
          </div>
        </div>
      </PeopleFleetPage>

      <Modal
        open={rateChangeOpen}
        onClose={() => setRateChangeOpen(false)}
        eyebrow="Payroll audit"
        title="Record rate change"
        description="An effective date and reason are required whenever employee or shared payroll rates change."
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRateChangeOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={!rateChangeDraft.effectiveDate || !rateChangeDraft.reason.trim()}
              onClick={() => {
                rateChangeApprovalRef.current = { ...rateChangeDraft, reason: rateChangeDraft.reason.trim() };
                setRateChangeOpen(false);
                setTimeout(() => document.getElementById("edit-employee-form")?.requestSubmit(), 0);
              }}
            >
              <Save size={16} /> Record and save
            </Button>
          </>
        }
      >
        <div className={layoutStyles.lifecycleModalBody}>
          <FormField label="Effective date" required>
            <Input type="date" value={rateChangeDraft.effectiveDate} onChange={(event) => setRateChangeDraft((current) => ({ ...current, effectiveDate: event.target.value }))} />
          </FormField>
          <FormField label="Reason" required help="For example: annual review, role change or company rate update.">
            <Textarea rows={4} value={rateChangeDraft.reason} onChange={(event) => setRateChangeDraft((current) => ({ ...current, reason: event.target.value }))} />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={Boolean(lifecycleAction)}
        onClose={() => !lifecycleSaving && setLifecycleAction("")}
        eyebrow={lifecycleDialogCopy?.eyebrow}
        title={lifecycleDialogCopy?.title || "Change employment status"}
        description={lifecycleDialogCopy?.description}
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setLifecycleAction("")} disabled={lifecycleSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={lifecycleAction === "end" ? "danger" : "primary"}
              loading={lifecycleSaving}
              onClick={handleLifecycleAction}
            >
              {lifecycleAction === "pause" ? <PauseCircle size={16} /> : lifecycleAction === "end" ? <UserMinus size={16} /> : <PlayCircle size={16} />}
              {lifecycleDialogCopy?.confirm || "Confirm change"}
            </Button>
          </>
        }
      >
        <div className={layoutStyles.lifecycleModalBody}>
          {saveError ? <Alert variant="danger">{saveError}</Alert> : null}
          <FormField
            label={lifecycleAction === "end" ? "Last day of employment" : "Effective date"}
            required
          >
            <Input
              type="date"
              value={lifecycleDraft.effectiveDate}
              onChange={(event) => setLifecycleDraft((current) => ({ ...current, effectiveDate: event.target.value }))}
            />
          </FormField>
          {lifecycleAction === "pause" ? (
            <FormField label="Expected return date" help="Optional — this can be changed later.">
              <Input
                type="date"
                min={lifecycleDraft.effectiveDate || undefined}
                value={lifecycleDraft.expectedReturnDate}
                onChange={(event) => setLifecycleDraft((current) => ({ ...current, expectedReturnDate: event.target.value }))}
              />
            </FormField>
          ) : null}
          <FormField
            label={lifecycleAction === "reactivate" ? "Return note" : "Reason"}
            help="Required for the employment history and audit trail."
            required
          >
            <Textarea
              rows={4}
              value={lifecycleDraft.reason}
              onChange={(event) => setLifecycleDraft((current) => ({ ...current, reason: event.target.value }))}
              placeholder={
                lifecycleAction === "pause"
                  ? "For example: seasonal pause, extended leave or temporary suspension"
                  : lifecycleAction === "end"
                    ? "For example: resignation, end of contract or redundancy"
                    : "For example: returned from seasonal pause"
              }
            />
          </FormField>
          <Alert variant="info">
            Historic bookings, timesheets, documents and payroll records will be retained.
          </Alert>
        </div>
      </Modal>
    </HeaderSidebarLayout>
  );
}
