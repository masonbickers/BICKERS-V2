"use client";

import React from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function FinancePage() {
  const router = useRouter();

  const financeLinks = [
    {
      title: "Ready to Invoice",
      description: "View jobs queued for invoicing.",
      link: "/ready-invoice"
    },
    {
      title: "Invoice Tracker",
      description: "Track all sent and paid invoices.",
      link: "/finance-home"
    },
    {
      title: "Create Invoice",
      description: "Manually generate a new invoice.",
      link: "/finance/create"
    },
    {
      title: "Export Finance Data",
      description: "Download reports for accounting.",
      link: "/finance/export"
    },
    {
      title: "Finance Settings",
      description: "Adjust thresholds, VAT, and finance rules.",
      link: "/finance/settings"
    }
  ];

  return (
    <HeaderSidebarLayout>
      <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#333", fontFamily: "Arial, sans-serif" }}>
        <main style={{ flex: 1, padding: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>Finance Dashboard</h1>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {financeLinks.map((item, idx) => (
              <div key={idx} style={cardStyle} onClick={() => router.push(item.link)}>
                <h2 style={{ marginBottom: 10 }}>{item.title}</h2>
                <p>{item.description}</p>
              </div>
            ))}
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
  transition: "transform 0.2s ease",
};
