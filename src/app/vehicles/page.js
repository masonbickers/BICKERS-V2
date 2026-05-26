"use client";

import { useEffect, useMemo, useState } from "react";
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
import { ArrowLeft, FilePlus2, Plus, RotateCcw, Search } from "lucide-react";

/* UI tokens */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 6,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandBorder: "#c8d6e3",
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

const pageWrap = { padding: "10px 18px 18px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, flexWrap: "wrap", marginBottom: 4 };
const h1 = { margin: 0, fontSize: 24, lineHeight: 1.08, fontWeight: 850, color: UI.text, letterSpacing: 0 };

const card = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 6 };

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      padding: "5px 8px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12,
      lineHeight: 1.2,
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "5px 8px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12,
    lineHeight: 1.2,
  };
};

const input = {
  width: "100%",
  minHeight: 30,
  padding: "5px 8px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
};

const smallLabel = { fontSize: 11, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0, marginBottom: 1 };

const chip = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: bg,
  color: fg,
  border: UI.border,
  whiteSpace: "nowrap",
});

/* Helpers */
const safeDate = (v) => {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
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

const formatDateWithStyle = (raw, options = {}) => {
  const { soonDays = 21 } = options;
  const d = safeDate(raw);
  if (!d) return { text: "-", style: { color: UI.muted } };

  const diff = daysUntil(d);
  let style = {};
  if (diff < 0) style = { color: UI.red, fontWeight: 950 };
  else if (diff <= soonDays) style = { color: UI.amber, fontWeight: 950 };

  const text = d.toLocaleDateString("en-GB");
  return { text, style, diff };
};

const norm = (s) => String(s || "").trim().toLowerCase();
const RETENTION_PLATE_CATEGORY = "Number Plates On Retention";
const isRetentionPlate = (vehicle = {}) =>
  norm(vehicle.category) === norm(RETENTION_PLATE_CATEGORY) || vehicle.recordType === "numberPlateRetention";
const isTradePlate = (vehicle = {}) => norm(vehicle.plateType) === "trade";
const categorySort = (a, b) => {
  const aRetention = norm(a) === norm(RETENTION_PLATE_CATEGORY);
  const bRetention = norm(b) === norm(RETENTION_PLATE_CATEGORY);
  if (aRetention && !bRetention) return 1;
  if (!aRetention && bRetention) return -1;
  return String(a || "").localeCompare(String(b || ""));
};

const taxStatusRank = (value) => {
  if (!String(value || "").trim()) return 0;
  const v = norm(value);
  if (v === "taxed") return 0;
  if (v === "sorn") return 1;
  if (v === "n/a") return 2;
  return 3;
};

const getVehicleOdometerValue = (vehicle) => {
  const candidates = [vehicle?.odometer, vehicle?.serviceOdometer, vehicle?.mileage];

  for (const candidate of candidates) {
    const numeric = Number(String(candidate ?? "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  return null;
};

const formatOdometer = (vehicle) => {
  const numeric = getVehicleOdometerValue(vehicle);
  if (numeric == null) return "-";
  return numeric.toLocaleString("en-GB");
};

const getInsuredUntil = (vehicle) =>
  vehicle?.insuredUntil || vehicle?.insuranceExpiry || vehicle?.insuranceExpiryDate || vehicle?.insuranceUntil || "";

const getTaxedUntil = (vehicle) => vehicle?.nextRFL || "";

const getInsuranceStatus = (vehicle) => {
  const status = String(vehicle?.insuranceStatus || "").trim() || "Insured";
  const expiry = safeDate(getInsuredUntil(vehicle));
  if (expiry && daysUntil(expiry) < 0) return "Not Insured";
  return status;
};

const isInsuranceExpired = (vehicle) => {
  const expiry = safeDate(getInsuredUntil(vehicle));
  return Boolean(expiry && daysUntil(expiry) < 0);
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
  const [insuranceDatePrompt, setInsuranceDatePrompt] = useState(null);
  const [taxDatePrompt, setTaxDatePrompt] = useState(null);

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const fetchVehicles = async () => {
    const snapshot = await getDocs(collection(db, "vehicles"));
    const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const normalisedList = list.map((vehicle) =>
      isInsuranceExpired(vehicle) && vehicle.insuranceStatus !== "Not Insured"
        ? { ...vehicle, insuranceStatus: "Not Insured" }
        : vehicle
    );
    setVehicles(normalisedList);

    const expiredInsuranceUpdates = list.filter(
      (vehicle) => isInsuranceExpired(vehicle) && vehicle.insuranceStatus !== "Not Insured"
    );
    if (expiredInsuranceUpdates.length) {
      Promise.allSettled(
        expiredInsuranceUpdates.map((vehicle) =>
          updateDoc(doc(db, "vehicles", vehicle.id), { insuranceStatus: "Not Insured" })
        )
      ).catch((err) => console.error("Failed to sync expired insurance statuses:", err));
    }

    const categories = Array.from(new Set(normalisedList.map((v) => v.category).filter(Boolean))).sort(categorySort);
    const initialExpanded = {};
    categories.forEach((cat) => (initialExpanded[cat] = true));
    setExpandedCategories((prev) => (Object.keys(prev).length ? prev : initialExpanded));
  };

  useEffect(() => {
    fetchVehicles().catch((err) => console.error("Failed to fetch vehicles:", err));
  }, []);

  // Persist dropdown changes
  const handleSelectChange = async (id, field, value, extraUpdates = {}) => {
    const key = `${id}:${field}`;
    setSavingKey(key);

    const updates = { [field]: value, ...extraUpdates };
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, ...updates } : v)));
    try {
      await updateDoc(doc(db, "vehicles", id), updates);
    } catch (err) {
      console.error("Failed to update vehicle:", err);
      alert("Could not save. Please try again.");
      // rollback not attempted (optional)
    } finally {
      setSavingKey(null);
    }
  };

  const handleInsuranceStatusChange = async (vehicle, value) => {
    if (!vehicle?.id) return;

    if (value !== "Insured") {
      await handleSelectChange(vehicle.id, "insuranceStatus", value);
      return;
    }

    setInsuranceDatePrompt({
      vehicle,
      date: getInsuredUntil(vehicle),
    });
  };

  const saveInsuranceDatePrompt = async () => {
    const vehicle = insuranceDatePrompt?.vehicle;
    const insuredUntil = String(insuranceDatePrompt?.date || "").trim();

    if (!vehicle?.id) {
      setInsuranceDatePrompt(null);
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(insuredUntil) || !safeDate(insuredUntil)) {
      alert("Select an insured until date before marking this vehicle as insured.");
      return;
    }

    setInsuranceDatePrompt(null);
    await handleSelectChange(vehicle.id, "insuranceStatus", "Insured", {
      insuredUntil,
      insuranceExpiry: insuredUntil,
      insuranceExpiryDate: insuredUntil,
    });
  };

  const handleTaxStatusChange = async (vehicle, value) => {
    if (!vehicle?.id) return;

    if (value !== "Taxed") {
      await handleSelectChange(vehicle.id, "taxStatus", value, { nextRFL: "" });
      return;
    }

    setTaxDatePrompt({
      vehicle,
      date: getTaxedUntil(vehicle),
    });
  };

  const saveTaxDatePrompt = async () => {
    const vehicle = taxDatePrompt?.vehicle;
    const taxedUntil = String(taxDatePrompt?.date || "").trim();

    if (!vehicle?.id) {
      setTaxDatePrompt(null);
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(taxedUntil) || !safeDate(taxedUntil)) {
      alert("Select a road tax date before marking this vehicle as taxed.");
      return;
    }

    setTaxDatePrompt(null);
    await handleSelectChange(vehicle.id, "taxStatus", "Taxed", {
      nextRFL: taxedUntil,
    });
  };

  // Category list for filter UI
  const categories = useMemo(() => {
    return Array.from(new Set([...vehicles.map((v) => v.category).filter(Boolean), RETENTION_PLATE_CATEGORY])).sort(categorySort);
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
          v.retentionExpiry,
          getInsuredUntil(v),
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
        list.sort((a, b) => (getVehicleOdometerValue(b) || 0) - (getVehicleOdometerValue(a) || 0));
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
      "nextTacho",
      "nextBrakeTest",
      "nextPMI",
      "nextTachoDownload",
    ];

    for (const v of filteredVehicles) {
      const insuredUntil = safeDate(getInsuredUntil(v));
      if (insuredUntil) {
        const diff = daysUntil(insuredUntil);
        if (diff < 0) overdue++;
        else if (diff <= 7) soon++;
      }

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
          box-shadow: 0 0 0 4px rgba(31,75,122,0.14);
          border-color: #9fb7cf !important;
        }
        .vehicles-action:hover { transform: translateY(-1px); box-shadow: ${UI.shadowHover} !important; }
        .vehicles-filter-grid {
          display: grid;
          grid-template-columns: minmax(280px, 1.2fr) 210px 220px auto;
          gap: 3px;
          align-items: end;
        }
        .vh-sticky thead th { position: sticky; top: 0; z-index: 5; }
        .vh-sticky .catRow { position: sticky; top: 29px; z-index: 4; }
        .vehicleDataRow td:nth-child(2) {
          width: 168px;
          max-width: 168px;
          font-weight: 400 !important;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vehicleDataRow:hover td { background: rgba(31,75,122,0.04); }
        @media (max-width: 1120px) {
          .vehicles-filter-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 720px) {
          .vehicles-filter-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Vehicle Maintenance Overview</h1>
          </div>

          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="vehicles-action" onClick={() => router.push("/vehicle-home")} style={btn("ghost")}>
              <ArrowLeft size={15} />
              Back
            </button>
            <button type="button" className="vehicles-action" onClick={() => router.push("/add-vehicle")} style={btn()}>
              <Plus size={15} />
              Add Vehicle
            </button>
            <button type="button" className="vehicles-action" onClick={() => router.push("/add-vehicle?type=number-plate")} style={btn("ghost")}>
              <FilePlus2 size={15} />
              Add Retention Plate
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ ...card, padding: 6, marginBottom: UI.gap }}>
          <div className="vehicles-filter-grid">
            <div style={{ position: "relative" }}>
              <div style={smallLabel}>Search</div>
              <Search size={14} style={{ position: "absolute", left: 9, bottom: 8, color: UI.muted }} />
              <input
                type="text"
                placeholder="Search by name, reg, manufacturer, model..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...input, paddingLeft: 28 }}
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
                <option value="mileage">Odometer (highest)</option>
                <option value="az">Vehicle (A-Z)</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <span style={chip("#fff", UI.text)}>{kpis.count} vehicles</span>
              <span style={chip("#fff7ed", "#9a3412")}>Due soon: {kpis.soon}</span>
              <span style={chip("#fef2f2", "#991b1b")}>Overdue: {kpis.overdue}</span>

              <button
                type="button"
                className="vehicles-action"
                style={btn("ghost")}
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("All");
                  setSort("none");
                }}
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
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
            {importing ? <span style={{ fontSize: 12, color: UI.muted }}>Importing...</span> : null}
          </div>
        </div>

        {/* Table */}
        <div style={{ ...card, overflow: "hidden", marginLeft: -18, marginRight: -18, borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
          <div style={{ overflowX: "auto" }}>
            <div className="vh-sticky">
              <table style={{ width: "100%", minWidth: 1420, borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {[
                      "Registration",
                      "Vehicle",
                      "Manufacturer",
                      "Model",
                      "Tax Status",
                      "Tax Date",
                      "Insurance Status",
                      "Insured Until",
                      "MOT",
                      "Service",
                      "PMI",
                      "Brake Test",
                      "Tacho Insp.",
                      "Tacho DL",
                      "Odometer",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "5px 10px",
                          background: UI.brand,
                          color: "#fff",
                          borderBottom: "1px solid #183d64",
                          whiteSpace: "nowrap",
                          textAlign: "left",
                          fontWeight: 900,
                          fontSize: 11.5,
                          letterSpacing: 0,
                          ...(h === "Vehicle" ? { width: 168, maxWidth: 168 } : {}),
                          ...(h === "Model" ? { width: 150, maxWidth: 150 } : {}),
                          ...(h === "Tax Date" ? { width: 118 } : {}),
                          ...(h === "Insurance Status" ? { width: 118 } : {}),
                          ...(h === "Insured Until" ? { width: 118 } : {}),
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                {Object.entries(groupedByCategory).sort(([a], [b]) => categorySort(a, b)).map(([category, list]) => (
                  <tbody key={category}>
                    <tr
                      onClick={() => toggleCategory(category)}
                      className="catRow"
                      style={{
                        background: "#edf3f8",
                        cursor: "pointer",
                        borderTop: UI.border,
                        borderBottom: UI.border,
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
                        {expandedCategories[category] ? "v" : ">"} {category}{" "}
                        <span style={{ color: UI.muted, fontWeight: 800 }}>({list.length})</span>
                      </td>
                    </tr>

                    {expandedCategories[category] &&
                      list.map((v, i) => {
                        const zebra = i % 2 === 0 ? "#ffffff" : "#f8fafc";
                        const retentionPlate = isRetentionPlate(v);
                        const reg = v.registration || v.reg || "-";

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
                        const insuranceStatus = getInsuranceStatus(v);

                        return (
                          <tr
                            key={v.id}
                            className="vehicleDataRow"
                            title={retentionPlate ? "Number plate on retention" : "Vehicle"}
                            onClick={() => router.push(`/vehicle-edit/${v.id}`)}
                            style={{ background: zebra, cursor: "pointer" }}
                          >
                            <td style={regCell}>{reg}</td>
                            <td style={vehicleNameCell}>{v.name || "-"}</td>
                            <td style={rowTd}>{v.manufacturer || "-"}</td>
                            <td style={modelCell}>{v.model || "-"}</td>

                            {/* Tax Status */}
                            <td style={taxCell} onClick={(e) => e.stopPropagation()}>
                              <select
                                style={miniSelect}
                                value={v.taxStatus || "Taxed"}
                                onChange={(e) => handleTaxStatusChange(v, e.target.value)}
                                disabled={savingKey === `${v.id}:taxStatus`}
                              >
                                <option value="Taxed">Taxed</option>
                                <option value="Sorn">Sorn</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </td>

                            {renderDateCell(v.nextRFL, rowTd)}

                            {/* Insurance Status */}
                            <td style={insuranceCell} onClick={(e) => e.stopPropagation()}>
                              <select
                                style={{
                                  ...miniSelect,
                                  ...(insuranceStatus === "Not Insured" ? { color: UI.red, fontWeight: 900 } : {}),
                                }}
                                value={insuranceStatus}
                                onChange={(e) => handleInsuranceStatusChange(v, e.target.value)}
                                disabled={savingKey === `${v.id}:insuranceStatus`}
                              >
                                <option value="Insured">Insured</option>
                                <option value="Not Insured">Not Insured</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </td>

                            {/* Dates with colour-coded status */}
                            {renderDateCell(getInsuredUntil(v), rowTd, { soonDays: 7 })}
                            {renderDateCell(v.nextMOT, rowTd)}
                            {renderDateCell(retentionPlate ? v.retentionExpiry : v.nextService, rowTd, {
                              soonDays: retentionPlate ? (isTradePlate(v) ? 31 : 365) : 21,
                            })}
                            {renderDateCell(v.nextPMI, rowTd)}
                            {renderDateCell(v.nextBrakeTest, rowTd)}
                            {renderDateCell(v.nextTacho, rowTd)}
                            {renderDateCell(v.nextTachoDownload, rowTd)}
                            <td style={rowTd}>{formatOdometer(v)}</td>
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
          insurance = due within 7 days, <span style={{ color: UI.red, fontWeight: 900 }}>red</span> = overdue.
        </div>

        {insuranceDatePrompt ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "rgba(15,23,42,0.42)",
            }}
            onClick={() => setInsuranceDatePrompt(null)}
          >
            <div
              style={{
                ...card,
                width: "min(420px, 100%)",
                padding: 16,
                boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: UI.text }}>Set insured until date</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: UI.muted }}>
                  {insuranceDatePrompt.vehicle?.name || insuranceDatePrompt.vehicle?.registration || "Vehicle"}
                </div>
              </div>

              <label style={smallLabel}>Insured Until</label>
              <input
                type="date"
                value={insuranceDatePrompt.date || ""}
                onChange={(e) =>
                  setInsuranceDatePrompt((prev) => (prev ? { ...prev, date: e.target.value } : prev))
                }
                style={input}
                autoFocus
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button type="button" className="vehicles-action" style={btn("ghost")} onClick={() => setInsuranceDatePrompt(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="vehicles-action"
                  style={btn()}
                  onClick={saveInsuranceDatePrompt}
                  disabled={savingKey === `${insuranceDatePrompt.vehicle?.id}:insuranceStatus`}
                >
                  Save insured
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {taxDatePrompt ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "rgba(15,23,42,0.42)",
            }}
            onClick={() => setTaxDatePrompt(null)}
          >
            <div
              style={{
                ...card,
                width: "min(420px, 100%)",
                padding: 16,
                boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: UI.text }}>Set road tax date</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: UI.muted }}>
                  {taxDatePrompt.vehicle?.name || taxDatePrompt.vehicle?.registration || "Vehicle"}
                </div>
              </div>

              <label style={smallLabel}>Taxed Until</label>
              <input
                type="date"
                value={taxDatePrompt.date || ""}
                onChange={(e) =>
                  setTaxDatePrompt((prev) => (prev ? { ...prev, date: e.target.value } : prev))
                }
                style={input}
                autoFocus
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button type="button" className="vehicles-action" style={btn("ghost")} onClick={() => setTaxDatePrompt(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="vehicles-action"
                  style={btn()}
                  onClick={saveTaxDatePrompt}
                  disabled={savingKey === `${taxDatePrompt.vehicle?.id}:taxStatus`}
                >
                  Save taxed
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </HeaderSidebarLayout>
  );
}

/* CSV import */
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
            const registration = vehicle.registration || vehicle.reg || vehicle.registrationNumber || "";
            const manufacturer = vehicle.manufacturer || vehicle.make || "";
            const odometer = Number(vehicle.odometer || vehicle.serviceOdometer || vehicle.mileage || 0);
            const nextService = vehicle.nextService || vehicle.nextServiceDate || vehicle.serviceDueDate || "";
            const lastMot = vehicle.lastMOT || vehicle.lastMot || "";
            const nextMot = vehicle.nextMOT || vehicle.nextMot || vehicle.nextMotDate || vehicle.motDueDate || "";
            const insuredUntil = vehicle.insuredUntil || vehicle.insuranceExpiry || vehicle.insuranceExpiryDate || vehicle.insuranceUntil || "";

            await addDoc(collection(db, "vehicles"), {
              name: vehicle.name,
              category: vehicle.category,
              registration,
              reg: registration,
              registrationNumber: registration,
              manufacturer,
              make: manufacturer,
              model: vehicle.model || "",
              mileage: odometer,
              odometer,
              serviceOdometer: odometer,
              lastService: vehicle.lastService || "",
              nextService,
              nextServiceDate: nextService,
              serviceDueDate: nextService,
              lastMOT: lastMot,
              lastMot,
              nextMOT: nextMot,
              nextMot,
              nextMotDate: nextMot,
              motDueDate: nextMot,
              insuredUntil,
              insuranceExpiry: insuredUntil,
              insuranceExpiryDate: insuredUntil,
              insuranceStatus: vehicle.insuranceStatus || (safeDate(insuredUntil) && daysUntil(safeDate(insuredUntil)) < 0 ? "Not Insured" : "Insured"),
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

/* Small helpers */
function renderDateCell(raw, baseStyle, options) {
  const { text, style } = formatDateWithStyle(raw, options);
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
