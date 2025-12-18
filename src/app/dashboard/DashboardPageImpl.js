// src/app/dashboard/page.js
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import "react-big-calendar/lib/css/react-big-calendar.css";

const BigCalendar = dynamic(
  () => import("react-big-calendar").then((m) => m.Calendar),
  { ssr: false }
);

import { localizer } from "../utils/localizer";
import {
  collection,
  onSnapshot,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

import ViewBookingModal from "../components/ViewBookingModal";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Check } from "lucide-react";
import EditHolidayForm from "../components/EditHolidayForm";
import HolidayForm from "../components/holidayform";
import CreateNote from "../components/create-note";
import ViewMaintenanceModal from "../components/ViewMaintenanceModal";

/* ───────────────────────────────────────────
   New styling tokens (match your HR page)
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

const pageWrap = {
  padding: "24px 18px 40px",
  background: UI.bg,
  minHeight: "100vh",
};

const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
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

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const card = {
  ...surface,
  padding: 16,
};

const sectionHeader = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const titleMd = { fontSize: 16, fontWeight: 900, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12, marginTop: 4 };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  if (kind === "danger") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #fecaca",
      background: "#fee2e2",
      color: "#991b1b",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    padding: "10px 12px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
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
  background: "#ecfdf5",
  color: "#065f46",
  border: "1px solid #10b981",
  borderRadius: UI.radiusSm,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 14,
};

const tableWrap = {
  width: "100%",
  overflow: "auto",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: "#fff",
};
const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13.5,
};
const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  position: "sticky",
  top: 0,
  background: "#f8fafc",
  zIndex: 1,
  whiteSpace: "nowrap",
  fontWeight: 900,
  fontSize: 12,
  color: UI.text,
};
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" };

const NIGHT_SHOOT_STYLE = { bg: "#f796dfff", text: "#111", border: "#de24e4ff" };

// ---- status colour map used for per-vehicle pills ----
const STATUS_COLORS = {
  Confirmed: { bg: "#f3f970", text: "#111", border: "#0b0b0b" },
  "First Pencil": { bg: "#89caf5", text: "#111", border: "#0b0b0b" },
  "Second Pencil": { bg: "#f73939", text: "#fff", border: "#0b0b0b" },
  Holiday: { bg: "#d3d3d3", text: "#111", border: "#0b0b0b" },
  Maintenance: { bg: "#f97316", text: "#111", border: "#0b0b0b" },
  Complete: { bg: "#719b6eff", text: "#111", border: "#0b0b0b" },
  "Action Required": { bg: "#FF973B", text: "#111", border: "#0b0b0b" },
  DNH: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
};

const getStatusStyle = (s = "") =>
  STATUS_COLORS[s] || { bg: "#ccc", text: "#111", border: "#0b0b0b" };

// ---- per-user action blocks ----
const RESTRICTED_EMAILS = new Set(["mel@bickers.co.uk"]); // add more if needed

/* ------------------------------- helpers ------------------------------- */
const parseLocalDate = (d) => {
  if (!d) return null;
  const s = typeof d === "string" ? d : String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]),
      mo = Number(m[2]) - 1,
      day = Number(m[3]);
    const dt = new Date(y, mo, day, 12, 0, 0, 0); // noon local
    return dt;
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

// 🔥 helper for timestamps / dates / strings  (use this for HOLIDAYS + NOTES)
const toJsDate = (value) => {
  if (!value) return null;

  if (value?.toDate && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
    return new Date(value);
  }

  return new Date(value);
};

// job sort helpers (unchanged)
const jobKey = (val) => {
  const s = (val ?? "").toString().trim();
  const numMatch = s.match(/\d+/);
  const num = numMatch ? Number(numMatch[0]) : Number.NaN;
  return { num, raw: s };
};

// ✅ Single source of truth for both BOOKINGS + MAINTENANCE
const eventsByJobNumber = (bookings, maintenanceBookings) => {
  // normal bookings → full events
  const bookingEvents = (bookings || []).map((b) => {
    const startBase = parseLocalDate(b.startDate || b.date);
    const endRaw = b.endDate || b.date || b.startDate;
    const endBase = parseLocalDate(endRaw);
    const safeEnd =
      endBase && startBase && endBase < startBase ? startBase : endBase || startBase;

    return {
      ...b,
      __collection: "bookings",
      title: b.client || "",
      start: startOfLocalDay(startBase),
      end: startOfLocalDay(addDays(safeEnd, 1)),
      allDay: true,
      status: b.status || "Confirmed",
    };
  });

  // maintenance bookings → full events
// maintenance bookings → full events
const maintenanceEvents = (maintenanceBookings || [])
  .flatMap((m) => {
    const dates = Array.isArray(m.bookingDates) ? m.bookingDates.slice().sort() : [];

    // ✅ If bookingDates exists, create one all-day event per selected day
    if (dates.length) {
      return dates
        .map((ymd) => {
          const startBase = parseLocalDate(ymd);
          if (!startBase) return null;

          return {
            ...m,
            __collection: "maintenanceBookings",
            __parentId: m.id,       // ✅ link back to true doc id
            __occurrence: ymd,      // optional: which day this is
            id: `${m.id}__${ymd}`,  // ✅ unique per-day id for calendar rendering

            jobNumber: m.jobNumber ?? "",
            title: m.jobNumber || m.title || "Maintenance",
            maintenanceType: m.maintenanceType || "",
            maintenanceTypeOther: m.maintenanceTypeOther || "",
            maintenanceTypeLabel:
              m.maintenanceTypeLabel ||
              (m.maintenanceType === "Other"
                ? m.maintenanceTypeOther || "Other"
                : m.maintenanceType || "Maintenance"),

            start: startOfLocalDay(startBase),
            end: startOfLocalDay(addDays(startBase, 1)),
            allDay: true,
            status: "Maintenance",
          };
        })
        .filter(Boolean);
    }

    // ✅ Fallback for older docs that don’t have bookingDates
    const startBase = parseLocalDate(m.startDate || m.date || m.start || m.startDay);
    if (!startBase) return [];

    const endRaw = m.endDate || m.end || m.date || m.startDate || m.start || m.startDay;
    const endBase = parseLocalDate(endRaw);
    const safeEnd = endBase && endBase >= startBase ? endBase : startBase;

    return [
      {
        ...m,
        __collection: "maintenanceBookings",
        __parentId: m.id,
        id: m.id,
        jobNumber: m.jobNumber ?? "",
        title: m.jobNumber || m.title || m.vehicleName || "Maintenance",
        maintenanceType: m.maintenanceType || "",
        maintenanceTypeOther: m.maintenanceTypeOther || "",
        maintenanceTypeLabel:
          m.maintenanceTypeLabel ||
          (m.maintenanceType === "Other"
            ? m.maintenanceTypeOther || "Other"
            : m.maintenanceType || "Maintenance"),
        start: startOfLocalDay(startBase),
        end: startOfLocalDay(addDays(safeEnd, 1)),
        allDay: true,
        status: "Maintenance",
      },
    ];
  });


  const all = [...bookingEvents, ...maintenanceEvents];

  all.sort((a, b) => {
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

  return all;
};

const formatCrew = (employees) => {
  if (!Array.isArray(employees) || employees.length === 0) return "—";
  return employees
    .map((emp) => {
      if (typeof emp === "string") return emp;
      if (!emp || typeof emp !== "object") return "";
      const fromName = emp.name?.toString().trim();
      if (fromName) return fromName;
      const firstLast = [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim();
      if (firstLast) return firstLast;
      const display = emp.displayName?.toString().trim();
      if (display) return display;
      const email = emp.email?.toString().trim();
      if (email) return email;
      return "";
    })
    .filter(Boolean)
    .join(", ");
};

/* --------------------- CalendarEvent (booking block minimal) ----------------- */
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

  const isMaintenance = event.status === "Maintenance";
  const hasPerDayCallTimes =
    event.callTimesByDate && Object.keys(event.callTimesByDate).length > 0;

  const bookingStatusLC = String(event.status || "").toLowerCase();
  const hideDayNotes = ["cancelled", "canceled", "postponed", "dnh"].includes(bookingStatusLC);

  return (
    <div
      title={event.noteToShow || ""}
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: "0.85rem",
        lineHeight: 1.2,
        color: "#0b0b0b",
        fontWeight: 600,
        fontFamily: "Inter, system-ui, Arial, sans-serif",
        textAlign: "left",
        alignItems: "flex-start",
        padding: 6,
        gap: 2,
        borderRadius: 6,
        whiteSpace: "normal",
        wordBreak: "break-word",
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      {event.status === "Holiday" ? (
        <>
          <span>{event.employee}</span>
          <span style={{ fontStyle: "italic", opacity: 0.75 }}>On Holiday</span>
        </>
      ) : (
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

                {!isMaintenance && event.isCrewed && (
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

          {!isMaintenance && <span>{event.client}</span>}
          {isMaintenance && (
            <span style={{ fontSize: "0.8rem", fontWeight: 900 }}>
              {event.maintenanceTypeLabel || "MAINTENANCE"}
            </span>
          )}

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
                    {plate ? ` – ${plate}` : ""}
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
                      marginTop: 2,
                    }}
                    title="Vehicle non-compliant (SORN / Not Insured) — future confirmed job"
                  >
                    {name}
                    {plate ? ` – ${plate}` : ""}
                  </span>
                );
              }

              const idKey = v?.id ? String(v.id).trim() : "";
              const regKey = v?.registration ? String(v.registration).trim() : "";
              const nameKey = name;

              let itemStatusRaw =
                (idKey && vmap[idKey]) || (regKey && vmap[regKey]) || (nameKey && vmap[nameKey]) || "";

              const norm = (s) => String(s || "").trim();
              const itemStatus = norm(itemStatusRaw) || bookingStatus;
              const different = itemStatus && itemStatus !== bookingStatus;

              if (different) {
                const shoot = String(event.shootType || "").toLowerCase();
                const bookingIsConfirmed = String(event.status || "").trim().toLowerCase() === "confirmed";
                const vehicleIsConfirmed = String(itemStatus || "").trim().toLowerCase() === "confirmed";

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
                      marginTop: 2,
                    }}
                    title={`Vehicle status: ${itemStatus}`}
                  >
                    {name}
                    {plate ? ` – ${plate}` : ""}
                  </span>
                );
              }

              return (
                <span key={i}>
                  {name}
                  {plate ? ` – ${plate}` : ""}
                </span>
              );
            })}

          <span>{event.equipment}</span>
          <span>{event.location}</span>

          {/* Notes */}
          {(event.notes ||
            (!isMaintenance &&
              !hideDayNotes &&
              event.notesByDate &&
              Object.keys(event.notesByDate).length > 0)) && (
            <div style={{ width: "100%", marginTop: 4 }}>
              {!isMaintenance &&
                !hideDayNotes &&
                event.notesByDate &&
                Object.keys(event.notesByDate).length > 0 && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
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
                                ? ` — ${other}`
                                : note === "Travel Time" && tmins
                                ? ` — ${labelFromMins(tmins)}`
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
                                {formattedDate}: {note || "—"}
                                {extra}
                                {callTimeForDay ? ` — CT ${callTimeForDay}` : ""}
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
                        marginTop: 4,
                      }}
                    >
                      {event.notes}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Badge row (unchanged logic) */}
          {(() => {
            const status = (event.status || "").toLowerCase();
            const hideForStatus = ["cancelled", "dnh", "lost", "postponed"].includes(status);
            if (isMaintenance || hideForStatus) return null;

            return (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  justifyContent: "flex-start",
                  marginTop: 6,
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
                  HS {event.hasHS ? "✓" : "✗"}
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
                  RA {event.hasRiskAssessment ? "✓" : "✗"}
                </span>

                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 400,
                    padding: "2px 6px",
                    borderRadius: 6,
                    backgroundColor: event.hasHotel ? "#4caf50" : "#f44336",
                    color: "#fff",
                    border: "1px solid rgba(0,0,0,0.8)",
                  }}
                >
                  H {event.hasHotel ? "✓" : "✗"}
                </span>

                <span
                  title={event.hasRiggingAddress ? event.riggingAddress || "" : ""}
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 400,
                    padding: "2px 6px",
                    borderRadius: 6,
                    backgroundColor: event.hasRiggingAddress ? "#4caf50" : "#f44336",
                    color: "#fff",
                    border: "1px solid rgba(0,0,0,0.8)",
                  }}
                >
                  UB {event.hasRiggingAddress ? "✓" : "✗"}
                </span>

                {(() => {
                  const hasAnyCallTime =
                    !!event.callTime ||
                    (hasPerDayCallTimes && Object.values(event.callTimesByDate || {}).some(Boolean));

                  return (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 400,
                        padding: "2px 6px",
                        borderRadius: 6,
                        backgroundColor: hasAnyCallTime ? "#4caf50" : "#f44336",
                        color: "#fff",
                        border: "1px solid rgba(0,0,0,0.8)",
                      }}
                      title={
                        hasAnyCallTime
                          ? event.callTime
                            ? `Call Time set: ${event.callTime}`
                            : "Call Time set (per day)"
                          : "No call time set"
                      }
                    >
                      CT {hasAnyCallTime ? "✓" : "✗"}
                    </span>
                  );
                })()}
              </div>
            );
          })()}

          {/* RECCE LINK ONLY (jobs) */}
          {!isMaintenance && event.hasRecce && event.recceId && (
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
      )}
    </div>
  );
}

/* ------------------------------- Page component ----------------------------- */
export default function DashboardPage({ bookingSaved }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [calendarView, setCalendarView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidays, setHolidays] = useState([]);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(null);
  const [notes, setNotes] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingHolidayId, setEditingHolidayId] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);
  const [selectedMaintenance, setSelectedMaintenance] = useState(null); // { id, collection }

  // ✅ Holiday modal
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);

  // ✅ Create Note modal
  const [createNoteOpen, setCreateNoteOpen] = useState(false);

  const [maintenanceView, setMaintenanceView] = useState("week");
  const [maintenanceDate, setMaintenanceDate] = useState(new Date());

  // Gate Calendar rendering to client only
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email?.toLowerCase() || null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isRestricted = userEmail ? RESTRICTED_EMAILS.has(userEmail) : false;

  const goToCreateBooking = useCallback(() => {
    if (isRestricted) return;
    router.push("/create-booking");
  }, [isRestricted, router]);

  const goToEditBooking = useCallback(
    (id) => {
      if (isRestricted) return;
      router.push(`/edit-booking/${id}`);
    },
    [isRestricted, router]
  );

  const goToCreateMaintenance = useCallback(
    (e) => {
      e?.preventDefault?.();
      if (isRestricted) return;
      router.push("/maintenance/new");
    },
    [isRestricted, router]
  );

  // NEW: hold latest recce per booking
  const [reccesByBooking, setReccesByBooking] = useState({});

  useEffect(() => {
    const unsubRecces = onSnapshot(collection(db, "recces"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const r = { id: d.id, ...d.data() };
        const k = r.bookingId;
        if (!k) return;

        const cur = map[k];
        const curTs = cur?.createdAt?.seconds || 0;
        const rTs = r?.createdAt?.seconds || 0;

        if (!cur || rTs >= curTs) {
          const a = r.answers || {};
          const notes = a.notes || a.additionalNotes || a.accessNotes || a.risks || "";

          map[k] = {
            id: r.id,
            status: r.status || "submitted",
            notes: String(notes || "").trim(),
            answers: r.answers || {},
            createdAt: r.createdAt || null,
          };
        }
      });
      setReccesByBooking(map);
    });

    return () => unsubRecces();
  }, []);

  // normaliser/risk
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

  const getVehicleRisk = (vehicles) => {
    const reasons = [];
    const list = Array.isArray(vehicles) ? vehicles : [];
    list.forEach((v) => {
      if (!v || typeof v !== "object") return;
      const name =
        v.name || [v.manufacturer, v.model].filter(Boolean).join(" ") || "Vehicle";
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

    // end is exclusive (+1 day). Convert to last real day.
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() - 1);
    lastDay.setHours(0, 0, 0, 0);

    return lastDay > today0;
  };

  // listeners
  useEffect(() => {
    if (!authReady) return;

    const unsubBookings = onSnapshot(collection(db, "bookings"), (snap) => {
      setBookings(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    // ✅ FIX: holidays show properly (Timestamp/Date/string safe)
    const unsubHolidays = onSnapshot(collection(db, "holidays"), (snap) => {
      const holidayEvents = snap.docs
        .map((docSnap) => {
          const data = docSnap.data();

          const s0 = toJsDate(data.startDate);
          const e0 = toJsDate(data.endDate || data.startDate);

          if (!s0) return null;

          const startBase = startOfLocalDay(s0);
          const endBase = e0 ? startOfLocalDay(e0) : startBase;
          const safeEnd = endBase >= startBase ? endBase : startBase;

          const employee = (data.employee || data.employeeCode || "Unknown").toString();

          return {
            id: docSnap.id,
            title: `${employee} - Holiday`,
            start: startBase,
            end: startOfLocalDay(addDays(safeEnd, 1)), // exclusive end
            allDay: true,
            status: "Holiday",
            employee,
            // keep original data if you need it later
            ...data,
          };
        })
        .filter(Boolean);

      setHolidays(holidayEvents);
    });

    const unsubNotes = onSnapshot(collection(db, "notes"), (snap) => {
      const noteEvents = snap.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const d0 = toJsDate(data.date);
          if (!d0) return null;
          const day = startOfLocalDay(d0);
          return {
            id: docSnap.id,
            title: data.text || "Note",
            start: day,
            end: addDays(day, 1), // exclusive end keeps all-day rendering consistent
            allDay: true,
            status: "Note",
            employee: data.employee || "",
          };
        })
        .filter(Boolean);
      setNotes(noteEvents);
    });

    const unsubMaintenance = onSnapshot(
      collection(db, "maintenanceBookings"),
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMaintenanceBookings(raw);
      },
      (error) => {
        console.error("[maintenance] onSnapshot error:", error);
      }
    );

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehiclesData(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    return () => {
      unsubBookings();
      unsubHolidays();
      unsubNotes();
      unsubVehicles();
      unsubMaintenance();
    };
  }, [authReady]);

  const fetchBookings = async () => {
    const snapshot = await getDocs(collection(db, "bookings"));
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    setBookings(data);
  };

  const fetchHolidays = async () => {
    const snapshot = await getDocs(collection(db, "holidays"));
    const holidayEvents = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();

        const s0 = toJsDate(data.startDate);
        const e0 = toJsDate(data.endDate || data.startDate);
        if (!s0) return null;

        const startBase = startOfLocalDay(s0);
        const endBase = e0 ? startOfLocalDay(e0) : startBase;
        const safeEnd = endBase >= startBase ? endBase : startBase;

        const employee = (data.employee || data.employeeCode || "Unknown").toString();

        return {
          id: docSnap.id,
          title: `${employee} - Holiday`,
          start: startBase,
          end: startOfLocalDay(addDays(safeEnd, 1)),
          allDay: true,
          status: "Holiday",
          employee,
          ...data,
        };
      })
      .filter(Boolean);

    setHolidays(holidayEvents);
  };

  const fetchNotes = async () => {
    const snapshot = await getDocs(collection(db, "notes"));
    const noteEvents = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        const d0 = toJsDate(data.date);
        if (!d0) return null;
        const day = startOfLocalDay(d0);
        return {
          id: docSnap.id,
          title: data.text || "Note",
          start: day,
          end: addDays(day, 1),
          allDay: true,
          status: "Note",
          employee: data.employee || "",
        };
      })
      .filter(Boolean);
    setNotes(noteEvents);
  };

  // ✅ minimal saveBooking so the existing modal doesn't crash if used
  const saveBooking = async (payload) => {
    try {
      await addDoc(collection(db, "bookings"), {
        ...payload,
        createdAt: new Date(),
      });
      setShowModal(false);
      fetchBookings();
    } catch (err) {
      console.error("Error saving booking:", err);
      alert("Failed to save booking.");
    }
  };

  // --- note helpers (create / update / delete) ---
  const handleSaveNote = async (e) => {
    e.preventDefault();

    if (!noteDate || !noteText.trim()) {
      alert("Please fill in a date and some note text.");
      return;
    }

    const payload = {
      text: noteText.trim(),
      date: noteDate,
      employee: "",
      updatedAt: new Date(),
    };

    try {
      if (editingNoteId) {
        await updateDoc(doc(db, "notes", editingNoteId), payload);
      } else {
        await addDoc(collection(db, "notes"), {
          ...payload,
          createdAt: new Date(),
        });
      }

      setNoteModalOpen(false);
      setEditingNoteId(null);
      setNoteText("");
      setNoteDate(null);
    } catch (err) {
      console.error("Error saving note:", err);
      alert("Failed to save note. Please try again.");
    }
  };

  const handleDeleteNote = async () => {
    if (!editingNoteId) return;
    if (!confirm("Delete this note?")) return;

    try {
      await deleteDoc(doc(db, "notes", editingNoteId));
      setNoteModalOpen(false);
      setEditingNoteId(null);
      setNoteText("");
      setNoteDate(null);
    } catch (err) {
      console.error("Error deleting note:", err);
      alert("Failed to delete note. Please try again.");
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const todaysJobs = bookings.filter((b) => {
    if (b.bookingDates && Array.isArray(b.bookingDates)) {
      return b.bookingDates.includes(today);
    }
    const singleDate = b.date?.split("T")[0];
    const start = b.startDate?.split("T")[0];
    const end = b.endDate?.split("T")[0];
    return singleDate === today || (start && end && today >= start && today <= end);
  });

  // ✅ Build all calendar events from a single function (jobs + maintenance)
  const allEventsRaw = useMemo(() => eventsByJobNumber(bookings, maintenanceBookings), [bookings, maintenanceBookings]);

  const allEvents = useMemo(() => {
    return allEventsRaw.map((ev) => {
      const normalizedVehicles = normalizeVehicles(ev.vehicles);
      const risk = getVehicleRisk(normalizedVehicles);
      const recce = reccesByBooking[ev.id] || null;

      return {
        ...ev,
        vehicles: normalizedVehicles,
        isRisky: risk.risky,
        riskReasons: risk.reasons,
        hasRecce: !!recce,
        recceStatus: recce?.status || null,
        recceNotes: recce?.notes || "",
        recceAnswers: recce?.answers || null,
        recceId: recce?.id || null,
        recceCreatedAt: recce?.createdAt || null,
      };
    });
  }, [allEventsRaw, normalizeVehicles, reccesByBooking]);

  // Split by type for each calendar
  const workDiaryEvents = allEvents.filter(
    (e) => e.status !== "Holiday" && e.status !== "Note" && e.status !== "Maintenance"
  );
  const maintenanceEvents = allEvents.filter((e) => e.status === "Maintenance");

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Dashboard</h1>
            <div style={sub}>Work diary, maintenance, holidays and notes.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {bookingSaved && <div style={successBanner}>✅ Booking saved successfully!</div>}
          </div>
        </div>

        {/* Work Diary */}
        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Work Diary</h2>
              <div style={hint}>Jobs calendar (week/month). Click empty day to add quick note.</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
                ← Previous Week
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
                Next Week →
              </button>

              <button
                style={isRestricted ? btnDisabled(btn()) : btn()}
                onClick={goToCreateBooking}
                aria-disabled={isRestricted}
                title={isRestricted ? "Your account is not allowed to create bookings" : ""}
                type="button"
              >
                + Add Booking
              </button>

              <button
                style={isRestricted ? btnDisabled(btn()) : btn()}
                onClick={goToCreateMaintenance}
                aria-disabled={isRestricted}
                title={isRestricted ? "Your account is not allowed to create maintenance" : ""}
                type="button"
              >
                + Add Maintenance
              </button>

              <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
                {currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
            </div>
          </div>

          {mounted && (
            <BigCalendar
              localizer={localizer}
              events={workDiaryEvents}
              view={calendarView}
              views={["week", "month"]}
              onView={(v) => setCalendarView(v)}
              date={currentDate}
              onNavigate={(d) => setCurrentDate(d)}
              onSelectSlot={({ start }) => {
                setEditingNoteId(null);
                const d = start instanceof Date ? start : new Date(start);
                setNoteDate(d.toISOString().split("T")[0]);
                setNoteText("");
                setNoteModalOpen(true);
              }}
              selectable
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
              style={{ borderRadius: UI.radius, background: "#fff" }}
              onSelectEvent={(e) => {
                if (!e) return;

                if (e.status === "Holiday") {
                  setEditingHolidayId(e.id);
                  return;
                }

                if (e.status === "Note") {
                  setEditingNoteId(e.id);
                  const d = e.start instanceof Date ? e.start : new Date(e.start);
                  setNoteDate(d.toISOString().split("T")[0]);
                  setNoteText(e.title || "");
                  setNoteModalOpen(true);
                  return;
                }

                if (e.id) setSelectedBookingId(e.id);
              }}
              components={{ event: CalendarEvent }}
              eventPropGetter={(event) => {
                const status = event.status || "Confirmed";

                let bg =
                  {
                    Confirmed: "#f3f970",
                    "First Pencil": "#89caf5",
                    "Second Pencil": "#f73939",
                    Holiday: "#d3d3d3",
                    Maintenance: "#da8e58ff",
                    Complete: "#92d18cff",
                    "Action Required": "#FF973B",
                    DNH: "#c2c2c2",
                  }[status] || "#ccc";

                let text = bg === "#f3f970" || bg === "#d3d3d3" ? "#111" : "#fff";

                let risky = !!event.isRisky;
                if (!("isRisky" in event) && Array.isArray(event.vehicles)) {
                  risky = getVehicleRisk(event.vehicles).risky;
                }

                if (risky) {
                  const isFutureJob = isFutureJobEvent(event);
                  if (isFutureJob) {
                    bg = "#e53935";
                    text = "#fff";
                  }
                }

                const shoot = String(event.shootType || "").toLowerCase();
                const bookingStatuses = new Set([
                  "confirmed",
                  "first pencil",
                  "second pencil",
                  "complete",
                  "action required",
                  "dnh",
                ]);

                if (!risky && bookingStatuses.has((status || "").toLowerCase()) && shoot === "night") {
                  bg = NIGHT_SHOOT_STYLE.bg;
                  text = NIGHT_SHOOT_STYLE.text;
                  return {
                    style: {
                      backgroundColor: bg,
                      color: text,
                      fontWeight: 700,
                      padding: 0,
                      borderRadius: 8,
                      border: `2px solid ${NIGHT_SHOOT_STYLE.border}`,
                      boxShadow: "0 2px 2px rgba(0,0,0,0.18)",
                    },
                  };
                }

                return {
                  style: {
                    backgroundColor: bg,
                    color: text,
                    fontWeight: 700,
                    padding: 0,
                    borderRadius: 8,
                    border: "2px solid #0b0b0b",
                    boxShadow: "0 2px 2px rgba(0,0,0,0.18)",
                  },
                };
              }}
            />
          )}
        </section>

        {/* Maintenance Calendar */}
        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Maintenance Calendar</h2>
              <div style={hint}>Maintenance bookings only.</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                style={btn("ghost")}
                type="button"
                onClick={() =>
                  setMaintenanceDate((prev) => {
                    const d = new Date(prev);
                    d.setDate(d.getDate() - 7);
                    return d;
                  })
                }
              >
                ← Previous Week
              </button>

              <button
                style={btn("ghost")}
                type="button"
                onClick={() =>
                  setMaintenanceDate((prev) => {
                    const d = new Date(prev);
                    d.setDate(d.getDate() + 7);
                    return d;
                  })
                }
              >
                Next Week →
              </button>

              <button
                type="button"
                style={maintenanceView === "week" ? btn() : btn("ghost")}
                onClick={() => setMaintenanceView("week")}
              >
                Week
              </button>

              <button
                type="button"
                style={maintenanceView === "month" ? btn() : btn("ghost")}
                onClick={() => setMaintenanceView("month")}
              >
                Month
              </button>

              <div style={chip}>
                {maintenanceDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
            </div>
          </div>

          {mounted && (
            <BigCalendar
              localizer={localizer}
              events={maintenanceEvents}
              view={maintenanceView}
              views={["week", "month"]}
              onView={(v) => setMaintenanceView(v)}
              date={maintenanceDate}
              onNavigate={(d) => setMaintenanceDate(d)}
              startAccessor="start"
              endAccessor="end"
              allDayAccessor={() => true}
              allDaySlot
              selectable={false}
              popup
              toolbar={false}
              nowIndicator={false}
              getNow={() => new Date(2000, 0, 1)}
              components={{ event: CalendarEvent }}
onSelectEvent={(e) => {
  if (!e) return;
  const realId = e.__parentId || e.id; // ✅ convert abc__2025-12-18 back to abc
  setSelectedMaintenance({ id: realId, collection: "maintenanceBookings" });
}}

              eventPropGetter={() => ({
                style: {
                  backgroundColor: "#da8e58ff",
                  color: "#111",
                  fontWeight: 700,
                  padding: 0,
                  borderRadius: 8,
                  border: "2px solid #0b0b0b",
                  boxShadow: "0 2px 2px rgba(0,0,0,0.18)",
                  cursor: "pointer",
                },
              })}
              dayPropGetter={(date) => {
                const todayD = new Date();
                const isToday =
                  date.getDate() === todayD.getDate() &&
                  date.getMonth() === todayD.getMonth() &&
                  date.getFullYear() === todayD.getFullYear();

                return {
                  style: {
                    backgroundColor: isToday ? "rgba(249,115,22,0.12)" : undefined,
                    border: isToday ? "1px solid rgba(249,115,22,0.55)" : undefined,
                  },
                };
              }}
              style={{ borderRadius: UI.radius, background: "#fff" }}
            />
          )}

          {selectedMaintenance?.id && (
            <ViewMaintenanceModal
              id={selectedMaintenance.id}
              collectionName={selectedMaintenance.collection}
              onClose={() => setSelectedMaintenance(null)}
            />
          )}
        </section>

        {/* Holiday + Notes Calendar */}
        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Holiday + Notes Calendar</h2>
              <div style={hint}>Holidays and notes only.</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button style={btn()} type="button" onClick={() => setHolidayModalOpen(true)}>
                + Add Holiday
              </button>
              <button style={btn()} type="button" onClick={() => setCreateNoteOpen(true)}>
                + Add Note
              </button>
            </div>
          </div>

          {mounted && (
            <BigCalendar
              localizer={localizer}
              events={[
                ...holidays.map((h) => ({
                  ...h,
                  title: h.title,
                  start: new Date(h.start),
                  end: new Date(h.end),
                  allDay: true,
                  status: "Holiday",
                })),
                ...notes.map((n) => ({
                  ...n,
                  title: n.title || "Note",
                  start: new Date(n.start),
                  end: new Date(n.end),
                  allDay: true,
                  status: "Note",
                })),
              ]}
              view={calendarView}
              views={["week", "month"]}
              onView={(v) => setCalendarView(v)}
              date={currentDate}
              onNavigate={(d) => setCurrentDate(d)}
              selectable
              startAccessor="start"
              endAccessor="end"
              popup
              allDayAccessor={() => true}
              dayLayoutAlgorithm="overlap"
              toolbar={false}
              nowIndicator={false}
              getNow={() => new Date(2000, 0, 1)}
              onSelectEvent={(e) => {
                if (e.status === "Holiday") {
                  setEditingHolidayId(e.id);
                } else if (e.status === "Note") {
                  setEditingNoteId(e.id);
                  const d = e.start instanceof Date ? e.start : new Date(e.start);
                  setNoteDate(d.toISOString().split("T")[0]);
                  setNoteText(e.title || "");
                  setNoteModalOpen(true);
                }
              }}
              style={{ borderRadius: UI.radius, background: "#fff" }}
              components={{
                event: ({ event }) => (
                  <div
                    title={event.title}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      fontSize: "0.85rem",
                      lineHeight: 1.35,
                      color: "#0b0b0b",
                      fontWeight: 600,
                      fontFamily: "Inter, system-ui, Arial, sans-serif",
                      textAlign: "left",
                      padding: 6,
                      minHeight: 40,
                    }}
                  >
                    {event.status === "Holiday" ? (
                      <>
                        <span>{event.employee}</span>
                        <span style={{ fontStyle: "italic", opacity: 0.75 }}>On Holiday</span>
                      </>
                    ) : (
                      <>
                        <span>{event.employee}</span>
                        <span style={{ fontWeight: 800 }}>{event.title}</span>
                        <span style={{ fontStyle: "italic", opacity: 0.75 }}>Note</span>
                      </>
                    )}
                  </div>
                ),
              }}
              eventPropGetter={(event) => ({
                style: {
                  backgroundColor: event.status === "Holiday" ? "#d3d3d3" : "#9e9e9e",
                  color: "#111",
                  fontWeight: 700,
                  padding: 0,
                  borderRadius: 8,
                  border: "2px solid #999",
                  boxShadow: "0 2px 2px rgba(0,0,0,0.18)",
                },
              })}
              dayPropGetter={() => ({
                style: {
                  borderRight: "1px solid #e5e7eb",
                  borderTop: "1px solid #e5e7eb",
                },
              })}
            />
          )}
        </section>

        {/* Today’s Jobs */}
        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Today’s Jobs</h2>
              <div style={hint}>Quick view of jobs happening today.</div>
            </div>
            <div style={chip}>{todaysJobs.length}</div>
          </div>

          {todaysJobs.length === 0 ? (
            <p style={{ color: UI.muted, marginTop: 8 }}>No jobs today.</p>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Job Number</th>
                    <th style={th}>Production</th>
                    <th style={th}>Location</th>
                    <th style={th}>Crew</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {todaysJobs.map((b, i) => (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? "#fff" : "#fafafa",
                        transition: "background-color .15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f5f6f8")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#fff" : "#fafafa")
                      }
                    >
                      <td style={td}>{new Date(b.date || b.startDate).toDateString()}</td>
                      <td style={td}>{b.jobNumber}</td>
                      <td style={td}>{b.client || "—"}</td>
                      <td style={td}>{b.location || "—"}</td>
                      <td style={td}>
                        {Array.isArray(b.employees) && b.employees.length ? formatCrew(b.employees) : "—"}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button onClick={() => setSelectedBookingId(b.id)} style={btn("ghost")} type="button">
                            View
                          </button>
                          <button
                            onClick={() => goToEditBooking(b.id)}
                            style={isRestricted ? btnDisabled(btn()) : btn()}
                            aria-disabled={isRestricted}
                            title={isRestricted ? "Your account is not allowed to edit bookings" : ""}
                            type="button"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Add booking modal (unchanged logic, restyled a touch) */}
        {showModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(2,6,23,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
              padding: 18,
            }}
          >
            <div
              style={{
                ...surface,
                width: 380,
                maxWidth: "92vw",
                padding: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: UI.text }}>
                Add Booking for {selectedDate?.toDateString()}
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const client = e.target.client.value;
                  const location = e.target.location.value;
                  saveBooking({
                    date: selectedDate.toISOString(),
                    client,
                    location,
                  });
                }}
                style={{ display: "grid", gap: 10, marginTop: 12 }}
              >
                <input
                  name="client"
                  placeholder="Client"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    outline: "none",
                    fontSize: 13.5,
                    background: "#fff",
                  }}
                />
                <input
                  name="location"
                  placeholder="Location"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    outline: "none",
                    fontSize: 13.5,
                    background: "#fff",
                  }}
                />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowModal(false)} style={btn("ghost")}>
                    Cancel
                  </button>
                  <button type="submit" style={btn()}>
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ✅ HolidayForm modal overlay (unchanged logic) */}
      {holidayModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 95,
            padding: 18,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setHolidayModalOpen(false);
          }}
        >
          <div
            style={{
              maxWidth: 900,
              width: "95vw",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: 16,
            }}
          >
            <HolidayForm
              onClose={() => setHolidayModalOpen(false)}
              onSaved={() => {
                setHolidayModalOpen(false);
                fetchHolidays();
              }}
            />
          </div>
        </div>
      )}

      {/* ✅ CreateNote modal overlay */}
      {createNoteOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 96,
            padding: 18,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateNoteOpen(false);
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: "95vw",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: 16,
            }}
          >
            <CreateNote
              defaultDate={new Date().toISOString().split("T")[0]}
              onClose={() => setCreateNoteOpen(false)}
              onSaved={() => {
                setCreateNoteOpen(false);
                fetchNotes();
              }}
            />
          </div>
        </div>
      )}

      {/* Existing quick note modal (logic unchanged) */}
      {noteModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 80,
            padding: 18,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "95vw",
              backgroundColor: "#121212",
              color: "#fff",
              padding: 24,
              borderRadius: 16,
              boxShadow: UI.shadowHover,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff" }}>
                {editingNoteId ? "Edit Note" : "Add Note"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNoteModalOpen(false);
                  setEditingNoteId(null);
                  setNoteText("");
                  setNoteDate(null);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#9ca3af",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNote} style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block" }}>Date</label>
                <input
                  type="date"
                  value={noteDate || ""}
                  onChange={(e) => setNoteDate(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #444",
                    backgroundColor: "#333",
                    color: "#fff",
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, marginBottom: 4, display: "block" }}>Note text</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #444",
                    backgroundColor: "#333",
                    color: "#fff",
                    fontSize: 14,
                    resize: "vertical",
                  }}
                />
              </div>

              <button type="submit" style={{ ...btn(), justifyContent: "center" }}>
                {editingNoteId ? "Save changes" : "Save note"}
              </button>

              {editingNoteId && (
                <button
                  type="button"
                  onClick={handleDeleteNote}
                  style={{
                    ...btn("danger"),
                    justifyContent: "center",
                    marginTop: 4,
                  }}
                >
                  Delete note
                </button>
              )}
            </form>
          </div>
        </div>
      )}

   {editingHolidayId && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(2,6,23,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 90,
      padding: 18,
    }}
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) setEditingHolidayId(null);
    }}
  >
    {/* IMPORTANT:
        We DO NOT add maxHeight/overflow here (no forced scroll).
        Let the EditHolidayForm control its own layout.
    */}
    <div onMouseDown={(e) => e.stopPropagation()}>
      <EditHolidayForm
        holidayId={editingHolidayId}
        onClose={() => setEditingHolidayId(null)}
        onSaved={() => {
          setEditingHolidayId(null);
          fetchHolidays();
        }}
      />
    </div>
  </div>
)}


      {selectedBookingId && (
        <ViewBookingModal id={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
      )}
    </HeaderSidebarLayout>
  );
}
