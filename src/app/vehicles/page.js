// src/app/vehicles/page.js  (or wherever this lives)
//  Full improved version of your VehicleMaintenancePage
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import Papa from "papaparse";

/* ───────────────────────────────────────────
   Mini design system (matches your other pages)
─────────────────────────────────────────── */
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
const headerBar = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 3, flexWrap: "wrap", marginBottom: 3 };
const h1 = { margin: 0, fontSize: 24, lineHeight: 1.1, fontWeight: 950, color: UI.text, letterSpacing: "-0.01em" };

const card = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 6 };

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

const smallLabel = { fontSize: 11, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 1 };

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

/* ───────────────────────────────────────────
   Helpers
─────────────────────────────────────────── */
const safeDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const daysUntil = (d) => {
  if (!d) return null;
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((t1 - t0) / (1000 * 60 * 60 * 24));
};

const formatDateWithStyle = (raw) => {
  const d = safeDate(raw);
  if (!d) return { text: "—", style: { color: UI.muted } };

  const diff = daysUntil(d);
  let style = {};
  if (diff < 0) style = { color: UI.red, fontWeight: 950 };
  else if (diff <= 21) style = { color: UI.amber, fontWeight: 950 };

  const text = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
  return { text, style, diff };
};

const norm = (s) => String(s || "").trim().toLowerCase();
const taxStatusRank = (value) => {
  if (!String(value || "").trim()) return 0;
  const v = norm(value);
  if (v === "taxed") return 0;
  if (v === "sorn") return 1;
  if (v === "n/a") return 2;
  return 3;
};

/* columns count (IMPORTANT for colSpan) */
const COLS = 15;

export default function VehicleMaintenancePage() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("none"); // none | service | mot | mileage | az
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [savingKey, setSavingKey] = useState(null);
  const [importing, setImporting] = useState(false);
  const [renameFromCategory, setRenameFromCategory] = useState("");
  const [renameToCategory, setRenameToCategory] = useState("");
  const [renamingCategory, setRenamingCategory] = useState(false);

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const fetchVehicles = async () => {
    const snapshot = await getDocs(collection(db, "vehicles"));
    const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    setVehicles(list);

    const categories = Array.from(new Set(list.map((v) => v.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const initialExpanded = {};
    categories.forEach((cat) => (initialExpanded[cat] = true));
    setExpandedCategories((prev) => (Object.keys(prev).length ? prev : initialExpanded));
  };

  useEffect(() => {
    fetchVehicles().catch((err) => console.error("Failed to fetch vehicles:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist dropdown changes
  const handleSelectChange = async (id, field, value) => {
    const key = `${id}:${field}`;
    setSavingKey(key);

    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
    try {
      await updateDoc(doc(db, "vehicles", id), { [field]: value });
    } catch (err) {
      console.error("Failed to update vehicle:", err);
      alert("Could not save. Please try again.");
      // rollback not attempted (optional)
    } finally {
      setSavingKey(null);
    }
  };

  const handleRenameCategory = async () => {
    const from = String(renameFromCategory || "").trim();
    const to = String(renameToCategory || "").trim();

    if (!from) {
      alert("Choose a category to rename.");
      return;
    }
    if (!to) {
      alert("Enter the new category name.");
      return;
    }
    if (norm(from) === norm(to)) {
      alert("New category name must be different.");
      return;
    }
    if (categories.some((category) => norm(category) === norm(to))) {
      alert("A category with that name already exists.");
      return;
    }

    const matchingVehicles = vehicles.filter((vehicle) => norm(vehicle.category) === norm(from));
    if (!matchingVehicles.length) {
      alert("No vehicles found in that category.");
      return;
    }

    setRenamingCategory(true);
    try {
      await Promise.all(
        matchingVehicles.map((vehicle) => updateDoc(doc(db, "vehicles", vehicle.id), { category: to }))
      );

      setVehicles((prev) =>
        prev.map((vehicle) =>
          norm(vehicle.category) === norm(from) ? { ...vehicle, category: to } : vehicle
        )
      );
      setExpandedCategories((prev) => {
        const next = { ...prev };
        const wasExpanded = !!prev[from];
        delete next[from];
        next[to] = wasExpanded || !(to in next);
        return next;
      });
      setRenameFromCategory(to);
      setRenameToCategory("");
    } catch (err) {
      console.error("Failed to rename category:", err);
      alert("Could not rename category. Please try again.");
    } finally {
      setRenamingCategory(false);
    }
  };

  // Category list for filter UI
  const categories = useMemo(() => {
    return Array.from(new Set(vehicles.map((v) => v.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  // Filter + sort
  const filteredVehicles = useMemo(() => {
    let list = [...vehicles];

    // search
    const q = norm(search);
    if (q) {
      list = list.filter((v) => {
        const hay = [
          v.name,
          v.registration,
          v.reg,
          v.manufacturer,
          v.model,
          v.category,
        ]
          .filter(Boolean)
          .join(" ");
        return norm(hay).includes(q);
      });
    }

    // category filter
    if (categoryFilter !== "All") {
      list = list.filter((v) => v.category === categoryFilter);
    }

    // sort
    switch (sort) {
      case "service":
        list.sort((a, b) => (safeDate(a.nextService)?.getTime() || 0) - (safeDate(b.nextService)?.getTime() || 0));
        break;
      case "mot":
        list.sort((a, b) => (safeDate(a.nextMOT)?.getTime() || 0) - (safeDate(b.nextMOT)?.getTime() || 0));
        break;
      case "mileage":
        list.sort((a, b) => (Number(b.mileage || 0) - Number(a.mileage || 0)));
        break;
      case "az":
        list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        break;
      default:
        // keep as-is (Firestore order)
        break;
    }

    return list;
  }, [vehicles, search, categoryFilter, sort]);

  // Group by category
  const groupedByCategory = useMemo(() => {
    const acc = {};
    filteredVehicles.forEach((v) => {
      const cat = v.category || "Uncategorised";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(v);
    });
    Object.keys(acc).forEach((cat) =>
      acc[cat].sort((a, b) => {
        const statusDiff = taxStatusRank(a.taxStatus) - taxStatusRank(b.taxStatus);
        if (statusDiff !== 0) return statusDiff;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
    );
    return acc;
  }, [filteredVehicles]);

  // KPIs (overdue/soon)
  const kpis = useMemo(() => {
    let overdue = 0;
    let soon = 0;

    const fields = [
      "inspectionDate",
      "nextMOT",
      "nextRFL",
      "nextService",
      "nextTachoInspection",
      "nextBrakeTest",
      "nextPMIInspection",
      "nextTachoDownload",
    ];

    for (const v of filteredVehicles) {
      for (const f of fields) {
        const d = safeDate(v[f]);
        if (!d) continue;
        const diff = daysUntil(d);
        if (diff < 0) overdue++;
        else if (diff <= 21) soon++;
      }
    }

    return { count: filteredVehicles.length, overdue, soon };
  }, [filteredVehicles]);

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        input:focus, select:focus, button:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29,78,216,0.14);
          border-color: #bfdbfe !important;
        }
        .vh-sticky thead th { position: sticky; top: 0; z-index: 5; }
        .vh-sticky .catRow { position: sticky; top: 29px; z-index: 4; } /* keeps category header under table head */
        .vehicleDataRow td:nth-child(2) {
          width: 168px;
          max-width: 168px;
          font-weight: 400 !important;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Vehicle Maintenance Overview</h1>
          </div>

          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => router.push("/vehicle-home")} style={btn("ghost")}>
              ← Back
            </button>
            <button onClick={() => router.push("/add-vehicle")} style={btn()}>
              + Add Vehicle
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginBottom: UI.gap }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 198px 198px auto", gap: 3, alignItems: "end" }}>
            <div>
              <div style={smallLabel}>Search</div>
              <input
                type="text"
                placeholder="Search by name, reg, manufacturer, model…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={input}
              />
            </div>

            <div>
              <div style={smallLabel}>Category</div>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={input}>
                <option value="All">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={smallLabel}>Sort</div>
              <select value={sort} onChange={(e) => setSort(e.target.value)} style={input}>
                <option value="none">None</option>
                <option value="service">Next Service (soonest)</option>
                <option value="mot">Next MOT (soonest)</option>
                <option value="mileage">Mileage (highest)</option>
                <option value="az">Vehicle (A–Z)</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <span style={chip("#fff", UI.text)}>{kpis.count} vehicles</span>
              <span style={chip("#fff7ed", "#9a3412")}>Due soon: {kpis.soon}</span>
              <span style={chip("#fef2f2", "#991b1b")}>Overdue: {kpis.overdue}</span>

              <button
                type="button"
                style={btn("ghost")}
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("All");
                  setSort("none");
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "198px 1fr auto", gap: 3, alignItems: "end", marginTop: 3 }}>
            <div>
              <div style={smallLabel}>Rename Category</div>
              <select
                value={renameFromCategory}
                onChange={(e) => setRenameFromCategory(e.target.value)}
                style={input}
                disabled={renamingCategory}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={smallLabel}>New Name</div>
              <input
                type="text"
                value={renameToCategory}
                onChange={(e) => setRenameToCategory(e.target.value)}
                placeholder="Enter new category name"
                style={input}
                disabled={renamingCategory}
              />
            </div>

            <button
              type="button"
              style={btn("ghost")}
              onClick={handleRenameCategory}
              disabled={renamingCategory}
            >
              {renamingCategory ? "Renaming..." : "Rename"}
            </button>
          </div>

          {/* CSV import */}
          <div style={{ marginTop: 2, display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
            <VehicleCSVImport
              disabled={importing}
              onImportStart={() => setImporting(true)}
              onImportComplete={async () => {
                setImporting(false);
                await fetchVehicles();
              }}
            />
            {importing ? <span style={{ fontSize: 12, color: UI.muted }}>Importing…</span> : null}
          </div>
        </div>

        {/* Table */}
        <div style={{ ...card, overflow: "hidden", marginLeft: -18, marginRight: -18, borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
          <div style={{ overflowX: "auto" }}>
            <div className="vh-sticky">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {[
                      "Registration",
                      "Vehicle",
                      "Manufacturer",
                      "Model",
                      "Tax Status",
                      "Insurance",
                      "MOT",
                      "Road Tax",
                      "Service",
                      "PMI",
                      "Brake Test",
                      "Tacho Insp.",
                      "Tacho DL",
                      "Service Odo",
                    ].map((h) => (
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
                          ...(h === "Vehicle" ? { width: 168, maxWidth: 168 } : {}),
                          ...(h === "Model" ? { width: 150, maxWidth: 150 } : {}),
                          ...(h === "Insurance" ? { width: 118 } : {}),
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                {Object.entries(groupedByCategory).map(([category, list]) => (
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
                      list.map((v, i) => {
                        const zebra = i % 2 === 0 ? "#ffffff" : "#f3f4f6";
                        const reg = v.registration || v.reg || "—";

                        const rowTd = {
                          padding: "4px 10px",
                          borderBottom: "1px solid #dbe1ea",
                          whiteSpace: "nowrap",
                          verticalAlign: "middle",
                        };
                        const regCell = { ...rowTd, fontWeight: 900 };
                        const vehicleCell = { ...rowTd, fontWeight: 400 };
                        const vehicleNameCell = {
                          ...vehicleCell,
                          width: 168,
                          maxWidth: 168,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        };
                        const modelCell = {
                          ...rowTd,
                          paddingRight: 5,
                          width: 150,
                          maxWidth: 150,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        };
                        const taxCell = { ...rowTd, paddingLeft: 5 };
                        const insuranceCell = { ...rowTd, width: 118, maxWidth: 118 };

                        return (
                          <tr
                            key={v.id}
                            className="vehicleDataRow"
                            onClick={() => router.push(`/vehicle-edit/${v.id}`)}
                            style={{ background: zebra, cursor: "pointer" }}
                          >
                            <td style={regCell}>{reg}</td>
                            <td style={{ ...rowTd, fontWeight: 900 }}>{v.name || "—"}</td>
                            <td style={rowTd}>{v.manufacturer || "—"}</td>
                            <td style={modelCell}>{v.model || "—"}</td>

                            {/* Tax Status */}
                            <td style={taxCell} onClick={(e) => e.stopPropagation()}>
                              <select
                                style={miniSelect}
                                value={v.taxStatus || "Taxed"}
                                onChange={(e) => handleSelectChange(v.id, "taxStatus", e.target.value)}
                                disabled={savingKey === `${v.id}:taxStatus`}
                              >
                                <option value="Taxed">Taxed</option>
                                <option value="Sorn">Sorn</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </td>

                            {/* Insurance Status */}
                            <td style={insuranceCell} onClick={(e) => e.stopPropagation()}>
                              <select
                                style={miniSelect}
                                value={v.insuranceStatus || "Insured"}
                                onChange={(e) => handleSelectChange(v.id, "insuranceStatus", e.target.value)}
                                disabled={savingKey === `${v.id}:insuranceStatus`}
                              >
                                <option value="Insured">Insured</option>
                                <option value="Not Insured">Not Insured</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </td>

                            {/* Dates with colour-coded status */}
                            {renderDateCell(v.nextMOT, rowTd)}
                            {renderDateCell(v.nextRFL, rowTd)}
                            {renderDateCell(v.nextService, rowTd)}
                            {renderDateCell(v.nextPMIInspection, rowTd)}
                            {renderDateCell(v.nextBrakeTest, rowTd)}
                            {renderDateCell(v.nextTachoInspection, rowTd)}
                            {renderDateCell(v.nextTachoDownload, rowTd)}
                            <td style={rowTd}>{v.serviceOdometer || "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                ))}

                {Object.keys(groupedByCategory).length === 0 && (
                  <tbody>
                    <tr>
                      <td colSpan={COLS} style={{ padding: 14, textAlign: "center", color: UI.muted }}>
                        No vehicles found. Try clearing filters.
                      </td>
                    </tr>
                  </tbody>
                )}
              </table>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 4, color: UI.muted, fontSize: 12 }}>
          Row colours: <span style={{ color: UI.amber, fontWeight: 900 }}>orange</span> = due within 21 days,{" "}
          <span style={{ color: UI.red, fontWeight: 900 }}>red</span> = overdue.
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ───────────────────────────────────────────
   CSV import
─────────────────────────────────────────── */
function VehicleCSVImport({ onImportComplete, onImportStart, disabled }) {
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    onImportStart?.();

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          for (const vehicle of results.data || []) {
            if (!vehicle.name || !vehicle.category) continue;

            await addDoc(collection(db, "vehicles"), {
              name: vehicle.name,
              category: vehicle.category,
              registration: vehicle.registration || "",
              manufacturer: vehicle.manufacturer || "",
              model: vehicle.model || "",
              mileage: Number(vehicle.mileage || 0),
              lastService: vehicle.lastService || "",
              nextService: vehicle.nextService || "",
              lastMOT: vehicle.lastMOT || "",
              nextMOT: vehicle.nextMOT || "",
              notes: vehicle.notes || "",
            });
          }

          alert(" Vehicle data imported successfully!");
          await onImportComplete?.();
        } catch (err) {
          console.error(" Error importing vehicles:", err);
          alert("Import failed. Check console for details.");
        } finally {
          // reset file input so same file can be re-uploaded
          event.target.value = "";
        }
      },
      error: (err) => {
        console.error("Papa parse error:", err);
        alert("Could not read CSV file.");
        event.target.value = "";
      },
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
  
     
    </div>
  );
}

/* ───────────────────────────────────────────
   Small helpers
─────────────────────────────────────────── */
function renderDateCell(raw, baseStyle) {
  const { text, style } = formatDateWithStyle(raw);
  return <td style={{ ...baseStyle, ...style }}>{text}</td>;
}

const miniSelect = {
  width: "100%",
  padding: "3px 8px",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
  fontSize: 12,
  cursor: "pointer",
};
