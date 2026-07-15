// src/app/dashboard/page.js
"use client";

import "./home.layout.css";
import layoutStyles from "./page.styles.module.css";

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

const pageWrap = { padding: "16px 16px 32px", background: "var(--color-canvas)", minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  marginBottom: 12,
  flexWrap: "wrap",
};
const h1 = {
  color: "var(--color-text)",
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 800,
  letterSpacing: 0,
  margin: 0,
};
const sub = { color: "var(--color-text-muted)", fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const surface = { background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "var(--border-default)", boxShadow: "var(--shadow-sm)" };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${"var(--color-brand-border)"}`,
  background: "var(--color-brand-soft)",
  color: "var(--color-text)",
  fontSize: 11.5,
  fontWeight: 800,
};

const card = {
  ...surface,
  padding: 12,
  background: "var(--color-surface)",
};

const cardTitle = { fontWeight: 900, fontSize: 16, margin: 0, color: "var(--color-text)", letterSpacing: 0 };
const cardHint = { color: "var(--color-text-muted)", fontSize: 12.5, marginTop: 4, lineHeight: 1.4 };

const grid = (cols = 12) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: "var(--space-3)",
});

const btnChip = (active) => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: active ? `1px solid ${"var(--color-brand)"}` : `1px solid ${"var(--color-brand-border)"}`,
  boxShadow: active ? "0 8px 18px rgba(24,63,103,0.14)" : "none",
  background: active ? "var(--color-brand)" : "var(--legacy-color-fff)",
  color: active ? "var(--legacy-color-fff)" : "var(--color-text)",
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

const iconBox = (color = "var(--color-brand)", bg = "var(--color-brand-soft)", border = "var(--color-brand-border)") => ({
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
  border: `1px solid ${"var(--color-brand-border)"}`,
  background: "var(--color-brand-soft)",
  color: "var(--color-brand)",
  fontSize: 10.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const executivePanel = {
  ...surface,
  background: "var(--color-surface)",
  color: "var(--color-text)",
  padding: 12,
};

const executiveGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: "var(--space-3)",
  marginBottom: "var(--space-3)" - 2,
};

const executiveStat = {
  borderRadius: "var(--radius-md)",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  padding: 10,
  minWidth: 0,
};

const tableWrap = {
  overflow: "auto",
  border: "var(--border-default)",
  borderRadius: "var(--radius-md)",
  background: "var(--legacy-color-fff)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
};
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: "var(--border-default)",
  position: "sticky",
  top: 0,
  background: "var(--legacy-color-f7f9fc)",
  zIndex: 1,
  whiteSpace: "nowrap",
  fontWeight: 800,
  fontSize: 12,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td = { padding: "9px 10px", borderBottom: "var(--border-default)", verticalAlign: "top" };

const listReset = { listStyle: "none", padding: 0, margin: 0 };
const liItem = {
  border: "var(--border-default)",
  borderRadius: "var(--radius-md)",
  padding: "9px 11px",
  marginBottom: 7,
  background: "var(--legacy-color-fff)",
  display: "grid",
  gap: 3,
  boxShadow: "var(--shadow-sm)",
};
const tag = (kind) => {
  const map = {
    "first pencil": { bg: "var(--legacy-color-e4edf8)", border: "var(--legacy-color-bfd0e2)", col: "var(--legacy-color-2f4e6f)" },
    "second pencil": { bg: "var(--legacy-color-f8e7e3)", border: "var(--legacy-color-e0b9b0)", col: "var(--legacy-color-7b3a32)" },
    confirmed: { bg: "var(--legacy-color-e9f0d8)", border: "var(--legacy-color-bed0ae)", col: "var(--legacy-color-31462f)" },
  };
  const t = map[kind] || { bg: "var(--color-brand-soft)", border: "var(--color-brand-border)", col: "var(--color-brand)" };
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
  borderRadius: "var(--radius-md)",
  border: `1px solid ${"var(--color-brand)"}`,
  background: "var(--color-brand)",
  color: "var(--legacy-color-fff)",
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
  borderRadius: "var(--radius-md)",
  border: `1px solid ${"var(--color-brand-border)"}`,
  background: "var(--legacy-color-fff)",
  color: "var(--color-text)",
  fontWeight: 800,
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
      return "var(--legacy-color-f3f970)";
    case "second pencil":
      return "var(--legacy-color-f73939)";
    case "first pencil":
      return "var(--legacy-color-89caf5)";
    case "cancelled":
      return "var(--legacy-color-c2c2c2)";
    case "maintenance":
      return "var(--legacy-color-f97316)";
    case "holiday":
      return "var(--legacy-color-d3d3d3)";
    case "note":
      return "var(--legacy-color-ccfbf1)";
    case "workshop":
      return "var(--legacy-color-da8e58ff)";
    case "complete":
      return "var(--legacy-color-92d18cff)";
    default:
      return "var(--legacy-color-c2c2c2)";
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
      className={layoutStyles.extracted1}
    >
      <div className={layoutStyles.extracted2}>{value}</div>
      <div className={layoutStyles.extracted3}>
        {label}
      </div>
    </div>
  );
}

function Bucket({ title, items }) {
  return (
    <div className={layoutStyles.extracted4}>
      <div className={layoutStyles.extracted5}>
        <div className={layoutStyles.extracted6}>{title}</div>
        <span style={{ ...chip, padding: "4px 8px", fontSize: 10.5 }}>Top 5</span>
      </div>
      {items && items.length ? (
        <ul className={layoutStyles.extracted7}>
          {items.slice(0, 5).map((v) => (
            <li key={v.id} className={layoutStyles.extracted8}>
              <div className={layoutStyles.extracted9}>
                <strong className={layoutStyles.extracted10}>
                  {v.name || v.registration || "-"}
                </strong>
                <span className={layoutStyles.extracted11}>{v.category || "-"}</span>
              </div>
              <div className={layoutStyles.extracted12}>
                MOT: {v.nextMOT ? moment(v.nextMOT).format("MMM D, YYYY") : "-"} | Service:{" "}
                {v.nextService ? moment(v.nextService).format("MMM D, YYYY") : "-"}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={layoutStyles.extracted13}>None.</div>
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
        <div className={layoutStyles.extracted14}>
          <div className={layoutStyles.extracted15}>
            <div>
              <h1 className={layoutStyles.extracted16}>Home</h1>
              <div className={layoutStyles.extracted17}>Live operations overview for booking activity, preparation, scheduling conflicts and fleet readiness.</div>
            </div>
            <div className={layoutStyles.extracted18}>
              <span style={chip}>Operations overview</span>
              <span
                style={{
                  ...chip,
                  background:
                    dataState.status === "ready"
                      ? "var(--legacy-color-ecfdf5)"
                      : dataState.status === "denied" || dataState.status === "error"
                        ? "var(--legacy-color-fef2f2)"
                        : "var(--legacy-color-fffbeb)",
                  borderColor:
                    dataState.status === "ready"
                      ? "var(--legacy-color-bbf7d0)"
                      : dataState.status === "denied" || dataState.status === "error"
                        ? "var(--legacy-color-fecaca)"
                        : "var(--legacy-color-fde68a)",
                  color:
                    dataState.status === "ready"
                      ? "var(--legacy-color-166534)"
                      : dataState.status === "denied" || dataState.status === "error"
                        ? "var(--legacy-color-991b1b)"
                        : "var(--legacy-color-92400e)",
                }}
                title={dataState.message || "Home data loaded."}
              >
                Data: {dataState.status === "ready" ? "Loaded" : dataState.status}
              </span>
              <span style={{ ...chip, background: "var(--color-brand-soft)", borderColor: "var(--legacy-color-dbeafe)", color: "var(--color-brand)" }}>
                Window: <b className={layoutStyles.extracted19}>{windowDays}d</b>
              </span>
            </div>
          </div>

          {dataState.status !== "ready" && (
            <div
              style={{
                ...surface,
                padding: "10px 12px",
                marginBottom: 12,
                background: dataState.status === "denied" || dataState.status === "error" ? "var(--legacy-color-fef2f2)" : "var(--legacy-color-fffbeb)",
                borderColor: dataState.status === "denied" || dataState.status === "error" ? "var(--legacy-color-fecaca)" : "var(--legacy-color-fde68a)",
                color: dataState.status === "denied" || dataState.status === "error" ? "var(--legacy-color-991b1b)" : "var(--legacy-color-92400e)",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {dataState.message || "Loading home data..."}
            </div>
          )}

          <div className="home-puzzle-grid">
            <section className={`home-tile home-window-tile ${layoutStyles.extracted78}`} >
              <span className={layoutStyles.extracted20}>
                <CalendarDays size={16} />
                Reporting window
              </span>
              <div className={layoutStyles.extracted21}>
                {[7, 14, 30, 90].map((d) => (
                  <button key={d} onClick={() => setWindowDays(d)} style={btnChip(windowDays === d)} type="button">
                    {d}d
                  </button>
                ))}
              </div>
              <div className={layoutStyles.extracted22}>
                {moment(now).format("D MMM")} to {moment(windowEnd).format("D MMM YYYY")}
              </div>
            </section>

            <section className={`home-tile home-stats-tile ${layoutStyles.extracted79}`} >
              <div className="home-stat-grid">
                <StatBlock label="Total Jobs" value={jobCounts.total} />
                <StatBlock label="Enquiry" value={jobCounts.enquiry} />
                <StatBlock label="First Pencil" value={jobCounts["first pencil"]} />
                <StatBlock label="Second Pencil" value={jobCounts["second pencil"]} />
                <StatBlock label="Confirmed" value={jobCounts.confirmed} />
              </div>
            </section>

            <section className={`home-tile home-action-tile ${layoutStyles.extracted80}`} >
              <div className={layoutStyles.extracted23}>
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

            <section className={`home-tile home-calendar-tile ${layoutStyles.extracted81}`} >
              <div className={layoutStyles.extracted24}>
                <div className={layoutStyles.extracted25}>
                  <span style={iconBox()}>
                    <CalendarDays size={17} />
                  </span>
                  <div>
                    <h2 className={layoutStyles.extracted26}>Operations Calendar</h2>
                    <div className={layoutStyles.extracted27}>Review the current booking programme and open any entry for full detail.</div>
                  </div>
                </div>
                <span style={sectionTag}>Month view</span>
              </div>

              <div className={layoutStyles.extracted28}>
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
                    info.el.style.color = "var(--legacy-color-000)";
                    const titleEl = info.el.querySelector(".fc-event-title");
                    if (titleEl) {
                      titleEl.style.color = "var(--legacy-color-000)";
                      titleEl.style.fontWeight = "700";
                    }
                  }}
                />
              </div>

              {/* Legend */}
              <div className={layoutStyles.extracted29}>
                {[
                  { label: "Confirmed", color: "var(--legacy-color-f3f970)" },
                  { label: "First Pencil", color: "var(--legacy-color-89caf5)" },
                  { label: "Second Pencil", color: "var(--legacy-color-f73939)" },
                  { label: "Maintenance", color: "var(--legacy-color-f97316)" },
                  { label: "Holiday", color: "var(--legacy-color-d3d3d3)" },
                  { label: "Note", color: "var(--legacy-color-ccfbf1)" },
                ].map((item) => (
                  <div key={item.label} className={layoutStyles.extracted30}>
                    <div style={{ width: 14, height: 14, backgroundColor: item.color, border: "1px solid var(--legacy-color-d1d5db)", borderRadius: 3 }} />
                    <span className={layoutStyles.extracted31}>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="home-right-rail">
              <div className={`home-tile home-followup-tile ${layoutStyles.extracted82}`} >
                <div className={layoutStyles.extracted32}>
                  <div>
                    <h2 className={layoutStyles.extracted33}>Follow-Up Queue</h2>
                    <div className={layoutStyles.extracted34}>First pencil bookings starting in the next 72 hours.</div>
                  </div>
                  <span style={sectionTag}>{firstPencils72h.length} items</span>
                </div>

                {firstPencils72h.length ? (
                  <ul className={layoutStyles.extracted35}>
                    {firstPencils72h.map((e) => (
                      <li key={e.id} className={layoutStyles.extracted36} onClick={() => setSelectedBookingId(e.id)}>
                        <div className={layoutStyles.extracted37}>
                          <strong className={layoutStyles.extracted38}>{e.jobNumber}</strong>
                          <span className={layoutStyles.extracted39}>{moment(e.start).format("MMM D")}</span>
                        </div>
                        <div className={layoutStyles.extracted40}>{e.client}</div>
                        <div>
                          <span style={tag("first pencil")}>First Pencil</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={layoutStyles.extracted41}>No first pencils in the next 72 hours.</div>
                )}
              </div>

              <div className={`home-tile home-conflict-tile ${layoutStyles.extracted83}`} >
                <div className={layoutStyles.extracted42}>
                  <div>
                    <h2 className={layoutStyles.extracted43}>Scheduling Conflicts</h2>
                    <div className={layoutStyles.extracted44}>Second pencil work overlapping confirmed or first pencil vehicle allocations.</div>
                  </div>
                  <span style={sectionTag}>{clashesSecondVsFirm.length} flagged</span>
                </div>

                {clashesSecondVsFirm.length ? (
                  <ul className={layoutStyles.extracted45}>
                    {clashesSecondVsFirm.slice(0, 8).map((c, i) => (
                      <li key={i} className={layoutStyles.extracted46}>
                        <strong className={layoutStyles.extracted47}>
                          {vehicleLabel(c.vehicle)}
                        </strong>

                        <div className={layoutStyles.extracted48}>
                          2nd: {c.second.jobNumber} ({moment(c.second.start).format("MMM D")} - {moment(c.second.end).format("MMM D")})
                          <span style={tag("second pencil")}>Second</span>
                        </div>

                        <div className={layoutStyles.extracted49}>
                          Firm: {c.firm.jobNumber} ({moment(c.firm.start).format("MMM D")} - {moment(c.firm.end).format("MMM D")})
                          <span style={tag(c.firm.status)}>{c.firm.status}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={layoutStyles.extracted50}>No second-pencil clashes.</div>
                )}
              </div>
            </section>

            <section className={`home-tile home-prep-tile ${layoutStyles.extracted84}`} >
              <div className={layoutStyles.extracted51}>
                <div className={layoutStyles.extracted52}>
                  <span style={iconBox("var(--legacy-color-0f766e)", "var(--legacy-color-f0fdfa)", "var(--legacy-color-99f6e4)")}>
                    <ClipboardList size={17} />
                  </span>
                  <div>
                    <h2 className={layoutStyles.extracted53}>Preparation Queue</h2>
                    <div className={layoutStyles.extracted54}>Upcoming work starting in the next 2 days that may require operational preparation.</div>
                  </div>
                </div>
                <span style={sectionTag}>{prepList.length} upcoming</span>
              </div>

              {prepList.length ? (
                <div className={layoutStyles.extracted55}>
                  <table className={layoutStyles.extracted56}>
                    <thead>
                      <tr>
                        <th className={layoutStyles.extracted57}>Job #</th>
                        <th className={layoutStyles.extracted58}>Vehicles</th>
                        <th className={layoutStyles.extracted59}>Equipment</th>
                        <th className={layoutStyles.extracted60}>Notes</th>
                        <th className={layoutStyles.extracted61}>Start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepList.map((it) => (
                        <tr
                          key={it.id}
                          onClick={() => setSelectedBookingId(it.id)}
                          className={layoutStyles.extracted62}
                        >
                          <td className={layoutStyles.extracted63}>{it.jobNumber}</td>
                          <td className={layoutStyles.extracted64}>{it.vehicles?.join(", ") || "-"}</td>
                          <td className={layoutStyles.extracted65}>{it.equipment || "-"}</td>
                          <td className={layoutStyles.extracted66}>{it.notes || "-"}</td>
                          <td className={layoutStyles.extracted67}>{it.start ? moment(it.start).format("MMM D, YYYY") : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={layoutStyles.extracted68}>No jobs starting in the next 2 days.</div>
              )}
            </section>

            <section className={`home-tile home-fleet-tile ${layoutStyles.extracted85}`} >
              <div className={layoutStyles.extracted69}>
                <div className={layoutStyles.extracted70}>
                  <span style={iconBox("var(--color-accent)", "var(--color-accent-soft)", "var(--legacy-color-dcc8b8)")}>
                    <Wrench size={17} />
                  </span>
                  <div>
                    <h2 className={layoutStyles.extracted71}>Fleet Compliance</h2>
                    <div className={layoutStyles.extracted72}>Overdue items and due dates within the next 3 weeks.</div>
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

            <section className={`home-tile home-assistant-tile ${layoutStyles.extracted86}`} >
              <div className={layoutStyles.extracted73}>
                <div className={layoutStyles.extracted74}>
                  <span style={iconBox("var(--legacy-color-1f4b7a)", "var(--legacy-color-edf3f8)", "var(--legacy-color-c8d6e3)")}>
                    <Plus size={17} />
                  </span>
                  <div>
                    <h2 className={layoutStyles.extracted75}>Quick Actions</h2>
                    <div className={layoutStyles.extracted76}>Open the core operational sections from the home hub.</div>
                  </div>
                </div>
                <span style={sectionTag}>v1.0 links</span>
              </div>
              <div className={layoutStyles.extracted77}>
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
