"use client";

import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  FileUp,
  RotateCcw,
  UserPlus,
  Users,
} from "lucide-react";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* Mini design system */
const UI = UI_TOKENS;

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const cardBase = {
  ...surface,
  padding: 12,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: UI.brandBorder };

const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: "-0.01em" };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };

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

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "pill") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "6px 9px",
      borderRadius: 999,
      border: `1px solid ${UI.brandBorder}`,
      background: "var(--color-surface)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, var(--color-brand-hover) 0%, var(--color-brand) 100%)",
    color: "var(--color-white)",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const inputBase = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  outline: "none",
  fontSize: 13.5,
  background: "var(--color-surface)",
};
const smallLabel = { fontSize: 12, color: UI.muted, fontWeight: 800 };

const divider = { height: 1, background: "var(--color-border)", margin: "10px 0" };

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 10,
};

const dashboardGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(330px, 0.65fr)",
  gap: UI.gap,
  alignItems: "stretch",
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

const miniStat = {
  ...surface,
  padding: 11,
  boxShadow: "none",
  minHeight: 92,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const progressTrack = {
  width: "100%",
  height: 7,
  borderRadius: 999,
  background: "var(--color-brand-soft)",
  overflow: "hidden",
};

const panelList = {
  display: "grid",
  gap: 8,
};

const skeleton = {
  height: 12,
  borderRadius: 6,
  background: "linear-gradient(90deg, rgba(0,0,0,0.05), rgba(0,0,0,0.08), rgba(0,0,0,0.05))",
  backgroundSize: "200% 100%",
  animation: "shimmer 1400ms infinite",
};
const keyframes = `
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;

/* Date helpers */
function parseYyyyMmDd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [Y, M, D] = String(s).split("-").map((n) => +n);
  return new Date(Date.UTC(Y, M - 1, D));
}

function isDateInRange(yyyyMmDd, from, to) {
  const safe = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+safe)) return false;

  const d = new Date(Date.UTC(safe.getUTCFullYear(), safe.getUTCMonth(), safe.getUTCDate()));
  const F = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const T = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  return d >= F && d <= T;
}

function startOfTodayUTC() {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

function dayOfWeekUTC(yyyyMmDd) {
  const d = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+d)) return null;
  return d.getUTCDay();
}

// check if a given YYYY-MM-DD is a Sunday (UTC)
function isSunday(yyyyMmDd) {
  return dayOfWeekUTC(yyyyMmDd) === 0;
}

function isSaturday(yyyyMmDd) {
  return dayOfWeekUTC(yyyyMmDd) === 6;
}

function formatYyyyMmDd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(+d)) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function eachDateYMD(startRaw, endRaw) {
  const start = parseYyyyMmDd(startRaw) ?? new Date(startRaw);
  const end = parseYyyyMmDd(endRaw) ?? parseYyyyMmDd(startRaw) ?? new Date(startRaw);
  if (Number.isNaN(+start) || Number.isNaN(+end)) return [];

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const finalDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const out = [];

  while (cursor <= finalDay) {
    out.push(formatYyyyMmDd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

/* Normalisers */
function normaliseName(n) {
  return String(n || "").trim().replace(/\s+/g, " ").toLowerCase();
}
function initialsOf(n) {
  const parts = String(n || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 3).map((p) => (p[0] || "").toUpperCase()).join("") || "-";
}
function titleCase(n) {
  return String(n || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function dedupeEmployees(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const key = e.id || normaliseName(e.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function employeeListForBookingDate(booking, dayKey, fallbackEmployees) {
  const dated = booking?.employeesByDate?.[dayKey];
  if (Array.isArray(dated) && dated.length) return dedupeEmployees(dated);
  return fallbackEmployees;
}

function isFourDigitJobNumber(value) {
  return /^\d{4}$/.test(String(value || "").trim());
}

function isCreditBookingStatus(status) {
  return ["confirmed", "complete", "completed", "stunt"].includes(String(status || "").trim().toLowerCase());
}

function isFullTimeEmployeeRecord(employee = {}) {
  const role = String(employee.role || "").trim().toLowerCase();
  const status = String(employee.status || employee.employmentStatus || "").trim().toLowerCase();
  const employmentType = String(employee.employmentType || employee.contractType || employee.employeeType || "")
    .trim()
    .toLowerCase();
  const jobTitleBlob = Array.isArray(employee.jobTitle)
    ? employee.jobTitle.join(" ").toLowerCase()
    : String(employee.jobTitle || "").toLowerCase();

  if (
    employee.deleted === true ||
    employee.isDeleted === true ||
    employee.archived === true ||
    employee.isArchived === true ||
    employee.active === false ||
    employee.appDisabled === true
  ) return false;
  if (status === "inactive" || status === "archived") return false;
  const appAccess = employee.appAccess && typeof employee.appAccess === "object" ? employee.appAccess : {};
  const serviceOnly = employee.isService === true && appAccess.user !== true;
  if (serviceOnly) return false;
  if (role === "service") return false;
  if (role === "freelancer" || role === "freelance") return false;
  if (employmentType.includes("part")) return false;
  if (employmentType.includes("freelance")) return false;
  if (employmentType.includes("contract")) return false;
  if (jobTitleBlob.includes("freelance")) return false;
  if (jobTitleBlob.includes("freelancer")) return false;
  if (employmentType.includes("full")) return true;
  return true;
}

async function fetchBankHolidayKeysInRange(since, until) {
  try {
    const res = await fetch("https://www.gov.uk/bank-holidays.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Bank holiday fetch failed: ${res.status}`);
    const data = await res.json();
    const events = Array.isArray(data?.["england-and-wales"]?.events)
      ? data["england-and-wales"].events
      : [];
    const keys = new Set();
    events.forEach((event) => {
      const dayKey = String(event?.date || "").slice(0, 10);
      if (!dayKey) return;
      if (isDateInRange(dayKey, since, until)) keys.add(dayKey);
    });
    return keys;
  } catch (error) {
    console.warn("[employee-home] bank holiday fetch failed:", error);
    return new Set();
  }
}

/* Exact day-note to credit mapping */
function creditForNote(rawNote) {
  if (!rawNote) return 1;

  const norm = String(rawNote).trim().toLowerCase().replace(/\s+/g, " ");

  if (norm.includes("night shoot")) return 1;
  if (norm.includes("split day")) return 1;
  if (norm.includes("turnaround")) return 1;
  if (norm === "1/2 day travel" || norm === "1/2 day travel day") return 0.5;
  if (norm === "travel time") return 0.25;
  if (norm === "rest day") return 0;
  if (norm === "other") return 0;

  return 1;
}

const BREAKDOWN_COLUMNS = [
  { key: "onSet", label: "On Set" },
  { key: "travel", label: "Travel" },
  { key: "halfTravel", label: "1/2 Travel" },
  { key: "yardBase", label: "Yard Based" },
  { key: "weekendWorked", label: "Weekend Worked" },
  { key: "yard", label: "Yard / Rig" },
  { key: "standby", label: "Standby" },
  { key: "turnaround", label: "Turnaround" },
  { key: "rest", label: "Rest" },
  { key: "nightShoot", label: "Night Shoot" },
  { key: "rehearsal", label: "Rehearsal" },
  { key: "recce", label: "Recce" },
  { key: "splitDay", label: "Split Day" },
  { key: "other", label: "Other" },
];

const FULL_TIME_PIE_META = [
  { key: "onSet", label: "On Set", weight: 1, color: "var(--color-brand)" },
  { key: "travel", label: "Travel", weight: 1, color: "var(--color-brand)" },
  { key: "halfTravel", label: "Half Travel", weight: 0.5, color: "var(--color-success-accent)" },
  { key: "standby", label: "Standby", weight: 1, color: "var(--color-accent)" },
  { key: "nightShoot", label: "Night Shoot", weight: 1, color: "var(--color-info)" },
  { key: "recce", label: "Recce", weight: 1, color: "var(--color-accent)" },
  { key: "splitDay", label: "Split Day", weight: 1, color: "var(--color-danger)" },
];

const EMPLOYEE_SERIES_COLORS = [
  "var(--color-brand)",
  "var(--color-brand)",
  "var(--color-info)",
  "var(--color-accent)",
  "var(--color-accent)",
  "var(--color-danger)",
  "var(--color-info)",
  "var(--color-accent)",
  "var(--color-info)",
  "var(--color-warning)",
  "var(--color-brand)",
  "var(--color-success)",
];

function classifyNote(rawNote) {
  const norm = String(rawNote || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return { key: "onSet", priority: 50 };
  if (norm === "on set" || norm === "shoot day") return { key: "onSet", priority: 50 };
  if (norm === "travel day" || norm === "travel time") return { key: "travel", priority: 40 };
  if (norm === "1/2 day travel" || norm === "1/2 day travel day" || norm === "half day travel") {
    return { key: "halfTravel", priority: 35 };
  }
  if (norm === "rig day") return { key: "yard", priority: 34 };
  if (norm === "standby day") return { key: "standby", priority: 33 };
  if (norm.includes("turnaround")) return { key: "turnaround", priority: 32 };
  if (norm === "rest day") return { key: "rest", priority: 10 };
  if (norm.includes("night shoot")) return { key: "nightShoot", priority: 45 };
  if (norm.includes("split day") || norm.includes("spilt day")) return { key: "splitDay", priority: 30 };
  if (norm === "rehearsal day") return { key: "rehearsal", priority: 28 };
  if (norm === "recce day") return { key: "recce", priority: 27 };
  return { key: "other", priority: 20 };
}

/* Pull note for a given YYYY-MM-DD from known shapes */
function getNoteForDate(booking, dayKey) {
  let v =
    (booking && booking.notesByDate && booking.notesByDate[dayKey]) ??
    (booking && booking.dayNotes && booking.dayNotes[dayKey]) ??
    (booking && booking.dailyNotes && booking.dailyNotes[dayKey]) ??
    (booking && booking.notesForEachDay && booking.notesForEachDay[dayKey]);

  if (v && typeof v === "object") {
    v = v.note ?? v.text ?? v.value ?? v.label ?? v.name ?? "";
  }
  if (v) return v;

  if (
    Array.isArray(booking && booking.bookingDates) &&
    Array.isArray(booking && booking.bookingNotes) &&
    booking.bookingNotes.length === booking.bookingDates.length
  ) {
    const idx = booking.bookingDates.findIndex((d) => d === dayKey);
    if (idx >= 0) return booking.bookingNotes[idx];
  }
  return null;
}

/* Page */
export default function EmployeesHomePage() {
  const router = useRouter();
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);

  // timeframe state
  const [mode, setMode] = useState("lastNDays"); // "lastNDays" | "customRange"
  const [rangeDays, setRangeDays] = useState(30);
  const [fromDate, setFromDate] = useState(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState(""); // YYYY-MM-DD

  // chart state
  const [usageData, setUsageData] = useState([]);
  const [usageBreakdownData, setUsageBreakdownData] = useState([]);
  const [loading, setLoading] = useState(true);

  // compute effective range (past only, excluding today)
  const effectiveRange = useMemo(() => {
    const today0 = startOfTodayUTC();
    const end = new Date(today0);
    end.setUTCDate(end.getUTCDate() - 1); // yesterday

    if (mode === "lastNDays") {
      const start = new Date(end);
      start.setUTCDate(end.getUTCDate() - (Math.max(1, rangeDays) - 1));
      return { since: start, until: end, label: `Last ${rangeDays} past days` };
    }

    // custom range: clamp to past-only and ensure since <= until
    const f = parseYyyyMmDd(fromDate) ?? end;
    const t = parseYyyyMmDd(toDate) ?? end;

    const until = new Date(Math.min(+t, +end));
    const since = new Date(Math.min(+f, +until));

    const pretty = (d) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

    return { since, until, label: `${pretty(since)} to ${pretty(until)}` };
  }, [mode, rangeDays, fromDate, toDate]);

  useEffect(() => {
    if (!authState?.user) return undefined;
    let isMounted = true;

    (async () => {
      setLoading(true);
      try {
        const [bookingsSnap, holidaysSnap, employeesSnap, bankHolidayKeys] = await Promise.all([
          getDocs(tenantCollectionQuery(db, "bookings", authState)),
          getDocs(tenantCollectionQuery(db, "holidays", authState)),
          getDocs(tenantCollectionQuery(db, "employees", authState)),
          fetchBankHolidayKeysInRange(effectiveRange.since, effectiveRange.until),
        ]);

        // empKey -> Map<YYYY-MM-DD, credit>
        const credits = new Map();
        const breakdown = new Map();
        const bookedDaysByEmployee = new Map();
        const holidayDaysByEmployee = new Map();
        const employeeMeta = new Map();
        const since = effectiveRange.since;
        const until = effectiveRange.until;

        const rememberDay = (store, empKey, dayKey) => {
          if (!empKey || !dayKey) return;
          if (!store.has(empKey)) store.set(empKey, new Set());
          store.get(empKey).add(dayKey);
        };

        const registerEmployee = (employee = {}) => {
          const rawName = employee.name || employee.fullName || [employee.firstName, employee.lastName].filter(Boolean).join(" ");
          const key = String(employee.id || normaliseName(rawName) || "").trim();
          if (!key || !rawName || !isFullTimeEmployeeRecord(employee)) return "";
          if (!employeeMeta.has(key)) {
            employeeMeta.set(key, {
              key,
              displayName: titleCase(rawName),
              isFullTime: true,
            });
          }
          return key;
        };

        employeesSnap.forEach((docSnap) => {
          const employee = { id: docSnap.id, ...(docSnap.data() || {}) };
          registerEmployee(employee);
        });

        bookingsSnap.forEach((docSnap) => {
          const booking = docSnap.data() || {};
          const status = String(booking.status || "").trim();

          if (!isCreditBookingStatus(status)) return;
          if (!isFourDigitJobNumber(booking.jobNumber)) return;

          // employees array (strings or objects)
          const employeeListRaw = booking.employees || [];
          const employees = employeeListRaw
            .map((e) => {
              if (typeof e === "string") return { id: null, name: e, role: "Precision Driver" };
              return { id: e && e.id ? e.id : null, name: (e && (e.name || e.fullName)) || "", role: (e && e.role) || "" };
            })
            .filter((e) => (e.id || e.name)?.trim())
            .filter((e) => {
              const role = String(e.role || "").trim().toLowerCase();
              return role !== "freelancer" && role !== "freelance";
            });

          const uniqEmployees = dedupeEmployees(employees);
          if (uniqEmployees.length === 0) return;

          const noteKeys = Object.keys(booking.notesByDate || {});
          const dateSet = new Set(noteKeys.filter((d) => isDateInRange(d, since, until)));

          if (Array.isArray(booking.bookingDates)) {
            booking.bookingDates.forEach((d) => {
              if (isDateInRange(d, since, until)) dateSet.add(d);
            });
          }

          const dayKeys = Array.from(dateSet);
          if (dayKeys.length === 0) return;

          const nightShootEmployeeKeys = new Set();

          for (const dayKey of dayKeys) {
            const note = getNoteForDate(booking, dayKey);
            let credit = creditForNote(note);
            const normNote = String(note || "").trim().toLowerCase().replace(/\s+/g, " ");
            const isNightShootDay = normNote.includes("night shoot");

            // Weekend "On Set" weighting: Saturday +0.5, Sunday double time.
            if (note && (isSaturday(dayKey) || isSunday(dayKey))) {
              if (normNote === "on set") credit = isSunday(dayKey) ? credit * 2 : credit + 0.5;
            }

            const dayEmployees = employeeListForBookingDate(booking, dayKey, uniqEmployees)
              .filter((e) => (e.id || e.name)?.trim())
              .filter((e) => {
                const role = String(e.role || "").trim().toLowerCase();
                return role !== "freelancer" && role !== "freelance";
              });

            for (const emp of dayEmployees) {
              const empKey = registerEmployee(emp) || emp.id || normaliseName(emp.name);
              if (isNightShootDay) nightShootEmployeeKeys.add(empKey);
              if (!credits.has(empKey)) credits.set(empKey, new Map());
              const byDate = credits.get(empKey);

              // take MAX if multiple bookings for same emp & day
              const prev = byDate.get(dayKey) ?? 0;
              if (credit > prev) byDate.set(dayKey, credit);
              rememberDay(bookedDaysByEmployee, empKey, dayKey);

              if (!breakdown.has(empKey)) breakdown.set(empKey, new Map());
              const byDateCategory = breakdown.get(empKey);
              const prevCategory = byDateCategory.get(dayKey);
              const nextCategory = classifyNote(note);
              if (!prevCategory || nextCategory.priority > prevCategory.priority) {
                byDateCategory.set(dayKey, nextCategory);
              }
            }
          }

          // A night shoot run earns one additional turnaround credit per employee
          // for the booking, regardless of whether it spans one or multiple nights.
          nightShootEmployeeKeys.forEach((empKey) => {
            if (!credits.has(empKey)) credits.set(empKey, new Map());
            const byDate = credits.get(empKey);
            byDate.set(`night-turnaround:${docSnap.id}`, 1);
          });
        });

        holidaysSnap.forEach((docSnap) => {
          const holiday = docSnap.data() || {};
          const status = String(holiday.status || "").trim().toLowerCase();
          if (holiday.deleted === true || holiday.isDeleted === true || status === "deleted") return;

          const holidayEmployeeName = String(holiday.employee || "").trim();
          if (!holidayEmployeeName) return;

          let empKey = "";
          for (const [candidateKey, meta] of employeeMeta.entries()) {
            if (normaliseName(meta.displayName) === normaliseName(holidayEmployeeName)) {
              empKey = candidateKey;
              break;
            }
          }

          if (!empKey) {
            empKey = registerEmployee({ name: holidayEmployeeName });
          }
          if (!empKey) return;

          eachDateYMD(holiday.startDate, holiday.endDate).forEach((dayKey) => {
            if (!isDateInRange(dayKey, since, until)) return;
            rememberDay(holidayDaysByEmployee, empKey, dayKey);
          });
        });

        const rows = [];
        const breakdownRows = [];
        for (const [empKey, byDate] of credits.entries()) {
          let total = 0;
          for (const v of byDate.values()) total += v;
          const display = employeeMeta.get(empKey)?.displayName || (empKey.includes("@@") ? empKey.split("@@")[0] : empKey);
          rows.push({
            key: empKey,
            name: initialsOf(display),
            fullName: titleCase(display),
            days: Number(total.toFixed(2)),
          });
        }

        for (const [empKey, meta] of employeeMeta.entries()) {
          const byDate = credits.get(empKey) || new Map();
          let total = 0;
          for (const v of byDate.values()) total += v;

          const dayTypeCounts = Object.fromEntries(BREAKDOWN_COLUMNS.map((col) => [col.key, 0]));
          const byDateCategory = breakdown.get(empKey) || new Map();
          for (const category of byDateCategory.values()) {
            const key = category?.key;
            if (key && Object.prototype.hasOwnProperty.call(dayTypeCounts, key)) {
              dayTypeCounts[key] += 1;
            }
          }

          const bookedDays = bookedDaysByEmployee.get(empKey) || new Set();
          const holidayDays = holidayDaysByEmployee.get(empKey) || new Set();
          let yardBaseDays = 0;
          let weekendWorkedDays = 0;
          const cursor = new Date(since);
          while (cursor <= until) {
            const dayOfWeek = cursor.getUTCDay();
            const dayKey = formatYyyyMmDd(cursor);
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              if (bookedDays.has(dayKey)) {
                weekendWorkedDays += 1;
              }
            } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              if (!bookedDays.has(dayKey) && !holidayDays.has(dayKey) && !bankHolidayKeys.has(dayKey)) {
                yardBaseDays += 1;
              }
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }
          dayTypeCounts.yardBase = yardBaseDays;
          dayTypeCounts.weekendWorked = weekendWorkedDays;

          breakdownRows.push({
            key: empKey,
            name: meta.displayName,
            totalDays: Number(total.toFixed(2)),
            isFullTime: meta.isFullTime === true,
            holidayDays: holidayDays.size,
            ...dayTypeCounts,
          });
        }

        rows.sort((a, b) => b.days - a.days);
        breakdownRows.sort((a, b) => b.totalDays - a.totalDays || a.name.localeCompare(b.name));

        if (isMounted) {
          setUsageData(rows);
          setUsageBreakdownData(breakdownRows);
        }
      } catch (err) {
        console.error("Error fetching bookings:", err);
        if (isMounted) {
          setUsageData([]);
          setUsageBreakdownData([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [accessKey, authState, effectiveRange]);

  const employeeSections = useMemo(
    () => [
      { title: "Employee List", description: "Manage staff and freelancer records.", link: "/employees", icon: Users },
      { title: "Add Employee", description: "Register a new person.", link: "/add-employee", icon: UserPlus },
      { title: "Holiday Tracker", description: "Review leave usage.", link: "/holiday-usage", icon: CalendarClock },
      { title: "Quick Shift Change", description: "Request or approve adjusted working hours.", link: "/shift-change", icon: ClipboardList },
      { title: "Upload Documents", description: "Contracts and certificates.", link: "/upload-contract", icon: FileUp },
    ],
    []
  );

  const fullTimeWorkTypePieData = useMemo(() => {
    return FULL_TIME_PIE_META.map((item) => {
      const total = usageBreakdownData
        .filter((row) => row.isFullTime)
        .reduce((sum, row) => sum + (Number(row[item.key] || 0) * item.weight), 0);
      return {
        key: item.key,
        label: item.label,
        value: Number(total.toFixed(2)),
        color: item.color,
      };
    }).filter((item) => item.value > 0);
  }, [usageBreakdownData]);

  const fullTimePieTotal = useMemo(
    () => Number(fullTimeWorkTypePieData.reduce((sum, item) => sum + item.value, 0).toFixed(2)),
    [fullTimeWorkTypePieData]
  );

  const fullTimeEmployeeWeightedData = useMemo(() => {
    return usageBreakdownData
      .filter((row) => row.isFullTime)
      .map((row, index) => {
        const workTotal = FULL_TIME_PIE_META.reduce(
          (sum, item) => sum + (Number(row[item.key] || 0) * item.weight),
          0
        );
        const yardDays = Number(row.yardBase || 0);
        const combinedTotal = workTotal + yardDays;
        return {
          key: row.key,
          name: row.name,
          value: Number(workTotal.toFixed(2)),
          yardValue: Number(yardDays.toFixed(2)),
          totalValue: Number(combinedTotal.toFixed(2)),
          workPct: combinedTotal ? Number(((workTotal / combinedTotal) * 100).toFixed(1)) : 0,
          yardPct: combinedTotal ? Number(((yardDays / combinedTotal) * 100).toFixed(1)) : 0,
          color: EMPLOYEE_SERIES_COLORS[index % EMPLOYEE_SERIES_COLORS.length],
        };
      })
      .filter((row) => row.value > 0 || row.yardValue > 0)
      .sort((a, b) => b.totalValue - a.totalValue || a.name.localeCompare(b.name));
  }, [usageBreakdownData]);

  const todayISO = (() => {
    const t = startOfTodayUTC();
    t.setUTCDate(t.getUTCDate() - 1); // yesterday as max
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  })();

  const renderValueLabel = (props) => {
    const { x = 0, y = 0, width = 0, value = 0 } = props || {};
    const num = Number(value);
    const text = Math.abs(num - Math.round(num)) < 1e-9 ? `${num.toFixed(0)}` : `${num.toFixed(2)}`;
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill={UI.text} className={layoutStyles.extracted1}>
        {text}
      </text>
    );
  };

  const renderEmployeeSplitLabel = (props) => {
    const { x = 0, y = 0, width = 0, payload } = props || {};
    if (!payload) return null;
    const totalText =
      Math.abs(Number(payload.totalValue || 0) - Math.round(Number(payload.totalValue || 0))) < 1e-9
        ? Number(payload.totalValue || 0).toFixed(0)
        : Number(payload.totalValue || 0).toFixed(2);
    const label = `${payload.workPct}% work / ${payload.yardPct}% yard (${totalText})`;
    return (
      <text
        x={x + width + 8}
        y={y + 12}
        textAnchor="start"
        fill={UI.text}
        className={layoutStyles.extracted2}
      >
        {label}
      </text>
    );
  };

  const kpiTotal = useMemo(() => usageData.reduce((s, r) => s + (Number(r.days) || 0), 0), [usageData]);
  const kpiPeople = usageData.length;
  const kpiEmployeeRecords = usageBreakdownData.length;
  const kpiFullTime = useMemo(
    () => usageBreakdownData.filter((row) => row.isFullTime).length,
    [usageBreakdownData]
  );
  const kpiYardDays = useMemo(
    () => usageBreakdownData.reduce((sum, row) => sum + (Number(row.yardBase) || 0), 0),
    [usageBreakdownData]
  );
  const kpiWeekendDays = useMemo(
    () => usageBreakdownData.reduce((sum, row) => sum + (Number(row.weekendWorked) || 0), 0),
    [usageBreakdownData]
  );
  const kpiHolidayDays = useMemo(
    () => usageBreakdownData.reduce((sum, row) => sum + (Number(row.holidayDays) || 0), 0),
    [usageBreakdownData]
  );
  const topCreditRows = useMemo(() => usageData.slice(0, 6), [usageData]);
  const topWorkloadRows = useMemo(() => fullTimeEmployeeWeightedData.slice(0, 6), [fullTimeEmployeeWeightedData]);
  const topCreditMax = topCreditRows[0]?.days || 0;
  const topWorkloadMax = topWorkloadRows[0]?.totalValue || 0;
  const fmtMetric = (value) => {
    const num = Number(value || 0);
    return Math.abs(num - Math.round(num)) < 1e-6 ? num.toFixed(0) : num.toFixed(2);
  };

  return (
    <HeaderSidebarLayout>
      <style>{keyframes}</style>

      {/* subtle focus ring */}
      <style>{`
        input:focus, button:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(29,78,216,0.15); border-color: var(--color-info-border) !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div className={layoutStyles.extracted3}>
          <div>
            <h1 style={h1}>Employees</h1>
            <div style={sub}>Crew availability, work credits, leave and document admin for the selected reporting period.</div>
          </div>

          <div className={layoutStyles.extracted4}>
            <div style={chip}>{loading ? "Loading..." : `${kpiEmployeeRecords} records`}</div>
            <div style={chipSoft}>
              Period: <b className={layoutStyles.extracted5}>{effectiveRange.label}</b>
            </div>
            <div style={chipSoft}>
              Leave days: <b className={layoutStyles.extracted6}>{kpiHolidayDays}</b>
            </div>
          </div>
        </div>

        <section style={{ ...cardBase, marginBottom: UI.gap }}>
          <div className={layoutStyles.extracted7}>
            <div>
              <h2 style={titleMd}>Workforce Snapshot</h2>
              <div style={hint}>Confirmed, completed and stunt bookings only. Freelancers are excluded from credit totals.</div>
            </div>
            <button
              type="button"
              style={btn("ghost")}
              onClick={() => {
                setMode("lastNDays");
                setRangeDays(30);
                setFromDate("");
                setToDate("");
              }}
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
          <div className={layoutStyles.extracted8}>
            <MetricCard label="Total Credits" value={fmtMetric(kpiTotal)} tone={UI.brand} icon={BarChart3} />
            <MetricCard label="People Used" value={kpiPeople} tone={UI.green} icon={Users} />
            <MetricCard label="Full Time" value={kpiFullTime} tone={UI.blue} icon={BriefcaseBusiness} />
            <MetricCard label="Yard Based" value={kpiYardDays} tone={UI.teal} icon={ClipboardList} />
            <MetricCard label="Weekend Days" value={kpiWeekendDays} tone={UI.amber} icon={CalendarClock} />
          </div>
        </section>

        {/* Quick links */}
        <div style={grid(4)}>
          {employeeSections.map((section, idx) => (
            <div
              key={idx}
              style={cardBase}
              onClick={() => router.push(section.link)}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardBase)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? router.push(section.link) : null)}
            >
              <div
                className={layoutStyles.extracted9}
              >
                <span style={iconBox(UI.brand, UI.brandSoft)}>{React.createElement(section.icon, { size: 17 })}</span>
                <div className={layoutStyles.extracted10}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: UI.text, minWidth: 0 }}>{section.title}</div>
                  <div style={{ marginTop: 5, color: UI.muted, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {section.description}
                  </div>
                </div>
                <span style={{ color: UI.brand, fontSize: 18, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>&gt;</span>
              </div>
            </div>
          ))}
        </div>

        {/* Chart panel */}
        <section style={{ ...cardBase, marginTop: UI.gap }}>
          <div className={layoutStyles.extracted11}>
            <div>
              <h2 style={titleMd}>Employee Credits Overview</h2>
              <div style={hint}>
                Maximum one credit per employee per date across confirmed, complete and stunt bookings, with the highest value retained. Freelancers are excluded.
              </div>
            </div>

            <div className={layoutStyles.extracted12}>
              <span style={chipSoft}>{effectiveRange.label}</span>
              <button type="button" style={btn("ghost")} onClick={() => { setMode("lastNDays"); setRangeDays(30); setFromDate(""); setToDate(""); }}>
                Reset
              </button>
            </div>
          </div>

          {/* Controls */}
          <div style={{ ...surface, boxShadow: "none", borderRadius: 12, border: UI.border, padding: 10, background: "var(--color-surface)" }}>
            <div className={layoutStyles.extracted13}>
              <div className={layoutStyles.extracted14}>
                <button type="button" style={btn("pill")} onClick={() => setMode("lastNDays")}>
                  Last N days
                </button>
                <button type="button" style={btn("pill")} onClick={() => setMode("customRange")}>
                  Custom range
                </button>
              </div>

              {mode === "lastNDays" ? (
                <div className={layoutStyles.extracted15}>
                  <div className={layoutStyles.extracted16}>
                    <span style={smallLabel}>Days</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={rangeDays}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRangeDays(Math.max(1, Math.min(365, Number.isFinite(v) ? v : 30)));
                      }}
                      className={layoutStyles.extracted17}
                    />
                  </div>

                  {[30, 60, 90].map((n) => {
                    const active = rangeDays === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        style={{
                          ...btn("pill"),
                          borderColor: active ? "var(--color-info-border)" : "var(--color-border)",
                          background: active ? UI.brandSoft : "var(--color-surface)",
                          color: active ? UI.brand : UI.text,
                        }}
                        onClick={() => setRangeDays(n)}
                      >
                        {n}d
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={layoutStyles.extracted18}>
                  <div className={layoutStyles.extracted19}>
                    <span style={smallLabel}>From</span>
                    <input
                      type="date"
                      max={todayISO}
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className={layoutStyles.extracted20}
                    />
                  </div>
                  <div className={layoutStyles.extracted21}>
                    <span style={smallLabel}>To</span>
                    <input
                      type="date"
                      max={todayISO}
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className={layoutStyles.extracted22}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className={layoutStyles.extracted23} />

            <div style={{ color: UI.muted, fontSize: 12, lineHeight: 1.5 }}>
              <b>Credit rules:</b> Half Day Travel = 0.5 - Travel Time = 0.25 - Most day types = 1 - Rest Day / Other = 0 -
              <b> Night Shoot = +1 turnaround per booking - On Set Saturdays = +0.5 - On Set Sundays = x2</b>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className={layoutStyles.extracted24}>
              <div className={layoutStyles.extracted25} />
              <div className={layoutStyles.extracted26} />
              <div className={layoutStyles.extracted27} />
              <div className={layoutStyles.extracted28} />
            </div>
          ) : usageData.length === 0 ? (
            <EmptyState />
          ) : (
            <div className={layoutStyles.extracted29}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageData} margin={{ top: 14, right: 20, left: 0, bottom: 14 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: UI.muted, fontSize: 12 }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={{ stroke: "var(--color-border)" }}
                  />
                  <YAxis
                    allowDecimals
                    tick={{ fill: UI.muted, fontSize: 12 }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={{ stroke: "var(--color-border)" }}
                    domain={[0, "dataMax+1"]}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.12)" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--color-border)",
                      boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                      fontSize: 12,
                      color: UI.text,
                    }}
                    formatter={(value, _name, p) => {
                      const full = (p && p.payload && (p.payload.fullName || p.payload.name)) || "";
                      const num = Number(value);
                      const v = Math.abs(num - Math.round(num)) < 1e-6 ? num.toFixed(0) : num.toFixed(2);
                      return [`${v} credits`, full];
                    }}
                  />
                  <Bar dataKey="days" fill={UI.brand} radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="days" position="top" content={renderValueLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className={layoutStyles.extracted30}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: UI.brand, border: "1px solid var(--color-border)" }} />
                <div style={{ color: UI.muted, fontSize: 12 }}>
                  Bars show total employee credits, including fractional travel credits, night shoot turnaround credit, Saturday On Set extra half credit and Sunday On Set double time. Hover to view full names.
                </div>
              </div>
            </div>
          )}
        </section>

        <div style={{ ...dashboardGrid, marginTop: UI.gap }}>
          <section style={cardBase}>
            <div className={layoutStyles.extracted31}>
              <div>
                <h2 style={titleMd}>Top Credits</h2>
                <div style={hint}>Highest-use people in this period. Select a row to open the employee drill-through.</div>
              </div>
              <span style={chipSoft}>{topCreditRows.length} shown</span>
            </div>

            {loading ? (
              <div className={layoutStyles.extracted32}>
                <div className={layoutStyles.extracted33} />
                <div className={layoutStyles.extracted34} />
                <div className={layoutStyles.extracted35} />
              </div>
            ) : topCreditRows.length === 0 ? (
              <div style={{ color: UI.muted, fontSize: 13 }}>No credits in range.</div>
            ) : (
              <div className={layoutStyles.extracted36}>
                {topCreditRows.map((row, index) => (
                  <ProgressRow
                    key={row.key}
                    label={row.fullName}
                    value={`${fmtMetric(row.days)} credits`}
                    percent={topCreditMax ? (row.days / topCreditMax) * 100 : 0}
                    color={index === 0 ? UI.brand : UI.blue}
                    onClick={() => {
                      const params = new URLSearchParams({
                        name: row.fullName,
                        mode,
                        rangeDays: String(rangeDays),
                        fromDate,
                        toDate,
                      });
                      router.push(`/employee-home/${encodeURIComponent(row.key)}?${params.toString()}`);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section style={cardBase}>
            <div className={layoutStyles.extracted37}>
              <div>
                <h2 style={titleMd}>Workload Split</h2>
                <div style={hint}>Full-time work notes compared with yard based days.</div>
              </div>
              <span style={chipSoft}>{fullTimeEmployeeWeightedData.length} full-time</span>
            </div>

            {loading ? (
              <div className={layoutStyles.extracted38}>
                <div className={layoutStyles.extracted39} />
                <div className={layoutStyles.extracted40} />
                <div className={layoutStyles.extracted41} />
              </div>
            ) : topWorkloadRows.length === 0 ? (
              <div style={{ color: UI.muted, fontSize: 13 }}>No full-time workload data in range.</div>
            ) : (
              <div className={layoutStyles.extracted42}>
                {topWorkloadRows.map((row) => (
                  <ProgressRow
                    key={row.key}
                    label={row.name}
                    value={`${row.workPct}% work / ${row.yardPct}% yard`}
                    percent={topWorkloadMax ? (row.totalValue / topWorkloadMax) * 100 : 0}
                    color={row.color}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...surface, padding: 14, marginTop: 14 }}>
          <div className={layoutStyles.extracted43}>
            <div>
              <h2 style={titleMd}>Work Type Breakdown</h2>
              <div style={hint}>
                Per-employee day counts by booking note type across the selected reporting window. Yard Based counts
                Monday to Friday days with no booking, no holiday, and no bank holiday. Weekend Worked counts
                Saturday/Sunday booked job days.
              </div>
            </div>
            <div style={chipSoft}>{usageBreakdownData.length} employees</div>
          </div>

          {loading ? (
            <div className={layoutStyles.extracted44}>
              <div className={layoutStyles.extracted45} />
              <div className={layoutStyles.extracted46} />
              <div className={layoutStyles.extracted47} />
            </div>
          ) : usageBreakdownData.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>No employee work breakdown found in this reporting period.</div>
          ) : (
            <div className={layoutStyles.extracted48}>
              <table className={layoutStyles.extracted49}>
                <thead>
                  <tr>
                    <th style={tableHeadLeft}>Employee</th>
                    {BREAKDOWN_COLUMNS.map((column) => (
                      <th key={column.key} style={tableHead}>{column.label}</th>
                    ))}
                    <th style={tableHead}>Total Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {usageBreakdownData.map((row) => (
                    <tr
                      key={row.key}
                      onClick={() => {
                        const params = new URLSearchParams({
                          name: row.name,
                          mode,
                          rangeDays: String(rangeDays),
                          fromDate,
                          toDate,
                        });
                        router.push(`/employee-home/${encodeURIComponent(row.key)}?${params.toString()}`);
                      }}
                      className={layoutStyles.extracted50}
                    >
                      <td style={tableCellLeftInteractive}>{row.name}</td>
                      {BREAKDOWN_COLUMNS.map((column) => (
                        <td key={`${row.key}-${column.key}`} style={tableCell}>
                          {row[column.key] || 0}
                        </td>
                      ))}
                      <td style={{ ...tableCell, fontWeight: 900 }}>{row.totalDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ ...surface, padding: 14, marginTop: 14 }}>
          <div className={layoutStyles.extracted51}>
            <div>
              <h2 style={titleMd}>Full-Time Work Type Pie</h2>
              <div style={hint}>
                Full-time employees only. Weighted totals: On Set 1, Travel 1, Half Travel 0.5, Standby 1,
                Night Shoot 1, Recce 1, Split Day 1.
              </div>
            </div>
            <div style={chipSoft}>Total: {fullTimePieTotal}</div>
          </div>

          {loading ? (
            <div className={layoutStyles.extracted52}>
              <div className={layoutStyles.extracted53} />
              <div className={layoutStyles.extracted54} />
              <div className={layoutStyles.extracted55} />
            </div>
          ) : fullTimeWorkTypePieData.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>
              No full-time employee work-type totals found in this reporting period.
            </div>
          ) : (
            <div
              className={layoutStyles.extracted56}
            >
              <div className={layoutStyles.extracted57}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={fullTimeWorkTypePieData}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={112}
                      innerRadius={58}
                      paddingAngle={2}
                    >
                      {fullTimeWorkTypePieData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, payload) => {
                        const num = Number(value || 0);
                        const safe = Math.abs(num - Math.round(num)) < 1e-6 ? num.toFixed(0) : num.toFixed(2);
                        return [`${safe}`, payload?.payload?.label || ""];
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className={layoutStyles.extracted58}>
                {fullTimeWorkTypePieData.map((item) => (
                  <div
                    key={item.key}
                    className={layoutStyles.extracted59}
                  >
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: item.color,
                      }}
                    />
                    <div style={{ fontWeight: 800, color: UI.text }}>{item.label}</div>
                    <div style={{ fontWeight: 900, color: UI.brand }}>
                      {Math.abs(item.value - Math.round(item.value)) < 1e-6 ? item.value.toFixed(0) : item.value.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section style={{ ...surface, padding: 14, marginTop: 14 }}>
          <div className={layoutStyles.extracted60}>
            <div>
              <h2 style={titleMd}>Weighted Work Notes By Employee</h2>
              <div style={hint}>
                Per full-time employee total for On Set, Travel, Half Travel, Standby, Night Shoot, Recce and
                Split Day using the same weighting as the pie chart, stacked with yard days on the same bar.
              </div>
            </div>
            <div style={chipSoft}>{fullTimeEmployeeWeightedData.length} employees</div>
          </div>

          {loading ? (
            <div className={layoutStyles.extracted61}>
              <div className={layoutStyles.extracted62} />
              <div className={layoutStyles.extracted63} />
              <div className={layoutStyles.extracted64} />
            </div>
          ) : fullTimeEmployeeWeightedData.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>
              No per-employee weighted work-note totals found in this reporting period.
            </div>
          ) : (
            <div style={{ width: "100%", height: Math.max(320, fullTimeEmployeeWeightedData.length * 42), marginTop: 8 }}>
              <ResponsiveContainer>
                <BarChart
                  data={fullTimeEmployeeWeightedData}
                  layout="vertical"
                  margin={{ top: 8, right: 170, left: 18, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    type="number"
                    tick={{ fill: UI.muted, fontSize: 12 }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={{ stroke: "var(--color-border)" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fill: UI.text, fontSize: 12, fontWeight: 700 }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={{ stroke: "var(--color-border)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.12)" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--color-border)",
                      boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                      fontSize: 12,
                      color: UI.text,
                    }}
                    formatter={(value, name, payload) => {
                      const num = Number(value || 0);
                      const safe = Math.abs(num - Math.round(num)) < 1e-6 ? num.toFixed(0) : num.toFixed(2);
                      if (name === "yardValue") return [`${safe}`, "Yard days"];
                      return [`${safe}`, "Weighted work notes"];
                    }}
                    labelFormatter={(_label, rows) => {
                      const row = rows?.[0]?.payload;
                      if (!row) return "";
                      return `${row.name}: ${row.workPct}% work / ${row.yardPct}% yard`;
                    }}
                  />
                  <Bar dataKey="value" stackId="employee" radius={[0, 0, 0, 0]}>
                    {fullTimeEmployeeWeightedData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                  <Bar dataKey="yardValue" stackId="employee" fill="var(--color-border-strong)" radius={[0, 8, 8, 0]}>
                    <LabelList dataKey="totalValue" position="right" content={renderEmployeeSplitLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}

/* Empty state */
function EmptyState() {
  return (
    <div style={{ ...surface, boxShadow: "none", padding: 13, marginTop: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 6, color: UI.text }}>No data in this reporting period</div>
      <div style={{ color: UI.muted, fontSize: 13, lineHeight: 1.5 }}>
        Only <b>Confirmed</b>, <b>Complete</b> and <b>Stunt</b> bookings from <b>past dates</b> are included in the selected range, with today excluded.
        Try a longer range, or confirm your bookings include <code>notesByDate[&quot;YYYY-MM-DD&quot;]</code> and/or <code>bookingDates</code>.
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone, icon: Icon }) {
  return (
    <div style={miniStat}>
      <div className={layoutStyles.extracted65}>
        <div style={{ color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
        <span style={iconBox(tone, "var(--color-surface-subtle)")}>
          <Icon size={17} />
        </span>
      </div>
      <div style={{ color: UI.text, fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function ProgressRow({ label, value, percent, color, onClick }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const content = (
    <>
      <div className={layoutStyles.extracted66}>
        <div style={{ minWidth: 0, color: UI.text, fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </div>
        <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{value}</div>
      </div>
      <div className={layoutStyles.extracted67}>
        <div style={{ width: `${safePercent}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "grid",
          gap: 7,
          padding: 9,
          borderRadius: UI.radiusSm,
          border: UI.border,
          background: "var(--color-surface)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 7, padding: 9, borderRadius: UI.radiusSm, border: UI.border, background: "var(--color-surface)" }}>
      {content}
    </div>
  );
}

const tableHead = {
  padding: "10px 12px",
  background: "var(--color-surface-subtle)",
  borderTop: UI.border,
  borderBottom: UI.border,
  borderRight: UI.border,
  fontSize: 12,
  fontWeight: 900,
  color: UI.text,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tableHeadLeft = {
  ...tableHead,
  borderLeft: UI.border,
  textAlign: "left",
  position: "sticky",
  left: 0,
  zIndex: 2,
};

const tableCell = {
  padding: "9px 12px",
  borderBottom: UI.border,
  borderRight: UI.border,
  fontSize: 13,
  color: UI.text,
  textAlign: "center",
  background: "var(--color-surface)",
  whiteSpace: "nowrap",
};

const tableCellLeft = {
  ...tableCell,
  borderLeft: UI.border,
  textAlign: "left",
  fontWeight: 800,
  position: "sticky",
  left: 0,
  zIndex: 1,
};

const tableCellLeftInteractive = {
  ...tableCellLeft,
  color: UI.brand,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};
