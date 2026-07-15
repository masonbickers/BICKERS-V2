"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const getOdometerValue = (vehicle) => {
  const candidates = [vehicle?.odometer, vehicle?.serviceOdometer, vehicle?.mileage];
  for (const candidate of candidates) {
    const numeric = Number(String(candidate ?? "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
};

export default function LorryDashboardPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [lorries, setLorries] = useState([]);
  const [filter, setFilter] = useState("none");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "lorries", operation: "load lorries" });
      setLorries([]);
      return;
    }

    const fetchLorries = async () => {
      const snapshot = await getDocs(tenantCollectionQuery(db, "lorries", dataAccessState));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLorries(data);
    };

    fetchLorries();
  }, [accessKey, dataAccessState]);

  const applyFilter = (list) => {
    switch (filter) {
      case "mot":
        return [...list].sort((a, b) => new Date(a.motDue) - new Date(b.motDue));
      case "service":
        return [...list].sort((a, b) => new Date(a.nextService) - new Date(b.nextService));
      case "mileage":
        return [...list].sort((a, b) => getOdometerValue(b) - getOdometerValue(a));
      case "az":
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  };

  const filteredLorries = applyFilter(lorries);

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--legacy-color-f4f4f5)", fontFamily: "Arial, sans-serif", color: "var(--legacy-color-333)" }}>
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
            backgroundColor: "var(--legacy-color-555)",
            color: "var(--legacy-color-fff)",
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

        <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "var(--legacy-color-fff)", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <thead style={{ backgroundColor: "var(--legacy-color-1976d2)", color: "var(--legacy-color-fff)" }}>
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
              <tr key={lorry.id} style={{ borderBottom: "1px solid var(--legacy-color-ddd)" }}>
                <td style={tdStyle}>{lorry.name}</td>
                <td style={tdStyle}>{lorry.type}</td>
                <td style={tdStyle}>{lorry.registration}</td>
                <td style={tdStyle}>{getOdometerValue(lorry).toLocaleString()} mi</td>
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
  color: "var(--legacy-color-fff)",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid var(--legacy-color-333)",
};

const inputStyle = {
  padding: "8px 12px",
  border: "1px solid var(--legacy-color-ccc)",
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
  backgroundColor: "var(--legacy-color-1976d2)",
  color: "var(--legacy-color-fff)",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const editButton = {
  padding: "6px 12px",
  backgroundColor: "var(--legacy-color-4caf50)",
  color: "var(--legacy-color-fff)",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};
