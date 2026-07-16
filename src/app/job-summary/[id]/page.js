"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { format } from "date-fns";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* ───────────────────────────────────────────
   Mini design system (same look & feel)
─────────────────────────────────────────── */
const UI = UI_TOKENS;
const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-surface-hover)", color: UI.text, fontSize: 12, fontWeight: 700 };
const sectionTitle = { fontWeight: 900, fontSize: 16, marginBottom: 8 };
const label = { color: "var(--color-text-muted)", fontSize: 12, fontWeight: 800, textTransform: "uppercase" };

const btn = (variant = "default") => ({
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  border: "1px solid var(--color-border)",
  background: variant === "primary" ? "var(--shell-sidebar-bg)" :
             variant === "warn" ? "var(--color-warning-soft)" :
             "var(--color-surface)",
  color: variant === "primary" ? "var(--color-white)" :
         variant === "warn" ? "var(--color-danger-hover)" :
         UI.text,
});
const btnBar = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

/* ───────────────────────────────────────────
   Helpers
─────────────────────────────────────────── */
const parseDate = (raw) => {
  if (!raw) return null;
  try {
    if (typeof raw?.toDate === "function") return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};
const normaliseDates = (job) => {
  const arr = [];
  if (Array.isArray(job?.bookingDates) && job.bookingDates.length) {
    for (const d of job.bookingDates) {
      const pd = parseDate(d);
      if (pd) arr.push(pd);
    }
  } else if (job?.date) {
    const pd = parseDate(job.date);
    if (pd) arr.push(pd);
  }
  return arr.sort((a, b) => a - b);
};
const fmtShort = (d) =>
  d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const dateRangeLabel = (job) => {
  const ds = normaliseDates(job);
  if (!ds.length) return "TBC";
  const first = ds[0];
  const last = ds[ds.length - 1];
  return first && last ? `${fmtShort(first)} – ${fmtShort(last)}` : fmtShort(first);
};
const prettifyStatus = (raw) => {
  const s = (raw || "").toLowerCase().trim();
  if (/ready\s*[-_\s]*to\s*[-_\s]*invoice/.test(s)) return "Ready to Invoice";
  if (s === "invoiced") return "Invoiced";
  if (s === "paid" || s === "settled") return "Paid";
  if (s === "complete" || s === "completed") return "Complete";
  if (s.includes("action")) return "Action Required";
  if (s === "confirmed") return "Confirmed";
  if (s === "first pencil") return "First Pencil";
  if (s === "second pencil") return "Second Pencil";
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase()) || "TBC";
};
const statusColors = (label) => {
  switch (label) {
    case "Ready to Invoice":
      return { bg: "var(--color-accent-soft)", border: "var(--color-warning-border)", text: "var(--color-warning)" };
    case "Invoiced":
      return { bg: "var(--color-brand-soft)", border: "var(--color-info-border)", text: "var(--color-brand)" };
    case "Paid":
      return { bg: "var(--color-border)", border: "var(--color-success-border)", text: "var(--color-success)" };
    case "Action Required":
      return { bg: "var(--color-accent-soft)", border: "var(--color-danger-border)", text: "var(--color-danger)" };
    case "Complete":
      return { bg: "var(--color-success-border)", border: "var(--color-success-accent)", text: "var(--color-text)" };
    case "Confirmed":
      return { bg: "var(--color-warning-border)", border: "var(--color-success-accent)", text: "var(--color-danger-hover)" };
    case "First Pencil":
      return { bg: "var(--shell-muted)", border: "var(--color-info)", text: "var(--color-info)" };
    case "Second Pencil":
      return { bg: "var(--color-warning-border)", border: "var(--color-warning)", text: "var(--color-danger)" };
    case "TBC":
      return { bg: "var(--color-canvas)", border: "var(--color-border)", text: "var(--color-text-muted)" };
    default:
      return { bg: "var(--shell-muted)", border: "var(--color-brand-hover)", text: "var(--color-text)" };
  }
};
const StatusBadge = ({ value }) => {
  const c = statusColors(value);
  return (
    <span
      style={{
        padding: "6px 10px",
        fontSize: 11,
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
};
const crewFullNames = (employees) =>
  Array.isArray(employees) && employees.length
    ? employees
        .map((e) =>
          typeof e === "string"
            ? e
            : e?.name || e?.displayName || e?.email || ""
        )
        .filter(Boolean)
        .join(", ")
    : "—";

/* ───────────────────────────────────────────
   Timesheet helpers (table renderer)
─────────────────────────────────────────── */
const normalizeQuoteVersions = (job = {}) => {
  const versions = Array.isArray(job.quoteVersions)
    ? job.quoteVersions.filter((entry) => entry && typeof entry === "object")
    : [];
  const legacyQuote = job.quote && typeof job.quote === "object" && !versions.length ? [job.quote] : [];
  return [...versions, ...legacyQuote];
};

const quoteDisplayName = (quote = {}) => {
  const name = String(quote.quoteName || quote.displayName || "").trim();
  if (name) return name;
  return String(quote.templateName || quote.templateFile || "").trim() || "Unnamed quote";
};

const minutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const minutesToHours = (m) => m / 60;
const getHours = (entry) => {
  const mode = String(entry?.mode ?? "").toLowerCase();
  if (mode === "off" || !mode) return 0;
  if (mode === "yard" && Array.isArray(entry.yardSegments)) {
    return entry.yardSegments.reduce((tot, seg) => {
      const s = minutes(seg.start);
      const e = minutes(seg.end);
      return e > s ? tot + minutesToHours(e - s) : tot;
    }, 0);
  }
  if (entry.leaveTime && (entry.arriveBack || entry.arriveTime)) {
    const start = minutes(entry.leaveTime);
    const end = minutes(entry.arriveBack || entry.arriveTime);
    let diff = end - start;
    if (diff < 0) diff += 24 * 60;
    return minutesToHours(diff);
  }
  if (mode === "onset" || mode === "travel") return 8.5;
  return 0;
};

const TimesheetCard = ({ ts, job }) => {
  const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const ws = ts.weekStart ? new Date(ts.weekStart) : null;

  // ISO by day for easy comparison to bookingDates (stored as 'YYYY-MM-DD')
  const isoByDay = {};
  if (ws && !isNaN(ws)) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      isoByDay[dayOrder[i]] = d.toISOString().slice(0, 10);
    }
  }

  const jobDates = new Set(Array.isArray(job.bookingDates) ? job.bookingDates : []);
  const snapshotByDay = ts.jobSnapshot?.byDay || {};
  const dayMap = ts.days || {};

  const isRelevant = (day) => {
    const entry = dayMap[day] || {};
    const iso = isoByDay[day];
    const explicitlyLinked = entry?.bookingId === job.id;
    const snapshotHas = Array.isArray(snapshotByDay[day]) && snapshotByDay[day].some((b) => b.bookingId === job.id);
    const isSameDate = iso && jobDates.has(iso);
    return explicitlyLinked || snapshotHas || isSameDate;
  };

  const rows = dayOrder
    .filter(isRelevant)
    .map((day) => {
      const entry = dayMap[day] || {};
      const iso = isoByDay[day] || "—";
      let mode = String(entry?.mode ?? entry?.type ?? "").toLowerCase();
      const hours = getHours(entry);
      if (!mode && (entry?.bookingId === job.id || (Array.isArray(snapshotByDay[day]) && snapshotByDay[day].some((b) => b.bookingId === job.id)))) {
        mode = "onset";
      }
      const label =
        mode === "holiday" ? "HOL" :
        mode === "yard" ? (entry?.bookingId === job.id ? "Yard*" : "Yard") :
        mode === "travel" ? (entry?.bookingId === job.id ? "Travel*" : "Travel") :
        mode === "onset" || mode === "set" || mode === "work" ? (entry?.bookingId === job.id ? "Set*" : "Set") :
        mode || "OFF";
      return { day, iso, entry, hours, modeLabel: label };
    });

  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + (isFinite(r.hours) ? r.hours : 0), 0);

  const tableWrap = { overflowX: "auto", border: UI.border, borderRadius: 8 };
  const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13, tableLayout: "fixed" };
  const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface-subtle)", position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", borderBottom: "1px solid var(--color-surface-hover)", verticalAlign: "top", overflow: "hidden", textOverflow: "ellipsis" };
  const tdRight = { ...td, textAlign: "right", whiteSpace: "nowrap" };
  const dayCell = { ...td, fontWeight: 700, whiteSpace: "nowrap" };
  const foot = { ...tdRight, fontWeight: 800, background: "var(--color-surface-subtle)" };

  return (
    <div style={{ border: UI.border, borderRadius: 12, background: ts.submitted ? "var(--color-surface-subtle)" : "var(--color-warning-soft)", padding: 12 }}>
      <div className={layoutStyles.extracted1}>
        <div className={layoutStyles.extracted2}>Week of {ws ? format(ws, "dd/MM/yyyy") : "—"}</div>
        <div style={{ color: UI.muted, fontSize: 13 }}>
          Emp: <b>{ts.employeeName || ts.employeeCode || "—"}</b>
        </div>
        <div className={layoutStyles.extracted3}>
          <span style={chip}>{ts.submitted ? "Submitted" : "Draft"}</span>
        </div>
        <a
          href={`/timesheet/${ts.id || `${ts.employeeCode}_${ts.weekStart}`}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: 8, fontSize: 12, textDecoration: "none", fontWeight: 800, color: UI.brand }}
        >
          Open →
        </a>
      </div>

      <div style={tableWrap}>
        <table style={table}>
          <colgroup>
            <col className={layoutStyles.extracted4} />
            <col className={layoutStyles.extracted5} />
            <col className={layoutStyles.extracted6} />
            <col className={layoutStyles.extracted7} />
            <col className={layoutStyles.extracted8} />
            <col className={layoutStyles.extracted9} />
            <col className={layoutStyles.extracted10} />
            <col /> {/* Notes grow */}
            <col className={layoutStyles.extracted11} />
          </colgroup>
          <thead>
            <tr>
              <th style={th}>Day</th>
              <th style={th}>Date</th>
              <th style={th}>Mode</th>
              <th style={th}>Leave</th>
              <th style={th}>Arrive</th>
              <th style={th}>Wrap</th>
              <th style={th}>Arrive Back</th>
              <th style={th}>Notes</th>
              <th style={{ ...th, textAlign: "right" }}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ day, iso, entry, modeLabel, hours }) => (
              <tr key={day}>
                <td style={dayCell}>{day.slice(0, 3)}</td>
                <td style={td}>{iso}</td>
                <td style={td}>{modeLabel}</td>
                <td style={td}>{entry?.leaveTime || "—"}</td>
                <td style={td}>{entry?.arriveTime || "—"}</td>
                <td style={td}>{entry?.wrapTime || "—"}</td>
                <td style={td}>{entry?.arriveBack || "—"}</td>
                <td style={{ ...td, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {entry?.dayNotes || "—"}
                </td>
                <td style={tdRight}>{hours ? hours.toFixed(1) : "0.0"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8} style={{ ...foot, textAlign: "right" }}>Total</td>
              <td style={foot}>{total.toFixed(1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

/* ───────────────────────────────────────────
   Page
─────────────────────────────────────────── */
export default function JobSummaryWithTimesheetsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id;
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timesheets, setTimesheets] = useState([]);
  const [saving, setSaving] = useState(false);

  // live job
  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(doc(db, "bookings", jobId), (snap) => {
      setJob(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
      setLoading(false);
    });
    return () => unsub?.();
  }, [jobId]);

  // fetch + filter timesheets
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "timesheets", operation: "Load job summary timesheets" })) return;

    const run = async () => {
      try {
        const tsSnap = await getDocs(tenantCollectionQuery(db, "timesheets", dataAccessState));
        const all = tsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

        const filtered = all.filter((ts) => {
          const linked = new Set();
          if (ts.jobId) linked.add(ts.jobId);
          if (ts.jobSnapshot?.bookingIds?.length) ts.jobSnapshot.bookingIds.forEach((b) => linked.add(b));
          if (ts.days) Object.values(ts.days).forEach((e) => e?.bookingId && linked.add(e.bookingId));
          return linked.has(jobId);
        });

        filtered.sort((a, b) => {
          const ta = new Date(a.weekStart || 0).getTime();
          const tb = new Date(b.weekStart || 0).getTime();
          return tb - ta;
        });

        setTimesheets(filtered);
      } catch (e) {
        console.error("Failed to load timesheets", e);
      }
    };
    if (jobId) run();
  }, [accessKey, dataAccessState, jobId]);

  const prettyStatus = useMemo(() => prettifyStatus(job?.status), [job]);
  const dateLabel = useMemo(() => dateRangeLabel(job || {}), [job]);
  const quoteOptions = useMemo(() => normalizeQuoteVersions(job || {}), [job]);
  const acceptedQuoteNumber = String(job?.acceptedQuoteNumber || job?.quoteNumber || "").trim();

  const notesBlob = useMemo(() => {
    if (!job) return "";
    const blob = [job.jobNotes, job.notes, job.generalNotes].filter(Boolean).join("\n\n");
    return blob;
  }, [job]);

  // ── ACTIONS
  const safeUpdate = async (updates, successMessage = "Saved.") => {
    if (!jobId) return;
    try {
      setSaving(true);
      await updateDoc(doc(db, "bookings", jobId), tenantPayload(dataAccessState, {
        ...updates,
        updatedAt: serverTimestamp(),
      }));
      alert(successMessage);
    } catch (e) {
      console.error(e);
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const markInvoiced = () =>
    safeUpdate(
      { status: "Invoiced", readyToInvoice: false },
      "Marked as Invoiced."
    );

  const markNeedsAction = () =>
    safeUpdate({ status: "Action Required" }, "Marked as Needs Action.");

  const saveAcceptedQuote = (quoteNumber) => {
    const selectedQuote = quoteOptions.find(
      (quote) => String(quote.quoteNumber || "").trim() === String(quoteNumber || "").trim()
    );
    if (!selectedQuote) return;
    safeUpdate(
      {
        acceptedQuoteNumber: selectedQuote.quoteNumber || "",
        acceptedQuoteName: quoteDisplayName(selectedQuote),
      },
      "Accepted quote saved."
    );
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div className={layoutStyles.extracted12}>
          <div>
            <h1 style={h1}>{loading ? "Loading…" : job ? `Job #${job.jobNumber || job.id}` : "Not found"}</h1>
            {job && (
              <div style={sub}>
                {job.client || "—"} {job.location ? <span>• {job.location}</span> : null}
              </div>
            )}
          </div>

          {/* Right side status chips */}
          {job && (
            <div className={layoutStyles.extracted13}>
              <span style={chip}>{dateLabel}</span>
              <StatusBadge value={prettyStatus} />
              {job.readyToInvoice ? (
                <span style={{ ...chip, background: "var(--color-accent-soft)", borderColor: "var(--color-warning-border)", color: "var(--color-warning)" }}>
                  Ready to Invoice
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Actions toolbar */}
        {job && (
          <div style={{ ...surface, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className={layoutStyles.extracted14}>
              <button
                type="button"
                onClick={() => router.back()}
                style={btn()}
                disabled={saving}
                aria-label="Go back"
              >
                ← Back
              </button>
            </div>
            <div className={layoutStyles.extracted15}>
              <button
                type="button"
                onClick={markNeedsAction}
                style={btn("warn")}
                disabled={saving}
                aria-label="Mark as Needs Action"
                title="Set status to Action Required"
              >
                Needs Action
              </button>
              <button
                type="button"
                onClick={markInvoiced}
                style={btn("primary")}
                disabled={saving}
                aria-label="Mark as Invoiced"
                title="Set status to Invoiced and clear Ready to Invoice"
              >
                {saving ? "Saving…" : "Mark Invoiced"}
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div style={{ ...surface, padding: 16 }}>Loading job…</div>
        ) : !job ? (
          <div style={{ ...surface, padding: 16 }}>This job could not be found.</div>
        ) : (
          <div className={layoutStyles.extracted16}>
            {/* LEFT: Overview + Timesheets + Notes */}
            <div className={layoutStyles.extracted17}>
              {/* Overview */}
              <div style={{ ...surface, padding: 14 }}>
                <div className={layoutStyles.extracted18}>Overview</div>
                <div className={layoutStyles.extracted19}>
                  <div className={layoutStyles.extracted20}>Client</div>
                  <div>{job.client || "—"}</div>
                  <div className={layoutStyles.extracted21}>Location</div>
                  <div>{job.location || "—"}</div>
                  <div className={layoutStyles.extracted22}>Dates</div>
                  <div>{dateLabel}</div>
                  <div className={layoutStyles.extracted23}>Status</div>
                  <div><StatusBadge value={prettyStatus} /></div>
                  <div className={layoutStyles.extracted24}>Job Prefix</div>
                  <div>{job.jobNumber ? String(job.jobNumber).split("-")[0] : "—"}</div>
                  <div className={layoutStyles.extracted25}>Reference / PO</div>
                  <div>{job.poNumber || job.purchaseOrder || job.reference || job.po || "—"}</div>
                  <div className={layoutStyles.extracted26}>Vehicles</div>
                  <div>{Array.isArray(job.vehicles) && job.vehicles.length ? job.vehicles.map((v) => (typeof v === "string" ? v : v?.name || v?.registration || "")).filter(Boolean).join(", ") : "—"}</div>
                  <div className={layoutStyles.extracted27}>Crew</div>
                  <div>{crewFullNames(job.employees)}</div>
                </div>
              </div>

              {/* Timesheets */}
              <div style={{ ...surface, padding: 14 }}>
                <div className={layoutStyles.extracted28}>
                  Linked Timesheets{" "}
                  <span style={{ color: UI.muted, fontWeight: 600, fontSize: 13 }}>({timesheets.length})</span>
                </div>
                {timesheets.length ? (
                  <div className={layoutStyles.extracted29}>
                    {timesheets.map((ts) => (
                      <TimesheetCard key={ts.id} ts={ts} job={job} />
                    ))}
                  </div>
                ) : (
                  <div style={{ color: UI.muted, padding: 10, border: "1px dashed var(--color-border)", borderRadius: 6 }}>
                    No timesheet days linked to this job yet.
                  </div>
                )}
              </div>

              {/* Notes (summary + notesByDate) */}
              <div style={{ ...surface, padding: 14 }}>
                <div className={layoutStyles.extracted30}>Job Summary Notes</div>
                {notesBlob ? (
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 14, background: "var(--color-surface-subtle)", border: UI.border, borderRadius: 8, padding: 10 }}>
                    {notesBlob}
                  </div>
                ) : (
                  <div style={{ color: UI.muted }}>No summary notes.</div>
                )}

                {job.notesByDate && typeof job.notesByDate === "object" && Object.keys(job.notesByDate).length > 0 && (
                  <div className={layoutStyles.extracted31}>
                    {Object.keys(job.notesByDate)
                      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                      .sort()
                      .map((iso) => {
                        const d = new Date(iso);
                        const nice = d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
                        return (
                          <div key={iso} className={layoutStyles.extracted32}>
                            <strong style={{ color: UI.muted }}>{nice}:</strong> {job.notesByDate[iso]}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Details + Attachments */}
            <div className={layoutStyles.extracted33}>
              <div style={{ ...surface, padding: 14 }}>
                <div className={layoutStyles.extracted34}>Details</div>
                <div className={layoutStyles.extracted35}>
                  <div className={layoutStyles.extracted36}>Job ID</div>
                  <div>{job.id}</div>
                  <div className={layoutStyles.extracted37}>Job Number</div>
                  <div>{job.jobNumber || "—"}</div>
                  <div className={layoutStyles.extracted38}>Accepted Quote</div>
                  <div>
                    {quoteOptions.length ? (
                      <select
                        value={acceptedQuoteNumber}
                        onChange={(event) => saveAcceptedQuote(event.target.value)}
                        style={{
                          width: "100%",
                          maxWidth: 420,
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          padding: "7px 9px",
                          fontWeight: 800,
                          color: UI.text,
                          background: "var(--color-surface)",
                        }}
                        disabled={saving}
                      >
                        <option value="">Choose accepted quote</option>
                        {quoteOptions.map((quote) => (
                          <option key={quote.quoteNumber || quote.version || quoteDisplayName(quote)} value={quote.quoteNumber || ""}>
                            {[quote.quoteNumber, quoteDisplayName(quote)].filter(Boolean).join(" - ")}
                          </option>
                        ))}
                      </select>
                    ) : (
                      "â€”"
                    )}
                    {job.acceptedQuoteName ? (
                      <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>{job.acceptedQuoteName}</div>
                    ) : null}
                  </div>
                  <div className={layoutStyles.extracted39}>Contact</div>
                  <div>
                    {job.contactName || "—"}
                    {job.contactEmail ? ` • ${job.contactEmail}` : ""}
                    {job.contactPhone ? ` • ${job.contactPhone}` : ""}
                  </div>
                  <div className={layoutStyles.extracted40}>Created</div>
                  <div>{job.createdAt ? new Date(job.createdAt.seconds ? job.createdAt.seconds * 1000 : job.createdAt).toLocaleString("en-GB") : "—"}</div>
                  <div className={layoutStyles.extracted41}>Last Updated</div>
                  <div>{job.updatedAt ? new Date(job.updatedAt.seconds ? job.updatedAt.seconds * 1000 : job.updatedAt).toLocaleString("en-GB") : "—"}</div>
                </div>
              </div>

              {Array.isArray(job.attachments) && job.attachments.length > 0 && (
                <div style={{ ...surface, padding: 14 }}>
                  <div className={layoutStyles.extracted42}>Attachments</div>
                  <ul className={layoutStyles.extracted43}>
                    {job.attachments.map((a, idx) => (
                      <li key={idx}>
                        {a?.url ? (
                          <a href={a.url} target="_blank" rel="noreferrer" style={{ color: UI.brand, fontWeight: 800, textDecoration: "none" }}>
                            {a?.name || a?.filename || `Attachment ${idx + 1}`}
                          </a>
                        ) : (
                          a?.name || a?.filename || `Attachment ${idx + 1}`
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
