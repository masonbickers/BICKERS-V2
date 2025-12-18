"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  getDocsFromServer,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../../firebaseConfig";

/* ───────────────────────────────────────────
   Mini design system (MATCHES YOUR JOBS HOME)
─────────────────────────────────────────── */
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
  amber: "#d97706",
  ok: "#16a34a",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const cardBase = {
  ...surface,
  padding: 16,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};
const cardHover = { transform: "translateY(-2px)", boxShadow: UI.shadowHover, borderColor: "#dbeafe" };

const sectionHeader = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 };
const titleMd = { fontSize: 16, fontWeight: 900, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12, marginTop: 4 };

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const chipSoft = { ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand };

const btn = (kind = "primary") => {
  if (kind === "ghost") {
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
  }
  if (kind === "pill") {
    return {
      padding: "8px 10px",
      borderRadius: 999,
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
  }
  if (kind === "danger") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #fecaca",
      background: "#fef2f2",
      color: "#991b1b",
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
  if (kind === "success") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #bbf7d0",
      background: "#ecfdf5",
      color: "#065f46",
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

const divider = { height: 1, background: "#e5e7eb", margin: "14px 0" };

/* table */
const tableWrap = { ...surface, overflow: "hidden" };
const thtd = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #eef2f7", verticalAlign: "top" };
const theadTh = { ...thtd, fontWeight: 900, color: UI.text, background: "#f8fafc", fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase" };

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

/* status badges */
const pill = (bg, fg, borderColor = "#e5e7eb") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: bg,
  color: fg,
  border: `1px solid ${borderColor}`,
});

const maintenanceBadge = (m) => {
  if (!m) return pill("#eef2ff", "#3730a3", "#c7d2fe"); // pending
  if (m === "scheduled") return pill("#ecfdf5", "#065f46", "#bbf7d0");
  if (m === "resolved") return pill("#f0f9ff", "#075985", "#bae6fd");
  return pill("#f8fafc", "#111827", "#e5e7eb");
};

const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;
const IMMEDIATE_DEFECTS_PATH = "/defects/immediate";

/* ───────────────── Utilities ──────────────── */
const fmtDate = (s) => {
  if (!s) return "—";
  const d = s?.toDate ? s.toDate() : new Date(s);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleDateString();
};

function extractApprovedGeneral(checkDocs) {
  const rows = [];
  for (const c of checkDocs) {
    if (!Array.isArray(c.items)) continue;

    c.items.forEach((it, idx) => {
      const r = it?.review || {};
      const rawCat = r.category ?? r.route ?? r.bucket ?? it.category ?? "";
      const cat = String(rawCat).trim().toLowerCase();

      if (r.status === "approved" && cat === "general") {
        rows.push({
          checkId: c.id,
          defectIndex: idx,
          dateISO: c.dateISO || c.date || c.createdAt || null,
          jobId: c.jobId || "",
          jobLabel: c.jobNumber ? `#${c.jobNumber}` : c.jobId || "",
          vehicle: c.vehicle || "",
          driverName: c.driverName || "",
          itemLabel: it.label || `Item ${idx + 1}`,
          note: it.note || "",
          photos: Array.isArray(c.photos) ? c.photos : [],
          review: r,
          maintenance: it.maintenance || null,
        });
      }
    });
  }

  rows.sort((a, b) => {
    const ad = new Date(a.dateISO || 0).getTime();
    const bd = new Date(b.dateISO || 0).getTime();
    return bd - ad;
  });

  return rows;
}

/* ───────────────── Page ──────────────── */
export default function GeneralDefectsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | scheduled | resolved
  const [savingId, setSavingId] = useState(null);
  const [notesModal, setNotesModal] = useState(null); // {row, newStatus, note}

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocsFromServer(collection(db, "vehicleChecks"));
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(extractApprovedGeneral(docs));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let data = rows;

    if (q.trim()) {
      const s = q.trim().toLowerCase();
      data = data.filter((r) =>
        [r.vehicle, r.itemLabel, r.note, r.driverName, r.jobLabel]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s))
      );
    }

    if (statusFilter !== "all") {
      if (statusFilter === "pending") data = data.filter((r) => !r.maintenance?.status);
      else data = data.filter((r) => r.maintenance?.status === statusFilter);
    }

    return data;
  }, [rows, q, statusFilter]);

  const openStatusModal = (row, newStatus) => setNotesModal({ row, newStatus, note: "" });

  const saveMaintenanceStatus = async () => {
    if (!notesModal?.row || !notesModal?.newStatus) return;
    const { row, newStatus, note } = notesModal;

    const key = `${row.checkId}:${row.defectIndex}`;
    setSavingId(key);

    try {
      const who = auth?.currentUser?.displayName || auth?.currentUser?.email || "Supervisor";
      const path = `items.${row.defectIndex}.maintenance`;

      await updateDoc(doc(db, "vehicleChecks", row.checkId), {
        [path]: {
          status: newStatus, // scheduled | resolved
          note: (note || "").trim(),
          updatedAt: serverTimestamp(),
          updatedBy: who,
        },
        updatedAt: serverTimestamp(),
      });

      setRows((prev) =>
        prev.map((r) =>
          r.checkId === row.checkId && r.defectIndex === row.defectIndex
            ? {
                ...r,
                maintenance: {
                  status: newStatus,
                  note: (note || "").trim(),
                  updatedAt: new Date().toISOString(),
                  updatedBy: who,
                },
              }
            : r
        )
      );

      setNotesModal(null);
    } catch (e) {
      console.error(e);
      alert("Could not save status. Please try again.");
    } finally {
      setSavingId(null);
    }
  };

  const rerouteToImmediate = async (row) => {
    const ok = confirm("Move this defect to Immediate Defects? This will change its category to 'immediate'.");
    if (!ok) return;

    const key = `${row.checkId}:${row.defectIndex}`;
    setSavingId(key);

    try {
      const path = `items.${row.defectIndex}.review.category`;
      await updateDoc(doc(db, "vehicleChecks", row.checkId), {
        [path]: "immediate",
        updatedAt: serverTimestamp(),
      });

      setRows((prev) => prev.filter((r) => !(r.checkId === row.checkId && r.defectIndex === row.defectIndex)));

      router.push(IMMEDIATE_DEFECTS_PATH);
      router.refresh?.();
    } catch (e) {
      console.error(e);
      alert("Could not re-route. Please try again.");
      setSavingId(null);
    }
  };

  const pendingCount = useMemo(() => rows.filter((r) => !r.maintenance?.status).length, [rows]);
  const scheduledCount = useMemo(() => rows.filter((r) => r.maintenance?.status === "scheduled").length, [rows]);
  const resolvedCount = useMemo(() => rows.filter((r) => r.maintenance?.status === "resolved").length, [rows]);

  return (
    <HeaderSidebarLayout>
      {/* subtle focus ring */}
      <style>{`
        input:focus, button:focus, select:focus, textarea:focus { outline: none; box-shadow: 0 0 0 4px rgba(29,78,216,0.15); border-color: #bfdbfe !important; }
        button:disabled { opacity: .55; cursor: not-allowed; }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>General Maintenance</h1>
            <div style={sub}>
              Approved defects routed to <b>General</b> for planning & scheduling.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={chip}>Pending: <b style={{ marginLeft: 6 }}>{pendingCount}</b></span>
            <span style={chipSoft}>Scheduled: <b style={{ marginLeft: 6 }}>{scheduledCount}</b></span>
            <span style={chip}>Resolved: <b style={{ marginLeft: 6 }}>{resolvedCount}</b></span>
          </div>
        </div>

        {/* Filters */}
        <section style={cardBase}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Queue</h2>
              <div style={hint}>Search defects and update maintenance status with a note.</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={chipSoft}>Showing <b style={{ marginLeft: 6 }}>{filtered.length}</b> / {rows.length}</span>
              <button
                type="button"
                style={btn("ghost")}
                onClick={() => { setQ(""); setStatusFilter("all"); }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={{ ...surface, boxShadow: "none", borderRadius: 12, border: UI.border, padding: 12, background: "#fff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10 }}>
              <input
                type="search"
                placeholder="Search vehicle, defect, note, driver, job…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={inputBase}
              />

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputBase}>
                <option value="all">All statuses</option>
                <option value="pending">Pending status</option>
                <option value="scheduled">Scheduled</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div style={divider} />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: UI.muted }}>
              <span style={maintenanceBadge(null)}>Pending</span>
              <span style={maintenanceBadge("scheduled")}>Scheduled</span>
              <span style={maintenanceBadge("resolved")}>Resolved</span>
              <span style={{ marginLeft: 6 }}>Use “Move to Immediate” for safety-critical issues.</span>
            </div>
          </div>

          {/* Table */}
          <div style={{ ...tableWrap, marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...theadTh, textAlign: "left" }}>Date</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Vehicle</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Defect</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Note</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Driver</th>
                  <th style={{ ...theadTh, textAlign: "center" }}>Photos</th>
                  <th style={{ ...theadTh, textAlign: "left" }}>Status</th>
                  <th style={{ ...theadTh, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...thtd, textAlign: "center", color: UI.muted }}>
                      No general maintenance items found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, idx) => {
                    const key = `${r.checkId}:${r.defectIndex}`;
                    const m = r.maintenance?.status;

                    return (
                      <tr key={key} style={{ background: idx % 2 ? "#ffffff" : "#fcfdff" }}>
                        <td style={thtd}>{fmtDate(r.dateISO)}</td>
                        <td style={thtd}>
                          <div style={{ fontWeight: 900, color: UI.text }}>{r.vehicle || "—"}</div>
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>{r.jobLabel}</div>
                        </td>

                        <td style={thtd} title={r.itemLabel}>
                          <strong>#{r.defectIndex + 1}</strong> — {r.itemLabel}
                        </td>

                        <td style={{ ...thtd, maxWidth: 420 }}>
                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {r.note || "—"}
                          </div>
                        </td>

                        <td style={thtd}>{r.driverName || "—"}</td>

                        <td style={{ ...thtd, textAlign: "center" }}>
                          <span style={chip}>{r.photos?.length ? r.photos.length : 0}</span>
                        </td>

                        <td style={thtd}>
                          <span style={maintenanceBadge(m)}>{m ? m.toUpperCase() : "PENDING"}</span>
                          {r.maintenance?.note ? (
                            <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>
                              {r.maintenance.note}
                            </div>
                          ) : null}
                        </td>

                        <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>
                          <a href={CHECK_DETAIL_PATH(r.checkId)} style={{ ...btn("pill"), marginRight: 6 }}>
                            View →
                          </a>

                          <button
                            style={{ ...btn("pill"), marginRight: 6 }}
                            onClick={() => openStatusModal(r, "scheduled")}
                            disabled={savingId === key}
                            title="Mark as Scheduled"
                          >
                            Schedule
                          </button>

                          <button
                            style={{ ...btn("success"), marginRight: 6, padding: "8px 10px", borderRadius: 999 }}
                            onClick={() => openStatusModal(r, "resolved")}
                            disabled={savingId === key}
                            title="Mark as Resolved"
                          >
                            Resolve
                          </button>

                          <button
                            style={{ ...btn("danger"), padding: "8px 10px", borderRadius: 999 }}
                            onClick={() => rerouteToImmediate(r)}
                            disabled={savingId === key}
                            title="Move to Immediate Defects"
                          >
                            Move to Immediate
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

        {/* Notes Modal */}
        {notesModal && (
          <div style={modalOverlay} onMouseDown={() => setNotesModal(null)}>
            <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: UI.text }}>
                    Mark as {notesModal.newStatus === "scheduled" ? "Scheduled" : "Resolved"}
                  </div>
                  <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
                    {notesModal.row.vehicle || "—"} · {notesModal.row.jobLabel} · #{notesModal.row.defectIndex + 1}
                  </div>
                </div>
                <button type="button" style={btn("ghost")} onClick={() => setNotesModal(null)}>
                  Close
                </button>
              </div>

              <div style={{ ...surface, boxShadow: "none", borderRadius: 12, border: UI.border, padding: 12, background: "#fff" }}>
                <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Note (optional)
                </div>
                <textarea
                  value={notesModal.note}
                  onChange={(e) => setNotesModal((m) => ({ ...m, note: e.target.value }))}
                  rows={4}
                  placeholder="e.g., Booked for workshop next Tuesday / parts ordered / fixed & checked."
                  style={{ ...inputBase, marginTop: 8, resize: "vertical" }}
                />

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                  <button type="button" style={btn("ghost")} onClick={() => setNotesModal(null)} disabled={!!savingId}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={notesModal.newStatus === "resolved" ? btn("success") : btn("primary")}
                    onClick={saveMaintenanceStatus}
                    disabled={!!savingId}
                  >
                    {savingId ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        table thead th { border-bottom: 1px solid #e5e7eb !important; }
        a:hover { background: #f8fafc !important; }
      `}</style>
    </HeaderSidebarLayout>
  );
}
