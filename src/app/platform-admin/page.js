"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../../firebaseConfig";
import {
  Activity,
  Ban,
  Building2,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";

const PLATFORM_ADMIN_EMAILS = new Set(["mason@bickers.co.uk"]);
const DEFAULT_COMPANY_ID = "bickers-action";

const moduleLabels = [
  ["diary", "Diary"],
  ["workshop", "Workshop"],
  ["hr", "HR"],
  ["finance", "Finance"],
  ["assistant", "Assistant"],
];

const securityLabels = [
  ["mfaRequired", "MFA required"],
  ["passkeysAllowed", "Passkeys"],
  ["loginAlerts", "Login emails"],
  ["locationAlerts", "Location checks"],
  ["userCodeLogin", "Setup-code login"],
  ["selfSignup", "Self signup"],
];

const ruleLabels = [
  ["disabledUsersBlocked", "Disabled users blocked"],
  ["adminActionsServerOnly", "Admin actions server-only"],
  ["auditLoggingRequired", "Audit logging"],
  ["mfaResetByAdminsOnly", "MFA reset admin-only"],
];

const blankCompany = {
  id: "",
  name: "",
  domain: "",
  status: "setup",
  plan: "standard",
  maxUsers: 25,
  modules: {
    diary: true,
    workshop: true,
    hr: true,
    finance: false,
    assistant: true,
  },
  security: {
    mfaRequired: true,
    passkeysAllowed: true,
    loginAlerts: true,
    locationAlerts: true,
    rememberMfaDays: 30,
    userCodeLogin: true,
    selfSignup: false,
  },
  rules: {
    disabledUsersBlocked: true,
    adminActionsServerOnly: true,
    auditLoggingRequired: true,
    mfaResetByAdminsOnly: true,
  },
};

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value?.seconds ? value.seconds * 1000 : value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cloneCompany(company) {
  return {
    ...blankCompany,
    ...company,
    modules: { ...blankCompany.modules, ...(company?.modules || {}) },
    security: { ...blankCompany.security, ...(company?.security || {}) },
    rules: { ...blankCompany.rules, ...(company?.rules || {}) },
  };
}

function nextDefaultWorkspace(appAccess, preferred) {
  if (preferred === "service" && appAccess.service) return "service";
  if (preferred === "user" && appAccess.user) return "user";
  return appAccess.user ? "user" : "service";
}

export default function PlatformAdminPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(DEFAULT_COMPANY_ID);
  const [companyDraft, setCompanyDraft] = useState(cloneCompany(blankCompany));
  const [users, setUsers] = useState([]);
  const [audits, setAudits] = useState([]);
  const [stats, setStats] = useState({});
  const [queryText, setQueryText] = useState("");
  const [busyUserId, setBusyUserId] = useState("");

  const showNotice = useCallback((type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 2400);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const email = cleanEmail(user.email);
      if (!PLATFORM_ADMIN_EMAILS.has(email)) {
        router.push("/dashboard");
        return;
      }

      setMe(user);
      setChecking(false);
    });

    return () => unsub();
  }, [router]);

  const loadPlatform = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/platform-admin", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load platform admin.");

      const nextCompanies = data.companies || [];
      setCompanies(nextCompanies);
      setUsers(data.users || []);
      setAudits(data.audits || []);
      setStats(data.stats || {});

      const selected =
        nextCompanies.find((company) => company.id === selectedCompanyId) ||
        nextCompanies.find((company) => company.id === DEFAULT_COMPANY_ID) ||
        nextCompanies[0] ||
        blankCompany;

      setSelectedCompanyId(selected.id || DEFAULT_COMPANY_ID);
      setCompanyDraft(cloneCompany(selected));
    } catch (error) {
      showNotice("error", error?.message || "Could not load platform admin");
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, showNotice]);

  useEffect(() => {
    if (!checking) loadPlatform();
  }, [checking, loadPlatform]);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) || companyDraft,
    [companies, selectedCompanyId, companyDraft]
  );

  const filteredUsers = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const rows = users.filter((user) => user.companyId === selectedCompanyId || selectedCompanyId === DEFAULT_COMPANY_ID);
    if (!q) return rows;
    return rows.filter((user) =>
      [user.email, user.name, user.role, user.defaultWorkspace]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [queryText, selectedCompanyId, users]);

  const companyUsers = useMemo(
    () => users.filter((user) => user.companyId === selectedCompanyId || selectedCompanyId === DEFAULT_COMPANY_ID),
    [selectedCompanyId, users]
  );

  const companyHealth = useMemo(() => {
    const disabled = companyUsers.filter((user) => !user.isEnabled).length;
    const mfaMissing = companyUsers.filter((user) => !user.mfaEnabled).length;
    const admins = companyUsers.filter((user) => user.role === "admin").length;
    return { disabled, mfaMissing, admins };
  }, [companyUsers]);

  const callPlatformAction = async (payload) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("You need to sign in again.");
    const token = await currentUser.getIdToken();
    const res = await fetch("/api/platform-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Platform action failed.");
    return data;
  };

  const callUserAction = async (userId, payload) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("You need to sign in again.");
    const token = await currentUser.getIdToken();
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "User action failed.");
    return data;
  };

  const saveCompany = async () => {
    if (!companyDraft.name.trim()) {
      showNotice("error", "Company name is required");
      return;
    }

    setSaving(true);
    try {
      const data = await callPlatformAction({
        action: "saveCompany",
        companyId: companyDraft.id || companyDraft.name,
        company: companyDraft,
      });
      showNotice("ok", "Company saved");
      setSelectedCompanyId(data.companyId || companyDraft.id || DEFAULT_COMPANY_ID);
      await loadPlatform();
    } catch (error) {
      showNotice("error", error?.message || "Could not save company");
    } finally {
      setSaving(false);
    }
  };

  const deleteCompany = async () => {
    if (!companyDraft.id || companyDraft.id === DEFAULT_COMPANY_ID) return;
    if (!confirm(`Delete company ${companyDraft.name || companyDraft.id}?`)) return;

    setSaving(true);
    try {
      await callPlatformAction({ action: "deleteCompany", companyId: companyDraft.id });
      showNotice("ok", "Company deleted");
      setSelectedCompanyId(DEFAULT_COMPANY_ID);
      await loadPlatform();
    } catch (error) {
      showNotice("error", error?.message || "Could not delete company");
    } finally {
      setSaving(false);
    }
  };

  const startNewCompany = () => {
    const draft = cloneCompany(blankCompany);
    draft.id = "";
    draft.name = "";
    setSelectedCompanyId("");
    setCompanyDraft(draft);
  };

  const selectCompany = (company) => {
    setSelectedCompanyId(company.id);
    setCompanyDraft(cloneCompany(company));
  };

  const patchCompany = (path, value) => {
    setCompanyDraft((current) => {
      if (path.length === 1) return { ...current, [path[0]]: value };
      const [parent, key] = path;
      return {
        ...current,
        [parent]: {
          ...(current[parent] || {}),
          [key]: value,
        },
      };
    });
  };

  const updateUserRole = async (user, role) => {
    setBusyUserId(user.id);
    try {
      await callUserAction(user.id, { action: "setRole", role });
      showNotice("ok", "Role updated");
      await loadPlatform();
    } catch (error) {
      showNotice("error", error?.message || "Could not update role");
    } finally {
      setBusyUserId("");
    }
  };

  const toggleUserEnabled = async (user) => {
    setBusyUserId(user.id);
    try {
      await callUserAction(user.id, { action: "setEnabled", isEnabled: !user.isEnabled });
      showNotice("ok", user.isEnabled ? "User blocked" : "User restored");
      await loadPlatform();
    } catch (error) {
      showNotice("error", error?.message || "Could not update user");
    } finally {
      setBusyUserId("");
    }
  };

  const updateUserAccess = async (user, key, value) => {
    const nextAccess = { ...(user.appAccess || {}), [key]: value };
    if (!nextAccess.user && !nextAccess.service) {
      showNotice("error", "At least one workspace must stay enabled");
      return;
    }

    setBusyUserId(user.id);
    try {
      await callUserAction(user.id, {
        action: "setAccess",
        appAccess: nextAccess,
        defaultWorkspace: nextDefaultWorkspace(nextAccess, user.defaultWorkspace),
      });
      showNotice("ok", "Access updated");
      await loadPlatform();
    } catch (error) {
      showNotice("error", error?.message || "Could not update access");
    } finally {
      setBusyUserId("");
    }
  };

  const resetAccount = async (user) => {
    if (!confirm(`Reset security for ${user.email}?\n\nMFA and passkeys will be cleared.`)) return;

    setBusyUserId(user.id);
    try {
      await callUserAction(user.id, { action: "resetAccount" });
      showNotice("ok", "Account security reset");
      await loadPlatform();
    } catch (error) {
      showNotice("error", error?.message || "Could not reset account");
    } finally {
      setBusyUserId("");
    }
  };

  if (checking) {
    return (
      <main style={platformFrame}>
        <div style={loadingPanel}>
          <Image src="/bas-software-logo.png" alt="BAS Software" width={96} height={96} style={loadingLogo} />
          <div style={loadingText}>
            <strong>Checking platform access...</strong>
            <span>Opening BAS Software control centre</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={platformFrame}>
      <div style={pageShell}>
        <section style={platformTopBar}>
          <div style={platformBrand}>
            <Image src="/bas-software-logo.png" alt="BAS Software" width={74} height={74} style={topLogo} />
            <div>
              <div style={platformKicker}>BAS Software</div>
              <div style={platformTitle}>Control Centre</div>
            </div>
          </div>
          <div style={platformTopActions}>
            <span style={signedInPill}>{me?.email}</span>
            <Button onClick={() => router.push("/dashboard")}>Back to Bickers</Button>
          </div>
        </section>

        <section style={heroBand}>
          <div style={heroLeft}>
            <div style={brandMark}>
              <Image src="/bas-software-logo.png" alt="BAS Software" width={92} height={92} style={brandImage} />
            </div>
            <div>
              <div style={eyebrow}>BAS Platform</div>
              <h1 style={h1}>Platform Admin</h1>
              <div style={subtleLine}>
                Signed in as <strong>{me?.email}</strong>
              </div>
            </div>
          </div>
          <div style={heroActions}>
            <Button onClick={loadPlatform} disabled={loading} icon={<RefreshCw size={15} />}>
              Refresh
            </Button>
            <Button onClick={saveCompany} disabled={saving} intent="primary" icon={<Save size={15} />}>
              {saving ? "Saving..." : "Save Company"}
            </Button>
          </div>
        </section>

        {notice ? (
          <div style={notice.type === "error" ? noticeError : noticeOk}>{notice.text}</div>
        ) : null}

        <section style={metricGrid}>
          <Metric icon={<Building2 size={18} />} label="Companies" value={stats.companies || companies.length} tone="blue" />
          <Metric icon={<Users size={18} />} label="Users" value={stats.users || users.length} tone="cyan" />
          <Metric icon={<Ban size={18} />} label="Blocked" value={companyHealth.disabled} tone="red" />
          <Metric icon={<ShieldAlert size={18} />} label="MFA Missing" value={companyHealth.mfaMissing} tone="amber" />
        </section>

        <section style={mainGrid}>
          <aside style={companyRail}>
            <div style={sectionHead}>
              <div>
                <div style={sectionKicker}>Companies</div>
                <h2 style={sectionTitle}>Tenants</h2>
              </div>
              <button type="button" onClick={startNewCompany} style={smallAction}>
                New
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => selectCompany(company)}
                  style={{
                    ...companyButton,
                    ...(company.id === selectedCompanyId ? companyButtonActive : null),
                  }}
                >
                  <span>
                    <strong>{company.name}</strong>
                    <small>{company.domain || company.id}</small>
                  </span>
                  <Pill tone={company.status === "active" ? "green" : company.status === "suspended" ? "red" : "amber"}>
                    {company.status}
                  </Pill>
                </button>
              ))}
            </div>
          </aside>

          <section style={controlStack}>
            <div style={panel}>
              <div style={sectionHead}>
                <div>
                  <div style={sectionKicker}>Company Control</div>
                  <h2 style={sectionTitle}>{selectedCompany?.name || "New company"}</h2>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Pill tone={companyHealth.admins > 1 ? "amber" : "green"}>{companyHealth.admins} admins</Pill>
                  <Pill tone={selectedCompany?.status === "active" ? "green" : "red"}>{selectedCompany?.status || "setup"}</Pill>
                </div>
              </div>

              <div style={formGrid}>
                <Field label="Company name">
                  <input
                    value={companyDraft.name}
                    onChange={(e) => patchCompany(["name"], e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Domain">
                  <input
                    value={companyDraft.domain}
                    onChange={(e) => patchCompany(["domain"], e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={companyDraft.status}
                    onChange={(e) => patchCompany(["status"], e.target.value)}
                    style={inputStyle}
                  >
                    <option value="active">active</option>
                    <option value="setup">setup</option>
                    <option value="suspended">suspended</option>
                    <option value="locked">locked</option>
                  </select>
                </Field>
                <Field label="Plan">
                  <select
                    value={companyDraft.plan}
                    onChange={(e) => patchCompany(["plan"], e.target.value)}
                    style={inputStyle}
                  >
                    <option value="trial">trial</option>
                    <option value="standard">standard</option>
                    <option value="platform">platform</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                </Field>
                <Field label="Max users">
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    value={companyDraft.maxUsers}
                    onChange={(e) => patchCompany(["maxUsers"], e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>
            </div>

            <div style={twoPanelGrid}>
              <div style={panel}>
                <PanelTitle icon={<SlidersHorizontal size={17} />} title="Modules" />
                <div style={toggleGrid}>
                  {moduleLabels.map(([key, label]) => (
                    <SwitchRow
                      key={key}
                      label={label}
                      checked={companyDraft.modules?.[key] === true}
                      onChange={(checked) => patchCompany(["modules", key], checked)}
                    />
                  ))}
                </div>
              </div>

              <div style={panel}>
                <PanelTitle icon={<LockKeyhole size={17} />} title="Security Rules" />
                <div style={toggleGrid}>
                  {securityLabels.map(([key, label]) => (
                    <SwitchRow
                      key={key}
                      label={label}
                      checked={companyDraft.security?.[key] === true}
                      onChange={(checked) => patchCompany(["security", key], checked)}
                    />
                  ))}
                  <Field label="Remember MFA days">
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={companyDraft.security?.rememberMfaDays ?? 30}
                      onChange={(e) => patchCompany(["security", "rememberMfaDays"], e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div style={panel}>
              <PanelTitle icon={<ShieldCheck size={17} />} title="Policy Locks" />
              <div style={ruleGrid}>
                {ruleLabels.map(([key, label]) => (
                  <SwitchRow
                    key={key}
                    label={label}
                    checked={companyDraft.rules?.[key] === true}
                    onChange={(checked) => patchCompany(["rules", key], checked)}
                  />
                ))}
              </div>
              <div style={dangerRow}>
                <Button onClick={() => patchCompany(["status"], "suspended")} intent="danger" icon={<Ban size={15} />}>
                  Suspend Company
                </Button>
                <Button onClick={() => patchCompany(["status"], "active")} icon={<CheckCircle2 size={15} />}>
                  Activate Company
                </Button>
                <Button
                  onClick={deleteCompany}
                  disabled={!companyDraft.id || companyDraft.id === DEFAULT_COMPANY_ID || saving}
                  intent="ghostDanger"
                  icon={<Trash2 size={15} />}
                >
                  Delete Company
                </Button>
              </div>
            </div>
          </section>
        </section>

        <section style={widePanel}>
          <div style={sectionHead}>
            <div>
              <div style={sectionKicker}>People Control</div>
              <h2 style={sectionTitle}>Access Accounts</h2>
            </div>
            <div style={searchBox}>
              <Search size={16} />
              <input
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Search users..."
                style={searchInput}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Workspaces</Th>
                  <Th>Security</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const busy = busyUserId === user.id;
                  const isSelf = cleanEmail(me?.email) === user.email;
                  return (
                    <tr key={user.id} style={rowStyle}>
                      <Td>
                        <div style={userCell}>
                          <span style={avatar}>{(user.name || user.email || "?").slice(0, 1).toUpperCase()}</span>
                          <span>
                            <strong>{user.email}</strong>
                            <small>{user.name || user.id}</small>
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <select
                          value={["user", "manager", "admin"].includes(user.role) ? user.role : "user"}
                          disabled={busy || isSelf}
                          onChange={(e) => updateUserRole(user, e.target.value)}
                          style={compactSelect}
                        >
                          <option value="user">user</option>
                          <option value="manager">manager</option>
                          <option value="admin">admin</option>
                        </select>
                      </Td>
                      <Td>
                        <div style={miniToggles}>
                          <MiniToggle
                            label="User"
                            checked={user.appAccess?.user !== false}
                            disabled={busy || user.role === "admin"}
                            onChange={(checked) => updateUserAccess(user, "user", checked)}
                          />
                          <MiniToggle
                            label="Workshop"
                            checked={user.appAccess?.service === true}
                            disabled={busy || user.role === "admin"}
                            onChange={(checked) => updateUserAccess(user, "service", checked)}
                          />
                        </div>
                      </Td>
                      <Td>
                        <div style={securityStack}>
                          <Pill tone={user.isEnabled ? "green" : "red"}>{user.isEnabled ? "enabled" : "blocked"}</Pill>
                          <Pill tone={user.mfaEnabled ? "green" : "amber"}>{user.mfaEnabled ? "MFA" : "MFA needed"}</Pill>
                          <Pill tone={user.passkeyCount ? "blue" : "grey"}>{user.passkeyCount || 0} passkeys</Pill>
                        </div>
                      </Td>
                      <Td>
                        <div style={actionRow}>
                          <Button
                            onClick={() => toggleUserEnabled(user)}
                            disabled={busy || isSelf}
                            intent={user.isEnabled ? "ghostDanger" : "primary"}
                            icon={<Ban size={14} />}
                          >
                            {user.isEnabled ? "Block" : "Restore"}
                          </Button>
                          <Button
                            onClick={() => resetAccount(user)}
                            disabled={busy || isSelf}
                            icon={<KeyRound size={14} />}
                          >
                            Reset
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section style={widePanel}>
          <PanelTitle icon={<Activity size={17} />} title="Platform Activity" />
          <div style={auditGrid}>
            {audits.slice(0, 12).map((row) => (
              <div key={row.id} style={auditItem}>
                <div>
                  <strong>{row.action || "Platform action"}</strong>
                  <small>{row.actorEmail || "system"} - {formatDate(row.createdAt)}</small>
                </div>
                <Pill tone={row.area === "Platform" ? "blue" : "grey"}>{row.area || "Admin"}</Pill>
              </div>
            ))}
            {!audits.length && <div style={emptyState}>No platform activity yet.</div>}
          </div>
        </section>

        {loading ? <div style={loadingBar}>Loading platform data...</div> : null}
      </div>
    </main>
  );
}

function Metric({ icon, label, value, tone }) {
  return (
    <div style={metricCard}>
      <div style={metricIcon(tone)}>{icon}</div>
      <div>
        <div style={metricLabel}>{label}</div>
        <div style={metricValue}>{value}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function PanelTitle({ icon, title }) {
  return (
    <div style={panelTitle}>
      <span style={panelIcon}>{icon}</span>
      <h3>{title}</h3>
    </div>
  );
}

function SwitchRow({ label, checked, onChange }) {
  return (
    <label style={switchRow}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={switchInput}
      />
    </label>
  );
}

function MiniToggle({ label, checked, disabled, onChange }) {
  return (
    <label style={{ ...miniToggle, opacity: disabled ? 0.55 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function Pill({ children, tone = "grey" }) {
  const palette = {
    green: ["#dcfce7", "#166534", "#86efac"],
    red: ["#fee2e2", "#991b1b", "#fecaca"],
    amber: ["#fef3c7", "#92400e", "#fde68a"],
    blue: ["#dbeafe", "#1e40af", "#bfdbfe"],
    cyan: ["#cffafe", "#155e75", "#a5f3fc"],
    grey: ["#f1f5f9", "#475569", "#e2e8f0"],
  }[tone] || ["#f1f5f9", "#475569", "#e2e8f0"];

  return (
    <span style={{ ...pill, background: palette[0], color: palette[1], borderColor: palette[2] }}>
      {children}
    </span>
  );
}

function Button({ children, icon, intent = "default", disabled, onClick }) {
  const variants = {
    default: { background: "#ffffff", color: "#07111f", borderColor: "#cbd5e1" },
    primary: { background: "#0756b8", color: "#ffffff", borderColor: "#0756b8" },
    danger: { background: "#b91c1c", color: "#ffffff", borderColor: "#b91c1c" },
    ghostDanger: { background: "#fff1f2", color: "#b91c1c", borderColor: "#fecaca" },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...buttonStyle,
        ...(variants[intent] || variants.default),
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function Th({ children }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }) {
  return <td style={tdStyle}>{children}</td>;
}

const platformFrame = {
  minHeight: "100vh",
  width: "100%",
  background:
    "linear-gradient(135deg, #061322 0%, #082b56 42%, #0aa9d6 100%)",
  padding: 18,
};

const pageShell = {
  width: "100%",
  maxWidth: 1680,
  margin: "0 auto",
  color: "#07111f",
  display: "grid",
  gap: 14,
};

const platformTopBar = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(255,255,255,0.55)",
  borderRadius: 8,
  padding: "12px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  boxShadow: "0 18px 38px rgba(3, 20, 38, 0.18)",
};

const platformBrand = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const topLogo = {
  width: 54,
  height: 54,
  objectFit: "contain",
};

const platformKicker = {
  color: "#0756b8",
  fontSize: 12,
  fontWeight: 1000,
  textTransform: "uppercase",
};

const platformTitle = {
  color: "#061322",
  fontSize: 22,
  fontWeight: 1000,
  lineHeight: 1,
};

const platformTopActions = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};

const signedInPill = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#0756b8",
  borderRadius: 999,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const heroBand = {
  background:
    "linear-gradient(135deg, rgba(7,17,31,0.98), rgba(7,86,184,0.92))",
  border: "1px solid rgba(56,213,239,0.42)",
  borderRadius: 8,
  color: "#ffffff",
  padding: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  boxShadow: "0 18px 48px rgba(3, 20, 38, 0.26)",
};

const heroLeft = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  minWidth: 280,
};

const brandMark = {
  width: 76,
  height: 76,
  borderRadius: 8,
  background: "#ffffff",
  display: "grid",
  placeItems: "center",
  border: "1px solid rgba(255,255,255,0.2)",
  overflow: "hidden",
};

const brandImage = {
  width: "68px",
  height: "68px",
  objectFit: "contain",
};

const eyebrow = {
  textTransform: "uppercase",
  fontSize: 12,
  fontWeight: 900,
  color: "#38d5ef",
};

const h1 = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.1,
  color: "#ffffff",
};

const subtleLine = {
  marginTop: 5,
  color: "#b8c6d8",
  fontSize: 13,
};

const heroActions = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const metricCard = {
  background: "#ffffff",
  border: "1px solid rgba(203,216,230,0.95)",
  borderRadius: 8,
  padding: 14,
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 76,
  boxShadow: "0 12px 28px rgba(3,20,38,0.12)",
};

const metricIcon = (tone) => ({
  width: 42,
  height: 42,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background:
    tone === "red" ? "#fee2e2" : tone === "amber" ? "#fef3c7" : tone === "cyan" ? "#cffafe" : "#dbeafe",
  color:
    tone === "red" ? "#b91c1c" : tone === "amber" ? "#92400e" : tone === "cyan" ? "#155e75" : "#0756b8",
  border: "1px solid #cbd8e6",
});

const metricLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  color: "#526173",
  fontWeight: 900,
};

const metricValue = {
  fontSize: 25,
  fontWeight: 1000,
  color: "#061322",
};

const mainGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
  gap: 14,
};

const companyRail = {
  background: "#ffffff",
  border: "1px solid #cbd8e6",
  borderRadius: 8,
  padding: 14,
  alignSelf: "start",
};

const controlStack = {
  display: "grid",
  gap: 14,
};

const panel = {
  background: "#ffffff",
  border: "1px solid #cbd8e6",
  borderRadius: 8,
  padding: 14,
  boxShadow: "0 12px 30px rgba(3,20,38,0.1)",
};

const widePanel = {
  ...panel,
  overflow: "hidden",
};

const sectionHead = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap",
};

const sectionKicker = {
  textTransform: "uppercase",
  fontSize: 11,
  fontWeight: 1000,
  color: "#526173",
};

const sectionTitle = {
  margin: 0,
  fontSize: 18,
  color: "#07111f",
};

const companyButton = {
  width: "100%",
  border: "1px solid #d8e1ec",
  background: "#f8fafc",
  borderRadius: 8,
  padding: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  textAlign: "left",
  color: "#07111f",
  cursor: "pointer",
};

const companyButtonActive = {
  background: "#e9f5ff",
  borderColor: "#0756b8",
};

const smallAction = {
  border: "1px solid #0756b8",
  color: "#0756b8",
  background: "#eff6ff",
  borderRadius: 8,
  padding: "7px 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const fieldStyle = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "#526173",
  fontWeight: 900,
};

const inputStyle = {
  minHeight: 39,
  border: "1px solid #cbd8e6",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#07111f",
  background: "#ffffff",
  fontWeight: 800,
};

const twoPanelGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const panelTitle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
};

const panelIcon = {
  width: 34,
  height: 34,
  borderRadius: 8,
  background: "#e9f5ff",
  color: "#0756b8",
  border: "1px solid #bfdbfe",
  display: "grid",
  placeItems: "center",
};

const toggleGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const ruleGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const switchRow = {
  border: "1px solid #d8e1ec",
  background: "#f8fafc",
  borderRadius: 8,
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  color: "#07111f",
  fontWeight: 900,
};

const switchInput = {
  width: 18,
  height: 18,
  accentColor: "#0756b8",
};

const dangerRow = {
  marginTop: 14,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const buttonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  minHeight: 36,
  padding: "8px 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const searchBox = {
  minWidth: 240,
  maxWidth: 420,
  flex: "1 1 280px",
  height: 39,
  border: "1px solid #cbd8e6",
  borderRadius: 8,
  background: "#ffffff",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  color: "#64748b",
};

const searchInput = {
  border: 0,
  outline: "none",
  flex: 1,
  minWidth: 0,
  fontWeight: 800,
  color: "#07111f",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 920,
};

const thStyle = {
  background: "#f1f5f9",
  color: "#526173",
  textTransform: "uppercase",
  fontSize: 12,
  fontWeight: 1000,
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid #d8e1ec",
};

const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "middle",
};

const rowStyle = {
  background: "#ffffff",
};

const userCell = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#07111f",
};

const avatar = {
  width: 34,
  height: 34,
  borderRadius: 8,
  background: "#07111f",
  color: "#38d5ef",
  display: "grid",
  placeItems: "center",
  fontWeight: 1000,
};

const compactSelect = {
  ...inputStyle,
  minWidth: 120,
};

const miniToggles = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const miniToggle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #d8e1ec",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 900,
  color: "#07111f",
  background: "#f8fafc",
};

const securityStack = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const actionRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 1000,
  textTransform: "capitalize",
};

const auditGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
};

const auditItem = {
  border: "1px solid #d8e1ec",
  borderRadius: 8,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  background: "#f8fafc",
};

const noticeOk = {
  border: "1px solid #bbf7d0",
  background: "#dcfce7",
  color: "#166534",
  borderRadius: 8,
  padding: 12,
  fontWeight: 900,
};

const noticeError = {
  border: "1px solid #fecaca",
  background: "#fee2e2",
  color: "#991b1b",
  borderRadius: 8,
  padding: 12,
  fontWeight: 900,
};

const loadingPanel = {
  background: "#ffffff",
  border: "1px solid rgba(255,255,255,0.65)",
  borderRadius: 8,
  padding: 20,
  fontWeight: 900,
  width: "min(460px, calc(100vw - 36px))",
  minHeight: 160,
  margin: "18vh auto 0",
  display: "flex",
  alignItems: "center",
  gap: 16,
  boxShadow: "0 20px 48px rgba(3,20,38,0.24)",
};

const loadingLogo = {
  width: 86,
  height: 86,
  objectFit: "contain",
};

const loadingText = {
  display: "grid",
  gap: 4,
  color: "#061322",
};

const loadingBar = {
  position: "fixed",
  right: 18,
  bottom: 18,
  background: "#07111f",
  color: "#ffffff",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 900,
  boxShadow: "0 12px 28px rgba(7,17,31,0.22)",
};

const emptyState = {
  border: "1px dashed #cbd8e6",
  borderRadius: 8,
  padding: 16,
  color: "#526173",
  fontWeight: 900,
};
