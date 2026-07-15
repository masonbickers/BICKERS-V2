"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import Link from "next/link";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function JobNumbersPage() {
  const [groupedJobsByWeek, setGroupedJobsByWeek] = useState({});
  const [openSections, setOpenSections] = useState({
    "This Week": true,
    "Next Week": true,
    "Previous Week": false,
    "No Date": false,
  });

  const toggleSection = (section) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  useEffect(() => {
    const fetchJobs = async () => {
      const snapshot = await getDocs(collection(db, "bookings"));
      const jobList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));

      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const startOfNextWeek = new Date(endOfWeek);
      startOfNextWeek.setDate(endOfWeek.getDate() + 1);
      const endOfNextWeek = new Date(startOfNextWeek);
      endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);

      const startOfLastWeek = new Date(startOfWeek);
      startOfLastWeek.setDate(startOfWeek.getDate() - 7);
      const endOfLastWeek = new Date(startOfWeek);
      endOfLastWeek.setDate(startOfWeek.getDate() - 1);

      const isInRange = (dateStr, start, end) => {
        const date = new Date(dateStr);
        return date >= start && date <= end;
      };

      const initialGrouped = {
        "This Week": {},
        "Next Week": {},
        "Previous Week": {},
        "No Date": {}
      };

      for (const job of jobList) {
        const allDates = job.bookingDates?.length ? job.bookingDates : [job.date].filter(Boolean);
        const key = job.jobNumber || job.id;

        let bucket = "No Date";
        for (const d of allDates) {
          if (isInRange(d, startOfWeek, endOfWeek)) {
            bucket = "This Week";
            break;
          }
          if (isInRange(d, startOfNextWeek, endOfNextWeek)) {
            bucket = "Next Week";
            break;
          }
          if (isInRange(d, startOfLastWeek, endOfLastWeek)) {
            bucket = "Previous Week";
            break;
          }
        }

        if (!initialGrouped[bucket][key]) {
          initialGrouped[bucket][key] = [];
        }
        initialGrouped[bucket][key].push(job);
      }

      setGroupedJobsByWeek(initialGrouped);
    };

    fetchJobs();
  }, []);

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

  const getFormattedDateRange = (job) => {
    if (Array.isArray(job.bookingDates) && job.bookingDates.length > 0) {
      return job.bookingDates.map((date, i) => (
        <div key={i}>{formatDate(date)}</div>
      ));
    }

    if (job.date) {
      return <div>{formatDate(job.date)}</div>;
    }

    return <div>TBC</div>;
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ width: "100%", minHeight: "100vh", backgroundColor: "#fff", color: "#000", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 30 }}>Job Numbers</h1>

        {["This Week", "Next Week", "Previous Week", "No Date"].map(section => {
          const jobsByNumber = groupedJobsByWeek[section] || {};
          const jobNumbers = Object.keys(jobsByNumber);

          return jobNumbers.length > 0 && (
            <div key={section} style={{ marginBottom: 50 }}>
              <h2
                onClick={() => toggleSection(section)}
                style={{
                  marginBottom: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 22
                }}
              >
                {openSections[section] ? "▼" : "►"} {section}
              </h2>

              {openSections[section] && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "20px",
                  }}
                >
                  {jobNumbers.map(jobNumber => {
                    const jobs = jobsByNumber[jobNumber];
                    const firstJob = jobs[0];

                    return (
                      <Link
                        key={jobNumber}
                        href={`/job-numbers/${firstJob.id}`}
                        style={{
                          display: "block",
                          backgroundColor: "#f3f4f6",
                          border: "1px solid #d1d5db",
                          borderRadius: "12px",
                          padding: "16px",
                          textDecoration: "none",
                          color: "#000000",
                        }}
                      >
                        <div style={{ fontWeight: "600", fontSize: "18px", marginBottom: "10px" }}>
                          Job #{jobNumber}
                        </div>

                        {jobs.map((job, idx) => (
                          <div
                            key={idx}
                            style={{
                              marginTop: idx === 0 ? "0" : "16px",
                              paddingTop: idx === 0 ? "0" : "16px",
                              borderTop: idx === 0 ? "none" : "1px solid #d1d5db",
                              fontSize: "13px"
                            }}
                          >
                            <div><strong>Client:</strong> {job.client}</div>
                            <div><strong>Location:</strong> {job.location}</div>
                            <div><strong>Dates:</strong> {getFormattedDateRange(job)}</div>
                            {job.vehicles?.length > 0 && (
                              <div style={{ marginTop: "6px" }}>
                                <strong>Vehicles:</strong> {job.vehicles.join(", ")}
                              </div>
                            )}
                            <div style={{ marginTop: "6px" }}>
                              <strong>Notes:</strong> {job.notes || "—"}
                            </div>
                          </div>
                        ))}

                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </HeaderSidebarLayout>
  );
}
