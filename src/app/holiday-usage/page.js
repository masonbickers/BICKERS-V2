"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enGB from "date-fns/locale/en-GB";
import "react-big-calendar/lib/css/react-big-calendar.css";

/* ── Localiser ─────────────────────────────────────────────────────────── */
const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

/* ── Utils ─────────────────────────────────────────────────────────────── */
const norm = (v) => String(v ?? "").trim().toLowerCase();
const truthy = (v) =>
  v === true || v === 1 || ["true", "1", "yes", "y"].includes(norm(v));
const AMPM = (v) => (norm(v) === "am" ? "AM" : norm(v) === "pm" ? "PM" : null);

function stringToColour(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 70%, 70%)`;
}

/** Parse "YYYY-MM-DD" safely at local midnight (no TZ shift). */
function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const [, Y, M, D] = m.map(Number);
  return new Date(Y, M - 1, D, 0, 0, 0, 0);
}

/** Convert Firestore value to Date (prefers strict YMD parsing). */
function toSafeDate(v) {
  if (!v) return null;
  if (typeof v === "string") {
    const strict = parseYMD(v);
    if (strict) return strict;
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  }
  if (v?.toDate) {
    const d = v.toDate();
    return d;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  }
  return null;
}

const sameYMD = (a, b) =>
  a &&
  b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const eachDateInclusive = (start, end) => {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const out = [];
  for (let d = s; d <= e; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
};
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const countWeekdaysInclusive = (start, end) =>
  eachDateInclusive(start, end).filter((d) => !isWeekend(d)).length;

/** Detect single-day half-day using new + legacy fields */
function getSingleDayHalfMeta(rec, start, end) {
  const single = sameYMD(start, end);
  if (!single) return { single: false, half: false, when: null };

  // New schema
  if (truthy(rec.startHalfDay) && AMPM(rec.startAMPM))
    return { single: true, half: true, when: AMPM(rec.startAMPM) };
  if (truthy(rec.endHalfDay) && AMPM(rec.endAMPM))
    return { single: true, half: true, when: AMPM(rec.endAMPM) };

  // Legacy schema
  if (truthy(rec.halfDay)) {
    const when = AMPM(rec.halfDayPeriod || rec.halfDayType);
    if (when) return { single: true, half: true, when };
  }

  return { single: true, half: false, when: null };
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function HolidayUsagePage() {
  const router = useRouter();

  const [paidDaysByName, setPaidDaysByName] = useState({});
  const [unpaidDaysByName, setUnpaidDaysByName] = useState({});

  const [calendarEvents, setCalendarEvents] = useState([]);
  const [byEmployee, setByEmployee] = useState({});
  const [empAllowance, setEmpAllowance] = useState({});
  const [empCarryOver, setEmpCarryOver] = useState({});

  const [q, setQ] = useState("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [sortKey, setSortKey] = useState("name");

  const DEFAULT_ALLOWANCE = 11;

  useEffect(() => {
    const savedScroll = sessionStorage.getItem("dashboardScroll");
    if (savedScroll) {
      window.scrollTo(0, parseInt(savedScroll, 10));
      sessionStorage.removeItem("dashboardScroll");
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      const currentYear = new Date().getFullYear();
      const yearKey = String(currentYear);

      // Employees (allowances) — ✅ per-year aware
      const allowMap = {};
      const carryMap = {};
      try {
        const empSnap = await getDocs(collection(db, "employees"));
        empSnap.docs.forEach((d) => {
          const x = d.data() || {};
          const name = x.name || x.fullName || x.employee || x.employeeName || x.displayName;
          if (!name) return;

          allowMap[name] =
            x.holidayAllowances?.[yearKey] ??
            Number(x.holidayAllowance ?? DEFAULT_ALLOWANCE);

          carryMap[name] =
            x.carryOverByYear?.[yearKey] ??
            Number(x.carriedOverDays ?? 0);
        });
      } catch {}

      // Holidays (Paid/Unpaid only — Accrued removed)
      const paid = {};
      const unpaid = {};
      const details = {};
      const events = [];
      const colourByEmp = {};

      const holSnap = await getDocs(collection(db, "holidays"));
      holSnap.docs.forEach((docSnap) => {
        const rec = docSnap.data() || {};
        const employee = rec.employee;
        const start = toSafeDate(rec.startDate);
        const end = toSafeDate(rec.endDate) || start;
        const notes = rec.notes || rec.holidayReason || "";

        if (!employee || !start || !end) return;
        if (start.getFullYear() !== end.getFullYear() || start.getFullYear() !== currentYear) return;

        // ❌ Accrued/TOIL removed: ignore these records completely
        const isAccrued =
          rec.isAccrued === true ||
          ["type", "leaveType", "category", "status", "kind", "notes", "holidayReason"]
            .map((k) => norm(rec[k]))
            .some((t) => t.includes("accrued") || t.includes("toil"));
        if (isAccrued) return;

        const isUnpaid =
          rec.isUnpaid === true ||
          rec.unpaid === true ||
          rec.paid === false ||
          ["type", "leaveType", "category", "status", "kind"].some((k) => norm(rec[k]).includes("unpaid"));

        const { single, half, when } = getSingleDayHalfMeta(rec, start, end);
        const days = single && half ? 0.5 : countWeekdaysInclusive(start, end);

        if (isUnpaid) unpaid[employee] = (unpaid[employee] || 0) + days;
        else paid[employee] = (paid[employee] || 0) + days;

        if (!details[employee]) details[employee] = [];
        details[employee].push({
          id: docSnap.id,
          start,
          end,
          days,
          notes,
          unpaid: isUnpaid,
          halfDay: single && half,
          halfWhen: single && half ? when : null,
        });

        const color = (colourByEmp[employee] ||= stringToColour(employee));
        events.push({
          id: docSnap.id,
          status: "Holiday",
          title:
            `${employee} Holiday` +
            (isUnpaid ? " (Unpaid)" : "") +
            (single && half ? ` (½ ${when || ""})` : ""),
          start,
          end: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
          allDay: true,
          employee,
          unpaid: isUnpaid,
          color,
        });
      });

      setPaidDaysByName(paid);
      setUnpaidDaysByName(unpaid);
      setByEmployee(
        Object.fromEntries(
          Object.entries(details).map(([k, v]) => [k, v.sort((a, b) => a.start - b.start)])
        )
      );
      setCalendarEvents(events);
      setEmpAllowance(allowMap);
      setEmpCarryOver(carryMap);
    };

    run();
  }, []);

  const eventStyleGetter = (event) => {
    let bg = event.color || "#cbd5e1";
    let textColor = "#000";
    if (event.unpaid) {
      bg = "#fee2e2";
      textColor = "#7f1d1d";
    }
    return {
      style: {
        backgroundColor: bg,
        borderRadius: "6px",
        border: "none",
        color: textColor,
        padding: "4px",
        fontWeight: 600,
      },
    };
  };

  const allNames = Array.from(
    new Set([
      ...Object.keys(byEmployee),
      ...Object.keys(empAllowance),
      ...Object.keys(empCarryOver),
      ...Object.keys(paidDaysByName),
      ...Object.keys(unpaidDaysByName),
    ])
  )
    .filter((name) => (empAllowance[name] ?? 0) > 0)
    .sort();

  const metrics = (name) => {
    const paid = paidDaysByName[name] || 0;
    const unpaid = unpaidDaysByName[name] || 0;

    const allowance = Number(empAllowance[name] ?? DEFAULT_ALLOWANCE);
    const carried = Number(empCarryOver[name] ?? 0);
    const totalAllowance = allowance + carried;
    const allowBal = totalAllowance - paid;

    return { paid, unpaid, allowance, carried, totalAllowance, allowBal };
  };

  const [qState, setQState] = useState({}); // prevent uncontrolled warnings (noop)

  const namesToShow = allNames
    .filter((n) => n.toLowerCase().includes(q.toLowerCase()))
    .filter((n) => (onlyUnpaid ? (unpaidDaysByName[n] || 0) > 0 : true))
    .sort((a, b) => {
      const A = metrics(a);
      const B = metrics(b);
      switch (sortKey) {
        case "paid": return B.paid - A.paid;
        case "unpaid": return B.unpaid - A.unpaid;
        case "allowBalAsc": return A.allowBal - B.allowBal;
        case "allowBalDesc": return B.allowBal - A.allowBal;
        default: return a.localeCompare(b);
      }
    });

  const currentYearLabel = new Date().getFullYear();

  return (
    <HeaderSidebarLayout>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#333", fontFamily: "Arial, sans-serif", padding: 40 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: "bold" }}>📅 Holiday Overview</h1>
          <button onClick={() => router.push("/holiday-form")} style={{ backgroundColor: "#333", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "6px", fontSize: 16, cursor: "pointer" }}>
            ➕ Add Holiday
          </button>
        </div>

        {/* Calendar */}
        <h2 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>🗓️ Leave Calendar</h2>
        <div style={{ height: "80vh", background: "#fff", borderRadius: 10, padding: 20 }}>
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            views={["month", "week"]}
            defaultView="month"
            style={{ height: "100%" }}
            eventPropGetter={eventStyleGetter}
          />
        </div>

        {/* Legend (Accrued removed, style unchanged) */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "16px 0 12px" }}>
          <LegendSwatch color="#fee2e2" label="Unpaid leave" />
          <LegendSwatch color="#cbd5e1" label="Paid leave (per-employee color)" />
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee…" style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, minWidth: 220, outline: "none" }} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} /> Unpaid &gt; 0
          </label>
          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Sort:</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}>
              <option value="name">Name (A–Z)</option>
              <option value="paid">Paid used (desc)</option>
              <option value="unpaid">Unpaid (desc)</option>
              <option value="allowBalAsc">Allowance balance (asc)</option>
              <option value="allowBalDesc">Allowance balance (desc)</option>
            </select>
            <button onClick={() => { setQ(""); setOnlyUnpaid(false); setSortKey("name"); }} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb" }}>
              Reset
            </button>
          </div>
        </div>

        {/* Employee blocks */}
        <div style={{ marginBottom: 28 }}>
          {namesToShow.map((name) => {
            const m = metrics(name);
            const rows = (byEmployee[name] || []).slice();

            return (
              <details key={name} style={detailsBox}>
                <summary style={summaryBar}>
                  <span>{name}</span>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Pill tone="info">Paid {m.paid}/{m.totalAllowance}</Pill>
                    <Pill tone="warn">Unpaid {m.unpaid}</Pill>
                    <Pill tone="good">Allow Bal {m.allowBal}</Pill>
                  </span>
                </summary>

                <div style={sheetBox}>
                  <div style={yellowHeader}>
                    <div><strong>Name</strong><div style={{ color: "#b91c1c" }}>{name}</div></div>
                    <div><strong>Allowance</strong><div>{m.allowance}</div></div>
                    <div><strong>Carry Over</strong><div>{m.carried}</div></div>
                    <div><strong>Total Allowance</strong><div>{m.totalAllowance}</div></div>
                  </div>

                  <div style={statsGrid}>
                    <Stat label="Paid Used"><Pill tone="info">{m.paid}</Pill><span style={{ opacity: 0.6, margin: "0 6px" }}>/</span><Pill tone="gray">{m.totalAllowance}</Pill></Stat>
                    <Stat label="Unpaid Days"><Pill tone="warn">{m.unpaid}</Pill></Stat>
                    <Stat label="Allowance Balance"><Pill tone="good">{m.allowBal}</Pill></Stat>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th style={th}>Date From</th>
                        <th style={th}>Date To</th>
                        <th style={th}>Days</th>
                        <th style={th}>Type</th>
                        <th style={th}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td style={td} colSpan={5}>(No leave booked)</td></tr>
                      ) : (
                        rows.map((row, i) => {
                          const typeLabel = row.unpaid ? "Unpaid" : "Paid";
                          const typeColor = row.unpaid ? "#b91c1c" : "#065f46";
                          return (
                            <tr
                              key={row.id}
                              onClick={() => {
                                sessionStorage.setItem("dashboardScroll", window.scrollY.toString());
                                router.push(`/edit-holiday/${row.id}`);
                              }}
                              style={{ cursor: "pointer", backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb", transition: "background-color 0.2s ease" }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e0f2fe")}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#fff" : "#f9fafb")}
                            >
                              <td style={td}>{format(row.start, "EEE d MMM")}</td>
                              <td style={td}>{format(row.end, "EEE d MMM")}</td>
                              <td style={{ ...td, textAlign: "center", width: 120 }}>
                                {row.days}
                                {row.halfDay ? " (½)" : ""}
                              </td>
                              <td style={{ ...td, color: typeColor, fontWeight: 700 }}>
                                {row.halfDay ? `Half-Day${row.halfWhen ? ` (${row.halfWhen})` : ""} ` : ""}
                                {typeLabel}
                              </td>
                              <td style={td}>{row.notes || ""}</td>
                            </tr>
                          );
                        })
                      )}
                      <tr>
                        <td style={{ ...td, fontWeight: 700 }}>Allowance Balance</td>
                        <td style={td}></td>
                        <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{metrics(name).allowBal}</td>
                        <td style={td}></td>
                        <td style={td}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* Small UI helpers */
function Pill({ children, tone = "default" }) {
  const tones = {
    default: { bg: "#f3f4f6", fg: "#111827", br: "#e5e7eb" },
    good: { bg: "#dcfce7", fg: "#14532d", br: "#bbf7d0" },
    warn: { bg: "#fee2e2", fg: "#7f1d1d", br: "#fecaca" },
    info: { bg: "#e0f2fe", fg: "#0c4a6e", br: "#bae6fd" },
    teal: { bg: "#ccfbf1", fg: "#134e4a", br: "#99f6e4" },
    gray: { bg: "#e5e7eb", fg: "#374151", br: "#d1d5db" },
  };
  const t = tones[tone] || tones.default;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: t.bg, color: t.fg, border: `1px solid ${t.br}`, fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: "center" }}>
      {children}
    </span>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 14, height: 14, background: color, borderRadius: 4, display: "inline-block", border: "1px solid #e5e7eb" }} />
      <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>{children}</div>
    </div>
  );
}

/* Table styles */
const th = { textAlign: "left", borderBottom: "2px solid #ccc", padding: "12px", fontWeight: "bold", whiteSpace: "nowrap" };
const td = { padding: "12px", borderBottom: "1px solid #eee", verticalAlign: "middle" };
const detailsBox = { background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12, overflow: "hidden" };
const summaryBar = { cursor: "pointer", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f3f4f6", fontWeight: 600, gap: 12 };
const sheetBox = { padding: 16 };
const yellowHeader = { display: "grid", gridTemplateColumns: "1.5fr repeat(3, 1fr)", gap: 16, background: "#fde68a", border: "1px solid #f59e0b", borderRadius: 8, padding: 12, marginBottom: 12 };
const statsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 10 };
