"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enGB from "date-fns/locale/en-GB";
import "react-big-calendar/lib/css/react-big-calendar.css";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

function stringToColour(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 70%, 70%)`;
}

// Helpers
const toDate = (v) =>
  v?.toDate ? v.toDate() : typeof v === "string" || typeof v === "number" ? new Date(v) : null;

const eachDateInclusive = (start, end) => {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const out = [];
  for (let d = s; d <= e; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
};

const isWeekend = (d) => {
  const day = d.getDay();
  return day === 0 || day === 6;
};

const countWeekdaysInclusive = (start, end) =>
  eachDateInclusive(start, end).filter((d) => !isWeekend(d)).length;

const text = (v) => (typeof v === "string" ? v.toLowerCase() : "");

export default function HolidayUsagePage() {
  // Totals
  const [paidDaysByName, setPaidDaysByName] = useState({});
  const [unpaidDaysByName, setUnpaidDaysByName] = useState({});
  const [accruedEarnedByName, setAccruedEarnedByName] = useState({});
  const [accruedTakenByName, setAccruedTakenByName] = useState({});

  // UI data
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [employeeColours, setEmployeeColours] = useState({});
  const [byEmployee, setByEmployee] = useState({}); // detail rows

  // Read-only allowances
  const [empAllowance, setEmpAllowance] = useState({});
  const [empCarryOver, setEmpCarryOver] = useState({});

  // Filters (✅ top-level hooks)
  const [q, setQ] = useState("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [onlyAccruedPos, setOnlyAccruedPos] = useState(false);
  const [sortKey, setSortKey] = useState("name"); // name | paid | unpaid | accBal | allowBalAsc | allowBalDesc

  const router = useRouter();
  const DEFAULT_ALLOWANCE = 11;

  useEffect(() => {
    const run = async () => {
      const currentYear = new Date().getFullYear();

      // -------- Employees (allowances)
      const allowMap = {};
      const carryMap = {};
      try {
        const empSnap = await getDocs(collection(db, "employees"));
        empSnap.docs.forEach((d) => {
          const x = d.data() || {};
          const name = x.name || x.fullName || x.employee || x.employeeName || x.displayName;
          if (!name) return;
          allowMap[name] = Number(x.holidayAllowance ?? DEFAULT_ALLOWANCE);
          carryMap[name] = Number(x.carriedOverDays ?? 0);
        });
      } catch {}

      // -------- Holidays (paid/unpaid/accrued taken)
      const paid = {};
      const unpaid = {};
      const accruedTaken = {};
      const details = {};
      const events = {};
      const eventList = [];

      const holSnap = await getDocs(collection(db, "holidays"));

      holSnap.docs.forEach((docSnap) => {
        const rec = docSnap.data() || {};
        const employee = rec.employee;
        const start = toDate(rec.startDate);
        const end = toDate(rec.endDate);
        const notes = rec.notes || rec.holidayReason || "";

        if (!employee || !start || !end) return;
        if (start.getFullYear() !== end.getFullYear() || start.getFullYear() !== currentYear) return;

        const days = countWeekdaysInclusive(start, end);

        // detect flags
        const isAccrued =
          rec.isAccrued === true ||
          ["type", "leaveType", "category", "status", "kind", "notes", "holidayReason"]
            .map((k) => text(rec[k]))
            .some((t) => t?.includes("accrued") || t?.includes("toil"));

        const isUnpaid =
          !isAccrued &&
          (rec.isUnpaid === true ||
            rec.unpaid === true ||
            rec.paid === false ||
            ["type", "leaveType", "category", "status", "kind"].some((k) =>
              text(rec[k])?.includes("unpaid")
            ));

        const isPaid = !isUnpaid && !isAccrued;

        if (isPaid) {
          paid[employee] = (paid[employee] || 0) + days;
        } else if (isUnpaid) {
          unpaid[employee] = (unpaid[employee] || 0) + days;
        } else if (isAccrued) {
          accruedTaken[employee] = (accruedTaken[employee] || 0) + days;
        }

        if (!details[employee]) details[employee] = [];
        details[employee].push({
          start,
          end,
          days,
          notes,
          unpaid: isUnpaid,
          accrued: isAccrued,
        });

        const empColor = (events[employee] ||= stringToColour(employee));
        eventList.push({
          title: `${employee} Holiday${isUnpaid ? " (Unpaid)" : isAccrued ? " (Accrued)" : ""}`,
          start,
          end: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
          allDay: true,
          employee,
          unpaid: isUnpaid,
          accrued: isAccrued,
          color: empColor,
        });
      });

      // -------- Bookings (accrued earned from weekend work)
      const accruedEarned = {};
      try {
        const bookSnap = await getDocs(collection(db, "bookings"));
        bookSnap.docs.forEach((d) => {
          const x = d.data() || {};
          const employees = Array.isArray(x.employees) ? x.employees : [];
          if (!employees.length) return;

          let dates = [];
          if (Array.isArray(x.bookingDates) && x.bookingDates.length) {
            dates = x.bookingDates
              .map((v) => toDate(v))
              .filter(Boolean)
              .filter((dt) => dt.getFullYear() === currentYear);
          } else {
            const s = toDate(x.startDate) || toDate(x.date);
            const e = toDate(x.endDate) || toDate(x.date);
            if (s && e && s.getFullYear() === currentYear && e.getFullYear() === currentYear) {
              dates = eachDateInclusive(s, e);
            }
          }

          dates.forEach((dte) => {
            if (isWeekend(dte)) {
              employees.forEach((name) => {
                accruedEarned[name] = (accruedEarned[name] || 0) + 1;
              });
            }
          });
        });
      } catch {}

      setPaidDaysByName(paid);
      setUnpaidDaysByName(unpaid);
      setAccruedTakenByName(accruedTaken);
      setAccruedEarnedByName(accruedEarned);

      setByEmployee(details);
      setEmployeeColours(events);
      setCalendarEvents(eventList);

      setEmpAllowance(allowMap);
      setEmpCarryOver(carryMap);
    };

    run();
  }, []);

  // Calendar colors
  const eventStyleGetter = (event) => {
    let bg = event.color || "#cbd5e1";
    let textColor = "#000";
    if (event.accrued) {
      bg = "#ccfbf1"; // teal-100
      textColor = "#134e4a";
    } else if (event.unpaid) {
      bg = "#fee2e2"; // red-200
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

  // Small badge
  const Pill = ({ children, tone = "default" }) => {
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
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 999,
          background: t.bg,
          color: t.fg,
          border: `1px solid ${t.br}`,
          fontSize: 12,
          fontWeight: 700,
          minWidth: 28,
          textAlign: "center",
        }}
      >
        {children}
      </span>
    );
  };

  const allNames = Array.from(
    new Set([
      ...Object.keys(byEmployee),
      ...Object.keys(empAllowance),
      ...Object.keys(empCarryOver),
      ...Object.keys(paidDaysByName),
      ...Object.keys(unpaidDaysByName),
      ...Object.keys(accruedEarnedByName),
      ...Object.keys(accruedTakenByName),
    ])
  ).sort();

  // quick metric getter (used by sort)
  const metrics = (name) => {
    const paid = paidDaysByName[name] || 0;
    const unpaid = unpaidDaysByName[name] || 0;
    const aEarned = accruedEarnedByName[name] || 0;
    const aTaken = accruedTakenByName[name] || 0;
    const aBalance = aEarned - aTaken;

    const allowance = Number(empAllowance[name] ?? DEFAULT_ALLOWANCE);
    const carried = Number(empCarryOver[name] ?? 0);
    const totalAllowance = allowance + carried;
    const allowBal = totalAllowance - paid;

    return { paid, unpaid, aEarned, aTaken, aBalance, allowance, carried, totalAllowance, allowBal };
  };

  // filtered + sorted names
  const namesToShow = allNames
    .filter((n) => n.toLowerCase().includes(q.toLowerCase()))
    .filter((n) => (onlyUnpaid ? (unpaidDaysByName[n] || 0) > 0 : true))
    .filter((n) =>
      onlyAccruedPos ? (accruedEarnedByName[n] || 0) - (accruedTakenByName[n] || 0) > 0 : true
    )
    .sort((a, b) => {
      const A = metrics(a);
      const B = metrics(b);
      switch (sortKey) {
        case "paid":
          return B.paid - A.paid; // desc
        case "unpaid":
          return B.unpaid - A.unpaid; // desc
        case "accBal":
          return B.aBalance - A.aBalance; // desc
        case "allowBalAsc":
          return A.allowBal - B.allowBal; // asc
        case "allowBalDesc":
          return B.allowBal - A.allowBal; // desc
        default:
          return a.localeCompare(b); // name
      }
    });

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          backgroundColor: "#f4f4f5",
          color: "#333",
          fontFamily: "Arial, sans-serif",
          padding: 40,
        }}
      >
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: "bold" }}>📅 Holiday & Accrued (TOIL) Overview</h1>
          <button
            onClick={() => router.push("/holiday-form")}
            style={{ backgroundColor: "#333", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "6px", fontSize: 16, cursor: "pointer" }}
          >
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

         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: "bold" }}>📅 Holiday & Accrued (TOIL) Overview</h1>
 
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <LegendSwatch color="#ccfbf1" label="Accrued leave (taken)" />
          <LegendSwatch color="#fee2e2" label="Unpaid leave" />
          <LegendSwatch color="#cbd5e1" label="Paid leave (per-employee color)" />
        </div>


        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employee…"
            style={{
              padding: "8px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              minWidth: 220,
              outline: "none",
            }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={onlyUnpaid}
              onChange={(e) => setOnlyUnpaid(e.target.checked)}
            />
            Unpaid &gt; 0
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={onlyAccruedPos}
              onChange={(e) => setOnlyAccruedPos(e.target.checked)}
            />
            Accrued balance &gt; 0
          </label>
          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Sort:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
            >
              <option value="name">Name (A–Z)</option>
              <option value="paid">Paid used (desc)</option>
              <option value="unpaid">Unpaid (desc)</option>
              <option value="accBal">Accrued balance (desc)</option>
              <option value="allowBalAsc">Allowance balance (asc)</option>
              <option value="allowBalDesc">Allowance balance (desc)</option>
            </select>
            <button
              onClick={() => {
                setQ("");
                setOnlyUnpaid(false);
                setOnlyAccruedPos(false);
                setSortKey("name");
              }}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb" }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* EMPLOYEE DETAIL BLOCKS */}
        <div style={{ marginBottom: 28 }}>
          {namesToShow.map((name) => {
            const paid = paidDaysByName[name] || 0;
            const unpaid = unpaidDaysByName[name] || 0;
            const aEarned = accruedEarnedByName[name] || 0;
            const aTaken = accruedTakenByName[name] || 0;
            const aBalance = aEarned - aTaken;

            const allowance = Number(empAllowance[name] ?? DEFAULT_ALLOWANCE);
            const carried = Number(empCarryOver[name] ?? 0);
            const totalAllowance = allowance + carried;
            const allowanceBalance = totalAllowance - paid;

            const rows = (byEmployee[name] || []).slice().sort((a, b) => a.start - b.start);

            return (
              <details key={name} style={detailsBox}>
                <summary style={summaryBar}>
                  <span>{name}</span>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Pill tone="info">Paid {paid}/{totalAllowance}</Pill>
                    <Pill tone="warn">Unpaid {unpaid}</Pill>
                    <Pill tone="teal">Acc {aEarned}/{aTaken} ({aBalance})</Pill>
                    <Pill tone="good">Allow Bal {allowanceBalance}</Pill>
                  </span>
                </summary>

                <div style={sheetBox}>
                  {/* Top header summary */}
                  <div style={yellowHeader}>
                    <div>
                      <strong>Name</strong>
                      <div style={{ color: "#b91c1c" }}>{name}</div>
                    </div>
                    <div>
                      <strong>Allowance</strong>
                      <div>{allowance}</div>
                    </div>
                    <div>
                      <strong>Carry Over</strong>
                      <div>{carried}</div>
                    </div>
                    <div>
                      <strong>Total Allowance</strong>
                      <div>{totalAllowance}</div>
                    </div>
                  </div>

                  {/* Compact stat grid */}
                  <div style={statsGrid}>
                    <Stat label="Paid Used">
                      <Pill tone="info">{paid}</Pill>
                      <span style={{ opacity: 0.6, margin: "0 6px" }}>/</span>
                      <Pill tone="gray">{totalAllowance}</Pill>
                    </Stat>
                    <Stat label="Unpaid Days">
                      <Pill tone="warn">{unpaid}</Pill>
                    </Stat>
                    <Stat label="Accrued Earned">
                      <Pill tone="teal">{aEarned}</Pill>
                    </Stat>
                    <Stat label="Accrued Taken">
                      <Pill>{aTaken}</Pill>
                    </Stat>
                    <Stat label="Accrued Balance">
                      <Pill tone="good">{aBalance}</Pill>
                    </Stat>
                    <Stat label="Allowance Balance">
                      <Pill tone="good">{allowanceBalance}</Pill>
                    </Stat>
                  </div>

                  {/* Detail table */}
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
                        <tr>
                          <td style={td} colSpan={5}>(No leave booked)</td>
                        </tr>
                      ) : (
                        rows.map((row, i) => {
                          const typeLabel = row.accrued ? "Accrued" : row.unpaid ? "Unpaid" : "Paid";
                          const typeColor = row.accrued ? "#0f766e" : row.unpaid ? "#b91c1c" : "#065f46";
                          return (
                            <tr key={i}>
                              <td style={td}>{format(row.start, "EEE d MMM")}</td>
                              <td style={td}>{format(row.end, "EEE d MMM")}</td>
                              <td style={{ ...td, textAlign: "center", width: 120 }}>{row.days}</td>
                              <td style={{ ...td, color: typeColor, fontWeight: 700 }}>{typeLabel}</td>
                              <td style={td}>{row.notes || ""}</td>
                            </tr>
                          );
                        })
                      )}
                      <tr>
                        <td style={{ ...td, fontWeight: 700 }}>Accrued Balance</td>
                        <td style={td}></td>
                        <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{aBalance}</td>
                        <td style={td}></td>
                        <td style={td}></td>
                      </tr>
                      <tr>
                        <td style={{ ...td, fontWeight: 700 }}>Allowance Balance</td>
                        <td style={td}></td>
                        <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{allowanceBalance}</td>
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

function LegendSwatch({ color, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 14,
          height: 14,
          background: color,
          borderRadius: 4,
          display: "inline-block",
          border: "1px solid #e5e7eb",
        }}
      />
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

const th = { textAlign: "left", borderBottom: "2px solid #ccc", padding: "12px", fontWeight: "bold", whiteSpace: "nowrap" };
const td = { padding: "12px", borderBottom: "1px solid #eee", verticalAlign: "middle" };

const detailsBox = { background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12, overflow: "hidden" };
const summaryBar = { cursor: "pointer", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f3f4f6", fontWeight: 600, gap: 12 };
const sheetBox = { padding: 16 };

const yellowHeader = {
  display: "grid",
  gridTemplateColumns: "1.5fr repeat(3, 1fr)",
  gap: 16,
  background: "#fde68a",
  border: "1px solid #f59e0b",
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 10,
};
