// src/app/dashboard/page.js
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import "react-big-calendar/lib/css/react-big-calendar.css";

const BigCalendar = dynamic(
  () => import("react-big-calendar").then((m) => m.Calendar),
  { ssr: false }
);

import { localizer } from "../utils/localizer";
import { collection, onSnapshot } from "firebase/firestore";

import ViewUCraneBooking from "../components/ViewUCraneBooking";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Check } from "lucide-react";

/* ───────────────────────────────────────────
   Styling tokens (MATCH main diary page)
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

// ✅ bookings → events (sorted by job number like main diary)
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

// ✅ match by resolved vehicle NAME containing "u-crane"
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

  return same ? fmt(s) : `${fmt(s)} → ${fmt(inc)}`;
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
          (!hideDayNotes &&
            event.notesByDate &&
            Object.keys(event.notesByDate).length > 0)) && (
          <div style={{ width: "100%", marginTop: 4 }}>
            {!hideDayNotes &&
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

  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [allBookingsRaw, setAllBookingsRaw] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);

  const [calendarView, setCalendarView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email?.toLowerCase() || null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isRestricted = userEmail ? RESTRICTED_EMAILS.has(userEmail) : false;

  // Vehicles (needed to resolve booking vehicle IDs → names)
  useEffect(() => {
    if (!authReady) return;

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehiclesData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsubVehicles();
  }, [authReady]);

  // Raw bookings
  useEffect(() => {
    if (!authReady) return;

    const unsubBookings = onSnapshot(collection(db, "bookings"), (snap) => {
      setAllBookingsRaw(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsubBookings();
  }, [authReady]);

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

  // ✅ Filter to U-CRANE by resolved vehicle NAME
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

  // ✅ Upcoming (below calendar): Confirmed / First Pencil / Second Pencil (future only)
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
    if (isRestricted) return;
    router.push("/u-crane-booking");
  }, [isRestricted, router]);

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
                    onClick={() => e?.id && setSelectedBookingId(e.id)}
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
                        {String(e.jobNumber || "").toUpperCase()} — {String(e.client || "").toUpperCase()}
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
                            borderRadius: 999,
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
    [upcomingByStatus]
  );

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>U-Crane</h1>
            <div style={sub}>Work diary (shows any job where a vehicle name includes “U-Crane”).</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {bookingSaved && <div style={successBanner}>✅ Booking saved successfully!</div>}
          </div>
        </div>

        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>U-Crane Work Diary</h2>
              <div style={hint}>Blocks + layout match the main Work Diary page.</div>
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
                onClick={goToCreateUCraneBooking}
                aria-disabled={isRestricted}
                title={isRestricted ? "Your account is not allowed to create bookings" : ""}
                type="button"
              >
                + Add U-Crane Booking
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
              style={{ borderRadius: UI.radius, background: "#fff" }}
              onSelectEvent={(e) => {
                if (e?.id) setSelectedBookingId(e.id);
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
                      border: "2px solid #0b0b0b",
                      boxShadow: "0 2px 2px rgba(0,0,0,0.18)",
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
                    border: `2px solid ${style.border}`,
                    boxShadow: "0 2px 2px rgba(0,0,0,0.18)",
                    cursor: "pointer",
                  },
                };
              }}
            />
          )}

          {/* ✅ UPCOMING SECTION (below calendar) */}
          <div style={{ marginTop: 16 }}>
            <div style={{ ...sectionHeader, marginBottom: 12 }}>
              <div>
                <h3 style={{ ...titleMd, fontSize: 15 }}>Upcoming</h3>
                <div style={hint}>Future jobs grouped by status (Confirmed / First Pencil / Second Pencil).</div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
                        borderRadius: 999,
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
            >
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
        <ViewUCraneBooking id={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
      )}
    </HeaderSidebarLayout>
  );
}
