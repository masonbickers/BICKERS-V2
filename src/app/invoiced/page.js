"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* ───────────────────────────────────────────
   Mini design system (matching your page)
─────────────────────────────────────────── */
const UI = UI_TOKENS;

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const h1 = { color: "var(--color-text)", fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };
const surface = { background: "var(--color-surface)", borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

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
  border: "1px solid var(--color-border)",
  fontSize: 14,
  outline: "none",
  background: "var(--color-surface)",
};
const searchIcon = { position: "absolute", left: 10, width: 18, height: 18, opacity: 0.6 };

const select = { padding: "8px 10px", borderRadius: UI.radiusSm, border: "1px solid var(--color-border)", background: "var(--color-surface)", fontSize: 13, minWidth: 140 };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-surface-hover)", color: "var(--shell-sidebar-bg)", fontSize: 12, fontWeight: 700 };

const sectionHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 2px 12px" };
const weekTitle = { fontSize: 15, fontWeight: 900, color: "var(--color-text)", letterSpacing: "-0.01em" };
const tinyHint = { color: UI.muted, fontSize: 12 };

/* Table styles (match) */
const tableWrap = { overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 12, background: "var(--color-surface)" };
const tableEl = {
  width: "100%",
  tableLayout: "fixed", //  lock column widths so everything lines up
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13.5,
};
const th = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-surface-subtle)", zIndex: 1 };
const td = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-surface-hover)",
  verticalAlign: "top",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

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

/* Prefer invoicedAt for grouping; fall back to first booking date */
const getInvoicedOrFirstDate = (job) => {
  const ts = getMillis(job?.finance?.invoicedAt) ?? getMillis(job?.invoicedAt) ?? null;
  if (ts) return new Date(ts);

  const ds = normaliseDates(job).sort((a, b) => a - b);
  return ds[0] || null;
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
  return s === "paid" || s === "settled" || inv.includes("paid") || !!job?.finance?.paidAt;
};

const isInvoiced = (job) => {
  const s = String(job.status || "").toLowerCase();
  const inv = String(job.invoiceStatus || "").toLowerCase();
  return s === "invoiced" || inv.includes("invoiced") || !!job?.finance?.invoicedAt;
};

const prettifyStatus = (raw) => {
  const s = (raw || "").toLowerCase().trim();
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
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
    case "Ready to Invoice":
      return { bg: "var(--color-accent-soft)", border: "var(--color-warning-border)", text: "var(--color-warning)" };
    case "Invoiced":
      return { bg: "var(--color-brand-soft)", border: "var(--color-info-border)", text: "var(--color-brand)" };
    case "Paid":
      return { bg: "var(--color-border)", border: "var(--color-success-border)", text: "var(--color-success)" };
    case "Action Required":
      return { bg: "var(--color-accent-soft)", border: "var(--color-danger-border)", text: "var(--color-danger)" };
    case "Complete":
      return { bg: "var(--color-success-border)", border: "var(--color-success-accent)", text: "var(--color-text)" };
    case "Confirmed":
      return { bg: "var(--color-warning-border)", border: "var(--color-success-accent)", text: "var(--color-danger-hover)" };
    case "First Pencil":
      return { bg: "var(--shell-muted)", border: "var(--color-info)", text: "var(--color-info)" };
    case "Second Pencil":
      return { bg: "var(--color-warning-border)", border: "var(--color-warning)", text: "var(--color-danger)" };
    case "TBC":
      return { bg: "var(--color-canvas)", border: "var(--color-border)", text: "var(--color-text-muted)" };
    default:
      return { bg: "var(--shell-muted)", border: "var(--color-brand-hover)", text: "var(--color-text)" };
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
export default function InvoicedTablePage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const searchRef = useRef(null);

  // Live data
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load invoiced bookings" });
      setBookings([]);
      setLoading(false);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState), (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  // 4-digit only
  const jobs = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  // Invoiced & not paid
  const invoicedQueue = useMemo(() => {
    return jobs
      .filter(isInvoiced)
      .filter((j) => !isPaid(j))
      .sort((a, b) => {
        const ta = getMillis(a?.finance?.invoicedAt) ?? getMillis(a?.invoicedAt) ?? 0;
        const tb = getMillis(b?.finance?.invoicedAt) ?? getMillis(b?.invoicedAt) ?? 0;
        // newest invoiced first; if missing timestamps, fallback to booking date
        const fa = ta || (normaliseDates(a)[0]?.getTime() || 0);
        const fb = tb || (normaliseDates(b)[0]?.getTime() || 0);
        return fb - fa;
      });
  }, [jobs]);

  // Facet & Search
  const clients = useMemo(
    () => ["all", ...Array.from(new Set(invoicedQueue.map((j) => j.client).filter(Boolean))).sort()],
    [invoicedQueue]
  );

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return invoicedQueue.filter((j) => {
      if (clientFilter !== "all" && (j.client || "") !== clientFilter) return false;
      if (!s) return true;
      return (
        String(j.jobNumber || "").toLowerCase().includes(s) ||
        String(j.client || "").toLowerCase().includes(s) ||
        String(j.location || "").toLowerCase().includes(s) ||
        String(j.notes || "").toLowerCase().includes(s)
      );
    });
  }, [invoicedQueue, clientFilter, search]);

  // Group by week (use invoicedAt if present)
  const { weekGroups, weekKeys, noDate } = useMemo(() => {
    const groups = {};
    const noDateArr = [];
    for (const j of filtered) {
      const when = getInvoicedOrFirstDate(j);
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
      .sort((a, b) => b - a); // newest week first
    return { weekGroups: groups, weekKeys: keys, noDate: noDateArr };
  }, [filtered]);

const COLS = ["90px", "180px", "160px", "140px", "120px", "220px", "140px", "90px"];

const Table = ({ jobs }) => (
  <div className={layoutStyles.extracted1}>
    <table className={layoutStyles.extracted2} aria-label="Paid jobs">
      <colgroup>
        {COLS.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>

      <thead>
        <tr>
          <th className={layoutStyles.extracted3}>Job #</th>
          <th className={layoutStyles.extracted4}>Client</th>
          <th className={layoutStyles.extracted5}>Location</th>
          <th className={layoutStyles.extracted6}>Dates</th>
          <th className={layoutStyles.extracted7}>Employees</th>
          <th className={layoutStyles.extracted8}>Vehicles</th>
          <th className={layoutStyles.extracted9}>Status</th>
          <th className={layoutStyles.extracted10}>Action</th>
        </tr>
      </thead>

      <tbody>
        {jobs.map((job) => (
          <tr key={job.id}>
            <td className={layoutStyles.extracted11}>
              <Link
                href={`/job-numbers/${job.id}`}
                style={{ fontWeight: 800, textDecoration: "none", color: UI.text }}
              >
                #{job.jobNumber || job.id}
              </Link>
            </td>

            <td className={layoutStyles.extracted12} title={job.client || ""}>{job.client || "—"}</td>
            <td className={layoutStyles.extracted13} title={job.location || ""}>{job.location || "—"}</td>
            <td className={layoutStyles.extracted14}>{dateRangeLabel(job)}</td>

            <td className={layoutStyles.extracted15} title={crewInitials(job.employees) === "—" ? "" : crewInitials(job.employees)}>
              {crewInitials(job.employees)}
            </td>

            <td className={layoutStyles.extracted16} title={vehiclesList(job.vehicles) === "—" ? "" : vehiclesList(job.vehicles)}>
              {vehiclesList(job.vehicles)}
            </td>

            <td className={layoutStyles.extracted17}>
              <div className={layoutStyles.extracted18}>
                <StatusCell raw={job.status || "Paid"} />
              </div>
            </td>

            <td className={layoutStyles.extracted19}>
              <Link
                href={`/job-numbers/${job.id}`}
                style={{ textDecoration: "none", fontWeight: 800, color: UI.brand }}
              >
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
        <div className={layoutStyles.extracted20}>
          <div>
            <h1 className={layoutStyles.extracted21}>Invoiced</h1>
            <div style={sub}>
              Jobs marked <strong>Invoiced</strong> and not yet paid. Grouped by the week they were invoiced (fallback: first booking date).
            </div>
          </div>
          <div className={layoutStyles.extracted22}>{loading ? "Loading…" : `${filtered.length} shown`}</div>
        </div>

        {/* Toolbar (search + client filter) */}
        <div style={toolbar}>
          <div className={layoutStyles.extracted23} title="Press / to focus">
            <svg viewBox="0 0 24 24" fill="none" className={layoutStyles.extracted24} aria-hidden>
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
              aria-label="Search invoiced jobs"
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
        <div className={layoutStyles.extracted25}>
          {loading ? (
            <div style={{ ...surface, padding: 24, textAlign: "center", color: UI.muted }}>Loading jobs…</div>
          ) : weekKeys.length === 0 && (noDate?.length ?? 0) === 0 ? (
            <div style={{ ...surface, padding: 24, textAlign: "center", color: UI.muted }}>No invoiced jobs awaiting payment.</div>
          ) : (
            <>
              {weekKeys.map((mondayTS) => {
                const monday = new Date(Number(mondayTS));
                const jobs = weekGroups[mondayTS] || [];
                return (
                  <section key={mondayTS} className={layoutStyles.extracted26}>
                    <div className={layoutStyles.extracted27}>
                      <h2 className={layoutStyles.extracted28}>
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
                <section className={layoutStyles.extracted29}>
                  <div className={layoutStyles.extracted30}>
                    <h2 className={layoutStyles.extracted31}>No Dates ({noDate.length})</h2>
                    <span style={tinyHint}>Jobs missing invoicedAt and booking dates</span>
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
