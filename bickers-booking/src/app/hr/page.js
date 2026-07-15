"use client";

import React from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";


export default function HRPage() {
  const router = useRouter();

  const documents = [
    {
      title: "Holiday Request Form",
      description: "Submit and track time off requests.",
      link: "/holiday-form"
    },
    {
      title: "View Holiday Usage",
      description: "Check how much holiday each employee has used.",
      link: "/holiday-usage"
    },
    {
      title: "Sick Leave Form",
      description: "Report absences due to illness.",
      link: "/sick-leave"
    },
    {
      title: "HR Policy Manual",
      description: "View company policies and employee handbook.",
      link: "/hr-policies"
    },
    {
      title: "Contract Upload",
      description: "Upload new starter contracts and documentation.",
      link: "/upload-contract"
    }
  ];

  return (
    <HeaderSidebarLayout>
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#333", fontFamily: "Arial, sans-serif" }}>


      <main style={{ flex: 1, padding: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>HR Resources</h1>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {documents.map((doc, idx) => (
            <div key={idx} style={cardStyle} onClick={() => router.push(doc.link)}>
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

const cardStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  cursor: "pointer",
  transition: "transform 0.2s ease",
};
