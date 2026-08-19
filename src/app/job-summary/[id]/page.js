"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
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
import { loadBookingFormReferenceData } from "@/app/utils/bookingFormReferenceData";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import {
  resolveFinanceOwnership,
  resolveFinanceStage,
  resolveOperationalStatus,
} from "@/app/utils/jobSummaryHeader";
import {
  buildFinanceReadiness,
  financeReadinessSummary,
  resolveTimesheetRequirement,
} from "@/app/utils/financeReadiness";
import {
  buildCommercialPosition,
  findAcceptedQuoteSnapshot,
} from "@/app/utils/commercialPosition";
import { Button, Checkbox, Input, Modal, Select, Textarea } from "@/app/components/ui";
import { getFixedJobStatusStyle } from "@/app/utils/jobStatusColors";

/* ───────────────────────────────────────────
   Mini design system (same look & feel)
─────────────────────────────────────────── */
const UI = UI_TOKENS;
const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 };
const sub = { color: UI.muted, fontSize: 13 };
const sectionTitle = { fontWeight: 900, fontSize: 16, marginBottom: 8 };
const label = { color: "var(--color-text-muted)", fontSize: 12, fontWeight: 800, textTransform: "uppercase" };
const RETURN_REASONS = [
  "Missing timesheet",
  "Timesheet discrepancy",
  "Missing PO",
  "Incorrect customer",
  "Quote issue",
  "Crew discrepancy",
  "Vehicle discrepancy",
  "Missing expense evidence",
  "VAT query",
  "Other",
];

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
const vehicleDisplayLabel = (vehicle = {}) => {
  const name = String(vehicle.name || vehicle.vehicleName || vehicle.label || "").trim();
  const registration = String(vehicle.registration || vehicle.reg || "").trim().toUpperCase();
  if (name && registration) return `${name} (${registration})`;
  return name || registration || "";
};
const displayBookingVehicles = (items = [], lookup = {}) => {
  if (!Array.isArray(items) || !items.length) return "—";
  const labels = items
    .map((item) => {
      if (item && typeof item === "object") {
        const key = String(item.id || item.vehicleId || item.registration || item.reg || "").trim();
        return vehicleDisplayLabel(lookup.byId?.[key] || lookup.byReg?.[key.toUpperCase()] || item);
      }
      const key = String(item || "").trim();
      return vehicleDisplayLabel(
        lookup.byId?.[key] ||
          lookup.byReg?.[key.toUpperCase()] ||
          lookup.byName?.[key.toLowerCase()] ||
          {}
      ) || key;
    })
    .filter(Boolean);
  return labels.join(", ") || "—";
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
  return getFixedJobStatusStyle(label);
};
const StatusBadge = ({ value, tone = value }) => {
  const c = statusColors(tone);
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
const resourceNames = (items) =>
  Array.isArray(items) && items.length
    ? items
        .map((item) =>
          typeof item === "string"
            ? item
            : item?.name || item?.displayName || item?.label || item?.assetNumber || item?.serial || ""
        )
        .filter(Boolean)
        .join(", ") || "—"
    : "—";

const arrayValue = (...values) => values.find((value) => Array.isArray(value) && value.length) || [];
const textValue = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
const resourceName = (item = {}) =>
  typeof item === "string"
    ? item
    : textValue(item.name, item.displayName, item.label, item.employeeName, item.email);
const resourceDateLabel = (item = {}, fallback = "") => {
  const dates = arrayValue(item.dates, item.jobDates, item.shifts, item.datesUsed)
    .map(parseDate)
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (dates.length === 1) return fmtShort(dates[0]);
  if (dates.length > 1) return `${fmtShort(dates[0])} – ${fmtShort(dates[dates.length - 1])}`;
  return fallback;
};
const statusLabel = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (["complete", "completed", "approved", "confirmed"].some((value) => normalized.includes(value))) return "Complete";
  if (["not required", "waived"].some((value) => normalized.includes(value))) return "Not required";
  if (["missing", "draft", "incomplete", "rejected", "query"].some((value) => normalized.includes(value))) return "Incomplete";
  return "Unknown";
};
const timesheetApprovalLabel = (timesheet = {}) => {
  if (timesheet.approved === true) return "Approved";
  if (timesheet.submitted === true) return "Submitted";
  return prettifyStatus(timesheet.approvalStatus || timesheet.status || timesheet.workflowStatus || "Draft");
};
const timesheetWeekDates = (timesheet = {}) => {
  const start = parseDate(timesheet.weekStart);
  if (!start) return {};
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return Object.fromEntries(days.map((day, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return [day, date.toISOString().slice(0, 10)];
  }));
};
const linkedTimesheetRows = (timesheets = [], job = {}) => {
  const bookingDates = new Set(normaliseDates(job).map((date) => date.toISOString().slice(0, 10)));
  return timesheets.flatMap((timesheet) => {
    const dates = timesheetWeekDates(timesheet);
    const snapshot = timesheet.jobSnapshot?.byDay || {};
    return Object.entries(timesheet.days || {}).flatMap(([day, entry]) => {
      const date = dates[day];
      const linked =
        entry?.bookingId === job.id ||
        (Array.isArray(snapshot[day]) && snapshot[day].some((booking) => booking.bookingId === job.id)) ||
        (date && bookingDates.has(date));
      if (!linked) return [];
      const storedStandard = Number(entry.standardHours ?? entry.standardHrs ?? entry.approvedHours);
      const standardHours = Number.isFinite(storedStandard) ? storedStandard : getHours(entry);
      const overtimeHours = Number(entry.overtimeHours ?? entry.overtimeHrs ?? 0) || 0;
      return [{
        id: `${timesheet.id || timesheet.employeeCode}-${day}`,
        timesheet,
        employee: textValue(timesheet.employeeName, timesheet.employeeCode, "Unknown crew member"),
        date,
        entry,
        standardHours,
        overtimeHours,
        approval: timesheetApprovalLabel(timesheet),
      }];
    });
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.employee.localeCompare(b.employee));
};
const structuredOperationalChanges = (job = {}) =>
  arrayValue(
    job.invoiceRelevantChanges,
    job.operationalChanges,
    job.actualChanges,
    job.variations,
    job.changeOrders
  ).filter((entry) => entry && typeof entry === "object");
const dailyActivityRows = (job = {}) =>
  normaliseDates(job).map((date) => {
    const iso = date.toISOString().slice(0, 10);
    const rawType = textValue(job.notesByDate?.[iso], job.dailyActivity?.[iso]?.dayType, job.days?.[iso]?.dayType);
    const detail = textValue(
      job.notesByDate?.[`${iso}-other`],
      job.dailyActivity?.[iso]?.notes,
      job.days?.[iso]?.notes
    );
    return { iso, date, type: rawType || "Day type not recorded", detail: detail || "No additional notes" };
  });

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

const formatMoney = (value, currency = "GBP") => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Not recorded";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      minimumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${currency || ""} ${Number(value).toFixed(2)}`.trim();
  }
};

const formatRecordedDate = (value) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
};

const formatVariance = (amount, percentage, currency) => {
  if (amount === null || amount === undefined) return "Not recorded";
  if (amount === 0) return `${formatMoney(0, currency)} · No variance`;
  const sign = amount > 0 ? "+" : "-";
  const money = formatMoney(Math.abs(amount), currency);
  const percent = percentage === null || percentage === undefined
    ? "Percentage not available"
    : `${sign}${Math.abs(percentage).toFixed(1)}%`;
  return `${sign}${money} · ${percent}`;
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
        <div className={layoutStyles.extracted2}>Week of {ws ? ws.toLocaleDateString("en-GB") : "—"}</div>
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
TimesheetCard.displayName = "LegacyTimesheetCard";

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
  const [invoiceRecord, setInvoiceRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timesheets, setTimesheets] = useState([]);
  const [vehicleLookup, setVehicleLookup] = useState({ byId: {}, byReg: {}, byName: {} });
  const [saving, setSaving] = useState(false);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState({});
  const [warningReason, setWarningReason] = useState("");
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnReasonCategory, setReturnReasonCategory] = useState("");
  const [returnRequiredAction, setReturnRequiredAction] = useState("");
  const [returnComment, setReturnComment] = useState("");
  const [returnAssignee, setReturnAssignee] = useState("");

  // live job
  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(doc(db, "bookings", jobId), (snap) => {
      setJob(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
      setLoading(false);
    });
    return () => unsub?.();
  }, [jobId]);

  // The authoritative draft/approval/issue stage is stored separately from the booking.
  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(
      doc(db, "invoiceQueue", jobId),
      (snap) => setInvoiceRecord(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null),
      () => setInvoiceRecord(null)
    );
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

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking || !gate.allowed) return;
    let active = true;
    loadBookingFormReferenceData(db, { accessState: dataAccessState })
      .then((referenceData) => {
        if (active) setVehicleLookup(referenceData.vehicleLookup || { byId: {}, byReg: {}, byName: {} });
      })
      .catch((error) => console.warn("Could not resolve vehicle names", error));
    return () => {
      active = false;
    };
  }, [accessKey, dataAccessState]);

  const operationalStatus = useMemo(() => resolveOperationalStatus(job || {}), [job]);
  const financeStage = useMemo(
    () => resolveFinanceStage(job || {}, invoiceRecord),
    [invoiceRecord, job]
  );
  const financeOwnership = useMemo(
    () => resolveFinanceOwnership(financeStage),
    [financeStage]
  );
  const dateLabel = useMemo(() => dateRangeLabel(job || {}), [job]);
  const quoteOptions = useMemo(() => normalizeQuoteVersions(job || {}), [job]);
  const acceptedQuote = useMemo(
    () => findAcceptedQuoteSnapshot(job || {}, quoteOptions),
    [job, quoteOptions]
  );
  const acceptedQuoteNumber = String(
    job?.acceptedQuoteNumber ||
      acceptedQuote?.quoteNumber ||
      ""
  ).trim();
  const commercialPosition = useMemo(
    () => buildCommercialPosition({ job: job || {}, quote: acceptedQuote }),
    [acceptedQuote, job]
  );
  const readyForInvoicing =
    job?.readyToInvoice === true || prettifyStatus(job?.status) === "Ready to Invoice";
  const hasPurchaseOrder = Boolean(
    String(job?.poNumber || job?.purchaseOrder || job?.reference || job?.po || "").trim()
  );
  const financeReadiness = useMemo(
    () =>
      buildFinanceReadiness({
        job: job || {},
        timesheets,
        acceptedQuoteNumber,
        readyForInvoicing,
        hasPurchaseOrder,
      }),
    [acceptedQuoteNumber, hasPurchaseOrder, job, readyForInvoicing, timesheets]
  );
  const currentActor = useMemo(() => {
    const user = dataAccessState?.user;
    const userDoc = dataAccessState?.userDoc;
    return {
      name:
        userDoc?.name ||
        userDoc?.displayName ||
        user?.fullName ||
        user?.firstName ||
        user?.primaryEmailAddress?.emailAddress ||
        user?.email ||
        "Unknown",
      uid: user?.id || user?.uid || userDoc?.uid || "",
    };
  }, [dataAccessState]);
  const existingAssignee = String(
    job?.assignedTeam || job?.assignedToName || job?.assignedTo || job?.ownerName || ""
  ).trim();
  const assignmentSupported = Boolean(existingAssignee);

  const notesBlob = useMemo(() => {
    if (!job) return "";
    const blob = [job.jobNotes, job.notes, job.generalNotes].filter(Boolean).join("\n\n");
    return blob;
  }, [job]);
  const evidence = useMemo(() => {
    const bookedCrew = Array.isArray(job?.employees) ? job.employees : [];
    const actualCrew = arrayValue(job?.actualCrew, job?.confirmedCrew, job?.crewActual);
    const bookedVehicles = Array.isArray(job?.vehicles) ? job.vehicles : [];
    const actualVehicles = arrayValue(job?.actualVehicles, job?.confirmedVehicles, job?.vehiclesUsed);
    const bookedEquipment = Array.isArray(job?.equipment) ? job.equipment : [];
    const actualEquipment = arrayValue(job?.actualEquipment, job?.confirmedEquipment, job?.equipmentUsed);
    const rows = linkedTimesheetRows(timesheets, job || {});
    const changes = structuredOperationalChanges(job || {});
    const activities = dailyActivityRows(job || {});
    const requirement = resolveTimesheetRequirement(job || {});
    const approvedCount = timesheets.filter((timesheet) => timesheetApprovalLabel(timesheet) === "Approved").length;
    const submittedCount = timesheets.filter((timesheet) =>
      ["Approved", "Submitted"].includes(timesheetApprovalLabel(timesheet))
    ).length;
    const requirementConfirmation = [...(Array.isArray(job?.history) ? job.history : [])]
      .reverse()
      .find((entry) =>
        String(entry?.warningCode || "").toLowerCase() === "timesheet_requirement_uncertain" ||
        String(entry?.action || "").toLowerCase().includes("timesheet")
      );
    const expectedCrewDays = requirement === true && bookedCrew.length && normaliseDates(job || {}).length
      ? bookedCrew.flatMap((crew) => normaliseDates(job || {}).map((date) => ({
          employee: resourceName(crew) || "Unknown crew member",
          date: date.toISOString().slice(0, 10),
        })))
      : [];
    const rowKeys = new Set(rows.map((row) => `${row.employee.toLowerCase()}|${row.date}`));
    const missingCrewDays = expectedCrewDays.filter(
      (expected) => !rowKeys.has(`${expected.employee.toLowerCase()}|${expected.date}`)
    );
    const timesheetSummary = requirement === false
      ? "Timesheets confirmed as not required"
      : !timesheets.length
        ? requirement === null
          ? "Timesheet requirement could not be determined"
          : "No timesheets linked"
        : approvedCount === timesheets.length
          ? `${approvedCount} of ${timesheets.length} timesheets approved`
          : `${submittedCount} of ${timesheets.length} timesheets submitted`;
    const countDifference =
      (actualCrew.length && actualCrew.length !== bookedCrew.length) ||
      (actualVehicles.length && actualVehicles.length !== bookedVehicles.length) ||
      (actualEquipment.length && actualEquipment.length !== bookedEquipment.length);
    return {
      bookedCrew,
      crew: actualCrew.length ? actualCrew : bookedCrew,
      crewConfirmed: actualCrew.length > 0,
      bookedVehicles,
      vehicles: actualVehicles.length ? actualVehicles : bookedVehicles,
      vehiclesConfirmed: actualVehicles.length > 0,
      bookedEquipment,
      equipment: actualEquipment.length ? actualEquipment : bookedEquipment,
      equipmentConfirmed: actualEquipment.length > 0,
      rows,
      changes,
      activities,
      requirement,
      requirementConfirmation,
      missingCrewDays,
      timesheetSummary,
      variance: Boolean(countDifference),
    };
  }, [job, timesheets]);

  // ── ACTIONS
  const safeUpdate = async (updates, successMessage = "Saved.") => {
    if (!jobId) return false;
    try {
      setSaving(true);
      await updateDoc(doc(db, "bookings", jobId), tenantPayload(dataAccessState, {
        ...updates,
        updatedAt: serverTimestamp(),
      }));
      systemDialogs.showSystemNotification(successMessage);
      return true;
    } catch (e) {
      console.error(e);
      systemDialogs.showSystemNotification("Failed to save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openReturnToOperations = () => {
    setReturnReasonCategory("");
    setReturnRequiredAction("");
    setReturnComment("");
    setReturnAssignee(existingAssignee);
    setReturnDialogOpen(true);
  };

  const submitReturnToOperations = async () => {
    const now = new Date().toISOString();
    const historyEntry = {
      action: "Returned to Operations",
      reasonCategory: returnReasonCategory,
      requiredAction: returnRequiredAction.trim(),
      comment: returnComment.trim(),
      assignedTo: returnAssignee.trim(),
      user: currentActor.name,
      userId: currentActor.uid,
      timestamp: now,
    };
    const saved = await safeUpdate(
      {
        status: "Action Required",
        history: [...(Array.isArray(job?.history) ? job.history : []), historyEntry],
      },
      "Returned to Operations."
    );
    if (saved) setReturnDialogOpen(false);
  };

  const handleCreateInvoice = () => {
    if (financeReadiness.blockers.length) return;
    if (financeReadiness.warnings.length) {
      setWarningAcknowledged({});
      setWarningReason("");
      setWarningDialogOpen(true);
      return;
    }
    router.push(`/invoice/${jobId}`);
  };

  const submitWarningAcknowledgement = async () => {
    const now = new Date().toISOString();
    const entries = financeReadiness.warnings.map((warning) => ({
      action: "Finance warning acknowledged",
      warningCode: warning.code,
      warning: warning.label,
      reason: warningReason.trim(),
      user: currentActor.name,
      userId: currentActor.uid,
      timestamp: now,
    }));
    const saved = await safeUpdate(
      { history: [...(Array.isArray(job?.history) ? job.history : []), ...entries] },
      "Finance warnings acknowledged."
    );
    if (saved) {
      setWarningDialogOpen(false);
      router.push(`/invoice/${jobId}`);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div className={layoutStyles.extracted12}>
          <div className={layoutStyles.headerIdentity}>
            <h1 style={h1}>{loading ? "Loading…" : job ? `Job #${job.jobNumber || job.id}` : "Not found"}</h1>
            {job && (job.client || job.location) ? (
              <div style={sub}>{[job.client, job.location].filter(Boolean).join(" · ")}</div>
            ) : null}
          </div>

          {job && (
            <div className={layoutStyles.headerWorkflow}>
              <div className={layoutStyles.headerDate}>{dateLabel}</div>
              <div className={layoutStyles.extracted13} aria-label="Job workflow statuses">
                <StatusBadge
                  value={`Operational: ${operationalStatus}`}
                  tone={operationalStatus === "Unknown" ? "TBC" : operationalStatus}
                />
                <StatusBadge
                  value={`Finance: ${financeStage}`}
                  tone={
                    financeStage === "Ready for Finance"
                      ? "Ready to Invoice"
                      : financeStage === "Needs Action"
                        ? "Action Required"
                        : financeStage
                  }
                />
              </div>
              <div className={layoutStyles.headerOwnership}>
                <span><strong>Owner:</strong> {financeOwnership.owner || "Not set"}</span>
                <span><strong>Next action:</strong> {financeOwnership.nextAction || "Not set"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ ...surface, padding: 16 }}>Loading job…</div>
        ) : !job ? (
          <div style={{ ...surface, padding: 16 }}>This job could not be found.</div>
        ) : (
          <div className={layoutStyles.extracted16}>
            {/* Finance readiness and current action */}
            <div className={layoutStyles.financeReviewCard}>
              <div className={layoutStyles.financeReviewHeader}>
                <div>
                  <div className={layoutStyles.financeEyebrow}>Finance stage</div>
                  <div className={layoutStyles.financeReviewTitle}>Ready for Finance</div>
                  <div className={layoutStyles.financeHelper}>
                    Finance must confirm the commercial and operational information before creating an invoice.
                  </div>
                </div>
                <span className={layoutStyles.stageNumber}>
                  {financeReadinessSummary(financeReadiness.counts)}
                </span>
              </div>
              <div className={layoutStyles.stageTrack} aria-label="Invoice lifecycle progress">
                <span className={layoutStyles.stageActive}>Finance Review</span>
                <span>Draft</span>
                <span>Approved</span>
                <span>Issued</span>
              </div>
              <div className={layoutStyles.readinessList} aria-label="Finance readiness checks">
                {financeReadiness.checks.map((check) => (
                  <div key={check.code} className={layoutStyles.readinessItem}>
                    <span
                      className={
                        check.type === "passed"
                          ? layoutStyles.checkOk
                          : check.type === "warning"
                            ? layoutStyles.checkWarn
                            : layoutStyles.checkBlocker
                      }
                      aria-hidden="true"
                    >
                      {check.type === "passed" ? "✓" : check.type === "warning" ? "!" : "×"}
                    </span>
                    <span className={layoutStyles.checkType}>{check.type === "passed" ? "Passed" : check.type === "warning" ? "Warning" : "Blocker"}</span>
                    <span>{check.label}</span>
                  </div>
                ))}
              </div>
              <div className={layoutStyles.financeActions}>
                <button
                  type="button"
                  className={layoutStyles.needsActionButton}
                  onClick={openReturnToOperations}
                  disabled={saving}
                >
                  Return to Operations
                </button>
                <button
                  type="button"
                  className={layoutStyles.primaryInvoiceAction}
                  onClick={handleCreateInvoice}
                  disabled={saving || financeReadiness.blockers.length > 0}
                  aria-describedby={financeReadiness.blockers.length ? "invoice-blocker-help" : undefined}
                >
                  Create invoice →
                </button>
              </div>
              {financeReadiness.blockers.length ? (
                <div id="invoice-blocker-help" className={layoutStyles.blockerHelp} role="status">
                  Resolve {financeReadiness.blockers.length} blocking item{financeReadiness.blockers.length === 1 ? "" : "s"} before creating an invoice.
                </div>
              ) : null}
            </div>

            {/* Main finance handoff evidence */}
            <div className={layoutStyles.extracted17}>
              {/* Commercial position */}
              <section style={{ ...surface, padding: 14 }} aria-labelledby="commercial-position-title">
                <div className={layoutStyles.commercialHeader}>
                  <h2 id="commercial-position-title" className={layoutStyles.extracted18}>Commercial position</h2>
                  <span className={acceptedQuote ? layoutStyles.lockedStatus : layoutStyles.missingStatus}>
                    {acceptedQuote ? "Approved job quote locked" : "Approved job quote not recorded"}
                  </span>
                </div>

                <div className={layoutStyles.jobIdentityGrid}>
                  <div><span>Client</span><strong>{job.client || "Not provided"}</strong></div>
                  <div><span>Location</span><strong>{job.location || "Not provided"}</strong></div>
                  <div><span>Job dates</span><strong>{dateLabel || "Not recorded"}</strong></div>
                  <div><span>PO/reference</span><strong>{commercialPosition.po.number || "Not provided"}</strong></div>
                </div>

                <div className={layoutStyles.acceptedQuotePanel}>
                  <div className={layoutStyles.quoteSummaryHeader}>
                    <div>
                      <span className={layoutStyles.eyebrow}>Approved job quote</span>
                      <h3>
                        {acceptedQuoteNumber || "Not recorded"}
                        {acceptedQuote ? ` · ${quoteDisplayName(acceptedQuote)}` : ""}
                      </h3>
                    </div>
                    <span className={acceptedQuote ? layoutStyles.acceptedStatus : layoutStyles.missingStatus}>
                      {acceptedQuote ? "Approved" : "Approved job quote not found"}
                    </span>
                  </div>

                  <div className={layoutStyles.quoteActions}>
                    {acceptedQuoteNumber ? (
                      <Link
                        href={`/quote/${job.id}?quote=${encodeURIComponent(acceptedQuoteNumber)}`}
                        aria-label={`View approved job quote ${acceptedQuoteNumber}`}
                      >
                        View approved quote
                      </Link>
                    ) : null}
                    <Link href={`/quote/${job.id}`} aria-label={`View quote history for job ${job.jobNumber || job.id}`}>
                      View quote history
                    </Link>
                  </div>
                </div>

                <div className={layoutStyles.commercialTotals} aria-label="Approved job quote totals">
                  <div><span>Quote subtotal (excl. VAT)</span><strong>{formatMoney(commercialPosition.acceptedNet, commercialPosition.currency)}</strong></div>
                  <div><span>VAT (20%)</span><strong>{formatMoney(commercialPosition.vat, commercialPosition.currency)}</strong></div>
                  <div><span>Total incl. VAT</span><strong>{formatMoney(commercialPosition.gross, commercialPosition.currency)}</strong></div>
                </div>

                {commercialPosition.discount.present ? (
                  <div className={layoutStyles.discountSummary}>
                    <span>Saved quote discount</span>
                    <strong>
                      {commercialPosition.discount.amount !== null
                        ? formatMoney(commercialPosition.discount.amount, commercialPosition.currency)
                        : commercialPosition.discount.percentage !== null
                          ? `${commercialPosition.discount.percentage}%`
                          : commercialPosition.discount.lineDescription || "Recorded in approved quote"}
                    </strong>
                    <span>Total after discount</span>
                    <strong>{formatMoney(commercialPosition.acceptedNet, commercialPosition.currency)}</strong>
                  </div>
                ) : null}

                <div className={layoutStyles.expectedPosition}>
                  <div className={layoutStyles.expectedPositionHeader}>
                    <h3>Expected invoice position</h3>
                    <span className={
                      commercialPosition.variance === null
                        ? layoutStyles.missingStatus
                        : commercialPosition.variance
                          ? layoutStyles.varianceWarning
                          : layoutStyles.noVariance
                    }>
                      {commercialPosition.variance === null
                        ? "Commercial variance not available"
                        : commercialPosition.variance
                          ? "Invoice is expected to differ from the approved quote"
                          : "No recorded commercial variance"}
                    </span>
                  </div>
                  <div className={layoutStyles.expectedTotals}>
                    <div><span>Approved quote net</span><strong>{formatMoney(commercialPosition.acceptedNet, commercialPosition.currency)}</strong></div>
                    <div><span>Additional charges</span><strong>{formatMoney(commercialPosition.adjustments.additions, commercialPosition.currency)}</strong></div>
                    <div><span>Deductions / discounts</span><strong>{formatMoney(commercialPosition.adjustments.deductions, commercialPosition.currency)}</strong></div>
                    <div><span>Expected invoice net</span><strong>{formatMoney(commercialPosition.expectedNet, commercialPosition.currency)}</strong></div>
                    <div><span>Expected variance</span><strong>{formatVariance(commercialPosition.variance, commercialPosition.variancePercentage, commercialPosition.currency)}</strong></div>
                  </div>
                  {!commercialPosition.adjustments.hasStructuredData ? (
                    <p className={layoutStyles.dataLimitation}>No structured variations recorded</p>
                  ) : (
                    <ul className={layoutStyles.variationList}>
                      {commercialPosition.adjustments.records.map((record, index) => (
                        <li key={`${record.source}-${record.reason}-${index}`}>
                          <strong>{record.reason || "Reason not recorded"}</strong>
                          <span>Source: {record.source || "Unknown"}</span>
                          <span>Client approval evidence: {record.clientApprovalEvidence ? "Recorded" : "Not recorded"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={layoutStyles.supportingCommercial}>
                  <div><span>PO status</span><strong>{commercialPosition.po.status}</strong></div>
                  <div><span>PO number</span><strong>{commercialPosition.po.number || "Not provided"}</strong></div>
                  <div><span>Billing customer</span><strong>{job.billingCustomer || job.invoiceCustomer || job.client || "Not provided"}</strong></div>
                  <div><span>Payment terms</span><strong>{job.paymentTermsDays ?? job.finance?.paymentTermsDays ?? invoiceRecord?.paymentTermsDays ?? "Not recorded"}{Number.isFinite(Number(job.paymentTermsDays ?? job.finance?.paymentTermsDays ?? invoiceRecord?.paymentTermsDays)) ? " days" : ""}</strong></div>
                  <div><span>Billing contact</span><strong>{job.invoiceContactName || job.contactName || "Not provided"}</strong></div>
                  <div><span>Billing email</span><strong>{job.invoiceContactEmail || job.contactEmail || "Not provided"}</strong></div>
                  <div><span>Billing phone</span><strong>{job.invoiceContactPhone || job.contactPhone || "Not provided"}</strong></div>
                </div>

                {commercialPosition.po.value !== null ? (
                  <div className={layoutStyles.poComparison}>
                    <div><span>PO value</span><strong>{formatMoney(commercialPosition.po.value, commercialPosition.currency)}</strong></div>
                    <div><span>Expected invoice total</span><strong>{formatMoney(commercialPosition.expectedNet, commercialPosition.currency)}</strong></div>
                    <div><span>Difference</span><strong>{formatMoney(commercialPosition.po.value - (commercialPosition.expectedNet || 0), commercialPosition.currency)}</strong></div>
                  </div>
                ) : null}
              </section>

              <section className={layoutStyles.operationalEvidence} aria-labelledby="operational-evidence-title">
                <div className={layoutStyles.evidenceHeader}>
                  <div>
                    <span className={layoutStyles.evidenceEyebrow}>Completed-job record</span>
                    <h2 id="operational-evidence-title">Operational evidence</h2>
                  </div>
                  <span className={evidence.variance ? layoutStyles.evidenceIncomplete : layoutStyles.evidenceComplete}>
                    {evidence.variance ? "Incomplete" : "Complete"}
                  </span>
                </div>

                <div className={layoutStyles.operationalComparison}>
                  <div>
                    <span>Booked</span>
                    <strong>{evidence.bookedCrew.length} crew · {evidence.bookedVehicles.length} vehicles · {evidence.bookedEquipment.length} equipment</strong>
                  </div>
                  <div>
                    <span>Actual</span>
                    <strong>
                      {evidence.crewConfirmed || evidence.vehiclesConfirmed || evidence.equipmentConfirmed
                        ? `${evidence.crew.length} crew · ${evidence.vehicles.length} vehicles · ${evidence.equipment.length} equipment`
                        : "Actual usage has not been separately recorded"}
                    </strong>
                  </div>
                  <div className={evidence.variance ? layoutStyles.varianceNotice : layoutStyles.noVarianceNotice}>
                    {evidence.variance ? "Actual resources differ from booking" : "No operational variance recorded"}
                  </div>
                </div>

                <div className={layoutStyles.evidenceGroup}>
                  <div className={layoutStyles.evidenceGroupHeader}>
                    <h3>Crew</h3>
                    <span className={evidence.crew.length ? layoutStyles.evidenceComplete : layoutStyles.evidenceUnknown}>
                      {evidence.crew.length ? "Complete" : "Unknown"}
                    </span>
                  </div>
                  {evidence.crew.length ? (
                    <div className={layoutStyles.resourceRows}>
                      {evidence.crew.map((crew, index) => {
                        const name = resourceName(crew) || "Unknown crew member";
                        const crewTimesheets = evidence.rows.filter((row) => row.employee.toLowerCase() === name.toLowerCase());
                        const standard = crewTimesheets.reduce((total, row) => total + row.standardHours, 0);
                        const overtime = crewTimesheets.reduce((total, row) => total + row.overtimeHours, 0);
                        return (
                          <div className={layoutStyles.resourceRow} key={`${name}-${index}`}>
                            <div><strong>{name}</strong><span>{textValue(crew?.role, crew?.jobRole, crew?.position, "Role not recorded")}</span></div>
                            <span>{resourceDateLabel(crew, dateLabel)}</span>
                            <span>{crewTimesheets.length ? `${standard.toFixed(1)} standard hours · ${overtime.toFixed(1)} overtime hours` : "Timesheet: Missing"}</span>
                            <span className={layoutStyles.rowState}>{crewTimesheets.length ? timesheetApprovalLabel(crewTimesheets[0].timesheet) : evidence.requirement === false ? "Not required" : "Incomplete"}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className={layoutStyles.emptyEvidence}>No crew recorded</p>}
                </div>

                <div className={layoutStyles.evidenceGroup}>
                  <div className={layoutStyles.evidenceGroupHeader}>
                    <h3>Vehicles and equipment</h3>
                    <span className={!evidence.vehicles.length && !evidence.equipment.length ? layoutStyles.evidenceUnknown : evidence.equipmentConfirmed || !evidence.bookedEquipment.length ? layoutStyles.evidenceComplete : layoutStyles.evidenceIncomplete}>
                      {!evidence.vehicles.length && !evidence.equipment.length ? "Unknown" : evidence.equipmentConfirmed || !evidence.bookedEquipment.length ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                  <h4 className={layoutStyles.resourceSubheading}>Vehicles</h4>
                  {evidence.vehicles.length ? (
                    <div className={layoutStyles.resourceRows}>
                      {evidence.vehicles.map((vehicle, index) => {
                        const rawKey = typeof vehicle === "string" ? vehicle : textValue(vehicle.id, vehicle.vehicleId, vehicle.registration, vehicle.reg);
                        const resolved = typeof vehicle === "object"
                          ? vehicleLookup.byId?.[rawKey] || vehicleLookup.byReg?.[rawKey.toUpperCase()] || vehicle
                          : vehicleLookup.byId?.[rawKey] || vehicleLookup.byReg?.[rawKey.toUpperCase()] || vehicleLookup.byName?.[rawKey.toLowerCase()];
                        const name = resolved ? textValue(resolved.name, resolved.vehicleName, resolved.label) : "";
                        const registration = resolved ? textValue(resolved.registration, resolved.reg).toUpperCase() : "";
                        return (
                          <div className={layoutStyles.resourceRow} key={`${rawKey}-${index}`} title={!resolved ? `Unresolved vehicle ID: ${rawKey}` : undefined}>
                            <div><strong>{name || "Unknown vehicle"}</strong><span>{textValue(resolved?.type, resolved?.vehicleType, "Type not recorded")}</span></div>
                            <span>{registration || "Registration not recorded"}</span>
                            <span>{resourceDateLabel(vehicle, dateLabel)}</span>
                            <span className={layoutStyles.rowState}>{evidence.vehiclesConfirmed ? "Actual usage" : "Recorded"}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className={layoutStyles.emptyEvidence}>No vehicles recorded</p>}
                  <h4 className={layoutStyles.resourceSubheading}>Equipment</h4>
                  {evidence.equipment.length ? (
                    <div className={layoutStyles.resourceRows}>
                      {evidence.equipment.map((item, index) => (
                        <div className={layoutStyles.resourceRow} key={`${resourceName(item)}-${index}`}>
                          <div><strong>{resourceName(item) || "Unknown equipment"}</strong><span>Quantity: {Number(item?.quantity || item?.qty || 1)}</span></div>
                          <span>{resourceDateLabel(item, dateLabel)}</span>
                          <span className={layoutStyles.rowState}>{evidence.equipmentConfirmed ? "Confirmed" : "Booked · unconfirmed"}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className={layoutStyles.emptyEvidence}>{evidence.bookedEquipment.length ? "Expected equipment has not been confirmed" : "No equipment recorded"}</p>}
                </div>

                <div className={layoutStyles.evidenceGroup}>
                  <div className={layoutStyles.evidenceGroupHeader}>
                    <div><h3>Timesheets</h3><p>{evidence.timesheetSummary}</p></div>
                    <span className={statusLabel(evidence.requirement === false ? "not required" : evidence.missingCrewDays.length ? "incomplete" : timesheets.length ? "complete" : "unknown") === "Complete" ? layoutStyles.evidenceComplete : evidence.requirement === false ? layoutStyles.evidenceNotRequired : evidence.missingCrewDays.length ? layoutStyles.evidenceIncomplete : layoutStyles.evidenceUnknown}>
                      {evidence.requirement === false ? "Not required" : evidence.missingCrewDays.length ? "Incomplete" : timesheets.length ? "Complete" : "Unknown"}
                    </span>
                  </div>
                  {evidence.requirement === false && evidence.requirementConfirmation ? (
                    <p className={layoutStyles.dataLimitation}>Confirmed by {textValue(evidence.requirementConfirmation.user, evidence.requirementConfirmation.by, "Unknown")} · {formatRecordedDate(evidence.requirementConfirmation.timestamp)}</p>
                  ) : null}
                  {evidence.rows.length ? (
                    <div className={layoutStyles.timesheetTableWrap}>
                      <table className={layoutStyles.evidenceTable}>
                        <thead><tr><th>Crew member</th><th>Date</th><th>Start</th><th>Finish</th><th>Break</th><th>Standard</th><th>Overtime</th><th>Status</th></tr></thead>
                        <tbody>{evidence.rows.map((row) => (
                          <tr key={row.id}>
                            <td><strong>{row.employee}</strong></td><td>{fmtShort(parseDate(row.date))}</td>
                            <td>{textValue(row.entry.startTime, row.entry.leaveTime, row.entry.callTime, "—")}</td>
                            <td>{textValue(row.entry.endTime, row.entry.arriveBack, row.entry.wrapTime, "—")}</td>
                            <td>{row.entry.breakMins ?? row.entry.breakMinutes ?? "—"}</td>
                            <td>{row.standardHours.toFixed(1)}h</td><td>{row.overtimeHours.toFixed(1)}h</td><td>{row.approval}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : null}
                  {evidence.missingCrewDays.length ? (
                    <div className={layoutStyles.missingRows}>
                      {evidence.missingCrewDays.map((missing) => <div key={`${missing.employee}-${missing.date}`}><strong>Missing timesheet</strong><span>{missing.employee} · {fmtShort(parseDate(missing.date))}</span></div>)}
                    </div>
                  ) : null}
                </div>

                <div className={layoutStyles.evidenceGroup}>
                  <div className={layoutStyles.evidenceGroupHeader}>
                    <h3>Daily activity and invoice-relevant changes</h3>
                    <span className={evidence.activities.length ? layoutStyles.evidenceComplete : layoutStyles.evidenceUnknown}>{evidence.activities.length ? "Complete" : "Unknown"}</span>
                  </div>
                  <h4 className={layoutStyles.resourceSubheading}>Operational summary</h4>
                  <p className={layoutStyles.operationalSummary}>{notesBlob || "No operational summary recorded"}</p>
                  <h4 className={layoutStyles.resourceSubheading}>Daily activity</h4>
                  {evidence.activities.length ? <div className={layoutStyles.activityRows}>{evidence.activities.map((activity) => (
                    <div key={activity.iso}><time>{fmtShort(activity.date)}</time><strong>{activity.type}</strong><span>{activity.detail}</span></div>
                  ))}</div> : <p className={layoutStyles.emptyEvidence}>No daily activity recorded</p>}
                  <h4 className={layoutStyles.resourceSubheading}>Invoice-relevant changes</h4>
                  {evidence.changes.length ? <div className={layoutStyles.changeRows}>{evidence.changes.map((change, index) => (
                    <div key={`${change.id || change.type}-${index}`}>
                      <strong>{textValue(change.type, change.changeType, change.category, "Operational change")}</strong>
                      <span>{textValue(change.description, change.reason, "No description recorded")}</span>
                      <small>{[
                        textValue(change.quantity, change.hours) ? `Quantity/hours: ${textValue(change.quantity, change.hours)}` : "",
                        change.date ? fmtShort(parseDate(change.date)) : "",
                        textValue(change.recordedBy, change.createdBy) ? `Recorded by ${textValue(change.recordedBy, change.createdBy)}` : "",
                        change.clientApproved === true ? "Client approved" : change.clientApproved === false ? "Client approval not recorded" : "",
                        change.invoiced === true || change.includedInInvoice === true ? "Included in invoice" : "",
                      ].filter(Boolean).join(" · ")}</small>
                    </div>
                  ))}</div> : <p className={layoutStyles.emptyEvidence}>No structured invoice-relevant changes recorded</p>}
                  {textValue(job.internalNotes, job.finance?.internalNotes) ? <><h4 className={layoutStyles.resourceSubheading}>Internal notes</h4><p className={layoutStyles.internalNotes}>{textValue(job.internalNotes, job.finance?.internalNotes)}</p></> : null}
                </div>
              </section>

              {Array.isArray(job.attachments) && job.attachments.length > 0 && (
                <div style={{ ...surface, padding: 14 }}>
                  <div className={layoutStyles.extracted42}>Supporting documents</div>
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

            {/* Secondary technical information */}
            <div className={layoutStyles.extracted33}>
              <details className={layoutStyles.technicalDetails}>
                <summary>Technical details</summary>
                <div className={layoutStyles.technicalDetailsGrid}>
                  <div>Job ID</div>
                  <div>{job.id}</div>
                  <div>Created</div>
                  <div>{job.createdAt ? new Date(job.createdAt.seconds ? job.createdAt.seconds * 1000 : job.createdAt).toLocaleString("en-GB") : "—"}</div>
                  <div>Last updated</div>
                  <div>{job.updatedAt ? new Date(job.updatedAt.seconds ? job.updatedAt.seconds * 1000 : job.updatedAt).toLocaleString("en-GB") : "—"}</div>
                </div>
              </details>
            </div>
          </div>
        )}

        <Modal
          open={warningDialogOpen}
          onClose={() => !saving && setWarningDialogOpen(false)}
          title="Acknowledge finance warnings"
          description="Confirm each warning before creating the invoice."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setWarningDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button
                onClick={submitWarningAcknowledgement}
                disabled={
                  saving ||
                  warningReason.trim().length < 3 ||
                  financeReadiness.warnings.some((warning) => !warningAcknowledged[warning.code])
                }
              >
                Acknowledge and create invoice
              </Button>
            </>
          }
        >
          <div className={layoutStyles.dialogForm}>
            <div className={layoutStyles.warningChecklist}>
              {financeReadiness.warnings.map((warning) => (
                <Checkbox
                  key={warning.code}
                  label={warning.label}
                  checked={Boolean(warningAcknowledged[warning.code])}
                  onChange={(event) =>
                    setWarningAcknowledged((current) => ({
                      ...current,
                      [warning.code]: event.target.checked,
                    }))
                  }
                />
              ))}
            </div>
            <label className={layoutStyles.dialogField}>
              <span>Confirmation note</span>
              <Textarea
                value={warningReason}
                onChange={(event) => setWarningReason(event.target.value)}
                placeholder="Explain why it is safe to continue."
                required
              />
            </label>
          </div>
        </Modal>

        <Modal
          open={returnDialogOpen}
          onClose={() => !saving && setReturnDialogOpen(false)}
          title="Return to Operations"
          description="Record what Operations must resolve before Finance can continue."
          footer={
            <>
              <Button variant="secondary" onClick={() => setReturnDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button
                onClick={submitReturnToOperations}
                disabled={
                  saving ||
                  !returnReasonCategory ||
                  !returnRequiredAction.trim() ||
                  (returnReasonCategory === "Other" && !returnComment.trim())
                }
              >
                Return to Operations
              </Button>
            </>
          }
        >
          <div className={layoutStyles.dialogForm}>
            <label className={layoutStyles.dialogField}>
              <span>Reason category</span>
              <Select value={returnReasonCategory} onChange={(event) => setReturnReasonCategory(event.target.value)} required>
                <option value="">Select a reason</option>
                {RETURN_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </Select>
            </label>
            <label className={layoutStyles.dialogField}>
              <span>Required action</span>
              <Input
                value={returnRequiredAction}
                onChange={(event) => setReturnRequiredAction(event.target.value)}
                placeholder="Describe exactly what must be corrected."
                required
              />
            </label>
            <label className={layoutStyles.dialogField}>
              <span>Comment{returnReasonCategory === "Other" ? " (required)" : ""}</span>
              <Textarea
                value={returnComment}
                onChange={(event) => setReturnComment(event.target.value)}
                placeholder="Add useful context for Operations."
                required={returnReasonCategory === "Other"}
              />
            </label>
            {assignmentSupported ? (
              <label className={layoutStyles.dialogField}>
                <span>Assigned team or user</span>
                <Input value={returnAssignee} onChange={(event) => setReturnAssignee(event.target.value)} />
              </label>
            ) : null}
          </div>
        </Modal>
      </div>
    </HeaderSidebarLayout>
  );
}
