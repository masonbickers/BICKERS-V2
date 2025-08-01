"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

export default function LorryDashboardPage() {
  const router = useRouter();
  const [lorries, setLorries] = useState([]);
  const [filter, setFilter] = useState("none");

  useEffect(() => {
    const fetchLorries = async () => {
      const snapshot = await getDocs(collection(db, "lorries"));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLorries(data);
    };

    fetchLorries();
  }, []);

  const applyFilter = (list) => {
    switch (filter) {
      case "mot":
        return [...list].sort((a, b) => new Date(a.motDue) - new Date(b.motDue));
      case "service":
        return [...list].sort((a, b) => new Date(a.nextService) - new Date(b.nextService));
      case "mileage":
        return [...list].sort((a, b) => b.mileage - a.mileage);
      case "az":
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  };

  const filteredLorries = applyFilter(lorries);

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", fontFamily: "Arial, sans-serif", color: "#333" }}>
      {/* Sidebar */}


      {/* Main */}
      <main style={{ flex: 1, padding: 40 }}>
        <button
          onClick={() => router.back()}
          style={{
            marginBottom: 20,
            padding: "8px 16px",
            border: "none",
            borderRadius: 4,
            backgroundColor: "#555",
            color: "#fff",
            cursor: "pointer",
            width: "fit-content"
          }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>Lorry Overview</h1>

        <div style={{ marginBottom: 20 }}>
          <label style={{ marginRight: 10 }}>Filter:</label>
          <select onChange={(e) => setFilter(e.target.value)} style={inputStyle}>
            <option value="none">None</option>
            <option value="mot">MOT Due Soon</option>
            <option value="service">Service Due</option>
            <option value="mileage">Mileage High to Low</option>
            <option value="az">A-Z by Name</option>
          </select>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <thead style={{ backgroundColor: "#1976d2", color: "#fff" }}>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Reg</th>
              <th style={thStyle}>Mileage</th>
              <th style={thStyle}>Last Service</th>
              <th style={thStyle}>Next Service</th>
              <th style={thStyle}>MOT Due</th>
              <th style={thStyle}>Tacho Cal Due</th>
              <th style={thStyle}>Driver</th>
              <th style={thStyle}>Notes</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLorries.map(lorry => (
              <tr key={lorry.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={tdStyle}>{lorry.name}</td>
                <td style={tdStyle}>{lorry.type}</td>
                <td style={tdStyle}>{lorry.registration}</td>
                <td style={tdStyle}>{lorry.mileage?.toLocaleString()} mi</td>
                <td style={tdStyle}>{lorry.lastService}</td>
                <td style={tdStyle}>{lorry.nextService}</td>
                <td style={tdStyle}>{lorry.motDue}</td>
                <td style={tdStyle}>{lorry.tachoCalDue}</td>
                <td style={tdStyle}>{lorry.assignedDriver}</td>
                <td style={tdStyle}>{lorry.notes}</td>
                <td style={tdStyle}>
                  <button style={editButton} onClick={() => router.push(`/lorry-info/${lorry.id}`)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 30, textAlign: "right" }}>
          <button style={addButton} onClick={() => router.push("/add-lorry")}>+ Add Lorry</button>
        </div>
      </main>
    </div>
  );
}

// Styles
const navButton = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid #333",
};

const inputStyle = {
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: "4px",
};

const thStyle = {
  padding: 12,
  textAlign: "left",
  fontWeight: "bold",
};

const tdStyle = {
  padding: 12,
  textAlign: "left",
};

const addButton = {
  padding: "10px 20px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const editButton = {
  padding: "6px 12px",
  backgroundColor: "#4caf50",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
