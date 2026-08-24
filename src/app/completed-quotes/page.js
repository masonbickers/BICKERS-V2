"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onSnapshot } from "firebase/firestore";
import { Eye, FileText, Home, Pencil, RotateCcw, Search, Settings2 } from "lucide-react";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { OperationsHeaderActions, OperationsPage, OperationsPageHeader } from "@/app/components/OperationsPage";
import { Button, Checkbox, Input, Select } from "@/app/components/ui";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery } from "@/app/utils/firestoreAccess";
import { formatQuoteDate, getCompletedQuoteRows, money, quoteMatchesSearch } from "@/app/utils/completedQuotes";
import { useSessionScroll, useSessionState } from "@/app/utils/useSessionState";
import { UI_TOKENS } from "@/app/utils/uiTokens";

const UI = UI_TOKENS;

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const toolbar = {
  display: "grid",
  gridTemplateColumns: "minmax(250px, 1.15fr) minmax(170px, 1fr) 140px 132px 132px auto auto",
  gap: 8,
  alignItems: "center",
  marginBottom: 16,
};
const titleMd = { fontWeight: 850, fontSize: 17, margin: 0, color: UI.text, letterSpacing: 0 };
const tableWrap = { ...surface, overflow: "auto" };
const th = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid var(--color-border)",
  position: "sticky",
  top: 0,
  background: "var(--color-surface-subtle)",
  zIndex: 1,
  color: UI.muted,
  fontSize: 10.5,
  fontWeight: 900,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const chip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "4px 8px",
    borderRadius: 999,
    border: `1px solid ${UI.brandBorder}`,
    background: UI.brandSoft,
    color: UI.text,
    fontSize: 11.5,
    fontWeight: 850,
    whiteSpace: "nowrap",
  };
  if (kind === "green") return { ...base, borderColor: UI.greenBorder, background: UI.greenSoft, color: UI.green };
  if (kind === "amber") return { ...base, borderColor: UI.amberBorder, background: UI.amberSoft, color: UI.amber };
  if (kind === "red") return { ...base, borderColor: UI.redBorder, background: UI.redSoft, color: UI.var(--color-danger) };
  return base;
};
const actionButton = {
  minHeight: 26,
  padding: "3px 8px",
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.brandBorder}`,
  background: "var(--color-surface)",
  color: UI.text,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  fontSize: 11,
  fontWeight: 850,
  lineHeight: 1,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const statusKind = (status = "") => {
  if (status === "Accepted") return "green";
  if (status === "Sent" || status === "Revised") return "amber";
  if (status === "Lost") return "red";
  return "neutral";
};

const startOfDay = (raw) => {
  const date = new Date(raw);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (raw) => {
  const date = new Date(raw);
  date.setHours(23, 59, 59, 999);
  return date;
};

const getMonday = (raw) => {
  const date = new Date(raw);
  const day = date.getDay();
  date.setDate(date.getDate() + ((day === 0 ? -6 : 1) - day));
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatWeekRange = (monday) => {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} to ${sunday.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
};

export default function CompletedQuotesPage() {
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useSessionState("completed-quotes:search", "");
  const [companyFilter, setCompanyFilter] = useSessionState("completed-quotes:company", "all");
  const [statusFilter, setStatusFilter] = useSessionState("completed-quotes:status", "all");
  const [fromDate, setFromDate] = useSessionState("completed-quotes:from", "");
  const [toDate, setToDate] = useSessionState("completed-quotes:to", "");
  const [hasValueOnly, setHasValueOnly] = useSessionState("completed-quotes:hasValue", false);
  const searchRef = useRef(null);
  useSessionScroll("completed-quotes", !loading);

  useEffect(() => {
    if (String(companyFilter || "").toLowerCase() === "all" && companyFilter !== "all") setCompanyFilter("all");
    if (String(statusFilter || "").toLowerCase() === "all" && statusFilter !== "all") setStatusFilter("all");
  }, [companyFilter, setCompanyFilter, setStatusFilter, statusFilter]);

  useEffect(() => {
    if (!authState?.user) return undefined;
    const unsub = onSnapshot(tenantCollectionQuery(db, "bookings", authState), (snapshot) => {
      setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })));
      setLoading(false);
    });
    return () => unsub();
  }, [accessKey, authState]);

  const rows = useMemo(() => getCompletedQuoteRows(bookings), [bookings]);
  const companies = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((row) => row.client).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows]
  );
  const statuses = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((row) => row.status || "Draft"))).sort()],
    [rows]
  );

  const visibleRows = useMemo(() => {
    const from = fromDate ? startOfDay(fromDate) : null;
    const to = toDate ? endOfDay(toDate) : null;
    const allCompanies = !companyFilter || String(companyFilter).toLowerCase() === "all" || !companies.includes(companyFilter);
    const allStatuses = !statusFilter || String(statusFilter).toLowerCase() === "all" || !statuses.includes(statusFilter);
    return rows
      .filter((row) => {
        if (!allCompanies && row.client !== companyFilter) return false;
        if (!allStatuses && row.status !== statusFilter) return false;
        if (hasValueOnly && !(Number(row.subtotal) > 0)) return false;
        if (from && (!row.savedDate || row.savedDate < from)) return false;
        if (to && (!row.savedDate || row.savedDate > to)) return false;
        return quoteMatchesSearch(row, search);
      })
      .sort((a, b) => (b.savedDate?.getTime() || 0) - (a.savedDate?.getTime() || 0));
  }, [companies, companyFilter, fromDate, hasValueOnly, rows, search, statusFilter, statuses, toDate]);

  const groupedRows = useMemo(() => {
    const weeks = {};
    const noDate = [];
    visibleRows.forEach((row) => {
      if (!row.savedDate) {
        noDate.push(row);
        return;
      }
      const key = getMonday(row.savedDate).getTime();
      if (!weeks[key]) weeks[key] = [];
      weeks[key].push(row);
    });
    return {
      weeks,
      weekKeys: Object.keys(weeks).map(Number).sort((a, b) => b - a),
      noDate,
    };
  }, [visibleRows]);

  const acceptedCount = rows.filter((row) => row.status === "Accepted").length;
  const visibleValue = visibleRows.reduce((sum, row) => sum + (Number(row.subtotal) || 0), 0);

  const resetFilters = () => {
    setSearch("");
    setCompanyFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setHasValueOnly(false);
    searchRef.current?.focus();
  };

  const QuoteTable = ({ quotes, label }) => (
    <div style={tableWrap}>
      <table className={layoutStyles.quoteTable} aria-label={label}>
        <colgroup>
          <col className={layoutStyles.quoteColumn} />
          <col className={layoutStyles.jobColumn} />
          <col className={layoutStyles.productionColumn} />
          <col className={layoutStyles.companyColumn} />
          <col />
          <col className={layoutStyles.valueColumn} />
          <col className={layoutStyles.statusColumn} />
          <col className={layoutStyles.savedColumn} />
          <col className={layoutStyles.actionsColumn} />
        </colgroup>
        <thead>
          <tr>
            <th style={th}>Quote</th>
            <th style={th}>Job</th>
            <th style={th}>Production</th>
            <th style={th}>Production Company</th>
            <th style={th}>Description</th>
            <th style={th}>Value</th>
            <th style={th}>Status</th>
            <th style={th}>Saved</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((row) => {
            const quoteQuery = encodeURIComponent(row.quoteNumber || "");
            return (
              <tr key={row.id}>
                <td className={layoutStyles.primaryCell} title={row.label || row.quoteNumber || ""}>
                  <Link href={`/quote-view/${row.bookingId}?quote=${quoteQuery}`} className={layoutStyles.primaryLink}>
                    {row.label || row.displayQuoteNumber || row.quoteNumber || "-"}
                  </Link>
                </td>
                <td className={layoutStyles.primaryCell}>
                  <Link href={`/job-numbers/${row.bookingId}`} className={layoutStyles.jobLink}>#{row.jobNumber || "-"}</Link>
                </td>
                <td className={layoutStyles.textCell} title={row.production || ""}>{row.production || "-"}</td>
                <td className={layoutStyles.textCell} title={row.client || ""}>{row.client || "-"}</td>
                <td className={layoutStyles.textCell} title={row.quoteName || row.templateName || row.location || ""}>{row.quoteName || row.templateName || row.location || "-"}</td>
                <td className={layoutStyles.valueCell}>{row.subtotal > 0 ? `£${money(row.subtotal)}` : "-"}</td>
                <td className={layoutStyles.statusCell}><span style={chip(statusKind(row.status))}>{row.status || "Draft"}</span></td>
                <td className={layoutStyles.savedCell} title={row.savedBy || ""}>{formatQuoteDate(row.savedAt)}</td>
                <td className={layoutStyles.actionsCell}>
                  <div className={layoutStyles.actions}>
                    <Link href={`/quote-view/${row.bookingId}?quote=${quoteQuery}`} style={actionButton}><Eye size={12} /> View</Link>
                    <Link href={`/quote/${row.bookingId}?quote=${quoteQuery}&returnTo=${encodeURIComponent("/completed-quotes")}`} style={actionButton}><Pencil size={12} /> Edit</Link>
                    <Link href={`/job-numbers/${row.bookingId}`} style={actionButton}>Job</Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const QuoteSection = ({ quotes, title }) => (
    <section className={layoutStyles.quoteSection}>
      <div className={layoutStyles.sectionHeading}>
        <h2 style={titleMd}>{title}</h2>
        <div className={layoutStyles.sectionSummary}>
          <span style={chip()}>{quotes.length} quote{quotes.length === 1 ? "" : "s"}</span>
          <span className={layoutStyles.sectionValue}>£{money(quotes.reduce((sum, row) => sum + (Number(row.subtotal) || 0), 0))}</span>
        </div>
      </div>
      <QuoteTable quotes={quotes} label={`${title} quotes`} />
    </section>
  );

  return (
    <HeaderSidebarLayout>
      <OperationsPage>
        <OperationsPageHeader
          title="Completed Quotes"
          subtitle="Search, review and manage saved quotes across every job."
          actions={
            <OperationsHeaderActions>
              <Button as={Link} href="/job-sheet" variant="secondary"><Home size={14} /> Jobs Sheets</Button>
              <Button as={Link} href="/quote-templates" variant="secondary"><Settings2 size={14} /> Quote Templates</Button>
              <div style={chip("green")}><FileText size={13} /> {loading ? "Loading..." : `${visibleRows.length} of ${rows.length} quotes`}</div>
            </OperationsHeaderActions>
          }
        />

        <div className={layoutStyles.summaryStrip}>
          <span><strong>{visibleRows.length}</strong> shown</span>
          <span><strong>{acceptedCount}</strong> accepted overall</span>
          <span><strong>£{money(visibleValue)}</strong> shown value</span>
        </div>

        <div className={layoutStyles.toolbar} style={toolbar}>
          <div className={layoutStyles.searchWrap}>
            <Search size={14} className={layoutStyles.searchIcon} aria-hidden />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quote, job, production, company, location..."
              className={layoutStyles.extracted1}
              aria-label="Search completed quotes"
            />
          </div>
          <Select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} aria-label="Filter by production company">
            {companies.map((company) => <option key={company} value={company}>{company === "all" ? "Production Company: All" : company}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by quote status">
            {statuses.map((status) => <option key={status} value={status}>{status === "all" ? "Status: All" : status}</option>)}
          </Select>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Saved from date" />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Saved to date" />
          <Checkbox label="Has value" checked={hasValueOnly} onChange={(event) => setHasValueOnly(event.target.checked)} />
          <Button variant="secondary" type="button" onClick={resetFilters}><RotateCcw size={13} /> Reset</Button>
        </div>

        {loading ? (
          <div className={layoutStyles.emptyState}>Loading completed quotes...</div>
        ) : visibleRows.length === 0 ? (
          <div className={layoutStyles.emptyState}>No completed quotes match these filters.</div>
        ) : (
          <>
            {groupedRows.weekKeys.map((weekKey) => (
              <QuoteSection key={weekKey} quotes={groupedRows.weeks[weekKey]} title={formatWeekRange(new Date(weekKey))} />
            ))}
            {groupedRows.noDate.length > 0 ? <QuoteSection quotes={groupedRows.noDate} title="No saved date" /> : null}
          </>
        )}
      </OperationsPage>
    </HeaderSidebarLayout>
  );
}
