"use client";

import layoutStyles from "./page.styles.module.css";
import React from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* ───────────────── Visual tokens (same as your Vehicles page) ──────────────── */
const UI = UI_TOKENS;

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
      title: "Service Overview",
      description: "Review due dates, bookings and completed service history.",
      link: "/service-overview",
    },
    {
      title: "Maintenance Jobs",
      description: "Plan, complete and review workshop maintenance jobs.",
      link: "/maintenance-jobs",
    },
    {
      title: "MOT Overview",
      description: "Review MOT due dates, bookings and DVSA status.",
      link: "/mot-overview",
    },
    {
      title: "Vehicle Activity",
      description: "View service, repair, defect, check and prep history.",
      link: "/vehicle-activity",
    },
    {
      title: "Fleet Register",
      description: "Open vehicle records and their service information.",
      link: "/vehicles",
    },
    {
      title: "Vehicle Prep",
      description: "Review pre-shoot prep lists and readiness checks.",
      link: "/preplist-dashboard",
    },
    {
      title: "Vehicle Checks",
      description: "Review daily driver and vehicle check submissions.",
      link: "/vehicle-checks",
    },
    {
      title: "Defects",
      description: "Review, track and resolve reported vehicle defects.",
      link: "/defects/general",
    },
    {
      title: "Workshop Calendar",
      description: "View service and maintenance work on the workshop diary.",
      link: "/workshop",
    },
  ];

  return (
    <HeaderSidebarLayout>
      <div style={{ display: "flex", ...shell }}>
        <main className={layoutStyles.extracted1}>
          <div className={layoutStyles.extracted2}>
            <h1 style={h1}>Service Management</h1>
            <div style={{ fontSize: 12, color: UI.subtext }}>
              Service • MOT • Checks • Repairs • History
            </div>
          </div>

          {/* GRID */}
          <div className={layoutStyles.extracted3}>
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
