"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";



import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList
} from "recharts";

export default function EmployeesHomePage() {
  const router = useRouter();
  const [usageData, setUsageData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsageFromBookings = async () => {
      try {
        const snapshot = await getDocs(collection(db, "bookings"));
        const counts = {};
        
        snapshot.forEach(doc => {
          const booking = doc.data();
          const employeeList = booking.employees || [];
          const notesByDate = booking.notesByDate || {};
        
          // Only count days where the note is exactly "On Set"
         // Only count days where the note is exactly "On Set" and is within the last 30 days
const now = new Date();
const thirtyDaysAgo = new Date(now);
thirtyDaysAgo.setDate(now.getDate() - 30);

const onSetDates = Object.entries(notesByDate)
  .filter(([dateStr, note]) => {
    if (note !== "On Set") return false;
    const date = new Date(dateStr);
    return date >= thirtyDaysAgo && date <= now;
  })
  .map(([date]) => date);

        
          onSetDates.forEach(() => {
            employeeList.forEach(name => {
              counts[name] = (counts[name] || 0) + 1;
            });
          });
        });
        
        const chartData = Object.entries(counts).map(([name, count]) => {
          const initials = name
            .split(" ")
            .map(word => word[0].toUpperCase())
            .join("");
        
          return {
            name: initials,
            days: count
          };
        });
        

        setUsageData(chartData);
      } catch (err) {
        console.error("Error fetching bookings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsageFromBookings();
  }, []);

  const employeeSections = [
    { title: "Employee List", description: "View, add or manage all staff and freelancers.", link: "/employees" },
    { title: "Add Employee", description: "Register a new employee or freelancer.", link: "/add-employee" },
    { title: "Holiday Tracker", description: "Monitor and record employee holidays.", link: "/holiday-usage" },
    { title: "Upload Documents", description: "Add employee contracts and certifications.", link: "/upload-contract" }
  ];

  return (
    <HeaderSidebarLayout>
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#333", fontFamily: "Arial, sans-serif" }}>
      <main style={{ flex: 1, padding: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>Employee Dashboard</h1>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {employeeSections.map((section, idx) => (
            <div key={idx} style={cardStyle} onClick={() => router.push(section.link)}>
              <h2 style={{ marginBottom: 10 }}>{section.title}</h2>
              <p>{section.description}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40 }}>
<h2 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10 }}>On Set Days (Last 30 Days)</h2>

          {loading ? (
            <p>Loading usage data...</p>
          ) : usageData.length === 0 ? (
            <p>No booking data found.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={usageData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} tickFormatter={(value) => `${value}`} />
                <Tooltip formatter={(value) => `${value} days`} />
                <Bar dataKey="days" fill="#1976d2" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="days" position="top" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </main>
    </div>
    </HeaderSidebarLayout>
  );
}

const cardStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  cursor: "pointer",
  transition: "transform 0.2s ease"
};
