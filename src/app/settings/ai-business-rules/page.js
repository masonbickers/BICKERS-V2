"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { ArrowLeft, BrainCircuit, CheckCircle2, Play, Save, ShieldCheck } from "lucide-react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  DEFAULT_BICKERS_BUSINESS_RULES,
  mergeBickersBusinessRules,
  previewBookingInterpretation,
  validateBickersBusinessRules,
} from "@/app/utils/bickersBusinessRules";
import { auth } from "../../../../firebaseConfig";

const splitLines = (value) => String(value || "").split("\n").map((item) => item.trim()).filter(Boolean);
const joinLines = (value) => Array.isArray(value) ? value.join("\n") : "";
const field = { width: "100%", border: "1px solid var(--color-border-strong)", borderRadius: 8, padding: "9px 10px", color: "var(--color-text)", background: "var(--color-surface)", boxSizing: "border-box", font: "inherit" };
const label = { display: "grid", gap: 6, color: "var(--color-text-muted)", fontSize: 12.5, fontWeight: 850 };
const card = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 14, boxShadow: "0 1px 2px rgba(15,23,42,.05)" };
const button = { border: "1px solid var(--color-brand)", borderRadius: 8, background: "var(--color-brand)", color: "var(--color-surface)", padding: "8px 11px", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 850, cursor: "pointer" };

export default function AiBusinessRulesPage() {
  const [rules, setRules] = useState(mergeBickersBusinessRules(DEFAULT_BICKERS_BUSINESS_RULES));
  const [published, setPublished] = useState(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const validation = useMemo(() => validateBickersBusinessRules(rules), [rules]);
  const preview = useMemo(() => previewBookingInterpretation({ status: "Complete", jobNumber: "1234", bookingDates: ["2026-07-15"], hasQuote: true, hasHS: true }, rules), [rules]);

  const request = async (path, options = {}) => {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const data = await request("/api/statistics/business-rules");
        if (!cancelled) {
          setRules(mergeBickersBusinessRules(data.draft?.rules));
          setPublished(data.published || null);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || "Business rules could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const update = (key, value) => setRules((current) => ({ ...current, [key]: value }));
  const updateMap = (key, itemKey, value) => setRules((current) => ({ ...current, [key]: { ...(current[key] || {}), [itemKey]: value } }));

  const saveDraft = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await request("/api/statistics/business-rules", { method: "PATCH", body: JSON.stringify({ rules, changeSummary }) });
      setRules(mergeBickersBusinessRules(data.draft?.rules));
      setNotice("Draft saved. The published rules and current briefings are unchanged.");
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  const publish = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await request("/api/statistics/business-rules", { method: "POST", body: JSON.stringify({ rules, changeSummary }) });
      setPublished(data.published || null);
      setRules(mergeBickersBusinessRules(data.draft?.rules));
      setNotice(`Business rules version ${data.published?.version} published. Generate today’s briefing when ready.`);
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  const generate = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await request("/api/statistics/daily-briefing/generate", { method: "POST", body: JSON.stringify({ force: true }) });
      setNotice(data.skipped ? data.reason : "Today’s management and booking-team briefings were generated.");
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  return (
    <HeaderSidebarLayout>
      <style>{`@media (max-width: 850px) { .ai-rules-layout { grid-template-columns: 1fr !important; } .ai-rules-aside { position: static !important; } }`}</style>
      <main className={layoutStyles.extracted1}>
        <div className={layoutStyles.extracted2}>
          <Link href="/settings" className={layoutStyles.extracted3}><ArrowLeft size={15} /> Settings</Link>
          <div className={layoutStyles.extracted4}>
            <div><h1 className={layoutStyles.extracted5}><BrainCircuit color="var(--color-brand)" /> AI Business Rules</h1><p className={layoutStyles.extracted6}>This is the approved operating model used to interpret Bickers statistics. AI cannot publish these rules or change business records.</p></div>
            <div className={layoutStyles.extracted7}><ShieldCheck size={15} className={layoutStyles.extracted8} />{published ? `Published version ${published.version}` : "Not published — daily AI briefing disabled"}</div>
          </div>

          {loading ? <div className={layoutStyles.extracted9}>Loading business rules...</div> : null}
          {error ? <div role="alert" className={layoutStyles.extracted10}>{error}</div> : null}
          {notice ? <div aria-live="polite" className={layoutStyles.extracted11}>{notice}</div> : null}

          {!loading ? <div className={`ai-rules-layout ${layoutStyles.extracted12}`} >
            <div className={layoutStyles.extracted13}>
              <section className={layoutStyles.extracted14}><h2 className={layoutStyles.extracted15}>Business and services</h2><div className={layoutStyles.extracted16}>
                <label className={layoutStyles.extracted17}>How Bickers operates<textarea rows={5} className={layoutStyles.extracted18} value={rules.businessProfile || ""} onChange={(event) => update("businessProfile", event.target.value)} /></label>
                <label className={layoutStyles.extracted19}>Services — one per line<textarea rows={6} className={layoutStyles.extracted20} value={joinLines(rules.services)} onChange={(event) => update("services", splitLines(event.target.value))} /></label>
              </div></section>

              <section className={layoutStyles.extracted21}><h2 className={layoutStyles.extracted22}>Canonical booking lifecycle</h2><p className={layoutStyles.extracted23}>The order is protected because analytics and workflow state depend on it.</p><div className={layoutStyles.extracted24}>{rules.lifecycle.map((stage) => <span key={stage} className={layoutStyles.extracted25}>{stage}</span>)}</div><div className={layoutStyles.extracted26}>{Object.entries(rules.glossary || {}).map(([key, value]) => <label key={key} className={layoutStyles.extracted27}>{key}<input className={layoutStyles.extracted28} value={value} onChange={(event) => updateMap("glossary", key, event.target.value)} /></label>)}</div></section>

              <section className={layoutStyles.extracted29}><h2 className={layoutStyles.extracted30}>Completion and recommendation rules</h2><div className={layoutStyles.extracted31}>
                <label className={layoutStyles.extracted32}>Booking and job completion criteria<textarea rows={7} className={layoutStyles.extracted33} value={joinLines(rules.completionCriteria)} onChange={(event) => update("completionCriteria", splitLines(event.target.value))} /></label>
                <label className={layoutStyles.extracted34}>Scheduling rules<textarea rows={6} className={layoutStyles.extracted35} value={joinLines(rules.schedulingRules)} onChange={(event) => update("schedulingRules", splitLines(event.target.value))} /></label>
                <label className={layoutStyles.extracted36}>Recommendation guidance<textarea rows={5} className={layoutStyles.extracted37} value={joinLines(rules.recommendationGuidance)} onChange={(event) => update("recommendationGuidance", splitLines(event.target.value))} /></label>
                <label className={layoutStyles.extracted38}>Prohibited assumptions<textarea rows={6} className={layoutStyles.extracted39} value={joinLines(rules.prohibitedAssumptions)} onChange={(event) => update("prohibitedAssumptions", splitLines(event.target.value))} /></label>
              </div></section>

              <section className={layoutStyles.extracted40}><h2 className={layoutStyles.extracted41}>Approved metrics and thresholds</h2><div className={layoutStyles.extracted42}>{Object.entries(rules.metricDefinitions || {}).map(([key, value]) => <label key={key} className={layoutStyles.extracted43}>{key}<input className={layoutStyles.extracted44} value={value} onChange={(event) => updateMap("metricDefinitions", key, event.target.value)} /></label>)}</div><div className={layoutStyles.extracted45}>{Object.entries(rules.thresholds || {}).map(([key, value]) => <label key={key} className={layoutStyles.extracted46}>{key}<input type="number" min="0" className={layoutStyles.extracted47} value={value} onChange={(event) => updateMap("thresholds", key, Number(event.target.value))} /></label>)}</div></section>
            </div>

            <aside className={`ai-rules-aside ${layoutStyles.extracted48}`} >
              <section className={layoutStyles.extracted49}><h2 className={layoutStyles.extracted50}>Validation</h2>{validation.valid ? <div className={layoutStyles.extracted51}><CheckCircle2 size={16} className={layoutStyles.extracted52} />Ready to publish</div> : <ul className={layoutStyles.extracted53}>{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>}</section>
              <section className={layoutStyles.extracted54}><h2 className={layoutStyles.extracted55}>Interpretation preview</h2><div className={layoutStyles.extracted56}><strong>Sample status:</strong> {preview.status}<br /><strong>Meaning:</strong> {preview.interpretation}<br /><strong>Readiness:</strong> {preview.readiness}{preview.gaps.length ? <><br /><strong>Gaps:</strong> {preview.gaps.join(", ")}</> : null}</div></section>
              <section className={layoutStyles.extracted57}><label className={layoutStyles.extracted58}>Change summary<textarea rows={3} className={layoutStyles.extracted59} value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} placeholder="What changed and why?" /></label><div className={layoutStyles.extracted60}><button type="button" disabled={saving || !validation.valid} onClick={saveDraft} style={{ ...button, opacity: saving || !validation.valid ? .55 : 1 }}><Save size={15} /> Save draft</button><button type="button" disabled={saving || !validation.valid} onClick={publish} style={{ ...button, background: "var(--color-success)", borderColor: "var(--color-success)", opacity: saving || !validation.valid ? .55 : 1 }}><ShieldCheck size={15} /> Publish approved rules</button><button type="button" disabled={saving || !published} onClick={generate} style={{ ...button, background: "var(--color-surface)", color: "var(--color-brand)", opacity: saving || !published ? .55 : 1 }}><Play size={15} /> Generate today&apos;s briefing</button></div></section>
            </aside>
          </div> : null}
        </div>
      </main>
    </HeaderSidebarLayout>
  );
}
