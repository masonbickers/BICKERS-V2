// src/app/dashboard/page.js
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../components/ProtectedRoute";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import ViewBookingModal from "../components/ViewBookingModal";
import DashboardMaintenanceModal from "../components/DashboardMaintenanceModal";
import RouteLoadingOverlay from "../components/RouteLoadingOverlay";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

import moment from "moment";
import { db } from "../../../firebaseConfig";
import { getDocs } from "firebase/firestore";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
} from "@/app/utils/firestoreAccess";
import { buildAssetLabel } from "../utils/maintenanceSchema";
import {
  buildBookedMetaByVehicle,
  buildMaintenanceBookingEvents,
  buildMaintenanceJobEvents,
  buildVehicleDueEvents,
} from "../utils/maintenanceCalendar";
import { syncEightWeekInspectionRollovers } from "../utils/inspectionRollover";
import {
  CalendarDays,
  ClipboardList,
  Plus,
  Users,
  Car,
  Wrench,
  Package,
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
  .home-puzzle-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    align-items: stretch;
    grid-auto-flow: dense;
  }
  .home-tile {
    min-width: 0;
    height: 100%;
  }
  .home-window-tile { grid-column: span 3; }
  .home-stats-tile { grid-column: span 7; }
  .home-action-tile { grid-column: span 2; }
  .home-calendar-tile { grid-column: span 7; }
  .home-right-rail {
    grid-column: span 5;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-height: 0;
  }
  .home-followup-tile,
  .home-conflict-tile {
    grid-column: 1 / -1;
    overflow: auto;
  }
  .home-prep-tile { grid-column: span 6; }
  .home-fleet-tile { grid-column: span 3; }
  .home-assistant-tile { grid-column: span 3; }
  .home-stat-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    height: 100%;
  }
  .home-fleet-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr;
  }
  .home-calendar-tile .fc {
    font-size: 12px;
  }
  .home-calendar-tile .fc .fc-toolbar {
    gap: 8px;
    margin-bottom: 8px;
  }
  .home-calendar-tile .fc .fc-toolbar-title {
    font-size: 16px;
    font-weight: 900;
  }
  .home-calendar-tile .fc .fc-button {
    padding: 4px 7px;
    font-size: 11px;
    font-weight: 800;
  }
  .home-calendar-tile .fc .fc-daygrid-day-frame {
    min-height: 66px;
  }
  .home-calendar-tile .fc .fc-event {
    border-radius: 4px;
    padding: 1px 3px;
    font-size: 11px;
  }
  @media (max-width: 1280px) {
    .home-window-tile,
    .home-stats-tile,
    .home-action-tile,
    .home-calendar-tile,
    .home-right-rail,
    .home-prep-tile,
    .home-fleet-tile,
    .home-assistant-tile {
      grid-column: 1 / -1 !important;
    }
    .home-right-rail {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      grid-template-rows: auto !important;
    }
    .home-followup-tile,
    .home-conflict-tile {
      grid-column: span 1 !important;
      overflow: visible !important;
    }
    .home-stat-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    }
  }
  @media (max-width: 760px) {
    .home-puzzle-grid,
    .home-right-rail,
    .home-stat-grid,
    .home-fleet-grid {
      grid-template-columns: 1fr !important;
    }
    .home-followup-tile,
    .home-conflict-tile {
      grid-column: 1 / -1 !important;
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
    case "note":
      return "#ccfbf1";
    case "workshop":
      return "#da8e58ff";
    case "complete":
      return "#92d18cff";
    default:
      return "#c2c2c2";
  }
};

const asHolidayEvent = (docSnap) => {
  const data = docSnap.data() || {};
  const start = toJSDate(data.startDate);
  const end = toJSDate(data.endDate || data.startDate) || start;
  if (!start) return null;
  const safeStart = startOfDay(start);
  const safeEnd = end && end >= start ? startOfDay(end) : safeStart;
  return {
    id: docSnap.id,
    title: `${data.employee || data.employeeCode || "Employee"} - Holiday`,
    start: safeStart,
    end: new Date(safeEnd.getFullYear(), safeEnd.getMonth(), safeEnd.getDate() + 1),
    allDay: true,
    status: "holiday",
    employee: data.employee || data.employeeCode || "Employee",
  };
};

const asNoteEvent = (docSnap) => {
  const data = docSnap.data() || {};
  const date = toJSDate(data.date);
  if (!date) return null;
  const day = startOfDay(date);
  return {
    id: docSnap.id,
    title: data.text || "Note",
    start: day,
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1),
    allDay: true,
    status: "note",
  };
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
        gap: 4,
        minWidth: 0,
        padding: "10px 11px",
        alignContent: "center",
        minHeight: 74,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 900, color: UI.text, lineHeight: 0.95 }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
    </div>
  );
}

function Bucket({ title, items }) {
  return (
    <div style={{ ...surface, padding: 10 }}>
      <div style={sectionHeader}>
        <div style={{ fontWeight: 900, fontSize: 15, color: UI.text }}>{title}</div>
        <span style={{ ...chip, padding: "4px 8px", fontSize: 10.5 }}>Top 5</span>
      </div>
      {items && items.length ? (
        <ul style={listReset}>
          {items.slice(0, 5).map((v) => (
            <li key={v.id} style={{ ...liItem, padding: "8px 9px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ color: UI.text }}>
                  {v.name || v.registration || "-"}
                </strong>
                <span style={{ color: UI.muted, fontSize: 12 }}>{v.category || "-"}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#374151" }}>
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
  const authAccess = useAuth() || {};
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      loading: authAccess.loading,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.loading, authAccess.user, authAccess.userDoc]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [bookings, setBookings] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState(null);
  const [dataState, setDataState] = useState({ status: "loading", message: "" });
  const [createBookingOpening, setCreateBookingOpening] = useState(false);
  const [createBookingProgress, setCreateBookingProgress] = useState(0);

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
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) {
      setDataState({ status: "loading", message: "Loading home data..." });
      return;
    }
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "read home data" });
      setBookings([]);
      setVehicles([]);
      setMaintenanceBookings([]);
      setMaintenanceJobs([]);
      setHolidays([]);
      setNotes([]);
      setDataState({
        status: "denied",
        message: gate.reason || "This account cannot access company dashboard data.",
      });
      return;
    }

    const run = async () => {
      setDataState({ status: "loading", message: "Loading home data..." });
      const loadCollection = async (collectionName, mapDocs) => {
        try {
          const snap = await getDocs(tenantCollectionQuery(db, collectionName, dataAccessState));
          console.log("[home] loaded", { collectionName, count: snap.size });
          return { ok: true, rows: mapDocs(snap) };
        } catch (error) {
          handleFirestoreAccessError(error, { collectionName, operation: "read home data" });
          console.error("[home] collection failed", { collectionName, code: error?.code, message: error?.message });
          return { ok: false, rows: [] };
        }
      };

      const [bookingResult, vehicleResult, maintenanceBookingResult, maintenanceJobResult, holidayResult, noteResult] =
        await Promise.all([
          loadCollection("bookings", (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          loadCollection("vehicles", (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          loadCollection("maintenanceBookings", (snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
          loadCollection("maintenanceJobs", (snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
          loadCollection("holidays", (snap) => snap.docs.map(asHolidayEvent).filter(Boolean)),
          loadCollection("notes", (snap) => snap.docs.map(asNoteEvent).filter(Boolean)),
        ]);

      setBookings(bookingResult.rows);
      setVehicles(vehicleResult.rows);
      setMaintenanceBookings(maintenanceBookingResult.rows);
      setMaintenanceJobs(maintenanceJobResult.rows);
      setHolidays(holidayResult.rows);
      setNotes(noteResult.rows);

      const failed = [
        ["bookings", bookingResult],
        ["vehicles", vehicleResult],
        ["maintenanceBookings", maintenanceBookingResult],
        ["maintenanceJobs", maintenanceJobResult],
        ["holidays", holidayResult],
        ["notes", noteResult],
      ].filter(([, result]) => !result.ok);

      if (failed.length) {
        setDataState({
          status: "error",
          message: `Some home data could not be loaded: ${failed.map(([name]) => name).join(", ")}.`,
        });
        return;
      }

      setDataState({ status: "ready", message: "" });
    };
    run().catch((error) => {
      if (!handleFirestoreAccessError(error, { collectionName: "home", operation: "read home data" })) {
        console.error("[home] data load error:", error);
      }
      setDataState({
        status: "error",
        message: "Home data could not be loaded. Check account permissions and try again.",
      });
    });
  }, [accessKey, dataAccessState]);

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
  const homeCalendarEvents = useMemo(
    () => [
      ...events.map((e) => ({
        id: `booking__${e.id}`,
        title: `${e.jobNumber} - ${e.client}`,
        start: e.start,
        end: e.end,
        allDay: true,
        status: e.status,
        sourceType: "booking",
        sourceId: e.id,
        backgroundColor: getColorByStatus(e.status),
      })),
      ...holidays.map((h) => ({
        ...h,
        id: `holiday__${h.id}`,
        sourceType: "holiday",
        sourceId: h.id,
        backgroundColor: getColorByStatus("holiday"),
      })),
      ...notes.map((n) => ({
        ...n,
        id: `note__${n.id}`,
        sourceType: "note",
        sourceId: n.id,
        backgroundColor: getColorByStatus("note"),
      })),
      ...maintenanceCalendarEvents.map((m) => ({
        ...m,
        id: `maintenance__${m.id}`,
        sourceType: "maintenance",
        sourceId: m.id,
        backgroundColor: getColorByStatus("maintenance"),
      })),
    ],
    [events, holidays, maintenanceCalendarEvents, notes]
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

  useEffect(() => {
    if (!createBookingOpening) return undefined;

    const timer = setInterval(() => {
      setCreateBookingProgress((current) => {
        if (current >= 95) return current;
        const step = current < 45 ? 9 : current < 75 ? 5 : 2;
        return Math.min(95, current + step);
      });
    }, 320);

    return () => clearInterval(timer);
  }, [createBookingOpening]);

  const openCreateBooking = useCallback(() => {
    if (createBookingOpening) return;
    setCreateBookingOpening(true);
    setCreateBookingProgress(8);

    setTimeout(() => {
      try {
        router.push("/create-booking");
      } catch (error) {
        console.error("Open create booking failed:", error);
        setCreateBookingOpening(false);
        setCreateBookingProgress(0);
        alert("Failed to open create booking. Please try again.");
      }
    }, 80);
  }, [createBookingOpening, router]);

  return (
    <ProtectedRoute>
      <HeaderSidebarLayout>
        <style>{homeResponsiveCss}</style>
        <div style={pageWrap}>
          <div style={headerBar}>
            <div>
              <h1 style={h1}>Home</h1>
              <div style={sub}>Live operations overview for booking activity, preparation, scheduling conflicts and fleet readiness.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chip}>Operations overview</span>
              <span
                style={{
                  ...chip,
                  background:
                    dataState.status === "ready"
                      ? "#ecfdf5"
                      : dataState.status === "denied" || dataState.status === "error"
                        ? "#fef2f2"
                        : "#fffbeb",
                  borderColor:
                    dataState.status === "ready"
                      ? "#bbf7d0"
                      : dataState.status === "denied" || dataState.status === "error"
                        ? "#fecaca"
                        : "#fde68a",
                  color:
                    dataState.status === "ready"
                      ? "#166534"
                      : dataState.status === "denied" || dataState.status === "error"
                        ? "#991b1b"
                        : "#92400e",
                }}
                title={dataState.message || "Home data loaded."}
              >
                Data: {dataState.status === "ready" ? "Loaded" : dataState.status}
              </span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
                Window: <b style={{ marginLeft: 6 }}>{windowDays}d</b>
              </span>
            </div>
          </div>

          {dataState.status !== "ready" && (
            <div
              style={{
                ...surface,
                padding: "10px 12px",
                marginBottom: 12,
                background: dataState.status === "denied" || dataState.status === "error" ? "#fef2f2" : "#fffbeb",
                borderColor: dataState.status === "denied" || dataState.status === "error" ? "#fecaca" : "#fde68a",
                color: dataState.status === "denied" || dataState.status === "error" ? "#991b1b" : "#92400e",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {dataState.message || "Loading home data..."}
            </div>
          )}

          <div className="home-puzzle-grid">
            <section className="home-tile home-window-tile" style={{ ...executivePanel, display: "grid", gap: 10 }}>
              <span style={{ ...titleRow, color: UI.text, fontSize: 13, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                <CalendarDays size={16} />
                Reporting window
              </span>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {[7, 14, 30, 90].map((d) => (
                  <button key={d} onClick={() => setWindowDays(d)} style={btnChip(windowDays === d)} type="button">
                    {d}d
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                {moment(now).format("D MMM")} to {moment(windowEnd).format("D MMM YYYY")}
              </div>
            </section>

            <section className="home-tile home-stats-tile" style={{ ...card, padding: 8 }}>
              <div className="home-stat-grid">
                <StatBlock label="Total Jobs" value={jobCounts.total} />
                <StatBlock label="Enquiry" value={jobCounts.enquiry} />
                <StatBlock label="First Pencil" value={jobCounts["first pencil"]} />
                <StatBlock label="Second Pencil" value={jobCounts["second pencil"]} />
                <StatBlock label="Confirmed" value={jobCounts.confirmed} />
              </div>
            </section>

            <section className="home-tile home-action-tile" style={{ ...card, display: "grid", gap: 8, alignContent: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Primary action
              </div>
              <button
                type="button"
                disabled={createBookingOpening}
                style={{
                  ...btnPrimary,
                  width: "100%",
                  cursor: createBookingOpening ? "wait" : "pointer",
                  opacity: createBookingOpening ? 0.82 : 1,
                }}
                onClick={openCreateBooking}
              >
                <Plus size={14} />
                {createBookingOpening ? `Opening ${createBookingProgress}%` : "Create booking"}
              </button>
            </section>

            <section className="home-tile home-calendar-tile" style={card}>
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
                  height={462}
                  dayMaxEventRows={3}
                  moreLinkClick="popover"
                  events={homeCalendarEvents}
                  eventClick={(info) => {
                    const id = info.event.extendedProps?.sourceId || info.event.id;
                    const sourceType = info.event.extendedProps?.sourceType || "";
                    if (!id) return;
                    if (sourceType === "maintenance") {
                      const maintenanceEvent = maintenanceCalendarEvents.find((event) => event.id === id);
                      if (!maintenanceEvent) return;
                      if (maintenanceEvent.__collection === "maintenanceJobs") {
                        router.push("/maintenance-jobs");
                        return;
                      }
                      setSelectedMaintenanceEvent(maintenanceEvent);
                      return;
                    }
                    if (sourceType === "holiday") {
                      router.push(`/edit-holiday/${encodeURIComponent(id)}`);
                      return;
                    }
                    if (sourceType === "note") {
                      router.push(`/edit-note/${encodeURIComponent(id)}`);
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
                  { label: "Holiday", color: "#d3d3d3" },
                  { label: "Note", color: "#ccfbf1" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 14, height: 14, backgroundColor: item.color, border: "1px solid #d1d5db", borderRadius: 3 }} />
                    <span style={{ fontSize: 13, color: UI.text, fontWeight: 800 }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="home-right-rail">
              <div className="home-tile home-followup-tile" style={card}>
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

              <div className="home-tile home-conflict-tile" style={card}>
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

            <section className="home-tile home-prep-tile" style={card}>
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
                <div style={{ ...tableWrap, maxHeight: 330 }}>
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

            <section className="home-tile home-fleet-tile" style={card}>
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

              <div className="home-fleet-grid">
                <Bucket title={`MOT Overdue (${overdueMOT.length})`} items={overdueMOT} />
                <Bucket title={`Service Overdue (${overdueService.length})`} items={overdueService} />
                <Bucket title={`MOT due in 3 weeks (${motDueSoon.length})`} items={motDueSoon} />
                <Bucket title={`Service due in 3 weeks (${serviceDueSoon.length})`} items={serviceDueSoon} />
              </div>
            </section>

            <section className="home-tile home-assistant-tile" style={card}>
              <div style={sectionHeader}>
                <div style={titleRow}>
                  <span style={iconBox("#1f4b7a", "#edf3f8", "#c8d6e3")}>
                    <Plus size={17} />
                  </span>
                  <div>
                    <h2 style={cardTitle}>Quick Actions</h2>
                    <div style={cardHint}>Open the core operational sections from the home hub.</div>
                  </div>
                </div>
                <span style={sectionTag}>v1.0 links</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { label: "Create Booking", href: "/create-booking", icon: <Plus size={14} /> },
                  { label: "Employees", href: "/employee-home", icon: <Users size={14} /> },
                  { label: "Vehicles", href: "/vehicle-home", icon: <Car size={14} /> },
                  { label: "Workshop", href: "/workshop", icon: <Wrench size={14} /> },
                  { label: "Equipment", href: "/equipment", icon: <Package size={14} /> },
                ].map((action) => (
                  <button
                    key={action.href}
                    type="button"
                    onClick={() => router.push(action.href)}
                    style={{ ...btnGhost, width: "100%", justifyContent: "flex-start" }}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
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
        {createBookingOpening && (
          <RouteLoadingOverlay
            progress={createBookingProgress}
            title="Opening create booking"
            hint="Preparing booking form..."
          />
        )}
      </HeaderSidebarLayout>
    </ProtectedRoute>
  );
}
