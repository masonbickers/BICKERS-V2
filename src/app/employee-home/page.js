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
  accent: "#2563eb", // blue-600
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

        // For de-duping: employee/date pair set
        const seen = new Set();
        // Count map: key = employeeKey (id || normalised name)
        const counts = new Map();

        const now = new Date();
        const since = new Date(now);
        since.setDate(now.getDate() - rangeDays);

        snapshot.forEach((docSnap) => {
          const booking = docSnap.data() || {};

          // employees can be ["Jane Doe"] or [{id, name}]
          const employeeListRaw = booking.employees || [];
          const employees = employeeListRaw
            .map((e) =>
              typeof e === "string"
                ? { id: null, name: e }
                : { id: e?.id || null, name: e?.name || e?.fullName || "" }
            )
            .filter((e) => (e.id || e.name)?.trim());

          // Map of "YYYY-MM-DD" => note (string) or {note: "..."} etc.
          const notesByDate = booking.notesByDate || {};

          // Collect qualifying dates = exactly "On Set" AND within range
          const onSetDates = Object.entries(notesByDate)
            .filter(([, raw]) => {
              const note =
                typeof raw === "string"
                  ? raw
                  : typeof raw === "object" && raw
                  ? raw.note || raw.status || raw.label || ""
                  : "";
              return (note || "").trim().toLowerCase() === "on set";
            })
            .map(([dateStr]) => dateStr)
            .filter((d) => isDateInRange(d, since, now));

          // Unique employees per booking (avoid double within one booking)
          const uniqueEmployees = dedupeEmployees(employees);

          // Increment counts per (employee,date) once across ALL bookings
          for (const d of onSetDates) {
            for (const emp of uniqueEmployees) {
              const empKey = emp.id || normaliseName(emp.name);
              const pairKey = `${empKey}@@${d}`;
              if (seen.has(pairKey)) continue;
              seen.add(pairKey);

              counts.set(empKey, {
                id: emp.id || null,
                name: emp.name,
                days: (counts.get(empKey)?.days || 0) + 1,
              });
            }
          }
        });

        // Build chart data with initials + keep full for tooltip
        const chartData = [...counts.values()]
          .map((e) => ({
            key: e.id || normaliseName(e.name),
            name: initialsOf(e.name),
            fullName: titleCase(e.name),
            days: e.days,
          }))
          .sort((a, b) => b.days - a.days);

        if (isMounted) setUsageData(chartData);
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
            Quick links and a live snapshot of <strong>On Set</strong> days.
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
                  On Set Days (Last {rangeDays} Days)
                </div>
                <div style={tiny}>
                  Counts each employee once per date, even across multiple bookings.
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
                      allowDecimals={false}
                      tick={{ fill: "#475569", fontSize: 12 }}
                      axisLine={{ stroke: "rgba(0,0,0,0.15)" }}
                      tickLine={{ stroke: "rgba(0,0,0,0.15)" }}
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
                        return [`${value} day${value === 1 ? "" : "s"}`, full];
                      }}
                    />
                    <Bar dataKey="days" fill={UI.accent} radius={[6, 6, 0, 0]}>
                      <LabelList
                        dataKey="days"
                        position="top"
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
                  <span style={tiny}>Employee initials (hover shows full name)</span>
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
   Helpers
──────────────────────────────────────────────────────────────────────────── */
function isDateInRange(yyyyMmDd, from, to) {
  // Expecting "YYYY-MM-DD". If not, try Date fallback.
  const safe = parseYyyyMmDd(yyyyMmDd) ?? new Date(yyyyMmDd);
  if (Number.isNaN(+safe)) return false;
  // normalise to 00:00 to 23:59 range
  const d = new Date(Date.UTC(safe.getFullYear(), safe.getMonth(), safe.getDate()));
  const F = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const T = new Date(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()));
  return d >= F && d <= T;
}

function parseYyyyMmDd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [Y, M, D] = s.split("-").map((n) => +n);
  const date = new Date(Date.UTC(Y, M - 1, D));
  return date;
}

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
        We didn’t find any <strong>On Set</strong> days in the selected range. Try a longer range, or
        check that your bookings include <code>notesByDate["YYYY-MM-DD"] = "On Set"</code>.
      </div>
    </div>
  );
}
