"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./page.styles.module.css";
import { createElement, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { BusinessHeaderActions, BusinessPage, BusinessPageHeader } from "@/app/components/BusinessPage";
import { Badge, Button, Checkbox, Input, MetricCard as SharedMetricCard, NavigationCard, Select, Textarea } from "@/app/components/ui";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { UI_TOKENS } from "@/app/utils/uiTokens";
import { getSemanticStatusStyle } from "@/app/utils/jobStatusColors";

const UI = UI_TOKENS;
const REGISTER_PAGE_SIZE = 10;

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...surface, padding: 12 };
const cardBase = {
  ...surface,
  padding: 12,
  background: "var(--color-surface)",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};
const cardHover = {
  transform: "translateY(-2px)",
  boxShadow: UI.shadowHover,
  borderColor: UI.brandBorder,
};
const metricCard = { ...surface, padding: 12, minWidth: 0 };
const premiumSection = {
  ...cardBase,
  border: "1px solid var(--color-border)",
  boxShadow: "0 10px 26px rgba(15,23,42,0.05)",
};
const commandGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: 12,
  alignItems: "start",
  marginBottom: 12,
};
const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};
const opsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};
const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: "-0.01em" };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };
const badge = (bg, fg) => ({
  padding: "4px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: bg,
  color: fg,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
  lineHeight: "18px",
});

const smallLabel = {
  margin: 0,
  color: UI.muted,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const tableCell = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-brand-soft)",
  fontSize: 13,
  color: UI.text,
  verticalAlign: "middle",
};

const tableHead = {
  ...tableCell,
  color: UI.muted,
  background: "var(--color-surface-subtle)",
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: "uppercase",
};

const HS_REGISTER_TEMPLATE = [
  {
    id: "cutting-fluid-ph",
    section: "Date inspections",
    area: "inspection",
    item: "Cutting fluid pH check",
    frequency: "Weekly",
    frequencyWeeks: 1,
    owner: "Workshop",
    certificateRequired: true,
    evidenceLabel: "pH record",
  },
  {
    id: "pat-testing",
    section: "Date inspections",
    area: "inspection",
    item: "PAT testing",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Workshop",
    certificateRequired: true,
    evidenceLabel: "PAT certificate",
  },
  {
    id: "fire-safety",
    section: "Date inspections",
    area: "inspection",
    item: "Fire safety inspection",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Workshop",
    certificateRequired: true,
    evidenceLabel: "Fire safety certificate",
  },
  {
    id: "fire-alarm-service",
    section: "Date inspections",
    area: "inspection",
    item: "Fire alarm service",
    frequency: "6 months",
    frequencyWeeks: 26,
    owner: "Workshop",
    certificateRequired: true,
    evidenceLabel: "Service certificate",
  },
  {
    id: "mask-fitting",
    section: "Date inspections",
    area: "inspection",
    item: "Mask fitting",
    frequency: "2 years",
    frequencyWeeks: 104,
    owner: "H&S",
    certificateRequired: true,
    evidenceLabel: "Fit test record",
  },
  {
    id: "health-screening",
    section: "Date inspections",
    area: "inspection",
    item: "Health screening",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "H&S",
    certificateRequired: true,
    evidenceLabel: "Health screening record",
  },
  {
    id: "gas",
    section: "Date inspections",
    area: "inspection",
    item: "Gas regulator",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Workshop",
    certificateRequired: true,
    evidenceLabel: "Gas certificate",
  },
  {
    id: "eicr-pat",
    section: "Date inspections",
    area: "inspection",
    item: "EICR / PAT test",
    frequency: "5 years",
    frequencyWeeks: 260,
    owner: "Workshop",
    certificateRequired: true,
    evidenceLabel: "Electrical certificate",
  },
  {
    id: "weekly-workshop-check",
    section: "Workshop checks",
    area: "workshop",
    item: "Workshop weekly check",
    frequency: "Weekly",
    owner: "Workshop",
    certificateRequired: false,
    evidenceLabel: "Checklist",
    notes: "Tidy, fire alarm, emergency exits, batteries.",
  },
  {
    id: "electrical-equipment",
    section: "Workshop checks",
    area: "workshop",
    item: "Electrical equipment",
    frequency: "Weekly",
    owner: "Workshop",
    certificateRequired: false,
    evidenceLabel: "Checklist",
  },
  {
    id: "machine-guards",
    section: "Workshop checks",
    area: "workshop",
    item: "Machine guards",
    frequency: "Weekly",
    owner: "Workshop",
    certificateRequired: false,
    evidenceLabel: "Checklist",
  },
  {
    id: "slip-trip-hazards",
    section: "Workshop checks",
    area: "workshop",
    item: "Slip/trip hazards",
    frequency: "Weekly",
    owner: "Workshop",
    certificateRequired: false,
    evidenceLabel: "Checklist",
  },
  {
    id: "emergency-lighting",
    section: "Workshop checks",
    area: "workshop",
    item: "Emergency lighting",
    frequency: "Weekly",
    owner: "Workshop",
    certificateRequired: false,
    evidenceLabel: "Checklist",
  },
  {
    id: "rest-room-hygiene",
    section: "Workshop checks",
    area: "workshop",
    item: "Rest room hygiene",
    frequency: "Weekly",
    owner: "Workshop",
    certificateRequired: false,
    evidenceLabel: "Checklist",
  },
  {
    id: "ppe-issue-register",
    section: "PPE per person",
    area: "ppe",
    item: "Employee PPE issue register",
    frequency: "Per person",
    owner: "H&S",
    certificateRequired: false,
    evidenceLabel: "PPE issue log",
    notes: "Log PPE issued to each employee with automatic issue dates and retained history.",
  },
  {
    id: "staff-training",
    section: "Training & records",
    area: "training",
    item: "Staff training",
    frequency: "As required",
    owner: "H&S",
    certificateRequired: true,
    evidenceLabel: "Training record",
  },
  {
    id: "first-aid-training",
    section: "Training & records",
    area: "training",
    item: "First aid training",
    frequency: "Renewal date",
    owner: "H&S",
    certificateRequired: true,
    evidenceLabel: "Training certificate",
  },
  {
    id: "computer-display-testing",
    section: "Training & records",
    area: "training",
    item: "Computer display testing",
    frequency: "Annual",
    owner: "H&S",
    certificateRequired: false,
    evidenceLabel: "DSE record",
  },
  {
    id: "uniform",
    section: "Training & records",
    area: "training",
    item: "Uniform",
    frequency: "As required",
    owner: "H&S",
    certificateRequired: false,
    evidenceLabel: "Issue record",
  },
  {
    id: "policy-review",
    section: "Policy review",
    area: "policy",
    item: "Policy review",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Management",
    certificateRequired: true,
    evidenceLabel: "Signed policy",
  },
  {
    id: "welfare-policy",
    section: "Policy review",
    area: "policy",
    item: "Welfare policy",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Management",
    certificateRequired: true,
    evidenceLabel: "Policy document",
  },
  {
    id: "workshop-risk-assessment",
    section: "Policy review",
    area: "policy",
    item: "Workshop risk assessment",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Management",
    certificateRequired: true,
    evidenceLabel: "Risk assessment",
  },
  {
    id: "tracking-risk-assessment",
    section: "Policy review",
    area: "policy",
    item: "Tracking risk assessment",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Management",
    certificateRequired: true,
    evidenceLabel: "Risk assessment",
  },
  {
    id: "fire-risk-assessment",
    section: "Policy review",
    area: "policy",
    item: "Fire RA",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Management",
    certificateRequired: true,
    evidenceLabel: "Fire risk assessment",
  },
  {
    id: "coshh",
    section: "Policy review",
    area: "policy",
    item: "COSHH",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "Management",
    certificateRequired: true,
    evidenceLabel: "COSHH record",
  },
];

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "string") {
    const raw = value.trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const date = new Date(value);
  return Number.isNaN(+date) ? null : date;
};

const dateTime = (value) => {
  const date = toDate(value);
  return date ? date.getTime() : 0;
};

const fmtDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-GB") : "-";
};

const todayStart = () => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
};

const daysUntil = (value) => {
  const date = toDate(value);
  if (!date) return null;
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((target - todayStart()) / 86400000);
};

const lower = (value) => String(value || "").trim().toLowerCase();
const frequencyLabelFromWeeks = (weeks, fallback = "") => {
  const value = Number(weeks);
  if (!value) return fallback || "-";
  if (value === 52) return "Annual";
  if (value === 26) return "6 months";
  if (value === 104) return "2 years";
  if (value === 260) return "5 years";
  return `${value} ${value === 1 ? "week" : "weeks"}`;
};
const getReviewCategory = (review = {}, item = {}) =>
  lower(review.category ?? review.route ?? review.bucket ?? item.category ?? "");
const isResolved = (row) => lower(row.maintenance?.status || row.status) === "resolved";
const isScheduled = (row) => lower(row.maintenance?.status || row.status) === "scheduled";

function registerState(item) {
  const explicit = lower(item.status);
  const diff = daysUntil(item.nextDue);
  const missingDate = !item.nextDue && (item.area === "inspection" || item.area === "policy" || item.area === "training");
  const missingCertificate = Boolean(item.certificateRequired && !item.certificateUrl);

  if (explicit === "booked") return { label: "Booked", tone: "brand" };
  if (missingDate) return { label: "Needs date", tone: "amber" };
  if (diff != null && diff < 0) return { label: "Overdue", tone: "danger" };
  if (missingCertificate) return { label: "Needs cert", tone: "amber" };
  if (diff != null && diff <= 30) return { label: "Due soon", tone: "amber" };
  if (explicit === "complete") return { label: "Complete", tone: "green" };
  return { label: "OK", tone: "green" };
}

function registerToneStyle(tone) {
  if (tone === "danger") return { background: "var(--color-accent-soft)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" };
  if (tone === "amber") return { background: "var(--color-warning-soft)", color: "var(--color-warning)", border: "1px solid var(--color-warning-border)" };
  if (tone === "green") return { background: "var(--color-success-soft)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" };
  return { background: UI.brandSoft, color: UI.brand, border: `1px solid ${UI.brandBorder}` };
}

function displayStatus(row) {
  const raw = lower(row.maintenance?.status || row.status);
  if (raw === "resolved") return "Resolved";
  if (raw === "scheduled") return "Scheduled";
  if (raw === "in_progress") return "In progress";
  return "Pending";
}

function statusStyle(row) {
  const status = lower(row.maintenance?.status || row.status);
  const label = row.bucket === "immediate" ? "Defect" : row.bucket === "declined" ? "Declined" : status || "Pending";
  const tone = getSemanticStatusStyle(label);
  return { background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` };
}

function makeCheckRow(check, item, index, bucket) {
  return {
    id: `check:${check.id}:${index}:${bucket}`,
    bucket,
    sourceType: "Vehicle check",
    sourcePath: check.id ? `/vehicle-checkid/${encodeURIComponent(check.id)}` : null,
    queuePath: bucket === "immediate" ? "/defects/immediate" : bucket === "declined" ? "/defects/declined" : "/defects/general",
    dateISO: check.dateISO || check.date || check.createdAt || check.updatedAt || null,
    vehicle: check.vehicle || "-",
    driverName: check.driverName || "-",
    jobLabel: check.jobNumber ? `#${check.jobNumber}` : check.jobId || "-",
    itemLabel: item.label || `Item ${index + 1}`,
    note: item.note || item.defectNote || item.review?.comment || "",
    review: item.review || null,
    maintenance: item.maintenance || null,
    status: item.maintenance?.status || "pending",
    photosCount: Array.isArray(check.photos) ? check.photos.length : 0,
  };
}

function extractCheckRows(checkDocs) {
  const rows = [];

  for (const check of checkDocs) {
    if (!Array.isArray(check.items)) continue;

    check.items.forEach((item, index) => {
      const review = item?.review || {};
      const category = getReviewCategory(review, item);

      if (review.status === "approved" && (category === "general" || category === "immediate")) {
        rows.push(makeCheckRow(check, item, index, category));
      }

      if (item?.status === "defect" && review.status === "declined") {
        rows.push(makeCheckRow(check, item, index, "declined"));
      }
    });
  }

  return rows;
}

function makeIssueRow(issue, bucket) {
  return {
    id: `issue:${issue.id}:${bucket}`,
    bucket,
    sourceType: "App issue",
    sourcePath: null,
    queuePath: bucket === "immediate" ? "/defects/immediate" : "/defects/general",
    dateISO: issue.createdAt || issue.updatedAt || null,
    vehicle: issue.vehicleName || issue.vehicle || "-",
    driverName: issue.reporterName || issue.reporterCode || "-",
    jobLabel: issue.category || "App issue",
    itemLabel: "App issue report",
    note: issue.description || "",
    review: issue.review || null,
    maintenance: issue.maintenance || null,
    status: issue.maintenance?.status || "pending",
    photosCount: 0,
  };
}

function extractIssueRows(issueDocs) {
  const rows = [];

  for (const issue of issueDocs) {
    const review = issue?.review || {};
    const category = getReviewCategory(review, issue);

    if (review.status === "approved" && (category === "general" || category === "immediate")) {
      rows.push(makeIssueRow(issue, category));
    }
  }

  return rows;
}

function extractDefectReportRows(defectDocs) {
  const rows = [];

  for (const defect of defectDocs) {
    if (defect.status === "resolved") continue;

    const severity = lower(defect.severity);
    const priority = lower(defect.priority);
    const bucket = severity === "immediate" || priority === "high" || defect.offRoad === true ? "immediate" : "general";

    rows.push({
      id: `defect-report:${defect.id}:${bucket}`,
      bucket,
      sourceType: "Defect report",
      sourcePath: null,
      queuePath: bucket === "immediate" ? "/defects/immediate" : "/defects/general",
      dateISO: defect.createdAt || defect.updatedAt || null,
      vehicle: defect.vehicleName || defect.registration || "-",
      driverName: defect.reportedBy || "-",
      jobLabel: defect.sourceRecordId ? `Service ${defect.sourceRecordId}` : "Defect report",
      itemLabel: defect.location || defect.sourceDefectKey || "Defect report",
      note: [defect.description, defect.notes].filter(Boolean).join("\n"),
      review: { status: "approved", category: bucket },
      maintenance: null,
      status: "pending",
      photosCount:
        (Array.isArray(defect.photoURLs) ? defect.photoURLs.length : 0) +
        (Array.isArray(defect.photoURIs) ? defect.photoURIs.length : 0),
    });
  }

  return rows;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => dateTime(b.dateISO) - dateTime(a.dateISO));
}

function KpiCard({ label, value, detail, icon: Icon, tone = "brand" }) {
  const colors = {
    brand: { bg: UI.brandSoft, fg: UI.brand, border: UI.brandBorder },
    danger: { bg: "var(--color-danger-soft)", fg: "var(--color-danger)", border: "var(--color-danger-border)" },
    amber: { bg: "var(--color-warning-soft)", fg: "var(--color-warning)", border: "var(--color-warning-border)" },
    green: { bg: "var(--color-success-soft)", fg: "var(--color-success)", border: "var(--color-success-border)" },
  }[tone];

  return (
    <div style={{ ...surface, padding: 12, minHeight: 92 }}>
      <div className={layoutStyles.extracted1}>
        <div>
          <p style={smallLabel}>{label}</p>
          <div style={{ marginTop: 7, color: UI.text, fontSize: 27, lineHeight: 1, fontWeight: 950 }}>{value}</div>
        </div>
        <span
          style={{
            width: 34,
            height: 34,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: UI.radiusSm,
            background: colors.bg,
            color: colors.fg,
            border: `1px solid ${colors.border}`,
          }}
        >
          <Icon size={18} />
        </span>
      </div>
      <div style={{ marginTop: 8, color: UI.muted, fontSize: 12.5, fontWeight: 750 }}>{detail}</div>
    </div>
  );
}

function QueueCard({ title, detail, value, icon: Icon, tone, path, onOpen }) {
  const colors = {
    brand: { bg: UI.brandSoft, fg: UI.brand, border: UI.brandBorder },
    danger: { bg: "var(--color-danger-soft)", fg: "var(--color-danger)", border: "var(--color-danger-border)" },
    amber: { bg: "var(--color-warning-soft)", fg: "var(--color-warning)", border: "var(--color-warning-border)" },
    green: { bg: "var(--color-success-soft)", fg: "var(--color-success)", border: "var(--color-success-border)" },
  }[tone];

  return (
    <button
      type="button"
      onClick={() => onOpen(path)}
      style={{
        ...surface,
        padding: 12,
        textAlign: "left",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "36px minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: UI.radiusSm,
          background: colors.bg,
          color: colors.fg,
          border: `1px solid ${colors.border}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={19} />
      </span>
      <span className={layoutStyles.extracted2}>
        <span style={{ display: "block", color: UI.text, fontWeight: 900, fontSize: 14 }}>{title}</span>
        <span style={{ display: "block", color: UI.muted, fontSize: 12.5, lineHeight: 1.3, marginTop: 2 }}>{detail}</span>
      </span>
      <span className={layoutStyles.extracted3}>
        <span
          style={{
            minWidth: 34,
            height: 28,
            borderRadius: 999,
            padding: "0 9px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: colors.bg,
            color: colors.fg,
            border: `1px solid ${colors.border}`,
            fontSize: 13,
            fontWeight: 950,
          }}
        >
          {value}
        </span>
        <ArrowUpRight size={16} color={UI.muted} />
      </span>
    </button>
  );
}

function SummaryCard({ title, value, footer, icon: Icon, tone = "brand" }) {
  const colors =
    tone === "danger"
      ? { bg: "var(--color-danger-soft)", border: "var(--color-danger-border)", fg: "var(--color-danger)" }
      : tone === "amber"
      ? { bg: "var(--color-warning-soft)", border: "var(--color-warning-border)", fg: "var(--color-warning)" }
      : tone === "ok"
      ? { bg: "var(--color-success-soft)", border: "var(--color-success-border)", fg: "var(--color-success)" }
      : { bg: UI.brandSoft, border: UI.brandBorder, fg: UI.brand };

  return (
    <div style={{ ...metricCard, minHeight: 92 }}>
      <div className={layoutStyles.extracted4}>
        <div>
          <div style={{ color: UI.muted, fontSize: 12, fontWeight: 800 }}>{title}</div>
          <div style={{ color: UI.text, fontSize: 28, lineHeight: 1.1, fontWeight: 850, marginTop: 8 }}>{value}</div>
        </div>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.bg,
            color: colors.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={2.2} />
        </span>
      </div>
      <div style={{ color: colors.fg, fontSize: 12, fontWeight: 750, marginTop: 8 }}>{footer}</div>
    </div>
  );
}

function Tile({ title, description, onClick, rightBadges = [], icon: Icon = ShieldCheck }) {
  const baseStyle = {
    ...cardBase,
    background: "var(--color-surface)",
    height: "100%",
    minHeight: 82,
    padding: "11px 12px",
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
  };

  return (
    <div
      style={baseStyle}
      role="button"
      tabIndex={0}
      title={description}
      onClick={onClick}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " " ? onClick() : null)}
      onMouseEnter={(event) => Object.assign(event.currentTarget.style, cardHover)}
      onMouseLeave={(event) => Object.assign(event.currentTarget.style, baseStyle)}
    >
      <div
        className={layoutStyles.extracted5}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: `1px solid ${UI.brandBorder}`,
            background: UI.brandSoft,
            color: UI.brand,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <div className={layoutStyles.extracted6}>
          <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.18, color: UI.text }}>{title}</div>
          <div style={{ color: UI.muted, fontSize: 12.5, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {description}
          </div>
          {rightBadges.length ? (
            <div className={layoutStyles.extracted7}>
              {rightBadges.map((item, index) => {
                const tone = item.tone || "soft";
                const style =
                  tone === "danger"
                    ? badge("var(--color-danger-soft)", "var(--color-danger)")
                    : tone === "amber"
                    ? badge("var(--color-warning-soft)", "var(--color-warning)")
                    : tone === "green"
                    ? badge("var(--color-success-soft)", "var(--color-success)")
                    : badge(UI.brandSoft, UI.brand);
                return (
                  <span key={index} style={style}>
                    {item.label}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
        <span style={{ color: UI.brand, fontSize: 18, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>&gt;</span>
      </div>
    </div>
  );
}

function RiskRing({ title, total, ok, soon, overdue, labels = ["OK", "Due soon", "Overdue"] }) {
  const safeTotal = Math.max(Number(total || 0), 0);
  const okPct = safeTotal ? Math.round((Number(ok || 0) / safeTotal) * 100) : 100;
  const soonPct = safeTotal ? Math.round((Number(soon || 0) / safeTotal) * 100) : 0;
  const background = `conic-gradient(var(--color-success) 0 ${okPct}%, var(--color-accent) ${okPct}% ${okPct + soonPct}%, var(--color-danger) ${okPct + soonPct}% 100%)`;

  return (
    <div style={{ ...surface, padding: 12 }}>
      <div className={layoutStyles.extracted8}>
        <div>
          <h2 style={{ ...titleMd, fontSize: 15 }}>{title}</h2>
          <div style={hint}>{safeTotal} records tracked</div>
        </div>
      </div>
      <div className={layoutStyles.extracted9}>
        <div
          style={{
            width: 126,
            height: 126,
            borderRadius: "50%",
            background,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 82,
              height: 82,
              borderRadius: "50%",
              background: "var(--color-surface)",
              border: "1px solid var(--color-brand-soft)",
              display: "grid",
              placeItems: "center",
              color: UI.text,
              fontSize: 24,
              fontWeight: 850,
            }}
          >
            {safeTotal}
          </div>
        </div>
        <div className={layoutStyles.extracted10}>
          <RingLegend color="var(--color-success)" label={labels[0]} value={ok} />
          <RingLegend color="var(--color-accent)" label={labels[1]} value={soon} />
          <RingLegend color="var(--color-danger)" label={labels[2]} value={overdue} />
        </div>
      </div>
    </div>
  );
}

function RingLegend({ color, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: UI.text, fontWeight: 750 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span className={layoutStyles.extracted11}>{label}</span>
      <span style={{ color: UI.muted }}>{value}</span>
    </div>
  );
}

export default function HealthSafetyPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [checksCount, setChecksCount] = useState(0);
  const [query, setQuery] = useState("");
  const [registerRecords, setRegisterRecords] = useState({});
  const [registerQuery, setRegisterQuery] = useState("");
  const [registerFilter, setRegisterFilter] = useState("all");
  const [registerStatusFilter, setRegisterStatusFilter] = useState("all");
  const [registerPage, setRegisterPage] = useState(1);
  const [showAddRegister, setShowAddRegister] = useState(false);
  const [addingRegister, setAddingRegister] = useState(false);
  const [newRegisterItem, setNewRegisterItem] = useState({
    section: "Date inspections",
    area: "inspection",
    item: "",
    frequency: "Annual",
    frequencyWeeks: 52,
    owner: "H&S",
    evidenceLabel: "Evidence",
    certificateRequired: true,
    notes: "",
  });

  const loadData = async () => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "hsRegister", operation: "load H&S overview" });
      setRows([]);
      setRegisterRecords({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [checksSnap, issuesSnap, defectsSnap, registerSnap] = await Promise.all([
        getDocs(tenantCollectionQuery(db, "vehicleChecks", dataAccessState)),
        getDocs(tenantCollectionQuery(db, "vehicleIssues", dataAccessState)),
        getDocs(tenantCollectionQuery(db, "defectReports", dataAccessState)),
        getDocs(tenantCollectionQuery(db, "hsRegister", dataAccessState)),
      ]);

      const checkDocs = checksSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const issueDocs = issuesSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const defectDocs = defectsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const registerById = {};
      registerSnap.docs.forEach((docSnap) => {
        registerById[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });

      setChecksCount(checkDocs.length);
      setRows(sortRows([...extractCheckRows(checkDocs), ...extractIssueRows(issueDocs), ...extractDefectReportRows(defectDocs)]));
      setRegisterRecords(registerById);
    } catch (error) {
      console.error("Failed to load H&S overview:", error);
      systemDialogs.showSystemNotification("Could not load H&S overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, dataAccessState]);

  const registerItems = useMemo(
    () => {
      const templateIds = new Set(HS_REGISTER_TEMPLATE.map((item) => item.id));
      const templateItems = HS_REGISTER_TEMPLATE.map((item) => ({
        ...item,
        ...(registerRecords[item.id] || {}),
        id: item.id,
      }));
      const customItems = Object.values(registerRecords)
        .filter((item) => item?.customRegisterItem && !templateIds.has(item.id))
        .map((item) => ({ ...item, id: item.id }));

      return [...templateItems, ...customItems];
    },
    [registerRecords]
  );

  const updateNewRegisterItem = (field, value) => {
    setNewRegisterItem((prev) => ({ ...prev, [field]: value }));
  };

  const createRegisterItem = async () => {
    const itemName = String(newRegisterItem.item || "").trim();
    if (!itemName) {
      systemDialogs.showSystemNotification("Add a register item name.");
      return;
    }

    setAddingRegister(true);
    try {
      const payload = {
        ...newRegisterItem,
        item: itemName,
        frequencyWeeks: Number(newRegisterItem.frequencyWeeks) || null,
        customRegisterItem: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const scopedPayload = tenantPayload(dataAccessState, payload);
      const ref = await addDoc(collection(db, "hsRegister"), scopedPayload);
      setRegisterRecords((prev) => ({ ...prev, [ref.id]: { id: ref.id, ...scopedPayload } }));
      setShowAddRegister(false);
      setNewRegisterItem((prev) => ({ ...prev, item: "", notes: "" }));
      router.push(`/h-and-s/${ref.id}`);
    } catch (error) {
      console.error("Failed to create H&S register item:", error);
      systemDialogs.showSystemNotification("Could not create H&S register item.");
    } finally {
      setAddingRegister(false);
    }
  };

  const counts = useMemo(() => {
    const general = rows.filter((row) => row.bucket === "general");
    const immediate = rows.filter((row) => row.bucket === "immediate");
    const declined = rows.filter((row) => row.bucket === "declined");
    const openGeneral = general.filter((row) => !isResolved(row)).length;
    const openImmediate = immediate.filter((row) => !isResolved(row)).length;

    return {
      general: openGeneral,
      immediate: openImmediate,
      declined: declined.length,
      scheduled: rows.filter(isScheduled).length,
      resolved: rows.filter(isResolved).length,
      totalOpen: openGeneral + openImmediate,
    };
  }, [rows]);

  const registerStats = useMemo(() => {
    const withState = registerItems.map((item) => ({ item, state: registerState(item) }));
    const certificateItems = registerItems.filter((item) => item.certificateRequired);
    return {
      due: withState.filter(({ state }) => state.label === "Overdue" || state.label === "Due soon" || state.label === "Needs date").length,
      overdue: withState.filter(({ state }) => state.label === "Overdue").length,
      dueSoon: withState.filter(({ state }) => state.label === "Due soon").length,
      needsDate: withState.filter(({ state }) => state.label === "Needs date").length,
      missingCertificates: registerItems.filter((item) => item.certificateRequired && !item.certificateUrl).length,
      certificateTotal: certificateItems.length,
      certificatesAttached: certificateItems.filter((item) => item.certificateUrl).length,
      inspections: registerItems.filter((item) => item.area === "inspection").length,
      complete: withState.filter(({ state }) => state.label === "Complete" || state.label === "OK").length,
    };
  }, [registerItems]);

  const registerAreaCount = (area) => registerItems.filter((item) => item.area === area).length;

  const openRegisterArea = (area) => {
    setRegisterFilter(area);
    window.setTimeout(() => {
      document.getElementById("hs-register")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const filteredRegisterItems = useMemo(() => {
    let list = registerItems;
    if (registerFilter !== "all") list = list.filter((item) => item.area === registerFilter);

    if (registerQuery.trim()) {
      const term = lower(registerQuery);
      list = list.filter((item) =>
        [item.section, item.item, item.frequency, item.owner, item.evidenceLabel, item.notes]
          .filter(Boolean)
          .some((value) => lower(value).includes(term))
      );
    }

    if (registerStatusFilter === "attention") {
      list = list.filter((item) => ["Overdue", "Due soon", "Needs date", "Needs cert"].includes(registerState(item).label));
    } else if (registerStatusFilter === "complete") {
      list = list.filter((item) => ["Complete", "OK"].includes(registerState(item).label));
    }

    const priority = { Overdue: 0, "Needs date": 1, "Needs cert": 2, "Due soon": 3, Booked: 4, Complete: 5, OK: 6 };
    return [...list].sort((a, b) => {
      const stateDifference = (priority[registerState(a).label] ?? 9) - (priority[registerState(b).label] ?? 9);
      if (stateDifference) return stateDifference;
      return (toDate(a.nextDue)?.getTime() || Number.MAX_SAFE_INTEGER) - (toDate(b.nextDue)?.getTime() || Number.MAX_SAFE_INTEGER);
    });
  }, [registerFilter, registerItems, registerQuery, registerStatusFilter]);

  const registerPageCount = Math.max(1, Math.ceil(filteredRegisterItems.length / REGISTER_PAGE_SIZE));
  const paginatedRegisterItems = useMemo(() => {
    const start = (registerPage - 1) * REGISTER_PAGE_SIZE;
    return filteredRegisterItems.slice(start, start + REGISTER_PAGE_SIZE);
  }, [filteredRegisterItems, registerPage]);

  useEffect(() => {
    setRegisterPage(1);
  }, [registerFilter, registerQuery, registerStatusFilter]);

  useEffect(() => {
    setRegisterPage((current) => Math.min(current, registerPageCount));
  }, [registerPageCount]);

  const filteredRows = useMemo(() => {
    const source = rows;
    if (!query.trim()) return source.slice(0, 12);

    const term = lower(query);
    return source
      .filter((row) =>
        [row.vehicle, row.driverName, row.itemLabel, row.note, row.jobLabel, row.sourceType, row.bucket]
          .filter(Boolean)
          .some((value) => lower(value).includes(term))
      )
      .slice(0, 20);
  }, [rows, query]);

  const queueCards = [
    {
      title: "Immediate defects",
      detail: "Urgent approved defects needing action.",
      value: counts.immediate,
      icon: ShieldAlert,
      tone: "danger",
      path: "/defects/immediate",
    },
    {
      title: "General maintenance",
      detail: "Approved defects ready for planning.",
      value: counts.general,
      icon: Wrench,
      tone: "brand",
      path: "/defects/general",
    },
    {
      title: "Declined defects",
      detail: "Rejected review items that can be reopened.",
      value: counts.declined,
      icon: Ban,
      tone: "amber",
      path: "/defects/declined",
    },
    {
      title: "Vehicle checks",
      detail: "Review the original submitted checks.",
      value: checksCount,
      icon: ClipboardList,
      tone: "green",
      path: "/vehicle-checks",
    },
  ];

  const dueRegisterItems = useMemo(
    () =>
      registerItems
        .map((item) => ({ ...item, state: registerState(item) }))
        .filter((item) => ["Overdue", "Due soon", "Needs date", "Needs cert"].includes(item.state.label))
        .sort((a, b) => {
          const ad = dateTime(a.nextDue);
          const bd = dateTime(b.nextDue);
          if (!ad && !bd) return a.item.localeCompare(b.item);
          if (!ad) return -1;
          if (!bd) return 1;
          return ad - bd;
        })
        .slice(0, 5),
    [registerItems]
  );

  const workspaceTiles = [
    {
      title: "Date Inspections",
      description: "PAT, fire, gas, mask fitting and certificate dates.",
      icon: CalendarCheck2,
      onClick: () => openRegisterArea("inspection"),
      rightBadges: [
        { label: `${registerAreaCount("inspection")} records`, tone: "soft" },
        registerStats.needsDate ? { label: `${registerStats.needsDate} need dates`, tone: "amber" } : null,
      ].filter(Boolean),
    },
    {
      title: "Workshop Checks",
      description: "Weekly checks for workshop safety and housekeeping.",
      icon: Wrench,
      onClick: () => openRegisterArea("workshop"),
      rightBadges: [{ label: `${registerAreaCount("workshop")} records`, tone: "soft" }],
    },
    {
      title: "PPE Records",
      description: "Simple employee PPE issue log with retained history.",
      icon: ShieldCheck,
      onClick: () => router.push("/h-and-s/ppe-issue-register"),
      rightBadges: [{ label: `${registerAreaCount("ppe")} records`, tone: "soft" }],
    },
    {
      title: "Training & Policies",
      description: "Employee training, policy acknowledgements and expiry dates.",
      icon: FileCheck2,
      onClick: () => router.push("/h-and-s/training-policy"),
      rightBadges: [
        { label: `${registerAreaCount("training") + registerAreaCount("policy")} records`, tone: "soft" },
        registerStats.missingCertificates ? { label: `${registerStats.missingCertificates} missing certs`, tone: "amber" } : null,
      ].filter(Boolean),
    },
  ];

  return (
    <HeaderSidebarLayout>
      <BusinessPage>
        <BusinessPageHeader
          title="H&S"
          subtitle="Vehicle checks, defect routes and maintenance follow-up in one place."
          actions={<BusinessHeaderActions>
            <Button variant="secondary" onClick={loadData}>
              <RefreshCcw size={15} />
              Refresh
            </Button>
            <Button variant={showAddRegister ? "secondary" : "primary"} onClick={() => setShowAddRegister((value) => !value)}>
              <CheckCircle2 size={15} />
              Add Register Item
            </Button>
          </BusinessHeaderActions>}
        />

        {showAddRegister ? (
          <section style={{ ...panel, marginBottom: 12 }}>
            <div className={layoutStyles.extracted14}>
              <div>
                <h2 style={titleMd}>Add H&S register item</h2>
                <div style={hint}>Create a new register record for inspections, policies, training or workshop checks.</div>
              </div>
            </div>
            <div className="hs-add-register-grid">
              <label>
                <p style={smallLabel}>Item name</p>
                <Input value={newRegisterItem.item} onChange={(event) => updateNewRegisterItem("item", event.target.value)} placeholder="e.g. Ladder inspection" />
              </label>
              <label>
                <p style={smallLabel}>Section</p>
                <Input value={newRegisterItem.section} onChange={(event) => updateNewRegisterItem("section", event.target.value)} />
              </label>
              <label>
                <p style={smallLabel}>Area</p>
                <Select value={newRegisterItem.area} onChange={(event) => updateNewRegisterItem("area", event.target.value)}>
                  <option value="inspection">Inspection</option>
                  <option value="workshop">Workshop</option>
                  <option value="training">Training</option>
                  <option value="policy">Policy</option>
                  <option value="ppe">PPE</option>
                </Select>
              </label>
              <label>
                <p style={smallLabel}>Frequency</p>
                <Select
                  value={String(newRegisterItem.frequencyWeeks || "")}
                  onChange={(event) => {
                    const weeks = Number(event.target.value);
                    updateNewRegisterItem("frequencyWeeks", weeks || null);
                    updateNewRegisterItem("frequency", frequencyLabelFromWeeks(weeks, "As required"));
                  }}
                >
                  <option value="">As required</option>
                  <option value="1">1 week</option>
                  <option value="2">2 weeks</option>
                  <option value="4">4 weeks</option>
                  <option value="12">12 weeks</option>
                  <option value="26">6 months</option>
                  <option value="52">Annual</option>
                  <option value="104">2 years</option>
                  <option value="260">5 years</option>
                </Select>
              </label>
              <label>
                <p style={smallLabel}>Owner</p>
                <Input value={newRegisterItem.owner} onChange={(event) => updateNewRegisterItem("owner", event.target.value)} />
              </label>
              <label>
                <p style={smallLabel}>Evidence label</p>
                <Input value={newRegisterItem.evidenceLabel} onChange={(event) => updateNewRegisterItem("evidenceLabel", event.target.value)} />
              </label>
              <Checkbox
                label="Evidence required"
                checked={newRegisterItem.certificateRequired}
                onChange={(event) => updateNewRegisterItem("certificateRequired", event.target.checked)}
              />
              <Button onClick={createRegisterItem} disabled={addingRegister}>
                {addingRegister ? "Creating..." : "Create Item"}
              </Button>
            </div>
            <label className={layoutStyles.extracted15}>
              <p style={smallLabel}>Notes</p>
              <Textarea value={newRegisterItem.notes} onChange={(event) => updateNewRegisterItem("notes", event.target.value)} rows={3} />
            </label>
          </section>
        ) : null}

        <section className={`hs-command-grid ${layoutStyles.extracted16}`} >
          <div style={{ ...surface, padding: 12 }}>
            <div className={layoutStyles.extracted17}>
              <div>
                <h2 style={titleMd}>Home</h2>
                <div style={hint}>H&S register, inspection evidence and defect review status.</div>
              </div>
              <Badge variant="info">All sections</Badge>
            </div>

            <div className={`hs-summary-grid ${layoutStyles.extracted18}`} >
              <SharedMetricCard
                label="Immediate"
                value={loading ? "-" : counts.immediate}
                icon={<AlertTriangle size={19} />}
                tone={counts.immediate ? "danger" : "success"}
                hint={`${counts.immediate} urgent defects`}
              />
              <SharedMetricCard
                label="Due Items"
                value={loading ? "-" : registerStats.due}
                icon={<CalendarCheck2 size={19} />}
                tone={registerStats.due ? "warning" : "success"}
                hint={`${registerStats.dueSoon} due soon`}
              />
              <SharedMetricCard
                label="Certificates"
                value={loading ? "-" : registerStats.missingCertificates}
                icon={<FileCheck2 size={19} />}
                tone={registerStats.missingCertificates ? "warning" : "success"}
                hint={`${registerStats.certificatesAttached} attached`}
              />
              <SharedMetricCard
                label="General"
                value={loading ? "-" : counts.general}
                icon={<Wrench size={19} />}
                tone={counts.general ? "info" : "success"}
                hint={`${counts.general} planned defects`}
              />
            </div>

            <div className={layoutStyles.extracted19}>
              <div>
                <h2 style={{ ...titleMd, fontSize: 15 }}>H&S workspaces</h2>
                <div style={hint}>Register areas and defect queues grouped by how they are used.</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => openRegisterArea("inspection")}>
                Open inspections
              </Button>
            </div>

            <div className={`hs-ops-grid ${layoutStyles.extracted20}`} >
              {workspaceTiles.map((tile) => (
                <NavigationCard
                  key={tile.title}
                  icon={createElement(tile.icon, { size: 20, strokeWidth: 2.2 })}
                  title={tile.title}
                  description={tile.description}
                  badges={tile.rightBadges}
                  onClick={tile.onClick}
                />
              ))}
            </div>
          </div>

          <aside className={layoutStyles.extracted21}>
            <RiskRing
              title="Inspection Status"
              total={registerItems.length}
              ok={registerStats.complete}
              soon={registerStats.dueSoon + registerStats.needsDate}
              overdue={registerStats.overdue}
              labels={["OK", "Due", "Overdue"]}
            />
            <RiskRing
              title="Certificate Evidence"
              total={registerStats.certificateTotal}
              ok={registerStats.certificatesAttached}
              soon={0}
              overdue={registerStats.missingCertificates}
              labels={["Attached", "Review", "Missing"]}
            />
          </aside>
        </section>

        <section className="hs-layout">
          <div className={layoutStyles.extracted22}>
            <div id="hs-register" style={{ ...premiumSection, overflow: "hidden", padding: 14 }}>
              <div className={layoutStyles.extracted23}>
                <div>
                  <h2 style={titleMd}>H&S register</h2>
                  <div style={hint}>Search and manage inspection dates, evidence, training and policies.</div>
                </div>
                <Badge variant={registerStats.due ? "warning" : "success"}>
                  {registerStats.due ? `${registerStats.due} need attention` : "All up to date"}
                </Badge>
              </div>

              <div className={layoutStyles.registerToolbar}>
                <div className="hs-register-tabs">
                  {[
                    ["all", "All", registerItems.length],
                    ["inspection", "Inspections", registerAreaCount("inspection")],
                    ["workshop", "Workshop", registerAreaCount("workshop")],
                    ["ppe", "PPE", registerAreaCount("ppe")],
                    ["training", "Training", registerAreaCount("training")],
                    ["policy", "Policies", registerAreaCount("policy")],
                  ].map(([value, label, count]) => (
                    <Button
                      key={value}
                      onClick={() => setRegisterFilter(value)}
                      variant={registerFilter === value ? "primary" : "secondary"}
                      size="sm"
                    >
                      {label} <span className={layoutStyles.filterCount}>{count}</span>
                    </Button>
                  ))}
                </div>

                <div className={layoutStyles.registerTools}>
                  <div className={layoutStyles.statusFilterWrap}>
                    <Select
                      value={registerStatusFilter}
                      onChange={(event) => setRegisterStatusFilter(event.target.value)}
                      aria-label="Filter register by status"
                    >
                      <option value="all">All statuses</option>
                      <option value="attention">Needs attention</option>
                      <option value="complete">Complete</option>
                    </Select>
                  </div>
                  <div className={layoutStyles.extracted25}>
                    <Search size={15} color={UI.muted} className={layoutStyles.extracted26} />
                    <Input
                      value={registerQuery}
                      onChange={(event) => setRegisterQuery(event.target.value)}
                      placeholder="Search register..."
                      className={layoutStyles.registerSearchInput}
                    />
                  </div>
                </div>
              </div>

              <div style={{ ...surface, boxShadow: "none", overflowX: "auto", marginTop: 10 }}>
                <table className={layoutStyles.extracted27}>
                  <colgroup>
                    <col className={layoutStyles.registerItemColumn} />
                    <col className={layoutStyles.registerScheduleColumn} />
                    <col className={layoutStyles.registerEvidenceColumn} />
                    <col className={layoutStyles.registerStatusColumn} />
                    <col className={layoutStyles.registerActionColumn} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ ...tableHead, textAlign: "left" }}>Record</th>
                      <th style={{ ...tableHead, textAlign: "left" }}>Schedule</th>
                      <th style={{ ...tableHead, textAlign: "left" }}>Evidence</th>
                      <th style={{ ...tableHead, textAlign: "left" }}>Status</th>
                      <th style={{ ...tableHead, textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRegisterItems.map((item) => {
                      const state = registerState(item);

                      return (
                        <tr
                          key={item.id}
                          onClick={() => router.push(`/h-and-s/${encodeURIComponent(item.id)}`)}
                          title="Open H&S register record"
                          className={layoutStyles.extracted35}
                        >
                          <td style={tableCell}>
                            <div className={layoutStyles.extracted37}>{item.item}</div>
                            <div className={layoutStyles.recordMeta}>
                              <span>{item.section}</span>
                              <span>{item.owner || "Unassigned"}</span>
                              {item.notes ? <span className={layoutStyles.recordNote} title={item.notes}>{item.notes}</span> : null}
                            </div>
                          </td>
                          <td style={tableCell}>
                            <div className={layoutStyles.scheduleCell}>
                              <span>{frequencyLabelFromWeeks(item.frequencyWeeks, item.frequency)}</span>
                              <strong className={state.tone === "danger" ? layoutStyles.overdueDate : undefined}>{fmtDate(item.nextDue)}</strong>
                            </div>
                          </td>
                          <td style={tableCell}>
                            <div className={layoutStyles.extracted39}>
                              {item.certificateUrl ? (
                                <a
                                  href={item.certificateUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 900,
                                    border: UI.border,
                                    background: "var(--color-success-soft)",
                                    color: "var(--color-success)",
                                    textDecoration: "none",
                                  }}
                                >
                                  <FileCheck2 size={13} />
                                  <span className={layoutStyles.evidenceName}>{item.certificateName || "Evidence attached"}</span>
                                </a>
                              ) : (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 900,
                                    border: UI.border,
                                    background: "var(--color-surface-subtle)",
                                    color: UI.muted,
                                  }}
                                >
                                  <FileCheck2 size={13} />
                                  {item.evidenceLabel}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={tableCell}>
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "4px 8px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 900,
                                ...registerToneStyle(state.tone),
                              }}
                            >
                              {state.label}
                            </span>
                          </td>
                          <td style={{ ...tableCell, textAlign: "right" }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(`/h-and-s/${encodeURIComponent(item.id)}`);
                              }}
                            >
                              Open
                              <ArrowUpRight size={14} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredRegisterItems.length ? (
                      <tr>
                        <td style={{ ...tableCell, color: UI.muted }} colSpan={5}>
                          No H&S register items found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {filteredRegisterItems.length ? (
                <div className={layoutStyles.registerPagination}>
                  <span>
                    {(registerPage - 1) * REGISTER_PAGE_SIZE + 1}–{Math.min(registerPage * REGISTER_PAGE_SIZE, filteredRegisterItems.length)} of {filteredRegisterItems.length}
                  </span>
                  <div className={layoutStyles.paginationButtons}>
                    <Button variant="secondary" size="sm" disabled={registerPage === 1} onClick={() => setRegisterPage((page) => Math.max(1, page - 1))}>
                      Previous
                    </Button>
                    <span>Page {registerPage} of {registerPageCount}</span>
                    <Button variant="secondary" size="sm" disabled={registerPage === registerPageCount} onClick={() => setRegisterPage((page) => Math.min(registerPageCount, page + 1))}>
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <style jsx>{`
          .hs-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 10px;
          }

          .hs-ops-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .hs-register-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }

          .hs-add-register-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            align-items: end;
          }

          @media (max-width: 1050px) {
            .hs-command-grid {
              grid-template-columns: 1fr !important;
            }

            .hs-summary-grid,
            .hs-ops-grid,
            .hs-add-register-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
          }

          @media (max-width: 680px) {
            .hs-summary-grid,
            .hs-ops-grid,
            .hs-add-register-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </BusinessPage>
    </HeaderSidebarLayout>
  );
}
