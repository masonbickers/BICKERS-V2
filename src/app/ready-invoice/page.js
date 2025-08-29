"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function ReadyToInvoicePage() {
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const jobList = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setBookings(jobList);
    });
    return () => unsub();
  }, []);

  /* ---------- date helpers ---------- */
  const parseDate = (raw) => {
    if (!raw) return null;
    try {
      if (typeof raw?.toDate === "function") return raw.toDate();
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

  const renderDates = (job) => {
    const list = Array.isArray(job.bookingDates) && job.bookingDates.length
      ? job.bookingDates
      : [job.date].filter(Boolean);

    if (!list.length) return <div>TBC</div>;
    return (
      <div>
        {list.map((d, i) => (
          <div key={i}>{formatDate(d)}</div>
        ))}
      </div>
    );
  };

  /* ---------- status helpers ---------- */
  const norm = (s) => (s || "").toString().trim().toLowerCase();

  // Accept common spellings: "ready to invoice", "ready_to_invoice", "ready-to-invoice", or just "ready"
  const isReadyToInvoice = (s) =>
    /(^|\s)ready\s*to\s*invoice($|\s)/.test(s) ||
    s === "ready_to_invoice" ||
    s === "ready-to-invoice" ||
    s === "ready";

  const isExcluded = (s) => s === "invoiced" || s === "paid";

  const readyJobs = useMemo(() => {
    const rows = bookings.filter((job) => {
      const s = norm(job.status);
      if (isExcluded(s)) return false;
      return isReadyToInvoice(s);
    });

    // Sort by first date asc (oldest first)
    rows.sort((a, b) => {
      const a0 = (Array.isArray(a.bookingDates) && a.bookingDates[0]) || a.date;
      const b0 = (Array.isArray(b.bookingDates) && b.bookingDates[0]) || b.date;
      const at = parseDate(a0)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = parseDate(b0)?.getTime() ?? Number.POSITIVE_INFINITY;
      return at - bt;
    });

    return rows;
  }, [bookings]);

  /* ---------- styles ---------- */
  const cardStyle = {
    display: "block",
    backgroundColor: "#f3f4f6",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "16px",
    textDecoration: "none",
    color: "#000",
  };

  const badge = {
    display: "inline-block",
    padding: "2px 10px",
    fontSize: 12,
    borderRadius: 999,
    fontWeight: 700,
    marginLeft: 8,
    border: "1px solid #bfdbfe",
    background: "#dbeafe",
    color: "#2563eb",
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: "40px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 10 }}>
          Ready to Invoice
        </h1>
        <div style={{ color: "#6b7280", marginBottom: 24 }}>
          Showing jobs with status <strong>“Ready to Invoice”</strong>. Invoiced/Paid are hidden.
        </div>

        {readyJobs.length === 0 ? (
          <p>No jobs ready for invoicing.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "20px",
            }}
          >
            {readyJobs.map((job) => (
              <Link key={job.id} href={`/invoice/${job.id}`} style={cardStyle}>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>
                  Job #{job.jobNumber || job.id}
                  <span style={badge}>Ready to Invoice</span>
                </div>
                <div style={{ fontSize: 13 }}>
                  <div><strong>Client:</strong> {job.client || "—"}</div>
                  <div><strong>Location:</strong> {job.location || "—"}</div>
                  <div><strong>Dates:</strong> {renderDates(job)}</div>

                  {Array.isArray(job.vehicles) && job.vehicles.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <strong>Vehicles:</strong> {job.vehicles.join(", ")}
                    </div>
                  )}
                  {Array.isArray(job.employees) && job.employees.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <strong>Team:</strong> {job.employees.join(", ")}
                    </div>
                  )}
                  {Array.isArray(job.equipment) && job.equipment.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <strong>Equipment:</strong> {job.equipment.join(", ")}
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <strong>Notes:</strong>{" "}
                    {job.notes ? (
                      <div style={{ whiteSpace: "pre-line" }}>{job.notes}</div>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
