"use client";

import layoutStyles from "./StatisticsDashboardComponents.styles.module.css";
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
import { formatUkDate } from "@/app/utils/dateDisplay";
import { shouldShowStatisticsAnalysis } from "@/app/utils/statisticsDashboard";

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
        <div className={styles.filterTitleBlock}>
          <strong>Report filters</strong>
          <span>Refine the figures shown in the reporting tabs.</span>
        </div>
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
        <Button variant="secondary" onClick={onToggleMore} aria-expanded={moreOpen} className={styles.moreFiltersButton}>
          <SlidersHorizontal size={15} /> More filters <ChevronDown className={moreOpen ? styles.chevronOpen : ""} size={14} />
        </Button>
      </div>

      {moreOpen ? (
        <div className={styles.secondaryFilters}>
          <FormField label="Search" className={styles.searchField}>
            <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Job, client, location, crew or vehicle" />
          </FormField>
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

      {activeFilters.length ? (
        <div className={styles.filterSummary}>
          <div className={styles.chipRow} aria-live="polite">
            {activeFilters.map((filter) => (
            <button key={filter.id} type="button" className={styles.filterChip} onClick={() => onRemoveFilter(filter.id)} aria-label={`Remove ${filter.label} filter`}>
              {filter.label}<X size={12} />
            </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={onClearFilters}>Clear all</Button>
        </div>
      ) : null}
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
  resources: { label: "Review bookings", href: "/bookings" },
  financeQuality: { label: "Open finance queue", href: "/finance-queue" },
};

const formatGeneratedAt = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
};

export function SectionAnalysisPanel({ analysis, sectionKey, filtered = false, loading = false, stale = false, generatedAt = "" }) {
  if (!loading && !shouldShowStatisticsAnalysis({ analysis, stale, filtered })) return null;
  if (loading) return <Panel className={styles.analysisPanel} aria-busy="true"><div className={styles.analysisHeader}><strong>Preparing current insight…</strong></div></Panel>;
  if (!analysis) return null;
  const action = analysis.action?.href ? analysis.action : SECTION_ACTIONS[sectionKey];
  const displayGeneratedAt = filtered ? "Calculated from the current filters" : formatGeneratedAt(generatedAt);
  const meaningfulAction = action?.href && action.href !== "/statistics" ? action : null;
  return (
    <Panel className={styles.analysisPanel} aria-label={`${filtered ? "Filtered verified" : "AI daily"} analysis`}>
      <div className={styles.analysisContent}>
        <div className={styles.analysisHeader}>
          <div className={styles.analysisTitle}><BrainCircuit size={16} />{filtered ? "Filtered insight" : "Current AI insight"}</div>
          <div className={styles.analysisMeta}>
            {displayGeneratedAt ? <span>{displayGeneratedAt}</span> : null}
            <span className={`${styles.confidenceBadge} ${styles[`confidence${String(analysis.confidence || "low").replace(/^./, (value) => value.toUpperCase())}`] || ""}`}>{analysis.confidence || "low"} confidence</span>
          </div>
        </div>
        <p className={styles.analysisSummary}>{analysis.summary}</p>
        <div className={styles.analysisFooter}>
          <details className={styles.analysisDetails}>
            <summary>Evidence and calculation</summary>
            <div className={styles.analysisEvidenceList}>
              {(analysis.evidence || []).slice(0, 3).map((item) => <span key={item.id}>{item.text}</span>)}
            </div>
            <p>{analysis.caveat || "Figures are calculated from the visible booking records using the approved Bickers metric definitions."}</p>
          </details>
          {meaningfulAction ? <Link href={meaningfulAction.href} className={styles.analysisAction}>{meaningfulAction.label}<ArrowRight size={13} /></Link> : null}
        </div>
      </div>
    </Panel>
  );
}

export function CurrentActionsStrip({ items, title = "Current actions", description = "Live queues and the next 30 days · unaffected by report filters" }) {
  return (
    <Panel className={styles.currentActions} aria-label={title}>
      <div className={styles.currentActionsHeading}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className={styles.currentActionsGrid}>
        {items.map((item) => {
          const Component = item.href ? Link : item.onClick ? "button" : "div";
          return (
            <Component key={item.label} href={item.href} type={item.onClick ? "button" : undefined} onClick={item.onClick} className={`${styles.currentActionItem} ${item.tone ? styles[`currentAction${item.tone}`] || "" : ""}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.hint}</small>
              {(item.href || item.onClick) ? <ArrowRight size={14} aria-hidden="true" /> : null}
            </Component>
          );
        })}
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

export function CompactRankingTable({ title, summary, rows = [], valueLabel = "Jobs", onRowClick, limit = 5, showBookingDays = false }) {
  const displayed = rows.slice(0, limit);
  const displayedTotal = displayed.reduce((total, row) => total + Number(row.count ?? row.value ?? 0), 0);
  const leader = displayed[0];
  const autoSummary = leader
    ? `${leader.name || leader.label} leads with ${leader.count ?? leader.value ?? 0} ${valueLabel.toLowerCase()}${displayedTotal ? ` (${Math.round(((leader.count ?? leader.value ?? 0) / displayedTotal) * 1000) / 10}% of the displayed total)` : ""}.`
    : `There is no ${valueLabel.toLowerCase()} ranking data in this selection.`;
  return (
    <Panel>
      <div className={styles.panelPadding}>
        <h3 className={styles.panelTitle}>{title}</h3>
        <p className={styles.panelMeta}>{rows.length} result{rows.length === 1 ? "" : "s"} in this filtered set</p>
        <p className={styles.rankingSummary}>{summary || autoSummary}</p>
      </div>
      <TableContainer className={layoutStyles.extracted1}>
        <Table>
          <thead><tr><th>Rank</th><th>Name</th><th className={layoutStyles.extracted2}>{valueLabel}</th>{showBookingDays ? <th className={layoutStyles.extracted2}>Days</th> : null}</tr></thead>
          <tbody>
            {displayed.map((row, index) => (
              <tr
                key={row.name || row.label}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRowClick(row); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                style={{ cursor: onRowClick ? "pointer" : "default" }}
              >
                <td>{index + 1}</td><td><strong>{row.name || row.label}</strong></td><td className={layoutStyles.extracted3}>{row.count ?? row.value ?? 0}</td>{showBookingDays ? <td className={layoutStyles.extracted3}>{row.bookingDays ?? 0}</td> : null}
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={showBookingDays ? 4 : 3}>No data for this selection.</td></tr> : null}
          </tbody>
        </Table>
      </TableContainer>
    </Panel>
  );
}

export function CollapsibleSection({ title, description, children }) {
  return (
    <details className={styles.collapsibleSection}>
      <summary>
        <span><strong>{title}</strong>{description ? <small>{description}</small> : null}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className={styles.collapsibleContent}>{children}</div>
    </details>
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
                <td>{formatUkDate(booking.firstDate)}{booking.lastDate && booking.lastDate !== booking.firstDate ? ` – ${formatUkDate(booking.lastDate)}` : ""}</td>
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
