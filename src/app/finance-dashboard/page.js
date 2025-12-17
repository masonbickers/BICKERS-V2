"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
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
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 700,
};

const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const cardBase = {
  ...surface,
  padding: 16,
  cursor: "pointer",
  textDecoration: "none",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: "#dbeafe" };

export default function FinancePage() {
  const router = useRouter();
  const [hover, setHover] = useState(null);

  const financeLinks = [
    { title: "Ready to Invoice", description: "View jobs queued for invoicing.", link: "/ready-invoice", pill: "Queue" },
    { title: "Invoice Tracker", description: "Track all sent and paid invoices.", link: "/finance-home", pill: "Tracker" },
    { title: "Create Invoice", description: "Manually generate a new invoice.", link: "/finance/create", pill: "New" },
    { title: "Export Finance Data", description: "Download reports for accounting.", link: "/finance/export", pill: "Export" },
    { title: "Finance Settings", description: "Adjust thresholds, VAT, and finance rules.", link: "/finance/settings", pill: "Settings" },
  ];

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Finance</h1>
            <div style={sub}>Invoicing and reporting shortcuts.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>Dashboard</div>
            <div style={{ ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand }}>
              Shortcuts: <b style={{ marginLeft: 6 }}>{financeLinks.length}</b>
            </div>
          </div>
        </div>

        {/* Tiles */}
        <div style={grid(4)}>
          {financeLinks.map((item, idx) => {
            const isHover = hover === idx;
            return (
              <div
                key={idx}
                role="button"
                tabIndex={0}
                onClick={() => router.push(item.link)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? router.push(item.link) : null)}
                onMouseEnter={() => setHover(idx)}
                onMouseLeave={() => setHover(null)}
                style={{
                  ...cardBase,
                  ...(isHover ? cardHover : null),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: UI.text }}>{item.title}</div>
                  <span style={chip}>{item.pill}</span>
                </div>

                <div style={{ marginTop: 6, color: UI.muted, fontSize: 13 }}>{item.description}</div>

                <div style={{ marginTop: 10, fontWeight: 900, color: UI.brand }}>Open →</div>
              </div>
            );
          })}
        </div>

        {/* Bottom note (optional) */}
        <div style={{ ...surface, padding: 14, marginTop: UI.gap, color: UI.muted, fontSize: 12 }}>
          Tip: keep invoice statuses consistent (Ready to Invoice → Invoiced → Paid) so the queues and trackers stay accurate.
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
