// src/app/equipment/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────── Mini design system (matches your newer pages) ───────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 16,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const shell = { display: "flex", minHeight: "100vh", background: UI.bg, color: UI.text };
const main = { flex: 1, padding: "0px", maxWidth: 1600, margin: "0 auto" };

const headerBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};
const title = { margin: 0, fontSize: 28, fontWeight: 950, letterSpacing: "-0.01em", color: UI.text };
const subtitle = { marginTop: 6, fontSize: 12.5, color: UI.muted };

const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 14 };

const controls = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };
const input = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "10px 10px",
  fontSize: 13,
  minWidth: 240,
  background: "#fff",
  color: UI.text,
};
const select = { ...input, minWidth: 180 };

const btn = (bg = "#fff", fg = UI.text, bd = "1px solid #e5e7eb") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: bd,
  background: bg,
  color: fg,
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
});

const tableWrap = {
  borderRadius: UI.radius,
  border: UI.border,
  overflow: "hidden",
  background: "#fff",
};
const tableScroll = { overflowX: "auto", overflowY: "auto", maxHeight: "72vh" };

const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 };
const th = {
  position: "sticky",
  top: 0,
  zIndex: 3,
  background: "#0f172a",
  color: "#fff",
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  whiteSpace: "nowrap",
};
const td = {
  padding: "10px 12px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
};

const groupRow = {
  background: "#f1f5f9",
  cursor: "pointer",
  fontWeight: 950,
  color: UI.text,
};
const rowClickable = { cursor: "pointer" };

const pill = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  background: bg,
  color: fg,
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
});

const safeLower = (s) => (s ? String(s).toLowerCase() : "");
const formatDate = (v) => {
  if (!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB");
};

function statusPill(statusRaw) {
  const s = safeLower(statusRaw);
  if (!s) return pill("#e2e8f0", "#0f172a"); // unknown
  if (s.includes("out") || s.includes("broken") || s.includes("repair")) return pill("#fee2e2", "#991b1b");
  if (s.includes("due") || s.includes("inspect") || s.includes("soon")) return pill("#ffedd5", "#9a3412");
  if (s.includes("active") || s.includes("ok") || s.includes("ready") || s.includes("in")) return pill("#dcfce7", "#166534");
  return pill("#e2e8f0", "#0f172a");
}

export default function EquipmentPage() {
  const router = useRouter();

  const [equipmentList, setEquipmentList] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  useEffect(() => {
    const fetchEquipment = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "equipment"));
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEquipmentList(list);

        const categories = Array.from(new Set(list.map((e) => e.category))).filter(Boolean);
        const initialExpanded = {};
        categories.forEach((cat) => (initialExpanded[cat] = true));
        setExpandedCategories(initialExpanded);
      } catch (err) {
        console.error("Failed to fetch equipment:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchEquipment();
  }, []);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(equipmentList.map((e) => e.category))).filter(Boolean);
    return cats.sort((a, b) => a.localeCompare(b));
  }, [equipmentList]);

  const statuses = useMemo(() => {
    const sts = Array.from(new Set(equipmentList.map((e) => e.status).filter(Boolean)));
    return sts.sort((a, b) => String(a).localeCompare(String(b)));
  }, [equipmentList]);

  const filteredList = useMemo(() => {
    let list = [...equipmentList];

    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((e) =>
        [e.name, e.serialNumber, e.asset, e.notes, e.status, e.category]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s))
      );
    }

    if (categoryFilter !== "All") list = list.filter((e) => e.category === categoryFilter);
    if (statusFilter !== "All") list = list.filter((e) => e.status === statusFilter);

    return list;
  }, [equipmentList, q, categoryFilter, statusFilter]);

  const groupedByCategory = useMemo(() => {
    const grouped = filteredList.reduce((acc, item) => {
      const cat = item.category || "Uncategorised";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
    Object.keys(grouped).forEach((cat) => {
      grouped[cat].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    });
    return grouped;
  }, [filteredList]);

  const total = equipmentList.length;
  const shown = filteredList.length;

  return (
    <HeaderSidebarLayout>
      <div style={shell}>
        <div style={{ ...pageWrap, width: "100%" }}>
          <main style={main}>
            <div style={headerBar}>
              <div>
                <h1 style={title}>Equipment Overview</h1>
                <div style={subtitle}>
                  Search, filter, and edit equipment. Categories are collapsible like your Vehicles table.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button style={btn("#fff", UI.text)} onClick={() => router.back()}>
                  ← Back
                </button>
                <button style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)} onClick={() => router.push("/add-equipment")}>
                  + Add Equipment
                </button>
              </div>
            </div>

            <div style={panel}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={controls}>
                  <input
                    type="search"
                    placeholder="Search name, serial, status, notes, asset…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={input}
                  />

                  <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={select}>
                    <option value="All">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={select}>
                    <option value="All">All statuses</option>
                    {statuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <button
                    style={btn("#fff", UI.text)}
                    onClick={() => {
                      setQ("");
                      setCategoryFilter("All");
                      setStatusFilter("All");
                    }}
                  >
                    Reset
                  </button>
                </div>

                <div style={{ fontSize: 12.5, color: UI.muted }}>
                  {loading ? "Loading…" : (
                    <>
                      Showing <strong style={{ color: UI.text }}>{shown}</strong> of {total}
                    </>
                  )}
                </div>
              </div>

              <div style={{ height: 12 }} />

              <div style={tableWrap}>
                <div style={tableScroll}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Name</th>
                        <th style={th}>Serial</th>
                        <th style={th}>Status</th>
                        <th style={th}>Next Inspection</th>
                        <th style={th}>Notes</th>
                        <th style={th}>Asset No.</th>
                      </tr>
                    </thead>

                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={6} style={{ ...td, textAlign: "center", color: UI.muted }}>
                            Loading equipment…
                          </td>
                        </tr>
                      ) : Object.keys(groupedByCategory).length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ ...td, textAlign: "center", color: UI.muted }}>
                            No equipment found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>

                    {Object.entries(groupedByCategory).map(([category, list]) => (
                      <tbody key={category}>
                        <tr
                          onClick={() => toggleCategory(category)}
                          style={groupRow}
                          title="Click to expand/collapse"
                        >
                          <td colSpan={6} style={{ ...td, borderBottom: "1px solid #e2e8f0" }}>
                            {expandedCategories[category] ? "▼" : "▶"} {category}{" "}
                            <span style={{ color: UI.muted, fontWeight: 900 }}>
                              (Count: {list.length})
                            </span>
                          </td>
                        </tr>

                        {expandedCategories[category] &&
                          list.map((e, i) => (
                            <tr
                              key={e.id}
                              onClick={() => router.push(`/edit-equipment/${e.id}`)}
                              style={{
                                ...rowClickable,
                                background: i % 2 === 0 ? "#fff" : "#fafafa",
                              }}
                              onMouseEnter={(ev) => (ev.currentTarget.style.boxShadow = UI.shadowHover)}
                              onMouseLeave={(ev) => (ev.currentTarget.style.boxShadow = "none")}
                            >
                              <td style={td}>
                                <div style={{ fontWeight: 950, color: UI.text }}>{e.name || "—"}</div>
                                <div style={{ fontSize: 12, color: UI.muted }}>
                                  {e.type ? `Type: ${e.type}` : ""}
                                </div>
                              </td>

                              <td style={td}>{e.serialNumber || "—"}</td>

                              <td style={td}>
                                <span style={statusPill(e.status)}>{e.status || "Unknown"}</span>
                              </td>

                              <td style={td}>{formatDate(e.nextInspection)}</td>

                              <td style={{ ...td, maxWidth: 420 }}>
                                <div
                                  style={{
                                    whiteSpace: "pre-wrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    color: e.notes ? UI.text : UI.muted,
                                  }}
                                >
                                  {e.notes || "—"}
                                </div>
                              </td>

                              <td style={td}>{e.asset || "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    ))}
                  </table>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button style={btn(UI.brand, "#fff", `1px solid ${UI.brand}`)} onClick={() => router.push("/add-equipment")}>
                  + Add Equipment
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
