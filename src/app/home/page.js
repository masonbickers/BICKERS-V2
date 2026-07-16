// src/app/dashboard/page.js
"use client";

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
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Filter,
  Plus,
  RefreshCw,
  Wrench,
} from "lucide-react";
import {
  buildAttentionQueue,
  buildFleetBuckets,
  buildFollowUpQueue,
  buildOperationalSummary,
  buildPreparationQueue,
  buildSchedulingConflicts,
  filterCalendarEvents,
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
const CALENDAR_SOURCES = [
  { key: "booking", label: "Bookings" },
  { key: "maintenance", label: "Maintenance" },
  { key: "holiday", label: "Holidays" },
  { key: "note", label: "Notes" },
];

function FleetBucket({ title, items, href }) {
  return (
    <Link className={styles.fleetBucket} href={href}>
      <div className={styles.fleetBucketHeader}>
        <span>{title}</span>
        <strong>{items.length}</strong>
      </div>
      {items && items.length ? (
        <span className={styles.fleetBucketDetail}>
          Next: {items[0].vehicleLabel || items[0].name || items[0].registration || "Vehicle"} · {moment(items[0].dueDate).format("D MMM")}
        </span>
      ) : (
        <span className={styles.fleetBucketClear}><CheckCircle2 size={14} /> Nothing due</span>
      )}
    </Link>
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
  const [calendarSources, setCalendarSources] = useState(() => CALENDAR_SOURCES.map((source) => source.key));

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
  const visibleCalendarEvents = useMemo(
    () => filterCalendarEvents(homeCalendarEvents, calendarSources),
    [calendarSources, homeCalendarEvents]
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

  const operationalSummary = useMemo(
    () => buildOperationalSummary({
      events,
      referenceDate: now,
      windowDays,
      followUps: firstPencils72h,
      preparation: prepList,
      conflicts: clashesSecondVsFirm,
      overdueMOT,
      overdueService,
      availability: { bookings: !bookingDataUnavailable, fleet: !fleetDataUnavailable },
    }),
    [
      bookingDataUnavailable,
      clashesSecondVsFirm,
      events,
      firstPencils72h,
      fleetDataUnavailable,
      now,
      overdueMOT,
      overdueService,
      prepList,
      windowDays,
    ]
  );

  const attentionQueue = useMemo(
    () => buildAttentionQueue({
      conflicts: bookingDataUnavailable ? [] : clashesSecondVsFirm,
      followUps: bookingDataUnavailable ? [] : firstPencils72h,
      preparation: bookingDataUnavailable ? [] : prepList,
      overdueMOT: fleetDataUnavailable ? [] : overdueMOT,
      overdueService: fleetDataUnavailable ? [] : overdueService,
      vehicleLabel,
    }),
    [
      bookingDataUnavailable,
      clashesSecondVsFirm,
      firstPencils72h,
      fleetDataUnavailable,
      overdueMOT,
      overdueService,
      prepList,
      vehicleLabel,
    ]
  );

  const toggleCalendarSource = useCallback((source) => {
    setCalendarSources((current) => (
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source]
    ));
  }, []);

  const openAttentionTarget = useCallback((target) => {
    if (!target) return;
    if (target.kind === "booking") {
      setSelectedBookingId(target.id);
      return;
    }
    if (target.kind === "route" && target.href) router.push(target.href);
  }, [router]);

  const openSummaryTarget = useCallback((target) => {
    if (!target) return;
    if (target.kind === "attention") {
      document.getElementById("needs-attention")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    openAttentionTarget(target);
  }, [openAttentionTarget]);

  return (
    <ProtectedRoute>
      <HeaderSidebarLayout>
        <Page width="fluid">
          <PageHeader
            title="Operations overview"
            subtitle="See the programme, spot operational risk and open the work that needs attention."
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

          <div className={styles.puzzleGrid}>
            <section className={`${styles.tile} ${styles.statsTile}`} aria-label="Operational health">
              {initialLoading ? <div className={styles.statGrid}>{[0,1,2,3,4].map((item) => <Card className={styles.healthSkeleton} key={item}><Skeleton height={72} /></Card>)}</div> : (
                <div className={styles.statGrid}>
                  {operationalSummary.map((item) => (
                    <Button
                      bare
                      key={item.key}
                      type="button"
                      className={styles.healthCard}
                      data-tone={item.tone}
                      disabled={!item.available}
                      onClick={() => openSummaryTarget(item.actionTarget)}
                      aria-label={`${item.label}: ${item.available ? item.value : "unavailable"}. ${item.period}`}
                    >
                      <span className={styles.healthIcon}>
                        {item.key === "upcoming" ? <BriefcaseBusiness size={18} /> : null}
                        {item.key === "follow-up" ? <Clock size={18} /> : null}
                        {item.key === "preparation" ? <ClipboardList size={18} /> : null}
                        {item.key === "conflicts" ? <AlertTriangle size={18} /> : null}
                        {item.key === "fleet" ? <Wrench size={18} /> : null}
                      </span>
                      <span className={styles.healthValue}>{item.available ? item.value : "—"}</span>
                      <strong className={styles.healthLabel}>{item.label}</strong>
                      <span className={styles.healthPeriod}>{item.available ? item.period : "Data unavailable"}</span>
                      <ChevronRight className={styles.healthArrow} size={17} aria-hidden="true" />
                    </Button>
                  ))}
                </div>
              )}
            </section>

            <section className={`${styles.tile} ${styles.calendarTile} ${styles.panelSurface}`}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeading}>
                  <span className={styles.iconBox}>
                    <CalendarDays size={17} />
                  </span>
                  <div>
                    <h2 className={styles.panelTitle}>Operations Calendar</h2>
                    <div className={styles.panelDescription}>Review the current booking programme and open any entry for full detail.</div>
                  </div>
                </div>
                <div className={styles.panelActions}>
                  <Badge variant="info">{isCompact ? "Week view" : "Month view"}</Badge>
                  <Button as={Link} href="/dashboard" variant="secondary" size="sm">Open Diary <ArrowRight size={13} /></Button>
                </div>
              </div>

              <div className={styles.calendarFilters} aria-label="Calendar sources">
                <span className={styles.filterLabel}><Filter size={14} /> Show</span>
                {CALENDAR_SOURCES.map((source) => {
                  const active = calendarSources.includes(source.key);
                  return (
                    <Button
                      bare
                      type="button"
                      key={source.key}
                      className={styles.filterButton}
                      data-source={source.key}
                      aria-pressed={active}
                      onClick={() => toggleCalendarSource(source.key)}
                    >
                      <span className={styles.filterDot} /> {source.label}
                    </Button>
                  );
                })}
              </div>

              <div className={styles.calendarWrap}>
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
                  events={visibleCalendarEvents}
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
              <div className={styles.legend}>
                {[
                  { label: "Confirmed", color: "var(--job-status-confirmed)" },
                  { label: "First Pencil", color: "var(--job-status-first-pencil)" },
                  { label: "Second Pencil", color: "var(--job-status-second-pencil)" },
                  { label: "Maintenance", color: "var(--color-warning)" },
                  { label: "Holiday", color: "var(--color-border-strong)" },
                  { label: "Note", color: "var(--color-border)" },
                ].map((item) => (
                  <div key={item.label} className={styles.legendItem}>
                    {/* style-audit-allow runtime: calendar legend colour */}
                    <div className={styles.legendSwatch} style={{ "--swatch-color": item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.rightRail} id="needs-attention">
              <Card className={`${styles.panel} ${styles.attentionPanel}`}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelHeading}>
                    <span className={`${styles.iconBox} ${styles.attentionIcon}`}><AlertTriangle size={18} /></span>
                    <div><h2 className={styles.panelTitle}>Needs attention</h2><p className={styles.panelDescription}>Ranked by operational risk, then deadline.</p></div>
                  </div>
                  <Badge variant={attentionQueue.length ? "warning" : "success"}>{attentionQueue.length} open</Badge>
                </div>

                {bookingDataUnavailable || fleetDataUnavailable ? (
                  <Alert className={styles.inlineAlert} variant="warning">
                    This queue is incomplete because {bookingDataUnavailable && fleetDataUnavailable ? "booking and fleet data are" : bookingDataUnavailable ? "booking data is" : "fleet data is"} unavailable.
                  </Alert>
                ) : null}

                {initialLoading ? (
                  <div className={styles.attentionLoading}>{[0, 1, 2].map((item) => <Skeleton key={item} height={76} />)}</div>
                ) : attentionQueue.length ? (
                  <ol className={styles.attentionList}>
                    {attentionQueue.slice(0, 10).map((item) => (
                      <li key={item.id}>
                        <Button bare type="button" className={styles.attentionButton} data-severity={item.severity} onClick={() => openAttentionTarget(item.actionTarget)} aria-label={`${item.title}. ${item.detail}. Open related workflow`}>
                          <span className={styles.attentionTopline}>
                            <Badge variant={item.severity === "critical" ? "danger" : item.severity === "urgent" ? "warning" : "info"}>{item.severity}</Badge>
                            <span className={styles.attentionDate}>{item.dueAt ? moment(item.dueAt).format("D MMM YYYY") : "Date unavailable"}</span>
                          </span>
                          <strong className={styles.attentionTitle}>{item.title}</strong>
                          <span className={styles.attentionDetail}>{item.detail}</span>
                          <ChevronRight className={styles.attentionArrow} size={16} aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                ) : bookingDataUnavailable && fleetDataUnavailable ? (
                  <EmptyState className={styles.emptyCompact} title="Attention queue unavailable" description="Retry once operational data access has been restored." />
                ) : (
                  <EmptyState className={styles.emptyCompact} icon={<CheckCircle2 className={styles.clearIcon} size={28} />} title="Operations are clear" description="No clashes, overdue compliance, urgent pencils or preparation deadlines are currently flagged." />
                )}
              </Card>
            </section>

            <section className={`${styles.tile} ${styles.prepTile} ${styles.panelSurface}`}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeading}>
                  <span className={`${styles.iconBox} ${styles.prepIcon}`}>
                    <ClipboardList size={17} />
                  </span>
                  <div>
                    <h2 className={styles.panelTitle}>Preparation Queue</h2>
                    <div className={styles.panelDescription}>Upcoming work starting in the next 2 days that may require operational preparation.</div>
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
                <div className={styles.tableWrap}>
                  <table className={styles.prepTable}>
                    <thead>
                      <tr>
                        <th>Job #</th>
                        <th>Vehicles</th>
                        <th>Equipment</th>
                        <th>Notes</th>
                        <th>Start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prepList.map((it) => (
                        <tr key={it.id}>
                          <td className={styles.jobCell}>
                            <Button bare type="button" className={styles.tableButton} onClick={() => setSelectedBookingId(it.id)} aria-label={`Open booking ${it.jobNumber}`}>{it.jobNumber}</Button>
                          </td>
                          <td>{it.vehicles?.join(", ") || "-"}</td>
                          <td>{it.equipment || "-"}</td>
                          <td>{it.notes || "-"}</td>
                          <td className={styles.nowrap}>{it.start ? moment(it.start).format("MMM D, YYYY") : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState className={styles.emptyCompact} icon={<CheckCircle2 className={styles.clearIcon} size={25} />} title="Preparation is clear" description="No jobs start within the next two days." />
              )}
            </section>

            <section className={`${styles.tile} ${styles.fleetTile} ${styles.panelSurface}`}>
              <div className={styles.panelHeader}>
                <div className={styles.panelHeading}>
                  <span className={`${styles.iconBox} ${styles.fleetIcon}`}>
                    <Wrench size={17} />
                  </span>
                  <div>
                    <h2 className={styles.panelTitle}>Fleet Planning</h2>
                    <div className={styles.panelDescription}>Upcoming unbooked compliance work. Overdue items are prioritised above.</div>
                  </div>
                </div>
                <Link className={styles.textLink} href="/vehicle-home">View vehicles <ArrowRight size={13} /></Link>
              </div>

              {fleetDataUnavailable ? (
                <EmptyState className={styles.emptyCompact} title="Fleet compliance unavailable" description="Some maintenance data could not be loaded." />
              ) : <div className={styles.fleetGrid}>
                <FleetBucket title="MOT due within 3 weeks" items={motDueSoon} href="/mot-overview" />
                <FleetBucket title="Service due within 3 weeks" items={serviceDueSoon} href="/service-overview" />
              </div>}
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
