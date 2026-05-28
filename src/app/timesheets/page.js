"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileClock,
  Filter,
  PencilLine,
  RefreshCcw,
  Search,
  UserRound,
  Users,
} from "lucide-react";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const LUNCH_DEDUCT_HRS = 0.5;

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatWeekRange(mondayStr) {
  const monday = new Date(mondayStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })} - ${sunday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function formatWeekEnding(mondayStr) {
  const monday = new Date(mondayStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday.toLocaleDateString("en-GB");
}

function toMillis(val) {
  if (!val) return 0;

  if (typeof val?.toDate === "function") {
    const d = val.toDate();
    return d.getTime();
  }

  if (val instanceof Date) return val.getTime();

  if (typeof val === "object" && typeof val.seconds === "number") {
    return val.seconds * 1000;
  }

  if (typeof val === "string") {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  return 0;
}

function toMinutes(val) {
  if (!val || typeof val !== "string") return null;
  const m = val.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function diffHours(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return 0;

  let d = (e - s) / 60;
  if (d < 0) d += 24;
  return Math.max(0, d);
}

function extractYardSegments(entry) {
  if (Array.isArray(entry?.yardSegments)) return entry.yardSegments;
  if (entry?.leaveTime && entry?.arriveBack) return [{ start: entry.leaveTime, end: entry.arriveBack }];
  if (entry?.start && entry?.end) return [{ start: entry.start, end: entry.end }];
  return [];
}

function shouldDeductYardLunch(entry) {
  if (!entry) return true;
  if (entry?.managerLunchDeduct === true) return true;
  if (entry?.managerLunchDeduct === false) return false;
  if (entry?.yardLunchDeduct === false) return false;
  if (entry?.yardLunchSup === true || entry?.lunchSup === true) return false;
  if (entry?.noLunch === true || entry?.skipLunch === true) return false;
  if (entry?.lunchTaken === false || entry?.lunch === false) return false;
  if (entry?.lunchTaken === true || entry?.lunch === true) return true;
  return true;
}

function computeYardHours(entry) {
  const segs = extractYardSegments(entry);
  let total = 0;
  segs.forEach((s) => {
    total += diffHours(s.start, s.end);
  });
  if (total > 0 && shouldDeductYardLunch(entry)) total -= LUNCH_DEDUCT_HRS;
  return Math.max(0, total);
}

function computeTravelHours(entry) {
  return diffHours(entry?.leaveTime, entry?.arriveTime);
}

function getPrecallHours(entry) {
  const value = Number(entry?.precallDuration);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / 60;
}

function computeOnSetBreakdown(entry) {
  const travelToHrs = computeTravelHours(entry);
  const preCallHrs = getPrecallHours(entry);
  const callToWrapHrs =
    entry?.callTime && entry?.wrapTime ? diffHours(entry.callTime, entry.wrapTime) : 0;

  if (entry?.callTime) {
    const callToFinishHrs = entry?.arriveBack
      ? diffHours(entry.callTime, entry.arriveBack)
      : entry?.wrapTime
      ? diffHours(entry.callTime, entry.wrapTime)
      : 0;

    const onSetPaidHrs = 10;
    const extraAfterTenHrs = Math.max(0, callToFinishHrs - onSetPaidHrs);

    return {
      totalHrs: travelToHrs + preCallHrs + onSetPaidHrs + extraAfterTenHrs,
    };
  }

  const fallbackWindowHrs =
    entry?.leaveTime && entry?.arriveBack ? diffHours(entry.leaveTime, entry.arriveBack) : 0;
  const legacyOnSetHrs = callToWrapHrs || fallbackWindowHrs;

  return {
    totalHrs: Math.max(0, legacyOnSetHrs + preCallHrs),
  };
}

function computeOnSetHours(entry) {
  return computeOnSetBreakdown(entry).totalHrs;
}

function isTurnaroundDay(entry) {
  if (!entry) return false;
  if (entry.isTurnaround === true && String(entry.mode || "yard").toLowerCase() === "yard") return true;
  if (entry.turnaround === true || entry.turnaroundDay === true) return true;
  return false;
}

function computeTurnaroundHours(entry) {
  const segs = extractYardSegments(entry);
  if (!segs?.length) return 0;
  let total = 0;
  segs.forEach((s) => {
    total += diffHours(s.start, s.end);
  });
  return Math.max(0, total);
}

function detectMode(entry, isWeekend) {
  if (!entry) return isWeekend ? "off" : "missing";
  const rawMode = String(entry.mode || "yard").toLowerCase();
  if (rawMode === "holiday") return "holiday";
  if (rawMode === "bankholiday") return "bankholiday";
  if (rawMode === "off") return "off";
  if (rawMode === "yard" && isTurnaroundDay(entry)) return "turnaround";
  if (rawMode === "travel") return "travel";
  if (rawMode === "onset") return "onset";
  if (rawMode === "yard") return "yard";
  return "yard";
}

function normaliseDays(daysObj) {
  const out = {};
  DAYS.forEach((day) => {
    out[day] = daysObj?.[day] ?? null;
  });
  return out;
}

function getTimesheetWeekHours(ts) {
  const explicitTotal = Number(ts?.weeklyTotal ?? ts?.totalHours ?? ts?.totalHrs);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) return explicitTotal;

  const dayMap = normaliseDays(ts?.days);
  return DAYS.reduce((total, day) => {
    const entry = dayMap[day];
    if (!entry) return total;
    const mode = detectMode(entry, day === "Saturday" || day === "Sunday");
    if (mode === "yard") return total + computeYardHours(entry);
    if (mode === "travel") return total + computeTravelHours(entry);
    if (mode === "onset") return total + computeOnSetHours(entry);
    if (mode === "turnaround") return total + computeTurnaroundHours(entry);
    return total;
  }, 0);
}

function formatHoursCompact(value) {
  const hrs = Number(value || 0);
  if (!Number.isFinite(hrs) || hrs <= 0) return "0 hrs";
  const rounded = Math.round(hrs * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} hrs`;
}

function parseWindowOffset(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function getTimesheetUpdatedMs(ts) {
  return (
    toMillis(ts.updatedAt) ||
    toMillis(ts.submittedAt) ||
    toMillis(ts.createdAt) ||
    toMillis(ts.weekStart) ||
    0
  );
}

function getTimesheetStatus(ts) {
  if (!ts) {
    return {
      key: "missing",
      label: "Missing",
      helper: "No saved timesheet for this week.",
      text: "#9f1239",
      bg: "#fff1f2",
      border: "#fecdd3",
      accent: "#e11d48",
      clickable: false,
    };
  }

  const approved =
    String(ts.status || "").toLowerCase() === "approved" ||
    ts.approved === true ||
    !!ts.approvedAt;

  if (approved) {
    return {
      key: "approved",
      label: "Approved",
      helper: "Approved and closed for review.",
      text: "#166534",
      bg: "#dcfce7",
      border: "#86efac",
      accent: "#16a34a",
      clickable: true,
    };
  }

  if (ts.submitted) {
    return {
      key: "submitted",
      label: "Submitted",
      helper: "Submitted and awaiting final review.",
      text: "#14532d",
      bg: "#ecfdf5",
      border: "#86efac",
      accent: "#22c55e",
      clickable: true,
    };
  }

  return {
    key: "draft",
    label: "Draft",
    helper: "Saved but not submitted by the employee.",
    text: "#92400e",
    bg: "#fffbeb",
    border: "#fcd34d",
    accent: "#f59e0b",
    clickable: true,
  };
}

const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  bg: "#f3f6f9",
  card: "#ffffff",
  ink: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  border: "1px solid #d7dee8",
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  green: "#15803d",
  greenSoft: "#ecfdf3",
  greenBorder: "#bbf7d0",
  amber: "#b45309",
  amberSoft: "#fffbeb",
  amberBorder: "#fde68a",
  red: "#b91c1c",
  redSoft: "#fff1f2",
  redBorder: "#fecdd3",
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

const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const h1 = { fontSize: 22, fontWeight: 750, lineHeight: 1.08, letterSpacing: 0, margin: 0, color: UI.ink };
const sub = { marginTop: 6, marginBottom: 0, fontSize: 13.5, lineHeight: 1.45, color: UI.muted, maxWidth: 760 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const cardStyle = { ...surface, padding: 12 };

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};

const titleMd = { fontSize: 17, fontWeight: 800, color: UI.ink, margin: 0, letterSpacing: 0 };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };

const labelStyle = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  marginBottom: 6,
};

const chip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
    border: `1px solid ${UI.brandBorder}`,
    background: UI.brandSoft,
    color: UI.ink,
  };
  if (kind === "green") return { ...base, borderColor: UI.greenBorder, background: UI.greenSoft, color: UI.green };
  if (kind === "amber") return { ...base, borderColor: UI.amberBorder, background: UI.amberSoft, color: UI.amber };
  if (kind === "red") return { ...base, borderColor: UI.redBorder, background: UI.redSoft, color: UI.red };
  return base;
};

const btn = (kind = "ghost") => {
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
  if (kind === "primary") {
    return {
      ...base,
      border: `1px solid ${UI.brand}`,
      background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
      color: "#fff",
      boxShadow: "0 8px 18px rgba(31,75,122,0.16)",
    };
  }
  return {
    ...base,
    border: `1px solid ${UI.brandBorder}`,
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
    color: UI.ink,
    boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
  };
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

const statCard = {
  ...cardStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minHeight: 82,
};

const statLabel = {
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
};

const statValue = {
  color: UI.ink,
  fontSize: 25,
  lineHeight: 1.1,
  fontWeight: 850,
  marginTop: 8,
};

const focusCss = `
  input:focus, select:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
  button:disabled { opacity: .55; cursor: not-allowed; }
  @media (max-width: 1180px) {
    .timesheet-filter-grid,
    .timesheet-stat-grid { grid-template-columns: 1fr !important; }
  }
`;

function countStatuses(timesheets, weeks) {
  const summary = { approved: 0, submitted: 0, draft: 0, missing: 0 };

  weeks.forEach((week) => {
    const ts = timesheets.find((item) => item.weekStart === week);
    const status = getTimesheetStatus(ts).key;
    summary[status] += 1;
  });

  return summary;
}

export default function TimesheetListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approvingId, setApprovingId] = useState("");

  const [searchTerm, setSearchTerm] = useState(() => searchParams?.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams?.get("status") || "all");
  const [weekFilter, setWeekFilter] = useState(() => searchParams?.get("week") || "all");
  const [sortBy, setSortBy] = useState(() => searchParams?.get("sort") || "attention");
  const [weekWindowOffset, setWeekWindowOffset] = useState(() =>
    parseWindowOffset(searchParams?.get("wo"))
  );

  const updateFiltersInUrl = (updates = {}, options = {}) => {
    const { history = "replace" } = options;
    const next = new URLSearchParams(searchParams?.toString() || "");
    const merged = {
      q: updates.q ?? next.get("q") ?? "",
      status: updates.status ?? next.get("status") ?? "all",
      week: updates.week ?? next.get("week") ?? "all",
      sort: updates.sort ?? next.get("sort") ?? "attention",
      wo: updates.wo ?? next.get("wo") ?? 0,
    };

    const applyParam = (key, value, defaultValue = "") => {
      const normalized = String(value ?? "");
      if (!normalized || normalized === String(defaultValue)) next.delete(key);
      else next.set(key, normalized);
    };

    applyParam("q", merged.q, "");
    applyParam("status", merged.status, "all");
    applyParam("week", merged.week, "all");
    applyParam("sort", merged.sort, "attention");
    applyParam("wo", merged.wo, "0");

    const qs = next.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    const current = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (target === current) return;

    if (history === "push") {
      router.push(target, { scroll: false });
      return;
    }
    router.replace(target, { scroll: false });
  };

  const handleApproveTimesheet = async (event, ts) => {
    event.stopPropagation();
    if (!ts?.id || approvingId) return;

    setApprovingId(ts.id);
    setError("");

    try {
      await updateDoc(doc(db, "timesheets", ts.id), {
        status: "approved",
        approved: true,
        approvedAt: serverTimestamp(),
      });

      setGrouped((prev) => {
        const next = {};
        Object.entries(prev).forEach(([code, emp]) => {
          next[code] = {
            ...emp,
            timesheets: emp.timesheets.map((item) =>
              item.id === ts.id
                ? {
                    ...item,
                    status: "approved",
                    approved: true,
                    approvedAt: new Date(),
                  }
                : item
            ),
          };
        });
        return next;
      });
    } catch (err) {
      console.error("Error approving timesheet:", err);
      setError("Unable to approve that timesheet. Please try again.");
    } finally {
      setApprovingId("");
    }
  };

  const weekOptions = useMemo(
    () =>
      [...Array(26)].map((_, i) => {
        const monday = getMonday(new Date());
        monday.setDate(monday.getDate() - 7 * i);
        return monday.toISOString().split("T")[0];
      }),
    []
  );

  const windowWeeks = useMemo(
    () => weekOptions.slice(weekWindowOffset, weekWindowOffset + 4),
    [weekOptions, weekWindowOffset]
  );

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const [empSnap, tsSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "timesheets")),
        ]);

        const employees = empSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const timesheets = tsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const latestMap = {};
        timesheets.forEach((ts) => {
          const key = `${ts.employeeCode || "unknown"}_${ts.weekStart || "unknown"}`;
          const current = latestMap[key];
          if (!current || getTimesheetUpdatedMs(ts) > getTimesheetUpdatedMs(current)) {
            latestMap[key] = ts;
          }
        });

        const deduped = Object.values(latestMap);
        const groupedByEmp = {};
        const employeeByCode = {};
        const employeeByName = {};

        employees.forEach((emp) => {
          const code = emp.userCode || emp.employeeCode || emp.code || "";
          if (!code) return;

          groupedByEmp[code] = {
            name: emp.name || "Unnamed employee",
            code,
            employeeId: emp.id,
            timesheets: [],
          };

          [emp.userCode, emp.employeeCode, emp.code]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .forEach((value) => {
              employeeByCode[value.toLowerCase()] = groupedByEmp[code];
            });

          [emp.name, emp.fullName, emp.employeeName]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .forEach((value) => {
              employeeByName[value.toLowerCase()] = groupedByEmp[code];
            });
        });

        deduped.forEach((ts) => {
          const storedCode = String(ts.employeeCode || "").trim();
          const storedName = String(ts.employeeName || "").trim();
          const matchedEmployee =
            employeeByCode[storedCode.toLowerCase()] ||
            employeeByName[storedName.toLowerCase()] ||
            null;
          const code = matchedEmployee?.code || storedCode || "unknown";

          if (!groupedByEmp[code]) {
            groupedByEmp[code] = {
              name: ts.employeeName || "Unknown employee",
              code,
              employeeId: null,
              timesheets: [],
            };
          }
          groupedByEmp[code].timesheets.push(ts);
        });

        Object.values(groupedByEmp).forEach((emp) => {
          emp.timesheets.sort(
            (a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
          );
        });

        setGrouped(groupedByEmp);
      } catch (err) {
        console.error("Error loading timesheets:", err);
        setError("Unable to load timesheet data right now.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const q = searchParams?.get("q") || "";
    const status = searchParams?.get("status") || "all";
    const week = searchParams?.get("week") || "all";
    const sort = searchParams?.get("sort") || "attention";
    const wo = parseWindowOffset(searchParams?.get("wo"));

    if (q !== searchTerm) setSearchTerm(q);
    if (status !== statusFilter) setStatusFilter(status);
    if (week !== weekFilter) setWeekFilter(week);
    if (sort !== sortBy) setSortBy(sort);
    if (wo !== weekWindowOffset) setWeekWindowOffset(wo);
    // Intentionally sync from URL changes only; local setters update the URL separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const displayedWeeks = useMemo(
    () => (weekFilter === "all" ? windowWeeks : [weekFilter]),
    [weekFilter, windowWeeks]
  );
  const employees = useMemo(() => Object.values(grouped), [grouped]);

  useEffect(() => {
    if (weekFilter === "all") return;
    const index = weekOptions.indexOf(weekFilter);
    if (index === -1) return;
    if (index < weekWindowOffset || index >= weekWindowOffset + 4) {
      setWeekWindowOffset(index);
    }
  }, [weekFilter, weekOptions, weekWindowOffset]);

  const filteredEmployees = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const filtered = employees.filter((emp) => {
      const matchesSearch =
        !search ||
        (emp.name || "").toLowerCase().includes(search) ||
        (emp.code || "").toLowerCase().includes(search);

      const summary = countStatuses(emp.timesheets, weekOptions);

      let matchesStatus = true;
      if (statusFilter === "approved") matchesStatus = summary.approved > 0;
      if (statusFilter === "submitted") matchesStatus = summary.submitted > 0;
      if (statusFilter === "draft") matchesStatus = summary.draft > 0;
      if (statusFilter === "missing") matchesStatus = summary.missing > 0;
      if (statusFilter === "attention") {
        matchesStatus = summary.submitted > 0 || summary.draft > 0 || summary.missing > 0;
      }

      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      const aSummary = countStatuses(a.timesheets, displayedWeeks);
      const bSummary = countStatuses(b.timesheets, displayedWeeks);
      const aLatest = Math.max(0, ...a.timesheets.map(getTimesheetUpdatedMs));
      const bLatest = Math.max(0, ...b.timesheets.map(getTimesheetUpdatedMs));

      if (sortBy === "name") {
        return (a.name || "").localeCompare(b.name || "");
      }

      if (sortBy === "recent") {
        return bLatest - aLatest;
      }

      const score = (summary) =>
        summary.missing * 4 + summary.draft * 3 + summary.submitted * 2 + summary.approved;

      return score(bSummary) - score(aSummary) || (a.name || "").localeCompare(b.name || "");
    });

    return filtered;
  }, [displayedWeeks, employees, searchTerm, sortBy, statusFilter, weekOptions]);

  const overview = useMemo(
    () =>
      filteredEmployees.reduce(
        (acc, emp) => {
          acc.employees += 1;
          const summary = countStatuses(emp.timesheets, displayedWeeks);
          acc.approved += summary.approved;
          acc.submitted += summary.submitted;
          acc.draft += summary.draft;
          acc.missing += summary.missing;
          return acc;
        },
        { employees: 0, approved: 0, submitted: 0, draft: 0, missing: 0 }
      ),
    [displayedWeeks, filteredEmployees]
  );

  const inputStyle = {
    width: "100%",
    minHeight: 36,
    padding: "7px 9px",
    borderRadius: UI.radiusSm,
    border: UI.border,
    fontSize: 13,
    background: "#fff",
    outline: "none",
    color: UI.ink,
  };

  const metricCards = [
    { label: "Employees in view", value: overview.employees, icon: Users, color: UI.brand, bg: UI.brandSoft, border: UI.brandBorder },
    { label: "Submitted", value: overview.submitted, icon: FileClock, color: UI.green, bg: UI.greenSoft, border: UI.greenBorder },
    { label: "Approved", value: overview.approved, icon: CheckCircle2, color: UI.green, bg: UI.greenSoft, border: UI.greenBorder },
    { label: "Draft", value: overview.draft, icon: PencilLine, color: UI.amber, bg: UI.amberSoft, border: UI.amberBorder },
    { label: "Missing", value: overview.missing, icon: AlertTriangle, color: UI.red, bg: UI.redSoft, border: UI.redBorder },
  ];
  const compactReviewView = !!searchTerm.trim() || statusFilter !== "all" || sortBy === "name";

  const canGoToNewerWindow = weekFilter === "all" ? weekWindowOffset > 0 : weekOptions.indexOf(weekFilter) > 0;
  const canGoToOlderWindow =
    weekFilter === "all"
      ? weekWindowOffset + 4 < weekOptions.length
      : (() => {
          const index = weekOptions.indexOf(weekFilter);
          return index !== -1 && index < weekOptions.length - 1;
        })();

  const handleWeekWindowBack = () => {
    if (weekFilter === "all") {
      const next = Math.min(weekWindowOffset + 1, Math.max(0, weekOptions.length - 4));
      setWeekWindowOffset(next);
      updateFiltersInUrl({ wo: next }, { history: "push" });
      return;
    }

    const currentIndex = weekOptions.indexOf(weekFilter);
    if (currentIndex === -1 || currentIndex >= weekOptions.length - 1) return;
    const nextWeek = weekOptions[currentIndex + 1];
    setWeekFilter(nextWeek);
    updateFiltersInUrl({ week: nextWeek }, { history: "push" });
  };

  const handleWeekWindowForward = () => {
    if (weekFilter === "all") {
      const next = Math.max(0, weekWindowOffset - 1);
      setWeekWindowOffset(next);
      updateFiltersInUrl({ wo: next }, { history: "push" });
      return;
    }

    const currentIndex = weekOptions.indexOf(weekFilter);
    if (currentIndex <= 0) return;
    const nextWeek = weekOptions[currentIndex - 1];
    setWeekFilter(nextWeek);
    updateFiltersInUrl({ week: nextWeek }, { history: "push" });
  };

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div style={pageWrap}>
        <div style={{ width: "100%", maxWidth: 1600, margin: "0 auto" }}>
          <div style={headerBar}>
            <div>
              <h1 style={h1}>Timesheet Submissions</h1>
              <p style={sub}>
                Review weekly submissions by employee, prioritise missing and draft weeks,
                and open any saved timesheet directly for approval follow-up.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {[
                { label: "Approved", bg: "#dcfce7", dot: "#16a34a" },
                { label: "Submitted", bg: "#ecfdf5", dot: "#22c55e" },
                { label: "Draft", bg: "#fffbeb", dot: "#f59e0b" },
                { label: "Missing", bg: "#fff1f2", dot: "#e11d48" },
              ].map((item) => (
                <span
                  key={item.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 9px",
                    borderRadius: 999,
                    background: item.bg,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "rgba(148,163,184,0.18)",
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#334155",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: item.dot,
                    }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <section style={{ ...cardStyle, padding: compactReviewView ? 10 : cardStyle.padding, marginBottom: UI.gap }}>
            <div style={sectionHeader}>
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <span style={iconBox(UI.brand, UI.brandSoft, UI.brandBorder)}>
                  <CalendarDays size={17} />
                </span>
                <div>
                  <h2 style={titleMd}>Timesheet Control</h2>
                  <div style={hint}>Weekly submission overview and review window.</div>
                </div>
              </div>
              <span style={chip()}>
                <CalendarDays size={13} />
                {weekFilter === "all"
                  ? `${formatWeekRange(displayedWeeks[0])} to ${formatWeekRange(
                      displayedWeeks[displayedWeeks.length - 1]
                    )}`
                  : formatWeekRange(weekFilter)}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: UI.gap }}>
              <button
                type="button"
                onClick={handleWeekWindowForward}
                disabled={!canGoToNewerWindow}
                style={{ ...btn("ghost"), cursor: canGoToNewerWindow ? "pointer" : "not-allowed" }}
              >
                <ChevronLeft size={14} /> Newer
              </button>
              <button
                type="button"
                onClick={handleWeekWindowBack}
                disabled={!canGoToOlderWindow}
                style={{ ...btn("ghost"), cursor: canGoToOlderWindow ? "pointer" : "not-allowed" }}
              >
                Older <ChevronRight size={14} />
              </button>
            </div>

            <div
              className="timesheet-stat-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                gap: compactReviewView ? 8 : UI.gap,
              }}
            >
              {metricCards.map((metric) => {
                const Icon = metric.icon;
                return (
                  <section
                    key={metric.label}
                    style={{
                      ...statCard,
                      minHeight: compactReviewView ? 52 : statCard.minHeight,
                      padding: compactReviewView ? 9 : statCard.padding,
                    }}
                  >
                    <div>
                      <div style={statLabel}>{metric.label}</div>
                      <div style={{ ...statValue, fontSize: compactReviewView ? 19 : statValue.fontSize, marginTop: compactReviewView ? 4 : statValue.marginTop }}>
                        {metric.value}
                      </div>
                    </div>
                    <span style={{ ...iconBox(metric.color, metric.bg, metric.border), width: compactReviewView ? 28 : 34, height: compactReviewView ? 28 : 34 }}>
                      <Icon size={17} />
                    </span>
                  </section>
                );
              })}
            </div>
          </section>

          <div
            className="timesheet-filter-grid"
            style={{
              ...cardStyle,
              marginBottom: UI.gap,
              display: "grid",
              gridTemplateColumns: "minmax(240px, 1.2fr) repeat(3, minmax(180px, 0.75fr)) auto",
              gap: UI.gap,
              alignItems: "end",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Search size={13} /> Search employee
                </span>
              </label>
              <input
                type="text"
                placeholder="Name or employee code"
                value={searchTerm}
                onChange={(e) => {
                  const next = e.target.value;
                  setSearchTerm(next);
                  updateFiltersInUrl({ q: next }, { history: "replace" });
                }}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Filter size={13} /> Status focus
                </span>
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  setStatusFilter(next);
                  updateFiltersInUrl({ status: next }, { history: "push" });
                }}
                style={inputStyle}
              >
                <option value="all">All employees</option>
                <option value="attention">Needs attention</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="draft">Draft only</option>
                <option value="missing">Missing weeks</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CalendarDays size={13} /> Reporting week
                </span>
              </label>
              <select
                value={weekFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  setWeekFilter(next);
                  updateFiltersInUrl({ week: next }, { history: "push" });
                }}
                style={inputStyle}
              >
                <option value="all">4-week window</option>
                {weekOptions.map((week) => (
                  <option key={week} value={week}>
                    {formatWeekRange(week)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <BarChart3 size={13} /> Sort by
                </span>
              </label>
              <select
                value={sortBy}
                onChange={(e) => {
                  const next = e.target.value;
                  setSortBy(next);
                  updateFiltersInUrl({ sort: next }, { history: "push" });
                }}
                style={inputStyle}
              >
                <option value="attention">Attention needed</option>
                <option value="recent">Recent activity</option>
                <option value="name">Employee name</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setWeekFilter("all");
                setWeekWindowOffset(0);
                setSortBy("attention");
                updateFiltersInUrl({
                  q: "",
                  status: "all",
                  week: "all",
                  wo: 0,
                  sort: "attention",
                }, { history: "push" });
              }}
              style={{ ...btn("ghost"), minHeight: 36 }}
            >
              <RefreshCcw size={14} /> Reset
            </button>
          </div>

          {loading ? (
            <div
              style={{
                ...cardStyle,
                padding: 18,
                color: UI.muted,
                fontSize: 14,
              }}
            >
              Loading timesheet submissions...
            </div>
          ) : error ? (
            <div
              style={{
                background: "#fff1f2",
                borderRadius: UI.radius,
                border: `1px solid ${UI.redBorder}`,
                padding: 18,
                color: UI.red,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div
              style={{
                ...cardStyle,
                padding: 18,
                color: UI.muted,
                fontSize: 14,
              }}
            >
              No matching employees found. Try widening the filters or clearing the search.
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const summary = countStatuses(emp.timesheets, displayedWeeks);

              return (
                <div
                  key={emp.code}
                  style={{
                    ...cardStyle,
                    padding: compactReviewView ? 9 : 14,
                    marginBottom: compactReviewView ? 8 : UI.gap,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: compactReviewView ? "center" : "flex-start",
                      gap: compactReviewView ? 8 : 10,
                      flexWrap: "wrap",
                      marginBottom: compactReviewView ? 8 : 12,
                    }}
                  >
                    <div style={{ display: "flex", gap: compactReviewView ? 7 : 10, minWidth: 0, alignItems: "center" }}>
                      <span
                        style={{
                          ...iconBox(UI.brand, UI.brandSoft, UI.brandBorder),
                          width: compactReviewView ? 28 : 34,
                          height: compactReviewView ? 28 : 34,
                        }}
                      >
                        <UserRound size={17} />
                      </span>
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <h2
                            style={{
                              fontSize: compactReviewView ? 15 : 18,
                              fontWeight: 800,
                              margin: 0,
                              color: UI.ink,
                            }}
                          >
                            {emp.name || "Unknown employee"}
                          </h2>
                          <span style={{ ...chip(), padding: compactReviewView ? "3px 7px" : "5px 9px", fontSize: compactReviewView ? 11 : 12, color: UI.brand }}>
                            {emp.code || "No code"}
                          </span>
                        </div>
                        {!compactReviewView ? (
                          <p
                            style={{
                              margin: "4px 0 0",
                              color: UI.muted,
                              fontSize: 12,
                            }}
                          >
                            {displayedWeeks.length === 1
                              ? "Single-week review window"
                              : `Reviewing ${displayedWeeks.length} weekly slots for this employee`}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: compactReviewView ? 5 : 8,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      {[
                        {
                          label: "Approved",
                          value: summary.approved,
                          bg: "#dcfce7",
                          color: "#166534",
                        },
                        {
                          label: "Submitted",
                          value: summary.submitted,
                          bg: "#ecfdf5",
                          color: "#166534",
                        },
                        {
                          label: "Draft",
                          value: summary.draft,
                          bg: "#fffbeb",
                          color: "#92400e",
                        },
                        {
                          label: "Missing",
                          value: summary.missing,
                          bg: "#fff1f2",
                          color: "#9f1239",
                        },
                      ].map((item) => (
                        item.value > 0 || !compactReviewView ? (
                        <span
                          key={item.label}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: compactReviewView ? "3px 7px" : "6px 10px",
                            borderRadius: 999,
                            background: item.bg,
                            color: item.color,
                            fontSize: compactReviewView ? 10.5 : 11,
                            fontWeight: 700,
                          }}
                        >
                          {item.label}
                          <span>{item.value}</span>
                        </span>
                        ) : null
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: compactReviewView
                        ? "repeat(auto-fit, minmax(210px, 1fr))"
                        : "repeat(auto-fit, minmax(250px, 1fr))",
                      gap: compactReviewView ? 7 : 12,
                    }}
                  >
                    {displayedWeeks.map((weekStart) => {
                      const ts = emp.timesheets.find((t) => t.weekStart === weekStart);
                      const status = getTimesheetStatus(ts);
                      const lastUpdateMs = ts ? getTimesheetUpdatedMs(ts) : 0;
                      const weeklyHours = ts ? getTimesheetWeekHours(ts) : 0;
                      const showWeeklyHours = !!ts && (ts.submitted || status.key === "approved");
                      const canApprove = !!ts && status.key === "submitted";
                      const isApproving = approvingId === ts?.id;
                      const lastUpdateText =
                        lastUpdateMs > 0
                          ? new Date(lastUpdateMs).toLocaleString("en-GB")
                          : "No activity recorded";

                      return (
                        <div
                          key={weekStart}
                          onClick={() => ts && router.push(`/timesheet-id/${ts.id}`)}
                          style={{
                            background: "#ffffff",
                            borderRadius: UI.radius,
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: status.border,
                            boxShadow: UI.shadowSm,
                            padding: compactReviewView ? 8 : 12,
                            cursor: status.clickable ? "pointer" : "default",
                            transition: "transform 0.12s ease, box-shadow 0.12s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!status.clickable) return;
                            e.currentTarget.style.transform = "translateY(-1px)";
                            e.currentTarget.style.boxShadow = UI.shadowHover;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "none";
                            e.currentTarget.style.boxShadow = UI.shadowSm;
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: compactReviewView ? 6 : 8,
                              alignItems: compactReviewView ? "center" : "flex-start",
                            }}
                          >
                            <div style={{ display: "flex", gap: compactReviewView ? 6 : 8, minWidth: 0, alignItems: "center" }}>
                              <span
                                style={{
                                  ...iconBox(status.text, status.bg, status.border),
                                  width: compactReviewView ? 26 : 34,
                                  height: compactReviewView ? 26 : 34,
                                }}
                              >
                                <FileCheck2 size={15} />
                              </span>
                              <div>
                                <div
                                  style={{
                                    fontSize: compactReviewView ? 12.5 : 14,
                                    fontWeight: 800,
                                    color: UI.ink,
                                    lineHeight: 1.2,
                                  }}
                                >
                                  {formatWeekRange(weekStart)}
                                </div>
                                <div
                                  style={{
                                    marginTop: compactReviewView ? 1 : 3,
                                    fontSize: compactReviewView ? 10.5 : 11,
                                    color: UI.muted,
                                  }}
                                >
                                  Week ending {formatWeekEnding(weekStart)}
                                </div>
                              </div>
                            </div>

                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: compactReviewView ? "4px 7px" : "5px 9px",
                                borderRadius: 999,
                                background: status.bg,
                                color: status.text,
                                fontSize: compactReviewView ? 10.5 : 11,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                            >
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 999,
                                  background: status.accent,
                                }}
                              />
                              {status.label}
                            </span>
                          </div>

                          <div
                            style={{
                              marginTop: compactReviewView ? 6 : 10,
                              display: "grid",
                              gap: compactReviewView ? 4 : 6,
                            }}
                          >
                            {!compactReviewView ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: UI.muted,
                                  lineHeight: 1.35,
                                }}
                              >
                                {status.helper}
                              </div>
                            ) : null}

                            <div
                              style={{
                                display: compactReviewView ? "flex" : "grid",
                                gap: compactReviewView ? 8 : 4,
                                alignItems: compactReviewView ? "center" : "initial",
                                justifyContent: compactReviewView ? "space-between" : "initial",
                                padding: compactReviewView ? "6px 7px" : "10px 11px",
                                borderRadius: UI.radius,
                                background: "#f8fbfd",
                                border: UI.border,
                              }}
                            >
                              {!compactReviewView ? (
                                <>
                                  <div style={{ fontSize: 11, color: UI.muted }}>Timesheet ID</div>
                                  <div
                                    style={{
                                      fontFamily:
                                        "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                      fontSize: 11,
                                      color: UI.ink,
                                      wordBreak: "break-all",
                                    }}
                                  >
                                    {ts?.id || "Not created"}
                                  </div>
                                  <div style={{ fontSize: 11, color: UI.muted, marginTop: 2 }}>
                                    Last update
                                  </div>
                                </>
                              ) : null}
                              <div style={{ fontSize: compactReviewView ? 10.5 : 11, color: UI.ink }}>
                                {compactReviewView
                                  ? status.key === "missing"
                                    ? status.helper
                                    : `Updated ${lastUpdateText.replace(/:\d{2}$/, "")}`
                                  : lastUpdateText}
                              </div>
                              {showWeeklyHours ? (
                                <>
                                  {!compactReviewView ? (
                                    <div style={{ fontSize: 11, color: UI.muted, marginTop: 2 }}>
                                    Weekly hours
                                    </div>
                                  ) : null}
                                  <div style={{ fontSize: compactReviewView ? 11 : 11, color: UI.ink, fontWeight: 800 }}>
                                    {formatHoursCompact(weeklyHours)}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop: compactReviewView ? 6 : 10,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: status.clickable ? UI.brand : UI.muted,
                              }}
                            >
                              {status.clickable ? "Open timesheet" : "Awaiting submission"}
                            </span>
                            {canApprove ? (
                              <button
                                type="button"
                                onClick={(event) => handleApproveTimesheet(event, ts)}
                                disabled={isApproving}
                                style={{
                                  ...btn("primary"),
                                  padding: compactReviewView ? "5px 8px" : "6px 10px",
                                  fontSize: compactReviewView ? 11.5 : 12.5,
                                  borderColor: "#047857",
                                  background: isApproving
                                    ? UI.greenSoft
                                    : "linear-gradient(180deg, #22c55e 0%, #15803d 100%)",
                                  color: isApproving ? UI.green : "#ffffff",
                                  boxShadow: isApproving
                                    ? UI.shadowSm
                                    : "0 8px 18px rgba(21,128,61,0.22)",
                                }}
                              >
                                <CheckCircle2 size={14} />
                                {isApproving ? "Approving..." : "Approve"}
                              </button>
                            ) : (
                              <span
                                style={{
                                  fontSize: 16,
                                  fontWeight: 800,
                                  color: status.clickable ? UI.brand : "#94a3b8",
                                }}
                              >
                                {status.clickable ? <ChevronRight size={16} /> : "-"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
