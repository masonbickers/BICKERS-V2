"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────── Mini design system (matches your other pages) ───────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 14,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  okBg: "#ecfdf5",
  okFg: "#065f46",
  soonBg: "#fff7ed",
  soonFg: "#9a3412",
  overdueBg: "#fef2f2",
  overdueFg: "#991b1b",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const title = { margin: 0, fontSize: 26, lineHeight: "32px", fontWeight: 900, color: UI.text };
const subtitle = { marginTop: 6, fontSize: 13, color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 14 };

const btn = (bg = "#fff", fg = UI.text) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: "1px solid #d1d5db",
  background: bg,
  color: fg,
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
});

const input = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 13.5,
  background: "#fff",
  color: UI.text,
  width: "100%",
};

const select = { ...input, width: "auto", minWidth: 190 };

const pill = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  background: bg,
  color: fg,
  border: "1px solid #e5e7eb",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
});

const tableWrap = { ...card, overflow: "hidden" };
const th = {
  padding: "10px 12px",
  fontSize: 12,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  borderBottom: "1px solid #eef2f7",
  textAlign: "left",
  background: "#f8fafc",
  fontWeight: 900,
};
const td = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const parseDateAny = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d) ? null : d;
};
const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysDiff = (a, b) => Math.round((dateOnly(a) - dateOnly(b)) / (1000 * 60 * 60 * 24));
const fmtShort = (d) =>
  d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

function statusFromDays(diffDays) {
  if (diffDays < 0) return "overdue";
  if (diffDays <= 21) return "soon";
  return "ok";
}

function statusPill(status, diffDays) {
  if (status === "overdue") return pill(UI.overdueBg, UI.overdueFg);
  if (status === "soon") return pill(UI.soonBg, UI.soonFg);
  return pill(UI.okBg, UI.okFg);
}

export default function MOTOverviewPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters / sorting
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | overdue | soon | ok
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
            name: vehicle.name || "—",
            reg: vehicle.reg || vehicle.registration || "—",
            category: vehicle.category || "—",
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
        a:hover { background: #f8fafc !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        input:focus, select:focus { outline: none; box-shadow: 0 0 0 4px rgba(29,78,216,0.15); border-color: #bfdbfe !important; }
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

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.back()} style={btn()}>
              ← Back
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={panel}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Overdue
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, color: UI.overdueFg, marginTop: 6 }}>
              {kpis.overdue}
            </div>
          </div>

          <div style={panel}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Due soon (≤ 21 days)
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, color: UI.soonFg, marginTop: 6 }}>
              {kpis.soon}
            </div>
          </div>

          <div style={panel}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}>
              OK
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, color: UI.okFg, marginTop: 6 }}>
              {kpis.ok}
            </div>
          </div>

          <div style={panel}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Unknown / Missing date
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, color: UI.text, marginTop: 6 }}>
              {kpis.unknown}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 220px 220px",
              gap: 10,
              alignItems: "center",
            }}
          >
            <input
              style={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, reg, category…"
              type="search"
            />

            <select style={select} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Filter: All</option>
              <option value="overdue">Filter: Overdue</option>
              <option value="soon">Filter: Due soon</option>
              <option value="ok">Filter: OK</option>
            </select>

            <select style={select} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="risk">Sort: Risk (default)</option>
              <option value="daysAsc">Sort: Days (low → high)</option>
              <option value="daysDesc">Sort: Days (high → low)</option>
              <option value="name">Sort: Name (A → Z)</option>
            </select>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={pill(UI.overdueBg, UI.overdueFg)}>Overdue</span>
            <span style={pill(UI.soonBg, UI.soonFg)}>Due Soon</span>
            <span style={pill(UI.okBg, UI.okFg)}>OK</span>
            <span style={pill("#f1f5f9", UI.text)}>Showing {filtered.length} / {kpis.total}</span>
          </div>
        </div>

        {/* Table */}
        <div style={tableWrap}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Reg</th>
                  <th style={th}>Category</th>
                  <th style={th}>Days</th>
                  <th style={th}>Next MOT</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      Loading vehicles…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      No vehicles match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((v, i) => {
                    const status = v.status === "unknown" ? "unknown" : v.status;
                    const diff = v.daysUntilMOT;

                    return (
                      <tr key={v.id} style={rowBg(status)}>
                        <td style={td}>
                          <div style={{ fontWeight: 950, color: UI.text }}>{v.name}</div>
                        </td>

                        <td style={td}>{v.reg}</td>
                        <td style={td}>{v.category}</td>

                        <td style={td}>
                          {diff === null || diff === undefined ? "—" : diff}
                        </td>

                        <td style={td}>{v.nextMOTDate}</td>

                        <td style={td}>
                          {status === "unknown" ? (
                            <span style={pill("#f1f5f9", UI.text)}>Missing date</span>
                          ) : (
                            <span style={statusPill(status, diff)}>
                              {status === "overdue"
                                ? "❌ Overdue"
                                : status === "soon"
                                ? "⚠️ Due Soon"
                                : "✅ OK"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
