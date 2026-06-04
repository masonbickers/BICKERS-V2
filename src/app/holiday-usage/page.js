// src/app/holiday-usage/page.js
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { doc, getDocs, onSnapshot } from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enGB from "date-fns/locale/en-GB";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  CalendarDays,
  CalendarPlus,
  FileClock,
  RotateCcw,
  Search,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";

//  overlay forms
import HolidayForm from "@/app/components/holidayform";
import EditHolidayForm from "@/app/components/EditHolidayForm";

/* Admin allow-list */
const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
];

/* Mini design system */
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
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  blue: "#2563eb",
  teal: "#0f766e",
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
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "danger") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: "1px solid #fecaca",
      background: "#fee2e2",
      color: "#7f1d1d",
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
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const cardBase = {
  ...surface,
  padding: 12,
  background: "#ffffff",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
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

const inputBase = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  fontSize: 13,
  outline: "none",
  background: "#fff",
  color: UI.text,
};

const mainGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(340px, 0.85fr)",
  gap: UI.gap,
  alignItems: "start",
};

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

/* Localiser */
const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

/* Utils */
const norm = (v) => String(v ?? "").trim().toLowerCase();
const truthy = (v) =>
  v === true || v === 1 || ["true", "1", "yes", "y"].includes(norm(v));
const AMPM = (v) => (norm(v) === "am" ? "AM" : norm(v) === "pm" ? "PM" : null);

function stringToColour(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 70%, 70%)`;
}

/** Parse "YYYY-MM-DD" safely at local midnight (no TZ shift). */
function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [, Y, M, D] = m.map(Number);
  return new Date(Y, M - 1, D, 0, 0, 0, 0);
}

/** Convert Firestore value to Date (prefers strict YMD parsing). */
function toSafeDate(v) {
  if (!v) return null;
  if (typeof v === "string") {
    const strict = parseYMD(v);
    if (strict) return strict;
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
  }
  if (v?.toDate) return v.toDate();
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
  }
  return null;
}

const sameYMD = (a, b) =>
  a &&
  b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const eachDateInclusive = (start, end) => {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const out = [];
  for (let d = s; d <= e; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
};

const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

/** Detect single-day half-day using new + legacy fields */
function getSingleDayHalfMeta(rec, start, end) {
  const single = sameYMD(start, end);
  if (!single) return { single: false, half: false, when: null };

  // New schema
  if (truthy(rec.startHalfDay) && AMPM(rec.startAMPM))
    return { single: true, half: true, when: AMPM(rec.startAMPM) };
  if (truthy(rec.endHalfDay) && AMPM(rec.endAMPM))
    return { single: true, half: true, when: AMPM(rec.endAMPM) };

  // Legacy schema
  if (truthy(rec.halfDay)) {
    const when = AMPM(rec.halfDayPeriod || rec.halfDayType);
    if (when) return { single: true, half: true, when };
  }
  return { single: true, half: false, when: null };
}

/*  Count chargeable days (weekdays only, excludes bank holidays, supports multi-day half days) */
function countChargeableDays(rec, start, end, isBankHoliday) {
  const days = eachDateInclusive(start, end);

  const startIsHalf = truthy(rec.startHalfDay);
  const endIsHalf = truthy(rec.endHalfDay);

  const single = sameYMD(start, end);

  let total = 0;

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (isWeekend(d)) continue;
    if (isBankHoliday?.(d)) continue;

    let inc = 1;

    // Single-day half: count 0.5 if marked
    if (single) {
      if (startIsHalf || endIsHalf || truthy(rec.halfDay)) inc = 0.5;
    } else {
      // Multi-day half-days: start and/or end can be 0.5
      if (i === 0 && startIsHalf) inc = 0.5;
      if (i === days.length - 1 && endIsHalf) inc = 0.5;
    }

    total += inc;
  }

  return Number(total.toFixed(2));
}

function countChargeableDaysInRange(
  rec,
  start,
  end,
  rangeStart,
  rangeEnd,
  isBankHoliday
) {
  const clipStart = start > rangeStart ? start : rangeStart;
  const clipEnd = end < rangeEnd ? end : rangeEnd;
  if (!clipStart || !clipEnd || clipStart > clipEnd) return 0;

  const days = eachDateInclusive(clipStart, clipEnd);
  const startIsHalf = truthy(rec.startHalfDay);
  const endIsHalf = truthy(rec.endHalfDay);
  const single = sameYMD(start, end);

  let total = 0;

  for (const d of days) {
    if (isWeekend(d)) continue;
    if (isBankHoliday?.(d)) continue;

    let inc = 1;

    if (single) {
      if (startIsHalf || endIsHalf || truthy(rec.halfDay)) inc = 0.5;
    } else {
      if (sameYMD(d, start) && startIsHalf) inc = 0.5;
      if (sameYMD(d, end) && endIsHalf) inc = 0.5;
    }

    total += inc;
  }

  return Number(total.toFixed(2));
}

/*  Status helper:
   - approved: status contains "approved" OR legacy approved=true
   - declined: status contains "declined"
   - requested: status contains "requested" OR missing/blank
*/
function getStatus(rec) {
  const raw = [
    rec.status,
    rec.approvalStatus,
    rec.state,
    rec.leaveStatus,
    rec.holidayStatus,
  ]
    .map((x) => norm(x))
    .find(Boolean);

  if (raw?.includes("declined")) return "declined";
  if (raw?.includes("approved")) return "approved";
  if (raw?.includes("requested")) return "requested";

  // legacy flag
  if (truthy(rec?.approved)) return "approved";

  // default to requested if nothing set (matches HR page)
  if (!raw) return "requested";

  return raw;
}

function Pill({ children, tone = "default" }) {
  const tones = {
    default: { bg: "#f8fbfd", fg: UI.text, br: "#d7dee8" },
    good: { bg: "#dcfce7", fg: "#14532d", br: "#bbf7d0" },
    warn: { bg: "#fee2e2", fg: "#7f1d1d", br: "#fecaca" },
    info: { bg: "#e0f2fe", fg: "#0c4a6e", br: "#bae6fd" },
    gray: { bg: "#f1f5f9", fg: "#374151", br: "#d1d5db" },
    pending: { bg: "#fef3c7", fg: "#92400e", br: "#fde68a" },
  };
  const t = tones[tone] || tones.default;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.br}`,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function StatTile({ label, value, tone = "default", icon: Icon }) {
  const tones = {
    default: { bg: "#ffffff", br: "#d7dee8", fg: UI.brand },
    soft: { bg: UI.brandSoft, br: UI.brandBorder, fg: UI.brand },
    warn: { bg: "#fff7ed", br: "#fed7aa", fg: "#9a3412" },
    good: { bg: "#ecfdf5", br: "#bbf7d0", fg: "#065f46" },
    danger: { bg: "#fef2f2", br: "#fecaca", fg: "#991b1b" },
  };
  const t = tones[tone] || tones.default;
  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.br}`,
        borderRadius: UI.radiusSm,
        padding: 11,
        minHeight: 92,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase" }}>
          {label}
        </div>
        {Icon ? (
          <span style={iconBox(t.fg, "#fff", t.br)}>
            <Icon size={17} />
          </span>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 24,
          fontWeight: 900,
          color: UI.text,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 14,
          height: 14,
          background: color,
          borderRadius: 4,
          border: UI.border,
        }}
      />
      <span style={{ fontSize: 13, color: UI.text }}>{label}</span>
    </div>
  );
}

/* Drawer */
function MiniQueue({ title, rows, empty, renderRow, onRowClick }) {
  return (
    <div style={{ display: "grid", gap: 7 }}>
      <div style={{ color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase" }}>
        {title}
      </div>
      {rows.length ? (
        rows.map((row, index) => (
          <button
            key={`${title}-${index}`}
            type="button"
            onClick={() => onRowClick?.(row)}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 10,
              padding: "8px 9px",
              borderRadius: UI.radiusSm,
              border: UI.border,
              background: "#fff",
              color: UI.text,
              textAlign: "left",
              cursor: onRowClick ? "pointer" : "default",
              fontWeight: 850,
              fontSize: 12.5,
            }}
          >
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {renderRow(row)}
            </span>
            <span style={{ color: UI.brand, fontSize: 16, fontWeight: 800, lineHeight: 1 }}>&gt;</span>
          </button>
        ))
      ) : (
        <div style={{ color: UI.muted, fontSize: 12.5, padding: "4px 0 2px" }}>{empty}</div>
      )}
    </div>
  );
}

function Drawer({ open, title, subtitle, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={drawerOverlay} onMouseDown={onClose}>
      <div style={drawerPanel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={drawerHeader}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 850,
                fontSize: 16,
                color: UI.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </div>
            {subtitle ? (
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 2 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          <button style={btn("ghost")} onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div style={drawerBody}>{children}</div>
      </div>
    </div>
  );
}

const drawerOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.35)",
  zIndex: 60,
  display: "flex",
  justifyContent: "flex-end",
};

const drawerPanel = {
  width: "min(720px, 94vw)",
  height: "100%",
  background: "#fff",
  borderLeft: UI.border,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  display: "flex",
  flexDirection: "column",
};

const drawerHeader = {
  padding: 12,
  borderBottom: UI.border,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const drawerBody = { padding: 12, overflow: "auto" };

/* Page */
export default function HolidayUsagePage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const DEFAULT_ALLOWANCE = 11;

  //  admin (edit/delete only)
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  useEffect(() => {
    let roleUnsub = null;
    const unsub = auth?.onAuthStateChanged?.((u) => {
      setUserEmail(u?.email || "");
      roleUnsub?.();
      roleUnsub = null;

      if (!u?.uid) {
        setUserRole("");
        return;
      }

      roleUnsub = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => setUserRole(String(snap.data()?.role || "").trim().toLowerCase()),
        () => setUserRole("")
      );
    });
    return () => {
      roleUnsub?.();
      unsub?.();
    };
  }, []);
  const isAdmin = useMemo(
    () => ADMIN_EMAILS.map((e) => norm(e)).includes(norm(userEmail)) || userRole === "admin",
    [userEmail, userRole]
  );

  //  modal overlays
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [editHolidayId, setEditHolidayId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  //  Year is *selectable* and drives allowances + holiday filtering
  const [yearView, setYearView] = useState(() => new Date().getFullYear());

  //  Controlled calendar date so Next/Back always works
  const [calDate, setCalDate] = useState(() => new Date());

  const defaultDateForYear = useMemo(() => {
    const y = Number(yearView);
    const today = new Date();
    return today.getFullYear() === y ? today : new Date(y, 0, 1);
  }, [yearView]);

  useEffect(() => {
    setCalDate(defaultDateForYear);
  }, [defaultDateForYear]);

  const [paidDaysByName, setPaidDaysByName] = useState({});
  const [unpaidDaysByName, setUnpaidDaysByName] = useState({});
  const [preAprilPaidDaysByName, setPreAprilPaidDaysByName] = useState({});
  const [calendarEvents, setCalendarEvents] = useState([]);

  //  bank holidays (separate so "leave entries" count stays the same)
  const [bankHolidayEvents, setBankHolidayEvents] = useState([]);

  const [byEmployee, setByEmployee] = useState({});
  const [empAllowance, setEmpAllowance] = useState({});
  const [empCarryOver, setEmpCarryOver] = useState({});

  const [q, setQ] = useState("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [sortKey, setSortKey] = useState("name");
  const [selectedName, setSelectedName] = useState(null);

  useEffect(() => {
    const savedScroll = sessionStorage.getItem("dashboardScroll");
    if (savedScroll) {
      window.scrollTo(0, parseInt(savedScroll, 10));
      sessionStorage.removeItem("dashboardScroll");
    }
  }, []);

  //  Load UK bank holidays for the selected year (Gov.uk JSON)
  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      try {
        const REGION = "england-and-wales";

        const res = await fetch("https://www.gov.uk/bank-holidays.json", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Bank holidays fetch failed: ${res.status}`);

        const json = await res.json();
        const list = json?.[REGION]?.events || [];

        const events = list
          .map((ev, idx) => {
            const d = parseYMD(ev?.date);
            if (!d) return null;
            if (d.getFullYear() !== Number(yearView)) return null;

            return {
              id: `bank-${REGION}-${ev.date}-${idx}`,
              title: ev.title || "Bank Holiday",
              start: d,
              end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
              allDay: true,
              bankHoliday: true,
              region: REGION,
            };
          })
          .filter(Boolean);

        setBankHolidayEvents(events);
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.warn("Bank holidays unavailable:", e);
        setBankHolidayEvents([]);
      }
    };

    run();
    return () => controller.abort();
  }, [yearView]);

  /*  Build a lookup so allowance calculations can exclude bank holidays */
  const bankHolidaySet = useMemo(() => {
    return new Set(
      (bankHolidayEvents || [])
        .map((e) => e?.start)
        .filter(Boolean)
        .map((d) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        })
    );
  }, [bankHolidayEvents]);

  const isBankHoliday = useCallback(
    (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return bankHolidaySet.has(`${y}-${m}-${day}`);
    },
    [bankHolidaySet]
  );

  //  Load data whenever yearView changes (and after save)
  useEffect(() => {
    const run = async () => {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "holidays", operation: "load holiday usage data" });
        setEmpAllowance({});
        setEmpCarryOver({});
        setPaidDaysByName({});
        setUnpaidDaysByName({});
        setByEmployee({});
        setCalendarEvents([]);
        return;
      }

      const yearKey = String(yearView);

      // Employees (allowances + carry for the selected year)
      const allowMap = {};
      const carryMap = {};
      try {
        const empSnap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        empSnap.docs.forEach((d) => {
          const x = d.data() || {};
          const name =
            x.name || x.fullName || x.employee || x.employeeName || x.displayName;
          if (!name) return;

          allowMap[name] =
            x.holidayAllowances?.[yearKey] ??
            Number(x.holidayAllowance ?? DEFAULT_ALLOWANCE);

          carryMap[name] =
            x.carryOverByYear?.[yearKey] ?? Number(x.carriedOverDays ?? 0);
        });
      } catch {}

      // Holidays for the selected year (Paid/Unpaid only; Accrued/TOIL ignored)
      const paid = {};
      const unpaid = {};
      const preAprilPaid = {};
      const details = {};
      const events = [];
      const colourByEmp = {};
      const preAprilEnd = new Date(yearView, 2, 31);

      const holSnap = await getDocs(tenantCollectionQuery(db, "holidays", dataAccessState));
      holSnap.docs.forEach((docSnap) => {
        const rec = docSnap.data() || {};
        const employee = rec.employee;
        const start = toSafeDate(rec.startDate);
        const end = toSafeDate(rec.endDate) || start;

        const notes = rec.notes || rec.holidayReason || "";

        if (!employee || !start || !end) return;

        //  only show holidays inside the viewed year (no cross-year)
        if (start.getFullYear() !== end.getFullYear()) return;
        if (start.getFullYear() !== yearView) return;

        const status = getStatus(rec);

        //  IMPORTANT: if declined, remove it entirely (no pending, no calendar, no totals)
        if (status === "declined") return;

        const approved = status === "approved";
        const pending = status === "requested"; // only requested/missing are pending now

        const isAccrued =
          rec.isAccrued === true ||
          ["type", "leaveType", "category", "status", "kind", "notes", "holidayReason"]
            .map((k) => norm(rec[k]))
            .some((t) => t.includes("accrued") || t.includes("toil"));
        if (isAccrued) return;

        const isUnpaidLeave =
          rec.isUnpaid === true ||
          rec.unpaid === true ||
          rec.paid === false ||
          norm(rec.paidStatus) === "unpaid" ||
          ["type", "leaveType", "category", "status", "kind"].some((k) =>
            norm(rec[k]).includes("unpaid")
          );

        const { single, half, when } = getSingleDayHalfMeta(rec, start, end);

        //  exclude bank holidays from used days + support multi-day half days
        const days = countChargeableDays(rec, start, end, isBankHoliday);
        const preAprilDays = countChargeableDaysInRange(
          rec,
          start,
          end,
          new Date(yearView, 0, 1),
          preAprilEnd,
          isBankHoliday
        );

        //  IMPORTANT: pending holidays do NOT consume allowance totals
        if (!pending) {
          if (isUnpaidLeave) unpaid[employee] = (unpaid[employee] || 0) + days;
          else {
            paid[employee] = (paid[employee] || 0) + days;
            if (preAprilDays > 0) {
              preAprilPaid[employee] =
                (preAprilPaid[employee] || 0) + preAprilDays;
            }
          }
        }

        if (!details[employee]) details[employee] = [];
        details[employee].push({
          id: docSnap.id,
          start,
          end,
          days,
          notes,
          unpaid: isUnpaidLeave,
          pending,
          approved,
          halfDay: single && half,
          halfWhen: single && half ? when : null,
        });

        const color = (colourByEmp[employee] ||= stringToColour(employee));
        events.push({
          id: docSnap.id,
          title:
            `${employee} Holiday` +
            (isUnpaidLeave ? " (Unpaid)" : "") +
            (pending ? " (Pending)" : "") +
            (single && half ? ` (Half ${when || ""})` : ""),
          start,
          // react-big-calendar allDay end is effectively exclusive
          end: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
          allDay: true,
          employee,
          unpaid: isUnpaidLeave,
          pending,
          approved,
          color,
        });
      });

      setPaidDaysByName(paid);
      setUnpaidDaysByName(unpaid);
      setPreAprilPaidDaysByName(preAprilPaid);
      setByEmployee(
        Object.fromEntries(
          Object.entries(details).map(([k, v]) => [
            k,
            v.sort((a, b) => a.start - b.start),
          ])
        )
      );
      setCalendarEvents(events);
      setEmpAllowance(allowMap);
      setEmpCarryOver(carryMap);

      if (selectedName && !(details[selectedName] || allowMap[selectedName])) {
        setSelectedName(null);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, dataAccessState, yearView, reloadKey, isBankHoliday]);

  const eventStyleGetter = useCallback((event) => {
    //  Bank holiday style
    if (event?.bankHoliday) {
      return {
        style: {
          backgroundColor: "#eef2f7",
          borderRadius: "8px",
          border: UI.border,
          color: "#111827",
          padding: "4px 6px",
          fontWeight: 900,
        },
      };
    }

    //  Pending style (requested only)
    if (event?.pending) {
      return {
        style: {
          backgroundColor: "#fef3c7",
          borderRadius: "8px",
          border: "1px dashed rgba(146,64,14,0.45)",
          color: "#92400e",
          padding: "4px 6px",
          fontWeight: 900,
        },
      };
    }

    let bg = event.color || "#cbd5e1";
    let textColor = "#0f172a";
    if (event.unpaid) {
      bg = "#fee2e2";
      textColor = "#7f1d1d";
    }
    return {
      style: {
        backgroundColor: bg,
        borderRadius: "8px",
        border: "1px solid rgba(15,23,42,0.12)",
        color: textColor,
        padding: "4px 6px",
        fontWeight: 800,
      },
    };
  }, []);

  const allNames = useMemo(() => {
    return Array.from(
      new Set([
        ...Object.keys(byEmployee),
        ...Object.keys(empAllowance),
        ...Object.keys(empCarryOver),
        ...Object.keys(paidDaysByName),
        ...Object.keys(unpaidDaysByName),
      ])
    )
      .filter((name) => (empAllowance[name] ?? 0) > 0)
      .sort();
  }, [byEmployee, empAllowance, empCarryOver, paidDaysByName, unpaidDaysByName]);

  const metrics = useCallback(
    (name) => {
      const paid = paidDaysByName[name] || 0;
      const unpaid = unpaidDaysByName[name] || 0;
      const preAprilPaid = preAprilPaidDaysByName[name] || 0;
      const allowance = Number(empAllowance[name] ?? DEFAULT_ALLOWANCE);
      const carried = Number(empCarryOver[name] ?? 0);
      const totalAllowance = allowance + carried;
      const allowBal = totalAllowance - paid;
      const carryUsedByApril = Math.min(carried, preAprilPaid);
      const carryRemainingByApril = Math.max(
        0,
        Number((carried - carryUsedByApril).toFixed(2))
      );
      return {
        paid,
        unpaid,
        preAprilPaid,
        allowance,
        carried,
        totalAllowance,
        allowBal,
        carryUsedByApril,
        carryRemainingByApril,
      };
    },
    [paidDaysByName, unpaidDaysByName, preAprilPaidDaysByName, empAllowance, empCarryOver]
  );

  const carryDeadline = useMemo(() => new Date(yearView, 3, 1), [yearView]);

  const carryOverRows = useMemo(() => {
    return allNames
      .map((name) => ({ name, ...metrics(name) }))
      .filter((row) => row.carried > 0)
      .sort((a, b) => {
        if (b.carryRemainingByApril !== a.carryRemainingByApril) {
          return b.carryRemainingByApril - a.carryRemainingByApril;
        }
        return a.name.localeCompare(b.name);
      });
  }, [allNames, metrics]);

  const namesToShow = useMemo(() => {
    return allNames
      .filter((n) => n.toLowerCase().includes(q.toLowerCase()))
      .filter((n) => (onlyUnpaid ? (unpaidDaysByName[n] || 0) > 0 : true))
      .sort((a, b) => {
        const A = metrics(a);
        const B = metrics(b);
        switch (sortKey) {
          case "paid":
            return B.paid - A.paid;
          case "unpaid":
            return B.unpaid - A.unpaid;
          case "allowBalAsc":
            return A.allowBal - B.allowBal;
          case "allowBalDesc":
            return B.allowBal - A.allowBal;
          default:
            return a.localeCompare(b);
        }
      });
  }, [allNames, q, onlyUnpaid, sortKey, unpaidDaysByName, metrics]);

  const selected = selectedName ? metrics(selectedName) : null;
  const selectedRows = selectedName ? byEmployee[selectedName] || [] : [];

  const kpis = useMemo(() => {
    let totalPaid = 0;
    let totalUnpaid = 0;
    let totalBooked = 0;
    namesToShow.forEach((n) => {
      const m = metrics(n);
      totalPaid += m.paid;
      totalUnpaid += m.unpaid;
      totalBooked += (byEmployee[n] || []).length;
    });
    return {
      totalPaid,
      totalUnpaid,
      totalBooked,
      people: namesToShow.length,
    };
  }, [namesToShow, byEmployee, metrics]);

  const upcomingLeaveRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return calendarEvents
      .filter((event) => !event.bankHoliday && event.start >= today)
      .sort((a, b) => a.start - b.start)
      .slice(0, 6);
  }, [calendarEvents]);

  const fmtDays = (value) => {
    const num = Number(value || 0);
    return Math.abs(num - Math.round(num)) < 1e-6 ? num.toFixed(0) : num.toFixed(2);
  };

  //  calendar uses both leave + bank holidays
  const calendarEventsWithBankHolidays = useMemo(
    () => [...bankHolidayEvents, ...calendarEvents],
    [bankHolidayEvents, calendarEvents]
  );

  return (
    <HeaderSidebarLayout>
      <style>{`
        input:focus, button:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(29,78,216,0.15); border-color: #bfdbfe !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        @media (max-width: 1180px) {
          .holiday-main-grid { grid-template-columns: 1fr !important; }
        }
        .holiday-calendar .rbc-toolbar {
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .holiday-calendar .rbc-toolbar button {
          border: 1px solid ${UI.brandBorder};
          border-radius: 8px;
          color: ${UI.text};
          font-size: 12.5px;
          font-weight: 800;
          padding: 6px 9px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%);
          box-shadow: 0 4px 10px rgba(15,23,42,0.04);
        }
        .holiday-calendar .rbc-toolbar button.rbc-active {
          background: ${UI.brandSoft};
          color: ${UI.brand};
          box-shadow: none;
        }
        .holiday-calendar .rbc-toolbar-label {
          color: ${UI.text};
          font-size: 15px;
          font-weight: 850;
        }
        .holiday-calendar .rbc-month-view,
        .holiday-calendar .rbc-time-view {
          border: ${UI.border};
          border-radius: 8px;
          overflow: hidden;
        }
        .holiday-calendar .rbc-header {
          background: #f6f8fb;
          color: ${UI.muted};
          font-size: 11.5px;
          font-weight: 900;
          padding: 8px 6px;
          text-transform: uppercase;
        }
        .holiday-calendar .rbc-date-cell {
          font-size: 12px;
          font-weight: 800;
          color: ${UI.muted};
          padding: 5px 6px;
        }
        .holiday-calendar .rbc-event {
          font-size: 11.5px;
          line-height: 1.2;
        }
      `}</style>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Holiday Usage</h1>
            <div style={sub}>
              Leave calendar, allowance balances, carry-over risk and unpaid holiday tracking for {yearView}.
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
            <div style={chip}>{calendarEvents.length} leave entries</div>
            {userEmail ? <div style={chipSoft}>{isAdmin ? "Admin" : "Staff"}</div> : null}

            <select
              value={yearView}
              onChange={(e) => setYearView(Number(e.target.value))}
              style={{
                ...inputBase,
                width: 170,
                fontWeight: 900,
              }}
            >
              <option value={new Date().getFullYear()}>
                {new Date().getFullYear()} (current)
              </option>
              <option value={new Date().getFullYear() + 1}>
                {new Date().getFullYear() + 1} (next)
              </option>
              <option value={new Date().getFullYear() - 1}>
                {new Date().getFullYear() - 1} (prev)
              </option>
            </select>

            {/* opens overlay */}
            <button
              type="button"
              onClick={() => setHolidayModalOpen(true)}
              style={btn()}
            >
              <CalendarPlus size={14} /> Add Holiday
            </button>
          </div>
        </div>

        {/* Main split layout */}
        <div
          className="holiday-main-grid"
          style={mainGrid}
        >
          {/* LEFT: Calendar */}
          <div style={cardBase}>
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
                <h2 style={titleMd}>Leave Calendar</h2>
                <div style={hint}>
                  Paid leave is per-employee colour. Unpaid leave is red. Pending
                  is amber. Bank holidays are grey.
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <LegendSwatch color="#eef2f7" label="Bank holiday" />
                <LegendSwatch color="#fef3c7" label="Pending" />
                <LegendSwatch color="#fee2e2" label="Unpaid" />
                <LegendSwatch color="#cbd5e1" label="Paid (per employee)" />
              </div>
            </div>

            <div
              style={{
                height: "72vh",
                border: UI.border,
                borderRadius: UI.radius,
                overflow: "hidden",
                background: "#fff",
              }}
              className="holiday-calendar"
            >
              <Calendar
                localizer={localizer}
                events={calendarEventsWithBankHolidays}
                startAccessor="start"
                endAccessor="end"
                views={["month", "week"]}
                defaultView="month"
                style={{ height: "100%" }}
                eventPropGetter={eventStyleGetter}
                date={calDate}
                onNavigate={(nextDate) => {
                  setCalDate(nextDate);
                  const y = nextDate.getFullYear();
                  if (y !== yearView) setYearView(y);
                }}
                onSelectEvent={(e) => {
                  if (e?.bankHoliday) return;
                  if (e?.employee) setSelectedName(String(e.employee));
                }}
              />
            </div>

            <div
              style={{
                marginTop: UI.gap,
                border: UI.border,
                borderRadius: UI.radius,
                background: "#fff",
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 style={{ ...titleMd, fontSize: 15 }}>
                    Carry over to use by {format(carryDeadline, "d MMM")}
                  </h2>
                  <div style={hint}>
                    Based on approved paid leave booked before 1 April {yearView}.
                  </div>
                </div>
                <div style={chipSoft}>{carryOverRows.length} employees</div>
              </div>

              <div style={tableWrap}>
                <table style={tableEl}>
                  <thead>
                    <tr>
                      <th style={th}>Employee</th>
                      <th style={{ ...th, textAlign: "center", width: 110 }}>Carry</th>
                      <th style={{ ...th, textAlign: "center", width: 150 }}>
                        Booked by 31 Mar
                      </th>
                      <th style={{ ...th, textAlign: "center", width: 130 }}>
                        Remaining
                      </th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carryOverRows.length === 0 ? (
                      <tr>
                        <td style={td} colSpan={5}>
                          <span style={{ color: UI.muted }}>
                            No employees have carry-over days for {yearView}.
                          </span>
                        </td>
                      </tr>
                    ) : (
                      carryOverRows.map((row, i) => (
                        <tr
                          key={row.name}
                          style={{
                            backgroundColor: i % 2 === 0 ? "#fff" : "#fbfdff",
                            cursor: "pointer",
                          }}
                          onClick={() => setSelectedName(row.name)}
                        >
                          <td style={{ ...td, fontWeight: 800 }}>{row.name}</td>
                          <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                            {Number(row.carried.toFixed(2))}
                          </td>
                          <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                            {Number(row.carryUsedByApril.toFixed(2))}
                          </td>
                          <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                            {Number(row.carryRemainingByApril.toFixed(2))}
                          </td>
                          <td style={td}>
                            {row.carryRemainingByApril > 0 ? (
                              <Pill tone="warn">Still to use before 1 Apr</Pill>
                            ) : (
                              <Pill tone="good">Covered by booked leave</Pill>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT: Sidebar */}
          <div
            style={{
              display: "grid",
              gap: UI.gap,
              position: "sticky",
              top: 16,
            }}
          >
            {/* Controls */}
            <div style={cardBase}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ position: "relative" }}>
                  <Search
                    size={18}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: 9,
                      opacity: 0.6,
                    }}
                    aria-hidden="true"
                  />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search employee..."
                    style={{
                      ...inputBase,
                      padding: "10px 12px 10px 36px",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 800,
                      color: UI.text,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={onlyUnpaid}
                      onChange={(e) => setOnlyUnpaid(e.target.checked)}
                    />
                    Unpaid &gt; 0
                  </label>

                  <div style={{ marginLeft: "auto" }}>
                    <button
                      onClick={() => {
                        setQ("");
                        setOnlyUnpaid(false);
                        setSortKey("name");
                      }}
                      style={btn("ghost")}
                      type="button"
                    >
                      <RotateCcw size={14} /> Reset
                    </button>
                  </div>
                </div>

                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  style={{
                    ...inputBase,
                    fontWeight: 800,
                  }}
                >
                  <option value="name">Sort: Name (A-Z)</option>
                  <option value="paid">Sort: Paid used (desc)</option>
                  <option value="unpaid">Sort: Unpaid (desc)</option>
                  <option value="allowBalAsc">Sort: Balance (asc)</option>
                  <option value="allowBalDesc">Sort: Balance (desc)</option>
                </select>

                <div style={{ marginTop: 2, color: UI.muted, fontSize: 12 }}>
                  Showing <b>{namesToShow.length}</b> employees.
                </div>
              </div>
            </div>

            {/* KPI tiles */}
            <div style={cardBase}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={{ ...titleMd, fontSize: 15 }}>This View</h2>
                  <div style={hint}>Totals after search and filter.</div>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <StatTile label="People" value={kpis.people} tone="soft" icon={Users} />
                <StatTile label="Entries" value={kpis.totalBooked} icon={FileClock} />
                <StatTile
                  label="Paid days"
                  value={fmtDays(kpis.totalPaid)}
                  icon={CalendarDays}
                />
                <StatTile
                  label="Unpaid days"
                  value={fmtDays(kpis.totalUnpaid)}
                  tone="warn"
                  icon={WalletCards}
                />
              </div>
              <div style={{ marginTop: 10, color: UI.muted, fontSize: 12 }}>
                Note: <b>Pending</b> holidays show on the calendar but do{" "}
                <b>not</b> reduce paid allowance totals. <b>Declined</b> holidays
                do not show at all.
              </div>
            </div>

            <div style={cardBase}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={{ ...titleMd, fontSize: 15 }}>Upcoming Leave</h2>
                  <div style={hint}>Next booked leave entries in the selected year.</div>
                </div>
                <span style={chipSoft}>{upcomingLeaveRows.length} shown</span>
              </div>
              <MiniQueue
                title="Next dates"
                rows={upcomingLeaveRows}
                empty="No upcoming leave."
                renderRow={(row) =>
                  `${format(row.start, "d MMM")} - ${row.employee}${row.pending ? " (pending)" : ""}`
                }
                onRowClick={(row) => setSelectedName(row.employee)}
              />
            </div>

            {/* Employee list */}
            <div style={cardBase}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={iconBox(UI.brand, UI.brandSoft)}>
                    <UserRound size={17} />
                  </span>
                  <div style={{ fontWeight: 850, fontSize: 15, color: UI.text }}>
                    Employees
                  </div>
                </div>
                <div style={chipSoft}>{namesToShow.length} listed</div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                  maxHeight: "44vh",
                  overflow: "auto",
                  paddingRight: 2,
                }}
              >
                {namesToShow.map((name) => {
                  const m = metrics(name);
                  const tone = m.allowBal <= 1 ? "warn" : m.allowBal <= 3 ? "info" : "good";

                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedName(name)}
                      type="button"
                      style={{
                        textAlign: "left",
                        width: "100%",
                        borderRadius: UI.radiusSm,
                        border: UI.border,
                        background: "#fff",
                        padding: 9,
                        cursor: "pointer",
                        display: "grid",
                        gap: 6,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.borderColor = UI.brandBorder)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.borderColor = "#d7dee8")
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 850,
                            color: UI.text,
                            minWidth: 0,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {name}
                        </div>
                        <Pill tone={tone}>Bal {m.allowBal}</Pill>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Pill tone="info">
                          Paid {Number(m.paid.toFixed(2))}/{m.totalAllowance}
                        </Pill>
                        <Pill tone="warn">
                          Unpaid {Number(m.unpaid.toFixed(2))}
                        </Pill>
                      </div>
                    </button>
                  );
                })}

                {namesToShow.length === 0 ? (
                  <div style={{ padding: 10, color: UI.muted, fontSize: 13 }}>
                    No matches.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Drawer (employee drill-in) */}
        <Drawer
          open={!!selectedName}
          title={selectedName || ""}
          subtitle={
            selectedName && selected
              ? `Year ${yearView} - Paid ${Number(selected.paid.toFixed(2))}/${selected.totalAllowance} - Unpaid ${Number(
                  selected.unpaid.toFixed(2)
                )} - Balance ${Number(selected.allowBal.toFixed(2))}`
              : ""
          }
          onClose={() => setSelectedName(null)}
        >
          {selectedName && selected ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <StatTile label="Allowance" value={selected.allowance} />
                <StatTile label="Carry over" value={selected.carried} />
                <StatTile label="Total" value={selected.totalAllowance} tone="soft" />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Pill tone="info">Paid used: {Number(selected.paid.toFixed(2))}</Pill>
                <Pill tone="warn">Unpaid: {Number(selected.unpaid.toFixed(2))}</Pill>
                <Pill tone={selected.allowBal <= 1 ? "warn" : selected.allowBal <= 3 ? "info" : "good"}>
                  Balance: {Number(selected.allowBal.toFixed(2))}
                </Pill>
                {!isAdmin ? (
                  <Pill tone="gray">Staff: edit/delete disabled</Pill>
                ) : (
                  <Pill tone="good">Admin: edit/delete enabled</Pill>
                )}
              </div>

              <div style={tableWrap}>
                <table style={tableEl}>
                  <thead>
                    <tr>
                      <th style={th}>From</th>
                      <th style={th}>To</th>
                      <th style={{ ...th, textAlign: "center", width: 110 }}>
                        Days
                      </th>
                      <th style={th}>Type</th>
                      <th style={th}>Notes</th>
                      <th style={{ ...th, width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRows.length === 0 ? (
                      <tr>
                        <td style={td} colSpan={6}>
                          <span style={{ color: UI.muted }}>(No leave booked)</span>
                        </td>
                      </tr>
                    ) : (
                      selectedRows.map((row, i) => {
                        const baseTypeLabel = row.unpaid ? "Unpaid" : "Paid";
                        const typeTone = row.pending
                          ? "pending"
                          : row.unpaid
                          ? "warn"
                          : "good";

                        const halfPrefix = row.halfDay
                          ? `Half-day${row.halfWhen ? ` (${row.halfWhen})` : ""}`
                          : "";

                        return (
                          <tr
                            key={row.id}
                            style={{
                              backgroundColor: i % 2 === 0 ? "#fff" : "#fbfdff",
                            }}
                          >
                            <td style={td}>{format(row.start, "EEE d MMM")}</td>
                            <td style={td}>{format(row.end, "EEE d MMM")}</td>
                            <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                              {row.days}
                              {row.halfDay ? " (half)" : ""}
                            </td>
                            <td style={td}>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                {halfPrefix ? (
                                  <span style={{ ...chip, background: "#fff7ed" }}>
                                    {halfPrefix}
                                  </span>
                                ) : null}
                                {row.pending ? <Pill tone="pending">Pending</Pill> : null}
                                <Pill tone={typeTone}>{baseTypeLabel}</Pill>
                              </div>
                            </td>
                            <td style={td}>
                              <div
                                style={{
                                  maxWidth: 360,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {row.notes || ""}
                              </div>
                            </td>
                            <td style={td}>
                              {isAdmin ? (
                                <button
                                  style={btn("ghost")}
                                  type="button"
                                  onClick={() => setEditHolidayId(row.id)}
                                >
                                  Edit
                                </button>
                              ) : (
                                <span style={{ color: UI.muted, fontSize: 12, fontWeight: 800 }}>
                                  -
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}

                    <tr>
                      <td style={{ ...td, fontWeight: 900 }}>Balance</td>
                      <td style={td}></td>
                      <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>
                        {Number(selected.allowBal.toFixed(2))}
                      </td>
                      <td style={td}></td>
                      <td style={td}></td>
                      <td style={td}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button style={btn("ghost")} type="button" onClick={() => setSelectedName(null)}>
                  Close
                </button>
                <button style={btn()} type="button" onClick={() => setHolidayModalOpen(true)}>
                  + Add Holiday
                </button>
              </div>
            </div>
          ) : (
            <div style={{ color: UI.muted }}>No employee selected.</div>
          )}
        </Drawer>
      </div>

      {/*  Add Holiday overlay */}
      {holidayModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: 16,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHolidayModalOpen(false);
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: "95vw",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: UI.radius,
            }}
          >
            <HolidayForm
              defaultDate={new Date().toISOString().split("T")[0]}
              onClose={() => setHolidayModalOpen(false)}
              onSaved={() => {
                setHolidayModalOpen(false);
                setReloadKey((k) => k + 1);
              }}
            />
          </div>
        </div>
      )}

      {/*  Edit Holiday overlay (Admin only) */}
      {isAdmin && editHolidayId && (
        <EditHolidayForm
          holidayId={editHolidayId}
          onClose={() => setEditHolidayId(null)}
          onSaved={() => {
            setEditHolidayId(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </HeaderSidebarLayout>
  );
}

/* Table styles */
const tableWrap = {
  overflow: "auto",
  border: UI.border,
  borderRadius: UI.radius,
  background: "#fff",
};
const tableEl = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13.5,
};
const th = {
  textAlign: "left",
  padding: "9px 11px",
  borderBottom: "1px solid #eef2f7",
  position: "sticky",
  top: 0,
  background: "#f6f8fb",
  zIndex: 1,
  whiteSpace: "nowrap",
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
};
const td = {
  padding: "9px 11px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
  fontSize: 13,
};
