"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
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
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
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

const sectionHeader = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const titleMd = { fontSize: 16, fontWeight: 900, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12, marginTop: 4 };

const btn = (kind = "primary") => {
  if (kind === "approve") {
    return {
      padding: "8px 10px",
      borderRadius: UI.radiusSm,
      border: "1px solid #86efac",
      background: "#d1fae5",
      color: "#065f46",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  if (kind === "decline") {
    return {
      padding: "8px 10px",
      borderRadius: UI.radiusSm,
      border: "1px solid #fecaca",
      background: "#fee2e2",
      color: "#991b1b",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
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

/* Table styles (match your other tables) */
const tableWrap = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  position: "sticky",
  top: 0,
  background: "#f8fafc",
  zIndex: 1,
  whiteSpace: "nowrap",
};
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };

const listReset = { listStyle: "none", padding: 0, margin: 0 };
const liItem = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#fff",
};

/* breakdown cell styles */
const breakdownWrap = {
  maxHeight: 160,
  overflowY: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#f8fafc",
};
const breakdownList = { margin: 0, padding: 0, display: "grid", gap: 6 };
const breakdownRow = (muted) => ({
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: muted ? "#f3f4f6" : "#fff",
  color: muted ? "#6b7280" : UI.text,
});

/* ───────── helpers ───────── */
const norm = (v) => String(v ?? "").trim().toLowerCase();
const truthy = (v) =>
  v === true ||
  v === 1 ||
  norm(v) === "true" ||
  norm(v) === "1" ||
  norm(v) === "yes" ||
  norm(v) === "y";
const ampm = (v) => {
  const t = norm(v);
  if (t === "am") return "AM";
  if (t === "pm") return "PM";
  return null;
};

function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}
function sameYMD(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmt(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtShort(d) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function eachDateInclusive(start, end) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const out = [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}

/**
 * Returns half-day info for start and/or end.
 * Supports new fields and legacy, with string booleans and mixed casing.
 * { single: boolean, start: {half:boolean, when:'AM'|'PM'|null}, end: {...} }
 */
function getHalfInfo(h) {
  const s = toDate(h.startDate);
  const e = toDate(h.endDate) || s;
  const single = s && e ? sameYMD(s, e) : false;

  // New fields (preferred)
  let start = { half: false, when: null };
  let end = { half: false, when: null };

  if (truthy(h.startHalfDay)) {
    start.half = true;
    start.when = ampm(h.startAMPM);
  }
  if (truthy(h.endHalfDay)) {
    end.half = true;
    end.when = ampm(h.endAMPM);
  }

  // Legacy fallback
  if (truthy(h.halfDay)) {
    const side = norm(h.halfDaySide || h.halfDayAt);
    const when = ampm(h.halfDayPeriod || h.halfDayType);
    if (side.includes("start") || side.includes("first")) {
      start.half = true;
      start.when = start.when || when;
    } else if (side.includes("end") || side.includes("last")) {
      end.half = true;
      end.when = end.when || when;
    } else if (!single) {
      start.half = start.half || true;
      start.when = start.when || when;
    }
  }

  return { single, start, end };
}

/** Build a per-day breakdown. Weekends omitted by default. */
function buildBreakdown(h, includeWeekends = false) {
  const s = toDate(h.startDate);
  const e = toDate(h.endDate) || s;
  if (!s || !e) return [];

  const days = eachDateInclusive(s, e);
  const { single, start, end } = getHalfInfo(h);

  return days
    .map((d, idx) => {
      const weekend = isWeekend(d);
      if (!includeWeekends && weekend) return null;

      let label = "Full day";
      if (single) {
        if (start.half || end.half) {
          const when = start.when || end.when;
          label = `Half day${when ? ` (${when})` : ""}`;
        }
      } else {
        if (idx === 0 && start.half) label = `Half day${start.when ? ` (${start.when})` : ""}`;
        else if (idx === days.length - 1 && end.half) label = `Half day${end.when ? ` (${end.when})` : ""}`;
        else label = weekend ? "Weekend (ignored)" : "Full day";
      }

      return { key: d.toISOString(), date: fmtShort(d), label, muted: weekend };
    })
    .filter(Boolean);
}

/** Convert a holiday record to numeric days (excl. weekends). */
function daysForHoliday(h) {
  const breakdown = buildBreakdown(h, false);
  let total = 0;
  for (const row of breakdown) {
    const lbl = String(row.label || "").toLowerCase();
    if (lbl.startsWith("full day")) total += 1;
    else if (lbl.startsWith("half day")) total += 0.5;
  }
  return total;
}

/* ───────── page ───────── */
export default function HRPage() {
  const router = useRouter();
  const [requestedHolidays, setRequestedHolidays] = useState([]);
  const [usageData, setUsageData] = useState([]); // for the graph
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "holidays"));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const pending = all.filter((h) => !h.status || String(h.status).toLowerCase() === "requested");
      setRequestedHolidays(pending);

      const approved = all.filter((h) => String(h.status || "").toLowerCase() === "approved");

      const usageByEmp = new Map(); // name -> days
      approved.forEach((h) => {
        const name = (h.employee && String(h.employee)) || (h.employeeCode && String(h.employeeCode)) || "Unknown";
        const key = name.trim() || "Unknown";
        const days = daysForHoliday(h);
        usageByEmp.set(key, (usageByEmp.get(key) || 0) + days);
      });

      const usageArr = Array.from(usageByEmp.entries())
        .map(([name, days]) => ({ name, days: Number(days.toFixed(2)) }))
        .sort((a, b) => b.days - a.days);

      setUsageData(usageArr);
    } catch (err) {
      console.error("Error fetching holidays:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const ref = doc(db, "holidays", id);
      await updateDoc(ref, { status });
      await fetchHolidays();
    } catch (err) {
      console.error("Error updating status:", err);
      alert("❌ Error updating holiday status");
    }
  };

  const documents = [
    { title: "Holiday Request Form", description: "Submit and track time off requests.", link: "/holiday-form" },
    { title: "View Holiday Usage", description: "Check how much holiday each employee has used.", link: "/holiday-usage" },
    { title: "Timesheets", description: "View, submit, and track weekly timesheets.", link: "/timesheets" },
    { title: "Sick Leave Form", description: "Report absences due to illness.", link: "/sick-leave" },
    { title: "HR Policy Manual", description: "View company policies and employee handbook.", link: "/hr-policies" },
    { title: "Contract Upload", description: "Upload new starter contracts and documentation.", link: "/upload-contract" },
  ];

  const renderLabel = (props) => {
    const { x, y, width, value } = props;
    if (value == null) return null;
    const v = Number(value);
    const text = Math.abs(v - Math.round(v)) < 1e-6 ? v.toFixed(0) : v.toFixed(2);
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        textAnchor="middle"
        fill="#0f172a"
        style={{ fontSize: 11, fontWeight: 800 }}
      >
        {text}
      </text>
    );
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>HR</h1>
            <div style={sub}>Holiday usage, approvals and HR shortcuts.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>{loading ? "Loading…" : `${requestedHolidays.length} requests`}</div>
            <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
              Approved usage: <b style={{ marginLeft: 6 }}>{usageData.length}</b>
            </div>
          </div>
        </div>

        {/* Top row: Chart + Requests */}
        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: UI.gap, alignItems: "start" }}>
          {/* 📊 Usage chart */}
          <section style={card}>
            <div style={sectionHeader}>
              <div>
                <h2 style={titleMd}>Employee holiday usage</h2>
                <div style={hint}>Approved holiday taken per employee (weekdays only). Half days = 0.5.</div>
              </div>
              <div style={chip}>Chart</div>
            </div>

            {usageData.length === 0 ? (
              <div style={{ color: UI.muted, fontSize: 13, padding: "8px 2px" }}>
                No approved holidays yet, so there’s nothing to chart.
              </div>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageData} margin={{ top: 16, right: 24, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      tickLine={{ stroke: "#e5e7eb" }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      allowDecimals
                      tick={{ fontSize: 12, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      tickLine={{ stroke: "#e5e7eb" }}
                      label={{
                        value: "Days used",
                        angle: -90,
                        position: "insideLeft",
                        offset: 8,
                        style: { fontSize: 12, fill: "#6b7280" },
                      }}
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
                      formatter={(value, _name, props) => {
                        const num = Number(value);
                        const v = Math.abs(num - Math.round(num)) < 1e-6 ? num.toFixed(0) : num.toFixed(2);
                        return [`${v} days`, props?.payload?.name || ""];
                      }}
                    />
                    <Bar dataKey="days" fill={UI.brand} radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="days" content={renderLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* 📌 Requested holidays */}
          <section style={card}>
            <div style={sectionHeader}>
              <div>
                <h2 style={titleMd}>Requested holidays</h2>
                <div style={hint}>Approve or decline pending requests.</div>
              </div>
              <div style={chip}>{requestedHolidays.length}</div>
            </div>

            {requestedHolidays.length === 0 ? (
              <div style={{ color: UI.muted, fontSize: 13, padding: "8px 2px" }}>No pending holiday requests.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {requestedHolidays.slice(0, 6).map((h) => {
                  const fromD = toDate(h.startDate);
                  const toD = toDate(h.endDate) || fromD;
                  const type = String(h.leaveType || h.paidStatus || "Other");
                  const { single, start, end } = getHalfInfo(h);

                  let typeHint = "";
                  if (single && (start.half || end.half)) {
                    typeHint = `Half ${start.when || end.when || ""}`.trim();
                  } else if (!single && (start.half || end.half)) {
                    const bits = [];
                    if (start.half) bits.push(`Start half${start.when ? ` (${start.when})` : ""}`);
                    if (end.half) bits.push(`End half${end.when ? ` (${end.when})` : ""}`);
                    typeHint = bits.join(", ");
                  }

                  return (
                    <div key={h.id} style={{ ...surface, padding: 12, borderRadius: 12, boxShadow: "none" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900, color: UI.text }}>
                          {h.employee || h.employeeCode || "Unknown"}
                        </div>
                        <span style={chip}>{type}</span>
                      </div>

                      <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>
                        {fmt(fromD)} → {fmt(toD)}
                        {typeHint ? <span style={{ marginLeft: 8, fontWeight: 900, color: UI.text }}>• {typeHint}</span> : null}
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button style={btn("approve")} onClick={() => updateStatus(h.id, "approved")} type="button">
                          Approve
                        </button>
                        <button style={btn("decline")} onClick={() => updateStatus(h.id, "declined")} type="button">
                          Decline
                        </button>
                        <button
                          style={btn("ghost")}
                          onClick={() => router.push("/holiday-usage")}
                          type="button"
                        >
                          View usage →
                        </button>
                      </div>
                    </div>
                  );
                })}

                {requestedHolidays.length > 6 ? (
                  <div style={{ color: UI.muted, fontSize: 12, marginTop: 2 }}>
                    Showing 6 of {requestedHolidays.length}. Open Holiday Usage for more.
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>

        {/* Full requests table */}
        <section style={{ ...card, marginTop: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>All requested holidays</h2>
              <div style={hint}>Full breakdown per request (weekdays only).</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={btn("ghost")} onClick={fetchHolidays} type="button">
                Refresh
              </button>
              <button style={btn()} onClick={() => router.push("/holiday-form")} type="button">
                Holiday form →
              </button>
            </div>
          </div>

          {requestedHolidays.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>No pending holiday requests.</div>
          ) : (
            <div style={tableWrap}>
              <table style={tableEl}>
                <thead>
                  <tr>
                    <th style={th}>Employee</th>
                    <th style={th}>From</th>
                    <th style={th}>To</th>
                    <th style={th}>Type</th>
                    <th style={th}>Breakdown</th>
                    <th style={th}>Notes</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requestedHolidays.map((h) => {
                    const fromD = toDate(h.startDate);
                    const toD = toDate(h.endDate) || fromD;
                    const type = String(h.leaveType || h.paidStatus || "Other");
                    const breakdown = buildBreakdown(h, false);
                    const notes = (h.notes || h.holidayReason || "").trim() || "—";

                    const { single, start, end } = getHalfInfo(h);
                    let typeHint = "";
                    if (single && (start.half || end.half)) {
                      typeHint = ` • Half${start.when || end.when ? ` (${start.when || end.when})` : ""}`;
                    } else if (!single && (start.half || end.half)) {
                      const bits = [];
                      if (start.half) bits.push(`Start half${start.when ? ` (${start.when})` : ""}`);
                      if (end.half) bits.push(`End half${end.when ? ` (${end.when})` : ""}`);
                      typeHint = bits.length ? ` • ${bits.join(", ")}` : "";
                    }

                    return (
                      <tr key={h.id}>
                        <td style={td}>{h.employee || h.employeeCode || "Unknown"}</td>
                        <td style={td}>{fmt(fromD)}</td>
                        <td style={td}>{fmt(toD)}</td>
                        <td style={td}>
                          <span style={{ fontWeight: 900, color: UI.text }}>{type}</span>
                          <span style={{ color: UI.muted }}>{typeHint}</span>
                        </td>
                        <td style={td}>
                          {breakdown.length === 0 ? (
                            <span style={{ color: UI.muted }}>—</span>
                          ) : (
                            <div style={breakdownWrap}>
                              <div style={breakdownList}>
                                {breakdown.map((row) => (
                                  <div key={row.key} style={breakdownRow(row.muted)}>
                                    <span style={{ fontWeight: 900, whiteSpace: "nowrap" }}>{row.date}</span>
                                    <span style={{ color: row.muted ? "#6b7280" : UI.text }}>— {row.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={td} title={notes}>
                          <div style={{ maxWidth: 320, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {notes}
                          </div>
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button style={btn("approve")} onClick={() => updateStatus(h.id, "approved")} type="button">
                              Approve
                            </button>
                            <button style={btn("decline")} onClick={() => updateStatus(h.id, "declined")} type="button">
                              Decline
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* HR Docs */}
        <section style={{ marginTop: UI.gap }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>HR shortcuts</div>
            <div style={{ color: UI.muted, fontSize: 12 }}>Open related pages</div>
          </div>

          <div style={grid(4)}>
            {documents.map((d, idx) => (
              <div
                key={idx}
                style={card}
                onClick={() => router.push(d.link)}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, card)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? router.push(d.link) : null)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: UI.text }}>{d.title}</div>
                  <span style={chip}>Open</span>
                </div>
                <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{d.description}</div>
                <div style={{ marginTop: 10, fontWeight: 900, color: UI.brand }}>Open →</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}
