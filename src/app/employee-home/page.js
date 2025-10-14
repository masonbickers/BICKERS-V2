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
  const [Y, M, D] = s.split("-").map((n) => +n);
  const date = new Date(Date.UTC(Y, M - 1, D));
  return date;
}

function isDateInRange(yyyyMmDd, from, to) {
  const safe = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+safe)) return false;
  const d = new Date(Date.UTC(safe.getFullYear(), safe.getMonth(), safe.getDate()));
  const F = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const T = new Date(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()));
  return d >= F && d <= T;
}

/* ────────────────────────────────────────────────────────────────────────────
   Normalisers
──────────────────────────────────────────────────────────────────────────── */
function normaliseName(n) {
  return String(n || "").trim().replace(/\s+/g, " ").toLowerCase();
}
function initialsOf(n) {
  const parts = String(n || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 3).map((p) => p[0]?.toUpperCase()).join("") || "—";
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
   Notes → credit mapping
   - "1/2 Day Travel" = 0.5
   - "Travel Day" = 1
   - "On Set" = 1
   - "Turnaround Day" = 1
   - No note = 1 (as requested)
──────────────────────────────────────────────────────────────────────────── */
function creditForNote(rawNote) {
  if (!rawNote) return 1; // default to 1 if no note
  const n = String(rawNote).trim().toLowerCase();

  // very lightweight normalisation for common variants
  if (n.includes("1/2") && n.includes("travel")) return 0.5;
  if (n.includes("half") && n.includes("travel")) return 0.5;

  if (n.includes("travel day")) return 1;
  if (n.includes("on set") || n.includes("on-set") || n === "shoot" || n.includes("shoot day"))
    return 1;
  if (n.includes("turnaround")) return 1;

  // unknown note → default to 1 per your rule
  return 1;
}

/**
 * Extract the note for a specific YYYY-MM-DD from a booking.
 * Supports shapes you’ve used across the app.
 */
function getNoteForDate(booking, dayKey) {
  // Object maps keyed by date (string or {note: "...", label: "..."} etc.)
  let v =
    booking?.notesByDate?.[dayKey] ??
    booking?.dayNotes?.[dayKey] ??
    booking?.dailyNotes?.[dayKey] ??
    booking?.notesForEachDay?.[dayKey];

  if (v && typeof v === "object") {
    v = v.note ?? v.text ?? v.value ?? v.label ?? v.name ?? "";
  }
  if (v) return v;

  // Arrays aligned with bookingDates
  if (
    Array.isArray(booking?.bookingDates) &&
    Array.isArray(booking?.bookingNotes) &&
    booking.bookingNotes.length === booking.bookingDates.length
  ) {
    const idx = booking.bookingDates.findIndex((d) => d === dayKey);
    if (idx >= 0) return booking.bookingNotes[idx];
  }

  // No explicit note for that date → return null (caller will default to 1)
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Page Component
──────────────────────────────────────────────────────────────────────────── */
export default function EmployeesHomePage() {
  const router = useRouter();
  const [usageData, setUsageData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const snapshot = await getDocs(collection(db, "bookings"));

        // empKey -> Map<YYYY-MM-DD, credit> (we take the max per day across bookings)
        const credits = new Map();

        const now = new Date();
        const since = new Date(now);
        since.setDate(now.getDate() - rangeDays);

        snapshot.forEach((docSnap) => {
          const booking = docSnap.data() || {};

          // Employees: ["Jane"] or [{id, name}] etc.
          const employeeListRaw = booking.employees || [];
          const employees = employeeListRaw
            .map((e) =>
              typeof e === "string"
                ? { id: null, name: e }
                : { id: e?.id || null, name: e?.name || e?.fullName || "" }
            )
            .filter((e) => (e.id || e.name)?.trim());
          const uniqEmployees = dedupeEmployees(employees);

          // Build candidate date list in range:
          // 1) from notes object keys
          // 2) from bookingDates (to catch "no note" → count as 1)
          const noteKeys = Object.keys(booking?.notesByDate || {});
          const dateSet = new Set(
            noteKeys.filter((d) => isDateInRange(d, since, now))
          );

          if (Array.isArray(booking.bookingDates)) {
            booking.bookingDates.forEach((d) => {
              if (isDateInRange(d, since, now)) dateSet.add(d);
            });
          }

          const dayKeys = [...dateSet];
          if (dayKeys.length === 0 || uniqEmployees.length === 0) return;

          // For each day, determine the credit from its note (or default to 1)
          for (const dayKey of dayKeys) {
            const note = getNoteForDate(booking, dayKey);
            const credit = creditForNote(note);

            // Assign credit per employee for that date — take max across bookings
            for (const emp of uniqEmployees) {
              const empKey = emp.id || normaliseName(emp.name);
              if (!credits.has(empKey)) credits.set(empKey, new Map());
              const byDate = credits.get(empKey);

              const prev = byDate.get(dayKey) ?? 0;
              if (credit > prev) byDate.set(dayKey, credit);
            }
          }
        });

        // Sum credits per employee
        const rows = [];
        for (const [empKey, byDate] of credits.entries()) {
          let total = 0;
          for (const v of byDate.values()) total += v;

          // Try to recover a representative display name from empKey if we can't find it later
          const display = empKey.includes("@@") ? empKey.split("@@")[0] : empKey;

          rows.push({
            key: empKey,
            name: initialsOf(display),
            fullName: titleCase(display),
            days: Number(total.toFixed(1)), // keep halves tidy
          });
        }

        // Sort by total credits desc
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
  }, [rangeDays]);

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
    ],
    []
  );

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
            Snapshot of **day credits** from booking notes:
            <br />
            <span style={{ fontSize: 12 }}>
              1/2 Day Travel = 0.5 · Travel Day = 1 · On Set = 1 · Turnaround Day = 1 ·
              No note = 1
            </span>
          </p>

          {/* Quick links */}
          <div style={grid}>
            {employeeSections.map((section, idx) => (
              <div
                key={idx}
                style={card}
                onClick={() => router.push(section.link)}
                onMouseEnter={(e) => (e.currentTarget.style.background = UI.cardHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = UI.card)}
              >
                <div style={cardTitle}>{section.title}</div>
                <div style={cardBody}>{section.description}</div>
              </div>
            ))}
          </div>

          {/* Chart panel */}
          <section style={panel}>
            <div style={row}>
              <div>
                <div style={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
                  Day Credits from Notes (Last {rangeDays} Days)
                </div>
                <div style={tiny}>
                  Max one credit per employee per date across bookings (highest applicable
                  credit wins).
                </div>
              </div>
              <div style={chipRow}>
                {[30, 60, 90].map((n) => (
                  <button
                    key={n}
                    type="button"
                    style={chip(rangeDays === n)}
                    onClick={() => setRangeDays(n)}
                  >
                    Last {n}d
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ marginTop: 22 }}>
                <div style={{ ...skeleton, width: "60%", marginBottom: 10 }} />
                <div style={{ ...skeleton, width: "75%", marginBottom: 10 }} />
                <div style={{ ...skeleton, width: "40%", marginBottom: 10 }} />
                <div style={{ ...skeleton, width: "85%" }} />
              </div>
            ) : usageData.length === 0 ? (
              <EmptyState />
            ) : (
              <div style={{ height: 340, marginTop: 8 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={usageData}
                    margin={{ top: 16, right: 18, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#475569", fontSize: 12 }}
                      axisLine={{ stroke: "rgba(0,0,0,0.15)" }}
                      tickLine={{ stroke: "rgba(0,0,0,0.15)" }}
                    />
                    <YAxis
                      allowDecimals
                      tick={{ fill: "#475569", fontSize: 12 }}
                      axisLine={{ stroke: "rgba(0,0,0,0.15)" }}
                      tickLine={{ stroke: "rgba(0,0,0,0.15)" }}
                      domain={[0, "dataMax+1"]}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid rgba(0,0,0,0.12)",
                        borderRadius: 10,
                        color: UI.text,
                        padding: 10,
                        boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                      }}
                      formatter={(value, _name, p) => {
                        const full = p?.payload?.fullName || p?.payload?.name;
                        const v = Number(value).toFixed(
                          Math.abs(value - Math.round(value)) < 1e-6 ? 0 : 1
                        );
                        return [`${v}`, full];
                      }}
                    />
                    <Bar dataKey="days" fill={UI.accent} radius={[6, 6, 0, 0]}>
                      <LabelList
                        dataKey="days"
                        position="top"
                        formatter={(v) =>
                          Number(v) % 1 === 0 ? `${v}` : `${Number(v).toFixed(1)}`
                        }
                        style={{ fill: UI.text, fontSize: 12, fontWeight: 700 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Tiny legend */}
                <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center" }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: UI.accent,
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  />
                  <span style={tiny}>Bars show total credits (incl. halves). Hover for names.</span>
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
      <div style={{ fontWeight: 700, marginBottom: 6 }}>No recent data</div>
      <div style={{ color: UI.muted, fontSize: 14 }}>
        We didn’t find any bookings in the selected range. Try a longer range, or confirm
        your bookings include <code>notesByDate["YYYY-MM-DD"]</code> and/or{" "}
        <code>bookingDates</code>.
      </div>
    </div>
  );
}
