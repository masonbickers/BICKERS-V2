"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function EquipmentPage() {
  const router = useRouter();
  const [equipmentList, setEquipmentList] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const snapshot = await getDocs(collection(db, "equipment"));
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setEquipmentList(list);

        const categories = Array.from(new Set(list.map((e) => e.category))).filter(Boolean);
        const initialExpanded = {};
        categories.forEach((cat) => {
          initialExpanded[cat] = true;
        });
        setExpandedCategories(initialExpanded);
      } catch (err) {
        console.error("Failed to fetch equipment:", err);
      }
    };

    fetchEquipment();
  }, []);

  const groupedByCategory = equipmentList.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  Object.keys(groupedByCategory).forEach((category) => {
    groupedByCategory[category].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  });

  return (
    <HeaderSidebarLayout>
      <div style={containerStyle}>
      <main style={{ flex: 1, padding: 30 }}>
  <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
    <button style={backButton} onClick={() => router.back()}>
      ← Back
    </button>
    <h1 style={{ ...header, marginLeft: 10 }}>Equipment Overview</h1>
  </div>


          <div style={tableScrollContainer}>
            <table style={tableStyle}>
              <thead style={theadStyle}>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Serial</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Next Inspection</th>
                  <th style={thStyle}>Notes</th>
                  <th style={thStyle}>Asset No.</th>
                </tr>
              </thead>

              {Object.entries(groupedByCategory).map(([category, list]) => (
                <tbody key={category}>
                  <tr onClick={() => toggleCategory(category)} style={categoryHeader}>
                    <td colSpan={6} style={{ padding: "6px 10px" }}>
                      {expandedCategories[category] ? "▼" : "▶"} {category} (Count: {list.length})
                    </td>
                  </tr>
                  {expandedCategories[category] &&
                    list.map((e, i) => (
                      <tr
                        key={e.id}
                        onClick={() => router.push(`/edit-equipment/${e.id}`)}
                        style={{
                          backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9",
                          cursor: "pointer",
                        }}
                      >
                        <td style={tdStyle}>{e.name}</td>
                        <td style={tdStyle}>{e.serialNumber}</td>
                        <td style={tdStyle}>{e.status}</td>
                        <td style={tdStyle}>{e.nextInspection || "—"}</td>
                        <td style={tdStyle}>{e.notes}</td>
                        <td style={tdStyle}>{e.asset || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              ))}
            </table>
          </div>

          <div style={{ marginTop: 10, textAlign: "right" }}>
            <button style={addButton} onClick={() => router.push("/add-equipment")}>
              + Add Equipment
            </button>
          </div>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

// Styles
const containerStyle = {
  display: "flex",
  minHeight: "100vh",
  backgroundColor: "#f4f4f5",
  fontFamily: "Arial, sans-serif",
  color: "#333",
};

const header = { fontSize: 28, fontWeight: "bold", marginBottom: 20 };
const tableScrollContainer = { overflowY: "auto", position: "relative" };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: "14px" };
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
const categoryHeader = {
  backgroundColor: "#f0f0f0",
  cursor: "pointer",
  fontWeight: "bold",
};
const addButton = {
  padding: "8px 16px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const backButton = {
  padding: "6px 12px",
  backgroundColor: "#e0e0e0",
  color: "#333",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "12px",
};

