// src/app/defects/declined/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { db, auth } from "../../../../firebaseConfig";

/* Route */
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;

/* ───────────────── UI tokens (match Jobs Home) ───────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
  danger: "#dc2626",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const card = { ...surface, padding: 16 };

const controls = {
  ...surface,
  boxShadow: "none",
  padding: 12,
  borderRadius: 12,
  display: "grid",
  gridTemplateColumns: "1fr 240px auto",
  gap: 10,
  alignItems: "center",
};

const inputBase = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 13.5,
  background: "#fff",
};

const pill = (bg, fg, borderColor = "#e5e7eb") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  background: bg,
  color: fg,
  border: `1px solid ${borderColor}`,
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
});

const btn = (kind = "ghost") => {
  if (kind === "primary") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brand}`,
      background: UI.brand,
      color: "#fff",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    };
  }
  return {
    padding: "10px 12px",
    borderRadius: UI.radiusSm,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: UI.text,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
};

/* table */
const tableWrap = { ...surface, overflow: "hidden", marginTop: 12 };
const thtd = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #eef2f7", verticalAlign: "top" };
const theadTh = {
  ...thtd,
  fontWeight: 900,
  color: UI.text,
  background: "#f8fafc",
  fontSize: 12,
  letterSpacing: ".04em",
  textTransform: "uppercase",
};
const rowNoteClamp = {
  whiteSpace: "pre-wrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
};

/* modal */
const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.35)",
  zIndex: 999,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "90px 18px 18px",
};
const modalCard = {
  width: "min(92vw, 560px)",
  background: "#fff",
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowHover,
  padding: 16,
};

/* ───────────────── Helpers ───────────────── */
const toJsDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const safeLower = (s) => (s ? String(s).toLowerCase() : "");

/** Flatten declined defects out of each check document */
function mapDeclined(checkDocs) {
  const out = [];
  for (const c of checkDocs) {
    if (!Array.isArray(c.items)) continue;

    c.items.forEach((it, idx) => {
      if (it?.status === "defect" && it?.review?.status === "declined") {
        out.push({
          checkId: c.id,
          defectIndex: idx,
          vehicle: c.vehicle || "—",
          driverName: c.driverName || "—",
          dateISO: c.dateISO || "",
          reviewedAt: toJsDate(it.review?.reviewedAt) || toJsDate(c.updatedAt) || null,
          reviewedBy: it.review?.reviewedBy || "—",
          itemLabel: it.label || `Item ${idx + 1}`,
          defectNote: it.note || "",
          comment: it.review?.comment || "",
          jobLabel: c.jobNumber ? `#${c.jobNumber}` : c.jobId || "",
          photosCount: Array.isArray(c.photos) ? c.photos.length : 0,
        });
      }
    });
  }

  out.sort((a, b) => {
    const ta = a.reviewedAt ? +a.reviewedAt : 0;
    const tb = b.reviewedAt ? +b.reviewedAt : 0;
    return tb - ta;
  });

  return out;
}

/* ───────────────── Page ───────────────── */
export default function DeclinedDefectsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [reopeningId, setReopeningId] = useState(null);

  // modal confirm
  const [confirmModal, setConfirmModal] = useState(null); // { row }

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "vehicleChecks"));
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(mapDeclined(docs));
      } catch (e) {
        console.error("Load declined defects failed:", e);
        alert("Could not load declined defects.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = safeLower(query);
    return rows.filter((r) =>
      [r.vehicle, r.driverName, r.itemLabel, r.defectNote, r.jobLabel]
        .some((f) => safeLower(f).includes(q))
    );
  }, [rows, query]);

  const total = rows.length;

  const reopenDefect = async (row) => {
    const { checkId, defectIndex } = row;
    const key = `${checkId}:${defectIndex}`;
    setReopeningId(key);

    try {
      await updateDoc(doc(db, "vehicleChecks", checkId), {
        [`items.${defectIndex}.review`]: deleteField(),
        updatedAt: serverTimestamp(),
        reopenedBy: auth?.currentUser?.email || auth?.currentUser?.displayName || "Supervisor",
        reopenedAt: serverTimestamp(),
      });

      setRows((prev) =>
        prev.filter((r) => !(r.checkId === checkId && r.defectIndex === defectIndex))
      );
    } catch (e) {
      console.error("Reopen failed:", e);
      alert("Could not reopen this defect.");
    } finally {
      setReopeningId(null);
      setConfirmModal(null);
    }
  };

  const declinedCount = total;

  return (
    <HeaderSidebarLayout>
      <style>{`
        input:focus, button:focus, select:focus, textarea:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
          border-color: #bfdbfe !important;
        }
        button:disabled { opacity: .55; cursor: not-allowed; }
        a:hover { background: #f8fafc !important; }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Declined Defects</h1>
            <div style={sub}>
              Defects that were <b>declined</b> during review. You can reopen to send back to the review queue.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={pill("#fef2f2", "#991b1b", "#fecaca")}>
              Declined: <b style={{ marginLeft: 6 }}>{declinedCount}</b>
            </span>
            <Link href="/vehicles" style={btn("ghost")}>
              ← Back to Vehicles
            </Link>
          </div>
        </div>

        {/* Panel */}
        <section style={card}>
          {/* Controls */}
          <div style={controls}>
            <input
              type="search"
              placeholder="Search vehicle, driver, note, job…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={inputBase}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <span style={pill("#fef2f2", "#991b1b", "#fecaca")}>Declined</span>
              <span style={pill(UI.brandSoft, UI.brand, "#dbeafe")}>
                Showing <b style={{ marginLeft: 6 }}>{filtered.length}</b> / {total}
              </span>
            </div>

            <button
              type="button"
              style={btn("ghost")}
              onClick={() => setQuery("")}
              disabled={!query}
              title="Clear search"
            >
              Reset
            </button>
          </div>

          {/* Table */}
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={theadTh}>Reviewed</th>
                  <th style={theadTh}>Date</th>
                  <th style={theadTh}>Vehicle</th>
                  <th style={theadTh}>Driver</th>
                  <th style={theadTh}>Job</th>
                  <th style={theadTh}>Item</th>
                  <th style={theadTh}>Note</th>
                  <th style={theadTh}>Reviewer</th>
                  <th style={{ ...theadTh, textAlign: "center" }}>Photos</th>
                  <th style={{ ...theadTh, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                      Loading declined defects…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                      No declined defects found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => {
                    const key = `${r.checkId}:${r.defectIndex}`;
                    const isBusy = reopeningId === key;
                    return (
                      <tr key={key} style={{ background: i % 2 ? "#fff" : "#fcfdff" }}>
                        <td style={thtd}>{fmtDate(r.reviewedAt)}</td>
                        <td style={thtd}>{r.dateISO || "—"}</td>

                        <td style={thtd}>
                          <div style={{ fontWeight: 900, color: UI.text }}>{r.vehicle}</div>
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>{r.jobLabel || "—"}</div>
                        </td>

                        <td style={thtd}>{r.driverName}</td>
                        <td style={thtd}>{r.jobLabel || "—"}</td>

                        <td style={thtd} title={r.itemLabel}>
                          <strong>#{r.defectIndex + 1}</strong> — {r.itemLabel}
                        </td>

                        <td style={{ ...thtd, maxWidth: 420 }}>
                          <div style={rowNoteClamp}>
                            {r.defectNote || "—"}
                            {r.comment ? (
                              <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                                <strong>Review note:</strong> {r.comment}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <td style={thtd}>{r.reviewedBy}</td>
                        <td style={{ ...thtd, textAlign: "center" }}>
                          <span style={pill("#f1f5f9", UI.text)}>{r.photosCount}</span>
                        </td>

                        <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>
                          <Link
                            href={CHECK_DETAIL_PATH(r.checkId)}
                            style={{ ...btn("ghost"), marginRight: 8 }}
                            title="View full vehicle check"
                          >
                            View check →
                          </Link>

                          <button
                            type="button"
                            onClick={() => setConfirmModal({ row: r })}
                            style={btn("ghost")}
                            disabled={isBusy}
                            title="Remove 'declined' review and send back to review queue"
                          >
                            {isBusy ? "Reopening…" : "Reopen to Review"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Confirm Modal */}
        {confirmModal?.row && (
          <div style={modalOverlay} onMouseDown={() => setConfirmModal(null)}>
            <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: UI.text }}>Reopen to Review</div>
                  <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
                    This removes the declined review block so it returns to the review queue.
                  </div>
                </div>
                <button type="button" style={btn("ghost")} onClick={() => setConfirmModal(null)} disabled={!!reopeningId}>
                  Close
                </button>
              </div>

              <div style={{ ...surface, boxShadow: "none", borderRadius: 12, border: UI.border, padding: 12 }}>
                <div style={{ fontSize: 13, color: UI.text, fontWeight: 900 }}>
                  {confirmModal.row.vehicle} — #{confirmModal.row.defectIndex + 1} {confirmModal.row.itemLabel}
                </div>
                <div style={{ fontSize: 12, color: UI.muted, marginTop: 6 }}>
                  Driver: {confirmModal.row.driverName} · Job: {confirmModal.row.jobLabel || "—"} · Reviewed: {fmtDate(confirmModal.row.reviewedAt)}
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: UI.muted }}>
                  Current note:
                </div>
                <div style={{ marginTop: 6, padding: 10, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontSize: 13 }}>
                  {confirmModal.row.defectNote || "—"}
                  {confirmModal.row.comment ? (
                    <div style={{ marginTop: 8, color: UI.muted, fontSize: 12 }}>
                      <strong>Review note:</strong> {confirmModal.row.comment}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                  <button type="button" style={btn("ghost")} onClick={() => setConfirmModal(null)} disabled={!!reopeningId}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={btn("primary")}
                    onClick={() => reopenDefect(confirmModal.row)}
                    disabled={!!reopeningId}
                  >
                    {reopeningId ? "Reopening…" : "Reopen"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
