"use client";

import layoutStyles from "./page.styles.module.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DailyBriefingPanel from "./DailyBriefingPanel";
import { Button, Page, PageHeader, Panel } from "@/app/components/ui";
import {
  CalculationDetails,
  CompactRankingTable,
  DrilldownModal,
  HeadlineCards,
  SectionAnalysisPanel,
  StatisticsFilterToolbar,
  StatisticsTabs,
  TabHeading,
  styles,
} from "./StatisticsDashboardComponents";
import { buildBookingAnalytics, normaliseBookingForAnalytics } from "@/app/utils/bookingAnalytics";
import { buildFilteredStatisticsSectionAnalysis } from "@/app/utils/statisticsInsightSnapshot";
import {
  getPreviousMonthKey,
  getStatisticsDateRange,
  matchesStatisticsFilters,
} from "@/app/utils/statisticsFilters";
import { buildMonthlyVisualSummary, getStatisticsMonthPhase } from "@/app/utils/statisticsVisualAnalysis";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Download,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { FIXED_JOB_STATUS_STYLES } from "@/app/utils/jobStatusColors";

function StatisticsEmptyState({ title, description, action = null }) {
  return (
    <Panel className={styles.panelPadding} role="status">
      <h2 className={styles.panelTitle}>{title}</h2>
      <p className={styles.panelMeta}>{description}</p>
      {action ? <div className={styles.emptyStateAction}>{action}</div> : null}
    </Panel>
  );
}

/* ------------------------------- Styling tokens ------------------------------- */
const UI = UI_TOKENS;

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = {
  color: UI.text,
  fontSize: "var(--font-size-xl)",
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: 0,
  margin: 0,
};
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6, maxWidth: 760 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: "var(--radius-pill)",
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: "var(--font-size-xs)",
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});
const card = {
  ...surface,
  padding: "var(--space-3)",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: UI.brandBorder };
const filterSelectStyle = {
  width: "100%",
  minHeight: "var(--control-height-md)",
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: 13.5,
  outline: "none",
  background: "var(--color-surface)",
  color: UI.text,
  boxSizing: "border-box",
};
const panel = { ...surface, padding: "var(--space-3)" };
const sectionTitle = { fontWeight: 800, fontSize: "var(--font-size-lg)", color: UI.text, lineHeight: 1.2 };
const sectionMeta = { color: UI.muted, fontSize: 12.5, lineHeight: 1.4 };
const statLabel = { color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const statValue = { fontSize: "var(--font-size-xl)", fontWeight: 800, color: UI.text, lineHeight: 1.1 };

const statisticsCss = `
  @media (max-width: 1180px) {
    .statistics-two-col {
      grid-template-columns: 1fr !important;
    }
    .statistics-header-actions {
      justify-content: flex-start !important;
      width: 100%;
    }
  }

  @media (max-width: 760px) {
    .statistics-bar-row,
    .statistics-job-row {
      grid-template-columns: 1fr !important;
    }
    .statistics-shortcuts {
      grid-template-columns: 1fr !important;
    }
    .statistics-table-heading,
    .statistics-table-row {
      min-width: 760px !important;
    }
  }
`;

const mono = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

const displayToken = (value) => {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return (
    value.name ||
    value.label ||
    value.fullName ||
    [value.firstName, value.lastName].filter(Boolean).join(" ").trim() ||
    value.registration ||
    value.id ||
    ""
  );
};

function downloadCSV(filename, rows) {
  if (typeof window === "undefined" || !rows.length) return;
  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const severityStyles = {
  high: { border: "var(--color-danger-border)", bg: UI.dangerSoft, text: UI.dangerText },
  medium: { border: UI.warningBorder, bg: UI.warningSoft, text: "var(--color-warning)" },
  neutral: { border: "var(--color-border)", bg: "var(--color-white)", text: UI.text },
};

/* Section */
const norm = (s = "") => String(s || "").toLowerCase().trim();

const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate(); // Firestore Timestamp

    // Safer parse for YYYY-MM-DD, avoiding BST off-by-one shifts.
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T00:00:00.000Z`);
    }

    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const fmtDDMMYY = (d) => {
  if (!d) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const isoDay = (d) => {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD
};

const normaliseJobDates = (job) => {
  // Prefer bookingDates array of "YYYY-MM-DD"
  const out = [];
  if (Array.isArray(job?.bookingDates) && job.bookingDates.length) {
    for (const x of job.bookingDates) {
      const d = parseDate(x);
      if (d) out.push(d);
    }
  } else if (job?.startDate && job?.endDate) {
    const sd = parseDate(job.startDate);
    const ed = parseDate(job.endDate);
    if (sd && ed) {
      const cursor = new Date(sd);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(ed);
      end.setHours(0, 0, 0, 0);
      while (cursor.getTime() <= end.getTime()) {
        out.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (sd) out.push(sd);
  } else if (job?.date) {
    const d = parseDate(job.date);
    if (d) out.push(d);
  } else if (job?.startDate) {
    const d = parseDate(job.startDate);
    if (d) out.push(d);
  }

  const seen = new Set();
  return out
    .map((d) => {
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      return dd;
    })
    .filter((d) => {
      const k = d.toISOString().slice(0, 10);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a - b);
};

const getJobDateEntries = (job) => {
  if (Array.isArray(job?.bookingDates) && job.bookingDates.length) {
    const seen = new Set();
    return job.bookingDates
      .map((raw) => String(raw || "").slice(0, 10))
      .filter((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso))
      .filter((iso) => {
        if (seen.has(iso)) return false;
        seen.add(iso);
        return true;
      })
      .map((iso) => ({ iso, date: parseDate(iso) }))
      .filter((entry) => entry.date)
      .sort((a, b) => a.iso.localeCompare(b.iso));
  }

  return normaliseJobDates(job).map((date) => ({ iso: isoDay(date), date }));
};

const isFourDigitJob = (job) => /^\d{4}$/.test(String(job?.jobNumber ?? "").trim());

const prettifyStatus = (raw) => {
  const s = norm(raw);
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  if (s === "dnh") return "DNH";
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("postpon")) return "Postponed";
  if (s.includes("lost")) return "Lost";
  if (s.includes("maintenance")) return "Maintenance";
  if (s.includes("holiday")) return "Holiday";
  if (s.includes("enquiry") || s.includes("inquiry")) return "Enquiry";
  return (
    s
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC"
  );
};

const statusColors = (label) => {
  if (FIXED_JOB_STATUS_STYLES[label]) return FIXED_JOB_STATUS_STYLES[label];
  switch (label) {
    case "Confirmed":
      return { bg: "var(--color-warning-border)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "First Pencil":
      return { bg: "var(--color-info-border)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "Second Pencil":
      return { bg: "var(--color-warning)", text: "var(--color-white)", border: "var(--color-border-strong)" };
    case "Complete":
      return { bg: "var(--color-success-accent)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "Action Required":
      return { bg: "var(--color-warning-border)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "Maintenance":
      return { bg: "var(--color-accent)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "Bickers":
      return { bg: "var(--color-white)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "Stunt":
      return { bg: "var(--color-warning-border)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "Holiday":
      return { bg: "var(--color-border-strong)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "DNH":
    case "Postponed":
    case "Deleted":
      return { bg: "var(--shell-muted)", text: "var(--color-text)", border: "var(--shell-muted)" };
    case "Ready to Invoice":
      return { bg: "var(--color-accent-soft)", border: "var(--color-warning-border)", text: "var(--color-warning)" };
    case "Invoiced":
      return { bg: "var(--color-brand-soft)", border: "var(--color-info-border)", text: "var(--color-brand)" };
    case "Paid":
      return { bg: "var(--color-success-accent)", text: "var(--color-text)", border: "var(--color-border-strong)" };
    case "Cancelled":
      return { bg: "var(--color-canvas)", border: "var(--color-border)", text: "var(--color-text-muted)" };
    case "Enquiry":
      return { bg: "var(--color-canvas)", border: "var(--color-border)", text: "var(--color-text-muted)" };
    case "TBC":
      return { bg: "var(--color-canvas)", border: "var(--color-border)", text: "var(--color-text-muted)" };
    default:
      return { bg: "var(--color-border)", border: "var(--color-border)", text: "var(--color-text)" };
  }
};

const STACKED_STATUS_ORDER = [
  "Complete",
  "Confirmed",
  "First Pencil",
  "Second Pencil",
  "Ready to Invoice",
  "Invoiced",
  "Paid",
  "Action Required",
  "Maintenance",
  "Bickers",
  "Stunt",
  "Holiday",
  "Enquiry",
  "DNH",
  "Postponed",
  "Cancelled",
  "Deleted",
  "TBC",
];

const statusOrderIndex = (label) => {
  const index = STACKED_STATUS_ORDER.indexOf(label);
  return index === -1 ? STACKED_STATUS_ORDER.length : index;
};

const StatusBadge = ({ value }) => {
  const c = statusColors(value);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 8px",
        fontSize: 11,
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
};

const clampTopN = (entries, n = 8) =>
  [...entries].sort((a, b) => (b?.[1] || 0) - (a?.[1] || 0)).slice(0, n);

const inc = (map, key, by = 1) => {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + by);
};

const yyyymm = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

const monthInputValue = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthBounds = (ym) => {
  const [rawYear, rawMonth] = String(ym || "").split("-").map(Number);
  const now = new Date();
  const year = rawYear || now.getFullYear();
  const monthIndex = rawMonth ? rawMonth - 1 : now.getMonth();
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const toCrewNames = (employees) => {
  if (!Array.isArray(employees)) return [];
  return employees
    .map((e) => {
      if (!e) return "";
      if (typeof e === "string") return e;
      if (typeof e === "object")
        return e.name || [e.firstName, e.lastName].filter(Boolean).join(" ") || e.email || "";
      return "";
    })
    .map((s) => String(s || "").trim())
    .filter(Boolean);
};

const toVehicleTokens = (vehicles) => {
  if (!Array.isArray(vehicles)) return [];
  return vehicles
    .map((v) => {
      if (!v) return "";
      if (typeof v === "string") return v.trim();
      if (typeof v === "object") {
        const name = v.name || [v.manufacturer, v.model].filter(Boolean).join(" ").trim();
        const reg = v.registration ? String(v.registration).toUpperCase() : "";
        return reg ? `${name} - ${reg}` : name || "";
      }
      return "";
    })
    .filter(Boolean);
};

const toEquipmentTokens = (equipment) => {
  if (!equipment) return [];
  if (Array.isArray(equipment)) return equipment.map((x) => String(x || "").trim()).filter(Boolean);
  if (typeof equipment === "string") return [equipment.trim()].filter(Boolean);
  return [];
};

const DELETED_BOOKING_WRAPPER_KEYS = new Set([
  "booking",
  "data",
  "payload",
  "deletedAt",
  "deletedBy",
  "originalCollection",
  "originalId",
  "deleteReasons",
  "deleteReasonOther",
  "restoredAt",
  "restoredBy",
]);

const getDeletedBookingPayload = (entry = {}) => {
  if (entry?.data && typeof entry.data === "object") return entry.data;
  if (entry?.payload && typeof entry.payload === "object") return entry.payload;
  if (entry?.booking && typeof entry.booking === "object") return entry.booking;

  return Object.fromEntries(
    Object.entries(entry || {}).filter(([key]) => !DELETED_BOOKING_WRAPPER_KEYS.has(key))
  );
};

const historyMentionsFirstPencil = (job = {}) => {
  if (prettifyStatus(job?.status || "") === "First Pencil") return true;

  const history = Array.isArray(job?.history) ? job.history : [];
  return history.some((item) => {
    const blob = [
      item?.action,
      item?.details,
      ...(Array.isArray(item?.changes) ? item.changes : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return blob.includes("first pencil");
  });
};

const getJobLengthDays = (job = {}) => {
  const days = normaliseJobDates(job);
  return days.length;
};

const classifyLengthBucket = (days) => {
  if (days <= 1) return "1 day";
  if (days === 2) return "2 days";
  if (days <= 5) return "3-5 days";
  if (days <= 10) return "6-10 days";
  return "11+ days";
};

const pct = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : 0);

/* Section */
const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/gbp/gi, "").replace(/[£?$,]/g, "").replace(/\s+/g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
};
const gbp = (v) =>
  `£${(Number.isFinite(v) ? v : 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Pull hotel info robustly from different field names
const getHotelForJob = (job = {}) => {
  const hasHotelFlag = !!job.hasHotel || !!job.hotel || !!job.hotelRequired;

  const paidByRaw = String(job.hotelPaidBy ?? job.hotelPaid ?? job.hotelPayer ?? "").trim();
  const paidBy = paidByRaw || "Unknown";
  const isProductionPaid = paidBy.toLowerCase() === "production";

  const costPerNight = num(
    job.hotelCostPerNight ??
      job.hotelRate ??
      job.hotelCost ??
      job.hotelPricePerNight ??
      job.hotelAmountPerNight ??
      0
  );

  const nights = int(job.hotelNights ?? job.nights ?? job.hotelQty ?? job.hotelNumberOfNights ?? 0);

  // Prefer explicit total if present
  let total = num(job.hotelTotal ?? job.hotelTotalCost ?? job.hotelCostTotal ?? 0);
  if (!total && costPerNight && nights) total = costPerNight * nights;

  // If hasHotel is true but we have no numbers, still count it as a hotel job
  const hasAnyNumber = costPerNight > 0 || nights > 0 || total > 0;

  return {
    hasHotel: hasHotelFlag || hasAnyNumber,
    paidBy,
    isProductionPaid,
    costPerNight,
    nights,
    //  analytics total: exclude production-paid spend
    total: isProductionPaid ? 0 : total,
    // optional: raw total if you ever want to show "production-paid total"
    rawTotal: total,
  };
};

/* Section */
const getNoteForISODate = (job, iso) => {
  if (!job || !iso) return "";

  const direct =
    (job.notesByDate && job.notesByDate[iso]) ||
    (job.dayNotes && job.dayNotes[iso]) ||
    (job.noteByDate && job.noteByDate[iso]) ||
    "";

  if (direct) {
    const directText = String(direct);
    if (norm(directText) === "other") {
      return String(
        (job.notesByDate && job.notesByDate[`${iso}-other`]) ||
          (job.dayNotes && job.dayNotes[`${iso}-other`]) ||
          (job.noteByDate && job.noteByDate[`${iso}-other`]) ||
          directText
      );
    }
    return directText;
  }

  const scanArrays = (arr) => {
    if (!Array.isArray(arr)) return "";
    const hit = arr.find((x) => {
      const d = x?.date || x?.day || x?.iso || "";
      return String(d).slice(0, 10) === iso;
    });
    return hit ? String(hit.note || hit.value || hit.label || "") : "";
  };

  const a = scanArrays(job.notesForEachDay) || scanArrays(job.dailyNotes) || scanArrays(job.notesPerDay) || "";
  if (a) return a;

  return String(job.noteForDay || job.note || "");
};

const isShootNote = (note) => {
  const s = norm(note);
  if (!s) return false;
  if (s === "on set" || s.includes("on set")) return true;
  if (s === "night shoot" || s.includes("night shoot")) return true;
  if (s.includes("shoot day")) return true;
  if (s === "shoot") return true;
  return false;
};

const getCreditForNote = (note) => {
  const s = norm(note).replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (!s) return 0;

  if (
    s.includes("1/2 travel day") ||
    s.includes("1/2 day travel") ||
    s.includes("half travel day") ||
    s.includes("half day travel")
  ) return 0.5;
  if (s.includes("travel time")) return 0.25;
  if (s.includes("onset") || s.includes("on set")) return 1;
  if (s.includes("nightshoot") || s.includes("night shoot")) return 1;
  if (s.includes("travel day")) return 1;
  if (s.includes("split day") || s.includes("spilt day")) return 1;
  if (s.includes("standby day") || s.includes("stand by day")) return 1;
  if (s.includes("rehearsal day")) return 1;

  return 0;
};

const getCreditSkipReason = (note, prettyStatus) => {
  if (!shouldCountShootFromStatus(prettyStatus)) return `Status excluded: ${prettyStatus || "TBC"}`;
  if (!String(note || "").trim()) return "No note saved for this date";
  return "Note is not a credit type";
};

const formatCredits = (value) => {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const shouldCountShootFromStatus = (prettyStatus) => {
  const s = norm(prettyStatus);
  if (s.includes("cancel")) return false;
  if (s.includes("lost")) return false;
  if (s.includes("postpon")) return false;
  if (s.includes("maintenance")) return false;
  if (s === "dnh") return false;
  return true;
};

const shouldCountBookingDayForStatus = (prettyStatus, date, today = new Date()) => {
  const s = norm(prettyStatus);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);

  if (day.getTime() < t.getTime()) {
    return s === "complete" || s === "confirmed";
  }

  return s === "confirmed" || s === "first pencil" || s === "second pencil";
};

const isInactiveStatus = (prettyStatus) => {
  const s = norm(prettyStatus);
  return s === "dnh" || s.includes("postpon") || s.includes("cancel") || s.includes("lost") || s.includes("maintenance");
};

const insightBoxStyle = {
  marginTop: 8,
  padding: "7px 9px",
  borderLeft: "3px solid var(--color-brand)",
  borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
  background: "var(--color-brand-soft)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-xs)",
  lineHeight: 1.45,
};

const numberLabel = (value) => {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
};

const monthlyVisualSummary = buildMonthlyVisualSummary;

const categoryVisualSummary = (data = [], unit = "items", valueKey = "value") => {
  const rows = data.map((row) => ({ ...row, amount: Number(row[valueKey] || 0) })).filter((row) => row.amount > 0).sort((a, b) => b.amount - a.amount);
  if (!rows.length) return `There is no ${unit.toLowerCase()} data in this selection.`;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const leader = rows[0];
  const share = total ? Math.round((leader.amount / total) * 1000) / 10 : 0;
  return `${leader.label} is the largest category with ${numberLabel(leader.amount)} ${unit.toLowerCase()} (${share}% of the displayed total).`;
};

/* Section */
function BarChart({ title, subtitle, summary, monthly = false, data = [], rightLabel = "Count", valueFormatter }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  const visualSummary = summary || (monthly ? monthlyVisualSummary(data, rightLabel, "value") : categoryVisualSummary(data, rightLabel, "value"));
  return (
    <div style={panel}>
      <div
        className={layoutStyles.extracted1}
      >
        <div>
          <div style={sectionTitle}>{title}</div>
          {subtitle ? <div style={{ ...sectionMeta, marginTop: 3 }}>{subtitle}</div> : null}
          <div className={layoutStyles.extracted2}><b>Summary:</b> {visualSummary}</div>
        </div>
        <div style={chip}>{rightLabel}</div>
      </div>

      <div className={layoutStyles.extracted3}>
        {data.length ? (
          data.map((row) => (
            <div
              key={row.label}
              className={`statistics-bar-row ${layoutStyles.extracted4}`}

            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "var(--font-size-sm)",
                  color: UI.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  background: "var(--color-brand-soft)",
                  border: UI.border,
                  height: 10,
                  borderRadius: "var(--radius-pill)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, (row.value / max) * 100)}%`,
                    height: "100%",
                    background: UI.brand,
                  }}
                />
              </div>
              <div className={layoutStyles.extracted5}>
                {valueFormatter ? valueFormatter(row.value) : row.value}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>No data.</div>
        )}
      </div>
    </div>
  );
}

function StackedBarChart({ title, subtitle, summary, data = [], rightLabel = "Count", valueFormatter }) {
  const max = Math.max(1, ...data.map((row) => row.total || 0));
  const visualSummary = summary || monthlyVisualSummary(data, rightLabel, "total");
  const firstPipelineIndex = data.findIndex((row) => getStatisticsMonthPhase(row.label) === "pipeline");
  const segmentLabels = [];
  const seen = new Set();

  data.forEach((row) => {
    (row.segments || []).forEach((segment) => {
      if (!seen.has(segment.label)) {
        seen.add(segment.label);
        segmentLabels.push(segment.label);
      }
    });
  });
  segmentLabels.sort((a, b) => statusOrderIndex(a) - statusOrderIndex(b) || a.localeCompare(b));

  return (
    <div style={panel}>
      <div
        className={layoutStyles.extracted6}
      >
        <div className={layoutStyles.extracted7}>
          <div style={sectionTitle}>{title}</div>
          {subtitle ? <div style={{ ...sectionMeta, marginTop: 3 }}>{subtitle}</div> : null}
        </div>
        <div style={chip}>{rightLabel}</div>
        <div className={layoutStyles.extracted8}><b>Summary:</b> {visualSummary}</div>
      </div>

      <div className={layoutStyles.extracted9}>
        {segmentLabels.map((label) => {
          const colors = statusColors(label);
          return (
            <span key={label} style={{ ...chip, padding: "4px 8px", background: colors.bg, borderColor: colors.border, color: colors.text }}>
              {label}
            </span>
          );
        })}
      </div>

      <div className={layoutStyles.extracted10}>
        {data.length ? (
          data.map((row, index) => {
            const pipeline = getStatisticsMonthPhase(row.label) === "pipeline";
            return (
              <div key={row.label} className={layoutStyles.extracted11}>
                {index === firstPipelineIndex ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 2px", color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800 }}>
                    <span className={layoutStyles.extracted12} />
                    Current and forward pipeline · incomplete
                    <span className={layoutStyles.extracted13} />
                  </div>
                ) : null}
                <div
                  className="statistics-bar-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr 80px",
                    gap: "var(--space-2)",
                    alignItems: "center",
                    opacity: pipeline ? 0.82 : 1,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "var(--font-size-sm)",
                      color: UI.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {row.label}
                  </div>
                  <div
                    title={(row.segments || []).map((s) => `${s.label}: ${s.value}`).join(", ")}
                    style={{
                      background: "var(--color-brand-soft)",
                      border: pipeline ? `1px dashed ${UI.brandBorder}` : UI.border,
                      height: 12,
                      borderRadius: "var(--radius-pill)",
                      overflow: "hidden",
                      display: "flex",
                      width: `${Math.max(2, (row.total / max) * 100)}%`,
                      minWidth: 2,
                    }}
                  >
                    {(row.segments || []).map((segment) => {
                      const colors = statusColors(segment.label);
                      return (
                        <div
                          key={segment.label}
                          style={{
                            width: `${Math.max(0, (segment.value / row.total) * 100)}%`,
                            height: "100%",
                            background: colors.bg,
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className={layoutStyles.extracted14}>
                    {valueFormatter ? valueFormatter(row.total) : row.total}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>No data.</div>
        )}
      </div>
    </div>
  );
}

/* Section */
function AnalyticsSummarySection({ title, summary, items = [] }) {
  return (
    <div style={panel}>
      <div style={sectionTitle}>{title}</div>
      {summary ? <div className={layoutStyles.extracted15}><b>Summary:</b> {summary}</div> : null}
      <div className={layoutStyles.extracted16}>
        {items.map((item) => (
          (() => {
            const severity = severityStyles[item.severity] || severityStyles.neutral;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                style={{
                  border: `1px solid ${severity.border}`,
                  borderRadius: UI.radius,
                  padding: "9px 10px",
                  background: severity.bg,
                  textAlign: "left",
                  cursor: item.onClick ? "pointer" : "default",
                }}
              >
                <div style={{ ...statLabel, color: item.severity ? severity.text : UI.muted }}>{item.label}</div>
                <div style={{ ...statValue, marginTop: "var(--space-1)", color: severity.text }}>{item.value}</div>
              </button>
            );
          })()
        ))}
      </div>
    </div>
  );
}
function UsageTable({ title, rows = [], onRowClick }) {
  return (
    <div style={panel}>
      <div className={layoutStyles.extracted17}>
        <div style={sectionTitle}>{title}</div>
        <div style={sectionMeta}>{rows.length} item(s)</div>
      </div>
      <div className={layoutStyles.extracted18}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 60px 86px 70px", gap: "var(--space-2)", ...statLabel }}>
          <span>Name</span>
          <span className={layoutStyles.extracted19}>Jobs</span>
          <span className={layoutStyles.extracted20}>Days</span>
          <span className={layoutStyles.extracted21}>Credits</span>
        </div>
        {rows.slice(0, 8).map((row) => (
          <button
            key={row.name}
            type="button"
            onClick={() => onRowClick?.(row)}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) 60px 86px 70px",
              gap: "var(--space-2)",
              alignItems: "center",
              border: "none",
              borderTop: "1px solid var(--color-brand-soft)",
              padding: "6px 0 0",
              background: "transparent",
              color: UI.text,
              fontSize: "var(--font-size-sm)",
              textAlign: "left",
              cursor: onRowClick ? "pointer" : "default",
            }}
          >
            <span className={layoutStyles.extracted22}>{row.name}</span>
            <span className={layoutStyles.extracted23}>{row.count}</span>
            <span className={layoutStyles.extracted24}>{row.bookingDays}</span>
            <span className={layoutStyles.extracted25}>{formatCredits(row.credits)}</span>
          </button>
        ))}
        {!rows.length && <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>No data for this filter.</div>}
      </div>
    </div>
  );
}

function MonthlyPerformanceTable({ rows = [], onMonthClick }) {
  const summary = monthlyVisualSummary(rows.map((row) => ({ label: monthLabel(row.month), value: row.bookings })), "Bookings", "value");
  return (
    <div style={panel}>
      <div style={sectionTitle}>Monthly performance</div>
      <div className={layoutStyles.extracted26}><b>Summary:</b> {summary}</div>
      <div className={layoutStyles.extracted27}>
        <div className="statistics-table-heading" style={{ display: "grid", gridTemplateColumns: "110px repeat(6, 1fr)", gap: "var(--space-2)", minWidth: 680, ...statLabel }}>
          <span>Month</span>
          <span>Bookings</span>
          <span>Days</span>
          <span>Credits</span>
          <span>Shoot</span>
          <span>Travel</span>
          <span>Night</span>
        </div>
        {rows.slice(-12).map((row) => (
          <button
            key={row.month}
            type="button"
            onClick={() => onMonthClick?.(row)}
            className="statistics-table-row"
            style={{
              display: "grid",
              gridTemplateColumns: "110px repeat(6, 1fr)",
              gap: "var(--space-2)",
              minWidth: 680,
              border: "none",
              borderTop: "1px solid var(--color-brand-soft)",
              padding: "6px 0 0",
              background: "transparent",
              color: UI.text,
              fontSize: "var(--font-size-sm)",
              textAlign: "left",
              cursor: onMonthClick ? "pointer" : "default",
            }}
          >
            <b>{monthLabel(row.month)}</b>
            <span>{row.bookings}</span>
            <span>{row.bookingDays}</span>
            <span>{formatCredits(row.credits)}</span>
            <span>{row.shootDays}</span>
            <span>{formatCredits(row.travelDays)}</span>
            <span>{row.nightShoots}</span>
          </button>
        ))}
        {!rows.length && <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>No monthly data in current filters.</div>}
      </div>
    </div>
  );
}

function DrilldownPanel({ drilldown, onClose, onExport, formatVehicle }) {
  if (!drilldown) return null;

  return (
    <div style={{ ...panel, marginBottom: UI.gap, borderColor: UI.brandBorder }}>
      <div className={layoutStyles.extracted28}>
        <div>
          <div style={sectionTitle}>{drilldown.title}</div>
          <div style={sectionMeta}>
            {drilldown.bookings.length} booking{drilldown.bookings.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className={layoutStyles.extracted29}>
          <button type="button" onClick={onExport} disabled={!drilldown.bookings.length} style={{ ...chip, cursor: drilldown.bookings.length ? "pointer" : "not-allowed", opacity: drilldown.bookings.length ? 1 : 0.55 }}>
            <Download size={14} />
            Export CSV
          </button>
          <button type="button" onClick={onClose} style={{ ...chip, cursor: "pointer" }}>
            <X size={14} />
            Clear
          </button>
        </div>
      </div>
      <div className={layoutStyles.extracted30}>
        <div className="statistics-table-heading" style={{ display: "grid", gridTemplateColumns: "90px 180px 120px 90px 90px 90px 80px 220px 220px", gap: "var(--space-2)", minWidth: 1180, ...statLabel }}>
          <span>Job #</span>
          <span>Client</span>
          <span>Status</span>
          <span>First</span>
          <span>Last</span>
          <span>Days</span>
          <span>Credits</span>
          <span>Vehicles</span>
          <span>Crew</span>
        </div>
        {drilldown.bookings.map((booking) => (
          <Link
            key={booking.id || booking.jobNumber}
            href={`/view-booking/${booking.id}`}
            className="statistics-table-row"
            style={{
              display: "grid",
              gridTemplateColumns: "90px 180px 120px 90px 90px 90px 80px 220px 220px",
              gap: "var(--space-2)",
              minWidth: 1180,
              borderTop: "1px solid var(--color-brand-soft)",
              paddingTop: 6,
              color: UI.text,
              textDecoration: "none",
              fontSize: "var(--font-size-sm)",
            }}
          >
            <b>{booking.jobNumber || "-"}</b>
            <span className={layoutStyles.extracted31}>{booking.client || "-"}</span>
            <span>{booking.status || "-"}</span>
            <span>{booking.firstDate || "-"}</span>
            <span>{booking.lastDate || "-"}</span>
            <span>{booking.bookingDayCount}</span>
            <span>{formatCredits(booking.creditTotal)}</span>
            <span className={layoutStyles.extracted32}>
              {booking.vehicles?.map((vehicle) => formatVehicle(displayToken(vehicle))).filter(Boolean).join(", ") || "-"}
            </span>
            <span className={layoutStyles.extracted33}>
              {booking.employees?.map(displayToken).filter(Boolean).join(", ") || "-"}
            </span>
          </Link>
        ))}
        {!drilldown.bookings.length && <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>No matching bookings.</div>}
      </div>
    </div>
  );
}

export default function StatisticsPage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [deletedBookings, setDeletedBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");

  const [rangeMode, setRangeMode] = useState("12m"); // 30d | 90d | 12m | month | all
  const [selectedMonth, setSelectedMonth] = useState(() => monthInputValue(new Date()));
  const [compareMonth, setCompareMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return monthInputValue(d);
  });
  const [statusFilter, setStatusFilter] = useState("All");
  const [clientFilter, setClientFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [drilldown, setDrilldown] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [briefingState, setBriefingState] = useState({ loading: true, briefing: null, variant: "booking" });
  const handleBriefingState = useCallback((next) => setBriefingState(next), []);

  useEffect(() => {
    const previous = getPreviousMonthKey(selectedMonth);
    if (previous) setCompareMonth(previous);
  }, [selectedMonth]);

  // Live bookings
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "listen statistics bookings" });
      setBookings([]);
      setLoading(false);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "bookings", operation: "listen statistics bookings" });
      setBookings([]);
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  // Live deletedBookings (optional but useful for analytics)
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "deletedBookings", operation: "listen statistics deleted bookings" });
      setDeletedBookings([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "deletedBookings", dataAccessState), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setDeletedBookings(list);
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "deletedBookings", operation: "listen statistics deleted bookings" });
      setDeletedBookings([]);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  // Load vehicles once (for ID->name/reg resolution)
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "read statistics vehicles" });
      setVehicles([]);
      return undefined;
    }
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState));
        if (!mounted) return;
        setVehicles(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
      } catch (error) {
        handleFirestoreAccessError(error, { collectionName: "vehicles", operation: "read statistics vehicles" });
        if (mounted) setVehicles([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [accessKey, dataAccessState]);

  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const selectedRange = useMemo(
    () => getStatisticsDateRange(rangeMode, selectedMonth, todayMidnight),
    [rangeMode, selectedMonth, todayMidnight]
  );
  const rangeStart = selectedRange.start;
  const rangeEnd = selectedRange.end;

  // Only 4-digit jobs (same as your jobs home)
  const jobsAll = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);
  const allBookingAnalytics = useMemo(() => buildBookingAnalytics(jobsAll), [jobsAll]);

  // Resolve vehicle strings to name+reg (handles id, registration, or name)
  const resolveVehicleLabel = useCallback((token) => {
    const needle = String(token || "").trim();
    if (!needle) return "";
    const byId = vehicles.find((v) => v.id === needle);
    if (byId) {
      const name = byId.name || [byId.manufacturer, byId.model].filter(Boolean).join(" ").trim() || "Vehicle";
      const reg = byId.registration ? String(byId.registration).toUpperCase() : "";
      return reg ? `${name} - ${reg}` : name;
    }
    const byReg = vehicles.find((v) => String(v.registration || "").trim().toUpperCase() === needle.toUpperCase());
    if (byReg) {
      const name = byReg.name || [byReg.manufacturer, byReg.model].filter(Boolean).join(" ").trim() || "Vehicle";
      const reg = byReg.registration ? String(byReg.registration).toUpperCase() : "";
      return reg ? `${name} - ${reg}` : name;
    }
    const byName = vehicles.find((v) => String(v.name || "").trim().toLowerCase() === needle.toLowerCase());
    if (byName) {
      const name = byName.name || [byName.manufacturer, byName.model].filter(Boolean).join(" ").trim() || "Vehicle";
      const reg = byName.registration ? String(byName.registration).toUpperCase() : "";
      return reg ? `${name} - ${reg}` : name;
    }
    return needle;
  }, [vehicles]);

  const matchesJobSelection = useCallback((j, range = null) => {
      const normalised = normaliseBookingForAnalytics(j);
      const prettyStatus = prettifyStatus(j.status || "");
      const vehiclesForFilter = normalised.vehicles.map((vehicle) => resolveVehicleLabel(displayToken(vehicle))).filter(Boolean);
      const employeesForFilter = normalised.employees.map(displayToken).filter(Boolean);
      const searchText = [
        j.id,
        j.jobNumber,
        j.client,
        j.location,
        j.notes,
        prettyStatus,
        ...employeesForFilter,
        ...vehiclesForFilter,
        ...(toEquipmentTokens(j.equipment) || []),
      ]
        .filter(Boolean)
        .join(" ");

      return matchesStatisticsFilters({
        status: prettyStatus,
        client: normalised.client,
        vehicles: vehiclesForFilter,
        employees: employeesForFilter,
        dates: normalised.dates,
        createdAt: normalised.createdAt,
        searchText,
      }, {
        search,
        status: statusFilter,
        client: clientFilter,
        vehicle: vehicleFilter,
        employee: employeeFilter,
      }, range);
  }, [
    clientFilter,
    employeeFilter,
    search,
    resolveVehicleLabel,
    statusFilter,
    vehicleFilter,
  ]);

  const jobsFiltered = useMemo(
    () => jobsAll.filter((job) => matchesJobSelection(job, selectedRange)),
    [jobsAll, matchesJobSelection, selectedRange]
  );

  const jobsDimensionFiltered = useMemo(
    () => jobsAll.filter((job) => matchesJobSelection(job, null)),
    [jobsAll, matchesJobSelection]
  );

  const allPrettyStatuses = useMemo(() => {
    const set = new Set();
    for (const j of jobsAll) set.add(prettifyStatus(j.status || ""));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [jobsAll]);

  const deletedJobsNormalized = useMemo(() => {
    return deletedBookings.map((entry) => {
      const payload = getDeletedBookingPayload(entry);
      return {
        id: entry.id,
        __deleted: true,
        deletedAt: entry.deletedAt || null,
        restoredAt: entry.restoredAt || null,
        ...(payload || {}),
      };
    });
  }, [deletedBookings]);

  const deletedJobsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return deletedJobsNormalized.filter((j) => {
      if (statusFilter !== "All" && statusFilter !== "Deleted") return false;

      const days = normaliseJobDates(j);
      if (rangeStart) {
        const startMs = rangeStart.getTime();
        const endMs = rangeEnd ? rangeEnd.getTime() : Infinity;
        const anyInRange = days.some((d) => d.getTime() >= startMs && d.getTime() <= endMs);
        const created = parseDate(j.createdAt || j.deletedAt);
        const createdInRange = created ? created.getTime() >= startMs && created.getTime() <= endMs : false;
        if (!anyInRange && !createdInRange) return false;
      }

      if (!q) return true;

      const hay = [
        j.id,
        j.jobNumber,
        j.client,
        j.location,
        j.notes,
        "Deleted",
        prettifyStatus(j.status || ""),
        ...(toCrewNames(j.employees) || []),
        ...(toVehicleTokens(j.vehicles) || []),
        ...(toEquipmentTokens(j.equipment) || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [deletedJobsNormalized, rangeStart, rangeEnd, search, statusFilter]);

  const filteredBookings = jobsFiltered;

  const analyticsOutcomeJobs = useMemo(() => {
    return [...filteredBookings, ...deletedJobsFiltered];
  }, [filteredBookings, deletedJobsFiltered]);

  const analytics = useMemo(() => buildBookingAnalytics(filteredBookings), [filteredBookings]);

  const resolveVehicleUsageRows = useCallback(
    (rows = []) => {
      const grouped = new Map();
      rows.forEach((row) => {
        const name = resolveVehicleLabel(row.name);
        const current = grouped.get(name) || {
          name,
          count: 0,
          bookingDays: 0,
          credits: 0,
          bookingIds: [],
        };
        current.count += row.count || 0;
        current.bookingDays += row.bookingDays || 0;
        current.credits += row.credits || 0;
        current.bookingIds = Array.from(new Set([...current.bookingIds, ...(row.bookingIds || [])]));
        grouped.set(name, current);
      });
      return Array.from(grouped.values()).sort(
        (a, b) => b.count - a.count || b.bookingDays - a.bookingDays || a.name.localeCompare(b.name)
      );
    },
    [resolveVehicleLabel]
  );

  const resolvedTopVehicles = useMemo(
    () => resolveVehicleUsageRows(analytics.topVehicles),
    [analytics.topVehicles, resolveVehicleUsageRows]
  );

  const resolvedAllTopVehicles = useMemo(
    () => resolveVehicleUsageRows(allBookingAnalytics.topVehicles),
    [allBookingAnalytics.topVehicles, resolveVehicleUsageRows]
  );

  const clientOptions = useMemo(
    () => ["all", ...allBookingAnalytics.topClients.map((row) => row.name).sort((a, b) => a.localeCompare(b))],
    [allBookingAnalytics.topClients]
  );
  const vehicleOptions = useMemo(
    () => ["all", ...resolvedAllTopVehicles.map((row) => row.name).sort((a, b) => a.localeCompare(b))],
    [resolvedAllTopVehicles]
  );
  const employeeOptions = useMemo(
    () => ["all", ...allBookingAnalytics.topEmployees.map((row) => row.name).sort((a, b) => a.localeCompare(b))],
    [allBookingAnalytics.topEmployees]
  );

  const drilldownBookingsByIds = useCallback(
    (title, ids = []) => {
      const wanted = new Set(ids);
      setDrilldown({
        title,
        bookings: analytics.bookings.filter((booking) => wanted.has(booking.id)),
      });
    },
    [analytics.bookings]
  );

  const drilldownByPredicate = useCallback(
    (title, predicate) => {
      setDrilldown({
        title,
        bookings: analytics.bookings.filter(predicate),
      });
    },
    [analytics.bookings]
  );

  const clearFilters = () => {
    setSearch("");
    setRangeMode("12m");
    setClientFilter("all");
    setVehicleFilter("all");
    setEmployeeFilter("all");
    setStatusFilter("All");
    setDrilldown(null);
  };

  const activeFilters = useMemo(() => [
    rangeMode !== "12m" ? { id: "range", label: rangeMode === "month" ? `Month: ${monthLabel(selectedMonth)}` : ({ "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" }[rangeMode] || rangeMode) } : null,
    search.trim() ? { id: "search", label: `Search: ${search.trim()}` } : null,
    statusFilter !== "All" ? { id: "status", label: `Status: ${statusFilter}` } : null,
    clientFilter !== "all" ? { id: "client", label: `Client: ${clientFilter}` } : null,
    vehicleFilter !== "all" ? { id: "vehicle", label: `Vehicle: ${vehicleFilter}` } : null,
    employeeFilter !== "all" ? { id: "employee", label: `Crew: ${employeeFilter}` } : null,
  ].filter(Boolean), [clientFilter, employeeFilter, rangeMode, search, selectedMonth, statusFilter, vehicleFilter]);

  const removeFilter = (id) => {
    if (id === "range") setRangeMode("12m");
    if (id === "search") setSearch("");
    if (id === "status") setStatusFilter("All");
    if (id === "client") setClientFilter("all");
    if (id === "vehicle") setVehicleFilter("all");
    if (id === "employee") setEmployeeFilter("all");
    setDrilldown(null);
  };

  const rangeLabel = useMemo(() => {
    if (rangeMode === "all") return "All time";
    if (rangeMode === "month") return monthLabel(selectedMonth);
    if (rangeMode === "30d") return "Last 30 days";
    if (rangeMode === "90d") return "Last 90 days";
    return "Last 12 months";
  }, [rangeMode, selectedMonth]);

  const filteredSectionAnalysis = useMemo(() => {
    if (!activeFilters.length) return null;
    const currentMonth = monthInputValue(new Date());
    const completedSelectedMonth = rangeMode === "month" && selectedMonth < currentMonth;
    return buildFilteredStatisticsSectionAnalysis(
      completedSelectedMonth ? jobsDimensionFiltered : jobsFiltered,
      {
        rangeLabel,
        targetMonth: completedSelectedMonth ? selectedMonth : "",
        variant: briefingState.variant,
      }
    );
  }, [activeFilters.length, briefingState.variant, jobsDimensionFiltered, jobsFiltered, rangeLabel, rangeMode, selectedMonth]);

  const dataQualityCards = [
    { key: "missingDates", label: "Missing dates", severity: "high", title: "Missing dates", match: (booking) => !booking.dates.length },
    { key: "missingStatus", label: "Missing status", severity: "high", title: "Missing status", match: (booking) => !String(booking.status || "").trim() || booking.status === "Unknown" },
    { key: "invalidJobNumber", label: "Invalid job number", severity: "high", title: "Invalid job number", match: (booking) => String(booking.jobNumber || "").trim() && !/^\d{4}$/.test(String(booking.jobNumber || "").trim()) },
    { key: "missingQuote", label: "Missing quote", severity: "medium", title: "Missing quote", match: (booking) => !booking.hasQuote },
    { key: "missingAttachments", label: "Missing attachments", severity: "medium", title: "Missing attachments", match: (booking) => !booking.hasAttachments },
    { key: "missingNotes", label: "Missing notes", severity: "medium", title: "Missing notes", match: (booking) => !booking.hasGeneralNotes },
    { key: "oldSchemaBookings", label: "Old schema bookings", severity: "neutral", title: "Old schema bookings", match: (booking) => booking.hasOldSchemaOnly },
  ];

  const exportAnalyticsSummary = () => {
    const totals = analytics.totals;
    const finance = analytics.financeReadiness;
    const hotels = analytics.hotelStats;
    downloadCSV("statistics-summary.csv", [
      ["Metric", "Value"],
      ["Jobs", totals.bookingCount],
      ["Booking days", totals.bookingDays],
      ["Credits", formatCredits(totals.credits)],
      ["Travel days", formatCredits(totals.travelDays)],
      ["Night shoots", totals.nightShoots],
      ["Confirmed", totals.confirmed],
      ["Tentative", totals.tentative],
      ["Won", totals.won],
      ["Lost", totals.lost],
      ["Conversion rate", `${totals.conversionRate}%`],
      ["Ready to invoice", finance.readyToInvoice],
      ["Paid", finance.paid],
      ["Hotel jobs", hotels.hotelJobs],
      ["Hotel nights", hotels.totalHotelNights],
      ["Total hotel cost", hotels.totalHotelCost],
      ["Bickers payable hotel cost", hotels.bickersPayableHotelCost],
    ]);
  };

  const exportDrilldown = () => {
    const rows = drilldown?.bookings?.length ? drilldown.bookings : analytics.bookings;
    downloadCSV(
      "statistics-drilldown.csv",
      [
        ["Job number", "Client", "Status", "First date", "Last date", "Booking days", "Credits", "Vehicles", "Crew"],
        ...rows.map((booking) => [
          booking.jobNumber,
          booking.client,
          booking.status,
          booking.firstDate,
          booking.lastDate,
          booking.bookingDayCount,
          formatCredits(booking.creditTotal),
          booking.vehicles?.map((vehicle) => resolveVehicleLabel(displayToken(vehicle))).filter(Boolean).join("; "),
          booking.employees?.map(displayToken).filter(Boolean).join("; "),
        ]),
      ]
    );
  };

  const monthComparison = useMemo(() => {
    if (rangeMode !== "month") return null;

    const current = monthBounds(selectedMonth);
    const previous = monthBounds(compareMonth);
    const q = search.trim().toLowerCase();

    const inWindow = (job, bounds) => {
      const days = normaliseJobDates(job);
      const startMs = bounds.start.getTime();
      const endMs = bounds.end.getTime();
      const anyDate = days.some((d) => d.getTime() >= startMs && d.getTime() <= endMs);
      const created = parseDate(job.createdAt);
      const createdInWindow = created ? created.getTime() >= startMs && created.getTime() <= endMs : false;
      return anyDate || createdInWindow;
    };

    const matchesCommonFilters = (job) => {
      const prettyStatus = prettifyStatus(job.status || "");
      if (statusFilter !== "All" && prettyStatus !== statusFilter) return false;
      if (!q) return true;

      const hay = [
        job.id,
        job.jobNumber,
        job.client,
        job.location,
        job.notes,
        prettyStatus,
        ...(toCrewNames(job.employees) || []),
        ...(toVehicleTokens(job.vehicles) || []),
        ...(toEquipmentTokens(job.equipment) || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    };

    const summarise = (bounds) => {
      const rows = jobsAll.filter((job) => matchesCommonFilters(job) && inWindow(job, bounds));
      let bookingDays = 0;
      let shootDays = 0;

      for (const job of rows) {
        const pretty = prettifyStatus(job.status || "");
        const days = normaliseJobDates(job).filter(
          (d) => d.getTime() >= bounds.start.getTime() && d.getTime() <= bounds.end.getTime()
        );
        bookingDays += days.length;
        if (!shouldCountShootFromStatus(pretty)) continue;
        for (const d of days) {
          if (isShootNote(getNoteForISODate(job, isoDay(d)))) shootDays += 1;
        }
      }

      return { jobs: rows.length, bookingDays, shootDays };
    };

    const currentStats = summarise(current);
    const previousStats = summarise(previous);
    const delta = (key) => currentStats[key] - previousStats[key];

    return {
      currentLabel: monthLabel(selectedMonth),
      previousLabel: monthLabel(compareMonth),
      current: currentStats,
      previous: previousStats,
      deltaJobs: delta("jobs"),
      deltaBookingDays: delta("bookingDays"),
      deltaShootDays: delta("shootDays"),
    };
  }, [compareMonth, jobsAll, rangeMode, search, selectedMonth, statusFilter]);

  /* Section */
  const kpis = useMemo(() => {
    const totalJobs = jobsFiltered.length;

    let totalDays = 0;
    let upcomingJobs = 0;
    let completedJobs = 0;
    let cancelledJobs = 0;
    let actionJobs = 0;
    let missingHS = 0;
    let missingRA = 0;

    const now = todayMidnight.getTime();

    for (const j of jobsFiltered) {
      const ds = normaliseJobDates(j);
      totalDays += ds.length;

      const pretty = prettifyStatus(j.status || "");
      if (pretty === "Complete") completedJobs++;
      if (pretty === "Cancelled") cancelledJobs++;
      if (pretty === "Action Required") actionJobs++;

      const anyFutureOrToday = ds.some((d) => d.getTime() >= now);
      if (anyFutureOrToday) upcomingJobs++;

      if (j.hasHS === false) missingHS++;
      if (j.hasRiskAssessment === false) missingRA++;
    }

    const deletedTotal = deletedBookings.length;
    const restoredTotal = deletedBookings.filter((d) => !!d?.restoredAt).length;

    return {
      totalJobs,
      totalDays,
      upcomingJobs,
      completedJobs,
      cancelledJobs,
      actionJobs,
      missingHS,
      missingRA,
      deletedTotal,
      restoredTotal,
    };
  }, [jobsFiltered, deletedBookings, todayMidnight]);

  const statusBreakdown = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) inc(m, prettifyStatus(j.status || ""), 1);
    return clampTopN(m.entries(), 50).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const jobsByMonth = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) {
      const pretty = prettifyStatus(j.status || "");
      for (const { date } of getJobDateEntries(j)) {
        if (!shouldCountBookingDayForStatus(pretty, date, todayMidnight)) continue;
        const monthKey = yyyymm(date);
        if (!m.has(monthKey)) m.set(monthKey, new Map());
        inc(m.get(monthKey), pretty, 1);
      }
    }
    const entries = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return entries.slice(-12).map(([label, statusMap]) => {
      const segments = [...statusMap.entries()]
        .sort((a, b) => statusOrderIndex(a[0]) - statusOrderIndex(b[0]) || a[0].localeCompare(b[0]))
        .map(([status, value]) => ({ label: status, value }));
      const total = segments.reduce((sum, segment) => sum + segment.value, 0);
      return { label: monthLabel(label), total, segments };
    });
  }, [jobsFiltered, todayMidnight]);

  const bookingsByMonth = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) {
      const pretty = prettifyStatus(j.status || "");
      if (isInactiveStatus(pretty)) continue;
      const entries = getJobDateEntries(j);
      const anchor = entries[0]?.date;
      if (!anchor) continue;
      const monthKey = yyyymm(anchor);
      if (!m.has(monthKey)) m.set(monthKey, new Map());
      inc(m.get(monthKey), pretty, 1);
    }

    const entries = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return entries.slice(-12).map(([label, statusMap]) => {
      const segments = [...statusMap.entries()]
        .sort((a, b) => statusOrderIndex(a[0]) - statusOrderIndex(b[0]) || a[0].localeCompare(b[0]))
        .map(([status, value]) => ({ label: status, value }));
      const total = segments.reduce((sum, segment) => sum + segment.value, 0);
      return { label: monthLabel(label), total, segments };
    });
  }, [jobsFiltered]);

  // Shoot days per month
  const shootDaysByMonth = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) {
      const pretty = prettifyStatus(j.status || "");
      if (!shouldCountShootFromStatus(pretty)) continue;

      for (const { date, iso } of getJobDateEntries(j)) {
        const note = getNoteForISODate(j, iso);
        if (!isShootNote(note)) continue;
        const monthKey = yyyymm(date);
        if (!m.has(monthKey)) m.set(monthKey, new Map());
        inc(m.get(monthKey), pretty, 1);
      }
    }
    const entries = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return entries.slice(-12).map(([label, statusMap]) => {
      const segments = [...statusMap.entries()]
        .sort((a, b) => statusOrderIndex(a[0]) - statusOrderIndex(b[0]) || a[0].localeCompare(b[0]))
        .map(([status, value]) => ({ label: status, value }));
      const total = segments.reduce((sum, segment) => sum + segment.value, 0);
      return { label: monthLabel(label), total, segments };
    });
  }, [jobsFiltered]);

  const creditsByMonth = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) {
      const pretty = prettifyStatus(j.status || "");
      if (!shouldCountShootFromStatus(pretty)) continue;

      const entries = getJobDateEntries(j);
      for (const { date, iso } of entries) {
        const note = getNoteForISODate(j, iso);
        const credit = getCreditForNote(note);
        if (credit <= 0) continue;
        const monthKey = yyyymm(date);
        if (!m.has(monthKey)) m.set(monthKey, new Map());
        inc(m.get(monthKey), pretty, credit);
      }
    }

    const entries = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return entries.slice(-12).map(([label, statusMap]) => {
      const segments = [...statusMap.entries()]
        .sort((a, b) => statusOrderIndex(a[0]) - statusOrderIndex(b[0]) || a[0].localeCompare(b[0]))
        .map(([status, value]) => ({ label: status, value: Math.round(value * 100) / 100 }));
      const total = Math.round(segments.reduce((sum, segment) => sum + segment.value, 0) * 100) / 100;
      return { label: monthLabel(label), total, segments };
    });
  }, [jobsFiltered]);

  const creditBreakdownByMonth = useMemo(() => {
    const rows = [];
    for (const j of jobsFiltered) {
      const pretty = prettifyStatus(j.status || "");
      const statusCounts = shouldCountShootFromStatus(pretty);

      for (const { date, iso } of getJobDateEntries(j)) {
        const note = getNoteForISODate(j, iso);
        const credit = statusCounts ? getCreditForNote(note) : 0;
        rows.push({
          month: yyyymm(date),
          date: iso,
          jobNumber: j.jobNumber || j.id || "",
          client: j.client || "",
          note,
          credit,
          counted: credit > 0,
          reason: credit > 0 ? "Counted" : getCreditSkipReason(note, pretty),
        });
      }
    }
    return rows;
  }, [jobsFiltered]);

  const selectedMonthCreditRows = useMemo(() => {
    const key = rangeMode === "month" ? selectedMonth : yyyymm(todayMidnight);
    return creditBreakdownByMonth
      .filter((row) => row.month === key)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.jobNumber).localeCompare(String(b.jobNumber)));
  }, [creditBreakdownByMonth, rangeMode, selectedMonth, todayMidnight]);

  const totalCredits = useMemo(
    () => Math.round(creditsByMonth.reduce((sum, row) => sum + Number(row.total || 0), 0) * 100) / 100,
    [creditsByMonth]
  );

  const shootKpis = useMemo(() => {
    const monthKeyNow = yyyymm(todayMidnight);

    let totalShootDays = 0;
    const monthMap = new Map();

    for (const j of jobsFiltered) {
      const pretty = prettifyStatus(j.status || "");
      if (!shouldCountShootFromStatus(pretty)) continue;

      const ds = normaliseJobDates(j);
      for (const d of ds) {
        const iso = isoDay(d);
        const note = getNoteForISODate(j, iso);
        if (!isShootNote(note)) continue;
        totalShootDays += 1;
        inc(monthMap, yyyymm(d), 1);
      }
    }

    const thisMonth = monthMap.get(monthKeyNow) || 0;
    const monthsWithData = [...monthMap.keys()];
    const denom = Math.max(1, monthsWithData.length);
    const avgPerMonth = Math.round((totalShootDays / denom) * 10) / 10;

    return { totalShootDays, thisMonth, avgPerMonth, monthsWithDataCount: monthsWithData.length };
  }, [jobsFiltered, todayMidnight]);

  /* Hotel KPIs + hotel cost per month, paidBy aware. */
  const hotelStats = useMemo(() => {
    let hotelJobs = 0;
    let hotelNights = 0;

    // Cost totals ONLY include non-production-paid (Bickers/Unknown)
    let totalHotelCost = 0;

    // Optional splits (useful context)
    let productionPaidHotelJobs = 0;
    let productionPaidHotelNights = 0;

    const monthCost = new Map(); // yyyy-mm -> non-production-paid cost only.
    const monthNights = new Map(); // nights for non-production-paid only

    for (const j of jobsFiltered) {
      const h = getHotelForJob(j);
      if (!h.hasHotel) continue;

      hotelJobs += 1;
      hotelNights += h.nights || 0;

      if (h.isProductionPaid) {
        productionPaidHotelJobs += 1;
        productionPaidHotelNights += h.nights || 0;
      }

      // Only count spend if NOT production paid
      totalHotelCost += h.total || 0;

      // Assign hotel cost to month of FIRST job date (simple/consistent)
      const ds = normaliseJobDates(j);
      const anchor = ds[0] || parseDate(j.startDate) || parseDate(j.date) || parseDate(j.createdAt) || null;
      if (anchor && !h.isProductionPaid) {
        const key = yyyymm(anchor);
        if (h.total) inc(monthCost, key, h.total);
        if (h.nights) inc(monthNights, key, h.nights);
      }
    }

    const payableHotelJobs = hotelJobs - productionPaidHotelJobs;
    const payableHotelNights = hotelNights - productionPaidHotelNights;

    const avgPerHotelJob = payableHotelJobs ? totalHotelCost / payableHotelJobs : 0;
    const avgPerNight = payableHotelNights ? totalHotelCost / payableHotelNights : 0;

    const monthKeyNow = yyyymm(todayMidnight);
    const thisMonthCost = monthCost.get(monthKeyNow) || 0;
    const thisMonthNights = monthNights.get(monthKeyNow) || 0;

    // Last 12 months series
    const entries = [...monthCost.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const costSeries = entries.slice(-12).map(([ym, value]) => ({ label: monthLabel(ym), value }));

    return {
      hotelJobs,
      hotelNights,
      totalHotelCost,
      avgPerHotelJob,
      avgPerNight,
      thisMonthCost,
      thisMonthNights,
      costSeries,
      productionPaidHotelJobs,
      productionPaidHotelNights,
      payableHotelJobs,
      payableHotelNights,
    };
  }, [jobsFiltered, todayMidnight]);

  const jobLengthStats = useMemo(() => {
    const lengths = jobsFiltered
      .map((j) => ({
        days: getJobLengthDays(j),
        status: prettifyStatus(j.status || ""),
      }))
      .filter((item) => item.days > 0);

    const allDays = lengths.map((item) => item.days).sort((a, b) => a - b);
    const confirmedDays = lengths
      .filter((item) => item.status === "Confirmed")
      .map((item) => item.days)
      .sort((a, b) => a - b);

    const avgLengthDays = allDays.length
      ? Math.round((allDays.reduce((sum, n) => sum + n, 0) / allDays.length) * 10) / 10
      : 0;
    const avgConfirmedLengthDays = confirmedDays.length
      ? Math.round((confirmedDays.reduce((sum, n) => sum + n, 0) / confirmedDays.length) * 10) / 10
      : 0;
    const medianLengthDays = allDays.length
      ? allDays[Math.floor((allDays.length - 1) / 2)]
      : 0;

    const buckets = new Map();
    for (const days of allDays) inc(buckets, classifyLengthBucket(days), 1);

    const bucketOrder = ["1 day", "2 days", "3-5 days", "6-10 days", "11+ days"];
    const distribution = bucketOrder
      .map((label) => ({ label, value: buckets.get(label) || 0 }))
      .filter((row) => row.value > 0);

    return {
      avgLengthDays,
      avgConfirmedLengthDays,
      medianLengthDays,
      multiDayJobs: allDays.filter((days) => days > 1).length,
      distribution,
    };
  }, [jobsFiltered]);

  const crewStats = useMemo(() => {
    const crewSizes = jobsFiltered
      .map((j) => {
        const stored =
          typeof j.allocatedCrewCountDerived === "number"
            ? j.allocatedCrewCountDerived
            : typeof j.allocatedCrewCount === "number"
              ? j.allocatedCrewCount
              : Array.isArray(j.employees)
                ? j.employees.length
                : 0;
        return {
          size: Number.isFinite(stored) ? stored : 0,
          status: prettifyStatus(j.status || ""),
        };
      })
      .filter((item) => item.size > 0);

    const all = crewSizes.map((item) => item.size);
    const confirmed = crewSizes
      .filter((item) => item.status === "Confirmed")
      .map((item) => item.size);

    const avgCrewPerJob = all.length
      ? Math.round((all.reduce((sum, n) => sum + n, 0) / all.length) * 10) / 10
      : 0;
    const avgConfirmedCrewPerJob = confirmed.length
      ? Math.round((confirmed.reduce((sum, n) => sum + n, 0) / confirmed.length) * 10) / 10
      : 0;
    const largestCrew = all.length ? Math.max(...all) : 0;

    return {
      avgCrewPerJob,
      avgConfirmedCrewPerJob,
      largestCrew,
      crewedJobs: all.length,
    };
  }, [jobsFiltered]);

  const timelineStats = useMemo(() => {
    const createToConfirmed = [];
    const createToShoot = [];

    for (const j of jobsFiltered) {
      const createdAt = parseDate(j.createdAt);
      if (!createdAt) continue;

      const confirmedAt =
        parseDate(j.lifecycle?.confirmedAt) ||
        (prettifyStatus(j.status || "") === "Confirmed"
          ? parseDate(j.statusChangedAt || j.updatedAt || j.createdAt)
          : null);

      if (confirmedAt) {
        const diff = Math.round((confirmedAt.getTime() - createdAt.getTime()) / 86400000);
        if (Number.isFinite(diff) && diff >= 0) createToConfirmed.push(diff);
      }

      const firstShootDate =
        parseDate(j.firstBookingDate) ||
        normaliseJobDates(j)[0] ||
        parseDate(j.startDate) ||
        parseDate(j.date);

      if (firstShootDate) {
        const diff = Math.round((firstShootDate.getTime() - createdAt.getTime()) / 86400000);
        if (Number.isFinite(diff)) createToShoot.push(diff);
      }
    }

    const avgCreateToConfirmedDays = createToConfirmed.length
      ? Math.round((createToConfirmed.reduce((sum, n) => sum + n, 0) / createToConfirmed.length) * 10) / 10
      : 0;
    const avgCreateToShootDays = createToShoot.length
      ? Math.round((createToShoot.reduce((sum, n) => sum + n, 0) / createToShoot.length) * 10) / 10
      : 0;

    return {
      avgCreateToConfirmedDays,
      avgCreateToShootDays,
      confirmedSample: createToConfirmed.length,
      shootSample: createToShoot.length,
    };
  }, [jobsFiltered]);

  const firstPencilFunnel = useMemo(() => {
    const outcomeMap = new Map();
    let total = 0;

    for (const j of analyticsOutcomeJobs) {
      if (!historyMentionsFirstPencil(j)) continue;
      total += 1;
      const outcome = j.__deleted ? "Deleted" : prettifyStatus(j.status || "");
      inc(outcomeMap, outcome || "Unknown", 1);
    }

    const confirmed = outcomeMap.get("Confirmed") || 0;
    const deleted = outcomeMap.get("Deleted") || 0;
    const dnh = outcomeMap.get("DNH") || 0;
    const lost = outcomeMap.get("Lost") || 0;
    const cancelled = outcomeMap.get("Cancelled") || 0;
    const postponed = outcomeMap.get("Postponed") || 0;
    const dead = deleted + dnh + lost + cancelled + postponed;
    const stillOpen = Math.max(0, total - confirmed - dead);

    const preferredOrder = [
      "Confirmed",
      "Deleted",
      "DNH",
      "Lost",
      "Cancelled",
      "Postponed",
      "First Pencil",
      "Second Pencil",
      "Enquiry",
      "Action Required",
      "Complete",
      "Ready to Invoice",
      "Invoiced",
      "Paid",
    ];

    const chart = [
      ...preferredOrder
        .filter((label) => outcomeMap.has(label))
        .map((label) => ({ label, value: outcomeMap.get(label) || 0 })),
      ...[...outcomeMap.entries()]
        .filter(([label]) => !preferredOrder.includes(label))
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value })),
    ];

    return {
      total,
      confirmed,
      deleted,
      dnh,
      lost,
      cancelled,
      postponed,
      dead,
      stillOpen,
      confirmedRate: pct(confirmed, total),
      deadRate: pct(dead, total),
      deletedRate: pct(deleted, total),
      chart,
    };
  }, [analyticsOutcomeJobs]);

  const topClients = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) inc(m, (j.client || "-").trim(), 1);
    return clampTopN(m.entries(), 8).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const topLocations = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) inc(m, (j.location || "-").trim(), 1);
    return clampTopN(m.entries(), 8).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const topCrew = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) for (const n of toCrewNames(j.employees)) inc(m, n, 1);
    return clampTopN(m.entries(), 10).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const topEquipment = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) for (const e of toEquipmentTokens(j.equipment)) inc(m, e, 1);
    return clampTopN(m.entries(), 10).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const topVehicles = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) {
      const vs = Array.isArray(j.vehicles) ? j.vehicles : [];
      for (const v of vs) {
        const label =
          typeof v === "string"
            ? resolveVehicleLabel(v)
            : resolveVehicleLabel(v?.id || v?.registration || v?.name || "");
        inc(m, label, 1);
      }
    }
    return clampTopN(m.entries(), 10).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered, resolveVehicleLabel]);

  const upcomingNext = useMemo(() => {
    const now = todayMidnight.getTime();
    const list = jobsFiltered
      .map((j) => {
        const ds = normaliseJobDates(j);
        const next = ds.find((d) => d.getTime() >= now) || null;
        return { j, next };
      })
      .filter((x) => !!x.next)
      .sort((a, b) => a.next.getTime() - b.next.getTime())
      .slice(0, 8)
      .map((x) => x.j);

    return list;
  }, [jobsFiltered, todayMidnight]);

  const jobRow = (j) => {
    const ds = normaliseJobDates(j);
    const first = ds[0] || null;
    const last = ds[ds.length - 1] || null;

    const datesLabel =
      first && last ? `${fmtDDMMYY(first)} - ${fmtDDMMYY(last)}` : first ? fmtDDMMYY(first) : "TBC";

    const pretty = prettifyStatus(j.status || "");

    return (
      <Link
        key={j.id}
        href={`/job-numbers/${j.id}`}
        className={styles.jobRow}
      >
        <div className={styles.truncate} style={{ fontWeight: 800 }}>
          #{j.jobNumber || j.id} - {j.client || "-"}
        </div>
        <div className={`${styles.truncate} ${styles.jobLocation}`} style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>
          {j.location || "-"}
        </div>
        <div className={styles.jobDate} style={{ fontSize: "var(--font-size-sm)", whiteSpace: "nowrap" }}>{datesLabel}</div>
        <div className={layoutStyles.extracted34}>
          <StatusBadge value={pretty} />
        </div>
      </Link>
    );
  };

  const locationRows = topLocations.map((row) => ({ name: row.label, count: row.value }));
  const accessGate = resolveDataAccess(dataAccessState);
  const tabTitles = {
    overview: "Business overview",
    trends: "Performance trends",
    resources: "Resource utilisation",
    finance: "Finance & data quality",
  };

  const headlineItems = [
    { label: "Jobs", value: analytics.totals.bookingCount, hint: "Bookings in this range", onClick: () => drilldownByPredicate("All filtered jobs", () => true) },
    { label: "Booking days", value: analytics.totals.bookingDays, hint: "Total scheduled days", onClick: () => drilldownByPredicate("Jobs with booking dates", (booking) => booking.bookingDayCount > 0) },
    { label: "Shoot days", value: shootKpis.totalShootDays, hint: "On Set and Night Shoot", onClick: () => drilldownByPredicate("Jobs with shoot days", (booking) => booking.shootDayCount > 0) },
    { label: "Upcoming", value: kpis.upcomingJobs, hint: "Jobs dated today or later", onClick: () => drilldownByPredicate("Upcoming jobs", (booking) => booking.dates.some((date) => date >= isoDay(todayMidnight))) },
    { label: "Confirmed", value: analytics.totals.confirmed, hint: "Currently confirmed", onClick: () => drilldownByPredicate("Confirmed jobs", (booking) => booking.statusCategory === "confirmed") },
    { label: "Conversion", value: `${analytics.totals.conversionRate}%`, hint: "Won jobs as a share of bookings", onClick: () => drilldownByPredicate("Won jobs", (booking) => booking.statusCategory === "won") },
  ];

  const tabPanelProps = (id) => ({
    id: `statistics-panel-${id}`,
    role: "tabpanel",
    "aria-labelledby": `statistics-tab-${id}`,
    tabIndex: 0,
  });

  return (
    <HeaderSidebarLayout>
      <Page width="fluid" className={styles.page}>
          <PageHeader
            title="Statistics"
            subtitle="A clear view of booking performance, workload and business health."
            eyebrow="Management dashboard"
            actions={
              <div className={styles.headerActions}>
                <Button variant="secondary" onClick={exportAnalyticsSummary} disabled={loading || !jobsFiltered.length}>
                  <Download size={15} /> Export filtered summary
                </Button>
              </div>
            }
          />

          <DailyBriefingPanel onStateChange={handleBriefingState} hidden />

          <StatisticsFilterToolbar
            search={search}
            onSearchChange={setSearch}
            rangeMode={rangeMode}
            onRangeModeChange={setRangeMode}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={(value) => value && setSelectedMonth(value)}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statusOptions={allPrettyStatuses}
            clientFilter={clientFilter}
            onClientFilterChange={setClientFilter}
            clientOptions={clientOptions}
            vehicleFilter={vehicleFilter}
            onVehicleFilterChange={setVehicleFilter}
            vehicleOptions={vehicleOptions}
            employeeFilter={employeeFilter}
            onEmployeeFilterChange={setEmployeeFilter}
            employeeOptions={employeeOptions}
            moreOpen={moreFiltersOpen}
            onToggleMore={() => setMoreFiltersOpen((value) => !value)}
            activeFilters={activeFilters}
            onRemoveFilter={removeFilter}
            onClearFilters={clearFilters}
          />

          <StatisticsTabs activeTab={activeTab} onChange={setActiveTab} />

          {accessGate.checking || loading ? (
            <Panel className={styles.panelPadding} aria-live="polite">Loading statistics…</Panel>
          ) : !accessGate.allowed ? (
            <StatisticsEmptyState title="Statistics are unavailable" description="Your account does not currently have access to booking statistics." />
          ) : !jobsFiltered.length ? (
            <StatisticsEmptyState
              title="No bookings match these filters"
              description="Change the date range or remove one of the filters to see statistics."
              action={<Button variant="secondary" onClick={clearFilters}>Clear all filters</Button>}
            />
          ) : (
            <>
              {activeTab === "overview" ? (
                <section {...tabPanelProps("overview")}>
                  <TabHeading title={tabTitles.overview} rangeLabel={rangeLabel} count={jobsFiltered.length} />
                  <SectionAnalysisPanel analysis={filteredSectionAnalysis?.overview || briefingState.briefing?.sections?.overview} sectionKey="overview" filtered={Boolean(filteredSectionAnalysis)} loading={!filteredSectionAnalysis && briefingState.loading} />
                  <HeadlineCards items={headlineItems} />
                  <div className={styles.twoColumn}>
                    <StackedBarChart title="Jobs by month" subtitle="Scheduled jobs grouped by first booking date; segments show current status. Closed outcomes are excluded." data={bookingsByMonth} rightLabel="Jobs" />
                    <AnalyticsSummarySection
                      title="Pipeline"
                      summary={`${analytics.totals.confirmed} jobs are confirmed and ${analytics.totals.tentative} remain tentative. Conversion is ${analytics.totals.conversionRate}% across ${analytics.totals.decidedOutcomes} decided outcomes; open work is reported separately.`}
                      items={[
                        { label: "Confirmed", value: analytics.totals.confirmed },
                        { label: "Tentative", value: analytics.totals.tentative },
                        { label: "Won", value: analytics.totals.won },
                        { label: "Lost", value: analytics.totals.lost },
                        { label: "Open", value: analytics.totals.open },
                        { label: "Conversion", value: `${analytics.totals.conversionRate}%` },
                      ]}
                    />
                  </div>
                  <Panel className={styles.panelPadding}>
                    <div className={styles.tabHeader}>
                      <div><h3 className={styles.panelTitle}>Next up</h3><p className={styles.panelMeta}>The next eight jobs in this filtered range</p><p className={styles.blockSummary}><strong>Summary:</strong> {upcomingNext.length ? `${upcomingNext.length} upcoming jobs are shown here; the earliest is #${upcomingNext[0].jobNumber || upcomingNext[0].id} for ${upcomingNext[0].client || "an unrecorded client"}.` : "No upcoming jobs are available in this selection."}</p></div>
                      <Button as={Link} href="/job-sheet?section=Upcoming" variant="ghost" size="sm">View all jobs</Button>
                    </div>
                    <div className={styles.upcomingList}>{upcomingNext.length ? upcomingNext.map(jobRow) : <div className={styles.panelPadding}>No upcoming jobs in this selection.</div>}</div>
                  </Panel>
                  <CalculationDetails>Shoot days count booking days marked On Set or Night Shoot. Cancelled, lost, postponed and DNH bookings are excluded.</CalculationDetails>
                </section>
              ) : null}

              {activeTab === "trends" ? (
                <section {...tabPanelProps("trends")}>
                  <TabHeading title={tabTitles.trends} rangeLabel={rangeLabel} count={jobsFiltered.length} />
                  <SectionAnalysisPanel analysis={filteredSectionAnalysis?.trends || briefingState.briefing?.sections?.trends} sectionKey="trends" filtered={Boolean(filteredSectionAnalysis)} loading={!filteredSectionAnalysis && briefingState.loading} />
                  {monthComparison ? (
                    <HeadlineCards items={[
                      { label: monthComparison.currentLabel, value: monthComparison.current.jobs, hint: `${monthComparison.deltaJobs >= 0 ? "+" : ""}${monthComparison.deltaJobs} jobs vs ${monthComparison.previousLabel}` },
                      { label: "Booking days", value: monthComparison.current.bookingDays, hint: `${monthComparison.deltaBookingDays >= 0 ? "+" : ""}${monthComparison.deltaBookingDays} vs previous month` },
                      { label: "Shoot days", value: monthComparison.current.shootDays, hint: `${monthComparison.deltaShootDays >= 0 ? "+" : ""}${monthComparison.deltaShootDays} vs previous month` },
                    ]} />
                  ) : null}
                  <div className={styles.stack}>
                    <MonthlyPerformanceTable rows={analytics.byMonth} onMonthClick={(row) => drilldownByPredicate(`Bookings in ${monthLabel(row.month)}`, (booking) => booking.bookingMonth === row.month)} />
                    <div className={styles.twoColumn}>
                      <StackedBarChart title="Booking days by month" subtitle="Scheduled days split by current booking status" data={jobsByMonth} rightLabel="Days" />
                      <StackedBarChart title="Shoot days by month" subtitle="On Set and Night Shoot day notes" data={shootDaysByMonth} rightLabel="Days" />
                    </div>
                    <div className={styles.twoColumn}>
                      <StackedBarChart title="Credits by month" subtitle="Credits derived from booking day notes" data={creditsByMonth} rightLabel="Credits" valueFormatter={formatCredits} />
                      <BarChart title="Status outcomes" subtitle="Current status of filtered jobs" data={statusBreakdown.slice(0, 10)} rightLabel="Jobs" />
                    </div>
                    <div className={styles.twoColumn}>
                      <BarChart title="Job length" subtitle={`Average ${jobLengthStats.avgLengthDays} days · median ${jobLengthStats.medianLengthDays} days`} data={jobLengthStats.distribution} rightLabel="Jobs" />
                      <BarChart title="First pencil outcomes" subtitle={`${firstPencilFunnel.confirmedRate}% confirmed · ${firstPencilFunnel.deadRate}% dead outcomes`} data={firstPencilFunnel.chart} rightLabel="Jobs" />
                    </div>
                  </div>
                  <CalculationDetails>Credits use the existing day-note rules: full operational days count as 1, half travel as 0.5 and travel time as 0.25.</CalculationDetails>
                </section>
              ) : null}

              {activeTab === "resources" ? (
                <section {...tabPanelProps("resources")}>
                  <TabHeading title={tabTitles.resources} rangeLabel={rangeLabel} count={jobsFiltered.length} />
                  <SectionAnalysisPanel analysis={filteredSectionAnalysis?.resources || briefingState.briefing?.sections?.resources} sectionKey="resources" filtered={Boolean(filteredSectionAnalysis)} loading={!filteredSectionAnalysis && briefingState.loading} />
                  <div className={styles.twoColumn}>
                    <CompactRankingTable title="Top clients" rows={analytics.topClients} onRowClick={(row) => drilldownBookingsByIds(`Client: ${row.name}`, row.bookingIds)} />
                    <CompactRankingTable title="Top vehicles" rows={resolvedTopVehicles} onRowClick={(row) => drilldownBookingsByIds(`Vehicle: ${row.name}`, row.bookingIds)} />
                    <CompactRankingTable title="Top crew" rows={analytics.topEmployees} onRowClick={(row) => drilldownBookingsByIds(`Crew: ${row.name}`, row.bookingIds)} />
                    <CompactRankingTable title="Top equipment" rows={analytics.topEquipment} onRowClick={(row) => drilldownBookingsByIds(`Equipment: ${row.name}`, row.bookingIds)} />
                    <CompactRankingTable title="Top locations" rows={locationRows} onRowClick={(row) => drilldownByPredicate(`Location: ${row.name}`, (booking) => booking.location === row.name)} />
                    <AnalyticsSummarySection title="Crew overview" summary={`${crewStats.crewedJobs} jobs have recorded crew. The average recorded allocation is ${crewStats.avgCrewPerJob} people per crewed job and ${crewStats.avgConfirmedCrewPerJob} for currently confirmed jobs; this describes allocation volume, not employee performance.`} items={[
                      { label: "Average crew", value: crewStats.avgCrewPerJob },
                      { label: "Confirmed average", value: crewStats.avgConfirmedCrewPerJob },
                      { label: "Largest crew", value: crewStats.largestCrew },
                      { label: "Crewed jobs", value: crewStats.crewedJobs },
                    ]} />
                  </div>
                </section>
              ) : null}

              {activeTab === "finance" ? (
                <section {...tabPanelProps("finance")}>
                  <TabHeading title={tabTitles.finance} rangeLabel={rangeLabel} count={jobsFiltered.length} />
                  <SectionAnalysisPanel analysis={filteredSectionAnalysis?.financeQuality || briefingState.briefing?.sections?.financeQuality} sectionKey="financeQuality" filtered={Boolean(filteredSectionAnalysis)} loading={!filteredSectionAnalysis && briefingState.loading} />
                  <div className={styles.twoColumn}>
                    <AnalyticsSummarySection title="Finance readiness" summary={`${analytics.financeReadiness.readyToInvoice} jobs are ready to invoice and ${analytics.financeReadiness.completeNotPaid} completed jobs are not recorded as paid. Missing commercial information is shown separately and is not treated as zero value.`} items={[
                      { label: "Ready to invoice", value: analytics.financeReadiness.readyToInvoice },
                      { label: "Complete not paid", value: analytics.financeReadiness.completeNotPaid },
                      { label: "Paid", value: analytics.financeReadiness.paid },
                      { label: "Missing quote", value: analytics.financeReadiness.missingQuote },
                      { label: "Missing files", value: analytics.financeReadiness.missingAttachments },
                      { label: "Missing notes", value: analytics.financeReadiness.missingNotes },
                    ]} />
                    <AnalyticsSummarySection title="Hotel costs" summary={`${analytics.hotelStats.hotelJobs} jobs contain hotel records covering ${analytics.hotelStats.totalHotelNights} nights. Bickers-payable accommodation totals ${gbp(analytics.hotelStats.bickersPayableHotelCost)}; production-paid stays remain in counts but are excluded from that payable value.`} items={[
                      { label: "Hotel jobs", value: analytics.hotelStats.hotelJobs },
                      { label: "Nights", value: analytics.hotelStats.totalHotelNights },
                      { label: "Total cost", value: gbp(analytics.hotelStats.totalHotelCost) },
                      { label: "Bickers payable", value: gbp(analytics.hotelStats.bickersPayableHotelCost) },
                      { label: "Avg cost/night", value: gbp(analytics.hotelStats.averageCostPerNight) },
                      { label: "Production paid", value: analytics.hotelStats.productionPaidHotelJobs },
                    ]} />
                  </div>
                  <div className={styles.twoColumn}>
                    <AnalyticsSummarySection title="Data quality" summary={`${analytics.dataQuality.missingDates} bookings are missing dates, ${analytics.dataQuality.missingStatus} are missing a status and ${analytics.dataQuality.invalidJobNumber} have an invalid job number. These are reporting gaps, not evidence of weak business performance.`} items={dataQualityCards.map((item) => ({ label: item.label, value: analytics.dataQuality[item.key], severity: item.severity, onClick: () => drilldownByPredicate(item.title, item.match) }))} />
                    <BarChart title="Payable hotel cost by month" subtitle="Production-paid accommodation is excluded" monthly data={hotelStats.costSeries} rightLabel="GBP" valueFormatter={gbp} />
                  </div>
                  <CalculationDetails>Hotel costs are assigned to the month of the job’s first date. Production-paid hotels remain in job and night counts but are excluded from Bickers payable totals.</CalculationDetails>
                </section>
              ) : null}
            </>
          )}
      </Page>

      <DrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} onExport={exportDrilldown} formatVehicle={resolveVehicleLabel} formatCredits={formatCredits} displayToken={displayToken} />
    </HeaderSidebarLayout>
  );

  const navCard = (href, title, subtitle, pillTxt) => (
    <Link
      href={href}
      style={{
        ...surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        minHeight: 54,
        textDecoration: "none",
        color: UI.text,
        transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
      }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) =>
        Object.assign(e.currentTarget.style, {
          transform: "none",
          boxShadow: UI.shadowSm,
          borderColor: "var(--color-border)",
        })
      }
    >
      <div className={layoutStyles.extracted35}>
        <div className={layoutStyles.extracted36}>{title}</div>
        <div style={{ ...sectionMeta, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
      </div>
      <span style={{ ...chip, padding: "5px 8px", fontSize: 11, flexShrink: 0 }}>{pillTxt}</span>
    </Link>
  );

  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
    gap: UI.gap,
  };

  return (
    <HeaderSidebarLayout>
      <style>{statisticsCss}</style>
      <div style={pageWrap}>
        <div className={layoutStyles.extracted37}>
          <div>
            <h1 style={{ ...h1, display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <BarChart3 size={22} color={UI.brand} />
              Statistics
            </h1>
            <div style={sub}>
              Live booking insights across pipeline, operations, finance and utilisation.
            </div>
            <div style={{ ...sectionMeta, marginTop: 6 }}>
              {getActiveFilterSummary()}
            </div>
          </div>
          <div className={`statistics-header-actions ${layoutStyles.extracted38}`} >
            <div style={chip}>
              <BriefcaseBusiness size={14} />
              {loading ? "Loading..." : `${jobsAll.length} jobs`}
            </div>
            <div style={{ ...chip, background: UI.successSoft, borderColor: "var(--color-success-border)", color: UI.successText }}>
              <Filter size={14} />
              Filtered: <b className={layoutStyles.extracted39}>{jobsFiltered.length}</b>
            </div>
            <div style={{ ...chip, background: UI.warningSoft, borderColor: UI.warningBorder }}>
              <CalendarDays size={14} />
              Deleted in scope: <b className={layoutStyles.extracted40}>{deletedJobsFiltered.length}</b>
            </div>
            <button type="button" onClick={exportAnalyticsSummary} style={{ ...chip, cursor: "pointer", background: "var(--color-surface)" }}>
              <Download size={14} />
              Export summary CSV
            </button>
            <button type="button" onClick={exportDrilldown} style={{ ...chip, cursor: "pointer", background: "var(--color-surface)" }}>
              <Download size={14} />
              Export drill-down CSV
            </button>
          </div>
        </div>

        <div style={{ ...panel, marginBottom: UI.gap }}>
          <div className={layoutStyles.extracted41}>
            <div>
              <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <SlidersHorizontal size={16} color={UI.brand} />
                Filters
              </div>
              <div style={sectionMeta}>Refine the dashboard before analytics are calculated.</div>
            </div>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} style={{ ...chip, cursor: "pointer", background: "var(--color-surface)" }}>
                <X size={14} />
                Clear filters
              </button>
            )}
          </div>
          <div className={layoutStyles.extracted42}>
            <div className={layoutStyles.extracted43}>
              <Search
                size={16}
                color={UI.muted}
                className={layoutStyles.extracted44}
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search job #, client, location, notes, crew, vehicle..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "var(--control-height-md)",
                  padding: "7px 9px 7px 34px",
                  borderRadius: UI.radiusSm,
                  border: UI.border,
                  fontSize: 13.5,
                  outline: "none",
                  background: "var(--color-surface)",
                  color: UI.text,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <select
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value)}
              style={{ ...filterSelectStyle, fontWeight: 800 }}
            >
              <option value="30d">Range: last 30 days</option>
              <option value="90d">Range: last 90 days</option>
              <option value="12m">Range: last 12 months</option>
              <option value="month">Compare: two months</option>
              <option value="all">Range: all time</option>
            </select>

            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || monthInputValue(new Date()))}
              disabled={rangeMode !== "month"}
              title="Month A"
              style={{
                ...filterSelectStyle,
                background: rangeMode === "month" ? "var(--color-surface)" : "var(--color-surface-subtle)",
                fontWeight: 800,
                color: rangeMode === "month" ? UI.text : UI.muted,
                cursor: rangeMode === "month" ? "pointer" : "not-allowed",
              }}
            />

            <input
              type="month"
              value={compareMonth}
              onChange={(e) => setCompareMonth(e.target.value || selectedMonth)}
              disabled={rangeMode !== "month"}
              title="Month B"
              style={{
                ...filterSelectStyle,
                background: rangeMode === "month" ? "var(--color-surface)" : "var(--color-surface-subtle)",
                fontWeight: 800,
                color: rangeMode === "month" ? UI.text : UI.muted,
                cursor: rangeMode === "month" ? "pointer" : "not-allowed",
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...filterSelectStyle, fontWeight: 800 }}
            >
              {allPrettyStatuses.map((s) => (
                <option key={s} value={s}>
                  Status: {s}
                </option>
              ))}
            </select>
          </div>

          <div className={layoutStyles.extracted45}>
            <select value={dateRangeFilter} onChange={(e) => setDateRangeFilter(e.target.value)} style={filterSelectStyle}>
              <option value="all">Date: All time</option>
              <option value="thisMonth">Date: This month</option>
              <option value="lastMonth">Date: Last month</option>
              <option value="thisYear">Date: This year</option>
              <option value="custom">Date: Custom later</option>
            </select>

            <select value={statusCategoryFilter} onChange={(e) => setStatusCategoryFilter(e.target.value)} style={filterSelectStyle}>
              <option value="all">Category: All</option>
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="open">Open</option>
            </select>

            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={filterSelectStyle}>
              {clientOptions.map((client) => (
                <option key={client} value={client}>
                  {client === "all" ? "All clients" : client}
                </option>
              ))}
            </select>

            <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} style={filterSelectStyle}>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle} value={vehicle}>
                  {vehicle === "all" ? "All vehicles" : vehicle}
                </option>
              ))}
            </select>

            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} style={filterSelectStyle}>
              {employeeOptions.map((employee) => (
                <option key={employee} value={employee}>
                  {employee === "all" ? "All crew" : employee}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} style={{ ...filterSelectStyle, cursor: "pointer", fontWeight: 900 }}>
                Clear filters
              </button>
            )}
          </div>

          <div style={{ marginTop: 10, ...sectionMeta }}>
            {rangeMode === "month" && monthComparison ? (
              <>
                Comparing <b>{monthComparison.currentLabel}</b> with <b>{monthComparison.previousLabel}</b>.
                {" "}Jobs: <b>{monthComparison.current.jobs}</b> ({monthComparison.deltaJobs >= 0 ? "+" : ""}
                {monthComparison.deltaJobs}) - Booking days: <b>{monthComparison.current.bookingDays}</b> (
                {monthComparison.deltaBookingDays >= 0 ? "+" : ""}
                {monthComparison.deltaBookingDays}) - Shoot days: <b>{monthComparison.current.shootDays}</b> (
                {monthComparison.deltaShootDays >= 0 ? "+" : ""}
                {monthComparison.deltaShootDays})
              </>
            ) : (
              <>
                Tip: click any preview job row to open its job page. Vehicle counts resolve to <b>Name - REG</b> where possible.
              </>
            )}
          </div>
        </div>

        <DrilldownPanel
          drilldown={drilldown}
          onClose={() => setDrilldown(null)}
          onExport={exportDrilldown}
          formatVehicle={resolveVehicleLabel}
        />

        {!loading && jobsFiltered.length === 0 && (
          <div style={{ ...panel, marginBottom: UI.gap, textAlign: "center", borderColor: UI.brandBorder }}>
            <div style={{ ...sectionTitle, fontSize: 18 }}>No bookings match these filters</div>
            <div style={{ ...sectionMeta, marginTop: 6 }}>
              Broaden the date range, clear a client/vehicle/crew filter, or reset everything to return to the full dashboard.
            </div>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} style={{ ...chip, cursor: "pointer", background: "var(--color-surface)", marginTop: "var(--space-3)" }}>
                <X size={14} />
                Clear filters
              </button>
            )}
          </div>
        )}

        <div style={{ marginBottom: UI.gap }}>
          <div className={layoutStyles.extracted46}>
            <div style={sectionTitle}>Shortcuts</div>
            <div style={sectionMeta}>Jump into related pages</div>
          </div>
          <div className={`statistics-shortcuts ${layoutStyles.extracted47}`} >
            {navCard("/job-sheet", "Job Sheet", "All jobs table", `${jobsAll.length}`)}
            {navCard("/client-info", "Client Info", "Client list and history", "Directory")}
            {navCard("/client-emails", "Client Emails", "Collated email list from jobs", "Contacts")}
            {navCard("/saved-contacts", "Manage Saved Contacts", "Edit or remove saved booking contacts", "Contacts")}
            {navCard("/review-queue", "Review Queue", "Ops review stage", "Open")}
            {navCard("/finance-queue", "Ready to Invoice", "Finance queue", "Open")}
            {navCard("/deleted-bookings", "Deleted Bookings", "Restore / purge", `${deletedBookings.length}`)}
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ marginBottom: UI.gap }}>
          <div className={layoutStyles.extracted48}>
            <div style={sectionTitle}>At a glance</div>
            <div style={sectionMeta}>
              Range start: <span className={layoutStyles.extracted49}>{rangeStart ? fmtDDMMYY(rangeStart) : "All time"}</span>
            </div>
          </div>

          <div style={kpiGrid}>
            <div style={{ ...card, padding: "var(--space-3)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Jobs</div>
              <div className={layoutStyles.extracted50}>{analytics.totals.bookingCount}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>Filtered</div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Booking days</div>
              <div className={layoutStyles.extracted51}>{analytics.totals.bookingDays}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>Sum of dates</div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: UI.brandBorder }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Credits</div>
              <div className={layoutStyles.extracted52}>{formatCredits(analytics.totals.credits)}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>From day notes</div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: UI.brandBorder }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Travel days</div>
              <div className={layoutStyles.extracted53}>{formatCredits(analytics.totals.travelDays)}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>Travel + half travel + travel time</div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: UI.brandBorder }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Night shoots</div>
              <div className={layoutStyles.extracted54}>{analytics.totals.nightShoots}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>Night shoot day notes</div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: UI.brandBorder }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Shoot days / month</div>
              <div className={layoutStyles.extracted55}>{shootKpis.avgPerMonth}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Avg across <b>{shootKpis.monthsWithDataCount}</b> month(s) - This month: <b>{shootKpis.thisMonth}</b>
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Upcoming</div>
              <div className={layoutStyles.extracted56}>{kpis.upcomingJobs}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>Has date &gt;= today</div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Avg job length</div>
              <div className={layoutStyles.extracted57}>{jobLengthStats.avgLengthDays}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Median: <b>{jobLengthStats.medianLengthDays || 0}</b> day(s)
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Avg confirmed length</div>
              <div className={layoutStyles.extracted58}>{jobLengthStats.avgConfirmedLengthDays}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Multi-day jobs: <b>{jobLengthStats.multiDayJobs}</b>
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-success-soft)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Avg crew / job</div>
              <div className={layoutStyles.extracted59}>{crewStats.avgCrewPerJob}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Across <b>{crewStats.crewedJobs}</b> crewed job(s)
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-success-soft)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Avg confirmed crew</div>
              <div className={layoutStyles.extracted60}>{crewStats.avgConfirmedCrewPerJob}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Largest crew: <b>{crewStats.largestCrew}</b>
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-warning-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Added to confirmed</div>
              <div className={layoutStyles.extracted61}>{timelineStats.avgCreateToConfirmedDays}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Avg days across <b>{timelineStats.confirmedSample}</b> confirmed job(s)
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-warning-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Added to first shoot</div>
              <div className={layoutStyles.extracted62}>{timelineStats.avgCreateToShootDays}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Avg days across <b>{timelineStats.shootSample}</b> job(s)
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-info-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>First pencil cohort</div>
              <div className={layoutStyles.extracted63}>{firstPencilFunnel.total}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Current + deleted in scope
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-info-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>First pencil to confirmed</div>
              <div className={layoutStyles.extracted64}>{firstPencilFunnel.confirmedRate}%</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                {firstPencilFunnel.confirmed} of {firstPencilFunnel.total}
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-danger-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>First pencil dead outcomes</div>
              <div className={layoutStyles.extracted65}>{firstPencilFunnel.deadRate}%</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                Deleted / DNH / Lost / Cancelled / Postponed
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Hotel cost (payable)</div>
              <div className={layoutStyles.extracted66}>{gbp(hotelStats.totalHotelCost)}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                {hotelStats.payableHotelJobs} job(s) - {hotelStats.payableHotelNights} night(s)
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)", borderColor: "var(--color-border)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Avg hotel / night (payable)</div>
              <div className={layoutStyles.extracted67}>{gbp(hotelStats.avgPerNight)}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>
                This month: <b>{gbp(hotelStats.thisMonthCost)}</b> ({hotelStats.thisMonthNights} nights)
              </div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Complete</div>
              <div className={layoutStyles.extracted68}>{kpis.completedJobs}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>Status = Complete</div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Needs action</div>
              <div className={layoutStyles.extracted69}>{kpis.actionJobs}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>Status = Action Required</div>
            </div>

            <div style={{ ...card, padding: "var(--space-3)" }}>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" }}>Deleted</div>
              <div className={layoutStyles.extracted70}>{kpis.deletedTotal}</div>
              <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>Deleted bookings</div>
            </div>
          </div>

          <div style={{ ...surface, padding: "var(--space-3)", marginTop: "var(--space-3)" }}>
            <div className={layoutStyles.extracted71}>
              <span style={{ ...chip, background: "var(--color-warning-soft)" }}>
                Missing HS: <b className={layoutStyles.extracted72}>{kpis.missingHS}</b>
              </span>
              <span style={{ ...chip, background: "var(--color-warning-soft)" }}>
                Missing RA: <b className={layoutStyles.extracted73}>{kpis.missingRA}</b>
              </span>
              <span style={{ ...chip, background: "var(--color-canvas)" }}>
                Cancelled: <b className={layoutStyles.extracted74}>{kpis.cancelledJobs}</b>
              </span>
              <span style={{ ...chip, background: "var(--color-info-soft)", borderColor: "var(--color-info-border)" }}>
                First pencil confirmed: <b className={layoutStyles.extracted75}>{firstPencilFunnel.confirmedRate}%</b>
              </span>
              <span style={{ ...chip, background: "var(--color-danger-soft)", borderColor: "var(--color-danger-border)" }}>
                First pencil dead: <b className={layoutStyles.extracted76}>{firstPencilFunnel.deadRate}%</b>
              </span>
              <span style={{ ...chip, background: "var(--color-accent-soft)", borderColor: "var(--color-warning-border)" }}>
                Avg job length: <b className={layoutStyles.extracted77}>{jobLengthStats.avgLengthDays}</b> day(s)
              </span>
              <span style={{ ...chip, background: "var(--color-info-soft)", borderColor: "var(--color-info-border)" }}>
                Avg crew / job: <b className={layoutStyles.extracted78}>{crewStats.avgCrewPerJob}</b>
              </span>
              <span style={{ ...chip, background: "var(--color-accent-soft)", borderColor: "var(--color-warning-border)" }}>
                Added to confirmed: <b className={layoutStyles.extracted79}>{timelineStats.avgCreateToConfirmedDays}</b> day(s)
              </span>
              <span style={{ ...chip, background: "var(--color-warning-soft)", borderColor: "var(--color-warning-border)" }}>
                Added to first shoot: <b className={layoutStyles.extracted80}>{timelineStats.avgCreateToShootDays}</b> day(s)
              </span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: UI.brandBorder }}>
                Shoot days (total): <b className={layoutStyles.extracted81}>{shootKpis.totalShootDays}</b>
              </span>
              <span style={{ ...chip, background: "var(--color-info-soft)", borderColor: "var(--color-info-border)" }}>
                Credits: <b className={layoutStyles.extracted82}>{formatCredits(totalCredits)}</b>
              </span>
              <span style={{ ...chip, background: "var(--color-brand-soft)", borderColor: "var(--color-border)" }}>
                Avg hotel / job (payable): <b className={layoutStyles.extracted83}>{gbp(hotelStats.avgPerHotelJob)}</b>
              </span>
              <span style={{ ...chip, background: "var(--color-brand-soft)", borderColor: "var(--color-border)" }}>
                Production-paid: <b className={layoutStyles.extracted84}>{hotelStats.productionPaidHotelNights}</b> nights
              </span>
            </div>
          </div>
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <AnalyticsSummarySection
            title="Pipeline"
            items={[
              { label: "Confirmed", value: analytics.totals.confirmed },
              { label: "Tentative", value: analytics.totals.tentative },
              { label: "Won", value: analytics.totals.won },
              { label: "Lost", value: analytics.totals.lost },
              { label: "Open", value: analytics.totals.open },
              { label: "Conversion", value: `${analytics.totals.conversionRate}%` },
              { label: "Lost rate", value: `${analytics.totals.lostRate}%` },
            ]}
          />
          <AnalyticsSummarySection
            title="Finance readiness"
            items={[
              { label: "Ready to invoice", value: analytics.financeReadiness.readyToInvoice },
              { label: "Complete not paid", value: analytics.financeReadiness.completeNotPaid },
              { label: "Paid", value: analytics.financeReadiness.paid },
              { label: "Missing quote", value: analytics.financeReadiness.missingQuote },
              { label: "Missing files", value: analytics.financeReadiness.missingAttachments },
              { label: "Missing notes", value: analytics.financeReadiness.missingNotes },
            ]}
          />
        </div>

        <div style={{ marginBottom: UI.gap }}>
          <MonthlyPerformanceTable
            rows={analytics.byMonth}
            onMonthClick={(row) =>
              drilldownByPredicate(`Bookings in ${monthLabel(row.month)}`, (booking) => booking.bookingMonth === row.month)
            }
          />
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <AnalyticsSummarySection
            title="Data quality"
            items={dataQualityCards.map((card) => ({
              label: card.label,
              value: analytics.dataQuality[card.key],
              severity: card.severity,
              onClick: () => drilldownByPredicate(card.title, card.match),
            }))}
          />
          <AnalyticsSummarySection
            title="Hotel costs"
            items={[
              { label: "Hotel jobs", value: analytics.hotelStats.hotelJobs },
              { label: "Nights", value: analytics.hotelStats.totalHotelNights },
              { label: "Total cost", value: gbp(analytics.hotelStats.totalHotelCost) },
              { label: "Bickers payable", value: gbp(analytics.hotelStats.bickersPayableHotelCost) },
              { label: "Avg cost/night", value: gbp(analytics.hotelStats.averageCostPerNight) },
              { label: "Production paid", value: analytics.hotelStats.productionPaidHotelJobs },
            ]}
          />
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <UsageTable title="Top clients" rows={analytics.topClients} onRowClick={(row) => drilldownBookingsByIds(`Client: ${row.name}`, row.bookingIds)} />
          <UsageTable title="Top vehicles" rows={resolvedTopVehicles} onRowClick={(row) => drilldownBookingsByIds(`Vehicle: ${row.name}`, row.bookingIds)} />
          <UsageTable title="Top crew" rows={analytics.topEmployees} onRowClick={(row) => drilldownBookingsByIds(`Crew: ${row.name}`, row.bookingIds)} />
          <UsageTable title="Top equipment" rows={analytics.topEquipment} onRowClick={(row) => drilldownBookingsByIds(`Equipment: ${row.name}`, row.bookingIds)} />
        </div>

        {/* Charts */}
        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <StackedBarChart
            title="Bookings per month"
            subtitle="Scheduled jobs grouped by first booking date; segments show current status. Closed outcomes are excluded."
            data={bookingsByMonth}
            rightLabel="Bookings"
          />
          <StackedBarChart
            title="Booking days per month"
            subtitle="Past: Complete/Confirmed. Upcoming: First Pencil/Second Pencil/Confirmed."
            data={jobsByMonth}
            rightLabel="Days"
          />
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <StackedBarChart
            title="Shoot days per month"
            subtitle="Counts days where the per-day note is On Set / Night Shoot"
            data={shootDaysByMonth}
            rightLabel="Shoot"
          />
          <StackedBarChart
            title="Credits per month"
            subtitle="On Set/Night Shoot/Travel/Split/Standby/Rehearsal = 1, half travel = 0.5, travel time = 0.25"
            data={creditsByMonth}
            rightLabel="Credits"
            valueFormatter={(v) => formatCredits(v)}
          />
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <div style={{ ...panel, minHeight: 220 }}>
            <div style={{ ...sectionTitle, marginBottom: "var(--space-2)" }}>
              Credit breakdown {rangeMode === "month" ? monthLabel(selectedMonth) : monthLabel(yyyymm(todayMidnight))}
            </div>
            <div style={sectionMeta}>
              Counts per-day diary notes from <span className={layoutStyles.extracted85}>notesByDate</span>, <span className={layoutStyles.extracted86}>dayNotes</span>,
              and related daily note fields. <b>On Set</b>, <b>Night Shoot</b>, <b>Travel Day</b>, <b>Split Day</b>,
              <b>Standby Day</b>, and <b>Rehearsal Day</b> count as 1 credit. <b>1/2 Travel Day</b> counts as 0.5.
              <b> Travel Time</b> counts as 0.25.
            </div>
            <div className={layoutStyles.extracted87}>
              {selectedMonthCreditRows.length ? (
                selectedMonthCreditRows.slice(0, 30).map((row, idx) => (
                  <div
                    key={`${row.date}-${row.jobNumber}-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "76px 72px minmax(0,1fr) 110px 52px",
                      gap: "var(--space-2)",
                      alignItems: "center",
                      fontSize: "var(--font-size-xs)",
                      borderTop: idx ? "1px solid var(--color-brand-soft)" : "none",
                      paddingTop: idx ? 6 : 0,
                    }}
                  >
                    <span className={layoutStyles.extracted88}>{row.date.slice(5)}</span>
                    <b>{row.jobNumber}</b>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: row.counted ? UI.text : UI.muted,
                      }}
                    >
                      {row.note || "No note"}{row.client ? ` - ${row.client}` : ""}
                    </span>
                    <span style={{ color: row.counted ? "var(--color-success)" : UI.muted, fontSize: 11 }}>{row.reason}</span>
                    <b style={{ textAlign: "right", color: row.counted ? UI.text : UI.muted }}>{formatCredits(row.credit)}</b>
                  </div>
                ))
              ) : (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>No credited days in this month.</div>
              )}
            </div>
          </div>
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart
            title="First pencil outcomes"
            subtitle="Based on current status plus deleted bookings, and history logs where available"
            data={firstPencilFunnel.chart}
            rightLabel="Jobs"
          />
          <BarChart
            title="Job length distribution"
            subtitle="How many booking days each job spans"
            data={jobLengthStats.distribution}
            rightLabel="Jobs"
          />
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart
            title="Hotel cost per month (payable)"
            subtitle="Excludes Production-paid; uses hotelTotal, else costPerNight x nights"
            data={hotelStats.costSeries}
            rightLabel="GBP"
            valueFormatter={(v) => gbp(v)}
          />
          <BarChart
            title="Status breakdown"
            subtitle="Filtered set"
            data={statusBreakdown.slice(0, 10)}
            rightLabel="Jobs"
          />
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart title="Top vehicles" subtitle="Resolved to Name - REG where possible" data={topVehicles} rightLabel="Jobs" />
          <BarChart title="Top crew" subtitle="From booking.employees" data={topCrew} rightLabel="Bookings" />
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart title="Top clients" subtitle="Production / client" data={topClients} rightLabel="Jobs" />
          <BarChart title="Top locations" subtitle="Location field" data={topLocations} rightLabel="Jobs" />
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart title="Top equipment" subtitle="From booking.equipment" data={topEquipment} rightLabel="Mentions" />
          <div style={{ ...panel, minHeight: 220 }}>
            <div style={{ ...sectionTitle, marginBottom: "var(--space-2)" }}>Hotel stat rules</div>
            <div style={sectionMeta}>
              We treat a booking as having a hotel if <span className={layoutStyles.extracted89}>hasHotel</span> is true, or if we can find any
              of: <span className={layoutStyles.extracted90}>hotelTotal</span>, <span className={layoutStyles.extracted91}>hotelCostPerNight</span>,{" "}
              <span className={layoutStyles.extracted92}>hotelNights</span> (plus common aliases).
              <br />
              <br />
              If <span className={layoutStyles.extracted93}>hotelPaidBy</span> is <b>Production</b>, we still count hotel jobs/nights, but we{" "}
              <b>exclude the GBP cost</b> from payable totals and charts.
              <br />
              <br />
              Monthly hotel cost is assigned to the month of the job&apos;s <b>first date</b> (simple & consistent).
            </div>
          </div>
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap }}>
          <div style={{ ...panel, minHeight: 220 }}>
            <div className={layoutStyles.extracted94}>
              <div style={sectionTitle}>Next up</div>
              <Link
                href="/job-sheet?section=Upcoming"
                style={{ fontSize: "var(--font-size-sm)", fontWeight: 800, color: UI.brand, textDecoration: "none" }}
              >
                View all -&gt;
              </Link>
            </div>
            <div style={{ border: UI.border, borderRadius: UI.radius, overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: "var(--space-3)", color: UI.muted, fontSize: "var(--font-size-sm)" }}>Loading...</div>
              ) : upcomingNext.length ? (
                upcomingNext.map(jobRow)
              ) : (
                <div style={{ padding: "var(--space-3)", color: UI.muted, fontSize: "var(--font-size-sm)" }}>No upcoming jobs in current filters.</div>
              )}
            </div>
          </div>

          <div style={{ ...panel, minHeight: 220 }}>
            <div style={{ ...sectionTitle, marginBottom: "var(--space-2)" }}>How &quot;shoot days&quot; are counted</div>
            <div style={sectionMeta}>
              We count a day as a <b>shoot day</b> when the booking has a per-day note of <b>On Set</b> or{" "}
              <b>Night Shoot</b> (from <span className={layoutStyles.extracted95}>notesByDate / dayNotes / notesForEachDay / noteForDay</span>).
              <br />
              <br />
              We exclude obvious dead statuses (Cancelled / Lost / Postponed / DNH) from shoot-day counting.
            </div>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
