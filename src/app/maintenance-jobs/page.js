"use client";

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

const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  border: "1px solid #d7dee8",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  danger: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

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
  background: "#fff",
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
      ? "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)"
      : "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
    color: primary ? "#fff" : UI.text,
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

const thtd = { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid #eef2f7", verticalAlign: "middle" };
const theadTh = {
  ...thtd,
  fontWeight: 900,
  color: UI.muted,
  background: "#f6f8fb",
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
        j.type,
        j.status,
        j.priority,
        j.notes,
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
          border-color: #9fb7cf !important;
        }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .maintenance-jobs-action:hover { background: #f8fbfe !important; border-color: #b8c8d8 !important; }
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
        @media (max-width: 1180px) {
          .maintenance-jobs-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .maintenance-jobs-filter-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 720px) {
          .maintenance-jobs-kpi-grid, .maintenance-jobs-filter-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={pageWrap}>
        <div style={headerBar}>
            <div>
              <h1 style={h1}>Maintenance Jobs</h1>
              <div style={sub}>
                Plan, track, complete, and close workshop jobs from one place.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
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

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={sectionHeader}>
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
          <div style={{ marginTop: 8 }}>
            <button type="button" style={btn("primary")} onClick={createJob} disabled={saving}>
              <Plus size={14} />
              {saving ? "Saving..." : "Create Job"}
            </button>
          </div>
          {createError ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>{createError}</div>
          ) : null}
          {createMessage ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12.5,
                color: "#166534",
                fontWeight: 700,
                border: "1px solid #bbf7d0",
                background: "#f0fdf4",
                borderRadius: 10,
                padding: "10px 12px",
              }}
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
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Job Queue</h2>
              <div style={hint}>Update booking, completion, cost, invoice and workflow stage from each row.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
            <label style={{ position: "relative", display: "block" }}>
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

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 1280, borderCollapse: "collapse", fontSize: 13 }}>
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
                      style={isFocused ? { background: UI.brandSoft } : { background: "#fff" }}
                    >
                      <td style={{ ...thtd, fontWeight: 800, color: UI.text }}>{j.title || "-"}</td>
                      <td style={thtd}>{j.assetLabel || j.assetId || "-"}</td>
                      <td style={thtd}>{j.type || "-"}</td>
                      <td style={thtd}>{j.priority || "-"}</td>
                      <td style={thtd}>{fmtDate(j.dueDate)}</td>
                      <td style={thtd}>{fmtDate(j.plannedDate)}</td>
                      <td style={{ ...thtd, minWidth: 320 }}>
                        <div style={{ display: "grid", gap: 6 }}>
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
                          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
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
                      <td style={thtd}>
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
                          <div style={{ marginTop: 6, fontSize: 11.5, color: "#b91c1c", fontWeight: 700 }}>
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

function SummaryCard({ label, value, sub, tone = "default", icon: Icon = Wrench }) {
  const toneStyles =
    tone === "danger"
      ? { fg: "#991b1b", bg: "#fef2f2", border: "#fecaca" }
      : tone === "amber"
      ? { fg: "#9a3412", bg: "#fff7ed", border: "#fed7aa" }
      : tone === "ok"
      ? { fg: "#065f46", bg: "#ecfdf5", border: "#bbf7d0" }
      : tone === "brand" || tone === "soft"
      ? { fg: UI.brand, bg: UI.brandSoft, border: UI.brandBorder }
      : { fg: UI.text, bg: "#f6f8fb", border: "#d7dee8" };

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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
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
