"use client";

import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Home, Receipt, RotateCcw, Search } from "lucide-react";
import { onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "../components/HeaderSidebarLayout";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "../utils/firestoreAccess";
import { useSessionScroll, useSessionState } from "../utils/useSessionState";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { FIXED_JOB_STATUS_STYLES } from "@/app/utils/jobStatusColors";

const UI = UI_TOKENS;

const pageWrap = {
  minHeight: "100vh",
  background: UI.bg,
  color: UI.text,
};

const headerBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px 8px",
};

const h1 = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: 0,
  color: UI.text,
};

const surface = {
  margin: "0 10px 10px",
  background: UI.panel,
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.05)",
};

const toolbar = {
  ...surface,
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) minmax(170px, 240px) auto",
  alignItems: "center",
  gap: 8,
  padding: 10,
};

const inputStyle = {
  width: "100%",
  height: 36,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "var(--color-surface)",
  color: UI.text,
  fontSize: 13,
  fontWeight: 700,
  padding: "0 12px",
  outline: "none",
};

const btn = {
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "var(--color-surface)",
  color: UI.text,
  fontSize: 13,
  fontWeight: 900,
  textDecoration: "none",
  padding: "0 12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const primaryBtn = {
  ...btn,
  background: UI.brand,
  borderColor: UI.brand,
  color: "var(--color-white)",
};

const chip = {
  minHeight: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 999,
  border: `1px solid ${UI.border}`,
  background: UI.brandSoft,
  color: UI.brand,
  fontSize: 12,
  fontWeight: 900,
  padding: "0 10px",
  whiteSpace: "nowrap",
};

const tableWrap = {
  overflowX: "auto",
  borderTop: `1px solid ${UI.borderSoft}`,
};

const tableEl = {
  width: "100%",
  minWidth: 1020,
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const th = {
  padding: "7px 10px",
  textAlign: "left",
  color: "var(--color-text-muted)",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  borderBottom: `1px solid ${UI.borderSoft}`,
  background: "var(--color-surface-subtle)",
};

const td = {
  padding: "6px 10px",
  borderBottom: `1px solid ${UI.borderSoft}`,
  fontSize: 13,
  fontWeight: 700,
  color: UI.text,
  verticalAlign: "middle",
};

const nowrap = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const statusStyles = {
  "Ready to Invoice": {
    background: UI.amberSoft,
    borderColor: UI.amberBorder,
    color: "var(--color-warning)",
  },
  Invoiced: {
    background: "var(--color-brand-soft)",
    borderColor: "var(--color-info-border)",
    color: "var(--color-brand)",
  },
  Paid: {
    background: UI.greenSoft,
    borderColor: UI.greenBorder,
    color: "var(--color-success)",
  },
  ...Object.fromEntries(Object.entries(FIXED_JOB_STATUS_STYLES).map(([status, style]) => [status, { background: style.bg, borderColor: style.border, color: style.text }])),
  Default: {
    background: UI.slateSoft,
    borderColor: UI.border,
    color: UI.brand,
  },
};

const focusCss = `
  .finance-control:focus {
    border-color: var(--color-brand) !important;
    box-shadow: 0 0 0 3px rgba(31, 75, 122, 0.14);
  }
  .finance-row:hover {
    background: var(--color-surface-subtle);
  }
  @media (max-width: 980px) {
    .finance-header {
      align-items: flex-start !important;
      flex-direction: column;
    }
    .finance-toolbar {
      grid-template-columns: 1fr !important;
    }
    .finance-actions {
      width: 100%;
      justify-content: flex-start !important;
      flex-wrap: wrap;
    }
  }
`;

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normaliseDates(job) {
  const source = Array.isArray(job?.dates) && job.dates.length
    ? job.dates
    : [{ start: job?.startDate || job?.date, end: job?.endDate || job?.date }];

  return source
    .map((entry) => {
      const start = parseDate(entry?.start || entry?.date || entry);
      const end = parseDate(entry?.end || entry?.date || entry?.start || entry);
      return start ? { start, end: end || start } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function fmtShort(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function fmtWeek(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateRangeLabel(dates) {
  if (!dates.length) return "Dates TBC";
  const first = dates[0].start;
  const last = dates[dates.length - 1].end || dates[dates.length - 1].start;
  if (first.toDateString() === last.toDateString()) return fmtShort(first);
  return `${fmtShort(first)} to ${fmtShort(last)}`;
}

function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d;
}

function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${fmtWeek(monday)} to ${fmtWeek(sunday)}`;
}

function isFourDigitJob(job) {
  return /^\d{4}(?:\.\d+)?$/.test(String(job?.jobNumber || "").trim());
}

function isPaid(job) {
  const status = String(job?.status || "").toLowerCase();
  const invoiceStatus = String(job?.invoiceStatus || job?.financeStatus || "").toLowerCase();
  return Boolean(
    status === "paid" ||
      invoiceStatus === "paid" ||
      invoiceStatus === "settled" ||
      job?.paid ||
      job?.finance?.paidAt
  );
}

function isReadyToInvoice(job) {
  const status = String(job?.status || "");
  const financeStatus = String(job?.invoiceStatus || job?.financeStatus || "");
  return Boolean(
    job?.readyToInvoice ||
      /ready\s*to\s*invoice/i.test(status) ||
      /ready\s*to\s*invoice/i.test(financeStatus)
  );
}

function prettifyStatus(status) {
  const raw = String(status || "Ready to Invoice").trim();
  const normalised = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const known = {
    "ready to invoice": "Ready to Invoice",
    invoiced: "Invoiced",
    paid: "Paid",
    complete: "Complete",
    "action required": "Action Required",
    confirmed: "Confirmed",
    "first pencil": "First Pencil",
    "second pencil": "Second Pencil",
    dnh: "DNH",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    enquiry: "Enquiry",
  };
  return known[normalised] || raw || "Ready to Invoice";
}

function StatusBadge({ status }) {
  const label = prettifyStatus(status);
  const colors = statusStyles[label] || statusStyles.Default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 26,
        maxWidth: "100%",
        borderRadius: 999,
        border: `1px solid ${colors.borderColor}`,
        background: colors.background,
        color: colors.color,
        fontSize: 12,
        fontWeight: 900,
        lineHeight: 1,
        padding: "0 10px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function initialsFromName(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function crewInitials(job) {
  const candidates = [
    ...(Array.isArray(job?.employees) ? job.employees : []),
    ...(Array.isArray(job?.crew) ? job.crew : []),
    ...(Array.isArray(job?.crewMembers) ? job.crewMembers : []),
  ];

  const names = candidates
    .map((person) => person?.name || person?.displayName || person?.employeeName || person)
    .filter(Boolean);

  if (!names.length) return "TBC";
  return names.map(initialsFromName).filter(Boolean).join(", ");
}

function vehiclesList(job) {
  const sources = [
    ...(Array.isArray(job?.vehicles) ? job.vehicles : []),
    ...(Array.isArray(job?.equipment) ? job.equipment : []),
    ...(Array.isArray(job?.selectedVehicles) ? job.selectedVehicles : []),
    ...(Array.isArray(job?.selectedEquipment) ? job.selectedEquipment : []),
  ];

  const names = sources
    .map((item) => item?.name || item?.vehicleName || item?.equipmentName || item?.registration || item)
    .filter(Boolean);

  if (!names.length) return "TBC";
  return Array.from(new Set(names)).join(", ");
}

function SectionTable({ title, jobs }) {
  return (
    <section style={surface}>
      <div
        className={layoutStyles.extracted1}
      >
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: UI.text }}>{title}</h2>
        <span style={chip}>{jobs.length}</span>
      </div>
      <div style={tableWrap}>
        <table className={layoutStyles.extracted2}>
          <colgroup>
            <col className={layoutStyles.extracted3} />
            <col className={layoutStyles.extracted4} />
            <col />
            <col className={layoutStyles.extracted5} />
            <col className={layoutStyles.extracted6} />
            <col className={layoutStyles.extracted7} />
            <col className={layoutStyles.extracted8} />
            <col className={layoutStyles.extracted9} />
          </colgroup>
          <thead>
            <tr>
              <th style={th}>Job #</th>
              <th style={th}>Client</th>
              <th style={th}>Location</th>
              <th style={th}>Dates</th>
              <th style={th}>Crew</th>
              <th style={th}>Vehicles / Kit</th>
              <th style={th}>Status</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const dates = normaliseDates(job);
              return (
                <tr className="finance-row" key={job.id}>
                  <td style={td}>
                    <Link
                      href={`/job-numbers/${job.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        maxWidth: "100%",
                        borderRadius: 999,
                        border: `1px solid ${UI.border}`,
                        background: UI.brandSoft,
                        color: UI.brand,
                        fontSize: 12,
                        fontWeight: 900,
                        padding: "4px 8px",
                        textDecoration: "none",
                      }}
                    >
                      #{job.jobNumber || "TBC"}
                    </Link>
                  </td>
                  <td style={{ ...td, ...nowrap }}>{job.client || job.clientName || "Unknown client"}</td>
                  <td style={{ ...td, ...nowrap, color: UI.muted }}>
                    {job.location || job.locationName || "Location TBC"}
                  </td>
                  <td style={{ ...td, ...nowrap }}>{dateRangeLabel(dates)}</td>
                  <td style={{ ...td, ...nowrap, color: UI.muted }}>{crewInitials(job)}</td>
                  <td style={{ ...td, ...nowrap, color: UI.muted }}>{vehiclesList(job)}</td>
                  <td style={td}>
                    <StatusBadge status={job.invoiceStatus || job.financeStatus || job.status} />
                  </td>
                  <td style={td}>
                    <Link
                      href={`/job-summary/${job.id}`}
                      style={{
                        ...btn,
                        height: 30,
                        padding: "0 10px",
                        color: UI.brand,
                        justifyContent: "space-between",
                      }}
                    >
                      Invoice
                      <ChevronRight size={13} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function FinanceQueuePage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useSessionState("finance-queue:search", "");
  const [clientFilter, setClientFilter] = useSessionState("finance-queue:clientFilter", "all");
  const searchRef = useRef(null);
  useSessionScroll("finance-queue");

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "load finance queue bookings" });
      setBookings([]);
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      tenantCollectionQuery(db, "bookings", dataAccessState),
      (snapshot) => {
        setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error("Finance queue failed to load bookings", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [accessKey, dataAccessState]);

  const financeJobs = useMemo(() => {
    return bookings
      .filter(isFourDigitJob)
      .filter((job) => !isPaid(job))
      .filter(isReadyToInvoice)
      .sort((a, b) => {
        const aDates = normaliseDates(a);
        const bDates = normaliseDates(b);
        const aLast = aDates[aDates.length - 1]?.end || aDates[0]?.start || new Date(0);
        const bLast = bDates[bDates.length - 1]?.end || bDates[0]?.start || new Date(0);
        return bLast - aLast;
      });
  }, [bookings]);

  const clients = useMemo(() => {
    const unique = new Set(
      financeJobs
        .map((job) => job.client || job.clientName)
        .filter(Boolean)
        .map((name) => String(name).trim())
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [financeJobs]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return financeJobs.filter((job) => {
      const client = job.client || job.clientName || "";
      const matchesClient = clientFilter === "all" || client === clientFilter;
      const haystack = [
        job.jobNumber,
        client,
        job.location,
        job.locationName,
        job.notes,
        job.status,
        job.invoiceStatus,
        job.financeStatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesClient && (!term || haystack.includes(term));
    });
  }, [clientFilter, financeJobs, search]);

  const groupedJobs = useMemo(() => {
    const dated = new Map();
    const noDate = [];

    filteredJobs.forEach((job) => {
      const dates = normaliseDates(job);
      if (!dates.length) {
        noDate.push(job);
        return;
      }

      const monday = getMonday(dates[0].start);
      const key = monday.toISOString().slice(0, 10);
      if (!dated.has(key)) dated.set(key, { monday, jobs: [] });
      dated.get(key).jobs.push(job);
    });

    const sections = Array.from(dated.values())
      .sort((a, b) => b.monday - a.monday)
      .map((section) => ({
        title: formatWeekRange(section.monday),
        jobs: section.jobs,
      }));

    if (noDate.length) sections.push({ title: "Dates TBC", jobs: noDate });
    return sections;
  }, [filteredJobs]);

  const filtersActive = Boolean(search.trim() || clientFilter !== "all");

  function resetFilters() {
    setSearch("");
    setClientFilter("all");
    searchRef.current?.focus();
  }

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>
      <div style={pageWrap}>
        <header className={`finance-header ${layoutStyles.extracted10}`} >
          <div>
            <h1 style={h1}>Finance Queue</h1>
          </div>
          <div
            className={`finance-actions ${layoutStyles.extracted11}`}
            
          >
            <Link href="/job-home" style={primaryBtn}>
              <Home size={14} />
              Jobs Home
            </Link>
            <span style={chip}>
              <Receipt size={14} />
              {financeJobs.length} jobs
            </span>
          </div>
        </header>

        <section className="finance-toolbar" style={toolbar}>
          <label className={layoutStyles.extracted12}>
            <Search
              size={16}
              style={{ position: "absolute", left: 12, top: 10, color: UI.muted, pointerEvents: "none" }}
            />
            <input
              ref={searchRef}
              className="finance-control"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by job #, client, location or notes..."
              style={{ ...inputStyle, paddingLeft: 36 }}
            />
          </label>
          <select
            className="finance-control"
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
            style={inputStyle}
          >
            <option value="all">Client: All</option>
            {clients.map((client) => (
              <option key={client} value={client}>
                {client}
              </option>
            ))}
          </select>
          <button type="button" onClick={resetFilters} disabled={!filtersActive} style={btn}>
            <RotateCcw size={14} />
            Reset
          </button>
        </section>

        {loading ? (
          <section style={{ ...surface, padding: 14, fontWeight: 900, color: UI.muted }}>
            Loading finance queue...
          </section>
        ) : groupedJobs.length ? (
          groupedJobs.map((section) => (
            <SectionTable key={section.title} title={section.title} jobs={section.jobs} />
          ))
        ) : (
          <section style={{ ...surface, padding: 14, fontWeight: 900, color: UI.muted }}>
            No jobs are ready to invoice.
          </section>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
