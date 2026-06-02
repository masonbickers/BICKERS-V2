"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import PlatformAdminShell from "./PlatformAdminShell";
import {
  authedFetch,
  companyName,
  formatDate,
  Metric,
  moduleLabels,
  Pill,
  roleLabels,
  statusTone,
  ui,
  userMfaReady,
} from "./platformAdminData";
import { auth } from "../../../../firebaseConfig";

const sectionCopy = {
  dashboard: ["Platform Dashboard", "Companies, users, security warnings and recent events."],
  companies: ["Companies", "Create, review and control tenant settings."],
  users: ["Users", "Manage user access, workspace permissions and MFA readiness."],
  employeeLinking: ["Employee Linking", "Repair links between Firebase users and employee records."],
  security: ["Security Centre", "Users and companies that need security attention."],
  mfa: ["MFA Management", "Authenticator readiness and legacy MFA cleanup."],
  roles: ["Roles & Permissions", "Current role model and module permission matrix."],
  auditLogs: ["Audit Logs", "Admin/security changes written to adminAuditLogs."],
  loginSecurity: ["Login Security", "Login, setup-code and lockout activity."],
  cleanup: ["System Cleanup", "Safe cleanup tasks with preview-first behaviour."],
  featureFlags: ["Feature Flags", "Global and company module/security switches."],
  settings: ["Platform Settings", "Current operating model and hardening checklist."],
};

function usePlatformData({ includeAudit = false } = {}) {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState({ companies: [], users: [], employees: [], audits: [], loginLogs: [], stats: {} });
  const [audit, setAudit] = useState({ rows: [], summary: {} });

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    setNotice("");
    try {
      const platformData = await authedFetch("/api/platform-admin", { cache: "no-store" });
      setData({
        companies: platformData.companies || [],
        users: platformData.users || [],
        employees: platformData.employees || [],
        audits: platformData.audits || [],
        loginLogs: platformData.loginLogs || [],
        stats: platformData.stats || {},
      });
      if (includeAudit) {
        const auditData = await authedFetch("/api/admin/security-audit", { cache: "no-store" });
        setAudit({ rows: auditData.rows || [], summary: auditData.summary || {} });
      }
    } catch (error) {
      setNotice(error?.message || "Could not load platform data.");
    } finally {
      setLoading(false);
    }
  }, [includeAudit]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) load();
    });
    return () => unsub();
  }, [load]);

  return { data, audit, loading, notice, load };
}

export default function PlatformAdminSectionPage({ section }) {
  const needsAudit = ["security", "mfa", "cleanup", "dashboard"].includes(section);
  const { data, audit, loading, notice, load } = usePlatformData({ includeAudit: needsAudit });
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");

  const copy = sectionCopy[section] || sectionCopy.dashboard;
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.users.filter((user) => {
      if (companyFilter !== "all" && user.companyId !== companyFilter) return false;
      if (!q) return true;
      return [user.email, user.name, user.uid, user.role, user.defaultWorkspace].join(" ").toLowerCase().includes(q);
    });
  }, [companyFilter, data.users, query]);

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.employees.filter((employee) => {
      if (companyFilter !== "all" && employee.companyId !== companyFilter) return false;
      if (!q) return true;
      return [employee.email, employee.name, employee.uid, employee.authUid, employee.role].join(" ").toLowerCase().includes(q);
    });
  }, [companyFilter, data.employees, query]);

  return (
    <PlatformAdminShell title={copy[0]} subtitle={copy[1]} onRefresh={load} loading={loading}>
      {notice ? <div style={{ ...ui.card, borderColor: "#fecaca", color: "#b91c1c", marginBottom: 12, fontWeight: 900 }}>{notice}</div> : null}
      {section !== "dashboard" ? (
        <Toolbar
          query={query}
          setQuery={setQuery}
          companyFilter={companyFilter}
          setCompanyFilter={setCompanyFilter}
          companies={data.companies}
        />
      ) : null}
      {renderSection(section, { data, audit, filteredUsers, filteredEmployees, loading })}
    </PlatformAdminShell>
  );
}

function Toolbar({ query, setQuery, companyFilter, setCompanyFilter, companies }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." style={{ ...ui.input, width: 280 }} />
      <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={ui.input}>
        <option value="all">All companies</option>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
    </div>
  );
}

function renderSection(section, ctx) {
  if (section === "companies") return <CompaniesView {...ctx} />;
  if (section === "users") return <UsersView {...ctx} />;
  if (section === "employeeLinking") return <EmployeeLinkingView {...ctx} />;
  if (section === "security") return <SecurityView {...ctx} />;
  if (section === "mfa") return <MfaView {...ctx} />;
  if (section === "roles") return <RolesView />;
  if (section === "auditLogs") return <AuditLogsView {...ctx} />;
  if (section === "loginSecurity") return <LoginLogsView {...ctx} />;
  if (section === "cleanup") return <CleanupView {...ctx} />;
  if (section === "featureFlags") return <FeatureFlagsView {...ctx} />;
  if (section === "settings") return <SettingsView />;
  return <DashboardView {...ctx} />;
}

function DashboardView({ data, audit }) {
  const activeCompanies = data.companies.filter((c) => c.status === "active").length;
  const disabledCompanies = data.companies.filter((c) => ["suspended", "archived", "locked"].includes(c.status)).length;
  const setupCodeCompanies = data.companies.filter((c) => c.security?.userCodeLogin !== false).length;
  const mfaMissing = data.users.filter((u) => !userMfaReady(u)).length;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={ui.grid}>
        <Metric label="Companies" value={data.companies.length} detail={`${activeCompanies} active`} />
        <Metric label="Disabled Companies" value={disabledCompanies} tone={disabledCompanies ? "amber" : "blue"} />
        <Metric label="Users" value={data.users.length} detail={`${data.users.filter((u) => u.isEnabled).length} active`} />
        <Metric label="Blocked Users" value={data.users.filter((u) => !u.isEnabled).length} tone="red" />
        <Metric label="MFA Missing" value={mfaMissing} tone={mfaMissing ? "amber" : "blue"} />
        <Metric label="Setup-code Enabled" value={setupCodeCompanies} detail="companies" tone={setupCodeCompanies ? "amber" : "blue"} />
      </div>
      <Warnings rows={audit.rows} users={data.users} companies={data.companies} />
      <Recent title="Recent Admin Audit Logs" rows={data.audits} />
      <Recent title="Recent Login Security Events" rows={data.loginLogs} />
    </div>
  );
}

function CompaniesView({ data }) {
  return (
    <Table headers={["Company", "Status", "Plan", "Users", "Modules", "Security", "Actions"]}>
      {data.companies.map((company) => {
        const companyUsers = data.users.filter((user) => user.companyId === company.id);
        const enabledModules = moduleLabels.filter(([key]) => company.modules?.[key]).map(([, label]) => label);
        return (
          <tr key={company.id}>
            <Td><strong>{company.name}</strong><Small>{company.domain || company.id}</Small></Td>
            <Td><Pill tone={statusTone(company.status)}>{company.status}</Pill></Td>
            <Td>{company.plan || "-"}</Td>
            <Td>{companyUsers.length} / {company.maxUsers || "-"}</Td>
            <Td>{enabledModules.join(", ") || "-"}</Td>
            <Td><Pill tone={company.security?.userCodeLogin === false ? "green" : "amber"}>{company.security?.userCodeLogin === false ? "setup-code off" : "setup-code on"}</Pill></Td>
            <Td><Link href={`/platform-admin/companies/${company.id}`} style={ui.button}>Open</Link></Td>
          </tr>
        );
      })}
    </Table>
  );
}

function UsersView({ data, filteredUsers }) {
  return (
    <Table headers={["User", "Company", "Role", "Access", "MFA", "Status"]}>
      {filteredUsers.map((user) => (
        <tr key={user.id}>
          <Td><strong>{user.email}</strong><Small>{user.name || user.uid}</Small></Td>
          <Td>{companyName(data.companies, user.companyId)}</Td>
          <Td><Pill tone={user.role === "admin" ? "amber" : "blue"}>{user.role}</Pill></Td>
          <Td><Pill tone={user.appAccess?.user ? "green" : "gray"}>User</Pill> <Pill tone={user.appAccess?.service ? "green" : "gray"}>Service</Pill><Small>Default: {user.defaultWorkspace}</Small></Td>
          <Td><Pill tone={userMfaReady(user) ? "green" : "red"}>{userMfaReady(user) ? "Ready" : "Needs MFA"}</Pill></Td>
          <Td><Pill tone={user.isEnabled ? "green" : "red"}>{user.isEnabled ? "Enabled" : "Disabled"}</Pill></Td>
        </tr>
      ))}
    </Table>
  );
}

function EmployeeLinkingView({ data, filteredEmployees }) {
  const userByUid = new Map(data.users.map((user) => [user.uid || user.id, user]));
  const userByEmail = new Map(data.users.map((user) => [user.email, user]));
  return (
    <Table headers={["Employee", "Company", "Current Link", "Suggested Match", "Status"]}>
      {filteredEmployees.map((employee) => {
        const linkedUid = employee.authUid || employee.uid;
        const linkedUser = linkedUid ? userByUid.get(linkedUid) : null;
        const suggested = !linkedUser && employee.email ? userByEmail.get(employee.email) : null;
        return (
          <tr key={employee.id}>
            <Td><strong>{employee.name || "-"}</strong><Small>{employee.email || employee.id}</Small></Td>
            <Td>{companyName(data.companies, employee.companyId)}</Td>
            <Td>{linkedUser ? <Pill tone="green">{linkedUser.email}</Pill> : <Pill tone="amber">No authUid</Pill>}</Td>
            <Td>{suggested ? <Pill tone="blue">{suggested.email}</Pill> : "-"}</Td>
            <Td>{linkedUser ? "Linked" : suggested ? "Manual link ready" : "Needs review"}</Td>
          </tr>
        );
      })}
    </Table>
  );
}

function SecurityView({ data, audit }) {
  const weakCompanies = data.companies.filter((c) => c.security?.mfaRequired === false || c.security?.userCodeLogin !== false);
  const riskyRows = audit.rows.filter((row) => ["fail", "warn"].includes(row.status));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={ui.grid}>
        <Metric label="Audit Fail/Warn" value={riskyRows.length} tone={riskyRows.length ? "amber" : "blue"} />
        <Metric label="Weak Company Settings" value={weakCompanies.length} tone={weakCompanies.length ? "amber" : "blue"} />
        <Metric label="Disabled Users" value={data.users.filter((u) => !u.isEnabled).length} />
      </div>
      <Table headers={["Account", "Status", "Issues"]}>
        {riskyRows.slice(0, 80).map((row) => (
          <tr key={`${row.source}-${row.id || row.employeeIds?.[0]}`}>
            <Td><strong>{row.email || row.name || "-"}</strong><Small>{row.uid || row.id}</Small></Td>
            <Td><Pill tone={row.status === "fail" ? "red" : "amber"}>{row.status}</Pill></Td>
            <Td>{(row.issues || []).join(", ")}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function MfaView({ data, audit }) {
  const rows = audit.rows.filter((row) => row.source === "users" && (row.mfaEnabled || row.legacyMfaSecretPresent || row.mfaResetRequired || !row.privateMfaSecretPresent));
  return (
    <Table headers={["User", "Phone", "MFA", "Private Secret", "Legacy Secret", "Issues"]}>
      {rows.map((row) => (
        <tr key={row.id}>
          <Td><strong>{row.email}</strong><Small>{row.uid}</Small></Td>
          <Td>{row.phone || row.mfaPhoneNumber || "-"}</Td>
          <Td><Pill tone={row.mfaEnabled ? "green" : "red"}>{row.mfaEnabled ? "Enabled" : "Missing"}</Pill></Td>
          <Td><Pill tone={row.privateMfaSecretPresent ? "green" : "red"}>{row.privateMfaSecretPresent ? "Present" : "Missing"}</Pill></Td>
          <Td><Pill tone={row.legacyMfaSecretPresent ? "amber" : "green"}>{row.legacyMfaSecretPresent ? "Legacy found" : "Clean"}</Pill></Td>
          <Td>{(row.issues || []).join(", ") || "-"}</Td>
        </tr>
      ))}
    </Table>
  );
}

function RolesView() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={ui.grid}>
        {roleLabels.map((role) => <Metric key={role} label={role} value={role === "platformAdmin" ? "All companies" : "Scoped"} detail={roleHelp(role)} />)}
      </div>
      <Table headers={["Module", "User", "Service", "Company Admin", "Platform Admin"]}>
        {moduleLabels.map(([, label]) => (
          <tr key={label}><Td>{label}</Td><Td>By appAccess/module</Td><Td>By service access</Td><Td>Own company</Td><Td>All companies</Td></tr>
        ))}
      </Table>
    </div>
  );
}

function AuditLogsView({ data }) {
  return <Recent title="Admin Audit Logs" rows={data.audits} full />;
}

function LoginLogsView({ data }) {
  return <Recent title="Login Security Logs" rows={data.loginLogs} full />;
}

function CleanupView({ audit }) {
  const tasks = [
    ["Device user records", audit.rows.filter((r) => r.status === "device").length],
    ["Disabled duplicate rows", audit.rows.filter((r) => r.status === "disabled").length],
    ["Legacy users.mfaSecret", audit.rows.filter((r) => r.legacyMfaSecretPresent).length],
    ["Duplicate active user docs", audit.rows.filter((r) => r.duplicateEmailCount > 1).length],
    ["App-only employee rows", audit.rows.filter((r) => r.status === "app").length],
    ["No-login employee rows", audit.rows.filter((r) => r.status === "noLogin").length],
  ];
  return (
    <Table headers={["Task", "Count", "Safe Action"]}>
      {tasks.map(([label, count]) => (
        <tr key={label}><Td><strong>{label}</strong></Td><Td>{count}</Td><Td>{count ? "Preview in Security Audit before cleanup" : "No action needed"}</Td></tr>
      ))}
    </Table>
  );
}

function FeatureFlagsView({ data }) {
  return (
    <Table headers={["Company", ...moduleLabels.map(([, label]) => label), "Setup-code", "Passkeys"]}>
      {data.companies.map((company) => (
        <tr key={company.id}>
          <Td><strong>{company.name}</strong><Small>{company.id}</Small></Td>
          {moduleLabels.map(([key]) => <Td key={key}><Pill tone={company.modules?.[key] ? "green" : "gray"}>{company.modules?.[key] ? "On" : "Off"}</Pill></Td>)}
          <Td><Pill tone={company.security?.userCodeLogin === false ? "green" : "amber"}>{company.security?.userCodeLogin === false ? "Off" : "On"}</Pill></Td>
          <Td><Pill tone={company.security?.passkeysAllowed ? "green" : "gray"}>{company.security?.passkeysAllowed ? "On" : "Off"}</Pill></Td>
        </tr>
      ))}
    </Table>
  );
}

function SettingsView() {
  const items = [
    "Firebase Auth is the main identity provider.",
    "users/{uid} is the access record.",
    "employees.authUid and employees.uid should equal Firebase UID.",
    "MFA secrets stay server-only in mfaSecrets/{uid}.",
    "Next hardening: remove company-email fallback and tenant-scope business docs by companyId.",
  ];
  return <div style={ui.card}>{items.map((item) => <p key={item} style={{ margin: "0 0 10px", fontWeight: 800 }}>{item}</p>)}</div>;
}

function Warnings({ rows, users, companies }) {
  const warnings = [
    ...rows.filter((row) => ["fail", "warn"].includes(row.status)).slice(0, 5).map((row) => `${row.email || row.name || row.uid}: ${(row.issues || []).join(", ")}`),
    ...companies.filter((company) => company.security?.userCodeLogin !== false).slice(0, 3).map((company) => `${company.name}: setup-code login still enabled`),
    ...users.filter((user) => !user.companyId).slice(0, 3).map((user) => `${user.email}: missing companyId`),
  ];
  return (
    <div style={ui.card}>
      <h2 style={heading}>System Warnings</h2>
      {warnings.length ? warnings.map((warning) => <div key={warning} style={warningLine}>{warning}</div>) : <div style={muted}>No warnings from current platform summary.</div>}
    </div>
  );
}

function Recent({ title, rows, full = false }) {
  const displayRows = full ? rows : rows.slice(0, 8);
  return (
    <div style={ui.tableWrap}>
      <div style={{ padding: 12, borderBottom: "1px solid #d7dee8" }}><h2 style={heading}>{title}</h2></div>
      <table style={ui.table}>
        <thead><tr><th style={ui.th}>When</th><th style={ui.th}>Actor/User</th><th style={ui.th}>Action</th><th style={ui.th}>Target</th></tr></thead>
        <tbody>
          {displayRows.length ? displayRows.map((row) => (
            <tr key={row.id}>
              <Td>{formatDate(row.createdAt)}</Td>
              <Td>{row.actorEmail || row.email || row.uid || "-"}</Td>
              <Td>{row.action || row.loginMethod || row.status || "-"}</Td>
              <Td>{row.targetUserId || row.employeeId || row.companyId || "-"}</Td>
            </tr>
          )) : <tr><Td colSpan={4}>No records found.</Td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Table({ headers, children }) {
  return (
    <div style={ui.tableWrap}>
      <table style={ui.table}>
        <thead><tr>{headers.map((header) => <th key={header} style={ui.th}>{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, colSpan }) {
  return <td colSpan={colSpan} style={ui.td}>{children}</td>;
}

function Small({ children }) {
  return <div style={{ marginTop: 3, color: "#64748b", fontSize: 12, fontWeight: 800 }}>{children}</div>;
}

function roleHelp(role) {
  if (role === "platformAdmin") return "Server-verified super admin";
  if (role === "companyAdmin") return "Own company only";
  if (role === "service" || role === "hybrid") return "Workshop/service access";
  if (role === "archived") return "No access";
  return "Module/workspace scoped";
}

const heading = { margin: 0, fontSize: 15, fontWeight: 950 };
const muted = { color: "#64748b", fontWeight: 800 };
const warningLine = { padding: "8px 0", borderTop: "1px solid #e2e8f0", color: "#b45309", fontWeight: 850 };
