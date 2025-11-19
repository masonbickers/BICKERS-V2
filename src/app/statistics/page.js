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
} from "lucide-react";

/* ───────── helpers ───────── */

function toDate(val) {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === "object" && typeof val.seconds === "number") {
    return new Date(val.seconds * 1000);
  }
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

// inclusive days between two dates (for utilisation)
function daysBetweenInclusive(a, b) {
  const d1 = startOfDay(a);
  const d2 = startOfDay(b);
  const diffMs = d2.getTime() - d1.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return days + 1;
}

// expand a booking into an array of YYYY-MM-DD strings for each day it covers
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

// check if date in filter range
function inRange(date, range) {
  if (!date) return false;
  const d = startOfDay(date);
  const now = new Date();
  const today = startOfDay(now);

  if (range === "all") return true;

  if (range === "last30") {
    const from = startOfDay(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000));
    return d >= from && d <= today;
  }

  if (range === "last90") {
    const from = startOfDay(new Date(today.getTime() - 89 * 24 * 60 * 60 * 1000));
    return d >= from && d <= today;
  }

  if (range === "thisYear") {
    const from = new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0);
    const to = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
    return d >= from && d <= to;
  }

  return true;
}

// nice % safe
function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/* status normalisation – match your booking statuses */
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

/* ───────── component ───────── */

export default function StatisticsPage() {
  const [loading, setLoading] = useState(true);

  // raw data
  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [maintenance, setMaintenance] = useState([]);

  // UI state
  const [range, setRange] = useState("last90"); // all | last30 | last90 | thisYear

  useEffect(() => {
    const load = async () => {
      try {
        const [
          bookingsSnap,
          vehiclesSnap,
          employeesSnap,
          holidaysSnap,
          maintenanceSnap,
        ] = await Promise.all([
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
      } catch (err) {
        console.error("Error loading statistics data:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  /* ───────── derived data ───────── */

  const stats = useMemo(() => {
    if (loading) return null;

    /* ---- filter bookings by range ---- */
    const filteredBookings = bookings.filter((b) =>
      inRange(toDate(b.startDate || b.date || b.start), range)
    );
    const totalBookings = filteredBookings.length;

    const today = new Date();
    const todayStart = startOfDay(today);

    const upcomingBookings = filteredBookings.filter((b) => {
      const s = toDate(b.startDate || b.date || b.start);
      return s && startOfDay(s) >= todayStart;
    });

    const activeStatuses = ["Confirmed", "First Pencil", "Second Pencil", "TBC"];
    const activeJobs = filteredBookings.filter((b) =>
      activeStatuses.includes(normStatus(b.status))
    );

    // pipeline by status
    const statusCounts = {};
    filteredBookings.forEach((b) => {
      const s = normStatus(b.status) || "Unspecified";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    /* ---- job value sum (optional field) ---- */
    const totalJobValue = filteredBookings.reduce((sum, b) => {
      const val =
        Number(b.jobValue ?? b.quoteValue ?? b.estimatedValue ?? 0) || 0;
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
            .map((v) =>
              typeof v === "string" ? v : v.id || v.vehicleId
            )
            .filter(Boolean)
        : [];
      days.forEach((dStr) => {
        vehIds.forEach((id) => {
          const key = id;
          if (!vehicleDaysMap[key]) vehicleDaysMap[key] = new Set();
          vehicleDaysMap[key].add(dStr);
        });
      });
    });

    const maintenanceDaysMap = {};
    maintenance.forEach((m) => {
      const days = expandBookingDays(m);
      const vehIds = Array.isArray(m.vehicles)
        ? m.vehicles
            .map((v) =>
              typeof v === "string" ? v : v.id || v.vehicleId
            )
            .filter(Boolean)
        : [];
      days.forEach((dStr) => {
        vehIds.forEach((id) => {
          const key = id;
          if (!maintenanceDaysMap[key]) maintenanceDaysMap[key] = new Set();
          maintenanceDaysMap[key].add(dStr);
        });
      });
    });

    const vehicleUtilisation = Object.entries(vehicleDaysMap)
      .map(([vehicleId, daySet]) => {
        const v = vehicleMap[vehicleId] || {};
        return {
          vehicleId,
          name: v.name || v.vehicleName || "Unnamed vehicle",
          reg: v.reg || v.registration || "",
          daysBooked: daySet.size,
          maintenanceDays: maintenanceDaysMap[vehicleId]?.size || 0,
        };
      })
      .sort((a, b) => b.daysBooked - a.daysBooked)
      .slice(0, 8); // top 8

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
        ? b.employees.map((e) =>
            typeof e === "string" ? e : e.id || e.employeeId || e.userCode
          )
        : [];
      empIds
        .filter(Boolean)
        .forEach((id) => {
          employeeBookingCount[id] = (employeeBookingCount[id] || 0) + 1;
        });
    });

    const employeeWorkload = Object.entries(employeeBookingCount)
      .map(([empKey, count]) => {
        const e = empMap[empKey] || {};
        return {
          key: empKey,
          name: e.name || e.fullName || e.displayName || "Unnamed employee",
          role: e.role || e.jobTitle || "",
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    /* ---- holiday overview ---- */
    const filteredHolidays = holidays.filter(
      (h) =>
        inRange(toDate(h.startDate), range) ||
        inRange(toDate(h.endDate), range)
    );

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
      else paidDays += days; // default as paid
    });

    const totalHolidayDays = paidDays + unpaidDays + accruedDays;

    const perEmployeeHoliday = {};
    filteredHolidays.forEach((h) => {
      const s = toDate(h.startDate);
      const e = toDate(h.endDate || h.startDate);
      if (!s || !e) return;
      const days = daysBetweenInclusive(s, e);
      const empId = h.employee || h.employeeId || h.userCode || "unknown";
      if (!perEmployeeHoliday[empId]) {
        perEmployeeHoliday[empId] = { paid: 0, unpaid: 0, accrued: 0 };
      }
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
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return {
      totalBookings,
      upcomingBookingsCount: upcomingBookings.length,
      activeJobsCount: activeJobs.length,
      statusCounts,
      totalJobValue,
      vehicleUtilisation,
      employeeWorkload,
      holiday: {
        totalHolidayDays,
        paidDays,
        unpaidDays,
        accruedDays,
        perEmployeeHolidayList,
      },
    };
  }, [loading, bookings, vehicles, employees, holidays, maintenance, range]);

  /* ───────── render helpers ───────── */

  const renderStatusBar = () => {
    if (!stats) return null;
    const entries = STATUS_LABELS.map((label) => ({
      label,
      count: stats.statusCounts?.[label] || 0,
    })).filter((e) => e.count > 0);

    const others = Object.entries(stats.statusCounts || {})
      .filter(([k]) => !STATUS_LABELS.includes(k))
      .map(([label, count]) => ({ label, count }));

    const all = [...entries, ...others];
    if (!all.length)
      return (
        <p className="text-sm text-slate-400">
          No bookings in this period.
        </p>
      );

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
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${(s.count / max) * 100 || 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  /* ───────── main render ───────── */

  return (
    <HeaderSidebarLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-50 px-4 py-6 md:px-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Page header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  Analytics
                </span>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                  Business Statistics
                </h1>
                <p className="mt-1 text-sm text-slate-400 max-w-xl">
                  High-level view of your jobs, vehicles, staff workload and
                  holidays – to see how busy the yard really is.
                </p>
              </div>
            </div>

            {/* Date range filter */}
            <div className="flex items-center gap-3 self-start md:self-auto">
              <span className="text-xs text-slate-400">Period</span>
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
            </div>
          </div>

          {loading || !stats ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-10 text-sm text-slate-400 flex items-center justify-center">
              Loading statistics…
            </div>
          ) : (
            <>
              {/* Top KPI cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                  label="Total bookings"
                  value={stats.totalBookings}
                  hint="In selected period"
                  Icon={BarChart3}
                />
                <KpiCard
                  label="Active jobs"
                  value={stats.activeJobsCount}
                  hint="Confirmed / Pencil / TBC"
                  Icon={Activity}
                />
                <KpiCard
                  label="Upcoming bookings"
                  value={stats.upcomingBookingsCount}
                  hint="From today onwards"
                  Icon={CalendarCheck}
                />
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

              {/* Second row: pipeline + utilisation */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Pipeline */}
                <div className="xl:col-span-1 rounded-2xl bg-slate-950/70 border border-slate-800/90 p-4 md:p-5 shadow-sm shadow-black/40">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold">Booking pipeline</h2>
                    <span className="text-[11px] text-slate-500">
                      Status breakdown
                    </span>
                  </div>
                  {renderStatusBar()}
                </div>

                {/* Vehicle utilisation */}
                <div className="xl:col-span-2 rounded-2xl bg-slate-950/70 border border-slate-800/90 p-4 md:p-5 shadow-sm shadow-black/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">
                        Vehicle utilisation
                      </h2>
                      <p className="text-xs text-slate-500">
                        Top vehicles by days booked and off-road time
                      </p>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
                      Fleet view
                    </span>
                  </div>
                  {stats.vehicleUtilisation.length === 0 ? (
                    <p className="text-xs text-slate-400 mt-2">
                      No bookings with vehicles in this period.
                    </p>
                  ) : (
                    <div className="overflow-x-auto mt-1">
                      <table className="min-w-full text-xs border-separate border-spacing-y-1">
                        <thead className="text-slate-400">
                          <tr className="text-left">
                            <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">
                              Vehicle
                            </th>
                            <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">
                              Reg
                            </th>
                            <th className="py-2 pr-4 font-normal text-right text-[11px] uppercase tracking-[0.16em]">
                              Days booked
                            </th>
                            <th className="py-2 pr-4 font-normal text-right text-[11px] uppercase tracking-[0.16em]">
                              Maint. days
                            </th>
                            <th className="py-2 font-normal text-right text-[11px] uppercase tracking-[0.16em]">
                              Total off road
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.vehicleUtilisation.map((v, i) => (
                            <tr
                              key={v.vehicleId}
                              className="rounded-xl overflow-hidden"
                            >
                              <td className="py-2 pr-4">
                                <div className="flex items-center gap-2 rounded-lg bg-slate-900/70 border border-slate-800/80 px-3 py-2">
                                  <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-300">
                                    {v.name?.charAt(0) ?? "V"}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-medium text-slate-100 text-xs">
                                      {v.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      #{i + 1} in utilisation
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 pr-4 text-slate-300">
                                {v.reg || "—"}
                              </td>
                              <td className="py-2 pr-4 text-right text-slate-100">
                                {v.daysBooked}
                              </td>
                              <td className="py-2 pr-4 text-right text-amber-300">
                                {v.maintenanceDays}
                              </td>
                              <td className="py-2 text-right text-slate-50">
                                {v.daysBooked + v.maintenanceDays}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Third row: employees + holiday */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Employee workload */}
                <div className="xl:col-span-2 rounded-2xl bg-slate-950/70 border border-slate-800/90 p-4 md:p-5 shadow-sm shadow-black/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">
                        Employee workload
                      </h2>
                      <p className="text-xs text-slate-500">
                        Who is getting the most jobs allocated
                      </p>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
                      Crew view
                    </span>
                  </div>
                  {stats.employeeWorkload.length === 0 ? (
                    <p className="text-xs text-slate-400 mt-2">
                      No employees assigned to bookings in this period.
                    </p>
                  ) : (
                    <div className="overflow-x-auto mt-1">
                      <table className="min-w-full text-xs border-separate border-spacing-y-1">
                        <thead className="text-slate-400">
                          <tr className="text-left">
                            <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">
                              Employee
                            </th>
                            <th className="py-2 pr-4 font-normal text-[11px] uppercase tracking-[0.16em]">
                              Role
                            </th>
                            <th className="py-2 font-normal text-right text-[11px] uppercase tracking-[0.16em]">
                              Bookings
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.employeeWorkload.map((e) => (
                            <tr key={e.key}>
                              <td className="py-2 pr-4">
                                <div className="flex items-center gap-2 rounded-lg bg-slate-900/70 border border-slate-800/80 px-3 py-2">
                                  <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-300">
                                    {e.name?.charAt(0) ?? "E"}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-medium text-slate-100 text-xs">
                                      {e.name}
                                    </span>
                                    {e.role && (
                                      <span className="text-[10px] text-slate-500">
                                        {e.role}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 pr-4 text-slate-300">
                                {e.role || "—"}
                              </td>
                              <td className="py-2 text-right text-slate-50">
                                {e.count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Holiday overview */}
                <div className="xl:col-span-1 rounded-2xl bg-slate-950/70 border border-slate-800/90 p-4 md:p-5 shadow-sm shadow-black/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">Holiday overview</h2>
                      <p className="text-xs text-slate-500">
                        Paid vs unpaid vs accrued days
                      </p>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
                      HR view
                    </span>
                  </div>

                  {stats.holiday.totalHolidayDays === 0 ? (
                    <p className="text-xs text-slate-400">
                      No holidays in this period.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-300">Total days</span>
                          <span className="font-medium">
                            {stats.holiday.totalHolidayDays}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-emerald-400">Paid</span>
                          <span>{stats.holiday.paidDays}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-amber-400">Accrued</span>
                          <span>{stats.holiday.accruedDays}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-red-400">Unpaid</span>
                          <span>{stats.holiday.unpaidDays}</span>
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-xs text-slate-400 mb-2">
                          Top holiday usage
                        </p>
                        <div className="space-y-1 max-h-44 overflow-y-auto pr-1 custom-scroll">
                          {stats.holiday.perEmployeeHolidayList.map((h) => (
                            <div
                              key={h.key}
                              className="flex justify-between items-center text-xs rounded-lg bg-slate-900/70 border border-slate-800/80 px-2.5 py-1.5"
                            >
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-100">
                                  {h.name}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {h.paid} paid · {h.unpaid} unpaid ·{" "}
                                  {h.accrued} accrued
                                </span>
                              </div>
                              <span className="text-sm text-slate-50">
                                {h.total}d
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ───────── small reusable KPI card ───────── */

function KpiCard({ label, value, hint, Icon }) {
  return (
    <div className="group rounded-2xl bg-slate-950/70 border border-slate-800/90 p-4 shadow-sm shadow-black/40 hover:border-slate-600 hover:bg-slate-900/80 transition-transform duration-150 ease-out hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
            {label}
          </p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
        </div>
        <div className="h-9 w-9 rounded-full bg-slate-900 flex items-center justify-center border border-slate-700 text-slate-300 group-hover:border-slate-500">
          {Icon && <Icon className="h-4 w-4" />}
        </div>
      </div>
      {hint && (
        <p className="mt-2 text-[11px] text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}
