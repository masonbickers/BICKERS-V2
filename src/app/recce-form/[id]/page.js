// src/app/recce-form/[id]/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";

const UI = { text:"#111827", muted:"#6b7280", bg:"#ffffff", border:"1px solid #e5e7eb", radiusLg:12, radius:8, shadow:"0 6px 16px rgba(0,0,0,0.06)" };
const card = { background:UI.bg, border:UI.border, borderRadius:UI.radiusLg, boxShadow:UI.shadow, padding:16 };

const Row = ({ label, value }) =>
  value ? (
    <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:12, margin:"6px 0" }}>
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
    <div style={{ minHeight:"100vh", background:"#f3f4f6", padding:24 }}>
      <div style={{ maxWidth:900, margin:"0 auto", display:"grid", gap:16 }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:UI.text }}>Recce Form</h1>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => router.back()} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#f9fafb", fontWeight:700, cursor:"pointer" }}>← Back</button>
            <button onClick={() => window.location.reload()} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#f9fafb", fontWeight:700, cursor:"pointer" }} title="Force refresh">Refresh</button>
            <button onClick={() => window.print()} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #111827", background:"#111827", color:"#fff", fontWeight:700, cursor:"pointer" }}>Print</button>
          </div>
        </div>

        {/* Status / meta */}
        <div style={{ ...card }}>
          {loading && <div style={{ color:UI.muted, fontWeight:700 }}>Loading…</div>}
          {error && <div style={{ color:"#b91c1c", fontWeight:800 }}>{error}</div>}

          {!loading && !error && recce && (
            <div style={{ display:"grid", gap:16 }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                <span style={{ fontSize:12, fontWeight:800, padding:"4px 8px", borderRadius:999, background:String(recce.status||"").toLowerCase()==="approved"?"#34d399":"#7cff9a", border:"1px solid #0b0b0b", color:"#111" }}>
                  {(recce.status || "Submitted").toUpperCase()}
                </span>

                {recce.bookingId && (
                  <span title="Booking ID" style={{ fontSize:12, fontWeight:800, padding:"4px 8px", borderRadius:999, background:"#e5e7eb", border:"1px solid #0b0b0b", color:"#111" }}>
                    Booking: {recce.bookingId}
                  </span>
                )}

                {submittedAt && (
                  <span style={{ fontSize:12, fontWeight:800, padding:"4px 8px", borderRadius:999, background:"#e5e7eb", border:"1px solid #0b0b0b", color:"#111" }}>
                    Submitted {submittedAt.toLocaleString("en-GB")}
                  </span>
                )}

                {updatedAt && (
                  <span style={{ fontSize:12, fontWeight:800, padding:"4px 8px", borderRadius:999, background:"#eef2ff", border:"1px solid #0b0b0b", color:"#111" }}>
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
                <div style={{ marginTop:18 }}>
                  <div style={{ fontWeight:800, color:UI.text, marginBottom:8 }}>Photos</div>
                  {photoUrls.length === 0 ? (
                    <div style={{ color:UI.muted, fontWeight:600 }}>No photos attached.</div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:10 }}>
                      {photoUrls.map((url, i) => {
                        const src = bust ? `${url}${url.includes("?") ? "&" : "?"}v=${bust}` : url;
                        return (
                          <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer" title="Open full size" style={{ display:"block", borderRadius:10, overflow:"hidden", border:"1px solid #e5e7eb", background:"#f9fafb" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`Recce photo ${i + 1}`} style={{ width:"100%", height:140, objectFit:"cover", display:"block" }} />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Raw data (debug) */}
                {Object.keys(answers).length > 0 && (
                  <details style={{ marginTop:12 }}>
                    <summary style={{ cursor:"pointer", fontWeight:800, color:UI.muted }}>Raw data (debug)</summary>
                    <pre style={{ marginTop:8, fontSize:12, background:"#f8fafc", padding:12, borderRadius:8, overflowX:"auto" }}>
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
