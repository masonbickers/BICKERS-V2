"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgePoundSterling,
  Download,
  FilePlus2,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ------------------------------- Styling tokens ------------------------------- */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid var(--legacy-color-d7dee8)",
  bg: "var(--legacy-color-f3f6f9)",
  card: "var(--legacy-color-ffffff)",
  text: "var(--legacy-color-0f172a)",
  muted: "var(--legacy-color-5f6f82)",
  brand: "var(--legacy-color-1f4b7a)",
  brandSoft: "var(--legacy-color-edf3f8)",
  brandBorder: "var(--legacy-color-c8d6e3)",
  green: "var(--legacy-color-166534)",
  greenSoft: "var(--legacy-color-ecfdf5)",
  greenBorder: "var(--legacy-color-bbf7d0)",
  amber: "var(--legacy-color-92400e)",
  amberSoft: "var(--legacy-color-fff7ed)",
  amberBorder: "var(--legacy-color-fed7aa)",
  purple: "var(--legacy-color-5b21b6)",
  purpleSoft: "var(--legacy-color-f5f3ff)",
  purpleBorder: "var(--legacy-color-ddd6fe)",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6, maxWidth: 760 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const sectionTitle = { margin: 0, fontSize: 16, fontWeight: 800, color: UI.text, lineHeight: 1.2 };
const sectionSub = { color: UI.muted, fontSize: 12.5, lineHeight: 1.45, marginTop: 5 };
const iconBox = (tone) => ({
  width: 34,
  height: 34,
  borderRadius: UI.radius,
  border: `1px solid ${tone.border}`,
  background: tone.bg,
  color: tone.text,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
});

const financeCss = `
  @media (max-width: 1180px) {
    .finance-dashboard-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
    .finance-header-actions {
      justify-content: flex-start !important;
      width: 100%;
    }
  }

  @media (max-width: 760px) {
    .finance-dashboard-grid,
    .finance-summary-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;

export default function FinancePage() {
  const router = useRouter();
  const [hover, setHover] = useState(null);

  const financeLinks = [
    {
      title: "Ready to Invoice",
      description: "View jobs queued for invoicing.",
      link: "/ready-invoice",
      pill: "Queue",
      icon: Receipt,
      tone: { bg: UI.greenSoft, border: UI.greenBorder, text: UI.green },
    },
    {
      title: "Invoice Tracker",
      description: "Track all sent and paid invoices.",
      link: "/finance-home",
      pill: "Tracker",
      icon: FileText,
      tone: { bg: UI.brandSoft, border: UI.brandBorder, text: UI.brand },
    },
    {
      title: "Create Invoice",
      description: "Manually generate a new invoice.",
      link: "/finance/create",
      pill: "New",
      icon: FilePlus2,
      tone: { bg: UI.amberSoft, border: UI.amberBorder, text: UI.amber },
    },
    {
      title: "Export Finance Data",
      description: "Download reports for accounting.",
      link: "/finance/export",
      pill: "Export",
      icon: Download,
      tone: { bg: UI.purpleSoft, border: UI.purpleBorder, text: UI.purple },
    },
    {
      title: "Finance Settings",
      description: "Adjust thresholds, VAT, and finance rules.",
      link: "/finance/settings",
      pill: "Settings",
      icon: Settings,
      tone: { bg: "var(--legacy-color-f8fbfd)", border: UI.brandBorder, text: UI.text },
    },
  ];

  const openLink = (link) => router.push(link);

  return (
    <HeaderSidebarLayout>
      <style>{financeCss}</style>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={{ ...h1, display: "flex", alignItems: "center", gap: 8 }}>
              <BadgePoundSterling size={22} color={UI.brand} />
              Finance
            </h1>
            <div style={sub}>Invoicing, invoice tracking and finance reporting shortcuts.</div>
          </div>
          <div className="finance-header-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>
              <LayoutDashboard size={14} />
              Dashboard
            </div>
            <div style={{ ...chip, background: UI.greenSoft, borderColor: UI.greenBorder, color: UI.green }}>
              Shortcuts: <b style={{ marginLeft: 6 }}>{financeLinks.length}</b>
            </div>
          </div>
        </div>

        <div className="finance-dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: UI.gap }}>
          {financeLinks.map((item, idx) => {
            const Icon = item.icon;
            const isHover = hover === idx;
            return (
              <div
                key={item.link}
                role="button"
                tabIndex={0}
                onClick={() => openLink(item.link)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openLink(item.link);
                  }
                }}
                onMouseEnter={() => setHover(idx)}
                onMouseLeave={() => setHover(null)}
                style={{
                  ...surface,
                  minHeight: 132,
                  padding: 12,
                  cursor: "pointer",
                  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
                  ...(isHover ? { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: item.tone.border } : null),
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={iconBox(item.tone)}>
                    <Icon size={17} />
                  </div>
                  <span style={{ ...chip, padding: "4px 8px", fontSize: 11, background: item.tone.bg, borderColor: item.tone.border, color: item.tone.text }}>
                    {item.pill}
                  </span>
                </div>

                <div style={{ marginTop: 12 }}>
                  <h2 style={sectionTitle}>{item.title}</h2>
                  <div style={sectionSub}>{item.description}</div>
                </div>

                <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, color: UI.brand, fontWeight: 800, fontSize: 12.5 }}>
                  Open
                  <ArrowRight size={14} />
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="finance-summary-grid"
          style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: UI.gap, marginTop: UI.gap }}
        >
          <div style={{ ...surface, padding: 12 }}>
            <div style={sectionTitle}>Finance flow</div>
            <div style={sectionSub}>
              Keep invoice statuses consistent so the queues and trackers stay accurate.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <span style={{ ...chip, background: UI.greenSoft, borderColor: UI.greenBorder, color: UI.green }}>Ready to Invoice</span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: UI.brandBorder, color: UI.brand }}>Invoiced</span>
              <span style={{ ...chip, background: UI.purpleSoft, borderColor: UI.purpleBorder, color: UI.purple }}>Paid</span>
            </div>
          </div>

          <div style={{ ...surface, padding: 12 }}>
            <div style={sectionTitle}>Quick path</div>
            <div style={sectionSub}>
              Start with the queue for invoice-ready jobs, then use the tracker to check sent and paid invoices.
            </div>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
