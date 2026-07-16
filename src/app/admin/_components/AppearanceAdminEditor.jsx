"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, History, Moon, RotateCcw, Save, Send, Sun, Type, XCircle } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAppearance } from "@/app/components/GlobalThemeProvider";
import { Alert, Badge, Button, Card, Checkbox, Page, PageHeader, Select, Spinner } from "@/app/components/ui";
import { useAuth } from "@/app/context/authContext";
import { auth } from "@/app/utils/firebaseClient";
import { PLATFORM_APPEARANCE_ID } from "@/app/utils/appearanceModel";
import { contentLabelGroups, DEFAULT_CONTENT_LABELS, normalizeContentLabels, validateContentLabels } from "@/app/utils/contentLabels";
import { DEFAULT_GLOBAL_THEME, DENSITY_OPTIONS, FONT_OPTIONS, normalizeGlobalTheme, SHADOW_OPTIONS, themeToCssVariables, validateThemeContrast } from "@/app/utils/globalTheme";
import { normalizePlatformRole } from "@/app/utils/accessControl";
import styles from "./AppearanceAdminEditor.module.css";

const THEME_GROUPS = [
  { title: "Branding", fields: [["appName", "Application name", "text"], ["companyLogo", "Company logo URL", "text"], ["platformLogo", "Platform logo URL", "text"]] },
  { title: "Core colours", fields: [["brandColor", "Primary accent", "color"], ["accentColor", "Secondary accent", "color"], ["textColor", "Main text", "color"], ["mutedTextColor", "Muted text", "color"], ["canvasColor", "Page background", "color"], ["surfaceColor", "Surface", "color"], ["borderColor", "Borders", "color"], ["shellColor", "Navigation background", "color"], ["shellTextColor", "Navigation text", "color"]] },
  { title: "Semantic states", fields: [["successColor", "Success", "color"], ["warningColor", "Warning", "color"], ["dangerColor", "Danger", "color"], ["infoColor", "Information", "color"]] },
  { title: "Typography", fields: [["fontFamily", "Font family", "font"], ["baseFontSize", "Base text size", "number", 12, 18, 1, "px"], ["headingFontSize", "Page heading size", "number", 18, 34, 1, "px"], ["lineHeight", "Line height", "number", 1.3, 1.8, .05, ""], ["buttonFontWeight", "Button weight", "number", 500, 900, 100, ""]] },
  { title: "Buttons and forms", fields: [["primaryTextColor", "Primary button text", "color"], ["buttonHeight", "Button height", "number", 30, 48, 1, "px"], ["inputHeight", "Input height", "number", 32, 52, 1, "px"], ["borderWidth", "Border width", "number", 0, 3, 1, "px"], ["focusRingWidth", "Focus ring width", "number", 0, 6, 1, "px"]] },
  { title: "Spacing and layout", fields: [["density", "Density", "density"], ["pageWidth", "Maximum page width", "number", 920, 1600, 20, "px"], ["pagePadding", "Page padding", "number", 8, 32, 2, "px"]] },
  { title: "Navigation", fields: [["sidebarWidth", "Sidebar width", "number", 180, 320, 5, "px"], ["collapsedSidebarWidth", "Collapsed sidebar", "number", 48, 90, 2, "px"], ["topbarHeight", "Top bar height", "number", 50, 84, 2, "px"]] },
  { title: "Cards and elevation", fields: [["radius", "Corner radius", "number", 0, 20, 1, "px"], ["shadowPreset", "Shadow preset", "shadow"]] },
  { title: "Tables", fields: [["tableRowHeight", "Row height", "number", 34, 64, 2, "px"], ["tableHeaderColor", "Header background", "color"], ["tableAlternateColor", "Alternate row", "color"], ["tableZebra", "Alternating rows", "boolean"]] },
  { title: "Dark mode", fields: [["darkModeEnabled", "Enable generated dark mode", "boolean"]] },
];

function changedCount(draft, published) {
  const keys = new Set([...Object.keys(draft || {}), ...Object.keys(published || {})]);
  return [...keys].filter((key) => JSON.stringify(draft?.[key]) !== JSON.stringify(published?.[key])).length;
}

function FieldControl({ field, value, onChange }) {
  const [name, label, type, min, max, step, suffix = ""] = field;
  if (type === "boolean") return <Checkbox label={label} checked={value === true} onChange={(event) => onChange(name, event.target.checked)} />;
  if (type === "color") return <label className={styles.colorField}><span>{label}</span><input type="color" value={value} onChange={(event) => onChange(name, event.target.value)} /><input value={value} onChange={(event) => onChange(name, event.target.value)} aria-label={`${label} hex value`} /></label>;
  if (["font", "density", "shadow"].includes(type)) {
    const options = type === "font" ? FONT_OPTIONS.map(({ value: optionValue, label: optionLabel }) => [optionValue, optionLabel]) : (type === "density" ? DENSITY_OPTIONS : SHADOW_OPTIONS).map((option) => [option, option[0].toUpperCase() + option.slice(1)]);
    return <label className={styles.selectField}><span>{label}</span><Select value={value} onChange={(event) => onChange(name, event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</Select></label>;
  }
  if (type === "number") return <label className={styles.rangeField}><span><strong>{label}</strong><output>{value}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(name, Number(event.target.value))} /></label>;
  return <label className={styles.textField}><span>{label}</span><input value={value || ""} onChange={(event) => onChange(name, event.target.value)} /></label>;
}

function ThemePreview({ theme }) {
  const [mode, setMode] = useState("light");
  const [mobile, setMobile] = useState(false);
  const variables = useMemo(() => themeToCssVariables(theme, { mode }), [mode, theme]);
  return <div className={styles.previewWrap}>
    <div className={styles.previewTools}>
      <Button size="sm" variant={mode === "light" ? "primary" : "secondary"} onClick={() => setMode("light")}><Sun size={14} /> Light</Button>
      <Button size="sm" variant={mode === "dark" ? "primary" : "secondary"} onClick={() => setMode("dark")} disabled={!theme.darkModeEnabled}><Moon size={14} /> Dark</Button>
      <Button size="sm" variant="secondary" onClick={() => setMobile((value) => !value)}>{mobile ? "Desktop" : "Mobile"}</Button>
    </div>
    <div className={`${styles.previewShell} ${mobile ? styles.previewMobile : ""}`} style={variables} data-preview-mode={mode}>
      <aside><strong>{theme.appName}</strong><span className={styles.activeNav}>Overview</span><span>Bookings</span><span>Vehicles</span></aside>
      <div className={styles.previewMain}><header>Operations</header><main><p className={styles.eyebrow}>DASHBOARD</p><h2>Dashboard overview</h2><p className={styles.muted}>Preview typography, navigation, controls, tables and semantic states.</p>
        <div className={styles.previewCards}><section><small>Active jobs</small><strong>24</strong></section><section><small>Vehicles</small><strong>18</strong></section></div>
        <section className={styles.previewPanel}><label>Search bookings<input placeholder="Search…" /></label><div className={styles.previewActions}><button>Primary action</button><button>Secondary</button></div></section>
        <div className={styles.statuses}><span data-tone="success">Success</span><span data-tone="warning">Warning</span><span data-tone="danger">Danger</span><span data-tone="info">Information</span></div>
        <table><thead><tr><th>Job</th><th>Status</th></tr></thead><tbody><tr><td>BA-1024</td><td>Confirmed</td></tr><tr><td>BA-1025</td><td>Pencil</td></tr></tbody></table>
      </main></div>
    </div>
  </div>;
}

export default function AppearanceAdminEditor({ section }) {
  const router = useRouter();
  const authAccess = useAuth() || {};
  const runtimeAppearance = useAppearance();
  const isPlatformAdmin = normalizePlatformRole(authAccess.userDoc?.role) === "platformAdmin";
  const ownCompanyId = String(authAccess.userDoc?.companyId || "bickers-action");
  const [companyId, setCompanyId] = useState(isPlatformAdmin ? PLATFORM_APPEARANCE_ID : ownCompanyId);
  const [state, setState] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [draft, setDraft] = useState(section === "theme" ? DEFAULT_GLOBAL_THEME : DEFAULT_CONTENT_LABELS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => { setCompanyId(isPlatformAdmin ? PLATFORM_APPEARANCE_ID : ownCompanyId); }, [isPlatformAdmin, ownCompanyId]);

  const callApi = async (url, options = {}) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Your admin session is not ready.");
    const token = await currentUser.getIdToken();
    const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}), Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data?.error || "Appearance request failed."); error.data = data; throw error; }
    return data;
  };

  const load = async (target = companyId) => {
    setLoading(true); setNotice(null);
    try {
      const includeCompanies = isPlatformAdmin && companies.length === 0 ? "&includeCompanies=1" : "";
      const data = await callApi(`/api/admin/appearance?companyId=${encodeURIComponent(target)}${includeCompanies}`);
      setState(data[section]);
      setDraft(section === "theme" ? normalizeGlobalTheme(data[section].draft) : normalizeContentLabels(data[section].draft));
      if (data.companies?.length) setCompanies(data.companies);
      setHistoryOpen(false);
    } catch (error) { setNotice({ type: "danger", text: error.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (authAccess.accessReady && authAccess.isAdmin) load(companyId); }, [authAccess.accessReady, authAccess.isAdmin, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const validation = useMemo(() => section === "theme" ? validateThemeContrast(draft) : validateContentLabels(draft), [draft, section]);
  const changes = changedCount(draft, state?.published || {});

  const mutate = async (method, payload, actionName) => {
    setBusy(actionName); setNotice(null);
    try {
      const data = await callApi("/api/admin/appearance", { method, body: JSON.stringify({ companyId, section, expectedVersion: state?.version || 0, ...payload }) });
      setState(data.section);
      setDraft(data.section.draft);
      setNotice({ type: "success", text: actionName === "publish" ? `Published version ${data.section.version}.` : actionName === "save" ? "Draft saved." : "Draft updated." });
      if (actionName === "publish") await runtimeAppearance.refresh();
    } catch (error) { setNotice({ type: "danger", text: error.message }); }
    finally { setBusy(""); }
  };

  const toggleHistory = async () => {
    if (historyOpen) { setHistoryOpen(false); return; }
    setHistoryOpen(true);
    if (state?.history?.length) return;
    setHistoryLoading(true);
    try {
      const data = await callApi(`/api/admin/appearance?companyId=${encodeURIComponent(companyId)}&history=${section}`);
      setState((current) => ({ ...current, history: data.history || [] }));
    } catch (error) { setNotice({ type: "danger", text: error.message }); }
    finally { setHistoryLoading(false); }
  };

  const title = section === "theme" ? "Global styling" : "Content & labels";
  const defaults = section === "theme" ? DEFAULT_GLOBAL_THEME : DEFAULT_CONTENT_LABELS;
  const dirty = JSON.stringify(draft) !== JSON.stringify(state?.draft || defaults);

  useEffect(() => { const warn = (event) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);

  if (authAccess.loading || loading) return <HeaderSidebarLayout><Page><div className={styles.loading}><Spinner /> Loading {title.toLowerCase()}…</div></Page></HeaderSidebarLayout>;
  if (!authAccess.isAdmin) return <HeaderSidebarLayout><Page width="readable"><Alert variant="danger">Only administrators can manage company appearance.</Alert></Page></HeaderSidebarLayout>;

  return <HeaderSidebarLayout><Page width="fluid">
    <PageHeader title={title} subtitle={section === "theme" ? "Create and publish the visual system used by this company." : "Manage safe, company-specific application wording without changing workflow or legal copy."} actions={<div className={styles.headerActions}><Button variant="secondary" onClick={() => router.push("/admin")}><ArrowLeft size={15} /> Admin</Button><Button variant="secondary" onClick={() => router.push(section === "theme" ? "/admin/content-labels" : "/admin/global-styling")}><Type size={15} /> {section === "theme" ? "Content & labels" : "Global styling"}</Button></div>} />
    <div className={styles.scopeBar}><label>Editing<Select value={companyId} onChange={(event) => setCompanyId(event.target.value)} disabled={!isPlatformAdmin}>{isPlatformAdmin && <option value={PLATFORM_APPEARANCE_ID}>Platform default</option>}{isPlatformAdmin ? companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>) : <option value={ownCompanyId}>{authAccess.userDoc?.companyName || ownCompanyId}</option>}</Select></label><div><Badge variant={changes ? "warning" : "success"}>{changes} unpublished change{changes === 1 ? "" : "s"}</Badge><Badge>Published v{state?.version || 0}</Badge></div></div>
    {notice && <Alert className={styles.notice} variant={notice.type}>{notice.text}</Alert>}
    <div className={styles.actionBar}><Button variant="secondary" onClick={() => setDraft(defaults)}><RotateCcw size={15} /> Restore defaults</Button><Button variant="secondary" onClick={() => mutate("POST", { action: "discard" }, "discard")} disabled={busy || !changes}>Discard draft</Button><Button variant="secondary" loading={busy === "save"} onClick={() => mutate("PATCH", { draft }, "save")} disabled={!dirty}><Save size={15} /> Save draft</Button><Button loading={busy === "publish"} onClick={() => mutate("POST", { action: "publish", draft }, "publish")} disabled={changes === 0 || !validation.valid}><Send size={15} /> Publish</Button></div>
    {section === "theme" && <div className={styles.validation}>{validation.checks.map((check) => <span key={check.id} data-pass={check.pass}><span>{check.pass ? <CheckCircle2 size={14} /> : <XCircle size={14} />}</span>{check.label}: {check.ratio}:1 {check.critical && !check.pass ? "(blocks publish)" : ""}</span>)}</div>}
    <div className={styles.editorLayout}><div className={styles.editorColumn}>{section === "theme" ? THEME_GROUPS.map((group) => <Card className={styles.groupCard} key={group.title}><h2>{group.title}</h2><div className={styles.fieldGrid}>{group.fields.map((field) => <FieldControl key={field[0]} field={field} value={draft[field[0]]} onChange={(name, value) => setDraft((current) => ({ ...current, [name]: value }))} />)}</div></Card>) : Object.entries(contentLabelGroups()).map(([group, fields]) => <Card className={styles.groupCard} key={group}><h2>{group}</h2><div className={styles.labelGrid}>{fields.map((field) => <label key={field.key}><span>{field.label}</span><input value={draft[field.key] || ""} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} /><small>Default: {field.fallback}</small></label>)}</div></Card>)}</div>
      <aside className={styles.sideColumn}>{section === "theme" ? <ThemePreview theme={normalizeGlobalTheme(draft)} /> : <Card className={styles.labelPreview}><h2>Label preview</h2><strong>{draft["app.name"]}</strong><nav>{["navigation.home", "navigation.bookings", "navigation.vehicles", "navigation.employees"].map((key) => <span key={key}>{draft[key]}</span>)}</nav><div><button>{draft["actions.save"]}</button><button>{draft["actions.cancel"]}</button></div><p>{draft["empty.noResults"]}</p></Card>}
        <Card className={styles.historyCard}><h2><History size={16} /> Version history</h2><Button size="sm" variant="secondary" onClick={toggleHistory} loading={historyLoading}>{historyOpen ? "Hide history" : "Load history"}</Button>{historyOpen && (state?.history?.length ? state.history.map((item) => <div key={item.version}><span><strong>Version {item.version}</strong><small><Clock3 size={12} /> {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "Published"}<br />{item.publishedBy}</small></span><Button size="sm" variant="secondary" onClick={() => mutate("POST", { action: "restore", version: item.version }, "restore")}>Restore to draft</Button></div>) : <p>No published versions yet.</p>)}</Card>
      </aside></div>
  </Page></HeaderSidebarLayout>;
}
