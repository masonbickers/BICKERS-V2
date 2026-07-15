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
  padding: 16,
};

const card = {
  width: "min(390px, 92vw)",
  background: "var(--legacy-color-ffffff)",
  color: "var(--legacy-color-0f172a)",
  borderRadius: 8,
  border: "1px solid var(--legacy-color-d7dee8)",
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
  border: "1px solid var(--legacy-color-c8d6e3)",
  background: "var(--legacy-color-edf3f8)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const iconDot = {
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "var(--legacy-color-1f4b7a)",
  boxShadow: "0 0 0 5px rgba(31,75,122,0.12)",
};

const copy = {
  minWidth: 0,
};

const heading = {
  fontSize: 14,
  lineHeight: 1.25,
  fontWeight: 900,
  color: "var(--legacy-color-0f172a)",
};

const subtext = {
  fontSize: 12,
  lineHeight: 1.3,
  color: "var(--legacy-color-5f6f82)",
  fontWeight: 700,
  marginTop: 2,
};

const percent = {
  minWidth: 54,
  padding: "5px 8px",
  borderRadius: 999,
  border: "1px solid var(--legacy-color-c8d6e3)",
  background: "var(--legacy-color-f8fbfe)",
  color: "var(--legacy-color-1f4b7a)",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 900,
  textAlign: "center",
};

const track = {
  height: 8,
  width: "100%",
  borderRadius: 999,
  background: "var(--legacy-color-edf3f8)",
  border: "1px solid var(--legacy-color-d7dee8)",
  overflow: "hidden",
};

const fill = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, var(--legacy-color-1f4b7a) 0%, var(--legacy-color-8b5e3c) 100%)",
  transition: "width 220ms ease",
};
