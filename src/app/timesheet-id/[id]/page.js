"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs, query, where, documentId } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
// Deduct 30 mins from Yard days
const LUNCH_DEDUCT_HRS = 0.5;




// Accept DD/MM/YYYY, YYYY-MM-DD, Date, Timestamp, etc.
function parseDateFlexible(raw) {
  if (!raw) return null;
  if (typeof raw?.toDate === "function") return raw.toDate();
  if (typeof raw === "object" && raw !== null && typeof raw.seconds === "number")
    return new Date(raw.seconds * 1000);
  if (raw instanceof Date) return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3], 12, 0, 0, 0);
    m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1], 12, 0, 0, 0);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "number") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Normalise a timesheet.days shape into an object keyed by Monday..Sunday
function normaliseDays(daysObjOrArr, baseWeekStart) {
  const out = {};
  const title = (x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  const dayFromDate = (dLike) => {
    const d = parseDateFlexible(dLike);
    return d ? d.toLocaleDateString("en-GB", { weekday: "long" }) : null;
  };
  const mapShort = { Mon:"Monday", Tue:"Tuesday", Wed:"Wednesday", Thu:"Thursday", Fri:"Friday", Sat:"Saturday", Sun:"Sunday" };

  if (Array.isArray(daysObjOrArr)) {
    for (const it of daysObjOrArr) {
      let key = it?.day || it?.dayName || it?.weekday || null;
      if (!key && it?.date) key = dayFromDate(it.date);
      if (!key && baseWeekStart && it?.offset != null) {
        const d0 = parseDateFlexible(baseWeekStart);
        if (d0) {
          const d = new Date(d0);
          d.setDate(d0.getDate() + Number(it.offset));
          key = d.toLocaleDateString("en-GB", { weekday: "long" });
        }
      }
      if (!key) continue;
      key = mapShort[key] || title(String(key));
      out[key] = it;
    }
  } else if (daysObjOrArr && typeof daysObjOrArr === "object") {
    for (const [k, v] of Object.entries(daysObjOrArr)) {
      let key = k;
      // key might be a date string → convert to weekday
      const wk = dayFromDate(k);
      if (wk) key = wk;
      key = mapShort[key] || title(String(key));
      out[key] = v;
    }
  }
  return out;
}


// 🔹 Coerce any stored time shape → minutes since midnight
function toMinutes(val) {
  if (!val) return null;

  // Firestore Timestamp
  if (typeof val?.toDate === "function") {
    const d = val.toDate();
    return d.getHours() * 60 + d.getMinutes();
  }
  if (typeof val === "object" && typeof val.seconds === "number") {
    const d = new Date(val.seconds * 1000);
    return d.getHours() * 60 + d.getMinutes();
  }

  // JS Date
  if (val instanceof Date) return val.getHours() * 60 + val.getMinutes();

  // Numbers: treat <=1440 as minutes; otherwise try epoch
  if (typeof val === "number") {
    if (val <= 1440) return Math.round(val);
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
    return null;
  }

  // Strings
  if (typeof val === "string") {
    const s = val.trim();
    // HH:mm
    let m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    // 8 or 8.5 hours
    const f = parseFloat(s);
    if (!Number.isNaN(f)) return Math.round(f * 60);
  }
  return null;
}

// 🔹 Hours difference (supports overnight)
function calculateHours(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return 0;
  let diff = (e - s) / 60;
  if (diff < 0) diff += 24;
  return Math.max(diff, 0);
}

// Overlap of [start,end] with a window [wStart,wEnd] in hours (handles overnight)
function clampToWindowHours(start, end, wStart, wEnd) {
  const s  = toMinutes(start);
  const e  = toMinutes(end);
  const ws = toMinutes(wStart);
  const we = toMinutes(wEnd);
  if ([s, e, ws, we].some(v => v == null)) return 0;

  // Normalize ranges so end >= start (add 24h when needed)
  let s1 = s, e1 = e;   if (e1  < s1)  e1  += 1440;
  let ws1 = ws, we1 = we; if (we1 < ws1) we1 += 1440;

  // Shift window forward/back to be near the travel interval
  while (we1 < s1) { ws1 += 1440; we1 += 1440; }
  while (ws1 > e1) { ws1 -= 1440; we1 -= 1440; }

  const overlapStart = Math.max(s1, ws1);
  const overlapEnd   = Math.min(e1, we1);
  return Math.max(0, (overlapEnd - overlapStart) / 60);
}

// Paid travel to set = at most the 60 minutes before call
function calcPaidTravelTo(leave, arrive, call) {
  const callMin = toMinutes(call);
  if (callMin == null) return calculateHours(leave, arrive); // no call → fallback
  const preStartMin = (callMin - 60 + 1440) % 1440;          // call - 60 mins (wrap overnight)
  return clampToWindowHours(leave, arrive, preStartMin, callMin);
}



export default function TimesheetDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [timesheet, setTimesheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingById, setBookingById] = useState({});
const [bookingByJobNumber, setBookingByJobNumber] = useState({});
const [jobsByDay, setJobsByDay] = useState({});




useEffect(() => {
  if (!id) return;

  const fetchTimesheet = async () => {
    try {
      // 1) Try direct doc: timesheets/{id}
      const tsRef = doc(db, "timesheets", id);
      const tsSnap = await getDoc(tsRef);
      if (tsSnap.exists()) {
        setTimesheet({ id: tsSnap.id, ...tsSnap.data() });
        return;
      }

      // 2) If {id} looks like YYYY-MM-DD → query by weekStart
      const isWeekDate = /^\d{4}-\d{2}-\d{2}$/.test(id);
      if (isWeekDate) {
        const q1 = query(collection(db, "timesheets"), where("weekStart", "==", id));
        const qs1 = await getDocs(q1);
        const list = qs1.docs.map(d => ({ id: d.id, ...d.data() }));

        if (list.length === 1) {
          setTimesheet(list[0]);
          return;
        }
        if (list.length > 1) {
          // Prefer submitted, else most recently updated
          const pick = list
            .map(t => ({
              t,
              score:
                (t.submitted ? 1 : 0) * 1e13 +
                (parseDateFlexible(t.updatedAt)?.getTime() ??
                 parseDateFlexible(t.createdAt)?.getTime() ??
                 parseDateFlexible(t.weekStart)?.getTime() ?? 0),
            }))
            .sort((a,b) => b.score - a.score)[0]?.t;
          if (pick) {
            setTimesheet(pick);
            return;
          }
        }
      }

      // 3) If {id} is a booking id, check subcollection bookings/{id}/timesheets
      const bookingDoc = await getDoc(doc(db, "bookings", id));
      if (bookingDoc.exists()) {
        const sub = await getDocs(collection(db, "bookings", id, "timesheets"));
        const list = sub.docs.map(d => ({ id: d.id, ...d.data() }));
        if (list.length) {
          const pick = list
            .map(t => ({
              t,
              score:
                (t.submitted ? 1 : 0) * 1e13 +
                (parseDateFlexible(t.updatedAt)?.getTime() ??
                 parseDateFlexible(t.createdAt)?.getTime() ??
                 parseDateFlexible(t.weekStart)?.getTime() ?? 0),
            }))
            .sort((a,b) => b.score - a.score)[0].t;
          setTimesheet(pick);
          return;
        }
      }

      // 4) Not found
      setTimesheet(null);
    } catch (e) {
      console.error("Error loading timesheet:", e);
      setTimesheet(null);
    } finally {
      setLoading(false);
    }
  };

  fetchTimesheet();
}, [id]);

useEffect(() => {
  if (!timesheet) return;

  const employeeCode = timesheet.employeeCode || timesheet.employee?.userCode || null;
  const employeeName = timesheet.employeeName || timesheet.employee?.name || null;
  const weekDates = getWeekDatesFromWeekStart(timesheet.weekStart);

  // init map
  const jobMap = { Monday:[], Tuesday:[], Wednesday:[], Thursday:[], Friday:[], Saturday:[], Sunday:[] };

  (async () => {
    try {
      // Load employees so we can resolve name → userCode if bookings only store names
      const empSnap = await getDocs(collection(db, "employees"));
      const allEmployees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const nameToCode = new Map();
      allEmployees.forEach(e => {
        if (e?.name) nameToCode.set(String(e.name).trim(), e.userCode || e.code || null);
      });

      // Load bookings
      const jobSnap = await getDocs(collection(db, "bookings"));
      const allJobs = jobSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Map jobs → days for this employee
      allJobs.forEach(job => {
        const empArr = Array.isArray(job.employees) ? job.employees : [];
        // normalise codes on booking record
        const jobCodes = empArr.map(e => {
          if (e?.userCode) return String(e.userCode).trim();
          if (e?.code)     return String(e.code).trim();
          if (e?.name && nameToCode.has(String(e.name).trim())) return String(nameToCode.get(String(e.name).trim()));
          return null;
        }).filter(Boolean);

        const matchesEmployee =
          (employeeCode && jobCodes.includes(String(employeeCode).trim())) ||
          (!employeeCode && employeeName && empArr.some(e => String(e?.name||"").trim() === String(employeeName).trim()));

        if (!matchesEmployee) return;

        const dates = Array.isArray(job.bookingDates) ? job.bookingDates : [];
        dates.forEach(dateStr => {
          const iso = String(dateStr).slice(0,10);
          if (weekDates.includes(iso)) {
            const dn = dayNameFromISO(iso);
            if (jobMap[dn]) jobMap[dn].push(job);
          }
        });
      });

      setJobsByDay(jobMap);
    } catch (err) {
      console.error("Error building jobsByDay:", err);
      setJobsByDay({});
    }
  })();
}, [timesheet, db]);


function isoDateOnly(d) {
  if (!(d instanceof Date)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function getWeekDatesFromWeekStart(weekStartLike) {
  const d0 = parseDateFlexible(weekStartLike);
  if (!d0) return [];
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(d0);
    d.setDate(d0.getDate() + i);
    out.push(isoDateOnly(d));
  }
  return out;
}
function dayNameFromISO(iso) {
  const d = new Date(iso + "T12:00:00"); // noon avoids TZ issues
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
}


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
  {parseDateFlexible(timesheet.weekStart)?.toLocaleDateString("en-GB") ?? "—"}
</strong>

        </p>

{/* Days */}
<div style={{ display: "grid", gap: 16 }}>
{(() => {
  const dayMap = normaliseDays(timesheet.days, timesheet.weekStart);

  return days.map((day) => {
    const entry = dayMap?.[day];
    const isWeekend = day === "Saturday" || day === "Sunday";

    // If there's no entry at all:
    if (!entry) {
      if (isWeekend) {
        return (
          <div key={day} style={{ background: "#f0f0f0", padding: 20, borderRadius: 10 }}>
            <h3 style={{ margin: 0 }}>{day}</h3>
            <p style={{ margin: 0, color: "#666" }}>Day Off</p>
          </div>
        );
      }
      return null; // weekdays with no entry → render nothing
    }

    // Derive fields (support multiple shapes)
    const leaveTime   = entry.leaveTime  ?? entry.leave ?? entry.start ?? null;
    const arriveTime  = entry.arriveTime ?? entry.arrive ?? entry.end   ?? null;
    const arriveBack  = entry.arriveBack ?? entry.back   ?? null;
    const callTime    = entry.callTime   ?? entry.call   ?? null;
    const wrapTime    = entry.wrapTime   ?? entry.wrap   ?? null;

    // Normalise mode ("yard" | "travel" | "onset" | "off" | "holiday")
    const modeRaw = String(entry.mode ?? entry.type ?? "").toLowerCase().trim();
let mode = modeRaw;

// If there are NO jobs for this weekday, default render to Yard (weekday only)
const hasJobsToday = Array.isArray(jobsByDay?.[day]) && jobsByDay[day].length > 0;
const isWeekendDay = day === "Saturday" || day === "Sunday";
if (!hasJobsToday && !isWeekendDay && mode !== "holiday" && mode !== "off") {
  mode = "yard";
}

    const hoursNum      = typeof entry.hours === "number" ? entry.hours : parseFloat(entry.hours);
    const hoursPositive = Number.isFinite(hoursNum) && hoursNum > 0;
    const timesPresent  = !!(leaveTime || arriveTime || arriveBack || callTime || wrapTime);

    const explicitWorkMode =
      ["travel", "onset", "set"].includes(modeRaw) ||
      (modeRaw === "yard" && (timesPresent || hoursPositive)) ||
      entry.worked === true;

    if (isWeekend && !explicitWorkMode && modeRaw !== "holiday" && modeRaw !== "off") {
      mode = "off";
    }

    // Hours calc
    let segTravelToHrs = 0, segOnSetHrs = 0, segTravelBackHrs = 0;
    let hoursWorked = 0;

if (mode === "yard") {
  // Respect Off (Unpaid) on Yard days → counts as 0h
  if (entry.offUnpaid === true) {
    hoursWorked = 0;
  } else {
    // Normal Yard day: apply 30-min lunch deduction if there's any time
    hoursWorked = calculateHours(leaveTime, arriveBack ?? arriveTime);
    if (hoursWorked > 0) {
      hoursWorked = Math.max(0, hoursWorked - LUNCH_DEDUCT_HRS);
    }
  }
} else if (mode === "travel") {

      hoursWorked = calculateHours(leaveTime, arriveTime);
    } else if (mode === "onset") {
      segTravelToHrs   = (leaveTime && arriveTime)  ? calculateHours(leaveTime, arriveTime) : 0;
      segOnSetHrs      = (callTime  && wrapTime)    ? calculateHours(callTime,  wrapTime)   : 0;
      segTravelBackHrs = (wrapTime  && arriveBack)  ? calculateHours(wrapTime,  arriveBack) : 0;

      hoursWorked = segTravelToHrs + segOnSetHrs + segTravelBackHrs;

      if (hoursWorked === 0) {
        if (leaveTime && arriveBack) hoursWorked = calculateHours(leaveTime, arriveBack);
        else if (leaveTime && arriveTime) hoursWorked = calculateHours(leaveTime, arriveTime);
      }
    }

    if (hoursWorked === 0 && Number.isFinite(hoursNum)) {
      hoursWorked = hoursNum;
    }

    totalHours += hoursWorked;

    // ---------- Resolve booking for this day ----------
    const dayBookingId =
      entry?.bookingId ??
      entry?.jobId ??
      timesheet.bookingId ??
      null;

    const dayJobNumberRaw =
      entry?.jobNumber ??
      entry?.jobNo ??
      entry?.job ??
      timesheet.jobNumber ??
      null;

    const dayJobNumber = dayJobNumberRaw ? String(dayJobNumberRaw).trim() : null;

    const booking =
      (dayBookingId && bookingById[dayBookingId]) ||
      (dayJobNumber && bookingByJobNumber[dayJobNumber]) ||
      null;
    // --------------------------------------------------

    // Render OFF / HOLIDAY first
    if (mode === "holiday") {
      return (
        <div key={day} style={{ background: "#fff3cd", padding: 20, borderRadius: 10 }}>
          <h3 style={{ margin: 0 }}>{day}</h3>
          <p style={{ margin: 0, color: "#856404" }}>🌴 Holiday</p>
        </div>
      );
    }
    if (mode === "off") {
      return (
        <div key={day} style={{ background: "#f0f0f0", padding: 20, borderRadius: 10 }}>
          <h3 style={{ margin: 0 }}>{day}</h3>
          <p style={{ margin: 0, color: "#666" }}>Day Off</p>
        </div>
      );
    }

    // Otherwise render the job day
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{day}</h3>
          {hoursWorked > 0 && (
            <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "4px 10px", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
              ⏱ {hoursWorked.toFixed(1)} hrs
            </span>
          )}
        </div>

     {/* Jobs for this day (if any). If none → we'll default to Yard below */}
{Array.isArray(jobsByDay?.[day]) && jobsByDay[day].length > 0 && (
  <div style={{ margin: "6px 0 10px 0", display: "grid", gap: 6 }}>
    {jobsByDay[day].map((job) => (
      <div
        key={job.id}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8
        }}
      >
        <span style={{ fontWeight: 700 }}>
          📌 {job.jobNumber || job.id}
        </span>
        {job.client && <span>• {job.client}</span>}
        {job.location && <span>• {job.location}</span>}
        <button
          onClick={(e) => {
            e.preventDefault();
            router.push(`/view-booking/${job.id}`); // adjust if your route differs
          }}
          style={{
            marginLeft: "auto",
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12
          }}
        >
          View booking
        </button>
      </div>
    ))}
  </div>
)}


{mode === "yard" ? (
  entry.offUnpaid ? (
    <p style={{ margin: 0, color: "#666" }}>
      <strong>Yard Day:</strong> Off (Unpaid)
    </p>
  ) : (
    <p style={{ margin: 0, color: "#333" }}>
      <strong>Yard Day:</strong> {(leaveTime ?? "—")} → {(arriveBack ?? arriveTime ?? "—")}
      {" "}
      <em style={{ color: "#888" }}>(−0.5h lunch)</em>
    </p>
  )
) : mode === "travel" ? (

          <p style={{ margin: 0, color: "#333" }}>
            <strong>Travel Day:</strong> Leave {(leaveTime ?? "—")} → Arrive {(arriveTime ?? "—")}
          </p>
        ) : mode === "onset" ? (
          <div style={{ fontSize: 14, color: "#333" }}>
            <strong>On Set</strong>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              {leaveTime  && <li>Leave: {leaveTime}</li>}
              {arriveTime && <li>Arrive: {arriveTime}</li>}
              {callTime   && <li>Call: {callTime}</li>}
              {wrapTime   && <li>Wrap: {wrapTime}</li>}
              {arriveBack && <li>Back: {arriveBack}</li>}
              {entry.overnight && <li>Overnight stay</li>}
              {entry.lunchSup && <li>Lunch supplied</li>}
            </ul>

            <div style={{ marginTop: 6, lineHeight: 1.6 }}>
              {segTravelToHrs > 0 && (
                <div>🚐 Travel to set: {segTravelToHrs.toFixed(1)} hrs ({leaveTime} → {arriveTime})</div>
              )}
              {segOnSetHrs > 0 && (
                <div>🎬 On set: {segOnSetHrs.toFixed(1)} hrs ({callTime} → {wrapTime})</div>
              )}
              {segTravelBackHrs > 0 && (
                <div>🚐 Travel back: {segTravelBackHrs.toFixed(1)} hrs ({wrapTime} → {arriveBack})</div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: "#888", margin: 0 }}>—</p>
        )}

        {entry.dayNotes && (
          <p style={{ marginTop: 10, fontSize: 14, color: "#555", fontStyle: "italic" }}>
            📝 {entry.dayNotes}
          </p>
        )}
      </div>
    );
  });
})()}
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
