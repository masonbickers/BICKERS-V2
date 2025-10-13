"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ────────────────────────────────────────────────────────────────────────────
   Small design system (visual only; logic unchanged)
──────────────────────────────────────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 20,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#ffffffff", // page background
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
};

const pageWrap = {
  padding: "32px 24px 56px",
  background: UI.bg,
  minHeight: "100vh",
};

const headerBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 18,
};

const titleWrap = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
};

const h1 = {
  color: "#000000ff",
  fontSize: 28,
  lineHeight: 1.2,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  margin: 0,
};

const sub = { color: "#000000ff", fontSize: 14 };

const surface = {
  background: "linear-gradient(0deg, rgba(255,255,255,0.86), rgba(255,255,255,0.86)), #fff",
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const toolbar = {
  ...surface,
  padding: 14,
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
  position: "sticky",
  top: 12,
  zIndex: 2,
  backdropFilter: "saturate(180%) blur(8px)",
};

const searchWrap = {
  position: "relative",
  flex: 1,
  display: "flex",
  alignItems: "center",
};

const searchInput = {
  width: "100%",
  padding: "12px 44px 12px 40px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  background: "#fff",
};

const searchIcon = {
  position: "absolute",
  left: 12,
  width: 18,
  height: 18,
  opacity: 0.6,
};

const tabsWrap = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const tabBtn = (active) => ({
  padding: "10px 14px",
  borderRadius: UI.radiusSm,
  border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
  background: active ? UI.brandSoft : "#fff",
  color: active ? UI.brand : UI.text,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all .18s ease",
});

const tabCount = (active) => ({
  marginLeft: 8,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  color: active ? UI.brand : "#0f172a",
  background: active ? "#dbeafe" : "#eef2ff",
  border: "1px solid #e5e7eb",
});

const sectionHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  margin: "28px 2px 16px",
};

const weekTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.01em",
};

const gridWrap = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const cardBase = {
  display: "flex",
  flexDirection: "column",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  padding: 16,
  textDecoration: "none",
  color: UI.text,
  boxShadow: UI.shadowSm,
  transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
  outline: "none",
};

const cardHover = {
  transform: "translateY(-2px)",
  boxShadow: UI.shadowHover,
  borderColor: "#dbeafe",
};

const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const jobTitle = { fontWeight: 900, fontSize: 16, letterSpacing: "-0.01em" };

const label = { color: UI.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase" };

const infoGrid = {
  display: "grid",
  gridTemplateColumns: "110px 1fr",
  rowGap: 8,
  columnGap: 14,
  fontSize: 14,
  lineHeight: 1.45,
};

const emptyWrap = {
  ...surface,
  padding: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: UI.muted,
  fontSize: 14,
};

/* ────────────────────────────────────────────────────────────────────────────
   Week helpers (unchanged logic)
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
  return `${monday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })} – ${sunday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

/* ────────────────────────────────────────────────────────────────────────────
   Job prefix helper (unchanged)
──────────────────────────────────────────────────────────────────────────── */
const getJobPrefix = (job) => {
  if (!job.jobNumber) return "No Job #";
  return job.jobNumber.toString().split("-")[0];
};

/* ────────────────────────────────────────────────────────────────────────────
   Component
──────────────────────────────────────────────────────────────────────────── */
export default function JobSheetPage() {
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("Upcoming");

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

  /* ---------- Group jobs by week (unchanged) ---------- */
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
      ? d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
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

  /* ---------- Realtime listener (unchanged) ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const jobList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() || {}),
      }));
      setBookings(jobList);
    });
    return () => unsub();
  }, []);

  /* ---------- Search filter (unchanged) ---------- */
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

  /* ---------- Grouping (unchanged) ---------- */
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
      if (grouped[cat]) grouped[cat].push(job);
      else grouped["Upcoming"].push(job);
    }

    grouped.Upcoming.sort((a, b) => {
      const ad = normaliseDates(a)[0] ?? new Date(8640000000000000);
      const bd = normaliseDates(b)[0] ?? new Date(8640000000000000);
      return ad - bd;
    });

    const descMostRecent = (a, b) => {
      const ad = normaliseDates(a)[0] ?? new Date(-8640000000000000);
      const bd = normaliseDates(b)[0] ?? new Date(-8640000000000000);
      return bd - ad;
    };
    grouped["Complete Jobs"].sort(descMostRecent);
    grouped["Passed — Not Confirmed"].sort(descMostRecent);

    return grouped;
  }, [filteredBookings, todayMidnight]);

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

  /* ---------- Status badge (unchanged logic) ---------- */
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
        return { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" };
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
          fontSize: 12,
          borderRadius: 999,
          border: `1px solid ${c.border}`,
          background: c.bg,
          color: c.text,
          fontWeight: 800,
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    );
  };

  /* ---------- Card (visual only) ---------- */
  const JobCard = ({ job, section }) => (
    <Link
      href={`/job-numbers/${job.id}`}
      style={cardBase}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardBase)}
    >
      {/* Header */}
      <div style={row}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "#eef2ff",
              border: "1px solid #e5e7eb",
              fontWeight: 900,
              fontSize: 12,
              color: "#3730a3",
            }}
            title="Job prefix"
          >
            {getJobPrefix(job)}
          </span>
          <span style={jobTitle}>Job #{job.jobNumber || job.id}</span>
        </div>
        <StatusBadge job={job} section={section} />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#f1f5f9", margin: "6px 0 12px" }} />

      {/* Info grid */}
      <div style={infoGrid}>
        <span style={label}>Client</span>
        <span>{job.client || "—"}</span>

        <span style={label}>Location</span>
        <span>{job.location || "—"}</span>

        <span style={label}>Dates</span>
        <span>{getDateRangeLabel(job)}</span>

        <span style={label}>Notes</span>
        <span style={{ color: "#0f172a" }}>
          {job.notes?.trim() ? job.notes : "—"}
        </span>
      </div>
    </Link>
  );

  /* ---------- Counts per tab (visual only, logic unchanged) ---------- */
  const counts = {
    Upcoming: groups.Upcoming.length,
    "Passed — Not Confirmed": groups["Passed — Not Confirmed"].length,
    "Complete Jobs": groups["Complete Jobs"].length,
    "Ready to Invoice": groups["Ready to Invoice"].length,
    Paid: groups.Paid.length,
    "Needs Action": groups["Needs Action"].length,
    Enquiries: groups.Enquiries.length,
  };

  /* ---------- Responsive columns helper (visual only) ---------- */
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

  /* ---------- Render ---------- */
  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div style={titleWrap}>
            <h1 style={h1}>Jobs Overview</h1>
            <span style={sub}>
              Track bookings by status, week and search.
            </span>
          </div>
        </div>

        {/* Toolbar: Search + Tabs */}
        <div style={toolbar}>
          <div style={searchWrap}>
            {/* magnifier */}
            <svg viewBox="0 0 24 24" fill="none" style={searchIcon} aria-hidden>
              <path
                d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by job #, client, location, or notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInput}
            />
          </div>

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
                <button
                  key={s}
                  onClick={() => setActiveSection(s)}
                  style={tabBtn(active)}
                >
                  {s}
                  <span style={tabCount(active)}>{counts[s]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ marginTop: 18 }}>
          {/* All filters except Enquiries: week-split */}
          {activeSection !== "Enquiries" &&
            (() => {
              const groupedWeeks = groupJobsByWeek(groups[activeSection] || []);
              const weekKeys = Object.keys(groupedWeeks).sort((a, b) =>
                activeSection === "Upcoming" ? a - b : b - a
              );

              if (!weekKeys.length) {
                return (
                  <div style={emptyWrap}>
                    No jobs in “{activeSection}” yet.
                  </div>
                );
              }

              return weekKeys.map((mondayTS) => {
                const monday = new Date(Number(mondayTS));
                const weekJobs = groupedWeeks[mondayTS];
                return (
                  <section key={mondayTS} style={{ marginBottom: 34 }}>
                    <div style={sectionHeader}>
                      <h2 style={weekTitle}>
                        {formatWeekRange(monday)} ({weekJobs.length})
                      </h2>
                    </div>
                    <div style={gridWrap(cols)}>
                      {weekJobs.map((job) => (
                        <JobCard key={job.id} job={job} section={activeSection} />
                      ))}
                    </div>
                  </section>
                );
              });
            })()}

          {/* Enquiries: simple grid */}
          {activeSection === "Enquiries" && (
            <>
              {groups.Enquiries?.length ? (
                <div style={gridWrap(cols)}>
                  {groups.Enquiries.map((job) => (
                    <JobCard key={job.id} job={job} section="Enquiries" />
                  ))}
                </div>
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
