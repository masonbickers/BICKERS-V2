"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { PeopleFleetHeaderActions, PeopleFleetPage, PeopleFleetPageHeader } from "@/app/components/PeopleFleetPage";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MetricCard as SharedMetricCard,
  NavigationCard,
  Select,
} from "@/app/components/ui";
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
  isHolidayAwaitingApproval,
  isHolidayDeleteAwaitingApproval,
} from "@/app/utils/holidayApprovalQueue";
import {
  createCurrentEmployeeDirectory,
  employeeDisplayName,
  shouldShowInHolidayUsageOverview,
} from "@/app/utils/employeeRecordVisibility";

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
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* Page-specific visual tokens */
const UI = UI_TOKENS;

const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: 0 };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };

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

      // Operational HR views are driven by the current employee register. Historic
      // holiday documents stay intact, but must not recreate a removed employee.
      const empSnap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
      const employeeDirectory = createCurrentEmployeeDirectory(
        empSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      const currentEmployeeHolidays = all.filter((holiday) => employeeDirectory.matches(holiday));

      //  Requested for selected year (includes Paid + Unpaid + Accrued)
      const pending = currentEmployeeHolidays.filter((holiday) => isHolidayAwaitingApproval(holiday, yearView));
      setRequestedHolidays(pending);

      //  Delete requests for selected year
      const delPending = currentEmployeeHolidays.filter((holiday) => isHolidayDeleteAwaitingApproval(holiday, yearView));
      setDeleteRequestedHolidays(delPending);

      // Approved usage for selected year (paid only) - excludes weekends and bank holidays
      const approved = currentEmployeeHolidays.filter((h) => {
        const st = String(h.status || "").toLowerCase();
        const y = holidayYear(h);
        return st === "approved" && y === yearView && isPaidHoliday(h);
      });

      const usageByEmp = new Map(); // name -> days
      approved.forEach((h) => {
        const employee = employeeDirectory.resolve(h);
        const key = employeeDisplayName(employee);
        if (!key) return;
        const days = daysForHoliday(h, isBankHoliday);
        usageByEmp.set(key, (usageByEmp.get(key) || 0) + days);
      });

      // Build data for graph with allowance overlay
      const usageArr = Array.from(usageByEmp.entries())
        .map(([name, days]) => ({ name, used: Number(days.toFixed(2)) }))
        .sort((a, b) => b.used - a.used);

      const allowByName = new Map();
      employeeDirectory.employees.forEach((e) => {
        const name = employeeDisplayName(e);
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
      const filtered = merged.filter((row) => shouldShowInHolidayUsageOverview(row?.name));

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
      systemDialogs.showSystemNotification("Only admins can approve or decline holidays.");
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
      systemDialogs.showSystemNotification(" Error updating holiday status");
    }
  };

  //  approve/decline delete requests
  const approveDelete = async (h) => {
    if (!isAdmin) {
      systemDialogs.showSystemNotification("Only admins can approve deletions.");
      return;
    }
    const ok = await systemDialogs.confirmSystem(
      "Approve deletion? This will permanently remove the holiday entry."
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "holidays", h.id));
      await fetchHolidays();
    } catch (err) {
      console.error("Error approving delete:", err);
      systemDialogs.showSystemNotification(" Error deleting holiday");
    }
  };

  const declineDelete = async (h) => {
    if (!isAdmin) {
      systemDialogs.showSystemNotification("Only admins can decline deletions.");
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
      systemDialogs.showSystemNotification(" Error updating delete request");
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
      color: "var(--color-info)",
      bg: "var(--color-info-soft)",
      border: "var(--color-border)",
    },
  ];

  const renderLabel = (props) => {
    const { x, y, width, height, value } = props;
    if (value == null) return null;
    return (
      <text
        x={x + width + 6}
        y={y + height / 2 + 4}
        textAnchor="start"
        fill="var(--color-text)"
        className={layoutStyles.extracted1}
      >
        {fmtNum(value)}
      </text>
    );
  };

  const renderAllowanceLabel = (props) => {
    const { x, y, width, height, value } = props;
    if (value == null) return null;
    return (
      <text
        x={x + width + 6}
        y={y + height / 2 + 4}
        textAnchor="start"
        fill="var(--color-text-muted)"
        className={layoutStyles.extracted2}
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
      <PeopleFleetPage>
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
        <PeopleFleetPageHeader
          title="HR / Timesheets"
          subtitle={`HR operations overview for holiday usage, approvals and employee administration.${!isAdmin ? " View only — admin access is required to approve or decline." : ""}`}
          actions={<PeopleFleetHeaderActions>
            {requestedHolidays.length > 0 ? (
              <Badge variant="warning">
                <Clock3 size={13} /> {requestedHolidays.length} need review
              </Badge>
            ) : (
              <Badge variant="success"><CheckCircle2 size={13} /> Queue clear</Badge>
            )}
            <Select
              aria-label="HR reporting year"
              value={yearView}
              onChange={(e) => setYearView(Number(e.target.value))}
              title="Select year"
              className={layoutStyles.yearSelect}
            >
              <option value={THIS_YEAR}>{THIS_YEAR}</option>
              <option value={NEXT_YEAR}>{NEXT_YEAR}</option>
            </Select>
          </PeopleFleetHeaderActions>}
        />

        <div className={layoutStyles.metricsGrid} aria-label="HR overview">
          <SharedMetricCard
            label="Pending approvals"
            value={requestedHolidays.length}
            hint={requestedHolidays.length ? "Requires a decision" : "Queue is clear"}
            icon={<Clock3 size={19} />}
            tone={requestedHolidays.length ? "warning" : "success"}
          />
          <SharedMetricCard
            label="Delete requests"
            value={deleteRequestedHolidays.length}
            hint={deleteRequestedHolidays.length ? "Requires a decision" : "No requests"}
            icon={<Trash2 size={19} />}
            tone={deleteRequestedHolidays.length ? "warning" : "neutral"}
          />
          <SharedMetricCard
            label="Paid usage"
            value={fmtNum(totalUsedDays)}
            valueSuffix="days"
            hint={`Across ${usageData.length} employees`}
            icon={<BarChart3 size={19} />}
            tone="success"
          />
          <SharedMetricCard
            label="Access"
            value={isAdmin ? "Admin" : "View only"}
            hint={isAdmin ? "Approval controls enabled" : "Read-only access"}
            icon={<ShieldCheck size={19} />}
            tone="info"
          />
        </div>

        {/* Top row: Chart + Requests */}
        <div className={layoutStyles.mainGrid}>
          {/*  Usage chart */}
          <Card className={layoutStyles.usageCard}>
            <div className={layoutStyles.sectionHeader}>
              <div className={layoutStyles.extracted6}>
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
              <div className={layoutStyles.chartLegend}>
                <Badge variant="info">Used</Badge>
                <Badge>Allowance</Badge>
              </div>
            </div>

            {usageData.length === 0 ? (
              <EmptyState
                title="No paid holiday usage"
                description={`There are no approved paid holidays to chart for ${yearView}.`}
                icon={<BarChart3 size={24} />}
                className={layoutStyles.chartEmpty}
              />
            ) : (
              <div className={layoutStyles.chartViewport}>
                <div style={{ height: Math.max(380, usageData.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={usageData}
                    layout="vertical"
                    barCategoryGap="18%"
                    margin={{ top: 8, right: 54, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      type="number"
                      domain={[0, maxY]}
                      allowDecimals
                      tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                      axisLine={{ stroke: "var(--color-border)" }}
                      tickLine={{ stroke: "var(--color-border)" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={124}
                      tick={{ fontSize: 11.5, fill: "var(--color-text-muted)" }}
                      axisLine={false}
                      tickLine={false}
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
                      formatter={(value, name, props) => {
                        const v = fmtNum(value);
                        if (name === "used") return [`${v} used`, props?.payload?.name || ""];
                        if (name === "allowance") return [`${v} allowance`, props?.payload?.name || ""];
                        return [`${v}`, props?.payload?.name || ""];
                      }}
                      labelFormatter={(label) => label}
                    />

                    {/* Allowance (grey) */}
                    <Bar dataKey="allowance" fill="var(--color-border-strong)" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="allowance" content={renderAllowanceLabel} />
                    </Bar>

                    {/* Used (brand) */}
                    <Bar dataKey="used" fill={UI.brand} radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="used" content={renderLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            )}
          </Card>

          {/* Right column: Requested + Delete Requested */}
          <div className={layoutStyles.queueColumn}>
            {/*  Requested holidays */}
            <Card className={layoutStyles.queueCard}>
              <div className={layoutStyles.sectionHeader}>
                <div className={layoutStyles.extracted9}>
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
                <Badge variant={requestedHolidays.length ? "warning" : "success"}>
                  <Clock3 size={13} /> {requestedHolidays.length}
                </Badge>
              </div>

              {!isAdmin ? (
                <div style={{ color: UI.muted, fontSize: 13, padding: "6px 2px" }}>
                  You can review requests here, but only admins can approve or decline them.
                </div>
              ) : null}

              {requestedHolidays.length === 0 ? (
                <EmptyState
                  title="Approval queue clear"
                  description={`There are no pending holiday requests for ${yearView}.`}
                  icon={<CheckCircle2 size={24} />}
                  className={layoutStyles.queueEmpty}
                />
              ) : (
                <div className={layoutStyles.extracted10}>
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
                      <article
                        key={h.id}
                        className={layoutStyles.requestItem}
                      >
                        <div
                          className={layoutStyles.extracted11}
                        >
                          <div style={{ fontWeight: 900, color: UI.text }}>
                            {h.employee || h.employeeCode || "Unknown"}
                          </div>
                          <Badge variant={norm(type).includes("unpaid") ? "warning" : "info"}>{type}</Badge>
                        </div>

                        <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                          {fmt(fromD)} to {fmt(toD)}
                          {typeHint ? (
                            <span style={{ marginLeft: 8, fontWeight: 900, color: UI.text }}>
                              - {typeHint}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: 4, color: UI.muted, fontSize: 12.5 }}>
                          Requested by:{" "}
                          <span style={{ fontWeight: 800, color: UI.text }}>{requestedBy}</span>
                        </div>

                        <div className={layoutStyles.extracted12}>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => isAdmin && updateStatus(h.id, "approved")}
                            disabled={!isAdmin}
                            title={!isAdmin ? "Admin only" : "Approve"}
                          >
                            <CheckCircle2 size={14} /> Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => isAdmin && updateStatus(h.id, "declined")}
                            disabled={!isAdmin}
                            title={!isAdmin ? "Admin only" : "Decline"}
                          >
                            <XCircle size={14} /> Decline
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => router.push("/holiday-usage")}
                          >
                            View usage <ChevronRight size={14} />
                          </Button>
                        </div>
                      </article>
                    );
                  })}

                  {requestedHolidays.length > 6 ? (
                    <div style={{ color: UI.muted, fontSize: 12, marginTop: 2 }}>
                      Showing 6 of {requestedHolidays.length}. Open Holiday Usage for the full list.
                    </div>
                  ) : null}
                </div>
              )}
            </Card>

            {/*  Delete requested holidays */}
            <Card className={layoutStyles.queueCard}>
              <div className={layoutStyles.sectionHeader}>
                <div className={layoutStyles.extracted14}>
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
                <Badge variant="warning">
                  <Trash2 size={13} /> {deleteRequestedHolidays.length}
                </Badge>
              </div>

              {!isAdmin ? (
                <div style={{ color: UI.muted, fontSize: 13, padding: "6px 2px" }}>
                  You can review delete requests here, but only admins can approve or decline them.
                </div>
              ) : null}

              {deleteRequestedHolidays.length === 0 ? (
                <EmptyState
                  title="No deletion requests"
                  description={`There are no holiday deletion requests for ${yearView}.`}
                  icon={<Trash2 size={24} />}
                  className={layoutStyles.queueEmpty}
                />
              ) : (
                <div className={layoutStyles.extracted15}>
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
                      <article
                        key={h.id}
                        className={layoutStyles.requestItem}
                      >
                        <div
                          className={layoutStyles.extracted16}
                        >
                          <div style={{ fontWeight: 900, color: UI.text }}>
                            {h.employee || h.employeeCode || "Unknown"}
                          </div>
                          <Badge variant={norm(type).includes("unpaid") ? "warning" : "info"}>{type}</Badge>
                        </div>

                        <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                          {fmt(fromD)} to {fmt(toD)}
                          {typeHint ? (
                            <span style={{ marginLeft: 8, fontWeight: 900, color: UI.text }}>
                              - {typeHint}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: 8, color: UI.muted, fontSize: 12 }}>
                          Requested by: <b style={{ color: UI.text }}>{h.deleteRequestedBy || "-"}</b>
                        </div>

                        <div className={layoutStyles.extracted17}>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => isAdmin && approveDelete(h)}
                            disabled={!isAdmin}
                            title={!isAdmin ? "Admin only" : "Approve delete"}
                          >
                            <CheckCircle2 size={14} /> Approve delete
                          </Button>

                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => isAdmin && declineDelete(h)}
                            disabled={!isAdmin}
                            title={!isAdmin ? "Admin only" : "Decline delete"}
                          >
                            <XCircle size={14} /> Decline
                          </Button>

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => router.push("/holiday-usage")}
                          >
                            View usage <ChevronRight size={14} />
                          </Button>
                        </div>
                      </article>
                    );
                  })}

                  {deleteRequestedHolidays.length > 6 ? (
                    <div style={{ color: UI.muted, fontSize: 12, marginTop: 2 }}>
                      Showing 6 of {deleteRequestedHolidays.length}. Open Holiday Usage for the full list.
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* HR Docs */}
        <section className={layoutStyles.shortcutsSection}>
          <div className={layoutStyles.shortcutsHeader}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: UI.text }}>HR Shortcuts</div>
              <div style={hint}>Open related operational pages.</div>
            </div>
            <Badge>
              <FileText size={13} /> {documents.length} links
            </Badge>
          </div>

          <div className={layoutStyles.shortcutGrid}>
            {documents.map((d) => {
              const Icon = d.icon || FileText;
              return (
              <NavigationCard
                key={d.key}
                icon={<Icon size={20} />}
                title={d.title}
                description={d.description}
                onClick={() => {
                  if (d.key === "holidayForm") return setHolidayModalOpen(true);
                  router.push(d.link);
                }}
              />
              );
            })}
          </div>
        </section>
      </PeopleFleetPage>
    </HeaderSidebarLayout>
  );
}
