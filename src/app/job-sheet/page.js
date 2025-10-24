"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ────────────────────────────────────────────────────────────────────────────
   Mini design system (visual only)
──────────────────────────────────────────────────────────────────────────── */
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
  marginBottom: 12,
};

const h1 = {
  color: "#0f172a",
  fontSize: 26,
  lineHeight: 1.15,
  fontWeight: 900,
  letterSpacing: "-0.01em",
  margin: 0,
};

const sub = { color: UI.muted, fontSize: 13 };

const surface = {
  background: "#ffffff",
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const toolbar = {
  ...surface,
  padding: 12,
  display: "grid",
  gridTemplateColumns: "1fr auto auto auto",
  gap: 10,
  alignItems: "center",
  position: "sticky",
  top: 12,
  zIndex: 2,
  backdropFilter: "saturate(180%) blur(6px)",
};

const searchWrap = { position: "relative", display: "flex", alignItems: "center" };
const searchInput = {
  width: "100%",
  padding: "10px 44px 10px 36px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  background: "#fff",
};
const searchIcon = { position: "absolute", left: 10, width: 18, height: 18, opacity: 0.6 };

const pillBtn = (active) => ({
  padding: "8px 12px",
  borderRadius: 999,
  border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
  background: active ? UI.brandSoft : "#fff",
  color: active ? UI.brand : UI.text,
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
});

const tabsWrap = { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" };

const select = {
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 13,
};

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
};

const sectionHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  margin: "22px 2px 12px",
};

const weekTitle = { fontSize: 15, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.01em" };

const gridWrap = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const listWrap = { display: "grid", gap: 10 };

const cardBase = (dense) => ({
  display: "flex",
  flexDirection: "column",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  padding: dense ? 12 : 16,
  textDecoration: "none",
  color: UI.text,
  boxShadow: UI.shadowSm,
  transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
  outline: "none",
});
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: "#dbeafe" };

const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 };
const jobTitle = { fontWeight: 900, fontSize: 15, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const label = { color: UI.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase" };

const infoGrid = (dense) => ({
  display: "grid",
  gridTemplateColumns: dense ? "90px 1fr" : "110px 1fr",
  rowGap: 6,
  columnGap: 14,
  fontSize: 13,
  lineHeight: 1.45,
});

const emptyWrap = { ...surface, padding: 24, display: "flex", alignItems: "center", justifyContent: "center", color: UI.muted, fontSize: 14 };

const divider = { height: 1, background: "#f1f5f9", margin: "6px 0 10px" };

const tinyHint = { color: UI.muted, fontSize: 12 };

/* ────────────────────────────────────────────────────────────────────────────
   Week helpers (unchanged)
──────────────────────────────────────────────────────────────────────────── */
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

/* ────────────────────────────────────────────────────────────────────────────
   Job prefix helper (unchanged)
──────────────────────────────────────────────────────────────────────────── */
const getJobPrefix = (job) => (job.jobNumber ? job.jobNumber.toString().split("-")[0] : "No Job #");

/* ────────────────────────────────────────────────────────────────────────────
   Component
──────────────────────────────────────────────────────────────────────────── */
export default function JobSheetPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("Upcoming");
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [density, setDensity] = useState("cozy"); // "cozy" | "compact"
  const [sortBy, setSortBy] = useState("dateAsc"); // dateAsc | dateDesc | client | job

  const searchRef = useRef(null);

  /* ---------- Date helpers (unchanged) ---------- */
  const parseDate = (raw) => {
    if (!raw) return null;
    try {
      if (typeof raw?.toDate === "function") return raw.toDate();
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

  const formatDate = (d) =>
    d
      ? d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
      : "TBC";

  const getDateRangeLabel = (job) => {
    const ds = normaliseDates(job).sort((a, b) => a - b);
    if (!ds.length) return "TBC";
    return ds.map((d) => formatDate(d)).join(", ");
  };

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  /* ---------- Classification (unchanged) ---------- */
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

  const classify = (job) => {
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

  /* ---------- Realtime listener ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const jobList = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      setBookings(jobList);
      setLoading(false);
    });
    return () => unsub();
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
        setViewMode((v) => (v === "grid" ? "list" : "grid"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- Search filter (unchanged logic) ---------- */
  const filteredBookings = useMemo(() => {
    if (!search) return bookings;
    const s = search.toLowerCase();
    return bookings.filter(
      (job) =>
        (job.jobNumber || "").toString().toLowerCase().includes(s) ||
        (job.client || "").toLowerCase().includes(s) ||
        (job.location || "").toLowerCase().includes(s) ||
        (job.notes || "").toLowerCase().includes(s)
    );
  }, [bookings, search]);

  /* ---------- Grouping (unchanged logic, with sorting option) ---------- */
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

    for (const job of filteredBookings) {
      const cat = classify(job);
      (grouped[cat] ?? grouped.Upcoming).push(job);
    }

    // Sorting helpers
    const firstDate = (j) => normaliseDates(j)[0] ?? null;
    const sorters = {
      dateAsc: (a, b) => (firstDate(a)?.getTime() ?? Infinity) - (firstDate(b)?.getTime() ?? Infinity),
      dateDesc: (a, b) => (firstDate(b)?.getTime() ?? -Infinity) - (firstDate(a)?.getTime() ?? -Infinity),
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
  }, [filteredBookings, todayMidnight, sortBy]);

  const completeJobsByWeek = useMemo(() => {
    const byWeek = {};
    for (const job of groups["Complete Jobs"]) {
      const ds = normaliseDates(job).sort((a, b) => a - b);
      if (!ds.length) continue;
      const mondayKey = getMonday(ds[0]).getTime();
      if (!byWeek[mondayKey]) byWeek[mondayKey] = [];
      byWeek[mondayKey].push(job);
    }
    return byWeek;
  }, [groups]);

  /* ---------- Status badge ---------- */
  const displayStatusForSection = (job, section) => {
    const raw = (job.status || "").toString().trim().toLowerCase();

    if (section === "Complete Jobs") {
      if (/ready\s*to\s*invoice/.test(raw)) return "Ready to Invoice";
      if (raw === "invoiced") return "Invoiced";
      if (raw === "paid" || raw === "settled") return "Paid";
      if (raw === "complete" || raw === "completed") return "Complete";
      if (raw.includes("action")) return "Action Required";
      return "Complete";
    }

    if (/ready\s*to\s*invoice/.test(raw)) return "Ready to Invoice";
    if (raw === "invoiced") return "Invoiced";
    if (raw === "paid" || raw === "settled") return "Paid";
    if (raw === "complete" || raw === "completed") return "Complete";
    if (raw.includes("action")) return "Action Required";
    if (raw === "confirmed") return "Confirmed";
    if (raw === "first pencil") return "First Pencil";
    if (raw === "second pencil") return "Second Pencil";
    return raw ? raw[0].toUpperCase() + raw.slice(1) : "TBC";
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
      case "Confirmed":
        return { bg: "#cffafe", border: "#67e8f9", text: "#0e7490" };
      case "First Pencil":
        return { bg: "#f3e8ff", border: "#e9d5ff", text: "#6d28d9" };
      case "Second Pencil":
        return { bg: "#fae8ff", border: "#f5d0fe", text: "#a21caf" };
      case "TBC":
        return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };
      default:
        return { bg: "#fef9c3", border: "#fef08a", text: "#854d0e" };
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

// Ultra row styles
const ultraCard = {
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
};
const ultraHover = {
  transform: "translateY(-1px)",
  boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
  borderColor: "#dbeafe",
};

const ultraMainLine = {
  display: "flex",
  minWidth: 0,
  gap: 8,
  alignItems: "center",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontSize: 13.5,
};

const ultraPrefix = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 20,
  minWidth: 26,
  padding: "0 6px",
  borderRadius: 6,
  background: "#eef2ff",
  border: "1px solid #e5e7eb",
  fontWeight: 800,
  fontSize: 11,
  color: "#3730a3",
};

const ultraJob = { fontWeight: 900, fontSize: 13.5 };
const ultraSep = { opacity: 0.45 };
const ultraFaint = { opacity: 0.7 };

const ultraRight = { display: "flex", gap: 6, alignItems: "center" };

const ultraChip = {
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 11.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const ultraNotesBtn = {
  padding: "2px 8px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  fontSize: 11.5,
  fontWeight: 800,
  cursor: "pointer",
};

const ultraNotesPanel = {
  gridColumn: "1 / -1",
  marginTop: 6,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  borderRadius: 8,
  padding: 8,
  fontSize: 12.5,
  lineHeight: 1.32,
};


/* ---------- Styles used by the compact JobCard ---------- */
const divider = { height: 1, background: "#f1f5f9", margin: "4px 0 8px" };

const cardBase = (dense = false) => ({
  display: "flex",
  flexDirection: "column",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: dense ? 10 : 12,              // tighter
  gap: dense ? 6 : 8,                    // tighter
  textDecoration: "none",
  color: "#0f172a",
  boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
  transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
  outline: "none",
});

const cardHover = {
  transform: "translateY(-1px)",
  boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
  borderColor: "#dbeafe",
};

const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 6,                        // tighter
};

const jobTitle = { fontWeight: 900, fontSize: 15, letterSpacing: "-0.01em" };

const label = { color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" };

const infoGrid = (dense = false) => ({
  display: "grid",
  gridTemplateColumns: "100px 1fr",
  rowGap: dense ? 4 : 6,                  // tighter
  columnGap: dense ? 8 : 10,              // tighter
  fontSize: 13.5,
  lineHeight: 1.32,                       // tighter
});

const tinyHint = { color: "#94a3b8", fontSize: 11, letterSpacing: ".02em" };
/* ---------- Card (cozy/compact) + Ultra strip ---------- */
const JobCard = ({ job, section, dense = true, ultra = false }) => {
  const [showNotes, setShowNotes] = useState(false);

  const team =
    Array.isArray(job.employees) && job.employees.length
      ? job.employees.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean).join(", ")
      : "—";

  const vehicles =
    Array.isArray(job.vehicles) && job.vehicles.length ? job.vehicles.join(", ") : "—";

  const hasNotes = !!(job.notes && String(job.notes).trim());
  const statusBadge = <StatusBadge job={job} section={section} />;
  const prefix = getJobPrefix(job);
  const range = getDateRangeLabel(job);

  if (ultra) {
    // ULTRA-COMPACT STRIP
    return (
      <Link
        href={`/job-numbers/${job.id}`}
        style={ultraCard}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, ultraHover)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, ultraCard)}
        aria-label={`Open job ${job.jobNumber || job.id}`}
      >
        <div style={ultraMainLine} title={`${job.client || ""} • ${job.location || ""} • ${range}`}>
          <span style={ultraPrefix}>{prefix}</span>
          <span style={ultraJob}>#{job.jobNumber || job.id}</span>
          <span style={ultraSep}>•</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{job.client || "—"}</span>
          <span style={ultraSep}>•</span>
          <span style={{ ...ultraFaint, overflow: "hidden", textOverflow: "ellipsis" }}>
            {job.location || "—"}
          </span>
          <span style={ultraSep}>•</span>
          <span style={ultraFaint}>{range}</span>
        </div>

        <div style={ultraRight}>
          {statusBadge}
          {hasNotes && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowNotes((v) => !v);
              }}
              aria-expanded={showNotes}
              style={ultraNotesBtn}
              title="Show notes"
            >
              {showNotes ? "Hide notes" : "Notes"}
            </button>
          )}
        </div>

        {showNotes && (
          <div role="region" aria-label="Job notes" style={ultraNotesPanel}>
            {String(job.notes).trim()}
          </div>
        )}

        {/* second inline line for staff/vehicles, still tight */}
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          <span style={ultraChip}>👥 {team}</span>
          <span style={ultraChip}>🚗 {vehicles}</span>
        </div>
      </Link>
    );
  }

  // COZY / COMPACT (your existing compact card)
  const divider = { height: 1, background: "#f1f5f9", margin: "4px 0 8px" };
  const cardBase = (d = false) => ({
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: d ? 10 : 12,
    gap: d ? 6 : 8,
    textDecoration: "none",
    color: "#0f172a",
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
    outline: "none",
  });
  const cardHover = {
    transform: "translateY(-1px)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
    borderColor: "#dbeafe",
  };
  const row = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  };
  const jobTitle = { fontWeight: 900, fontSize: 15, letterSpacing: "-0.01em" };
  const label = { color: "#64748b", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase" };
  const infoGrid = (d = false) => ({
    display: "grid",
    gridTemplateColumns: "100px 1fr",
    rowGap: d ? 4 : 6,
    columnGap: d ? 8 : 10,
    fontSize: 13.5,
    lineHeight: 1.32,
  });
  const tinyHint = { color: "#94a3b8", fontSize: 11, letterSpacing: ".02em" };

  return (
    <Link
      href={`/job-numbers/${job.id}`}
      style={cardBase(dense)}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardBase(dense))}
      aria-label={`Open job ${job.jobNumber || job.id}`}
    >
      {/* Header */}
      <div style={row}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span
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
            title="Job prefix"
          >
            {prefix}
          </span>
          <span style={jobTitle}>Job #{job.jobNumber || job.id}</span>
        </div>
        {statusBadge}
      </div>

      <div style={divider} />

      {/* Info grid with Employees + Vehicles */}
      <div style={infoGrid(dense)}>
        <span style={label}>Client</span>
        <span>{job.client || "—"}</span>

        <span style={label}>Location</span>
        <span>{job.location || "—"}</span>

        <span style={label}>Dates</span>
        <span>{range}</span>

        <span style={label}>Employees</span>
        <span>{team}</span>

        <span style={label}>Vehicles</span>
        <span>{vehicles}</span>
      </div>

      {/* Notes toggle (only if notes exist) */}
      {hasNotes && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowNotes((v) => !v);
            }}
            aria-expanded={showNotes}
            style={{
              padding: "5px 8px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {showNotes ? "Hide notes" : "Show notes"}
          </button>

          {showNotes && (
            <div
              role="region"
              aria-label="Job notes"
              style={{
                marginTop: 6,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                borderRadius: 8,
                padding: 8,
                fontSize: 13,
                color: "#0f172a",
                lineHeight: 1.32,
              }}
            >
              {String(job.notes).trim()}
            </div>
          )}
        </div>
      )}

      {/* subtle footer */}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={tinyHint}>Press ⏎ to open</span>
        <span style={{ ...tinyHint, fontWeight: 800 }}>View →</span>
      </div>
    </Link>
  );
};


  /* ---------- Counts per tab ---------- */
  const counts = {
    Upcoming: groups.Upcoming.length,
    "Passed — Not Confirmed": groups["Passed — Not Confirmed"].length,
    "Complete Jobs": groups["Complete Jobs"].length,
    "Ready to Invoice": groups["Ready to Invoice"].length,
    Paid: groups.Paid.length,
    "Needs Action": groups["Needs Action"].length,
    Enquiries: groups.Enquiries.length,
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

  /* ---------- Quick week jump ---------- */
  const jumpTo = (offsetWeeks) => {
    setActiveSection("Upcoming");
    // Just a hint; logic unchanged. You can later wire this to a calendar scroll.
  };

  /* ---------- Render ---------- */
  const totalVisible = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Jobs Overview</h1>
            <div style={sub}>Find, sort and review bookings quickly.</div>
          </div>
          <div style={{ ...chip, alignSelf: "center" }}>{loading ? "Loading…" : `${totalVisible} jobs`}</div>
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

          {/* View toggle */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setViewMode("grid")}
              style={pillBtn(viewMode === "grid")}
              aria-pressed={viewMode === "grid"}
              aria-label="Grid view"
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              style={pillBtn(viewMode === "list")}
              aria-pressed={viewMode === "list"}
              aria-label="List view"
            >
              List
            </button>
          </div>

          {/* Density + Sort */}
          <div style={{ display: "flex", gap: 8 }}>
            <select value={density} onChange={(e) => setDensity(e.target.value)} style={select} aria-label="Density">
              <option value="cozy">Cozy</option>
              <option value="compact">Compact</option>
                <option value="ultra">Ultra</option> {/* NEW */}

            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={select} aria-label="Sort by">
              <option value="dateAsc">Date ↑ (first)</option>
              <option value="dateDesc">Date ↓ (recent)</option>
              <option value="client">Client A–Z</option>
              <option value="job">Job #</option>
            </select>
          </div>

          {/* Quick weeks (UX hint) */}
          <div style={{ display: "flex", gap: 6 }}>
            <button style={pillBtn(false)} onClick={() => jumpTo(0)}>This week</button>
            <button style={pillBtn(false)} onClick={() => jumpTo(1)}>Next week</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ ...surface, marginTop: 12, padding: 10 }}>
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
            <span style={tinyHint}>Tip: ⌘/Ctrl + G toggles grid/list</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ marginTop: 14 }}>
          {/* Non-enquiries: grouped by week */}
          {activeSection !== "Enquiries" &&
            (() => {
              const items = groups[activeSection] || [];
              const groupedWeeks = groupJobsByWeek(items);
              const weekKeys = Object.keys(groupedWeeks).sort((a, b) => (activeSection === "Upcoming" ? a - b : b - a));

              if (loading) {
                return (
                  <div style={emptyWrap}>
                    Loading jobs…
                  </div>
                );
              }

              if (!weekKeys.length) {
                return <div style={emptyWrap}>No jobs in “{activeSection}” yet.</div>;
              }

              const dense = density === "compact";
              const ultra = density === "ultra";

              
              const bodyWrap = viewMode === "grid" ? (c) => <div style={gridWrap(cols)}>{c}</div> : (c) => <div style={listWrap}>{c}</div>;

              return weekKeys.map((mondayTS) => {
                const monday = new Date(Number(mondayTS));
                const weekJobs = groupedWeeks[mondayTS];
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

                    {bodyWrap(
                      weekJobs.map((job) => <JobCard key={job.id} job={job} section={activeSection} dense={dense}   ultra={ultra}     />)
                    )}
                  </section>
                );
              });
            })()}

          {/* Enquiries: simple grid/list */}
          {activeSection === "Enquiries" && (
            <>
              {loading ? (
                <div style={emptyWrap}>Loading enquiries…</div>
              ) : groups.Enquiries?.length ? (
                viewMode === "grid" ? (
                  <div style={gridWrap(cols)}>
                    {groups.Enquiries.map((job) => (
                      <JobCard key={job.id} job={job} section="Enquiries" dense={density === "compact"} />
                    ))}
                  </div>
                ) : (
                  <div style={listWrap}>
                    {groups.Enquiries.map((job) => (
                      <JobCard key={job.id} job={job} section="Enquiries" dense={density === "compact"} />
                    ))}
                  </div>
                )
              ) : (
                <div style={emptyWrap}>No enquiries yet.</div>
              )}
            </>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
