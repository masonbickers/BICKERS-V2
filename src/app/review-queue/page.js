"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Home,
  RotateCcw,
  Search,
} from "lucide-react";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { useSessionScroll, useSessionState } from "@/app/utils/useSessionState";

const UI = {
  radius: "var(--radius-md)",
  radiusSm: "var(--radius-md)",
  gap: "var(--space-3)",
  shadowSm: "var(--shadow-sm)",
  border: "var(--border-default)",
  bg: "var(--color-canvas)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-soft)",
  brandBorder: "var(--color-brand-border)",
  green: "var(--legacy-color-15803d)",
  greenSoft: "var(--legacy-color-ecfdf3)",
  greenBorder: "var(--color-success-border)",
  amber: "var(--legacy-color-b45309)",
  amberSoft: "var(--legacy-color-fffbeb)",
  amberBorder: "var(--legacy-color-fde68a)",
  red: "var(--legacy-color-b91c1c)",
  redSoft: "var(--legacy-color-fff1f2)",
  redBorder: "var(--legacy-color-fecdd3)",
  purple: "var(--legacy-color-7c3aed)",
  purpleSoft: "var(--legacy-color-f5f3ff)",
  purpleBorder: "var(--legacy-color-ddd6fe)",
};

const pageWrap = { padding: "10px 12px 24px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  marginBottom: "var(--space-2)",
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 20, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const titleMd = { fontWeight: 800, fontSize: 17, margin: 0, color: UI.text, letterSpacing: 0 };
const cardHint = { color: UI.muted, fontSize: 12.5, marginTop: "var(--space-1)", lineHeight: 1.4 };
const sectionHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  margin: "8px 0 5px",
  flexWrap: "wrap",
};
const toolbar = {
  ...surface,
  padding: 6,
  display: "grid",
  gridTemplateColumns: "minmax(240px, 1fr) minmax(150px, 1fr) 130px 122px 122px auto auto",
  gap: 5,
  alignItems: "center",
  marginBottom: "var(--space-2)",
};
const inputStyle = {
  width: "100%",
  height: 28,
  padding: "3px 7px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: "var(--font-size-xs)",
  outline: "none",
  background: "var(--color-white)",
  color: UI.text,
  boxSizing: "border-box",
};
const btn = (kind = "ghost") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 28,
  padding: "4px 8px",
  borderRadius: UI.radiusSm,
  border: kind === "primary" ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
  background: kind === "primary" ? UI.brand : "var(--color-white)",
  color: kind === "primary" ? "var(--color-white)" : UI.text,
  fontWeight: 850,
  fontSize: "var(--font-size-xs)",
  textDecoration: "none",
  boxShadow: kind === "primary" ? "0 8px 18px rgba(31,75,122,0.16)" : UI.shadowSm,
  whiteSpace: "nowrap",
  cursor: "pointer",
});
const chip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "3px 8px",
    borderRadius: "var(--radius-pill)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: UI.brandBorder,
    background: UI.brandSoft,
    color: UI.text,
    fontSize: 11.5,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  if (kind === "green") return { ...base, borderColor: UI.greenBorder, background: UI.greenSoft, color: UI.green };
  if (kind === "amber") return { ...base, borderColor: UI.amberBorder, background: UI.amberSoft, color: UI.amber };
  if (kind === "red") return { ...base, borderColor: UI.redBorder, background: UI.redSoft, color: UI.red };
  if (kind === "purple") return { ...base, borderColor: UI.purpleBorder, background: UI.purpleSoft, color: UI.purple };
  return base;
};
const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: "var(--radius-md)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});
const tableWrap = { ...surface, overflow: "auto" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12.5, tableLayout: "fixed" };
const th = {
  textAlign: "left",
  padding: "5px 8px",
  borderBottom: "1px solid var(--legacy-color-e5e7eb)",
  position: "sticky",
  top: 0,
  background: "var(--color-surface-subtle)",
  zIndex: 1,
  color: UI.muted,
  fontSize: 10.5,
  fontWeight: 900,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const td = {
  padding: "5px 8px",
  borderBottom: "1px solid var(--legacy-color-f1f5f9)",
  verticalAlign: "middle",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const nowrap = { whiteSpace: "nowrap" };
const focusCss = `
  input:focus, select:focus, button:focus, a:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: var(--color-info-border) !important;
  }
  @media (max-width: 1180px) {
    .review-toolbar { grid-template-columns: 1fr 1fr !important; }
    .review-search { grid-column: 1 / -1; }
  }
  @media (max-width: 720px) {
    .review-toolbar { grid-template-columns: 1fr !important; }
  }
`;

const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
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

const isFourDigitJob = (job) => /^\d{4}(?:\.\d+)?$/.test(String(job.jobNumber ?? "").trim());
const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "-");

const isPaid = (job) => {
  const s = String(job.status || "").toLowerCase();
  const inv = String(job.invoiceStatus || "").toLowerCase();
  return s === "paid" || s === "settled" || inv.includes("paid");
};

const prettifyStatus = (raw) => {
  const s = String(raw || "").toLowerCase().trim();
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  return s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC";
};

const statusColors = (label) => {
  switch (label) {
    case "Ready to Invoice":
      return { bg: "var(--legacy-color-fef3c7)", border: "var(--legacy-color-fde68a)", text: "var(--legacy-color-92400e)" };
    case "Invoiced":
      return { bg: "var(--legacy-color-e0e7ff)", border: "var(--legacy-color-c7d2fe)", text: "var(--legacy-color-3730a3)" };
    case "Paid":
      return { bg: "var(--legacy-color-d1fae5)", border: "var(--legacy-color-86efac)", text: "var(--legacy-color-065f46)" };
    case "Action Required":
      return { bg: "var(--legacy-color-ff973b)", border: "var(--legacy-color-0b0b0b)", text: "var(--legacy-color-111)" };
    case "Complete":
      return { bg: "var(--legacy-color-92d18cff)", border: "var(--legacy-color-0b0b0b)", text: "var(--legacy-color-111)" };
    case "Confirmed":
      return { bg: "var(--legacy-color-f3f970)", border: "var(--legacy-color-0b0b0b)", text: "var(--legacy-color-111)" };
    case "First Pencil":
      return { bg: "var(--legacy-color-89caf5)", border: "var(--legacy-color-0b0b0b)", text: "var(--legacy-color-111)" };
    case "Second Pencil":
      return { bg: "var(--legacy-color-f73939)", border: "var(--legacy-color-0b0b0b)", text: "var(--color-white)" };
    case "TBC":
      return { bg: "var(--legacy-color-f3f4f6)", border: "var(--legacy-color-e5e7eb)", text: "var(--legacy-color-374151)" };
    default:
      return { bg: "var(--legacy-color-e5e7eb)", border: "var(--legacy-color-d1d5db)", text: "var(--legacy-color-111827)" };
  }
};

const StatusBadge = ({ value }) => {
  const c = statusColors(value);
  return (
    <span
      style={{
        padding: "5px 9px",
        fontSize: 11.5,
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontWeight: 900,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {value}
    </span>
  );
};

const getCheckBadgeState = (isComplete) =>
  isComplete
    ? { label: "Yes", tone: "green" }
    : { label: "No", tone: "red" };

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
  return `${monday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} to ${sunday.toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "short", year: "numeric" }
  )}`;
}

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export default function ReviewQueuePage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingJobId, setSavingJobId] = useState("");
  const [clientFilter, setClientFilter] = useSessionState("review-queue:clientFilter", "all");
  const [search, setSearch] = useSessionState("review-queue:search", "");
  const [statusFilter, setStatusFilter] = useSessionState("review-queue:statusFilter", "all");
  const [fromDate, setFromDate] = useSessionState("review-queue:fromDate", "");
  const [toDate, setToDate] = useSessionState("review-queue:toDate", "");
  const [overdueOnly, setOverdueOnly] = useSessionState("review-queue:overdueOnly", false);
  const searchRef = useRef(null);
  useSessionScroll("review-queue");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load review queue bookings" });
      setBookings([]);
      setLoading(false);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  const jobs4 = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  const beforeToday = useCallback(
    (j) => {
      const ds = normaliseDates(j).sort((a, b) => a - b);
      if (!ds.length) return false;
      const lastMid = new Date(ds[ds.length - 1]);
      lastMid.setHours(0, 0, 0, 0);
      return lastMid.getTime() < todayMidnight.getTime();
    },
    [todayMidnight]
  );

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
  }, [jobs4, beforeToday]);

  const productionCompanies = useMemo(
    () => ["all", ...Array.from(new Set(queue.map((j) => j.client).filter(Boolean))).sort()],
    [queue]
  );

  const statusOptions = useMemo(
    () => ["all", "Ready to Invoice", "Confirmed", "Complete", "Action Required"],
    []
  );

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    const from = fromDate ? startOfDay(new Date(fromDate)) : null;
    const to = toDate ? endOfDay(new Date(toDate)) : null;

    return queue.filter((j) => {
      if (clientFilter !== "all" && (j.client || "") !== clientFilter) return false;
      if (statusFilter !== "all" && prettifyStatus(j.status) !== statusFilter) return false;
      if (overdueOnly && !beforeToday(j)) return false;

      if (from || to) {
        const ds = normaliseDates(j);
        if (!ds.length) return false;
        const minT = Math.min(...ds.map((d) => d.getTime()));
        const maxT = Math.max(...ds.map((d) => d.getTime()));
        if (from && maxT < from.getTime()) return false;
        if (to && minT > to.getTime()) return false;
      }

      if (!s) return true;
      return (
        String(j.jobNumber || "").toLowerCase().includes(s) ||
        String(j.production || "").toLowerCase().includes(s) ||
        String(j.client || "").toLowerCase().includes(s) ||
        String(j.location || "").toLowerCase().includes(s) ||
        String(j.notes || "").toLowerCase().includes(s)
      );
    });
  }, [queue, clientFilter, statusFilter, overdueOnly, fromDate, toDate, search, beforeToday]);

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
      .sort((a, b) => b - a);
    return { weekGroups: groups, weekKeys: keys, noDate: noDateJobs };
  }, [filtered]);

  const captureScrollPositions = () => {
    if (typeof window === "undefined") return () => {};
    const target = document.scrollingElement || document.documentElement;
    const left = target.scrollLeft || 0;
    const top = target.scrollTop || 0;
    return () => {
      target.scrollLeft = left;
      target.scrollTop = top;
    };
  };

  const setQuickStatus = async (job, nextStatus) => {
    if (!job?.id || savingJobId) return;
    const restoreScroll = captureScrollPositions();
    const previousBookings = bookings;
    const optimisticPatch = {
      status: nextStatus,
      updatedAt: new Date(),
      readyToInvoice: nextStatus === "Ready to Invoice",
    };

    setSavingJobId(job.id);
    setBookings((current) => current.map((item) => (item.id === job.id ? { ...item, ...optimisticPatch } : item)));
    requestAnimationFrame(() => restoreScroll());

    try {
      await updateDoc(
        doc(db, "bookings", job.id),
        tenantPayload(dataAccessState, {
          status: nextStatus,
          updatedAt: serverTimestamp(),
          readyToInvoice: nextStatus === "Ready to Invoice",
        })
      );
    } catch (error) {
      console.error("Failed to update review queue status:", error);
      setBookings(previousBookings);
      alert("Could not update the job status. Please try again.");
    } finally {
      setSavingJobId("");
      requestAnimationFrame(() => restoreScroll());
    }
  };

  const resetFilters = () => {
    setSearch("");
    setClientFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setOverdueOnly(false);
    if (searchRef.current) searchRef.current.focus();
  };

  const DatesCell = ({ job }) => {
    const ds = normaliseDates(job).sort((a, b) => a - b);
    const first = ds[0] ?? null;
    const last = ds[ds.length - 1] ?? null;
    const label = first && last ? `${fmtShort(first)} to ${fmtShort(last)}` : first ? fmtShort(first) : "TBC";
    return <>{label}</>;
  };

  const SectionTable = ({ jobs, title }) => (
    <section style={{ marginBottom: "var(--space-3)" }}>
      <div style={sectionHeader}>
        <div>
          <h2 style={titleMd}>{title}</h2>
        </div>
        <span style={chip()}>
          {jobs.length} job{jobs.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={tableWrap}>
        <table style={tableEl} aria-label={title}>
          <colgroup>
            <col style={{ width: 84 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 180 }} />
            <col />
            <col style={{ width: 72 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 126 }} />
            <col style={{ width: 118 }} />
            <col style={{ width: 368 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={th}>Job #</th>
              <th style={th}>Production</th>
              <th style={th}>Production Company</th>
              <th style={th}>Location</th>
              <th style={th}>Notes</th>
              <th style={th}>PO</th>
              <th style={th}>Quote</th>
              <th style={th}>Dates</th>
              <th style={th}>Status</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const pretty = prettifyStatus(j.status);
              const notesState = getCheckBadgeState(String(j?.generalNotes || "").trim().length > 0);
              const poState = getCheckBadgeState(String(j?.po || "").trim().length > 0);
              const quoteState = getCheckBadgeState(
                String(j?.pdfUrl || "").trim().length > 0 ||
                  (Array.isArray(j?.attachments) && j.attachments.length > 0)
              );
              const href = `/job-numbers/${j.id}#job-${j.id}`;

              return (
                <tr key={j.id}>
                  <td style={{ ...td, ...nowrap }}>
                    <Link href={href} style={{ textDecoration: "none", color: UI.text, fontWeight: 900 }}>
                      #{j.jobNumber || j.id}
                    </Link>
                  </td>
                  <td style={td} title={j.production || ""}>{j.production || "-"}</td>
                  <td style={td} title={j.client || ""}>{j.client || "-"}</td>
                  <td style={td} title={j.location || ""}>{j.location || "-"}</td>
                  <td style={{ ...td, ...nowrap }}><span style={chip(notesState.tone)}>{notesState.label}</span></td>
                  <td style={{ ...td, ...nowrap }}><span style={chip(poState.tone)}>{poState.label}</span></td>
                  <td style={{ ...td, ...nowrap }}><span style={chip(quoteState.tone)}>{quoteState.label}</span></td>
                  <td style={{ ...td, ...nowrap }}><DatesCell job={j} /></td>
                  <td style={{ ...td, ...nowrap }}><StatusBadge value={pretty} /></td>
                  <td style={{ ...td, ...nowrap }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                      {["Ready to Invoice", "Needs Action", "Complete"].map((option) => {
                        const nextStatus = option === "Needs Action" ? "Action Required" : option;
                        const currentStatus = prettifyStatus(j.status);
                        const isActive = currentStatus === option || currentStatus === nextStatus;

                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setQuickStatus(j, nextStatus)}
                            disabled={savingJobId === j.id}
                            style={{
                              ...btn(isActive ? "primary" : "ghost"),
                              minHeight: 24,
                              padding: "3px 7px",
                              fontSize: 11,
                              boxShadow: "none",
                              opacity: savingJobId === j.id ? 0.6 : 1,
                            }}
                          >
                            {option}
                          </button>
                        );
                      })}
                      <Link href={href} style={{ ...btn(), minHeight: 24, padding: "3px 7px", fontSize: 11, boxShadow: "none" }}>
                        Details <ChevronRight size={12} />
                      </Link>
                    </div>
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
      <style>{focusCss}</style>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Review Queue</h1>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/job-home" style={btn()}>
              <Home size={14} />
              Jobs Home
            </Link>
            <div style={chip()}>
              <ClipboardList size={13} /> {loading ? "Loading..." : `${filtered.length} jobs`}
            </div>
          </div>
        </div>

        <div className="review-toolbar" style={toolbar}>
          <div className="review-search" style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: 7, color: UI.muted }} aria-hidden />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by job #, production, production company, location or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 29 }}
              aria-label="Search review queue"
            />
          </div>

          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={inputStyle}>
            {productionCompanies.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Production Company: All" : c}
              </option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Status: All" : s}
              </option>
            ))}
          </select>

          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} aria-label="From date" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} aria-label="To date" />

          <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-size-xs)", color: UI.text, whiteSpace: "nowrap", fontWeight: 800 }}>
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Overdue
          </label>

          <button type="button" onClick={resetFilters} style={btn()}>
            <RotateCcw size={13} />
            Reset
          </button>
        </div>

        {loading ? (
          <div style={{ ...surface, padding: 14, color: UI.muted }}>Loading jobs...</div>
        ) : filtered.length === 0 ? (
          <div style={{ ...surface, padding: 14, color: UI.muted }}>Nothing to review.</div>
        ) : (
          <>
            {weekKeys.map((mondayTS) => {
              const monday = new Date(Number(mondayTS));
              const jobs = weekGroups[mondayTS] || [];
              return (
                <SectionTable
                  key={mondayTS}
                  jobs={jobs}
                  title={formatWeekRange(monday)}
                />
              );
            })}

            {noDate.length > 0 && <SectionTable jobs={noDate} title="No Dates" />}
          </>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
