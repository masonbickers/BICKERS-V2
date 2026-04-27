// src/app/equipment/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 6,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

const pageWrap = { padding: "10px 18px 18px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 3,
  flexWrap: "wrap",
  marginBottom: 3,
};
const h1 = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.1,
  fontWeight: 950,
  color: UI.text,
  letterSpacing: "-0.01em",
};

const card = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      padding: "7px 10px",
      borderRadius: UI.radiusSm,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "7px 10px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
};

const input = {
  width: "100%",
  padding: "6px 9px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
};

const smallLabel = {
  fontSize: 11,
  color: UI.muted,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 1,
};

const chip = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: bg,
  color: fg,
  border: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
});

const safeLower = (s) => (s ? String(s).toLowerCase() : "");

const dateInfo = (raw) => {
  if (!raw) return { text: "—", style: { color: UI.muted } };
  const d = raw?.toDate ? raw.toDate() : new Date(raw);
  if (Number.isNaN(d.getTime())) return { text: String(raw), style: {} };

  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((t1 - t0) / 86400000);

  let style = {};
  if (diff < 0) style = { color: UI.red, fontWeight: 950 };
  else if (diff <= 21) style = { color: UI.amber, fontWeight: 950 };

  return { text: d.toLocaleDateString("en-GB"), style, diff };
};

function statusPillStyle(statusRaw) {
  const s = safeLower(statusRaw);
  if (!s) return chip("#e2e8f0", "#0f172a");
  if (s.includes("out") || s.includes("broken") || s.includes("repair")) return chip("#fee2e2", "#991b1b");
  if (s.includes("due") || s.includes("inspect") || s.includes("soon") || s.includes("maintenance")) {
    return chip("#ffedd5", "#9a3412");
  }
  if (s.includes("active") || s.includes("ok") || s.includes("ready") || s.includes("available") || s.includes("in")) {
    return chip("#dcfce7", "#166534");
  }
  return chip("#e2e8f0", "#0f172a");
}

const COLS = 6;

export default function EquipmentPage() {
  const router = useRouter();

  const [equipmentList, setEquipmentList] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [loading, setLoading] = useState(true);
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

        const categories = Array.from(new Set(list.map((e) => e.category).filter(Boolean))).sort((a, b) =>
          String(a).localeCompare(String(b))
        );
        const initialExpanded = {};
        categories.forEach((cat) => {
          initialExpanded[cat] = true;
        });
        setExpandedCategories((prev) => (Object.keys(prev).length ? prev : initialExpanded));
      } catch (err) {
        console.error("Failed to fetch equipment:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEquipment();
  }, []);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(equipmentList.map((e) => e.category).filter(Boolean)));
    return cats.sort((a, b) => String(a).localeCompare(String(b)));
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
        [e.name, e.serialNumber, e.asset, e.notes, e.status, e.category, e.location]
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
      grouped[cat].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    });

    return grouped;
  }, [filteredList]);

  const kpis = useMemo(() => {
    let overdue = 0;
    let soon = 0;

    filteredList.forEach((item) => {
      const info = dateInfo(item.nextInspection);
      if (typeof info.diff !== "number") return;
      if (info.diff < 0) overdue += 1;
      else if (info.diff <= 21) soon += 1;
    });

    return { count: filteredList.length, overdue, soon };
  }, [filteredList]);

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        input:focus, select:focus, button:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29,78,216,0.14);
          border-color: #bfdbfe !important;
        }
        .equipment-sticky thead th { position: sticky; top: 0; z-index: 5; }
        .equipment-sticky .catRow { position: sticky; top: 29px; z-index: 4; }
      `}</style>

      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Equipment Overview</h1>
          </div>

          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => router.push("/vehicle-home")} style={btn("ghost")}>
              ← Back
            </button>
            <button onClick={() => router.push("/add-equipment")} style={btn()}>
              + Add Equipment
            </button>
          </div>
        </div>

        <div style={{ marginBottom: UI.gap }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 198px 198px auto", gap: 3, alignItems: "end" }}>
            <div>
              <div style={smallLabel}>Search</div>
              <input
                type="text"
                placeholder="Search by name, serial, asset, status..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={input}
              />
            </div>

            <div>
              <div style={smallLabel}>Category</div>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={input}>
                <option value="All">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={smallLabel}>Status</div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={input}>
                <option value="All">All</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <span style={chip("#fff", UI.text)}>{kpis.count} equipment</span>
              <span style={chip("#fff7ed", "#9a3412")}>Due soon: {kpis.soon}</span>
              <span style={chip("#fef2f2", "#991b1b")}>Overdue: {kpis.overdue}</span>

              <button
                type="button"
                style={btn("ghost")}
                onClick={() => {
                  setQ("");
                  setCategoryFilter("All");
                  setStatusFilter("All");
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            ...card,
            overflow: "hidden",
            marginLeft: -18,
            marginRight: -18,
            borderRadius: 0,
            borderLeft: "none",
            borderRight: "none",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <div className="equipment-sticky">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Name", "Serial", "Status", "Next Inspection", "Notes", "Asset No."].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "5px 10px",
                          background: "#0f172a",
                          color: "#fff",
                          borderBottom: "1px solid #0b1220",
                          whiteSpace: "nowrap",
                          textAlign: "left",
                          fontWeight: 900,
                          fontSize: 11.5,
                          letterSpacing: ".02em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                {!loading &&
                  Object.entries(groupedByCategory).map(([category, list]) => (
                    <tbody key={category}>
                      <tr
                        onClick={() => toggleCategory(category)}
                        className="catRow"
                        style={{
                          background: "#f3f4f6",
                          cursor: "pointer",
                          borderTop: "1px solid #dbe1ea",
                          borderBottom: "1px solid #dbe1ea",
                        }}
                        title="Click to expand/collapse"
                      >
                        <td
                          colSpan={COLS}
                          style={{
                            padding: "3px 10px",
                            fontWeight: 900,
                            fontSize: 12,
                            lineHeight: 1.1,
                            color: UI.text,
                            verticalAlign: "middle",
                          }}
                        >
                          {expandedCategories[category] ? "▼" : "▶"} {category}{" "}
                          <span style={{ color: UI.muted, fontWeight: 800 }}>({list.length})</span>
                        </td>
                      </tr>

                      {expandedCategories[category] &&
                        list.map((e, i) => {
                          const zebra = i % 2 === 0 ? "#ffffff" : "#f3f4f6";
                          const nextInspection = dateInfo(e.nextInspection);
                          const rowTd = {
                            padding: "4px 10px",
                            borderBottom: "1px solid #dbe1ea",
                            whiteSpace: "nowrap",
                            verticalAlign: "middle",
                          };

                          return (
                            <tr
                              key={e.id}
                              onClick={() => router.push(`/edit-equipment/${e.id}`)}
                              style={{ background: zebra, cursor: "pointer" }}
                            >
                              <td style={{ ...rowTd, fontWeight: 900 }}>{e.name || "—"}</td>
                              <td style={rowTd}>{e.serialNumber || "—"}</td>
                              <td style={rowTd}>
                                <span style={statusPillStyle(e.status)}>{e.status || "Unknown"}</span>
                              </td>
                              <td style={{ ...rowTd, ...nextInspection.style }}>{nextInspection.text}</td>
                              <td style={{ ...rowTd, maxWidth: 420, whiteSpace: "normal" }}>
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
                              <td style={rowTd}>{e.asset || "—"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  ))}

                {loading && (
                  <tbody>
                    <tr>
                      <td colSpan={COLS} style={{ padding: 14, textAlign: "center", color: UI.muted }}>
                        Loading equipment...
                      </td>
                    </tr>
                  </tbody>
                )}

                {!loading && Object.keys(groupedByCategory).length === 0 && (
                  <tbody>
                    <tr>
                      <td colSpan={COLS} style={{ padding: 14, textAlign: "center", color: UI.muted }}>
                        No equipment found. Try clearing filters.
                      </td>
                    </tr>
                  </tbody>
                )}
              </table>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 4, color: UI.muted, fontSize: 12 }}>
          Inspection dates: <span style={{ color: UI.amber, fontWeight: 900 }}>orange</span> = due within 21 days,{" "}
          <span style={{ color: UI.red, fontWeight: 900 }}>red</span> = overdue.
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
