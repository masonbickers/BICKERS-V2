// src/app/dashboard/page.js
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import ProtectedRoute from "../components/ProtectedRoute";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import ViewBookingModal from "../components/ViewBookingModal";
import DashboardMaintenanceModal from "../components/DashboardMaintenanceModal";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

import moment from "moment";
import { auth, db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { buildAssetLabel } from "../utils/maintenanceSchema";
import {
  buildBookedMetaByVehicle,
  buildMaintenanceBookingEvents,
  buildMaintenanceJobEvents,
  buildVehicleDueEvents,
} from "../utils/maintenanceCalendar";
import { syncEightWeekInspectionRollovers } from "../utils/inspectionRollover";
import {
  Bot,
  CalendarDays,
  ClipboardList,
  Plus,
  Wrench,
} from "lucide-react";

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
─────────────────────────────────────────── */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  accent: "#8b5e3c",
  accentSoft: "#f5ede6",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: UI.gap,
  marginBottom: 12,
  flexWrap: "wrap",
};
const h1 = {
  color: UI.text,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 800,
  letterSpacing: 0,
  margin: 0,
};
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 11.5,
  fontWeight: 800,
};

const card = {
  ...surface,
  padding: 12,
  background: UI.card,
};

const cardTitle = { fontWeight: 900, fontSize: 16, margin: 0, color: UI.text, letterSpacing: 0 };
const cardHint = { color: UI.muted, fontSize: 12.5, marginTop: 4, lineHeight: 1.4 };

const grid = (cols = 12) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const btnChip = (active) => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: active ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
  boxShadow: active ? "0 8px 18px rgba(24,63,103,0.14)" : "none",
  background: active ? UI.brand : "#fff",
  color: active ? "#fff" : UI.text,
  cursor: "pointer",
  fontSize: 12.5,
  fontWeight: 800,
});

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
  flexWrap: "wrap",
};

const titleRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
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

const sectionTag = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  fontSize: 10.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const executivePanel = {
  ...surface,
  background: UI.card,
  color: UI.text,
  padding: 12,
};

const executiveGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: UI.gap,
  marginBottom: UI.gap - 2,
};

const executiveStat = {
  borderRadius: UI.radiusSm,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  padding: 10,
  minWidth: 0,
};

const tableWrap = {
  overflow: "auto",
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: "#fff",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
};
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: UI.border,
  position: "sticky",
  top: 0,
  background: "#f7f9fc",
  zIndex: 1,
  whiteSpace: "nowrap",
  fontWeight: 800,
  fontSize: 12,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td = { padding: "9px 10px", borderBottom: UI.border, verticalAlign: "top" };

const listReset = { listStyle: "none", padding: 0, margin: 0 };
const liItem = {
  border: UI.border,
  borderRadius: UI.radiusSm,
  padding: "9px 11px",
  marginBottom: 7,
  background: "#fff",
  display: "grid",
  gap: 3,
  boxShadow: UI.shadowSm,
};
const tag = (kind) => {
  const map = {
    "first pencil": { bg: "#e4edf8", border: "#bfd0e2", col: "#2f4e6f" },
    "second pencil": { bg: "#f8e7e3", border: "#e0b9b0", col: "#7b3a32" },
    confirmed: { bg: "#e9f0d8", border: "#bed0ae", col: "#31462f" },
  };
  const t = map[kind] || { bg: UI.brandSoft, border: UI.brandBorder, col: UI.brand };
  return {
    display: "inline-block",
    marginLeft: 8,
    padding: "2px 8px",
    fontSize: 11,
    borderRadius: 999,
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.col,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
};

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brand}`,
  background: UI.brand,
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(24,63,103,0.14)",
};
const btnGhost = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brandBorder}`,
  background: "#fff",
  color: UI.text,
  fontWeight: 800,
  cursor: "pointer",
};

const homeResponsiveCss = `
  @media (max-width: 1280px) {
    .home-command-grid,
    .home-main-layout {
      grid-template-columns: 1fr !important;
    }
    .home-stat-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }
  }
  @media (max-width: 760px) {
    .home-stat-grid,
    .home-fleet-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;

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
    jobNumber: b.jobNumber || "-",
    client: b.client || "-",
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

const isApptAfterExpiry = (appt, expiry) => {
  if (!appt || !expiry) return false;
  const a = new Date(appt.getFullYear(), appt.getMonth(), appt.getDate()).getTime();
  const e = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
  return a > e;
};

 

/* ────────────────────────────────────────────────────────────────────────────
   Tiny presentational bits
──────────────────────────────────────────────────────────────────────────── */
function StatBlock({ label, value }) {
  return (
    <div
      style={{
        ...surface,
        display: "grid",
        gap: 6,
        minWidth: 0,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 900, color: UI.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
    </div>
  );
}

function Bucket({ title, items }) {
  return (
    <div style={{ ...surface, padding: 12 }}>
      <div style={sectionHeader}>
        <div style={{ fontWeight: 900, fontSize: 15, color: UI.text }}>{title}</div>
        <span style={chip}>Top 8</span>
      </div>
      {items && items.length ? (
        <ul style={listReset}>
          {items.slice(0, 8).map((v) => (
            <li key={v.id} style={liItem}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ color: UI.text }}>
                  {v.name || v.registration || "-"}
                </strong>
                <span style={{ color: UI.muted, fontSize: 12 }}>{v.category || "-"}</span>
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>
                MOT: {v.nextMOT ? moment(v.nextMOT).format("MMM D, YYYY") : "-"} | Service:{" "}
                {v.nextService ? moment(v.nextService).format("MMM D, YYYY") : "-"}
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
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState(null);

  // Assistant UI
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  // Window filter (days)
  const [windowDays, setWindowDays] = useState(30);

  const vehicleNameById = useMemo(() => {
    const map = new Map();
    vehicles.forEach((v) => {
      if (!v?.id) return;
      const label = String(v.name || v.registration || v.reg || v.id).trim();
      map.set(String(v.id).trim(), label);
    });
    return map;
  }, [vehicles]);

  const vehicleLabel = useCallback((v) => {
    if (v && typeof v === "object") return v.name || v.registration || v.reg || "Vehicle";
    const key = String(v || "").trim();
    return vehicleNameById.get(key) || key || "Vehicle";
  }, [vehicleNameById]);

  // Fetch data
  useEffect(() => {
    const run = async () => {
      const snap = await getDocs(collection(db, "bookings"));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(rows);

      const vSnap = await getDocs(collection(db, "vehicles"));
      setVehicles(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const mSnap = await getDocs(collection(db, "maintenanceBookings"));
      setMaintenanceBookings(mSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));

      const mjSnap = await getDocs(collection(db, "maintenanceJobs"));
      setMaintenanceJobs(mjSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };
    run();
  }, []);

  useEffect(() => {
    syncEightWeekInspectionRollovers({
      db,
      vehicles,
      maintenanceBookings,
      loggerPrefix: "[home] inspection rollover",
    }).catch(() => {});
  }, [vehicles, maintenanceBookings]);

  /* ────────────────────────────────────────────────────────────────────────
     Derived: events + windows
  ───────────────────────────────────────────────────────────────────────── */
  const events = useMemo(() => bookings.map(asEvent), [bookings]);

  const maintenanceJobEvents = useMemo(
    () =>
      buildMaintenanceJobEvents(maintenanceJobs, {
        includeStatus: true,
        statusLabel: "maintenance",
      }),
    [maintenanceJobs]
  );

  const maintenanceBookedMetaByVehicle = useMemo(() => {
    return buildBookedMetaByVehicle(maintenanceBookings);
  }, [maintenanceBookings]);

  const maintenanceBookingEvents = useMemo(
    () =>
      buildMaintenanceBookingEvents(maintenanceBookings, {
        getVehicleLabel: (booking) =>
          booking.vehicleLabel || booking.vehicleName || booking.title || booking.jobNumber || "Vehicle",
        groupConsecutiveDates: true,
        titleSeparator: " - ",
        statusLabel: "maintenance",
      }),
    [maintenanceBookings]
  );

  const motServiceDueEvents = useMemo(() => {
    return buildVehicleDueEvents(vehicles, {
      bookedMetaByVehicle: maintenanceBookedMetaByVehicle,
      getVehicleLabel: (vehicle) => buildAssetLabel(vehicle) || vehicleLabel(vehicle),
      isApptAfterExpiry,
    }).map((event) => {
      return {
        ...event,
        status: "maintenance",
        maintenanceTypeLabel: event.kind,
      };
    });
  }, [vehicles, maintenanceBookedMetaByVehicle, vehicleLabel]);

  const maintenanceCalendarEvents = useMemo(
    () => [...maintenanceBookingEvents, ...maintenanceJobEvents, ...motServiceDueEvents],
    [maintenanceBookingEvents, maintenanceJobEvents, motServiceDueEvents]
  );

  const now = useMemo(() => new Date(), []);
  const in2Days = useMemo(() => new Date(now.getTime() + 2 * 24 * 3600 * 1000), [now]);
  const in3Weeks = useMemo(() => new Date(now.getTime() + 21 * 24 * 3600 * 1000), [now]);

  const windowEnd = useMemo(
    () => new Date(now.getTime() + windowDays * 24 * 3600 * 1000),
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
          vehicles: (e.vehicles || []).map((v) => vehicleLabel(v)),
          equipment: e.equipment.join(", "),
          notes: bookings.find((b) => b.id === e.id)?.notes || "-",
          start: e.start,
        })),
    [events, bookings, now, in2Days, vehicleLabel]
  );

  // Window-scoped JOB COUNTS
  const windowEvents = useMemo(
    () => events.filter((e) => e.start && e.start >= now && e.start <= windowEnd),
    [events, now, windowEnd]
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
      maintenanceCalendarEvents.filter((event) => {
        if (event.kind !== "MOT") return false;
        if (event.booked) return false;
        const d = event.dueDate ? toJSDate(event.dueDate) : null;
        return d && d <= in3Weeks && d >= startOfDay(now);
      }),
    [maintenanceCalendarEvents, in3Weeks, now]
  );
  const serviceDueSoon = useMemo(
    () =>
      maintenanceCalendarEvents.filter((event) => {
        if (event.kind !== "SERVICE") return false;
        if (event.booked) return false;
        const d = event.dueDate ? toJSDate(event.dueDate) : null;
        return d && d <= in3Weeks && d >= startOfDay(now);
      }),
    [maintenanceCalendarEvents, in3Weeks, now]
  );
  const overdueMOT = useMemo(
    () =>
      maintenanceCalendarEvents.filter((event) => {
        if (event.kind !== "MOT") return false;
        if (event.booked) return false;
        const d = event.dueDate ? toJSDate(event.dueDate) : null;
        return d && d < startOfDay(now);
      }),
    [maintenanceCalendarEvents, now]
  );
  const overdueService = useMemo(
    () =>
      maintenanceCalendarEvents.filter((event) => {
        if (event.kind !== "SERVICE") return false;
        if (event.booked) return false;
        const d = event.dueDate ? toJSDate(event.dueDate) : null;
        return d && d < startOfDay(now);
      }),
    [maintenanceCalendarEvents, now]
  );

  // Assistant call
  const askAssistant = async () => {
    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken?.();
      if (!idToken) {
        throw new Error("Please sign in again.");
      }

      const res = await fetch("/api/chatgpt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ prompt: input }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Something went wrong.");
      }
      const data = await res.json();
      setResponse(data.reply || "No response.");
    } catch (err) {
      console.error(err);
      setResponse(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <HeaderSidebarLayout>
        <style>{homeResponsiveCss}</style>
        <div style={pageWrap}>
          {/* Header */}
          <div style={headerBar}>
            <div>
              <h1 style={h1}>Home</h1>
              <div style={sub}>Executive operations overview for booking activity, preparation, scheduling conflicts and fleet readiness.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chip}>Operations overview</span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
                Window: <b style={{ marginLeft: 6 }}>{windowDays}d</b>
              </span>
            </div>
          </div>

          <div
            className="home-command-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(300px, 0.62fr) minmax(0, 1.38fr)",
              gap: UI.gap,
              marginBottom: UI.gap,
              alignItems: "stretch",
            }}
          >
          {/* Window filter */}
          <div style={{ ...executivePanel, marginBottom: 0 }}>
            <div style={{ ...sectionHeader, marginBottom: 0 }}>
              <span style={{ ...titleRow, color: UI.text, fontSize: 13, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                <CalendarDays size={16} />
                Reporting window
              </span>
              {[7, 14, 30, 90].map((d) => (
                <button key={d} onClick={() => setWindowDays(d)} style={btnChip(windowDays === d)} type="button">
                  {d} days
                </button>
              ))}
              <span style={{ marginLeft: 8, fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                {moment(now).format("D MMM")} to {moment(windowEnd).format("D MMM YYYY")}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="home-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: UI.gap, marginBottom: 0 }}>
            <div>
              <StatBlock label="Total Jobs" value={jobCounts.total} />
            </div>
            <div>
              <StatBlock label="Enquiry" value={jobCounts.enquiry} />
            </div>
            <div>
              <StatBlock label="First Pencil" value={jobCounts["first pencil"]} />
            </div>
            <div>
              <StatBlock label="Second Pencil" value={jobCounts["second pencil"]} />
            </div>
            <div>
              <StatBlock label="Confirmed" value={jobCounts.confirmed} />
            </div>
            <div>
              <div style={{ ...surface, padding: 12, display: "grid", gap: 8, minWidth: 160, background: UI.card }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Primary action
                </div>
                <div style={{ color: UI.text, fontSize: 13, lineHeight: 1.45 }}>
                  Create a booking directly from the operations overview.
                </div>
                <button type="button" style={btnPrimary} onClick={() => router.push("/create-booking")}>
                  <Plus size={14} />
                  Create booking
                </button>
              </div>
            </div>
          </div>
          </div>

          {/* Main grid */}
          <div
            className="home-main-layout"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.55fr) minmax(360px, 0.95fr)",
              gap: UI.gap,
              alignItems: "start",
            }}
          >
            {/* Calendar */}
            <section style={{ gridColumn: "auto", ...card }}>
              <div style={sectionHeader}>
                <div style={titleRow}>
                  <span style={iconBox()}>
                    <CalendarDays size={17} />
                  </span>
                  <div>
                    <h2 style={cardTitle}>Operations Calendar</h2>
                    <div style={cardHint}>Review the current booking programme and open any entry for full detail.</div>
                  </div>
                </div>
                <span style={sectionTag}>Month view</span>
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
                    ...maintenanceCalendarEvents.map((m) => ({
                      ...m,
                      backgroundColor: getColorByStatus("maintenance"),
                    })),
                  ]}
                  eventClick={(info) => {
                    const id = info.event.id;
                    if (!id) return;
                    const maintenanceEvent = maintenanceCalendarEvents.find((event) => event.id === id);
                    if (maintenanceEvent) {
                      if (maintenanceEvent.__collection === "maintenanceJobs") {
                        router.push("/maintenance-jobs");
                        return;
                      }
                      setSelectedMaintenanceEvent(maintenanceEvent);
                      return;
                    }
                    setSelectedBookingId(id);
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
            <section style={{ gridColumn: "auto", display: "grid", gap: UI.gap }}>
              <div style={card}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={cardTitle}>Follow-Up Queue</h2>
                    <div style={cardHint}>First pencil bookings starting in the next 72 hours.</div>
                  </div>
                  <span style={sectionTag}>{firstPencils72h.length} items</span>
                </div>

                {firstPencils72h.length ? (
                  <ul style={listReset}>
                    {firstPencils72h.map((e) => (
                      <li key={e.id} style={{ ...liItem, cursor: "pointer" }} onClick={() => setSelectedBookingId(e.id)}>
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
                <div style={sectionHeader}>
                  <div>
                    <h2 style={cardTitle}>Scheduling Conflicts</h2>
                    <div style={cardHint}>Second pencil work overlapping confirmed or first pencil vehicle allocations.</div>
                  </div>
                  <span style={sectionTag}>{clashesSecondVsFirm.length} flagged</span>
                </div>

                {clashesSecondVsFirm.length ? (
                  <ul style={listReset}>
                    {clashesSecondVsFirm.slice(0, 8).map((c, i) => (
                      <li key={i} style={liItem}>
                        <strong style={{ color: UI.text }}>
                          {vehicleLabel(c.vehicle)}
                        </strong>

                        <div style={{ fontSize: 13, color: "#374151" }}>
                          2nd: {c.second.jobNumber} ({moment(c.second.start).format("MMM D")} - {moment(c.second.end).format("MMM D")})
                          <span style={tag("second pencil")}>Second</span>
                        </div>

                        <div style={{ fontSize: 13, color: "#374151" }}>
                          Firm: {c.firm.jobNumber} ({moment(c.firm.start).format("MMM D")} - {moment(c.firm.end).format("MMM D")})
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
            <section style={{ gridColumn: "auto", ...card }}>
              <div style={sectionHeader}>
                <div style={titleRow}>
                  <span style={iconBox("#0f766e", "#f0fdfa", "#99f6e4")}>
                    <ClipboardList size={17} />
                  </span>
                  <div>
                    <h2 style={cardTitle}>Preparation Queue</h2>
                    <div style={cardHint}>Upcoming work starting in the next 2 days that may require operational preparation.</div>
                  </div>
                </div>
                <span style={sectionTag}>{prepList.length} upcoming</span>
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
                          onClick={() => setSelectedBookingId(it.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <td style={{ ...td, fontWeight: 900, whiteSpace: "nowrap" }}>{it.jobNumber}</td>
                          <td style={td}>{it.vehicles?.join(", ") || "-"}</td>
                          <td style={td}>{it.equipment || "-"}</td>
                          <td style={td}>{it.notes || "-"}</td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>{it.start ? moment(it.start).format("MMM D, YYYY") : "-"}</td>
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
            <section style={{ gridColumn: "auto", ...card }}>
              <div style={sectionHeader}>
                <div style={titleRow}>
                  <span style={iconBox(UI.accent, UI.accentSoft, "#dcc8b8")}>
                    <Wrench size={17} />
                  </span>
                  <div>
                    <h2 style={cardTitle}>Fleet Compliance</h2>
                    <div style={cardHint}>Overdue items and due dates within the next 3 weeks.</div>
                  </div>
                </div>
                <span style={sectionTag}>Vehicle review</span>
              </div>

              <div className="home-fleet-grid" style={{ display: "grid", gap: UI.gap, gridTemplateColumns: "1fr" }}>
                <Bucket title={`MOT Overdue (${overdueMOT.length})`} items={overdueMOT} />
                <Bucket title={`Service Overdue (${overdueService.length})`} items={overdueService} />
                <Bucket title={`MOT due in 3 weeks (${motDueSoon.length})`} items={motDueSoon} />
                <Bucket title={`Service due in 3 weeks (${serviceDueSoon.length})`} items={serviceDueSoon} />
              </div>
            </section>

            {/* Assistant */}
            <section style={{ gridColumn: "1 / -1", ...card }}>
              <div style={sectionHeader}>
                <div style={titleRow}>
                  <span style={iconBox("#7c3aed", "#f5f3ff", "#ddd6fe")}>
                    <Bot size={17} />
                  </span>
                  <div>
                    <h2 style={cardTitle}>Operations Assistant</h2>
                    <div style={cardHint}>Ask about bookings, holidays and fleet maintenance without leaving the page.</div>
                  </div>
                </div>
                <span style={sectionTag}>AI support</span>
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about bookings, holidays, scheduling or fleet maintenance."
                rows={3}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: 14,
                  borderRadius: UI.radiusSm,
                  border: UI.border,
                  background: "#fff",
                  color: UI.text,
                  outline: "none",
                }}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={askAssistant} disabled={loading} style={btnPrimary} type="button">
                  {loading ? "Generating response..." : "Ask assistant"}
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
                    background: "#f7fafc",
                    padding: 14,
                    borderRadius: UI.radiusSm,
                    border: UI.border,
                    color: UI.text,
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Operations Assistant</div>
                  <div style={{ color: UI.text, fontSize: 14 }}>{response}</div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
        {selectedBookingId && (
          <ViewBookingModal
            id={selectedBookingId}
            onClose={() => setSelectedBookingId(null)}
          />
        )}
        {selectedMaintenanceEvent && (
          <DashboardMaintenanceModal
            event={selectedMaintenanceEvent}
            onClose={() => setSelectedMaintenanceEvent(null)}
          />
        )}
      </HeaderSidebarLayout>
    </ProtectedRoute>
  );
}
