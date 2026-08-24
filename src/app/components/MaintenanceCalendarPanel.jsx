"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar as BigCalendar } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop/index.js";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { Wrench } from "lucide-react";

import styles from "./MaintenanceCalendarPanel.styles.module.css";
import { localizer } from "../utils/localizer";
import {
  buildMaintenanceBookingDraftFromDueEvent,
  buildMaintenanceCalendarEvents,
  getMaintenanceEventScheduleRule,
  getMaintenanceDisplayType,
  isMaintenanceCalendarEventDraggable,
  isMaintenanceMoveOutsideDueWeek,
  startOfLocalDay,
  toYmdDate,
} from "../utils/maintenanceCalendar";
import { rescheduleMaintenanceBooking } from "../utils/maintenanceMutationClient";
import DashboardMaintenanceModal from "./DashboardMaintenanceModal";
import MaintenanceBookingForm from "./MaintenanceBookingForm";
import { Badge, Button, Modal } from "@/app/components/ui";

const DraggableBigCalendar = withDragAndDrop(BigCalendar);
const allDayTrue = () => true;
const getCalendarNow = () => new Date(2000, 0, 1);

const sortedYmdList = (values) =>
  [...new Set((Array.isArray(values) ? values : []).map(toYmdDate).filter(Boolean))].sort();

const addDays = (value, amount) => {
  const date = startOfLocalDay(value);
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const diffDays = (left, right) => {
  const from = startOfLocalDay(left);
  const to = startOfLocalDay(right);
  return from && to ? Math.round((to.getTime() - from.getTime()) / 86400000) : 0;
};

const shiftYmd = (value, amount) => toYmdDate(addDays(value, amount));

const shiftDateKeyedMap = (value, amount, keysToShift = null) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.entries(value).reduce((result, [key, entry]) => {
    const shouldShift = /^\d{4}-\d{2}-\d{2}$/.test(key) && (!keysToShift || keysToShift.has(key));
    result[shouldShift ? shiftYmd(key, amount) : key] = entry;
    return result;
  }, {});
};

const buildDropUpdates = (booking, event, nextStart) => {
  const currentStart = startOfLocalDay(event?.start);
  const targetStart = startOfLocalDay(nextStart);
  if (!currentStart || !targetStart) return null;
  const deltaDays = diffDays(currentStart, targetStart);
  if (!deltaDays) return null;

  const existingDates = sortedYmdList(booking?.bookingDates);
  const updates = {};
  let movedDateKeys = null;
  let movedNextDateKeys = null;
  if (existingDates.length) {
    const eventDates = sortedYmdList(
      event?.__occurrences?.length ? event.__occurrences : [event?.__occurrence || currentStart]
    );
    movedDateKeys = new Set(eventDates.length ? eventDates : [toYmdDate(currentStart)]);
    movedNextDateKeys = sortedYmdList([...movedDateKeys].map((key) => shiftYmd(key, deltaDays)));
    const nextDates = sortedYmdList([
      ...existingDates.filter((key) => !movedDateKeys.has(key)),
      ...movedNextDateKeys,
    ]);
    const first = nextDates[0] || "";
    const last = nextDates.at(-1) || first;
    const multi = nextDates.length > 1;
    Object.assign(updates, {
      bookingDates: nextDates,
      date: first,
      appointmentDate: multi ? "" : first,
      appointmentDateISO: multi ? "" : first,
      startDate: multi ? first : "",
      startDateISO: multi ? first : "",
      endDate: multi ? last : "",
      endDateISO: multi ? last : "",
    });
  } else {
    const duration = Math.max(1, diffDays(currentStart, event?.end || event?.start));
    const first = toYmdDate(targetStart);
    const last = toYmdDate(addDays(targetStart, duration - 1));
    const multi = duration > 1 || Boolean(booking?.startDateISO || booking?.endDateISO || booking?.startDate || booking?.endDate);
    Object.assign(updates, {
      date: first,
      appointmentDate: multi ? "" : first,
      appointmentDateISO: multi ? "" : first,
      startDate: multi ? first : "",
      startDateISO: multi ? first : "",
      endDate: multi ? last : "",
      endDateISO: multi ? last : "",
    });
  }
  if (booking?.callTimesByDate && typeof booking.callTimesByDate === "object") {
    updates.callTimesByDate = shiftDateKeyedMap(booking.callTimesByDate, deltaDays, movedDateKeys);
  }
  return { updates, movedDateKeys, movedNextDateKeys };
};

const formatRange = (values) => {
  const dates = sortedYmdList(values);
  const format = (value) => startOfLocalDay(value)?.toLocaleDateString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }) || "";
  if (!dates.length) return "";
  return dates.length === 1 ? format(dates[0]) : `${format(dates[0])} - ${format(dates.at(-1))}`;
};

const dueTone = (dueDate) => {
  const due = startOfLocalDay(dueDate);
  const today = startOfLocalDay(new Date());
  if (!due || !today) return "soft";
  const days = diffDays(today, due);
  return days < 0 ? "overdue" : days <= 21 ? "soon" : "ok";
};

export function maintenanceEventPropGetter(event) {
  const kind = event?.kind || "MAINTENANCE";
  const bookingStatus = String(event?.bookingStatus || "").trim().toLowerCase();
  const workflowStatus = String(event?.workflowStatus || "").trim().toLowerCase();
  const booking = ["MOT_BOOKING", "SERVICE_BOOKING", "INSPECTION_BOOKING", "MAINTENANCE_APPOINTMENT", "MAINTENANCE_BOOKING"].includes(kind);
  const due = ["MOT", "SERVICE", "INSPECTION", "BRAKE_TEST", "PMI"].includes(kind);
  const completed = [bookingStatus, workflowStatus].some((status) => ["completed", "complete"].includes(status));
  const outsideWeek = booking && isMaintenanceMoveOutsideDueWeek(event, event?.start);
  let [background, border, color] = ["#c4d6e4", "#95b3ca", "#172a3d"];
  const tones = {
    MOT: ["#fff7ed", "#f59e0b", "#713f12"],
    MOT_BOOKING: ["#dbeafe", "#2563eb", "#102a56"],
    SERVICE: ["#ecfdf5", "#10b981", "#064e3b"],
    SERVICE_BOOKING: ["#dbeafe", "#2563eb", "#102a56"],
    INSPECTION: ["#f5f3ff", "#8b5cf6", "#3b0764"],
    INSPECTION_BOOKING: ["#f0fdfa", "#14b8a6", "#134e4a"],
    MAINTENANCE_APPOINTMENT: ["#f0fdfa", "#14b8a6", "#134e4a"],
    MAINTENANCE_BOOKING: ["#ccfbf1", "#0d9488", "#134e4a"],
    MAINTENANCE: ["#e2e8f0", "#64748b", "#1e293b"],
  };
  if (tones[kind]) [background, border, color] = tones[kind];
  const tone = event?.dueDate && !booking && !(due && event?.booked) ? dueTone(event.dueDate) : "soft";
  if (tone === "overdue") [background, border, color] = ["#e4c0bd", "#bf847f", "#631f1a"];
  if (tone === "soon") [background, border, color] = ["#e1c79c", "#c19458", "#5a3918"];
  if (completed) [background, border, color] = ["#d1fae5", "#86efac", "#065f46"];
  else if (outsideWeek) [background, border, color] = ["#fff7ed", "#f97316", "#7c2d12"];
  return { style: {
    borderRadius: 10,
    borderTop: `1px solid ${border}`,
    borderRight: `1px solid ${border}`,
    borderBottom: `1px solid ${border}`,
    borderLeft: `6px solid ${border}`,
    background, color, padding: 0, overflow: "hidden",
    boxShadow: booking ? "0 4px 10px rgba(37,99,235,0.12)" : "0 2px 6px rgba(15,23,42,0.08)",
    cursor: isMaintenanceCalendarEventDraggable(event) ? "grab" : "pointer",
  } };
}

export function MaintenanceCalendarEvent({ event }) {
  const kind = event?.kind || "MAINTENANCE";
  const displayType = getMaintenanceDisplayType(event);
  const bookingStatus = String(event?.bookingStatus || "").trim().toLowerCase();
  const workflowStatus = String(event?.workflowStatus || "").trim().toLowerCase();
  const completed = [bookingStatus, workflowStatus].some((status) => ["completed", "complete"].includes(status));
  const requested =
    String(event?.recordStatus || "").trim().toLowerCase() === "requested" ||
    bookingStatus.startsWith("due");
  const outsideWeek = !completed && isMaintenanceMoveOutsideDueWeek(event, event?.start);
  const label = requested
    ? kind === "MOT_BOOKING" ? "MOT due"
    : kind === "SERVICE_BOOKING" ? "Service due"
    : kind === "INSPECTION_BOOKING" ? `${event?.maintenanceTypeLabel || displayType} due`
    : `${displayType} due`
    : kind === "MOT_BOOKING" ? "MOT appointment"
    : kind === "SERVICE_BOOKING" ? "Service appointment"
    : kind === "INSPECTION_BOOKING" ? `${event?.maintenanceTypeLabel || displayType} appointment`
    : kind === "MAINTENANCE" ? event?.maintenanceTypeLabel || "Workshop job card"
    : `${displayType} appointment`;
  const rawTitle = String(event?.title || event?.vehicleLabel || "Maintenance").trim();
  const typeSuffix = ` - ${String(event?.maintenanceTypeLabel || displayType).trim()}`;
  const cleanTitle = typeSuffix.trim() && rawTitle.toLowerCase().endsWith(typeSuffix.toLowerCase())
    ? rawTitle.slice(0, -typeSuffix.length)
    : rawTitle;
  const subline = outsideWeek ? "Warning — outside legal ISO week"
    : event?.bookingStatus || (workflowStatus ? workflowStatus.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "");
  const vehicleMeta = [event?.location].filter(Boolean).join(" · ");
  return <div title={event?.title || ""} className={styles.event}>
    <span className={styles.eventLabel}>{label}</span>
    <span className={styles.eventTitle}>{cleanTitle}</span>
    {vehicleMeta ? <span className={styles.eventMeta}>{vehicleMeta}</span> : null}
    {subline ? <span className={styles.eventMuted}>{subline}</span> : null}
  </div>;
}

export default function MaintenanceCalendarPanel({
  maintenanceBookings = [], maintenanceJobs = [], vehicles = [], setMaintenanceBookings,
  date, view = "week", onDateChange, onViewChange, dataAccessState,
}) {
  const router = useRouter();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [bookingDraft, setBookingDraft] = useState(null);
  const events = useMemo(() => buildMaintenanceCalendarEvents({ maintenanceBookings, maintenanceJobs, vehicles }), [maintenanceBookings, maintenanceJobs, vehicles]);

  const openRequestedBooking = useCallback((event, targetDate = event?.start) => {
    const draft = buildMaintenanceBookingDraftFromDueEvent(event, targetDate);
    if (draft) setBookingDraft(draft);
  }, []);

  const handleDrop = useCallback(({ event, start }) => {
    if (!isMaintenanceCalendarEventDraggable(event)) return;
    if (String(event?.recordStatus || "").toLowerCase() === "requested") {
      openRequestedBooking(event, start);
      return;
    }
    const bookingId = String(event?.__parentId || event?.id || "").trim();
    const booking = maintenanceBookings.find((item) => String(item?.id || "") === bookingId);
    const change = buildDropUpdates(booking || event, event, start);
    if (!bookingId || !change?.updates) return;
    const scheduleRule = getMaintenanceEventScheduleRule(event, start);
    setPendingDrop({
      bookingId, booking: booking || event, updates: change.updates,
      title: event?.title || "this booking",
      fromLabel: formatRange(change.movedDateKeys ? [...change.movedDateKeys] : [event?.start]),
      toLabel: formatRange(change.movedNextDateKeys?.length ? change.movedNextDateKeys : [start]),
      requiresReason: scheduleRule.requiresExceptionReason,
      requiresAcknowledgement: scheduleRule.requiresAcknowledgement,
      motExpiryAcknowledged: false,
      reason: "", saving: false,
    });
  }, [maintenanceBookings, openRequestedBooking]);

  const confirmDrop = useCallback(async () => {
    if (!pendingDrop?.bookingId || pendingDrop.saving) return;
    const reason = String(pendingDrop.reason || "").trim();
    if (pendingDrop.requiresReason && !reason) return;
    if (pendingDrop.requiresAcknowledgement && !pendingDrop.motExpiryAcknowledged) return;
    const previous = maintenanceBookings;
    const optimistic = { ...pendingDrop.updates, scheduleExceptionReason: reason, updatedAt: new Date().toISOString() };
    setPendingDrop((current) => current ? { ...current, saving: true } : current);
    setMaintenanceBookings?.((current) => (current || []).map((booking) => String(booking?.id || "") === pendingDrop.bookingId ? { ...booking, ...optimistic } : booking));
    try {
      await rescheduleMaintenanceBooking({ bookingId: pendingDrop.bookingId, booking: pendingDrop.booking, updates: pendingDrop.updates, reason, motExpiryAcknowledged: pendingDrop.motExpiryAcknowledged, authState: dataAccessState });
      setPendingDrop(null);
    } catch (error) {
      setMaintenanceBookings?.(previous);
      setPendingDrop((current) => current ? { ...current, saving: false } : current);
      systemDialogs.showSystemNotification(error?.message || "Could not move this maintenance booking.");
    }
  }, [dataAccessState, maintenanceBookings, pendingDrop, setMaintenanceBookings]);

  return <section className={styles.section} data-maintenance-calendar>
    <div className={styles.header}>
      <div className={styles.heading}><span className={styles.icon}><Wrench size={17} /></span><div>
        <h2 className={styles.title}>Maintenance Calendar</h2>
        <div className={styles.subtitle}>Canonical maintenance requirements, bookings and active workshop activity.</div>
      </div></div>
      <div className={styles.controls}>
        {['week', 'month'].map((calendarView) => <Button key={calendarView} type="button" variant={view === calendarView ? "primary" : "secondary"} onClick={() => onViewChange?.(calendarView)}>{calendarView === 'week' ? 'Week' : 'Month'}</Button>)}
        <Badge className={styles.dateBadge}>{date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</Badge>
      </div>
    </div>
    <DraggableBigCalendar localizer={localizer} events={events} view={view} views={["week", "month"]}
      onView={onViewChange} date={date} onNavigate={onDateChange} startAccessor="start" endAccessor="end"
      allDayAccessor={allDayTrue} allDaySlot selectable={false} resizable={false}
      draggableAccessor={isMaintenanceCalendarEventDraggable} onEventDrop={handleDrop} popup showAllEvents toolbar={false}
      nowIndicator={false} getNow={getCalendarNow} components={{ event: MaintenanceCalendarEvent }}
      onSelectEvent={(event) => {
        if (event?.__collection === "maintenanceJobs") { router.push(`/maintenance-jobs?jobId=${encodeURIComponent(event.__parentId || event.id)}`); return; }
        if (String(event?.recordStatus || "").toLowerCase() === "requested") { openRequestedBooking(event); return; }
        setSelectedEvent(event);
      }}
      eventPropGetter={maintenanceEventPropGetter}
      className={`${styles.calendar} ${view === "month" ? styles.calendarMonth : ""}`}
      dayPropGetter={(calendarDate) => {
        const today = new Date();
        const isToday = calendarDate.toDateString() === today.toDateString();
        return { style: { backgroundColor: isToday ? "rgba(139,94,60,0.12)" : undefined, border: isToday ? "1px solid rgba(139,94,60,0.34)" : undefined } };
      }} />

    {selectedEvent ? <DashboardMaintenanceModal event={selectedEvent} onClose={() => setSelectedEvent(null)} /> : null}
    {bookingDraft ? <MaintenanceBookingForm {...bookingDraft} onClose={() => setBookingDraft(null)} onSaved={() => setBookingDraft(null)} /> : null}
    {pendingDrop ? <Modal open onClose={() => !pendingDrop.saving && setPendingDrop(null)} eyebrow="Maintenance schedule" title="Move maintenance appointment" size="sm" density="compact" footer={<><Button variant="secondary" type="button" size="sm" onClick={() => setPendingDrop(null)} disabled={pendingDrop.saving}>Cancel</Button><Button type="button" size="sm" onClick={confirmDrop} disabled={pendingDrop.saving || (pendingDrop.requiresReason && !pendingDrop.reason.trim()) || (pendingDrop.requiresAcknowledgement && !pendingDrop.motExpiryAcknowledged)} loading={pendingDrop.saving}>Move appointment</Button></>}>
        <div className={styles.dialogBody}><div className={styles.dialogCopy}>You changed the date of <strong>{pendingDrop.title}</strong>.</div>
          <div className={styles.range}><div className={styles.rangeBox}><div className={styles.rangeLabel}>From</div><div className={styles.rangeValue}>{pendingDrop.fromLabel}</div></div><div className={styles.rangeBox}><div className={styles.rangeLabel}>To</div><div className={styles.rangeValue}>{pendingDrop.toLabel}</div></div></div>
          <label className={styles.reason}>Reason {pendingDrop.requiresReason ? "(required outside the legal ISO week)" : "(optional)"}<input value={pendingDrop.reason} onChange={(event) => setPendingDrop((current) => ({ ...current, reason: event.target.value }))} disabled={pendingDrop.saving} /></label>
          {pendingDrop.requiresAcknowledgement ? <label className={styles.acknowledgement}><input type="checkbox" checked={pendingDrop.motExpiryAcknowledged} onChange={(event) => setPendingDrop((current) => ({ ...current, motExpiryAcknowledged: event.target.checked }))} disabled={pendingDrop.saving} /><span>I acknowledge that the MOT will be expired on the appointment date.</span></label> : null}
          <div className={styles.hint}>{pendingDrop.requiresAcknowledgement ? "The appointment can be moved once the expired MOT is acknowledged." : pendingDrop.requiresReason ? "This appointment crosses its legal due week, so an audit reason is required." : "This appointment remains within its legal due week."}</div>
        </div>
    </Modal> : null}
  </section>;
}
