"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* Mini design */
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
};
const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const select = { padding: "8px 10px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, minWidth: 150 };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f1f5f9", color: UI.text, fontSize: 12, fontWeight: 700 };

const tableWrap = { ...surface, overflow: "auto" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 };
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };

const sectionHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 2px 10px" };
const weekTitle = { fontSize: 15, fontWeight: 900, color: UI.text, letterSpacing: "-0.01em" };
const tinyHint = { color: UI.muted, fontSize: 12 };

/* Helpers */
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
const isPaid = (job) => {
  const s = String(job.status || "").toLowerCase();
  const inv = String(job.invoiceStatus || "").toLowerCase();
  return s === "paid" || s === "settled" || inv.includes("paid");
};
const prettifyStatus = (raw) => {
  const s = (raw || "").toLowerCase().trim();
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  return s ? s[0].toUpperCase() + s.slice(1) : "TBC";
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

const StatusBadge = ({ value }) => {
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

/* Week helpers (Mon–Sun) */
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${sunday.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
}

export default function ReviewQueuePage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const jobs4 = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  const beforeToday = (j) => {
    const ds = normaliseDates(j).sort((a, b) => a - b);
    if (!ds.length) return false;
    const last = ds[ds.length - 1];
    const lastMid = new Date(last);
    lastMid.setHours(0, 0, 0, 0);
    return lastMid.getTime() < todayMidnight.getTime();
  };

  // Review queue rule:
  // (Confirmed/Complete and finished) OR (status = Ready to Invoice)
  // AND not paid
  const queue = useMemo(() => {
    return jobs4
      .filter((j) => {
        const s = String(j.status || "").toLowerCase();
        const ready = /ready\s*to\s*invoice/.test(s);
        const completeish = s === "confirmed" || s === "complete" || s === "completed";
        return ((completeish && beforeToday(j)) || ready) && !isPaid(j);
      })
      .sort((a, b) => {
        const da = normaliseDates(a).sort((x, y) => y - x)[0]?.getTime() || 0;
        const db = normaliseDates(b).sort((x, y) => y - x)[0]?.getTime() || 0;
        return db - da;
      });
  }, [jobs4, todayMidnight]);

  // Facet
  const clients = useMemo(
    () => ["all", ...Array.from(new Set(queue.map((j) => j.client).filter(Boolean))).sort()],
    [queue]
  );

  // Filter + search
  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return queue.filter((j) => {
      if (clientFilter !== "all" && (j.client || "") !== clientFilter) return false;
      if (!s) return true;
      return (
        String(j.jobNumber || "").toLowerCase().includes(s) ||
        String(j.client || "").toLowerCase().includes(s) ||
        String(j.location || "").toLowerCase().includes(s) ||
        String(j.notes || "").toLowerCase().includes(s)
      );
    });
  }, [queue, clientFilter, search]);

  /* ---------- Group by week (Mon–Sun) ---------- */
  const { weekGroups, weekKeys, noDate } = useMemo(() => {
    const groups = {};
    const noDateJobs = [];
    for (const j of filtered) {
      const ds = normaliseDates(j).sort((a, b) => a - b);
      if (!ds.length) {
        noDateJobs.push(j);
        continue;
      }
      const mondayKey = getMonday(ds[0]).getTime();
      if (!groups[mondayKey]) groups[mondayKey] = [];
      groups[mondayKey].push(j);
    }
    const keys = Object.keys(groups)
      .map((k) => Number(k))
      .sort((a, b) => b - a); // most recent week first
    return { weekGroups: groups, weekKeys: keys, noDate: noDateJobs };
  }, [filtered]);

  const DatesCell = ({ job }) => {
    const ds = normaliseDates(job).sort((a, b) => a - b);
    const first = ds[0] ?? null;
    const last = ds[ds.length - 1] ?? null;
    const label = first && last ? `${fmtShort(first)} – ${fmtShort(last)}` : first ? fmtShort(first) : "TBC";
    return <>{label}</>;
  };

  const SectionTable = ({ jobs, title, sub }) => (
    <section style={{ marginBottom: 28 }}>
      <div style={sectionHeader}>
        <h2 style={weekTitle}>
          {title} {sub ? <span style={{ color: UI.muted, fontWeight: 600 }}>({sub})</span> : null}
        </h2>
        <span style={tinyHint}>{jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={tableWrap}>
        <table style={tableEl} aria-label={title}>
          <thead>
            <tr>
              <th style={th}>Job #</th>
              <th style={th}>Client</th>
              <th style={th}>Location</th>
              <th style={th}>Dates</th>
              <th style={th}>Status</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const pretty = prettifyStatus(j.status);
              return (
                <tr key={j.id}>
                  <td style={td}>
                    <Link href={`/job-numbers/${j.id}`} style={{ textDecoration: "none", color: UI.text, fontWeight: 800 }}>
                      #{j.jobNumber || j.id}
                    </Link>
                  </td>
                  <td style={td}>{j.client || "—"}</td>
                  <td style={td}>{j.location || "—"}</td>
                  <td style={td}><DatesCell job={j} /></td>
                  <td style={td}><StatusBadge value={pretty} /></td>
                  <td style={td}>
                    <Link href={`/job-numbers/${j.id}`} style={{ textDecoration: "none", fontWeight: 800, color: UI.brand }}>
                      Fill details →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Review Queue</h1>
            <div style={sub}>
              Jobs that just finished or marked <b>Ready to Invoice</b>, not yet paid. Grouped by week.
            </div>
          </div>
        <div style={{ ...chip }}>{loading ? "Loading…" : `${filtered.length} jobs`}</div>
        </div>

        {/* Filters */}
        <div
          style={{
            ...surface,
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 10,
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div style={{ position: "relative" }}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              style={{ position: "absolute", left: 10, top: 10, width: 18, height: 18, opacity: 0.6 }}
              aria-hidden
            >
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
              style={{
                width: "100%",
                padding: "10px 42px 10px 36px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                fontSize: 14,
                outline: "none",
                background: "#fff",
              }}
            />
          </div>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={select}>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Client: All" : c}
              </option>
            ))}
          </select>
          <Link href="/job-home" style={{ textDecoration: "none", fontWeight: 800, color: UI.brand }}>
            Home →
          </Link>
        </div>

        {/* Content grouped by week */}
        {loading ? (
          <div style={{ ...surface, padding: 16 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ ...surface, padding: 16 }}>Nothing to review.</div>
        ) : (
          <>
            {weekKeys.map((mondayTS) => {
              const monday = new Date(Number(mondayTS));
              const jobs = weekGroups[mondayTS] || [];
              const title = `${formatWeekRange(monday)}`;
              const subSpan = `${monday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${new Date(
                monday.getTime() + 6 * 86400000
              ).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
              return <SectionTable key={mondayTS} jobs={jobs} title={title} sub={subSpan} />;
            })}

            {noDate.length > 0 && (
              <SectionTable jobs={noDate} title="No Dates" sub="Jobs without booking dates" />
            )}
          </>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
