"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  runTransaction,
} from "firebase/firestore";
import { storage } from "../../../../firebaseConfig";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";


export default function JobDetailsPage() {
  const { id } = useParams();
  const router = useRouter();

  const [jobNumber, setJobNumber] = useState(null);
  const [relatedJobs, setRelatedJobs] = useState([]);

  // Notes shape per job: { general?: string, [YYYY-MM-DD]?: string }
  const [dayNotes, setDayNotes] = useState({});
  // Status persisted in DB
  const [statusByJob, setStatusByJob] = useState({});
  // Local selection (only saved when clicking "Save Status")
  const [selectedStatusByJob, setSelectedStatusByJob] = useState({});

  // ---------- helpers ----------
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

  const isoKey = (raw) => {
    const d = parseDate(raw);
    if (!d) return null;
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  const datesForJob = (job) => {
    if (Array.isArray(job.bookingDates) && job.bookingDates.length) return job.bookingDates;
    return job.date ? [job.date] : [];
  };

  const normalisePerDayNotes = (perDay = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(perDay)) {
      if (typeof v === "string" && v.trim() === "") continue;
      const d = parseDate(k);
      if (d) {
        d.setHours(0, 0, 0, 0);
        out[d.toISOString().slice(0, 10)] = v;
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  const getNoteForDate = (jobId, d) => {
    const notes = dayNotes?.[jobId] || {};
    const iso = isoKey(d);
    if (iso && notes[iso]) return notes[iso];
    const alt1 = formatDate(d);
    const alt2 = new Date(d).toDateString();
    const alt3 = new Date(d).toLocaleDateString("en-GB");
    return notes[alt1] || notes[alt2] || notes[alt3] || "";
  };

  const renderDateBlock = (job) => {
    const dates = datesForJob(job);
    if (!dates.length) return <div style={{ color: "#999" }}>TBC</div>;

    return (
      <div style={{ display: "grid", gap: 6 }}>
        {dates.map((d, i) => {
          const note = getNoteForDate(job.id, d);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span style={{ color: "#111827" }}>{formatDate(d)}</span>
              {note ? (
                <span style={{ color: "#6b7280", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  — {note}
                </span>
              ) : (
                <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const saveJobSummary = async (jobId) => {
    const summary = dayNotes?.[jobId]?.general || "";
    try {
      await updateDoc(doc(db, "bookings", jobId), { generalSummary: summary });
      alert("Summary saved.");
    } catch (e) {
      alert("Failed to save summary: " + (e?.message || e));
    }
  };

  // Paid detector (covers common flat, nested, date, and amount-based signals)
  const computeIsPaid = (j = {}) => {
    const str = (v) => (typeof v === "string" ? v.toLowerCase() : "");
    const num = (v) => (v == null ? null : Number(v));

    const flatFlags =
      j.paid === true ||
      j.isPaid === true ||
      j.invoicePaid === true ||
      str(j.status).includes("paid") ||
      str(j.paymentStatus).includes("paid") ||
      str(j.invoiceStatus).includes("paid");

    const nestedFlags =
      j?.billing?.paid === true ||
      j?.invoice?.paid === true ||
      j?.finance?.paid === true ||
      str(j?.billing?.status).includes("paid") ||
      str(j?.invoice?.status).includes("paid") ||
      str(j?.finance?.status).includes("paid");

    const dateFlags = Boolean(j.paidAt || j.paymentDate || j.settledAt);

    // Amount-based: total > 0 and amountDue == 0 (or <= 0)
    const total = num(j.total ?? j.amountTotal ?? j.invoiceTotal);
    const due = num(j.amountDue ?? j.balanceDue ?? j.outstanding);
    const amountFlags = total != null && total > 0 && due != null && due <= 0;

    return Boolean(flatFlags || nestedFlags || dateFlags || amountFlags);
  };

  const saveJobStatus = async (jobId, newStatus) => {
    const ref = doc(db, "bookings", jobId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Booking no longer exists.");
        const fresh = snap.data();

        // 🔒 server-trust check
        if (computeIsPaid(fresh)) {
          throw new Error("This job is marked as Paid. Status changes are locked.");
        }

        tx.update(ref, {
          status: newStatus,
          statusUpdatedAt: new Date().toISOString(),
        });
      });

      setStatusByJob((prev) => ({ ...prev, [jobId]: newStatus }));
      alert("Status saved.");
    } catch (e) {
      alert(e?.message || "Failed to update status.");
    }
  };

  // ✅ Delete Booking
  const deleteJob = async (jobId) => {
    if (!confirm("Are you sure you want to delete this booking?")) return;
    try {
      await deleteDoc(doc(db, "bookings", jobId));
      alert("Booking deleted.");
      router.push("/job-sheet"); // redirect
    } catch (e) {
      alert("Failed to delete booking: " + (e?.message || e));
    }
  };

  // ---------- data load ----------
  useEffect(() => {
    const loadJobs = async () => {
      const singleDoc = await getDoc(doc(db, "bookings", id));
      if (!singleDoc.exists()) {
        alert("Booking not found");
        return;
      }

      const jobData = singleDoc.data();
      const number = jobData.jobNumber || id;
      setJobNumber(number);

      const allJobsSnapshot = await getDocs(collection(db, "bookings"));
      const allJobs = allJobsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      const matches = allJobs.filter((j) => (j.jobNumber || j.id) === number);
      setRelatedJobs(matches);

      const seededNotes = {};
      const seededStatus = {};
      for (const j of matches) {
        const perDayRaw = j.dayNotes || j.notesByDate || {};
        const perDay = normalisePerDayNotes(perDayRaw);
        const general = j.generalSummary || "";
        seededNotes[j.id] = { ...perDay, general };

        const status = j.status || "Pending";
        seededStatus[j.id] = status;
      }
      setDayNotes(seededNotes);
      setStatusByJob(seededStatus);
      setSelectedStatusByJob(seededStatus);
    };

    if (id) loadJobs();
  }, [id]);

  // ---------- status colours ----------
  const statusColor = (s) => {
    switch (s) {
      case "Ready to Invoice":
        return "#2563eb"; // blue
      case "Needs Action":
        return "#ef4444"; // red
      case "Complete":
        return "#10b981"; // green
      default:
        return "#f59e0b"; // fallback amber for unknown statuses (e.g., "Pending")
    }
  };

  const StatusPill = ({ value }) => (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: `${statusColor(value)}20`,
        color: statusColor(value),
        border: `1px solid ${statusColor(value)}66`,
      }}
    >
      {value}
    </span>
  );

  const PaidPill = () => (
    <span
      title="This job is marked as Paid. Status changes are locked."
      style={{
        display: "inline-block",
        marginLeft: 8,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: "#16a34a20",
        color: "#16a34a",
        border: "1px solid #16a34a66",
      }}
    >
      Paid 🔒
    </span>
  );

  // ---- PDF upload state ----
const [pdfFileByJob, setPdfFileByJob] = useState({});
const [uploadingByJob, setUploadingByJob] = useState({});
const [progressByJob, setProgressByJob] = useState({});
const [errorByJob, setErrorByJob] = useState({});

const isLikelyPdf = (file) => {
  const t = (file?.type || "").toLowerCase();
  const name = (file?.name || "").toLowerCase();
  return t === "application/pdf" || name.endsWith(".pdf");
};

const onPdfSelect = (jobId, file) => {
  setErrorByJob((p) => ({ ...p, [jobId]: "" }));
  if (!file) return;
  if (!isLikelyPdf(file)) {
    setErrorByJob((p) => ({ ...p, [jobId]: "Please pick a .pdf file." }));
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    setErrorByJob((p) => ({ ...p, [jobId]: "PDF larger than 20 MB." }));
    return;
  }
  setPdfFileByJob((p) => ({ ...p, [jobId]: file }));
};

const uploadPdfForJob = async (jobId) => {
  setErrorByJob((p) => ({ ...p, [jobId]: "" }));
  const file = pdfFileByJob[jobId];
  if (!file) {
    setErrorByJob((p) => ({ ...p, [jobId]: "Select a PDF first." }));
    return;
  }

  try {
    // Optional: quick visibility of bucket config in console
    // @ts-ignore
    console.log("Storage bucket:", storage?.app?.options?.storageBucket);

    setUploadingByJob((p) => ({ ...p, [jobId]: true }));
    setProgressByJob((p) => ({ ...p, [jobId]: 0 }));

    const path = `bookings/${jobId}/attachment-${Date.now()}.pdf`; // or `attachment.pdf` to overwrite
    const storageRef = ref(storage, path);

    const task = uploadBytesResumable(storageRef, file, {
      contentType: "application/pdf",
      contentDisposition: `inline; filename="${file.name || "attachment.pdf"}"`,
    });

    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setProgressByJob((p) => ({ ...p, [jobId]: pct }));
      },
      (err) => {
        console.error("Storage upload error:", { code: err.code, message: err.message });
        setErrorByJob((p) => ({
          ...p,
          [jobId]: `Upload failed (${err.code || "unknown"}): ${err.message || err}`,
        }));
        setUploadingByJob((p) => ({ ...p, [jobId]: false }));
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          await updateDoc(doc(db, "bookings", jobId), {
            pdfUrl: url,
            pdfUpdatedAt: new Date().toISOString(),
          });
          setRelatedJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, pdfUrl: url } : j)));
          setPdfFileByJob((p) => ({ ...p, [jobId]: null }));
          setProgressByJob((p) => ({ ...p, [jobId]: 0 }));
        } catch (e) {
          console.error("Firestore update error:", e);
          setErrorByJob((p) => ({
            ...p,
            [jobId]: `Saved to Storage, but failed to save URL: ${e.message || e}`,
          }));
        } finally {
          setUploadingByJob((p) => ({ ...p, [jobId]: false }));
        }
      }
    );
  } catch (e) {
    console.error("Unexpected upload exception:", e);
    setErrorByJob((p) => ({ ...p, [jobId]: e.message || String(e) }));
    setUploadingByJob((p) => ({ ...p, [jobId]: false }));
  }
};



  return (
    <HeaderSidebarLayout>
      <div
        style={{
          width: "100%",
          minHeight: "100vh",
          backgroundColor: "#ffffff",
          color: "#000000",
          padding: "40px 24px",
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            backgroundColor: "#e5e7eb",
            padding: "8px 16px",
            borderRadius: "8px",
            marginBottom: "30px",
            border: "none",
            cursor: "pointer",
          }}
        >
          ← Back to Job Numbers
        </button>

        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 30 }}>
          Job #{jobNumber ?? "—"}
        </h1>

        {relatedJobs.length === 0 ? (
          <p>No jobs found.</p>
        ) : (
          relatedJobs.map((job, idx) => {
            const currentDbStatus = statusByJob[job.id] || "Pending";
            const selected = selectedStatusByJob[job.id] ?? currentDbStatus;

            // 🔒 derive from the job object directly to avoid drift
            const isPaid = computeIsPaid(job);

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: "24px",
                  marginBottom: "24px",
                  flexWrap: "wrap",
                }}
              >
                {/* Block 1: Main Job Info */}
                <div
                  style={{
                    border: "1px solid #ccc",
                    padding: "16px",
                    borderRadius: "12px",
                    flex: "1",
                    minWidth: "300px",
                    backgroundColor: "#fff",
                  }}
                >
                  <h4 style={{ marginTop: 0, marginBottom: "10px", display: "flex", alignItems: "center" }}>
                    Information
                    <span style={{ marginLeft: 12 }}>
                      <StatusPill value={currentDbStatus} />
                    </span>
                    {isPaid && <PaidPill />}
                  </h4>

                  <div style={{ marginBottom: "10px" }}>
                    <strong>Client:</strong> {job.client}
                  </div>
                  <div style={{ marginBottom: "10px" }}>
                    <strong>Location:</strong> {job.location}
                  </div>
                  <div style={{ marginBottom: "10px" }}>
                    <strong>Dates:</strong>
                    <div style={{ marginTop: "4px" }}>{renderDateBlock(job)}</div>
                  </div>
                  {job.vehicles?.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <strong>Vehicles:</strong> {job.vehicles.join(", ")}
                    </div>
                  )}
                  {job.employees?.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <strong>Team:</strong> {job.employees.join(", ")}
                    </div>
                  )}
                  {job.equipment?.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <strong>Equipment:</strong> {job.equipment.join(", ")}
                    </div>
                  )}
                  {job.notes && (
                    <div style={{ marginBottom: "10px" }}>
                      <strong>Notes:</strong>
                      <div style={{ whiteSpace: "pre-line", marginTop: "4px" }}>
                        {job.notes}
                      </div>
                    </div>
                  )}
                  {job.quote && (
                    <div
                      style={{
                        marginBottom: "10px",
                        backgroundColor: "#fef9c3",
                        padding: "12px",
                        borderRadius: "8px",
                        border: "1px solid #facc15",
                      }}
                    >
                      <strong>Quote:</strong>
                      <div
                        style={{
                          whiteSpace: "pre-line",
                          marginTop: "4px",
                          color: "#78350f",
                        }}
                      >
                        {job.quote}
                      </div>
                    </div>
                  )}
                  {job.pdfUrl && (
                    <div>
                      <strong>Attachment:</strong>{" "}
                      <a
                        href={job.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#2563eb", textDecoration: "underline" }}
                      >
                        View PDF
                      </a>
                    </div>
                  )}

                  {/* Upload / Replace PDF */}
<div
  style={{
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    border: "1px dashed #cbd5e1",
    background: "#f8fafc",
  }}
>
  <div style={{ fontWeight: 600, marginBottom: 8 }}>
    {job.pdfUrl ? "Replace PDF" : "Upload PDF"}
  </div>

  <input
    type="file"
    accept="application/pdf"
    onChange={(e) => onPdfSelect(job.id, e.target.files?.[0])}
    style={{ marginBottom: 8 }}
  />

  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <button
      type="button"
      onClick={() => uploadPdfForJob(job.id)}
      disabled={uploadingByJob[job.id] || !pdfFileByJob[job.id]}
      style={{
        backgroundColor: "#111827",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "8px 12px",
        cursor: uploadingByJob[job.id] || !pdfFileByJob[job.id] ? "not-allowed" : "pointer",
        opacity: uploadingByJob[job.id] || !pdfFileByJob[job.id] ? 0.6 : 1,
      }}
    >
      {uploadingByJob[job.id]
        ? `Uploading… ${progressByJob[job.id] ?? 0}%`
        : job.pdfUrl
        ? "Replace PDF"
        : "Upload PDF"}
    </button>

    {typeof progressByJob[job.id] === "number" && uploadingByJob[job.id] && (
      <span style={{ fontSize: 12, color: "#374151" }}>
        Progress: {progressByJob[job.id]}%
      </span>
    )}
  </div>

  {job.pdfUrl && (
    <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
      Current:{" "}
      <a
        href={job.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#2563eb", textDecoration: "underline" }}
      >
        View PDF
      </a>
    </div>
  )}
</div>


                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: "20px",
                      gap: "8px",
                    }}
                  >
                    <button
                      onClick={() => router.push(`/edit-booking/${job.id}`)}
                      style={{
                        backgroundColor: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 16px",
                        cursor: "pointer",
                      }}
                    >
                      Edit Booking
                    </button>
                    <button
                      onClick={() => deleteJob(job.id)}
                      style={{
                        backgroundColor: "#ef4444",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 16px",
                        cursor: "pointer",
                      }}
                    >
                      Delete Booking
                    </button>
                  </div>
                </div>

                {/* Block 2: Job Summary (GENERAL) */}
                <div
                  style={{
                    flex: "0.7",
                    backgroundColor: "#f9fafb",
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid #ccc",
                    minWidth: "250px",
                  }}
                >
                  <h4 style={{ marginTop: 0 }}>Job Summary</h4>
                  <textarea
                    rows={4}
                    value={dayNotes?.[job.id]?.general || ""}
                    onChange={(e) =>
                      setDayNotes((prev) => ({
                        ...prev,
                        [job.id]: {
                          ...(prev?.[job.id] || {}),
                          general: e.target.value,
                        },
                      }))
                    }
                    placeholder="Add general summary for this job…"
                    style={{
                      width: "100%",
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      padding: 8,
                      fontSize: 13,
                      resize: "vertical",
                      background: "#fff",
                      marginTop: 10,
                    }}
                  />
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => saveJobSummary(job.id)}
                      style={{
                        backgroundColor: "#16a34a",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 12px",
                        cursor: "pointer",
                      }}
                    >
                      Save Summary
                    </button>
                  </div>
                </div>

                {/* Block 3: Actions */}
                <div
                  style={{
                    flex: "0.7",
                    backgroundColor: "#eef2ff",
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid #a5b4fc",
                    minWidth: "250px",
                  }}
                >
                  <h4 style={{ marginTop: 0 }}>Actions</h4>

                  <div style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      Status
                      {isPaid && (
                        <span title="Paid: status locked" style={{ fontSize: 12, color: "#374151" }}>
                          (Paid — locked 🔒)
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {["Ready to Invoice", "Needs Action", "Complete"].map((opt) => {
                        const active = selected === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => {
                              if (isPaid) return; // 🔒 UI lock
                              setSelectedStatusByJob((prev) => ({ ...prev, [job.id]: opt }));
                            }}
                            disabled={isPaid}
                            title={
                              isPaid ? "This job is marked as Paid. Status changes are locked." : ""
                            }
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: active ? `2px solid ${statusColor(opt)}` : "1px solid #c7d2fe",
                              background: active ? `${statusColor(opt)}20` : "#eef2ff",
                              color: active ? statusColor(opt) : "#1f2937",
                              fontWeight: 600,
                              cursor: isPaid ? "not-allowed" : "pointer",
                              opacity: isPaid ? 0.5 : 1,
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <button
                        onClick={() => {
                          const chosen = selectedStatusByJob[job.id] ?? currentDbStatus;
                          if (chosen !== currentDbStatus) {
                            saveJobStatus(job.id, chosen);
                          }
                        }}
                        disabled={
                          isPaid ||
                          (selectedStatusByJob[job.id] ?? currentDbStatus) === currentDbStatus
                        }
                        title={
                          isPaid
                            ? "This job is marked as Paid. Status changes are locked."
                            : ""
                        }
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "none",
                          background: "#111827",
                          color: "#fff",
                          fontWeight: 600,
                          cursor:
                            isPaid ||
                            (selectedStatusByJob[job.id] ?? currentDbStatus) === currentDbStatus
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            isPaid ||
                            (selectedStatusByJob[job.id] ?? currentDbStatus) === currentDbStatus
                              ? 0.5
                              : 1,
                        }}
                      >
                        Save Status
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  <button
    onClick={() => alert("Download PDF feature coming soon")}
    style={{
      backgroundColor: "#6366f1",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      padding: "8px 12px",
      cursor: "pointer",
    }}
  >
    Download Summary
  </button>

  <button
    onClick={() => alert("Share function coming soon")}
    style={{
      backgroundColor: "#4f46e5",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      padding: "8px 12px",
      cursor: "pointer",
    }}
  >
    Share Job
  </button>

  <button
    onClick={async () => {
      try {
        const blob = new Blob([`hello ${Date.now()}`], { type: "text/plain" });
        const testRef = ref(storage, `debug/test-${Date.now()}.txt`);
        const t = uploadBytesResumable(testRef, blob, { contentType: "text/plain" });
        t.on(
          "state_changed",
          null,
          (err) => {
            alert(`Debug upload failed (${err.code}): ${err.message}`);
          },
          async () => {
            const u = await getDownloadURL(t.snapshot.ref);
            alert("Debug upload OK:\n" + u);
          }
        );
      } catch (e) {
        alert("Debug upload threw: " + (e.message || e));
      }
    }}
    style={{
      backgroundColor: "#0ea5e9",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      padding: "8px 12px",
      cursor: "pointer",
    }}
  >
    Quick Storage Test
  </button>
</div>

                  

                </div>
              </div>
            );
          })
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
