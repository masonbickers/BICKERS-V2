"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
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

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
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
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
};
const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});
const card = {
  ...surface,
  padding: 16,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: "#dbeafe" };

const mono = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

/* ───────────────────────────────────────────
   Helpers
─────────────────────────────────────────── */
const norm = (s = "") => String(s || "").toLowerCase().trim();

const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate(); // Firestore Timestamp

    // ✅ safer parse for YYYY-MM-DD (avoid BST off-by-one)
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T00:00:00.000Z`);
    }

    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const fmtDDMMYY = (d) => {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const isoDay = (d) => {
  if (!d) return "";
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
};

const normaliseJobDates = (job) => {
  // Prefer bookingDates array of "YYYY-MM-DD"
  const out = [];
  if (Array.isArray(job?.bookingDates) && job.bookingDates.length) {
    for (const x of job.bookingDates) {
      const d = parseDate(x);
      if (d) out.push(d);
    }
  } else if (job?.startDate && job?.endDate) {
    const sd = parseDate(job.startDate);
    const ed = parseDate(job.endDate);
    if (sd && ed) {
      const cursor = new Date(sd);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(ed);
      end.setHours(0, 0, 0, 0);
      while (cursor.getTime() <= end.getTime()) {
        out.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (sd) out.push(sd);
  } else if (job?.date) {
    const d = parseDate(job.date);
    if (d) out.push(d);
  } else if (job?.startDate) {
    const d = parseDate(job.startDate);
    if (d) out.push(d);
  }

  const seen = new Set();
  return out
    .map((d) => {
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      return dd;
    })
    .filter((d) => {
      const k = d.toISOString().slice(0, 10);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a - b);
};

const isFourDigitJob = (job) => /^\d{4}$/.test(String(job?.jobNumber ?? "").trim());

const prettifyStatus = (raw) => {
  const s = norm(raw);
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  if (s === "dnh") return "DNH";
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("postpon")) return "Postponed";
  if (s.includes("lost")) return "Lost";
  if (s.includes("maintenance")) return "Maintenance";
  if (s.includes("holiday")) return "Holiday";
  if (s.includes("enquiry") || s.includes("inquiry")) return "Enquiry";
  return (
    s
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC"
  );
};

const statusColors = (label) => {
  switch (label) {
    case "Ready to Invoice":
      return { bg: "#fef3c7", border: "#fde68a", text: "#92400e" };
    case "Invoiced":
      return { bg: "#e0e7ff", border: "#c7d2fe", text: "#3730a3" };
    case "Paid":
      return { bg: "#d1fae5", border: "#86efac", text: "#065f46" };
    case "Action Required":
      return { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" };
    case "Complete":
      return { bg: "#dbeafe", border: "#bfdbfe", text: "#1e3a8a" };
    case "Confirmed":
      return { bg: "#fffd98", border: "#c7d134", text: "#504c1a" };
    case "First Pencil":
      return { bg: "#e0f2fe", border: "#bae6fd", text: "#075985" };
    case "Second Pencil":
      return { bg: "#fee2e2", border: "#fecaca", text: "#7f1d1d" };
    case "Cancelled":
      return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };
    case "Enquiry":
      return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };
    case "TBC":
      return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };
    default:
      return { bg: "#e5e7eb", border: "#d1d5db", text: "#111827" };
  }
};

const StatusBadge = ({ value }) => {
  const c = statusColors(value);
  return (
    <span
      style={{
        padding: "6px 10px",
        fontSize: 11,
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
};

const clampTopN = (entries, n = 8) =>
  [...entries].sort((a, b) => (b?.[1] || 0) - (a?.[1] || 0)).slice(0, n);

const inc = (map, key, by = 1) => {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + by);
};

const yyyymm = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

const toCrewNames = (employees) => {
  if (!Array.isArray(employees)) return [];
  return employees
    .map((e) => {
      if (!e) return "";
      if (typeof e === "string") return e;
      if (typeof e === "object")
        return e.name || [e.firstName, e.lastName].filter(Boolean).join(" ") || e.email || "";
      return "";
    })
    .map((s) => String(s || "").trim())
    .filter(Boolean);
};

const toVehicleTokens = (vehicles) => {
  if (!Array.isArray(vehicles)) return [];
  return vehicles
    .map((v) => {
      if (!v) return "";
      if (typeof v === "string") return v.trim();
      if (typeof v === "object") {
        const name = v.name || [v.manufacturer, v.model].filter(Boolean).join(" ").trim();
        const reg = v.registration ? String(v.registration).toUpperCase() : "";
        return reg ? `${name} – ${reg}` : name || "";
      }
      return "";
    })
    .filter(Boolean);
};

const toEquipmentTokens = (equipment) => {
  if (!equipment) return [];
  if (Array.isArray(equipment)) return equipment.map((x) => String(x || "").trim()).filter(Boolean);
  if (typeof equipment === "string") return [equipment.trim()].filter(Boolean);
  return [];
};

/* ───────────────────────────────────────────
   Hotel helpers (✅ updated: paidBy support)
─────────────────────────────────────────── */
const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/[£$,]/g, "").replace(/\s+/g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};
const int = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
};
const gbp = (v) =>
  `£${(Number.isFinite(v) ? v : 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Pull hotel info robustly from different field names
const getHotelForJob = (job = {}) => {
  const hasHotelFlag = !!job.hasHotel || !!job.hotel || !!job.hotelRequired;

  const paidByRaw = String(job.hotelPaidBy ?? job.hotelPaid ?? job.hotelPayer ?? "").trim();
  const paidBy = paidByRaw || "Unknown";
  const isProductionPaid = paidBy.toLowerCase() === "production";

  const costPerNight = num(
    job.hotelCostPerNight ??
      job.hotelRate ??
      job.hotelCost ??
      job.hotelPricePerNight ??
      job.hotelAmountPerNight ??
      0
  );

  const nights = int(job.hotelNights ?? job.nights ?? job.hotelQty ?? job.hotelNumberOfNights ?? 0);

  // Prefer explicit total if present
  let total = num(job.hotelTotal ?? job.hotelTotalCost ?? job.hotelCostTotal ?? 0);
  if (!total && costPerNight && nights) total = costPerNight * nights;

  // If hasHotel is true but we have no numbers, still count it as a hotel job
  const hasAnyNumber = costPerNight > 0 || nights > 0 || total > 0;

  return {
    hasHotel: hasHotelFlag || hasAnyNumber,
    paidBy,
    isProductionPaid,
    costPerNight,
    nights,
    // ✅ analytics total: exclude production-paid spend
    total: isProductionPaid ? 0 : total,
    // optional: raw total if you ever want to show "production-paid total"
    rawTotal: total,
  };
};

/* ───────────────────────────────────────────
   Shoot-day detection (robust to different schemas)
─────────────────────────────────────────── */
const getNoteForISODate = (job, iso) => {
  if (!job || !iso) return "";

  const direct =
    (job.notesByDate && job.notesByDate[iso]) ||
    (job.dayNotes && job.dayNotes[iso]) ||
    (job.noteByDate && job.noteByDate[iso]) ||
    "";

  if (direct) return String(direct);

  const scanArrays = (arr) => {
    if (!Array.isArray(arr)) return "";
    const hit = arr.find((x) => {
      const d = x?.date || x?.day || x?.iso || "";
      return String(d).slice(0, 10) === iso;
    });
    return hit ? String(hit.note || hit.value || hit.label || "") : "";
  };

  const a = scanArrays(job.notesForEachDay) || scanArrays(job.dailyNotes) || scanArrays(job.notesPerDay) || "";
  if (a) return a;

  return String(job.noteForDay || job.note || "");
};

const isShootNote = (note) => {
  const s = norm(note);
  if (!s) return false;
  if (s === "on set" || s.includes("on set")) return true;
  if (s === "night shoot" || s.includes("night shoot")) return true;
  if (s.includes("shoot day")) return true;
  if (s === "shoot") return true;
  return false;
};

const shouldCountShootFromStatus = (prettyStatus) => {
  const s = norm(prettyStatus);
  if (s.includes("cancel")) return false;
  if (s.includes("lost")) return false;
  if (s.includes("postpon")) return false;
  if (s === "dnh") return false;
  return true;
};

/* ───────────────────────────────────────────
   Minimal BarChart (no external libs)
─────────────────────────────────────────── */
function BarChart({ title, subtitle, data = [], rightLabel = "Count", valueFormatter }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  return (
    <div style={{ ...surface, padding: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          {subtitle ? <div style={{ color: UI.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</div> : null}
        </div>
        <div style={{ ...chip }}>{rightLabel}</div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {data.length ? (
          data.map((row) => (
            <div
              key={row.label}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 90px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  color: UI.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  background: "#eef2ff",
                  border: "1px solid #e5e7eb",
                  height: 12,
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, (row.value / max) * 100)}%`,
                    height: "100%",
                    background: UI.brand,
                  }}
                />
              </div>
              <div style={{ textAlign: "right", fontWeight: 900, fontSize: 13 }}>
                {valueFormatter ? valueFormatter(row.value) : row.value}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: UI.muted, fontSize: 13 }}>No data.</div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   Page: Statistics
   Route suggestion: /statistics
─────────────────────────────────────────── */
export default function StatisticsPage() {
  const [bookings, setBookings] = useState([]);
  const [deletedBookings, setDeletedBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  const [rangeMode, setRangeMode] = useState("12m"); // 30d | 90d | 12m | all
  const [statusFilter, setStatusFilter] = useState("All");

  // Live bookings
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Live deletedBookings (optional but useful for analytics)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "deletedBookings"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setDeletedBookings(list);
    });
    return () => unsub();
  }, []);

  // Load vehicles once (for ID->name/reg resolution)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "vehicles"));
        if (!mounted) return;
        setVehicles(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const rangeStart = useMemo(() => {
    if (rangeMode === "all") return null;
    const d = new Date(todayMidnight);
    if (rangeMode === "30d") d.setDate(d.getDate() - 30);
    if (rangeMode === "90d") d.setDate(d.getDate() - 90);
    if (rangeMode === "12m") d.setFullYear(d.getFullYear() - 1);
    return d;
  }, [rangeMode, todayMidnight]);

  // Only 4-digit jobs (same as your jobs home)
  const jobsAll = useMemo(() => bookings.filter(isFourDigitJob), [bookings]);

  // Resolve vehicle strings to name+reg (handles id, registration, or name)
  const resolveVehicleLabel = (token) => {
    const needle = String(token || "").trim();
    if (!needle) return "";
    const byId = vehicles.find((v) => v.id === needle);
    if (byId) {
      const name = byId.name || [byId.manufacturer, byId.model].filter(Boolean).join(" ").trim() || "Vehicle";
      const reg = byId.registration ? String(byId.registration).toUpperCase() : "";
      return reg ? `${name} – ${reg}` : name;
    }
    const byReg = vehicles.find((v) => String(v.registration || "").trim().toUpperCase() === needle.toUpperCase());
    if (byReg) {
      const name = byReg.name || [byReg.manufacturer, byReg.model].filter(Boolean).join(" ").trim() || "Vehicle";
      const reg = byReg.registration ? String(byReg.registration).toUpperCase() : "";
      return reg ? `${name} – ${reg}` : name;
    }
    const byName = vehicles.find((v) => String(v.name || "").trim().toLowerCase() === needle.toLowerCase());
    if (byName) {
      const name = byName.name || [byName.manufacturer, byName.model].filter(Boolean).join(" ").trim() || "Vehicle";
      const reg = byName.registration ? String(byName.registration).toUpperCase() : "";
      return reg ? `${name} – ${reg}` : name;
    }
    return needle;
  };

  const jobsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobsAll.filter((j) => {
      const prettyStatus = prettifyStatus(j.status || "");
      if (statusFilter !== "All" && prettyStatus !== statusFilter) return false;

      const days = normaliseJobDates(j);
      if (rangeStart) {
        const anyInRange = days.some((d) => d.getTime() >= rangeStart.getTime());
        const created = parseDate(j.createdAt);
        const createdInRange = created ? created.getTime() >= rangeStart.getTime() : false;
        if (!anyInRange && !createdInRange) return false;
      }

      if (!q) return true;

      const hay = [
        j.id,
        j.jobNumber,
        j.client,
        j.location,
        j.notes,
        prettyStatus,
        ...(toCrewNames(j.employees) || []),
        ...(toVehicleTokens(j.vehicles) || []),
        ...(toEquipmentTokens(j.equipment) || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [jobsAll, search, statusFilter, rangeStart]);

  const allPrettyStatuses = useMemo(() => {
    const set = new Set();
    for (const j of jobsAll) set.add(prettifyStatus(j.status || ""));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [jobsAll]);

  /* ───────────────────────────────────────────
     Core analytics
  ──────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const totalJobs = jobsFiltered.length;

    let totalDays = 0;
    let upcomingJobs = 0;
    let completedJobs = 0;
    let cancelledJobs = 0;
    let actionJobs = 0;
    let missingHS = 0;
    let missingRA = 0;

    const now = todayMidnight.getTime();

    for (const j of jobsFiltered) {
      const ds = normaliseJobDates(j);
      totalDays += ds.length;

      const pretty = prettifyStatus(j.status || "");
      if (pretty === "Complete") completedJobs++;
      if (pretty === "Cancelled") cancelledJobs++;
      if (pretty === "Action Required") actionJobs++;

      const anyFutureOrToday = ds.some((d) => d.getTime() >= now);
      if (anyFutureOrToday) upcomingJobs++;

      if (j.hasHS === false) missingHS++;
      if (j.hasRiskAssessment === false) missingRA++;
    }

    const deletedTotal = deletedBookings.length;
    const restoredTotal = deletedBookings.filter((d) => !!d?.restoredAt).length;

    return {
      totalJobs,
      totalDays,
      upcomingJobs,
      completedJobs,
      cancelledJobs,
      actionJobs,
      missingHS,
      missingRA,
      deletedTotal,
      restoredTotal,
    };
  }, [jobsFiltered, deletedBookings, todayMidnight]);

  const statusBreakdown = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) inc(m, prettifyStatus(j.status || ""), 1);
    return clampTopN(m.entries(), 50).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const jobsByMonth = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) {
      const ds = normaliseJobDates(j);
      for (const d of ds) inc(m, yyyymm(d), 1);
    }
    const entries = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return entries.slice(-12).map(([label, value]) => ({ label: monthLabel(label), value }));
  }, [jobsFiltered]);

  // Shoot days per month
  const shootDaysByMonth = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) {
      const pretty = prettifyStatus(j.status || "");
      if (!shouldCountShootFromStatus(pretty)) continue;

      const ds = normaliseJobDates(j);
      for (const d of ds) {
        const iso = isoDay(d);
        const note = getNoteForISODate(j, iso);
        if (isShootNote(note)) inc(m, yyyymm(d), 1);
      }
    }
    const entries = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return entries.slice(-12).map(([label, value]) => ({ label: monthLabel(label), value }));
  }, [jobsFiltered]);

  const shootKpis = useMemo(() => {
    const monthKeyNow = yyyymm(todayMidnight);

    let totalShootDays = 0;
    const monthMap = new Map();

    for (const j of jobsFiltered) {
      const pretty = prettifyStatus(j.status || "");
      if (!shouldCountShootFromStatus(pretty)) continue;

      const ds = normaliseJobDates(j);
      for (const d of ds) {
        const iso = isoDay(d);
        const note = getNoteForISODate(j, iso);
        if (!isShootNote(note)) continue;
        totalShootDays += 1;
        inc(monthMap, yyyymm(d), 1);
      }
    }

    const thisMonth = monthMap.get(monthKeyNow) || 0;
    const monthsWithData = [...monthMap.keys()];
    const denom = Math.max(1, monthsWithData.length);
    const avgPerMonth = Math.round((totalShootDays / denom) * 10) / 10;

    return { totalShootDays, thisMonth, avgPerMonth, monthsWithDataCount: monthsWithData.length };
  }, [jobsFiltered, todayMidnight]);

  /* ✅ UPDATED: Hotel KPIs + hotel cost per month (paidBy aware) */
  const hotelStats = useMemo(() => {
    let hotelJobs = 0;
    let hotelNights = 0;

    // Cost totals ONLY include non-production-paid (Bickers/Unknown)
    let totalHotelCost = 0;

    // Optional splits (useful context)
    let productionPaidHotelJobs = 0;
    let productionPaidHotelNights = 0;

    const monthCost = new Map(); // yyyy-mm -> £ (non-production-paid only)
    const monthNights = new Map(); // nights for non-production-paid only

    for (const j of jobsFiltered) {
      const h = getHotelForJob(j);
      if (!h.hasHotel) continue;

      hotelJobs += 1;
      hotelNights += h.nights || 0;

      if (h.isProductionPaid) {
        productionPaidHotelJobs += 1;
        productionPaidHotelNights += h.nights || 0;
      }

      // Only count spend if NOT production paid
      totalHotelCost += h.total || 0;

      // Assign hotel cost to month of FIRST job date (simple/consistent)
      const ds = normaliseJobDates(j);
      const anchor = ds[0] || parseDate(j.startDate) || parseDate(j.date) || parseDate(j.createdAt) || null;
      if (anchor && !h.isProductionPaid) {
        const key = yyyymm(anchor);
        if (h.total) inc(monthCost, key, h.total);
        if (h.nights) inc(monthNights, key, h.nights);
      }
    }

    const payableHotelJobs = hotelJobs - productionPaidHotelJobs;
    const payableHotelNights = hotelNights - productionPaidHotelNights;

    const avgPerHotelJob = payableHotelJobs ? totalHotelCost / payableHotelJobs : 0;
    const avgPerNight = payableHotelNights ? totalHotelCost / payableHotelNights : 0;

    const monthKeyNow = yyyymm(todayMidnight);
    const thisMonthCost = monthCost.get(monthKeyNow) || 0;
    const thisMonthNights = monthNights.get(monthKeyNow) || 0;

    // Last 12 months series
    const entries = [...monthCost.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const costSeries = entries.slice(-12).map(([ym, value]) => ({ label: monthLabel(ym), value }));

    return {
      hotelJobs,
      hotelNights,
      totalHotelCost,
      avgPerHotelJob,
      avgPerNight,
      thisMonthCost,
      thisMonthNights,
      costSeries,
      productionPaidHotelJobs,
      productionPaidHotelNights,
      payableHotelJobs,
      payableHotelNights,
    };
  }, [jobsFiltered, todayMidnight]);

  const topClients = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) inc(m, (j.client || "—").trim(), 1);
    return clampTopN(m.entries(), 8).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const topLocations = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) inc(m, (j.location || "—").trim(), 1);
    return clampTopN(m.entries(), 8).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const topCrew = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) for (const n of toCrewNames(j.employees)) inc(m, n, 1);
    return clampTopN(m.entries(), 10).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const topEquipment = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) for (const e of toEquipmentTokens(j.equipment)) inc(m, e, 1);
    return clampTopN(m.entries(), 10).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered]);

  const topVehicles = useMemo(() => {
    const m = new Map();
    for (const j of jobsFiltered) {
      const vs = Array.isArray(j.vehicles) ? j.vehicles : [];
      for (const v of vs) {
        const label =
          typeof v === "string"
            ? resolveVehicleLabel(v)
            : resolveVehicleLabel(v?.id || v?.registration || v?.name || "");
        inc(m, label, 1);
      }
    }
    return clampTopN(m.entries(), 10).map(([label, value]) => ({ label, value }));
  }, [jobsFiltered, vehicles]);

  const upcomingNext = useMemo(() => {
    const now = todayMidnight.getTime();
    const list = jobsFiltered
      .map((j) => {
        const ds = normaliseJobDates(j);
        const next = ds.find((d) => d.getTime() >= now) || null;
        return { j, next };
      })
      .filter((x) => !!x.next)
      .sort((a, b) => a.next.getTime() - b.next.getTime())
      .slice(0, 8)
      .map((x) => x.j);

    return list;
  }, [jobsFiltered, todayMidnight]);

  const jobRow = (j) => {
    const ds = normaliseJobDates(j);
    const first = ds[0] || null;
    const last = ds[ds.length - 1] || null;

    const datesLabel =
      first && last ? `${fmtDDMMYY(first)} – ${fmtDDMMYY(last)}` : first ? fmtDDMMYY(first) : "TBC";

    const pretty = prettifyStatus(j.status || "");

    return (
      <Link
        key={j.id}
        href={`/job-numbers/${j.id}`}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px,1fr) 160px 120px auto",
          gap: 10,
          padding: "10px 12px",
          borderTop: "1px solid #f1f5f9",
          textDecoration: "none",
          color: UI.text,
        }}
      >
        <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          #{j.jobNumber || j.id} • {j.client || "—"}
        </div>
        <div style={{ color: UI.muted, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {j.location || "—"}
        </div>
        <div style={{ fontSize: 13, whiteSpace: "nowrap" }}>{datesLabel}</div>
        <div style={{ justifySelf: "end" }}>
          <StatusBadge value={pretty} />
        </div>
      </Link>
    );
  };

  const navCard = (href, title, subtitle, pillTxt) => (
    <Link
      href={href}
      style={card}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, card)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        <span style={{ ...chip }}>{pillTxt}</span>
      </div>
      <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{subtitle}</div>
      <div style={{ marginTop: 10, fontWeight: 800, color: UI.brand }}>Open →</div>
    </Link>
  );

  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
    gap: UI.gap,
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Statistics</h1>
            <div style={sub}>
              Operational analytics (jobs, days, status, vehicles, crew). Dates shown as <b>dd/mm/yy</b>.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ ...chip }}>{loading ? "Loading…" : `${jobsAll.length} jobs`}</div>
            <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe" }}>
              Filtered: <b style={{ marginLeft: 6 }}>{jobsFiltered.length}</b>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ ...surface, padding: 14, marginBottom: UI.gap }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                style={{ position: "absolute", left: 10, top: 10, width: 18, height: 18, opacity: 0.6 }}
                aria-hidden
              >
                <path
                  d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search job #, client, location, notes, crew, vehicle…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 36px",
                  borderRadius: UI.radiusSm,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  outline: "none",
                  background: "#fff",
                }}
              />
            </div>

            <select
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: UI.radiusSm,
                border: "1px solid #d1d5db",
                fontSize: 14,
                outline: "none",
                background: "#fff",
                fontWeight: 800,
                color: UI.text,
              }}
            >
              <option value="30d">Range: last 30 days</option>
              <option value="90d">Range: last 90 days</option>
              <option value="12m">Range: last 12 months</option>
              <option value="all">Range: all time</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: UI.radiusSm,
                border: "1px solid #d1d5db",
                fontSize: 14,
                outline: "none",
                background: "#fff",
                fontWeight: 800,
                color: UI.text,
              }}
            >
              {allPrettyStatuses.map((s) => (
                <option key={s} value={s}>
                  Status: {s}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 10, color: UI.muted, fontSize: 12 }}>
            Tip: click any preview job row to open its job page. Vehicle counts resolve to <b>Name – REG</b> where possible.
          </div>
        </div>

        {/* Shortcut tiles */}
        <div style={{ marginBottom: UI.gap }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Shortcuts</div>
            <div style={{ color: UI.muted, fontSize: 12 }}>Jump into related pages</div>
          </div>
          <div style={grid(4)}>
            {navCard("/job-sheet", "Job Sheet", "All jobs table", `${jobsAll.length}`)}
            {navCard("/review-queue", "Review Queue", "Ops review stage", "Open →")}
            {navCard("/finance-queue", "Ready to Invoice", "Finance queue", "Open →")}
            {navCard("/deleted-bookings", "Deleted Bookings", "Restore / purge", `${deletedBookings.length}`)}
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ marginBottom: UI.gap }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>At a glance</div>
            <div style={{ color: UI.muted, fontSize: 12 }}>
              Range start: <span style={mono}>{rangeStart ? fmtDDMMYY(rangeStart) : "All time"}</span>
            </div>
          </div>

          <div style={kpiGrid}>
            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Jobs</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.totalJobs}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Filtered</div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Booking days</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.totalDays}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Sum of dates</div>
            </div>

            <div style={{ ...card, padding: 12, borderColor: "#dbeafe" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Shoot days / month</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{shootKpis.avgPerMonth}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                Avg across <b>{shootKpis.monthsWithDataCount}</b> month(s) • This month: <b>{shootKpis.thisMonth}</b>
              </div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Upcoming</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.upcomingJobs}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Has date ≥ today</div>
            </div>

            {/* ✅ UPDATED: Hotel cost excludes Production-paid */}
            <div style={{ ...card, padding: 12, borderColor: "#e9d5ff" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Hotel cost (payable)</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{gbp(hotelStats.totalHotelCost)}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                {hotelStats.payableHotelJobs} job(s) • {hotelStats.payableHotelNights} night(s)
              </div>
            </div>

            {/* ✅ UPDATED: Avg hotel / night payable */}
            <div style={{ ...card, padding: 12, borderColor: "#e9d5ff" }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Avg hotel / night (payable)</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{gbp(hotelStats.avgPerNight)}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                This month: <b>{gbp(hotelStats.thisMonthCost)}</b> ({hotelStats.thisMonthNights} nights)
              </div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Complete</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.completedJobs}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Status = Complete</div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Needs action</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.actionJobs}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Status = Action Required</div>
            </div>

            <div style={{ ...card, padding: 12 }}>
              <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Deleted</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{kpis.deletedTotal}</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Deleted bookings</div>
            </div>
          </div>

          <div style={{ ...surface, padding: 12, marginTop: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...chip, background: "#fff7ed" }}>
                Missing HS: <b style={{ marginLeft: 6 }}>{kpis.missingHS}</b>
              </span>
              <span style={{ ...chip, background: "#fff7ed" }}>
                Missing RA: <b style={{ marginLeft: 6 }}>{kpis.missingRA}</b>
              </span>
              <span style={{ ...chip, background: "#f3f4f6" }}>
                Cancelled: <b style={{ marginLeft: 6 }}>{kpis.cancelledJobs}</b>
              </span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe" }}>
                Shoot days (total): <b style={{ marginLeft: 6 }}>{shootKpis.totalShootDays}</b>
              </span>
              <span style={{ ...chip, background: "#f3e8ff", borderColor: "#e9d5ff" }}>
                Avg hotel / job (payable): <b style={{ marginLeft: 6 }}>{gbp(hotelStats.avgPerHotelJob)}</b>
              </span>
              {/* ✅ NEW tiny split line (keeps rest the same, just more clarity) */}
              <span style={{ ...chip, background: "#f3e8ff", borderColor: "#e9d5ff" }}>
                Production-paid: <b style={{ marginLeft: 6 }}>{hotelStats.productionPaidHotelNights}</b> nights
              </span>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart
            title="Booking days per month"
            subtitle="Counts each date in bookingDates as a day"
            data={jobsByMonth}
            rightLabel="Days"
          />
          <BarChart
            title="Shoot days per month"
            subtitle="Counts days where the per-day note is On Set / Night Shoot"
            data={shootDaysByMonth}
            rightLabel="Shoot"
          />
        </div>

        {/* ✅ UPDATED: Hotel cost chart shows payable only */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart
            title="Hotel cost per month (payable)"
            subtitle="Excludes Production-paid; uses hotelTotal, else costPerNight × nights"
            data={hotelStats.costSeries}
            rightLabel="£"
            valueFormatter={(v) => gbp(v)}
          />
          <BarChart
            title="Status breakdown"
            subtitle="Filtered set"
            data={statusBreakdown.slice(0, 10)}
            rightLabel="Jobs"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart title="Top vehicles" subtitle="Resolved to Name – REG where possible" data={topVehicles} rightLabel="Jobs" />
          <BarChart title="Top crew" subtitle="From booking.employees" data={topCrew} rightLabel="Bookings" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart title="Top clients" subtitle="Production / client" data={topClients} rightLabel="Jobs" />
          <BarChart title="Top locations" subtitle="Location field" data={topLocations} rightLabel="Jobs" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap, marginBottom: UI.gap }}>
          <BarChart title="Top equipment" subtitle="From booking.equipment" data={topEquipment} rightLabel="Mentions" />
          <div style={{ ...surface, padding: 14, minHeight: 220 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Hotel stat rules</div>
            <div style={{ color: UI.muted, fontSize: 13, lineHeight: 1.5 }}>
              We treat a booking as having a hotel if <span style={mono}>hasHotel</span> is true, or if we can find any
              of: <span style={mono}>hotelTotal</span>, <span style={mono}>hotelCostPerNight</span>,{" "}
              <span style={mono}>hotelNights</span> (plus common aliases).
              <br />
              <br />
              If <span style={mono}>hotelPaidBy</span> is <b>Production</b>, we still count hotel jobs/nights, but we{" "}
              <b>exclude the £ cost</b> from payable totals and charts.
              <br />
              <br />
              Monthly hotel cost is assigned to the month of the job’s <b>first date</b> (simple & consistent).
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: UI.gap }}>
          {/* Upcoming preview */}
          <div style={{ ...surface, padding: 14, minHeight: 220 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Next up</div>
              <Link
                href="/job-sheet?section=Upcoming"
                style={{ fontSize: 13, fontWeight: 800, color: UI.brand, textDecoration: "none" }}
              >
                View all →
              </Link>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>Loading…</div>
              ) : upcomingNext.length ? (
                upcomingNext.map(jobRow)
              ) : (
                <div style={{ padding: 12, color: UI.muted, fontSize: 13 }}>No upcoming jobs in current filters.</div>
              )}
            </div>
          </div>

          {/* Quick explainer */}
          <div style={{ ...surface, padding: 14, minHeight: 220 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>How “shoot days” are counted</div>
            <div style={{ color: UI.muted, fontSize: 13, lineHeight: 1.5 }}>
              We count a day as a <b>shoot day</b> when the booking has a per-day note of <b>On Set</b> or{" "}
              <b>Night Shoot</b> (from <span style={mono}>notesByDate / dayNotes / notesForEachDay / noteForDay</span>).
              <br />
              <br />
              We exclude obvious dead statuses (Cancelled / Lost / Postponed / DNH) from shoot-day counting.
            </div>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
