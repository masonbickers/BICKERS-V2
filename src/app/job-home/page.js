"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";
import { formatQuoteDate, getCompletedQuoteRows, money } from "@/app/utils/completedQuotes";
import { useSessionScroll, useSessionState } from "@/app/utils/useSessionState";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  FolderKanban,
  Plus,
  Receipt,
  Search,
} from "lucide-react";

/* Mini design system */
const UI = {
  radius: "var(--radius-md)",
  radiusSm: "var(--radius-md)",
  gap: "var(--space-3)",
  shadowSm: "var(--shadow-sm)",
  shadowHover: "var(--shadow-md)",
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

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: "var(--font-size-xl)", lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const card = {
  ...surface,
  padding: "var(--space-3)",
  textDecoration: "none",
  color: UI.text,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, border: `1px solid ${UI.brandBorder}` };
const grid = (cols = 4) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: UI.gap });

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontWeight: 800, fontSize: 17, margin: 0, color: UI.text, letterSpacing: 0 };
const cardTitle = { fontWeight: 800, fontSize: 15, margin: 0, color: UI.text, letterSpacing: 0 };
const cardHint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.4 };

const chip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 9px",
    borderRadius: "var(--radius-pill)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: UI.brandBorder,
    background: UI.brandSoft,
    color: UI.text,
    fontSize: "var(--font-size-xs)",
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

const statCard = {
  ...card,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  minHeight: 54,
  padding: 10,
};

const statLabel = {
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
};

const statValue = {
  color: UI.text,
  fontSize: "var(--font-size-xl)",
  lineHeight: 1.1,
  fontWeight: 850,
  marginTop: 3,
};

const actionButton = (kind = "ghost") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: "var(--control-height-md)",
  padding: "8px 11px",
  borderRadius: UI.radiusSm,
  border: kind === "primary" ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
  background: kind === "primary" ? UI.brand : "var(--color-white)",
  color: kind === "primary" ? "var(--color-white)" : UI.text,
  fontWeight: 850,
  fontSize: "var(--font-size-sm)",
  textDecoration: "none",
  boxShadow: kind === "primary" ? "0 8px 18px rgba(31,75,122,0.16)" : UI.shadowSm,
  whiteSpace: "nowrap",
});

const inputStyle = {
  width: "100%",
  minHeight: "var(--control-height-md)",
  padding: "7px 40px 7px 34px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: "var(--font-size-sm)",
  outline: "none",
  background: "var(--color-white)",
  color: UI.text,
};

const rowShell = {
  display: "grid",
  gridTemplateColumns: "minmax(360px, 1fr) minmax(160px, 220px) 136px 110px",
  columnGap: "var(--space-2)",
  rowGap: 0,
  alignItems: "center",
  minHeight: 34,
  padding: "0 0 0 9px",
  borderTop: "1px solid var(--legacy-color-edf2f7)",
  textDecoration: "none",
  color: UI.text,
};

const jobNumberRowShell = {
  ...rowShell,
  gridTemplateColumns: "minmax(260px, 1fr) 260px 136px 110px",
};

const quoteRowShell = {
  ...rowShell,
  gridTemplateColumns: "minmax(220px, 1fr) minmax(170px, 260px) 120px 120px",
};

const listShell = { border: UI.border, borderRadius: UI.radius, overflow: "hidden", background: "var(--color-white)" };

const focusCss = `
  input:focus, button:focus, a:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: var(--color-info-border) !important;
  }
  @media (max-width: 1180px) {
    .job-home-main-grid,
    .job-home-top-grid,
    .job-home-stat-grid,
    .job-home-shortcut-grid,
    .job-home-pipeline-grid,
    .job-home-groups-grid { grid-template-columns: 1fr !important; }
    .job-home-row { grid-template-columns: 1fr !important; }
    .job-home-row-status { justify-self: start !important; }
  }
  @media (max-width: 620px) {
    .job-home-workflow-grid { grid-template-columns: 1fr !important; }
  }
`;

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

const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "-");
const getJobPrefix = (job) => (job.jobNumber ? String(job.jobNumber).split("-")[0] : "No Job #");
const getJobNumberGroup = (job) => {
  const digits = String(job.jobNumber ?? "").replace(/\D/g, "");
  return digits.length >= 2 ? digits.slice(0, 2) : "Other";
};
const getJobNumberSubgroup = (job) => {
  const digits = String(job.jobNumber ?? "").replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(0, 3) : getJobNumberGroup(job);
};
const getBaseJobNumber = (job) => {
  const match = String(job?.jobNumber ?? "").trim().match(/^\d{4}/);
  return match ? match[0] : String(job?.jobNumber ?? job?.id ?? "No Job #");
};
const isFourDigitJob = (job) => /^\d{4}(?:\.\d+)?$/.test(String(job.jobNumber ?? "").trim());

const prettifyStatus = (raw) => {
  const s = (raw || "").toLowerCase().trim();
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "bickers") return "Bickers";
  if (s === "stunt") return "Stunt";
  if (s === "maintenance") return "Maintenance";
  if (s === "dnh") return "DNH";
  if (s === "postponed") return "Postponed";
  if (s === "deleted") return "Deleted";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  return s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC";
};

const statusColors = (label) => {
  switch (label) {
    case "Confirmed":
      return { bg: "var(--legacy-color-f3f970)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Bickers":
      return { bg: "var(--color-white)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Stunt":
      return { bg: "var(--legacy-color-f3f970)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "First Pencil":
      return { bg: "var(--legacy-color-89caf5)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Second Pencil":
      return { bg: "var(--legacy-color-f73939)", text: "var(--color-white)", border: "var(--legacy-color-0b0b0b)" };
    case "Maintenance":
      return { bg: "var(--legacy-color-da8e58ff)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Complete":
      return { bg: "var(--legacy-color-92d18cff)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Action Required":
      return { bg: "var(--legacy-color-ff973b)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "DNH":
      return { bg: "var(--legacy-color-e5e7eb)", text: "var(--legacy-color-111827)", border: "var(--legacy-color-d1d5db)" };
    case "Postponed":
    case "Deleted":
      return { bg: "var(--legacy-color-c2c2c2)", text: "var(--legacy-color-111)", border: "var(--legacy-color-c2c2c2)" };
    case "Ready to Invoice":
      return { bg: "var(--legacy-color-fef3c7)", border: "var(--legacy-color-fde68a)", text: "var(--legacy-color-92400e)" };
    case "Invoiced":
      return { bg: "var(--legacy-color-e0e7ff)", border: "var(--legacy-color-c7d2fe)", text: "var(--legacy-color-3730a3)" };
    case "Paid":
      return { bg: "var(--legacy-color-d1fae5)", border: "var(--legacy-color-86efac)", text: "var(--legacy-color-065f46)" };
    case "Missing":
      return { bg: "var(--legacy-color-fff1f2)", border: "var(--legacy-color-fecdd3)", text: "var(--legacy-color-b91c1c)" };
    case "TBC":
      return { bg: "var(--legacy-color-f3f4f6)", border: "var(--legacy-color-e5e7eb)", text: "var(--legacy-color-374151)" };
    default:
      return { bg: "var(--legacy-color-e5e7eb)", border: "var(--legacy-color-d1d5db)", text: "var(--legacy-color-111827)" };
  }
};

const StatusBadge = ({ value, rowIndex = 0, rowCount = 1 }) => {
  const c = statusColors(value);
  const isFirst = rowIndex === 0;
  const isLast = rowIndex === rowCount - 1;
  return (
    <span
      style={{
        width: "100%",
        height: "100%",
        minHeight: 34,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 8px",
        fontSize: 11.5,
        borderRadius: `0 ${isFirst ? UI.radius : 0}px ${isLast ? UI.radius : 0}px 0`,
        border: "1px solid var(--legacy-color-0b0b0b)",
        borderTopWidth: isFirst ? 1 : 0,
        marginTop: 0,
        background: c.bg,
        color: c.text,
        fontWeight: 900,
        whiteSpace: "nowrap",
        lineHeight: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {value}
    </span>
  );
};

function MetricCard({ label, value, icon: Icon, color, bg, border }) {
  return (
    <section style={statCard}>
      <div>
        <div style={statLabel}>{label}</div>
        <div style={statValue}>{value}</div>
      </div>
      <span style={iconBox(color, bg, border)}>
        <Icon size={17} />
      </span>
    </section>
  );
}

const groupButtonStyle = (active = false) => ({
  minHeight: 30,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  padding: "4px 7px",
  borderRadius: UI.radiusSm,
  border: active ? `2px solid ${UI.brand}` : UI.border,
  background: active ? UI.brandSoft : "var(--color-white)",
  color: UI.text,
  cursor: "pointer",
  fontWeight: 900,
  fontSize: "var(--font-size-md)",
  boxShadow: active ? "0 4px 10px rgba(31,75,122,0.08)" : UI.shadowSm,
});

const norm = (s = "") => String(s).toLowerCase().trim();
const jobMatchesSearch = (job, term) => {
  const s = norm(term);
  if (!s) return true;
  return (
    String(job.jobNumber || "").toLowerCase().includes(s) ||
    String(job.client || "").toLowerCase().includes(s) ||
    String(job.location || "").toLowerCase().includes(s) ||
    String(job.notes || "").toLowerCase().includes(s)
  );
};

const readyToInvoiceFlag = (j) => /ready\s*to\s*invoice/.test(norm(j.status)) || !!j.readyToInvoice;
const isInvoicedFlag = (j) => {
  const s = norm(j.status);
  const inv = norm(j.invoiceStatus);
  return s === "invoiced" || inv.includes("invoiced") || !!j?.finance?.invoicedAt;
};
const isPaidFlag = (j) => {
  const s = norm(j.status);
  const inv = norm(j.invoiceStatus);
  return s === "paid" || s === "settled" || inv.includes("paid") || !!j?.finance?.paidAt;
};
const isInactiveJobStatus = (j) => {
  const s = norm(j.status);
  return s === "dnh" || s === "cancelled" || s === "canceled" || s === "postponed";
};

const hasWorkBeforeToday = (j, todayMidnight) => {
  const ds = normaliseDates(j).sort((a, b) => a - b);
  if (!ds.length) return false;
  const last = new Date(ds[ds.length - 1]);
  last.setHours(0, 0, 0, 0);
  return last.getTime() < todayMidnight.getTime();
};

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
  const status = norm(job.status);
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

/* Page */
export default function JobHomePage() {
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useSessionState("job-home:search", "");
  const [selectedJobGroup, setSelectedJobGroup] = useSessionState("job-home:selectedJobGroup", "All");
  const [expandedJobGroups, setExpandedJobGroups] = useSessionState("job-home:expandedJobGroups", {});
  const searchRef = useRef(null);
  useSessionScroll("job-home", !loading);

  useEffect(() => {
    if (!authState?.user) return undefined;
    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", authState), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, authState]);

  const jobs = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  const weekWindow = useMemo(() => {
    const now = new Date(todayMidnight);
    const day = now.getDay();
    const monday = new Date(now);
    const diff = (day === 0 ? -6 : 1) - day;
    monday.setDate(now.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  }, [todayMidnight]);

  const grouped = useMemo(() => {
    const g = {
      Upcoming: 0,
      "Complete Jobs": 0,
      "Passed - Not Confirmed": 0,
      "Ready to Invoice": 0,
      Paid: 0,
      "Needs Action": 0,
      Enquiries: 0,
    };
    for (const j of jobs) {
      const key = classify(j, todayMidnight);
      g[key] = (g[key] || 0) + 1;
    }
    return g;
  }, [jobs, todayMidnight]);

  const total = jobs.length;

  const reviewQueueCount = useMemo(() => {
    return jobs.filter((j) => {
      const s = norm(j.status);
      const completeish = s === "confirmed" || s === "complete" || s === "completed";
      const past = hasWorkBeforeToday(j, todayMidnight);
      return !isPaidFlag(j) && (readyToInvoiceFlag(j) || (completeish && past));
    }).length;
  }, [jobs, todayMidnight]);

  const financeReadyCount = useMemo(() => {
    return jobs.filter((j) => readyToInvoiceFlag(j) && !isPaidFlag(j)).length;
  }, [jobs]);

  const invoicedCount = useMemo(() => {
    return jobs.filter((j) => isInvoicedFlag(j) && !isPaidFlag(j)).length;
  }, [jobs]);

  const paidCount = useMemo(() => jobs.filter(isPaidFlag).length, [jobs]);

  const completedQuoteRows = useMemo(() => getCompletedQuoteRows(jobs), [jobs]);
  const completedQuotePreview = useMemo(() => completedQuoteRows.slice(0, 8), [completedQuoteRows]);

  const upcomingThisWeek = useMemo(() => {
    const inUpcomingWeek = (d) => d >= todayMidnight && d <= weekWindow.sunday;
    const firstUpcomingDate = (job) =>
      normaliseDates(job)
        .filter(inUpcomingWeek)
        .sort((x, y) => +x - +y)[0];

    return jobs
      .filter((j) => !isInactiveJobStatus(j) && normaliseDates(j).some(inUpcomingWeek))
      .sort((a, b) => {
        const fa = firstUpcomingDate(a)?.getTime() ?? Infinity;
        const fb = firstUpcomingDate(b)?.getTime() ?? Infinity;
        return fa - fb;
      })
      .slice(0, 8);
  }, [jobs, todayMidnight, weekWindow]);

  const reviewQueuePreview = useMemo(() => {
    const previousMonday = new Date(weekWindow.monday);
    previousMonday.setDate(weekWindow.monday.getDate() - 7);
    const inReviewWindow = (job) =>
      normaliseDates(job).some((date) => date >= previousMonday && date <= weekWindow.sunday);
    const latestReviewDate = (job) =>
      normaliseDates(job)
        .filter((date) => date >= previousMonday && date <= weekWindow.sunday)
        .sort((a, b) => +b - +a)[0];

    return jobs
      .filter((j) => {
        const s = norm(j.status);
        const completeish = s === "confirmed" || s === "complete" || s === "completed";
        const past = hasWorkBeforeToday(j, todayMidnight);
        return inReviewWindow(j) && !isInactiveJobStatus(j) && !isPaidFlag(j) && (readyToInvoiceFlag(j) || (completeish && past));
      })
      .sort((a, b) => {
        const da = latestReviewDate(a)?.getTime() ?? 0;
        const db = latestReviewDate(b)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 8);
  }, [jobs, todayMidnight, weekWindow]);

  const financeQueuePreview = useMemo(
    () => jobs.filter((j) => readyToInvoiceFlag(j) && !isPaidFlag(j)).slice(0, 8),
    [jobs]
  );

  const recent = useMemo(() => {
    const withLast = jobs
      .map((j) => {
        const ds = normaliseDates(j).sort((a, b) => +a - +b);
        return { j, last: ds[ds.length - 1] || null };
      })
      .sort((a, b) => (b.last?.getTime() || 0) - (a.last?.getTime() || 0))
      .slice(0, 8)
      .map((x) => x.j);
    return withLast;
  }, [jobs]);

  const jobNumberGroups = useMemo(() => {
    const map = new Map();
    for (const job of jobs) {
      const group = getJobNumberGroup(job);
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(job);
    }
    return Array.from(map.entries())
      .map(([group, items]) => {
        const sortedItems = items.sort((a, b) => Number(a.jobNumber || 0) - Number(b.jobNumber || 0));
        const subMap = new Map();
        for (const job of sortedItems) {
          const subgroup = getJobNumberSubgroup(job);
          if (!subMap.has(subgroup)) subMap.set(subgroup, []);
          subMap.get(subgroup).push(job);
        }
        const subgroups = Array.from(subMap.entries())
          .map(([subgroup, subgroupItems]) => ({ subgroup, items: subgroupItems }))
          .sort((a, b) => {
            if (a.subgroup === "Other") return 1;
            if (b.subgroup === "Other") return -1;
            return Number(a.subgroup) - Number(b.subgroup);
          });
        return { group, items: sortedItems, subgroups };
      })
      .sort((a, b) => {
        if (a.group === "Other") return 1;
        if (b.group === "Other") return -1;
        return Number(b.group) - Number(a.group);
      });
  }, [jobs]);

  const searchTerm = search.trim();

  const searchResultJobs = useMemo(() => {
    if (!searchTerm) return [];
    return jobs
      .filter((job) => jobMatchesSearch(job, searchTerm))
      .sort((a, b) => Number(a.jobNumber || 0) - Number(b.jobNumber || 0));
  }, [jobs, searchTerm]);

  const searchGroupMatches = useMemo(() => {
    const groupSet = new Set();
    const subgroupSet = new Set();
    searchResultJobs.forEach((job) => {
      groupSet.add(getJobNumberGroup(job));
      subgroupSet.add(getJobNumberSubgroup(job));
    });
    return { groupSet, subgroupSet };
  }, [searchResultJobs]);

  useEffect(() => {
    if (!searchTerm || !searchResultJobs.length) return;
    setExpandedJobGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      searchResultJobs.forEach((job) => {
        const group = getJobNumberGroup(job);
        if (!next[group]) {
          next[group] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [searchResultJobs, searchTerm, setExpandedJobGroups]);

  useEffect(() => {
    if (loading) return;
    if (selectedJobGroup === "All") return;
    const hasGroup = jobNumberGroups.some(
      (item) => item.group === selectedJobGroup || item.subgroups.some((sub) => sub.subgroup === selectedJobGroup)
    );
    if (!hasGroup) setSelectedJobGroup("All");
  }, [jobNumberGroups, loading, selectedJobGroup, setSelectedJobGroup]);

  const selectedGroupJobs = useMemo(() => {
    if (searchTerm) return searchResultJobs;
    if (selectedJobGroup === "All") {
      return jobs
        .slice()
        .sort((a, b) => Number(b.jobNumber || 0) - Number(a.jobNumber || 0))
        .slice(0, 10);
    }
    const parentGroup = jobNumberGroups.find((item) => item.group === selectedJobGroup);
    if (parentGroup) return parentGroup.items;
    return jobNumberGroups.flatMap((item) => item.subgroups).find((item) => item.subgroup === selectedJobGroup)?.items || [];
  }, [jobNumberGroups, jobs, searchResultJobs, searchTerm, selectedJobGroup]);

  const selectedJobNumberRows = useMemo(() => {
    const map = new Map();
    selectedGroupJobs.forEach((job) => {
      const jobNumber = getBaseJobNumber(job);
      if (!map.has(jobNumber)) map.set(jobNumber, []);
      map.get(jobNumber).push(job);
    });

    const rows = Array.from(map.entries())
      .map(([jobNumber, groupedJobs]) => {
        const sortedJobs = groupedJobs.slice().sort((a, b) => {
          const aDate = normaliseDates(a).sort((x, y) => +y - +x)[0]?.getTime() || 0;
          const bDate = normaliseDates(b).sort((x, y) => +y - +x)[0]?.getTime() || 0;
          return bDate - aDate;
        });
        const primary = sortedJobs[0] || groupedJobs[0];
        const allDates = groupedJobs.flatMap((job) => normaliseDates(job)).sort((a, b) => +a - +b);
        const statuses = Array.from(new Set(groupedJobs.map((job) => prettifyStatus(job.status || "")).filter(Boolean)));
        const bookingCounts = groupedJobs.reduce(
          (acc, job) => {
            const status = prettifyStatus(job.status || "");
            if (status === "First Pencil") acc.firstPencil += 1;
            if (status === "Second Pencil") acc.secondPencil += 1;
            if (status === "Confirmed") acc.confirmed += 1;
            if (status === "Complete") acc.complete += 1;
            if (status === "DNH" || status === "Cancelled" || status === "Postponed") acc.notHappening += 1;
            return acc;
          },
          { firstPencil: 0, secondPencil: 0, confirmed: 0, complete: 0, notHappening: 0 }
        );
        const completeOrInactiveOnly =
          bookingCounts.complete > 0 &&
          bookingCounts.firstPencil === 0 &&
          bookingCounts.secondPencil === 0 &&
          bookingCounts.confirmed === 0 &&
          bookingCounts.complete + bookingCounts.notHappening === groupedJobs.length;
        return {
          id: jobNumber,
          jobNumber,
          href: `/job-numbers/${encodeURIComponent(jobNumber)}`,
          client: primary?.client || "-",
          location: primary?.location || "-",
          dates: allDates,
          status: completeOrInactiveOnly ? "Complete" : statuses.length === 1 ? statuses[0] : `${groupedJobs.length} bookings`,
          count: groupedJobs.length,
          bookingCounts,
        };
      })
      .sort((a, b) => Number(a.jobNumber || 0) - Number(b.jobNumber || 0));

    if (searchTerm || !/^\d{3}$/.test(String(selectedJobGroup))) return rows;

    const rowsByJobNumber = new Map(rows.map((row) => [String(row.jobNumber), row]));
    return Array.from({ length: 10 }, (_, index) => {
      const jobNumber = `${selectedJobGroup}${index}`;
      return (
        rowsByJobNumber.get(jobNumber) || {
          id: `missing-${jobNumber}`,
          jobNumber,
          client: "",
          location: "",
          dates: [],
          status: "Missing",
          count: 0,
          bookingCounts: { firstPencil: 0, secondPencil: 0, confirmed: 0, complete: 0, notHappening: 0 },
          isMissingJobNumber: true,
        }
      );
    });
  }, [searchTerm, selectedGroupJobs, selectedJobGroup]);

  const actionCard = (href, title, subtitle, pillText, Icon, color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder, compact = false) => (
    <Link
      href={href}
      style={{
        ...card,
        padding: compact ? 10 : card.padding,
        minHeight: compact ? 68 : undefined,
        display: "grid",
        alignContent: "space-between",
      }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, card)}
    >
      <div style={{ ...sectionHeader, marginBottom: compact ? 4 : sectionHeader.marginBottom }}>
        <div style={{ display: "flex", gap: "var(--space-2)", minWidth: 0 }}>
          <span style={{ ...iconBox(color, bg, border), width: compact ? 28 : 34, height: compact ? 28 : 34 }}>
            <Icon size={17} />
          </span>
          <div>
            <div style={cardTitle}>{title}</div>
            <div style={{ ...cardHint, marginTop: compact ? 2 : 5, fontSize: compact ? 12 : 12.5 }}>
              {subtitle}
            </div>
          </div>
        </div>
        <span style={chip()}>{pillText}</span>
      </div>
      {!compact && (
        <div style={{ display: "flex", justifyContent: "flex-end", color: UI.brand, marginTop: "var(--space-2)" }}>
          <ChevronRight size={17} />
        </div>
      )}
    </Link>
  );

  const jobNumberRow = (j, rowIndex = 0, rowCount = 1) => {
    if (j.isMissingJobNumber) {
      return (
        <div
          key={j.id}
          className="job-home-row"
          style={{
            ...jobNumberRowShell,
            color: UI.text,
          }}
        >
          <div style={{ display: "flex", gap: "var(--space-2)", minWidth: 0, alignItems: "center", overflow: "hidden" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                minWidth: 52,
                fontWeight: 900,
                color: UI.text,
                whiteSpace: "nowrap",
              }}
            >
              #{j.jobNumber}
            </span>
            <span aria-hidden="true" />
          </div>
          <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <Link
              href={`/create-enquiry?jobNumber=${encodeURIComponent(j.jobNumber)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                height: 24,
                padding: "0 8px",
                borderRadius: "var(--radius-sm)",
                border: UI.border,
                background: "var(--color-white)",
                color: UI.brand,
                fontSize: "var(--font-size-xs)",
                fontWeight: 900,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
              title={`Add enquiry for job #${j.jobNumber}`}
            >
              <Plus size={13} />
              Add enquiry
            </Link>
          </div>
          <div aria-hidden="true" />
          <div
            className="job-home-row-status"
            style={{
              justifySelf: "stretch",
              alignSelf: "stretch",
              display: "flex",
              alignItems: "stretch",
              width: "100%",
            }}
          >
            <StatusBadge value="Missing" rowIndex={rowIndex} rowCount={rowCount} />
          </div>
        </div>
      );
    }

    const ds = Array.isArray(j.dates) ? j.dates : normaliseDates(j).sort((a, b) => a.getTime() - b.getTime());
    const first = ds[0] ?? null;
    const last = ds[ds.length - 1] ?? null;
    const label = first && last ? `${fmtShort(first)} to ${fmtShort(last)}` : first ? fmtShort(first) : "TBC";
    const pretty = prettifyStatus(j.status || "");
    return (
      <Link key={j.id} href={j.href || `/job-numbers/${j.id}`} className="job-home-row" style={jobNumberRowShell}>
        <div style={{ display: "flex", gap: "var(--space-2)", minWidth: 0, alignItems: "center", overflow: "hidden" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minWidth: 52,
              fontWeight: 900,
              color: UI.text,
              whiteSpace: "nowrap",
            }}
          >
            #{j.jobNumber || j.id}
          </span>
          <span style={{ fontWeight: 800, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {j.client || "-"}
            {j.count > 1 ? <span style={{ color: UI.muted, fontWeight: 900 }}> ({j.count})</span> : null}
          </span>
        </div>
        <div
          style={{
            color: UI.text,
            fontSize: "var(--font-size-xs)",
            fontWeight: 800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title="First Pencil / Confirmed / Complete / DNH-Cancelled-Postponed"
        >
          FP {j.bookingCounts?.firstPencil || 0} · Confirmed {j.bookingCounts?.confirmed || 0} · Complete{" "}
          {j.bookingCounts?.complete || 0} · D/C/P {j.bookingCounts?.notHappening || 0}
        </div>
        <div style={{ fontSize: "var(--font-size-sm)", whiteSpace: "nowrap" }}>{label}</div>
        <div
          className="job-home-row-status"
          style={{
            justifySelf: "stretch",
            alignSelf: "stretch",
            display: "flex",
            alignItems: "stretch",
            width: "100%",
          }}
        >
          <StatusBadge value={pretty} rowIndex={rowIndex} rowCount={rowCount} />
        </div>
      </Link>
    );
  };

  const jobRow = (j, rowIndex = 0, rowCount = 1) => {
    const ds = normaliseDates(j).sort((a, b) => a.getTime() - b.getTime());
    const first = ds[0] ?? null;
    const last = ds[ds.length - 1] ?? null;
    const prefix = getJobPrefix(j);
    const label = first && last ? `${fmtShort(first)} to ${fmtShort(last)}` : first ? fmtShort(first) : "TBC";
    const pretty = prettifyStatus(j.status || "");
    return (
      <Link key={j.id} href={`/job-numbers/${j.id}`} className="job-home-row" style={rowShell}>
        <div style={{ display: "flex", gap: "var(--space-2)", minWidth: 0, alignItems: "center", overflow: "hidden" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minWidth: 52,
              fontWeight: 900,
              color: UI.text,
              whiteSpace: "nowrap",
            }}
          >
            #{j.jobNumber || j.id}
          </span>
          <span style={{ fontWeight: 800, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {j.client || "-"}
          </span>
        </div>
        <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {j.location || "-"}
        </div>
        <div style={{ fontSize: "var(--font-size-sm)", whiteSpace: "nowrap" }}>{label}</div>
        <div
          className="job-home-row-status"
          style={{
            justifySelf: "stretch",
            alignSelf: "stretch",
            display: "flex",
            alignItems: "stretch",
            width: "100%",
          }}
        >
          <StatusBadge value={pretty} rowIndex={rowIndex} rowCount={rowCount} />
        </div>
      </Link>
    );
  };

  const quoteRow = (quote, rowIndex = 0, rowCount = 1) => {
    const status = quote.status || "Draft";
    const statusKind = status === "Accepted" ? "green" : status === "Sent" || status === "Revised" ? "amber" : "neutral";
    return (
      <Link
        key={quote.id}
        href={`/quote/${quote.bookingId}?quote=${encodeURIComponent(quote.quoteNumber || "")}`}
        className="job-home-row"
        style={quoteRowShell}
      >
        <div style={{ display: "flex", gap: "var(--space-2)", minWidth: 0, alignItems: "center", overflow: "hidden" }}>
          <span style={{ fontWeight: 900, minWidth: 0, color: UI.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {quote.label || "-"}
          </span>
        </div>
        <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {quote.templateName || quote.location || "-"}
        </div>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 850, whiteSpace: "nowrap" }}>£{money(quote.subtotal)}</div>
        <div
          className="job-home-row-status"
          style={{
            justifySelf: "stretch",
            alignSelf: "stretch",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            alignItems: "center",
            width: "100%",
            paddingRight: "var(--space-1)",
          }}
        >
          <span
            style={{
              ...chip(statusKind),
              width: "100%",
              minHeight: 26,
              justifyContent: "center",
              borderRadius: `0 ${rowIndex === 0 ? UI.radius : 0}px ${rowIndex === rowCount - 1 ? UI.radius : 0}px 0`,
            }}
            title={`Saved ${formatQuoteDate(quote.savedAt)}`}
          >
            {status}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Jobs Home</h1>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/create-booking" style={actionButton("primary")}>
              <Plus size={14} />
              New Booking
            </Link>
            <Link href="/create-enquiry" style={actionButton()}>
              <FileText size={14} />
              New Enquiry
            </Link>
            <div style={chip()}>
              <BriefcaseBusiness size={13} /> {loading ? "Loading..." : `${total} jobs`}
            </div>
          </div>
        </div>

        <div className="job-home-top-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(300px, 1fr)", gap: 10, marginBottom: UI.gap, alignItems: "stretch" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="job-home-stat-grid" style={grid(4)}>
              <MetricCard
                label="Upcoming"
                value={grouped.Upcoming ?? 0}
                icon={CalendarDays}
                color={UI.brand}
                bg={UI.brandSoft}
                border={UI.brandBorder}
              />
              <MetricCard
                label="Review Queue"
                value={reviewQueueCount}
                icon={ClipboardList}
                color={UI.purple}
                bg={UI.purpleSoft}
                border={UI.purpleBorder}
              />
              <MetricCard
                label="Ready to Invoice"
                value={financeReadyCount}
                icon={Receipt}
                color={UI.green}
                bg={UI.greenSoft}
                border={UI.greenBorder}
              />
              <MetricCard
                label="Needs Action"
                value={grouped["Needs Action"] ?? 0}
                icon={AlertTriangle}
                color={UI.red}
                bg={UI.redSoft}
                border={UI.redBorder}
              />
            </div>

            <div className="job-home-shortcut-grid" style={grid(2)}>
              <section style={{ ...card, padding: 10 }}>
                <div style={{ display: "flex", gap: "var(--space-2)", minWidth: 0, alignItems: "center", marginBottom: "var(--space-2)" }}>
                  <span style={{ ...iconBox(UI.brand, UI.brandSoft, UI.brandBorder), width: 28, height: 28 }}>
                    <Search size={15} />
                  </span>
                  <h2 style={{ ...cardTitle, margin: 0 }}>Quick Search</h2>
                </div>
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} aria-hidden />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search jobs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ ...inputStyle, minHeight: 34, paddingTop: 6, paddingBottom: 6 }}
                    aria-label="Search jobs"
                  />
                </div>
              </section>
              {actionCard(
                "/enquiry",
                "Open Enquiries",
                "View enquiry jobs.",
                `${grouped.Enquiries ?? 0}`,
                Clock3,
                UI.amber,
                UI.amberSoft,
                UI.amberBorder,
                true
              )}
            </div>

          </div>

          <section style={{ ...card, alignSelf: "stretch", padding: 10 }}>
            <div style={{ ...sectionHeader, marginBottom: "var(--space-2)" }}>
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <span style={{ ...iconBox(UI.green, UI.greenSoft, UI.greenBorder), width: 28, height: 28 }}>
                  <ChevronRight size={17} />
                </span>
                <div>
                  <h2 style={titleMd}>Workflow</h2>
                </div>
              </div>
              <span style={chip("purple")}>Shortcuts</span>
            </div>
            <div className="job-home-workflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
              <WorkflowLink href="/review-queue" label="Review Queue" count={reviewQueueCount} tone="purple" />
              <WorkflowLink href="/finance-queue" label="Ready to Invoice" count={financeReadyCount} tone="green" />
              <WorkflowLink href="/completed-quotes" label="Completed Quotes" count={completedQuoteRows.length} tone="green" />
              <WorkflowLink href="/invoiced" label="Invoiced" count={invoicedCount} />
              <WorkflowLink href="/paid" label="Paid" count={paidCount} tone="green" />
            </div>
          </section>
        </div>

        <div className="job-home-groups-grid" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)", gap: UI.gap, marginBottom: UI.gap }}>
          <section style={{ ...card, padding: 9 }}>
            <div style={{ ...sectionHeader, marginBottom: 6 }}>
              <div style={{ display: "flex", gap: "var(--space-2)", minWidth: 0, alignItems: "center" }}>
                <span style={{ ...iconBox(UI.brand, UI.brandSoft, UI.brandBorder), width: 28, height: 28 }}>
                  <FolderKanban size={15} />
                </span>
                <div>
                  <h2 style={{ ...titleMd, fontSize: "var(--font-size-lg)" }}>Job Number Groups</h2>
                </div>
              </div>
              <span style={chip()}>{jobNumberGroups.length}</span>
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              <button
                type="button"
                onClick={() => setSelectedJobGroup("All")}
                style={groupButtonStyle(selectedJobGroup === "All")}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span>All</span>
                </span>
                <span style={chip(selectedJobGroup === "All" ? "green" : "neutral")}>{jobs.length}</span>
              </button>
              {jobNumberGroups.map(({ group, items, subgroups }) => {
                const hasSearchMatch = searchGroupMatches.groupSet.has(group);
                const isExpanded = !!expandedJobGroups[group] || (searchTerm && hasSearchMatch);
                const hasSubgroups = subgroups.length > 0;
                return (
                  <div key={group} style={{ display: "grid", gap: "var(--space-1)" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJobGroup(group);
                        if (hasSubgroups) setExpandedJobGroups((prev) => ({ ...prev, [group]: !prev[group] }));
                      }}
                      style={groupButtonStyle(selectedJobGroup === group || (searchTerm && hasSearchMatch))}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {hasSubgroups ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                        <span>{group === "Other" ? group : `${group}00`}</span>
                      </span>
                      <span style={chip(selectedJobGroup === group ? "green" : "neutral")}>{items.length}</span>
                    </button>

                    {isExpanded && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-1)", paddingLeft: "var(--space-3)" }}>
                        {subgroups.map(({ subgroup, items: subgroupItems }) => (
                          <button
                            key={subgroup}
                            type="button"
                            onClick={() => setSelectedJobGroup(subgroup)}
                            style={{
                              ...groupButtonStyle(selectedJobGroup === subgroup || (searchTerm && searchGroupMatches.subgroupSet.has(subgroup))),
                              minHeight: 28,
                              fontSize: 13.5,
                              padding: "3px 7px",
                              boxShadow: "none",
                              justifyContent: "center",
                            }}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span>{subgroup === "Other" ? subgroup : `${subgroup}0`}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <PipelinePanel
            title={searchTerm ? "Job Number Search" : selectedJobGroup === "All" ? "Latest Job Numbers" : `Job Numbers ${selectedJobGroup}`}
            hintText=""
            href="/job-sheet"
            linkText="Job sheet"
            loading={loading}
            emptyText={searchTerm ? "No jobs match your search." : "No jobs in this group."}
            rows={selectedJobNumberRows}
            renderRow={jobNumberRow}
            icon={FolderKanban}
            compact
          />
        </div>

        <div className="job-home-pipeline-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap }}>
          <PipelinePanel
            title="Upcoming This Week"
            hintText="Jobs scheduled within the current week window."
            href="/job-sheet?section=Upcoming"
            linkText="View all"
            loading={loading}
            emptyText="Nothing scheduled this week."
            rows={upcomingThisWeek}
            renderRow={jobRow}
            icon={CalendarDays}
          />
          <PipelinePanel
            title="Review Queue"
            hintText="Jobs ready for review actions and completion checks."
            href="/review-queue"
            linkText="Open queue"
            loading={loading}
            emptyText="No jobs to review."
            rows={reviewQueuePreview}
            renderRow={jobRow}
            icon={ClipboardList}
            color={UI.purple}
            bg={UI.purpleSoft}
            border={UI.purpleBorder}
          />
          <PipelinePanel
            title="Ready to Invoice"
            hintText="Jobs prepared for pricing and invoice issue."
            href="/finance-queue"
            linkText="Open queue"
            loading={loading}
            emptyText="Nothing awaiting pricing."
            rows={financeQueuePreview}
            renderRow={jobRow}
            icon={Receipt}
            color={UI.green}
            bg={UI.greenSoft}
            border={UI.greenBorder}
          />
          <PipelinePanel
            title="Completed Quotes"
            hintText="Latest saved quotes across bookings."
            href="/completed-quotes"
            linkText="View all"
            loading={loading}
            emptyText="No completed quotes yet."
            rows={completedQuotePreview}
            renderRow={quoteRow}
            icon={FileText}
            color={UI.green}
            bg={UI.greenSoft}
            border={UI.greenBorder}
          />
          <PipelinePanel
            title="Recent Jobs"
            hintText="Latest booked and completed work in the system."
            href="/job-sheet"
            linkText="Job sheet"
            loading={loading}
            emptyText="No recent jobs."
            rows={recent}
            renderRow={jobRow}
            icon={BriefcaseBusiness}
          />
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

function WorkflowLink({ href, label, count, tone = "neutral" }) {
  return (
    <Link
      href={href}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto 14px",
        gap: 6,
        alignItems: "center",
        minHeight: "var(--control-height-sm)",
        padding: "5px 8px",
        borderRadius: UI.radiusSm,
        border: UI.border,
        background: "var(--color-white)",
        color: UI.text,
        textDecoration: "none",
        fontSize: 12.5,
        fontWeight: 800,
      }}
    >
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={chip(tone)}>{count}</span>
      <ChevronRight size={14} color={UI.brand} />
    </Link>
  );
}

function PipelinePanel({
  title,
  hintText,
  href,
  linkText,
  loading,
  emptyText,
  rows,
  renderRow,
  icon: Icon,
  color = UI.brand,
  bg = UI.brandSoft,
  border = UI.brandBorder,
  compact = false,
}) {
  return (
    <section style={{ ...card, minHeight: compact ? 0 : 200, padding: compact ? 9 : card.padding }}>
      <div style={{ ...sectionHeader, marginBottom: compact ? 6 : sectionHeader.marginBottom }}>
        <div style={{ display: "flex", gap: compact ? 8 : 10, minWidth: 0, alignItems: "center" }}>
          <span style={{ ...iconBox(color, bg, border), width: compact ? 28 : 34, height: compact ? 28 : 34 }}>
            <Icon size={17} />
          </span>
          <div>
            <h2 style={titleMd}>{title}</h2>
            {hintText ? <div style={{ ...cardHint, marginTop: compact ? 2 : 5 }}>{hintText}</div> : null}
          </div>
        </div>
        <Link
          href={href}
          style={{
            ...chip(),
            ...(compact ? { width: 92, height: 28, justifyContent: "center", borderRadius: "var(--radius-sm)", padding: "0 8px" } : {}),
            color: UI.brand,
            textDecoration: "none",
          }}
        >
          {linkText} <ChevronRight size={13} />
        </Link>
      </div>
      <div style={listShell}>
        {loading ? (
          <div style={{ padding: "var(--space-3)", color: UI.muted, fontSize: "var(--font-size-sm)" }}>Loading...</div>
        ) : rows.length ? (
          rows.map((row, index) => renderRow(row, index, rows.length))
        ) : (
          <div style={{ padding: "var(--space-3)", color: UI.muted, fontSize: "var(--font-size-sm)" }}>{emptyText}</div>
        )}
      </div>
    </section>
  );
}
