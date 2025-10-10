"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Calendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer"; // keep your existing localizer util
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

/* ────────────────────────────────────────────────────────────────────────────
   Visual tokens (styling only)
──────────────────────────────────────────────────────────────────────────── */
const UI = {
  page: "#f3f4f6",
  card: "#ffffff",
  text: "#0f172a",
  subtext: "#64748b",
  border: "1px solid #e5e7eb",
  radius: 12,
  radiusSm: 8,
  shadowSm: "0 4px 12px rgba(2, 6, 23, 0.06)",
  shadowMd: "0 8px 24px rgba(2, 6, 23, 0.08)",
};

const shell = {
  minHeight: "100vh",
  background: UI.page,
  color: UI.text,
  fontFamily:
    "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};

const main = {
  flex: 1,
  padding: "28px 28px 40px",
  maxWidth: 1600,
  margin: "0 auto",
};

const h1 = {
  fontSize: 28,
  lineHeight: "34px",
  fontWeight: 800,
  marginBottom: 16,
  color: UI.text,
  letterSpacing: 0.2,
};

const subbar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 22,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 16,
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 16,
  cursor: "pointer",
  transition: "transform .08s ease, box-shadow .2s ease",
};

const cardTitle = { margin: 0, fontSize: 16, fontWeight: 700, color: UI.text };
const cardDesc = { marginTop: 6, fontSize: 13, color: UI.subtext, lineHeight: 1.4 };

const sectionTitle = {
  fontSize: 22,
  lineHeight: "28px",
  fontWeight: 800,
  marginBottom: 10,
  color: UI.text,
};

const panel = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 16,
};

const calendarWrap = {
  height: "calc(100vh - 260px)",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 12,
};

const modal = {
  position: "fixed",
  top: 100,
  left: "50%",
  transform: "translateX(-50%)",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  padding: 18,
  boxShadow: UI.shadowMd,
  zIndex: 1000,
  width: "min(92vw, 520px)",
};

/* ────────────────────────────────────────────────────────────────────────────
   Helpers for usage calculation (more robust)
──────────────────────────────────────────────────────────────────────────── */
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

// parse "YYYY-MM-DD" as a local date (avoid TZ edge issues)
const parseLocalDateOnly = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

// build a list of day keys within [from, to] inclusive
const daysInRange = (from, to) => {
  if (!from || !to) return [];
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const out = [];
  for (let d = a; d <= b; d.setDate(d.getDate() + 1)) {
    out.push(dateKey(d));
  }
  return out;
};

// normalise vehicle label from id/object/name
const vehicleLabel = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    return (
      v.name?.toString().trim() ||
      [v.manufacturer, v.model].filter(Boolean).join(" ").trim() ||
      v.displayName?.toString().trim() ||
      v.registration?.toString().trim().toUpperCase() ||
      ""
    );
  }
  return String(v).trim();
};

/* ────────────────────────────────────────────────────────────────────────────
   Component (logic unchanged except safer usage aggregation)
──────────────────────────────────────────────────────────────────────────── */
export default function VehiclesHomePage() {
  const router = useRouter();

  // Calendar control (makes toolbar toggle & arrows work)
  const [calView, setCalView] = useState("month");
  const [calDate, setCalDate] = useState(new Date());

  const [mounted, setMounted] = useState(false);
  const [workBookings, setWorkBookings] = useState([]);
  const [usageData, setUsageData] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [overdueMOTCount, setOverdueMOTCount] = useState(0);
  const [overdueServiceCount, setOverdueServiceCount] = useState(0);

  useEffect(() => setMounted(true), []);

  // Overdue counters (unchanged)
  useEffect(() => {
    const fetchVehicleMaintenance = async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      const vehicles = snapshot.docs.map((d) => d.data());
      const today = new Date();

      let motOverdue = 0;
      let serviceOverdue = 0;

      vehicles.forEach((vehicle) => {
        const motDate = toDate(vehicle.motDate);
        const serviceDate = toDate(vehicle.serviceDate);
        if (motDate && motDate < today) motOverdue++;
        if (serviceDate && serviceDate < today) serviceOverdue++;
      });

      setOverdueMOTCount(motOverdue);
      setOverdueServiceCount(serviceOverdue);
    };

    fetchVehicleMaintenance();
  }, []);

  // This-month usage histogram (more robust)
  useEffect(() => {
    const fetchUsage = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // vehicle -> Set of dayKeys used in this month
      const usedByDay = new Map();

      const snapshot = await getDocs(collection(db, "bookings"));
      snapshot.forEach((doc) => {
        const data = doc.data();

        // normalised vehicles list
        const vehicles = Array.isArray(data.vehicles)
          ? data.vehicles.map(vehicleLabel).filter(Boolean)
          : [];

        if (vehicles.length === 0) return;

        // collect day keys within this month for this booking
        let dayKeys = [];

        if (Array.isArray(data.bookingDates) && data.bookingDates.length > 0) {
          // filter bookingDates to those within this calendar month
          dayKeys = data.bookingDates
            .map((s) => parseLocalDateOnly(s))
            .filter(Boolean)
            .filter((d) => d >= monthStart && d <= monthEnd)
            .map(dateKey);
        } else {
          // fall back to date/startDate..endDate
          const start =
            parseLocalDateOnly(data.date) ||
            parseLocalDateOnly(data.startDate) ||
            toDate(data.date) ||
            toDate(data.startDate);

          const end =
            parseLocalDateOnly(data.endDate) ||
            parseLocalDateOnly(data.date) ||
            toDate(data.endDate) ||
            toDate(data.date) ||
            start;

          if (!start) return;

          // clamp to current month
          const clampedStart = start < monthStart ? monthStart : start;
          const clampedEnd = (end || start) > monthEnd ? monthEnd : (end || start);

          dayKeys = daysInRange(clampedStart, clampedEnd);
        }

        if (dayKeys.length === 0) return;

        // add each day once per vehicle (avoid duplicates)
        vehicles.forEach((name) => {
          if (!usedByDay.has(name)) usedByDay.set(name, new Set());
          const s = usedByDay.get(name);
          dayKeys.forEach((k) => s.add(k));
        });
      });

      // final counts = number of unique days each vehicle was used this month
      const usageArray = Array.from(usedByDay.entries())
        .map(([name, set]) => ({ name, usage: set.size }))
        .sort((a, b) => b.usage - a.usage);

      setUsageData(usageArray);
    };

    fetchUsage();
  }, []);

  // Calendar events (MOT & service) — unchanged, just styled differently
  useEffect(() => {
    const fetchMaintenanceEvents = async () => {
      const snapshot = await getDocs(collection(db, "workBookings"));
      const events = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          const start = toDate(data.startDate);
          const end = toDate(data.endDate || data.startDate);
          if (!start || !end) return null;

          return {
            title: `${data.vehicleName} - ${data.maintenanceType}`,
            // allDay events in RBC show end as exclusive; add 1 day if you want inclusive display
            start,
            end: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
            allDay: true,
          };
        })
        .filter(Boolean);

      setWorkBookings(events);
    };

    fetchMaintenanceEvents();
  }, []);

  const handleSelectEvent = (event) => setSelectedEvent(event);

  const vehicleSections = useMemo(
    () => [
      {
        title:
          `MOT Schedule` + (overdueMOTCount > 0 ? ` — ${overdueMOTCount} overdue` : ""),
        description: "View and manage MOT due dates for all vehicles.",
        link: "/mot-overview",
      },
      {
        title:
          `Service History` +
          (overdueServiceCount > 0 ? ` — ${overdueServiceCount} overdue` : ""),
        description: "Track past and upcoming vehicle servicing.",
        link: "/service-overview",
      },
      {
        title: "Vehicle Usage Logs",
        description: "Monitor vehicle usage across bookings and trips.",
        link: "/usage-overview",
      },
      {
        title: "Vehicle List",
        description: "View, edit or delete vehicles currently in the system.",
        link: "/vehicles",
      },
      {
        title: "Equipment List",
        description: "View, edit or delete equipment currently in the system.",
        link: "/equipment",
      },
    ],
    [overdueMOTCount, overdueServiceCount]
  );

  return (
    <HeaderSidebarLayout>
      <div style={{ display: "flex", ...shell }}>
        <main style={main}>
          <div style={subbar}>
            <h1 style={h1}>Vehicle Management</h1>
            <div style={{ fontSize: 12, color: UI.subtext }}>
              Overview • Usage • MOT • Service
            </div>
          </div>

          {/* Quick links */}
          <div style={grid}>
            {vehicleSections.map((section, idx) => (
              <div
                key={idx}
                style={card}
                onClick={() => router.push(section.link)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = UI.shadowMd;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0px)";
                  e.currentTarget.style.boxShadow = UI.shadowSm;
                }}
              >
                <h2 style={cardTitle}>{section.title}</h2>
                <p style={cardDesc}>{section.description}</p>
              </div>
            ))}
          </div>

          {/* Usage chart */}
          <div style={{ marginTop: 28 }}>
            <h2 style={sectionTitle}>Vehicle Usage (This Month)</h2>
            <div style={panel}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={usageData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: UI.subtext }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: UI.subtext }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={{ stroke: "#e5e7eb" }}
                  />
                  <Tooltip
                    wrapperStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                    contentStyle={{ borderRadius: 8, boxShadow: UI.shadowSm }}
                  />
                  <Bar dataKey="usage" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Calendar */}
          <div style={{ marginTop: 28 }}>
            <h2 style={sectionTitle}>MOT & Service Calendar</h2>
            <div style={calendarWrap}>
              {mounted && (
                <Calendar
                  localizer={localizer}
                  events={workBookings}
                  startAccessor="start"
                  endAccessor="end"
                  // Controlled view/date so toolbar works
                  view={calView}
                  onView={(v) => setCalView(v)}
                  date={calDate}
                  onNavigate={(d) => setCalDate(d)}
                  views={["month", "week", "work_week", "day", "agenda"]}
                  popup
                  showMultiDayTimes
                  style={{ height: "100%" }}
                  dayPropGetter={() => ({
                    style: {
                      minHeight: "110px",
                      borderRight: "1px solid #eef2f7",
                    },
                  })}
                  eventPropGetter={() => ({
                    style: {
                      borderRadius: 8,
                      border: "1.5px solid #1f2937",
                      background: "#e5e7eb",
                      color: "#111827",
                      padding: 0,
                      boxShadow: "0 2px 4px rgba(2,6,23,0.08)",
                    },
                  })}
                  components={{
                    event: ({ event }) => (
                      <div
                        title={event.title}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          fontSize: 13,
                          lineHeight: 1.3,
                          fontWeight: 700,
                          padding: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.02em",
                        }}
                      >
                        <span>{event.title}</span>
                        {event.allDay && (
                          <span
                            style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.8 }}
                          >
                            All Day
                          </span>
                        )}
                      </div>
                    ),
                    toolbar: (props) => (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>
                          {props.label}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <ToolbarBtn onClick={() => props.onNavigate("PREV")}>
                            ←
                          </ToolbarBtn>
                          <ToolbarBtn onClick={() => props.onNavigate("TODAY")}>
                            Today
                          </ToolbarBtn>
                          <ToolbarBtn onClick={() => props.onNavigate("NEXT")}>
                            →
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "month"}
                            onClick={() => props.onView("month")}
                          >
                            Month
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "week"}
                            onClick={() => props.onView("week")}
                          >
                            Week
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "work_week"}
                            onClick={() => props.onView("work_week")}
                          >
                            Work Week
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "day"}
                            onClick={() => props.onView("day")}
                          >
                            Day
                          </ToolbarBtn>
                          <ToolbarBtn
                            active={props.view === "agenda"}
                            onClick={() => props.onView("agenda")}
                          >
                            Agenda
                          </ToolbarBtn>
                        </div>
                      </div>
                    ),
                  }}
                  onSelectEvent={handleSelectEvent}
                />
              )}
            </div>
          </div>

          {selectedEvent && (
            <div style={modal}>
              <h3 style={{ marginTop: 0, marginBottom: 8, fontWeight: 800 }}>
                {selectedEvent.title}
              </h3>
              <p style={{ margin: 0, color: UI.subtext }}>
                <strong style={{ color: UI.text }}>Start:</strong>{" "}
                {selectedEvent.start.toLocaleDateString()}
              </p>
              <p style={{ margin: "6px 0 12px", color: UI.subtext }}>
                <strong style={{ color: UI.text }}>End:</strong>{" "}
                {selectedEvent.end.toLocaleDateString()}
              </p>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: UI.radiusSm,
                  cursor: "pointer",
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  color: UI.text,
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Tiny global polish for RBC */}
      <style jsx global>{`
        .rbc-today {
          background: rgba(37, 99, 235, 0.08) !important;
        }
        .rbc-off-range-bg {
          background: #fafafa !important;
        }
        .rbc-month-view,
        .rbc-time-view,
        .rbc-agenda-view {
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial,
            sans-serif;
        }
        .rbc-header {
          padding: 8px 6px;
          font-weight: 800;
          color: #0f172a;
          border-bottom: 1px solid #e5e7eb !important;
        }
        .rbc-time-content > * + * > * {
          border-left: 1px solid #eef2f7 !important;
        }
        .rbc-event {
          overflow: visible !important;
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tiny helper component (visual only, no logic changes)
──────────────────────────────────────────────────────────────────────────── */
function ToolbarBtn({ children, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none",
        border: "1px solid #e5e7eb",
        background: active ? "#111827" : "#ffffff",
        color: active ? "#ffffff" : "#111827",
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: active ? "0 2px 6px rgba(2,6,23,0.12)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "#ffffff";
      }}
    >
      {children}
    </button>
  );
}
