"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

/* ───────── helpers ───────── */
const norm = (v) => String(v ?? "").trim().toLowerCase();
const truthy = (v) =>
  v === true ||
  v === 1 ||
  norm(v) === "true" ||
  norm(v) === "1" ||
  norm(v) === "yes" ||
  norm(v) === "y";
const ampm = (v) => {
  const t = norm(v);
  if (t === "am") return "AM";
  if (t === "pm") return "PM";
  return null;
};

function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}
function sameYMD(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmt(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtShort(d) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function eachDateInclusive(start, end) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const out = [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

/**
 * Returns half-day info for start and/or end.
 * Supports new fields and legacy, with string booleans and mixed casing.
 * { single: boolean, start: {half:boolean, when:'AM'|'PM'|null}, end: {...} }
 */
function getHalfInfo(h) {
  const s = toDate(h.startDate);
  const e = toDate(h.endDate) || s;
  const single = s && e ? sameYMD(s, e) : false;

  // New fields (preferred)
  let start = { half: false, when: null };
  let end = { half: false, when: null };

  if (truthy(h.startHalfDay)) {
    start.half = true;
    start.when = ampm(h.startAMPM);
  }
  if (truthy(h.endHalfDay)) {
    end.half = true;
    end.when = ampm(h.endAMPM);
  }

  // Legacy fallback
  if (truthy(h.halfDay)) {
    const side = norm(h.halfDaySide || h.halfDayAt);
    const when = ampm(h.halfDayPeriod || h.halfDayType);
    if (side.includes("start") || side.includes("first")) {
      start.half = true;
      start.when = start.when || when;
    } else if (side.includes("end") || side.includes("last")) {
      end.half = true;
      end.when = end.when || when;
    } else if (!single) {
      // sometimes legacy just set halfDay without side — treat as start
      start.half = start.half || true;
      start.when = start.when || when;
    }
  }

  return { single, start, end };
}

/** Build a per-day breakdown. Weekends omitted by default. */
function buildBreakdown(h, includeWeekends = false) {
  const s = toDate(h.startDate);
  const e = toDate(h.endDate) || s;
  if (!s || !e) return [];

  const days = eachDateInclusive(s, e);
  const { single, start, end } = getHalfInfo(h);

  return days
    .map((d, idx) => {
      const weekend = isWeekend(d);
      if (!includeWeekends && weekend) return null;

      let label = "Full day";
      if (single) {
        // Single-day request → half, if set
        if (start.half || end.half) {
          const when = start.when || end.when;
          label = `Half day${when ? ` (${when})` : ""}`;
        }
      } else {
        // Multi-day legacy → half only on matching boundary
        if (idx === 0 && start.half) {
          label = `Half day${start.when ? ` (${start.when})` : ""}`;
        } else if (idx === days.length - 1 && end.half) {
          label = `Half day${end.when ? ` (${end.when})` : ""}`;
        } else {
          label = weekend ? "Weekend (ignored)" : "Full day";
        }
      }

      return {
        key: d.toISOString(),
        date: fmtShort(d),
        label,
        muted: weekend,
      };
    })
    .filter(Boolean);
}

export default function HRPage() {
  const router = useRouter();
  const [requestedHolidays, setRequestedHolidays] = useState([]);

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      const snap = await getDocs(collection(db, "holidays"));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const pending = all.filter(
        (h) => !h.status || String(h.status).toLowerCase() === "requested"
      );
      setRequestedHolidays(pending);
    } catch (err) {
      console.error("Error fetching holidays:", err);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const ref = doc(db, "holidays", id);
      await updateDoc(ref, { status });
      alert(`Holiday ${status}`);
      fetchHolidays();
    } catch (err) {
      console.error("Error updating status:", err);
      alert("❌ Error updating holiday status");
    }
  };

  const documents = [
    { title: "Holiday Request Form", description: "Submit and track time off requests.", link: "/holiday-form" },
    { title: "View Holiday Usage", description: "Check how much holiday each employee has used.", link: "/holiday-usage" },
    { title: "Timesheets", description: "View, submit, and track weekly timesheets.", link: "/timesheets" },
    { title: "Sick Leave Form", description: "Report absences due to illness.", link: "/sick-leave" },
    { title: "HR Policy Manual", description: "View company policies and employee handbook.", link: "/hr-policies" },
    { title: "Contract Upload", description: "Upload new starter contracts and documentation.", link: "/upload-contract" },
  ];

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          backgroundColor: "#f4f4f5",
          color: "#333",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <main style={{ flex: 1, padding: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>HR Resources</h1>

          {/* 📌 Requested Holidays Section */}
          <div
            style={{
              backgroundColor: "#fff",
              padding: 20,
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              marginBottom: 30,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>Requested Holidays</h2>
            {requestedHolidays.length === 0 ? (
              <p style={{ color: "#666" }}>No pending holiday requests.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Employee</th>
                    <th style={th}>From</th>
                    <th style={th}>To</th>
                    <th style={th}>Type</th>
                    <th style={th}>Breakdown</th>
                    <th style={th}>Notes</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requestedHolidays.map((h) => {
                    const fromD = toDate(h.startDate);
                    const toD = toDate(h.endDate) || fromD;
                    const type = String(h.leaveType || h.paidStatus || "Other");
                    const breakdown = buildBreakdown(h, /* includeWeekends */ false);

                    // Append a concise half hint in Type when present
                    const { single, start, end } = getHalfInfo(h);
                    let typeHint = "";
                    if (single && (start.half || end.half)) {
                      typeHint = ` • Half (${start.when || end.when || ""})`.trim();
                    } else if (!single && (start.half || end.half)) {
                      const bits = [];
                      if (start.half) bits.push(`Start half${start.when ? ` (${start.when})` : ""}`);
                      if (end.half) bits.push(`End half${end.when ? ` (${end.when})` : ""}`);
                      typeHint = bits.length ? ` • ${bits.join(", ")}` : "";
                    }

                    return (
                      <tr key={h.id}>
                        <td style={td}>{h.employee || h.employeeCode}</td>
                        <td style={td}>{fmt(fromD)}</td>
                        <td style={td}>{fmt(toD)}</td>
                        <td style={td}>{type}{typeHint}</td>
                        <td style={td}>
                          {breakdown.length === 0 ? (
                            <span style={{ color: "#777" }}>—</span>
                          ) : (
                            <div style={breakdownWrap}>
                              <ul style={breakdownList}>
                                {breakdown.map((row) => (
                                  <li key={row.key} style={row.muted ? mutedItem : normalItem}>
                                    <span style={{ fontWeight: 600 }}>{row.date}</span>{" "}
                                    <span>— {row.label}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </td>
                        <td style={td}>{(h.notes || "").trim() || "-"}</td>
                        <td style={td}>
                          <button
                            style={{ ...btn, backgroundColor: "#22c55e" }}
                            onClick={() => updateStatus(h.id, "approved")}
                          >
                            ✅ Approve
                          </button>
                          <button
                            style={{ ...btn, backgroundColor: "#dc2626" }}
                            onClick={() => updateStatus(h.id, "declined")}
                          >
                            ❌ Decline
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* HR Docs Section */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {documents.map((doc, idx) => (
              <div
                key={idx}
                style={cardStyle}
                onClick={() => router.push(doc.link)}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                <h2 style={{ marginBottom: 10 }}>{doc.title}</h2>
                <p>{doc.description}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

const th = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "2px solid #ddd",
  fontWeight: "bold",
};
const td = { padding: "10px", borderBottom: "1px solid #eee", verticalAlign: "top" };

const btn = {
  border: "none",
  color: "#fff",
  padding: "6px 10px",
  borderRadius: 6,
  marginRight: 6,
  cursor: "pointer",
};

const cardStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  cursor: "pointer",
  transition: "transform 0.2s ease",
};

/* breakdown cell styles */
const breakdownWrap = {
  maxHeight: 160,
  overflowY: "auto",
  border: "1px solid #eee",
  borderRadius: 6,
  padding: "8px 10px",
  background: "#fafafa",
};
const breakdownList = { margin: 0, paddingLeft: 18, listStyle: "disc" };
const normalItem = { color: "#333", lineHeight: 1.4, margin: "2px 0" };
const mutedItem = { color: "#888", lineHeight: 1.4, margin: "2px 0" };
