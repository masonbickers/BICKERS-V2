"use client";

import layoutStyles from "./page.styles.module.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import PlatformAdminShell from "../../_components/PlatformAdminShell";
import { auth } from "../../../../../firebaseConfig";
import { authedFetch, formatDate, moduleLabels, Pill, statusTone, ui } from "../../_components/platformAdminData";

const tabs = ["general", "modules", "security", "limits"];

const securityLabels = [
  ["mfaRequired", "MFA required"],
  ["passkeysAllowed", "Passkeys enabled"],
  ["loginAlerts", "Login emails enabled"],
  ["locationAlerts", "Location checks"],
  ["userCodeLogin", "Setup-code login enabled"],
  ["selfSignup", "Self signup enabled"],
];

const blankCompany = {
  id: "",
  name: "",
  domain: "",
  status: "active",
  plan: "standard",
  maxUsers: 25,
  modules: {
    diary: true,
    workshop: true,
    hr: true,
    finance: false,
    assistant: true,
    vehicles: true,
    equipment: true,
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
  limits: {
    storageLimitGb: 0,
    featureLimits: "",
  },
};

function cloneCompany(company = blankCompany) {
  return {
    ...blankCompany,
    ...company,
    modules: { ...blankCompany.modules, ...(company.modules || {}) },
    security: { ...blankCompany.security, ...(company.security || {}) },
    limits: { ...blankCompany.limits, ...(company.limits || {}) },
  };
}

export default function PlatformCompanyDetailPage() {
  const params = useParams();
  const companyId = String(params?.companyId || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState({ companies: [], users: [] });
  const [tab, setTab] = useState("general");
  const [draft, setDraft] = useState(cloneCompany());

  const load = useCallback(async ({ keepNotice = false } = {}) => {
    if (!auth.currentUser) return;
    setLoading(true);
    if (!keepNotice) setNotice("");
    try {
      const platformData = await authedFetch("/api/platform-admin", { cache: "no-store" });
      const companies = platformData.companies || [];
      const company = companies.find((item) => item.id === companyId);
      setData({ companies, users: platformData.users || [] });
      if (company) setDraft(cloneCompany(company));
    } catch (error) {
      setNotice(error?.message || "Could not load company.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) load();
    });
    return () => unsub();
  }, [load]);

  const company = useMemo(() => data.companies.find((item) => item.id === companyId), [companyId, data.companies]);
  const companyUsers = data.users.filter((user) => user.companyId === companyId);

  const patchDraft = (path, value) => {
    setDraft((current) => {
      if (path.length === 1) return { ...current, [path[0]]: value };
      const [parent, key] = path;
      return { ...current, [parent]: { ...(current[parent] || {}), [key]: value } };
    });
  };

  const saveCompany = async () => {
    if (!draft.name.trim()) {
      setNotice("Company name is required.");
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      await authedFetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveCompany",
          companyId,
          company: draft,
        }),
      });
      await load({ keepNotice: true });
      setNotice("Company settings saved.");
    } catch (error) {
      setNotice(error?.message || "Could not save company settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlatformAdminShell title={draft?.name || companyId} subtitle="Company settings, modules, security and limits." onRefresh={load} loading={loading}>
      {notice ? <div style={notice === "Company settings saved." ? noticeOk : noticeWarn}>{notice}</div> : null}
      {!company && !loading ? (
        <div style={ui.card}>Company not found.</div>
      ) : (
        <div className={layoutStyles.extracted1}>
          <div style={summaryBar}>
            <div>
              <div className={layoutStyles.extracted2}>Company ID</div>
              <strong>{companyId}</strong>
            </div>
            <Pill tone={statusTone(draft.status)}>{draft.status}</Pill>
            <div>
              <div className={layoutStyles.extracted3}>Users</div>
              <strong>{companyUsers.length} / {draft.maxUsers || "-"}</strong>
            </div>
            <div>
              <div className={layoutStyles.extracted4}>Updated</div>
              <strong>{formatDate(draft.updatedAt)}</strong>
            </div>
            <Link href="/platform-admin/companies" style={{ ...ui.button, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Back to companies
            </Link>
          </div>

          <div className={layoutStyles.extracted5}>
            {tabs.map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} style={{ ...ui.button, ...(tab === item ? activeTab : null) }}>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>

          <section style={ui.card}>
            {tab === "general" ? <GeneralTab draft={draft} users={companyUsers} onPatch={patchDraft} /> : null}
            {tab === "modules" ? <ModulesTab draft={draft} onPatch={patchDraft} /> : null}
            {tab === "security" ? <SecurityTab draft={draft} onPatch={patchDraft} /> : null}
            {tab === "limits" ? <LimitsTab draft={draft} users={companyUsers} onPatch={patchDraft} /> : null}
          </section>

          <div style={saveBar}>
            <button type="button" onClick={load} disabled={loading || saving} style={ui.button}>Reset</button>
            <button type="button" onClick={saveCompany} disabled={saving || loading || !company} className={layoutStyles.extracted6}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </PlatformAdminShell>
  );
}

function GeneralTab({ draft, users, onPatch }) {
  return (
    <div className={layoutStyles.extracted7}>
      <Field label="Company ID">
        <input value={draft.id || ""} disabled style={ui.input} />
      </Field>
      <Field label="Company name">
        <input value={draft.name || ""} onChange={(event) => onPatch(["name"], event.target.value)} style={ui.input} />
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
      <InfoCard label="Current users" value={users.length} />
      <InfoCard label="Created" value={formatDate(draft.createdAt)} />
    </div>
  );
}

function ModulesTab({ draft, onPatch }) {
  return (
    <div className={layoutStyles.extracted8}>
      {moduleLabels.map(([key, label]) => (
        <ToggleRow key={key} label={label} checked={draft.modules?.[key] === true} onChange={(checked) => onPatch(["modules", key], checked)} />
      ))}
    </div>
  );
}

function SecurityTab({ draft, onPatch }) {
  return (
    <div className={layoutStyles.extracted9}>
      {securityLabels.map(([key, label]) => (
        <ToggleRow key={key} label={label} checked={draft.security?.[key] === true} onChange={(checked) => onPatch(["security", key], checked)} />
      ))}
      <Field label="Remember MFA days">
        <input type="number" min="0" max="90" value={draft.security?.rememberMfaDays ?? 30} onChange={(event) => onPatch(["security", "rememberMfaDays"], event.target.value)} style={ui.input} />
      </Field>
    </div>
  );
}

function LimitsTab({ draft, users, onPatch }) {
  return (
    <div className={layoutStyles.extracted10}>
      <Field label="User limit">
        <input type="number" min="1" max="5000" value={draft.maxUsers || 25} onChange={(event) => onPatch(["maxUsers"], event.target.value)} style={ui.input} />
      </Field>
      <InfoCard label="Current users" value={users.length} />
      <Field label="Storage limit (GB)">
        <input type="number" min="0" max="1000000" value={draft.limits?.storageLimitGb ?? 0} onChange={(event) => onPatch(["limits", "storageLimitGb"], event.target.value)} style={ui.input} />
      </Field>
      <Field label="Feature limits">
        <textarea value={draft.limits?.featureLimits || ""} onChange={(event) => onPatch(["limits", "featureLimits"], event.target.value)} rows={5} style={textareaStyle} />
      </Field>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className={layoutStyles.extracted11}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className={layoutStyles.extracted12}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className={layoutStyles.extracted13} />
    </label>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className={layoutStyles.extracted14}>
      <div className={layoutStyles.extracted15}>{label}</div>
      <strong>{value || "-"}</strong>
    </div>
  );
}

const pageGrid = { display: "grid", gap: 12 };
const summaryBar = {
  ...ui.card,
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
};
const smallCaps = {
  color: "var(--color-text-muted)",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
};
const tabRow = { display: "flex", gap: 8, flexWrap: "wrap" };
const activeTab = { borderColor: "var(--color-info)", background: "var(--color-info-soft)", color: "var(--color-info)" };
const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};
const securityGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};
const toggleGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};
const fieldStyle = {
  display: "grid",
  gap: 6,
  color: "var(--color-text-muted)",
  fontSize: 12,
  fontWeight: 900,
};
const textareaStyle = {
  ...ui.input,
  height: "auto",
  minHeight: 120,
  paddingTop: 10,
  resize: "vertical",
  fontFamily: "Arial, sans-serif",
};
const toggleRow = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface-subtle)",
  padding: "10px 12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  color: "var(--color-text)",
  fontWeight: 850,
};
const infoCard = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface-subtle)",
  padding: "10px 12px",
  display: "grid",
  gap: 6,
};
const saveBar = {
  ...ui.card,
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};
const primaryButton = {
  height: 36,
  border: "1px solid var(--color-info)",
  borderRadius: 8,
  padding: "0 12px",
  background: "var(--color-info)",
  color: "var(--color-white)",
  fontWeight: 900,
  cursor: "pointer",
};
const noticeWarn = {
  ...ui.card,
  borderColor: "var(--color-warning-border)",
  background: "var(--color-warning-soft)",
  color: "var(--color-warning)",
  marginBottom: 12,
  fontWeight: 900,
};
const noticeOk = {
  ...ui.card,
  borderColor: "var(--color-success-border)",
  background: "var(--color-success-soft)",
  color: "var(--color-success)",
  marginBottom: 12,
  fontWeight: 900,
};
