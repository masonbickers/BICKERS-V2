"use client";

import layoutStyles from "./platformAdminData.styles.module.css";
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

export function statusTone(status) {
  if (["active", "pass", "enabled"].includes(status)) return "green";
  if (["suspended", "fail", "disabled", "archived"].includes(status)) return "red";
  if (["warn", "setup", "locked"].includes(status)) return "amber";
  return "blue";
}

export const ui = {
  card: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: 14,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
  },
  tableWrap: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    overflow: "auto",
  },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "var(--color-surface-subtle)",
    color: "var(--color-text-muted)",
    borderBottom: "1px solid var(--color-border)",
    fontSize: 12,
    textTransform: "uppercase",
    fontWeight: 900,
  },
  td: { padding: "11px 12px", borderBottom: "1px solid var(--color-border)", verticalAlign: "top", fontSize: 13 },
  input: {
    height: 36,
    border: "1px solid var(--color-border-strong)",
    borderRadius: 8,
    padding: "0 10px",
    fontWeight: 800,
    background: "var(--color-surface)",
    color: "var(--color-text)",
  },
  button: {
    height: 34,
    border: "1px solid var(--color-border-strong)",
    borderRadius: 8,
    padding: "0 10px",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    fontWeight: 900,
    cursor: "pointer",
  },
  dangerButton: {
    height: 34,
    border: "1px solid var(--color-danger-border)",
    borderRadius: 8,
    padding: "0 10px",
    background: "var(--color-danger-soft)",
    color: "var(--color-danger)",
    fontWeight: 900,
    cursor: "pointer",
  },
};

export function Pill({ children, tone = "blue" }) {
  const colors = {
    blue: ["var(--color-info)", "var(--color-info-soft)", "var(--color-info-border)"],
    green: ["var(--color-success)", "var(--color-success-soft)", "var(--color-success-border)"],
    amber: ["var(--color-warning)", "var(--color-warning-soft)", "var(--color-warning-border)"],
    red: ["var(--color-danger)", "var(--color-danger-soft)", "var(--color-danger-border)"],
    gray: ["var(--color-text-muted)", "var(--color-surface-subtle)", "var(--color-border-strong)"],
  };
  const [color, bg, border] = colors[tone] || colors.blue;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, border: `1px solid ${border}`, background: bg, color, fontSize: 12, fontWeight: 900 }}>
      {children}
    </span>
  );
}

export function Metric({ label, value, detail, tone = "blue" }) {
  return (
    <div style={ui.card}>
      <div className={layoutStyles.extracted1}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 950, color: tone === "var(--color-danger)" ? "var(--color-danger)" : tone === "amber" ? "var(--color-warning)" : "var(--color-text)" }}>{value}</div>
      {detail ? <div className={layoutStyles.extracted2}>{detail}</div> : null}
    </div>
  );
}
