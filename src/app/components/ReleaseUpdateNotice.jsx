"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import styles from "./ReleaseUpdateNotice.module.css";

export const RELEASE_UPDATE_NOTICE_ID = "2026-09-07-completed-inspection-entry";

export default function ReleaseUpdateNotice({ userKey = "signed-in" }) {
  const [visible, setVisible] = useState(false);
  const storageKey = useMemo(
    () => `bickers:release-update:${RELEASE_UPDATE_NOTICE_ID}:${String(userKey || "signed-in")}`,
    [userKey]
  );

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(storageKey) !== "dismissed");
    } catch {
      setVisible(true);
    }
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      // The notice remains dismissible for this session when storage is unavailable.
    }
  };

  if (!visible) return null;

  return (
    <div className={styles.backdrop} role="presentation">
      <section className={styles.notice} role="dialog" aria-modal="true" aria-labelledby="release-update-title">
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Dismiss update notice">
          <X size={17} />
        </button>
        <span className={styles.icon} aria-hidden="true"><CheckCircle2 size={22} /></span>
        <div className={styles.content}>
          <span className={styles.kicker}>System update</span>
          <h2 id="release-update-title">Completed inspections made easier</h2>
          <p>
            Use <strong>Record completed inspections</strong> on the vehicle page or return-to-fleet form to enter completed PMI and brake tests and upload their certificates.
          </p>
          <p className={styles.small}>Existing completed inspections are shown so you can add paperwork without creating a duplicate. Return-to-fleet dates are handled separately.</p>
          <button type="button" className={styles.confirm} onClick={dismiss}>Got it</button>
        </div>
      </section>
    </div>
  );
}
