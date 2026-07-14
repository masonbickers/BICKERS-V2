"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Columns3,
  Filter,
  LayoutGrid,
  List,
  RefreshCcw,
  Search,
  Table2,
} from "lucide-react";

/* Mini design system */
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
  amber: "#b45309",
  amberSoft: "#fffbeb",
  amberBorder: "#fde68a",
  red: "#b91c1c",
  redSoft: "#fff1f2",
  redBorder: "#fecdd3",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" };
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const toolbar = {
  ...surface,
  padding: 12,
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) auto auto repeat(5, minmax(130px, auto)) auto",
  gap: UI.gap,
  alignItems: "center",
  position: "sticky",
  top: 12,
  zIndex: 2,
  backdropFilter: "saturate(180%) blur(6px)",
  background: "rgba(255,255,255,0.96)",
};

const searchWrap = { position: "relative", display: "flex", alignItems: "center" };
const searchInput = { width: "100%", minHeight: 36, padding: "7px 42px 7px 34px", borderRadius: UI.radiusSm, border: UI.border, fontSize: 13, outline: "none", background: "#fff", color: UI.text };
const searchIcon = { position: "absolute", left: 10, width: 17, height: 17, color: UI.muted };

const pillBtn = (active = false) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  border: active ? `1px solid ${UI.brand}` : UI.border,
  background: active ? UI.brandSoft : "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: active ? UI.brand : UI.text,
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: active ? "0 8px 18px rgba(24,63,103,0.12)" : "none",
  whiteSpace: "nowrap",
});

const tabsWrap = { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" };
const select = { minHeight: 36, padding: "7px 9px", borderRadius: UI.radiusSm, border: UI.border, background: "#fff", color: UI.text, fontSize: 12.5, minWidth: 140 };
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const statGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: UI.gap, marginTop: UI.gap };
const statCard = { ...surface, padding: 12 };

const sectionHeader = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, margin: "18px 2px 10px", flexWrap: "wrap" };
const weekTitle = { fontSize: 16, fontWeight: 800, color: UI.text, letterSpacing: 0, margin: 0 };
const tinyHint = { color: UI.muted, fontSize: 12 };
const emptyWrap = { ...surface, padding: 20, display: "flex", alignItems: "center", justifyContent: "center", color: UI.muted, fontSize: 13.5 };
const gridWrap = (cols = 4) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: UI.gap });
const listWrap = { display: "grid", gap: 10 };

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const focusCss = `
  input:focus, select:focus, button:focus, a:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
  @media (max-width: 1180px) {
    .job-sheet-toolbar,
    .job-sheet-stat-grid { grid-template-columns: 1fr !important; }
  }
`;

/* Week helpers */
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} to ${sunday.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
}

/* Date + job helpers */
const fmtDate = (d) =>
  d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "TBC";

const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate(); // Firestore Timestamp
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const normaliseDates = (job) => {
  const dates = [];
  if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
    for (const d of job.bookingDates) {
      const pd = parseDate(d);
      if (pd) dates.push(pd);
    }
  } else if (job.date) {
    const pd = parseDate(job.date);
    if (pd) dates.push(pd);
  }
  return dates;
};

const firstDate = (job) => {
  const ds = normaliseDates(job).sort((a, b) => a - b);
  return ds[0] ?? null;
};

const dateRangeLabel = (job) => {
  const ds = normaliseDates(job).sort((a, b) => a - b);
  if (!ds.length) return "TBC";
  return ds.map((d) => fmtDate(d)).join(", ");
};

const getJobPrefix = (job) => (job.jobNumber ? job.jobNumber.toString().split("-")[0] : "No Job #");

// Only allow 4-digit job numbers
const isFourDigitJob = (job) => /^\d{4}$/.test(String(job.jobNumber ?? "").trim());

/* Classification */
const CONFIRMED_LIKE = new Set([
  "confirmed",
  "pending",
  "complete",
  "completed",
  "action required",
  "action_required",
  "invoiced",
  "ready to invoice",
  "ready_to_invoice",
  "ready-to-invoice",
  "readyinvoice",
  "paid",
  "settled",
]);

const classify = (job, todayMidnight) => {
  const status = (job.status || "").toLowerCase().trim();

  if (/ready\s*to\s*invoice/.test(status)) return "Ready to Invoice";
  if (status === "paid" || status === "settled") return "Paid";
  if (status.includes("action")) return "Needs Action";
  if (status.includes("enquiry") || status.includes("inquiry")) return "Enquiries";

  const ds = normaliseDates(job);
  if (!ds.length) return "Upcoming";

  const anyFutureOrToday = ds.some((d) => {
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    return dd.getTime() >= todayMidnight.getTime();
  });
  if (anyFutureOrToday) return "Upcoming";

  const confirmedFlag = job.confirmed === true || job.isConfirmed === true;
  if (confirmedFlag || CONFIRMED_LIKE.has(status)) return "Complete Jobs";

  return "Passed - Not Confirmed";
};

/* Status badge helpers */
const prettifyStatus = (raw) => {
  const s = (raw || "").toString().trim().toLowerCase();

  // Normalise common variants first
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";

  // Otherwise: title-case whatever it is.
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC";
};

const displayStatusForSection = (job, section) => {
  const raw = (job.status || "").toString();
  if (section === "Complete Jobs") {
    // Show the job's actual status (beautified)
    return raw.trim() ? prettifyStatus(raw) : "Complete";
  }
  // Other sections: also prettify, using same normalisations
  return prettifyStatus(raw);
};

const statusColors = (label) => {
  switch (label) {
    case "Ready to Invoice":
      return { bg: UI.amberSoft, border: UI.amberBorder, text: UI.amber };
    case "Invoiced":
      return { bg: UI.brandSoft, border: UI.brandBorder, text: UI.brand };
    case "Paid":
      return { bg: UI.greenSoft, border: UI.greenBorder, text: UI.green };
    case "Action Required":
      return { bg: UI.redSoft, border: UI.redBorder, text: UI.red };
    case "Complete":
      return { bg: UI.greenSoft, border: UI.greenBorder, text: UI.green };
    case "Confirmed":
      return { bg: UI.amberSoft, border: UI.amberBorder, text: UI.amber };
    case "First Pencil":
      return { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" };
    case "Second Pencil":
      return { bg: UI.redSoft, border: UI.redBorder, text: UI.red };
    case "TBC":
      return { bg: "#f8fafc", border: "#e2e8f0", text: UI.muted };
    default:
      return { bg: "#f8fafc", border: "#dbe5ef", text: UI.text };
  }
};

const getCheckState = (job) => ({
  notes: [job?.generalNotes, job?.notes, job?.jobNotes].some((value) => String(value || "").trim().length > 0),
  po: String(job?.po || "").trim().length > 0,
  quote: String(job?.pdfUrl || "").trim().length > 0 || (Array.isArray(job?.attachments) && job.attachments.length > 0),
});

const CheckBadge = ({ label, ok }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 8px",
      borderRadius: 999,
      border: `1px solid ${ok ? "#86efac" : "#fecaca"}`,
      background: ok ? "#dcfce7" : "#fee2e2",
      color: ok ? "#166534" : "#991b1b",
      fontSize: 10.5,
      fontWeight: 800,
      whiteSpace: "nowrap",
    }}
  >
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: ok ? "#16a34a" : "#dc2626",
      }}
    />
    {label}
  </span>
);

const StatusBadge = ({ job, section }) => {
  const label = displayStatusForSection(job, section);
  const c = statusColors(label);
  return (
    <span
      style={{
        padding: "6px 10px",
        fontSize: 11,
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
};

/* Table styles */
const tableWrap = { overflow: "auto", border: UI.border, borderRadius: UI.radius, background: "#fff", boxShadow: UI.shadowSm };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #dde5ee", position: "sticky", top: 0, background: "#f7f9fc", zIndex: 1, fontSize: 12, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.04em" };
const td = { padding: "9px 12px", borderBottom: "1px solid #edf2f7", verticalAlign: "top" };

/* Page */
export default function JobSheetPage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("Upcoming");
  const [viewMode, setViewMode] = useState("grid"); // grid | list | table
  const [density, setDensity] = useState("cozy"); // cozy | compact | ultra
  const [sortBy, setSortBy] = useState("dateAsc"); // dateAsc | dateDesc | client | job

  // Filters
  const [statusFilter, setStatusFilter] = useState("all"); // all | confirmed | complete | ready | invoiced | paid | action | enquiries | passed | upcoming
  const [clientFilter, setClientFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");

  const clearFilters = () => {
    setStatusFilter("all");
    setClientFilter("all");
    setVehicleFilter("all");
    setEquipmentFilter("all");
    setEmployeeFilter("all");
  };

  const searchRef = useRef(null);

  // Dates
  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  /* ---------- Realtime listener ---------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "listen job sheet bookings" });
      setBookings([]);
      setLoading(false);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState), (snapshot) => {
      const jobList = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      setBookings(jobList);
      setLoading(false);
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "bookings", operation: "listen job sheet bookings" });
      setBookings([]);
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "listen job sheet vehicles" });
      setVehiclesData([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "vehicles", dataAccessState), (snapshot) => {
      setVehiclesData(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "vehicles", operation: "listen job sheet vehicles" });
      setVehiclesData([]);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  const vehicleLookup = useMemo(() => {
    const byId = new Map();
    const byReg = new Map();
    const byName = new Map();

    for (const v of vehiclesData) {
      const id = String(v?.id || "").trim();
      const name = String(v?.name || "").trim();
      const reg = String(v?.registration || v?.reg || "").trim();
      const label = name || reg || id || "Vehicle";

      if (id) byId.set(id, label);
      if (reg) byReg.set(reg.toLowerCase(), label);
      if (name) byName.set(name.toLowerCase(), label);
    }

    return { byId, byReg, byName };
  }, [vehiclesData]);

  const resolveVehicleNames = useCallback((job) => {
    const list = Array.isArray(job?.vehicles) ? job.vehicles : [];
    const out = [];

    for (const raw of list) {
      if (raw && typeof raw === "object") {
        const label = String(raw.name || raw.registration || raw.reg || raw.id || "").trim();
        if (label) out.push(label);
        continue;
      }

      const token = String(raw || "").trim();
      if (!token) continue;

      const byId = vehicleLookup.byId.get(token);
      if (byId) {
        out.push(byId);
        continue;
      }

      const byReg = vehicleLookup.byReg.get(token.toLowerCase());
      if (byReg) {
        out.push(byReg);
        continue;
      }

      const byName = vehicleLookup.byName.get(token.toLowerCase());
      if (byName) {
        out.push(byName);
        continue;
      }

      out.push(token);
    }

    return Array.from(new Set(out));
  }, [vehicleLookup]);

  const resolveEquipmentNames = (job) => {
    const eq = job?.equipment;
    if (Array.isArray(eq)) return eq.map((x) => String(x || "").trim()).filter(Boolean);
    if (typeof eq === "string") {
      return eq
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  };

  /* ---------- Base: 4-digit jobs only ---------- */
  const fourDigitJobs = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  /* ---------- Search filter ---------- */
  const searched = useMemo(() => {
    if (!search) return fourDigitJobs;
    const s = search.toLowerCase();
    return fourDigitJobs.filter(
      (job) =>
        (job.jobNumber || "").toString().toLowerCase().includes(s) ||
        (job.client || "").toLowerCase().includes(s) ||
        (job.location || "").toLowerCase().includes(s) ||
        (job.notes || "").toLowerCase().includes(s)
    );
  }, [fourDigitJobs, search]);

  /* ---------- Group into sections (your logic) ---------- */
  const groups = useMemo(() => {
    const grouped = {
      Upcoming: [],
      "Complete Jobs": [],
      "Passed - Not Confirmed": [],
      "Ready to Invoice": [],
      Paid: [],
      "Needs Action": [],
      Enquiries: [],
    };

    for (const job of searched) {
      const cat = classify(job, todayMidnight);
      (grouped[cat] ?? grouped.Upcoming).push(job);
    }

    // Sorting helpers
    const firstD = (j) => normaliseDates(j)[0] ?? null;
    const sorters = {
      dateAsc: (a, b) => (firstD(a)?.getTime() ?? Infinity) - (firstD(b)?.getTime() ?? Infinity),
      dateDesc: (a, b) => (firstD(b)?.getTime() ?? -Infinity) - (firstD(a)?.getTime() ?? -Infinity),
      client: (a, b) => (a.client || "").localeCompare(b.client || ""),
      job: (a, b) => (a.jobNumber || "").toString().localeCompare((b.jobNumber || "").toString(), undefined, { numeric: true }),
    };

    const applySort = (arr) => arr.sort(sorters[sortBy] || sorters.dateAsc);

    applySort(grouped.Upcoming);
    applySort(grouped["Complete Jobs"]);
    applySort(grouped["Passed - Not Confirmed"]);
    applySort(grouped["Ready to Invoice"]);
    applySort(grouped.Paid);
    applySort(grouped["Needs Action"]);
    applySort(grouped.Enquiries);

    return grouped;
  }, [searched, todayMidnight, sortBy]);

  /* ---------- Build facets from the ACTIVE section ---------- */
  const activeItemsBase = useMemo(() => groups[activeSection] || [], [groups, activeSection]);

  const facets = useMemo(() => {
    const clients = new Set();
    const vehicles = new Set();
    const equipment = new Set();
    const employees = new Set();

    for (const j of activeItemsBase) {
      if (j.client) clients.add(j.client);
      resolveVehicleNames(j).forEach((v) => vehicles.add(v));
      resolveEquipmentNames(j).forEach((e) => equipment.add(e));
      if (Array.isArray(j.employees)) {
        j.employees
          .map((e) => (typeof e === "string" ? e : e?.name))
          .filter(Boolean)
          .forEach((n) => employees.add(n));
      }
    }
    const toList = (s) => ["all", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
    return {
      clients: toList(clients),
      vehicles: toList(vehicles),
      equipment: toList(equipment),
      employees: toList(employees),
    };
  }, [activeItemsBase, resolveVehicleNames]);

  /* ---------- Status filter helper ---------- */
  const statusMatches = useCallback((job) => {
    if (statusFilter === "all") return true;

    const raw = (job.status || "").toString().trim().toLowerCase();
    const ds = normaliseDates(job);
    const isUpcoming = ds.some((d) => {
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      return dd.getTime() >= todayMidnight.getTime();
    });

    if (statusFilter === "upcoming") return isUpcoming;
    if (statusFilter === "passed") return !isUpcoming;

    if (statusFilter === "ready") return /ready\s*to\s*invoice/.test(raw);
    if (statusFilter === "confirmed") return raw === "confirmed";
    if (statusFilter === "complete") return raw === "complete" || raw === "completed";
    if (statusFilter === "invoiced") return raw === "invoiced";
    if (statusFilter === "paid") return raw === "paid" || raw === "settled";
    if (statusFilter === "action") return raw.includes("action");
    if (statusFilter === "enquiries") return raw.includes("enquiry") || raw.includes("inquiry");

    return true;
  }, [statusFilter, todayMidnight]);

  /* ---------- Apply filters to the ACTIVE section items ---------- */
  const activeItemsFiltered = useMemo(() => {
    return activeItemsBase.filter((j) => {
      if (!statusMatches(j)) return false;

      if (clientFilter !== "all" && (j.client || "") !== clientFilter) return false;

      if (vehicleFilter !== "all") {
        const vs = resolveVehicleNames(j);
        if (!vs.includes(vehicleFilter)) return false;
      }

      if (equipmentFilter !== "all") {
        const eq = resolveEquipmentNames(j);
        if (!eq.includes(equipmentFilter)) return false;
      }

      if (employeeFilter !== "all") {
        const names = (Array.isArray(j.employees) ? j.employees : [])
          .map((e) => (typeof e === "string" ? e : e?.name))
          .filter(Boolean);
        if (!names.includes(employeeFilter)) return false;
      }

      return true;
    });
  }, [activeItemsBase, clientFilter, vehicleFilter, equipmentFilter, employeeFilter, resolveVehicleNames, statusMatches]);

  /* ---------- Group filtered items by week ---------- */
  const groupJobsByWeek = (jobs) => {
    const byWeek = {};
    for (const job of jobs) {
      const ds = normaliseDates(job).sort((a, b) => a - b);
      if (!ds.length) continue;
      const mondayKey = getMonday(ds[0]).getTime();
      if (!byWeek[mondayKey]) byWeek[mondayKey] = [];
      byWeek[mondayKey].push(job);
    }
    return byWeek;
  };



  /* ---------- Responsive columns ---------- */
  const colsForViewport = () => {
    if (typeof window === "undefined") return 4;
    const w = window.innerWidth;
    if (w < 700) return 1;
    if (w < 1024) return 2;
    if (w < 1400) return 3;
    return 4;
  };
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const sync = () => setCols(colsForViewport());
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  /* ---------- Keyboard shortcuts ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "g" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setViewMode((v) => (v === "grid" ? "list" : v === "list" ? "table" : "grid"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- Counts per tab ---------- */
  const counts = {
    Upcoming: (groups.Upcoming || []).length,
    "Passed - Not Confirmed": (groups["Passed - Not Confirmed"] || []).length,
    "Complete Jobs": (groups["Complete Jobs"] || []).length,
    "Ready to Invoice": (groups["Ready to Invoice"] || []).length,
    Paid: (groups.Paid || []).length,
    "Needs Action": (groups["Needs Action"] || []).length,
    Enquiries: (groups.Enquiries || []).length,
  };

  const totalVisible = activeItemsFiltered.length;
  const visibleChecks = useMemo(
    () =>
      activeItemsFiltered.reduce(
        (acc, job) => {
          const checks = getCheckState(job);
          if (checks.notes) acc.notes += 1;
          if (checks.po) acc.po += 1;
          if (checks.quote) acc.quote += 1;
          return acc;
        },
        { notes: 0, po: 0, quote: 0 }
      ),
    [activeItemsFiltered]
  );

  /* ---------- Mark complete (optimistic update) ---------- */
  const markComplete = async (job) => {
    const prev = job.status;
    setBookings((old) => old.map((j) => (j.id === job.id ? { ...j, status: "complete", completedAt: new Date() } : j)));
    try {
      await updateDoc(
        doc(db, "bookings", job.id),
        tenantPayload(dataAccessState, { status: "complete", completedAt: serverTimestamp() })
      );
    } catch (e) {
      setBookings((old) => old.map((j) => (j.id === job.id ? { ...j, status: prev } : j)));
      alert("Could not mark complete. Please try again.");
    }
  };

  const updateJobStatus = async (job, nextStatus) => {
    const prev = job.status;
    setBookings((old) => old.map((j) => (j.id === job.id ? { ...j, status: nextStatus } : j)));
    try {
      await updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
        ...(nextStatus === "complete" ? { completedAt: serverTimestamp() } : {}),
      }));
    } catch (e) {
      setBookings((old) => old.map((j) => (j.id === job.id ? { ...j, status: prev } : j)));
      alert("Could not update job status. Please try again.");
    }
  };

  /* ---------- Card (cozy/compact) + Ultra strip ---------- */
  const Card = ({ job, section }) => {
    const denseNow = density === "compact";
    const ultra = density === "ultra";
    const checks = getCheckState(job);

    const team =
      Array.isArray(job.employees) && job.employees.length
        ? job.employees.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean).join(", ")
        : "-";
    const vehicles = resolveVehicleNames(job).length ? resolveVehicleNames(job).join(", ") : "-";
    const equipment = resolveEquipmentNames(job).length ? resolveEquipmentNames(job).join(", ") : "-";

    const prefix = getJobPrefix(job);
    const range = dateRangeLabel(job);
    const statusBadge = <StatusBadge job={job} section={section} />;
    const actionButton = {
      padding: "5px 8px",
      borderRadius: UI.radiusSm,
      border: UI.border,
      background: "#ffffff",
      color: UI.text,
      fontSize: 11.5,
      fontWeight: 800,
      cursor: "pointer",
      boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    };

    if (ultra) {
      return (
        <Link
          href={`/job-numbers/${job.id}`}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(120px, 1fr) auto",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            border: UI.border,
            borderRadius: UI.radius,
            background: UI.card,
            textDecoration: "none",
            color: UI.text,
            boxShadow: UI.shadowSm,
            transition: "transform .12s ease, box-shadow .12s ease, border-color .12s ease",
          }}
        >
          <div style={{ display: "flex", minWidth: 0, gap: 8, alignItems: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13.5 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 20, minWidth: 26, padding: "0 6px", borderRadius: 6, background: "#eef2ff", border: "1px solid #e5e7eb", fontWeight: 800, fontSize: 11, color: "#3730a3" }}>
              {prefix}
            </span>
            <span style={{ fontWeight: 900, fontSize: 13.5 }}>#{job.jobNumber || job.id}</span>
            <span style={{ opacity: 0.45 }}>-</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{job.client || "-"}</span>
            <span style={{ opacity: 0.45 }}>-</span>
            <span style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis" }}>{job.location || "-"}</span>
            <span style={{ opacity: 0.45 }}>-</span>
            <span style={{ opacity: 0.7 }}>{range}</span>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {statusBadge}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                updateJobStatus(job, "complete");
              }}
              style={actionButton}
              title="Mark complete"
            >
              Mark complete
            </button>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <CheckBadge label="Notes" ok={checks.notes} />
            <CheckBadge label="PO" ok={checks.po} />
            <CheckBadge label="Quote" ok={checks.quote} />
            <span style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f8fafc", fontSize: 11.5, fontWeight: 700 }}> {team}</span>
            <span style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f8fafc", fontSize: 11.5, fontWeight: 700 }}> {vehicles}</span>
            <span style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f8fafc", fontSize: 11.5, fontWeight: 700 }}> {equipment}</span>
          </div>
        </Link>
      );
    }

    const baseCard = {
      display: "flex",
      flexDirection: "column",
      background: UI.card,
      border: UI.border,
      borderRadius: UI.radius,
      padding: denseNow ? 10 : 12,
      gap: denseNow ? 6 : 8,
      textDecoration: "none",
      color: UI.text,
      boxShadow: UI.shadowSm,
      transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
      transform: "none",
      outline: "none",
    };

    return (
      <Link
        href={`/job-numbers/${job.id}`}
        style={baseCard}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, { transform: "translateY(-1px)", boxShadow: UI.shadowHover, borderColor: UI.brandBorder })}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, baseCard)}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            <span
              title="Job prefix"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 28,
                height: 22,
                padding: "0 6px",
                borderRadius: 8,
                background: "#eef2ff",
                border: "1px solid #e5e7eb",
                fontWeight: 900,
                fontSize: 11.5,
                color: "#3730a3",
              }}
            >
              {getJobPrefix(job)}
            </span>
            <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Job #{job.jobNumber || job.id}
            </span>
          </div>
          {statusBadge}
        </div>

        <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0 8px" }} />

        {/* Info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: denseNow ? 4 : 6, columnGap: denseNow ? 8 : 10, fontSize: 13.5, lineHeight: 1.32 }}>
          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Client</span>
          <span>{job.client || "-"}</span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Location</span>
          <span>{job.location || "-"}</span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Dates</span>
          <span>{range}</span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Employees</span>
          <span>
            {Array.isArray(job.employees) && job.employees.length
              ? job.employees.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean).join(", ")
              : "-"}
          </span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Vehicles</span>
          <span>{resolveVehicleNames(job).length ? resolveVehicleNames(job).join(", ") : "-"}</span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Equipment</span>
          <span>{equipment}</span>
        </div>


        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <CheckBadge label="Notes" ok={checks.notes} />
          <CheckBadge label="PO" ok={checks.po} />
          <CheckBadge label="Quote" ok={checks.quote} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                updateJobStatus(job, "Ready to Invoice");
              }}
              style={actionButton}
            >
              Ready
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                updateJobStatus(job, "Action Required");
              }}
              style={actionButton}
            >
              Action
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                updateJobStatus(job, "complete");
              }}
              style={actionButton}
            >
              Complete
            </button>
          </div>
          <span style={{ color: UI.muted, fontSize: 11, letterSpacing: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
            Open job <ChevronRight size={13} />
          </span>
        </div>
      </Link>
    );
  };

  /* ---------- Table ---------- */
  const Table = ({ jobs, section }) => (
    <div style={tableWrap}>
      <table style={tableEl} aria-label={`${section} jobs`}>
        <thead>
          <tr>
            <th style={th}>Job #</th>
            <th style={th}>Client</th>
            <th style={th}>Location</th>
            <th style={th}>Dates</th>
            <th style={th}>Employees</th>
            <th style={th}>Vehicles</th>
            <th style={th}>Checks</th>
            <th style={th}>Status</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const team =
              Array.isArray(job.employees) && job.employees.length
                ? job.employees.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean).join(", ")
                : "-";
            const vehicles = resolveVehicleNames(job).length ? resolveVehicleNames(job).join(", ") : "-";

            const checks = getCheckState(job);

            return (
              <tr key={job.id}>
                <td style={td}>
                  <Link href={`/job-numbers/${job.id}`} style={{ fontWeight: 800, textDecoration: "none", color: UI.text }}>
                    #{job.jobNumber || job.id}
                  </Link>
                </td>
                <td style={td}>{job.client || "-"}</td>
                <td style={td}>{job.location || "-"}</td>
                <td style={td}>{dateRangeLabel(job)}</td>
                <td style={td}>{team}</td>
                <td style={td}>{vehicles}</td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <CheckBadge label="Notes" ok={checks.notes} />
                    <CheckBadge label="PO" ok={checks.po} />
                    <CheckBadge label="Quote" ok={checks.quote} />
                  </div>
                </td>
                <td style={td}>
                  <StatusBadge job={job} section={section} />
                </td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => updateJobStatus(job, "Ready to Invoice")}
                      style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
                    >
                      Ready
                    </button>
                    <button
                      type="button"
                      onClick={() => updateJobStatus(job, "Action Required")}
                      style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
                    >
                      Action
                    </button>
                    <button
                      type="button"
                      onClick={() => updateJobStatus(job, "complete")}
                      style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
                    >
                      Complete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  /* ---------- Grouping + rendering ---------- */
  const weekGroups = useMemo(() => {
    const byWeek = {};
    for (const job of activeItemsFiltered) {
      const ds = normaliseDates(job).sort((a, b) => a - b);
      if (!ds.length) continue;
      const mondayKey = getMonday(ds[0]).getTime();
      if (!byWeek[mondayKey]) byWeek[mondayKey] = [];
      byWeek[mondayKey].push(job);
    }
    return byWeek;
  }, [activeItemsFiltered]);

  const weekKeys = useMemo(
    () => Object.keys(weekGroups).sort((a, b) => (activeSection === "Upcoming" ? a - b : b - a)),
    [weekGroups, activeSection]
  );

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Jobs Overview</h1>
            <div style={sub}>4-digit job view with week dividers, filters, density modes and live status checks.</div>
          </div>
          <div style={{ ...chip, alignSelf: "flex-start" }}>
            <BriefcaseBusiness size={13} />
            {loading ? "Loading..." : `${totalVisible} shown`}
          </div>
        </div>

        {/* Toolbar */}
        <div className="job-sheet-toolbar" style={toolbar}>
          {/* Search */}
          <div style={searchWrap} title="Press / to focus">
            <Search size={17} style={searchIcon} aria-hidden />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by job #, client, location, or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInput}
              aria-label="Search jobs"
            />
          </div>

          {/* View toggle (3-way) */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setViewMode("grid")} style={pillBtn(viewMode === "grid")} aria-pressed={viewMode === "grid"}>
              <LayoutGrid size={13} /> Grid
            </button>
            <button onClick={() => setViewMode("list")} style={pillBtn(viewMode === "list")} aria-pressed={viewMode === "list"}>
              <List size={13} /> List
            </button>
            <button onClick={() => setViewMode("table")} style={pillBtn(viewMode === "table")} aria-pressed={viewMode === "table"}>
              <Table2 size={13} /> Table
            </button>
          </div>

          {/* Density + Sort */}
          <div style={{ display: "flex", gap: 8 }}>
            <select value={density} onChange={(e) => setDensity(e.target.value)} style={select} aria-label="Density">
              <option value="cozy">Cozy</option>
              <option value="compact">Compact</option>
              <option value="ultra">Ultra</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={select} aria-label="Sort by">
              <option value="dateAsc">Date asc (first)</option>
              <option value="dateDesc">Date desc (recent)</option>
              <option value="client">Client A-Z</option>
              <option value="job">Job #</option>
            </select>
          </div>

          {/* Filters (apply within the active tab) */}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={select} aria-label="Filter by status">
            <option value="all">Status: All</option>
            <option value="upcoming">Status: Upcoming (by date)</option>
            <option value="passed">Status: Passed (by date)</option>
            <option value="confirmed">Status: Confirmed</option>
            <option value="complete">Status: Complete</option>
            <option value="ready">Status: Ready to Invoice</option>
            <option value="invoiced">Status: Invoiced</option>
            <option value="paid">Status: Paid</option>
            <option value="action">Status: Action Required</option>
            <option value="enquiries">Status: Enquiries</option>
          </select>

          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={select} aria-label="Filter by client">
            {facets.clients.map((c) => (
              <option key={c} value={c}>{c === "all" ? "Client: All" : c}</option>
            ))}
          </select>

          <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} style={select} aria-label="Filter by vehicle">
            {facets.vehicles.map((v) => (
              <option key={v} value={v}>{v === "all" ? "Vehicle: All" : v}</option>
            ))}
          </select>

          <select value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)} style={select} aria-label="Filter by equipment">
            {facets.equipment.map((eq) => (
              <option key={eq} value={eq}>{eq === "all" ? "Equipment: All" : eq}</option>
            ))}
          </select>

          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} style={select} aria-label="Filter by employee">
            {facets.employees.map((n) => (
              <option key={n} value={n}>{n === "all" ? "Employee: All" : n}</option>
            ))}
          </select>

          <button onClick={clearFilters} style={pillBtn(false)} aria-label="Clear filters">
            <RefreshCcw size={13} /> Clear
          </button>
        </div>

        {/* Tabs */}
        <div style={{ ...surface, marginTop: 12, padding: 10, background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)" }}>
          <div style={{ ...tabsWrap, justifyContent: "space-between", rowGap: 8 }}>
            <div style={tabsWrap}>
              {[
                "Upcoming",
                "Passed - Not Confirmed",
                "Complete Jobs",
                "Ready to Invoice",
                "Paid",
                "Needs Action",
                "Enquiries",
              ].map((s) => {
                const active = activeSection === s;
                return (
                  <button key={s} onClick={() => setActiveSection(s)} style={pillBtn(active)} aria-pressed={active} aria-label={`Show ${s}`}>
                    {s} <span style={{ marginLeft: 8, fontWeight: 900 }}>{counts[s]}</span>
                  </button>
                );
              })}
            </div>
            <span style={tinyHint}>Tip: Ctrl+G cycles Grid / List / Table</span>
          </div>
        </div>

        <div className="job-sheet-stat-grid" style={statGrid}>
          <div style={statCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ color: UI.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Active Section
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: UI.text, marginTop: 6 }}>{activeSection}</div>
              </div>
              <span style={iconBox()}><Columns3 size={17} /></span>
            </div>
            <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>{totalVisible} jobs match the current view</div>
          </div>
          <div style={statCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ color: UI.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Notes Filled
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: UI.text, marginTop: 6 }}>{visibleChecks.notes}</div>
              </div>
              <span style={iconBox(UI.brand, "#f8fafc", "#dbe5ef")}><Filter size={17} /></span>
            </div>
            <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Jobs with notes entered</div>
          </div>
          <div style={statCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ color: UI.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  PO Filled
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: UI.text, marginTop: 6 }}>{visibleChecks.po}</div>
              </div>
              <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}><CheckCircle2 size={17} /></span>
            </div>
            <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Jobs with PO added</div>
          </div>
          <div style={statCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ color: UI.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Quote Attached
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: UI.text, marginTop: 6 }}>{visibleChecks.quote}</div>
              </div>
              <span style={iconBox(UI.amber, UI.amberSoft, UI.amberBorder)}><CalendarDays size={17} /></span>
            </div>
            <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Jobs with an uploaded file</div>
          </div>
        </div>

        {/* Content */}
        <div style={{ marginTop: 14 }}>
          {loading ? (
            <div style={emptyWrap}>Loading jobs...</div>
          ) : !weekKeys.length ? (
            <div style={emptyWrap}>No jobs match your filters in {activeSection}.</div>
          ) : (
            weekKeys.map((mondayTS) => {
              const monday = new Date(Number(mondayTS));
              const weekJobs = weekGroups[mondayTS];
              return (
                <section key={mondayTS} style={{ marginBottom: 28 }}>
                  <div style={sectionHeader}>
                    <h2 style={weekTitle}>{formatWeekRange(monday)} ({weekJobs.length})</h2>
                    <span style={tinyHint}>
                      {new Date(Number(mondayTS)).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      {" to "}
                      {new Date(Number(mondayTS) + 6 * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </span>
                  </div>

                  {viewMode === "table" ? (
                    <Table jobs={weekJobs} section={activeSection} />
                  ) : viewMode === "grid" ? (
                    <div style={gridWrap(cols)}>
                      {weekJobs.map((job) => (
                        <Card key={job.id} job={job} section={activeSection} />
                      ))}
                    </div>
                  ) : (
                    <div style={listWrap}>
                      {weekJobs.map((job) => (
                        <Card key={job.id} job={job} section={activeSection} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
