// src/app/recce-form/[id]/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, CalendarClock, Camera, ClipboardCheck, Clock3, FileJson, MapPin, Printer, RefreshCw, UserRound } from "lucide-react";
import { db } from "../../../../firebaseConfig";
import styles from "./page.styles.module.css";

const Row = ({ label, value, wide = false }) => value ? (
  <div className={`${styles.detailItem}${wide ? ` ${styles.detailItemWide}` : ""}`}>
    <div className={styles.detailLabel}>{label}</div>
    <div className={styles.detailValue}>{value}</div>
  </div>
) : null;

const makeKey = (bookingId, dateISO, createdBy) => [bookingId, dateISO, createdBy || "N/A"].join("__");

const formatDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const readableStatus = (status) => String(status || "Submitted")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function RecceFormPage() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [recce, setRecce] = useState(null);
  const [error, setError] = useState(null);
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!id) return undefined;

    const listenTo = (docId, { maybeRedirect } = {}) => {
      if (unsubRef.current) unsubRef.current();
      setLoading(true);
      unsubRef.current = onSnapshot(doc(db, "recces", docId), (snap) => {
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

        const bookingId = data.bookingId || data.answers?.bookingId;
        const dateISO = data.dateISO || data.answers?.dateISO;
        const createdBy = data.createdBy || data.answers?.createdBy;
        if (bookingId && dateISO) {
          const canonical = makeKey(bookingId, dateISO, createdBy);
          if (canonical && canonical !== snap.id) {
            if (maybeRedirect) router.replace(`/recce-form/${canonical}`);
            listenTo(canonical, { maybeRedirect: false });
          }
        }
      }, (snapshotError) => {
        console.error(snapshotError);
        setError("Failed to load recce form.");
        setLoading(false);
      });
    };

    listenTo(String(id), { maybeRedirect: true });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [id, router]);

  const answers = useMemo(() => recce?.answers || {}, [recce]);
  const photoUrls = useMemo(() => {
    const top = Array.isArray(recce?.photos) ? recce.photos : [];
    const answerPhotos = Array.isArray(answers?.photos) ? answers.photos : [];
    return Array.from(new Set([...top, ...answerPhotos].filter(Boolean)));
  }, [answers, recce]);

  const submittedAt = useMemo(() => {
    const answerDate = answers?.createdAt;
    if (typeof answerDate === "string") return new Date(answerDate);
    const recordDate = recce?.createdAt;
    if (recordDate?.seconds) return new Date(recordDate.seconds * 1000);
    if (typeof recordDate === "string") return new Date(recordDate);
    return null;
  }, [answers, recce]);

  const updatedAt = useMemo(() => {
    const updatedDate = recce?.updatedAt;
    if (updatedDate?.seconds) return new Date(updatedDate.seconds * 1000);
    if (typeof updatedDate === "string") return new Date(updatedDate);
    return null;
  }, [recce]);

  const submittedLabel = formatDateTime(submittedAt);
  const updatedLabel = formatDateTime(updatedAt);
  const cacheKey = updatedAt && !Number.isNaN(updatedAt.getTime()) ? String(updatedAt.getTime()) : "";
  const status = readableStatus(recce?.status);
  const isApproved = String(recce?.status || "").toLowerCase() === "approved";
  const createdBy = answers.createdBy || recce?.createdBy;

  return (
    <main className={styles.page} data-sidebar-page>
      <div className={styles.container}>
        <header className={styles.pageHeader} data-sidebar-page-header>
          <div>
            <div className={styles.eyebrow}>Operations · Site recce</div>
            <h1>Recce form</h1>
            <p>Review the submitted site information, access notes and supporting photos.</p>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => router.back()} className={styles.secondaryButton}><ArrowLeft size={16} aria-hidden="true" />Back</button>
            <button type="button" onClick={() => window.location.reload()} className={styles.secondaryButton} title="Reload the latest recce data"><RefreshCw size={16} aria-hidden="true" />Refresh</button>
            <button type="button" onClick={() => window.print()} className={styles.primaryButton}><Printer size={16} aria-hidden="true" />Print</button>
          </div>
        </header>

        {loading ? <section className={styles.messageCard} aria-live="polite"><RefreshCw className={styles.loadingIcon} size={20} aria-hidden="true" />Loading recce…</section> : null}
        {error ? <section className={`${styles.messageCard} ${styles.errorCard}`} role="alert">{error}</section> : null}

        {!loading && !error && recce ? (
          <article className={styles.recordCard}>
            <div className={styles.recordTopline}>
              <div className={styles.recordIdentity}>
                <div className={styles.statusLine}>
                  <span className={`${styles.statusBadge} ${isApproved ? styles.statusApproved : ""}`}><ClipboardCheck size={14} aria-hidden="true" />{status}</span>
                  {recce.bookingId ? <span className={styles.bookingReference}>Booking {recce.bookingId}</span> : null}
                </div>
                <h2>{answers.locationName || "Site recce"}</h2>
                <div className={styles.recordContext}>
                  {answers.address ? <span><MapPin size={15} aria-hidden="true" />{answers.address}</span> : null}
                  {answers.lead ? <span><UserRound size={15} aria-hidden="true" />Recce lead: {answers.lead}</span> : null}
                </div>
              </div>
              <dl className={styles.auditList}>
                {submittedLabel ? <div><dt><CalendarClock size={15} aria-hidden="true" />Submitted</dt><dd>{submittedLabel}</dd></div> : null}
                {updatedLabel ? <div><dt><Clock3 size={15} aria-hidden="true" />Last updated</dt><dd>{updatedLabel}</dd></div> : null}
              </dl>
            </div>

            <section className={styles.section}>
              <div className={styles.sectionHeading}><div><h3>Site details</h3><p>Information recorded during the visit.</p></div></div>
              <div className={styles.detailsGrid}>
                <Row label="Recce lead" value={answers.lead} />
                <Row label="Location name" value={answers.locationName} />
                <Row label="Address" value={answers.address} wide />
                <Row label="Parking" value={answers.parking} />
                <Row label="Access" value={answers.access} />
                <Row label="Hazards" value={answers.hazards} wide />
                <Row label="Power availability" value={answers.power} />
                <Row label="Measurements" value={answers.measurements} />
                <Row label="Recommended kit" value={answers.recommendedKit} wide />
                <Row label="Notes" value={answers.notes} wide />
                <Row label="Created by" value={createdBy} />
                <Row label="Created at" value={submittedLabel || answers.createdAt} />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <div><h3>Photos</h3><p>{photoUrls.length ? `${photoUrls.length} attached to this recce.` : "Supporting images from the site visit."}</p></div>
                {photoUrls.length ? <span className={styles.photoCount}>{photoUrls.length}</span> : null}
              </div>
              {photoUrls.length === 0 ? (
                <div className={styles.emptyState}><div className={styles.emptyIcon}><Camera size={20} aria-hidden="true" /></div><div><strong>No photos attached</strong><span>This recce was submitted without supporting images.</span></div></div>
              ) : (
                <div className={styles.photoGrid}>
                  {photoUrls.map((url, index) => {
                    const src = cacheKey ? `${url}${url.includes("?") ? "&" : "?"}v=${cacheKey}` : url;
                    return (
                      <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" title="Open full size" className={styles.photoLink}>
                        <Image
                          src={src}
                          alt={`Recce photo ${index + 1}`}
                          className={styles.photo}
                          fill
                          sizes="(max-width: 760px) 100vw, 33vw"
                        />
                        <span>Photo {index + 1}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </section>

            {Object.keys(answers).length > 0 ? <details className={styles.technicalData}><summary><FileJson size={16} aria-hidden="true" />Technical data</summary><pre>{JSON.stringify(answers, null, 2)}</pre></details> : null}
          </article>
        ) : null}
      </div>
    </main>
  );
}
