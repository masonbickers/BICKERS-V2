// src/app/recce-form/[id]/page.js
"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import { UI_TOKENS } from "@/app/utils/uiTokens";

const UI = UI_TOKENS;
const card = { background:UI.bg, border:UI.border, borderRadius:UI.radiusLg, boxShadow:UI.shadow, padding:16 };

const Row = ({ label, value }) =>
  value ? (
    <div className={layoutStyles.extracted1}>
      <div style={{ fontWeight:800, color:UI.text }}>{label}</div>
      <div style={{ whiteSpace:"pre-wrap", fontWeight:600, color:UI.text }}>{value}</div>
    </div>
  ) : null;

// Build the canonical doc key the mobile app now uses
const makeKey = (bookingId, dateISO, createdBy) =>
  [bookingId, dateISO, createdBy || "N/A"].join("__");

export default function RecceFormPage() {
  const { id } = useParams(); // might be an old auto-ID or the new stable key
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [recce, setRecce] = useState(null);
  const [error, setError] = useState(null);

  const unsubRef = useRef(null);
  const currentIdRef = useRef(null);

  useEffect(() => {
    if (!id) return;

    // helper to start/replace a live subscription
    const listenTo = (docId, { maybeRedirect } = {}) => {
      if (unsubRef.current) unsubRef.current();
      currentIdRef.current = docId;
      setLoading(true);
      unsubRef.current = onSnapshot(
        doc(db, "recces", docId),
        (snap) => {
          if (!snap.exists()) {
            setRecce(null);
            setError("Recce form not found.");
            setLoading(false);
            return;
          }

          const data = { id: snap.id, ...snap.data() };
          setError(null);
          setRecce(data);
          setLoading(false);

          // If this doc reveals its canonical key and it's different, switch to it
          const b = data.bookingId || data.answers?.bookingId;
          const d = data.dateISO || data.answers?.dateISO;
          const c = data.createdBy || data.answers?.createdBy;

          if (b && d) {
            const canonical = makeKey(b, d, c);
            const isDifferent = canonical && canonical !== snap.id;
            if (isDifferent) {
              // Swap listener to canonical and optionally fix the URL once
              if (maybeRedirect) router.replace(`/recce-form/${canonical}`);
              listenTo(canonical, { maybeRedirect: false });
            }
          }
        },
        (err) => {
          console.error(err);
          setError("Failed to load recce form.");
          setLoading(false);
        }
      );
    };

    // Start by listening to whatever ID we were given.
    // Allow one-time redirect if we discover a canonical key.
    listenTo(String(id), { maybeRedirect: true });

    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, [id, router]);

  const answers = useMemo(() => recce?.answers || {}, [recce]);

  // Prefer top-level photos, then answers.photos; de-dupe
  const photoUrls = useMemo(() => {
    const top = Array.isArray(recce?.photos) ? recce.photos : [];
    const ans = Array.isArray(answers?.photos) ? answers.photos : [];
    return Array.from(new Set([...top, ...ans].filter(Boolean)));
  }, [answers, recce]);

  // submitted / updated times
  const submittedAt = useMemo(() => {
    const a = answers?.createdAt;
    if (typeof a === "string") return new Date(a);
    const r = recce?.createdAt;
    if (r?.seconds) return new Date(r.seconds * 1000);
    if (typeof r === "string") return new Date(r);
    return null;
  }, [answers, recce]);

  const updatedAt = useMemo(() => {
    const u = recce?.updatedAt;
    if (u?.seconds) return new Date(u.seconds * 1000);
    if (typeof u === "string") return new Date(u);
    return null;
  }, [recce]);

  // cache-buster for images
  const bust = updatedAt ? String(updatedAt.getTime()) : "";

  return (
    <div className={layoutStyles.extracted2}>
      <div className={layoutStyles.extracted3}>
        {/* Header */}
        <div className={layoutStyles.extracted4}>
          <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:UI.text }}>Recce Form</h1>
          <div className={layoutStyles.extracted5}>
            <button onClick={() => router.back()} className={layoutStyles.extracted6}>← Back</button>
            <button onClick={() => window.location.reload()} className={layoutStyles.extracted7} title="Force refresh">Refresh</button>
            <button onClick={() => window.print()} className={layoutStyles.extracted8}>Print</button>
          </div>
        </div>

        {/* Status / meta */}
        <div style={{ ...card }}>
          {loading && <div style={{ color:UI.muted, fontWeight:700 }}>Loading…</div>}
          {error && <div className={layoutStyles.extracted9}>{error}</div>}

          {!loading && !error && recce && (
            <div className={layoutStyles.extracted10}>
              <div className={layoutStyles.extracted11}>
                <span style={{ fontSize:12, fontWeight:800, padding:"4px 8px", borderRadius:999, background:String(recce.status||"").toLowerCase()==="approved"?"var(--color-success-accent)":"var(--color-success-accent)", border:"1px solid var(--color-border-strong)", color:"var(--shell-sidebar-bg)" }}>
                  {(recce.status || "Submitted").toUpperCase()}
                </span>

                {recce.bookingId && (
                  <span title="Booking ID" className={layoutStyles.extracted12}>
                    Booking: {recce.bookingId}
                  </span>
                )}

                {submittedAt && (
                  <span className={layoutStyles.extracted13}>
                    Submitted {submittedAt.toLocaleString("en-GB")}
                  </span>
                )}

                {updatedAt && (
                  <span className={layoutStyles.extracted14}>
                    Last updated {updatedAt.toLocaleString("en-GB")}
                  </span>
                )}
              </div>

              {/* Answers */}
              <div>
                <Row label="Recce Lead" value={answers.lead} />
                <Row label="Location Name" value={answers.locationName} />
                <Row label="Address" value={answers.address} />
                <Row label="Parking" value={answers.parking} />
                <Row label="Access" value={answers.access} />
                <Row label="Hazards" value={answers.hazards} />
                <Row label="Power Availability" value={answers.power} />
                <Row label="Measurements" value={answers.measurements} />
                <Row label="Recommended Kit" value={answers.recommendedKit} />
                <Row label="Notes" value={answers.notes} />

                <Row label="Created By" value={answers.createdBy || recce.createdBy} />
                <Row label="Created At" value={submittedAt ? submittedAt.toLocaleString("en-GB") : (answers.createdAt || "")} />

                {/* Photos */}
                <div className={layoutStyles.extracted15}>
                  <div style={{ fontWeight:800, color:UI.text, marginBottom:8 }}>Photos</div>
                  {photoUrls.length === 0 ? (
                    <div style={{ color:UI.muted, fontWeight:600 }}>No photos attached.</div>
                  ) : (
                    <div className={layoutStyles.extracted16}>
                      {photoUrls.map((url, i) => {
                        const src = bust ? `${url}${url.includes("?") ? "&" : "?"}v=${bust}` : url;
                        return (
                          <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer" title="Open full size" className={layoutStyles.extracted17}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`Recce photo ${i + 1}`} className={layoutStyles.extracted18} />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Raw data (debug) */}
                {Object.keys(answers).length > 0 && (
                  <details className={layoutStyles.extracted19}>
                    <summary style={{ cursor:"pointer", fontWeight:800, color:UI.muted }}>Raw data (debug)</summary>
                    <pre className={layoutStyles.extracted20}>
{JSON.stringify(answers, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; }
          a[href]:after { content: ""; }
        }
      `}</style>
    </div>
  );
}
