// src/app/dashboard/page.js
"use client";

import { useEffect, useState, useCallback } from "react";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import "react-big-calendar/lib/css/react-big-calendar.css";
const BigCalendar = dynamic(
   () => import("react-big-calendar").then((m) => m.Calendar),
   { ssr: false }
);
import { localizer } from "../utils/localizer";
import { collection, onSnapshot, addDoc, getDocs } from "firebase/firestore";
import useUserRole from "../hooks/useUserRole";
import ViewBookingModal from "../components/ViewBookingModal";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Check } from "lucide-react";

/* -------------------------- tiny visual tokens only -------------------------- */
const UI = {
  text: "#111827",
  muted: "#6b7280",
  bg: "#ffffff",
  border: "1px solid #e5e7eb",
  radiusLg: 12,
  radius: 8,
  radiusSm: 6,
  shadow: "0 6px 16px rgba(0,0,0,0.06)",
};

// ---- status colour map used for per-vehicle pills ----
const STATUS_COLORS = {
  Confirmed:         { bg: "#f3f970", text: "#111", border: "#0b0b0b" },
  "First Pencil":    { bg: "#89caf5", text: "#111", border: "#0b0b0b" },
  "Second Pencil":   { bg: "#f73939", text: "#fff", border: "#0b0b0b" },
  Holiday:           { bg: "#d3d3d3", text: "#111", border: "#0b0b0b" },
  Maintenance:       { bg: "#f97316", text: "#111", border: "#0b0b0b" },
  Complete:          { bg: "#7AFF6E", text: "#111", border: "#0b0b0b" },
  "Action Required": { bg: "#FF973B", text: "#111", border: "#0b0b0b" },
  DNH:               { bg: "#c2c2c2", text: "#111", border: "#0b0b0b" },
};
const getStatusStyle = (s = "") => STATUS_COLORS[s] || { bg: "#ccc", text: "#111", border: "#0b0b0b" };
// ---- per-user action blocks ----
const RESTRICTED_EMAILS = new Set(["mel@bickers.co.uk"]); // add more if needed


const pageWrap = {
  display: "flex",
  minHeight: "100vh",
  background: "#f3f4f6",
  fontFamily: "Inter, system-ui, Arial, sans-serif",
  color: UI.text,
};

const mainWrap = {
  flex: 1,
  maxWidth: 1600,
  margin: "0 auto",
  padding: "24px 24px 40px",
};

const card = {
  background: UI.bg,
  border: UI.border,
  borderRadius: UI.radiusLg,
  boxShadow: UI.shadow,
  padding: 16,
  marginBottom: 16,
};

const title = { margin: 0, fontSize: 18, fontWeight: 700, color: UI.text };

const btnBase = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: UI.radius,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  color: UI.text,
};
const btnDark = { ...btnBase, background: "#111827", color: "#fff", border: "1px solid #111827" };

const tableWrap = { width: "100%", overflow: "auto", borderRadius: UI.radius, border: UI.border };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 };
const th = {
  textAlign: "left",
  fontWeight: 700,
  fontSize: 12,
  color: UI.text,
  background: "#f3f4f6",
  padding: "10px",
  borderBottom: UI.border,
  position: "sticky",
  top: 0,
  zIndex: 1,
};
const td = { padding: "10px", verticalAlign: "middle", borderBottom: "1px solid #f1f5f9" };

const successBanner = {
  background: "#ecfdf5",
  color: "#065f46",
  border: "1px solid #10b981",
  borderRadius: UI.radius,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 14,
};

  const btnDisabled = {
    ...btnBase,
    opacity: 0.45,
    cursor: "not-allowed",
    pointerEvents: "none",
    filter: "grayscale(0.2)",
  };
  const btnDarkDisabled = {
    ...btnDark,
    opacity: 0.45,
    cursor: "not-allowed",
    pointerEvents: "none",
    filter: "grayscale(0.2)",
  };




/* ------------------------------- your helpers ------------------------------- */
const parseLocalDate = (d) => {
  if (!d) return null;
  const s = typeof d === "string" ? d : String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]) - 1, day = Number(m[3]);
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

const labelFromMins = (mins) => {
  const n = Number(mins) || 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// job sort helpers (unchanged)
const jobKey = (val) => {
  const s = (val ?? "").toString().trim();
  const numMatch = s.match(/\d+/);
  const num = numMatch ? Number(numMatch[0]) : Number.NaN;
  return { num, raw: s };
};

const eventsByJobNumber = (bookings, maintenanceBookings) => {
  const bookingEvents = bookings.map((b) => {
    const startBase = parseLocalDate(b.startDate || b.date);
    const endRaw = b.endDate || b.date || b.startDate;
    const endBase = parseLocalDate(endRaw);
    const safeEnd = endBase && startBase && endBase < startBase ? startBase : endBase;

    return {
      ...b,
      title: b.client || "",
      start: startOfLocalDay(startBase),
      end: startOfLocalDay(addDays(safeEnd, 1)),
      allDay: true,
      status: b.status || "Confirmed",
    };
  });

  const maintenance = (maintenanceBookings || []).map((m) => ({
    jobNumber: m.jobNumber ?? "",
    ...m,
  }));

  const all = [...bookingEvents, ...maintenance];

  all.sort((a, b) => {
    const ak = jobKey(a.jobNumber);
    const bk = jobKey(b.jobNumber);
    const aNum = Number.isNaN(ak.num) ? -Infinity : ak.num;
    const bNum = Number.isNaN(bk.num) ? -Infinity : bk.num;

    if (bNum !== aNum) return bNum - aNum; // DESC
    if ((bk.raw || "") !== (ak.raw || "")) return (bk.raw || "").localeCompare(ak.raw || "");
    if (a.start.getTime() !== b.start.getTime()) return a.start - b.start;
    const spanA = a.end - a.start, spanB = b.end - b.start;
    if (spanA !== spanB) return spanB - spanA;
    return 0;
  });

  return all;
};




// Put grey stuff at the bottom; risky/night/important at the top
const eventPriority = (event) => {
  const s = String(event.status || "").toLowerCase();

  // top-most things first
  if (event.isRisky) return 0;                      // red risk box → top
  if (String(event.shootType || "").toLowerCase() === "night") return 1;
  if (s === "action required") return 2;
  if (s === "second pencil") return 3;
  if (s === "first pencil") return 4;
  if (s === "confirmed") return 5;
  if (s === "maintenance") return 6;

  // GREY / low-priority stuff last
  if (s === "holiday" || s === "dnh" || s === "note") return 99;

  return 50; // default middle
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



/* ---------------------- role gate (unchanged, minimal UI) ------------------- */
const Dashboard = () => {
  const userRole = useUserRole();
  if (!userRole) return <div>Loading...</div>;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {userRole === "admin" && <button style={btnBase}>Delete Booking</button>}
      {userRole !== "viewer" && <button style={btnDark}>Create Booking</button>}
    </div>
  );
};

/* --------------------- CalendarEvent (booking block minimal) ----------------- */
/* Structure & fields UNCHANGED. Only subtle font/padding/border tweaks */
function CalendarEvent({ event }) {
  const router = useRouter();           // ← add this line
  const [showNotes, setShowNotes] = useState(false);
  const [showRecce, setShowRecce] = useState(false);


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
        padding: 6,           // was 4
        gap: 2,               // small breathing room
        borderRadius: 6,      // soften
        whiteSpace: "normal",
        wordBreak: "break-word",
        textTransform: "uppercase",
letterSpacing: "0.02em", // optional: a touch of spacing looks cleaner in caps

      }}
    >
      {event.status === "Holiday" ? (
        <>
          <span>{event.employee}</span>
          <span style={{ fontStyle: "italic", opacity: 0.75 }}>On Holiday</span>
        </>
      ) : event.status === "Maintenance" ? (
        <>
          <span style={{ fontWeight: 800 }}>{event.vehicleName}</span>
          <span style={{ textTransform: "capitalize" }}>{event.maintenanceType}</span>
          {event.notes && (
            <span style={{ fontStyle: "italic", opacity: 0.8 }}>{event.notes}</span>
          )}
        </>
      ) : (
        <>
          {/* Top row: initials + status + job number (unchanged order) */}
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
            <span
              style={{
                backgroundColor: "white",
                padding: "2px 4px",          // slightly larger
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 600,
                border: "1px solid #0b0b0b",
              }}
            >
              {employeeInitials}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            </div>
          </div>

          {/* Details (unchanged fields/order) */}
          <span>{event.client}</span>

{Array.isArray(event.vehicles) &&
  event.vehicles.length > 0 &&
  event.vehicles.map((v, i) => {
    const vmap = event.vehicleStatus || {};

    const rawName =
      v?.name ||
      [v?.manufacturer, v?.model].filter(Boolean).join(" ") ||
      String(v || "");
    const name = String(rawName).trim();
    const plate = v?.registration ? String(v.registration).toUpperCase().trim() : "";
    const idKey = v?.id ? String(v.id).trim() : "";
    const regKey = v?.registration ? String(v.registration).trim() : "";
    const nameKey = name;

    // Try all keys: id → registration → name
    let itemStatusRaw =
      (idKey && vmap[idKey]) ||
      (regKey && vmap[regKey]) ||
      (nameKey && vmap[nameKey]) ||
      "";

    const norm = (s) => String(s || "").trim();
    const bookingStatus = norm(event.status);
    const itemStatus = norm(itemStatusRaw) || bookingStatus;

    const different = itemStatus && itemStatus !== bookingStatus;

if (different) {
  const { bg, text, border } = getStatusStyle(itemStatus);
  return (
    <span
      key={i}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "0px 0px",
        borderRadius: 2,
        backgroundColor: bg,
        color: text,
        border: `0px solid ${border}`,
        marginTop: 2,
      }}
      title={`Vehicle status: ${itemStatus}`}
    >
      {name}
      {plate ? ` – ${plate}` : ""}
    </span>
  );
}


    // Default when it matches the booking status (no highlight)
    return (
      <span key={i}>
        {name}
        {plate ? ` – ${plate}` : ""}
      </span>
    );
  })}




          <span>{event.equipment}</span>
          <span>{event.location}</span>

          {/* Notes — same behaviour, slightly tidier text */}
          {(event.notes || (event.notesByDate && Object.keys(event.notesByDate).length > 0)) && (
            <div style={{ width: "100%", marginTop: 4 }}>
              {event.notesByDate && (
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

          {/* Badge row (unchanged content) */}
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
              title={event.hasRiggingAddress ? (event.riggingAddress || "") : ""}
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

            {event.callTime && (
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 400,
                  padding: "2px 6px",
                  borderRadius: 6,
                  backgroundColor: "#111",
                  color: "#fff",
                  border: "1px solid rgba(0,0,0,0.8)",
                }}
                title={`Call Time: ${event.callTime}`}
              >
                CT {event.callTime}
              </span>
            )}
          </div>
{/* RECCE LINK ONLY */}
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




          {/* Risk box (unchanged behaviour/wording) */}
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

  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);
    // Gate Calendar rendering to client only
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

    const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email?.toLowerCase() || null);
    });
    return () => unsub();
  }, []);

  const isRestricted = userEmail ? RESTRICTED_EMAILS.has(userEmail) : false;

  const goToCreateBooking = useCallback(() => {
  if (isRestricted) return;
  router.push("/create-booking");
}, [isRestricted, router]);

const goToEditBooking = useCallback((id) => {
  if (isRestricted) return;
  router.push(`/edit-booking/${id}`);
}, [isRestricted, router]);
// NEW: hold latest recce per booking
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
        const notes =
          a.notes ||
          a.additionalNotes ||
          a.accessNotes ||
          a.risks ||
          "";

        map[k] = {
          id: r.id,                         // <-- keep doc id
          status: r.status || "submitted",
          notes: String(notes || "").trim(),
          answers: r.answers || {},         // <-- keep the full form
          createdAt: r.createdAt || null,   // optional
        };
      }
    });
    setReccesByBooking(map);
  });

  return () => unsubRecces();
}, []);



  // same normaliser/risk
  const normalizeVehicles = (list) => {
    
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
      if (tax === "sorn" || tax === "untaxed" || tax === "no tax") reasons.push(`UN-TAXED / SORN: ${name}${plate}`);
      if (ins === "not insured" || ins === "uninsured" || ins === "no insurance") reasons.push(`NO INSURANCE: ${name}${plate}`);
    });
    return { risky: reasons.length > 0, reasons };
  };

  // listeners (unchanged)
  useEffect(() => {
    const unsubBookings = onSnapshot(collection(db, "bookings"), (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setBookings(data);
    });

    const unsubHolidays = onSnapshot(collection(db, "holidays"), (snap) => {
      const holidayEvents = snap.docs.map((doc) => {
        const data = doc.data();
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        return {
          id: doc.id,
          title: `${data.employee} - Holiday`,
          start,
          end: new Date(end.setDate(end.getDate())),
          allDay: true,
          status: "Holiday",
          employee: data.employee,
        };
      });
      setHolidays(holidayEvents);
    });

    const unsubNotes = onSnapshot(collection(db, "notes"), (snap) => {
      const noteEvents = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.text || "Note",
          start: new Date(data.date),
          end: new Date(data.date),
          allDay: true,
          status: "Note",
          employee: data.employee || "",
        };
      });
      setNotes(noteEvents);
    });

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setVehiclesData(data);
    });

    return () => {
      unsubBookings();
      unsubHolidays();
      unsubNotes();
      unsubVehicles();
    };
  }, []);

  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  const fetchBookings = async () => {
    const snapshot = await getDocs(collection(db, "bookings"));
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setBookings(data);
  };

  const fetchHolidays = async () => {
    const snapshot = await getDocs(collection(db, "holidays"));
    const holidayEvents = snapshot.docs.map((doc) => {
      const data = doc.data();
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      return {
        id: doc.id,
        title: `${data.employee} - Holiday`,
        start,
        end: new Date(end.setDate(end.getDate())),
        allDay: true,
        status: "Holiday",
        employee: data.employee,
      };
    });
    setHolidays(holidayEvents);
  };

  const fetchVehicles = async () => {
    const snapshot = await getDocs(collection(db, "vehicles"));
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setVehiclesData(data);
  };

  const fetchNotes = async () => {
    const snapshot = await getDocs(collection(db, "notes"));
    const noteEvents = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.text || "Note",
        start: new Date(data.date),
        end: new Date(data.date),
        allDay: true,
        status: "Note",
        employee: data.employee || "",
      };
    });
    setNotes(noteEvents);
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

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={mainWrap}>
          {bookingSaved && <div style={successBanner}>✅ Booking saved successfully!</div>}

          {/* Work Diary */}
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h2 style={title}>Work Diary</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={btnBase}
                  onClick={() =>
                    setCurrentDate((prev) => {
                      const d = new Date(prev);
                      d.setDate(d.getDate() - 7);
                      return d;
                    })
                  }
                >
                  ← Previous Week
                </button>
                <button
                  style={btnBase}
                  onClick={() =>
                    setCurrentDate((prev) => {
                      const d = new Date(prev);
                      d.setDate(d.getDate() + 7);
                      return d;
                    })
                  }
                >
                  Next Week →
                </button>
<button
  style={isRestricted ? btnDarkDisabled : btnDark}
  onClick={goToCreateBooking}
  aria-disabled={isRestricted}
  title={isRestricted ? "Your account is not allowed to create bookings" : ""}>
  + Add Booking
</button>

              </div>
            </div>

            <div style={{ textAlign: "center", color: UI.muted, fontWeight: 600, marginBottom: 8 }}>
              {currentDate.toLocaleDateString("en-GB", { month: "long" })}
            </div>

{mounted && (
            <BigCalendar
              localizer={localizer}
              events={[
                ...bookings.map((b) => {
  const startBase = parseLocalDate(b.startDate || b.date);
  const endRaw = b.endDate || b.date || b.startDate;
  const endBase = parseLocalDate(endRaw);
  const safeEndBase = endBase && startBase && endBase < startBase ? startBase : endBase;

  const normalizedVehicles = normalizeVehicles(b.vehicles);
  const risk = getVehicleRisk(normalizedVehicles);

  // NEW: pull recce summary for this booking
  const recce = reccesByBooking[b.id] || null;

  return {
    ...b,
    vehicles: normalizedVehicles,
    isRisky: risk.risky,
    riskReasons: risk.reasons,
    title: b.client || "",
    start: startOfLocalDay(startBase),
    end: startOfLocalDay(addDays(safeEndBase, 1)),
    allDay: true,
    status: b.status || "Confirmed",
    

    // NEW: fields used by CalendarEvent
      hasRecce: !!recce,
  recceStatus: recce?.status || null,
  recceNotes: recce?.notes || "",
  recceAnswers: recce?.answers || null,  // <-- full form arrives here
  recceId: recce?.id || null,            // <-- doc id if you want to deep-link later
  recceCreatedAt: recce?.createdAt || null,
  };
}),

                ...maintenanceBookings,
              ]}
              view={calendarView}
              views={["week", "month"]}
              onView={(v) => setCalendarView(v)}
              date={currentDate}
              onNavigate={(d) => setCurrentDate(d)}
              onSelectSlot={({ start }) => {
                setNoteDate(start);
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
                dayFormat: (date, culture, localizer) =>
                  localizer.format(date, "EEEE dd", culture),
              }}
              dayPropGetter={(date) => {
                const todayD = new Date();
                const isToday =
                  date.getDate() === todayD.getDate() &&
                  date.getMonth() === todayD.getMonth() &&
                  date.getFullYear() === todayD.getFullYear();
                return {
                  style: {
                    backgroundColor: isToday ? "rgba(137,174,255,0.25)" : undefined,
                    border: isToday ? "1px solid #3f82ff" : undefined,
                  },
                };
              }}
              style={{ borderRadius: UI.radiusLg, background: "#fff" }}
              onSelectEvent={(e) => {
                if (e.status === "Holiday") {
                  router.push(`/edit-holiday/${e.id}`);
                } else if (e.status === "Note") {
                  router.push(`/note/${e.id}`);
                } else if (e.id) {
                  setSelectedBookingId(e.id);
                }
              }}
              components={{ event: CalendarEvent }}
eventPropGetter={(event) => {
  const status = event.status || "Confirmed";

  // existing status colours
  let bg =
    {
      Confirmed: "#f3f970",
      "First Pencil": "#89caf5",
      "Second Pencil": "#f73939",
      Holiday: "#d3d3d3",
      Maintenance: "#f97316",
      Complete: "#7AFF6E",
      "Action Required": "#FF973B",
      DNH: "#c2c2c2",
    }[status] || "#ccc";

  let text = bg === "#f3f970" || bg === "#d3d3d3" ? "#111" : "#fff";

  // existing risk override
  let risky = !!event.isRisky;
  if (!("isRisky" in event) && Array.isArray(event.vehicles)) {
    risky = getVehicleRisk(event.vehicles).risky;
  }
  if (risky) {
    bg = "#e53935";
    text = "#fff";
  }

  // 👉 NIGHT SHOOT OVERRIDE (light purple) — bookings only
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
    bg = "#f796dfff";        // light purple (Tailwind purple-200)
    text = "#111";         // dark text for contrast
    return {
      style: {
        backgroundColor: bg,
        color: text,
        fontWeight: 700,
        padding: 0,
        borderRadius: 8,
        border: "2px solid #de24e4ff", // slightly darker purple border
        boxShadow: "0 2px 2px rgba(0,0,0,0.18)",
      },
    };
  }

  // default return (unchanged)
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

            />)}
          </section>

          {/* Holiday + Notes Calendar */}
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h2 style={title}>Holiday + Notes Calendar</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnDark} onClick={() => router.push("/holiday-form")}>
                  + Add Holiday
                </button>
                <button style={btnDark} onClick={() => router.push("/note-form")}>
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
                  router.push(`/edit-holiday/${e.id}`);
                } else if (e.status === "Note") {
                  router.push(`/note/${e.id}`);
                }
              }}
              style={{ borderRadius: UI.radiusLg, background: "#fff" }}
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
            <h2 style={title}>Today’s Jobs</h2>
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
                          {Array.isArray(b.employees) && b.employees.length
                            ? b.employees
                                .map((emp) =>
                                  typeof emp === "string"
                                    ? emp
                                    : emp?.name ||
                                      [emp?.firstName, emp?.lastName].filter(Boolean).join(" ") ||
                                      emp?.displayName ||
                                      emp?.email ||
                                      ""
                                )
                                .filter(Boolean)
                                .join(", ")
                            : "—"}
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => setSelectedBookingId(b.id)}
                              style={btnBase}
                            >
                              View
                            </button>
                     <button
   onClick={() => goToEditBooking(b.id)}
   style={isRestricted ? btnDarkDisabled : btnDark}
  aria-disabled={isRestricted}
   title={isRestricted ? "Your account is not allowed to edit bookings" : ""}
 >
+   Edit
+ </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Upcoming Bookings */}
          <section style={card}>
            <h2 style={title}>Upcoming Bookings</h2>
            {["Confirmed", "First Pencil", "Second Pencil"].map((status) => {
              const todayDate = new Date().toISOString().split("T")[0];
              const filtered = bookings
                .filter((b) => {
                  const bookingStatus = b.status || "Confirmed";
                  if (bookingStatus !== status) return false;
                  const end = b.endDate?.split("T")[0];
                  const date = b.date?.split("T")[0];
                  const latestDate = end || date;
                  return latestDate >= todayDate;
                })
                .sort((a, b) => new Date(a.date || a.startDate) - new Date(b.date || b.startDate));

              return (
                <div key={status} style={{ marginTop: 10 }}>
                  <div style={{ color: UI.muted, fontSize: 12, marginBottom: 6 }}>
                    {status} — {filtered.length} {filtered.length === 1 ? "item" : "items"}
                  </div>

                  {filtered.length === 0 ? (
                    <p style={{ color: UI.muted, marginTop: 8 }}>
                      No {status.toLowerCase()} bookings.
                    </p>
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
                          {filtered.map((b, i) => (
                            <tr
                              key={i}
                              style={{
                                background: i % 2 === 0 ? "#fff" : "#fafafa",
                                transition: "background-color .15s ease",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor = "#f5f6f8")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  i % 2 === 0 ? "#fff" : "#fafafa")
                              }
                            >
                              <td style={td}>{new Date(b.date || b.startDate).toDateString()}</td>
                              <td style={td}>{b.jobNumber}</td>
                              <td style={td}>{b.client || "—"}</td>
                              <td style={td}>{b.location || "—"}</td>
                              <td style={td}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span>{formatCrew(b.employees)}</span>
                                  {b.isCrewed && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 800,
                                        padding: "2px 6px",
                                        borderRadius: 6,
                                        background: "#16a34a",
                                        color: "#fff",
                                        border: "1px solid rgba(0,0,0,0.15)",
                                      }}
                                    >
                                      CREWED
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={td}>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button
                                    onClick={() => setSelectedBookingId(b.id)}
                                    style={btnBase}
                                  >
                                    View
                                  </button>
                                  <button
   onClick={() => goToEditBooking(b.id)}
   style={isRestricted ? btnDarkDisabled : btnDark}
  aria-disabled={isRestricted}
   title={isRestricted ? "Your account is not allowed to edit bookings" : ""}
 >
+   Edit
+ </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* Add booking modal (unchanged logic, slight styling) */}
          {showModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  borderRadius: UI.radiusLg,
                  border: UI.border,
                  boxShadow: UI.shadow,
                  width: 380,
                  maxWidth: "92vw",
                  padding: 16,
                }}
              >
                <h3 style={{ ...title, fontSize: 16 }}>Add Booking for {selectedDate?.toDateString()}</h3>
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
                  style={{ display: "grid", gap: 10, marginTop: 10 }}
                >
                  <input
                    name="client"
                    placeholder="Client"
                    required
                    style={{
                      border: UI.border,
                      borderRadius: UI.radius,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  />
                  <input
                    name="location"
                    placeholder="Location"
                    required
                    style={{
                      border: UI.border,
                      borderRadius: UI.radius,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setShowModal(false)} style={btnBase}>
                      Cancel
                    </button>
                    <button type="submit" style={btnDark}>
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedBookingId && (
        <ViewBookingModal id={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
      )}
    </HeaderSidebarLayout>
  );
}
