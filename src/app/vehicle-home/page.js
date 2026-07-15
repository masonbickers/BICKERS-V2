"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  Car,
  CheckCircle2,
  ClipboardCheck,
  History,
  ListChecks,
  FileText,
  Plus,
  ShieldAlert,
  Wrench,
  X,
} from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { localizer } from "../utils/localizer";
import {
  getCanonicalDueDate,
  getIsoWeekLabel,
  isVehicleOutOfUse,
  normalizeAssetRecord,
  ymd as ymdDate,
} from "../utils/maintenanceSchema";
import {
  buildBookedMetaByVehicle,
  buildMaintenanceBookingEvents,
  buildMaintenanceJobEvents,
  buildVehicleDueEvents,
  getMaintenanceDisplayType,
  isInactiveMaintenanceBooking,
  startOfLocalDay,
} from "../utils/maintenanceCalendar";
import { syncEightWeekInspectionRollovers } from "../utils/inspectionRollover";
import { calendarDayDifference } from "../utils/dateNormalization.mjs";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DashboardMaintenanceModal from "@/app/components/DashboardMaintenanceModal";
import { useAuth } from "@/app/context/authContext";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
} from "@/app/utils/firestoreAccess";
import {
  getDocs,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";

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

const VEHICLE_CHECK_PATH = "/vehicle-checks";
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;

const handlePageFirestoreError = (error, { collectionName = "", operation = "Firestore access" } = {}) => {
  if (handleFirestoreAccessError(error, { collectionName, operation })) {
    console.warn(`${operation} denied for ${collectionName || "Firestore"}:`, error);
    return true;
  }
  return false;
};

// Routes for new tiles
const GENERAL_DEFECTS_PATH = "/defects/general";
const IMMEDIATE_DEFECTS_PATH = "/defects/immediate";
const DECLINED_DEFECTS_PATH = "/defects/declined";
const MAINTENANCE_JOBS_PATH = "/maintenance-jobs";
const ACTIVITY_HISTORY_PATH = "/vehicle-activity";
const VEHICLE_EDIT_PATH = (id) => `/vehicle-edit/${encodeURIComponent(id)}`;
const VEHICLE_SERVICE_HISTORY_PATH = (vehicleId, serviceId) =>
  `/vehicle-edit/${encodeURIComponent(vehicleId)}/service-history/${encodeURIComponent(serviceId)}`;

/* -------------------------------------------
   Mini design system (MATCHES YOUR EMPLOYEES PAGE)
------------------------------------------- */
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
  danger: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
  width: "100%",
  maxWidth: "100%",
  overflowX: "hidden",
};
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
  minWidth: 0,
};
const h1 = {
  color: UI.text,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: 0,
  margin: 0,
};
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
  minWidth: 0,
};
const cardBase = {
  ...surface,
  padding: 12,
  background: "#ffffff",
  transition:
    "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};
const cardHover = {
  transform: "translateY(-2px)",
  boxShadow: UI.shadowHover,
  borderColor: UI.brandBorder,
};

const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
  minWidth: 0,
});

const commandGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: UI.gap,
  alignItems: "stretch",
  marginBottom: UI.gap,
  minWidth: 0,
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  minWidth: 0,
};

const opsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
  minWidth: 0,
};

const quickLinkGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
  alignItems: "stretch",
  minWidth: 0,
};

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
  minWidth: 0,
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: "-0.01em" };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };
const sectionTag = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const chip = {
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const chipSoft = {
  ...chip,
  background: UI.brandSoft,
  borderColor: UI.brandBorder,
  color: UI.brand,
};

const badge = (bg, fg) => ({
  padding: "4px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: bg,
  color: fg,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
  lineHeight: "18px",
});
const metricCard = {
  ...surface,
  padding: "12px",
  minWidth: 0,
};
const premiumSection = {
  ...cardBase,
  border: "1px solid #d7e1ea",
  boxShadow: "0 10px 26px rgba(15,23,42,0.05)",
  maxWidth: "100%",
  minWidth: 0,
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

const vehicleHomeCalendarCss = `
.vehicle-home-page .rbc-calendar {
  font-family: Inter, system-ui, Arial, sans-serif;
  color: ${UI.text};
  font-size: 12px;
}
.vehicle-home-page .rbc-time-view,
.vehicle-home-page .rbc-month-view {
  border: 0;
  background: #fff;
}
.vehicle-home-page .rbc-header {
  padding: 7px 8px;
  background: #f6f8fb;
  color: ${UI.muted};
  font-size: 11.5px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0;
  border-color: #e3eaf2;
}
.vehicle-home-page .rbc-date-cell {
  padding: 5px 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}
.vehicle-home-page .rbc-month-row,
.vehicle-home-page .rbc-day-bg,
.vehicle-home-page .rbc-time-content,
.vehicle-home-page .rbc-timeslot-group {
  border-color: #e6edf5;
}
.vehicle-home-page .rbc-off-range-bg {
  background: #f8fafc;
}
.vehicle-home-page .rbc-today {
  background: rgba(31,75,122,0.08);
}
.vehicle-home-page .rbc-event {
  min-height: 22px;
}
.vehicle-home-page .rbc-row-segment {
  padding: 1px 2px;
}
.vehicle-home-page .rbc-event-label {
  display: none;
}
.vehicle-home-page .rbc-show-more {
  color: ${UI.brand};
  font-weight: 900;
  font-size: 12px;
  background: transparent;
}
.vehicle-home-page .dashboard-compact-calendar {
  height: auto !important;
  min-height: 0 !important;
}
.vehicle-home-page .dashboard-compact-calendar .rbc-time-content {
  display: none;
}
.vehicle-home-page .dashboard-compact-calendar .rbc-time-view {
  min-height: 0;
}
.vehicle-home-page .dashboard-compact-calendar .rbc-time-header {
  border-bottom: 0;
}
.vehicle-home-page .dashboard-compact-calendar .rbc-time-header-content,
.vehicle-home-page .dashboard-compact-calendar .rbc-row-content,
.vehicle-home-page .dashboard-compact-calendar .rbc-row,
.vehicle-home-page .dashboard-compact-calendar .rbc-allday-cell {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}
.vehicle-home-page .dashboard-compact-calendar .rbc-allday-cell {
  min-height: 96px;
}
.vehicle-home-page .dashboard-month-calendar {
  height: auto !important;
  min-height: 620px !important;
  overflow: visible !important;
}
.vehicle-home-page .dashboard-month-calendar .rbc-month-view {
  display: block;
  height: auto !important;
  overflow: visible !important;
}
.vehicle-home-page .dashboard-month-calendar .rbc-month-row {
  display: block;
  min-height: 120px;
  height: auto !important;
  overflow: visible !important;
}
.vehicle-home-page .dashboard-month-calendar .rbc-row-bg {
  inset: 0;
  min-height: 120px;
}
.vehicle-home-page .dashboard-month-calendar .rbc-row-content {
  min-height: 120px;
  height: auto !important;
  overflow: visible !important;
  padding-bottom: 8px;
}
.vehicle-home-page .dashboard-month-calendar .rbc-row {
  min-height: 0;
  height: auto !important;
  overflow: visible !important;
}
.vehicle-home-page .dashboard-month-calendar .rbc-event {
  height: auto !important;
}
`;

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
      letterSpacing: "0.01em",
    };
  }
  if (kind === "pill") {
    return {
      padding: "5px 8px",
      borderRadius: 999,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontSize: 12,
      lineHeight: 1.2,
      boxShadow: "0 4px 10px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
      letterSpacing: "0.01em",
    };
  }
  return {
      padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
    letterSpacing: "0.01em",
  };
};

const inputBase = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 12,
  border: "1px solid #dbe2ea",
  outline: "none",
  fontSize: 13.5,
  background: "#fff",
};

const divider = { height: 1, background: "#dde5ee", margin: "12px 0 0" };

const modal = {
  position: "fixed",
  top: 110,
  left: "50%",
  transform: "translateX(-50%)",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  padding: 14,
  boxShadow: UI.shadowHover,
  zIndex: 1000,
  width: "min(92vw, 560px)",
};

const table = { width: "100%", borderCollapse: "collapse" };
const thtd = {
  padding: "11px 12px",
  fontSize: 13,
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};

const actionBtn = (kind = "ghost") => {
  if (kind === "approve") {
    return {
      ...btn("pill"),
      borderColor: "#bbf7d0",
      background: "#ecfdf5",
      color: "#065f46",
    };
  }
  if (kind === "decline") {
    return {
      ...btn("pill"),
      borderColor: "#fecaca",
      background: "#fef2f2",
      color: "#991b1b",
    };
  }
  return { ...btn("pill") };
};

/* ----------------- Date helpers ----------------- */
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

//  Parse YYYY-MM-DD as LOCAL (avoids UTC date shift)
const parseLocalDateOnly = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const monthRange = (d) => {
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { monthStart, monthEnd };
};

const daysInRange = (from, to) => {
  if (!from || !to) return [];
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const out = [];
  for (let d = a; d <= b; d.setDate(d.getDate() + 1)) out.push(dateKey(d));
  return out;
};

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysUntil = (d) => calendarDayDifference(d);

const sameCalendarDate = (a, b) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const getCalendarNow = () => new Date(2000, 0, 1);
const allDayTrue = () => true;

const diffCalendarDays = (from, to) => {
  const fromDay = startOfLocalDay(from);
  const toDay = startOfLocalDay(to);
  if (!fromDay || !toDay) return 0;
  return Math.round((toDay.getTime() - fromDay.getTime()) / 86400000);
};

const shiftYmd = (value, deltaDays) => {
  const date = startOfLocalDay(value);
  if (!date) return "";
  return ymdDate(addDays(date, deltaDays));
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
  const date = startOfLocalDay(value);
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
  if (!currentStart || !targetStart) return null;

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
        : [event?.__occurrence || ymdDate(currentStart)]
    );
    movedDateKeys = new Set(eventDates.length ? eventDates : [ymdDate(currentStart)]);
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
    const first = ymdDate(targetStart);
    const last = ymdDate(addDays(targetStart, durationDays - 1));
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
  if (!targetStart) return null;

  const currentStart = startOfLocalDay(event?.appointmentDateISO || event?.start);
  if (!currentStart) return null;

  const dateKey = ymdDate(targetStart);
  const currentDateKey = event?.appointmentDateISO || ymdDate(event?.start);
  if (!dateKey || dateKey === currentDateKey) return null;

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
  return { updates, movedDateKeys: new Set([currentDateKey]), movedNextDateKeys: [dateKey] };
};

/* Notes helpers for Usage chart */
const COUNTABLE_NOTES = ["on set", "on-set", "onset", "shoot day", "shoot"];
const USAGE_ACTIVE_STATUSES = new Set(["confirmed", "first pencil", "second pencil", "maintenance"]);
const isCountableNote = (note) => {
  if (!note) return false;
  const n = String(note).toLowerCase();
  return COUNTABLE_NOTES.some((k) => n.includes(k));
};

const isActiveUsageStatus = (status) => USAGE_ACTIVE_STATUSES.has(String(status || "").trim().toLowerCase());

const getDayNote = (booking, dayKey) => {
  let v =
    booking?.notesByDate?.[dayKey] ??
    booking?.dayNotes?.[dayKey] ??
    booking?.dailyNotes?.[dayKey] ??
    booking?.notesForEachDay?.[dayKey];
  if (v && typeof v === "object") v = v.note ?? v.text ?? v.value ?? v.label ?? v.name;
  if (v) return v;

  if (
    Array.isArray(booking?.bookingDates) &&
    Array.isArray(booking?.bookingNotes) &&
    booking.bookingNotes.length === booking.bookingDates.length
  ) {
    const idx = booking.bookingDates.findIndex((d) => d === dayKey);
    if (idx >= 0) return booking.bookingNotes[idx];
  }

  const single =
    booking?.noteForTheDay ?? booking?.note ?? booking?.dayNote ?? booking?.dailyNote;
  if (single && (Array.isArray(booking.bookingDates) ? booking.bookingDates.length === 1 : true))
    return single;

  return null;
};

/* Vehicle label helper */
const buildVehicleLabelFromObject = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();

  const base =
    v.name ??
    v.vehicleName ??
    v.label ??
    v.title ??
    v.displayName ??
    v.vehicle ??
    v.model ??
    v.type ??
    "";

  const reg =
    v.registration ??
    v.reg ??
    v.regNumber ??
    v.regNo ??
    v.plate ??
    v.numberPlate ??
    "";

  const baseClean = String(base || "").trim();
  const regClean = String(reg || "").trim().toUpperCase();

  if (baseClean && regClean) return `${baseClean} (${regClean})`;
  if (baseClean) return baseClean;
  if (regClean) return regClean;
  return "";
};

/* ----------------- Defect utilities ----------------- */
const isDefectItem = (it) => it?.status === "defect";
const isPendingDefect = (it) => !it?.review?.status;
const isOpenVehicleIssue = (issue) => normStatus(issue?.status) === "open" || !String(issue?.status || "").trim();

const getTimestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const formatQueueDate = (value, fallback = "") => {
  if (!value) return fallback || "-";
  if (value instanceof Date) return value.toLocaleDateString("en-GB");
  if (typeof value?.toDate === "function") return value.toDate().toLocaleDateString("en-GB");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-");
      return `${day}/${month}/${year}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString("en-GB");
    return trimmed;
  }
  return fallback || "-";
};

const parseActivityDateCandidate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const dated = value.toDate();
    return Number.isNaN(dated?.getTime?.()) ? null : dated;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const dated = new Date(value);
    return Number.isNaN(dated.getTime()) ? null : dated;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (match) {
    const [, day, month, year, hour = "0", minute = "0"] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour = "0", minute = "0"] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  const dated = new Date(trimmed);
  return Number.isNaN(dated.getTime()) ? null : dated;
};

const resolveActivityDate = (...values) => {
  for (const value of values) {
    const dated = parseActivityDateCandidate(value);
    if (dated) return dated;
  }
  return null;
};

const classifyServiceRecord = (record) => {
  const type = String(record?.serviceType || "").toLowerCase();

  if (record?.recordType === "repair" || type.includes("repair")) return "repair";
  if (type.includes("minor") || type.includes("interim")) return "minor_service";
  return "service";
};

const toActivitySummary = (...values) => {
  const text = values.map((value) => String(value || "").trim()).find(Boolean);
  return text || "No summary provided.";
};

const getActivityRoute = (activity) => {
  if (activity?.type === "service" || activity?.type === "minor_service" || activity?.type === "repair") {
    if (activity.vehicleId && activity.sourceId) return VEHICLE_SERVICE_HISTORY_PATH(activity.vehicleId, activity.sourceId);
    return activity.vehicleId ? VEHICLE_EDIT_PATH(activity.vehicleId) : null;
  }

  if (activity?.type === "vehicle_check" && activity.sourceId) return CHECK_DETAIL_PATH(activity.sourceId);
  if (activity?.type === "vehicle_prep") return "/preplist-dashboard";
  if (activity?.type === "mot_precheck") return "/mot-overview";
  if (activity?.type === "defect") {
    return String(activity.status || "").toLowerCase() === "open" ? IMMEDIATE_DEFECTS_PATH : GENERAL_DEFECTS_PATH;
  }
  if (activity?.type === "vehicle_issue") {
    return activity.vehicleId ? VEHICLE_EDIT_PATH(activity.vehicleId) : GENERAL_DEFECTS_PATH;
  }

  return activity?.vehicleId ? VEHICLE_EDIT_PATH(activity.vehicleId) : null;
};

const buildActivityFromLegacyHistory = (vehicle) => {
  const vehicleId = vehicle?.id || null;
  const vehicleName = vehicle?.assetLabel || vehicle?.name || vehicle?.vehicleName || "Vehicle";
  const registration = vehicle?.registration || vehicle?.reg || "";
  const asArray = (value) => (Array.isArray(value) ? value : []);

  const service = asArray(vehicle?.serviceHistory).map((entry, index) => ({
    activityId: `legacy:service:${vehicleId || "vehicle"}:${entry?.serviceRecordId || index}`,
    sourceCollection: "vehicles.serviceHistory",
    sourceId: String(entry?.serviceRecordId || index),
    type: "legacy_service",
    title: entry?.bookingRef || entry?.serviceType || "Service history entry",
    summary: toActivitySummary(entry?.notes, entry?.partsUsed),
    vehicleId,
    vehicleName,
    registration,
    person: entry?.completedBy || entry?.signedBy || "",
    status: "history",
    activityDate: resolveActivityDate(entry?.completedDate, entry?.date, entry?.createdAt),
    createdAt: null,
    updatedAt: null,
    route: vehicleId ? VEHICLE_EDIT_PATH(vehicleId) : null,
  }));

  const repairs = asArray(vehicle?.repairHistory).map((entry, index) => ({
    activityId: `legacy:repair:${vehicleId || "vehicle"}:${entry?.repairRecordId || index}`,
    sourceCollection: "vehicles.repairHistory",
    sourceId: String(entry?.repairRecordId || index),
    type: "legacy_repair",
    title: entry?.summary || "Repair history entry",
    summary: toActivitySummary(entry?.reason, entry?.partsUsed),
    vehicleId,
    vehicleName,
    registration,
    person: entry?.completedBy || "",
    status: "history",
    activityDate: resolveActivityDate(entry?.completedDate, entry?.date, entry?.createdAt),
    createdAt: null,
    updatedAt: null,
    route: vehicleId ? VEHICLE_EDIT_PATH(vehicleId) : null,
  }));

  const prep = asArray(vehicle?.prepHistory).map((entry, index) => ({
    activityId: `legacy:prep:${vehicleId || "vehicle"}:${index}`,
    sourceCollection: "vehicles.prepHistory",
    sourceId: String(index),
    type: "legacy_prep",
    title: "Vehicle prep",
    summary: toActivitySummary(entry?.notes),
    vehicleId,
    vehicleName,
    registration,
    person: entry?.completedBy || "",
    status: entry?.completed ? "completed" : "logged",
    activityDate: resolveActivityDate(entry?.recordedAt, entry?.prepDate, entry?.createdAt),
    createdAt: null,
    updatedAt: null,
    route: vehicleId ? VEHICLE_EDIT_PATH(vehicleId) : null,
  }));

  const defect = asArray(vehicle?.defectHistory).map((entry, index) => ({
    activityId: `legacy:defect:${vehicleId || "vehicle"}:${index}`,
    sourceCollection: "vehicles.defectHistory",
    sourceId: String(index),
    type: "legacy_defect",
    title: entry?.description || "Defect history entry",
    summary: toActivitySummary(entry?.notes, entry?.location),
    vehicleId,
    vehicleName,
    registration,
    person: entry?.reportedBy || "",
    status: entry?.status || "open",
    activityDate: resolveActivityDate(entry?.updatedAt, entry?.createdAt),
    createdAt: null,
    updatedAt: null,
    route: vehicleId ? VEHICLE_EDIT_PATH(vehicleId) : null,
  }));

  return [...service, ...repairs, ...prep, ...defect];
};

function extractPendingDefects(checkDocs) {
  const out = [];
  for (const c of checkDocs) {
    if (!Array.isArray(c.items)) continue;
    c.items.forEach((it, idx) => {
      if (isDefectItem(it) && isPendingDefect(it)) {
        out.push({
          sourceType: "vehicleCheck",
          checkId: c.id,
          jobId: c.jobId || "",
          jobLabel: c.jobNumber ? `#${c.jobNumber}` : c.jobId || "",
          vehicle: c.vehicle || "",
          dateLabel: formatQueueDate(c.dateISO || c.date || c.createdAt, c.dateISO || c.date || ""),
          driverName: c.driverName || "",
          odometer: c.odometer || "",
          photos: Array.isArray(c.photos) ? c.photos : [],
          defectIndex: idx,
          itemLabel: it.label || `Item ${idx + 1}`,
          defectNote: it.note || "",
          submittedAt: c.createdAt || c.updatedAt || null,
        });
      }
    });
  }
  return out;
}

function extractPendingVehicleIssues(issueDocs) {
  return issueDocs
    .filter((issue) => isOpenVehicleIssue(issue))
    .map((issue) => ({
      sourceType: "vehicleIssue",
      issueId: issue.id,
      vehicle: issue.vehicleName || issue.vehicle || "",
      dateLabel: formatQueueDate(issue.createdAt),
      driverName: issue.reporterName || issue.reporterCode || "",
      reporterCode: issue.reporterCode || "",
      photos: [],
      defectIndex: 0,
      itemLabel: "App issue report",
      defectNote: issue.description || "",
      submittedAt: issue.createdAt || null,
      categoryLabel: issue.category || "Other",
    }));
}

function mergePendingQueue(checkDocs, issueDocs) {
  return [...extractPendingDefects(checkDocs), ...extractPendingVehicleIssues(issueDocs)].sort(
    (a, b) => getTimestampMillis(b.submittedAt) - getTimestampMillis(a.submittedAt)
  );
}

/* ----------------- Calendar event helpers ----------------- */
const dueDateFromVehicleField = (raw) => {
  // vehicle dates can be Firestore Timestamp OR "YYYY-MM-DD" string OR full ISO
  return parseLocalDateOnly(raw) || toDate(raw);
};

const dueTone = (dueDate) => {
  const diff = daysUntil(dueDate);
  if (diff == null) return "soft";
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


const normStatus = (s) => String(s || "").trim().toLowerCase();
const isInactiveBooking = isInactiveMaintenanceBooking;

const formatEventVehicleText = (vehicles = []) => {
  if (!Array.isArray(vehicles)) return "";
  return vehicles
    .map((vehicle) => {
      if (typeof vehicle === "string") return vehicle.trim();
      if (!vehicle || typeof vehicle !== "object") return "";
      const name = String(
        vehicle.name || [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ") || ""
      ).trim();
      const registration = String(vehicle.registration || vehicle.reg || "")
        .trim()
        .toUpperCase();
      if (name && registration) return `${name} (${registration})`;
      return name || registration || "";
    })
    .filter(Boolean)
    .join(", ");
};

const formatEventEquipmentText = (equipment = []) => {
  if (!Array.isArray(equipment)) return "";
  return equipment
    .map((item) => (typeof item === "string" ? item : item?.name || item?.label || ""))
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");
};

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
  const vehicleText = formatEventVehicleText(event?.vehicles);
  const equipmentText = formatEventEquipmentText(event?.equipment);
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
  const dueLabelColor = tone === "overdue" ? "#991b1b" : tone === "soon" ? "#92400e" : null;
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
  const documentBadges = [
    event?.requiresBrakeTestDocument
      ? {
          key: "brake",
          label: "BT",
          good: !!event?.hasBrakeTestDocument,
          title: event?.hasBrakeTestDocument ? "Brake test document attached" : "No brake test document",
        }
      : null,
    event?.requiresPmiDocument
      ? {
          key: "pmi",
          label: "PMI",
          good: !!event?.hasPmiDocument,
          title: event?.hasPmiDocument ? "PMI document attached" : "No PMI document",
        }
      : null,
  ].filter(Boolean);

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
      {documentBadges.length ? (
        <span style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {documentBadges.map((badge) => (
            <span
              key={badge.key}
              title={badge.title}
              aria-label={badge.title}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                minHeight: 18,
                minWidth: badge.label === "PMI" ? 40 : 30,
                padding: "2px 5px",
                borderRadius: 6,
                background: badge.good ? "#16a34a" : "#ef4444",
                color: "#ffffff",
                border: "1px solid rgba(0,0,0,0.65)",
                fontSize: 10.5,
                lineHeight: 1,
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
            >
              <FileText size={10} strokeWidth={3} />
              {badge.label}
            </span>
          ))}
        </span>
      ) : null}
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

/* ----------------- Component ----------------- */
export default function VehiclesHomePage() {
  const router = useRouter();
  const authAccess = useAuth() || {};
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.user, authAccess.userDoc]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  // Calendar state
  const [calView, setCalView] = useState("week");
  const [calDate, setCalDate] = useState(new Date());

  const [mounted, setMounted] = useState(false);

  //  Booked MOT/SERVICE from maintenanceBookings (source of truth)
  const [maintenanceBookingsRaw, setMaintenanceBookingsRaw] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);

  // Legacy: workBookings (if you still use it)
  const [workBookings, setWorkBookings] = useState([]);

  const [usageData, setUsageData] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [pendingMaintenanceDrop, setPendingMaintenanceDrop] = useState(null);

  // Vehicles (for due-date events + labels + counts)
  const [vehiclesRaw, setVehiclesRaw] = useState([]);
  const [vehicleNameMap, setVehicleNameMap] = useState({});

  // Counters
  const [motCounts, setMotCounts] = useState({ overdue: 0, soon: 0, ok: 0, total: 0 });
  const [serviceCounts, setServiceCounts] = useState({ overdue: 0, soon: 0, ok: 0, total: 0 });

  // Usage month
  const [usageMonth, setUsageMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Defect queue state
  const [checkDocs, setCheckDocs] = useState([]);
  const [vehicleIssueDocs, setVehicleIssueDocs] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [defectReports, setDefectReports] = useState([]);
  const [motPreChecks, setMotPreChecks] = useState([]);
  const [vehiclePrepRecords, setVehiclePrepRecords] = useState([]);
  const [pendingDefects, setPendingDefects] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModal, setActionModal] = useState(null); // {defect, decision, comment, category?}
  const checkingAdmin = !authAccess.accessReady;
  const isAdmin = !!authAccess.isAdmin;

  useEffect(() => setMounted(true), []);

  const requireAdmin = (message = "Admin access is required for this action.") => {
    if (isAdmin) return true;
    alert(message);
    return false;
  };

  /* --------- Load all vehicles ONCE for name + due date lookups --------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "read vehicles" });
      return;
    }

    const fetchVehicles = async () => {
      const snap = await getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState));
      const list = snap.docs.map((d) =>
        normalizeAssetRecord({ id: d.id, ...(d.data() || {}) })
      );

      const map = {};
      for (const v of list) {
        map[v.id] = v.assetLabel || v.id;
      }

      setVehiclesRaw(list);
      setVehicleNameMap(map);
    };
    fetchVehicles().catch((error) => {
      if (!handlePageFirestoreError(error, { collectionName: "vehicles", operation: "read vehicles" })) {
        console.error("[vehicle-home] vehicles load error:", error);
      }
    });
  }, [accessKey, dataAccessState]);

  /* --------- MOT + Service counters (uses vehiclesRaw) --------- */
  useEffect(() => {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const calcCounts = (dateValueList) => {
      let overdue = 0;
      let soon = 0;
      let ok = 0;
      let total = 0;

      dateValueList.forEach((raw) => {
        const dt = dueDateFromVehicleField(raw);
        if (!dt || isNaN(dt.getTime())) return;

        const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        const diffDays = Math.floor((d - todayMidnight) / (1000 * 60 * 60 * 24));

        total += 1;
        if (diffDays < 0) overdue += 1;
        else if (diffDays <= 21) soon += 1;
        else ok += 1;
      });

      return { overdue, soon, ok, total };
    };

    const activeVehicles = vehiclesRaw.filter((v) => !isVehicleOutOfUse(v));
    setMotCounts(calcCounts(activeVehicles.map((v) => getCanonicalDueDate(v, "mot"))));
    setServiceCounts(calcCounts(activeVehicles.map((v) => getCanonicalDueDate(v, "service"))));
  }, [vehiclesRaw]);

  /* --------- Usage histogram (vehicle usage from bookings) --------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "read booking usage" });
      return;
    }

    const fetchUsage = async () => {
      const { monthStart, monthEnd } = monthRange(usageMonth);
      const usedByDay = new Map();

      const snapshot = await getDocs(tenantCollectionQuery(db, "bookings", dataAccessState));
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const bookingStatus = String(data.status || "").trim();
        if (!isActiveUsageStatus(bookingStatus)) return;

        const mapVehicleFromBooking = (entry) => {
          if (!entry) return null;
          if (typeof entry === "string") {
            const id = entry.trim();
            return id ? { id, label: vehicleNameMap[id] || id } : null;
          }
          const id = String(entry.id || entry.vehicleId || "").trim();
          const label = (id && vehicleNameMap[id]) || buildVehicleLabelFromObject(entry) || id;
          return label ? { id, label } : null;
        };

        const vehicles = Array.isArray(data.vehicles)
          ? data.vehicles.map(mapVehicleFromBooking).filter(Boolean)
          : [];
        if (vehicles.length === 0) return;

        let dayKeys = [];
        if (Array.isArray(data.bookingDates) && data.bookingDates.length > 0) {
          dayKeys = data.bookingDates
            .map((s) => parseLocalDateOnly(s))
            .filter(Boolean)
            .filter((d) => d >= monthStart && d <= monthEnd)
            .map(dateKey);
        } else {
          const start =
            parseLocalDateOnly(data.date) ||
            parseLocalDateOnly(data.startDate) ||
            toDate(data.date) ||
            toDate(data.startDate);

          const end =
            parseLocalDateOnly(data.endDate) ||
            parseLocalDateOnly(data.date) ||
            toDate(data.endDate) ||
            toDate(data.date) ||
            start;

          if (!start) return;

          const clampedStart = start < monthStart ? monthStart : start;
          const clampedEnd = (end || start) > monthEnd ? monthEnd : end || start;

          dayKeys = daysInRange(clampedStart, clampedEnd);
        }

        if (dayKeys.length === 0) return;

        const filteredByNote = dayKeys.filter((k) => isCountableNote(getDayNote(data, k)));
        if (filteredByNote.length === 0) return;

        vehicles.forEach((vehicle) => {
          const vehicleStatus =
            (vehicle.id && data.vehicleStatus && typeof data.vehicleStatus === "object"
              ? data.vehicleStatus[vehicle.id]
              : "") || bookingStatus;
          if (!isActiveUsageStatus(vehicleStatus)) return;

          if (!usedByDay.has(vehicle.label)) {
            usedByDay.set(vehicle.label, { days: new Set(), bookings: new Set() });
          }
          const usage = usedByDay.get(vehicle.label);
          const s = usage.days;
          filteredByNote.forEach((k) => s.add(k));
          usage.bookings.add(docSnap.id);
        });
      });

      const usageArray = Array.from(usedByDay.entries())
        .map(([name, usage]) => ({
          name,
          usage: usage.days.size,
          bookingCount: usage.bookings.size,
        }))
        .sort((a, b) => b.usage - a.usage);

      setUsageData(usageArray);
    };

    fetchUsage().catch((error) => {
      if (!handlePageFirestoreError(error, { collectionName: "bookings", operation: "read booking usage" })) {
        console.error("[vehicle-home] usage load error:", error);
      }
    });
  }, [accessKey, dataAccessState, usageMonth, vehicleNameMap]);

  /* --------- OPTIONAL: legacy workBookings maintenance blocks --------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "workBookings", operation: "listen work bookings" });
      return undefined;
    }

    const unsub = onSnapshot(
      tenantCollectionQuery(db, "workBookings", dataAccessState),
      (snapshot) => {
        const events = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            const start = toDate(data.startDate);
            const end = toDate(data.endDate || data.startDate);
            if (!start || !end) return null;

            const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());

            return {
              title: `${data.vehicleName || "Vehicle"} - ${data.maintenanceType || "Maintenance"}`,
              start: s,
              end: addDays(e, 1),
              allDay: true,
              kind: "MAINTENANCE",
              vehicleId: data.vehicleId || null,
              source: "workBookings",
              docId: docSnap.id,
            };
          })
          .filter(Boolean);

        setWorkBookings(events);
      },
      (e) => {
        handlePageFirestoreError(e, { collectionName: "workBookings", operation: "listen work bookings" });
        console.warn("[workBookings] snapshot failed (ok if unused):", e);
        setWorkBookings([]);
      }
    );

    return () => unsub();
  }, [accessKey, dataAccessState]);

  /* ---------  REAL BOOKINGS: maintenanceBookings => calendar events --------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "maintenanceBookings", operation: "listen maintenance bookings" });
      return undefined;
    }

    const unsub = onSnapshot(
      tenantCollectionQuery(db, "maintenanceBookings", dataAccessState),
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

        setMaintenanceBookingsRaw(raw);
      },
      (e) => {
        if (!handlePageFirestoreError(e, { collectionName: "maintenanceBookings", operation: "listen maintenance bookings" })) {
          console.error("[maintenanceBookings] snapshot error:", e);
        }
        setMaintenanceBookingsRaw([]);
      }
    );

    return () => unsub();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "maintenanceJobs", operation: "listen maintenance jobs" });
      return undefined;
    }

    const unsub = onSnapshot(
      tenantCollectionQuery(db, "maintenanceJobs", dataAccessState),
      (snapshot) => {
        setMaintenanceJobs(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
      },
      (e) => {
        if (!handlePageFirestoreError(e, { collectionName: "maintenanceJobs", operation: "listen maintenance jobs" })) {
          console.error("[maintenanceJobs] snapshot error:", e);
        }
        setMaintenanceJobs([]);
      }
    );

    return () => unsub();
  }, [accessKey, dataAccessState]);

  const maintenanceBookingEventsShared = useMemo(
    () =>
      buildMaintenanceBookingEvents(maintenanceBookingsRaw, {
        getVehicleLabel: (booking) => {
          const vehicleId = booking.vehicleId || null;
          return vehicleId
            ? vehicleNameMap[vehicleId] || booking.vehicleLabel || vehicleId
            : booking.vehicleLabel || booking.vehicleName || booking.title || booking.jobNumber || "Vehicle";
        },
        groupConsecutiveDates: true,
        titleSeparator: " - ",
      }),
    [maintenanceBookingsRaw, vehicleNameMap]
  );

  const bookedMetaByVehicleShared = useMemo(
    () => buildBookedMetaByVehicle(maintenanceBookingsRaw),
    [maintenanceBookingsRaw]
  );

  const motServiceEventsShared = useMemo(
    () =>
      buildVehicleDueEvents(vehiclesRaw, {
        bookedMetaByVehicle: bookedMetaByVehicleShared,
        getVehicleLabel: (vehicle) =>
          vehicleNameMap[vehicle.id] || buildVehicleLabelFromObject(vehicle) || vehicle.id,
        isApptAfterExpiry,
      }),
    [vehiclesRaw, vehicleNameMap, bookedMetaByVehicleShared]
  );

  const maintenanceJobEventsShared = useMemo(
    () => buildMaintenanceJobEvents(maintenanceJobs),
    [maintenanceJobs]
  );


  /* --------- Combined calendar events --------- */
  const calendarEvents = useMemo(() => {
    return [
      ...maintenanceBookingEventsShared,
      ...maintenanceJobEventsShared,
      ...motServiceEventsShared,
    ];
  }, [maintenanceBookingEventsShared, maintenanceJobEventsShared, motServiceEventsShared]);

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
          toLabel: formatDropConfirmRange(dropChange.movedNextDateKeys || [ymdDate(start)].filter(Boolean)),
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
        (maintenanceBookingsRaw || []).find((booking) => String(booking?.id || "") === bookingId) || event;
      const dropChange = buildMaintenanceBookingDropUpdates(existingBooking, event, start);
      if (!dropChange?.updates) return;

      const title = String(event?.title || existingBooking?.title || existingBooking?.jobNumber || "this booking").trim();
      const fromDates = dropChange.movedDateKeys
        ? [...dropChange.movedDateKeys]
        : [ymdDate(event?.start)].filter(Boolean);
      const toDates = dropChange.movedNextDateKeys?.length
        ? dropChange.movedNextDateKeys
        : [ymdDate(start)].filter(Boolean);
      setPendingMaintenanceDrop({
        targetCollection: "maintenanceBookings",
        bookingId,
        title,
        fromLabel: formatDropConfirmRange(fromDates),
        toLabel: formatDropConfirmRange(toDates),
        updates: dropChange.updates,
      });
    },
    [maintenanceBookingsRaw]
  );

  const cancelPendingMaintenanceDrop = useCallback(() => {
    setPendingMaintenanceDrop(null);
  }, []);

  const confirmPendingMaintenanceDrop = useCallback(async () => {
    if (!pendingMaintenanceDrop?.updates) return;

    if (pendingMaintenanceDrop.targetCollection === "vehicles") {
      const vehicleId = String(pendingMaintenanceDrop.vehicleId || "").trim();
      if (!vehicleId) return;

      const previousVehicles = vehiclesRaw;
      const optimisticUpdates = { ...pendingMaintenanceDrop.updates, updatedAt: new Date().toISOString() };
      setPendingMaintenanceDrop((current) => (current ? { ...current, saving: true } : current));
      setVehiclesRaw((current) =>
        (current || []).map((vehicle) =>
          String(vehicle?.id || "") === vehicleId ? { ...vehicle, ...optimisticUpdates } : vehicle
        )
      );

      try {
        await updateDoc(doc(db, "vehicles", vehicleId), pendingMaintenanceDrop.updates);
        setPendingMaintenanceDrop(null);
      } catch (error) {
        setVehiclesRaw(previousVehicles);
        if (!handlePageFirestoreError(error, { collectionName: "vehicles", operation: "move vehicle maintenance appointment" })) {
          console.error("[vehicle-home] vehicle maintenance appointment move failed:", error);
        }
        alert("Could not move this maintenance appointment. Please try again.");
        setPendingMaintenanceDrop((current) => (current ? { ...current, saving: false } : current));
      }
      return;
    }

    if (!pendingMaintenanceDrop?.bookingId) return;

    const { bookingId, updates } = pendingMaintenanceDrop;
    const previousBookings = maintenanceBookingsRaw;
    const optimisticUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setPendingMaintenanceDrop((current) => (current ? { ...current, saving: true } : current));
    setMaintenanceBookingsRaw((current) =>
      (current || []).map((booking) =>
        String(booking?.id || "") === bookingId ? { ...booking, ...optimisticUpdates } : booking
      )
    );

    try {
      await updateDoc(doc(db, "maintenanceBookings", bookingId), updates);
      setPendingMaintenanceDrop(null);
    } catch (error) {
      setMaintenanceBookingsRaw(previousBookings);
      if (!handlePageFirestoreError(error, { collectionName: "maintenanceBookings", operation: "move maintenance booking" })) {
        console.error("[vehicle-home] maintenance booking move failed:", error);
      }
      alert("Could not move this maintenance booking. Please try again.");
      setPendingMaintenanceDrop((current) => (current ? { ...current, saving: false } : current));
    }
  }, [maintenanceBookingsRaw, pendingMaintenanceDrop, vehiclesRaw]);

  // Load submitted checks + app-reported vehicle issues for the review queue
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicleChecks", operation: "listen vehicle checks" });
      return undefined;
    }

    const unsubChecks = onSnapshot(
      tenantCollectionQuery(db, "vehicleChecks", dataAccessState),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCheckDocs(docs.filter((c) => c.status === "submitted"));
      },
      (e) => {
        if (!handlePageFirestoreError(e, { collectionName: "vehicleChecks", operation: "listen vehicle checks" })) {
          console.error("[vehicleChecks] snapshot error:", e);
        }
        setCheckDocs([]);
      }
    );

    const unsubIssues = onSnapshot(
      tenantCollectionQuery(db, "vehicleIssues", dataAccessState),
      (snap) => {
        setVehicleIssueDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
      },
      (e) => {
        if (!handlePageFirestoreError(e, { collectionName: "vehicleIssues", operation: "listen vehicle issues" })) {
          console.error("[vehicleIssues] snapshot error:", e);
        }
        setVehicleIssueDocs([]);
      }
    );

    return () => {
      unsubChecks();
      unsubIssues();
    };
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "serviceRecords", operation: "listen vehicle activity" });
      return undefined;
    }

    const unsubServiceRecords = onSnapshot(
      tenantCollectionQuery(db, "serviceRecords", dataAccessState),
      (snap) => setServiceRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => {
        if (!handlePageFirestoreError(e, { collectionName: "serviceRecords", operation: "listen service records" })) {
          console.error("[serviceRecords] snapshot error:", e);
        }
        setServiceRecords([]);
      }
    );

    const unsubDefectReports = onSnapshot(
      tenantCollectionQuery(db, "defectReports", dataAccessState),
      (snap) => setDefectReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => {
        if (!handlePageFirestoreError(e, { collectionName: "defectReports", operation: "listen defect reports" })) {
          console.error("[defectReports] snapshot error:", e);
        }
        setDefectReports([]);
      }
    );

    const unsubMotPreChecks = onSnapshot(
      tenantCollectionQuery(db, "motPreChecks", dataAccessState),
      (snap) => setMotPreChecks(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => {
        if (!handlePageFirestoreError(e, { collectionName: "motPreChecks", operation: "listen MOT pre-checks" })) {
          console.error("[motPreChecks] snapshot error:", e);
        }
        setMotPreChecks([]);
      }
    );

    const unsubVehiclePrepRecords = onSnapshot(
      tenantCollectionQuery(db, "vehiclePrepRecords", dataAccessState),
      (snap) => setVehiclePrepRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => {
        if (!handlePageFirestoreError(e, { collectionName: "vehiclePrepRecords", operation: "listen vehicle prep records" })) {
          console.error("[vehiclePrepRecords] snapshot error:", e);
        }
        setVehiclePrepRecords([]);
      }
    );

    return () => {
      unsubServiceRecords();
      unsubDefectReports();
      unsubMotPreChecks();
      unsubVehiclePrepRecords();
    };
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    setPendingDefects(mergePendingQueue(checkDocs, vehicleIssueDocs));
  }, [checkDocs, vehicleIssueDocs]);

  const recentActivity = useMemo(() => {
    const collectionActivities = [
      ...serviceRecords.map((record) => {
        const type = classifyServiceRecord(record);
        const activityDate = resolveActivityDate(
          record.completedAt,
          record.updatedAt,
          record.createdAt,
          record.serviceDateOnly,
          record.serviceDate,
          record.completedDate
        );

        const activity = {
          activityId: `serviceRecords:${record.id}`,
          sourceCollection: "serviceRecords",
          sourceId: record.id,
          type,
          title:
            type === "repair"
              ? record.repairSummary || record.workSummary || "General repair"
              : record.serviceType || "Service record",
          summary: toActivitySummary(
            record.workSummary,
            record.repairSummary,
            record.repairReason,
            record.partsUsed,
            record.extraNotes
          ),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.signedBy || record.completedBy || "",
          status: type === "repair" ? "completed" : "logged",
          activityDate,
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
        };

        return { ...activity, route: getActivityRoute(activity) };
      }),
      ...defectReports.map((record) => {
        const activity = {
          activityId: `defectReports:${record.id}`,
          sourceCollection: "defectReports",
          sourceId: record.id,
          type: "defect",
          title: record.description || "Workshop defect report",
          summary: toActivitySummary(record.notes, record.location, record.severity),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.reportedBy || "",
          status: record.status || "open",
          activityDate: resolveActivityDate(record.updatedAt, record.createdAt),
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
        };

        return { ...activity, route: getActivityRoute(activity) };
      }),
      ...motPreChecks.map((record) => {
        const activity = {
          activityId: `motPreChecks:${record.id}`,
          sourceCollection: "motPreChecks",
          sourceId: record.id,
          type: "mot_precheck",
          title: record.status || "MOT pre-check",
          summary: toActivitySummary(record.summary, record.faultsFound, record.workRecommended),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.signedBy || "",
          status: record.status || "completed",
          activityDate: resolveActivityDate(
            record.completedAt,
            record.updatedAt,
            record.createdAt,
            record.precheckDateOnly,
            record.precheckDateTime
          ),
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
        };

        return { ...activity, route: getActivityRoute(activity) };
      }),
      ...vehiclePrepRecords.map((record) => {
        const activity = {
          activityId: `vehiclePrepRecords:${record.id}`,
          sourceCollection: "vehiclePrepRecords",
          sourceId: record.id,
          type: "vehicle_prep",
          title: record.completed ? "Vehicle prep completed" : "Vehicle prep logged",
          summary: toActivitySummary(record.notes),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.completedBy || "",
          status: record.completed ? "completed" : "draft",
          activityDate: resolveActivityDate(record.completedAt, record.updatedAt, record.createdAt, record.prepDate),
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
        };

        return { ...activity, route: getActivityRoute(activity) };
      }),
      ...checkDocs.map((record) => {
        const defectCount = Array.isArray(record.items)
          ? record.items.filter((item) => item?.status === "defect").length
          : 0;
        const activity = {
          activityId: `vehicleChecks:${record.id}`,
          sourceCollection: "vehicleChecks",
          sourceId: record.id,
          type: "vehicle_check",
          title: defectCount > 0 ? `${defectCount} defects found` : "Vehicle check submitted",
          summary: toActivitySummary(record.notes, defectCount > 0 ? `${defectCount} defect items logged.` : ""),
          vehicleId: record.vehicleId || null,
          vehicleName: buildVehicleLabelFromObject(record.vehicle) || record.vehicleName || "Unknown vehicle",
          registration:
            typeof record.vehicle === "object"
              ? record.vehicle?.registration || record.vehicle?.reg || ""
              : record.registration || "",
          person: record.driverName || record.driverCode || "",
          status: record.status || "submitted",
          activityDate: resolveActivityDate(record.updatedAt, record.createdAt, record.dateISO),
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
        };

        return { ...activity, route: getActivityRoute(activity) };
      }),
      ...vehicleIssueDocs.map((record) => {
        const activity = {
          activityId: `vehicleIssues:${record.id}`,
          sourceCollection: "vehicleIssues",
          sourceId: record.id,
          type: "vehicle_issue",
          title: record.category || "Vehicle issue",
          summary: toActivitySummary(record.description),
          vehicleId: record.vehicleId || null,
          vehicleName: record.vehicleName || "Unknown vehicle",
          registration: record.registration || "",
          person: record.reporterName || record.reporterCode || "",
          status: record.status || "open",
          activityDate: resolveActivityDate(record.updatedAt, record.createdAt),
          createdAt: record.createdAt || null,
          updatedAt: record.updatedAt || null,
        };

        return { ...activity, route: getActivityRoute(activity) };
      }),
    ];

    const dedupedCollections = new Map(collectionActivities.map((activity) => [activity.activityId, activity]));

    if (dedupedCollections.size > 0) {
      return Array.from(dedupedCollections.values())
        .sort((a, b) => getTimestampMillis(b.activityDate) - getTimestampMillis(a.activityDate))
        .slice(0, 12);
    }

    return vehiclesRaw
      .flatMap((vehicle) => buildActivityFromLegacyHistory(vehicle))
      .sort((a, b) => getTimestampMillis(b.activityDate) - getTimestampMillis(a.activityDate))
      .slice(0, 12);
  }, [serviceRecords, defectReports, motPreChecks, vehiclePrepRecords, checkDocs, vehicleIssueDocs, vehiclesRaw]);

  // Defect action handlers
  const openApprove = (defect) => {
    if (!requireAdmin("Only admins can approve vehicle defects.")) return;
    setActionModal({
      defect,
      decision: "approved",
      comment: "",
      category: "general",
    });
  };

  const openDecline = (defect) => {
    if (!requireAdmin("Only admins can decline vehicle defects.")) return;
    setActionModal({ defect, decision: "declined", comment: "" });
  };

  const performDecision = async () => {
    if (!actionModal?.defect || !actionModal?.decision) return;
    if (!requireAdmin("Only admins can review vehicle defects.")) return;
    setActionLoading(true);
    try {
      const { defect, decision, comment, category } = actionModal;
      const reviewer = auth?.currentUser?.displayName || auth?.currentUser?.email || "Supervisor";

      if (decision === "approved" && !category) {
        alert("Choose where to route this defect: General Maintenance or Immediate Defects.");
        setActionLoading(false);
        return;
      }

      if (defect.sourceType === "vehicleIssue") {
        const reviewPayload = {
          status: decision,
          reviewedBy: reviewer,
          reviewedAt: serverTimestamp(),
          comment: (comment || "").trim(),
        };

        if (decision === "approved") {
          reviewPayload.category = String(category || "").trim().toLowerCase();
        }

        await updateDoc(doc(db, "vehicleIssues", defect.issueId), {
          status: decision,
          review: reviewPayload,
          updatedAt: serverTimestamp(),
        });
      } else {
        const path = `items.${defect.defectIndex}.review`;
        const reviewPayload = {
          status: decision,
          reviewedBy: reviewer,
          reviewedAt: serverTimestamp(),
          comment: (comment || "").trim(),
        };

        if (decision === "approved") {
          reviewPayload.category = String(category || "").trim().toLowerCase();
        }

        await updateDoc(doc(db, "vehicleChecks", defect.checkId), {
          [path]: reviewPayload,
          updatedAt: serverTimestamp(),
        });
      }

      setPendingDefects((prev) =>
        prev.filter((d) =>
          defect.sourceType === "vehicleIssue"
            ? d.issueId !== defect.issueId
            : !(d.checkId === defect.checkId && d.defectIndex === defect.defectIndex)
        )
      );

      setActionModal(null);

      if (decision === "approved") {
        if (category === "immediate") router.push(IMMEDIATE_DEFECTS_PATH);
        else router.push(GENERAL_DEFECTS_PATH);
      } else {
        router.push(DECLINED_DEFECTS_PATH);
      }
    } catch (e) {
      const denied = handlePageFirestoreError(e, {
        collectionName: defect?.sourceType === "vehicleIssue" ? "vehicleIssues" : "vehicleChecks",
        operation: "update defect review",
      });
      if (!denied) console.error("defect review error:", e);
      alert(denied ? "Permission denied. This user cannot update defect reviews." : "Could not update defect. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectEvent = (event) => {
    if (!event) return;
    if (event.__collection === "maintenanceJobs") {
      router.push(`/maintenance-jobs?jobId=${encodeURIComponent(event.id)}`);
      return;
    }
    setSelectedEvent(event);
  };

  const usageMonthLabel = `${usageMonth.getFullYear()}-${String(usageMonth.getMonth() + 1).padStart(2, "0")}`;
  const kpiPending = pendingDefects.length;
  const totalUsageDays = useMemo(
    () => usageData.reduce((sum, row) => sum + Number(row.usage || 0), 0),
    [usageData]
  );
  const totalUsageBookings = useMemo(
    () => usageData.reduce((sum, row) => sum + Number(row.bookingCount || 0), 0),
    [usageData]
  );

  const renderUsageLabel = (props) => {
    const { x = 0, y = 0, width = 0, value = 0 } = props || {};
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        textAnchor="middle"
        fill={UI.text}
        style={{ fontSize: 11, fontWeight: 900 }}
      >
        {Number(value || 0)}
      </text>
    );
  };

  // Tiles with proper numeric badges
  const vehicleSections = useMemo(
    () => [
      {
        title: "Vehicle List",
        description: "View, edit or delete vehicles currently in the system.",
        link: "/vehicles",
        icon: Car,
        rightBadges: [],
      },
      {
        title: "Equipment List",
        description: "View, edit or delete equipment currently in the system.",
        link: "/equipment",
        icon: ClipboardCheck,
        rightBadges: [],
      },
      {
        title: "Add Vehicle / Equipment",
        description: "Add new vehicles and equipment in the system.",
        link: "/add-vehicle",
        icon: Plus,
        rightBadges: [],
      },
      {
        title: "General Maintenance",
        description: "Approved, non-urgent defects to plan and schedule.",
        link: GENERAL_DEFECTS_PATH,
        icon: Wrench,
        rightBadges: [],
      },
      {
        title: "Immediate Defects",
        description: "Approved urgent issues that need action now.",
        link: IMMEDIATE_DEFECTS_PATH,
        icon: ShieldAlert,
        rightBadges: [],
      },
      {
        title: "Declined Defects",
        description: "Defects that were reviewed and declined.",
        link: DECLINED_DEFECTS_PATH,
        icon: CheckCircle2,
        rightBadges: [],
      },
      {
        title: "Maintenance Jobs",
        description: "Create and track workshop job cards from planned to closed.",
        link: MAINTENANCE_JOBS_PATH,
        icon: ListChecks,
        rightBadges: [],
      },
      {
        title: "MOT Schedule",
        description: "View and manage MOT due dates for all vehicles.",
        link: "/mot-overview",
        icon: CalendarCheck,
        rightBadges: [
          motCounts.overdue > 0 ? { label: `Overdue ${motCounts.overdue}`, tone: "danger" } : null,
          motCounts.soon > 0 ? { label: `Due soon ${motCounts.soon}`, tone: "amber" } : null,
          motCounts.total > 0 ? { label: `Total ${motCounts.total}`, tone: "soft" } : null,
        ].filter(Boolean),
      },
      {
        title: "Service Overview",
        description: "Track past and upcoming vehicle servicing.",
        link: "/service-overview",
        icon: Wrench,
        rightBadges: [
          serviceCounts.overdue > 0 ? { label: `Overdue ${serviceCounts.overdue}`, tone: "danger" } : null,
          serviceCounts.soon > 0 ? { label: `Due soon ${serviceCounts.soon}`, tone: "amber" } : null,
          serviceCounts.total > 0 ? { label: `Total ${serviceCounts.total}`, tone: "soft" } : null,
        ].filter(Boolean),
      },
      {
        title: "Activity History",
        description: "Browse the latest services, repairs, defects, checks and prep activity.",
        link: ACTIVITY_HISTORY_PATH,
        icon: History,
        rightBadges: [recentActivity.length > 0 ? { label: `${recentActivity.length} recent`, tone: "soft" } : null].filter(Boolean),
      },
      {
        title: "Vehicle Usage Logs",
        description: "Monitor vehicle usage across bookings and trips.",
        link: "/usage-overview",
        icon: Activity,
        rightBadges: [],
      },
    ],
    [motCounts, serviceCounts, recentActivity.length]
  );

  const maintenanceEventPropGetter = (event) => {
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
  };

  return (
    <HeaderSidebarLayout>
      {/* subtle focus ring */}
      <style>{`
        input:focus, textarea:focus, button:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(29,78,216,0.15); border-color: #bfdbfe !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .vehicle-home-page,
        .vehicle-home-page * {
          box-sizing: border-box;
        }
        .vehicle-home-page {
          overflow-x: hidden;
        }
        .vehicle-home-page section,
        .vehicle-home-page aside,
        .vehicle-home-page svg,
        .vehicle-home-page table,
        .vehicle-home-page .rbc-calendar,
        .vehicle-home-page .rbc-month-view,
        .vehicle-home-page .rbc-time-view,
        .vehicle-home-page .recharts-responsive-container {
          max-width: 100%;
          min-width: 0;
        }
        .vehicle-home-page .rbc-calendar {
          overflow-x: hidden;
        }
        .vehicle-home-page .rbc-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          min-width: 0;
        }
        .vehicle-home-page .rbc-toolbar > div {
          min-width: 0;
          max-width: 100%;
          flex-wrap: wrap;
        }
        .vehicle-home-page .rbc-toolbar-label {
          min-width: 0;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .vehicle-home-page .rbc-row-segment,
        .vehicle-home-page .rbc-event,
        .vehicle-home-page .rbc-event-content {
          min-width: 0;
          max-width: 100%;
        }
        ${vehicleHomeCalendarCss}
        @media (max-width: 1180px) {
          .vehicle-home-command-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .vehicle-home-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .vehicle-home-ops-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .vehicle-home-page {
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
          .vehicle-home-summary-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .vehicle-home-page .rbc-btn-group {
            display: flex;
            flex-wrap: wrap;
            max-width: 100%;
          }
          .vehicle-home-page .rbc-btn-group button {
            white-space: normal !important;
          }
        }
      `}</style>

      <div className="vehicle-home-page" style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Vehicle Management</h1>
            <div style={sub}>Fleet operations overview covering defects, utilisation, MOT compliance and service planning.</div>
          </div>
        </div>

        <section className="vehicle-home-command-grid" style={commandGrid}>
          <div style={{ ...surface, padding: 12 }}>
            <div style={sectionHeader}>
              <div>
                <h2 style={titleMd}>Home</h2>
                <div style={hint}>Operational shortcuts, live compliance counters and defect review status.</div>
              </div>
              <span style={sectionTag}>All locations</span>
            </div>

            <div className="vehicle-home-summary-grid" style={summaryGrid}>
              <SummaryCard title="Pending Defects" value={kpiPending} icon={AlertTriangle} tone={kpiPending ? "danger" : "ok"} footer={`${pendingDefects.length} waiting review`} onClick={() => router.push(VEHICLE_CHECK_PATH)} />
              <SummaryCard title="MOT Overdue" value={motCounts.overdue} icon={CalendarCheck} tone={motCounts.overdue ? "danger" : "ok"} footer={`${motCounts.soon} due soon`} onClick={() => router.push("/mot-overview")} />
              <SummaryCard title="Service Overdue" value={serviceCounts.overdue} icon={Wrench} tone={serviceCounts.overdue ? "danger" : "ok"} footer={`${serviceCounts.soon} due soon`} onClick={() => router.push("/service-overview")} />
              <SummaryCard title="Usage Days" value={totalUsageDays} icon={Activity} tone="brand" footer={`${totalUsageBookings} bookings`} onClick={() => router.push("/usage-overview")} />
            </div>

            <div style={{ ...sectionHeader, marginTop: 14, marginBottom: 8 }}>
              <div>
                <h2 style={{ ...titleMd, fontSize: 15 }}>Fleet workspaces</h2>
                <div style={hint}>Common vehicle actions grouped by how the workshop uses them.</div>
              </div>
              <button type="button" style={btn("ghost")} onClick={() => router.push(VEHICLE_CHECK_PATH)}>
                Open vehicle check
              </button>
            </div>

            <div className="vehicle-home-ops-grid" style={opsGrid}>
              {vehicleSections.map((section, idx) => (
                <Tile
                  key={idx}
                  icon={section.icon}
                  title={section.title}
                  description={section.description}
                  rightBadges={section.rightBadges}
                  onClick={() => router.push(section.link)}
                />
              ))}
              <VehicleCheckTile onClick={() => router.push(VEHICLE_CHECK_PATH)} />
            </div>
          </div>

          <aside style={{ display: "grid", gap: UI.gap }}>
            <RiskRing
              title="MOT Compliance"
              total={motCounts.total}
              ok={motCounts.ok}
              soon={motCounts.soon}
              overdue={motCounts.overdue}
            />
            <RiskRing
              title="Service Readiness"
              total={serviceCounts.total}
              ok={serviceCounts.ok}
              soon={serviceCounts.soon}
              overdue={serviceCounts.overdue}
            />
            <div style={{ ...surface, padding: 12 }}>
              <div style={{ ...sectionHeader, marginBottom: 8 }}>
                <div>
                  <h2 style={{ ...titleMd, fontSize: 15 }}>Recent activity</h2>
                  <div style={hint}>Latest service, prep, checks and defect movement.</div>
                </div>
                <button type="button" style={btn("pill")} onClick={() => router.push(ACTIVITY_HISTORY_PATH)}>
                  View all
                </button>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {recentActivity.slice(0, 4).map((activity) => (
                  <button
                    key={activity.activityId}
                    type="button"
                    onClick={() => activity.route && router.push(activity.route)}
                    style={{
                      border: "1px solid #e5eaf0",
                      background: "#fbfdff",
                      borderRadius: 8,
                      padding: "8px 9px",
                      textAlign: "left",
                      cursor: activity.route ? "pointer" : "default",
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 850, color: UI.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {activity.vehicleName}
                    </div>
                    <div style={{ fontSize: 12, color: UI.muted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {activity.title}
                    </div>
                  </button>
                ))}
                {recentActivity.length === 0 ? <div style={{ color: UI.muted, fontSize: 13 }}>No recent activity yet.</div> : null}
              </div>
            </div>
          </aside>
        </section>

        {/* Defect Review */}
        <section style={{ ...premiumSection, marginTop: UI.gap, overflow: "hidden", padding: 14 }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Defect review</h2>
              <div style={hint}>
                Review submitted vehicle defects and app-reported issues, approve and route them to the correct operational bucket, or decline where no action is required.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
              <span style={sectionTag}>Defect queue</span>
              <span style={chipSoft}>{pendingDefects.length} pending</span>
              <button type="button" style={btn("ghost")} onClick={() => router.push("/vehicle-checks")}>
                Open checks
              </button>
            </div>
          </div>

          <div style={divider} />

          <div style={{ overflowX: "auto", marginTop: 0 }}>
            <table style={table}>
              <thead>
                <tr style={{ background: "#f6f8fb" }}>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11.5 }}>Date</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11.5 }}>Source</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11.5 }}>Vehicle</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11.5 }}>Defect</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11.5 }}>Note</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11.5 }}>Submitted By</th>
                  <th style={{ ...thtd, textAlign: "center", fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11.5 }}>Photos</th>
                  <th style={{ ...thtd, textAlign: "right", fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11.5 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDefects.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                      No pending defects.
                    </td>
                  </tr>
                ) : (
                  pendingDefects.map((d, i) => (
                    <tr key={`${d.sourceType}-${d.issueId || d.checkId}-${d.defectIndex}-${i}`}>
                      <td style={thtd}>{d.dateLabel || "-"}</td>
                      <td style={thtd}>
                        <span
                          style={badge(
                            d.sourceType === "vehicleIssue" ? "#f5ede6" : "#edf3f8",
                            d.sourceType === "vehicleIssue" ? UI.accent : UI.brand
                          )}
                        >
                          {d.sourceType === "vehicleIssue" ? "App report" : "Check"}
                        </span>
                      </td>
                      <td style={thtd}>{d.vehicle || "-"}</td>
                      <td style={thtd} title={d.itemLabel}>
                        <strong>#{d.defectIndex + 1}</strong> - {d.itemLabel}
                      </td>
                      <td style={{ ...thtd, maxWidth: 360 }}>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            color: d.defectNote ? UI.text : UI.muted,
                          }}
                        >
                          {d.defectNote || "-"}
                        </div>
                      </td>
                      <td style={thtd}>
                        <div>{d.driverName || "-"}</div>
                        {d.reporterCode ? <div style={{ color: UI.muted, fontSize: 12 }}>{d.reporterCode}</div> : null}
                      </td>
                      <td style={{ ...thtd, textAlign: "center" }}>{d.photos?.length ? d.photos.length : 0}</td>
                      <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>
                        {d.sourceType === "vehicleCheck" ? (
                          <>
                            <a
                              href={CHECK_DETAIL_PATH(d.checkId)}
                              style={{
                                ...actionBtn("ghost"),
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                            >
                              {"View check ->"}
                            </a>
                            <span style={{ display: "inline-block", width: 8 }} />
                          </>
                        ) : null}
                        <button
                          onClick={() => openApprove(d)}
                          style={actionBtn("approve")}
                          disabled={checkingAdmin || !isAdmin}
                          title={!isAdmin ? "Admin only" : "Approve"}
                        >
                          Approve
                        </button>
                        <span style={{ display: "inline-block", width: 8 }} />
                        <button
                          onClick={() => openDecline(d)}
                          style={actionBtn("decline")}
                          disabled={checkingAdmin || !isAdmin}
                          title={!isAdmin ? "Admin only" : "Decline"}
                        >
                          Decline
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Calendar */}
        <section style={{ ...premiumSection, marginTop: UI.gap, minWidth: 0, overflow: "visible" }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Maintenance Calendar</h2>
              <div style={hint}>
                MOT, service, maintenance bookings and active workshop activity.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
              <button
                type="button"
                style={calView === "week" ? btn() : btn("ghost")}
                onClick={() => setCalView("week")}
              >
                Week
              </button>

              <button
                type="button"
                style={calView === "month" ? btn() : btn("ghost")}
                onClick={() => setCalView("month")}
              >
                Month
              </button>

              <div style={chip}>
                {calDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
            </div>
          </div>

          {mounted && (
            <DraggableBigCalendar
              localizer={localizer}
              events={calendarEvents}
              view={calView}
              views={["week", "month"]}
              onView={(v) => setCalView((prev) => (prev === v ? prev : v))}
              date={calDate}
              onNavigate={(d) => setCalDate((prev) => (sameCalendarDate(prev, d) ? prev : d))}
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
              onSelectEvent={handleSelectEvent}
              eventPropGetter={maintenanceEventPropGetter}
              className={calView === "week" ? "dashboard-compact-calendar" : "dashboard-month-calendar"}
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
              style={calView === "week" ? compactCalendarFrame : monthCalendarFrame}
            />
          )}
        </section>

        {/* Usage chart */}
        <section style={{ ...premiumSection, marginTop: UI.gap, overflow: "hidden", minWidth: 0 }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Vehicle usage</h2>
              <div style={hint}>
                Counts active booking days where the booking note contains <b>On Set</b> or <b>Shoot day</b>.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <span style={sectionTag}>Usage analysis</span>
              <button type="button" style={btn("pill")} onClick={() => setUsageMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                {"<- Prev"}
              </button>

              <input
                type="month"
                value={usageMonthLabel}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  if (y && m) setUsageMonth(new Date(y, m - 1, 1));
                }}
                style={{ ...inputBase, width: 170, cursor: "pointer" }}
              />

              <button type="button" style={btn("pill")} onClick={() => setUsageMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                {"Next ->"}
              </button>

              <span style={chipSoft}>{usageData.length} vehicles</span>
              <span style={chipSoft}>{totalUsageDays} days</span>
              <span style={chipSoft}>{totalUsageBookings} bookings</span>
            </div>
          </div>

          <div style={{ height: 320, marginTop: 10, minWidth: 0, overflow: "hidden" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageData} margin={{ top: 18, right: 24, left: 0, bottom: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fill: UI.muted, fontSize: 12 }} axisLine={{ stroke: "#e5e7eb" }} tickLine={{ stroke: "#e5e7eb" }} />
                <YAxis allowDecimals={false} tick={{ fill: UI.muted, fontSize: 12 }} axisLine={{ stroke: "#e5e7eb" }} tickLine={{ stroke: "#e5e7eb" }} />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.12)" }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                    fontSize: 12,
                    color: UI.text,
                  }}
                  formatter={(value, name, item) => {
                    const bookings = Number(item?.payload?.bookingCount || 0);
                    return [`${Number(value || 0)} days from ${bookings} bookings`, "Usage"];
                  }}
                />
                <Bar dataKey="usage" fill={UI.brand} radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="usage" position="top" content={renderUsageLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {selectedEvent && (
          <DashboardMaintenanceModal
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
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
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: UI.accentSoft,
                      color: "#8b5e3c",
                      border: `1px solid ${UI.brandBorder}`,
                      flex: "0 0 auto",
                    }}
                  >
                    <Wrench size={17} />
                  </span>
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
                    <div style={{ fontSize: 11, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>From</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: UI.text }}>{pendingMaintenanceDrop.fromLabel}</div>
                  </div>
                  <div style={{ border: UI.border, borderRadius: UI.radius, padding: 10, background: "#f8fbfe" }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>To</div>
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

        {/* Decision modal */}
        {actionModal && (
          <div style={{ ...modal, top: 130 }}>
            <h3 style={{ margin: "0 0 8px", fontWeight: 900, color: UI.text }}>
              {actionModal.decision === "approved" ? "Approve defect" : "Decline defect"}
            </h3>

            <div style={{ fontSize: 13, color: UI.muted, marginBottom: 10, lineHeight: 1.45 }}>
              <div>
                <strong style={{ color: UI.text }}>Date:</strong> {actionModal.defect.dateLabel || "-"}
              </div>
              {actionModal.defect.sourceType === "vehicleCheck" ? (
                <div>
                  <strong style={{ color: UI.text }}>Job:</strong> {actionModal.defect.jobLabel || actionModal.defect.jobId}
                </div>
              ) : null}
              <div>
                <strong style={{ color: UI.text }}>Vehicle:</strong> {actionModal.defect.vehicle}
              </div>
              {actionModal.defect.sourceType === "vehicleIssue" ? (
                <div>
                  <strong style={{ color: UI.text }}>Category:</strong> {actionModal.defect.categoryLabel || "Other"}
                </div>
              ) : null}
              <div>
                <strong style={{ color: UI.text }}>Item:</strong> #{actionModal.defect.defectIndex + 1} -{" "}
                {actionModal.defect.itemLabel}
              </div>

              {actionModal.defect.defectNote ? (
                <div style={{ marginTop: 10 }}>
                  <strong style={{ color: UI.text }}>Note:</strong>
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "#f8fafc",
                      border: UI.border,
                      borderRadius: 12,
                      padding: 12,
                      marginTop: 6,
                      color: UI.text,
                    }}
                  >
                    {actionModal.defect.defectNote}
                  </div>
                </div>
              ) : null}
            </div>

            {actionModal.decision === "approved" && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: UI.muted, marginBottom: 6 }}>
                  Route approved defect to:
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setActionModal((m) => ({ ...m, category: "general" }))}
                    style={{
                      ...btn("pill"),
                      borderColor: actionModal.category === "general" ? "#bfdbfe" : "#d1d5db",
                      background: actionModal.category === "general" ? UI.brandSoft : "#fff",
                      color: actionModal.category === "general" ? UI.brand : UI.text,
                    }}
                    disabled={actionLoading}
                  >
                    General Maintenance
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionModal((m) => ({ ...m, category: "immediate" }))}
                    style={{
                      ...btn("pill"),
                      borderColor: actionModal.category === "immediate" ? "#bfdbfe" : "#d1d5db",
                      background: actionModal.category === "immediate" ? UI.brandSoft : "#fff",
                      color: actionModal.category === "immediate" ? UI.brand : UI.text,
                    }}
                    disabled={actionLoading}
                  >
                    Immediate Defects
                  </button>
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                  Pick <strong style={{ color: UI.text }}>Immediate</strong> for safety-critical issues; otherwise use{" "}
                  <strong style={{ color: UI.text }}>General</strong>.
                </div>
              </div>
            )}

            <label style={{ display: "block", fontSize: 12, fontWeight: 900, color: UI.muted, marginBottom: 6 }}>
              Resolution comment (optional)
            </label>
            <textarea
              value={actionModal.comment}
              onChange={(e) => setActionModal((m) => ({ ...m, comment: e.target.value }))}
              rows={4}
              placeholder="e.g., Minor scratch; safe to operate. Logged for bodyshop visit."
              style={{ ...inputBase, minHeight: 96, marginBottom: 12, resize: "vertical" }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setActionModal(null)} style={btn("ghost")} disabled={actionLoading}>
                Cancel
              </button>

              <button
                onClick={performDecision}
                style={
                  actionModal.decision === "approved"
                    ? { ...btn("primary") }
                    : { ...btn("primary"), background: UI.danger, borderColor: UI.danger }
                }
                disabled={
                  checkingAdmin ||
                  !isAdmin ||
                  actionLoading ||
                  (actionModal.decision === "approved" && !actionModal.category)
                }
                title={!isAdmin ? "Admin only" : undefined}
              >
                {actionLoading ? "Saving..." : actionModal.decision === "approved" ? "Approve" : "Decline"}
              </button>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}

/* --------- toolbar + tiles --------- */
function SummaryCard({ title, value, footer, icon: Icon, tone = "brand", onClick }) {
  const colors =
    tone === "danger"
      ? { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b" }
      : tone === "ok"
      ? { bg: "#ecfdf5", border: "#bbf7d0", fg: "#065f46" }
      : { bg: UI.brandSoft, border: UI.brandBorder, fg: UI.brand };
  const clickable = typeof onClick === "function";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      style={{
        ...metricCard,
        minHeight: 92,
        minWidth: 0,
        maxWidth: "100%",
        width: "100%",
        textAlign: "left",
        fontFamily: "inherit",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800 }}>{title}</div>
          <div style={{ color: UI.text, fontSize: 28, lineHeight: 1.1, fontWeight: 850, marginTop: 8 }}>{value}</div>
        </div>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.bg,
            color: colors.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={2.2} />
        </span>
      </div>
      <div style={{ color: colors.fg, fontSize: 12, fontWeight: 750, marginTop: 8 }}>{footer}</div>
    </button>
  );
}

function RiskRing({ title, total, ok, soon, overdue }) {
  const safeTotal = Math.max(Number(total || 0), 0);
  const okPct = safeTotal ? Math.round((Number(ok || 0) / safeTotal) * 100) : 100;
  const soonPct = safeTotal ? Math.round((Number(soon || 0) / safeTotal) * 100) : 0;
  const overduePct = safeTotal ? Math.max(0, 100 - okPct - soonPct) : 0;
  const background = `conic-gradient(#16a34a 0 ${okPct}%, #f59e0b ${okPct}% ${okPct + soonPct}%, #dc2626 ${okPct + soonPct}% 100%)`;

  return (
    <div style={{ ...surface, padding: 12, minWidth: 0, maxWidth: "100%" }}>
      <div style={{ ...sectionHeader, marginBottom: 10 }}>
        <div>
          <h2 style={{ ...titleMd, fontSize: 15 }}>{title}</h2>
          <div style={hint}>{safeTotal} vehicles tracked</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0, flexWrap: "wrap" }}>
        <div
          style={{
            width: 126,
            height: 126,
            borderRadius: "50%",
            background,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 82,
              height: 82,
              borderRadius: "50%",
              background: "#ffffff",
              border: "1px solid #e5eaf0",
              display: "grid",
              placeItems: "center",
              color: UI.text,
              fontSize: 24,
              fontWeight: 850,
            }}
          >
            {safeTotal}
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <RingLegend color="#16a34a" label="OK" value={ok} />
          <RingLegend color="#f59e0b" label="Due soon" value={soon} />
          <RingLegend color="#dc2626" label="Overdue" value={overdue} />
        </div>
      </div>
    </div>
  );
}

function RingLegend({ color, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: UI.text, fontWeight: 750 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ minWidth: 72 }}>{label}</span>
      <span style={{ color: UI.muted }}>{value}</span>
    </div>
  );
}

function Tile({ title, description, onClick, rightBadges = [], disabled = false, icon: Icon = Wrench }) {
  return (
    <div
      style={{
        ...cardBase,
        background: "#ffffff",
        height: "100%",
        minHeight: 82,
        minWidth: 0,
        maxWidth: "100%",
        padding: "11px 12px",
        display: "flex",
        alignItems: "center",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      role="button"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      title={disabled ? "Admin only" : description}
      onClick={() => {
        if (!disabled) onClick();
      }}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? !disabled && onClick() : null)}
      onMouseEnter={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, cardHover);
      }}
      onMouseLeave={(e) =>
        Object.assign(e.currentTarget.style, {
          ...cardBase,
          background: "#ffffff",
          height: "100%",
          minHeight: 82,
          padding: "11px 12px",
          display: "flex",
          alignItems: "center",
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        })
      }
    >
      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "34px minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: `1px solid ${UI.brandBorder}`,
            background: UI.brandSoft,
            color: UI.brand,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 5,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.18, color: UI.text }}>
            {title}
          </div>
          <div style={{ color: UI.muted, fontSize: 12.5, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {description}
          </div>
          {rightBadges.length ? (
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {rightBadges.map((b, idx) => {
                const tone = b.tone || "soft";
                const s =
                  tone === "danger"
                    ? badge("#fef2f2", "#991b1b")
                    : tone === "amber"
                    ? badge("#fff7ed", "#9a3412")
                    : badge(UI.brandSoft, UI.brand);
                return (
                  <span key={idx} style={{ ...s, whiteSpace: "normal", overflowWrap: "anywhere" }}>
                    {b.label}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
        <span style={{ color: UI.brand, fontSize: 18, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>&gt;</span>
      </div>

    </div>
  );
}

function VehicleCheckTile({ onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? onClick() : null)}
      style={{
        ...cardBase,
        background: "#ffffff",
        height: "100%",
        minHeight: 82,
        minWidth: 0,
        maxWidth: "100%",
        padding: "11px 12px",
      }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardBase)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: `1px solid ${UI.brandBorder}`,
              background: "#eef4f9",
              color: UI.brand,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
            }}
          >
            <ClipboardCheck size={17} strokeWidth={2.2} />
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.18, color: UI.text }}>
              Vehicle Check
            </div>
            <div style={{ color: UI.muted, fontSize: 12.5, lineHeight: 1.25, marginTop: 5 }}>
              Submit daily checks and defects
            </div>
          </div>
        </div>
        <span style={{ color: UI.brand, fontSize: 18, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>&gt;</span>
      </div>
    </div>
  );
}
