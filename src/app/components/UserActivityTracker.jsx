"use client";

import layoutStyles from "./UserActivityTracker.styles.module.css";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { auth } from "@/app/utils/firebaseClient";
import { MEANINGFUL_ACTIVITY_EVENT } from "@/app/utils/activityTrackingClient";

const HEARTBEAT_MS = 5 * 60 * 1000;
const DEFAULT_IDLE_MS = 10 * 60 * 1000;
const PUBLIC_OR_EXCLUDED = ["/", "/login", "/auth", "/quote-view"];

const newSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isExcluded = (pathname) =>
  PUBLIC_OR_EXCLUDED.some((path) => pathname === path || String(pathname || "").startsWith(`${path}/`));

export default function UserActivityTracker() {
  const pathname = usePathname();
  const [notice, setNotice] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const idleMsRef = useRef(DEFAULT_IDLE_MS);
  const lastInteractionRef = useRef(Date.now());
  const actionCountRef = useRef(0);
  const sessionIdRef = useRef(newSessionId());
  const sessionDateRef = useRef(new Date().toISOString().slice(0, 10));
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    lastInteractionRef.current = Date.now();
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const currentDate = new Date().toISOString().slice(0, 10);
        if (sessionDateRef.current !== currentDate) {
          sessionDateRef.current = currentDate;
          sessionIdRef.current = newSessionId();
        }
        const token = await user.getIdToken();
        const response = await fetch("/api/activity/heartbeat", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        setEnabled(data.enabled === true);
        idleMsRef.current = Math.max(5, Number(data.idleMinutes) || 10) * 60 * 1000;
        if (data.noticeRequired) setNotice({ version: data.policyVersion });
      } catch {
        // Tracking must never interrupt operational work.
      }
    };
    void probe();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const markActive = () => { lastInteractionRef.current = Date.now(); };
    const countAction = () => {
      lastInteractionRef.current = Date.now();
      actionCountRef.current = Math.min(20, actionCountRef.current + 1);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    window.addEventListener(MEANINGFUL_ACTIVITY_EVENT, countAction);
    return () => {
      events.forEach((event) => window.removeEventListener(event, markActive));
      window.removeEventListener(MEANINGFUL_ACTIVITY_EVENT, countAction);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const sendHeartbeat = async () => {
      const user = auth.currentUser;
      const currentPath = pathnameRef.current;
      if (!user || isExcluded(currentPath) || document.visibilityState !== "visible") return;
      if (Date.now() - lastInteractionRef.current > idleMsRef.current) return;
      try {
        const token = await user.getIdToken();
        const actionCount = actionCountRef.current;
        actionCountRef.current = 0;
        const response = await fetch("/api/activity/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            pathname: currentPath,
            sessionId: sessionIdRef.current,
            actionCount,
          }),
          keepalive: true,
        });
        if (!response.ok) actionCountRef.current = Math.min(20, actionCountRef.current + actionCount);
      } catch {
        // Tracking is best-effort and must not block the user.
      }
    };
    const timer = window.setInterval(sendHeartbeat, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const dismissNotice = async () => {
    const current = notice;
    setNotice(null);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      await fetch("/api/activity/notice", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ version: current?.version }),
      });
    } catch {
      // The notice may be shown again if its display record could not be saved.
    }
  };

  if (!notice) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="activity-notice-title" className={layoutStyles.extracted1}>
      <div className={layoutStyles.extracted2}>
        <div id="activity-notice-title" className={layoutStyles.extracted3}>Activity tracking notice</div>
        <p className={layoutStyles.extracted4}>
          Bickers records active session times, broad areas of the system used and counts of saved actions so administrators can review possible out-of-hours use.
        </p>
        <p className={layoutStyles.extracted5}>
          It does not record what you type, form contents, keystrokes, screenshots or document contents. Activity does not automatically count as overtime and is not added to timesheets.
        </p>
        <p className={layoutStyles.extracted6}>
          Raw activity is retained for 90 days and session summaries for two years. Only administrators can view the reports.
        </p>
        <button type="button" onClick={dismissNotice} className={layoutStyles.extracted7}>I understand</button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 100000, display: "grid", placeItems: "center",
  padding: 20, background: "rgba(0,0,0,.58)", backdropFilter: "blur(4px)",
};
const noticeStyle = {
  width: "min(560px, 100%)", borderRadius: 16, padding: 22,
  background: "var(--color-surface, #fff)", color: "var(--color-text, #111)",
  border: "1px solid var(--color-border, #ddd)", boxShadow: "0 24px 80px rgba(0,0,0,.3)",
};
const copyStyle = { margin: "12px 0", color: "var(--color-text-muted, #5f6368)", lineHeight: 1.55 };
const buttonStyle = {
  border: 0, borderRadius: 10, padding: "10px 16px", background: "#111", color: "#fff",
  fontWeight: 850, cursor: "pointer", marginTop: 4,
};
