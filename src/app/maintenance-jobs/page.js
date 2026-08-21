"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
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
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  PlayCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  Wrench,
} from "lucide-react";
import {
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  completeMaintenanceBooking,
  createMaintenanceWorkBooking,
  rescheduleMaintenanceBooking,
  updateMaintenanceWorkBooking,
} from "../utils/maintenanceMutationClient";
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
import { getSemanticStatusStyle } from "@/app/utils/jobStatusColors";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/app/components/ui";
import { getServiceRecordPresentation } from "@/app/utils/servicePresentation";
import {
  OperationsHeaderActions,
  OperationsPage,
  OperationsPageHeader,
} from "@/app/components/OperationsPage";


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
  const [attentionFilter, setAttentionFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("urgency");
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [jobErrors, setJobErrors] = useState({});
  const [jobDrafts, setJobDrafts] = useState({});
  const [focusedJobId, setFocusedJobId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState("");

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
    setCreateOpen(true);
  }, [searchParams]);

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        id: String(v.id),
        label: buildAssetLabel(v) || String(v.id),
      })),
    [vehicles]
  );

  const canonicalWorkshopJobs = useMemo(
    () => maintenanceBookings
      .filter((booking) =>
        String(booking.origin?.source || booking.origin || "").trim().toLowerCase() === "workshop" ||
        String(booking.type || "").trim().toUpperCase() === "WORK"
      )
      .map((booking) => {
        const workshop = booking.workshop && typeof booking.workshop === "object"
          ? booking.workshop
          : {};
        const canonicalStatus = String(booking.status || "").trim().toLowerCase();
        const compatibleStatus = workshop.status || (
          canonicalStatus === "requested"
            ? "planned"
            : canonicalStatus === "in progress"
            ? "in_progress"
            : canonicalStatus
        );
        return {
          ...workshop,
          id: booking.id,
          __collection: "maintenanceBookings",
          canonicalRecord: booking,
          assetId: workshop.assetId || booking.vehicleId || "",
          assetLabel: workshop.assetLabel || booking.vehicleLabel || "",
          type: workshop.type || booking.maintenanceTypeId || "repair",
          title: workshop.title || booking.title || "Maintenance work",
          notes: workshop.notes || booking.notes || "",
          status: compatibleStatus || "planned",
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
          updatedAtServer: booking.updatedAtServer,
        };
      }),
    [maintenanceBookings]
  );
  const allJobs = useMemo(
    () => [
      ...jobs.map((job) => ({ ...job, __collection: "maintenanceJobs" })),
      ...canonicalWorkshopJobs,
    ],
    [canonicalWorkshopJobs, jobs]
  );

  useEffect(() => {
    setJobDrafts((previous) => {
      const next = { ...previous };
      const rowIds = new Set(allJobs.map((row) => row.id));
      allJobs.forEach((row) => {
        const baseDraft = buildJobDraft(row);
        next[row.id] = previous[row.id] ? { ...baseDraft, ...previous[row.id] } : baseDraft;
      });
      Object.keys(next).forEach((id) => {
        if (!rowIds.has(id)) delete next[id];
      });
      return next;
    });
  }, [allJobs]);

  const visibleJobs = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isFinished = (stage) => ["completed", "ready_to_invoice", "closed"].includes(stage);
    const dueTime = (job) => getTimeValue(job.dueDate);
    const isOverdue = (job, stage) => {
      const due = dueTime(job);
      return Boolean(due && due < today.getTime() && !isFinished(stage));
    };
    const isUnscheduled = (job, stage) => !isFinished(stage) && !firstText(job.plannedDate, job.bookedDate, job.appointmentDateISO);
    const priorityWeight = (job) => ({ critical: 0, high: 1, normal: 2, low: 3 }[String(job.priority || "normal").toLowerCase()] ?? 2);

    return allJobs.filter((j) => {
      const stage = normalizeWorkflowStageCompat(j.status);
      if (statusFilter === "active" && stage !== "booked" && stage !== "in_progress") return false;
      if (statusFilter === "commercial" && stage !== "completed" && stage !== "ready_to_invoice") return false;
      if (!["all", "active", "commercial"].includes(statusFilter) && stage !== statusFilter) return false;
      if (attentionFilter === "overdue" && !isOverdue(j, stage)) return false;
      if (attentionFilter === "unscheduled" && !isUnscheduled(j, stage)) return false;
      if (attentionFilter === "high" && !["high", "critical"].includes(String(j.priority || "").toLowerCase())) return false;
      if (attentionFilter === "unlinked" && firstText(j.assetLabel, j.assetId)) return false;
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
    }).sort((a, b) => {
      if (sortOrder === "updated") return getTimeValue(b.updatedAt || b.updatedAtServer) - getTimeValue(a.updatedAt || a.updatedAtServer);
      if (sortOrder === "due") return (dueTime(a) || Number.MAX_SAFE_INTEGER) - (dueTime(b) || Number.MAX_SAFE_INTEGER);

      const aStage = normalizeWorkflowStageCompat(a.status);
      const bStage = normalizeWorkflowStageCompat(b.status);
      const urgency = (job, stage) => [
        isOverdue(job, stage) ? 0 : 1,
        isUnscheduled(job, stage) ? 0 : 1,
        priorityWeight(job),
        dueTime(job) || Number.MAX_SAFE_INTEGER,
      ];
      const aUrgency = urgency(a, aStage);
      const bUrgency = urgency(b, bStage);
      for (let index = 0; index < aUrgency.length; index += 1) {
        if (aUrgency[index] !== bUrgency[index]) return aUrgency[index] - bUrgency[index];
      }
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, [allJobs, attentionFilter, search, sortOrder, statusFilter]);

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
      total: allJobs.length,
      planned: 0,
      active: 0,
      closed: 0,
      commercial: 0,
    };

    allJobs.forEach((job) => {
      const stage = normalizeWorkflowStageCompat(job.status);
      if (stage === "planned") counts.planned += 1;
      if (stage === "booked" || stage === "in_progress") counts.active += 1;
      if (stage === "completed" || stage === "ready_to_invoice") counts.commercial += 1;
      if (stage === "closed") counts.closed += 1;
    });

    return counts;
  }, [allJobs]);

  const attentionStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allJobs.reduce((counts, job) => {
      const stage = normalizeWorkflowStageCompat(job.status);
      const finished = ["completed", "ready_to_invoice", "closed"].includes(stage);
      const due = getTimeValue(job.dueDate);
      if (due && due < today.getTime() && !finished) counts.overdue += 1;
      if (!finished && !firstText(job.plannedDate, job.bookedDate, job.appointmentDateISO)) counts.unscheduled += 1;
      if (["high", "critical"].includes(String(job.priority || "").toLowerCase())) counts.high += 1;
      if (!firstText(job.assetLabel, job.assetId)) counts.unlinked += 1;
      return counts;
    }, { overdue: 0, unscheduled: 0, high: 0, unlinked: 0 });
  }, [allJobs]);

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
        const presentation = getServiceRecordPresentation(record);
        return {
          activityId: `serviceRecords:${record.id}`,
          sourceCollection: "serviceRecords",
          sourceId: record.id,
          type,
          title: type === "repair" ? record.repairSummary || record.workSummary || "General repair" : presentation.title,
          summary: toActivitySummary(record.workSummary, record.repairSummary, record.repairReason, record.partsUsed, record.extraNotes),
          vehicleId: record.vehicleId || null,
          vehicleName,
          registration: record.registration || registrationForVehicle(record.vehicleId),
          person: presentation.provider,
          status: type === "repair" ? "completed" : "logged",
          activityDate: presentation.dateValue,
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
        .filter((booking) =>
          !isInactiveMaintenanceBooking(booking.status) &&
          String(booking.origin?.source || booking.origin || "").trim().toLowerCase() !== "workshop" &&
          String(booking.type || "").trim().toUpperCase() !== "WORK"
        )
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
      ...allJobs.map((job) => ({
        activityId: `${job.__collection || "maintenanceJobs"}:${job.id}`,
        sourceCollection: job.__collection || "maintenanceJobs",
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
  }, [allJobs, checkDocs, defectReports, maintenanceBookings, motPreChecks, serviceRecords, vehicleIssueDocs, vehiclePrepRecords, vehicles]);

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
      const createdRecord = await createMaintenanceWorkBooking({
        job: nextPayload,
        authState: dataAccessState,
      });
      setForm((prev) => ({ ...prev, title: "", notes: "" }));
      setFocusedJobId(createdRecord.id);
      setExpandedJobId(createdRecord.id);
      setCreateOpen(false);
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
    if (job.__collection === "maintenanceJobs") {
      setJobErrors((previous) => ({
        ...previous,
        [job.id]: "Legacy maintenance job history is read-only. Create a canonical follow-up job for new work.",
      }));
      return;
    }

    const patch = {
      ...buildWorkflowPatch(job.id),
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
      updatedBy: auth?.currentUser?.email || "Unknown",
    };

    setSavingJobId(job.id);
    try {
      if (job.__collection === "maintenanceBookings") {
        const nextBookedDate = String(patch.bookedDate || "").slice(0, 10);
        const currentBookedDate = String(job.bookedDate || job.plannedDate || job.appointmentDateISO || "").slice(0, 10);
        if (nextBookedDate && nextBookedDate !== currentBookedDate) {
          const reason = await systemDialogs.promptSystem("Reason for rescheduling this maintenance job:", "");
          if (!String(reason || "").trim()) throw new Error("A rescheduling reason is required.");
          await rescheduleMaintenanceBooking({
            bookingId: job.id,
            updates: { appointmentDate: nextBookedDate },
            reason,
          });
        }
        const detailsPatch = { ...patch };
        delete detailsPatch.bookedDate;
        await updateMaintenanceWorkBooking({ bookingId: job.id, patch: detailsPatch, authState: dataAccessState });
      } else {
        await updateDoc(doc(db, "maintenanceJobs", job.id), tenantPayload(dataAccessState, patch));
      }
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
    if (job.__collection === "maintenanceJobs") {
      setJobErrors((previous) => ({
        ...previous,
        [job.id]: "Legacy maintenance job history is read-only. Create a canonical follow-up job for new work.",
      }));
      return;
    }

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
      if (job.__collection === "maintenanceBookings") {
        if (nextStatus === "completed") {
          const completedISO = await systemDialogs.promptSystem(
            "Actual completion date (YYYY-MM-DD)",
            new Date().toISOString().slice(0, 10)
          );
          if (!completedISO) return;
          await updateMaintenanceWorkBooking({
            bookingId: job.id,
            patch: { ...patch, status: currentStatus },
            authState: dataAccessState,
          });
          await completeMaintenanceBooking({
            bookingId: job.id,
            vehicleId: job.assetId || "",
            completedISO,
            authState: dataAccessState,
          });
        } else {
          await updateMaintenanceWorkBooking({ bookingId: job.id, patch, authState: dataAccessState });
        }
      } else {
        await updateDoc(doc(db, "maintenanceJobs", job.id), tenantPayload(dataAccessState, patch));
      }
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
      <OperationsPage className={layoutStyles.page}>
        <OperationsPageHeader
          title="Maintenance jobs"
          subtitle="Plan workshop work, keep active jobs moving, and close the commercial trail."
          actions={
            <OperationsHeaderActions>
              <Button variant="secondary" onClick={() => router.push("/vehicle-home")}>
                <ArrowLeft size={16} />
                Vehicle home
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                New job
              </Button>
            </OperationsHeaderActions>
          }
        />

        <div className={layoutStyles.statusTabs} aria-label="Filter by job stage">
          {[
            ["all", "All jobs", jobStats.total, ClipboardList],
            ["planned", "Planned", jobStats.planned, CalendarCheck2],
            ["active", "Active", jobStats.active, PlayCircle],
            ["commercial", "Commercial", jobStats.commercial, FileCheck2],
            ["closed", "Closed", jobStats.closed, CheckCircle2],
          ].map(([value, label, count, Icon]) => (
            <button
              key={value}
              type="button"
              className={`${layoutStyles.statusTab} ${statusFilter === value ? layoutStyles.statusTabActive : ""}`}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              <span className={layoutStyles.statusTabIcon}><Icon size={18} aria-hidden="true" /></span>
              <span className={layoutStyles.statusTabCopy}>
                <span>{label}</span>
                <strong>{count}</strong>
              </span>
            </button>
          ))}
        </div>

        {createMessage ? <Alert variant="success" className={layoutStyles.pageAlert}>{createMessage}</Alert> : null}
        {focusedJobId && !createMessage ? (
          <Alert variant="info" className={layoutStyles.pageAlert}>The job opened from the previous page is highlighted below.</Alert>
        ) : null}

        <section className={layoutStyles.queueSection} aria-labelledby="job-queue-heading">
          <div className={layoutStyles.sectionHeading}>
            <div>
              <h2 id="job-queue-heading">Job queue</h2>
              <p>Find a job, change its stage, or open it to update workshop and commercial details.</p>
            </div>
            <Badge variant="info">{visibleJobs.length === allJobs.length ? `${allJobs.length} jobs` : `Showing ${visibleJobs.length} of ${allJobs.length}`}</Badge>
          </div>

          <div className={layoutStyles.toolbar}>
            <label className={layoutStyles.searchField}>
              <span className={layoutStyles.visuallyHidden}>Search jobs</span>
              <Search size={17} aria-hidden="true" />
              <Input
                type="search"
                placeholder="Search job, vehicle, provider or reference…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <Select aria-label="Filter jobs by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active — booked or in progress</option>
              <option value="commercial">Commercial — complete or invoice-ready</option>
              {MAINTENANCE_JOB_WORKFLOW_STAGES.map((stage) => (
                <option key={stage} value={stage}>{MAINTENANCE_STAGE_LABELS[stage] || stage}</option>
              ))}
            </Select>
            <Select aria-label="Sort jobs" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="urgency">Sort: attention first</option>
              <option value="due">Sort: due date</option>
              <option value="updated">Sort: recently updated</option>
            </Select>
            {(search || statusFilter !== "all" || attentionFilter !== "all" || sortOrder !== "urgency") ? (
              <Button variant="ghost" onClick={() => { setSearch(""); setStatusFilter("all"); setAttentionFilter("all"); setSortOrder("urgency"); }}>
                <RotateCcw size={15} />
                Reset
              </Button>
            ) : null}
          </div>

          <div className={layoutStyles.quickFilters} aria-label="Filter jobs requiring attention">
            <span className={layoutStyles.quickFilterLabel}>Needs attention</span>
            {[
              ["overdue", "Overdue", attentionStats.overdue, "danger"],
              ["unscheduled", "Unscheduled", attentionStats.unscheduled, "warning"],
              ["high", "High priority", attentionStats.high, "warning"],
              ["unlinked", "No vehicle", attentionStats.unlinked, "neutral"],
            ].map(([value, label, count, tone]) => (
              <button
                key={value}
                type="button"
                className={`${layoutStyles.filterChip} ${attentionFilter === value ? layoutStyles.filterChipActive : ""}`}
                data-tone={tone}
                aria-pressed={attentionFilter === value}
                onClick={() => setAttentionFilter(attentionFilter === value ? "all" : value)}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div>

          <div className={layoutStyles.jobList}>
            {visibleJobs.length ? (
              <div className={layoutStyles.queueHeader} aria-hidden="true">
                <span>Job / vehicle</span>
                <span>Type</span>
                <span>Priority</span>
                <span>Due</span>
                <span>Planned</span>
                <span>Owner</span>
                <span>Status</span>
                <span />
              </div>
            ) : null}
            {visibleJobs.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={28} />}
                title={allJobs.length ? "No jobs match these filters" : "No maintenance jobs yet"}
                description={allJobs.length ? "Try another status or clear the search." : "Create the first job card to start the workshop workflow."}
                action={allJobs.length ? <Button variant="secondary" onClick={() => { setSearch(""); setStatusFilter("all"); setAttentionFilter("all"); }}>Clear filters</Button> : <Button onClick={() => setCreateOpen(true)}>Create job</Button>}
              />
            ) : visibleJobs.map((job) => {
              const stage = normalizeWorkflowStageCompat(job.status);
              const draft = jobDrafts[job.id] || buildJobDraft(job);
              const isSavingRow = savingJobId === job.id;
              const isFocused = focusedJobId === job.id;
              const isExpanded = expandedJobId === job.id;
              const isLegacy = job.__collection === "maintenanceJobs";
              const semanticStatus = getSemanticStatusStyle(MAINTENANCE_STAGE_LABELS[stage] || stage);
              const dueTime = getTimeValue(job.dueDate);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isFinished = ["completed", "ready_to_invoice", "closed"].includes(stage);
              const isOverdue = Boolean(dueTime && dueTime < today.getTime() && !isFinished);
              const isUnscheduled = !isFinished && !firstText(job.plannedDate, job.bookedDate, job.appointmentDateISO);
              const owner = firstText(job.assignedToName, job.provider);
              return (
                /* style-audit-allow runtime semantic status colours */
                <article
                  key={job.id}
                  ref={(node) => {
                    if (node) rowRefs.current[job.id] = node;
                    else delete rowRefs.current[job.id];
                  }}
                  className={`${layoutStyles.jobCard} ${isFocused ? layoutStyles.focusedJob : ""} ${isOverdue ? layoutStyles.jobCardOverdue : ""} ${["high", "critical"].includes(String(job.priority || "").toLowerCase()) ? layoutStyles.jobCardPriority : ""}`}
                  style={{ "--job-status-bg": semanticStatus.bg, "--job-status-fg": semanticStatus.text }}
                >
                  <div className={layoutStyles.jobSummary}>
                    <button
                      type="button"
                      className={layoutStyles.jobToggle}
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedJobId(isExpanded ? "" : job.id)}
                    >
                      <span className={layoutStyles.jobIdentity}>
                        <span className={layoutStyles.jobTitle}>{job.title || "Untitled maintenance job"}</span>
                        <span className={layoutStyles.jobAsset}>{job.assetLabel || job.assetId || "No vehicle linked"}</span>
                      </span>
                      <span className={`${layoutStyles.metaCell} ${layoutStyles.typeCell}`}><strong>Type</strong>{prettyStatus(job.type || "Work")}</span>
                      <span className={`${layoutStyles.metaCell} ${layoutStyles.priorityCell}`}><strong>Priority</strong><Badge variant={priorityVariant(job.priority)}>{prettyStatus(job.priority || "Normal")}</Badge></span>
                      <span className={`${layoutStyles.metaCell} ${isOverdue ? layoutStyles.overdueValue : ""}`}><strong>Due</strong><span>{fmtDate(job.dueDate)}</span>{isOverdue ? <em>Overdue</em> : null}</span>
                      <span className={`${layoutStyles.metaCell} ${isUnscheduled ? layoutStyles.missingValue : ""}`}><strong>Planned</strong><span>{fmtDate(job.plannedDate)}</span>{isUnscheduled ? <em>Schedule missing</em> : null}</span>
                      <span className={layoutStyles.metaCell}><strong>Owner</strong><span>{owner || "Unassigned"}</span></span>
                      <span className={layoutStyles.stageControl} data-stage={stage}>
                        <span className={layoutStyles.statusPill}>{MAINTENANCE_STAGE_LABELS[stage] || prettyStatus(stage)}</span>
                      </span>
                      <ChevronDown className={`${layoutStyles.chevron} ${isExpanded ? layoutStyles.chevronOpen : ""}`} size={18} aria-hidden="true" />
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className={layoutStyles.jobDetails}>
                      <div className={layoutStyles.detailIntro}>
                        <div>
                          <span>Last updated</span>
                          <strong>{fmtDateTime(job.updatedAt || job.updatedAtServer)}</strong>
                        </div>
                        {job.notes ? <p>{job.notes}</p> : null}
                      </div>

                      {isLegacy ? (
                        <Alert variant="neutral">This is a legacy job record and is read-only. Create a follow-up job for new work.</Alert>
                      ) : (
                        <>
                          <div className={layoutStyles.detailsGrid}>
                            <FormField label="Workflow stage">
                              <Select
                                aria-label={`Change status for ${job.title || "maintenance job"}`}
                                value={stage}
                                onChange={(event) => setJobStatus(job, event.target.value)}
                                disabled={isSavingRow || isLegacy}
                              >
                                {MAINTENANCE_JOB_WORKFLOW_STAGES.map((nextStage) => (
                                  <option key={nextStage} value={nextStage}>{MAINTENANCE_STAGE_LABELS[nextStage] || nextStage}</option>
                                ))}
                              </Select>
                            </FormField>
                            <FormField label="Provider">
                              <Input value={draft.provider} onChange={(event) => updateJobDraft(job.id, "provider", event.target.value)} placeholder="Garage or supplier" />
                            </FormField>
                            <FormField label="Booked date">
                              <Input type="date" value={draft.bookedDate} onChange={(event) => updateJobDraft(job.id, "bookedDate", event.target.value)} />
                            </FormField>
                            <FormField label="Assigned to">
                              <Input value={draft.assignedToName} onChange={(event) => updateJobDraft(job.id, "assignedToName", event.target.value)} placeholder="Technician or owner" />
                            </FormField>
                            <FormField label="Total cost">
                              <Input inputMode="decimal" value={draft.totalCost} onChange={(event) => updateJobDraft(job.id, "totalCost", event.target.value)} placeholder="0.00" />
                            </FormField>
                            <FormField label="PO number">
                              <Input value={draft.poNumber} onChange={(event) => updateJobDraft(job.id, "poNumber", event.target.value)} placeholder="Purchase order" />
                            </FormField>
                            <FormField label="Invoice reference">
                              <Input value={draft.invoiceRef} onChange={(event) => updateJobDraft(job.id, "invoiceRef", event.target.value)} placeholder="Supplier invoice" />
                            </FormField>
                            <FormField label="Completion notes" className={layoutStyles.notesField}>
                              <Textarea value={draft.completionNotes} onChange={(event) => updateJobDraft(job.id, "completionNotes", event.target.value)} placeholder="Work completed, parts used, or follow-up required" />
                            </FormField>
                          </div>
                          <div className={layoutStyles.detailActions}>
                            <Button variant="secondary" loading={isSavingRow} onClick={() => saveJobDetails(job)}>
                              <Save size={15} />
                              Save details
                            </Button>
                          </div>
                        </>
                      )}
                      {jobErrors[job.id] ? <Alert variant="danger">{jobErrors[job.id]}</Alert> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className={layoutStyles.activitySection} aria-labelledby="maintenance-overview-heading">
          <div className={layoutStyles.sectionHeading}>
            <div>
              <h2 id="maintenance-overview-heading">Maintenance overview</h2>
              <p>Jump into the specialist registers without loading their full history on this work queue.</p>
            </div>
            <Badge>{overviewStats.activity} records</Badge>
          </div>
          <div className={layoutStyles.activityGrid}>
            {groupedActivity.map((group) => (
              <ActivityOverviewCard key={group.key} group={group} onOpen={() => router.push(groupRoute(group.key))} />
            ))}
          </div>
        </section>
      </OperationsPage>

      <Modal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create maintenance job"
        description="Add the essential planning details now. Workshop and commercial fields can be completed from the queue."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button loading={saving} onClick={createJob}><Plus size={16} />Create job</Button>
          </>
        }
      >
        <div className={layoutStyles.createGrid}>
          <FormField label="Vehicle or asset" required>
            <Select value={form.assetId} onChange={(event) => setForm((previous) => ({ ...previous, assetId: event.target.value }))}>
              <option value="">Select asset…</option>
              {vehicleOptions.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Job type" required>
            <Select value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}>
              <option value="service">Service</option>
              <option value="mot">MOT</option>
              <option value="inspection">Inspection</option>
              <option value="repair">Repair</option>
            </Select>
          </FormField>
          <FormField label="Job title" required className={layoutStyles.createTitleField}>
            <Input autoFocus value={form.title} onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="What work is required?" />
          </FormField>
          <FormField label="Due date" required>
            <Input type="date" value={form.dueDate} onChange={(event) => setForm((previous) => ({ ...previous, dueDate: event.target.value }))} />
          </FormField>
          <FormField label="Planned date">
            <Input type="date" value={form.plannedDate} onChange={(event) => setForm((previous) => ({ ...previous, plannedDate: event.target.value }))} />
          </FormField>
          <FormField label="Priority">
            <Select value={form.priority} onChange={(event) => setForm((previous) => ({ ...previous, priority: event.target.value }))}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </FormField>
          <FormField label="Planning notes" className={layoutStyles.createNotesField}>
            <Textarea value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Fault details, access constraints, or work requested" />
          </FormField>
        </div>
        {createError ? <Alert variant="danger" className={layoutStyles.modalAlert}>{createError}</Alert> : null}
      </Modal>
    </HeaderSidebarLayout>
  );
}

const groupRoute = (groupKey) => {
  if (groupKey === "mot") return "/mot-overview";
  if (groupKey === "services") return "/service-overview";
  if (groupKey === "defects") return "/defects/immediate";
  if (groupKey === "checks") return "/vehicle-activity";
  return "/maintenance-jobs";
};

function ActivityOverviewCard({ group, onOpen }) {
  const Icon = group.icon || ClipboardList;
  const latest = group.items[0];
  return (
    <button type="button" className={layoutStyles.activityCard} onClick={onOpen}>
      <span className={layoutStyles.activityIcon}><Icon size={18} /></span>
      <span className={layoutStyles.activityBody}>
        <span className={layoutStyles.activityTitleRow}>
          <strong>{group.label}</strong>
          <Badge>{group.count}</Badge>
        </span>
        <span className={layoutStyles.activityNote}>{group.note}</span>
        <span className={layoutStyles.activityLatest}>
          {latest ? `Latest: ${latest.title || latest.vehicleName || "Activity"}` : "No records in this area"}
        </span>
      </span>
      <ExternalLink size={16} aria-hidden="true" />
    </button>
  );
}

function priorityVariant(priority) {
  const value = String(priority || "").toLowerCase();
  if (value === "critical") return "danger";
  if (value === "high") return "warning";
  if (value === "low") return "info";
  return "neutral";
}
