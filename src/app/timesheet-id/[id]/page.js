"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
  query as fsQuery,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* -------------------------------------------------------------------------- */
/*                               HELPERS                                       */
/* -------------------------------------------------------------------------- */

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const LUNCH_DEDUCT_HRS = 0.5;

/* Parse Date / Timestamp / String */
function parseDateFlexible(raw) {
  if (!raw) return null;
  if (typeof raw?.toDate === "function") return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === "object" && raw.seconds)
    return new Date(raw.seconds * 1000);
  if (typeof raw === "string") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/* HH:mm → minutes */
function toMinutes(val) {
  if (!val) return null;
  if (typeof val === "string") {
    const m = val.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return +m[1] * 60 + +m[2];
  }
  return null;
}

/* diff in hours (supports overnight) */
function diffHours(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return 0;

  let d = (e - s) / 60;
  if (d < 0) d += 24;
  return Math.max(0, d);
}

/* Convert numeric hours to "X hrs Y min" */
function formatHoursLabel(hours) {
  const totalMinutes = Math.round((hours || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  const hPart = h > 0 ? `${h} hr${h !== 1 ? "s" : ""}` : "";
  const mPart = m > 0 ? `${m} min` : "";

  if (!hPart && !mPart) return "0 hrs";
  return [hPart, mPart].filter(Boolean).join(" ");
}

/* yard segments extraction */
function extractYardSegments(entry) {
  if (Array.isArray(entry?.yardSegments)) return entry.yardSegments;

  if (entry?.leaveTime && entry?.arriveBack)
    return [{ start: entry.leaveTime, end: entry.arriveBack }];

  if (entry?.start && entry?.end)
    return [{ start: entry.start, end: entry.end }];

  return [];
}

/* Calculate yard day hours */
function computeYardHours(entry) {
  const segs = extractYardSegments(entry);
  let total = 0;
  segs.forEach((s) => (total += diffHours(s.start, s.end)));

  if (total > 0) total -= LUNCH_DEDUCT_HRS;

  return Math.max(0, total);
}

/* Travel hours */
function computeTravelHours(entry) {
  return diffHours(entry.leaveTime, entry.arriveTime);
}

/* On-set hours (overall) */
function computeOnSetHours(entry) {
  let total = 0;

  const travelTo = diffHours(entry.leaveTime, entry.arriveTime);
  const onSet = diffHours(entry.callTime, entry.wrapTime);
  const travelBack = diffHours(entry.wrapTime, entry.arriveBack);

  if (travelTo > 0) total += travelTo;
  if (onSet > 0) total += onSet;
  if (travelBack > 0) total += travelBack;

  if (total === 0 && entry.leaveTime && entry.arriveBack)
    total = diffHours(entry.leaveTime, entry.arriveBack);

  return total;
}

/* Determine day mode */
function detectMode(entry, hasJobs, isWeekend) {
  const raw = String(entry?.mode ?? "").toLowerCase();
  if (raw === "holiday") return "holiday";
  if (raw === "off") return "off";
  if (isWeekend && !hasJobs) return "off";
  if (raw === "travel") return "travel";
  if (raw === "onset" || raw === "set") return "onset";
  return "yard";
}

/* Normalize days structure to Monday..Sunday */
function normaliseDays(daysObj) {
  const out = {};
  DAYS.forEach((d) => (out[d] = daysObj?.[d] ?? null));
  return out;
}

/* Format Pre-Call minutes */
function formatPrecallMinutes(min) {
  const value = Number(min);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 60) return `${value} min`;
  const hrs = Math.floor(value / 60);
  const rem = value % 60;
  if (rem === 0) return `${hrs} hr${hrs > 1 ? "s" : ""}`;
  return `${hrs} hr${hrs > 1 ? "s" : ""} ${rem} min`;
}

/* Expand a holiday start/end into an array of Y-M-D strings */
function eachDateYMD(startRaw, endRaw) {
  const start = parseDateFlexible(startRaw);
  const end = parseDateFlexible(endRaw || startRaw);
  if (!start || !end) return [];

  const out = [];
  let cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDt = new Date(end);
  endDt.setHours(0, 0, 0, 0);

  while (cur <= endDt) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                               PAGE                                          */
/* -------------------------------------------------------------------------- */

export default function TimesheetDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [timesheet, setTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);

  // jobsByDay now comes from the app's snapshot + booking docs
  const [jobsByDay, setJobsByDay] = useState({});
  const [vehicleRegs, setVehicleRegs] = useState({});

  // live holiday docs expanded per day (Y-M-D → [holidayDocs])
  const [holidaysByDate, setHolidaysByDate] = useState({});

  // manager actions
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [queryDay, setQueryDay] = useState("");
  const [queryField, setQueryField] = useState("overall");
  const [queryNote, setQueryNote] = useState("");
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [querySuccess, setQuerySuccess] = useState("");
  const [queries, setQueries] = useState([]);

  /* ----------------------- Load timesheet ----------------------- */
  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const ref = doc(db, "timesheets", id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setTimesheet({ id: snap.id, ...snap.data() });
        } else {
          setTimesheet(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  /* ----------------------- Derived flag: approved? ----------------------- */
  const isApproved =
    String(timesheet?.status || "").toLowerCase() === "approved" ||
    timesheet?.approved === true;

  /* ----------------------- Load holidays for this timesheet ----------------------- */
  useEffect(() => {
    if (!timesheet) return;

    (async () => {
      try {
        const snap = await getDocs(collection(db, "holidays"));
        const map = {};

        snap.docs.forEach((d) => {
          const h = d.data();

          // ignore soft-deleted / deleted holidays
          const status = String(h.status || "").toLowerCase();
          if (h.deleted === true || h.isDeleted === true || status === "deleted") {
            return;
          }

          // match by employee name or code so we only pull relevant holidays
          const matchesName =
            timesheet.employeeName && h.employee === timesheet.employeeName;
          const matchesCode =
            timesheet.employeeCode && h.employeeCode === timesheet.employeeCode;

          if (!matchesName && !matchesCode) return;

          const dates = eachDateYMD(h.startDate, h.endDate);
          dates.forEach((ymd) => {
            if (!ymd) return;
            if (!map[ymd]) map[ymd] = [];
            map[ymd].push({ id: d.id, ...h });
          });
        });

        setHolidaysByDate(map);
      } catch (e) {
        console.error("Error loading holidays for timesheet:", e);
        setHolidaysByDate({});
      }
    })();
  }, [timesheet]);

  /* ----------------------- Load jobs + vehicles based on snapshot ----------------------- */
  useEffect(() => {
    if (!timesheet) return;

    (async () => {
      try {
        const snapshot = timesheet.jobSnapshot || {};
        const jobMap = {};
        DAYS.forEach((d) => (jobMap[d] = []));

        const allBookingIds = new Set();

        // Prefer jobSnapshot.byDay from the app
        if (snapshot.byDay) {
          DAYS.forEach((day) => {
            const arr = Array.isArray(snapshot.byDay[day])
              ? snapshot.byDay[day]
              : [];
            jobMap[day] = arr;
            arr.forEach((j) => {
              if (j.bookingId) allBookingIds.add(j.bookingId);
            });
          });
        } else if (timesheet.days) {
          // Fallback: use days[day].jobs if present
          DAYS.forEach((day) => {
            const entry = timesheet.days[day];
            const arr = Array.isArray(entry?.jobs) ? entry.jobs : [];
            jobMap[day] = arr;
            arr.forEach((j) => {
              if (j.bookingId) allBookingIds.add(j.bookingId);
            });
          });
        }

        // Fetch each booking doc to get vehicles / up-to-date info
        const bookingDetailsById = {};
        const usedVehicleNames = new Set();

        for (const bookingId of allBookingIds) {
          try {
            const bSnap = await getDoc(doc(db, "bookings", bookingId));
            if (bSnap.exists()) {
              const data = { id: bSnap.id, ...bSnap.data() };
              bookingDetailsById[bookingId] = data;

              if (Array.isArray(data.vehicles)) {
                data.vehicles.forEach((v) => usedVehicleNames.add(v));
              }
            }
          } catch (e) {
            console.error("Error loading booking", bookingId, e);
          }
        }

        // Fetch vehicle registrations only for used vehicles
        const regMap = {};
        if (usedVehicleNames.size > 0) {
          const vs = await getDocs(collection(db, "vehicles"));
          vs.docs.forEach((d) => {
            const v = d.data();
            const name = v.name || d.id;
            if (usedVehicleNames.has(name)) {
              regMap[name] = v.registration || "No Reg";
            }
          });
        }

        // Merge booking details onto snapshot jobs so we have vehicles, etc.
        const mergedJobMap = {};
        DAYS.forEach((day) => {
          const arr = jobMap[day] || [];
          mergedJobMap[day] = arr.map((j) => {
            const b = j.bookingId && bookingDetailsById[j.bookingId];
            if (!b) return j;
            return {
              ...j,
              // Prefer snapshot values, fall back to booking data
              jobNumber: j.jobNumber || b.jobNumber || "",
              client: j.client || b.client || "",
              location: j.location || b.location || "",
              vehicles: Array.isArray(b.vehicles) ? b.vehicles : [],
              booking: b,
            };
          });
        });

        setJobsByDay(mergedJobMap);
        setVehicleRegs(regMap);
      } catch (err) {
        console.error("Error building jobsByDay from snapshot:", err);
        setJobsByDay({});
        setVehicleRegs({});
      }
    })();
  }, [timesheet]);

  /* ----------------------- Load existing queries for this timesheet ----------------------- */
  useEffect(() => {
    if (!timesheet?.id) return;

    (async () => {
      try {
        const q = fsQuery(
          collection(db, "timesheetQueries"),
          where("timesheetId", "==", timesheet.id)
        );
        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setQueries(rows);
      } catch (err) {
        console.error("Error loading timesheet queries:", err);
        setQueries([]);
      }
    })();
  }, [timesheet?.id]);

  /* ------------------------------ PRINT ----------------------------------- */

  const handlePrint = () => {
    if (typeof window === "undefined") return;

    const printRoot = document.getElementById("timesheet-print-root");
    if (!printRoot) {
      window.print();
      return;
    }

    const original = document.body.innerHTML;
    const printHtml = printRoot.innerHTML;

    document.body.innerHTML = printHtml;
    window.print();
    document.body.innerHTML = original;
    window.location.reload();
  };

  /* ------------------------------ APPROVE --------------------------------- */

  const handleApprove = async () => {
    if (!timesheet?.id) return;
    setApproving(true);
    setApproveError("");

    try {
      const ref = doc(db, "timesheets", timesheet.id);
      await updateDoc(ref, {
        status: "approved",
        approvedAt: serverTimestamp(),
      });

      // optimistic local update
      setTimesheet((prev) =>
        prev
          ? {
              ...prev,
              status: "approved",
              approvedAt: new Date(),
            }
          : prev
      );

      // 🔒 Close all queries for this timesheet when approved
      try {
        const q = fsQuery(
          collection(db, "timesheetQueries"),
          where("timesheetId", "==", timesheet.id)
        );
        const snap = await getDocs(q);

        await Promise.all(
          snap.docs.map((docSnap) =>
            updateDoc(docSnap.ref, {
              status: "closed",
              closedAt: serverTimestamp(),
            })
          )
        );

        // Reload queries into local state so UI shows CLOSED
        const snap2 = await getDocs(q);
        setQueries(snap2.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (qErr) {
        console.error("Error closing timesheet queries on approve:", qErr);
      }
    } catch (err) {
      console.error("Error approving timesheet:", err);
      setApproveError("Failed to approve timesheet. Please try again.");
    } finally {
      setApproving(false);
    }
  };

  /* ------------------------------ QUERY ----------------------------------- */

  const handleSubmitQuery = async (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (!timesheet?.id) return;

    setQueryError("");
    setQuerySuccess("");

    // 🔒 Block sending new queries if timesheet is approved
    if (isApproved) {
      setQueryError("This timesheet has been approved. You can no longer send new queries.");
      return;
    }

    if (!queryDay) {
      setQueryError("Please select a day.");
      return;
    }
    if (!queryNote.trim()) {
      setQueryError("Please enter a note describing the issue.");
      return;
    }

    setQuerySubmitting(true);
    try {
      await addDoc(collection(db, "timesheetQueries"), {
        timesheetId: timesheet.id,
        employeeName: timesheet.employeeName || "",
        employeeCode: timesheet.employeeCode || "",
        weekStart: timesheet.weekStart || null,
        day: queryDay,
        field: queryField || "overall",
        note: queryNote.trim(),
        status: "open",
        createdAt: serverTimestamp(),
        createdByRole: "manager",
      });

      // reload queries list
      const q = fsQuery(
        collection(db, "timesheetQueries"),
        where("timesheetId", "==", timesheet.id)
      );
      const snap = await getDocs(q);
      setQueries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setQuerySuccess("Query sent to employee.");
      setQueryNote("");
    } catch (err) {
      console.error("Error creating timesheet query:", err);
      setQueryError("Failed to send query. Please try again.");
    } finally {
      setQuerySubmitting(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                   RENDER                                   */
  /* -------------------------------------------------------------------------- */

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

  const dayMap = normaliseDays(timesheet.days);
  let weeklyTotal = 0;
  const weekStartDate = parseDateFlexible(timesheet.weekStart);

  let statusLabel = "Draft (not submitted)";
  let badgeBg = "#fed7aa";
  let badgeBorder = "#fdba74";
  let badgeColor = "#7c2d12";

  if (timesheet.submitted && !isApproved) {
    statusLabel = "Submitted";
    badgeBg = "#bbf7d0";
    badgeBorder = "#86efac";
    badgeColor = "#052e16";
  }
  if (isApproved) {
    statusLabel = "Approved";
    badgeBg = "#dcfce7";
    badgeBorder = "#22c55e";
    badgeColor = "#14532d";
  }

  const queryDisabledReason = isApproved
    ? "Timesheet approved – queries are read-only."
    : "";

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          padding: 24,
          minHeight: "100vh",
          backgroundColor: "#f4f4f5",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        {/* Controls (not printed) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            gap: 12,
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              background: "none",
              border: "none",
              color: "#4b5563",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ← Back
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handlePrint}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                backgroundColor: "#0f172a",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              🖨 Print Timesheet
            </button>

            <button
              onClick={handleApprove}
              disabled={approving || isApproved}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "1px solid #16a34a",
                backgroundColor: isApproved ? "#bbf7d0" : "#16a34a",
                color: isApproved ? "#166534" : "#ecfdf5",
                fontWeight: 600,
                fontSize: 14,
                cursor: approving || isApproved ? "default" : "pointer",
                opacity: approving ? 0.7 : 1,
              }}
            >
              {isApproved ? "Approved" : approving ? "Approving…" : "✓ Approve"}
            </button>
          </div>
        </div>

        {approveError && (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: 8,
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: 13,
            }}
          >
            {approveError}
          </div>
        )}

        {/* Printable content */}
        <div
          id="timesheet-print-root"
          style={{
            flex: 1,
            backgroundColor: "#ffffff",
            borderRadius: 8,
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 16,
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: 0,
                  marginBottom: 4,
                }}
              >
                Timesheet — {timesheet.employeeName || timesheet.employeeCode}
              </h1>
              <p
                style={{
                  color: "#4b5563",
                  margin: 0,
                  fontSize: 14,
                }}
              >
                Week starting{" "}
                <strong>
                  {parseDateFlexible(timesheet.weekStart)?.toLocaleDateString(
                    "en-GB"
                  )}
                </strong>
              </p>
            </div>

            <div style={{ textAlign: "right", fontSize: 12 }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: "1px solid",
                  fontSize: 11,
                  fontWeight: 800,
                  backgroundColor: badgeBg,
                  borderColor: badgeBorder,
                  color: badgeColor,
                  marginBottom: 4,
                }}
              >
                {statusLabel}
              </div>
              {timesheet.submittedAt && (
                <div style={{ color: "#6b7280" }}>
                  Submitted:{" "}
                  {parseDateFlexible(timesheet.submittedAt)?.toLocaleString(
                    "en-GB"
                  )}
                </div>
              )}
              {timesheet.approvedAt && (
                <div style={{ color: "#15803d", marginTop: 2 }}>
                  Approved:{" "}
                  {parseDateFlexible(timesheet.approvedAt)?.toLocaleString(
                    "en-GB"
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 7-day row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 12,
              alignItems: "stretch",
              minHeight: "320px",
              fontSize: 14,
            }}
          >
            {DAYS.map((day) => {
              const entry = dayMap[day];
              const isWeekend = day === "Saturday" || day === "Sunday";
              const rawJobs = jobsByDay[day] || [];
              const jobsToday = Array.isArray(rawJobs) ? rawJobs : [];
              const hasJobs = jobsToday.length > 0;

              if (!entry && isWeekend)
                return (
                  <div
                    key={day}
                    style={{
                      background: "#f9fafb",
                      padding: 14,
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      display: "flex",
                      flexDirection: "column",
                      fontSize: 15,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {day}
                    </div>
                    <div style={{ color: "#6b7280" }}>Day Off</div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isApproved) return;
                        setShowQueryForm(true);
                        setQueryDay(day);
                      }}
                      disabled={isApproved}
                      title={
                        isApproved
                          ? queryDisabledReason
                          : "Raise a query for this day"
                      }
                      style={{
                        marginTop: "auto",
                        alignSelf: "flex-start",
                        fontSize: 11,
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px dashed #9ca3af",
                        background: "#f9fafb",
                        cursor: isApproved ? "not-allowed" : "pointer",
                        opacity: isApproved ? 0.5 : 1,
                      }}
                    >
                      ❓ Query this day
                    </button>
                  </div>
                );

              if (!entry) return null;

              // work out the actual calendar date (Y-M-D) for this day
              let ymdForDay = null;
              if (weekStartDate) {
                const dayIndex = DAYS.indexOf(day); // 0..6
                const dt = new Date(weekStartDate);
                dt.setDate(dt.getDate() + dayIndex);
                dt.setHours(0, 0, 0, 0);
                ymdForDay = dt.toISOString().slice(0, 10);
              }

              // live holiday docs for this date
              const holidayDocsForDay = ymdForDay
                ? holidaysByDate[ymdForDay] || []
                : [];
              const hasLiveHoliday = holidayDocsForDay.length > 0;

              // derive paid / unpaid / accrued label from holiday docs
              const paidStatuses = Array.from(
                new Set(
                  holidayDocsForDay
                    .map((h) =>
                      String(h.paidStatus || h.leaveType || "").trim()
                    )
                    .filter(Boolean)
                )
              );

              let paidLabel = null;
              if (paidStatuses.length === 1) {
                paidLabel = paidStatuses[0]; // e.g. "Paid", "Unpaid", "Accrued"
              } else if (paidStatuses.length > 1) {
                paidLabel = paidStatuses.join(" / "); // mixed, rare but handled
              }

              let mode = detectMode(entry, hasJobs, isWeekend);

              // If there is NO LIVE HOLIDAY, don't honour old "holiday" mode on the timesheet
              if (mode === "holiday" && !hasLiveHoliday) {
                mode = isWeekend && !hasJobs ? "off" : "yard";
              }

              let dayHours = 0;
              if (mode === "yard") dayHours = computeYardHours(entry);
              if (mode === "travel") dayHours = computeTravelHours(entry);
              if (mode === "onset") dayHours = computeOnSetHours(entry);

              weeklyTotal += dayHours;
              const dayTotalLabel = formatHoursLabel(dayHours);
              const precallLabel = entry.precallDuration
                ? formatPrecallMinutes(entry.precallDuration)
                : "";

              // For the breakdown (on-set)
              const travelToHrs = diffHours(entry.leaveTime, entry.arriveTime);
              const onSetBlockHrs = diffHours(entry.callTime, entry.wrapTime);
              const travelBackHrs = diffHours(entry.wrapTime, entry.arriveBack);

              return (
                <div
                  key={day}
                  style={{
                    background: "#f9fafb",
                    padding: 14,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    boxSizing: "border-box",
                    fontSize: 15,
                  }}
                >
                  {/* Day header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 6,
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 650,
                      }}
                    >
                      {day}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isApproved) return;
                        setShowQueryForm(true);
                        setQueryDay(day);
                      }}
                      disabled={isApproved}
                      title={
                        isApproved
                          ? queryDisabledReason
                          : "Raise a query for this day"
                      }
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px dashed #9ca3af",
                        background: "#f3f4f6",
                        cursor: isApproved ? "not-allowed" : "pointer",
                        opacity: isApproved ? 0.5 : 1,
                      }}
                    >
                      ❓ Query this day
                    </button>
                  </div>

                  {/* HOLIDAY / OFF */}
                  {mode === "holiday" && hasLiveHoliday && (
                    <div style={{ fontWeight: 600 }}>
                      <span style={{ color: "#007da3ff" }}>Holiday</span>
                      {paidLabel && (
                        <span
                          style={{
                            marginLeft: 6,
                            color:
                              paidLabel.toLowerCase() === "unpaid"
                                ? "#8a8a8aff"
                                : "#1d4ed8",
                          }}
                        >
                          ({paidLabel})
                        </span>
                      )}
                    </div>
                  )}
                  {mode === "off" && (
                    <div style={{ color: "#6b7280" }}>Day Off</div>
                  )}

                  {/* JOB INFO (number, client, location, vehicles) */}
                  {hasJobs && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      {jobsToday.map((job, idx) => (
                        <div
                          key={`${job.bookingId || job.id || idx}-${idx}`}
                          style={{
                            background: "#fefce8",
                            border: "1px solid #facc15",
                            padding: "8px 10px",
                            borderRadius: 8,
                          }}
                        >
                          <div style={{ marginBottom: 4 }}>
                            <strong style={{ fontSize: 14.5 }}>
                              📌 {job.jobNumber || job.id || job.bookingId}
                            </strong>

                            {job.client && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  color: "#374151",
                                  fontWeight: 500,
                                }}
                              >
                                • {job.client}
                              </span>
                            )}

                            {job.location && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  color: "#6b7280",
                                }}
                              >
                                • {job.location}
                              </span>
                            )}
                          </div>

                          {/* VEHICLES + REG */}
                          {Array.isArray(job.vehicles) &&
                            job.vehicles.map((v, vIdx) => (
                              <div
                                key={`${job.bookingId || job.id}-vehicle-${v}-${vIdx}`}
                                style={{
                                  color: "#047857",
                                  fontWeight: 600,
                                  fontSize: 14,
                                }}
                              >
                                🚗 {v} —{" "}
                                <span
                                  style={{
                                    fontWeight: 700,
                                  }}
                                >
                                  {vehicleRegs[v] || "No Reg"}
                                </span>
                              </div>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* YARD */}
                  {mode === "yard" && (
                    <div style={{ fontSize: 14 }}>
                      <div style={{ fontWeight: 600 }}>Yard:</div>
                      {extractYardSegments(entry).map((seg, i) => (
                        <div key={`${day}-seg-${i}`}>
                          {seg.start} → {seg.end}
                        </div>
                      ))}
                      <div style={{ color: "#9ca3af", fontSize: 12 }}>
                        (-0.5 hr lunch)
                      </div>
                    </div>
                  )}

                  {/* TRAVEL */}
                  {mode === "travel" && (
                    <div style={{ fontSize: 14 }}>
                      <div style={{ fontWeight: 600 }}>Travel:</div>
                      <div>
                        {entry.leaveTime ?? "—"} → {entry.arriveTime ?? "—"}
                      </div>
                    </div>
                  )}

                  {/* ON-SET */}
                  {mode === "onset" && (
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      <div style={{ fontWeight: 600 }}>On Set:</div>
                      <ul
                        style={{
                          marginTop: 4,
                          marginLeft: 18,
                          paddingLeft: 0,
                          listStyle: "disc",
                        }}
                      >
                        {entry.leaveTime && (
                          <li>Leave: {entry.leaveTime}</li>
                        )}
                        {entry.arriveTime && (
                          <li>Arrive: {entry.arriveTime}</li>
                        )}
                        {precallLabel && <li>Pre-Call: {precallLabel}</li>}
                        {entry.callTime && <li>Unit-Call: {entry.callTime}</li>}
                        {entry.wrapTime && <li>Wrap: {entry.wrapTime}</li>}
                        {entry.arriveBack && (
                          <li>Back: {entry.arriveBack}</li>
                        )}
                        {entry.overnight && <li>Overnight stay</li>}
                        {entry.lunchSup && <li>Lunch supplied</li>}
                      </ul>

                      {/* Numeric breakdown for on-set */}
                      <div style={{ marginTop: 2 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          Breakdown:
                        </div>
                        <div style={{ fontSize: 13 }}>
                          Travel to: {formatHoursLabel(travelToHrs)}
                        </div>
                        <div style={{ fontSize: 13 }}>
                          On set: {formatHoursLabel(onSetBlockHrs)}
                        </div>
                        <div style={{ fontSize: 13 }}>
                          Travel back: {formatHoursLabel(travelBackHrs)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* NOTES */}
                  {entry.dayNotes && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: "#4b5563",
                        fontStyle: "italic",
                      }}
                    >
                      📝 {entry.dayNotes}
                    </div>
                  )}

                  {/* Daily total at bottom, with compact gap above */}
                  <div
                    style={{
                      marginTop: "auto",
                      borderTop: "1px solid #e5e7eb",
                      paddingTop: 10,
                      fontSize: 13,
                      color: "#374151",
                      textAlign: "right",
                    }}
                  >
                    Daily total:{" "}
                    <strong style={{ fontWeight: 700 }}>
                      {dayTotalLabel}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* WEEK TOTAL + NOTES ROW */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 260px",
              gap: 12,
              marginTop: 16,
              alignItems: "stretch",
            }}
          >
            {/* General Notes */}
            <div
              style={{
                background: "#f9fafb",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                padding: 12,
                fontSize: 14,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                General Notes
              </div>
              <div style={{ color: "#4b5563", minHeight: 24 }}>
                {timesheet.notes || "—"}
              </div>
            </div>

            {/* Weekly total */}
            <div
              style={{
                background: "#020617",
                color: "#f9fafb",
                borderRadius: 8,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "flex-end",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: 0.8,
                  marginBottom: 4,
                }}
              >
                Weekly total
              </div>
              <div>{formatHoursLabel(weeklyTotal)}</div>
            </div>
          </div>
        </div>

        {/* MANAGER ACTIONS (NOT PRINTED) */}
        <div
          style={{
            marginTop: 16,
            background: "#ffffff",
            borderRadius: 8,
            padding: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            fontSize: 14,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              margin: 0,
              marginBottom: 8,
            }}
          >
            Manager queries
          </h2>
          <p style={{ margin: 0, marginBottom: 10, color: "#4b5563" }}>
            Select a day from the grid above ({" "}
            <span style={{ fontStyle: "italic" }}>“❓ Query this day”</span> ) to
            raise a query. This will create a record against the timesheet which
            can be shown in the employee app and used to trigger a notification.
          </p>

          {isApproved && (
            <div
              style={{
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 6,
                backgroundColor: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1e3a8a",
                fontSize: 12,
              }}
            >
              This timesheet is approved. Queries are now read-only – you can
              review existing queries but cannot send new ones.
            </div>
          )}

          <form
            onSubmit={handleSubmitQuery}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "flex-start",
              marginBottom: 12,
              opacity: isApproved ? 0.6 : 1,
            }}
          >
            <div style={{ minWidth: 140 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                Day
              </label>
              <select
                value={queryDay}
                onChange={(e) => setQueryDay(e.target.value)}
                disabled={isApproved}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  backgroundColor: isApproved ? "#f3f4f6" : "#ffffff",
                  cursor: isApproved ? "not-allowed" : "pointer",
                }}
              >
                <option value="">Select day…</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 160 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                What are you querying?
              </label>
              <select
                value={queryField}
                onChange={(e) => setQueryField(e.target.value)}
                disabled={isApproved}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  backgroundColor: isApproved ? "#f3f4f6" : "#ffffff",
                  cursor: isApproved ? "not-allowed" : "pointer",
                }}
              >
                <option value="overall">Overall hours</option>
                <option value="yard">Yard times</option>
                <option value="travel">Travel times</option>
                <option value="onset">On-set times</option>
                <option value="notes">Notes / comments</option>
                <option value="holiday">Holiday / day off</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                Query note for employee
              </label>
              <textarea
                value={queryNote}
                onChange={(e) => setQueryNote(e.target.value)}
                rows={2}
                placeholder={
                  isApproved
                    ? "Queries are closed on approved timesheets."
                    : "e.g. Hours seem high on Thursday – can you double-check call and wrap times?"
                }
                disabled={isApproved}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  resize: "vertical",
                  backgroundColor: isApproved ? "#f3f4f6" : "#ffffff",
                  cursor: isApproved ? "not-allowed" : "text",
                }}
              />
            </div>

            <div style={{ alignSelf: "flex-end" }}>
              <button
                type="submit"
                disabled={querySubmitting || isApproved}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "1px solid #0f172a",
                  backgroundColor: isApproved ? "#9ca3af" : "#0f172a",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor:
                    querySubmitting || isApproved ? "not-allowed" : "pointer",
                  opacity: querySubmitting ? 0.7 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {isApproved
                  ? "Queries closed"
                  : querySubmitting
                  ? "Sending…"
                  : "Send query to employee"}
              </button>
            </div>
          </form>

          {queryError && (
            <div
              style={{
                marginBottom: 8,
                padding: "6px 10px",
                borderRadius: 6,
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: 12,
              }}
            >
              {queryError}
            </div>
          )}
          {querySuccess && (
            <div
              style={{
                marginBottom: 8,
                padding: "6px 10px",
                borderRadius: 6,
                backgroundColor: "#ecfdf5",
                border: "1px solid #bbf7d0",
                color: "#166534",
                fontSize: 12,
              }}
            >
              {querySuccess}
            </div>
          )}

          {/* Existing queries list */}
          {queries.length > 0 && (
            <div
              style={{
                marginTop: 8,
                borderTop: "1px solid #e5e7eb",
                paddingTop: 8,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                Existing queries on this timesheet
              </div>
              <ul
                style={{
                  listStyle: "none",
                  paddingLeft: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {queries.map((q) => (
                  <li
                    key={q.id}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      backgroundColor: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ marginBottom: 2 }}>
                      <strong>{q.day}</strong>{" "}
                      <span style={{ color: "#6b7280" }}>
                        ({q.field || "overall"})
                      </span>
                      {q.status && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: 999,
                            backgroundColor:
                              String(q.status).toLowerCase() === "closed"
                                ? "#dcfce7"
                                : "#eef2ff",
                            color:
                              String(q.status).toLowerCase() === "closed"
                                ? "#166534"
                                : "#3730a3",
                          }}
                        >
                          {String(q.status).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#4b5563", marginBottom: 6 }}>
                      {q.note}
                    </div>

                    {/* INLINE MESSAGE THREAD FOR THIS QUERY */}
                    <QueryMessageThread query={q} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ------------------------------------------------------------- */
/* INLINE QUERY MESSAGE THREAD                                   */
/* ------------------------------------------------------------- */

function QueryMessageThread({ query }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const isClosed = String(query?.status || "").toLowerCase() === "closed";

  useEffect(() => {
    if (!query?.id) return;

    const msgRef = fsQuery(
      collection(db, "timesheetQueries", query.id, "messages")
    );

    const unsub = onSnapshot(msgRef, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
        );
      setMessages(rows);
    });

    return () => unsub();
  }, [query?.id]);

  const handleSend = async () => {
    if (!input.trim() || !query?.id || isClosed) return;
    setSending(true);
    try {
      await addDoc(
        collection(db, "timesheetQueries", query.id, "messages"),
        {
          text: input.trim(),
          from: "manager",
          createdAt: serverTimestamp(),
        }
      );
      setInput("");
    } catch (err) {
      console.error("Error sending query message:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 6,
          color: "#4b5563",
        }}
      >
        Messages {isClosed && "(read-only)"}
      </div>

      <div
        style={{
          maxHeight: 200,
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          padding: 8,
          marginBottom: 8,
          fontSize: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "#9ca3af", textAlign: "center" }}>
            No messages yet.
          </div>
        )}

        {messages.map((m) => {
          const isManager = m.from === "manager";
          return (
            <div
              key={m.id}
              style={{
                marginBottom: 6,
                textAlign: isManager ? "right" : "left",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 8px",
                  borderRadius: 999,
                  backgroundColor: isManager ? "#0f172a" : "#e5e7eb",
                  color: isManager ? "#f9fafb" : "#111827",
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      {isClosed && (
        <div
          style={{
            fontSize: 11,
            color: "#6b7280",
            marginBottom: 6,
          }}
        >
          This query is closed. No further messages can be sent.
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isClosed ? "Query closed – replies disabled." : "Reply to this query…"
          }
          disabled={isClosed}
          style={{
            flex: 1,
            padding: "6px 8px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            fontSize: 12,
            backgroundColor: isClosed ? "#f3f4f6" : "#ffffff",
            cursor: isClosed ? "not-allowed" : "text",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim() || isClosed}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #0f172a",
            backgroundColor: isClosed ? "#9ca3af" : "#0f172a",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
            cursor:
              sending || !input.trim() || isClosed ? "not-allowed" : "pointer",
            opacity: sending || !input.trim() || isClosed ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
