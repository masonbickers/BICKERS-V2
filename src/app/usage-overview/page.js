"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Edit3,
  Gauge,
  RotateCcw,
  Save,
  Search,
  Truck,
  X,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db, auth } from "../../../firebaseConfig";
import { normalizeVehicleRecord } from "@/app/utils/vehicleCompat";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const UI = {
  radius: "var(--radius-md)",
  radiusSm: "var(--radius-md)",
  shadowSm: "var(--shadow-sm)",
  shadowHover: "var(--shadow-md)",
  border: "var(--border-default)",
  bg: "var(--color-canvas)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-soft)",
  brandBorder: "var(--color-brand-border)",
  okBg: "var(--color-success-soft)",
  okFg: "var(--legacy-color-065f46)",
  okBorder: "var(--color-success-border)",
  warnBg: "var(--color-warning-soft)",
  warnFg: "var(--color-warning)",
  warnBorder: "var(--color-warning-border)",
  dangerBg: "var(--color-danger-soft)",
  dangerFg: "var(--color-danger)",
  dangerBorder: "var(--legacy-color-fecdd3)",
  bookedBg: "var(--legacy-color-eef2ff)",
  bookedFg: "var(--legacy-color-3730a3)",
  bookedBorder: "var(--legacy-color-c7d2fe)",
  noteBg: "var(--legacy-color-f0fdfa)",
  noteFg: "var(--legacy-color-115e59)",
  noteBorder: "var(--legacy-color-99f6e4)",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const panel = { ...card, padding: "var(--space-3)" };
const title = { margin: 0, fontSize: "var(--font-size-xl)", lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, color: UI.text };
const sub = { marginTop: 6, fontSize: 13.5, lineHeight: 1.45, color: UI.muted };

const btn = (kind = "ghost") => {
  const primary = kind === "primary";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: primary ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
    background: primary
      ? "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--color-brand) 100%)"
      : "linear-gradient(180deg, var(--color-white) 0%, var(--legacy-color-f8fbfe) 100%)",
    color: primary ? "var(--color-white)" : UI.text,
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
  fontSize: "var(--font-size-sm)",
  background: "var(--color-white)",
  color: UI.text,
  width: "100%",
  outline: "none",
};

const pill = (bg, fg, border = "var(--color-border)") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: "var(--radius-pill)",
  background: bg,
  color: fg,
  border: `1px solid ${border}`,
  fontSize: "var(--font-size-xs)",
  fontWeight: 900,
  whiteSpace: "nowrap",
});

const th = {
  padding: "11px 12px",
  fontSize: 11.5,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0,
  borderBottom: "1px solid var(--legacy-color-eef2f7)",
  textAlign: "left",
  background: "var(--legacy-color-f6f8fb)",
  fontWeight: 900,
};

const td = {
  padding: "11px 12px",
  fontSize: "var(--font-size-sm)",
  borderBottom: "1px solid var(--legacy-color-f1f5f9)",
  verticalAlign: "middle",
};

const NOTE_OPTIONS = [
  "1/2 Day Travel",
  "Night Shoot",
  "Shoot Day",
  "Other",
  "Rehearsal Day",
  "Rest Day",
  "Rig Day",
  "Standby Day",
  "Spilt Day",
  "Travel Day",
  "Travel Time",
  "Turnaround Day",
  "Recce Day",
];

const USAGE_COLLECTION = "vehicleUsageNotes";
const usageDocId = (vehicleId, dateISO) => `${vehicleId}__${dateISO}`;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODateLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISODateLocal(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [year, month, day] = String(s).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseDateAny(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const direct = parseISODateLocal(value.slice(0, 10));
    if (direct) return direct;
  }
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d?.getTime?.()) ? null : d;
}

function dateAnyToISO(value) {
  const d = parseDateAny(value);
  return d ? toISODateLocal(d) : "";
}

function startOfTodayLocal() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function daysBetweenInclusive(fromISO, toISO) {
  const a = parseISODateLocal(fromISO);
  const b = parseISODateLocal(toISO);
  if (!a || !b) return [];
  const start = a <= b ? a : b;
  const end = a <= b ? b : a;
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toISODateLocal(d));
  }
  return out;
}

function fmtDate(value) {
  const d = typeof value === "string" ? parseISODateLocal(value) : parseDateAny(value);
  return d ? d.toLocaleDateString("en-GB") : "-";
}

function fmtDay(value) {
  const d = parseISODateLocal(value);
  if (!d) return "-";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function fmtUpdated(value) {
  const d = parseDateAny(value);
  if (!d) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function makeVehicleLabel(v) {
  const name = String(v?.name || v?.vehicleName || v?.displayName || v?.model || "").trim();
  const reg = String(v?.reg || v?.registration || v?.regNumber || v?.regNo || "").trim().toUpperCase();
  if (name && reg) return `${name} (${reg})`;
  return name || reg || "-";
}

function buildVehicleLookup(vehicles) {
  const byId = new Map();
  const byKey = new Map();

  vehicles.forEach((v) => {
    byId.set(v.id, v);
    [v.id, v.name, v.reg, v.registration, v.label].forEach((part) => {
      const key = normKey(part);
      if (key && !byKey.has(key)) byKey.set(key, v.id);
    });
  });

  return { byId, byKey };
}

function resolveVehicleId(value, lookup) {
  if (!value) return "";
  if (typeof value === "object") {
    return (
      resolveVehicleId(value.id, lookup) ||
      resolveVehicleId(value.vehicleId, lookup) ||
      resolveVehicleId(value.reg, lookup) ||
      resolveVehicleId(value.registration, lookup) ||
      resolveVehicleId(value.name, lookup)
    );
  }
  const raw = String(value).trim();
  if (!raw) return "";
  if (lookup.byId.has(raw)) return raw;
  return lookup.byKey.get(normKey(raw)) || "";
}

function isActiveBookingStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return !["cancelled", "canceled", "declined", "deleted", "lost"].includes(s);
}

function bookingDateKeys(booking) {
  const set = new Set();

  if (Array.isArray(booking.bookingDates)) {
    booking.bookingDates.forEach((value) => {
      const iso = dateAnyToISO(value);
      if (iso) set.add(iso);
    });
  }

  if (Array.isArray(booking.customDates)) {
    booking.customDates.forEach((value) => {
      const iso = dateAnyToISO(value);
      if (iso) set.add(iso);
    });
  }

  [booking.dateISO, booking.date].forEach((value) => {
    const iso = dateAnyToISO(value);
    if (iso) set.add(iso);
  });

  const start = dateAnyToISO(booking.startDateISO || booking.startDate);
  const end = dateAnyToISO(booking.endDateISO || booking.endDate);
  if (start && end) daysBetweenInclusive(start, end).forEach((iso) => set.add(iso));
  if (start && !end) set.add(start);

  return Array.from(set).sort();
}

function bookingLabel(booking) {
  return [booking.jobNumber, booking.client, booking.location].filter(Boolean).join(" - ") || booking.id || "Booking";
}

function displayNote(noteDoc) {
  if (!noteDoc?.note) return "";
  if (noteDoc.note === "Other" && noteDoc.otherText) return `Other - ${noteDoc.otherText}`;
  return noteDoc.note;
}

function noteShort(noteDoc) {
  const label = displayNote(noteDoc);
  if (!label) return "";
  if (label.length <= 18) return label;
  return `${label.slice(0, 17)}...`;
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export default function UsageOverviewPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const today = startOfTodayLocal();
  const defaultTo = toISODateLocal(today);
  const defaultFrom = toISODateLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13));

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [usageMap, setUsageMap] = useState(new Map());
  const [bookings, setBookings] = useState([]);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [q, setQ] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewFilter, setViewFilter] = useState("all");
  const [noteFilter, setNoteFilter] = useState("all");
  const [sort, setSort] = useState("risk");

  const [editModal, setEditModal] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  const loadData = useCallback(async () => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "vehicleUsageNotes", operation: "Load usage overview" })) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [vehicleSnap, usageSnap, bookingSnap] = await Promise.all([
        getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState)),
        getDocs(tenantCollectionQuery(db, USAGE_COLLECTION, dataAccessState)),
        getDocs(tenantCollectionQuery(db, "bookings", dataAccessState)),
      ]);

      const vehicleRows = vehicleSnap.docs
        .map((snap) => {
          const raw = normalizeVehicleRecord({ id: snap.id, ...snap.data() });
          return {
            ...raw,
            id: snap.id,
            name: raw.name || raw.vehicleName || "-",
            reg: raw.reg || raw.registration || "-",
            category: raw.category || raw.group || "-",
            label: makeVehicleLabel(raw),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      const usage = new Map();
      usageSnap.docs.forEach((snap) => {
        const data = snap.data() || {};
        if (!data.vehicleId || !data.dateISO) return;
        usage.set(usageDocId(data.vehicleId, data.dateISO), { id: snap.id, ...data });
      });

      const bookingRows = bookingSnap.docs
        .map((snap) => ({ id: snap.id, ...snap.data() }))
        .filter((booking) => isActiveBookingStatus(booking.status));

      setVehicles(vehicleRows);
      setUsageMap(usage);
      setBookings(bookingRows);
    } catch (error) {
      console.error("usage overview load error:", error);
      setVehicles([]);
      setUsageMap(new Map());
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [dataAccessState]);

  useEffect(() => {
    loadData();
  }, [accessKey, loadData]);

  const dayKeys = useMemo(() => {
    return daysBetweenInclusive(fromDate, toDate);
  }, [fromDate, toDate]);

  const lookup = useMemo(() => buildVehicleLookup(vehicles), [vehicles]);

  const bookingsByCell = useMemo(() => {
    const inRange = new Set(dayKeys);
    const map = new Map();

    bookings.forEach((booking) => {
      const vehicleIds = Array.isArray(booking.vehicles) && booking.vehicles.length
        ? booking.vehicles.map((value) => resolveVehicleId(value, lookup)).filter(Boolean)
        : [resolveVehicleId(booking.vehicleId || booking.vehicle || booking.registration || booking.reg, lookup)].filter(Boolean);

      if (!vehicleIds.length) return;

      bookingDateKeys(booking).forEach((dateISO) => {
        if (!inRange.has(dateISO)) return;
        vehicleIds.forEach((vehicleId) => {
          const key = usageDocId(vehicleId, dateISO);
          const list = map.get(key) || [];
          list.push({
            id: booking.id,
            label: bookingLabel(booking),
            status: booking.status || "",
            vehicleStatus: booking.vehicleStatus?.[vehicleId] || "",
          });
          map.set(key, list);
        });
      });
    });

    return map;
  }, [bookings, dayKeys, lookup]);

  const categories = useMemo(() => {
    return Array.from(new Set(vehicles.map((v) => v.category).filter(Boolean))).sort();
  }, [vehicles]);

  const baseVehicles = useMemo(() => {
    let list = vehicles;
    const text = q.trim().toLowerCase();

    if (vehicleFilter !== "all") list = list.filter((v) => v.id === vehicleFilter);
    if (categoryFilter !== "all") list = list.filter((v) => v.category === categoryFilter);
    if (text) {
      list = list.filter((v) =>
        [v.label, v.category, v.reg, v.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(text)
      );
    }

    return list;
  }, [vehicles, q, vehicleFilter, categoryFilter]);

  const vehicleSummaries = useMemo(() => {
    const rows = baseVehicles.map((vehicle) => {
      let bookedDays = 0;
      let notedDays = 0;
      let coveredDays = 0;
      let missingDays = 0;
      const noteCounts = new Map();
      const todayKey = usageDocId(vehicle.id, defaultTo);

      dayKeys.forEach((dateISO) => {
        const key = usageDocId(vehicle.id, dateISO);
        const noteDoc = usageMap.get(key);
        const bookingsForDay = bookingsByCell.get(key) || [];
        const hasNote = Boolean(noteDoc?.note);
        const hasBooking = bookingsForDay.length > 0;

        if (hasBooking) bookedDays += 1;
        if (hasNote) {
          notedDays += 1;
          noteCounts.set(noteDoc.note, (noteCounts.get(noteDoc.note) || 0) + 1);
        }
        if (hasNote || hasBooking) coveredDays += 1;
        if (!hasNote && !hasBooking) missingDays += 1;
      });

      const topNote = Array.from(noteCounts.entries()).sort((a, b) => b[1] - a[1])[0] || null;
      const todayNote = usageMap.get(todayKey);
      const todayBookings = bookingsByCell.get(todayKey) || [];

      return {
        ...vehicle,
        bookedDays,
        notedDays,
        coveredDays,
        missingDays,
        utilisation: percent(coveredDays, dayKeys.length),
        topNote,
        todayNote,
        todayBookings,
      };
    });

    let filtered = rows;
    if (viewFilter === "booked") filtered = filtered.filter((row) => row.bookedDays > 0);
    if (viewFilter === "manual") filtered = filtered.filter((row) => row.notedDays > 0);
    if (viewFilter === "missing") filtered = filtered.filter((row) => row.missingDays > 0);
    if (noteFilter !== "all") {
      filtered = filtered.filter((row) => {
        return dayKeys.some((dateISO) => usageMap.get(usageDocId(row.id, dateISO))?.note === noteFilter);
      });
    }

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label);
      if (sort === "utilHigh") return b.utilisation - a.utilisation || a.label.localeCompare(b.label);
      if (sort === "utilLow") return a.utilisation - b.utilisation || a.label.localeCompare(b.label);
      if (sort === "booked") return b.bookedDays - a.bookedDays || a.label.localeCompare(b.label);
      return b.missingDays - a.missingDays || b.coveredDays - a.coveredDays || a.label.localeCompare(b.label);
    });
  }, [baseVehicles, bookingsByCell, dayKeys, defaultTo, noteFilter, sort, usageMap, viewFilter]);

  const kpis = useMemo(() => {
    const totalSlots = baseVehicles.length * dayKeys.length;
    let bookedSlots = 0;
    let notedSlots = 0;
    let coveredSlots = 0;
    const noteCounts = new Map();
    const todayVehicleIds = new Set();

    baseVehicles.forEach((vehicle) => {
      dayKeys.forEach((dateISO) => {
        const key = usageDocId(vehicle.id, dateISO);
        const noteDoc = usageMap.get(key);
        const bookingsForDay = bookingsByCell.get(key) || [];
        const hasNote = Boolean(noteDoc?.note);
        const hasBooking = bookingsForDay.length > 0;

        if (hasBooking) bookedSlots += 1;
        if (hasNote) {
          notedSlots += 1;
          noteCounts.set(noteDoc.note, (noteCounts.get(noteDoc.note) || 0) + 1);
        }
        if (hasNote || hasBooking) coveredSlots += 1;
        if ((hasNote || hasBooking) && dateISO === defaultTo) todayVehicleIds.add(vehicle.id);
      });
    });

    const busiest = [...vehicleSummaries].sort((a, b) => b.coveredDays - a.coveredDays)[0] || null;
    const topNotes = Array.from(noteCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

    return {
      totalSlots,
      bookedSlots,
      notedSlots,
      coveredSlots,
      missingSlots: Math.max(0, totalSlots - coveredSlots),
      coverage: percent(coveredSlots, totalSlots),
      todayInUse: todayVehicleIds.size,
      busiest,
      topNotes,
    };
  }, [baseVehicles, bookingsByCell, dayKeys, defaultTo, usageMap, vehicleSummaries]);

  const gapsToChase = useMemo(() => {
    const out = [];
    for (const vehicle of vehicleSummaries) {
      for (const dateISO of dayKeys) {
        const key = usageDocId(vehicle.id, dateISO);
        const hasNote = usageMap.get(key)?.note;
        const hasBooking = (bookingsByCell.get(key) || []).length > 0;
        if (!hasNote && !hasBooking) {
          out.push({ vehicle, dateISO });
          if (out.length >= 8) return out;
        }
      }
    }
    return out;
  }, [bookingsByCell, dayKeys, usageMap, vehicleSummaries]);

  const matrixRows = useMemo(() => vehicleSummaries.slice(0, 80), [vehicleSummaries]);

  const openEdit = (vehicleId, dateISO) => {
    const key = usageDocId(vehicleId, dateISO);
    const existing = usageMap.get(key) || null;
    setEditModal({
      vehicleId,
      dateISO,
      note: existing?.note || "",
      otherText: existing?.otherText || "",
      jobId: existing?.jobId || "",
      jobLabel: existing?.jobLabel || "",
    });
  };

  const saveEdit = async () => {
    if (!editModal?.vehicleId || !editModal?.dateISO) return;

    const { vehicleId, dateISO } = editModal;
    const key = usageDocId(vehicleId, dateISO);
    setSavingKey(key);

    try {
      const who = auth?.currentUser?.displayName || auth?.currentUser?.email || "Supervisor";
      const payload = {
        vehicleId,
        dateISO,
        note: String(editModal.note || "").trim(),
        otherText: String(editModal.note || "").trim() === "Other" ? String(editModal.otherText || "").trim() : "",
        jobId: String(editModal.jobId || "").trim(),
        jobLabel: String(editModal.jobLabel || "").trim(),
        updatedAt: serverTimestamp(),
        updatedBy: who,
      };

      const ref = doc(db, USAGE_COLLECTION, key);
      await setDoc(ref, tenantPayload(dataAccessState, payload), { merge: true });
      const fresh = await getDoc(ref);
      const data = fresh.exists() ? fresh.data() : payload;

      setUsageMap((prev) => {
        const next = new Map(prev);
        next.set(key, { id: key, ...data });
        return next;
      });
      setEditModal(null);
    } catch (error) {
      console.error("save usage note error:", error);
      alert("Could not save. Please try again.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        .usage-overview-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowHover} !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        input:focus, select:focus, button:focus, textarea:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: var(--legacy-color-9fb7cf) !important; }
        .usage-kpi-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        .usage-filter-grid {
          display: grid;
          grid-template-columns: minmax(240px, 1.3fr) repeat(6, minmax(145px, 1fr)) auto;
          gap: 10px;
          align-items: end;
        }
        .usage-two-col {
          display: grid;
          grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
          gap: 12px;
          margin-bottom: 12px;
        }
        .usage-matrix-table th {
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .usage-matrix-table th:first-child,
        .usage-matrix-table td:first-child {
          position: sticky;
          left: 0;
          z-index: 3;
          box-shadow: 1px 0 0 var(--legacy-color-eef2f7);
        }
        .usage-matrix-table th:first-child { z-index: 4; }
        @media (max-width: 1320px) {
          .usage-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .usage-filter-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 900px) {
          .usage-kpi-grid, .usage-filter-grid, .usage-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={pageWrap}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <h1 style={title}>Usage Overview</h1>
            <div style={sub}>
              See booked work, manual day notes, missing coverage, and vehicle utilisation in one place.
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="usage-overview-action" style={btn("primary")} onClick={() => router.push("/vehicle-home")}>
              <Truck size={15} />
              Vehicle Home
            </button>
            <button type="button" className="usage-overview-action" style={btn()} onClick={() => router.back()}>
              <ArrowLeft size={15} />
              Back
            </button>
          </div>
        </div>

        <div className="usage-kpi-grid">
          <SummaryCard label="Coverage" value={`${kpis.coverage}%`} sub={`${kpis.coveredSlots} of ${kpis.totalSlots} slots`} icon={Gauge} tone="brand" />
          <SummaryCard label="In Use Today" value={kpis.todayInUse} sub={`${baseVehicles.length} vehicles visible`} icon={Activity} tone="ok" />
          <SummaryCard label="Booked Days" value={kpis.bookedSlots} sub="From job bookings" icon={CalendarDays} tone="booked" />
          <SummaryCard label="Manual Notes" value={kpis.notedSlots} sub="Supervisor day notes" icon={ClipboardList} tone="note" />
          <SummaryCard label="Gaps" value={kpis.missingSlots} sub="No booking or note" icon={AlertTriangle} tone={kpis.missingSlots ? "danger" : "ok"} />
        </div>

        <section style={{ ...card, padding: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <div className="usage-filter-grid">
            <label style={{ position: "relative", display: "block" }}>
              <span style={fieldLabel}>Search</span>
              <Search size={16} style={{ position: "absolute", left: 11, bottom: 11, color: UI.muted }} />
              <input
                style={{ ...input, paddingLeft: 34 }}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Vehicle, reg, category..."
                type="search"
              />
            </label>

            <Field label="From">
              <input type="date" style={input} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </Field>

            <Field label="To">
              <input type="date" style={input} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </Field>

            <Field label="Vehicle">
              <select style={input} value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}>
                <option value="all">All vehicles</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Category">
              <select style={input} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="View">
              <select style={input} value={viewFilter} onChange={(e) => setViewFilter(e.target.value)}>
                <option value="all">All usage</option>
                <option value="booked">Booked only</option>
                <option value="manual">Manual notes</option>
                <option value="missing">Needs coverage</option>
              </select>
            </Field>

            <Field label="Note">
              <select style={input} value={noteFilter} onChange={(e) => setNoteFilter(e.target.value)}>
                <option value="all">Any note</option>
                {NOTE_OPTIONS.map((note) => (
                  <option key={note} value={note}>
                    {note}
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "end" }}>
              <Field label="Sort">
                <select style={input} value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="risk">Gaps first</option>
                  <option value="utilHigh">Usage high to low</option>
                  <option value="utilLow">Usage low to high</option>
                  <option value="booked">Booked days</option>
                  <option value="name">Name A to Z</option>
                </select>
              </Field>
              <button
                type="button"
                className="usage-overview-action"
                style={btn()}
                onClick={() => {
                  setQ("");
                  setVehicleFilter("all");
                  setCategoryFilter("all");
                  setViewFilter("all");
                  setNoteFilter("all");
                  setSort("risk");
                  setFromDate(defaultFrom);
                  setToDate(defaultTo);
                }}
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            <span style={pill(UI.bookedBg, UI.bookedFg, UI.bookedBorder)}>Booked</span>
            <span style={pill(UI.noteBg, UI.noteFg, UI.noteBorder)}>Manual note</span>
            <span style={pill(UI.warnBg, UI.warnFg, UI.warnBorder)}>Booking + note</span>
            <span style={pill("var(--legacy-color-f1f5f9)", UI.text)}>Blank</span>
            <span style={pill("var(--legacy-color-f1f5f9)", UI.text)}>{dayKeys.length} days</span>
            <span style={pill("var(--legacy-color-f1f5f9)", UI.text)}>{vehicleSummaries.length} vehicles shown</span>
          </div>
        </section>

        <section className="usage-two-col">
          <div style={panel}>
            <SectionHeader title="Needs Attention" meta={gapsToChase.length ? "First missing cells in this view" : "All visible slots have coverage"} />
            {loading ? (
              <EmptyLine>Loading usage data...</EmptyLine>
            ) : gapsToChase.length ? (
              <div style={{ display: "grid", gap: "var(--space-2)" }}>
                {gapsToChase.map((item) => (
                  <button
                    key={`${item.vehicle.id}-${item.dateISO}`}
                    type="button"
                    className="usage-overview-action"
                    style={{
                      ...btn(),
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "8px 10px",
                      borderColor: UI.warnBorder,
                      color: UI.text,
                    }}
                    onClick={() => openEdit(item.vehicle.id, item.dateISO)}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.vehicle.label}</span>
                    <span style={{ color: UI.warnFg }}>{fmtDate(item.dateISO)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyLine>No missing usage coverage in the current filters.</EmptyLine>
            )}
          </div>

          <div style={panel}>
            <SectionHeader
              title="Range Breakdown"
              meta={kpis.busiest ? `Busiest: ${kpis.busiest.label} (${kpis.busiest.coveredDays} days)` : "No vehicles in range"}
            />
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {kpis.topNotes.length ? (
                kpis.topNotes.map(([note, count]) => (
                  <span key={note} style={pill(UI.noteBg, UI.noteFg, UI.noteBorder)}>
                    {note}: {count}
                  </span>
                ))
              ) : (
                <span style={pill("var(--legacy-color-f1f5f9)", UI.text)}>No manual notes in this range</span>
              )}
              <span style={pill(UI.bookedBg, UI.bookedFg, UI.bookedBorder)}>Booked days: {kpis.bookedSlots}</span>
              <span style={pill(UI.dangerBg, UI.dangerFg, UI.dangerBorder)}>Gaps: {kpis.missingSlots}</span>
            </div>
          </div>
        </section>

        <section style={{ ...card, overflow: "hidden", marginBottom: "var(--space-3)" }}>
          <div style={{ padding: "var(--space-3)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <SectionHeader title="Vehicle Summary" meta="Sorted by the current priority" />
            <span style={pill("var(--legacy-color-f1f5f9)", UI.text)}>{loading ? "Loading..." : `${vehicleSummaries.length} rows`}</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Vehicle</th>
                  <th style={th}>Category</th>
                  <th style={th}>Today</th>
                  <th style={th}>Coverage</th>
                  <th style={th}>Booked</th>
                  <th style={th}>Notes</th>
                  <th style={th}>Gaps</th>
                  <th style={th}>Top Note</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ ...td, textAlign: "center", color: UI.muted }}>Loading usage...</td>
                  </tr>
                ) : vehicleSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      No vehicles match the current filters.
                    </td>
                  </tr>
                ) : (
                  vehicleSummaries.map((row) => {
                    const todayStatus = row.todayNote?.note
                      ? displayNote(row.todayNote)
                      : row.todayBookings.length
                        ? `${row.todayBookings.length} booking${row.todayBookings.length === 1 ? "" : "s"}`
                        : "No coverage";

                    return (
                      <tr key={row.id}>
                        <td style={td}>
                          <div style={{ fontWeight: 950, color: UI.text }}>{row.label}</div>
                          <div style={{ marginTop: 2, fontSize: "var(--font-size-xs)", color: UI.muted }}>{row.id}</div>
                        </td>
                        <td style={td}>{row.category || "-"}</td>
                        <td style={td}>
                          <span style={row.todayNote?.note ? pill(UI.noteBg, UI.noteFg, UI.noteBorder) : row.todayBookings.length ? pill(UI.bookedBg, UI.bookedFg, UI.bookedBorder) : pill(UI.dangerBg, UI.dangerFg, UI.dangerBorder)}>
                            {todayStatus}
                          </span>
                        </td>
                        <td style={td}>
                          <Progress value={row.utilisation} />
                        </td>
                        <td style={td}>{row.bookedDays}</td>
                        <td style={td}>{row.notedDays}</td>
                        <td style={td}>
                          <span style={row.missingDays ? pill(UI.dangerBg, UI.dangerFg, UI.dangerBorder) : pill(UI.okBg, UI.okFg, UI.okBorder)}>
                            {row.missingDays}
                          </span>
                        </td>
                        <td style={td}>{row.topNote ? `${row.topNote[0]} (${row.topNote[1]})` : "-"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "var(--space-3)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <SectionHeader title="Daily Matrix" meta="Click any cell to add or edit a day note" />
            <span style={pill("var(--legacy-color-f1f5f9)", UI.text)}>
              {matrixRows.length} of {vehicleSummaries.length} vehicles
            </span>
          </div>

          <div style={{ overflow: "auto", maxHeight: 620 }}>
            <table className="usage-matrix-table" style={{ width: "100%", minWidth: Math.max(920, 260 + dayKeys.length * 118), borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 260 }}>Vehicle</th>
                  {dayKeys.map((dateISO) => (
                    <th key={dateISO} style={{ ...th, minWidth: 118, textAlign: "center" }}>
                      {fmtDay(dateISO)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={dayKeys.length + 1} style={{ ...td, textAlign: "center", color: UI.muted }}>Loading usage matrix...</td>
                  </tr>
                ) : matrixRows.length === 0 ? (
                  <tr>
                    <td colSpan={dayKeys.length + 1} style={{ ...td, textAlign: "center", color: UI.muted }}>No matrix rows to show.</td>
                  </tr>
                ) : (
                  matrixRows.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td style={{ ...td, minWidth: 260, background: "var(--color-white)" }}>
                        <div style={{ fontWeight: 950, color: UI.text }}>{vehicle.label}</div>
                        <div style={{ marginTop: 2, fontSize: "var(--font-size-xs)", color: UI.muted }}>{vehicle.category || "-"}</div>
                      </td>
                      {dayKeys.map((dateISO) => {
                        const key = usageDocId(vehicle.id, dateISO);
                        const noteDoc = usageMap.get(key);
                        const bookingsForDay = bookingsByCell.get(key) || [];
                        const hasNote = Boolean(noteDoc?.note);
                        const hasBooking = bookingsForDay.length > 0;
                        const tone = hasNote && hasBooking
                          ? { bg: UI.warnBg, fg: UI.warnFg, border: UI.warnBorder }
                          : hasNote
                            ? { bg: UI.noteBg, fg: UI.noteFg, border: UI.noteBorder }
                            : hasBooking
                              ? { bg: UI.bookedBg, fg: UI.bookedFg, border: UI.bookedBorder }
                              : { bg: "var(--color-white)", fg: UI.muted, border: "var(--legacy-color-e5eaf1)" };
                        const label = hasNote ? noteShort(noteDoc) : hasBooking ? `${bookingsForDay.length} booking${bookingsForDay.length === 1 ? "" : "s"}` : "-";
                        const titleText = hasNote
                          ? displayNote(noteDoc)
                          : hasBooking
                            ? bookingsForDay.map((booking) => booking.label).join("\n")
                            : "No booking or note";

                        return (
                          <td key={dateISO} style={{ ...td, textAlign: "center", padding: 7 }}>
                            <button
                              type="button"
                              title={titleText}
                              onClick={() => openEdit(vehicle.id, dateISO)}
                              style={{
                                width: "100%",
                                minHeight: 34,
                                borderRadius: "var(--radius-md)",
                                border: `1px solid ${tone.border}`,
                                background: tone.bg,
                                color: tone.fg,
                                fontSize: 11.5,
                                fontWeight: 900,
                                cursor: "pointer",
                                padding: "5px 6px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {label}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.36)",
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: "var(--space-4)",
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: "min(94vw, 640px)",
              background: "var(--color-white)",
              border: UI.border,
              borderRadius: UI.radius,
              boxShadow: "0 24px 70px rgba(15,23,42,0.22)",
              padding: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950, color: UI.text }}>Set Day Note</div>
                <div style={{ marginTop: "var(--space-1)", fontSize: 12.5, color: UI.muted }}>
                  {fmtDate(editModal.dateISO)} - {vehicles.find((vehicle) => vehicle.id === editModal.vehicleId)?.label || editModal.vehicleId}
                </div>
              </div>
              <button type="button" className="usage-overview-action" style={btn()} onClick={() => setEditModal(null)}>
                <X size={14} />
                Close
              </button>
            </div>

            <div style={{ height: 1, background: "var(--legacy-color-e5eaf1)", margin: "14px 0" }} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-3)" }}>
              <Field label="Note">
                <select
                  style={input}
                  value={editModal.note}
                  onChange={(e) => setEditModal((modal) => ({ ...modal, note: e.target.value }))}
                >
                  <option value="">No note</option>
                  {NOTE_OPTIONS.map((note) => (
                    <option key={note} value={note}>
                      {note}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Job label">
                <input
                  style={input}
                  value={editModal.jobLabel}
                  onChange={(e) => setEditModal((modal) => ({ ...modal, jobLabel: e.target.value }))}
                  placeholder="Optional booking or job label"
                />
              </Field>

              {editModal.note === "Other" ? (
                <Field label="Other note">
                  <input
                    style={input}
                    value={editModal.otherText}
                    onChange={(e) => setEditModal((modal) => ({ ...modal, otherText: e.target.value }))}
                    placeholder="Prep, repair, bodyshop..."
                  />
                </Field>
              ) : null}

              <Field label="Job ID">
                <input
                  style={input}
                  value={editModal.jobId}
                  onChange={(e) => setEditModal((modal) => ({ ...modal, jobId: e.target.value }))}
                  placeholder="Optional Firestore id"
                />
              </Field>
            </div>

            <div style={{ marginTop: "var(--space-3)", fontSize: 12.5, lineHeight: 1.5, color: UI.muted }}>
              Leave note as <b>No note</b> to clear the visible cell. Existing job text is kept unless you clear it.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: 14, flexWrap: "wrap" }}>
              <button type="button" className="usage-overview-action" style={btn()} onClick={() => setEditModal(null)} disabled={!!savingKey}>
                Cancel
              </button>
              <button type="button" className="usage-overview-action" style={btn("primary")} onClick={saveEdit} disabled={!!savingKey}>
                <Save size={14} />
                {savingKey ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </HeaderSidebarLayout>
  );
}

const fieldLabel = {
  display: "block",
  marginBottom: "var(--space-1)",
  color: UI.muted,
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0,
};

function Field({ label, children }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({ title: sectionTitle, meta }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: UI.text, fontSize: 15, fontWeight: 950 }}>{sectionTitle}</div>
      {meta ? <div style={{ marginTop: 3, color: UI.muted, fontSize: 12.5 }}>{meta}</div> : null}
    </div>
  );
}

function EmptyLine({ children }) {
  return <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", padding: "10px 0" }}>{children}</div>;
}

function Progress({ value }) {
  const tone = value >= 80 ? { bg: UI.okBg, fg: UI.okFg, fill: "var(--legacy-color-16a34a)" } : value >= 45 ? { bg: UI.warnBg, fg: UI.warnFg, fill: "var(--legacy-color-f59e0b)" } : { bg: UI.dangerBg, fg: UI.dangerFg, fill: "var(--legacy-color-ef4444)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 150 }}>
      <div style={{ height: 8, flex: 1, borderRadius: "var(--radius-pill)", background: tone.bg, overflow: "hidden", border: "1px solid var(--legacy-color-e5eaf1)" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: tone.fill }} />
      </div>
      <span style={{ minWidth: 38, textAlign: "right", color: tone.fg, fontSize: "var(--font-size-xs)", fontWeight: 950 }}>{value}%</span>
    </div>
  );
}

function SummaryCard({ label, value, sub: summary, icon: Icon, tone = "brand" }) {
  const tones = {
    brand: { bg: UI.brandSoft, fg: UI.brand, border: UI.brandBorder },
    ok: { bg: UI.okBg, fg: UI.okFg, border: UI.okBorder },
    danger: { bg: UI.dangerBg, fg: UI.dangerFg, border: UI.dangerBorder },
    booked: { bg: UI.bookedBg, fg: UI.bookedFg, border: UI.bookedBorder },
    note: { bg: UI.noteBg, fg: UI.noteFg, border: UI.noteBorder },
  };
  const toneStyles = tones[tone] || tones.brand;

  return (
    <div style={{ ...panel, minHeight: 82, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
      <div>
        <div style={{ color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
          {label}
        </div>
        <div style={{ marginTop: "var(--space-1)", color: UI.text, fontSize: 24, lineHeight: 1, fontWeight: 950 }}>{value}</div>
        <div style={{ marginTop: 6, color: UI.muted, fontSize: 12.5, fontWeight: 700 }}>{summary}</div>
      </div>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--radius-md)",
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
