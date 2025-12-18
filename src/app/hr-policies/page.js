"use client";

import { useMemo, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system (matches your app)
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 16,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };

const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};

const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };

const chip = (kind = "neutral") => {
  if (kind === "brand")
    return {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid #dbeafe",
      background: UI.brandSoft,
      color: UI.brand,
      fontSize: 12,
      fontWeight: 900,
      whiteSpace: "nowrap",
    };
  return {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#f1f5f9",
    color: UI.text,
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
};

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const sectionCard = {
  ...surface,
  overflow: "hidden",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};

const sectionHeader = {
  padding: "14px 16px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
  gap: 12,
};

const sectionTitle = { fontSize: 15.5, fontWeight: 900, color: UI.text, margin: 0 };

const sectionHint = { color: UI.muted, fontSize: 12, marginTop: 3 };

const iconWrap = (open) => ({
  width: 30,
  height: 30,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  border: "1px solid #e5e7eb",
  background: open ? "#eef2ff" : "#fff",
  color: open ? UI.brand : UI.muted,
  transform: open ? "rotate(180deg)" : "rotate(0deg)",
  transition: "transform .18s ease, background .18s ease, color .18s ease",
  flex: "0 0 auto",
});

const bodyOuter = (open) => ({
  display: "grid",
  gridTemplateRows: open ? "1fr" : "0fr",
  transition: "grid-template-rows .18s ease",
});

const bodyInner = {
  overflow: "hidden",
};

const body = {
  padding: "0 16px 16px",
  color: UI.text,
  fontSize: 13.75,
  lineHeight: 1.65,
};

const muted = { color: UI.muted };

function PolicySection({ titleText, summary, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={sectionCard}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = UI.shadowHover;
        e.currentTarget.style.borderColor = "#dbeafe";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = UI.shadowSm;
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.transform = "translateY(0px)";
      }}
    >
      <div style={sectionHeader} onClick={() => setOpen((v) => !v)} role="button" tabIndex={0}>
        <div style={{ minWidth: 0 }}>
          <div style={sectionTitle}>{titleText}</div>
          {summary ? <div style={sectionHint}>{summary}</div> : null}
        </div>
        <div style={iconWrap(open)}>⌄</div>
      </div>

      <div style={bodyOuter(open)}>
        <div style={bodyInner}>
          <div style={body}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function HRPolicyPage() {
  const policies = useMemo(
    () => [
      {
        title: "Holiday & Leave Policy",
        summary: "Annual leave requests, approval rules, half-days.",
        content: (
          <>
            <p>
              Employees are entitled to annual leave in accordance with their contract. Holiday requests must be submitted in advance and are
              subject to approval based on operational requirements.
            </p>
            <ul>
              <li>Holiday year runs from January to December</li>
              <li>Unused leave may not carry over unless approved</li>
              <li>Half-day holidays must be clearly stated</li>
            </ul>
          </>
        ),
      },
      {
        title: "Sickness & Absence Policy",
        summary: "Reporting sickness and evidence requirements.",
        content: (
          <>
            <p>If an employee is unable to attend work due to illness, they must inform management as early as possible.</p>
            <ul>
              <li>Self-certification required for short-term absence</li>
              <li>Medical evidence may be requested for extended absence</li>
              <li>Repeated absence may trigger a review</li>
            </ul>
          </>
        ),
      },
      {
        title: "Working Hours & Conduct",
        summary: "Professional standards, punctuality, and behaviour.",
        content: (
          <>
            <p>Employees are expected to arrive on time, be fit for duty, and conduct themselves professionally at all times.</p>
            <ul>
              <li>No alcohol or substance use during working hours</li>
              <li>Respect colleagues, clients, and company property</li>
              <li>Follow instructions from supervisors and coordinators</li>
            </ul>
          </>
        ),
      },
      {
        title: "Vehicle & Equipment Use",
        summary: "Authorised use, reporting faults, licence requirements.",
        content: (
          <>
            <p>Company vehicles and equipment must only be used for authorised work purposes.</p>
            <ul>
              <li>Drivers must hold valid licences</li>
              <li>Any damage or faults must be reported immediately</li>
              <li>Vehicles must not be used for personal work</li>
            </ul>
          </>
        ),
      },
      {
        title: "Disciplinary Procedure",
        summary: "How breaches are handled and documented.",
        content: (
          <>
            <p>Failure to comply with company policies may result in disciplinary action.</p>
            <ul>
              <li>Informal warning</li>
              <li>Formal written warning</li>
              <li>Final warning or dismissal depending on severity</li>
            </ul>
            <p style={muted}>All disciplinary actions will be handled fairly and documented.</p>
          </>
        ),
      },
    ],
    []
  );

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>HR Policies</h1>
            <div style={sub}>Company policies and guidelines for staff conduct, leave, and operations.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={chip("brand")}>Handbook</span>
            <span style={chip()}>{policies.length} sections</span>
          </div>
        </div>

        <div style={{ display: "grid", gap: UI.gap }}>
          {policies.map((p, idx) => (
            <PolicySection key={idx} titleText={p.title} summary={p.summary} defaultOpen={idx === 0}>
              {p.content}
            </PolicySection>
          ))}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
