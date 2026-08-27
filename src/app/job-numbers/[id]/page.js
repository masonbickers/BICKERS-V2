"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  where,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "../../components/HeaderSidebarLayout";
import { format, parseISO } from "date-fns";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { useSessionScroll, useSessionState } from "@/app/utils/useSessionState";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { getFixedJobStatusStyle } from "@/app/utils/jobStatusColors";
import { buildSynchronizedVehicleStatus } from "@/app/utils/bookingLifecycle";
import {
  buildJobFileRows,
  buildReopenBookingPayload,
  deduplicateJobContacts,
  formatJobContacts,
  formatJobLocation,
  formatProductionIdentity,
  getJobNumberBackLabel,
  getStatusTransitionWarnings,
  isLockedJobStatus as isLockedStatus,
  lockedBookingMessage,
  normalizeJobContacts,
} from "@/app/utils/jobNumberDetail";
import { safeInternalPath } from "@/app/utils/quoteNavigation";

/* ────────────────────────────────────────────────────────────
   Design tokens + layout
─────────────────────────────────────────────────────────────*/
const UI = UI_TOKENS;

const LAYOUT = {
  HEADER_H: 54,
  STICKY_GAP: 8,
};

const mono = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

/* ────────────────────────────────────────────────────────────
   Helpers (UNCHANGED LOGIC)
─────────────────────────────────────────────────────────────*/
const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const parseDateFlexible = (dateStr) => {
  try {
    if (!dateStr) return null;
    if (typeof dateStr === "string" && dateStr.length === 10) return parseISO(dateStr); // YYYY-MM-DD
    return new Date(dateStr);
  } catch {
    return null;
  }
};

const splitJobNumber = (jobNumber) => {
  if (typeof jobNumber === "string") {
    const parts = jobNumber.split("-");
    if (parts.length > 1) return { prefix: parts.slice(0, -1).join("-"), suffix: parts.at(-1) };
  }
  return { prefix: jobNumber || "Job", suffix: "" };
};

const splitQuoteRevision = (quoteNumber) => {
  const raw = String(quoteNumber || "").trim();
  const match = raw.match(/^(.+)\.(\d+)$/);
  if (!match) return { publicNumber: raw, revision: 0 };
  return { publicNumber: match[1], revision: Number(match[2]) || 0 };
};

const getJobQuoteNumber = (job) => String(job?.acceptedQuoteNumber || job?.quoteNumber || "").trim();

const renderEmployees = (employees) =>
  Array.isArray(employees) && employees.length
    ? employees
        .map((e) => (typeof e === "string" ? e : e?.name || e?.displayName || e?.email || ""))
        .filter(Boolean)
        .join(", ")
    : null;

const renderCrewNames = (job) => {
  const direct = renderEmployees(job?.employees);
  if (direct) return direct;
  if (Array.isArray(job?.employeeNames) && job.employeeNames.length) {
    return job.employeeNames.filter(Boolean).join(", ");
  }
  if (job?.employeesByDate && typeof job.employeesByDate === "object") {
    const names = Object.values(job.employeesByDate)
      .flat()
      .map((e) => (typeof e === "string" ? e : e?.name || e?.displayName || e?.email || ""))
      .filter(Boolean);
    return names.length ? Array.from(new Set(names)).join(", ") : null;
  }
  return null;
};

const renderNames = (items, fallbacks = ["name", "displayName", "registration"]) => {
  if (!Array.isArray(items) || !items.length) return null;
  const names = items
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      return fallbacks.map((key) => item[key]).find(Boolean) || "";
    })
    .filter(Boolean);
  return names.length ? Array.from(new Set(names)).join(", ") : null;
};

const renderVehicleNames = (vehicles) => {
  if (!Array.isArray(vehicles) || !vehicles.length) return null;
  const names = vehicles
    .map((vehicle) => {
      if (typeof vehicle === "string") return vehicle;
      if (!vehicle || typeof vehicle !== "object") return "";
      const name = vehicle.name || vehicle.vehicleName || [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ");
      const registration = String(vehicle.registration || "").trim().toUpperCase();
      if (!name && registration) return registration;
      return registration ? `${name || "Vehicle"} (${registration})` : name || "";
    })
    .filter(Boolean);
  return names.length ? Array.from(new Set(names)).join(", ") : null;
};

const uniqueCleanList = (items) =>
  Array.from(
    new Set(
      (items || [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

const getVehicleLabels = (job) => {
  if (!Array.isArray(job?.vehicles)) return [];
  return job.vehicles
    .map((vehicle) => {
      if (typeof vehicle === "string") return vehicle;
      if (!vehicle || typeof vehicle !== "object") return "";
      const name = vehicle.name || vehicle.vehicleName || [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ");
      const registration = String(vehicle.registration || vehicle.reg || "").trim().toUpperCase();
      if (!name && registration) return registration;
      return registration ? `${name || "Vehicle"} (${registration})` : name || "";
    })
    .filter(Boolean);
};

const getCrewLabels = (job) => {
  const names = [];
  if (Array.isArray(job?.employees)) {
    names.push(
      ...job.employees.map((employee) =>
        typeof employee === "string"
          ? employee
          : employee?.name || employee?.displayName || employee?.email || ""
      )
    );
  }
  if (Array.isArray(job?.employeeNames)) names.push(...job.employeeNames);
  if (job?.employeesByDate && typeof job.employeesByDate === "object") {
    names.push(
      ...Object.values(job.employeesByDate)
        .flat()
        .map((employee) =>
          typeof employee === "string"
            ? employee
            : employee?.name || employee?.displayName || employee?.email || ""
        )
    );
  }
  return names.filter(Boolean);
};

const getLocationLabels = (job) => {
  const locations = [
    job?.location,
    job?.shootLocation,
    job?.siteLocation,
    job?.venue,
  ];
  return locations.map(formatJobLocation).filter(Boolean);
};

const getContactLabels = (job) => {
  return normalizeJobContacts(job)
    .map((contact) =>
      [
        contact?.department,
        contact?.name,
        contact?.email,
        contact?.phone || contact?.number,
      ]
        .filter(Boolean)
        .join(" - ")
    )
    .filter(Boolean);
};

const buildConnectedBookingSummary = (jobs) => {
  const connectedJobs = jobs || [];
  const connectedContacts = deduplicateJobContacts(connectedJobs.flatMap(normalizeJobContacts));
  return {
    contacts: getContactLabels({ additionalContacts: connectedContacts }),
    vehicles: uniqueCleanList(connectedJobs.flatMap(getVehicleLabels)),
    crew: uniqueCleanList(connectedJobs.flatMap(getCrewLabels)),
    locations: uniqueCleanList(connectedJobs.flatMap(getLocationLabels)),
  };
};

const getPrimaryContactName = (jobs) => {
  for (const job of jobs || []) {
    const directName = String(job?.contactName || "").trim();
    if (directName) return directName;

    const additionalName = (job?.additionalContacts || [])
      .map((contact) => String(contact?.name || "").trim())
      .find(Boolean);
    if (additionalName) return additionalName;
  }
  return "No contact";
};

const formatSummaryCount = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const yesNo = (value) => (value ? "Yes" : "No");

const formatDateTime = (value) => {
  const d = parseDateFlexible(value);
  return d ? format(d, "dd/MM/yyyy HH:mm") : null;
};

const renderDateBlock = (job) => {
  if (!Array.isArray(job.bookingDates) || job.bookingDates.length === 0) return "No dates scheduled.";
  const sorted = job.bookingDates
    .map((d) => parseDateFlexible(d))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!sorted.length) return "No valid dates.";
  const first = format(sorted[0], "dd/MM/yyyy");
  const last = format(sorted.at(-1), "dd/MM/yyyy");
  return first === last ? first : `${first} to ${last} (${sorted.length} days)`;
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

const Badge = ({ text, bg, fg, border, title }) => (
  <span
    title={title}
    style={{
      backgroundColor: bg,
      color: fg,
      border: `1px solid ${border}`,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 900,
      whiteSpace: "nowrap",
      lineHeight: 1,
    }}
  >
    {text}
  </span>
);

const ConnectedSummaryPanel = ({ title, values }) => {
  const count = values.length;
  return (
    <div
      style={{
        border: UI.border,
        borderRadius: 8,
        background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "7px 9px",
          borderBottom: UI.border,
          background: "var(--color-surface-subtle)",
        }}
      >
        <div style={{ color: UI.muted, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase" }}>
          {title}
        </div>
        <Badge
          text={String(count)}
          bg={count ? UI.brandSoft : "var(--color-surface-hover)"}
          fg={count ? UI.brand : UI.muted}
          border={count ? UI.brandBorder : "var(--color-border)"}
          title={`${count} ${title.toLowerCase()}`}
        />
      </div>
      <div
        className={layoutStyles.extracted1}
      >
        {count ? (
          values.map((value) => (
            <span
              key={value}
              title={value}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 999,
                background: "var(--color-surface)",
                color: UI.text,
                padding: "4px 8px",
                fontSize: 12,
                fontWeight: 850,
                lineHeight: 1.2,
                maxWidth: "100%",
                overflowWrap: "anywhere",
              }}
            >
              {value}
            </span>
          ))
        ) : (
          <span style={{ color: UI.muted, fontSize: 12.5, fontWeight: 800 }}>None added</span>
        )}
      </div>
    </div>
  );
};

const statusColor = (status) => {
  return getFixedJobStatusStyle(status);
};

const StatusPill = ({ value }) => {
  const color = statusColor(value);
  return <Badge text={value} bg={color.bg} fg={color.text} border={color.border} />;
};
const PaidPill = () => <Badge text="Paid" bg="var(--color-success-soft)" fg="var(--color-success)" border="var(--color-success-border)" />;

/* ────────────────────────────────────────────────────────────
   Status auto-complete helpers (UNCHANGED)
─────────────────────────────────────────────────────────────*/
const buildVehicleNameStatusUpdates = (job, value = "Complete") => {
  const list = Array.isArray(job?.vehicles) ? job.vehicles : [];
  const names = list
    .map((v) => (typeof v === "string" ? v : v?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const safe = (s) => s.replace(/[.~*/\[\]]/g, "_");

  const updates = {};
  names.forEach((n) => {
    updates[`vehicleStatus.${safe(n)}`] = value;
  });
  return updates;
};

/* ────────────────────────────────────────────────────────────
   Timesheet renderer — TABLE layout (UNCHANGED LOGIC)
─────────────────────────────────────────────────────────────*/
const renderTimesheet = (ts, job, vehicleMap, onlyJobDays = true) => {
  const dayMap = ts.days || {};
  const jobDates = new Set(Array.isArray(job.bookingDates) ? job.bookingDates : []);
  const snapshotByDay = ts.jobSnapshot?.byDay || {};

  const ws = parseDateFlexible(ts.weekStart);
  const isoByDay = {};
  if (ws) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      isoByDay[dayOrder[i]] = format(d, "yyyy-MM-dd");
    }
  }

  const isDayRelevant = (day) => {
    const entry = dayMap[day] || {};
    const iso = isoByDay[day];
    const explicitlyLinked = entry.bookingId === job.id;
    const snapshotList = Array.isArray(snapshotByDay[day]) ? snapshotByDay[day] : [];
    const snapshotHasThisJob = snapshotList.some((j) => j.bookingId === job.id);
    const isJobDateMatch = iso ? jobDates.has(iso) : false;
    return explicitlyLinked || snapshotHasThisJob || isJobDateMatch;
  };

  const daysToRender = onlyJobDays ? dayOrder.filter(isDayRelevant) : dayOrder;
  if (onlyJobDays && daysToRender.length === 0) return null;

  const getDisplay = (day) => {
    const entry = dayMap[day] || {};
    const iso = isoByDay[day];
    const isJobDay = iso ? jobDates.has(iso) : false;

    const explicitlyLinked = entry.bookingId === job.id;
    const snapshotList = Array.isArray(snapshotByDay[day]) ? snapshotByDay[day] : [];
    const snapshotHasThisJob = snapshotList.some((j) => j.bookingId === job.id);

    let mode = String(entry?.mode ?? entry?.type ?? "").toLowerCase();
    const hours = getHours(entry);

    if (explicitlyLinked) {
      if (!mode || mode === "off") mode = hours > 0 ? entry.mode || "work" : "off";
    } else if (!mode && (isJobDay || snapshotHasThisJob)) {
      const snap = snapshotList.find((j) => j.bookingId === job.id);
      if (snap && snap.location && snap.location.toLowerCase().includes("yard")) {
        mode = "yard";
      } else {
        mode = "onset";
      }
    }
    if (!mode) mode = "off";

    let label = mode;
    if (mode === "holiday") label = "HOL";
    else if (mode === "onset" || mode === "set" || mode === "work") label = explicitlyLinked ? "Set*" : "Set";
    else if (mode === "yard") label = explicitlyLinked ? "Yard*" : "Yard";
    else if (mode === "travel") label = explicitlyLinked ? "Travel*" : "Travel";
    else if (mode === "off" && hours === 0) label = "OFF";

    return { entry, iso, modeLabel: label, hours };
  };

  const rows = daysToRender.map((day) => ({ day, ...getDisplay(day) }));
  const totalHours = rows.reduce((sum, r) => sum + (isFinite(r.hours) ? r.hours : 0), 0);

  const wrap = {
    borderLeft: `3px solid ${ts.submitted ? "var(--color-success-border)" : "var(--color-warning-border)"}`,
    borderRadius: 6,
    padding: "8px 10px",
    marginBottom: 8,
    backgroundColor: ts.submitted ? "var(--color-surface-subtle)" : "var(--color-warning-soft)",
    minWidth: 0,
  };
  const header = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 6,
    borderBottom: "1px solid var(--color-brand-soft)",
    paddingBottom: 6,
    minWidth: 0,
    flexWrap: "wrap",
  };
  const tableWrap = { overflowX: "auto", marginTop: 6, minWidth: 0 };
  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 11.5,
    tableLayout: "fixed",
  };
  const th = {
    textAlign: "left",
    padding: "5px 6px",
    borderBottom: UI.border,
    background: "var(--color-surface)",
    color: UI.muted,
    fontSize: 10.5,
    fontWeight: 900,
    textTransform: "uppercase",
    position: "sticky",
    top: 0,
    zIndex: 1,
    whiteSpace: "nowrap",
  };
  const td = {
    padding: "5px 6px",
    borderBottom: "1px solid var(--color-brand-soft)",
    verticalAlign: "top",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const tdRight = { ...td, textAlign: "right", whiteSpace: "nowrap" };
  const dayCell = { ...td, fontWeight: 900, whiteSpace: "nowrap" };
  const foot = { ...tdRight, fontWeight: 900, background: "var(--color-surface-subtle)" };
  const notesCell = { overflowWrap: "anywhere", whiteSpace: "pre-wrap" };

  return (
    <div style={wrap}>
      <div style={header}>
        <div style={{ fontSize: 13, fontWeight: 900, color: UI.text }}>
          Week of {ws ? format(ws, "dd/MM/yyyy") : "—"}
        </div>
        <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>
          <strong>Emp:</strong> {ts.employeeName || ts.employeeCode || "—"}
        </div>
        <div style={{ fontSize: 11.5, color: UI.muted }}>
          Showing {rows.length} day{rows.length !== 1 ? "s" : ""} for this job
        </div>
        <div className={layoutStyles.extracted2}>
          {ts.submitted ? (
            <Badge text="Submitted" bg="var(--color-success-soft)" fg="var(--color-success)" border="var(--color-success-border)" />
          ) : (
            <Badge text="Draft" bg="var(--color-warning-soft)" fg="var(--color-warning)" border="var(--color-warning-border)" />
          )}
        </div>
        <a
          href={`/timesheet/${ts.id || `${ts.employeeCode}_${ts.weekStart}`}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "4px 8px",
            borderRadius: 8,
            border: UI.border,
            background: "var(--color-surface)",
            fontSize: 11.5,
            textDecoration: "none",
            color: UI.brand,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          Open →
        </a>
      </div>

      <div style={tableWrap}>
        <table style={table}>
          <colgroup>
            <col className={layoutStyles.extracted3} />
            <col className={layoutStyles.extracted4} />
            <col className={layoutStyles.extracted5} />
            <col className={layoutStyles.extracted6} />
            <col className={layoutStyles.extracted7} />
            <col className={layoutStyles.extracted8} />
            <col className={layoutStyles.extracted9} />
            <col className={layoutStyles.extracted10} />
            <col className={layoutStyles.extracted11} />
            <col className={layoutStyles.extracted12} />
            <col />
            <col className={layoutStyles.extracted13} />
          </colgroup>
          <thead>
            <tr>
              <th style={th}>Day</th>
              <th style={th}>Date</th>
              <th style={th}>Mode</th>
              <th style={th}>Leave</th>
              <th style={th}>Arrive</th>
              <th style={th}>Call</th>
              <th style={th}>Wrap</th>
              <th style={th}>Arrive Back</th>
              <th style={th}>Overnight</th>
              <th style={th}>Lunch Sup</th>
              <th style={th}>Notes</th>
              <th style={{ ...th, textAlign: "right" }}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ day, entry, iso, modeLabel, hours }) => (
              <tr key={day}>
                <td style={dayCell}>{day.slice(0, 3)}</td>
                <td style={td}>{iso || "—"}</td>
                <td style={td}>{modeLabel || "—"}</td>
                <td style={td}>{entry?.leaveTime || "—"}</td>
                <td style={td}>{entry?.arriveTime || "—"}</td>
                <td style={td}>{entry?.callTime || "—"}</td>
                <td style={td}>{entry?.wrapTime || "—"}</td>
                <td style={td}>{entry?.arriveBack || "—"}</td>
                <td style={td}>{entry?.overnight ? "Yes" : "No"}</td>
                <td style={td}>{entry?.lunchSup ? "Yes" : "No"}</td>
                <td style={{ ...td, ...notesCell }}>{entry?.dayNotes ? entry.dayNotes : "—"}</td>
                <td style={tdRight}>{hours ? hours.toFixed(1) : "0.0"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={11} style={{ ...foot, textAlign: "right" }}>
                Total
              </td>
              <td style={foot}>{totalHours.toFixed(1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────
   NEW: Non-editable status rule (view-only)
─────────────────────────────────────────────────────────────*/
const isCompleteStatus = (status = "") => {
  const s = String(status || "").toLowerCase().trim();
  return s === "complete" || s === "completed";
};

const isInvoiceStageStatus = (status = "") =>
  ["complete", "completed", "ready to invoice", "needs action", "invoiced", "paid"].includes(
    String(status || "").toLowerCase().trim()
  );

const LockedBookingNote = ({ status }) => (
  <div
    className={layoutStyles.extracted14}
    role="status"
  >
    <strong>View-only booking.</strong> {lockedBookingMessage(status)}
  </div>
);

const Btn = ({ children, disabled, onClick, variant = "base", title }) => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 30,
    padding: "6px 10px",
    borderRadius: 8,
    border: UI.border,
    fontSize: 12.5,
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const styles =
    variant === "primary"
      ? { ...base, background: "var(--button-primary-background)", color: "var(--button-primary-text)", border: "1px solid var(--button-primary-border)" }
      : variant === "danger"
      ? { ...base, background: "var(--color-danger)", color: "var(--color-white)", border: "1px solid var(--color-danger)" }
      : variant === "dark"
      ? { ...base, background: "var(--button-primary-background)", color: "var(--button-primary-text)", border: "1px solid var(--button-primary-border)" }
      : { ...base, background: "var(--color-surface-raised)", color: UI.text };

  return (
    <button disabled={disabled} onClick={disabled ? undefined : onClick} style={styles} title={title}>
      {children}
    </button>
  );
};

const Card = ({ children, id, tone = "white", style }) => (
  <div
    id={id}
    style={{
      background: tone === "alt" ? UI.bgAlt : "var(--color-surface)",
      border: tone === "plain" ? "none" : UI.border,
      borderRadius: UI.radius,
      padding: tone === "plain" ? 0 : 10,
      minWidth: 0,
      boxShadow: tone === "plain" ? "none" : "0 1px 0 rgba(15,23,42,0.02)",
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionTitle = ({ title, right }) => (
  <div className={layoutStyles.extracted15}>
    <div className={layoutStyles.extracted16}>{title}</div>
    {right}
  </div>
);

const FilesSection = ({
  id,
  job,
  locked,
  currentPdfUrl,
  fileSelected,
  uploading,
  progress,
  uploadError,
  onFileSelect,
  onUpload,
}) => {
  const fileRows = buildJobFileRows({ attachments: job?.attachments, currentPdfUrl });

  return (
    <Card id={id} tone="white" style={{ scrollMarginTop: LAYOUT.HEADER_H + 80 }}>
      <SectionTitle
        title="Files"
        right={
          fileRows.length ? (
            <span className={layoutStyles.fileCount}>
              {fileRows.length} file{fileRows.length === 1 ? "" : "s"}
            </span>
          ) : null
        }
      />

      {fileRows.length ? (
        <ul className={layoutStyles.fileList}>
          {fileRows.map((attachment, index) => (
            <li key={`${attachment?.url || attachment?.name || "file"}-${index}`} className={layoutStyles.fileRow}>
              <div className={layoutStyles.fileIdentity}>
                <a
                  href={attachment?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={layoutStyles.fileLink}
                >
                  {attachment?.name || `Attachment ${index + 1}`}
                </a>
                {attachment.isCurrentPdf ? (
                  <span className={layoutStyles.currentFileBadge}>Current PDF</span>
                ) : null}
              </div>
              <div className={layoutStyles.fileRowMeta}>
                {Number.isFinite(Number(attachment?.size)) && Number(attachment.size) > 0 ? (
                  <span className={layoutStyles.fileMeta}>
                    {(Number(attachment.size) / 1024 / 1024).toFixed(2)} MB
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={layoutStyles.emptyFiles}>No files attached to this booking.</div>
      )}

      {!locked && (
        <div className={layoutStyles.fileUpload}>
          <label className={layoutStyles.fileUploadLabel} htmlFor={`${id}-input`}>
            Add PDF
          </label>
          <input
            id={`${id}-input`}
            type="file"
            accept="application/pdf"
            onChange={(event) => onFileSelect(event.target.files?.[0])}
            className={layoutStyles.fileInput}
          />
          <Btn
            variant="dark"
            disabled={uploading || !fileSelected}
            onClick={onUpload}
          >
            {uploading
              ? `Uploading… ${progress ?? 0}%`
              : fileSelected
              ? currentPdfUrl
                ? "Replace / add PDF"
                : "Upload PDF"
              : "Select a PDF"}
          </Btn>
          {uploadError && <p className={layoutStyles.extracted60}>{uploadError}</p>}
        </div>
      )}
    </Card>
  );
};

const norm = (s) => String(s || "").toLowerCase().trim();
const matchText = (job, term) => {
  const t = norm(term);
  if (!t) return true;
  const hay = [
    job?.client,
    job?.production,
    job?.jobNumber,
    job?.location,
    job?.notes,
    job?.generalNotes,
    job?.jobNotes,
    Array.isArray(job?.vehicles) ? job.vehicles.map((v) => (typeof v === "string" ? v : v?.name)).join(" ") : "",
    Array.isArray(job?.employees) ? job.employees.map((e) => e?.name).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" • ")
    .toLowerCase();

  return hay.includes(t);
};

const firstJobDateMs = (job) => {
  const candidates = [
    ...(Array.isArray(job?.bookingDates) ? job.bookingDates : []),
    job?.date,
    job?.startDate,
    job?.endDate,
    job?.appointmentDateISO,
    job?.appointmentDate,
  ];
  const times = candidates
    .map((value) => parseDateFlexible(value))
    .filter(Boolean)
    .map((date) => date.getTime())
    .filter((time) => Number.isFinite(time));
  return times.length ? Math.min(...times) : Number.MAX_SAFE_INTEGER;
};

const compareJobsByDate = (a, b) => {
  const dateDiff = firstJobDateMs(b) - firstJobDateMs(a);
  if (dateDiff) return dateDiff;
  return String(a?.jobNumber || "").localeCompare(String(b?.jobNumber || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const getSortedJobDates = (job) => {
  const dates = Array.isArray(job?.bookingDates) ? job.bookingDates : [];
  return dates
    .map((value) => parseDateFlexible(value))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
};

const formatShortDate = (date) => format(date, "d MMM yyyy");

const formatCompactDateRange = (job) => {
  const dates = getSortedJobDates(job);
  if (!dates.length) return "No dates";
  const first = dates[0];
  const last = dates.at(-1);
  if (first.getTime() === last.getTime()) return formatShortDate(first);
  if (format(first, "MMM yyyy") === format(last, "MMM yyyy")) {
    return `${format(first, "d")}-${format(last, "d MMM yyyy")}`;
  }
  return `${format(first, "d MMM")}-${format(last, "d MMM yyyy")}`;
};

const getBookingDayCount = (job) => getSortedJobDates(job).length || Number(job?.bookingLengthDays) || 0;

const getCrewCount = (job) => {
  const allocated = Number(
    job?.allocatedCrewCount ?? (Array.isArray(job?.employees) ? job.employees.length : 0)
  );
  const required = Number(job?.requiredCrewCount || 0);
  return {
    allocated: Number.isFinite(allocated) ? allocated : 0,
    required: Number.isFinite(required) ? required : 0,
  };
};

const getInvoiceReadiness = (job, timesheets = [], status = "") => {
  const missing = [];
  const crew = getCrewCount(job);
  const statusNorm = norm(status || job?.status);

  if (!["complete", "ready to invoice", "paid"].includes(statusNorm)) missing.push("status");
  if (!String(job?.po || "").trim()) missing.push("PO");
  if (!String(job?.invoiceContactName || "").trim() || !String(job?.invoiceContactEmail || "").trim()) {
    missing.push("invoiceContact");
  }
  if (!timesheets.length) missing.push("timesheets");
  if (!renderNames(job?.vehicles, ["name", "registration", "vehicleName"])) missing.push("vehicle");
  if (crew.required > 0 && crew.allocated < crew.required) missing.push("crew");

  return {
    ready: missing.length === 0,
    missing,
    label: missing.length ? "Not ready" : "Ready",
  };
};

const countByStatus = (jobs, statusByJob = {}) =>
  jobs.reduce((acc, job) => {
    const status = String(statusByJob[job.id] || job.status || "Pending");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

/* ────────────────────────────────────────────────────────────
   Page
─────────────────────────────────────────────────────────────*/
export default function JobInfoPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = params?.id;
  const returnHref = safeInternalPath(searchParams.get("returnTo"), "/job-home");
  const backLabel = getJobNumberBackLabel(returnHref);
  const jobNumberPageHref = `/job-numbers/${encodeURIComponent(jobId || "")}${
    returnHref !== "/job-home" ? `?returnTo=${encodeURIComponent(returnHref)}` : ""
  }`;
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [relatedJobs, setRelatedJobs] = useState([]);
  const [timesheetsByJob, setTimesheetsByJob] = useState({});
  const [statusByJob, setStatusByJob] = useState({});
  const [selectedStatusByJob, setSelectedStatusByJob] = useState({});
  const [dayNotes, setDayNotes] = useState({});
  const [vehicleMap, setVehicleMap] = useState({});

  const [pdfFileByJob, setPdfFileByJob] = useState({});
  const [uploadingByJob, setUploadingByJob] = useState({});
  const [progressByJob, setProgressByJob] = useState({});
  const [errorByJob, setErrorByJob] = useState({});
  const [reopeningByJob, setReopeningByJob] = useState({});
  const [deletingJobId, setDeletingJobId] = useState("");

  // NEW: search + filter + collapse
  const sessionKey = `job-numbers:${jobId || "unknown"}`;
  const [search, setSearch] = useSessionState(`${sessionKey}:search`, "");
  const [statusFilter, setStatusFilter] = useSessionState(`${sessionKey}:statusFilter`, "All");
  const [expandedById, setExpandedById] = useSessionState(`${sessionKey}:expandedById`, {}); // { [jobId]: true/false }
  const searchRef = useRef(null);
  useSessionScroll(sessionKey);

  const isJobNumber = useMemo(() => {
    if (!jobId) return false;
    return typeof jobId === "string" && (/^\d{4}/.test(jobId) || (jobId.length > 5 && jobId.includes("-")));
  }, [jobId]);

  const normalizeVehiclesForJob = (job, vmap) => {
    if (!Array.isArray(job.vehicles)) return job;
    const enriched = job.vehicles.map((v) => {
      if (!v) return v;
      if (typeof v === "string") {
        return vmap[v] || { name: v };
      }
      if (typeof v === "object") {
        const key = v.id || v.registration || v.name;
        const full = key ? vmap[key] : null;
        return full ? { ...full, ...v } : v;
      }
      return v;
    });
    return { ...job, vehicles: enriched };
  };

  useEffect(() => {
    if (!jobId) return;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (reportDataAccessBlocked(gate, { collectionName: "bookings", operation: "Load job number detail" })) return;

    const fetchAll = async () => {
      try {
        let mainJob;
        let qJobs;

        if (isJobNumber) {
          const prefix = splitJobNumber(jobId).prefix;
          qJobs = tenantCollectionQuery(
            db,
            "bookings",
            dataAccessState,
            [
            where("jobNumber", ">=", prefix),
            where("jobNumber", "<", prefix + "\uf8ff")
            ]
          );
          const snap = await getDocs(qJobs);
          const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(compareJobsByDate);
          mainJob = jobs[0] || null;
          setRelatedJobs(jobs);
        } else {
          const docSnap = await getDoc(doc(db, "bookings", jobId));
          if (!docSnap.exists()) {
            setRelatedJobs([]);
            return;
          }
          mainJob = { id: docSnap.id, ...docSnap.data() };

          const prefix = splitJobNumber(mainJob.jobNumber).prefix;
          qJobs = tenantCollectionQuery(
            db,
            "bookings",
            dataAccessState,
            [
            where("jobNumber", ">=", prefix),
            where("jobNumber", "<", prefix + "\uf8ff")
            ]
          );
          const snap = await getDocs(qJobs);
          const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(compareJobsByDate);
          if (!jobs.find((j) => j.id === mainJob.id)) jobs.unshift(mainJob);
          setRelatedJobs(jobs.sort(compareJobsByDate));
        }

        if (!mainJob) return;

        const initStatus = {};
        const initNotes = {};
        setRelatedJobs((jobs) => {
          jobs.forEach((j) => {
            initStatus[j.id] = j.status || "Pending";
            initNotes[j.id] = { general: j.generalNotes || "" };
          });
          return jobs;
        });
        setStatusByJob(initStatus);
        setSelectedStatusByJob(initStatus);
        setDayNotes(initNotes);

        // init collapse: only main job expanded by default
        setExpandedById((prev) => {
          const next = { ...prev };
          // collapse all first
          (Array.isArray(relatedJobs) ? relatedJobs : []).forEach((j) => {
            if (j?.id) next[j.id] = false;
          });
          if (mainJob?.id) next[mainJob.id] = true;
          return next;
        });

        const tsSnap = await getDocs(tenantCollectionQuery(db, "timesheets", dataAccessState));
        const allTs = tsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const jobsToIndex = (await getDocs(qJobs)).docs.map((d) => ({ id: d.id, ...d.data() })).sort(compareJobsByDate);
        const ids = new Set(jobsToIndex.map((j) => j.id));

        const map = {};
        allTs.forEach((ts) => {
          const linkedIds = new Set();
          if (ts.jobId) linkedIds.add(ts.jobId);
          if (ts.jobSnapshot?.bookingIds?.length) ts.jobSnapshot.bookingIds.forEach((b) => linkedIds.add(b));
          if (ts.days) {
            Object.values(ts.days).forEach((e) => {
              if (e?.bookingId) linkedIds.add(e.bookingId);
            });
          }
          linkedIds.forEach((jid) => {
            if (!ids.has(jid)) return;
            if (!map[jid]) map[jid] = [];
            map[jid].push(ts);
          });
        });
        setTimesheetsByJob(map);

        const vSnap = await getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState));
        const vMap = vSnap.docs.reduce((acc, d) => {
          const v = { id: d.id, ...d.data() };
          const keys = [v.id, v.name, v.registration].filter(Boolean);
          keys.forEach((k) => (acc[String(k)] = v));
          return acc;
        }, {});
        setVehicleMap(vMap);
      } catch (e) {
        console.error("Error fetching job/timesheet data:", e);
      }
    };

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, dataAccessState, jobId, isJobNumber]);

  const computeIsPaid = (job) =>
    job.status === "Paid" || (job.invoiceStatus && job.invoiceStatus.toLowerCase().includes("paid"));

  const saveJobStatus = async (id, status) => {
    try {
      const job = relatedJobs.find((j) => j.id === id);
      const updates = { status };

      if (status === "Complete" && job) {
        Object.assign(updates, buildVehicleNameStatusUpdates(job, "Complete"));
      }
      if (status === "Ready to Invoice" && job) {
        updates.vehicleStatus = buildSynchronizedVehicleStatus(job, status);
      }

      await updateDoc(doc(db, "bookings", id), tenantPayload(dataAccessState, updates));

      setRelatedJobs((current) =>
        current.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
      setStatusByJob((p) => ({ ...p, [id]: status }));
      setSelectedStatusByJob((p) => ({ ...p, [id]: status }));
      systemDialogs.showSystemNotification(`Status updated to ${status}`);
    } catch (e) {
      console.error(e);
      systemDialogs.showSystemNotification("Failed to update status.");
    }
  };

  const saveJobStatusWithWarning = async ({ job, status, bookingBlockers, invoiceBlockers }) => {
    const warnings = getStatusTransitionWarnings({
      targetStatus: status,
      bookingBlockers,
      invoiceBlockers,
    });
    if (warnings.length) {
      const confirmed = await systemDialogs.confirmSystem(
        `The following checks are still missing:\n\n${warnings.map((warning) => `• ${warning}`).join("\n")}\n\nContinue with this status anyway?`,
        {
          title: `Save as ${status}?`,
          confirmLabel: "Continue",
          cancelLabel: "Cancel",
          danger: false,
        }
      );
      if (!confirmed) return;
    }
    await saveJobStatus(job.id, status);
  };

  const openBookingEditor = (id) => {
    router.push(`/edit-booking/${id}?returnTo=${encodeURIComponent(jobNumberPageHref)}`);
  };

  const focusJobField = (detailsId, fieldId) => {
    if (typeof document === "undefined") return;
    const details = document.getElementById(detailsId);
    if (details instanceof HTMLDetailsElement) details.open = true;
    requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
  };

  const scrollToJobSection = (sectionId) => {
    if (typeof document === "undefined") return;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveJobSummary = async (id) => {
    const notes = dayNotes[id]?.general || "";
    try {
      await updateDoc(doc(db, "bookings", id), tenantPayload(dataAccessState, { generalNotes: notes }));
      systemDialogs.showSystemNotification("Summary saved.");
    } catch (e) {
      console.error(e);
      systemDialogs.showSystemNotification("Failed to save summary.");
    }
  };

  const reopenBooking = async (job) => {
    if (!job?.id || reopeningByJob[job.id]) return;

    const confirmed = await systemDialogs.confirmSystem(
      "Reopen this booking as Enquiry? Crew and vehicle allocations must be reviewed before it is confirmed again."
    );
    if (!confirmed) return;

    setReopeningByJob((current) => ({ ...current, [job.id]: true }));
    try {
      const currentJob = {
        ...job,
        status: statusByJob[job.id] || job.status,
      };
      const updates = buildReopenBookingPayload(currentJob, {
        timestamp: new Date().toISOString(),
        actor: {
          email: dataAccessState.userDoc?.email || dataAccessState.user?.email || "Unknown",
          uid: dataAccessState.user?.uid || dataAccessState.userDoc?.uid || "",
        },
      });

      await updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, updates));
      setRelatedJobs((current) =>
        current.map((item) => (item.id === job.id ? { ...item, ...updates } : item))
      );
      setStatusByJob((current) => ({ ...current, [job.id]: updates.status }));
      setSelectedStatusByJob((current) => ({ ...current, [job.id]: updates.status }));
      systemDialogs.showSystemNotification("Booking reopened as Enquiry. Review its allocations before confirming it.");
      router.push(
        `/edit-booking/${job.id}?reopened=1&returnTo=${encodeURIComponent(
          jobNumberPageHref
        )}`
      );
    } catch (error) {
      console.error("Failed to reopen booking:", error);
      systemDialogs.showSystemNotification("Failed to reopen booking. No changes were made.");
      setReopeningByJob((current) => ({ ...current, [job.id]: false }));
    }
  };

  const deleteJob = async (id) => {
    if (deletingJobId) return;

    const reasonInput = await systemDialogs.promptSystem(
      "Reason for deleting this booking (required):",
      "",
      { title: "Delete booking", confirmLabel: "Continue" }
    );
    if (reasonInput === null) return;

    const deleteReason = String(reasonInput || "").trim();
    if (!deleteReason) {
      systemDialogs.showSystemNotification("A deletion reason is required.");
      return;
    }

    const confirmed = await systemDialogs.confirmSystem(
      "Move this booking to Deleted Bookings? It can be restored later.",
      { title: "Archive deleted booking", confirmLabel: "Delete booking" }
    );
    if (!confirmed) return;

    setDeletingJobId(id);
    try {
      const bookingRef = doc(db, "bookings", String(id));
      const bookingSnapshot = await getDoc(bookingRef);
      if (!bookingSnapshot.exists()) {
        systemDialogs.showSystemNotification("Booking not found (already deleted?).");
        return;
      }

      const batch = writeBatch(db);
      batch.set(
        doc(db, "deletedBookings", String(id)),
        tenantPayload(dataAccessState, {
          originalCollection: "bookings",
          originalId: String(id),
          deletedAt: serverTimestamp(),
          deletedBy:
            auth?.currentUser?.email ||
            dataAccessState?.user?.email ||
            dataAccessState?.user?.uid ||
            "",
          deleteReasons: ["Other"],
          deleteReasonOther: deleteReason,
          data: bookingSnapshot.data(),
        })
      );
      batch.delete(bookingRef);
      await batch.commit();

      systemDialogs.queueSystemNotification({
        type: "success",
        title: "Booking deleted",
        message: "Booking stored in Deleted Bookings and can be restored.",
      });
      router.push(returnHref);
    } catch (e) {
      console.error(e);
      systemDialogs.showSystemNotification("Failed to delete booking. No changes were made.");
    } finally {
      setDeletingJobId("");
    }
  };

  const onPdfSelect = (jid, file) => {
    setPdfFileByJob((p) => ({ ...p, [jid]: file }));
    setErrorByJob((p) => ({ ...p, [jid]: null }));
  };

  const uploadPdfForJob = async (jid) => {
    const file = pdfFileByJob[jid];
    if (!file || uploadingByJob[jid]) return;

    try {
      setUploadingByJob((p) => ({ ...p, [jid]: true }));
      setProgressByJob((p) => ({ ...p, [jid]: 0 }));
      setErrorByJob((p) => ({ ...p, [jid]: null }));

      const safeName = file.name.replace(/\s+/g, "_");
      const stamp = Date.now();
      const path = `job_attachments/${jid}/${stamp}_${safeName}`;

      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file, { contentType: file.type || "application/pdf" });

      task.on(
        "state_changed",
        (snap) => {
          const prog = (snap.bytesTransferred / snap.totalBytes) * 100;
          setProgressByJob((p) => ({ ...p, [jid]: Math.round(prog) }));
        },
        (err) => {
          console.error(err);
          setErrorByJob((p) => ({ ...p, [jid]: err.message || "Upload failed" }));
          setUploadingByJob((p) => ({ ...p, [jid]: false }));
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);

          const attachment = {
            name: file.name,
            size: file.size,
            type: file.type || "application/pdf",
            url,
            storagePath: path,
            uploadedAt: new Date().toISOString(),
          };

          await updateDoc(doc(db, "bookings", jid), tenantPayload(dataAccessState, {
            attachments: arrayUnion(attachment),
            pdfUrl: url,
          }));

          setRelatedJobs((prev) =>
            prev.map((j) =>
              j.id !== jid
                ? j
                : {
                    ...j,
                    pdfUrl: url,
                    attachments: Array.isArray(j.attachments) ? [...j.attachments, attachment] : [attachment],
                  }
            )
          );

          setUploadingByJob((p) => ({ ...p, [jid]: false }));
          setProgressByJob((p) => ({ ...p, [jid]: 100 }));
          setPdfFileByJob((p) => ({ ...p, [jid]: null }));
          systemDialogs.showSystemNotification("PDF uploaded.");
        }
      );
    } catch (e) {
      console.error(e);
      setErrorByJob((p) => ({ ...p, [jid]: e.message || "Upload failed" }));
      setUploadingByJob((p) => ({ ...p, [jid]: false }));
    }
  };

  //  Hash scrolling + ALSO expand the target job when opened via link
  useEffect(() => {
    if (typeof window === "undefined") return;

    const getTargetJobIdFromHash = () => {
      const hash = window.location.hash || "";
      if (!hash) return null;
      const id = decodeURIComponent(hash.slice(1)); // e.g. "job-abc123"
      if (!id.startsWith("job-")) return null;
      return id.replace("job-", "");
    };

    const scrollToHash = (attempt = 0) => {
      const hash = window.location.hash || "";
      if (!hash) return;

      const domId = decodeURIComponent(hash.slice(1));
      if (!domId) return;

      const el = document.getElementById(domId);

      if (!el) {
        if (attempt < 30) setTimeout(() => scrollToHash(attempt + 1), 50);
        return;
      }

      // Expand job if hash points at a job section/sub-section
      const targetJobId = getTargetJobIdFromHash();
      if (targetJobId) {
        setExpandedById((p) => ({ ...p, [targetJobId]: true }));
      }

      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        window.scrollBy({ top: -(LAYOUT.HEADER_H + 12), left: 0, behavior: "instant" });
      }, 50);
    };

    // On load after render
    if (relatedJobs?.length) scrollToHash(0);

    const onHashChange = () => scrollToHash(0);
    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, [relatedJobs, setExpandedById]);

  const allJobs = useMemo(
    () => relatedJobs.map((j) => normalizeVehiclesForJob(j, vehicleMap)),
    [relatedJobs, vehicleMap]
  );
  const currentJobRecordId = allJobs.find((job) => job.id === jobId)?.id || allJobs[0]?.id || jobId;

  // Job Number routes can use the shared number rather than a booking document ID.
  // Keep the resolved current booking open using the same key as expandedById.
  useEffect(() => {
    if (!currentJobRecordId) return;
    setExpandedById((current) => ({ ...current, [currentJobRecordId]: true }));
  }, [currentJobRecordId, setExpandedById]);

  const statusOptions = useMemo(() => {
    const set = new Set(["All"]);
    allJobs.forEach((j) => set.add(String(statusByJob[j.id] || j.status || "Pending")));
    return Array.from(set);
  }, [allJobs, statusByJob]);

  const filteredJobs = useMemo(() => {
    const term = search.trim();
    return allJobs.filter((j) => {
      const s = String(statusByJob[j.id] || j.status || "Pending");
      const statusOk = statusFilter === "All" ? true : s === statusFilter;
      return statusOk && matchText({ ...j, status: s }, term);
    });
  }, [allJobs, search, statusFilter, statusByJob]);

  if (!jobId) {
    return (
      <HeaderSidebarLayout showBackButton={false}>
        <div className={layoutStyles.extracted17}>No Job ID provided.</div>
      </HeaderSidebarLayout>
    );
  }

  if (!relatedJobs.length) {
    return (
      <HeaderSidebarLayout showBackButton={false}>
        <div className={layoutStyles.extracted18}>Loading job details…</div>
      </HeaderSidebarLayout>
    );
  }

  const mainJob = allJobs.find((j) => j.id === jobId) || allJobs[0] || relatedJobs[0];
  const prefix = splitJobNumber(mainJob.jobNumber).prefix;
  const mainJobIdentity = formatProductionIdentity(mainJob);
  const statusCounts = countByStatus(allJobs, statusByJob);
  const statusSummary = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, count]) => `${count} ${status}`)
    .join(" - ");
  const notReadyCount = allJobs.reduce((total, job) => {
    const status = statusByJob[job.id] || job.status || "Pending";
    if (isLockedStatus(status) || !isInvoiceStageStatus(status)) return total;
    return total + (getInvoiceReadiness(job, timesheetsByJob[job.id] || [], status).ready ? 0 : 1);
  }, 0);
  const connectedSummary = buildConnectedBookingSummary(allJobs);
  const primaryContactName = getPrimaryContactName(allJobs);
  const isGroupedJobNumber = allJobs.length > 1;

  const toggleAll = (open) => {
    const next = {};
    filteredJobs.forEach((j) => (next[j.id] = !!open));
    // Always keep current job open
    if (currentJobRecordId) next[currentJobRecordId] = true;
    setExpandedById((p) => ({ ...p, ...next }));
  };

  return (
    <HeaderSidebarLayout showBackButton={false}>
      <div style={{ width: "100%", minHeight: "100%", backgroundColor: UI.bg, color: UI.text }}>
        {/* Sticky page header + list controls */}
        <div id="page-top" className={layoutStyles.workspaceToolbar}>
          <div className={layoutStyles.workspaceFrame}>
            <div className={layoutStyles.workspaceTitleRow}>
              <Btn onClick={() => router.push(returnHref)} variant="base">
                ← {backLabel}
              </Btn>

              <div className={layoutStyles.extracted20}>
                <div className={layoutStyles.extracted21}>
                  Job #{prefix} - {mainJobIdentity}
                </div>
              </div>
            </div>

            {isGroupedJobNumber && (
              <div className={layoutStyles.workspaceListTools}>
                <div className={layoutStyles.extracted23}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className={layoutStyles.extracted24}
                    aria-hidden
                  >
                    <path
                      d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search bookings"
                    className={layoutStyles.workspaceSearchInput}
                    aria-label="Search bookings"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={layoutStyles.workspaceStatusFilter}
                  aria-label="Filter bookings by status"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <div
                  className={layoutStyles.workspaceResultCount}
                  title="Visible bookings"
                  aria-live="polite"
                >
                  {filteredJobs.length} of {allJobs.length}
                </div>

                <div className={layoutStyles.workspaceBulkActions}>
                  <Btn variant="base" onClick={() => toggleAll(true)} title="Expand all bookings">
                    Expand all
                  </Btn>
                  <Btn variant="base" onClick={() => toggleAll(false)} title="Collapse all bookings except the current booking">
                    Collapse all
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Page content */}
        <div className={`${layoutStyles.workspaceFrame} ${layoutStyles.workspaceContent}`}>
          {isGroupedJobNumber && (
            <details className={layoutStyles.sharedSummary}>
              <summary className={layoutStyles.sharedSummaryToggle}>
                <div className={layoutStyles.sharedSummaryItems}>
                  <span className={layoutStyles.sharedSummaryItem}>
                    <span>Contact</span>
                    <strong>{primaryContactName}</strong>
                  </span>
                  <span className={layoutStyles.sharedSummaryItem}>
                    <span>Vehicles</span>
                    <strong>{formatSummaryCount(connectedSummary.vehicles.length, "vehicle")}</strong>
                  </span>
                  <span className={layoutStyles.sharedSummaryItem}>
                    <span>Crew</span>
                    <strong>{formatSummaryCount(connectedSummary.crew.length, "person", "people")}</strong>
                  </span>
                  <span className={layoutStyles.sharedSummaryItem}>
                    <span>Locations</span>
                    <strong>{formatSummaryCount(connectedSummary.locations.length, "location")}</strong>
                  </span>
                </div>

                <div className={layoutStyles.sharedSummaryStatus}>
                  {statusSummary && <Badge text={statusSummary} bg={UI.brandSoft} fg={UI.brand} border={UI.brandBorder} />}
                  {notReadyCount > 0 && (
                    <Badge
                      text={`${notReadyCount} not ready for invoice`}
                      bg="var(--color-warning-soft)"
                      fg="var(--color-warning)"
                      border="var(--color-warning-border)"
                    />
                  )}
                  <span className={layoutStyles.sharedSummaryDisclosure}>
                    <span className={layoutStyles.sharedSummaryClosedLabel}>View shared details</span>
                    <span className={layoutStyles.sharedSummaryOpenLabel}>Hide shared details</span>
                  </span>
                </div>
              </summary>

              <div className={layoutStyles.sharedSummaryDetails}>
                {[
                  ["Contacts", connectedSummary.contacts],
                  ["Vehicles assigned", connectedSummary.vehicles],
                  ["Crew allocated", connectedSummary.crew],
                  ["Locations", connectedSummary.locations],
                ].map(([title, values]) => (
                  <div key={title} className={layoutStyles.sharedSummaryDetailGroup}>
                    <div className={layoutStyles.sharedSummaryDetailLabel}>{title}</div>
                    <div className={layoutStyles.sharedSummaryDetailValue}>
                      {values.length ? values.join("\n") : "None"}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {!filteredJobs.length ? (
            <div
              className={layoutStyles.extracted31}
            >
              No jobs match your search/filter.
            </div>
          ) : (
            filteredJobs.map((job) => {
              const JOB_SECTION_ID = `job-${job.id}`;
              const OVERVIEW_ID = `${JOB_SECTION_ID}-overview`;
              const TIMESHEETS_ID = `${JOB_SECTION_ID}-timesheets`;
              const STATUS_ID = `${JOB_SECTION_ID}-status`;
              const NOTES_PO_ID = `${JOB_SECTION_ID}-notes-po`;
              const ATTACHMENTS_ID = `${JOB_SECTION_ID}-attachments`;
              const FINANCE_DETAILS_ID = `${JOB_SECTION_ID}-finance-details`;
              const PO_INPUT_ID = `${JOB_SECTION_ID}-po-input`;
              const INVOICE_CONTACT_INPUT_ID = `${JOB_SECTION_ID}-invoice-contact-input`;

              const currentDbStatus = statusByJob[job.id] || job.status || "Pending";
              const selected = selectedStatusByJob[job.id] ?? currentDbStatus;
              const isPaid = computeIsPaid(job);

              const locked = isLockedStatus(currentDbStatus);
              const suppressMissingWarnings = locked || isCompleteStatus(currentDbStatus);

              const isExpanded = expandedById[job.id] ?? (job.id === currentJobRecordId); // default current open

              const timesheets = (timesheetsByJob[job.id] || []).slice().sort((a, b) => {
                const t = (v) => parseDateFlexible(v)?.getTime() || 0;
                return t(b.weekStart) - t(a.weekStart);
              });

              const uploadError = errorByJob[job.id];
              const fileSelected = pdfFileByJob[job.id];
              const currentPdfUrl = job.pdfURL || job.pdfUrl || "";

              const cards = timesheets.map((ts) => renderTimesheet(ts, job, vehicleMap, true)).filter(Boolean);

              const jobNotesText = [job.jobNotes, job.notes, job.generalNotes].filter(Boolean).join("\n\n");
              const quoteNumberRaw = getJobQuoteNumber(job);
              const quoteRevision = splitQuoteRevision(quoteNumberRaw);
              const quoteNumberDisplay = quoteRevision.publicNumber;
              const quoteRevisionLabel = quoteRevision.revision ? `Rev ${quoteRevision.revision}` : "";
              const jobIdentity = formatProductionIdentity(job);
              const quoteViewHref = quoteNumberRaw
                ? `/quote-view/${job.id}?quote=${encodeURIComponent(quoteNumberRaw)}`
                : `/quote-view/${job.id}`;
              const quoteEditHref = quoteNumberRaw
                ? `/quote/${job.id}?quote=${encodeURIComponent(quoteNumberRaw)}`
                : `/quote/${job.id}`;
              const quotePrintHref = `${quoteEditHref}${quoteEditHref.includes("?") ? "&" : "?"}action=download`;
              const vehicleSummary = renderVehicleNames(job.vehicles);
              const crewCount = getCrewCount(job);
              const dayCount = getBookingDayCount(job);
              const dateSummary = formatCompactDateRange(job);
              const invoiceStage = isInvoiceStageStatus(currentDbStatus);
              const invoiceReadiness = getInvoiceReadiness(job, timesheets, currentDbStatus);
              const targetInvoiceReadiness = getInvoiceReadiness(job, timesheets, "Ready to Invoice");
              const invoiceChecklist = [
                ["status", "Status complete", "Complete status"],
                ["PO", "PO reference", "Add PO"],
                ["invoiceContact", "Invoicing contact", "Add invoice contact"],
                ["timesheets", "Linked timesheets", "Review timesheets"],
                ["vehicle", "Vehicle assigned", "Assign vehicle"],
                ["crew", "Crew allocated", "Allocate crew"],
              ].map(([key, label, actionLabel]) => ({
                key,
                label,
                actionLabel,
                ok: !invoiceReadiness.missing.includes(key),
              }));
              const targetInvoiceBlockers = invoiceChecklist
                .map((item) => ({
                  ...item,
                  ok: !targetInvoiceReadiness.missing.includes(item.key),
                }))
                .filter((item) => !item.ok);
              const bookingChecklist = [
                ["production", "Production added", "Add production", Boolean(String(job.production || "").trim())],
                ["location", "Location added", "Add location", Boolean(String(job.location || "").trim())],
                ["contact", "Booking contact added", "Add contact", Boolean(formatJobContacts(job))],
                ["vehicle", "Vehicle assigned", "Assign vehicle", Boolean(vehicleSummary)],
                ["crew", "Crew allocated", "Allocate crew", crewCount.required === 0 || crewCount.allocated >= crewCount.required],
              ].map(([key, label, actionLabel, ok]) => ({ key, label, actionLabel, ok }));
              const readinessChecklist = invoiceStage ? invoiceChecklist : bookingChecklist;
              const readinessBlockers = readinessChecklist.filter((item) => !item.ok);
              const readinessReady = readinessBlockers.length === 0;
              const handleReadinessAction = (key) => {
                if (key === "PO") return focusJobField(FINANCE_DETAILS_ID, PO_INPUT_ID);
                if (key === "invoiceContact") {
                  return focusJobField(FINANCE_DETAILS_ID, INVOICE_CONTACT_INPUT_ID);
                }
                if (key === "timesheets") return scrollToJobSection(TIMESHEETS_ID);
                return openBookingEditor(job.id);
              };
              const statusHasChanged = selected !== currentDbStatus;
              const showPoWarning = invoiceStage || norm(currentDbStatus) === "confirmed";
              const rowWarnings = suppressMissingWarnings
                ? []
                : [
                    !vehicleSummary ? "Vehicle missing" : "",
                    crewCount.required > 0 && crewCount.allocated < crewCount.required
                      ? `Crew ${crewCount.allocated}/${crewCount.required}`
                      : "",
                    showPoWarning && !String(job.po || "").trim() ? "PO missing" : "",
                    invoiceStage && timesheets.length === 0 ? "0 timesheets" : "",
                  ].filter(Boolean);
              const bookingMeta = [
                dateSummary,
                dayCount ? `${dayCount} day${dayCount === 1 ? "" : "s"}` : "",
                formatJobLocation(job.location),
                vehicleSummary,
              ]
                .filter(Boolean)
                .join(" · ");
              const hasNotesByDate =
                job.notesByDate && typeof job.notesByDate === "object" && Object.keys(job.notesByDate).length > 0;
              const quoteNumberValue = (
                <div className={layoutStyles.extracted32}>
                  <span>{quoteNumberDisplay || "-"}</span>
                  {quoteRevisionLabel && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: 22,
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: UI.border,
                        background: "var(--color-surface-subtle)",
                        color: UI.muted,
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                      title={quoteNumberRaw}
                    >
                      {quoteRevisionLabel}
                    </span>
                  )}
                </div>
              );
              const overviewRows = [
                ["Job Number", job.jobNumber || job.id],
                ["Quote Number", quoteNumberRaw ? quoteNumberValue : quoteNumberDisplay],
                ["Status", currentDbStatus],
                ["Production Company", job.client],
                ["Production", job.production],
                ["Shoot Type", job.shootType],
                ["Location", formatJobLocation(job.location)],
                ["Dates", renderDateBlock(job)],
                ["Call Time", job.callTime || renderNames(Object.values(job.callTimesByDate || {}))],
                ["Crew allocated", renderCrewNames(job)],
                ["Crew requirement", `${job.allocatedCrewCount ?? (Array.isArray(job.employees) ? job.employees.length : 0)} / ${job.requiredCrewCount || 0}`],
                ["Vehicles assigned", vehicleSummary],
                ["Equipment assigned", renderNames(job.equipment, ["name", "equipmentName"])],
                ["Contacts", formatJobContacts(job)],
                ["PO", job.po],
                ["Hotel", job.hasHotel ? `${yesNo(job.hasHotel)}${job.hotelNights ? ` - ${job.hotelNights} nights` : ""}${job.hotelPaidBy ? ` - ${job.hotelPaidBy}` : ""}` : "No"],
              ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");

              return (
                <section
                  key={job.id}
                  id={JOB_SECTION_ID}
                  className={layoutStyles.bookingSection}
                  data-expanded={isExpanded ? "true" : undefined}
                  data-current={job.id === currentJobRecordId ? "true" : undefined}
                  style={{
                    borderTop: isExpanded ? UI.border : "none",
                    borderRight: isExpanded ? UI.border : "none",
                    borderLeft: job.id === currentJobRecordId
                      ? `3px solid ${UI.brand}`
                      : isExpanded
                      ? UI.border
                      : "3px solid transparent",
                    borderBottom: isExpanded ? UI.border : "1px solid var(--color-border)",
                    borderRadius: isExpanded ? 8 : 0,
                    padding: isExpanded ? 8 : "4px 8px",
                    marginBottom: isExpanded ? 10 : 0,
                    boxShadow: "none",
                    background: isExpanded || locked ? "var(--color-surface-subtle)" : "transparent",
                    minWidth: 0,
                    scrollMarginTop: LAYOUT.HEADER_H + 80, // extra for search row
                  }}
                >
                  {/* Collapsible header */}
                  <div
                    onClick={() => setExpandedById((p) => ({ ...p, [job.id]: !isExpanded }))}
                    className={layoutStyles.bookingHeader}
                    style={{
                      padding: 6,
                      borderRadius: 8,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    title={isExpanded ? "Collapse" : "Expand"}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedById((current) => ({ ...current, [job.id]: !isExpanded }));
                      }}
                      aria-expanded={isExpanded}
                      aria-controls={`${JOB_SECTION_ID}-body`}
                      aria-label={isExpanded ? "Collapse booking details" : "Expand booking details"}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        border: UI.border,
                        background: "var(--color-surface-raised)",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 900,
                        color: UI.muted,
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "–" : "+"}
                    </button>

                    <div className={layoutStyles.extracted33}>
                      <div className={layoutStyles.extracted34}>
                        <StatusPill value={currentDbStatus} />
                        {isPaid && <PaidPill />}
                        <div
                          className={layoutStyles.extracted35}
                          title={`${jobIdentity} - #${job.jobNumber || job.id}${quoteNumberDisplay ? ` - ${quoteNumberDisplay}` : ""}`}
                        >
                          {jobIdentity} - #{job.jobNumber || job.id}
                          {quoteNumberDisplay ? ` - ${quoteNumberDisplay}` : ""}
                        </div>
                      </div>

                      <div className={layoutStyles.extracted36}>
                        {bookingMeta && (
                          <span className={layoutStyles.bookingMetaText} title={bookingMeta}>
                            {bookingMeta}
                          </span>
                        )}
                        {rowWarnings.length > 0 && (
                          <span
                            className={layoutStyles.bookingWarningSummary}
                            title={`Needs attention: ${rowWarnings.join(", ")}`}
                          >
                            <span className={layoutStyles.bookingWarningDot} aria-hidden="true" />
                            <span>{rowWarnings.join(" · ")}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick actions do not toggle collapse when clicked */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={layoutStyles.extracted37}
                    >
                      {quoteNumberRaw && (
                        <>
                          <Btn title="Open this quote viewer" onClick={() => router.push(quoteViewHref)}>
                            Open quote
                          </Btn>
                          <Btn title="Open this quote ready for PDF/print" onClick={() => router.push(quotePrintHref)}>
                            PDF
                          </Btn>
                        </>
                      )}
                      {locked ? (
                        <Btn
                          variant="primary"
                          disabled={reopeningByJob[job.id]}
                          title="Reopen this booking as Enquiry"
                          onClick={() => reopenBooking(job)}
                        >
                          {reopeningByJob[job.id] ? "Reopening…" : "Reopen booking"}
                        </Btn>
                      ) : (
                        <Btn
                          variant="primary"
                          title="Edit booking"
                          onClick={() => openBookingEditor(job.id)}
                        >
                          Edit
                        </Btn>
                      )}

                      {!locked && <details className={layoutStyles.extracted38}>
                        <summary
                          style={{
                            listStyle: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 30,
                            minWidth: 36,
                            padding: "0 7px",
                            border: UI.border,
                            borderRadius: 8,
                            background: "var(--color-surface-raised)",
                            color: UI.text,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                          title="More actions"
                          aria-label="More actions"
                        >
                          •••
                        </summary>
                        <div
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 34,
                            zIndex: 4,
                            minWidth: 150,
                            border: UI.border,
                            borderRadius: 8,
                            background: "var(--color-surface)",
                            boxShadow: UI.shadowHover,
                            padding: 6,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => deleteJob(job.id)}
                            disabled={Boolean(deletingJobId)}
                            style={{
                              width: "100%",
                              border: "none",
                              background: "transparent",
                              color: "var(--color-danger)",
                              textAlign: "left",
                              padding: "8px 10px",
                              borderRadius: 6,
                              fontWeight: 900,
                              cursor: deletingJobId ? "wait" : "pointer",
                              opacity: deletingJobId && deletingJobId !== job.id ? 0.55 : 1,
                            }}
                          >
                            {deletingJobId === job.id ? "Deleting…" : "Delete booking"}
                          </button>
                        </div>
                      </details>}
                    </div>
                  </div>

                  {locked && isExpanded && <LockedBookingNote status={currentDbStatus} />}

                  {/* Collapsed body */}
                  {!isExpanded ? null : (
                    <div id={`${JOB_SECTION_ID}-body`} className={layoutStyles.extracted39}>
                      {/* Two-column layout */}
                      <div
                        className={layoutStyles.extracted40}
                        data-locked={locked ? "true" : undefined}
                      >
                        {/* LEFT */}
                        <div className={layoutStyles.extracted41}>
                          {/* Overview */}
                          <Card id={OVERVIEW_ID} tone="plain" style={{ scrollMarginTop: LAYOUT.HEADER_H + 80 }}>
                            <SectionTitle title="Overview" />

                            <div
                              className={layoutStyles.extracted42}
                            >
                              {overviewRows.map(([label, value]) => (
                                <div
                                  key={label}
                                  className={layoutStyles.extracted43}
                                >
                                  <div
                                    style={{
                                      color: UI.muted,
                                      fontWeight: 900,
                                      textTransform: "uppercase",
                                      fontSize: 10.5,
                                    }}
                                  >
                                    {label}
                                  </div>
                                  <div className={layoutStyles.extracted44}>
                                    {value || "-"}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Read-only Notes */}
                            {(jobNotesText || hasNotesByDate) && (
                              <div className={layoutStyles.extracted45}>
                                <SectionTitle title="Job Notes" />
                                {jobNotesText && (
                                  <div
                                    style={{
                                      whiteSpace: "pre-wrap",
                                      color: UI.text,
                                      fontSize: 13,
                                      background: "var(--color-surface-subtle)",
                                      borderRadius: 6,
                                      padding: "8px 10px",
                                      minWidth: 0,
                                      overflowWrap: "anywhere",
                                    }}
                                  >
                                    {jobNotesText}
                                  </div>
                                )}
                                {hasNotesByDate && (
                                  <div className={layoutStyles.extracted46}>
                                    {Object.keys(job.notesByDate)
                                      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                                      .sort()
                                      .map((dateKey) => {
                                        const note = job.notesByDate[dateKey];
                                        if (!note) return null;
                                        const nice = new Date(dateKey).toLocaleDateString("en-GB", {
                                          weekday: "short",
                                          day: "2-digit",
                                          month: "short",
                                        });
                                        return (
                                          <div key={dateKey} style={{ fontSize: 13, color: UI.text, overflowWrap: "anywhere" }}>
                                            <strong style={{ color: UI.muted }}>{nice}:</strong> {note}
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                            )}
                          </Card>

                          {/* Timesheets */}
                          {(!locked || cards.length > 0) && <Card id={TIMESHEETS_ID} tone="plain" style={{ scrollMarginTop: LAYOUT.HEADER_H + 80 }}>
                            <SectionTitle
                              title="Linked Timesheets"
                              right={
                                <span style={{ color: UI.muted, fontSize: 12, fontWeight: 900 }}>
                                  {(timesheetsByJob[job.id] || []).length} found
                                </span>
                              }
                            />

                            {cards.length ? (
                              <div className={layoutStyles.extracted47}>{cards.map((c, i) => <div key={i}>{c}</div>)}</div>
                            ) : (
                              <div className={layoutStyles.compactEmptyState}>No timesheets linked yet.</div>
                            )}
                          </Card>}

                          <FilesSection
                            id={ATTACHMENTS_ID}
                            job={job}
                            locked={locked}
                            currentPdfUrl={currentPdfUrl}
                            fileSelected={fileSelected}
                            uploading={uploadingByJob[job.id]}
                            progress={progressByJob[job.id]}
                            uploadError={uploadError}
                            onFileSelect={(file) => onPdfSelect(job.id, file)}
                            onUpload={() => uploadPdfForJob(job.id)}
                          />
                        </div>

                        {/* RIGHT: Actions (sticky) */}
                        {!locked && <div
                          style={{
                            display: "grid",
                            gap: 10,
                            alignSelf: "start",
                            position: "sticky",
                            top: LAYOUT.HEADER_H + 68, // below the search row
                            minWidth: 0,
                          }}
                        >
                          {/* Status */}
                          <Card
                            id={STATUS_ID}
                            tone="white"
                            style={{
                              scrollMarginTop: LAYOUT.HEADER_H + 80,
                            }}
                          >
                            <SectionTitle title={invoiceStage ? "Status & Invoice" : "Booking status"} />

                            <div className={layoutStyles.extracted48}>
                              {["Ready to Invoice", "Needs Action", "Complete"].map((opt) => {
                                const active = selected === opt;
                                const color = statusColor(opt);
                                const disabled = isPaid;

                                return (
                                  <button
                                    key={opt}
                                    onClick={() => {
                                      if (!disabled) setSelectedStatusByJob((prev) => ({ ...prev, [job.id]: opt }));
                                    }}
                                    disabled={disabled}
                                    style={{
                                      minHeight: 30,
                                      padding: "6px 8px",
                                      borderRadius: 8,
                                      border: active ? `2px solid ${color.border}` : UI.border,
                                      background: active ? color.bg : "var(--color-surface)",
                                      color: active ? color.text : "var(--color-text)",
                                      fontWeight: 900,
                                      cursor: disabled ? "not-allowed" : "pointer",
                                      opacity: disabled ? 0.55 : 1,
                                      fontSize: 11.5,
                                      whiteSpace: "nowrap",
                                    }}
                                    title={isPaid ? "Paid jobs are locked" : ""}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>

                            {statusHasChanged && (
                              <Btn
                                variant="dark"
                                disabled={isPaid}
                                title={isPaid ? "Paid jobs are locked" : "Save status"}
                                onClick={() =>
                                  saveJobStatusWithWarning({
                                    job,
                                    status: selected,
                                    bookingBlockers: bookingChecklist.filter((item) => !item.ok),
                                    invoiceBlockers: targetInvoiceBlockers,
                                  })
                                }
                              >
                                Save Status Change
                              </Btn>
                            )}

                            <div
                              className={layoutStyles.invoiceReadiness}
                              data-state={readinessReady ? "ready" : "blocked"}
                            >
                              <div className={layoutStyles.extracted49}>
                                <div className={layoutStyles.extracted50}>
                                  {invoiceStage ? "Invoice readiness" : "Booking readiness"}
                                </div>
                                <Badge
                                  text={readinessReady ? "Ready" : `${readinessBlockers.length} action${readinessBlockers.length === 1 ? "" : "s"}`}
                                  bg={readinessReady ? "var(--color-success-soft)" : "var(--color-warning-soft)"}
                                  fg={readinessReady ? "var(--color-success)" : "var(--color-warning)"}
                                  border={readinessReady ? "var(--color-success-border)" : "var(--color-warning-border)"}
                                />
                              </div>
                              {readinessReady ? (
                                <div className={layoutStyles.invoiceReadinessMessage}>
                                  {invoiceStage ? "All invoice checks are complete." : "The booking details are ready."}
                                </div>
                              ) : (
                                <div className={layoutStyles.invoiceBlockers}>
                                  <span className={layoutStyles.invoiceBlockerLabel}>Action:</span>
                                  <span className={layoutStyles.readinessActions}>
                                    {readinessBlockers.map((item) => (
                                      <button
                                        key={item.key}
                                        type="button"
                                        className={layoutStyles.readinessAction}
                                        onClick={() => handleReadinessAction(item.key)}
                                      >
                                        {item.actionLabel}
                                      </button>
                                    ))}
                                  </span>
                                </div>
                              )}

                              {!readinessReady && (
                                <details className={layoutStyles.invoiceChecklistDetails}>
                                  <summary>View all checks</summary>
                                  <div className={layoutStyles.invoiceChecklistRows}>
                                    {readinessChecklist.map(({ key, label, ok }) => (
                                      <div key={key} className={layoutStyles.extracted51}>
                                        <span>{label}</span>
                                        <span style={{ color: ok ? "var(--color-success)" : "var(--color-warning)" }}>{ok ? "OK" : "Missing"}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>

                            <div
                              id={NOTES_PO_ID}
                              style={{
                                marginTop: 8,
                                paddingTop: 8,
                                borderTop: "1px solid var(--color-brand-soft)",
                                scrollMarginTop: LAYOUT.HEADER_H + 80,
                              }}
                            >
                              <div style={{ fontWeight: 900, marginBottom: 5, fontSize: 11, color: UI.muted, textTransform: "uppercase" }}>
                                Notes
                              </div>

                            <label style={{ fontWeight: 900, display: "block", marginBottom: 4, fontSize: 11, color: UI.muted }}>
                              General Summary
                            </label>

                            <textarea
                              rows={2}
                              value={dayNotes?.[job.id]?.general || ""}
                              onChange={(e) =>
                                setDayNotes((prev) => ({
                                  ...prev,
                                  [job.id]: { ...(prev?.[job.id] || {}), general: e.target.value },
                                }))
                              }
                              placeholder="Add general summary…"
                              style={{
                                width: "100%",
                                border: UI.border,
                                borderRadius: 8,
                                padding: "6px 8px",
                                fontSize: 12,
                                resize: "vertical",
                                background: "var(--color-surface)",
                                marginBottom: 7,
                              }}
                            />

                            <Btn variant="base" title="Save summary" onClick={() => saveJobSummary(job.id)}>
                              Save Summary
                            </Btn>

                            <details id={FINANCE_DETAILS_ID} className={layoutStyles.financeDetails} open={invoiceStage}>
                              <summary>
                                <span>Finance details</span>
                                <span className={layoutStyles.financeDetailsSummary}>
                                  {[
                                    !job.po ? "Add PO" : "",
                                    !(job.invoiceContactName && job.invoiceContactEmail)
                                      ? "Add invoice contact"
                                      : "",
                                  ].filter(Boolean).join(" · ") || "Finance details complete"}
                                </span>
                              </summary>
                              <div className={layoutStyles.financeFields}>
                            <div className={layoutStyles.extracted52}>
                              <label style={{ fontWeight: 900, display: "block", marginBottom: 4, fontSize: 11, color: UI.muted }}>
                                Purchase Order (PO)
                              </label>
                              <input
                                id={PO_INPUT_ID}
                                type="text"
                                defaultValue={job.po || ""}
                                onBlur={(e) => {
                                  updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, { po: e.target.value }));
                                }}
                                placeholder="Enter PO reference…"
                                style={{
                                  width: "100%",
                                  border: UI.border,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontSize: 12,
                                  background: "var(--color-surface)",
                                }}
                              />
                            </div>
                            <div className={layoutStyles.extracted53}>
                              <label style={{ fontWeight: 900, display: "block", marginBottom: 4, fontSize: 11, color: UI.muted }}>
                                Invoicing Contact
                              </label>
                              <input
                                id={INVOICE_CONTACT_INPUT_ID}
                                type="text"
                                defaultValue={job.invoiceContactName || ""}
                                onBlur={(e) => {
                                  updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, { invoiceContactName: e.target.value }));
                                }}
                                placeholder="Accounts contact name"
                                style={{
                                  width: "100%",
                                  border: UI.border,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontSize: 12,
                                  background: "var(--color-surface)",
                                  marginBottom: 6,
                                }}
                              />
                              <input
                                type="email"
                                defaultValue={job.invoiceContactEmail || ""}
                                onBlur={(e) => {
                                  updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, { invoiceContactEmail: e.target.value }));
                                }}
                                placeholder="Accounts email"
                                style={{
                                  width: "100%",
                                  border: UI.border,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontSize: 12,
                                  background: "var(--color-surface)",
                                  marginBottom: 6,
                                }}
                              />
                              <input
                                type="tel"
                                defaultValue={job.invoiceContactPhone || ""}
                                onBlur={(e) => {
                                  updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, { invoiceContactPhone: e.target.value }));
                                }}
                                placeholder="Accounts phone (optional)"
                                style={{
                                  width: "100%",
                                  border: UI.border,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontSize: 12,
                                  background: "var(--color-surface)",
                                }}
                              />
                            </div>
                              </div>
                            </details>
                            </div>

                          </Card>
                        </div>}
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
