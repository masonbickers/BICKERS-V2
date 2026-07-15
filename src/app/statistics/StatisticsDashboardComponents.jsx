"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronDown, Download, SlidersHorizontal, X } from "lucide-react";
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
        <Button variant="secondary" onClick={onToggleMore} aria-expanded={moreOpen} leadingIcon={<SlidersHorizontal size={15} />} trailingIcon={<ChevronDown size={14} />}>
          More filters
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

export function CompactRankingTable({ title, rows = [], valueLabel = "Jobs", onRowClick }) {
  return (
    <Panel>
      <div className={styles.panelPadding}>
        <h3 className={styles.panelTitle}>{title}</h3>
        <p className={styles.panelMeta}>{rows.length} result{rows.length === 1 ? "" : "s"} in this filtered set</p>
      </div>
      <TableContainer style={{ border: 0, borderRadius: 0, boxShadow: "none" }}>
        <Table>
          <thead><tr><th>Rank</th><th>Name</th><th style={{ textAlign: "right" }}>{valueLabel}</th></tr></thead>
          <tbody>
            {rows.slice(0, 8).map((row, index) => (
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
      footer={<Button variant="secondary" onClick={onExport} disabled={!drilldown?.bookings?.length} leadingIcon={<Download size={15} />}>Export these jobs</Button>}
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
