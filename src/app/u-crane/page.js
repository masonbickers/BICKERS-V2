// src/app/u-crane/page.js
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import "react-big-calendar/lib/css/react-big-calendar.css";

const BigCalendar = dynamic(
  () => import("react-big-calendar").then((m) => m.Calendar),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          ...surface,
          minHeight: 620,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: UI.muted,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        Loading U-Crane diary...
      </div>
    ),
  }
);

import { localizer } from "../utils/localizer";
import { collection, onSnapshot } from "firebase/firestore";

import ViewUCraneBooking from "../components/ViewUCraneBooking";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import RouteLoadingOverlay from "../components/RouteLoadingOverlay";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";

/* ------------------------------- Styling tokens ------------------------------- */
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
  successSoft: "#edf7f2",
};

const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
};

const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const h1 = {
  color: UI.text,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: 0,
  margin: 0,
};

const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6, maxWidth: 760 };

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const card = {
  ...surface,
  padding: 12,
  marginBottom: UI.gap,
};

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  flexWrap: "wrap",
};

const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: 0 };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };

const sectionActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
};

const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const btn = (kind = "primary") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12.5,
    lineHeight: 1.2,
  };

  if (kind === "ghost") {
    return {
      ...base,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
    };
  }
  return {
    ...base,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
  };
};

const btnDisabled = (base) => ({
  ...base,
  opacity: 0.45,
  cursor: "not-allowed",
  pointerEvents: "none",
  filter: "grayscale(0.2)",
});

const successBanner = {
  background: UI.successSoft,
  color: "#065f46",
  border: "1px solid #b7dec7",
  borderRadius: UI.radiusSm,
  padding: "7px 10px",
  fontSize: 13,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};

const calendarShell = {
  border: UI.border,
  borderRadius: UI.radius,
  background: "#ffffff",
  overflow: "hidden",
};

const pageCss = `
  .ucrane-page .rbc-calendar {
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: ${UI.text};
  }
  .ucrane-page .rbc-time-view,
  .ucrane-page .rbc-month-view {
    border-color: #d7dee8;
  }
  .ucrane-page .rbc-time-header {
    border-bottom-color: #d7dee8;
  }
  .ucrane-page .rbc-header {
    min-height: 28px;
    padding: 6px 8px;
    background: #f8fbfd;
    border-color: #d7dee8;
    color: ${UI.muted};
    font-size: 12px;
    font-weight: 850;
  }
  .ucrane-page .rbc-time-content,
  .ucrane-page .rbc-day-bg + .rbc-day-bg,
  .ucrane-page .rbc-month-row + .rbc-month-row {
    border-color: #e5ebf2;
  }
  .ucrane-page .rbc-event {
    overflow: visible;
  }
  .ucrane-page .ucrane-month-calendar {
    overflow: visible;
  }
  .ucrane-page .ucrane-month-calendar .rbc-calendar,
  .ucrane-page .ucrane-month-calendar .rbc-month-view {
    height: auto !important;
    min-height: 620px;
    overflow: visible;
  }
  .ucrane-page .ucrane-month-calendar .rbc-month-row {
    min-height: 118px;
    height: auto !important;
    overflow: visible;
  }
  .ucrane-page .ucrane-month-calendar .rbc-row-content {
    min-height: 118px;
    overflow: visible;
  }
  .ucrane-page .ucrane-month-calendar .rbc-event {
    height: auto !important;
    min-height: 0;
  }
  .ucrane-upcoming-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 1180px) {
    .ucrane-upcoming-grid { grid-template-columns: 1fr; }
  }
`;

const NIGHT_SHOOT_STYLE = { bg: "#f796dfff", text: "#111", border: "#de24e4ff" };

// ---- status colour map used for job blocks ----
const STATUS_COLORS = {
  Confirmed: { bg: "#f3f970", text: "#111", border: "#0b0b0b" },
  "First Pencil": { bg: "#89caf5", text: "#111", border: "#0b0b0b" },
  "Second Pencil": { bg: "#f73939", text: "#fff", border: "#0b0b0b" },
  Complete: { bg: "#719b6eff", text: "#111", border: "#0b0b0b" },
  "Action Required": { bg: "#FF973B", text: "#111", border: "#0b0b0b" },
  DNH: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
};

const getStatusStyle = (s = "") =>
  STATUS_COLORS[s] || { bg: "#ccc", text: "#111", border: "#0b0b0b" };

// ---- per-user action blocks ----
const RESTRICTED_EMAILS = new Set(["mel@bickers.co.uk"]); // add more if needed

/* ------------------------------- helpers ------------------------------- */
const norm = (v) => String(v ?? "").trim().toLowerCase();

const parseLocalDate = (d) => {
  if (!d) return null;
  const s = typeof d === "string" ? d : String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]),
      mo = Number(m[2]) - 1,
      day = Number(m[3]);
    return new Date(y, mo, day, 12, 0, 0, 0); // noon local
  }
  const dt = new Date(s);
  dt.setHours(12, 0, 0, 0);
  return dt;
};

const startOfLocalDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const labelFromMins = (mins) => {
  const n = Number(mins) || 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

const jobKey = (val) => {
  const s = (val ?? "").toString().trim();
  const numMatch = s.match(/\d+/);
  const num = numMatch ? Number(numMatch[0]) : Number.NaN;
  return { num, raw: s };
};

//  bookings to events (sorted by job number like main diary)
const eventsByJobNumberBookingsOnly = (bookings) => {
  const bookingEvents = (bookings || [])
    .map((b) => {
      const dates = Array.isArray(b.bookingDates) ? b.bookingDates.filter(Boolean).slice().sort() : [];
      let startBase = null;
      let endBase = null;

      if (dates.length) {
        startBase = parseLocalDate(dates[0]);
        endBase = parseLocalDate(dates[dates.length - 1]);
      } else {
        startBase = parseLocalDate(b.startDate || b.date);
        endBase = parseLocalDate(b.endDate || b.date || b.startDate);
      }

      if (!startBase) return null;

      const safeEnd =
        endBase && startBase && endBase < startBase ? startBase : endBase || startBase;

      return {
        ...b,
        __collection: "bookings",
        title: b.client || "",
        start: startOfLocalDay(startBase),
        end: startOfLocalDay(addDays(safeEnd, 1)), // exclusive end
        allDay: true,
        status: b.status || "Confirmed",
      };
    })
    .filter(Boolean);

  bookingEvents.sort((a, b) => {
    const ak = jobKey(a.jobNumber);
    const bk = jobKey(b.jobNumber);
    const aNum = Number.isNaN(ak.num) ? -Infinity : ak.num;
    const bNum = Number.isNaN(bk.num) ? -Infinity : bk.num;

    if (bNum !== aNum) return bNum - aNum;
    if ((bk.raw || "") !== (ak.raw || "")) return (bk.raw || "").localeCompare(ak.raw || "");
    if (a.start.getTime() !== b.start.getTime()) return a.start - b.start;
    const spanA = a.end - a.start;
    const spanB = b.end - b.start;
    if (spanA !== spanB) return spanB - spanA;
    return 0;
  });

  return bookingEvents;
};

const getVehicleRisk = (vehicles) => {
  const reasons = [];
  const list = Array.isArray(vehicles) ? vehicles : [];
  list.forEach((v) => {
    if (!v || typeof v !== "object") return;
    const name = v.name || [v.manufacturer, v.model].filter(Boolean).join(" ") || "Vehicle";
    const plate = v.registration ? ` (${String(v.registration).toUpperCase()})` : "";
    const tax = String(v.taxStatus ?? "").trim().toLowerCase();
    const ins = String(v.insuranceStatus ?? "").trim().toLowerCase();
    if (tax === "sorn" || tax === "untaxed" || tax === "no tax")
      reasons.push(`UN-TAXED / SORN: ${name}${plate}`);
    if (ins === "not insured" || ins === "uninsured" || ins === "no insurance")
      reasons.push(`NO INSURANCE: ${name}${plate}`);
  });
  return { risky: reasons.length > 0, reasons };
};

const isFutureJobEvent = (event) => {
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);

  const endRaw = event?.end || event?.start;
  const end = endRaw instanceof Date ? endRaw : new Date(endRaw);
  if (Number.isNaN(end.getTime())) return false;

  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  lastDay.setHours(0, 0, 0, 0);

  return lastDay > today0;
};

//  match by resolved vehicle NAME containing "u-crane"
const bookingIsUCrane = (booking, vehiclesData) => {
  const list = Array.isArray(booking?.vehicles) ? booking.vehicles : [];

  const resolve = (v) => {
    if (!v) return null;

    // string -> vehicle doc id (most common)
    if (typeof v === "string") {
      const needle = v.trim();
      return (
        vehiclesData.find((x) => x.id === needle) ||
        vehiclesData.find((x) => String(x.registration ?? "").trim() === needle) ||
        vehiclesData.find((x) => String(x.name ?? "").trim() === needle) ||
        null
      );
    }

    // object stored in booking: {id} or already has name
    if (typeof v === "object") {
      if (v.name) return v;
      const id = v.id || v.vehicleId || v.value;
      if (id && typeof id === "string") {
        const needle = id.trim();
        return (
          vehiclesData.find((x) => x.id === needle) ||
          vehiclesData.find((x) => String(x.registration ?? "").trim() === needle) ||
          vehiclesData.find((x) => String(x.name ?? "").trim() === needle) ||
          null
        );
      }
    }

    return null;
  };

  const resolvedNames = list
    .map(resolve)
    .filter(Boolean)
    .map((x) => norm(x.name || [x.manufacturer, x.model].filter(Boolean).join(" ")));

  return resolvedNames.some(
    (n) => n.includes("u-crane") || n.includes("u crane") || n.includes("ucrane")
  );
};

const formatShortRange = (start, endExclusive) => {
  const s = start instanceof Date ? start : new Date(start);
  const e = endExclusive instanceof Date ? endExclusive : new Date(endExclusive);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";

  // calendar uses exclusive end; show inclusive end day
  const inc = new Date(e);
  inc.setDate(inc.getDate() - 1);

  const same =
    s.getFullYear() === inc.getFullYear() &&
    s.getMonth() === inc.getMonth() &&
    s.getDate() === inc.getDate();

  const fmt = (d) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });

  return same ? fmt(s) : `${fmt(s)} - ${fmt(inc)}`;
};

const STATUS_SORT = { Confirmed: 1, "First Pencil": 2, "Second Pencil": 3 };

/* --------------------- CalendarEvent (EXACT style from main diary) ----------------- */
function CalendarEvent({ event }) {
  const router = useRouter();
  const [showNotes, setShowNotes] = useState(false);

  const employeeInitials = Array.isArray(event.employees)
    ? event.employees
        .map((emp) => {
          const employeeName = typeof emp === "string" ? emp : emp?.name || "";
          return employeeName
            .split(" ")
            .map((part) => part[0]?.toUpperCase())
            .join("");
        })
        .filter(Boolean)
        .join(", ")
    : "";

  const hasPerDayCallTimes =
    event.callTimesByDate && Object.keys(event.callTimesByDate).length > 0;

  const bookingStatusLC = String(event.status || "").toLowerCase();
  const hideDayNotes = ["cancelled", "canceled", "postponed", "dnh"].includes(bookingStatusLC);
  const equipmentText = Array.isArray(event?.equipment)
    ? event.equipment
        .map((item) => (typeof item === "string" ? item : item?.name || item?.label || ""))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", ")
    : String(event?.equipment || "").trim();
  const locationText = String(event?.location || "").trim();

  return (
    <div
      title={event.noteToShow || ""}
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: "0.85rem",
        lineHeight: 1.1,
        color: "#0b0b0b",
        fontWeight: 600,
        fontFamily: "Inter, system-ui, Arial, sans-serif",
        textAlign: "left",
        alignItems: "flex-start",
        padding: "5px 6px",
        gap: 1,
        borderRadius: 6,
        whiteSpace: "normal",
        wordBreak: "break-word",
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      <>
        {/* Top row: initials + status + job number */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            marginBottom: 2,
            gap: 6,
          }}
        >
          {employeeInitials && (
            <span
              style={{
                backgroundColor: "white",
                padding: "2px 4px",
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 600,
                border: "1px solid #0b0b0b",
              }}
            >
              {employeeInitials}
            </span>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#111" }}>
                {event.status}
              </span>

              {event.isCrewed && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    color: "#111",
                    marginTop: -2,
                  }}
                >
                  <Check size={12} strokeWidth={3} /> Crew
                </span>
              )}
            </div>

            <span
              style={{
                backgroundColor:
                  event.shootType === "Night"
                    ? "purple"
                    : event.shootType === "Day"
                    ? "white"
                    : "#ffffffff",
                color: event.shootType === "Night" ? "#fff" : "#000",
                padding: "2px 4px",
                borderRadius: 6,
                fontSize: "0.95rem",
                fontWeight: 900,
                border: "1px solid #0b0b0b",
              }}
            >
              {event.jobNumber}
            </span>
          </div>
        </div>

        <span>{event.client}</span>

        {/* Vehicles */}
        {Array.isArray(event.vehicles) &&
          event.vehicles.length > 0 &&
          event.vehicles.map((v, i) => {
            const vmap = event.vehicleStatus || {};

            const rawName =
              v?.name || [v?.manufacturer, v?.model].filter(Boolean).join(" ") || String(v || "");
            const name = String(rawName).trim();
            const plate = v?.registration ? String(v.registration).toUpperCase().trim() : "";

            const tax = String(v.taxStatus || "").toLowerCase();
            const ins = String(v.insuranceStatus || "").toLowerCase();

            const isSornOrUntaxed = ["sorn", "untaxed", "no tax"].includes(tax);
            const isUninsured = ["not insured", "uninsured", "no insurance"].includes(ins);

            const bookingStatus = String(event.status || "").trim().toLowerCase();
            const isConfirmed = bookingStatus === "confirmed";

            const isCancelled = [
              "cancelled",
              "canceled",
              "complete",
              "completed",
              "cancel",
              "postponed",
              "dnh",
            ].includes(bookingStatus);

            if (isCancelled) {
              return (
                <span key={i}>
                  {name}
                  {plate ? ` - ${plate}` : ""}
                </span>
              );
            }

            const today0 = new Date();
            today0.setHours(0, 0, 0, 0);

            const jobLastDay = new Date(event.end);
            jobLastDay.setDate(jobLastDay.getDate() - 1);
            jobLastDay.setHours(0, 0, 0, 0);

            const isFutureJob = jobLastDay > today0;

            if (isConfirmed && isFutureJob && (isSornOrUntaxed || isUninsured)) {
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0px 4px",
                    borderRadius: 4,
                    background: "#e53935",
                    color: "#fff",
                    fontWeight: 700,
                    border: "1px solid #0b0b0b",
                    marginTop: 1,
                  }}
                  title="Vehicle non-compliant (SORN / Not Insured) - future confirmed job"
                >
                  {name}
                  {plate ? ` - ${plate}` : ""}
                </span>
              );
            }

            const idKey = v?.id ? String(v.id).trim() : "";
            const regKey = v?.registration ? String(v.registration).trim() : "";
            const nameKey = name;

            let itemStatusRaw =
              (idKey && vmap[idKey]) ||
              (regKey && vmap[regKey]) ||
              (nameKey && vmap[nameKey]) ||
              "";

            const itemStatus = String(itemStatusRaw || "").trim() || bookingStatus;
            const different = itemStatus && itemStatus !== bookingStatus;

            if (different) {
              const shoot = String(event.shootType || "").toLowerCase();
              const bookingIsConfirmed =
                String(event.status || "").trim().toLowerCase() === "confirmed";
              const vehicleIsConfirmed =
                String(itemStatus || "").trim().toLowerCase() === "confirmed";

              const style =
                shoot === "night" && bookingIsConfirmed && vehicleIsConfirmed
                  ? NIGHT_SHOOT_STYLE
                  : getStatusStyle(itemStatus);

              return (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0px 0px",
                    borderRadius: 2,
                    backgroundColor: style.bg,
                    color: style.text,
                    border: `0px solid ${style.border}`,
                    marginTop: 1,
                  }}
                  title={`Vehicle status: ${itemStatus}`}
                >
                  {name}
                  {plate ? ` - ${plate}` : ""}
                </span>
              );
            }

            return (
              <span key={i}>
                {name}
                {plate ? ` - ${plate}` : ""}
              </span>
            );
          })}

        {equipmentText ? (
          <span style={{ width: "100%", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>
            {equipmentText}
          </span>
        ) : null}
        {locationText ? (
          <span style={{ width: "100%", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>
            {locationText}
          </span>
        ) : null}

        {/* Notes */}
        {(event.notes ||
          (!hideDayNotes &&
            event.notesByDate &&
            Object.keys(event.notesByDate).length > 0)) && (
          <div style={{ width: "100%", marginTop: 2 }}>
            {!hideDayNotes &&
              event.notesByDate &&
              Object.keys(event.notesByDate).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                  {Object.keys(event.notesByDate)
                    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                    .sort((a, b) => new Date(a) - new Date(b))
                    .reduce((cols, date, i) => {
                      const col = Math.floor(i / 3);
                      (cols[col] ||= []).push(date);
                      return cols;
                    }, [])
                    .map((chunk, colIndex) => (
                      <div key={colIndex} style={{ display: "flex", flexDirection: "column" }}>
                        {chunk.map((date) => {
                          const note = event.notesByDate[date] || "";
                          const other = event.notesByDate[`${date}-other`];
                          const tmins = event.notesByDate[`${date}-travelMins`];

                          const extra =
                            note === "Other" && other
                              ? ` - ${other}`
                              : note === "Travel Time" && tmins
                              ? ` - ${labelFromMins(tmins)}`
                              : "";

                          const callTimeForDay =
                            (event.callTimesByDate && event.callTimesByDate[date]) || "";

                          const formattedDate = new Date(date).toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "2-digit",
                          });

                          return (
                            <div
                              key={date}
                              style={{
                                fontSize: "0.72rem",
                                fontStyle: "italic",
                                fontWeight: 400,
                                opacity: 0.8,
                                lineHeight: 1.2,
                              }}
                            >
                              {formattedDate}: {note || "-"}
                              {extra}
                              {callTimeForDay ? ` - CT ${callTimeForDay}` : ""}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                </div>
              )}

            {event.notes && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotes((s) => !s);
                  }}
                  style={{
                    fontSize: "0.7rem",
                    padding: "2px 8px",
                    border: "1px solid #111",
                    background: "transparent",
                    cursor: "pointer",
                    borderRadius: 6,
                  }}
                >
                  {showNotes ? "Hide Notes" : "Show Notes"}
                </button>

                {showNotes && (
                  <div
                    style={{
                      opacity: 0.9,
                      fontWeight: 500,
                      fontSize: "0.75rem",
                      lineHeight: 1.25,
                      marginTop: 2,
                    }}
                  >
                    {event.notes}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Badge row (keep, identical behaviour) */}
        {(() => {
          const status = (event.status || "").toLowerCase();
          const hideForStatus = ["cancelled", "dnh", "lost", "postponed"].includes(status);
          if (hideForStatus) return null;

          return (
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                justifyContent: "flex-start",
                marginTop: 4,
                width: "100%",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 400,
                  padding: "2px 6px",
                  borderRadius: 6,
                  backgroundColor: event.hasHS ? "#4caf50" : "#f44336",
                  color: "#fff",
                  border: "1px solid rgba(0,0,0,0.8)",
                }}
              >
                HS {event.hasHS ? "Yes" : "No"}
              </span>

              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 400,
                  padding: "2px 6px",
                  borderRadius: 6,
                  backgroundColor: event.hasRiskAssessment ? "#4caf50" : "#f44336",
                  color: "#fff",
                  border: "1px solid rgba(0,0,0,0.8)",
                }}
              >
                RA {event.hasRiskAssessment ? "Yes" : "No"}
              </span>
            </div>
          );
        })()}

        {/* RECCE LINK ONLY (jobs) */}
        {event.hasRecce && event.recceId && (
          <div style={{ width: "100%", marginTop: 6 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/recce-form/${event.recceId}`);
              }}
              title="Open full recce form"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: "0.6rem",
                fontWeight: 800,
                border: "1.5px solid #0b0b0b",
                background: "#111827",
                color: "#fff",
              }}
            >
              View recce form ↗
              {event.recceStatus && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 900,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "#fff",
                    color: "#111",
                    border: "1px solid rgba(0,0,0,0.8)",
                  }}
                >
                  {(event.recceStatus || "Submitted").toUpperCase()}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Risk box */}
        {event.isRisky && Array.isArray(event.riskReasons) && event.riskReasons.length > 0 && (
          <div style={{ width: "100%", marginTop: 6 }}>
            <div
              style={{
                backgroundColor: "#e53935",
                color: "#fff",
                border: "1.5px solid #000",
                borderRadius: 6,
                padding: "4px 6px",
                fontSize: "0.74rem",
                fontWeight: 900,
                letterSpacing: 0.2,
              }}
            >
              VEHICLE COMPLIANCE ISSUE
            </div>
            <div
              style={{
                marginTop: 4,
                background: "#ffe6e6",
                border: "1px dashed #e53935",
                borderRadius: 6,
                padding: "4px 6px",
                fontSize: "0.74rem",
                lineHeight: 1.25,
                color: "#000",
                fontWeight: 700,
              }}
            >
              {event.riskReasons.map((r, i) => (
                <div key={i} style={{ marginTop: i ? 3 : 0 }}>
                  {r}
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    </div>
  );
}

/* ------------------------------- Page component ----------------------------- */
export default function DashboardPage({ bookingSaved }) {
  const router = useRouter();
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);

  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  const [allBookingsRaw, setAllBookingsRaw] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);

  const [calendarView, setCalendarView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [selectedBookingSnapshot, setSelectedBookingSnapshot] = useState(null);
  const [createBookingOpening, setCreateBookingOpening] = useState(false);
  const [createBookingProgress, setCreateBookingProgress] = useState(0);
  const [showBookingSaved, setShowBookingSaved] = useState(Boolean(bookingSaved));
  const closeSelectedBooking = useCallback(() => {
    setSelectedBookingId(null);
    setSelectedBookingSnapshot(null);
  }, []);
  const openSelectedBooking = useCallback((booking) => {
    if (!booking?.id) return;
    setSelectedBookingSnapshot(booking);
    setSelectedBookingId(booking.id);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email?.toLowerCase() || null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isRestricted = userEmail ? RESTRICTED_EMAILS.has(userEmail) : false;

  useEffect(() => {
    if (bookingSaved) {
      setShowBookingSaved(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setShowBookingSaved(params.get("saved") === "true" || params.get("success") === "true");
  }, [bookingSaved]);

  useEffect(() => {
    if (!createBookingOpening) return undefined;

    const timer = window.setInterval(() => {
      setCreateBookingProgress((current) => {
        if (current < 72) return current + 7;
        if (current < 91) return current + 2;
        return current;
      });
    }, 260);

    return () => window.clearInterval(timer);
  }, [createBookingOpening]);

  // Vehicles (needed to resolve booking vehicle IDs to names)
  useEffect(() => {
    if (!authReady || !authState?.user) return;

    const unsubVehicles = onSnapshot(tenantCollectionQuery(db, "vehicles", authState), (snap) => {
      setVehiclesData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsubVehicles();
  }, [accessKey, authReady, authState]);

  // Raw bookings
  useEffect(() => {
    if (!authReady || !authState?.user) return;

    const unsubBookings = onSnapshot(tenantCollectionQuery(db, "bookings", authState), (snap) => {
      setAllBookingsRaw(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsubBookings();
  }, [accessKey, authReady, authState]);

  // Normalise vehicles inside a booking (string ids -> vehicle objects)
  const normalizeVehicles = useCallback(
    (list) => {
      if (!Array.isArray(list)) return [];
      return list.map((v) => {
        if (v && typeof v === "object" && (v.name || v.registration)) return v;
        const needle = String(v ?? "").trim();
        const match =
          vehiclesData.find((x) => x.id === needle) ||
          vehiclesData.find((x) => String(x.registration ?? "").trim() === needle) ||
          vehiclesData.find((x) => String(x.name ?? "").trim() === needle);
        return match || { name: needle };
      });
    },
    [vehiclesData]
  );

  //  Filter to U-CRANE by resolved vehicle NAME
  const uCraneBookings = useMemo(() => {
    const base = Array.isArray(allBookingsRaw) ? allBookingsRaw : [];
    if (!vehiclesData.length) {
      // if vehicles haven't loaded yet, keep nothing to avoid wrong matches
      return [];
    }
    return base.filter((b) => bookingIsUCrane(b, vehiclesData));
  }, [allBookingsRaw, vehiclesData]);

  // Build events + risk flags (so CalendarEvent matches main diary behaviour)
  const workDiaryEvents = useMemo(() => {
    const events = eventsByJobNumberBookingsOnly(uCraneBookings);

    return events.map((ev) => {
      const normalizedVehicles = normalizeVehicles(ev.vehicles);
      const risk = getVehicleRisk(normalizedVehicles);

      return {
        ...ev,
        vehicles: normalizedVehicles,
        isRisky: risk.risky,
        riskReasons: risk.reasons,
        // keep any existing per-booking props intact
      };
    });
  }, [uCraneBookings, normalizeVehicles]);

  const selectedBooking = useMemo(
    () =>
      selectedBookingSnapshot ||
      uCraneBookings.find((booking) => booking.id === selectedBookingId) ||
      allBookingsRaw.find((booking) => booking.id === selectedBookingId) ||
      null,
    [allBookingsRaw, selectedBookingId, selectedBookingSnapshot, uCraneBookings]
  );

  //  Upcoming (below calendar): Confirmed / First Pencil / Second Pencil (future only)
  const upcomingByStatus = useMemo(() => {
    const wanted = new Set(["confirmed", "first pencil", "second pencil"]);

    const future = (workDiaryEvents || [])
      .filter((e) => isFutureJobEvent(e))
      .filter((e) => wanted.has(String(e.status || "").trim().toLowerCase()));

    // sort: soonest first, then job number desc
    future.sort((a, b) => {
      const as = a.start?.getTime?.() || 0;
      const bs = b.start?.getTime?.() || 0;
      if (as !== bs) return as - bs;

      const ak = jobKey(a.jobNumber);
      const bk = jobKey(b.jobNumber);
      const aNum = Number.isNaN(ak.num) ? -Infinity : ak.num;
      const bNum = Number.isNaN(bk.num) ? -Infinity : bk.num;
      if (bNum !== aNum) return bNum - aNum;

      return String(bk.raw || "").localeCompare(String(ak.raw || ""));
    });

    const out = { Confirmed: [], "First Pencil": [], "Second Pencil": [] };
    future.forEach((e) => {
      const s = String(e.status || "").trim();
      if (out[s]) out[s].push(e);
    });

    return out;
  }, [workDiaryEvents]);

  const goToCreateUCraneBooking = useCallback(() => {
    if (isRestricted || createBookingOpening) return;
    setCreateBookingOpening(true);
    setCreateBookingProgress(8);

    window.setTimeout(() => {
      try {
        router.push("/u-crane-booking");
      } catch (error) {
        console.error("Failed to open U-Crane booking page:", error);
        setCreateBookingOpening(false);
        setCreateBookingProgress(0);
      }
    }, 80);
  }, [createBookingOpening, isRestricted, router]);

  const UpcomingColumn = useCallback(
    ({ label }) => {
      const items = upcomingByStatus?.[label] || [];
      const style = getStatusStyle(label);

      return (
        <div
          style={{
            ...surface,
            padding: 12,
            borderRadius: UI.radius,
            border: UI.border,
            background: "#fff",
            minHeight: 140,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: style.bg,
                  border: `2px solid ${style.border}`,
                  display: "inline-block",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 950, fontSize: 13, color: UI.text }}>{label}</div>
                <div style={{ fontSize: 12, color: UI.muted }}>{items.length} upcoming</div>
              </div>
            </div>

            <span style={{ ...chip, fontSize: 12 }}>{items.length}</span>
          </div>

          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {items.length === 0 ? (
              <div style={{ fontSize: 12, color: UI.muted, padding: "10px 8px" }}>
                Nothing upcoming.
              </div>
            ) : (
              items.slice(0, 12).map((e) => {
                const range = formatShortRange(e.start, e.end);
                const riskHot = e.isRisky && isFutureJobEvent(e);

                return (
                  <button
                    key={e.id}
                    onClick={() => openSelectedBooking(e)}
                    type="button"
                    style={{
                      textAlign: "left",
                      width: "100%",
                      borderRadius: UI.radiusSm,
                      border: riskHot ? "2px solid #0b0b0b" : "1px solid #e5e7eb",
                      background: riskHot ? "#fee2e2" : "#f8fafc",
                      padding: "10px 10px",
                      cursor: "pointer",
                      boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
                    }}
                    title="Click to view booking"
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 950, color: UI.text, fontSize: 13 }}>
                        {String(e.jobNumber || "").toUpperCase()} - {String(e.client || "").toUpperCase()}
                      </div>
                      <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>{range}</div>
                    </div>

                    <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {e.location && (
                        <span style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                          {String(e.location).toUpperCase()}
                        </span>
                      )}
                      {riskHot && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 950,
                            color: "#991b1b",
                            background: "#fff",
                            border: "1px solid #991b1b",
                            padding: "2px 6px",
                            borderRadius: UI.radiusSm,
                          }}
                        >
                          VEHICLE RISK
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}

            {(items.length || 0) > 12 && (
              <div style={{ fontSize: 12, color: UI.muted, padding: "2px 2px 0" }}>
                Showing 12 of {items.length}.
              </div>
            )}
          </div>
        </div>
      );
    },
    [openSelectedBooking, upcomingByStatus]
  );

  return (
    <HeaderSidebarLayout>
      <style>{pageCss}</style>
      <div className="ucrane-page" style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>U-Crane</h1>
            <div style={sub}>Dedicated operations diary for U-Crane activity and related vehicle bookings.</div>
          </div>
          <div style={sectionActions}>
            {showBookingSaved && (
              <div style={successBanner}>
                <Check size={14} strokeWidth={3} /> Booking saved successfully
              </div>
            )}
          </div>
        </div>

        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>U-Crane Work Diary</h2>
              <div style={hint}>Live operational calendar for U-Crane bookings using the same diary logic as the main schedule.</div>
            </div>

            <div style={sectionActions}>
              <button
                style={btn("ghost")}
                onClick={() =>
                  setCurrentDate((prev) => {
                    const d = new Date(prev);
                    d.setDate(d.getDate() - 7);
                    return d;
                  })
                }
                type="button"
              >
                <ChevronLeft size={14} /> Previous Week
              </button>

              <button
                style={btn("ghost")}
                onClick={() =>
                  setCurrentDate((prev) => {
                    const d = new Date(prev);
                    d.setDate(d.getDate() + 7);
                    return d;
                  })
                }
                type="button"
              >
                Next Week <ChevronRight size={14} />
              </button>

              <button
                style={
                  isRestricted
                    ? btnDisabled(btn())
                    : createBookingOpening
                    ? { ...btn(), opacity: 0.86, cursor: "wait" }
                    : btn()
                }
                onClick={goToCreateUCraneBooking}
                disabled={isRestricted || createBookingOpening}
                aria-disabled={isRestricted || createBookingOpening}
                title={isRestricted ? "Your account is not allowed to create bookings" : ""}
                type="button"
              >
                <Plus size={14} />
                {createBookingOpening ? `Opening ${createBookingProgress}%` : "Create U-Crane Booking"}
              </button>

              <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
                <CalendarDays size={14} />
                {currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
            </div>
          </div>

          <div
            style={calendarShell}
            className={calendarView === "month" ? "ucrane-month-calendar" : ""}
          >
            <BigCalendar
              localizer={localizer}
              events={workDiaryEvents}
              view={calendarView}
              views={["week", "month"]}
              onView={(v) => setCalendarView(v)}
              date={currentDate}
              onNavigate={(d) => setCurrentDate(d)}
              selectable={false}
              startAccessor="start"
              endAccessor="end"
              popup
              allDayAccessor={() => true}
              allDaySlot
              dayLayoutAlgorithm="no-overlap"
              toolbar={false}
              nowIndicator={false}
              getNow={() => new Date(2000, 0, 1)}
              formats={{
                dayFormat: (date, culture, localizer) => localizer.format(date, "EEEE dd", culture),
              }}
              dayPropGetter={(date) => {
                const todayD = new Date();
                const isToday =
                  date.getDate() === todayD.getDate() &&
                  date.getMonth() === todayD.getMonth() &&
                  date.getFullYear() === todayD.getFullYear();

                return {
                  style: {
                    backgroundColor: isToday ? "rgba(29,78,216,0.10)" : undefined,
                    border: isToday ? "1px solid rgba(29,78,216,0.55)" : undefined,
                  },
                };
              }}
              style={{ height: calendarView === "month" ? "auto" : 610, background: "#fff" }}
              onSelectEvent={(e) => {
                openSelectedBooking(e);
              }}
              components={{ event: CalendarEvent }}
              eventPropGetter={(event) => {
                const status = event.status || "Confirmed";

                // base style by status
                let style = getStatusStyle(status);

                // risky future confirmed jobs go red
                const risky = !!event.isRisky;
                if (risky && isFutureJobEvent(event)) {
                  return {
                    style: {
                      backgroundColor: "#e53935",
                      color: "#fff",
                    fontWeight: 700,
                    padding: 0,
                    borderRadius: 8,
                      border: "1px solid #991b1b",
                      boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
                      cursor: "pointer",
                    },
                  };
                }

                // night shoot styling (same rule set as main page)
                const shoot = String(event.shootType || "").toLowerCase();
                const bookingStatuses = new Set([
                  "confirmed",
                  "first pencil",
                  "second pencil",
                  "complete",
                  "action required",
                  "dnh",
                ]);

                if (shoot === "night" && bookingStatuses.has(String(status || "").toLowerCase())) {
                  style = NIGHT_SHOOT_STYLE;
                }

                return {
                  style: {
                    backgroundColor: style.bg,
                    color: style.text,
                    fontWeight: 700,
                    padding: 0,
                    borderRadius: 8,
                    border: `1px solid ${style.border}`,
                    boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
                    cursor: "pointer",
                  },
                };
              }}
            />
          </div>

          {/*  UPCOMING SECTION (below calendar) */}
          <div style={{ marginTop: 16 }}>
            <div style={{ ...sectionHeader, marginBottom: 12 }}>
              <div>
                <h3 style={{ ...titleMd, fontSize: 15 }}>Upcoming</h3>
                <div style={hint}>Future U-Crane work grouped by booking status for quick operational review.</div>
              </div>

              <div style={sectionActions}>
                {["Confirmed", "First Pencil", "Second Pencil"].map((s) => (
                  <div
                    key={s}
                    style={{
                      ...chip,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#fff",
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: UI.radiusSm,
                        background: getStatusStyle(s).bg,
                        border: `2px solid ${getStatusStyle(s).border}`,
                        display: "inline-block",
                      }}
                    />
                    {s}
                  </div>
                ))}
              </div>
            </div>

            <div className="ucrane-upcoming-grid">
              <UpcomingColumn label="Confirmed" />
              <UpcomingColumn label="First Pencil" />
              <UpcomingColumn label="Second Pencil" />
            </div>

            <div style={{ marginTop: 10, color: UI.muted, fontSize: 12 }}>
              Tip: click any item to open the booking modal.
            </div>
          </div>
        </section>
      </div>

      {selectedBookingId && (
        <ViewUCraneBooking
          id={selectedBookingId}
          onClose={closeSelectedBooking}
          initialBooking={selectedBooking}
          initialVehicles={vehiclesData}
        />
      )}

      {createBookingOpening && (
        <RouteLoadingOverlay
          progress={createBookingProgress}
          title="Opening U-Crane booking"
          hint="Preparing the U-Crane create page..."
        />
      )}
    </HeaderSidebarLayout>
  );
}
