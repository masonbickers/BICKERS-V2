"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { auth, db } from "../../../firebaseConfig";
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
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  border: "1px solid #e5e7eb",
  brand: "#1d4ed8",
  softBlue: "#eff6ff",
  softBlueBorder: "#bfdbfe",
  softBlueText: "#1d4ed8",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const card = { background: UI.card, border: UI.border, borderRadius: 12, padding: 14 };
const input = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: UI.text,
  fontSize: 13,
};
const btn = (kind = "ghost") => ({
  padding: "9px 12px",
  borderRadius: 10,
  border: kind === "primary" ? "1px solid #1d4ed8" : "1px solid #d1d5db",
  background: kind === "primary" ? UI.brand : "#fff",
  color: kind === "primary" ? "#fff" : UI.text,
  fontWeight: 800,
  cursor: "pointer",
});

const statCard = {
  background: "#fff",
  border: UI.border,
  borderRadius: 12,
  padding: "12px 14px",
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

  const [vehicles, setVehicles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savingJobId, setSavingJobId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState("");
  const [jobErrors, setJobErrors] = useState({});
  const [jobDrafts, setJobDrafts] = useState({});

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
    const loadVehicles = async () => {
      const snap = await getDocs(collection(db, "vehicles"));
      const rows = snap.docs.map((d) => normalizeAssetRecord({ id: d.id, ...(d.data() || {}) }));
      rows.sort((a, b) => String(a.assetLabel || a.id).localeCompare(String(b.assetLabel || b.id)));
      setVehicles(rows);
    };
    loadVehicles();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "maintenanceJobs"), (snap) => {
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
    });
    return () => unsub();
  }, []);

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
    if (!form.assetId) return alert("Please select an asset.");
    if (!form.title.trim()) return alert("Please enter a job title.");
    setSaving(true);
    setCreateError("");
    try {
      const selected = vehicles.find((v) => String(v.id) === String(form.assetId));
      const createdBy = auth?.currentUser?.email || "Unknown";
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
      await addDoc(collection(db, "maintenanceJobs"), nextPayload);
      setForm((prev) => ({ ...prev, title: "", notes: "" }));
    } catch (error) {
      console.error("Failed creating maintenance job:", error);
      alert("Could not create job card.");
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
      await updateDoc(doc(db, "maintenanceJobs", job.id), patch);
      setJobErrors((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    } catch (error) {
      console.error("Failed saving maintenance job details:", error);
      alert("Could not save job details.");
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
      await updateDoc(doc(db, "maintenanceJobs", job.id), patch);
      setJobErrors((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    } catch (error) {
      console.error("Failed updating maintenance job status:", error);
      alert("Could not update status.");
    } finally {
      setSavingJobId("");
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, color: UI.text }}>Maintenance Jobs</h1>
              <div style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}>
                Plan, track, complete, and close workshop jobs from one place.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={btn()} onClick={() => router.push("/vehicle-home")}>
                Back to Vehicle Home
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800, textTransform: "uppercase" }}>Total jobs</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: UI.text }}>{jobStats.total}</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800, textTransform: "uppercase" }}>Planned</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: UI.text }}>{jobStats.planned}</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800, textTransform: "uppercase" }}>Active</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: UI.text }}>{jobStats.active}</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800, textTransform: "uppercase" }}>Commercial</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: UI.text }}>{jobStats.commercial}</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800, textTransform: "uppercase" }}>Closed</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: UI.text }}>{jobStats.closed}</div>
          </div>
        </div>

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Create Job Card</div>
          <div
            style={{
              marginBottom: 10,
              border: `1px solid ${UI.softBlueBorder}`,
              background: UI.softBlue,
              color: UI.softBlueText,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.45,
              fontWeight: 700,
            }}
          >
            Keep job creation lean here. Add the workflow details in the table only when the job is actually booked,
            assigned, completed, or ready to invoice.
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
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
            style={{ ...input, marginTop: 8, minHeight: 80, resize: "vertical" }}
          />
          <div style={{ marginTop: 8 }}>
            <button type="button" style={btn("primary")} onClick={createJob} disabled={saving}>
              {saving ? "Saving..." : "Create Job"}
            </button>
          </div>
          {createError ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>{createError}</div>
          ) : null}
        </div>

        <div style={card}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              type="text"
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...input, maxWidth: 260 }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...input, maxWidth: 220 }}>
              <option value="all">All statuses</option>
              {MAINTENANCE_JOB_WORKFLOW_STAGES.map((s) => (
                <option key={s} value={s}>
                  {MAINTENANCE_STAGE_LABELS[s] || s}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 10, color: UI.muted, fontSize: 12.5, lineHeight: 1.5 }}>
            Each row is designed as one complete job workspace: save the commercial and completion details in the
            "Workflow Details" column, then move the stage when the row is ready.
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Title", "Asset", "Type", "Priority", "Due", "Planned", "Workflow Details", "Status", "Updated"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 10px", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleJobs.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 12, color: UI.muted }}>
                      No maintenance jobs.
                    </td>
                  </tr>
                ) : (
                  visibleJobs.map((j) => {
                    const stage = normalizeWorkflowStageCompat(j.status);
                    const draft = jobDrafts[j.id] || buildJobDraft(j);
                    const isSavingRow = savingJobId === j.id;
                    return (
                    <tr key={j.id}>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{j.title || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.assetLabel || j.assetId || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.type || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.priority || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.dueDate || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.plannedDate || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", minWidth: 320 }}>
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
                            {isSavingRow ? "Saving..." : "Save details"}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>
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
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", color: UI.muted }}>
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
