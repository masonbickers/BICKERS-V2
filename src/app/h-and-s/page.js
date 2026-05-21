"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
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

const UI = {
  radius: 8,
  radiusSm: 8,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  danger: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};
const h1 = { margin: 0, fontSize: 22, lineHeight: 1.08, fontWeight: 750, color: UI.text, letterSpacing: 0 };
const sub = { margin: "6px 0 0", color: UI.muted, fontSize: 13.5, lineHeight: 1.45 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...surface, padding: 12 };
const cardBase = {
  ...surface,
  padding: 12,
  background: "#ffffff",
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
  border: "1px solid #d7e1ea",
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
const sectionTag = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
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

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  if (kind === "pill") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "5px 8px",
      borderRadius: 999,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12,
      lineHeight: 1.2,
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const input = {
  width: "100%",
  minHeight: 34,
  padding: "7px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
};

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
  borderBottom: "1px solid #eef2f7",
  fontSize: 13,
  color: UI.text,
  verticalAlign: "middle",
};

const tableHead = {
  ...tableCell,
  color: UI.muted,
  background: "#f6f8fb",
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

  if (explicit === "complete") return { label: "Complete", tone: "green" };
  if (explicit === "booked") return { label: "Booked", tone: "brand" };
  if (missingDate) return { label: "Needs date", tone: "amber" };
  if (diff != null && diff < 0) return { label: "Overdue", tone: "danger" };
  if (missingCertificate) return { label: "Needs cert", tone: "amber" };
  if (diff != null && diff <= 30) return { label: "Due soon", tone: "amber" };
  return { label: "OK", tone: "green" };
}

function registerToneStyle(tone) {
  if (tone === "danger") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  if (tone === "amber") return { background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" };
  if (tone === "green") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
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
  if (status === "resolved") return { background: "#e0f2fe", color: "#075985", border: "1px solid #bae6fd" };
  if (status === "scheduled") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (status === "in_progress") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (row.bucket === "immediate") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  if (row.bucket === "declined") return { background: "#ffedd5", color: "#9a3412", border: "1px solid #fed7aa" };
  return { background: UI.brandSoft, color: UI.brand, border: `1px solid ${UI.brandBorder}` };
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
    danger: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
    amber: { bg: "#fff7ed", fg: "#9a3412", border: "#fed7aa" },
    green: { bg: "#ecfdf5", fg: "#065f46", border: "#bbf7d0" },
  }[tone];

  return (
    <div style={{ ...surface, padding: 12, minHeight: 92 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
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
    danger: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
    amber: { bg: "#fff7ed", fg: "#9a3412", border: "#fed7aa" },
    green: { bg: "#ecfdf5", fg: "#065f46", border: "#bbf7d0" },
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
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: UI.text, fontWeight: 900, fontSize: 14 }}>{title}</span>
        <span style={{ display: "block", color: UI.muted, fontSize: 12.5, lineHeight: 1.3, marginTop: 2 }}>{detail}</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
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
      ? { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b" }
      : tone === "amber"
      ? { bg: "#fff7ed", border: "#fed7aa", fg: "#9a3412" }
      : tone === "ok"
      ? { bg: "#ecfdf5", border: "#bbf7d0", fg: "#065f46" }
      : { bg: UI.brandSoft, border: UI.brandBorder, fg: UI.brand };

  return (
    <div style={{ ...metricCard, minHeight: 92 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
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
    background: "#ffffff",
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
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "34px minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 10,
        }}
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
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 5 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.18, color: UI.text }}>{title}</div>
          <div style={{ color: UI.muted, fontSize: 12.5, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {description}
          </div>
          {rightBadges.length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {rightBadges.map((item, index) => {
                const tone = item.tone || "soft";
                const style =
                  tone === "danger"
                    ? badge("#fef2f2", "#991b1b")
                    : tone === "amber"
                    ? badge("#fff7ed", "#9a3412")
                    : tone === "green"
                    ? badge("#ecfdf5", "#065f46")
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
  const background = `conic-gradient(#16a34a 0 ${okPct}%, #f59e0b ${okPct}% ${okPct + soonPct}%, #dc2626 ${okPct + soonPct}% 100%)`;

  return (
    <div style={{ ...surface, padding: 12 }}>
      <div style={{ ...sectionHeader, marginBottom: 10 }}>
        <div>
          <h2 style={{ ...titleMd, fontSize: 15 }}>{title}</h2>
          <div style={hint}>{safeTotal} records tracked</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
              background: "#ffffff",
              border: "1px solid #e5eaf0",
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
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <RingLegend color="#16a34a" label={labels[0]} value={ok} />
          <RingLegend color="#f59e0b" label={labels[1]} value={soon} />
          <RingLegend color="#dc2626" label={labels[2]} value={overdue} />
        </div>
      </div>
    </div>
  );
}

function RingLegend({ color, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: UI.text, fontWeight: 750 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ minWidth: 76 }}>{label}</span>
      <span style={{ color: UI.muted }}>{value}</span>
    </div>
  );
}

export default function HealthSafetyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [checksCount, setChecksCount] = useState(0);
  const [query, setQuery] = useState("");
  const [registerRecords, setRegisterRecords] = useState({});
  const [registerQuery, setRegisterQuery] = useState("");
  const [registerFilter, setRegisterFilter] = useState("all");
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
    setLoading(true);
    try {
      const [checksSnap, issuesSnap, defectsSnap, registerSnap] = await Promise.all([
        getDocs(collection(db, "vehicleChecks")),
        getDocs(collection(db, "vehicleIssues")),
        getDocs(collection(db, "defectReports")),
        getDocs(collection(db, "hsRegister")),
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
      alert("Could not load H&S overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      alert("Add a register item name.");
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
      const ref = await addDoc(collection(db, "hsRegister"), payload);
      setRegisterRecords((prev) => ({ ...prev, [ref.id]: { id: ref.id, ...payload } }));
      setShowAddRegister(false);
      setNewRegisterItem((prev) => ({ ...prev, item: "", notes: "" }));
      router.push(`/h-and-s/${ref.id}`);
    } catch (error) {
      console.error("Failed to create H&S register item:", error);
      alert("Could not create H&S register item.");
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

    return list;
  }, [registerFilter, registerItems, registerQuery]);

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
      <main style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>H&S</h1>
            <p style={sub}>Vehicle checks, defect routes and maintenance follow-up in one place.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn("ghost")} onClick={loadData}>
              <RefreshCcw size={15} />
              Refresh
            </button>
            <button type="button" style={btn("ghost")} onClick={() => setShowAddRegister((value) => !value)}>
              <CheckCircle2 size={15} />
              Add Register Item
            </button>
          </div>
        </div>

        {showAddRegister ? (
          <section style={{ ...panel, marginBottom: 12 }}>
            <div style={sectionHeader}>
              <div>
                <h2 style={titleMd}>Add H&S register item</h2>
                <div style={hint}>Create a new register record for inspections, policies, training or workshop checks.</div>
              </div>
            </div>
            <div className="hs-add-register-grid">
              <label>
                <p style={smallLabel}>Item name</p>
                <input value={newRegisterItem.item} onChange={(event) => updateNewRegisterItem("item", event.target.value)} placeholder="e.g. Ladder inspection" style={input} />
              </label>
              <label>
                <p style={smallLabel}>Section</p>
                <input value={newRegisterItem.section} onChange={(event) => updateNewRegisterItem("section", event.target.value)} style={input} />
              </label>
              <label>
                <p style={smallLabel}>Area</p>
                <select value={newRegisterItem.area} onChange={(event) => updateNewRegisterItem("area", event.target.value)} style={input}>
                  <option value="inspection">Inspection</option>
                  <option value="workshop">Workshop</option>
                  <option value="training">Training</option>
                  <option value="policy">Policy</option>
                  <option value="ppe">PPE</option>
                </select>
              </label>
              <label>
                <p style={smallLabel}>Frequency</p>
                <select
                  value={String(newRegisterItem.frequencyWeeks || "")}
                  onChange={(event) => {
                    const weeks = Number(event.target.value);
                    updateNewRegisterItem("frequencyWeeks", weeks || null);
                    updateNewRegisterItem("frequency", frequencyLabelFromWeeks(weeks, "As required"));
                  }}
                  style={input}
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
                </select>
              </label>
              <label>
                <p style={smallLabel}>Owner</p>
                <input value={newRegisterItem.owner} onChange={(event) => updateNewRegisterItem("owner", event.target.value)} style={input} />
              </label>
              <label>
                <p style={smallLabel}>Evidence label</p>
                <input value={newRegisterItem.evidenceLabel} onChange={(event) => updateNewRegisterItem("evidenceLabel", event.target.value)} style={input} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, color: UI.text, fontWeight: 850 }}>
                <input
                  type="checkbox"
                  checked={newRegisterItem.certificateRequired}
                  onChange={(event) => updateNewRegisterItem("certificateRequired", event.target.checked)}
                />
                Evidence required
              </label>
              <button type="button" style={{ ...btn("primary"), minHeight: 36, marginTop: 16 }} onClick={createRegisterItem} disabled={addingRegister}>
                {addingRegister ? "Creating..." : "Create Item"}
              </button>
            </div>
            <label style={{ display: "block", marginTop: 10 }}>
              <p style={smallLabel}>Notes</p>
              <textarea value={newRegisterItem.notes} onChange={(event) => updateNewRegisterItem("notes", event.target.value)} rows={3} style={{ ...input, resize: "vertical" }} />
            </label>
          </section>
        ) : null}

        <section className="hs-command-grid" style={commandGrid}>
          <div style={{ ...surface, padding: 12 }}>
            <div style={sectionHeader}>
              <div>
                <h2 style={titleMd}>Home</h2>
                <div style={hint}>H&S register, inspection evidence and defect review status.</div>
              </div>
              <span style={sectionTag}>All sections</span>
            </div>

            <div className="hs-summary-grid" style={summaryGrid}>
              <SummaryCard
                title="Immediate"
                value={loading ? "-" : counts.immediate}
                icon={AlertTriangle}
                tone={counts.immediate ? "danger" : "ok"}
                footer={`${counts.immediate} urgent defects`}
              />
              <SummaryCard
                title="Due Items"
                value={loading ? "-" : registerStats.due}
                icon={CalendarCheck2}
                tone={registerStats.due ? "amber" : "ok"}
                footer={`${registerStats.dueSoon} due soon`}
              />
              <SummaryCard
                title="Certificates"
                value={loading ? "-" : registerStats.missingCertificates}
                icon={FileCheck2}
                tone={registerStats.missingCertificates ? "amber" : "ok"}
                footer={`${registerStats.certificatesAttached} attached`}
              />
              <SummaryCard
                title="General"
                value={loading ? "-" : counts.general}
                icon={Wrench}
                tone={counts.general ? "brand" : "ok"}
                footer={`${counts.general} planned defects`}
              />
            </div>

            <div style={{ ...sectionHeader, marginTop: 14, marginBottom: 8 }}>
              <div>
                <h2 style={{ ...titleMd, fontSize: 15 }}>H&S workspaces</h2>
                <div style={hint}>Register areas and defect queues grouped by how they are used.</div>
              </div>
              <button type="button" style={btn("ghost")} onClick={() => openRegisterArea("inspection")}>
                Open inspections
              </button>
            </div>

            <div className="hs-ops-grid" style={opsGrid}>
              {workspaceTiles.map((tile) => (
                <Tile key={tile.title} {...tile} />
              ))}
            </div>
          </div>

          <aside style={{ display: "grid", gap: 12 }}>
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
          <div style={{ display: "grid", gap: 10 }}>
            <div id="hs-register" style={{ ...premiumSection, overflow: "hidden", padding: 14 }}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={titleMd}>H&S register</h2>
                  <div style={hint}>Inspection dates, certificates, workshop checks, PPE, training and policy records.</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ position: "relative", width: "min(320px, 100%)" }}>
                    <Search
                      size={15}
                      color={UI.muted}
                      style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                    />
                    <input
                      value={registerQuery}
                      onChange={(event) => setRegisterQuery(event.target.value)}
                      placeholder="Search H&S register..."
                      style={{ ...input, paddingLeft: 32 }}
                    />
                  </div>
                  <span style={sectionTag}>{filteredRegisterItems.length} shown</span>
                </div>
              </div>

              <div className="hs-register-tabs">
                {[
                  ["all", "All"],
                  ["inspection", "Date inspections"],
                  ["workshop", "Workshop checks"],
                  ["ppe", "PPE"],
                  ["training", "Training"],
                  ["policy", "Policies"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setRegisterFilter(value)}
                    style={{
                      ...btn(registerFilter === value ? "primary" : "ghost"),
                      boxShadow: registerFilter === value ? "0 8px 18px rgba(31,75,122,0.18)" : "none",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ ...surface, boxShadow: "none", overflowX: "auto", marginTop: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "6%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ ...tableHead, textAlign: "left" }}>Section</th>
                      <th style={{ ...tableHead, textAlign: "left" }}>Item</th>
                      <th style={{ ...tableHead, textAlign: "left" }}>Frequency</th>
                      <th style={{ ...tableHead, textAlign: "left" }}>Next Due</th>
                      <th style={{ ...tableHead, textAlign: "left" }}>Evidence</th>
                      <th style={{ ...tableHead, textAlign: "left" }}>Status</th>
                      <th style={{ ...tableHead, textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRegisterItems.map((item) => {
                      const state = registerState(item);

                      return (
                        <tr
                          key={item.id}
                          onClick={() => router.push(`/h-and-s/${encodeURIComponent(item.id)}`)}
                          title="Open H&S register record"
                          style={{ cursor: "pointer" }}
                        >
                          <td style={tableCell}>
                            <div style={{ fontWeight: 900 }}>{item.section}</div>
                            <div style={{ color: UI.muted, fontSize: 12, marginTop: 2 }}>{item.owner}</div>
                          </td>
                          <td style={tableCell}>
                            <div style={{ fontWeight: 900 }}>{item.item}</div>
                            {item.notes ? (
                              <div style={{ color: UI.muted, fontSize: 12, lineHeight: 1.25, marginTop: 2 }}>{item.notes}</div>
                            ) : null}
                          </td>
                          <td style={tableCell}>{frequencyLabelFromWeeks(item.frequencyWeeks, item.frequency)}</td>
                          <td style={tableCell}>
                            <span style={{ fontWeight: 900 }}>{fmtDate(item.nextDue)}</span>
                          </td>
                          <td style={tableCell}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                                    background: "#ecfdf5",
                                    color: "#166534",
                                    textDecoration: "none",
                                  }}
                                >
                                  <FileCheck2 size={13} />
                                  {item.certificateName || "Evidence attached"}
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
                                    background: "#f8fafc",
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
                            <button
                              type="button"
                              style={btn("ghost")}
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(`/h-and-s/${encodeURIComponent(item.id)}`);
                              }}
                            >
                              Open
                              <ArrowUpRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredRegisterItems.length ? (
                      <tr>
                        <td style={{ ...tableCell, color: UI.muted }} colSpan={7}>
                          No H&S register items found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
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
      </main>
    </HeaderSidebarLayout>
  );
}
