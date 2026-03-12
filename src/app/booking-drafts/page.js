"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

const DRAFTS_STORAGE_KEY = "create-booking:drafts:v1";

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  border: "1px solid #e5e7eb",
};

const pageWrap = {
  padding: "24px 18px 40px",
  background: UI.bg,
  minHeight: "100vh",
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: 12,
  padding: 16,
};

const btn = (kind = "ghost") => ({
  padding: "9px 12px",
  borderRadius: 10,
  border: kind === "primary" ? "1px solid #1d4ed8" : "1px solid #d1d5db",
  background: kind === "primary" ? "#1d4ed8" : "#fff",
  color: kind === "primary" ? "#fff" : UI.text,
  fontWeight: 800,
  cursor: "pointer",
});

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
        <div style={{ ...card, marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, color: UI.text }}>Booking Drafts</h1>
            <div style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}>
              Reopen unfinished booking forms saved automatically.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn("primary")} onClick={() => router.push("/create-booking")}>
              + New Booking
            </button>
            <button type="button" style={btn()} onClick={() => router.push("/dashboard")}>
              Back to Dashboard
            </button>
          </div>
        </div>

        <div style={card}>
          {drafts.length === 0 ? (
            <div style={{ color: UI.muted }}>No drafts found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {drafts.map((d) => (
                <div
                  key={d.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 900, color: UI.text }}>
                      {String(d.title || "Untitled Draft")}
                    </div>
                    <div style={{ color: UI.muted, fontSize: 12, marginTop: 3 }}>
                      Updated: {fmtDateTime(d.updatedAt)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={btn("primary")}
                      onClick={() => router.push(`/create-booking?draft=${encodeURIComponent(d.id)}`)}
                    >
                      Open Draft
                    </button>
                    <button
                      type="button"
                      style={btn()}
                      onClick={() => removeDraft(d.id)}
                    >
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

