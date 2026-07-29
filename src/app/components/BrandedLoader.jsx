"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./BrandedLoader.module.css";

const FRAME_COUNT = 5;
const FRAME_DURATION_MS = 360;
const FULL_LOGO_HOLD_TICKS = 2;
const CYCLE_TICKS = FRAME_COUNT + FULL_LOGO_HOLD_TICKS;

export default function BrandedLoader({ label = "Loading…", compact = false, showLabel = false }) {
  const [cycleTick, setCycleTick] = useState(1);
  const visibleLines = Math.min(cycleTick, FRAME_COUNT);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCycleTick((current) => (current >= CYCLE_TICKS ? 1 : current + 1));
    }, FRAME_DURATION_MS);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={styles.loader} role="status" aria-live="polite" aria-label={label}>
      <div className={`${styles.logo} ${compact ? styles.logoCompact : ""}`} aria-hidden="true">
        {Array.from({ length: FRAME_COUNT }, (_, index) => (
          <Image
            key={index}
            className={`${styles.layer} ${index < visibleLines ? styles.visible : ""}`}
            src={`/loading-logo/line-${index + 1}.png`}
            alt=""
            fill
            sizes="(max-width: 600px) 82vw, 480px"
            priority
          />
        ))}
      </div>
      {showLabel ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}
