"use client";

import layoutStyles from "./page.styles.module.css";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  where,
  updateDoc,
  deleteDoc,
  arrayUnion,
} from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../../../firebaseConfig";
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
import { FIXED_JOB_STATUS_STYLES, normalizeJobStatus } from "@/app/utils/jobStatusColors";

/* ────────────────────────────────────────────────────────────
   Design tokens + layout
─────────────────────────────────────────────────────────────*/
const UI = UI_TOKENS;

const LAYOUT = {
  HEADER_H: 54,
  PAGE_PAD_X: 16,
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

const renderContacts = (contacts) => {
  if (!Array.isArray(contacts) || !contacts.length) return null;
  const rows = contacts
    .map((contact) =>
      [
        contact.department,
        contact.name,
        contact.email,
        contact.phone || contact.number,
      ]
        .filter(Boolean)
        .join(" - ")
    )
    .filter(Boolean);
  return rows.length ? rows.join("\n") : null;
};

const renderJobContacts = (job) => {
  const contacts = [];
  if (Array.isArray(job?.additionalContacts)) contacts.push(...job.additionalContacts);

  const primaryContact = {
    department: job?.contactDepartment || job?.department || "",
    name: job?.contactName || "",
    email: job?.contactEmail || "",
    phone: job?.contactPhone || job?.contactNumber || "",
  };
  if (primaryContact.name || primaryContact.email || primaryContact.phone || primaryContact.department) {
    contacts.unshift(primaryContact);
  }

  return renderContacts(contacts);
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
  return locations.filter(Boolean);
};

const getContactLabels = (job) => {
  const contacts = [];
  if (Array.isArray(job?.additionalContacts)) contacts.push(...job.additionalContacts);

  const primaryContact = {
    department: job?.contactDepartment || job?.department || "",
    name: job?.contactName || "",
    email: job?.contactEmail || "",
    phone: job?.contactPhone || job?.contactNumber || "",
  };
  if (primaryContact.name || primaryContact.email || primaryContact.phone || primaryContact.department) {
    contacts.unshift(primaryContact);
  }

  return contacts
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

const buildConnectedBookingSummary = (jobs, statusByJob = {}) => {
  const activeJobs = (jobs || []).filter((job) => !isLockedStatus(statusByJob[job.id] || job.status));
  return {
    contacts: uniqueCleanList((jobs || []).flatMap(getContactLabels)),
    vehicles: uniqueCleanList(activeJobs.flatMap(getVehicleLabels)),
    crew: uniqueCleanList(activeJobs.flatMap(getCrewLabels)),
    locations: uniqueCleanList(activeJobs.flatMap(getLocationLabels)),
  };
};

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
  const fixed = FIXED_JOB_STATUS_STYLES[normalizeJobStatus(status)];
  if (fixed) return fixed;
  const label = String(status || "").toLowerCase();
  if (label === "ready to invoice") return { bg: "var(--color-accent-soft)", border: "var(--color-warning-border)", text: "var(--color-warning)" };
  if (label === "needs action" || label === "action required") return { bg: "var(--color-warning-border)", border: "var(--color-text)", text: "var(--color-text)" };
  if (label === "complete" || label === "completed") return { bg: "var(--color-success-accent)", border: "var(--color-text)", text: "var(--color-text)" };
  if (label === "confirmed") return { bg: "var(--color-warning-border)", border: "var(--color-text)", text: "var(--color-text)" };
  if (label === "first pencil") return { bg: "var(--color-info-border)", border: "var(--color-text)", text: "var(--color-text)" };
  if (label === "second pencil") return { bg: "var(--color-warning)", border: "var(--color-text)", text: "var(--color-white)" };
  if (label === "dnh") return { bg: "var(--color-border-strong)", border: "var(--color-border-strong)", text: "var(--color-text)" };
  if (label === "cancelled" || label === "canceled") return { bg: "var(--color-border)", border: "var(--color-border)", text: "var(--color-text)" };
  if (label === "paid") return { bg: "var(--color-success-soft)", border: "var(--color-success-border)", text: "var(--color-success)" };
  return { bg: "var(--color-brand-soft)", border: "var(--color-border)", text: UI.brand };
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
const isLockedStatus = (status = "") => {
  const s = String(status || "").toLowerCase().trim();
  return s === "cancelled" || s === "canceled" || s === "dnh" || s === "postponed" || s === "lost";
};

const isCompleteStatus = (status = "") => {
  const s = String(status || "").toLowerCase().trim();
  return s === "complete" || s === "completed";
};

const DisabledOverlayNote = ({ reason }) => (
  <div
    className={layoutStyles.extracted14}
  >
    Locked This job is locked ({reason}). Editing is disabled.
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
      ? { ...base, background: UI.brand, color: "var(--color-surface)", border: `1px solid ${UI.brand}` }
      : variant === "danger"
      ? { ...base, background: "var(--color-danger)", color: "var(--color-surface)", border: "1px solid var(--color-danger)" }
      : variant === "dark"
      ? { ...base, background: "var(--shell-sidebar-bg)", color: "var(--color-surface)", border: "1px solid var(--shell-sidebar-bg)" }
      : { ...base, background: "var(--color-surface)", color: UI.text };

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

const norm = (s) => String(s || "").toLowerCase().trim();
const matchText = (job, term) => {
  const t = norm(term);
  if (!t) return true;
  const hay = [
    job?.client,
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
  const jobId = params?.id;
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

      await updateDoc(doc(db, "bookings", id), tenantPayload(dataAccessState, updates));

      setStatusByJob((p) => ({ ...p, [id]: status }));
      setSelectedStatusByJob((p) => ({ ...p, [id]: status }));
      alert(`Status updated to ${status}`);
    } catch (e) {
      console.error(e);
      alert("Failed to update status.");
    }
  };

  const saveJobSummary = async (id) => {
    const notes = dayNotes[id]?.general || "";
    try {
      await updateDoc(doc(db, "bookings", id), tenantPayload(dataAccessState, { generalNotes: notes }));
      alert("Summary saved.");
    } catch (e) {
      console.error(e);
      alert("Failed to save summary.");
    }
  };

  const deleteJob = async (id) => {
    if (!window.confirm("Delete this job? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "bookings", id));
      alert("Job deleted.");
      router.push("/job-sheet");
    } catch (e) {
      console.error(e);
      alert("Failed to delete job.");
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
          alert("PDF uploaded.");
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

  // Ensure the current route job is expanded
  useEffect(() => {
    if (!jobId) return;
    setExpandedById((p) => ({ ...p, [jobId]: true }));
  }, [jobId, setExpandedById]);

  const allJobs = useMemo(
    () => relatedJobs.map((j) => normalizeVehiclesForJob(j, vehicleMap)),
    [relatedJobs, vehicleMap]
  );

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
      <HeaderSidebarLayout>
        <div className={layoutStyles.extracted17}>No Job ID provided.</div>
      </HeaderSidebarLayout>
    );
  }

  if (!relatedJobs.length) {
    return (
      <HeaderSidebarLayout>
        <div className={layoutStyles.extracted18}>Loading job details…</div>
      </HeaderSidebarLayout>
    );
  }

  const mainJob = allJobs.find((j) => j.id === jobId) || allJobs[0] || relatedJobs[0];
  const prefix = splitJobNumber(mainJob.jobNumber).prefix;
  const groupDates = allJobs.flatMap(getSortedJobDates).sort((a, b) => a.getTime() - b.getTime());
  const groupDateLabel =
    groupDates.length > 1
      ? `${formatShortDate(groupDates[0])} - ${formatShortDate(groupDates.at(-1))}`
      : groupDates.length
      ? formatShortDate(groupDates[0])
      : "No dates";
  const statusCounts = countByStatus(allJobs, statusByJob);
  const statusSummary = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, count]) => `${count} ${status}`)
    .join(" - ");
  const notReadyCount = allJobs.reduce((total, job) => {
    const status = statusByJob[job.id] || job.status || "Pending";
    if (isLockedStatus(status) || isCompleteStatus(status)) return total;
    return total + (getInvoiceReadiness(job, timesheetsByJob[job.id] || [], status).ready ? 0 : 1);
  }, 0);
  const parentVehicle = renderVehicleNames(mainJob.vehicles);
  const parentSubtitle = [
    mainJob.location,
    `${allJobs.length} booking${allJobs.length === 1 ? "" : "s"}`,
    groupDateLabel,
    parentVehicle,
  ].filter(Boolean).join(" - ");
  const connectedSummary = buildConnectedBookingSummary(allJobs, statusByJob);

  const toggleAll = (open) => {
    const next = {};
    filteredJobs.forEach((j) => (next[j.id] = !!open));
    // Always keep current job open
    if (jobId) next[jobId] = true;
    setExpandedById((p) => ({ ...p, ...next }));
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ width: "100%", minHeight: "100vh", backgroundColor: UI.bg, color: UI.text }}>
        {/* Sticky page header + SEARCH */}
        <div
          id="page-top"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 8,
            background: "color-mix(in srgb, var(--color-canvas) 96%, transparent)",
            backdropFilter: "saturate(180%) blur(6px)",
            borderBottom: UI.border,
          }}
        >
          <div
            className={layoutStyles.extracted19}
          >
            <div
              style={{
                width: "100%",
                margin: "0 auto",
                padding: `0 ${LAYOUT.PAGE_PAD_X}px`,
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                paddingTop: 6,
                paddingBottom: 6,
              }}
            >
              <Btn onClick={() => router.push("/job-home")} variant="base">
                ← Back
              </Btn>

              <div className={layoutStyles.extracted20}>
                <div className={layoutStyles.extracted21}>
                  Job #{prefix} - {mainJob.client || "Booking"}
                </div>
              </div>

              <div className={layoutStyles.extracted22}>
                <Btn variant="base" onClick={() => toggleAll(true)} title="Expand all">
                  Expand all
                </Btn>
                <Btn variant="base" onClick={() => toggleAll(false)} title="Collapse all (keeps current open)">
                  Collapse all
                </Btn>
              </div>
            </div>
          </div>

          {/* Search Row */}
          <div
            style={{
              width: "100%",
              margin: "0 auto",
              padding: `0 ${LAYOUT.PAGE_PAD_X}px 8px`,
              display: "grid",
              gridTemplateColumns: "minmax(260px, 1fr) minmax(170px, 220px) auto",
              gap: 8,
              alignItems: "center",
            }}
          >
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
                style={{
                  width: "100%",
                  height: 34,
                  padding: "0 12px 0 34px",
                  borderRadius: 8,
                  border: UI.border,
                  fontSize: 13,
                  outline: "none",
                  background: "var(--color-surface)",
                  fontWeight: 700,
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: "100%",
                height: 34,
                padding: "0 10px",
                borderRadius: 8,
                border: UI.border,
                fontSize: 13,
                outline: "none",
                background: "var(--color-surface)",
                fontWeight: 800,
              }}
              aria-label="Filter by status"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <div
              style={{
                border: UI.border,
                background: "var(--color-surface)",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12.5,
                fontWeight: 900,
                textAlign: "center",
              }}
              title="Visible jobs"
            >
              {filteredJobs.length} shown
            </div>
          </div>
        </div>

        {/* Page content */}
        <div
          style={{
            width: "100%",
            margin: "0 auto",
            padding: `10px ${LAYOUT.PAGE_PAD_X}px 32px`,
            paddingTop: 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              border: `1px solid ${UI.brandBorder}`,
              background: "var(--color-surface)",
              borderRadius: 8,
              padding: 14,
              marginBottom: 12,
              boxShadow: UI.shadow,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `minmax(0, 1fr) minmax(${notReadyCount > 0 ? 280 : 188}px, ${notReadyCount > 0 ? 340 : 240}px)`,
                gap: 10,
                alignItems: "start",
              }}
            >
              <div
                className={layoutStyles.extracted25}
              >
                {[
                  ["Contacts", connectedSummary.contacts],
                  ["Vehicles Used", connectedSummary.vehicles],
                  ["Crew Used", connectedSummary.crew],
                  ["Previous Locations", connectedSummary.locations],
                ].map(([title, values]) => (
                  <div
                    key={title}
                    style={{
                      padding: "4px 10px 4px 0",
                      borderRight: title === "Previous Locations" ? "none" : "1px solid var(--color-brand-soft)",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ color: UI.muted, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", marginBottom: 5 }}>
                      {title}
                    </div>
                    <div
                      style={{
                        color: values.length ? UI.text : UI.muted,
                        fontSize: 12.5,
                        lineHeight: 1.35,
                        fontWeight: 800,
                        whiteSpace: "pre-line",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {values.length ? values.join("\n") : "-"}
                    </div>
                  </div>
                ))}
              </div>

              <div className={layoutStyles.extracted26}>
                <div className={layoutStyles.extracted27}>
                  {statusSummary && <Badge text={statusSummary} bg={UI.brandSoft} fg={UI.brand} border={UI.brandBorder} />}
                  {notReadyCount > 0 && (
                    <Badge
                      text={`${notReadyCount} not ready for invoice`}
                      bg="var(--color-warning-soft)"
                      fg="var(--color-warning)"
                      border="var(--color-warning-border)"
                    />
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${notReadyCount > 0 ? 3 : 2}, minmax(0, 1fr))`, gap: 8 }}>
                  <div style={{ border: UI.border, borderRadius: 8, padding: 8, background: UI.bgAlt }}>
                    <div style={{ color: UI.muted, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase" }}>Bookings</div>
                    <div className={layoutStyles.extracted28}>{allJobs.length}</div>
                  </div>
                  <div style={{ border: UI.border, borderRadius: 8, padding: 8, background: UI.bgAlt }}>
                    <div style={{ color: UI.muted, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase" }}>Shown</div>
                    <div className={layoutStyles.extracted29}>{filteredJobs.length}</div>
                  </div>
                  {notReadyCount > 0 && (
                    <div style={{ border: UI.border, borderRadius: 8, padding: 8, background: UI.bgAlt }}>
                      <div style={{ color: UI.muted, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase" }}>Blocked</div>
                      <div className={layoutStyles.extracted30}>{notReadyCount}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

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

              const currentDbStatus = statusByJob[job.id] || job.status || "Pending";
              const selected = selectedStatusByJob[job.id] ?? currentDbStatus;
              const isPaid = computeIsPaid(job);

              const locked = isLockedStatus(currentDbStatus);
              const complete = isCompleteStatus(currentDbStatus);
              const suppressMissingWarnings = locked || isCompleteStatus(currentDbStatus);
              const lockReason = currentDbStatus || "Locked";

              const isExpanded = expandedById[job.id] ?? (job.id === jobId); // default current open

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
              const invoiceReadiness = getInvoiceReadiness(job, timesheets, currentDbStatus);
              const invoiceBadge = locked
                ? { label: "Not applicable", ready: false, missing: [] }
                : complete
                ? { label: "", ready: true, missing: [] }
                : suppressMissingWarnings
                ? { label: "Complete", ready: true, missing: [] }
                : invoiceReadiness;
              const poStatus = String(job.po || "").trim() ? `PO ${job.po}` : "PO missing";
              const timesheetStatus = `${timesheets.length} timesheet${timesheets.length === 1 ? "" : "s"}`;
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
                  <Btn title="Open this quote viewer" onClick={() => router.push(quoteViewHref)}>
                    Open quote
                  </Btn>
                  <Btn title="Open this quote ready for PDF/print" onClick={() => router.push(quotePrintHref)}>
                    PDF
                  </Btn>
                </div>
              );
              const overviewRows = [
                ["Job Number", job.jobNumber || job.id],
                ["Quote Number", quoteNumberRaw ? quoteNumberValue : quoteNumberDisplay],
                ["Status", currentDbStatus],
                ["Production", job.client],
                ["Shoot Type", job.shootType],
                ["Location", job.location],
                ["Dates", renderDateBlock(job)],
                ["Call Time", job.callTime || renderNames(Object.values(job.callTimesByDate || {}))],
                ["Crew", renderCrewNames(job)],
                ["Crew Count", `${job.allocatedCrewCount ?? (Array.isArray(job.employees) ? job.employees.length : 0)} / ${job.requiredCrewCount || 0}`],
                ["Vehicles", vehicleSummary],
                ["Equipment", renderNames(job.equipment, ["name", "equipmentName"])],
                ["Contacts", renderJobContacts(job)],
                ["PO", job.po],
                ["Hotel", job.hasHotel ? `${yesNo(job.hasHotel)}${job.hotelNights ? ` - ${job.hotelNights} nights` : ""}${job.hotelPaidBy ? ` - ${job.hotelPaidBy}` : ""}` : "No"],
              ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");

              return (
                <section
                  key={job.id}
                  id={JOB_SECTION_ID}
                  style={{
                    border: job.id === jobId ? `2px solid ${UI.brand}` : UI.border,
                    borderRadius: 8,
                    padding: 8,
                    marginBottom: 10,
                    boxShadow: UI.shadow,
                    background: locked ? "var(--color-surface-subtle)" : job.id === jobId ? "var(--color-surface-subtle)" : "var(--color-surface)",
                    minWidth: 0,
                    scrollMarginTop: LAYOUT.HEADER_H + 80, // extra for search row
                    opacity: locked ? 0.82 : 1,
                    filter: locked ? "grayscale(0.35)" : "none",
                  }}
                >
                  {/* Collapsible header */}
                  <div
                    onClick={() => setExpandedById((p) => ({ ...p, [job.id]: !isExpanded }))}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      padding: 8,
                      borderRadius: 8,
                      background: "var(--color-surface)",
                      border: UI.border,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    title={isExpanded ? "Collapse" : "Expand"}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        border: UI.border,
                        background: "var(--color-surface)",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 900,
                        color: UI.muted,
                      }}
                    >
                      {isExpanded ? "–" : "+"}
                    </div>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 34,
                        height: 24,
                        padding: "0 8px",
                        borderRadius: 999,
                        background: UI.brandSoft,
                        border: `1px solid ${UI.brandBorder}`,
                        fontWeight: 900,
                        fontSize: 12,
                        color: UI.brand,
                      }}
                      title="Job prefix"
                    >
                      {splitJobNumber(job.jobNumber || "").prefix || "—"}
                    </span>

                    <div className={layoutStyles.extracted33}>
                      <div className={layoutStyles.extracted34}>
                        <StatusPill value={currentDbStatus} />
                        {isPaid && <PaidPill />}
                        {invoiceBadge.label && (
                          <Badge
                            text={invoiceBadge.label}
                            bg={locked ? "var(--color-surface-hover)" : invoiceBadge.ready ? "var(--color-success-soft)" : "var(--color-warning-soft)"}
                            fg={locked ? "var(--color-text-muted)" : invoiceBadge.ready ? "var(--color-success)" : "var(--color-warning)"}
                            border={locked ? "var(--color-border-strong)" : invoiceBadge.ready ? "var(--color-success-border)" : "var(--color-warning-border)"}
                            title={
                              locked
                                ? "This job did not happen, so invoice readiness does not apply"
                                : suppressMissingWarnings
                                ? "Complete jobs do not show missing-item warnings"
                                : invoiceBadge.missing.length
                                ? `Missing: ${invoiceBadge.missing.join(", ")}`
                                : "Ready to invoice"
                            }
                          />
                        )}
                        {locked && (
                          <Badge
                            text="Locked"
                            bg="var(--color-border)"
                            fg="var(--color-text-muted)"
                            border="var(--color-border-strong)"
                            title="Cancelled/DNH/Postponed/Lost jobs are view-only"
                          />
                        )}
                      </div>

                      <div
                        className={layoutStyles.extracted35}
                        title={`${job.client || "Booking"} - #${job.jobNumber || job.id}${quoteNumberDisplay ? ` - ${quoteNumberDisplay}` : ""}`}
                      >
                        {job.client || "Booking"} - #{job.jobNumber || job.id}
                        {quoteNumberDisplay ? ` - ${quoteNumberDisplay}` : ""}
                      </div>

                      <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800, marginTop: 4, overflowWrap: "anywhere" }}>
                        {dateSummary}
                        {dayCount ? ` - ${dayCount} day${dayCount === 1 ? "" : "s"}` : ""}
                        {job.location ? ` - ${job.location}` : ""}
                      </div>

                      {!suppressMissingWarnings && (
                        <div className={layoutStyles.extracted36}>
                          <Badge text={`Vehicle: ${vehicleSummary || "Missing"}`} bg={vehicleSummary ? UI.brandSoft : "var(--color-warning-soft)"} fg={vehicleSummary ? UI.brand : "var(--color-warning)"} border={vehicleSummary ? UI.brandBorder : "var(--color-warning-border)"} />
                          <Badge text={`Crew: ${crewCount.allocated}/${crewCount.required || 0}`} bg={crewCount.required && crewCount.allocated < crewCount.required ? "var(--color-warning-soft)" : "var(--color-surface-subtle)"} fg={crewCount.required && crewCount.allocated < crewCount.required ? "var(--color-warning)" : UI.text} border={crewCount.required && crewCount.allocated < crewCount.required ? "var(--color-warning-border)" : "var(--color-border)"} />
                          <Badge text={poStatus} bg={job.po ? "var(--color-surface-subtle)" : "var(--color-warning-soft)"} fg={job.po ? UI.text : "var(--color-warning)"} border={job.po ? "var(--color-border)" : "var(--color-warning-border)"} />
                          <Badge text={timesheetStatus} bg={timesheets.length ? "var(--color-surface-subtle)" : "var(--color-warning-soft)"} fg={timesheets.length ? UI.text : "var(--color-warning)"} border={timesheets.length ? "var(--color-border)" : "var(--color-warning-border)"} />
                        </div>
                      )}
                    </div>

                    {/* Quick actions do not toggle collapse when clicked */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={layoutStyles.extracted37}
                    >
                      <Btn disabled={!quoteNumberRaw} title="Open this quote viewer" onClick={() => router.push(quoteViewHref)}>
                        Open quote
                      </Btn>
                      <Btn disabled={!quoteNumberRaw} title="Open this quote ready for PDF/print" onClick={() => router.push(quotePrintHref)}>
                        PDF
                      </Btn>
                      <Btn
                        variant="primary"
                        disabled={locked}
                        title={locked ? `Editing disabled: ${lockReason}` : "Edit booking"}
                        onClick={() =>
                          router.push(
                            `/edit-booking/${job.id}?returnTo=${encodeURIComponent(
                              `/job-numbers/${encodeURIComponent(jobId)}`
                            )}`
                          )
                        }
                      >
                        Edit
                      </Btn>

                      <details className={layoutStyles.extracted38}>
                        <summary
                          style={{
                            listStyle: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: 30,
                            minWidth: 34,
                            border: UI.border,
                            borderRadius: 8,
                            background: "var(--color-surface)",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                          title="More actions"
                        >
                          ...
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
                            disabled={locked}
                            onClick={() => deleteJob(job.id)}
                            style={{
                              width: "100%",
                              border: "none",
                              background: "transparent",
                              color: locked ? UI.muted : "var(--color-danger)",
                              textAlign: "left",
                              padding: "8px 10px",
                              borderRadius: 6,
                              fontWeight: 900,
                              cursor: locked ? "not-allowed" : "pointer",
                            }}
                          >
                            Delete booking
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>

                  {locked && isExpanded && <DisabledOverlayNote reason={lockReason} />}

                  {/* Collapsed body */}
                  {!isExpanded ? null : (
                    <div className={layoutStyles.extracted39}>
                      {/* Two-column layout */}
                      <div
                        className={layoutStyles.extracted40}
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
                          <Card id={TIMESHEETS_ID} tone="plain" style={{ scrollMarginTop: LAYOUT.HEADER_H + 80 }}>
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
                              <div
                                style={{
                                  color: UI.muted,
                                  padding: 10,
                                  border: "1px dashed var(--color-border)",
                                  borderRadius: 8,
                                  background: "var(--color-surface)",
                                }}
                              >
                                No timesheet days found for this job yet.
                              </div>
                            )}
                          </Card>
                        </div>

                        {/* RIGHT: Actions (sticky) */}
                        <div
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
                            <SectionTitle title="Status & Invoice" />

                            <div className={layoutStyles.extracted48}>
                              {["Ready to Invoice", "Needs Action", "Complete"].map((opt) => {
                                const active = selected === opt;
                                const color = statusColor(opt);
                                const disabled = isPaid || locked;

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
                                    title={locked ? `Locked: ${lockReason}` : isPaid ? "Paid jobs are locked" : ""}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>

                            <Btn
                              variant="dark"
                              disabled={locked || isPaid || (selectedStatusByJob[job.id] ?? currentDbStatus) === currentDbStatus}
                              title={locked ? `Locked: ${lockReason}` : isPaid ? "Paid jobs are locked" : "Save status"}
                              onClick={() => {
                                const chosen = selectedStatusByJob[job.id] ?? currentDbStatus;
                                if (chosen !== currentDbStatus) saveJobStatus(job.id, chosen);
                              }}
                            >
                              Save Status Change
                            </Btn>

                            <div
                              style={{
                                marginTop: 10,
                                padding: 10,
                                borderLeft: suppressMissingWarnings ? "3px solid var(--color-border-strong)" : invoiceReadiness.ready ? "3px solid var(--color-success-border)" : "3px solid var(--color-warning-border)",
                                borderRadius: 6,
                                background: suppressMissingWarnings ? "var(--color-surface-subtle)" : invoiceReadiness.ready ? "var(--color-success-soft)" : "var(--color-warning-soft)",
                              }}
                            >
                              <div className={layoutStyles.extracted49}>
                                <div className={layoutStyles.extracted50}>Invoice checklist</div>
                                <Badge
                                  text={locked ? "Not applicable" : suppressMissingWarnings ? "Complete" : invoiceReadiness.label}
                                  bg={suppressMissingWarnings ? "var(--color-surface-hover)" : invoiceReadiness.ready ? "var(--color-success-soft)" : "var(--color-accent-soft)"}
                                  fg={suppressMissingWarnings ? "var(--color-text-muted)" : invoiceReadiness.ready ? "var(--color-success)" : "var(--color-warning)"}
                                  border={suppressMissingWarnings ? "var(--color-border-strong)" : invoiceReadiness.ready ? "var(--color-success-border)" : "var(--color-warning-border)"}
                                />
                              </div>
                              {suppressMissingWarnings ? (
                                <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800 }}>
                                  {locked
                                    ? "This job did not happen, so invoice checks are not required."
                                    : "This job is complete, so missing-item warnings are hidden."}
                                </div>
                              ) : (
                                [
                                  ["Status complete", !invoiceReadiness.missing.includes("status")],
                                  ["PO reference", !invoiceReadiness.missing.includes("PO")],
                                  ["Invoicing contact", !invoiceReadiness.missing.includes("invoiceContact")],
                                  ["Linked timesheets", !invoiceReadiness.missing.includes("timesheets")],
                                  ["Vehicle assigned", !invoiceReadiness.missing.includes("vehicle")],
                                  ["Crew allocated", !invoiceReadiness.missing.includes("crew")],
                                ].map(([label, ok]) => (
                                  <div key={label} className={layoutStyles.extracted51}>
                                    <span>{label}</span>
                                    <span style={{ color: ok ? "var(--color-success)" : "var(--color-warning)" }}>{ok ? "OK" : "Missing"}</span>
                                  </div>
                                ))
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
                                Notes & PO
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
                              disabled={locked}
                              placeholder={locked ? "Locked job (view-only)" : "Add general summary…"}
                              style={{
                                width: "100%",
                                border: UI.border,
                                borderRadius: 8,
                                padding: "6px 8px",
                                fontSize: 12,
                                resize: "vertical",
                                background: locked ? "var(--color-surface-hover)" : "var(--color-surface)",
                                marginBottom: 7,
                                opacity: locked ? 0.8 : 1,
                              }}
                            />

                            <Btn variant="base" disabled={locked} title={locked ? `Locked: ${lockReason}` : "Save summary"} onClick={() => saveJobSummary(job.id)}>
                              Save Summary
                            </Btn>

                            <div className={layoutStyles.extracted52}>
                              <label style={{ fontWeight: 900, display: "block", marginBottom: 4, fontSize: 11, color: UI.muted }}>
                                Purchase Order (PO)
                              </label>
                              <input
                                type="text"
                                defaultValue={job.po || ""}
                                disabled={locked}
                                onBlur={(e) => {
                                  if (locked) return;
                                  updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, { po: e.target.value }));
                                }}
                                placeholder={locked ? "Locked job" : "Enter PO reference…"}
                                style={{
                                  width: "100%",
                                  border: UI.border,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontSize: 12,
                                  background: locked ? "var(--color-surface-hover)" : "var(--color-surface)",
                                  opacity: locked ? 0.8 : 1,
                                }}
                              />
                            </div>
                            <div className={layoutStyles.extracted53}>
                              <label style={{ fontWeight: 900, display: "block", marginBottom: 4, fontSize: 11, color: UI.muted }}>
                                Invoicing Contact
                              </label>
                              <input
                                type="text"
                                defaultValue={job.invoiceContactName || ""}
                                disabled={locked}
                                onBlur={(e) => {
                                  if (locked) return;
                                  updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, { invoiceContactName: e.target.value }));
                                }}
                                placeholder={locked ? "Locked job" : "Accounts contact name"}
                                style={{
                                  width: "100%",
                                  border: UI.border,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontSize: 12,
                                  background: locked ? "var(--color-surface-hover)" : "var(--color-surface)",
                                  opacity: locked ? 0.8 : 1,
                                  marginBottom: 6,
                                }}
                              />
                              <input
                                type="email"
                                defaultValue={job.invoiceContactEmail || ""}
                                disabled={locked}
                                onBlur={(e) => {
                                  if (locked) return;
                                  updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, { invoiceContactEmail: e.target.value }));
                                }}
                                placeholder={locked ? "Locked job" : "Accounts email"}
                                style={{
                                  width: "100%",
                                  border: UI.border,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontSize: 12,
                                  background: locked ? "var(--color-surface-hover)" : "var(--color-surface)",
                                  opacity: locked ? 0.8 : 1,
                                  marginBottom: 6,
                                }}
                              />
                              <input
                                type="tel"
                                defaultValue={job.invoiceContactPhone || ""}
                                disabled={locked}
                                onBlur={(e) => {
                                  if (locked) return;
                                  updateDoc(doc(db, "bookings", job.id), tenantPayload(dataAccessState, { invoiceContactPhone: e.target.value }));
                                }}
                                placeholder={locked ? "Locked job" : "Accounts phone (optional)"}
                                style={{
                                  width: "100%",
                                  border: UI.border,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontSize: 12,
                                  background: locked ? "var(--color-surface-hover)" : "var(--color-surface)",
                                  opacity: locked ? 0.8 : 1,
                                }}
                              />
                            </div>
                            </div>

                            <div
                              id={ATTACHMENTS_ID}
                              style={{
                                marginTop: 8,
                                paddingTop: 8,
                                borderTop: "1px solid var(--color-brand-soft)",
                                scrollMarginTop: LAYOUT.HEADER_H + 80,
                              }}
                            >
                              <div style={{ fontWeight: 900, marginBottom: 5, fontSize: 11, color: UI.muted, textTransform: "uppercase" }}>
                                {currentPdfUrl ? "Job Attachment (PDF)" : "Upload Job Attachment"}
                              </div>

                            {currentPdfUrl && (
                              <div className={layoutStyles.extracted54}>
                                <a
                                  href={currentPdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: UI.brand, textDecoration: "underline", fontSize: 14, fontWeight: 900 }}
                                >
                                  View Current PDF
                                </a>
                              </div>
                            )}

                            {Array.isArray(job.attachments) && job.attachments.length > 0 && (
                              <div className={layoutStyles.extracted55}>
                                <div className={layoutStyles.extracted56}>Attachments</div>
                                <ul className={layoutStyles.extracted57}>
                                  {job.attachments.map((att, i) => (
                                    <li key={i} className={layoutStyles.extracted58}>
                                      <a href={att.url} target="_blank" rel="noopener noreferrer" className={layoutStyles.extracted59}>
                                        {att.name}
                                      </a>
                                      <span style={{ color: UI.muted }}> • {(att.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <input
                              type="file"
                              accept="application/pdf"
                              disabled={locked}
                              onChange={(e) => onPdfSelect(job.id, e.target.files?.[0])}
                              style={{
                                marginBottom: 5,
                                fontSize: 12,
                                width: "100%",
                                opacity: locked ? 0.6 : 1,
                                cursor: locked ? "not-allowed" : "pointer",
                              }}
                              title={locked ? `Locked: ${lockReason}` : "Select a PDF"}
                            />

                            <Btn
                              variant="dark"
                              disabled={locked || uploadingByJob[job.id] || !fileSelected}
                              title={locked ? `Locked: ${lockReason}` : ""}
                              onClick={() => uploadPdfForJob(job.id)}
                            >
                              {uploadingByJob[job.id]
                                ? `Uploading… ${progressByJob[job.id] ?? 0}%`
                                : fileSelected
                                ? currentPdfUrl
                                  ? "Replace / Add PDF"
                                  : "Upload PDF"
                                : "Select file"}
                            </Btn>

                            {uploadError && <p className={layoutStyles.extracted60}>{uploadError}</p>}
                            </div>
                          </Card>
                        </div>
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
