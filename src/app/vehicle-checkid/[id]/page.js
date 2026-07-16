// src/app/vehicle-checkid/[id]/page.js
"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation"; // ← use this
import { doc, getDoc } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../../firebaseConfig";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* UI tokens (unchanged) */
const UI = UI_TOKENS;
const shell = { minHeight: "100vh", background: UI.page, color: UI.text, fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" };
const main = { flex: 1, padding: "28px 28px 40px", maxWidth: 900, margin: "0 auto" };
const h1 = { fontSize: 26, lineHeight: "30px", fontWeight: 800, marginBottom: 8, color: UI.text };
const meta = { fontSize: 13, color: UI.subtext };
const card = { background: UI.card, border: UI.border, borderRadius: UI.radius, boxShadow: UI.shadowSm, padding: 16 };
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const value = { fontSize: 14, color: UI.text, fontWeight: 700 };
const itemRow = { display: "grid", gridTemplateColumns: "58px 1fr 110px", alignItems: "center", gap: 10, borderBottom: "1px solid var(--color-brand-soft)", padding: "8px 0" };
const badge = (variant) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  border: "1px solid var(--color-border)",
  background: variant === "submitted" ? "var(--color-success-soft)" : variant === "draft" ? "var(--color-surface-subtle)" : "var(--color-surface)",
  color: variant === "submitted" ? "var(--color-success)" : "var(--color-text)",
});
const statusChip = (s) => ({
  display: "inline-flex",
  justifyContent: "center",
  minWidth: 84,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  fontSize: 12,
  fontWeight: 800,
  background: s === "serviceable" ? "var(--color-success-soft)" : s === "defect" ? "var(--color-danger-soft)" : s === "na" ? "var(--color-surface-subtle)" : "var(--color-surface)",
  color: s === "serviceable" ? "var(--color-success)" : s === "defect" ? "var(--color-danger)" : "var(--color-text)",
});

export default function VehicleCheckDetailPage() {
  //  Get dynamic segment in a client component
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
          <main className={layoutStyles.extracted1}>
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
          <main className={layoutStyles.extracted2}>
            <div style={{ ...card, textAlign: "center" }}>
              Vehicle check not found.
              {error && <div style={{ marginTop: 6, color: UI.subtext, fontSize: 12 }}>{error}</div>}
              <div className={layoutStyles.extracted3}>
                <Link
                  href="/vehicle-checks"
                  className={layoutStyles.extracted4}
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
        <main className={layoutStyles.extracted5}>
          <div className={layoutStyles.extracted6}>
            <h1 style={h1}>Vehicle Defect Report</h1>
            <span style={badge(row.status || "draft")}>{row.status || "draft"}</span>
          </div>
          <div style={meta}>Doc ID: <code>{row.id}</code></div>

          {/* Summary */}
          <div style={{ ...card, marginTop: 14 }}>
            <div className={layoutStyles.extracted7}>
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

            <div className={layoutStyles.extracted8}>
              <Field label="Additional Notes">
                <div
                  className={layoutStyles.extracted9}
                >
                  {row.notes?.trim() ? row.notes : "—"}
                </div>
              </Field>
            </div>
          </div>

          {/* Daily Check */}
          <div style={{ ...card, marginTop: 14 }}>
            <div className={layoutStyles.extracted10}>Daily Check</div>
            {items.length === 0 ? (
              <div style={{ color: UI.subtext, fontSize: 13 }}>No items recorded.</div>
            ) : (
              items.map((it, idx) => (
                <div key={idx} className={layoutStyles.extracted11}>
                  <div style={{ fontWeight: 800, color: UI.subtext }}>
                    {String(it.i ?? idx + 1).padStart(2, "0")}
                  </div>
                  <div className={layoutStyles.extracted12}>{it.label || "-"}</div>
                  <div><span style={statusChip(it.status)}>{labelForStatus(it.status)}</span></div>
                </div>
              ))
            )}
          </div>

          {/* Defect Notes */}
          {items.some((i) => i.status === "defect") && (
            <div style={{ ...card, marginTop: 14 }}>
              <div className={layoutStyles.extracted13}>Defect Notes</div>
              {items.filter((i) => i.status === "defect").map((it, idx) => (
                <div key={`def-${idx}`} className={layoutStyles.extracted14}>
                  <div className={layoutStyles.extracted15}>
                    {String(it.i ?? idx + 1).padStart(2, "0")} · {it.label}
                  </div>
                  <div
                    className={layoutStyles.extracted16}
                  >
                    {it.note?.trim() ? it.note : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Photos */}
          <div style={{ ...card, marginTop: 14 }}>
            <div className={layoutStyles.extracted17}>Photos</div>
            {photos.length === 0 ? (
              <div style={{ color: UI.subtext, fontSize: 13 }}>No photos attached.</div>
            ) : (
              <div className={layoutStyles.extracted18}>
                {photos.map((u, i) => (
                  <a
                    key={`${u}-${i}`}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={layoutStyles.extracted19}
                    title="Open full image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`photo ${i + 1}`} className={layoutStyles.extracted20} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className={layoutStyles.extracted21}>
            <Link
              href="/vehicle-checks"
              className={layoutStyles.extracted22}
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
      <div className={layoutStyles.extracted23}>{label}</div>
      {children}
    </div>
  );
}
function labelForStatus(s) {
  if (s === "serviceable") return "Yes Serviceable";
  if (s === "defect") return "No Defect";
  if (s === "na") return "– N/A";
  return "—";
}
