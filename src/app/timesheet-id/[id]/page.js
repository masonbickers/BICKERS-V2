"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
  query as fsQuery,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import {
  combineTimesheetDayHours,
  getHolidayDayMeta,
  getWeekEndingDate,
  holidayMatchesTimesheetEmployee,
  isApprovedHolidayRecord,
  isPendingHolidayRecord,
  timesheetDetailPath,
} from "@/app/utils/timesheetDetail";
import {
  ArrowLeft,
  CheckCircle2,
  MessageSquare,
  Printer,
  Save,
  Send,
} from "lucide-react";

const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
];
const PAY_ADVICE_PIN_EMAIL = "adam@bickers.co.uk";
const PAY_ADVICE_PIN = "4159";

/* -------------------------------------------------------------------------- */
/*                               HELPERS                                      */
/* -------------------------------------------------------------------------- */

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const cleanIdentityValue = (value) => String(value || "").trim().toLowerCase();

function buildTimesheetUserIdentity(user, userDoc = {}) {
  const codeValues = [
    userDoc.userCode,
    userDoc.employeeCode,
    userDoc.code,
    userDoc.staffCode,
    userDoc.timesheetCode,
  ]
    .map(cleanIdentityValue)
    .filter(Boolean);
  const nameValues = [
    userDoc.name,
    userDoc.fullName,
    userDoc.employeeName,
    userDoc.displayName,
    user?.displayName,
  ]
    .map(cleanIdentityValue)
    .filter(Boolean);
  const emailValues = [userDoc.email, user?.email]
    .map(cleanIdentityValue)
    .filter(Boolean);
  const idValues = [userDoc.employeeId, userDoc.id, user?.uid]
    .map(cleanIdentityValue)
    .filter(Boolean);

  return {
    codes: new Set(codeValues),
    names: new Set(nameValues),
    emails: new Set(emailValues),
    ids: new Set(idValues),
  };
}

function timesheetMatchesTimesheetUser(timesheet = {}, identity) {
  if (!identity) return false;
  const timesheetCodes = [timesheet.employeeCode, timesheet.userCode, timesheet.code, timesheet.staffCode]
    .map(cleanIdentityValue)
    .filter(Boolean);
  const timesheetNames = [timesheet.employeeName, timesheet.name, timesheet.fullName]
    .map(cleanIdentityValue)
    .filter(Boolean);
  const timesheetEmails = [timesheet.employeeEmail, timesheet.email, timesheet.userEmail]
    .map(cleanIdentityValue)
    .filter(Boolean);
  const timesheetIds = [timesheet.employeeId, timesheet.userId, timesheet.uid]
    .map(cleanIdentityValue)
    .filter(Boolean);

  return (
    timesheetCodes.some((value) => identity.codes.has(value)) ||
    timesheetNames.some((value) => identity.names.has(value)) ||
    timesheetEmails.some((value) => identity.emails.has(value)) ||
    timesheetIds.some((value) => identity.ids.has(value))
  );
}

const LUNCH_DEDUCT_HRS = 0.5;
const DEFAULT_YARD_START = "08:00";
const DEFAULT_YARD_END = "16:30";
const UI = {
  radius: "var(--radius-md)",
  radiusSm: "var(--radius-md)",
  gap: "var(--space-3)",
  bg: "var(--color-canvas)",
  panel: "var(--color-white)",
  panelTint: "var(--color-white)",
  ink: "var(--color-text)",
  muted: "var(--color-text-muted)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-soft)",
  brandBorder: "var(--color-brand-border)",
  border: "var(--border-default)",
  shadowSm: "var(--shadow-sm)",
  shadowHover: "var(--shadow-md)",
  green: "var(--legacy-color-15803d)",
  greenSoft: "var(--legacy-color-ecfdf3)",
  greenBorder: "var(--color-success-border)",
  red: "var(--legacy-color-b91c1c)",
  redSoft: "var(--legacy-color-fff1f2)",
  redBorder: "var(--legacy-color-fecdd3)",
};

const pageWrap = {
  flex: 1,
  minHeight: "100vh",
  background: UI.bg,
  color: UI.ink,
  padding: "16px 16px 32px",
  boxSizing: "border-box",
  width: "100%",
};

const toolbarStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "var(--space-3)",
  gap: 10,
  flexWrap: "wrap",
};

const actionRowStyle = { display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" };

const surfaceStyle = {
  background: UI.panelTint,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const controlButton = (kind = "ghost", disabled = false) => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    fontWeight: 800,
    whiteSpace: "nowrap",
    fontSize: 12.5,
    lineHeight: 1.2,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };

  if (kind === "primary") {
    return {
      ...base,
      border: `1px solid ${UI.brand}`,
      background: "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--color-brand) 100%)",
      color: "var(--color-white)",
      boxShadow: "0 8px 18px rgba(31,75,122,0.16)",
    };
  }

  if (kind === "success") {
    return {
      ...base,
      border: `1px solid ${UI.greenBorder}`,
      background: UI.greenSoft,
      color: UI.green,
    };
  }

  return {
    ...base,
    border: `1px solid ${UI.brandBorder}`,
    background: "linear-gradient(180deg, var(--color-white) 0%, var(--legacy-color-f8fbfe) 100%)",
    color: UI.ink,
    boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
  };
};

const approveButtonStyle = (disabled = false) => ({
  ...controlButton("success", disabled),
  padding: "9px 15px",
  fontSize: 13.5,
  border: disabled ? `1px solid ${UI.greenBorder}` : "1px solid var(--legacy-color-047857)",
  background: disabled
    ? UI.greenSoft
    : "linear-gradient(180deg, var(--legacy-color-22c55e) 0%, var(--legacy-color-15803d) 100%)",
  color: disabled ? UI.green : "var(--color-white)",
  boxShadow: disabled
    ? UI.shadowSm
    : "0 10px 22px rgba(21,128,61,0.28), inset 0 1px 0 rgba(255,255,255,0.2)",
  textTransform: "uppercase",
  letterSpacing: 0,
});

const formControlStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: "var(--font-size-sm)",
  boxSizing: "border-box",
};

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
});

function TimeSelect({ label, value, onChange }) {
  const listId = `manual-time-options-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <label style={{ display: "grid", gap: 3, fontSize: 10.5, color: UI.muted, fontWeight: 800 }}>
      {label}
      <input
        aria-label={label}
        list={listId}
        inputMode="numeric"
        placeholder="HH:MM"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...formControlStyle,
          fontSize: "var(--font-size-xs)",
          padding: "6px 8px",
          minHeight: "var(--control-height-sm)",
          background: "var(--color-white)",
        }}
      />
      <datalist id={listId}>
        {TIME_OPTIONS.map((time) => (
          <option key={time} value={time} />
        ))}
      </datalist>
    </label>
  );
}

const payAdviceCell = {
  border: "1px solid var(--legacy-color-cbd5e1)",
  padding: "6px 5px",
  textAlign: "center",
  color: "var(--color-text)",
  background: "var(--color-white)",
};

const payAdviceInput = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  textAlign: "center",
  fontSize: 11.5,
  color: "var(--color-text)",
  padding: 0,
};

/* Parse Date / Timestamp / String */
function parseDateFlexible(raw) {
  if (!raw) return null;
  if (typeof raw?.toDate === "function") return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === "object" && raw.seconds) return new Date(raw.seconds * 1000);
  if (typeof raw === "string") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toLocalYMD(raw) {
  const d = parseDateFlexible(raw);
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TIMESHEET_DOC_ID_RE = /^(.*)_(\d{4}-\d{2}-\d{2})$/;
const WEEK_START_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeTimesheetRouteId(rawId) {
  if (rawId == null) return "";
  const source = Array.isArray(rawId) ? rawId[0] : String(rawId);
  if (!source) return "";
  try {
    return decodeURIComponent(source).trim();
  } catch {
    return String(source).trim();
  }
}

function isWeekStartId(value) {
  return WEEK_START_RE.test(String(value || "").trim());
}

function parseTimesheetDocId(value) {
  const parts = String(value || "").trim().match(TIMESHEET_DOC_ID_RE);
  if (!parts) return null;
  return {
    employeeCode: parts[1],
    weekStart: parts[2],
  };
}

function ordinalSuffix(day) {
  const value = Number(day);
  if (!Number.isFinite(value)) return "";
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatDayDateLabel(raw) {
  const d = parseDateFlexible(raw);
  if (!d) return "";
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  const day = d.getDate();
  return `${weekday} ${day}${ordinalSuffix(day)} ${month}`;
}

/* HH:mm to minutes */
function toMinutes(val) {
  if (!val) return null;
  if (typeof val === "string") {
    const m = val.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return +m[1] * 60 + +m[2];
  }
  return null;
}

/* diff in hours (supports overnight) */
function diffHours(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return 0;

  let d = (e - s) / 60;
  if (d < 0) d += 24;
  return Math.max(0, d);
}

function normaliseTimeValue(value) {
  const mins = toMinutes(value);
  if (mins == null) return null;
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getPrecallInfo(entry) {
  const raw = entry?.precallDuration;
  const timeValue = normaliseTimeValue(raw);
  if (timeValue) {
    const callMinutes = toMinutes(entry?.callTime);
    const preCallMinutes = toMinutes(timeValue);
    const hours =
      callMinutes != null && preCallMinutes != null ? Math.max(0, diffHours(timeValue, entry?.callTime)) : 0;
    return {
      kind: "time",
      label: timeValue,
      hours,
    };
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return { kind: "none", label: "", hours: 0 };
  }

  const hrs = value / 60;
  const label =
    value < 60
      ? `${value} min`
      : value % 60 === 0
      ? `${value / 60} hr${value / 60 > 1 ? "s" : ""}`
      : `${Math.floor(value / 60)} hr${Math.floor(value / 60) > 1 ? "s" : ""} ${value % 60} min`;

  return {
    kind: "duration",
    label,
    hours: hrs,
  };
}

function getEmployeeYardAutofill(employee) {
  const defaults = employee?.timesheetDefaults || {};
  const start =
    normaliseTimeValue(
      defaults.yardStart ||
        defaults.startTime ||
        defaults.start ||
        defaults.defaultStart ||
        defaults.workStart ||
        defaults.holidayStart ||
        defaults.paidHolidayStart ||
        employee?.yardStartTime ||
        employee?.yardStart ||
        employee?.startTime
    ) || DEFAULT_YARD_START;
  const end =
    normaliseTimeValue(
      defaults.yardEnd ||
        defaults.endTime ||
        defaults.end ||
        defaults.defaultEnd ||
        defaults.workEnd ||
        defaults.holidayEnd ||
        defaults.paidHolidayEnd ||
        employee?.yardEndTime ||
        employee?.yardEnd ||
        employee?.endTime
    ) || DEFAULT_YARD_END;
  const deductLunch =
    defaults.holidayLunchDeduct ??
    defaults.paidHolidayLunchDeduct ??
    defaults.yardLunchDeduct ??
    defaults.lunchDeduct ??
    defaults.deductLunch ??
    employee?.holidayLunchDeduct ??
    employee?.paidHolidayLunchDeduct ??
    employee?.yardLunchDeduct ??
    employee?.lunchDeduct ??
    true;

  return {
    start,
    end,
    rawHours: diffHours(start, end),
    deductLunch: deductLunch !== false,
  };
}

/* Convert numeric hours to "X hrs Y min" */
function formatHoursLabel(hours) {
  const totalMinutes = Math.round((hours || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  const hPart = h > 0 ? `${h} hr${h !== 1 ? "s" : ""}` : "";
  const mPart = m > 0 ? `${m} min` : "";

  if (!hPart && !mPart) return "0 hrs";
  return [hPart, mPart].filter(Boolean).join(" ");
}

/* yard segments extraction (your schema saves yardSegments for yard mode) */
function extractYardSegments(entry) {
  if (Array.isArray(entry?.yardSegments)) return entry.yardSegments;

  // Fallbacks (older schema)
  if (entry?.leaveTime && entry?.arriveBack)
    return [{ start: entry.leaveTime, end: entry.arriveBack }];

  if (entry?.start && entry?.end) return [{ start: entry.start, end: entry.end }];

  return [];
}

/*  Determine whether yard lunch should be deducted (fix) */
function shouldDeductYardLunch(entry) {
  if (!entry) return true;

  if (entry?.managerLunchDeduct === true) return true;
  if (entry?.managerLunchDeduct === false) return false;

  // If you ever add an explicit override in schema, honour it.
  if (entry?.yardLunchDeduct === false) return false;

  // Common patterns across apps:
  // - yardLunchSup / lunchSup often means "lunch supplement claimed" / "no lunch provided"
  //   do NOT deduct lunch from hours.
  if (entry?.yardLunchSup === true) return false;
  if (entry?.lunchSup === true) return false;

  // Some schemas use an explicit "noLunch/skipLunch" meaning lunch not taken
  if (entry?.noLunch === true) return false;
  if (entry?.skipLunch === true) return false;

  // Some schemas use "lunchTaken" / "lunch" to mean lunch was taken
  // - if explicitly false, do NOT deduct
  if (entry?.lunchTaken === false) return false;
  if (entry?.lunch === false) return false;

  // - if explicitly true, deduct
  if (entry?.lunchTaken === true) return true;
  if (entry?.lunch === true) return true;

  // Default behaviour (matches your previous intent):
  // Deduct lunch unless the user explicitly indicates no lunch / lunch supplement.
  return true;
}

/* Calculate yard day hours */
function computeYardHours(entry) {
  const segs = extractYardSegments(entry);
  let total = 0;
  segs.forEach((s) => (total += diffHours(s.start, s.end)));

  if (entry?.yardTravelEnabled) {
    total += diffHours(entry?.yardTravelLeaveTime, entry?.yardTravelArriveTime);
  }

  //  FIX: only deduct lunch when the data indicates lunch should be deducted
  if (total > 0 && shouldDeductYardLunch(entry)) total -= LUNCH_DEDUCT_HRS;

  return Math.max(0, total);
}

/* Travel hours */
function computeTravelHours(entry) {
  // In mobile: travel is leaveTime -> arriveTime
  return diffHours(entry.leaveTime, entry.arriveTime);
}

function computeOfficeHours(entry) {
  return diffHours(entry.startTime, entry.endTime);
}

function computeWaitingAllowanceHours(entry) {
  const arrive = entry?.arriveTime;
  const call = entry?.callTime;
  if (!arrive || !call) return 0;

  const preCallHrs = getPrecallHours(entry);
  const callMinutes = toMinutes(call);
  const arriveMinutes = toMinutes(arrive);
  if (callMinutes == null || arriveMinutes == null) return 0;

  let targetMinutes = callMinutes - Math.round(preCallHrs * 60);
  while (targetMinutes < 0) targetMinutes += 24 * 60;

  let diffMinutes = targetMinutes - arriveMinutes;
  if (diffMinutes < 0) diffMinutes += 24 * 60;

  return Math.min(Math.max(0, diffMinutes / 60), 1);
}

function computeHotelTravelExemptionHours(entry) {
  return entry?.overnight ? 0.5 : 0;
}

function getPrecallHours(entry) {
  return getPrecallInfo(entry).hours;
}

function computeOnSetBreakdown(entry) {
  const travelToHrs = computeTravelHours(entry);
  const preCallHrs = getPrecallHours(entry);
  const callToWrapHrs =
    entry?.callTime && entry?.wrapTime ? diffHours(entry.callTime, entry.wrapTime) : 0;
  const travelBackHrs =
    entry?.wrapTime && entry?.arriveBack ? diffHours(entry.wrapTime, entry.arriveBack) : 0;

  if (entry?.callTime) {
    const callToFinishHrs = entry?.arriveBack
      ? diffHours(entry.callTime, entry.arriveBack)
      : entry?.wrapTime
      ? diffHours(entry.callTime, entry.wrapTime)
      : 0;

    const onSetPaidHrs = 10;
    const extraAfterTenHrs = Math.max(0, callToFinishHrs - onSetPaidHrs);

    return {
      travelToHrs,
      preCallHrs,
      onSetBlockHrs: callToWrapHrs,
      onSetPaidHrs,
      travelBackHrs,
      extraAfterTenHrs,
      totalHrs: travelToHrs + preCallHrs + onSetPaidHrs + extraAfterTenHrs,
    };
  }

  const fallbackWindowHrs =
    entry?.leaveTime && entry?.arriveBack ? diffHours(entry.leaveTime, entry.arriveBack) : 0;
  const legacyOnSetHrs = callToWrapHrs || fallbackWindowHrs;

  return {
    travelToHrs,
    preCallHrs,
    onSetBlockHrs: legacyOnSetHrs,
    onSetPaidHrs: legacyOnSetHrs,
    travelBackHrs,
    extraAfterTenHrs: travelBackHrs,
    totalHrs: Math.max(0, legacyOnSetHrs + preCallHrs),
  };
}

/* On-set hours (match mobile's intention: call->wrap (+precall) OR leave->arriveBack fallback) */
function computeOnSetHours(entry) {
  return computeOnSetBreakdown(entry).totalHrs;
}

function isCancellationDay(entry) {
  if (!entry) return false;

  if (entry.cancellationDay === true) return true;
  if (entry.cancelDay === true) return true;
  if (entry.cancelledDay === true) return true;
  if (entry.canceledDay === true) return true;

  const rawType = String(entry.type || entry.mode || entry.dayType || "").toLowerCase();
  return rawType.includes("cancel");
}

/*  TURNAROUND DETECTION (matches how mobile saves it) */
function isTurnaroundDay(entry) {
  if (!entry) return false;

  // Your mobile code: yard day uses isTurnaround boolean (only meaningful on mode === "yard")
  if (entry.isTurnaround === true && String(entry.mode || "yard").toLowerCase() === "yard")
    return true;

  // Backwards compatibility (in case older docs used other keys)
  if (entry.turnaround === true) return true;
  if (entry.turnaroundDay === true) return true;

  return false;
}

/*  Turnaround hours: 0 unless user added yardSegments */
function computeTurnaroundHours(entry) {
  const segs = extractYardSegments(entry);
  if (!segs || segs.length === 0) return 0;

  // If they manually added blocks on a turnaround day, count them (and don’t force lunch deduction)
  let total = 0;
  segs.forEach((s) => (total += diffHours(s.start, s.end)));
  return Math.max(0, total);
}

/* Determine day mode (mirror mobile: uses entry.mode + isTurnaround flag) */
function detectMode(entry, isWeekend) {
  if (!entry) return isWeekend ? "off" : "missing";

  const rawMode = String(entry.mode || "yard").toLowerCase();

  // Bank holiday / holiday / off saved by locks on mobile
  if (rawMode === "holiday") return "holiday";
  if (rawMode === "bankholiday") return "bankholiday";
  if (rawMode === "off") return "off";
  if (rawMode === "unpaid") return "unpaid";

  //  Turnaround is a yard-day flag, not a mode
  if (rawMode === "yard" && isTurnaroundDay(entry)) return "turnaround";

  if (rawMode === "travel") return "travel";
  if (rawMode === "onset") return "onset";
  if (rawMode === "office") return "office";
  if (rawMode === "yard") return "yard";

  return "yard";
}

function hasMeaningfulDayEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  const timeFields = [
    "leaveTime",
    "arriveTime",
    "arriveBack",
    "callTime",
    "wrapTime",
    "startTime",
    "endTime",
    "note",
    "dayNotes",
    "journeyTime",
    "lunchSup",
    "travelLunchSup",
    "travelPD",
    "overnight",
    "lateSup",
    "mealSup",
    "generatorUsed",
    "hasJob",
    "bookingId",
    "jobNumber",
    "manualEntry",
    "unpaidDay",
    "bankHolidayWorked",
    "unpaidRestore",
    "workType",
    "dayWorkType",
    "mode",
    "precallDuration",
    "holiday",
  ];

  if (timeFields.some((key) => {
    const value = entry[key];
    if (typeof value === "boolean") return value === true;
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && String(value).trim() !== "";
  })) return true;

  if (Array.isArray(entry.yardSegments) && entry.yardSegments.length > 0) return true;
  if (Array.isArray(entry.workshopJobs) && entry.workshopJobs.length > 0) return true;

  return false;
}

/* Normalize days structure to Monday..Sunday */
function normaliseDays(daysObj) {
  const out = {};
  DAYS.forEach((d) => {
    const lower = d.toLowerCase();
    out[d] = daysObj?.[lower] ?? daysObj?.[d] ?? null;
  });
  return out;
}

function toSchemaDays(daysObj) {
  const out = {};
  DAYS.forEach((d) => {
    out[d.toLowerCase()] = daysObj?.[d] ?? daysObj?.[d.toLowerCase()] ?? null;
  });
  return out;
}

function jobsFromEntry(entry, snapshot = {}) {
  if (!entry) return [];
  if (Array.isArray(entry.jobs)) return entry.jobs;

  if (!entry.bookingId && !entry.jobNumber && !entry.hasJob) return [];

  const bookingIds = Array.isArray(snapshot.bookingIds) ? snapshot.bookingIds : [];
  const jobNumbers = Array.isArray(snapshot.jobNumbers) ? snapshot.jobNumbers : [];
  const clients = Array.isArray(snapshot.clients) ? snapshot.clients : [];
  const locations = Array.isArray(snapshot.locations) ? snapshot.locations : [];
  const bookingIndex = entry.bookingId ? bookingIds.indexOf(entry.bookingId) : -1;
  const jobIndex =
    bookingIndex >= 0 ? bookingIndex : entry.jobNumber ? jobNumbers.indexOf(entry.jobNumber) : -1;

  return [
    {
      bookingId: entry.bookingId || "",
      jobNumber: entry.jobNumber || (jobIndex >= 0 ? jobNumbers[jobIndex] : ""),
      client: jobIndex >= 0 ? clients[jobIndex] || "" : "",
      location: jobIndex >= 0 ? locations[jobIndex] || "" : "",
    },
  ];
}

function normaliseAssignmentToken(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return /^\d+$/.test(text) ? text.replace(/^0+/, "") || "0" : text;
}

function addAssignmentToken(set, value) {
  const token = normaliseAssignmentToken(value);
  if (token) set.add(token);
}

function addAssignmentNameTokens(set, value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return;
  text
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .forEach((part) => addAssignmentToken(set, part));
}

function getTimesheetEmployeeTokens(timesheet = {}) {
  const tokens = new Set();
  [
    timesheet.employeeCode,
    timesheet.userCode,
    timesheet.code,
    timesheet.staffCode,
    timesheet.employeeName,
    timesheet.name,
    timesheet.fullName,
    timesheet.employeeId,
    timesheet.userId,
  ].forEach((value) => {
    addAssignmentToken(tokens, value);
    addAssignmentNameTokens(tokens, value);
  });
  return tokens;
}

function collectAssignmentTokens(source, set = new Set()) {
  if (!source) return set;
  if (Array.isArray(source)) {
    source.forEach((item) => collectAssignmentTokens(item, set));
    return set;
  }
  if (typeof source === "object") {
    [
      source.code,
      source.employeeCode,
      source.userCode,
      source.staffCode,
      source.id,
      source.employeeId,
      source.userId,
      source.uid,
      source.name,
      source.employeeName,
      source.fullName,
      source.label,
      source.value,
    ].forEach((value) => addAssignmentToken(set, value));
    return set;
  }
  addAssignmentToken(set, source);
  return set;
}

function valueForDate(map, ymd) {
  if (!map || typeof map !== "object") return null;
  return map[ymd] || map[String(ymd || "").slice(0, 10)] || null;
}

function bookingDateKeys(booking = {}) {
  const keys = new Set();
  if (Array.isArray(booking.bookingDates)) {
    booking.bookingDates.forEach((value) => {
      const key = String(value?.date || value || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) keys.add(key);
    });
  }
  [booking.dateISO, booking.date, booking.startDateISO, booking.startDate].forEach((value) => {
    const key = String(value || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) keys.add(key);
  });
  return Array.from(keys);
}

function bookingMatchesEmployeeOnDate(booking = {}, ymd, employeeTokens) {
  if (!employeeTokens?.size) return false;
  const assignmentTokens = new Set();
  [
    valueForDate(booking.employeesByDate, ymd),
    valueForDate(booking.employeeAssignmentsByDate, ymd),
    valueForDate(booking.employeeCodesByDate, ymd),
    valueForDate(booking.assignedEmployeeCodesByDate, ymd),
    booking.employees,
    booking.employeeCodes,
    booking.assignedEmployeeCodes,
    booking.staff,
    booking.crew,
  ].forEach((source) => collectAssignmentTokens(source, assignmentTokens));
  return Array.from(assignmentTokens).some((token) => employeeTokens.has(token));
}

function jobFromBooking(booking = {}, ymd = "") {
  const dayNoteMeta = resolveBookingDayNoteMeta(booking, ymd);
  return {
    bookingId: booking.id || "",
    id: booking.id || "",
    jobNumber: booking.jobNumber || "",
    client: booking.client || "",
    location: booking.location || "",
    vehicles: Array.isArray(booking.vehicles) ? booking.vehicles : [],
    dayNote: dayNoteMeta.text,
    dayNoteType: dayNoteMeta.type,
    dayNoteTravelMins: dayNoteMeta.travelMins,
    booking,
  };
}

function manualJobKey(job = {}) {
  return String(job.bookingId || job.id || job.jobNumber || "").trim();
}

function getBlockNote(block) {
  return String(block?.note || block?.notes || block?.description || "").trim();
}

async function loadTimesheetQueries(timesheet, dataAccessState) {
  if (!timesheet?.id) return [];

  const bySchema = [];
  if (timesheet.employeeCode && timesheet.weekStart) {
    const q = tenantCollectionQuery(
      db,
      "timesheetQueries",
      dataAccessState,
      [
      where("employeeCode", "==", timesheet.employeeCode),
      where("weekStart", "==", timesheet.weekStart)
      ]
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => bySchema.push({ id: d.id, ...d.data() }));
  }

  const byLegacyId = [];
  const legacyQ = tenantCollectionQuery(db, "timesheetQueries", dataAccessState, [where("timesheetId", "==", timesheet.id)]);
  const legacySnap = await getDocs(legacyQ);
  legacySnap.docs.forEach((d) => byLegacyId.push({ id: d.id, ...d.data() }));

  const merged = new Map();
  [...bySchema, ...byLegacyId].forEach((row) => merged.set(row.id, row));
  return Array.from(merged.values());
}

/* Format Pre-Call minutes */
function formatPrecallMinutes(min) {
  return getPrecallInfo({ precallDuration: min }).label;
}

function formatShortDate(value) {
  const d = parseDateFlexible(value);
  if (!d) return "-";
  return d.toLocaleDateString("en-GB");
}

function resolveBookingDayNote(booking, ymd) {
  if (!booking || !ymd) return "";
  const notesByDate =
    booking?.notesByDate && typeof booking.notesByDate === "object" ? booking.notesByDate : null;
  if (!notesByDate) return "";

  const note = String(notesByDate[ymd] || "").trim();
  if (!note) return "";

  if (note === "Other") {
    return String(notesByDate[`${ymd}-other`] || "").trim() || note;
  }

  if (note === "Travel Time") {
    const mins = String(notesByDate[`${ymd}-travelMins`] || "").trim();
    return mins ? `Travel Time - ${mins} mins` : note;
  }

  return note;
}

function resolveBookingDayNoteMeta(booking, ymd) {
  if (!booking || !ymd) return { type: "", text: "", travelMins: 0 };
  const notesByDate =
    booking?.notesByDate && typeof booking.notesByDate === "object" ? booking.notesByDate : null;
  if (!notesByDate) return { type: "", text: "", travelMins: 0 };

  const rawType = String(notesByDate[ymd] || "").trim();
  if (!rawType) return { type: "", text: "", travelMins: 0 };

  if (rawType === "Other") {
    return {
      type: rawType,
      text: String(notesByDate[`${ymd}-other`] || "").trim() || rawType,
      travelMins: 0,
    };
  }

  if (rawType === "Travel Time") {
    const mins = Number(notesByDate[`${ymd}-travelMins`] || 0);
    return {
      type: rawType,
      text: mins > 0 ? `Travel Time - ${mins} mins` : rawType,
      travelMins: mins > 0 ? mins : 0,
    };
  }

  return { type: rawType, text: rawType, travelMins: 0 };
}

function getVehicleLookupKeys(vehicle) {
  if (vehicle == null) return [];
  if (typeof vehicle === "string") {
    const raw = vehicle.trim();
    return raw ? [raw] : [];
  }

  if (typeof vehicle !== "object") return [];

  const values = [
    vehicle.id,
    vehicle.vehicleId,
    vehicle.name,
    vehicle.registration,
    vehicle.reg,
    vehicle.numberPlate,
    vehicle.plate,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return Array.from(new Set(values));
}

function resolveVehicleLabel(vehicle, lookup = {}) {
  if (vehicle == null) return { name: "Vehicle", registration: "No Reg" };
  if (typeof vehicle === "object") {
    const keys = getVehicleLookupKeys(vehicle);
    for (const key of keys) {
      if (lookup[key]) return lookup[key];
    }

    const name = String(vehicle.name || vehicle.label || vehicle.vehicleName || "").trim();
    const registration = String(
      vehicle.registration || vehicle.reg || vehicle.numberPlate || vehicle.plate || ""
    ).trim();

    return {
      name: name || keys[0] || "Vehicle",
      registration: registration || "No Reg",
    };
  }

  const raw = String(vehicle).trim();
  if (!raw) return { name: "Vehicle", registration: "No Reg" };
  return lookup[raw] || { name: raw, registration: "No Reg" };
}

function getPayAdviceJobName(card, primaryJob) {
  if (primaryJob?.jobNumber) {
    return `#${primaryJob.jobNumber}${primaryJob.client ? ` - ${primaryJob.client}` : ""}`;
  }

  if (primaryJob?.client || primaryJob?.title) {
    return primaryJob.client || primaryJob.title;
  }

  if (card.hasLiveHoliday) {
    const paid = String(card.paidLabel || "").trim().toLowerCase();
    if (paid === "unpaid") return "Holiday - Unpaid";
    if (paid) return `Holiday - ${card.paidLabel}`;
    return "Holiday";
  }

  switch (card.mode) {
    case "yard":
      return "Yard";
    case "travel":
      return "Travel";
    case "turnaround":
      return "Turnaround";
    case "bankholiday":
      return "Bank Holiday";
    case "holiday":
      return "Holiday";
    case "off":
      return "Day Off";
    case "onset":
      return "On Set";
    default:
      return "-";
  }
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function printElementById(elementId, title) {
  if (typeof window === "undefined") return;

  const printRoot = document.getElementById(elementId);
  if (!printRoot) {
    window.print();
    return;
  }

  const printWindow = window.open("", "_blank", "width=1400,height=900");
  if (!printWindow) return;

  const printHtml = printRoot.outerHTML;

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: var(--color-white);
            color: var(--color-text);
            font-family: Arial, sans-serif;
          }
          body { padding: 10px; }
          h1, h2, h3, p, div, span, li, strong, button, td, th {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #timesheet-print-root,
          #pay-advice-print-root {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            background: var(--color-white) !important;
            width: 100% !important;
            max-width: 100% !important;
            overflow: visible !important;
          }
          #timesheet-print-root > div:nth-of-type(2) {
            display: grid !important;
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 6px !important;
            overflow: visible !important;
            padding-bottom: 0 !important;
          }
          #timesheet-print-root > div:nth-of-type(2) > div {
            min-width: 0 !important;
            padding: 8px !important;
            border-radius: var(--radius-md) !important;
            font-size: 10px !important;
            break-inside: avoid;
          }
          #timesheet-print-root > div:nth-of-type(2) > div button {
            display: none !important;
          }
          #timesheet-print-root > div:nth-of-type(3) {
            gap: 6px !important;
            margin-top: 8px !important;
          }
          #timesheet-print-root > div:nth-of-type(3) > div {
            border-radius: var(--radius-md) !important;
          }
          #timesheet-print-root ul {
            margin-top: 2px !important;
            margin-bottom: 0 !important;
            padding-left: 14px !important;
          }
          #timesheet-print-root li {
            margin-bottom: 1px !important;
          }
          #timesheet-print-root [style*="font-size: 24px"] {
            font-size: 18px !important;
          }
          #timesheet-print-root [style*="font-size: 15"] {
            font-size: 12px !important;
          }
          #timesheet-print-root [style*="font-size: 14"] {
            font-size: 11px !important;
          }
          #timesheet-print-root [style*="font-size: 13"] {
            font-size: 10px !important;
          }
          #pay-advice-print-root table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 10px;
          }
          #pay-advice-print-root th,
          #pay-advice-print-root td {
            border: 1px solid var(--legacy-color-111827);
            padding: 4px 5px;
            vertical-align: middle;
            text-align: center;
            word-break: break-word;
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        </style>
      </head>
      <body>${printHtml}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 150);
  };
}

/* Expand a holiday start/end into an array of Y-M-D strings */
function eachDateYMD(startRaw, endRaw) {
  const start = parseDateFlexible(startRaw);
  const end = parseDateFlexible(endRaw || startRaw);
  if (!start || !end) return [];

  const out = [];
  let cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDt = new Date(end);
  endDt.setHours(0, 0, 0, 0);

  while (cur <= endDt) {
    out.push(toLocalYMD(cur));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

function normalizeBooleanish(value) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value === 1;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (["true", "1", "yes", "y", "on"].includes(text)) return true;
  if (["false", "0", "no", "off", "n"].includes(text)) return false;
  return null;
}

function getHolidayDateKeys(holiday = {}) {
  const keys = new Set();

  const rangeFields = [
    ["startDate", "endDate"],
    ["from", "to"],
    ["fromDate", "toDate"],
    ["startDateISO", "endDateISO"],
  ];
  rangeFields.forEach(([startField, endField]) => {
    const range = eachDateYMD(holiday[startField], holiday[endField] || holiday[startField]);
    range.forEach((key) => keys.add(key));
  });

  if (keys.size === 0) {
    ["date", "dateISO", "start", "day", "holidayDate", "holidayDateKey"].forEach((key) => {
      const keyDate = String(holiday[key] || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(keyDate)) keys.add(keyDate);
    });
  }

  if (Array.isArray(holiday.holidayDateKeys)) {
    holiday.holidayDateKeys.forEach((ymd) => {
      const key = String(ymd || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) keys.add(key);
    });
  }
  if (Array.isArray(holiday.dates)) {
    holiday.dates.forEach((ymd) => {
      const key = String(ymd || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) keys.add(key);
    });
  }

  return Array.from(keys);
}

function getHolidayPaidLabel(holiday = {}) {
  const paidStatus = String(holiday.paidStatus || holiday.leaveType || "").trim();
  const isUnpaid = normalizeBooleanish(holiday.isUnpaid);
  const isAccrued = normalizeBooleanish(holiday.isAccrued);
  const isPaid = normalizeBooleanish(holiday.paid);

  if (isUnpaid === true) return "Unpaid";
  if (isAccrued === true) return "Accrued";
  if (isPaid === false) return "Unpaid";
  return paidStatus || "";
}

function getHolidayLockForDate(holidayDocs = [], ymd = "") {
  if (!Array.isArray(holidayDocs) || !holidayDocs.length) return null;

  const visible = holidayDocs.filter(
    (holiday) => isApprovedHolidayRecord(holiday) && getHolidayDayMeta(holiday, ymd).applies
  );
  if (!visible.length) return null;

  const dayMeta = visible.map((holiday) => getHolidayDayMeta(holiday, ymd));
  const halfHoliday = dayMeta.some((meta) => meta.halfDay);
  const paidLabels = visible
    .map(getHolidayPaidLabel)
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  const paidLabel = Array.from(new Set(paidLabels));

  const holidayReason = visible.find((h) => String(h.holidayReason || "").trim())?.holidayReason || "";
  const halfLabel = dayMeta
    .map((meta) => meta.period)
    .find(Boolean) || "";

  return {
    mode: halfHoliday ? "yard" : "holiday",
    halfHoliday,
    halfLabel,
    paidStatuses: paidLabel,
    paidLabel: paidLabel.join(" / "),
    holidayReason,
  };
}

/* -------------------------------------------------------------------------- */
/*                               PAGE                                         */
/* -------------------------------------------------------------------------- */

export default function TimesheetDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const authState = useAuth() || {};
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const userEmail = String(authState.user?.email || "").trim().toLowerCase();
  const isAdmin = Boolean(authState.isAdmin);
  const currentTimesheetIdentity = useMemo(
    () => buildTimesheetUserIdentity(authState.user, authState.userDoc || {}),
    [authState.user, authState.userDoc]
  );

  const [timesheet, setTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [jobsByDay, setJobsByDay] = useState({});
  const [vehicleLookup, setVehicleLookup] = useState({});
  const [holidaysByDate, setHolidaysByDate] = useState({});
  const [bankHolidaysByDate, setBankHolidaysByDate] = useState({});

  // manager actions
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [queryDay, setQueryDay] = useState("");
  const [queryField, setQueryField] = useState("overall");
  const [queryNote, setQueryNote] = useState("");
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [querySuccess, setQuerySuccess] = useState("");
  const [queries, setQueries] = useState([]);
  const [lunchSavingDay, setLunchSavingDay] = useState("");
  const [manualEntryDay, setManualEntryDay] = useState("");
  const [manualEntryDraft, setManualEntryDraft] = useState(null);
  const [manualEntrySavingDay, setManualEntrySavingDay] = useState("");
  const [payAdviceEdits, setPayAdviceEdits] = useState({});
  const [payAdviceRateEdits, setPayAdviceRateEdits] = useState({});
  const [payAdviceSaving, setPayAdviceSaving] = useState(false);
  const [payAdviceMessage, setPayAdviceMessage] = useState("");
  const [payAdvicePin, setPayAdvicePin] = useState("");
  const [payAdvicePinUnlocked, setPayAdvicePinUnlocked] = useState(false);
  const [payAdvicePinError, setPayAdvicePinError] = useState("");
  const [employeePayrollRates, setEmployeePayrollRates] = useState(null);
  const [globalPayrollRates, setGlobalPayrollRates] = useState(null);
  const [employeeYardAutofill, setEmployeeYardAutofill] = useState({
    start: DEFAULT_YARD_START,
    end: DEFAULT_YARD_END,
    rawHours: diffHours(DEFAULT_YARD_START, DEFAULT_YARD_END),
    deductLunch: true,
  });
  const [weekNav, setWeekNav] = useState({ previous: null, next: null });
  const payAdviceLoadedRef = useRef(false);
  const payAdviceSaveTimerRef = useRef(null);
  const lastSavedPayAdviceRef = useRef("");

  const needsPayAdvicePin = userEmail === PAY_ADVICE_PIN_EMAIL && !payAdvicePinUnlocked;

  const handlePayAdvicePinSubmit = (event) => {
    event.preventDefault();
    if (payAdvicePin.trim() === PAY_ADVICE_PIN) {
      setPayAdvicePinUnlocked(true);
      setPayAdvicePin("");
      setPayAdvicePinError("");
      return;
    }
    setPayAdvicePinError("Incorrect PIN.");
  };

  /* ----------------------- Load timesheet ----------------------- */
  useEffect(() => {
    const routeId = normalizeTimesheetRouteId(id);
    if (!routeId) {
      setTimesheet(null);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const directRef = doc(db, "timesheets", routeId);
        const directSnap = await getDoc(directRef);
        if (directSnap.exists()) {
          setTimesheet({ id: directSnap.id, ...directSnap.data() });
          return;
        }

        const parsed = parseTimesheetDocId(routeId);
        const constraints = [];

        if (parsed) {
          constraints.push(where("employeeCode", "==", parsed.employeeCode));
          constraints.push(where("weekStart", "==", parsed.weekStart));
        } else if (isWeekStartId(routeId)) {
          constraints.push(where("weekStart", "==", routeId));
        }

        if (!constraints.length) {
          setTimesheet(null);
          return;
        }

        const gate = resolveDataAccess(dataAccessState);
        if (gate.checking) return;
        if (reportDataAccessBlocked(gate, { collectionName: "timesheets", operation: "Load timesheet by id" }))
          return;

        const matchSnap = await getDocs(tenantCollectionQuery(db, "timesheets", dataAccessState, constraints));
        const candidates = matchSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

        if (!candidates.length) {
          setTimesheet(null);
          return;
        }

        const picked = isAdmin
          ? candidates.sort(
              (a, b) =>
                (parseDateFlexible(b.updatedAt)?.getTime() || 0) -
                (parseDateFlexible(a.updatedAt)?.getTime() || 0)
            )[0]
          : candidates.find((item) => timesheetMatchesTimesheetUser(item, currentTimesheetIdentity)) || null;

        if (!picked) {
          setTimesheet(null);
          return;
        }

        if (picked.id !== routeId) {
          router.replace(timesheetDetailPath(picked.id));
        }
        setTimesheet(picked);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessKey, currentTimesheetIdentity, dataAccessState, id, isAdmin, router]);

  const canViewTimesheet = useMemo(() => {
    if (!timesheet?.id) return false;
    if (isAdmin) return true;
    return timesheetMatchesTimesheetUser(timesheet, currentTimesheetIdentity);
  }, [currentTimesheetIdentity, isAdmin, timesheet]);

  useEffect(() => {
    if (!timesheet?.id) {
      setAccessDenied(false);
      return;
    }
    setAccessDenied(!canViewTimesheet);
  }, [canViewTimesheet, timesheet?.id]);

  useEffect(() => {
    if (!timesheet?.id || !canViewTimesheet) {
      setWeekNav({ previous: null, next: null });
      return;
    }
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "timesheets", operation: "Load adjacent timesheets" })) return;

    (async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "timesheets", dataAccessState));
        const targetCode = String(timesheet.employeeCode || "").trim().toLowerCase();
        const targetName = String(timesheet.employeeName || "").trim().toLowerCase();

        const matching = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((item) => {
            const code = String(item.employeeCode || "").trim().toLowerCase();
            const name = String(item.employeeName || "").trim().toLowerCase();
            return (targetCode && code === targetCode) || (targetName && name === targetName);
          })
          .map((item) => ({
            id: item.id,
            weekStart: item.weekStart,
            weekStartMs: parseDateFlexible(item.weekStart)?.getTime() || 0,
          }))
          .filter((item) => item.weekStartMs > 0)
          .sort((a, b) => a.weekStartMs - b.weekStartMs);

        const currentIndex = matching.findIndex((item) => item.id === timesheet.id);
        if (currentIndex === -1) {
          setWeekNav({ previous: null, next: null });
          return;
        }

        setWeekNav({
          previous: matching[currentIndex - 1] || null,
          next: matching[currentIndex + 1] || null,
        });
      } catch (err) {
        console.error("Error loading adjacent employee timesheets:", err);
        setWeekNav({ previous: null, next: null });
      }
    })();
  }, [accessKey, canViewTimesheet, dataAccessState, timesheet?.id, timesheet?.employeeCode, timesheet?.employeeName]);

  /* ----------------------- Derived flag: approved? ----------------------- */
  const isApproved =
    String(timesheet?.status || "").toLowerCase() === "approved" || timesheet?.approved === true;

  /* ----------------------- Load UK bank holidays ----------------------- */
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("https://www.gov.uk/bank-holidays.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Bank holiday fetch failed: ${res.status}`);

        const data = await res.json();
        const items = data?.["england-and-wales"]?.events || [];
        const map = {};
        items.forEach((event) => {
          const ymd = String(event?.date || "").slice(0, 10);
          if (!ymd) return;
          map[ymd] = {
            notWorking: true,
            title: event?.title || "Bank Holiday",
            notes: event?.notes || "",
          };
        });
        setBankHolidaysByDate(map);
      } catch (err) {
        console.warn("[timesheet-id] bank holidays unavailable:", err);
        setBankHolidaysByDate({});
      }
    };

    run();
  }, []);

  /* ----------------------- Load holidays for this timesheet ----------------------- */
  useEffect(() => {
    if (!timesheet || !canViewTimesheet) return;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "holidays", operation: "Load holidays for timesheet" })) return;

    (async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "holidays", dataAccessState));
        const map = {};
        const weekStart = parseDateFlexible(timesheet?.weekStart);
        const weekEnd = weekStart ? new Date(weekStart) : null;
        if (weekEnd) weekEnd.setDate(weekEnd.getDate() + 6);
        const weekStartYmd = weekStart ? toLocalYMD(weekStart) : "";
        const weekEndYmd = weekEnd ? toLocalYMD(weekEnd) : "";

        snap.docs.forEach((d) => {
          const h = d.data();

          if (!holidayMatchesTimesheetEmployee(timesheet, h)) return;

          const dateKeys = getHolidayDateKeys(h);

          dateKeys.forEach((ymd) => {
            if (weekStartYmd && weekEndYmd && (ymd < weekStartYmd || ymd > weekEndYmd)) return;
            if (!map[ymd]) map[ymd] = [];
            map[ymd].push({ id: d.id, ...h });
          });
        });

        setHolidaysByDate(map);
      } catch (e) {
        console.error("Error loading holidays for timesheet:", e);
        setHolidaysByDate({});
      }
    })();
  }, [accessKey, canViewTimesheet, dataAccessState, timesheet]);

  /* ----------------------- Load jobs + vehicles based on snapshot ----------------------- */
  useEffect(() => {
    if (!timesheet || !canViewTimesheet) return;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "Load timesheet job vehicles" })) return;

    (async () => {
      try {
        const snapshot = timesheet.jobSnapshot || {};
        const jobMap = {};
        DAYS.forEach((d) => (jobMap[d] = []));

        const allBookingIds = new Set();

        if (snapshot.byDay) {
          DAYS.forEach((day) => {
            const arr = Array.isArray(snapshot.byDay[day]) ? snapshot.byDay[day] : [];
            jobMap[day] = arr;
            arr.forEach((j) => {
              if (j.bookingId) allBookingIds.add(j.bookingId);
            });
          });
        } else if (timesheet.days) {
          const normalisedDays = normaliseDays(timesheet.days);
          DAYS.forEach((day) => {
            const entry = normalisedDays[day];
            const arr = jobsFromEntry(entry, snapshot);
            jobMap[day] = arr;
            arr.forEach((j) => {
              if (j.bookingId) allBookingIds.add(j.bookingId);
            });
          });
        }

        const bookingDetailsById = {};
        const hasSavedJobs = Object.values(jobMap).some((arr) => Array.isArray(arr) && arr.length > 0);

        if (!hasSavedJobs) {
          const weekStart = parseDateFlexible(timesheet?.weekStart);
          const employeeTokens = getTimesheetEmployeeTokens(timesheet);
          if (weekStart && employeeTokens.size) {
            const weekDateToDay = {};
            DAYS.forEach((day, dayIndex) => {
              const dt = new Date(weekStart);
              dt.setDate(dt.getDate() + dayIndex);
              dt.setHours(0, 0, 0, 0);
              weekDateToDay[toLocalYMD(dt)] = day;
            });

            const bookingSnap = await getDocs(tenantCollectionQuery(db, "bookings", dataAccessState));
            bookingSnap.docs.forEach((bookingDoc) => {
              const booking = { id: bookingDoc.id, ...(bookingDoc.data() || {}) };
              bookingDateKeys(booking).forEach((ymd) => {
                const day = weekDateToDay[ymd];
                if (!day || !bookingMatchesEmployeeOnDate(booking, ymd, employeeTokens)) return;
                const job = jobFromBooking(booking, ymd);
                jobMap[day].push(job);
                allBookingIds.add(booking.id);
                bookingDetailsById[booking.id] = booking;
              });
            });
          }
        }

        const usedVehicleKeys = new Set();

        for (const bookingId of allBookingIds) {
          if (bookingDetailsById[bookingId]) {
            const data = bookingDetailsById[bookingId];
            if (Array.isArray(data.vehicles)) {
              data.vehicles.forEach((v) => {
                getVehicleLookupKeys(v).forEach((key) => usedVehicleKeys.add(key));
              });
            }
            continue;
          }
          try {
            const bSnap = await getDoc(doc(db, "bookings", bookingId));
            if (bSnap.exists()) {
              const data = { id: bSnap.id, ...bSnap.data() };
              bookingDetailsById[bookingId] = data;

              if (Array.isArray(data.vehicles)) {
                data.vehicles.forEach((v) => {
                  getVehicleLookupKeys(v).forEach((key) => usedVehicleKeys.add(key));
                });
              }
            }
          } catch (e) {
            console.error("Error loading booking", bookingId, e);
          }
        }

        const lookup = {};
        if (usedVehicleKeys.size > 0) {
          const vs = await getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState));
          vs.docs.forEach((d) => {
            const v = d.data() || {};
            const name = String(v.name || "").trim();
            const reg = String(v.registration || "").trim() || "No Reg";
            const docId = d.id;

            const resolved = { name: name || docId, registration: reg };
            lookup[docId] = resolved;
            if (name) lookup[name] = resolved;
            if (reg && reg !== "No Reg") lookup[reg] = resolved;
          });
        }

        const mergedJobMap = {};
        DAYS.forEach((day) => {
          const arr = jobMap[day] || [];
          const dayIndex = DAYS.indexOf(day);
          const ymdForDay = (() => {
            const weekStart = parseDateFlexible(timesheet?.weekStart);
            if (!weekStart || dayIndex < 0) return "";
            const dt = new Date(weekStart);
            dt.setDate(dt.getDate() + dayIndex);
            dt.setHours(0, 0, 0, 0);
            return toLocalYMD(dt);
          })();

          mergedJobMap[day] = arr.map((j) => {
            const b = j.bookingId && bookingDetailsById[j.bookingId];
            if (!b) return j;
            const dayNoteMeta = resolveBookingDayNoteMeta(b, ymdForDay);
            return {
              ...j,
              jobNumber: j.jobNumber || b.jobNumber || "",
              client: j.client || b.client || "",
              location: j.location || b.location || "",
              vehicles: Array.isArray(b.vehicles) ? b.vehicles : [],
              dayNote: dayNoteMeta.text,
              dayNoteType: dayNoteMeta.type,
              dayNoteTravelMins: dayNoteMeta.travelMins,
              booking: b,
            };
          });
        });

        setJobsByDay(mergedJobMap);
        setVehicleLookup(lookup);
      } catch (err) {
        console.error("Error building jobsByDay from snapshot:", err);
        setJobsByDay({});
        setVehicleLookup({});
      }
    })();
  }, [accessKey, canViewTimesheet, dataAccessState, timesheet]);

  /* ----------------------- Load existing queries for this timesheet ----------------------- */
  useEffect(() => {
    if (!timesheet?.id || !canViewTimesheet) return;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "timesheetQueries", operation: "Load timesheet queries" })) return;

    (async () => {
      try {
        const rows = await loadTimesheetQueries(timesheet, dataAccessState);
        setQueries(rows);
      } catch (err) {
        console.error("Error loading timesheet queries:", err);
        setQueries([]);
      }
    })();
  }, [accessKey, canViewTimesheet, dataAccessState, timesheet]);

  /* ------------------------------ PRINT ----------------------------------- */
  const handlePrint = () => {
    printElementById("timesheet-print-root", "Timesheet Print");
  };

  const handlePrintPayAdvice = () => {
    printElementById("pay-advice-print-root", "Weekly Pay Advice");
  };

  const handleLunchDeductionToggle = async (day, checked) => {
    if (!isAdmin || !timesheet?.id || !day) return;

    setLunchSavingDay(day);
    try {
      const existingDays = normaliseDays(timesheet.days);
      const currentEntry = existingDays?.[day] || {};
      const nextEntry = {
        ...currentEntry,
        managerLunchDeduct: checked,
      };
      const nextDays = {
        ...existingDays,
        [day]: nextEntry,
      };
      const nextSchemaDays = toSchemaDays(nextDays);

      await updateDoc(doc(db, "timesheets", timesheet.id), tenantPayload(dataAccessState, {
        days: nextSchemaDays,
        updatedAt: serverTimestamp(),
      }));

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              days: nextSchemaDays,
            }
          : prev
      );
    } catch (err) {
      console.error("Error updating lunch deduction override:", err);
      setApproveError("Failed to update lunch deduction. Please try again.");
    } finally {
      setLunchSavingDay("");
    }
  };

  const openManualEntryEditor = (card) => {
    if (!isAdmin || isApproved || !card?.day) return;
    const entry = card.entry || {};
    const entryMode = detectMode(entry, card.day === "Saturday" || card.day === "Sunday");
    const yardSeg = extractYardSegments(entry)[0] || {};
    const availableJobs = Array.isArray(card.jobsToday) ? card.jobsToday : [];
    const savedJobKeys = new Set(jobsFromEntry(entry, timesheet?.jobSnapshot || {}).map(manualJobKey).filter(Boolean));
    setManualEntryDay(card.day);
    setManualEntryDraft({
      mode: entryMode === "missing" ? "yard" : entryMode,
      start: yardSeg.start || entry.startTime || employeeYardAutofill.start || DEFAULT_YARD_START,
      end: yardSeg.end || entry.endTime || employeeYardAutofill.end || DEFAULT_YARD_END,
      leaveTime: entry.leaveTime || "",
      arriveTime: entry.arriveTime || "",
      precallDuration: normaliseTimeValue(entry.precallDuration) || "",
      callTime: entry.callTime || "",
      wrapTime: entry.wrapTime || "",
      arriveBack: entry.arriveBack || "",
      managerLunchDeduct:
        entry.managerLunchDeduct === true
          ? true
          : entry.managerLunchDeduct === false
          ? false
          : employeeYardAutofill.deductLunch,
      travelLunchSup: Boolean(entry.travelLunchSup),
      overnight: Boolean(entry.overnight),
      nightShoot: Boolean(entry.nightShoot),
      mealSup: Boolean(entry.mealSup),
      note: entry.note || entry.dayNotes || "",
      selectedJobKeys: savedJobKeys.size
        ? Array.from(savedJobKeys)
        : availableJobs.map(manualJobKey).filter(Boolean),
    });
  };

  const updateManualEntryDraft = (patch) => {
    setManualEntryDraft((current) => ({ ...(current || {}), ...patch }));
  };

  const buildManualDayEntry = (draft, card) => {
    const mode = String(draft?.mode || "yard").toLowerCase();
    const selectedKeys = new Set(Array.isArray(draft?.selectedJobKeys) ? draft.selectedJobKeys : []);
    const availableJobs = Array.isArray(card?.jobsToday) ? card.jobsToday : [];
    const jobs = selectedKeys.size
      ? availableJobs.filter((job) => selectedKeys.has(manualJobKey(job)))
      : [];
    const primaryJob = jobs[0] || null;
    const base = {
      mode,
      type: mode,
      manualEntry: true,
      manuallyAdded: true,
      dateISO: card?.ymdForDay || "",
      note: draft?.note || "",
      dayNotes: draft?.note || "",
      jobs,
      hasJob: jobs.length > 0,
      bookingId: primaryJob?.bookingId || primaryJob?.id || "",
      jobNumber: primaryJob?.jobNumber || "",
      updatedAt: new Date().toISOString(),
    };

    if (mode === "yard" || mode === "workshop") {
      return {
        ...base,
        mode: mode === "workshop" ? "yard" : "yard",
        type: mode,
        yardSegments: [
          {
            start: draft?.start || employeeYardAutofill.start || DEFAULT_YARD_START,
            end: draft?.end || employeeYardAutofill.end || DEFAULT_YARD_END,
            note: draft?.note || "",
          },
        ],
        managerLunchDeduct: draft?.managerLunchDeduct !== false,
        overnight: Boolean(draft?.overnight),
      };
    }

    if (mode === "office") {
      return {
        ...base,
        startTime: draft?.start || "09:00",
        endTime: draft?.end || "17:00",
      };
    }

    if (mode === "travel") {
      return {
        ...base,
        leaveTime: draft?.leaveTime || "",
        arriveTime: draft?.arriveTime || "",
        travelLunchSup: Boolean(draft?.travelLunchSup),
        overnight: Boolean(draft?.overnight),
      };
    }

    if (mode === "onset") {
      return {
        ...base,
        leaveTime: draft?.leaveTime || "",
        arriveTime: draft?.arriveTime || "",
        precallDuration: draft?.precallDuration || "",
        callTime: draft?.callTime || "",
        wrapTime: draft?.wrapTime || "",
        arriveBack: draft?.arriveBack || "",
        overnight: Boolean(draft?.overnight),
        nightShoot: Boolean(draft?.nightShoot),
        mealSup: Boolean(draft?.mealSup),
      };
    }

    return {
      ...base,
      mode,
      type: mode,
      jobs: [],
      hasJob: false,
      bookingId: "",
      jobNumber: "",
    };
  };

  const handleSaveManualEntry = async (card) => {
    if (!isAdmin || isApproved || !timesheet?.id || !card?.day || !manualEntryDraft) return;

    setManualEntrySavingDay(card.day);
    setApproveError("");
    try {
      const existingDays = normaliseDays(timesheet.days);
      const nextEntry = buildManualDayEntry(manualEntryDraft, card);
      const nextDays = {
        ...existingDays,
        [card.day]: nextEntry,
      };
      const nextSchemaDays = toSchemaDays(nextDays);

      await updateDoc(doc(db, "timesheets", timesheet.id), tenantPayload(dataAccessState, {
        days: nextSchemaDays,
        updatedAt: serverTimestamp(),
      }));

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              days: nextSchemaDays,
            }
          : prev
      );
      setManualEntryDay("");
      setManualEntryDraft(null);
    } catch (err) {
      console.error("Error saving manual timesheet entry:", err);
      setApproveError("Failed to save manual entry. Please try again.");
    } finally {
      setManualEntrySavingDay("");
    }
  };

  useEffect(() => {
    setPayAdviceEdits(timesheet?.payAdviceOverrides?.rows || {});
    setPayAdviceRateEdits(timesheet?.payAdviceOverrides?.rates || {});
    setPayAdviceMessage("");
    lastSavedPayAdviceRef.current = JSON.stringify({
      rows: timesheet?.payAdviceOverrides?.rows || {},
      rates: timesheet?.payAdviceOverrides?.rates || {},
    });
    payAdviceLoadedRef.current = true;
  }, [timesheet?.id, timesheet?.payAdviceOverrides]);

  useEffect(() => {
    if (!timesheet || !canViewTimesheet) return;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "employees", operation: "Load employee payroll rates" })) return;

    (async () => {
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "payrollRates"));
        setGlobalPayrollRates(settingsSnap.exists() ? settingsSnap.data() || {} : null);

        const snap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        const employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const match = employees.find((emp) => {
          const code = String(emp.userCode || emp.employeeCode || emp.code || "").trim().toLowerCase();
          const name = String(emp.name || emp.fullName || "").trim().toLowerCase();
          return (
            (timesheet.employeeCode && code && code === String(timesheet.employeeCode).trim().toLowerCase()) ||
            (timesheet.employeeName && name && name === String(timesheet.employeeName).trim().toLowerCase())
          );
        });
        setEmployeePayrollRates(match?.payrollRates || null);
        setEmployeeYardAutofill(getEmployeeYardAutofill(match));
      } catch (err) {
        console.error("Error loading employee payroll rates:", err);
        setEmployeePayrollRates(null);
        setGlobalPayrollRates(null);
        setEmployeeYardAutofill(getEmployeeYardAutofill(null));
      }
    })();
  }, [accessKey, canViewTimesheet, dataAccessState, timesheet]);

  /* ------------------------------ APPROVE --------------------------------- */
  const handleApprove = async () => {
    if (!isAdmin || !timesheet?.id) return;
    setApproving(true);
    setApproveError("");

    try {
      const ref = doc(db, "timesheets", timesheet.id);
      await updateDoc(ref, tenantPayload(dataAccessState, {
        status: "approved",
        submitted: true,
        approved: true,
        approvedAt: serverTimestamp(),
      }));

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              status: "approved",
              submitted: true,
              approved: true,
              approvedAt: new Date(),
            }
          : prev
      );

      try {
        const rows = await loadTimesheetQueries(timesheet, dataAccessState);

        await Promise.all(
          rows.map((row) =>
            updateDoc(doc(db, "timesheetQueries", row.id), {
              ...tenantPayload(dataAccessState, {
              status: "closed",
              closedAt: serverTimestamp(),
              }),
            })
          )
        );

        const rowsAfterClose = await loadTimesheetQueries(timesheet, dataAccessState);
        setQueries(rowsAfterClose);
      } catch (qErr) {
        console.error("Error closing timesheet queries on approve:", qErr);
      }
    } catch (err) {
      console.error("Error approving timesheet:", err);
      setApproveError("Failed to approve timesheet. Please try again.");
    } finally {
      setApproving(false);
    }
  };

  /* ------------------------------ QUERY ----------------------------------- */
  const handleSubmitQuery = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (!isAdmin || !timesheet?.id) return;

    setQueryError("");
    setQuerySuccess("");

    if (isApproved) {
      setQueryError("This timesheet has been approved. You can no longer send new queries.");
      return;
    }

    if (!queryDay) {
      setQueryError("Please select a day.");
      return;
    }
    if (!queryNote.trim()) {
      setQueryError("Please enter a note describing the issue.");
      return;
    }

    setQuerySubmitting(true);
    try {
      await addDoc(collection(db, "timesheetQueries"), tenantPayload(dataAccessState, {
        timesheetId: timesheet.id,
        employeeName: timesheet.employeeName || "",
        employeeCode: timesheet.employeeCode || "",
        weekStart: timesheet.weekStart || null,
        day: queryDay,
        field: queryField || "overall",
        message: queryNote.trim(),
        note: queryNote.trim(),
        status: "open",
        createdAt: serverTimestamp(),
        createdByRole: "manager",
      }));

      const rows = await loadTimesheetQueries(timesheet, dataAccessState);
      setQueries(rows);

      setQuerySuccess("Query sent to employee.");
      setQueryNote("");
    } catch (err) {
      console.error("Error creating timesheet query:", err);
      setQueryError("Failed to send query. Please try again.");
    } finally {
      setQuerySubmitting(false);
    }
  };

  /* ----------------------- Vehicle display resolver ----------------------- */
  const resolveVehicle = (key) => {
    return resolveVehicleLabel(key, vehicleLookup);
  };

  const weekStartDate = useMemo(() => parseDateFlexible(timesheet?.weekStart), [timesheet?.weekStart]);

  const dayMap = useMemo(() => normaliseDays(timesheet?.days), [timesheet?.days]);

  //  Build a stable 7-day render model + weekly total
  const { dayCards, weeklyTotal } = useMemo(() => {
    let total = 0;

    const cards = DAYS.map((day) => {
      const entry = dayMap?.[day] ?? null;
      const isWeekend = day === "Saturday" || day === "Sunday";

      const rawJobs = jobsByDay?.[day] || [];
      const jobsToday = Array.isArray(rawJobs) ? rawJobs : [];
      const hasJobs = jobsToday.length > 0;

      // calendar date for this day (used to show holidays)
      let ymdForDay = null;
      let dayDateLabel = day;
      if (weekStartDate) {
        const dayIndex = DAYS.indexOf(day);
        const dt = new Date(weekStartDate);
        dt.setDate(dt.getDate() + dayIndex);
        dt.setHours(0, 0, 0, 0);
        ymdForDay = toLocalYMD(dt);
        dayDateLabel = formatDayDateLabel(dt) || day;
      }

      const holidayDocsForDay = ymdForDay ? holidaysByDate?.[ymdForDay] || [] : [];
      const holidayLock = getHolidayLockForDate(holidayDocsForDay, ymdForDay);
      const hasLiveHolidayLock = Boolean(holidayLock);
      const hasLiveHoliday = hasLiveHolidayLock;
      const hasPendingHoliday = holidayDocsForDay.some(
        (holiday) => isPendingHolidayRecord(holiday) && getHolidayDayMeta(holiday, ymdForDay).applies
      );
      const bankHolidayInfo = ymdForDay ? bankHolidaysByDate?.[ymdForDay] || null : null;
      const hasBankHoliday = Boolean(bankHolidayInfo);
      const isHalfHoliday = Boolean(holidayLock?.halfHoliday);
      let paidLabel = hasLiveHolidayLock ? holidayLock.paidLabel || "" : null;

      const entryExists = hasMeaningfulDayEntry(entry);

      const workedMode = detectMode(entry, isWeekend);
      let mode = workedMode;

      if (
        hasBankHoliday &&
        (!entryExists || mode === "missing" || mode === "off" || mode === "holiday")
      ) {
        mode = "bankholiday";
      }

      if (isWeekend && hasLiveHoliday && (paidLabel || mode === "holiday")) {
        paidLabel = "Unpaid";
      }

      if (hasLiveHolidayLock) {
        if (!isHalfHoliday) mode = holidayLock.mode;
        if (isHalfHoliday && !paidLabel) {
          paidLabel = holidayLock.halfLabel || "Half day";
        }
      }

      // If there is NO LIVE HOLIDAY, don't honour old "holiday" mode on the timesheet
      if ((mode === "holiday" || mode === "bankholiday") && !hasLiveHoliday) {
        // Keep bankholiday if the timesheet explicitly says it (mobile locks it),
        // but if your system relies on holiday collection only, you can remove this.
        // For now, leave as-is if saved.
      }

      const isBankHolidayDay = mode === "bankholiday";
      const isHalfHolidayDay = hasLiveHolidayLock && isHalfHoliday;
      const displayPaidLabel = isBankHolidayDay ? "Paid" : paidLabel || "";
      const isPaidHolidayDay =
        isBankHolidayDay ||
        (hasLiveHolidayLock && String(paidLabel || "").trim().toLowerCase() !== "unpaid");
      const paidHolidayLunchDeducted = isPaidHolidayDay
        ? entry?.managerLunchDeduct === true
          ? true
          : entry?.managerLunchDeduct === false
          ? false
          : employeeYardAutofill.deductLunch
        : false;
      const paidHolidayHours = isPaidHolidayDay
        ? Math.max(
            0,
            employeeYardAutofill.rawHours - (paidHolidayLunchDeducted ? LUNCH_DEDUCT_HRS : 0)
          )
        : 0;
      const holidayHours = isHalfHolidayDay ? paidHolidayHours / 2 : paidHolidayHours;
      let workedHours = 0;
      if (entryExists) {
        if (workedMode === "yard") workedHours = computeYardHours(entry);
        if (workedMode === "travel") workedHours = computeTravelHours(entry);
        if (workedMode === "onset") workedHours = computeOnSetHours(entry);
        if (workedMode === "office") workedHours = computeOfficeHours(entry);
        if (workedMode === "turnaround") workedHours = computeTurnaroundHours(entry);
      }

      const holidayKind = isHalfHolidayDay
        ? "half"
        : isBankHolidayDay || (hasLiveHolidayLock && mode === "holiday")
        ? "full"
        : "none";
      const totalHours = combineTimesheetDayHours({ workedHours, holidayHours, holidayKind, mode });

      total += totalHours;

      const dayTotalLabel = formatHoursLabel(totalHours);
      const precallLabel = entryExists ? formatPrecallMinutes(entry?.precallDuration) : "";
      const onSetBreakdown = entryExists ? computeOnSetBreakdown(entry) : null;
      const travelToHrs = onSetBreakdown?.travelToHrs || 0;
      const preCallHrs = onSetBreakdown?.preCallHrs || 0;
      const onSetBlockHrs = onSetBreakdown?.onSetBlockHrs || 0;
      const onSetPaidHrs = onSetBreakdown?.onSetPaidHrs || 0;
      const travelBackHrs = onSetBreakdown?.travelBackHrs || 0;
      const extraAfterTenHrs = onSetBreakdown?.extraAfterTenHrs || 0;

      // Turnaround job (how mobile saves it)
      const turnaroundJob = entryExists ? entry?.turnaroundJob || null : null;
      const hasTurnaroundJob = !!turnaroundJob?.bookingId;

      // Yard segments for UI (turnaround might have none)
      const yardSegs = entryExists ? extractYardSegments(entry) : [];

      //  For UI label: whether lunch was deducted on yard day
      const yardLunchDeducted =
        entryExists && mode === "yard" && yardSegs.length > 0 && shouldDeductYardLunch(entry);

      return {
        day,
        dayDateLabel,
        ymdForDay,
        entry,
        entryExists,
        jobsToday,
        hasJobs,
        mode,
        hasLiveHoliday,
        hasPendingHoliday,
        hasBankHoliday,
        bankHolidayName: bankHolidayInfo?.title || "",
        paidLabel,
        displayPaidLabel,
        isPaidHolidayDay,
        isHalfHolidayDay,
        workedHours,
        holidayHours,
        totalHours,
        paidHolidayHoursToUse: holidayHours,
        paidHolidayLunchDeducted,
        paidHolidayTimeLabel: `${employeeYardAutofill.start} -> ${employeeYardAutofill.end}`,
        dayTotalLabel,
        precallLabel,
        travelToHrs,
        preCallHrs,
        onSetBlockHrs,
        onSetPaidHrs,
        travelBackHrs,
        extraAfterTenHrs,
        yardSegs,
        turnaroundJob,
        hasTurnaroundJob,
        yardLunchDeducted,
      };
    });

    return { dayCards: cards, weeklyTotal: total };
  }, [dayMap, jobsByDay, holidaysByDate, bankHolidaysByDate, weekStartDate, employeeYardAutofill]);

  const payAdvice = useMemo(() => {
    const baseRates = {
      workshopRate: Number(employeePayrollRates?.workshopRate || 0),
      overtimeRate: Number(employeePayrollRates?.overtimeRate || 0),
      travelRate: Number((globalPayrollRates?.travelRate ?? employeePayrollRates?.travelRate) || 0),
      sundayRate: Number(employeePayrollRates?.sundayRate || 0),
      onSetRate: Number(employeePayrollRates?.onSetRate || 0),
      onSetOvertimeRate: Number(employeePayrollRates?.onSetOvertimeRate || 0),
      weekendSupplementRate: Number(employeePayrollRates?.weekendSupplementRate || 0),
      overnightRate: Number((globalPayrollRates?.overnightRate ?? employeePayrollRates?.overnightRate) || 0),
      travelMealRate: Number((globalPayrollRates?.travelMealRate ?? employeePayrollRates?.travelMealRate) || 0),
    };
    const rates = {
      ...baseRates,
      ...Object.fromEntries(
        Object.entries(payAdviceRateEdits || {}).map(([key, value]) => [key, Number(value || 0)])
      ),
    };

    const rows = dayCards.map((card, index) => {
      const entry = card.entry || {};
      const dt = weekStartDate ? new Date(weekStartDate) : null;
      if (dt) {
        dt.setDate(dt.getDate() + index);
      }

      const primaryJob = Array.isArray(card.jobsToday) && card.jobsToday.length ? card.jobsToday[0] : null;
      const hasJobOnTravelDay = card.mode === "travel" && !!primaryJob;
      const dayNoteType = String(primaryJob?.dayNoteType || "").toLowerCase();
      const isTravelTimeNoteDay = hasJobOnTravelDay && dayNoteType === "travel time";
      const isHalfDayTravelNoteDay =
        hasJobOnTravelDay && (dayNoteType === "1/2 day travel" || dayNoteType === "half day travel");
      const workshopWorkedHrs = card.mode === "yard" ? card.workedHours : 0;
      const workshopHrs = workshopWorkedHrs + card.holidayHours;
      const isTurnaroundPayDay = card.mode === "turnaround";
      const isCancellationPayDay = isCancellationDay(entry);
      const actualTravelToHrs = card.travelToHrs || 0;
      const preCallHrs = card.preCallHrs || 0;
      const waitingAllowanceHrs = card.mode === "onset" ? computeWaitingAllowanceHours(entry) : 0;
      const callElapsedToWrap =
        entry?.callTime && entry?.wrapTime ? diffHours(entry.callTime, entry.wrapTime) : 0;
      const callElapsedToBack =
        entry?.callTime && entry?.arriveBack ? diffHours(entry.callTime, entry.arriveBack) : 0;
      const wrapOvertimeHrs = card.mode === "onset" ? Math.max(0, callElapsedToWrap - 10) : 0;
      const rawTravelAfterTenHrs =
        card.mode === "onset" ? Math.max(0, callElapsedToBack - Math.max(10, callElapsedToWrap || 0)) : 0;
      const travelAfterTenHrs =
        card.mode === "onset"
          ? Math.max(0, rawTravelAfterTenHrs - computeHotelTravelExemptionHours(entry))
          : 0;
      const travelHrs =
        hasJobOnTravelDay
          ? 0
          : card.mode === "travel"
          ? computeTravelHours(entry)
          : card.mode === "onset"
          ? actualTravelToHrs + waitingAllowanceHrs + travelAfterTenHrs
          : 0;
      const onSetHrs =
        card.mode === "onset"
          ? 10
          : isHalfDayTravelNoteDay
          ? 5
          : isTravelTimeNoteDay
          ? computeTravelHours(entry)
          : hasJobOnTravelDay || isTurnaroundPayDay || isCancellationPayDay
          ? 10
          : 0;
      const onSetOvertimeHrs = card.mode === "onset" ? wrapOvertimeHrs + preCallHrs : 0;
      const payableDayTotalHrs =
        card.mode === "onset"
          ? actualTravelToHrs + waitingAllowanceHrs + preCallHrs + onSetHrs + wrapOvertimeHrs + travelAfterTenHrs + card.holidayHours
          : isHalfDayTravelNoteDay
          ? onSetHrs + card.holidayHours
          : isTravelTimeNoteDay
          ? onSetHrs + card.holidayHours
          : hasJobOnTravelDay
          ? onSetHrs + card.holidayHours
          : isTurnaroundPayDay || isCancellationPayDay
          ? onSetHrs + card.holidayHours
          : workshopHrs + travelHrs;
      const sundayHrs = card.day === "Sunday" && card.mode === "travel" && !hasJobOnTravelDay ? travelHrs : 0;
      const overnightUnits = entry?.overnight ? 1 : 0;
      const travelMealUnits =
        ((card.mode === "travel" && !hasJobOnTravelDay && !isTravelTimeNoteDay) || isHalfDayTravelNoteDay) &&
        (entry?.travelLunchSup || entry?.mealSup || isHalfDayTravelNoteDay)
          ? 1
          : 0;
      const hasWorkedDay = payableDayTotalHrs > 0;
      const wrapMinutes = toMinutes(entry?.wrapTime);
      const hasLateWrapSupplement = wrapMinutes != null && wrapMinutes > 22 * 60;
      const isPlainTravelDay =
        card.mode === "travel" && !hasJobOnTravelDay && !isTravelTimeNoteDay && !isHalfDayTravelNoteDay;
      const weekendSupplementUnits = hasWorkedDay
        ? card.day === "Sunday"
          ? 2
          : card.day === "Saturday"
          ? isPlainTravelDay
            ? 0
            : hasLateWrapSupplement
            ? 1
            : 0.5
          : hasLateWrapSupplement
          ? 1
          : 0
        : 0;

      const baseRow = {
        day: card.day,
        dateLabel: dt ? formatShortDate(dt) : "-",
        jobName: getPayAdviceJobName(card, primaryJob),
        workshopHrs,
        overtimeHrs: card.mode === "yard" ? Math.max(0, workshopWorkedHrs - 8.5) : 0,
        travelHrs,
        sundayHrs,
        onSetHrs,
        onSetOvertimeHrs,
        weekendSupplementUnits,
        overnightUnits,
        travelMealUnits,
        preCallHrs: 0,
        dailyTotalHrs: payableDayTotalHrs,
      };

      const override = payAdviceEdits?.[card.day] || {};
      const mergedRow = {
        ...baseRow,
        ...override,
      };

      const monetaryTotal =
        (Number(mergedRow.workshopHrs) || 0) * rates.workshopRate +
        (Number(mergedRow.overtimeHrs) || 0) * rates.overtimeRate +
        (Number(mergedRow.travelHrs) || 0) * rates.travelRate +
        (Number(mergedRow.sundayHrs) || 0) * rates.sundayRate +
        (Number(mergedRow.onSetHrs) || 0) * rates.onSetRate +
        (Number(mergedRow.onSetOvertimeHrs) || 0) * rates.onSetOvertimeRate +
        (Number(mergedRow.weekendSupplementUnits) || 0) * rates.weekendSupplementRate +
        (Number(mergedRow.overnightUnits) || 0) * rates.overnightRate +
        (Number(mergedRow.travelMealUnits) || 0) * rates.travelMealRate;

      return {
        ...mergedRow,
        totalMonetary: Number(monetaryTotal.toFixed(2)),
      };
    });

    const totalFor = (key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);

    return {
      rows,
      totals: {
        workshopHrs: totalFor("workshopHrs"),
        overtimeHrs: totalFor("overtimeHrs"),
        travelHrs: totalFor("travelHrs"),
        sundayHrs: totalFor("sundayHrs"),
        onSetHrs: totalFor("onSetHrs"),
        onSetOvertimeHrs: totalFor("onSetOvertimeHrs"),
        weekendSupplementUnits: totalFor("weekendSupplementUnits"),
        overnightUnits: totalFor("overnightUnits"),
        travelMealUnits: totalFor("travelMealUnits"),
        preCallHrs: 0,
        dailyTotalHrs: totalFor("dailyTotalHrs"),
        workshopAmount: Number((totalFor("workshopHrs") * rates.workshopRate).toFixed(2)),
        overtimeAmount: Number((totalFor("overtimeHrs") * rates.overtimeRate).toFixed(2)),
        travelAmount: Number((totalFor("travelHrs") * rates.travelRate).toFixed(2)),
        sundayAmount: Number((totalFor("sundayHrs") * rates.sundayRate).toFixed(2)),
        onSetAmount: Number((totalFor("onSetHrs") * rates.onSetRate).toFixed(2)),
        onSetOvertimeAmount: Number((totalFor("onSetOvertimeHrs") * rates.onSetOvertimeRate).toFixed(2)),
        weekendSupplementAmount: Number(
          (totalFor("weekendSupplementUnits") * rates.weekendSupplementRate).toFixed(2)
        ),
        overnightAmount: Number((totalFor("overnightUnits") * rates.overnightRate).toFixed(2)),
        travelMealAmount: Number((totalFor("travelMealUnits") * rates.travelMealRate).toFixed(2)),
        totalMonetary: totalFor("totalMonetary"),
      },
      rates,
    };
  }, [dayCards, weekStartDate, payAdviceEdits, employeePayrollRates, globalPayrollRates, payAdviceRateEdits]);

  const handlePayAdviceFieldChange = (day, field, value) => {
    setPayAdviceEdits((prev) => ({
      ...prev,
      [day]: {
        ...(prev?.[day] || {}),
        [field]:
          field === "jobName" || field === "dateLabel" || value === ""
            ? value
            : Number(value),
      },
    }));
    setPayAdviceMessage("");
  };

  const handlePayAdviceRateChange = (field, value) => {
    setPayAdviceRateEdits((prev) => ({
      ...prev,
      [field]: value === "" ? "" : Number(value),
    }));
    setPayAdviceMessage("");
  };

  const savePayAdviceState = useCallback(async (rows, rates, successMessage = "Pay advice saved.") => {
    if (!isAdmin || !timesheet?.id) return;
    setPayAdviceSaving(true);
    setPayAdviceMessage("");
    const payload = {
      rows: rows || {},
      rates: rates || {},
      updatedAt: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, "timesheets", timesheet.id), tenantPayload(dataAccessState, {
        payAdviceOverrides: payload,
        updatedAt: serverTimestamp(),
      }));

      lastSavedPayAdviceRef.current = JSON.stringify({
        rows: payload.rows,
        rates: payload.rates,
      });

      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              payAdviceOverrides: payload,
            }
          : prev
      );
      setPayAdviceMessage(successMessage);
    } catch (err) {
      console.error("Error saving pay advice overrides:", err);
      setPayAdviceMessage("Failed to save pay advice.");
    } finally {
      setPayAdviceSaving(false);
    }
  }, [dataAccessState, isAdmin, timesheet?.id]);

  const handleSavePayAdvice = async () => {
    await savePayAdviceState(payAdviceEdits, payAdviceRateEdits, "Pay advice saved.");
  };

  useEffect(() => {
    if (!isAdmin || isApproved || !timesheet?.id || !payAdviceLoadedRef.current) return;

    const nextSnapshot = JSON.stringify({
      rows: payAdviceEdits || {},
      rates: payAdviceRateEdits || {},
    });

    if (nextSnapshot === lastSavedPayAdviceRef.current) return;

    if (payAdviceSaveTimerRef.current) {
      clearTimeout(payAdviceSaveTimerRef.current);
    }

    setPayAdviceMessage("Saving changes...");
    payAdviceSaveTimerRef.current = setTimeout(() => {
      savePayAdviceState(payAdviceEdits, payAdviceRateEdits, "Changes saved.");
    }, 900);

    return () => {
      if (payAdviceSaveTimerRef.current) {
        clearTimeout(payAdviceSaveTimerRef.current);
        payAdviceSaveTimerRef.current = null;
      }
    };
  }, [isAdmin, isApproved, timesheet?.id, payAdviceEdits, payAdviceRateEdits, savePayAdviceState]);

  useEffect(() => {
    return () => {
      if (payAdviceSaveTimerRef.current) {
        clearTimeout(payAdviceSaveTimerRef.current);
      }
    };
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                                   RENDER                                   */
  /* -------------------------------------------------------------------------- */

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={{ ...pageWrap, color: UI.muted }}>Loading...</div>
      </HeaderSidebarLayout>
    );
  }

  if (!timesheet) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <h1 style={{ fontSize: "var(--font-size-xl)", fontWeight: 750, margin: 0 }}>No timesheet found</h1>
        </div>
      </HeaderSidebarLayout>
    );
  }

  if (accessDenied) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div
            style={{
              maxWidth: 720,
              background: UI.panel,
              border: UI.border,
              borderRadius: UI.radius,
              boxShadow: UI.shadowSm,
              padding: "var(--space-4)",
            }}
          >
            <h1 style={{ fontSize: "var(--font-size-xl)", fontWeight: 800, margin: "0 0 8px" }}>Timesheet access restricted</h1>
            <p style={{ margin: 0, color: UI.muted, fontSize: "var(--font-size-md)" }}>
              You can only view timesheets linked to your own employee record.
            </p>
          </div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  let statusLabel = "Draft (not submitted)";
  let badgeBg = "var(--color-warning-border)";
  let badgeBorder = "var(--legacy-color-fdba74)";
  let badgeColor = "var(--legacy-color-7c2d12)";

  if (timesheet.submitted && !isApproved) {
    statusLabel = "Submitted";
    badgeBg = "var(--color-success-border)";
    badgeBorder = "var(--legacy-color-86efac)";
    badgeColor = "var(--legacy-color-052e16)";
  }
  if (isApproved) {
    statusLabel = "Approved";
    badgeBg = "var(--legacy-color-dcfce7)";
    badgeBorder = "var(--legacy-color-22c55e)";
    badgeColor = "var(--color-success-hover)";
  }

  return (
    <HeaderSidebarLayout>
      <div style={{ ...pageWrap, display: "flex", flexDirection: "column" }}>
        {/* Controls (not printed) */}
        <div style={toolbarStyle}>
          <button
            onClick={() => router.back()}
            style={controlButton("ghost")}
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div style={actionRowStyle}>
            <button
              onClick={handlePrint}
              style={controlButton("primary")}
            >
              <Printer size={14} /> Print Timesheet
            </button>

            {isAdmin ? (
              <button
                onClick={handlePrintPayAdvice}
                style={controlButton("ghost")}
              >
                <Printer size={14} /> Print Pay Advice
              </button>
            ) : null}

            {isAdmin ? (
              <button
                onClick={handleApprove}
                disabled={approving || isApproved}
                style={approveButtonStyle(approving || isApproved)}
                title={isApproved ? "This timesheet has already been approved" : "Approve this timesheet"}
              >
                <CheckCircle2 size={17} />
                {isApproved ? "Approved" : approving ? "Approving..." : "Approve Timesheet"}
              </button>
            ) : null}
          </div>
        </div>

        {approveError && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 10px",
              borderRadius: UI.radiusSm,
              backgroundColor: UI.redSoft,
              border: `1px solid ${UI.redBorder}`,
              color: UI.red,
              fontSize: "var(--font-size-xs)",
              fontWeight: 600,
            }}
          >
            {approveError}
          </div>
        )}

        {/* Printable content */}
        <div
          id="timesheet-print-root"
          style={{
            ...surfaceStyle,
            flex: 1,
            padding: "var(--space-3)",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "var(--space-3)",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ fontSize: "var(--font-size-xl)", fontWeight: 750, lineHeight: 1.08, letterSpacing: 0, margin: 0, marginBottom: "var(--space-1)", color: UI.ink }}>
                Timesheet - {timesheet.employeeName || timesheet.employeeCode}
              </h1>
              <p style={{ color: UI.muted, margin: 0, fontSize: "var(--font-size-sm)" }}>
                Week starting{" "}
                <strong>
                  {parseDateFlexible(timesheet.weekStart)?.toLocaleDateString("en-GB")}
                </strong>
              </p>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => weekNav.previous && router.push(timesheetDetailPath(weekNav.previous.id))}
                  disabled={!weekNav.previous}
                  style={controlButton("ghost", !weekNav.previous)}
                >
                  Previous week{weekNav.previous ? ` (${formatShortDate(weekNav.previous.weekStart)})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => weekNav.next && router.push(timesheetDetailPath(weekNav.next.id))}
                  disabled={!weekNav.next}
                  style={controlButton("ghost", !weekNav.next)}
                >
                  Next week{weekNav.next ? ` (${formatShortDate(weekNav.next.weekStart)})` : ""}
                </button>
              </div>
            </div>

            <div style={{ textAlign: "right", fontSize: "var(--font-size-xs)" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: UI.radiusSm,
                  border: "1px solid",
                  fontSize: 11,
                  fontWeight: 800,
                  backgroundColor: badgeBg,
                  borderColor: badgeBorder,
                  color: badgeColor,
                  marginBottom: "var(--space-1)",
                }}
              >
                {statusLabel}
              </div>
              {timesheet.submittedAt && (
                <div style={{ color: UI.muted, marginTop: "var(--space-1)" }}>
                  Submitted: {parseDateFlexible(timesheet.submittedAt)?.toLocaleString("en-GB")}
                </div>
              )}
              {timesheet.approvedAt && (
                <div style={{ color: "var(--legacy-color-15803d)", marginTop: 2 }}>
                  Approved: {parseDateFlexible(timesheet.approvedAt)?.toLocaleString("en-GB")}
                </div>
              )}
            </div>
          </div>

          {/* 7-day grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(200px, 1fr))",
              gap: "var(--space-2)",
              alignItems: "stretch",
              fontSize: "var(--font-size-sm)",
              overflowX: "auto",
              paddingBottom: "var(--space-1)",
            }}
          >
            {dayCards.map((card) => {
              const {
                day,
                dayDateLabel,
                ymdForDay,
                entry,
                entryExists,
                jobsToday,
                mode,
                hasLiveHoliday,
                hasPendingHoliday,
                bankHolidayName,
                paidLabel,
                displayPaidLabel,
                isPaidHolidayDay,
                paidHolidayLunchDeducted,
                paidHolidayHoursToUse,
                isHalfHolidayDay,
                paidHolidayTimeLabel,
                dayTotalLabel,
                precallLabel,
                travelToHrs,
                preCallHrs,
                onSetBlockHrs,
                onSetPaidHrs,
                travelBackHrs,
                extraAfterTenHrs,
                yardSegs,
                turnaroundJob,
                hasTurnaroundJob,
                yardLunchDeducted,
              } = card;

              const isHolidayCard = mode === "holiday" || mode === "bankholiday" || isHalfHolidayDay;
              const isOffCard = mode === "off";
              const isUnpaidCard = mode === "unpaid";
              const isMissingCard = mode === "missing";

              const isTurnaroundCard = mode === "turnaround";
              const hasTimeBlocks = Array.isArray(yardSegs) && yardSegs.length > 0;

              return (
                <div
                  key={day}
                  style={{
                    background: "var(--color-white)",
                    padding: 10,
                    borderRadius: UI.radius,
                    border: UI.border,
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    boxSizing: "border-box",
                    fontSize: "var(--font-size-sm)",
                    minWidth: 200,
                  }}
                >
                  {/* Day header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 5,
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 800, color: UI.ink }}>{dayDateLabel}</div>
                    <div style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {entryExists && !isApproved ? (
                        <button
                          type="button"
                          onClick={() => openManualEntryEditor({ day, ymdForDay, jobsToday, entry })}
                          disabled={!isAdmin || manualEntrySavingDay === day}
                          title={!isAdmin ? "Only admins can edit manual entries." : `Edit manual entry for ${dayDateLabel}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 10.5,
                            padding: "3px 7px",
                            borderRadius: UI.radiusSm,
                            border: `1px dashed ${UI.brandBorder}`,
                            background: "var(--color-white)",
                            color: UI.brand,
                            cursor: !isAdmin || manualEntrySavingDay === day ? "not-allowed" : "pointer",
                            opacity: !isAdmin || manualEntrySavingDay === day ? 0.5 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Manual edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (!isAdmin || isApproved) return;
                          setQueryDay(day);
                        }}
                        disabled={!isAdmin || isApproved}
                        title={
                          !isAdmin
                            ? "Only admins can raise timesheet queries."
                            : isApproved
                            ? "Timesheet approved - queries are read-only."
                            : "Raise a query for this day"
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 10.5,
                          padding: "3px 7px",
                          borderRadius: UI.radiusSm,
                          border: `1px dashed ${UI.brandBorder}`,
                          background: "var(--color-white)",
                          color: UI.brand,
                          cursor: !isAdmin || isApproved ? "not-allowed" : "pointer",
                          opacity: !isAdmin || isApproved ? 0.5 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <MessageSquare size={11} /> Query
                      </button>
                    </div>
                  </div>

                  {hasPendingHoliday && !hasLiveHoliday ? (
                    <div
                      style={{
                        marginBottom: "var(--space-2)",
                        padding: "6px 8px",
                        borderRadius: UI.radiusSm,
                        border: "1px solid var(--legacy-color-fde68a)",
                        background: "var(--legacy-color-fffbeb)",
                        color: "var(--legacy-color-92400e)",
                        fontSize: 11.5,
                        fontWeight: 700,
                      }}
                    >
                      Holiday requested — pending approval (not included in hours)
                    </div>
                  ) : null}

                  {(isMissingCard || manualEntryDay === day) && (
                    <div style={{ marginBottom: "var(--space-2)" }}>
                      {isMissingCard ? (
                        <>
                          <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginBottom: 7 }}>
                            No entry submitted.
                          </div>
                          {!isApproved ? (
                            <button
                              type="button"
                              onClick={() => openManualEntryEditor({ day, ymdForDay, jobsToday, entry })}
                              disabled={!isAdmin || manualEntrySavingDay === day}
                              title={!isAdmin ? "Only admins can add manual entries." : `Add manual entry for ${dayDateLabel}`}
                              style={{
                                ...controlButton("ghost", !isAdmin || manualEntrySavingDay === day),
                                minHeight: 28,
                                padding: "4px 8px",
                                fontSize: 11.5,
                              }}
                            >
                              Add manual entry
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {manualEntryDay === day && manualEntryDraft ? (
                        <div
                          style={{
                            marginTop: "var(--space-2)",
                            padding: "var(--space-2)",
                            borderRadius: UI.radiusSm,
                            border: UI.border,
                            background: "var(--legacy-color-f8fbfd)",
                            display: "grid",
                            gap: 7,
                          }}
                        >
                          <select
                            value={manualEntryDraft.mode || "yard"}
                            onChange={(e) => updateManualEntryDraft({ mode: e.target.value })}
                            style={{ ...formControlStyle, fontSize: "var(--font-size-xs)", padding: "6px 8px" }}
                          >
                            <option value="yard">Yard</option>
                            <option value="office">Office</option>
                            <option value="travel">Travel</option>
                            <option value="onset">On Set</option>
                            <option value="off">Off</option>
                            <option value="unpaid">Unpaid</option>
                          </select>

                          {jobsToday.length > 0 ? (
                            <div
                              style={{
                                border: UI.border,
                                borderRadius: UI.radiusSm,
                                background: "var(--color-white)",
                                padding: 7,
                                display: "grid",
                                gap: 5,
                              }}
                            >
                              <div style={{ fontSize: 11, color: UI.muted, fontWeight: 800 }}>
                                Connected jobs
                              </div>
                              {jobsToday.map((job, idx) => {
                                const key = manualJobKey(job) || `job-${idx}`;
                                const selected = (manualEntryDraft.selectedJobKeys || []).includes(key);
                                return (
                                  <label
                                    key={key}
                                    style={{
                                      display: "flex",
                                      gap: 6,
                                      alignItems: "flex-start",
                                      fontSize: 11.5,
                                      color: UI.ink,
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={(e) => {
                                        const current = new Set(manualEntryDraft.selectedJobKeys || []);
                                        if (e.target.checked) current.add(key);
                                        else current.delete(key);
                                        updateManualEntryDraft({ selectedJobKeys: Array.from(current) });
                                      }}
                                    />
                                    <span>
                                      <strong>{job.jobNumber || job.bookingId || "Job"}</strong>
                                      {job.client ? ` - ${job.client}` : ""}
                                      {job.location ? ` - ${job.location}` : ""}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11.5, color: UI.muted }}>
                              No connected jobs found for this employee on this day.
                            </div>
                          )}

                          {["yard", "office"].includes(manualEntryDraft.mode) ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              {[
                                ["start", "Start"],
                                ["end", "Finish"],
                              ].map(([field, label]) => (
                                <TimeSelect
                                  key={field}
                                  label={label}
                                  value={manualEntryDraft[field] || ""}
                                  onChange={(value) => updateManualEntryDraft({ [field]: value })}
                                />
                              ))}
                            </div>
                          ) : null}

                          {manualEntryDraft.mode === "travel" ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              {[
                                ["leaveTime", "Leave"],
                                ["arriveTime", "Arrive"],
                              ].map(([field, label]) => (
                                <TimeSelect
                                  key={field}
                                  label={label}
                                  value={manualEntryDraft[field] || ""}
                                  onChange={(value) => updateManualEntryDraft({ [field]: value })}
                                />
                              ))}
                            </div>
                          ) : null}

                          {manualEntryDraft.mode === "onset" ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              {[
                                ["leaveTime", "Leave"],
                                ["arriveTime", "Arrive"],
                                ["precallDuration", "Precall"],
                                ["callTime", "Unit Call"],
                                ["wrapTime", "Wrap"],
                                ["arriveBack", "Arrive Back"],
                              ].map(([field, label]) => (
                                <TimeSelect
                                  key={field}
                                  label={label}
                                  value={manualEntryDraft[field] || ""}
                                  onChange={(value) => updateManualEntryDraft({ [field]: value })}
                                />
                              ))}
                            </div>
                          ) : null}

                          {["yard", "travel", "onset"].includes(manualEntryDraft.mode) ? (
                            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", fontSize: 11.5, color: UI.ink }}>
                              {manualEntryDraft.mode === "yard" ? (
                                <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <input
                                    type="checkbox"
                                    checked={manualEntryDraft.managerLunchDeduct !== false}
                                    onChange={(e) => updateManualEntryDraft({ managerLunchDeduct: e.target.checked })}
                                  />
                                  Deduct lunch
                                </label>
                              ) : null}
                              {manualEntryDraft.mode === "travel" ? (
                                <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(manualEntryDraft.travelLunchSup)}
                                    onChange={(e) => updateManualEntryDraft({ travelLunchSup: e.target.checked })}
                                  />
                                  Travel meal
                                </label>
                              ) : null}
                              {manualEntryDraft.mode === "onset" ? (
                                <>
                                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(manualEntryDraft.nightShoot)}
                                      onChange={(e) => updateManualEntryDraft({ nightShoot: e.target.checked })}
                                    />
                                    Night shoot
                                  </label>
                                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(manualEntryDraft.mealSup)}
                                      onChange={(e) => updateManualEntryDraft({ mealSup: e.target.checked })}
                                    />
                                    Meal supplement
                                  </label>
                                </>
                              ) : null}
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(manualEntryDraft.overnight)}
                                  onChange={(e) => updateManualEntryDraft({ overnight: e.target.checked })}
                                />
                                Overnight
                              </label>
                            </div>
                          ) : null}

                          <textarea
                            value={manualEntryDraft.note || ""}
                            onChange={(e) => updateManualEntryDraft({ note: e.target.value })}
                            placeholder="Day notes..."
                            style={{ ...formControlStyle, minHeight: 58, resize: "vertical", fontSize: "var(--font-size-xs)" }}
                          />

                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setManualEntryDay("");
                                setManualEntryDraft(null);
                              }}
                              style={{ ...controlButton("ghost"), minHeight: 28, padding: "4px 8px", fontSize: 11.5 }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveManualEntry({ day, ymdForDay, jobsToday })}
                              disabled={manualEntrySavingDay === day}
                              style={{ ...controlButton("primary", manualEntrySavingDay === day), minHeight: 28, padding: "4px 8px", fontSize: 11.5 }}
                            >
                              {manualEntrySavingDay === day ? "Saving..." : "Save entry"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/*  TURNAROUND (matches mobile save schema) */}
                  {isTurnaroundCard && (
                    <div
                      style={{
                        background: "var(--legacy-color-f3e8ff)",
                        border: "1px solid var(--legacy-color-c4b5fd)",
                        color: "var(--legacy-color-6d28d9)",
                        padding: "7px 9px",
                        borderRadius: UI.radiusSm,
                        fontWeight: 900,
                        marginBottom: "var(--space-2)",
                      }}
                    >
                      Turnaround Day
                      <div
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "var(--legacy-color-6b7280)",
                          marginTop: 2,
                        }}
                      >
                        {hasTurnaroundJob
                          ? `Turnaround for job: ${
                              turnaroundJob.jobNumber || turnaroundJob.bookingId
                            } - ${turnaroundJob.client || "Client"}`
                          : "Turnaround for job: (not selected)"}
                      </div>
                      {hasTurnaroundJob && turnaroundJob.location ? (
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: "var(--legacy-color-6b7280)",
                            marginTop: 2,
                          }}
                        >
                          {turnaroundJob.location}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* HOLIDAY / BANK HOLIDAY / OFF */}
                  {isHolidayCard && (
                    <div style={{ fontWeight: 600 }}>
                      <div>
                        <span style={{ color: "var(--legacy-color-007da3ff)" }}>
                          {mode === "bankholiday" ? "Bank holiday" : "Holiday"}
                        </span>
                        {displayPaidLabel && (
                          <span
                            style={{
                              marginLeft: 6,
                              color:
                                displayPaidLabel.toLowerCase() === "unpaid" ? "var(--legacy-color-8a8a8aff)" : "var(--color-info)",
                            }}
                          >
                            ({displayPaidLabel})
                          </span>
                        )}
                      </div>
                      {mode === "bankholiday" && bankHolidayName ? (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 11.5,
                            color: UI.muted,
                            fontWeight: 600,
                          }}
                        >
                          {bankHolidayName}
                        </div>
                      ) : null}
                      {isPaidHolidayDay && (
                        <>
                          <div
                            style={{
                              marginTop: "var(--space-1)",
                              fontSize: "var(--font-size-xs)",
                              color: UI.muted,
                              fontWeight: 600,
                            }}
                          >
                            Paid at yard autofill: {paidHolidayTimeLabel} ({formatHoursLabel(paidHolidayHoursToUse)})
                            {isHalfHolidayDay ? " - half day" : ""}
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              display: "flex",
                              alignItems: "center",
                              gap: "var(--space-2)",
                              fontSize: 11.5,
                              color: "var(--legacy-color-475569)",
                            }}
                          >
                            <span>
                              {paidHolidayLunchDeducted ? "(-0.5 hr lunch)" : "(no lunch deduction)"}
                            </span>
                            <label
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontWeight: 600,
                                cursor: !isAdmin || isApproved ? "default" : "pointer",
                                opacity: !isAdmin || isApproved ? 0.55 : 1,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={paidHolidayLunchDeducted}
                                disabled={!isAdmin || isApproved || lunchSavingDay === day}
                                onChange={(e) => handleLunchDeductionToggle(day, e.target.checked)}
                              />
                              {lunchSavingDay === day ? "Saving lunch deduction..." : "Deduct lunch"}
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {isOffCard && <div style={{ color: "var(--legacy-color-6b7280)" }}>Day Off</div>}
                  {isUnpaidCard && <div style={{ color: "var(--legacy-color-a16207)", fontWeight: 700 }}>Unpaid day</div>}

                  {/* JOB INFO (still show jobs if they exist) */}
                  {jobsToday.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 6 }}>
                      {jobsToday.map((job, idx) => (
                        <div
                          key={`${job.bookingId || job.id || idx}-${idx}`}
                          style={{
                            background: "var(--legacy-color-fefce8)",
                            border: "1px solid var(--legacy-color-facc15)",
                            padding: "7px 9px",
                            borderRadius: UI.radiusSm,
                          }}
                        >
                          <div style={{ marginBottom: 3 }}>
                            <strong style={{ fontSize: 13.5 }}>
                              {job.jobNumber || job.id || job.bookingId}
                            </strong>

                            {job.client && (
                              <span style={{ marginLeft: 6, color: "var(--legacy-color-374151)", fontWeight: 500 }}>
                                - {job.client}
                              </span>
                            )}

                            {job.location && (
                              <span style={{ marginLeft: 6, color: "var(--legacy-color-6b7280)" }}>
                                - {job.location}
                              </span>
                            )}
                          </div>

                          {Array.isArray(job.vehicles) &&
                            job.vehicles.map((vKey, vIdx) => {
                              const v = resolveVehicle(vKey);
                              return (
                                <div
                                  key={`${job.bookingId || job.id}-vehicle-${String(vKey)}-${vIdx}`}
                                  style={{ color: "var(--legacy-color-047857)", fontWeight: 700, fontSize: "var(--font-size-sm)" }}
                                >
                                  {v.name} -{" "}
                                  <span style={{ fontWeight: 700 }}>{v.registration || "No Reg"}</span>
                                </div>
                              );
                            })}

                          {job.dayNote ? (
                            <div
                              style={{
                                marginTop: 5,
                                fontSize: "var(--font-size-xs)",
                                color: "var(--legacy-color-6b7280)",
                                fontStyle: "italic",
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              Day note: {job.dayNote}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Yard blocks (hide for turnaround UNLESS blocks exist) */}
                  {entryExists && (mode === "yard" || (mode === "turnaround" && hasTimeBlocks)) && (
                    <div style={{ fontSize: "var(--font-size-sm)", marginTop: 2 }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        {mode === "turnaround" ? "Time blocks (optional):" : "Yard:"}
                      </div>
                      {yardSegs.map((seg, i) => {
                        const blockNote = getBlockNote(seg);
                        return (
                          <div key={`${day}-seg-${i}`} style={{ marginBottom: blockNote ? 5 : 0 }}>
                            <div>
                              {seg.start} {"->"} {seg.end}
                            </div>
                            {blockNote ? (
                              <div
                                style={{
                                  marginTop: 2,
                                  color: UI.muted,
                                  fontSize: "var(--font-size-xs)",
                                  fontStyle: "italic",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {blockNote}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {entry?.yardTravelEnabled && entry?.yardTravelLeaveTime && entry?.yardTravelArriveTime ? (
                        <div style={{ marginTop: "var(--space-1)", color: UI.muted }}>
                          Yard travel: {entry.yardTravelLeaveTime} {"->"} {entry.yardTravelArriveTime}
                        </div>
                      ) : null}
                      {entry?.overnight ? <div style={{ marginTop: "var(--space-1)" }}>- Overnight</div> : null}
                      {mode === "yard" && (
                        <div style={{ color: "var(--legacy-color-9ca3af)", fontSize: "var(--font-size-xs)" }}>
                          {yardLunchDeducted ? "(-0.5 hr lunch)" : "(no lunch deduction)"}
                        </div>
                      )}
                      {mode === "yard" && (
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 6,
                            fontSize: "var(--font-size-xs)",
                            color: UI.ink,
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={yardLunchDeducted}
                            disabled={!isAdmin || isApproved || lunchSavingDay === day}
                            onChange={(e) => handleLunchDeductionToggle(day, e.target.checked)}
                          />
                          {lunchSavingDay === day ? "Saving lunch deduction..." : "Deduct lunch"}
                        </label>
                      )}
                    </div>
                  )}

                  {/* Travel */}
                  {entryExists && mode === "travel" && (
                    <div style={{ fontSize: "var(--font-size-sm)" }}>
                      <div style={{ fontWeight: 700 }}>Travel:</div>
                      <div>
                        {entry.leaveTime ?? "-"} {"->"} {entry.arriveTime ?? "-"}
                      </div>
                      {entry.travelLunchSup ? <div style={{ marginTop: "var(--space-1)" }}>Travel meal</div> : null}
                      {entry.travelPD ? <div>Travel meal</div> : null}
                      {entry.overnight ? <div>Overnight</div> : null}
                    </div>
                  )}

                  {/* Office */}
                  {entryExists && mode === "office" && (
                    <div style={{ fontSize: "var(--font-size-sm)" }}>
                      <div style={{ fontWeight: 700 }}>Office:</div>
                      <div>
                        {entry.startTime ?? "-"} {"->"} {entry.endTime ?? "-"}
                      </div>
                    </div>
                  )}

                  {/* On Set */}
                  {entryExists && mode === "onset" && (
                    <div style={{ marginTop: 3, fontSize: "var(--font-size-sm)" }}>
                      <div style={{ fontWeight: 700 }}>On Set:</div>
                      <ul style={{ marginTop: "var(--space-1)", marginLeft: "var(--space-4)", paddingLeft: 0, listStyle: "disc" }}>
                        {entry.leaveTime && <li>Leave: {entry.leaveTime}</li>}
                        {entry.arriveTime && <li>Arrive: {entry.arriveTime}</li>}
                        {precallLabel && <li>Pre-Call: {precallLabel}</li>}
                        {entry.callTime && <li>Unit-Call: {entry.callTime}</li>}
                        {entry.wrapTime && <li>Wrap: {entry.wrapTime}</li>}
                        {entry.arriveBack && <li>Back: {entry.arriveBack}</li>}
                        {entry.overnight && <li>Overnight stay</li>}
                        {entry.nightShoot && <li>Night shoot</li>}
                        {/* mealSup on mobile means "no meal supplement offered" (your info text) */}
                        {entry.mealSup && <li>Meal supplement claimed</li>}
                      </ul>

                      <div style={{ marginTop: 2 }}>
                        <div style={{ fontWeight: 700, fontSize: "var(--font-size-xs)" }}>Breakdown:</div>
                        <div style={{ fontSize: "var(--font-size-xs)" }}>Travel to: {formatHoursLabel(travelToHrs)}</div>
                        <div style={{ fontSize: "var(--font-size-xs)" }}>Pre-call: {formatHoursLabel(preCallHrs)}</div>
                        <div style={{ fontSize: "var(--font-size-xs)" }}>
                          On set{entry.callTime ? " (10-hour block)" : ""}: {formatHoursLabel(onSetPaidHrs)}
                        </div>
                        {entry.callTime ? (
                          <div style={{ fontSize: "var(--font-size-xs)" }}>
                            Extra after 10 hours: {formatHoursLabel(extraAfterTenHrs)}
                          </div>
                        ) : (
                          <div style={{ fontSize: "var(--font-size-xs)" }}>Travel back: {formatHoursLabel(travelBackHrs)}</div>
                        )}
                        {entry.callTime && entry.wrapTime ? (
                          <div style={{ fontSize: "var(--font-size-xs)", color: UI.muted }}>
                            Actual on-set window: {formatHoursLabel(onSetBlockHrs)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* NOTES */}
                  {entryExists && (entry?.note || entry?.dayNotes) && (
                    <div style={{ marginTop: 6, fontSize: "var(--font-size-xs)", color: UI.muted, fontStyle: "italic" }}>
                       {entry.note || entry.dayNotes}
                    </div>
                  )}

                  {/* Daily total */}
                  <div
                    style={{
                      marginTop: "auto",
                      borderTop: UI.border,
                      paddingTop: "var(--space-2)",
                      fontSize: "var(--font-size-xs)",
                      color: "var(--legacy-color-374151)",
                      textAlign: "right",
                    }}
                  >
                    Daily total: <strong style={{ fontWeight: 700 }}>{dayTotalLabel}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* WEEK TOTAL + NOTES ROW */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 260px",
              gap: "var(--space-2)",
              marginTop: "var(--space-3)",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                background: "var(--color-white)",
                borderRadius: UI.radius,
                border: UI.border,
                padding: 10,
                fontSize: "var(--font-size-sm)",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "var(--space-1)", color: UI.ink }}>General Notes</div>
              <div style={{ color: "var(--legacy-color-4b5563)", minHeight: 24 }}>{timesheet.notes || "-"}</div>
            </div>

            <div
              style={{
                background: "linear-gradient(135deg, var(--legacy-color-17324f) 0%, var(--legacy-color-234a71) 100%)",
                color: "var(--legacy-color-f9fafb)",
                borderRadius: UI.radius,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "flex-end",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, opacity: 0.8, marginBottom: "var(--space-1)" }}>
                Weekly total
              </div>
              <div>{formatHoursLabel(weeklyTotal)}</div>
            </div>
          </div>
        </div>

        {isAdmin ? (
        <div
          id="pay-advice-print-root"
          style={{
            ...surfaceStyle,
            marginTop: "var(--space-3)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 12px 10px",
              background: "var(--legacy-color-f8fbfd)",
              borderBottom: UI.border,
            }}
          >
            <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, color: UI.brand, letterSpacing: 0.4 }}>
              Weekly Pay Advice
            </div>
            <div style={{ marginTop: "var(--space-1)", fontSize: 18, fontWeight: 800, color: UI.ink }}>
              {timesheet.employeeName || timesheet.employeeCode} - W/E {formatShortDate(getWeekEndingDate(timesheet.weekStart))}
            </div>
            <div style={{ marginTop: "var(--space-1)", fontSize: "var(--font-size-xs)", color: UI.muted }}>
              Auto-filled from the current timesheet. Finance can use this as the first-pass pay advice view.
            </div>
            {!needsPayAdvicePin ? (
            <div style={{ marginTop: 10, display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSavePayAdvice}
                disabled={payAdviceSaving || isApproved}
                style={controlButton("primary", payAdviceSaving || isApproved)}
              >
                <Save size={14} />
                {payAdviceSaving ? "Saving..." : "Save Pay Advice"}
              </button>
              {payAdviceMessage ? (
                <div style={{ fontSize: "var(--font-size-xs)", color: payAdviceMessage.includes("Failed") ? "var(--legacy-color-b91c1c)" : "var(--color-success)" }}>
                  {payAdviceMessage}
                </div>
              ) : null}
            </div>
            ) : null}
          </div>

          {needsPayAdvicePin ? (
          <form
            onSubmit={handlePayAdvicePinSubmit}
            style={{
              padding: 14,
              display: "grid",
              gap: 10,
              maxWidth: 360,
            }}
          >
            <div style={{ fontSize: "var(--font-size-sm)", color: UI.muted }}>
              Enter the PIN to view weekly pay advice.
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
              <input
                type="password"
                inputMode="numeric"
                value={payAdvicePin}
                onChange={(e) => {
                  setPayAdvicePin(e.target.value);
                  setPayAdvicePinError("");
                }}
                placeholder="PIN"
                style={{
                  ...formControlStyle,
                  maxWidth: 140,
                  textAlign: "center",
                  fontWeight: 800,
                  letterSpacing: 1,
                }}
              />
              <button type="submit" style={controlButton("primary", false)}>
                Unlock
              </button>
            </div>
            {payAdvicePinError ? (
              <div style={{ fontSize: "var(--font-size-xs)", color: UI.red, fontWeight: 700 }}>
                {payAdvicePinError}
              </div>
            ) : null}
          </form>
          ) : (
          <div style={{ overflowX: "auto", padding: "var(--space-3)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: "var(--legacy-color-e5e7eb)" }}>
                  <th
                    colSpan={3}
                    style={{
                      border: "1px solid var(--legacy-color-94a3b8)",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    {timesheet.employeeName || timesheet.employeeCode}
                  </th>
                  <th
                    colSpan={2}
                    style={{
                      border: "1px solid var(--legacy-color-94a3b8)",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    Workshop
                  </th>
                  <th
                    colSpan={2}
                    style={{
                      border: "1px solid var(--legacy-color-94a3b8)",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    Travel
                  </th>
                  <th
                    colSpan={2}
                    style={{
                      border: "1px solid var(--legacy-color-94a3b8)",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    On Set
                  </th>
                  <th
                    colSpan={3}
                    style={{
                      border: "1px solid var(--legacy-color-94a3b8)",
                      padding: "6px 5px",
                      color: UI.ink,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    Extra Supplements
                  </th>
                </tr>
                <tr style={{ background: "var(--legacy-color-f3f4f6)" }}>
                  {[
                    "Date",
                    "Job Name",
                    "Week Day",
                    "W/shop Hrs",
                    "O/Time Hrs",
                    "Travel Hrs",
                    "Sunday Hrs",
                    "On Set Hrs",
                    "On Set O/T",
                    "Sa/Su Units",
                    "O/N Units",
                    "Travel Meal",
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        border: "1px solid var(--legacy-color-cbd5e1)",
                        padding: "7px 6px",
                        color: UI.ink,
                        fontWeight: 800,
                        textAlign: "center",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payAdvice.rows.map((row) => (
                  <tr key={row.day}>
                    <td style={payAdviceCell}>
                      <input
                        value={row.dateLabel}
                        onChange={(e) => handlePayAdviceFieldChange(row.day, "dateLabel", e.target.value)}
                        style={payAdviceInput}
                        disabled={isApproved}
                      />
                    </td>
                    <td style={{ ...payAdviceCell, textAlign: "left" }}>
                      <input
                        value={row.jobName}
                        onChange={(e) => handlePayAdviceFieldChange(row.day, "jobName", e.target.value)}
                        style={{ ...payAdviceInput, textAlign: "left" }}
                        disabled={isApproved}
                      />
                    </td>
                    <td style={payAdviceCell}>{row.day}</td>
                    {[
                      "workshopHrs",
                      "overtimeHrs",
                      "travelHrs",
                      "sundayHrs",
                      "onSetHrs",
                      "onSetOvertimeHrs",
                      "weekendSupplementUnits",
                      "overnightUnits",
                      "travelMealUnits",
                    ].map((field) => (
                      <td key={`${row.day}-${field}`} style={{ ...payAdviceCell, fontWeight: field === "dailyTotalHrs" ? 800 : 400 }}>
                        <input
                          type="number"
                          step={
                            field === "travelMealUnits"
                              ? "1"
                              : field === "overnightUnits"
                                ? "0.1"
                                : "0.25"
                          }
                          value={Number(row[field] || 0)}
                          onChange={(e) => handlePayAdviceFieldChange(row.day, field, e.target.value)}
                          style={payAdviceInput}
                          disabled={isApproved}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ background: "var(--color-surface-subtle)" }}>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }} colSpan={3}>
                    Totals
                  </td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.workshopHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.overtimeHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.travelHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.sundayHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.onSetHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.onSetOvertimeHrs.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.weekendSupplementUnits.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.overnightUnits.toFixed(2)}</td>
                  <td style={{ ...payAdviceCell, fontWeight: 800 }}>{payAdvice.totals.travelMealUnits.toFixed(2)}</td>
                </tr>
                {isAdmin ? (
                  <tr style={{ background: "var(--color-info-soft)" }}>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }} colSpan={3}>
                      Rates
                    </td>
                    {[
                      "workshopRate",
                      "overtimeRate",
                      "travelRate",
                      "sundayRate",
                      "onSetRate",
                      "onSetOvertimeRate",
                      "weekendSupplementRate",
                      "overnightRate",
                      "travelMealRate",
                    ].map((field) => (
                      <td key={field} style={{ ...payAdviceCell, fontWeight: 800 }}>
                        <input
                          type="number"
                          step={
                            field === "travelMealRate"
                              ? "1"
                              : field === "overnightRate"
                                ? "0.1"
                                : "0.01"
                          }
                          value={Number(payAdvice.rates[field] || 0)}
                          onChange={(e) => handlePayAdviceRateChange(field, e.target.value)}
                          style={payAdviceInput}
                          disabled={isApproved}
                        />
                      </td>
                    ))}
                  </tr>
                ) : null}
                {isAdmin ? (
                  <tr style={{ background: "var(--legacy-color-dbeafe)" }}>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }} colSpan={3}>
                      Total Monetary
                    </td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.workshopAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.overtimeAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.travelAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.sundayAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.onSetAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.onSetOvertimeAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.weekendSupplementAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.overnightAmount)}</td>
                    <td style={{ ...payAdviceCell, fontWeight: 800 }}>{toMoney(payAdvice.totals.travelMealAmount)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {isAdmin ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  paddingTop: "var(--space-3)",
                }}
              >
                <div
                  style={{
                    minWidth: 180,
                    display: "grid",
                    gap: 3,
                    padding: "10px 12px",
                    borderRadius: UI.radius,
                    border: "1px solid var(--legacy-color-93c5fd)",
                    background: "var(--color-info-soft)",
                    boxShadow: UI.shadowSm,
                    textAlign: "right",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      color: "var(--color-info)",
                      textTransform: "uppercase",
                    }}
                  >
                    Grand Total
                  </span>
                  <span
                    style={{
                      fontSize: 18,
                      lineHeight: 1.1,
                      fontWeight: 900,
                      color: UI.ink,
                    }}
                  >
                    {toMoney(payAdvice.totals.totalMonetary)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          )}
        </div>
        ) : null}

        {/* MANAGER QUERIES */}
        <div
          style={{
            ...surfaceStyle,
            marginTop: "var(--space-3)",
            padding: "var(--space-3)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, marginBottom: "var(--space-2)", color: UI.ink }}>
            Manager queries
          </h2>

          {isAdmin && isApproved && (
            <div
              style={{
                marginBottom: 10,
                padding: "7px 10px",
                borderRadius: UI.radiusSm,
                backgroundColor: "var(--color-info-soft)",
                border: "1px solid var(--color-info-border)",
                color: "var(--legacy-color-1e3a8a)",
                fontSize: "var(--font-size-xs)",
              }}
            >
              This timesheet is approved. Queries are now read-only - you can review existing queries
              but cannot send new ones.
            </div>
          )}

          {isAdmin ? (
            <form
              onSubmit={handleSubmitQuery}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-2)",
                alignItems: "flex-start",
                marginBottom: 10,
                opacity: isApproved ? 0.6 : 1,
              }}
            >
              <div style={{ minWidth: 140 }}>
                <label style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
                  Day
                </label>
                <select
                  value={queryDay}
                  onChange={(e) => setQueryDay(e.target.value)}
                  disabled={isApproved}
                  style={{
                    ...formControlStyle,
                    backgroundColor: isApproved ? "var(--legacy-color-f3f4f6)" : "var(--color-white)",
                    cursor: isApproved ? "not-allowed" : "pointer",
                  }}
                >
                  <option value="">Select day...</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ minWidth: 160 }}>
                <label style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
                  What are you querying?
                </label>
                <select
                  value={queryField}
                  onChange={(e) => setQueryField(e.target.value)}
                  disabled={isApproved}
                  style={{
                    ...formControlStyle,
                    backgroundColor: isApproved ? "var(--legacy-color-f3f4f6)" : "var(--color-white)",
                    cursor: isApproved ? "not-allowed" : "pointer",
                  }}
                >
                  <option value="overall">Overall hours</option>
                  <option value="yard">Yard times</option>
                  <option value="travel">Travel times</option>
                  <option value="onset">On-set times</option>
                  <option value="notes">Notes / comments</option>
                  <option value="holiday">Holiday / day off</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
                  Query note for employee
                </label>
                <textarea
                  value={queryNote}
                  onChange={(e) => setQueryNote(e.target.value)}
                  rows={2}
                  placeholder={
                    isApproved
                      ? "Queries are closed on approved timesheets."
                      : "e.g. Hours seem high on Thursday - can you double-check call and wrap times?"
                  }
                  disabled={isApproved}
                  style={{
                    ...formControlStyle,
                    resize: "vertical",
                    backgroundColor: isApproved ? "var(--legacy-color-f3f4f6)" : "var(--color-white)",
                    cursor: isApproved ? "not-allowed" : "text",
                  }}
                />
              </div>

              <div style={{ alignSelf: "flex-end" }}>
                <button
                  type="submit"
                  disabled={querySubmitting || isApproved}
                  style={controlButton("primary", querySubmitting || isApproved)}
                >
                  <Send size={14} />
                  {isApproved ? "Queries closed" : querySubmitting ? "Sending..." : "Send query"}
                </button>
              </div>
            </form>
          ) : null}

          {queryError && (
            <div
              style={{
                marginBottom: "var(--space-2)",
                padding: "7px 10px",
                borderRadius: UI.radiusSm,
                backgroundColor: UI.redSoft,
                border: `1px solid ${UI.redBorder}`,
                color: UI.red,
                fontSize: "var(--font-size-xs)",
              }}
            >
              {queryError}
            </div>
          )}
          {querySuccess && (
            <div
              style={{
                marginBottom: "var(--space-2)",
                padding: "7px 10px",
                borderRadius: UI.radiusSm,
                backgroundColor: UI.greenSoft,
                border: `1px solid ${UI.greenBorder}`,
                color: UI.green,
                fontSize: "var(--font-size-xs)",
              }}
            >
              {querySuccess}
            </div>
          )}

          {queries.length > 0 && (
            <div style={{ marginTop: "var(--space-2)", borderTop: UI.border, paddingTop: "var(--space-2)" }}>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, marginBottom: 6, color: UI.ink }}>
                Existing queries on this timesheet
              </div>
              <ul
                style={{
                  listStyle: "none",
                  paddingLeft: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-1)",
                }}
              >
                {queries.map((q) => (
                  <li
                    key={q.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: UI.radius,
                      backgroundColor: "var(--color-white)",
                      border: UI.border,
                      fontSize: "var(--font-size-sm)",
                    }}
                  >
                    <div style={{ marginBottom: 2 }}>
                      <strong>{q.day}</strong>{" "}
                      <span style={{ color: "var(--legacy-color-6b7280)" }}>({q.field || "overall"})</span>
                      {q.status && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: UI.radiusSm,
                            backgroundColor:
                              String(q.status).toLowerCase() === "closed" ? "var(--legacy-color-dcfce7)" : "var(--legacy-color-eef2ff)",
                            color:
                              String(q.status).toLowerCase() === "closed" ? "var(--color-success)" : "var(--legacy-color-3730a3)",
                          }}
                        >
                          {String(q.status).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "var(--legacy-color-4b5563)", marginBottom: 6 }}>{q.message || q.note}</div>

                    <QueryMessageThread query={q} canReply={isAdmin} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ------------------------------------------------------------- */
/* INLINE QUERY MESSAGE THREAD                                   */
/* ------------------------------------------------------------- */

function QueryMessageThread({ query, canReply = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const isClosed = String(query?.status || "").toLowerCase() === "closed";

  useEffect(() => {
    if (!query?.id) return;

    const msgRef = fsQuery(collection(db, "timesheetQueries", query.id, "messages"));

    const unsub = onSnapshot(msgRef, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMessages(rows);
    });

    return () => unsub();
  }, [query?.id]);

  const handleSend = async () => {
    if (!canReply || !input.trim() || !query?.id || isClosed) return;
    setSending(true);
    try {
      await addDoc(collection(db, "timesheetQueries", query.id, "messages"), {
        text: input.trim(),
        from: "manager",
        createdAt: serverTimestamp(),
      });
      setInput("");
    } catch (err) {
      console.error("Error sending query message:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        marginTop: "var(--space-2)",
        padding: 10,
        borderRadius: UI.radius,
        border: UI.border,
        background: "var(--color-white)",
      }}
    >
      <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, marginBottom: 6, color: UI.muted }}>
        Messages {(isClosed || !canReply) && "(read-only)"}
      </div>

      <div
        style={{
          maxHeight: 200,
          overflowY: "auto",
          background: "var(--color-white)",
          borderRadius: UI.radius,
          border: UI.border,
          padding: "var(--space-2)",
          marginBottom: "var(--space-2)",
          fontSize: "var(--font-size-xs)",
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "var(--legacy-color-9ca3af)", textAlign: "center" }}>No messages yet.</div>
        )}

        {messages.map((m) => {
          const isManager = m.from === "manager";
          return (
            <div key={m.id} style={{ marginBottom: 6, textAlign: isManager ? "right" : "left" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "5px 9px",
                  borderRadius: UI.radiusSm,
                  backgroundColor: isManager ? UI.brand : "var(--legacy-color-e5e7eb)",
                  color: isManager ? "var(--legacy-color-f9fafb)" : "var(--legacy-color-111827)",
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      {(isClosed || !canReply) && (
        <div style={{ fontSize: 11, color: "var(--legacy-color-6b7280)", marginBottom: 6 }}>
          {isClosed ? "This query is closed. No further messages can be sent." : "Replies are admin-only."}
        </div>
      )}

      {canReply ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isClosed ? "Query closed - replies disabled." : "Reply to this query..."}
            disabled={isClosed}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: UI.radiusSm,
              border: UI.border,
              fontSize: "var(--font-size-xs)",
              backgroundColor: isClosed ? "var(--legacy-color-f3f4f6)" : "var(--color-white)",
              cursor: isClosed ? "not-allowed" : "text",
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !input.trim() || isClosed}
            style={controlButton("primary", sending || !input.trim() || isClosed)}
          >
            <Send size={14} />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
