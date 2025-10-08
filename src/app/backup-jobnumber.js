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
  orderBy,
 limit,
  Timestamp,
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



// Accept DD/MM/YYYY, YYYY-MM-DD, Date, Timestamp, epoch, etc.
const parseDateFlexible = (raw) => {
  if (!raw) return null;
  if (typeof raw?.toDate === "function") return raw.toDate();
  if (typeof raw === "object" && raw !== null && typeof raw.seconds === "number")
    return new Date(raw.seconds * 1000);
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0);
    m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12, 0, 0, 0);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "number") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// Normalise a timesheet.days shape into an object keyed by Monday..Sunday
const normaliseDays = (daysObjOrArr, baseWeekStart) => {
  const out = {};
  const title = (x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  const mapShort = { Mon:"Monday", Tue:"Tuesday", Wed:"Wednesday", Thu:"Thursday", Fri:"Friday", Sat:"Saturday", Sun:"Sunday" };
  const dayFromDate = (dLike) => {
    const d = parseDateFlexible(dLike);
    return d ? d.toLocaleDateString("en-GB", { weekday: "long" }) : null;
  };

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
      const wk = dayFromDate(k); // if key looks like a date, turn it into weekday
      if (wk) key = wk;
      key = mapShort[key] || title(String(key));
      out[key] = v;
    }
  }
  return out;
};

// Robust date parser used elsewhere in the page
const parseDate = (raw) => {
  if (!raw) return null;
  if (typeof raw?.toDate === "function") {
    const d = raw.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && raw !== null && typeof raw.seconds === "number") {
    const d = new Date(raw.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;

  if (typeof raw === "number") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [_, y, mo, d] = m;
      const nd = new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0);
      return isNaN(nd.getTime()) ? null : nd;
    }
    m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (m) {
      const [_, d, mo, y] = m;
      const nd = new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0);
      return isNaN(nd.getTime()) ? null : nd;
    }
    const d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2;
  }
  return null;
};






// ✅ Find the most-recent meaningful date on the job
// ✅ Most-recent scheduled date (ignores metadata like updatedAt)
const latestScheduledDateOfJob = (job) => {
  const candidates = [];
  const add = (v) => { const d = parseDate(v); if (d) candidates.push(d.getTime()); };

  // bookingDates can be array of strings/Timestamps or array of objects: { date: "..." }
  if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
    job.bookingDates.forEach((x) => add((x && typeof x === "object" && "date" in x) ? x.date : x));
  } else if (job.date) {
    add(job.date);
  }

  // common single-date fields
  ["startDate","endDate","start","end"].forEach((k) => add(job[k]));

  if (!candidates.length) return null;

  const ms = Math.max(...candidates);
  const d = new Date(ms);
  d.setMilliseconds(0);
  return d;
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

// Returns an array of Date objects representing every scheduled day on the job
const datesForJob = (job) => {
  const out = [];

  const add = (raw) => {
    if (!raw) return;
    // support object shape {date: "..."} and various timestamp/ISO formats
    const v = (raw && typeof raw === "object" && "date" in raw) ? raw.date : raw;
    const d = parseDate(v);
    if (d) out.push(d);
  };

  if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
    job.bookingDates.forEach(add);
  } else if (job.startDate || job.endDate || job.date) {
    const s = parseDate(job.startDate || job.date);
    const e = parseDate(job.endDate || job.date);
    if (s && e) {
      const cur = new Date(s); cur.setHours(0,0,0,0);
      const last = new Date(e); last.setHours(0,0,0,0);
      while (cur <= last) {
        out.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
    } else if (s) {
      out.push(s);
    }
  }

  return out;
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


// --- Timesheet matching helpers ---

// All ISO yyyy-mm-dd dates this job covers
const getJobIsoDates = (job) => {
  const out = new Set();

  if (Array.isArray(job.bookingDates) && job.bookingDates.length) {
    job.bookingDates.forEach((raw) => {
      const d = parseDate((raw && typeof raw === "object" && "date" in raw) ? raw.date : raw);
      if (d) out.add(toYMD(d));
    });
  } else {
    const s = parseDate(job.startDate || job.date);
    const e = parseDate(job.endDate || job.date);
    if (s && e) {
      const cur = new Date(s); cur.setHours(0,0,0,0);
      const last = new Date(e); last.setHours(0,0,0,0);
      while (cur <= last) { out.add(toYMD(cur)); cur.setDate(cur.getDate() + 1); }
    } else if (s) {
      out.add(toYMD(s));
    }
  }

  return out;
};

// 7 ISO dates from a given weekStart (Monday ISO like "2025-10-06")
const weekDatesFrom = (weekStart) => {
  const ws = parseDateFlexible(weekStart); // ← handles string | Date | Timestamp
  if (!ws) return [];
  const start = new Date(ws); start.setHours(0,0,0,0);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(toYMD(d));
  }
  return out;
};

// Pull employee codes from a job doc (supports strings/objects)
const employeeCodesFromJob = (job) => {
  const out = new Set();
  const list = Array.isArray(job.employees) ? job.employees : (job.employees ? [job.employees] : []);
  for (const e of list) {
    if (!e) continue;
    if (typeof e === "object") {
      if (e.userCode) out.add(String(e.userCode));
      else if (e.code) out.add(String(e.code));
      else if (e.id && /^\w{3,}$/.test(String(e.id))) out.add(String(e.id)); // fallback
    }
  }
  return Array.from(out);
};

// Build timesheet doc ID like "EMP123_2025-10-06"
const timesheetDocId = (employeeCode, weekStart) => `${employeeCode}_${weekStart}`;



// Flatten employees into searchable tokens
const employeeTokens = (employees) => {
  const tokens = [];
  if (Array.isArray(employees)) {
    employees.forEach((emp) => {
      if (typeof emp === "string") tokens.push(emp.toLowerCase());
      else if (emp && typeof emp === "object") {
        if (emp.name) tokens.push(emp.name.toLowerCase());
        const fl = [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim();
        if (fl) tokens.push(fl.toLowerCase());
        if (emp.displayName) tokens.push(emp.displayName.toLowerCase());
        if (emp.email) tokens.push(emp.email.toLowerCase());
        if (emp.id != null) tokens.push(String(emp.id).toLowerCase());
      }
    });
  } else if (typeof employees === "string") {
    tokens.push(employees.toLowerCase());
  }
  return Array.from(new Set(tokens));
};

// Loose text match for job number e.g. "BA-0123" vs "BA0123"
const mentionsJobNumber = (text, jobNum) => {
  if (!text || !jobNum) return false;
  const t = String(text).toLowerCase();
  const j = String(jobNum).toLowerCase();
  return t.includes(j) || t.replace(/[^a-z0-9]/g, "").includes(j.replace(/[^a-z0-9]/g, ""));
};

// Score a timesheet for how confidently it belongs to this job
const scoreTimesheetForJob = (ts, job) => {
  let score = 0;
  const jobNum = job.jobNumber || job.id;

  // 1) Direct links (very strong)
  if (ts.jobId && ts.jobId === job.id) score += 100;
  if (ts.jobNumber && String(ts.jobNumber) === String(jobNum)) score += 90;
  if (Array.isArray(ts.jobs)) {
    if (ts.jobs.some(
      j => j === job.id || j === jobNum || j?.jobId === job.id || j?.jobNumber === jobNum
    )) score += 80;
  }

  // 2) Date overlap within the week (moderate)
  const jobDays = getJobIsoDates(job);
  const weekDays = weekDatesFrom(ts.weekStart);
  const overlap = weekDays.filter((d) => jobDays.has(d)).length;
  score += Math.min(overlap * 8, 40); // up to +40

  // 3) Employee match (useful tie-breaker)
  const jobEmp = employeeTokens(job.employees);
  const tsEmp = (ts.employeeCode || ts.employeeName || ts.employeeEmail || "").toString().toLowerCase();
  if (tsEmp && jobEmp.some(tok => tsEmp.includes(tok))) score += 25;

  // 4) Mentions of job number in notes
  if (ts.notes && mentionsJobNumber(ts.notes, jobNum)) score += 10;
  if (ts.days) {
    for (const k of Object.keys(ts.days)) {
      const cell = ts.days[k];
      if (cell?.dayNotes && mentionsJobNumber(cell.dayNotes, jobNum)) { score += 5; break; }
    }
  }

  return score;
};


  const renderDateBlock = (job) => {
    const dates = datesForJob(job);
    if (!dates.length) return <div style={{ color: "#999" }}>TBC</div>;

    return (
      <div style={{ display: "grid", gap: 6 }}>
{[...dates].sort((a, b) => (parseDate(b)?.getTime() ?? 0) - (parseDate(a)?.getTime() ?? 0)).map((d, i) => {
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

  // Unique ISO weekStart (YYYY-MM-DD, Monday) values derived from all job dates
const jobWeeksFromJobDates = (job) => {
  const weeks = new Set();
  datesForJob(job).forEach((d) => {
    const ws = weekStartOf(d);
    if (ws) weeks.add(ws);
  });
  return Array.from(weeks);
};


const renderTimesheet = (ts, job) => {
  const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

  // Build ISO date for each weekday of this timesheet’s week
  const weekStartDate = parseDateFlexible(ts.weekStart);
  const weekIsoByDay = {};
  if (weekStartDate) {
    const monday = new Date(weekStartDate);
    monday.setHours(0,0,0,0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekIsoByDay[dayOrder[i]] = d.toISOString().slice(0,10);
    }
  }

  // All ISO job dates for this job
  const jobDates = getJobIsoDates(job);

  // 🔑 Normalise any timesheet.days shape to Monday..Sunday
  const dayMap = normaliseDays(ts?.days, ts?.weekStart);

  // Helper: small badge
  const Badge = ({ text, bg="#eef2ff", fg="#1f2937", border="#c7d2fe" }) => (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      background: bg,
      color: fg,
      border: `1px solid ${border}`,
      marginLeft: 6
    }}>{text}</span>
  );

  const lineFor = (entry) => {
    const leave   = entry?.leaveTime  ?? entry?.leave ?? entry?.start ?? null;
    const arrive  = entry?.arriveTime ?? entry?.arrive ?? entry?.end   ?? null;
    const back    = entry?.arriveBack ?? entry?.back   ?? null;
    const call    = entry?.callTime   ?? entry?.call   ?? null;
    const wrap    = entry?.wrapTime   ?? entry?.wrap   ?? null;

    const rawMode = String(entry?.mode ?? entry?.type ?? "").toLowerCase();
    if (rawMode === "holiday") return "Holiday";
    if (rawMode === "off")     return "Day Off";

    if (rawMode === "travel")  return `Travel: ${leave ?? "—"} → ${arrive ?? "—"}`;
    if (rawMode === "onset" || rawMode === "set") {
      const bits = [];
      if (leave && arrive) bits.push(`Leave ${leave} → Arrive ${arrive}`);
      if (call && wrap)   bits.push(`Call ${call} → Wrap ${wrap}`);
      if (wrap && back)   bits.push(`Back ${wrap} → ${back}`);
      return bits.join(" • ") || "On set";
    }
    // default Yard/Other
    if (leave || arrive || back) return `Hours: ${leave ?? "—"} → ${back ?? arrive ?? "—"}`;
    return "—";
  };

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
      {/* header */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
        <div><strong>Week start:</strong> {ts.weekStart || "—"}</div>
        {ts.employeeName && <div><strong>Employee:</strong> {ts.employeeName}</div>}
        {!ts.employeeName && ts.employeeCode && <div><strong>Employee:</strong> {ts.employeeCode}</div>}
        <div><strong>Submitted:</strong> {ts.submitted ? "Yes" : "No"}</div>

        {/* quick summary of how many job days this week */}
        {weekStartDate && (
          (() => {
            const n = dayOrder.reduce((acc, d) => acc + (jobDates.has(weekIsoByDay[d]) ? 1 : 0), 0);
            return <Badge text={`${n} day${n===1?"":"s"} on this job`} />;
          })()
        )}

        {/* open full timesheet (adjust route if different) */}
        <button
          onClick={() => {
            const pathById = `/timesheet/${ts.id}`;
            const pathByWeek = `/timesheet/${encodeURIComponent(ts.weekStart)}`;
            window.location.href = ts.id ? pathById : pathByWeek;
          }}
          style={{
            marginLeft: "auto",
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Open timesheet
        </button>
      </div>

      {/* table */}
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
                const entry = dayMap?.[d] || {};
                const iso = weekIsoByDay[d];
                const isJobDay = iso ? jobDates.has(iso) : false;

                // choose badge
                let badge = null;
                const mode = String(entry?.mode ?? entry?.type ?? "").toLowerCase();
                if (isJobDay) {
                  badge = <Badge text={`Job ${job.jobNumber || job.id}`} bg="#dcfce7" fg="#166534" border="#86efac" />;
                } else if (mode === "off") {
                  badge = <Badge text="Off" bg="#f3f4f6" fg="#374151" border="#e5e7eb" />;
                } else if (mode === "holiday") {
                  badge = <Badge text="Holiday" bg="#fef9c3" fg="#7a5d00" border="#fde68a" />;
                } else {
                  badge = <Badge text="Yard" bg="#e0f2fe" fg="#0369a1" border="#bae6fd" />;
                }

                return (
                  <td key={d} style={{ verticalAlign: "top", padding: "8px 6px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontSize: 12, color: "#374151" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong>{(entry.mode || entry.type || "—")}</strong>
                        {badge}
                      </div>

                      {/* succinct times/summary line */}
                      <div style={{ marginTop: 4, color: "#374151" }}>
                        {lineFor(entry)}
                      </div>

                      {/* optional: notes */}
                      {entry.dayNotes ? (
                        <div style={{ marginTop: 4, whiteSpace: "pre-wrap", color: "#6b7280" }}>
                          {entry.dayNotes}
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
          <strong>Timesheet Notes:</strong>{" "}
          <span style={{ whiteSpace: "pre-wrap" }}>{ts.notes}</span>
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

const matches = allJobs
  .filter((j) => {
    const { prefix: otherPrefix } = splitJobNumber(j.jobNumber || j.id);
    return otherPrefix === prefix;
  })
  .sort((a, b) => {
const A = latestScheduledDateOfJob(a)?.getTime() ?? -Infinity;
const B = latestScheduledDateOfJob(b)?.getTime() ?? -Infinity;

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
  const jobNumStr = String(job.jobNumber ?? job.id);

  // All ISO dates the job actually spans (YYYY-MM-DD)
  const jobIsoDates = Array.from(getJobIsoDates(job)); // you already have getJobIsoDates
  const jobWeeks = new Set(jobIsoDates.map((d) => weekStartOf(d))); // you already have weekStartOf

  const found = [];

  // Helper to push getDocs() results
  const pushSnap = (snap, source) => {
    snap.forEach((d) => found.push({ id: d.id, ...d.data(), __source: source }));
  };

  // ---------- A) FAST PATH: indexed lookup by bookingId ----------
  try {
    const top = collection(db, "timesheets");
    const q1 = query(top, where("jobSnapshot.bookingIds", "array-contains", jobId));
    const res1 = await getDocs(q1);
    pushSnap(res1, "index:bookingIds");
  } catch (e) {
    console.warn("bookingIds index lookup failed (create index once):", e?.message || e);
  }

  // ---------- B) EXACT DOC READS: employee × job-date ----------
  // If employees are on the job, read their week docs directly
  try {
    const empCodes = employeeCodesFromJob(job); // helper above
    const uniquePairs = new Set();
    empCodes.forEach((code) => {
      jobIsoDates.forEach((iso) => {
        const wk = weekStartOf(iso);
        if (wk) uniquePairs.add(`${code}__${wk}`);
      });
    });

    const reads = Array.from(uniquePairs).map(async (key) => {
      const [code, wk] = key.split("__");
      const ref = doc(db, "timesheets", timesheetDocId(code, wk));
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const t = snap.data();
        found.push({ id: snap.id, ...t, __source: "direct:docId" });
      }
    });

    await Promise.allSettled(reads);
  } catch (e) {
    console.error("direct docId reads failed:", e);
  }

  // ---------- C) (Optional) direct fields equal lookups ----------
  try {
    const top = collection(db, "timesheets");
    const tasks = [
      getDocs(query(top, where("jobId", "==", jobId))),
      getDocs(query(top, where("bookingId", "==", jobId))),
      getDocs(query(top, where("jobNumber", "==", jobNumStr))),
    ];
    const jobNumNum = Number(jobNumStr);
    if (!Number.isNaN(jobNumNum)) {
      tasks.push(getDocs(query(top, where("jobNumber", "==", jobNumNum))));
    }
    const results = await Promise.allSettled(tasks);
    results.forEach((r, i) => {
      if (r.status === "fulfilled") pushSnap(r.value, `fields#${i}`);
    });
  } catch (e) {
    console.error("field equality lookups failed:", e);
  }

  // ---------- D) Dedup ----------
  const dedup = Object.values(
    found.reduce((acc, t) => {
      if (!t?.id) return acc;
      if (!acc[t.id]) acc[t.id] = t;
      return acc;
    }, {})
  );

  // Pull employee codes from a job doc (supports strings/objects)
const employeeCodesFromJob = (job) => {
  const out = new Set();
  const list = Array.isArray(job.employees) ? job.employees : (job.employees ? [job.employees] : []);
  for (const e of list) {
    if (!e) continue;
    if (typeof e === "object") {
      if (e.userCode) out.add(String(e.userCode));
      else if (e.code) out.add(String(e.code));
      else if (e.id && /^\w{3,}$/.test(String(e.id))) out.add(String(e.id)); // fallback
    }
  }
  return Array.from(out);
};

// Build timesheet doc ID like "EMP123_2025-10-06"
const timesheetDocId = (employeeCode, weekStart) => `${employeeCode}_${weekStart}`;


  // ---------- E) Keep only relevant weeks OR direct links ----------
  const tsWeekKey = (t) => {
    const d =
      parseDateFlexible(t.weekStart) ??
      parseDateFlexible(t.week_start) ??
      parseDateFlexible(t.startOfWeek);
    return d ? weekStartOf(d) : null;
  };

  const hasDirectLink = (t) => {
    if (t.jobId === jobId || t.bookingId === jobId) return true;
    if (t.jobNumber != null && String(t.jobNumber) === jobNumStr) return true;
    if (Array.isArray(t.jobs)) {
      return t.jobs.some(
        (j) =>
          j === jobId ||
          j === jobNumStr ||
          j?.jobId === jobId ||
          String(j?.jobNumber) === jobNumStr
      );
    }
    // also accept our denormalised per-day imprint
    const dmap = normaliseDays(t?.days, t?.weekStart);
    return Object.values(dmap || {}).some((d) => {
      const bid = d?.bookingId ?? d?.jobId;
      const jn  = d?.jobNumber ?? d?.jobNo ?? d?.job;
      return (bid && String(bid) === String(jobId)) || (jn && String(jn) === jobNumStr);
    });
  };

  const scored = dedup
    .map((t) => ({
      ...t,
      __wk: tsWeekKey(t),
      __direct: hasDirectLink(t),
      __submittedFlag: t.submitted === true || t.status === "Submitted" || !!t.submittedAt,
      __score: scoreTimesheetForJob(t, job), // you already have this
    }))
    .filter((t) => t.__direct || (t.__wk && jobWeeks.has(t.__wk))) // keep only relevant
    .sort((a, b) => {
      if (a.__direct !== b.__direct) return b.__direct ? 1 : -1; // direct first
      if (a.__submittedFlag !== b.__submittedFlag) return b.__submittedFlag ? 1 : -1;
      if (b.__score !== a.__score) return b.__score - a.__score;
      const ad =
        parseDateFlexible(a.weekStart) ??
        parseDateFlexible(a.week_start) ??
        parseDateFlexible(a.startOfWeek) ??
        new Date(0);
      const bd =
        parseDateFlexible(b.weekStart) ??
        parseDateFlexible(b.week_start) ??
        parseDateFlexible(b.startOfWeek) ??
        new Date(0);
      return bd.getTime() - ad.getTime();
    });

  // Keep it tidy
  const finalList = scored.slice(0, 5);

  setTimesheetsByJob((prev) => ({ ...prev, [jobId]: finalList }));
};




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

{/* Block 4: Timesheets */}
<div
  style={{
    flex: "1",
    backgroundColor: "#ffffff",
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    minWidth: "300px",
  }}
>
  <h4 style={{ marginTop: 0 }}>
    Timesheets
    <span style={{ marginLeft: 8, fontWeight: 500, color: "#6b7280" }}>
      {(timesheetsByJob[job.id]?.length || 0)} found
    </span>
  </h4>

  {(() => {
const toTime = (v) => {
  const d = parseDateFlexible(v) || parseDate(v) || new Date(0);
  return d.getTime();
};

const list = (timesheetsByJob[job.id] || [])
  .slice()
  .sort((a, b) => toTime(b.weekStart) - toTime(a.weekStart)); // ✅ numeric diff

    if (!list.length) {
      return (
        <div style={{ color: "#6b7280" }}>
          No timesheets found for this job yet.
        </div>
      );
    }

return list.map((ts) => (
  <div key={ts.id} style={{ marginBottom: 12 }}>
    {renderTimesheet(ts, job)}
  </div>
));

  })()}
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
