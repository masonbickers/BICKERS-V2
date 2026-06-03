"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocs } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  FileClock,
  History,
  RotateCcw,
  Search,
  Truck,
  Wrench,
} from "lucide-react";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import MaintenanceBookingForm from "@/app/components/MaintenanceBookingForm";
import { normalizeVehicleRecord } from "@/app/utils/vehicleCompat";
import { isVehicleOutOfUse } from "@/app/utils/maintenanceSchema";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";

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
  okBg: "#ecfdf5",
  okFg: "#065f46",
  okBorder: "#bbf7d0",
  soonBg: "#fff7ed",
  soonFg: "#9a3412",
  soonBorder: "#fed7aa",
  overdueBg: "#fef2f2",
  overdueFg: "#991b1b",
  overdueBorder: "#fecdd3",
  bookedBg: "#eef2ff",
  bookedFg: "#3730a3",
  bookedBorder: "#c7d2fe",
  tealBg: "#f0fdfa",
  tealFg: "#115e59",
  tealBorder: "#99f6e4",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const title = { margin: 0, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, color: UI.text };
const subtitle = { marginTop: 6, fontSize: 13.5, lineHeight: 1.45, color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 12 };

const btn = (kind = "ghost") => {
  const primary = kind === "primary";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: primary ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
    background: primary
      ? "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)"
      : "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
    color: primary ? "#fff" : UI.text,
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
    boxShadow: primary
      ? "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)"
      : "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const input = {
  minHeight: 38,
  border: UI.border,
  borderRadius: UI.radiusSm,
  padding: "8px 10px",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
  width: "100%",
  outline: "none",
};

const select = { ...input, width: "100%", minWidth: 190 };

const pill = (bg, fg, border = "#d7dee8") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  background: bg,
  color: fg,
  border: `1px solid ${border}`,
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
});

const tableWrap = { ...card, overflow: "hidden" };
const th = {
  padding: "11px 12px",
  fontSize: 11.5,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0,
  borderBottom: "1px solid #eef2f7",
  textAlign: "left",
  background: "#f6f8fb",
  fontWeight: 900,
};
const td = {
  padding: "11px 12px",
  fontSize: 13,
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

const actionBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "5px 8px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: UI.brand,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 4px 10px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
  fontSize: 12,
  lineHeight: 1.2,
};

const INACTIVE_BOOKING_STATUSES = new Set(["cancelled", "canceled", "closed", "deleted", "declined"]);

const parseDateAny = (v) => {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d?.getTime?.()) ? null : d;
};

const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysDiff = (a, b) => Math.round((dateOnly(a) - dateOnly(b)) / (1000 * 60 * 60 * 24));
const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB") : "-");

const fmtInputDate = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function statusFromDays(diffDays) {
  if (diffDays < 0) return "overdue";
  if (diffDays <= 21) return "soon";
  return "ok";
}

function statusPillStyle(status) {
  if (status === "overdue") return pill(UI.overdueBg, UI.overdueFg, UI.overdueBorder);
  if (status === "soon") return pill(UI.soonBg, UI.soonFg, UI.soonBorder);
  if (status === "unknown") return pill("#f1f5f9", UI.text);
  return pill(UI.okBg, UI.okFg, UI.okBorder);
}

function normaliseBookedStatus(v) {
  const st = String(v?.serviceBookedStatus || "").trim().toLowerCase();
  if (!st) return null;
  if (st.includes("cancel")) return null;
  if (st.includes("declin")) return null;
  if (st.includes("complete")) return null;
  if (st.includes("book")) return "Booked";
  if (st.includes("request")) return "Requested";
  return "Booked";
}

function getBookedWindow(v) {
  const s = (v?.serviceBookingStartDate && parseDateAny(v.serviceBookingStartDate)) || null;
  const e = (v?.serviceBookingEndDate && parseDateAny(v.serviceBookingEndDate)) || null;
  const appt = (v?.serviceAppointmentDate && parseDateAny(v.serviceAppointmentDate)) || null;

  if (s && e) return { start: s, end: e, kind: "range" };
  if (appt) return { start: appt, end: appt, kind: "single" };
  return null;
}

function isBookedNow(v, today = new Date()) {
  const st = normaliseBookedStatus(v);
  if (!st) return false;

  const w = getBookedWindow(v);
  if (!w) return true;

  const t = dateOnly(today).getTime();
  const s = dateOnly(w.start).getTime();
  const e = dateOnly(w.end).getTime();
  return s <= t && t <= e;
}

function isServiceBooking(booking) {
  return String(booking?.type || booking?.maintenanceType || "").trim().toUpperCase() === "SERVICE";
}

function isInactiveBooking(booking) {
  return INACTIVE_BOOKING_STATUSES.has(String(booking?.status || "").trim().toLowerCase());
}

function getBookingStart(booking) {
  const dateFromList = Array.isArray(booking?.bookingDates) && booking.bookingDates.length
    ? booking.bookingDates.map(parseDateAny).filter(Boolean).sort((a, b) => a - b)[0]
    : null;

  return (
    dateFromList ||
    parseDateAny(booking?.appointmentDateISO) ||
    parseDateAny(booking?.appointmentDate) ||
    parseDateAny(booking?.startDateISO) ||
    parseDateAny(booking?.startDate) ||
    parseDateAny(booking?.date)
  );
}

function getBookingEnd(booking) {
  const dateFromList = Array.isArray(booking?.bookingDates) && booking.bookingDates.length
    ? booking.bookingDates.map(parseDateAny).filter(Boolean).sort((a, b) => b - a)[0]
    : null;

  return dateFromList || parseDateAny(booking?.endDateISO) || parseDateAny(booking?.endDate) || getBookingStart(booking);
}

function bookingDateLabel(booking) {
  const start = getBookingStart(booking);
  const end = getBookingEnd(booking);
  if (!start) return "Date not set";
  if (!end || start.getTime() === end.getTime()) return fmtShort(start);
  return `${fmtShort(start)} to ${fmtShort(end)}`;
}

function buildServiceRow(docSnap, today) {
  const v = normalizeVehicleRecord({ id: docSnap.id, ...docSnap.data() });
  const next = parseDateAny(v.nextService || v.nextServiceDate);
  const last = parseDateAny(v.lastService || v.lastServiceDate);
  const diffDays = next ? daysDiff(next, today) : null;
  const status = diffDays === null ? "unknown" : statusFromDays(diffDays);
  const bookedStatus = normaliseBookedStatus(v);
  const bookedWindow = getBookedWindow(v);
  const bookedNow = isBookedNow(v, today);
  const odometer = Number(String(v.odometer || v.serviceOdometer || v.mileage || "").replace(/[^\d.]/g, ""));

  return {
    ...v,
    id: docSnap.id,
    name: v.name || "-",
    reg: v.reg || v.registration || "-",
    category: v.category || "-",
    nextServiceRaw: next,
    nextServiceDate: fmtShort(next),
    lastServiceRaw: last,
    lastServiceDate: fmtShort(last),
    daysUntilService: diffDays,
    status,
    bookedStatus,
    bookedNow,
    bookedWindow,
    odometer: Number.isFinite(odometer) && odometer > 0 ? odometer : null,
  };
}

function rowRiskScore(row) {
  if (row.status === "overdue") return 1000 + Math.abs(row.daysUntilService || 0);
  if (row.status === "soon") return 700 - (row.daysUntilService || 0);
  if (row.status === "unknown") return 550;
  if (row.activeBookings.length) return 250;
  return 0;
}

function statusText(status) {
  if (status === "overdue") return "Overdue";
  if (status === "soon") return "Due Soon";
  if (status === "unknown") return "Missing date";
  return "OK";
}

function serviceRecordDate(record) {
  return (
    parseDateAny(record?.completedDate) ||
    parseDateAny(record?.serviceDateOnly) ||
    parseDateAny(record?.serviceDate) ||
    parseDateAny(record?.date) ||
    parseDateAny(record?.createdAt) ||
    parseDateAny(record?.recordedAt)
  );
}

function serviceRecordTitle(record) {
  return record?.serviceType || record?.bookingRef || record?.title || "Service record";
}

export default function ServiceOverviewPage() {
  const router = useRouter();
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);
  const [vehicles, setVehicles] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingVehicle, setBookingVehicle] = useState(null);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("risk");

  const loadVehicles = useCallback(async () => {
    if (!authState?.accessReady) return;
    setLoading(true);
    try {
      const [vehiclesSnap, bookingsSnap, recordsSnap] = await Promise.all([
        getDocs(tenantCollectionQuery(db, "vehicles", authState)),
        getDocs(tenantCollectionQuery(db, "maintenanceBookings", authState)),
        getDocs(tenantCollectionQuery(db, "serviceRecords", authState)),
      ]);
      const today = new Date();
      setVehicles(
        vehiclesSnap.docs
          .map((docSnap) => buildServiceRow(docSnap, today))
          .filter((row) => !isVehicleOutOfUse(row))
      );
      setMaintenanceBookings(bookingsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      setServiceRecords(recordsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    } finally {
      setLoading(false);
    }
  }, [authState]);

  useEffect(() => {
    loadVehicles();
  }, [accessKey, loadVehicles]);

  const activeServiceBookings = useMemo(() => {
    return maintenanceBookings
      .filter((booking) => isServiceBooking(booking) && !isInactiveBooking(booking))
      .map((booking) => ({
        ...booking,
        startDateObj: getBookingStart(booking),
        endDateObj: getBookingEnd(booking),
      }))
      .sort((a, b) => (a.startDateObj?.getTime?.() || 9999999999999) - (b.startDateObj?.getTime?.() || 9999999999999));
  }, [maintenanceBookings]);

  const bookingsByVehicle = useMemo(() => {
    const map = new Map();
    activeServiceBookings.forEach((booking) => {
      const vehicleId = String(booking.vehicleId || "").trim();
      if (!vehicleId) return;
      const list = map.get(vehicleId) || [];
      list.push(booking);
      map.set(vehicleId, list);
    });
    return map;
  }, [activeServiceBookings]);

  const serviceRows = useMemo(() => {
    return vehicles.map((vehicle) => {
      const activeBookings = bookingsByVehicle.get(vehicle.id) || [];
      const nextBooking = activeBookings[0] || null;
      return {
        ...vehicle,
        activeBookings,
        nextBooking,
        hasServiceBooking: activeBookings.length > 0 || Boolean(vehicle.bookedStatus),
      };
    });
  }, [bookingsByVehicle, vehicles]);

  const filtered = useMemo(() => {
    let data = serviceRows;
    const s = q.trim().toLowerCase();

    if (s) {
      data = data.filter((v) =>
        [v.name, v.reg, v.category, v.serviceProvider, v.nextBooking?.provider]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s)
      );
    }

    if (filter === "booked") {
      data = data.filter((v) => v.hasServiceBooking);
    } else if (filter !== "all") {
      data = data.filter((v) => v.status === filter);
    }

    return [...data].sort((a, b) => {
      if (sort === "name") return String(a.name).localeCompare(String(b.name));
      if (sort === "daysAsc") return (a.daysUntilService ?? 999999) - (b.daysUntilService ?? 999999);
      if (sort === "daysDesc") return (b.daysUntilService ?? -999999) - (a.daysUntilService ?? -999999);
      if (sort === "booked") return Number(b.hasServiceBooking) - Number(a.hasServiceBooking) || String(a.name).localeCompare(String(b.name));
      return rowRiskScore(b) - rowRiskScore(a) || String(a.name).localeCompare(String(b.name));
    });
  }, [filter, q, serviceRows, sort]);

  const kpis = useMemo(() => {
    const overdue = serviceRows.filter((v) => v.status === "overdue").length;
    const soon = serviceRows.filter((v) => v.status === "soon").length;
    const ok = serviceRows.filter((v) => v.status === "ok").length;
    const unknown = serviceRows.filter((v) => v.status === "unknown").length;
    const bookedVehicles = serviceRows.filter((v) => v.hasServiceBooking).length;
    const completionRecords = serviceRecords.length + serviceRows.reduce((sum, v) => sum + (Array.isArray(v.serviceHistory) ? v.serviceHistory.length : 0), 0);
    return { overdue, soon, ok, unknown, bookedVehicles, activeBookings: activeServiceBookings.length, completionRecords, total: serviceRows.length };
  }, [activeServiceBookings.length, serviceRecords.length, serviceRows]);

  const priorityRows = useMemo(() => {
    return [...serviceRows]
      .filter((row) => row.status === "overdue" || row.status === "soon" || row.status === "unknown")
      .sort((a, b) => rowRiskScore(b) - rowRiskScore(a) || String(a.name).localeCompare(String(b.name)))
      .slice(0, 8);
  }, [serviceRows]);

  const bookedQueue = useMemo(() => activeServiceBookings.slice(0, 8), [activeServiceBookings]);

  const categoryRows = useMemo(() => {
    const map = new Map();
    serviceRows.forEach((row) => {
      const key = row.category || "Uncategorised";
      const next = map.get(key) || { category: key, total: 0, overdue: 0, soon: 0, booked: 0, missing: 0 };
      next.total += 1;
      if (row.status === "overdue") next.overdue += 1;
      if (row.status === "soon") next.soon += 1;
      if (row.status === "unknown") next.missing += 1;
      if (row.hasServiceBooking) next.booked += 1;
      map.set(key, next);
    });
    return Array.from(map.values()).sort((a, b) => (b.overdue + b.soon + b.missing) - (a.overdue + a.soon + a.missing) || a.category.localeCompare(b.category));
  }, [serviceRows]);

  const recentActivity = useMemo(() => {
    const fromRecords = serviceRecords.map((record) => {
      const vehicle = serviceRows.find((row) => row.id === String(record.vehicleId || record.assetId || "").trim());
      return {
        id: `record:${record.id}`,
        vehicleId: vehicle?.id || record.vehicleId || record.assetId || "",
        vehicleLabel: vehicle ? `${vehicle.name} (${vehicle.reg})` : record.assetLabel || record.vehicleLabel || record.vehicleName || "Vehicle",
        title: serviceRecordTitle(record),
        date: serviceRecordDate(record),
        meta: record.provider || record.location || record.bookingRef || "",
      };
    });

    const fromVehicleHistory = serviceRows.flatMap((vehicle) =>
      (Array.isArray(vehicle.serviceHistory) ? vehicle.serviceHistory : []).map((entry, index) => ({
        id: `history:${vehicle.id}:${entry.serviceRecordId || index}`,
        vehicleId: vehicle.id,
        vehicleLabel: `${vehicle.name} (${vehicle.reg})`,
        title: serviceRecordTitle(entry),
        date: serviceRecordDate(entry),
        meta: entry.provider || entry.location || entry.bookingRef || "",
      }))
    );

    return [...fromRecords, ...fromVehicleHistory]
      .filter((item) => item.date)
      .sort((a, b) => b.date - a.date)
      .slice(0, 8);
  }, [serviceRecords, serviceRows]);

  const rowBg = (status, bookedNow) => {
    if (bookedNow) return { background: "#f3f5ff" };
    if (status === "overdue") return { background: "#fff1f2" };
    if (status === "soon") return { background: "#fffbeb" };
    if (status === "ok") return { background: "#f0fdf4" };
    return {};
  };

  const bookedPill = (v) => {
    if (v.nextBooking) {
      return (
        <span style={pill(UI.bookedBg, UI.bookedFg, UI.bookedBorder)} title={bookingDateLabel(v.nextBooking)}>
          {v.nextBooking.status || "Booked"}
          <span style={{ fontWeight: 800, opacity: 0.85 }}> - {bookingDateLabel(v.nextBooking)}</span>
        </span>
      );
    }

    if (!v.bookedStatus) return <span style={pill("#f1f5f9", UI.text)}>Not booked</span>;

    const w = v.bookedWindow;
    const label = w?.start && w?.end
      ? w.kind === "single"
        ? fmtShort(w.start)
        : `${fmtShort(w.start)} to ${fmtShort(w.end)}`
      : "Dates not set";

    return (
      <span style={pill(UI.bookedBg, UI.bookedFg, UI.bookedBorder)} title={label}>
        {v.bookedStatus}
        {v.bookedNow ? " now" : ""}
        <span style={{ fontWeight: 800, opacity: 0.85 }}> - {label}</span>
      </span>
    );
  };

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        .service-overview-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowHover} !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        input:focus, select:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: #9fb7cf !important; }
        .service-overview-kpi-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        .service-overview-filter-grid {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 220px 220px auto;
          gap: 10px;
          align-items: center;
        }
        .service-overview-dashboard-grid {
          display: grid;
          grid-template-columns: 1.1fr 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .service-overview-category-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        @media (max-width: 1320px) {
          .service-overview-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .service-overview-dashboard-grid { grid-template-columns: 1fr 1fr !important; }
          .service-overview-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 1180px) {
          .service-overview-filter-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 760px) {
          .service-overview-kpi-grid, .service-overview-filter-grid, .service-overview-dashboard-grid, .service-overview-category-grid { grid-template-columns: 1fr !important; }
        }
        .service-overview-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .service-overview-table tbody tr:hover {
          filter: brightness(0.995);
        }
      `}</style>

      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={title}>Service Overview</h1>
            <div style={subtitle}>
              Workshop-style service board showing due risk, booked work, recent completions, and the full vehicle register.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="service-overview-action" onClick={() => router.push("/vehicle-home")} style={btn("primary")}>
              <Truck size={15} />
              Vehicle Home
            </button>
            <button type="button" className="service-overview-action" onClick={() => router.back()} style={btn()}>
              <ArrowLeft size={15} />
              Back
            </button>
          </div>
        </div>

        <div className="service-overview-kpi-grid">
          <SummaryCard label="Overdue" value={kpis.overdue} sub="Need booking now" icon={AlertTriangle} tone="danger" />
          <SummaryCard label="Due Soon" value={kpis.soon} sub="Within 21 days" icon={Clock3} tone="amber" />
          <SummaryCard label="Booked Vehicles" value={kpis.bookedVehicles} sub={`${kpis.activeBookings} active bookings`} icon={Wrench} tone="booked" />
          <SummaryCard label="Missing Date" value={kpis.unknown} sub="Needs core service date" icon={FileClock} tone="brand" />
          <SummaryCard label="Completed Logs" value={kpis.completionRecords} sub="Service history records" icon={History} tone="ok" />
        </div>

        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <div className="service-overview-filter-grid">
            <label style={{ position: "relative", display: "block" }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: UI.muted }}
              />
              <input
                style={{ ...input, paddingLeft: 34 }}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, reg, category, provider..."
                type="search"
              />
            </label>

            <select style={select} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Filter: All</option>
              <option value="overdue">Filter: Overdue</option>
              <option value="soon">Filter: Due soon</option>
              <option value="booked">Filter: Booked</option>
              <option value="unknown">Filter: Missing date</option>
              <option value="ok">Filter: OK</option>
            </select>

            <select style={select} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="risk">Sort: Risk first</option>
              <option value="booked">Sort: Booked first</option>
              <option value="daysAsc">Sort: Days low to high</option>
              <option value="daysDesc">Sort: Days high to low</option>
              <option value="name">Sort: Name A to Z</option>
            </select>

            <button
              type="button"
              className="service-overview-action"
              style={btn()}
              onClick={() => {
                setQ("");
                setFilter("all");
                setSort("risk");
              }}
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={pill(UI.overdueBg, UI.overdueFg, UI.overdueBorder)}>Overdue</span>
            <span style={pill(UI.soonBg, UI.soonFg, UI.soonBorder)}>Due Soon</span>
            <span style={pill(UI.bookedBg, UI.bookedFg, UI.bookedBorder)}>Booked</span>
            <span style={pill("#f1f5f9", UI.text)}>Showing {filtered.length} / {kpis.total}</span>
          </div>
        </div>

        <div className="service-overview-dashboard-grid">
          <section style={panel}>
            <SectionHeader title="Priority Service Queue" meta={priorityRows.length ? "Highest risk vehicles first" : "No urgent service work"} />
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {loading ? (
                <EmptyLine>Loading service queue...</EmptyLine>
              ) : priorityRows.length ? (
                priorityRows.map((row) => (
                  <QueueItem
                    key={row.id}
                    title={`${row.name} (${row.reg})`}
                    meta={`${row.category} - ${row.nextServiceDate}`}
                    status={statusText(row.status)}
                    tone={row.status}
                    actionLabel="Book"
                    onAction={() => setBookingVehicle({ id: row.id, name: row.name, reg: row.reg, nextServiceRaw: row.nextServiceRaw })}
                    onOpen={() => router.push(`/vehicle-edit/${row.id}`)}
                  />
                ))
              ) : (
                <EmptyLine>No overdue, due soon, or missing service dates in this view.</EmptyLine>
              )}
            </div>
          </section>

          <section style={panel}>
            <SectionHeader title="Booked Pipeline" meta={bookedQueue.length ? "Upcoming active service bookings" : "No active service bookings"} />
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {loading ? (
                <EmptyLine>Loading bookings...</EmptyLine>
              ) : bookedQueue.length ? (
                bookedQueue.map((booking) => (
                  <QueueItem
                    key={booking.id}
                    title={booking.vehicleLabel || booking.vehicleName || booking.vehicleId || "Vehicle"}
                    meta={`${bookingDateLabel(booking)}${booking.provider ? ` - ${booking.provider}` : ""}`}
                    status={booking.status || "Booked"}
                    tone="booked"
                    actionLabel="Open"
                    onAction={() => router.push(`/vehicle-edit/${encodeURIComponent(booking.vehicleId || "")}`)}
                    onOpen={() => router.push(`/vehicle-edit/${encodeURIComponent(booking.vehicleId || "")}`)}
                  />
                ))
              ) : (
                <EmptyLine>Nothing currently booked for service.</EmptyLine>
              )}
            </div>
          </section>

          <section style={panel}>
            <SectionHeader title="Recent Service Activity" meta={recentActivity.length ? "Latest completed service records" : "No recent records found"} />
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {loading ? (
                <EmptyLine>Loading service history...</EmptyLine>
              ) : recentActivity.length ? (
                recentActivity.map((item) => (
                  <QueueItem
                    key={item.id}
                    title={item.vehicleLabel}
                    meta={`${fmtShort(item.date)} - ${item.title}${item.meta ? ` - ${item.meta}` : ""}`}
                    status="Completed"
                    tone="ok"
                    actionLabel="View"
                    onAction={() => item.vehicleId && router.push(`/vehicle-edit/${encodeURIComponent(item.vehicleId)}`)}
                    onOpen={() => item.vehicleId && router.push(`/vehicle-edit/${encodeURIComponent(item.vehicleId)}`)}
                  />
                ))
              ) : (
                <EmptyLine>No completed service history has been logged yet.</EmptyLine>
              )}
            </div>
          </section>
        </div>

        <section style={{ ...card, padding: 12, marginBottom: 12 }}>
          <SectionHeader title="Fleet By Category" meta="Where service pressure is concentrated" />
          <div className="service-overview-category-grid" style={{ marginTop: 10 }}>
            {categoryRows.length ? (
              categoryRows.slice(0, 8).map((row) => (
                <div key={row.category} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10, background: "#fff" }}>
                  <div style={{ color: UI.text, fontSize: 13, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.category}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={pill("#f1f5f9", UI.text)}>{row.total} total</span>
                    {row.overdue ? <span style={pill(UI.overdueBg, UI.overdueFg, UI.overdueBorder)}>{row.overdue} overdue</span> : null}
                    {row.soon ? <span style={pill(UI.soonBg, UI.soonFg, UI.soonBorder)}>{row.soon} soon</span> : null}
                    {row.booked ? <span style={pill(UI.bookedBg, UI.bookedFg, UI.bookedBorder)}>{row.booked} booked</span> : null}
                    {row.missing ? <span style={pill("#f1f5f9", UI.text)}>{row.missing} missing</span> : null}
                  </div>
                </div>
              ))
            ) : (
              <EmptyLine>No category data available.</EmptyLine>
            )}
          </div>
        </section>

        <div style={tableWrap}>
          <div style={{ padding: 12, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <SectionHeader title="Service Register" meta="Full vehicle service position with booking and history context" />
            <span style={pill("#f1f5f9", UI.text)}>{loading ? "Loading..." : `${filtered.length} rows`}</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="service-overview-table" style={{ width: "100%", minWidth: 1240, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Vehicle</th>
                  <th style={th}>Category</th>
                  <th style={th}>Next Service</th>
                  <th style={th}>Days</th>
                  <th style={th}>Status</th>
                  <th style={th}>Booking</th>
                  <th style={th}>Last Service</th>
                  <th style={th}>Odometer</th>
                  <th style={th}>History</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      Loading vehicles...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      No vehicles match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((v) => {
                    const status = v.status === "unknown" ? "unknown" : v.status;
                    const diff = v.daysUntilService;
                    const historyCount = Array.isArray(v.serviceHistory) ? v.serviceHistory.length : 0;

                    return (
                      <tr key={v.id} style={rowBg(status, v.hasServiceBooking)}>
                        <td style={td}>
                          <button
                            type="button"
                            onClick={() => router.push(`/vehicle-edit/${v.id}`)}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              margin: 0,
                              fontWeight: 950,
                              color: UI.text,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            title="Open vehicle"
                          >
                            {v.name}
                          </button>
                          <div style={{ marginTop: 2, color: UI.muted, fontSize: 12, fontWeight: 800 }}>{v.reg}</div>
                        </td>

                        <td style={td}>{v.category}</td>
                        <td style={td}>{v.nextServiceDate}</td>
                        <td style={td}>{diff === null || diff === undefined ? "-" : diff}</td>
                        <td style={td}>
                          <span style={statusPillStyle(status)}>{statusText(status)}</span>
                        </td>
                        <td style={td}>{bookedPill(v)}</td>
                        <td style={td}>{v.lastServiceDate}</td>
                        <td style={td}>{v.odometer ? v.odometer.toLocaleString("en-GB") : "-"}</td>
                        <td style={td}>
                          <span style={pill(historyCount ? UI.tealBg : "#f1f5f9", historyCount ? UI.tealFg : UI.text, historyCount ? UI.tealBorder : "#d7dee8")}>
                            {historyCount} records
                          </span>
                        </td>

                        <td style={td}>
                          <button
                            type="button"
                            className="service-overview-action"
                            style={actionBtn}
                            onClick={() =>
                              setBookingVehicle({
                                id: v.id,
                                name: v.name,
                                reg: v.reg,
                                nextServiceRaw: v.nextServiceRaw,
                              })
                            }
                          >
                            <Wrench size={13} />
                            Book Service
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {bookingVehicle ? (
          <MaintenanceBookingForm
            vehicleId={bookingVehicle.id}
            type="SERVICE"
            defaultDate={fmtInputDate(bookingVehicle.nextServiceRaw)}
            onClose={() => setBookingVehicle(null)}
            onSaved={async () => {
              setBookingVehicle(null);
              await loadVehicles();
            }}
          />
        ) : null}
      </div>
    </HeaderSidebarLayout>
  );
}

function SectionHeader({ title: sectionTitle, meta }) {
  return (
    <div>
      <div style={{ color: UI.text, fontSize: 15, fontWeight: 950 }}>{sectionTitle}</div>
      {meta ? <div style={{ marginTop: 3, color: UI.muted, fontSize: 12.5 }}>{meta}</div> : null}
    </div>
  );
}

function EmptyLine({ children }) {
  return <div style={{ color: UI.muted, fontSize: 13, padding: "8px 0" }}>{children}</div>;
}

function QueueItem({ title: itemTitle, meta, status, tone, actionLabel, onAction, onOpen }) {
  const tones = {
    overdue: { bg: UI.overdueBg, fg: UI.overdueFg, border: UI.overdueBorder },
    soon: { bg: UI.soonBg, fg: UI.soonFg, border: UI.soonBorder },
    unknown: { bg: "#f1f5f9", fg: UI.text, border: "#d7dee8" },
    booked: { bg: UI.bookedBg, fg: UI.bookedFg, border: UI.bookedBorder },
    ok: { bg: UI.okBg, fg: UI.okFg, border: UI.okBorder },
  };
  const style = tones[tone] || tones.unknown;

  return (
    <div style={{ border: UI.border, borderRadius: UI.radiusSm, background: "#fff", padding: 9 }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
        <button
          type="button"
          onClick={onOpen}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            margin: 0,
            minWidth: 0,
            color: UI.text,
            fontWeight: 950,
            fontSize: 13,
            textAlign: "left",
            cursor: onOpen ? "pointer" : "default",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {itemTitle}
        </button>
        <span style={pill(style.bg, style.fg, style.border)}>{status}</span>
      </div>
      <div style={{ marginTop: 5, color: UI.muted, fontSize: 12.5, lineHeight: 1.35 }}>{meta}</div>
      {onAction ? (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="service-overview-action" style={actionBtn} onClick={onAction}>
            <Wrench size={13} />
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, tone = "brand" }) {
  const tones = {
    booked: { bg: UI.bookedBg, fg: UI.bookedFg, border: UI.bookedBorder },
    danger: { bg: UI.overdueBg, fg: UI.overdueFg, border: UI.overdueBorder },
    amber: { bg: UI.soonBg, fg: UI.soonFg, border: UI.soonBorder },
    ok: { bg: UI.okBg, fg: UI.okFg, border: UI.okBorder },
    brand: { bg: UI.brandSoft, fg: UI.brand, border: UI.brandBorder },
  };
  const toneStyles = tones[tone] || tones.brand;

  return (
    <div style={{ ...panel, minHeight: 82, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
          {label}
        </div>
        <div style={{ marginTop: 4, color: UI.text, fontSize: 24, lineHeight: 1, fontWeight: 950 }}>{value}</div>
        <div style={{ marginTop: 6, color: UI.muted, fontSize: 12.5, fontWeight: 700 }}>{sub}</div>
      </div>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          border: `1px solid ${toneStyles.border}`,
          background: toneStyles.bg,
          color: toneStyles.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        <Icon size={20} />
      </div>
    </div>
  );
}
