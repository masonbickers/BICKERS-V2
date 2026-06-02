"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
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
  Plus,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Calendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer";
import {
  getCanonicalDueDate,
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
} from "../utils/maintenanceCalendar";
import { syncEightWeekInspectionRollovers } from "../utils/inspectionRollover";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";

const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
];

const VEHICLE_CHECK_PATH = "/vehicle-checks";
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;

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
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
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
});

const commandGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: UI.gap,
  alignItems: "stretch",
  marginBottom: UI.gap,
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const opsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const quickLinkGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
  alignItems: "stretch",
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
};

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
const daysUntil = (d) => {
  if (!d) return null;
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((t1 - t0) / (1000 * 60 * 60 * 24));
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

function VehicleHomeMaintenanceEvent({ event }) {
  const kind = event?.kind || "MAINTENANCE";
  const displayType = getMaintenanceDisplayType(event);
  const vehicleText = formatEventVehicleText(event?.vehicles);
  const equipmentText = formatEventEquipmentText(event?.equipment);
  const locationText = String(event?.location || "").trim();

  const label =
    kind === "MOT"
      ? event?.booked
        ? "MOT due - Booked"
        : "MOT due"
      : kind === "SERVICE"
      ? event?.booked
        ? "Service due - Booked"
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
      }}
    >
      <span style={{ color: UI.brand, fontWeight: 900, fontSize: 12 }}>{label}</span>
      <span style={{ color: UI.text }}>{event?.title || "Maintenance"}</span>
      {vehicleText ? <span style={{ fontSize: 11.5, fontWeight: 700, color: UI.text }}>{vehicleText}</span> : null}
      {equipmentText ? <span style={{ fontSize: 11.5, fontWeight: 700, color: UI.text }}>{equipmentText}</span> : null}
      {locationText ? <span style={{ fontSize: 11.5, fontWeight: 700, color: UI.muted }}>{locationText}</span> : null}
      {subline ? <span style={{ fontSize: 11.5, fontWeight: 800, color: UI.muted }}>{subline}</span> : null}
    </div>
  );
}

/* ----------------- Component ----------------- */
export default function VehiclesHomePage() {
  const router = useRouter();

  // Calendar state
  const [calView, setCalView] = useState("month");
  const [calDate, setCalDate] = useState(new Date());

  const [mounted, setMounted] = useState(false);

  //  Booked MOT/SERVICE from maintenanceBookings (source of truth)
  const [maintenanceBookingsRaw, setMaintenanceBookingsRaw] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);

  // Legacy: workBookings (if you still use it)
  const [workBookings, setWorkBookings] = useState([]);

  const [usageData, setUsageData] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

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
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCheckingAdmin(true);

      if (!user) {
        setIsAdmin(false);
        setCheckingAdmin(false);
        return;
      }

      const email = String(user.email || "").trim().toLowerCase();
      if (ADMIN_EMAILS.includes(email)) {
        setIsAdmin(true);
        setCheckingAdmin(false);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const role = String(userSnap.data()?.role || "").trim().toLowerCase();
        setIsAdmin(role === "admin");
      } catch (e) {
        console.error("vehicle-home admin check error:", e);
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    });

    return () => unsub();
  }, []);

  const requireAdmin = (message = "Admin access is required for this action.") => {
    if (isAdmin) return true;
    alert(message);
    return false;
  };

  /* --------- Load all vehicles ONCE for name + due date lookups --------- */
  useEffect(() => {
    const fetchVehicles = async () => {
      const snap = await getDocs(collection(db, "vehicles"));
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
    fetchVehicles();
  }, []);

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
    const fetchUsage = async () => {
      const { monthStart, monthEnd } = monthRange(usageMonth);
      const usedByDay = new Map();

      const snapshot = await getDocs(collection(db, "bookings"));
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

    fetchUsage();
  }, [usageMonth, vehicleNameMap]);

  /* --------- OPTIONAL: legacy workBookings maintenance blocks --------- */
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "workBookings"),
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
        console.warn("[workBookings] snapshot failed (ok if unused):", e);
        setWorkBookings([]);
      }
    );

    return () => unsub();
  }, []);

  /* ---------  REAL BOOKINGS: maintenanceBookings => calendar events --------- */
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "maintenanceBookings"),
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

        setMaintenanceBookingsRaw(raw);
      },
      (e) => {
        console.error("[maintenanceBookings] snapshot error:", e);
        setMaintenanceBookingsRaw([]);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "maintenanceJobs"),
      (snapshot) => {
        setMaintenanceJobs(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
      },
      (e) => {
        console.error("[maintenanceJobs] snapshot error:", e);
        setMaintenanceJobs([]);
      }
    );

    return () => unsub();
  }, []);

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

  // Load submitted checks + app-reported vehicle issues for the review queue
  useEffect(() => {
    const unsubChecks = onSnapshot(
      collection(db, "vehicleChecks"),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCheckDocs(docs.filter((c) => c.status === "submitted"));
      },
      (e) => {
        console.error("[vehicleChecks] snapshot error:", e);
        setCheckDocs([]);
      }
    );

    const unsubIssues = onSnapshot(
      collection(db, "vehicleIssues"),
      (snap) => {
        setVehicleIssueDocs(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
      },
      (e) => {
        console.error("[vehicleIssues] snapshot error:", e);
        setVehicleIssueDocs([]);
      }
    );

    return () => {
      unsubChecks();
      unsubIssues();
    };
  }, []);

  useEffect(() => {
    const unsubServiceRecords = onSnapshot(
      collection(db, "serviceRecords"),
      (snap) => setServiceRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => {
        console.error("[serviceRecords] snapshot error:", e);
        setServiceRecords([]);
      }
    );

    const unsubDefectReports = onSnapshot(
      collection(db, "defectReports"),
      (snap) => setDefectReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => {
        console.error("[defectReports] snapshot error:", e);
        setDefectReports([]);
      }
    );

    const unsubMotPreChecks = onSnapshot(
      collection(db, "motPreChecks"),
      (snap) => setMotPreChecks(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => {
        console.error("[motPreChecks] snapshot error:", e);
        setMotPreChecks([]);
      }
    );

    const unsubVehiclePrepRecords = onSnapshot(
      collection(db, "vehiclePrepRecords"),
      (snap) => setVehiclePrepRecords(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
      (e) => {
        console.error("[vehiclePrepRecords] snapshot error:", e);
        setVehiclePrepRecords([]);
      }
    );

    return () => {
      unsubServiceRecords();
      unsubDefectReports();
      unsubMotPreChecks();
      unsubVehiclePrepRecords();
    };
  }, []);

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
      console.error("defect review error:", e);
      alert("Could not update defect. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectEvent = (event) => {
    setSelectedEvent(event);
  };

  const openMaintenanceJobFromEvent = (event) => {
    if (!event?.vehicleId) return;
    const kind = String(event.kind || "").toLowerCase().includes("mot") ? "mot" : "service";
    const due = ymdDate(event?.dueDate || event?.start || "");
    const qs = new URLSearchParams({
      vehicleId: String(event.vehicleId),
      kind,
      dueDate: due,
      source: "vehicle-home",
    });
    router.push(`${MAINTENANCE_JOBS_PATH}?${qs.toString()}`);
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
    ],
    [motCounts, serviceCounts, recentActivity.length]
  );

  const eventPropGetter = (event) => {
    const kind = event?.kind || "MAINTENANCE";

    // Base palettes per kind
    let baseBg = UI.brandSoft;
    let baseBorder = "#bfdbfe";
    let baseText = UI.text;

    if (kind === "MOT") {
      baseBg = "#fff7ed";
      baseBorder = "#fed7aa";
      baseText = "#7c2d12";
      //  booked MOT due should look "success-ish"
      if (event?.booked) {
        baseBg = "#ecfdf5";
        baseBorder = "#bbf7d0";
        baseText = "#065f46";
      }
    }

    if (kind === "MOT_BOOKING") {
      baseBg = "#ecfdf5";
      baseBorder = "#bbf7d0";
      baseText = "#065f46";
      if (String(event?.bookingStatus || "").includes("After Expiry")) {
        baseBg = "#fef2f2";
        baseBorder = "#fecaca";
        baseText = "#991b1b";
      }
    }

    if (kind === "SERVICE") {
      baseBg = "#ecfdf5";
      baseBorder = "#bbf7d0";
      baseText = "#065f46";
      if (event?.booked) {
        baseBg = "#ecfdf5";
        baseBorder = "#bbf7d0";
        baseText = "#065f46";
      }
    }

    if (kind === "SERVICE_BOOKING") {
      baseBg = "#ecfdf5";
      baseBorder = "#bbf7d0";
      baseText = "#065f46";
    }

    if (kind === "MAINTENANCE_BOOKING") {
      baseBg = UI.brandSoft;
      baseBorder = "#bfdbfe";
      baseText = UI.text;
    }

    if (kind === "MAINTENANCE") {
      baseBg = UI.brandSoft;
      baseBorder = "#bfdbfe";
      baseText = UI.text;
    }

    // Escalate based on due date (skip for booking blocks)
    const dd = event?.dueDate ? new Date(event.dueDate) : null;
    const isBookingBlock =
      kind === "MOT_BOOKING" || kind === "SERVICE_BOOKING" || kind === "MAINTENANCE_BOOKING";
    const tone = dd && !isBookingBlock ? dueTone(dd) : "soft";

    // If due is booked, do not escalate to overdue/soon colours
    const suppressEscalation = (kind === "MOT" || kind === "SERVICE") && event?.booked;

    if (!suppressEscalation) {
      if (tone === "overdue") {
        baseBg = "#fef2f2";
        baseBorder = "#fecaca";
        baseText = "#991b1b";
      } else if (tone === "soon") {
        baseBg = "#fff7ed";
        baseBorder = "#fed7aa";
        baseText = "#9a3412";
      }
    }

    return {
      style: {
        borderRadius: 10,
        border: `1px solid ${baseBorder}`,
        background: baseBg,
        color: baseText,
        padding: 0,
        boxShadow: "0 2px 4px rgba(2,6,23,0.08)",
        overflow: "hidden",
      },
    };
  };

  return (
    <HeaderSidebarLayout>
      {/* subtle focus ring */}
      <style>{`
        input:focus, textarea:focus, button:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(29,78,216,0.15); border-color: #bfdbfe !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .vehicle-home-calendar--month .rbc-calendar { height: auto !important; }
        .vehicle-home-calendar--month .rbc-month-view { min-height: 1320px; height: auto; overflow: visible; }
        .vehicle-home-calendar--month .rbc-month-row { min-height: 195px; overflow: visible; flex: 1 0 auto; }
        .vehicle-home-calendar--month .rbc-row-content { max-height: none; min-height: 100%; }
        .vehicle-home-calendar--month .rbc-event-content { white-space: normal; }
        @media (max-width: 1180px) {
          .vehicle-home-command-grid { grid-template-columns: 1fr !important; }
          .vehicle-home-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .vehicle-home-ops-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .vehicle-home-summary-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={pageWrap}>
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
              <SummaryCard title="Pending Defects" value={kpiPending} icon={AlertTriangle} tone={kpiPending ? "danger" : "ok"} footer={`${pendingDefects.length} waiting review`} />
              <SummaryCard title="MOT Overdue" value={motCounts.overdue} icon={CalendarCheck} tone={motCounts.overdue ? "danger" : "ok"} footer={`${motCounts.soon} due soon`} />
              <SummaryCard title="Service Overdue" value={serviceCounts.overdue} icon={Wrench} tone={serviceCounts.overdue ? "danger" : "ok"} footer={`${serviceCounts.soon} due soon`} />
              <SummaryCard title="Usage Days" value={totalUsageDays} icon={Activity} tone="brand" footer={`${totalUsageBookings} bookings`} />
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
              <VehicleCheckTile onClick={() => router.push(VEHICLE_CHECK_PATH)} />
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

        {/* Usage chart */}
        <section style={{ ...premiumSection, marginTop: UI.gap, overflow: "visible" }}>
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

          <div style={{ height: 320, marginTop: 10 }}>
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

        {/* Calendar */}
        <section style={{ ...premiumSection, marginTop: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Maintenance calendar</h2>
              <div style={hint}>
                Shows scheduled maintenance bookings together with upcoming <b>MOT</b> and <b>service</b> due dates using the same operational model as the dashboard.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
              <span style={sectionTag}>Calendar view</span>
              <span style={chipSoft}>{calView}</span>
              <span style={badge("#fff7ed", "#9a3412")}>MOT due</span>
              <span style={badge("#ecfdf5", "#065f46")}>Booked MOT</span>
              <span style={badge("#ecfdf5", "#065f46")}>Booked Service</span>
              <span style={badge(UI.brandSoft, UI.brand)}>Maintenance</span>
              <button type="button" style={btn("ghost")} onClick={() => setCalDate(new Date())}>
                Today
              </button>
            </div>
          </div>

          <div
            style={{
              ...surface,
              boxShadow: "none",
              padding: 12,
              paddingBottom: calView === "month" ? 120 : 12,
              borderRadius: 12,
              overflow: "visible",
              height: calView === "month" ? "auto" : "calc(100vh - 340px)",
              minHeight: calView === "month" ? 1320 : undefined,
            }}
          >
            {mounted && (
              <Calendar
                className={calView === "month" ? "vehicle-home-calendar--month" : "vehicle-home-calendar"}
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                view={calView}
                onView={(v) => setCalView(v)}
                date={calDate}
                onNavigate={(d) => setCalDate(d)}
                views={["month", "week", "work_week", "day", "agenda"]}
                popup
                showAllEvents={calView === "month"}
                showMultiDayTimes
                style={{ height: calView === "month" ? "auto" : "100%" }}
                dayPropGetter={() => ({
                  style: { minHeight: "110px", borderRight: "1px solid #eef2f7" },
                })}
                eventPropGetter={eventPropGetter}
                components={{
                  event: ({ event }) => {
                    const kind = event?.kind || "MAINTENANCE";
                    const displayType = getMaintenanceDisplayType(event);
                    const vehicleText = formatEventVehicleText(event?.vehicles);
                    const equipmentText = formatEventEquipmentText(event?.equipment);
                    const locationText = String(event?.location || "").trim();

                    const label =
                      kind === "MOT"
                        ? event?.booked
                          ? "MOT due - Booked"
                          : "MOT due"
                        : kind === "SERVICE"
                        ? event?.booked
                          ? "Service due - Booked"
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
                    const toneText =
                      tone === "overdue" ? "Overdue" : tone === "soon" ? "Due soon" : tone === "ok" ? "OK" : "";

                    const subline =
                      isBookingBlock
                        ? (event?.bookingStatus || "Booked")
                        : (event?.booked && (kind === "MOT" || kind === "SERVICE"))
                        ? (event?.bookingStatus || "Booked")
                        : toneText;

                    return (
                      <div
                        title={event.title}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          fontSize: 12.5,
                          lineHeight: 1.3,
                          fontWeight: 900,
                          padding: 8,
                          letterSpacing: "0.01em",
                        }}
                      >
                        <span style={{ color: UI.brand, fontWeight: 900, fontSize: 12 }}>{label}</span>
                        <span style={{ color: UI.text }}>{event.title}</span>
                        {vehicleText ? (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: UI.text }}>{vehicleText}</span>
                        ) : null}
                        {equipmentText ? (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: UI.text }}>{equipmentText}</span>
                        ) : null}
                        {locationText ? (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: UI.muted }}>{locationText}</span>
                        ) : null}
                        {subline ? (
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: UI.muted }}>{subline}</span>
                        ) : null}
                      </div>
                    );
                  },
                  toolbar: (props) => (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: UI.text }}>{props.label}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <ToolbarBtn onClick={() => props.onNavigate("PREV")}>{"<"}</ToolbarBtn>
                        <ToolbarBtn onClick={() => props.onNavigate("TODAY")}>Today</ToolbarBtn>
                        <ToolbarBtn onClick={() => props.onNavigate("NEXT")}>{">"}</ToolbarBtn>

                        <ToolbarBtn active={props.view === "month"} onClick={() => props.onView("month")}>
                          Month
                        </ToolbarBtn>
                        <ToolbarBtn active={props.view === "week"} onClick={() => props.onView("week")}>
                          Week
                        </ToolbarBtn>
                        <ToolbarBtn active={props.view === "work_week"} onClick={() => props.onView("work_week")}>
                          Work Week
                        </ToolbarBtn>
                        <ToolbarBtn active={props.view === "day"} onClick={() => props.onView("day")}>
                          Day
                        </ToolbarBtn>
                        <ToolbarBtn active={props.view === "agenda"} onClick={() => props.onView("agenda")}>
                          Agenda
                        </ToolbarBtn>
                      </div>
                    </div>
                  ),
                }}
                onSelectEvent={handleSelectEvent}
              />
            )}
          </div>
        </section>

        {/* Event modal (only for non-vehicle routing events) */}
        {selectedEvent && (
          <div style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontWeight: 900, color: UI.text }}>
              {selectedEvent.title}
            </h3>
            <p style={{ margin: 0, color: UI.muted, fontSize: 13 }}>
              <strong style={{ color: UI.text }}>Start:</strong> {selectedEvent.start.toLocaleDateString("en-GB")}
            </p>
            <p style={{ margin: "6px 0 12px", color: UI.muted, fontSize: 13 }}>
              <strong style={{ color: UI.text }}>End:</strong> {selectedEvent.end.toLocaleDateString("en-GB")}
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {selectedEvent?.vehicleId ? (
                <button
                  onClick={() => openMaintenanceJobFromEvent(selectedEvent)}
                  style={btn("ghost")}
                >
                  {"Open jobs workspace ->"}
                </button>
              ) : null}
              {selectedEvent?.vehicleId ? (
                <button
                  onClick={() =>
                    router.push(`/vehicle-edit/${encodeURIComponent(selectedEvent.vehicleId)}`)
                  }
                  style={btn("primary")}
                >
                  {"Open vehicle ->"}
                </button>
              ) : null}
              <button onClick={() => setSelectedEvent(null)} style={btn("ghost")}>
                Close
              </button>
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

      {/* Global polish for RBC to match your style */}
      <style jsx global>{`
        .rbc-today {
          background: rgba(29, 78, 216, 0.08) !important;
        }
        .rbc-off-range-bg {
          background: #f8fafc !important;
        }
        .rbc-month-view,
        .rbc-time-view,
        .rbc-agenda-view {
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        .rbc-header {
          padding: 8px 6px;
          font-weight: 900;
          color: #0f172a;
          border-bottom: 1px solid #e5e7eb !important;
        }
        .rbc-time-content > * + * > * {
          border-left: 1px solid #eef2f7 !important;
        }
        .rbc-event {
          overflow: visible !important;
        }
        .rbc-toolbar button {
          border-radius: 999px !important;
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}

/* --------- toolbar + tiles --------- */
function SummaryCard({ title, value, footer, icon: Icon, tone = "brand" }) {
  const colors =
    tone === "danger"
      ? { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b" }
      : tone === "ok"
      ? { bg: "#ecfdf5", border: "#bbf7d0", fg: "#065f46" }
      : { bg: UI.brandSoft, border: UI.brandBorder, fg: UI.brand };

  return (
    <div style={{ ...metricCard, minHeight: 92 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
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
    </div>
  );
}

function RiskRing({ title, total, ok, soon, overdue }) {
  const safeTotal = Math.max(Number(total || 0), 0);
  const okPct = safeTotal ? Math.round((Number(ok || 0) / safeTotal) * 100) : 100;
  const soonPct = safeTotal ? Math.round((Number(soon || 0) / safeTotal) * 100) : 0;
  const overduePct = safeTotal ? Math.max(0, 100 - okPct - soonPct) : 0;
  const background = `conic-gradient(#16a34a 0 ${okPct}%, #f59e0b ${okPct}% ${okPct + soonPct}%, #dc2626 ${okPct + soonPct}% 100%)`;

  return (
    <div style={{ ...surface, padding: 12 }}>
      <div style={{ ...sectionHeader, marginBottom: 10 }}>
        <div>
          <h2 style={{ ...titleMd, fontSize: 15 }}>{title}</h2>
          <div style={hint}>{safeTotal} vehicles tracked</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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

function ToolbarBtn({ children, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...btn("pill"),
        borderColor: active ? "#bfdbfe" : "#d1d5db",
        background: active ? UI.brandSoft : "#fff",
        color: active ? UI.brand : UI.text,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "#ffffff";
      }}
    >
      {children}
    </button>
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
                  <span key={idx} style={s}>
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
        padding: "11px 12px",
      }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardBase)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", justifyContent: "space-between" }}>
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

          <div style={{ flex: 1 }}>
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
