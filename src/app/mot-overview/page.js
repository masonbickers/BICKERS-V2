"use client";

import layoutStyles from "./page.styles.module.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { getDocs } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import MaintenanceBookingForm from "@/app/components/MaintenanceBookingForm";
import { normalizeVehicleRecord } from "@/app/utils/vehicleCompat";
import { isRetentionPlateRecord } from "@/app/utils/vehicleRegisterPresentation";
import { isVehicleOutOfUse } from "@/app/utils/maintenanceSchema";
import { normalizeMaintenanceRecord } from "@/app/utils/maintenanceRecord";
import {
  getUnarrangedMaintenanceDueDate,
  isConfirmedMaintenanceBooking,
  isOpenMaintenanceBooking,
} from "@/app/utils/maintenanceCalendar";
import { MOT_WARNING_DAYS, getMotDuePresentation } from "@/app/utils/motPresentation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* UI tokens */
const UI = UI_TOKENS;

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const title = { margin: 0, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, color: UI.text };
const subtitle = { marginTop: 6, fontSize: 13.5, lineHeight: 1.45, color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 12 };

const btn = (kind = "ghost") => {
  const primary = kind === "primary";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: primary ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
    background: primary
      ? "linear-gradient(180deg, var(--color-brand-hover) 0%, var(--color-brand) 100%)"
      : "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
    color: primary ? "var(--color-white)" : UI.text,
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
    boxShadow: primary
      ? "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)"
      : "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const input = {
  minHeight: 38,
  border: UI.border,
  borderRadius: UI.radiusSm,
  padding: "8px 10px",
  fontSize: 13,
  background: "var(--color-surface)",
  color: UI.text,
  width: "100%",
  outline: "none",
};

const select = { ...input, width: "100%", minWidth: 190 };

const pill = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 8px",
  borderRadius: 999,
  background: bg,
  color: fg,
  border: UI.border,
  fontSize: 11.5,
  fontWeight: 800,
  whiteSpace: "nowrap",
});

const tableWrap = { ...card, overflow: "hidden" };
const th = {
  padding: "5px 8px",
  fontSize: 10.5,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0,
  borderBottom: "1px solid var(--color-border)",
  textAlign: "left",
  background: "var(--color-surface-subtle)",
  fontWeight: 900,
};
const td = {
  padding: "5px 8px",
  fontSize: 12.5,
  borderBottom: "1px solid var(--color-surface-hover)",
  verticalAlign: "middle",
};

const actionBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 24,
  padding: "3px 7px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
  color: UI.brand,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "none",
  fontSize: 11,
  lineHeight: 1.2,
};

const parseDateAny = (v) => {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d) ? null : d;
};
const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB") : "-");

const fmtInputDate = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function statusPill(status) {
  if (status === "overdue") return pill(UI.overdueBg, UI.overdueFg);
  if (status === "soon") return pill(UI.soonBg, UI.soonFg);
  return pill(UI.okBg, UI.okFg);
}

function getBookedMotRecord(booking) {
  const canonical = normalizeMaintenanceRecord(booking, { id: booking?.id });
  const isMot = canonical.items.some((item) => item.maintenanceTypeId === "mot");
  if (!isMot || !isConfirmedMaintenanceBooking(booking) || !isOpenMaintenanceBooking(booking)) {
    return null;
  }
  return canonical;
}

function getBookingStart(booking) {
  const candidates = Array.isArray(booking?.bookingDates) ? booking.bookingDates : [];
  return (
    candidates.map(parseDateAny).filter(Boolean).sort((a, b) => a - b)[0] ||
    parseDateAny(booking?.appointmentDateISO) ||
    parseDateAny(booking?.appointmentDate) ||
    parseDateAny(booking?.startDateISO) ||
    parseDateAny(booking?.startDate) ||
    null
  );
}

function bookingLabel(booking) {
  const date = getBookingStart(booking);
  return [date ? fmtShort(date) : "Date not set", booking?.provider].filter(Boolean).join(" - ");
}

export default function MOTOverviewPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [vehicles, setVehicles] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingVehicle, setBookingVehicle] = useState(null);

  // filters / sorting
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | overdue | soon | ok | unknown
  const [sort, setSort] = useState("risk"); // risk | daysAsc | daysDesc | name

  const loadData = useCallback(async () => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "load MOT overview data" });
      setVehicles([]);
      setMaintenanceBookings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [vehicleSnapshot, bookingSnapshot] = await Promise.all([
        getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState)),
        getDocs(tenantCollectionQuery(db, "maintenanceBookings", dataAccessState)),
      ]);
      setVehicles(
        vehicleSnapshot.docs
          .map((item) => normalizeVehicleRecord({ id: item.id, ...item.data() }))
          .filter((vehicle) => !isVehicleOutOfUse(vehicle) && !isRetentionPlateRecord(vehicle))
      );
      setMaintenanceBookings(bookingSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    } finally {
      setLoading(false);
    }
  }, [dataAccessState]);

  useEffect(() => {
    loadData();
  }, [accessKey, loadData]);

  const activeMotBookings = useMemo(() => maintenanceBookings
    .map((booking) => {
      const canonical = getBookedMotRecord(booking);
      return canonical ? { ...booking, canonicalStatus: canonical.status } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (getBookingStart(a)?.getTime() || 9999999999999) - (getBookingStart(b)?.getTime() || 9999999999999)),
  [maintenanceBookings]);

  const bookingsByVehicle = useMemo(() => {
    const map = new Map();
    activeMotBookings.forEach((booking) => {
      const vehicleId = String(booking.vehicleId || "").trim();
      if (!vehicleId) return;
      const rows = map.get(vehicleId) || [];
      rows.push(booking);
      map.set(vehicleId, rows);
    });
    return map;
  }, [activeMotBookings]);

  const motDueByVehicle = useMemo(() => {
    const map = new Map();
    maintenanceBookings.forEach((booking) => {
      const dueDate = getUnarrangedMaintenanceDueDate(booking, "mot");
      const vehicleId = String(booking.vehicleId || "").trim();
      if (!vehicleId || !dueDate) return;
      const current = map.get(vehicleId);
      if (!current || dueDate < current) map.set(vehicleId, dueDate);
    });
    return map;
  }, [maintenanceBookings]);

  const motRows = useMemo(() => vehicles.map((vehicle) => {
    const due = getMotDuePresentation(vehicle, {
      dueDate: motDueByVehicle.get(String(vehicle.id)) || vehicle.nextMOT,
    });
    const activeBookings = bookingsByVehicle.get(String(vehicle.id)) || [];
    return {
      ...vehicle,
      name: vehicle.name || "-",
      reg: vehicle.reg || vehicle.registration || "-",
      category: vehicle.category || "-",
      nextMOTRaw: due.dueDate,
      nextMOTDate: due.dateDisplay,
      daysUntilMOT: due.daysUntilDue,
      status: due.status,
      activeBookings,
      nextBooking: activeBookings[0] || null,
      hasMotBooking: activeBookings.length > 0,
    };
  }), [bookingsByVehicle, motDueByVehicle, vehicles]);

  const filtered = useMemo(() => {
    let data = motRows;

    const s = q.trim().toLowerCase();
    if (s) {
      data = data.filter((v) =>
        [v.name, v.reg, v.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s)
      );
    }

    if (filter !== "all") {
      data = data.filter((v) => v.status === filter);
    }

    // sorting
    const riskWeight = { overdue: 5, soon: 4, "awaiting-dvsa": 3, unknown: 2, ok: 1, "not-applicable": 0 };
    data = [...data].sort((a, b) => {
      if (sort === "name") return String(a.name).localeCompare(String(b.name));
      if (sort === "daysAsc") return (a.daysUntilMOT ?? 999999) - (b.daysUntilMOT ?? 999999);
      if (sort === "daysDesc") return (b.daysUntilMOT ?? -999999) - (a.daysUntilMOT ?? -999999);

      // risk (default): overdue -> soon -> ok, then by days ascending
      const rw = (riskWeight[b.status] ?? 0) - (riskWeight[a.status] ?? 0);
      if (rw !== 0) return rw;
      return (a.daysUntilMOT ?? 999999) - (b.daysUntilMOT ?? 999999);
    });

    return data;
  }, [motRows, q, filter, sort]);

  const kpis = useMemo(() => {
    const overdue = motRows.filter((v) => v.status === "overdue").length;
    const soon = motRows.filter((v) => v.status === "soon").length;
    const ok = motRows.filter((v) => v.status === "ok").length;
    const unknown = motRows.filter((v) => v.status === "unknown").length;
    const awaitingDvsa = motRows.filter((v) => v.status === "awaiting-dvsa").length;
    const notApplicable = motRows.filter((v) => v.status === "not-applicable").length;
    const booked = motRows.filter((v) => v.hasMotBooking).length;
    return { overdue, soon, ok, unknown, awaitingDvsa, notApplicable, booked, total: motRows.length };
  }, [motRows]);

  const rowBg = (status, booked) => {
    if (booked) return { background: "var(--color-info-soft)" };
    if (status === "overdue" || status === "soon") return { background: "var(--color-warning-soft)" };
    if (status === "ok") return { background: "var(--color-success-soft)" };
    return {};
  };

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        .mot-overview-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowHover} !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        input:focus, select:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: var(--shell-muted) !important; }
        .mot-overview-kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        .mot-overview-filter-grid {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 220px 220px auto;
          gap: 10px;
          align-items: center;
        }
        @media (max-width: 1180px) {
          .mot-overview-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .mot-overview-filter-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 720px) {
          .mot-overview-kpi-grid, .mot-overview-filter-grid { grid-template-columns: 1fr !important; }
        }
        .mot-overview-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .mot-overview-table tbody tr:hover {
          filter: brightness(0.995);
        }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div className={layoutStyles.extracted1}>
          <div>
            <h1 style={title}>MOT Overview</h1>
            <div style={subtitle}>
              Auto-highlights vehicles due within <b>{MOT_WARNING_DAYS} days</b> and those <b>overdue</b>.
            </div>
          </div>

          <div className={layoutStyles.extracted2}>
            <button type="button" className="mot-overview-action" onClick={() => router.push("/dashboard")} style={btn("primary")}>
              <CalendarCheck2 size={15} />
              Dashboard
            </button>
            <button type="button" className="mot-overview-action" onClick={() => router.back()} style={btn()}>
              <ArrowLeft size={15} />
              Back
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mot-overview-kpi-grid">
          <SummaryCard label="Overdue" value={kpis.overdue} sub="Expired MOT dates" icon={AlertTriangle} tone="danger" />
          <SummaryCard label="Due Soon" value={kpis.soon} sub={`Within ${MOT_WARNING_DAYS} days`} icon={Clock3} tone="amber" />
          <SummaryCard label="Booked" value={kpis.booked} sub={`${activeMotBookings.length} active bookings`} icon={CalendarCheck2} tone="brand" />
          <SummaryCard label="Awaiting DVSA" value={kpis.awaitingDvsa} sub="Completed, result pending" icon={Clock3} tone="amber" />
          <SummaryCard label="OK" value={kpis.ok} sub={`More than ${MOT_WARNING_DAYS} days`} icon={CheckCircle2} tone="ok" />
          <SummaryCard label="Missing Date" value={kpis.unknown} sub={`${kpis.notApplicable} not required`} icon={CalendarCheck2} tone="brand" />
        </div>

        {/* Controls */}
        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <div className="mot-overview-filter-grid">
            <label className={layoutStyles.extracted3}>
              <Search
                size={16}
                style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: UI.muted }}
              />
              <input
                style={{ ...input, paddingLeft: 34 }}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, reg, category..."
                type="search"
              />
            </label>

            <select style={select} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Filter: All</option>
              <option value="overdue">Filter: Overdue</option>
              <option value="soon">Filter: Due soon</option>
              <option value="ok">Filter: OK</option>
              <option value="unknown">Filter: Missing date</option>
              <option value="awaiting-dvsa">Filter: Awaiting DVSA</option>
              <option value="not-applicable">Filter: Not required</option>
            </select>

            <select style={select} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="risk">Sort: Risk (default)</option>
              <option value="daysAsc">Sort: Days low to high</option>
              <option value="daysDesc">Sort: Days high to low</option>
              <option value="name">Sort: Name A to Z</option>
            </select>

            <button
              type="button"
              className="mot-overview-action"
              style={btn()}
              onClick={() => {
                setQ("");
                setFilter("all");
                setSort("risk");
              }}
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div className={layoutStyles.extracted4}>
            <span style={pill(UI.overdueBg, UI.overdueFg)}>Overdue</span>
            <span style={pill(UI.soonBg, UI.soonFg)}>Due Soon</span>
            <span style={pill(UI.okBg, UI.okFg)}>OK</span>
            <span style={pill("var(--color-warning-soft)", "var(--color-warning-text)")}>Awaiting DVSA</span>
            <span style={pill("var(--color-info-soft)", "var(--color-info)")}>Booked</span>
            <span style={pill("var(--color-surface-hover)", UI.muted)}>N/A</span>
            <span style={pill("var(--color-surface-hover)", UI.text)}>Missing Date</span>
            <span style={pill("var(--color-surface-hover)", UI.text)}>Showing {filtered.length} / {kpis.total}</span>
          </div>
        </div>

        {/* Table */}
        <div style={tableWrap}>
          <div className={layoutStyles.extracted5}>
            <table className={`mot-overview-table ${layoutStyles.extracted6}`} >
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Reg</th>
                  <th style={th}>Category</th>
                  <th style={th}>Days</th>
                  <th style={th}>Next MOT</th>
                  <th style={th}>Status</th>
                  <th style={th}>Booking</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      Loading vehicles...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      No vehicles match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((v) => {
                    const status = v.status === "unknown" ? "unknown" : v.status;
                    const diff = v.daysUntilMOT;

                    return (
                      <tr key={v.id} style={rowBg(status, v.hasMotBooking)}>
                        <td className={layoutStyles.extracted7}>
                          <button
                            type="button"
                            onClick={() => router.push(`/vehicle-edit/${v.id}`)}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              margin: 0,
                              fontWeight: 950,
                              color: UI.text,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            title="Open vehicle"
                          >
                            {v.name}
                          </button>
                        </td>

                        <td className={layoutStyles.extracted8}>{v.reg}</td>
                        <td className={layoutStyles.extracted9}>{v.category}</td>

                        <td className={layoutStyles.extracted10}>
                          {diff === null || diff === undefined ? "-" : diff}
                        </td>

                        <td className={layoutStyles.extracted11}>
                          {v.nextMOTDate}
                        </td>

                        <td className={layoutStyles.extracted12}>
                          {status === "awaiting-dvsa" ? (
                            <span style={pill("var(--color-warning-soft)", "var(--color-warning-text)")}>Awaiting DVSA</span>
                          ) : status === "not-applicable" ? (
                            <span style={pill("var(--color-surface-hover)", UI.muted)}>N/A</span>
                          ) : status === "unknown" ? (
                            <span style={pill("var(--color-surface-hover)", UI.text)}>Missing date</span>
                          ) : (
                            <span style={statusPill(status)}>
                              {status === "overdue" ? "Overdue" : status === "soon" ? "Due Soon" : "OK"}
                            </span>
                          )}
                        </td>
                        <td className={layoutStyles.extracted13}>
                          {v.nextBooking ? (
                            <span style={pill("var(--color-info-soft)", "var(--color-info)")} title={bookingLabel(v.nextBooking)}>
                              {v.nextBooking.canonicalStatus === "in_progress" ? "In progress" : "Booked"} - {bookingLabel(v.nextBooking)}
                            </span>
                          ) : status === "not-applicable" || status === "awaiting-dvsa" ? (
                            <span style={pill("var(--color-surface-hover)", UI.muted)}>N/A</span>
                          ) : (
                            <span style={pill("var(--color-surface-hover)", UI.text)}>Not booked</span>
                          )}
                        </td>
                        <td className={layoutStyles.extracted13}>
                          {status === "not-applicable" ? (
                            <span style={pill("var(--color-surface-hover)", UI.muted)}>Not required</span>
                          ) : status === "awaiting-dvsa" ? (
                            <span style={pill("var(--color-warning-soft)", "var(--color-warning-text)")}>Result pending</span>
                          ) : v.hasMotBooking ? (
                            <button type="button" className="mot-overview-action" style={actionBtn} onClick={() => router.push(`/vehicle-edit/${v.id}`)}>
                              <CalendarCheck2 size={13} />
                              Open booking
                            </button>
                          ) : <button
                            type="button"
                            className="mot-overview-action"
                            style={actionBtn}
                            onClick={() =>
                              setBookingVehicle({
                                id: v.id,
                                name: v.name,
                                reg: v.reg,
                                nextMOTRaw: v.nextMOTRaw,
                              })
                            }
                          >
                            <CalendarCheck2 size={13} />
                            Book MOT
                          </button>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {bookingVehicle ? (
          <MaintenanceBookingForm
            vehicleId={bookingVehicle.id}
            type="MOT"
            defaultDate={fmtInputDate(bookingVehicle.nextMOTRaw)}
            onClose={() => setBookingVehicle(null)}
            onSaved={async () => {
              setBookingVehicle(null);
              await loadData();
            }}
          />
        ) : null}
      </div>
    </HeaderSidebarLayout>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, tone = "brand" }) {
  const tones = {
    danger: { bg: UI.overdueBg, fg: UI.overdueFg, border: "var(--color-danger-border)" },
    amber: { bg: UI.soonBg, fg: UI.soonFg, border: "var(--color-warning-border)" },
    ok: { bg: UI.okBg, fg: UI.okFg, border: "var(--color-success-border)" },
    brand: { bg: UI.brandSoft, fg: UI.brand, border: UI.brandBorder },
  };
  const toneStyles = tones[tone] || tones.brand;

  return (
    <div style={{ ...panel, minHeight: 82, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
          {label}
        </div>
        <div style={{ marginTop: 4, color: UI.text, fontSize: 24, lineHeight: 1, fontWeight: 950 }}>{value}</div>
        <div style={{ marginTop: 6, color: UI.muted, fontSize: 12.5, fontWeight: 700 }}>{sub}</div>
      </div>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          border: `1px solid ${toneStyles.border}`,
          background: toneStyles.bg,
          color: toneStyles.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        <Icon size={20} />
      </div>
    </div>
  );
}
