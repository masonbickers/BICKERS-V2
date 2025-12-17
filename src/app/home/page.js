// src/app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import ProtectedRoute from "../components/ProtectedRoute";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
// If you’re on FullCalendar v6+, this is the correct css import:
import "@fullcalendar/common/main.css";

import moment from "moment";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

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

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
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
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
};

const card = {
  ...surface,
  padding: 16,
};

const cardTitle = { fontWeight: 900, fontSize: 16, margin: 0, color: UI.text };
const cardHint = { color: UI.muted, fontSize: 12, marginTop: 4 };

const grid = (cols = 12) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const btnChip = (active) => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: active ? `2px solid ${UI.text}` : "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 900,
  color: UI.text,
});

const tableWrap = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" };
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

const listReset = { listStyle: "none", padding: 0, margin: 0 };
const liItem = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "10px 12px",
  marginBottom: 8,
  background: "#fff",
  display: "grid",
  gap: 4,
};
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
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
};

const btnPrimary = {
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brand}`,
  background: UI.brand,
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};
const btnGhost = {
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: UI.text,
  fontWeight: 900,
  cursor: "pointer",
};

/* ────────────────────────────────────────────────────────────────────────────
   Date + normalisers
──────────────────────────────────────────────────────────────────────────── */
const toJSDate = (val) => {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  return new Date(val);
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;

const normKey = (s) => String(s || "").trim().toLowerCase();
const vKey = (v) => normKey(v?.registration || v?.name || v); // strings or objects

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
    equipment: Array.isArray(b.equipment) ? b.equipment : b.equipment ? [b.equipment] : [],
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
      return "#f3f970";
    case "second pencil":
      return "#f73939";
    case "first pencil":
      return "#89caf5";
    case "cancelled":
      return "#c2c2c2";
    case "maintenance":
      return "#f97316";

    case "holiday":
      return "#d3d3d3";
    case "workshop":
      return "#da8e58ff";
          case "complete":
      return "#92d18cff";
    default:
      return "#c2c2c2";
  }
};

 

/* ────────────────────────────────────────────────────────────────────────────
   Tiny presentational bits
──────────────────────────────────────────────────────────────────────────── */
function StatBlock({ label, value }) {
  return (
    <div
      style={{
        ...surface,
        padding: 14,
        borderRadius: UI.radius,
        display: "grid",
        gap: 6,
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 900, color: UI.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.02em" }}>
        {label}
      </div>
    </div>
  );
}

function Bucket({ title, items }) {
  return (
    <div style={{ ...surface, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        <span style={chip}>Top 8</span>
      </div>
      {items && items.length ? (
        <ul style={listReset}>
          {items.slice(0, 8).map((v) => (
            <li key={v.id} style={liItem}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ color: UI.text }}>
                  {v.name || v.registration || "—"}
                </strong>
                <span style={{ color: UI.muted, fontSize: 12 }}>{v.category || "—"}</span>
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>
                MOT: {v.nextMOT ? moment(v.nextMOT).format("MMM D, YYYY") : "—"} • Service:{" "}
                {v.nextService ? moment(v.nextService).format("MMM D, YYYY") : "—"}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ color: UI.muted, fontSize: 13 }}>None.</div>
      )}
    </div>
  );
}

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

  const now = useMemo(() => new Date(), []);
  const in2Days = useMemo(() => new Date(now.getTime() + 2 * 24 * 3600 * 1000), [now]);
  const in3Weeks = useMemo(() => new Date(now.getTime() + 21 * 24 * 3600 * 1000), [now]);

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
        <div style={pageWrap}>
          {/* Header */}
          <div style={headerBar}>
            <div>
              <h1 style={h1}>Home</h1>
              <div style={sub}>Calendar, prep, follow-ups and maintenance at a glance.</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chip}>Dashboard</span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
                Window: <b style={{ marginLeft: 6 }}>{windowDays}d</b>
              </span>
            </div>
          </div>

          {/* Window filter */}
          <div style={{ ...surface, padding: 12, marginBottom: UI.gap }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: UI.text, fontSize: 13, fontWeight: 900 }}>Window:</span>
              {[7, 14, 30, 90].map((d) => (
                <button key={d} onClick={() => setWindowDays(d)} style={btnChip(windowDays === d)} type="button">
                  {d} days
                </button>
              ))}
              <span style={{ marginLeft: 8, fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                {moment(windowStart).format("D MMM")} → {moment(now).format("D MMM YYYY")}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ ...grid(12), marginBottom: UI.gap }}>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="Total Jobs" value={jobCounts.total} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="Enquiry" value={jobCounts.enquiry} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="First Pencil" value={jobCounts["first pencil"]} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="Second Pencil" value={jobCounts["second pencil"]} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="Confirmed" value={jobCounts.confirmed} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ ...surface, padding: 14, display: "grid", gap: 6, minWidth: 160 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                  Quick actions
                </div>
                <button type="button" style={btnPrimary} onClick={() => router.push("/create-booking")}>
                  + Add Booking
                </button>
              </div>
            </div>
          </div>

          {/* Main grid */}
          <div style={grid(12)}>
            {/* Calendar */}
            <section style={{ gridColumn: "span 8", ...card }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <h2 style={cardTitle}>Work Calendar</h2>
                  <div style={cardHint}>Click an event to open the booking.</div>
                </div>
                <span style={chip}>Month view</span>
              </div>

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
                    ...events.map((e) => ({
                      id: e.id,
                      title: `${e.jobNumber} - ${e.client}`,
                      start: e.start,
                      end: e.end,
                      allDay: true,
                      backgroundColor: getColorByStatus(e.status),
                    })),
                    ...maintenanceBookings.map((m) => ({
                      ...m,
                      backgroundColor: getColorByStatus("maintenance"),
                    })),
                  ]}
                  eventClick={(info) => {
                    const id = info.event.id;
                    const type = info.event.extendedProps?.type;
                    if (!id) return;
                    if (type === "workBookings") router.push(`/view-maintenance/${id}`);
                    else router.push(`/view-booking/${id}`);
                  }}
                  eventDidMount={(info) => {
                    // keep readable on bright blocks
                    info.el.style.color = "#000";
                    const titleEl = info.el.querySelector(".fc-event-title");
                    if (titleEl) {
                      titleEl.style.color = "#000";
                      titleEl.style.fontWeight = "700";
                    }
                  }}
                />
              </div>

              {/* Legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                {[
                  { label: "Confirmed", color: "#f3f970" },
                  { label: "First Pencil", color: "#89caf5" },
                  { label: "Second Pencil", color: "#f73939" },
                  { label: "Maintenance", color: "#f97316" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 14, height: 14, backgroundColor: item.color, border: "1px solid #d1d5db", borderRadius: 3 }} />
                    <span style={{ fontSize: 13, color: UI.text, fontWeight: 800 }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Right column */}
            <section style={{ gridColumn: "span 4", display: "grid", gap: UI.gap }}>
              <div style={card}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <div>
                    <h2 style={cardTitle}>Follow-ups</h2>
                    <div style={cardHint}>First pencils starting in the next 72 hours.</div>
                  </div>
                  <span style={chip}>{firstPencils72h.length}</span>
                </div>

                {firstPencils72h.length ? (
                  <ul style={listReset}>
                    {firstPencils72h.map((e) => (
                      <li key={e.id} style={{ ...liItem, cursor: "pointer" }} onClick={() => router.push(`/view-booking/${e.id}`)}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                          <strong style={{ color: UI.text }}>{e.jobNumber}</strong>
                          <span style={{ color: UI.muted, fontSize: 12, fontWeight: 900 }}>{moment(e.start).format("MMM D")}</span>
                        </div>
                        <div style={{ color: UI.text, fontSize: 13 }}>{e.client}</div>
                        <div>
                          <span style={tag("first pencil")}>First Pencil</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: UI.muted, fontSize: 13 }}>No first pencils in the next 72 hours.</div>
                )}
              </div>

              <div style={card}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <div>
                    <h2 style={cardTitle}>Second vs firm clashes</h2>
                    <div style={cardHint}>Second pencil overlapping Confirmed/First Pencil.</div>
                  </div>
                  <span style={chip}>{clashesSecondVsFirm.length}</span>
                </div>

                {clashesSecondVsFirm.length ? (
                  <ul style={listReset}>
                    {clashesSecondVsFirm.slice(0, 8).map((c, i) => (
                      <li key={i} style={liItem}>
                        <strong style={{ color: UI.text }}>
                          {typeof c.vehicle === "string" ? c.vehicle : c.vehicle?.name || "Vehicle"}
                        </strong>

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
                  <div style={{ color: UI.muted, fontSize: 13 }}>No second-pencil clashes.</div>
                )}
              </div>
            </section>

            {/* Prep list */}
            <section style={{ gridColumn: "span 12", ...card }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <h2 style={cardTitle}>Prep list</h2>
                  <div style={cardHint}>Jobs starting in the next 2 days.</div>
                </div>
                <span style={chip}>{prepList.length}</span>
              </div>

              {prepList.length ? (
                <div style={tableWrap}>
                  <table style={tableEl}>
                    <thead>
                      <tr>
                        <th style={th}>Job #</th>
                        <th style={th}>Vehicles</th>
                        <th style={th}>Equipment</th>
                        <th style={th}>Notes</th>
                        <th style={th}>Start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepList.map((it) => (
                        <tr
                          key={it.id}
                          onClick={() => router.push(`/view-booking/${it.id}`)}
                          style={{ cursor: "pointer" }}
                        >
                          <td style={{ ...td, fontWeight: 900, whiteSpace: "nowrap" }}>{it.jobNumber}</td>
                          <td style={td}>{it.vehicles?.join(", ") || "—"}</td>
                          <td style={td}>{it.equipment || "—"}</td>
                          <td style={td}>{it.notes || "—"}</td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>{it.start ? moment(it.start).format("MMM D, YYYY") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: UI.muted, fontSize: 13 }}>No jobs starting in the next 2 days.</div>
              )}
            </section>

            {/* Maintenance buckets */}
            <section style={{ gridColumn: "span 12", ...card }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <h2 style={cardTitle}>MOT & Service</h2>
                  <div style={cardHint}>Overdue and due soon (next 3 weeks).</div>
                </div>
                <span style={chip}>Vehicles</span>
              </div>

              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                <Bucket title={`MOT Overdue (${overdueMOT.length})`} items={overdueMOT} />
                <Bucket title={`Service Overdue (${overdueService.length})`} items={overdueService} />
                <Bucket title={`MOT ≤ 3 Weeks (${motDueSoon.length})`} items={motDueSoon} />
                <Bucket title={`Service ≤ 3 Weeks (${serviceDueSoon.length})`} items={serviceDueSoon} />
              </div>
            </section>

            {/* Assistant */}
            <section style={{ gridColumn: "span 12", ...card }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <h2 style={cardTitle}>Assistant</h2>
                  <div style={cardHint}>Ask about bookings, holidays and vehicle maintenance.</div>
                </div>
                <span style={chip}>AI</span>
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the assistant about bookings, holidays and vehicle maintenance etc."
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  borderRadius: UI.radiusSm,
                  border: "1px solid #d1d5db",
                  outline: "none",
                }}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={askAssistant} disabled={loading} style={btnPrimary} type="button">
                  {loading ? "Asking…" : "Ask assistant"}
                </button>
                <button onClick={() => setInput("")} style={btnGhost} type="button">
                  Clear
                </button>
              </div>

              {response ? (
                <div
                  style={{
                    marginTop: 12,
                    whiteSpace: "pre-wrap",
                    background: "#f8fafc",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    color: UI.text,
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Assistant</div>
                  <div style={{ color: UI.text, fontSize: 14 }}>{response}</div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </HeaderSidebarLayout>
    </ProtectedRoute>
  );
}
