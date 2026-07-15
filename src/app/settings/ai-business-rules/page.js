"use client";

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
const field = { width: "100%", border: "1px solid var(--legacy-color-c8d6e3)", borderRadius: 8, padding: "9px 10px", color: "var(--legacy-color-0f172a)", background: "var(--legacy-color-fff)", boxSizing: "border-box", font: "inherit" };
const label = { display: "grid", gap: 6, color: "var(--legacy-color-334155)", fontSize: 12.5, fontWeight: 850 };
const card = { background: "var(--legacy-color-fff)", border: "1px solid var(--legacy-color-d7dee8)", borderRadius: 10, padding: 14, boxShadow: "0 1px 2px rgba(15,23,42,.05)" };
const button = { border: "1px solid var(--legacy-color-1f4b7a)", borderRadius: 8, background: "var(--legacy-color-1f4b7a)", color: "var(--legacy-color-fff)", padding: "8px 11px", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 850, cursor: "pointer" };

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
      <main style={{ minHeight: "100vh", background: "var(--legacy-color-f3f6f9)", padding: "18px 16px 34px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <Link href="/settings" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--legacy-color-1f4b7a)", textDecoration: "none", fontWeight: 800, fontSize: 13 }}><ArrowLeft size={15} /> Settings</Link>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start", margin: "12px 0 14px" }}>
            <div><h1 style={{ margin: 0, color: "var(--legacy-color-0f172a)", fontSize: 24, display: "flex", alignItems: "center", gap: 8 }}><BrainCircuit color="var(--legacy-color-1f4b7a)" /> AI Business Rules</h1><p style={{ color: "var(--legacy-color-5f6f82)", margin: "6px 0 0", maxWidth: 760, lineHeight: 1.5 }}>This is the approved operating model used to interpret Bickers statistics. AI cannot publish these rules or change business records.</p></div>
            <div style={{ ...card, padding: "8px 10px", fontSize: 12 }}><ShieldCheck size={15} style={{ verticalAlign: "-3px", marginRight: 5, color: "var(--legacy-color-166534)" }} />{published ? `Published version ${published.version}` : "Not published — daily AI briefing disabled"}</div>
          </div>

          {loading ? <div style={card}>Loading business rules...</div> : null}
          {error ? <div role="alert" style={{ ...card, background: "var(--legacy-color-fff5f5)", borderColor: "var(--legacy-color-efb4b4)", color: "var(--legacy-color-991b1b)", marginBottom: 12 }}>{error}</div> : null}
          {notice ? <div aria-live="polite" style={{ ...card, background: "var(--legacy-color-ecfdf5)", borderColor: "var(--legacy-color-bbf7d0)", color: "var(--legacy-color-166534)", marginBottom: 12 }}>{notice}</div> : null}

          {!loading ? <div className="ai-rules-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
              <section style={card}><h2 style={{ margin: "0 0 10px", fontSize: 17 }}>Business and services</h2><div style={{ display: "grid", gap: 10 }}>
                <label style={label}>How Bickers operates<textarea rows={5} style={field} value={rules.businessProfile || ""} onChange={(event) => update("businessProfile", event.target.value)} /></label>
                <label style={label}>Services — one per line<textarea rows={6} style={field} value={joinLines(rules.services)} onChange={(event) => update("services", splitLines(event.target.value))} /></label>
              </div></section>

              <section style={card}><h2 style={{ margin: "0 0 5px", fontSize: 17 }}>Canonical booking lifecycle</h2><p style={{ margin: "0 0 10px", color: "var(--legacy-color-64748b)", fontSize: 12.5 }}>The order is protected because analytics and workflow state depend on it.</p><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{rules.lifecycle.map((stage) => <span key={stage} style={{ border: "1px solid var(--legacy-color-c8d6e3)", background: "var(--legacy-color-edf3f8)", borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 800 }}>{stage}</span>)}</div><div style={{ display: "grid", gap: 8, marginTop: 12 }}>{Object.entries(rules.glossary || {}).map(([key, value]) => <label key={key} style={label}>{key}<input style={field} value={value} onChange={(event) => updateMap("glossary", key, event.target.value)} /></label>)}</div></section>

              <section style={card}><h2 style={{ margin: "0 0 10px", fontSize: 17 }}>Completion and recommendation rules</h2><div style={{ display: "grid", gap: 10 }}>
                <label style={label}>Booking and job completion criteria<textarea rows={7} style={field} value={joinLines(rules.completionCriteria)} onChange={(event) => update("completionCriteria", splitLines(event.target.value))} /></label>
                <label style={label}>Scheduling rules<textarea rows={6} style={field} value={joinLines(rules.schedulingRules)} onChange={(event) => update("schedulingRules", splitLines(event.target.value))} /></label>
                <label style={label}>Recommendation guidance<textarea rows={5} style={field} value={joinLines(rules.recommendationGuidance)} onChange={(event) => update("recommendationGuidance", splitLines(event.target.value))} /></label>
                <label style={label}>Prohibited assumptions<textarea rows={6} style={field} value={joinLines(rules.prohibitedAssumptions)} onChange={(event) => update("prohibitedAssumptions", splitLines(event.target.value))} /></label>
              </div></section>

              <section style={card}><h2 style={{ margin: "0 0 10px", fontSize: 17 }}>Approved metrics and thresholds</h2><div style={{ display: "grid", gap: 8 }}>{Object.entries(rules.metricDefinitions || {}).map(([key, value]) => <label key={key} style={label}>{key}<input style={field} value={value} onChange={(event) => updateMap("metricDefinitions", key, event.target.value)} /></label>)}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 9, marginTop: 12 }}>{Object.entries(rules.thresholds || {}).map(([key, value]) => <label key={key} style={label}>{key}<input type="number" min="0" style={field} value={value} onChange={(event) => updateMap("thresholds", key, Number(event.target.value))} /></label>)}</div></section>
            </div>

            <aside className="ai-rules-aside" style={{ display: "grid", gap: 12, position: "sticky", top: 12 }}>
              <section style={card}><h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Validation</h2>{validation.valid ? <div style={{ color: "var(--legacy-color-166534)", fontWeight: 800 }}><CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 5 }} />Ready to publish</div> : <ul style={{ color: "var(--legacy-color-991b1b)", paddingLeft: 18, margin: 0 }}>{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>}</section>
              <section style={card}><h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Interpretation preview</h2><div style={{ fontSize: 12.5, lineHeight: 1.5 }}><strong>Sample status:</strong> {preview.status}<br /><strong>Meaning:</strong> {preview.interpretation}<br /><strong>Readiness:</strong> {preview.readiness}{preview.gaps.length ? <><br /><strong>Gaps:</strong> {preview.gaps.join(", ")}</> : null}</div></section>
              <section style={card}><label style={label}>Change summary<textarea rows={3} style={field} value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} placeholder="What changed and why?" /></label><div style={{ display: "grid", gap: 8, marginTop: 10 }}><button type="button" disabled={saving || !validation.valid} onClick={saveDraft} style={{ ...button, opacity: saving || !validation.valid ? .55 : 1 }}><Save size={15} /> Save draft</button><button type="button" disabled={saving || !validation.valid} onClick={publish} style={{ ...button, background: "var(--legacy-color-166534)", borderColor: "var(--legacy-color-166534)", opacity: saving || !validation.valid ? .55 : 1 }}><ShieldCheck size={15} /> Publish approved rules</button><button type="button" disabled={saving || !published} onClick={generate} style={{ ...button, background: "var(--legacy-color-fff)", color: "var(--legacy-color-1f4b7a)", opacity: saving || !published ? .55 : 1 }}><Play size={15} /> Generate today&apos;s briefing</button></div></section>
            </aside>
          </div> : null}
        </div>
      </main>
    </HeaderSidebarLayout>
  );
}
