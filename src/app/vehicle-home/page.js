"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";
import { Calendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";

const VEHICLE_CHECK_PATH = "/vehicle-checks";
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;

// Routes for new tiles
const GENERAL_DEFECTS_PATH = "/defects/general";
const IMMEDIATE_DEFECTS_PATH = "/defects/immediate";
const DECLINED_DEFECTS_PATH = "/defects/declined";

/* ───────────────────────────────────────────
   Mini design system (MATCHES YOUR EMPLOYEES PAGE)
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
  danger: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
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
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};
const cardBase = {
  ...surface,
  padding: 16,
  transition:
    "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};
const cardHover = {
  transform: "translateY(-2px)",
  boxShadow: UI.shadowHover,
  borderColor: "#dbeafe",
};

const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

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
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const chipSoft = {
  ...chip,
  background: UI.brandSoft,
  borderColor: "#dbeafe",
  color: UI.brand,
};

const badge = (bg, fg) => ({
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: bg,
  color: fg,
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
  lineHeight: "18px",
});

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
  if (kind === "pill") {
    return {
      padding: "8px 10px",
      borderRadius: 999,
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

const inputBase = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 13.5,
  background: "#fff",
};

const divider = { height: 1, background: "#e5e7eb", margin: "14px 0" };

const modal = {
  position: "fixed",
  top: 110,
  left: "50%",
  transform: "translateX(-50%)",
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  padding: 18,
  boxShadow: UI.shadowHover,
  zIndex: 1000,
  width: "min(92vw, 560px)",
};

const table = { width: "100%", borderCollapse: "collapse" };
const thtd = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
};

const actionBtn = (kind = "ghost") => {
  if (kind === "approve") {
    return {
      ...btn("pill"),
      borderColor: "#bbf7d0",
      background: "#ecfdf5",
      color: "#065f46",
    };
  }
  if (kind === "decline") {
    return {
      ...btn("pill"),
      borderColor: "#fecaca",
      background: "#fef2f2",
      color: "#991b1b",
    };
  }
  return { ...btn("pill") };
};

/* ───────────────── Date helpers ───────────────── */
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

// ✅ Parse YYYY-MM-DD as LOCAL (avoids UTC date shift)
const parseLocalDateOnly = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const monthRange = (d) => {
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { monthStart, monthEnd };
};

const daysInRange = (from, to) => {
  if (!from || !to) return [];
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const out = [];
  for (let d = a; d <= b; d.setDate(d.getDate() + 1)) out.push(dateKey(d));
  return out;
};

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysUntil = (d) => {
  if (!d) return null;
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((t1 - t0) / (1000 * 60 * 60 * 24));
};

/* Notes helpers for Usage chart */
const COUNTABLE_NOTES = ["on set", "on-set", "onset", "shoot day", "shoot"];
const isCountableNote = (note) => {
  if (!note) return false;
  const n = String(note).toLowerCase();
  return COUNTABLE_NOTES.some((k) => n.includes(k));
};

const getDayNote = (booking, dayKey) => {
  let v =
    booking?.notesByDate?.[dayKey] ??
    booking?.dayNotes?.[dayKey] ??
    booking?.dailyNotes?.[dayKey] ??
    booking?.notesForEachDay?.[dayKey];
  if (v && typeof v === "object") v = v.note ?? v.text ?? v.value ?? v.label ?? v.name;
  if (v) return v;

  if (
    Array.isArray(booking?.bookingDates) &&
    Array.isArray(booking?.bookingNotes) &&
    booking.bookingNotes.length === booking.bookingDates.length
  ) {
    const idx = booking.bookingDates.findIndex((d) => d === dayKey);
    if (idx >= 0) return booking.bookingNotes[idx];
  }

  const single =
    booking?.noteForTheDay ?? booking?.note ?? booking?.dayNote ?? booking?.dailyNote;
  if (single && (Array.isArray(booking.bookingDates) ? booking.bookingDates.length === 1 : true))
    return single;

  return null;
};

/* Vehicle label helper */
const buildVehicleLabelFromObject = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();

  const base =
    v.name ??
    v.vehicleName ??
    v.label ??
    v.title ??
    v.displayName ??
    v.vehicle ??
    v.model ??
    v.type ??
    "";

  const reg =
    v.registration ??
    v.reg ??
    v.regNumber ??
    v.regNo ??
    v.plate ??
    v.numberPlate ??
    "";

  const baseClean = String(base || "").trim();
  const regClean = String(reg || "").trim().toUpperCase();

  if (baseClean && regClean) return `${baseClean} (${regClean})`;
  if (baseClean) return baseClean;
  if (regClean) return regClean;
  return "";
};

/* ───────────────── Defect utilities ───────────────── */
const isDefectItem = (it) => it?.status === "defect";
const isPendingDefect = (it) => !it?.review?.status;

function extractPendingDefects(checkDocs) {
  const out = [];
  for (const c of checkDocs) {
    if (!Array.isArray(c.items)) continue;
    c.items.forEach((it, idx) => {
      if (isDefectItem(it) && isPendingDefect(it)) {
        out.push({
          checkId: c.id,
          jobId: c.jobId || "",
          jobLabel: c.jobNumber ? `#${c.jobNumber}` : c.jobId || "",
          vehicle: c.vehicle || "",
          dateISO: c.dateISO || c.date || c.createdAt || "",
          driverName: c.driverName || "",
          odometer: c.odometer || "",
          photos: Array.isArray(c.photos) ? c.photos : [],
          defectIndex: idx,
          itemLabel: it.label || `Item ${idx + 1}`,
          defectNote: it.note || "",
          submittedAt: c.createdAt || c.updatedAt || null,
        });
      }
    });
  }
  out.sort((a, b) => (a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : 0));
  return out;
}

/* ───────────────── Calendar event helpers ───────────────── */
const dueDateFromVehicleField = (raw) => {
  // vehicle dates can be Firestore Timestamp OR "YYYY-MM-DD" string OR full ISO
  return parseLocalDateOnly(raw) || toDate(raw);
};

const dueTone = (dueDate) => {
  const diff = daysUntil(dueDate);
  if (diff == null) return "soft";
  if (diff < 0) return "overdue";
  if (diff <= 21) return "soon";
  return "ok";
};

const isApptAfterExpiry = (appt, expiry) => {
  if (!appt || !expiry) return false;
  const a = new Date(appt.getFullYear(), appt.getMonth(), appt.getDate()).getTime();
  const e = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
  return a > e;
};

const buildDueEvent = ({ vehicleId, label, kind, due, booked, bookingStatus }) => {
  if (!due) return null;
  const start = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const bookedTag =
    kind === "MOT" && booked
      ? bookingStatus && String(bookingStatus).includes("After Expiry")
        ? " (Booked — After Expiry)"
        : " (Booked)"
      : kind === "SERVICE" && booked
      ? " (Booked)"
      : "";

  return {
    title: `${label} • ${kind} due${bookedTag}`,
    start,
    end: addDays(start, 1), // RBC exclusive end for all-day
    allDay: true,
    kind, // "MOT" | "SERVICE"
    vehicleId,
    dueDate: start,
    booked: !!booked,
    bookingStatus: bookingStatus || "",
  };
};

const normStatus = (s) => String(s || "").trim().toLowerCase();
const isInactiveBooking = (s) => {
  const x = normStatus(s);
  return x.includes("cancel") || x.includes("declin") || x.includes("deleted");
};

/* ───────────────── Component ───────────────── */
export default function VehiclesHomePage() {
  const router = useRouter();

  // Calendar state
  const [calView, setCalView] = useState("month");
  const [calDate, setCalDate] = useState(new Date());

  const [mounted, setMounted] = useState(false);

  // ✅ Booked MOT/SERVICE from maintenanceBookings (source of truth)
  const [maintenanceBookingsRaw, setMaintenanceBookingsRaw] = useState([]);
  const [maintenanceBookingEvents, setMaintenanceBookingEvents] = useState([]);

  // Legacy: workBookings (if you still use it)
  const [workBookings, setWorkBookings] = useState([]);

  const [usageData, setUsageData] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Vehicles (for due-date events + labels + counts)
  const [vehiclesRaw, setVehiclesRaw] = useState([]);
  const [vehicleNameMap, setVehicleNameMap] = useState({});

  // Counters
  const [motCounts, setMotCounts] = useState({ overdue: 0, soon: 0, ok: 0, total: 0 });
  const [serviceCounts, setServiceCounts] = useState({ overdue: 0, soon: 0, ok: 0, total: 0 });

  // Usage month
  const [usageMonth, setUsageMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Defect queue state
  const [checkDocs, setCheckDocs] = useState([]);
  const [pendingDefects, setPendingDefects] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModal, setActionModal] = useState(null); // {defect, decision, comment, category?}

  useEffect(() => setMounted(true), []);

  /* ───────── Load all vehicles ONCE for name + due date lookups ───────── */
  useEffect(() => {
    const fetchVehicles = async () => {
      const snap = await getDocs(collection(db, "vehicles"));
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

      const map = {};
      for (const v of list) {
        const label = buildVehicleLabelFromObject({
          name: v.name || v.vehicleName || v.displayName || v.model || "",
          registration: v.registration || v.reg || v.regNumber || v.regNo || "",
        });
        map[v.id] = label || v.id;
      }

      setVehiclesRaw(list);
      setVehicleNameMap(map);
    };
    fetchVehicles();
  }, []);

  /* ───────── MOT + Service counters (uses vehiclesRaw) ───────── */
  useEffect(() => {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const calcCounts = (dateValueList) => {
      let overdue = 0;
      let soon = 0;
      let ok = 0;
      let total = 0;

      dateValueList.forEach((raw) => {
        const dt = dueDateFromVehicleField(raw);
        if (!dt || isNaN(dt.getTime())) return;

        const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        const diffDays = Math.floor((d - todayMidnight) / (1000 * 60 * 60 * 24));

        total += 1;
        if (diffDays < 0) overdue += 1;
        else if (diffDays <= 21) soon += 1;
        else ok += 1;
      });

      return { overdue, soon, ok, total };
    };

    setMotCounts(calcCounts(vehiclesRaw.map((v) => v.nextMOT ?? v.motDate ?? v.motDue)));
    setServiceCounts(calcCounts(vehiclesRaw.map((v) => v.nextService ?? v.serviceDate ?? v.serviceDue)));
  }, [vehiclesRaw]);

  /* ───────── Usage histogram (vehicle usage from bookings) ───────── */
  useEffect(() => {
    const fetchUsage = async () => {
      const { monthStart, monthEnd } = monthRange(usageMonth);
      const usedByDay = new Map();

      const snapshot = await getDocs(collection(db, "bookings"));
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        const mapVehicleFromBooking = (entry) => {
          if (!entry) return "";
          if (typeof entry === "string") {
            if (vehicleNameMap[entry]) return vehicleNameMap[entry];
            return entry;
          }
          if (entry.id && vehicleNameMap[entry.id]) return vehicleNameMap[entry.id];
          return buildVehicleLabelFromObject(entry) || "";
        };

        const vehicles = Array.isArray(data.vehicles)
          ? data.vehicles.map(mapVehicleFromBooking).filter(Boolean)
          : [];
        if (vehicles.length === 0) return;

        let dayKeys = [];
        if (Array.isArray(data.bookingDates) && data.bookingDates.length > 0) {
          dayKeys = data.bookingDates
            .map((s) => parseLocalDateOnly(s))
            .filter(Boolean)
            .filter((d) => d >= monthStart && d <= monthEnd)
            .map(dateKey);
        } else {
          const start =
            parseLocalDateOnly(data.date) ||
            parseLocalDateOnly(data.startDate) ||
            toDate(data.date) ||
            toDate(data.startDate);

          const end =
            parseLocalDateOnly(data.endDate) ||
            parseLocalDateOnly(data.date) ||
            toDate(data.endDate) ||
            toDate(data.date) ||
            start;

          if (!start) return;

          const clampedStart = start < monthStart ? monthStart : start;
          const clampedEnd = (end || start) > monthEnd ? monthEnd : end || start;

          dayKeys = daysInRange(clampedStart, clampedEnd);
        }

        if (dayKeys.length === 0) return;

        const filteredByNote = dayKeys.filter((k) => isCountableNote(getDayNote(data, k)));
        if (filteredByNote.length === 0) return;

        vehicles.forEach((name) => {
          if (!usedByDay.has(name)) usedByDay.set(name, new Set());
          const s = usedByDay.get(name);
          filteredByNote.forEach((k) => s.add(k));
        });
      });

      const usageArray = Array.from(usedByDay.entries())
        .map(([name, set]) => ({ name, usage: set.size }))
        .sort((a, b) => b.usage - a.usage);

      setUsageData(usageArray);
    };

    fetchUsage();
  }, [usageMonth, vehicleNameMap]);

  /* ───────── OPTIONAL: legacy workBookings maintenance blocks ───────── */
  useEffect(() => {
    const fetchWorkBookings = async () => {
      try {
        const snapshot = await getDocs(collection(db, "workBookings"));
        const events = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            const start = toDate(data.startDate);
            const end = toDate(data.endDate || data.startDate);
            if (!start || !end) return null;

            const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());

            return {
              title: `${data.vehicleName || "Vehicle"} - ${data.maintenanceType || "Maintenance"}`,
              start: s,
              end: addDays(e, 1),
              allDay: true,
              kind: "MAINTENANCE",
              vehicleId: data.vehicleId || null,
              source: "workBookings",
              docId: docSnap.id,
            };
          })
          .filter(Boolean);

        setWorkBookings(events);
      } catch (e) {
        console.warn("[workBookings] fetch failed (ok if unused):", e);
        setWorkBookings([]);
      }
    };

    fetchWorkBookings();
  }, []);

  /* ───────── ✅ REAL BOOKINGS: maintenanceBookings => calendar events ───────── */
  useEffect(() => {
    const fetchMaintenanceBookings = async () => {
      const snap = await getDocs(collection(db, "maintenanceBookings"));
      const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

      // Build events (single day uses appointmentDate, multi day uses startDate/endDate)
      const events = raw
        .map((b) => {
          const status = b.status || "";
          if (isInactiveBooking(status)) return null;

          const type = String(b.type || "").toUpperCase() === "SERVICE" ? "SERVICE" : "MOT";
          const vehicleId = b.vehicleId || null;

          // Prefer appointmentDate if present, else startDate/endDate
          const appt = toDate(b.appointmentDate);
          const st = toDate(b.startDate) || appt;
          const en = toDate(b.endDate) || st;

          if (!st || !en) return null;

          const s = new Date(st.getFullYear(), st.getMonth(), st.getDate());
          const e = new Date(en.getFullYear(), en.getMonth(), en.getDate());

          const label = vehicleId ? (vehicleNameMap[vehicleId] || b.vehicleLabel || vehicleId) : (b.vehicleLabel || "Vehicle");
          const provider = String(b.provider || "").trim();

          const kind = type === "SERVICE" ? "SERVICE_BOOKING" : "MOT_BOOKING";
          const isMulti = !appt && (st && en) && (dateKey(st) !== dateKey(en));

          const title =
            `${label} • ${type}${appt ? " appointment" : isMulti ? " (multi-day)" : ""}` +
            (provider ? ` • ${provider}` : "");

          return {
            title,
            start: s,
            end: addDays(e, 1),
            allDay: true,
            kind,
            vehicleId,
            bookingId: b.id,
            bookingStatus: b.status || "Booked",
            provider,
            source: "maintenanceBookings",
          };
        })
        .filter(Boolean);

      setMaintenanceBookingsRaw(raw);
      setMaintenanceBookingEvents(events);
    };

    fetchMaintenanceBookings().catch((e) => {
      console.error("[maintenanceBookings] fetch error:", e);
      setMaintenanceBookingsRaw([]);
      setMaintenanceBookingEvents([]);
    });
  }, [vehicleNameMap]);

  /* ───────── Booked maps (to mark due items as booked) ───────── */
  const bookedMetaByVehicle = useMemo(() => {
    // { [vehicleId]: { mot: { has, earliestAppt }, service: { has, earliestAppt } } }
    const map = {};
    for (const b of maintenanceBookingsRaw) {
      const vehicleId = b.vehicleId;
      if (!vehicleId) continue;
      if (isInactiveBooking(b.status)) continue;

      const type = String(b.type || "").toUpperCase() === "SERVICE" ? "service" : "mot";

      const appt = toDate(b.appointmentDate) || toDate(b.startDate) || null;
      if (!appt) continue;

      if (!map[vehicleId]) map[vehicleId] = { mot: { has: false, earliestAppt: null }, service: { has: false, earliestAppt: null } };
      map[vehicleId][type].has = true;

      const cur = map[vehicleId][type].earliestAppt;
      if (!cur || appt.getTime() < cur.getTime()) map[vehicleId][type].earliestAppt = appt;
    }
    return map;
  }, [maintenanceBookingsRaw]);

  /* ───────── Build MOT + Service due-date events ───────── */
  const motServiceEvents = useMemo(() => {
    if (!vehiclesRaw.length) return [];
    const events = [];

    for (const v of vehiclesRaw) {
      const label = vehicleNameMap[v.id] || buildVehicleLabelFromObject(v) || v.id;

      const motDue = dueDateFromVehicleField(v.nextMOT ?? v.motDate ?? v.motDue);
      const svcDue = dueDateFromVehicleField(v.nextService ?? v.serviceDate ?? v.serviceDue);

      const bookedMeta = bookedMetaByVehicle[v.id] || null;

      // MOT due event (booked if there is a MOT booking)
      const motBooked = !!bookedMeta?.mot?.has;
      const motAppt = bookedMeta?.mot?.earliestAppt || null;
      const motAfterExpiry = motBooked && motAppt && motDue ? isApptAfterExpiry(motAppt, motDue) : false;

      const motEv = buildDueEvent({
        vehicleId: v.id,
        label,
        kind: "MOT",
        due: motDue,
        booked: motBooked,
        bookingStatus: motAfterExpiry ? "Booked (After Expiry)" : motBooked ? "Booked" : "",
      });
      if (motEv) events.push(motEv);

      // SERVICE due event (booked if there is a SERVICE booking)
      const svcBooked = !!bookedMeta?.service?.has;
      const svcEv = buildDueEvent({
        vehicleId: v.id,
        label,
        kind: "SERVICE",
        due: svcDue,
        booked: svcBooked,
        bookingStatus: svcBooked ? "Booked" : "",
      });
      if (svcEv) events.push(svcEv);
    }

    return events;
  }, [vehiclesRaw, vehicleNameMap, bookedMetaByVehicle]);

  /* ───────── Combined calendar events ───────── */
  const calendarEvents = useMemo(() => {
    // ✅ Include real booked events from maintenanceBookings
    // ✅ Keep due-date events
    // ✅ Keep legacy workBookings if you still want them
    return [
      ...(workBookings || []),
      ...(maintenanceBookingEvents || []),
      ...(motServiceEvents || []),
    ];
  }, [workBookings, maintenanceBookingEvents, motServiceEvents]);

  // Load submitted checks (for defects queue)
  useEffect(() => {
    const loadChecks = async () => {
      const snap = await getDocs(collection(db, "vehicleChecks"));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const submitted = docs.filter((c) => c.status === "submitted");
      setCheckDocs(submitted);
      setPendingDefects(extractPendingDefects(submitted));
    };
    loadChecks();
  }, []);

  // Defect action handlers
  const openApprove = (defect) =>
    setActionModal({
      defect,
      decision: "approved",
      comment: "",
      category: "general",
    });

  const openDecline = (defect) => setActionModal({ defect, decision: "declined", comment: "" });

  const performDecision = async () => {
    if (!actionModal?.defect || !actionModal?.decision) return;
    setActionLoading(true);
    try {
      const { defect, decision, comment, category } = actionModal;
      const reviewer = auth?.currentUser?.displayName || auth?.currentUser?.email || "Supervisor";

      if (decision === "approved" && !category) {
        alert("Choose where to route this defect: General Maintenance or Immediate Defects.");
        setActionLoading(false);
        return;
      }

      const path = `items.${defect.defectIndex}.review`;
      const reviewPayload = {
        status: decision,
        reviewedBy: reviewer,
        reviewedAt: serverTimestamp(),
        comment: (comment || "").trim(),
      };

      if (decision === "approved") {
        reviewPayload.category = String(category || "").trim().toLowerCase();
      }

      await updateDoc(doc(db, "vehicleChecks", defect.checkId), {
        [path]: reviewPayload,
        updatedAt: serverTimestamp(),
      });

      setPendingDefects((prev) =>
        prev.filter((d) => !(d.checkId === defect.checkId && d.defectIndex === defect.defectIndex))
      );

      setActionModal(null);

      if (decision === "approved") {
        if (category === "immediate") router.push(IMMEDIATE_DEFECTS_PATH);
        else router.push(GENERAL_DEFECTS_PATH);
      } else {
        router.push(DECLINED_DEFECTS_PATH);
      }
    } catch (e) {
      console.error("defect review error:", e);
      alert("Could not update defect. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectEvent = (event) => {
    // ✅ Route for due events + booking events
    if (
      event?.vehicleId &&
      (
        event.kind === "MOT" ||
        event.kind === "SERVICE" ||
        event.kind === "MOT_BOOKING" ||
        event.kind === "SERVICE_BOOKING"
      )
    ) {
      router.push(`/vehicle-edit/${encodeURIComponent(event.vehicleId)}`);
      return;
    }
    setSelectedEvent(event);
  };

  const usageMonthLabel = `${usageMonth.getFullYear()}-${String(usageMonth.getMonth() + 1).padStart(2, "0")}`;
  const kpiPending = pendingDefects.length;

  const renderUsageLabel = (props) => {
    const { x = 0, y = 0, width = 0, value = 0 } = props || {};
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        textAnchor="middle"
        fill={UI.text}
        style={{ fontSize: 11, fontWeight: 900 }}
      >
        {Number(value || 0)}
      </text>
    );
  };

  // Tiles with proper numeric badges
  const vehicleSections = useMemo(
    () => [
      {
        title: "General Maintenance",
        description: "Approved, non-urgent defects to plan and schedule.",
        link: GENERAL_DEFECTS_PATH,
        rightBadges: [],
      },
      {
        title: "Immediate Defects",
        description: "Approved urgent issues that need action now.",
        link: IMMEDIATE_DEFECTS_PATH,
        rightBadges: [],
      },
      {
        title: "Declined Defects",
        description: "Defects that were reviewed and declined.",
        link: DECLINED_DEFECTS_PATH,
        rightBadges: [],
      },
      {
        title: "MOT Schedule",
        description: "View and manage MOT due dates for all vehicles.",
        link: "/mot-overview",
        rightBadges: [
          motCounts.overdue > 0 ? { label: `Overdue ${motCounts.overdue}`, tone: "danger" } : null,
          motCounts.soon > 0 ? { label: `Due soon ${motCounts.soon}`, tone: "amber" } : null,
          motCounts.total > 0 ? { label: `Total ${motCounts.total}`, tone: "soft" } : null,
        ].filter(Boolean),
      },
      {
        title: "Service Overview",
        description: "Track past and upcoming vehicle servicing.",
        link: "/service-overview",
        rightBadges: [
          serviceCounts.overdue > 0 ? { label: `Overdue ${serviceCounts.overdue}`, tone: "danger" } : null,
          serviceCounts.soon > 0 ? { label: `Due soon ${serviceCounts.soon}`, tone: "amber" } : null,
          serviceCounts.total > 0 ? { label: `Total ${serviceCounts.total}`, tone: "soft" } : null,
        ].filter(Boolean),
      },
      {
        title: "Vehicle Usage Logs",
        description: "Monitor vehicle usage across bookings and trips.",
        link: "/usage-overview",
        rightBadges: [],
      },
      {
        title: "Vehicle List",
        description: "View, edit or delete vehicles currently in the system.",
        link: "/vehicles",
        rightBadges: [],
      },
      {
        title: "Equipment List",
        description: "View, edit or delete equipment currently in the system.",
        link: "/equipment",
        rightBadges: [],
      },
      {
        title: "Add Vehicle / Equipment",
        description: "Add new vehicles and equipment in the system.",
        link: "/add-vehicle",
        rightBadges: [],
      },
    ],
    [motCounts, serviceCounts]
  );

  const eventPropGetter = (event) => {
    const kind = event?.kind || "MAINTENANCE";

    // Base palettes per kind
    let baseBg = UI.brandSoft;
    let baseBorder = "#bfdbfe";
    let baseText = UI.text;

    if (kind === "MOT") {
      baseBg = "#fff7ed";
      baseBorder = "#fed7aa";
      baseText = "#7c2d12";
      // ✅ booked MOT due should look "success-ish"
      if (event?.booked) {
        baseBg = "#ecfdf5";
        baseBorder = "#bbf7d0";
        baseText = "#065f46";
      }
    }

    if (kind === "MOT_BOOKING") {
      baseBg = "#ecfdf5";
      baseBorder = "#bbf7d0";
      baseText = "#065f46";
      if (String(event?.bookingStatus || "").includes("After Expiry")) {
        baseBg = "#fef2f2";
        baseBorder = "#fecaca";
        baseText = "#991b1b";
      }
    }

    if (kind === "SERVICE") {
      baseBg = "#ecfdf5";
      baseBorder = "#bbf7d0";
      baseText = "#065f46";
      if (event?.booked) {
        baseBg = "#ecfdf5";
        baseBorder = "#bbf7d0";
        baseText = "#065f46";
      }
    }

    if (kind === "SERVICE_BOOKING") {
      baseBg = "#ecfdf5";
      baseBorder = "#bbf7d0";
      baseText = "#065f46";
    }

    if (kind === "MAINTENANCE") {
      baseBg = UI.brandSoft;
      baseBorder = "#bfdbfe";
      baseText = UI.text;
    }

    // Escalate based on due date (skip for booking blocks)
    const dd = event?.dueDate ? new Date(event.dueDate) : null;
    const isBookingBlock = kind === "MOT_BOOKING" || kind === "SERVICE_BOOKING";
    const tone = dd && !isBookingBlock ? dueTone(dd) : "soft";

    // If due is booked, don’t escalate to overdue/soon colours
    const suppressEscalation = (kind === "MOT" || kind === "SERVICE") && event?.booked;

    if (!suppressEscalation) {
      if (tone === "overdue") {
        baseBg = "#fef2f2";
        baseBorder = "#fecaca";
        baseText = "#991b1b";
      } else if (tone === "soon") {
        baseBg = "#fff7ed";
        baseBorder = "#fed7aa";
        baseText = "#9a3412";
      }
    }

    return {
      style: {
        borderRadius: 10,
        border: `1px solid ${baseBorder}`,
        background: baseBg,
        color: baseText,
        padding: 0,
        boxShadow: "0 2px 4px rgba(2,6,23,0.08)",
        overflow: "hidden",
      },
    };
  };

  return (
    <HeaderSidebarLayout>
      {/* subtle focus ring */}
      <style>{`
        input:focus, textarea:focus, button:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(29,78,216,0.15); border-color: #bfdbfe !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Vehicle Management</h1>
            <div style={sub}>Overview • Defects • Usage • MOT • Service</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>
              Pending defects: <b style={{ marginLeft: 6 }}>{kpiPending}</b>
            </div>
            <div style={chipSoft}>
              MOT overdue: <b style={{ marginLeft: 6 }}>{motCounts.overdue}</b>
            </div>
            <div style={chipSoft}>
              Service overdue: <b style={{ marginLeft: 6 }}>{serviceCounts.overdue}</b>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div style={grid(5)}>
          <VehicleCheckTile onClick={() => router.push(VEHICLE_CHECK_PATH)} />

          {vehicleSections.map((section, idx) => (
            <Tile
              key={idx}
              title={section.title}
              description={section.description}
              rightBadges={section.rightBadges}
              onClick={() => router.push(section.link)}
            />
          ))}
        </div>

        {/* Defect Review */}
        <section style={{ ...cardBase, marginTop: UI.gap, overflow: "hidden" }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Defect review</h2>
              <div style={hint}>
                Pending approval for submitted checks. Approve and route to the correct bucket; decline to mark as not
                actionable.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chipSoft}>{pendingDefects.length} pending</span>
              <button type="button" style={btn("ghost")} onClick={() => router.push("/vehicle-checks")}>
                Open checks
              </button>
            </div>
          </div>

          <div style={divider} />

          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 900, color: UI.text }}>Date</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 900, color: UI.text }}>Vehicle</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 900, color: UI.text }}>Defect</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 900, color: UI.text }}>Note</th>
                  <th style={{ ...thtd, textAlign: "left", fontWeight: 900, color: UI.text }}>Driver</th>
                  <th style={{ ...thtd, textAlign: "center", fontWeight: 900, color: UI.text }}>Photos</th>
                  <th style={{ ...thtd, textAlign: "right", fontWeight: 900, color: UI.text }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDefects.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                      No pending defects.
                    </td>
                  </tr>
                ) : (
                  pendingDefects.map((d, i) => (
                    <tr key={`${d.checkId}-${d.defectIndex}-${i}`}>
                      <td style={thtd}>{d.dateISO || "—"}</td>
                      <td style={thtd}>{d.vehicle || "—"}</td>
                      <td style={thtd} title={d.itemLabel}>
                        <strong>#{d.defectIndex + 1}</strong> — {d.itemLabel}
                      </td>
                      <td style={{ ...thtd, maxWidth: 360 }}>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            color: d.defectNote ? UI.text : UI.muted,
                          }}
                        >
                          {d.defectNote || "—"}
                        </div>
                      </td>
                      <td style={thtd}>{d.driverName || "—"}</td>
                      <td style={{ ...thtd, textAlign: "center" }}>{d.photos?.length ? d.photos.length : 0}</td>
                      <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>
                        <a
                          href={CHECK_DETAIL_PATH(d.checkId)}
                          style={{
                            ...actionBtn("ghost"),
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          View check →
                        </a>
                        <span style={{ display: "inline-block", width: 8 }} />
                        <button onClick={() => openApprove(d)} style={actionBtn("approve")}>
                          Approve
                        </button>
                        <span style={{ display: "inline-block", width: 8 }} />
                        <button onClick={() => openDecline(d)} style={actionBtn("decline")}>
                          Decline
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Usage chart */}
        <section style={{ ...cardBase, marginTop: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Vehicle usage</h2>
              <div style={hint}>
                Counting days where note contains <b>“On Set”</b> or <b>“Shoot day”</b>.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <button type="button" style={btn("pill")} onClick={() => setUsageMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                ← Prev
              </button>

              <input
                type="month"
                value={usageMonthLabel}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  if (y && m) setUsageMonth(new Date(y, m - 1, 1));
                }}
                style={{ ...inputBase, width: 170, cursor: "pointer" }}
              />

              <button type="button" style={btn("pill")} onClick={() => setUsageMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                Next →
              </button>

              <span style={chipSoft}>{usageData.length} vehicles</span>
            </div>
          </div>

          <div style={{ height: 320, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageData} margin={{ top: 18, right: 24, left: 0, bottom: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fill: UI.muted, fontSize: 12 }} axisLine={{ stroke: "#e5e7eb" }} tickLine={{ stroke: "#e5e7eb" }} />
                <YAxis allowDecimals={false} tick={{ fill: UI.muted, fontSize: 12 }} axisLine={{ stroke: "#e5e7eb" }} tickLine={{ stroke: "#e5e7eb" }} />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.12)" }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                    fontSize: 12,
                    color: UI.text,
                  }}
                  formatter={(value) => [`${Number(value || 0)} days`, "Usage"]}
                />
                <Bar dataKey="usage" fill={UI.brand} radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="usage" position="top" content={renderUsageLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Calendar */}
        <section style={{ ...cardBase, marginTop: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>MOT & service calendar</h2>
              <div style={hint}>
                Shows: <b>maintenanceBookings</b> booked MOT/SERVICE blocks + <b>vehicles.nextMOT</b> + <b>vehicles.nextService</b> + legacy <b>workBookings</b>.
                Click MOT/Service/Booking events to open that vehicle.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
              <span style={chipSoft}>{calView}</span>
              <span style={badge("#fff7ed", "#9a3412")}>MOT due</span>
              <span style={badge("#ecfdf5", "#065f46")}>Booked MOT</span>
              <span style={badge("#ecfdf5", "#065f46")}>Booked Service</span>
              <span style={badge(UI.brandSoft, UI.brand)}>Maintenance</span>
              <button type="button" style={btn("ghost")} onClick={() => setCalDate(new Date())}>
                Today
              </button>
            </div>
          </div>

          <div
            style={{
              ...surface,
              boxShadow: "none",
              padding: 12,
              borderRadius: 12,
              height: "calc(100vh - 340px)",
            }}
          >
            {mounted && (
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                view={calView}
                onView={(v) => setCalView(v)}
                date={calDate}
                onNavigate={(d) => setCalDate(d)}
                views={["month", "week", "work_week", "day", "agenda"]}
                popup
                showMultiDayTimes
                style={{ height: "100%" }}
                dayPropGetter={() => ({
                  style: { minHeight: "110px", borderRight: "1px solid #eef2f7" },
                })}
                eventPropGetter={eventPropGetter}
                components={{
                  event: ({ event }) => {
                    const kind = event?.kind || "MAINTENANCE";

                    const label =
                      kind === "MOT"
                        ? event?.booked
                          ? "MOT due • Booked"
                          : "MOT due"
                        : kind === "SERVICE"
                        ? event?.booked
                          ? "Service due • Booked"
                          : "Service due"
                        : kind === "MOT_BOOKING"
                        ? "MOT booking"
                        : kind === "SERVICE_BOOKING"
                        ? "Service booking"
                        : "Maintenance";

                    const dd = event?.dueDate ? new Date(event.dueDate) : null;

                    const isBookingBlock = kind === "MOT_BOOKING" || kind === "SERVICE_BOOKING";
                    const showTone = !isBookingBlock && !((kind === "MOT" || kind === "SERVICE") && event?.booked);
                    const tone = showTone && dd ? dueTone(dd) : "soft";
                    const toneText =
                      tone === "overdue" ? "Overdue" : tone === "soon" ? "Due soon" : tone === "ok" ? "OK" : "";

                    const subline =
                      isBookingBlock
                        ? (event?.bookingStatus || "Booked")
                        : (event?.booked && (kind === "MOT" || kind === "SERVICE"))
                        ? (event?.bookingStatus || "Booked")
                        : toneText;

                    return (
                      <div
                        title={event.title}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          fontSize: 12.5,
                          lineHeight: 1.3,
                          fontWeight: 900,
                          padding: 8,
                          letterSpacing: "0.01em",
                        }}
                      >
                        <span style={{ color: UI.brand, fontWeight: 900, fontSize: 12 }}>{label}</span>
                        <span style={{ color: UI.text }}>{event.title}</span>
                        {subline ? (
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: UI.muted }}>{subline}</span>
                        ) : null}
                      </div>
                    );
                  },
                  toolbar: (props) => (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: UI.text }}>{props.label}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <ToolbarBtn onClick={() => props.onNavigate("PREV")}>←</ToolbarBtn>
                        <ToolbarBtn onClick={() => props.onNavigate("TODAY")}>Today</ToolbarBtn>
                        <ToolbarBtn onClick={() => props.onNavigate("NEXT")}>→</ToolbarBtn>

                        <ToolbarBtn active={props.view === "month"} onClick={() => props.onView("month")}>
                          Month
                        </ToolbarBtn>
                        <ToolbarBtn active={props.view === "week"} onClick={() => props.onView("week")}>
                          Week
                        </ToolbarBtn>
                        <ToolbarBtn active={props.view === "work_week"} onClick={() => props.onView("work_week")}>
                          Work Week
                        </ToolbarBtn>
                        <ToolbarBtn active={props.view === "day"} onClick={() => props.onView("day")}>
                          Day
                        </ToolbarBtn>
                        <ToolbarBtn active={props.view === "agenda"} onClick={() => props.onView("agenda")}>
                          Agenda
                        </ToolbarBtn>
                      </div>
                    </div>
                  ),
                }}
                onSelectEvent={handleSelectEvent}
              />
            )}
          </div>
        </section>

        {/* Event modal (only for non-vehicle routing events) */}
        {selectedEvent && (
          <div style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontWeight: 900, color: UI.text }}>
              {selectedEvent.title}
            </h3>
            <p style={{ margin: 0, color: UI.muted, fontSize: 13 }}>
              <strong style={{ color: UI.text }}>Start:</strong> {selectedEvent.start.toLocaleDateString("en-GB")}
            </p>
            <p style={{ margin: "6px 0 12px", color: UI.muted, fontSize: 13 }}>
              <strong style={{ color: UI.text }}>End:</strong> {selectedEvent.end.toLocaleDateString("en-GB")}
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {selectedEvent?.vehicleId ? (
                <button
                  onClick={() => router.push(`/vehicle-edit/${encodeURIComponent(selectedEvent.vehicleId)}`)}
                  style={btn("primary")}
                >
                  Open vehicle →
                </button>
              ) : null}
              <button onClick={() => setSelectedEvent(null)} style={btn("ghost")}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* Decision modal */}
        {actionModal && (
          <div style={{ ...modal, top: 130 }}>
            <h3 style={{ margin: "0 0 8px", fontWeight: 900, color: UI.text }}>
              {actionModal.decision === "approved" ? "Approve defect" : "Decline defect"}
            </h3>

            <div style={{ fontSize: 13, color: UI.muted, marginBottom: 10, lineHeight: 1.45 }}>
              <div>
                <strong style={{ color: UI.text }}>Date:</strong> {actionModal.defect.dateISO}
              </div>
              <div>
                <strong style={{ color: UI.text }}>Job:</strong> {actionModal.defect.jobLabel || actionModal.defect.jobId}
              </div>
              <div>
                <strong style={{ color: UI.text }}>Vehicle:</strong> {actionModal.defect.vehicle}
              </div>
              <div>
                <strong style={{ color: UI.text }}>Item:</strong> #{actionModal.defect.defectIndex + 1} —{" "}
                {actionModal.defect.itemLabel}
              </div>

              {actionModal.defect.defectNote ? (
                <div style={{ marginTop: 10 }}>
                  <strong style={{ color: UI.text }}>Note:</strong>
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "#f8fafc",
                      border: UI.border,
                      borderRadius: 12,
                      padding: 12,
                      marginTop: 6,
                      color: UI.text,
                    }}
                  >
                    {actionModal.defect.defectNote}
                  </div>
                </div>
              ) : null}
            </div>

            {actionModal.decision === "approved" && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: UI.muted, marginBottom: 6 }}>
                  Route approved defect to:
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setActionModal((m) => ({ ...m, category: "general" }))}
                    style={{
                      ...btn("pill"),
                      borderColor: actionModal.category === "general" ? "#bfdbfe" : "#d1d5db",
                      background: actionModal.category === "general" ? UI.brandSoft : "#fff",
                      color: actionModal.category === "general" ? UI.brand : UI.text,
                    }}
                    disabled={actionLoading}
                  >
                    General Maintenance
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionModal((m) => ({ ...m, category: "immediate" }))}
                    style={{
                      ...btn("pill"),
                      borderColor: actionModal.category === "immediate" ? "#bfdbfe" : "#d1d5db",
                      background: actionModal.category === "immediate" ? UI.brandSoft : "#fff",
                      color: actionModal.category === "immediate" ? UI.brand : UI.text,
                    }}
                    disabled={actionLoading}
                  >
                    Immediate Defects
                  </button>
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                  Pick <strong style={{ color: UI.text }}>Immediate</strong> for safety-critical issues; otherwise use{" "}
                  <strong style={{ color: UI.text }}>General</strong>.
                </div>
              </div>
            )}

            <label style={{ display: "block", fontSize: 12, fontWeight: 900, color: UI.muted, marginBottom: 6 }}>
              Resolution comment (optional)
            </label>
            <textarea
              value={actionModal.comment}
              onChange={(e) => setActionModal((m) => ({ ...m, comment: e.target.value }))}
              rows={4}
              placeholder="e.g., Minor scratch; safe to operate. Logged for bodyshop visit."
              style={{ ...inputBase, minHeight: 96, marginBottom: 12, resize: "vertical" }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setActionModal(null)} style={btn("ghost")} disabled={actionLoading}>
                Cancel
              </button>

              <button
                onClick={performDecision}
                style={
                  actionModal.decision === "approved"
                    ? { ...btn("primary") }
                    : { ...btn("primary"), background: UI.danger, borderColor: UI.danger }
                }
                disabled={actionLoading || (actionModal.decision === "approved" && !actionModal.category)}
              >
                {actionLoading ? "Saving…" : actionModal.decision === "approved" ? "Approve" : "Decline"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Global polish for RBC to match your style */}
      <style jsx global>{`
        .rbc-today {
          background: rgba(29, 78, 216, 0.08) !important;
        }
        .rbc-off-range-bg {
          background: #f8fafc !important;
        }
        .rbc-month-view,
        .rbc-time-view,
        .rbc-agenda-view {
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        .rbc-header {
          padding: 8px 6px;
          font-weight: 900;
          color: #0f172a;
          border-bottom: 1px solid #e5e7eb !important;
        }
        .rbc-time-content > * + * > * {
          border-left: 1px solid #eef2f7 !important;
        }
        .rbc-event {
          overflow: visible !important;
        }
        .rbc-toolbar button {
          border-radius: 999px !important;
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}

/* ───────── toolbar + tiles ───────── */
function ToolbarBtn({ children, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...btn("pill"),
        borderColor: active ? "#bfdbfe" : "#d1d5db",
        background: active ? UI.brandSoft : "#fff",
        color: active ? UI.brand : UI.text,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "#ffffff";
      }}
    >
      {children}
    </button>
  );
}

function Tile({ title, description, onClick, rightBadges = [] }) {
  return (
    <div
      style={cardBase}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? onClick() : null)}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardBase)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: UI.text }}>{title}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {rightBadges.map((b, idx) => {
            const tone = b.tone || "soft";
            const s =
              tone === "danger"
                ? badge("#fef2f2", "#991b1b")
                : tone === "amber"
                ? badge("#fff7ed", "#9a3412")
                : badge(UI.brandSoft, UI.brand);
            return (
              <span key={idx} style={s}>
                {b.label}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{description}</div>
      <div style={{ marginTop: 10, fontWeight: 900, color: UI.brand }}>Open →</div>
    </div>
  );
}

function VehicleCheckTile({ onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? onClick() : null)}
      style={cardBase}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardBase)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            border: "2px solid #bfdbfe",
            background: UI.brandSoft,
            color: UI.brand,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 900,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          ✓
        </span>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: UI.text, marginBottom: 2 }}>
            Vehicle Check
          </div>
          <div style={{ color: UI.muted, fontSize: 13 }}>Open today’s pre-use vehicle check form.</div>
        </div>
      </div>

      <div style={{ marginTop: 10, fontWeight: 900, color: UI.brand }}>Open →</div>
    </div>
  );
}
