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

/* ────────────────────────────────────────────────────────────────────────────
   Light UI system
──────────────────────────────────────────────────────────────────────────── */
const UI = {
  bg: "#f6f7fb",
  panel: "#ffffff",
  card: "#ffffff",
  cardHover: "#f9fafb",
  border: "1px solid rgba(0,0,0,0.08)",
  text: "#0f172a",
  muted: "rgba(15,23,42,0.6)",
  accent: "#2563eb",
  radius: 14,
  shadow: "0 8px 24px rgba(16,24,40,0.06)",
};

const wrap = {
  display: "flex",
  minHeight: "100vh",
  background: UI.bg,
  color: UI.text,
  fontFamily: "Inter, system-ui, Arial, sans-serif",
};

const main = {
  flex: 1,
  padding: "28px 28px 40px",
  maxWidth: 1600,
  margin: "0 auto",
};

const h1 = {
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: "4px 0 16px",
};
const sub = { color: UI.muted, marginBottom: 24 };

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 16,
};
const card = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadow,
  padding: 18,
  cursor: "pointer",
  transition: "transform 160ms ease, background 160ms ease",
};
const cardTitle = { fontSize: 16, fontWeight: 700, marginBottom: 6 };
const cardBody = { color: UI.muted, fontSize: 14, lineHeight: 1.4 };

const panel = {
  background: UI.panel,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadow,
  padding: 18,
  marginTop: 28,
};
const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const chipRow = { display: "flex", gap: 8, flexWrap: "wrap" };
const chip = (active) => ({
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 13,
  border: UI.border,
  background: active ? "#e7efff" : "#ffffff",
  color: active ? UI.text : UI.muted,
  cursor: "pointer",
  transition: "background 160ms ease, color 160ms ease, border 160ms ease",
});

const tiny = { fontSize: 12, color: UI.muted };

const skeleton = {
  height: 12,
  borderRadius: 6,
  background:
    "linear-gradient(90deg, rgba(0,0,0,0.05), rgba(0,0,0,0.08), rgba(0,0,0,0.05))",
  backgroundSize: "200% 100%",
  animation: "shimmer 1400ms infinite",
};

const keyframes = `
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

/* ────────────────────────────────────────────────────────────────────────────
   Date helpers
──────────────────────────────────────────────────────────────────────────── */
function parseYyyyMmDd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [Y, M, D] = String(s)
    .split("-")
    .map((n) => +n);
  return new Date(Date.UTC(Y, M - 1, D));
}

function isDateInRange(yyyyMmDd, from, to) {
  const safe = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+safe)) return false;
  const d = new Date(
    Date.UTC(
      safe.getUTCFullYear(),
      safe.getUTCMonth(),
      safe.getUTCDate()
    )
  );
  const F = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  );
  const T = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  );
  return d >= F && d <= T;
}

function startOfTodayUTC() {
  const t = new Date();
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
  );
}

// NEW: check if a given YYYY-MM-DD is a Sunday (UTC)
function isSunday(yyyyMmDd) {
  const d = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+d)) return false;
  // 0 = Sunday
  return d.getUTCDay() === 0;
}

/* ────────────────────────────────────────────────────────────────────────────
   Normalisers
──────────────────────────────────────────────────────────────────────────── */
function normaliseName(n) {
  return String(n || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
function initialsOf(n) {
  const parts = String(n || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    parts
      .slice(0, 3)
      .map((p) => (p[0] || "").toUpperCase())
      .join("") || "—"
  );
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
   - 1 credit for ALL except:
     • "1/2 Day Travel" = 0.5
     • "Travel Time" = 0.25
     • "Rest Day" = 0
     • "Other" = 0
──────────────────────────────────────────────────────────────────────────── */
function creditForNote(rawNote) {
  if (!rawNote) return 1;

  const norm = String(rawNote).trim().toLowerCase().replace(/\s+/g, " ");

  if (norm === "1/2 day travel" || norm === "1/2 day travel day") return 0.5;
  if (norm === "travel time") return 0.25;
  if (norm === "rest day") return 0;
  if (norm === "other") return 0;

  // All other dropdown values = 1 (Night Shoot, Shoot Day, Rehearsal Day, Rig Day,
  // Standby Day, Travel Day, Turnaround Day, Recce Day, On Set, etc.)
  return 1;
}

/* Pull note for a given YYYY-MM-DD from known shapes */
function getNoteForDate(booking, dayKey) {
  let v =
    (booking &&
      booking.notesByDate &&
      booking.notesByDate[dayKey]) ??
    (booking && booking.dayNotes && booking.dayNotes[dayKey]) ??
    (booking &&
      booking.dailyNotes &&
      booking.dailyNotes[dayKey]) ??
    (booking &&
      booking.notesForEachDay &&
      booking.notesForEachDay[dayKey]);

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
      return { since: start, until: end, label: `Last ${rangeDays} Past Days` };
    }

    // custom range: clamp to past-only and ensure since <= until
    const f = parseYyyyMmDd(fromDate) ?? end;
    const t = parseYyyyMmDd(toDate) ?? end;

    const until = new Date(Math.min(+t, +end));
    const since = new Date(Math.min(+f, +until));

    const pretty = (d) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getUTCDate()).padStart(2, "0")}`;

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

          // Only Confirmed bookings
          if (status !== "Confirmed") return;

          // employees array (strings or objects)
          const employeeListRaw = booking.employees || [];
          const employees = employeeListRaw
            .map((e) => {
              if (typeof e === "string")
                return {
                  id: null,
                  name: e,
                  role: "Precision Driver",
                };
              return {
                id: e && e.id ? e.id : null,
                name: (e && (e.name || e.fullName)) || "",
                role: (e && e.role) || "",
              };
            })
            // ONLY EMPLOYEES: exclude role === "Freelancer"
            .filter((e) => (e.id || e.name)?.trim())
            .filter(
              (e) => String(e.role || "").toLowerCase() !== "freelancer"
            );

          const uniqEmployees = dedupeEmployees(employees);
          if (uniqEmployees.length === 0) return;

          // candidate day keys within selected range (past only)
          const noteKeys = Object.keys(booking.notesByDate || {});
          const dateSet = new Set(
            noteKeys.filter((d) => isDateInRange(d, since, until))
          );

          if (Array.isArray(booking.bookingDates)) {
            booking.bookingDates.forEach((d) => {
              if (isDateInRange(d, since, until)) dateSet.add(d);
            });
          }

          const dayKeys = Array.from(dateSet);
          if (dayKeys.length === 0) return;

          // per-day credit (default 1) → assign to EACH employee on that job
          for (const dayKey of dayKeys) {
            const note = getNoteForDate(booking, dayKey);
            let credit = creditForNote(note);

            // ── NEW RULE: Sunday "On Set" = double time ───────────────
            if (note && isSunday(dayKey)) {
              const normNote = String(note)
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              if (normNote === "on set") {
                credit = credit * 2;
              }
            }
            // ──────────────────────────────────────────────────────────

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

        // roll up totals
        const rows = [];
        for (const [empKey, byDate] of credits.entries()) {
          let total = 0;
          for (const v of byDate.values()) total += v;
          const display = empKey.includes("@@")
            ? empKey.split("@@")[0]
            : empKey;
          rows.push({
            key: empKey,
            name: initialsOf(display),
            fullName: titleCase(display),
            days: Number(total.toFixed(2)), // keep 0.25 steps neat
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
      {
        title: "Employee List",
        description: "View, add or manage all staff and freelancers.",
        link: "/employees",
      },
      {
        title: "Add Employee",
        description: "Register a new employee or freelancer.",
        link: "/add-employee",
      },
      {
        title: "Holiday Tracker",
        description: "Monitor and record employee holidays.",
        link: "/holiday-usage",
      },
      {
        title: "Upload Documents",
        description: "Add employee contracts and certifications.",
        link: "/upload-contract",
      },
            {
        title: "P45",
        description: "Add employee contracts and certifications.",
        link: "/upload-contract",
      },
    ],
    []
  );

  const todayISO = (() => {
    const t = startOfTodayUTC();
    t.setUTCDate(t.getUTCDate() - 1); // yesterday as max
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(t.getUTCDate()).padStart(2, "0")}`;
  })();

  // LabelList custom renderer
  const renderValueLabel = (props) => {
    const { x = 0, y = 0, width = 0, value = 0 } = props || {};
    const num = Number(value);
    const text =
      Math.abs(num - Math.round(num)) < 1e-9
        ? `${num.toFixed(0)}`
        : `${num.toFixed(2)}`;
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        textAnchor="middle"
        fill={UI.text}
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        {text}
      </text>
    );
  };

  return (
    <HeaderSidebarLayout>
      <style>{keyframes}</style>
      <div style={wrap}>
        <main style={main}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={h1}>Employee Dashboard</h1>
            <span style={tiny}>People · Activity · Docs</span>
          </div>
          <p style={sub}>
            Snapshot of <b>day credits</b> (Confirmed bookings, past dates
            only):
            <br />
            <span style={{ fontSize: 12 }}>
              <b>1/2 Day Travel = 0.5</b> · <b>Travel Time = 0.25</b> · Night
              Shoot/Shoot/Rehearsal/Rig/Standby/Travel Day/Turnaround/Recce/On
              Set = 1 · <b>Rest Day/Other = 0</b> ·{" "}
              <b>On Set Sundays = x2 (double time)</b>
            </span>
          </p>

          {/* Quick links */}
          <div style={grid}>
            {employeeSections.map((section, idx) => (
              <div
                key={idx}
                style={card}
                onClick={() => router.push(section.link)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = UI.cardHover)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = UI.card)
                }
              >
                <div style={cardTitle}>{section.title}</div>
                <div style={cardBody}>{section.description}</div>
              </div>
            ))}
          </div>

          {/* Chart panel */}
          <section style={panel}>
            <div style={{ ...row, alignItems: "flex-start" }}>
              <div>
                <div
                  style={{
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Day Credits (Confirmed · Past Only) — {effectiveRange.label}
                </div>
                <div style={tiny}>
                  Max one credit per employee per date across confirmed bookings
                  (highest value wins). Freelancers are excluded.
                </div>
              </div>

              {/* Timeframe controls */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    style={chip(mode === "lastNDays")}
                    onClick={() => setMode("lastNDays")}
                  >
                    Last N Days
                  </button>
                  <button
                    type="button"
                    style={chip(mode === "customRange")}
                    onClick={() => setMode("customRange")}
                  >
                    Custom Range
                  </button>
                </div>

                {mode === "lastNDays" ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <label
                      style={{ fontSize: 12, color: UI.muted }}
                    >
                      Days:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={rangeDays}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRangeDays(
                          Math.max(
                            1,
                            Math.min(
                              365,
                              Number.isFinite(v) ? v : 30
                            )
                          )
                        );
                      }}
                      style={{
                        width: 80,
                        padding: "6px 8px",
                        border: UI.border,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <div style={chipRow}>
                      {[30, 60, 90].map((n) => (
                        <button
                          key={n}
                          type="button"
                          style={chip(rangeDays === n)}
                          onClick={() => setRangeDays(n)}
                        >
                          {n}d
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <label
                      style={{ fontSize: 12, color: UI.muted }}
                    >
                      From:
                    </label>
                    <input
                      type="date"
                      max={todayISO}
                      value={fromDate}
                      onChange={(e) =>
                        setFromDate(e.target.value)
                      }
                      style={{
                        padding: "6px 8px",
                        border: UI.border,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <label
                      style={{ fontSize: 12, color: UI.muted }}
                    >
                      To:
                    </label>
                    <input
                      type="date"
                      max={todayISO}
                      value={toDate}
                      onChange={(e) =>
                        setToDate(e.target.value)
                      }
                      style={{
                        padding: "6px 8px",
                        border: UI.border,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div style={{ marginTop: 22 }}>
                <div
                  style={{
                    ...skeleton,
                    width: "60%",
                    marginBottom: 10,
                  }}
                />
                <div
                  style={{
                    ...skeleton,
                    width: "75%",
                    marginBottom: 10,
                  }}
                />
                <div
                  style={{
                    ...skeleton,
                    width: "40%",
                    marginBottom: 10,
                  }}
                />
                <div
                  style={{ ...skeleton, width: "85%" }}
                />
              </div>
            ) : usageData.length === 0 ? (
              <EmptyState />
            ) : (
              <div style={{ height: 340, marginTop: 8 }}>
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={usageData}
                    margin={{
                      top: 16,
                      right: 18,
                      left: -10,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(0,0,0,0.08)"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{
                        fill: "#475569",
                        fontSize: 12,
                      }}
                      axisLine={{
                        stroke: "rgba(0,0,0,0.15)",
                      }}
                      tickLine={{
                        stroke: "rgba(0,0,0,0.15)",
                      }}
                    />
                    <YAxis
                      allowDecimals
                      tick={{
                        fill: "#475569",
                        fontSize: 12,
                      }}
                      axisLine={{
                        stroke: "rgba(0,0,0,0.15)",
                      }}
                      tickLine={{
                        stroke: "rgba(0,0,0,0.15)",
                      }}
                      domain={[0, "dataMax+1"]}
                    />
                    <Tooltip
                      cursor={{
                        fill: "rgba(0,0,0,0.04)",
                      }}
                      contentStyle={{
                        background: "#ffffff",
                        border:
                          "1px solid rgba(0,0,0,0.12)",
                        borderRadius: 10,
                        color: UI.text,
                        padding: 10,
                        boxShadow:
                          "0 8px 20px rgba(0,0,0,0.08)",
                      }}
                      formatter={(value, _name, p) => {
                        const full =
                          (p &&
                            p.payload &&
                            (p.payload.fullName ||
                              p.payload.name)) ||
                          "";
                        const num = Number(value);
                        const v =
                          Math.abs(
                            num - Math.round(num)
                          ) < 1e-6
                            ? num.toFixed(0)
                            : num.toFixed(2);
                        return [`${v}`, full];
                      }}
                    />
                    <Bar
                      dataKey="days"
                      fill={UI.accent}
                      radius={[6, 6, 0, 0]}
                    >
                      <LabelList
                        dataKey="days"
                        position="top"
                        content={renderValueLabel}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Tiny legend */}
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: UI.accent,
                      border:
                        "1px solid rgba(0,0,0,0.15)",
                    }}
                  />
                  <span style={tiny}>
                    Bars show total credits (incl.
                    halves/quarters and Sunday On Set
                    double time). Hover for names.
                  </span>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Empty state
──────────────────────────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div
      style={{
        border: UI.border,
        borderRadius: UI.radius,
        padding: 20,
        background: "#fff",
        marginTop: 8,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        No data in this timeframe
      </div>
      <div
        style={{
          color: UI.muted,
          fontSize: 14,
        }}
      >
        We only include <b>Confirmed</b> bookings from{" "}
        <b>past dates</b> in your selected range (today
        excluded). Try a longer range, or confirm your
        bookings include <code>notesByDate["YYYY-MM-DD"]</code>{" "}
        and/or <code>bookingDates</code>.
      </div>
    </div>
  );
}
