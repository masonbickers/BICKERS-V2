"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Clock3, FileText, LayoutDashboard, PencilLine, Plus, Trash2 } from "lucide-react";

const DRAFTS_STORAGE_KEY = "create-booking:drafts:v1";

const UI = {
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  border: "1px solid #d7dee8",
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadow: "0 1px 2px rgba(15,23,42,0.05)",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  danger: "#b91c1c",
  dangerSoft: "#fff1f2",
};

const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadow,
  padding: 12,
};

const btn = (kind = "ghost") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radiusSm,
  border:
    kind === "primary"
      ? `1px solid ${UI.brand}`
      : kind === "danger"
      ? "1px solid #fecdd3"
      : `1px solid ${UI.brandBorder}`,
  background:
    kind === "primary"
      ? UI.brand
      : kind === "danger"
      ? UI.dangerSoft
      : "#fff",
  color: kind === "primary" ? "#fff" : kind === "danger" ? UI.danger : UI.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: kind === "primary" ? "0 8px 18px rgba(31,75,122,0.16)" : UI.shadow,
});

const pageHeader = {
  ...card,
  marginBottom: UI.gap,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: UI.gap,
  flexWrap: "wrap",
};

const h1Style = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 800,
  color: UI.text,
};

const pageSub = {
  marginTop: 6,
  color: UI.muted,
  fontSize: 13.5,
  lineHeight: 1.45,
};

const statGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: UI.gap,
  marginBottom: UI.gap,
};

const statCard = {
  ...card,
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
};

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const statLabel = {
  fontSize: 11,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const statValue = {
  marginTop: 4,
  fontSize: 22,
  lineHeight: 1,
  fontWeight: 900,
  color: UI.text,
};

const draftRow = {
  border: UI.border,
  borderRadius: UI.radiusSm,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  background: "#fff",
  boxShadow: UI.shadow,
};

const fmtDateTime = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function DraftStat({ icon, label, value, detail }) {
  return (
    <div style={statCard}>
      <span style={iconBox()}>{icon}</span>
      <div>
        <div style={statLabel}>{label}</div>
        <div style={statValue}>{value}</div>
        {detail ? <div style={{ marginTop: 5, color: UI.muted, fontSize: 12 }}>{detail}</div> : null}
      </div>
    </div>
  );
}

const readDrafts = () => {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeDrafts = (map) => {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(map || {}));
  } catch {
    // noop
  }
};

export default function BookingDraftsPage() {
  const router = useRouter();
  const [draftMap, setDraftMap] = useState({});

  const refresh = () => setDraftMap(readDrafts());

  useEffect(() => {
    refresh();
    const onStorage = (e) => {
      if (e.key === DRAFTS_STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const drafts = useMemo(() => {
    return Object.values(draftMap || {}).sort((a, b) => {
      const at = new Date(a?.updatedAt || 0).getTime();
      const bt = new Date(b?.updatedAt || 0).getTime();
      return bt - at;
    });
  }, [draftMap]);
  const latestDraft = drafts[0] || null;

  const removeDraft = (id) => {
    if (!id) return;
    const next = { ...(draftMap || {}) };
    delete next[id];
    writeDrafts(next);
    setDraftMap(next);
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={pageHeader}>
          <div>
            <h1 style={h1Style}>Booking Drafts</h1>
            <div style={pageSub}>
              Reopen unfinished booking forms saved automatically.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn("primary")} onClick={() => router.push("/create-booking")}>
              <Plus size={14} />
              New Booking
            </button>
            <button type="button" style={btn()} onClick={() => router.push("/dashboard")}>
              <LayoutDashboard size={14} />
              Back to Dashboard
            </button>
          </div>
        </div>

        <div style={statGrid}>
          <DraftStat icon={<FileText size={17} />} label="Drafts" value={drafts.length} detail="saved locally on this device" />
          <DraftStat
            icon={<Clock3 size={17} />}
            label="Latest Update"
            value={latestDraft ? fmtDateTime(latestDraft.updatedAt) : "-"}
            detail={latestDraft ? String(latestDraft.title || "Untitled Draft") : "no saved drafts"}
          />
        </div>

        <div style={card}>
          {drafts.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13.5 }}>No drafts found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {drafts.map((d) => (
                <div
                  key={d.id}
                  style={draftRow}
                >
                  <div style={{ minWidth: 240, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={iconBox()}>
                      <PencilLine size={17} />
                    </span>
                    <div>
                      <div style={{ fontWeight: 900, color: UI.text }}>
                        {String(d.title || "Untitled Draft")}
                      </div>
                      <div style={{ color: UI.muted, fontSize: 12, marginTop: 3 }}>
                        Updated: {fmtDateTime(d.updatedAt)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={btn("primary")}
                      onClick={() => router.push(`/create-booking?draft=${encodeURIComponent(d.id)}`)}
                    >
                      <PencilLine size={14} />
                      Open Draft
                    </button>
                    <button
                      type="button"
                      style={btn("danger")}
                      onClick={() => removeDraft(d.id)}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
