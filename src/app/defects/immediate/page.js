"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../../firebaseConfig";

/* ───────────────── Visual tokens ──────────────── */
const UI = {
  page: "#f3f4f6",
  card: "#ffffff",
  text: "#0f172a",
  subtext: "#64748b",
  border: "1px solid #e5e7eb",
  radius: 12,
  radiusSm: 8,
  shadowSm: "0 4px 12px rgba(2, 6, 23, 0.06)",
  shadowMd: "0 8px 24px rgba(2, 6, 23, 0.08)",
};

const shell = {
  minHeight: "100vh",
  background: UI.page,
  color: UI.text,
  fontFamily:
    "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};

const main = { flex: 1, padding: "28px 28px 40px", maxWidth: 1600, margin: "0 auto" };
const h1 = { fontSize: 28, lineHeight: "34px", fontWeight: 800, marginBottom: 12 };
const subbar = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 };

const panel = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 16,
};

const filtersRow = { display: "flex", gap: 10, flexWrap: "wrap" };
const input = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  minWidth: 220,
  background: "#fff",
};
const select = { ...input, minWidth: 160 };
const table = { width: "100%", borderCollapse: "collapse", marginTop: 12 };
const th = { padding: "10px 12px", fontSize: 12, color: UI.subtext, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid #eef2f7", textAlign: "left" };
const td = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };

const badge = (bg, fg) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: bg,
  color: fg,
});

const btn = (bg = "#fff", fg = "#111827") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: bg,
  color: fg,
  fontWeight: 800,
  cursor: "pointer",
});

const linkBtn = { ...btn(), textDecoration: "none" };

const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;
const GENERAL_DEFECTS_PATH = "/defects/general";

/* ───────────────── Utilities ──────────────── */
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const fmtDate = (s) => {
  if (!s) return "—";
  const d = s?.toDate ? s.toDate() : new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString();
};

function extractApprovedImmediate(checkDocs) {
  const rows = [];
  for (const c of checkDocs) {
    if (!Array.isArray(c.items)) continue;
    c.items.forEach((it, idx) => {
      const r = it?.review;
      if (r?.status === "approved" && r?.category === "immediate") {
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
          maintenance: it.maintenance || null, // {status: 'in_progress'|'resolved'|'scheduled', note?, updatedAt?, updatedBy?}
        });
      }
    });
  }

  // newest first by dateISO if possible
  rows.sort((a, b) => {
    const ad = new Date(a.dateISO || 0).getTime();
    const bd = new Date(b.dateISO || 0).getTime();
    return bd - ad;
  });

  return rows;
}

/* ───────────────── Page ──────────────── */
export default function ImmediateDefectsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'pending' | 'in_progress' | 'resolved'
  const [savingId, setSavingId] = useState(null);
  const [notesModal, setNotesModal] = useState(null); // {row, newStatus, note}

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, "vehicleChecks"));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const list = extractApprovedImmediate(docs);
      setRows(list);
      setLoading(false);
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
      if (statusFilter === "pending") {
        data = data.filter((r) => !r.maintenance?.status);
      } else {
        data = data.filter((r) => r.maintenance?.status === statusFilter);
      }
    }

    return data;
  }, [rows, q, statusFilter]);

  const openStatusModal = (row, newStatus) => {
    setNotesModal({ row, newStatus, note: "" });
  };

  const saveMaintenanceStatus = async () => {
    if (!notesModal?.row || !notesModal?.newStatus) return;
    const { row, newStatus, note } = notesModal;

    const key = `${row.checkId}:${row.defectIndex}`;
    setSavingId(key);
    try {
      const who =
        auth?.currentUser?.displayName ||
        auth?.currentUser?.email ||
        "Supervisor";

      const path = `items.${row.defectIndex}.maintenance`;
      await updateDoc(doc(db, "vehicleChecks", row.checkId), {
        [path]: {
          status: newStatus, // 'in_progress' | 'resolved' | 'scheduled'
          note: (note || "").trim(),
          updatedAt: serverTimestamp(),
          updatedBy: who,
        },
        updatedAt: serverTimestamp(),
      });

      // update local
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

  const rerouteToGeneral = async (row) => {
    const ok = confirm(
      "Move this defect to General Maintenance? This will change its category to 'general'."
    );
    if (!ok) return;

    const key = `${row.checkId}:${row.defectIndex}`;
    setSavingId(key);
    try {
      const path = `items.${row.defectIndex}.review.category`;
      await updateDoc(doc(db, "vehicleChecks", row.checkId), {
        [path]: "general",
        updatedAt: serverTimestamp(),
      });

      // remove from local list (no longer immediate)
      setRows((prev) =>
        prev.filter(
          (r) => !(r.checkId === row.checkId && r.defectIndex === row.defectIndex)
        )
      );

      // take them to General list (nice flow)
      router.push(GENERAL_DEFECTS_PATH);
    } catch (e) {
      console.error(e);
      alert("Could not re-route. Please try again.");
      setSavingId(null);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ display: "flex", ...shell }}>
        <main style={main}>
          <div style={subbar}>
            <div>
              <h1 style={h1}>Immediate Defects</h1>
              <div style={{ fontSize: 12, color: UI.subtext }}>
                Approved defects routed to <strong>Immediate</strong> that require urgent action.
              </div>
            </div>
          </div>

          <div style={panel}>
            <div style={filtersRow}>
              <input
                type="search"
                placeholder="Search vehicle, defect, note, driver, job…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={input}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={select}
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending status</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <div style={{ marginLeft: "auto", fontSize: 12, color: UI.subtext, display: "flex", alignItems: "center", gap: 8 }}>
                <span>Showing</span>
                <strong style={{ color: UI.text }}>{filtered.length}</strong>
                <span>of {rows.length}</span>
              </div>
            </div>

            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Vehicle</th>
                  <th style={th}>Defect</th>
                  <th style={th}>Note</th>
                  <th style={th}>Driver</th>
                  <th style={{ ...th, textAlign: "center" }}>Photos</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ ...td, textAlign: "center", color: UI.subtext }}>
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...td, textAlign: "center", color: UI.subtext }}>
                      No immediate defects found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const key = `${r.checkId}:${r.defectIndex}`;
                    const m = r.maintenance?.status;
                    return (
                      <tr key={key}>
                        <td style={td}>{fmtDate(r.dateISO)}</td>
                        <td style={td}>{r.vehicle || "—"}</td>
                        <td style={td} title={r.itemLabel}>
                          <strong>#{r.defectIndex + 1}</strong> — {r.itemLabel}
                        </td>
                        <td style={{ ...td, maxWidth: 380 }}>
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
                        <td style={td}>{r.driverName || "—"}</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {r.photos?.length ? r.photos.length : 0}
                        </td>
                        <td style={td}>
                          {!m && <span style={badge("#fee2e2", "#991b1b")}>Urgent</span>}
                          {m === "in_progress" && <span style={badge("#fef9c3", "#854d0e")}>In progress</span>}
                          {m === "resolved" && <span style={badge("#ecfdf5", "#065f46")}>Resolved</span>}
                          {r.maintenance?.note ? (
                            <div style={{ marginTop: 6, fontSize: 12, color: UI.subtext }}>
                              {r.maintenance.note}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                          <a
                            href={CHECK_DETAIL_PATH(r.checkId)}
                            style={{ ...linkBtn, marginRight: 6 }}
                            title="View full vehicle check"
                          >
                            View →
                          </a>

                          {/* Start work (in_progress) */}
                          <button
                            style={{ ...btn("#fff"), marginRight: 6 }}
                            onClick={() => openStatusModal(r, "in_progress")}
                            disabled={savingId === key}
                            title="Mark as In Progress"
                          >
                            Start work
                          </button>

                          {/* Resolve */}
                          <button
                            style={{ ...btn("#ecfdf5", "#065f46"), marginRight: 6 }}
                            onClick={() => openStatusModal(r, "resolved")}
                            disabled={savingId === key}
                            title="Mark as Resolved"
                          >
                            Resolve
                          </button>

                          {/* Re-route to General */}
                          <button
                            style={btn("#f0f9ff", "#075985")}
                            onClick={() => rerouteToGeneral(r)}
                            disabled={savingId === key}
                            title="Move to General Maintenance"
                          >
                            Move to General
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* Notes / status modal */}
      {notesModal && (
        <NotesModal
          notesModal={notesModal}
          onClose={() => setNotesModal(null)}
          onSave={saveMaintenanceStatus}
          setNotesModal={setNotesModal}
        />
      )}
    </HeaderSidebarLayout>
  );
}

/* ───────────────── Notes Modal ──────────────── */
function NotesModal({ notesModal, onClose, onSave, setNotesModal }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.32)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          width: "min(92vw, 560px)",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          boxShadow: UI.shadowMd,
          padding: 18,
        }}
      >
        <h3 style={{ margin: "2px 0 10px", fontWeight: 800 }}>
          {notesModal.newStatus === "in_progress" ? "Mark as In Progress" : "Mark as Resolved"}
        </h3>
        <div style={{ fontSize: 13, color: UI.subtext, marginBottom: 10 }}>
          <div><strong>Vehicle:</strong> {notesModal.row.vehicle || "—"}</div>
          <div><strong>Item:</strong> #{notesModal.row.defectIndex + 1} — {notesModal.row.itemLabel}</div>
          <div><strong>Date:</strong> {fmtDate(notesModal.row.dateISO)}</div>
        </div>

        <label
          style={{ display: "block", fontSize: 12, fontWeight: 800, color: UI.subtext, marginBottom: 6 }}
        >
          {notesModal.newStatus === "in_progress"
            ? "Work note (optional)"
            : "Resolution note (optional)"}
        </label>
        <textarea
          rows={4}
          value={notesModal.note}
          onChange={(e) => setNotesModal((m) => ({ ...m, note: e.target.value }))}
          placeholder={
            notesModal.newStatus === "in_progress"
              ? "e.g., Isolated vehicle; ordering replacement part."
              : "e.g., Replaced brake hose; safety check passed."
          }
          style={{
            width: "100%",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 10,
            fontSize: 13,
            marginBottom: 12,
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btn("#fff", "#111827")}>
            Cancel
          </button>
          <button onClick={onSave} style={btn("#111827", "#fff")}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
