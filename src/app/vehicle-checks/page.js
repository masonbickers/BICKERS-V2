// src/app/vehicle-checks/page.js
"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { PeopleFleetHeaderActions, PeopleFleetPage, PeopleFleetPageHeader } from "@/app/components/PeopleFleetPage";
import { Badge, Button, Input, MetricCard as SharedMetricCard, Select } from "@/app/components/ui";
import { db } from "../../../firebaseConfig";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { formatVehicleList } from "@/app/utils/vehicleDisplay";

/* UI tokens */
const UI = UI_TOKENS;

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

const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12.5, lineHeight: 1.4, marginTop: 4 };

const thtd = { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid var(--color-brand-soft)", verticalAlign: "middle" };

/* pills */
const pill = (bg, fg, borderColor = "var(--color-border)") => ({
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

const formatDisplayDate = (value) => {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return raw || "-";
};

const formatDateContext = (value) => {
  const date = parseLocalDateOnly(value);
  if (!date) return "";
  if (dateKey(date) === dateKey(new Date())) return "Today";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
};

/* Page */
export default function VehicleChecksDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [vehicleLookup, setVehicleLookup] = useState({ byId: {}, byReg: {}, byName: {} });

  // filters
  const [qText, setQText] = useState("");
  const [onlyShow, setOnlyShow] = useState("all"); // all | missing | defects
  const [dateOrder, setDateOrder] = useState("desc"); // desc | asc

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

        const snapV = await getDocs(query(collection(db, "vehicles")));
        const rowsV = [];
        snapV.forEach((d) => rowsV.push({ id: d.id, ...d.data() }));
        const byId = {};
        const byReg = {};
        const byName = {};
        rowsV.forEach((vehicle) => {
          const id = String(vehicle.id || vehicle.vehicleId || "").trim();
          const reg = String(vehicle.registration || vehicle.reg || "").trim().toUpperCase();
          const name = String(vehicle.name || vehicle.vehicleName || vehicle.label || "").trim().toLowerCase();
          if (id) byId[id] = vehicle;
          if (reg) byReg[reg] = vehicle;
          if (name) byName[name] = vehicle;
        });

        setBookings(rowsB.filter(isConfirmed));
        setChecks(rowsC);
        setVehicleLookup({ byId, byReg, byName });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
          vehicles: formatVehicleList(vehicles, vehicleLookup),
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
  }, [bookings, checks, qText, onlyShow, dateOrder, vehicleLookup]);

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
        input:focus, button:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: var(--shell-muted) !important; }
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

      <PeopleFleetPage>
        {/* Header */}
        <PeopleFleetPageHeader
          title="Vehicle Checks"
          subtitle="Dashboard of required checks for confirmed jobs, including past work and today."
          actions={<PeopleFleetHeaderActions>
            <Button as={Link} href="/vehicle-checks/defects" variant="secondary" className="vehicle-checks-action">
              <AlertTriangle size={15} />
              Defects
            </Button>
            <Button as={Link} href="/vehicle-checks/completion" variant="secondary" className="vehicle-checks-action">
              <ClipboardCheck size={15} />
              Employee Completion
            </Button>
            <Button as={Link} href="/vehicle-checks/vehicles" variant="secondary" className="vehicle-checks-action">
              <CheckCircle2 size={15} />
              Vehicle Health
            </Button>
          </PeopleFleetHeaderActions>}
        />

        {/* KPIs */}
        <div className="vehicle-checks-kpi-grid" style={kpiGrid}>
          <SharedMetricCard label="Required" value={kpis.totalRequired} hint="Past confirmed work days" icon={<ClipboardCheck size={19} />} />
          <SharedMetricCard
            label="Completion"
            value={`${kpis.completion}%`}
            hint={`${kpis.submittedOK + kpis.defects}/${kpis.totalRequired} submitted`}
            tone="info"
            icon={<CheckCircle2 size={19} />}
          />
          <SharedMetricCard label="Missing checks" value={kpis.missing} tone="warning" icon={<FileClock size={19} />} />
          <SharedMetricCard label="Draft only" value={kpis.drafts} tone="info" icon={<ClipboardCheck size={19} />} />
          <SharedMetricCard label="With defects" value={kpis.defects} tone="danger" icon={<AlertTriangle size={19} />} />
        </div>

        {/* Filters */}
        <section style={{ ...cardBase, marginBottom: 12 }}>
          <div className={layoutStyles.extracted3}>
            <div>
              <h2 style={titleMd}>Filters</h2>
              <div style={hint}>Search across job, vehicle, employees, and check notes.</div>
            </div>
            <div className={layoutStyles.extracted4}>
              <Badge variant="info">{rows.length} rows</Badge>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setQText("");
                  setOnlyShow("all");
                  setDateOrder("desc");
                }}
              >
                <RotateCcw size={14} />
                Reset
              </Button>
            </div>
          </div>

          <div style={{ ...surface, boxShadow: "none", borderRadius: UI.radius, border: UI.border, padding: 12, background: "var(--color-surface)" }}>
            <div className="vehicle-checks-filter-grid">
              <label className={layoutStyles.extracted5}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: UI.muted }}
                />
                <Input
                  placeholder="Search job, vehicle, employee, notes..."
                  className={layoutStyles.extracted18}
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                />
              </label>

              <Select value={onlyShow} onChange={(e) => setOnlyShow(e.target.value)}>
                <option value="all">Show: All</option>
                <option value="missing">Show: Missing/Drafts</option>
                <option value="defects">Show: Defects</option>
              </Select>

              <Select value={dateOrder} onChange={(e) => setDateOrder(e.target.value)}>
                <option value="desc">Order: Newest to oldest</option>
                <option value="asc">Order: Oldest to newest</option>
              </Select>
            </div>

            <div className={layoutStyles.extracted6} />

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
              <span style={pill("var(--color-success-soft)", "var(--color-success)", "var(--color-success-border)")}>OK</span>
              <span style={pill("var(--color-danger-soft)", "var(--color-danger)", "var(--color-danger-border)")}>Defect</span>
              <span style={pill("var(--color-surface-subtle)", "var(--color-text)", "var(--color-border)")}>Draft</span>
              <span style={pill("var(--color-warning-soft)", "var(--color-warning)", "var(--color-warning-border)")}>Missing</span>
              <span className={layoutStyles.extracted7}>Tip: type a reg plate, job #, or driver name.</span>
            </div>
          </div>
        </section>

        {/* Table */}
        <div className={layoutStyles.tableShell}>
          <table className={layoutStyles.extracted8}>
            <caption className={layoutStyles.srOnly}>
              Vehicle checks by work date, job, client, vehicle, employee and status
            </caption>
            <colgroup>
              <col className={layoutStyles.dateColumn} />
              <col className={layoutStyles.jobColumn} />
              <col className={layoutStyles.clientColumn} />
              <col className={layoutStyles.vehicleColumn} />
              <col className={layoutStyles.employeeColumn} />
              <col className={layoutStyles.statusColumn} />
              <col className={layoutStyles.checksColumn} />
              <col className={layoutStyles.actionColumn} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Work date</th>
                <th scope="col">Job</th>
                <th scope="col">Client</th>
                <th scope="col">Vehicles</th>
                <th scope="col">Employees</th>
                <th scope="col">Status</th>
                <th scope="col">Checks</th>
                <th scope="col" className={layoutStyles.actionHeading}>Action</th>
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
                  const startsDateGroup = i === 0 || rows[i - 1]?.dateISO !== r.dateISO;

                  return (
                    <tr
                      key={`${r.jobId}-${r.dateISO}-${i}`}
                      data-state={r.state.toLowerCase()}
                      className={startsDateGroup ? layoutStyles.dateGroupStart : undefined}
                    >
                      <td className={layoutStyles.extracted9}>
                        <span className={layoutStyles.dateValue}>{formatDisplayDate(r.dateISO)}</span>
                        <span className={layoutStyles.dateContext}>{formatDateContext(r.dateISO)}</span>
                      </td>
                      <td className={layoutStyles.extracted10}>
                        <span className={layoutStyles.jobValue}>{r.jobLabel}</span>
                      </td>
                      <td className={layoutStyles.extracted11} title={r.client || ""}>
                        <span className={layoutStyles.clampedText}>{r.client || "-"}</span>
                      </td>
                      <td className={layoutStyles.extracted12} title={r.vehicles || ""}>
                        <span className={layoutStyles.clampedText}>{r.vehicles || "-"}</span>
                      </td>
                      <td className={layoutStyles.extracted13} title={(r.employees || []).join(", ")}>
                        <span className={layoutStyles.clampedText}>{employeesDisplay}</span>
                      </td>
                      <td className={layoutStyles.extracted14}>
                        <StatusBadge state={r.state} />
                      </td>
                      <td className={layoutStyles.extracted15}>
                        {r.submittedCount || r.draftCount ? (
                          <div className={layoutStyles.checkCounts}>
                            <span><strong>{r.submittedCount}</strong> submitted</span>
                            <span aria-hidden="true">·</span>
                            <span><strong>{r.draftCount}</strong> draft{r.draftCount === 1 ? "" : "s"}</span>
                          </div>
                        ) : (
                          <span className={layoutStyles.notStarted}>Not started</span>
                        )}
                      </td>
                      <td className={layoutStyles.extracted16}>
                        <Button
                          as={Link}
                          href={openHref}
                          className="vehicle-checks-action"
                          variant={r.checks?.length ? "secondary" : "primary"}
                          size="sm"
                          aria-label={`${openLabel} for ${r.jobLabel} on ${formatDisplayDate(r.dateISO)}`}
                        >
                          {r.checks?.length ? <ArrowUpRight size={14} /> : <Plus size={14} />}
                          {openLabel}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </PeopleFleetPage>

      <style jsx global>{`
        .vehicle-checks-action[data-ui-button="secondary"]:hover {
          background: var(--color-surface-subtle) !important;
          border-color: var(--shell-muted) !important;
        }
      `}</style>
    </HeaderSidebarLayout>
  );
}

function StatusBadge({ state }) {
  const config = {
    OK: { label: "Complete", Icon: CheckCircle2 },
    DEFECT: { label: "Defect", Icon: AlertTriangle },
    DRAFT: { label: "Draft", Icon: ClipboardCheck },
    MISSING: { label: "Missing", Icon: FileClock },
  }[state] || { label: state, Icon: FileClock };
  const Icon = config.Icon;

  return (
    <span className={layoutStyles.statusBadge} data-state={state.toLowerCase()}>
      <Icon size={14} aria-hidden="true" />
      {config.label}
    </span>
  );
}
