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
const IMMEDIATE_DEFECTS_PATH = "/defects/immediate";

/* ───────────────── Utilities ──────────────── */
const fmtDate = (s) => {
  if (!s) return "—";
  const d = s?.toDate ? s.toDate() : new Date(s);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString();
};

function extractApprovedGeneral(checkDocs) {
  const rows = [];
  for (const c of checkDocs) {
    if (!Array.isArray(c.items)) continue;

    c.items.forEach((it, idx) => {
      const r = it?.review || {};
      // Normalize category; support legacy fields & case
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
          maintenance: it.maintenance || null, // {status: 'scheduled'|'resolved', note?, updatedAt?, updatedBy?}
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
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'pending' | 'scheduled' | 'resolved'
  const [savingId, setSavingId] = useState(null);
  const [notesModal, setNotesModal] = useState(null); // {row, newStatus, note}

  // Fresh read (no cache) so newly approved items appear immediately
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocsFromServer(collection(db, "vehicleChecks"));
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const list = extractApprovedGeneral(docs);
        setRows(list);
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
          status: newStatus, // 'scheduled' | 'resolved'
          note: (note || "").trim(),
          updatedAt: serverTimestamp(),
          updatedBy: who,
        },
        updatedAt: serverTimestamp(),
      });

      // optimistic UI update
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
    const ok = confirm(
      "Move this defect to Immediate Defects? This will change its category to 'immediate'."
    );
    if (!ok) return;

    const key = `${row.checkId}:${row.defectIndex}`;
    setSavingId(key);
    try {
      const path = `items.${row.defectIndex}.review.category`;
      await updateDoc(doc(db, "vehicleChecks", row.checkId), {
        [path]: "immediate",
        updatedAt: serverTimestamp(),
      });

      // remove from local list (no longer general)
      setRows((prev) =>
        prev.filter(
          (r) => !(r.checkId === row.checkId && r.defectIndex === row.defectIndex)
        )
      );

      router.push(IMMEDIATE_DEFECTS_PATH);
      router.refresh?.();
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
              <h1 style={h1}>General Maintenance</h1>
              <div style={{ fontSize: 12, color: UI.subtext }}>
                Approved defects routed to <strong>General</strong> for planning & scheduling.
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
                <option value="scheduled">Scheduled</option>
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
                      No general maintenance items found.
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
                          {!m && <span style={badge("#eef2ff", "#3730a3")}>Pending</span>}
                          {m === "scheduled" && <span style={badge("#ecfdf5", "#065f46")}>Scheduled</span>}
                          {m === "resolved" && <span style={badge("#f0f9ff", "#075985")}>Resolved</span>}
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

                          {/* Mark Scheduled */}
                          <button
                            style={{ ...btn("#ffffff"), marginRight: 6 }}
                            onClick={() => openStatusModal(r, "scheduled")}
                            disabled={savingId === key}
                            title="Mark as Scheduled"
                          >
                            Schedule
                          </button>

                          {/* Mark Resolved */}
                          <button
                            style={{ ...btn("#ecfdf5", "#065f46"), marginRight: 6 }}
                            onClick={() => openStatusModal(r, "resolved")}
                            disabled={savingId === key}
                            title="Mark as Resolved"
                          >
                            Resolve
                          </button>

                          {/* Re-route to Immediate */}
                          <button
                            style={btn("#fef2f2", "#991b1b")}
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
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}
