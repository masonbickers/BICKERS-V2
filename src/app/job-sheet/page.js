"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ---------- Week helpers ---------- */
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })} – ${sunday.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

export default function JobSheetPage() {
  const [bookings, setBookings] = useState([]);
  const [openSections, setOpenSections] = useState({
    Upcoming: true,
    "Complete Jobs": true,
    "Passed — Not Confirmed": true,
  });

  const toggleSection = (section) =>
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));

  /* ---------- Date helpers ---------- */
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

  const normaliseDates = (job) => {
    const dates = [];
    if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
      for (const d of job.bookingDates) {
        const pd = parseDate(d);
        if (pd) dates.push(pd);
      }
    } else if (job.date) {
      const pd = parseDate(job.date);
      if (pd) dates.push(pd);
    }
    return dates;
  };

  const formatDate = (d) =>
    d
      ? d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "TBC";

  const getDateRangeLabel = (job) => {
    const ds = normaliseDates(job).sort((a, b) => a - b);
    if (!ds.length) return <div>TBC</div>;
    return (
      <div>
        {ds.map((d, i) => (
          <div key={i}>{formatDate(d)}</div>
        ))}
      </div>
    );
  };

  const todayMidnight = useMemo(() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n;
  }, []);

  /* ---------- Classification ---------- */
  const CONFIRMED_LIKE = new Set([
    "confirmed",
    "pending",
    "complete",
    "completed",
    "action required",
    "action_required",
    "invoiced",
    // treat these as complete-like so they group by their original week:
    "ready to invoice",
    "ready_to_invoice",
    "ready-to-invoice",
    "readyinvoice",
    "paid",          // ✅ NEW
    "settled",       // ✅ NEW (synonym)
  ]);

  const classify = (job) => {
    const ds = normaliseDates(job);
    if (!ds.length) return "Upcoming";

    const anyFutureOrToday = ds.some((d) => {
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      return dd.getTime() >= todayMidnight.getTime();
    });
    if (anyFutureOrToday) return "Upcoming";

    const status = (job.status || "").toLowerCase().trim();
    const confirmedFlag = job.confirmed === true || job.isConfirmed === true;
    if (confirmedFlag || CONFIRMED_LIKE.has(status)) return "Complete Jobs";
    return "Passed — Not Confirmed";
  };

  /* ---------- Realtime listener ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const jobList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() || {}),
      }));
      setBookings(jobList);
    });
    return () => unsub();
  }, []);

  /* ---------- Grouping ---------- */
  const groups = useMemo(() => {
    const grouped = {
      Upcoming: [],
      "Complete Jobs": [],
      "Passed — Not Confirmed": [],
    };
    for (const job of bookings) grouped[classify(job)].push(job);

    grouped.Upcoming.sort((a, b) => {
      const ad = normaliseDates(a)[0] ?? new Date(8640000000000000);
      const bd = normaliseDates(b)[0] ?? new Date(8640000000000000);
      return ad - bd;
    });

    const descMostRecent = (a, b) => {
      const ad = normaliseDates(a)[0] ?? new Date(-8640000000000000);
      const bd = normaliseDates(b)[0] ?? new Date(-8640000000000000);
      return bd - ad;
    };
    grouped["Complete Jobs"].sort(descMostRecent);
    grouped["Passed — Not Confirmed"].sort(descMostRecent);

    return grouped;
  }, [bookings, todayMidnight]);

  const completeJobsByWeek = useMemo(() => {
    const byWeek = {};
    for (const job of groups["Complete Jobs"]) {
      const ds = normaliseDates(job).sort((a, b) => a - b);
      if (!ds.length) continue;
      const mondayKey = getMonday(ds[0]).getTime();
      if (!byWeek[mondayKey]) byWeek[mondayKey] = [];
      byWeek[mondayKey].push(job);
    }
    return byWeek;
  }, [groups]);

  /* ---------- Status badge ---------- */
  const displayStatusForSection = (job, section) => {
    const raw = (job.status || "").toString().trim().toLowerCase();

    if (section === "Complete Jobs") {
      if (
        raw === "ready to invoice" ||
        raw === "ready_to_invoice" ||
        raw === "ready-to-invoice" ||
        /ready\s*to\s*invoice/.test(raw)
      ) {
        return "Ready to Invoice";
      }
      if (raw === "invoiced") return "Invoiced";
      if (raw === "paid" || raw === "settled") return "Paid"; // ✅ NEW
      if (raw === "complete" || raw === "completed") return "Complete";
      if (raw === "action required" || raw === "action_required")
        return "Action Required";
      return "Complete";
    }

    if (
      raw === "ready to invoice" ||
      raw === "ready_to_invoice" ||
      raw === "ready-to-invoice" ||
      /ready\s*to\s*invoice/.test(raw)
    )
      return "Ready to Invoice";
    if (raw === "invoiced") return "Invoiced";
    if (raw === "paid" || raw === "settled") return "Paid"; // ✅ NEW
    if (raw === "complete" || raw === "completed") return "Complete";
    if (raw === "action required" || raw === "action_required")
      return "Action Required";
    if (raw === "confirmed") return "Confirmed";
    if (raw === "first pencil") return "First Pencil";
    if (raw === "second pencil") return "Second Pencil";
    return raw ? raw[0].toUpperCase() + raw.slice(1) : "TBC";
  };

const statusColors = (label) => {
  switch (label) {
    case "Ready to Invoice":
      return { bg: "#fef3c7", border: "#fde68a", text: "#b45309" }; // amber
    case "Invoiced":
      return { bg: "#e0e7ff", border: "#c7d2fe", text: "#4338ca" }; // indigo
    case "Paid":
      return { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" }; // green
    case "Action Required":
      return { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" }; // red
    case "Complete":
    case "Confirmed":
      return { bg: "#cffafe", border: "#67e8f9", text: "#0e7490" }; // cyan
    case "First Pencil":
      return { bg: "#f3e8ff", border: "#e9d5ff", text: "#7e22ce" }; // violet
    case "Second Pencil":
      return { bg: "#fae8ff", border: "#f5d0fe", text: "#a21caf" }; // pink
    case "TBC":
      return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" }; // grey
    default:
      return { bg: "#fef9c3", border: "#fef08a", text: "#854d0e" }; // yellow
  }
};


  const StatusBadge = ({ job, section }) => {
    const label = displayStatusForSection(job, section);
    const c = statusColors(label);
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 10px",
          fontSize: 12,
          borderRadius: 999,
          border: `1px solid ${c.border}`,
          background: c.bg,
          color: c.text,
          marginLeft: 8,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
    );
  };

  /* ---------- UI ---------- */
  const cardStyle = {
    display: "block",
    backgroundColor: "#f3f4f6",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "16px",
    textDecoration: "none",
    color: "#000",
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: "40px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 30 }}>
          Jobs Overview
        </h1>

        {/* Upcoming + Passed Not Confirmed */}
        {["Upcoming", "Passed — Not Confirmed"].map((section) => {
          const items = groups[section] || [];
          if (!items.length) return null;
          return (
            <div key={section} style={{ marginBottom: 50 }}>
              <h2
                onClick={() => toggleSection(section)}
                style={{
                  marginBottom: 12,
                  cursor: "pointer",
                  fontSize: 22,
                  userSelect: "none",
                }}
              >
                {openSections[section] ? "▼" : "►"} {section} ({items.length})
              </h2>
              {openSections[section] && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))",
                    gap: "20px",
                  }}
                >
                  {items.map((job) => (
                    <Link key={job.id} href={`/job-numbers/${job.id}`} style={cardStyle}>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        Job #{job.jobNumber || job.id}
                        <StatusBadge job={job} section={section} />
                      </div>
                      <div style={{ fontSize: 13 }}>
                        <div><strong>Client:</strong> {job.client || "—"}</div>
                        <div><strong>Location:</strong> {job.location || "—"}</div>
                        <div><strong>Dates:</strong> {getDateRangeLabel(job)}</div>
                        <div><strong>Notes:</strong> {job.notes || "—"}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Complete Jobs grouped by week */}
        {Object.keys(completeJobsByWeek)
          .sort((a, b) => b - a)
          .map((mondayTS) => {
            const monday = new Date(Number(mondayTS));
            const weekJobs = completeJobsByWeek[mondayTS];
            return (
              <div key={mondayTS} style={{ marginBottom: 50 }}>
                <h2
                  onClick={() => toggleSection("Complete Jobs")}
                  style={{
                    marginBottom: 12,
                    cursor: "pointer",
                    fontSize: 22,
                    userSelect: "none",
                  }}
                >
                  {openSections["Complete Jobs"] ? "▼" : "►"} Complete Jobs –{" "}
                  {formatWeekRange(monday)} ({weekJobs.length})
                </h2>
                {openSections["Complete Jobs"] && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))",
                      gap: "20px",
                    }}
                  >
                    {weekJobs.map((job) => (
                      <Link key={job.id} href={`/job-numbers/${job.id}`} style={cardStyle}>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          Job #{job.jobNumber || job.id}
                          <StatusBadge job={job} section="Complete Jobs" />
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <div><strong>Client:</strong> {job.client || "—"}</div>
                          <div><strong>Location:</strong> {job.location || "—"}</div>
                          <div><strong>Dates:</strong> {getDateRangeLabel(job)}</div>
                          <div><strong>Notes:</strong> {job.notes || "—"}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </HeaderSidebarLayout>
  );
}
