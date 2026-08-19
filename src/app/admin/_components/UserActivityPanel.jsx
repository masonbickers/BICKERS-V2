"use client";

import layoutStyles from "./UserActivityPanel.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { Download, ChevronDown, ChevronRight, RefreshCw, Save, Settings2 } from "lucide-react";
import { auth } from "@/app/utils/firebaseClient";
import WorkScheduleEditor from "@/app/components/WorkScheduleEditor";
import { trackMeaningfulAction } from "@/app/utils/activityTrackingClient";

const ymd = (date) => date.toISOString().slice(0, 10);
const initialFrom = () => ymd(new Date(Date.now() - 29 * 86400000));
const hours = (minutes) => `${(Number(minutes || 0) / 60).toFixed(1)}h`;
const formatDateTime = (value) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

async function token() {
  if (!auth.currentUser) throw new Error("You need to sign in again.");
  return auth.currentUser.getIdToken();
}

export default function UserActivityPanel({ getAuthToken = token }) {
  const [filters, setFilters] = useState({
    from: initialFrom(), to: ymd(new Date()), uid: "", category: "", workspace: "",
    hours: "all", linkage: "all", reviewStatus: "all",
  });
  const [data, setData] = useState({ rows: [], accounts: [], summary: {}, settings: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const idToken = await getAuthToken();
      const response = await fetch(`/api/admin/activity-tracking?${query}`, {
        headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "User activity could not be loaded.");
      setData(result);
      setSettingsDraft(result.settings);
    } catch (loadError) {
      setError(loadError?.message || "User activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // Filters are applied explicitly to avoid excessive requests.

  const exportCsv = async () => {
    try {
      const idToken = await getAuthToken();
      const response = await fetch(`/api/admin/activity-tracking?${query}&format=csv`, {
        headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store",
      });
      if (!response.ok) throw new Error("The CSV export could not be created.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `user-activity-${filters.from}-to-${filters.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      trackMeaningfulAction("export_activity");
    } catch (exportError) {
      setError(exportError?.message || "The CSV export could not be created.");
    }
  };

  const saveReview = async (row, patch) => {
    try {
      const idToken = await getAuthToken();
      const response = await fetch("/api/admin/activity-tracking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          sessionId: row.id,
          companyId: row.companyId,
          status: patch.status ?? row.review?.status,
          note: patch.note ?? row.review?.note,
          externalReference: patch.externalReference ?? row.review?.externalReference,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The review could not be saved.");
      setData((previous) => ({
        ...previous,
        rows: previous.rows.map((item) => item.id === row.id ? { ...item, review: result.review } : item),
      }));
      trackMeaningfulAction("review_activity");
    } catch (reviewError) {
      setError(reviewError?.message || "The review could not be saved.");
    }
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    setSavingSettings(true);
    try {
      const idToken = await getAuthToken();
      const response = await fetch("/api/admin/activity-tracking/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ settings: settingsDraft }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Tracking settings could not be saved.");
      setSettingsDraft(result.settings);
      setData((previous) => ({ ...previous, settings: result.settings }));
      setShowSettings(false);
      trackMeaningfulAction("save_activity_settings");
    } catch (settingsError) {
      setError(settingsError?.message || "Tracking settings could not be saved.");
    } finally {
      setSavingSettings(false);
    }
  };

  const categories = [...new Set(data.rows.map((row) => row.category))].sort();
  const trend = useMemo(() => {
    const byDay = new Map();
    data.rows.forEach((row) => {
      const current = byDay.get(row.dateKey) || { active: 0, out: 0 };
      current.active += row.activeMinutes;
      current.out += row.outOfHoursMinutes;
      byDay.set(row.dateKey, current);
    });
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-31);
  }, [data.rows]);
  const trendMax = Math.max(1, ...trend.map(([, value]) => value.active));

  return (
    <section className={layoutStyles.extracted1}>
      <div className={layoutStyles.extracted2}>
        <div>
          <h2 className={layoutStyles.extracted3}>User Activity</h2>
          <div className={layoutStyles.extracted4}>Possible out-of-hours system use for review. This does not create overtime or change timesheets.</div>
        </div>
        <div className={layoutStyles.extracted5}>
          <button type="button" className={layoutStyles.extracted6} onClick={() => setShowSettings((value) => !value)}><Settings2 size={14} /> Settings</button>
          <button type="button" className={layoutStyles.extracted7} onClick={exportCsv}><Download size={14} /> Export CSV</button>
        </div>
      </div>

      {showSettings && settingsDraft && (
        <div className={layoutStyles.extracted8}>
          <div className={layoutStyles.extracted9}>
            <label className={layoutStyles.extracted10}><span>Tracking</span><select value={settingsDraft.enabled ? "on" : "off"} onChange={(e) => setSettingsDraft((s) => ({ ...s, enabled: e.target.value === "on" }))} className={layoutStyles.extracted11}><option value="on">Enabled</option><option value="off">Disabled</option></select></label>
            <label className={layoutStyles.extracted12}><span>Idle after</span><input type="number" min="5" max="30" value={settingsDraft.idleMinutes} onChange={(e) => setSettingsDraft((s) => ({ ...s, idleMinutes: Number(e.target.value) }))} className={layoutStyles.extracted13} /><small>minutes</small></label>
            <label className={layoutStyles.extracted14}><span>Flag after</span><input type="number" min="5" max="120" value={settingsDraft.flagMinutes} onChange={(e) => setSettingsDraft((s) => ({ ...s, flagMinutes: Number(e.target.value) }))} className={layoutStyles.extracted15} /><small>out-of-hours minutes/day</small></label>
          </div>
          <div className={layoutStyles.extracted16}>Company fallback schedule</div>
          <WorkScheduleEditor compact value={settingsDraft.fallbackSchedule} onChange={(fallbackSchedule) => setSettingsDraft((s) => ({ ...s, fallbackSchedule }))} />
          <div className={layoutStyles.extracted17}>Linked accounts use the employee schedule. Unlinked, service and platform accounts use this fallback.</div>
          <button type="button" className={layoutStyles.extracted18} disabled={savingSettings} onClick={saveSettings}><Save size={14} /> {savingSettings ? "Saving…" : "Save settings"}</button>
        </div>
      )}

      <div className={layoutStyles.extracted19}>
        <label className={layoutStyles.extracted20}><span>From</span><input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className={layoutStyles.extracted21} /></label>
        <label className={layoutStyles.extracted22}><span>To</span><input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className={layoutStyles.extracted23} /></label>
        <label className={layoutStyles.extracted24}><span>Account</span><select value={filters.uid} onChange={(e) => setFilters((f) => ({ ...f, uid: e.target.value }))} className={layoutStyles.extracted25}><option value="">All accounts</option>{data.accounts.map((account) => <option key={account.uid} value={account.uid}>{account.email}</option>)}</select></label>
        <label className={layoutStyles.extracted26}><span>Category</span><select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className={layoutStyles.extracted27}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className={layoutStyles.extracted28}><span>Workspace</span><select value={filters.workspace} onChange={(e) => setFilters((f) => ({ ...f, workspace: e.target.value }))} className={layoutStyles.extracted29}><option value="">All workspaces</option><option value="user">User</option><option value="service">Service</option></select></label>
        <label className={layoutStyles.extracted30}><span>Hours</span><select value={filters.hours} onChange={(e) => setFilters((f) => ({ ...f, hours: e.target.value }))} className={layoutStyles.extracted31}><option value="all">All hours</option><option value="out">Out of hours</option><option value="in">In hours only</option></select></label>
        <label className={layoutStyles.extracted32}><span>Link</span><select value={filters.linkage} onChange={(e) => setFilters((f) => ({ ...f, linkage: e.target.value }))} className={layoutStyles.extracted33}><option value="all">All accounts</option><option value="linked">Linked employees</option><option value="unlinked">Unlinked accounts</option></select></label>
        <label className={layoutStyles.extracted34}><span>Review</span><select value={filters.reviewStatus} onChange={(e) => setFilters((f) => ({ ...f, reviewStatus: e.target.value }))} className={layoutStyles.extracted35}><option value="all">All statuses</option><option value="unreviewed">Unreviewed</option><option value="reviewed_no_overtime">No overtime</option><option value="possible_overtime">Possible overtime</option><option value="recorded_externally">Recorded externally</option></select></label>
        <button type="button" className={layoutStyles.extracted36} onClick={load} disabled={loading}><RefreshCw size={14} /> {loading ? "Loading…" : "Apply filters"}</button>
      </div>

      {error && <div className={layoutStyles.extracted37}>{error}</div>}

      <div className={layoutStyles.extracted38}>
        <Stat label="Active time" value={hours(data.summary.activeMinutes)} />
        <Stat label="Out of hours" value={hours(data.summary.outOfHoursMinutes)} accent />
        <Stat label="Affected accounts" value={data.summary.affectedAccounts || 0} />
        <Stat label="Flagged days" value={data.summary.flaggedDays || 0} accent />
      </div>

      <div className={layoutStyles.extracted39} aria-label="Activity trend">
        {trend.length ? trend.map(([day, value]) => (
          <div key={day} title={`${day}: ${hours(value.active)} active, ${hours(value.out)} out of hours`} className={layoutStyles.extracted40}>
            <div className={layoutStyles.extracted41}>
              <div style={{ width: "55%", height: `${Math.max(3, value.active / trendMax * 92)}px`, borderRadius: "5px 5px 2px 2px", background: "#111" }} />
              <div style={{ width: "45%", height: `${Math.max(value.out ? 3 : 0, value.out / trendMax * 92)}px`, borderRadius: "5px 5px 2px 2px", background: "#d97706" }} />
            </div>
            <span className={layoutStyles.extracted42}>{day.slice(5)}</span>
          </div>
        )) : <div className={layoutStyles.extracted43}>No tracked sessions in this range.</div>}
      </div>

      <div className={layoutStyles.extracted44}>
        <table className={layoutStyles.extracted45}>
          <thead><tr><Th /><Th>Account</Th><Th>When</Th><Th>Active</Th><Th>Out of hours</Th><Th>Area</Th><Th>Schedule</Th><Th>Review</Th></tr></thead>
          <tbody>
            {!loading && data.rows.length === 0 ? <tr><td colSpan={8} className={layoutStyles.extracted46}>No activity matches these filters.</td></tr> : data.rows.map((row) => (
              <SessionRow key={row.id} row={row} open={expanded === row.id} onToggle={() => setExpanded(expanded === row.id ? "" : row.id)} onSaveReview={saveReview} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SessionRow({ row, open, onToggle, onSaveReview }) {
  const [draft, setDraft] = useState(row.review || { status: "unreviewed", note: "", externalReference: "" });
  useEffect(() => setDraft(row.review || { status: "unreviewed", note: "", externalReference: "" }), [row.review]);
  return (
    <>
      <tr className={layoutStyles.extracted47}>
        <td className={layoutStyles.extracted48}><button type="button" aria-label="Show session detail" className={layoutStyles.extracted49} onClick={onToggle}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
        <td className={layoutStyles.extracted50}><strong>{row.email}</strong><div className={layoutStyles.extracted51}>{row.employeeName} · {row.linked ? "Linked" : "Company fallback"}</div></td>
        <td className={layoutStyles.extracted52}>{formatDateTime(row.startAt)}<div className={layoutStyles.extracted53}>to {formatDateTime(row.endAt)}</div></td>
        <td className={layoutStyles.extracted54}>{row.activeMinutes} min</td>
        <td className={layoutStyles.extracted55}><span style={row.flagged ? flagStyle : pillStyle}>{row.outOfHoursMinutes} min{row.flagged ? " · Flagged" : ""}</span></td>
        <td className={layoutStyles.extracted56}>{row.category}<div className={layoutStyles.extracted57}>{row.workspace}</div></td>
        <td className={layoutStyles.extracted58}>{row.scheduleLabel}<div className={layoutStyles.extracted59}>{row.scheduleSource}</div></td>
        <td className={layoutStyles.extracted60}>{String(row.review?.status || "unreviewed").replaceAll("_", " ")}</td>
      </tr>
      {open && <tr><td colSpan={8} className={layoutStyles.extracted61}>
        <div className={layoutStyles.extracted62}>
          <div className={layoutStyles.extracted63}>
            <span className={layoutStyles.extracted64}>{row.inHoursMinutes} min in hours</span><span className={layoutStyles.extracted65}>{row.outOfHoursMinutes} min out of hours</span><span className={layoutStyles.extracted66}>{row.actionCount} recorded actions</span>
            {row.annotations.map((annotation) => <span key={annotation} className={layoutStyles.extracted67}>{annotation}</span>)}
          </div>
          <div className={layoutStyles.extracted68}>
            <label className={layoutStyles.extracted69}><span>Classification</span><select value={draft.status || "unreviewed"} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} className={layoutStyles.extracted70}><option value="unreviewed">Unreviewed</option><option value="reviewed_no_overtime">Reviewed — no overtime</option><option value="possible_overtime">Possible overtime</option><option value="recorded_externally">Recorded externally</option></select></label>
            <label className={layoutStyles.extracted71}><span>Admin note</span><input value={draft.note || ""} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} maxLength={1000} className={layoutStyles.extracted72} /></label>
            {draft.status === "recorded_externally" && <label className={layoutStyles.extracted73}><span>External reference</span><input value={draft.externalReference || ""} onChange={(e) => setDraft((d) => ({ ...d, externalReference: e.target.value }))} maxLength={160} className={layoutStyles.extracted74} /></label>}
          </div>
          <button type="button" className={layoutStyles.extracted75} onClick={() => onSaveReview(row, draft)}><Save size={14} /> Save review</button>
        </div>
      </td></tr>}
    </>
  );
}

const Stat = ({ label, value, accent }) => <div style={{ ...statStyle, borderColor: accent ? "#f2c078" : "var(--color-border)" }}><div className={layoutStyles.extracted76}>{label}</div><div style={{ fontSize: 24, fontWeight: 950, marginTop: 4, color: accent ? "#b45309" : "var(--color-text)" }}>{value}</div></div>;
const Th = ({ children }) => <th className={layoutStyles.extracted77}>{children}</th>;
const panelStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", borderRadius: 14, padding: 14, display: "grid", gap: 14, marginBottom: 14 };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" };
const muted = { color: "var(--color-text-muted)", fontSize: 12, marginTop: 3 };
const buttonStyle = { minHeight: 36, display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--color-border)", borderRadius: 9, padding: "7px 11px", background: "var(--color-surface)", color: "var(--shell-sidebar-bg)", fontWeight: 800, cursor: "pointer" };
const primaryButtonStyle = { ...buttonStyle, background: "#111", color: "#fff", borderColor: "#111", alignSelf: "end", justifyContent: "center" };
const settingsStyle = { padding: 13, display: "grid", gap: 12, borderRadius: 12, border: "1px solid var(--color-border)", background: "var(--color-surface-subtle)" };
const filterGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8, alignItems: "end" };
const labelStyle = { display: "grid", gap: 4, fontSize: 11, fontWeight: 850, color: "var(--color-text-muted)" };
const inputStyle = { minHeight: 36, width: "100%", border: "1px solid var(--color-border)", borderRadius: 9, padding: "6px 9px", background: "var(--color-surface)", color: "var(--shell-sidebar-bg)" };
const statsGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 };
const statStyle = { border: "1px solid var(--color-border)", borderRadius: 11, padding: 11, background: "var(--color-surface-subtle)" };
const chartStyle = { height: 132, padding: "10px 8px 20px", display: "flex", alignItems: "end", gap: 4, border: "1px solid var(--color-border)", borderRadius: 11, overflow: "hidden" };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1040 };
const cellStyle = { padding: "10px", verticalAlign: "top", fontSize: 12.5, color: "var(--color-text)" };
const emptyStyle = { ...cellStyle, textAlign: "center", padding: 28, color: "var(--color-text-muted)" };
const iconButtonStyle = { border: 0, background: "transparent", color: "var(--shell-sidebar-bg)", cursor: "pointer", padding: 3 };
const pillStyle = { display: "inline-flex", border: "1px solid var(--color-border)", borderRadius: 999, padding: "3px 7px", background: "var(--color-surface)", fontSize: 11, fontWeight: 750 };
const flagStyle = { ...pillStyle, background: "#fff7e8", borderColor: "#f2c078", color: "#9a4b00" };
const errorStyle = { border: "1px solid #efb0b0", background: "#fff1f1", color: "#a40000", borderRadius: 9, padding: 9, fontSize: 12, fontWeight: 750 };
