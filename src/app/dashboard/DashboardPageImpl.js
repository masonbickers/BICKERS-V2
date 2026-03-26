// src/app/dashboard/page.js
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import "react-big-calendar/lib/css/react-big-calendar.css";

const BigCalendar = dynamic(
  () => import("react-big-calendar").then((m) => m.Calendar),
  { ssr: false }
);

import { localizer } from "../utils/localizer";
import { buildAssetLabel, getCanonicalDueDate } from "../utils/maintenanceSchema";
import {
  collection,
  onSnapshot,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

import ViewBookingModal from "../components/ViewBookingModal";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Check } from "lucide-react";
import EditHolidayForm from "../components/EditHolidayForm";
import HolidayForm from "../components/holidayform";
import CreateNote from "../components/create-note";
import DashboardMaintenanceModal from "../components/DashboardMaintenanceModal";
import MaintenanceBookingForm from "../components/MaintenanceBookingForm";
import MaintenanceBookingPickerModal from "../components/MaintenanceBookingPickerModal";

/* ───────────────────────────────────────────
   New styling tokens (match your HR page)
─────────────────────────────────────────── */
const UI = {
  radius: 16,
  radiusSm: 12,
  gap: 14,
  shadowSm: "0 10px 30px rgba(15,23,42,0.06)",
  shadowHover: "0 16px 36px rgba(15,23,42,0.10)",
  border: "1px solid #dbe2ea",
  bg: "#eef3f8",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c7d6e3",
  accent: "#8b5e3c",
  accentSoft: "#f5ede6",
  successSoft: "#edf7f2",
  warningSoft: "#fcf3e6",
  dangerSoft: "#fcefee",
};

const pageWrap = {
  padding: "22px 18px 34px",
  background: UI.bg,
  minHeight: "100vh",
};

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
  fontSize: 30,
  lineHeight: 1.08,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: 0,
};

const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const headerActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
};

const headerSearchWrap = {
  position: "relative",
  minWidth: 260,
  maxWidth: 320,
  width: "100%",
};

const headerSearchInput = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #d6dee8",
  background: "#fff",
  color: UI.text,
  fontSize: 13.5,
  outline: "none",
};

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const card = {
  ...surface,
  padding: 14,
};

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};

const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: "-0.01em" };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };

const sectionActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
};

const chip = {
  padding: "7px 11px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      padding: "9px 12px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "#fff",
      color: UI.text,
      fontWeight: 700,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    };
  }
  if (kind === "danger") {
    return {
      padding: "9px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #e9c6c4",
      background: UI.dangerSoft,
      color: "#991b1b",
      fontWeight: 700,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    padding: "9px 12px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.16)",
  };
};

const btnDisabled = (base) => ({
  ...base,
  opacity: 0.45,
  cursor: "not-allowed",
  pointerEvents: "none",
  filter: "grayscale(0.2)",
});

const successBanner = {
  background: UI.successSoft,
  color: "#065f46",
  border: "1px solid #b7dec7",
  borderRadius: UI.radiusSm,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 700,
};

const tableWrap = {
  width: "100%",
  overflow: "auto",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: "#fff",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
};
const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13.5,
};
const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #dde5ee",
  position: "sticky",
  top: 0,
  background: "#f7f9fc",
  zIndex: 1,
  whiteSpace: "nowrap",
  fontWeight: 800,
  fontSize: 12,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td = {
  padding: "10px 12px",
  borderBottom: "1px solid #edf2f7",
  verticalAlign: "middle",
};

const calendarFrame = {
  borderRadius: UI.radiusSm,
  background: "#fff",
  border: UI.border,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
};

const NIGHT_SHOOT_STYLE = { bg: "#f796dfff", text: "#111", border: "#de24e4ff" };

// ---- status colour map used for per-vehicle pills ----
const STATUS_COLORS = {
  Confirmed: { bg: "#f3f970", text: "#111", border: "#0b0b0b" },
  Stunt: { bg: "#f3f970", text: "#111", border: "#0b0b0b" },
  "First Pencil": { bg: "#89caf5", text: "#111", border: "#0b0b0b" },
  "Second Pencil": { bg: "#f73939", text: "#fff", border: "#0b0b0b" },
  Holiday: { bg: "#d3d3d3", text: "#111", border: "#0b0b0b" },
  Maintenance: { bg: "#da8e58ff", text: "#111", border: "#0b0b0b" },
  Complete: { bg: "#92d18cff", text: "#111", border: "#0b0b0b" },
  "Action Required": { bg: "#FF973B", text: "#111", border: "#0b0b0b" },
  DNH: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  Postponed: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  Deleted: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  "Bank Holiday": { bg: "#dbeafe", text: "#111", border: "#0b0b0b" },
};

const normalizeStatusLabel = (raw = "") => {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "confirmed") return "Confirmed";
  if (s === "stunt") return "Stunt";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  if (s === "holiday") return "Holiday";
  if (s === "maintenance") return "Maintenance";
  if (s === "complete" || s === "completed") return "Complete";
  if (s === "action required") return "Action Required";
  if (s === "dnh") return "DNH";
  if (s === "postponed") return "Postponed";
  if (s === "deleted") return "Deleted";
  if (s === "bank holiday") return "Bank Holiday";
  return String(raw || "").trim();
};

const getStatusStyle = (s = "") =>
  STATUS_COLORS[normalizeStatusLabel(s)] || { bg: "#ccc", text: "#111", border: "#0b0b0b" };

// ---- per-user action blocks ----
const RESTRICTED_EMAILS = new Set(["mel@bickers.co.uk"]); // add more if needed
const DELETED_ON_CALENDAR_EMAILS = new Set(["mason@bickers.co.uk", "paul@bickers.co.uk"]);
const HIDEABLE_STATUSES = new Set(["dnh", "postponed", "cancelled", "lost"]);
const DASHBOARD_HIDE_PREFS_KEY = "dashboard:hide-prefs";
const ACTIVE_MAINTENANCE_JOB_STATUSES = new Set([
  "planned",
  "awaiting_parts",
  "in_progress",
  "qa",
]);
const INACTIVE_MAINTENANCE_STATUSES = ["cancelled", "canceled", "declined"];

/* ------------------------------- helpers ------------------------------- */
const parseLocalDate = (d) => {
  if (!d) return null;
  if (typeof d?.toDate === "function") {
    const ts = d.toDate();
    if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
      ts.setHours(12, 0, 0, 0);
      return ts;
    }
  }
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const dt = new Date(d);
    dt.setHours(12, 0, 0, 0);
    return dt;
  }
  const s = typeof d === "string" ? d : String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]),
      mo = Number(m[2]) - 1,
      day = Number(m[3]);
    const dt = new Date(y, mo, day, 12, 0, 0, 0); // noon local
    return dt;
  }
  const dt = new Date(s);
  dt.setHours(12, 0, 0, 0);
  return dt;
};

const startOfLocalDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const mapNoteDocsToCalendarEvents = (docSnaps) => {
  const grouped = new Map();

  docSnaps.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const startRaw = toJsDate(data.startDate || data.date);
    const endRaw = toJsDate(data.endDate || data.startDate || data.date);
    if (!startRaw) return;

    const startBase = startOfLocalDay(startRaw);
    const endBase = endRaw ? startOfLocalDay(endRaw) : startBase;
    const safeEnd = endBase >= startBase ? endBase : startBase;
    const employee = String(data.employee || "").trim();
    const title = data.text || "Note";

    const key = [
      employee,
      title,
      startBase.toISOString(),
      safeEnd.toISOString(),
    ].join("::");

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: docSnap.id,
        title,
        start: startBase,
        end: addDays(safeEnd, 1),
        allDay: true,
        status: "Note",
        employee,
        sourceNoteIds: [docSnap.id],
      });
      return;
    }

    grouped.get(key).sourceNoteIds.push(docSnap.id);
  });

  return Array.from(grouped.values());
};

const isInactiveMaintenanceBooking = (status = "") => {
  const s = String(status || "").trim().toLowerCase();
  return INACTIVE_MAINTENANCE_STATUSES.some((x) => s.includes(x));
};

const dueTone = (dueDate) => {
  if (!dueDate) return "soft";
  const d = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(d.getTime())) return "soft";
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((t1 - t0) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "overdue";
  if (diff <= 21) return "soon";
  return "ok";
};

const isApptAfterExpiry = (appt, expiry) => {
  if (!appt || !expiry) return false;
  const a = new Date(appt.getFullYear(), appt.getMonth(), appt.getDate()).getTime();
  const e = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
  return a > e;
};

const getMaintenanceBookingKind = (booking = {}) => {
  const t = String(booking.type || booking.maintenanceType || "").trim().toUpperCase();
  if (t === "MOT") return "MOT_BOOKING";
  if (t === "SERVICE") return "SERVICE_BOOKING";
  if (t === "WORK") return "MAINTENANCE_BOOKING";
  return "MAINTENANCE_BOOKING";
};

const getMaintenanceDisplayType = (booking = {}) => {
  const explicit = String(booking.maintenanceTypeLabel || "").trim();
  if (explicit) return explicit.toUpperCase();

  const other = String(booking.maintenanceTypeOther || "").trim();
  if (other) return other.toUpperCase();

  const rawType = String(booking.type || booking.maintenanceType || "").trim().toUpperCase();
  if (rawType === "MOT") return "MOT";
  if (rawType === "SERVICE") return "SERVICE";
  if (rawType === "WORK") return "WORK";
  if (rawType) return rawType;

  return "MAINTENANCE";
};

const labelFromMins = (mins) => {
  const n = Number(mins) || 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

//  helper for timestamps / dates / strings  (use this for HOLIDAYS + NOTES)
const toJsDate = (value) => {
  if (!value) return null;

  if (value?.toDate && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
    return new Date(value);
  }

  return new Date(value);
};

// job sort helpers (unchanged)
const jobKey = (val) => {
  const s = (val ?? "").toString().trim();
  const numMatch = s.match(/\d+/);
  const num = numMatch ? Number(numMatch[0]) : Number.NaN;
  return { num, raw: s };
};

//  Call time normaliser (single day, multi-day map, legacy formats)
const normaliseCallTime = (raw) => {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";

  // Handle "7", "07", "7:0", "7.00", "0700"
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length === 1) return `0${digits}:00`; // "7" -> "07:00"
  if (digits.length === 2) return `${digits.padStart(2, "0")}:00`; // "07" -> "07:00"
  if (digits.length === 3) return `0${digits[0]}:${digits.slice(1)}`; // "700" -> "07:00"
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`; // "0730" -> "07:30"

  // Already "HH:MM" style
  const m = s.match(/^(\d{1,2})\s*[:.]\s*(\d{2})$/);
  if (m) {
    const hh = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  return s; // fallback: keep as-is
};

const ymdKey = (d) => {
  try {
    if (!d) return "";
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
};

//  Build/normalise callTimesByDate for EVERY event (single-day, recce-day, multi-day)
const ensureCallTimesByDate = (booking) => {
  const map = {};
  const src =
    booking?.callTimesByDate && typeof booking.callTimesByDate === "object"
      ? booking.callTimesByDate
      : {};

  // copy + normalise existing per-day
  Object.keys(src || {}).forEach((k) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    const v = normaliseCallTime(src[k]);
    if (v) map[k] = v;
  });

  // figure date span (supports bookingDates array too)
  const startBase = parseLocalDate(booking.startDate || booking.date);
  const endRaw = booking.endDate || booking.date || booking.startDate;
  const endBase = parseLocalDate(endRaw) || startBase;

  const safeStart = startBase ? startOfLocalDay(startBase) : null;
  const safeEnd = endBase ? startOfLocalDay(endBase) : safeStart;

  // bookingDates array wins if present (these are explicit ymd strings)
  const dateList =
    Array.isArray(booking.bookingDates) && booking.bookingDates.length
      ? booking.bookingDates.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x)))
      : [];

  const fallbackCall = normaliseCallTime(booking.callTime || booking.calltime || booking.call_time);

  // If we have explicit bookingDates: fill missing keys with fallbackCall
  if (dateList.length) {
    dateList.forEach((ymd) => {
      if (!map[ymd] && fallbackCall) map[ymd] = fallbackCall;
    });

    // Also if single-day and still empty: set that day
    if (!Object.keys(map).length && fallbackCall && dateList.length === 1) {
      map[dateList[0]] = fallbackCall;
    }

    return map;
  }

  // No bookingDates list: use start/end range if possible
  if (safeStart) {
    const s = new Date(safeStart);
    const e = safeEnd ? new Date(safeEnd) : new Date(safeStart);
    if (e < s) e.setTime(s.getTime());

    // for each day in range inclusive
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const key = ymdKey(d);
      if (!key) continue;
      if (!map[key] && fallbackCall) map[key] = fallbackCall;
    }

    // if still empty but we have fallback call: set start day
    const startKey = ymdKey(s);
    if (!Object.keys(map).length && fallbackCall && startKey) map[startKey] = fallbackCall;
  }

  return map;
};

//  pick call time to show for a calendar event (works for single day + recce day + multi-day)
const callTimeForEventDay = (event) => {
  const map = event?.callTimesByDate || {};
  const keys = Object.keys(map || {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));

  // event.start is a Date at 00:00
  const eventKey = event?.start ? ymdKey(event.start) : "";

  // 1) exact match for that day
  if (eventKey && map[eventKey]) return map[eventKey];

  // 2) if a single-day booking, fall back to callTime
  if (event?.callTime) return normaliseCallTime(event.callTime);

  // 3) otherwise first available in sorted order (stable)
  keys.sort((a, b) => new Date(a) - new Date(b));
  for (const k of keys) {
    if (map[k]) return map[k];
  }
  return "";
};

//  Single source of truth for both BOOKINGS + MAINTENANCE
const eventsByJobNumber = (bookings, maintenanceBookings) => {
  // normal bookings → full events
  const bookingEvents = (bookings || []).map((b) => {
    const startBase = parseLocalDate(b.startDate || b.date);
    const endRaw = b.endDate || b.date || b.startDate;
    const endBase = parseLocalDate(endRaw);
    const safeEnd = endBase && startBase && endBase < startBase ? startBase : endBase || startBase;

    //  ensure per-day call times exist even for single-day / recce-day
    const ctByDate = ensureCallTimesByDate(b);

    //  normalise callTime too so badge logic + display are consistent
    const callTime = normaliseCallTime(b.callTime || b.calltime || b.call_time);

    return {
      ...b,
      __collection: b.__collection || "bookings",
      __deletedDocId: b.__deletedDocId || null,
      title: b.client || "",
      start: startOfLocalDay(startBase),
      end: startOfLocalDay(addDays(safeEnd, 1)),
      allDay: true,
      status: b.status || "Confirmed",
      callTime,
      callTimesByDate: ctByDate,
    };
  });

  // maintenance bookings → full events
  const maintenanceEvents = (maintenanceBookings || []).flatMap((m) => {
    if (isInactiveMaintenanceBooking(m.status)) return [];
    const dates = Array.isArray(m.bookingDates) ? m.bookingDates.slice().sort() : [];
    const kind = getMaintenanceBookingKind(m);
    const typeLabel = getMaintenanceDisplayType(m);
    const label =
      m.vehicleLabel ||
      m.vehicleName ||
      m.title ||
      m.jobNumber ||
      "Vehicle";
    const provider = String(m.provider || "").trim();
    const baseTitle =
      `${label} • ${typeLabel}` +
      (provider ? ` • ${provider}` : "");

    //  If bookingDates exists, create one all-day event per selected day
    if (dates.length) {
      return dates
        .map((ymd) => {
          const startBase = parseLocalDate(ymd);
          if (!startBase) return null;

          return {
            ...m,
            __collection: "maintenanceBookings",
            __parentId: m.id, //  link back to true doc id
            __occurrence: ymd, // optional: which day this is
            id: `${m.id}__${ymd}`, //  unique per-day id for calendar rendering

            jobNumber: m.jobNumber ?? "",
            title: baseTitle,
            kind,
            bookingStatus: m.status || "Booked",
            maintenanceType: m.maintenanceType || "",
            maintenanceTypeOther: m.maintenanceTypeOther || "",
            maintenanceTypeLabel: typeLabel,

            start: startOfLocalDay(startBase),
            end: startOfLocalDay(addDays(startBase, 1)),
            allDay: true,
            status: "Maintenance",
          };
        })
        .filter(Boolean);
    }

    //  Fallback for older docs that don’t have bookingDates
    const startBase = parseLocalDate(m.startDate || m.date || m.start || m.startDay);
    if (!startBase) return [];

    const endRaw = m.endDate || m.end || m.date || m.startDate || m.start || m.startDay;
    const endBase = parseLocalDate(endRaw);
    const safeEnd = endBase && endBase >= startBase ? endBase : startBase;

    return [
      {
        ...m,
        __collection: "maintenanceBookings",
        __parentId: m.id,
        id: m.id,
        jobNumber: m.jobNumber ?? "",
        title: baseTitle,
        kind,
        bookingStatus: m.status || "Booked",
        maintenanceType: m.maintenanceType || "",
        maintenanceTypeOther: m.maintenanceTypeOther || "",
        maintenanceTypeLabel: typeLabel,
        start: startOfLocalDay(startBase),
        end: startOfLocalDay(addDays(safeEnd, 1)),
        allDay: true,
        status: "Maintenance",
      },
    ];
  });

  const all = [...bookingEvents, ...maintenanceEvents];

  all.sort((a, b) => {
    const ak = jobKey(a.jobNumber);
    const bk = jobKey(b.jobNumber);
    const aNum = Number.isNaN(ak.num) ? -Infinity : ak.num;
    const bNum = Number.isNaN(bk.num) ? -Infinity : bk.num;

    if (bNum !== aNum) return bNum - aNum;
    if ((bk.raw || "") !== (ak.raw || "")) return (bk.raw || "").localeCompare(ak.raw || "");
    if (a.start.getTime() !== b.start.getTime()) return a.start - b.start;
    const spanA = a.end - a.start;
    const spanB = b.end - b.start;
    if (spanA !== spanB) return spanB - spanA;
    return 0;
  });

  return all;
};

const formatCrew = (employees) => {
  if (!Array.isArray(employees) || employees.length === 0) return "—";
  return employees
    .map((emp) => {
      if (typeof emp === "string") return emp;
      if (!emp || typeof emp !== "object") return "";
      const fromName = emp.name?.toString().trim();
      if (fromName) return fromName;
      const firstLast = [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim();
      if (firstLast) return firstLast;
      const display = emp.displayName?.toString().trim();
      if (display) return display;
      const email = emp.email?.toString().trim();
      if (email) return email;
      return "";
    })
    .filter(Boolean)
    .join(", ");
};

//  NEW: get crew needed / required (supports multiple field names + role arrays)
const getCrewNeeded = (bookingOrEvent) => {
  const b = bookingOrEvent || {};

  const tryNum = (v) => {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // Common numeric fields you might have stored
  const direct =
    tryNum(b.crewNeeded) ??
    tryNum(b.crewRequired) ??
    tryNum(b.crewCount) ??
    tryNum(b.numberOfCrew) ??
    tryNum(b.crewSize) ??
    tryNum(b.requiredCrewCount) ??
    tryNum(b.requiredCrew) ??
    null;

  if (direct !== null) return direct;

  // If you store "roles needed" as arrays/objects
  const rolesArr =
    (Array.isArray(b.crewRolesNeeded) && b.crewRolesNeeded) ||
    (Array.isArray(b.rolesNeeded) && b.rolesNeeded) ||
    (Array.isArray(b.requiredRoles) && b.requiredRoles) ||
    null;

  if (rolesArr && rolesArr.length) return rolesArr.length;

  // If you store crewRequirements as object map { role: qty }
  if (b.crewRequirements && typeof b.crewRequirements === "object" && !Array.isArray(b.crewRequirements)) {
    const sum = Object.values(b.crewRequirements).reduce((acc, v) => acc + (tryNum(v) || 0), 0);
    if (Number.isFinite(sum) && sum > 0) return sum;
  }

  return null;
};

/* --------------------- CalendarEvent (booking block minimal) ----------------- */
function CalendarEvent({ event }) {
  const router = useRouter();
  const [showNotes, setShowNotes] = useState(false);

  const employeeInitials = Array.isArray(event.employees)
    ? event.employees
        .map((emp) => {
          const employeeName = typeof emp === "string" ? emp : emp?.name || "";
          return employeeName
            .split(" ")
            .map((part) => part[0]?.toUpperCase())
            .join("");
        })
        .filter(Boolean)
    : [];

  const employeeInitialLines = employeeInitials.reduce((rows, initials, index) => {
    const rowIndex = Math.floor(index / 2);
    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex].push(initials);
    return rows;
  }, []);

  const isMaintenance = event.status === "Maintenance";

  //  robust per-day call time detection + display
  const hasPerDayCallTimes =
    event.callTimesByDate && Object.keys(event.callTimesByDate).length > 0;

  const bookingStatusLC = String(event.status || "").toLowerCase();
  const hideDayNotes = ["cancelled", "canceled", "postponed", "dnh"].includes(bookingStatusLC);

  const callTimeForThisEvent = useMemo(() => callTimeForEventDay(event), [event]);

  //  NEW: crew needed for this job
  const crewNeeded = useMemo(() => getCrewNeeded(event), [event]);

  //  NEW: "Crewed" handling (no crew-needed counts once crewed)
  const isCrewed = !isMaintenance && !!event.isCrewed;

  return (
    <div
      title={event.noteToShow || ""}
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: "0.85rem",
        lineHeight: 1.1,
        color: "#0b0b0b",
        fontWeight: 600,
        fontFamily: "Inter, system-ui, Arial, sans-serif",
        textAlign: "left",
        alignItems: "flex-start",
        padding: "5px 6px",
        gap: 1,
        borderRadius: 6,
        whiteSpace: "normal",
        wordBreak: "break-word",
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      {event.status === "Bank Holiday" ? (
        <>
          <span style={{ fontWeight: 900 }}>BANK HOLIDAY</span>
          <span style={{ opacity: 0.9 }}>{event.bankHolidayName || event.title}</span>
        </>
      ) : event.status === "Holiday" ? (
        <>
          <span>{event.employee}</span>
          <span style={{ fontStyle: "italic", opacity: 0.75 }}>On Holiday</span>
        </>
      ) : (
        <>
          {/* Top row: initials + status + job number */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              marginBottom: 2,
              gap: 6,
            }}
          >
            {employeeInitials.length > 0 && (
              <span
                style={{
                  backgroundColor: "white",
                  padding: "2px 4px",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  border: "1px solid #0b0b0b",
                  display: "grid",
                  gap: 1,
                  lineHeight: 1.05,
                }}
              >
                {employeeInitialLines.map((line, index) => (
                  <span key={`${line.join("-")}-${index}`}>{line.join(", ")}</span>
                ))}
              </span>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "#111" }}>
                  {event.status}
                </span>

                {/*  UPDATED: if crewed, show "CREWED" only (no crew needed counts) */}
                {isCrewed && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "0.65rem",
                      fontWeight: 800,
                      color: "#111",
                      marginTop: -2,
                    }}
                  >
                    <Check size={12} strokeWidth={3} />CREWED
                  </span>
                )}

                {/*  UPDATED: only show crew needed badge when NOT crewed */}
                {!isMaintenance && !isCrewed && crewNeeded !== null && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 800,
                      color: "#111",
                      marginTop: -2,
                    }}
                    title="Crew needed for this job"
                  >
                    {`Crew Needed: ${crewNeeded}`}
                  </span>
                )}
              </div>

              <span
                style={{
                  backgroundColor:
                    event.shootType === "Night"
                      ? "purple"
                      : event.shootType === "Day"
                      ? "white"
                      : "#ffffffff",
                  color: event.shootType === "Night" ? "#fff" : "#000",
                  padding: "2px 4px",
                  borderRadius: 6,
                  fontSize: "0.9rem",
                  fontWeight: 800,
                  border: "1px solid #0b0b0b",
                }}
              >
                {event.jobNumber}
              </span>
            </div>
          </div>

          {!isMaintenance && <span>{event.client}</span>}
          {isMaintenance && (
            <span style={{ fontSize: "0.8rem", fontWeight: 900 }}>
              {event.maintenanceTypeLabel || "MAINTENANCE"}
            </span>
          )}

          {/*  Call Time line (shows correctly for single day + recce day + multi-day) */}
          {!isMaintenance && (
            <span style={{ fontSize: "0.78rem", fontWeight: 900 }}>
              {callTimeForThisEvent ? `CT ${callTimeForThisEvent}` : ""}
            </span>
          )}

          {/* Vehicles */}
          {Array.isArray(event.vehicles) &&
            event.vehicles.length > 0 &&
            event.vehicles.map((v, i) => {
              const vmap = event.vehicleStatus || {};

              const rawName =
                v?.name || [v?.manufacturer, v?.model].filter(Boolean).join(" ") || String(v || "");
              const name = String(rawName).trim();
              const plate = v?.registration ? String(v.registration).toUpperCase().trim() : "";

              const tax = String(v.taxStatus || "").toLowerCase();
              const ins = String(v.insuranceStatus || "").toLowerCase();

              const isSornOrUntaxed = ["sorn", "untaxed", "no tax"].includes(tax);
              const isUninsured = ["not insured", "uninsured", "no insurance"].includes(ins);

              const bookingStatus = String(event.status || "").trim().toLowerCase();
              const isConfirmed = bookingStatus === "confirmed";

              const isCancelled = [
                "cancelled",
                "canceled",
                "complete",
                "completed",
                "cancel",
                "postponed",
                "dnh",
              ].includes(bookingStatus);

              if (isCancelled) {
                return (
                  <span key={i}>
                    {name}
                    {plate ? ` – ${plate}` : ""}
                  </span>
                );
              }

              const today0 = new Date();
              today0.setHours(0, 0, 0, 0);

              const jobLastDay = new Date(event.end);
              jobLastDay.setDate(jobLastDay.getDate() - 1);
              jobLastDay.setHours(0, 0, 0, 0);

              const isFutureJob = jobLastDay > today0;

              if (isConfirmed && isFutureJob && (isSornOrUntaxed || isUninsured)) {
                return (
                  <span
                    key={i}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0px 4px",
                      borderRadius: 4,
                      background: "#e53935",
                      color: "#fff",
                      fontWeight: 700,
                      border: "1px solid #0b0b0b",
                      marginTop: 1,
                    }}
                    title="Vehicle non-compliant (SORN / Not Insured) — future confirmed job"
                  >
                    {name}
                    {plate ? ` – ${plate}` : ""}
                  </span>
                );
              }

              const idKey = v?.id ? String(v.id).trim() : "";
              const regKey = v?.registration ? String(v.registration).trim() : "";
              const nameKey = name;

              let itemStatusRaw =
                (idKey && vmap[idKey]) ||
                (regKey && vmap[regKey]) ||
                (nameKey && vmap[nameKey]) ||
                "";

              const norm = (s) => String(s || "").trim();
              const itemStatus = norm(itemStatusRaw) || bookingStatus;
              const different = itemStatus && itemStatus !== bookingStatus;

              if (different) {
                const shoot = String(event.shootType || "").toLowerCase();
                const bookingIsConfirmed = String(event.status || "").trim().toLowerCase() === "confirmed";
                const vehicleIsConfirmed = String(itemStatus || "").trim().toLowerCase() === "confirmed";

                const style =
                  shoot === "night" && bookingIsConfirmed && vehicleIsConfirmed
                    ? NIGHT_SHOOT_STYLE
                    : getStatusStyle(itemStatus);

                return (
                  <span
                    key={i}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0px 0px",
                      borderRadius: 2,
                      backgroundColor: style.bg,
                      color: style.text,
                      border: `0px solid ${style.border}`,
                      marginTop: 1,
                    }}
                    title={`Vehicle status: ${itemStatus}`}
                  >
                    {name}
                    {plate ? ` – ${plate}` : ""}
                  </span>
                );
              }

              return (
                <span key={i}>
                  {name}
                  {plate ? ` – ${plate}` : ""}
                </span>
              );
            })}

          <span>{event.equipment}</span>
          <span>{event.location}</span>

          {/* Notes */}
          {(event.notes ||
            (!isMaintenance &&
              !hideDayNotes &&
              event.notesByDate &&
              Object.keys(event.notesByDate).length > 0)) && (
            <div style={{ width: "100%", marginTop: 2 }}>
              {!isMaintenance &&
                !hideDayNotes &&
                event.notesByDate &&
                Object.keys(event.notesByDate).length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                    {Object.keys(event.notesByDate)
                      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                      .sort((a, b) => new Date(a) - new Date(b))
                      .reduce((cols, date, i) => {
                        const col = Math.floor(i / 3);
                        (cols[col] ||= []).push(date);
                        return cols;
                      }, [])
                      .map((chunk, colIndex) => (
                        <div key={colIndex} style={{ display: "flex", flexDirection: "column" }}>
                          {chunk.map((date) => {
                            const note = event.notesByDate[date] || "";
                            const other = event.notesByDate[`${date}-other`];
                            const tmins = event.notesByDate[`${date}-travelMins`];

                            const extra =
                              note === "Other" && other
                                ? ` — ${other}`
                                : note === "Travel Time" && tmins
                                ? ` — ${labelFromMins(tmins)}`
                                : "";

                            const callTimeForDay =
                              (event.callTimesByDate && event.callTimesByDate[date]) || "";

                            const formattedDate = new Date(date).toLocaleDateString("en-GB", {
                              weekday: "short",
                              day: "2-digit",
                            });

                            return (
                              <div
                                key={date}
                                style={{
                                  fontSize: "0.72rem",
                                  fontStyle: "italic",
                                  fontWeight: 400,
                                  opacity: 0.8,
                                  lineHeight: 1.2,
                                }}
                              >
                                {formattedDate}: {note || "—"}
                                {extra}
                                {callTimeForDay ? ` — CT ${callTimeForDay}` : ""}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                  </div>
                )}

              {event.notes && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowNotes((s) => !s);
                    }}
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 8px",
                      border: "1px solid #111",
                      background: "transparent",
                      cursor: "pointer",
                      borderRadius: 6,
                    }}
                  >
                    {showNotes ? "Hide Notes" : "Show Notes"}
                  </button>

                  {showNotes && (
                    <div
                      style={{
                        opacity: 0.9,
                        fontWeight: 500,
                        fontSize: "0.75rem",
                        lineHeight: 1.25,
                        marginTop: 4,
                      }}
                    >
                      {event.notes}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Badge row (unchanged logic, but CT now truly correct) */}
          {(() => {
            const status = (event.status || "").toLowerCase();
            const hideForStatus = ["cancelled", "dnh", "lost", "postponed", "deleted"].includes(status);
            if (isMaintenance || hideForStatus) return null;

            return (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  justifyContent: "flex-start",
                  marginTop: 6,
                  width: "100%",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 400,
                    padding: "2px 6px",
                    borderRadius: 6,
                    backgroundColor: event.hasHS ? "#4caf50" : "#f44336",
                    color: "#fff",
                    border: "1px solid rgba(0,0,0,0.8)",
                  }}
                >
                  HS {event.hasHS ? "✓" : "✗"}
                </span>

                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 400,
                    padding: "2px 6px",
                    borderRadius: 6,
                    backgroundColor: event.hasRiskAssessment ? "#4caf50" : "#f44336",
                    color: "#fff",
                    border: "1px solid rgba(0,0,0,0.8)",
                  }}
                >
                  RA {event.hasRiskAssessment ? "✓" : "✗"}
                </span>

                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 400,
                    padding: "2px 6px",
                    borderRadius: 6,
                    backgroundColor: event.hasHotel ? "#4caf50" : "#f44336",
                    color: "#fff",
                    border: "1px solid rgba(0,0,0,0.8)",
                  }}
                >
                  H {event.hasHotel ? "✓" : "✗"}
                </span>

                <span
                  title={event.hasRiggingAddress ? event.riggingAddress || "" : ""}
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 400,
                    padding: "2px 6px",
                    borderRadius: 6,
                    backgroundColor: event.hasRiggingAddress ? "#4caf50" : "#f44336",
                    color: "#fff",
                    border: "1px solid rgba(0,0,0,0.8)",
                  }}
                >
                  UB {event.hasRiggingAddress ? "✓" : "✗"}
                </span>

                {(() => {
                  //  CT check: exact day match OR callTime OR any per-day
                  const hasAnyCallTime =
                    !!callTimeForEventDay(event) ||
                    !!event.callTime ||
                    (hasPerDayCallTimes && Object.values(event.callTimesByDate || {}).some(Boolean));

                  return (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 400,
                        padding: "2px 6px",
                        borderRadius: 6,
                        backgroundColor: hasAnyCallTime ? "#4caf50" : "#f44336",
                        color: "#fff",
                        border: "1px solid rgba(0,0,0,0.8)",
                      }}
                      title={
                        hasAnyCallTime
                          ? callTimeForThisEvent
                            ? `Call Time set: ${callTimeForThisEvent}`
                            : event.callTime
                            ? `Call Time set: ${event.callTime}`
                            : "Call Time set (per day)"
                          : "No call time set"
                      }
                    >
                      CT {hasAnyCallTime ? "✓" : "✗"}
                    </span>
                  );
                })()}
              </div>
            );
          })()}

          {/* RECCE LINK ONLY (jobs) */}
          {!isMaintenance && event.hasRecce && event.recceId && (
            <div style={{ width: "100%", marginTop: 6 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/recce-form/${event.recceId}`);
                }}
                title="Open full recce form"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: "0.6rem",
                  fontWeight: 800,
                  border: "1.5px solid #0b0b0b",
                  background: "#111827",
                  color: "#fff",
                }}
              >
                View recce form ↗
                {event.recceStatus && (
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 900,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "#fff",
                      color: "#111",
                      border: "1px solid rgba(0,0,0,0.8)",
                    }}
                  >
                    {(event.recceStatus || "Submitted").toUpperCase()}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Risk box */}
          {event.isRisky && Array.isArray(event.riskReasons) && event.riskReasons.length > 0 && (
            <div style={{ width: "100%", marginTop: 6 }}>
              <div
                style={{
                  backgroundColor: "#e53935",
                  color: "#fff",
                  border: "1.5px solid #000",
                  borderRadius: 6,
                  padding: "4px 6px",
                  fontSize: "0.74rem",
                  fontWeight: 900,
                  letterSpacing: 0.2,
                }}
              >
                VEHICLE COMPLIANCE ISSUE
              </div>
              <div
                style={{
                  marginTop: 4,
                  background: "#ffe6e6",
                  border: "1px dashed #e53935",
                  borderRadius: 6,
                  padding: "4px 6px",
                  fontSize: "0.74rem",
                  lineHeight: 1.25,
                  color: "#000",
                  fontWeight: 700,
                }}
              >
                {event.riskReasons.map((r, i) => (
                  <div key={i} style={{ marginTop: i ? 3 : 0 }}>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function maintenanceEventPropGetter(event) {
  const kind = event?.kind || "MAINTENANCE";

  let bg = "#c4d6e4";
  let border = "#95b3ca";
  let text = "#172a3d";

  if (kind === "MOT") {
    bg = "#dfc4a0";
    border = "#bb8d52";
    text = "#56361d";
    if (event?.booked) {
      bg = "#c3dccb";
      border = "#7fa590";
      text = "#173a27";
    }
  } else if (kind === "MOT_BOOKING") {
    bg = "#c3dccb";
    border = "#7fa590";
    text = "#173a27";
    if (String(event?.bookingStatus || "").includes("After Expiry")) {
      bg = "#e4c0bd";
      border = "#bf847f";
      text = "#631f1a";
    }
  } else if (kind === "SERVICE" || kind === "SERVICE_BOOKING") {
    bg = "#c3dccb";
    border = "#7fa590";
    text = "#173a27";
  }

  const isBookingBlock = kind === "MOT_BOOKING" || kind === "SERVICE_BOOKING";
  const tone = event?.dueDate && !isBookingBlock ? dueTone(event.dueDate) : "soft";
  const suppressEscalation = (kind === "MOT" || kind === "SERVICE") && event?.booked;

  if (!suppressEscalation) {
    if (tone === "overdue") {
      bg = "#e4c0bd";
      border = "#bf847f";
      text = "#631f1a";
    } else if (tone === "soon") {
      bg = "#e1c79c";
      border = "#c19458";
      text = "#5a3918";
    }
  }

  return {
    style: {
      borderRadius: 10,
      border: `1px solid ${border}`,
      background: bg,
      color: text,
      padding: 0,
      boxShadow: "0 6px 14px rgba(15,23,42,0.06)",
      overflow: "hidden",
      cursor: "pointer",
    },
  };
}

function MaintenanceCalendarEvent({ event }) {
  const kind = event?.kind || "MAINTENANCE";
  const displayType = getMaintenanceDisplayType(event);
  const vehicleText = Array.isArray(event?.vehicles)
    ? event.vehicles
        .map((vehicle) => {
          if (typeof vehicle === "string") return vehicle.trim();
          if (!vehicle || typeof vehicle !== "object") return "";
          const name = String(vehicle.name || [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ") || "").trim();
          const registration = String(vehicle.registration || vehicle.reg || "").trim().toUpperCase();
          if (name && registration) return `${name} (${registration})`;
          return name || registration || "";
        })
        .filter(Boolean)
    : [];

  const equipmentText = Array.isArray(event?.equipment)
    ? event.equipment
        .map((item) => (typeof item === "string" ? item : item?.name || item?.label || ""))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ")
    : "";
  const locationText = String(event?.location || "").trim();

  const label =
    kind === "MOT"
      ? event?.booked
        ? "MOT due • Booked"
        : "MOT due"
      : kind === "SERVICE"
      ? event?.booked
        ? "Service due • Booked"
        : "Service due"
      : kind === "MOT_BOOKING"
      ? "MOT booking"
      : kind === "SERVICE_BOOKING"
      ? "Service booking"
      : `${displayType} booking`;

  const dd = event?.dueDate ? new Date(event.dueDate) : null;
  const isBookingBlock =
    kind === "MOT_BOOKING" || kind === "SERVICE_BOOKING" || kind === "MAINTENANCE_BOOKING";
  const showTone = !isBookingBlock && !((kind === "MOT" || kind === "SERVICE") && event?.booked);
  const tone = showTone && dd ? dueTone(dd) : "soft";
  const toneText = tone === "overdue" ? "Overdue" : tone === "soon" ? "Due soon" : tone === "ok" ? "OK" : "";
  const subline = isBookingBlock
    ? event?.bookingStatus || "Booked"
    : event?.booked && (kind === "MOT" || kind === "SERVICE")
    ? event?.bookingStatus || "Booked"
    : toneText;

  return (
    <div
      title={event?.title || ""}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontSize: 12.5,
        lineHeight: 1.3,
        fontWeight: 900,
        padding: 8,
        letterSpacing: "0.01em",
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        minWidth: 0,
      }}
    >
      <span style={{ color: "#1d4ed8", fontWeight: 900, fontSize: 12, whiteSpace: "normal" }}>{label}</span>
      <span style={{ color: "#0f172a", whiteSpace: "normal" }}>{event?.title || "Maintenance"}</span>
      {vehicleText ? (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{vehicleText}</span>
      ) : null}
      {equipmentText ? (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{equipmentText}</span>
      ) : null}
      {locationText ? (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#475569", whiteSpace: "normal" }}>{locationText}</span>
      ) : null}
      {subline ? (
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#64748b", whiteSpace: "normal" }}>{subline}</span>
      ) : null}
    </div>
  );
}

/* ------------------------------- Page component ----------------------------- */
export default function DashboardPage({ bookingSaved }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [deletedBookings, setDeletedBookings] = useState([]);
  const [calendarView, setCalendarView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidays, setHolidays] = useState([]);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(null);
  const [notes, setNotes] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [selectedDeletedId, setSelectedDeletedId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingHolidayId, setEditingHolidayId] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState("");

  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState(null);
  const [showCreateMaintenancePicker, setShowCreateMaintenancePicker] = useState(false);
  const [createMaintenanceVehicleId, setCreateMaintenanceVehicleId] = useState("");
  const [createMaintenanceType, setCreateMaintenanceType] = useState("WORK");
  const [createMaintenanceEquipment, setCreateMaintenanceEquipment] = useState("");

  //  Holiday modal
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);

  //  Create Note modal
  const [createNoteOpen, setCreateNoteOpen] = useState(false);

  const [maintenanceView, setMaintenanceView] = useState("week");
  const [maintenanceDate, setMaintenanceDate] = useState(new Date());
  const [showDeletedInView, setShowDeletedInView] = useState(true);
  const [showInactiveInView, setShowInactiveInView] = useState(true);
  const shiftByDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  //  NEW: UK Bank Holidays (GOV.UK)
  const [bankHolidays, setBankHolidays] = useState([]);

  // Gate Calendar rendering to client only
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [userEmail, setUserEmail] = useState(null);
  const [userUid, setUserUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email?.toLowerCase() || null);
      setUserUid(u?.uid || null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isRestricted = userEmail ? RESTRICTED_EMAILS.has(userEmail) : false;
  const canSeeDeletedOnCalendar = userEmail
    ? DELETED_ON_CALENDAR_EMAILS.has(userEmail)
    : false;

  useEffect(() => {
    if (!authReady || !userEmail) return;
    try {
      const raw = localStorage.getItem(DASHBOARD_HIDE_PREFS_KEY);
      if (!raw) return;
      const all = JSON.parse(raw);
      const prefs = all?.[userEmail];
      if (!prefs || typeof prefs !== "object") return;

      if (typeof prefs.showInactiveInView === "boolean") {
        setShowInactiveInView(prefs.showInactiveInView);
      }
      if (typeof prefs.showDeletedInView === "boolean") {
        setShowDeletedInView(prefs.showDeletedInView);
      }
    } catch {
      // ignore malformed localStorage
    }
  }, [authReady, userEmail]);

  useEffect(() => {
    if (!authReady || !userEmail) return;
    try {
      const raw = localStorage.getItem(DASHBOARD_HIDE_PREFS_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[userEmail] = {
        showInactiveInView,
        showDeletedInView,
      };
      localStorage.setItem(DASHBOARD_HIDE_PREFS_KEY, JSON.stringify(all));
    } catch {
      // ignore storage errors
    }
  }, [authReady, userEmail, showInactiveInView, showDeletedInView]);

  const goToCreateBooking = useCallback(() => {
    if (isRestricted) return;
    router.push("/create-booking");
  }, [isRestricted, router]);

  const goToEditBooking = useCallback(
    (id) => {
      if (isRestricted) return;
      router.push(`/edit-booking/${id}`);
    },
    [isRestricted, router]
  );

  const goToCreateMaintenance = useCallback(
    (e) => {
      e?.preventDefault?.();
      if (isRestricted) return;
      setCreateMaintenanceVehicleId("");
      setCreateMaintenanceType("WORK");
      setShowCreateMaintenancePicker(true);
    },
    [isRestricted]
  );

  // NEW: hold latest recce per booking
  const [reccesByBooking, setReccesByBooking] = useState({});

  useEffect(() => {
    const unsubRecces = onSnapshot(collection(db, "recces"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const r = { id: d.id, ...d.data() };
        const k = r.bookingId;
        if (!k) return;

        const cur = map[k];
        const curTs = cur?.createdAt?.seconds || 0;
        const rTs = r?.createdAt?.seconds || 0;

        if (!cur || rTs >= curTs) {
          const a = r.answers || {};
          const notes = a.notes || a.additionalNotes || a.accessNotes || a.risks || "";

          map[k] = {
            id: r.id,
            status: r.status || "submitted",
            notes: String(notes || "").trim(),
            answers: r.answers || {},
            createdAt: r.createdAt || null,
          };
        }
      });
      setReccesByBooking(map);
    });

    return () => unsubRecces();
  }, []);

  //  NEW: fetch UK bank holidays from GOV.UK
  useEffect(() => {
    const REGION = "england-and-wales"; // change to "scotland" / "northern-ireland" if needed

    const run = async () => {
      try {
        const res = await fetch("https://www.gov.uk/bank-holidays.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Bank holiday fetch failed: ${res.status}`);

        const data = await res.json();
        const items = data?.[REGION]?.events || [];

        const events = items
          .map((bh) => {
            const d0 = toJsDate(bh.date); // YYYY-MM-DD safe
            if (!d0) return null;

            const day = startOfLocalDay(d0);

            return {
              id: `bankholiday__${REGION}__${bh.date}`,
              title: `Bank Holiday — ${bh.title}`,
              bankHolidayName: bh.title,
              bankHolidayNotes: bh.notes || "",
              start: day,
              end: addDays(day, 1),
              allDay: true,
              status: "Bank Holiday",
              __collection: "bankHolidays",
            };
          })
          .filter(Boolean);

        setBankHolidays(events);
      } catch (e) {
        console.warn("[bank-holidays] failed:", e);
        setBankHolidays([]);
      }
    };

    run();
  }, []);

  // normaliser/risk
  const normalizeVehicles = useCallback(
    (list) => {
      if (!Array.isArray(list)) return [];
      return list.map((v) => {
        if (v && typeof v === "object" && (v.name || v.registration)) return v;
        const needle = String(v ?? "").trim();
        const match =
          vehiclesData.find((x) => x.id === needle) ||
          vehiclesData.find((x) => String(x.registration ?? "").trim() === needle) ||
          vehiclesData.find((x) => String(x.name ?? "").trim() === needle);
        return match || { name: needle };
      });
    },
    [vehiclesData]
  );

  const getVehicleRisk = (vehicles) => {
    const reasons = [];
    const list = Array.isArray(vehicles) ? vehicles : [];
    list.forEach((v) => {
      if (!v || typeof v !== "object") return;
      const name =
        v.name || [v.manufacturer, v.model].filter(Boolean).join(" ") || "Vehicle";
      const plate = v.registration ? ` (${String(v.registration).toUpperCase()})` : "";
      const tax = String(v.taxStatus ?? "").trim().toLowerCase();
      const ins = String(v.insuranceStatus ?? "").trim().toLowerCase();
      if (tax === "sorn" || tax === "untaxed" || tax === "no tax")
        reasons.push(`UN-TAXED / SORN: ${name}${plate}`);
      if (ins === "not insured" || ins === "uninsured" || ins === "no insurance")
        reasons.push(`NO INSURANCE: ${name}${plate}`);
    });
    return { risky: reasons.length > 0, reasons };
  };

  const isFutureJobEvent = (event) => {
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);

    const endRaw = event?.end || event?.start;
    const end = endRaw instanceof Date ? endRaw : new Date(endRaw);
    if (Number.isNaN(end.getTime())) return false;

    // end is exclusive (+1 day). Convert to last real day.
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() - 1);
    lastDay.setHours(0, 0, 0, 0);

    return lastDay > today0;
  };

  // listeners
  useEffect(() => {
    if (!authReady) return;

    const unsubBookings = onSnapshot(collection(db, "bookings"), (snap) => {
      setBookings(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    //  FIX: holidays show properly (Timestamp/Date/string safe)
    const unsubHolidays = onSnapshot(collection(db, "holidays"), (snap) => {
      const holidayEvents = snap.docs
        .map((docSnap) => {
          const data = docSnap.data();

          const s0 = toJsDate(data.startDate);
          const e0 = toJsDate(data.endDate || data.startDate);

          if (!s0) return null;

          const startBase = startOfLocalDay(s0);
          const endBase = e0 ? startOfLocalDay(e0) : startBase;
          const safeEnd = endBase >= startBase ? endBase : startBase;

          const employee = (data.employee || data.employeeCode || "Unknown").toString();

          return {
            id: docSnap.id,
            title: `${employee} - Holiday`,
            start: startBase,
            end: startOfLocalDay(addDays(safeEnd, 1)), // exclusive end
            allDay: true,
            status: "Holiday",
            employee,
            // keep original data if you need it later
            ...data,
          };
        })
        .filter(Boolean);

      setHolidays(holidayEvents);
    });

    const unsubNotes = onSnapshot(collection(db, "notes"), (snap) => {
      const noteEvents = mapNoteDocsToCalendarEvents(snap.docs);
      setNotes(noteEvents);
    });

    const unsubMaintenance = onSnapshot(
      collection(db, "maintenanceBookings"),
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMaintenanceBookings(raw);
      },
      (error) => {
        console.error("[maintenance] onSnapshot error:", error);
      }
    );
    const unsubMaintenanceJobs = onSnapshot(
      collection(db, "maintenanceJobs"),
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMaintenanceJobs(raw);
      },
      (error) => {
        console.error("[maintenanceJobs] onSnapshot error:", error);
      }
    );

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehiclesData(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    return () => {
      unsubBookings();
      unsubHolidays();
      unsubNotes();
      unsubVehicles();
      unsubMaintenance();
      unsubMaintenanceJobs();
    };
  }, [authReady]);

  useEffect(() => {
    if (!authReady || !canSeeDeletedOnCalendar) {
      setDeletedBookings([]);
      return;
    }

    const unsubDeleted = onSnapshot(collection(db, "deletedBookings"), (snap) => {
      const list = snap.docs.map((d) => {
        const raw = d.data() || {};
        const payload = raw.data || raw.payload || raw.booking || {};
        return {
          id: raw.originalId || d.id,
          __collection: "deletedBookings",
          __deletedDocId: d.id,
          ...payload,
          status: "Deleted",
        };
      });
      setDeletedBookings(list);
    });

    return () => unsubDeleted();
  }, [authReady, canSeeDeletedOnCalendar]);

  const fetchBookings = async () => {
    const snapshot = await getDocs(collection(db, "bookings"));
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    setBookings(data);
  };

  const fetchHolidays = async () => {
    const snapshot = await getDocs(collection(db, "holidays"));
    const holidayEvents = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();

        const s0 = toJsDate(data.startDate);
        const e0 = toJsDate(data.endDate || data.startDate);
        if (!s0) return null;

        const startBase = startOfLocalDay(s0);
        const endBase = e0 ? startOfLocalDay(e0) : startBase;
        const safeEnd = endBase >= startBase ? endBase : startBase;

        const employee = (data.employee || data.employeeCode || "Unknown").toString();

        return {
          id: docSnap.id,
          title: `${employee} - Holiday`,
          start: startBase,
          end: startOfLocalDay(addDays(safeEnd, 1)),
          allDay: true,
          status: "Holiday",
          employee,
          ...data,
        };
      })
      .filter(Boolean);

    setHolidays(holidayEvents);
  };

  const fetchNotes = async () => {
    const snapshot = await getDocs(collection(db, "notes"));
    const noteEvents = mapNoteDocsToCalendarEvents(snapshot.docs);
    setNotes(noteEvents);
  };

  useEffect(() => {
    if (!authReady) return;
    getDocs(collection(db, "equipment"))
      .then((snap) => {
        setEquipmentOptions(
          snap.docs
            .map((docSnap) => {
              const data = docSnap.data() || {};
              return String(data.name || data.label || docSnap.id || "").trim();
            })
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))
        );
      })
      .catch((error) => {
        console.error("[equipment] load error:", error);
        setEquipmentOptions([]);
      });
  }, [authReady]);

  //  minimal saveBooking so the existing modal doesn't crash if used
  const saveBooking = async (payload) => {
    try {
      await addDoc(collection(db, "bookings"), {
        ...payload,
        createdByUid: payload?.createdByUid || userUid || "",
        lastEditedByUid: payload?.lastEditedByUid || userUid || "",
        createdAt: new Date(),
      });
      setShowModal(false);
      fetchBookings();
    } catch (err) {
      console.error("Error saving booking:", err);
      alert("Failed to save booking.");
    }
  };

  // --- note helpers (create / update / delete) ---
  const handleSaveNote = async (e) => {
    e.preventDefault();

    if (!noteDate || !noteText.trim()) {
      alert("Please fill in a date and some note text.");
      return;
    }

    const payload = {
      text: noteText.trim(),
      date: noteDate,
      employee: "",
      updatedAt: new Date(),
    };

    try {
      if (editingNoteId) {
        await updateDoc(doc(db, "notes", editingNoteId), payload);
      } else {
        await addDoc(collection(db, "notes"), {
          ...payload,
          createdAt: new Date(),
        });
      }

      setNoteModalOpen(false);
      setEditingNoteId(null);
      setNoteText("");
      setNoteDate(null);
    } catch (err) {
      console.error("Error saving note:", err);
      alert("Failed to save note. Please try again.");
    }
  };

  const handleDeleteNote = async () => {
    if (!editingNoteId) return;
    if (!confirm("Delete this note?")) return;

    try {
      await deleteDoc(doc(db, "notes", editingNoteId));
      setNoteModalOpen(false);
      setEditingNoteId(null);
      setNoteText("");
      setNoteDate(null);
    } catch (err) {
      console.error("Error deleting note:", err);
      alert("Failed to delete note. Please try again.");
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const todaysJobs = bookings.filter((b) => {
    if (b.bookingDates && Array.isArray(b.bookingDates)) {
      return b.bookingDates.includes(today);
    }
    const singleDate = b.date?.split("T")[0];
    const start = b.startDate?.split("T")[0];
    const end = b.endDate?.split("T")[0];
    return singleDate === today || (start && end && today >= start && today <= end);
  });

  const maintenanceJobEvents = useMemo(() => {
    return (maintenanceJobs || [])
      .filter((j) =>
        ACTIVE_MAINTENANCE_JOB_STATUSES.has(String(j.status || "").trim().toLowerCase())
      )
      .map((j) => {
        const when = parseLocalDate(j.plannedDate || j.dueDate);
        if (!when) return null;
        const statusLabel = String(j.status || "planned")
          .replaceAll("_", " ")
          .replace(/\b\w/g, (m) => m.toUpperCase());
        return {
          ...j,
          id: `maintenanceJob__${j.id}`,
          __parentId: j.id,
          __collection: "maintenanceJobs",
          title: j.assetLabel || j.title || "Maintenance Job",
          kind: "MAINTENANCE",
          start: startOfLocalDay(when),
          end: startOfLocalDay(addDays(when, 1)),
          allDay: true,
          status: "Maintenance",
          maintenanceType: j.type || "maintenance",
          maintenanceTypeLabel: `Job Card (${statusLabel})`,
        };
      })
      .filter(Boolean);
  }, [maintenanceJobs]);

  const maintenanceBookedMetaByVehicle = useMemo(() => {
    const map = {};
    (maintenanceBookings || []).forEach((b) => {
      if (isInactiveMaintenanceBooking(b.status)) return;
      const vehicleId = String(b.vehicleId || "").trim();
      if (!vehicleId) return;

      const type = String(b.type || "").trim().toUpperCase() === "SERVICE" ? "service" : "mot";
      const appt = parseLocalDate(b.appointmentDate || b.startDate || b.date);
      if (!appt) return;

      if (!map[vehicleId]) {
        map[vehicleId] = {
          mot: { has: false, earliestAppt: null },
          service: { has: false, earliestAppt: null },
        };
      }
      map[vehicleId][type].has = true;
      const cur = map[vehicleId][type].earliestAppt;
      if (!cur || appt.getTime() < cur.getTime()) map[vehicleId][type].earliestAppt = appt;
    });
    return map;
  }, [maintenanceBookings]);

  const motServiceDueEvents = useMemo(() => {
    if (!Array.isArray(vehiclesData) || !vehiclesData.length) return [];
    const out = [];

    vehiclesData.forEach((v) => {
      const vehicleId = String(v.id || "").trim();
      if (!vehicleId) return;

      const label = buildAssetLabel(v) || vehicleId;
      const motDue = getCanonicalDueDate(v, "mot");
      const serviceDue = getCanonicalDueDate(v, "service");
      const bookedMeta = maintenanceBookedMetaByVehicle[vehicleId] || null;

      if (motDue) {
        const motBooked = !!bookedMeta?.mot?.has;
        const motAppt = bookedMeta?.mot?.earliestAppt || null;
        const motAfterExpiry =
          motBooked && motAppt && motDue ? isApptAfterExpiry(motAppt, motDue) : false;
        out.push({
          id: `mot_due__${vehicleId}`,
          __collection: "vehicleDueDates",
          title: `${label} • MOT due${motBooked ? " (Booked)" : ""}`,
          start: startOfLocalDay(motDue),
          end: startOfLocalDay(addDays(motDue, 1)),
          allDay: true,
          status: "Maintenance",
          kind: "MOT",
          vehicleId,
          dueDate: motDue,
          booked: motBooked,
          bookingStatus: motAfterExpiry
            ? "Booked (After Expiry)"
            : motBooked
            ? "Booked"
            : "",
          maintenanceTypeLabel: "MOT",
        });
      }

      if (serviceDue) {
        const serviceBooked = !!bookedMeta?.service?.has;
        out.push({
          id: `service_due__${vehicleId}`,
          __collection: "vehicleDueDates",
          title: `${label} • Service due${serviceBooked ? " (Booked)" : ""}`,
          start: startOfLocalDay(serviceDue),
          end: startOfLocalDay(addDays(serviceDue, 1)),
          allDay: true,
          status: "Maintenance",
          kind: "SERVICE",
          vehicleId,
          dueDate: serviceDue,
          booked: serviceBooked,
          bookingStatus: serviceBooked ? "Booked" : "",
          maintenanceTypeLabel: "SERVICE",
        });
      }
    });

    return out;
  }, [vehiclesData, maintenanceBookedMetaByVehicle]);

  //  Build all calendar events from a single function (jobs + maintenance)
  const allEventsRaw = useMemo(() => {
    const sourceBookings = canSeeDeletedOnCalendar
      ? [...bookings, ...deletedBookings]
      : bookings;
    return [
      ...eventsByJobNumber(sourceBookings, maintenanceBookings),
      ...maintenanceJobEvents,
    ];
  }, [
    bookings,
    deletedBookings,
    maintenanceBookings,
    maintenanceJobEvents,
    canSeeDeletedOnCalendar,
  ]);

  const allEvents = useMemo(() => {
    return allEventsRaw.map((ev) => {
      const normalizedVehicles = normalizeVehicles(ev.vehicles);
      const risk = getVehicleRisk(normalizedVehicles);
      const recce = reccesByBooking[ev.id] || null;

      return {
        ...ev,
        vehicles: normalizedVehicles,
        isRisky: risk.risky,
        riskReasons: risk.reasons,
        hasRecce: !!recce,
        recceStatus: recce?.status || null,
        recceNotes: recce?.notes || "",
        recceAnswers: recce?.answers || null,
        recceId: recce?.id || null,
        recceCreatedAt: recce?.createdAt || null,

        //  ensure callTimesByDate always present (covers any event from older docs too)
        callTimesByDate: ensureCallTimesByDate(ev),
        callTime: normaliseCallTime(ev.callTime || ev.calltime || ev.call_time),
      };
    });
  }, [allEventsRaw, normalizeVehicles, reccesByBooking]);

  //  NEW: quick lookup for bank holiday day highlighting
  const bankHolidaySet = useMemo(() => {
    const set = new Set();
    (bankHolidays || []).forEach((e) => {
      const key = new Date(e.start).toISOString().slice(0, 10);
      set.add(key);
    });
    return set;
  }, [bankHolidays]);

  // Split by type for each calendar
  const workDiaryEvents = useMemo(() => {
    return allEvents.filter((e) => {
      if (e.status === "Holiday" || e.status === "Note" || e.status === "Maintenance") {
        return false;
      }

      const statusLC = String(e.status || "").toLowerCase();
      if (!showDeletedInView && statusLC === "deleted") return false;
      if (!showInactiveInView && HIDEABLE_STATUSES.has(statusLC)) return false;

      return true;
    });
  }, [allEvents, showDeletedInView, showInactiveInView]);
  const maintenanceEvents = useMemo(
    () => [...allEvents.filter((e) => e.status === "Maintenance"), ...motServiceDueEvents],
    [allEvents, motServiceDueEvents]
  );
  const formatSearchBookingDates = (booking) => {
    const formatDate = (value) => {
      const date = toJsDate(value);
      return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
    };

    if (Array.isArray(booking?.bookingDates) && booking.bookingDates.length) {
      const sortedDates = booking.bookingDates
        .map((value) => formatDate(value))
        .filter(Boolean);
      if (!sortedDates.length) return "No date";
      return sortedDates.length === 1 ? sortedDates[0] : `${sortedDates[0]} - ${sortedDates[sortedDates.length - 1]}`;
    }

    const start = formatDate(booking?.startDate || booking?.date);
    const end = formatDate(booking?.endDate);
    if (start && end && start !== end) return `${start} - ${end}`;
    return start || end || "No date";
  };
  const formatSearchBookingVehicles = (booking) => {
    const labels = normalizeVehicles(booking?.vehicles)
      .map((vehicle) => {
        if (!vehicle || typeof vehicle !== "object") return "";
        const name = String(vehicle.name || [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ") || "").trim();
        const registration = String(vehicle.registration || vehicle.reg || "").trim().toUpperCase();
        if (name && registration) return `${name} (${registration})`;
        return name || registration || "";
      })
      .filter(Boolean);
    return labels.length ? labels.join(", ") : "No vehicles";
  };
  const dashboardSearchResults = useMemo(() => {
    const query = dashboardSearch.trim().toLowerCase();
    if (!query) return [];

    return bookings
      .filter((booking) => {
        const haystack = [
          booking?.jobNumber,
          booking?.client,
          booking?.location,
          booking?.notes,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const getFirstTime = (booking) => {
          if (Array.isArray(booking?.bookingDates) && booking.bookingDates.length) {
            const times = booking.bookingDates
              .map((value) => toJsDate(value))
              .filter(Boolean)
              .map((date) => date.getTime())
              .sort((x, y) => x - y);
            if (times.length) return times[0];
          }

          const firstDate = toJsDate(booking?.startDate || booking?.date || booking?.endDate);
          return firstDate ? firstDate.getTime() : Number.MAX_SAFE_INTEGER;
        };

        return getFirstTime(a) - getFirstTime(b);
      })
      .slice(0, 8);
  }, [bookings, dashboardSearch]);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Dashboard</h1>
          </div>
          <div style={headerActions}>
            <div style={headerSearchWrap}>
              <input
                type="text"
                value={dashboardSearch}
                onChange={(e) => setDashboardSearch(e.target.value)}
                placeholder="Search jobs..."
                style={headerSearchInput}
              />
              {dashboardSearch.trim() && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    background: "#fff",
                    border: "1px solid #d6dee8",
                    borderRadius: 12,
                    boxShadow: "0 12px 28px rgba(15,23,42,0.12)",
                    overflow: "hidden",
                    zIndex: 30,
                  }}
                >
                  {dashboardSearchResults.length ? (
                    dashboardSearchResults.map((booking) => (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => {
                          setSelectedBookingId(booking.id);
                          setDashboardSearch("");
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          border: "none",
                          borderBottom: "1px solid #edf2f7",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 800, color: UI.text }}>
                          {booking.jobNumber || "No Job #"} - {booking.client || "No client"}
                        </div>
                        <div style={{ fontSize: 12.5, color: UI.muted }}>
                          {formatSearchBookingDates(booking)} • {formatSearchBookingVehicles(booking)} • {booking.location || "No location"}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: "10px 12px", fontSize: 12.5, color: UI.muted }}>
                      No jobs match that search.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              style={btn("ghost")}
              type="button"
              onClick={() => router.push("/booking-drafts")}
            >
              Drafts
            </button>
            <button
              style={btn("ghost")}
              type="button"
              onClick={() => router.push("/preplist-dashboard")}
            >
              Prep Dashboard
            </button>
            <button
              style={btn("ghost")}
              type="button"
              onClick={() => router.push("/stunt-prep")}
            >
              Stunt Prep
            </button>
            {canSeeDeletedOnCalendar && (
              <button
                style={showDeletedInView ? btn("ghost") : btn("danger")}
                onClick={() => setShowDeletedInView((v) => !v)}
                type="button"
              >
                {showDeletedInView ? "Hide Deleted" : "Show Deleted"}
              </button>
            )}
            <button
              style={showInactiveInView ? btn("ghost") : btn("danger")}
              onClick={() => setShowInactiveInView((v) => !v)}
              type="button"
            >
              {showInactiveInView ? "Hide Inactive" : "Show Inactive"}
            </button>
            {bookingSaved && <div style={successBanner}>Booking saved successfully.</div>}
          </div>
        </div>

        {/* Work Diary */}
        <section style={card}>
          <div style={sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={titleMd}>Work Diary</h2>
              <button
                style={btn("ghost")}
                onClick={() => setCurrentDate(new Date())}
                type="button"
              >
                Today
              </button>
            </div>
            <div style={sectionActions}>
              <button
                style={btn("ghost")}
                onClick={() => {
                  setCurrentDate((prev) => shiftByDays(prev, -7));
                  setMaintenanceDate((prev) => shiftByDays(prev, -7));
                }}
                type="button"
              >
                ← Previous Week
              </button>

              <button
                style={btn("ghost")}
                onClick={() => {
                  setCurrentDate((prev) => shiftByDays(prev, 7));
                  setMaintenanceDate((prev) => shiftByDays(prev, 7));
                }}
                type="button"
              >
                Next Week →
              </button>

              <button
                style={isRestricted ? btnDisabled(btn()) : btn()}
                onClick={goToCreateBooking}
                aria-disabled={isRestricted}
                title={isRestricted ? "Your account is not allowed to create bookings" : ""}
                type="button"
              >
                + Add Booking
              </button>

              <button
                style={isRestricted ? btnDisabled(btn()) : btn()}
                onClick={goToCreateMaintenance}
                aria-disabled={isRestricted}
                title={isRestricted ? "Your account is not allowed to create maintenance" : ""}
                type="button"
              >
                + Add Maintenance
              </button>

              <div style={{ ...chip, color: UI.brand }}>
                {currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
            </div>
          </div>

          {mounted && (
            <BigCalendar
              localizer={localizer}
              //  include bank holidays in Work Diary
              events={[...bankHolidays, ...workDiaryEvents]}
              view={calendarView}
              views={["week", "month"]}
              onView={(v) => setCalendarView(v)}
              date={currentDate}
              onNavigate={(d) => setCurrentDate(d)}
              onSelectSlot={({ start }) => {
                setEditingNoteId(null);
                const d = start instanceof Date ? start : new Date(start);
                setNoteDate(d.toISOString().split("T")[0]);
                setNoteText("");
                setNoteModalOpen(true);
              }}
              selectable
              startAccessor="start"
              endAccessor="end"
              popup
              allDayAccessor={() => true}
              allDaySlot
              dayLayoutAlgorithm="no-overlap"
              toolbar={false}
              nowIndicator={false}
              getNow={() => new Date(2000, 0, 1)}
              formats={{
                dayFormat: (date, culture, localizer) => localizer.format(date, "EEEE dd", culture),
              }}
              dayPropGetter={(date) => {
                const todayD = new Date();
                const isToday =
                  date.getDate() === todayD.getDate() &&
                  date.getMonth() === todayD.getMonth() &&
                  date.getFullYear() === todayD.getFullYear();

                const key = date.toISOString().slice(0, 10);
                const isBankHoliday = bankHolidaySet.has(key);

                return {
                  style: {
                    backgroundColor: isToday
                      ? "rgba(31,75,122,0.3)"
                      : isBankHoliday
                      ? "rgba(103,128,157,0.08)"
                      : undefined,
                    border: isToday
                      ? "1px solid rgba(31,75,122,0.56)"
                      : isBankHoliday
                      ? "1px dashed rgba(103,128,157,0.38)"
                      : undefined,
                  },
                };
              }}
              style={calendarFrame}
              onSelectEvent={(e) => {
                if (!e) return;

                //  bank holidays are display-only
                if (e.status === "Bank Holiday") return;

                if (e.status === "Holiday") {
                  setEditingHolidayId(e.id);
                  return;
                }

                if (e.status === "Note") {
                  setEditingNoteId(e.id);
                  const d = e.start instanceof Date ? e.start : new Date(e.start);
                  setNoteDate(d.toISOString().split("T")[0]);
                  setNoteText(e.title || "");
                  setNoteModalOpen(true);
                  return;
                }

                if (e.id) {
                  if (e.__collection === "deletedBookings") {
                    setSelectedDeletedId(e.__deletedDocId || e.id);
                    setSelectedBookingId(e.id);
                  } else {
                    setSelectedDeletedId(null);
                    setSelectedBookingId(e.id);
                  }
                }
              }}
              components={{ event: CalendarEvent }}
              eventPropGetter={(event) => {
                //  bank holiday styling
                if (event.status === "Bank Holiday") {
                  return {
                    style: {
                      backgroundColor: "#e9eef5",
                      color: "#314257",
                      fontWeight: 800,
                      padding: 0,
                      borderRadius: 8,
                      border: "1px dashed #9eb0c6",
                      boxShadow: "0 4px 10px rgba(15,23,42,0.05)",
                      pointerEvents: "none", //  doesn't steal clicks from jobs
                    },
                  };
                }

                const status = normalizeStatusLabel(event.status || "Confirmed");
                const tone = getStatusStyle(status);
                let bg = tone.bg;
                let text = tone.text;
                let border = tone.border;

                let risky = !!event.isRisky;
                if (!("isRisky" in event) && Array.isArray(event.vehicles)) {
                  risky = getVehicleRisk(event.vehicles).risky;
                }

                if (risky) {
                }

                const shoot = String(event.shootType || "").toLowerCase();
                const bookingStatuses = new Set([
                  "confirmed",
                  "first pencil",
                  "second pencil",
                  "complete",
                  "action required",
                  "dnh",
                ]);

                if (!risky && bookingStatuses.has((status || "").toLowerCase()) && shoot === "night") {
                  bg = NIGHT_SHOOT_STYLE.bg;
                  text = NIGHT_SHOOT_STYLE.text;
                  border = NIGHT_SHOOT_STYLE.border;
                  return {
                    style: {
                      backgroundColor: bg,
                      color: text,
                      fontWeight: 700,
                      padding: 0,
                      borderRadius: 8,
                      border: `1px solid ${border}`,
                      boxShadow: "0 6px 14px rgba(15,23,42,0.08)",
                    },
                  };
                }

                return {
                  style: {
                    backgroundColor: bg,
                    color: text,
                    fontWeight: 700,
                    padding: 0,
                    borderRadius: 8,
                    border: `1px solid ${border}`,
                    boxShadow: "0 6px 14px rgba(15,23,42,0.08)",
                  },
                };
              }}
            />
          )}
        </section>

        {/* Maintenance Calendar */}
        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Maintenance Calendar</h2>
              <div style={hint}>MOT, service, maintenance bookings and active workshop activity.</div>
            </div>

            <div style={sectionActions}>

              <button
                type="button"
                style={maintenanceView === "week" ? btn() : btn("ghost")}
                onClick={() => setMaintenanceView("week")}
              >
                Week
              </button>

              <button
                type="button"
                style={maintenanceView === "month" ? btn() : btn("ghost")}
                onClick={() => setMaintenanceView("month")}
              >
                Month
              </button>

              <div style={chip}>
                {maintenanceDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
            </div>
          </div>

          {mounted && (
            <BigCalendar
              localizer={localizer}
              events={maintenanceEvents}
              view={maintenanceView}
              views={["week", "month"]}
              onView={(v) => setMaintenanceView(v)}
              date={maintenanceDate}
              onNavigate={(d) => setMaintenanceDate(d)}
              startAccessor="start"
              endAccessor="end"
              allDayAccessor={() => true}
              allDaySlot
              selectable={false}
              popup
              toolbar={false}
              nowIndicator={false}
              getNow={() => new Date(2000, 0, 1)}
              components={{ event: MaintenanceCalendarEvent }}
              onSelectEvent={(e) => {
                if (!e) return;
                if (e.__collection === "maintenanceJobs") {
                  router.push("/maintenance-jobs");
                  return;
                }
                setSelectedMaintenanceEvent(e);
              }}
              eventPropGetter={maintenanceEventPropGetter}
              dayPropGetter={(date) => {
                const todayD = new Date();
                const isToday =
                  date.getDate() === todayD.getDate() &&
                  date.getMonth() === todayD.getMonth() &&
                  date.getFullYear() === todayD.getFullYear();

                return {
                  style: {
                    backgroundColor: isToday ? "rgba(139,94,60,0.3)" : undefined,
                    border: isToday ? "1px solid rgba(139,94,60,0.56)" : undefined,
                  },
                };
              }}
              style={calendarFrame}
            />
          )}

          {selectedMaintenanceEvent && (
            <DashboardMaintenanceModal
              event={selectedMaintenanceEvent}
              onClose={() => setSelectedMaintenanceEvent(null)}
            />
          )}
        </section>

        {/* Holiday + Notes Calendar */}
        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Holiday + Notes Calendar</h2>
              <div style={hint}>Shared leave and note visibility in one place.</div>
            </div>
            <div style={sectionActions}>
              <button style={btn()} type="button" onClick={() => setHolidayModalOpen(true)}>
                + Add Holiday
              </button>
              <button style={btn()} type="button" onClick={() => setCreateNoteOpen(true)}>
                + Add Note
              </button>
            </div>
          </div>

          {mounted && (
            <BigCalendar
              localizer={localizer}
              events={[
                ...holidays.map((h) => ({
                  ...h,
                  title: h.title,
                  start: new Date(h.start),
                  end: new Date(h.end),
                  allDay: true,
                  status: "Holiday",
                })),
                ...notes.map((n) => ({
                  ...n,
                  title: n.title || "Note",
                  start: new Date(n.start),
                  end: new Date(n.end),
                  allDay: true,
                  status: "Note",
                })),
              ]}
              view={calendarView}
              views={["week", "month"]}
              onView={(v) => setCalendarView(v)}
              date={currentDate}
              onNavigate={(d) => setCurrentDate(d)}
              selectable
              startAccessor="start"
              endAccessor="end"
              popup
              allDayAccessor={() => true}
              dayLayoutAlgorithm="overlap"
              toolbar={false}
              nowIndicator={false}
              getNow={() => new Date(2000, 0, 1)}
              onSelectEvent={(e) => {
                if (e.status === "Holiday") {
                  setEditingHolidayId(e.id);
                } else if (e.status === "Note") {
                  setEditingNoteId(e.id);
                  const d = e.start instanceof Date ? e.start : new Date(e.start);
                  setNoteDate(d.toISOString().split("T")[0]);
                  setNoteText(e.title || "");
                  setNoteModalOpen(true);
                }
              }}
              style={calendarFrame}
              components={{
                event: ({ event }) => (
                  <div
                    title={event.title}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      fontSize: "0.85rem",
                      lineHeight: 1.35,
                      color: "#0b0b0b",
                      fontWeight: 600,
                      fontFamily: "Inter, system-ui, Arial, sans-serif",
                      textAlign: "left",
                      padding: 6,
                      minHeight: 40,
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {event.status === "Holiday" ? (
                      <>
                        <span style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{event.employee}</span>
                        <span style={{ fontStyle: "italic", opacity: 0.75 }}>On Holiday</span>
                      </>
                    ) : (
                      <>
                        <span style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{event.employee}</span>
                        <span style={{ fontWeight: 800, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          {event.title}
                        </span>
                        <span style={{ fontStyle: "italic", opacity: 0.75 }}>Note</span>
                      </>
                    )}
                  </div>
                ),
              }}
              eventPropGetter={(event) => ({
                style: {
                  backgroundColor: event.status === "Holiday" ? "#ced8e3" : "#c6d3df",
                  color: "#1b3044",
                  fontWeight: 700,
                  padding: 0,
                  borderRadius: 8,
                  border: event.status === "Holiday" ? "1px solid #9fb2c4" : "1px solid #97adc0",
                  boxShadow: "0 6px 14px rgba(15,23,42,0.06)",
                },
              })}
              dayPropGetter={() => ({
                style: {
                  borderRight: "1px solid #e5e7eb",
                  borderTop: "1px solid #e5e7eb",
                },
              })}
            />
          )}
        </section>

        {/* Today’s Jobs */}
        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Today’s Jobs</h2>
              <div style={hint}>Today’s confirmed operational schedule.</div>
            </div>
            <div style={chip}>{todaysJobs.length}</div>
          </div>

          {todaysJobs.length === 0 ? (
            <p style={{ color: UI.muted, marginTop: 8 }}>No jobs today.</p>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <colgroup>
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Job Number</th>
                    <th style={th}>Production</th>
                    <th style={th}>Location</th>
                    <th style={th}>Crew</th>
                    <th style={th}>Crew Needed</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {todaysJobs.map((b, i) => {
                    const crewNeeded = getCrewNeeded(b);
                    const isCrewed = !!b.isCrewed;

                    return (
                      <tr
                        key={i}
                        style={{
                          background: i % 2 === 0 ? "#fff" : "#fafafa",
                          transition: "background-color .15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f5f6f8")}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#fff" : "#fafafa")
                        }
                      >
                        <td style={td}>{new Date(b.date || b.startDate).toDateString()}</td>
                        <td style={td}>{b.jobNumber}</td>
                        <td style={td}>{b.client || "—"}</td>
                        <td style={td}>{b.location || "—"}</td>
                        <td style={td}>
                          {Array.isArray(b.employees) && b.employees.length ? formatCrew(b.employees) : "—"}
                        </td>

                        {/*  UPDATED: if crewed, show "Crewed" and hide counts */}
                        <td style={td}>
                          {isCrewed ? (
                            <span style={{ fontWeight: 900 }}>Crewed</span>
                          ) : crewNeeded === null ? (
                            "—"
                          ) : (
                            crewNeeded
                          )}
                        </td>

                        <td style={td}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => setSelectedBookingId(b.id)} style={btn("ghost")} type="button">
                              View
                            </button>
                            <button
                              onClick={() => goToEditBooking(b.id)}
                              style={isRestricted ? btnDisabled(btn()) : btn()}
                              aria-disabled={isRestricted}
                              title={isRestricted ? "Your account is not allowed to edit bookings" : ""}
                              type="button"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Add booking modal (unchanged logic, restyled a touch) */}
        {showModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(2,6,23,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
              padding: 18,
            }}
          >
            <div
              style={{
                ...surface,
                width: 380,
                maxWidth: "92vw",
                padding: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: UI.text }}>
                Add Booking for {selectedDate?.toDateString()}
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const client = e.target.client.value;
                  const location = e.target.location.value;
                  saveBooking({
                    date: selectedDate.toISOString(),
                    client,
                    location,
                  });
                }}
                style={{ display: "grid", gap: 10, marginTop: 12 }}
              >
                <input
                  name="client"
                  placeholder="Client"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    outline: "none",
                    fontSize: 13.5,
                    background: "#fff",
                  }}
                />
                <input
                  name="location"
                  placeholder="Location"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    outline: "none",
                    fontSize: 13.5,
                    background: "#fff",
                  }}
                />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowModal(false)} style={btn("ghost")}>
                    Cancel
                  </button>
                  <button type="submit" style={btn()}>
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <MaintenanceBookingPickerModal
          open={showCreateMaintenancePicker}
          vehicles={vehiclesData}
          equipmentOptions={equipmentOptions}
          maintenanceType={createMaintenanceType}
          vehicleId={createMaintenanceVehicleId}
          equipment={createMaintenanceEquipment}
          onClose={() => {
            setShowCreateMaintenancePicker(false);
            setCreateMaintenanceEquipment("");
          }}
          onContinue={() => {
            if (!createMaintenanceVehicleId && !createMaintenanceEquipment) return;
            setShowCreateMaintenancePicker(false);
          }}
          onVehicleChange={setCreateMaintenanceVehicleId}
          onTypeChange={setCreateMaintenanceType}
          onEquipmentChange={setCreateMaintenanceEquipment}
        />
      </div>

      {!showCreateMaintenancePicker && (createMaintenanceVehicleId || createMaintenanceEquipment) && (
        <MaintenanceBookingForm
          vehicleId={createMaintenanceVehicleId}
          type={createMaintenanceType}
          initialEquipment={createMaintenanceEquipment ? [createMaintenanceEquipment] : []}
          onClose={() => {
            setCreateMaintenanceVehicleId("");
            setCreateMaintenanceType("WORK");
            setCreateMaintenanceEquipment("");
          }}
          onSaved={() => {
            setCreateMaintenanceVehicleId("");
            setCreateMaintenanceType("WORK");
            setCreateMaintenanceEquipment("");
          }}
        />
      )}

      {/*  HolidayForm modal overlay (unchanged logic) */}
      {holidayModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 95,
            padding: 18,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHolidayModalOpen(false);
          }}
        >
          <div
            style={{
              maxWidth: 900,
              width: "95vw",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: 16,
            }}
          >
            <HolidayForm
              onClose={() => setHolidayModalOpen(false)}
              onSaved={() => {
                setHolidayModalOpen(false);
                fetchHolidays();
              }}
            />
          </div>
        </div>
      )}

      {/*  CreateNote modal overlay */}
      {createNoteOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 96,
            padding: 18,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateNoteOpen(false);
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: "95vw",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: 16,
            }}
          >
            <CreateNote
              defaultDate={new Date().toISOString().split("T")[0]}
              onClose={() => setCreateNoteOpen(false)}
              onSaved={() => {
                setCreateNoteOpen(false);
                fetchNotes();
              }}
            />
          </div>
        </div>
      )}

      {/* Existing quick note modal (logic unchanged) */}
      {noteModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 80,
            padding: 18,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "95vw",
              backgroundColor: "#121212",
              color: "#fff",
              padding: 24,
              borderRadius: 16,
              boxShadow: UI.shadowHover,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff" }}>
                {editingNoteId ? "Edit Note" : "Add Note"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNoteModalOpen(false);
                  setEditingNoteId(null);
                  setNoteText("");
                  setNoteDate(null);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#9ca3af",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                x
              </button>
            </div>

            <form onSubmit={handleSaveNote} style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block" }}>Date</label>
                <input
                  type="date"
                  value={noteDate || ""}
                  onChange={(e) => setNoteDate(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #444",
                    backgroundColor: "#333",
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block" }}>Note text</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #444",
                    backgroundColor: "#333",
                    color: "#fff",
                    fontSize: 14,
                    resize: "vertical",
                  }}
                />
              </div>

              <button type="submit" style={{ ...btn(), justifyContent: "center" }}>
                {editingNoteId ? "Save changes" : "Save note"}
              </button>

              {editingNoteId && (
                <button
                  type="button"
                  onClick={handleDeleteNote}
                  style={{
                    ...btn("danger"),
                    justifyContent: "center",
                    marginTop: 4,
                  }}
                >
                  Delete note
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {editingHolidayId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 90,
            padding: 18,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingHolidayId(null);
          }}
        >
          <div onMouseDown={(e) => e.stopPropagation()}>
            <EditHolidayForm
              holidayId={editingHolidayId}
              onClose={() => setEditingHolidayId(null)}
              onSaved={() => {
                setEditingHolidayId(null);
                fetchHolidays();
              }}
            />
          </div>
        </div>
      )}

      {selectedBookingId && (
        <ViewBookingModal
          id={selectedBookingId}
          fromDeleted={!!selectedDeletedId}
          deletedId={selectedDeletedId}
          onClose={() => {
            setSelectedBookingId(null);
            setSelectedDeletedId(null);
          }}
        />
      )}
    </HeaderSidebarLayout>
  );
}
