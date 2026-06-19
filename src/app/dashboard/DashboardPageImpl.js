// src/app/dashboard/page.js
"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { auth, db } from "@/app/utils/firebaseClient";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const BigCalendar = dynamic(
  () => import("react-big-calendar").then((m) => m.Calendar),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          ...calendarFrame,
          minHeight: 620,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: UI.muted,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        Loading calendar...
      </div>
    ),
  }
);

const DraggableBigCalendar = dynamic(
  () =>
    Promise.all([
      import("react-big-calendar"),
      import("react-big-calendar/lib/addons/dragAndDrop"),
    ]).then(([calendarModule, dndModule]) => dndModule.default(calendarModule.Calendar)),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          ...calendarFrame,
          minHeight: 620,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: UI.muted,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        Loading calendar...
      </div>
    ),
  }
);

import { localizer } from "../utils/localizer";
import { buildAssetLabel, getCanonicalDueDate, getIsoWeekLabel, isVehicleOutOfUse, ymd } from "../utils/maintenanceSchema";
import {
  buildMaintenanceBookingEvents,
  buildMaintenanceJobEvents,
  getMaintenanceBookingKind,
  getMaintenanceDisplayType,
} from "../utils/maintenanceCalendar";
import { syncEightWeekInspectionRollovers } from "../utils/inspectionRollover";
import {
  collection,
  onSnapshot,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import ViewBookingModal from "../components/ViewBookingModal";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import {
  CalendarDays,
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  MapPinned,
  Plus,
  Search,
  ShieldCheck,
  StickyNote,
  Wrench,
  X,
} from "lucide-react";
import EditHolidayForm from "../components/EditHolidayForm";
import HolidayForm from "../components/holidayform";
import CreateNote from "../components/create-note";
import EditNoteModal from "../components/EditNoteModal";
import DashboardMaintenanceModal from "../components/DashboardMaintenanceModal";
import MaintenanceBookingForm from "../components/MaintenanceBookingForm";
import MaintenanceBookingPickerModal from "../components/MaintenanceBookingPickerModal";
import RouteLoadingOverlay from "../components/RouteLoadingOverlay";
import { cacheBookingForEdit } from "@/app/utils/editBookingCache";
import { isAdminEmail } from "@/app/utils/adminAccess";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { clearPagePermissionDenied } from "@/app/utils/pageAccessEvents";

const OFF_ROAD_ALLOWED_GROUPS = new Set([
  "bike",
  "electric tracking vehicles",
  "small tracking vehicles",
]);
const isOffRoadAllowedGroup = (group) =>
  OFF_ROAD_ALLOWED_GROUPS.has(String(group || "").trim().toLowerCase());

/*
   New styling tokens (match your HR page)
*/
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  accent: "#8b5e3c",
  accentSoft: "#f5ede6",
  successSoft: "#edf7f2",
  warningSoft: "#fcf3e6",
  dangerSoft: "#fcefee",
};

const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
};

const quoteOverlayBackdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 140,
  background: "rgba(2,6,23,0.66)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
};

const quoteOverlayPanel = {
  width: "min(900px, 99vw)",
  height: "min(760px, calc(100vh - 8px))",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  boxShadow: "0 24px 70px rgba(2,6,23,0.38)",
  overflow: "hidden",
};

const quoteOverlayHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "7px 10px",
  borderBottom: "1px solid #dbe4ef",
  background: "#f8fafc",
};

const quoteOverlayEyebrow = {
  color: UI.muted,
  fontSize: 10.5,
  fontWeight: 900,
  textTransform: "uppercase",
};

const quoteOverlayTitle = {
  color: UI.text,
  fontSize: 15,
  lineHeight: 1.2,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const quoteOverlayMeta = {
  marginTop: 2,
  color: UI.muted,
  fontSize: 12,
  fontWeight: 800,
};

const quoteOverlayActions = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const quoteOverlayButton = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: UI.text,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const quoteOverlayPrimaryButton = {
  ...quoteOverlayButton,
  background: UI.brand,
  borderColor: UI.brand,
  color: "#fff",
};

const quoteOverlayCloseButton = {
  ...quoteOverlayButton,
  width: 34,
  padding: 0,
};

const quoteOverlayFrame = {
  width: "100%",
  height: "100%",
  border: 0,
  background: "#fff",
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
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: 0,
  margin: 0,
};

const headerActions = {
  display: "flex",
  gap: 8,
  flexWrap: "nowrap",
  justifyContent: "flex-end",
  alignItems: "center",
  minWidth: 0,
};

const headerSearchWrap = {
  position: "relative",
  flex: "0 1 300px",
  minWidth: 220,
  maxWidth: 320,
  width: 300,
};

const headerSearchInput = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px 7px 34px",
  borderRadius: UI.radiusSm,
  border: UI.border,
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
  padding: 12,
  marginBottom: UI.gap,
};

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  flexWrap: "wrap",
};

const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: 0 };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };
const labelTiny = {
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const sectionTitleWrap = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const sectionActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
};

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

const btn = (kind = "primary") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
  if (kind === "ghost") {
    return {
      ...base,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
    };
  }
  if (kind === "danger") {
    return {
      ...base,
      border: "1px solid #e9c6c4",
      background: UI.dangerSoft,
      color: "#991b1b",
    };
  }
  return {
    ...base,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
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
  padding: "7px 10px",
  fontSize: 13,
  fontWeight: 800,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
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
  padding: "9px 10px",
  borderBottom: "1px solid #eef2f7",
  position: "sticky",
  top: 0,
  background: "#f6f8fb",
  zIndex: 1,
  whiteSpace: "nowrap",
  fontWeight: 900,
  fontSize: 11.5,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0,
};
const td = {
  padding: "9px 10px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
  fontSize: 13,
};

const calendarFrame = {
  borderRadius: UI.radiusSm,
  background: "#fff",
  border: UI.border,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
  minHeight: 620,
  overflow: "hidden",
};

const compactCalendarFrame = {
  ...calendarFrame,
  minHeight: 0,
  height: "auto",
  overflow: "visible",
};

const monthCalendarFrame = {
  ...calendarFrame,
  minHeight: 620,
  height: "auto",
  overflow: "visible",
};

const iconBox = (color = UI.brand, bg = UI.brandSoft) => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${UI.brandBorder}`,
  flex: "0 0 auto",
});

const dashboardCalendarCss = `
.dashboard-page .rbc-calendar {
  font-family: Inter, system-ui, Arial, sans-serif;
  color: ${UI.text};
  font-size: 12px;
}
.dashboard-page .rbc-time-view,
.dashboard-page .rbc-month-view {
  border: 0;
  background: #fff;
}
.dashboard-page .rbc-header {
  padding: 7px 8px;
  background: #f6f8fb;
  color: ${UI.muted};
  font-size: 11.5px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0;
  border-color: #e3eaf2;
}
.dashboard-page .rbc-date-cell {
  padding: 5px 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}
.dashboard-page .rbc-month-row,
.dashboard-page .rbc-day-bg,
.dashboard-page .rbc-time-content,
.dashboard-page .rbc-timeslot-group {
  border-color: #e6edf5;
}
.dashboard-page .rbc-off-range-bg {
  background: #f8fafc;
}
.dashboard-page .rbc-today {
  background: rgba(31,75,122,0.08);
}
.dashboard-page .rbc-event {
  min-height: 22px;
}
.dashboard-page .rbc-row-segment {
  padding: 1px 2px;
}
.dashboard-page .rbc-event-label {
  display: none;
}
.dashboard-page .rbc-show-more {
  color: ${UI.brand};
  font-weight: 900;
  font-size: 12px;
  background: transparent;
}
.dashboard-page .dashboard-compact-calendar {
  height: auto !important;
  min-height: 0 !important;
}
.dashboard-page .dashboard-compact-calendar .rbc-time-content {
  display: none;
}
.dashboard-page .dashboard-compact-calendar .rbc-time-view {
  min-height: 0;
}
.dashboard-page .dashboard-compact-calendar .rbc-time-header {
  border-bottom: 0;
}
.dashboard-page .dashboard-compact-calendar .rbc-time-header-content,
.dashboard-page .dashboard-compact-calendar .rbc-row-content,
.dashboard-page .dashboard-compact-calendar .rbc-row,
.dashboard-page .dashboard-compact-calendar .rbc-allday-cell {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}
.dashboard-page .dashboard-compact-calendar .rbc-allday-cell {
  min-height: 96px;
}
.dashboard-page .dashboard-month-calendar {
  height: auto !important;
  min-height: 620px !important;
  overflow: visible !important;
}
.dashboard-page .dashboard-month-calendar .rbc-month-view {
  display: block;
  height: auto !important;
  overflow: visible !important;
}
.dashboard-page .dashboard-month-calendar .rbc-month-row {
  display: block;
  min-height: 120px;
  height: auto !important;
  overflow: visible !important;
}
.dashboard-page .dashboard-month-calendar .rbc-row-bg {
  inset: 0;
  min-height: 120px;
}
.dashboard-page .dashboard-month-calendar .rbc-row-content {
  min-height: 120px;
  height: auto !important;
  overflow: visible !important;
  padding-bottom: 8px;
}
.dashboard-page .dashboard-month-calendar .rbc-row {
  min-height: 0;
  height: auto !important;
  overflow: visible !important;
}
.dashboard-page .dashboard-month-calendar .rbc-event {
  height: auto !important;
}
`;

const NIGHT_SHOOT_STYLE = { bg: "#f796dfff", text: "#111", border: "#de24e4ff" };

// ---- status colour map used for per-vehicle pills ----
const STATUS_COLORS = {
  Confirmed: { bg: "#f3f970", text: "#111", border: "#0b0b0b" },
  Bickers: { bg: "#ffffff", text: "#111", border: "#0b0b0b" },
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
  Note: { bg: "#ccfbf1", text: "#111", border: "#0f766e" },
};

const normalizeStatusLabel = (raw = "") => {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "confirmed") return "Confirmed";
  if (s === "bickers") return "Bickers";
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
  if (s === "note") return "Note";
  return String(raw || "").trim();
};

const getStatusStyle = (s = "") =>
  STATUS_COLORS[normalizeStatusLabel(s)] || { bg: "#ccc", text: "#111", border: "#0b0b0b" };

const WORK_DIARY_BORDERS = {
  Confirmed: "#000000",
  Bickers: "#94a3b8",
  Stunt: "#d6a900",
  "First Pencil": "#2f8fc8",
  "Second Pencil": "#b91c1c",
  Holiday: "#94a3b8",
  Maintenance: "#a95622",
  Complete: "#3d8b37",
  "Action Required": "#b45309",
  DNH: "#8f8f8f",
  Postponed: "#8f8f8f",
  Deleted: "#8f8f8f",
  "Bank Holiday": "#7ca0d6",
  Note: "#0f766e",
};

const getWorkDiaryBorder = (status, fallback) =>
  WORK_DIARY_BORDERS[normalizeStatusLabel(status)] || fallback;

const getVehicleStatusPillStyle = (status) => {
  const normalizedStatus = normalizeStatusLabel(status);
  const tone = getStatusStyle(normalizedStatus);

  if (normalizedStatus === "Bickers") {
    return {
      ...tone,
      bg: "#e9eef5",
      border: getWorkDiaryBorder(normalizedStatus, tone.border),
    };
  }

  return tone;
};

// ---- per-user action blocks ----
const RESTRICTED_EMAILS = new Set(["mel@bickers.co.uk"]); // add more if needed
const DELETED_ON_CALENDAR_EMAILS = new Set(["mason@bickers.co.uk", "paul@bickers.co.uk"]);
const HIDEABLE_STATUSES = new Set(["dnh", "postponed", "cancelled", "lost"]);
const DASHBOARD_HIDE_PREFS_KEY = "dashboard:hide-prefs";
const INACTIVE_MAINTENANCE_STATUSES = ["cancelled", "canceled", "declined"];
const CALENDAR_ACCESS_OPTIONS = { requireCompany: false, signedInWide: true };

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

const startOfIsoWeek = (value) => {
  const x = startOfLocalDay(value);
  if (Number.isNaN(x.getTime())) return x;
  const day = x.getDay() || 7;
  x.setDate(x.getDate() + 1 - day);
  return x;
};

const addWeeksToLocalDate = (value, weeks) => {
  const base = parseLocalDate(value);
  if (!base) return "";
  const next = new Date(base);
  next.setDate(next.getDate() + Number(weeks || 0) * 7);
  return ymd(next);
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const normalizeForStableCompare = (value) => {
  if (!value) return value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : "";
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (Array.isArray(value)) return value.map(normalizeForStableCompare);
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeForStableCompare(value[key]);
        return acc;
      }, {});
  }
  return value;
};

const stableCompareString = (value) => JSON.stringify(normalizeForStableCompare(value));

const vehicleSnapshotCompareString = (vehicle) => {
  const { updatedAt, lastUpdatedAt, syncedAt, ...rest } = vehicle || {};
  return stableCompareString(rest);
};

const sameVehicleSnapshotRows = (left = [], right = []) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (vehicleSnapshotCompareString(left[i]) !== vehicleSnapshotCompareString(right[i])) {
      return false;
    }
  }
  return true;
};

const buildInspectionRolloverSyncKey = (vehicles = [], maintenanceBookings = []) =>
  stableCompareString({
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle?.id || "",
      lastMOT: vehicle?.lastMOT || "",
      nextMOT: vehicle?.nextMOT || "",
      motFreq: vehicle?.motFreq || "",
      lastService: vehicle?.lastService || "",
      nextService: vehicle?.nextService || "",
      serviceFreq: vehicle?.serviceFreq || "",
      eightWeekInspectionStart: vehicle?.eightWeekInspectionStart || "",
      nextEightWeekInspection: vehicle?.nextEightWeekInspection || "",
      eightWeekInspectionISOWeek: vehicle?.eightWeekInspectionISOWeek || "",
      motHistory: vehicle?.motHistory || [],
      serviceHistory: vehicle?.serviceHistory || [],
      eightWeekInspectionHistory: vehicle?.eightWeekInspectionHistory || [],
    })),
    maintenanceBookings: maintenanceBookings.map((booking) => ({
      id: booking?.id || "",
      vehicleId: booking?.vehicleId || "",
      type: booking?.type || "",
      status: booking?.status || "",
      provider: booking?.provider || "",
      bookingRef: booking?.bookingRef || "",
      notes: booking?.notes || "",
      appointmentDateISO: booking?.appointmentDateISO || "",
      startDateISO: booking?.startDateISO || "",
      completedAtISO: booking?.completedAtISO || "",
      sourceDueDateISO: booking?.sourceDueDateISO || "",
      appointmentDate: booking?.appointmentDate || "",
      startDate: booking?.startDate || "",
      updatedAt: booking?.updatedAt || "",
      createdAt: booking?.createdAt || "",
    })),
  });

const sameCalendarDate = (a, b) => {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.getTime() === db.getTime();
};

const normalizeCalendarView = (value) => (value === "month" ? "month" : "week");

const getDashboardInitialDate = (value) => parseLocalDate(value) || new Date();

const buildEditBookingUrl = (bookingId, calendarDate, calendarView) => {
  const params = new URLSearchParams();
  const returnDate = ymd(calendarDate);
  if (returnDate) params.set("returnDate", returnDate);
  const returnView = normalizeCalendarView(calendarView);
  params.set("returnView", returnView);
  const dashboardParams = new URLSearchParams();
  if (returnDate) dashboardParams.set("date", returnDate);
  dashboardParams.set("view", returnView);
  params.set("returnTo", `/dashboard?${dashboardParams.toString()}`);
  const query = params.toString();
  return `/edit-booking/${encodeURIComponent(bookingId)}${query ? `?${query}` : ""}`;
};

const getCalendarNow = () => new Date(2000, 0, 1);
const allDayTrue = () => true;
const dashboardCalendarFormats = {
  dayFormat: (date, culture, localizer) => localizer.format(date, "EEEE dd", culture),
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
        blocksEmployeeBooking: Boolean(data.blocksEmployeeBooking),
        sourceNoteIds: [docSnap.id],
      });
      return;
    }

    grouped.get(key).sourceNoteIds.push(docSnap.id);
    if (data.blocksEmployeeBooking) grouped.get(key).blocksEmployeeBooking = true;
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

const addWeeks = (date, weeks) => {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
};

const isApptAfterExpiry = (appt, expiry) => {
  if (!appt || !expiry) return false;
  const a = new Date(appt.getFullYear(), appt.getMonth(), appt.getDate()).getTime();
  const e = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
  return a > e;
};

const labelFromMins = (mins) => {
  const n = Number(mins) || 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

const displayDayNote = (note) => (note === "On Set" ? "Shoot Day" : note);

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

const formatHolidayDetail = (holiday = {}) => {
  const paidRaw = String(holiday.paidStatus || holiday.leaveType || "").trim();
  const paidLabel = paidRaw || "Holiday";

  const start = toJsDate(holiday.startDate);
  const end = toJsDate(holiday.endDate || holiday.startDate);
  const sameDay =
    start &&
    end &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  const startHalf = holiday.startHalfDay === true || String(holiday.startHalfDay || "").toLowerCase() === "true";
  const endHalf = holiday.endHalfDay === true || String(holiday.endHalfDay || "").toLowerCase() === "true";
  const startWhen = String(holiday.startAMPM || holiday.halfDayPeriod || holiday.halfDayType || "").trim().toUpperCase();
  const endWhen = String(holiday.endAMPM || "").trim().toUpperCase();

  if (sameDay && startHalf) {
    return `${paidLabel} - Half Day ${startWhen || "AM"}`;
  }

  const parts = [paidLabel];
  if (startHalf) parts.push(`Start ${startWhen || "AM"} Half`);
  if (endHalf) parts.push(`End ${endWhen || "PM"} Half`);
  return parts.join(" - ");
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

const diffCalendarDays = (from, to) => {
  const fromDay = startOfLocalDay(from);
  const toDay = startOfLocalDay(to);
  if (Number.isNaN(fromDay.getTime()) || Number.isNaN(toDay.getTime())) return 0;
  return Math.round((toDay.getTime() - fromDay.getTime()) / 86400000);
};

const shiftYmd = (value, deltaDays) => {
  const date = parseLocalDate(value);
  if (!date) return "";
  return ymd(addDays(date, deltaDays));
};

const sortedYmdList = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").slice(0, 10))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )
  ).sort();

const shiftDateKeyedMap = (value, deltaDays, keysToShift = null) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.entries(value).reduce((acc, [key, entry]) => {
    const shouldShift = /^\d{4}-\d{2}-\d{2}$/.test(key) && (!keysToShift || keysToShift.has(key));
    const shiftedKey = shouldShift ? shiftYmd(key, deltaDays) : key;
    if (shiftedKey) acc[shiftedKey] = entry;
    return acc;
  }, {});
};

const formatDropConfirmDate = (value) => {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "";
};

const formatDropConfirmRange = (dates) => {
  const safeDates = sortedYmdList(dates);
  if (!safeDates.length) return "";
  if (safeDates.length === 1) return formatDropConfirmDate(safeDates[0]);
  return `${formatDropConfirmDate(safeDates[0])} - ${formatDropConfirmDate(safeDates[safeDates.length - 1])}`;
};

const buildMaintenanceBookingDropUpdates = (booking, event, nextStart) => {
  const currentStart = startOfLocalDay(event?.start);
  const targetStart = startOfLocalDay(nextStart);
  if (Number.isNaN(currentStart.getTime()) || Number.isNaN(targetStart.getTime())) return null;

  const deltaDays = diffCalendarDays(currentStart, targetStart);
  if (!deltaDays) return null;

  const existingDates = sortedYmdList(booking?.bookingDates);
  const updates = { updatedAt: serverTimestamp() };
  let movedDateKeys = null;
  let movedNextDateKeys = null;

  if (existingDates.length) {
    const eventDates = sortedYmdList(
      Array.isArray(event?.__occurrences) && event.__occurrences.length
        ? event.__occurrences
        : [event?.__occurrence || ymd(currentStart)]
    );
    movedDateKeys = new Set(eventDates.length ? eventDates : [ymd(currentStart)]);
    movedNextDateKeys = sortedYmdList([...movedDateKeys].map((dateKey) => shiftYmd(dateKey, deltaDays)));

    const unmovedDates = existingDates.filter((dateKey) => !movedDateKeys.has(dateKey));
    const nextDates = sortedYmdList([...unmovedDates, ...movedNextDateKeys]);
    const first = nextDates[0] || "";
    const last = nextDates[nextDates.length - 1] || first;
    const isMultiDate = nextDates.length > 1;

    updates.bookingDates = nextDates;
    updates.date = first;
    updates.appointmentDate = isMultiDate ? "" : first;
    updates.appointmentDateISO = isMultiDate ? "" : first;
    updates.startDate = isMultiDate ? first : "";
    updates.startDateISO = isMultiDate ? first : "";
    updates.endDate = isMultiDate ? last : "";
    updates.endDateISO = isMultiDate ? last : "";
  } else {
    const exclusiveEnd = startOfLocalDay(event?.end || event?.start);
    const durationDays = Math.max(1, diffCalendarDays(currentStart, exclusiveEnd));
    const first = ymd(targetStart);
    const last = ymd(addDays(targetStart, durationDays - 1));
    const isRangeBooking =
      durationDays > 1 ||
      Boolean(booking?.startDateISO || booking?.endDateISO || booking?.startDate || booking?.endDate);

    updates.date = first;
    updates.appointmentDate = isRangeBooking ? "" : first;
    updates.appointmentDateISO = isRangeBooking ? "" : first;
    updates.startDate = isRangeBooking ? first : "";
    updates.startDateISO = isRangeBooking ? first : "";
    updates.endDate = isRangeBooking ? last : "";
    updates.endDateISO = isRangeBooking ? last : "";
  }

  if (booking?.callTimesByDate && typeof booking.callTimesByDate === "object") {
    updates.callTimesByDate = shiftDateKeyedMap(booking.callTimesByDate, deltaDays, movedDateKeys);
  }

  return { updates, movedDateKeys, movedNextDateKeys };
};

const buildVehicleMaintenanceAppointmentDropUpdates = (event, nextStart) => {
  const targetStart = startOfLocalDay(nextStart);
  if (!targetStart || Number.isNaN(targetStart.getTime())) return null;

  const currentStart = startOfLocalDay(event?.appointmentDateISO || event?.start);
  if (!currentStart || Number.isNaN(currentStart.getTime())) return null;

  const currentWeekStart = startOfIsoWeek(currentStart);
  const targetWeekStart = startOfIsoWeek(targetStart);
  const weekDelta = Math.round((targetWeekStart.getTime() - currentWeekStart.getTime()) / (7 * 86400000));
  const effectiveDate = addDays(currentStart, weekDelta * 7);
  const dateKey = ymd(effectiveDate);
  if (!dateKey || !weekDelta) return null;

  const maintenanceTypes = Array.isArray(event?.maintenanceTypes)
    ? event.maintenanceTypes.map((item) => String(item || "").trim().toLowerCase())
    : [];
  const label = String(event?.maintenanceTypeLabel || event?.title || "").trim().toLowerCase();
  const shouldMoveBrake = maintenanceTypes.some((item) => item.includes("brake")) || label.includes("brake");
  const shouldMovePmi = maintenanceTypes.some((item) => item.includes("pmi")) || label.includes("pmi");

  const updates = { updatedAt: serverTimestamp() };
  if (shouldMoveBrake) {
    updates.nextBrakeTest = dateKey;
    updates.brakeISOWeek = getIsoWeekLabel(dateKey);
  }
  if (shouldMovePmi) {
    updates.nextPMI = dateKey;
    updates.pmiISOWeek = getIsoWeekLabel(dateKey);
  }

  if (!shouldMoveBrake && !shouldMovePmi) return null;
  return { updates, movedDateKeys: new Set([event?.appointmentDateISO || ymd(event?.start)]), movedNextDateKeys: [dateKey] };
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

const getBookingCalendarRange = (booking) => {
  const bookingDateList = Array.isArray(booking?.bookingDates)
    ? booking.bookingDates
        .map((value) => parseLocalDate(value))
        .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())
    : [];

  const primaryStart = parseLocalDate(booking?.startDate || booking?.date);
  const primaryEnd = parseLocalDate(booking?.endDate || booking?.date || booking?.startDate);

  const startBase = primaryStart || bookingDateList[0] || null;
  const endBase = primaryEnd || bookingDateList[bookingDateList.length - 1] || startBase;

  if (!startBase) return null;

  const safeEnd = endBase && endBase < startBase ? startBase : endBase || startBase;
  return { startBase, safeEnd };
};

const groupExplicitBookingDates = (bookingDates) => {
  const dates = Array.from(
    new Set(
      (Array.isArray(bookingDates) ? bookingDates : [])
        .map((value) => parseLocalDate(value))
        .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()))
        .map((value) => startOfLocalDay(value).getTime())
    )
  )
    .sort((a, b) => a - b)
    .map((time) => new Date(time));

  const groups = [];
  dates.forEach((date) => {
    const last = groups[groups.length - 1];
    if (last && startOfLocalDay(addDays(last.end, 1)).getTime() === date.getTime()) {
      last.end = date;
      return;
    }
    groups.push({ start: date, end: date });
  });

  return groups;
};

//  Single source of truth for both BOOKINGS + MAINTENANCE
const eventsByJobNumber = (bookings, maintenanceBookings) => {
  // normal bookings  full events
  const bookingEvents = (bookings || [])
    .flatMap((b) => {
      const explicitDateGroups =
        Array.isArray(b.bookingDates) && b.bookingDates.length
          ? groupExplicitBookingDates(b.bookingDates)
          : [];

      if (explicitDateGroups.length) {
        const ctByDate = ensureCallTimesByDate(b);
        const callTime = normaliseCallTime(b.callTime || b.calltime || b.call_time);

        return explicitDateGroups.map((group, index) => ({
          ...b,
          id: `${b.id || b.jobNumber || "booking"}__date_group__${index}`,
          __bookingId: b.id,
          __collection: b.__collection || "bookings",
          __deletedDocId: b.__deletedDocId || null,
          __dateGroupIndex: index,
          title: b.client || "",
          start: startOfLocalDay(group.start),
          end: startOfLocalDay(addDays(group.end, 1)),
          allDay: true,
          status: b.status || "Confirmed",
          callTime,
          callTimesByDate: ctByDate,
        }));
      }

      const range = getBookingCalendarRange(b);
      if (!range) return [];
      const { startBase, safeEnd } = range;

      //  ensure per-day call times exist even for single-day / recce-day
      const ctByDate = ensureCallTimesByDate(b);

      //  normalise callTime too so badge logic + display are consistent
      const callTime = normaliseCallTime(b.callTime || b.calltime || b.call_time);

      return [{
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
      }];
    })
    .filter(Boolean);

  const maintenanceEvents = buildMaintenanceBookingEvents(maintenanceBookings, {
    getVehicleLabel: (booking) =>
      booking.vehicleLabel || booking.vehicleName || booking.title || booking.jobNumber || "Vehicle",
    groupConsecutiveDates: true,
    titleSeparator: " - ",
  }).map((event) => ({
    ...event,
    jobNumber: event.jobNumber ?? "",
  }));

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

const getEventQuoteNumber = (event = {}) => {
  const latestQuote = Array.isArray(event.quoteVersions) && event.quoteVersions.length
    ? event.quoteVersions
        .filter((entry) => entry && typeof entry === "object")
        .sort((a, b) => {
          const aTime = new Date(a.savedAt || a.updatedAt || a.createdAt || 0).getTime() || 0;
          const bTime = new Date(b.savedAt || b.updatedAt || b.createdAt || 0).getTime() || 0;
          if (bTime !== aTime) return bTime - aTime;
          return String(b.quoteNumber || "").localeCompare(String(a.quoteNumber || ""));
        })[0]
    : null;

  return String(
    event.acceptedQuoteNumber ||
      latestQuote?.quoteNumber ||
      event.quote?.quoteNumber ||
      event.quoteNumber ||
      (Array.isArray(event.quoteNumbers) ? event.quoteNumbers.at(-1) : "") ||
      ""
  ).trim();
};

const splitQuoteRevision = (quoteNumber = "") => {
  const text = String(quoteNumber || "").trim();
  const match = text.match(/^(.+)\.(\d+)$/);
  return {
    publicNumber: (match ? match[1] : text).trim(),
    revision: match?.[2] ? Number(match[2]) : 0,
  };
};

const getEventQuoteOptions = (event = {}) => {
  const versions = Array.isArray(event.quoteVersions)
    ? event.quoteVersions.filter((entry) => entry && typeof entry === "object" && entry.quoteNumber)
    : [];
  const latestByPublicNumber = new Map();

  versions.forEach((entry) => {
    const { publicNumber, revision } = splitQuoteRevision(entry.quoteNumber);
    const key = publicNumber.toLowerCase();
    const existing = latestByPublicNumber.get(key);
    const existingRevision = splitQuoteRevision(existing?.quoteNumber).revision;
    const existingTime = new Date(existing?.savedAt || existing?.updatedAt || existing?.createdAt || 0).getTime() || 0;
    const entryTime = new Date(entry.savedAt || entry.updatedAt || entry.createdAt || 0).getTime() || 0;
    if (!existing || revision > existingRevision || (revision === existingRevision && entryTime >= existingTime)) {
      latestByPublicNumber.set(key, { quoteNumber: entry.quoteNumber, label: publicNumber, savedAt: entry.savedAt || entry.updatedAt || "" });
    }
  });

  const addFallback = (quoteNumber) => {
    const text = String(quoteNumber || "").trim();
    if (!text) return;
    const { publicNumber } = splitQuoteRevision(text);
    const key = publicNumber.toLowerCase();
    if (!latestByPublicNumber.has(key)) {
      latestByPublicNumber.set(key, { quoteNumber: text, label: publicNumber, savedAt: "" });
    }
  };

  addFallback(event.acceptedQuoteNumber);
  addFallback(event.quote?.quoteNumber);
  addFallback(event.quoteNumber);
  (Array.isArray(event.quoteNumbers) ? event.quoteNumbers : []).forEach(addFallback);

  const acceptedPublicNumber = splitQuoteRevision(event.acceptedQuoteNumber).publicNumber.toLowerCase();
  return Array.from(latestByPublicNumber.values()).sort((a, b) => {
    const aAccepted = splitQuoteRevision(a.quoteNumber).publicNumber.toLowerCase() === acceptedPublicNumber;
    const bAccepted = splitQuoteRevision(b.quoteNumber).publicNumber.toLowerCase() === acceptedPublicNumber;
    if (aAccepted !== bAccepted) return aAccepted ? -1 : 1;
    return String(a.label || a.quoteNumber).localeCompare(String(b.label || b.quoteNumber));
  });
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

function EventMetaBadge({ Icon, good, title, children }) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        minHeight: 20,
        minWidth: children ? 34 : 24,
        padding: children ? "2px 6px" : "2px 5px",
        borderRadius: 6,
        backgroundColor: good ? "#4caf50" : "#f44336",
        color: "#fff",
        border: "1px solid rgba(0,0,0,0.8)",
        fontSize: "0.72rem",
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={12} strokeWidth={3} />
      {children ? children : good ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
    </span>
  );
}

/* --------------------- CalendarEvent (booking block minimal) ----------------- */
function CalendarEvent({ event, onViewQuote }) {
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
  const isNote = event.status === "Note";
  const isBickersJob = String(event.status || "").trim().toLowerCase() === "bickers";

  //  robust per-day call time detection + display
  const hasPerDayCallTimes =
    event.callTimesByDate && Object.keys(event.callTimesByDate).length > 0;

  const bookingStatusLC = String(event.status || "").toLowerCase();
  const hideDayNotes = ["cancelled", "canceled", "postponed", "dnh"].includes(bookingStatusLC);
  const equipmentText = Array.isArray(event?.equipment)
    ? event.equipment
        .map((item) => (typeof item === "string" ? item : item?.name || item?.label || ""))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ")
    : String(event?.equipment || "").trim();
  const locationText = String(event?.location || "").trim();

  const callTimeForThisEvent = useMemo(() => callTimeForEventDay(event), [event]);
  const hasAnyCallTime =
    !!callTimeForThisEvent ||
    !!event.callTime ||
    (hasPerDayCallTimes && Object.values(event.callTimesByDate || {}).some(Boolean));
  const callTimeTitle = hasAnyCallTime
    ? callTimeForThisEvent
      ? `Call time set: ${callTimeForThisEvent}`
      : event.callTime
      ? `Call time set: ${event.callTime}`
      : "Call time set per day"
    : "No call time set";

  //  NEW: crew needed for this job
  const crewNeeded = useMemo(() => getCrewNeeded(event), [event]);

  //  NEW: "Crewed" handling (no crew-needed counts once crewed)
  const isCrewed = !isMaintenance && !!event.isCrewed;
  const quoteNumberForView = !isMaintenance && !isNote ? getEventQuoteNumber(event) : "";
  const quoteOptionsForView = !isMaintenance && !isNote ? getEventQuoteOptions(event) : [];
  const canViewQuote = Boolean(quoteNumberForView && quoteOptionsForView.length);

  if (isNote) {
    return (
      <div
        title={event.title || "Note"}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "5px 6px",
          color: "#0b0b0b",
          fontFamily: "Inter, system-ui, Arial, sans-serif",
          fontSize: "0.82rem",
          lineHeight: 1.15,
          fontWeight: 800,
          textAlign: "left",
          whiteSpace: "normal",
          wordBreak: "break-word",
          letterSpacing: 0,
        }}
      >
        <span style={{ fontSize: "0.68rem", fontWeight: 900, color: "#0f766e" }}>NOTE</span>
        <span>{event.title || "Note"}</span>
        {event.employee ? <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>{event.employee}</span> : null}
      </div>
    );
  }

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
        letterSpacing: 0,
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
          <span style={{ fontStyle: "italic", opacity: 0.75 }}>{formatHolidayDetail(event)}</span>
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
              {canViewQuote ? (
                <button
                  type="button"
                  onClick={(clickEvent) => {
                    clickEvent.preventDefault();
                    clickEvent.stopPropagation();
                    onViewQuote?.({
                      bookingId: event.__bookingId || event.id,
                      jobNumber: event.jobNumber || "",
                      client: event.client || event.title || "Quote",
                      quoteOptions: quoteOptionsForView,
                      initialQuoteNumber: quoteNumberForView,
                    });
                  }}
                  title={`View quote ${quoteNumberForView}`}
                  aria-label={`View quote ${quoteNumberForView}`}
                  style={{
                    width: 24,
                    height: 24,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid #0b0b0b",
                    borderRadius: 6,
                    background: "#ffffff",
                    color: "#0b0b0b",
                    padding: 0,
                    cursor: "pointer",
                    boxShadow: "0 1px 0 rgba(0,0,0,0.12)",
                  }}
                >
                  <FileText size={14} strokeWidth={2.7} />
                </button>
              ) : null}
            </div>
          </div>

          {!isMaintenance && <span>{event.client}</span>}
          {isMaintenance && (
            <span style={{ fontSize: "0.8rem", fontWeight: 900 }}>
              {event.maintenanceTypeLabel || "MAINTENANCE"}
            </span>
          )}

          {isMaintenance && event.requiresBrakeTestDocument && (
            <EventMetaBadge
              Icon={FileText}
              good={!!event.hasBrakeTestDocument}
              title={event.hasBrakeTestDocument ? "Brake test document attached" : "No brake test document"}
            >
              BT
            </EventMetaBadge>
          )}

          {isMaintenance && event.requiresPmiDocument && (
            <EventMetaBadge
              Icon={FileText}
              good={!!event.hasPmiDocument}
              title={event.hasPmiDocument ? "PMI document attached" : "No PMI document"}
            >
              PMI
            </EventMetaBadge>
          )}

          {/*  Call Time line (shows correctly for single day + recce day + multi-day) */}
          {!isMaintenance && callTimeForThisEvent && (
            <span
              title={callTimeTitle}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: "0.78rem",
                fontWeight: 900,
              }}
            >
              <Clock3 size={12} strokeWidth={3} /> {callTimeForThisEvent}
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
              const offRoadTrackingApplies = Boolean(event.offRoadTracking) && isOffRoadAllowedGroup(v?.group);

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
                    {plate ? ` - ${plate}` : ""}
                  </span>
                );
              }

              const today0 = new Date();
              today0.setHours(0, 0, 0, 0);

              const jobLastDay = new Date(event.end);
              jobLastDay.setDate(jobLastDay.getDate() - 1);
              jobLastDay.setHours(0, 0, 0, 0);

              const isCurrentOrFutureJob = jobLastDay >= today0;

              if (
                isConfirmed &&
                isCurrentOrFutureJob &&
                ((isSornOrUntaxed && !offRoadTrackingApplies) || isUninsured)
              ) {
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
                    title="Vehicle non-compliant (SORN or not insured) - current or future confirmed job"
                  >
                    {name}
                    {plate ? ` - ${plate}` : ""}
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
                const bookingIsComplete = String(event.status || "").trim().toLowerCase() === "complete";
                const vehicleIsComplete = String(itemStatus || "").trim().toLowerCase() === "complete";

                const style =
                  shoot === "night" &&
                  bookingIsConfirmed &&
                  vehicleIsConfirmed &&
                  !bookingIsComplete &&
                  !vehicleIsComplete
                    ? NIGHT_SHOOT_STYLE
                    : getVehicleStatusPillStyle(itemStatus);

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
                    {plate ? ` - ${plate}` : ""}
                  </span>
                );
              }

              return (
                <span key={i}>
                  {name}
                  {plate ? ` - ${plate}` : ""}
                </span>
              );
            })}

          {equipmentText ? (
            <span style={{ width: "100%", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>
              {equipmentText}
            </span>
          ) : null}
          {locationText ? (
            <span style={{ width: "100%", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>
              {locationText}
            </span>
          ) : null}

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
                                ? ` - ${other}`
                                : note === "Travel Time" && tmins
                                ? ` - ${labelFromMins(tmins)}`
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
                                {formattedDate}: {displayDayNote(note) || "-"}
                                {extra}
                                {callTimeForDay ? ` - CT ${callTimeForDay}` : ""}
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
                {!isBickersJob && (
                  <EventMetaBadge
                    Icon={ShieldCheck}
                    good={!!event.hasHS}
                    title={event.hasHS ? "Health and safety present" : "No health and safety"}
                  />
                )}

                {!isBickersJob && (
                  <span
                    title={event.hasRiskAssessment ? "Risk assessment present" : "No risk assessment"}
                    aria-label={event.hasRiskAssessment ? "Risk assessment present" : "No risk assessment"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      minHeight: 20,
                      minWidth: 34,
                      fontSize: "0.72rem",
                      fontWeight: 400,
                      padding: "2px 6px",
                      borderRadius: 6,
                      backgroundColor: event.hasRiskAssessment ? "#4caf50" : "#f44336",
                      color: "#fff",
                      border: "1px solid rgba(0,0,0,0.8)",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    RA {event.hasRiskAssessment ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                  </span>
                )}

                <EventMetaBadge
                  Icon={BedDouble}
                  good={!!event.hasHotel}
                  title={event.hasHotel ? "Hotel required" : "No hotel"}
                />

                {!isBickersJob && (
                  <EventMetaBadge
                    Icon={MapPinned}
                    good={!!event.hasRiggingAddress}
                    title={
                      event.hasRiggingAddress
                        ? event.riggingAddress || "Unit base set"
                        : "No unit base"
                    }
                  />
                )}
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
                View recce form
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
                  letterSpacing: 0,
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
  const bookingStatus = String(event?.bookingStatus || "").trim().toLowerCase();
  const workflowStatus = String(event?.workflowStatus || "").trim().toLowerCase();
  const isBookingBlock =
    kind === "MOT_BOOKING" ||
    kind === "SERVICE_BOOKING" ||
    kind === "INSPECTION_BOOKING" ||
    kind === "MAINTENANCE_APPOINTMENT" ||
    kind === "MAINTENANCE_BOOKING";
  const isDueBlock =
    kind === "MOT" ||
    kind === "SERVICE" ||
    kind === "INSPECTION" ||
    kind === "BRAKE_TEST" ||
    kind === "PMI";
  const hasRail = isBookingBlock || isDueBlock || kind === "MAINTENANCE";
  const isCompleted =
    bookingStatus === "completed" ||
    bookingStatus === "complete" ||
    workflowStatus === "completed" ||
    workflowStatus === "complete";

  let bg = "#c4d6e4";
  let border = "#95b3ca";
  let text = "#172a3d";

  if (kind === "MOT") {
    bg = "#fff7ed";
    border = "#f59e0b";
    text = "#713f12";
    if (event?.booked) {
      bg = "#fef3c7";
      border = "#d97706";
      text = "#713f12";
    }
  } else if (kind === "MOT_BOOKING") {
    bg = "#dbeafe";
    border = "#2563eb";
    text = "#102a56";
    if (String(event?.bookingStatus || "").includes("After Expiry")) {
      bg = "#e4c0bd";
      border = "#bf847f";
      text = "#631f1a";
    }
  } else if (kind === "SERVICE") {
    bg = "#ecfdf5";
    border = "#10b981";
    text = "#064e3b";
    if (event?.booked) {
      bg = "#d1fae5";
      border = "#059669";
      text = "#064e3b";
    }
  } else if (kind === "SERVICE_BOOKING") {
    bg = "#dbeafe";
    border = "#2563eb";
    text = "#102a56";
  } else if (kind === "INSPECTION") {
    bg = "#f5f3ff";
    border = "#8b5cf6";
    text = "#3b0764";
    if (event?.booked) {
      bg = "#ede9fe";
      border = "#7c3aed";
      text = "#3b0764";
    }
  } else if (kind === "INSPECTION_BOOKING") {
    bg = "#ede9fe";
    border = "#7c3aed";
    text = "#321064";
  } else if (kind === "MAINTENANCE_APPOINTMENT") {
    bg = "#f0fdfa";
    border = "#14b8a6";
    text = "#134e4a";
  } else if (kind === "MAINTENANCE_BOOKING") {
    bg = "#ccfbf1";
    border = "#0d9488";
    text = "#134e4a";
  } else if (kind === "MAINTENANCE") {
    bg = "#e2e8f0";
    border = "#64748b";
    text = "#1e293b";
  }

  const tone = event?.dueDate && !isBookingBlock ? dueTone(event.dueDate) : "soft";
  const suppressEscalation = isDueBlock && event?.booked;

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

  if (isCompleted) {
    bg = "#d1fae5";
    border = "#86efac";
    text = "#065f46";
  }

  return {
    style: {
      borderRadius: 10,
      border: `1px solid ${border}`,
      borderLeft: hasRail ? `6px solid ${border}` : `1px solid ${border}`,
      background: bg,
      color: text,
      padding: 0,
      boxShadow: isBookingBlock
        ? "0 4px 10px rgba(37,99,235,0.12)"
        : "0 2px 6px rgba(15,23,42,0.08)",
      overflow: "hidden",
      cursor: event?.__collection === "maintenanceBookings" ? "grab" : "pointer",
    },
  };
}

function MaintenanceCalendarEvent({ event }) {
  const kind = event?.kind || "MAINTENANCE";
  const displayType = getMaintenanceDisplayType(event);
  const workflowStatus = String(event?.workflowStatus || "").trim().toLowerCase();
  const bookingStatus = String(event?.bookingStatus || "").trim().toLowerCase();
  const isCompleted =
    bookingStatus === "completed" ||
    bookingStatus === "complete" ||
    workflowStatus === "completed" ||
    workflowStatus === "complete";
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
      ? "MOT expiry"
      : kind === "SERVICE"
      ? "Service due"
      : kind === "MOT_BOOKING"
      ? "MOT appointment"
      : kind === "SERVICE_BOOKING"
      ? "Service appointment"
      : kind === "INSPECTION"
      ? "8 week inspection due"
      : kind === "BRAKE_TEST"
      ? "Brake test due"
      : kind === "PMI"
      ? "PMI inspection due"
      : kind === "INSPECTION_BOOKING"
      ? "Inspection appointment"
      : kind === "MAINTENANCE_APPOINTMENT"
      ? event?.maintenanceTypeLabel || `${displayType} appointment`
      : kind === "MAINTENANCE_BOOKING"
      ? `${displayType} appointment`
      : kind === "MAINTENANCE"
      ? event?.maintenanceTypeLabel || "Workshop job card"
      : `${displayType} booking`;

  const dd = event?.dueDate ? new Date(event.dueDate) : null;
  const isBookingBlock =
    kind === "MOT_BOOKING" ||
    kind === "SERVICE_BOOKING" ||
    kind === "INSPECTION_BOOKING" ||
    kind === "MAINTENANCE_APPOINTMENT" ||
    kind === "MAINTENANCE_BOOKING";
  const isDueBlock =
    kind === "MOT" ||
    kind === "SERVICE" ||
    kind === "INSPECTION" ||
    kind === "BRAKE_TEST" ||
    kind === "PMI";
  const showTone = !isBookingBlock && !(isDueBlock && event?.booked);
  const tone = showTone && dd ? dueTone(dd) : "soft";
  const toneText =
    tone === "overdue"
      ? "Overdue"
      : tone === "soon"
      ? "Due soon"
      : tone === "ok" && kind === "SERVICE"
      ? "Service in date"
      : tone === "ok" && kind === "MOT"
      ? "MOT in date"
      : tone === "ok" && kind === "INSPECTION"
      ? "Inspection in cycle"
      : tone === "ok" && kind === "BRAKE_TEST"
      ? "Brake test in date"
      : tone === "ok" && kind === "PMI"
      ? "PMI in date"
      : "";
  const cleanTitle = (() => {
    const title = String(event?.title || "Maintenance").trim();
    if (kind === "MAINTENANCE_APPOINTMENT") {
      const suffix = ` - ${String(event?.maintenanceTypeLabel || "").trim()}`;
      return suffix.trim() && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
    }
    if (!isDueBlock) return title;
    return title
      .replace(/\s+-\s+MOT due(?:\s+\(Booked\))?$/i, "")
      .replace(/\s+-\s+Service due(?:\s+\(Booked\))?$/i, "")
      .replace(/\s+-\s+8 week inspection due(?:\s+\(Booked(?:\s+-\s+Outside ISO Week)?\))?$/i, "")
      .replace(/\s+-\s+Brake test due$/i, "")
      .replace(/\s+-\s+PMI inspection due$/i, "");
  })();
  const dueLabelColor =
    tone === "overdue" ? "#991b1b" : tone === "soon" ? "#92400e" : null;
  const labelColor =
    isDueBlock && dueLabelColor
      ? dueLabelColor
      : kind === "MOT"
      ? "#b45309"
      : kind === "SERVICE"
      ? "#047857"
      : kind === "INSPECTION"
      ? "#7c3aed"
      : kind === "BRAKE_TEST"
      ? "#4f46e5"
      : kind === "PMI"
      ? "#0f766e"
      : isBookingBlock
      ? "#1d4ed8"
      : kind === "MAINTENANCE"
      ? "#475569"
      : "#1d4ed8";
  const nextDueLabel =
    isCompleted && kind === "MOT_BOOKING" && event?.nextMOT
      ? `Next MOT Due: ${new Date(event.nextMOT).toLocaleDateString("en-GB")}`
      : isCompleted && kind === "SERVICE_BOOKING" && event?.nextService
      ? `Next Service Due: ${new Date(event.nextService).toLocaleDateString("en-GB")}`
      : "";
  const subline = isBookingBlock
    ? event?.bookingStatus
      ? String(event.bookingStatus).replace(/^booked$/i, "Booked")
      : "Booked"
    : event?.booked && isDueBlock
    ? event?.bookingStatus
      ? String(event.bookingStatus).includes("After Expiry")
        ? "Appointment after expiry"
        : String(event.bookingStatus).includes("Outside ISO Week")
        ? "Appointment outside ISO week"
        : "Appointment booked"
      : "Appointment booked"
    : workflowStatus
    ? workflowStatus.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase())
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
        letterSpacing: 0,
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        minWidth: 0,
      }}
    >
      <span style={{ color: labelColor, fontWeight: 950, fontSize: 12, whiteSpace: "normal" }}>{label}</span>
      <span style={{ color: "#0f172a", whiteSpace: "normal" }}>{cleanTitle}</span>
      {vehicleText ? (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{vehicleText}</span>
      ) : null}
      {equipmentText ? (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{equipmentText}</span>
      ) : null}
      {locationText ? (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#475569", whiteSpace: "normal" }}>{locationText}</span>
      ) : null}
      {nextDueLabel ? (
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#0f766e", whiteSpace: "normal" }}>{nextDueLabel}</span>
      ) : null}
      {subline ? (
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#64748b", whiteSpace: "normal" }}>{subline}</span>
      ) : null}
    </div>
  );
}

function HolidayNotesCalendarEvent({ event }) {
  const isHoliday = event.status === "Holiday";
  const label = isHoliday ? "Holiday" : "Note";
  const title = isHoliday ? event.employee || "Holiday" : event.title || "Note";
  const detail = isHoliday
    ? formatHolidayDetail(event)
    : event.blocksEmployeeBooking && event.employee
    ? `${event.employee} unavailable`
    : event.employee || "Shared note";
  const labelColor = isHoliday ? "#475569" : "#0d9488";

  return (
    <div
      title={event.title || title}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontSize: 12.5,
        lineHeight: 1.3,
        fontWeight: 900,
        padding: 8,
        letterSpacing: 0,
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        minWidth: 0,
      }}
    >
      <span style={{ color: labelColor, fontWeight: 950, fontSize: 12, whiteSpace: "normal" }}>{label}</span>
      <span style={{ color: "#0f172a", whiteSpace: "normal" }}>{title}</span>
      {detail ? (
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#64748b", whiteSpace: "normal" }}>{detail}</span>
      ) : null}
    </div>
  );
}

function holidayNotesEventPropGetter(event) {
  const isHoliday = event.status === "Holiday";
  const bg = isHoliday ? "#e2e8f0" : "#ccfbf1";
  const border = isHoliday ? "#64748b" : "#0d9488";
  const text = isHoliday ? "#1e293b" : "#134e4a";

  return {
    style: {
      borderRadius: 10,
      border: `1px solid ${border}`,
      borderLeft: `6px solid ${border}`,
      background: bg,
      color: text,
      padding: 0,
      boxShadow: "0 2px 6px rgba(15,23,42,0.08)",
      overflow: "hidden",
      cursor: "pointer",
    },
  };
}

function QuoteDashboardOverlay({ viewer, onClose, onMove }) {
  if (!viewer?.bookingId || !Array.isArray(viewer.quoteOptions) || !viewer.quoteOptions.length) return null;

  const currentIndex = Math.max(0, Math.min(Number(viewer.index) || 0, viewer.quoteOptions.length - 1));
  const currentQuote = viewer.quoteOptions[currentIndex];
  const quoteSrc = `/quote-view/${encodeURIComponent(viewer.bookingId)}?quote=${encodeURIComponent(currentQuote.quoteNumber)}&embed=1`;
  const editHref = `/quote/${encodeURIComponent(viewer.bookingId)}?quote=${encodeURIComponent(currentQuote.quoteNumber)}`;
  const hasMany = viewer.quoteOptions.length > 1;

  return (
    <div
      style={quoteOverlayBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div style={quoteOverlayPanel} onMouseDown={(event) => event.stopPropagation()}>
        <div style={quoteOverlayHeader}>
          <div style={{ minWidth: 0 }}>
            <div style={quoteOverlayEyebrow}>Quote View</div>
            <div style={quoteOverlayTitle}>
              {viewer.jobNumber ? `#${viewer.jobNumber} - ` : ""}
              {viewer.client || "Quote"}
            </div>
            <div style={quoteOverlayMeta}>
              {currentQuote.label || currentQuote.quoteNumber}
              {hasMany ? ` (${currentIndex + 1} of ${viewer.quoteOptions.length})` : ""}
            </div>
          </div>
          <div style={quoteOverlayActions}>
            {hasMany ? (
              <>
                <button type="button" style={quoteOverlayButton} onClick={() => onMove?.(-1)}>
                  <ChevronLeft size={15} />
                  Previous
                </button>
                <button type="button" style={quoteOverlayButton} onClick={() => onMove?.(1)}>
                  Next
                  <ChevronRight size={15} />
                </button>
              </>
            ) : null}
            <button type="button" style={quoteOverlayPrimaryButton} onClick={() => window.open(editHref, "_blank", "noopener,noreferrer")}>
              Edit
            </button>
            <button type="button" style={quoteOverlayCloseButton} onClick={onClose} aria-label="Close quote viewer">
              <X size={18} />
            </button>
          </div>
        </div>
        <iframe title="Quote viewer" src={quoteSrc} style={quoteOverlayFrame} />
      </div>
    </div>
  );
}

/* ------------------------------- Page component ----------------------------- */
export default function DashboardPage({ bookingSaved, initialDate = "", initialView = "week" }) {
  const router = useRouter();
  const workDiarySectionRef = useRef(null);
  const authAccess = useAuth() || {};
  const authEmail = String(authAccess.userDoc?.email || authAccess.user?.email || "").trim().toLowerCase();
  const canUseAdminDashboardFallback = !!authAccess.isAdmin || isAdminEmail(authEmail);
  const useAdminDashboardData = false;
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      loading: authAccess.loading,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.loading, authAccess.user, authAccess.userDoc]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [deletedBookings, setDeletedBookings] = useState([]);
  const [calendarView, setCalendarView] = useState(() => normalizeCalendarView(initialView));
  const [currentDate, setCurrentDate] = useState(() => getDashboardInitialDate(initialDate));
  const [holidays, setHolidays] = useState([]);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [createNoteDate, setCreateNoteDate] = useState("");
  const [notes, setNotes] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [selectedDeletedId, setSelectedDeletedId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingHolidayId, setEditingHolidayId] = useState(null);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [createBookingOpening, setCreateBookingOpening] = useState(false);
  const [createBookingProgress, setCreateBookingProgress] = useState(0);
  const [createEnquiryOpening, setCreateEnquiryOpening] = useState(false);
  const [createEnquiryProgress, setCreateEnquiryProgress] = useState(0);
  const [quoteViewer, setQuoteViewer] = useState(null);

  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState(null);
  const [pendingMaintenanceDrop, setPendingMaintenanceDrop] = useState(null);
  const [showCreateMaintenancePicker, setShowCreateMaintenancePicker] = useState(false);
  const [createMaintenanceVehicleId, setCreateMaintenanceVehicleId] = useState("");
  const [createMaintenanceType, setCreateMaintenanceType] = useState("WORK");
  const [createMaintenanceEquipment, setCreateMaintenanceEquipment] = useState("");

  //  Holiday modal
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);

  //  Create Note modal
  const [createNoteOpen, setCreateNoteOpen] = useState(false);

  const handleCloseBookingModal = useCallback(() => {
    setSelectedBookingId(null);
    setSelectedDeletedId(null);
  }, []);

  const openQuoteViewer = useCallback((payload) => {
    const quoteOptions = Array.isArray(payload?.quoteOptions) ? payload.quoteOptions.filter((option) => option?.quoteNumber) : [];
    if (!payload?.bookingId || !quoteOptions.length) return;
    const initialIndex = Math.max(
      0,
      quoteOptions.findIndex((option) => option.quoteNumber === payload.initialQuoteNumber)
    );
    setQuoteViewer({
      bookingId: payload.bookingId,
      jobNumber: payload.jobNumber || "",
      client: payload.client || "",
      quoteOptions,
      index: initialIndex,
    });
  }, []);

  const moveQuoteViewer = useCallback((direction) => {
    setQuoteViewer((current) => {
      if (!current?.quoteOptions?.length) return current;
      const total = current.quoteOptions.length;
      return {
        ...current,
        index: (Number(current.index || 0) + direction + total) % total,
      };
    });
  }, []);

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) || null,
    [bookings, selectedBookingId]
  );

  const [maintenanceView, setMaintenanceView] = useState("week");
  const [maintenanceDate, setMaintenanceDate] = useState(() => getDashboardInitialDate(initialDate));
  const [showDeletedInView, setShowDeletedInView] = useState(true);
  const [showInactiveInView, setShowInactiveInView] = useState(true);
  const [hidePrefsLoadedForUser, setHidePrefsLoadedForUser] = useState(null);
  const shiftByDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  //  NEW: UK Bank Holidays (GOV.UK)
  const [bankHolidays, setBankHolidays] = useState([]);

  const authReady = !authAccess.loading && !!authAccess.user;
  const userEmail = authEmail || null;
  const userUid = authAccess.user?.uid || null;
  const rolloverSyncRef = useRef({ key: "", inFlight: false });
  const adminDashboardFallbackRef = useRef({ inFlight: false, loaded: false });

  useEffect(() => {
    const nextDate = parseLocalDate(initialDate);
    if (nextDate) {
      setCurrentDate((prev) => (sameCalendarDate(prev, nextDate) ? prev : nextDate));
      setMaintenanceDate((prev) => (sameCalendarDate(prev, nextDate) ? prev : nextDate));
    }
  }, [initialDate]);

  useEffect(() => {
    setCalendarView((prev) => {
      const nextView = normalizeCalendarView(initialView);
      return prev === nextView ? prev : nextView;
    });
  }, [initialView]);

  useEffect(() => {
    adminDashboardFallbackRef.current = { inFlight: false, loaded: false };
  }, [accessKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/dashboard") return;

    const params = new URLSearchParams(window.location.search);
    const dateKey = ymd(currentDate);
    if (dateKey) params.set("date", dateKey);
    params.set("view", normalizeCalendarView(calendarView));

    const query = params.toString();
    const nextUrl = `/dashboard${query ? `?${query}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [calendarView, currentDate]);

  const isRestricted = userEmail ? RESTRICTED_EMAILS.has(userEmail) : false;
  const canSeeDeletedOnCalendar = userEmail
    ? DELETED_ON_CALENDAR_EMAILS.has(userEmail)
    : false;

  useEffect(() => {
    if (!createBookingOpening) return undefined;

    const timer = setInterval(() => {
      setCreateBookingProgress((current) => {
        if (current >= 95) return current;
        const step = current < 45 ? 9 : current < 75 ? 5 : 2;
        return Math.min(95, current + step);
      });
    }, 320);

    return () => clearInterval(timer);
  }, [createBookingOpening]);

  useEffect(() => {
    if (!createEnquiryOpening) return undefined;

    const timer = setInterval(() => {
      setCreateEnquiryProgress((current) => {
        if (current >= 95) return current;
        const step = current < 45 ? 9 : current < 75 ? 5 : 2;
        return Math.min(95, current + step);
      });
    }, 320);

    return () => clearInterval(timer);
  }, [createEnquiryOpening]);

  useEffect(() => {
    if (!authReady || !userEmail) {
      setHidePrefsLoadedForUser(null);
      return;
    }
    try {
      const raw = localStorage.getItem(DASHBOARD_HIDE_PREFS_KEY);
      if (!raw) {
        setHidePrefsLoadedForUser(userEmail);
        return;
      }
      const all = JSON.parse(raw);
      const prefs = all?.[userEmail];
      if (!prefs || typeof prefs !== "object") {
        setHidePrefsLoadedForUser(userEmail);
        return;
      }

      if (typeof prefs.showInactiveInView === "boolean") {
        setShowInactiveInView(prefs.showInactiveInView);
      }
      if (typeof prefs.showDeletedInView === "boolean") {
        setShowDeletedInView(prefs.showDeletedInView);
      }
    } catch {
      // ignore malformed localStorage
    } finally {
      setHidePrefsLoadedForUser(userEmail);
    }
  }, [authReady, userEmail]);

  useEffect(() => {
    if (!authReady || !userEmail) return;
    if (hidePrefsLoadedForUser !== userEmail) return;
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
  }, [authReady, userEmail, hidePrefsLoadedForUser, showInactiveInView, showDeletedInView]);

  const goToCreateBooking = useCallback(() => {
    if (isRestricted || createBookingOpening || createEnquiryOpening) return;
    setCreateBookingOpening(true);
    setCreateBookingProgress(8);

    setTimeout(() => {
      try {
        router.push("/create-booking");
      } catch (error) {
        console.error("Open create booking failed:", error);
        setCreateBookingOpening(false);
        setCreateBookingProgress(0);
        alert("Failed to open create booking. Please try again.");
      }
    }, 80);
  }, [createBookingOpening, createEnquiryOpening, isRestricted, router]);

  const goToCreateEnquiry = useCallback(() => {
    if (isRestricted || createBookingOpening || createEnquiryOpening) return;
    setCreateEnquiryOpening(true);
    setCreateEnquiryProgress(8);

    setTimeout(() => {
      try {
        router.push("/create-enquiry");
      } catch (error) {
        console.error("Open create enquiry failed:", error);
        setCreateEnquiryOpening(false);
        setCreateEnquiryProgress(0);
        alert("Failed to open create enquiry. Please try again.");
      }
    }, 80);
  }, [createBookingOpening, createEnquiryOpening, isRestricted, router]);

  const goToEditBooking = useCallback(
    (bookingOrId) => {
      if (isRestricted) return;
      const booking =
        bookingOrId && typeof bookingOrId === "object"
          ? bookingOrId
          : bookings.find((item) => item.id === bookingOrId);
      const id = booking?.id || bookingOrId;
      if (!id) return;
      if (booking) cacheBookingForEdit(booking);
      router.push(buildEditBookingUrl(id, currentDate, calendarView));
    },
    [bookings, calendarView, currentDate, isRestricted, router]
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

  const applyHolidayRows = useCallback((rows = []) => {
    const holidayEvents = rows
      .map((data) => {
        const s0 = toJsDate(data.startDate);
        const e0 = toJsDate(data.endDate || data.startDate);
        if (!s0) return null;

        const startBase = startOfLocalDay(s0);
        const endBase = e0 ? startOfLocalDay(e0) : startBase;
        const safeEnd = endBase >= startBase ? endBase : startBase;
        const employee = (data.employee || data.employeeCode || "Unknown").toString();

        return {
          ...data,
          title: `${employee} - Holiday`,
          start: startBase,
          end: startOfLocalDay(addDays(safeEnd, 1)),
          allDay: true,
          status: "Holiday",
          employee,
        };
      })
      .filter(Boolean);

    setHolidays(holidayEvents);
  }, []);

  const loadAdminDashboardData = useCallback(async (reason = "Firestore listener denied") => {
    if (!canUseAdminDashboardFallback) return;
    if (adminDashboardFallbackRef.current.inFlight || adminDashboardFallbackRef.current.loaded) return;
    const currentUser = auth.currentUser;
    if (!currentUser?.getIdToken) return;

    adminDashboardFallbackRef.current.inFlight = true;
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/admin/dashboard-data", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Dashboard admin data failed: ${res.status}`);

      const collections = data.collections || {};
      setBookings(Array.isArray(collections.bookings) ? collections.bookings : []);
      applyHolidayRows(Array.isArray(collections.holidays) ? collections.holidays : []);
      setNotes(
        mapNoteDocsToCalendarEvents(
          (Array.isArray(collections.notes) ? collections.notes : []).map((row) => ({
            id: row.id,
            data: () => row,
          }))
        )
      );
      setMaintenanceBookings(Array.isArray(collections.maintenanceBookings) ? collections.maintenanceBookings : []);
      setMaintenanceJobs(Array.isArray(collections.maintenanceJobs) ? collections.maintenanceJobs : []);
      setVehiclesData(Array.isArray(collections.vehicles) ? collections.vehicles : []);
      setEquipmentOptions(
        (Array.isArray(collections.equipment) ? collections.equipment : [])
          .map((row) => String(row.name || row.label || row.id || "").trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      );
      setDeletedBookings(
        (Array.isArray(collections.deletedBookings) ? collections.deletedBookings : []).map((raw) => {
          const payload = raw.data || raw.payload || raw.booking || {};
          return {
            id: raw.originalId || raw.id,
            __collection: "deletedBookings",
            __deletedDocId: raw.id,
            ...payload,
            status: "Deleted",
          };
        })
      );
      adminDashboardFallbackRef.current.loaded = true;
      clearPagePermissionDenied();
      console.warn(`[dashboard] loaded via admin fallback after ${reason}`);
    } catch (error) {
      console.error("[dashboard] admin fallback failed:", error);
    } finally {
      adminDashboardFallbackRef.current.inFlight = false;
    }
  }, [applyHolidayRows, canUseAdminDashboardFallback]);

  // NEW: hold latest recce per booking
  const [reccesByBooking, setReccesByBooking] = useState({});

  useEffect(() => {
    if (useAdminDashboardData) {
      loadAdminDashboardData("admin account");
      return undefined;
    }
    const gate = resolveDataAccess(dataAccessState, CALENDAR_ACCESS_OPTIONS);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "recces", operation: "listen recces" });
      return undefined;
    }

    const unsubRecces = onSnapshot(tenantCollectionQuery(db, "recces", dataAccessState, [], CALENDAR_ACCESS_OPTIONS), (snap) => {
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
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "recces", operation: "listen recces" });
      loadAdminDashboardData("recces denied");
      setReccesByBooking({});
    });

    return () => unsubRecces();
  }, [accessKey, dataAccessState, loadAdminDashboardData, useAdminDashboardData]);

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
              title: `Bank Holiday - ${bh.title}`,
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

  const getVehicleRisk = useCallback((vehicles, { offRoadTracking = false } = {}) => {
    const reasons = [];
    const list = Array.isArray(vehicles) ? vehicles : [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    list.forEach((v) => {
      if (!v || typeof v !== "object") return;
      const name =
        v.name || [v.manufacturer, v.model].filter(Boolean).join(" ") || "Vehicle";
      const plate = v.registration ? ` (${String(v.registration).toUpperCase()})` : "";
      const tax = String(v.taxStatus ?? "").trim().toLowerCase();
      const ins = String(v.insuranceStatus ?? "").trim().toLowerCase();
      const motDue = getCanonicalDueDate(v, "mot");
      const offRoadTrackingApplies = offRoadTracking && isOffRoadAllowedGroup(v.group);
      if (!offRoadTrackingApplies && (tax === "sorn" || tax === "untaxed" || tax === "no tax"))
        reasons.push(`UN-TAXED / SORN: ${name}${plate}`);
      if (ins === "not insured" || ins === "uninsured" || ins === "no insurance")
        reasons.push(`NO INSURANCE: ${name}${plate}`);
      if (motDue instanceof Date && !Number.isNaN(motDue.getTime())) {
        const motDay = new Date(motDue);
        motDay.setHours(0, 0, 0, 0);
        if (motDay < today) {
          reasons.push(`MOT OVERDUE: ${name}${plate}`);
        }
      }
    });
    return { risky: reasons.length > 0, reasons };
  }, []);

  const isCurrentOrFutureJobEvent = (event) => {
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);

    const endRaw = event?.end || event?.start;
    const end = endRaw instanceof Date ? endRaw : new Date(endRaw);
    if (Number.isNaN(end.getTime())) return false;

    // end is exclusive (+1 day). Convert to last real day.
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() - 1);
    lastDay.setHours(0, 0, 0, 0);

    return lastDay >= today0;
  };

  // listeners
  useEffect(() => {
    if (!authReady) return;
    if (useAdminDashboardData) {
      loadAdminDashboardData("admin account");
      return undefined;
    }
    const gate = resolveDataAccess(dataAccessState, CALENDAR_ACCESS_OPTIONS);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "listen dashboard data" });
      return;
    }

    const unsubBookings = onSnapshot(tenantCollectionQuery(db, "bookings", dataAccessState, [], CALENDAR_ACCESS_OPTIONS), (snap) => {
      clearPagePermissionDenied();
      setBookings(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "bookings", operation: "listen bookings" });
      loadAdminDashboardData("bookings denied");
      setBookings([]);
    });

    //  FIX: holidays show properly (Timestamp/Date/string safe)
    const unsubHolidays = onSnapshot(tenantCollectionQuery(db, "holidays", dataAccessState, [], CALENDAR_ACCESS_OPTIONS), (snap) => {
      clearPagePermissionDenied();
      applyHolidayRows(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "holidays", operation: "listen holidays" });
      loadAdminDashboardData("holidays denied");
      setHolidays([]);
    });

    const unsubNotes = onSnapshot(tenantCollectionQuery(db, "notes", dataAccessState, [], CALENDAR_ACCESS_OPTIONS), (snap) => {
      const noteEvents = mapNoteDocsToCalendarEvents(snap.docs);
      setNotes(noteEvents);
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "notes", operation: "listen notes" });
      loadAdminDashboardData("notes denied");
      setNotes([]);
    });

    const unsubMaintenance = onSnapshot(
      tenantCollectionQuery(db, "maintenanceBookings", dataAccessState, [], CALENDAR_ACCESS_OPTIONS),
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMaintenanceBookings(raw);
      },
      (error) => {
        if (!handleFirestoreAccessError(error, { collectionName: "maintenanceBookings", operation: "listen maintenance bookings" })) {
          console.error("[maintenance] onSnapshot error:", error);
        }
        loadAdminDashboardData("maintenanceBookings denied");
        setMaintenanceBookings([]);
      }
    );
    const unsubMaintenanceJobs = onSnapshot(
      tenantCollectionQuery(db, "maintenanceJobs", dataAccessState, [], CALENDAR_ACCESS_OPTIONS),
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMaintenanceJobs(raw);
      },
      (error) => {
        if (!handleFirestoreAccessError(error, { collectionName: "maintenanceJobs", operation: "listen maintenance jobs" })) {
          console.error("[maintenanceJobs] onSnapshot error:", error);
        }
        loadAdminDashboardData("maintenanceJobs denied");
        setMaintenanceJobs([]);
      }
    );

    const unsubVehicles = onSnapshot(tenantCollectionQuery(db, "vehicles", dataAccessState, [], CALENDAR_ACCESS_OPTIONS), (snap) => {
      const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setVehiclesData((prev) => (sameVehicleSnapshotRows(prev, rows) ? prev : rows));
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "vehicles", operation: "listen vehicles" });
      loadAdminDashboardData("vehicles denied");
      setVehiclesData([]);
    });

    return () => {
      unsubBookings();
      unsubHolidays();
      unsubNotes();
      unsubVehicles();
      unsubMaintenance();
      unsubMaintenanceJobs();
    };
  }, [accessKey, applyHolidayRows, authReady, dataAccessState, loadAdminDashboardData, useAdminDashboardData]);

  useEffect(() => {
    if (useAdminDashboardData) {
      if (!authReady) return undefined;
      loadAdminDashboardData("admin account");
      return undefined;
    }
    if (!authReady || !canSeeDeletedOnCalendar) {
      setDeletedBookings([]);
      return;
    }
    const gate = resolveDataAccess(dataAccessState, CALENDAR_ACCESS_OPTIONS);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "deletedBookings", operation: "listen deleted bookings" });
      setDeletedBookings([]);
      return;
    }

    const unsubDeleted = onSnapshot(tenantCollectionQuery(db, "deletedBookings", dataAccessState, [], CALENDAR_ACCESS_OPTIONS), (snap) => {
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
    }, (error) => {
      handleFirestoreAccessError(error, { collectionName: "deletedBookings", operation: "listen deleted bookings" });
      loadAdminDashboardData("deletedBookings denied");
      setDeletedBookings([]);
    });

    return () => unsubDeleted();
  }, [accessKey, authReady, canSeeDeletedOnCalendar, dataAccessState, loadAdminDashboardData, useAdminDashboardData]);

  const fetchBookings = async () => {
    const snapshot = await getDocs(tenantCollectionQuery(db, "bookings", dataAccessState, [], CALENDAR_ACCESS_OPTIONS));
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    setBookings(data);
  };

  const fetchHolidays = async () => {
    const snapshot = await getDocs(tenantCollectionQuery(db, "holidays", dataAccessState, [], CALENDAR_ACCESS_OPTIONS));
    applyHolidayRows(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
  };

  const fetchNotes = async () => {
    const snapshot = await getDocs(tenantCollectionQuery(db, "notes", dataAccessState, [], CALENDAR_ACCESS_OPTIONS));
    const noteEvents = mapNoteDocsToCalendarEvents(snapshot.docs);
    setNotes(noteEvents);
  };

  useEffect(() => {
    if (!authReady) return;
    if (useAdminDashboardData) {
      loadAdminDashboardData("admin account");
      return;
    }
    const gate = resolveDataAccess(dataAccessState, CALENDAR_ACCESS_OPTIONS);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "equipment", operation: "read equipment options" });
      setEquipmentOptions([]);
      return;
    }
    getDocs(tenantCollectionQuery(db, "equipment", dataAccessState, [], CALENDAR_ACCESS_OPTIONS))
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
        if (!handleFirestoreAccessError(error, { collectionName: "equipment", operation: "read equipment options" })) {
          console.error("[equipment] load error:", error);
        }
        loadAdminDashboardData("equipment denied");
        setEquipmentOptions([]);
      });
  }, [accessKey, authReady, dataAccessState, loadAdminDashboardData, useAdminDashboardData]);

  //  minimal saveBooking so the existing modal doesn't crash if used
  const saveBooking = async (payload) => {
    try {
      await addDoc(collection(db, "bookings"), tenantPayload(dataAccessState, {
        ...payload,
        createdByUid: payload?.createdByUid || userUid || "",
        lastEditedByUid: payload?.lastEditedByUid || userUid || "",
        createdAt: new Date(),
      }, CALENDAR_ACCESS_OPTIONS));
      setShowModal(false);
      fetchBookings();
    } catch (err) {
      if (!handleFirestoreAccessError(err, { collectionName: "bookings", operation: "create booking" })) {
        console.error("Error saving booking:", err);
      }
      alert("Failed to save booking.");
    }
  };

  const maintenanceJobEvents = useMemo(
    () => buildMaintenanceJobEvents(maintenanceJobs),
    [maintenanceJobs]
  );

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

  const activeInspectionMetaByVehicle = useMemo(() => {
    const map = {};

    const bookingToDateKeys = (booking = {}) => {
      if (Array.isArray(booking.bookingDates) && booking.bookingDates.length) {
        return booking.bookingDates
          .map((value) => String(value || "").slice(0, 10))
          .filter(Boolean);
      }

      const appointmentISO = String(booking.appointmentDateISO || "").slice(0, 10);
      if (appointmentISO) return [appointmentISO];

      const startISO = String(booking.startDateISO || "").slice(0, 10);
      const endISO = String(booking.endDateISO || "").slice(0, 10);
      if (startISO && endISO) {
        const out = [];
        let cursor = parseLocalDate(startISO);
        const end = parseLocalDate(endISO);
        while (cursor && end && cursor.getTime() <= end.getTime()) {
          out.push(ymd(cursor));
          cursor = addDays(cursor, 1);
        }
        return out;
      }

      const start = parseLocalDate(booking.startDate || booking.appointmentDate || booking.date);
      const end = parseLocalDate(
        booking.endDate || booking.startDate || booking.appointmentDate || booking.date
      );
      if (!start || !end) return [];

      const out = [];
      let cursor = startOfLocalDay(start);
      const endDay = startOfLocalDay(end);
      while (cursor.getTime() <= endDay.getTime()) {
        out.push(ymd(cursor));
        cursor = addDays(cursor, 1);
      }
      return out;
    };

    (maintenanceBookings || []).forEach((booking) => {
      if (isInactiveMaintenanceBooking(booking.status)) return;
      if (String(booking.type || "").trim().toUpperCase() !== "INSPECTION") return;

      const vehicleId = String(booking.vehicleId || "").trim();
      if (!vehicleId) return;

      if (!map[vehicleId]) {
        map[vehicleId] = {
          sourceDueKeys: new Set(),
          sourceDueWeeks: new Set(),
          bookedWeeks: new Set(),
          bookings: [],
        };
      }

      const meta = map[vehicleId];
      const sourceDueKey = String(booking.sourceDueKey || "").trim();
      const sourceDueWeek = String(booking.sourceDueIsoWeek || "").trim();
      if (sourceDueKey) meta.sourceDueKeys.add(sourceDueKey);
      if (sourceDueWeek) meta.sourceDueWeeks.add(sourceDueWeek);

      bookingToDateKeys(booking).forEach((key) => {
        if (!key) return;
        meta.bookedWeeks.add(getIsoWeekLabel(key));
      });

      const firstKey = bookingToDateKeys(booking)[0] || "";
      meta.bookings.push({
        id: booking.id,
        firstDateKey: firstKey,
        firstDate: firstKey ? parseLocalDate(firstKey) : null,
      });
    });

    return map;
  }, [maintenanceBookings]);

  const inspectionRolloverSyncKey = useMemo(
    () => buildInspectionRolloverSyncKey(vehiclesData, maintenanceBookings),
    [vehiclesData, maintenanceBookings]
  );

  useEffect(() => {
    if (!vehiclesData.length || !maintenanceBookings.length) return;
    const syncState = rolloverSyncRef.current;
    if (syncState.inFlight || syncState.key === inspectionRolloverSyncKey) return;

    syncState.inFlight = true;
    syncEightWeekInspectionRollovers({
      db,
      vehicles: vehiclesData,
      maintenanceBookings,
      loggerPrefix: "[dashboard] inspection rollover",
    })
      .catch(() => {})
      .finally(() => {
        rolloverSyncRef.current.key = inspectionRolloverSyncKey;
        rolloverSyncRef.current.inFlight = false;
      });
  }, [inspectionRolloverSyncKey, maintenanceBookings, vehiclesData]);

  const motServiceDueEvents = useMemo(() => {
    if (!Array.isArray(vehiclesData) || !vehiclesData.length) return [];
    const out = [];
    const today = startOfLocalDay(new Date());
    const windowStart = addDays(today, -84);
    const windowEnd = addDays(today, 420);

    vehiclesData.forEach((v) => {
      if (isVehicleOutOfUse(v)) return;

      const vehicleId = String(v.id || "").trim();
      if (!vehicleId) return;

      const label = buildAssetLabel(v) || vehicleId;
      const motDue = getCanonicalDueDate(v, "mot");
      const serviceDue = getCanonicalDueDate(v, "service");
      const brakeTestDue = getCanonicalDueDate(v, "brakeTest");
      const pmiDue = getCanonicalDueDate(v, "pmi");
      const bookedMeta = maintenanceBookedMetaByVehicle[vehicleId] || null;

      if (motDue) {
        const motBooked = !!bookedMeta?.mot?.has;
        const motAppt = bookedMeta?.mot?.earliestAppt || null;
        const motAfterExpiry =
          motBooked && motAppt && motDue ? isApptAfterExpiry(motAppt, motDue) : false;
        out.push({
          id: `mot_due__${vehicleId}`,
          __collection: "vehicleDueDates",
          title: `${label} - MOT due${motBooked ? " (Booked)" : ""}`,
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
          title: `${label} - Service due${serviceBooked ? " (Booked)" : ""}`,
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

      const additionalAppointmentsByDate = [
        { key: "brake_test", due: brakeTestDue, label: "Brake test" },
        { key: "pmi", due: pmiDue, label: "PMI inspection" },
      ].reduce((acc, item) => {
        const dateKey = ymd(item.due);
        if (!dateKey) return acc;
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(item);
        return acc;
      }, {});

      Object.entries(additionalAppointmentsByDate).forEach(([dateKey, items]) => {
        const date = startOfLocalDay(dateKey);
        if (!date || !items.length) return;
        const appointmentLabel = `${items.map((item) => item.label).join(" / ")} appointment`;
        out.push({
          id: `additional_maintenance_appointment__${vehicleId}__${dateKey}__${items
            .map((item) => item.key)
            .join("_")}`,
          __collection: "vehicleDueDates",
          title: `${label} - ${appointmentLabel}`,
          start: date,
          end: startOfLocalDay(addDays(date, 1)),
          allDay: true,
          status: "Maintenance",
          kind: "MAINTENANCE_APPOINTMENT",
          vehicleId,
          appointmentDateISO: dateKey,
          booked: false,
          bookingStatus: "Appointment",
          maintenanceTypeLabel: appointmentLabel,
          maintenanceTypes: items.map((item) => item.label),
          requiresMaintenanceDocuments: true,
          requiresBrakeTestDocument: items.some((item) => item.key === "brake_test"),
          requiresPmiDocument: items.some((item) => item.key === "pmi"),
        });
      });

      const completedAppointmentsByDate = [
        {
          key: "brake_test",
          date: v.lastBrakeTest,
          label: "Brake test",
          completedAt: "",
        },
        {
          key: "pmi",
          date: v.lastPMI,
          label: "PMI inspection",
          completedAt: "",
        },
        ...(Array.isArray(v.brakeTestHistory) ? v.brakeTestHistory : []).map((item) => ({
          key: "brake_test",
          date: item?.completedDate,
          label: "Brake test",
          completedAt: item?.completedAt || "",
          documents: Array.isArray(item?.documents) ? item.documents : [],
        })),
        ...(Array.isArray(v.pmiHistory) ? v.pmiHistory : []).map((item) => ({
          key: "pmi",
          date: item?.completedDate,
          label: "PMI inspection",
          completedAt: item?.completedAt || "",
          documents: Array.isArray(item?.documents) ? item.documents : [],
        })),
      ].reduce((acc, item) => {
        const dateKey = ymd(item.date);
        if (!dateKey) return acc;
        if (!acc[dateKey]) acc[dateKey] = [];
        const existing = acc[dateKey].find((row) => row.key === item.key);
        if (existing) {
          existing.documents = [
            ...(Array.isArray(existing.documents) ? existing.documents : []),
            ...(Array.isArray(item.documents) ? item.documents : []),
          ];
          existing.completedAt = [existing.completedAt, item.completedAt].filter(Boolean).sort().at(-1) || "";
          return acc;
        }
        acc[dateKey].push(item);
        return acc;
      }, {});

      Object.entries(completedAppointmentsByDate).forEach(([dateKey, items]) => {
        const date = startOfLocalDay(dateKey);
        if (!date || !items.length) return;
        const appointmentLabel = `${items.map((item) => item.label).join(" / ")} appointment`;
        const documents = items.flatMap((item) => (Array.isArray(item.documents) ? item.documents : []));
        const brakeDocuments = items
          .filter((item) => item.key === "brake_test")
          .flatMap((item) => (Array.isArray(item.documents) ? item.documents : []));
        const pmiDocuments = items
          .filter((item) => item.key === "pmi")
          .flatMap((item) => (Array.isArray(item.documents) ? item.documents : []));
        out.push({
          id: `completed_additional_maintenance_appointment__${vehicleId}__${dateKey}__${items
            .map((item) => item.key)
            .join("_")}`,
          __collection: "vehicleDueDates",
          title: `${label} - ${appointmentLabel}`,
          start: date,
          end: startOfLocalDay(addDays(date, 1)),
          allDay: true,
          status: "Maintenance",
          kind: "MAINTENANCE_APPOINTMENT",
          vehicleId,
          appointmentDateISO: dateKey,
          booked: false,
          bookingStatus: "Completed",
          maintenanceTypeLabel: appointmentLabel,
          maintenanceTypes: items.map((item) => item.label),
          documents,
          hasMaintenanceDocuments: documents.length > 0,
          requiresMaintenanceDocuments: true,
          requiresBrakeTestDocument: items.some((item) => item.key === "brake_test"),
          requiresPmiDocument: items.some((item) => item.key === "pmi"),
          hasBrakeTestDocument: brakeDocuments.length > 0,
          hasPmiDocument: pmiDocuments.length > 0,
          completedAt: items.map((item) => item.completedAt).filter(Boolean).sort().at(-1) || dateKey,
        });
      });

      const inspectionAnchor =
        parseLocalDate(v.eightWeekInspectionStart) || parseLocalDate(v.nextEightWeekInspection);
      if (inspectionAnchor) {
        let occurrence = startOfLocalDay(inspectionAnchor);
        while (occurrence.getTime() < windowStart.getTime()) {
          occurrence = addWeeks(occurrence, 8);
        }

        const inspectionMeta = activeInspectionMetaByVehicle[vehicleId] || null;
        while (occurrence.getTime() <= windowEnd.getTime()) {
          const dueKey = ymd(occurrence);
          const isoLabel = getIsoWeekLabel(occurrence);
          const bookedBySource = !!inspectionMeta?.sourceDueKeys?.has(
            `inspection_due__${vehicleId}__${dueKey}`
          );
          const bookedInWeek = !!inspectionMeta?.bookedWeeks?.has(isoLabel);
          const bookedByWeekLink = !!inspectionMeta?.sourceDueWeeks?.has(isoLabel);
          const inspectionBooked = bookedBySource || bookedInWeek || bookedByWeekLink;
          const bookedOutsideWeek =
            inspectionBooked && bookedBySource && !bookedInWeek && !bookedByWeekLink;

          out.push({
            id: `inspection_due__${vehicleId}__${dueKey}`,
            __collection: "vehicleDueDates",
            title: `${label} - 8 week inspection due${
              inspectionBooked
                ? bookedOutsideWeek
                  ? " (Booked - Outside ISO Week)"
                  : " (Booked)"
                : ""
            }`,
            start: startOfLocalDay(occurrence),
            end: startOfLocalDay(addDays(occurrence, 1)),
            allDay: true,
            status: "Maintenance",
            kind: "INSPECTION",
            vehicleId,
            dueDate: startOfLocalDay(occurrence),
            booked: inspectionBooked,
            bookingStatus: inspectionBooked
              ? bookedOutsideWeek
                ? "Booked (Outside ISO Week)"
                : "Booked"
              : "",
            maintenanceTypeLabel: "8 WEEK INSPECTION",
            isoWeek: isoLabel,
          });

          occurrence = addWeeks(occurrence, 8);
        }
      }
    });

    return out;
  }, [vehiclesData, maintenanceBookedMetaByVehicle, activeInspectionMetaByVehicle]);

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
      const shouldShowRisk = isCurrentOrFutureJobEvent(ev);
      const risk = shouldShowRisk
        ? getVehicleRisk(normalizedVehicles, {
            offRoadTracking: Boolean(ev?.offRoadTracking),
          })
        : { risky: false, reasons: [] };
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
  }, [allEventsRaw, getVehicleRisk, normalizeVehicles, reccesByBooking]);

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

  const workCalendarEvents = useMemo(
    () => [...bankHolidays, ...workDiaryEvents],
    [bankHolidays, workDiaryEvents]
  );

  const noteHolidayEvents = useMemo(
    () => [
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
    ],
    [holidays, notes]
  );

  const maintenanceEvents = useMemo(() => {
    const vehicleById = Object.fromEntries(
      (vehiclesData || []).map((vehicle) => [String(vehicle.id || "").trim(), vehicle])
    );

    const enrichedMaintenance = allEvents
      .filter((e) => e.status === "Maintenance")
      .map((event) => {
        if (event?.__collection !== "maintenanceBookings") return event;
        const vehicle = vehicleById[String(event?.vehicleId || "").trim()] || null;
        const vehicleMotDue = vehicle ? ymd(getCanonicalDueDate(vehicle, "mot")) : "";
        const vehicleServiceDue = vehicle ? ymd(getCanonicalDueDate(vehicle, "service")) : "";
        const fallbackMotDate =
          vehicleMotDue ||
          event?.nextMOT ||
          addWeeksToLocalDate(
            vehicle?.lastMOT ||
              event?.completedDate ||
              event?.completedAt ||
              event?.appointmentDateISO ||
              event?.startDateISO ||
              event?.date ||
              event?.__occurrence ||
              event?.start,
            52
          );
        if (!vehicle) {
          return {
            ...event,
            nextMOT: event?.kind === "MOT_BOOKING" ? fallbackMotDate : event?.nextMOT || "",
          };
        }

        return {
          ...event,
          nextMOT: event?.kind === "MOT_BOOKING" ? fallbackMotDate : vehicle?.nextMOT || event?.nextMOT || "",
          nextService: vehicleServiceDue || event?.nextService || "",
        };
      });

    return [...enrichedMaintenance, ...motServiceDueEvents];
  }, [allEvents, motServiceDueEvents, vehiclesData]);

  const maintenanceDraggableAccessor = useCallback(
    (event) =>
      (event?.__collection === "maintenanceBookings" && Boolean(event?.__parentId || event?.id)) ||
      (event?.kind === "MAINTENANCE_APPOINTMENT" &&
        event?.vehicleId &&
        !["completed", "complete"].includes(String(event?.bookingStatus || "").trim().toLowerCase())),
    []
  );

  const handleMaintenanceEventDrop = useCallback(
    async ({ event, start }) => {
      if (event?.kind === "MAINTENANCE_APPOINTMENT") {
        const vehicleId = String(event?.vehicleId || "").trim();
        const dropChange = buildVehicleMaintenanceAppointmentDropUpdates(event, start);
        if (!vehicleId || !dropChange?.updates) {
          alert("Could not identify this vehicle appointment to move.");
          return;
        }

        setPendingMaintenanceDrop({
          targetCollection: "vehicles",
          vehicleId,
          title: String(event?.title || event?.maintenanceTypeLabel || "this appointment").trim(),
          fromLabel: formatDropConfirmRange([...dropChange.movedDateKeys].filter(Boolean)),
          toLabel: formatDropConfirmRange(dropChange.movedNextDateKeys || [ymd(start)].filter(Boolean)),
          updates: dropChange.updates,
        });
        return;
      }

      if (event?.__collection !== "maintenanceBookings") {
        alert("Only saved maintenance bookings can be moved. Due-date reminders stay fixed to the vehicle schedule.");
        return;
      }

      const bookingId = String(event.__parentId || event.id || "").trim();
      if (!bookingId) {
        alert("Could not identify the maintenance booking to move.");
        return;
      }

      const existingBooking =
        (maintenanceBookings || []).find((booking) => String(booking?.id || "") === bookingId) || event;
      const dropChange = buildMaintenanceBookingDropUpdates(existingBooking, event, start);
      if (!dropChange?.updates) return;

      const title = String(event?.title || existingBooking?.title || existingBooking?.jobNumber || "this booking").trim();
      const fromDates = dropChange.movedDateKeys
        ? [...dropChange.movedDateKeys]
        : [ymd(event?.start)].filter(Boolean);
      const toDates = dropChange.movedNextDateKeys?.length
        ? dropChange.movedNextDateKeys
        : [ymd(start)].filter(Boolean);
      setPendingMaintenanceDrop({
        targetCollection: "maintenanceBookings",
        bookingId,
        title,
        fromLabel: formatDropConfirmRange(fromDates),
        toLabel: formatDropConfirmRange(toDates),
        updates: dropChange.updates,
      });
    },
    [maintenanceBookings]
  );

  const cancelPendingMaintenanceDrop = useCallback(() => {
    setPendingMaintenanceDrop(null);
  }, []);

  const confirmPendingMaintenanceDrop = useCallback(async () => {
    if (!pendingMaintenanceDrop?.updates) return;

    if (pendingMaintenanceDrop.targetCollection === "vehicles") {
      const vehicleId = String(pendingMaintenanceDrop.vehicleId || "").trim();
      if (!vehicleId) return;

      const previousVehicles = vehiclesData;
      const optimisticUpdates = { ...pendingMaintenanceDrop.updates, updatedAt: new Date().toISOString() };
      setPendingMaintenanceDrop((current) => (current ? { ...current, saving: true } : current));
      setVehiclesData((current) =>
        (current || []).map((vehicle) =>
          String(vehicle?.id || "") === vehicleId ? { ...vehicle, ...optimisticUpdates } : vehicle
        )
      );

      try {
        await updateDoc(doc(db, "vehicles", vehicleId), pendingMaintenanceDrop.updates);
        setPendingMaintenanceDrop(null);
      } catch (error) {
        console.error("Failed to move vehicle maintenance appointment:", error);
        setVehiclesData(previousVehicles);
        setPendingMaintenanceDrop((current) => (current ? { ...current, saving: false } : current));
        alert(error?.message || "Could not move this vehicle maintenance appointment.");
      }
      return;
    }

    if (!pendingMaintenanceDrop?.bookingId) return;

    const { bookingId, updates } = pendingMaintenanceDrop;
    const previousBookings = maintenanceBookings;
    const optimisticUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setPendingMaintenanceDrop((current) => (current ? { ...current, saving: true } : current));
    setMaintenanceBookings((current) =>
      (current || []).map((booking) =>
        String(booking?.id || "") === bookingId ? { ...booking, ...optimisticUpdates } : booking
      )
    );

    try {
      await updateDoc(doc(db, "maintenanceBookings", bookingId), updates);
      setPendingMaintenanceDrop(null);
    } catch (error) {
      console.error("Failed to move maintenance booking:", error);
      setMaintenanceBookings(previousBookings);
      setPendingMaintenanceDrop((current) => (current ? { ...current, saving: false } : current));
      alert(error?.message || "Could not move this maintenance booking.");
    }
  }, [maintenanceBookings, pendingMaintenanceDrop, vehiclesData]);

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
  const getSearchBookingAnchorDate = (booking) => {
    if (Array.isArray(booking?.bookingDates) && booking.bookingDates.length) {
      const first = booking.bookingDates
        .map((value) => toJsDate(value))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (first) return first;
    }

    return (
      toJsDate(booking?.startDate) ||
      toJsDate(booking?.date) ||
      toJsDate(booking?.endDate) ||
      null
    );
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
      <style>{dashboardCalendarCss}</style>
      <div style={pageWrap} className="dashboard-page">
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Dashboard</h1>
          </div>
          <div style={headerActions}>
            <div style={headerSearchWrap}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: UI.muted,
                  pointerEvents: "none",
                }}
              />
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
                    border: UI.border,
                    borderRadius: UI.radiusSm,
                    boxShadow: UI.shadowHover,
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
                          const anchorDate = getSearchBookingAnchorDate(booking);
                          if (anchorDate) {
                            setCalendarView("week");
                            setCurrentDate(anchorDate);
                          }
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
                          {formatSearchBookingDates(booking)} - {formatSearchBookingVehicles(booking)} - {booking.location || "No location"}
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
              <FileText size={14} />
              Drafts
            </button>
            <button
              style={isRestricted ? btnDisabled(btn("ghost")) : btn("ghost")}
              type="button"
              onClick={() => {
                if (isRestricted) return;
                router.push("/enquiry");
              }}
              aria-disabled={isRestricted}
              title={isRestricted ? "Your account is not allowed to create enquiries" : ""}
            >
              <Plus size={14} />
              Enquiries
            </button>
            <button
              style={btn("ghost")}
              type="button"
              onClick={() => router.push("/preplist-dashboard")}
            >
              <ClipboardList size={14} />
              Prep Dashboard
            </button>
            <button
              style={btn("ghost")}
              type="button"
              onClick={() => router.push("/stunt-prep")}
            >
              <Wrench size={14} />
              Stunt Prep
            </button>
            {canSeeDeletedOnCalendar && (
              <button
                style={showDeletedInView ? btn("ghost") : btn("danger")}
                onClick={() => setShowDeletedInView((v) => !v)}
                type="button"
              >
                {showDeletedInView ? <EyeOff size={14} /> : <Eye size={14} />}
                {showDeletedInView ? "Hide Deleted" : "Show Deleted"}
              </button>
            )}
            <button
              style={showInactiveInView ? btn("ghost") : btn("danger")}
              onClick={() => setShowInactiveInView((v) => !v)}
              type="button"
            >
              {showInactiveInView ? <EyeOff size={14} /> : <Eye size={14} />}
              {showInactiveInView ? "Hide Inactive" : "Show Inactive"}
            </button>
            {bookingSaved && (
              <div style={successBanner}>
                <Check size={14} strokeWidth={3} />
                Booking saved successfully.
              </div>
            )}
          </div>
        </div>

        {/* Work Diary */}
        <section ref={workDiarySectionRef} style={{ ...card, position: "relative" }}>
          <div style={sectionHeader}>
            <div style={sectionTitleWrap}>
              <div style={iconBox(UI.brand, UI.brandSoft)}>
                <CalendarDays size={17} />
              </div>
              <div>
                <h2 style={titleMd}>Work Diary</h2>
                <div style={hint}>Bookings, bank holidays and operational visibility.</div>
              </div>
              <button
                style={btn("ghost")}
                onClick={() => {
                  const today = new Date();
                  setCurrentDate(today);
                  setMaintenanceDate(today);
                }}
                type="button"
              >
                <CalendarDays size={14} />
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
                <ChevronLeft size={14} />
                Previous Week
              </button>

              <button
                style={btn("ghost")}
                onClick={() => {
                  setCurrentDate((prev) => shiftByDays(prev, 7));
                  setMaintenanceDate((prev) => shiftByDays(prev, 7));
                }}
                type="button"
              >
                Next Week
                <ChevronRight size={14} />
              </button>

              <button
                style={
                  isRestricted
                    ? btnDisabled(btn())
                    : createBookingOpening
                      ? { ...btn(), opacity: 0.82, cursor: "wait" }
                      : btn()
                }
                onClick={goToCreateBooking}
                disabled={isRestricted || createBookingOpening || createEnquiryOpening}
                aria-disabled={isRestricted || createBookingOpening || createEnquiryOpening}
                title={isRestricted ? "Your account is not allowed to create bookings" : ""}
                type="button"
              >
                <Plus size={14} />
                {createBookingOpening ? `Opening ${createBookingProgress}%` : "Add Booking"}
              </button>

              <button
                style={
                  isRestricted
                    ? btnDisabled(btn())
                    : createEnquiryOpening
                      ? { ...btn(), opacity: 0.82, cursor: "wait" }
                      : btn()
                }
                onClick={goToCreateEnquiry}
                disabled={isRestricted || createBookingOpening || createEnquiryOpening}
                aria-disabled={isRestricted || createBookingOpening || createEnquiryOpening}
                title={isRestricted ? "Your account is not allowed to create enquiries" : ""}
                type="button"
              >
                <Plus size={14} />
                {createEnquiryOpening ? `Opening ${createEnquiryProgress}%` : "Add Enquiry"}
              </button>

              <button
                style={isRestricted ? btnDisabled(btn()) : btn()}
                onClick={goToCreateMaintenance}
                aria-disabled={isRestricted}
                title={isRestricted ? "Your account is not allowed to create maintenance" : ""}
                type="button"
              >
                <Plus size={14} />
                Add Maintenance
              </button>

              <div style={{ ...chip, color: UI.brand }}>
                {currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
            </div>
          </div>

          <BigCalendar
              localizer={localizer}
              //  include bank holidays in Work Diary
              events={workCalendarEvents}
              view={calendarView}
              views={["week", "month"]}
              onView={(v) => setCalendarView((prev) => (prev === v ? prev : v))}
              date={currentDate}
              onNavigate={(d) => setCurrentDate((prev) => (sameCalendarDate(prev, d) ? prev : d))}
              onSelectSlot={({ start }) => {
                setEditingNoteId(null);
                const d = start instanceof Date ? start : new Date(start);
                setCreateNoteDate(ymd(d));
                setNoteModalOpen(true);
              }}
              selectable
              startAccessor="start"
              endAccessor="end"
              popup
              allDayAccessor={allDayTrue}
              allDaySlot
              dayLayoutAlgorithm="no-overlap"
              toolbar={false}
              nowIndicator={false}
              getNow={getCalendarNow}
              formats={dashboardCalendarFormats}
              className={calendarView === "week" ? "dashboard-compact-calendar" : "dashboard-month-calendar"}
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
                      ? "rgba(31,75,122,0.12)"
                      : isBankHoliday
                      ? "rgba(103,128,157,0.08)"
                      : undefined,
                    border: isToday
                      ? "1px solid rgba(31,75,122,0.34)"
                      : isBankHoliday
                      ? "1px dashed rgba(103,128,157,0.38)"
                      : undefined,
                  },
                };
              }}
              style={calendarView === "week" ? compactCalendarFrame : monthCalendarFrame}
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
                  setNoteModalOpen(true);
                  return;
                }

                const bookingId = e.__bookingId || e.id;
                if (bookingId) {
                  if (e.__collection === "deletedBookings") {
                    setSelectedDeletedId(e.__deletedDocId || bookingId);
                    setSelectedBookingId(bookingId);
                  } else {
                    setSelectedDeletedId(null);
                    setSelectedBookingId(bookingId);
                  }
                }
              }}
              components={{ event: (props) => <CalendarEvent {...props} onViewQuote={openQuoteViewer} /> }}
              eventPropGetter={(event) => {
              //  bank holiday styling
              if (event.status === "Bank Holiday") {
                const bankHolidayBorder = getWorkDiaryBorder("Bank Holiday", "#9eb0c6");
                return {
                  style: {
                    backgroundColor: "#e9eef5",
                    color: "#314257",
                    fontWeight: 800,
                    padding: 0,
                    borderRadius: 8,
                    border: `1px dashed ${bankHolidayBorder}`,
                    borderLeft: `6px solid ${bankHolidayBorder}`,
                    boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
                    pointerEvents: "none", //  doesn't steal clicks from jobs
                  },
                };
              }

              const status = normalizeStatusLabel(event.status || "Confirmed");
              const tone = getStatusStyle(status);
              let bg = tone.bg;
              let text = tone.text;
              let border = getWorkDiaryBorder(status, tone.border);

              let risky = !!event.isRisky;
              if (!("isRisky" in event) && Array.isArray(event.vehicles)) {
                risky = getVehicleRisk(event.vehicles, {
                  offRoadTracking: Boolean(event?.offRoadTracking),
                }).risky;
              }

              if (risky) {
              }

              const shoot = String(event.shootType || "").toLowerCase();
              const bookingStatuses = new Set([
                "confirmed",
                "first pencil",
                "second pencil",
                "action required",
                "dnh",
              ]);

              if (!risky && bookingStatuses.has((status || "").toLowerCase()) && shoot === "night") {
                bg = NIGHT_SHOOT_STYLE.bg;
                text = NIGHT_SHOOT_STYLE.text;
                border = getWorkDiaryBorder(status, NIGHT_SHOOT_STYLE.border);
                return {
                  style: {
                    backgroundColor: bg,
                    color: text,
                    fontWeight: 700,
                    padding: 0,
                    borderRadius: 8,
                    border: `1px solid ${border}`,
                    borderLeft: `6px solid ${border}`,
                    boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
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
                  borderLeft: `6px solid ${border}`,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
                },
              };
              }}
            />
        </section>

        {/* Maintenance Calendar */}
        <section style={card}>
          <div style={sectionHeader}>
            <div style={sectionTitleWrap}>
              <div style={iconBox("#8b5e3c", UI.accentSoft)}>
                <Wrench size={17} />
              </div>
              <div>
                <h2 style={titleMd}>Maintenance Calendar</h2>
                <div style={hint}>MOT, service, maintenance bookings and active workshop activity.</div>
              </div>
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

          <DraggableBigCalendar
            localizer={localizer}
            events={maintenanceEvents}
            view={maintenanceView}
            views={["week", "month"]}
            onView={(v) => setMaintenanceView((prev) => (prev === v ? prev : v))}
            date={maintenanceDate}
            onNavigate={(d) => setMaintenanceDate((prev) => (sameCalendarDate(prev, d) ? prev : d))}
            startAccessor="start"
            endAccessor="end"
            allDayAccessor={allDayTrue}
            allDaySlot
            selectable={false}
            resizable={false}
            draggableAccessor={maintenanceDraggableAccessor}
            onEventDrop={handleMaintenanceEventDrop}
            popup
            showAllEvents
            toolbar={false}
            nowIndicator={false}
            getNow={getCalendarNow}
            components={{ event: MaintenanceCalendarEvent }}
            onSelectEvent={(e) => {
              if (!e) return;
              if (e.__collection === "maintenanceJobs") {
                router.push(`/maintenance-jobs?jobId=${encodeURIComponent(e.id)}`);
                return;
              }
              setSelectedMaintenanceEvent(e);
            }}
            eventPropGetter={maintenanceEventPropGetter}
            className={maintenanceView === "week" ? "dashboard-compact-calendar" : "dashboard-month-calendar"}
            dayPropGetter={(date) => {
              const todayD = new Date();
              const isToday =
                date.getDate() === todayD.getDate() &&
                date.getMonth() === todayD.getMonth() &&
                date.getFullYear() === todayD.getFullYear();

              return {
                style: {
                  backgroundColor: isToday ? "rgba(139,94,60,0.12)" : undefined,
                  border: isToday ? "1px solid rgba(139,94,60,0.34)" : undefined,
                },
              };
            }}
            style={maintenanceView === "week" ? compactCalendarFrame : monthCalendarFrame}
          />

          {selectedMaintenanceEvent && (
            <DashboardMaintenanceModal
              event={selectedMaintenanceEvent}
              onClose={() => setSelectedMaintenanceEvent(null)}
            />
          )}

          {pendingMaintenanceDrop && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(2,6,23,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 120,
                padding: 18,
              }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !pendingMaintenanceDrop.saving) {
                  cancelPendingMaintenanceDrop();
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="maintenance-drop-confirm-title"
                style={{
                  ...surface,
                  width: 520,
                  maxWidth: "94vw",
                  padding: 0,
                  overflow: "hidden",
                  boxShadow: "0 24px 70px rgba(2,6,23,0.28)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    borderBottom: UI.border,
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={iconBox("#8b5e3c", UI.accentSoft)}>
                      <Wrench size={17} />
                    </div>
                    <h3 id="maintenance-drop-confirm-title" style={{ margin: 0, fontSize: 16, fontWeight: 950, color: UI.text }}>
                      Confirm Date Change
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={cancelPendingMaintenanceDrop}
                    disabled={pendingMaintenanceDrop.saving}
                    aria-label="Cancel date change"
                    style={{
                      ...btn("ghost"),
                      width: 34,
                      height: 34,
                      padding: 0,
                      opacity: pendingMaintenanceDrop.saving ? 0.55 : 1,
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={{ padding: 16 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45, color: UI.text, fontWeight: 750 }}>
                    You changed the date of this occurrence of{" "}
                    <span style={{ fontWeight: 950 }}>&quot;{pendingMaintenanceDrop.title}&quot;</span>.
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <div style={{ border: UI.border, borderRadius: UI.radius, padding: 10, background: "#fff" }}>
                      <div style={labelTiny}>From</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: UI.text }}>{pendingMaintenanceDrop.fromLabel}</div>
                    </div>
                    <div style={{ border: UI.border, borderRadius: UI.radius, padding: 10, background: "#f8fbfe" }}>
                      <div style={labelTiny}>To</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: UI.text }}>{pendingMaintenanceDrop.toLabel}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, fontSize: 12.5, lineHeight: 1.45, color: UI.muted, fontWeight: 700 }}>
                    To change all dates, open the series.
                  </div>
                  <div style={{ marginTop: 10, fontSize: 14, color: UI.text, fontWeight: 900 }}>
                    Do you want to change just this one?
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    padding: "12px 16px",
                    borderTop: UI.border,
                    background: "#f8fafc",
                  }}
                >
                  <button
                    type="button"
                    onClick={cancelPendingMaintenanceDrop}
                    disabled={pendingMaintenanceDrop.saving}
                    style={{
                      ...btn("ghost"),
                      opacity: pendingMaintenanceDrop.saving ? 0.55 : 1,
                      cursor: pendingMaintenanceDrop.saving ? "not-allowed" : "pointer",
                    }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={confirmPendingMaintenanceDrop}
                    disabled={pendingMaintenanceDrop.saving}
                    style={{
                      ...btn(),
                      opacity: pendingMaintenanceDrop.saving ? 0.82 : 1,
                      cursor: pendingMaintenanceDrop.saving ? "wait" : "pointer",
                    }}
                  >
                    {pendingMaintenanceDrop.saving ? "Saving..." : "Yes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Holiday + Notes Calendar */}
        <section style={card}>
          <div style={sectionHeader}>
            <div style={sectionTitleWrap}>
              <div style={iconBox("#7c3aed", "#f5f3ff")}>
                <StickyNote size={17} />
              </div>
              <div>
                <h2 style={titleMd}>Holiday + Notes Calendar</h2>
                <div style={hint}>Shared leave and note visibility in one place.</div>
              </div>
            </div>
            <div style={sectionActions}>
              <button style={btn()} type="button" onClick={() => setHolidayModalOpen(true)}>
                <Plus size={14} />
                Add Holiday
              </button>
              <button style={btn()} type="button" onClick={() => router.push("/shift-change")}>
                <Clock3 size={14} />
                Shift Change
              </button>
              <button style={btn()} type="button" onClick={() => setCreateNoteOpen(true)}>
                <Plus size={14} />
                Add Note
              </button>
            </div>
          </div>

          <BigCalendar
            localizer={localizer}
            events={noteHolidayEvents}
            view={calendarView}
            views={["week", "month"]}
            onView={(v) => setCalendarView((prev) => (prev === v ? prev : v))}
            date={currentDate}
            onNavigate={(d) => setCurrentDate((prev) => (sameCalendarDate(prev, d) ? prev : d))}
            selectable
            startAccessor="start"
            endAccessor="end"
            popup
            allDayAccessor={allDayTrue}
            dayLayoutAlgorithm="overlap"
            toolbar={false}
            nowIndicator={false}
            getNow={getCalendarNow}
            onSelectEvent={(e) => {
              if (e.status === "Holiday") {
                setEditingHolidayId(e.id);
              } else if (e.status === "Note") {
                setEditingNoteId(e.id);
                setNoteModalOpen(true);
              }
            }}
            className={calendarView === "week" ? "dashboard-compact-calendar" : ""}
            style={calendarView === "week" ? compactCalendarFrame : calendarFrame}
            components={{
              event: HolidayNotesCalendarEvent,
            }}
            eventPropGetter={holidayNotesEventPropGetter}
            dayPropGetter={() => ({
              style: {
                borderRight: "1px solid #e5e7eb",
                borderTop: "1px solid #e5e7eb",
              },
            })}
          />
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
                Add Booking for {selectedDate?.toLocaleDateString("en-GB")}
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
                    minHeight: 36,
                    padding: "7px 9px",
                    borderRadius: UI.radiusSm,
                    border: UI.border,
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
                    minHeight: 36,
                    padding: "7px 9px",
                    borderRadius: UI.radiusSm,
                    border: UI.border,
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
              defaultDate={ymd(new Date())}
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
      {noteModalOpen &&
        (editingNoteId ? (
          <EditNoteModal
            id={editingNoteId}
            onClose={() => {
              setNoteModalOpen(false);
              setEditingNoteId(null);
              fetchNotes();
            }}
          />
        ) : (
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
            <CreateNote
              defaultDate={createNoteDate || ""}
              onClose={() => {
                setNoteModalOpen(false);
                setCreateNoteDate("");
              }}
              onSaved={() => {
                setNoteModalOpen(false);
                setCreateNoteDate("");
                fetchNotes();
              }}
            />
          </div>
        ))}

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
          initialBooking={selectedBooking}
          initialVehicles={vehiclesData}
          onEdit={goToEditBooking}
          onClose={handleCloseBookingModal}
        />
      )}
      <QuoteDashboardOverlay
        viewer={quoteViewer}
        onClose={() => setQuoteViewer(null)}
        onMove={moveQuoteViewer}
      />
      {createBookingOpening && (
        <RouteLoadingOverlay
          progress={createBookingProgress}
          title="Opening create booking"
          hint="Preparing booking form..."
        />
      )}
      {createEnquiryOpening && (
        <RouteLoadingOverlay
          progress={createEnquiryProgress}
          title="Opening create enquiry"
          hint="Preparing enquiry form..."
        />
      )}
    </HeaderSidebarLayout>
  );
}
