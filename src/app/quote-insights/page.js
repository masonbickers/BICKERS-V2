"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { AlertTriangle, BarChart3, CheckCircle2, FileSpreadsheet, PoundSterling } from "lucide-react";
import { auth } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { BusinessPage, BusinessPageHeader } from "@/app/components/BusinessPage";
import styles from "./page.module.css";

const money = (value) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value || 0));
const monthLabel = (value) => /^\d{4}-\d{2}$/.test(String(value || ""))
  ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`))
  : value;

function Ranking({ title, rows, labelKey, empty, meta }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {!rows.length ? <p className={styles.muted}>{empty}</p> : rows.slice(0, 10).map((row) => (
        <div className={styles.rank} key={row[labelKey]}>
          <div className={styles.rankHeader}><span>{row[labelKey]}{meta ? <small> · {meta(row)}</small> : null}</span><strong>{money(row.value)}</strong></div>
          <div className={styles.track}><span style={{ width: `${Math.max(2, Math.abs(row.value) / max * 100)}%` }} /></div>
        </div>
      ))}
    </section>
  );
}

function CommercialTimeline({ rows = [] }) {
  const datedRows = rows.filter((row) => row.month !== "Unknown");
  const max = Math.max(...datedRows.map((row) => Number(row.value || 0)), 1);
  return (
    <section className={`${styles.panel} ${styles.timelinePanel}`}>
      <div className={styles.timelineHeader}>
        <div>
          <h2>Commercial timeline</h2>
          <p className={styles.muted}>Confirmed work and Pencil pipeline plotted across the selected future horizon.</p>
        </div>
        <div className={styles.timelineLegend} aria-label="Timeline categories">
          <span><i className={styles.confirmedDot} />Confirmed</span>
          <span><i className={styles.pencilDot} />Pencil</span>
          <span><i className={styles.completeDot} />Complete</span>
        </div>
      </div>
      {!datedRows.length ? <p className={styles.muted}>No dated commercial work matches this timeline.</p> : (
        <div className={styles.timelineRows}>
          {datedRows.map((row) => {
            const confirmedWidth = Number(row.confirmed || 0) / max * 100;
            const pencilWidth = Number(row.pencil || 0) / max * 100;
            const completeWidth = Number(row.complete || 0) / max * 100;
            return (
              <div className={styles.timelineRow} key={row.month}>
                <strong>{monthLabel(row.month)}</strong>
                <div className={styles.timelineTrack} title={`${row.jobs} jobs · ${money(row.value)}`}>
                  <span className={styles.confirmedBar} style={{ width: `${confirmedWidth}%` }} />
                  <span className={styles.pencilBar} style={{ width: `${pencilWidth}%` }} />
                  <span className={styles.completeBar} style={{ width: `${completeWidth}%` }} />
                </div>
                <span><b>{money(row.value)}</b><small>{row.jobs} {row.jobs === 1 ? "job" : "jobs"}</small></span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function QuoteInsightsPage() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [period, setPeriod] = useState("all");
  const [status, setStatus] = useState("all");
  const [includeFuture, setIncludeFuture] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      setState((current) => ({ ...current, loading: true, error: "" }));
      const response = await fetch(`/api/quote-insights?period=${encodeURIComponent(period)}&status=${encodeURIComponent(status)}&includeFuture=${includeFuture}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Quote insights are unavailable.");
      setState({ loading: false, data, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error.message || "Quote insights are unavailable." });
    }
  }), [period, status, includeFuture]);

  const data = state.data;
  const totals = data?.insights?.totals || {};
  const quoteRows = useMemo(() => (data?.insights?.quoteRows || []).filter((row) => `${row.jobNumber} ${row.quoteNumber} ${row.client} ${row.production} ${row.serviceDescription} ${row.vehicles?.join(" ")}`.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const cards = [
    { label: "Complete revenue", value: money(totals.completedRevenue), note: "Complete bookings treated as invoiced", icon: PoundSterling },
    { label: "Confirmed value", value: money(totals.confirmedValue), note: "Confirmed work not yet complete", icon: CheckCircle2 },
    { label: "Pencil pipeline", value: money(totals.pencilValue), note: "First Pencil quote value", icon: FileSpreadsheet },
    { label: "Average booking", value: money(totals.averageBookingValue), note: `${totals.selectedBookings || 0} bookings in this view`, icon: BarChart3 },
    { label: "Average complete job", value: money(totals.averageCompletedValue), note: "Average invoiced value from Complete jobs", icon: PoundSterling },
    { label: "Exact-match coverage", value: `${data?.extractionCoverage || 0}%`, note: `${totals.exactMatchDocuments || 0} exact files · ${totals.reviewDocuments || 0} excluded for review`, icon: BarChart3 },
  ];

  return (
    <HeaderSidebarLayout>
      <BusinessPage>
        <BusinessPageHeader title="Quote & Revenue Insights" subtitle="Structured insight from all quotes—past, current and future—across vehicles, equipment, labour and travel." />
        {state.loading ? <div className={styles.notice}>Loading quote data…</div> : null}
        {state.error ? <div className={`${styles.notice} ${styles.error}`}><AlertTriangle size={18} />{state.error}</div> : null}
        {data ? <>
          <div className={styles.definition}>
            <strong>100% job-match rule:</strong> a quote counts only when the booking job, workbook Job No, filename quote and workbook quote reference all match exactly. Complete = invoiced revenue, Confirmed = confirmed value and First Pencil = pipeline. Revisions collapse to the latest revision.
          </div>
          <div className={styles.toolbar}>
            <label>Timeline<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">All time</option><option value="future">All future work</option><option value="future30">Next 30 days</option><option value="future90">Next 90 days</option><option value="future365">Next 12 months</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="ytd">Year to date</option>{(data.availableYears || []).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="complete">Complete / invoiced</option><option value="confirmed">Confirmed</option><option value="pencil">First Pencil</option></select></label>
            <label className={styles.search}>Search quotes<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Job, quote, client, vehicle…" /></label>
            <button className={`${styles.futureToggle} ${includeFuture ? styles.futureOn : ""}`} type="button" aria-pressed={includeFuture} onClick={() => { setIncludeFuture((current) => !current); if (period.startsWith("future")) setPeriod("all"); }}>
              {includeFuture ? "Remove future work" : "Include future work"}
            </button>
          </div>
          <div className={styles.cards}>{cards.map(({ label, value, note, icon: Icon }) => <article className={styles.card} key={label}><Icon size={20} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
          {totals.ambiguousBookings ? <div className={`${styles.notice} ${styles.warning}`}><AlertTriangle size={18} /><strong>{totals.ambiguousBookings} bookings</strong> have multiple quote numbers; the latest/highest quote number is currently used.</div> : null}
          <CommercialTimeline rows={data.insights.timeline || []} />
          <div className={styles.grid}>
            <Ranking title="Quoted value by client" rows={data.insights.byClient || []} labelKey="client" empty="Extracted client totals will appear after the historical backfill." />
            <Ranking title="Vehicle totals" rows={data.insights.byVehicle || []} labelKey="vehicle" meta={(row) => `${row.bookings} jobs · avg ${money(row.average)}`} empty="Vehicle line items will appear after extraction and classification." />
            <Ranking title="Quoted value by cost type" rows={data.insights.byCategory || []} labelKey="category" empty="Equipment, labour and travel splits will appear after extraction." />
            <Ranking title="Quoted value by booking month" rows={data.insights.byMonth || []} labelKey="month" empty="Monthly quote trends will appear after extraction." />
          </div>
          <section className={`${styles.panel} ${styles.fullTable}`}>
            <h2>Full extracted quote information</h2>
            <p className={styles.muted}>{quoteRows.length} selected booking quotes match this view.</p>
            <div className={styles.tableWrap}><table><thead><tr><th>Work date</th><th>Job / quote</th><th>Status</th><th>Client / production</th><th>Service / vehicles</th><th>Cost split</th><th>Total</th></tr></thead><tbody>{quoteRows.map((row) => <tr key={row.id}><td>{row.bookingDate || "—"}{row.dateSource === "quote timeline" ? <><br/><small>Quote timeline</small></> : null}</td><td><strong>{row.jobNumber}</strong><br/><small>{row.quoteNumber}{row.revision ? ` rev ${row.revision}` : ""}</small></td><td><span className={styles.status}>{row.status}</span></td><td>{row.client}<br/><small>{row.production || row.location}</small></td><td>{row.serviceDescription || "—"}<br/><small>{row.vehicles?.join(", ") || "No vehicle line classified"}</small></td><td>{Object.entries(row.categoryTotals || {}).filter(([, value]) => value).map(([key, value]) => <small className={styles.split} key={key}>{key}: {money(value)}</small>)}</td><td><strong>{money(row.total)}</strong></td></tr>)}</tbody></table></div>
          </section>
        </> : null}
      </BusinessPage>
    </HeaderSidebarLayout>
  );
}
