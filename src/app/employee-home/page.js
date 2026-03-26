"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
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

/* ───────────────────────────────────────────
   Mini design system (matches Jobs Home)
─────────────────────────────────────────── */
const UI = {
  radius: 18,
  radiusSm: 12,
  gap: 14,
  shadowSm: "0 12px 32px rgba(15,23,42,0.07)",
  shadowHover: "0 18px 40px rgba(15,23,42,0.12)",
  border: "1px solid #dbe2ea",
  bg: "#edf3f8",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  accent: "#8b5e3c",
  accentSoft: "#f5ede6",
  danger: "#dc2626",
};

const pageWrap = { padding: "20px 16px 30px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 30, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const cardBase = {
  ...surface,
  padding: 13,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: UI.brandBorder };

const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: "-0.01em" };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };

const chip = {
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const chipSoft = {
  ...chip,
  background: UI.brandSoft,
  borderColor: UI.brandBorder,
  color: UI.brand,
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      padding: "9px 11px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "#fff",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    };
  }
  if (kind === "pill") {
    return {
      padding: "7px 9px",
      borderRadius: 999,
      border: `1px solid ${UI.brandBorder}`,
      background: "#fff",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    padding: "9px 11px",
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
  padding: "8px 9px",
  borderRadius: 12,
  border: "1px solid #dbe2ea",
  outline: "none",
  fontSize: 13.5,
  background: "#fff",
};
const smallLabel = { fontSize: 12, color: UI.muted, fontWeight: 800 };

const divider = { height: 1, background: "#dde5ee", margin: "10px 0" };

const skeleton = {
  height: 12,
  borderRadius: 6,
  background: "linear-gradient(90deg, rgba(0,0,0,0.05), rgba(0,0,0,0.08), rgba(0,0,0,0.05))",
  backgroundSize: "200% 100%",
  animation: "shimmer 1400ms infinite",
};
const keyframes = `
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;

/* ────────────────────────────────────────────────────────────────────────────
   Date helpers
──────────────────────────────────────────────────────────────────────────── */
function parseYyyyMmDd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [Y, M, D] = String(s).split("-").map((n) => +n);
  return new Date(Date.UTC(Y, M - 1, D));
}

function isDateInRange(yyyyMmDd, from, to) {
  const safe = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+safe)) return false;

  const d = new Date(Date.UTC(safe.getUTCFullYear(), safe.getUTCMonth(), safe.getUTCDate()));
  const F = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const T = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  return d >= F && d <= T;
}

function startOfTodayUTC() {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

// check if a given YYYY-MM-DD is a Sunday (UTC)
function isSunday(yyyyMmDd) {
  const d = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+d)) return false;
  return d.getUTCDay() === 0;
}

/* ────────────────────────────────────────────────────────────────────────────
   Normalisers
──────────────────────────────────────────────────────────────────────────── */
function normaliseName(n) {
  return String(n || "").trim().replace(/\s+/g, " ").toLowerCase();
}
function initialsOf(n) {
  const parts = String(n || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 3).map((p) => (p[0] || "").toUpperCase()).join("") || "—";
}
function titleCase(n) {
  return String(n || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function dedupeEmployees(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const key = e.id || normaliseName(e.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
   Exact day-note → credit mapping
──────────────────────────────────────────────────────────────────────────── */
function creditForNote(rawNote) {
  if (!rawNote) return 1;

  const norm = String(rawNote).trim().toLowerCase().replace(/\s+/g, " ");

  if (norm.includes("night shoot")) return 1;
  if (norm.includes("split day")) return 1;
  if (norm.includes("turnaround")) return 1;
  if (norm === "1/2 day travel" || norm === "1/2 day travel day") return 0.5;
  if (norm === "travel time") return 0.25;
  if (norm === "rest day") return 0;
  if (norm === "other") return 0;

  return 1;
}

const BREAKDOWN_COLUMNS = [
  { key: "onSet", label: "On Set" },
  { key: "travel", label: "Travel" },
  { key: "halfTravel", label: "1/2 Travel" },
  { key: "yard", label: "Yard / Rig" },
  { key: "standby", label: "Standby" },
  { key: "turnaround", label: "Turnaround" },
  { key: "rest", label: "Rest" },
  { key: "nightShoot", label: "Night Shoot" },
  { key: "rehearsal", label: "Rehearsal" },
  { key: "recce", label: "Recce" },
  { key: "splitDay", label: "Split Day" },
  { key: "other", label: "Other" },
];

function classifyNote(rawNote) {
  const norm = String(rawNote || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return { key: "onSet", priority: 50 };
  if (norm === "on set" || norm === "shoot day") return { key: "onSet", priority: 50 };
  if (norm === "travel day" || norm === "travel time") return { key: "travel", priority: 40 };
  if (norm === "1/2 day travel" || norm === "1/2 day travel day" || norm === "half day travel") {
    return { key: "halfTravel", priority: 35 };
  }
  if (norm === "rig day") return { key: "yard", priority: 34 };
  if (norm === "standby day") return { key: "standby", priority: 33 };
  if (norm.includes("turnaround")) return { key: "turnaround", priority: 32 };
  if (norm === "rest day") return { key: "rest", priority: 10 };
  if (norm.includes("night shoot")) return { key: "nightShoot", priority: 45 };
  if (norm.includes("split day") || norm.includes("spilt day")) return { key: "splitDay", priority: 30 };
  if (norm === "rehearsal day") return { key: "rehearsal", priority: 28 };
  if (norm === "recce day") return { key: "recce", priority: 27 };
  return { key: "other", priority: 20 };
}

/* Pull note for a given YYYY-MM-DD from known shapes */
function getNoteForDate(booking, dayKey) {
  let v =
    (booking && booking.notesByDate && booking.notesByDate[dayKey]) ??
    (booking && booking.dayNotes && booking.dayNotes[dayKey]) ??
    (booking && booking.dailyNotes && booking.dailyNotes[dayKey]) ??
    (booking && booking.notesForEachDay && booking.notesForEachDay[dayKey]);

  if (v && typeof v === "object") {
    v = v.note ?? v.text ?? v.value ?? v.label ?? v.name ?? "";
  }
  if (v) return v;

  if (
    Array.isArray(booking && booking.bookingDates) &&
    Array.isArray(booking && booking.bookingNotes) &&
    booking.bookingNotes.length === booking.bookingDates.length
  ) {
    const idx = booking.bookingDates.findIndex((d) => d === dayKey);
    if (idx >= 0) return booking.bookingNotes[idx];
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Page
──────────────────────────────────────────────────────────────────────────── */
export default function EmployeesHomePage() {
  const router = useRouter();

  // timeframe state
  const [mode, setMode] = useState("lastNDays"); // "lastNDays" | "customRange"
  const [rangeDays, setRangeDays] = useState(30);
  const [fromDate, setFromDate] = useState(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState(""); // YYYY-MM-DD

  // chart state
  const [usageData, setUsageData] = useState([]);
  const [usageBreakdownData, setUsageBreakdownData] = useState([]);
  const [loading, setLoading] = useState(true);

  // compute effective range (past only, excluding today)
  const effectiveRange = useMemo(() => {
    const today0 = startOfTodayUTC();
    const end = new Date(today0);
    end.setUTCDate(end.getUTCDate() - 1); // yesterday

    if (mode === "lastNDays") {
      const start = new Date(end);
      start.setUTCDate(end.getUTCDate() - (Math.max(1, rangeDays) - 1));
      return { since: start, until: end, label: `Last ${rangeDays} past days` };
    }

    // custom range: clamp to past-only and ensure since <= until
    const f = parseYyyyMmDd(fromDate) ?? end;
    const t = parseYyyyMmDd(toDate) ?? end;

    const until = new Date(Math.min(+t, +end));
    const since = new Date(Math.min(+f, +until));

    const pretty = (d) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

    return { since, until, label: `${pretty(since)} → ${pretty(until)}` };
  }, [mode, rangeDays, fromDate, toDate]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "bookings"));

        // empKey -> Map<YYYY-MM-DD, credit>
        const credits = new Map();
        const breakdown = new Map();
        const since = effectiveRange.since;
        const until = effectiveRange.until;

        snapshot.forEach((docSnap) => {
          const booking = docSnap.data() || {};
          const status = String(booking.status || "").trim();

          if (status !== "Confirmed" && status !== "Complete") return;

          // employees array (strings or objects)
          const employeeListRaw = booking.employees || [];
          const employees = employeeListRaw
            .map((e) => {
              if (typeof e === "string") return { id: null, name: e, role: "Precision Driver" };
              return { id: e && e.id ? e.id : null, name: (e && (e.name || e.fullName)) || "", role: (e && e.role) || "" };
            })
            .filter((e) => (e.id || e.name)?.trim())
            .filter((e) => {
              const role = String(e.role || "").trim().toLowerCase();
              return role !== "freelancer" && role !== "freelance";
            });

          const uniqEmployees = dedupeEmployees(employees);
          if (uniqEmployees.length === 0) return;

          const noteKeys = Object.keys(booking.notesByDate || {});
          const dateSet = new Set(noteKeys.filter((d) => isDateInRange(d, since, until)));

          if (Array.isArray(booking.bookingDates)) {
            booking.bookingDates.forEach((d) => {
              if (isDateInRange(d, since, until)) dateSet.add(d);
            });
          }

          const dayKeys = Array.from(dateSet);
          if (dayKeys.length === 0) return;

          for (const dayKey of dayKeys) {
            const note = getNoteForDate(booking, dayKey);
            let credit = creditForNote(note);

            // Sunday "On Set" = double time
            if (note && isSunday(dayKey)) {
              const normNote = String(note).trim().toLowerCase().replace(/\s+/g, " ");
              if (normNote === "on set") credit = credit * 2;
            }

            for (const emp of uniqEmployees) {
              const empKey = emp.id || normaliseName(emp.name);
              if (!credits.has(empKey)) credits.set(empKey, new Map());
              const byDate = credits.get(empKey);

              // take MAX if multiple bookings for same emp & day
              const prev = byDate.get(dayKey) ?? 0;
              if (credit > prev) byDate.set(dayKey, credit);

              if (!breakdown.has(empKey)) breakdown.set(empKey, new Map());
              const byDateCategory = breakdown.get(empKey);
              const prevCategory = byDateCategory.get(dayKey);
              const nextCategory = classifyNote(note);
              if (!prevCategory || nextCategory.priority > prevCategory.priority) {
                byDateCategory.set(dayKey, nextCategory);
              }
            }
          }
        });

        const rows = [];
        const breakdownRows = [];
        for (const [empKey, byDate] of credits.entries()) {
          let total = 0;
          for (const v of byDate.values()) total += v;
          const display = empKey.includes("@@") ? empKey.split("@@")[0] : empKey;
          rows.push({
            key: empKey,
            name: initialsOf(display),
            fullName: titleCase(display),
            days: Number(total.toFixed(2)),
          });

          const dayTypeCounts = Object.fromEntries(BREAKDOWN_COLUMNS.map((col) => [col.key, 0]));
          const byDateCategory = breakdown.get(empKey) || new Map();
          for (const category of byDateCategory.values()) {
            const key = category?.key;
            if (key && Object.prototype.hasOwnProperty.call(dayTypeCounts, key)) {
              dayTypeCounts[key] += 1;
            }
          }

          breakdownRows.push({
            key: empKey,
            name: titleCase(display),
            totalDays: Number(total.toFixed(2)),
            ...dayTypeCounts,
          });
        }

        rows.sort((a, b) => b.days - a.days);
        breakdownRows.sort((a, b) => b.totalDays - a.totalDays || a.name.localeCompare(b.name));

        if (isMounted) {
          setUsageData(rows);
          setUsageBreakdownData(breakdownRows);
        }
      } catch (err) {
        console.error("Error fetching bookings:", err);
        if (isMounted) {
          setUsageData([]);
          setUsageBreakdownData([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [effectiveRange]);

  const employeeSections = useMemo(
    () => [
      { title: "Employee List", description: "View, add or manage all staff and freelancers.", link: "/employees" },
      { title: "Add Employee", description: "Register a new employee or freelancer.", link: "/add-employee" },
      { title: "Holiday Tracker", description: "Monitor and record employee holidays.", link: "/holiday-usage" },
      { title: "Upload Documents", description: "Add employee contracts and certifications.", link: "/upload-contract" },
    ],
    []
  );

  const todayISO = (() => {
    const t = startOfTodayUTC();
    t.setUTCDate(t.getUTCDate() - 1); // yesterday as max
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  })();

  const renderValueLabel = (props) => {
    const { x = 0, y = 0, width = 0, value = 0 } = props || {};
    const num = Number(value);
    const text = Math.abs(num - Math.round(num)) < 1e-9 ? `${num.toFixed(0)}` : `${num.toFixed(2)}`;
    return (
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fill={UI.text} style={{ fontSize: 11, fontWeight: 900 }}>
        {text}
      </text>
    );
  };

  const kpiTotal = useMemo(() => usageData.reduce((s, r) => s + (Number(r.days) || 0), 0), [usageData]);
  const kpiPeople = usageData.length;

  return (
    <HeaderSidebarLayout>
      <style>{keyframes}</style>

      {/* subtle focus ring */}
      <style>{`
        input:focus, button:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(29,78,216,0.15); border-color: #bfdbfe !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Employees</h1>
            <div style={sub}>
              Workforce activity overview based on confirmed and completed bookings across the selected reporting period.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>{loading ? "Loading…" : `${kpiPeople} people`}</div>
            <div style={chipSoft}>
              Total credits: <b style={{ marginLeft: 6 }}>{Number(kpiTotal.toFixed(2))}</b>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div style={grid(4)}>
          {employeeSections.map((section, idx) => (
            <div
              key={idx}
              style={cardBase}
              onClick={() => router.push(section.link)}
              onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
              onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardBase)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? router.push(section.link) : null)}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: UI.text }}>{section.title}</div>
                <span style={chip}>Open</span>
              </div>
              <div style={{ marginTop: 5, color: UI.muted, fontSize: 13 }}>{section.description}</div>
              <div style={{ marginTop: 8, fontWeight: 800, color: UI.brand }}>Open →</div>
            </div>
          ))}
        </div>

        {/* Chart panel */}
        <section style={{ ...cardBase, marginTop: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Employee Credits Overview</h2>
              <div style={hint}>
                Maximum one credit per employee per date across confirmed bookings, with the highest value retained. Freelancers are excluded.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chipSoft}>{effectiveRange.label}</span>
              <button type="button" style={btn("ghost")} onClick={() => { setMode("lastNDays"); setRangeDays(30); setFromDate(""); setToDate(""); }}>
                Reset
              </button>
            </div>
          </div>

          {/* Controls */}
          <div style={{ ...surface, boxShadow: "none", borderRadius: 12, border: UI.border, padding: 10, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={btn("pill")} onClick={() => setMode("lastNDays")}>
                  Last N days
                </button>
                <button type="button" style={btn("pill")} onClick={() => setMode("customRange")}>
                  Custom range
                </button>
              </div>

              {mode === "lastNDays" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={smallLabel}>Days</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={rangeDays}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRangeDays(Math.max(1, Math.min(365, Number.isFinite(v) ? v : 30)));
                      }}
                      style={{ ...inputBase, width: 84, padding: "7px 8px", borderRadius: 12 }}
                    />
                  </div>

                  {[30, 60, 90].map((n) => {
                    const active = rangeDays === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        style={{
                          ...btn("pill"),
                          borderColor: active ? "#bfdbfe" : "#d1d5db",
                          background: active ? UI.brandSoft : "#fff",
                          color: active ? UI.brand : UI.text,
                        }}
                        onClick={() => setRangeDays(n)}
                      >
                        {n}d
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={smallLabel}>From</span>
                    <input
                      type="date"
                      max={todayISO}
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      style={{ ...inputBase, width: 170 }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={smallLabel}>To</span>
                    <input
                      type="date"
                      max={todayISO}
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      style={{ ...inputBase, width: 170 }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={divider} />

            <div style={{ color: UI.muted, fontSize: 12, lineHeight: 1.5 }}>
              <b>Credit rules:</b> Half Day Travel = 0.5 · Travel Time = 0.25 · Most day types = 1 · Rest Day / Other = 0 ·
              <b> On Set Sundays = x2</b>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...skeleton, width: "60%", marginBottom: 10 }} />
              <div style={{ ...skeleton, width: "75%", marginBottom: 10 }} />
              <div style={{ ...skeleton, width: "40%", marginBottom: 10 }} />
              <div style={{ ...skeleton, width: "85%" }} />
            </div>
          ) : usageData.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ height: 320, marginTop: 10 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageData} margin={{ top: 14, right: 20, left: 0, bottom: 14 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: UI.muted, fontSize: 12 }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    allowDecimals
                    tick={{ fill: UI.muted, fontSize: 12 }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={{ stroke: "#e5e7eb" }}
                    domain={[0, "dataMax+1"]}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.12)" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                      fontSize: 12,
                      color: UI.text,
                    }}
                    formatter={(value, _name, p) => {
                      const full = (p && p.payload && (p.payload.fullName || p.payload.name)) || "";
                      const num = Number(value);
                      const v = Math.abs(num - Math.round(num)) < 1e-6 ? num.toFixed(0) : num.toFixed(2);
                      return [`${v} credits`, full];
                    }}
                  />
                  <Bar dataKey="days" fill={UI.brand} radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="days" position="top" content={renderValueLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: UI.brand, border: "1px solid #d1d5db" }} />
                <div style={{ color: UI.muted, fontSize: 12 }}>
                  Bars show total employee credits, including fractional travel credits and Sunday On Set double time. Hover to view full names.
                </div>
              </div>
            </div>
          )}
        </section>

        <section style={{ ...surface, padding: 14, marginTop: 14 }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Work Type Breakdown</h2>
              <div style={hint}>
                Per-employee day counts by booking note type across the selected reporting window.
              </div>
            </div>
            <div style={chipSoft}>{usageBreakdownData.length} employees</div>
          </div>

          {loading ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...skeleton, width: "70%", marginBottom: 10 }} />
              <div style={{ ...skeleton, width: "92%", marginBottom: 10 }} />
              <div style={{ ...skeleton, width: "86%" }} />
            </div>
          ) : usageBreakdownData.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>No employee work breakdown found in this reporting period.</div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={tableHeadLeft}>Employee</th>
                    {BREAKDOWN_COLUMNS.map((column) => (
                      <th key={column.key} style={tableHead}>{column.label}</th>
                    ))}
                    <th style={tableHead}>Total Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {usageBreakdownData.map((row) => (
                    <tr
                      key={row.key}
                      onClick={() => {
                        const params = new URLSearchParams({
                          name: row.name,
                          mode,
                          rangeDays: String(rangeDays),
                          fromDate,
                          toDate,
                        });
                        router.push(`/employee-home/${encodeURIComponent(row.key)}?${params.toString()}`);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={tableCellLeftInteractive}>{row.name}</td>
                      {BREAKDOWN_COLUMNS.map((column) => (
                        <td key={`${row.key}-${column.key}`} style={tableCell}>
                          {row[column.key] || 0}
                        </td>
                      ))}
                      <td style={{ ...tableCell, fontWeight: 900 }}>{row.totalDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Empty state
──────────────────────────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{ ...surface, boxShadow: "none", padding: 13, marginTop: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 6, color: UI.text }}>No data in this reporting period</div>
      <div style={{ color: UI.muted, fontSize: 13, lineHeight: 1.5 }}>
        Only <b>Confirmed</b> and <b>Complete</b> bookings from <b>past dates</b> are included in the selected range, with today excluded.
        Try a longer range, or confirm your bookings include <code>notesByDate[&quot;YYYY-MM-DD&quot;]</code> and/or <code>bookingDates</code>.
      </div>
    </div>
  );
}

const tableHead = {
  padding: "10px 12px",
  background: "#f8fbfd",
  borderTop: UI.border,
  borderBottom: UI.border,
  borderRight: UI.border,
  fontSize: 12,
  fontWeight: 900,
  color: UI.text,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tableHeadLeft = {
  ...tableHead,
  borderLeft: UI.border,
  textAlign: "left",
  position: "sticky",
  left: 0,
  zIndex: 2,
};

const tableCell = {
  padding: "9px 12px",
  borderBottom: UI.border,
  borderRight: UI.border,
  fontSize: 13,
  color: UI.text,
  textAlign: "center",
  background: "#fff",
  whiteSpace: "nowrap",
};

const tableCellLeft = {
  ...tableCell,
  borderLeft: UI.border,
  textAlign: "left",
  fontWeight: 800,
  position: "sticky",
  left: 0,
  zIndex: 1,
};

const tableCellLeftInteractive = {
  ...tableCellLeft,
  color: UI.brand,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};
