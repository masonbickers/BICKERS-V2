"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

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
  radius: 18,
  radiusSm: 12,
  bg: "#edf3f8",
  panelTint: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  ink: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  borderColor: "#dbe2ea",
  shadowSm: "0 12px 32px rgba(15,23,42,0.07)",
};

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

  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");
  const [sortBy, setSortBy] = useState("attention");
  const [weekWindowOffset, setWeekWindowOffset] = useState(0);

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

        employees.forEach((emp) => {
          const code = emp.userCode || emp.code || "";
          if (!code) return;

          groupedByEmp[code] = {
            name: emp.name || "Unnamed employee",
            code,
            employeeId: emp.id,
            timesheets: [],
          };
        });

        deduped.forEach((ts) => {
          const code = ts.employeeCode || "unknown";
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
    padding: "10px 12px",
    borderRadius: UI.radiusSm,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: UI.borderColor,
    fontSize: 13,
    background: "#f8fbfd",
    outline: "none",
    color: UI.ink,
  };

  const metricCards = [
    { label: "Employees in view", value: overview.employees },
    { label: "Submitted for review", value: overview.submitted },
    { label: "Approved", value: overview.approved },
    { label: "Draft only", value: overview.draft },
    { label: "Missing weeks", value: overview.missing },
  ];

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
      setWeekWindowOffset((prev) => Math.min(prev + 1, Math.max(0, weekOptions.length - 4)));
      return;
    }

    const currentIndex = weekOptions.indexOf(weekFilter);
    if (currentIndex === -1 || currentIndex >= weekOptions.length - 1) return;
    setWeekFilter(weekOptions[currentIndex + 1]);
  };

  const handleWeekWindowForward = () => {
    if (weekFilter === "all") {
      setWeekWindowOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    const currentIndex = weekOptions.indexOf(weekFilter);
    if (currentIndex <= 0) return;
    setWeekFilter(weekOptions[currentIndex - 1]);
  };

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          flex: 1,
          minHeight: "100vh",
          background: UI.bg,
          color: UI.ink,
          padding: "22px 18px 34px",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        <div style={{ width: "100%", maxWidth: 1600, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>
                Timesheet Submissions
              </h1>
              <p
                style={{
                  marginTop: 6,
                  marginBottom: 0,
                  fontSize: 13,
                  color: UI.muted,
                  maxWidth: 760,
                }}
              >
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
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: item.bg,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "rgba(148,163,184,0.18)",
                    fontSize: 11,
                    fontWeight: 700,
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

          <div
            style={{
              background: "linear-gradient(135deg, #17324f 0%, #234a71 100%)",
              borderRadius: UI.radius,
              color: "#ffffff",
              padding: 16,
              boxShadow: UI.shadowSm,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.72)",
                  }}
                >
                  Timesheet control
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
                  Weekly submission overview
                </div>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 11px",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.08)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Window:
                <span>
                  {weekFilter === "all"
                    ? `${formatWeekRange(displayedWeeks[0])} to ${formatWeekRange(
                        displayedWeeks[displayedWeeks.length - 1]
                      )}`
                    : formatWeekRange(weekFilter)}
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <button
                type="button"
                onClick={handleWeekWindowForward}
                disabled={!canGoToNewerWindow}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: canGoToNewerWindow ? "pointer" : "not-allowed",
                  opacity: canGoToNewerWindow ? 1 : 0.45,
                }}
              >
                {"<- Newer"}
              </button>
              <button
                type="button"
                onClick={handleWeekWindowBack}
                disabled={!canGoToOlderWindow}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: canGoToOlderWindow ? "pointer" : "not-allowed",
                  opacity: canGoToOlderWindow ? 1 : 0.45,
                }}
              >
                {"Older ->"}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 10,
              }}
            >
              {metricCards.map((card) => (
                <div
                  key={card.label}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: 700,
                    }}
                  >
                    {card.label}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
                    {card.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: UI.panelTint,
              padding: 14,
              borderRadius: UI.radius,
              boxShadow: UI.shadowSm,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: UI.borderColor,
              marginBottom: 14,
              display: "grid",
              gridTemplateColumns: "minmax(240px, 1.2fr) repeat(3, minmax(180px, 0.75fr)) auto",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: UI.muted,
                  marginBottom: 5,
                }}
              >
                Search employee
              </label>
              <input
                type="text"
                placeholder="Name or employee code"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: UI.muted,
                  marginBottom: 5,
                }}
              >
                Status focus
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
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
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: UI.muted,
                  marginBottom: 5,
                }}
              >
                Reporting week
              </label>
              <select
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
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
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: UI.muted,
                  marginBottom: 5,
                }}
              >
                Sort by
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
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
              }}
              style={{
                padding: "10px 14px",
                borderRadius: UI.radiusSm,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: UI.borderColor,
                background: "#ffffff",
                color: UI.brand,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                minHeight: 41,
              }}
            >
              Reset filters
            </button>
          </div>

          {loading ? (
            <div
              style={{
                background: UI.panelTint,
                borderRadius: UI.radius,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: UI.borderColor,
                boxShadow: UI.shadowSm,
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
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "#fecdd3",
                padding: 18,
                color: "#9f1239",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div
              style={{
                background: UI.panelTint,
                borderRadius: UI.radius,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: UI.borderColor,
                boxShadow: UI.shadowSm,
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
                    background: UI.panelTint,
                    borderRadius: UI.radius,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: UI.borderColor,
                    boxShadow: UI.shadowSm,
                    padding: 14,
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 10,
                      flexWrap: "wrap",
                      marginBottom: 12,
                    }}
                  >
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
                            fontSize: 18,
                            fontWeight: 800,
                            margin: 0,
                            color: UI.ink,
                          }}
                        >
                          {emp.name || "Unknown employee"}
                        </h2>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: UI.brandSoft,
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: UI.brandBorder,
                            color: UI.brand,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {emp.code || "No code"}
                        </span>
                      </div>
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
                        <span
                          key={item.label}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: item.bg,
                            color: item.color,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {item.label}
                          <span>{item.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {displayedWeeks.map((weekStart) => {
                      const ts = emp.timesheets.find((t) => t.weekStart === weekStart);
                      const status = getTimesheetStatus(ts);
                      const lastUpdateMs = ts ? getTimesheetUpdatedMs(ts) : 0;
                      const weeklyHours = ts ? getTimesheetWeekHours(ts) : 0;
                      const showWeeklyHours = !!ts && (ts.submitted || status.key === "approved");
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
                            borderRadius: 14,
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: status.border,
                            boxShadow: "0 8px 22px rgba(15,23,42,0.05)",
                            padding: 13,
                            cursor: status.clickable ? "pointer" : "default",
                            transition: "transform 0.12s ease, box-shadow 0.12s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!status.clickable) return;
                            e.currentTarget.style.transform = "translateY(-1px)";
                            e.currentTarget.style.boxShadow = "0 14px 28px rgba(15,23,42,0.09)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "none";
                            e.currentTarget.style.boxShadow = "0 8px 22px rgba(15,23,42,0.05)";
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                              alignItems: "flex-start",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color: UI.ink,
                                  lineHeight: 1.2,
                                }}
                              >
                                {formatWeekRange(weekStart)}
                              </div>
                              <div
                                style={{
                                  marginTop: 3,
                                  fontSize: 11,
                                  color: UI.muted,
                                }}
                              >
                                Week starting {new Date(weekStart).toLocaleDateString("en-GB")}
                              </div>
                            </div>

                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 9px",
                                borderRadius: 999,
                                background: status.bg,
                                color: status.text,
                                fontSize: 11,
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
                              marginTop: 10,
                              display: "grid",
                              gap: 6,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                color: UI.muted,
                                lineHeight: 1.35,
                              }}
                            >
                              {status.helper}
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: 4,
                                padding: "10px 11px",
                                borderRadius: 12,
                                background: "#f8fbfd",
                                borderWidth: 1,
                                borderStyle: "solid",
                                borderColor: UI.borderColor,
                              }}
                            >
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
                              <div style={{ fontSize: 11, color: UI.ink }}>{lastUpdateText}</div>
                              {showWeeklyHours ? (
                                <>
                                  <div style={{ fontSize: 11, color: UI.muted, marginTop: 2 }}>
                                    Weekly hours
                                  </div>
                                  <div style={{ fontSize: 11, color: UI.ink, fontWeight: 800 }}>
                                    {formatHoursCompact(weeklyHours)}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop: 10,
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
                            <span
                              style={{
                                fontSize: 16,
                                fontWeight: 800,
                                color: status.clickable ? UI.brand : "#94a3b8",
                              }}
                            >
                              {status.clickable ? ">" : "-"}
                            </span>
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
