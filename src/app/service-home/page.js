"use client";

import React from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────── Visual tokens (same as your Vehicles page) ──────────────── */
const UI = {
  page: "#f3f4f6",
  card: "#ffffff",
  text: "#0f172a",
  subtext: "#64748b",
  border: "1px solid #e5e7eb",
  radius: 12,
  radiusSm: 8,
  shadowSm: "0 4px 12px rgba(2, 6, 23, 0.06)",
  shadowMd: "0 8px 24px rgba(2, 6, 23, 0.08)",
};

const shell = {
  minHeight: "100vh",
  background: UI.page,
  color: UI.text,
  fontFamily:
    "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};

const main = {
  flex: 1,
  padding: "28px 28px 40px",
  maxWidth: 1600,
  margin: "0 auto",
};

const h1 = {
  fontSize: 28,
  fontWeight: 800,
  marginBottom: 16,
  lineHeight: "34px",
  color: UI.text,
};

const subbar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 22,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 16,
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 16,
  cursor: "pointer",
  transition: "transform .08s ease, box-shadow .2s ease",
};

const cardTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: UI.text,
};

const cardDesc = {
  marginTop: 6,
  fontSize: 13,
  color: UI.subtext,
  lineHeight: 1.4,
};

/* reusable tile */
function Tile({ title, description, onClick }) {
  return (
    <div
      style={card}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = UI.shadowMd;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
        e.currentTarget.style.boxShadow = UI.shadowSm;
      }}
    >
      <h2 style={cardTitle}>{title}</h2>
      {description && <p style={cardDesc}>{description}</p>}
    </div>
  );
}

export default function ServiceHomePage() {
  const router = useRouter();

  const SECTIONS = [
    {
      title: "Minor Service",
      description: "Record, review and submit minor vehicle service reports.",
      link: "/service/minor-service",
    },
    {
      title: "MOT Pre-Check",
      description: "Perform pre-MOT inspections and upload supporting files.",
      link: "/service/mot-precheck",
    },
    {
      title: "Service Forms",
      description: "General service forms, inspections and maintenance documents.",
      link: "/service/service-form",
    },
    {
      title: "Service History",
      description: "View full historical service logs for each vehicle.",
      link: "/service/service-history",
    },
    {
      title: "Service Records",
      description: "Access individual service entries and maintenance logs.",
      link: "/service/service-record",
    },
    {
      title: "Vehicle Prep",
      description: "Pre-shoot prep lists and pre-deployment checks.",
      link: "/service/vehicle-prep",
    },
    {
      title: "Daily Checks",
      description: "Daily driver and vehicle check submissions.",
      link: "/service/daily-check",
    },
    {
      title: "Defects",
      description: "Review, track and resolve reported vehicle defects.",
      link: "/service/defects",
    },
    {
      title: "Work / Repairs",
      description: "Book work, repairs and maintenance jobs.",
      link: "/service/work",
    },
  ];

  return (
    <HeaderSidebarLayout>
      <div style={{ display: "flex", ...shell }}>
        <main style={main}>
          <div style={subbar}>
            <h1 style={h1}>Service Management</h1>
            <div style={{ fontSize: 12, color: UI.subtext }}>
              Service • MOT • Checks • Repairs • History
            </div>
          </div>

          {/* GRID */}
          <div style={grid}>
            {SECTIONS.map((section, i) => (
              <Tile
                key={i}
                title={section.title}
                description={section.description}
                onClick={() => router.push(section.link)}
              />
            ))}
          </div>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}
