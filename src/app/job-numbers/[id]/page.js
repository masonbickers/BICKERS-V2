"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  arrayUnion,
} from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "../../components/HeaderSidebarLayout";
import { format, parseISO } from "date-fns";

/* ────────────────────────────────────────────────────────────
   Design tokens + layout
─────────────────────────────────────────────────────────────*/
const UI = {
  radius: 12,
  radiusSm: 10,
  border: "1px solid #e5e7eb",
  text: "#0f172a",
  muted: "#6b7280",
  bg: "#ffffff",
  bgAlt: "#f9fafb",
  brand: "#2563eb",
  chipBg: "#f1f5f9",
  shadow: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
};

const LAYOUT = {
  HEADER_H: 64,
  PAGE_PAD_X: 16,
  STICKY_GAP: 12,
};

const mono = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

/* ────────────────────────────────────────────────────────────
   Helpers (UNCHANGED LOGIC)
─────────────────────────────────────────────────────────────*/
const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const parseDateFlexible = (dateStr) => {
  try {
    if (!dateStr) return null;
    if (typeof dateStr === "string" && dateStr.length === 10) return parseISO(dateStr); // YYYY-MM-DD
    return new Date(dateStr);
  } catch {
    return null;
  }
};

const splitJobNumber = (jobNumber) => {
  if (typeof jobNumber === "string") {
    const parts = jobNumber.split("-");
    if (parts.length > 1) return { prefix: parts.slice(0, -1).join("-"), suffix: parts.at(-1) };
  }
  return { prefix: jobNumber || "Job", suffix: "" };
};

const renderEmployees = (employees) =>
  Array.isArray(employees) && employees.length
    ? employees
        .map((e) => e.name || e.displayName || e.email || "")
        .filter(Boolean)
        .join(", ")
    : null;

const renderDateBlock = (job) => {
  if (!Array.isArray(job.bookingDates) || job.bookingDates.length === 0) return "No dates scheduled.";
  const sorted = job.bookingDates
    .map((d) => parseDateFlexible(d))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!sorted.length) return "No valid dates.";
  const first = format(sorted[0], "dd/MM/yyyy");
  const last = format(sorted.at(-1), "dd/MM/yyyy");
  return first === last ? first : `${first} to ${last} (${sorted.length} days)`;
};

const minutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const minutesToHours = (m) => m / 60;

const getHours = (entry) => {
  const mode = String(entry?.mode ?? "").toLowerCase();
  if (mode === "off" || !mode) return 0;
  if (mode === "yard" && Array.isArray(entry.yardSegments)) {
    return entry.yardSegments.reduce((tot, seg) => {
      const s = minutes(seg.start);
      const e = minutes(seg.end);
      return e > s ? tot + minutesToHours(e - s) : tot;
    }, 0);
  }
  if (entry.leaveTime && (entry.arriveBack || entry.arriveTime)) {
    const start = minutes(entry.leaveTime);
    const end = minutes(entry.arriveBack || entry.arriveTime);
    let diff = end - start;
    if (diff < 0) diff += 24 * 60;
    return minutesToHours(diff);
  }
  if (mode === "onset" || mode === "travel") return 8.5;
  return 0;
};

const Badge = ({ text, bg, fg, border, title }) => (
  <span
    title={title}
    style={{
      backgroundColor: bg,
      color: fg,
      border: `1px solid ${border}`,
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 800,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </span>
);

const statusColor = (status) => {
  if (status === "Ready to Invoice") return "#059669";
  if (status === "Needs Action") return "#f59e0b";
  if (status === "Complete") return "#2563eb";
  return "#6b7280";
};

const StatusPill = ({ value }) => {
  const color = statusColor(value);
  return <Badge text={value} bg={`${color}20`} fg={color} border={color} />;
};
const PaidPill = () => <Badge text="Paid" bg="#bfdbfe" fg="#1d4ed8" border="#60a5fa" />;

/* ────────────────────────────────────────────────────────────
   Status auto-complete helpers (UNCHANGED)
─────────────────────────────────────────────────────────────*/
const buildVehicleNameStatusUpdates = (job, value = "Complete") => {
  const list = Array.isArray(job?.vehicles) ? job.vehicles : [];
  const names = list
    .map((v) => (typeof v === "string" ? v : v?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const safe = (s) => s.replace(/[.~*/\[\]]/g, "_");

  const updates = {};
  names.forEach((n) => {
    updates[`vehicleStatus.${safe(n)}`] = value;
  });
  return updates;
};

/* ────────────────────────────────────────────────────────────
   Timesheet renderer — TABLE layout (UNCHANGED LOGIC)
─────────────────────────────────────────────────────────────*/
const renderTimesheet = (ts, job, vehicleMap, onlyJobDays = true) => {
  const dayMap = ts.days || {};
  const jobDates = new Set(Array.isArray(job.bookingDates) ? job.bookingDates : []);
  const snapshotByDay = ts.jobSnapshot?.byDay || {};

  const ws = parseDateFlexible(ts.weekStart);
  const isoByDay = {};
  if (ws) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      isoByDay[dayOrder[i]] = format(d, "yyyy-MM-dd");
    }
  }

  const isDayRelevant = (day) => {
    const entry = dayMap[day] || {};
    const iso = isoByDay[day];
    const explicitlyLinked = entry.bookingId === job.id;
    const snapshotList = Array.isArray(snapshotByDay[day]) ? snapshotByDay[day] : [];
    const snapshotHasThisJob = snapshotList.some((j) => j.bookingId === job.id);
    const isJobDateMatch = iso ? jobDates.has(iso) : false;
    return explicitlyLinked || snapshotHasThisJob || isJobDateMatch;
  };

  const daysToRender = onlyJobDays ? dayOrder.filter(isDayRelevant) : dayOrder;
  if (onlyJobDays && daysToRender.length === 0) return null;

  const getDisplay = (day) => {
    const entry = dayMap[day] || {};
    const iso = isoByDay[day];
    const isJobDay = iso ? jobDates.has(iso) : false;

    const explicitlyLinked = entry.bookingId === job.id;
    const snapshotList = Array.isArray(snapshotByDay[day]) ? snapshotByDay[day] : [];
    const snapshotHasThisJob = snapshotList.some((j) => j.bookingId === job.id);

    let mode = String(entry?.mode ?? entry?.type ?? "").toLowerCase();
    const hours = getHours(entry);

    if (explicitlyLinked) {
      if (!mode || mode === "off") mode = hours > 0 ? entry.mode || "work" : "off";
    } else if (!mode && (isJobDay || snapshotHasThisJob)) {
      const snap = snapshotList.find((j) => j.bookingId === job.id);
      if (snap && snap.location && snap.location.toLowerCase().includes("yard")) {
        mode = "yard";
      } else {
        mode = "onset";
      }
    }
    if (!mode) mode = "off";

    let label = mode;
    if (mode === "holiday") label = "HOL";
    else if (mode === "onset" || mode === "set" || mode === "work") label = explicitlyLinked ? "Set*" : "Set";
    else if (mode === "yard") label = explicitlyLinked ? "Yard*" : "Yard";
    else if (mode === "travel") label = explicitlyLinked ? "Travel*" : "Travel";
    else if (mode === "off" && hours === 0) label = "OFF";

    return { entry, iso, modeLabel: label, hours };
  };

  const rows = daysToRender.map((day) => ({ day, ...getDisplay(day) }));
  const totalHours = rows.reduce((sum, r) => sum + (isFinite(r.hours) ? r.hours : 0), 0);

  const wrap = {
    border: "1px solid #d1d5db",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: ts.submitted ? "#f9fafb" : "#fff7ed",
    minWidth: 0,
  };
  const header = {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 8,
    borderBottom: "1px solid #e5e7eb",
    paddingBottom: 8,
    minWidth: 0,
    flexWrap: "wrap",
  };
  const tableWrap = { overflowX: "auto", marginTop: 8, minWidth: 0 };
  const table = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: 13,
    tableLayout: "fixed",
  };
  const th = {
    textAlign: "left",
    padding: "0px 0px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
    position: "sticky",
    top: 0,
    zIndex: 1,
    whiteSpace: "nowrap",
  };
  const td = {
    padding: "8px 10px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const tdRight = { ...td, textAlign: "right", whiteSpace: "nowrap" };
  const dayCell = { ...td, fontWeight: 900, whiteSpace: "nowrap" };
  const foot = { ...tdRight, fontWeight: 900, background: "#f8fafc" };
  const notesCell = { overflowWrap: "anywhere", whiteSpace: "pre-wrap" };

  return (
    <div style={wrap}>
      <div style={header}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#1f2937" }}>
          Week of {ws ? format(ws, "dd/MM/yyyy") : "—"}
        </div>
        <div style={{ fontSize: 14, color: "#4b5563" }}>
          <strong>Emp:</strong> {ts.employeeName || ts.employeeCode || "—"}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Showing {rows.length} day{rows.length !== 1 ? "s" : ""} for this job
        </div>
        <div style={{ marginLeft: "auto" }}>
          {ts.submitted ? (
            <Badge text="Submitted" bg="#dcfce7" fg="#166534" border="#86efac" />
          ) : (
            <Badge text="Draft" bg="#fefce8" fg="#854d0e" border="#fde047" />
          )}
        </div>
        <a
          href={`/timesheet/${ts.id || `${ts.employeeCode}_${ts.weekStart}`}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "4px 8px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontSize: 12,
            textDecoration: "none",
            color: "#374151",
            whiteSpace: "nowrap",
          }}
        >
          Open →
        </a>
      </div>

      <div style={tableWrap}>
        <table style={table}>
          <colgroup>
            <col style={{ width: 64 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={th}>Day</th>
              <th style={th}>Date</th>
              <th style={th}>Mode</th>
              <th style={th}>Leave</th>
              <th style={th}>Arrive</th>
              <th style={th}>Call</th>
              <th style={th}>Wrap</th>
              <th style={th}>Arrive Back</th>
              <th style={th}>Overnight</th>
              <th style={th}>Lunch Sup</th>
              <th style={th}>Notes</th>
              <th style={{ ...th, textAlign: "right" }}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ day, entry, iso, modeLabel, hours }) => (
              <tr key={day}>
                <td style={dayCell}>{day.slice(0, 3)}</td>
                <td style={td}>{iso || "—"}</td>
                <td style={td}>{modeLabel || "—"}</td>
                <td style={td}>{entry?.leaveTime || "—"}</td>
                <td style={td}>{entry?.arriveTime || "—"}</td>
                <td style={td}>{entry?.callTime || "—"}</td>
                <td style={td}>{entry?.wrapTime || "—"}</td>
                <td style={td}>{entry?.arriveBack || "—"}</td>
                <td style={td}>{entry?.overnight ? "Yes" : "No"}</td>
                <td style={td}>{entry?.lunchSup ? "Yes" : "No"}</td>
                <td style={{ ...td, ...notesCell }}>{entry?.dayNotes ? entry.dayNotes : "—"}</td>
                <td style={tdRight}>{hours ? hours.toFixed(1) : "0.0"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={11} style={{ ...foot, textAlign: "right" }}>
                Total
              </td>
              <td style={foot}>{totalHours.toFixed(1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────
   NEW: Non-editable status rule (view-only)
─────────────────────────────────────────────────────────────*/
const isLockedStatus = (status = "") => {
  const s = String(status || "").toLowerCase().trim();
  return s === "cancelled" || s === "canceled" || s === "dnh" || s === "postponed" || s === "lost";
};

const DisabledOverlayNote = ({ reason }) => (
  <div
    style={{
      marginTop: 10,
      border: "1px dashed #cbd5e1",
      background: "#f8fafc",
      color: "#64748b",
      borderRadius: 10,
      padding: "10px 12px",
      fontSize: 13,
      fontWeight: 800,
    }}
  >
    🔒 This job is locked ({reason}). Editing is disabled.
  </div>
);

const Btn = ({ children, disabled, onClick, variant = "base", title }) => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 14,
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const styles =
    variant === "primary"
      ? { ...base, background: UI.brand, color: "#fff", border: `1px solid ${UI.brand}` }
      : variant === "danger"
      ? { ...base, background: "#ef4444", color: "#fff", border: "1px solid #ef4444" }
      : variant === "dark"
      ? { ...base, background: "#111827", color: "#fff", border: "1px solid #111827" }
      : { ...base, background: UI.chipBg, color: UI.text };

  return (
    <button disabled={disabled} onClick={disabled ? undefined : onClick} style={styles} title={title}>
      {children}
    </button>
  );
};

const Card = ({ children, id, tone = "white", style }) => (
  <div
    id={id}
    style={{
      background: tone === "alt" ? UI.bgAlt : "#fff",
      border: UI.border,
      borderRadius: UI.radius,
      padding: 14,
      minWidth: 0,
      boxShadow: "0 1px 0 rgba(15,23,42,0.02)",
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionTitle = ({ title, right }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
    <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
    {right}
  </div>
);

const norm = (s) => String(s || "").toLowerCase().trim();
const matchText = (job, term) => {
  const t = norm(term);
  if (!t) return true;
  const hay = [
    job?.client,
    job?.jobNumber,
    job?.location,
    job?.notes,
    job?.generalNotes,
    job?.jobNotes,
    Array.isArray(job?.vehicles) ? job.vehicles.map((v) => (typeof v === "string" ? v : v?.name)).join(" ") : "",
    Array.isArray(job?.employees) ? job.employees.map((e) => e?.name).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" • ")
    .toLowerCase();

  return hay.includes(t);
};

/* ────────────────────────────────────────────────────────────
   Page
─────────────────────────────────────────────────────────────*/
export default function JobInfoPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id;

  const [relatedJobs, setRelatedJobs] = useState([]);
  const [timesheetsByJob, setTimesheetsByJob] = useState({});
  const [statusByJob, setStatusByJob] = useState({});
  const [selectedStatusByJob, setSelectedStatusByJob] = useState({});
  const [dayNotes, setDayNotes] = useState({});
  const [vehicleMap, setVehicleMap] = useState({});

  const [pdfFileByJob, setPdfFileByJob] = useState({});
  const [uploadingByJob, setUploadingByJob] = useState({});
  const [progressByJob, setProgressByJob] = useState({});
  const [errorByJob, setErrorByJob] = useState({});

  // NEW: search + filter + collapse
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [expandedById, setExpandedById] = useState({}); // { [jobId]: true/false }
  const searchRef = useRef(null);

  const isJobNumber = useMemo(() => {
    if (!jobId) return false;
    return typeof jobId === "string" && jobId.length > 5 && jobId.includes("-");
  }, [jobId]);

  const normalizeVehiclesForJob = (job, vmap) => {
    if (!Array.isArray(job.vehicles)) return job;
    const enriched = job.vehicles.map((v) => {
      if (!v) return v;
      if (typeof v === "string") {
        return vmap[v] || { name: v };
      }
      if (typeof v === "object") {
        const key = v.id || v.registration || v.name;
        const full = key ? vmap[key] : null;
        return full ? { ...full, ...v } : v;
      }
      return v;
    });
    return { ...job, vehicles: enriched };
  };

  useEffect(() => {
    if (!jobId) return;

    const fetchAll = async () => {
      try {
        let mainJob;
        let qJobs;

        if (isJobNumber) {
          const prefix = splitJobNumber(jobId).prefix;
          qJobs = query(
            collection(db, "bookings"),
            where("jobNumber", ">=", prefix),
            where("jobNumber", "<", prefix + "\uf8ff")
          );
          const snap = await getDocs(qJobs);
          const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          mainJob = jobs[0] || null;
          setRelatedJobs(jobs);
        } else {
          const docSnap = await getDoc(doc(db, "bookings", jobId));
          if (!docSnap.exists()) {
            setRelatedJobs([]);
            return;
          }
          mainJob = { id: docSnap.id, ...docSnap.data() };

          const prefix = splitJobNumber(mainJob.jobNumber).prefix;
          qJobs = query(
            collection(db, "bookings"),
            where("jobNumber", ">=", prefix),
            where("jobNumber", "<", prefix + "\uf8ff")
          );
          const snap = await getDocs(qJobs);
          const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (!jobs.find((j) => j.id === mainJob.id)) jobs.unshift(mainJob);
          setRelatedJobs(jobs);
        }

        if (!mainJob) return;

        const initStatus = {};
        const initNotes = {};
        setRelatedJobs((jobs) => {
          jobs.forEach((j) => {
            initStatus[j.id] = j.status || "Pending";
            initNotes[j.id] = { general: j.generalNotes || "" };
          });
          return jobs;
        });
        setStatusByJob(initStatus);
        setSelectedStatusByJob(initStatus);
        setDayNotes(initNotes);

        // init collapse: only main job expanded by default
        setExpandedById((prev) => {
          const next = { ...prev };
          // collapse all first
          (Array.isArray(relatedJobs) ? relatedJobs : []).forEach((j) => {
            if (j?.id) next[j.id] = false;
          });
          if (mainJob?.id) next[mainJob.id] = true;
          return next;
        });

        const tsSnap = await getDocs(collection(db, "timesheets"));
        const allTs = tsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const jobsToIndex = (await getDocs(qJobs)).docs.map((d) => ({ id: d.id, ...d.data() }));
        const ids = new Set(jobsToIndex.map((j) => j.id));

        const map = {};
        allTs.forEach((ts) => {
          const linkedIds = new Set();
          if (ts.jobId) linkedIds.add(ts.jobId);
          if (ts.jobSnapshot?.bookingIds?.length) ts.jobSnapshot.bookingIds.forEach((b) => linkedIds.add(b));
          if (ts.days) {
            Object.values(ts.days).forEach((e) => {
              if (e?.bookingId) linkedIds.add(e.bookingId);
            });
          }
          linkedIds.forEach((jid) => {
            if (!ids.has(jid)) return;
            if (!map[jid]) map[jid] = [];
            map[jid].push(ts);
          });
        });
        setTimesheetsByJob(map);

        const vSnap = await getDocs(collection(db, "vehicles"));
        const vMap = vSnap.docs.reduce((acc, d) => {
          const v = { id: d.id, ...d.data() };
          const keys = [v.id, v.name, v.registration].filter(Boolean);
          keys.forEach((k) => (acc[String(k)] = v));
          return acc;
        }, {});
        setVehicleMap(vMap);
      } catch (e) {
        console.error("Error fetching job/timesheet data:", e);
      }
    };

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, isJobNumber]);

  const computeIsPaid = (job) =>
    job.status === "Paid" || (job.invoiceStatus && job.invoiceStatus.toLowerCase().includes("paid"));

  const saveJobStatus = async (id, status) => {
    try {
      const job = relatedJobs.find((j) => j.id === id);
      const updates = { status };

      if (status === "Complete" && job) {
        Object.assign(updates, buildVehicleNameStatusUpdates(job, "Complete"));
      }

      await updateDoc(doc(db, "bookings", id), updates);

      setStatusByJob((p) => ({ ...p, [id]: status }));
      setSelectedStatusByJob((p) => ({ ...p, [id]: status }));
      alert(`Status updated to ${status}`);
    } catch (e) {
      console.error(e);
      alert("Failed to update status.");
    }
  };

  const saveJobSummary = async (id) => {
    const notes = dayNotes[id]?.general || "";
    try {
      await updateDoc(doc(db, "bookings", id), { generalNotes: notes });
      alert("Summary saved.");
    } catch (e) {
      console.error(e);
      alert("Failed to save summary.");
    }
  };

  const deleteJob = async (id) => {
    if (!window.confirm("Delete this job? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "bookings", id));
      alert("Job deleted.");
      router.push("/job-sheet");
    } catch (e) {
      console.error(e);
      alert("Failed to delete job.");
    }
  };

  const onPdfSelect = (jid, file) => {
    setPdfFileByJob((p) => ({ ...p, [jid]: file }));
    setErrorByJob((p) => ({ ...p, [jid]: null }));
  };

  const uploadPdfForJob = async (jid) => {
    const file = pdfFileByJob[jid];
    if (!file || uploadingByJob[jid]) return;

    try {
      setUploadingByJob((p) => ({ ...p, [jid]: true }));
      setProgressByJob((p) => ({ ...p, [jid]: 0 }));
      setErrorByJob((p) => ({ ...p, [jid]: null }));

      const safeName = file.name.replace(/\s+/g, "_");
      const stamp = Date.now();
      const path = `job_attachments/${jid}/${stamp}_${safeName}`;

      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file, { contentType: file.type || "application/pdf" });

      task.on(
        "state_changed",
        (snap) => {
          const prog = (snap.bytesTransferred / snap.totalBytes) * 100;
          setProgressByJob((p) => ({ ...p, [jid]: Math.round(prog) }));
        },
        (err) => {
          console.error(err);
          setErrorByJob((p) => ({ ...p, [jid]: err.message || "Upload failed" }));
          setUploadingByJob((p) => ({ ...p, [jid]: false }));
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);

          const attachment = {
            name: file.name,
            size: file.size,
            type: file.type || "application/pdf",
            url,
            storagePath: path,
            uploadedAt: new Date().toISOString(),
          };

          await updateDoc(doc(db, "bookings", jid), {
            attachments: arrayUnion(attachment),
            pdfUrl: url,
          });

          setRelatedJobs((prev) =>
            prev.map((j) =>
              j.id !== jid
                ? j
                : {
                    ...j,
                    pdfUrl: url,
                    attachments: Array.isArray(j.attachments) ? [...j.attachments, attachment] : [attachment],
                  }
            )
          );

          setUploadingByJob((p) => ({ ...p, [jid]: false }));
          setProgressByJob((p) => ({ ...p, [jid]: 100 }));
          setPdfFileByJob((p) => ({ ...p, [jid]: null }));
          alert("PDF uploaded.");
        }
      );
    } catch (e) {
      console.error(e);
      setErrorByJob((p) => ({ ...p, [jid]: e.message || "Upload failed" }));
      setUploadingByJob((p) => ({ ...p, [jid]: false }));
    }
  };

  // ✅ Hash scrolling + ALSO expand the target job when opened via link
  useEffect(() => {
    if (typeof window === "undefined") return;

    const getTargetJobIdFromHash = () => {
      const hash = window.location.hash || "";
      if (!hash) return null;
      const id = decodeURIComponent(hash.slice(1)); // e.g. "job-abc123"
      if (!id.startsWith("job-")) return null;
      return id.replace("job-", "");
    };

    const scrollToHash = (attempt = 0) => {
      const hash = window.location.hash || "";
      if (!hash) return;

      const domId = decodeURIComponent(hash.slice(1));
      if (!domId) return;

      const el = document.getElementById(domId);

      if (!el) {
        if (attempt < 30) setTimeout(() => scrollToHash(attempt + 1), 50);
        return;
      }

      // Expand job if hash points at a job section/sub-section
      const targetJobId = getTargetJobIdFromHash();
      if (targetJobId) {
        setExpandedById((p) => ({ ...p, [targetJobId]: true }));
      }

      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        window.scrollBy({ top: -(LAYOUT.HEADER_H + 12), left: 0, behavior: "instant" });
      }, 50);
    };

    // On load after render
    if (relatedJobs?.length) scrollToHash(0);

    const onHashChange = () => scrollToHash(0);
    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, [relatedJobs]);

  // Ensure the current route job is expanded
  useEffect(() => {
    if (!jobId) return;
    setExpandedById((p) => ({ ...p, [jobId]: true }));
  }, [jobId]);

  const normalizeVehiclesForList = (jobs) => jobs.map((j) => normalizeVehiclesForJob(j, vehicleMap));

  const allJobs = useMemo(() => normalizeVehiclesForList(relatedJobs), [relatedJobs, vehicleMap]);

  const statusOptions = useMemo(() => {
    const set = new Set(["All"]);
    allJobs.forEach((j) => set.add(String(statusByJob[j.id] || j.status || "Pending")));
    return Array.from(set);
  }, [allJobs, statusByJob]);

  const filteredJobs = useMemo(() => {
    const term = search.trim();
    return allJobs.filter((j) => {
      const s = String(statusByJob[j.id] || j.status || "Pending");
      const statusOk = statusFilter === "All" ? true : s === statusFilter;
      return statusOk && matchText({ ...j, status: s }, term);
    });
  }, [allJobs, search, statusFilter, statusByJob]);

  if (!jobId) {
    return (
      <HeaderSidebarLayout>
        <div style={{ padding: 40 }}>No Job ID provided.</div>
      </HeaderSidebarLayout>
    );
  }

  if (!relatedJobs.length) {
    return (
      <HeaderSidebarLayout>
        <div style={{ padding: 40 }}>Loading job details…</div>
      </HeaderSidebarLayout>
    );
  }

  const mainJob = relatedJobs.find((j) => j.id === jobId) || relatedJobs[0];
  const prefix = splitJobNumber(mainJob.jobNumber).prefix;

  const toggleAll = (open) => {
    const next = {};
    filteredJobs.forEach((j) => (next[j.id] = !!open));
    // Always keep current job open
    if (jobId) next[jobId] = true;
    setExpandedById((p) => ({ ...p, ...next }));
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ width: "100%", minHeight: "100vh", backgroundColor: UI.bg, color: UI.text }}>
        {/* Sticky page header + SEARCH */}
        <div
          id="page-top"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 8,
            background: "#ffffffcc",
            backdropFilter: "saturate(180%) blur(6px)",
            borderBottom: UI.border,
          }}
        >
          <div
            style={{
              height: LAYOUT.HEADER_H,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: "min(1600px, 100%)",
                margin: "0 auto",
                padding: `0 ${LAYOUT.PAGE_PAD_X}px`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                minWidth: 0,
              }}
            >
              <Btn onClick={() => router.back()} variant="base">
                ← Back
              </Btn>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Job Group: {prefix}
                </div>
                <div style={{ color: UI.muted, fontSize: 12, fontWeight: 700 }}>
                  Search + filter • Collapsible sections • Deep links still expand & highlight
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Btn variant="base" onClick={() => toggleAll(true)} title="Expand all">
                  Expand all
                </Btn>
                <Btn variant="base" onClick={() => toggleAll(false)} title="Collapse all (keeps current open)">
                  Collapse all
                </Btn>
              </div>
            </div>
          </div>

          {/* Search Row */}
          <div
            style={{
              width: "min(1600px, 100%)",
              margin: "0 auto",
              padding: `0 ${LAYOUT.PAGE_PAD_X}px 12px`,
              display: "grid",
              gridTemplateColumns: "1fr 220px 140px",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div style={{ position: "relative" }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                style={{ position: "absolute", left: 10, top: 10, width: 18, height: 18, opacity: 0.55 }}
                aria-hidden
              >
                <path
                  d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by job #, client, location, notes, vehicles, employees…"
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 36px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  outline: "none",
                  background: "#fff",
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 10px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                fontSize: 14,
                outline: "none",
                background: "#fff",
                fontWeight: 800,
              }}
              aria-label="Filter by status"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <div
              style={{
                border: UI.border,
                background: "#fff",
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 900,
                textAlign: "center",
              }}
              title="Visible jobs"
            >
              {filteredJobs.length} shown
            </div>
          </div>
        </div>

        {/* Page content */}
        <div
          style={{
            width: "min(1600px, 100%)",
            margin: "0 auto",
            padding: `16px ${LAYOUT.PAGE_PAD_X}px 48px`,
            paddingTop: 12,
            minWidth: 0,
          }}
        >
          {!filteredJobs.length ? (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                background: "#f8fafc",
                borderRadius: 14,
                padding: 16,
                color: "#64748b",
                fontWeight: 800,
              }}
            >
              No jobs match your search/filter.
            </div>
          ) : (
            filteredJobs.map((job) => {
              const JOB_SECTION_ID = `job-${job.id}`;
              const OVERVIEW_ID = `${JOB_SECTION_ID}-overview`;
              const TIMESHEETS_ID = `${JOB_SECTION_ID}-timesheets`;
              const STATUS_ID = `${JOB_SECTION_ID}-status`;
              const NOTES_PO_ID = `${JOB_SECTION_ID}-notes-po`;
              const ATTACHMENTS_ID = `${JOB_SECTION_ID}-attachments`;

              const currentDbStatus = statusByJob[job.id] || job.status || "Pending";
              const selected = selectedStatusByJob[job.id] ?? currentDbStatus;
              const isPaid = computeIsPaid(job);

              const locked = isLockedStatus(currentDbStatus);
              const lockReason = currentDbStatus || "Locked";

              const isExpanded = expandedById[job.id] ?? (job.id === jobId); // default current open

              const timesheets = (timesheetsByJob[job.id] || []).slice().sort((a, b) => {
                const t = (v) => parseDateFlexible(v)?.getTime() || 0;
                return t(b.weekStart) - t(a.weekStart);
              });

              const uploadError = errorByJob[job.id];
              const fileSelected = pdfFileByJob[job.id];

              const cards = timesheets.map((ts) => renderTimesheet(ts, job, vehicleMap, true)).filter(Boolean);

              const jobNotesText = [job.jobNotes, job.notes, job.generalNotes].filter(Boolean).join("\n\n");
              const hasNotesByDate =
                job.notesByDate && typeof job.notesByDate === "object" && Object.keys(job.notesByDate).length > 0;

              return (
                <section
                  key={job.id}
                  id={JOB_SECTION_ID}
                  style={{
                    border: job.id === jobId ? `2px solid ${UI.brand}` : UI.border,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 18,
                    boxShadow: UI.shadow,
                    background: locked ? "#f8fafc" : job.id === jobId ? "#f8fbff" : "#fff",
                    minWidth: 0,
                    scrollMarginTop: LAYOUT.HEADER_H + 80, // extra for search row
                    opacity: locked ? 0.82 : 1,
                    filter: locked ? "grayscale(0.35)" : "none",
                  }}
                >
                  {/* Collapsible header */}
                  <div
                    onClick={() => setExpandedById((p) => ({ ...p, [job.id]: !isExpanded }))}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 12,
                      background: UI.bgAlt,
                      border: UI.border,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                    title={isExpanded ? "Collapse" : "Expand"}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 900,
                        color: UI.muted,
                      }}
                    >
                      {isExpanded ? "–" : "+"}
                    </div>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 34,
                        height: 26,
                        padding: "0 8px",
                        borderRadius: 10,
                        background: "#eef2ff",
                        border: "1px solid #e5e7eb",
                        fontWeight: 900,
                        fontSize: 12,
                        color: "#3730a3",
                      }}
                      title="Job prefix"
                    >
                      {splitJobNumber(job.jobNumber || "").prefix || "—"}
                    </span>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 16,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={`${job.client || "Booking"} — #${job.jobNumber || job.id}`}
                      >
                        {job.client || "Booking"} — #{job.jobNumber || job.id}
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                        <StatusPill value={currentDbStatus} />
                        {isPaid && <PaidPill />}
                        {locked && (
                          <Badge
                            text="Locked"
                            bg="#e2e8f0"
                            fg="#475569"
                            border="#cbd5e1"
                            title="Cancelled/DNH/Postponed/Lost jobs are view-only"
                          />
                        )}
                        <span style={{ color: UI.muted, fontSize: 12, fontWeight: 800 }}>
                          {job.location ? `📍 ${job.location}` : "📍 —"} • {renderDateBlock(job)}
                        </span>
                      </div>
                    </div>

                    {/* Quick actions (don’t toggle collapse when clicked) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
                    >
                      <Btn
                        variant="primary"
                        disabled={locked}
                        title={locked ? `Editing disabled: ${lockReason}` : "Edit booking"}
                        onClick={() => router.push(`/edit-booking/${job.id}`)}
                      >
                        Edit
                      </Btn>

                      <Btn
                        variant="danger"
                        disabled={locked}
                        title={locked ? `Deletion disabled: ${lockReason}` : "Delete booking"}
                        onClick={() => deleteJob(job.id)}
                      >
                        Delete
                      </Btn>
                    </div>
                  </div>

                  {locked && isExpanded && <DisabledOverlayNote reason={lockReason} />}

                  {/* Collapsed body */}
                  {!isExpanded ? null : (
                    <div style={{ marginTop: 12 }}>
                      {/* Two-column layout */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)",
                          gap: 16,
                          alignItems: "start",
                          minWidth: 0,
                        }}
                      >
                        {/* LEFT */}
                        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                          {/* Overview */}
                          <Card id={OVERVIEW_ID} style={{ scrollMarginTop: LAYOUT.HEADER_H + 80 }}>
                            <SectionTitle title="Overview" />

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "160px minmax(0,1fr)",
                                rowGap: 10,
                                columnGap: 12,
                                fontSize: 14,
                                minWidth: 0,
                              }}
                            >
                              <div style={{ color: UI.muted, fontWeight: 900, textTransform: "uppercase", fontSize: 12 }}>
                                Location
                              </div>
                              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{job.location || "—"}</div>

                              <div style={{ color: UI.muted, fontWeight: 900, textTransform: "uppercase", fontSize: 12 }}>
                                Team
                              </div>
                              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{renderEmployees(job.employees) || "—"}</div>

                              <div style={{ color: UI.muted, fontWeight: 900, textTransform: "uppercase", fontSize: 12 }}>
                                Dates
                              </div>
                              <div style={{ minWidth: 0 }}>{renderDateBlock(job)}</div>
                            </div>

                            {/* Vehicles */}
                            {Array.isArray(job.vehicles) && job.vehicles.length > 0 && (
                              <div style={{ marginTop: 14, minWidth: 0 }}>
                                <SectionTitle title="Vehicles" />
                                <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                                  {job.vehicles.map((v, i) => {
                                    const reg = (v.registration || "").toString().toUpperCase();
                                    const title = v.name || [v.manufacturer, v.model].filter(Boolean).join(" ") || "Vehicle";
                                    const subBits = [reg && `Reg: ${reg}`].filter(Boolean);
                                    return (
                                      <div
                                        key={i}
                                        style={{
                                          border: UI.border,
                                          borderRadius: 10,
                                          padding: 10,
                                          background: UI.bgAlt,
                                          minWidth: 0,
                                        }}
                                      >
                                        <div style={{ fontWeight: 900, color: UI.text, overflowWrap: "anywhere" }}>{title}</div>
                                        {subBits.length > 0 && (
                                          <div style={{ color: "#374151", fontSize: 13, marginTop: 6, overflowWrap: "anywhere" }}>
                                            {subBits.join(" • ")}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Read-only Notes */}
                            {(jobNotesText || hasNotesByDate) && (
                              <div style={{ marginTop: 16, minWidth: 0 }}>
                                <SectionTitle title="Job Notes" />
                                {jobNotesText && (
                                  <div
                                    style={{
                                      whiteSpace: "pre-wrap",
                                      color: UI.text,
                                      fontSize: 14,
                                      background: UI.bgAlt,
                                      border: UI.border,
                                      borderRadius: 10,
                                      padding: 12,
                                      minWidth: 0,
                                      overflowWrap: "anywhere",
                                    }}
                                  >
                                    {jobNotesText}
                                  </div>
                                )}
                                {hasNotesByDate && (
                                  <div style={{ marginTop: 10, display: "grid", gap: 6, minWidth: 0 }}>
                                    {Object.keys(job.notesByDate)
                                      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                                      .sort()
                                      .map((dateKey) => {
                                        const note = job.notesByDate[dateKey];
                                        if (!note) return null;
                                        const nice = new Date(dateKey).toLocaleDateString("en-GB", {
                                          weekday: "short",
                                          day: "2-digit",
                                          month: "short",
                                        });
                                        return (
                                          <div key={dateKey} style={{ fontSize: 13, color: UI.text, overflowWrap: "anywhere" }}>
                                            <strong style={{ color: UI.muted }}>{nice}:</strong> {note}
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                            )}
                          </Card>

                          {/* Timesheets */}
                          <Card id={TIMESHEETS_ID} style={{ scrollMarginTop: LAYOUT.HEADER_H + 80 }}>
                            <SectionTitle
                              title="Linked Timesheets"
                              right={
                                <span style={{ color: UI.muted, fontSize: 13, fontWeight: 900 }}>
                                  {(timesheetsByJob[job.id] || []).length} found
                                </span>
                              }
                            />

                            {cards.length ? (
                              <div style={{ display: "grid", gap: 12, minWidth: 0 }}>{cards.map((c, i) => <div key={i}>{c}</div>)}</div>
                            ) : (
                              <div
                                style={{
                                  color: UI.muted,
                                  padding: 12,
                                  border: "1px dashed #d1d5db",
                                  borderRadius: 10,
                                  background: "#fff",
                                }}
                              >
                                No timesheet days found for this job yet.
                              </div>
                            )}
                          </Card>
                        </div>

                        {/* RIGHT: Actions (sticky) */}
                        <div
                          style={{
                            display: "grid",
                            gap: 12,
                            alignSelf: "start",
                            position: "sticky",
                            top: LAYOUT.HEADER_H + 68, // below the search row
                            minWidth: 0,
                          }}
                        >
                          {/* Status */}
                          <Card
                            id={STATUS_ID}
                            tone="alt"
                            style={{
                              border: "1px solid #c7d2fe",
                              background: "#eef2ff",
                              scrollMarginTop: LAYOUT.HEADER_H + 80,
                            }}
                          >
                            <SectionTitle title="Update Status" />

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                              {["Ready to Invoice", "Needs Action", "Complete"].map((opt) => {
                                const active = selected === opt;
                                const color = statusColor(opt);
                                const disabled = isPaid || locked;

                                return (
                                  <button
                                    key={opt}
                                    onClick={() => {
                                      if (!disabled) setSelectedStatusByJob((prev) => ({ ...prev, [job.id]: opt }));
                                    }}
                                    disabled={disabled}
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 10,
                                      border: active ? `2px solid ${color}` : "1px solid #c7d2fe",
                                      background: active ? `${color}20` : "#eef2ff",
                                      color: active ? color : "#1f2937",
                                      fontWeight: 900,
                                      cursor: disabled ? "not-allowed" : "pointer",
                                      opacity: disabled ? 0.55 : 1,
                                      fontSize: 13,
                                    }}
                                    title={locked ? `Locked: ${lockReason}` : isPaid ? "Paid jobs are locked" : ""}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>

                            <Btn
                              variant="dark"
                              disabled={locked || isPaid || (selectedStatusByJob[job.id] ?? currentDbStatus) === currentDbStatus}
                              title={locked ? `Locked: ${lockReason}` : isPaid ? "Paid jobs are locked" : "Save status"}
                              onClick={() => {
                                const chosen = selectedStatusByJob[job.id] ?? currentDbStatus;
                                if (chosen !== currentDbStatus) saveJobStatus(job.id, chosen);
                              }}
                            >
                              Save Status Change
                            </Btn>
                          </Card>

                          {/* Notes & PO */}
                          <Card id={NOTES_PO_ID} tone="alt" style={{ scrollMarginTop: LAYOUT.HEADER_H + 80 }}>
                            <SectionTitle title="Notes & PO" />

                            <label style={{ fontWeight: 900, display: "block", marginBottom: 6, fontSize: 12, color: UI.muted }}>
                              General Summary
                            </label>

                            <textarea
                              rows={4}
                              value={dayNotes?.[job.id]?.general || ""}
                              onChange={(e) =>
                                setDayNotes((prev) => ({
                                  ...prev,
                                  [job.id]: { ...(prev?.[job.id] || {}), general: e.target.value },
                                }))
                              }
                              disabled={locked}
                              placeholder={locked ? "Locked job (view-only)" : "Add general summary…"}
                              style={{
                                width: "100%",
                                border: "1px solid #d1d5db",
                                borderRadius: 10,
                                padding: 10,
                                fontSize: 13,
                                resize: "vertical",
                                background: locked ? "#f1f5f9" : "#fff",
                                marginBottom: 10,
                                opacity: locked ? 0.8 : 1,
                              }}
                            />

                            <Btn variant="base" disabled={locked} title={locked ? `Locked: ${lockReason}` : "Save summary"} onClick={() => saveJobSummary(job.id)}>
                              Save Summary
                            </Btn>

                            <div style={{ marginTop: 12 }}>
                              <label style={{ fontWeight: 900, display: "block", marginBottom: 6, fontSize: 12, color: UI.muted }}>
                                Purchase Order (PO)
                              </label>
                              <input
                                type="text"
                                defaultValue={job.po || ""}
                                disabled={locked}
                                onBlur={(e) => {
                                  if (locked) return;
                                  updateDoc(doc(db, "bookings", job.id), { po: e.target.value });
                                }}
                                placeholder={locked ? "Locked job" : "Enter PO reference…"}
                                style={{
                                  width: "100%",
                                  border: "1px solid #d1d5db",
                                  borderRadius: 10,
                                  padding: 10,
                                  fontSize: 13,
                                  background: locked ? "#f1f5f9" : "#fff",
                                  opacity: locked ? 0.8 : 1,
                                }}
                              />
                            </div>
                          </Card>

                          {/* Attachments */}
                          <Card id={ATTACHMENTS_ID} style={{ scrollMarginTop: LAYOUT.HEADER_H + 80 }}>
                            <SectionTitle title={job.pdfUrl ? "Job Attachment (PDF)" : "Upload Job Attachment"} />

                            {job.pdfUrl && (
                              <div style={{ marginBottom: 10 }}>
                                <a
                                  href={job.pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: UI.brand, textDecoration: "underline", fontSize: 14, fontWeight: 900 }}
                                >
                                  View Current PDF
                                </a>
                              </div>
                            )}

                            {Array.isArray(job.attachments) && job.attachments.length > 0 && (
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontWeight: 900, marginBottom: 8 }}>Attachments</div>
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {job.attachments.map((att, i) => (
                                    <li key={i} style={{ fontSize: 13, marginBottom: 6 }}>
                                      <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 900 }}>
                                        {att.name}
                                      </a>
                                      <span style={{ color: UI.muted }}> • {(att.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <input
                              type="file"
                              accept="application/pdf"
                              disabled={locked}
                              onChange={(e) => onPdfSelect(job.id, e.target.files?.[0])}
                              style={{
                                marginBottom: 10,
                                fontSize: 14,
                                width: "100%",
                                opacity: locked ? 0.6 : 1,
                                cursor: locked ? "not-allowed" : "pointer",
                              }}
                              title={locked ? `Locked: ${lockReason}` : "Select a PDF"}
                            />

                            <Btn
                              variant="dark"
                              disabled={locked || uploadingByJob[job.id] || !fileSelected}
                              title={locked ? `Locked: ${lockReason}` : ""}
                              onClick={() => uploadPdfForJob(job.id)}
                            >
                              {uploadingByJob[job.id]
                                ? `Uploading… ${progressByJob[job.id] ?? 0}%`
                                : fileSelected
                                ? job.pdfUrl
                                  ? "Replace / Add PDF"
                                  : "Upload PDF"
                                : "Select file"}
                            </Btn>

                            {uploadError && <p style={{ color: "red", fontSize: 12, marginTop: 8 }}>{uploadError}</p>}
                          </Card>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
