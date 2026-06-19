"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onSnapshot } from "firebase/firestore";
import { ChevronRight, FileText, Home, Search } from "lucide-react";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";
import { formatQuoteDate, getCompletedQuoteRows, quoteMatchesSearch } from "@/app/utils/completedQuotes";
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
  gridTemplateColumns: "minmax(260px, 1fr) 180px auto",
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
const chip = (kind = "neutral") => {
  const base = {
    minHeight: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    border: `1px solid ${UI.border}`,
    background: UI.brandSoft,
    color: UI.brand,
    fontSize: 12,
    fontWeight: 900,
    padding: "0 9px",
    whiteSpace: "nowrap",
  };
  if (kind === "green") return { ...base, background: UI.greenSoft, borderColor: UI.greenBorder, color: UI.green };
  if (kind === "amber") return { ...base, background: UI.amberSoft, borderColor: UI.amberBorder, color: UI.amber };
  return base;
};
const statGrid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 10 };
const statCard = { ...surface, padding: 12 };
const statLabel = { color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const statValue = { color: UI.text, fontSize: 24, lineHeight: 1.1, fontWeight: 900, marginTop: 3 };
const tableWrap = { ...surface, overflowX: "auto" };
const table = { width: "100%", minWidth: 980, borderCollapse: "collapse", tableLayout: "fixed" };
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
const nowrap = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

const statusKind = (status = "") => {
  if (status === "Accepted") return "green";
  if (status === "Sent" || status === "Revised") return "amber";
  return "neutral";
};

export default function CompletedQuotesPage() {
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useSessionState("completed-quotes:search", "");
  const [statusFilter, setStatusFilter] = useSessionState("completed-quotes:status", "All");
  useSessionScroll("completed-quotes", !loading);

  useEffect(() => {
    if (!authState?.user) return undefined;
    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", authState), (snapshot) => {
      setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })));
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, authState]);

  const rows = useMemo(() => getCompletedQuoteRows(bookings), [bookings]);
  const statuses = useMemo(
    () => ["All", ...Array.from(new Set(rows.map((row) => row.status || "Draft"))).sort()],
    [rows]
  );
  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      const statusOk = statusFilter === "All" || row.status === statusFilter;
      return statusOk && quoteMatchesSearch(row, search);
    });
  }, [rows, search, statusFilter]);
  const acceptedCount = rows.filter((row) => row.status === "Accepted").length;

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Completed Quotes</h1>
            <div style={sub}>Saved quotes across all jobs, with direct links back into the quote builder.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/job-home" style={btn}>
              <Home size={14} />
              Jobs Home
            </Link>
            <span style={chip("green")}>
              <FileText size={14} />
              {loading ? "Loading..." : `${rows.length} quotes`}
            </span>
          </div>
        </div>

        <div style={statGrid}>
          <section style={statCard}>
            <div style={statLabel}>Completed Quotes</div>
            <div style={statValue}>{rows.length}</div>
          </section>
          <section style={statCard}>
            <div style={statLabel}>Accepted</div>
            <div style={statValue}>{acceptedCount}</div>
          </section>
        </div>

        <div style={toolbar}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: UI.muted }} aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quote, job, client, production, location..."
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
          <Link href="/create-booking" style={primaryBtn}>
            New Booking
            <ChevronRight size={14} />
          </Link>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, width: "12%" }}>Quote</th>
                <th style={{ ...th, width: "12%" }}>Job</th>
                <th style={{ ...th, width: "20%" }}>Client</th>
                <th style={{ ...th, width: "24%" }}>Description</th>
                <th style={{ ...th, width: "10%" }}>Status</th>
                <th style={{ ...th, width: "10%" }}>Saved</th>
                <th style={{ ...th, width: "12%" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ ...td, color: UI.muted }}>Loading completed quotes...</td>
                </tr>
              ) : visibleRows.length ? (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td style={td}>
                      <Link href={`/quote/${row.bookingId}?quote=${encodeURIComponent(row.quoteNumber || "")}`} style={{ color: UI.brand, fontWeight: 900, textDecoration: "none" }}>
                        {row.label || row.displayQuoteNumber || row.quoteNumber || "-"}
                      </Link>
                    </td>
                    <td style={td}>
                      <Link href={`/edit-booking/${row.bookingId}`} style={{ color: UI.text, fontWeight: 900, textDecoration: "none" }}>
                        #{row.jobNumber || "-"}
                      </Link>
                    </td>
                    <td style={{ ...td, ...nowrap }} title={row.client || row.production || ""}>
                      {row.client || row.production || "-"}
                    </td>
                    <td style={{ ...td, ...nowrap }} title={row.quoteName || row.templateName || row.location || ""}>
                      {row.quoteName || row.templateName || row.location || "-"}
                    </td>
                    <td style={td}>
                      <span style={chip(statusKind(row.status))}>{row.status || "Draft"}</span>
                    </td>
                    <td style={td}>{formatQuoteDate(row.savedAt)}</td>
                    <td style={td}>
                      <Link href={`/quote/${row.bookingId}?quote=${encodeURIComponent(row.quoteNumber || "")}`} style={btn}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ ...td, color: UI.muted }}>
                    No completed quotes match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <style>{`
          @media (max-width: 980px) {
            .completed-quotes-toolbar {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </HeaderSidebarLayout>
  );
}
