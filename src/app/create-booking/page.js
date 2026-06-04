"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { auth, db, getFirebaseStorageTools } from "@/app/utils/firebaseClient";
import { collection, addDoc, getDocs, doc, setDoc } from "firebase/firestore";
import {
  contactIdFromEmail,
  employeesKey,
  normalizeVehicleKeysListForLookup,
  uniqEmpObjects,
} from "@/app/utils/bookingFormShared";
import {
  loadBookingFormReferenceData,
  loadSavedContacts,
} from "@/app/utils/bookingFormReferenceData";
import {
  holidayDateKeysFromRecord,
  loadBookingAvailabilityForDates,
  loadVehicleChecksForVehicles,
} from "@/app/utils/bookingAvailability";
import { getCanonicalDueDate, ymd as toYmd } from "@/app/utils/maintenanceSchema";
import {
  buildBookingDerivedFields,
  buildInitialLifecycle,
  buildInitialStatusHistory,
} from "@/app/utils/bookingLifecycle";
import { useUnsavedChangesGuard } from "@/app/utils/unsavedChanges";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { companyStoragePath } from "@/app/utils/storageAccess";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Package,
  Save,
  Search,
  Truck,
  Users,
} from "lucide-react";

const DRAFTS_STORAGE_KEY = "create-booking:drafts:v1";
const OFF_ROAD_STATUS_FIELDS = ["status", "vehicleStatus", "operationalStatus", "availabilityStatus", "fleetStatus"];

/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens + shared styles
──────────────────────────────────────────────────────────────────────────── */
const UI = {
  radius: 8,
  radiusSm: 8,
  radiusXs: 8,
  shadow: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#ffffff",
  bgAlt: "#f8fafc",
  page: "#f3f6f9",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  green: "#15803d",
  greenSoft: "#ecfdf3",
  greenBorder: "#bbf7d0",
  amber: "#b45309",
  amberSoft: "#fffbeb",
  amberBorder: "#fde68a",
  red: "#b91c1c",
  redSoft: "#fff1f2",
  redBorder: "#fecdd3",
};

const pageWrap = {
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: UI.page,
  padding: "16px 16px 32px",
};

const mainWrap = {
  color: UI.text,
  width: "100%",
};

const h1Style = {
  color: UI.text,
  marginBottom: 0,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: 0,
};

const pageHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap",
};

const headerChecks = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const headerChecksBox = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  padding: "10px 12px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: UI.bg,
  boxShadow: UI.shadow,
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 0.78fr) minmax(420px, 1.1fr) minmax(420px, 1.12fr)",
  gap: 12,
  marginTop: 10,
};

const card = {
  background: UI.bg,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadow,
  padding: 12,
};
const formShell = {
  display: "grid",
  gap: 12,
};
const seamlessSection = {
  ...card,
};
const cardTitle = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: UI.text,
  letterSpacing: 0,
};

const field = {
  label: {
    display: "block",
    fontWeight: 800,
    marginTop: 10,
    marginBottom: 5,
    color: UI.muted,
    fontSize: 11.5,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    width: "100%",
    height: 36,
    padding: "7px 9px",
    fontSize: 13,
    borderRadius: UI.radiusXs,
    border: UI.border,
    background: "#fff",
    color: UI.text,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 80,
    padding: "9px 10px",
    fontSize: 13,
    borderRadius: UI.radiusXs,
    border: UI.border,
    background: "#fff",
    color: UI.text,
    boxSizing: "border-box",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 8,
  },
};

const accordionBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 12.5,
  color: UI.text,
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 8px",
  fontSize: 12,
  borderRadius: 999,
  background: UI.brandSoft,
  border: `1px solid ${UI.brandBorder}`,
  color: UI.brand,
  fontWeight: 700,
};

const divider = { height: 1, background: "#e2e8f0", margin: "12px 0" };

const checkboxGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(160px, 210px))",
  gap: "7px 28px",
  alignItems: "start",
};

const driverCheckboxGrid = {
  ...checkboxGrid,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "7px 16px",
};

const personCheckboxLabel = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 3,
  fontSize: 13.5,
  lineHeight: 1.25,
};

const actionsRow = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 16,
};

const subCard = {
  padding: 10,
  borderRadius: UI.radiusSm,
  background: UI.bgAlt,
  border: "1px solid #e2e8f0",
};

const DatePicker = dynamic(() => import("react-multi-date-picker"), {
  ssr: false,
  loading: () => <div style={{ ...field.input, color: UI.muted }}>Loading dates...</div>,
});

const btn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radiusXs,
  border: `1px solid ${UI.brand}`,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
};
const btnPrimary = {
  ...btn,
  background: UI.brand,
  color: "#fff",
  boxShadow: "0 8px 18px rgba(31,75,122,0.16)",
};
const btnGhost = {
  ...btn,
  background: "#fff",
  color: UI.text,
  border: `1px solid ${UI.brandBorder}`,
};

const summaryCard = {
  ...subCard,
  background: UI.bg,
  color: UI.text,
  border: UI.border,
  boxShadow: UI.shadow,
};

const summaryRow = {
  display: "grid",
  gridTemplateColumns: "150px 1fr",
  gap: 10,
  padding: "7px 0",
  borderBottom: "1px dashed #d6e0ea",
};
const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 8,
};
const summarySection = {
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: "#f8fafc",
  padding: "8px 10px",
};
const summarySectionTitle = {
  margin: "0 0 5px",
  fontSize: 11,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0,
};
const summaryCompactRow = {
  ...summaryRow,
  gridTemplateColumns: "82px 1fr",
  gap: 8,
  padding: "3px 0",
  borderBottom: "none",
  fontSize: 12.5,
};
const summaryLabel = { color: UI.muted, fontWeight: 800 };
const summaryValue = { color: UI.text, fontWeight: 600, minWidth: 0 };
const summaryPill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: UI.border,
  background: UI.bgAlt,
  borderRadius: 999,
  padding: "2px 7px",
  marginRight: 5,
  marginBottom: 5,
  fontSize: 12,
};
const SummaryRow = ({ label, children }) => (
  <div style={summaryCompactRow}>
    <div style={summaryLabel}>{label}</div>
    <div style={summaryValue}>{children || "-"}</div>
  </div>
);
const formatSummaryDate = (date) => {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
};
const formatSummaryDates = (dates) => dates.map(formatSummaryDate).filter(Boolean).join(", ");
const formatSummaryCallTimes = (dates, times, fallback = "") => {
  const picked = dates
    .map((date) => [formatSummaryDate(date), times?.[date]])
    .filter(([, time]) => time)
    .map(([date, time]) => `${date} ${time}`);
  return picked.length ? picked.join(", ") : fallback || "-";
};

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 32,
  height: 32,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const pageSub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const sectionTitleRow = { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 };
const focusCss = `
  input:focus, select:focus, textarea:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
  @media (max-width: 1280px) {
    .create-booking-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 760px) {
    .create-booking-two,
    .create-booking-assets,
    .create-booking-crew-box,
    .create-booking-hotel { grid-template-columns: 1fr !important; }
  }
`;

/* ────────────────────────────────────────────────────────────────────────────
   Status + blocking
──────────────────────────────────────────────────────────────────────────── */
const VEHICLE_STATUSES = [
  "Confirmed",
  "Bickers",
  "First Pencil",
  "Second Pencil",
  "Enquiry",
  "Stunt",
  "Maintenance",
  "DNH",
  "Lost",
  "Postponed",
  "Cancelled",
  "Complete",
];

const SECOND_PENCIL_STATUS = "Second Pencil";
const BLOCKING_STATUSES = ["Confirmed", "First Pencil", SECOND_PENCIL_STATUS];
const SECOND_PENCIL_BLOCKING_STATUSES = [SECOND_PENCIL_STATUS, "Maintenance"];
const doesBlockBooking = (b) => BLOCKING_STATUSES.includes((b.status || "").trim());
const isVehicleBlockingStatus = (status) => {
  const s = (status || "").trim();
  return BLOCKING_STATUSES.includes(s) || s === "Maintenance";
};
const existingVehicleStatusConflictsWithRequested = (existingStatuses = [], requestedStatus = "") => {
  const requested = (requestedStatus || "").trim();
  const existing = existingStatuses.map((s) => (s || "").trim()).filter(Boolean);
  if (!isVehicleBlockingStatus(requested)) return false;
  if (requested === SECOND_PENCIL_STATUS) {
    return existing.some((s) => SECOND_PENCIL_BLOCKING_STATUSES.includes(s));
  }
  return existing.some((s) => isVehicleBlockingStatus(s));
};

const OFF_ROAD_ALLOWED_GROUPS = new Set([
  "bike",
  "electric tracking vehicles",
  "small tracking vehicles",
]);
const isOffRoadAllowedGroup = (group) =>
  OFF_ROAD_ALLOWED_GROUPS.has(String(group || "").trim().toLowerCase());

/* ────────────────────────────────────────────────────────────────────────────
   UTC day helpers
──────────────────────────────────────────────────────────────────────────── */
const parseYMD_UTC = (ymd) => {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};
const formatYMD_UTC = (dt) => dt.toISOString().slice(0, 10);
const addDaysUTC = (dt, n) => {
  const copy = new Date(dt.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
};
const enumerateDaysYMD_UTC = (startYMD, endYMD) => {
  const start = parseYMD_UTC(startYMD);
  const end = parseYMD_UTC(endYMD);
  if (!start || !end) return [];
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(formatYMD_UTC(cur));
    cur = addDaysUTC(cur, 1);
  }
  return out;
};

const expandBookingDates = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) return b.bookingDates;
  const one = (b.date || "").slice(0, 10);
  const s = (b.startDate || "").slice(0, 10);
  const e = (b.endDate || "").slice(0, 10);
  if (one) return [one];
  if (s && e) return enumerateDaysYMD_UTC(s, e);
  return [];
};

const expandMaintenanceBookingDates = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) return b.bookingDates;

  const appointmentISO = String(b.appointmentDateISO || "").slice(0, 10);
  const startISO = String(b.startDateISO || "").slice(0, 10);
  const endISO = String(b.endDateISO || "").slice(0, 10);
  if (appointmentISO) return [appointmentISO];
  if (startISO && endISO) return enumerateDaysYMD_UTC(startISO, endISO);

  const toYMD = (v) => {
    const d = toJsDate(v);
    return d ? formatYMD_UTC(d) : "";
  };
  const one = toYMD(b.appointmentDate || b.date);
  const s = toYMD(b.startDate || b.date || b.start);
  const e = toYMD(b.endDate || b.end || b.startDate || b.date);
  if (one) return [one];
  if (s && e) return enumerateDaysYMD_UTC(s, e);
  return [];
};

const anyDateOverlap = (datesA, datesB) => {
  if (!Array.isArray(datesA) || !Array.isArray(datesB)) return false;
  if (!datesA.length || !datesB.length) return false;
  const setA = new Set(datesA);
  return datesB.some((d) => setA.has(d));
};

/* ────────────────────────────────────────────────────────────────────────────
   Travel + time options
──────────────────────────────────────────────────────────────────────────── */
const buildTravelDurationOptions = () => {
  const out = [];
  for (let mins = 15; mins <= 360; mins += 15) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const label = h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
    out.push({ value: String(mins), label });
  }
  return out;
};
const TRAVEL_DURATION_OPTIONS = buildTravelDurationOptions();

const buildTimeOptions = () => {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
};
const TIME_OPTIONS = buildTimeOptions();

const createDraftId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}`;
};

const readDraftMap = () => {
  try {
    const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeDraftMap = (map) => {
  try {
    window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(map || {}));
  } catch {
    // noop
  }
};

const removeDraftEntry = (draftId) => {
  if (!draftId || typeof window === "undefined") return;
  const next = { ...readDraftMap() };
  delete next[draftId];
  writeDraftMap(next);
};

/* ────────────────────────────────────────────────────────────────────────────
   Contacts helpers
──────────────────────────────────────────────────────────────────────────── */
const FILM_DEPARTMENTS = [
  "Production",
  "Director",
  "Assistant Director",
  "Locations",
  "Art Department",
  "Camera",
  "Grip",
  "Electric",
  "Costume",
  "Makeup & Hair",
  "Stunts",
  "Sound",
  "Post-Production",
  "Other",
];

/* ────────────────────────────────────────────────────────────────────────────
   Employee helpers
──────────────────────────────────────────────────────────────────────────── */
const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

/* ────────────────────────────────────────────────────────────────────────────
   Vehicle lookup: id / reg / name
──────────────────────────────────────────────────────────────────────────── */
const toJsDate = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw?.toDate === "function") return raw.toDate();
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
};

/* ────────────────────────────────────────────────────────────────────────────
   Create Booking Page
──────────────────────────────────────────────────────────────────────────── */
export default function CreateBookingPage({ initialStatus = "Confirmed" } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authAccess = useAuth() || {};
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.user, authAccess.userDoc]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const draftIdFromQuery = searchParams.get("draft") || "";
  const statusFromQuery = searchParams.get("status") === "Enquiry" ? "Enquiry" : initialStatus;
  const hydratedDraftRef = useRef(false);

  // Core fields
  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");

  const [status, setStatus] = useState(statusFromQuery);
  const [shootType, setShootType] = useState("Day");

  const [statusReasons, setStatusReasons] = useState([]);
  const [statusReasonOther, setStatusReasonOther] = useState("");

  // Dates
  const [isRange, setIsRange] = useState(false);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [customDates, setCustomDates] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Notes per day
  const [notesByDate, setNotesByDate] = useState({});
  const [notes, setNotes] = useState("");

  // Call times
  const [callTime, setCallTime] = useState("");
  const [callTimesByDate, setCallTimesByDate] = useState({});

  // Hotel / rigging
  const [hasHotel, setHasHotel] = useState(false);
  const [hotelPaidBy, setHotelPaidBy] = useState("");
  const [hotelNights, setHotelNights] = useState("");
  const [hotelPricePerNight, setHotelPricePerNight] = useState("");
  const [hasRiggingAddress, setHasRiggingAddress] = useState(false);
  const [riggingAddress, setRiggingAddress] = useState("");

  // Flags
  const [isSecondPencil, setIsSecondPencil] = useState(false);
  const [isCrewed, setIsCrewed] = useState(false);
  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);
  const [offRoadTracking, setOffRoadTracking] = useState(false);

  // Crew requirement is guidance only. "Crewed" is controlled manually.
  const [requiredCrewCount, setRequiredCrewCount] = useState(1);

  // Employees
  const [employees, setEmployees] = useState([]); // [{role,name}]
  const [employeesByDate, setEmployeesByDate] = useState({});
  const [customEmployee, setCustomEmployee] = useState("");

  // Vehicles
  const [vehicles, setVehicles] = useState([]); // vehicleIds
  const [vehicleStatus, setVehicleStatus] = useState({}); // {vehicleId: status}

  // Equipment
  const [equipment, setEquipment] = useState([]);
  const [assetSearch, setAssetSearch] = useState("");

  // Data lists
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [unavailableNotes, setUnavailableNotes] = useState([]);

  const [employeeList, setEmployeeList] = useState([]); // [{id,name}]
  const [freelancerList, setFreelancerList] = useState([]); // [{id,name}]
  const [referenceDataLoading, setReferenceDataLoading] = useState(true);

  const [vehicleGroups, setVehicleGroups] = useState({});
  const [openGroups, setOpenGroups] = useState({});

  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [openEquipGroups, setOpenEquipGroups] = useState({});

  // Lookups
  const [vehicleLookup, setVehicleLookup] = useState({ byId: {}, byReg: {}, byName: {} });

  // Maintenance bookings
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [vehicleChecks, setVehicleChecks] = useState([]);

  // Employee code map
  const [nameToCode, setNameToCode] = useState({});

  // Contacts block (only)
  const [additionalContacts, setAdditionalContacts] = useState([]);
  const [savedContacts, setSavedContacts] = useState([]);
  const [savedContactsLoaded, setSavedContactsLoaded] = useState(false);
  const [savedContactsLoading, setSavedContactsLoading] = useState(false);
  const [selectedSavedContactId, setSelectedSavedContactId] = useState("");
  const [savedContactSearch, setSavedContactSearch] = useState("");

  // Files
  const [attachments, setAttachments] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [activeDraftId, setActiveDraftId] = useState(draftIdFromQuery);

  const isMaintenance = status === "Maintenance";
  const isBickersJob = status === "Bickers";

  // Derived dates
  const selectedDates = useMemo(() => {
    if (useCustomDates) return customDates;
    if (!startDate) return [];
    if (isRange && endDate) return enumerateDaysYMD_UTC(startDate, endDate);
    return [startDate];
  }, [useCustomDates, customDates, startDate, isRange, endDate]);
  const availabilityDateKey = useMemo(
    () => [...selectedDates].filter(Boolean).sort().join("|"),
    [selectedDates]
  );
  const selectedVehicleKey = useMemo(
    () => [...vehicles].filter(Boolean).sort().join("|"),
    [vehicles]
  );

  const coreFilled = isMaintenance
    ? Boolean((location || "").trim())
    : isBickersJob
    ? Boolean((client || "").trim())
    : Boolean((client || "").trim() && (location || "").trim());

  const saveTooltip = isMaintenance
    ? !coreFilled
      ? "Fill Location to save"
      : ""
    : isBickersJob
    ? !coreFilled
      ? "Fill Production to save"
      : ""
    : !coreFilled
    ? "Fill Production and Location to save"
    : "";

  const hotelTotal =
    hasHotel && Number.isFinite(Number(hotelNights)) && Number.isFinite(Number(hotelPricePerNight))
      ? Number(hotelNights || 0) * Number(hotelPricePerNight || 0)
      : 0;

  const draftData = useMemo(
    () => ({
      jobNumber,
      client,
      location,
      status,
      shootType,
      statusReasons,
      statusReasonOther,
      isRange,
      useCustomDates,
      customDates,
      startDate,
      endDate,
      notesByDate,
      notes,
      callTime,
      callTimesByDate,
      hasHotel,
      hotelPaidBy,
      hotelNights,
      hotelPricePerNight,
      hasRiggingAddress,
      riggingAddress,
      isSecondPencil,
      isCrewed,
      hasHS,
      hasRiskAssessment,
      offRoadTracking,
      requiredCrewCount,
      employees,
      employeesByDate,
      customEmployee,
      vehicles,
      vehicleStatus,
      equipment,
      additionalContacts,
    }),
    [
      jobNumber,
      client,
      location,
      status,
      shootType,
      statusReasons,
      statusReasonOther,
      isRange,
      useCustomDates,
      customDates,
      startDate,
      endDate,
      notesByDate,
      notes,
      callTime,
      callTimesByDate,
      hasHotel,
      hotelPaidBy,
      hotelNights,
      hotelPricePerNight,
      hasRiggingAddress,
      riggingAddress,
      isSecondPencil,
      isCrewed,
      hasHS,
      hasRiskAssessment,
      offRoadTracking,
      requiredCrewCount,
      employees,
      employeesByDate,
      customEmployee,
      vehicles,
      vehicleStatus,
      equipment,
      additionalContacts,
    ]
  );

  const hasMeaningfulDraft = useMemo(() => {
    return Boolean(
      (client || "").trim() ||
        (location || "").trim() ||
        (notes || "").trim() ||
        (statusReasonOther || "").trim() ||
        startDate ||
        endDate ||
        (callTime || "").trim() ||
        (hotelPaidBy || "").trim() ||
        (hotelNights || "").trim() ||
        (hotelPricePerNight || "").trim() ||
        (riggingAddress || "").trim() ||
        (customEmployee || "").trim() ||
        status !== "Confirmed" ||
        shootType !== "Day" ||
        isRange ||
        useCustomDates ||
        hasHotel ||
        hasRiggingAddress ||
        isSecondPencil ||
        isCrewed ||
        hasHS ||
        hasRiskAssessment ||
        offRoadTracking ||
        Number(requiredCrewCount) !== 1 ||
        (Array.isArray(statusReasons) && statusReasons.length) ||
        (Array.isArray(customDates) && customDates.length) ||
        (Array.isArray(employees) && employees.length) ||
        (Array.isArray(vehicles) && vehicles.length) ||
        (Array.isArray(equipment) && equipment.length) ||
        (Array.isArray(additionalContacts) && additionalContacts.length) ||
        Object.keys(notesByDate || {}).length ||
        Object.keys(callTimesByDate || {}).length ||
        Object.keys(employeesByDate || {}).length ||
        Object.keys(vehicleStatus || {}).length
    );
  }, [
    additionalContacts,
    callTime,
    callTimesByDate,
    client,
    customDates,
    customEmployee,
    employees,
    employeesByDate,
    endDate,
    equipment,
    hasHS,
    hasHotel,
    hasRiggingAddress,
    hasRiskAssessment,
    offRoadTracking,
    hotelNights,
    hotelPaidBy,
    hotelPricePerNight,
    isCrewed,
    isRange,
    isSecondPencil,
    location,
    notes,
    notesByDate,
    requiredCrewCount,
    riggingAddress,
    shootType,
    startDate,
    status,
    statusReasonOther,
    statusReasons,
    useCustomDates,
    vehicleStatus,
    vehicles,
  ]);

  const draftTitle = useMemo(() => {
    const parts = [jobNumber, client, location]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return parts.length ? parts.join(" - ") : "Untitled Draft";
  }, [client, jobNumber, location]);

  const selectedVehicleDetails = useMemo(() => {
    return (vehicles || [])
      .map((vehicleId) => vehicleLookup?.byId?.[vehicleId] || null)
      .filter(Boolean);
  }, [vehicles, vehicleLookup]);

  const offRoadEligibility = useMemo(() => {
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
      return {
        eligible: false,
        reason: "Select at least one vehicle first.",
        ineligible: [],
      };
    }

    const ineligible = selectedVehicleDetails.filter((v) => !isOffRoadAllowedGroup(v.group));

    if (ineligible.length) {
      const names = ineligible
        .map((v) => v.name || v.registration || "Vehicle")
        .slice(0, 3)
        .join(", ");
      return {
        eligible: false,
        reason: `Only Bike / Electric Tracking Vehicles / Small Tracking Vehicles are allowed. Ineligible: ${names}`,
        ineligible,
      };
    }

    return { eligible: true, reason: "", ineligible: [] };
  }, [selectedVehicleDetails, vehicles]);

  /* ────────────────────────────────────────────────────────────
      Allocated crew count is display-only; crewed is always manual.
  ───────────────────────────────────────────────────────────── */
  const allocatedCrewCount = useMemo(() => {
    const selectedCount = employees.filter((e) => e?.name && e.name !== "Other").length;

    const customNames = customEmployee
      ? customEmployee
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];

    // Note: custom names are only intended if "Other" was selected, but counting them is fine either way.
    return selectedCount + customNames.length;
  }, [employees, customEmployee]);

  /* ────────────────────────────────────────────────────────────
     Load all data
  ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      if (window.localStorage.getItem("debugBookingLoads") === "1") {
        console.log("[booking-load] create route mounted");
      }
    } catch {
      // Debug logging is optional.
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load booking form data" });
        setReferenceDataLoading(false);
        return;
      }

      setReferenceDataLoading(true);
      try {
        const latestBookingPromise = getDocs(tenantCollectionQuery(db, "bookings", dataAccessState)).catch((err) => {
          console.warn("Failed loading latest booking number:", err);
          return null;
        });

        const [latestBookingSnap, referenceData] = await Promise.all([
          latestBookingPromise,
          loadBookingFormReferenceData(db, { accessState: dataAccessState }),
        ]);

        const max = (latestBookingSnap?.docs || []).reduce((currentMax, docSnap) => {
          const raw = docSnap.data()?.jobNumber;
          const value = /^\d+$/.test(String(raw || "")) ? parseInt(raw, 10) : 0;
          return Math.max(currentMax, value);
        }, 0);
        if (!draftIdFromQuery || !hydratedDraftRef.current) {
          setJobNumber(String(max + 1).padStart(4, "0"));
        }

        setEmployeeList(referenceData.employeeList || []);
        setFreelancerList(referenceData.freelancerList || []);
        setNameToCode(referenceData.nameToCode || {});
        setVehicleGroups(referenceData.vehicleGroups || {});
        setVehicleLookup(referenceData.vehicleLookup || { byId: {}, byReg: {}, byName: {} });
        setEquipmentGroups(referenceData.equipmentGroups || {});
        setOpenEquipGroups(referenceData.openEquipGroups || {});
      } catch (err) {
        if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "load booking form data" })) {
          console.error("Failed loading booking form reference data:", err);
        }
      } finally {
        setReferenceDataLoading(false);
      }
    };

    loadData();
  }, [accessKey, dataAccessState, draftIdFromQuery]);

  useEffect(() => {
    const dates = availabilityDateKey.split("|").filter(Boolean);
    if (!dates.length) {
      setAllBookings([]);
      setHolidayBookings([]);
      setUnavailableNotes([]);
      setMaintenanceBookings([]);
      return undefined;
    }
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "read booking availability" });
      return undefined;
    }

    let cancelled = false;
    loadBookingAvailabilityForDates(db, dates, { accessState: dataAccessState })
      .then((availability) => {
        if (cancelled) return;
        setAllBookings(availability.bookings || []);
        setHolidayBookings(availability.holidays || []);
        setUnavailableNotes(availability.unavailableNotes || []);
        setMaintenanceBookings(availability.maintenanceBookings || []);
      })
      .catch((err) => {
        if (!cancelled && !handleFirestoreAccessError(err, { collectionName: "bookings", operation: "read booking availability" })) {
          console.error("Failed loading booking availability data:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessKey, availabilityDateKey, dataAccessState]);

  useEffect(() => {
    const vehicleIds = selectedVehicleKey.split("|").filter(Boolean);
    if (!vehicleIds.length) {
      setVehicleChecks([]);
      return undefined;
    }
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicleChecks", operation: "read vehicle checks" });
      return undefined;
    }

    let cancelled = false;
    loadVehicleChecksForVehicles(db, vehicleIds, { accessState: dataAccessState })
      .then((checks) => {
        if (!cancelled) setVehicleChecks(checks || []);
      })
      .catch((err) => {
        if (!cancelled && !handleFirestoreAccessError(err, { collectionName: "vehicleChecks", operation: "read vehicle checks" })) {
          console.error("Failed loading vehicle check data:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessKey, dataAccessState, selectedVehicleKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!draftIdFromQuery) {
      hydratedDraftRef.current = true;
      return;
    }

    const draft = readDraftMap()[draftIdFromQuery];
    if (!draft?.data) {
      hydratedDraftRef.current = true;
      return;
    }

    const saved = draft.data;
    setActiveDraftId(draftIdFromQuery);
    setJobNumber(saved.jobNumber || "");
    setClient(saved.client || "");
    setLocation(saved.location || "");
    setStatus(saved.status || "Confirmed");
    setShootType(saved.shootType || "Day");
    setStatusReasons(Array.isArray(saved.statusReasons) ? saved.statusReasons : []);
    setStatusReasonOther(saved.statusReasonOther || "");
    setIsRange(Boolean(saved.isRange));
    setUseCustomDates(Boolean(saved.useCustomDates));
    setCustomDates(Array.isArray(saved.customDates) ? saved.customDates : []);
    setStartDate(saved.startDate || "");
    setEndDate(saved.endDate || "");
    setNotesByDate(saved.notesByDate && typeof saved.notesByDate === "object" ? saved.notesByDate : {});
    setNotes(saved.notes || "");
    setCallTime(saved.callTime || "");
    setCallTimesByDate(
      saved.callTimesByDate && typeof saved.callTimesByDate === "object" ? saved.callTimesByDate : {}
    );
    setHasHotel(Boolean(saved.hasHotel));
    setHotelPaidBy(saved.hotelPaidBy || "");
    setHotelNights(saved.hotelNights ?? "");
    setHotelPricePerNight(saved.hotelPricePerNight ?? "");
    setHasRiggingAddress(Boolean(saved.hasRiggingAddress));
    setRiggingAddress(saved.riggingAddress || "");
    setIsSecondPencil(Boolean(saved.isSecondPencil));
    setIsCrewed(Boolean(saved.isCrewed));
    setHasHS(Boolean(saved.hasHS));
    setHasRiskAssessment(Boolean(saved.hasRiskAssessment));
    setOffRoadTracking(Boolean(saved.offRoadTracking));
    setRequiredCrewCount(Number.isFinite(Number(saved.requiredCrewCount)) ? Number(saved.requiredCrewCount) : 1);
    setEmployees(Array.isArray(saved.employees) ? saved.employees : []);
    setEmployeesByDate(saved.employeesByDate && typeof saved.employeesByDate === "object" ? saved.employeesByDate : {});
    setCustomEmployee(saved.customEmployee || "");
    setVehicles(Array.isArray(saved.vehicles) ? saved.vehicles : []);
    setVehicleStatus(saved.vehicleStatus && typeof saved.vehicleStatus === "object" ? saved.vehicleStatus : {});
    setEquipment(Array.isArray(saved.equipment) ? saved.equipment : []);
    setAdditionalContacts(Array.isArray(saved.additionalContacts) ? saved.additionalContacts : []);
    hydratedDraftRef.current = true;
  }, [draftIdFromQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydratedDraftRef.current) return;

    if (!hasMeaningfulDraft) {
      if (activeDraftId) removeDraftEntry(activeDraftId);
      return;
    }

    const draftId = activeDraftId || createDraftId();
    if (!activeDraftId) setActiveDraftId(draftId);

    const nextMap = readDraftMap();
    nextMap[draftId] = {
      id: draftId,
      title: draftTitle,
      updatedAt: new Date().toISOString(),
      data: draftData,
    };
    writeDraftMap(nextMap);
  }, [activeDraftId, draftData, draftTitle, hasMeaningfulDraft]);

  const saveDraftAndStaySafe = async () => {
    if (typeof window === "undefined") return true;

    if (!hasMeaningfulDraft) {
      if (activeDraftId) removeDraftEntry(activeDraftId);
      return true;
    }

    const draftId = activeDraftId || createDraftId();
    if (!activeDraftId) setActiveDraftId(draftId);

    const nextMap = readDraftMap();
    nextMap[draftId] = {
      id: draftId,
      title: draftTitle,
      updatedAt: new Date().toISOString(),
      data: draftData,
    };
    writeDraftMap(nextMap);
    return true;
  };

  useUnsavedChangesGuard({
    enabled: true,
    isDirty: hydratedDraftRef.current && hasMeaningfulDraft,
    message: "You have unsaved booking changes. Save the draft before leaving?",
    saveLabel: "Save Draft & Leave",
    onSave: saveDraftAndStaySafe,
  });

  useEffect(() => {
    if (!isBickersJob) return;
    setHasHS(false);
    setHasRiskAssessment(false);
  }, [isBickersJob]);

  useEffect(() => {
    if (!offRoadTracking) return;
    if (offRoadEligibility.eligible) return;
    setOffRoadTracking(false);
  }, [offRoadEligibility.eligible, offRoadTracking]);

  const bookingWindowEnd = useMemo(() => {
    const sorted = [...(selectedDates || [])].map((d) => String(d || "").trim()).filter(Boolean).sort();
    return sorted[sorted.length - 1] || toYmd(new Date());
  }, [selectedDates]);



  /* ────────────────────────────────────────────────────────────
     Conflicts
  ───────────────────────────────────────────────────────────── */
  const overlapping = useMemo(() => {
    if (!selectedDates.length) return [];
    return allBookings.filter((b) => anyDateOverlap(expandBookingDates(b), selectedDates));
  }, [allBookings, selectedDates]);

  const { bookedVehicleIds, heldVehicleIds, vehicleBlockingStatusById, vehicleBlockingStatusesById } = useMemo(() => {
    const blockingById = {};
    const blockingStatusesById = {};
    const booked = [];
    const held = [];

    overlapping.forEach((b) => {
      const keys = normalizeVehicleKeysListForLookup(b.vehicles || [], vehicleLookup);
      const vmap = b.vehicleStatus || {};

      keys.forEach((vid) => {
        const itemStatus = (vmap[vid] ?? b.status) || "";
        if (!itemStatus) return;

        if (isVehicleBlockingStatus(itemStatus)) {
          if (!blockingStatusesById[vid]) blockingStatusesById[vid] = [];
          if (!blockingStatusesById[vid].includes(itemStatus)) {
            blockingStatusesById[vid].push(itemStatus);
          }
          if (!blockingById[vid]) {
            blockingById[vid] = itemStatus;
            booked.push(vid);
          }
        } else {
          if (!held.includes(vid)) held.push(vid);
        }
      });
    });

    return {
      bookedVehicleIds: booked,
      heldVehicleIds: held,
      vehicleBlockingStatusById: blockingById,
      vehicleBlockingStatusesById: blockingStatusesById,
    };
  }, [overlapping, vehicleLookup]);

  const bookedEquipment = useMemo(() => {
    return overlapping
      .filter(doesBlockBooking)
      .flatMap((b) => (Array.isArray(b.equipment) ? b.equipment : []))
      .map((x) => (typeof x === "string" ? x : x?.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }, [overlapping]);

  const heldEquipment = useMemo(() => {
    return overlapping
      .filter((b) => !doesBlockBooking(b))
      .flatMap((b) => (Array.isArray(b.equipment) ? b.equipment : []))
      .map((x) => (typeof x === "string" ? x : x?.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }, [overlapping]);

  const bookedEmployeeNames = useMemo(() => {
    return overlapping
      .filter(doesBlockBooking)
      .flatMap((b) => (Array.isArray(b.employees) ? b.employees : []))
      .map((e) => (typeof e === "string" ? e : e?.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }, [overlapping]);

  const heldEmployeeNames = useMemo(() => {
    return overlapping
      .filter((b) => !doesBlockBooking(b))
      .flatMap((b) => (Array.isArray(b.employees) ? b.employees : []))
      .map((e) => (typeof e === "string" ? e : e?.name))
      .map((s) => String(s || "").trim())
      .filter(Boolean);
  }, [overlapping]);

  const maintenanceVehicleBlocking = useMemo(() => {
    const ids = new Set();
    const reasonById = {};
    const reasonFromType = (booking) => {
      const t = String(
        booking?.maintenanceTypeLabel || booking?.maintenanceTypeOther || booking?.type || booking?.maintenanceType || ""
      )
        .trim()
        .toUpperCase();
      if (t === "MOT") return "MOT";
      if (t === "SERVICE") return "Service";
      return "Maintenance";
    };

    maintenanceBookings.forEach((b) => {
      const overlaps = anyDateOverlap(expandMaintenanceBookingDates(b), selectedDates);
      if (!overlaps) return;
      const reason = reasonFromType(b);

      if (Array.isArray(b.vehicles) && b.vehicles.length) {
        b.vehicles.forEach((v) => {
          const resolved = normalizeVehicleKeysListForLookup([v], vehicleLookup);
          resolved.forEach((id) => {
            ids.add(id);
            if (!reasonById[id]) reasonById[id] = reason;
          });
        });
      } else {
        const candidate = b.vehicleId || b.vehicle || b.vehicleName || b.registration || b.reg;
        const resolved = normalizeVehicleKeysListForLookup([candidate], vehicleLookup);
        resolved.forEach((id) => {
          ids.add(id);
          if (!reasonById[id]) reasonById[id] = reason;
        });
      }
    });

    return { ids, reasonById };
  }, [maintenanceBookings, selectedDates, vehicleLookup]);

  const maintenanceEquipmentBlocking = useMemo(() => {
    const names = new Set();
    const reasonByName = {};
    const reasonFromType = (booking) => {
      const t = String(
        booking?.maintenanceTypeLabel || booking?.maintenanceTypeOther || booking?.type || booking?.maintenanceType || ""
      )
        .trim()
        .toUpperCase();
      if (t === "MOT") return "MOT";
      if (t === "SERVICE") return "Service";
      return "Maintenance";
    };

    maintenanceBookings.forEach((b) => {
      const overlaps = anyDateOverlap(expandMaintenanceBookingDates(b), selectedDates);
      if (!overlaps) return;
      const reason = reasonFromType(b);

      (Array.isArray(b.equipment) ? b.equipment : [])
        .map((item) => (typeof item === "string" ? item : item?.name))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .forEach((name) => {
          names.add(name);
          if (!reasonByName[name]) reasonByName[name] = reason;
        });
    });

    return { names, reasonByName };
  }, [maintenanceBookings, selectedDates]);

  const complianceVehicleBlocking = useMemo(() => {
    const ids = new Set();
    const reasonById = {};
    const refDate = new Date(`${bookingWindowEnd}T00:00:00`);

    Object.values(vehicleLookup?.byId || {}).forEach((vehicle) => {
      const id = String(vehicle?.id || "").trim();
      if (!id) return;

      const taxStatus = String(vehicle?.taxStatus || "").trim().toLowerCase();
      const offRoadStatus = OFF_ROAD_STATUS_FIELDS
        .map((field) => String(vehicle?.[field] || "").trim().toLowerCase())
        .find((value) => value.includes("off road") || value.includes("off-road"));

      if (taxStatus === "sorn" || taxStatus === "untaxed" || taxStatus === "no tax" || offRoadStatus) {
        ids.add(id);
        reasonById[id] = taxStatus === "sorn" ? "SORN / off road" : "Off road";
        return;
      }

      const motDue = getCanonicalDueDate(vehicle, "mot");
      const serviceDue = getCanonicalDueDate(vehicle, "service");
      const inspectionDue = getCanonicalDueDate(vehicle, "inspection");
      const overdueMatch = [
        ["MOT overdue", motDue],
        ["Service overdue", serviceDue],
        ["Inspection overdue", inspectionDue],
      ].find(([, due]) => due instanceof Date && !Number.isNaN(due.getTime()) && due < refDate);

      if (overdueMatch) {
        ids.add(id);
        reasonById[id] = overdueMatch[0];
      }
    });

    return { ids, reasonById };
  }, [bookingWindowEnd, vehicleLookup]);

  const defectVehicleBlocking = useMemo(() => {
    const ids = new Set();
    const reasonById = {};

    (vehicleChecks || []).forEach((check) => {
      if (!Array.isArray(check?.items)) return;

      const hasImmediateDefect = check.items.some((item) => {
        const review = item?.review || {};
        const category = String(review.category || review.route || review.bucket || "").trim().toLowerCase();
        const maintenanceStatus = String(item?.maintenance?.status || "").trim().toLowerCase();
        return item?.status === "defect" && review.status === "approved" && category === "immediate" && maintenanceStatus !== "resolved";
      });

      if (!hasImmediateDefect) return;

      const candidates = [check.vehicleId, check.vehicle, check.registration, check.reg];
      const resolved = normalizeVehicleKeysListForLookup(candidates, vehicleLookup);
      resolved.forEach((id) => {
        ids.add(id);
        if (!reasonById[id]) reasonById[id] = "Open safety defect";
      });
    });

    return { ids, reasonById };
  }, [vehicleChecks, vehicleLookup]);

  /* ────────────────────────────────────────────────────────────
     Holiday checks
  ───────────────────────────────────────────────────────────── */
  const isEmployeeOnHolidayForDates = (employeeName, dates) => {
    const target = String(employeeName || "").trim().toLowerCase();
    const dateSet = new Set((dates || []).map((d) => String(d || "").slice(0, 10)));
    if (!target || !dateSet.size) return false;
    return holidayBookings.some((h) => {
      const holidayEmployee = String(h.employee || h.employeeName || "").trim().toLowerCase();
      return holidayEmployee === target && holidayDateKeysFromRecord(h).some((dateKey) => dateSet.has(dateKey));
    });
  };

  const getEmployeeUnavailableNoteForDates = (employeeName, dates) => {
    const target = String(employeeName || "").trim().toLowerCase();
    if (!target || !dates?.length) return null;
    const dateSet = new Set((dates || []).map((d) => String(d || "").slice(0, 10)));

    return (
      unavailableNotes.find((note) => {
        const noteEmployee = String(note.employee || note.employeeName || "").trim().toLowerCase();
        if (noteEmployee !== target) return false;
        const noteDate = String(note.date || note.startDate || "").slice(0, 10);
        return noteDate && dateSet.has(noteDate);
      }) || null
    );
  };

  const isEmployeeUnavailableByNoteForDates = (employeeName, dates) =>
    Boolean(getEmployeeUnavailableNoteForDates(employeeName, dates));

  const buildVehicleBlockingMapsFromBookings = (bookingRows = [], dates = selectedDates) => {
    const blockingById = {};
    const blockingStatusesById = {};

    (bookingRows || [])
      .filter((booking) => anyDateOverlap(expandBookingDates(booking), dates))
      .forEach((booking) => {
        const keys = normalizeVehicleKeysListForLookup(booking.vehicles || [], vehicleLookup);
        const vmap = booking.vehicleStatus || {};

        keys.forEach((vid) => {
          const itemStatus = (vmap[vid] ?? booking.status) || "";
          if (!isVehicleBlockingStatus(itemStatus)) return;
          if (!blockingStatusesById[vid]) blockingStatusesById[vid] = [];
          if (!blockingStatusesById[vid].includes(itemStatus)) {
            blockingStatusesById[vid].push(itemStatus);
          }
          if (!blockingById[vid]) blockingById[vid] = itemStatus;
        });
      });

    return { blockingById, blockingStatusesById };
  };

  /* ────────────────────────────────────────────────────────────
     Options that include custom “Other” names so they stay selectable
  ───────────────────────────────────────────────────────────── */
  const uniqStrings = (arr) =>
    Array.from(new Set((arr || []).map((s) => String(s || "").trim()).filter(Boolean)));

  const selectedNamesByRole = (role) =>
    uniqStrings(
      employees
        .filter((e) => e?.role === role)
        .map((e) => e?.name)
        .filter((n) => n && n !== "Other")
    );

  const driverOptions = useMemo(() => {
    const base = employeeList.map((e) => e?.name).filter(Boolean);
    const selected = selectedNamesByRole("Precision Driver");
    const customSelected = selected.filter((n) => !base.includes(n));
    return uniqStrings([...base, ...customSelected]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeList, employees]);

  const freelancerOptions = useMemo(() => {
    const base = freelancerList.map((e) => e?.name).filter(Boolean);
    const selected = selectedNamesByRole("Freelancer");
    const customSelected = selected.filter((n) => !base.includes(n));
    return [...uniqStrings([...base, ...customSelected]), "Other"];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freelancerList, employees]);

  const normalizedAssetSearch = assetSearch.trim().toLowerCase();

  const filteredVehicleGroups = useMemo(() => {
    const entries = Object.entries(vehicleGroups);
    if (!normalizedAssetSearch) return entries;

    return entries
      .map(([group, items]) => {
        const filteredItems = items.filter((vehicle) => {
          const haystack = [group, vehicle?.name, vehicle?.registration].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(normalizedAssetSearch);
        });
        return [group, filteredItems];
      })
      .filter(([, items]) => items.length);
  }, [vehicleGroups, normalizedAssetSearch]);

  const filteredEquipmentGroups = useMemo(() => {
    const entries = Object.entries(equipmentGroups);
    if (!normalizedAssetSearch) return entries;

    return entries
      .map(([group, items]) => {
        const filteredItems = items.filter((rawName) => {
          const name = String(rawName || "").trim();
          return `${group} ${name}`.toLowerCase().includes(normalizedAssetSearch);
        });
        return [group, filteredItems];
      })
      .filter(([, items]) => items.length);
  }, [equipmentGroups, normalizedAssetSearch]);

  const sortedSavedContacts = useMemo(() => {
    return [...savedContacts].sort((a, b) => {
      const aLabel = `${String(a?.name || "").trim()} ${String(a?.department || "").trim()}`.trim().toLowerCase();
      const bLabel = `${String(b?.name || "").trim()} ${String(b?.department || "").trim()}`.trim().toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [savedContacts]);

  const filteredSavedContacts = useMemo(() => {
    const query = savedContactSearch.trim().toLowerCase();
    if (!query) return sortedSavedContacts;
    return sortedSavedContacts.filter((contact) => {
      const haystack = [
        contact?.name,
        contact?.department,
        contact?.email,
        contact?.phone,
        contact?.number,
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [sortedSavedContacts, savedContactSearch]);

  /* ────────────────────────────────────────────────────────────
     Employee schedule helpers (per-day)
  ───────────────────────────────────────────────────────────── */
  const upsertEmployeeDates = (role, name, add) => {
    setEmployeesByDate((prev) => {
      const next = { ...prev };
      if (add) {
        selectedDates.forEach((d) => {
          if (!d) return;
          const list = Array.isArray(next[d]) ? next[d] : [];
          const exists = list.some((e) => e.name === name && e.role === role);
          if (!exists) next[d] = [...list, { role, name }];
        });
      } else {
        Object.keys(next).forEach((d) => {
          const list = Array.isArray(next[d]) ? next[d] : [];
          const filtered = list.filter((e) => !(e.name === name && e.role === role));
          if (filtered.length) next[d] = filtered;
          else delete next[d];
        });
      }
      return next;
    });
  };

  // Auto-open groups containing selected equipment
  useEffect(() => {
    setOpenEquipGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(equipmentGroups).forEach(([group, items]) => {
        const hasSelected = items?.some((name) => equipment.includes(name));
        if (hasSelected && !next[group]) {
          next[group] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [equipmentGroups, equipment]);

  /* ────────────────────────────────────────────────────────────
     Contacts actions
  ───────────────────────────────────────────────────────────── */
  const handleAddContactRow = () => {
    setAdditionalContacts((prev) => [
      ...prev,
      { department: "", departmentOther: "", name: "", email: "", phone: "" },
    ]);
  };

  const handleUpdateContactRow = (index, key, value) => {
    setAdditionalContacts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  };

  const handleRemoveContactRow = (index) => {
    setAdditionalContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const ensureSavedContactsLoaded = async () => {
    if (savedContactsLoaded || savedContactsLoading) return;
    setSavedContactsLoading(true);
    try {
      const contacts = await loadSavedContacts(db, { accessState: dataAccessState, force: true });
      setSavedContacts(contacts || []);
      setSavedContactsLoaded(true);
    } catch (err) {
      if (!handleFirestoreAccessError(err, { collectionName: "contacts", operation: "load saved contacts" })) {
        console.error("Failed loading saved contacts:", err);
      }
    } finally {
      setSavedContactsLoading(false);
    }
  };

  const handleQuickAddSavedContact = (id) => {
    if (!id) return;
    const found = savedContacts.find((c) => c.id === id);
    if (!found) return;
    setAdditionalContacts((prev) => [
      ...prev,
      {
        department: found.department || "",
        departmentOther: "",
        name: found.name || "",
        email: found.email || "",
        phone: found.phone || found.number || "",
      },
    ]);
  };

  /* ────────────────────────────────────────────────────────────
     Vehicle toggle
  ───────────────────────────────────────────────────────────── */
  const toggleVehicle = (vehicleId, checked) => {
    setVehicles((prev) => (checked ? uniq([...prev, vehicleId]) : prev.filter((v) => v !== vehicleId)));
    setVehicleStatus((prev) => {
      const next = { ...prev };
      if (checked) {
        if (!next[vehicleId]) next[vehicleId] = status;
      } else {
        delete next[vehicleId];
      }
      return next;
    });
  };

  /* ────────────────────────────────────────────────────────────
     Submit (contacts-only: remove contactEmail/contactNumber)
  ───────────────────────────────────────────────────────────── */
  const selectedVehicleConflictLabels = (
    selectedIds,
    statuses,
    blockingStatuses = vehicleBlockingStatusesById,
    blockingStatus = vehicleBlockingStatusById
  ) =>
    (selectedIds || [])
      .filter((vehicleId) =>
        existingVehicleStatusConflictsWithRequested(
          blockingStatuses[vehicleId] || [],
          statuses?.[vehicleId] || status
        )
      )
      .map((vehicleId) => {
        const vehicle = vehicleLookup?.byId?.[vehicleId] || {};
        const label = [vehicle.name, vehicle.registration].filter(Boolean).join(" - ") || vehicleId;
        const existingStatus = (blockingStatuses[vehicleId] || [blockingStatus[vehicleId] || "booked"]).join(", ");
        return `${label} (${existingStatus})`;
      });

  const handleSubmit = async () => {
    if (status !== "Enquiry") {
      if (useCustomDates) {
        if (!customDates.length) return alert("Please select at least one date.");
      } else {
        if (!startDate) return alert("Please select a start date.");
        if (isRange && !endDate) return alert("Please select an end date.");
      }
    }

    if (!coreFilled) {
      const missing = [];
      if (!isMaintenance && !(client || "").trim()) missing.push("Production");
      if (!isBickersJob && !(location || "").trim()) missing.push("Location");
      return alert("Please provide: " + missing.join(", ") + ".");
    }

    const needsReason = ["Lost", "Postponed", "Cancelled"].includes(status);
    if (needsReason) {
      if (!statusReasons.length) return alert("Please choose at least one reason.");
      if (statusReasons.includes("Other") && !statusReasonOther.trim())
        return alert("Please enter the 'Other' reason.");
    }

    const customNames = customEmployee
      ? customEmployee.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    const cleanedEmployees = uniqEmpObjects([
      ...employees.filter((e) => e?.name && e.name !== "Other"),
      ...customNames.map((n) => ({ role: "Precision Driver", name: n })),
    ]);

    const bookingDates = status !== "Enquiry" ? selectedDates : [];
    let availabilityForSave = null;
    if (bookingDates.length) {
      try {
        availabilityForSave = await loadBookingAvailabilityForDates(db, bookingDates, {
          accessState: dataAccessState,
        });
        setAllBookings(availabilityForSave.bookings || []);
        setHolidayBookings(availabilityForSave.holidays || []);
        setUnavailableNotes(availabilityForSave.unavailableNotes || []);
        setMaintenanceBookings(availabilityForSave.maintenanceBookings || []);
      } catch (err) {
        console.error("Failed checking booking availability before save:", err);
        return alert("Could not check availability for the selected dates. Please try saving again.");
      }
    }

    const freshVehicleBlocking = availabilityForSave
      ? buildVehicleBlockingMapsFromBookings(availabilityForSave.bookings || [], bookingDates)
      : null;
    const vehicleConflicts = selectedVehicleConflictLabels(
      vehicles,
      vehicleStatus,
      freshVehicleBlocking?.blockingStatusesById || vehicleBlockingStatusesById,
      freshVehicleBlocking?.blockingById || vehicleBlockingStatusById
    );
    if (bookingDates.length && vehicleConflicts.length) {
      return alert(
        `One or more selected vehicles already have a booking that conflicts with the selected vehicle status on the selected date(s):\n\n${vehicleConflicts.join(
          "\n"
        )}\n\nUse Second Pencil where the vehicle is already Confirmed or First Pencil. Vehicles already on Second Pencil cannot be booked again for those date(s).`
      );
    }

    const filteredNotesByDate = {};
    bookingDates.forEach((d) => {
      filteredNotesByDate[d] = notesByDate[d] || "";
      if (typeof notesByDate[`${d}-other`] !== "undefined")
        filteredNotesByDate[`${d}-other`] = notesByDate[`${d}-other`];
      if (typeof notesByDate[`${d}-travelMins`] !== "undefined")
        filteredNotesByDate[`${d}-travelMins`] = notesByDate[`${d}-travelMins`];
    });

    const cleanedSet = new Set(cleanedEmployees.map(employeesKey));
    let employeesByDatePayload = {};

    if (bookingDates.length && cleanedEmployees.length) {
      bookingDates.forEach((date) => {
        const fromState = employeesByDate[date];
        const baseList = Array.isArray(fromState) && fromState.length ? fromState : cleanedEmployees;
        const filtered = baseList.filter((e) => cleanedSet.has(employeesKey(e)));
        if (filtered.length) employeesByDatePayload[date] = filtered;
      });

      if (!Object.keys(employeesByDatePayload).length) {
        bookingDates.forEach((date) => {
          employeesByDatePayload[date] = [...cleanedEmployees];
        });
      }
    }

    const holidaysForSave = availabilityForSave?.holidays || holidayBookings;
    const unavailableNotesForSave = availabilityForSave?.unavailableNotes || unavailableNotes;
    const isEmployeeOnHolidayForSave = (employeeName, dates) => {
      const target = String(employeeName || "").trim().toLowerCase();
      const dateSet = new Set((dates || []).map((d) => String(d || "").slice(0, 10)));
      if (!target || !dateSet.size) return false;
      return (holidaysForSave || []).some((holiday) => {
        const holidayEmployee = String(holiday.employee || holiday.employeeName || "").trim().toLowerCase();
        return (
          holidayEmployee === target &&
          holidayDateKeysFromRecord(holiday).some((dateKey) => dateSet.has(dateKey))
        );
      });
    };
    const getEmployeeUnavailableNoteForSave = (employeeName, dates) => {
      const target = String(employeeName || "").trim().toLowerCase();
      const dateSet = new Set((dates || []).map((d) => String(d || "").slice(0, 10)));
      if (!target || !dateSet.size) return null;
      return (
        (unavailableNotesForSave || []).find((note) => {
          const noteEmployee = String(note.employee || note.employeeName || "").trim().toLowerCase();
          const noteDate = String(note.date || note.startDate || "").slice(0, 10);
          return noteEmployee === target && noteDate && dateSet.has(noteDate);
        }) || null
      );
    };

    for (const employee of cleanedEmployees) {
      const datesForEmp = bookingDates.filter((d) => {
        const list = employeesByDatePayload[d] || [];
        return list.some((e) => e.name === employee.name && e.role === employee.role);
      });
      if (datesForEmp.length && isEmployeeOnHolidayForSave(employee.name, datesForEmp)) {
        alert(`${employee.name} is on holiday for one or more selected dates.`);
        return;
      }
      const unavailableNote = getEmployeeUnavailableNoteForSave(employee.name, datesForEmp);
      if (datesForEmp.length && unavailableNote) {
        alert(
          `${employee.name} is marked unavailable on a note for one or more selected dates.${unavailableNote.text ? `\n\nNote: ${unavailableNote.text}` : ""}`
        );
        return;
      }
    }

    const employeeCodes = cleanedEmployees
      .map((e) => nameToCode[String(e?.name || "").trim().toLowerCase()])
      .filter(Boolean);

    const callTimesByDatePayload = {};
    if (bookingDates.length) {
      bookingDates.forEach((d) => {
        if (callTimesByDate[d]) callTimesByDatePayload[d] = callTimesByDate[d];
      });
    }

    let nextAttachments = [...(attachments || [])];

    if (newFiles.length > 0) {
      const uploaded = [];
      const { storage, ref, uploadBytesResumable, getDownloadURL } =
        await getFirebaseStorageTools();
      for (const file of newFiles) {
        const safeName = `${jobNumber || "nojob"}_${file.name}`.replace(/\s+/g, "_");
        const folder = file.name.toLowerCase().endsWith(".pdf") ? "booking_pdfs" : "quotes";
        const storageRef = ref(storage, companyStoragePath(dataAccessState, `${folder}/${safeName}`));

        const contentType =
          file.type ||
          (safeName.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : safeName.toLowerCase().endsWith(".xlsx")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : safeName.toLowerCase().endsWith(".xls")
            ? "application/vnd.ms-excel"
            : safeName.toLowerCase().endsWith(".csv")
            ? "text/csv"
            : safeName.toLowerCase().endsWith(".jpg") || safeName.toLowerCase().endsWith(".jpeg")
            ? "image/jpeg"
            : "application/octet-stream");

        const task = uploadBytesResumable(storageRef, file, { contentType });

        await new Promise((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => setPdfProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            (err) => reject(err),
            async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              uploaded.push({
                url,
                name: file.name,
                contentType,
                size: file.size,
                folder,
              });
              resolve();
            }
          );
        });
      }

      nextAttachments = [...nextAttachments, ...uploaded];
    }

    const firstUrl = nextAttachments[0]?.url || null;

    const additionalContactsToSave = (additionalContacts || [])
      .map((c) => ({
        department:
          c.department === "Other" && c.departmentOther ? c.departmentOther : c.department || "",
        name: (c.name || "").trim(),
        email: (c.email || "").trim(),
        phone: (c.phone || "").trim(),
      }))
      .filter((c) => c.name || c.email || c.phone || c.department);

    const user = auth.currentUser;

    const req = Number(requiredCrewCount);
    const allocatedAtSave = cleanedEmployees.length; // cleaned employees already includes custom names
    const hotelPaidByClean = hasHotel ? String(hotelPaidBy || "").trim() : "";
    const hotelNightsNum = hasHotel ? Number(String(hotelNights || "").trim()) : 0;
    const hotelPricePerNightNum = hasHotel ? Number(String(hotelPricePerNight || "").trim()) : 0;

    const nowIso = new Date().toISOString();
    const initialStatusHistory = buildInitialStatusHistory(status, nowIso, {
      email: user?.email || "Unknown",
      uid: user?.uid || "",
    });
    const initialLifecycle = buildInitialLifecycle(status, nowIso);

    const derivedFields = buildBookingDerivedFields({
      status,
      bookingDates,
      createdAt: nowIso,
      employees: cleanedEmployees,
      vehicles,
      equipment,
      additionalContacts: additionalContactsToSave,
      attachments: nextAttachments,
      requiredCrewCount: Number.isFinite(req) ? req : 0,
      allocatedCrewCount: allocatedAtSave,
    });

    const payload = {
      jobNumber,
      client,
      location,

      employees: cleanedEmployees,
      employeesByDate: employeesByDatePayload,
      employeeCodes,

      vehicles,
      vehicleStatus,
      equipment,

      isSecondPencil,
      isCrewed: Boolean(isCrewed),
      hasHS,
      hasRiskAssessment,
      offRoadTracking,
      notes,

      //  NEW fields stored
      requiredCrewCount: Number.isFinite(req) ? req : 0,
      allocatedCrewCount: allocatedAtSave,

      notesByDate: filteredNotesByDate,
      status,
      bookingDates,
      shootType,

      attachments: nextAttachments,
      quoteUrl: firstUrl || null,
      pdfURL: firstUrl || null,

      hasHotel,
      hotelPaidBy: hotelPaidByClean,
      hotelNights: Number.isFinite(hotelNightsNum) ? hotelNightsNum : 0,
      hotelPricePerNight: Number.isFinite(hotelPricePerNightNum) ? hotelPricePerNightNum : 0,
      hotelTotal:
        hasHotel && Number.isFinite(hotelNightsNum) && Number.isFinite(hotelPricePerNightNum)
          ? hotelNightsNum * hotelPricePerNightNum
          : 0,
      callTime: (!isRange && !useCustomDates ? callTimesByDate[bookingDates[0]] || callTime || "" : ""),
      ...(Object.keys(callTimesByDatePayload).length ? { callTimesByDate: callTimesByDatePayload } : {}),

      hasRiggingAddress,
      riggingAddress: hasRiggingAddress ? riggingAddress || "" : "",

      ...(needsReason && {
        statusReasons,
        statusReasonOther: statusReasons.includes("Other") ? statusReasonOther.trim() : "",
      }),

      additionalContacts: additionalContactsToSave,

      ...(status !== "Enquiry" && !useCustomDates
        ? isRange
          ? {
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate).toISOString(),
              date: null,
            }
          : { date: new Date(startDate).toISOString(), startDate: null, endDate: null }
        : { date: null, startDate: null, endDate: null }),

      createdBy: user?.email || "Unknown",
      createdByUid: user?.uid || "",
      lastEditedBy: user?.email || "Unknown",
      lastEditedByUid: user?.uid || "",
      createdAt: nowIso,
      updatedAt: nowIso,
      statusChangedAt: nowIso,
      statusHistory: initialStatusHistory,
      lifecycle: initialLifecycle,
      ...derivedFields,
      history: [
        {
          action: "Created",
          user: user?.email || "Unknown",
          timestamp: nowIso,
        },
      ],
    };
    payload.employeeNames = cleanedEmployees.map((emp) => (typeof emp === "string" ? emp : emp?.name)).filter(Boolean);
    payload.dayNotes = filteredNotesByDate;
    payload.startDateISO = payload.startDate ? String(payload.startDate).slice(0, 10) : "";
    payload.endDateISO = payload.endDate ? String(payload.endDate).slice(0, 10) : "";
    payload.dateISO = payload.date ? String(payload.date).slice(0, 10) : "";

    try {
      await addDoc(collection(db, "bookings"), tenantPayload(dataAccessState, payload));

      for (const c of additionalContactsToSave) {
        const id = contactIdFromEmail(c.email);
        if (!id) continue;
        await setDoc(
          doc(db, "contacts", id),
          tenantPayload(dataAccessState, {
            name: c.name,
            email: c.email,
            phone: c.phone,
            number: c.phone,
            department: c.department,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      }

      setPdfProgress(0);
      setNewFiles([]);
      if (activeDraftId) {
        removeDraftEntry(activeDraftId);
        setActiveDraftId("");
      }
      alert("Booking Saved");
      router.push("/dashboard?saved=true");
    } catch (err) {
      console.error(" Error saving booking:", err);
      alert("Failed to save booking \n\n" + err.message);
    }
  };

  const isEmployeeBooked = (name) => bookedEmployeeNames.includes(name);
  const isEmployeeHeld = (name) => heldEmployeeNames.includes(name);

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div style={pageWrap}>
        <div style={mainWrap}>
          <div style={pageHeader}>
            <div>
              <h1 style={h1Style}>Create Booking</h1>
              <div style={pageSub}>Build the job, dates, crew, vehicles, equipment, files and notes in one compact workflow.</div>
            </div>
            <div style={{ ...pill, alignSelf: "flex-start", padding: "6px 10px" }}>
              <ClipboardList size={14} />
              Job {jobNumber || "Draft"}
            </div>
          </div>
          {referenceDataLoading && (
            <div style={{ ...subCard, color: UI.muted, fontSize: 12, marginBottom: 12 }}>
              Loading employees, vehicles and equipment...
            </div>
          )}

          <div style={headerChecks}>
            {!isBickersJob && (
              <div style={headerChecksBox}>
                <span style={iconBox(hasHS && hasRiskAssessment ? UI.green : UI.amber, hasHS && hasRiskAssessment ? UI.greenSoft : UI.amberSoft, hasHS && hasRiskAssessment ? UI.greenBorder : UI.amberBorder)}>
                  <CheckCircle2 size={17} />
                </span>
                <div style={{ display: "grid", gap: 6, flex: 1 }}>
                  <label style={{ ...field.checkboxRow, marginBottom: 0 }}>
                    <input type="checkbox" checked={hasHS} onChange={(e) => setHasHS(e.target.checked)} />
                    Health & Safety Completed
                  </label>

                  <label style={{ ...field.checkboxRow, marginBottom: 0 }}>
                    <input type="checkbox" checked={hasRiskAssessment} onChange={(e) => setHasRiskAssessment(e.target.checked)} />
                    Risk Assessment Completed
                  </label>
                </div>
              </div>
            )}
            <div style={headerChecksBox}>
              <span style={iconBox(offRoadTracking ? UI.green : UI.brand, offRoadTracking ? UI.greenSoft : UI.brandSoft, offRoadTracking ? UI.greenBorder : UI.brandBorder)}>
                <Truck size={17} />
              </span>
              <div style={{ display: "grid", gap: 4, flex: 1 }}>
                <label style={{ ...field.checkboxRow, marginBottom: 0 }} title={offRoadEligibility.reason || ""}>
                  <input
                    type="checkbox"
                    checked={offRoadTracking}
                    disabled={!offRoadEligibility.eligible}
                    onChange={(e) => setOffRoadTracking(e.target.checked)}
                  />
                  Off Road Tracking
                </label>
                {!offRoadEligibility.eligible ? (
                  <div style={{ fontSize: 12, color: UI.muted }}>{offRoadEligibility.reason}</div>
                ) : (
                  <div style={{ fontSize: 12, color: UI.muted }}>
                    Skips tax/SORN compliance only. Insurance is still required.
                  </div>
                )}
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div style={formShell}>
            <div className="create-booking-grid" style={sectionGrid}>
              {/* Column 1: Job Info */}
              <div style={seamlessSection}>
                <div style={sectionTitleRow}>
                  <span style={iconBox()}><FileText size={17} /></span>
                  <h3 style={cardTitle}>Job Info</h3>
                </div>

                <label style={field.label}>Job Number</label>
                <input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} required style={field.input} />

                <label style={field.label}>Status</label>
                <select
                  value={status}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStatus(next);
                    if (!["Lost", "Postponed", "Cancelled"].includes(next)) {
                      setStatusReasons([]);
                      setStatusReasonOther("");
                    }
                  }}
                  style={field.input}
                >
                  {VEHICLE_STATUSES.filter((s) => s !== "Complete").map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                {["Lost", "Postponed", "Cancelled"].includes(status) && (
                  <div
                    style={{
                      border: UI.border,
                      borderRadius: UI.radiusSm,
                      padding: 12,
                      marginTop: 10,
                      background: UI.bgAlt,
                    }}
                  >
                    <h4 style={{ margin: "0 0 10px" }}>Reason</h4>
                    {["Cost", "Weather", "Competitor", "DNH", "Other"].map((r) => (
                      <label
                        key={r}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          marginRight: 16,
                          marginBottom: 8,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={statusReasons.includes(r)}
                          onChange={() =>
                            setStatusReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
                          }
                        />
                        {r}
                      </label>
                    ))}
                    {statusReasons.includes("Other") && (
                      <div style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          placeholder="Other reason..."
                          value={statusReasonOther}
                          onChange={(e) => setStatusReasonOther(e.target.value)}
                          style={field.input}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div style={divider} />

                <label style={field.label}>Shoot Type</label>
                <select value={shootType} onChange={(e) => setShootType(e.target.value)} style={field.input}>
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>

                <label style={field.label}>Production</label>
                <input value={client} onChange={(e) => setClient(e.target.value)} style={field.input} required={!isMaintenance} />

                {/* Contacts block only */}
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: UI.radiusSm,
                    border: UI.border,
                    background: UI.bgAlt,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Contacts</span>
                    <button type="button" onClick={handleAddContactRow} style={{ ...btn, padding: "4px 8px", fontSize: 12, borderRadius: 999 }}>
                      + Add contact
                    </button>
                  </div>

                  {additionalContacts.map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: 8,
                        padding: 8,
                        borderRadius: UI.radiusXs,
                        background: "#ffffff",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div className="create-booking-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={{ ...field.label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Department</label>
                          <select value={row.department} onChange={(e) => handleUpdateContactRow(idx, "department", e.target.value)} style={field.input}>
                            <option value="">Select department</option>
                            {FILM_DEPARTMENTS.map((dep) => (
                              <option key={dep} value={dep}>
                                {dep}
                              </option>
                            ))}
                          </select>
                          {row.department === "Other" && (
                            <input
                              type="text"
                              placeholder="Custom department"
                              value={row.departmentOther || ""}
                              onChange={(e) => handleUpdateContactRow(idx, "departmentOther", e.target.value)}
                              style={{ ...field.input, marginTop: 6 }}
                            />
                          )}
                        </div>

                        <div>
                          <label style={{ ...field.label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Name</label>
                          <input type="text" value={row.name} onChange={(e) => handleUpdateContactRow(idx, "name", e.target.value)} style={field.input} placeholder="Contact name" />
                        </div>
                      </div>

                      <div className="create-booking-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ ...field.label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Email</label>
                          <input type="email" value={row.email} onChange={(e) => handleUpdateContactRow(idx, "email", e.target.value)} style={field.input} placeholder="Email" />
                        </div>
                        <div>
                          <label style={{ ...field.label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>Number</label>
                          <input type="tel" value={row.phone} onChange={(e) => handleUpdateContactRow(idx, "phone", e.target.value)} style={field.input} placeholder="Phone number" />
                        </div>
                      </div>

                      <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveContactRow(idx)}
                          style={{
                            ...btn,
                            padding: "4px 8px",
                            fontSize: 11,
                            borderRadius: 999,
                            borderColor: "#dc2626",
                            color: "#dc2626",
                            background: "#fff",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  <div style={{ marginTop: 6 }}>
                    <label style={{ ...field.label, fontWeight: 500, marginTop: 0, marginBottom: 4 }}>
                      Quick add from saved contacts
                    </label>
                    {!savedContactsLoaded ? (
                      <button
                        type="button"
                        onClick={ensureSavedContactsLoaded}
                        disabled={savedContactsLoading}
                        style={{ ...btn, width: "100%", justifyContent: "center" }}
                      >
                        {savedContactsLoading ? "Loading saved contacts..." : "Load saved contacts"}
                      </button>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={savedContactSearch}
                          onChange={(e) => setSavedContactSearch(e.target.value)}
                          placeholder="Search saved contacts..."
                          style={{ ...field.input, marginBottom: 6 }}
                        />
                        <select
                          value={selectedSavedContactId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedSavedContactId(val);
                            if (val) {
                              handleQuickAddSavedContact(val);
                              setSelectedSavedContactId("");
                            }
                          }}
                          style={field.input}
                        >
                          <option value="">{filteredSavedContacts.length ? "Select saved contact" : "No saved contacts match"}</option>
                          {filteredSavedContacts.map((c) => {
                            const labelBase = c.name || c.email || "Unnamed";
                            const deptLabel = c.department ? ` - ${c.department}` : "";
                            return (
                              <option key={c.id} value={c.id}>
                                {labelBase}
                                {deptLabel}
                              </option>
                            );
                          })}
                        </select>
                      </>
                    )}
                  </div>
                </div>

                <label style={field.label}>Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={field.input}
                  required
                />
                <div style={{ marginTop: 10, padding: 10, borderRadius: UI.radiusSm, border: UI.border, background: UI.bgAlt }}>
                  <label style={{ ...field.checkboxRow, marginBottom: 0 }}>
                    <input type="checkbox" checked={hasRiggingAddress} onChange={(e) => setHasRiggingAddress(e.target.checked)} />
                    Add Rigging Address
                  </label>
                  {hasRiggingAddress && (
                    <textarea
                      value={riggingAddress}
                      onChange={(e) => setRiggingAddress(e.target.value)}
                      rows={3}
                      style={{ ...field.textarea, minHeight: 70, marginTop: 8, background: "#fff" }}
                      placeholder="Enter rigging address..."
                    />
                  )}
                </div>
              </div>

              {/* Column 2: Dates & People */}
              <div style={seamlessSection}>
                <div style={sectionTitleRow}>
                  <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}><CalendarDays size={17} /></span>
                  <h3 style={cardTitle}>Dates & People</h3>
                </div>

                <label style={field.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={useCustomDates}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setUseCustomDates(on);
                      if (on) setIsRange(false);
                    }}
                  />
                  Select non-consecutive dates
                </label>

                {!useCustomDates && (
                  <label style={field.checkboxRow}>
                    <input type="checkbox" checked={isRange} onChange={() => setIsRange(!isRange)} />
                    Multi-day booking (consecutive)
                  </label>
                )}

                {useCustomDates ? (
                  <div style={{ marginTop: 10 }}>
                    <DatePicker
                      multiple
                      value={customDates}
                      format="YYYY-MM-DD"
                      onChange={(vals) => {
                        const normalised = (Array.isArray(vals) ? vals : [])
                          .map((v) => (typeof v?.format === "function" ? v.format("YYYY-MM-DD") : String(v)))
                          .sort();
                        setCustomDates(normalised);
                      }}
                    />
                  </div>
                ) : (
                  <div className="create-booking-two" style={{ display: "grid", gridTemplateColumns: isRange ? "1fr 1fr" : "1fr", gap: 12 }}>
                    <div>
                      <label style={field.label}>{isRange ? "Start Date" : "Date"}</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required={status !== "Enquiry"} style={field.input} />
                    </div>
                    {isRange && (
                      <div>
                        <label style={field.label}>End Date</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required={status !== "Enquiry"} style={field.input} />
                      </div>
                    )}
                  </div>
                )}

                {selectedDates.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: "8px 0" }}>{selectedDates.length > 1 ? "Notes for Each Day" : "Note for the Day"}</h4>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                      {selectedDates.map((date) => {
                        const selectedNote = notesByDate[date] || "";
                        const isOther = selectedNote === "Other";
                        const customOtherValue = notesByDate[`${date}-other`] || "";
                        const callTimeForDate = callTimesByDate[date] || "";
                        return (
                          <div key={date} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 8, background: "#f8fafc" }}>
                            <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 13.5, lineHeight: 1.15 }}>{new Date(date).toDateString()}</div>

                            <div className="create-booking-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              <div>
                                <label style={{ ...field.label, marginTop: 0, marginBottom: 3, fontSize: 10.5, lineHeight: 1 }}>Day note</label>
                                <select
                                  value={selectedNote}
                                  onChange={(e) => setNotesByDate({ ...notesByDate, [date]: e.target.value })}
                                  style={{ ...field.input, height: 32, padding: "5px 8px" }}
                                >
                                  <option value="">Select note</option>
                                  <option value="1/2 Day Travel">1/2 Day Travel</option>
                                  <option value="Night Shoot">Night Shoot</option>
                                  <option value="On Set">Shoot Day</option>
                                  <option value="Other">Other</option>
                                  <option value="Rehearsal Day">Rehearsal Day</option>
                                  <option value="Rest Day">Rest Day</option>
                                  <option value="Rig Day">Rig Day</option>
                                  <option value="Standby Day">Standby Day</option>
                                  <option value="Spilt Day">Spilt Day</option>
                                  <option value="Travel Day">Travel Day</option>
                                  <option value="Travel Time">Travel Time</option>
                                  <option value="Turnaround Day">Turnaround Day</option>
                                  <option value="Recce Day">Recce Day</option>
                                </select>
                              </div>
                              <div>
                                <label style={{ ...field.label, marginTop: 0, marginBottom: 3, fontSize: 10.5, lineHeight: 1 }}>Call Time</label>
                                <select
                                  value={callTimeForDate}
                                  onChange={(e) => setCallTimesByDate((prev) => ({ ...prev, [date]: e.target.value }))}
                                  style={{ ...field.input, height: 32, padding: "5px 8px" }}
                                >
                                  <option value="">Select time</option>
                                  {TIME_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {isOther && (
                              <div style={{ marginTop: 8 }}>
                                <input
                                  type="text"
                                  placeholder="Enter custom note"
                                  value={customOtherValue}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: "Other",
                                      [`${date}-other`]: e.target.value,
                                    })
                                  }
                                  style={field.input}
                                />
                              </div>
                            )}

                            {selectedNote === "Travel Time" && (
                              <div style={{ marginTop: 8 }}>
                                <label style={{ ...field.label, marginBottom: 6 }}>Travel duration</label>
                                <select
                                  value={notesByDate[`${date}-travelMins`] || ""}
                                  onChange={(e) =>
                                    setNotesByDate({
                                      ...notesByDate,
                                      [date]: "Travel Time",
                                      [`${date}-travelMins`]: e.target.value,
                                    })
                                  }
                                  style={field.input}
                                >
                                  <option value="">Select duration</option>
                                  {TRAVEL_DURATION_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={divider} />

                <h4 style={{ margin: "8px 0", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
                  <Users size={15} /> Precision Driver
                </h4>
                <div style={driverCheckboxGrid}>
                  {driverOptions.map((name) => {
                    const isSelected = employees.some((e) => e.name === name && e.role === "Precision Driver");
                    const isBooked = isEmployeeBooked(name);
                    const isHeld = isEmployeeHeld(name);
                    const isHoliday = isEmployeeOnHolidayForDates(name, selectedDates);
                    const isUnavailable = isEmployeeUnavailableByNoteForDates(name, selectedDates);

                    //  changed: do NOT block selection just because booking is crewed.
                    const disabled = (isBooked || isHoliday || isUnavailable) && !isSelected;

                    return (
                      <label key={`pd-${name}`} style={{ display: "block", marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          value={name}
                          disabled={disabled}
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const next = uniqEmpObjects([...employees, { role: "Precision Driver", name }]);
                              setEmployees(next);
                              upsertEmployeeDates("Precision Driver", name, true);
                            } else {
                              const next = employees.filter((sel) => !(sel.name === name && sel.role === "Precision Driver"));
                              setEmployees(next);
                              upsertEmployeeDates("Precision Driver", name, false);
                            }
                          }}
                        />{" "}
                        <span style={{ color: disabled ? "#9ca3af" : UI.text }}>
                          {name} {isBooked && "(Booked)"} {!isBooked && isHeld && "(Held)"} {isHoliday && "(Holiday)"} {isUnavailable && "(Unavailable)"}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Required crew guidance + manual crewed checkbox */}
                <div style={{ marginTop: 8, padding: 6, borderRadius: UI.radiusSm, border: UI.border, background: "#f8fafc" }}>
                  <div className="create-booking-crew-box" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 76px 76px auto", gap: 6, alignItems: "stretch" }}>
                    <label style={{ fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, minHeight: 36, padding: "0 8px", borderRadius: UI.radiusXs, background: "#fff", border: "1px solid #e2e8f0" }}>
                      <input
                        type="checkbox"
                        checked={isCrewed}
                        onChange={(e) => setIsCrewed(e.target.checked)}
                        style={{ margin: 0 }}
                      />
                      Crewed
                    </label>
                    <div style={{ display: "grid", gap: 2, padding: "4px 6px", borderRadius: UI.radiusXs, background: "#fff", border: "1px solid #e2e8f0" }}>
                      <label style={{ ...field.label, marginTop: 0, marginBottom: 0, fontSize: 9.5, lineHeight: 1 }}>Required</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={requiredCrewCount}
                        onChange={(e) => {
                          const v = Math.max(0, parseInt(e.target.value || "0", 10));
                          setRequiredCrewCount(Number.isFinite(v) ? v : 0);
                        }}
                        style={{ ...field.input, height: 20, width: "100%", textAlign: "right", padding: 0, border: "none", background: "transparent", boxShadow: "none", fontWeight: 800 }}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 2, alignContent: "center", padding: "4px 8px", borderRadius: UI.radiusXs, background: "#fff", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: 9.5, color: UI.muted, fontWeight: 800, textTransform: "uppercase", lineHeight: 1 }}>Allocated</span>
                      <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.15 }}>{allocatedCrewCount} / {Math.max(0, Number(requiredCrewCount) || 0)}</span>
                    </div>
                    <span style={{ alignSelf: "center", justifySelf: "end", fontSize: 11.5, color: isCrewed ? "#166534" : "#92400e", background: isCrewed ? "#dcfce7" : "#fff7ed", border: `1px solid ${isCrewed ? "#86efac" : "#fed7aa"}`, borderRadius: 999, padding: "5px 10px", fontWeight: 900 }}>
                      {isCrewed ? "Crewed" : "Manual"}
                    </span>
                  </div>
                </div>

                <h4 style={{ margin: "8px 0", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5 }}>
                  <Users size={15} /> Freelancers
                </h4>
                <div style={checkboxGrid}>
                  {freelancerOptions.map((name) => {
                    const isSelected = employees.some((e) => e.name === name && e.role === "Freelancer");
                    const isBooked = isEmployeeBooked(name);
                    const isHoliday = isEmployeeOnHolidayForDates(name, selectedDates);
                    const isUnavailable = isEmployeeUnavailableByNoteForDates(name, selectedDates);
                    const disabled = (isBooked || isHoliday || isUnavailable) && !isSelected;

                    return (
                      <label key={`fl-${name}`} style={{ display: "block", marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          value={name}
                          disabled={disabled}
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const next = uniqEmpObjects([...employees, { role: "Freelancer", name }]);
                              setEmployees(next);
                              upsertEmployeeDates("Freelancer", name, true);
                            } else {
                              const next = employees.filter((sel) => !(sel.name === name && sel.role === "Freelancer"));
                              setEmployees(next);
                              upsertEmployeeDates("Freelancer", name, false);
                            }
                          }}
                        />{" "}
                        <span style={{ color: disabled ? "#9ca3af" : UI.text }}>
                          {name} {isBooked && "(Booked)"} {isHoliday && "(Holiday)"} {isUnavailable && "(Unavailable)"}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {employees.some((e) => e.name === "Other") && (
                  <div style={{ marginTop: 8 }}>
                    <input type="text" placeholder="Other employee(s), comma-separated" value={customEmployee} onChange={(e) => setCustomEmployee(e.target.value)} style={field.input} />
                  </div>
                )}

                {selectedDates.length > 0 && employees.filter((e) => e.name && e.name !== "Other").length > 0 && (
                  <>
                    <div style={divider} />
                    <h4 style={{ margin: "8px 0" }}>Employee schedule by day</h4>
                    <p style={{ fontSize: 12, color: UI.muted, marginBottom: 8 }}>Default = everyone works every selected day. Use this grid to fine-tune.</p>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10 }}>
                      {selectedDates.map((date) => {
                        const assigned = employeesByDate[date] || [];
                        const pretty = new Date(date).toDateString();

                        return (
                          <div key={date} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10, background: UI.bgAlt }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{pretty}</div>

                            {employees
                              .filter((e) => e.name && e.name !== "Other")
                              .map((emp) => {
                                const isOnDay = assigned.some((x) => x.name === emp.name && x.role === emp.role);

                                return (
                                  <label key={`${emp.role}-${emp.name}-${date}`} style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
                                    <input
                                      type="checkbox"
                                      checked={isOnDay}
                                      onChange={() =>
                                        setEmployeesByDate((prev) => {
                                          const next = { ...prev };
                                          const list = Array.isArray(next[date]) ? next[date] : [];
                                          const exists = list.some((x) => x.name === emp.name && x.role === emp.role);
                                          if (exists) {
                                            const filtered = list.filter((x) => !(x.name === emp.name && x.role === emp.role));
                                            if (filtered.length) next[date] = filtered;
                                            else delete next[date];
                                          } else {
                                            next[date] = [...list, { role: emp.role, name: emp.name }];
                                          }
                                          return next;
                                        })
                                      }
                                    />{" "}
                                    {emp.name} <span style={{ color: UI.muted }}>({emp.role})</span>
                                  </label>
                                );
                              })}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Column 3: Vehicles + Equipment */}
              <div style={{ ...seamlessSection, borderBottom: "none", paddingBottom: 0 }}>
                <div style={sectionTitleRow}>
                  <span style={iconBox(UI.brand, UI.brandSoft, UI.brandBorder)}><Truck size={17} /></span>
                  <h3 style={cardTitle}>Vehicles</h3>
                </div>
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <Search size={16} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} />
                  <input
                    type="text"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Search vehicles and equipment..."
                    style={{ ...field.input, paddingLeft: 34 }}
                  />
                </div>

                <div className="create-booking-assets" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 12, rowGap: 10, alignItems: "start" }}>
                  {filteredVehicleGroups.map(([group, items]) => {
                    const isOpen = openGroups[group] || false;

                    return (
                      <div key={group}>
                        <button type="button" onClick={() => setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))} style={accordionBtn}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {group}
                          </span>
                          <span style={pill}>{items.length}</span>
                        </button>

                        {isOpen && (
                          <div style={{ padding: "10px 6px" }}>
                            {items.map((vehicle) => {
                              const key = vehicle.id;
                              const isBooked = bookedVehicleIds.includes(key);
                              const hasBookingConflict = existingVehicleStatusConflictsWithRequested(vehicleBlockingStatusesById[key] || [], status);
                              const blockedStatus = vehicleBlockingStatusById[key];
                              const isHeld = heldVehicleIds.includes(key);
                              const isSelected = vehicles.includes(key);

                              const isMaintBlocked = maintenanceVehicleBlocking.ids.has(key);
                              const maintReason = maintenanceVehicleBlocking.reasonById[key] || "Maintenance";
                              const isComplianceBlocked = complianceVehicleBlocking.ids.has(key);
                              const complianceReason = complianceVehicleBlocking.reasonById[key] || "Compliance hold";
                              const isDefectBlocked = defectVehicleBlocking.ids.has(key);
                              const defectReason = defectVehicleBlocking.reasonById[key] || "Open safety defect";
                              const disabled = (hasBookingConflict || isMaintBlocked || isDefectBlocked) && !isSelected;

                              return (
                                <div
                                  key={key}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginBottom: 8,
                                    opacity: disabled ? 0.55 : 1,
                                    cursor: disabled ? "not-allowed" : "",
                                  }}
                                  title={
                                    disabled
                                      ? isMaintBlocked
                                        ? `Vehicle is out for ${maintReason} during selected date(s)`
                                        : isDefectBlocked
                                        ? `Vehicle is blocked: ${defectReason}`
                                        : status === SECOND_PENCIL_STATUS
                                        ? "Vehicle already has a Second Pencil booking on overlapping date(s)"
                                        : `Vehicle is already ${blockedStatus || "booked"} on overlapping date(s). Use Second Pencil to add a softer hold.`
                                      : ""
                                  }
                                >
                                  <input type="checkbox" checked={isSelected} disabled={disabled} onChange={(e) => toggleVehicle(key, e.target.checked)} />
                                  <span style={{ flex: 1, color: disabled ? "#6e6f70ff" : UI.text }}>
                                    {vehicle.name}
                                    {vehicle.registration ? ` - ${vehicle.registration}` : ""}
                                    {isDefectBlocked && !isBooked && !isMaintBlocked && ` (${defectReason})`}
                                    {isComplianceBlocked && !isBooked && !isMaintBlocked && ` (${complianceReason})`}
                                    {isMaintBlocked && !isBooked && ` (${maintReason})`}
                                    {isBooked && ` (${blockedStatus || "Blocked"})`}
                                    {!isBooked && !isMaintBlocked && isHeld && " (Held)"}
                                  </span>

                                  {isSelected && (
                                    <select value={vehicleStatus[key] || status} onChange={(e) => setVehicleStatus((prev) => ({ ...prev, [key]: e.target.value }))} style={{ height: 32 }} title="Vehicle status">
                                      {VEHICLE_STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {filteredVehicleGroups.length === 0 && (
                  <div style={{ fontSize: 13, color: UI.muted, marginTop: 4 }}>No vehicles match that search.</div>
                )}

                <div style={divider} />

                <div style={sectionTitleRow}>
                  <span style={iconBox(UI.amber, UI.amberSoft, UI.amberBorder)}><Package size={17} /></span>
                  <h3 style={cardTitle}>Equipment</h3>
                </div>

                <div className="create-booking-assets" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 12, rowGap: 10, alignItems: "start" }}>
                  {filteredEquipmentGroups.map(([group, items]) => {
                    const isOpen = openEquipGroups[group] || false;

                    return (
                      <div key={group}>
                        <button type="button" onClick={() => setOpenEquipGroups((prev) => ({ ...prev, [group]: !prev[group] }))} style={accordionBtn}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {group}
                          </span>
                          <span style={pill}>{items.length}</span>
                        </button>

                        {isOpen && (
                          <div style={{ padding: "10px 6px" }}>
                            {items.map((rawName) => {
                              const name = String(rawName || "").trim();
                              const isBooked = bookedEquipment.includes(name);
                              const isHeld = heldEquipment.includes(name);
                              const isSelected = equipment.includes(name);
                              const isMaintBlocked = maintenanceEquipmentBlocking.names.has(name);
                              const maintReason = maintenanceEquipmentBlocking.reasonByName[name] || "Maintenance";
                              const disabled = (isBooked || isMaintBlocked) && !isSelected;

                              return (
                                <label
                                  key={name}
                                  style={{
                                    display: "block",
                                    marginBottom: 6,
                                    opacity: disabled ? 0.55 : 1,
                                    cursor: disabled ? "not-allowed" : "",
                                  }}
                                  title={
                                    disabled
                                      ? isMaintBlocked
                                        ? `Equipment is already booked for ${maintReason} on overlapping date(s)`
                                        : `Equipment is already booked on overlapping date(s)`
                                      : ""
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    value={name}
                                    disabled={disabled}
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) setEquipment((prev) => Array.from(new Set([...prev, name])));
                                      else setEquipment((prev) => prev.filter((x) => x !== name));
                                    }}
                                  />{" "}
                                  <span style={{ color: disabled ? "#9ca3af" : UI.text }}>
                                    {name}
                                    {isMaintBlocked && !isBooked && ` (${maintReason})`}
                                    {isBooked && " (Booked)"}
                                    {!isBooked && !isMaintBlocked && isHeld && " (Held)"}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {filteredEquipmentGroups.length === 0 && (
                  <div style={{ fontSize: 13, color: UI.muted, marginTop: 4 }}>No equipment matches that search.</div>
                )}

              </div>
            </div>

            {/* Files & Notes */}
            <div className="create-booking-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
                <div style={seamlessSection}>
                  <div style={sectionTitleRow}>
                    <span style={iconBox()}><FileText size={17} /></span>
                    <h3 style={cardTitle}>Files</h3>
                  </div>
                  <label style={field.label}>Attach files (PDF/XLS/XLSX/CSV/JPG/JPEG)</label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.xls,.xlsx,.csv,.jpg,.jpeg,image/jpeg"
                    onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                    style={{ ...field.input, height: "auto", padding: 10 }}
                  />

                  {pdfProgress > 0 && <div style={{ marginTop: 8, fontSize: 12 }}>Uploading: {pdfProgress}%</div>}
                  {newFiles?.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                      {newFiles.length} file{newFiles.length > 1 ? "s" : ""} selected - they will upload on Save.
                    </div>
                  )}
                </div>

                <div style={{ ...seamlessSection, display: "grid", gap: 8 }}>
                  <div style={{ ...sectionTitleRow, marginBottom: 4 }}>
                    <span style={iconBox()}><FileText size={17} /></span>
                    <h3 style={cardTitle}>Notes</h3>
                  </div>
                  <label style={{ ...field.label, marginTop: 0, marginBottom: 3 }}>Additional Notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} style={{ ...field.textarea, minHeight: 92, background: "#fff" }} placeholder="Anything extra to include for this booking..." />

                  <label style={{ ...field.checkboxRow, marginBottom: 0, marginTop: 2 }}>
                    <input type="checkbox" checked={hasHotel} onChange={(e) => setHasHotel(e.target.checked)} />
                    Hotel Booked
                  </label>

                  {hasHotel && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 10,
                        alignItems: "end",
                      }}
                      className="create-booking-hotel"
                    >
                      <div>
                        <label style={field.label}>Paid by</label>
                        <select value={hotelPaidBy} onChange={(e) => setHotelPaidBy(e.target.value)} style={field.input}>
                          <option value="">Select</option>
                          <option value="Production">Production</option>
                          <option value="Bickers">Bickers</option>
                        </select>
                      </div>

                      <div>
                        <label style={field.label}>Nights</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={hotelNights}
                          onChange={(e) => setHotelNights(e.target.value)}
                          style={field.input}
                          placeholder="e.g. 2"
                        />
                      </div>

                      <div>
                        <label style={field.label}>Price per night</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={hotelPricePerNight}
                          onChange={(e) => setHotelPricePerNight(e.target.value)}
                          style={field.input}
                          placeholder="e.g. 160"
                        />
                      </div>
                    </div>
                  )}

                  {hasHotel && (
                    <div style={{ fontSize: 12, color: UI.muted }}>
                      Total: <b>{hotelTotal ? `GBP ${hotelTotal.toFixed(2)}` : "-"}</b>
                    </div>
                  )}

                  <div style={{ ...actionsRow, marginTop: 0 }}>
                    <button
                      type="submit"
                      disabled={!coreFilled}
                      title={saveTooltip}
                      style={{ ...btnPrimary, opacity: coreFilled ? 1 : 0.5, cursor: coreFilled ? "pointer" : "not-allowed" }}
                    >
                      <Save size={14} />
                      Save Booking
                    </button>

                    <button type="button" onClick={() => router.push("/dashboard")} style={btnGhost}>
                      Cancel
                    </button>
                  </div>
                </div>
            </div>

            {/* Summary */}
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={summaryCard}>
                <div style={sectionTitleRow}>
                  <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}><ClipboardList size={17} /></span>
                  <h3 style={cardTitle}>Summary</h3>
                </div>

                <div style={summaryGrid}>
                  <div style={summarySection}>
                    <h4 style={summarySectionTitle}>Job</h4>
                    <SummaryRow label="Number">{jobNumber || "-"}</SummaryRow>
                    <SummaryRow label="Status">{status || "-"}</SummaryRow>
                    <SummaryRow label="Shoot">{shootType || "-"}</SummaryRow>
                    <SummaryRow label="Client">{client || "-"}</SummaryRow>
                  </div>

                  <div style={summarySection}>
                    <h4 style={summarySectionTitle}>Schedule</h4>
                    <SummaryRow label="Dates">
                      {useCustomDates
                        ? customDates.length
                          ? formatSummaryDates(customDates)
                          : "-"
                        : isRange
                        ? `${formatSummaryDate(startDate) || "-"} to ${formatSummaryDate(endDate) || "-"}`
                        : formatSummaryDate(startDate) || "-"}
                    </SummaryRow>
                    <SummaryRow label="Call">
                      {formatSummaryCallTimes(selectedDates, callTimesByDate, callTime)}
                    </SummaryRow>
                    <SummaryRow label="Location">{location || "-"}</SummaryRow>
                  </div>

                  <div style={summarySection}>
                    <h4 style={summarySectionTitle}>People</h4>
                    <SummaryRow label="Contacts">
                      {additionalContacts.length
                        ? additionalContacts
                            .map((c) => {
                              const dept = c.department === "Other" && c.departmentOther ? c.departmentOther : c.department;
                              return [c.name || c.email || "Unnamed", dept ? `(${dept})` : ""].filter(Boolean).join(" ");
                            })
                            .join(", ")
                        : "-"}
                    </SummaryRow>
                    <SummaryRow label="Drivers">{employees.filter((e) => e.role === "Precision Driver").map((e) => e.name).join(", ") || "-"}</SummaryRow>
                    <SummaryRow label="Freelancers">{employees.filter((e) => e.role === "Freelancer").map((e) => e.name).join(", ") || "-"}</SummaryRow>
                    <SummaryRow label="Crew">{`${isCrewed ? "Crewed" : "Manual"} - ${allocatedCrewCount} / ${Number(requiredCrewCount) || 0}`}</SummaryRow>
                  </div>

                  <div style={summarySection}>
                    <h4 style={summarySectionTitle}>Assets</h4>
                    <SummaryRow label="Vehicles">
                      {Object.values(vehicleGroups)
                        .flat()
                        .filter((v) => vehicles.includes(v.id))
                        .map((v) => {
                          const vs = vehicleStatus[v.id] || status;
                          const label = v.registration ? `${v.name} - ${v.registration}` : v.name;
                          return <span key={v.id} style={summaryPill}>{label} - {vs}</span>;
                        })}
                      {vehicles.length === 0 && "-"}
                    </SummaryRow>
                    <SummaryRow label="Equipment">{equipment.join(", ") || "-"}</SummaryRow>
                  </div>

                  <div style={summarySection}>
                    <h4 style={summarySectionTitle}>Logistics</h4>
                    <SummaryRow label="Hotel">{hasHotel ? "Yes" : "No"}</SummaryRow>
                    {hasHotel && (
                      <SummaryRow label="Cost">{`${hotelPaidBy || "-"} - ${hotelNights || "-"} nights - ${hotelTotal ? `GBP ${hotelTotal.toFixed(2)}` : "-"}`}</SummaryRow>
                    )}
                    {hasRiggingAddress && (
                      <SummaryRow label="Rigging">{riggingAddress || "-"}</SummaryRow>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </form>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
