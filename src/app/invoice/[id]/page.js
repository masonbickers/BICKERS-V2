"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function InvoiceJobPage() {
  const { id } = useParams();
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load job
  useEffect(() => {
    const fetchJob = async () => {
      if (!id) return;
      const ref = doc(db, "bookings", id);
      const snap = await getDoc(ref);
      if (snap.exists()) setJob({ id: snap.id, ...snap.data() });
      setLoading(false);
    };
    fetchJob();
  }, [id]);

  // Helpers
  const parseDate = (raw) => {
    if (!raw) return null;
    try {
      if (typeof raw?.toDate === "function") return raw.toDate(); // Firestore Timestamp
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const formatDate = (raw) => {
    const d = parseDate(raw);
    if (!d) return "TBC";
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const cleanDatesArray = (j) => {
    const arr = Array.isArray(j?.bookingDates) && j.bookingDates.length
      ? j.bookingDates
      : j?.date ? [j.date] : [];
    // store as ISO strings so Finance page can parse with new Date()
    return arr
      .map((d) => parseDate(d))
      .filter(Boolean)
      .map((d) => d.toISOString());
  };

  const renderDates = useMemo(() => {
    if (!job) return "—";
    if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
      return (
        <div>
          {job.bookingDates.map((d, i) => (
            <div key={i}>{formatDate(d)}</div>
          ))}
        </div>
      );
    }
    return <div>{formatDate(job?.date)}</div>;
  }, [job]);

  const formatNotesDateKey = (key) => {
    const d = new Date(key);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    return key;
  };

  const markInvoiced = async () => {
    try {
      setSaving(true);

      // 1) Update the booking itself
      const bookingRef = doc(db, "bookings", id);
      await updateDoc(bookingRef, {
        status: "invoiced",                 // keep lowercase to match normaliser
        invoicedAt: new Date().toISOString()
      });

      // 2) Mirror into invoiceQueue (this is what Finance home reads)
      const now = new Date();
      const dueISO = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 days
      const invoiceRef = doc(db, "invoiceQueue", id); // use booking id as invoice doc id to avoid duplicates

      await setDoc(
        invoiceRef,
        {
          bookingId: id,
          jobNumber: job?.jobNumber || id,
          client: job?.client || "",
          location: job?.location || "",
          dates: cleanDatesArray(job),       // array of ISO strings
          status: "invoiced",
          invoiceNumber: job?.invoiceNumber || "", // keep blank if you don't have it yet
          invoiceDate: now.toISOString(),
          dueDate: dueISO,
          updatedAt: now.toISOString(),
        },
        { merge: true } // don't overwrite any existing fields you might have added earlier
      );

      router.push("/finance-home");
    } catch (e) {
      alert("Failed to mark invoiced: " + (e?.message || e));
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (!job) return <p>Job not found.</p>;

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: "40px 24px" }}>
        <button
          onClick={() => router.back()}
          style={{
            backgroundColor: "#e5e7eb",
            padding: "8px 16px",
            borderRadius: "8px",
            marginBottom: "24px",
            border: "none",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
          Invoice Job #{job.jobNumber || job.id}
        </h1>

        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #d1d5db",
            borderRadius: 12,
            padding: 20,
            fontSize: 14,
            marginBottom: 20,
          }}
        >
          <p><strong>Client:</strong> {job.client || "—"}</p>
          <p><strong>Location:</strong> {job.location || "—"}</p>
          <p><strong>Dates:</strong> {renderDates}</p>

          {Array.isArray(job.vehicles) && job.vehicles.length > 0 && (
            <p><strong>Vehicles:</strong> {job.vehicles.join(", ")}</p>
          )}
          {Array.isArray(job.employees) && job.employees.length > 0 && (
            <p><strong>Team:</strong> {job.employees.join(", ")}</p>
          )}
          {Array.isArray(job.equipment) && job.equipment.length > 0 && (
            <p><strong>Equipment:</strong> {job.equipment.join(", ")}</p>
          )}

          {(job.generalSummary || job.jobSummary) && (
            <div style={{ marginTop: 12 }}>
              <strong>Job Summary:</strong>
              <div style={{ whiteSpace: "pre-line", marginTop: 4 }}>
                {job.generalSummary || job.jobSummary}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <strong>General Notes:</strong>
            <div style={{ whiteSpace: "pre-line", marginTop: 4 }}>
              {job.notes || "—"}
            </div>
          </div>

          {job.notesByDate && Object.keys(job.notesByDate).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong>Notes by Day:</strong>
              <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                {Object.entries(job.notesByDate).map(([dateKey, note]) => (
                  <li key={dateKey}>
                    <em>{formatNotesDateKey(dateKey)}:</em> {note || "—"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {job.pdfUrl && (
            <p style={{ marginTop: 12 }}>
              <strong>Attachment:</strong>{" "}
              <a
                href={job.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#2563eb" }}
              >
                View PDF
              </a>
            </p>
          )}
        </div>

        <button
          onClick={markInvoiced}
          disabled={saving}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: saving ? "#6b7280" : "#10b981",
            color: "#fff",
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving..." : "✅ Mark as Invoiced"}
        </button>
      </div>
    </HeaderSidebarLayout>
  );
}
