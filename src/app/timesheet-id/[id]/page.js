"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

// 🔹 Helper: calculate hours difference between two times
function calculateHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startDate = new Date(0, 0, 0, sh, sm);
  const endDate = new Date(0, 0, 0, eh, em);
  let diff = (endDate - startDate) / (1000 * 60 * 60);
  if (diff < 0) diff += 24; // handle overnight
  return Math.max(diff, 0);
}

export default function TimesheetDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [timesheet, setTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const ref = doc(db, "timesheets", id);
        const snap = await getDoc(ref);
        if (snap.exists()) setTimesheet(snap.data());
      } catch (err) {
        console.error("Error fetching timesheet:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <HeaderSidebarLayout>
        <div style={{ padding: 40 }}>Loading…</div>
      </HeaderSidebarLayout>
    );
  }

  if (!timesheet) {
    return (
      <HeaderSidebarLayout>
        <div style={{ padding: 40 }}>
          <h1>No timesheet found</h1>
        </div>
      </HeaderSidebarLayout>
    );
  }

  let totalHours = 0;

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: 40 }}>
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          style={{
            background: "transparent",
            border: "none",
            color: "#555",
            cursor: "pointer",
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          ← Back
        </button>

        {/* Header */}
        <h1 style={{ fontSize: 26, fontWeight: "bold", marginBottom: 6 }}>
          Timesheet — {timesheet.employeeName || timesheet.employeeCode}
        </h1>
        <p style={{ color: "#666", marginBottom: 30, fontSize: 15 }}>
          Week starting{" "}
          <strong>
            {new Date(timesheet.weekStart).toLocaleDateString("en-GB")}
          </strong>
        </p>

        {/* Days */}
        <div style={{ display: "grid", gap: 16 }}>
{days.map((day) => {
  const entry = timesheet.days?.[day];
  if (!entry) return null;

  // ⬇️ NEW: handle holidays / off days
  if (entry.mode === "holiday") {
    return (
      <div key={day} style={{ background: "#fff3cd", padding: 20, borderRadius: 10 }}>
        <h3 style={{ margin: 0 }}>{day}</h3>
        <p style={{ margin: 0, color: "#856404" }}>🌴 Holiday</p>
      </div>
    );
  }

  if (entry.mode === "off") {
    return (
      <div key={day} style={{ background: "#f0f0f0", padding: 20, borderRadius: 10 }}>
        <h3 style={{ margin: 0 }}>{day}</h3>
        <p style={{ margin: 0, color: "#666" }}>Day Off</p>
      </div>
    );
  }

  // existing hours calculation continues here ⬇️
  let hoursWorked = 0;
  if (entry.mode === "yard") {
    hoursWorked = calculateHours(entry.leaveTime, entry.arriveBack);
  } else if (entry.mode === "travel") {
    hoursWorked = calculateHours(entry.leaveTime, entry.arriveTime);
  } else if (entry.mode === "onset") {
    if (entry.callTime && entry.wrapTime) {
      hoursWorked = calculateHours(entry.callTime, entry.wrapTime);
    } else if (entry.leaveTime && entry.arriveBack) {
      hoursWorked = calculateHours(entry.leaveTime, entry.arriveBack);
    } else if (entry.leaveTime && entry.arriveTime) {
      hoursWorked = calculateHours(entry.leaveTime, entry.arriveTime);
    }
  }
  totalHours += hoursWorked;


            return (
              <div
                key={day}
                style={{
                  background: "#fff",
                  padding: 20,
                  borderRadius: 10,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                  border: "1px solid #eee",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 18 }}>{day}</h3>
                  {hoursWorked > 0 && (
                    <span
                      style={{
                        background: "#e0f2fe",
                        color: "#0369a1",
                        padding: "4px 10px",
                        borderRadius: 20,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      ⏱ {hoursWorked.toFixed(1)} hrs
                    </span>
                  )}
                </div>

                {entry.mode === "yard" ? (
                  <p style={{ margin: 0, color: "#333" }}>
                    <strong>Yard Day:</strong> {entry.leaveTime || "08:00"} →{" "}
                    {entry.arriveBack || "16:30"}
                  </p>
                ) : entry.mode === "travel" ? (
                  <p style={{ margin: 0, color: "#333" }}>
                    <strong>Travel Day:</strong> Leave {entry.leaveTime} → Arrive{" "}
                    {entry.arriveTime}
                  </p>
                ) : entry.mode === "onset" ? (
                  <div style={{ fontSize: 14, color: "#333" }}>
                    <strong>On Set</strong>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {entry.leaveTime && <li>Leave: {entry.leaveTime}</li>}
                      {entry.arriveTime && <li>Arrive: {entry.arriveTime}</li>}
                      {entry.callTime && <li>Call: {entry.callTime}</li>}
                      {entry.wrapTime && <li>Wrap: {entry.wrapTime}</li>}
                      {entry.arriveBack && <li>Back: {entry.arriveBack}</li>}
                      {entry.overnight && <li>Overnight stay</li>}
                      {entry.lunchSup && <li>Lunch supplied</li>}
                    </ul>
                  </div>
                ) : (
                  <p style={{ color: "#888", margin: 0 }}>—</p>
                )}

                {entry.dayNotes && (
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: 14,
                      color: "#555",
                      fontStyle: "italic",
                    }}
                  >
                    📝 {entry.dayNotes}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Weekly Total */}
        <div
          style={{
            marginTop: 30,
            background: "#f9fafb",
            padding: 16,
            borderRadius: 10,
            border: "1px solid #eee",
            fontSize: 16,
            fontWeight: "600",
            textAlign: "right",
          }}
        >
          Total Hours: {totalHours.toFixed(1)} hrs
        </div>

        {/* Notes */}
        {timesheet.notes && (
          <div
            style={{
              marginTop: 20,
              background: "#fff",
              padding: 16,
              borderRadius: 8,
              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            }}
          >
            <h3 style={{ marginBottom: 8 }}>General Notes</h3>
            <p style={{ margin: 0 }}>{timesheet.notes}</p>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
