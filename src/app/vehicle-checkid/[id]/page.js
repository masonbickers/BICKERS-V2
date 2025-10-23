// src/app/vehicle-checkid/[id]/page.js
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation"; // ← use this
import { doc, getDoc } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../../firebaseConfig";

/* UI tokens (unchanged) */
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
const shell = { minHeight: "100vh", background: UI.page, color: UI.text, fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" };
const main = { flex: 1, padding: "28px 28px 40px", maxWidth: 900, margin: "0 auto" };
const h1 = { fontSize: 26, lineHeight: "30px", fontWeight: 800, marginBottom: 8, color: UI.text };
const meta = { fontSize: 13, color: UI.subtext };
const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm, padding: 16 };
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const value = { fontSize: 14, color: UI.text, fontWeight: 700 };
const itemRow = { display: "grid", gridTemplateColumns: "58px 1fr 110px", alignItems: "center", gap: 10, borderBottom: "1px solid #eef2f7", padding: "8px 0" };
const badge = (variant) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  border: "1px solid #e5e7eb",
  background: variant === "submitted" ? "#ecfdf5" : variant === "draft" ? "#f8fafc" : "#fff",
  color: variant === "submitted" ? "#065f46" : "#111827",
});
const statusChip = (s) => ({
  display: "inline-flex",
  justifyContent: "center",
  minWidth: 84,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  fontSize: 12,
  fontWeight: 800,
  background: s === "serviceable" ? "#f0fdf4" : s === "defect" ? "#fef2f2" : s === "na" ? "#f8fafc" : "#fff",
  color: s === "serviceable" ? "#166534" : s === "defect" ? "#991b1b" : "#111827",
});

export default function VehicleCheckDetailPage() {
  // ✅ Get dynamic segment in a client component
  const routeParams = useParams();
  const raw = Array.isArray(routeParams?.id) ? routeParams.id[0] : routeParams?.id ?? "";
  const docId = decodeURIComponent(String(raw)).trim();

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError("");

      try {
        if (!docId) {
          setRow(null);
          setError("Missing document id in URL.");
          return;
        }
        const snap = await getDoc(doc(db, "vehicleChecks", docId));
        if (!alive) return;

        if (snap.exists()) {
          setRow({ id: snap.id, ...snap.data() });
        } else {
          setRow(null);
          setError(`No document found for id: ${docId}`);
        }
      } catch (e) {
        if (!alive) return;
        console.error("vehicle-check detail error:", e);
        setRow(null);
        setError("Failed to load vehicle check.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [docId]);

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={shell}>
          <main style={main}>
            <div style={{ ...card, textAlign: "center" }}>Loading…</div>
          </main>
        </div>
      </HeaderSidebarLayout>
    );
  }

  if (!row) {
    return (
      <HeaderSidebarLayout>
        <div style={shell}>
          <main style={main}>
            <div style={{ ...card, textAlign: "center" }}>
              Vehicle check not found.
              {error && <div style={{ marginTop: 6, color: UI.subtext, fontSize: 12 }}>{error}</div>}
              <div style={{ marginTop: 10 }}>
                <Link
                  href="/vehicle-checks"
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    padding: "6px 10px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    fontWeight: 800,
                    background: "#fff",
                  }}
                >
                  ← Back to list
                </Link>
              </div>
            </div>
          </main>
        </div>
      </HeaderSidebarLayout>
    );
  }

  const items = Array.isArray(row.items) ? row.items : [];
  const photos = Array.isArray(row.photos) ? row.photos : [];

  return (
    <HeaderSidebarLayout>
      <div style={shell}>
        <main style={main}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={h1}>Vehicle Defect Report</h1>
            <span style={badge(row.status || "draft")}>{row.status || "draft"}</span>
          </div>
          <div style={meta}>Doc ID: <code>{row.id}</code></div>

          {/* Summary */}
          <div style={{ ...card, marginTop: 14 }}>
            <div style={grid2}>
              <Field label="Date"><div style={value}>{row.dateISO || "-"}</div></Field>
              <Field label="Time"><div style={value}>{row.time || "-"}</div></Field>
              <Field label="Job"><div style={value}>{row.jobId || "-"}</div></Field>
              <Field label="Vehicle"><div style={value}>{row.vehicle || "-"}</div></Field>
              <Field label="Driver">
                <div style={value}>
                  {row.driverName || "-"}
                  {row.driverCode ? <span style={{ color: UI.subtext }}> ({row.driverCode})</span> : null}
                </div>
              </Field>
              <Field label="Odometer"><div style={value}>{row.odometer || "-"}</div></Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Additional Notes">
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    background: "#fafafa",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                  }}
                >
                  {row.notes?.trim() ? row.notes : "—"}
                </div>
              </Field>
            </div>
          </div>

          {/* Daily Check */}
          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 16 }}>Daily Check</div>
            {items.length === 0 ? (
              <div style={{ color: UI.subtext, fontSize: 13 }}>No items recorded.</div>
            ) : (
              items.map((it, idx) => (
                <div key={idx} style={itemRow}>
                  <div style={{ fontWeight: 800, color: UI.subtext }}>
                    {String(it.i ?? idx + 1).padStart(2, "0")}
                  </div>
                  <div style={{ fontWeight: 700 }}>{it.label || "-"}</div>
                  <div><span style={statusChip(it.status)}>{labelForStatus(it.status)}</span></div>
                </div>
              ))
            )}
          </div>

          {/* Defect Notes */}
          {items.some((i) => i.status === "defect") && (
            <div style={{ ...card, marginTop: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 16 }}>Defect Notes</div>
              {items.filter((i) => i.status === "defect").map((it, idx) => (
                <div key={`def-${idx}`} style={{ borderBottom: "1px solid #eef2f7", padding: "8px 0" }}>
                  <div style={{ fontWeight: 800 }}>
                    {String(it.i ?? idx + 1).padStart(2, "0")} · {it.label}
                  </div>
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "#fafafa",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                      marginTop: 6,
                    }}
                  >
                    {it.note?.trim() ? it.note : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Photos */}
          <div style={{ ...card, marginTop: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 16 }}>Photos</div>
            {photos.length === 0 ? (
              <div style={{ color: UI.subtext, fontSize: 13 }}>No photos attached.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                {photos.map((u, i) => (
                  <a
                    key={`${u}-${i}`}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#fafafa",
                    }}
                    title="Open full image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`photo ${i + 1}`} style={{ width: "100%", height: 140, objectFit: "cover" }} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <Link
              href="/vehicle-checks"
              style={{
                display: "inline-flex",
                gap: 8,
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                background: "#fff",
                fontWeight: 800,
              }}
            >
              ← Back to list
            </Link>
          </div>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

/* helpers */
function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function labelForStatus(s) {
  if (s === "serviceable") return "✓ Serviceable";
  if (s === "defect") return "✗ Defect";
  if (s === "na") return "– N/A";
  return "—";
}
