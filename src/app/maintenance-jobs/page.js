"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import { auth, db } from "../../../firebaseConfig";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  PlayCircle,
  Plus,
  Save,
  Search,
  Wrench,
} from "lucide-react";
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  isInactiveMaintenanceBooking,
  toDateLike,
} from "../utils/maintenanceCalendar";
import {
  buildAssetLabel,
  createMaintenanceJobPayload,
  normalizeAssetRecord,
} from "../utils/maintenanceSchema";
import {
  MAINTENANCE_JOB_WORKFLOW_STAGES,
  MAINTENANCE_STAGE_LABELS,
  MAINTENANCE_WORKFLOW_VERSION,
  canTransitionMaintenanceStage,
  normalizeMaintenanceStage,
  validateMaintenanceStageRequirements,
} from "../utils/maintenanceWorkflowSpec";
import { UI_TOKENS } from "@/app/utils/uiTokens";

const UI = UI_TOKENS;

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const card = { ...surface, padding: 12 };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { margin: 0, color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0 };
const sub = { marginTop: 6, color: UI.muted, fontSize: 13.5, lineHeight: 1.45 };
const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12.5, lineHeight: 1.4, marginTop: 4 };
const input = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: "var(--color-surface)",
  color: UI.text,
  fontSize: 13,
  outline: "none",
};
const btn = (kind = "ghost") => {
  const primary = kind === "primary";
  return {
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: primary ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
    background: primary
      ? "linear-gradient(180deg, var(--color-brand-hover) 0%, var(--color-brand) 100%)"
      : "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
    color: primary ? "var(--color-white)" : UI.text,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: primary
      ? "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)"
      : "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const thtd = { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid var(--color-brand-soft)", verticalAlign: "middle" };
const theadTh = {
  ...thtd,
  fontWeight: 900,
  color: UI.muted,
  background: "var(--color-surface-subtle)",
  fontSize: 11.5,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const fmtDateTime = (raw) => {
  const d = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtDate = (value) => {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return raw || "-";
  return d.toLocaleDateString("en-GB");
};

const getTimeValue = (value) => {
  const d = toDateLike(value);
  return d ? d.getTime() : 0;
};

const prettyStatus = (value) => {
  const clean = String(value || "").trim();
  if (!clean) return "Logged";
  return clean.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

const firstText = (...values) => values.map((value) => String(value || "").trim()).find(Boolean) || "";

const toActivitySummary = (...values) => firstText(...values) || "No summary provided.";

const classifyServiceRecord = (record) => {
  const type = String(record?.serviceType || "").toLowerCase();
  if (record?.recordType === "repair" || type.includes("repair")) return "repair";
  if (type.includes("minor") || type.includes("interim")) return "minor_service";
  return "service";
};

const activityTypeConfig = {
  service: { label: "Service", bg: "var(--color-success-soft)", fg: "var(--color-success)" },
  minor_service: { label: "Minor service", bg: "var(--color-info-soft)", fg: "var(--color-brand)" },
  repair: { label: "Repair", bg: "var(--color-warning-soft)", fg: "var(--color-warning)" },
  defect: { label: "Defect", bg: "var(--color-danger-soft)", fg: "var(--color-danger)" },
  mot_precheck: { label: "MOT pre-check", bg: "var(--color-info-soft)", fg: "var(--color-info)" },
  vehicle_prep: { label: "Vehicle prep", bg: "var(--color-info-soft)", fg: "var(--color-brand)" },
  vehicle_check: { label: "Vehicle check", bg: "var(--color-brand-soft)", fg: UI.brand },
  vehicle_issue: { label: "Vehicle issue", bg: "var(--color-accent-soft)", fg: "var(--color-accent)" },
  booking: { label: "Booking", bg: "var(--color-surface-subtle)", fg: UI.text },
  job: { label: "Job card", bg: UI.brandSoft, fg: UI.brand },
};

const activityTypeLabel = (type) => activityTypeConfig[type]?.label || prettyStatus(type || "Activity");
const isServiceLike = (item) => {
  const kind = String(item?.maintenanceKind || "").toLowerCase();
  return ["service", "minor_service"].includes(item.type) || kind.includes("service");
};
const isRepairLike = (item) => {
  const kind = String(item?.maintenanceKind || "").toLowerCase();
  return item.type === "repair" || kind.includes("repair");
};
const isDefectLike = (item) => item.type === "defect" || item.type === "vehicle_issue";
const isMotLike = (item) => {
  const kind = String(item?.maintenanceKind || "").toLowerCase();
  return item.type === "mot_precheck" || kind.includes("mot") || String(item.title || "").toLowerCase().includes("mot");
};

const activityGroups = [
  {
    key: "mot",
    label: "MOT",
    note: "MOT pre-checks, MOT bookings and MOT job-card activity",
    matches: isMotLike,
    icon: ClipboardList,
  },
  {
    key: "services",
    label: "Services",
    note: "Full, minor and legacy service records",
    matches: isServiceLike,
    icon: Wrench,
  },
  {
    key: "repairs",
    label: "Repairs",
    note: "Repair records and repair job-card activity",
    matches: (item) => isRepairLike(item) || (item.type === "job" && String(item.title || item.summary || "").toLowerCase().includes("repair")),
    icon: Wrench,
  },
  {
    key: "defects",
    label: "Defects & Issues",
    note: "Open and completed defects, reported issues and failed checks",
    matches: isDefectLike,
    icon: AlertTriangle,
  },
  {
    key: "checks",
    label: "Checks & Prep",
    note: "Vehicle checks, prep records and inspection activity",
    matches: (item) => item.type === "vehicle_check" || item.type === "vehicle_prep" || String(item.title || "").toLowerCase().includes("inspection"),
    icon: FileCheck2,
  },
  {
    key: "bookings",
    label: "Bookings",
    note: "Active maintenance booking records",
    matches: (item) => item.type === "booking",
    icon: CalendarCheck2,
  },
  {
    key: "jobs",
    label: "Job Cards",
    note: "Maintenance workflow updates and assigned work",
    matches: (item) => item.type === "job",
    icon: ClipboardList,
  },
];

const buildVehicleLabelFromObject = (v) => {
  if (!v) return "";
  const base = v.name ?? v.vehicleName ?? v.assetLabel ?? v.label ?? v.title ?? v.model ?? "";
  const reg = v.registration ?? v.reg ?? v.regNumber ?? v.regNo ?? v.plate ?? "";
  const baseClean = String(base || "").trim();
  const regClean = String(reg || "").trim().toUpperCase();
  if (baseClean && regClean && !baseClean.toUpperCase().includes(regClean)) return `${baseClean} (${regClean})`;
  return baseClean || regClean || "";
};

const buildActivityFromLegacyHistory = (vehicle) => {
  const vehicleId = vehicle?.id || null;
  const vehicleName = buildAssetLabel(vehicle) || vehicle?.assetLabel || "Vehicle";
  const registration = vehicle?.registration || vehicle?.reg || "";
  const asArray = (value) => (Array.isArray(value) ? value : []);
  const mapBase = (entry, index, sourceCollection, type, title, summary, person, status, activityDate) => ({
    activityId: `${sourceCollection}:${vehicleId || "vehicle"}:${entry?.serviceRecordId || entry?.repairRecordId || index}`,
    sourceCollection,
    sourceId: entry?.serviceRecordId || entry?.repairRecordId || String(index),
    type,
    title,
    summary,
    vehicleId,
    vehicleName,
    registration,
    person,
    status,
    activityDate,
  });

  return [
    ...asArray(vehicle?.serviceHistory).map((entry, index) =>
      mapBase(
        entry,
        index,
        "vehicles.serviceHistory",
        "service",
        entry?.bookingRef || entry?.serviceType || "Service history entry",
        toActivitySummary(entry?.notes, entry?.partsUsed),
        entry?.completedBy || entry?.signedBy || "",
        "history",
        entry?.completedDate || entry?.date || entry?.createdAt
      )
    ),
    ...asArray(vehicle?.repairHistory).map((entry, index) =>
      mapBase(
        entry,
        index,
        "vehicles.repairHistory",
        "repair",
        entry?.summary || "Repair history entry",
        toActivitySummary(entry?.reason, entry?.partsUsed),
        entry?.completedBy || "",
        "history",
        entry?.completedDate || entry?.date || entry?.createdAt
      )
    ),
    ...asArray(vehicle?.defectHistory).map((entry, index) =>
      mapBase(
        entry,
        index,
        "vehicles.defectHistory",
        "defect",
        entry?.description || "Defect history entry",
        toActivitySummary(entry?.notes, entry?.location),
        entry?.reportedBy || "",
        entry?.status || "open",
        entry?.updatedAt || entry?.createdAt
      )
    ),
  ];
};

const buildJobDraft = (job = {}) => ({
  provider: String(job.provider || "").trim(),
  bookedDate: String(job.bookedDate || "").trim(),
  assignedToName: String(job.assignedToName || "").trim(),
  completionNotes: String(job.completionNotes || "").trim(),
  totalCost: String(job.totalCost || "").trim(),
  poNumber: String(job.poNumber || "").trim(),
  invoiceRef: String(job.invoiceRef || "").trim(),
});

export default function MaintenanceJobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rowRefs = useRef({});
  const authAccess = useAuth() || {};
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.user, authAccess.userDoc]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [vehicles, setVehicles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [defectReports, setDefectReports] = useState([]);
  const [motPreChecks, setMotPreChecks] = useState([]);
  const [vehiclePrepRecords, setVehiclePrepRecords] = useState([]);
  const [checkDocs, setCheckDocs] = useState([]);
  const [vehicleIssueDocs, setVehicleIssueDocs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savingJobId, setSavingJobId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [jobErrors, setJobErrors] = useState({});
  const [jobDrafts, setJobDrafts] = useState({});
  const [focusedJobId, setFocusedJobId] = useState("");

  const [form, setForm] = useState({
    assetId: "",
    type: "service",
    title: "",
    dueDate: "",
    plannedDate: "",
    priority: "normal",
    notes: "",
  });

  const normalizeWorkflowStageCompat = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "complete") return "completed";
    if (raw === "qa") return "completed";
    if (raw === "awaiting_parts") return "booked";
    return normalizeMaintenanceStage(raw);
  };

  const prettyField = (field) =>
    String(field || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicles", operation: "read maintenance job vehicles" });
      setVehicles([]);
      return;
    }

    const loadVehicles = async () => {
      const snap = await getDocs(tenantCollectionQuery(db, "vehicles", dataAccessState));
      const rows = snap.docs.map((d) => normalizeAssetRecord({ id: d.id, ...(d.data() || {}) }));
      rows.sort((a, b) => String(a.assetLabel || a.id).localeCompare(String(b.assetLabel || b.id)));
      setVehicles(rows);
    };
    loadVehicles().catch((error) => {
      if (!handleFirestoreAccessError(error, { collectionName: "vehicles", operation: "read maintenance job vehicles" })) {
        console.error("Failed loading maintenance job vehicles:", error);
      }
      setVehicles([]);
    });
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "maintenanceJobs", operation: "listen maintenance jobs" });
      setJobs([]);
      return undefined;
    }

    const unsub = onSnapshot(tenantCollectionQuery(db, "maintenanceJobs", dataAccessState), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      rows.sort((a, b) => {
        const at = new Date(a.updatedAt || 0).getTime();
        const bt = new Date(b.updatedAt || 0).getTime();
        return bt - at;
      });
      setJobs(rows);
      setJobDrafts((prev) => {
        const next = { ...prev };
        const rowIds = new Set(rows.map((row) => row.id));

        rows.forEach((row) => {
          const baseDraft = buildJobDraft(row);
          next[row.id] = prev[row.id] ? { ...baseDraft, ...prev[row.id] } : baseDraft;
        });

        Object.keys(next).forEach((id) => {
          if (!rowIds.has(id)) delete next[id];
        });

        return next;
      });
    }, (error) => {
      if (!handleFirestoreAccessError(error, { collectionName: "maintenanceJobs", operation: "listen maintenance jobs" })) {
        console.error("Failed loading maintenance jobs:", error);
      }
      setJobs([]);
    });
    return () => unsub();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "serviceRecords", operation: "listen maintenance overview activity" });
      setMaintenanceBookings([]);
      setServiceRecords([]);
      setDefectReports([]);
      setMotPreChecks([]);
      setVehiclePrepRecords([]);
      setCheckDocs([]);
      setVehicleIssueDocs([]);
      return undefined;
    }

    const listen = (collectionName, setter, operation) =>
      onSnapshot(
        tenantCollectionQuery(db, collectionName, dataAccessState),
        (snap) => setter(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))),
        (error) => {
          if (!handleFirestoreAccessError(error, { collectionName, operation })) {
            console.error(`[maintenance-jobs] ${collectionName} snapshot error:`, error);
          }
          setter([]);
        }
      );

    const unsubscribers = [
      listen("maintenanceBookings", setMaintenanceBookings, "listen maintenance booking overview"),
      listen("serviceRecords", setServiceRecords, "listen maintenance service activity"),
      listen("defectReports", setDefectReports, "listen maintenance defect activity"),
      listen("motPreChecks", setMotPreChecks, "listen maintenance MOT activity"),
      listen("vehiclePrepRecords", setVehiclePrepRecords, "listen maintenance prep activity"),
      listen("vehicleChecks", setCheckDocs, "listen maintenance check activity"),
      listen("vehicleIssues", setVehicleIssueDocs, "listen maintenance issue activity"),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    const vehicleId = String(searchParams.get("vehicleId") || "").trim();
    const kind = String(searchParams.get("kind") || "").trim().toLowerCase();
    const dueDate = String(searchParams.get("dueDate") || "").trim();
    if (!vehicleId && !kind && !dueDate) return;
    setForm((prev) => ({
      ...prev,
      assetId: vehicleId || prev.assetId,
      type: kind === "mot" ? "mot" : kind === "service" ? "service" : prev.type,
      dueDate: dueDate || prev.dueDate,
      plannedDate: prev.plannedDate || dueDate,
    }));
  }, [searchParams]);

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        id: String(v.id),
        label: buildAssetLabel(v) || String(v.id),
      })),
    [vehicles]
  );

  const visibleJobs = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    return jobs.filter((j) => {
      const stage = normalizeWorkflowStageCompat(j.status);
      if (statusFilter !== "all" && stage !== statusFilter) return false;
      if (!q) return true;
      const blob = [
        j.title,
        j.assetLabel,
        j.assetId,
        j.type,
        j.status,
        j.priority,
        j.notes,
        j.provider,
        j.assignedToName,
        j.completionNotes,
        j.poNumber,
        j.invoiceRef,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [jobs, search, statusFilter]);

  useEffect(() => {
    const jobId = String(searchParams.get("jobId") || "").trim();
    if (jobId) setFocusedJobId(jobId);
    if (!jobId) return;

    const frame = requestAnimationFrame(() => {
      const row = rowRefs.current[jobId];
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => cancelAnimationFrame(frame);
  }, [searchParams, visibleJobs]);

  useEffect(() => {
    if (!focusedJobId) return;

    const frame = requestAnimationFrame(() => {
      const row = rowRefs.current[focusedJobId];
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => cancelAnimationFrame(frame);
  }, [focusedJobId, visibleJobs]);

  const jobStats = useMemo(() => {
    const counts = {
      total: jobs.length,
      planned: 0,
      active: 0,
      closed: 0,
      commercial: 0,
    };

    jobs.forEach((job) => {
      const stage = normalizeWorkflowStageCompat(job.status);
      if (stage === "planned") counts.planned += 1;
      if (stage === "booked" || stage === "in_progress") counts.active += 1;
      if (stage === "completed" || stage === "ready_to_invoice") counts.commercial += 1;
      if (stage === "closed") counts.closed += 1;
    });

    return counts;
  }, [jobs]);

  const activity = useMemo(() => {
    const vehicleById = new Map(vehicles.map((v) => [String(v.id), v]));
    const serviceRecordIds = new Set(serviceRecords.map((record) => String(record.id)));
    const labelForVehicle = (vehicleId, fallback = "Unknown vehicle") => {
      const vehicle = vehicleById.get(String(vehicleId || ""));
      return vehicle ? buildAssetLabel(vehicle) || fallback : fallback;
    };
    const registrationForVehicle = (vehicleId, fallback = "") => {
      const vehicle = vehicleById.get(String(vehicleId || ""));
      return vehicle?.registration || vehicle?.reg || fallback || "";
    };

    const rows = [
      ...serviceRecords.map((record) => {
        const type = classifyServiceRecord(record);
        const vehicleName = record.vehicleName || labelForVehicle(record.vehicleId);
        return {
          activityId: `serviceRecords:${record.id}`,
          sourceCollection: "serviceRecords",
          sourceId: record.id,
          type,
          title: type === "repair" ? record.repairSummary || record.workSummary || "General repair" : record.serviceType || "Service record",
          summary: toActivitySummary(record.workSummary, record.repairSummary, record.repairReason, record.partsUsed, record.extraNotes),
          vehicleId: record.vehicleId || null,
          vehicleName,
          registration: record.registration || registrationForVehicle(record.vehicleId),
          person: record.signedBy || record.completedBy || "",
          status: type === "repair" ? "completed" : "logged",
          activityDate: record.completedAt || record.updatedAt || record.createdAt || record.serviceDateOnly || record.serviceDate || record.completedDate,
        };
      }),
      ...defectReports.map((record) => ({
        activityId: `defectReports:${record.id}`,
        sourceCollection: "defectReports",
        sourceId: record.id,
        type: "defect",
        title: record.description || "Workshop defect report",
        summary: toActivitySummary(record.notes, record.location, record.severity),
        vehicleId: record.vehicleId || null,
        vehicleName: record.vehicleName || labelForVehicle(record.vehicleId),
        registration: record.registration || registrationForVehicle(record.vehicleId),
        person: record.reportedBy || "",
        status: record.status || "open",
        activityDate: record.updatedAt || record.createdAt,
      })),
      ...motPreChecks.map((record) => ({
        activityId: `motPreChecks:${record.id}`,
        sourceCollection: "motPreChecks",
        sourceId: record.id,
        type: "mot_precheck",
        title: record.status || "MOT pre-check",
        summary: toActivitySummary(record.summary, record.faultsFound, record.workRecommended),
        vehicleId: record.vehicleId || null,
        vehicleName: record.vehicleName || labelForVehicle(record.vehicleId),
        registration: record.registration || registrationForVehicle(record.vehicleId),
        person: record.signedBy || "",
        status: record.status || "completed",
        activityDate: record.completedAt || record.updatedAt || record.createdAt || record.precheckDateOnly || record.precheckDateTime,
      })),
      ...vehiclePrepRecords.map((record) => ({
        activityId: `vehiclePrepRecords:${record.id}`,
        sourceCollection: "vehiclePrepRecords",
        sourceId: record.id,
        type: "vehicle_prep",
        title: record.completed ? "Vehicle prep completed" : "Vehicle prep logged",
        summary: toActivitySummary(record.notes),
        vehicleId: record.vehicleId || null,
        vehicleName: record.vehicleName || labelForVehicle(record.vehicleId),
        registration: record.registration || registrationForVehicle(record.vehicleId),
        person: record.completedBy || "",
        status: record.completed ? "completed" : "draft",
        activityDate: record.completedAt || record.updatedAt || record.createdAt || record.prepDate,
      })),
      ...checkDocs.map((record) => {
        const defectCount = Array.isArray(record.items) ? record.items.filter((item) => item?.status === "defect").length : 0;
        return {
          activityId: `vehicleChecks:${record.id}`,
          sourceCollection: "vehicleChecks",
          sourceId: record.id,
          type: "vehicle_check",
          title: defectCount > 0 ? `${defectCount} defects found` : "Vehicle check submitted",
          summary: toActivitySummary(record.notes, defectCount > 0 ? `${defectCount} defect items logged.` : ""),
          vehicleId: record.vehicleId || null,
          vehicleName: buildVehicleLabelFromObject(record.vehicle) || record.vehicleName || labelForVehicle(record.vehicleId),
          registration: typeof record.vehicle === "object" ? record.vehicle?.registration || record.vehicle?.reg || "" : record.registration || registrationForVehicle(record.vehicleId),
          person: record.driverName || record.driverCode || "",
          status: record.status || "submitted",
          activityDate: record.updatedAt || record.createdAt || record.dateISO,
        };
      }),
      ...vehicleIssueDocs.map((record) => ({
        activityId: `vehicleIssues:${record.id}`,
        sourceCollection: "vehicleIssues",
        sourceId: record.id,
        type: "vehicle_issue",
        title: record.category || "Vehicle issue",
        summary: toActivitySummary(record.description),
        vehicleId: record.vehicleId || null,
        vehicleName: record.vehicleName || labelForVehicle(record.vehicleId),
        registration: record.registration || registrationForVehicle(record.vehicleId),
        person: record.reporterName || record.reporterCode || "",
        status: record.status || "open",
        activityDate: record.updatedAt || record.createdAt,
      })),
      ...maintenanceBookings
        .filter((booking) => !isInactiveMaintenanceBooking(booking.status))
        .map((booking) => ({
          activityId: `maintenanceBookings:${booking.id}`,
          sourceCollection: "maintenanceBookings",
          sourceId: booking.id,
          type: "booking",
          maintenanceKind: String(booking.type || booking.maintenanceType || "").toLowerCase(),
          title: `${String(booking.type || booking.maintenanceType || "Maintenance").toUpperCase()} booking`,
          summary: toActivitySummary(booking.provider, booking.location, booking.notes, booking.motBookingNotes, booking.serviceBookingNotes),
          vehicleId: booking.vehicleId || null,
          vehicleName: booking.vehicleLabel || booking.vehicleName || labelForVehicle(booking.vehicleId),
          registration: booking.registration || registrationForVehicle(booking.vehicleId),
          person: booking.bookedBy || booking.createdBy || "",
          status: booking.status || "booked",
          activityDate: booking.appointmentDate || booking.startDateISO || booking.startDate || booking.updatedAt || booking.createdAt,
        })),
      ...jobs.map((job) => ({
        activityId: `maintenanceJobs:${job.id}`,
        sourceCollection: "maintenanceJobs",
        sourceId: job.id,
        type: "job",
        maintenanceKind: String(job.type || "").toLowerCase(),
        title: job.title || "Maintenance job card",
        summary: toActivitySummary(job.notes, job.completionNotes, job.provider),
        vehicleId: job.assetId || null,
        vehicleName: job.assetLabel || labelForVehicle(job.assetId),
        registration: registrationForVehicle(job.assetId),
        person: job.assignedToName || job.updatedBy || job.createdBy || "",
        status: job.status || "planned",
        activityDate: job.updatedAt || job.updatedAtServer || job.plannedDate || job.dueDate || job.createdAt,
      })),
    ];

    const legacyRows = vehicles
      .flatMap((vehicle) => buildActivityFromLegacyHistory(vehicle))
      .filter((row) => !row.sourceId || !serviceRecordIds.has(String(row.sourceId)));

    return [...rows, ...legacyRows].sort((a, b) => getTimeValue(b.activityDate) - getTimeValue(a.activityDate));
  }, [checkDocs, defectReports, jobs, maintenanceBookings, motPreChecks, serviceRecords, vehicleIssueDocs, vehiclePrepRecords, vehicles]);

  const overviewStats = useMemo(() => {
    const openDefects = activity.filter((item) => isDefectLike(item) && String(item.status || "").toLowerCase() === "open").length;
    return {
      activity: activity.length,
      services: activity.filter(isServiceLike).length,
      mot: activity.filter(isMotLike).length,
      repairs: activity.filter(isRepairLike).length,
      defects: activity.filter(isDefectLike).length,
      openDefects,
      bookings: maintenanceBookings.filter((booking) => !isInactiveMaintenanceBooking(booking.status)).length,
    };
  }, [activity, maintenanceBookings]);

  const groupedActivity = useMemo(
    () => {
      const assigned = new Set();
      return activityGroups
        .map((group) => {
          const items = activity.filter((item) => {
            if (assigned.has(item.activityId) || !group.matches(item)) return false;
            assigned.add(item.activityId);
            return true;
          });
          return {
            ...group,
            count: items.length,
            items: items.slice(0, 8),
          };
        })
    },
    [activity]
  );

  const createJob = async () => {
    if (!form.assetId) {
      setCreateError("Please select an asset.");
      setCreateMessage("");
      return;
    }
    if (!form.title.trim()) {
      setCreateError("Please enter a job title.");
      setCreateMessage("");
      return;
    }
    setSaving(true);
    setCreateError("");
    setCreateMessage("");
    try {
      const selected = vehicles.find((v) => String(v.id) === String(form.assetId));
      const createdBy = auth?.currentUser?.email || "Unknown";
      const createdTitle = String(form.title || "").trim();
      const payload = createMaintenanceJobPayload({
        assetId: form.assetId,
        assetLabel: buildAssetLabel(selected) || form.assetId,
        type: form.type,
        title: form.title,
        dueDate: form.dueDate,
        plannedDate: form.plannedDate,
        priority: form.priority,
        notes: form.notes,
        createdBy,
        source: String(searchParams.get("source") || "manual"),
        sourceRef: String(searchParams.get("vehicleId") || ""),
      });
      const nextPayload = {
        ...payload,
        status: "planned",
        workflowVersion: MAINTENANCE_WORKFLOW_VERSION,
      };
      const validation = validateMaintenanceStageRequirements(nextPayload, "planned");
      if (!validation.ok) {
        setCreateError(`Missing required fields: ${validation.missing.map(prettyField).join(", ")}`);
        setSaving(false);
        return;
      }
      const docRef = await addDoc(collection(db, "maintenanceJobs"), tenantPayload(dataAccessState, nextPayload));
      setForm((prev) => ({ ...prev, title: "", notes: "" }));
      setFocusedJobId(docRef.id);
      setCreateMessage(`Job card created for ${createdTitle || "this asset"}. The new row is highlighted below.`);
    } catch (error) {
      console.error("Failed creating maintenance job:", error);
      setCreateError("Could not create job card.");
    } finally {
      setSaving(false);
    }
  };

  const updateJobDraft = (jobId, field, value) => {
    setJobDrafts((prev) => ({
      ...prev,
      [jobId]: {
        ...(prev[jobId] || {}),
        [field]: value,
      },
    }));
  };

  const buildWorkflowPatch = (jobId) => {
    const draft = jobDrafts[jobId] || {};
    return {
      provider: String(draft.provider || "").trim(),
      bookedDate: String(draft.bookedDate || "").trim(),
      assignedToName: String(draft.assignedToName || "").trim(),
      completionNotes: String(draft.completionNotes || "").trim(),
      totalCost: String(draft.totalCost || "").trim(),
      poNumber: String(draft.poNumber || "").trim(),
      invoiceRef: String(draft.invoiceRef || "").trim(),
    };
  };

  const saveJobDetails = async (job) => {
    if (!job?.id || savingJobId) return;

    const patch = {
      ...buildWorkflowPatch(job.id),
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
      updatedBy: auth?.currentUser?.email || "Unknown",
    };

    setSavingJobId(job.id);
    try {
      await updateDoc(doc(db, "maintenanceJobs", job.id), tenantPayload(dataAccessState, patch));
      setJobErrors((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    } catch (error) {
      console.error("Failed saving maintenance job details:", error);
      setJobErrors((prev) => ({
        ...prev,
        [job.id]: "Could not save job details.",
      }));
    } finally {
      setSavingJobId("");
    }
  };

  const setJobStatus = async (job, nextRawStatus) => {
    if (!job?.id || savingJobId) return;

    try {
      const currentStatus = normalizeWorkflowStageCompat(job?.status);
      const nextStatus = normalizeWorkflowStageCompat(nextRawStatus);
      if (!canTransitionMaintenanceStage(currentStatus, nextStatus)) {
        setJobErrors((prev) => ({
          ...prev,
          [job.id]: `Invalid transition: ${MAINTENANCE_STAGE_LABELS[currentStatus]} -> ${MAINTENANCE_STAGE_LABELS[nextStatus]}`,
        }));
        return;
      }

      const nowIso = new Date().toISOString();
      const patch = {
        ...buildWorkflowPatch(job.id),
        status: nextStatus,
        workflowVersion: MAINTENANCE_WORKFLOW_VERSION,
        updatedAt: nowIso,
        updatedAtServer: serverTimestamp(),
        updatedBy: auth?.currentUser?.email || "Unknown",
      };
      if (nextStatus === "in_progress" && !job?.startedAt) patch.startedAt = nowIso;
      if (nextStatus === "completed" && !job?.completedAt) patch.completedAt = nowIso;
      if (nextStatus === "closed" && !job?.closedAt) patch.closedAt = nowIso;

      const candidate = { ...(job || {}), ...patch };
      const validation = validateMaintenanceStageRequirements(candidate, nextStatus);
      if (!validation.ok) {
        setJobErrors((prev) => ({
          ...prev,
          [job.id]: `Missing required fields: ${validation.missing.map(prettyField).join(", ")}`,
        }));
        return;
      }

      setSavingJobId(job.id);
      await updateDoc(doc(db, "maintenanceJobs", job.id), tenantPayload(dataAccessState, patch));
      setJobErrors((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    } catch (error) {
      console.error("Failed updating maintenance job status:", error);
      setJobErrors((prev) => ({
        ...prev,
        [job.id]: "Could not update status.",
      }));
    } finally {
      setSavingJobId("");
    }
  };

  return (
    <HeaderSidebarLayout>
      <style>{`
        input:focus, button:focus, select:focus, textarea:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(31,75,122,0.14);
          border-color: var(--shell-muted) !important;
        }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .maintenance-jobs-action:hover { background: var(--color-surface-subtle) !important; border-color: var(--shell-muted) !important; }
        .maintenance-jobs-kpi-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        .maintenance-jobs-form-grid {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .maintenance-jobs-filter-grid {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 220px;
          gap: 10px;
          align-items: center;
        }
        .maintenance-activity-groups {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 14px;
        }
        @media (max-width: 1180px) {
          .maintenance-jobs-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .maintenance-jobs-filter-grid { grid-template-columns: 1fr 1fr !important; }
          .maintenance-activity-groups { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 720px) {
          .maintenance-jobs-kpi-grid, .maintenance-jobs-filter-grid { grid-template-columns: 1fr !important; }
          .maintenance-activity-row { grid-template-columns: 1fr !important; }
          .maintenance-activity-status { border-left: 0 !important; justify-content: flex-start !important; }
        }
      `}</style>
      <div style={pageWrap}>
        <div className={layoutStyles.extracted1}>
            <div>
              <h1 style={h1}>Maintenance Jobs</h1>
              <div style={sub}>
                Plan, track, complete, and close workshop jobs from one place.
              </div>
            </div>
            <div className={layoutStyles.extracted2}>
              <button type="button" className="maintenance-jobs-action" style={btn()} onClick={() => router.push("/vehicle-home")}>
                <ArrowLeft size={15} />
                Back to Vehicle Home
              </button>
            </div>
        </div>

        <div className="maintenance-jobs-kpi-grid">
          <SummaryCard label="Total Jobs" value={jobStats.total} sub="All maintenance job cards" icon={ClipboardList} tone="brand" />
          <SummaryCard label="Planned" value={jobStats.planned} sub="Needs booking detail" icon={CalendarCheck2} tone="soft" />
          <SummaryCard label="Active" value={jobStats.active} sub="Booked or in progress" icon={PlayCircle} tone="amber" />
          <SummaryCard label="Commercial" value={jobStats.commercial} sub="Completed or invoice-ready" icon={FileCheck2} tone="ok" />
          <SummaryCard label="Closed" value={jobStats.closed} sub="Finished workflow" icon={CheckCircle2} tone="default" />
        </div>

        <section className={layoutStyles.extracted3}>
          <div className={layoutStyles.extracted4}>
            <div>
              <h2 style={titleMd}>Transport Manager Overview</h2>
              <div style={hint}>Maintenance activity grouped into queue cards for a quick transport-manager scan.</div>
            </div>
            <OverviewChip label="Activity" value={overviewStats.activity} />
          </div>

          <div className="maintenance-activity-groups">
            {groupedActivity.length === 0 ? (
              <div style={{ color: UI.muted, fontSize: 13, padding: 12, textAlign: "center" }}>No vehicle activity found yet.</div>
            ) : (
              groupedActivity.map((group) => (
                <ActivityGroup key={group.key} group={group} router={router} />
              ))
            )}
          </div>
        </section>

        <div style={{ ...card, marginBottom: 14 }}>
          <div className={layoutStyles.extracted5}>
            <div>
              <h2 style={titleMd}>Create Job Card</h2>
              <div style={hint}>Start a maintenance job, then complete workflow details in the queue below.</div>
            </div>
          </div>
          <div className="maintenance-jobs-form-grid">
            <select value={form.assetId} onChange={(e) => setForm((p) => ({ ...p, assetId: e.target.value }))} style={input}>
              <option value="">Select asset...</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} style={input}>
              <option value="service">Service</option>
              <option value="mot">MOT</option>
              <option value="inspection">Inspection</option>
              <option value="repair">Repair</option>
            </select>
            <input type="text" placeholder="Job title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} style={input} />
            <input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} style={input} />
            <input type="date" value={form.plannedDate} onChange={(e) => setForm((p) => ({ ...p, plannedDate: e.target.value }))} style={input} />
            <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} style={input}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            style={{ ...input, marginTop: 8, minHeight: 64, resize: "vertical" }}
          />
          <div className={layoutStyles.extracted6}>
            <button type="button" style={btn("primary")} onClick={createJob} disabled={saving}>
              <Plus size={14} />
              {saving ? "Saving..." : "Create Job"}
            </button>
          </div>
          {createError ? (
            <div className={layoutStyles.extracted7}>{createError}</div>
          ) : null}
          {createMessage ? (
            <div
              className={layoutStyles.extracted8}
            >
              {createMessage}
            </div>
          ) : null}
        </div>

        <div style={card}>
          {focusedJobId ? (
            <div
              style={{
                marginBottom: 10,
                border: `1px solid ${UI.brandBorder}`,
                background: UI.brandSoft,
                color: UI.brand,
                borderRadius: UI.radius,
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.45,
                fontWeight: 700,
              }}
            >
              Opened from dashboard. The selected job row is highlighted below.
            </div>
          ) : null}
          <div className={layoutStyles.extracted9}>
            <div>
              <h2 style={titleMd}>Job Queue</h2>
              <div style={hint}>Update booking, completion, cost, invoice and workflow stage from each row.</div>
            </div>
            <div className={layoutStyles.extracted10}>
              <span
                style={{
                  padding: "5px 9px",
                  borderRadius: 999,
                  border: `1px solid ${UI.brandBorder}`,
                  background: UI.brandSoft,
                  color: UI.brand,
                  fontSize: 12,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                Showing {visibleJobs.length} / {jobs.length}
              </span>
            </div>
          </div>
          <div className="maintenance-jobs-filter-grid" style={{ ...surface, boxShadow: "none", padding: 12, marginBottom: 12 }}>
            <label className={layoutStyles.extracted11}>
              <Search
                size={16}
                style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: UI.muted }}
              />
              <input
                type="text"
                placeholder="Search jobs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...input, paddingLeft: 34 }}
              />
            </label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...input, maxWidth: 220 }}>
              <option value="all">All statuses</option>
              {MAINTENANCE_JOB_WORKFLOW_STAGES.map((s) => (
                <option key={s} value={s}>
                  {MAINTENANCE_STAGE_LABELS[s] || s}
                </option>
              ))}
            </select>
          </div>

          <div className={layoutStyles.extracted12}>
            <table className={layoutStyles.extracted13}>
              <thead>
                <tr>
                  {["Title", "Asset", "Type", "Priority", "Due", "Planned", "Workflow Details", "Status", "Updated"].map((h) => (
                    <th key={h} style={{ ...theadTh, textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleJobs.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ ...thtd, color: UI.muted }}>
                      No maintenance jobs.
                    </td>
                  </tr>
                ) : (
                  visibleJobs.map((j) => {
                    const stage = normalizeWorkflowStageCompat(j.status);
                    const draft = jobDrafts[j.id] || buildJobDraft(j);
                    const isSavingRow = savingJobId === j.id;
                    const isFocused = focusedJobId === j.id;
                    return (
                    <tr
                      key={j.id}
                      ref={(node) => {
                        if (node) rowRefs.current[j.id] = node;
                        else delete rowRefs.current[j.id];
                      }}
                      style={isFocused ? { background: UI.brandSoft } : { background: "var(--color-surface)" }}
                    >
                      <td style={{ ...thtd, fontWeight: 800, color: UI.text }}>{j.title || "-"}</td>
                      <td className={layoutStyles.extracted14}>{j.assetLabel || j.assetId || "-"}</td>
                      <td className={layoutStyles.extracted15}>{j.type || "-"}</td>
                      <td className={layoutStyles.extracted16}>{j.priority || "-"}</td>
                      <td className={layoutStyles.extracted17}>{fmtDate(j.dueDate)}</td>
                      <td className={layoutStyles.extracted18}>{fmtDate(j.plannedDate)}</td>
                      <td className={layoutStyles.extracted19}>
                        <div className={layoutStyles.extracted20}>
                          <input
                            type="text"
                            placeholder="Provider"
                            value={draft.provider}
                            onChange={(e) => updateJobDraft(j.id, "provider", e.target.value)}
                            style={{ ...input, minWidth: 220 }}
                          />
                          <input
                            type="date"
                            value={draft.bookedDate}
                            onChange={(e) => updateJobDraft(j.id, "bookedDate", e.target.value)}
                            style={input}
                          />
                          <input
                            type="text"
                            placeholder="Assigned to"
                            value={draft.assignedToName}
                            onChange={(e) => updateJobDraft(j.id, "assignedToName", e.target.value)}
                            style={input}
                          />
                          <textarea
                            placeholder="Completion notes"
                            value={draft.completionNotes}
                            onChange={(e) => updateJobDraft(j.id, "completionNotes", e.target.value)}
                            style={{ ...input, minHeight: 62, resize: "vertical" }}
                          />
                          <div className={layoutStyles.extracted21}>
                            <input
                              type="text"
                              placeholder="Total cost"
                              value={draft.totalCost}
                              onChange={(e) => updateJobDraft(j.id, "totalCost", e.target.value)}
                              style={input}
                            />
                            <input
                              type="text"
                              placeholder="PO number"
                              value={draft.poNumber}
                              onChange={(e) => updateJobDraft(j.id, "poNumber", e.target.value)}
                              style={input}
                            />
                            <input
                              type="text"
                              placeholder="Invoice ref"
                              value={draft.invoiceRef}
                              onChange={(e) => updateJobDraft(j.id, "invoiceRef", e.target.value)}
                              style={input}
                            />
                          </div>
                          <button
                            type="button"
                            style={{ ...btn(), width: "fit-content" }}
                            onClick={() => saveJobDetails(j)}
                            disabled={isSavingRow}
                          >
                            <Save size={14} />
                            {isSavingRow ? "Saving..." : "Save details"}
                          </button>
                        </div>
                      </td>
                      <td className={layoutStyles.extracted22}>
                        <select
                          value={stage}
                          onChange={(e) => setJobStatus(j, e.target.value)}
                          style={{ ...input, minWidth: 150 }}
                          disabled={isSavingRow}
                        >
                          {MAINTENANCE_JOB_WORKFLOW_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {MAINTENANCE_STAGE_LABELS[s] || s}
                            </option>
                          ))}
                        </select>
                        {jobErrors[j.id] ? (
                          <div className={layoutStyles.extracted23}>
                            {jobErrors[j.id]}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ ...thtd, color: UI.muted }}>
                        {fmtDateTime(j.updatedAt || j.updatedAtServer)}
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

function OverviewChip({ label, value, tone = "default" }) {
  const colors =
    tone === "danger"
      ? { bg: "var(--color-danger-soft)", fg: "var(--color-danger)", border: "var(--color-danger-border)" }
      : tone === "ok"
      ? { bg: "var(--color-success-soft)", fg: "var(--color-success)", border: "var(--color-success-border)" }
      : { bg: UI.brandSoft, fg: UI.brand, border: UI.brandBorder };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 30,
        padding: "5px 9px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.fg,
        fontSize: 12,
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <strong className={layoutStyles.extracted24}>{value}</strong>
    </span>
  );
}

const groupRoute = (groupKey) => {
  if (groupKey === "mot") return "/mot-overview";
  if (groupKey === "services") return "/service-overview";
  if (groupKey === "defects") return "/defects/immediate";
  if (groupKey === "checks") return "/vehicle-activity";
  return "/maintenance-jobs";
};

function ActivityGroup({ group, router }) {
  const Icon = group.icon || ClipboardList;
  const route = groupRoute(group.key);
  return (
    <section
      style={{
        border: UI.border,
        borderRadius: UI.radius,
        background: "var(--color-surface)",
        overflow: "hidden",
        minWidth: 0,
        minHeight: 236,
        boxShadow: UI.shadowSm,
      }}
    >
      <div className={layoutStyles.extracted25}>
        <div className={layoutStyles.extracted26}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: UI.radiusSm,
              border: `1px solid ${UI.brandBorder}`,
              background: UI.brandSoft,
              color: UI.brand,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            <Icon size={16} />
          </span>
          <div className={layoutStyles.extracted27}>
            <div style={{ color: UI.text, fontSize: 18, lineHeight: 1.1, fontWeight: 950 }}>{group.label}</div>
            <div style={{ color: UI.muted, fontSize: 12.5, lineHeight: 1.35, marginTop: 4 }}>{group.note}</div>
          </div>
        </div>
        <button type="button" className="maintenance-jobs-action" style={btn()} onClick={() => router.push(route)}>
          Open queue
          <span aria-hidden="true">&gt;</span>
        </button>
      </div>

      <div>
        {group.items.length === 0 ? (
          <div
            style={{
              margin: "0 12px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: UI.radius,
              padding: "11px 12px",
              color: UI.muted,
              fontSize: 13,
              background: "var(--color-surface)",
            }}
          >
            Nothing in this queue.
          </div>
        ) : (
          group.items.map((item) => <ActivityRow key={item.activityId} item={item} />)
        )}
      </div>
      {group.count > group.items.length ? (
        <div style={{ padding: "8px 12px 10px", color: UI.muted, fontSize: 11.5, fontWeight: 750 }}>
          {group.count - group.items.length} more in this group
        </div>
      ) : null}
    </section>
  );
}

function ActivityRow({ item }) {
  const status = prettyStatus(item.status);
  const statusLower = status.toLowerCase();
  const statusStyle =
    statusLower.includes("open") || statusLower.includes("defect")
      ? { bg: "var(--color-warning-border)", fg: "var(--color-text)" }
      : statusLower.includes("complete") || statusLower.includes("closed") || statusLower.includes("logged") || statusLower.includes("history")
      ? { bg: "var(--color-success-accent)", fg: "var(--color-text)" }
      : { bg: "var(--color-border)", fg: UI.text };
  return (
    <div
      className={`maintenance-activity-row ${layoutStyles.extracted28}`}

    >
      <div className={layoutStyles.extracted29}>
        <div style={{ color: UI.text, fontSize: 16, lineHeight: 1.22, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.title || activityTypeLabel(item.type)}
        </div>
      </div>
      <div style={{ padding: "8px 10px", color: UI.muted, fontSize: 12.5, lineHeight: 1.35, minWidth: 0 }}>
        <div className={layoutStyles.extracted30}>
          {item.vehicleName || "Unknown vehicle"}
        </div>
        {item.registration ? (
          <div className={layoutStyles.extracted31}>{String(item.registration).toUpperCase()}</div>
        ) : null}
      </div>
      <div style={{ padding: "8px 10px", color: UI.text, fontSize: 12.5, lineHeight: 1.35, whiteSpace: "nowrap" }}>
        {fmtDate(item.activityDate)}
      </div>
      <div
        className="maintenance-activity-status"
        style={{
          background: statusStyle.bg,
          color: statusStyle.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 10px",
          fontSize: 12.5,
          lineHeight: 1.2,
          fontWeight: 950,
          textAlign: "center",
          borderLeft: "1px solid var(--color-text)",
        }}
      >
        {status}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, tone = "default", icon: Icon = Wrench }) {
  const toneStyles =
    tone === "danger"
      ? { fg: "var(--color-danger)", bg: "var(--color-danger-soft)", border: "var(--color-danger-border)" }
      : tone === "amber"
      ? { fg: "var(--color-warning)", bg: "var(--color-warning-soft)", border: "var(--color-warning-border)" }
      : tone === "ok"
      ? { fg: "var(--color-success)", bg: "var(--color-success-soft)", border: "var(--color-success-border)" }
      : tone === "brand" || tone === "soft"
      ? { fg: UI.brand, bg: UI.brandSoft, border: UI.brandBorder }
      : { fg: UI.text, bg: "var(--color-surface-subtle)", border: "var(--color-border)" };

  return (
    <div
      style={{
        ...card,
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...(tone === "soft" ? { background: UI.brandSoft, borderColor: UI.brandBorder } : null),
      }}
    >
      <div className={layoutStyles.extracted32}>
        <div>
          <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 900, color: toneStyles.fg, marginTop: 6 }}>{value}</div>
        </div>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: UI.radiusSm,
            border: `1px solid ${toneStyles.border}`,
            background: toneStyles.bg,
            color: toneStyles.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
          }}
        >
          <Icon size={17} />
        </span>
      </div>
      {sub ? <div style={{ fontSize: 12, color: UI.muted, lineHeight: 1.3, marginTop: 8 }}>{sub}</div> : null}
    </div>
  );
}
