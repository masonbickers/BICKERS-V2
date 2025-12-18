"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import dynamic from "next/dynamic";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer";
import { collection, onSnapshot } from "firebase/firestore";
import { Check } from "lucide-react";

const BigCalendar = dynamic(
  () => import("react-big-calendar").then((m) => m.Calendar),
  { ssr: false }
);

/* ───────────────────────────────────────────
   Helpers (copied/aligned with Dashboard)
─────────────────────────────────────────── */
const parseLocalDate = (d) => {
  if (!d) return null;
  const s = typeof d === "string" ? d : String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]),
      mo = Number(m[2]) - 1,
      day = Number(m[3]);
    return new Date(y, mo, day, 12, 0, 0, 0);
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

const jobKey = (val) => {
  const s = (val ?? "").toString().trim();
  const numMatch = s.match(/\d+/);
  const num = numMatch ? Number(numMatch[0]) : Number.NaN;
  return { num, raw: s };
};

const eventsByJobNumber = (bookings, maintenanceBookings) => {
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
      end: startOfLocalDay(addDays(safeEnd, 1)), // exclusive
      allDay: true,
      status: b.status || "Confirmed",
    };
  });

  const maintenanceEvents = (maintenanceBookings || [])
    .map((m) => {
      const startBase = parseLocalDate(m.startDate || m.date || m.start || m.startDay);
      if (!startBase) return null;

      const endRaw = m.endDate || m.end || m.date || m.startDate || m.start || m.startDay;
      const endBase = parseLocalDate(endRaw);
      const safeEnd = endBase && endBase >= startBase ? endBase : startBase;

      return {
        ...m,
        __collection: "maintenanceBookings",
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
        end: startOfLocalDay(addDays(safeEnd, 1)), // exclusive
        allDay: true,
        status: "Maintenance",
      };
    })
    .filter(Boolean);

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

const NIGHT_SHOOT_STYLE = { bg: "#f796dfff", text: "#111", border: "#de24e4ff" };

const STATUS_COLORS = {
  Confirmed: { bg: "#f3f970", text: "#111", border: "#0b0b0b" },
  "First Pencil": { bg: "#89caf5", text: "#111", border: "#0b0b0b" },
  "Second Pencil": { bg: "#f73939", text: "#fff", border: "#0b0b0b" },
  Holiday: { bg: "#d3d3d3", text: "#111", border: "#0b0b0b" },
  Maintenance: { bg: "#f97316", text: "#111", border: "#0b0b0b" },
  Note: { bg: "#9e9e9e", text: "#111", border: "#0b0b0b" },
  Complete: { bg: "#719b6eff", text: "#111", border: "#0b0b0b" },
  "Action Required": { bg: "#FF973B", text: "#111", border: "#0b0b0b" },
  DNH: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  Cancelled: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  Postponed: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
  Lost: { bg: "#c2c2c2", text: "#111", border: "#c2c2c2" },
};

const getStatusStyle = (s = "") =>
  STATUS_COLORS[s] || { bg: "#ccc", text: "#111", border: "#0b0b0b" };

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

/* ───────────────────────────────────────────
   Event renderer (same structure as Dashboard)
─────────────────────────────────────────── */
function WallCalendarEvent({ event }) {
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
  const hasPerDayCallTimes = event.callTimesByDate && Object.keys(event.callTimesByDate).length > 0;

  const bookingStatusLC = String(event.status || "").toLowerCase();
  const hideDayNotes = ["cancelled", "canceled", "postponed", "dnh", "lost"].includes(bookingStatusLC);

  // NOTE EVENTS (single line)
  if (event.status === "Note") {
    return (
      <div
        title={event.title || ""}
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: "0.8rem",
          lineHeight: 1.2,
          color: "#0b0b0b",
          fontWeight: 800,
          fontFamily: "Inter, system-ui, Arial, sans-serif",
          textAlign: "left",
          padding: 6,
          gap: 2,
          borderRadius: 6,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>NOTE</span>
        <span style={{ fontWeight: 900 }}>{event.title}</span>
      </div>
    );
  }

  return (
    <div
      title={event.noteToShow || event.title || ""}
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
          {/* Top row */}
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

              {event.jobNumber && (
                <span
                  style={{
                    backgroundColor:
                      event.shootType === "Night"
                        ? "purple"
                        : event.shootType === "Day"
                        ? "white"
                        : "#4caf50",
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
              )}
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

              const bookingStatus = String(event.status || "").trim().toLowerCase();
              const isCancelled = ["cancelled", "canceled", "complete", "completed", "postponed", "dnh", "lost"].includes(
                bookingStatus
              );

              if (isCancelled) {
                return (
                  <span key={i}>
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

          {/* Notes (per-day + main notes) */}
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

          {/* Badge row */}
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

          {/* RECCE LINK */}
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

/* ───────────────────────────────────────────
   Page
─────────────────────────────────────────── */
export default function WallViewCalendarPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [notes, setNotes] = useState([]);

  const [vehiclesData, setVehiclesData] = useState([]);
  const [reccesByBooking, setReccesByBooking] = useState({});

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("week");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Live listeners (same as dashboard)
  useEffect(() => {
    if (!authReady) return;

    const unsubBookings = onSnapshot(collection(db, "bookings"), (snap) => {
      setBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubMaintenance = onSnapshot(collection(db, "maintenanceBookings"), (snap) => {
      setMaintenanceBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

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
            end: startOfLocalDay(addDays(safeEnd, 1)),
            allDay: true,
            status: "Holiday",
            employee,
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
            end: addDays(day, 1),
            allDay: true,
            status: "Note",
            employee: data.employee || "",
            ...data,
          };
        })
        .filter(Boolean);

      setNotes(noteEvents);
    });

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehiclesData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

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

    return () => {
      unsubBookings();
      unsubMaintenance();
      unsubHolidays();
      unsubNotes();
      unsubVehicles();
      unsubRecces();
    };
  }, [authReady]);

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

  // Build jobs + maintenance into consistent event objects
  const allEventsRaw = useMemo(
    () => eventsByJobNumber(bookings, maintenanceBookings),
    [bookings, maintenanceBookings]
  );

  // Enrich with vehicles + risk + recce
  const workAndMaintenance = useMemo(() => {
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

  // SINGLE SCREEN = one calendar with everything
  const wallEvents = useMemo(() => {
    return [
      ...workAndMaintenance,
      ...holidays,
      ...notes,
    ];
  }, [workAndMaintenance, holidays, notes]);

  if (!user) {
    return <p style={{ textAlign: "center", marginTop: 50 }}>Loading calendar...</p>;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: "100vw",
        zIndex: 9999,
        backgroundColor: "#f4f4f5",
        padding: "0.8rem",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.6rem",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 900, color: "#000", margin: 0 }}>
            Work Diary (Wall View)
          </h1>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
            Jobs + Maintenance + Holidays + Notes (single screen)
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={() =>
              setCurrentDate((prev) => {
                const newDate = new Date(prev);
                newDate.setDate(newDate.getDate() - (calendarView === "month" ? 30 : 7));
                return newDate;
              })
            }
            style={navBtn}
            type="button"
          >
            ← Previous
          </button>

          <button
            onClick={() =>
              setCurrentDate((prev) => {
                const newDate = new Date(prev);
                newDate.setDate(newDate.getDate() + (calendarView === "month" ? 30 : 7));
                return newDate;
              })
            }
            style={navBtn}
            type="button"
          >
            Next →
          </button>

          <button
            onClick={() => setCalendarView("week")}
            style={{ ...navBtn, backgroundColor: calendarView === "week" ? "#111827" : "#505050" }}
            type="button"
          >
            Week
          </button>

          <button
            onClick={() => setCalendarView("month")}
            style={{ ...navBtn, backgroundColor: calendarView === "month" ? "#111827" : "#505050" }}
            type="button"
          >
            Month
          </button>

          <button
            onClick={() => router.push("/dashboard")}
            style={{ ...navBtn, backgroundColor: "#ef4444", color: "#fff" }}
            type="button"
          >
            ✖ Close
          </button>
        </div>
      </div>

      {/* Month label */}
      <h1
        style={{
          textAlign: "center",
          fontSize: "1.6rem",
          fontWeight: 900,
          marginBottom: "0.6rem",
        }}
      >
        {currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
      </h1>

      {/* Calendar */}
      {mounted && (
        <BigCalendar
          localizer={localizer}
          events={wallEvents}
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
            dayFormat: (date, culture, loc) => loc.format(date, "EEE dd", culture),
          }}
          dayPropGetter={(date) => {
            const today = new Date();
            const isToday =
              date.getDate() === today.getDate() &&
              date.getMonth() === today.getMonth() &&
              date.getFullYear() === today.getFullYear();
            return {
              style: {
                backgroundColor: isToday ? "rgba(137, 174, 255, 0.22)" : undefined,
                border: isToday ? "1px solid rgba(63, 130, 255, 0.7)" : undefined,
              },
            };
          }}
          style={{
            borderRadius: "12px",
            background: "#fff",
            height: "85vh",
          }}
          onSelectEvent={(e) => {
            if (!e) return;

            if (e.status === "Holiday") {
              router.push(`/edit-holiday/${e.id}`);
              return;
            }

            if (e.status === "Maintenance") {
              router.push(`/edit-maintenance/${e.id}`);
              return;
            }

            if (e.status === "Note") {
              // If you have a dedicated page later you can route it here.
              return;
            }

            if (e.id) router.push(`/view-booking/${e.id}`);
          }}
          components={{ event: WallCalendarEvent }}
          eventPropGetter={(event) => {
            const status = event.status || "Confirmed";
            let style = getStatusStyle(status);

            // risk override (same behaviour as dashboard)
            let risky = !!event.isRisky;
            if (!("isRisky" in event) && Array.isArray(event.vehicles)) {
              risky = getVehicleRisk(event.vehicles).risky;
            }
            if (risky) {
              const isFuture = isFutureJobEvent(event);
              if (isFuture) style = { bg: "#e53935", text: "#fff", border: "#000" };
            }

            // night shoot override (only when not risky)
            const shoot = String(event.shootType || "").toLowerCase();
            const bookingStatuses = new Set([
              "confirmed",
              "first pencil",
              "second pencil",
              "complete",
              "action required",
              "dnh",
            ]);
            if (!risky && bookingStatuses.has(String(status || "").toLowerCase()) && shoot === "night") {
              return {
                style: {
                  backgroundColor: NIGHT_SHOOT_STYLE.bg,
                  color: NIGHT_SHOOT_STYLE.text,
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
                backgroundColor: style.bg,
                color: style.text,
                fontWeight: 700,
                padding: 0,
                borderRadius: 8,
                border: `2px solid ${style.border}`,
                boxShadow: "0 2px 2px rgba(0,0,0,0.18)",
              },
            };
          }}
        />
      )}
    </div>
  );
}

const navBtn = {
  backgroundColor: "#505050",
  color: "#fff",
  padding: "6px 10px",
  borderRadius: "8px",
  fontWeight: 900,
  fontSize: "0.75rem",
  cursor: "pointer",
  border: "none",
  whiteSpace: "nowrap",
};
