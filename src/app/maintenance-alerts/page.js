"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import { UI_TOKENS } from "@/app/utils/uiTokens";

const UI = UI_TOKENS;
const surface = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm };
const button = { border: UI.border, borderRadius: UI.radiusSm, background: UI.card, color: UI.text, padding: "8px 11px", fontWeight: 800, cursor: "pointer", display: "inline-flex", gap: 7, alignItems: "center" };

async function authorisedJson(path, user) {
  const token = await user?.getIdToken?.();
  if (!token) throw new Error("Your session is not ready.");
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The maintenance review could not be loaded.");
  return data;
}

export default function MaintenanceAlertsPage() {
  const { user, isAdmin } = useAuth() || {};
  const [alerts, setAlerts] = useState([]);
  const [review, setReview] = useState(null);
  const [settings, setSettings] = useState({ enabled: true, warningRecipients: [], immediateVorRecipients: [], digestRecipients: [] });
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetExported, setResetExported] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [applyingReset, setApplyingReset] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [historyCleanupExported, setHistoryCleanupExported] = useState(false);
  const [historyCleanupConfirmation, setHistoryCleanupConfirmation] = useState("");
  const [applyingHistoryCleanup, setApplyingHistoryCleanup] = useState(false);
  const [historyCleanupResult, setHistoryCleanupResult] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [alertData, reviewData, settingsData] = await Promise.all([
        authorisedJson("/api/maintenance/alerts", user),
        isAdmin ? authorisedJson("/api/maintenance/reconciliation", user) : Promise.resolve(null),
        isAdmin ? authorisedJson("/api/maintenance/alerts/settings", user) : Promise.resolve(null),
      ]);
      setAlerts(alertData.alerts || []);
      setReview(reviewData);
      setResetExported(false);
      setResetConfirmation("");
      setHistoryCleanupExported(false);
      setHistoryCleanupConfirmation("");
      if (settingsData?.settings) setSettings(settingsData.settings);
    } catch (loadError) {
      setError(loadError?.message || "The maintenance review could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    setSavingSettings(true);
    setError("");
    try {
      const token = await user?.getIdToken?.();
      const response = await fetch("/api/maintenance/alerts/settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save notification settings.");
      setSettings(data.settings);
    } catch (saveError) {
      setError(saveError?.message || "Could not save notification settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const exportFutureScheduleReset = () => {
    const preview = review?.futureScheduleReset;
    if (!preview) return;
    const blob = new Blob([JSON.stringify(preview, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `future-schedule-reset-${preview.asOfDate || "dry-run"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setResetExported(true);
    setResetResult(null);
  };

  const applyFutureScheduleReset = async () => {
    const preview = review?.futureScheduleReset;
    if (!preview?.fingerprint || !resetExported) return;
    setApplyingReset(true);
    setError("");
    setResetResult(null);
    try {
      const token = await user?.getIdToken?.();
      const response = await fetch("/api/maintenance/reconciliation", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_future_schedule_reset",
          exportConfirmed: true,
          confirmation: resetConfirmation,
          expectedFingerprint: preview.fingerprint,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The future schedule reset was not applied.");
      setResetResult({
        message: data.message || "Future schedule cleanup finished.",
        archived: data.appliedArchives?.length || 0,
        kept: data.report?.futureScheduleReset?.summary?.preservedInspectionRecordCount || 0,
        skipped: (data.skippedArchives?.length || 0) + (data.skippedCreates?.length || 0),
        partial: data.partial === true,
      });
      if (data.report) setReview(data.report);
      setResetExported(false);
      setResetConfirmation("");
    } catch (applyError) {
      setError(applyError?.message || "The future schedule reset was not applied.");
    } finally {
      setApplyingReset(false);
    }
  };

  const exportFuturePmiHistoryCleanup = () => {
    const preview = review?.futurePmiHistoryCleanup;
    if (!preview) return;
    const blob = new Blob([JSON.stringify(preview, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `future-pmi-history-cleanup-${preview.asOfDate || "dry-run"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setHistoryCleanupExported(true);
    setHistoryCleanupResult(null);
  };

  const applyFuturePmiHistoryCleanup = async () => {
    const preview = review?.futurePmiHistoryCleanup;
    if (!preview?.fingerprint || !historyCleanupExported) return;
    setApplyingHistoryCleanup(true);
    setError("");
    setHistoryCleanupResult(null);
    try {
      const token = await user?.getIdToken?.();
      const response = await fetch("/api/maintenance/reconciliation", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_future_pmi_history_cleanup",
          exportConfirmed: true,
          confirmation: historyCleanupConfirmation,
          expectedFingerprint: preview.fingerprint,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The future PMI history cleanup was not applied.");
      setHistoryCleanupResult({
        message: data.message || "Future PMI history cleanup finished.",
        vehicles: data.appliedCandidates?.length || 0,
        entries: data.removedEntryCount || 0,
        repairedMarkers: data.repairedMarkerFieldCount || 0,
        skipped: data.skippedCandidates?.length || 0,
        partial: data.partial === true,
      });
      if (data.report) setReview(data.report);
      setHistoryCleanupExported(false);
      setHistoryCleanupConfirmation("");
    } catch (applyError) {
      setError(applyError?.message || "The future PMI history cleanup was not applied.");
    } finally {
      setApplyingHistoryCleanup(false);
    }
  };

  const breakdown = (title, items = []) => (
    <div style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {items.map((item) => (
          <span key={item.key} style={{ padding: "4px 7px", borderRadius: 999, background: UI.bg, border: UI.border, fontSize: 11.5 }}>
            {String(item.key || "missing").replaceAll("_", " ")}: <b>{item.count}</b>
          </span>
        ))}
        {!items.length ? <span style={{ color: UI.muted, fontSize: 12 }}>None</span> : null}
      </div>
    </div>
  );

  const emailField = (key, label, help) => (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontWeight: 800, fontSize: 13 }}>{label}</span>
      <input
        value={(settings[key] || []).join(", ")}
        onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }))}
        placeholder="name@example.com, another@example.com"
        style={{ border: UI.border, borderRadius: UI.radiusSm, background: UI.card, color: UI.text, padding: "9px 10px" }}
      />
      <span style={{ color: UI.muted, fontSize: 12 }}>{help}</span>
    </label>
  );

  return (
    <HeaderSidebarLayout>
      <main style={{ minHeight: "100vh", background: UI.bg, color: UI.text, padding: "18px 18px 36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 23 }}>Maintenance alerts</h1>
            <p style={{ margin: "6px 0 0", color: UI.muted, fontSize: 13.5 }}>Live PMI, brake-test and automatic VOR attention, using the current maintenance rules.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} style={button}><RefreshCw size={15} /> Refresh</button>
        </div>

        {error ? <div style={{ ...surface, padding: 12, color: UI.dangerText, background: UI.dangerSoft }}>{error}</div> : null}
        {!error && !loading && alerts.length === 0 ? (
          <div style={{ ...surface, padding: 18, display: "flex", gap: 10, alignItems: "center" }}><CheckCircle2 size={20} color={UI.successText} /><div><b>No open maintenance alerts</b><div style={{ color: UI.muted, fontSize: 13 }}>The hourly compliance check has no current warning or VOR alert.</div></div></div>
        ) : null}

        <div style={{ display: "grid", gap: 10 }}>
          {alerts.map((alert) => (
            <article key={alert.id} style={{ ...surface, padding: 13, borderLeft: `4px solid ${alert.severity === "critical" ? UI.danger : UI.warn}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {alert.severity === "critical" ? <ShieldAlert size={20} color={UI.danger} /> : <AlertTriangle size={20} color={UI.warnText} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 850 }}>{alert.title}</div>
                  <div style={{ color: UI.muted, fontSize: 13, marginTop: 3 }}>{alert.message}</div>
                  <div style={{ color: UI.muted, fontSize: 12, marginTop: 7 }}>Due {alert.dueDateISO || alert.startedDateISO || "—"}{alert.dueIsoWeek ? ` · ${alert.dueIsoWeek}` : ""}</div>
                </div>
                {alert.vehicleId ? <Link href={`/vehicle-edit/${encodeURIComponent(alert.vehicleId)}`} style={{ ...button, textDecoration: "none", fontSize: 12 }}>Open vehicle</Link> : null}
              </div>
            </article>
          ))}
        </div>

        {isAdmin ? (
          <section style={{ ...surface, padding: 14, marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div><h2 style={{ margin: 0, fontSize: 18 }}>Notification recipients</h2><p style={{ color: UI.muted, fontSize: 13, margin: "5px 0 0" }}>Comma-separated email addresses. Urgent VOR messages are immediate; warnings are included in the weekday digest.</p></div>
              <button type="button" onClick={saveSettings} disabled={savingSettings} style={button}><Save size={15} /> {savingSettings ? "Saving…" : "Save recipients"}</button>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "13px 0" }}><input type="checkbox" checked={settings.enabled !== false} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} /><b>Maintenance alerts enabled</b></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {emailField("warningRecipients", "Warning recipients", "Receives the one-week PMI/brake warning through the digest.")}
              {emailField("immediateVorRecipients", "Urgent VOR recipients", "Receives an email immediately when automatic VOR starts.")}
              {emailField("digestRecipients", "Digest recipients", "Receives the full list of open maintenance alerts each weekday.")}
            </div>
          </section>
        ) : null}

        {isAdmin ? (
          <section style={{ ...surface, padding: 14, marginTop: 18 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Data reconciliation review</h2>
            <p style={{ color: UI.muted, fontSize: 13, margin: "5px 0 12px" }}>The review is read-only. The separate guarded reset below runs only after export and explicit confirmation.</p>
            {review ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {[['Manual review', review.summary?.manualReviewCount], ['Invalid', review.summary?.invalidRecordCount], ['Due conflicts', review.summary?.dueDateConflictCount], ['Duplicates', review.summary?.duplicateGroupCount]].map(([label, value]) => <span key={label} style={{ padding: "6px 9px", borderRadius: 999, background: UI.brandSoft, border: `1px solid ${UI.brandBorder}`, fontSize: 12, fontWeight: 800 }}>{label}: {value || 0}</span>)}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(review.reconciliationPreview || []).map((item) => (
                    <div key={`${item.collection}-${item.documentId}-${item.action}`} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10 }}>
                      <div style={{ fontWeight: 800 }}>
                        {item.vehicleName || "Unknown vehicle"}
                        {item.registration ? ` · ${item.registration}` : ""}
                      </div>
                      <div style={{ color: UI.muted, fontSize: 13, marginTop: 3 }}>{item.reason}</div>
                      <div style={{ color: UI.muted, fontSize: 11.5, marginTop: 5 }}>Record: {item.documentId}</div>
                    </div>
                  ))}
                  {!review.reconciliationPreview?.length ? <div style={{ color: UI.muted }}>No records need manual reconciliation.</div> : null}
                </div>
                <div style={{ borderTop: UI.border, marginTop: 16, paddingTop: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Future schedule cleanup dry-run</h3>
                  <p style={{ color: UI.muted, fontSize: 13, margin: "5px 0 10px" }}>
                    Preview only. Each vehicle keeps its nearest upcoming automatic Inspection. Later automatic appointments are archived, never hard-deleted.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {[
                      ["Would archive", review.futureScheduleReset?.summary?.archiveCandidateCount],
                      ["Next inspections kept", review.futureScheduleReset?.summary?.preservedInspectionRecordCount],
                      ["Protected", review.futureScheduleReset?.summary?.protectedRecordCount],
                      ["MOT/service preserved", review.futureScheduleReset?.summary?.preservedCoreRecordCount],
                      ["Future history to review", review.futureScheduleReset?.summary?.futureCompletionAnomalyCount],
                    ].map(([label, value]) => (
                      <span key={label} style={{ padding: "6px 9px", borderRadius: 999, background: UI.brandSoft, border: `1px solid ${UI.brandBorder}`, fontSize: 12, fontWeight: 800 }}>
                        {label}: {value || 0}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8, marginBottom: 12 }}>
                    {breakdown("Archive candidates by type", review.futureScheduleReset?.summary?.archiveByType)}
                    {breakdown("Next inspections kept by type", review.futureScheduleReset?.summary?.preservedInspectionByType)}
                    {breakdown("Protected by reason", review.futureScheduleReset?.summary?.protectedByReason)}
                    {breakdown("Preserved MOT/service by type", review.futureScheduleReset?.summary?.preservedCoreByType)}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(review.futureScheduleReset?.archiveCandidates || []).map((item) => (
                      <div key={`archive-${item.documentId}`} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10 }}>
                        <div style={{ fontWeight: 800 }}>{item.vehicleName || "Unknown vehicle"}{item.registration ? ` · ${item.registration}` : ""}</div>
                        <div style={{ color: UI.muted, fontSize: 13, marginTop: 3 }}>
                          Would archive {item.maintenanceTypeIds?.join(" + ") || "maintenance"} on {item.appointmentDateISO || "unknown date"}
                        </div>
                        <div style={{ color: UI.muted, fontSize: 11.5, marginTop: 5 }}>Record: {item.documentId}</div>
                      </div>
                    ))}
                    {!review.futureScheduleReset?.archiveCandidates?.length ? (
                      <div style={{ color: UI.muted }}>No untouched future automatic appointments need cleanup.</div>
                    ) : null}
                  </div>
                  <div style={{ borderTop: UI.border, marginTop: 14, paddingTop: 14, display: "grid", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 850 }}>Guarded live reset</div>
                      <div style={{ color: UI.muted, fontSize: 12.5, marginTop: 3 }}>
                        Export this exact dry-run, then type the confirmation phrase. The server rejects stale fingerprints and rechecks every record before archiving it.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" onClick={exportFutureScheduleReset} disabled={applyingReset || !review.futureScheduleReset?.fingerprint} style={button}>
                        <Download size={15} /> Export dry-run JSON
                      </button>
                      <input
                        aria-label="Future schedule reset confirmation"
                        value={resetConfirmation}
                        onChange={(event) => setResetConfirmation(event.target.value)}
                        placeholder={review.futureScheduleReset?.confirmationPhrase || "Confirmation phrase"}
                        disabled={!resetExported || applyingReset}
                        style={{ minWidth: 320, flex: "1 1 320px", border: UI.border, borderRadius: UI.radiusSm, background: UI.card, color: UI.text, padding: "9px 10px" }}
                      />
                      <button
                        type="button"
                        onClick={applyFutureScheduleReset}
                        disabled={
                          applyingReset ||
                          !resetExported ||
                          resetConfirmation !== review.futureScheduleReset?.confirmationPhrase
                        }
                        style={{ ...button, background: UI.dangerSoft, color: UI.dangerText, border: `1px solid ${UI.danger}` }}
                      >
                        <ShieldCheck size={15} /> {applyingReset ? "Applying…" : "Archive later appointments"}
                      </button>
                    </div>
                    <div style={{ color: resetExported ? UI.successText : UI.muted, fontSize: 12 }}>
                      {resetExported
                        ? "Dry-run exported. Review the JSON before entering the confirmation phrase."
                        : "The live action stays disabled until this preview has been exported."}
                    </div>
                    {resetResult ? (
                      <div style={{ padding: 10, borderRadius: UI.radiusSm, background: resetResult.partial ? UI.warnSoft : UI.successSoft, color: resetResult.partial ? UI.warnText : UI.successText, fontSize: 13 }}>
                        <b>{resetResult.message}</b>
                        <div style={{ marginTop: 3 }}>Archived {resetResult.archived} · Next inspections kept {resetResult.kept} · Skipped {resetResult.skipped}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div style={{ borderTop: UI.border, marginTop: 16, paddingTop: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Future PMI completion-history cleanup dry-run</h3>
                  <p style={{ color: UI.muted, fontSize: 13, margin: "5px 0 10px" }}>
                    Preview only. Removes impossible future PMI completions from the active vehicle history while archiving an exact copy for audit. Upcoming bookings, genuine past history, MOT and Service are unchanged.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {[
                      ["PMI history entries", review.futurePmiHistoryCleanup?.summary?.historyEntryCount],
                      ["Affected vehicles", review.futurePmiHistoryCleanup?.summary?.candidateVehicleCount],
                      ["Last-PMI markers repaired", review.futurePmiHistoryCleanup?.summary?.futureMarkerFieldCount],
                      ["Non-PMI history preserved", review.futurePmiHistoryCleanup?.summary?.preservedNonPmiAnomalyCount],
                    ].map(([label, value]) => (
                      <span key={label} style={{ padding: "6px 9px", borderRadius: 999, background: UI.brandSoft, border: `1px solid ${UI.brandBorder}`, fontSize: 12, fontWeight: 800 }}>
                        {label}: {value || 0}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    {breakdown("PMI history entries by field", review.futurePmiHistoryCleanup?.summary?.entriesByField)}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(review.futurePmiHistoryCleanup?.candidates || []).map((item) => (
                      <div key={`future-pmi-${item.documentId}`} style={{ border: UI.border, borderRadius: UI.radiusSm, padding: 10 }}>
                        <div style={{ fontWeight: 800 }}>{item.vehicleName || "Unknown vehicle"}{item.registration ? ` · ${item.registration}` : ""}</div>
                        <div style={{ color: UI.muted, fontSize: 13, marginTop: 3 }}>
                          Would archive and remove {item.historyEntryCount} false future PMI {item.historyEntryCount === 1 ? "completion" : "completions"}: {item.entries?.map((entry) => entry.completionDateISO).join(", ") || "unknown date"}
                        </div>
                        {item.futureMarkerFields?.length ? (
                          <div style={{ color: UI.muted, fontSize: 12, marginTop: 3 }}>
                            Repair markers: {item.futureMarkerFields.join(", ")} → {item.latestValidCompletionDateISO || "blank"}
                          </div>
                        ) : null}
                        <div style={{ color: UI.muted, fontSize: 11.5, marginTop: 5 }}>Vehicle: {item.documentId}</div>
                      </div>
                    ))}
                    {!review.futurePmiHistoryCleanup?.candidates?.length ? (
                      <div style={{ color: UI.muted }}>No false future PMI completion history needs cleanup.</div>
                    ) : null}
                  </div>
                  <div style={{ borderTop: UI.border, marginTop: 14, paddingTop: 14, display: "grid", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 850 }}>Guarded live history cleanup</div>
                      <div style={{ color: UI.muted, fontSize: 12.5, marginTop: 3 }}>
                        Export this exact dry-run, then type the confirmation phrase. The server reloads every vehicle, rejects stale fingerprints and commits all vehicle patches atomically.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={exportFuturePmiHistoryCleanup}
                        disabled={applyingHistoryCleanup || !review.futurePmiHistoryCleanup?.fingerprint || !review.futurePmiHistoryCleanup?.summary?.historyEntryCount}
                        style={button}
                      >
                        <Download size={15} /> Export PMI-history dry-run
                      </button>
                      <input
                        aria-label="Future PMI history cleanup confirmation"
                        value={historyCleanupConfirmation}
                        onChange={(event) => setHistoryCleanupConfirmation(event.target.value)}
                        placeholder={review.futurePmiHistoryCleanup?.confirmationPhrase || "Confirmation phrase"}
                        disabled={!historyCleanupExported || applyingHistoryCleanup}
                        style={{ minWidth: 320, flex: "1 1 320px", border: UI.border, borderRadius: UI.radiusSm, background: UI.card, color: UI.text, padding: "9px 10px" }}
                      />
                      <button
                        type="button"
                        onClick={applyFuturePmiHistoryCleanup}
                        disabled={
                          applyingHistoryCleanup ||
                          !historyCleanupExported ||
                          historyCleanupConfirmation !== review.futurePmiHistoryCleanup?.confirmationPhrase
                        }
                        style={{ ...button, background: UI.dangerSoft, color: UI.dangerText, border: `1px solid ${UI.danger}` }}
                      >
                        <ShieldCheck size={15} /> {applyingHistoryCleanup ? "Applying…" : "Remove false future PMI history"}
                      </button>
                    </div>
                    <div style={{ color: historyCleanupExported ? UI.successText : UI.muted, fontSize: 12 }}>
                      {historyCleanupExported
                        ? "PMI-history dry-run exported. Review it before entering the confirmation phrase."
                        : "The live history cleanup stays disabled until this exact preview has been exported."}
                    </div>
                    {historyCleanupResult ? (
                      <div style={{ padding: 10, borderRadius: UI.radiusSm, background: historyCleanupResult.partial ? UI.warnSoft : UI.successSoft, color: historyCleanupResult.partial ? UI.warnText : UI.successText, fontSize: 13 }}>
                        <b>{historyCleanupResult.message}</b>
                        <div style={{ marginTop: 3 }}>
                          Vehicles {historyCleanupResult.vehicles} · PMI entries removed {historyCleanupResult.entries} · Markers repaired {historyCleanupResult.repairedMarkers} · Skipped {historyCleanupResult.skipped}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : <div style={{ color: UI.muted }}>{loading ? "Building the review…" : "Review unavailable."}</div>}
          </section>
        ) : null}
      </main>
    </HeaderSidebarLayout>
  );
}
