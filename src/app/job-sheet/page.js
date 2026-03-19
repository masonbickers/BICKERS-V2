"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system (visual only)
─────────────────────────────────────────── */
const UI = {
  radius: 16,
  radiusSm: 10,
  gap: 14,
  shadowSm: "0 10px 26px rgba(15,23,42,0.06)",
  shadowHover: "0 16px 34px rgba(15,23,42,0.1)",
  border: "1px solid #dbe2ea",
  bg: "#eef3f7",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#183f67",
  brandSoft: "#edf2f7",
};

const pageWrap = { padding: "18px 16px 28px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" };
const h1 = { color: "#0f172a", fontSize: 28, lineHeight: 1.08, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 };
const sub = { color: UI.muted, fontSize: 12.5, lineHeight: 1.4, marginTop: 4 };
const surface = { background: "#ffffff", borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const toolbar = {
  ...surface,
  padding: 12,
  display: "grid",
  gridTemplateColumns: "1fr auto auto auto auto auto auto auto auto auto",
  gap: 8,
  alignItems: "center",
  position: "sticky",
  top: 12,
  zIndex: 2,
  backdropFilter: "saturate(180%) blur(6px)",
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
};

const searchWrap = { position: "relative", display: "flex", alignItems: "center" };
const searchInput = { width: "100%", padding: "9px 42px 9px 34px", borderRadius: UI.radiusSm, border: "1px solid #d6dee8", fontSize: 13.5, outline: "none", background: "#fff" };
const searchIcon = { position: "absolute", left: 10, width: 18, height: 18, opacity: 0.6 };

const pillBtn = (active = false) => ({
  padding: "7px 11px",
  borderRadius: 999,
  border: active ? `1px solid ${UI.brand}` : "1px solid #d6dee8",
  background: active ? UI.brandSoft : "#fff",
  color: active ? UI.brand : UI.text,
  fontSize: 11.5,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: active ? "0 8px 18px rgba(24,63,103,0.12)" : "none",
});

const tabsWrap = { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" };
const select = { padding: "7px 10px", borderRadius: UI.radiusSm, border: "1px solid #d6dee8", background: "#fff", fontSize: 12.5, minWidth: 140 };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid #cad6e2", background: UI.brandSoft, color: UI.brand, fontSize: 11.5, fontWeight: 800 };

const sectionHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "18px 2px 10px", flexWrap: "wrap" };
const weekTitle = { fontSize: 15, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.01em" };
const tinyHint = { color: UI.muted, fontSize: 12 };
const emptyWrap = { ...surface, padding: 20, display: "flex", alignItems: "center", justifyContent: "center", color: UI.muted, fontSize: 13.5 };
const gridWrap = (cols = 4) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: UI.gap });
const listWrap = { display: "grid", gap: 10 };

/* ───────────────────────────────────────────
   Week helpers
─────────────────────────────────────────── */
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
  return `${monday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${sunday.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
}

/* ───────────────────────────────────────────
   Date + job helpers
─────────────────────────────────────────── */
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

/* ───────────────────────────────────────────
   Classification (your original rules)
─────────────────────────────────────────── */
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

  return "Passed — Not Confirmed";
};

/* ───────────────────────────────────────────
   Status badge helpers (show ACTUAL status in Complete Jobs)
─────────────────────────────────────────── */
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

  // Otherwise: title-case whatever it is (keep it “actual”)
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
      return { bg: "#fef3c7", border: "#fde68a", text: "#92400e" };
    case "Invoiced":
      return { bg: "#e0e7ff", border: "#c7d2fe", text: "#3730a3" };
    case "Paid":
      return { bg: "#d1fae5", border: "#86efac", text: "#065f46" };
    case "Action Required":
      return { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" };
    case "Complete":
            return { bg: "#97f59bff", border: "#419e50ff", text: "#10301aff" };
    case "Confirmed":
      return { bg: "#fffd98ff", border: "#c7d134ff", text: "#504c1aff" };
    case "First Pencil":
      return { bg: "#78b8ecff", border: "#2c28ffff", text: "#001affff" };
    case "Second Pencil":
      return { bg: "#fd9a9aff", border: "#f33131ff", text: "#8b1212ff" };
    case "TBC":
      return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };
    default:
      return { bg: "#acacacff", border: "#3f3f3fff", text: "#000000ff" };
  }
};

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

/* ───────────────────────────────────────────
   Table styles
─────────────────────────────────────────── */
const tableWrap = { overflow: "auto", border: "1px solid #dde5ee", borderRadius: 12, background: "#fff", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #dde5ee", position: "sticky", top: 0, background: "#f7f9fc", zIndex: 1, fontSize: 12, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.04em" };
const td = { padding: "9px 12px", borderBottom: "1px solid #edf2f7", verticalAlign: "top" };

/* ───────────────────────────────────────────
   Page
─────────────────────────────────────────── */
export default function JobSheetPage() {
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
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const jobList = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      setBookings(jobList);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "vehicles"), (snapshot) => {
      setVehiclesData(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    });
    return () => unsub();
  }, []);

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

  const resolveVehicleNames = (job) => {
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
  };

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
      "Passed — Not Confirmed": [],
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
    applySort(grouped["Passed — Not Confirmed"]);
    applySort(grouped["Ready to Invoice"]);
    applySort(grouped.Paid);
    applySort(grouped["Needs Action"]);
    applySort(grouped.Enquiries);

    return grouped;
  }, [searched, todayMidnight, sortBy]);

  /* ---------- Build facets from the ACTIVE section ---------- */
  const activeItemsBase = groups[activeSection] || [];

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
  }, [activeItemsBase, activeSection, vehiclesData]);

  /* ---------- Status filter helper ---------- */
  const statusMatches = (job) => {
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
  };

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
  }, [activeItemsBase, statusFilter, clientFilter, vehicleFilter, equipmentFilter, employeeFilter, todayMidnight, vehiclesData]);

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
    "Passed — Not Confirmed": (groups["Passed — Not Confirmed"] || []).length,
    "Complete Jobs": (groups["Complete Jobs"] || []).length,
    "Ready to Invoice": (groups["Ready to Invoice"] || []).length,
    Paid: (groups.Paid || []).length,
    "Needs Action": (groups["Needs Action"] || []).length,
    Enquiries: (groups.Enquiries || []).length,
  };

  const totalVisible = activeItemsFiltered.length;

  /* ---------- Mark complete (optimistic update) ---------- */
  const markComplete = async (job) => {
    const prev = job.status;
    setBookings((old) => old.map((j) => (j.id === job.id ? { ...j, status: "complete", completedAt: new Date() } : j)));
    try {
      await updateDoc(doc(db, "bookings", job.id), { status: "complete", completedAt: serverTimestamp() });
    } catch (e) {
      setBookings((old) => old.map((j) => (j.id === job.id ? { ...j, status: prev } : j)));
      alert("Couldn’t mark complete. Please try again.");
    }
  };

  /* ---------- Card (cozy/compact) + Ultra strip ---------- */
  const Card = ({ job, section }) => {
    const denseNow = density === "compact";
    const ultra = density === "ultra";

    const team =
      Array.isArray(job.employees) && job.employees.length
        ? job.employees.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean).join(", ")
        : "—";
    const vehicles = resolveVehicleNames(job).length ? resolveVehicleNames(job).join(", ") : "—";
    const equipment = resolveEquipmentNames(job).length ? resolveEquipmentNames(job).join(", ") : "—";

    const prefix = getJobPrefix(job);
    const range = dateRangeLabel(job);
    const statusBadge = <StatusBadge job={job} section={section} />;

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
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            background: "#fff",
            textDecoration: "none",
            color: "#0f172a",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            transition: "transform .12s ease, box-shadow .12s ease, border-color .12s ease",
          }}
        >
          <div style={{ display: "flex", minWidth: 0, gap: 8, alignItems: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13.5 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 20, minWidth: 26, padding: "0 6px", borderRadius: 6, background: "#eef2ff", border: "1px solid #e5e7eb", fontWeight: 800, fontSize: 11, color: "#3730a3" }}>
              {prefix}
            </span>
            <span style={{ fontWeight: 900, fontSize: 13.5 }}>#{job.jobNumber || job.id}</span>
            <span style={{ opacity: 0.45 }}>•</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{job.client || "—"}</span>
            <span style={{ opacity: 0.45 }}>•</span>
            <span style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis" }}>{job.location || "—"}</span>
            <span style={{ opacity: 0.45 }}>•</span>
            <span style={{ opacity: 0.7 }}>{range}</span>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {statusBadge}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                markComplete(job);
              }}
              style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #d1d5db", background: "#ffffff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
              title="Mark complete"
            >
              Mark complete
            </button>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
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
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: denseNow ? 10 : 12,
      gap: denseNow ? 6 : 8,
      textDecoration: "none",
      color: "#0f172a",
      boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
      transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
      outline: "none",
    };

    return (
      <Link
        href={`/job-numbers/${job.id}`}
        style={baseCard}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, { transform: "translateY(-1px)", boxShadow: UI.shadowHover, borderColor: "#dbeafe" })}
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
            <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Job #{job.jobNumber || job.id}
            </span>
          </div>
          {statusBadge}
        </div>

        <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0 8px" }} />

        {/* Info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: denseNow ? 4 : 6, columnGap: denseNow ? 8 : 10, fontSize: 13.5, lineHeight: 1.32 }}>
          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Client</span>
          <span>{job.client || "—"}</span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Location</span>
          <span>{job.location || "—"}</span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Dates</span>
          <span>{range}</span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Employees</span>
          <span>
            {Array.isArray(job.employees) && job.employees.length
              ? job.employees.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean).join(", ")
              : "—"}
          </span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Vehicles</span>
          <span>{resolveVehicleNames(job).length ? resolveVehicleNames(job).join(", ") : "—"}</span>

          <span style={{ color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" }}>Equipment</span>
          <span>{equipment}</span>
        </div>


          <span style={{ color: "#94a3b8", fontSize: 11, letterSpacing: ".02em" }}>View →</span>
        
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
            <th style={th}>Status</th>
            <th style={th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const team =
              Array.isArray(job.employees) && job.employees.length
                ? job.employees.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean).join(", ")
                : "—";
            const vehicles = resolveVehicleNames(job).length ? resolveVehicleNames(job).join(", ") : "—";

            return (
              <tr key={job.id}>
                <td style={td}>
                  <Link href={`/job-numbers/${job.id}`} style={{ fontWeight: 800, textDecoration: "none", color: UI.text }}>
                    #{job.jobNumber || job.id}
                  </Link>
                </td>
                <td style={td}>{job.client || "—"}</td>
                <td style={td}>{job.location || "—"}</td>
                <td style={td}>{dateRangeLabel(job)}</td>
                <td style={td}>{team}</td>
                <td style={td}>{vehicles}</td>
                <td style={td}>
                  <StatusBadge job={job} section={section} />
                </td>
                <td style={td}>
 
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
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Jobs Overview (4-digit jobs)</h1>
            <div style={sub}>Only showing bookings with a 4-digit job #. Week dividers + filters. “Complete Jobs” shows actual status.</div>
          </div>
          <div style={{ ...chip, alignSelf: "center" }}>{loading ? "Loading…" : `${totalVisible} shown`}</div>
        </div>

        {/* Toolbar */}
        <div style={toolbar}>
          {/* Search */}
          <div style={searchWrap} title="Press / to focus">
            <svg viewBox="0 0 24 24" fill="none" style={searchIcon} aria-hidden>
              <path d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by job #, client, location, or notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInput}
              aria-label="Search jobs"
            />
          </div>

          {/* View toggle (3-way) */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setViewMode("grid")} style={pillBtn(viewMode === "grid")} aria-pressed={viewMode === "grid"}>Grid</button>
            <button onClick={() => setViewMode("list")} style={pillBtn(viewMode === "list")} aria-pressed={viewMode === "list"}>List</button>
            <button onClick={() => setViewMode("table")} style={pillBtn(viewMode === "table")} aria-pressed={viewMode === "table"}>Table</button>
          </div>

          {/* Density + Sort */}
          <div style={{ display: "flex", gap: 8 }}>
            <select value={density} onChange={(e) => setDensity(e.target.value)} style={select} aria-label="Density">
              <option value="cozy">Cozy</option>
              <option value="compact">Compact</option>
              <option value="ultra">Ultra</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={select} aria-label="Sort by">
              <option value="dateAsc">Date ↑ (first)</option>
              <option value="dateDesc">Date ↓ (recent)</option>
              <option value="client">Client A–Z</option>
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

          <button onClick={clearFilters} style={pillBtn(false)} aria-label="Clear filters">Clear</button>
        </div>

        {/* Tabs */}
        <div style={{ ...surface, marginTop: 12, padding: 10, background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)" }}>
          <div style={{ ...tabsWrap, justifyContent: "space-between", rowGap: 8 }}>
            <div style={tabsWrap}>
              {[
                "Upcoming",
                "Passed — Not Confirmed",
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
            <span style={tinyHint}>Tip: ⌘/Ctrl+G cycles Grid → List → Table</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ marginTop: 14 }}>
          {loading ? (
            <div style={emptyWrap}>Loading jobs…</div>
          ) : !weekKeys.length ? (
            <div style={emptyWrap}>No jobs match your filters in “{activeSection}”.</div>
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
                      {" – "}
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
