"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, RefreshCw, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { auth } from "../../../firebaseConfig";

const TONES = {
  high: { border: "var(--legacy-color-efb4b4)", background: "var(--legacy-color-fff5f5)", color: "var(--legacy-color-991b1b)" },
  medium: { border: "var(--legacy-color-f0cf88)", background: "var(--legacy-color-fffaf0)", color: "var(--legacy-color-92400e)" },
  neutral: { border: "var(--legacy-color-d7dee8)", background: "var(--legacy-color-fff)", color: "var(--legacy-color-0f172a)" },
};
const shell = { border: "1px solid var(--legacy-color-c8d6e3)", borderRadius: 10, background: "linear-gradient(180deg,var(--legacy-color-f8fbfe) 0%,var(--legacy-color-fff) 100%)", padding: 14, marginBottom: 12, boxShadow: "0 1px 2px rgba(15,23,42,.05)" };
const fmtDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
};

export default function DailyBriefingPanel({ onStateChange, hidden = false }) {
  const [state, setState] = useState({ loading: true, briefing: null, stale: false, setupRequired: false, canManageRules: false });
  const [feedback, setFeedback] = useState("");
  const [reason, setReason] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState("");

  const loadBriefing = useCallback(async (user) => {
    const token = await user.getIdToken();
    const response = await fetch("/api/statistics/daily-briefing", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Briefing unavailable.");
    const next = { loading: false, error: "", ...data };
    setState(next);
    onStateChange?.(next);
    return next;
  }, [onStateChange]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        if (!cancelled) await loadBriefing(user);
      } catch (error) {
        if (!cancelled) {
          setState((current) => {
            const next = { ...current, loading: false, error: error.message || "Briefing unavailable." };
            onStateChange?.(next);
            return next;
          });
        }
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [loadBriefing, onStateChange]);

  const refreshAnalysis = async () => {
    if (refreshing || !auth.currentUser) return;
    setRefreshing(true);
    setRefreshStatus("");
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/statistics/daily-briefing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Analysis could not be refreshed.");
      await loadBriefing(auth.currentUser);
      setRefreshStatus("Analysis refreshed.");
    } catch (error) {
      setRefreshStatus(error.message || "Analysis could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  };

  const submitFeedback = async () => {
    if (!feedback || !state.briefing) return;
    setFeedbackStatus("Saving...");
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/statistics/daily-briefing/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventType: "feedback", rating: feedback, reason, briefingDate: state.briefing.briefingDate, insightId: "briefing" }),
      });
      if (!response.ok) throw new Error("Feedback could not be saved.");
      setFeedbackStatus("Thank you — feedback saved.");
    } catch (error) {
      setFeedbackStatus(error.message || "Feedback could not be saved.");
    }
  };

  const recordAction = async (insightId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch("/api/statistics/daily-briefing/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventType: "action_clicked", briefingDate: state.briefing?.briefingDate, insightId }),
        keepalive: true,
      });
    } catch {
      // Navigation must never be blocked by optional analytics.
    }
  };

  if (hidden) return null;

  if (state.loading) return <section style={shell} aria-busy="true"><strong>Preparing today&apos;s Bickers briefing...</strong></section>;
  if (state.error) return <section style={shell}><strong>Daily briefing unavailable</strong><div style={{ marginTop: 5, color: "var(--legacy-color-5f6f82)" }}>{state.error}</div></section>;
  if (state.setupRequired) return (
    <section style={shell}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><BrainCircuit size={20} color="var(--legacy-color-1f4b7a)" /><div><strong>AI business rules need approval</strong><div style={{ marginTop: 4, color: "var(--legacy-color-5f6f82)", fontSize: 13 }}>The daily briefing stays off until an administrator reviews and publishes how Bickers operates.</div>{state.canManageRules ? <Link href="/settings/ai-business-rules" style={{ display: "inline-flex", gap: 5, alignItems: "center", marginTop: 8, color: "var(--legacy-color-1f4b7a)", fontWeight: 800, textDecoration: "none" }}>Review business rules <ArrowRight size={14} /></Link> : null}</div></div>
    </section>
  );
  if (!state.briefing) return (
    <section style={shell}>
      <strong>Today&apos;s briefing has not been generated yet.</strong>
      <div style={{ marginTop: 5, color: "var(--legacy-color-5f6f82)" }}>The scheduled briefing is prepared at 06:00 UK time.</div>
      {state.canManageRules ? (
        <button
          type="button"
          onClick={refreshAnalysis}
          disabled={refreshing}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, border: 0, background: "var(--legacy-color-1f4b7a)", color: "var(--legacy-color-fff)", borderRadius: 7, padding: "8px 11px", fontWeight: 800, cursor: refreshing ? "wait" : "pointer" }}
        >
          <RefreshCw size={14} />{refreshing ? "Generating analysis…" : "Generate analysis now"}
        </button>
      ) : null}
      {refreshStatus ? <div aria-live="polite" style={{ marginTop: 7, color: "var(--legacy-color-5f6f82)", fontSize: 12 }}>{refreshStatus}</div> : null}
    </section>
  );

  const briefing = state.briefing;
  return (
    <section style={shell} aria-labelledby="daily-briefing-title">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--legacy-color-1f4b7a)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}><BrainCircuit size={17} /> Today&apos;s Bickers Briefing</div>
          <h2 id="daily-briefing-title" style={{ margin: "7px 0 4px", fontSize: 20, color: "var(--legacy-color-0f172a)" }}>{briefing.headline}</h2>
          <p style={{ margin: 0, color: "var(--legacy-color-475569)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 900 }}>{briefing.summary}</p>
        </div>
        <div style={{ display: "grid", gap: 4, justifyItems: "end", color: "var(--legacy-color-5f6f82)", fontSize: 11.5 }}>
          <span>{state.stale ? <AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} /> : <CheckCircle2 size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />}{state.stale ? `Previous briefing from ${fmtDateTime(briefing.contentGeneratedAt || briefing.generatedAt)}` : `Generated ${fmtDateTime(briefing.generatedAt)}`}</span>
          <span><ShieldCheck size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Rules v{briefing.businessRulesVersion} · {briefing.variant === "management" ? "Management" : "Booking team"}</span>
          {briefing.status === "degraded" ? <span style={{ color: "var(--legacy-color-92400e)" }}>Deterministic fallback — AI explanation unavailable</span> : null}
          {state.canManageRules ? <button type="button" onClick={refreshAnalysis} disabled={refreshing} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3, border: "1px solid var(--legacy-color-c8d6e3)", background: "var(--legacy-color-fff)", borderRadius: 7, padding: "6px 8px", color: "var(--legacy-color-1f4b7a)", fontSize: 11.5, fontWeight: 800, cursor: refreshing ? "wait" : "pointer" }}><RefreshCw size={13} />{refreshing ? "Refreshing…" : "Refresh analysis"}</button> : null}
          {refreshStatus ? <span aria-live="polite">{refreshStatus}</span> : null}
        </div>
      </div>

      {briefing.currentHighlights?.length ? <div style={{ marginTop: 11, border: "1px solid var(--legacy-color-f0cf88)", background: "var(--legacy-color-fffaf0)", borderRadius: 8, padding: 9 }}><strong style={{ fontSize: 12.5 }}>Current verified metric highlights</strong><div style={{ display: "grid", gap: 4, marginTop: 5 }}>{briefing.currentHighlights.map((item) => <div key={item.id} style={{ fontSize: 11.5, color: "var(--legacy-color-475569)" }}>{item.title} — {(item.evidence || []).map((evidence) => evidence.text).join("; ")}</div>)}</div></div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))", gap: 10, marginTop: 13 }}>
        {(briefing.insights || []).map((insight) => {
          const colors = TONES[insight.severity] || TONES.neutral;
          return (
            <article key={insight.id} style={{ border: `1px solid ${colors.border}`, background: colors.background, borderRadius: 9, padding: 11, display: "flex", flexDirection: "column", minHeight: 215 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: "var(--legacy-color-0f172a)", lineHeight: 1.35 }}>{insight.title}</strong><span style={{ color: colors.color, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase" }}>{insight.type?.replaceAll("_", " ")}</span></div>
              <p style={{ color: "var(--legacy-color-475569)", fontSize: 12.5, lineHeight: 1.45, margin: "8px 0" }}>{insight.whyItMatters}</p>
              <div style={{ display: "grid", gap: 4 }}>{(insight.evidence || []).map((item) => <div key={item.id} style={{ fontSize: 11.5, fontWeight: 750, color: "var(--legacy-color-334155)" }}>{item.text}</div>)}</div>
              {insight.caveat ? <div style={{ color: "var(--legacy-color-64748b)", fontSize: 11, marginTop: 7 }}>Caveat: {insight.caveat}</div> : null}
              <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 10.5, color: "var(--legacy-color-64748b)" }}>Confidence: {insight.confidence}</span>
                {insight.action?.href ? <Link href={insight.action.href} onClick={() => recordAction(insight.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--legacy-color-1f4b7a)", fontSize: 12, fontWeight: 850, textDecoration: "none" }}>{insight.action.label}<ArrowRight size={13} /></Link> : null}
              </div>
            </article>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid var(--legacy-color-e2e8f0)", marginTop: 13, paddingTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800 }}>Was this briefing useful?</span>
          <button type="button" onClick={() => setFeedback("useful")} aria-pressed={feedback === "useful"} aria-label="Mark briefing useful" style={{ border: "1px solid var(--legacy-color-c8d6e3)", background: feedback === "useful" ? "var(--legacy-color-ecfdf5)" : "var(--legacy-color-fff)", borderRadius: 7, padding: "5px 8px", cursor: "pointer" }}><ThumbsUp size={14} /></button>
          <button type="button" onClick={() => setFeedback("not_useful")} aria-pressed={feedback === "not_useful"} aria-label="Mark briefing not useful" style={{ border: "1px solid var(--legacy-color-c8d6e3)", background: feedback === "not_useful" ? "var(--legacy-color-fff5f5)" : "var(--legacy-color-fff)", borderRadius: 7, padding: "5px 8px", cursor: "pointer" }}><ThumbsDown size={14} /></button>
          {feedback ? <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" aria-label="Optional feedback reason" style={{ minWidth: 220, flex: "1 1 260px", border: "1px solid var(--legacy-color-c8d6e3)", borderRadius: 7, padding: "6px 8px" }} /> : null}
          {feedback ? <button type="button" onClick={submitFeedback} style={{ border: 0, background: "var(--legacy-color-1f4b7a)", color: "var(--legacy-color-fff)", borderRadius: 7, padding: "7px 10px", fontWeight: 800, cursor: "pointer" }}>Send</button> : null}
          {feedbackStatus ? <span aria-live="polite" style={{ color: "var(--legacy-color-5f6f82)", fontSize: 12 }}>{feedbackStatus}</span> : null}
        </div>
      </div>
    </section>
  );
}
