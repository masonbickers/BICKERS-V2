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
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const cardBase = {
  ...surface,
  padding: 16,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: "#dbeafe" };

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
const smallLabel = { fontSize: 12, color: UI.muted, fontWeight: 800 };

const divider = { height: 1, background: "#e5e7eb", margin: "14px 0" };

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

  if (norm === "1/2 day travel" || norm === "1/2 day travel day") return 0.5;
  if (norm === "travel time") return 0.25;
  if (norm === "rest day") return 0;
  if (norm === "other") return 0;

  return 1;
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
            .filter((e) => String(e.role || "").toLowerCase() !== "freelancer");

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
            }
          }
        });

        const rows = [];
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
        }

        rows.sort((a, b) => b.days - a.days);

        if (isMounted) setUsageData(rows);
      } catch (err) {
        console.error("Error fetching bookings:", err);
        if (isMounted) setUsageData([]);
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
              Snapshot of <b>day credits</b> from <b>Confirmed + Complete</b> bookings (past dates only). Sundays “On Set” = x2.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 16, color: UI.text }}>{section.title}</div>
                <span style={chip}>Open</span>
              </div>
              <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{section.description}</div>
              <div style={{ marginTop: 10, fontWeight: 900, color: UI.brand }}>Open →</div>
            </div>
          ))}
        </div>

        {/* Chart panel */}
        <section style={{ ...cardBase, marginTop: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Day credits</h2>
              <div style={hint}>
                Max one credit per employee per date across confirmed bookings (highest value wins). Freelancers excluded.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chipSoft}>{effectiveRange.label}</span>
              <button type="button" style={btn("ghost")} onClick={() => { setMode("lastNDays"); setRangeDays(30); setFromDate(""); setToDate(""); }}>
                Reset
              </button>
            </div>
          </div>

          {/* Controls */}
          <div style={{ ...surface, boxShadow: "none", borderRadius: 12, border: UI.border, padding: 12, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={btn("pill")} onClick={() => setMode("lastNDays")}>
                  Last N days
                </button>
                <button type="button" style={btn("pill")} onClick={() => setMode("customRange")}>
                  Custom range
                </button>
              </div>

              {mode === "lastNDays" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                      style={{ ...inputBase, width: 92, padding: "8px 10px", borderRadius: 12 }}
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
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={smallLabel}>From</span>
                    <input
                      type="date"
                      max={todayISO}
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      style={{ ...inputBase, width: 170 }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              <b>Credit rules:</b> ½ Day Travel = 0.5 · Travel Time = 0.25 · Most day types = 1 · Rest Day / Other = 0 ·
              <b> On Set Sundays = x2</b>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ ...skeleton, width: "60%", marginBottom: 10 }} />
              <div style={{ ...skeleton, width: "75%", marginBottom: 10 }} />
              <div style={{ ...skeleton, width: "40%", marginBottom: 10 }} />
              <div style={{ ...skeleton, width: "85%" }} />
            </div>
          ) : usageData.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ height: 360, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageData} margin={{ top: 18, right: 24, left: 0, bottom: 18 }}>
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

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: UI.brand, border: "1px solid #d1d5db" }} />
                <div style={{ color: UI.muted, fontSize: 12 }}>
                  Bars show total credits (incl. halves/quarters and Sunday On Set double time). Hover for full names.
                </div>
              </div>
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
    <div style={{ ...surface, boxShadow: "none", padding: 16, marginTop: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 6, color: UI.text }}>No data in this timeframe</div>
      <div style={{ color: UI.muted, fontSize: 13, lineHeight: 1.5 }}>
        We only include <b>Confirmed</b> and <b>Complete</b> bookings from <b>past dates</b> in your selected range (today excluded).
        Try a longer range, or confirm your bookings include <code>notesByDate["YYYY-MM-DD"]</code> and/or <code>bookingDates</code>.
      </div>
    </div>
  );
}
