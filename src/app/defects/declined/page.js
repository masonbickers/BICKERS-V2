// src/app/defects/declined/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { db, auth } from "../../../../firebaseConfig";

// Reuse the vehicle check detail route style you used elsewhere
const CHECK_DETAIL_PATH = (id) => `/vehicle-checkid/${encodeURIComponent(id)}`;

/* ───────────── Visual tokens (match vehicles page) ───────────── */
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

const h1 = {
  fontSize: 28,
  lineHeight: "34px",
  fontWeight: 800,
  marginBottom: 16,
  color: UI.text,
  letterSpacing: 0.2,
};

const panel = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
  padding: 16,
};

const controlsBar = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
  flexWrap: "wrap",
};

const input = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
  minWidth: 220,
};

const table = { width: "100%", borderCollapse: "collapse" };
const thtd = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
};
const th = { ...thtd, textAlign: "left", fontWeight: 800, color: UI.text, background: "#fafafa" };

const pill = (bg, fg) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  background: bg,
  color: fg,
  fontSize: 11,
  fontWeight: 800,
});

const btn = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: bg,
  color: fg,
  fontWeight: 800,
  cursor: "pointer",
});

/* ───────────── Helpers ───────────── */
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
            // keep both raw and formatted times for sort
          reviewedAt: toJsDate(it.review?.reviewedAt) || toJsDate(c.updatedAt) || null,
          reviewedBy: it.review?.reviewedBy || "—",
          itemLabel: it.label || `Item ${idx + 1}`,
          defectNote: it.note || "",
          comment: it.review?.comment || "",
          jobLabel: c.jobNumber ? `#${c.jobNumber}` : (c.jobId || ""),
          photosCount: Array.isArray(c.photos) ? c.photos.length : 0,
        });
      }
    });
  }
  // newest declined first
  out.sort((a, b) => {
    const ta = a.reviewedAt ? +a.reviewedAt : 0;
    const tb = b.reviewedAt ? +b.reviewedAt : 0;
    return tb - ta;
  });
  return out;
}

/* ───────────── Page Component ───────────── */
export default function DeclinedDefectsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [reopeningId, setReopeningId] = useState(null); // `${checkId}:${idx}` while processing

  // Load all checks and flatten declined items
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

  // Simple client-side filter
  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = safeLower(query);
    return rows.filter((r) =>
      [r.vehicle, r.driverName, r.itemLabel, r.defectNote, r.jobLabel]
        .some((f) => safeLower(f).includes(q))
    );
  }, [rows, query]);

  const total = rows.length;

  // Reopen (remove the review block so it returns to "pending" on the Vehicles page)
  const reopenDefect = async (checkId, defectIndex) => {
    const key = `${checkId}:${defectIndex}`;
    setReopeningId(key);
    try {
      await updateDoc(doc(db, "vehicleChecks", checkId), {
        [`items.${defectIndex}.review`]: deleteField(),
        updatedAt: serverTimestamp(),
        // optional: track who reopened
        reopenedBy: auth?.currentUser?.email || auth?.currentUser?.displayName || "Supervisor",
        reopenedAt: serverTimestamp(),
      });
      // Optimistic UI update
      setRows((prev) =>
        prev.filter((r) => !(r.checkId === checkId && r.defectIndex === defectIndex))
      );
    } catch (e) {
      console.error("Reopen failed:", e);
      alert("Could not reopen this defect.");
    } finally {
      setReopeningId(null);
    }
  };

  return (
    <div style={shell}>
      <main style={main}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h1 style={h1}>Declined Defects</h1>
          <Link href="/vehicles" style={{ ...btn("#fff", "#111827") }}>← Back to Vehicles</Link>
        </div>

        <div style={{ marginBottom: 8, color: UI.subtext, fontSize: 13 }}>
          {loading ? "Loading…" : `${filtered.length} of ${total} declined defects`}
        </div>

        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={controlsBar}>
            <input
              type="text"
              placeholder="Search by vehicle, driver, note, job…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={input}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <span style={pill("#fef2f2", "#991b1b")}>Declined</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Reviewed</th>
                  <th style={th}>Date</th>
                  <th style={th}>Vehicle</th>
                  <th style={th}>Driver</th>
                  <th style={th}>Job</th>
                  <th style={th}>Item</th>
                  <th style={th}>Note</th>
                  <th style={th}>Reviewer</th>
                  <th style={{ ...th, textAlign: "center" }}>Photos</th>
                  <th style={{ ...th, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ ...thtd, textAlign: "center", color: UI.subtext }}>
                      Loading declined defects…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ ...thtd, textAlign: "center", color: UI.subtext }}>
                      No declined defects found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => {
                    const key = `${r.checkId}:${r.defectIndex}`;
                    return (
                      <tr key={key}>
                        <td style={thtd}>{fmtDate(r.reviewedAt)}</td>
                        <td style={thtd}>{r.dateISO || "—"}</td>
                        <td style={thtd}>{r.vehicle}</td>
                        <td style={thtd}>{r.driverName}</td>
                        <td style={thtd}>{r.jobLabel || "—"}</td>
                        <td style={thtd}><strong>#{r.defectIndex + 1}</strong> — {r.itemLabel}</td>
                        <td style={{ ...thtd, maxWidth: 380 }}>
                          <div style={{
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                          }}>
                            {r.defectNote || "—"}
                            {r.comment ? (
                              <div style={{ marginTop: 6, fontSize: 12, color: UI.subtext }}>
                                <strong>Review note:</strong> {r.comment}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td style={thtd}>{r.reviewedBy}</td>
                        <td style={{ ...thtd, textAlign: "center" }}>{r.photosCount}</td>
                        <td style={{ ...thtd, textAlign: "right", whiteSpace: "nowrap" }}>
                          <Link
                            href={CHECK_DETAIL_PATH(r.checkId)}
                            style={{ ...btn("#fff", "#111827"), marginRight: 6 }}
                          >
                            View check →
                          </Link>
                          <button
                            onClick={() => reopenDefect(r.checkId, r.defectIndex)}
                            style={btn("#f8fafc", "#0f172a")}
                            disabled={reopeningId === key}
                            title="Remove 'declined' review and send back to the review queue"
                          >
                            {reopeningId === key ? "Reopening…" : "Reopen to Review"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
