// src/app/vehicle-checks/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDocs } from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  RotateCcw,
  Search,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import { tenantCollectionQuery, useDataAccessState } from "@/app/utils/firestoreAccess";

/* UI tokens */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  danger: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };

const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const cardBase = {
  ...surface,
  padding: 12,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 10,
  marginBottom: UI.gap,
};

const chip = {
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: "#f1f5f9",
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
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "pill") {
    return {
      padding: "5px 8px",
      borderRadius: 999,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 4px 10px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12,
      lineHeight: 1.2,
    };
  }
  return {
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const inputBase = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: 13,
  background: "#fff",
};

const divider = { height: 1, background: "#dde5ee", margin: "12px 0 0" };

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12.5, lineHeight: 1.4, marginTop: 4 };

/* table */
const tableWrap = { ...surface, overflowX: "auto", overflowY: "hidden" };
const thtd = { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid #eef2f7", verticalAlign: "middle" };
const theadTh = {
  ...thtd,
  fontWeight: 900,
  color: UI.muted,
  background: "#f6f8fb",
  fontSize: 11.5,
  textTransform: "uppercase",
  letterSpacing: 0,
};

/* pills */
const pill = (bg, fg, borderColor = "#e5e7eb") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: bg,
  color: fg,
  border: `1px solid ${borderColor}`,
});

const statusBadge = (state) => {
  if (state === "OK") return pill("#ecfdf5", "#065f46", "#bbf7d0");
  if (state === "DEFECT") return pill("#fef2f2", "#991b1b", "#fecaca");
  if (state === "DRAFT") return pill("#f8fafc", "#111827", "#e5e7eb");
  if (state === "MISSING") return pill("#fff7ed", "#9a3412", "#fed7aa");
  return pill("#ffffff", "#111827");
};

/* Helpers */
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
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysInRange = (from, to) => {
  if (!from || !to) return [];
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const out = [];
  for (let d = a; d <= b; d.setDate(d.getDate() + 1)) out.push(dateKey(d));
  return out;
};

const hasDefect = (items) => Array.isArray(items) && items.some((i) => i?.status === "defect");

// Treat these as confirmed (tweak to match your schema exactly)
const isConfirmed = (b) => {
  const s = String(b?.status || "").toLowerCase().trim();
  const a = String(b?.approvalStatus || "").toLowerCase().trim();
  return s === "confirmed" || b?.confirmed === true || b?.isConfirmed === true || a === "approved";
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

const uniq = (arr) => Array.from(new Set(arr.map((s) => (s || "").trim()).filter(Boolean)));

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

const extractEmployeesForDate = (b, dk) => {
  const dateMaps = [b.employeesByDate, b.staffByDate, b.crewByDate, b.teamByDate, b.peopleByDate].filter(
    (m) => m && typeof m === "object"
  );

  for (const map of dateMaps) {
    const arr = map?.[dk];
    if (Array.isArray(arr) && arr.length) return uniq(arr.map(personName));
  }

  for (const map of dateMaps) {
    const key = Object.keys(map || {}).find((k) => String(k).startsWith(dk));
    if (key && Array.isArray(map[key]) && map[key].length) return uniq(map[key].map(personName));
  }

  return extractEmployeesWholeBooking(b);
};

const clampText = (s, n = 80) => {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length <= n ? t : `${t.slice(0, Math.max(0, n - 3))}...`;
};

const formatDisplayDate = (value) => {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return raw || "-";
};

/* Page */
export default function VehicleChecksDashboardPage() {
  const dataAccessState = useDataAccessState();
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState([]);
  const [bookings, setBookings] = useState([]);

  // filters
  const [qText, setQText] = useState("");
  const [onlyShow, setOnlyShow] = useState("all"); // all | missing | defects
  const [dateOrder, setDateOrder] = useState("desc"); // desc | asc

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snapC = await getDocs(tenantCollectionQuery(db, "vehicleChecks", dataAccessState));
        const rowsC = [];
        snapC.forEach((d) => rowsC.push({ id: d.id, ...d.data() }));

        const snapB = await getDocs(tenantCollectionQuery(db, "bookings", dataAccessState));
        const rowsB = [];
        snapB.forEach((d) => rowsB.push({ id: d.id, ...d.data() }));

        setBookings(rowsB.filter(isConfirmed));
        setChecks(rowsC);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dataAccessState]);

  const rows = useMemo(() => {
    const todayISO = dateKey(new Date());

    const checksByKey = new Map();
    for (const c of checks) {
      const k = `${c.jobId || ""}__${c.dateISO || ""}`;
      const arr = checksByKey.get(k) || [];
      arr.push(c);
      checksByKey.set(k, arr);
    }

    const out = [];

    for (const b of bookings) {
      let dayKeys = [];
      if (Array.isArray(b.bookingDates) && b.bookingDates.length > 0) {
        dayKeys = b.bookingDates.map(parseLocalDateOnly).filter(Boolean).map(dateKey);
      } else {
        const s =
          parseLocalDateOnly(b.startDate) || parseLocalDateOnly(b.date) || toDate(b.startDate) || toDate(b.date);
        const e =
          parseLocalDateOnly(b.endDate) || parseLocalDateOnly(b.date) || toDate(b.endDate) || toDate(b.date) || s;
        if (!s) continue;
        const start = parseLocalDateOnly(dateKey(s));
        const end = parseLocalDateOnly(dateKey(e || s));
        dayKeys = daysInRange(start, end);
      }
      if (!dayKeys.length) continue;

      dayKeys = dayKeys.filter((dk) => dk <= todayISO);
      if (!dayKeys.length) continue;

      const vehicles = Array.isArray(b.vehicles) ? b.vehicles : [];
      const jobLabel = b.jobNumber ? `#${b.jobNumber}` : b.id;

      for (const dk of dayKeys) {
        const checkList = checksByKey.get(`${b.id}__${dk}`) || [];
        const submitted = checkList.filter((c) => c.status === "submitted");
        const drafts = checkList.filter((c) => c.status !== "submitted");

        let state = "MISSING";
        if (submitted.length) state = submitted.some((c) => hasDefect(c.items)) ? "DEFECT" : "OK";
        else if (drafts.length) state = "DRAFT";

        const employees = extractEmployeesForDate(b, dk);

        out.push({
          jobId: b.id,
          jobLabel,
          client: b.client || "",
          dateISO: dk,
          vehicles: vehicles.join(", "),
          employees,
          state,
          checks: checkList,
          submittedCount: submitted.length,
          draftCount: drafts.length,
        });
      }
    }

    const text = qText.trim().toLowerCase();
    let filtered = out;

    if (onlyShow === "missing") filtered = filtered.filter((r) => r.state === "MISSING" || r.state === "DRAFT");
    if (onlyShow === "defects") filtered = filtered.filter((r) => r.state === "DEFECT");

    if (text) {
      filtered = filtered.filter((r) =>
        [
          r.jobLabel,
          r.client,
          r.dateISO,
          r.vehicles,
          ...(r.employees || []),
          ...(r.checks || []).map((c) => [c.driverName, c.vehicle, c.notes].filter(Boolean).join(" ")),
        ]
          .flat()
          .join(" ")
          .toLowerCase()
          .includes(text)
      );
    }

    const weight = { DEFECT: 3, MISSING: 2, DRAFT: 1, OK: 0 };
    filtered.sort((a, b) => {
      if (a.dateISO !== b.dateISO) {
        return dateOrder === "desc" ? (a.dateISO < b.dateISO ? 1 : -1) : a.dateISO > b.dateISO ? 1 : -1;
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
    const completion = totalRequired ? Math.round(((submittedOK + defects) / totalRequired) * 100) : 0;
    return { totalRequired, missing, drafts, defects, submittedOK, completion };
  }, [rows]);

  return (
    <HeaderSidebarLayout>
      {/* subtle focus ring */}
      <style>{`
        input:focus, button:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: #9fb7cf !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .vehicle-checks-kpi-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        .vehicle-checks-filter-grid {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 220px 220px;
          gap: 10px;
        }
        @media (max-width: 1180px) {
          .vehicle-checks-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .vehicle-checks-filter-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 640px) {
          .vehicle-checks-kpi-grid, .vehicle-checks-filter-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Vehicle Checks</h1>
            <div style={sub}>Dashboard of required checks for confirmed jobs (past + today).</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/vehicle-checks/defects" className="vehicle-checks-action" style={btn("ghost")}>
              <AlertTriangle size={15} />
              Defects
            </Link>
            <Link href="/vehicle-checks/completion" className="vehicle-checks-action" style={btn("ghost")}>
              <ClipboardCheck size={15} />
              Employee Completion
            </Link>
            <Link href="/vehicle-checks/vehicles" className="vehicle-checks-action" style={btn("ghost")}>
              <CheckCircle2 size={15} />
              Vehicle Health
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="vehicle-checks-kpi-grid" style={kpiGrid}>
          <KPI label="Required" value={kpis.totalRequired} sub="Past confirmed work days" icon={ClipboardCheck} />
          <KPI
            label="Completion"
            value={`${kpis.completion}%`}
            sub={`${kpis.submittedOK + kpis.defects}/${kpis.totalRequired} submitted`}
            tone="soft"
            icon={CheckCircle2}
          />
          <KPI label="Missing checks" value={kpis.missing} tone="amber" icon={FileClock} />
          <KPI label="Draft only" value={kpis.drafts} tone="brand" icon={ClipboardCheck} />
          <KPI label="With defects" value={kpis.defects} tone="danger" icon={AlertTriangle} />
        </div>

        {/* Filters */}
        <section style={{ ...cardBase, marginBottom: 12 }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Filters</h2>
              <div style={hint}>Search across job, vehicle, employees, and check notes.</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chipSoft}>{rows.length} rows</span>
              <button
                type="button"
                style={btn("ghost")}
                onClick={() => {
                  setQText("");
                  setOnlyShow("all");
                  setDateOrder("desc");
                }}
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
          </div>

          <div style={{ ...surface, boxShadow: "none", borderRadius: UI.radius, border: UI.border, padding: 12, background: "#fff" }}>
            <div className="vehicle-checks-filter-grid">
              <label style={{ position: "relative", display: "block" }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: UI.muted }}
                />
                <input
                  placeholder="Search job, vehicle, employee, notes..."
                  style={{ ...inputBase, paddingLeft: 34 }}
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                />
              </label>

              <select value={onlyShow} onChange={(e) => setOnlyShow(e.target.value)} style={inputBase}>
                <option value="all">Show: All</option>
                <option value="missing">Show: Missing/Drafts</option>
                <option value="defects">Show: Defects</option>
              </select>

              <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value)} style={inputBase}>
                <option value="desc">Order: Newest to oldest</option>
                <option value="asc">Order: Oldest to newest</option>
              </select>
            </div>

            <div style={divider} />

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: 12,
                color: UI.muted,
                marginTop: 12,
              }}
            >
              <span style={pill("#ecfdf5", "#065f46", "#bbf7d0")}>OK</span>
              <span style={pill("#fef2f2", "#991b1b", "#fecaca")}>Defect</span>
              <span style={pill("#f8fafc", "#111827", "#e5e7eb")}>Draft</span>
              <span style={pill("#fff7ed", "#9a3412", "#fed7aa")}>Missing</span>
              <span style={{ marginLeft: 6 }}>Tip: type a reg plate, job #, or driver name.</span>
            </div>
          </div>
        </section>

        {/* Table */}
        <div style={tableWrap}>
          <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...theadTh, textAlign: "left" }}>Date</th>
                <th style={{ ...theadTh, textAlign: "left" }}>Job</th>
                <th style={{ ...theadTh, textAlign: "left" }}>Client</th>
                <th style={{ ...theadTh, textAlign: "left" }}>Vehicles</th>
                <th style={{ ...theadTh, textAlign: "left" }}>Employees</th>
                <th style={{ ...theadTh, textAlign: "left" }}>Status</th>
                <th style={{ ...theadTh, textAlign: "left" }}>Submitted/Draft</th>
                <th style={{ ...theadTh, textAlign: "right" }}>Open</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                    No rows to show.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const employeesDisplay = (r.employees || []).length
                    ? r.employees.length <= 3
                      ? r.employees.join(", ")
                      : `${r.employees[0]}, ${r.employees[1]}, ${r.employees[2]} +${r.employees.length - 3} more`
                    : "-";

                  const openHref = r.checks?.length
                    ? `/vehicle-checkid/${encodeURIComponent(r.checks[0].id || r.checks[0].docId || "")}`
                    : `/vehicle-check?jobId=${encodeURIComponent(r.jobId)}&dateISO=${encodeURIComponent(r.dateISO)}`;

                  const openLabel = r.checks?.length ? "View" : "Create check";

                  return (
                    <tr key={`${r.jobId}-${r.dateISO}-${i}`} style={{ background: i % 2 ? "#ffffff" : "#fcfdff" }}>
                      <td style={thtd}>{formatDisplayDate(r.dateISO)}</td>
                      <td style={thtd}>
                        <span style={{ fontWeight: 900, color: UI.text }}>{r.jobLabel}</span>
                      </td>
                      <td style={thtd}>{r.client || "-"}</td>
                      <td style={thtd} title={r.vehicles || ""}>
                        {r.vehicles ? clampText(r.vehicles, 52) : "-"}
                      </td>
                      <td style={{ ...thtd, maxWidth: 320 }} title={(r.employees || []).join(", ")}>
                        {employeesDisplay}
                      </td>
                      <td style={thtd}>
                        <span style={statusBadge(r.state)}>{r.state}</span>
                      </td>
                      <td style={thtd}>
                        <span style={chip}>
                          {r.submittedCount}/{r.draftCount}
                        </span>
                      </td>
                      <td style={{ ...thtd, textAlign: "right" }}>
                        <Link href={openHref} className="vehicle-checks-action" style={btn("pill")}>
                          {openLabel}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx global>{`
        .vehicle-checks-action:hover { background: #f8fbfe !important; border-color: #b8c8d8 !important; }
        table thead th { border-bottom: 1px solid #e5e7eb !important; }
      `}</style>
    </HeaderSidebarLayout>
  );
}

/* small components */
function KPI({ label, value, sub, tone = "default", icon: Icon = ClipboardCheck }) {
  const toneStyles =
    tone === "danger"
      ? { fg: "#991b1b", bg: "#fef2f2", border: "#fecaca" }
      : tone === "amber"
      ? { fg: "#9a3412", bg: "#fff7ed", border: "#fed7aa" }
      : tone === "brand" || tone === "soft"
      ? { fg: UI.brand, bg: UI.brandSoft, border: UI.brandBorder }
      : { fg: UI.text, bg: "#f6f8fb", border: "#d7dee8" };

  return (
    <div
      style={{
        ...cardBase,
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...(tone === "soft" ? { background: UI.brandSoft, borderColor: UI.brandBorder } : null),
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 900, color: toneStyles.fg, marginTop: 6 }}>{value}</div>
        </div>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: UI.radiusSm,
            border: `1px solid ${toneStyles.border}`,
            background: toneStyles.bg,
            color: toneStyles.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
          }}
        >
          <Icon size={17} />
        </span>
      </div>

      {sub ? <div style={{ fontSize: 12, color: UI.muted, lineHeight: 1.3, marginTop: 8 }}>{sub}</div> : null}
    </div>
  );
}
