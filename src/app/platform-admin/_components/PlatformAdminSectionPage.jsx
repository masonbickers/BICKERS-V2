"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  getPermissionMatrixRows,
  getRequiredAccessFieldStatus,
  normalizeAppAccess,
  PLATFORM_ROLES,
  REQUIRED_USER_ACCESS_FIELDS,
  ROLE_DEFINITIONS,
} from "../../utils/accessControl";
import PlatformAdminShell from "./PlatformAdminShell";
import {
  authedFetch,
  companyName,
  DEFAULT_COMPANY_ID,
  formatDate,
  Metric,
  moduleLabels,
  Pill,
  statusTone,
  ui,
  userMfaReady,
} from "./platformAdminData";
import { auth } from "../../../../firebaseConfig";

const sectionCopy = {
  dashboard: ["Platform Dashboard", "Companies, users, security warnings and recent events."],
  companies: ["Companies", "Create, review and control tenant settings."],
  branding: ["Branding Settings", "Global and company-specific BAS Software branding."],
  users: ["All Users", "Manage user access, workspace permissions and MFA readiness."],
  employeeLinking: ["Employee Linking", "Repair links between Firebase users and employee records."],
  security: ["Security Centre", "Users and companies that need security attention."],
  mfa: ["MFA Management", "Authenticator readiness and legacy MFA cleanup."],
  roles: ["Roles & Permissions", "Current role model and module permission matrix."],
  auditLogs: ["Audit Logs", "Admin/security changes written to adminAuditLogs."],
  loginSecurity: ["Login Security", "Login, setup-code and lockout activity."],
  cleanup: ["System Cleanup", "Safe cleanup tasks with preview-first behaviour."],
  featureFlags: ["Feature Flags", "Global and company module/security switches."],
  settings: ["Global Settings", "Current operating model and hardening checklist."],
};

function usePlatformData({ includeAudit = false } = {}) {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState({ companies: [], users: [], employees: [], audits: [], loginLogs: [], cleanupPreview: [], platformSettings: {}, stats: {} });
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
        cleanupPreview: platformData.cleanupPreview || [],
        platformSettings: platformData.platformSettings || {},
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
      {notice ? <div style={{ ...ui.card, borderColor: "var(--color-danger-border)", color: "var(--legacy-color-b91c1c)", marginBottom: "var(--space-3)", fontWeight: 900 }}>{notice}</div> : null}
      {section !== "dashboard" && section !== "companies" && section !== "users" ? (
        <Toolbar
          query={query}
          setQuery={setQuery}
          companyFilter={companyFilter}
          setCompanyFilter={setCompanyFilter}
          companies={data.companies}
        />
      ) : null}
      {renderSection(section, { data, audit, filteredUsers, filteredEmployees, loading, load })}
    </PlatformAdminShell>
  );
}

function Toolbar({ query, setQuery, companyFilter, setCompanyFilter, companies }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
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
  if (section === "branding") return <BrandingView {...ctx} />;
  if (section === "users") return <UsersView {...ctx} />;
  if (section === "employeeLinking") return <EmployeeLinkingView {...ctx} />;
  if (section === "security") return <SecurityView {...ctx} />;
  if (section === "mfa") return <MfaView {...ctx} />;
  if (section === "roles") return <RolesView {...ctx} />;
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
  const activeUsers = data.users.filter((u) => u.isEnabled).length;
  const disabledUsers = data.users.filter((u) => !u.isEnabled).length;
  const setupCodeCompanies = data.companies.filter((c) => c.security?.userCodeLogin === true).length;
  const mfaMissing = data.users.filter((u) => !userMfaReady(u)).length;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={ui.grid}>
        <Metric label="Total Companies" value={data.companies.length} />
        <Metric label="Active Companies" value={activeCompanies} tone="green" />
        <Metric label="Disabled Companies" value={disabledCompanies} tone={disabledCompanies ? "amber" : "blue"} />
        <Metric label="Total Users" value={data.users.length} />
        <Metric label="Active Users" value={activeUsers} tone="green" />
        <Metric label="Blocked/Disabled Users" value={disabledUsers} tone={disabledUsers ? "red" : "blue"} />
        <Metric label="MFA Missing Users" value={mfaMissing} tone={mfaMissing ? "amber" : "blue"} />
        <Metric label="Setup-code Login Enabled Companies" value={setupCodeCompanies} tone={setupCodeCompanies ? "amber" : "blue"} />
      </div>
      <QuickActions />
      <Warnings rows={audit.rows} users={data.users} companies={data.companies} />
      <div style={dashboardTwoColumn}>
        <Recent title="Recent Security Events" rows={data.loginLogs} />
        <Recent title="Recent Admin Audit Logs" rows={data.audits} />
      </div>
    </div>
  );
}

function QuickActions() {
  const actions = [
    ["/platform-admin/companies", "Create company"],
    ["/platform-admin/users", "Add user"],
    ["/platform-admin/branding", "Branding Settings"],
    ["/platform-admin/feature-control", "Feature Control"],
    ["/platform-admin/security", "Security Centre"],
    ["/platform-admin/audit-logs", "Audit Logs"],
    ["/platform-admin/cleanup", "System Cleanup"],
  ];

  return (
    <div style={ui.card}>
      <h2 style={heading}>Quick Actions</h2>
      <div style={quickActionGrid}>
        {actions.map(([href, label]) => (
          <Link key={href} href={href} style={quickActionButton}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

const blankCompanyDraft = {
  id: "",
  name: "",
  domain: "",
  status: "active",
  plan: "standard",
  maxUsers: 25,
  modules: {
    diary: true,
    bookings: true,
    workshop: true,
    vehicles: true,
    equipment: true,
    hr: true,
    timesheets: true,
    holidays: true,
    finance: false,
    invoices: false,
    assistant: true,
    mobileApp: true,
    pushNotifications: true,
    passkeys: true,
    mfa: true,
    userCodeLogin: false,
    settings: true,
  },
  security: {
    mfaRequired: true,
    passkeysAllowed: true,
    loginAlerts: true,
    locationAlerts: true,
    userCodeLogin: false,
    rememberMfaDays: 30,
    selfSignup: false,
  },
};

const companySecurityLabels = [
  ["mfaRequired", "MFA required"],
  ["passkeysAllowed", "Passkeys"],
  ["loginAlerts", "Login emails"],
  ["locationAlerts", "Location checks"],
  ["userCodeLogin", "Setup-code login"],
  ["selfSignup", "Self signup"],
];

const featureFlagLabels = [
  ["diary", "Diary"],
  ["bookings", "Bookings / booking pages"],
  ["workshop", "Workshop"],
  ["vehicles", "Vehicles & Equip"],
  ["uCrane", "U-Crane"],
  ["jobSheets", "Job Sheets"],
  ["hr", "HR / Timesheets"],
  ["employees", "Employees"],
  ["hAndS", "H&S"],
  ["statistics", "Statistics"],
  ["timesheets", "Timesheets"],
  ["holidays", "Holidays"],
  ["finance", "Invoicing"],
  ["assistant", "AI Assistant"],
  ["settings", "Settings"],
  ["equipment", "Equipment pages"],
  ["invoices", "Invoice pages"],
  ["mobileApp", "Mobile app"],
  ["pushNotifications", "Push notifications"],
  ["passkeys", "Passkeys"],
  ["mfa", "MFA"],
  ["userCodeLogin", "Setup-code login"],
];

const defaultFeatureFlags = featureFlagLabels.reduce((acc, [key]) => {
  acc[key] = key !== "userCodeLogin";
  return acc;
}, {});

const brandingFields = [
  ["appName", "App name", "BAS Software"],
  ["companyLogo", "Company logo URL", ""],
  ["platformLogo", "Platform logo URL", "/bas-software-logo.png"],
  ["primaryColor", "Primary colour", "var(--color-text)"],
  ["secondaryColor", "Secondary colour", "var(--legacy-color-0369a1)"],
  ["accentColor", "Accent colour", "var(--legacy-color-f59e0b)"],
  ["sidebarColor", "Sidebar colour", "var(--color-text)"],
  ["loginTitle", "Login page title", "BAS Software"],
  ["loginSubtitle", "Login page subtitle", "Secure company access"],
  ["mobileAppName", "Mobile app name", "BAS Mobile"],
];

const defaultBranding = brandingFields.reduce((acc, [key, , fallback]) => {
  acc[key] = fallback;
  return acc;
}, {});

function cloneCompanyDraft(company = blankCompanyDraft) {
  return {
    ...blankCompanyDraft,
    ...company,
    id: company.id || "",
    name: company.name || "",
    modules: { ...blankCompanyDraft.modules, ...(company.modules || {}) },
    security: { ...blankCompanyDraft.security, ...(company.security || {}) },
  };
}

function slugifyCompanyId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function CompaniesView({ data, load }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerMode, setDrawerMode] = useState("");
  const [draft, setDraft] = useState(cloneCompanyDraft());
  const [notice, setNotice] = useState("");
  const [busyCompanyId, setBusyCompanyId] = useState("");

  const companyCounts = useMemo(() => {
    const usersByCompany = data.users.reduce((acc, user) => {
      const companyId = user.companyId || DEFAULT_COMPANY_ID;
      acc[companyId] = (acc[companyId] || 0) + 1;
      return acc;
    }, {});
    const employeesByCompany = data.employees.reduce((acc, employee) => {
      const companyId = employee.companyId || DEFAULT_COMPANY_ID;
      acc[companyId] = (acc[companyId] || 0) + 1;
      return acc;
    }, {});
    return { usersByCompany, employeesByCompany };
  }, [data.employees, data.users]);

  const filteredCompanies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.companies.filter((company) => {
      if (statusFilter !== "all" && company.status !== statusFilter) return false;
      if (!q) return true;
      return [company.id, company.name, company.domain, company.status, company.plan]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data.companies, query, statusFilter]);

  const openCreate = () => {
    setNotice("");
    setDrawerMode("create");
    setDraft(cloneCompanyDraft());
  };

  const openEdit = (company) => {
    setNotice("");
    setDrawerMode("edit");
    setDraft(cloneCompanyDraft(company));
  };

  const closeDrawer = () => {
    setDrawerMode("");
    setDraft(cloneCompanyDraft());
  };

  const patchDraft = (path, value) => {
    setDraft((current) => {
      if (path.length === 1) return { ...current, [path[0]]: value };
      const [parent, key] = path;
      return { ...current, [parent]: { ...(current[parent] || {}), [key]: value } };
    });
  };

  const saveCompany = async (override = null) => {
    const source = override || draft;
    const companyId = source.id || slugifyCompanyId(source.name);
    if (!companyId) {
      setNotice("Company ID or company name is required.");
      return;
    }
    if (!source.name.trim()) {
      setNotice("Company name is required.");
      return;
    }

    setBusyCompanyId(companyId);
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveCompany",
          companyId,
          company: { ...source, id: companyId },
        }),
      });
      await load();
      closeDrawer();
    } catch (error) {
      setNotice(error?.message || "Could not save company.");
    } finally {
      setBusyCompanyId("");
    }
  };

  const setCompanyStatus = async (company, status) => {
    await saveCompany({ ...cloneCompanyDraft(company), status });
  };

  const deleteCompany = async (company) => {
    if (company.id === DEFAULT_COMPANY_ID) {
      setNotice("The primary company cannot be deleted.");
      return;
    }
    const userCount = companyCounts.usersByCompany[company.id] || 0;
    const employeeCount = companyCounts.employeesByCompany[company.id] || 0;
    if (userCount || employeeCount) {
      setNotice(`Archive ${company.name} instead. It has ${userCount} users and ${employeeCount} employees linked.`);
      return;
    }
    if (!confirm(`Delete ${company.name || company.id}? This cannot be undone.`)) return;

    setBusyCompanyId(company.id);
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteCompany", companyId: company.id }),
      });
      await load();
    } catch (error) {
      setNotice(error?.message || "Could not delete company.");
    } finally {
      setBusyCompanyId("");
    }
  };

  return (
    <div style={companiesLayout}>
      <div style={companiesMain}>
        <div style={companiesToolbar}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, domain, status or plan..."
            style={{ ...ui.input, minWidth: 300, flex: "1 1 340px" }}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={ui.input}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
          <button type="button" onClick={openCreate} style={primaryActionButton}>
            Create company
          </button>
        </div>
        {notice ? <div style={companyNotice}>{notice}</div> : null}
        <Table headers={["Company", "Status", "Plan", "Users", "Modules", "Security", "Dates", "Actions"]}>
          {filteredCompanies.map((company) => {
            const userCount = companyCounts.usersByCompany[company.id] || 0;
            const employeeCount = companyCounts.employeesByCompany[company.id] || 0;
            const enabledModules = moduleLabels.filter(([key]) => company.modules?.[key]).map(([, label]) => label);
            const canDelete = company.id !== DEFAULT_COMPANY_ID && userCount === 0 && employeeCount === 0;
            const busy = busyCompanyId === company.id;
            return (
              <tr key={company.id}>
                <Td><strong>{company.name}</strong><Small>{company.domain || "-"}</Small><Small>{company.id}</Small></Td>
                <Td><Pill tone={statusTone(company.status)}>{company.status}</Pill></Td>
                <Td>{company.plan || "-"}</Td>
                <Td>{userCount} / {company.maxUsers || "-"}<Small>{employeeCount} employees</Small></Td>
                <Td>{enabledModules.join(", ") || "-"}</Td>
                <Td>
                  <Pill tone={company.security?.userCodeLogin === false ? "green" : "amber"}>
                    {company.security?.userCodeLogin === false ? "setup-code off" : "setup-code on"}
                  </Pill>
                  <Small>MFA {company.security?.mfaRequired === false ? "optional" : "required"}</Small>
                </Td>
                <Td><Small>Created: {formatDate(company.createdAt)}</Small><Small>Updated: {formatDate(company.updatedAt)}</Small></Td>
                <Td>
                  <div style={companyActionGrid}>
                    <button type="button" onClick={() => openEdit(company)} disabled={busy} style={ui.button}>Edit</button>
                    <Link href={`/platform-admin/companies/${company.id}`} style={{ ...ui.button, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>View</Link>
                    {company.status === "active" ? (
                      <button type="button" onClick={() => setCompanyStatus(company, "suspended")} disabled={busy} style={ui.button}>Suspend</button>
                    ) : (
                      <button type="button" onClick={() => setCompanyStatus(company, "active")} disabled={busy} style={ui.button}>Activate</button>
                    )}
                    <button type="button" onClick={() => setCompanyStatus(company, "archived")} disabled={busy || company.status === "archived"} style={ui.button}>Archive</button>
                    <button
                      type="button"
                      onClick={() => deleteCompany(company)}
                      disabled={busy || !canDelete}
                      title={canDelete ? "Delete company" : "Only empty non-primary companies can be deleted"}
                      style={{ ...ui.dangerButton, opacity: canDelete ? 1 : 0.55, cursor: canDelete ? "pointer" : "not-allowed" }}
                    >
                      Delete
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
          {!filteredCompanies.length ? <tr><Td colSpan={8}>No companies match the current filters.</Td></tr> : null}
        </Table>
      </div>

      {drawerMode ? (
        <CompanyDrawer
          mode={drawerMode}
          draft={draft}
          busy={!!busyCompanyId}
          onClose={closeDrawer}
          onSave={() => saveCompany()}
          onPatch={patchDraft}
        />
      ) : null}
    </div>
  );
}

function CompanyDrawer({ mode, draft, busy, onClose, onSave, onPatch }) {
  const generatedId = draft.id || slugifyCompanyId(draft.name);
  return (
    <aside style={companyDrawer}>
      <div style={drawerHeader}>
        <div>
          <div style={smallCaps}>{mode === "create" ? "New company" : "Edit company"}</div>
          <h2 style={drawerTitle}>{mode === "create" ? "Create company" : draft.name}</h2>
        </div>
        <button type="button" onClick={onClose} style={ui.button}>Close</button>
      </div>

      <div style={drawerFields}>
        <Field label="Company ID">
          <input
            value={mode === "create" ? draft.id : generatedId}
            onChange={(event) => onPatch(["id"], slugifyCompanyId(event.target.value))}
            disabled={mode !== "create"}
            placeholder={slugifyCompanyId(draft.name) || "company-id"}
            style={ui.input}
          />
        </Field>
        <Field label="Company name">
          <input value={draft.name} onChange={(event) => onPatch(["name"], event.target.value)} style={ui.input} />
        </Field>
        <Field label="Domain">
          <input value={draft.domain || ""} onChange={(event) => onPatch(["domain"], event.target.value)} style={ui.input} />
        </Field>
        <Field label="Status">
          <select value={draft.status || "active"} onChange={(event) => onPatch(["status"], event.target.value)} style={ui.input}>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="archived">archived</option>
          </select>
        </Field>
        <Field label="Plan">
          <select value={draft.plan || "standard"} onChange={(event) => onPatch(["plan"], event.target.value)} style={ui.input}>
            <option value="trial">trial</option>
            <option value="standard">standard</option>
            <option value="platform">platform</option>
            <option value="enterprise">enterprise</option>
          </select>
        </Field>
        <Field label="Max users">
          <input type="number" min="1" max="5000" value={draft.maxUsers || 25} onChange={(event) => onPatch(["maxUsers"], event.target.value)} style={ui.input} />
        </Field>
      </div>

      <div style={drawerSection}>
        <h3 style={drawerSubhead}>Modules</h3>
        <div style={toggleGrid}>
          {moduleLabels.map(([key, label]) => (
            <ToggleRow key={key} label={label} checked={draft.modules?.[key] === true} onChange={(checked) => onPatch(["modules", key], checked)} />
          ))}
        </div>
      </div>

      <div style={drawerSection}>
        <h3 style={drawerSubhead}>Security settings</h3>
        <div style={toggleGrid}>
          {companySecurityLabels.map(([key, label]) => (
            <ToggleRow key={key} label={label} checked={draft.security?.[key] === true} onChange={(checked) => onPatch(["security", key], checked)} />
          ))}
        </div>
        <Field label="Remember MFA days">
          <input type="number" min="0" max="90" value={draft.security?.rememberMfaDays ?? 30} onChange={(event) => onPatch(["security", "rememberMfaDays"], event.target.value)} style={ui.input} />
        </Field>
      </div>

      <div style={drawerFooter}>
        <button type="button" onClick={onClose} style={ui.button}>Cancel</button>
        <button type="button" onClick={onSave} disabled={busy} style={primaryActionButton}>{busy ? "Saving..." : "Save company"}</button>
      </div>
    </aside>
  );
}

function Field({ label, children }) {
  return (
    <label style={drawerField}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label style={toggleRow}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ accentColor: "var(--legacy-color-0369a1)" }} />
    </label>
  );
}

const userRoleOptions = ["platformAdmin", "admin", "user"];

function userDefaultWorkspace(appAccess = {}, preferred = "user") {
  if (preferred === "service" && appAccess.service) return "service";
  if (preferred === "user" && appAccess.user) return "user";
  return appAccess.user ? "user" : "service";
}

function UsersView({ data, load }) {
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [enabledFilter, setEnabledFilter] = useState("all");
  const [mfaFilter, setMfaFilter] = useState("all");
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [notice, setNotice] = useState("");
  const [busyUserId, setBusyUserId] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.users.filter((user) => {
      if (companyFilter !== "all" && user.companyId !== companyFilter) return false;
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (enabledFilter === "enabled" && !user.isEnabled) return false;
      if (enabledFilter === "disabled" && user.isEnabled) return false;
      if (mfaFilter === "ready" && !userMfaReady(user)) return false;
      if (mfaFilter === "missing" && userMfaReady(user)) return false;
      if (workspaceFilter !== "all" && user.appAccess?.[workspaceFilter] !== true) return false;
      if (!q) return true;
      return [user.name, user.email, user.uid, user.id].join(" ").toLowerCase().includes(q);
    });
  }, [companyFilter, data.users, enabledFilter, mfaFilter, query, roleFilter, workspaceFilter]);

  const selectedUser = useMemo(
    () => data.users.find((user) => user.id === selectedUserId) || filteredRows[0] || null,
    [data.users, filteredRows, selectedUserId]
  );

  useEffect(() => {
    if (!selectedUserId && filteredRows[0]?.id) setSelectedUserId(filteredRows[0].id);
    if (selectedUserId && !filteredRows.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(filteredRows[0]?.id || "");
    }
  }, [filteredRows, selectedUserId]);

  const callUserAction = async (user, payload) => {
    setBusyUserId(user.id);
    setNotice("");
    try {
      const platformPayload =
        payload.action === "setAccess"
          ? { uid: user.id, action: "Updated user access", patch: { appAccess: payload.appAccess, defaultWorkspace: payload.defaultWorkspace } }
          : payload.action === "setRole"
            ? { uid: user.id, action: "Updated user role", patch: { role: payload.role } }
            : payload.action === "setCompany"
              ? { uid: user.id, action: "Moved user between companies", patch: { companyId: payload.companyId } }
              : payload.action === "setEnabled"
                ? { uid: user.id, action: payload.isEnabled ? "Re-enabled user" : "Disabled user", patch: { isEnabled: payload.isEnabled } }
                : payload.action === "forcePasswordReset"
                  ? { uid: user.id, action: "Forced password reset", patch: { passwordResetRequired: true } }
                  : payload.action === "revokeSessions"
                    ? { uid: user.id, action: "Revoked user sessions", patch: { sessionsRevokedAt: new Date().toISOString() } }
                    : { uid: user.id, action: payload.action || "Updated platform user", patch: payload };
      await authedFetch(payload.action === "resetMfa" ? "/api/platform/users/force-mfa-reset" : "/api/platform/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(platformPayload),
      });
      await load();
      setNotice("User updated.");
    } catch (error) {
      setNotice(error?.message || "Could not update user.");
    } finally {
      setBusyUserId("");
    }
  };

  const updateAccess = (user, nextAccess, requestedWorkspace = user.defaultWorkspace) => {
    const appAccess = { user: nextAccess.user === true, service: nextAccess.service === true };
    if (!appAccess.user && !appAccess.service) {
      setNotice("At least one workspace must stay enabled.");
      return;
    }
    callUserAction(user, {
      action: "setAccess",
      appAccess,
      defaultWorkspace: userDefaultWorkspace(appAccess, requestedWorkspace),
    });
  };

  return (
    <div style={usersLayout}>
      <div style={usersMain}>
        <div style={usersToolbar}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or UID..." style={{ ...ui.input, minWidth: 260, flex: "1 1 280px" }} />
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} style={ui.input}>
            <option value="all">All companies</option>
            {data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} style={ui.input}>
            <option value="all">All roles</option>
            {userRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select value={enabledFilter} onChange={(event) => setEnabledFilter(event.target.value)} style={ui.input}>
            <option value="all">Enabled + disabled</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          <select value={mfaFilter} onChange={(event) => setMfaFilter(event.target.value)} style={ui.input}>
            <option value="all">Any MFA</option>
            <option value="ready">MFA ready</option>
            <option value="missing">MFA missing/reset</option>
          </select>
          <select value={workspaceFilter} onChange={(event) => setWorkspaceFilter(event.target.value)} style={ui.input}>
            <option value="all">Any workspace</option>
            <option value="user">User workspace</option>
            <option value="service">Service workspace</option>
          </select>
        </div>
        {notice ? <div style={userNotice}>{notice}</div> : null}
        <Table headers={["User", "Company", "Role", "Access", "MFA", "Status", "Updated"]}>
          {filteredRows.map((user) => (
            <tr key={user.id} style={selectedUser?.id === user.id ? selectedRowStyle : null}>
              <Td>
                <button type="button" onClick={() => setSelectedUserId(user.id)} style={userSelectButton}>
                  <strong>{user.email}</strong>
                  <Small>{user.name || user.uid}</Small>
                </button>
              </Td>
              <Td>{companyName(data.companies, user.companyId)}<Small>{user.companyId}</Small></Td>
              <Td><Pill tone={["admin", "platformAdmin"].includes(user.role) ? "amber" : "blue"}>{user.role}</Pill></Td>
              <Td><Pill tone={user.appAccess?.user ? "green" : "gray"}>User</Pill> <Pill tone={user.appAccess?.service ? "green" : "gray"}>Service</Pill><Small>Default: {user.defaultWorkspace}</Small></Td>
              <Td><Pill tone={userMfaReady(user) ? "green" : "red"}>{userMfaReady(user) ? "Ready" : "Needs MFA"}</Pill><Small>{user.mfaMethod || "no method"}</Small></Td>
              <Td><Pill tone={user.isEnabled ? "green" : "red"}>{user.isEnabled ? "Enabled" : "Disabled"}</Pill></Td>
              <Td>{formatDate(user.updatedAt)}</Td>
            </tr>
          ))}
          {!filteredRows.length ? <tr><Td colSpan={7}>No users match the current filters.</Td></tr> : null}
        </Table>
      </div>
      <UserDetailPanel
        user={selectedUser}
        companies={data.companies}
        busy={busyUserId === selectedUser?.id}
        onAction={callUserAction}
        onAccess={updateAccess}
      />
    </div>
  );
}

function UserDetailPanel({ user, companies, busy, onAction, onAccess }) {
  if (!user) return <aside style={userPanel}><div style={muted}>Select a user to view details.</div></aside>;
  const appAccess = { user: user.appAccess?.user === true, service: user.appAccess?.service === true };
  return (
    <aside style={userPanel}>
      <div>
        <div style={smallCaps}>User details</div>
        <h2 style={panelTitle}>{user.email}</h2>
        <div style={muted}>{user.name || user.uid}</div>
      </div>
      <div style={detailGrid}>
        <Detail label="UID" value={user.uid} />
        <Detail label="Employee ID" value={user.employeeId || "-"} />
        <Detail label="Created" value={formatDate(user.createdAt)} />
        <Detail label="Updated" value={formatDate(user.updatedAt)} />
        <Detail label="Phone verified" value={user.phoneVerified ? "Yes" : "No"} />
        <Detail label="MFA method" value={user.mfaMethod || "-"} />
        <Detail label="MFA reset required" value={user.mfaResetRequired ? "Yes" : "No"} />
      </div>
      <Field label="Company">
        <select value={user.companyId || DEFAULT_COMPANY_ID} disabled={busy} onChange={(event) => onAction(user, { action: "setCompany", companyId: event.target.value })} style={ui.input}>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </Field>
      <Field label="Role">
        <select value={user.role || "user"} disabled={busy} onChange={(event) => onAction(user, { action: "setRole", role: event.target.value })} style={ui.input}>
          {userRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      </Field>
      <Field label="Default workspace">
        <select value={user.defaultWorkspace || "user"} disabled={busy} onChange={(event) => onAccess(user, appAccess, event.target.value)} style={ui.input}>
          <option value="user" disabled={!appAccess.user}>user</option>
          <option value="service" disabled={!appAccess.service}>service</option>
        </select>
      </Field>
      <div style={toggleGrid}>
        <ToggleRow label="User workspace" checked={appAccess.user} onChange={(checked) => onAccess(user, { ...appAccess, user: checked })} />
        <ToggleRow label="Service workspace" checked={appAccess.service} onChange={(checked) => onAccess(user, { ...appAccess, service: checked })} />
      </div>
      <div style={userActionGrid}>
        <button type="button" disabled={busy} onClick={() => onAction(user, { action: "setEnabled", isEnabled: !user.isEnabled })} style={user.isEnabled ? ui.dangerButton : primaryActionButton}>
          {user.isEnabled ? "Disable user" : "Enable user"}
        </button>
        <button type="button" disabled={busy} onClick={() => onAction(user, { action: "forcePasswordReset" })} style={ui.button}>Force password reset</button>
        <button type="button" disabled={busy} onClick={() => onAction(user, { action: "resetMfa" })} style={ui.button}>Force MFA reset</button>
        <button type="button" disabled={busy} onClick={() => onAction(user, { action: "revokeSessions" })} style={ui.button}>Revoke sessions</button>
      </div>
    </aside>
  );
}

function Detail({ label, value }) {
  return (
    <div style={detailItem}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function EmployeeLinkingView({ data, filteredEmployees, load }) {
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [manualEmployeeId, setManualEmployeeId] = useState("");
  const [manualUserId, setManualUserId] = useState("");

  const userByUid = useMemo(() => new Map(data.users.map((user) => [user.uid || user.id, user])), [data.users]);
  const userById = useMemo(() => new Map(data.users.map((user) => [user.id, user])), [data.users]);
  const userByEmail = useMemo(() => new Map(data.users.map((user) => [user.email, user])), [data.users]);

  const employeeLinkCounts = useMemo(() => {
    return data.employees.reduce((acc, employee) => {
      const linkedUid = employee.authUid || employee.uid;
      if (linkedUid) acc[linkedUid] = (acc[linkedUid] || 0) + 1;
      return acc;
    }, {});
  }, [data.employees]);

  const linkedUids = useMemo(() => {
    return new Set(data.employees.map((employee) => employee.authUid || employee.uid).filter(Boolean));
  }, [data.employees]);

  const employeesWithoutAuth = filteredEmployees.filter((employee) => !(employee.authUid || employee.uid));
  const usersWithoutEmployee = data.users.filter((user) => !user.employeeId && !linkedUids.has(user.uid || user.id));
  const duplicateEmployees = filteredEmployees.filter((employee) => {
    const linkedUid = employee.authUid || employee.uid;
    return linkedUid && employeeLinkCounts[linkedUid] > 1;
  });

  const callLinkAction = async (payload, key) => {
    setBusyKey(key);
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      setNotice("Employee link updated.");
    } catch (error) {
      setNotice(error?.message || "Could not update employee link.");
    } finally {
      setBusyKey("");
    }
  };

  const linkEmployee = (employee, user) => {
    if (!employee || !user) return;
    setBusyKey(`link:${employee.id}:${user.id}`);
    setNotice("");
    authedFetch("/api/platform/employee-linking/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: employee.id, uid: user.uid || user.id }),
    })
      .then(load)
      .then(() => setNotice("Employee link updated."))
      .catch((error) => setNotice(error?.message || "Could not update employee link."))
      .finally(() => setBusyKey(""));
  };

  const unlinkEmployee = (employee, user = null) => {
    callLinkAction(
      { action: "unlinkEmployeeUser", employeeId: employee?.id || "", userId: user?.id || "" },
      `unlink:${employee?.id || user?.id}`
    );
  };

  const repairDuplicate = (employee) => {
    callLinkAction(
      { action: "repairDuplicateEmployeeLink", employeeId: employee.id },
      `repair:${employee.id}`
    );
  };

  const manualEmployee = data.employees.find((employee) => employee.id === manualEmployeeId);
  const manualUser = data.users.find((user) => user.id === manualUserId);

  return (
    <div style={linkingLayout}>
      <div style={linkingStack}>
        {notice ? <div style={userNotice}>{notice}</div> : null}
        <div style={ui.grid}>
          <Metric label="Employees without authUid" value={employeesWithoutAuth.length} tone={employeesWithoutAuth.length ? "amber" : "blue"} />
          <Metric label="Users without employee link" value={usersWithoutEmployee.length} tone={usersWithoutEmployee.length ? "amber" : "blue"} />
          <Metric label="Duplicate UID links" value={duplicateEmployees.length} tone={duplicateEmployees.length ? "red" : "blue"} />
        </div>

        <Panel title="Employees without authUid">
          <Table headers={["Employee", "Company", "Email suggestion", "Action"]}>
            {employeesWithoutAuth.map((employee) => {
              const suggested = employee.email ? userByEmail.get(employee.email) : null;
              return (
                <tr key={employee.id}>
                  <Td><strong>{employee.name || "-"}</strong><Small>{employee.email || employee.id}</Small><Small>{employee.id}</Small></Td>
                  <Td>{companyName(data.companies, employee.companyId)}</Td>
                  <Td>{suggested ? <><Pill tone="blue">{suggested.email}</Pill><Small>{suggested.uid}</Small></> : <Pill tone="amber">No email match</Pill>}</Td>
                  <Td>
                    <button type="button" disabled={!suggested || !!busyKey} onClick={() => linkEmployee(employee, suggested)} style={suggested ? primaryActionButton : ui.button}>
                      Link suggested user
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!employeesWithoutAuth.length ? <tr><Td colSpan={4}>No employees need authUid repair in the current filter.</Td></tr> : null}
          </Table>
        </Panel>

        <Panel title="Users without employee link">
          <Table headers={["User", "Company", "Email suggestion", "Action"]}>
            {usersWithoutEmployee.map((user) => {
              const suggested = data.employees.find((employee) => employee.email && employee.email === user.email && !(employee.authUid || employee.uid));
              return (
                <tr key={user.id}>
                  <Td><strong>{user.email}</strong><Small>{user.name || user.uid}</Small></Td>
                  <Td>{companyName(data.companies, user.companyId)}</Td>
                  <Td>{suggested ? <><Pill tone="blue">{suggested.name || suggested.email}</Pill><Small>{suggested.id}</Small></> : <Pill tone="amber">No email match</Pill>}</Td>
                  <Td>
                    <button type="button" disabled={!suggested || !!busyKey} onClick={() => linkEmployee(suggested, user)} style={suggested ? primaryActionButton : ui.button}>
                      Link suggested employee
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!usersWithoutEmployee.length ? <tr><Td colSpan={4}>No users need an employee link.</Td></tr> : null}
          </Table>
        </Panel>

        <Panel title="Duplicate employee links">
          <Table headers={["Employee", "Linked UID", "Linked user", "Action"]}>
            {duplicateEmployees.map((employee) => {
              const linkedUid = employee.authUid || employee.uid;
              const linkedUser = userByUid.get(linkedUid) || userById.get(linkedUid);
              return (
                <tr key={employee.id}>
                  <Td><strong>{employee.name || "-"}</strong><Small>{employee.email || employee.id}</Small><Small>{employee.id}</Small></Td>
                  <Td>{linkedUid}</Td>
                  <Td>{linkedUser ? linkedUser.email : "-"}</Td>
                  <Td>
                    <button type="button" disabled={!!busyKey} onClick={() => repairDuplicate(employee)} style={ui.button}>
                      Keep this employee
                    </button>
                    <button type="button" disabled={!!busyKey} onClick={() => unlinkEmployee(employee, linkedUser)} style={ui.dangerButton}>
                      Unlink this row
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!duplicateEmployees.length ? <tr><Td colSpan={4}>No duplicate UID links found.</Td></tr> : null}
          </Table>
        </Panel>
      </div>

      <aside style={userPanel}>
        <div>
          <div style={smallCaps}>Manual link</div>
          <h2 style={panelTitle}>Confirm final access link</h2>
          <div style={muted}>Email is only used as a suggestion. The saved link is UID based.</div>
        </div>
        <Field label="Employee">
          <select value={manualEmployeeId} onChange={(event) => setManualEmployeeId(event.target.value)} style={ui.input}>
            <option value="">Select employee</option>
            {data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name || employee.email || employee.id}</option>)}
          </select>
        </Field>
        <Field label="Firebase user">
          <select value={manualUserId} onChange={(event) => setManualUserId(event.target.value)} style={ui.input}>
            <option value="">Select user</option>
            {data.users.map((user) => <option key={user.id} value={user.id}>{user.email || user.uid}</option>)}
          </select>
        </Field>
        <button type="button" disabled={!manualEmployee || !manualUser || !!busyKey} onClick={() => linkEmployee(manualEmployee, manualUser)} style={primaryActionButton}>
          Manual link
        </button>
        {manualEmployee ? (
          <button type="button" disabled={!!busyKey} onClick={() => unlinkEmployee(manualEmployee)} style={ui.dangerButton}>
            Unlink selected employee
          </button>
        ) : null}
        {manualUser ? (
          <button type="button" disabled={!!busyKey} onClick={() => unlinkEmployee(null, manualUser)} style={ui.dangerButton}>
            Clear selected user's employeeId
          </button>
        ) : null}
      </aside>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h2 style={sectionHeading}>{title}</h2>
      {children}
    </section>
  );
}

function SecurityView({ data, audit, load }) {
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const weakCompanies = data.companies.filter((c) => c.security?.mfaRequired === false || c.security?.userCodeLogin !== false || c.security?.loginAlerts === false);
  const riskyRows = audit.rows.filter((row) => ["fail", "warn"].includes(row.status));
  const usersMissingMfa = data.users.filter((user) => !userMfaReady(user));
  const usersMissingPhone = data.users.filter((user) => !user.phoneVerified);
  const mfaResetUsers = data.users.filter((user) => user.mfaResetRequired);
  const disabledUsers = data.users.filter((user) => !user.isEnabled);
  const failedLogins = data.loginLogs.filter((row) => ["failed", "fail", "error", "denied", "blocked"].includes(String(row.status || "").toLowerCase()));
  const setupCodeLogs = data.loginLogs.filter((row) => {
    const method = String(row.loginMethod || "").toLowerCase();
    return method.includes("user-code") || method.includes("usercode") || method.includes("setup");
  });
  const suspiciousRows = [
    ...failedLogins.slice(0, 30),
    ...riskyRows.slice(0, 30).map((row) => ({ ...row, loginMethod: row.source || "audit", email: row.email || row.name || row.uid, employeeId: row.id })),
  ].slice(0, 50);

  const callUserSecurityAction = async (user, payload, label) => {
    setBusyKey(`${label}:${user.id}`);
    setNotice("");
    try {
      await authedFetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      setNotice("Security action completed.");
    } catch (error) {
      setNotice(error?.message || "Security action failed.");
    } finally {
      setBusyKey("");
    }
  };

  const disableSetupCode = async (company) => {
    setBusyKey(`company:${company.id}`);
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveCompany",
          companyId: company.id,
          company: {
            ...company,
            security: { ...(company.security || {}), userCodeLogin: false },
          },
        }),
      });
      await load();
      setNotice("Setup-code login disabled.");
    } catch (error) {
      setNotice(error?.message || "Could not disable setup-code login.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {notice ? <div style={userNotice}>{notice}</div> : null}
      <div style={ui.grid}>
        <Metric label="Users Missing MFA" value={usersMissingMfa.length} tone={usersMissingMfa.length ? "amber" : "blue"} />
        <Metric label="Phone Not Verified" value={usersMissingPhone.length} tone={usersMissingPhone.length ? "amber" : "blue"} />
        <Metric label="MFA Reset Required" value={mfaResetUsers.length} tone={mfaResetUsers.length ? "red" : "blue"} />
        <Metric label="Disabled Users" value={disabledUsers.length} tone={disabledUsers.length ? "red" : "blue"} />
        <Metric label="Failed Logins" value={failedLogins.length} tone={failedLogins.length ? "red" : "blue"} />
        <Metric label="Setup-code Activity" value={setupCodeLogs.length} tone={setupCodeLogs.length ? "amber" : "blue"} />
        <Metric label="Weak Company Settings" value={weakCompanies.length} tone={weakCompanies.length ? "amber" : "blue"} />
      </div>

      <SecurityUserTable
        title="Users missing MFA"
        rows={usersMissingMfa}
        companies={data.companies}
        busyKey={busyKey}
        onUserAction={callUserSecurityAction}
      />
      <SecurityUserTable
        title="Users missing phone verification"
        rows={usersMissingPhone}
        companies={data.companies}
        busyKey={busyKey}
        onUserAction={callUserSecurityAction}
      />
      <SecurityUserTable
        title="Users with mfaResetRequired"
        rows={mfaResetUsers}
        companies={data.companies}
        busyKey={busyKey}
        onUserAction={callUserSecurityAction}
      />
      <SecurityUserTable
        title="Disabled users"
        rows={disabledUsers}
        companies={data.companies}
        busyKey={busyKey}
        onUserAction={callUserSecurityAction}
      />

      <Panel title="Companies with weak security settings">
        <Table headers={["Company", "Issues", "Action"]}>
          {weakCompanies.map((company) => {
            const issues = [
              company.security?.mfaRequired === false ? "MFA not required" : "",
              company.security?.userCodeLogin !== false ? "Setup-code login enabled" : "",
              company.security?.loginAlerts === false ? "Login emails disabled" : "",
            ].filter(Boolean);
            return (
              <tr key={company.id}>
                <Td><strong>{company.name}</strong><Small>{company.id}</Small></Td>
                <Td>{issues.join(", ")}</Td>
                <Td>
                  <button type="button" disabled={busyKey === `company:${company.id}` || company.security?.userCodeLogin === false} onClick={() => disableSetupCode(company)} style={ui.button}>
                    Disable setup-code login
                  </button>
                </Td>
              </tr>
            );
          })}
          {!weakCompanies.length ? <tr><Td colSpan={3}>No weak company security settings found.</Td></tr> : null}
        </Table>
      </Panel>

      <SecurityLogs title="Failed login attempts" rows={failedLogins} />
      <SecurityLogs title="Setup-code login activity" rows={setupCodeLogs} />
      <SecurityLogs title="Suspicious access" rows={suspiciousRows} />
      <Panel title="Security audit warnings">
        <Table headers={["Account", "Status", "Issues"]}>
          {riskyRows.slice(0, 80).map((row) => (
            <tr key={`${row.source}-${row.id || row.employeeIds?.[0]}`}>
              <Td><strong>{row.email || row.name || "-"}</strong><Small>{row.uid || row.id}</Small></Td>
              <Td><Pill tone={row.status === "fail" ? "red" : "amber"}>{row.status}</Pill></Td>
              <Td>{(row.issues || []).join(", ")}</Td>
            </tr>
          ))}
          {!riskyRows.length ? <tr><Td colSpan={3}>No security audit warnings found.</Td></tr> : null}
        </Table>
      </Panel>
    </div>
  );
}

function SecurityUserTable({ title, rows, companies, busyKey, onUserAction }) {
  return (
    <Panel title={title}>
      <Table headers={["User", "Company", "Security", "Status", "Actions"]}>
        {rows.slice(0, 80).map((user) => (
          <tr key={`${title}-${user.id}`}>
            <Td><strong>{user.email}</strong><Small>{user.name || user.uid}</Small></Td>
            <Td>{companyName(companies, user.companyId)}<Small>{user.companyId}</Small></Td>
            <Td>
              <Pill tone={userMfaReady(user) ? "green" : "red"}>{userMfaReady(user) ? "MFA ready" : "MFA needed"}</Pill>{" "}
              <Pill tone={user.phoneVerified ? "green" : "amber"}>{user.phoneVerified ? "Phone verified" : "Phone missing"}</Pill>
              <Small>{user.mfaResetRequired ? "MFA reset required" : user.mfaMethod || "No MFA method"}</Small>
            </Td>
            <Td><Pill tone={user.isEnabled ? "green" : "red"}>{user.isEnabled ? "Enabled" : "Disabled"}</Pill></Td>
            <Td>
              <div style={userActionGrid}>
                <button type="button" disabled={!!busyKey} onClick={() => onUserAction(user, { action: "forceMfaSetup" }, "setup")} style={ui.button}>Force MFA setup</button>
                <button type="button" disabled={!!busyKey} onClick={() => onUserAction(user, { action: "resetMfa" }, "reset")} style={ui.button}>Force MFA reset</button>
                <button type="button" disabled={!!busyKey || !user.isEnabled} onClick={() => onUserAction(user, { action: "setEnabled", isEnabled: false }, "disable")} style={ui.dangerButton}>Disable user</button>
              </div>
            </Td>
          </tr>
        ))}
        {!rows.length ? <tr><Td colSpan={5}>No users in this security category.</Td></tr> : null}
      </Table>
    </Panel>
  );
}

function SecurityLogs({ title, rows }) {
  return (
    <Panel title={title}>
      <Table headers={["When", "User", "Method", "Status"]}>
        {rows.slice(0, 80).map((row) => (
          <tr key={`${title}-${row.id || row.createdAt || row.email}`}>
            <Td>{formatDate(row.createdAt)}</Td>
            <Td>{row.email || row.actorEmail || row.uid || "-"}</Td>
            <Td>{row.loginMethod || row.action || "-"}</Td>
            <Td><Pill tone={String(row.status || "").toLowerCase().includes("fail") ? "red" : "amber"}>{row.status || "review"}</Pill></Td>
          </tr>
        ))}
        {!rows.length ? <tr><Td colSpan={4}>No records found.</Td></tr> : null}
      </Table>
    </Panel>
  );
}

function MfaView({ data, audit, load }) {
  const [notice, setNotice] = useState("");
  const [busyUserId, setBusyUserId] = useState("");
  const rows = audit.rows.filter((row) => row.source === "users");
  const missingMfa = rows.filter((row) => !row.mfaEnabled);
  const legacyRows = rows.filter((row) => row.legacyMfaSecretPresent);
  const resetRows = rows.filter((row) => row.mfaResetRequired);
  const privateMissing = rows.filter((row) => !row.privateMfaSecretPresent);

  const callMfaAction = async (row, action) => {
    setBusyUserId(row.id);
    setNotice("");
    try {
      await authedFetch(`/api/admin/users/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
      setNotice("MFA action completed.");
    } catch (error) {
      setNotice(error?.message || "MFA action failed.");
    } finally {
      setBusyUserId("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {notice ? <div style={userNotice}>{notice}</div> : null}
      <div style={ui.grid}>
        <Metric label="MFA Accounts" value={rows.length} />
        <Metric label="Missing MFA" value={missingMfa.length} tone={missingMfa.length ? "red" : "blue"} />
        <Metric label="MFA Reset Required" value={resetRows.length} tone={resetRows.length ? "amber" : "blue"} />
        <Metric label="Private Secret Missing" value={privateMissing.length} tone={privateMissing.length ? "red" : "blue"} />
        <Metric label="Legacy users.mfaSecret" value={legacyRows.length} tone={legacyRows.length ? "amber" : "blue"} />
      </div>

      <Panel title="MFA status table">
        <Table headers={["User", "Phone", "MFA", "Private Store", "Legacy Secret", "Issues", "Actions"]}>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td><strong>{row.email}</strong><Small>{row.uid}</Small><Small>{row.id}</Small></Td>
              <Td>{row.phone || row.mfaPhoneNumber || "-"}</Td>
              <Td>
                <Pill tone={row.mfaEnabled ? "green" : "red"}>{row.mfaEnabled ? "Enabled" : "Missing"}</Pill>
                <Small>{row.mfaResetRequired ? "Reset required" : row.mfaMethod || "No method"}</Small>
              </Td>
              <Td><Pill tone={row.privateMfaSecretPresent ? "green" : "red"}>{row.privateMfaSecretPresent ? "mfaSecrets/{uid}" : "Missing"}</Pill></Td>
              <Td><Pill tone={row.legacyMfaSecretPresent ? "amber" : "green"}>{row.legacyMfaSecretPresent ? "Legacy found" : "Clean"}</Pill></Td>
              <Td>{(row.issues || []).join(", ") || "-"}</Td>
              <Td>
                <div style={userActionGrid}>
                  <button type="button" disabled={busyUserId === row.id} onClick={() => callMfaAction(row, "resetMfa")} style={ui.button}>
                    Force reset
                  </button>
                  <button type="button" disabled={busyUserId === row.id} onClick={() => callMfaAction(row, "forceMfaSetup")} style={ui.button}>
                    Mark reset required
                  </button>
                  <button type="button" disabled={busyUserId === row.id || !row.legacyMfaSecretPresent} onClick={() => callMfaAction(row, "clearLegacyMfaSecret")} style={row.legacyMfaSecretPresent ? ui.dangerButton : ui.button}>
                    Clear legacy secret
                  </button>
                </div>
              </Td>
            </tr>
          ))}
          {!rows.length ? <tr><Td colSpan={7}>No MFA audit rows found.</Td></tr> : null}
        </Table>
      </Panel>
    </div>
  );
}

function RolesView({ data }) {
  const matrixRows = getPermissionMatrixRows();
  const users = data?.users || [];
  const sampleAccessFields = getRequiredAccessFieldStatus(users[0] || {});
  const missingCompanyId = users.filter((user) => !user.companyId).length;
  const disabledUsers = users.filter((user) => user.isEnabled === false).length;
  const missingAppAccess = users.filter((user) => !user.appAccess || typeof user.appAccess !== "object").length;
  const invalidDefaultWorkspace = users.filter((user) => {
    const appAccess = normalizeAppAccess(user);
    return user.defaultWorkspace === "service" ? !appAccess.service : user.defaultWorkspace === "user" ? !appAccess.user : false;
  }).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={ui.grid}>
        <Metric label="Defined Roles" value={PLATFORM_ROLES.length} detail="Canonical platform role model" />
        <Metric label="Required User Fields" value={REQUIRED_USER_ACCESS_FIELDS.length} detail="role, access, workspace, company, enabled" />
        <Metric label="Users Missing Company" value={missingCompanyId} tone={missingCompanyId ? "amber" : "green"} detail="Company-scoped access needs companyId" />
        <Metric label="Workspace Mismatches" value={invalidDefaultWorkspace} tone={invalidDefaultWorkspace ? "amber" : "green"} detail="Default workspace must be enabled" />
        <Metric label="Missing appAccess" value={missingAppAccess} tone={missingAppAccess ? "amber" : "green"} detail="Legacy fallback may be used" />
        <Metric label="Disabled Users" value={disabledUsers} tone={disabledUsers ? "red" : "green"} detail="isEnabled is the master switch" />
      </div>

      <section style={ui.card}>
        <h2 style={heading}>Role Model</h2>
        <div style={{ ...ui.grid, marginTop: "var(--space-3)" }}>
          {PLATFORM_ROLES.map((role) => {
            const def = ROLE_DEFINITIONS[role];
            return (
              <div key={role} style={{ border: "1px solid var(--legacy-color-e2e8f0)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", background: "var(--color-surface-subtle)" }}>
                <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "var(--color-text)" }}>{def.label}</strong>
                  <Pill tone={role === "platformAdmin" ? "blue" : "gray"}>{def.scope}</Pill>
                </div>
                <div style={{ marginTop: "var(--space-2)", color: "var(--legacy-color-475569)", fontSize: "var(--font-size-sm)", fontWeight: 750 }}>{def.description}</div>
                <div style={{ marginTop: "var(--space-2)", color: "var(--color-text-subtle)", fontSize: "var(--font-size-xs)", fontWeight: 900 }}>Default: {def.defaultWorkspace}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={ui.card}>
        <h2 style={heading}>Permission Matrix</h2>
        <div style={{ marginTop: "var(--space-1)", color: "var(--color-text-subtle)", fontSize: "var(--font-size-sm)", fontWeight: 800 }}>
          Module permissions come from the shared access-control helpers and are combined with company modules, appAccess and isEnabled checks.
        </div>
        <div style={{ marginTop: "var(--space-3)" }}>
          <Table headers={["Module", ...PLATFORM_ROLES.map((role) => ROLE_DEFINITIONS[role].label)]}>
            {matrixRows.map((row) => (
              <tr key={row.moduleKey}>
                <Td><strong>{row.moduleLabel}</strong></Td>
                {PLATFORM_ROLES.map((role) => (
                  <Td key={`${row.moduleKey}-${role}`}>{row.permissions[role]}</Td>
                ))}
              </tr>
            ))}
          </Table>
        </div>
      </section>

      <section style={ui.card}>
        <h2 style={heading}>Required User Access Fields</h2>
        <div style={{ marginTop: "var(--space-1)", color: "var(--color-text-subtle)", fontSize: "var(--font-size-sm)", fontWeight: 800 }}>
          Every user record should carry these fields so access decisions do not rely on email or duplicated permission rules.
        </div>
        <div style={{ marginTop: "var(--space-3)" }}>
          <Table headers={["Field", "Current sample", "Status", "Purpose"]}>
            {sampleAccessFields.map((field) => (
              <tr key={field.field}>
                <Td><strong>{field.field}</strong></Td>
                <Td>{field.value}</Td>
                <Td><Pill tone={field.status === "Missing" || field.status === "Disabled" ? "red" : field.status === "Defaulted" ? "amber" : "green"}>{field.status}</Pill></Td>
                <Td>{field.detail}</Td>
              </tr>
            ))}
          </Table>
        </div>
      </section>

      <section style={ui.card}>
        <h2 style={heading}>Access Rules</h2>
        <div style={{ display: "grid", gap: "var(--space-2)", marginTop: 10 }}>
          {[
            "platformAdmin is verified server-side before platform admin routes and APIs are available.",
            "admin can manage application users and security workflows.",
            "user workspace access is controlled through appAccess.user and appAccess.service.",
            "disabled users have no active application access.",
            "Module access should be checked through shared helpers before page-specific behaviour is applied.",
          ].map((item) => (
            <div key={item} style={warningLine}>{item}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AuditLogsView({ data }) {
  const [companyFilter, setCompanyFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [securityOnly, setSecurityOnly] = useState(false);

  const actions = useMemo(() => {
    return [...new Set((data.audits || []).map((row) => row.action).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [data.audits]);

  const filteredRows = useMemo(() => {
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const toMs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : 0;
    return (data.audits || []).filter((row) => {
      const createdMs = new Date(row.createdAt || 0).getTime();
      if (companyFilter !== "all" && row.companyId !== companyFilter) return false;
      if (userFilter !== "all" && row.targetUserId !== userFilter && row.actorUid !== userFilter && row.actorEmail !== userFilter) return false;
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      if (fromMs && createdMs < fromMs) return false;
      if (toMs && createdMs > toMs) return false;
      if (securityOnly && !isSecurityAuditRow(row)) return false;
      return true;
    });
  }, [actionFilter, companyFilter, data.audits, fromDate, securityOnly, toDate, userFilter]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={ui.grid}>
        <Metric label="Audit Rows" value={(data.audits || []).length} detail="Loaded from adminAuditLogs" />
        <Metric label="Filtered Rows" value={filteredRows.length} />
        <Metric label="Security Rows" value={(data.audits || []).filter(isSecurityAuditRow).length} tone="amber" />
        <Metric label="Actors" value={new Set((data.audits || []).map((row) => row.actorEmail || row.actorUid).filter(Boolean)).size} />
      </div>

      <section style={usersToolbar}>
        <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} style={ui.input}>
          <option value="all">All companies</option>
          {data.companies.map((company) => (
            <option key={company.id} value={company.id}>{company.name || company.id}</option>
          ))}
        </select>
        <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} style={ui.input}>
          <option value="all">All users</option>
          {data.users.map((user) => (
            <option key={user.uid || user.id} value={user.uid || user.id}>{user.email || user.uid || user.id}</option>
          ))}
        </select>
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} style={{ ...ui.input, minWidth: 220 }}>
          <option value="all">All action types</option>
          {actions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
        <label style={auditDateField}>
          From
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} style={ui.input} />
        </label>
        <label style={auditDateField}>
          To
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} style={ui.input} />
        </label>
        <label style={auditToggle}>
          <input type="checkbox" checked={securityOnly} onChange={(event) => setSecurityOnly(event.target.checked)} />
          Security only
        </label>
      </section>

      <Table headers={["When", "Actor", "Role", "Target", "Company", "Action", "Before", "After", "Request"]}>
        {filteredRows.map((row) => (
          <tr key={row.id}>
            <Td>{formatDate(row.createdAt)}<Small>{row.id}</Small></Td>
            <Td><strong>{row.actorEmail || "-"}</strong><Small>{row.actorUid || "-"}</Small></Td>
            <Td>{row.actorRole || "-"}</Td>
            <Td><Pill tone={row.targetType === "user" ? "blue" : row.targetType === "company" ? "green" : "gray"}>{row.targetType || "-"}</Pill><Small>{row.targetId || row.targetUserId || "-"}</Small></Td>
            <Td>{companyName(data.companies, row.companyId || "")}</Td>
            <Td><strong>{row.action || "-"}</strong><Small>{row.area || ""}</Small></Td>
            <Td><AuditJson value={row.before} /></Td>
            <Td><AuditJson value={row.after} /></Td>
            <Td>{row.ip || "-"}<Small>{row.userAgent || ""}</Small></Td>
          </tr>
        ))}
        {!filteredRows.length ? <tr><Td colSpan={9}>No audit records match the current filters.</Td></tr> : null}
      </Table>
    </div>
  );
}

function LoginLogsView({ data }) {
  const rows = data.loginLogs || [];
  const successful = rows.filter(isSuccessfulLoginLog);
  const failed = rows.filter(isFailedLoginLog);
  const mfaRows = rows.filter(isMfaLoginLog);
  const mfaFailures = mfaRows.filter(isFailedLoginLog);
  const setupCodeRows = rows.filter(isSetupCodeLoginLog);
  const lockedRows = rows.filter(isLockedLoginLog);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={ui.grid}>
        <Metric label="Successful Logins" value={successful.length} tone="green" />
        <Metric label="Failed Logins" value={failed.length} tone={failed.length ? "red" : "blue"} />
        <Metric label="MFA Failures" value={mfaFailures.length} tone={mfaFailures.length ? "red" : "blue"} />
        <Metric label="Setup-code Attempts" value={setupCodeRows.length} tone={setupCodeRows.length ? "amber" : "blue"} />
        <Metric label="Locked/Rate-limited" value={lockedRows.length} tone={lockedRows.length ? "red" : "blue"} />
        <Metric label="Device Info Rows" value={rows.filter((row) => row.userAgent || row.device).length} />
        <Metric label="Location Rows" value={rows.filter((row) => row.location || row.ip).length} />
      </div>

      <Table headers={["When", "User", "Category", "Status", "Method", "Device info", "Location", "Reason"]}>
        {rows.map((row) => (
          <tr key={row.id}>
            <Td>{formatDate(row.createdAt)}<Small>{row.id}</Small></Td>
            <Td><strong>{row.email || "-"}</strong><Small>{row.uid || row.employeeId || "-"}</Small></Td>
            <Td>{loginLogCategories(row).map((category) => <Pill key={category} tone={loginCategoryTone(category)}>{category}</Pill>)}</Td>
            <Td><Pill tone={isSuccessfulLoginLog(row) ? "green" : isFailedLoginLog(row) || isLockedLoginLog(row) ? "red" : "amber"}>{row.status || row.outcome || "-"}</Pill></Td>
            <Td>{row.loginMethod || "-"}</Td>
            <Td>{row.device || "-"}<Small>{row.userAgent || ""}</Small></Td>
            <Td>{row.location || "-"}<Small>{row.ip || ""}</Small></Td>
            <Td>{row.reason || row.emailFailure || "-"}</Td>
          </tr>
        ))}
        {!rows.length ? <tr><Td colSpan={8}>No login security logs found.</Td></tr> : null}
      </Table>
    </div>
  );
}

function CleanupView({ data, load }) {
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [cleanupCompanyId, setCleanupCompanyId] = useState("");
  const [busyTaskId, setBusyTaskId] = useState("");
  const [notice, setNotice] = useState("");
  const tasks = data.cleanupPreview || [];
  const companies = data.companies || [];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null;
  const selectedCompanyId = cleanupCompanyId || companies[0]?.id || "bickers-action";
  const totalFindings = tasks.reduce((sum, task) => sum + Number(task.count || 0), 0);
  const runnableFindings = tasks.filter((task) => task.canRun).reduce((sum, task) => sum + Number(task.count || 0), 0);
  const businessRunnableFindings = tasks
    .filter((task) => task.canRun && task.businessData)
    .reduce((sum, task) => sum + Number(task.count || 0), 0);

  const runTask = async (task) => {
    if (!task?.canRun || !task.count) return;
    if (task.businessData && !selectedCompanyId) {
      setNotice("Choose a company before applying this business data cleanup.");
      return;
    }
    if (confirmText !== task.id) {
      setNotice(`Type ${task.id} to confirm this cleanup.`);
      return;
    }
    if (!confirm(`${task.label}: apply cleanup to ${task.count} row(s)?`)) return;

    setBusyTaskId(task.id);
    setNotice("");
    try {
      const result = await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runCleanupTask", taskId: task.id, confirm: true, companyId: task.businessData ? selectedCompanyId : undefined }),
      });
      await load();
      setConfirmText("");
      setNotice(`Cleanup complete. Changed ${result.changed || 0} row(s).`);
    } catch (error) {
      setNotice(error?.message || "Cleanup failed.");
    } finally {
      setBusyTaskId("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={ui.grid}>
        <Metric label="Cleanup Tasks" value={tasks.length} detail="Preview-first checks" />
        <Metric label="Findings" value={totalFindings} tone={totalFindings ? "amber" : "green"} />
        <Metric label="Runnable Findings" value={runnableFindings} tone={runnableFindings ? "amber" : "green"} detail="Require confirmation" />
        <Metric label="Business Data Actions" value={businessRunnableFindings} tone={businessRunnableFindings ? "amber" : "green"} detail="Backfill companyId only" />
      </div>

      {notice ? <div style={companyNotice}>{notice}</div> : null}

      <div style={cleanupLayout}>
        <section style={cleanupTaskList}>
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => {
                setSelectedTaskId(task.id);
                setConfirmText("");
                setNotice("");
              }}
              style={{
                ...cleanupTaskButton,
                borderColor: selectedTask?.id === task.id ? "var(--legacy-color-0369a1)" : "var(--legacy-color-e2e8f0)",
                background: selectedTask?.id === task.id ? "var(--legacy-color-f0f9ff)" : "var(--color-white)",
              }}
            >
              <span>
                <strong>{task.label}</strong>
                <Small>{task.safeAction}</Small>
              </span>
              <Pill tone={task.count ? task.destructive ? "red" : "amber" : "green"}>{task.count}</Pill>
            </button>
          ))}
        </section>

        <section style={ui.card}>
          {selectedTask ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start" }}>
                <div>
                  <h2 style={heading}>{selectedTask.label}</h2>
                  <div style={{ ...muted, marginTop: "var(--space-1)" }}>{selectedTask.safeAction}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Pill tone={selectedTask.businessData ? "amber" : "blue"}>{selectedTask.businessData ? "Business data" : "Access/security"}</Pill>
                  {selectedTask.destructive ? <Pill tone="red">Destructive</Pill> : <Pill tone="green">Safe scoped</Pill>}
                </div>
              </div>

              <div style={{ marginTop: "var(--space-3)" }}>
                <Table headers={["Preview item", "Details"]}>
                  {(selectedTask.preview || []).map((row, index) => (
                    <tr key={`${selectedTask.id}-${row.id || index}`}>
                      <Td><strong>{row.id || row.uid || row.email || row.collection || `Row ${index + 1}`}</strong><Small>{row.collection || row.companyId || row.email || ""}</Small></Td>
                      <Td><AuditJson value={row} /></Td>
                    </tr>
                  ))}
                  {!selectedTask.preview?.length ? <tr><Td colSpan={2}>No rows found for this cleanup task.</Td></tr> : null}
                </Table>
              </div>

              <div style={cleanupActionBox}>
                <div>
                  <strong>Confirmation</strong>
                  <Small>
                    {selectedTask.canRun
                      ? `Preview first, then type ${selectedTask.id} before applying. All changes write to adminAuditLogs.`
                      : "This task is preview-only here. Use the linked management area or a dedicated migration."}
                  </Small>
                </div>
                {selectedTask.canRun ? (
                  <>
                    {selectedTask.businessData ? (
                      <select
                        value={selectedCompanyId}
                        onChange={(event) => setCleanupCompanyId(event.target.value)}
                        style={{ ...ui.input, minWidth: 220 }}
                      >
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>{company.name || company.id}</option>
                        ))}
                        {!companies.length ? <option value="bickers-action">Bickers Action</option> : null}
                      </select>
                    ) : null}
                    <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder={`Type ${selectedTask.id}`} style={{ ...ui.input, minWidth: 220 }} />
                    <button
                      type="button"
                      onClick={() => runTask(selectedTask)}
                      disabled={busyTaskId === selectedTask.id || !selectedTask.count || confirmText !== selectedTask.id}
                      style={selectedTask.destructive ? ui.dangerButton : ui.button}
                    >
                      {busyTaskId === selectedTask.id ? "Running..." : "Apply cleanup"}
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div style={muted}>No cleanup preview is available.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function BrandingView({ data, load }) {
  const [globalDraft, setGlobalDraft] = useState(() => ({ ...defaultBranding, ...(data.platformSettings?.branding || {}) }));
  const [companyDrafts, setCompanyDrafts] = useState(() => companyBrandingDrafts(data.companies));
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setGlobalDraft({ ...defaultBranding, ...(data.platformSettings?.branding || {}) });
    setCompanyDrafts(companyBrandingDrafts(data.companies));
  }, [data.companies, data.platformSettings]);

  const patchGlobal = (key, value) => setGlobalDraft((current) => ({ ...current, [key]: value }));
  const patchCompany = (companyId, key, value) => {
    setCompanyDrafts((current) => ({
      ...current,
      [companyId]: { ...defaultBranding, ...(current[companyId] || {}), [key]: value },
    }));
  };

  const saveGlobal = async () => {
    setBusyKey("global");
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveGlobalBranding", branding: globalDraft }),
      });
      await load();
      setNotice("Global branding saved to settings/platformBranding.");
    } catch (error) {
      setNotice(error?.message || "Could not save global branding.");
    } finally {
      setBusyKey("");
    }
  };

  const saveCompany = async (company) => {
    setBusyKey(company.id);
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveCompanyBranding", companyId: company.id, branding: companyDrafts[company.id] || defaultBranding }),
      });
      await load();
      setNotice(`${company.name || company.id} branding saved.`);
    } catch (error) {
      setNotice(error?.message || "Could not save company branding.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={ui.grid}>
        <Metric label="Global Branding" value="1" detail="settings/platformBranding" />
        <Metric label="Company Overrides" value={data.companies.filter((company) => Object.keys(company.branding || {}).length).length} />
        <Metric label="Brand Fields" value={brandingFields.length} />
        <Metric label="Companies" value={data.companies.length} />
      </div>

      {notice ? <div style={companyNotice}>{notice}</div> : null}

      <section style={ui.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={heading}>Global Branding</h2>
            <div style={{ ...muted, marginTop: "var(--space-1)" }}>Stored in settings/platformBranding and used as the platform default.</div>
          </div>
          <button type="button" onClick={saveGlobal} disabled={busyKey === "global"} style={primaryActionButton}>
            {busyKey === "global" ? "Saving..." : "Save global branding"}
          </button>
        </div>
        <BrandingForm draft={globalDraft} onPatch={patchGlobal} />
      </section>

      <Table headers={["Company", "Brand preview", "Logos", "Colours", "Login/Mobile", "Action"]}>
        {data.companies.map((company) => {
          const draft = companyDrafts[company.id] || companyBranding(company);
          return (
            <tr key={company.id}>
              <Td><strong>{company.name}</strong><Small>{company.id}</Small></Td>
              <Td><BrandPreview branding={draft} /></Td>
              <Td>
                <Field label="Company logo">
                  <input value={draft.companyLogo || ""} onChange={(event) => patchCompany(company.id, "companyLogo", event.target.value)} style={ui.input} />
                </Field>
                <Field label="Platform logo">
                  <input value={draft.platformLogo || ""} onChange={(event) => patchCompany(company.id, "platformLogo", event.target.value)} style={ui.input} />
                </Field>
              </Td>
              <Td>
                {["primaryColor", "secondaryColor", "accentColor", "sidebarColor"].map((key) => (
                  <ColourInput key={key} label={brandingFields.find(([field]) => field === key)?.[1] || key} value={draft[key] || ""} onChange={(value) => patchCompany(company.id, key, value)} />
                ))}
              </Td>
              <Td>
                <Field label="Login title"><input value={draft.loginTitle || ""} onChange={(event) => patchCompany(company.id, "loginTitle", event.target.value)} style={ui.input} /></Field>
                <Field label="Mobile app"><input value={draft.mobileAppName || ""} onChange={(event) => patchCompany(company.id, "mobileAppName", event.target.value)} style={ui.input} /></Field>
              </Td>
              <Td>
                <button type="button" onClick={() => saveCompany(company)} disabled={busyKey === company.id} style={ui.button}>
                  {busyKey === company.id ? "Saving..." : "Save"}
                </button>
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

function BrandingForm({ draft, onPatch }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
      <BrandPreview branding={draft} />
      <div style={drawerFields}>
        {brandingFields.map(([key, label]) => (
          key.toLowerCase().includes("color") || key.toLowerCase().includes("colour") ? (
            <ColourInput key={key} label={label} value={draft[key] || ""} onChange={(value) => onPatch(key, value)} />
          ) : (
            <Field key={key} label={label}>
              <input value={draft[key] || ""} onChange={(event) => onPatch(key, event.target.value)} style={ui.input} />
            </Field>
          )
        ))}
      </div>
    </div>
  );
}

function ColourInput({ label, value, onChange }) {
  return (
    <Field label={label}>
      <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "var(--color-text)"} onChange={(event) => onChange(event.target.value)} style={colourSwatchInput} />
        <input value={value} onChange={(event) => onChange(event.target.value)} style={{ ...ui.input, minWidth: 110, flex: 1 }} />
      </span>
    </Field>
  );
}

function BrandPreview({ branding }) {
  return (
    <div style={{ ...brandPreview, borderColor: branding.secondaryColor || "var(--legacy-color-0369a1)" }}>
      <div style={{ ...brandPreviewSidebar, background: branding.sidebarColor || "var(--color-text)" }} />
      <div>
        <strong style={{ color: branding.primaryColor || "var(--color-text)" }}>{branding.appName || "BAS Software"}</strong>
        <Small>{branding.loginTitle || "Login page"} · {branding.mobileAppName || "Mobile app"}</Small>
        <span style={{ display: "flex", gap: 6, marginTop: "var(--space-2)" }}>
          {["primaryColor", "secondaryColor", "accentColor"].map((key) => <span key={key} style={{ ...brandSwatch, background: branding[key] || "var(--legacy-color-cbd5e1)" }} />)}
        </span>
      </div>
    </div>
  );
}

function FeatureFlagsView({ data, load }) {
  const [globalDraft, setGlobalDraft] = useState(() => ({ ...defaultFeatureFlags, ...(data.platformSettings?.featureFlags || {}) }));
  const [companyDrafts, setCompanyDrafts] = useState(() => companyFeatureDrafts(data.companies));
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setGlobalDraft({ ...defaultFeatureFlags, ...(data.platformSettings?.featureFlags || {}) });
    setCompanyDrafts(companyFeatureDrafts(data.companies));
  }, [data.companies, data.platformSettings]);

  const patchGlobal = (key, checked) => setGlobalDraft((current) => ({ ...current, [key]: checked }));
  const patchCompany = (companyId, key, checked) => {
    setCompanyDrafts((current) => ({
      ...current,
      [companyId]: { ...(current[companyId] || defaultFeatureFlags), [key]: checked },
    }));
  };

  const saveGlobal = async () => {
    setBusyKey("global");
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveGlobalFeatureFlags", featureFlags: globalDraft }),
      });
      await load();
      setNotice("Global feature flags saved to settings/platformFeatures.");
    } catch (error) {
      setNotice(error?.message || "Could not save global feature flags.");
    } finally {
      setBusyKey("");
    }
  };

  const saveCompany = async (company) => {
    setBusyKey(company.id);
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveCompanyFeatureFlags", companyId: company.id, featureFlags: companyDrafts[company.id] || defaultFeatureFlags }),
      });
      await load();
      setNotice(`${company.name || company.id} feature flags saved.`);
    } catch (error) {
      setNotice(error?.message || "Could not save company feature flags.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={ui.grid}>
        <Metric label="Global Flags" value={featureFlagLabels.length} detail="settings/platformFeatures" />
        <Metric label="Companies" value={data.companies.length} detail="Per-company overrides" />
        <Metric label="Global Enabled" value={featureFlagLabels.filter(([key]) => globalDraft[key]).length} tone="green" />
        <Metric label="Global Disabled" value={featureFlagLabels.filter(([key]) => !globalDraft[key]).length} tone="amber" />
      </div>

      {notice ? <div style={companyNotice}>{notice}</div> : null}

      <section style={ui.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={heading}>Global Feature Flags</h2>
            <div style={{ ...muted, marginTop: "var(--space-1)" }}>Stored in settings/platformFeatures with compatibility mirroring to settings/platform.</div>
          </div>
          <button type="button" onClick={saveGlobal} disabled={busyKey === "global"} style={primaryActionButton}>
            {busyKey === "global" ? "Saving..." : "Save global flags"}
          </button>
        </div>
        <div style={{ ...toggleGrid, marginTop: "var(--space-3)" }}>
          {featureFlagLabels.map(([key, label]) => (
            <ToggleRow key={key} label={label} checked={globalDraft[key] === true} onChange={(checked) => patchGlobal(key, checked)} />
          ))}
        </div>
      </section>

      <Table headers={["Company", ...featureFlagLabels.map(([, label]) => label), "Action"]}>
        {data.companies.map((company) => {
          const draft = companyDrafts[company.id] || companyFeatureFlags(company);
          return (
            <tr key={company.id}>
              <Td><strong>{company.name}</strong><Small>{company.id}</Small></Td>
              {featureFlagLabels.map(([key, label]) => (
                <Td key={`${company.id}-${key}`}>
                  <label style={featureMiniToggle}>
                    <input type="checkbox" checked={draft[key] === true} onChange={(event) => patchCompany(company.id, key, event.target.checked)} style={{ accentColor: "var(--legacy-color-0369a1)" }} />
                    <span>{draft[key] ? "On" : "Off"}</span>
                  </label>
                </Td>
              ))}
              <Td>
                <button type="button" onClick={() => saveCompany(company)} disabled={busyKey === company.id} style={ui.button}>
                  {busyKey === company.id ? "Saving..." : "Save"}
                </button>
              </Td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

function SettingsView() {
  const items = [
    "Platform Admin is the highest-level role and is enforced server-side from users/{uid}.role.",
    "Sensitive actions use server API routes and Admin SDK/REST writes.",
    "Every platform mutation writes to adminAuditLogs.",
    "Global branding is stored in settings/platformBranding.",
    "Global features are stored in settings/platformFeatures.",
    "Company branding is stored in platformCompanies/{companyId}.branding.",
    "Company feature/module flags are stored in platformCompanies/{companyId}.modules.",
    "MFA secrets stay server-only in mfaSecrets/{uid} and are never rendered in the UI.",
    "Business data repair actions are preview-first and avoid destructive deletes unless explicitly confirmed.",
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
      <div style={{ padding: "var(--space-3)", borderBottom: "1px solid var(--color-border)" }}><h2 style={heading}>{title}</h2></div>
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
  return <div style={{ marginTop: 3, color: "var(--color-text-subtle)", fontSize: "var(--font-size-xs)", fontWeight: 800 }}>{children}</div>;
}

function AuditJson({ value }) {
  if (value === null || value === undefined || value === "") return "-";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <pre style={auditJson}>{text.length > 900 ? `${text.slice(0, 900)}...` : text}</pre>;
}

function isSecurityAuditRow(row = {}) {
  const haystack = [
    row.action,
    row.area,
    row.targetType,
    row.details?.action,
    row.details?.targetType,
  ].join(" ").toLowerCase();
  return [
    "security",
    "mfa",
    "passkey",
    "password",
    "session",
    "login",
    "setup",
    "disabled",
    "enabled user",
    "account",
  ].some((term) => haystack.includes(term));
}

function loginLogText(row = {}) {
  return [row.loginMethod, row.status, row.outcome, row.reason, row.emailFailure].join(" ").toLowerCase();
}

function isSuccessfulLoginLog(row = {}) {
  const text = loginLogText(row);
  return text.includes("success") || text.includes("trusted-device") || text.includes("issued");
}

function isFailedLoginLog(row = {}) {
  const text = loginLogText(row);
  return text.includes("fail") || text.includes("invalid") || text.includes("disabled");
}

function isMfaLoginLog(row = {}) {
  return loginLogText(row).includes("mfa");
}

function isSetupCodeLoginLog(row = {}) {
  return loginLogText(row).includes("user-code") || loginLogText(row).includes("setup-code");
}

function isLockedLoginLog(row = {}) {
  const text = loginLogText(row);
  return text.includes("rate-limited") || text.includes("locked") || text.includes("too many") || text.includes("blocked");
}

function loginLogCategories(row = {}) {
  const categories = [];
  if (isSuccessfulLoginLog(row)) categories.push("Success");
  if (isFailedLoginLog(row)) categories.push("Failed");
  if (isMfaLoginLog(row)) categories.push("MFA");
  if (isSetupCodeLoginLog(row)) categories.push("Setup-code");
  if (isLockedLoginLog(row)) categories.push("Locked");
  if (row.userAgent || row.device) categories.push("Device");
  if (row.location || row.ip) categories.push("Location");
  return categories.length ? categories : ["Login"];
}

function loginCategoryTone(category) {
  if (category === "Success") return "green";
  if (category === "Failed" || category === "Locked") return "red";
  if (category === "MFA" || category === "Setup-code") return "amber";
  return "blue";
}

function companyFeatureFlags(company = {}) {
  return {
    ...defaultFeatureFlags,
    diary: company.modules?.diary === true,
    bookings: company.modules?.bookings !== false,
    workshop: company.modules?.workshop === true,
    vehicles: company.modules?.vehicles === true,
    equipment: company.modules?.equipment === true,
    uCrane: company.modules?.uCrane !== false,
    jobSheets: company.modules?.jobSheets !== false,
    employees: company.modules?.employees !== false,
    hr: company.modules?.hr === true,
    hAndS: company.modules?.hAndS !== false,
    statistics: company.modules?.statistics !== false,
    timesheets: company.modules?.timesheets !== false,
    holidays: company.modules?.holidays !== false,
    finance: company.modules?.finance === true,
    invoices: company.modules?.invoices !== false,
    assistant: company.modules?.assistant === true,
    mobileApp: company.modules?.mobileApp ?? (company.featureFlags?.mobileApp !== false),
    pushNotifications: company.modules?.pushNotifications ?? (company.featureFlags?.pushNotifications !== false),
    mfa: company.modules?.mfa ?? (company.security?.mfaRequired !== false),
    passkeys: company.security?.passkeysAllowed === true,
    userCodeLogin: company.security?.userCodeLogin === true,
    settings: company.modules?.settings !== false,
  };
}

function companyFeatureDrafts(companies = []) {
  return companies.reduce((acc, company) => {
    acc[company.id] = companyFeatureFlags(company);
    return acc;
  }, {});
}

function companyBranding(company = {}) {
  return { ...defaultBranding, ...(company.branding || {}) };
}

function companyBrandingDrafts(companies = []) {
  return companies.reduce((acc, company) => {
    acc[company.id] = companyBranding(company);
    return acc;
  }, {});
}

const heading = { margin: 0, fontSize: 15, fontWeight: 950 };
const muted = { color: "var(--color-text-subtle)", fontWeight: 800 };
const warningLine = { padding: "8px 0", borderTop: "1px solid var(--legacy-color-e2e8f0)", color: "var(--legacy-color-b45309)", fontWeight: 850 };
const quickActionGrid = {
  display: "flex",
  gap: "var(--space-2)",
  flexWrap: "wrap",
  marginTop: "var(--space-3)",
};
const quickActionButton = {
  ...ui.button,
  height: 38,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
};
const dashboardTwoColumn = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
  gap: 14,
};
const companiesLayout = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
  gap: 14,
  alignItems: "start",
};
const companiesMain = {
  display: "grid",
  gap: "var(--space-3)",
  minWidth: 0,
};
const companiesToolbar = {
  ...ui.card,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};
const primaryActionButton = {
  height: "var(--control-height-md)",
  border: "1px solid var(--legacy-color-0369a1)",
  borderRadius: "var(--radius-md)",
  padding: "0 12px",
  background: "var(--legacy-color-0369a1)",
  color: "var(--color-white)",
  fontWeight: 900,
  cursor: "pointer",
};
const companyNotice = {
  ...ui.card,
  borderColor: "var(--color-warning-border)",
  background: "var(--legacy-color-fffbeb)",
  color: "var(--legacy-color-b45309)",
  fontWeight: 900,
};
const companyActionGrid = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
  minWidth: 320,
};
const companyDrawer = {
  position: "sticky",
  top: 14,
  background: "var(--color-white)",
  border: "1px solid var(--legacy-color-cbd5e1)",
  borderRadius: "var(--radius-md)",
  padding: 14,
  boxShadow: "0 18px 34px rgba(15, 23, 42, 0.14)",
  display: "grid",
  gap: 14,
};
const drawerHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--space-3)",
};
const smallCaps = {
  color: "var(--color-text-subtle)",
  fontSize: "var(--font-size-xs)",
  fontWeight: 900,
  textTransform: "uppercase",
};
const drawerTitle = {
  margin: "4px 0 0",
  fontSize: 20,
  fontWeight: 950,
};
const drawerFields = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};
const drawerField = {
  display: "grid",
  gap: 6,
  color: "var(--color-text-subtle)",
  fontSize: "var(--font-size-xs)",
  fontWeight: 900,
};
const drawerSection = {
  display: "grid",
  gap: 10,
};
const drawerSubhead = {
  margin: 0,
  fontSize: "var(--font-size-md)",
  fontWeight: 950,
};
const toggleGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--space-2)",
};
const toggleRow = {
  border: "1px solid var(--legacy-color-e2e8f0)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface-subtle)",
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--space-2)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-sm)",
  fontWeight: 850,
};
const drawerFooter = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--space-2)",
  flexWrap: "wrap",
  borderTop: "1px solid var(--legacy-color-e2e8f0)",
  paddingTop: "var(--space-3)",
};
const usersLayout = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
  gap: 14,
  alignItems: "start",
};
const usersMain = {
  display: "grid",
  gap: "var(--space-3)",
  minWidth: 0,
};
const usersToolbar = {
  ...ui.card,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};
const userNotice = {
  ...ui.card,
  borderColor: "var(--legacy-color-bae6fd)",
  background: "var(--legacy-color-f0f9ff)",
  color: "var(--legacy-color-0369a1)",
  fontWeight: 900,
};
const selectedRowStyle = {
  background: "var(--legacy-color-f0f9ff)",
};
const userSelectButton = {
  border: 0,
  background: "transparent",
  padding: 0,
  color: "var(--color-text)",
  textAlign: "left",
  cursor: "pointer",
  font: "inherit",
};
const userPanel = {
  position: "sticky",
  top: 14,
  background: "var(--color-white)",
  border: "1px solid var(--legacy-color-cbd5e1)",
  borderRadius: "var(--radius-md)",
  padding: 14,
  boxShadow: "0 18px 34px rgba(15, 23, 42, 0.14)",
  display: "grid",
  gap: 14,
};
const panelTitle = {
  margin: "4px 0 0",
  fontSize: 18,
  fontWeight: 950,
  overflowWrap: "anywhere",
};
const detailGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--space-2)",
};
const detailItem = {
  border: "1px solid var(--legacy-color-e2e8f0)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface-subtle)",
  padding: "8px 10px",
  display: "grid",
  gap: "var(--space-1)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-xs)",
};
const userActionGrid = {
  display: "flex",
  gap: "var(--space-2)",
  flexWrap: "wrap",
};
const auditDateField = {
  display: "inline-grid",
  gap: "var(--space-1)",
  color: "var(--color-text-subtle)",
  fontSize: "var(--font-size-xs)",
  fontWeight: 900,
};
const auditToggle = {
  minHeight: "var(--control-height-md)",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-2)",
  border: "1px solid var(--legacy-color-cbd5e1)",
  borderRadius: "var(--radius-md)",
  padding: "0 10px",
  background: "var(--color-white)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-sm)",
  fontWeight: 900,
};
const auditJson = {
  margin: 0,
  maxWidth: 300,
  maxHeight: 160,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  fontSize: 11,
  lineHeight: 1.35,
  color: "var(--legacy-color-334155)",
  background: "var(--color-surface-subtle)",
  border: "1px solid var(--legacy-color-e2e8f0)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-2)",
};
const cleanupLayout = {
  display: "grid",
  gridTemplateColumns: "minmax(min(100%, 320px), 360px) minmax(0, 1fr)",
  gap: 14,
  alignItems: "start",
};
const cleanupTaskList = {
  display: "grid",
  gap: 10,
};
const cleanupTaskButton = {
  border: "1px solid var(--legacy-color-e2e8f0)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-3)",
  background: "var(--color-white)",
  color: "var(--color-text)",
  cursor: "pointer",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  alignItems: "flex-start",
};
const cleanupActionBox = {
  marginTop: "var(--space-3)",
  border: "1px solid var(--legacy-color-e2e8f0)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface-subtle)",
  padding: "var(--space-3)",
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
};
const featureMiniToggle = {
  minHeight: 30,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: "var(--font-size-xs)",
  fontWeight: 900,
  color: "var(--color-text)",
  whiteSpace: "nowrap",
};
const brandPreview = {
  minWidth: 220,
  border: "1px solid var(--legacy-color-bae6fd)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-white)",
  padding: 10,
  display: "grid",
  gridTemplateColumns: "12px 1fr",
  gap: 10,
  alignItems: "stretch",
};
const brandPreviewSidebar = {
  borderRadius: "var(--radius-sm)",
  minHeight: 58,
};
const brandSwatch = {
  width: 22,
  height: 22,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--legacy-color-cbd5e1)",
};
const colourSwatchInput = {
  width: 36,
  height: "var(--control-height-md)",
  padding: 0,
  border: "1px solid var(--legacy-color-cbd5e1)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-white)",
};
const linkingLayout = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
  gap: 14,
  alignItems: "start",
};
const linkingStack = {
  display: "grid",
  gap: 14,
  minWidth: 0,
};
const sectionHeading = {
  margin: 0,
  fontSize: "var(--font-size-lg)",
  fontWeight: 950,
  color: "var(--color-text)",
};
