// src/app/dashboard/page.js
"use client";

import "./home.layout.css";
import layoutStyles from "./page.styles.module.css";
import styles from "./home.module.css";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../components/ProtectedRoute";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { Alert, Badge, Button, Card, EmptyState, Page, PageHeader, Skeleton } from "@/app/components/ui";
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
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Clock,
  Plus,
  RefreshCw,
  Users,
  Car,
  Wrench,
  Package,
} from "lucide-react";
import {
  buildFleetBuckets,
  buildFollowUpQueue,
  buildPreparationQueue,
  buildSchedulingConflicts,
  buildWindowCounts,
} from "./homeDashboard";

/* ────────────────────────────────────────────────────────────────────────────
   Date + normalisers
──────────────────────────────────────────────────────────────────────────── */
const toJSDate = (val) => {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  return new Date(val);
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const HOME_COLLECTIONS = ["bookings", "vehicles", "maintenanceBookings", "maintenanceJobs", "holidays", "notes"];
const collectionStatus = (status) => Object.fromEntries(HOME_COLLECTIONS.map((name) => [name, status]));

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
      return "var(--color-warning-border)";
    case "second pencil":
      return "var(--color-warning)";
    case "first pencil":
      return "var(--color-info-border)";
    case "cancelled":
      return "var(--shell-muted)";
    case "maintenance":
      return "var(--color-warning)";
    case "holiday":
      return "var(--color-border-strong)";
    case "note":
      return "var(--color-border)";
    case "workshop":
      return "var(--color-accent)";
    case "complete":
      return "var(--color-success-accent)";
    default:
      return "var(--shell-muted)";
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
        <span className={`${layoutStyles.chip} ${layoutStyles.chipCompact}`}>Top 5</span>
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
  const [collectionState, setCollectionState] = useState(() => collectionStatus("loading"));
  const [lastUpdated, setLastUpdated] = useState(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isCompact, setIsCompact] = useState(false);
  const [createBookingOpening, setCreateBookingOpening] = useState(false);
  const [createBookingProgress, setCreateBookingProgress] = useState(0);

  // Window filter (days)
  const [windowDays, setWindowDays] = useState(30);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsCompact(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

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
    let cancelled = false;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) {
      setDataState({ status: "loading", message: "Loading home data..." });
      return () => { cancelled = true; };
    }
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "read home data" });
      setBookings([]);
      setVehicles([]);
      setMaintenanceBookings([]);
      setMaintenanceJobs([]);
      setHolidays([]);
      setNotes([]);
      setCollectionState(collectionStatus("denied"));
      setDataState({
        status: "denied",
        message: gate.reason || "This account cannot access company dashboard data.",
      });
      return () => { cancelled = true; };
    }

    const run = async () => {
      setDataState({ status: "loading", message: "Loading home data..." });
      setCollectionState(collectionStatus("loading"));
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

      if (cancelled) return;

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

      setCollectionState(Object.fromEntries([
        ["bookings", bookingResult],
        ["vehicles", vehicleResult],
        ["maintenanceBookings", maintenanceBookingResult],
        ["maintenanceJobs", maintenanceJobResult],
        ["holidays", holidayResult],
        ["notes", noteResult],
      ].map(([name, result]) => [name, result.ok ? "ready" : "error"])));
      setLastUpdated(new Date());

      if (failed.length) {
        setDataState({
          status: failed.length === HOME_COLLECTIONS.length ? "error" : "partial",
          message: `Some home sections could not be loaded: ${failed.map(([name]) => name).join(", ")}.`,
        });
        return;
      }

      setDataState({ status: "ready", message: "" });
    };
    run().catch((error) => {
      if (cancelled) return;
      if (!handleFirestoreAccessError(error, { collectionName: "home", operation: "read home data" })) {
        console.error("[home] data load error:", error);
      }
      setDataState({
        status: "error",
        message: "Home data could not be loaded. Check account permissions and try again.",
      });
    });
    return () => { cancelled = true; };
  }, [accessKey, dataAccessState, reloadVersion]);

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
        title: `${e.status || "booking"} · ${e.jobNumber} - ${e.client}`,
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
        title: `holiday · ${h.title}`,
        id: `holiday__${h.id}`,
        sourceType: "holiday",
        sourceId: h.id,
        backgroundColor: getColorByStatus("holiday"),
      })),
      ...notes.map((n) => ({
        ...n,
        title: `note · ${n.title}`,
        id: `note__${n.id}`,
        sourceType: "note",
        sourceId: n.id,
        backgroundColor: getColorByStatus("note"),
      })),
      ...maintenanceCalendarEvents.map((m) => ({
        ...m,
        title: `maintenance · ${m.title || m.vehicleLabel || "Vehicle"}`,
        id: `maintenance__${m.id}`,
        sourceType: "maintenance",
        sourceId: m.id,
        backgroundColor: getColorByStatus("maintenance"),
      })),
    ],
    [events, holidays, maintenanceCalendarEvents, notes]
  );

  const now = useMemo(() => new Date(), []);

  const windowEnd = useMemo(
    () => new Date(now.getTime() + windowDays * 24 * 3600 * 1000),
    [now, windowDays]
  );

  // Prep list (next 2 days)
  const prepList = useMemo(
    () => buildPreparationQueue(events, bookings, now, vehicleLabel),
    [events, bookings, now, vehicleLabel]
  );

  // Window-scoped JOB COUNTS
  const jobCounts = useMemo(() => buildWindowCounts(events, now, windowDays), [events, now, windowDays]);

  // Follow-ups (Next 72h)
  const firstPencils72h = useMemo(() => buildFollowUpQueue(events, now), [events, now]);

  // Second vs firm conflicts (vehicle-level)
  const clashesSecondVsFirm = useMemo(() => buildSchedulingConflicts(events), [events]);

  // Maintenance buckets (vehicles, global)
  const { motDueSoon, serviceDueSoon, overdueMOT, overdueService } = useMemo(
    () => buildFleetBuckets(maintenanceCalendarEvents, now),
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

  const bookingDataUnavailable = ["error", "denied"].includes(collectionState.bookings);
  const fleetDataUnavailable = ["vehicles", "maintenanceBookings", "maintenanceJobs"]
    .some((name) => ["error", "denied"].includes(collectionState[name]));
  const initialLoading = dataState.status === "loading" && !lastUpdated;

  return (
    <ProtectedRoute>
      <HeaderSidebarLayout>
        <Page width="fluid">
          <PageHeader
            title="Home"
            subtitle="Live operations overview for booking activity, preparation, scheduling conflicts and fleet readiness."
            actions={<div className={styles.headerActions}>
              <div className={styles.headerControls}>
                <div className={styles.windowControl} aria-label="Reporting window">
                  <span className={styles.windowLabel}><CalendarDays size={14} /> Window</span>
                  {[7, 14, 30, 90].map((days) => (
                    <Button bare
                      key={days}
                      type="button"
                      className={`${styles.windowButton} ${windowDays === days ? styles.windowButtonActive : ""}`}
                      aria-pressed={windowDays === days}
                      onClick={() => setWindowDays(days)}
                    >{days}d</Button>
                  ))}
                </div>
                <Button variant="secondary" onClick={() => setReloadVersion((value) => value + 1)} disabled={dataState.status === "loading"}><RefreshCw size={15} /> Refresh</Button>
                <Button loading={createBookingOpening} onClick={openCreateBooking}><Plus size={15} /> Create booking</Button>
              </div>
              <span className={styles.updated}>
                {lastUpdated ? `Updated ${moment(lastUpdated).format("D MMM YYYY, HH:mm")} · ${moment(now).format("D MMM")}–${moment(windowEnd).format("D MMM YYYY")}` : "Waiting for home data"}
              </span>
            </div>}
          />

          {dataState.status !== "ready" && dataState.status !== "loading" ? (
            <Alert className={styles.statusAlert} variant={dataState.status === "partial" ? "warning" : "danger"}>
              <div className={styles.retryRow}>
                <span>{dataState.message}</span>
                {dataState.status !== "denied" ? <Button size="sm" variant="secondary" onClick={() => setReloadVersion((value) => value + 1)}>Try again</Button> : null}
              </div>
            </Alert>
          ) : null}

          <div className="home-puzzle-grid">
            <section className={`home-tile home-stats-tile ${layoutStyles.extracted79}`} >
              {initialLoading ? <div className="home-stat-grid">{[0,1,2,3,4].map((item) => <Card key={item}><Skeleton height={54} /></Card>)}</div> : (
                <div className="home-stat-grid">
                  <StatBlock label="Total Jobs" value={jobCounts.total} />
                  <StatBlock label="Enquiry" value={jobCounts.enquiry} />
                  <StatBlock label="First Pencil" value={jobCounts["first pencil"]} />
                  <StatBlock label="Second Pencil" value={jobCounts["second pencil"]} />
                  <StatBlock label="Confirmed" value={jobCounts.confirmed} />
                </div>
              )}
            </section>

            <section className={`home-tile home-calendar-tile ${layoutStyles.extracted81}`} >
              <div className={layoutStyles.extracted24}>
                <div className={layoutStyles.extracted25}>
                  <span className={layoutStyles.iconBox}>
                    <CalendarDays size={17} />
                  </span>
                  <div>
                    <h2 className={layoutStyles.extracted26}>Operations Calendar</h2>
                    <div className={layoutStyles.extracted27}>Review the current booking programme and open any entry for full detail.</div>
                  </div>
                </div>
                <Badge variant="info">{isCompact ? "Week view" : "Month view"}</Badge>
              </div>

              <div className={`${layoutStyles.extracted28} ${styles.calendarWrap}`}>
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  key={isCompact ? "compact" : "desktop"}
                  initialView={isCompact ? "dayGridWeek" : "dayGridMonth"}
                  headerToolbar={isCompact
                    ? { left: "prev,next today", center: "title", right: "dayGridWeek,dayGridDay" }
                    : { left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek,dayGridDay" }}
                  height="auto"
                  dayMaxEventRows={isCompact ? 2 : 3}
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
                    info.el.style.color = "var(--color-text)";
                    const accessibleLabel = `${info.event.title}, ${moment(info.event.start).format("D MMM YYYY")}`;
                    info.el.setAttribute("aria-label", accessibleLabel);
                    info.el.setAttribute("title", accessibleLabel);
                    const titleEl = info.el.querySelector(".fc-event-title");
                    if (titleEl) {
                      titleEl.style.color = "var(--color-text)";
                      titleEl.style.fontWeight = "700";
                    }
                  }}
                />
              </div>

              {/* Legend */}
              <div className={layoutStyles.extracted29}>
                {[
                  { label: "Confirmed", color: "var(--job-status-confirmed)" },
                  { label: "First Pencil", color: "var(--job-status-first-pencil)" },
                  { label: "Second Pencil", color: "var(--job-status-second-pencil)" },
                  { label: "Maintenance", color: "var(--color-warning)" },
                  { label: "Holiday", color: "var(--color-border-strong)" },
                  { label: "Note", color: "var(--color-border)" },
                ].map((item) => (
                  <div key={item.label} className={layoutStyles.extracted30}>
                    {/* style-audit-allow runtime: calendar legend colour */}
                    <div className={layoutStyles.legendSwatch} style={{ "--swatch-color": item.color }} />
                    <span className={layoutStyles.extracted31}>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="home-right-rail">
              <div className={`home-tile home-followup-tile ${layoutStyles.extracted82}`} >
                <div className={layoutStyles.extracted32}>
                  <div className={styles.panelHeading}>
                    <span className={styles.iconBox}><Clock size={17} /></span>
                    <div>
                    <h2 className={layoutStyles.extracted33}>Follow-Up Queue</h2>
                    <div className={layoutStyles.extracted34}>First pencil bookings starting in the next 72 hours.</div>
                    </div>
                  </div>
                  <Badge>{firstPencils72h.length} items</Badge>
                </div>

                {bookingDataUnavailable ? (
                  <EmptyState className={styles.emptyCompact} title="Follow-ups unavailable" description="Booking data could not be loaded." />
                ) : firstPencils72h.length ? (
                  <ul className={layoutStyles.extracted35}>
                    {firstPencils72h.slice(0, 5).map((e) => (
                      <li key={e.id}>
                        <Button bare type="button" className={styles.queueButton} onClick={() => setSelectedBookingId(e.id)} aria-label={`Open booking ${e.jobNumber}`}>
                        <div className={layoutStyles.extracted37}>
                          <strong className={layoutStyles.extracted38}>{e.jobNumber}</strong>
                          <span className={layoutStyles.extracted39}>{moment(e.start).format("MMM D")}</span>
                        </div>
                        <div className={layoutStyles.extracted40}>{e.client}</div>
                        <div>
                          <span className={layoutStyles.tag} data-tone="first pencil">First Pencil</span>
                        </div>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={layoutStyles.extracted41}>No first pencils in the next 72 hours.</div>
                )}
              </div>

              <div className={`home-tile home-conflict-tile ${layoutStyles.extracted83}`} >
                <div className={layoutStyles.extracted42}>
                  <div className={styles.panelHeading}>
                    <span className={styles.iconBox}><AlertTriangle size={17} /></span>
                    <div>
                    <h2 className={layoutStyles.extracted43}>Scheduling Conflicts</h2>
                    <div className={layoutStyles.extracted44}>Second pencil work overlapping confirmed or first pencil vehicle allocations.</div>
                    </div>
                  </div>
                  <Badge variant={clashesSecondVsFirm.length ? "warning" : "success"}>{clashesSecondVsFirm.length} flagged</Badge>
                </div>

                {bookingDataUnavailable ? (
                  <EmptyState className={styles.emptyCompact} title="Conflicts unavailable" description="Booking data could not be loaded." />
                ) : clashesSecondVsFirm.length ? (
                  <ul className={layoutStyles.extracted45}>
                    {clashesSecondVsFirm.slice(0, 5).map((c) => (
                      <li key={`${c.second.id}-${c.firm.id}-${vehicleLabel(c.vehicle)}`}>
                        <Button bare type="button" className={styles.queueButton} onClick={() => setSelectedBookingId(c.second.id)} aria-label={`Open second pencil booking ${c.second.jobNumber}`}>
                        <strong className={layoutStyles.extracted47}>
                          {vehicleLabel(c.vehicle)}
                        </strong>

                        <div className={layoutStyles.extracted48}>
                          2nd: {c.second.jobNumber} ({moment(c.second.start).format("MMM D")} - {moment(c.second.end).format("MMM D")})
                          <span className={layoutStyles.tag} data-tone="second pencil">Second</span>
                        </div>

                        <div className={layoutStyles.extracted49}>
                          Firm: {c.firm.jobNumber} ({moment(c.firm.start).format("MMM D")} - {moment(c.firm.end).format("MMM D")})
                          <span className={layoutStyles.tag} data-tone={String(c.firm.status || "").toLowerCase()}>{c.firm.status}</span>
                        </div>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={layoutStyles.extracted50}>No second-pencil clashes.</div>
                )}
              </div>

              <Card className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelHeading}>
                    <span className={styles.iconBox}><Wrench size={17} /></span>
                    <div><h2 className={styles.panelTitle}>Fleet attention</h2><p className={styles.panelDescription}>Unbooked compliance items that are already overdue.</p></div>
                  </div>
                </div>
                {fleetDataUnavailable ? (
                  <EmptyState className={styles.emptyCompact} title="Fleet status incomplete" description="Some maintenance data could not be loaded." />
                ) : <div className={styles.attentionSummary}>
                  <Link className={styles.attentionLink} href="/mot-overview"><span className={styles.attentionValue}>{overdueMOT.length}</span><span className={styles.attentionLabel}>MOT overdue</span></Link>
                  <Link className={styles.attentionLink} href="/service-overview"><span className={styles.attentionValue}>{overdueService.length}</span><span className={styles.attentionLabel}>Service overdue</span></Link>
                </div>}
              </Card>
            </section>

            <section className={`home-tile home-prep-tile ${layoutStyles.extracted84}`} >
              <div className={layoutStyles.extracted51}>
                <div className={layoutStyles.extracted52}>
                  <span className={`${layoutStyles.iconBox} ${layoutStyles.iconPrep}`}>
                    <ClipboardList size={17} />
                  </span>
                  <div>
                    <h2 className={layoutStyles.extracted53}>Preparation Queue</h2>
                    <div className={layoutStyles.extracted54}>Upcoming work starting in the next 2 days that may require operational preparation.</div>
                  </div>
                </div>
                <div className={styles.panelActions}>
                  <Badge>{prepList.length} upcoming</Badge>
                  <Link className={styles.textLink} href="/preplist-dashboard">View all <ArrowRight size={13} /></Link>
                </div>
              </div>

              {bookingDataUnavailable ? (
                <EmptyState className={styles.emptyCompact} title="Preparation unavailable" description="Booking data could not be loaded." />
              ) : prepList.length ? (
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
                        <tr key={it.id}>
                          <td className={layoutStyles.extracted63}>
                            <Button bare type="button" className={styles.tableButton} onClick={() => setSelectedBookingId(it.id)} aria-label={`Open booking ${it.jobNumber}`}>{it.jobNumber}</Button>
                          </td>
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
                  <span className={`${layoutStyles.iconBox} ${layoutStyles.iconFleet}`}>
                    <Wrench size={17} />
                  </span>
                  <div>
                    <h2 className={layoutStyles.extracted71}>Fleet Compliance</h2>
                    <div className={layoutStyles.extracted72}>Overdue items and due dates within the next 3 weeks.</div>
                  </div>
                </div>
                <Link className={styles.textLink} href="/vehicle-home">View vehicles <ArrowRight size={13} /></Link>
              </div>

              {fleetDataUnavailable ? (
                <EmptyState className={styles.emptyCompact} title="Fleet compliance unavailable" description="Some maintenance data could not be loaded." />
              ) : <div className="home-fleet-grid">
                <Bucket title={`MOT Overdue (${overdueMOT.length})`} items={overdueMOT} />
                <Bucket title={`Service Overdue (${overdueService.length})`} items={overdueService} />
                <Bucket title={`MOT due in 3 weeks (${motDueSoon.length})`} items={motDueSoon} />
                <Bucket title={`Service due in 3 weeks (${serviceDueSoon.length})`} items={serviceDueSoon} />
              </div>}
            </section>

            <section className={`home-tile home-assistant-tile ${layoutStyles.extracted86}`} >
              <div className={layoutStyles.extracted73}>
                <div className={layoutStyles.extracted74}>
                  <span className={layoutStyles.iconBox}>
                    <Plus size={17} />
                  </span>
                  <div>
                    <h2 className={layoutStyles.extracted75}>Quick Actions</h2>
                    <div className={layoutStyles.extracted76}>Open the core operational sections from the home hub.</div>
                  </div>
                </div>
                <span className={layoutStyles.sectionTag}>v1.0 links</span>
              </div>
              <nav className={styles.quickLinks} aria-label="Operational shortcuts">
                {[
                  { label: "Create Booking", href: "/create-booking", icon: <Plus size={14} /> },
                  { label: "Employees", href: "/employee-home", icon: <Users size={14} /> },
                  { label: "Vehicles", href: "/vehicle-home", icon: <Car size={14} /> },
                  { label: "Workshop", href: "/workshop", icon: <Wrench size={14} /> },
                  { label: "Equipment", href: "/equipment", icon: <Package size={14} /> },
                ].map((action) => (
                  <Button
                    key={action.href}
                    as={Link}
                    href={action.href}
                    variant="ghost"
                    size="sm"
                  >
                    {action.icon}
                    {action.label}
                  </Button>
                ))}
              </nav>
            </section>
          </div>
        </Page>
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
