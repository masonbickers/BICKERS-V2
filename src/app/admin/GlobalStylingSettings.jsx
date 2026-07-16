"use client";

import { useEffect, useMemo, useState } from "react";
import { auth } from "../../../firebaseConfig";
import { THEME_UPDATED_EVENT } from "@/app/components/GlobalThemeProvider";
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  THEME_SETTING_FIELDS,
} from "@/app/utils/themeSettings";

const groups = [...new Set(THEME_SETTING_FIELDS.map((field) => field.group))];

export default function GlobalStylingSettings() {
  const [draft, setDraft] = useState({ ...DEFAULT_THEME_SETTINGS });
  const [saved, setSaved] = useState({ ...DEFAULT_THEME_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/theme", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load global styling.");
        const data = await response.json();
        const theme = normalizeThemeSettings(data.theme);
        if (!cancelled) {
          setDraft(theme);
          setSaved(theme);
        }
      } catch (error) {
        if (!cancelled) setNotice({ type: "error", message: error?.message || "Could not load global styling." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const user = auth.currentUser;
    if (!user) {
      setNotice({ type: "error", message: "You need to sign in again." });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/theme", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ theme: draft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Could not save global styling.");
      const theme = normalizeThemeSettings(data.theme);
      setDraft(theme);
      setSaved(theme);
      window.dispatchEvent(new CustomEvent(THEME_UPDATED_EVENT, { detail: theme }));
      setNotice({ type: "success", message: "Global styling saved and applied." });
    } catch (error) {
      setNotice({ type: "error", message: error?.message || "Could not save global styling." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section style={card}>Loading global styling…</section>;

  return (
    <div style={layout}>
      <section style={card}>
        <div style={sectionHeader}>
          <div>
            <h2 style={heading}>Global Styling</h2>
            <p style={subheading}>These defaults are applied across the live application. Existing specialist page styles can still override them.</p>
          </div>
          <span style={{ ...status, ...(hasChanges ? statusChanged : statusSaved) }}>
            {hasChanges ? "Unsaved changes" : "Saved"}
          </span>
        </div>

        {notice ? (
          <div role={notice.type === "error" ? "alert" : "status"} style={{ ...noticeStyle, ...(notice.type === "error" ? noticeError : noticeSuccess) }}>
            {notice.message}
          </div>
        ) : null}

        <div style={groupsLayout}>
          {groups.map((group) => (
            <fieldset key={group} style={fieldset}>
              <legend style={legend}>{group}</legend>
              <div style={fieldGrid}>
                {THEME_SETTING_FIELDS.filter((field) => field.group === group).map((field) => (
                  <label key={field.key} style={fieldLabel}>
                    <span>{field.label}</span>
                    {field.type === "color" ? (
                      <span style={colorControl}>
                        <input
                          aria-label={`${field.label} colour picker`}
                          type="color"
                          value={draft[field.key]}
                          onChange={(event) => patch(field.key, event.target.value)}
                          style={colorPicker}
                        />
                        <input
                          value={draft[field.key]}
                          onChange={(event) => patch(field.key, event.target.value)}
                          pattern="#[0-9a-fA-F]{6}"
                          maxLength={7}
                          style={textInput}
                        />
                      </span>
                    ) : (
                      <span style={numberControl}>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          value={draft[field.key]}
                          onChange={(event) => patch(field.key, Number(event.target.value))}
                          style={numberInput}
                        />
                        <span style={unit}>{field.unit}</span>
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div style={actions}>
          <button type="button" onClick={() => setDraft({ ...DEFAULT_THEME_SETTINGS })} style={secondaryButton}>
            Use defaults
          </button>
          <button type="button" onClick={() => setDraft(saved)} disabled={!hasChanges || saving} style={{ ...primaryButton, opacity: !hasChanges || saving ? 0.55 : 1 }}>
            Discard changes
          </button>
          <button type="button" onClick={save} disabled={!hasChanges || saving} style={{ ...saveButton, opacity: !hasChanges || saving ? 0.55 : 1 }}>
            {saving ? "Saving…" : "Save and apply"}
          </button>
        </div>
      </section>

      <aside style={{ ...card, position: "sticky", top: 12, alignSelf: "start" }}>
        <h2 style={heading}>Preview</h2>
        <p style={subheading}>A representative preview of the current unsaved values.</p>
        <div style={{ ...preview, background: draft.canvasColor, color: draft.textColor, fontSize: draft.baseFontSize }}>
          <div style={{ ...previewSidebar, background: draft.sidebarColor }} />
          <div style={previewContent}>
            <strong>Example page</strong>
            <span style={{ color: draft.mutedTextColor }}>Cards, controls and status colours</span>
            <div style={{ ...previewCard, background: draft.surfaceColor, borderColor: draft.borderColor, borderRadius: draft.cornerRadius }}>
              <span style={{ ...previewChip, color: draft.brandColor, background: draft.brandSoftColor, borderColor: draft.brandBorderColor }}>Active</span>
              <button type="button" style={{ ...previewButton, minHeight: draft.controlHeight, borderRadius: draft.cornerRadius, background: draft.brandColor }}>Primary action</button>
              <div style={statusRow}>
                <i style={{ ...statusDot, background: draft.successColor }} />
                <i style={{ ...statusDot, background: draft.warningColor }} />
                <i style={{ ...statusDot, background: draft.dangerColor }} />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

const layout = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12, alignItems: "start" };
const card = { padding: 14, background: "var(--color-surface)", border: "var(--border-default)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" };
const sectionHeader = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" };
const heading = { margin: 0, color: "var(--color-text)", fontSize: 18 };
const subheading = { margin: "5px 0 0", maxWidth: 720, color: "var(--color-text-muted)", fontSize: 13 };
const status = { padding: "5px 9px", border: "1px solid", borderRadius: 999, fontSize: 12, fontWeight: 800 };
const statusChanged = { color: "var(--color-warning)", background: "var(--color-warning-soft)", borderColor: "var(--color-warning-border)" };
const statusSaved = { color: "var(--color-success)", background: "var(--color-success-soft)", borderColor: "var(--color-success-border)" };
const noticeStyle = { marginTop: 12, padding: "9px 11px", border: "1px solid", borderRadius: "var(--radius-md)", fontWeight: 700 };
const noticeSuccess = { color: "var(--color-success)", background: "var(--color-success-soft)", borderColor: "var(--color-success-border)" };
const noticeError = { color: "var(--color-danger)", background: "var(--color-danger-soft)", borderColor: "var(--color-danger-border)" };
const groupsLayout = { display: "grid", gap: 12, marginTop: 14 };
const fieldset = { padding: 12, border: "var(--border-default)", borderRadius: "var(--radius-md)" };
const legend = { padding: "0 5px", color: "var(--color-text)", fontWeight: 800 };
const fieldGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 };
const fieldLabel = { display: "grid", gap: 5, color: "var(--color-text-muted)", fontSize: 12, fontWeight: 800 };
const colorControl = { display: "grid", gridTemplateColumns: "42px minmax(0, 1fr)", gap: 6 };
const colorPicker = { width: 42, height: 36, padding: 3, border: "var(--control-border)", borderRadius: "var(--control-radius)", background: "var(--color-surface)" };
const textInput = { minWidth: 0, height: 36, padding: "7px 9px", border: "var(--control-border)", borderRadius: "var(--control-radius)", background: "var(--color-surface)", color: "var(--color-text)", fontFamily: "var(--font-mono)" };
const numberControl = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 34px", alignItems: "center", border: "var(--control-border)", borderRadius: "var(--control-radius)", overflow: "hidden" };
const numberInput = { minWidth: 0, height: 34, padding: "7px 9px", border: 0, background: "var(--color-surface)", color: "var(--color-text)" };
const unit = { color: "var(--color-text-muted)", fontSize: 12, textAlign: "center" };
const actions = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, flexWrap: "wrap" };
const secondaryButton = { minHeight: 36, padding: "0 11px", border: "var(--control-border)", borderRadius: "var(--control-radius)", background: "var(--color-surface)", color: "var(--color-text)", fontWeight: 800 };
const primaryButton = { ...secondaryButton, color: "var(--color-brand)", borderColor: "var(--color-brand-border)", background: "var(--color-brand-soft)" };
const saveButton = { ...secondaryButton, color: "var(--color-text-inverse)", borderColor: "var(--color-brand)", background: "var(--color-brand)" };
const preview = { display: "grid", gridTemplateColumns: "52px 1fr", minHeight: 250, marginTop: 12, overflow: "hidden", border: "var(--border-default)", borderRadius: 10 };
const previewSidebar = { minHeight: "100%" };
const previewContent = { display: "flex", flexDirection: "column", gap: 7, padding: 12 };
const previewCard = { display: "grid", gap: 10, padding: 12, border: "1px solid" };
const previewChip = { width: "fit-content", padding: "4px 8px", border: "1px solid", borderRadius: 999, fontSize: 11, fontWeight: 800 };
const previewButton = { padding: "0 10px", border: 0, color: "#ffffff", fontWeight: 800 };
const statusRow = { display: "flex", gap: 7 };
const statusDot = { width: 14, height: 14, borderRadius: 999 };
