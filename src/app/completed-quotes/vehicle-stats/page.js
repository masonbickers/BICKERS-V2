"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onSnapshot } from "firebase/firestore";
import { ArrowLeft, Home, Search } from "lucide-react";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";
import { getCompletedQuoteRows, money } from "@/app/utils/completedQuotes";
import { useSessionScroll, useSessionState } from "@/app/utils/useSessionState";

const UI = {
  bg: "#f3f6f9",
  panel: "#ffffff",
  border: "#d8e2ee",
  borderSoft: "#e7edf5",
  text: "#061426",
  muted: "#586b82",
  brand: "#1f4b7a",
  brandSoft: "#eaf3fc",
  green: "#16a34a",
  greenSoft: "#dcfce7",
  greenBorder: "#86efac",
  amber: "#b45309",
  amberSoft: "#fffbeb",
  amberBorder: "#fde68a",
};

const pageWrap = { minHeight: "100vh", background: UI.bg, color: UI.text, padding: "12px 14px 24px" };
const headerBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 10,
  flexWrap: "wrap",
};
const h1 = { margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: 0, color: UI.text };
const sub = { color: UI.muted, fontSize: 13, lineHeight: 1.35, marginTop: 4 };
const surface = {
  background: UI.panel,
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.05)",
};
const toolbar = {
  ...surface,
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) 160px auto",
  gap: 8,
  alignItems: "center",
  padding: 10,
  marginBottom: 10,
};
const input = {
  width: "100%",
  height: 36,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "#fff",
  color: UI.text,
  fontSize: 13,
  fontWeight: 700,
  padding: "0 12px",
  outline: "none",
  boxSizing: "border-box",
};
const btn = {
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "#fff",
  color: UI.text,
  fontSize: 13,
  fontWeight: 900,
  textDecoration: "none",
  padding: "0 12px",
  whiteSpace: "nowrap",
};
const primaryBtn = { ...btn, background: UI.brand, borderColor: UI.brand, color: "#fff" };
const statGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 10 };
const statCard = { ...surface, padding: 12 };
const statLabel = { color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const statValue = { color: UI.text, fontSize: 24, lineHeight: 1.1, fontWeight: 900, marginTop: 3 };
const tableWrap = { ...surface, overflowX: "auto", marginTop: 10 };
const table = { width: "100%", minWidth: 780, borderCollapse: "collapse", tableLayout: "fixed" };
const th = {
  padding: "8px 10px",
  textAlign: "left",
  color: "#4f6278",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  borderBottom: `1px solid ${UI.borderSoft}`,
  background: "#fbfdff",
};
const td = {
  padding: "7px 10px",
  borderBottom: `1px solid ${UI.borderSoft}`,
  fontSize: 13,
  fontWeight: 750,
  color: UI.text,
  verticalAlign: "middle",
};
const pill = {
  ...btn,
  height: 24,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  background: UI.amberSoft,
  color: UI.amber,
  border: `1px solid ${UI.amberBorder}`,
};

const parseNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const compact = (value = "") => String(value || "").trim();

const splitVehicleLabel = (vehicle) => {
  if (!vehicle) return "";
  if (typeof vehicle === "string") return compact(vehicle);
  if (typeof vehicle !== "object") return "";

  return compact(vehicle.name || vehicle.vehicleName || vehicle.label || vehicle.registration || vehicle.id);
};

const normalizeVehicleKey = (vehicle = "") => {
  const raw = compact(vehicle).toLowerCase().replace(/\s+/g, " ");
  if (!raw) return "";
  if (/\blow\s*-?\s*loader\b/.test(raw)) return "low loaders";
  return raw;
};

const humanizeVehicleKey = (vehicle = "") => {
  if (!vehicle) return "";
  return String(vehicle)
    .split(" ")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : ""))
    .join(" ");
};

export default function CompletedQuoteVehicleStatsPage() {
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useSessionState("completed-quotes-stats:search", "");
  const [statusFilter, setStatusFilter] = useSessionState("completed-quotes-stats:status", "Accepted");
  useSessionScroll("completed-quotes-stats", !loading);

  useEffect(() => {
    if (!authState?.user) return undefined;
    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", authState), (snapshot) => {
      setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })));
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, authState]);

  const rows = useMemo(() => getCompletedQuoteRows(bookings), [bookings]);
  const bookingById = useMemo(() => {
    const map = new Map();
    bookings.forEach((booking) => {
      if (!booking?.id) return;
      map.set(booking.id, booking);
    });
    return map;
  }, [bookings]);

  const statuses = useMemo(
    () => ["All", ...Array.from(new Set(rows.map((row) => row.status || "Draft"))).sort()],
    [rows]
  );

  const visibleRows = useMemo(() => {
    const searchNeedle = compact(search).toLowerCase();
    return rows.filter((row) => {
      const statusOk = statusFilter === "All" || row.status === statusFilter;
      if (!statusOk) return false;
      if (!searchNeedle) return true;
      return [row.jobNumber, row.quoteNumber, row.quoteName, row.client, row.production, row.location, row.label]
        .some((value) => compact(value).toLowerCase().includes(searchNeedle));
    });
  }, [rows, search, statusFilter]);

  const vehicleStats = useMemo(() => {
    const out = new Map();

    visibleRows.forEach((row) => {
      const booking = bookingById.get(row.bookingId) || {};
      const rawVehicles = Array.isArray(booking.vehicles) ? booking.vehicles : [];
      const labels = rawVehicles
        .map(splitVehicleLabel)
        .map(compact)
        .filter(Boolean);

      if (!labels.length) return;

      const seen = new Set();
      const quoteValue = parseNumber(row.subtotal);

      labels.forEach((label) => {
        const key = normalizeVehicleKey(label);
        if (!key || seen.has(key)) return;
        seen.add(key);

        const existing = out.get(key) || {
          key,
          name: humanizeVehicleKey(key),
          quoteCount: 0,
          totalCost: 0,
        };

        existing.quoteCount += 1;
        existing.totalCost += quoteValue;
        out.set(key, existing);
      });
    });

    return Array.from(out.values())
      .map((stat) => ({
        ...stat,
        averageReturn: stat.quoteCount ? stat.totalCost / stat.quoteCount : 0,

      }))
      .sort((a, b) => b.totalCost - a.totalCost || b.averageReturn - a.averageReturn || a.name.localeCompare(b.name));
  }, [bookingById, visibleRows]);

  const totalVehicleCost = useMemo(() => vehicleStats.reduce((sum, item) => sum + parseNumber(item.totalCost), 0), [vehicleStats]);
  const averageVehicleReturn = useMemo(
    () => vehicleStats.length ? totalVehicleCost / Math.max(1, vehicleStats.length) : 0,
    [vehicleStats.length, totalVehicleCost]
  );

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Vehicle Quote Stats</h1>
            <div style={sub}>Cost and average return rolled up by vehicle from completed-quote history.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/completed-quotes" style={btn}>
              <ArrowLeft size={14} />
              Back to Completed Quotes
            </Link>
            <Link href="/job-home" style={btn}>
              <Home size={14} />
              Jobs Home
            </Link>
          </div>
        </div>

        <div style={statGrid}>
          <section style={statCard}>
            <div style={statLabel}>Vehicles Seen</div>
            <div style={statValue}>{vehicleStats.length}</div>
          </section>
          <section style={statCard}>
            <div style={statLabel}>Total Return</div>
            <div style={statValue}>{"\u00A3"}
              {money(totalVehicleCost)}
            </div>
          </section>
          <section style={statCard}>
            <div style={statLabel}>Average Return (per vehicle)</div>
            <div style={statValue}>{"\u00A3"}
              {money(averageVehicleReturn)}
            </div>
          </section>
        </div>

        <div style={toolbar}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search vehicle, job, client, production..."
              style={{ ...input, paddingLeft: 34 }}
            />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={input}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === "All" ? "All statuses" : status}
              </option>
            ))}
          </select>
          <Link href="/completed-quotes" style={primaryBtn}>
            Open Completed Quotes
          </Link>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, width: "32%" }}>Vehicle</th>
                <th style={{ ...th, width: "12%" }}>Quotes</th>
                <th style={{ ...th, width: "22%" }}>Total Return</th>
                <th style={{ ...th, width: "22%" }}>Avg Return</th>
                <th style={{ ...th, width: "12%" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ ...td, color: UI.muted }}>Loading vehicle stats...</td>
                </tr>
              ) : vehicleStats.length ? (
                vehicleStats.map((stat) => (
                  <tr key={stat.key}>
                    <td style={td}>{stat.name}</td>
                    <td style={td}><span style={pill}>{stat.quoteCount} quote{stat.quoteCount === 1 ? "" : "s"}</span></td>
                    <td style={td}>{"\u00A3"}
                      {money(stat.totalCost)}
                    </td>
                    <td style={td}>{"\u00A3"}
                      {money(stat.averageReturn)}
                    </td>
                    <td style={td}>
                      <Link
                        href="/completed-quotes"
                        style={btn}
                      >
                        View Matches
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ ...td, color: UI.muted }}>
                    No vehicle stats match this selection yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <style>{`
          @media (max-width: 980px) {
            .completed-quotes-stats-toolbar {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </HeaderSidebarLayout>
  );
}


