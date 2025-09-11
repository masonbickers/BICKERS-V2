"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

export default function HRPage() {
  const router = useRouter();
  const [requestedHolidays, setRequestedHolidays] = useState([]);

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      const snap = await getDocs(collection(db, "holidays"));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const pending = all.filter((h) => !h.status || h.status === "requested");
      setRequestedHolidays(pending);
    } catch (err) {
      console.error("Error fetching holidays:", err);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const ref = doc(db, "holidays", id);
      await updateDoc(ref, { status });
      alert(`Holiday ${status}`);
      fetchHolidays(); // refresh
    } catch (err) {
      console.error("Error updating status:", err);
      alert("❌ Error updating holiday status");
    }
  };

  const documents = [
    {
      title: "Holiday Request Form",
      description: "Submit and track time off requests.",
      link: "/holiday-form",
    },
    {
      title: "View Holiday Usage",
      description: "Check how much holiday each employee has used.",
      link: "/holiday-usage",
    },
    {
      title: "Timesheets",
      description: "View, submit, and track weekly timesheets.",
      link: "/timesheets", // ✅ adjust to match your timesheet overview route
    },
    {
      title: "Sick Leave Form",
      description: "Report absences due to illness.",
      link: "/sick-leave",
    },
    {
      title: "HR Policy Manual",
      description: "View company policies and employee handbook.",
      link: "/hr-policies",
    },
    {
      title: "Contract Upload",
      description: "Upload new starter contracts and documentation.",
      link: "/upload-contract",
    },
  ];

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          backgroundColor: "#f4f4f5",
          color: "#333",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <main style={{ flex: 1, padding: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
            HR Resources
          </h1>

          {/* 📌 Requested Holidays Section */}
          <div
            style={{
              backgroundColor: "#fff",
              padding: 20,
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
              Requested Holidays
            </h2>
            {requestedHolidays.length === 0 ? (
              <p style={{ color: "#666" }}>No pending holiday requests.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Employee</th>
                    <th style={th}>From</th>
                    <th style={th}>To</th>
                    <th style={th}>Type</th>
                    <th style={th}>Notes</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requestedHolidays.map((h) => (
                    <tr key={h.id}>
                      <td style={td}>{h.employee || h.employeeCode}</td>
                      <td style={td}>{h.startDate}</td>
                      <td style={td}>{h.endDate}</td>
                      <td style={td}>{h.leaveType || "Other"}</td>
                      <td style={td}>{h.notes || "-"}</td>
                      <td style={td}>
                        <button
                          style={{ ...btn, backgroundColor: "#22c55e" }}
                          onClick={() => updateStatus(h.id, "approved")}
                        >
                          ✅ Approve
                        </button>
                        <button
                          style={{ ...btn, backgroundColor: "#dc2626" }}
                          onClick={() => updateStatus(h.id, "declined")}
                        >
                          ❌ Decline
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* HR Docs Section */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {documents.map((doc, idx) => (
              <div
                key={idx}
                style={cardStyle}
                onClick={() => router.push(doc.link)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.transform = "translateY(-4px)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.transform = "translateY(0)")
                }
              >
                <h2 style={{ marginBottom: 10 }}>{doc.title}</h2>
                <p>{doc.description}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

const th = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "2px solid #ddd",
  fontWeight: "bold",
};
const td = { padding: "10px", borderBottom: "1px solid #eee" };

const btn = {
  border: "none",
  color: "#fff",
  padding: "6px 10px",
  borderRadius: 6,
  marginRight: 6,
  cursor: "pointer",
};

const cardStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  cursor: "pointer",
  transition: "transform 0.2s ease",
};
