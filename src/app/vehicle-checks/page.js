// src/app/vehicle-checks/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";

/* ───────────────── UI tokens ───────────────── */
const UI = {
  page: "#f3f4f6",
  card: "#ffffff",
  text: "#0f172a",
  subtext: "#64748b",
  border: "1px solid #e5e7eb",
  radius: 12,
  radiusSm: 8,
  shadowSm: "0 4px 12px rgba(2, 6, 23, 0.06)",
  shadowMd: "0 8px 24px rgba(2, 6, 23, 0.08)",
  red: "#dc2626",
  amber: "#d97706",
  blue: "#2563eb",
};

const shell = {
  minHeight: "100vh",
  background: UI.page,
  color: UI.text,
  fontFamily:
    "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};
const main = { flex: 1, padding: "28px 28px 40px", maxWidth: 1600, margin: "0 auto" };

const h1 = {
  fontSize: 28,
  lineHeight: "34px",
  fontWeight: 800,
  marginBottom: 16,
  color: UI.text,
  letterSpacing: 0.2,
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
  gap: 12,
  marginBottom: 14,
};
const kpiCard = { ...card, padding: 14, display: "flex", flexDirection: "column", gap: 6 };
const kpiLabel = {
  fontSize: 12,
  color: UI.subtext,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};
const kpiValue = { fontSize: 26, fontWeight: 900, color: UI.text };
const kpiSub = { fontSize: 12, color: UI.subtext };

/* filters row: search, show-filter, date order */
const filtersBar = {
  display: "grid",
  gridTemplateColumns: "1fr 200px 200px",
  gap: 10,
  marginBottom: 12,
};
const input = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
};
const legend = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  fontSize: 12,
  color: UI.subtext,
  marginTop: 6,
};

const tableWrap = { ...card, overflow: "hidden" };
const thtd = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #eef2f7" };

const pill = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: bg,
  color: fg,
  border: "1px solid #e5e7eb",
});

const statusBadge = (state) => {
  if (state === "OK") return pill("#ecfdf5", "#065f46");         // submitted, no defect
  if (state === "DEFECT") return pill("#fef2f2", "#991b1b");     // submitted with defect(s)
  if (state === "DRAFT") return pill("#f8fafc", "#111827");      // draft only
  if (state === "MISSING") return pill("#fff7ed", "#9a3412");    // required but missing
  return pill("#ffffff", "#111827");
};

/* ───────────────── helpers ───────────────── */
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

// parse "YYYY-MM-DD" safely as local date
const parseLocalDateOnly = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const daysInRange = (from, to) => {
  if (!from || !to) return [];
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const out = [];
  for (let d = a; d <= b; d.setDate(d.getDate() + 1)) out.push(dateKey(d));
  return out;
};

const hasDefect = (items) =>
  Array.isArray(items) && items.some((i) => i?.status === "defect");

// Treat these as confirmed (tweak to match your schema exactly)
const isConfirmed = (b) => {
  const s = String(b?.status || "").toLowerCase().trim();
  const a = String(b?.approvalStatus || "").toLowerCase().trim();
  return (
    s === "confirmed" ||
    b?.confirmed === true ||
    b?.isConfirmed === true ||
    a === "approved"
  );
};

// Normalise a person into a printable name
const personName = (p) => {
  if (!p) return "";
  if (typeof p === "string") return p.trim();
  if (typeof p === "object") {
    const first = p.firstName || p.first || "";
    const last = p.lastName || p.last || "";
    const combo = `${first} ${last}`.trim();
    return (
      p.name?.toString().trim() ||
      p.displayName?.toString().trim() ||
      p.fullName?.toString().trim() ||
      (combo || "") ||
      p.employeeName?.toString().trim() ||
      p.userCode?.toString().trim() ||
      ""
    );
  }
  return String(p).trim();
};

const uniq = (arr) =>
  Array.from(new Set(arr.map((s) => (s || "").trim()).filter(Boolean)));

// Extract employees for WHOLE booking (fallback)
const extractEmployeesWholeBooking = (b) => {
  const pools = [
    b.employees,
    b.assignedEmployees,
    b.assignedStaff,
    b.crew,
    b.team,
    b.staff,
    b.workers,
    b.drivers,
    b.people,
  ].filter(Array.isArray);

  const flat = pools.flat();
  return uniq(flat.map(personName));
};

// Extract employees for a SPECIFIC DATE if available (e.g., crewByDate, staffByDate, etc.)
const extractEmployeesForDate = (b, dk) => {
  const dateMaps = [
    b.employeesByDate,
    b.staffByDate,
    b.crewByDate,
    b.teamByDate,
    b.peopleByDate,
  ].filter((m) => m && typeof m === "object");

  // Try exact date key first
  for (const map of dateMaps) {
    const arr = map?.[dk];
    if (Array.isArray(arr) && arr.length) return uniq(arr.map(personName));
  }

  // Some schemas keep ISO keys but with time, do a loose match on date-only prefix
  for (const map of dateMaps) {
    const key = Object.keys(map || {}).find((k) => String(k).startsWith(dk));
    if (key && Array.isArray(map[key]) && map[key].length)
      return uniq(map[key].map(personName));
  }

  // Fallback to whole-booking employees
  return extractEmployeesWholeBooking(b);
};

/* ───────────────── page ───────────────── */
export default function VehicleChecksDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState([]);
  const [bookings, setBookings] = useState([]);

  // filters (no date pickers)
  const [qText, setQText] = useState("");
  const [onlyShow, setOnlyShow] = useState("all"); // all | missing | defects
  const [dateOrder, setDateOrder] = useState("desc"); // 'desc' | 'asc'

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snapC = await getDocs(query(collection(db, "vehicleChecks")));
        const rowsC = [];
        snapC.forEach((d) => rowsC.push({ id: d.id, ...d.data() }));

        const snapB = await getDocs(query(collection(db, "bookings")));
        const rowsB = [];
        snapB.forEach((d) => rowsB.push({ id: d.id, ...d.data() }));

        setBookings(rowsB.filter(isConfirmed)); // confirmed only
        setChecks(rowsC);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const rows = useMemo(() => {
    const todayISO = dateKey(new Date());

    // index checks by jobId+date
    const checksByKey = new Map();
    for (const c of checks) {
      const k = `${c.jobId || ""}__${c.dateISO || ""}`;
      const arr = checksByKey.get(k) || [];
      arr.push(c);
      checksByKey.set(k, arr);
    }

    const out = [];

    for (const b of bookings) {
      // collect day keys
      let dayKeys = [];
      if (Array.isArray(b.bookingDates) && b.bookingDates.length > 0) {
        dayKeys = b.bookingDates
          .map(parseLocalDateOnly)
          .filter(Boolean)
          .map(dateKey);
      } else {
        const s =
          parseLocalDateOnly(b.startDate) ||
          parseLocalDateOnly(b.date) ||
          toDate(b.startDate) ||
          toDate(b.date);
        const e =
          parseLocalDateOnly(b.endDate) ||
          parseLocalDateOnly(b.date) ||
          toDate(b.endDate) ||
          toDate(b.date) ||
          s;
        if (!s) continue;
        const start = parseLocalDateOnly(dateKey(s));
        const end = parseLocalDateOnly(dateKey(e || s));
        dayKeys = daysInRange(start, end);
      }
      if (!dayKeys.length) continue;

      // only past or today
      dayKeys = dayKeys.filter((dk) => dk <= todayISO);
      if (!dayKeys.length) continue;

      const vehicles = Array.isArray(b.vehicles) ? b.vehicles : [];
      const jobLabel = b.jobNumber ? `#${b.jobNumber}` : b.id;

      for (const dk of dayKeys) {
        const checkList = checksByKey.get(`${b.id}__${dk}`) || [];
        const submitted = checkList.filter((c) => c.status === "submitted");
        const drafts = checkList.filter((c) => c.status !== "submitted");

        let state = "MISSING";
        if (submitted.length) {
          state = submitted.some((c) => hasDefect(c.items)) ? "DEFECT" : "OK";
        } else if (drafts.length) {
          state = "DRAFT";
        }

        // Employees assigned (per-day if available, else whole booking)
        const employees = extractEmployeesForDate(b, dk);

        out.push({
          jobId: b.id,
          jobLabel,
          client: b.client || "",
          dateISO: dk,
          vehicles: vehicles.join(", "),
          employees, // <— NEW
          state,
          checks: checkList,
          submittedCount: submitted.length,
          draftCount: drafts.length,
        });
      }
    }

    // quick filters
    const text = qText.trim().toLowerCase();
    let filtered = out;
    if (onlyShow === "missing")
      filtered = filtered.filter((r) => r.state === "MISSING" || r.state === "DRAFT");
    if (onlyShow === "defects")
      filtered = filtered.filter((r) => r.state === "DEFECT");

    if (text) {
      filtered = filtered.filter((r) =>
        [
          r.jobLabel,
          r.client,
          r.dateISO,
          r.vehicles,
          ...(r.employees || []),
          ...(r.checks || []).map((c) =>
            [c.driverName, c.vehicle, c.notes].filter(Boolean).join(" ")
          ),
        ]
          .flat()
          .join(" ")
          .toLowerCase()
          .includes(text)
      );
    }

    // sort by date (desc/asc), then by risk for same day
    const weight = { DEFECT: 3, MISSING: 2, DRAFT: 1, OK: 0 };
    filtered.sort((a, b) => {
      if (a.dateISO !== b.dateISO) {
        return dateOrder === "desc"
          ? a.dateISO < b.dateISO ? 1 : -1
          : a.dateISO > b.dateISO ? 1 : -1;
      }
      const aw = weight[a.state] ?? 0;
      const bw = weight[b.state] ?? 0;
      return bw - aw;
    });

    return filtered;
  }, [bookings, checks, qText, onlyShow, dateOrder]);

  // KPIs
  const kpis = useMemo(() => {
    const totalRequired = rows.length;
    const missing = rows.filter((r) => r.state === "MISSING").length;
    const drafts = rows.filter((r) => r.state === "DRAFT").length;
    const defects = rows.filter((r) => r.state === "DEFECT").length;
    const submittedOK = rows.filter((r) => r.state === "OK").length;
    const completion = totalRequired
      ? Math.round(((submittedOK + defects) / totalRequired) * 100)
      : 0;
    return { totalRequired, missing, drafts, defects, submittedOK, completion };
  }, [rows]);

  return (
    <HeaderSidebarLayout>
      <div style={shell}>
        <main style={main}>
          {/* Top bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <h1 style={h1}>Vehicle Checks — Dashboard</h1>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/vehicle-checks/defects" style={navBtn()}>
                Defects
              </Link>
              <Link href="/vehicle-checks/completion" style={navBtn()}>
                Employee Completion
              </Link>
              <Link href="/vehicle-checks/vehicles" style={navBtn()}>
                Vehicle Health
              </Link>
            </div>
          </div>

          {/* KPIs */}
          <div style={kpiGrid}>
            <KPI label="Required (past confirmed)" value={kpis.totalRequired} />
            <KPI
              label="Completion"
              value={`${kpis.completion}%`}
              sub={`${kpis.submittedOK + kpis.defects}/${kpis.totalRequired} submitted`}
            />
            <KPI label="Missing checks" value={kpis.missing} color={UI.amber} />
            <KPI label="Draft only" value={kpis.drafts} color={UI.blue} />
            <KPI label="With defects" value={kpis.defects} color={UI.red} />
          </div>

          {/* Filters (no date pickers) */}
          <div style={{ ...card, padding: 12, marginBottom: 12 }}>
            <div style={filtersBar}>
              <input
                placeholder="Search job, vehicle, employee, notes…"
                style={input}
                value={qText}
                onChange={(e) => setQText(e.target.value)}
              />
              <select
                value={onlyShow}
                onChange={(e) => setOnlyShow(e.target.value)}
                style={input}
              >
                <option value="all">Show: All</option>
                <option value="missing">Show: Missing/Drafts</option>
                <option value="defects">Show: Defects</option>
              </select>

              {/* Date order */}
              <select
                value={dateOrder}
                onChange={(e) => setDateOrder(e.target.value)}
                style={input}
              >
                <option value="desc">Order: Newest → Oldest</option>
                <option value="asc">Order: Oldest → Newest</option>
              </select>
            </div>

            <div style={legend}>
              <span style={pill("#ecfdf5", "#065f46")}>OK</span>
              <span style={pill("#fef2f2", "#991b1b")}>Defect</span>
              <span style={pill("#f8fafc", "#111827")}>Draft</span>
              <span style={pill("#fff7ed", "#9a3412")}>Missing</span>
            </div>
          </div>

          {/* Jobs vs Checks table */}
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={{ ...thtd, textAlign: "left" }}>Date</th>
                  <th style={{ ...thtd, textAlign: "left" }}>Job</th>
                  <th style={{ ...thtd, textAlign: "left" }}>Client</th>
                  <th style={{ ...thtd, textAlign: "left" }}>Vehicles</th>
                  <th style={{ ...thtd, textAlign: "left" }}>Employees</th>
                  <th style={{ ...thtd, textAlign: "left" }}>Status</th>
                  <th style={{ ...thtd, textAlign: "left" }}>Submitted/Draft</th>
                  <th style={{ ...thtd, textAlign: "right" }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ ...thtd, textAlign: "center" }}>
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...thtd, textAlign: "center" }}>
                      No rows to show.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => {
                    const employeesDisplay = (r.employees || []).length
                      ? (r.employees.length <= 3
                          ? r.employees.join(", ")
                          : `${r.employees[0]}, ${r.employees[1]}, ${r.employees[2]} +${r.employees.length - 3} more`)
                      : "—";
                    return (
                      <tr key={`${r.jobId}-${r.dateISO}-${i}`}>
                        <td style={thtd}>{r.dateISO}</td>
                        <td style={thtd}>{r.jobLabel}</td>
                        <td style={thtd}>{r.client || "—"}</td>
                        <td style={thtd}>{r.vehicles || "—"}</td>
                        <td
                          style={{ ...thtd, maxWidth: 320 }}
                          title={(r.employees || []).join(", ")}
                        >
                          {employeesDisplay}
                        </td>
                        <td style={thtd}>
                          <span style={statusBadge(r.state)}>{r.state}</span>
                        </td>
                        <td style={thtd}>
                          {r.submittedCount}/{r.draftCount}
                        </td>
                        <td style={{ ...thtd, textAlign: "right" }}>
                          {r.checks?.length ? (
                            <Link
                              href={`/vehicle-checkid/${encodeURIComponent(
                                r.checks[0].id || r.checks[0].docId || ""
                              )}`}
                              style={rowBtn()}
                            >
                              View →
                            </Link>
                          ) : (
                            <Link
                              href={`/vehicle-check?jobId=${encodeURIComponent(
                                r.jobId
                              )}&dateISO=${encodeURIComponent(r.dateISO)}`}
                              style={rowBtn()}
                            >
                              Create check →
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <style jsx global>{`
        table thead th { font-weight: 800; color: #0f172a; }
        a:hover { background: #f8fafc !important; }
      `}</style>
    </HeaderSidebarLayout>
  );
}

/* small components */
function KPI({ label, value, sub, color }) {
  return (
    <div style={kpiCard}>
      <div style={{ ...kpiLabel, color: color ? color : UI.subtext }}>{label}</div>
      <div style={{ ...kpiValue, color: color ? color : UI.text }}>{value}</div>
      {sub ? <div style={kpiSub}>{sub}</div> : null}
    </div>
  );
}

const navBtn = () => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 800,
});

const rowBtn = () => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 800,
});
