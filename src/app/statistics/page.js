"use client";

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  BarChart3,
  CalendarCheck,
  Activity,
  PoundSterling,
  Search,
  Users,
  Car,
  Umbrella,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";

/* ───────── helpers (logic unchanged) ───────── */

function toDate(val) {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === "object" && typeof val.seconds === "number") return new Date(val.seconds * 1000);
  const d = new Date(val);
  return Number.isNaN(+d) ? null : d;
}
function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function endOfDay(d) {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}
function daysBetweenInclusive(a, b) {
  const d1 = startOfDay(a);
  const d2 = startOfDay(b);
  const diffMs = d2.getTime() - d1.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return days + 1;
}
function expandBookingDays(booking) {
  const s = toDate(booking.startDate || booking.date || booking.start);
  const e = toDate(booking.endDate || booking.finish || booking.date);
  if (!s || !e) return [];
  const days = [];
  let cur = startOfDay(s);
  const last = startOfDay(e);
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}
function inRange(date, range) {
  if (!date) return false;
  const d = startOfDay(date);
  const today = startOfDay(new Date());
  if (range === "all") return true;

  if (range === "last30") {
    const from = startOfDay(new Date(today.getTime() - 29 * 86400000));
    return d >= from && d <= today;
  }
  if (range === "last90") {
    const from = startOfDay(new Date(today.getTime() - 89 * 86400000));
    return d >= from && d <= today;
  }
  if (range === "thisYear") {
    const from = new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0);
    const to = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
    return d >= from && d <= to;
  }
  return true;
}
function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/* status normalisation */
const STATUS_LABELS = [
  "Confirmed",
  "First Pencil",
  "Second Pencil",
  "TBC",
  "DNH",
  "Lost",
  "Cancelled",
  "Postponed",
  "Complete",
];
function normStatus(s) {
  return (s || "").toString().trim();
}

/* range bounds (for utilisation %) */
function getRangeBounds(range) {
  const today = startOfDay(new Date());
  if (range === "all") return { from: null, to: today };
  if (range === "last30") return { from: startOfDay(new Date(today.getTime() - 29 * 86400000)), to: today };
  if (range === "last90") return { from: startOfDay(new Date(today.getTime() - 89 * 86400000)), to: today };
  if (range === "thisYear") return { from: new Date(today.getFullYear(), 0, 1), to: today };
  return { from: null, to: today };
}

/* ───────── component ───────── */

export default function StatisticsPage() {
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  // raw data
  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [maintenance, setMaintenance] = useState([]);

  // UI state
  const [range, setRange] = useState("last90"); // all | last30 | last90 | thisYear
  const [tab, setTab] = useState("overview"); // overview | vehicles | people | holidays
  const [qVehicle, setQVehicle] = useState("");
  const [qEmployee, setQEmployee] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [includeMaintenanceInUtil, setIncludeMaintenanceInUtil] = useState(true);

  const load = async () => {
    setLoading(true);
    setErrMsg("");
    try {
      const [bookingsSnap, vehiclesSnap, employeesSnap, holidaysSnap, maintenanceSnap] = await Promise.all([
        getDocs(collection(db, "bookings")),
        getDocs(collection(db, "vehicles")),
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "holidays")),
        getDocs(collection(db, "workBookings")), // maintenance jobs if you use this
      ]);

      setBookings(bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setVehicles(vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEmployees(employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setHolidays(holidaysSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setMaintenance(maintenanceSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error loading statistics data:", e);
      setErrMsg(e?.message || "Failed to load statistics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────── derived data ───────── */

  const stats = useMemo(() => {
    if (loading) return null;

    const bounds = getRangeBounds(range);
    const totalDaysInPeriod =
      bounds.from && bounds.to ? Math.max(1, daysBetweenInclusive(bounds.from, bounds.to)) : null;

    /* ---- filter bookings by range ---- */
    let filteredBookings = bookings.filter((b) => inRange(toDate(b.startDate || b.date || b.start), range));

    const activeStatuses = ["Confirmed", "First Pencil", "Second Pencil", "TBC"];
    if (onlyActive) {
      filteredBookings = filteredBookings.filter((b) => activeStatuses.includes(normStatus(b.status)));
    }

    const totalBookings = filteredBookings.length;

    const todayStart = startOfDay(new Date());
    const upcomingBookings = filteredBookings.filter((b) => {
      const s = toDate(b.startDate || b.date || b.start);
      return s && startOfDay(s) >= todayStart;
    });

    const activeJobs = filteredBookings.filter((b) => activeStatuses.includes(normStatus(b.status)));

    // pipeline by status
    const statusCounts = {};
    filteredBookings.forEach((b) => {
      const s = normStatus(b.status) || "Unspecified";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    /* ---- job value sum ---- */
    const totalJobValue = filteredBookings.reduce((sum, b) => {
      const val = Number(b.jobValue ?? b.quoteValue ?? b.estimatedValue ?? 0) || 0;
      return sum + val;
    }, 0);

    /* ---- vehicle utilisation ---- */
    const vehicleMap = {};
    vehicles.forEach((v) => {
      vehicleMap[v.id] = v;
    });

    const vehicleDaysMap = {};
    filteredBookings.forEach((b) => {
      const days = expandBookingDays(b);
      const vehIds = Array.isArray(b.vehicles)
        ? b.vehicles
            .map((v) => (typeof v === "string" ? v : v.id || v.vehicleId))
            .filter(Boolean)
        : [];
      days.forEach((dStr) => {
        vehIds.forEach((id) => {
          if (!vehicleDaysMap[id]) vehicleDaysMap[id] = new Set();
          vehicleDaysMap[id].add(dStr);
        });
      });
    });

    const maintenanceDaysMap = {};
    maintenance.forEach((m) => {
      const days = expandBookingDays(m);
      const vehIds = Array.isArray(m.vehicles)
        ? m.vehicles
            .map((v) => (typeof v === "string" ? v : v.id || v.vehicleId))
            .filter(Boolean)
        : [];
      days.forEach((dStr) => {
        vehIds.forEach((id) => {
          if (!maintenanceDaysMap[id]) maintenanceDaysMap[id] = new Set();
          maintenanceDaysMap[id].add(dStr);
        });
      });
    });

    const vehicleUtilisationAll = Object.entries(vehicleDaysMap).map(([vehicleId, daySet]) => {
      const v = vehicleMap[vehicleId] || {};
      const daysBooked = daySet.size;
      const maintenanceDays = maintenanceDaysMap[vehicleId]?.size || 0;
      const totalOffRoad = daysBooked + (includeMaintenanceInUtil ? maintenanceDays : 0);
      const utilisationPct = totalDaysInPeriod ? Math.min(100, Math.round((totalOffRoad / totalDaysInPeriod) * 100)) : 0;

      return {
        vehicleId,
        name: v.name || v.vehicleName || "Unnamed vehicle",
        reg: v.reg || v.registration || "",
        daysBooked,
        maintenanceDays,
        totalOffRoad,
        utilisationPct,
      };
    });

    const vehicleUtilisationTop = vehicleUtilisationAll
      .slice()
      .sort((a, b) => b.totalOffRoad - a.totalOffRoad)
      .slice(0, 10);

    /* ---- employee workload ---- */
    const empMap = {};
    employees.forEach((e) => {
      empMap[e.id] = e;
      if (e.employeeId) empMap[e.employeeId] = e;
      if (e.userCode) empMap[e.userCode] = e;
    });

    const employeeBookingCount = {};
    filteredBookings.forEach((b) => {
      const empIds = Array.isArray(b.employees)
        ? b.employees.map((e) => (typeof e === "string" ? e : e.id || e.employeeId || e.userCode))
        : [];
      empIds
        .filter(Boolean)
        .forEach((id) => {
          employeeBookingCount[id] = (employeeBookingCount[id] || 0) + 1;
        });
    });

    const employeeWorkloadAll = Object.entries(employeeBookingCount).map(([empKey, count]) => {
      const e = empMap[empKey] || {};
      return {
        key: empKey,
        name: e.name || e.fullName || e.displayName || "Unnamed employee",
        role: e.role || e.jobTitle || "",
        count,
      };
    });

    const employeeWorkloadTop = employeeWorkloadAll
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    /* ---- holiday overview ---- */
    const filteredHolidays = holidays.filter((h) => inRange(toDate(h.startDate), range) || inRange(toDate(h.endDate), range));

    let paidDays = 0;
    let unpaidDays = 0;
    let accruedDays = 0;

    filteredHolidays.forEach((h) => {
      const s = toDate(h.startDate);
      const e = toDate(h.endDate || h.startDate);
      if (!s || !e) return;
      const days = daysBetweenInclusive(s, e);
      const status = (h.paidStatus || "").toLowerCase();
      if (status === "unpaid") unpaidDays += days;
      else if (status === "accrued") accruedDays += days;
      else paidDays += days;
    });

    const totalHolidayDays = paidDays + unpaidDays + accruedDays;

    const perEmployeeHoliday = {};
    filteredHolidays.forEach((h) => {
      const s = toDate(h.startDate);
      const e = toDate(h.endDate || h.startDate);
      if (!s || !e) return;
      const days = daysBetweenInclusive(s, e);
      const empId = h.employee || h.employeeId || h.userCode || "unknown";
      if (!perEmployeeHoliday[empId]) perEmployeeHoliday[empId] = { paid: 0, unpaid: 0, accrued: 0 };
      const status = (h.paidStatus || "").toLowerCase();
      if (status === "unpaid") perEmployeeHoliday[empId].unpaid += days;
      else if (status === "accrued") perEmployeeHoliday[empId].accrued += days;
      else perEmployeeHoliday[empId].paid += days;
    });

    const perEmployeeHolidayList = Object.entries(perEmployeeHoliday)
      .map(([empKey, info]) => {
        const e = empMap[empKey] || {};
        return {
          key: empKey,
          name: e.name || e.fullName || e.displayName || empKey,
          ...info,
          total: info.paid + info.unpaid + info.accrued,
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      bounds,
      totalDaysInPeriod,
      filteredBookings,
      totalBookings,
      upcomingBookingsCount: upcomingBookings.length,
      activeJobsCount: activeJobs.length,
      statusCounts,
      totalJobValue,
      vehicleUtilisationTop,
      vehicleUtilisationAll,
      employeeWorkloadTop,
      employeeWorkloadAll,
      holiday: {
        totalHolidayDays,
        paidDays,
        unpaidDays,
        accruedDays,
        perEmployeeHolidayList,
      },
    };
  }, [loading, bookings, vehicles, employees, holidays, maintenance, range, onlyActive, includeMaintenanceInUtil]);

  /* ───────── render helpers ───────── */

  const renderStatusBars = () => {
    if (!stats) return null;

    const entries = STATUS_LABELS.map((label) => ({
      label,
      count: stats.statusCounts?.[label] || 0,
    })).filter((e) => e.count > 0);

    const others = Object.entries(stats.statusCounts || {})
      .filter(([k]) => !STATUS_LABELS.includes(k))
      .map(([label, count]) => ({ label, count }));

    const all = [...entries, ...others];
    if (!all.length) {
      return <p className="text-sm text-slate-400">No bookings in this period.</p>;
    }

    const max = Math.max(...all.map((x) => x.count));

    return (
      <div className="space-y-3">
        {all.map((s) => (
          <div key={s.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-slate-200">{s.label}</span>
              <span className="text-slate-400">
                {s.count} · {pct(s.count, stats.totalBookings)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${(s.count / max) * 100 || 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const periodLabel = useMemo(() => {
    if (!stats) return "";
    if (range === "all") return "All time";
    const from = stats.bounds.from;
    const to = stats.bounds.to;
    if (!from || !to) return "";
    const a = from.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const b = to.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${a} → ${b}`;
  }, [stats, range]);

  // searched lists
  const filteredVehicles = useMemo(() => {
    if (!stats) return [];
    const q = qVehicle.trim().toLowerCase();
    const list = tab === "vehicles" ? stats.vehicleUtilisationAll : stats.vehicleUtilisationTop;
    if (!q) return list;
    return list.filter((v) => `${v.name} ${v.reg} ${v.vehicleId}`.toLowerCase().includes(q));
  }, [stats, qVehicle, tab]);

  const filteredEmployees = useMemo(() => {
    if (!stats) return [];
    const q = qEmployee.trim().toLowerCase();
    const list = tab === "people" ? stats.employeeWorkloadAll : stats.employeeWorkloadTop;
    if (!q) return list;
    return list.filter((e) => `${e.name} ${e.role} ${e.key}`.toLowerCase().includes(q));
  }, [stats, qEmployee, tab]);

  /* ───────── main render ───────── */

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        .bickers-scroll::-webkit-scrollbar {
          height: 10px;
          width: 10px;
        }
        .bickers-scroll::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.25);
          border-radius: 999px;
        }
        .bickers-scroll::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.25);
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-50 px-4 py-6 md:px-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Analytics</span>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Business Statistics</h1>
                <p className="mt-1 text-sm text-slate-400 max-w-2xl">
                  Fast snapshot of jobs, utilisation, workload and holidays — built for quick decisions (not spreadsheets).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
                {periodLabel || "—"}
              </span>

              <button
                onClick={load}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/70"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Sticky controls */}
          <div className="sticky top-0 z-10 -mx-4 px-4 md:-mx-8 md:px-8 pt-2 pb-3 bg-gradient-to-b from-slate-950/90 to-slate-950/40 backdrop-blur">
            <div className="rounded-2xl border border-slate-800/90 bg-slate-950/70 shadow-sm shadow-black/40 p-3 md:p-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                {/* Tabs */}
                <div className="flex flex-wrap items-center gap-2">
                  <TabButton active={tab === "overview"} onClick={() => setTab("overview")} Icon={BarChart3}>
                    Overview
                  </TabButton>
                  <TabButton active={tab === "vehicles"} onClick={() => setTab("vehicles")} Icon={Car}>
                    Vehicles
                  </TabButton>
                  <TabButton active={tab === "people"} onClick={() => setTab("people")} Icon={Users}>
                    People
                  </TabButton>
                  <TabButton active={tab === "holidays"} onClick={() => setTab("holidays")} Icon={Umbrella}>
                    Holidays
                  </TabButton>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                  </div>

                  <div className="relative">
                    <select
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                      className="bg-slate-950/80 text-sm border border-slate-700 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70 shadow-sm shadow-black/30"
                    >
                      <option value="last30">Last 30 days</option>
                      <option value="last90">Last 90 days</option>
                      <option value="thisYear">This year</option>
                      <option value="all">All time</option>
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                      ▼
                    </span>
                  </div>

                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
                    <input type="checkbox" className="accent-blue-500" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
                    Active jobs only
                  </label>

                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      className="accent-blue-500"
                      checked={includeMaintenanceInUtil}
                      onChange={(e) => setIncludeMaintenanceInUtil(e.target.checked)}
                    />
                    Count maintenance in utilisation
                  </label>
                </div>
              </div>
            </div>
          </div>

          {errMsg ? (
            <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
              <div className="font-semibold">Couldn’t load stats</div>
              <div className="mt-1 opacity-90">{errMsg}</div>
            </div>
          ) : null}

          {loading || !stats ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-10 text-sm text-slate-400 flex items-center justify-center">
              Loading statistics…
            </div>
          ) : (
            <>
              {/* OVERVIEW */}
              {tab === "overview" && (
                <div className="space-y-4">
                  {/* KPI row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <KpiCard label="Total bookings" value={stats.totalBookings} hint="In selected period" Icon={BarChart3} />
                    <KpiCard label="Active jobs" value={stats.activeJobsCount} hint="Confirmed / Pencil / TBC" Icon={Activity} />
                    <KpiCard label="Upcoming bookings" value={stats.upcomingBookingsCount} hint="From today onwards" Icon={CalendarCheck} />
                    <KpiCard
                      label="Total job value"
                      value={
                        "£" +
                        stats.totalJobValue.toLocaleString("en-GB", {
                          maximumFractionDigits: 0,
                        })
                      }
                      hint="Uses jobValue / quoteValue"
                      Icon={PoundSterling}
                    />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {/* Pipeline */}
                    <Panel title="Booking pipeline" subtitle="Status breakdown">
                      {renderStatusBars()}
                    </Panel>

                    {/* Quick vehicle utilisation (top) */}
                    <Panel
                      className="xl:col-span-2"
                      title="Vehicle utilisation"
                      subtitle={
                        stats.totalDaysInPeriod
                          ? `Top vehicles by off-road time · ${stats.totalDaysInPeriod} day period`
                          : "Top vehicles by off-road time"
                      }
                      right={
                        <button
                          onClick={() => setTab("vehicles")}
                          className="text-[11px] px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200"
                        >
                          Open fleet →
                        </button>
                      }
                    >
                      <UtilTable rows={stats.vehicleUtilisationTop} />
                    </Panel>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {/* Employees */}
                    <Panel
                      className="xl:col-span-2"
                      title="Employee workload"
                      subtitle="Top people by jobs allocated"
                      right={
                        <button
                          onClick={() => setTab("people")}
                          className="text-[11px] px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200"
                        >
                          Open crew →
                        </button>
                      }
                    >
                      <WorkloadTable rows={stats.employeeWorkloadTop} />
                    </Panel>

                    {/* Holidays */}
                    <Panel title="Holiday overview" subtitle="Paid vs unpaid vs accrued">
                      {stats.holiday.totalHolidayDays === 0 ? (
                        <p className="text-xs text-slate-400">No holidays in this period.</p>
                      ) : (
                        <>
                          <div className="space-y-2 text-xs">
                            <Line label="Total days" value={stats.holiday.totalHolidayDays} strong />
                            <Line label="Paid" value={stats.holiday.paidDays} tone="emerald" />
                            <Line label="Accrued" value={stats.holiday.accruedDays} tone="amber" />
                            <Line label="Unpaid" value={stats.holiday.unpaidDays} tone="red" />
                          </div>

                          <div className="mt-4">
                            <div className="text-xs text-slate-400 mb-2">Top holiday usage</div>
                            <div className="space-y-1 max-h-52 overflow-y-auto pr-1 bickers-scroll">
                              {stats.holiday.perEmployeeHolidayList.slice(0, 10).map((h) => (
                                <div
                                  key={h.key}
                                  className="flex justify-between items-center text-xs rounded-lg bg-slate-900/70 border border-slate-800/80 px-2.5 py-1.5"
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium text-slate-100">{h.name}</span>
                                    <span className="text-[10px] text-slate-500">
                                      {h.paid} paid · {h.unpaid} unpaid · {h.accrued} accrued
                                    </span>
                                  </div>
                                  <span className="text-sm text-slate-50">{h.total}d</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </Panel>
                  </div>
                </div>
              )}

              {/* VEHICLES */}
              {tab === "vehicles" && (
                <div className="space-y-4">
                  <Panel
                    title="Fleet utilisation"
                    subtitle={
                      stats.totalDaysInPeriod
                        ? `Search + scan your whole fleet · ${stats.totalDaysInPeriod} day period`
                        : "Search + scan your whole fleet"
                    }
                    right={
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            value={qVehicle}
                            onChange={(e) => setQVehicle(e.target.value)}
                            placeholder="Search vehicle / reg…"
                            className="w-72 max-w-[70vw] rounded-lg border border-slate-700 bg-slate-950/60 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                          />
                        </div>
                      </div>
                    }
                  >
                    <UtilTable rows={filteredVehicles} showAll />
                  </Panel>
                </div>
              )}

              {/* PEOPLE */}
              {tab === "people" && (
                <div className="space-y-4">
                  <Panel
                    title="Crew workload"
                    subtitle="Search across everyone with allocations in this period"
                    right={
                      <div className="relative">
                        <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          value={qEmployee}
                          onChange={(e) => setQEmployee(e.target.value)}
                          placeholder="Search employee / role…"
                          className="w-72 max-w-[70vw] rounded-lg border border-slate-700 bg-slate-950/60 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                        />
                      </div>
                    }
                  >
                    <WorkloadTable rows={filteredEmployees} showAll />
                  </Panel>
                </div>
              )}

              {/* HOLIDAYS */}
              {tab === "holidays" && (
                <div className="space-y-4">
                  <Panel title="Holiday usage" subtitle="Per employee totals (paid / unpaid / accrued)">
                    {stats.holiday.perEmployeeHolidayList.length === 0 ? (
                      <p className="text-sm text-slate-400">No holiday records in this period.</p>
                    ) : (
                      <div className="overflow-x-auto bickers-scroll">
                        <table className="min-w-full text-xs">
                          <thead className="text-slate-400">
                            <tr className="text-left">
                              <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">Employee</th>
                              <th className="py-2 pr-4 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Paid</th>
                              <th className="py-2 pr-4 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Accrued</th>
                              <th className="py-2 pr-4 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Unpaid</th>
                              <th className="py-2 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.holiday.perEmployeeHolidayList.map((h) => (
                              <tr key={h.key} className="border-t border-slate-800/60">
                                <td className="py-3 pr-4">
                                  <div className="flex items-center gap-2">
                                    <div className="h-7 w-7 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-[10px] text-slate-300">
                                      {(h.name || "E").charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-slate-100 font-medium">{h.name}</span>
                                      <span className="text-[10px] text-slate-500">{h.key}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 pr-4 text-right text-emerald-300">{h.paid}</td>
                                <td className="py-3 pr-4 text-right text-amber-300">{h.accrued}</td>
                                <td className="py-3 pr-4 text-right text-red-300">{h.unpaid}</td>
                                <td className="py-3 text-right text-slate-50 font-semibold">{h.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ───────── UI bits ───────── */

function TabButton({ active, onClick, Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition",
        active
          ? "bg-slate-900/80 border-slate-600 text-slate-50"
          : "bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-900/50 hover:border-slate-700",
      ].join(" ")}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

function Panel({ title, subtitle, right, className = "", children }) {
  return (
    <div className={["rounded-2xl bg-slate-950/70 border border-slate-800/90 p-4 md:p-5 shadow-sm shadow-black/40", className].join(" ")}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, hint, Icon }) {
  return (
    <div className="group rounded-2xl bg-slate-950/70 border border-slate-800/90 p-4 shadow-sm shadow-black/40 hover:border-slate-600 hover:bg-slate-900/80 transition-transform duration-150 ease-out hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
        </div>
        <div className="h-9 w-9 rounded-full bg-slate-900 flex items-center justify-center border border-slate-700 text-slate-300 group-hover:border-slate-500">
          {Icon && <Icon className="h-4 w-4" />}
        </div>
      </div>
      {hint ? <p className="mt-2 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Line({ label, value, strong, tone }) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "amber"
      ? "text-amber-400"
      : tone === "red"
      ? "text-red-400"
      : "text-slate-300";
  return (
    <div className="flex justify-between">
      <span className={toneClass}>{label}</span>
      <span className={strong ? "font-medium text-slate-50" : "text-slate-200"}>{value}</span>
    </div>
  );
}

/* tables */

function UtilTable({ rows, showAll }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-slate-400">{showAll ? "No vehicles matched your search." : "No vehicle bookings in this period."}</p>;
  }

  return (
    <div className="overflow-x-auto bickers-scroll">
      <table className="min-w-full text-xs border-separate border-spacing-y-1">
        <thead className="text-slate-400">
          <tr className="text-left">
            <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">Vehicle</th>
            <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">Reg</th>
            <th className="py-2 pr-4 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Booked</th>
            <th className="py-2 pr-4 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Maint.</th>
            <th className="py-2 pr-4 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Off road</th>
            <th className="py-2 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Util %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v, i) => (
            <tr key={v.vehicleId} className="rounded-xl overflow-hidden">
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2 rounded-lg bg-slate-900/70 border border-slate-800/80 px-3 py-2">
                  <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-300">
                    {(v.name || "V").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-slate-100 text-xs truncate">{v.name}</span>
                    <span className="text-[10px] text-slate-500">#{i + 1} · {v.vehicleId}</span>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${v.utilisationPct || 0}%` }} />
                    </div>
                  </div>
                </div>
              </td>
              <td className="py-2 pr-4 text-slate-300">{v.reg || "—"}</td>
              <td className="py-2 pr-4 text-right text-slate-100">{v.daysBooked}</td>
              <td className="py-2 pr-4 text-right text-amber-300">{v.maintenanceDays}</td>
              <td className="py-2 pr-4 text-right text-slate-50 font-semibold">{v.totalOffRoad}</td>
              <td className="py-2 text-right text-slate-50">{v.utilisationPct || 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkloadTable({ rows, showAll }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-slate-400">{showAll ? "No employees matched your search." : "No employees assigned to bookings in this period."}</p>;
  }

  return (
    <div className="overflow-x-auto bickers-scroll">
      <table className="min-w-full text-xs border-separate border-spacing-y-1">
        <thead className="text-slate-400">
          <tr className="text-left">
            <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">Employee</th>
            <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">Role</th>
            <th className="py-2 font-normal text-right text-[11px] uppercase tracking-[0.16em]">Bookings</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.key}>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2 rounded-lg bg-slate-900/70 border border-slate-800/80 px-3 py-2">
                  <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-300">
                    {(e.name || "E").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-slate-100 text-xs truncate">{e.name}</span>
                    <span className="text-[10px] text-slate-500">{e.key}</span>
                  </div>
                </div>
              </td>
              <td className="py-2 pr-4 text-slate-300">{e.role || "—"}</td>
              <td className="py-2 text-right text-slate-50 font-semibold">{e.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
