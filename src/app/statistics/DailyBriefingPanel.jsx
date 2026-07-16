"use client";

import layoutStyles from "./DailyBriefingPanel.styles.module.css";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, RefreshCw, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { auth } from "../../../firebaseConfig";

const TONES = {
  high: { border: "var(--color-danger-border)", background: "var(--color-danger-soft)", color: "var(--color-danger)" },
  medium: { border: "var(--color-warning-border)", background: "var(--color-warning-soft)", color: "var(--color-warning)" },
  neutral: { border: "var(--color-border)", background: "var(--color-surface)", color: "var(--shell-sidebar-bg)" },
};
const shell = { border: "1px solid var(--color-border-strong)", borderRadius: 10, background: "linear-gradient(180deg,var(--color-surface-subtle) 0%,var(--color-surface) 100%)", padding: 14, marginBottom: 12, boxShadow: "0 1px 2px rgba(15,23,42,.05)" };
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

  if (state.loading) return <section className={layoutStyles.extracted1} aria-busy="true"><strong>Preparing today&apos;s Bickers briefing...</strong></section>;
  if (state.error) return <section className={layoutStyles.extracted2}><strong>Daily briefing unavailable</strong><div className={layoutStyles.extracted3}>{state.error}</div></section>;
  if (state.setupRequired) return (
    <section className={layoutStyles.extracted4}>
      <div className={layoutStyles.extracted5}><BrainCircuit size={20} color="var(--color-brand)" /><div><strong>AI business rules need approval</strong><div className={layoutStyles.extracted6}>The daily briefing stays off until an administrator reviews and publishes how Bickers operates.</div>{state.canManageRules ? <Link href="/settings/ai-business-rules" className={layoutStyles.extracted7}>Review business rules <ArrowRight size={14} /></Link> : null}</div></div>
    </section>
  );
  if (!state.briefing) return (
    <section className={layoutStyles.extracted8}>
      <strong>Today&apos;s briefing has not been generated yet.</strong>
      <div className={layoutStyles.extracted9}>The scheduled briefing is prepared at 06:00 UK time.</div>
      {state.canManageRules ? (
        <button
          type="button"
          onClick={refreshAnalysis}
          disabled={refreshing}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, border: 0, background: "var(--color-brand)", color: "var(--color-surface)", borderRadius: 7, padding: "8px 11px", fontWeight: 800, cursor: refreshing ? "wait" : "pointer" }}
        >
          <RefreshCw size={14} />{refreshing ? "Generating analysis…" : "Generate analysis now"}
        </button>
      ) : null}
      {refreshStatus ? <div aria-live="polite" className={layoutStyles.extracted10}>{refreshStatus}</div> : null}
    </section>
  );

  const briefing = state.briefing;
  return (
    <section className={layoutStyles.extracted11} aria-labelledby="daily-briefing-title">
      <div className={layoutStyles.extracted12}>
        <div>
          <div className={layoutStyles.extracted13}><BrainCircuit size={17} /> Today&apos;s Bickers Briefing</div>
          <h2 id="daily-briefing-title" className={layoutStyles.extracted14}>{briefing.headline}</h2>
          <p className={layoutStyles.extracted15}>{briefing.summary}</p>
        </div>
        <div className={layoutStyles.extracted16}>
          <span>{state.stale ? <AlertTriangle size={13} className={layoutStyles.extracted17} /> : <CheckCircle2 size={13} className={layoutStyles.extracted18} />}{state.stale ? `Previous briefing from ${fmtDateTime(briefing.contentGeneratedAt || briefing.generatedAt)}` : `Generated ${fmtDateTime(briefing.generatedAt)}`}</span>
          <span><ShieldCheck size={13} className={layoutStyles.extracted19} />Rules v{briefing.businessRulesVersion} · {briefing.variant === "management" ? "Management" : "Booking team"}</span>
          {briefing.status === "degraded" ? <span className={layoutStyles.extracted20}>Deterministic fallback — AI explanation unavailable</span> : null}
          {state.canManageRules ? <button type="button" onClick={refreshAnalysis} disabled={refreshing} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3, border: "1px solid var(--color-border-strong)", background: "var(--color-surface)", borderRadius: 7, padding: "6px 8px", color: "var(--color-brand)", fontSize: 11.5, fontWeight: 800, cursor: refreshing ? "wait" : "pointer" }}><RefreshCw size={13} />{refreshing ? "Refreshing…" : "Refresh analysis"}</button> : null}
          {refreshStatus ? <span aria-live="polite">{refreshStatus}</span> : null}
        </div>
      </div>

      {briefing.currentHighlights?.length ? <div className={layoutStyles.extracted21}><strong className={layoutStyles.extracted22}>Current verified metric highlights</strong><div className={layoutStyles.extracted23}>{briefing.currentHighlights.map((item) => <div key={item.id} className={layoutStyles.extracted24}>{item.title} — {(item.evidence || []).map((evidence) => evidence.text).join("; ")}</div>)}</div></div> : null}

      <div className={layoutStyles.extracted25}>
        {(briefing.insights || []).map((insight) => {
          const colors = TONES[insight.severity] || TONES.neutral;
          return (
            <article key={insight.id} style={{ border: `1px solid ${colors.border}`, background: colors.background, borderRadius: 9, padding: 11, display: "flex", flexDirection: "column", minHeight: 215 }}>
              <div className={layoutStyles.extracted26}><strong className={layoutStyles.extracted27}>{insight.title}</strong><span style={{ color: colors.color, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase" }}>{insight.type?.replaceAll("_", " ")}</span></div>
              <p className={layoutStyles.extracted28}>{insight.whyItMatters}</p>
              <div className={layoutStyles.extracted29}>{(insight.evidence || []).map((item) => <div key={item.id} className={layoutStyles.extracted30}>{item.text}</div>)}</div>
              {insight.caveat ? <div className={layoutStyles.extracted31}>Caveat: {insight.caveat}</div> : null}
              <div className={layoutStyles.extracted32}>
                <span className={layoutStyles.extracted33}>Confidence: {insight.confidence}</span>
                {insight.action?.href ? <Link href={insight.action.href} onClick={() => recordAction(insight.id)} className={layoutStyles.extracted34}>{insight.action.label}<ArrowRight size={13} /></Link> : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className={layoutStyles.extracted35}>
        <div className={layoutStyles.extracted36}>
          <span className={layoutStyles.extracted37}>Was this briefing useful?</span>
          <button type="button" onClick={() => setFeedback("useful")} aria-pressed={feedback === "useful"} aria-label="Mark briefing useful" style={{ border: "1px solid var(--color-border-strong)", background: feedback === "useful" ? "var(--color-success-soft)" : "var(--color-surface)", borderRadius: 7, padding: "5px 8px", cursor: "pointer" }}><ThumbsUp size={14} /></button>
          <button type="button" onClick={() => setFeedback("not_useful")} aria-pressed={feedback === "not_useful"} aria-label="Mark briefing not useful" style={{ border: "1px solid var(--color-border-strong)", background: feedback === "not_useful" ? "var(--color-danger-soft)" : "var(--color-surface)", borderRadius: 7, padding: "5px 8px", cursor: "pointer" }}><ThumbsDown size={14} /></button>
          {feedback ? <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" aria-label="Optional feedback reason" className={layoutStyles.extracted38} /> : null}
          {feedback ? <button type="button" onClick={submitFeedback} className={layoutStyles.extracted39}>Send</button> : null}
          {feedbackStatus ? <span aria-live="polite" className={layoutStyles.extracted40}>{feedbackStatus}</span> : null}
        </div>
      </div>
    </section>
  );
}
