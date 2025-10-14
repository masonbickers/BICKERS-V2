// src/app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import ProtectedRoute from "../components/ProtectedRoute";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import "@fullcalendar/common/main.css";

import moment from "moment";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

/* ────────────────────────────────────────────────────────────────────────────
   Date + normalisers
──────────────────────────────────────────────────────────────────────────── */
const toJSDate = (val) => {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  return new Date(val);
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;

const normKey = (s) => String(s || "").trim().toLowerCase();
const vKey = (v) => normKey(v?.registration || v?.name || v); // works for strings or objects

const asEvent = (b) => {
  const start = toJSDate(b.startDate || b.date);
  const end = toJSDate(b.endDate || b.date || b.startDate) || start;
  return {
    id: b.id,
    status: String(b.status || "").toLowerCase(),
    jobNumber: b.jobNumber || "—",
    client: b.client || "—",
    start,
    end,
    allDay: true,
    vehicles: Array.isArray(b.vehicles) ? b.vehicles : [],
    equipment: Array.isArray(b.equipment) ? b.equipment : (b.equipment ? [b.equipment] : []),
    hasPDF: !!b.pdfURL,
  };
};

/* ────────────────────────────────────────────────────────────────────────────
   Colours
──────────────────────────────────────────────────────────────────────────── */
const getColorByStatus = (status = "") => {
  const s = status.toLowerCase();
  switch (s) {
    case "confirmed":
      return "#f3f970"; // lime yellow
    case "second pencil":
      return "#f73939"; // bright red
    case "first pencil":
      return "#89caf5"; // pastel blue
    case "cancelled":
      return "#ef4444"; // deep red
    case "maintenance":
      return "#f97316"; // orange
    case "travel":
      return "#38bdf8"; // cyan
    case "holiday":
      return "#d3d3d3"; // light grey
    case "workshop":
      return "#c084fc"; // purple
    default:
      return "#2563eb"; // fallback blue
  }
};

/* ────────────────────────────────────────────────────────────────────────────
   Component
──────────────────────────────────────────────────────────────────────────── */
export default function HomePage() {
  const router = useRouter();
  const pathname = usePathname();

  const [bookings, setBookings] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  // Assistant UI
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  // Window filter (days)
  const [windowDays, setWindowDays] = useState(30);

  // Fetch data
  useEffect(() => {
    const run = async () => {
      const snap = await getDocs(collection(db, "bookings"));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(rows);

      const vSnap = await getDocs(collection(db, "vehicles"));
      setVehicles(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const mSnap = await getDocs(collection(db, "workBookings"));
      const mEvents = mSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          status: "maintenance",
          title: `${data.vehicleName} - ${data.maintenanceType || "Maintenance"}`,
          start: toJSDate(data.startDate),
          end: toJSDate(data.endDate || data.startDate),
          allDay: true,
          type: "workBookings",
        };
      });
      setMaintenanceBookings(mEvents);
    };
    run();
  }, []);

  /* ────────────────────────────────────────────────────────────────────────
     Derived: events + windows
  ───────────────────────────────────────────────────────────────────────── */
  const events = useMemo(() => bookings.map(asEvent), [bookings]);

  const now = new Date();
  const in2Days = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
  const in3Weeks = new Date(now.getTime() + 21 * 24 * 3600 * 1000);
  const windowStart = useMemo(
    () => new Date(now.getTime() - windowDays * 24 * 3600 * 1000),
    [now, windowDays]
  );

  // Prep list (next 2 days)
  const prepList = useMemo(
    () =>
      events
        .filter((e) => e.start && e.start >= now && e.start <= in2Days)
        .map((e) => ({
          id: e.id,
          jobNumber: e.jobNumber,
          vehicles: e.vehicles,
          equipment: e.equipment.join(", "),
          notes: bookings.find((b) => b.id === e.id)?.notes || "—",
          start: e.start,
        })),
    [events, bookings, now, in2Days]
  );

  // Window-scoped JOB COUNTS
  const windowEvents = useMemo(
    () => events.filter((e) => e.start && e.start >= windowStart && e.start <= now),
    [events, windowStart, now]
  );

  const jobCounts = useMemo(() => {
    const acc = { total: 0, enquiry: 0, "first pencil": 0, "second pencil": 0, confirmed: 0 };
    windowEvents.forEach((e) => {
      acc.total += 1;
      if (typeof acc[e.status] === "number") acc[e.status] += 1;
    });
    return acc;
  }, [windowEvents]);

  // Window-scoped VEHICLE USAGE (distinct booked days in window)
  const vehicleUsage = useMemo(() => {
    const dayKey = (d) => startOfDay(d).toISOString().slice(0, 10);
    const byVehicle = new Map();

    windowEvents.forEach((e) => {
      const s = e.start < windowStart ? windowStart : e.start;
      const end = e.end > now ? now : e.end;

      if (!s || !end) return;

      const days = [];
      let cursor = startOfDay(s);
      const endDay = startOfDay(end);
      while (cursor <= endDay) {
        days.push(dayKey(cursor));
        cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
      }

      (e.vehicles || []).forEach((v) => {
        const key = vKey(v);
        if (!byVehicle.has(key)) byVehicle.set(key, new Set());
        const set = byVehicle.get(key);
        days.forEach((dk) => set.add(dk));
      });
    });

    const out = [];
    vehicles.forEach((v) => {
      const key = vKey(v);
      const usedDays = (byVehicle.get(key) || new Set()).size;
      out.push({
        id: v.id,
        name: v.name || v.registration || "—",
        usedDays,
        category: v.category || "—",
      });
    });
    out.sort((a, b) => b.usedDays - a.usedDays);
    return out;
  }, [windowEvents, vehicles, windowStart, now]);

  // Follow-ups (Next 72h)
  const firstPencils72h = useMemo(
    () =>
      events.filter(
        (e) =>
          e.status === "first pencil" &&
          e.start &&
          e.start >= now &&
          e.start <= new Date(now.getTime() + 72 * 3600 * 1000)
      ),
    [events, now]
  );

  // Second vs firm conflicts (vehicle-level)
  const clashesSecondVsFirm = useMemo(() => {
    const firmers = events.filter((e) => ["confirmed", "first pencil"].includes(e.status));
    const seconds = events.filter((e) => e.status === "second pencil");
    const clashes = [];
    const firmIdxByVehicle = new Map(); // vehicleKey -> firm events
    firmers.forEach((e) => {
      (e.vehicles || []).forEach((v) => {
        const key = vKey(v);
        if (!firmIdxByVehicle.has(key)) firmIdxByVehicle.set(key, []);
        firmIdxByVehicle.get(key).push(e);
      });
    });
    seconds.forEach((e) => {
      (e.vehicles || []).forEach((v) => {
        const key = vKey(v);
        const list = firmIdxByVehicle.get(key) || [];
        list.forEach((f) => {
          if (overlaps(e.start, e.end, f.start, f.end)) {
            clashes.push({ vehicle: v, second: e, firm: f });
          }
        });
      });
    });
    return clashes;
  }, [events]);

  // Vehicle conflicts (any overlap on same vehicle)
  const vehicleConflicts = useMemo(() => {
    const index = new Map(); // vehicleKey -> events list
    events.forEach((e) => {
      (e.vehicles || []).forEach((v) => {
        const key = vKey(v);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(e);
      });
    });
    const conflicts = [];
    index.forEach((list, key) => {
      list
        .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0))
        .forEach((e, i) => {
          for (let j = i + 1; j < list.length; j++) {
            const f = list[j];
            if (overlaps(e.start, e.end, f.start, f.end)) {
              conflicts.push({ vehicleKey: key, a: e, b: f });
            } else if (f.start > e.end) {
              break;
            }
          }
        });
    });
    return conflicts;
  }, [events]);

  // Maintenance buckets (vehicles, global)
  const motDueSoon = useMemo(
    () =>
      vehicles.filter((v) => {
        const d = v.nextMOT ? toJSDate(v.nextMOT) : null;
        return d && d <= in3Weeks;
      }),
    [vehicles, in3Weeks]
  );
  const serviceDueSoon = useMemo(
    () =>
      vehicles.filter((v) => {
        const d = v.nextService ? toJSDate(v.nextService) : null;
        return d && d <= in3Weeks;
      }),
    [vehicles, in3Weeks]
  );
  const overdueMOT = useMemo(
    () =>
      vehicles.filter((v) => {
        const d = v.nextMOT ? toJSDate(v.nextMOT) : null;
        return d && d < startOfDay(now);
      }),
    [vehicles, now]
  );
  const overdueService = useMemo(
    () =>
      vehicles.filter((v) => {
        const d = v.nextService ? toJSDate(v.nextService) : null;
        return d && d < startOfDay(now);
      }),
    [vehicles, now]
  );

  // Assistant call
  const askAssistant = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });
      const data = await res.json();
      setResponse(data.reply || "No response.");
    } catch (err) {
      console.error(err);
      setResponse("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <HeaderSidebarLayout>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            fontFamily: "Arial, sans-serif",
            backgroundColor: "#f4f4f5",
          }}
        >
          <div
            style={{
              flex: 1,
              padding: "20px 40px",
              backgroundColor: "#f4f4f5",
              minHeight: "100vh",
              overflowY: "auto",
            }}
          >
            <main>
              <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 12, color: "#1f2937" }}>
                Home
              </h1>

              {/* Window filter */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ color: "#374151", fontSize: 14 }}>Window:</span>
                {[7, 14, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setWindowDays(d)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: windowDays === d ? "2px solid #111" : "1px solid #d1d5db",
                      background: windowDays === d ? "#fff" : "#fff",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {d} days
                  </button>
                ))}
                <span style={{ marginLeft: 12, fontSize: 13, color: "#6b7280" }}>
                  {moment(windowStart).format("D MMM")} → {moment(now).format("D MMM YYYY")}
                </span>
              </div>

              {/* ── JOB COUNTS (window) ─────────────────────────────── */}
              <div style={statRow}>
                <StatBlock label="Total Jobs" value={jobCounts.total} />
                <StatBlock label="Enquiry" value={jobCounts["enquiry"]} />
                <StatBlock label="First Pencil" value={jobCounts["first pencil"]} />
                <StatBlock label="Second Pencil" value={jobCounts["second pencil"]} />
                <StatBlock label="Confirmed" value={jobCounts["confirmed"]} />
              </div>



              {/* ── GRID: Calendar + Follow-ups/Conflicts ──────────── */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 24 }}>
                {/* Calendar */}
                <section style={calendarCardStyle}>
                  <h2 style={cardHeader}>Work Calendar</h2>
                  <div style={{ overflow: "visible" }}>
                    <FullCalendar
                      plugins={[dayGridPlugin, interactionPlugin]}
                      initialView="dayGridMonth"
                      headerToolbar={{
                        left: "prev,next today",
                        center: "title",
                        right: "dayGridMonth,dayGridWeek,dayGridDay",
                      }}
                      contentHeight="auto"
                      events={[
                        // bookings
                        ...events.map((e) => ({
                          id: e.id,
                          title: `${e.jobNumber} - ${e.client}`,
                          start: e.start,
                          end: e.end,
                          allDay: true,
                          backgroundColor: getColorByStatus(e.status),
                        })),
                        // maintenance
                        ...maintenanceBookings.map((m) => ({
                          ...m,
                          backgroundColor: getColorByStatus("maintenance"),
                        })),
                      ]}
                      eventClick={(info) => {
                        const id = info.event.id;
                        const type = info.event.extendedProps?.type;
                        if (id) {
                          if (type === "workBookings") router.push(`/view-maintenance/${id}`);
                          else router.push(`/view-booking/${id}`);
                        }
                      }}
                      eventDidMount={(info) => {
                        info.el.style.color = "#000";
                        const titleEl = info.el.querySelector(".fc-event-title");
                        if (titleEl) {
                          titleEl.style.color = "#000";
                          titleEl.style.fontWeight = "600";
                        }
                      }}
                    />

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
                      {[
                        { label: "Confirmed", color: "#f3f970" },
                        { label: "First Pencil", color: "#89caf5" },
                        { label: "Second Pencil", color: "#f73939" },
                        { label: "Maintenance", color: "#f97316" },
                      ].map((item) => (
                        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div
                            style={{
                              width: 14,
                              height: 14,
                              backgroundColor: item.color,
                              border: "1px solid #ccc",
                              borderRadius: 2,
                            }}
                          />
                          <span style={{ fontSize: 14, color: "#1f2937" }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Right column: Follow-ups & Conflicts */}
                <section style={{ ...cardStyle, minWidth: 320 }}>
                  <h2 style={cardHeader}>Follow-ups (Next 72h)</h2>
                  {firstPencils72h.length ? (
                    <ul style={listReset}>
                      {firstPencils72h.map((e) => (
                        <li key={e.id} style={liItem} onClick={() => router.push(`/view-booking/${e.id}`)}>
                          <strong>{e.jobNumber}</strong> — {e.client} • {moment(e.start).format("MMM D")}
                          <span style={tag("first pencil")}>First Pencil</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No first pencils in the next 72 hours.</p>
                  )}

                  <h3 style={{ ...cardHeader, marginTop: 20 }}>Second vs Firm Clashes</h3>
                  {clashesSecondVsFirm.length ? (
                    <ul style={listReset}>
                      {clashesSecondVsFirm.map((c, i) => (
                        <li key={i} style={liItem}>
                          <strong>{typeof c.vehicle === "string" ? c.vehicle : c.vehicle?.name || "Vehicle"}</strong>
                          <div style={{ fontSize: 13, color: "#374151" }}>
                            2nd: {c.second.jobNumber} ({moment(c.second.start).format("MMM D")}–{moment(c.second.end).format("MMM D")})
                            <span style={tag("second pencil")}>Second</span>
                          </div>
                          <div style={{ fontSize: 13, color: "#374151" }}>
                            Firm: {c.firm.jobNumber} ({moment(c.firm.start).format("MMM D")}–{moment(c.firm.end).format("MMM D")})
                            <span style={tag(c.firm.status)}>{c.firm.status}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No second-pencil clashes.</p>
                  )}
                </section>
              </div>

              {/* ── Prep List ───────────────────────────────────────── */}
              <section style={{ ...cardStyle, marginTop: 24 }}>
                <h2 style={cardHeader}>Prep List (Next 2 Days)</h2>
                {prepList.length ? (
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={thTd}>Job #</th>
                        <th style={thTd}>Vehicles</th>
                        <th style={thTd}>Equipment</th>
                        <th style={thTd}>Notes</th>
                        <th style={thTd}>Start Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepList.map((it) => (
                        <tr key={it.id} onClick={() => router.push(`/view-booking/${it.id}`)} style={{ cursor: "pointer" }}>
                          <td style={thTd}>{it.jobNumber}</td>
                          <td style={thTd}>{it.vehicles?.join(", ") || "—"}</td>
                          <td style={thTd}>{it.equipment || "—"}</td>
                          <td style={thTd}>{it.notes || "—"}</td>
                          <td style={thTd}>{it.start ? moment(it.start).format("MMM D, YYYY") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No jobs starting in the next 2 days.</p>
                )}
              </section>

              {/* ── Maintenance buckets ─────────────────────────────── */}
              <section style={{ ...cardStyle, marginTop: 24 }}>
                <h2 style={cardHeader}>MOT & Service — Overdue / Due Soon</h2>
                <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                  <Bucket title={`MOT Overdue (${overdueMOT.length})`} items={overdueMOT} />
                  <Bucket title={`Service Overdue (${overdueService.length})`} items={overdueService} />
                  <Bucket title={`MOT ≤ 3 Weeks (${motDueSoon.length})`} items={motDueSoon} />
                  <Bucket title={`Service ≤ 3 Weeks (${serviceDueSoon.length})`} items={serviceDueSoon} />
                </div>
              </section>

              {/* ── Booking Summary + Assistant ─────────────────────── */}
              <section style={{ ...cardStyle, marginTop: 24 }}>
                <h2 style={cardHeader}>Booking Summary</h2>
                <button style={buttonStyle} onClick={() => router.push("/create-booking")}>
                  + Add Booking
                </button>

                <div style={{ marginTop: 30 }}>
                  <h3 style={cardHeader}>Assistant</h3>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask the assistant about bookings, holidays and vehicle maintenance etc."
                    rows={3}
                    style={{ width: "100%", padding: 10, fontSize: 14 }}
                  />
                  <button
                    onClick={askAssistant}
                    disabled={loading}
                    style={{
                      marginTop: 10,
                      padding: "10px 16px",
                      backgroundColor: "#000000",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    {loading ? "Asking..." : "Ask Assistant"}
                  </button>
                  {response && (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        background: "#f3f4f6",
                        padding: 12,
                        borderRadius: 6,
                        marginTop: 20,
                        border: "1px solid #d1d5db",
                      }}
                    >
                      <strong>Assistant:</strong>
                      <p>{response}</p>
                    </div>
                  )}
                </div>
              </section>
            </main>
          </div>
        </div>
      </HeaderSidebarLayout>
    </ProtectedRoute>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tiny presentational bits
──────────────────────────────────────────────────────────────────────────── */
function StatBlock({ label, value }) {
  return (
    <div style={statCardStyle}>
      <div style={statCardCount}>{value}</div>
      <div style={statCardLabel}>{label}</div>
    </div>
  );
}

function Bucket({ title, items }) {
  return (
    <div style={bucketCard}>
      <h3 style={{ ...cardHeader, marginBottom: 8 }}>{title}</h3>
      {items && items.length ? (
        <ul style={listReset}>
          {items.slice(0, 8).map((v) => (
            <li key={v.id} style={liItem}>
              <strong>{v.name || v.registration || "—"}</strong>{" "}
              <span style={{ color: "#6b7280" }}>{v.category || "—"}</span>
              <div style={{ fontSize: 13, color: "#374151" }}>
                MOT: {v.nextMOT ? moment(v.nextMOT).format("MMM D, YYYY") : "—"} • Service:{" "}
                {v.nextService ? moment(v.nextService).format("MMM D, YYYY") : "—"}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>None.</p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Styles
──────────────────────────────────────────────────────────────────────────── */
const cardStyle = {
  backgroundColor: "#fff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  color: "#000",
  flex: 1,
  minWidth: 280,
};
const calendarCardStyle = { ...cardStyle, flexBasis: "70%", flexGrow: 1, flexShrink: 0 };
const cardHeader = { fontSize: 20, marginBottom: 15 };
const table = { width: "100%", borderCollapse: "collapse", color: "#000" };
const thTd = { border: "1px solid #ddd", padding: "8px", textAlign: "left" };

const statRow = {
  display: "flex",
  gap: "16px",
  marginBottom: "16px",
  flexWrap: "wrap",
  justifyContent: "flex-start",
};
const statCardStyle = {
  flex: "1 1 160px",
  backgroundColor: "#fff",
  padding: "16px 20px",
  borderRadius: "8px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  minWidth: 160,
};
const statCardCount = { fontSize: "28px", fontWeight: "bold", color: "#111827", marginBottom: 0 };
const statCardLabel = { fontSize: "13px", color: "#4b5563" };
const buttonStyle = {
  marginRight: "10px",
  marginTop: "10px",
  padding: "8px 12px",
  backgroundColor: "#505050",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};
const listReset = { listStyle: "none", padding: 0, margin: 0 };
const liItem = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 8,
  background: "#fff",
  display: "grid",
  gap: 4,
};
const bucketCard = { ...cardStyle, minWidth: 260 };
const tag = (kind) => {
  const map = {
    "first pencil": { bg: "#e6f2fc", border: "#89caf5", col: "#0b4a75" },
    "second pencil": { bg: "#fde7e7", border: "#f73939", col: "#7a0e0e" },
    confirmed: { bg: "#fbfce6", border: "#f3f970", col: "#515300" },
  };
  const t = map[kind] || { bg: "#eef2ff", border: "#6366f1", col: "#1e1b4b" };
  return {
    display: "inline-block",
    marginLeft: 8,
    padding: "2px 8px",
    fontSize: 12,
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.col,
  };
};
