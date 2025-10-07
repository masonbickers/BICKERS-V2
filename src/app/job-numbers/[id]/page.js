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
  query,
  where,
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
  const [timesheetsByJob, setTimesheetsByJob] = useState({}); // { [jobId]: [timesheetDoc, ...] }


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

  // ➕ ADD THIS HELPER
const latestDateOfJob = (job) => {
  const candidates = [];

  // Primary: booking dates (array or single)
  const dlist = Array.isArray(job.bookingDates) && job.bookingDates.length
    ? job.bookingDates
    : (job.date ? [job.date] : []);

  dlist.forEach((x) => {
    const d = parseDate(x);
    if (d) candidates.push(d.getTime());
  });

  // Secondary: common metadata timestamps
  ["createdAt","updatedAt","statusUpdatedAt","paidAt","paymentDate","settledAt"].forEach((k) => {
    const d = parseDate(job[k]);
    if (d) candidates.push(d.getTime());
  });

  if (!candidates.length) return null;
  return new Date(Math.max(...candidates));
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

  const toYMD = (d) => {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x.toISOString().slice(0,10);
};

const weekStartOf = (raw) => {
  const d = new Date(parseDate(raw) || raw);
  if (isNaN(d)) return null;
  // Week starts Monday (UK)
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // back to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0,0,0,0);
  return toYMD(monday);
};

const jobDateKeys = (job) => {
  const dates = datesForJob(job);
  return dates.map((d) => toYMD(d));
};


  const renderEmployees = (employees) => {
  if (!employees) return null;

  // Case: single string
  if (typeof employees === "string") {
    return employees;
  }

  // Case: array
  if (Array.isArray(employees)) {
    return employees
      .map((emp) => {
        if (typeof emp === "string") return emp;
        if (typeof emp === "object") return emp.name || emp.id || "Unknown";
        return String(emp);
      })
      .join(", ");
  }

  // Fallback
  return String(employees);
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




// 🔹 Handle job numbers like "2024-001"
const splitJobNumber = (num) => {
  if (!num) return { prefix: "—", suffix: "" };
  const str = num.toString();
  const [prefix, suffix] = str.split("-");
  return { prefix, suffix: suffix || "" };
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


  const renderTimesheet = (ts) => {
  const days = ts?.days || {};
  const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        background: "#fff",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div><strong>Week start:</strong> {ts.weekStart || "—"}</div>
        {ts.employeeCode ? <div><strong>Employee:</strong> {ts.employeeCode}</div> : null}
        <div><strong>Submitted:</strong> {ts.submitted ? "Yes" : "No"}</div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {dayOrder.map((d) => (
                <th key={d} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e5e7eb" }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {dayOrder.map((d) => {
                const cell = days[d] || {};
                return (
                  <td key={d} style={{ verticalAlign: "top", padding: "8px 6px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontSize: 12, color: "#374151" }}>
                      <div><strong>Mode:</strong> {cell.mode || "—"}</div>
                      {cell.dayNotes ? (
                        <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                          <strong>Notes:</strong> {cell.dayNotes}
                        </div>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {ts.notes ? (
        <div style={{ marginTop: 8, fontSize: 13, color: "#111827" }}>
          <strong>Timesheet Notes:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{ts.notes}</span>
        </div>
      ) : null}
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

// ⚠️ No longer blocking status changes on Paid
// We just save the new status regardless

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
const { prefix } = splitJobNumber(number);
setJobNumber(number);

const allJobsSnapshot = await getDocs(collection(db, "bookings"));
const allJobs = allJobsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

// 🔹 Group by prefix and sort by suffix (latest first)
const matches = allJobs
  .filter((j) => {
    const { prefix: otherPrefix } = splitJobNumber(j.jobNumber || j.id);
    return otherPrefix === prefix;
  })
  .sort((a, b) => {
    const A = latestDateOfJob(a)?.getTime() ?? -Infinity;
    const B = latestDateOfJob(b)?.getTime() ?? -Infinity;
    if (B !== A) return B - A; // newest at the top by most-recent date

    // tie-breaker: numeric job-number suffix (e.g. 2025-012 > 2025-009)
    const { suffix: saRaw } = splitJobNumber(a.jobNumber || a.id);
    const { suffix: sbRaw } = splitJobNumber(b.jobNumber || b.id);
    const sa = Number(saRaw) || 0;
    const sb = Number(sbRaw) || 0;
    if (sb !== sa) return sb - sa;

    // final fallback: lexicographic
    return String(b.jobNumber || b.id).localeCompare(String(a.jobNumber || a.id));
  });


const loadTimesheetsForJob = async (job) => {
  const jobId = job.id;
  const jobNum = job.jobNumber || job.id;
  const jobWeeks = Array.from(
    new Set(
      jobDateKeys(job)
        .map(weekStartOf)
        .filter(Boolean)
    )
  );

  const found = [];

  // -- 1) Sub-collection under the booking
  try {
    const subSnap = await getDocs(collection(db, "bookings", jobId, "timesheets"));
    subSnap.forEach((d) => found.push({ id: d.id, ...d.data(), __source: "sub" }));
  } catch (e) {
    // ignore
  }

  // -- 2) Top-level by jobId / jobNumber
  try {
    const topRef = collection(db, "timesheets");
    const queries = [];
    queries.push(getDocs(query(topRef, where("jobId", "==", jobId))));
    queries.push(getDocs(query(topRef, where("jobNumber", "==", jobNum))));
    const results = await Promise.all(queries);
    results.forEach((snap) => snap.forEach((d) => found.push({ id: d.id, ...d.data(), __source: "top-job" })));
  } catch (e) {
    // ignore
  }

  // -- 3) Fallback: match by weekStart overlapping job dates
  if (jobWeeks.length) {
    try {
      const topRef = collection(db, "timesheets");
      // Firestore doesn't support "IN" on strings > 10 items; but week count per job will be small.
      // Do one query per weekStart.
      const byWeek = await Promise.all(
        jobWeeks.map((ws) => getDocs(query(topRef, where("weekStart", "==", ws))))
      );
      byWeek.forEach((snap) => snap.forEach((d) => found.push({ id: d.id, ...d.data(), __source: "top-week" })));
    } catch (e) {
      // ignore
    }
  }

  // De-dup if the same doc came from multiple routes
  const dedup = Object.values(
    found.reduce((acc, t) => {
      acc[t.id] = acc[t.id] || t;
      return acc;
    }, {})
  );

  setTimesheetsByJob((prev) => ({ ...prev, [jobId]: dedup }));
};



setRelatedJobs(matches);
// pull timesheets for each matching job (in parallel)
await Promise.all(matches.map((j) => loadTimesheetsForJob(j)));




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

{(() => {
  if (!jobNumber) {
    return (
      <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 30 }}>
        Job —
      </h1>
    );
  }

  const str = jobNumber.toString();
  const prefix = str.split("-")[0]; // only first 4 digits before the dash

  return (
    <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 30 }}>
      Job #{prefix}
    </h1>
  );
})()}




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
  <strong>Job Number:</strong> {job.jobNumber || job.id}
</div>


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
        {job.employees && (
  <div style={{ marginBottom: "10px" }}>
    <strong>Team:</strong> {renderEmployees(job.employees)}
  </div>
)}

           
                  {job.equipment?.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <strong>Equipment:</strong> {job.equipment.join(", ")}
                    </div>
                  )}
                  {job.notes && (
                    <div style={{ marginBottom: "10px" }}>
                      <strong>Description</strong>
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
{/* Block 2: Job Summary (GENERAL + PO + Important Info) */}
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
  <h4 style={{ marginTop: 0 }}>Extra Information</h4>

  {/* Notes / General Summary */}
  <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
    Notes
  </label>
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
      marginBottom: 12,
    }}
  />

  {/* PO Section */}
  <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
    Purchase Order
  </label>
  <input
    type="text"
    value={job.po || ""}
    onChange={(e) =>
      updateDoc(doc(db, "bookings", job.id), { po: e.target.value })
    }
    placeholder="Enter PO reference…"
    style={{
      width: "100%",
      border: "1px solid #d1d5db",
      borderRadius: 8,
      padding: 8,
      fontSize: 13,
      marginBottom: 12,
      background: "#fff",
    }}
  />

  {/* Important Info Box */}
  <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
    Important Info
  </label>
  <textarea
    rows={3}
    value={job.importantInfo || ""}
    onChange={(e) =>
      updateDoc(doc(db, "bookings", job.id), { importantInfo: e.target.value })
    }
    placeholder="Add urgent notes, damages, restrictions, etc…"
    style={{
      width: "100%",
      border: "1px solid #facc15",
      borderRadius: 8,
      padding: 8,
      fontSize: 13,
      resize: "vertical",
      background: "#fefce8", // yellow background
      marginBottom: 12,
    }}
  />

  {/* Save Summary */}
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
