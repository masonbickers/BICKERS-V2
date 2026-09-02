"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import styles from "./ReleaseUpdateNotice.module.css";

export const RELEASE_UPDATE_NOTICE_ID = "2026-09-02-review-queue-linked-diary";

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
          <h2 id="release-update-title">Review Queue updated</h2>
          <p>
            Jobs can now be marked <strong>Complete</strong> with an empty review form. Finance details and checks are still required before selecting <strong>Ready to Invoice</strong>.
          </p>
          <p className={styles.small}>Linked jobs have also been improved so they flow together clearly in the Diary.</p>
          <button type="button" className={styles.confirm} onClick={dismiss}>Got it</button>
        </div>
      </section>
    </div>
  );
}
