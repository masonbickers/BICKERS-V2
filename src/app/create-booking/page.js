"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db, auth, storage as storageInstance } from "../../../firebaseConfig";
import { collection, addDoc, getDocs, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import DatePicker from "react-multi-date-picker";

/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens + shared styles
──────────────────────────────────────────────────────────────────────────── */
const UI = {
  radius: 10,
  radiusSm: 8,
  radiusXs: 6,
  shadow: "0 6px 18px rgba(0,0,0,0.08)",
  border: "1px solid #e5e7eb",
  bg: "#ffffff",
  bgAlt: "#f8fafc",
  text: "#111827",
  muted: "#6b7280",
};

const pageWrap = {
  display: "flex",
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: "#f1f5f9",
};

const mainWrap = {
  flex: 1,
  color: UI.text,
  maxWidth: 1600,
  margin: "0 auto",
  padding: "20px 24px",
};

const h1Style = {
  color: UI.text,
  marginBottom: 12,
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: 0.2,
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
  gap: 16,
  marginTop: 8,
};

const card = {
  background: UI.bg,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadow,
  padding: 16,
};
const cardTitle = { margin: "0 0 10px", fontSize: 15, fontWeight: 700 };

const field = {
  label: {
    display: "block",
    fontWeight: 600,
    marginBottom: 6,
    color: UI.text,
  },
  input: {
    width: "100%",
    height: 38,
    padding: "8px 10px",
    fontSize: 14,
    borderRadius: UI.radiusXs,
    border: "1px solid #d1d5db",
    background: "#fff",
  },
  textarea: {
    width: "100%",
    minHeight: 80,
    padding: "10px 12px",
    fontSize: 14,
    borderRadius: UI.radiusXs,
    border: "1px solid #d1d5db",
    background: "#fff",
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
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  background: UI.bgAlt,
  cursor: "pointer",
  fontWeight: 700,
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 8px",
  fontSize: 12,
  borderRadius: 999,
  background: "#e5e7eb",
  border: "1px solid #d1d5db",
};

const divider = { height: 1, background: "#e5e7eb", margin: "12px 0" };

const actionsRow = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 14,
};

const btn = {
  padding: "9px 13px",
  borderRadius: UI.radiusXs,
  border: "1px solid #111",
  cursor: "pointer",
  fontWeight: 700,
};
const btnPrimary = { ...btn, background: "#111", color: "#fff" };
const btnGhost = { ...btn, background: "#fff", color: "#111" };

const summaryCard = {
  ...card,
  position: "sticky",
  top: 12,
  alignSelf: "start",
  background: "#0b1220",
  color: "#e6edf7",
  border: "1px solid rgba(255,255,255,0.08)",
};

const summaryRow = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 10,
  padding: "6px 0",
  borderBottom: "1px dashed rgba(255,255,255,0.08)",
};

/* ────────────────────────────────────────────────────────────────────────────
   Status + blocking
──────────────────────────────────────────────────────────────────────────── */
const VEHICLE_STATUSES = [
  "Confirmed",
  "First Pencil",
  "Second Pencil",
  "Enquiry",
  "Maintenance",
  "DNH",
  "Lost",
  "Postponed",
  "Cancelled",
  "Complete",
];

const BLOCKING_STATUSES = ["Confirmed", "First Pencil", "Second Pencil"];
const doesBlockBooking = (b) => BLOCKING_STATUSES.includes((b.status || "").trim());
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

const expandBookingDates = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) return b.bookingDates;
  const one = (b.date || "").slice(0, 10);
  const s = (b.startDate || "").slice(0, 10);
  const e = (b.endDate || "").slice(0, 10);
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
      else if (reg && byReg[String(reg).toUpperCase()]) match = byReg[String(reg).toUpperCase()];
      else if (nm && byName[String(nm).toLowerCase()]) match = byName[String(nm).toLowerCase()];
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
   Create Booking Page
──────────────────────────────────────────────────────────────────────────── */
export default function CreateBookingPage() {
  const router = useRouter();

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
  const [hasRiggingAddress, setHasRiggingAddress] = useState(false);
  const [riggingAddress, setRiggingAddress] = useState("");

  // Flags
  const [isSecondPencil, setIsSecondPencil] = useState(false);
  const [isCrewed, setIsCrewed] = useState(false);
  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);

  // Employees
  const [employees, setEmployees] = useState([]); // [{role,name}]
  const [employeesByDate, setEmployeesByDate] = useState({});
  const [customEmployee, setCustomEmployee] = useState("");

  // Vehicles
  const [vehicles, setVehicles] = useState([]); // vehicleIds
  const [vehicleStatus, setVehicleStatus] = useState({}); // {vehicleId: status}

  // Equipment
  const [equipment, setEquipment] = useState([]);

  // Data lists
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);

  const [employeeList, setEmployeeList] = useState([]); // [{id,name}]
  const [freelancerList, setFreelancerList] = useState([]); // [{id,name}]

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
  const [vehicleLookup, setVehicleLookup] = useState({ byId: {}, byReg: {}, byName: {} });

  // Maintenance bookings
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);

  // Employee code map
  const [nameToCode, setNameToCode] = useState({});

  // Contacts block (only)
  const [additionalContacts, setAdditionalContacts] = useState([]);
  const [savedContacts, setSavedContacts] = useState([]);
  const [selectedSavedContactId, setSelectedSavedContactId] = useState("");

  // Files
  const [attachments, setAttachments] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [pdfProgress, setPdfProgress] = useState(0);

  const isMaintenance = status === "Maintenance";

  // Derived dates
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
     Load all data
  ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const loadData = async () => {
      const [bookingSnap, holidaySnap, empSnap, vehicleSnap, equipSnap, workSnap, contactsSnap] =
        await Promise.all([
          getDocs(collection(db, "bookings")),
          getDocs(collection(db, "holidays")),
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "equipment")),
          getDocs(collection(db, "workBookings")),
          getDocs(collection(db, "contacts")),
        ]);

      const bookings = bookingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllBookings(bookings);

      const jobNumbers = bookings
        .map((b) => b.jobNumber)
        .filter((jn) => /^\d+$/.test(jn))
        .map((jn) => parseInt(jn, 10));
      const max = jobNumbers.length ? Math.max(...jobNumbers) : 0;
      setJobNumber(String(max + 1).padStart(4, "0"));

      setHolidayBookings(holidaySnap.docs.map((d) => d.data()));

      const allEmployees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setEmployeeList(
        allEmployees
          .filter((emp) => {
            const titles = Array.isArray(emp.jobTitle) ? emp.jobTitle : [emp.jobTitle];
            return titles.some((t) => (t || "").toLowerCase() === "driver");
          })
          .map((emp) => ({ id: emp.id, name: emp.name || emp.fullName || emp.id }))
      );

      setFreelancerList(
        allEmployees
          .filter((emp) => {
            const titles = Array.isArray(emp.jobTitle) ? emp.jobTitle : [emp.jobTitle];
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
        else if (category.includes("electric")) grouped["Electric Tracking Vehicles"].push(info);
        else if (category.includes("small")) grouped["Small Tracking Vehicles"].push(info);
        else if (category.includes("large")) grouped["Large Tracking Vehicles"].push(info);
        else if (category.includes("low loader")) grouped["Low Loaders"].push(info);
        else if (category.includes("lorry")) grouped["Transport Lorry"].push(info);
        else if (category.includes("van")) grouped["Transport Van"].push(info);
        else grouped["Other Vehicles"].push(info);
      });

      setVehicleGroups(grouped);
      setVehicleLookup({ byId, byReg, byName });

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

      setMaintenanceBookings(workSnap.docs.map((d) => d.data()));

      setSavedContacts(contactsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };

    loadData();
  }, []);

  /* ────────────────────────────────────────────────────────────
     Conflicts
  ───────────────────────────────────────────────────────────── */
  const overlapping = useMemo(() => {
    if (!selectedDates.length) return [];
    return allBookings.filter((b) => anyDateOverlap(expandBookingDates(b), selectedDates));
  }, [allBookings, selectedDates]);

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

  const maintenanceVehicleIdSet = useMemo(() => {
    const ids = [];

    maintenanceBookings.forEach((b) => {
      const start = toJsDate(b.startDate || b.date || b.start) || toJsDate(b.date);
      const end = toJsDate(b.endDate || b.end || b.endDate) || start || toJsDate(b.date);
      if (!start || !end) return;

      const overlaps = selectedDates.some((dateStr) => {
        const d = new Date(dateStr + "T00:00:00");
        return d >= start && d <= end;
      });
      if (!overlaps) return;

      if (Array.isArray(b.vehicles) && b.vehicles.length) {
        b.vehicles.forEach((v) => {
          const resolved = normalizeVehicleKeysListForLookup([v], vehicleLookup);
          resolved.forEach((id) => ids.push(id));
        });
      } else {
        const candidate = b.vehicleId || b.vehicle || b.vehicleName || b.registration || b.reg;
        const resolved = normalizeVehicleKeysListForLookup([candidate], vehicleLookup);
        resolved.forEach((id) => ids.push(id));
      }
    });

    return new Set(ids);
  }, [maintenanceBookings, selectedDates, vehicleLookup]);

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

    if (newFiles.length > 0) {
      const uploaded = [];
      for (const file of newFiles) {
        const safeName = `${jobNumber || "nojob"}_${file.name}`.replace(/\s+/g, "_");
        const folder = file.name.toLowerCase().endsWith(".pdf") ? "booking_pdfs" : "quotes";
        const storageRef = ref(storageInstance, `${folder}/${safeName}`);

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
      isCrewed,
      hasHS,
      hasRiskAssessment,
      notes,

      notesByDate: filteredNotesByDate,
      status,
      bookingDates,
      shootType,

      attachments: nextAttachments,
      quoteUrl: firstUrl || null,
      pdfURL: firstUrl || null,

      hasHotel,
      callTime: (!isRange && !useCustomDates ? callTime || "" : ""),
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
      lastEditedBy: user?.email || "Unknown",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        {
          action: "Created",
          user: user?.email || "Unknown",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      await addDoc(collection(db, "bookings"), payload);

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
      alert("Booking Saved ✅");
      router.push("/dashboard?saved=true");
    } catch (err) {
      console.error("❌ Error saving booking:", err);
      alert("Failed to save booking ❌\n\n" + err.message);
    }
  };

  const isEmployeeBooked = (name) => bookedEmployeeNames.includes(name);
  const isEmployeeHeld = (name) => heldEmployeeNames.includes(name);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={mainWrap}>
          <h1 style={h1Style}>➕ Create New Booking</h1>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div style={sectionGrid}>
              {/* Column 1: Job Info */}
              <div style={card}>
                <h3 style={cardTitle}>Job Info</h3>

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
                <textarea value={client} onChange={(e) => setClient(e.target.value)} style={field.textarea} required={!isMaintenance} />

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

                  {additionalContacts.length === 0 && (
                    <p style={{ fontSize: 12, color: UI.muted, marginBottom: 6 }}>
                      Add production contacts (e.g. Production, Locations, AD, line producer, stunts).
                    </p>
                  )}

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
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={{ ...field.label, fontWeight: 500, marginBottom: 4 }}>Department</label>
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
                          <label style={{ ...field.label, fontWeight: 500, marginBottom: 4 }}>Name</label>
                          <input type="text" value={row.name} onChange={(e) => handleUpdateContactRow(idx, "name", e.target.value)} style={field.input} placeholder="Contact name" />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ ...field.label, fontWeight: 500, marginBottom: 4 }}>Email</label>
                          <input type="email" value={row.email} onChange={(e) => handleUpdateContactRow(idx, "email", e.target.value)} style={field.input} placeholder="Email" />
                        </div>
                        <div>
                          <label style={{ ...field.label, fontWeight: 500, marginBottom: 4 }}>Number</label>
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

                  {savedContacts.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <label style={{ ...field.label, fontWeight: 500, marginBottom: 4 }}>Quick add from saved contacts</label>
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
                        <option value="">Select saved contact</option>
                        {savedContacts.map((c) => {
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
                <textarea value={location} onChange={(e) => setLocation(e.target.value)} style={field.textarea} required />
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
                  <div style={{ display: "grid", gridTemplateColumns: isRange ? "1fr 1fr" : "1fr", gap: 12 }}>
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

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
                      {selectedDates.map((date) => {
                        const selectedNote = notesByDate[date] || "";
                        const isOther = selectedNote === "Other";
                        const customOtherValue = notesByDate[`${date}-other`] || "";
                        return (
                          <div key={date} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10, background: UI.bgAlt }}>
                            <div style={{ fontWeight: 700, marginBottom: 8 }}>{new Date(date).toDateString()}</div>

                            <select
                              value={selectedNote}
                              onChange={(e) => setNotesByDate({ ...notesByDate, [date]: e.target.value })}
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

                <h4 style={{ margin: "8px 0" }}>Precision Driver</h4>
                {driverOptions.map((name) => {
                  const isSelected = employees.some((e) => e.name === name && e.role === "Precision Driver");
                  const isBooked = isEmployeeBooked(name);
                  const isHeld = isEmployeeHeld(name);
                  const isHoliday = isEmployeeOnHolidayForDates(name, selectedDates);
                  const disabled = (isBooked || isHoliday || isCrewed) && !isSelected;

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
                        {name} {isBooked && "(Booked)"} {!isBooked && isHeld && "(Held)"} {isHoliday && "(On Holiday)"}
                      </span>
                    </label>
                  );
                })}

                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <label style={{ fontWeight: 700 }}>
                    <input type="checkbox" checked={isCrewed} onChange={(e) => setIsCrewed(e.target.checked)} /> Booking Crewed
                  </label>
                </div>

                <h4 style={{ margin: "8px 0" }}>Freelancers</h4>
                {freelancerOptions.map((name) => {
                  const isSelected = employees.some((e) => e.name === name && e.role === "Freelancer");
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
                        {name} {isBooked && "(Booked)"} {isHoliday && "(On Holiday)"}
                      </span>
                    </label>
                  );
                })}

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
              <div style={card}>
                <h3 style={cardTitle}>Vehicles</h3>

                {Object.entries(vehicleGroups).map(([group, items]) => {
                  const isOpen = openGroups[group] || false;

                  return (
                    <div key={group} style={{ marginTop: 10 }}>
                      <button type="button" onClick={() => setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))} style={accordionBtn}>
                        <span>{isOpen ? "▼" : "►"} {group}</span>
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

                            const isMaintBlocked = maintenanceVehicleIdSet.has(key);
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
                                      ? "Vehicle is on maintenance (work booking) during selected date(s)"
                                      : `Vehicle is already ${blockedStatus || "booked"} on overlapping date(s)`
                                    : ""
                                }
                              >
                                <input type="checkbox" checked={isSelected} disabled={disabled} onChange={(e) => toggleVehicle(key, e.target.checked)} />
                                <span style={{ flex: 1, color: disabled ? "#6e6f70ff" : UI.text }}>
                                  {vehicle.name}
                                  {vehicle.registration ? ` – ${vehicle.registration}` : ""}
                                  {isMaintBlocked && !isBooked && " (Maintenance)"}
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

                <div style={divider} />

                <h3 style={cardTitle}>Equipment</h3>

                {Object.entries(equipmentGroups).map(([group, items]) => {
                  const isOpen = openEquipGroups[group] || false;

                  return (
                    <div key={group} style={{ marginTop: 10 }}>
                      <button type="button" onClick={() => setOpenEquipGroups((prev) => ({ ...prev, [group]: !prev[group] }))} style={accordionBtn}>
                        <span>{isOpen ? "▼" : "►"} {group}</span>
                        <span style={pill}>{items.length}</span>
                      </button>

                      {isOpen && (
                        <div style={{ padding: "10px 6px" }}>
                          {items.map((rawName) => {
                            const name = String(rawName || "").trim();
                            const isBooked = bookedEquipment.includes(name);
                            const isHeld = heldEquipment.includes(name);
                            const isSelected = equipment.includes(name);
                            const disabled = isBooked && !isSelected;

                            return (
                              <label key={name} style={{ display: "block", marginBottom: 6 }}>
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
                                  {isBooked && " (Booked)"} {!isBooked && isHeld && " (Held)"}
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
            </div>

            {/* Files & Notes */}
            <div style={{ ...card, marginTop: 18 }}>
              <h3 style={cardTitle}>Files & Notes</h3>

              <label style={field.label}>Attach files (PDF/XLS/XLSX/CSV)</label>
              <input
                type="file"
                multiple
                accept=".pdf,.xls,.xlsx,.csv"
                onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                style={{ ...field.input, height: "auto", padding: 10 }}
              />

              {pdfProgress > 0 && <div style={{ marginTop: 8, fontSize: 12 }}>Uploading: {pdfProgress}%</div>}
              {newFiles?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                  {newFiles.length} file{newFiles.length > 1 ? "s" : ""} selected — they’ll upload on Save.
                </div>
              )}

              <div style={{ marginTop: 14 }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={field.label}>Call Time</label>

                  {selectedDates.length > 1 ? (
                    <div style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10, background: UI.bgAlt, maxHeight: 260, overflow: "auto" }}>
                      {selectedDates.map((d) => {
                        const pretty = new Date(d).toDateString();
                        const value = callTimesByDate[d] || "";
                        return (
                          <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ minWidth: 120, fontSize: 13, fontWeight: 600 }}>{pretty}</span>
                            <select value={value} onChange={(e) => setCallTimesByDate((prev) => ({ ...prev, [d]: e.target.value }))} style={field.input}>
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

                <div>
                  <label style={field.label}>Rigging Address</label>
                  <div style={field.checkboxRow}>
                    <input type="checkbox" checked={hasRiggingAddress} onChange={(e) => setHasRiggingAddress(e.target.checked)} />
                    Add Rigging Address
                  </div>
                  {hasRiggingAddress && <textarea value={riggingAddress} onChange={(e) => setRiggingAddress(e.target.value)} rows={3} style={field.textarea} placeholder="Enter rigging address..." />}
                </div>
              </div>

              <div style={{ marginTop: 14 }} />
              <label style={field.label}>Additional Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} style={field.textarea} placeholder="Anything extra to include for this booking..." />

              <div style={divider} />

              <label style={field.checkboxRow}>
                <input type="checkbox" checked={hasHS} onChange={(e) => setHasHS(e.target.checked)} />
                Health & Safety Completed
              </label>

              <label style={field.checkboxRow}>
                <input type="checkbox" checked={hasRiskAssessment} onChange={(e) => setHasRiskAssessment(e.target.checked)} />
                Risk Assessment Completed
              </label>

              <label style={field.checkboxRow}>
                <input type="checkbox" checked={hasHotel} onChange={(e) => setHasHotel(e.target.checked)} />
                Hotel Booked
              </label>

              <div style={actionsRow}>
                <button
                  type="submit"
                  disabled={!coreFilled}
                  title={saveTooltip}
                  style={{ ...btnPrimary, opacity: coreFilled ? 1 : 0.5, cursor: coreFilled ? "pointer" : "not-allowed" }}
                >
                  Save Booking
                </button>

                <button type="button" onClick={() => router.push("/dashboard")} style={btnGhost}>
                  Cancel
                </button>
              </div>
            </div>

            {/* Summary */}
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={summaryCard}>
                <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>📋 Summary</h3>

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
                            const dept = c.department === "Other" && c.departmentOther ? c.departmentOther : c.department;
                            return [c.name || c.email || "Unnamed", dept ? `(${dept})` : ""].filter(Boolean).join(" ");
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
                    {useCustomDates ? (customDates.length ? customDates.join(", ") : "—") : isRange ? `${startDate || "—"} → ${endDate || "—"}` : startDate || "—"}
                  </div>
                </div>

                <div style={summaryRow}>
                  <div>Drivers</div>
                  <div>{employees.filter((e) => e.role === "Precision Driver").map((e) => e.name).join(", ") || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>Freelancers</div>
                  <div>{employees.filter((e) => e.role === "Freelancer").map((e) => e.name).join(", ") || "—"}</div>
                </div>

                <div style={summaryRow}>
                  <div>Vehicles</div>
                  <div>
                    {Object.values(vehicleGroups)
                      .flat()
                      .filter((v) => vehicles.includes(v.id))
                      .map((v) => {
                        const vs = vehicleStatus[v.id] || status;
                        const label = v.registration ? `${v.name} – ${v.registration}` : v.name;
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
                    {hasHotel ? "Hotel ✓" : "Hotel ✗"}
                    {" • "}
                    {selectedDates.length > 1
                      ? selectedDates.map((d) => `${d}: ${callTimesByDate[d] || "—"}`).join(" | ")
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
