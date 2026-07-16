"use client";

import layoutStyles from "./RouteLoadingOverlay.styles.module.css";
export default function RouteLoadingOverlay({
  progress = 8,
  title = "Opening page",
  hint = "Preparing details...",
}) {
  return (
    <div className={layoutStyles.extracted1} role="status" aria-live="polite">
      <div className={layoutStyles.extracted2}>
        <div className={layoutStyles.extracted3}>
          <span className={layoutStyles.extracted4}>
            <span className={layoutStyles.extracted5} />
          </span>
          <div className={layoutStyles.extracted6}>
            <div className={layoutStyles.extracted7}>{title}</div>
            <div className={layoutStyles.extracted8}>{hint}</div>
          </div>
          <div className={layoutStyles.extracted9}>{progress}%</div>
        </div>
        <div className={layoutStyles.extracted10}>
          <div style={{ ...fill, width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  background: "rgba(15,23,42,0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const card = {
  width: "min(390px, 92vw)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  boxShadow: "0 18px 46px rgba(15,23,42,0.24)",
  padding: 14,
};

const topRow = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
};

const iconBox = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-brand-soft)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const iconDot = {
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "var(--color-brand)",
  boxShadow: "0 0 0 5px rgba(31,75,122,0.12)",
};

const copy = {
  minWidth: 0,
};

const heading = {
  fontSize: 14,
  lineHeight: 1.25,
  fontWeight: 900,
  color: "var(--color-text)",
};

const subtext = {
  fontSize: 12,
  lineHeight: 1.3,
  color: "var(--color-text-muted)",
  fontWeight: 700,
  marginTop: 2,
};

const percent = {
  minWidth: 54,
  padding: "5px 8px",
  borderRadius: 999,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-surface-subtle)",
  color: "var(--color-brand)",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 900,
  textAlign: "center",
};

const track = {
  height: 8,
  width: "100%",
  borderRadius: 999,
  background: "var(--color-brand-soft)",
  border: "1px solid var(--color-border)",
  overflow: "hidden",
};

const fill = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, var(--color-brand) 0%, var(--color-accent) 100%)",
  transition: "width 220ms ease",
};
