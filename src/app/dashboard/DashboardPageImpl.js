// src/app/dashboard/page.js
"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import "./dashboard.calendar.css";
import layoutStyles from "./DashboardPageImpl.styles.module.css";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { auth, db } from "@/app/utils/firebaseClient";
import { useRouter } from "next/navigation";
import { Calendar as BigCalendar } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop/index.js";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const DraggableBigCalendar = withDragAndDrop(BigCalendar);

import { localizer } from "../utils/localizer";
import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  CALENDAR_REMINDER_WORKFLOW_KEYS,
  buildAssetLabel,
  getCanonicalDueDate,
  getIsoWeekLabel,
  isVehicleOutOfUse,
  ymd,
} from "../utils/maintenanceSchema";
import {
  buildActiveInspectionMetaByVehicle,
  buildBookedMetaByVehicle,
  buildMaintenanceBookingEvents,
  buildMaintenanceBookingDraftFromDueEvent,
  dedupeMaintenanceCalendarEvents,
  getMaintenanceBookingKind,
  getMaintenanceDisplayType,
  isMaintenanceCalendarEventDraggable,
  isMaintenanceMoveOutsideDueWeek,
  reconcileMaintenanceEventVehicle,
  shouldExcludeFromWorkDiary,
} from "../utils/maintenanceCalendar";
import {
  buildHolidayCalendarTitle,
  buildHolidayEmployeeLabel,
} from "../utils/dashboardHolidayLabels";
import {
  rescheduleMaintenanceBooking,
} from "../utils/maintenanceMutationClient";
import {
  collection,
  onSnapshot,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  PREP_STORAGE_KEYS,
  isVehiclePrepped,
  mergePrepRecordSources,
} from "./dashboardVehiclePrep";

import ViewBookingModal from "../components/ViewBookingModal";
import ViewUCraneBooking from "../components/ViewUCraneBooking";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { OperationsHeaderActions, OperationsPage, OperationsPageHeader } from "@/app/components/OperationsPage";
import { useAuth } from "@/app/context/authContext";
import {
  CalendarDays,
  BedDouble,
  Check,
  ChevronDown,
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
  X,
} from "lucide-react";
import EditHolidayForm from "../components/EditHolidayForm";
import HolidayForm from "../components/holidayform";
import CreateNote from "../components/create-note";
import EditNoteModal from "../components/EditNoteModal";
import DashboardMaintenanceModal from "../components/DashboardMaintenanceModal";
import MaintenanceBookingForm from "../components/MaintenanceBookingForm";
import MaintenanceBookingPickerModal from "../components/MaintenanceBookingPickerModal";
import MaintenanceCalendarPanel from "../components/MaintenanceCalendarPanel";
import RouteLoadingOverlay from "../components/RouteLoadingOverlay";
import QuotePdfViewer from "../components/QuotePdfViewer";
import { cacheBookingForEdit } from "@/app/utils/editBookingCache";
import {
  alignLinkedContinuationCalendarEvents,
  linkedJobNumberLabel,
} from "@/app/utils/linkedBookingContinuation";
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
import { Badge, Button, Input, Modal, Spinner } from "@/app/components/ui";
import { FIXED_JOB_STATUS_STYLES, getFixedJobStatusStyle, getFixedJobStatusSurfaceStyle } from "@/app/utils/jobStatusColors";
import { findBookingQuoteDocument } from "@/app/utils/bookingQuoteDocument";
import { hasImportedQuoteSelection, verifiedImportedQuoteNumber } from "@/app/utils/importedQuoteMatch";
import { buildDiaryBookingReturnTo } from "@/app/utils/quoteNavigation";
import {
  buildDashboardVehicleRegister,
  resolveDashboardVehicleDisplays,
  resolveDashboardVehicles,
} from "@/app/utils/dashboardVehicleResolver";
import {
  buildSynchronizedVehicleStatus,
  canonicalBookingStatus,
  isInactiveBookingStatus,
} from "@/app/utils/bookingLifecycle";
import { buildBookingVehicleWarnings } from "@/app/utils/bookingVehicleWarnings";
import {
  isUCraneBooking,
  isUCraneVehicle,
} from "@/app/utils/uCraneBookingConfiguration";

const OFF_ROAD_ALLOWED_GROUPS = new Set([
  "bike",
  "electric tracking vehicles",
  "small tracking vehicles",
]);
const isOffRoadAllowedGroup = (group) =>
  OFF_ROAD_ALLOWED_GROUPS.has(String(group || "").trim().toLowerCase());

const NIGHT_SHOOT_STYLE = {
  bg: "var(--job-status-night-surface)",
  text: "var(--job-status-large-text, var(--job-status-text-dark))",
  border: "var(--job-status-night)",
};

// ---- status colour map used for per-vehicle pills ----
const STATUS_COLORS = {
  ...FIXED_JOB_STATUS_STYLES,
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
  STATUS_COLORS[normalizeStatusLabel(s)] || getFixedJobStatusStyle(s);

const WORK_DIARY_BORDERS = {
  ...Object.fromEntries(Object.entries(FIXED_JOB_STATUS_STYLES).map(([status, style]) => [status, style.border])),
};

const getWorkDiaryBorder = (status, fallback) =>
  WORK_DIARY_BORDERS[normalizeStatusLabel(status)] || fallback;

const getVehicleStatusPillStyle = (status) => {
  const normalizedStatus = normalizeStatusLabel(status);
  const tone = getStatusStyle(normalizedStatus);

  if (normalizedStatus === "Confirmed") {
    return getFixedJobStatusSurfaceStyle(normalizedStatus);
  }

  if (normalizedStatus === "Bickers") {
    return {
      ...tone,
      bg: "var(--color-brand-soft)",
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
const CALENDAR_ACCESS_OPTIONS = { requireCompany: false, signedInWide: true };

const normalizeUCraneText = (value) => String(value || "").trim().toLowerCase();
const containsUCrane = (value) => {
  const text = normalizeUCraneText(value);
  return text.includes("u-crane") || text.includes("u crane") || text.includes("ucrane");
};

const maintenanceIsUCrane = (item, vehicleKeys) => {
  if (!item) return false;
  if (item.uCrane === true || item.isUCrane === true) return true;
  const candidates = [
    item.vehicleId,
    item.vehicle,
    item.vehicleName,
    item.assetId,
    item.asset,
    item.assetName,
    item.title,
    item.name,
    item.category,
    item.group,
  ];
  return candidates.some((candidate) => {
    if (candidate && typeof candidate === "object") {
      return isUCraneVehicle(candidate) || vehicleKeys.has(normalizeUCraneText(candidate.id));
    }
    return containsUCrane(candidate) || vehicleKeys.has(normalizeUCraneText(candidate));
  });
};

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

const getBookingProductionLabel = (booking = {}) => {
  return String(
    booking.production ||
      booking.productionCompany ||
      booking.client ||
      booking.title ||
      "No production"
  ).trim();
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
          title: getBookingProductionLabel(b),
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
        title: getBookingProductionLabel(b),
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

  const hasImportedSelection = hasImportedQuoteSelection(event);
  return String(
    event.acceptedQuoteNumber ||
      latestQuote?.quoteNumber ||
      event.quote?.quoteNumber ||
      (hasImportedSelection
        ? verifiedImportedQuoteNumber(event)
        : event.quoteNumber || (Array.isArray(event.quoteNumbers) ? event.quoteNumbers.at(-1) : "")) ||
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
  const hasImportedSelection = hasImportedQuoteSelection(event);
  if (hasImportedSelection) {
    addFallback(getEventQuoteNumber(event));
  } else {
    addFallback(event.quoteNumber);
    (Array.isArray(event.quoteNumbers) ? event.quoteNumbers : []).forEach(addFallback);
  }

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
    <span title={title} aria-label={title} className={layoutStyles.metaBadge} data-good={good}>
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
  const quoteDocumentForView = !isMaintenance && !isNote
    ? findBookingQuoteDocument(event, quoteNumberForView)
    : null;
  const canViewQuote = Boolean(
    quoteNumberForView && (quoteDocumentForView?.url || quoteOptionsForView.length)
  );

  if (isNote) {
    return (
      <div
        title={event.title || "Note"}
        className={layoutStyles.extracted3}
      >
        <span className={layoutStyles.extracted4}>NOTE</span>
        <span>{event.title || "Note"}</span>
        {event.employee ? <span className={layoutStyles.extracted5}>{event.employee}</span> : null}
      </div>
    );
  }

  return (
    <div
      title={event.noteToShow || ""}
      className={`${layoutStyles.extracted6} work-diary-event-card-content`}
    >
      {event.status === "Bank Holiday" ? (
        <>
          <span className={layoutStyles.extracted7}>BANK HOLIDAY</span>
          <span className={layoutStyles.extracted8}>{event.bankHolidayName || event.title}</span>
        </>
      ) : event.status === "Holiday" ? (
        <>
          <span>{event.employee}</span>
          <span className={layoutStyles.extracted9}>{formatHolidayDetail(event)}</span>
        </>
      ) : (
        <>
          {/* Top row: initials + status + job number */}
          <div
            className={layoutStyles.extracted10}
          >
            {employeeInitials.length > 0 && (
              <span
                className={layoutStyles.extracted11}
              >
                {employeeInitialLines.map((line, index) => (
                  <span key={`${line.join("-")}-${index}`}>{line.join(", ")}</span>
                ))}
              </span>
            )}

            <div className={layoutStyles.extracted12}>
              <div className={layoutStyles.extracted13}>
                <span className={layoutStyles.extracted14}>
                  {isMaintenance ? event.bookingStatus || "Maintenance" : event.status}
                </span>

                {/*  UPDATED: if crewed, show "CREWED" only (no crew needed counts) */}
                {isCrewed && (
                  <span
                    className={layoutStyles.extracted15}
                  >
                    <Check size={12} strokeWidth={3} />CREWED
                  </span>
                )}

                {/*  UPDATED: only show crew needed badge when NOT crewed */}
                {!isMaintenance && !isCrewed && crewNeeded !== null && (
                  <span
                    className={layoutStyles.extracted16}
                    title="Crew needed for this job"
                  >
                    {`CREW: ${crewNeeded}`}
                  </span>
                )}
              </div>

              <span
                className={layoutStyles.jobNumber}
                data-shoot={String(event.shootType || "").toLowerCase()}
                title={event.linkedContinuation?.fromJobNumber ? "Linked job continuation" : undefined}
              >
                {linkedJobNumberLabel(event)}
              </span>
              {canViewQuote ? (
                <Button bare
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
                      documentUrl: quoteDocumentForView?.url || "",
                    });
                  }}
                  title={`View quote ${quoteNumberForView}`}
                  aria-label={`View quote ${quoteNumberForView}`}
                  className={layoutStyles.extracted17}
                >
                  <FileText size={14} strokeWidth={2.7} />
                </Button>
              ) : null}
            </div>
          </div>

          {!isMaintenance && <span>{getBookingProductionLabel(event)}</span>}
          {isMaintenance && (
            <span className={layoutStyles.extracted18}>
              {event.title || event.maintenanceTypeLabel || "Maintenance"}
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
              className={layoutStyles.extracted19}
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
              const bookingStatusLabel = canonicalBookingStatus(event.status);
              const shouldUseJobStatusForVehicle =
                isInactiveBookingStatus(bookingStatusLabel) ||
                bookingStatusLabel === "Complete";

              const prepped = isVehiclePrepped(event.prepRecordsByKey, event, i);
              const preppedBadge = prepped ? (
                <span
                  className={layoutStyles.vehiclePreppedBadge}
                  title="Vehicle is clean, loaded and ready to leave for this job"
                  aria-label="Vehicle prepped: clean, loaded and ready to leave"
                >
                  <Check size={11} strokeWidth={3} /> PREPPED
                </span>
              ) : null;

              if (shouldUseJobStatusForVehicle) {
                return (
                  <span key={i} className={layoutStyles.vehicleLine}>
                    <span>
                      {name}
                      {plate ? ` - ${plate}` : ""}
                    </span>
                    {preppedBadge}
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
                  <span key={i} className={layoutStyles.vehicleLine}>
                    <span
                      className={layoutStyles.extracted20}
                      title="Vehicle non-compliant (SORN or not insured) - current or future confirmed job"
                    >
                      {name}
                      {plate ? ` - ${plate}` : ""}
                    </span>
                    {preppedBadge}
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

                // style-audit-allow runtime: booking status palette
                return (
                  <span key={i} className={layoutStyles.vehicleLine}>
                    <span className={layoutStyles.vehiclePill} style={{ "--pill-background": style.bg, "--pill-text": style.text }}
                      title={`Vehicle status: ${itemStatus}`}
                    >
                      {name}
                      {plate ? ` - ${plate}` : ""}
                    </span>
                    {preppedBadge}
                  </span>
                );
              }

              return (
                <span key={i} className={layoutStyles.vehicleLine}>
                  <span>
                    {name}
                    {plate ? ` - ${plate}` : ""}
                  </span>
                  {preppedBadge}
                </span>
              );
            })}

          {equipmentText ? (
            <span className={layoutStyles.extracted21}>
              {equipmentText}
            </span>
          ) : null}
          {locationText ? (
            <span className={layoutStyles.extracted22}>
              {locationText}
            </span>
          ) : null}

          {/* Notes */}
          {(event.notes ||
            (!isMaintenance &&
              !hideDayNotes &&
              event.notesByDate &&
              Object.keys(event.notesByDate).length > 0)) && (
            <div className={layoutStyles.extracted23}>
              {!isMaintenance &&
                !hideDayNotes &&
                event.notesByDate &&
                Object.keys(event.notesByDate).length > 0 && (
                  <div className={layoutStyles.extracted24}>
                    {Object.keys(event.notesByDate)
                      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                      .sort((a, b) => new Date(a) - new Date(b))
                      .reduce((cols, date, i) => {
                        const col = Math.floor(i / 3);
                        (cols[col] ||= []).push(date);
                        return cols;
                      }, [])
                      .map((chunk, colIndex) => (
                        <div key={colIndex} className={layoutStyles.extracted25}>
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
                                className={layoutStyles.extracted26}
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
                  <Button bare
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowNotes((s) => !s);
                    }}
                    className={layoutStyles.extracted27}
                  >
                    {showNotes ? "Hide Notes" : "Show Notes"}
                  </Button>

                  {showNotes && (
                    <div
                      className={layoutStyles.extracted28}
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
                className={layoutStyles.extracted29}
              >
                {!isBickersJob && (
                  <EventMetaBadge
                    Icon={ShieldCheck}
                    good={!!event.hasHS}
                    title={event.hasHS ? "Health and safety present" : "No health and safety"}
                  />
                )}

                {!isBickersJob && (
                  <span title={event.hasRiskAssessment ? "Risk assessment present" : "No risk assessment"} aria-label={event.hasRiskAssessment ? "Risk assessment present" : "No risk assessment"} className={layoutStyles.metaBadge} data-good={event.hasRiskAssessment}>
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
            <div className={layoutStyles.extracted30}>
              <Button bare
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/recce-form/${event.recceId}`);
                }}
                title="Open full recce form"
                className={layoutStyles.extracted31}
              >
                View recce form
                {event.recceStatus && (
                  <span
                    className={layoutStyles.extracted32}
                  >
                    {(event.recceStatus || "Submitted").toUpperCase()}
                  </span>
                )}
              </Button>
            </div>
          )}

          {/* Risk box */}
          {event.isRisky && Array.isArray(event.riskReasons) && event.riskReasons.length > 0 && (
            <div className={layoutStyles.extracted33}>
              <div
                className={layoutStyles.extracted34}
              >
                VEHICLE COMPLIANCE ISSUE
              </div>
              <div
                className={layoutStyles.extracted35}
              >
                {/* style-audit-allow runtime: spacing between calculated risk reasons */}
                {event.riskReasons.map((r, i) => (
                  <div key={i} className={layoutStyles.riskReason} style={{ "--risk-margin": i ? "3px" : 0 }}>
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

function HolidayNotesCalendarEvent({ event }) {
  const [expanded, setExpanded] = useState(false);
  const isHoliday = event.status === "Holiday";
  const label = isHoliday ? "Holiday" : "Note";
  const title = isHoliday
    ? buildHolidayEmployeeLabel(event.employee, event)
    : event.title || "Note";
  const titleText = String(title || "");
  const shouldCollapse = !isHoliday && titleText.length > 110;
  const displayTitle = shouldCollapse && !expanded ? `${titleText.slice(0, 110).trim()}...` : titleText;
  const detail = isHoliday
    ? formatHolidayDetail(event)
    : event.blocksEmployeeBooking && event.employee
    ? `${event.employee} unavailable`
    : event.employee || "Shared note";
  const labelColor = isHoliday ? "var(--color-text-muted)" : "var(--color-brand)";

  return (
    <div
      title={event.title || title}
      className={layoutStyles.extracted43}
    >
      {/* style-audit-allow runtime: holiday/note label colour */}
      <span className={`${layoutStyles.eventLabel} ${layoutStyles.eventLabelSmall}`} style={{ "--event-label-color": labelColor }}>{label}</span>
      <span className={layoutStyles.holidayTitle} data-collapsed={shouldCollapse && !expanded}>
        {displayTitle}
      </span>
      {shouldCollapse ? (
        <Button bare
          type="button"
          onClick={(clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            setExpanded((value) => !value);
          }}
          className={layoutStyles.extracted44}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
      {detail ? (
        <span className={layoutStyles.extracted45}>{detail}</span>
      ) : null}
    </div>
  );
}

function holidayNotesEventPropGetter(event) {
  const isHoliday = event.status === "Holiday";
  const bg = isHoliday ? "var(--color-border)" : "var(--color-border)";
  const border = isHoliday ? "var(--color-text-muted)" : "var(--color-brand)";
  const text = isHoliday ? "var(--color-text)" : "var(--color-brand-hover)";

  return {
    style: {
      borderRadius: 7,
      borderTop: `1px solid ${border}`,
      borderRight: `1px solid ${border}`,
      borderBottom: `1px solid ${border}`,
      borderLeft: `4px solid ${border}`,
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
  const router = useRouter();
  const quoteOptions = Array.isArray(viewer?.quoteOptions) ? viewer.quoteOptions : [];
  const hasViewer = Boolean(viewer?.bookingId && quoteOptions.length);
  const currentIndex = Math.max(0, Math.min(Number(viewer?.index) || 0, Math.max(0, quoteOptions.length - 1)));
  const currentQuote = quoteOptions[currentIndex] || null;
  const returnTo =
    typeof window !== "undefined"
      ? buildDiaryBookingReturnTo({
          pathname: window.location.pathname,
          search: window.location.search,
          bookingId: viewer?.bookingId,
        })
      : "/dashboard";
  const quoteSrcParams = new URLSearchParams({
    quote: currentQuote?.quoteNumber || "",
    embed: "1",
    returnTo,
  });
  const editBookingParams = new URLSearchParams({ returnTo });
  const quoteSrc = hasViewer
    ? `/quote-view/${encodeURIComponent(viewer.bookingId)}?${quoteSrcParams.toString()}`
    : "";
  const editBookingHref = hasViewer
    ? `/edit-booking/${encodeURIComponent(viewer.bookingId)}?${editBookingParams.toString()}`
    : "";
  const hasMany = quoteOptions.length > 1;
  const [frameStatus, setFrameStatus] = useState("loading");

  useEffect(() => {
    setFrameStatus("loading");
  }, [quoteSrc]);

  useEffect(() => {
    if (!hasViewer) return undefined;
    const handleQuoteStatus = (event) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.type !== "bickers:quote-view-status") return;
      if (String(message.bookingId || "") !== String(viewer.bookingId)) return;
      if (message.status === "ready" || message.status === "not-found") {
        setFrameStatus(message.status);
      }
    };
    window.addEventListener("message", handleQuoteStatus);
    return () => window.removeEventListener("message", handleQuoteStatus);
  }, [hasViewer, viewer?.bookingId]);

  if (!hasViewer || !currentQuote) return null;

  const handleEditBooking = () => {
    onClose?.();
    router.push(editBookingHref);
  };

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Quote view"
      title={`${viewer.jobNumber ? `#${viewer.jobNumber} - ` : ""}${viewer.client || "Quote"}`}
      description={`${currentQuote.label || currentQuote.quoteNumber}${hasMany ? ` (${currentIndex + 1} of ${quoteOptions.length})` : ""}`}
      size="lg"
      density="compact"
      className={layoutStyles.quoteViewerModal}
      bodyClassName={layoutStyles.quoteViewerBody}
      headerActions={
        <div className={layoutStyles.quoteViewerActions}>
          {hasMany ? (
            <>
              <Button variant="secondary" size="sm" type="button" onClick={() => onMove?.(-1)}>
                <ChevronLeft size={15} /> Previous
              </Button>
              <Button variant="secondary" size="sm" type="button" onClick={() => onMove?.(1)}>
                Next <ChevronRight size={15} />
              </Button>
            </>
          ) : null}
          <Button size="sm" type="button" onClick={handleEditBooking}>Edit Booking</Button>
        </div>
      }
    >
      <div className={layoutStyles.quoteViewerFrameWrap}>
        {frameStatus === "loading" ? (
          <div className={layoutStyles.quoteViewerStatus} role="status" aria-live="polite">
            <Spinner />
            <strong>Loading quote…</strong>
            <span>Preparing {currentQuote.label || currentQuote.quoteNumber}.</span>
          </div>
        ) : null}
        {frameStatus === "not-found" ? (
          <div className={layoutStyles.quoteViewerStatus} role="alert">
            <strong>Quote unavailable</strong>
            <span>The booking or selected quote could not be loaded.</span>
          </div>
        ) : null}
        <iframe
          key={quoteSrc}
          title="Quote viewer"
          src={quoteSrc}
          scrolling="no"
          className={layoutStyles.quoteViewerFrame}
          data-ready={frameStatus === "ready"}
        />
      </div>
    </Modal>
  );
}

/* ------------------------------- Page component ----------------------------- */
export default function DashboardPage({ bookingSaved, initialDate = "", initialView = "week", initialBookingId = "", mode = "dashboard" }) {
  const router = useRouter();
  const isUCraneMode = mode === "u-crane";
  const workDiaryCalendarRef = useRef(null);
  const authAccess = useAuth() || {};
  const authEmail = String(authAccess.userDoc?.email || authAccess.user?.email || "").trim().toLowerCase();
  const canUseAdminDashboardFallback = !!authAccess.isAdmin || isAdminEmail(authEmail);
  const useAdminDashboardData = false;
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user?.uid ? { uid: authAccess.user.uid } : null,
      userDoc: authAccess.userDoc?.uid
        ? {
            uid: authAccess.userDoc.uid,
            role: authAccess.userDoc.role,
            companyId: authAccess.userDoc.companyId,
            isEnabled: authAccess.userDoc.isEnabled,
            disabled: authAccess.userDoc.disabled,
            archived: authAccess.userDoc.archived,
            isArchived: authAccess.userDoc.isArchived,
          }
        : null,
      isEnabled: authAccess.isEnabled,
      loading: authAccess.loading,
      accessReady: authAccess.accessReady,
    }),
    [
      authAccess.accessReady,
      authAccess.isEnabled,
      authAccess.loading,
      authAccess.user?.uid,
      authAccess.userDoc?.uid,
      authAccess.userDoc?.role,
      authAccess.userDoc?.companyId,
      authAccess.userDoc?.isEnabled,
      authAccess.userDoc?.disabled,
      authAccess.userDoc?.archived,
      authAccess.userDoc?.isArchived,
    ]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [allBookings, setBookings] = useState([]);
  const [allDeletedBookings, setDeletedBookings] = useState([]);
  const [calendarView, setCalendarView] = useState(() => normalizeCalendarView(initialView));
  const [currentDate, setCurrentDate] = useState(() => getDashboardInitialDate(initialDate));
  const [holidays, setHolidays] = useState([]);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [createNoteDate, setCreateNoteDate] = useState("");
  const [notes, setNotes] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(initialBookingId || null);
  const [selectedDeletedId, setSelectedDeletedId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingHolidayId, setEditingHolidayId] = useState(null);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [createBookingOpening, setCreateBookingOpening] = useState(false);
  const [createBookingProgress, setCreateBookingProgress] = useState(0);
  const [createEnquiryOpening, setCreateEnquiryOpening] = useState(false);
  const [createEnquiryProgress, setCreateEnquiryProgress] = useState(0);
  const [quoteViewer, setQuoteViewer] = useState(null);
  const [quotePdfViewer, setQuotePdfViewer] = useState(null);
  const [showMoreBookingsBelow, setShowMoreBookingsBelow] = useState(false);

  const [allMaintenanceBookings, setMaintenanceBookings] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);
  const [allVehiclesData, setVehiclesData] = useState([]);
  const [localPrepRecordsByKey, setLocalPrepRecordsByKey] = useState({});
  const [sharedPrepRecordsByKey, setSharedPrepRecordsByKey] = useState({});
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState(null);
  const [pendingMaintenanceDrop, setPendingMaintenanceDrop] = useState(null);
  const [maintenanceDropDraft, setMaintenanceDropDraft] = useState(null);
  const [showCreateMaintenancePicker, setShowCreateMaintenancePicker] = useState(false);
  const [createMaintenanceVehicleId, setCreateMaintenanceVehicleId] = useState("");
  const [createMaintenanceType, setCreateMaintenanceType] = useState("WORK");
  const [createMaintenanceEquipment, setCreateMaintenanceEquipment] = useState("");

  const uCraneVehicleKeys = useMemo(() => {
    const keys = new Set();
    allVehiclesData.filter(isUCraneVehicle).forEach((vehicle) => {
      [vehicle.id, vehicle.name, vehicle.registration].forEach((value) => {
        const key = normalizeUCraneText(value);
        if (key) keys.add(key);
      });
    });
    return keys;
  }, [allVehiclesData]);

  const vehiclesData = useMemo(
    () => isUCraneMode ? allVehiclesData.filter(isUCraneVehicle) : allVehiclesData,
    [allVehiclesData, isUCraneMode]
  );
  const prepRecordsByKey = useMemo(
    () => mergePrepRecordSources(localPrepRecordsByKey, sharedPrepRecordsByKey),
    [localPrepRecordsByKey, sharedPrepRecordsByKey]
  );
  const bookings = useMemo(
    () => isUCraneMode
      ? allBookings.filter((booking) => isUCraneBooking(booking, allVehiclesData))
      : allBookings,
    [allBookings, allVehiclesData, isUCraneMode]
  );
  const deletedBookings = useMemo(
    () => isUCraneMode
      ? allDeletedBookings.filter((booking) => isUCraneBooking(booking, allVehiclesData))
      : allDeletedBookings,
    [allDeletedBookings, allVehiclesData, isUCraneMode]
  );
  const maintenanceBookings = useMemo(
    () => isUCraneMode
      ? allMaintenanceBookings.filter((item) => maintenanceIsUCrane(item, uCraneVehicleKeys))
      : allMaintenanceBookings,
    [allMaintenanceBookings, isUCraneMode, uCraneVehicleKeys]
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const readLocalPrepRecords = () => {
      const sources = PREP_STORAGE_KEYS.map((storageKey) => {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
          console.warn(`[diary-prep] Failed reading ${storageKey}:`, error);
          return {};
        }
      });
      setLocalPrepRecordsByKey(mergePrepRecordSources(...sources));
    };

    readLocalPrepRecords();
    const handleStorage = (event) => {
      if (PREP_STORAGE_KEYS.includes(event.key)) readLocalPrepRecords();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!authReady) return undefined;
    return onSnapshot(
      doc(db, "appState", "preplistShared"),
      (snapshot) => {
        const records = snapshot.data()?.prepRecordsByKey;
        setSharedPrepRecordsByKey(
          records && typeof records === "object" && !Array.isArray(records) ? records : {}
        );
      },
      (error) => {
        if (!handleFirestoreAccessError(error, { collectionName: "appState", operation: "listen diary vehicle prep state" })) {
          console.error("[diary-prep] Shared prep listener failed:", error);
        }
        setSharedPrepRecordsByKey({});
      }
    );
  }, [accessKey, authReady]);
  //  Holiday modal
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);

  //  Create Note modal
  const [createNoteOpen, setCreateNoteOpen] = useState(false);

  const handleCloseBookingModal = useCallback(() => {
    setSelectedBookingId(null);
    setSelectedDeletedId(null);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("booking")) return;
    params.delete("booking");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
  }, []);

  const openQuoteViewer = useCallback((payload) => {
    const documentUrl = String(payload?.documentUrl || "").trim();
    if (documentUrl) {
      setQuotePdfViewer({
        url: documentUrl,
        quoteNumber: payload?.initialQuoteNumber || "",
        jobNumber: payload?.jobNumber || "",
        client: payload?.client || "",
      });
      return;
    }
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

  const openBookingQuoteViewer = useCallback((booking, initialQuoteNumber = "") => {
    const bookingId = String(booking?.id || "").trim();
    if (!bookingId) return;

    const quoteNumber = String(initialQuoteNumber || getEventQuoteNumber(booking)).trim();
    const quoteOptions = getEventQuoteOptions(booking);
    const quoteDocument = findBookingQuoteDocument(booking, quoteNumber);

    openQuoteViewer({
      bookingId,
      jobNumber: booking?.jobNumber || "",
      client: booking?.client || booking?.productionCompany || booking?.title || "Quote",
      quoteOptions,
      initialQuoteNumber: quoteNumber,
      documentUrl: quoteOptions.length ? "" : quoteDocument?.url || "",
    });
  }, [openQuoteViewer]);

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

  useEffect(() => {
    if (initialBookingId) setSelectedBookingId(initialBookingId);
  }, [initialBookingId]);

  useEffect(() => {
    const handleQuoteViewMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "bickers:quote-back") {
        const bookingId = String(event.data?.bookingId || "").trim();
        if (!bookingId) return;
        setQuoteViewer(null);
        setSelectedBookingId(bookingId);
        const params = new URLSearchParams(window.location.search);
        params.set("booking", bookingId);
        const query = params.toString();
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}`
        );
        return;
      }
      if (event.data?.type !== "bickers:quote-edit") return;
      const href = String(event.data?.href || "");
      if (!href.startsWith("/quote/")) return;
      setQuoteViewer(null);
      router.push(href);
    };

    window.addEventListener("message", handleQuoteViewMessage);
    return () => window.removeEventListener("message", handleQuoteViewMessage);
  }, [router]);

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
    setMaintenanceView((prev) => {
      const nextView = normalizeCalendarView(initialView);
      return prev === nextView ? prev : nextView;
    });
  }, [initialView]);

  useEffect(() => {
    adminDashboardFallbackRef.current = { inFlight: false, loaded: false };
  }, [accessKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const routeBase = isUCraneMode ? "/u-crane" : "/dashboard";
    if (window.location.pathname !== routeBase) return;

    const params = new URLSearchParams(window.location.search);
    const dateKey = ymd(currentDate);
    if (dateKey) params.set("date", dateKey);
    params.set("view", normalizeCalendarView(calendarView));

    const query = params.toString();
    const nextUrl = `${routeBase}${query ? `?${query}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [calendarView, currentDate, isUCraneMode]);

  useEffect(() => {
    router.prefetch(isUCraneMode ? "/u-crane-booking" : "/create-booking");
  }, [isUCraneMode, router]);

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

    try {
      router.push(isUCraneMode ? "/u-crane-booking" : "/create-booking");
    } catch (error) {
      console.error("Open create booking failed:", error);
      setCreateBookingOpening(false);
      setCreateBookingProgress(0);
      systemDialogs.showSystemNotification("Failed to open create booking. Please try again.");
    }
  }, [createBookingOpening, createEnquiryOpening, isRestricted, isUCraneMode, router]);

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
        systemDialogs.showSystemNotification("Failed to open create enquiry. Please try again.");
      }
    }, 80);
  }, [createBookingOpening, createEnquiryOpening, isRestricted, router]);

  const getEditBookingUrl = useCallback(
    (bookingOrId) => {
      if (isRestricted) return "";
      const booking =
        bookingOrId && typeof bookingOrId === "object"
          ? bookingOrId
          : bookings.find((item) => item.id === bookingOrId);
      const id = booking?.id || bookingOrId;
      if (!id) return "";
      if (booking) cacheBookingForEdit(booking);
      return isUCraneMode
        ? `/u-crane-edit/${encodeURIComponent(id)}`
        : buildEditBookingUrl(id, currentDate, calendarView);
    },
    [bookings, calendarView, currentDate, isRestricted, isUCraneMode]
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
          title: buildHolidayCalendarTitle(employee, data),
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

  const dashboardVehicleRegister = useMemo(
    () => buildDashboardVehicleRegister(vehiclesData),
    [vehiclesData]
  );

  // normaliser/risk
  const normalizeVehicles = useCallback(
    (list) => resolveDashboardVehicles(list, dashboardVehicleRegister),
    [dashboardVehicleRegister]
  );
  const normalizeVehicleDisplays = useCallback(
    (list) => resolveDashboardVehicleDisplays(list, dashboardVehicleRegister),
    [dashboardVehicleRegister]
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
      if (v.__vehicleResolution === "ambiguous-name") {
        reasons.push(`VEHICLE REGISTER MATCH AMBIGUOUS: ${name}${plate}`);
        return;
      }
      if (v.__vehicleResolution === "not-found") {
        reasons.push(`VEHICLE NOT FOUND IN REGISTER: ${name}${plate}`);
        return;
      }
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
      systemDialogs.showSystemNotification("Failed to save booking.");
    }
  };

  // Retained temporarily as a non-executing reference for the legacy planner.
  // The visible calendars exclusively use MaintenanceCalendarPanel's canonical builder.
  const buildLegacyVehicleDueEvents = () => {
    const maintenanceBookedMetaByVehicle = buildBookedMetaByVehicle(maintenanceBookings);
    const activeInspectionMetaByVehicle = buildActiveInspectionMetaByVehicle(maintenanceBookings);
    if (!Array.isArray(vehiclesData) || !vehiclesData.length) return [];
    const out = [];
    const today = startOfLocalDay(new Date());
    const windowStart = addDays(today, -84);
    const windowEnd = addDays(today, 420);

    vehiclesData.forEach((v) => {
      if (isVehicleOutOfUse(v)) return;

      const vehicleId = String(v.id || "").trim();
      if (!vehicleId) return;

      const label = buildAssetLabel(v) || "Unknown vehicle";
      const motDue = getCanonicalDueDate(v, "mot");
      const serviceDue = getCanonicalDueDate(v, "service");
      const maintenanceWorkflows = ADDITIONAL_MAINTENANCE_WORKFLOWS
        .filter((workflow) =>
          CALENDAR_REMINDER_WORKFLOW_KEYS.includes(workflow.key)
        )
        .map((workflow) => ({
          ...workflow,
          due: getCanonicalDueDate(v, workflow.dueKey),
        }));
      const vehicleCreationAppointments = maintenanceWorkflows.flatMap((workflow) => {
        const history = Array.isArray(v[workflow.historyField]) ? v[workflow.historyField] : [];
        const explicitCompletionDates = new Set(
          history
            .filter(
              (entry) =>
                String(entry?.source || "").trim().toLowerCase() !== "vehicle_creation"
            )
            .map((entry) => ymd(entry?.completedDate))
            .filter(Boolean)
        );
        return history
          .filter(
            (entry) =>
              String(entry?.source || "").trim().toLowerCase() === "vehicle_creation"
          )
          .map((entry) => ymd(entry?.completedDate))
          .filter((dateKey) => dateKey && !explicitCompletionDates.has(dateKey))
          .map((dateKey) => ({
            ...workflow,
            due: dateKey,
            source: "vehicle_creation",
          }));
      });
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
          maintenanceTypeId: "mot",
          canonicalItems: [{
            maintenanceTypeId: "mot",
            legalDueDateISO: ymd(motDue),
            legalDueIsoWeek: getIsoWeekLabel(motDue),
          }],
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
          maintenanceTypeId: "service",
          canonicalItems: [{
            maintenanceTypeId: "service",
            legalDueDateISO: ymd(serviceDue),
            legalDueIsoWeek: getIsoWeekLabel(serviceDue),
          }],
        });
      }

      const additionalAppointmentsByDate = [
        ...maintenanceWorkflows,
        ...vehicleCreationAppointments,
      ].reduce((acc, item) => {
        const dateKey = ymd(item.due);
        if (!dateKey) return acc;
        const combineByWeek = ["pmi", "brake_test"].includes(item.maintenanceTypeId);
        const isoWeek = getIsoWeekLabel(dateKey);
        const groupKey = combineByWeek ? `iso:${isoWeek}` : `date:${dateKey}`;
        if (!acc[groupKey]) {
          acc[groupKey] = { dateKey, isoWeek, items: [] };
        }
        if (dateKey < acc[groupKey].dateKey) acc[groupKey].dateKey = dateKey;
        if (!acc[groupKey].items.some((existing) => existing.key === item.key)) {
          acc[groupKey].items.push(item);
        }
        return acc;
      }, {});

      Object.values(additionalAppointmentsByDate).forEach(({ dateKey, isoWeek, items }) => {
        const date = startOfLocalDay(dateKey);
        if (!date || !items.length) return;
        const inspectionMeta = activeInspectionMetaByVehicle[vehicleId] || null;
        const isPmiOrBrakeAppointment = items.every((item) =>
          ["pmi", "brake_test"].includes(item.maintenanceTypeId)
        );
        const alreadyBookedInWeek =
          isPmiOrBrakeAppointment &&
          (inspectionMeta?.bookedWeeks?.has(isoWeek) ||
            inspectionMeta?.sourceDueWeeks?.has(isoWeek));
        if (alreadyBookedInWeek) return;
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
          maintenanceKeys: items.map((item) => item.key),
          maintenanceTypeIds: items.map((item) => item.maintenanceTypeId),
          canonicalItems: items.map((item) => ({
            maintenanceTypeId: item.maintenanceTypeId,
            legalDueDateISO: ymd(item.due),
            legalDueIsoWeek: getIsoWeekLabel(item.due),
          })),
          sourceDueIsoWeek: isoWeek,
          requiresMaintenanceDocuments: true,
          requiresBrakeTestDocument: items.some((item) => item.key === "brake_test"),
          requiresPmiDocument: items.some((item) => item.key === "pmi"),
        });
      });

      const completedAppointmentsByDate = maintenanceWorkflows.flatMap((workflow) => {
        const history = Array.isArray(v[workflow.historyField]) ? v[workflow.historyField] : [];
        const explicitHistory = history.filter(
          (item) => String(item?.source || "").trim().toLowerCase() !== "vehicle_creation"
        );
        const rows = explicitHistory.map((item) => ({
          key: workflow.key,
          maintenanceTypeId: workflow.maintenanceTypeId,
          date: item?.completedDate,
          label: workflow.label,
          completedAt: item?.completedAt || "",
          documents: Array.isArray(item?.documents) ? item.documents : [],
          source: "completion_history",
        }));

        const recordedDate = ymd(v?.[workflow.lastField]);
        const hasExplicitRecord = explicitHistory.some(
          (item) => ymd(item?.completedDate) === recordedDate
        );
        const isVehicleCreationSeed = history.some(
          (item) =>
            String(item?.source || "").trim().toLowerCase() === "vehicle_creation" &&
            ymd(item?.completedDate) === recordedDate
        );
        if (recordedDate && !hasExplicitRecord && !isVehicleCreationSeed) {
          rows.push({
            key: workflow.key,
            maintenanceTypeId: workflow.maintenanceTypeId,
            date: recordedDate,
            label: workflow.label,
            completedAt: recordedDate,
            documents: [],
            source: "vehicle_last_completed_date",
          });
        }
        return rows;
      }).reduce((acc, item) => {
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
          maintenanceKeys: items.map((item) => item.key),
          maintenanceTypeIds: items.map((item) => item.maintenanceTypeId),
          documents,
          hasMaintenanceDocuments: documents.length > 0,
          requiresMaintenanceDocuments: true,
          requiresBrakeTestDocument: items.some((item) => item.key === "brake_test"),
          requiresPmiDocument: items.some((item) => item.key === "pmi"),
          hasBrakeTestDocument: brakeDocuments.length > 0,
          hasPmiDocument: pmiDocuments.length > 0,
          completedAt: items.map((item) => item.completedAt).filter(Boolean).sort().at(-1) || dateKey,
          completionSource: items.every(
            (item) => item.source === "vehicle_last_completed_date"
          )
            ? "vehicle_last_completed_date"
            : "completion_history",
          plannerSourceLabel: items.every(
            (item) => item.source === "vehicle_last_completed_date"
          )
            ? "Recorded vehicle completion date"
            : "Completed maintenance history",
          disableBookingActions: true,
        });
      });

      // Legacy eight-week / lorry inspection dates are PMI aliases. Canonical
      // maintenanceBookings now owns recurrence, so no parallel repeating
      // calendar series is generated here.
    });

    return out;
  };

  //  Build all calendar events from a single function (jobs + maintenance)
  const allEventsRaw = useMemo(() => {
    const sourceBookings = canSeeDeletedOnCalendar
      ? [...bookings, ...deletedBookings]
      : bookings;
    return [
      ...eventsByJobNumber(sourceBookings, maintenanceBookings),
    ];
  }, [
    bookings,
    deletedBookings,
    maintenanceBookings,
    canSeeDeletedOnCalendar,
  ]);

  const allEvents = useMemo(() => {
    return allEventsRaw.map((ev) => {
      const normalizedVehicles = normalizeVehicles(ev.vehicles);
      const displayVehicles = normalizeVehicleDisplays(ev.vehicles);
      const inactiveBooking = isInactiveBookingStatus(ev.status);
      const shouldShowRisk = !inactiveBooking && isCurrentOrFutureJobEvent(ev);
      const risk = shouldShowRisk
        ? getVehicleRisk(normalizedVehicles, {
            offRoadTracking: Boolean(ev?.offRoadTracking),
          })
        : { risky: false, reasons: [] };
      const bookingLastDay = new Date(ev.end);
      bookingLastDay.setDate(bookingLastDay.getDate() - 1);
      const bookingVehicleWarnings = shouldShowRisk
        ? buildBookingVehicleWarnings(normalizedVehicles, {
            bookingDate: bookingLastDay,
          })
        : [];
      const riskReasons = [...risk.reasons, ...bookingVehicleWarnings];
      const recce = reccesByBooking[ev.id] || null;
      const vehicleStatus = inactiveBooking
        ? buildSynchronizedVehicleStatus(
            { ...ev, vehicles: displayVehicles },
            ev.status
          )
        : ev.vehicleStatus;
      const inactiveCrew = inactiveBooking
        ? {
            employees: [],
            employeesByDate: {},
            employeeNames: [],
            employeeCodes: [],
            crew: [],
            crewMembers: [],
            staff: [],
            assignedEmployeeCodes: [],
            employeeAssignmentsByDate: {},
            employeeCodesByDate: {},
            assignedEmployeeCodesByDate: {},
            crewRolesNeeded: [],
            rolesNeeded: [],
            requiredRoles: [],
            crewRequirements: {},
            isCrewed: false,
            crewNeeded: null,
            crewRequired: null,
            crewCount: null,
            numberOfCrew: null,
            crewSize: null,
            requiredCrewCount: null,
            requiredCrew: null,
            allocatedCrewCount: 0,
          }
        : {};

      return {
        ...ev,
        ...inactiveCrew,
        vehicles: displayVehicles,
        prepRecordsByKey,
        vehicleStatus,
        isRisky: riskReasons.length > 0,
        riskReasons,
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
  }, [allEventsRaw, getVehicleRisk, normalizeVehicleDisplays, normalizeVehicles, prepRecordsByKey, reccesByBooking]);

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
      if (e.status === "Holiday" || e.status === "Note") {
        return false;
      }

      if (shouldExcludeFromWorkDiary(e)) return false;

      const statusLC = String(e.status || "").toLowerCase();
      if (!showDeletedInView && statusLC === "deleted") return false;
      if (!showInactiveInView && HIDEABLE_STATUSES.has(statusLC)) return false;

      return true;
    });
  }, [allEvents, showDeletedInView, showInactiveInView]);

  const workCalendarEvents = useMemo(
    () => alignLinkedContinuationCalendarEvents([...bankHolidays, ...workDiaryEvents]),
    [bankHolidays, workDiaryEvents]
  );

  useEffect(() => {
    const calendarFrame = workDiaryCalendarRef.current;
    const scrollContainer = calendarFrame?.closest?.(".app-shell-content");
    const shellRoot = calendarFrame?.closest?.(".app-shell-root");
    const shellFooter = shellRoot?.querySelector?.("footer");
    const footerLabel = shellFooter?.querySelector?.(":scope > span:first-child");

    if (!calendarFrame || !scrollContainer) {
      setShowMoreBookingsBelow(false);
      return undefined;
    }

    let animationFrame = 0;
    const updateIndicator = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const scrollRect = scrollContainer.getBoundingClientRect();
        const calendarRect = calendarFrame.getBoundingClientRect();
        const visibleBottom = Math.min(scrollRect.bottom, window.innerHeight);
        const visibleTop = Math.max(scrollRect.top, 0);
        const bookingCards = calendarFrame.querySelectorAll(".rbc-event.work-diary-job-card");
        const diaryIsVisible = calendarRect.top < visibleBottom && calendarRect.bottom > visibleTop;
        const hasBookingBelow = Array.from(bookingCards).some(
          (card) => card.getBoundingClientRect().bottom > visibleBottom + 12
        );

        const footerLabelRect = footerLabel?.getBoundingClientRect?.();
        const indicatorCenter = footerLabelRect?.width
          ? footerLabelRect.left + (footerLabelRect.width / 2)
          : window.innerWidth / 2;
        document.documentElement.style.setProperty(
          "--more-bookings-center-x",
          `${Math.round(indicatorCenter)}px`
        );
        setShowMoreBookingsBelow(diaryIsVisible && hasBookingBelow);
      });
    };

    const resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(calendarFrame);
    resizeObserver.observe(scrollContainer);
    if (shellFooter) resizeObserver.observe(shellFooter);

    const mutationObserver = new MutationObserver(updateIndicator);
    mutationObserver.observe(calendarFrame, { childList: true, subtree: true });
    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-interface-scale"],
    });

    scrollContainer.addEventListener("scroll", updateIndicator, { passive: true });
    window.addEventListener("resize", updateIndicator);
    updateIndicator();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      scrollContainer.removeEventListener("scroll", updateIndicator);
      window.removeEventListener("resize", updateIndicator);
      document.documentElement.style.removeProperty("--more-bookings-center-x");
    };
  }, [calendarView, currentDate, workCalendarEvents]);

  const scrollToMoreBookings = useCallback(() => {
    const calendarFrame = workDiaryCalendarRef.current;
    const scrollContainer = calendarFrame?.closest?.(".app-shell-content");
    if (!scrollContainer) return;

    scrollContainer.scrollBy({
      top: Math.max(320, Math.round(scrollContainer.clientHeight * 0.72)),
      behavior: "smooth",
    });
  }, []);

  const uCraneUpcomingByStatus = useMemo(() => {
    const columns = { Confirmed: [], "First Pencil": [], "Second Pencil": [] };
    if (!isUCraneMode) return columns;

    const statusLabels = {
      confirmed: "Confirmed",
      "first pencil": "First Pencil",
      "second pencil": "Second Pencil",
    };
    const earliestEventByBooking = new Map();

    workDiaryEvents.forEach((event) => {
      const status = statusLabels[String(event?.status || "").trim().toLowerCase()];
      if (!status || !isCurrentOrFutureJobEvent(event)) return;

      const bookingId = String(event?.__bookingId || event?.id || "").trim();
      if (!bookingId) return;

      const existing = earliestEventByBooking.get(bookingId);
      const eventStart = event?.start instanceof Date ? event.start.getTime() : Number.MAX_SAFE_INTEGER;
      const existingStart = existing?.start instanceof Date ? existing.start.getTime() : Number.MAX_SAFE_INTEGER;
      if (!existing || eventStart < existingStart) {
        earliestEventByBooking.set(bookingId, { ...event, __upcomingStatus: status });
      }
    });

    [...earliestEventByBooking.values()]
      .sort((a, b) => {
        const startDifference = (a.start?.getTime?.() || 0) - (b.start?.getTime?.() || 0);
        if (startDifference !== 0) return startDifference;
        const aJob = jobKey(a.jobNumber);
        const bJob = jobKey(b.jobNumber);
        const aHasJobNumber = Number.isFinite(aJob.num);
        const bHasJobNumber = Number.isFinite(bJob.num);
        if (aHasJobNumber && bHasJobNumber && bJob.num !== aJob.num) return bJob.num - aJob.num;
        if (aHasJobNumber !== bHasJobNumber) return aHasJobNumber ? -1 : 1;
        return String(bJob.raw || "").localeCompare(String(aJob.raw || ""));
      })
      .forEach((event) => columns[event.__upcomingStatus].push(event));

    return columns;
  }, [isUCraneMode, workDiaryEvents]);

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
        if (!vehicle) {
          return {
            ...event,
            nextMOT: "",
            nextService: "",
            vehicleResolution: "not-found",
          };
        }

        return {
          ...reconcileMaintenanceEventVehicle(event, vehicle),
          nextMOT: event?.kind === "MOT_BOOKING" ? vehicleMotDue : "",
          nextService: vehicleServiceDue,
        };
      });

    return dedupeMaintenanceCalendarEvents(enrichedMaintenance);
  }, [allEvents, vehiclesData]);

  const maintenanceDraggableAccessor = useCallback(
    (event) => isMaintenanceCalendarEventDraggable(event),
    []
  );

  const handleMaintenanceEventDrop = useCallback(
    async ({ event, start }) => {
      if (
        (event?.__collection === "maintenanceBookings" ||
          event?.kind === "MAINTENANCE_APPOINTMENT") &&
        !isMaintenanceCalendarEventDraggable(event)
      ) {
        systemDialogs.showSystemNotification("Completed or inactive maintenance records cannot be moved.");
        return;
      }

      if (event?.__collection === "vehicleDueDates") {
        const draft = buildMaintenanceBookingDraftFromDueEvent(event, start);
        if (!draft) {
          systemDialogs.showSystemNotification("Could not create a maintenance booking from this due reminder.");
          return;
        }
        setMaintenanceDropDraft(draft);
        return;
      }

      const recordStatus = String(event?.recordStatus || event?.bookingStatus || "")
        .trim()
        .toLowerCase();
      if (event?.__collection === "maintenanceBookings" && recordStatus === "requested") {
        const draft = buildMaintenanceBookingDraftFromDueEvent(event, start);
        if (!draft) {
          systemDialogs.showSystemNotification("Could not book this maintenance requirement.");
          return;
        }
        setMaintenanceDropDraft(draft);
        return;
      }

      if (event?.__collection !== "maintenanceBookings") {
        systemDialogs.showSystemNotification("Only saved maintenance bookings can be moved. Due-date reminders stay fixed to the vehicle schedule.");
        return;
      }

      const bookingId = String(event.__parentId || event.id || "").trim();
      if (!bookingId) {
        systemDialogs.showSystemNotification("Could not identify the maintenance booking to move.");
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
        requiresReason: isMaintenanceMoveOutsideDueWeek(event, start),
      });
    },
    [maintenanceBookings]
  );

  const cancelPendingMaintenanceDrop = useCallback(() => {
    setPendingMaintenanceDrop(null);
  }, []);

  const confirmPendingMaintenanceDrop = useCallback(async () => {
    if (!pendingMaintenanceDrop?.updates) return;

    if (!pendingMaintenanceDrop?.bookingId) return;

    const { bookingId, updates } = pendingMaintenanceDrop;
    const existingBooking = (maintenanceBookings || []).find(
      (booking) => String(booking?.id || "") === String(bookingId)
    ) || {};
    const reason = String(pendingMaintenanceDrop.reason || "").trim();
    if (pendingMaintenanceDrop.requiresReason && !reason) return;
    const previousBookings = maintenanceBookings;
    const optimisticUpdates = { ...updates, scheduleExceptionReason: reason, updatedAt: new Date().toISOString() };
    setPendingMaintenanceDrop((current) => (current ? { ...current, saving: true } : current));
    setMaintenanceBookings((current) =>
      (current || []).map((booking) =>
        String(booking?.id || "") === bookingId ? { ...booking, ...optimisticUpdates } : booking
      )
    );

    try {
      await rescheduleMaintenanceBooking({
        bookingId,
        booking: existingBooking,
        updates,
        reason,
        authState: dataAccessState,
      });
      setPendingMaintenanceDrop(null);
    } catch (error) {
      console.error("Failed to move maintenance booking:", error);
      setMaintenanceBookings(previousBookings);
      setPendingMaintenanceDrop((current) => (current ? { ...current, saving: false } : current));
      systemDialogs.showSystemNotification(error?.message || "Could not move this maintenance booking.");
    }
  }, [dataAccessState, maintenanceBookings, pendingMaintenanceDrop]);

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
      <OperationsPage className={`dashboard-page ${layoutStyles.extracted120}`}>
        {/* Header */}
        <OperationsPageHeader
          title={isUCraneMode ? "U-Crane" : "Diary"}
          subtitle={isUCraneMode ? "U-Crane bookings, crew and operational preparation." : "Bookings, availability and maintenance across the working week."}
          actions={<OperationsHeaderActions className={layoutStyles.extracted61}>
            <div className={layoutStyles.extracted62}>
              <Search
                size={15}
                className={layoutStyles.extracted63}
              />
              <Input bare
                type="text"
                value={dashboardSearch}
                onChange={(e) => setDashboardSearch(e.target.value)}
                placeholder="Search jobs..."
                className={layoutStyles.extracted64}
              />
              {dashboardSearch.trim() && (
                <div
                  className={layoutStyles.extracted65}
                >
                  {dashboardSearchResults.length ? (
                    dashboardSearchResults.map((booking) => (
                      <Button bare
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
                        className={layoutStyles.extracted66}
                      >
                        <div className={layoutStyles.extracted67}>
                          {booking.jobNumber || "No Job #"} - {getBookingProductionLabel(booking)}
                        </div>
                        <div className={layoutStyles.extracted68}>
                          {formatSearchBookingDates(booking)} - {formatSearchBookingVehicles(booking)} - {booking.location || "No location"}
                        </div>
                      </Button>
                    ))
                  ) : (
                    <div className={layoutStyles.extracted69}>
                      No jobs match that search.
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button
              onClick={goToCreateBooking}
              disabled={isRestricted || createBookingOpening || createEnquiryOpening}
              aria-disabled={isRestricted || createBookingOpening || createEnquiryOpening}
              title={isRestricted ? "Your account is not allowed to create bookings" : ""}
              type="button"
            >
              <Plus size={14} />
              {createBookingOpening
                ? `Opening ${createBookingProgress}%`
                : isUCraneMode ? "Add U-Crane Booking" : "Add Booking"}
            </Button>
            {!isUCraneMode && (
              <Button variant="secondary"
                onClick={goToCreateEnquiry}
                disabled={isRestricted || createBookingOpening || createEnquiryOpening}
                aria-disabled={isRestricted || createBookingOpening || createEnquiryOpening}
                title={isRestricted ? "Your account is not allowed to create enquiries" : ""}
                type="button"
              >
                <Plus size={14} />
                {createEnquiryOpening ? `Opening ${createEnquiryProgress}%` : "Add Enquiry"}
              </Button>
            )}
            {!isUCraneMode && (
              <Button variant="secondary"
                onClick={goToCreateMaintenance}
                disabled={isRestricted}
                aria-disabled={isRestricted}
                title={isRestricted ? "Your account is not allowed to create maintenance" : ""}
                type="button"
              >
                <Plus size={14} />
                Add Maintenance
              </Button>
            )}
            {isUCraneMode ? (
              <Button variant="secondary"
                type="button"
                onClick={() => router.push("/u-crane-crew")}
              >
                <ClipboardList size={14} />
                U-Crane Crew
              </Button>
            ) : null}
            {bookingSaved && (
              <div className={layoutStyles.extracted70}>
                <Check size={14} strokeWidth={3} />
                Booking saved successfully.
              </div>
            )}
          </OperationsHeaderActions>}
        />

        {/* Work Diary */}
        <section className={layoutStyles.extracted71}>
          <div className={layoutStyles.extracted72}>
            <div className={layoutStyles.extracted73}>
              <div className={layoutStyles.iconBox}>
                <CalendarDays size={17} />
              </div>
              <div>
                <h2 className={layoutStyles.extracted74}>{isUCraneMode ? "U-Crane Work Diary" : "Work Diary"}</h2>
                <div className={layoutStyles.extracted75}>
                  {isUCraneMode
                    ? "U-Crane bookings and operational visibility."
                    : "Bookings, bank holidays and operational visibility."}
                </div>
              </div>
              <Button variant="secondary"
                onClick={() => {
                  const today = new Date();
                  setCurrentDate(today);
                  setMaintenanceDate(today);
                }}
                type="button"
              >
                <CalendarDays size={14} />
                Today
              </Button>
            </div>
            <div className={layoutStyles.extracted76}>
              <Button variant="secondary"
                onClick={() => {
                  setCurrentDate((prev) => shiftByDays(prev, -7));
                  setMaintenanceDate((prev) => shiftByDays(prev, -7));
                }}
                type="button"
              >
                <ChevronLeft size={14} />
                Previous Week
              </Button>

              <Button variant="secondary"
                onClick={() => {
                  setCurrentDate((prev) => shiftByDays(prev, 7));
                  setMaintenanceDate((prev) => shiftByDays(prev, 7));
                }}
                type="button"
              >
                Next Week
                <ChevronRight size={14} />
              </Button>

              <details className={layoutStyles.visibilityMenu}>
                <summary className={layoutStyles.visibilityMenuSummary}>
                  <Eye size={14} />
                  Visibility
                  <ChevronDown size={14} />
                </summary>
                <div className={layoutStyles.visibilityMenuPanel}>
                  {canSeeDeletedOnCalendar && (
                    <Button bare
                      className={layoutStyles.visibilityMenuItem}
                      onClick={() => setShowDeletedInView((v) => !v)}
                      type="button"
                      aria-pressed={showDeletedInView}
                    >
                      {showDeletedInView ? <EyeOff size={15} /> : <Eye size={15} />}
                      <span>{showDeletedInView ? "Hide deleted" : "Show deleted"}</span>
                    </Button>
                  )}
                  <Button bare
                    className={layoutStyles.visibilityMenuItem}
                    onClick={() => setShowInactiveInView((v) => !v)}
                    type="button"
                    aria-pressed={showInactiveInView}
                  >
                    {showInactiveInView ? <EyeOff size={15} /> : <Eye size={15} />}
                    <span>{showInactiveInView ? "Hide inactive" : "Show inactive"}</span>
                  </Button>
                </div>
              </details>

              <Badge className={layoutStyles.calendarDateBadge}>
                {currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </Badge>
            </div>
          </div>

          <div ref={workDiaryCalendarRef} className={layoutStyles.workDiaryCalendarWrap}>
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
                if (isUCraneMode) return;
                setEditingNoteId(null);
                const d = start instanceof Date ? start : new Date(start);
                setCreateNoteDate(ymd(d));
                setNoteModalOpen(true);
              }}
              selectable={!isUCraneMode}
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
              className={`${calendarView === "week" ? "dashboard-compact-calendar" : "dashboard-month-calendar"} ${layoutStyles.calendarFrame} ${calendarView === "week" ? layoutStyles.calendarCompact : layoutStyles.calendarMonth}`}
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

                if (e.status === "Maintenance") {
                  if (e.__collection === "maintenanceJobs") {
                    router.push(`/maintenance-jobs?jobId=${encodeURIComponent(e.id)}`);
                    return;
                  }
                  setSelectedMaintenanceEvent(e);
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
              components={{
                event: (props) => (
                  <CalendarEvent
                    {...props}
                    onViewQuote={openQuoteViewer}
                  />
                ),
              }}
              eventPropGetter={(event) => {
              //  bank holiday styling
              if (event.status === "Bank Holiday") {
                const bankHolidayTone = getFixedJobStatusSurfaceStyle("Bank Holiday");
                const bankHolidayBorder = getWorkDiaryBorder("Bank Holiday", bankHolidayTone.border);
                return {
                  style: {
                    backgroundColor: bankHolidayTone.bg,
                    color: bankHolidayTone.text,
                    fontWeight: 800,
                    padding: 0,
                    borderRadius: 8,
                    borderTop: `1px dashed ${bankHolidayBorder}`,
                    borderRight: `1px dashed ${bankHolidayBorder}`,
                    borderBottom: `1px dashed ${bankHolidayBorder}`,
                    borderLeft: `6px solid ${bankHolidayBorder}`,
                    boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
                    pointerEvents: "none", //  doesn't steal clicks from jobs
                  },
                };
              }

              const status = normalizeStatusLabel(event.status || "Confirmed");
              const isJobCard = !["bank holiday", "holiday", "note"].includes(
                String(event.status || "").trim().toLowerCase()
              );
              const linkedRoleClass = event.__linkedContinuationRole
                ? `work-diary-linked-${event.__linkedContinuationRole}`
                : "";
              const jobCardClassName = isJobCard
                ? `work-diary-job-card ${linkedRoleClass}`.trim()
                : "";
              const tone = getFixedJobStatusSurfaceStyle(status);
              let bg = tone.bg;
              let text = tone.text;
              let border = getWorkDiaryBorder(status, tone.border);

              const shoot = String(event.shootType || "").toLowerCase();
              const bookingStatuses = new Set([
                "confirmed",
                "first pencil",
                "second pencil",
                "action required",
                "dnh",
              ]);

              if (bookingStatuses.has((status || "").toLowerCase()) && shoot === "night") {
                bg = NIGHT_SHOOT_STYLE.bg;
                text = NIGHT_SHOOT_STYLE.text;
                border = getWorkDiaryBorder(status, NIGHT_SHOOT_STYLE.border);
                return {
                  className: jobCardClassName,
                  style: {
                    backgroundColor: bg,
                    color: text,
                    fontWeight: 700,
                    padding: 0,
                    borderRadius: 8,
                    borderTop: `1px solid ${border}`,
                    borderRight: `1px solid ${border}`,
                    borderBottom: `1px solid ${border}`,
                    borderLeft: `6px solid ${border}`,
                    boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
                  },
                };
              }

              return {
                className: jobCardClassName,
                style: {
                  backgroundColor: bg,
                  color: text,
                  fontWeight: 700,
                  padding: 0,
                  borderRadius: 8,
                  borderTop: `1px solid ${border}`,
                  borderRight: `1px solid ${border}`,
                  borderBottom: `1px solid ${border}`,
                  borderLeft: `6px solid ${border}`,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
                },
              };
              }}
            />
          </div>

          {showMoreBookingsBelow && typeof document !== "undefined"
            ? createPortal(
                <div className={layoutStyles.moreBookingsBelowAnchor}>
                  <Button
                    variant="secondary"
                    type="button"
                    className={layoutStyles.moreBookingsBelow}
                    onClick={scrollToMoreBookings}
                    aria-label="More bookings are below. Scroll down to view them."
                  >
                    <span>More bookings below</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </Button>
                </div>,
                document.body
              )
            : null}
        </section>

        {isUCraneMode && (
          <section className={layoutStyles.uCraneUpcomingSection} aria-labelledby="u-crane-upcoming-title">
            <div className={layoutStyles.uCraneUpcomingHeader}>
              <div>
                <h2 id="u-crane-upcoming-title" className={layoutStyles.uCraneUpcomingTitle}>Upcoming U-Crane Bookings</h2>
                <p className={layoutStyles.uCraneUpcomingHint}>
                  Future work grouped by booking status. Select a booking to open its details.
                </p>
              </div>
            </div>

            <div className={layoutStyles.uCraneUpcomingGrid}>
              {["Confirmed", "First Pencil", "Second Pencil"].map((status) => {
                const items = uCraneUpcomingByStatus[status] || [];
                const statusStyle = getStatusStyle(status);
                return (
                  <div className={layoutStyles.uCraneUpcomingColumn} key={status}>
                    <div className={layoutStyles.uCraneColumnHeader}>
                      <div className={layoutStyles.uCraneColumnLabel}>
                        <span
                          className={layoutStyles.uCraneStatusDot}
                          style={{ background: statusStyle.bg, borderColor: statusStyle.border }}
                          aria-hidden="true"
                        />
                        <div>
                          <h3>{status}</h3>
                          <span>{items.length} upcoming</span>
                        </div>
                      </div>
                      <span className={layoutStyles.uCraneColumnCount} aria-label={`${items.length} ${status} bookings`}>
                        {items.length}
                      </span>
                    </div>

                    <div className={layoutStyles.uCraneColumnItems}>
                      {items.length === 0 ? (
                        <div className={layoutStyles.uCraneColumnEmpty}>Nothing upcoming.</div>
                      ) : (
                        items.slice(0, 12).map((event) => {
                          const bookingId = event.__bookingId || event.id;
                          const start = event.start instanceof Date ? event.start : new Date(event.start);
                          const endExclusive = event.end instanceof Date ? event.end : new Date(event.end);
                          const end = new Date(endExclusive);
                          end.setDate(end.getDate() - 1);
                          const dateOptions = { day: "2-digit", month: "short" };
                          const dateLabel = start.toLocaleDateString("en-GB", dateOptions) === end.toLocaleDateString("en-GB", dateOptions)
                            ? start.toLocaleDateString("en-GB", dateOptions)
                            : `${start.toLocaleDateString("en-GB", dateOptions)} - ${end.toLocaleDateString("en-GB", dateOptions)}`;

                          return (
                            <button
                              type="button"
                              className={layoutStyles.uCraneUpcomingCard}
                              key={bookingId}
                              onClick={() => {
                                setSelectedDeletedId(null);
                                setSelectedBookingId(bookingId);
                              }}
                            >
                              <span className={layoutStyles.uCraneUpcomingCardTop}>
                                <strong>{event.jobNumber || "No job number"}</strong>
                                <span>{dateLabel}</span>
                              </span>
                              <span className={layoutStyles.uCraneUpcomingClient}>
                                {getBookingProductionLabel(event)}
                              </span>
                              {event.location && (
                                <span className={layoutStyles.uCraneUpcomingLocation}>{event.location}</span>
                              )}
                              {event.isRisky && (
                                <span className={layoutStyles.uCraneUpcomingRisk}>Vehicle risk</span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Maintenance Calendar */}
        {!isUCraneMode && (
          <MaintenanceCalendarPanel
            maintenanceBookings={maintenanceBookings}
            maintenanceJobs={maintenanceJobs}
            vehicles={vehiclesData}
            setMaintenanceBookings={setMaintenanceBookings}
            date={maintenanceDate}
            view={maintenanceView}
            onDateChange={(nextDate) =>
              {
                setMaintenanceDate((previous) => sameCalendarDate(previous, nextDate) ? previous : nextDate);
                setCurrentDate((previous) => sameCalendarDate(previous, nextDate) ? previous : nextDate);
              }
            }
            onViewChange={(nextView) =>
              {
                setMaintenanceView((previous) => previous === nextView ? previous : nextView);
                setCalendarView((previous) => previous === nextView ? previous : nextView);
              }
            }
            dataAccessState={dataAccessState}
          />
        )}

        {/* Holiday + Notes Calendar */}
        {!isUCraneMode && <section className={layoutStyles.extracted101}>
          <div className={layoutStyles.extracted102}>
            <div className={layoutStyles.extracted103}>
              <div className={`${layoutStyles.iconBox} ${layoutStyles.iconNote}`}>
                <StickyNote size={17} />
              </div>
              <div>
                <h2 className={layoutStyles.extracted104}>Holiday + Notes Calendar</h2>
                <div className={layoutStyles.extracted105}>Shared leave and note visibility in one place.</div>
              </div>
            </div>
            <div className={layoutStyles.extracted106}>
              <Button type="button" onClick={() => setHolidayModalOpen(true)}>
                <Plus size={14} />
                Add Holiday
              </Button>
              <Button variant="secondary" type="button" onClick={() => router.push("/shift-change")}>
                <Clock3 size={14} />
                Shift Change
              </Button>
              <Button type="button" onClick={() => setCreateNoteOpen(true)}>
                <Plus size={14} />
                Add Note
              </Button>
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
            className={`${calendarView === "week" ? "dashboard-compact-calendar" : ""} ${layoutStyles.calendarFrame} ${calendarView === "week" ? layoutStyles.calendarCompact : ""}`}
            components={{
              event: HolidayNotesCalendarEvent,
            }}
            eventPropGetter={holidayNotesEventPropGetter}
            dayPropGetter={() => ({
              style: {
                borderRight: "1px solid var(--color-border)",
                borderTop: "1px solid var(--color-border)",
              },
            })}
          />
        </section>}

        {/* Add booking modal (unchanged logic, restyled a touch) */}
        {showModal && (
          <div
            className={layoutStyles.extracted107}
          >
            <div
              className={layoutStyles.extracted108}
            >
              <h3 className={layoutStyles.extracted109}>
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
                className={layoutStyles.extracted110}
              >
                <Input bare
                  name="client"
                  placeholder="Client"
                  required
                  className={layoutStyles.extracted111}
                />
                <Input bare
                  name="location"
                  placeholder="Location"
                  required
                  className={layoutStyles.extracted112}
                />
                <div className={layoutStyles.extracted113}>
                  <Button bare type="button" onClick={() => setShowModal(false)} className={`${layoutStyles.button} ${layoutStyles.buttonSecondary}`}>
                    Cancel
                  </Button>
                  <Button bare type="submit" className={`${layoutStyles.button} ${layoutStyles.buttonPrimary}`}>
                    Save
                  </Button>
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
      </OperationsPage>

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

      {maintenanceDropDraft && (
        <MaintenanceBookingForm
          {...maintenanceDropDraft}
          onClose={() => setMaintenanceDropDraft(null)}
          onSaved={() => setMaintenanceDropDraft(null)}
        />
      )}

      {/* Holiday modal */}
      {holidayModalOpen && (
        <HolidayForm
          onClose={() => setHolidayModalOpen(false)}
          onSaved={() => {
            setHolidayModalOpen(false);
            fetchHolidays();
          }}
        />
      )}

      {/* Create note modal */}
      {createNoteOpen && (
        <CreateNote
          defaultDate={ymd(new Date())}
          onClose={() => setCreateNoteOpen(false)}
          onSaved={() => {
            setCreateNoteOpen(false);
            fetchNotes();
          }}
        />
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
        ))}

      {editingHolidayId && (
        <EditHolidayForm
          holidayId={editingHolidayId}
          onClose={() => setEditingHolidayId(null)}
          onSaved={() => {
            setEditingHolidayId(null);
            fetchHolidays();
          }}
        />
      )}

      {selectedBookingId && (
        isUCraneMode && !selectedDeletedId ? (
          <ViewUCraneBooking
            id={selectedBookingId}
            initialBooking={selectedBooking}
            initialVehicles={vehiclesData}
            onClose={handleCloseBookingModal}
          />
        ) : (
          <ViewBookingModal
            id={selectedBookingId}
            fromDeleted={!!selectedDeletedId}
            deletedId={selectedDeletedId}
            initialBooking={selectedBooking}
            initialVehicles={vehiclesData}
            onEdit={getEditBookingUrl}
            onViewQuote={openBookingQuoteViewer}
            onClose={handleCloseBookingModal}
          />
        )
      )}
      <QuoteDashboardOverlay
        viewer={quoteViewer}
        onClose={() => setQuoteViewer(null)}
        onMove={moveQuoteViewer}
      />
      <QuotePdfViewer
        viewer={quotePdfViewer}
        onClose={() => setQuotePdfViewer(null)}
      />
      {createBookingOpening && (
        <RouteLoadingOverlay
          progress={createBookingProgress}
          title={isUCraneMode ? "Opening U-Crane booking" : "Opening create booking"}
          hint={isUCraneMode ? "Preparing the U-Crane booking form..." : "Preparing booking form..."}
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
