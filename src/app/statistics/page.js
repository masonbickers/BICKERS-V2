"use client";

import layoutStyles from "./page.styles.module.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { BusinessPage, BusinessPageHeader } from "@/app/components/BusinessPage";
import DailyBriefingPanel from "./DailyBriefingPanel";
import { Button, Panel } from "@/app/components/ui";
import {
  CalculationDetails,
  CollapsibleSection,
  CompactRankingTable,
  CurrentActionsStrip,
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
  getStatisticsDateRange,
  matchesStatisticsFilters,
} from "@/app/utils/statisticsFilters";
import {
  buildStatisticsCurrentActions,
  buildStatisticsMonthComparison,
  selectActiveUpcomingBookings,
  selectStatisticsAudienceAction,
} from "@/app/utils/statisticsDashboard";
import { buildMonthlyVisualSummary, getStatisticsMonthPhase } from "@/app/utils/statisticsVisualAnalysis";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { Download } from "lucide-react";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import {
  FIXED_JOB_STATUS_STYLES,
  getFixedJobStatusStyle,
  normalizeJobStatus,
} from "@/app/utils/jobStatusColors";
import { buildCanonicalLocationRanking } from "@/app/utils/locationNormalization";

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

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const card = {
  ...surface,
  padding: "var(--space-3)",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const panel = { ...surface, padding: "var(--space-3)" };
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
const sectionTitle = { fontWeight: 800, fontSize: "var(--font-size-lg)", color: UI.text, lineHeight: 1.2 };
const sectionMeta = { color: UI.muted, fontSize: 12.5, lineHeight: 1.4 };
const statLabel = { color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const statValue = { fontSize: "var(--font-size-xl)", fontWeight: 800, color: UI.text, lineHeight: 1.1 };

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
  neutral: { border: "var(--color-border)", bg: UI.bgAlt, text: UI.text },
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
  return `${dd}/${mm}/${d.getFullYear()}`;
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
  return getFixedJobStatusStyle(label);
};

const CHART_STATUS_COLORS = {
  "Ready to Invoice": { fill: "#0891b2", soft: "#cffafe", border: "#67e8f9", text: "#155e75" },
  Invoiced: { fill: "#8b5cf6", soft: "#ede9fe", border: "#c4b5fd", text: "#5b21b6" },
  Paid: { fill: "#059669", soft: "#d1fae5", border: "#6ee7b7", text: "#065f46" },
};

const chartStatusColors = (label) => {
  const fixed = FIXED_JOB_STATUS_STYLES[normalizeJobStatus(label)];
  if (fixed) {
    return { fill: fixed.bg, soft: fixed.bg, border: fixed.border, text: fixed.text };
  }
  const mapped = CHART_STATUS_COLORS[label];
  if (mapped) return mapped;
  const fallback = statusColors(label);
  return { fill: fallback.border, soft: fallback.bg, border: fallback.border, text: fallback.text };
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
          const colors = chartStatusColors(label);
          return (
            <span key={label} style={{ ...chip, padding: "4px 8px", background: colors.soft, borderColor: colors.border, color: colors.text }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: colors.fill, flex: "0 0 auto" }} />
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
                      const colors = chartStatusColors(segment.label);
                      return (
                        <div
                          key={segment.label}
                          style={{
                            width: `${Math.max(0, (segment.value / row.total) * 100)}%`,
                            height: "100%",
                            background: colors.fill,
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
  const [statusFilter, setStatusFilter] = useState("All");
  const [clientFilter, setClientFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [drilldown, setDrilldown] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [briefingState, setBriefingState] = useState({ loading: true, briefing: null, variant: "booking" });
  const handleBriefingState = useCallback((next) => setBriefingState(next), []);

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

  const drilldownAllBookingsByIds = useCallback(
    (title, ids = []) => {
      const wanted = new Set(ids);
      setDrilldown({
        title,
        bookings: allBookingAnalytics.bookings.filter((booking) => wanted.has(booking.id)),
      });
    },
    [allBookingAnalytics.bookings]
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
    const currentMonth = monthInputValue(todayMidnight);
    const targetMonth = rangeMode === "month" && selectedMonth < currentMonth ? selectedMonth : "";
    return buildStatisticsMonthComparison(jobsDimensionFiltered, { now: todayMidnight, targetMonth });
  }, [jobsDimensionFiltered, rangeMode, selectedMonth, todayMidnight]);

  /* Section */
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

  const topLocations = useMemo(() => {
    return buildCanonicalLocationRanking(jobsFiltered, 8);
  }, [jobsFiltered]);

  const upcomingNext = useMemo(
    () => selectActiveUpcomingBookings(jobsFiltered, { now: todayMidnight, limit: 6 }),
    [jobsFiltered, todayMidnight]
  );

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

  const locationRows = topLocations.map((row) => ({
    name: row.label,
    count: row.value,
    bookingIds: row.bookingIds,
  }));
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
    { label: "Confirmed", value: analytics.totals.confirmed, hint: "Currently confirmed", onClick: () => drilldownByPredicate("Confirmed jobs", (booking) => booking.statusCategory === "confirmed") },
    { label: "Conversion", value: `${analytics.totals.conversionRate}%`, hint: "Won jobs as a share of bookings", onClick: () => drilldownByPredicate("Won jobs", (booking) => booking.statusCategory === "won") },
  ];

  const currentActions = useMemo(
    () => buildStatisticsCurrentActions(jobsAll, { now: todayMidnight }),
    [jobsAll, todayMidnight]
  );
  const audienceCurrentAction = selectStatisticsAudienceAction(currentActions, briefingState.variant);
  const monthlyPerformanceRows = analytics.byMonth.filter((row) => /^\d{4}-\d{2}$/.test(String(row.month || "")));
  const currentActionItems = [
    {
      label: "Confirmed next 30 days",
      value: currentActions.confirmedUpcoming,
      hint: "Committed upcoming jobs",
      onClick: () => drilldownAllBookingsByIds("Confirmed jobs in the next 30 days", currentActions.confirmedUpcomingIds),
      tone: "success",
    },
    {
      label: "Allocation gaps",
      value: currentActions.allocationGaps,
      hint: "Confirmed jobs missing crew, vehicle or equipment",
      onClick: () => drilldownAllBookingsByIds("Confirmed jobs with allocation gaps", currentActions.allocationGapIds),
      tone: currentActions.allocationGaps ? "warning" : "success",
    },
    {
      label: "Action required",
      value: currentActions.actionRequired,
      hint: "Jobs in the action queue",
      onClick: () => drilldownAllBookingsByIds("Jobs requiring action", currentActions.actionRequiredIds),
      tone: currentActions.actionRequired ? "warning" : "success",
    },
    audienceCurrentAction.id === "ready-to-invoice"
      ? {
        ...audienceCurrentAction,
        tone: audienceCurrentAction.value ? "warning" : "success",
      }
      : {
        ...audienceCurrentAction,
        onClick: () => drilldownAllBookingsByIds("Bookings with core data gaps", currentActions.coreDataGapIds),
        tone: audienceCurrentAction.value ? "warning" : "success",
      },
  ];

  const tabPanelProps = (id) => ({
    id: `statistics-panel-${id}`,
    role: "tabpanel",
    "aria-labelledby": `statistics-tab-${id}`,
    tabIndex: 0,
  });

  return (
    <HeaderSidebarLayout>
      <BusinessPage className={styles.page}>
          <BusinessPageHeader
            title="Statistics"
            subtitle="A clear view of booking performance, workload and business health."
            eyebrow="Business dashboard"
            actions={
              <div className={styles.headerActions}>
                <Button variant="secondary" onClick={exportAnalyticsSummary} disabled={loading || !jobsFiltered.length}>
                  <Download size={15} /> Export filtered summary
                </Button>
              </div>
            }
          />

          <DailyBriefingPanel onStateChange={handleBriefingState} hidden />

          {!accessGate.checking && !loading && accessGate.allowed ? <CurrentActionsStrip items={currentActionItems} /> : null}

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
                  <SectionAnalysisPanel analysis={filteredSectionAnalysis?.overview || briefingState.briefing?.sections?.overview} sectionKey="overview" filtered={Boolean(filteredSectionAnalysis)} loading={!filteredSectionAnalysis && briefingState.loading} stale={briefingState.stale} generatedAt={briefingState.briefing?.generatedAt} />
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
                      <div><h3 className={styles.panelTitle}>Next up</h3><p className={styles.panelMeta}>The next six active jobs in this filtered range</p></div>
                      <Button as={Link} href="/job-sheet?section=Upcoming" variant="ghost" size="sm">View all jobs</Button>
                    </div>
                    <div className={styles.upcomingList}>{upcomingNext.length ? upcomingNext.map(jobRow) : <div className={styles.panelPadding}>No active upcoming jobs in this selection.</div>}</div>
                  </Panel>
                  <CalculationDetails>Shoot days count booking days marked On Set or Night Shoot. Cancelled, lost, postponed and DNH bookings are excluded.</CalculationDetails>
                </section>
              ) : null}

              {activeTab === "trends" ? (
                <section {...tabPanelProps("trends")}>
                  <TabHeading title={tabTitles.trends} rangeLabel={rangeLabel} count={jobsFiltered.length} />
                  <SectionAnalysisPanel analysis={filteredSectionAnalysis?.trends || briefingState.briefing?.sections?.trends} sectionKey="trends" filtered={Boolean(filteredSectionAnalysis)} loading={!filteredSectionAnalysis && briefingState.loading} stale={briefingState.stale} generatedAt={briefingState.briefing?.generatedAt} />
                  <HeadlineCards items={[
                    { label: `${monthComparison.current.label} jobs`, value: monthComparison.current.jobs, hint: `${monthComparison.deltaJobs >= 0 ? "+" : ""}${monthComparison.deltaJobs} vs ${monthComparison.previous.label}` },
                    { label: "Booking days", value: monthComparison.current.bookingDays, hint: `${monthComparison.deltaBookingDays >= 0 ? "+" : ""}${monthComparison.deltaBookingDays} vs previous month` },
                    { label: "Shoot days", value: monthComparison.current.shootDays, hint: `${monthComparison.deltaShootDays >= 0 ? "+" : ""}${monthComparison.deltaShootDays} vs previous month` },
                  ]} />
                  <div className={styles.stack}>
                    <MonthlyPerformanceTable rows={monthlyPerformanceRows} onMonthClick={(row) => drilldownByPredicate(`Bookings in ${monthLabel(row.month)}`, (booking) => booking.bookingMonth === row.month)} />
                    <div className={styles.twoColumn}>
                      <StackedBarChart title="Booking days by month" subtitle="Scheduled days split by current booking status" data={jobsByMonth} rightLabel="Days" />
                      <StackedBarChart title="Shoot days by month" subtitle="On Set and Night Shoot day notes" data={shootDaysByMonth} rightLabel="Days" />
                    </div>
                    <CollapsibleSection title="More trend detail" description="Credits, status outcomes, job length and First Pencil outcomes">
                      <div className={styles.twoColumn}>
                        <StackedBarChart title="Credits by month" subtitle="Credits derived from booking day notes" data={creditsByMonth} rightLabel="Credits" valueFormatter={formatCredits} />
                        <BarChart title="Status outcomes" subtitle="Current status of filtered jobs" data={statusBreakdown.slice(0, 10)} rightLabel="Jobs" />
                      </div>
                      <div className={styles.twoColumn}>
                        <BarChart title="Job length" subtitle={`Average ${jobLengthStats.avgLengthDays} days · median ${jobLengthStats.medianLengthDays} days`} data={jobLengthStats.distribution} rightLabel="Jobs" />
                        <BarChart title="First pencil outcomes" subtitle={`${firstPencilFunnel.confirmedRate}% confirmed · ${firstPencilFunnel.deadRate}% dead outcomes`} data={firstPencilFunnel.chart} rightLabel="Jobs" />
                      </div>
                    </CollapsibleSection>
                  </div>
                  <CalculationDetails>Credits use the existing day-note rules: full operational days count as 1, half travel as 0.5 and travel time as 0.25.</CalculationDetails>
                </section>
              ) : null}

              {activeTab === "resources" ? (
                <section {...tabPanelProps("resources")}>
                  <TabHeading title={tabTitles.resources} rangeLabel={rangeLabel} count={jobsFiltered.length} />
                  <SectionAnalysisPanel analysis={filteredSectionAnalysis?.resources || briefingState.briefing?.sections?.resources} sectionKey="resources" filtered={Boolean(filteredSectionAnalysis)} loading={!filteredSectionAnalysis && briefingState.loading} stale={briefingState.stale} generatedAt={briefingState.briefing?.generatedAt} />
                  <CurrentActionsStrip
                    title="Allocation health"
                    description="Confirmed work in the next 30 days · live across all report ranges"
                    items={[
                      { label: "Confirmed jobs", value: currentActions.confirmedUpcoming, hint: "Committed upcoming work", onClick: () => drilldownAllBookingsByIds("Confirmed jobs in the next 30 days", currentActions.confirmedUpcomingIds) },
                      { label: "Any allocation gap", value: currentActions.allocationGaps, hint: "Missing crew, vehicle or equipment", onClick: () => drilldownAllBookingsByIds("Confirmed jobs with allocation gaps", currentActions.allocationGapIds), tone: currentActions.allocationGaps ? "warning" : "success" },
                      { label: "Missing crew", value: currentActions.missingCrew, hint: "No crew recorded", onClick: () => drilldownAllBookingsByIds("Confirmed jobs missing crew", currentActions.missingCrewIds), tone: currentActions.missingCrew ? "warning" : "success" },
                      { label: "Missing vehicle", value: currentActions.missingVehicles, hint: "No vehicle recorded", onClick: () => drilldownAllBookingsByIds("Confirmed jobs missing vehicles", currentActions.missingVehicleIds), tone: currentActions.missingVehicles ? "warning" : "success" },
                      { label: "Missing equipment", value: currentActions.missingEquipment, hint: "No equipment recorded", onClick: () => drilldownAllBookingsByIds("Confirmed jobs missing equipment", currentActions.missingEquipmentIds), tone: currentActions.missingEquipment ? "warning" : "success" },
                    ]}
                  />
                  <div className={styles.twoColumn}>
                    <CompactRankingTable title="Top clients" rows={analytics.topClients} showBookingDays onRowClick={(row) => drilldownBookingsByIds(`Client: ${row.name}`, row.bookingIds)} />
                    <CompactRankingTable title="Top vehicles" rows={resolvedTopVehicles} showBookingDays onRowClick={(row) => drilldownBookingsByIds(`Vehicle: ${row.name}`, row.bookingIds)} />
                    <CompactRankingTable title="Top crew" rows={analytics.topEmployees} showBookingDays onRowClick={(row) => drilldownBookingsByIds(`Crew: ${row.name}`, row.bookingIds)} />
                  </div>
                  <CollapsibleSection title="More resource detail" description="Equipment, locations and allocation volume">
                    <div className={styles.twoColumn}>
                      <CompactRankingTable title="Top equipment" rows={analytics.topEquipment} showBookingDays onRowClick={(row) => drilldownBookingsByIds(`Equipment: ${row.name}`, row.bookingIds)} />
                      <CompactRankingTable title="Top locations" rows={locationRows} onRowClick={(row) => drilldownBookingsByIds(`Location: ${row.name}`, row.bookingIds)} />
                      <AnalyticsSummarySection title="Crew overview" summary={`${crewStats.crewedJobs} jobs have recorded crew. This describes allocation volume, not employee performance.`} items={[
                        { label: "Average crew", value: crewStats.avgCrewPerJob },
                        { label: "Confirmed average", value: crewStats.avgConfirmedCrewPerJob },
                        { label: "Largest crew", value: crewStats.largestCrew },
                        { label: "Crewed jobs", value: crewStats.crewedJobs },
                      ]} />
                    </div>
                  </CollapsibleSection>
                </section>
              ) : null}

              {activeTab === "finance" ? (
                <section {...tabPanelProps("finance")}>
                  <TabHeading title={tabTitles.finance} rangeLabel={rangeLabel} count={jobsFiltered.length} />
                  <SectionAnalysisPanel analysis={filteredSectionAnalysis?.financeQuality || briefingState.briefing?.sections?.financeQuality} sectionKey="financeQuality" filtered={Boolean(filteredSectionAnalysis)} loading={!filteredSectionAnalysis && briefingState.loading} stale={briefingState.stale} generatedAt={briefingState.briefing?.generatedAt} />
                  <div className={styles.twoColumn}>
                    <AnalyticsSummarySection title="Finance readiness" summary={`${analytics.financeReadiness.readyToInvoice} jobs are ready to invoice and ${analytics.financeReadiness.completeNotPaid} completed jobs are not recorded as paid.`} items={[
                      { label: "Ready to invoice", value: analytics.financeReadiness.readyToInvoice, onClick: () => drilldownByPredicate("Ready-to-invoice jobs", (booking) => prettifyStatus(booking.status) === "Ready to Invoice") },
                      { label: "Complete not paid", value: analytics.financeReadiness.completeNotPaid, onClick: () => drilldownByPredicate("Completed jobs not recorded as paid", (booking) => prettifyStatus(booking.status) === "Complete") },
                      { label: "Paid", value: analytics.financeReadiness.paid, onClick: () => drilldownByPredicate("Paid jobs", (booking) => prettifyStatus(booking.status) === "Paid") },
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
                    <AnalyticsSummarySection title="Core data quality" summary={`${analytics.dataQuality.missingDates} bookings are missing dates, ${analytics.dataQuality.missingStatus} are missing a status and ${analytics.dataQuality.invalidJobNumber} have an invalid job number.`} items={dataQualityCards.slice(0, 3).map((item) => ({ label: item.label, value: analytics.dataQuality[item.key], severity: item.severity, onClick: () => drilldownByPredicate(item.title, item.match) }))} />
                    <BarChart title="Payable hotel cost by month" subtitle="Production-paid accommodation is excluded" monthly data={hotelStats.costSeries} rightLabel="GBP" valueFormatter={gbp} />
                  </div>
                  <CollapsibleSection title="Commercial coverage and legacy data" description="Supporting completeness checks across the selected bookings">
                    <AnalyticsSummarySection items={dataQualityCards.slice(3).map((item) => ({ label: item.label, value: analytics.dataQuality[item.key], severity: item.severity, onClick: () => drilldownByPredicate(item.title, item.match) }))} />
                  </CollapsibleSection>
                  <CalculationDetails>Hotel costs are assigned to the month of the job’s first date. Production-paid hotels remain in job and night counts but are excluded from Bickers payable totals.</CalculationDetails>
                </section>
              ) : null}
            </>
          )}
      </BusinessPage>

      <DrilldownModal drilldown={drilldown} onClose={() => setDrilldown(null)} onExport={exportDrilldown} formatVehicle={resolveVehicleLabel} formatCredits={formatCredits} displayToken={displayToken} />
    </HeaderSidebarLayout>
  );
}
