"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────── Mini design system (match your newer pages) ───────────────── */
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
  bookedBg: "#eef2ff",
  bookedFg: "#3730a3",
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

/* ───────────────── Utilities ───────────────── */
const parseDateAny = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d?.getTime?.()) ? null : d;
};

const fmtShort = (d) =>
  d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

const dateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysDiff = (a, b) => Math.round((dateOnly(a) - dateOnly(b)) / (1000 * 60 * 60 * 24));

function statusFromDays(diffDays) {
  if (diffDays < 0) return "overdue";
  if (diffDays <= 21) return "soon";
  return "ok";
}

function statusPillStyle(status) {
  if (status === "overdue") return pill(UI.overdueBg, UI.overdueFg);
  if (status === "soon") return pill(UI.soonBg, UI.soonFg);
  return pill(UI.okBg, UI.okFg);
}

function normaliseBookedStatus(v) {
  // serviceBookedStatus can be: "Requested" | "Booked" | "Completed" | "Cancelled" | "" etc
  const st = String(v?.serviceBookedStatus || "").trim().toLowerCase();
  if (!st) return null;
  if (st.includes("cancel")) return null;
  if (st.includes("declin")) return null;
  if (st.includes("complete")) return null;
  if (st.includes("book")) return "Booked";
  if (st.includes("request")) return "Requested";
  return "Booked";
}

function getBookedWindow(v) {
  // prefer booking range for multi-day, fallback to appointment
  const s = (v?.serviceBookingStartDate && parseDateAny(v.serviceBookingStartDate)) || null;
  const e = (v?.serviceBookingEndDate && parseDateAny(v.serviceBookingEndDate)) || null;
  const appt = (v?.serviceAppointmentDate && parseDateAny(v.serviceAppointmentDate)) || null;

  if (s && e) return { start: s, end: e, kind: "range" };
  if (appt) return { start: appt, end: appt, kind: "single" };
  return null;
}

function isBookedNow(v, today = new Date()) {
  const st = normaliseBookedStatus(v);
  if (!st) return false;

  const w = getBookedWindow(v);
  if (!w) return true; // status says booked/requested but dates missing => still show booked

  const t = dateOnly(today).getTime();
  const s = dateOnly(w.start).getTime();
  const e = dateOnly(w.end).getTime();
  return s <= t && t <= e;
}

export default function ServiceOverviewPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters / sorting
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | overdue | soon | ok | booked
  const [sort, setSort] = useState("risk"); // risk | daysAsc | daysDesc | name | booked

  useEffect(() => {
    const fetchVehicles = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "vehicles"));
        const today = new Date();

        const data = snapshot.docs.map((d) => {
          const v = d.data();

          // due logic
          const next = parseDateAny(v.nextService);
          const diffDays = next ? daysDiff(next, today) : null;
          const status = diffDays === null ? "unknown" : statusFromDays(diffDays);

          // booked logic (from vehicle summary fields)
          const bookedStatus = normaliseBookedStatus(v); // "Booked" | "Requested" | null
          const bookedWindow = getBookedWindow(v); // {start,end} | null
          const bookedNow = isBookedNow(v, today);

          const bookedLabel = bookedStatus
            ? bookedWindow
              ? `${bookt(bookedWindow.start)} → ${t(bookedWindow.end)}`
              : "Dates not set"
            : "";

          return {
            ...v,
            id: d.id,
            name: v.name || "—",
            reg: v.reg || v.registration || "—",
            category: v.category || "—",

            nextServiceRaw: next,
            nextServiceDate: fmtShort(next),
            daysUntilService: diffDays,
            status,

            bookedStatus, // null | "Booked" | "Requested"
            bookedNow, // boolean (today inside window OR dates missing but booked)
            bookedWindow,
          };
        });

        setVehicles(data);
      } finally {
        setLoading(false);
      }
    };

    // tiny helper functions for label
    function t(d) {
      return fmtShort(d);
    }
    function t2(d) {
      return fmtShort(d);
    }
    function t3(d) {
      return fmtShort(d);
    }
    function t4(d) {
      return fmtShort(d);
    }
    function t5(d) {
      return fmtShort(d);
    }
    function t6(d) {
      return fmtShort(d);
    }
    function t7(d) {
      return fmtShort(d);
    }
    function t8(d) {
      return fmtShort(d);
    }
    function t9(d) {
      return fmtShort(d);
    }
    function t10(d) {
      return fmtShort(d);
    }
    function t11(d) {
      return fmtShort(d);
    }
    function t12(d) {
      return fmtShort(d);
    }
    function t13(d) {
      return fmtShort(d);
    }
    function t14(d) {
      return fmtShort(d);
    }
    function t15(d) {
      return fmtShort(d);
    }
    function t16(d) {
      return fmtShort(d);
    }
    function t17(d) {
      return fmtShort(d);
    }
    function t18(d) {
      return fmtShort(d);
    }
    function t19(d) {
      return fmtShort(d);
    }
    function t20(d) {
      return fmtShort(d);
    }
    function t21(d) {
      return fmtShort(d);
    }
    function t22(d) {
      return fmtShort(d);
    }
    function t23(d) {
      return fmtShort(d);
    }
    function t24(d) {
      return fmtShort(d);
    }
    function t25(d) {
      return fmtShort(d);
    }
    function t26(d) {
      return fmtShort(d);
    }
    function t27(d) {
      return fmtShort(d);
    }
    function t28(d) {
      return fmtShort(d);
    }
    function t29(d) {
      return fmtShort(d);
    }
    function t30(d) {
      return fmtShort(d);
    }
    function t31(d) {
      return fmtShort(d);
    }
    function t32(d) {
      return fmtShort(d);
    }
    function t33(d) {
      return fmtShort(d);
    }
    function t34(d) {
      return fmtShort(d);
    }
    function t35(d) {
      return fmtShort(d);
    }
    function t36(d) {
      return fmtShort(d);
    }
    function t37(d) {
      return fmtShort(d);
    }
    function t38(d) {
      return fmtShort(d);
    }
    function t39(d) {
      return fmtShort(d);
    }
    function t40(d) {
      return fmtShort(d);
    }
    function t41(d) {
      return fmtShort(d);
    }
    function t42(d) {
      return fmtShort(d);
    }
    function t43(d) {
      return fmtShort(d);
    }
    function t44(d) {
      return fmtShort(d);
    }
    function t45(d) {
      return fmtShort(d);
    }
    function t46(d) {
      return fmtShort(d);
    }
    function t47(d) {
      return fmtShort(d);
    }
    function t48(d) {
      return fmtShort(d);
    }
    function t49(d) {
      return fmtShort(d);
    }
    function t50(d) {
      return fmtShort(d);
    }
    function t51(d) {
      return fmtShort(d);
    }
    function t52(d) {
      return fmtShort(d);
    }
    function t53(d) {
      return fmtShort(d);
    }
    function t54(d) {
      return fmtShort(d);
    }
    function t55(d) {
      return fmtShort(d);
    }
    function t56(d) {
      return fmtShort(d);
    }
    function t57(d) {
      return fmtShort(d);
    }
    function t58(d) {
      return fmtShort(d);
    }
    function t59(d) {
      return fmtShort(d);
    }
    function t60(d) {
      return fmtShort(d);
    }
    function t61(d) {
      return fmtShort(d);
    }
    function t62(d) {
      return fmtShort(d);
    }
    function t63(d) {
      return fmtShort(d);
    }
    function t64(d) {
      return fmtShort(d);
    }
    function t65(d) {
      return fmtShort(d);
    }
    function t66(d) {
      return fmtShort(d);
    }
    function t67(d) {
      return fmtShort(d);
    }
    function t68(d) {
      return fmtShort(d);
    }
    function t69(d) {
      return fmtShort(d);
    }
    function t70(d) {
      return fmtShort(d);
    }
    function t71(d) {
      return fmtShort(d);
    }
    function t72(d) {
      return fmtShort(d);
    }
    function t73(d) {
      return fmtShort(d);
    }
    function t74(d) {
      return fmtShort(d);
    }
    function t75(d) {
      return fmtShort(d);
    }
    function t76(d) {
      return fmtShort(d);
    }
    function t77(d) {
      return fmtShort(d);
    }
    function t78(d) {
      return fmtShort(d);
    }
    function t79(d) {
      return fmtShort(d);
    }
    function t80(d) {
      return fmtShort(d);
    }
    function t81(d) {
      return fmtShort(d);
    }
    function t82(d) {
      return fmtShort(d);
    }
    function t83(d) {
      return fmtShort(d);
    }
    function t84(d) {
      return fmtShort(d);
    }
    function t85(d) {
      return fmtShort(d);
    }
    function t86(d) {
      return fmtShort(d);
    }
    function t87(d) {
      return fmtShort(d);
    }
    function t88(d) {
      return fmtShort(d);
    }
    function t89(d) {
      return fmtShort(d);
    }
    function t90(d) {
      return fmtShort(d);
    }
    function t91(d) {
      return fmtShort(d);
    }
    function t92(d) {
      return fmtShort(d);
    }
    function t93(d) {
      return fmtShort(d);
    }
    function t94(d) {
      return fmtShort(d);
    }
    function t95(d) {
      return fmtShort(d);
    }
    function t96(d) {
      return fmtShort(d);
    }
    function t97(d) {
      return fmtShort(d);
    }
    function t98(d) {
      return fmtShort(d);
    }
    function t99(d) {
      return fmtShort(d);
    }
    function t100(d) {
      return fmtShort(d);
    }

    // actual fetch
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

    if (filter === "booked") {
      data = data.filter((v) => v.bookedStatus && v.bookedNow);
    } else if (filter !== "all") {
      data = data.filter((v) => v.status === filter);
    }

    const riskWeight = { overdue: 3, soon: 2, ok: 1, unknown: 0 };

    return [...data].sort((a, b) => {
      if (sort === "name") return String(a.name).localeCompare(String(b.name));
      if (sort === "daysAsc") return (a.daysUntilService ?? 999999) - (b.daysUntilService ?? 999999);
      if (sort === "daysDesc") return (b.daysUntilService ?? -999999) - (a.daysUntilService ?? -999999);

      if (sort === "booked") {
        const aw = a.bookedNow ? 1 : 0;
        const bw = b.bookedNow ? 1 : 0;
        if (bw !== aw) return bw - aw;
        return String(a.name).localeCompare(String(b.name));
      }

      // risk default: overdue -> soon -> ok, then soonest first
      const rw = (riskWeight[b.status] ?? 0) - (riskWeight[a.status] ?? 0);
      if (rw !== 0) return rw;
      return (a.daysUntilService ?? 999999) - (b.daysUntilService ?? 999999);
    });
  }, [vehicles, q, filter, sort]);

  const kpis = useMemo(() => {
    const overdue = vehicles.filter((v) => v.status === "overdue").length;
    const soon = vehicles.filter((v) => v.status === "soon").length;
    const ok = vehicles.filter((v) => v.status === "ok").length;
    const unknown = vehicles.filter((v) => v.status === "unknown").length;

    const bookedNow = vehicles.filter((v) => v.bookedStatus && v.bookedNow).length;

    return { overdue, soon, ok, unknown, bookedNow, total: vehicles.length };
  }, [vehicles]);

  const rowBg = (status, bookedNow) => {
    if (bookedNow) return { background: "#eef2ff" };
    if (status === "overdue") return { background: "#fff1f2" };
    if (status === "soon") return { background: "#fffbeb" };
    if (status === "ok") return { background: "#f0fdf4" };
    return {};
  };

  const bookedPill = (v) => {
    if (!v.bookedStatus) return null;

    const w = v.bookedWindow;
    const label =
      w && w.start && w.end
        ? `${fmtShort(w.start)} → ${fmtShort(w.end)}`
        : "Dates not set";

    const base = pill(UI.bookedBg, UI.bookedFg);
    return (
      <span style={base} title={label}>
        {v.bookedStatus === "Requested" ? "🟦 Requested" : "🟪 Booked"}
        {v.bookedNow ? " (now)" : ""}
        <span style={{ fontWeight: 800, opacity: 0.85 }}> · {label}</span>
      </span>
    );
  };

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        a:hover { background: #f8fafc !important; }
        input:focus, select:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
          border-color: #bfdbfe !important;
        }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={title}>Service Overview</h1>
            <div style={subtitle}>
              Auto-highlights vehicles due within <b>21 days</b> and those <b>overdue</b>. Also shows if a vehicle is{" "}
              <b>currently booked</b> for Service.
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
              Booked now
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, color: UI.bookedFg, marginTop: 6 }}>
              {kpis.bookedNow}
            </div>
          </div>

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
              <option value="booked">Filter: Booked now</option>
              <option value="overdue">Filter: Overdue</option>
              <option value="soon">Filter: Due soon</option>
              <option value="ok">Filter: OK</option>
            </select>

            <select style={select} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="risk">Sort: Risk (default)</option>
              <option value="booked">Sort: Booked (now first)</option>
              <option value="daysAsc">Sort: Days (low → high)</option>
              <option value="daysDesc">Sort: Days (high → low)</option>
              <option value="name">Sort: Name (A → Z)</option>
            </select>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={pill(UI.bookedBg, UI.bookedFg)}>Booked now</span>
            <span style={pill(UI.overdueBg, UI.overdueFg)}>Overdue</span>
            <span style={pill(UI.soonBg, UI.soonFg)}>Due Soon</span>
            <span style={pill(UI.okBg, UI.okFg)}>OK</span>
            <span style={pill("#f1f5f9", UI.text)}>
              Showing {filtered.length} / {kpis.total}
            </span>
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
                  <th style={th}>Booked</th>
                  <th style={th}>Days</th>
                  <th style={th}>Next Service</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: "center", color: UI.muted }}>
                      Loading vehicles…
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
                    const diff = v.daysUntilService;

                    return (
                      <tr key={v.id} style={rowBg(status, v.bookedStatus && v.bookedNow)}>
                        <td style={td}>
                          <div style={{ fontWeight: 950, color: UI.text }}>{v.name}</div>
                        </td>

                        <td style={td}>{v.reg}</td>
                        <td style={td}>{v.category}</td>

                        <td style={td}>
                          {v.bookedStatus ? (
                            bookedPill(v)
                          ) : (
                            <span style={pill("#f1f5f9", UI.text)}>—</span>
                          )}
                        </td>

                        <td style={td}>{diff === null || diff === undefined ? "—" : diff}</td>
                        <td style={td}>{v.nextServiceDate}</td>

                        <td style={td}>
                          {status === "unknown" ? (
                            <span style={pill("#f1f5f9", UI.text)}>Missing date</span>
                          ) : (
                            <span style={statusPillStyle(status)}>
                              {status === "overdue" ? "❌ Overdue" : status === "soon" ? "⚠️ Due Soon" : "✅ OK"}
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
