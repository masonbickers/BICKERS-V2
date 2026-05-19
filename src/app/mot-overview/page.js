"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import MaintenanceBookingForm from "@/app/components/MaintenanceBookingForm";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Search,
} from "lucide-react";

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
  okBg: "#ecfdf5",
  okFg: "#065f46",
  soonBg: "#fff7ed",
  soonFg: "#9a3412",
  overdueBg: "#fef2f2",
  overdueFg: "#991b1b",
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
      ? "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)"
      : "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
    color: primary ? "#fff" : UI.text,
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
  background: "#fff",
  color: UI.text,
  width: "100%",
  outline: "none",
};

const select = { ...input, width: "100%", minWidth: 190 };

const pill = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  background: bg,
  color: fg,
  border: UI.border,
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
});

const tableWrap = { ...card, overflow: "hidden" };
const th = {
  padding: "11px 12px",
  fontSize: 11.5,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0,
  borderBottom: "1px solid #eef2f7",
  textAlign: "left",
  background: "#f6f8fb",
  fontWeight: 900,
};
const td = {
  padding: "11px 12px",
  fontSize: 13,
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

const actionBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "5px 8px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
  color: UI.brand,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 4px 10px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
  fontSize: 12,
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
const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysDiff = (a, b) => Math.round((dateOnly(a) - dateOnly(b)) / (1000 * 60 * 60 * 24));
const fmtShort = (d) => (d ? d.toLocaleDateString("en-GB") : "-");

const fmtInputDate = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function statusFromDays(diffDays) {
  if (diffDays < 0) return "overdue";
  if (diffDays <= 21) return "soon";
  return "ok";
}

function statusPill(status) {
  if (status === "overdue") return pill(UI.overdueBg, UI.overdueFg);
  if (status === "soon") return pill(UI.soonBg, UI.soonFg);
  return pill(UI.okBg, UI.okFg);
}

export default function MOTOverviewPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingVehicle, setBookingVehicle] = useState(null);

  // filters / sorting
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | overdue | soon | ok | unknown
  const [sort, setSort] = useState("risk"); // risk | daysAsc | daysDesc | name

  useEffect(() => {
    const fetchVehicles = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "vehicles"));
        const today = new Date();

        const data = snapshot.docs.map((d) => {
          const vehicle = d.data();

          const next = parseDateAny(vehicle.nextMOT);
          const diffDays = next ? daysDiff(next, today) : null;

          const status =
            diffDays === null ? "unknown" : statusFromDays(diffDays);

          return {
            ...vehicle,
            id: d.id,
            name: vehicle.name || "-",
            reg: vehicle.reg || vehicle.registration || "-",
            category: vehicle.category || "-",
            nextMOTRaw: next,
            nextMOTDate: fmtShort(next),
            daysUntilMOT: diffDays,
            status,
          };
        });

        setVehicles(data);
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, []);

  const refreshVehicles = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "vehicles"));
      const today = new Date();
      const data = snapshot.docs.map((d) => {
        const vehicle = d.data();
        const next = parseDateAny(vehicle.nextMOT);
        const diffDays = next ? daysDiff(next, today) : null;
        const status = diffDays === null ? "unknown" : statusFromDays(diffDays);

        return {
          ...vehicle,
          id: d.id,
          name: vehicle.name || "-",
          reg: vehicle.reg || vehicle.registration || "-",
          category: vehicle.category || "-",
          nextMOTRaw: next,
          nextMOTDate: fmtShort(next),
          daysUntilMOT: diffDays,
          status,
        };
      });

      setVehicles(data);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let data = vehicles;

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
    const riskWeight = { overdue: 3, soon: 2, ok: 1, unknown: 0 };
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
  }, [vehicles, q, filter, sort]);

  const kpis = useMemo(() => {
    const overdue = vehicles.filter((v) => v.status === "overdue").length;
    const soon = vehicles.filter((v) => v.status === "soon").length;
    const ok = vehicles.filter((v) => v.status === "ok").length;
    const unknown = vehicles.filter((v) => v.status === "unknown").length;
    return { overdue, soon, ok, unknown, total: vehicles.length };
  }, [vehicles]);

  const rowBg = (status) => {
    if (status === "overdue") return { background: "#fff1f2" };
    if (status === "soon") return { background: "#fffbeb" };
    if (status === "ok") return { background: "#f0fdf4" };
    return {};
  };

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        .mot-overview-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowHover} !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        input:focus, select:focus, button:focus { outline: none; box-shadow: 0 0 0 4px rgba(31,75,122,0.14); border-color: #9fb7cf !important; }
        .mot-overview-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
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
        <div style={headerBar}>
          <div>
            <h1 style={title}>MOT Overview</h1>
            <div style={subtitle}>
              Auto-highlights vehicles due within <b>21 days</b> and those <b>overdue</b>.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
          <SummaryCard label="Due Soon" value={kpis.soon} sub="Within 21 days" icon={Clock3} tone="amber" />
          <SummaryCard label="OK" value={kpis.ok} sub="More than 21 days" icon={CheckCircle2} tone="ok" />
          <SummaryCard label="Missing Date" value={kpis.unknown} sub={`${kpis.total} total vehicles`} icon={CalendarCheck2} tone="brand" />
        </div>

        {/* Controls */}
        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <div className="mot-overview-filter-grid">
            <label style={{ position: "relative", display: "block" }}>
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

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={pill(UI.overdueBg, UI.overdueFg)}>Overdue</span>
            <span style={pill(UI.soonBg, UI.soonFg)}>Due Soon</span>
            <span style={pill(UI.okBg, UI.okFg)}>OK</span>
            <span style={pill("#f1f5f9", UI.text)}>Missing Date</span>
            <span style={pill("#f1f5f9", UI.text)}>Showing {filtered.length} / {kpis.total}</span>
          </div>
        </div>

        {/* Table */}
        <div style={tableWrap}>
          <div style={{ overflowX: "auto" }}>
            <table className="mot-overview-table" style={{ width: "100%", minWidth: 940, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Reg</th>
                  <th style={th}>Category</th>
                  <th style={th}>Days</th>
                  <th style={th}>Next MOT</th>
                  <th style={th}>Status</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      Loading vehicles...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      No vehicles match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((v) => {
                    const status = v.status === "unknown" ? "unknown" : v.status;
                    const diff = v.daysUntilMOT;

                    return (
                      <tr key={v.id} style={rowBg(status)}>
                        <td style={td}>
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

                        <td style={td}>{v.reg}</td>
                        <td style={td}>{v.category}</td>

                        <td style={td}>
                          {diff === null || diff === undefined ? "-" : diff}
                        </td>

                        <td style={td}>{v.nextMOTDate}</td>

                        <td style={td}>
                          {status === "unknown" ? (
                            <span style={pill("#f1f5f9", UI.text)}>Missing date</span>
                          ) : (
                            <span style={statusPill(status)}>
                              {status === "overdue" ? "Overdue" : status === "soon" ? "Due Soon" : "OK"}
                            </span>
                          )}
                        </td>
                        <td style={td}>
                          <button
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
                          </button>
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
              await refreshVehicles();
            }}
          />
        ) : null}
      </div>
    </HeaderSidebarLayout>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, tone = "brand" }) {
  const tones = {
    danger: { bg: UI.overdueBg, fg: UI.overdueFg, border: "#fecdd3" },
    amber: { bg: UI.soonBg, fg: UI.soonFg, border: "#fed7aa" },
    ok: { bg: UI.okBg, fg: UI.okFg, border: "#bbf7d0" },
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
