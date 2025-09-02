"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, addDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import Papa from "papaparse";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function VehicleMaintenancePage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState("none");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [expandedCategories, setExpandedCategories] = useState({});
  const [search, setSearch] = useState(""); // 🔎 Search

  // Toggle expand/collapse for a category
  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const formatDateWithStyle = (iso) => {
    if (!iso) return { text: "", style: {} };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { text: "", style: {} };

    const now = new Date();
    const diffInDays = (d - now) / (1000 * 60 * 60 * 24);

    let style = {};
    if (diffInDays < 0) {
      style = { color: "red", fontWeight: "bold" }; // overdue
    } else if (diffInDays <= 21) {
      style = { color: "orange", fontWeight: "bold" }; // due soon
    }

    const text = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

    return { text, style };
  };

  // Handle dropdown changes for midStatus and insuranceStatus
  const handleSelectChange = async (id, field, value) => {
    setVehicles((prev) =>
      prev.map((vehicle) =>
        vehicle.id === id ? { ...vehicle, [field]: value } : vehicle
      )
    );
    try {
      const ref = doc(db, "vehicles", id);
      await updateDoc(ref, { [field]: value });
    } catch (err) {
      console.error("Failed to update vehicle:", err);
    }
  };

  // Fetch vehicles from Firestore
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const snapshot = await getDocs(collection(db, "vehicles"));
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setVehicles(list);

        const categories = Array.from(new Set(list.map((v) => v.category)))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        const initialExpanded = {};
        categories.forEach((cat) => {
          initialExpanded[cat] = true;
        });
        setExpandedCategories(initialExpanded);
      } catch (err) {
        console.error("Failed to fetch vehicles:", err);
      }
    };
    fetchVehicles();
  }, []);

  // Apply search + sorting + category filters
  const applyFilter = (list) => {
    let filtered = [...list];

    // 🔎 Search filter
    if (search.trim() !== "") {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          (v.name && v.name.toLowerCase().includes(query)) ||
          (v.registration && v.registration.toLowerCase().includes(query)) ||
          (v.manufacturer && v.manufacturer.toLowerCase().includes(query)) ||
          (v.model && v.model.toLowerCase().includes(query))
      );
    }

    if (categoryFilter !== "All") {
      filtered = filtered.filter((v) => v.category === categoryFilter);
    }

    switch (filter) {
      case "service":
        return filtered.sort(
          (a, b) => new Date(a.nextService) - new Date(b.nextService)
        );
      case "mot":
        return filtered.sort(
          (a, b) => new Date(a.nextMOT) - new Date(b.nextMOT)
        );
      case "mileage":
        return filtered.sort((a, b) => b.mileage - a.mileage);
      case "az":
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return filtered;
    }
  };

  const filteredVehicles = applyFilter(vehicles);

  // Group by vehicle.category
  const groupedByCategory = filteredVehicles.reduce((acc, v) => {
    if (!acc[v.category]) acc[v.category] = [];
    acc[v.category].push(v);
    return acc;
  }, {});

  Object.keys(groupedByCategory).forEach((category) => {
    groupedByCategory[category].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  });

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          backgroundColor: "#f4f4f5",
          fontFamily: "Arial, sans-serif",
          color: "#333",
        }}
      >
        <main style={{ flex: 1, padding: 30 }}>
          <button onClick={() => router.push("/vehicle-home")} style={backButton}>
            ← Back
          </button>

          <h1 style={header}>Vehicle Maintenance Overview</h1>

          {/* 🔎 Search Input */}
          <div style={{ marginBottom: 20 }}>
            <input
              type="text"
              placeholder="Search by name, reg, manufacturer, model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInput}
            />
          </div>

          {/* Scrollable table with one sticky header */}
          <div style={tableScrollContainer}>
            <table style={tableStyle}>
              <thead style={theadStyle}>
                <tr>
                  <th style={thStyle}>Vehicle</th>
                  <th style={thStyle}>Manufacturer</th>
                  <th style={thStyle}>Model</th>
                  <th style={thStyle}>Registration</th>
                  <th style={thStyle}>Tax Status</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Inspection</th>
                  <th style={thStyle}>Due MOT</th>
                  <th style={thStyle}>Road Tax</th>
                  <th style={thStyle}>Due Service</th>
                  <th style={thStyle}>Service Odo</th>
                  <th style={thStyle}>Tacho Inspection</th>
                  <th style={thStyle}>Brake Test</th>
                  <th style={thStyle}>PMI</th>
                  <th style={thStyle}>Tacho Download</th>
                  <th style={thStyle}>Tail-lift</th>
                  <th style={thStyle}>LOLER</th>
                </tr>
              </thead>

              {Object.entries(groupedByCategory).map(([category, list]) => (
                <tbody key={category}>
                  <tr
                    onClick={() => toggleCategory(category)}
                    style={categoryHeader}
                  >
                    <td colSpan={11} style={{ padding: "6px 10px" }}>
                      {expandedCategories[category] ? "▼" : "▶"} {category} (Count:{" "}
                      {list.length})
                    </td>
                  </tr>
                  {expandedCategories[category] &&
                    list.map((v, i) => (
                      <tr
                        key={v.id}
                        onClick={() => router.push(`/vehicle-edit/${v.id}`)}
                        style={{
                          backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9",
                          cursor: "pointer",
                        }}
                      >
                        <td style={tdStyle}>{v.name}</td>
                        <td style={tdStyle}>{v.manufacturer}</td>
                        <td style={tdStyle}>{v.model}</td>
                        <td style={tdStyle}>{v.registration}</td>
                        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                          <select
                            style={inputStyle}
                            value={v.taxStatus || ""}
                            onChange={(e) =>
                              handleSelectChange(v.id, "taxStatus", e.target.value)
                            }
                          >
                            <option value="Taxed">Taxed</option>
                            <option value="Sorn">Sorn</option>
                          </select>
                        </td>
                        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                          <select
                            style={inputStyle}
                            value={v.insuranceStatus || ""}
                            onChange={(e) =>
                              handleSelectChange(v.id, "insuranceStatus", e.target.value)
                            }
                          >
                            <option value="Insured">Insured</option>
                            <option value="Not Insured">Not Insured</option>
                            <option value="N/A">N/A</option>
                          </select>
                        </td>
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.inspectionDate);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextMOT);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextRFL);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextService);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        <td style={tdStyle}>{v.serviceOdometer}</td>
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextTachoInspection);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextBrakeTest);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextPMIInspection);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextTachoDownload);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextTailLiftInspection);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                        {(() => {
                          const { text, style } = formatDateWithStyle(v.nextLOLERInspection);
                          return <td style={{ ...tdStyle, ...style }}>{text}</td>;
                        })()}
                      </tr>
                    ))}
                </tbody>
              ))}
            </table>
          </div>

          <div style={{ marginTop: 10, textAlign: "right" }}>
            <button
              style={addButton}
              onClick={() => router.push("/add-vehicle")}
            >
              + Add Vehicle
            </button>
          </div>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

function VehicleCSVImport({ onImportComplete }) {
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        for (const vehicle of results.data) {
          if (!vehicle.name || !vehicle.category) continue;
          try {
            await addDoc(collection(db, "vehicles"), {
              name: vehicle.name,
              category: vehicle.category,
              registration: vehicle.registration,
              mileage: Number(vehicle.mileage || 0),
              lastService: vehicle.lastService || "",
              nextService: vehicle.nextService || "",
              lastMOT: vehicle.lastMOT || "",
              nextMOT: vehicle.nextMOT || "",
              notes: vehicle.notes || "",
            });
          } catch (err) {
            console.error("❌ Error importing vehicle:", err);
          }
        }
        alert("✅ Vehicle data imported successfully!");
        onImportComplete();
      },
    });
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ marginRight: 10 }}>Import CSV:</label>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
    </div>
  );
}

// Styles
const header = { fontSize: 28, fontWeight: "bold", marginBottom: 20 };
const backButton = {
  marginBottom: 20,
  padding: "8px 16px",
  border: "none",
  borderRadius: 4,
  backgroundColor: "#555",
  color: "#fff",
  cursor: "pointer",
};
const categoryHeader = {
  backgroundColor: "#f0f0f0",
  cursor: "pointer",
  fontWeight: "bold",
};
const tableScrollContainer = {
  overflowY: "auto",
  position: "relative",
};
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: "12px" };
const theadStyle = {
  position: "sticky",
  top: 0,
  backgroundColor: "#1976d2",
  color: "#fff",
  zIndex: 1,
};
const thStyle = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  padding: "4px 6px",
  backgroundColor: "#333333",
  color: "#fff",
  border: "1px solid #ccc",
  textAlign: "left",
  whiteSpace: "nowrap",
};
const tdStyle = {
  padding: "6px 8px",
  border: "1px solid #e0e0e0",
  textAlign: "left",
  verticalAlign: "middle",
};
const addButton = {
  padding: "8px 16px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};
const inputStyle = {
  padding: "6px 8px",
  border: "1px solid #ccc",
  borderRadius: "4px",
  width: "100%",
  backgroundColor: "#fff",
  color: "#000",
  fontSize: "8px",
};
const searchInput = {
  padding: "8px 12px",
  width: "100%",
  maxWidth: "400px",
  borderRadius: "4px",
  border: "1px solid #ccc",
  fontSize: "14px",
};
