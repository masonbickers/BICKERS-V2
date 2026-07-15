"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";


export default function StatisticsPage() {
  const [bookings, setBookings] = useState([]);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "bookings"));
      const data = snap.docs.map(doc => doc.data());
      setBookings(data);
    };
    load();
  }, []);

  const totalBookings = bookings.length;
  const totalEmployees = new Set(bookings.flatMap(b => b.employees || [])).size;
  const totalVehicles = new Set(bookings.flatMap(b => b.vehicles || [])).size;
  const totalClients = new Set(bookings.map(b => b.client)).size;

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", fontFamily: "Arial, sans-serif", color: "#111" }}>
      {/* Sidebar */}


      {/* Main Content */}
      <main style={{ flex: 1, padding: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
          <h1 style={{ fontSize: 28 }}>📊 Booking Statistics Dashboard</h1>
          <button onClick={() => router.push("/dashboard")} style={buttonStyle}>← Return to Dashboard</button>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px"
        }}>
          <div style={statCardStyle} onClick={() => router.push("/statistics/bookings")}>
            <h3>Total Bookings</h3>
            <p>{totalBookings}</p>
          </div>

          <div style={statCardStyle} onClick={() => router.push("/statistics/employees")}>
            <h3>Employee Days</h3>
            <p>{totalEmployees}</p>
          </div>

          <div style={statCardStyle} onClick={() => router.push("/statistics/vehicles")}>
            <h3>Vehicle Days</h3>
            <p>{totalVehicles}</p>
          </div>

          <div style={statCardStyle} onClick={() => router.push("/statistics/clients")}>
            <h3>Clients</h3>
            <p>{totalClients}</p>
          </div>

          <div style={{ ...statCardStyle, background: "#eeeeee", color: "#666", cursor: "default" }}>
            <h3>🛠️ Coming Soon</h3>
            <p>Monthly breakdowns and trends</p>
          </div>
        </div>
      </main>
    </div>
  );
}

const statCardStyle = {
  background: "#fff",
  borderRadius: "10px",
  padding: "20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  textAlign: "center",
  cursor: "pointer",
  transition: "transform 0.2s ease-in-out"
};

const buttonStyle = {
  padding: "10px 16px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer"
};

const navButton = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid #333"
};
