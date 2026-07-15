"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import {
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";
import HolidayForm from "@/app/components/holidayform";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
} from "@/app/utils/firestoreAccess";

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
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  ShieldCheck,
  Timer,
  Trash2,
  XCircle,
} from "lucide-react";

/*  Hide specific employees from the holiday usage chart */
const HIDE_FROM_HOLIDAY_USAGE_GRAPH = new Set(["paul bickers"]);

/* Mini design system */
const UI = {
  radius: "var(--radius-md)",
  radiusSm: "var(--radius-md)",
  gap: "var(--space-3)",
  shadowSm: "var(--shadow-sm)",
  shadowHover: "var(--shadow-md)",
  border: "var(--border-default)",
  bg: "var(--color-canvas)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-soft)",
  brandBorder: "var(--color-brand-border)",
  accent: "var(--legacy-color-8b5e3c)",
  accentSoft: "var(--legacy-color-f5ede6)",
  green: "var(--legacy-color-15803d)",
  greenSoft: "var(--legacy-color-ecfdf3)",
  greenBorder: "var(--color-success-border)",
  amber: "var(--legacy-color-b45309)",
  amberSoft: "var(--legacy-color-fffbeb)",
  amberBorder: "var(--legacy-color-fde68a)",
  red: "var(--legacy-color-b91c1c)",
  redSoft: "var(--legacy-color-fee2e2)",
  redBorder: "var(--color-danger-border)",
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
  gap: "var(--space-3)",
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: "var(--font-size-xl)", lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

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

const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const card = {
  ...surface,
  padding: "var(--space-3)",
  transition:
    "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};

const cardHover = {
  transform: "translateY(-2px)",
  boxShadow: UI.shadowHover,
  borderColor: UI.brandBorder,
};

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};

const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: 0 };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };

const btn = (kind = "primary") => {
  if (kind === "approve") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.greenBorder}`,
      background: UI.greenSoft,
      color: UI.green,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "decline") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.redBorder}`,
      background: UI.redSoft,
      color: UI.red,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, var(--color-white) 0%, var(--legacy-color-f8fbfe) 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
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
    background: "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--color-brand) 100%)",
    color: "var(--color-white)",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

/* Table styles (match your other tables) */
const tableWrap = {
  overflow: "auto",
  border: "1px solid var(--legacy-color-dde5ee)",
  borderRadius: UI.radius,
  background: "var(--color-white)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
};
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "var(--font-size-sm)" };
const th = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: "1px solid var(--legacy-color-dde5ee)",
  position: "sticky",
  top: 0,
  background: "var(--legacy-color-f7f9fc)",
  zIndex: 1,
  whiteSpace: "nowrap",
  fontWeight: 800,
  fontSize: "var(--font-size-xs)",
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td = { padding: "9px 10px", borderBottom: "1px solid var(--legacy-color-edf2f7)", verticalAlign: "top" };

/* breakdown cell styles */
const breakdownWrap = {
  maxHeight: 160,
  overflowY: "auto",
  border: "1px solid var(--legacy-color-dde5ee)",
  borderRadius: UI.radius,
  padding: "8px 10px",
  background: "var(--legacy-color-f7f9fc)",
};
const breakdownList = { margin: 0, padding: 0, display: "grid", gap: 6 };
const breakdownRow = (muted) => ({
  display: "flex",
  gap: "var(--space-2)",
  alignItems: "baseline",
  padding: "6px 8px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--legacy-color-dde5ee)",
  background: muted ? "var(--legacy-color-f3f4f6)" : "var(--color-white)",
  color: muted ? "var(--legacy-color-6b7280)" : UI.text,
});

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: "var(--radius-md)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const statCard = {
  ...card,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  minHeight: 82,
};

const statLabel = {
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
};

const statValue = {
  color: UI.text,
  fontSize: 25,
  lineHeight: 1.1,
  fontWeight: 850,
  marginTop: "var(--space-2)",
};

const selectStyle = {
  minHeight: 34,
  padding: "6px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: UI.card,
  fontWeight: 800,
  color: UI.text,
  fontSize: 12.5,
};

const focusCss = `
  select:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: var(--color-info-border) !important;
  }
  button:disabled { opacity: .55; cursor: not-allowed; }
  @media (max-width: 1180px) {
    .hr-main-grid,
    .hr-stat-grid,
    .hr-shortcut-grid { grid-template-columns: 1fr !important; }
  }
`;

/* Helpers */
const norm = (v) => String(v ?? "").trim().toLowerCase();
const truthy = (v) =>
  v === true ||
  v === 1 ||
  norm(v) === "true" ||
  norm(v) === "1" ||
  norm(v) === "yes" ||
  norm(v) === "y";
const ampm = (v) => {
  const t = norm(v);
  if (t === "am") return "AM";
  if (t === "pm") return "PM";
  return null;
};

/**  Number formatter: show whole numbers without decimals, otherwise 2dp */
const fmtNum = (n) => {
  const v = Number(n ?? 0);
  return Math.abs(v - Math.round(v)) < 1e-6 ? v.toFixed(0) : v.toFixed(2);
};

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
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
  }
  return null;
}

function toDate(v) {
  return toSafeDate(v);
}

function sameYMD(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function StatCard({ labelText, value, suffix, icon: Icon, color, bg, border, textValue = false }) {
  return (
    <section style={statCard}>
      <div>
        <div style={statLabel}>{labelText}</div>
        <div style={{ ...statValue, fontSize: textValue ? 19 : statValue.fontSize }}>
          {value}
          {suffix ? <span style={{ marginLeft: 6, color: UI.muted, fontSize: 12.5, fontWeight: 800 }}>{suffix}</span> : null}
        </div>
      </div>
      <span style={iconBox(color, bg, border)}>
        <Icon size={17} />
      </span>
    </section>
  );
}
function fmt(d) {
  if (!d) return "-";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtShort(d) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function eachDateInclusive(start, end) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const out = [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}

/**
 * Returns half-day info for start and/or end.
 * Supports new fields and legacy, with string booleans and mixed casing.
 * { single: boolean, start: {half:boolean, when:'AM'|'PM'|null}, end: {...} }
 */
function getHalfInfo(h) {
  const s = toDate(h.startDate);
  const e = toDate(h.endDate) || s;
  const single = s && e ? sameYMD(s, e) : false;

  // New fields (preferred)
  let start = { half: false, when: null };
  let end = { half: false, when: null };

  if (truthy(h.startHalfDay)) {
    start.half = true;
    start.when = ampm(h.startAMPM);
  }
  if (truthy(h.endHalfDay)) {
    end.half = true;
    end.when = ampm(h.endAMPM);
  }

  // Legacy fallback
  if (truthy(h.halfDay)) {
    const side = norm(h.halfDaySide || h.halfDayAt);
    const when = ampm(h.halfDayPeriod || h.halfDayType);
    if (side.includes("start") || side.includes("first")) {
      start.half = true;
      start.when = start.when || when;
    } else if (side.includes("end") || side.includes("last")) {
      end.half = true;
      end.when = end.when || when;
    } else if (!single) {
      start.half = start.half || true;
      start.when = start.when || when;
    }
  }

  return { single, start, end };
}

/*  Bank holiday support (UK Gov JSON), scoped to selected year */
async function fetchUkBankHolidaysForYear(year, region = "england-and-wales") {
  const res = await fetch("https://www.gov.uk/bank-holidays.json", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Bank holidays fetch failed: ${res.status}`);
  const json = await res.json();
  const list = json?.[region]?.events || [];
  return list
    .map((ev) => {
      const d = parseYMD(ev?.date);
      if (!d) return null;
      if (d.getFullYear() !== Number(year)) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })
    .filter(Boolean);
}

/**  Build a per-day breakdown. Weekends omitted by default. Bank holidays excluded (treated like weekends). */
function buildBreakdown(h, includeWeekends = false, isBankHolidayFn = null) {
  const s = toDate(h.startDate);
  const e = toDate(h.endDate) || s;
  if (!s || !e) return [];

  const days = eachDateInclusive(s, e);
  const { single, start, end } = getHalfInfo(h);

  return days
    .map((d, idx) => {
      const weekend = isWeekend(d);
      const bankHoliday = isBankHolidayFn ? isBankHolidayFn(d) : false;

      //  omit bank holidays by default (same behaviour as weekends)
      if (!includeWeekends && (weekend || bankHoliday)) return null;

      let label = "Full day";

      if (single) {
        if (start.half || end.half) {
          const when = start.when || end.when;
          label = `Half day${when ? ` (${when})` : ""}`;
        }
      } else {
        if (idx === 0 && start.half)
          label = `Half day${start.when ? ` (${start.when})` : ""}`;
        else if (idx === days.length - 1 && end.half)
          label = `Half day${end.when ? ` (${end.when})` : ""}`;
        else
          label = bankHoliday
            ? "Bank holiday (ignored)"
            : weekend
            ? "Weekend (ignored)"
            : "Full day";
      }

      const muted = weekend || bankHoliday;
      return { key: d.toISOString(), date: fmtShort(d), label, muted };
    })
    .filter(Boolean);
}

/**  Convert a holiday record to numeric days (excl. weekends AND bank holidays). */
function daysForHoliday(h, isBankHolidayFn = null) {
  const breakdown = buildBreakdown(h, false, isBankHolidayFn);
  let total = 0;
  for (const row of breakdown) {
    const lbl = String(row.label || "").toLowerCase();
    if (lbl.startsWith("full day")) total += 1;
    else if (lbl.startsWith("half day")) total += 0.5;
  }
  return total;
}

/** Determine year bucket for holiday (only count if start and end are within same year) */
function holidayYear(h) {
  const s = toDate(h.startDate);
  const e = toDate(h.endDate) || s;
  if (!s || !e) return null;
  if (s.getFullYear() !== e.getFullYear()) return null;
  return s.getFullYear();
}

/**  Only count PAID holidays (strict: must be explicitly marked as paid) */
const isPaidHoliday = (h = {}) => {
  const ps = String(h.paidStatus ?? h.paid ?? h.isPaid ?? "")
    .trim()
    .toLowerCase();
  const lt = String(h.leaveType ?? h.type ?? "").trim().toLowerCase();

  if (h.isPaid === true || h.paid === true || h.paid === 1) return true;

  if (ps.includes("unpaid") || lt.includes("unpaid")) return false;

  if (ps.includes("paid")) return true;
  if (lt.includes("paid")) return true;

  // default: don't count unless explicitly paid
  return false;
};

/* Page */
export default function HRPage() {
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

  const [requestedHolidays, setRequestedHolidays] = useState([]);
  const [deleteRequestedHolidays, setDeleteRequestedHolidays] = useState([]);
  const [usageData, setUsageData] = useState([]); // chart data
  const [loading, setLoading] = useState(true);

  //  Open your existing HolidayForm component (modal inside component)
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);

  //  admin gating for approve/decline
  const isAdmin = !!authAccess.isAdmin;

  //  year view
  const THIS_YEAR = new Date().getFullYear();
  const NEXT_YEAR = THIS_YEAR + 1;
  const [yearView, setYearView] = useState(THIS_YEAR);

  /*  bank holidays for selected year */
  const [bankHolidaySet, setBankHolidaySet] = useState(() => new Set());

  const isBankHoliday = useCallback(
    (d) => {
      if (!d) return false;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return bankHolidaySet.has(`${y}-${m}-${day}`);
    },
    [bankHolidaySet]
  );

  useEffect(() => {
    // load bank holidays first (so usage counting can exclude them)
    const run = async () => {
      try {
        const dates = await fetchUkBankHolidaysForYear(
          yearView,
          "england-and-wales"
        );
        setBankHolidaySet(new Set(dates));
      } catch (e) {
        console.warn("Bank holidays unavailable:", e);
        setBankHolidaySet(new Set());
      }
    };
    run();
  }, [yearView]);

  useEffect(() => {
    fetchHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearView, isBankHoliday, accessKey]);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const gate = resolveDataAccess(dataAccessState);
      if (gate.checking) return;
      if (!gate.allowed) {
        reportDataAccessBlocked(gate, { collectionName: "holidays", operation: "read HR holidays" });
        return;
      }

      const snap = await getDocs(tenantCollectionQuery(db, "holidays", dataAccessState));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      //  Requested for selected year (includes Paid + Unpaid + Accrued)
      const pending = all.filter((h) => {
        const st = String(h.status || "").toLowerCase();
        const y = holidayYear(h);
        return (st === "requested" || !h.status) && y === yearView;
      });
      setRequestedHolidays(pending);

      //  Delete requests for selected year
      const delPending = all.filter((h) => {
        const st = String(h.status || "").toLowerCase();
        const y = holidayYear(h);
        return (st === "delete_requested" || st === "delete-requested") && y === yearView;
      });
      setDeleteRequestedHolidays(delPending);

      // Approved usage for selected year (paid only) - excludes weekends and bank holidays
      const approved = all.filter((h) => {
        const st = String(h.status || "").toLowerCase();
        const y = holidayYear(h);
        return st === "approved" && y === yearView && isPaidHoliday(h);
      });

      const usageByEmp = new Map(); // name -> days
      approved.forEach((h) => {
        const name =
          (h.employee && String(h.employee)) ||
          (h.employeeCode && String(h.employeeCode)) ||
          "Unknown";
        const key = name.trim() || "Unknown";
        const days = daysForHoliday(h, isBankHoliday);
        usageByEmp.set(key, (usageByEmp.get(key) || 0) + days);
      });

      // Build data for graph with allowance overlay
      const usageArr = Array.from(usageByEmp.entries())
        .map(([name, days]) => ({ name, used: Number(days.toFixed(2)) }))
        .sort((a, b) => b.used - a.used);

      // Load allowances from employees and merge (by name)
      const empSnap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
      const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const allowByName = new Map();
      employees.forEach((e) => {
        const name = String(e.name || e.fullName || e.employeeName || "").trim();
        if (!name) return;

        const yrKey = String(yearView);
        const fromMap = e?.holidayAllowances?.[yrKey];
        const legacy = e?.holidayAllowance;
        const fallback = typeof legacy === "number" ? legacy : 0;
        const allowance =
          typeof fromMap === "number"
            ? fromMap
            : typeof legacy === "number"
            ? legacy
            : fallback;

        allowByName.set(name, Number(allowance || 0));
      });

      // Include people who have allowance but 0 used (still show on chart)
      const allNames = new Set([
        ...usageArr.map((x) => x.name),
        ...Array.from(allowByName.keys()),
      ]);

      const merged = Array.from(allNames).map((name) => {
        const used = usageByEmp.get(name) || 0;
        const allowance = allowByName.get(name) || 0;
        const remaining = Number((allowance - used).toFixed(2));
        return {
          name,
          used: Number(used.toFixed(2)),
          allowance: Number(Number(allowance || 0).toFixed(2)),
          remaining: remaining < 0 ? 0 : remaining,
        };
      });

      // Sort by used desc
      merged.sort((a, b) => b.used - a.used);

      /*  HIDE EMPLOYEE(S) FROM GRAPH */
      const filtered = merged.filter((row) => {
        const n = String(row?.name || "").trim().toLowerCase();
        return !HIDE_FROM_HOLIDAY_USAGE_GRAPH.has(n);
      });

      setUsageData(filtered);
    } catch (err) {
      if (!handleFirestoreAccessError(err, { collectionName: "holidays", operation: "read HR holidays" })) {
        console.error("Error fetching holidays:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    if (!isAdmin) {
      alert("Only admins can approve or decline holidays.");
      return;
    }
    try {
      const ref = doc(db, "holidays", id);
      await updateDoc(ref, {
        status,
        decidedBy: auth?.currentUser?.email || "",
        decidedAt: serverTimestamp(),
      });
      await fetchHolidays();
    } catch (err) {
      console.error("Error updating status:", err);
      alert(" Error updating holiday status");
    }
  };

  //  approve/decline delete requests
  const approveDelete = async (h) => {
    if (!isAdmin) {
      alert("Only admins can approve deletions.");
      return;
    }
    const ok = confirm(
      "Approve deletion? This will permanently remove the holiday entry."
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "holidays", h.id));
      await fetchHolidays();
    } catch (err) {
      console.error("Error approving delete:", err);
      alert(" Error deleting holiday");
    }
  };

  const declineDelete = async (h) => {
    if (!isAdmin) {
      alert("Only admins can decline deletions.");
      return;
    }
    try {
      const restore = String(h.deleteFromStatus || h.previousStatus || "approved");
      await updateDoc(doc(db, "holidays", h.id), {
        status: restore,
        deleteRequestedAt: null,
        deleteRequestedBy: null,
        deleteDeclinedAt: serverTimestamp(),
        deleteDeclinedBy: auth?.currentUser?.email || "",
      });
      await fetchHolidays();
    } catch (err) {
      console.error("Error declining delete:", err);
      alert(" Error updating delete request");
    }
  };

  const documents = [
    {
      key: "holidayForm",
      title: "Holiday Request Form",
      description: "Submit and track time off requests.",
      link: "/holiday-form",
      icon: CalendarClock,
      color: UI.brand,
      bg: UI.brandSoft,
      border: UI.brandBorder,
    },
    {
      key: "holidayUsage",
      title: "View Holiday Usage",
      description: "Check how much holiday each employee has used.",
      link: "/holiday-usage",
      icon: BarChart3,
      color: UI.green,
      bg: UI.greenSoft,
      border: UI.greenBorder,
    },
    {
      key: "timesheets",
      title: "Timesheets",
      description: "View, submit, and track weekly timesheets.",
      link: "/timesheets",
      icon: Timer,
      color: UI.amber,
      bg: UI.amberSoft,
      border: UI.amberBorder,
    },
    {
      key: "shiftChange",
      title: "Quick Shift Change",
      description: "Request or approve adjusted start and finish times.",
      link: "/shift-change",
      icon: Clock3,
      color: UI.brand,
      bg: UI.brandSoft,
      border: UI.brandBorder,
    },
    {
      key: "policy",
      title: "HR Policy Manual",
      description: "View company policies and employee handbook.",
      link: "/hr-policies",
      icon: BookOpen,
      color: "var(--legacy-color-7c3aed)",
      bg: "var(--legacy-color-f5f3ff)",
      border: "var(--legacy-color-ddd6fe)",
    },
  ];

  const renderLabel = (props) => {
    const { x, y, width, value } = props;
    if (value == null) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        textAnchor="middle"
        fill="var(--color-text)"
        style={{ fontSize: 11, fontWeight: 800 }}
      >
        {fmtNum(value)}
      </text>
    );
  };

  const renderAllowanceLabel = (props) => {
    const { x, y, width, value } = props;
    if (value == null) return null;
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        textAnchor="middle"
        fill="var(--color-text-subtle)"
        style={{ fontSize: 11, fontWeight: 800 }}
      >
        {fmtNum(value)}
      </text>
    );
  };

  const maxY = useMemo(() => {
    if (!usageData.length) return undefined;
    const m = Math.max(
      ...usageData.map((r) =>
        Math.max(Number(r.used || 0), Number(r.allowance || 0))
      )
    );
    return Math.max(5, Math.ceil(m + 1));
  }, [usageData]);

  const totalUsedDays = useMemo(
    () => usageData.reduce((sum, row) => sum + (Number(row.used) || 0), 0),
    [usageData]
  );

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div style={pageWrap}>
        {/*  Render YOUR HolidayForm directly (no extra wrapper scroll / no extra close) */}
        {holidayModalOpen && (
          <HolidayForm
            defaultDate={new Date().toISOString().split("T")[0]}
            onClose={() => setHolidayModalOpen(false)}
            onSaved={() => {
              setHolidayModalOpen(false);
              fetchHolidays();
            }}
          />
        )}

        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>HR</h1>
            <div style={sub}>
              HR operations overview for holiday usage, approvals and employee administration.
              {!isAdmin ? (
                <span
                  style={{
                    marginLeft: 10,
                    fontWeight: 800,
                    color: UI.muted,
                  }}
                >
                  (View only - admin required to approve/decline)
                </span>
              ) : null}
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
            <select
              value={yearView}
              onChange={(e) => setYearView(Number(e.target.value))}
              style={selectStyle}
              title="Select year"
            >
              <option value={THIS_YEAR}>{THIS_YEAR}</option>
              <option value={NEXT_YEAR}>{NEXT_YEAR}</option>
            </select>

            <div style={chip}>
              <Clock3 size={13} /> {loading ? "Loading..." : `${requestedHolidays.length} requests`}
            </div>

            <div
              style={{
                ...chip,
                background: UI.amberSoft,
                borderColor: UI.amberBorder,
                color: UI.amber,
              }}
            >
              <Trash2 size={13} /> Delete requests: <b>{deleteRequestedHolidays.length}</b>
            </div>

            <div
              style={{
                ...chip,
                background: UI.brandSoft,
                borderColor: "var(--legacy-color-dbeafe)",
                color: UI.brand,
              }}
            >
              <BarChart3 size={13} /> Paid usage entries: <b>{usageData.length}</b>
            </div>
          </div>
        </div>

        <div className="hr-stat-grid" style={{ ...grid(4), marginBottom: UI.gap }}>
          <StatCard
            labelText="Pending approvals"
            value={requestedHolidays.length}
            icon={Clock3}
            color={UI.brand}
            bg={UI.brandSoft}
            border={UI.brandBorder}
          />
          <StatCard
            labelText="Delete requests"
            value={deleteRequestedHolidays.length}
            icon={Trash2}
            color={UI.amber}
            bg={UI.amberSoft}
            border={UI.amberBorder}
          />
          <StatCard
            labelText="Paid usage"
            value={fmtNum(totalUsedDays)}
            suffix="days"
            icon={BarChart3}
            color={UI.green}
            bg={UI.greenSoft}
            border={UI.greenBorder}
          />
          <StatCard
            labelText="Access"
            value={isAdmin ? "Admin" : "View only"}
            icon={ShieldCheck}
            color="var(--legacy-color-7c3aed)"
            bg="var(--legacy-color-f5f3ff)"
            border="var(--legacy-color-ddd6fe)"
            textValue
          />
        </div>

        {/* Top row: Chart + Requests */}
        <div
          className="hr-main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 0.85fr)",
            gap: UI.gap,
            alignItems: "start",
          }}
        >
          {/*  Usage chart */}
          <section style={card}>
            <div style={sectionHeader}>
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <span style={iconBox(UI.green, UI.greenSoft, UI.greenBorder)}>
                  <BarChart3 size={17} />
                </span>
                <div>
                  <h2 style={titleMd}>Holiday Usage Overview ({yearView})</h2>
                  <div style={hint}>
                    Approved paid holiday by employee, excluding weekends and bank holidays.
                  </div>
                </div>
              </div>
              <div style={chip}>
                <BarChart3 size={13} /> Usage chart
              </div>
            </div>

            {usageData.length === 0 ? (
              <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", padding: "8px 2px" }}>
                No approved paid holidays yet for {yearView}, so there is nothing to chart.
              </div>
            ) : (
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={usageData}
                    margin={{ top: 16, right: 24, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--legacy-color-e5e7eb)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: "var(--font-size-xs)", fill: "var(--legacy-color-6b7280)" }}
                      axisLine={{ stroke: "var(--legacy-color-e5e7eb)" }}
                      tickLine={{ stroke: "var(--legacy-color-e5e7eb)" }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      domain={[0, maxY]}
                      allowDecimals
                      tick={{ fontSize: "var(--font-size-xs)", fill: "var(--legacy-color-6b7280)" }}
                      axisLine={{ stroke: "var(--legacy-color-e5e7eb)" }}
                      tickLine={{ stroke: "var(--legacy-color-e5e7eb)" }}
                      label={{
                        value: "Days",
                        angle: -90,
                        position: "insideLeft",
                        offset: 8,
                        style: { fontSize: "var(--font-size-xs)", fill: "var(--legacy-color-6b7280)" },
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.12)" }}
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid var(--legacy-color-e5e7eb)",
                        boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                        fontSize: "var(--font-size-xs)",
                        color: UI.text,
                      }}
                      formatter={(value, name, props) => {
                        const v = fmtNum(value);
                        if (name === "used") return [`${v} used`, props?.payload?.name || ""];
                        if (name === "allowance") return [`${v} allowance`, props?.payload?.name || ""];
                        return [`${v}`, props?.payload?.name || ""];
                      }}
                      labelFormatter={(label) => label}
                    />

                    {/* Allowance (grey) */}
                    <Bar dataKey="allowance" fill="var(--legacy-color-94a3b8)" radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="allowance" content={renderAllowanceLabel} />
                    </Bar>

                    {/* Used (brand) */}
                    <Bar dataKey="used" fill={UI.brand} radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="used" content={renderLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Right column: Requested + Delete Requested */}
          <div style={{ display: "grid", gap: UI.gap }}>
            {/*  Requested holidays */}
            <section style={card}>
              <div style={sectionHeader}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <span style={iconBox(UI.brand, UI.brandSoft, UI.brandBorder)}>
                    <Clock3 size={17} />
                  </span>
                  <div>
                    <h2 style={titleMd}>Holiday Approval Queue ({yearView})</h2>
                    <div style={hint}>
                      Pending requests for the selected year.
                    </div>
                  </div>
                </div>
                <div style={chip}>
                  <Clock3 size={13} /> {requestedHolidays.length}
                </div>
              </div>

              {!isAdmin ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", padding: "6px 2px" }}>
                  You can review requests here, but only admins can approve or decline them.
                </div>
              ) : null}

              {requestedHolidays.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", padding: "8px 2px" }}>
                  No pending holiday requests.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {requestedHolidays.slice(0, 6).map((h) => {
                    const fromD = toDate(h.startDate);
                    const toD = toDate(h.endDate) || fromD;
                    const type = String(h.leaveType || h.paidStatus || "Other");
                    const requestedBy =
                      String(
                        h.requestedByName ||
                          h.requestedByEmail ||
                          h.createdByName ||
                          h.createdByEmail ||
                          ""
                      ).trim() || "Not recorded";
                    const { single, start, end } = getHalfInfo(h);

                    let typeHint = "";
                    if (single && (start.half || end.half)) {
                      typeHint = `Half ${start.when || end.when || ""}`.trim();
                    } else if (!single && (start.half || end.half)) {
                      const bits = [];
                      if (start.half) bits.push(`Start half${start.when ? ` (${start.when})` : ""}`);
                      if (end.half) bits.push(`End half${end.when ? ` (${end.when})` : ""}`);
                      typeHint = bits.join(", ");
                    }

                    return (
                      <div
                        key={h.id}
                        style={{
                          ...surface,
                          padding: 10,
                          borderRadius: UI.radius,
                          boxShadow: "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div style={{ fontWeight: 900, color: UI.text }}>
                            {h.employee || h.employeeCode || "Unknown"}
                          </div>
                          <span style={chip}>{type}</span>
                        </div>

                        <div style={{ marginTop: 6, color: UI.muted, fontSize: "var(--font-size-sm)" }}>
                          {fmt(fromD)} to {fmt(toD)}
                          {typeHint ? (
                            <span style={{ marginLeft: "var(--space-2)", fontWeight: 900, color: UI.text }}>
                              - {typeHint}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: "var(--space-1)", color: UI.muted, fontSize: 12.5 }}>
                          Requested by:{" "}
                          <span style={{ fontWeight: 800, color: UI.text }}>{requestedBy}</span>
                        </div>

                        <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                          <button
                            style={{
                              ...btn("approve"),
                              opacity: isAdmin ? 1 : 0.45,
                              cursor: isAdmin ? "pointer" : "not-allowed",
                            }}
                            onClick={() => isAdmin && updateStatus(h.id, "approved")}
                            type="button"
                            disabled={!isAdmin}
                            title={!isAdmin ? "Admin only" : "Approve"}
                          >
                            <CheckCircle2 size={14} /> Approve
                          </button>
                          <button
                            style={{
                              ...btn("decline"),
                              opacity: isAdmin ? 1 : 0.45,
                              cursor: isAdmin ? "pointer" : "not-allowed",
                            }}
                            onClick={() => isAdmin && updateStatus(h.id, "declined")}
                            type="button"
                            disabled={!isAdmin}
                            title={!isAdmin ? "Admin only" : "Decline"}
                          >
                            <XCircle size={14} /> Decline
                          </button>
                          <button
                            style={btn("ghost")}
                            onClick={() => router.push("/holiday-usage")}
                            type="button"
                          >
                            View usage <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {requestedHolidays.length > 6 ? (
                    <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: 2 }}>
                      Showing 6 of {requestedHolidays.length}. Open Holiday Usage for the full list.
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {/*  Delete requested holidays */}
            <section style={card}>
              <div style={sectionHeader}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <span style={iconBox(UI.amber, UI.amberSoft, UI.amberBorder)}>
                    <Trash2 size={17} />
                  </span>
                  <div>
                    <h2 style={titleMd}>Holiday Deletion Requests ({yearView})</h2>
                    <div style={hint}>
                      Requests to remove an existing holiday entry.
                    </div>
                  </div>
                </div>
                <div style={{ ...chip, background: UI.amberSoft, borderColor: UI.amberBorder, color: UI.amber }}>
                  <Trash2 size={13} /> {deleteRequestedHolidays.length}
                </div>
              </div>

              {!isAdmin ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", padding: "6px 2px" }}>
                  You can review delete requests here, but only admins can approve or decline them.
                </div>
              ) : null}

              {deleteRequestedHolidays.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", padding: "8px 2px" }}>
                  No delete requests.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {deleteRequestedHolidays.slice(0, 6).map((h) => {
                    const fromD = toDate(h.startDate);
                    const toD = toDate(h.endDate) || fromD;
                    const type = String(h.leaveType || h.paidStatus || "Other");
                    const { single, start, end } = getHalfInfo(h);

                    let typeHint = "";
                    if (single && (start.half || end.half)) {
                      typeHint = `Half ${start.when || end.when || ""}`.trim();
                    } else if (!single && (start.half || end.half)) {
                      const bits = [];
                      if (start.half) bits.push(`Start half${start.when ? ` (${start.when})` : ""}`);
                      if (end.half) bits.push(`End half${end.when ? ` (${end.when})` : ""}`);
                      typeHint = bits.join(", ");
                    }

                    return (
                      <div
                        key={h.id}
                        style={{
                          ...surface,
                          padding: 10,
                          borderRadius: UI.radius,
                          boxShadow: "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div style={{ fontWeight: 900, color: UI.text }}>
                            {h.employee || h.employeeCode || "Unknown"}
                          </div>
                          <span style={chip}>{type}</span>
                        </div>

                        <div style={{ marginTop: 6, color: UI.muted, fontSize: "var(--font-size-sm)" }}>
                          {fmt(fromD)} to {fmt(toD)}
                          {typeHint ? (
                            <span style={{ marginLeft: "var(--space-2)", fontWeight: 900, color: UI.text }}>
                              - {typeHint}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: "var(--space-2)", color: UI.muted, fontSize: "var(--font-size-xs)" }}>
                          Requested by: <b style={{ color: UI.text }}>{h.deleteRequestedBy || "-"}</b>
                        </div>

                        <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                          <button
                            style={{
                              ...btn("approve"),
                              opacity: isAdmin ? 1 : 0.45,
                              cursor: isAdmin ? "pointer" : "not-allowed",
                            }}
                            onClick={() => isAdmin && approveDelete(h)}
                            type="button"
                            disabled={!isAdmin}
                            title={!isAdmin ? "Admin only" : "Approve delete"}
                          >
                            <CheckCircle2 size={14} /> Approve delete
                          </button>

                          <button
                            style={{
                              ...btn("decline"),
                              opacity: isAdmin ? 1 : 0.45,
                              cursor: isAdmin ? "pointer" : "not-allowed",
                            }}
                            onClick={() => isAdmin && declineDelete(h)}
                            type="button"
                            disabled={!isAdmin}
                            title={!isAdmin ? "Admin only" : "Decline delete"}
                          >
                            <XCircle size={14} /> Decline
                          </button>

                          <button
                            style={btn("ghost")}
                            onClick={() => router.push("/holiday-usage")}
                            type="button"
                          >
                            View usage <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {deleteRequestedHolidays.length > 6 ? (
                    <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: 2 }}>
                      Showing 6 of {deleteRequestedHolidays.length}. Open Holiday Usage for the full list.
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* HR Docs */}
        <section style={{ marginTop: "var(--space-3)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: UI.text }}>HR Shortcuts</div>
              <div style={hint}>Open related operational pages.</div>
            </div>
            <div style={chip}>
              <FileText size={13} /> {documents.length} links
            </div>
          </div>

          <div className="hr-shortcut-grid" style={grid(4)}>
            {documents.map((d) => {
              const Icon = d.icon || FileText;
              return (
              <div
                key={d.key}
                style={{ ...card, cursor: "pointer" }}
                onClick={() => {
                  if (d.key === "holidayForm") return setHolidayModalOpen(true);
                  router.push(d.link);
                }}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, card)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (d.key === "holidayForm") return setHolidayModalOpen(true);
                    router.push(d.link);
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                    <span style={iconBox(d.color, d.bg, d.border)}>
                      <Icon size={17} />
                    </span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: UI.text }}>{d.title}</div>
                      <div style={{ marginTop: 5, color: UI.muted, fontSize: 12.5, lineHeight: 1.35 }}>{d.description}</div>
                    </div>
                  </div>
                  <ChevronRight size={17} color={UI.brand} />
                </div>
              </div>
              );
            })}
          </div>
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}
