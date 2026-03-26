"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

const UI = {
  radius: 18,
  radiusSm: 12,
  gap: 12,
  shadowSm: "0 12px 32px rgba(15,23,42,0.07)",
  border: "1px solid #dbe2ea",
  bg: "#edf3f8",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  good: "#166534",
  goodSoft: "#ecfdf5",
  warn: "#b45309",
  warnSoft: "#fffbeb",
};

const pageWrap = { padding: "14px 12px 20px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 6,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: "-0.01em" };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };
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
  { key: "holidayPaid", label: "Holiday Paid" },
  { key: "holidayUnpaid", label: "Holiday Unpaid" },
  { key: "other", label: "Other" },
];

function parseYyyyMmDd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [Y, M, D] = String(s).split("-").map((n) => +n);
  return new Date(Date.UTC(Y, M - 1, D));
}

function formatYyyyMmDd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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

function normaliseName(n) {
  return String(n || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function titleCase(n) {
  return String(n || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

function classifyNote(rawNote) {
  const norm = String(rawNote || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return { key: "onSet", label: "On Set", priority: 50 };
  if (norm === "on set" || norm === "shoot day") return { key: "onSet", label: "On Set", priority: 50 };
  if (norm === "travel day" || norm === "travel time") return { key: "travel", label: "Travel", priority: 40 };
  if (norm === "1/2 day travel" || norm === "1/2 day travel day" || norm === "half day travel") {
    return { key: "halfTravel", label: "1/2 Travel", priority: 35 };
  }
  if (norm === "rig day") return { key: "yard", label: "Yard / Rig", priority: 34 };
  if (norm === "standby day") return { key: "standby", label: "Standby", priority: 33 };
  if (norm.includes("turnaround")) return { key: "turnaround", label: "Turnaround", priority: 32 };
  if (norm === "rest day") return { key: "rest", label: "Rest", priority: 10 };
  if (norm.includes("night shoot")) return { key: "nightShoot", label: "Night Shoot", priority: 45 };
  if (norm.includes("split day") || norm.includes("spilt day")) return { key: "splitDay", label: "Split Day", priority: 30 };
  if (norm === "rehearsal day") return { key: "rehearsal", label: "Rehearsal", priority: 28 };
  if (norm === "recce day") return { key: "recce", label: "Recce", priority: 27 };
  return { key: "other", label: titleCase(norm), priority: 20 };
}

function eachDateYMD(startRaw, endRaw) {
  const start = parseYyyyMmDd(String(startRaw || "").slice(0, 10)) || parseYyyyMmDd(startRaw);
  const end = parseYyyyMmDd(String(endRaw || "").slice(0, 10)) || parseYyyyMmDd(endRaw || startRaw);
  if (!start || !end) return [];
  const out = [];
  let cur = new Date(start);
  const endDt = new Date(end);
  while (cur <= endDt) {
    out.push(formatYyyyMmDd(cur));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

const summaryCard = {
  background: "#fff",
  border: UI.border,
  borderRadius: 10,
  padding: "6px 9px",
  display: "grid",
  gap: 1,
  minHeight: 0,
};

export default function EmployeeWorkBreakdownPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const employeeKey = decodeURIComponent(String(params?.employeeKey || ""));
  const employeeName = searchParams.get("name") || employeeKey;

  const [mode, setMode] = useState(searchParams.get("mode") || "lastNDays");
  const [rangeDays, setRangeDays] = useState(Number(searchParams.get("rangeDays") || 30));
  const [fromDate, setFromDate] = useState(searchParams.get("fromDate") || "");
  const [toDate, setToDate] = useState(searchParams.get("toDate") || "");
  const [loading, setLoading] = useState(true);
  const [dayRows, setDayRows] = useState([]);

  const effectiveRange = useMemo(() => {
    const today0 = startOfTodayUTC();
    const end = new Date(today0);
    end.setUTCDate(end.getUTCDate() - 1);

    if (mode === "lastNDays") {
      const start = new Date(end);
      start.setUTCDate(end.getUTCDate() - (Math.max(1, rangeDays) - 1));
      return { since: start, until: end };
    }

    const f = parseYyyyMmDd(fromDate) ?? end;
    const t = parseYyyyMmDd(toDate) ?? end;
    const until = new Date(Math.min(+t, +end));
    const since = new Date(Math.min(+f, +until));
    return { since, until };
  }, [mode, rangeDays, fromDate, toDate]);

  const todayISO = (() => {
    const t = startOfTodayUTC();
    t.setUTCDate(t.getUTCDate() - 1);
    return formatYyyyMmDd(t);
  })();

  useEffect(() => {
    let live = true;

    (async () => {
      setLoading(true);
      try {
        const [bookingsSnap, holidaysSnap] = await Promise.all([
          getDocs(collection(db, "bookings")),
          getDocs(collection(db, "holidays")),
        ]);

        const byDate = new Map();
        const putRow = (dateKey, next) => {
          const prev = byDate.get(dateKey);
          if (!prev || (next.priority || 0) > (prev.priority || 0)) {
            byDate.set(dateKey, next);
          }
        };

        bookingsSnap.forEach((docSnap) => {
          const booking = docSnap.data() || {};
          const status = String(booking.status || "").trim();
          if (status !== "Confirmed" && status !== "Complete") return;

          const employeeListRaw = booking.employees || [];
          const employees = employeeListRaw
            .map((e) => {
              if (typeof e === "string") return { id: null, name: e, role: "Precision Driver" };
              return {
                id: e && e.id ? e.id : null,
                name: (e && (e.name || e.fullName)) || "",
                role: (e && e.role) || "",
              };
            })
            .filter((e) => (e.id || e.name)?.trim())
            .filter((e) => {
              const role = String(e.role || "").trim().toLowerCase();
              return role !== "freelancer" && role !== "freelance";
            });

          const matchesEmployee = employees.some((emp) => {
            const empKey = emp.id || normaliseName(emp.name);
            return String(empKey) === employeeKey;
          });
          if (!matchesEmployee) return;

          const noteKeys = Object.keys(booking.notesByDate || {});
          const dateSet = new Set(noteKeys.filter((d) => isDateInRange(d, effectiveRange.since, effectiveRange.until)));
          if (Array.isArray(booking.bookingDates)) {
            booking.bookingDates.forEach((d) => {
              if (isDateInRange(d, effectiveRange.since, effectiveRange.until)) dateSet.add(d);
            });
          }

          for (const dayKey of dateSet) {
            const note = getNoteForDate(booking, dayKey);
            const category = classifyNote(note);
            putRow(dayKey, {
              date: dayKey,
              typeKey: category.key,
              typeLabel: category.label,
              source: "booking",
              bookingLabel: booking.jobNumber
                ? `#${booking.jobNumber}${booking.client ? ` - ${booking.client}` : ""}`
                : booking.client || "Booking",
              note: note || "On Set",
              priority: category.priority,
            });
          }
        });

        holidaysSnap.forEach((docSnap) => {
          const holiday = docSnap.data() || {};
          const employeeMatch = normaliseName(holiday.employee) === normaliseName(employeeName);
          if (!employeeMatch) return;
          const status = String(holiday.status || "").toLowerCase();
          if (holiday.deleted === true || holiday.isDeleted === true || status === "deleted") return;

          const paidLabel = String(holiday.paidStatus || holiday.leaveType || "").trim();
          const isUnpaid = paidLabel.toLowerCase() === "unpaid";
          const holidayTypeKey = isUnpaid ? "holidayUnpaid" : "holidayPaid";
          const holidayTypeLabel = isUnpaid ? "Holiday - Unpaid" : "Holiday - Paid";

          eachDateYMD(holiday.startDate, holiday.endDate).forEach((dayKey) => {
            if (!isDateInRange(dayKey, effectiveRange.since, effectiveRange.until)) return;
            putRow(dayKey, {
              date: dayKey,
              typeKey: holidayTypeKey,
              typeLabel: holidayTypeLabel,
              source: "holiday",
              bookingLabel: "Holiday",
              note: paidLabel || holidayTypeLabel,
              priority: 100,
            });
          });
        });

        const finalRows = [];
        let cursor = new Date(effectiveRange.since);
        const end = new Date(effectiveRange.until);
        while (cursor <= end) {
          const dayKey = formatYyyyMmDd(cursor);
          const existing = byDate.get(dayKey);
          if (existing) {
            finalRows.push(existing);
          } else {
            const dayOfWeek = cursor.getUTCDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              finalRows.push({
                date: dayKey,
                typeKey: "yard",
                typeLabel: "Yard / Base",
                source: "default",
                bookingLabel: "Base Day",
                note: "Default weekday yard/base day",
                priority: 5,
              });
            } else {
              finalRows.push({
                date: dayKey,
                typeKey: "other",
                typeLabel: "Weekend / Off",
                source: "default",
                bookingLabel: "Off",
                note: "No booking or holiday",
                priority: 0,
              });
            }
          }
          cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        }

        if (live) setDayRows(finalRows);
      } catch (err) {
        console.error("Error loading employee work breakdown:", err);
        if (live) setDayRows([]);
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [employeeKey, employeeName, effectiveRange]);

  const summary = useMemo(() => {
    const totals = Object.fromEntries(BREAKDOWN_COLUMNS.map((col) => [col.key, 0]));
    dayRows.forEach((row) => {
      if (Object.prototype.hasOwnProperty.call(totals, row.typeKey)) totals[row.typeKey] += 1;
    });
    return totals;
  }, [dayRows]);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h1 style={{ color: UI.text, fontSize: 25, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
              {titleCase(employeeName)}
            </h1>
            <div style={{ color: UI.muted, fontSize: 12, marginTop: 3 }}>
              Detailed work breakdown for the selected reporting window.
            </div>
          </div>
          <button type="button" onClick={() => router.push("/employee-home")} style={btn("ghost")}>
            Back to Employee Home
          </button>
        </div>

        <section style={{ ...surface, padding: 10 }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Reporting Window</h2>
              <div style={hint}>Change the date range for this employee only.</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setMode("lastNDays")} style={{ ...btn("pill"), background: mode === "lastNDays" ? UI.brandSoft : "#fff", color: mode === "lastNDays" ? UI.brand : UI.text }}>
                Last N Days
              </button>
              <button type="button" onClick={() => setMode("customRange")} style={{ ...btn("pill"), background: mode === "customRange" ? UI.brandSoft : "#fff", color: mode === "customRange" ? UI.brand : UI.text }}>
                Custom Range
              </button>
            </div>

            {mode === "lastNDays" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={smallLabel}>Days</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={rangeDays}
                    onChange={(e) => setRangeDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
                    style={{ ...inputBase, width: 84, padding: "7px 8px" }}
                  />
                </div>
                {[30, 60, 90].map((n) => (
                  <button
                    key={n}
                    type="button"
                    style={{ ...btn("pill"), background: rangeDays === n ? UI.brandSoft : "#fff", color: rangeDays === n ? UI.brand : UI.text }}
                    onClick={() => setRangeDays(n)}
                  >
                    {n}d
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={smallLabel}>From</span>
                  <input type="date" max={todayISO} value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ ...inputBase, width: 160, padding: "7px 8px" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={smallLabel}>To</span>
                  <input type="date" max={todayISO} value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ ...inputBase, width: 160, padding: "7px 8px" }} />
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          style={{
            ...surface,
            padding: 10,
            marginTop: 10,
          }}
        >
          <div style={{ ...sectionHeader, marginBottom: 4 }}>
            <div>
              <h2 style={titleMd}>Summary</h2>
              <div style={hint}>Compact work-type totals for this employee.</div>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
              gap: 6,
            }}
          >
          {BREAKDOWN_COLUMNS.map((column) => (
            <div key={column.key} style={summaryCard}>
              <div style={{ fontSize: 10.5, color: UI.muted, fontWeight: 800, lineHeight: 1.2 }}>{column.label}</div>
              <div style={{ fontSize: 16, color: UI.text, fontWeight: 900, lineHeight: 1 }}>{summary[column.key] || 0}</div>
            </div>
          ))}
          </div>
        </section>

        <section style={{ ...surface, padding: 10, marginTop: 10 }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Day By Day</h2>
              <div style={hint}>
                Weekdays without a booking or holiday are counted as yard/base days.
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>Loading breakdown…</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 820 }}>
                <thead>
                  <tr>
                    <th style={tableHeadLeft}>Date</th>
                    <th style={tableHead}>Type</th>
                    <th style={tableHead}>Source</th>
                    <th style={tableHead}>Job / Context</th>
                    <th style={tableHead}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((row) => (
                    <tr key={row.date}>
                      <td style={tableCellLeft}>{row.date}</td>
                      <td style={tableCell}>{row.typeLabel}</td>
                      <td style={tableCell}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: `1px solid ${row.source === "holiday" ? "#fcd34d" : row.source === "booking" ? UI.brandBorder : "#d1d5db"}`,
                            background: row.source === "holiday" ? UI.warnSoft : row.source === "booking" ? UI.brandSoft : "#f8fafc",
                            color: row.source === "holiday" ? UI.warn : row.source === "booking" ? UI.brand : UI.muted,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {titleCase(row.source)}
                        </span>
                      </td>
                      <td style={{ ...tableCell, textAlign: "left" }}>{row.bookingLabel}</td>
                      <td style={{ ...tableCell, textAlign: "left" }}>{row.note}</td>
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

const tableHead = {
  padding: "8px 10px",
  background: "#f8fbfd",
  borderTop: UI.border,
  borderBottom: UI.border,
  borderRight: UI.border,
  fontSize: 11.5,
  fontWeight: 900,
  color: UI.text,
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tableHeadLeft = {
  ...tableHead,
  borderLeft: UI.border,
  textAlign: "left",
};

const tableCell = {
  padding: "7px 10px",
  borderBottom: UI.border,
  borderRight: UI.border,
  fontSize: 12.5,
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
};
