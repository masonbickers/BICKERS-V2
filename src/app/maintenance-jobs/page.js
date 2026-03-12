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
  MAINTENANCE_JOB_STATUSES,
  buildAssetLabel,
  createMaintenanceJobPayload,
  normalizeAssetRecord,
} from "../utils/maintenanceSchema";

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  border: "1px solid #e5e7eb",
  brand: "#1d4ed8",
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

export default function MaintenanceJobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vehicles, setVehicles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    assetId: "",
    type: "service",
    title: "",
    dueDate: "",
    plannedDate: "",
    priority: "normal",
    notes: "",
  });

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
      if (statusFilter !== "all" && String(j.status || "") !== statusFilter) return false;
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

  const createJob = async () => {
    if (!form.assetId) return alert("Please select an asset.");
    if (!form.title.trim()) return alert("Please enter a job title.");
    setSaving(true);
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
      await addDoc(collection(db, "maintenanceJobs"), payload);
      setForm((prev) => ({ ...prev, title: "", notes: "" }));
    } catch (error) {
      console.error("Failed creating maintenance job:", error);
      alert("Could not create job card.");
    } finally {
      setSaving(false);
    }
  };

  const setJobStatus = async (jobId, status) => {
    try {
      const nowIso = new Date().toISOString();
      const patch = { status, updatedAt: nowIso, updatedAtServer: serverTimestamp() };
      if (status === "in_progress") patch.startedAt = nowIso;
      if (status === "complete") patch.completedAt = nowIso;
      if (status === "closed") patch.closedAt = nowIso;
      await updateDoc(doc(db, "maintenanceJobs", jobId), patch);
    } catch (error) {
      console.error("Failed updating maintenance job status:", error);
      alert("Could not update status.");
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
                Phase 2 job cards: plan, progress, complete and close workshop jobs.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={btn()} onClick={() => router.push("/vehicle-home")}>
                Back to Vehicle Home
              </button>
            </div>
          </div>
        </div>

        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Create Job Card</div>
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
              {MAINTENANCE_JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Title", "Asset", "Type", "Priority", "Due", "Planned", "Status", "Updated"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 10px", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 12, color: UI.muted }}>
                      No maintenance jobs.
                    </td>
                  </tr>
                ) : (
                  visibleJobs.map((j) => (
                    <tr key={j.id}>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{j.title || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.assetLabel || j.assetId || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.type || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.priority || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.dueDate || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{j.plannedDate || "-"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>
                        <select
                          value={j.status || "planned"}
                          onChange={(e) => setJobStatus(j.id, e.target.value)}
                          style={{ ...input, minWidth: 150 }}
                        >
                          {MAINTENANCE_JOB_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", color: UI.muted }}>
                        {fmtDateTime(j.updatedAt || j.updatedAtServer)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

