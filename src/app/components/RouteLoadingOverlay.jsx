"use client";

export default function RouteLoadingOverlay({
  progress = 8,
  title = "Opening page",
  hint = "Preparing details...",
}) {
  return (
    <div style={overlay} role="status" aria-live="polite">
      <div style={card}>
        <div style={topRow}>
          <span style={iconBox}>
            <span style={iconDot} />
          </span>
          <div style={copy}>
            <div style={heading}>{title}</div>
            <div style={subtext}>{hint}</div>
          </div>
          <div style={percent}>{progress}%</div>
        </div>
        <div style={track}>
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
  padding: "var(--space-4)",
};

const card = {
  width: "min(390px, 92vw)",
  background: "var(--color-white)",
  color: "var(--color-text)",
  borderRadius: "var(--radius-md)",
  border: "var(--border-default)",
  boxShadow: "0 18px 46px rgba(15,23,42,0.24)",
  padding: 14,
};

const topRow = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  marginBottom: "var(--space-3)",
};

const iconBox = {
  width: 34,
  height: 34,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-brand-soft)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const iconDot = {
  width: 12,
  height: 12,
  borderRadius: "var(--radius-pill)",
  background: "var(--color-brand)",
  boxShadow: "0 0 0 5px rgba(31,75,122,0.12)",
};

const copy = {
  minWidth: 0,
};

const heading = {
  fontSize: "var(--font-size-md)",
  lineHeight: 1.25,
  fontWeight: 900,
  color: "var(--color-text)",
};

const subtext = {
  fontSize: "var(--font-size-xs)",
  lineHeight: 1.3,
  color: "var(--color-text-muted)",
  fontWeight: 700,
  marginTop: 2,
};

const percent = {
  minWidth: 54,
  padding: "5px 8px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--color-border-strong)",
  background: "var(--legacy-color-f8fbfe)",
  color: "var(--color-brand)",
  fontSize: "var(--font-size-sm)",
  lineHeight: 1,
  fontWeight: 900,
  textAlign: "center",
};

const track = {
  height: 8,
  width: "100%",
  borderRadius: "var(--radius-pill)",
  background: "var(--color-brand-soft)",
  border: "var(--border-default)",
  overflow: "hidden",
};

const fill = {
  height: "100%",
  borderRadius: "var(--radius-pill)",
  background: "linear-gradient(90deg, var(--color-brand) 0%, var(--legacy-color-8b5e3c) 100%)",
  transition: "width 220ms ease",
};
