"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db, auth, storage as storageInstance } from "../../../../firebaseConfig";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import DatePicker from "react-multi-date-picker";

/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens + shared styles (MATCH CREATE)
──────────────────────────────────────────────────────────────────────────── */
const UI = {
  radius: 16,
  radiusSm: 12,
  radiusXs: 10,
  shadow: "0 12px 32px rgba(15,23,42,0.07)",
  border: "1px solid #dbe2ea",
  bg: "#ffffff",
  bgAlt: "#f5f8fb",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c9d6e2",
};

const pageWrap = {
  display: "flex",
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: "#eef3f8",
};

const mainWrap = {
  flex: 1,
  color: UI.text,
  maxWidth: 1600,
  margin: "0 auto",
  padding: "24px 28px 32px",
};

const h1Style = {
  color: UI.text,
  marginBottom: 0,
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const pageHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 18,
  marginBottom: 18,
  flexWrap: "wrap",
};

const headerChecksBox = {
  display: "flex",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap",
  padding: "12px 16px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: UI.bg,
  boxShadow: "0 4px 18px rgba(15,23,42,0.04)",
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 0.72fr) minmax(440px, 1.14fr) minmax(440px, 1.14fr)",
  gap: 18,
  marginTop: 10,
};

const card = {
  background: UI.bg,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadow,
  padding: 18,
};
const cardTitle = {
  margin: "0 0 14px",
  fontSize: 16,
  fontWeight: 800,
  color: UI.text,
  letterSpacing: "-0.01em",
};

const field = {
  label: {
    display: "block",
    fontWeight: 700,
    marginBottom: 7,
    color: UI.text,
    fontSize: 13,
  },
  input: {
    width: "100%",
    height: 40,
    padding: "9px 12px",
    fontSize: 14,
    borderRadius: UI.radiusXs,
    border: "1px solid #ccd6e0",
    background: "#fff",
    color: UI.text,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 80,
    padding: "11px 12px",
    fontSize: 14,
    borderRadius: UI.radiusXs,
    border: "1px solid #ccd6e0",
    background: "#fff",
    color: UI.text,
    boxSizing: "border-box",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 600,
    marginBottom: 8,
  },
};

const accordionBtn = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d4dde7",
  background: "#f8fafc",
  cursor: "pointer",
  fontWeight: 700,
  color: UI.text,
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 9px",
  fontSize: 12,
  borderRadius: 999,
  background: UI.brandSoft,
  border: `1px solid ${UI.brandBorder}`,
  color: UI.brand,
  fontWeight: 700,
};

const divider = { height: 1, background: "#e2e8f0", margin: "16px 0" };

const checkboxGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "6px 18px",
  alignItems: "start",
};

const actionsRow = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 16,
};

const subCard = {
  padding: 14,
  borderRadius: UI.radiusSm,
  background: UI.bgAlt,
  border: "1px solid #e2e8f0",
};

const btn = {
  padding: "10px 14px",
  borderRadius: UI.radiusXs,
  border: `1px solid ${UI.brand}`,
  cursor: "pointer",
  fontWeight: 700,
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
const btnDanger = {
  ...btn,
  background: "#fff",
  borderColor: "#dc2626",
  color: "#dc2626",
};

const summaryCard = {
  ...card,
  position: "sticky",
  top: 12,
  alignSelf: "start",
  background: "#162434",
  color: "#e8eef5",
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: "0 18px 36px rgba(15,23,42,0.16)",
};

const summaryRow = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px dashed rgba(255,255,255,0.12)",
};

/* ────────────────────────────────────────────────────────────────────────────
   Status + blocking
──────────────────────────────────────────────────────────────────────────── */
const VEHICLE_STATUSES = [
  "Confirmed",
  "First Pencil",
  "Second Pencil",
  "Enquiry",
  "Stunt", //  added
  "Maintenance",
  "DNH",
  "Lost",
  "Postponed",
  "Cancelled",
  "Complete",
];

const BLOCKING_STATUSES = ["Confirmed", "First Pencil", "Second Pencil"];
const doesBlockBooking = (b) =>
  BLOCKING_STATUSES.includes((b.status || "").trim());
const isVehicleBlockingStatus = (status) => {
  const s = (status || "").trim();
  return BLOCKING_STATUSES.includes(s) || s === "Maintenance";
};

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

const toYMD = (raw) => {
  if (!raw) return "";
  if (typeof raw === "string") {
    // could be "YYYY-MM-DD" or ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  if (typeof raw?.toDate === "function") {
    const d = raw.toDate();
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const expandBookingDates = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length)
    return b.bookingDates;
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
      out.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      );
    }
  }
  return out;
};
const TIME_OPTIONS = buildTimeOptions();

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

const contactIdFromEmail = (email) =>
  (email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") || null;

/* ────────────────────────────────────────────────────────────────────────────
   Employee helpers
──────────────────────────────────────────────────────────────────────────── */
const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const employeesKey = (e) => `${e?.role || ""}::${e?.name || ""}`;

const uniqEmpObjects = (arr) => {
  const seen = new Set();
  const out = [];
  (arr || []).forEach((e) => {
    if (!e?.name || !e?.role) return;
    const k = employeesKey(e);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ role: e.role, name: e.name });
  });
  return out;
};

/* ────────────────────────────────────────────────────────────────────────────
   Vehicle lookup: id / reg / name
──────────────────────────────────────────────────────────────────────────── */
const normalizeVehicleKeysListForLookup = (list, lookup) => {
  if (!Array.isArray(list) || !list.length) return [];
  const { byId = {}, byReg = {}, byName = {} } = lookup || {};
  const out = [];

  list.forEach((raw) => {
    let match = null;

    if (raw && typeof raw === "object") {
      const id = raw.id || raw.vehicleId;
      const reg = raw.registration;
      const nm = raw.name;

      if (id && byId[id]) match = byId[id];
      else if (reg && byReg[String(reg).toUpperCase()])
        match = byReg[String(reg).toUpperCase()];
      else if (nm && byName[String(nm).toLowerCase()])
        match = byName[String(nm).toLowerCase()];
    } else {
      const s = String(raw || "").trim();
      if (!s) return;
      if (byId[s]) match = byId[s];
      else if (byReg[s.toUpperCase()]) match = byReg[s.toUpperCase()];
      else if (byName[s.toLowerCase()]) match = byName[s.toLowerCase()];
    }

    if (match?.id) out.push(match.id);
  });

  return Array.from(new Set(out));
};

const toJsDate = (raw) => {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw?.toDate === "function") return raw.toDate();
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
};

/* ────────────────────────────────────────────────────────────────────────────
   Money helpers
──────────────────────────────────────────────────────────────────────────── */
const toMoney = (raw) => {
  if (raw === null || typeof raw === "undefined") return "";
  const s = String(raw).replace(/[^\d.]/g, "");
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : "";
};

const formatAuditDate = (raw) => {
  if (!raw) return "";
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-");
    return `${d}/${m}/${y.slice(-2)}`;
  }
  const dt = toJsDate(raw);
  if (!dt) return str;
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = String(dt.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

const AUDIT_FIELDS = [
  "jobNumber",
  "client",
  "location",
  "status",
  "statusReasons",
  "statusReasonOther",
  "shootType",
  "bookingDates",
  "date",
  "startDate",
  "endDate",
  "callTime",
  "callTimesByDate",
  "employees",
  "employeesByDate",
  "vehicles",
  "vehicleStatus",
  "equipment",
  "notes",
  "notesByDate",
  "isCrewed",
  "requiredCrewCount",
  "hasHS",
  "hasRiskAssessment",
  "hasHotel",
  "hotelPaidBy",
  "hotelNights",
  "hotelPricePerNight",
  "hasRiggingAddress",
  "riggingAddress",
  "additionalContacts",
  "attachments",
];

const AUDIT_LABELS = {
  jobNumber: "Job number",
  client: "Production",
  location: "Location",
  status: "Status",
  statusReasons: "Status reasons",
  statusReasonOther: "Status reason detail",
  shootType: "Shoot type",
  bookingDates: "Dates",
  date: "Single date",
  startDate: "Start date",
  endDate: "End date",
  callTime: "Call time",
  callTimesByDate: "Call times by day",
  employees: "Employees",
  employeesByDate: "Employees by day",
  vehicles: "Vehicles",
  vehicleStatus: "Vehicle statuses",
  equipment: "Equipment",
  notes: "Notes",
  notesByDate: "Day notes",
  isCrewed: "Crewed",
  requiredCrewCount: "Required crew count",
  hasHS: "HS",
  hasRiskAssessment: "Risk assessment",
  hasHotel: "Hotel",
  hotelPaidBy: "Hotel paid by",
  hotelNights: "Hotel nights",
  hotelPricePerNight: "Hotel price per night",
  hasRiggingAddress: "Rigging",
  riggingAddress: "Rigging address",
  additionalContacts: "Additional contacts",
  attachments: "Attachments",
};

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableSortObject(value[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

function normalizeAuditValue(key, value) {
  switch (key) {
    case "employees":
      return (Array.isArray(value) ? value : [])
        .map((e) => `${e?.role || ""}:${e?.name || ""}`)
        .filter(Boolean)
        .sort();
    case "employeesByDate":
      return Object.keys(value || {})
        .sort()
        .reduce((acc, date) => {
          acc[date] = normalizeAuditValue("employees", value?.[date]);
          return acc;
        }, {});
    case "vehicles":
    case "equipment":
    case "bookingDates":
    case "statusReasons":
      return (Array.isArray(value) ? value : []).map(String).sort();
    case "vehicleStatus":
    case "callTimesByDate":
    case "notesByDate":
      return stableSortObject(value || {});
    case "additionalContacts":
      return (Array.isArray(value) ? value : [])
        .map((c) => ({
          department: String(c?.department || "").trim(),
          name: String(c?.name || "").trim(),
          email: String(c?.email || "").trim(),
          phone: String(c?.phone || "").trim(),
        }))
        .sort((a, b) =>
          `${a.department}|${a.name}|${a.email}|${a.phone}`.localeCompare(
            `${b.department}|${b.name}|${b.email}|${b.phone}`
          )
        );
    case "attachments":
      return (Array.isArray(value) ? value : [])
        .map((file) => String(file?.name || file?.label || file?.url || file || "").trim())
        .filter(Boolean)
        .sort();
    default:
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value === "string") return value.trim();
      return stableSortObject(value ?? null);
  }
}

function summarizeAuditValue(key, value) {
  if (
    value === null ||
    typeof value === "undefined" ||
    value === "" ||
    (Array.isArray(value) && !value.length) ||
    (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)
  ) {
    return "None";
  }

  switch (key) {
    case "employees":
      return (Array.isArray(value) ? value : [])
        .map((e) => [e?.role, e?.name].filter(Boolean).join(": "))
        .filter(Boolean)
        .join(", ") || "None";
    case "employeesByDate":
      return Object.keys(value || {})
        .sort()
        .map((date) => `${formatAuditDate(date)} (${summarizeAuditValue("employees", value?.[date])})`)
        .join("; ") || "None";
    case "vehicles":
    case "equipment":
    case "bookingDates":
    case "statusReasons":
      return (Array.isArray(value) ? value : [])
        .map((item) =>
          key === "bookingDates" ? formatAuditDate(item) : String(item)
        )
        .join(", ") || "None";
    case "vehicleStatus":
    case "callTimesByDate":
    case "notesByDate":
      return Object.keys(value || {})
        .sort()
        .map((k) => `${formatAuditDate(k)}: ${String(value[k] ?? "").trim() || "None"}`)
        .join("; ") || "None";
    case "date":
    case "startDate":
    case "endDate":
      return formatAuditDate(value);
    case "additionalContacts":
      return (Array.isArray(value) ? value : [])
        .map((c) => [c?.name, c?.department, c?.email, c?.phone].filter(Boolean).join(" / "))
        .filter(Boolean)
        .join("; ") || "None";
    case "attachments":
      return (Array.isArray(value) ? value : [])
        .map((file) => String(file?.name || file?.label || file?.url || file || "").trim())
        .filter(Boolean)
        .join(", ") || "None";
    case "isCrewed":
    case "hasHS":
    case "hasRiskAssessment":
    case "hasHotel":
    case "hasRiggingAddress":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

function buildBookingChangeList(before = {}, after = {}) {
  return AUDIT_FIELDS.reduce((changes, key) => {
    const beforeNorm = normalizeAuditValue(key, before?.[key]);
    const afterNorm = normalizeAuditValue(key, after?.[key]);
    if (JSON.stringify(beforeNorm) === JSON.stringify(afterNorm)) return changes;

    changes.push(
      `${AUDIT_LABELS[key] || key}: ${summarizeAuditValue(key, before?.[key])} -> ${summarizeAuditValue(
        key,
        after?.[key]
      )}`
    );
    return changes;
  }, []);
}

/* ────────────────────────────────────────────────────────────────────────────
   Edit Booking Page (MATCH CREATE UI)
──────────────────────────────────────────────────────────────────────────── */
export default function EditBookingPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Core fields
  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");

  const [status, setStatus] = useState("Confirmed");
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

  //  restored hotel details
  const [hotelPaidBy, setHotelPaidBy] = useState(""); // "Production" | "Bickers"
  const [hotelNights, setHotelNights] = useState(""); // string for input
  const [hotelPricePerNight, setHotelPricePerNight] = useState(""); // string for input

  const [hasRiggingAddress, setHasRiggingAddress] = useState(false);
  const [riggingAddress, setRiggingAddress] = useState("");

  // Flags
  const [isSecondPencil, setIsSecondPencil] = useState(false);

  //  manual crewing only
  const [isCrewed, setIsCrewed] = useState(false);

  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);

  // Crew requirement (NO auto-crewed)
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

  // Contacts block
  const [additionalContacts, setAdditionalContacts] = useState([]);
  const [savedContacts, setSavedContacts] = useState([]);
  const [selectedSavedContactId, setSelectedSavedContactId] = useState("");
  const [savedContactSearch, setSavedContactSearch] = useState("");

  // Attachments
  const [attachments, setAttachments] = useState([]); // existing
  const [newFiles, setNewFiles] = useState([]);
  const [pdfProgress, setPdfProgress] = useState(0);

  // Data lists
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [employeeList, setEmployeeList] = useState([]); // drivers
  const [freelancerList, setFreelancerList] = useState([]);

  const [vehicleGroups, setVehicleGroups] = useState({
    Bike: [],
    "Electric Tracking Vehicles": [],
    "Small Tracking Vehicles": [],
    "Large Tracking Vehicles": [],
    "Low Loaders": [],
    "Transport Lorry": [],
    "Transport Van": [],
    "Other Vehicles": [],
  });
  const [openGroups, setOpenGroups] = useState({
    Bike: false,
    "Electric Tracking Vehicles": false,
    "Small Tracking Vehicles": false,
    "Large Tracking Vehicles": false,
    "Low Loaders": false,
    "Transport Lorry": false,
    "Transport Van": false,
    "Other Vehicles": false,
  });

  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [openEquipGroups, setOpenEquipGroups] = useState({});

  // Lookups
  const [vehicleLookup, setVehicleLookup] = useState({
    byId: {},
    byReg: {},
    byName: {},
  });

  // Maintenance bookings
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);

  // Employee code map
  const [nameToCode, setNameToCode] = useState({});

  const assetSearchLower = useMemo(
    () => String(assetSearch || "").trim().toLowerCase(),
    [assetSearch]
  );

  const filteredVehicleGroups = useMemo(() => {
    if (!assetSearchLower) return vehicleGroups;
    const out = {};
    Object.entries(vehicleGroups || {}).forEach(([group, items]) => {
      out[group] = (items || []).filter((vehicle) => {
        const text = `${vehicle?.name || ""} ${vehicle?.registration || ""}`.toLowerCase();
        return text.includes(assetSearchLower);
      });
    });
    return out;
  }, [vehicleGroups, assetSearchLower]);

  const filteredEquipmentGroups = useMemo(() => {
    if (!assetSearchLower) return equipmentGroups;
    const out = {};
    Object.entries(equipmentGroups || {}).forEach(([group, items]) => {
      out[group] = (items || []).filter((rawName) =>
        String(rawName || "").toLowerCase().includes(assetSearchLower)
      );
    });
    return out;
  }, [equipmentGroups, assetSearchLower]);

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
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [sortedSavedContacts, savedContactSearch]);

  // Preserve existing history on save
  const [existingHistory, setExistingHistory] = useState([]);
  const [createdAtIso, setCreatedAtIso] = useState(null);
  const [createdByEmail, setCreatedByEmail] = useState(null);
  const [originalBookingData, setOriginalBookingData] = useState(null);

  const isMaintenance = status === "Maintenance";

  // Derived dates (same as create)
  const selectedDates = useMemo(() => {
    if (useCustomDates) return customDates;
    if (!startDate) return [];
    if (isRange && endDate) return enumerateDaysYMD_UTC(startDate, endDate);
    return [startDate];
  }, [useCustomDates, customDates, startDate, isRange, endDate]);

  const coreFilled = isMaintenance
    ? Boolean((location || "").trim())
    : Boolean((client || "").trim() && (location || "").trim());

  const saveTooltip = isMaintenance
    ? !coreFilled
      ? "Fill Location to save"
      : ""
    : !coreFilled
    ? "Fill Production and Location to save"
    : "";

  /* ────────────────────────────────────────────────────────────
      allocated crew count (display only) — NO auto setIsCrewed
  ───────────────────────────────────────────────────────────── */
  const allocatedCrewCount = useMemo(() => {
    const selectedCount = employees.filter(
      (e) => e?.name && e.name !== "Other"
    ).length;

    const customNames = customEmployee
      ? customEmployee
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];

    return selectedCount + customNames.length;
  }, [employees, customEmployee]);

  /* ────────────────────────────────────────────────────────────
     Load lists + booking
  ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const loadAll = async () => {
      if (!bookingId) return;

      setLoading(true);

      const [
        bookingSnap,
        holidaySnap,
        empSnap,
        vehicleSnap,
        equipSnap,
        workSnap,
        contactsSnap,
        bookingDocSnap,
      ] = await Promise.all([
        getDocs(collection(db, "bookings")),
        getDocs(collection(db, "holidays")),
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "vehicles")),
        getDocs(collection(db, "equipment")),
        getDocs(collection(db, "maintenanceBookings")),
        getDocs(collection(db, "contacts")),
        getDoc(doc(db, "bookings", bookingId)),
      ]);

      if (!bookingDocSnap.exists()) {
        alert("Booking not found.");
        router.push("/dashboard");
        return;
      }

      const bookingData = { id: bookingDocSnap.id, ...bookingDocSnap.data() };
      setOriginalBookingData(bookingDocSnap.data() || {});

      // all bookings for conflict checks (exclude current later)
      setAllBookings(bookingSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setHolidayBookings(holidaySnap.docs.map((d) => d.data()));

      // employees lists + codes
      const allEmployees = empSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setEmployeeList(
        allEmployees
          .filter((emp) => {
            const titles = Array.isArray(emp.jobTitle)
              ? emp.jobTitle
              : [emp.jobTitle];
            return titles.some((t) => (t || "").toLowerCase() === "driver");
          })
          .map((emp) => ({ id: emp.id, name: emp.name || emp.fullName || emp.id }))
      );

      setFreelancerList(
        allEmployees
          .filter((emp) => {
            const titles = Array.isArray(emp.jobTitle)
              ? emp.jobTitle
              : [emp.jobTitle];
            return titles.some((t) => {
              const val = (t || "").toLowerCase();
              return val === "freelance" || val === "freelancer";
            });
          })
          .map((emp) => ({ id: emp.id, name: emp.name || emp.fullName || emp.id }))
      );

      const map = {};
      for (const emp of allEmployees) {
        const nm = String(emp.name || emp.fullName || "").trim().toLowerCase();
        const code = String(emp.userCode || "").trim();
        if (nm && code) map[nm] = code;
      }
      setNameToCode(map);

      // vehicles grouped + lookup
      const grouped = {
        Bike: [],
        "Electric Tracking Vehicles": [],
        "Small Tracking Vehicles": [],
        "Large Tracking Vehicles": [],
        "Low Loaders": [],
        "Transport Lorry": [],
        "Transport Van": [],
        "Other Vehicles": [],
      };

      const byId = {};
      const byReg = {};
      const byName = {};

      vehicleSnap.docs.forEach((docu) => {
        const v = docu.data();
        const id = docu.id;
        const category = (v.category || "").trim().toLowerCase();
        const name = (v.name || "").trim();
        const registration = (v.registration || "").trim();
        if (!name && !registration) return;

        const info = { id, name, registration };
        if (id) byId[id] = info;
        if (registration) byReg[registration.toUpperCase()] = info;
        if (name) byName[name.toLowerCase()] = info;

        if (category.includes("bike")) grouped["Bike"].push(info);
        else if (category.includes("electric"))
          grouped["Electric Tracking Vehicles"].push(info);
        else if (category.includes("small"))
          grouped["Small Tracking Vehicles"].push(info);
        else if (category.includes("large"))
          grouped["Large Tracking Vehicles"].push(info);
        else if (category.includes("low loader"))
          grouped["Low Loaders"].push(info);
        else if (category.includes("lorry"))
          grouped["Transport Lorry"].push(info);
        else if (category.includes("van"))
          grouped["Transport Van"].push(info);
        else grouped["Other Vehicles"].push(info);
      });

      setVehicleGroups(grouped);
      setVehicleLookup({ byId, byReg, byName });

      // equipment groups
      const groupedEquip = {};
      equipSnap.docs.forEach((d) => {
        const e = d.data();
        const cat = (e.category || "Other").trim();
        const nm = (e.name || e.label || "").trim();
        if (!nm) return;
        if (!groupedEquip[cat]) groupedEquip[cat] = [];
        groupedEquip[cat].push(nm);
      });
      setEquipmentGroups(groupedEquip);

      const openEquip = {};
      Object.keys(groupedEquip).forEach((k) => (openEquip[k] = false));
      setOpenEquipGroups(openEquip);

      setMaintenanceBookings(workSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSavedContacts(contactsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // ---- Prefill booking fields ----
      setJobNumber(bookingData.jobNumber || "");
      setClient(bookingData.client || "");
      setLocation(bookingData.location || "");
      setStatus(bookingData.status || "Confirmed");
      setShootType(bookingData.shootType || "Day");

      setStatusReasons(
        Array.isArray(bookingData.statusReasons) ? bookingData.statusReasons : []
      );
      setStatusReasonOther(bookingData.statusReasonOther || "");

      // flags
      setIsSecondPencil(Boolean(bookingData.isSecondPencil));
      setIsCrewed(Boolean(bookingData.isCrewed)); //  manual stored value
      setHasHS(Boolean(bookingData.hasHS));
      setHasRiskAssessment(Boolean(bookingData.hasRiskAssessment));

      // crew requirement (kept as guidance)
      const req = Number(bookingData.requiredCrewCount);
      setRequiredCrewCount(Number.isFinite(req) ? req : 1);

      // notes/call/hotel/rigging
      setNotes(bookingData.notes || "");
      setNotesByDate(
        bookingData.notesByDate && typeof bookingData.notesByDate === "object"
          ? bookingData.notesByDate
          : {}
      );
      setCallTime(bookingData.callTime || "");
      setCallTimesByDate(
        bookingData.callTimesByDate &&
          typeof bookingData.callTimesByDate === "object"
          ? bookingData.callTimesByDate
          : {}
      );

      //  HOTEL (supports likely legacy keys too)
      const loadedHasHotel = Boolean(
        bookingData.hasHotel ??
          bookingData.hotelBooked ??
          bookingData.isHotelBooked ??
          bookingData.hotel
      );
      setHasHotel(loadedHasHotel);

      const paidBy =
        bookingData.hotelPaidBy ??
        bookingData.hotelPaid ??
        bookingData.hotelPayer ??
        "";
      setHotelPaidBy(String(paidBy || ""));

      const nights =
        bookingData.hotelNights ??
        bookingData.nights ??
        bookingData.hotelNightCount ??
        "";
      setHotelNights(
        nights === 0 || nights ? String(nights) : ""
      );

      const pppn =
        bookingData.hotelPricePerNight ??
        bookingData.pricePerNight ??
        bookingData.hotelRate ??
        bookingData.hotelCostPerNight ??
        "";
      setHotelPricePerNight(toMoney(pppn));

      setHasRiggingAddress(Boolean(bookingData.hasRiggingAddress));
      setRiggingAddress(bookingData.riggingAddress || "");

      // employees
      const rawEmployees = Array.isArray(bookingData.employees)
        ? bookingData.employees
        : [];
      const cleanedEmployees = rawEmployees.length
        ? uniqEmpObjects(
            rawEmployees.map((e) =>
              typeof e === "string" ? { role: "Precision Driver", name: e } : e
            )
          )
        : [];
      setEmployees(cleanedEmployees);

      // employeesByDate
      setEmployeesByDate(
        bookingData.employeesByDate &&
          typeof bookingData.employeesByDate === "object"
          ? bookingData.employeesByDate
          : {}
      );

      setCustomEmployee("");

      // vehicles (normalise to ids)
      const rawVehicles = Array.isArray(bookingData.vehicles)
        ? bookingData.vehicles
        : [];
      const vehicleIds = normalizeVehicleKeysListForLookup(rawVehicles, {
        byId,
        byReg,
        byName,
      });
      setVehicles(vehicleIds);

      const vs =
        bookingData.vehicleStatus && typeof bookingData.vehicleStatus === "object"
          ? bookingData.vehicleStatus
          : {};
      // ensure statuses exist for selected vehicles
      const vsFixed = { ...vs };
      vehicleIds.forEach((vid) => {
        if (!vsFixed[vid]) vsFixed[vid] = bookingData.status || "Confirmed";
      });
      setVehicleStatus(vsFixed);

      // equipment
      const rawEquip = Array.isArray(bookingData.equipment)
        ? bookingData.equipment
        : [];
      const equipNames = rawEquip
        .map((x) => (typeof x === "string" ? x : x?.name))
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      setEquipment(Array.from(new Set(equipNames)));

      // contacts
      const rawContacts = Array.isArray(bookingData.additionalContacts)
        ? bookingData.additionalContacts
        : [];
      setAdditionalContacts(
        rawContacts.map((c) => ({
          department: c.department || "",
          departmentOther: "",
          name: c.name || "",
          email: c.email || "",
          phone: c.phone || "",
        }))
      );

      // attachments
      const rawAtt = Array.isArray(bookingData.attachments)
        ? bookingData.attachments
        : [];
      setAttachments(rawAtt);

      // created meta/history
      setExistingHistory(Array.isArray(bookingData.history) ? bookingData.history : []);
      setCreatedAtIso(bookingData.createdAt || null);
      setCreatedByEmail(bookingData.createdBy || null);

      // dates mode reconstruction
      const bd = Array.isArray(bookingData.bookingDates) ? bookingData.bookingDates : [];
      const sY = toYMD(bookingData.startDate);
      const eY = toYMD(bookingData.endDate);
      const dY = toYMD(bookingData.date);

      if (sY && eY) {
        setUseCustomDates(false);
        setIsRange(true);
        setStartDate(sY);
        setEndDate(eY);
        setCustomDates([]);
      } else if (dY) {
        setUseCustomDates(false);
        setIsRange(false);
        setStartDate(dY);
        setEndDate("");
        setCustomDates([]);
      } else if (bd.length) {
        // If bookingDates are consecutive, prefer range UI; otherwise custom dates UI
        const sorted = [...bd].sort();
        const consecutive =
          sorted.length > 1
            ? enumerateDaysYMD_UTC(sorted[0], sorted[sorted.length - 1]).length ===
              sorted.length
            : false;

        if (consecutive && sorted.length > 1) {
          setUseCustomDates(false);
          setIsRange(true);
          setStartDate(sorted[0]);
          setEndDate(sorted[sorted.length - 1]);
          setCustomDates([]);
        } else if (sorted.length === 1) {
          setUseCustomDates(false);
          setIsRange(false);
          setStartDate(sorted[0]);
          setEndDate("");
          setCustomDates([]);
        } else {
          setUseCustomDates(true);
          setIsRange(false);
          setCustomDates(sorted);
          setStartDate("");
          setEndDate("");
        }
      }

      setLoading(false);
    };

    loadAll().catch((err) => {
      console.error("Failed loading edit page:", err);
      alert("Failed to load booking.");
      router.push("/dashboard");
    });
  }, [bookingId, router]);

  /* ────────────────────────────────────────────────────────────
     Conflicts (exclude current booking)
  ───────────────────────────────────────────────────────────── */
  const overlapping = useMemo(() => {
    if (!selectedDates.length) return [];
    return (allBookings || [])
      .filter((b) => b?.id && b.id !== bookingId)
      .filter((b) => anyDateOverlap(expandBookingDates(b), selectedDates));
  }, [allBookings, selectedDates, bookingId]);

  const { bookedVehicleIds, heldVehicleIds, vehicleBlockingStatusById } = useMemo(() => {
    const blockingById = {};
    const booked = [];
    const held = [];

    overlapping.forEach((b) => {
      const keys = normalizeVehicleKeysListForLookup(b.vehicles || [], vehicleLookup);
      const vmap = b.vehicleStatus || {};

      keys.forEach((vid) => {
        const itemStatus = (vmap[vid] ?? b.status) || "";
        if (!itemStatus) return;

        if (isVehicleBlockingStatus(itemStatus)) {
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
      const explicit = String(
        booking?.maintenanceTypeLabel || booking?.maintenanceTypeOther || booking?.type || booking?.maintenanceType || ""
      )
        .trim()
        .toUpperCase();
      if (explicit === "MOT") return "MOT";
      if (explicit === "SERVICE") return "Service";
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
      const explicit = String(
        booking?.maintenanceTypeLabel || booking?.maintenanceTypeOther || booking?.type || booking?.maintenanceType || ""
      )
        .trim()
        .toUpperCase();
      if (explicit === "MOT") return "MOT";
      if (explicit === "SERVICE") return "Service";
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

  /* ────────────────────────────────────────────────────────────
     Holiday checks
  ───────────────────────────────────────────────────────────── */
  const isEmployeeOnHolidayForDates = (employeeName, dates) => {
    if (!employeeName || !dates?.length) return false;
    return holidayBookings.some((h) => {
      if (h.employee !== employeeName) return false;
      const hs = new Date(h.startDate);
      const he = new Date(h.endDate);
      return dates.some((dStr) => {
        const d = new Date(dStr);
        return d >= hs && d <= he;
      });
    });
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
    return [...uniqStrings([...base, ...customSelected]), "Other"];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeList, employees]);

  const freelancerOptions = useMemo(() => {
    const base = freelancerList.map((e) => e?.name).filter(Boolean);
    const selected = selectedNamesByRole("Freelancer");
    const customSelected = selected.filter((n) => !base.includes(n));
    return [...uniqStrings([...base, ...customSelected]), "Other"];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freelancerList, employees]);

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
    const next = { ...openEquipGroups };
    Object.entries(equipmentGroups).forEach(([group, items]) => {
      const hasSelected = items?.some((name) => equipment.includes(name));
      if (hasSelected) next[group] = true;
    });
    setOpenEquipGroups(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setVehicles((prev) =>
      checked ? uniq([...prev, vehicleId]) : prev.filter((v) => v !== vehicleId)
    );
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
     Attachment remove (optional but useful on edit)
  ───────────────────────────────────────────────────────────── */
  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ────────────────────────────────────────────────────────────
     Submit (UPDATE)
  ───────────────────────────────────────────────────────────── */
  const handleUpdate = async () => {
    if (!bookingId) return;

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
      if (!(location || "").trim()) missing.push("Location");
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
        const baseList =
          Array.isArray(fromState) && fromState.length ? fromState : cleanedEmployees;
        const filtered = baseList.filter((e) => cleanedSet.has(employeesKey(e)));
        if (filtered.length) employeesByDatePayload[date] = filtered;
      });

      if (!Object.keys(employeesByDatePayload).length) {
        bookingDates.forEach((date) => {
          employeesByDatePayload[date] = [...cleanedEmployees];
        });
      }
    }

    for (const employee of cleanedEmployees) {
      const datesForEmp = bookingDates.filter((d) => {
        const list = employeesByDatePayload[d] || [];
        return list.some((e) => e.name === employee.name && e.role === employee.role);
      });
      if (datesForEmp.length && isEmployeeOnHolidayForDates(employee.name, datesForEmp)) {
        alert(`${employee.name} is on holiday for one or more selected dates.`);
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

    setSaving(true);
    setPdfProgress(0);

    // Upload new files if any
    if (newFiles.length > 0) {
      const uploaded = [];
      for (const file of newFiles) {
        const safeName = `${jobNumber || "nojob"}_${file.name}`.replace(/\s+/g, "_");
        const folder = file.name.toLowerCase().endsWith(".pdf") ? "booking_pdfs" : "quotes";
        const storageRefObj = ref(storageInstance, `${folder}/${safeName}`);

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
            : "application/octet-stream");

        const task = uploadBytesResumable(storageRefObj, file, { contentType });

        await new Promise((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) =>
              setPdfProgress(
                Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
              ),
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
    const allocatedAtSave = cleanedEmployees.length;

    //  manual only (no auto)
    const isCrewedAtSave = Boolean(isCrewed);

    //  Hotel payload
    const hotelPaidByClean = hasHotel ? String(hotelPaidBy || "").trim() : "";
    const hotelNightsNum = hasHotel ? Number(String(hotelNights || "").trim()) : 0;
    const hotelPricePerNightNum = hasHotel
      ? Number(String(hotelPricePerNight || "").trim())
      : 0;

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
      isCrewed: isCrewedAtSave,
      hasHS,
      hasRiskAssessment,
      notes,

      requiredCrewCount: Number.isFinite(req) ? req : 0,
      allocatedCrewCount: allocatedAtSave,

      notesByDate: filteredNotesByDate,
      status,
      bookingDates,
      shootType,

      attachments: nextAttachments,
      quoteUrl: firstUrl || null,
      pdfURL: firstUrl || null,

      //  hotel fields restored
      hasHotel,
      hotelPaidBy: hotelPaidByClean,
      hotelNights: Number.isFinite(hotelNightsNum) ? hotelNightsNum : 0,
      hotelPricePerNight: Number.isFinite(hotelPricePerNightNum)
        ? hotelPricePerNightNum
        : 0,
      hotelTotal:
        hasHotel && Number.isFinite(hotelNightsNum) && Number.isFinite(hotelPricePerNightNum)
          ? hotelNightsNum * hotelPricePerNightNum
          : 0,

      // call times
      callTime: (!isRange && !useCustomDates ? callTime || "" : ""),
      ...(Object.keys(callTimesByDatePayload).length
        ? { callTimesByDate: callTimesByDatePayload }
        : {}),

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

      // preserve created meta
      createdBy: createdByEmail || user?.email || "Unknown",
      createdAt: createdAtIso || new Date().toISOString(),

      // update meta
      lastEditedBy: user?.email || "Unknown",
      updatedAt: new Date().toISOString(),
    };

    const changeLines = buildBookingChangeList(originalBookingData || {}, payload);

    payload.history = [
      ...(Array.isArray(existingHistory) ? existingHistory : []),
      {
        action: "Edited",
        user: user?.email || "Unknown",
        timestamp: new Date().toISOString(),
        changes: changeLines,
        details: changeLines.join("\n") || "No field-level changes detected.",
      },
    ];

    try {
      await updateDoc(doc(db, "bookings", bookingId), payload);

      // Save contacts back into contacts collection (merge)
      for (const c of additionalContactsToSave) {
        const id = contactIdFromEmail(c.email);
        if (!id) continue;
        await setDoc(
          doc(db, "contacts", id),
          {
            name: c.name,
            email: c.email,
            phone: c.phone,
            number: c.phone,
            department: c.department,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      setPdfProgress(0);
      setNewFiles([]);
      alert("Booking Updated ");
      router.push("/dashboard?updated=true");
    } catch (err) {
      console.error(" Error updating booking:", err);
      alert("Failed to update booking \n\n" + err.message);
    } finally {
      setSaving(false);
    }
  };

  const isEmployeeBooked = (name) => bookedEmployeeNames.includes(name);
  const isEmployeeHeld = (name) => heldEmployeeNames.includes(name);

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={mainWrap}>
            <h1 style={h1Style}>Edit Booking</h1>
            <div style={card}>Loading…</div>
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  //  hotel computed for UI + summary
  const hotelTotal =
    hasHotel &&
    Number.isFinite(Number(hotelNights)) &&
    Number.isFinite(Number(hotelPricePerNight))
      ? Number(hotelNights || 0) * Number(hotelPricePerNight || 0)
      : 0;

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={mainWrap}>
          <h1 style={h1Style}>Edit Booking</h1>

          <div style={pageHeader}>
            <div />
            <div style={headerChecksBox}>
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdate();
            }}
          >
            <div style={sectionGrid}>
              {/* Column 1: Job Info */}
              <div style={card}>
                <h3 style={cardTitle}>Job Info</h3>

                <label style={field.label}>Job Number</label>
                <input
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  required
                  style={field.input}
                />

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
                            setStatusReasons((prev) =>
                              prev.includes(r)
                                ? prev.filter((x) => x !== r)
                                : [...prev, r]
                            )
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
                <select
                  value={shootType}
                  onChange={(e) => setShootType(e.target.value)}
                  style={field.input}
                >
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>

                <label style={field.label}>Production</label>
                <input
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  style={field.input}
                  required={!isMaintenance}
                />

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
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      Contacts
                    </span>
                    <button
                      type="button"
                      onClick={handleAddContactRow}
                      style={{
                        ...btn,
                        padding: "4px 8px",
                        fontSize: 12,
                        borderRadius: 999,
                      }}
                    >
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
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            Department
                          </label>
                          <select
                            value={row.department}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "department",
                                e.target.value
                              )
                            }
                            style={field.input}
                          >
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
                              onChange={(e) =>
                                handleUpdateContactRow(
                                  idx,
                                  "departmentOther",
                                  e.target.value
                                )
                              }
                              style={{ ...field.input, marginTop: 6 }}
                            />
                          )}
                        </div>

                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            Name
                          </label>
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) =>
                              handleUpdateContactRow(idx, "name", e.target.value)
                            }
                            style={field.input}
                            placeholder="Contact name"
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            Email
                          </label>
                          <input
                            type="email"
                            value={row.email}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "email",
                                e.target.value
                              )
                            }
                            style={field.input}
                            placeholder="Email"
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              ...field.label,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            Number
                          </label>
                          <input
                            type="tel"
                            value={row.phone}
                            onChange={(e) =>
                              handleUpdateContactRow(
                                idx,
                                "phone",
                                e.target.value
                              )
                            }
                            style={field.input}
                            placeholder="Phone number"
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
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

                  {savedContacts.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <label
                        style={{
                          ...field.label,
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        Quick add from saved contacts
                      </label>
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
                          const deptLabel = c.department ? ` – ${c.department}` : "";
                          return (
                            <option key={c.id} value={c.id}>
                              {labelBase}
                              {deptLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                <label style={field.label}>Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={field.input}
                  required
                />
              </div>

              {/* Column 2: Dates & People */}
              <div style={card}>
                <h3 style={cardTitle}>Dates & People</h3>

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
                    <input
                      type="checkbox"
                      checked={isRange}
                      onChange={() => setIsRange(!isRange)}
                    />
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
                          .map((v) =>
                            typeof v?.format === "function"
                              ? v.format("YYYY-MM-DD")
                              : String(v)
                          )
                          .sort();
                        setCustomDates(normalised);
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isRange ? "1fr 1fr" : "1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <label style={field.label}>
                        {isRange ? "Start Date" : "Date"}
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required={status !== "Enquiry"}
                        style={field.input}
                      />
                    </div>
                    {isRange && (
                      <div>
                        <label style={field.label}>End Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          required={status !== "Enquiry"}
                          style={field.input}
                        />
                      </div>
                    )}
                  </div>
                )}

                {selectedDates.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: "8px 0" }}>
                      {selectedDates.length > 1
                        ? "Notes for Each Day"
                        : "Note for the Day"}
                    </h4>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit,minmax(280px,1fr))",
                        gap: 12,
                      }}
                    >
                      {selectedDates.map((date) => {
                        const selectedNote = notesByDate[date] || "";
                        const isOther = selectedNote === "Other";
                        const customOtherValue = notesByDate[`${date}-other`] || "";
                        return (
                          <div
                            key={date}
                            style={{
                              border: UI.border,
                              borderRadius: UI.radiusSm,
                              padding: 10,
                              background: UI.bgAlt,
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>
                              {new Date(date).toDateString()}
                            </div>

                            <select
                              value={selectedNote}
                              onChange={(e) =>
                                setNotesByDate({
                                  ...notesByDate,
                                  [date]: e.target.value,
                                })
                              }
                              style={field.input}
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
                                <label style={{ ...field.label, marginBottom: 6 }}>
                                  Travel duration
                                </label>
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

                <h4 style={{ margin: "8px 0" }}>Precision Driver</h4>
                <div style={checkboxGrid}>
                {driverOptions.map((name) => {
                  const isSelected = employees.some(
                    (e) => e.name === name && e.role === "Precision Driver"
                  );
                  const isBooked = isEmployeeBooked(name);
                  const isHeld = isEmployeeHeld(name);
                  const isHoliday = isEmployeeOnHolidayForDates(name, selectedDates);
                  const disabled = (isBooked || isHoliday) && !isSelected;

                  return (
                    <label key={`pd-${name}`} style={{ display: "block", marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        value={name}
                        disabled={disabled}
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const next = uniqEmpObjects([
                              ...employees,
                              { role: "Precision Driver", name },
                            ]);
                            setEmployees(next);
                            upsertEmployeeDates("Precision Driver", name, true);
                          } else {
                            const next = employees.filter(
                              (sel) =>
                                !(
                                  sel.name === name &&
                                  sel.role === "Precision Driver"
                                )
                            );
                            setEmployees(next);
                            upsertEmployeeDates("Precision Driver", name, false);
                          }
                        }}
                      />{" "}
                      <span style={{ color: disabled ? "#9ca3af" : UI.text }}>
                        {name} {isBooked && "(Booked)"} {!isBooked && isHeld && "(Held)"}{" "}
                        {isHoliday && "(On Holiday)"}
                      </span>
                    </label>
                  );
                })}
                </div>

                {/* Required crew selector + MANUAL crewed checkbox */}
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: UI.radiusSm,
                    border: UI.border,
                    background: UI.bgAlt,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <label style={{ ...field.label, marginBottom: 6 }}>
                        Crew required to mark as “Crewed”
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={requiredCrewCount}
                        onChange={(e) => {
                          const v = Math.max(
                            0,
                            parseInt(e.target.value || "0", 10)
                          );
                          setRequiredCrewCount(Number.isFinite(v) ? v : 0);
                        }}
                        style={{ ...field.input, width: 110, marginLeft: "auto", marginBottom: 8 }}
                      />
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: UI.muted }}>
                        Allocated crew
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>
                        {allocatedCrewCount} / {Math.max(0, Number(requiredCrewCount) || 0)}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: isCrewed ? "#16a34a" : "#b45309",
                          fontWeight: 700,
                        }}
                      >
                        {isCrewed ? "Crewed Yes (manual)" : "Not crewed (manual)"}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={isCrewed}
                        onChange={(e) => setIsCrewed(e.target.checked)}
                      />{" "}
                      Booking Crewed
                      <span style={{ color: UI.muted, fontWeight: 600 }}> (manual)</span>
                    </label>
                  </div>
                </div>

                <h4 style={{ margin: "8px 0" }}>Freelancers</h4>
                <div style={checkboxGrid}>
                {freelancerOptions.map((name) => {
                  const isSelected = employees.some(
                    (e) => e.name === name && e.role === "Freelancer"
                  );
                  const isBooked = isEmployeeBooked(name);
                  const isHoliday = isEmployeeOnHolidayForDates(name, selectedDates);
                  const disabled = (isBooked || isHoliday) && !isSelected;

                  return (
                    <label key={`fl-${name}`} style={{ display: "block", marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        value={name}
                        disabled={disabled}
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const next = uniqEmpObjects([
                              ...employees,
                              { role: "Freelancer", name },
                            ]);
                            setEmployees(next);
                            upsertEmployeeDates("Freelancer", name, true);
                          } else {
                            const next = employees.filter(
                              (sel) =>
                                !(
                                  sel.name === name && sel.role === "Freelancer"
                                )
                            );
                            setEmployees(next);
                            upsertEmployeeDates("Freelancer", name, false);
                          }
                        }}
                      />{" "}
                      <span style={{ color: disabled ? "#9ca3af" : UI.text }}>
                        {name} {isBooked && "(Booked)"} {isHoliday && "(On Holiday)"}
                      </span>
                    </label>
                  );
                })}
                </div>

                {employees.some((e) => e.name === "Other") && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="Other employee(s), comma-separated"
                      value={customEmployee}
                      onChange={(e) => setCustomEmployee(e.target.value)}
                      style={field.input}
                    />
                  </div>
                )}

                {selectedDates.length > 0 &&
                  employees.filter((e) => e.name && e.name !== "Other").length > 0 && (
                    <>
                      <div style={divider} />
                      <h4 style={{ margin: "8px 0" }}>Employee schedule by day</h4>
                      <p style={{ fontSize: 12, color: UI.muted, marginBottom: 8 }}>
                        Default = everyone works every selected day. Use this grid to fine-tune.
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit,minmax(260px,1fr))",
                          gap: 10,
                        }}
                      >
                        {selectedDates.map((date) => {
                          const assigned = employeesByDate[date] || [];
                          const pretty = new Date(date).toDateString();

                          return (
                            <div
                              key={date}
                              style={{
                                border: UI.border,
                                borderRadius: UI.radiusSm,
                                padding: 10,
                                background: UI.bgAlt,
                              }}
                            >
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                {pretty}
                              </div>

                              {employees
                                .filter((e) => e.name && e.name !== "Other")
                                .map((emp) => {
                                  const isOnDay = assigned.some(
                                    (x) => x.name === emp.name && x.role === emp.role
                                  );

                                  return (
                                    <label
                                      key={`${emp.role}-${emp.name}-${date}`}
                                      style={{
                                        display: "block",
                                        fontSize: 13,
                                        marginBottom: 4,
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isOnDay}
                                        onChange={() =>
                                          setEmployeesByDate((prev) => {
                                            const next = { ...prev };
                                            const list = Array.isArray(next[date])
                                              ? next[date]
                                              : [];
                                            const exists = list.some(
                                              (x) =>
                                                x.name === emp.name &&
                                                x.role === emp.role
                                            );
                                            if (exists) {
                                              const filtered = list.filter(
                                                (x) =>
                                                  !(
                                                    x.name === emp.name &&
                                                    x.role === emp.role
                                                  )
                                              );
                                              if (filtered.length) next[date] = filtered;
                                              else delete next[date];
                                            } else {
                                              next[date] = [
                                                ...list,
                                                { role: emp.role, name: emp.name },
                                              ];
                                            }
                                            return next;
                                          })
                                        }
                                      />{" "}
                                      {emp.name}{" "}
                                      <span style={{ color: UI.muted }}>
                                        ({emp.role})
                                      </span>
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
              <div style={card}>
                <h3 style={cardTitle}>Vehicles</h3>
                <input
                  type="text"
                  placeholder="Search vehicles or equipment..."
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  style={{ ...field.input, marginBottom: 8 }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 12, rowGap: 10, alignItems: "start" }}>
                {Object.entries(filteredVehicleGroups).map(([group, items]) => {
                  const isOpen = openGroups[group] || false;

                  return (
                    <div key={group}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))
                        }
                        style={accordionBtn}
                      >
                        <span>
                          {isOpen ? "▼" : "►"} {group}
                        </span>
                        <span style={pill}>{items.length}</span>
                      </button>

                      {isOpen && (
                        <div style={{ padding: "10px 6px" }}>
                          {items.map((vehicle) => {
                            const key = vehicle.id;
                            const isBooked = bookedVehicleIds.includes(key);
                            const blockedStatus = vehicleBlockingStatusById[key];
                            const isHeld = heldVehicleIds.includes(key);
                            const isSelected = vehicles.includes(key);

                            const isMaintBlocked = maintenanceVehicleBlocking.ids.has(key);
                            const maintReason = maintenanceVehicleBlocking.reasonById[key] || "Maintenance";
                            const disabled = (isBooked || isMaintBlocked) && !isSelected;

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
                                      ? `Vehicle is already booked for ${maintReason} on overlapping date(s)`
                                      : `Vehicle is already ${blockedStatus || "booked"} on overlapping date(s)`
                                    : ""
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={disabled}
                                  onChange={(e) => toggleVehicle(key, e.target.checked)}
                                />
                                <span style={{ flex: 1, color: disabled ? "#6e6f70ff" : UI.text }}>
                                  {vehicle.name}
                                  {vehicle.registration ? ` – ${vehicle.registration}` : ""}
                                  {isMaintBlocked && !isBooked && ` (${maintReason})`}
                                  {isBooked && ` (${blockedStatus || "Blocked"})`}
                                  {!isBooked && !isMaintBlocked && isHeld && " (Held)"}
                                </span>

                                {isSelected && (
                                  <select
                                    value={vehicleStatus[key] || status}
                                    onChange={(e) =>
                                      setVehicleStatus((prev) => ({
                                        ...prev,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    style={{ height: 32 }}
                                    title="Vehicle status"
                                  >
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

                {Object.entries(filteredVehicleGroups).length === 0 && (
                  <div style={{ fontSize: 13, color: UI.muted, marginTop: 4 }}>No vehicles match that search.</div>
                )}

                <div style={divider} />

                <h3 style={cardTitle}>Equipment</h3>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 12, rowGap: 10, alignItems: "start" }}>
                {Object.entries(filteredEquipmentGroups).map(([group, items]) => {
                  const isOpen = openEquipGroups[group] || false;

                  return (
                    <div key={group}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenEquipGroups((prev) => ({ ...prev, [group]: !prev[group] }))
                        }
                        style={accordionBtn}
                      >
                        <span>
                          {isOpen ? "▼" : "►"} {group}
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
                                    if (e.target.checked)
                                      setEquipment((prev) => Array.from(new Set([...prev, name])));
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

                {Object.entries(filteredEquipmentGroups).length === 0 && (
                  <div style={{ fontSize: 13, color: UI.muted, marginTop: 4 }}>No equipment matches that search.</div>
                )}
              </div>
            </div>

            {/* Files & Notes */}
            <div style={{ ...card, marginTop: 18 }}>
              <h3 style={cardTitle}>Files & Notes</h3>

              {attachments?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                    Existing files
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {attachments.map((a, idx) => (
                      <div
                        key={`${a?.url || "file"}-${idx}`}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: 10,
                          borderRadius: UI.radiusSm,
                          border: UI.border,
                          background: UI.bgAlt,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {a?.name || "Unnamed file"}
                          </div>
                          <div style={{ fontSize: 12, color: UI.muted }}>
                            {a?.contentType || "file"}{" "}
                            {a?.size ? `• ${(a.size / 1024).toFixed(1)} KB` : ""}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          {a?.url && (
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                ...btnGhost,
                                padding: "6px 10px",
                                textDecoration: "none",
                              }}
                            >
                              Open
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            style={{ ...btnDanger, padding: "6px 10px" }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label style={field.label}>Attach files (PDF/XLS/XLSX/CSV)</label>
              <input
                type="file"
                multiple
                accept=".pdf,.xls,.xlsx,.csv"
                onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                style={{ ...field.input, height: "auto", padding: 10 }}
              />

              {pdfProgress > 0 && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  Uploading: {pdfProgress}%
                </div>
              )}
              {newFiles?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                  {newFiles.length} file{newFiles.length > 1 ? "s" : ""} selected — they’ll upload on Update.
                </div>
              )}

              <div style={{ marginTop: 14 }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={subCard}>
                  <label style={field.label}>Call Time</label>

                  {selectedDates.length > 1 ? (
                    <div
                      style={{
                        borderRadius: UI.radiusSm,
                        padding: 10,
                        background: "#fff",
                        maxHeight: 260,
                        overflow: "auto",
                      }}
                    >
                      {selectedDates.map((d) => {
                        const pretty = new Date(d).toDateString();
                        const value = callTimesByDate[d] || "";
                        return (
                          <div
                            key={d}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 8,
                            }}
                          >
                            <span style={{ minWidth: 120, fontSize: 13, fontWeight: 600 }}>
                              {pretty}
                            </span>
                            <select
                              value={value}
                              onChange={(e) =>
                                setCallTimesByDate((prev) => ({
                                  ...prev,
                                  [d]: e.target.value,
                                }))
                              }
                              style={field.input}
                            >
                              <option value="">-- Select time --</option>
                              {TIME_OPTIONS.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <select value={callTime} onChange={(e) => setCallTime(e.target.value)} style={field.input}>
                      <option value="">-- Select time --</option>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div style={subCard}>
                  <label style={field.label}>Rigging Address</label>
                  <div style={field.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={hasRiggingAddress}
                      onChange={(e) => setHasRiggingAddress(e.target.checked)}
                    />
                    Add Rigging Address
                  </div>
                  {hasRiggingAddress && (
                    <textarea
                      value={riggingAddress}
                      onChange={(e) => setRiggingAddress(e.target.value)}
                      rows={4}
                      style={{ ...field.textarea, background: "#fff" }}
                      placeholder="Enter rigging address..."
                    />
                  )}
                </div>
              </div>

              <div style={{ marginTop: 14 }} />
              <div style={subCard}>
                <label style={field.label}>Additional Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  style={{ ...field.textarea, background: "#fff" }}
                  placeholder="Anything extra to include for this booking..."
                />
              </div>

              <div style={divider} />


              {/*  HOTEL feature restored */}
              <label style={field.checkboxRow}>
                <input
                  type="checkbox"
                  checked={hasHotel}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setHasHotel(on);
                    if (!on) {
                      setHotelPaidBy("");
                      setHotelNights("");
                      setHotelPricePerNight("");
                    }
                  }}
                />
                Hotel Booked
              </label>

              {hasHotel && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: UI.radiusSm,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 10,
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <label style={field.label}>Paid by</label>
                      <select
                        value={hotelPaidBy}
                        onChange={(e) => setHotelPaidBy(e.target.value)}
                        style={field.input}
                      >
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

                  <div style={{ marginTop: 8, fontSize: 12, color: UI.muted }}>
                    Total: <b>{hotelTotal ? `£${hotelTotal.toFixed(2)}` : "—"}</b>
                  </div>
                </div>
              )}

              <div style={actionsRow}>
                <button
                  type="submit"
                  disabled={!coreFilled || saving}
                  title={saveTooltip}
                  style={{
                    ...btnPrimary,
                    opacity: coreFilled && !saving ? 1 : 0.5,
                    cursor: coreFilled && !saving ? "pointer" : "not-allowed",
                  }}
                >
                  {saving ? "Updating…" : "Update Booking"}
                </button>

                <button type="button" onClick={() => router.push("/dashboard")} style={btnGhost}>
                  Cancel
                </button>
              </div>
            </div>

            {/* Summary */}
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={summaryCard}>
                <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>
                   Summary
                </h3>

                <div style={summaryRow}>
                  <div>Job Number</div>
                  <div>{jobNumber || "—"}</div>
                </div>
                <div style={summaryRow}>
                  <div>Status</div>
                  <div>{status || "—"}</div>
                </div>
                <div style={summaryRow}>
                  <div>Shoot Type</div>
                  <div>{shootType || "—"}</div>
                </div>
                <div style={summaryRow}>
                  <div>Client</div>
                  <div>{client || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>Contacts</div>
                  <div>
                    {additionalContacts.length
                      ? additionalContacts
                          .map((c) => {
                            const dept =
                              c.department === "Other" && c.departmentOther
                                ? c.departmentOther
                                : c.department;
                            return [c.name || c.email || "Unnamed", dept ? `(${dept})` : ""]
                              .filter(Boolean)
                              .join(" ");
                          })
                          .join(", ")
                      : "—"}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Location</div>
                  <div>{location || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>Dates</div>
                  <div>
                    {useCustomDates
                      ? customDates.length
                        ? customDates.join(", ")
                        : "—"
                      : isRange
                      ? `${startDate || "—"} → ${endDate || "—"}`
                      : startDate || "—"}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Drivers</div>
                  <div>
                    {employees
                      .filter((e) => e.role === "Precision Driver")
                      .map((e) => e.name)
                      .join(", ") || "—"}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Freelancers</div>
                  <div>
                    {employees
                      .filter((e) => e.role === "Freelancer")
                      .map((e) => e.name)
                      .join(", ") || "—"}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Crewing</div>
                  <div>
                    {`Manual • ${isCrewed ? "Crewed Yes" : "Not crewed"} • Allocated ${allocatedCrewCount} / Required ${Number(requiredCrewCount) || 0}`}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Vehicles</div>
                  <div>
                    {Object.values(vehicleGroups)
                      .flat()
                      .filter((v) => vehicles.includes(v.id))
                      .map((v) => {
                        const vs = vehicleStatus[v.id] || status;
                        const label = v.registration
                          ? `${v.name} – ${v.registration}`
                          : v.name;
                        return (
                          <span
                            key={v.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: 999,
                              padding: "2px 8px",
                              marginRight: 6,
                              marginBottom: 6,
                            }}
                          >
                            {label} • {vs}
                          </span>
                        );
                      })}
                    {vehicles.length === 0 && "—"}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Equipment</div>
                  <div>{equipment.join(", ") || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>Hotel / CT</div>
                  <div>
                    {hasHotel
                      ? `Hotel Yes • Paid by: ${hotelPaidBy || "—"} • Nights: ${hotelNights || "—"} • £/night: ${
                          hotelPricePerNight ? `£${Number(hotelPricePerNight).toFixed(2)}` : "—"
                        } • Total: ${hotelTotal ? `£${hotelTotal.toFixed(2)}` : "—"}`
                      : "Hotel No"}
                    {" • "}
                    {selectedDates.length > 1
                      ? selectedDates
                          .map((d) => `${d}: ${callTimesByDate[d] || "—"}`)
                          .join(" | ")
                      : callTime || "—"}
                  </div>
                </div>

                {hasRiggingAddress && (
                  <div style={summaryRow}>
                    <div>Rigging Address</div>
                    <div>{riggingAddress || "—"}</div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
