"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";
import HolidayForm from "@/app/components/holidayform";

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

/* ───────────────────────────────────────────
   Admin allow-list
─────────────────────────────────────────── */
const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

/* ✅ Hide specific employees from the holiday usage chart */
const HIDE_FROM_HOLIDAY_USAGE_GRAPH = new Set(["paul bickers"]);

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
};

const pageWrap = {
  padding: "24px 18px 40px",
  background: UI.bg,
  minHeight: "100vh",
};
const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};
const h1 = {
  color: UI.text,
  fontSize: 26,
  lineHeight: 1.15,
  fontWeight: 900,
  letterSpacing: "-0.01em",
  margin: 0,
};
const sub = { color: UI.muted, fontSize: 13 };
const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
};

const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const card = {
  ...surface,
  padding: 16,
  transition:
    "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};

const cardHover = {
  transform: "translateY(-2px)",
  boxShadow: UI.shadowHover,
  borderColor: "#dbeafe",
};

const sectionHeader = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const titleMd = { fontSize: 16, fontWeight: 900, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12, marginTop: 4 };

const btn = (kind = "primary") => {
  if (kind === "approve") {
    return {
      padding: "8px 10px",
      borderRadius: UI.radiusSm,
      border: "1px solid #86efac",
      background: "#d1fae5",
      color: "#065f46",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  if (kind === "decline") {
    return {
      padding: "8px 10px",
      borderRadius: UI.radiusSm,
      border: "1px solid #fecaca",
      background: "#fee2e2",
      color: "#991b1b",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  if (kind === "ghost") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    padding: "10px 12px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
};

/* Table styles (match your other tables) */
const tableWrap = {
  overflow: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
};
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  position: "sticky",
  top: 0,
  background: "#f8fafc",
  zIndex: 1,
  whiteSpace: "nowrap",
};
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };

/* breakdown cell styles */
const breakdownWrap = {
  maxHeight: 160,
  overflowY: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#f8fafc",
};
const breakdownList = { margin: 0, padding: 0, display: "grid", gap: 6 };
const breakdownRow = (muted) => ({
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: muted ? "#f3f4f6" : "#fff",
  color: muted ? "#6b7280" : UI.text,
});

/* ───────── helpers ───────── */
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

/** ✅ Number formatter: show whole numbers without decimals, otherwise 2dp */
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
function fmt(d) {
  if (!d) return "—";
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

/* ✅ Bank holiday support (UK Gov JSON), scoped to selected year */
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

/** ✅ Build a per-day breakdown. Weekends omitted by default. Bank holidays excluded (treated like weekends). */
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

      // ✅ omit bank holidays by default (same behaviour as weekends)
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

/** ✅ Convert a holiday record to numeric days (excl. weekends AND bank holidays). */
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

/** ✅ Only count PAID holidays (strict: must be explicitly marked as paid) */
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

/* ───────── page ───────── */
export default function HRPage() {
  const router = useRouter();

  const [requestedHolidays, setRequestedHolidays] = useState([]);
  const [deleteRequestedHolidays, setDeleteRequestedHolidays] = useState([]);
  const [usageData, setUsageData] = useState([]); // chart data
  const [loading, setLoading] = useState(true);

  // ✅ Open your existing HolidayForm component (modal inside component)
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);

  // ✅ admin gating for approve/decline
  const [isAdmin, setIsAdmin] = useState(false);

  // ✅ year view
  const THIS_YEAR = new Date().getFullYear();
  const NEXT_YEAR = THIS_YEAR + 1;
  const [yearView, setYearView] = useState(THIS_YEAR);

  /* ✅ bank holidays for selected year */
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
    const email = (auth?.currentUser?.email || "").toLowerCase();
    setIsAdmin(ADMIN_EMAILS.includes(email));
  }, []);

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
  }, [yearView, isBankHoliday]);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "holidays"));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // ✅ Requested for selected year (includes Paid + Unpaid + Accrued)
      const pending = all.filter((h) => {
        const st = String(h.status || "").toLowerCase();
        const y = holidayYear(h);
        return (st === "requested" || !h.status) && y === yearView;
      });
      setRequestedHolidays(pending);

      // ✅ Delete requests for selected year
      const delPending = all.filter((h) => {
        const st = String(h.status || "").toLowerCase();
        const y = holidayYear(h);
        return (st === "delete_requested" || st === "delete-requested") && y === yearView;
      });
      setDeleteRequestedHolidays(delPending);

      // ✅ Approved usage for selected year (PAID ONLY) — excludes weekends + bank holidays
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
      const empSnap = await getDocs(collection(db, "employees"));
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

      /* ✅ HIDE EMPLOYEE(S) FROM GRAPH */
      const filtered = merged.filter((row) => {
        const n = String(row?.name || "").trim().toLowerCase();
        return !HIDE_FROM_HOLIDAY_USAGE_GRAPH.has(n);
      });

      setUsageData(filtered);
    } catch (err) {
      console.error("Error fetching holidays:", err);
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
      alert("❌ Error updating holiday status");
    }
  };

  // ✅ approve/decline delete requests
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
      alert("❌ Error deleting holiday");
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
      alert("❌ Error updating delete request");
    }
  };

  const documents = [
    {
      key: "holidayForm",
      title: "Holiday Request Form",
      description: "Submit and track time off requests.",
      link: "/holiday-form",
    },
    {
      key: "holidayUsage",
      title: "View Holiday Usage",
      description: "Check how much holiday each employee has used.",
      link: "/holiday-usage",
    },
    {
      key: "timesheets",
      title: "Timesheets",
      description: "View, submit, and track weekly timesheets.",
      link: "/timesheets",
    },
    {
      key: "policy",
      title: "HR Policy Manual",
      description: "View company policies and employee handbook.",
      link: "/hr-policies",
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
        fill="#0f172a"
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
        fill="#64748b"
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

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* ✅ Render YOUR HolidayForm directly (no extra wrapper scroll / no extra close) */}
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
              Holiday usage (paid only), approvals and HR shortcuts.
              {!isAdmin ? (
                <span
                  style={{
                    marginLeft: 10,
                    fontWeight: 900,
                    color: UI.muted,
                  }}
                >
                  (View only — admin required to approve/decline)
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
              style={{
                padding: "10px 12px",
                borderRadius: UI.radiusSm,
                border: UI.border,
                background: UI.card,
                fontWeight: 900,
                color: UI.text,
              }}
              title="Select year"
            >
              <option value={THIS_YEAR}>{THIS_YEAR}</option>
              <option value={NEXT_YEAR}>{NEXT_YEAR}</option>
            </select>

            <div style={chip}>{loading ? "Loading…" : `${requestedHolidays.length} requests`}</div>

            <div
              style={{
                ...chip,
                background: "#fff7ed",
                borderColor: "#fed7aa",
                color: "#9a3412",
              }}
            >
              Delete requests: <b style={{ marginLeft: 6 }}>{deleteRequestedHolidays.length}</b>
            </div>

            <div
              style={{
                ...chip,
                background: UI.brandSoft,
                borderColor: "#dbeafe",
                color: UI.brand,
              }}
            >
              Paid usage entries: <b style={{ marginLeft: 6 }}>{usageData.length}</b>
            </div>
          </div>
        </div>

        {/* Top row: Chart + Requests */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 0.85fr",
            gap: UI.gap,
            alignItems: "start",
          }}
        >
          {/* 📊 Usage chart */}
          <section style={card}>
            <div style={sectionHeader}>
              <div>
                <h2 style={titleMd}>Employee holiday usage ({yearView})</h2>
                <div style={hint}>
                  Approved <b>paid</b> holiday taken per employee (weekdays only, excluding bank holidays). Half days = 0.5. Also shows allowance.
                </div>
              </div>
              <div style={chip}>Chart</div>
            </div>

            {usageData.length === 0 ? (
              <div style={{ color: UI.muted, fontSize: 13, padding: "8px 2px" }}>
                No approved paid holidays yet for {yearView}, so there’s nothing to chart.
              </div>
            ) : (
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={usageData}
                    margin={{ top: 16, right: 24, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      tickLine={{ stroke: "#e5e7eb" }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      domain={[0, maxY]}
                      allowDecimals
                      tick={{ fontSize: 12, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      tickLine={{ stroke: "#e5e7eb" }}
                      label={{
                        value: "Days",
                        angle: -90,
                        position: "insideLeft",
                        offset: 8,
                        style: { fontSize: 12, fill: "#6b7280" },
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.12)" }}
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                        fontSize: 12,
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
                    <Bar dataKey="allowance" fill="#94a3b8" radius={[8, 8, 0, 0]}>
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
            {/* 📌 Requested holidays */}
            <section style={card}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={titleMd}>Requested holidays ({yearView})</h2>
                  <div style={hint}>
                    Pending requests for the selected year. <b>Includes Paid + Unpaid + Accrued</b>.
                  </div>
                </div>
                <div style={chip}>{requestedHolidays.length}</div>
              </div>

              {!isAdmin ? (
                <div style={{ color: UI.muted, fontSize: 13, padding: "6px 2px" }}>
                  You can view requests, but only admins can approve/decline.
                </div>
              ) : null}

              {requestedHolidays.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: 13, padding: "8px 2px" }}>
                  No pending holiday requests.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {requestedHolidays.slice(0, 6).map((h) => {
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
                          padding: 12,
                          borderRadius: 12,
                          boxShadow: "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div style={{ fontWeight: 900, color: UI.text }}>
                            {h.employee || h.employeeCode || "Unknown"}
                          </div>
                          <span style={chip}>{type}</span>
                        </div>

                        <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                          {fmt(fromD)} → {fmt(toD)}
                          {typeHint ? (
                            <span style={{ marginLeft: 8, fontWeight: 900, color: UI.text }}>
                              • {typeHint}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                            Approve
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
                            Decline
                          </button>
                          <button
                            style={btn("ghost")}
                            onClick={() => router.push("/holiday-usage")}
                            type="button"
                          >
                            View usage →
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {requestedHolidays.length > 6 ? (
                    <div style={{ color: UI.muted, fontSize: 12, marginTop: 2 }}>
                      Showing 6 of {requestedHolidays.length}. Open Holiday Usage for more.
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {/* 🗑️ Delete requested holidays */}
            <section style={card}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={titleMd}>Holiday delete requests ({yearView})</h2>
                  <div style={hint}>
                    Employees have requested to delete a holiday entry. Admins can approve (permanent delete) or decline (restore).
                  </div>
                </div>
                <div style={{ ...chip, background: "#fff7ed", borderColor: "#fed7aa", color: "#9a3412" }}>
                  {deleteRequestedHolidays.length}
                </div>
              </div>

              {!isAdmin ? (
                <div style={{ color: UI.muted, fontSize: 13, padding: "6px 2px" }}>
                  You can view delete requests, but only admins can approve/decline.
                </div>
              ) : null}

              {deleteRequestedHolidays.length === 0 ? (
                <div style={{ color: UI.muted, fontSize: 13, padding: "8px 2px" }}>
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
                          padding: 12,
                          borderRadius: 12,
                          boxShadow: "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div style={{ fontWeight: 900, color: UI.text }}>
                            {h.employee || h.employeeCode || "Unknown"}
                          </div>
                          <span style={chip}>{type}</span>
                        </div>

                        <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                          {fmt(fromD)} → {fmt(toD)}
                          {typeHint ? (
                            <span style={{ marginLeft: 8, fontWeight: 900, color: UI.text }}>
                              • {typeHint}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: 8, color: UI.muted, fontSize: 12 }}>
                          Requested by: <b style={{ color: UI.text }}>{h.deleteRequestedBy || "—"}</b>
                        </div>

                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                            Approve delete
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
                            Decline
                          </button>

                          <button
                            style={btn("ghost")}
                            onClick={() => router.push("/holiday-usage")}
                            type="button"
                          >
                            View usage →
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {deleteRequestedHolidays.length > 6 ? (
                    <div style={{ color: UI.muted, fontSize: 12, marginTop: 2 }}>
                      Showing 6 of {deleteRequestedHolidays.length}. Open Holiday Usage for more.
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* HR Docs */}
        <section style={{ marginTop: UI.gap }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>HR shortcuts</div>
            <div style={{ color: UI.muted, fontSize: 12 }}>Open related pages</div>
          </div>

          <div style={grid(4)}>
            {documents.map((d, idx) => (
              <div
                key={idx}
                style={card}
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: UI.text }}>{d.title}</div>
                  <span style={chip}>Open</span>
                </div>
                <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{d.description}</div>
                <div style={{ marginTop: 10, fontWeight: 900, color: UI.brand }}>Open →</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}
