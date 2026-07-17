"use client";

import layoutStyles from "./page.styles.module.css";
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
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* ------------------------------- Styling tokens ------------------------------- */
const UI = UI_TOKENS;

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
      tone: { bg: "var(--color-surface-subtle)", border: UI.brandBorder, text: UI.text },
    },
  ];

  const openLink = (link) => router.push(link);

  return (
    <HeaderSidebarLayout>
      <style>{financeCss}</style>
      <div style={pageWrap}>
        <div className={layoutStyles.extracted1}>
          <div>
            <h1 style={{ ...h1, display: "flex", alignItems: "center", gap: 8 }}>
              <BadgePoundSterling size={22} color={UI.brand} />
              Finance
            </h1>
            <div style={sub}>Invoicing, invoice tracking and finance reporting shortcuts.</div>
          </div>
          <div className={`finance-header-actions ${layoutStyles.extracted2}`} >
            <div style={chip}>
              <LayoutDashboard size={14} />
              Dashboard
            </div>
            <div style={{ ...chip, background: UI.greenSoft, borderColor: UI.greenBorder, color: UI.green }}>
              Shortcuts: <b className={layoutStyles.extracted3}>{financeLinks.length}</b>
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
                <div className={layoutStyles.extracted4}>
                  <div style={iconBox(item.tone)}>
                    <Icon size={17} />
                  </div>
                  <span style={{ ...chip, padding: "4px 8px", fontSize: 11, background: item.tone.bg, borderColor: item.tone.border, color: item.tone.text }}>
                    {item.pill}
                  </span>
                </div>

                <div className={layoutStyles.extracted5}>
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
            <div className={layoutStyles.extracted6}>
              <span style={{ ...chip, background: UI.greenSoft, borderColor: UI.greenBorder, color: UI.green }}>Ready to Invoice</span>
              <span style={{ ...chip, background: UI.brandSoft, borderColor: UI.brandBorder, color: UI.brand }}>Invoiced</span>
              <span style={{ ...chip, background: UI.purpleSoft, borderColor: UI.purpleBorder, color: "var(--color-accent)" }}>Paid</span>
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
