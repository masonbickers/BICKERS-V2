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

/* ---------- Job prefix helper ---------- */
const getJobPrefix = (job) => {
  if (!job.jobNumber) return "No Job #";
  return job.jobNumber.toString().split("-")[0]; // 🔹 take only first 4 digits before dash
};


export default function JobSheetPage() {
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("Upcoming"); // 🔹 New state

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
  
  /* ---------- Group jobs by week ---------- */
const groupJobsByWeek = (jobs) => {
  const byWeek = {};
  for (const job of jobs) {
    const ds = normaliseDates(job).sort((a, b) => a - b);
    if (!ds.length) continue;
    const mondayKey = getMonday(ds[0]).getTime(); // start of week
    if (!byWeek[mondayKey]) byWeek[mondayKey] = [];
    byWeek[mondayKey].push(job);
  }
  return byWeek;
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
    if (!ds.length) return "TBC";
    return ds.map((d) => formatDate(d)).join(", ");
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
    "ready to invoice",
    "ready_to_invoice",
    "ready-to-invoice",
    "readyinvoice",
    "paid",
    "settled",
  ]);

const classify = (job) => {
  const status = (job.status || "").toLowerCase().trim();

  // 🔹 Direct status-based categories
  if (/ready\s*to\s*invoice/.test(status)) return "Ready to Invoice";
  if (status === "paid" || status === "settled") return "Paid";
  if (status.includes("action")) return "Needs Action";
if (status.includes("enquiry") || status.includes("inquiry")) return "Enquiries";

  // 🔹 Date-based logic (for Upcoming / Complete / Passed)
  const ds = normaliseDates(job);
  if (!ds.length) return "Upcoming";

  const anyFutureOrToday = ds.some((d) => {
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    return dd.getTime() >= todayMidnight.getTime();
  });
  if (anyFutureOrToday) return "Upcoming";

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

  /* ---------- Search filter ---------- */
  const filteredBookings = useMemo(() => {
    if (!search) return bookings;
    const s = search.toLowerCase();
    return bookings.filter(
      (job) =>
        (job.jobNumber || "").toString().toLowerCase().includes(s) ||
        (job.client || "").toLowerCase().includes(s) ||
        (job.location || "").toLowerCase().includes(s) ||
        (job.notes || "").toLowerCase().includes(s)
    );
  }, [bookings, search]);

  /* ---------- Grouping ---------- */
const groups = useMemo(() => {
  const grouped = {
    Upcoming: [],
    "Complete Jobs": [],
    "Passed — Not Confirmed": [],
    "Ready to Invoice": [],
    Paid: [],
    "Needs Action": [],
    Enquiries: [],
  };

  for (const job of filteredBookings) {
    const cat = classify(job);
    if (grouped[cat]) grouped[cat].push(job);
    else grouped["Upcoming"].push(job); // fallback
  }


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
  }, [filteredBookings, todayMidnight]);

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
      if (/ready\s*to\s*invoice/.test(raw)) return "Ready to Invoice";
      if (raw === "invoiced") return "Invoiced";
      if (raw === "paid" || raw === "settled") return "Paid";
      if (raw === "complete" || raw === "completed") return "Complete";
      if (raw.includes("action")) return "Action Required";
      return "Complete";
    }

    if (/ready\s*to\s*invoice/.test(raw)) return "Ready to Invoice";
    if (raw === "invoiced") return "Invoiced";
    if (raw === "paid" || raw === "settled") return "Paid";
    if (raw === "complete" || raw === "completed") return "Complete";
    if (raw.includes("action")) return "Action Required";
    if (raw === "confirmed") return "Confirmed";
    if (raw === "first pencil") return "First Pencil";
    if (raw === "second pencil") return "Second Pencil";
    return raw ? raw[0].toUpperCase() + raw.slice(1) : "TBC";
  };

  const statusColors = (label) => {
    switch (label) {
      case "Ready to Invoice":
        return { bg: "#fef3c7", border: "#fde68a", text: "#b45309" };
      case "Invoiced":
        return { bg: "#e0e7ff", border: "#c7d2fe", text: "#4338ca" };
      case "Paid":
        return { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" };
      case "Action Required":
        return { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" };
      case "Complete":
      case "Confirmed":
        return { bg: "#cffafe", border: "#67e8f9", text: "#0e7490" };
      case "First Pencil":
        return { bg: "#f3e8ff", border: "#e9d5ff", text: "#7e22ce" };
      case "Second Pencil":
        return { bg: "#fae8ff", border: "#f5d0fe", text: "#a21caf" };
      case "TBC":
        return { bg: "#f3f4f6", border: "#e5e7eb", text: "#374151" };
      default:
        return { bg: "#fef9c3", border: "#fef08a", text: "#854d0e" };
    }
  };

  const StatusBadge = ({ job, section }) => {
    const label = displayStatusForSection(job, section);
    const c = statusColors(label);
    return (
      <span
        style={{
          padding: "4px 10px",
          fontSize: 12,
          borderRadius: 999,
          border: `1px solid ${c.border}`,
          background: c.bg,
          color: c.text,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    );
  };

  /* ---------- UI ---------- */
  const cardStyle = {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "18px",
    textDecoration: "none",
    color: "#000",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
    transition: "all 0.2s ease",
  };

  const JobCard = ({ job, section }) => (
    <Link href={`/job-numbers/${job.id}`} style={cardStyle}>
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          Job #{job.jobNumber || job.id}
        </span>
        <StatusBadge job={job} section={section} />
      </div>

      {/* Info Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "90px 1fr",
          rowGap: "6px",
          columnGap: "12px",
          fontSize: 14,
          lineHeight: 1.4,
        }}
      >
        <span style={{ color: "#6b7280" }}>Client</span>
        <span>{job.client || "—"}</span>

        <span style={{ color: "#6b7280" }}>Location</span>
        <span>{job.location || "—"}</span>

        <span style={{ color: "#6b7280" }}>Dates</span>
        <span>{getDateRangeLabel(job)}</span>

        <span style={{ color: "#6b7280" }}>Notes</span>
        <span>{job.notes || "—"}</span>
      </div>
    </Link>
  );

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: "40px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
          Jobs Overview
        </h1>

        {/* 🔍 Search Bar */}
        <input
          type="text"
          placeholder="Search by job #, client, location, or notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            marginBottom: 20,
            fontSize: 14,
          }}
        />

       {/* 🔹 Section Selector with extra categories */}
<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 30 }}>
  {[
    "Upcoming",
    "Passed — Not Confirmed",
    "Complete Jobs",
    "Ready to Invoice",
    "Paid",
    "Needs Action",
    "Enquiries",
  ].map((s) => (
    <button
      key={s}
      onClick={() => setActiveSection(s)}
      style={{
        padding: "8px 16px",
        borderRadius: "8px",
        border:
          activeSection === s
            ? "2px solid #2563eb"
            : "1px solid #d1d5db",
        background: activeSection === s ? "#eff6ff" : "#fff",
        color: activeSection === s ? "#1d4ed8" : "#374151",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {s}
    </button>
  ))}
</div>


        {/* 🔹 Show Active Section */}
{/* 🔹 Week-split layout for all filters except Enquiries */}
{activeSection !== "Enquiries" &&
  Object.keys(groupJobsByWeek(groups[activeSection] || []))
      .sort((a, b) =>
      activeSection === "Upcoming" ? a - b : b - a
    ) // 🔹 earliest week first for Upcoming, latest first for others
    .map((mondayTS) => {
      const monday = new Date(Number(mondayTS));
      const weekJobs = groupJobsByWeek(groups[activeSection] || [])[mondayTS];
      return (
        <div key={mondayTS} style={{ marginBottom: 40 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 16,
              color: "#374151",
            }}
          >
            {formatWeekRange(monday)} ({weekJobs.length})
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)", // 🔹 4 columns
              gap: "20px",
            }}
          >
            {weekJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                section={activeSection}
              />
            ))}
          </div>
        </div>
      );
    })}

{activeSection === "Enquiries" && (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)", // still 4 columns
      gap: "20px",
    }}
  >
    {groups.Enquiries?.map((job) => (
      <JobCard key={job.id} job={job} section="Enquiries" />
    ))}
  </div>
)}

      </div>
    </HeaderSidebarLayout>
  );
}
