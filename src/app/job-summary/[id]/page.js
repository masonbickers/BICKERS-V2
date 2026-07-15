"use client";

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
import { timesheetDetailPath } from "@/app/utils/timesheetDetail";

/* ───────────────────────────────────────────
   Mini design system (same look & feel)
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  border: "1px solid var(--legacy-color-e5e7eb)",
  bg: "var(--color-surface-subtle)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-subtle)",
  brand: "var(--color-info)",
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
};
const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-4)" };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 };
const sub = { color: UI.muted, fontSize: "var(--font-size-sm)" };
const chip = { padding: "6px 10px", borderRadius: "var(--radius-pill)", border: "1px solid var(--legacy-color-e5e7eb)", background: "var(--legacy-color-f1f5f9)", color: UI.text, fontSize: "var(--font-size-xs)", fontWeight: 700 };
const sectionTitle = { fontWeight: 900, fontSize: "var(--font-size-lg)", marginBottom: "var(--space-2)" };
const label = { color: "var(--legacy-color-6b7280)", fontSize: "var(--font-size-xs)", fontWeight: 800, textTransform: "uppercase" };

const btn = (variant = "default") => ({
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 800,
  fontSize: "var(--font-size-sm)",
  cursor: "pointer",
  border: "1px solid var(--legacy-color-d1d5db)",
  background: variant === "primary" ? "var(--legacy-color-111827)" :
             variant === "warn" ? "var(--color-warning-soft)" :
             "var(--color-white)",
  color: variant === "primary" ? "var(--color-white)" :
         variant === "warn" ? "var(--legacy-color-7c2d12)" :
         UI.text,
});
const btnBar = { display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" };

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
      return { bg: "var(--legacy-color-fef3c7)", border: "var(--legacy-color-fde68a)", text: "var(--legacy-color-92400e)" };
    case "Invoiced":
      return { bg: "var(--legacy-color-e0e7ff)", border: "var(--legacy-color-c7d2fe)", text: "var(--legacy-color-3730a3)" };
    case "Paid":
      return { bg: "var(--legacy-color-d1fae5)", border: "var(--legacy-color-86efac)", text: "var(--legacy-color-065f46)" };
    case "Action Required":
      return { bg: "var(--legacy-color-fee2e2)", border: "var(--color-danger-border)", text: "var(--color-danger)" };
    case "Complete":
      return { bg: "var(--legacy-color-97f59bff)", border: "var(--legacy-color-419e50ff)", text: "var(--legacy-color-10301aff)" };
    case "Confirmed":
      return { bg: "var(--legacy-color-fffd98ff)", border: "var(--legacy-color-c7d134ff)", text: "var(--legacy-color-504c1aff)" };
    case "First Pencil":
      return { bg: "var(--legacy-color-78b8ecff)", border: "var(--legacy-color-2c28ffff)", text: "var(--legacy-color-001affff)" };
    case "Second Pencil":
      return { bg: "var(--legacy-color-fd9a9aff)", border: "var(--legacy-color-f33131ff)", text: "var(--legacy-color-8b1212ff)" };
    case "TBC":
      return { bg: "var(--legacy-color-f3f4f6)", border: "var(--legacy-color-e5e7eb)", text: "var(--legacy-color-374151)" };
    default:
      return { bg: "var(--legacy-color-acacacff)", border: "var(--legacy-color-3f3f3fff)", text: "var(--legacy-color-000000ff)" };
  }
};
const StatusBadge = ({ value }) => {
  const c = statusColors(value);
  return (
    <span
      style={{
        padding: "6px 10px",
        fontSize: 11,
        borderRadius: "var(--radius-pill)",
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

  const tableWrap = { overflowX: "auto", border: UI.border, borderRadius: "var(--radius-md)" };
  const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "var(--font-size-sm)", tableLayout: "fixed" };
  const th = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--legacy-color-e5e7eb)", background: "var(--color-surface-subtle)", position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", borderBottom: "1px solid var(--legacy-color-f1f5f9)", verticalAlign: "top", overflow: "hidden", textOverflow: "ellipsis" };
  const tdRight = { ...td, textAlign: "right", whiteSpace: "nowrap" };
  const dayCell = { ...td, fontWeight: 700, whiteSpace: "nowrap" };
  const foot = { ...tdRight, fontWeight: 800, background: "var(--color-surface-subtle)" };

  return (
    <div style={{ border: UI.border, borderRadius: "var(--radius-lg)", background: ts.submitted ? "var(--legacy-color-f9fafb)" : "var(--color-warning-soft)", padding: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: "var(--space-2)" }}>
        <div style={{ fontSize: "var(--font-size-md)", fontWeight: 900 }}>Week of {ws ? format(ws, "dd/MM/yyyy") : "—"}</div>
        <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)" }}>
          Emp: <b>{ts.employeeName || ts.employeeCode || "—"}</b>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={chip}>{ts.submitted ? "Submitted" : "Draft"}</span>
        </div>
        <a
          href={timesheetDetailPath(ts.id || `${ts.employeeCode}_${ts.weekStart}`)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: "var(--space-2)", fontSize: "var(--font-size-xs)", textDecoration: "none", fontWeight: 800, color: UI.brand }}
        >
          Open →
        </a>
      </div>

      <div style={tableWrap}>
        <table style={table}>
          <colgroup>
            <col style={{ width: 64 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col /> {/* Notes grow */}
            <col style={{ width: 80 }} />
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
        <div style={headerBar}>
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
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span style={chip}>{dateLabel}</span>
              <StatusBadge value={prettyStatus} />
              {job.readyToInvoice ? (
                <span style={{ ...chip, background: "var(--legacy-color-fef3c7)", borderColor: "var(--legacy-color-fde68a)", color: "var(--legacy-color-92400e)" }}>
                  Ready to Invoice
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Actions toolbar */}
        {job && (
          <div style={{ ...surface, padding: "var(--space-3)", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={btnBar}>
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
            <div style={btnBar}>
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
          <div style={{ ...surface, padding: "var(--space-4)" }}>Loading job…</div>
        ) : !job ? (
          <div style={{ ...surface, padding: "var(--space-4)" }}>This job could not be found.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 18 }}>
            {/* LEFT: Overview + Timesheets + Notes */}
            <div style={{ display: "grid", gap: 18 }}>
              {/* Overview */}
              <div style={{ ...surface, padding: 14 }}>
                <div style={sectionTitle}>Overview</div>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: "var(--space-2)", columnGap: "var(--space-3)", fontSize: "var(--font-size-md)" }}>
                  <div style={label}>Client</div>
                  <div>{job.client || "—"}</div>
                  <div style={label}>Location</div>
                  <div>{job.location || "—"}</div>
                  <div style={label}>Dates</div>
                  <div>{dateLabel}</div>
                  <div style={label}>Status</div>
                  <div><StatusBadge value={prettyStatus} /></div>
                  <div style={label}>Job Prefix</div>
                  <div>{job.jobNumber ? String(job.jobNumber).split("-")[0] : "—"}</div>
                  <div style={label}>Reference / PO</div>
                  <div>{job.poNumber || job.purchaseOrder || job.reference || job.po || "—"}</div>
                  <div style={label}>Vehicles</div>
                  <div>{Array.isArray(job.vehicles) && job.vehicles.length ? job.vehicles.map((v) => (typeof v === "string" ? v : v?.name || v?.registration || "")).filter(Boolean).join(", ") : "—"}</div>
                  <div style={label}>Crew</div>
                  <div>{crewFullNames(job.employees)}</div>
                </div>
              </div>

              {/* Timesheets */}
              <div style={{ ...surface, padding: 14 }}>
                <div style={sectionTitle}>
                  Linked Timesheets{" "}
                  <span style={{ color: UI.muted, fontWeight: 600, fontSize: "var(--font-size-sm)" }}>({timesheets.length})</span>
                </div>
                {timesheets.length ? (
                  <div style={{ display: "grid", gap: "var(--space-3)" }}>
                    {timesheets.map((ts) => (
                      <TimesheetCard key={ts.id} ts={ts} job={job} />
                    ))}
                  </div>
                ) : (
                  <div style={{ color: UI.muted, padding: 10, border: "1px dashed var(--legacy-color-d1d5db)", borderRadius: "var(--radius-sm)" }}>
                    No timesheet days linked to this job yet.
                  </div>
                )}
              </div>

              {/* Notes (summary + notesByDate) */}
              <div style={{ ...surface, padding: 14 }}>
                <div style={sectionTitle}>Job Summary Notes</div>
                {notesBlob ? (
                  <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-md)", background: "var(--legacy-color-f9fafb)", border: UI.border, borderRadius: "var(--radius-md)", padding: 10 }}>
                    {notesBlob}
                  </div>
                ) : (
                  <div style={{ color: UI.muted }}>No summary notes.</div>
                )}

                {job.notesByDate && typeof job.notesByDate === "object" && Object.keys(job.notesByDate).length > 0 && (
                  <div style={{ marginTop: "var(--space-3)", display: "grid", gap: 6 }}>
                    {Object.keys(job.notesByDate)
                      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                      .sort()
                      .map((iso) => {
                        const d = new Date(iso);
                        const nice = d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
                        return (
                          <div key={iso} style={{ fontSize: "var(--font-size-sm)" }}>
                            <strong style={{ color: UI.muted }}>{nice}:</strong> {job.notesByDate[iso]}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Details + Attachments */}
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ ...surface, padding: 14 }}>
                <div style={sectionTitle}>Details</div>
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: "var(--space-2)", columnGap: "var(--space-3)", fontSize: "var(--font-size-md)" }}>
                  <div style={label}>Job ID</div>
                  <div>{job.id}</div>
                  <div style={label}>Job Number</div>
                  <div>{job.jobNumber || "—"}</div>
                  <div style={label}>Accepted Quote</div>
                  <div>
                    {quoteOptions.length ? (
                      <select
                        value={acceptedQuoteNumber}
                        onChange={(event) => saveAcceptedQuote(event.target.value)}
                        style={{
                          width: "100%",
                          maxWidth: 420,
                          border: "1px solid var(--legacy-color-d1d5db)",
                          borderRadius: "var(--radius-md)",
                          padding: "7px 9px",
                          fontWeight: 800,
                          color: UI.text,
                          background: "var(--color-white)",
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
                      <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)" }}>{job.acceptedQuoteName}</div>
                    ) : null}
                  </div>
                  <div style={label}>Contact</div>
                  <div>
                    {job.contactName || "—"}
                    {job.contactEmail ? ` • ${job.contactEmail}` : ""}
                    {job.contactPhone ? ` • ${job.contactPhone}` : ""}
                  </div>
                  <div style={label}>Created</div>
                  <div>{job.createdAt ? new Date(job.createdAt.seconds ? job.createdAt.seconds * 1000 : job.createdAt).toLocaleString("en-GB") : "—"}</div>
                  <div style={label}>Last Updated</div>
                  <div>{job.updatedAt ? new Date(job.updatedAt.seconds ? job.updatedAt.seconds * 1000 : job.updatedAt).toLocaleString("en-GB") : "—"}</div>
                </div>
              </div>

              {Array.isArray(job.attachments) && job.attachments.length > 0 && (
                <div style={{ ...surface, padding: 14 }}>
                  <div style={sectionTitle}>Attachments</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--font-size-md)" }}>
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
