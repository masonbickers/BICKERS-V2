"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DailyBriefingPanel from "./DailyBriefingPanel";
import { buildBookingAnalytics, normaliseBookingForAnalytics } from "@/app/utils/bookingAnalytics";
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

/* ------------------------------- Styling tokens ------------------------------- */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid var(--legacy-color-d7dee8)",
  bg: "var(--legacy-color-f3f6f9)",
  card: "var(--legacy-color-ffffff)",
  text: "var(--legacy-color-0f172a)",
  muted: "var(--legacy-color-5f6f82)",
  brand: "var(--legacy-color-1f4b7a)",
  brandSoft: "var(--legacy-color-edf3f8)",
  brandBorder: "var(--legacy-color-c8d6e3)",
  successSoft: "var(--legacy-color-ecfdf5)",
  successText: "var(--legacy-color-166534)",
  warningSoft: "var(--legacy-color-fff7ed)",
  warningBorder: "var(--legacy-color-fed7aa)",
  dangerSoft: "var(--legacy-color-fcefee)",
  dangerText: "var(--legacy-color-991b1b)",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = {
  color: UI.text,
  fontSize: 22,
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
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
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
  padding: 12,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: UI.brandBorder };
const filterSelectStyle = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: 13.5,
  outline: "none",
  background: "var(--legacy-color-fff)",
  color: UI.text,
  boxSizing: "border-box",
};
const panel = { ...surface, padding: 12 };
const sectionTitle = { fontWeight: 800, fontSize: 16, color: UI.text, lineHeight: 1.2 };
const sectionMeta = { color: UI.muted, fontSize: 12.5, lineHeight: 1.4 };
const statLabel = { color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const statValue = { fontSize: 22, fontWeight: 800, color: UI.text, lineHeight: 1.1 };

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
  high: { border: "var(--legacy-color-f1b8b8)", bg: UI.dangerSoft, text: UI.dangerText },
  medium: { border: UI.warningBorder, bg: UI.warningSoft, text: "var(--legacy-color-92400e)" },
  neutral: { border: "var(--legacy-color-d7dee8)", bg: "var(--legacy-color-fff)", text: UI.text },
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
  switch (label) {
    case "Confirmed":
      return { bg: "var(--legacy-color-f3f970)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "First Pencil":
      return { bg: "var(--legacy-color-89caf5)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Second Pencil":
      return { bg: "var(--legacy-color-f73939)", text: "var(--legacy-color-fff)", border: "var(--legacy-color-0b0b0b)" };
    case "Complete":
      return { bg: "var(--legacy-color-92d18cff)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Action Required":
      return { bg: "var(--legacy-color-ff973b)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Maintenance":
      return { bg: "var(--legacy-color-da8e58ff)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Bickers":
      return { bg: "var(--legacy-color-ffffff)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Stunt":
      return { bg: "var(--legacy-color-f3f970)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Holiday":
      return { bg: "var(--legacy-color-d3d3d3)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "DNH":
    case "Postponed":
    case "Deleted":
      return { bg: "var(--legacy-color-c2c2c2)", text: "var(--legacy-color-111)", border: "var(--legacy-color-c2c2c2)" };
    case "Ready to Invoice":
      return { bg: "var(--legacy-color-fef3c7)", border: "var(--legacy-color-fde68a)", text: "var(--legacy-color-92400e)" };
    case "Invoiced":
      return { bg: "var(--legacy-color-e0e7ff)", border: "var(--legacy-color-c7d2fe)", text: "var(--legacy-color-3730a3)" };
    case "Paid":
      return { bg: "var(--legacy-color-92d18cff)", text: "var(--legacy-color-111)", border: "var(--legacy-color-0b0b0b)" };
    case "Cancelled":
      return { bg: "var(--legacy-color-f3f4f6)", border: "var(--legacy-color-e5e7eb)", text: "var(--legacy-color-374151)" };
    case "Enquiry":
      return { bg: "var(--legacy-color-f3f4f6)", border: "var(--legacy-color-e5e7eb)", text: "var(--legacy-color-374151)" };
    case "TBC":
      return { bg: "var(--legacy-color-f3f4f6)", border: "var(--legacy-color-e5e7eb)", text: "var(--legacy-color-374151)" };
    default:
      return { bg: "var(--legacy-color-e5e7eb)", border: "var(--legacy-color-d1d5db)", text: "var(--legacy-color-111827)" };
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
        borderRadius: 999,
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

/* Section */
function BarChart({ title, subtitle, data = [], rightLabel = "Count", valueFormatter }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  return (
    <div style={panel}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={sectionTitle}>{title}</div>
          {subtitle ? <div style={{ ...sectionMeta, marginTop: 3 }}>{subtitle}</div> : null}
        </div>
        <div style={chip}>{rightLabel}</div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {data.length ? (
          data.map((row) => (
            <div
              key={row.label}
              className="statistics-bar-row"
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 80px",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 13,
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
                  background: "var(--legacy-color-edf3f8)",
                  border: UI.border,
                  height: 10,
                  borderRadius: 999,
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
              <div style={{ textAlign: "right", fontWeight: 900, fontSize: 13 }}>
                {valueFormatter ? valueFormatter(row.value) : row.value}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: UI.muted, fontSize: 13 }}>No data.</div>
        )}
      </div>
    </div>
  );
}

function StackedBarChart({ title, subtitle, data = [], rightLabel = "Count", valueFormatter }) {
  const max = Math.max(1, ...data.map((row) => row.total || 0));
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
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={sectionTitle}>{title}</div>
          {subtitle ? <div style={{ ...sectionMeta, marginTop: 3 }}>{subtitle}</div> : null}
        </div>
        <div style={chip}>{rightLabel}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {segmentLabels.map((label) => {
          const colors = statusColors(label);
          return (
            <span key={label} style={{ ...chip, padding: "4px 8px", background: colors.bg, borderColor: colors.border, color: colors.text }}>
              {label}
            </span>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {data.length ? (
          data.map((row) => (
            <div
              key={row.label}
              className="statistics-bar-row"
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 80px",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 13,
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
                  background: "var(--legacy-color-edf3f8)",
                  border: UI.border,
                  height: 12,
                  borderRadius: 999,
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
              <div style={{ textAlign: "right", fontWeight: 900, fontSize: 13 }}>
                {valueFormatter ? valueFormatter(row.total) : row.total}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: UI.muted, fontSize: 13 }}>No data.</div>
        )}
      </div>
    </div>
  );
}

/* Section */
function AnalyticsSummarySection({ title, items = [] }) {
  return (
    <div style={panel}>
      <div style={{ ...sectionTitle, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
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
                <div style={{ ...statValue, marginTop: 4, color: severity.text }}>{item.value}</div>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={sectionTitle}>{title}</div>
        <div style={sectionMeta}>{rows.length} item(s)</div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 60px 86px 70px", gap: 8, ...statLabel }}>
          <span>Name</span>
          <span style={{ textAlign: "right" }}>Jobs</span>
          <span style={{ textAlign: "right" }}>Days</span>
          <span style={{ textAlign: "right" }}>Credits</span>
        </div>
        {rows.slice(0, 8).map((row) => (
          <button
            key={row.name}
            type="button"
            onClick={() => onRowClick?.(row)}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) 60px 86px 70px",
              gap: 8,
              alignItems: "center",
              border: "none",
              borderTop: "1px solid var(--legacy-color-e7edf4)",
              padding: "6px 0 0",
              background: "transparent",
              color: UI.text,
              fontSize: 13,
              textAlign: "left",
              cursor: onRowClick ? "pointer" : "default",
            }}
          >
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 800 }}>{row.name}</span>
            <span style={{ textAlign: "right" }}>{row.count}</span>
            <span style={{ textAlign: "right" }}>{row.bookingDays}</span>
            <span style={{ textAlign: "right" }}>{formatCredits(row.credits)}</span>
          </button>
        ))}
        {!rows.length && <div style={{ color: UI.muted, fontSize: 13 }}>No data for this filter.</div>}
      </div>
    </div>
  );
}

function MonthlyPerformanceTable({ rows = [], onMonthClick }) {
  return (
    <div style={panel}>
      <div style={{ ...sectionTitle, marginBottom: 10 }}>Monthly performance</div>
      <div style={{ display: "grid", gap: 6, overflowX: "auto" }}>
        <div className="statistics-table-heading" style={{ display: "grid", gridTemplateColumns: "110px repeat(6, 1fr)", gap: 8, minWidth: 680, ...statLabel }}>
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
              gap: 8,
              minWidth: 680,
              border: "none",
              borderTop: "1px solid var(--legacy-color-e7edf4)",
              padding: "6px 0 0",
              background: "transparent",
              color: UI.text,
              fontSize: 13,
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
        {!rows.length && <div style={{ color: UI.muted, fontSize: 13 }}>No monthly data in current filters.</div>}
      </div>
    </div>
  );
}

function DrilldownPanel({ drilldown, onClose, onExport, formatVehicle }) {
  if (!drilldown) return null;

  return (
    <div style={{ ...panel, marginBottom: UI.gap, borderColor: UI.brandBorder }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={sectionTitle}>{drilldown.title}</div>
          <div style={sectionMeta}>
            {drilldown.bookings.length} booking{drilldown.bookings.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
      <div style={{ display: "grid", gap: 6, overflowX: "auto" }}>
        <div className="statistics-table-heading" style={{ display: "grid", gridTemplateColumns: "90px 180px 120px 90px 90px 90px 80px 220px 220px", gap: 8, minWidth: 1180, ...statLabel }}>
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
              gap: 8,
              minWidth: 1180,
              borderTop: "1px solid var(--legacy-color-e7edf4)",
              paddingTop: 6,
              color: UI.text,
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            <b>{booking.jobNumber || "-"}</b>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{booking.client || "-"}</span>
            <span>{booking.status || "-"}</span>
            <span>{booking.firstDate || "-"}</span>
            <span>{booking.lastDate || "-"}</span>
            <span>{booking.bookingDayCount}</span>
            <span>{formatCredits(booking.creditTotal)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {booking.vehicles?.map((vehicle) => formatVehicle(displayToken(vehicle))).filter(Boolean).join(", ") || "-"}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {booking.employees?.map(displayToken).filter(Boolean).join(", ") || "-"}
            </span>
          </Link>
        ))}
        {!drilldown.bookings.length && <div style={{ color: UI.muted, fontSize: 13 }}>No matching bookings.</div>}
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
  const searchRef = useRef(null);

  const [rangeMode, setRangeMode] = useState("12m"); // 30d | 90d | 12m | month | all
  const [selectedMonth, setSelectedMonth] = useState(() => monthInputValue(new Date()));
  const [compareMonth, setCompareMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return monthInputValue(d);
  });
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [statusCategoryFilter, setStatusCategoryFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [drilldown, setDrilldown] = useState(null);

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

  const rangeStart = useMemo(() => {
    if (rangeMode === "month") return monthBounds(selectedMonth).start;
    if (rangeMode === "all") return null;
    const d = new Date(todayMidnight);
    if (rangeMode === "30d") d.setDate(d.getDate() - 30);
    if (rangeMode === "90d") d.setDate(d.getDate() - 90);
    if (rangeMode === "12m") d.setFullYear(d.getFullYear() - 1);
    return d;
  }, [rangeMode, selectedMonth, todayMidnight]);

  const rangeEnd = useMemo(() => {
    if (rangeMode === "month") return monthBounds(selectedMonth).end;
    return null;
  }, [rangeMode, selectedMonth]);

  const filterRange = useMemo(() => {
    const now = new Date(todayMidnight);
    if (dateRangeFilter === "all" || dateRangeFilter === "custom") return { start: null, end: null };
    if (dateRangeFilter === "thisMonth") {
      return monthBounds(monthInputValue(now));
    }
    if (dateRangeFilter === "lastMonth") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return monthBounds(monthInputValue(d));
    }
    if (dateRangeFilter === "thisYear") {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    return { start: null, end: null };
  }, [dateRangeFilter, todayMidnight]);

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

  const jobsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobsAll.filter((j) => {
      const normalised = normaliseBookingForAnalytics(j);
      const prettyStatus = prettifyStatus(j.status || "");
      if (statusFilter !== "All" && prettyStatus !== statusFilter) return false;
      if (statusCategoryFilter !== "all" && normalised.statusCategory !== statusCategoryFilter) return false;
      if (clientFilter !== "all" && normalised.client !== clientFilter) return false;
      if (vehicleFilter !== "all" && !normalised.vehicles.some((vehicle) => resolveVehicleLabel(displayToken(vehicle)) === vehicleFilter)) return false;
      if (employeeFilter !== "all" && !normalised.employees.some((employee) => displayToken(employee) === employeeFilter)) return false;

      const days = normaliseJobDates(j);
      if (filterRange.start) {
        const startMs = filterRange.start.getTime();
        const endMs = filterRange.end ? filterRange.end.getTime() : Infinity;
        const analyticsDates = normalised.dates.map((date) => parseDate(date)).filter(Boolean);
        const anyInRange = analyticsDates.some((d) => d.getTime() >= startMs && d.getTime() <= endMs);
        const created = parseDate(j.createdAt);
        const createdInRange = created ? created.getTime() >= startMs && created.getTime() <= endMs : false;
        if (!anyInRange && !createdInRange) return false;
      }
      if (rangeStart) {
        const startMs = rangeStart.getTime();
        const endMs = rangeEnd ? rangeEnd.getTime() : Infinity;
        const anyInRange = days.some((d) => d.getTime() >= startMs && d.getTime() <= endMs);
        const created = parseDate(j.createdAt);
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
        prettyStatus,
        ...(toCrewNames(j.employees) || []),
        ...(toVehicleTokens(j.vehicles) || []),
        ...(toEquipmentTokens(j.equipment) || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [
    clientFilter,
    employeeFilter,
    filterRange,
    jobsAll,
    rangeEnd,
    rangeStart,
    search,
    resolveVehicleLabel,
    statusCategoryFilter,
    statusFilter,
    vehicleFilter,
  ]);

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
    setDateRangeFilter("all");
    setStatusCategoryFilter("all");
    setClientFilter("all");
    setVehicleFilter("all");
    setEmployeeFilter("all");
    setStatusFilter("All");
    setDrilldown(null);
    searchRef.current?.focus();
  };

  const activeFilterLabels = useMemo(() => {
    const labels = [];
    if (search.trim()) labels.push(`Search: "${search.trim()}"`);
    if (dateRangeFilter !== "all") {
      const names = { thisMonth: "This month", lastMonth: "Last month", thisYear: "This year", custom: "Custom later" };
      labels.push(`Date: ${names[dateRangeFilter] || dateRangeFilter}`);
    }
    if (statusCategoryFilter !== "all") labels.push(`Category: ${statusCategoryFilter}`);
    if (clientFilter !== "all") labels.push(`Client: ${clientFilter}`);
    if (vehicleFilter !== "all") labels.push(`Vehicle: ${vehicleFilter}`);
    if (employeeFilter !== "all") labels.push(`Crew: ${employeeFilter}`);
    if (statusFilter !== "All") labels.push(`Status: ${statusFilter}`);
    return labels;
  }, [clientFilter, dateRangeFilter, employeeFilter, search, statusCategoryFilter, statusFilter, vehicleFilter]);

  const hasActiveFilters = activeFilterLabels.length > 0;

  const getActiveFilterSummary = () => {
    if (!hasActiveFilters) return "Showing all bookings";
    const bits = [];
    if (statusCategoryFilter !== "all") bits.push(`${statusCategoryFilter} bookings`);
    else bits.push(`${analytics.totals.bookingCount} filtered bookings`);
    if (dateRangeFilter !== "all") {
      const names = { thisMonth: "this month", lastMonth: "last month", thisYear: "this year", custom: "custom range" };
      bits.push(`for ${names[dateRangeFilter] || dateRangeFilter}`);
    }
    if (clientFilter !== "all") bits.push(`for ${clientFilter}`);
    if (vehicleFilter !== "all") bits.push(`using ${vehicleFilter}`);
    if (employeeFilter !== "all") bits.push(`with ${employeeFilter}`);
    if (search.trim()) bits.push(`matching "${search.trim()}"`);
    return `Showing ${bits.join(" ")}`;
  };

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
      const anchor = entries[0]?.date || parseDate(j.createdAt);
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
        className="statistics-job-row"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px,1fr) 160px 120px auto",
          gap: 8,
          padding: "8px 10px",
          borderTop: "1px solid var(--legacy-color-e7edf4)",
          textDecoration: "none",
          color: UI.text,
        }}
      >
        <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          #{j.jobNumber || j.id} - {j.client || "-"}
        </div>
        <div style={{ color: UI.muted, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {j.location || "-"}
        </div>
        <div style={{ fontSize: 13, whiteSpace: "nowrap" }}>{datesLabel}</div>
        <div style={{ justifySelf: "end" }}>
          <StatusBadge value={pretty} />
        </div>
      </Link>
    );
  };

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
          borderColor: "var(--legacy-color-d7dee8)",
        })
      }
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
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
        <div style={headerBar}>
          <div>
            <h1 style={{ ...h1, display: "flex", alignItems: "center", gap: 8 }}>
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
          <div className="statistics-header-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>
              <BriefcaseBusiness size={14} />
              {loading ? "Loading..." : `${jobsAll.length} jobs`}
            </div>
            <div style={{ ...chip, background: UI.successSoft, borderColor: "var(--legacy-color-bbf7d0)", color: UI.successText }}>
              <Filter size={14} />
              Filtered: <b style={{ marginLeft: 6 }}>{jobsFiltered.length}</b>
            </div>
            <div style={{ ...chip, background: UI.warningSoft, borderColor: UI.warningBorder }}>
              <CalendarDays size={14} />
              Deleted in scope: <b style={{ marginLeft: 6 }}>{deletedJobsFiltered.length}</b>
            </div>
            <button type="button" onClick={exportAnalyticsSummary} style={{ ...chip, cursor: "pointer", background: "var(--legacy-color-fff)" }}>
              <Download size={14} />
              Export summary CSV
            </button>
            <button type="button" onClick={exportDrilldown} style={{ ...chip, cursor: "pointer", background: "var(--legacy-color-fff)" }}>
              <Download size={14} />
              Export drill-down CSV
            </button>
          </div>
        </div>

        <DailyBriefingPanel />

        <div style={{ ...panel, marginBottom: UI.gap }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
                <SlidersHorizontal size={16} color={UI.brand} />
                Filters
              </div>
              <div style={sectionMeta}>Refine the dashboard before analytics are calculated.</div>
            </div>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} style={{ ...chip, cursor: "pointer", background: "var(--legacy-color-fff)" }}>
                <X size={14} />
                Clear filters
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                color={UI.muted}
                style={{ position: "absolute", left: 10, top: 10, pointerEvents: "none" }}
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
                  minHeight: 36,
                  padding: "7px 9px 7px 34px",
                  borderRadius: UI.radiusSm,
                  border: UI.border,
                  fontSize: 13.5,
                  outline: "none",
                  background: "var(--legacy-color-fff)",
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
                background: rangeMode === "month" ? "var(--legacy-color-fff)" : "var(--legacy-color-f8fbfd)",
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
                background: rangeMode === "month" ? "var(--legacy-color-fff)" : "var(--legacy-color-f8fbfd)",
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
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
              <button type="button" onClick={clearFilters} style={{ ...chip, cursor: "pointer", background: "var(--legacy-color-fff)", marginTop: 12 }}>
                <X size={14} />
                Clear filters
              </button>
            )}
          </div>
        )}

        <div style={{ marginBottom: UI.gap }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
            <div style={sectionTitle}>Shortcuts</div>
            <div style={sectionMeta}>Jump into related pages</div>
          </div>
          <div className="statistics-shortcuts" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
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
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
            <div style={sectionTitle}>At a glance</div>
            <div style={sectionMeta}>
              Range start: <span style={mono}>{rangeStart ? fmtDDMMYY(rangeStart) : "All time"}</span>
            </div>
          </div>

          <div style={kpiGrid}>
            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Jobs</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{analytics.totals.bookingCount}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Filtered</div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Booking days</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{analytics.totals.bookingDays}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Sum of dates</div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: UI.brandBorder }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Credits</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{formatCredits(analytics.totals.credits)}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>From day notes</div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: UI.brandBorder }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Travel days</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{formatCredits(analytics.totals.travelDays)}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Travel + half travel + travel time</div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: UI.brandBorder }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Night shoots</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{analytics.totals.nightShoots}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Night shoot day notes</div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: UI.brandBorder }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Shoot days / month</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{shootKpis.avgPerMonth}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Avg across <b>{shootKpis.monthsWithDataCount}</b> month(s) - This month: <b>{shootKpis.thisMonth}</b>
              </div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Upcoming</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.upcomingJobs}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Has date &gt;= today</div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-d1fae5)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Avg job length</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{jobLengthStats.avgLengthDays}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Median: <b>{jobLengthStats.medianLengthDays || 0}</b> day(s)
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-d1fae5)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Avg confirmed length</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{jobLengthStats.avgConfirmedLengthDays}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Multi-day jobs: <b>{jobLengthStats.multiDayJobs}</b>
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-cffafe)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Avg crew / job</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{crewStats.avgCrewPerJob}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Across <b>{crewStats.crewedJobs}</b> crewed job(s)
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-cffafe)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Avg confirmed crew</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{crewStats.avgConfirmedCrewPerJob}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Largest crew: <b>{crewStats.largestCrew}</b>
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-fde68a)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Added to confirmed</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{timelineStats.avgCreateToConfirmedDays}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Avg days across <b>{timelineStats.confirmedSample}</b> confirmed job(s)
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-fde68a)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Added to first shoot</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{timelineStats.avgCreateToShootDays}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Avg days across <b>{timelineStats.shootSample}</b> job(s)
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-bfdbfe)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>First pencil cohort</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{firstPencilFunnel.total}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Current + deleted in scope
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-bfdbfe)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>First pencil to confirmed</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{firstPencilFunnel.confirmedRate}%</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                {firstPencilFunnel.confirmed} of {firstPencilFunnel.total}
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-fecaca)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>First pencil dead outcomes</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{firstPencilFunnel.deadRate}%</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Deleted / DNH / Lost / Cancelled / Postponed
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-e9d5ff)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Hotel cost (payable)</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{gbp(hotelStats.totalHotelCost)}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                {hotelStats.payableHotelJobs} job(s) - {hotelStats.payableHotelNights} night(s)
              </div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "var(--legacy-color-e9d5ff)" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Avg hotel / night (payable)</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{gbp(hotelStats.avgPerNight)}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                This month: <b>{gbp(hotelStats.thisMonthCost)}</b> ({hotelStats.thisMonthNights} nights)
              </div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Complete</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.completedJobs}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Status = Complete</div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Needs action</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.actionJobs}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Status = Action Required</div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Deleted</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.deletedTotal}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Deleted bookings</div>
            </div>
          </div>

          <div style={{ ...surface, padding: 12, marginTop: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...chip, background: "var(--legacy-color-fff7ed)" }}>
                Missing HS: <b style={{ marginLeft: 6 }}>{kpis.missingHS}</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-fff7ed)" }}>
                Missing RA: <b style={{ marginLeft: 6 }}>{kpis.missingRA}</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-f3f4f6)" }}>
                Cancelled: <b style={{ marginLeft: 6 }}>{kpis.cancelledJobs}</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-eff6ff)", borderColor: "var(--legacy-color-bfdbfe)" }}>
                First pencil confirmed: <b style={{ marginLeft: 6 }}>{firstPencilFunnel.confirmedRate}%</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-fef2f2)", borderColor: "var(--legacy-color-fecaca)" }}>
                First pencil dead: <b style={{ marginLeft: 6 }}>{firstPencilFunnel.deadRate}%</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-ecfccb)", borderColor: "var(--legacy-color-bef264)" }}>
                Avg job length: <b style={{ marginLeft: 6 }}>{jobLengthStats.avgLengthDays}</b> day(s)
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-ecfeff)", borderColor: "var(--legacy-color-a5f3fc)" }}>
                Avg crew / job: <b style={{ marginLeft: 6 }}>{crewStats.avgCrewPerJob}</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-fef3c7)", borderColor: "var(--legacy-color-fde68a)" }}>
                Added to confirmed: <b style={{ marginLeft: 6 }}>{timelineStats.avgCreateToConfirmedDays}</b> day(s)
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-fffbeb)", borderColor: "var(--legacy-color-fde68a)" }}>
                Added to first shoot: <b style={{ marginLeft: 6 }}>{timelineStats.avgCreateToShootDays}</b> day(s)
              </span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: UI.brandBorder }}>
                Shoot days (total): <b style={{ marginLeft: 6 }}>{shootKpis.totalShootDays}</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-ecfeff)", borderColor: "var(--legacy-color-a5f3fc)" }}>
                Credits: <b style={{ marginLeft: 6 }}>{formatCredits(totalCredits)}</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-f3e8ff)", borderColor: "var(--legacy-color-e9d5ff)" }}>
                Avg hotel / job (payable): <b style={{ marginLeft: 6 }}>{gbp(hotelStats.avgPerHotelJob)}</b>
              </span>
              <span style={{ ...chip, background: "var(--legacy-color-f3e8ff)", borderColor: "var(--legacy-color-e9d5ff)" }}>
                Production-paid: <b style={{ marginLeft: 6 }}>{hotelStats.productionPaidHotelNights}</b> nights
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
            subtitle="Counts each booking once, by first booking date"
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
            <div style={{ ...sectionTitle, marginBottom: 8 }}>
              Credit breakdown {rangeMode === "month" ? monthLabel(selectedMonth) : monthLabel(yyyymm(todayMidnight))}
            </div>
            <div style={sectionMeta}>
              Counts per-day diary notes from <span style={mono}>notesByDate</span>, <span style={mono}>dayNotes</span>,
              and related daily note fields. <b>On Set</b>, <b>Night Shoot</b>, <b>Travel Day</b>, <b>Split Day</b>,
              <b>Standby Day</b>, and <b>Rehearsal Day</b> count as 1 credit. <b>1/2 Travel Day</b> counts as 0.5.
              <b> Travel Time</b> counts as 0.25.
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
              {selectedMonthCreditRows.length ? (
                selectedMonthCreditRows.slice(0, 30).map((row, idx) => (
                  <div
                    key={`${row.date}-${row.jobNumber}-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "76px 72px minmax(0,1fr) 110px 52px",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 12,
                      borderTop: idx ? "1px solid var(--legacy-color-e7edf4)" : "none",
                      paddingTop: idx ? 6 : 0,
                    }}
                  >
                    <span style={mono}>{row.date.slice(5)}</span>
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
                    <span style={{ color: row.counted ? "var(--legacy-color-065f46)" : UI.muted, fontSize: 11 }}>{row.reason}</span>
                    <b style={{ textAlign: "right", color: row.counted ? UI.text : UI.muted }}>{formatCredits(row.credit)}</b>
                  </div>
                ))
              ) : (
                <div style={{ color: UI.muted, fontSize: 13 }}>No credited days in this month.</div>
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
            <div style={{ ...sectionTitle, marginBottom: 8 }}>Hotel stat rules</div>
            <div style={sectionMeta}>
              We treat a booking as having a hotel if <span style={mono}>hasHotel</span> is true, or if we can find any
              of: <span style={mono}>hotelTotal</span>, <span style={mono}>hotelCostPerNight</span>,{" "}
              <span style={mono}>hotelNights</span> (plus common aliases).
              <br />
              <br />
              If <span style={mono}>hotelPaidBy</span> is <b>Production</b>, we still count hotel jobs/nights, but we{" "}
              <b>exclude the GBP cost</b> from payable totals and charts.
              <br />
              <br />
              Monthly hotel cost is assigned to the month of the job&apos;s <b>first date</b> (simple & consistent).
            </div>
          </div>
        </div>

        <div className="statistics-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap }}>
          <div style={{ ...panel, minHeight: 220 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={sectionTitle}>Next up</div>
              <Link
                href="/job-sheet?section=Upcoming"
                style={{ fontSize: 13, fontWeight: 800, color: UI.brand, textDecoration: "none" }}
              >
                View all -&gt;
              </Link>
            </div>
            <div style={{ border: UI.border, borderRadius: UI.radius, overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Loading...</div>
              ) : upcomingNext.length ? (
                upcomingNext.map(jobRow)
              ) : (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>No upcoming jobs in current filters.</div>
              )}
            </div>
          </div>

          <div style={{ ...panel, minHeight: 220 }}>
            <div style={{ ...sectionTitle, marginBottom: 8 }}>How &quot;shoot days&quot; are counted</div>
            <div style={sectionMeta}>
              We count a day as a <b>shoot day</b> when the booking has a per-day note of <b>On Set</b> or{" "}
              <b>Night Shoot</b> (from <span style={mono}>notesByDate / dayNotes / notesForEachDay / noteForDay</span>).
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
