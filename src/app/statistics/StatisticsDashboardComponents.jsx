"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, BrainCircuit, ChevronDown, Download, SlidersHorizontal, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Modal,
  Panel,
  Select,
  Table,
  TableContainer,
} from "@/app/components/ui";
import styles from "./statistics.module.css";

export const STATISTICS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "resources", label: "Resources" },
  { id: "finance", label: "Finance & Quality" },
];

export function StatisticsTabs({ activeTab, onChange }) {
  const refs = useRef([]);
  const onKeyDown = (event, index) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % STATISTICS_TABS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + STATISTICS_TABS.length) % STATISTICS_TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = STATISTICS_TABS.length - 1;
    onChange(STATISTICS_TABS[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className={styles.tabList} role="tablist" aria-label="Statistics sections">
      {STATISTICS_TABS.map((tab, index) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(node) => { refs.current[index] = node; }}
            id={`statistics-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`statistics-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            className={`${styles.tab} ${active ? styles.tabActive : ""}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatisticsFilterToolbar({
  search,
  onSearchChange,
  rangeMode,
  onRangeModeChange,
  selectedMonth,
  onSelectedMonthChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  clientFilter,
  onClientFilterChange,
  clientOptions,
  vehicleFilter,
  onVehicleFilterChange,
  vehicleOptions,
  employeeFilter,
  onEmployeeFilterChange,
  employeeOptions,
  moreOpen,
  onToggleMore,
  activeFilters,
  onRemoveFilter,
  onClearFilters,
}) {
  return (
    <Panel className={styles.filterPanel} aria-label="Statistics filters">
      <div className={styles.filterRow}>
        <FormField label="Search" className={styles.searchField}>
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Job, client, location, crew or vehicle" />
        </FormField>
        <FormField label="Date range" className={styles.primaryFilter}>
          <Select value={rangeMode} onChange={(event) => onRangeModeChange(event.target.value)}>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12m">Last 12 months</option>
            <option value="month">Selected month</option>
            <option value="all">All time</option>
          </Select>
        </FormField>
        {rangeMode === "month" ? (
          <FormField label="Month" className={styles.monthFilter}>
            <Input type="month" value={selectedMonth} onChange={(event) => onSelectedMonthChange(event.target.value)} />
          </FormField>
        ) : null}
        <Button variant="secondary" onClick={onToggleMore} aria-expanded={moreOpen}>
          <SlidersHorizontal size={15} /> More filters <ChevronDown size={14} />
        </Button>
      </div>

      {moreOpen ? (
        <div className={styles.secondaryFilters}>
          <FormField label="Status">
            <Select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
              {statusOptions.map((status) => <option key={status} value={status}>{status === "All" ? "All statuses" : status}</option>)}
            </Select>
          </FormField>
          <FormField label="Client">
            <Select value={clientFilter} onChange={(event) => onClientFilterChange(event.target.value)}>
              {clientOptions.map((value) => <option key={value} value={value}>{value === "all" ? "All clients" : value}</option>)}
            </Select>
          </FormField>
          <FormField label="Vehicle">
            <Select value={vehicleFilter} onChange={(event) => onVehicleFilterChange(event.target.value)}>
              {vehicleOptions.map((value) => <option key={value} value={value}>{value === "all" ? "All vehicles" : value}</option>)}
            </Select>
          </FormField>
          <FormField label="Crew">
            <Select value={employeeFilter} onChange={(event) => onEmployeeFilterChange(event.target.value)}>
              {employeeOptions.map((value) => <option key={value} value={value}>{value === "all" ? "All crew" : value}</option>)}
            </Select>
          </FormField>
        </div>
      ) : null}

      <div className={styles.filterSummary}>
        <div className={styles.chipRow} aria-live="polite">
          {activeFilters.length ? activeFilters.map((filter) => (
            <button key={filter.id} type="button" className={styles.filterChip} onClick={() => onRemoveFilter(filter.id)} aria-label={`Remove ${filter.label} filter`}>
              {filter.label}<X size={12} />
            </button>
          )) : <span className={styles.panelMeta}>No additional filters applied</span>}
        </div>
        {activeFilters.length ? <Button variant="ghost" size="sm" onClick={onClearFilters}>Clear all</Button> : null}
      </div>
    </Panel>
  );
}

export function TabHeading({ title, rangeLabel, count, actions }) {
  return (
    <div className={styles.tabHeader}>
      <div>
        <h2 className={styles.tabTitle}>{title}</h2>
        <p className={styles.tabMeta}>{rangeLabel} · {count} filtered job{count === 1 ? "" : "s"}</p>
      </div>
      {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
    </div>
  );
}

const SECTION_ACTIONS = {
  overview: { label: "Review statistics", href: "/statistics" },
  trends: { label: "Review statistics", href: "/statistics" },
  resources: { label: "Review bookings", href: "/bookings" },
  financeQuality: { label: "Open finance queue", href: "/finance-queue" },
};

export function SectionAnalysisPanel({ analysis, sectionKey, filtered = false, loading = false }) {
  if (loading) return <Panel className={styles.analysisPanel} aria-busy="true"><div className={styles.analysisHeader}><strong>Preparing section analysis…</strong></div></Panel>;
  if (!analysis) return <Panel className={styles.analysisPanel}><div className={styles.analysisHeader}><strong>Section analysis is not available yet</strong></div><p className={styles.analysisSummary}>The overall briefing remains available. This section will appear after the next schema-v2 analysis refresh.</p></Panel>;
  const action = analysis.action?.href ? analysis.action : SECTION_ACTIONS[sectionKey];
  return (
    <Panel className={styles.analysisPanel} aria-label={`${filtered ? "Filtered verified" : "AI daily"} analysis`}>
      <div className={styles.analysisHeader}>
        <div className={styles.analysisTitle}><BrainCircuit size={16} />{filtered ? "Filtered verified analysis" : "AI daily analysis"}</div>
        <span className={`${styles.confidenceBadge} ${styles[`confidence${String(analysis.confidence || "low").replace(/^./, (value) => value.toUpperCase())}`] || ""}`}>{analysis.confidence || "low"} confidence</span>
      </div>
      <p className={styles.analysisSummary}>{analysis.summary}</p>
      <div className={styles.evidenceRow}>
        {(analysis.evidence || []).slice(0, 3).map((item) => <span key={item.id} className={styles.evidenceChip}>{item.text}</span>)}
      </div>
      <div className={styles.analysisFooter}>
        <details className={styles.analysisDetails}><summary>How this is calculated</summary><p>{analysis.caveat || "Figures are calculated from the visible booking records using the approved Bickers metric definitions."}</p></details>
        {action?.href ? <Link href={action.href} className={styles.analysisAction}>{action.label}<ArrowRight size={13} /></Link> : null}
      </div>
    </Panel>
  );
}

export function HeadlineCards({ items }) {
  return (
    <div className={styles.kpiGrid}>
      {items.map((item) => (
        <Card key={item.label} as={item.onClick ? "button" : "div"} interactive={Boolean(item.onClick)} onClick={item.onClick} className={styles.kpiCard}>
          <div className={styles.kpiLabel}>{item.label}</div>
          <div className={styles.kpiValue}>{item.value}</div>
          <div className={styles.kpiHint}>{item.hint}</div>
        </Card>
      ))}
    </div>
  );
}

export function CalculationDetails({ children }) {
  return <details className={styles.details}><summary>How this is calculated</summary><div>{children}</div></details>;
}

export function CompactRankingTable({ title, summary, rows = [], valueLabel = "Jobs", onRowClick }) {
  const displayed = rows.slice(0, 8);
  const displayedTotal = displayed.reduce((total, row) => total + Number(row.count ?? row.value ?? 0), 0);
  const leader = displayed[0];
  const autoSummary = leader
    ? `${leader.name || leader.label} leads with ${leader.count ?? leader.value ?? 0} ${valueLabel.toLowerCase()}${displayedTotal ? ` (${Math.round(((leader.count ?? leader.value ?? 0) / displayedTotal) * 1000) / 10}% of the displayed top-eight total)` : ""}.`
    : `There is no ${valueLabel.toLowerCase()} ranking data in this selection.`;
  return (
    <Panel>
      <div className={styles.panelPadding}>
        <h3 className={styles.panelTitle}>{title}</h3>
        <p className={styles.panelMeta}>{rows.length} result{rows.length === 1 ? "" : "s"} in this filtered set</p>
        <p className={styles.blockSummary}><strong>Summary:</strong> {summary || autoSummary}</p>
      </div>
      <TableContainer style={{ border: 0, borderRadius: 0, boxShadow: "none" }}>
        <Table>
          <thead><tr><th>Rank</th><th>Name</th><th style={{ textAlign: "right" }}>{valueLabel}</th></tr></thead>
          <tbody>
            {displayed.map((row, index) => (
              <tr
                key={row.name || row.label}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRowClick(row); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                style={{ cursor: onRowClick ? "pointer" : "default" }}
              >
                <td>{index + 1}</td><td><strong>{row.name || row.label}</strong></td><td style={{ textAlign: "right" }}>{row.count ?? row.value ?? 0}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={3}>No data for this selection.</td></tr> : null}
          </tbody>
        </Table>
      </TableContainer>
    </Panel>
  );
}

export function DrilldownModal({ drilldown, onClose, onExport, formatVehicle, formatCredits, displayToken }) {
  return (
    <Modal
      open={Boolean(drilldown)}
      onClose={onClose}
      title={drilldown?.title || "Booking details"}
      description={`${drilldown?.bookings?.length || 0} matching booking${drilldown?.bookings?.length === 1 ? "" : "s"}`}
      size="lg"
      footer={<Button variant="secondary" onClick={onExport} disabled={!drilldown?.bookings?.length}><Download size={15} /> Export these jobs</Button>}
    >
      <TableContainer>
        <Table className={styles.modalTable}>
          <thead><tr><th>Job</th><th>Client</th><th>Status</th><th>Dates</th><th>Days</th><th>Credits</th><th>Vehicles</th><th>Crew</th></tr></thead>
          <tbody>
            {(drilldown?.bookings || []).map((booking) => (
              <tr key={booking.id}>
                <td><Link href={`/job-numbers/${booking.id}`} onClick={onClose}><strong>{booking.jobNumber || booking.id}</strong></Link></td>
                <td>{booking.client || "-"}</td>
                <td><Badge>{booking.status || "Unknown"}</Badge></td>
                <td>{booking.firstDate || "-"}{booking.lastDate && booking.lastDate !== booking.firstDate ? ` – ${booking.lastDate}` : ""}</td>
                <td>{booking.bookingDayCount}</td>
                <td>{formatCredits(booking.creditTotal)}</td>
                <td>{booking.vehicles?.map((vehicle) => formatVehicle(displayToken(vehicle))).filter(Boolean).join(", ") || "-"}</td>
                <td>{booking.employees?.map(displayToken).filter(Boolean).join(", ") || "-"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableContainer>
    </Modal>
  );
}

export { styles };
