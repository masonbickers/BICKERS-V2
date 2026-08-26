"use client";

import { useRouter } from "next/navigation";
import {
  BarChart3,
  Download,
  FilePlus2,
  FileText,
  LayoutDashboard,
  PoundSterling,
  Receipt,
  Settings,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  BusinessHeaderActions,
  BusinessPage,
  BusinessPageHeader,
} from "@/app/components/BusinessPage";
import { Badge, Button, NavigationCard } from "@/app/components/ui";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import styles from "./page.styles.module.css";

const UI = UI_TOKENS;

const surface = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
  minWidth: 0,
};

const primaryWorkspaces = [
  {
    title: "Ready to Invoice",
    description: "Review jobs that are complete and queued for invoicing.",
    link: "/ready-invoice",
    badge: { label: "Queue", tone: "success" },
    icon: Receipt,
  },
  {
    title: "Invoice Tracker",
    description: "Track invoices from issue through to payment.",
    link: "/finance-home",
    badge: { label: "Tracker", tone: "info" },
    icon: FileText,
  },
  {
    title: "Quote & Revenue Insights",
    description: "Analyse quote value, invoiced revenue, vehicles and cost types.",
    link: "/quote-insights",
    badge: { label: "Insights", tone: "info" },
    icon: BarChart3,
  },
  {
    title: "Purchase Receipts",
    description: "Review staff receipts and prepare VAT records.",
    link: "/receipts",
    badge: { label: "VAT", tone: "success" },
    icon: PoundSterling,
  },
];

const plannedWorkspaces = [
  {
    title: "Create Invoice",
    description: "Manually generate a new invoice.",
    icon: FilePlus2,
  },
  {
    title: "Export Finance Data",
    description: "Download reports for accounting.",
    icon: Download,
  },
  {
    title: "Finance Settings",
    description: "Adjust thresholds, VAT and finance rules.",
    icon: Settings,
  },
];

export default function FinancePage() {
  const router = useRouter();

  return (
    <HeaderSidebarLayout>
      <BusinessPage className={styles.page}>
        <BusinessPageHeader
          title="Invoicing"
          subtitle="Invoice workflows, revenue reporting and purchase records in one workspace."
          actions={
            <BusinessHeaderActions>
              <Badge variant="info">
                <LayoutDashboard size={14} />
                Finance home
              </Badge>
              <Badge variant="success">4 live workspaces</Badge>
            </BusinessHeaderActions>
          }
        />

        <section className={styles.commandGrid}>
          <div>
            <div className={styles.sectionHeading}>
              <div>
                <h2 className={styles.title}>Home</h2>
                <p className={styles.hint}>
                  Operational shortcuts for invoicing, payment tracking and finance reporting.
                </p>
              </div>
              <span className={styles.sectionTag}>All locations</span>
            </div>

            <div className={styles.workspaceHeading}>
              <div>
                <h2 className={styles.workspaceTitle}>Finance workspaces</h2>
                <p className={styles.hint}>Common finance actions grouped by how the team uses them.</p>
              </div>
              <Button type="button" onClick={() => router.push("/ready-invoice")}>
                <Receipt size={15} />
                Open invoice queue
              </Button>
            </div>

            <div className={styles.workspaceGrid}>
              {primaryWorkspaces.map((workspace) => {
                const Icon = workspace.icon;
                return (
                  <NavigationCard
                    key={workspace.link}
                    icon={<Icon size={20} strokeWidth={2.2} />}
                    title={workspace.title}
                    description={workspace.description}
                    badges={[workspace.badge]}
                    onClick={() => router.push(workspace.link)}
                  />
                );
              })}
            </div>
          </div>

          <aside className={styles.sideRail}>
            <div style={{ ...surface, padding: 12 }}>
              <div className={styles.railHeading}>
                <span className={styles.railIcon}><Receipt size={17} /></span>
                <div>
                  <h2 className={styles.workspaceTitle}>Invoice flow</h2>
                  <p className={styles.hint}>Keep each job moving through the same clear path.</p>
                </div>
              </div>
              <ol className={styles.flowList}>
                <li><span>1</span><div><strong>Ready</strong><small>Confirm job and customer details</small></div></li>
                <li><span>2</span><div><strong>Invoiced</strong><small>Issue and track the invoice</small></div></li>
                <li><span>3</span><div><strong>Paid</strong><small>Close the finance cycle</small></div></li>
              </ol>
            </div>

            <div style={{ ...surface, padding: 12 }}>
              <h2 className={styles.workspaceTitle}>Quick path</h2>
              <p className={styles.hint}>
                Start with invoice-ready jobs, then use the tracker to follow sent and paid invoices.
              </p>
              <div className={styles.railActions}>
                <Button type="button" onClick={() => router.push("/ready-invoice")}>View queue</Button>
                <Button variant="secondary" type="button" onClick={() => router.push("/finance-home")}>Open tracker</Button>
              </div>
            </div>
          </aside>
        </section>

        <section className={styles.plannedSection} style={surface}>
          <div className={styles.sectionHeading}>
            <div>
              <h2 className={styles.title}>Finance administration</h2>
              <p className={styles.hint}>Additional tools planned for this workspace.</p>
            </div>
            <span className={styles.sectionTag}>Coming soon</span>
          </div>
          <div className={styles.plannedGrid}>
            {plannedWorkspaces.map((workspace) => {
              const Icon = workspace.icon;
              return (
                <NavigationCard
                  key={workspace.title}
                  icon={<Icon size={20} strokeWidth={2.2} />}
                  title={workspace.title}
                  description={workspace.description}
                  badges={[{ label: "Coming soon", tone: "neutral" }]}
                  disabled
                />
              );
            })}
          </div>
        </section>
      </BusinessPage>
    </HeaderSidebarLayout>
  );
}
