"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import PlatformAdminShell from "../../_components/PlatformAdminShell";
import { auth } from "../../../../../firebaseConfig";
import { authedFetch, formatDate, moduleLabels, Pill, ui } from "../../_components/platformAdminData";

const securityLabels = [
  ["mfaRequired", "MFA required"],
  ["passkeysAllowed", "Passkeys enabled"],
  ["loginAlerts", "Login emails"],
  ["locationAlerts", "Location checks"],
  ["userCodeLogin", "Setup-code login"],
  ["selfSignup", "Self signup"],
];

export default function PlatformCompanyDetailPage() {
  const params = useParams();
  const companyId = String(params?.companyId || "");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState({ companies: [], users: [] });
  const [tab, setTab] = useState("general");

  const load = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setNotice("");
    try {
      const platformData = await authedFetch("/api/platform-admin", { cache: "no-store" });
      setData({ companies: platformData.companies || [], users: platformData.users || [] });
    } catch (error) {
      setNotice(error?.message || "Could not load company.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) load();
    });
    return () => unsub();
  }, [load]);

  const company = useMemo(() => data.companies.find((item) => item.id === companyId), [companyId, data.companies]);
  const companyUsers = data.users.filter((user) => user.companyId === companyId);

  return (
    <PlatformAdminShell title={company?.name || companyId} subtitle="Company settings, modules, security and limits." onRefresh={load} loading={loading}>
      {notice ? <div style={{ ...ui.card, borderColor: "#fecaca", color: "#b91c1c", marginBottom: 12, fontWeight: 900 }}>{notice}</div> : null}
      {!company && !loading ? (
        <div style={ui.card}>Company not found.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["general", "modules", "security", "limits"].map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} style={{ ...ui.button, ...(tab === item ? { borderColor: "#0369a1", background: "#f0f9ff", color: "#0369a1" } : null) }}>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          {tab === "general" ? <General company={company} users={companyUsers} /> : null}
          {tab === "modules" ? <Modules company={company} /> : null}
          {tab === "security" ? <Security company={company} /> : null}
          {tab === "limits" ? <Limits company={company} users={companyUsers} /> : null}
        </div>
      )}
    </PlatformAdminShell>
  );
}

function General({ company, users }) {
  return (
    <div style={ui.grid}>
      <Card label="Company ID" value={company?.id} />
      <Card label="Domain" value={company?.domain || "-"} />
      <Card label="Status" value={<Pill tone={company?.status === "active" ? "green" : "amber"}>{company?.status || "-"}</Pill>} />
      <Card label="Plan" value={company?.plan || "-"} />
      <Card label="Users" value={users.length} />
      <Card label="Updated" value={formatDate(company?.updatedAt)} />
    </div>
  );
}

function Modules({ company }) {
  return (
    <div style={ui.grid}>
      {moduleLabels.map(([key, label]) => (
        <Card key={key} label={label} value={<Pill tone={company?.modules?.[key] ? "green" : "gray"}>{company?.modules?.[key] ? "Enabled" : "Disabled"}</Pill>} />
      ))}
    </div>
  );
}

function Security({ company }) {
  return (
    <div style={ui.grid}>
      {securityLabels.map(([key, label]) => (
        <Card key={key} label={label} value={<Pill tone={company?.security?.[key] ? (key === "userCodeLogin" ? "amber" : "green") : "gray"}>{company?.security?.[key] ? "On" : "Off"}</Pill>} />
      ))}
      <Card label="Remember MFA days" value={company?.security?.rememberMfaDays ?? "-"} />
    </div>
  );
}

function Limits({ company, users }) {
  return (
    <div style={ui.grid}>
      <Card label="User limit" value={company?.maxUsers || "-"} />
      <Card label="Current users" value={users.length} />
      <Card label="Storage limit" value="Not configured" />
      <Card label="Feature limits" value="Not configured" />
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div style={ui.card}>
      <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 8, fontWeight: 950, fontSize: 20 }}>{value || "-"}</div>
    </div>
  );
}
