// src/app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import ProtectedRoute from "../components/ProtectedRoute";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import ViewBookingModal from "../components/ViewBookingModal";
import DashboardMaintenanceModal from "../components/DashboardMaintenanceModal";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

import moment from "moment";
import { auth, db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { buildAssetLabel, getCanonicalDueDate } from "../utils/maintenanceSchema";
import { syncEightWeekInspectionRollovers } from "../utils/inspectionRollover";

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
─────────────────────────────────────────── */
const UI = {
  radius: 16,
  radiusSm: 10,
  gap: 12,
  shadowSm: "0 10px 26px rgba(15,23,42,0.06)",
  shadowHover: "0 16px 34px rgba(15,23,42,0.1)",
  border: "1px solid #dbe2ea",
  bg: "#eef3f7",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#183f67",
  brandSoft: "#edf2f7",
  brandBorder: "#cad6e2",
  accent: "#8b5e3c",
  accentSoft: "#f5ede6",
};

const pageWrap = { padding: "18px 16px 26px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
  flexWrap: "wrap",
};
const h1 = {
  color: UI.text,
  fontSize: 28,
  lineHeight: 1.04,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: 0,
};
const sub = { color: UI.muted, fontSize: 13, lineHeight: 1.4, marginTop: 4 };
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
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
};

const cardTitle = { fontWeight: 800, fontSize: 16, margin: 0, color: UI.text, letterSpacing: "-0.01em" };
const cardHint = { color: UI.muted, fontSize: 12, marginTop: 4, lineHeight: 1.4 };

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
  background: "radial-gradient(circle at top right, rgba(107,179,127,0.18), transparent 28%), linear-gradient(135deg, #162434 0%, #22364c 100%)",
  color: "#edf3fa",
  padding: 14,
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
  border: "1px solid #dde5ee",
  borderRadius: 14,
  background: "#fff",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
};
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #dde5ee",
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
const td = { padding: "10px 12px", borderBottom: "1px solid #edf2f7", verticalAlign: "top" };

const listReset = { listStyle: "none", padding: 0, margin: 0 };
const liItem = {
  border: "1px solid #dde5ee",
  borderRadius: 14,
  padding: "9px 11px",
  marginBottom: 7,
  background: "#fff",
  display: "grid",
  gap: 3,
  boxShadow: "0 6px 14px rgba(15,23,42,0.04)",
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
  padding: "8px 11px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brandBorder}`,
  background: "#fff",
  color: UI.text,
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
    jobNumber: b.jobNumber || "—",
    client: b.client || "—",
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
    case "workshop":
      return "#da8e58ff";
          case "complete":
      return "#92d18cff";
    default:
      return "#c2c2c2";
  }
};

const INACTIVE_MAINTENANCE_STATUSES = ["cancelled", "canceled", "declined"];

const parseLocalDate = (d) => {
  if (!d) return null;
  if (typeof d?.toDate === "function") {
    const ts = d.toDate();
    if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
      ts.setHours(12, 0, 0, 0);
      return ts;
    }
  }
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const dt = new Date(d);
    dt.setHours(12, 0, 0, 0);
    return dt;
  }
  const s = typeof d === "string" ? d : String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
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

const isInactiveMaintenanceBooking = (status = "") =>
  INACTIVE_MAINTENANCE_STATUSES.some((x) => String(status || "").trim().toLowerCase().includes(x));

const isApptAfterExpiry = (appt, expiry) => {
  if (!appt || !expiry) return false;
  const a = new Date(appt.getFullYear(), appt.getMonth(), appt.getDate()).getTime();
  const e = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
  return a > e;
};

const getMaintenanceDisplayType = (booking = {}) => {
  const explicit = String(booking.maintenanceTypeLabel || "").trim();
  if (explicit) return explicit.toUpperCase();
  const other = String(booking.maintenanceTypeOther || "").trim();
  if (other) return other.toUpperCase();
  const rawType = String(booking.type || booking.maintenanceType || "").trim().toUpperCase();
  if (rawType === "MOT") return "MOT";
  if (rawType === "SERVICE") return "SERVICE";
  if (rawType === "WORK") return "WORK";
  return rawType || "MAINTENANCE";
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
        gap: 8,
        minWidth: 0,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 800, color: UI.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
    </div>
  );
}

function Bucket({ title, items }) {
  return (
    <div style={{ ...surface, padding: 14 }}>
      <div style={sectionHeader}>
        <div style={{ fontWeight: 800, fontSize: 16, color: UI.text }}>{title}</div>
        <span style={chip}>Top 8</span>
      </div>
      {items && items.length ? (
        <ul style={listReset}>
          {items.slice(0, 8).map((v) => (
            <li key={v.id} style={liItem}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ color: UI.text }}>
                  {v.name || v.registration || "—"}
                </strong>
                <span style={{ color: UI.muted, fontSize: 12 }}>{v.category || "—"}</span>
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>
                MOT: {v.nextMOT ? moment(v.nextMOT).format("MMM D, YYYY") : "—"} • Service:{" "}
                {v.nextService ? moment(v.nextService).format("MMM D, YYYY") : "—"}
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
  const pathname = usePathname();

  const [bookings, setBookings] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [selectedMaintenanceEvent, setSelectedMaintenanceEvent] = useState(null);

  // Assistant UI
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

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

  const vehicleLabel = (v) => {
    if (v && typeof v === "object") return v.name || v.registration || v.reg || "Vehicle";
    const key = String(v || "").trim();
    return vehicleNameById.get(key) || key || "Vehicle";
  };

  // Fetch data
  useEffect(() => {
    const run = async () => {
      const snap = await getDocs(collection(db, "bookings"));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(rows);

      const vSnap = await getDocs(collection(db, "vehicles"));
      setVehicles(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const mSnap = await getDocs(collection(db, "maintenanceBookings"));
      setMaintenanceBookings(mSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));

      const mjSnap = await getDocs(collection(db, "maintenanceJobs"));
      setMaintenanceJobs(mjSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };
    run();
  }, []);

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
      (maintenanceJobs || [])
        .filter((j) => ["planned", "awaiting_parts", "in_progress", "qa"].includes(String(j.status || "").trim().toLowerCase()))
        .map((j) => {
          const when = parseLocalDate(j.plannedDate || j.dueDate);
          if (!when) return null;
          const statusLabel = String(j.status || "planned")
            .replaceAll("_", " ")
            .replace(/\b\w/g, (m) => m.toUpperCase());
          return {
            id: `maintenanceJob__${j.id}`,
            __parentId: j.id,
            __collection: "maintenanceJobs",
            title: j.assetLabel || j.title || "Maintenance Job",
            start: startOfLocalDay(when),
            end: startOfLocalDay(addDays(when, 1)),
            allDay: true,
            status: "maintenance",
            kind: "MAINTENANCE",
            maintenanceTypeLabel: `Job Card (${statusLabel})`,
          };
        })
        .filter(Boolean),
    [maintenanceJobs]
  );

  const maintenanceBookedMetaByVehicle = useMemo(() => {
    const map = {};
    (maintenanceBookings || []).forEach((b) => {
      if (isInactiveMaintenanceBooking(b.status)) return;
      const vehicleId = String(b.vehicleId || "").trim();
      if (!vehicleId) return;
      const type = String(b.type || "").trim().toUpperCase() === "SERVICE" ? "service" : "mot";
      const appt = parseLocalDate(b.appointmentDate || b.startDate || b.date);
      if (!appt) return;
      if (!map[vehicleId]) {
        map[vehicleId] = {
          mot: { has: false, earliestAppt: null },
          service: { has: false, earliestAppt: null },
        };
      }
      map[vehicleId][type].has = true;
      const cur = map[vehicleId][type].earliestAppt;
      if (!cur || appt.getTime() < cur.getTime()) map[vehicleId][type].earliestAppt = appt;
    });
    return map;
  }, [maintenanceBookings]);

  const maintenanceBookingEvents = useMemo(
    () =>
      (maintenanceBookings || [])
        .filter((m) => !isInactiveMaintenanceBooking(m.status))
        .map((m) => {
          const startBase = parseLocalDate(m.startDate || m.date || m.start || m.startDay || m.appointmentDate);
          if (!startBase) return null;
          const endRaw = m.endDate || m.end || m.finishDate || m.startDate || m.date || m.appointmentDate;
          const endBase = parseLocalDate(endRaw) || startBase;
          const safeEnd = endBase >= startBase ? endBase : startBase;
          const typeLabel = getMaintenanceDisplayType(m);
          const rawType = String(m.type || m.maintenanceType || "").trim().toUpperCase();
          const kind =
            rawType === "MOT"
              ? "MOT_BOOKING"
              : rawType === "SERVICE"
              ? "SERVICE_BOOKING"
              : "MAINTENANCE_BOOKING";

          return {
            ...m,
            __collection: "maintenanceBookings",
            title: m.vehicleName || m.title || "Maintenance",
            start: startOfLocalDay(startBase),
            end: startOfLocalDay(addDays(safeEnd, 1)),
            allDay: true,
            status: "maintenance",
            kind,
            maintenanceTypeLabel: typeLabel,
            bookingStatus: String(m.status || "").trim(),
          };
        })
        .filter(Boolean),
    [maintenanceBookings]
  );

  const motServiceDueEvents = useMemo(() => {
    const out = [];
    (vehicles || []).forEach((v) => {
      const vehicleId = String(v.id || "").trim();
      if (!vehicleId) return;
      const label = buildAssetLabel(v) || vehicleLabel(v);
      const motDue = getCanonicalDueDate(v, "mot");
      const serviceDue = getCanonicalDueDate(v, "service");
      const bookedMeta = maintenanceBookedMetaByVehicle[vehicleId] || null;

      if (motDue) {
        const motBooked = !!bookedMeta?.mot?.has;
        const motAppt = bookedMeta?.mot?.earliestAppt || null;
        const motAfterExpiry = motBooked && motAppt ? isApptAfterExpiry(motAppt, motDue) : false;
        out.push({
          id: `mot_due__${vehicleId}`,
          __collection: "vehicleDueDates",
          title: `${label} • MOT due${motBooked ? " (Booked)" : ""}`,
          start: startOfLocalDay(motDue),
          end: startOfLocalDay(addDays(motDue, 1)),
          allDay: true,
          status: "maintenance",
          kind: "MOT",
          vehicleId,
          dueDate: motDue,
          booked: motBooked,
          bookingStatus: motAfterExpiry ? "Booked (After Expiry)" : motBooked ? "Booked" : "",
          maintenanceTypeLabel: "MOT",
        });
      }

      if (serviceDue) {
        const serviceBooked = !!bookedMeta?.service?.has;
        out.push({
          id: `service_due__${vehicleId}`,
          __collection: "vehicleDueDates",
          title: `${label} • Service due${serviceBooked ? " (Booked)" : ""}`,
          start: startOfLocalDay(serviceDue),
          end: startOfLocalDay(addDays(serviceDue, 1)),
          allDay: true,
          status: "maintenance",
          kind: "SERVICE",
          vehicleId,
          dueDate: serviceDue,
          booked: serviceBooked,
          bookingStatus: serviceBooked ? "Booked" : "",
          maintenanceTypeLabel: "SERVICE",
        });
      }
    });
    return out;
  }, [vehicles, maintenanceBookedMetaByVehicle, vehicleNameById]);

  const maintenanceCalendarEvents = useMemo(
    () => [...maintenanceBookingEvents, ...maintenanceJobEvents, ...motServiceDueEvents],
    [maintenanceBookingEvents, maintenanceJobEvents, motServiceDueEvents]
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
          notes: bookings.find((b) => b.id === e.id)?.notes || "—",
          start: e.start,
        })),
    [events, bookings, now, in2Days, vehicleNameById]
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

  // Assistant call
  const askAssistant = async () => {
    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken?.();
      if (!idToken) {
        throw new Error("Please sign in again.");
      }

      const res = await fetch("/api/chatgpt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ prompt: input }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Something went wrong.");
      }
      const data = await res.json();
      setResponse(data.reply || "No response.");
    } catch (err) {
      console.error(err);
      setResponse(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          {/* Header */}
          <div style={headerBar}>
            <div>
              <h1 style={h1}>Home</h1>
              <div style={sub}>Executive operations overview for booking activity, preparation, scheduling conflicts and fleet readiness.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chip}>Operations overview</span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
                Window: <b style={{ marginLeft: 6 }}>{windowDays}d</b>
              </span>
            </div>
          </div>

          {/* Window filter */}
          <div style={{ ...executivePanel, marginBottom: UI.gap }}>
            <div style={{ ...sectionHeader, marginBottom: 0 }}>
              <span style={{ color: "#f8fbff", fontSize: 13, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>Reporting window</span>
              {[7, 14, 30, 90].map((d) => (
                <button key={d} onClick={() => setWindowDays(d)} style={btnChip(windowDays === d)} type="button">
                  {d} days
                </button>
              ))}
              <span style={{ marginLeft: 8, fontSize: 12, color: "rgba(232,239,247,0.78)", fontWeight: 800 }}>
                {moment(now).format("D MMM")} → {moment(windowEnd).format("D MMM YYYY")}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ ...grid(12), marginBottom: UI.gap }}>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="Total Jobs" value={jobCounts.total} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="Enquiry" value={jobCounts.enquiry} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="First Pencil" value={jobCounts["first pencil"]} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="Second Pencil" value={jobCounts["second pencil"]} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <StatBlock label="Confirmed" value={jobCounts.confirmed} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ ...surface, padding: 14, display: "grid", gap: 8, minWidth: 160, background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: UI.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Primary action
                </div>
                <div style={{ color: UI.text, fontSize: 13, lineHeight: 1.45 }}>
                  Create a booking directly from the operations overview.
                </div>
                <button type="button" style={btnPrimary} onClick={() => router.push("/create-booking")}>
                  Create booking
                </button>
              </div>
            </div>
          </div>

          {/* Main grid */}
          <div style={grid(12)}>
            {/* Calendar */}
            <section style={{ gridColumn: "span 8", ...card }}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={cardTitle}>Operations Calendar</h2>
                  <div style={cardHint}>Review the current booking programme and open any entry for full detail.</div>
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
                  contentHeight="auto"
                  events={[
                    ...events.map((e) => ({
                      id: e.id,
                      title: `${e.jobNumber} - ${e.client}`,
                      start: e.start,
                      end: e.end,
                      allDay: true,
                      backgroundColor: getColorByStatus(e.status),
                    })),
                    ...maintenanceCalendarEvents.map((m) => ({
                      ...m,
                      backgroundColor: getColorByStatus("maintenance"),
                    })),
                  ]}
                  eventClick={(info) => {
                    const id = info.event.id;
                    if (!id) return;
                    const maintenanceEvent = maintenanceCalendarEvents.find((event) => event.id === id);
                    if (maintenanceEvent) {
                      if (maintenanceEvent.__collection === "maintenanceJobs") {
                        router.push("/maintenance-jobs");
                        return;
                      }
                      setSelectedMaintenanceEvent(maintenanceEvent);
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
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 14, height: 14, backgroundColor: item.color, border: "1px solid #d1d5db", borderRadius: 3 }} />
                    <span style={{ fontSize: 13, color: UI.text, fontWeight: 800 }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Right column */}
            <section style={{ gridColumn: "span 4", display: "grid", gap: UI.gap }}>
              <div style={card}>
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

              <div style={card}>
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
                          2nd: {c.second.jobNumber} ({moment(c.second.start).format("MMM D")}–{moment(c.second.end).format("MMM D")})
                          <span style={tag("second pencil")}>Second</span>
                        </div>

                        <div style={{ fontSize: 13, color: "#374151" }}>
                          Firm: {c.firm.jobNumber} ({moment(c.firm.start).format("MMM D")}–{moment(c.firm.end).format("MMM D")})
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

            {/* Prep list */}
            <section style={{ gridColumn: "span 12", ...card }}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={cardTitle}>Preparation Queue</h2>
                  <div style={cardHint}>Upcoming work starting in the next 2 days that may require operational preparation.</div>
                </div>
                <span style={sectionTag}>{prepList.length} upcoming</span>
              </div>

              {prepList.length ? (
                <div style={tableWrap}>
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
                          <td style={td}>{it.vehicles?.join(", ") || "—"}</td>
                          <td style={td}>{it.equipment || "—"}</td>
                          <td style={td}>{it.notes || "—"}</td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>{it.start ? moment(it.start).format("MMM D, YYYY") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: UI.muted, fontSize: 13 }}>No jobs starting in the next 2 days.</div>
              )}
            </section>

            {/* Maintenance buckets */}
            <section style={{ gridColumn: "span 12", ...card }}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={cardTitle}>Fleet Compliance</h2>
                  <div style={cardHint}>Overdue items and due dates within the next 3 weeks.</div>
                </div>
                <span style={sectionTag}>Vehicle review</span>
              </div>

              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                <Bucket title={`MOT Overdue (${overdueMOT.length})`} items={overdueMOT} />
                <Bucket title={`Service Overdue (${overdueService.length})`} items={overdueService} />
                <Bucket title={`MOT ≤ 3 Weeks (${motDueSoon.length})`} items={motDueSoon} />
                <Bucket title={`Service ≤ 3 Weeks (${serviceDueSoon.length})`} items={serviceDueSoon} />
              </div>
            </section>

            {/* Assistant */}
            <section style={{ gridColumn: "span 12", ...card }}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={cardTitle}>Operations Assistant</h2>
                  <div style={cardHint}>Ask about bookings, holidays and fleet maintenance without leaving the page.</div>
                </div>
                <span style={sectionTag}>AI support</span>
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about bookings, holidays, scheduling or fleet maintenance."
                rows={3}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: 14,
                  borderRadius: UI.radiusSm,
                  border: "1px solid #d7e0e9",
                  background: "#fbfdff",
                  color: UI.text,
                  outline: "none",
                }}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={askAssistant} disabled={loading} style={btnPrimary} type="button">
                  {loading ? "Generating response..." : "Ask assistant"}
                </button>
                <button onClick={() => setInput("")} style={btnGhost} type="button">
                  Clear
                </button>
              </div>

              {response ? (
                <div
                  style={{
                    marginTop: 12,
                    whiteSpace: "pre-wrap",
                    background: "#f7fafc",
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid #dbe4ec",
                    color: UI.text,
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Operations Assistant</div>
                  <div style={{ color: UI.text, fontSize: 14 }}>{response}</div>
                </div>
              ) : null}
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
      </HeaderSidebarLayout>
    </ProtectedRoute>
  );
}
