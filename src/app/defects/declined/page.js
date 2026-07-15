// src/app/defects/declined/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Camera,
  ClipboardList,
  RefreshCcw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { db, auth } from "../../../../firebaseConfig";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

/* Route */
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;

/* UI tokens */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid var(--legacy-color-d7dee8)",
  bg: "var(--legacy-color-f3f6f9)",
  card: "var(--legacy-color-ffffff)",
  text: "var(--legacy-color-0f172a)",
  muted: "var(--legacy-color-5f6f82)",
  brand: "var(--legacy-color-1f4b7a)",
  brandSoft: "var(--legacy-color-edf3f8)",
  brandBorder: "var(--legacy-color-c8d6e3)",
  danger: "var(--legacy-color-dc2626)",
  amber: "var(--legacy-color-d97706)",
  green: "var(--legacy-color-16a34a)",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const card = { ...surface, padding: 12 };

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  marginBottom: UI.gap,
};

const controls = {
  ...surface,
  boxShadow: "none",
  padding: 12,
  borderRadius: UI.radius,
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) auto auto",
  gap: 10,
  alignItems: "center",
};

const inputBase = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: 13,
  background: "var(--legacy-color-fff)",
};

const pill = (bg, fg, borderColor = "var(--legacy-color-e5e7eb)") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
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
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brand}`,
      background: "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--legacy-color-1f4b7a) 100%)",
      color: "var(--legacy-color-fff)",
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }
  return {
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brandBorder}`,
    background: "linear-gradient(180deg, var(--legacy-color-ffffff) 0%, var(--legacy-color-f8fbfe) 100%)",
    color: UI.text,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

/* table */
const tableWrap = { ...surface, overflowX: "auto", overflowY: "hidden", marginTop: 12 };
const thtd = { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid var(--legacy-color-eef2f7)", verticalAlign: "middle" };
const theadTh = {
  ...thtd,
  fontWeight: 900,
  color: UI.muted,
  background: "var(--legacy-color-f6f8fb)",
  fontSize: 11.5,
  letterSpacing: 0,
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
  background: "rgba(15,23,42,0.42)",
  zIndex: 999,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "90px 18px 18px",
};
const modalCard = {
  width: "min(92vw, 560px)",
  background: "var(--legacy-color-fff)",
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowHover,
  padding: 12,
};

/* Helpers */
const toJsDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const fmtDate = (value) => {
  if (!value) return "-";
  if (typeof value?.seconds === "number") {
    const tsDate = new Date(value.seconds * 1000);
    if (Number.isNaN(+tsDate)) return "-";
    return tsDate.toLocaleDateString("en-GB");
  }
  if (typeof value === "string") {
    const raw = value.trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(+d)) return "-";
  return d.toLocaleDateString("en-GB");
};
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
          vehicle: c.vehicle || "-",
          driverName: c.driverName || "-",
          dateISO: c.dateISO || "",
          reviewedAt: toJsDate(it.review?.reviewedAt) || toJsDate(c.updatedAt) || null,
          reviewedBy: it.review?.reviewedBy || "-",
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

/* Page */
export default function DeclinedDefectsPage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [reopeningId, setReopeningId] = useState(null);

  // modal confirm
  const [confirmModal, setConfirmModal] = useState(null); // { row }

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "vehicleChecks", operation: "load declined defects" });
      setRows([]);
      setLoading(false);
      return;
    }

    const run = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "vehicleChecks", dataAccessState));
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
  }, [accessKey, dataAccessState]);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = safeLower(query);
    return rows.filter((r) =>
      [r.vehicle, r.driverName, r.itemLabel, r.defectNote, r.jobLabel]
        .some((f) => safeLower(f).includes(q))
    );
  }, [rows, query]);

  const total = rows.length;
  const withReviewNotes = useMemo(() => rows.filter((r) => String(r.comment || "").trim()).length, [rows]);
  const withPhotos = useMemo(() => rows.filter((r) => Number(r.photosCount || 0) > 0).length, [rows]);

  const reopenDefect = async (row) => {
    const { checkId, defectIndex } = row;
    const key = `${checkId}:${defectIndex}`;
    setReopeningId(key);

    try {
      await updateDoc(doc(db, "vehicleChecks", checkId), tenantPayload(dataAccessState, {
        [`items.${defectIndex}.review`]: deleteField(),
        updatedAt: serverTimestamp(),
        reopenedBy: auth?.currentUser?.email || auth?.currentUser?.displayName || "Supervisor",
        reopenedAt: serverTimestamp(),
      }));

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
          box-shadow: 0 0 0 4px rgba(31,75,122,0.14);
          border-color: var(--legacy-color-9fb7cf) !important;
        }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .declined-defects-action:hover { background: var(--legacy-color-f8fbfe) !important; border-color: var(--legacy-color-b8c8d8) !important; }
        .declined-defects-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        .declined-defects-controls {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) auto auto;
          gap: 10px;
          align-items: center;
        }
        @media (max-width: 1180px) {
          .declined-defects-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .declined-defects-controls { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 720px) {
          .declined-defects-kpi-grid { grid-template-columns: 1fr !important; }
        }
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/vehicles" className="declined-defects-action" style={btn("ghost")}>
              <ArrowLeft size={15} />
              Back to Vehicles
            </Link>
          </div>
        </div>

        <div className="declined-defects-kpi-grid" style={kpiGrid}>
          <SummaryCard label="Declined" value={declinedCount} sub="Closed at review" icon={Ban} tone="danger" />
          <SummaryCard label="Showing" value={filtered.length} sub={`${total} total records`} icon={ClipboardList} tone="brand" />
          <SummaryCard label="Review Notes" value={withReviewNotes} sub="Reviewer comments logged" icon={RefreshCcw} tone="amber" />
          <SummaryCard label="With Photos" value={withPhotos} sub="Checks with attachments" icon={Camera} tone="soft" />
        </div>

        {/* Panel */}
        <section style={card}>
          {/* Controls */}
          <div className="declined-defects-controls" style={controls}>
            <label style={{ position: "relative", display: "block" }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: UI.muted }}
              />
              <input
                type="search"
                placeholder="Search vehicle, driver, note, job..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ ...inputBase, paddingLeft: 34 }}
              />
            </label>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <span style={pill("var(--legacy-color-fef2f2)", "var(--legacy-color-991b1b)", "var(--legacy-color-fecaca)")}>Declined</span>
              <span style={pill(UI.brandSoft, UI.brand, UI.brandBorder)}>
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
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          {/* Table */}
          <div style={tableWrap}>
            <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
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
                      Loading declined defects...
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
                      <tr key={key} style={{ background: i % 2 ? "var(--legacy-color-fff)" : "var(--legacy-color-fcfdff)" }}>
                        <td style={thtd}>{fmtDate(r.reviewedAt)}</td>
                        <td style={thtd}>{fmtDate(r.dateISO)}</td>

                        <td style={thtd}>
                          <div style={{ fontWeight: 900, color: UI.text }}>{r.vehicle}</div>
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>{r.jobLabel || "-"}</div>
                        </td>

                        <td style={thtd}>{r.driverName}</td>
                        <td style={thtd}>{r.jobLabel || "-"}</td>

                        <td style={thtd} title={r.itemLabel}>
                          <strong>#{r.defectIndex + 1}</strong> - {r.itemLabel}
                        </td>

                        <td style={{ ...thtd, maxWidth: 420 }}>
                          <div style={rowNoteClamp}>
                            {r.defectNote || "-"}
                            {r.comment ? (
                              <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                                <strong>Review note:</strong> {r.comment}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <td style={thtd}>{r.reviewedBy}</td>
                        <td style={{ ...thtd, textAlign: "center" }}>
                          <span style={pill("var(--legacy-color-f1f5f9)", UI.text)}>
                            <Camera size={13} />
                            {r.photosCount}
                          </span>
                        </td>

                        <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>
                          <Link
                            href={CHECK_DETAIL_PATH(r.checkId)}
                            className="declined-defects-action"
                            style={{ ...btn("ghost"), marginRight: 8 }}
                            title="View full vehicle check"
                          >
                            <ArrowUpRight size={13} />
                            View check
                          </Link>

                          <button
                            type="button"
                            onClick={() => setConfirmModal({ row: r })}
                            style={btn("ghost")}
                            disabled={isBusy}
                            title="Remove 'declined' review and send back to review queue"
                          >
                            <RefreshCcw size={13} />
                            {isBusy ? "Reopening..." : "Reopen to Review"}
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
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: UI.text }}>Reopen to Review</div>
                  <div style={{ fontSize: 12.5, color: UI.muted, marginTop: 4 }}>
                    This removes the declined review block so it returns to the review queue.
                  </div>
                </div>
                <button type="button" style={btn("ghost")} onClick={() => setConfirmModal(null)} disabled={!!reopeningId}>
                  <X size={14} />
                  Close
                </button>
              </div>

              <div style={{ ...surface, boxShadow: "none", borderRadius: UI.radius, border: UI.border, padding: 12 }}>
                <div style={{ fontSize: 13, color: UI.text, fontWeight: 900 }}>
                  {confirmModal.row.vehicle} - #{confirmModal.row.defectIndex + 1} {confirmModal.row.itemLabel}
                </div>
                <div style={{ fontSize: 12, color: UI.muted, marginTop: 6 }}>
                  Driver: {confirmModal.row.driverName} - Job: {confirmModal.row.jobLabel || "-"} - Reviewed: {fmtDate(confirmModal.row.reviewedAt)}
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: UI.muted }}>
                  Current note:
                </div>
                <div style={{ marginTop: 6, padding: 10, borderRadius: UI.radius, border: UI.border, background: "var(--legacy-color-fff)", fontSize: 13 }}>
                  {confirmModal.row.defectNote || "-"}
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
                    <RefreshCcw size={14} />
                    {reopeningId ? "Reopening..." : "Reopen"}
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

function SummaryCard({ label, value, sub, tone = "default", icon: Icon = ClipboardList }) {
  const toneStyles =
    tone === "danger"
      ? { fg: "var(--legacy-color-991b1b)", bg: "var(--legacy-color-fef2f2)", border: "var(--legacy-color-fecaca)" }
      : tone === "amber"
      ? { fg: "var(--legacy-color-9a3412)", bg: "var(--legacy-color-fff7ed)", border: "var(--legacy-color-fed7aa)" }
      : tone === "ok"
      ? { fg: "var(--legacy-color-065f46)", bg: "var(--legacy-color-ecfdf5)", border: "var(--legacy-color-bbf7d0)" }
      : tone === "brand" || tone === "soft"
      ? { fg: UI.brand, bg: UI.brandSoft, border: UI.brandBorder }
      : { fg: UI.text, bg: "var(--legacy-color-f6f8fb)", border: "var(--legacy-color-d7dee8)" };

  return (
    <div
      style={{
        ...card,
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...(tone === "soft" ? { background: UI.brandSoft, borderColor: UI.brandBorder } : null),
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11.5, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 900, color: toneStyles.fg, marginTop: 6 }}>{value}</div>
        </div>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: UI.radiusSm,
            border: `1px solid ${toneStyles.border}`,
            background: toneStyles.bg,
            color: toneStyles.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
          }}
        >
          <Icon size={17} />
        </span>
      </div>
      {sub ? <div style={{ fontSize: 12, color: UI.muted, lineHeight: 1.3, marginTop: 8 }}>{sub}</div> : null}
    </div>
  );
}
