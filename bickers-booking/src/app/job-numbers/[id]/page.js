"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { doc, getDoc, collection, getDocs, updateDoc, addDoc } from "firebase/firestore";

export default function JobDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [jobNumber, setJobNumber] = useState(null);
  const [relatedJobs, setRelatedJobs] = useState([]);
  const [invoicing, setInvoicing] = useState(false);
  const [invoiced, setInvoiced] = useState(false);

  

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
      const allJobs = allJobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const matches = allJobs.filter(j => (j.jobNumber || j.id) === number);
      setRelatedJobs(matches);
    };

    loadJobs();
  }, [id]);

  const formatDate = (raw) => {
    if (!raw) return null;
    try {
      const date = new Date(raw);
      return date.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return null;
    }
  };

  const renderDateBlock = (job) => {
    if (Array.isArray(job.bookingDates) && job.bookingDates.length > 0) {
      return (
        <div>
          {job.bookingDates.map((date, i) => (
            <div key={i} style={{ color: "#333" }}>{formatDate(date)}</div>
          ))}
        </div>
      );
    }

    if (job.date) {
      return <div>{formatDate(job.date)}</div>;
    }

    return <div style={{ color: "#999" }}>TBC</div>;
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
          Job #{jobNumber}
        </h1>

        {relatedJobs.length === 0 ? (
          <p>No jobs found.</p>
        ) : (
            relatedJobs.map((job, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    gap: "24px",
                    marginBottom: "24px",
                    flexWrap: "wrap", // allows it to stack on smaller screens
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
                      <h4 style={{ marginTop: 0 , marginBottom: "10px" }}>Infomation</h4>
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
                      <div style={{
                        marginBottom: "10px",
                        backgroundColor: "#fef9c3",
                        padding: "12px",
                        borderRadius: "8px",
                        border: "1px solid #facc15"
                      }}>
                        <strong>Quote:</strong>
                        <div style={{ whiteSpace: "pre-line", marginTop: "4px", color: "#78350f" }}>
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
              
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
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
                    </div>
                  </div>
              
                  {/* Block 2: Right Panel */}
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
                    <ul>
                      
                    </ul>
                  </div>
              
                  {/* Block 3: Custom Panel */}
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
                    <button
                      onClick={() => alert("Download PDF feature coming soon")}
                      style={{
                        marginBottom: "12px",
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
    setInvoicing(true);
    try {
      await addDoc(collection(db, "invoiceQueue"), {
        jobId: job.id,
        jobNumber: job.jobNumber || null,
        client: job.client || "Unknown",
        location: job.location || "Unknown",
        dates: job.bookingDates || [job.date] || [],
        vehicles: job.vehicles || [],
        employees: job.employees || [],
        equipment: job.equipment || [],
        quote: job.quote || "",
        notes: job.notes || "",
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      setInvoiced(true);
    } catch (err) {
      alert("Failed to queue for invoicing: " + err.message);
    } finally {
      setInvoicing(false);
    }
  }}
  disabled={invoicing || invoiced}
  style={{
    backgroundColor: invoiced ? "#10b981" : "#9333ea",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "8px 12px",
    cursor: invoicing || invoiced ? "not-allowed" : "pointer",
    marginTop: "12px",
    opacity: invoicing ? 0.6 : 1,
  }}
>
  {invoicing ? "Preparing..." : invoiced ? "Ready to Invoice" : "Prepare for Invoice"}
</button>

                  </div>
                </div>
              ))
              
              
        )}
      </div>
      
    </HeaderSidebarLayout>
  );
}
