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
    background: "#fff",
    border: "1px solid #d7dee8",
    borderRadius: 8,
    padding: 14,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
  },
  tableWrap: {
    background: "#fff",
    border: "1px solid #d7dee8",
    borderRadius: 8,
    overflow: "auto",
  },
  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "#f8fafc",
    color: "#64748b",
    borderBottom: "1px solid #d7dee8",
    fontSize: 12,
    textTransform: "uppercase",
    fontWeight: 900,
  },
  td: { padding: "11px 12px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top", fontSize: 13 },
  input: {
    height: 36,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "0 10px",
    fontWeight: 800,
    background: "#fff",
    color: "#0f172a",
  },
  button: {
    height: 34,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "0 10px",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
  },
  dangerButton: {
    height: 34,
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "0 10px",
    background: "#fff1f2",
    color: "#b91c1c",
    fontWeight: 900,
    cursor: "pointer",
  },
};

export function Pill({ children, tone = "blue" }) {
  const colors = {
    blue: ["#0369a1", "#f0f9ff", "#bae6fd"],
    green: ["#15803d", "#f0fdf4", "#bbf7d0"],
    amber: ["#b45309", "#fffbeb", "#fed7aa"],
    red: ["#b91c1c", "#fff1f2", "#fecaca"],
    gray: ["#475569", "#f8fafc", "#cbd5e1"],
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
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 950, color: tone === "red" ? "#b91c1c" : tone === "amber" ? "#b45309" : "#0f172a" }}>{value}</div>
      {detail ? <div style={{ marginTop: 4, color: "#64748b", fontSize: 12, fontWeight: 800 }}>{detail}</div> : null}
    </div>
  );
}
