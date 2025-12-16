"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { db, auth } from "../../../../firebaseConfig";
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  addDoc,
} from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import DatePicker from "react-multi-date-picker";

// ── Per-item status helpers ────────────────────────────────────────────────
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

const doesBlockStatus = (s = "") =>
  ["Confirmed", "First Pencil", "Second Pencil"].includes(s.trim());

// --- Normalisers ---
const normalizeVehicleList = (list) =>
  (Array.isArray(list) ? list : [])
    .map((v) => (typeof v === "string" ? v : v?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);

const normalizeEmployeeNames = (list) =>
  (Array.isArray(list) ? list : [])
    .map((e) => (typeof e === "string" ? e : e?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);

const normalizeEquipmentList = (list) =>
  (Array.isArray(list) ? list : [])
    .map((x) => (typeof x === "string" ? x : x?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);

// Put this near the top of the file
const storagePathFromDownloadUrl = (url = "") => {
  try {
    // download URLs look like .../o/<ENCODED_PATH>?alt=media&token=...
    return decodeURIComponent(url.split("/o/")[1].split("?")[0]);
  } catch {
    return null;
  }
};

/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens + shared styles (layout-only; no logic changed)
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

// page/container sizing
const pageWrap = {
  display: "flex",
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  background: "#f1f5f9",
};

// ✅ keep the content inside the layout’s “page section”
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

// grid layout
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
const divider = {
  height: 1,
  background: "#e5e7eb",
  margin: "12px 0",
};
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

// summary card
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
   Time helpers
──────────────────────────────────────────────────────────────────────────── */
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

const buildTravelDurationOptions = () => {
  const out = [];
  for (let mins = 15; mins <= 360; mins += 15) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push({
      value: String(mins),
      label: h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`,
    });
  }
  return out;
};
const TRAVEL_DURATION_OPTIONS = buildTravelDurationOptions();

const labelFromMins = (mins) => {
  const n = Number(mins) || 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!n) return "—";
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

// --- UTC Y-M-D helpers (match Create) ---
const parseYMD_UTC = (ymd) => {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};
const formatYMD_UTC = (dt) => dt.toISOString().slice(0, 10);
const addDaysUTC = (dt, n) => {
  const c = new Date(dt.getTime());
  c.setUTCDate(c.getUTCDate() + n);
  return c;
};
const enumerateDaysYMD_UTC = (startYMD, endYMD) => {
  if (!startYMD || !endYMD) return [];
  let cur = parseYMD_UTC(startYMD),
    end = parseYMD_UTC(endYMD),
    out = [];
  while (cur <= end) {
    out.push(formatYMD_UTC(cur));
    cur = addDaysUTC(cur, 1);
  }
  return out;
};

/* ────────────────────────────────────────────────────────────────────────────
   Blocking helpers
──────────────────────────────────────────────────────────────────────────── */
const BLOCKING_STATUSES = ["Confirmed", "First Pencil", "Second Pencil"];
const doesBlock = (b) => BLOCKING_STATUSES.includes((b.status || "").trim());

// NEW: vehicle-specific blocking logic – also treat Maintenance as hard block
const isVehicleBlockingStatus = (status) => {
  const s = (status || "").trim();
  return BLOCKING_STATUSES.includes(s) || s === "Maintenance";
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
  if (!datesA.length || !datesB.length) return false;
  const setA = new Set(datesA);
  return datesB.some((d) => setA.has(d));
};

/* ────────────────────────────────────────────────────────────────────────────
   Vehicle key normaliser (robust to renames)
   Uses lookup maps: id / registration / name
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

      if (id && byId[id]) {
        match = byId[id];
      } else if (reg && byReg[String(reg).toUpperCase()]) {
        match = byReg[String(reg).toUpperCase()];
      } else if (nm && byName[String(nm).toLowerCase()]) {
        match = byName[String(nm).toLowerCase()];
      }
    } else {
      const s = String(raw || "").trim();
      if (!s) return;
      if (byId[s]) {
        match = byId[s];
      } else if (byReg[s.toUpperCase()]) {
        match = byReg[s.toUpperCase()];
      } else if (byName[s.toLowerCase()]) {
        match = byName[s.toLowerCase()];
      }
    }

    if (match && match.id) {
      out.push(match.id);
    }
  });

  return Array.from(new Set(out));
};

export default function CreateBookingPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.id;

  // state
  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);
  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employees, setEmployees] = useState([]);
  const [employeesByDate, setEmployeesByDate] = useState({}); // NEW
  const [customEmployee, setCustomEmployee] = useState("");
  const [vehicles, setVehicles] = useState([]); // now stores canonical keys (vehicle IDs)
  const [equipment, setEquipment] = useState([]);
  const [vehicleStatus, setVehicleStatus] = useState({}); // key = vehicleId
  const [isSecondPencil, setIsSecondPencil] = useState(false);
  const [isCrewed, setIsCrewed] = useState(false);
  const [notes, setNotes] = useState("");
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [status, setStatus] = useState("Confirmed");
  const [shootType, setShootType] = useState("Day");
  const [notesByDate, setNotesByDate] = useState({});
  const [freelancerList, setFreelancerList] = useState([]);
  const [employeeList, setEmployeeList] = useState([]);
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
    "Small Tracking Vehicles": false,
    "Large Tracking Vehicles": false,
    "Low Loaders": false,
    "Transport Lorry": false,
    "Transport Van": false,
    "Other Vehicles": false,
    Bike: false,
    "Electric Tracking Vehicles": false,
  });

  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [openEquipGroups, setOpenEquipGroups] = useState({});
  const [allEquipmentNames, setAllEquipmentNames] = useState([]);
  const [pdfURL, setPdfURL] = useState(null);
  const [removePdf, setRemovePdf] = useState(false); // mark for deletion
  const [pdfProgress, setPdfProgress] = useState(0); // upload progress (0..100)
  const [deletingFile, setDeletingFile] = useState(false);

  // Multi-file state
  const [attachments, setAttachments] = useState([]); // [{url,name,contentType,size,folder}]
  const [newFiles, setNewFiles] = useState([]); // File[] selected to upload
  const [deletedUrls, setDeletedUrls] = useState(new Set()); // URLs marked for deletion

  const [useCustomDates, setUseCustomDates] = useState(false);
  const [customDates, setCustomDates] = useState([]);

  /* name → userCode map (for saving employeeCodes) */
  const [nameToCode, setNameToCode] = useState({});

  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [statusReasons, setStatusReasons] = useState([]);
  const [statusReasonOther, setStatusReasonOther] = useState("");

  const [hasHotel, setHasHotel] = useState(false);
  const [callTime, setCallTime] = useState("");
  const [callTimesByDate, setCallTimesByDate] = useState({}); // NEW: per-day call times
  const [hasRiggingAddress, setHasRiggingAddress] = useState(false);
  const [riggingAddress, setRiggingAddress] = useState("");

  // NEW: keep the full vehicles list + lookup maps so we can resolve legacy names
  const [allVehicles, setAllVehicles] = useState([]);
  const [vehicleLookup, setVehicleLookup] = useState({
    byId: {},
    byReg: {},
    byName: {},
  });

  // Derived list of selected dates (range, single, or custom)
  const selectedDates = (() => {
    if (useCustomDates) return customDates;
    if (!startDate) return [];
    if (isRange && endDate) return enumerateDaysYMD_UTC(startDate, endDate);
    return [startDate];
  })();

  // Conflicts using per-day date sets (exclude self)
  const overlapping = allBookings.filter(
    (b) =>
      (!bookingId || b.id !== bookingId) &&
      selectedDates.length &&
      anyDateOverlap(expandBookingDates(b), selectedDates)
  );

  // ────────────────────────────────────────────────────────────
  // Vehicles: respect vehicleStatus map; fallback to booking.status
  // NOW: treat Maintenance status as a hard block as well
  //     and store the actual blocking status per vehicle
  // ────────────────────────────────────────────────────────────
  const vehicleBlockingStatusById = {};
  const bookedVehicles = [];
  const heldVehicles = [];

  overlapping.forEach((b) => {
    const keys = normalizeVehicleKeysListForLookup(b.vehicles || [], vehicleLookup);
    const vmap = b.vehicleStatus || {};

    keys.forEach((key) => {
      const itemStatus = (vmap[key] ?? b.status) || "";
      if (!itemStatus) return;

      if (isVehicleBlockingStatus(itemStatus)) {
        // only set first seen blocking status for this vehicle
        if (!vehicleBlockingStatusById[key]) {
          vehicleBlockingStatusById[key] = itemStatus;
          bookedVehicles.push(key);
        }
      } else {
        // held = any non-blocking status
        if (!heldVehicles.includes(key)) {
          heldVehicles.push(key);
        }
      }
    });
  });

  // Employees: per-day aware (uses employeesByDate when present)
  const getEmployeesForDates = (booking, dates) => {
    const out = [];
    if (!dates.length) return out;
    const map = booking.employeesByDate || {};
    const fallbackList = booking.employees || [];
    dates.forEach((d) => {
      const listForDate =
        Array.isArray(map[d]) && map[d].length ? map[d] : fallbackList;
      out.push(...normalizeEmployeeNames(listForDate));
    });
    return Array.from(new Set(out));
  };

  const bookedEmployeesSet = new Set();
  const heldEmployeesSet = new Set();

  overlapping.forEach((b) => {
    const namesForOverlap = getEmployeesForDates(b, selectedDates);
    if (!namesForOverlap.length) return;
    if (doesBlock(b)) {
      namesForOverlap.forEach((n) => bookedEmployeesSet.add(n));
    } else {
      namesForOverlap.forEach((n) => heldEmployeesSet.add(n));
    }
  });

  const bookedEmployees = Array.from(bookedEmployeesSet);
  const heldEmployees = Array.from(heldEmployeesSet);

  // Equipment mirrors vehicles (still using booking-level blocking logic)
  const bookedEquipment = overlapping
    .filter(doesBlock)
    .flatMap((b) => normalizeEquipmentList(b.equipment || []));
  const heldEquipment = overlapping
    .filter((b) => !doesBlock(b))
    .flatMap((b) => normalizeEquipmentList(b.equipment || []));

  // auto-open equipment groups that contain a selected item
  useEffect(() => {
    const next = { ...openEquipGroups };
    Object.entries(equipmentGroups).forEach(([group, items]) => {
      const hasSelected = items?.some((name) => equipment.includes(name));
      if (hasSelected) next[group] = true;
    });
    setOpenEquipGroups(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentGroups, equipment]);

  // load data
  useEffect(() => {
    const loadData = async () => {
      const [bookingSnap, holidaySnap, empSnap, vehicleSnap, equipSnap] =
        await Promise.all([
          getDocs(collection(db, "bookings")),
          getDocs(collection(db, "holidays")),
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "equipment")),
        ]);

      const bookings = bookingSnap.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));
      setAllBookings(bookings);
      setHolidayBookings(holidaySnap.docs.map((docu) => docu.data()));

      const allEmployees = empSnap.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));
      setEmployeeList(
        allEmployees
          .filter((emp) =>
            Array.isArray(emp.jobTitle)
              ? emp.jobTitle.some((j) => j?.toLowerCase() === "driver")
              : (emp.jobTitle || "").toLowerCase() === "driver"
          )
          .map((emp) => ({
            id: emp.id,
            name: emp.name || emp.fullName || emp.id,
            jobTitle: emp.jobTitle,
          }))
      );
      setFreelancerList(
        allEmployees
          .filter((emp) => {
            const titles = Array.isArray(emp.jobTitle)
              ? emp.jobTitle.map((j) => (j || "").toLowerCase())
              : [(emp.jobTitle || "").toLowerCase()];
            return titles.includes("freelancer") || titles.includes("freelance");
          })
          .map((emp) => ({
            id: emp.id,
            name: emp.name || emp.fullName || emp.id,
            jobTitle: emp.jobTitle,
          }))
      );

      // build { lowercasedName: userCode } map
      const map = {};
      for (const emp of allEmployees) {
        const nm = String(emp.name || emp.fullName || "")
          .trim()
          .toLowerCase();
        const code = String(emp.userCode || "").trim();
        if (nm && code) map[nm] = code;
      }
      setNameToCode(map);

      // ---- Vehicles: build grouped list + lookup maps (id / reg / name) ----
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

      const vehiclesArr = [];
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
        vehiclesArr.push(info);

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
        else if (category.includes("lorry")) grouped["Transport Lorry"].push(info);
        else if (category.includes("van")) grouped["Transport Van"].push(info);
        else grouped["Other Vehicles"].push(info);
      });

      setVehicleGroups(grouped);
      setAllVehicles(vehiclesArr);
      setVehicleLookup({ byId, byReg, byName });

      // ---- If editing: load the booking and resolve vehicles against lookup ----
      if (bookingId) {
        const ref = doc(db, "bookings", bookingId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const b = snap.data();

          // Derive booking dates for this booking
          const datesForBooking =
            (b.bookingDates && b.bookingDates.length
              ? b.bookingDates
              : expandBookingDates(b)) || [];

          setJobNumber(b.jobNumber || "");
          setClient(b.client || "");
          setContactEmail(b.contactEmail || "");
          setContactNumber(b.contactNumber || "");
          setLocation(b.location || "");
          setIsRange(!!b.startDate && !!b.endDate);
          setStartDate((b.startDate || b.date || "").slice(0, 10));
          setEndDate((b.endDate || "").slice(0, 10));
          setStatusReasons(b.statusReasons || []);
          setStatusReasonOther(b.statusReasonOther || "");

          const loadedEmployees = (b.employees || []).map((e) =>
            typeof e === "string"
              ? { role: "Precision Driver", name: e }
              : e
          );
          setEmployees(loadedEmployees);

          // Resolve vehicles (legacy name / registration / id → canonical id)
          const rawVehicles = Array.isArray(b.vehicles) ? b.vehicles : [];
          const resolvedVehicleKeys = [];

          rawVehicles.forEach((raw) => {
            let match = null;

            if (raw && typeof raw === "object") {
              const id = raw.id || raw.vehicleId;
              const reg = raw.registration;
              const nm = raw.name;

              if (id && byId[id]) {
                match = byId[id];
              } else if (reg && byReg[String(reg).toUpperCase()]) {
                match = byReg[String(reg).toUpperCase()];
              } else if (nm && byName[String(nm).toLowerCase()]) {
                match = byName[String(nm).toLowerCase()];
              }
            } else {
              const s = String(raw || "").trim();
              if (!s) return;
              if (byId[s]) {
                match = byId[s];
              } else if (byReg[s.toUpperCase()]) {
                match = byReg[s.toUpperCase()];
              } else if (byName[s.toLowerCase()]) {
                match = byName[s.toLowerCase()];
              }
            }

            if (match && match.id && !resolvedVehicleKeys.includes(match.id)) {
              resolvedVehicleKeys.push(match.id);
            }
          });

          setVehicles(resolvedVehicleKeys);

          setEquipment(normalizeEquipmentList(b.equipment || []));

          // Remap vehicleStatus keys to canonical ids where possible
          const rawVehicleStatus = b.vehicleStatus || {};
          const remappedStatus = {};
          Object.entries(rawVehicleStatus).forEach(([rawKey, val]) => {
            const s = String(rawKey || "").trim();
            let match = null;
            if (byId[s]) match = byId[s];
            else if (byReg[s.toUpperCase()]) match = byReg[s.toUpperCase()];
            else if (byName[s.toLowerCase()]) match = byName[s.toLowerCase()];

            if (match && match.id) {
              remappedStatus[match.id] = val;
            } else {
              remappedStatus[rawKey] = val;
            }
          });
          setVehicleStatus(remappedStatus);

          setPdfURL(b.quoteUrl || b.pdfURL || null);
          setIsSecondPencil(!!b.isSecondPencil);
          setNotes(b.notes || "");
          setNotesByDate(b.notesByDate || {});
          setStatus(b.status || "Confirmed");
          setShootType(b.shootType || "Day");
          setIsCrewed(!!b.isCrewed);
          setHasHS(!!b.hasHS);
          setHasRiskAssessment(!!b.hasRiskAssessment);
          setHasHotel(!!b.hasHotel);

          // Call time(s)
          setCallTime(b.callTime || "");
          const existingCallTimes = b.callTimesByDate || {};
          if (Object.keys(existingCallTimes).length) {
            setCallTimesByDate(existingCallTimes);
          } else if (b.callTime && datesForBooking.length) {
            const mapCT = {};
            datesForBooking.forEach((d) => {
              if (d) mapCT[d] = b.callTime;
            });
            setCallTimesByDate(mapCT);
          }

          setHasRiggingAddress(!!b.hasRiggingAddress);
          setRiggingAddress(b.riggingAddress || "");

          // build attachments list from array (if present) or fall back to legacy single file
          setAttachments(
            Array.isArray(b.attachments) && b.attachments.length
              ? b.attachments.filter((a) => a?.url)
              : b.quoteUrl || b.pdfURL
              ? [{ url: b.quoteUrl || b.pdfURL, name: "Attachment" }]
              : []
          );

          // Employees by date (new)
          const rawEmployeesByDate = b.employeesByDate || {};
          if (Object.keys(rawEmployeesByDate).length) {
            setEmployeesByDate(rawEmployeesByDate);
          } else {
            const mapByDate = {};
            datesForBooking.forEach((d) => {
              if (!d) return;
              mapByDate[d] = loadedEmployees;
            });
            setEmployeesByDate(mapByDate);
          }
        }
      }

      const groupedEquip = {};
      equipSnap.docs.forEach((docu) => {
        const e = docu.data();
        const cat = (e.category || "Other").trim();
        const nm = e.name?.trim();
        if (!nm) return;
        if (!groupedEquip[cat]) groupedEquip[cat] = [];
        groupedEquip[cat].push(nm);
      });
      setEquipmentGroups(groupedEquip);
      const openEquip = {};
      Object.keys(groupedEquip).forEach((k) => (openEquip[k] = false));
      setOpenEquipGroups(openEquip);
      setAllEquipmentNames(
        Object.values(groupedEquip)
          .flat()
          .map((s) => String(s || "").trim())
      );
    };
    loadData();
  }, [bookingId]);

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

  // toggleVehicle now works with a canonical key (vehicleId)
  const toggleVehicle = (vehicleKey, checked) => {
    setVehicles((prev) =>
      checked ? uniq([...prev, vehicleKey]) : prev.filter((v) => v !== vehicleKey)
    );
    setVehicleStatus((prev) => {
      const next = { ...prev };
      if (checked) {
        if (!next[vehicleKey]) next[vehicleKey] = status; // inherit booking-level status by default
      } else {
        delete next[vehicleKey];
      }
      return next;
    });
  };

  const handleDeleteCurrentFile = async () => {
    if (!pdfURL) return;
    const ok = window.confirm(
      "Delete the current file from Storage and unlink it from this booking?"
    );
    if (!ok) return;

    try {
      setDeletingFile(true);

      const storage = getStorage();
      const path = storagePathFromDownloadUrl(pdfURL);
      if (path) {
        await deleteObject(ref(storage, path));
      }

      setPdfURL(null);
      setRemovePdf(false);
      setPdfProgress(0);

      if (bookingId) {
        await updateDoc(doc(db, "bookings", bookingId), {
          quoteUrl: null,
          pdfURL: null,
          updatedAt: new Date().toISOString(),
        });
      }

      alert("File removed ✅");
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Failed to delete file ❌\n\n" + e.message);
    } finally {
      setDeletingFile(false);
    }
  };

  // Legacy/missing equipment helpers
  const missingEquipment = equipment.filter((n) =>
    allEquipmentNames.includes(String(n || "").trim()) ? false : true
  );

  const removeEquipment = (name) => {
    const key = String(name || "").trim();
    setEquipment((prev) => prev.filter((x) => x !== key));
  };

  const remapEquipment = (oldName, newName) => {
    const oldKey = String(oldName || "").trim();
    const newKey = String(newName || "").trim();
    setEquipment((prev) => {
      const next = prev.filter((x) => x !== oldKey);
      if (newKey && !next.includes(newKey)) next.push(newKey);
      return next;
    });
  };

  // original holiday helper (range-based) kept if you still need it elsewhere
  const isEmployeeOnHoliday = (employeeName) => {
    const selectedStart = new Date(startDate);
    const selectedEnd = isRange ? new Date(endDate) : selectedStart;
    return holidayBookings.some((h) => {
      if (h.employee !== employeeName) return false;
      const hs = new Date(h.startDate),
        he = new Date(h.endDate);
      return (
        (selectedStart >= hs && selectedStart <= he) ||
        (selectedEnd >= hs && selectedEnd <= he) ||
        (selectedStart <= hs && selectedEnd >= he)
      );
    });
  };

  // NEW: holiday check for specific date list
  const isEmployeeOnHolidayForDates = (employeeName, dates) => {
    if (!dates || !dates.length) return false;
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

  // NEW: helper to add/remove employee across all selected dates by default
  const upsertEmployeeDates = (role, name, add) => {
    setEmployeesByDate((prev) => {
      const next = { ...prev };
      if (add) {
        selectedDates.forEach((d) => {
          if (!d) return;
          const list = next[d] || [];
          const exists = list.some((e) => e.name === name && e.role === role);
          if (!exists) {
            next[d] = [...list, { role, name }];
          }
        });
      } else {
        Object.keys(next).forEach((d) => {
          const list = next[d] || [];
          const filtered = list.filter((e) => !(e.name === name && e.role === role));
          if (filtered.length) {
            next[d] = filtered;
          } else {
            delete next[d];
          }
        });
      }
      return next;
    });
  };

  /* ─────────────────────────────────────────────────────────────
     ✅ NEW: Show “Other” names as selectable options (deselectable)
     - ensures custom names saved on a booking appear in the list
     - and never disables a checkbox if it’s already selected
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

  const driverOptions = (() => {
    const base = employeeList.map((e) => e?.name).filter(Boolean);
    const selected = selectedNamesByRole("Precision Driver");
    const customSelected = selected.filter((n) => !base.includes(n));
    const out = uniqStrings([...base, ...customSelected]);
    return [...out, "Other"];
  })();

  const freelancerOptions = (() => {
    const base = freelancerList.map((e) => e?.name).filter(Boolean);
    const selected = selectedNamesByRole("Freelancer");
    const customSelected = selected.filter((n) => !base.includes(n));
    const out = uniqStrings([...base, ...customSelected]);
    return [...out, "Other"];
  })();

  const handleSubmit = async () => {
    if (status !== "Enquiry") {
      if (!startDate) return alert("Please select a start date.");
      if (isRange && !endDate) return alert("Please select an end date.");
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
    const cleanedEmployees = [
      ...employees.filter((e) => e.name !== "Other"),
      ...customNames.map((n) => ({ role: "Precision Driver", name: n })),
    ];

    const bookingDates = status !== "Enquiry" ? selectedDates : [];

    // ----- FILE CHANGES (multi-file) -----
    const storage = getStorage();

    // 0) Legacy single-file checkbox support (only if no attachments array is in use)
    if ((attachments?.length ?? 0) === 0 && removePdf && pdfURL) {
      const legacyPath = storagePathFromDownloadUrl(pdfURL);
      if (legacyPath) {
        try {
          await deleteObject(ref(storage, legacyPath));
        } catch (e) {
          console.warn("Legacy delete failed:", e);
        }
      }
      setPdfURL(null);
    }

    // 1) Delete files the user marked in the UI (deleted on Save)
    if (deletedUrls.size > 0) {
      for (const url of deletedUrls) {
        const path = storagePathFromDownloadUrl(url);
        if (path) {
          try {
            await deleteObject(ref(storage, path));
          } catch (e) {
            console.warn("Delete failed:", e);
          }
        }
      }
    }

    // Keep only not-deleted attachments currently on the booking
    let nextAttachments = (attachments || []).filter((a) => a?.url && !deletedUrls.has(a.url));

    // 2) Upload any newly selected files
    if (newFiles.length > 0) {
      const uploaded = [];
      for (const file of newFiles) {
        const safeName = `${jobNumber || "nojob"}_${file.name}`.replace(/\s+/g, "_");
        const folder = file.name.toLowerCase().endsWith(".pdf") ? "booking_pdfs" : "quotes";
        const storageRef = ref(storage, `${folder}/${safeName}`);

        const contentType =
          file.type ||
          (safeName.endsWith(".pdf")
            ? "application/pdf"
            : safeName.endsWith(".xlsx")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : safeName.endsWith(".xls")
            ? "application/vnd.ms-excel"
            : safeName.endsWith(".csv")
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

    // 3) Backwards-compatibility fields (mirror the FIRST file for old screens)
    const firstUrl = nextAttachments[0]?.url || null;
    const fileUrlToSave = firstUrl;

    // 4) Clean up UI helper state
    setPdfProgress(0);
    setNewFiles([]);
    setDeletedUrls(new Set());
    setAttachments(nextAttachments);
    setPdfURL(firstUrl);

    const filteredNotesByDate = {};
    bookingDates.forEach((date) => {
      filteredNotesByDate[date] = notesByDate[date] || "";
      if (typeof notesByDate[`${date}-other`] !== "undefined")
        filteredNotesByDate[`${date}-other`] = notesByDate[`${date}-other`];
      if (typeof notesByDate[`${date}-travelMins`] !== "undefined")
        filteredNotesByDate[`${date}-travelMins`] = notesByDate[`${date}-travelMins`];
    });

    // Build employeesByDate payload (per-day assignments)
    const employeesKey = (e) => `${e.role}::${e.name}`;
    const cleanedSet = new Set(cleanedEmployees.map(employeesKey));

    let employeesByDatePayload = {};

    if (bookingDates.length && cleanedEmployees.length) {
      bookingDates.forEach((date) => {
        const fromState = employeesByDate[date];
        const baseList =
          Array.isArray(fromState) && fromState.length ? fromState : cleanedEmployees; // default: everyone on that day
        const filtered = baseList.filter((e) => cleanedSet.has(employeesKey(e)));
        if (filtered.length) {
          employeesByDatePayload[date] = filtered;
        }
      });

      // If somehow still empty, fall back to "everyone on every day"
      if (!Object.keys(employeesByDatePayload).length) {
        bookingDates.forEach((date) => {
          employeesByDatePayload[date] = [...cleanedEmployees];
        });
      }
    }

    // Holiday validation using per-day dates
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

    // derive employeeCodes from selected names
    const employeeCodes = cleanedEmployees
      .map((e) => nameToCode[String(e?.name || "").trim().toLowerCase()])
      .filter(Boolean);

    // Build per-day call times payload (only for actual booking dates)
    const callTimesByDatePayload = {};
    if (bookingDates.length) {
      bookingDates.forEach((d) => {
        if (callTimesByDate[d]) {
          callTimesByDatePayload[d] = callTimesByDate[d];
        }
      });
    }

    const user = auth.currentUser;
    const payload = {
      jobNumber,
      client,
      contactNumber,
      contactEmail,
      location,

      employees: cleanedEmployees,
      employeesByDate: employeesByDatePayload, // NEW
      employeeCodes, // keep names too

      // Vehicles now saved as canonical keys (vehicle IDs)
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

      // persist ALL files
      attachments: nextAttachments,

      // legacy mirrors for old views
      quoteUrl: fileUrlToSave || null,
      pdfURL: fileUrlToSave || null,

      hasHotel,
      callTime: !isRange ? (callTime || "") : "", // single-day only
      ...(Object.keys(callTimesByDatePayload).length
        ? { callTimesByDate: callTimesByDatePayload }
        : {}),

      hasRiggingAddress,
      riggingAddress: hasRiggingAddress ? riggingAddress || "" : "",

      ...(["Lost", "Postponed", "Cancelled"].includes(status) && {
        statusReasons,
        statusReasonOther: statusReasons.includes("Other") ? statusReasonOther.trim() : "",
      }),

      ...(status !== "Enquiry"
        ? isRange
          ? {
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate).toISOString(),
              date: null,
            }
          : {
              date: new Date(startDate).toISOString(),
              startDate: null,
              endDate: null,
            }
        : {}),

      lastEditedBy: user?.email || "Unknown",
      updatedAt: new Date().toISOString(),
    };

    try {
      if (bookingId) {
        await updateDoc(doc(db, "bookings", bookingId), payload);
      } else {
        await addDoc(collection(db, "bookings"), payload);
      }
      alert(bookingId ? "Booking Updated ✅" : "Booking Saved ✅");
      router.back();
    } catch (err) {
      console.error("❌ Error saving booking:", err);
      alert("Failed to save booking ❌\n\n" + err.message);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={mainWrap}>
          <h1 style={h1Style}>{bookingId ? "✏️ Edit Booking" : "➕ Create New Booking"}</h1>

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
                <input
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  required
                  style={{
                    ...field.input,
                    backgroundColor: bookingId ? "#f3f4f6" : "#fff",
                    color: bookingId ? UI.muted : UI.text,
                    cursor: bookingId ? "not-allowed" : "text",
                  }}
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
                  <option value="Confirmed">Confirmed</option>
                  <option value="First Pencil">First Pencil</option>
                  <option value="Second Pencil">Second Pencil</option>
                  <option value="Enquiry">Enquiry</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="DNH">DNH</option>
                  <option value="Lost">Lost</option>
                  <option value="Postponed">Postponed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>

                {["Lost", "Postponed", "Cancelled"].includes(status) && (
                  <div
                    style={{
                      border: UI.border,
                      borderRadius: UI.radiusSm,
                      padding: 12,
                      marginTop: -6,
                      marginBottom: 12,
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
                              prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
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
                <textarea value={client} onChange={(e) => setClient(e.target.value)} style={field.textarea} />

                <label style={field.label}>Contact Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  style={field.input}
                />

                <label style={field.label}>Contact Number</label>
                <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} style={field.input} />

                <label style={field.label}>Location</label>
                <textarea value={location} onChange={(e) => setLocation(e.target.value)} style={field.textarea} />
              </div>

              {/* Column 2: Dates + People */}
              <div style={card}>
                <h3 style={cardTitle}>Dates & People</h3>

                <div style={field.checkboxRow}>
                  <input type="checkbox" checked={isRange} onChange={() => setIsRange(!isRange)} />
                  <span>Multi-day booking</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isRange ? "1fr 1fr" : "1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label style={field.label}>{isRange ? "Start Date" : "Date"}</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
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
                        required
                        style={field.input}
                      />
                    </div>
                  )}
                </div>

                {startDate && (
                  <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: "8px 0" }}>{isRange ? "Notes for Each Day" : "Note for the Day"}</h4>
                    {(() => {
                      const days = [];
                      const start = new Date(startDate);
                      const end = isRange && endDate ? new Date(endDate) : start;
                      const curr = new Date(start);
                      while (curr <= end) {
                        const d = curr.toISOString().split("T")[0];
                        days.push(d);
                        curr.setDate(curr.getDate() + 1);
                      }
                      return (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
                            gap: 12,
                          }}
                        >
                          {days.map((date) => {
                            const selectedNote = notesByDate[date] || "";
                            const isOther = selectedNote === "Other";
                            const customNote = notesByDate[`${date}-other`] || "";
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
                                      value={customNote}
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
                      );
                    })()}
                  </div>
                )}

                <div style={divider} />

                <h4 style={{ margin: "8px 0" }}>Precision Driver</h4>

                {/* ✅ UPDATED: show custom “Other” names + allow deselect even if booked/holiday/crewed */}
                {driverOptions.map((name) => {
                  const isSelected = employees.some(
                    (e) => e.name === name && e.role === "Precision Driver"
                  );
                  const isBooked = bookedEmployees.includes(name);
                  const isHeld = heldEmployees?.includes?.(name);
                  const isHoliday = isEmployeeOnHoliday(name);

                  // ✅ allow deselect even if otherwise blocked
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
                            const next = [...employees, { role: "Precision Driver", name }];
                            setEmployees(next);
                            upsertEmployeeDates("Precision Driver", name, true);
                          } else {
                            const next = employees.filter(
                              (sel) => !(sel.name === name && sel.role === "Precision Driver")
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

                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <label style={{ fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={isCrewed}
                      onChange={(e) => setIsCrewed(e.target.checked)}
                    />{" "}
                    Booking Crewed
                  </label>
                </div>

                <h4 style={{ margin: "8px 0" }}>Freelancers</h4>

                {/* ✅ UPDATED: show custom “Other” names + allow deselect even if booked/holiday */}
                {freelancerOptions.map((name) => {
                  const isSelected = employees.some((e) => e.name === name && e.role === "Freelancer");
                  const isBooked = bookedEmployees.includes(name);
                  const isHoliday = isEmployeeOnHoliday(name);

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
                            const next = [...employees, { role: "Freelancer", name }];
                            setEmployees(next);
                            upsertEmployeeDates("Freelancer", name, true);
                          } else {
                            const next = employees.filter(
                              (sel) => !(sel.name === name && sel.role === "Freelancer")
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

                {employees.some((e) => e.name === "Other") && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="Other employee(s), comma-separated"
                      value={customEmployee}
                      onChange={(e) => setCustomEmployee(e.target.value)}
                      style={{ ...field.input, marginBottom: 8 }}
                    />
                    {customEmployee
                      .split(",")
                      .map((n) => n.trim())
                      .filter(Boolean)
                      .map((name) => (
                        <label key={name} style={{ display: "block", marginBottom: 6 }}>
                          <input
                            type="checkbox"
                            checked={employees.some(
                              (e) => e.role === "Precision Driver" && e.name === name
                            )}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEmployees([...employees, { role: "Precision Driver", name }]);
                                upsertEmployeeDates("Precision Driver", name, true);
                              } else {
                                setEmployees(
                                  employees.filter(
                                    (x) => !(x.role === "Precision Driver" && x.name === name)
                                  )
                                );
                                upsertEmployeeDates("Precision Driver", name, false);
                              }
                            }}
                          />{" "}
                          <span>{name}</span>
                        </label>
                      ))}
                  </div>
                )}

                {/* NEW: employee schedule by day */}
                {selectedDates.length > 0 &&
                  employees.filter((e) => e.name && e.name !== "Other").length > 0 && (
                    <>
                      <div style={divider} />
                      <h4 style={{ margin: "8px 0" }}>Employee schedule by day</h4>
                      <p style={{ fontSize: 12, color: UI.muted, marginBottom: 8 }}>
                        By default, each selected employee is on every job day. Use this grid to
                        fine-tune who is working on which dates.
                      </p>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
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
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>{pretty}</div>
                              {employees
                                .filter((e) => e.name && e.name !== "Other")
                                .map((emp) => {
                                  const isOnDay = assigned.some(
                                    (e) => e.name === emp.name && e.role === emp.role
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
                                            const list = next[date] || [];
                                            const exists = list.some(
                                              (e) => e.name === emp.name && e.role === emp.role
                                            );
                                            if (exists) {
                                              const filtered = list.filter(
                                                (e) =>
                                                  !(e.name === emp.name && e.role === emp.role)
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
                                      <span style={{ color: UI.muted }}>({emp.role})</span>
                                    </label>
                                  );
                                })}
                              {employees.filter((e) => e.name && e.name !== "Other").length ===
                                0 && (
                                <div style={{ fontSize: 12, color: UI.muted }}>
                                  No employees selected yet.
                                </div>
                              )}
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
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((prev) => ({
                            ...prev,
                            [group]: !prev[group],
                          }))
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
                            const isBooked = bookedVehicles.includes(key);
                            const blockedStatus = vehicleBlockingStatusById[key];
                            const isHeld = heldVehicles.includes(key);
                            const isSelected = vehicles.includes(key);

                            // HARD BLOCK: also includes Maintenance bookings
                            const disabled = isBooked && !isSelected;

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
                                    ? `Vehicle is already ${blockedStatus || "booked"} on overlapping date(s)`
                                    : ""
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={disabled}
                                  onChange={(e) => toggleVehicle(key, e.target.checked)}
                                />
                                <span
                                  style={{
                                    flex: 1,
                                    color: disabled ? "#6e6f70ff" : UI.text,
                                  }}
                                >
                                  {vehicle.name}
                                  {vehicle.registration ? ` – ${vehicle.registration}` : ""}
                                  {isBooked && ` (${blockedStatus || "Blocked"})`}{" "}
                                  {!isBooked && isHeld && " (Held)"}
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

                <div style={divider} />

                {/* Legacy equipment */}
                {missingEquipment.length > 0 && (
                  <div
                    style={{
                      ...card,
                      borderColor: "#f59e0b",
                      background: "#FFFBEB",
                      marginTop: 10,
                    }}
                  >
                    <h4 style={{ margin: "0 0 8px" }}>Legacy equipment (renamed or deleted)</h4>
                    <p style={{ marginTop: 0, color: "#92400e" }}>
                      These items are saved on this booking but aren’t in the current equipment list.
                      Remove or remap them:
                    </p>
                    {missingEquipment.map((old) => (
                      <div
                        key={old}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          marginBottom: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={pill}>{old}</span>
                        <button
                          type="button"
                          onClick={() => removeEquipment(old)}
                          style={{ ...btn, padding: "6px 10px" }}
                          title="Remove from this booking"
                        >
                          Remove
                        </button>
                        <select
                          defaultValue=""
                          onChange={(e) => e.target.value && remapEquipment(old, e.target.value)}
                          style={{ ...field.input, width: 320, height: 34 }}
                          title="Remap to a current equipment name"
                        >
                          <option value="">Remap to…</option>
                          {allEquipmentNames.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                <h3 style={cardTitle}>Equipment</h3>

                {Object.entries(equipmentGroups).map(([group, items]) => {
                  const isOpen = openEquipGroups[group] || false;

                  return (
                    <div key={group} style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenEquipGroups((prev) => ({
                            ...prev,
                            [group]: !prev[group],
                          }))
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
                            const disabled = isBooked && !isSelected;

                            return (
                              <label key={name} style={{ display: "block", marginBottom: 6 }}>
                                <input
                                  type="checkbox"
                                  value={name}
                                  disabled={disabled}
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEquipment((prev) => Array.from(new Set([...prev, name])));
                                    } else {
                                      setEquipment((prev) => prev.filter((x) => x !== name));
                                    }
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

              {/* Existing attachments (multi-file) */}
              {(() => {
                const files = (attachments || []).filter((a) => a?.url && !deletedUrls.has(a.url));

                if (files.length > 0) {
                  return (
                    <div
                      style={{
                        border: UI.border,
                        borderRadius: UI.radiusSm,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ marginBottom: 8, fontWeight: 600 }}>Current files</div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {files.map((a) => (
                          <div
                            key={a.url}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              border: UI.border,
                              padding: "6px 8px",
                              borderRadius: 8,
                            }}
                          >
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ textDecoration: "underline" }}
                            >
                              {a.name || a.url.split("/").pop()}
                            </a>
                            <button
                              type="button"
                              onClick={() => setDeletedUrls((prev) => new Set(prev).add(a.url))}
                              style={{
                                ...btn,
                                padding: "4px 8px",
                                background: "#fee2e2",
                                borderColor: "#ef4444",
                                color: "#991b1b",
                              }}
                              title="Mark for deletion (deleted on Save)"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>

                      {deletedUrls.size > 0 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                          {deletedUrls.size} file{deletedUrls.size > 1 ? "s" : ""} will be deleted
                          from Storage on save.
                        </div>
                      )}
                    </div>
                  );
                }

                if (pdfURL) {
                  return (
                    <div
                      style={{
                        border: UI.border,
                        borderRadius: UI.radiusSm,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ marginBottom: 8, fontWeight: 600 }}>Current file</div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <a
                          href={pdfURL}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: "underline" }}
                        >
                          Open current file
                        </a>

                        <button
                          type="button"
                          onClick={handleDeleteCurrentFile}
                          disabled={deletingFile}
                          style={{
                            ...btn,
                            background: "#fee2e2",
                            borderColor: "#ef4444",
                            color: "#991b1b",
                            padding: "6px 10px",
                          }}
                          title="Delete from Storage and unlink now"
                        >
                          {deletingFile ? "Deleting…" : "Delete file now"}
                        </button>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <label style={field.checkboxRow}>
                          <input
                            type="checkbox"
                            checked={removePdf}
                            onChange={(e) => setRemovePdf(e.target.checked)}
                            disabled={deletingFile}
                          />
                          Remove current file on save
                        </label>
                        {removePdf && (
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: -6 }}>
                            The file will be deleted from Storage on save.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{ fontSize: 12, color: UI.muted, marginBottom: 10 }}>
                    No files attached yet.
                  </div>
                );
              })()}

              {/* Uploader */}
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
                  {newFiles.length} file{newFiles.length > 1 ? "s" : ""} selected — they’ll upload on
                  Save.
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginTop: 14,
                }}
              >
                {/* Call time(s) */}
                <div>
                  <label style={field.label}>Call Time</label>
                  {isRange && selectedDates.length > 1 ? (
                    <div
                      style={{
                        border: UI.border,
                        borderRadius: UI.radiusSm,
                        padding: 10,
                        background: UI.bgAlt,
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

                {/* Rigging address */}
                <div>
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
                      rows={3}
                      style={field.textarea}
                      placeholder="Enter rigging address..."
                    />
                  )}
                </div>
              </div>

              <div style={{ marginTop: 14 }} />
              <label style={field.label}>Additional Notes</label>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={field.textarea}
                placeholder="Anything extra to include for this booking..."
              />

              <div style={divider} />

              <label style={field.checkboxRow}>
                <input type="checkbox" checked={hasHS} onChange={(e) => setHasHS(e.target.checked)} />
                Health & Safety Completed
              </label>
              <label style={field.checkboxRow}>
                <input
                  type="checkbox"
                  checked={hasRiskAssessment}
                  onChange={(e) => setHasRiskAssessment(e.target.checked)}
                />
                Risk Assessment Completed
              </label>
              <label style={field.checkboxRow}>
                <input type="checkbox" checked={hasHotel} onChange={(e) => setHasHotel(e.target.checked)} />
                Hotel Booked
              </label>

              <div style={actionsRow}>
                <button type="submit" style={btnPrimary}>
                  {bookingId ? "Update Booking" : "Save Booking"}
                </button>
                <button type="button" onClick={() => router.back()} style={btnGhost}>
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
                  <div>Contact</div>
                  <div>
                    {contactEmail || "—"}
                    {contactNumber ? ` • ${contactNumber}` : ""}
                  </div>
                </div>
                <div style={summaryRow}>
                  <div>Location</div>
                  <div>{location || "—"}</div>
                </div>
                <div style={summaryRow}>
                  <div>Dates</div>
                  <div>{isRange ? `${startDate || "—"} → ${endDate || "—"}` : startDate || "—"}</div>
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
                              border: "1px solid #d1d5db",
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
                    {isRange && selectedDates.length > 1
                      ? selectedDates
                          .map((d) => {
                            const t = callTimesByDate[d] || "—";
                            return `${d}: ${t}`;
                          })
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
