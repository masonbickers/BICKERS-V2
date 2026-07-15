"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function FinanceDashboard() {
  const [invoiceJobs, setInvoiceJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      const snapshot = await getDocs(collection(db, "invoiceQueue"));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInvoiceJobs(data);
      setLoading(false);
    };

    fetchJobs();
  }, []);

  const totalPending = invoiceJobs.filter(j => j.status === "pending").length;
  const totalReady = invoiceJobs.filter(j => j.status === "ready").length;
  const totalInvoiced = invoiceJobs.filter(j => j.status === "invoiced").length;

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: "40px 24px", backgroundColor: "#fff", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: "30px", color: "#111827" }}>
  Finance Dashboard
</h1>


        {loading ? (
          <p>Loading invoice data...</p>
        ) : (
          <>
            {/* Overview Cards */}
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "30px" }}>
              <div style={cardStyle}>
                <h3 style={cardTitle}>Queued</h3>
                <p style={cardCount}>{totalPending}</p>
              </div>
              <div style={cardStyle}>
                <h3 style={cardTitle}>Ready</h3>
                <p style={cardCount}>{totalReady}</p>
              </div>
              <div style={cardStyle}>
                <h3 style={cardTitle}>Invoiced</h3>
                <p style={cardCount}>{totalInvoiced}</p>
              </div>
            </div>

            {/* Recent Jobs */}
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: "16px", color: "#111827"  }}>Recent Jobs</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f3f4f6" }}>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Location</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoiceJobs.slice(0, 5).map(job => (
                  <tr key={job.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={tdStyle}>{job.client || "—"}</td>
                    <td style={tdStyle}>{job.location || "—"}</td>
                    <td style={tdStyle}>
                      {(job.dates || []).map((d, i) => (
                        <div key={i}>{new Date(d).toLocaleDateString("en-GB")}</div>
                      ))}
                    </td>
                    <td style={tdStyle}>{job.status || "pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}

const cardStyle = {
  flex: "1",
  minWidth: "180px",
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "20px",
  textAlign: "center"
};

const cardTitle = {
  fontSize: 16,
  marginBottom: "6px",
  color: "#4b5563"
};

const cardCount = {
  fontSize: 32,
  fontWeight: "bold",
  color: "#111827"
};

const thStyle = {
  padding: "12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#111827",
  borderBottom: "1px solid #ddd"
};

const tdStyle = {
  padding: "12px",
  color: "#111827"
};
