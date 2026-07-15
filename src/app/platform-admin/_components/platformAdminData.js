"use client";

import { auth } from "../../../../firebaseConfig";

export const DEFAULT_COMPANY_ID = "bickers-action";

export const moduleLabels = [
  ["diary", "Diary"],
  ["bookings", "Bookings"],
  ["workshop", "Workshop"],
  ["vehicles", "Vehicles"],
  ["equipment", "Equipment"],
  ["uCrane", "U-Crane"],
  ["jobSheets", "Job Sheets"],
  ["employees", "Employees"],
  ["hr", "HR"],
  ["hAndS", "H&S"],
  ["statistics", "Statistics"],
  ["timesheets", "Timesheets"],
  ["holidays", "Holidays"],
  ["finance", "Finance"],
  ["invoices", "Invoices"],
  ["assistant", "Assistant"],
  ["mobileApp", "Mobile App"],
  ["pushNotifications", "Push Notifications"],
  ["passkeys", "Passkeys"],
  ["mfa", "MFA"],
  ["userCodeLogin", "Setup-code Login"],
  ["settings", "Settings"],
];

export const roleLabels = ["platformAdmin", "admin", "user"];

export function clean(value) {
  return String(value || "").trim();
}

export function cleanEmail(value) {
  return clean(value).toLowerCase();
}

export function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value?.seconds ? value.seconds * 1000 : value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export async function authedFetch(url, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You need to sign in again.");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed.");
  return data;
}

export function companyName(companies, companyId) {
  const id = companyId || DEFAULT_COMPANY_ID;
  return companies.find((company) => company.id === id)?.name || id;
}

export function userMfaReady(user) {
  return user?.mfaEnabled === true && user?.mfaMethod === "totp" && user?.mfaResetRequired !== true;
}

export function statusTone(status) {
  if (["active", "pass", "enabled"].includes(status)) return "green";
  if (["suspended", "fail", "disabled", "archived"].includes(status)) return "red";
  if (["warn", "setup", "locked"].includes(status)) return "amber";
  return "blue";
}

export const ui = {
  card: {
    background: "var(--color-white)",
    border: "var(--border-default)",
    borderRadius: "var(--radius-md)",
    padding: 14,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "var(--space-3)",
  },
  tableWrap: {
    background: "var(--color-white)",
    border: "var(--border-default)",
    borderRadius: "var(--radius-md)",
    overflow: "auto",
  },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "var(--color-surface-subtle)",
    color: "var(--color-text-subtle)",
    borderBottom: "1px solid var(--color-border)",
    fontSize: "var(--font-size-xs)",
    textTransform: "uppercase",
    fontWeight: 900,
  },
  td: { padding: "11px 12px", borderBottom: "1px solid var(--legacy-color-e2e8f0)", verticalAlign: "top", fontSize: "var(--font-size-sm)" },
  input: {
    height: "var(--control-height-md)",
    border: "1px solid var(--legacy-color-cbd5e1)",
    borderRadius: "var(--radius-md)",
    padding: "0 10px",
    fontWeight: 800,
    background: "var(--color-white)",
    color: "var(--color-text)",
  },
  button: {
    height: 34,
    border: "1px solid var(--legacy-color-cbd5e1)",
    borderRadius: "var(--radius-md)",
    padding: "0 10px",
    background: "var(--color-white)",
    color: "var(--color-text)",
    fontWeight: 900,
    cursor: "pointer",
  },
  dangerButton: {
    height: 34,
    border: "1px solid var(--color-danger-border)",
    borderRadius: "var(--radius-md)",
    padding: "0 10px",
    background: "var(--legacy-color-fff1f2)",
    color: "var(--legacy-color-b91c1c)",
    fontWeight: 900,
    cursor: "pointer",
  },
};

export function Pill({ children, tone = "blue" }) {
  const colors = {
    blue: ["var(--legacy-color-0369a1)", "var(--legacy-color-f0f9ff)", "var(--legacy-color-bae6fd)"],
    green: ["var(--legacy-color-15803d)", "var(--legacy-color-f0fdf4)", "var(--color-success-border)"],
    amber: ["var(--legacy-color-b45309)", "var(--legacy-color-fffbeb)", "var(--color-warning-border)"],
    red: ["var(--legacy-color-b91c1c)", "var(--legacy-color-fff1f2)", "var(--color-danger-border)"],
    gray: ["var(--legacy-color-475569)", "var(--color-surface-subtle)", "var(--legacy-color-cbd5e1)"],
  };
  const [color, bg, border] = colors[tone] || colors.blue;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: "var(--radius-pill)", border: `1px solid ${border}`, background: bg, color, fontSize: "var(--font-size-xs)", fontWeight: 900 }}>
      {children}
    </span>
  );
}

export function Metric({ label, value, detail, tone = "blue" }) {
  return (
    <div style={ui.card}>
      <div style={{ color: "var(--color-text-subtle)", fontSize: "var(--font-size-xs)", fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 950, color: tone === "red" ? "var(--legacy-color-b91c1c)" : tone === "amber" ? "var(--legacy-color-b45309)" : "var(--color-text)" }}>{value}</div>
      {detail ? <div style={{ marginTop: "var(--space-1)", color: "var(--color-text-subtle)", fontSize: "var(--font-size-xs)", fontWeight: 800 }}>{detail}</div> : null}
    </div>
  );
}
