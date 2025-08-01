"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function MOTOverviewPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    const fetchVehicles = async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      const today = new Date();

      const data = snapshot.docs.map((doc) => {
        const vehicle = doc.data();
        // parse nextMOT (could be a Firestore Timestamp or ISO string)
        const nextMOT = vehicle.nextMOT?.toDate?.() || new Date(vehicle.nextMOT);
        const diffDays = Math.floor((nextMOT - today) / (1000 * 60 * 60 * 24));

        return {
          ...vehicle,
          id: doc.id,
          nextMOTDate: nextMOT.toLocaleDateString(),
          daysUntilMOT: diffDays,
          status: diffDays < 0 ? "overdue" : diffDays <= 21 ? "soon" : "ok",
        };
      });

      setVehicles(data);
    };

    fetchVehicles();
  }, []);

  const getRowStyle = (status) => {
    switch (status) {
      case "overdue":
        return { backgroundColor: "#ffcccc" };
      case "soon":
        return { backgroundColor: "#fff3cd" };
      default:
        return {};
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5" }}>
        <main style={{ flex: 1, padding: 40, color: "#333" }}>
          <button
            onClick={() => router.back()}
            style={{
              marginBottom: 20,
              padding: "8px 16px",
              backgroundColor: "#000",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ← Back
          </button>

          <div style={cardStyle}>
            <h1 style={cardHeaderStyle}>MOT Overview</h1>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                backgroundColor: "#fff",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#e0e0e0" }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Reg</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Days Until MOT Due</th>
                  <th style={thStyle}>Next MOT</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} style={getRowStyle(v.status)}>
                    <td style={tdStyle}>{v.name}</td>
                    <td style={tdStyle}>{v.reg}</td>
                    <td style={tdStyle}>{v.category}</td>
                    <td style={tdStyle}>{v.daysUntilMOT}</td>
                    <td style={tdStyle}>{v.nextMOTDate}</td>
                    <td style={tdStyle}>
                      {v.status === "overdue"
                        ? "❌ Overdue"
                        : v.status === "soon"
                        ? "⚠️ Due Soon"
                        : "✅ OK"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

const cardStyle = {
  backgroundColor: "#f9f9f9",
  padding: 20,
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  marginBottom: 20,
};

const cardHeaderStyle = {
  marginBottom: 10,
  color: "#111",
};

const thStyle = {
  padding: 12,
  textAlign: "left",
  fontWeight: "bold",
  borderBottom: "1px solid #ccc",
};

const tdStyle = {
  padding: 12,
  borderBottom: "1px solid #eee",
};
