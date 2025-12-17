"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system (matching your page)
─────────────────────────────────────────── */
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

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const h1 = { color: "#0f172a", fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };
const surface = { background: "#ffffff", borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const toolbar = {
  ...surface,
  padding: 12,
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
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

const select = { padding: "8px 10px", borderRadius: UI.radiusSm, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, minWidth: 140 };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f1f5f9", color: "#0f172a", fontSize: 12, fontWeight: 700 };

const sectionHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 2px 12px" };
const weekTitle = { fontSize: 15, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.01em" };
const tinyHint = { color: UI.muted, fontSize: 12 };

/* Table styles */
const tableWrap = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" };
const tableEl = {
  width: "100%",
  tableLayout: "fixed", // ✅ lock columns
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13.5,
};
const th = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 };
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", overflow: "hidden", textOverflow: "ellipsis" };

/* ───────────────────────────────────────────
   Helpers
─────────────────────────────────────────── */
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
  const arr = [];
  if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
    for (const d of job.bookingDates) {
      const pd = parseDate(d);
      if (pd) arr.push(pd);
    }
  } else if (job.date) {
    const pd = parseDate(job.date);
    if (pd) arr.push(pd);
  }
  return arr;
};

const isFourDigitJob = (job) => /^\d{4}$/.test(String(job.jobNumber ?? "").trim());
const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");

const getMillis = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v === "object" && "seconds" in v) return v.seconds * 1000;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
};

const dateRangeLabel = (job) => {
  const ds = normaliseDates(job).sort((a, b) => a - b);
  if (!ds.length) return "TBC";
  const first = ds[0];
  const last = ds[ds.length - 1];
  return first && last ? `${fmtShort(first)} – ${fmtShort(last)}` : fmtShort(first);
};

const isPaid = (job) => {
  const s = String(job.status || "").toLowerCase();
  const inv = String(job.invoiceStatus || "").toLowerCase();
  return s === "paid" || s === "settled" || inv.includes("paid") || !!job?.finance?.paidAt || !!job?.paidAt;
};

const getPaidOrFirstDate = (job) => {
  const ts = getMillis(job?.finance?.paidAt) ?? getMillis(job?.paidAt) ?? null;
  if (ts) return new Date(ts);

  const ds = normaliseDates(job).sort((a, b) => a - b);
  return ds[0] || null;
};

const prettifyStatus = (raw) => {
  const s = (raw || "").toLowerCase().trim();
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s === "invoiced") return "Invoiced";
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  return (
    s
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC"
  );
};

const statusColors = (label) => {
  switch (label) {
    case "Paid":
      return { bg: "#d1fae5", border: "#86efac", text: "#065f46" };
    case "Invoiced":
      return { bg: "#e0e7ff", border: "#c7d2fe", text: "#3730a3" };
    case "Ready to Invoice":
      return { bg: "#fef3c7", border: "#fde68a", text: "#92400e" };
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

const StatusCell = ({ raw }) => {
  const value = prettifyStatus(raw);
  const c = statusColors(value);
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
      {value}
    </span>
  );
};

const initialsFromName = (name) => {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
};
const crewInitials = (employees) =>
  Array.isArray(employees)
    ? employees
        .map((e) => (typeof e === "string" ? e : e?.name || e?.displayName || e?.email))
        .filter(Boolean)
        .map(initialsFromName)
        .filter(Boolean)
        .join(", ") || "—"
    : "—";

const vehiclesList = (vehicles) =>
  Array.isArray(vehicles)
    ? vehicles
        .map((v) => (typeof v === "string" ? v : v?.name || v?.registration || ""))
        .filter(Boolean)
        .join(", ") || "—"
    : "—";

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
  return `${monday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${sunday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

/* ───────────────────────────────────────────
   Page
─────────────────────────────────────────── */
export default function PaidTablePage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const searchRef = useRef(null);

  // Live data
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 4-digit only
  const jobs = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  // Paid jobs (newest paid first)
  const paidJobs = useMemo(() => {
    return jobs
      .filter(isPaid)
      .sort((a, b) => {
        const ta = getMillis(a?.finance?.paidAt) ?? getMillis(a?.paidAt) ?? 0;
        const tb = getMillis(b?.finance?.paidAt) ?? getMillis(b?.paidAt) ?? 0;
        const fa = ta || (normaliseDates(a)[0]?.getTime() || 0);
        const fb = tb || (normaliseDates(b)[0]?.getTime() || 0);
        return fb - fa;
      });
  }, [jobs]);

  // Facet & Search
  const clients = useMemo(
    () => ["all", ...Array.from(new Set(paidJobs.map((j) => j.client).filter(Boolean))).sort()],
    [paidJobs]
  );

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return paidJobs.filter((j) => {
      if (clientFilter !== "all" && (j.client || "") !== clientFilter) return false;
      if (!s) return true;
      return (
        String(j.jobNumber || "").toLowerCase().includes(s) ||
        String(j.client || "").toLowerCase().includes(s) ||
        String(j.location || "").toLowerCase().includes(s) ||
        String(j.notes || "").toLowerCase().includes(s)
      );
    });
  }, [paidJobs, clientFilter, search]);

  // Group by week (use paidAt if present)
  const { weekGroups, weekKeys, noDate } = useMemo(() => {
    const groups = {};
    const noDateArr = [];
    for (const j of filtered) {
      const when = getPaidOrFirstDate(j);
      if (!when) {
        noDateArr.push(j);
        continue;
      }
      const mondayKey = getMonday(when).getTime();
      if (!groups[mondayKey]) groups[mondayKey] = [];
      groups[mondayKey].push(j);
    }
    const keys = Object.keys(groups)
      .map(Number)
      .sort((a, b) => b - a);
    return { weekGroups: groups, weekKeys: keys, noDate: noDateArr };
  }, [filtered]);

  /* ---------- Table ---------- */
  const Table = ({ jobs }) => (
    <div style={tableWrap}>
      <table style={tableEl} aria-label="Paid jobs">
        {/* ✅ Fixed column widths so every row lines up */}
        <colgroup>
          <col style={{ width: "90px" }} /> {/* Job # */}
          <col style={{ width: "180px" }} /> {/* Client */}
          <col style={{ width: "160px" }} /> {/* Location */}
          <col style={{ width: "140px" }} /> {/* Dates */}
          <col style={{ width: "120px" }} /> {/* Employees */}
          <col style={{ width: "220px" }} /> {/* Vehicles */}
          <col style={{ width: "140px" }} /> {/* Status */}
          <col style={{ width: "90px" }} /> {/* Action */}
        </colgroup>

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
          {jobs.map((job) => (
            <tr key={job.id}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <Link href={`/job-numbers/${job.id}`} style={{ fontWeight: 800, textDecoration: "none", color: UI.text }}>
                  #{job.jobNumber || job.id}
                </Link>
              </td>

              <td style={td} title={job.client || ""}>
                {job.client || "—"}
              </td>

              <td style={td} title={job.location || ""}>
                {job.location || "—"}
              </td>

              <td style={td}>{dateRangeLabel(job)}</td>

              <td style={td} title={crewInitials(job.employees) === "—" ? "" : crewInitials(job.employees)}>
                {crewInitials(job.employees)}
              </td>

              <td style={td} title={vehiclesList(job.vehicles) === "—" ? "" : vehiclesList(job.vehicles)}>
                {vehiclesList(job.vehicles)}
              </td>

              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <StatusCell raw={job.status || "Paid"} />
                </div>
              </td>

              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <Link href={`/job-numbers/${job.id}`} style={{ textDecoration: "none", fontWeight: 800, color: UI.brand }}>
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Paid</h1>
            <div style={sub}>
              Jobs marked <strong>Paid</strong> (or finance.paidAt set). Grouped by the week they were paid (fallback: first booking date).
            </div>
          </div>
          <div style={{ ...chip }}>{loading ? "Loading…" : `${filtered.length} shown`}</div>
        </div>

        {/* Toolbar */}
        <div style={toolbar}>
          <div style={searchWrap} title="Press / to focus">
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
              ref={searchRef}
              type="text"
              placeholder="Search by job #, client, location, or notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInput}
              aria-label="Search paid jobs"
            />
          </div>

          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={select} aria-label="Filter by client">
            {clients.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Client: All" : c}
              </option>
            ))}
          </select>

          <Link href="/job-home" style={{ fontWeight: 800, color: UI.brand, textDecoration: "none", justifySelf: "end" }}>
            Home →
          </Link>
        </div>

        {/* Content grouped by week */}
        <div style={{ marginTop: 14 }}>
          {loading ? (
            <div style={{ ...surface, padding: 24, textAlign: "center", color: UI.muted }}>Loading jobs…</div>
          ) : weekKeys.length === 0 && (noDate?.length ?? 0) === 0 ? (
            <div style={{ ...surface, padding: 24, textAlign: "center", color: UI.muted }}>No paid jobs found.</div>
          ) : (
            <>
              {weekKeys.map((mondayTS) => {
                const monday = new Date(Number(mondayTS));
                const jobs = weekGroups[mondayTS] || [];
                return (
                  <section key={mondayTS} style={{ marginBottom: 28 }}>
                    <div style={sectionHeader}>
                      <h2 style={weekTitle}>
                        {formatWeekRange(monday)} ({jobs.length})
                      </h2>
                      <span style={tinyHint}>
                        {new Date(Number(mondayTS)).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        {" – "}
                        {new Date(Number(mondayTS) + 6 * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                    <Table jobs={jobs} />
                  </section>
                );
              })}

              {(noDate?.length ?? 0) > 0 && (
                <section style={{ marginTop: 8 }}>
                  <div style={sectionHeader}>
                    <h2 style={weekTitle}>No Dates ({noDate.length})</h2>
                    <span style={tinyHint}>Jobs missing paidAt and booking dates</span>
                  </div>
                  <Table jobs={noDate} />
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
