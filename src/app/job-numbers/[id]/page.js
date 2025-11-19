'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../../firebaseConfig';
import HeaderSidebarLayout from '../../components/HeaderSidebarLayout';
import { format, parseISO } from 'date-fns';

/* ────────────────────────────────────────────────────────────
   Design tokens + layout
─────────────────────────────────────────────────────────────*/
const UI = {
  radius: 12,
  border: '1px solid #e5e7eb',
  text: '#0f172a',
  muted: '#6b7280',
  bg: '#ffffff',
  bgAlt: '#f9fafb',
  brand: '#2563eb',
  chipBg: '#f1f5f9',
  shadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const LAYOUT = {
  HEADER_H: 64,   // sticky header height
  PAGE_PAD_X: 16, // horizontal page padding
  STICKY_GAP: 12, // gap between sticky header and sticky side column
};

/* ────────────────────────────────────────────────────────────
   Helpers (unchanged logic)
─────────────────────────────────────────────────────────────*/
const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const parseDateFlexible = (dateStr) => {
  try {
    if (!dateStr) return null;
    if (typeof dateStr === 'string' && dateStr.length === 10) return parseISO(dateStr); // YYYY-MM-DD
    return new Date(dateStr);
  } catch {
    return null;
  }
};

const splitJobNumber = (jobNumber) => {
  if (typeof jobNumber === 'string') {
    const parts = jobNumber.split('-');
    if (parts.length > 1) return { prefix: parts.slice(0, -1).join('-'), suffix: parts.at(-1) };
  }
  return { prefix: jobNumber || 'Job', suffix: '' };
};

const renderEmployees = (employees) =>
  Array.isArray(employees) && employees.length ? employees.map((e) => e.name || e.displayName || e.email || '').filter(Boolean).join(', ') : null;

const renderDateBlock = (job) => {
  if (!Array.isArray(job.bookingDates) || job.bookingDates.length === 0) return 'No dates scheduled.';
  const sorted = job.bookingDates
    .map((d) => parseDateFlexible(d))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!sorted.length) return 'No valid dates.';
  const first = format(sorted[0], 'dd/MM/yyyy');
  const last = format(sorted.at(-1), 'dd/MM/yyyy');
  return first === last ? first : `${first} to ${last} (${sorted.length} days)`;
};

const minutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const minutesToHours = (m) => m / 60;

const getHours = (entry) => {
  const mode = String(entry?.mode ?? '').toLowerCase();
  if (mode === 'off' || !mode) return 0;
  if (mode === 'yard' && Array.isArray(entry.yardSegments)) {
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
  if (mode === 'onset' || mode === 'travel') return 8.5;
  return 0;
};

const Badge = ({ text, bg, fg, border }) => (
  <span
    style={{
      backgroundColor: bg,
      color: fg,
      border: `1px solid ${border}`,
      padding: '2px 6px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}
  >
    {text}
  </span>
);

const statusColor = (status) => {
  if (status === 'Ready to Invoice') return '#059669';
  if (status === 'Needs Action') return '#f59e0b';
  if (status === 'Complete') return '#2563eb';
  return '#6b7280';
};

const StatusPill = ({ value }) => {
  const color = statusColor(value);
  return <Badge text={value} bg={`${color}20`} fg={color} border={color} />;
};
const PaidPill = () => <Badge text="Paid" bg="#bfdbfe" fg="#1d4ed8" border="#60a5fa" />;

/* ────────────────────────────────────────────────────────────
   Status auto-complete helpers (unchanged)
─────────────────────────────────────────────────────────────*/
const toLocalISODate = (d) => {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = x.getMonth();
  const day = x.getDate();
  return new Date(y, m, day).toISOString().slice(0, 10);
};
const latestOf = (dates = []) =>
  dates
    .map(toLocalISODate)
    .filter(Boolean)
    .sort()
    .pop() || null;

const getLastBookingDateISO = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) {
    return latestOf(b.bookingDates);
  }
  const end = b.endDate ? toLocalISODate(b.endDate) : null;
  const single = (b.date || b.startDate) ? toLocalISODate(b.date || b.startDate) : null;
  return end || single || null;
};

// Build Firestore updates like: { "vehicleStatus.<vehicleName>": "Complete" }
const buildVehicleNameStatusUpdates = (job, value = "Complete") => {
  const list = Array.isArray(job?.vehicles) ? job.vehicles : [];
  const names = list
    .map((v) => (typeof v === "string" ? v : v?.name))
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  // Firestore field path segments cannot include . ~ * / [ ]
  const safe = (s) => s.replace(/[.~*/\[\]]/g, "_");

  const updates = {};
  names.forEach((n) => {
    updates[`vehicleStatus.${safe(n)}`] = value;
  });
  return updates;
};


/* ────────────────────────────────────────────────────────────
   Day Details (unchanged logic)
─────────────────────────────────────────────────────────────*/
const DayDetails = ({ day, iso, entry, jobId }) => {
  const hours = getHours(entry);
  const mode = String(entry?.mode ?? '').toLowerCase();
  const explicitlyLinked = entry?.bookingId === jobId;

  const Row = ({ label, children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6, fontSize: 12 }}>
      <div style={{ color: UI.muted }}>{label}</div>
      <div style={{ color: UI.text }}>{children}</div>
    </div>
  );

  return (
    <div style={{ border: UI.border, borderRadius: 8, padding: 10, background: '#ffffff', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: UI.text }}>{day}</div>
        <div style={{ color: UI.muted, fontSize: 12 }}>{iso || '—'}</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: UI.text, fontWeight: 700 }}>{hours.toFixed(1)}h</div>
      </div>

      <Row label="Mode">
        <span style={{ fontWeight: 700, color: explicitlyLinked ? '#059669' : UI.text }}>
          {mode || '—'}{explicitlyLinked ? ' *' : ''}
        </span>
      </Row>

      {mode === 'yard' && (
        <Row label="Yard Blocks">
          {Array.isArray(entry?.yardSegments) && entry.yardSegments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {entry.yardSegments.map((seg, i) => (
                <div key={i} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                  {seg.start || '—'} → {seg.end || '—'}
                </div>
              ))}
            </div>
          ) : (
            '—'
          )}
        </Row>
      )}

      {(mode === 'onset' || mode === 'travel') && (
        <>
          <Row label="Leave">{entry?.leaveTime || '—'}</Row>
          <Row label="Arrive">{entry?.arriveTime || '—'}</Row>
          {mode === 'onset' && (
            <>
              <Row label="Call">{entry?.callTime || '—'}</Row>
              <Row label="Wrap">{entry?.wrapTime || '—'}</Row>
            </>
          )}
          <Row label="Arrive Back">{entry?.arriveBack || '—'}</Row>
          <Row label="Overnight">{entry?.overnight ? 'Yes' : 'No'}</Row>
          <Row label="Lunch Sup">{entry?.lunchSup ? 'Yes' : 'No'}</Row>
        </>
      )}

      <Row label="Notes">{entry?.dayNotes ? <span style={{ whiteSpace: 'pre-wrap' }}>{entry.dayNotes}</span> : '—'}</Row>
      <Row label="Linked Booking">{entry?.bookingId || '—'}</Row>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────
   Timesheet renderer — TABLE layout (fills, no overlap)
─────────────────────────────────────────────────────────────*/
const renderTimesheet = (ts, job, vehicleMap, onlyJobDays = true) => {
  const dayMap = ts.days || {};
  const jobDates = new Set(Array.isArray(job.bookingDates) ? job.bookingDates : []);
  const snapshotByDay = ts.jobSnapshot?.byDay || {};

  // Week ISO map
  const ws = parseDateFlexible(ts.weekStart);
  const isoByDay = {};
  if (ws) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      isoByDay[dayOrder[i]] = format(d, 'yyyy-MM-dd');
    }
  }

  // Relevant days
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

  // Display inference
  const getDisplay = (day) => {
    const entry = dayMap[day] || {};
    const iso = isoByDay[day];
    const isJobDay = iso ? jobDates.has(iso) : false;

    const explicitlyLinked = entry.bookingId === job.id;
    const snapshotList = Array.isArray(snapshotByDay[day]) ? snapshotByDay[day] : [];
    const snapshotHasThisJob = snapshotList.some((j) => j.bookingId === job.id);

    let mode = String(entry?.mode ?? entry?.type ?? '').toLowerCase();
    const hours = getHours(entry);

    if (explicitlyLinked) {
      if (!mode || mode === 'off') mode = hours > 0 ? entry.mode || 'work' : 'off';
    } else if (!mode && (isJobDay || snapshotHasThisJob)) {
      const snap = snapshotList.find((j) => j.bookingId === job.id);
      if (snap && snap.location && snap.location.toLowerCase().includes('yard')) {
        mode = 'yard';
      } else {
        mode = 'onset';
      }
    }
    if (!mode) mode = 'off';

    let label = mode;
    if (mode === 'holiday') label = 'HOL';
    else if (mode === 'onset' || mode === 'set' || mode === 'work') label = explicitlyLinked ? 'Set*' : 'Set';
    else if (mode === 'yard') label = explicitlyLinked ? 'Yard*' : 'Yard';
    else if (mode === 'travel') label = explicitlyLinked ? 'Travel*' : 'Travel';
    else if (mode === 'off' && hours === 0) label = 'OFF';

    return { entry, iso, modeLabel: label, hours };
  };

  const rows = daysToRender.map((day) => ({ day, ...getDisplay(day) }));
  const totalHours = rows.reduce((sum, r) => sum + (isFinite(r.hours) ? r.hours : 0), 0);

  // Styles (with minWidth: 0 and fixed table layout)
  const wrap = {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: ts.submitted ? '#f9fafb' : '#fff7ed',
    minWidth: 0,
  };
  const header = {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    marginBottom: 8,
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 8,
    minWidth: 0,
  };
  const tableWrap = { overflowX: 'auto', marginTop: 8, minWidth: 0 };
  const table = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    fontSize: 13,
    tableLayout: 'fixed', // prevents column creep and overflow
  };
  const th = {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid #e5e7eb',
    background: '#f8fafc',
    position: 'sticky',
    top: 0,       // if your page header covers this, change to LAYOUT.HEADER_H + 8
    zIndex: 1,
    whiteSpace: 'nowrap',
  };
  const td = {
    padding: '8px 10px',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'top',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
  const tdRight = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
  const dayCell = { ...td, fontWeight: 700, whiteSpace: 'nowrap' };
  const foot = { ...tdRight, fontWeight: 800, background: '#f8fafc' };
  const notesCell = { overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' };

  return (
    <div style={wrap}>
      {/* header */}
      <div style={header}>
        <div style={{ fontSize: 14, fontWeight: 'bold', color: '#1f2937' }}>
          Week of {ws ? format(ws, 'dd/MM/yyyy') : '—'}
        </div>
        <div style={{ fontSize: 14, color: '#4b5563' }}>
          <strong>Emp:</strong> {ts.employeeName || ts.employeeCode || '—'}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Showing {rows.length} day{rows.length !== 1 ? 's' : ''} for this job
        </div>
        <div style={{ marginLeft: 'auto' }}>
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
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: '#fff',
            fontSize: 12,
            textDecoration: 'none',
            color: '#374151',
            marginLeft: 8,
            whiteSpace: 'nowrap',
          }}
        >
          Open →
        </a>
      </div>

      {/* table */}
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
            <col />               {/* Notes grows */}
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
              <th style={{ ...th, textAlign: 'right' }}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ day, entry, iso, modeLabel, hours }) => (
              <tr key={day}>
                <td style={dayCell}>{day.slice(0, 3)}</td>
                <td style={td}>{iso || '—'}</td>
                <td style={td}>{modeLabel || '—'}</td>
                <td style={td}>{entry?.leaveTime || '—'}</td>
                <td style={td}>{entry?.arriveTime || '—'}</td>
                <td style={td}>{entry?.callTime || '—'}</td>
                <td style={td}>{entry?.wrapTime || '—'}</td>
                <td style={td}>{entry?.arriveBack || '—'}</td>
                <td style={td}>{entry?.overnight ? 'Yes' : 'No'}</td>
                <td style={td}>{entry?.lunchSup ? 'Yes' : 'No'}</td>
                <td style={{ ...td, ...notesCell }}>
                  {entry?.dayNotes ? entry.dayNotes : '—'}
                </td>
                <td style={tdRight}>{hours ? hours.toFixed(1) : '0.0'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={11} style={{ ...foot, textAlign: 'right' }}>Total</td>
              <td style={foot}>{totalHours.toFixed(1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
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

  const isJobNumber = useMemo(() => {
    if (!jobId) return false;
    return typeof jobId === 'string' && jobId.length > 5 && jobId.includes('-');
  }, [jobId]);

  const normalizeVehiclesForJob = (job, vmap) => {
    if (!Array.isArray(job.vehicles)) return job;
    const enriched = job.vehicles.map((v) => {
      if (!v) return v;
      if (typeof v === 'string') {
        return vmap[v] || { name: v };
      }
      if (typeof v === 'object') {
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
        // bookings (main + related by prefix)
        let mainJob;
        let qJobs;

        if (isJobNumber) {
          const prefix = splitJobNumber(jobId).prefix;
          qJobs = query(
            collection(db, 'bookings'),
            where('jobNumber', '>=', prefix),
            where('jobNumber', '<', prefix + '\uf8ff')
          );
          const snap = await getDocs(qJobs);
          const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          mainJob = jobs[0] || null;
          setRelatedJobs(jobs);
        } else {
          const docSnap = await getDoc(doc(db, 'bookings', jobId));
          if (!docSnap.exists()) {
            setRelatedJobs([]);
            return;
          }
          mainJob = { id: docSnap.id, ...docSnap.data() };
          const prefix = splitJobNumber(mainJob.jobNumber).prefix;
          qJobs = query(
            collection(db, 'bookings'),
            where('jobNumber', '>=', prefix),
            where('jobNumber', '<', prefix + '\uf8ff')
          );
          const snap = await getDocs(qJobs);
          const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (!jobs.find((j) => j.id === mainJob.id)) jobs.unshift(mainJob);
          setRelatedJobs(jobs);
        }

        if (!mainJob) return;

        // init UI state
        const initStatus = {};
        const initNotes = {};
        setRelatedJobs((jobs) => {
          jobs.forEach((j) => {
            initStatus[j.id] = j.status || 'Pending';
            initNotes[j.id] = { general: j.generalNotes || '' };
          });
          return jobs;
        });
        setStatusByJob(initStatus);
        setSelectedStatusByJob(initStatus);
        setDayNotes(initNotes);

        // timesheets
        const tsSnap = await getDocs(collection(db, 'timesheets'));
        const allTs = tsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const jobsToIndex = (await getDocs(qJobs)).docs.map(d => ({ id: d.id, ...d.data() }));
        const ids = new Set(jobsToIndex.map(j => j.id));

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

        // vehicles map
        const vSnap = await getDocs(collection(db, 'vehicles'));
        const vMap = vSnap.docs.reduce((acc, d) => {
          const v = { id: d.id, ...d.data() };
          const keys = [v.id, v.name, v.registration].filter(Boolean);
          keys.forEach((k) => (acc[String(k)] = v));
          return acc;
        }, {});
        setVehicleMap(vMap);
      } catch (e) {
        console.error('Error fetching job/timesheet data:', e);
      }
    };

    fetchAll();
  }, [jobId, isJobNumber]);



  const computeIsPaid = (job) =>
    job.status === 'Paid' || (job.invoiceStatus && job.invoiceStatus.toLowerCase().includes('paid'));

const saveJobStatus = async (id, status) => {
  try {
    // we need the job to know which vehicles are on it
    const job = relatedJobs.find((j) => j.id === id);
    const updates = { status };

    // if setting job to Complete, also Complete all selected vehicles
    if (status === 'Complete' && job) {
      Object.assign(updates, buildVehicleNameStatusUpdates(job, 'Complete'));
    }

    await updateDoc(doc(db, 'bookings', id), updates);

    setStatusByJob((p) => ({ ...p, [id]: status }));
    setSelectedStatusByJob((p) => ({ ...p, [id]: status }));
    alert(`Status updated to ${status}`);
  } catch (e) {
    console.error(e);
    alert('Failed to update status.');
  }
};


  const saveJobSummary = async (id) => {
    const notes = dayNotes[id]?.general || '';
    try {
      await updateDoc(doc(db, 'bookings', id), { generalNotes: notes });
      alert('Summary saved.');
    } catch (e) {
      console.error(e);
      alert('Failed to save summary.');
    }
  };

  const deleteJob = async (id) => {
    if (!window.confirm('Delete this job? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'bookings', id));
      alert('Job deleted.');
      router.push('/job-sheet');
    } catch (e) {
      console.error(e);
      alert('Failed to delete job.');
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

      const safeName = file.name.replace(/\s+/g, '_');
      const stamp = Date.now();
      const path = `job_attachments/${jid}/${stamp}_${safeName}`;

      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file, { contentType: file.type || 'application/pdf' });

      task.on(
        'state_changed',
        (snap) => {
          const prog = (snap.bytesTransferred / snap.totalBytes) * 100;
          setProgressByJob((p) => ({ ...p, [jid]: Math.round(prog) }));
        },
        (err) => {
          console.error(err);
          setErrorByJob((p) => ({ ...p, [jid]: err.message || 'Upload failed' }));
          setUploadingByJob((p) => ({ ...p, [jid]: false }));
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);

          const attachment = {
            name: file.name,
            size: file.size,
            type: file.type || 'application/pdf',
            url,
            storagePath: path,
            uploadedAt: new Date().toISOString(),
          };

          await updateDoc(doc(db, 'bookings', jid), {
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
          alert('PDF uploaded.');
        }
      );
    } catch (e) {
      console.error(e);
      setErrorByJob((p) => ({ ...p, [jid]: e.message || 'Upload failed' }));
      setUploadingByJob((p) => ({ ...p, [jid]: false }));
    }
  };

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

  /* ────────────────────────────────────────────────────────────
     Render (fills page, no overlaps)
  ─────────────────────────────────────────────────────────────*/
  return (
    <HeaderSidebarLayout>
      <div style={{ width: '100%', minHeight: '100vh', backgroundColor: UI.bg, color: UI.text }}>
        {/* Sticky page header */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            background: '#ffffffcc',
            backdropFilter: 'saturate(180%) blur(6px)',
            borderBottom: UI.border,
            height: LAYOUT.HEADER_H,
          }}
        >
          <div
            style={{
              width: 'min(1400px, 100%)',
              margin: '0 auto',
              padding: `0 ${LAYOUT.PAGE_PAD_X}px`,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minWidth: 0,
            }}
          >
            <button
              onClick={() => router.back()}
              style={{ backgroundColor: UI.chipBg, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 14 }}
            >
              ← Back
            </button>
            <div style={{ fontWeight: 900, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Job Group: {prefix}
            </div>
          </div>
        </div>

        {/* Page content (pushed below sticky header) */}
        <div
          style={{
            width: 'min(1600px, 100%)',
            margin: '0 auto',
            padding: `16px ${LAYOUT.PAGE_PAD_X}px 48px`,
            paddingTop: LAYOUT.HEADER_H + 12,
            minWidth: 0,
          }}
        >
          {relatedJobs.map((rawJob) => {
            const job = normalizeVehiclesForJob(rawJob, vehicleMap);
            const currentDbStatus = statusByJob[job.id] || 'Pending';
            const selected = selectedStatusByJob[job.id] ?? currentDbStatus;
            const isPaid = computeIsPaid(job);
            const timesheets = (timesheetsByJob[job.id] || []).slice().sort((a, b) => {
              const t = (v) => parseDateFlexible(v)?.getTime() || 0;
              return t(b.weekStart) - t(a.weekStart);
            });
            const uploadError = errorByJob[job.id];
            const fileSelected = pdfFileByJob[job.id];

            const cards = timesheets.map((ts) => renderTimesheet(ts, job, vehicleMap, true)).filter(Boolean);

            const jobNotesText = [job.jobNotes, job.notes, job.generalNotes].filter(Boolean).join('\n\n');
            const hasNotesByDate = job.notesByDate && typeof job.notesByDate === 'object' && Object.keys(job.notesByDate).length > 0;

            return (
              <section
                key={job.id}
                style={{
                  border: job.id === jobId ? `2px solid ${UI.brand}` : UI.border,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 24,
                  boxShadow: UI.shadow,
                  background: job.id === jobId ? '#f8fbff' : '#fff',
                  minWidth: 0, // prevents overflow in grid
                }}
              >
                {/* Job strip header */}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 10,
                    background: UI.bgAlt,
                    border: UI.border,
                    marginBottom: 12,
                    flexWrap: 'wrap',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 30,
                        height: 24,
                        padding: '0 8px',
                        borderRadius: 8,
                        background: '#eef2ff',
                        border: '1px solid #e5e7eb',
                        fontWeight: 900,
                        fontSize: 12,
                        color: '#3730a3',
                      }}
                      title="Job prefix"
                    >
                      {splitJobNumber(job.jobNumber || '').prefix || '—'}
                    </span>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 16,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '50vw',
                      }}
                      title={`${job.client || 'Booking'} — #${job.jobNumber || job.id}`}
                    >
                      {job.client || 'Booking'} — #{job.jobNumber || job.id}
                    </div>
                    <div style={{ marginLeft: 8 }}>
                      <StatusPill value={currentDbStatus} />
                    </div>
                    {isPaid && <div style={{ marginLeft: 6 }}><PaidPill /></div>}
                  </div>

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => router.push(`/edit-booking/${job.id}`)}
                      style={{ backgroundColor: UI.brand, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteJob(job.id)}
                      style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Two-column layout (fills page, no overflow) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
                    gap: 16,
                    alignItems: 'start',
                    minWidth: 0,
                  }}
                >
                  {/* LEFT: Overview + Timesheets */}
                  <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
                    <div style={{ background: '#fff', border: UI.border, borderRadius: UI.radius, padding: 14, minWidth: 0 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr)', rowGap: 8, columnGap: 12, fontSize: 14, minWidth: 0 }}>
                        <div style={{ color: UI.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 12 }}>Location</div>
                        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{job.location || '—'}</div>

                        <div style={{ color: UI.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 12 }}>Team</div>
                        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{renderEmployees(job.employees) || '—'}</div>

                        <div style={{ color: UI.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 12 }}>Dates</div>
                        <div style={{ minWidth: 0 }}>{renderDateBlock(job)}</div>
                      </div>

                      {/* Vehicles */}
                      {Array.isArray(job.vehicles) && job.vehicles.length > 0 && (
                        <div style={{ marginTop: 14, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, marginBottom: 8 }}>Vehicles</div>
                          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                            {job.vehicles.map((v, i) => {
                              const reg = (v.registration || '').toString().toUpperCase();
                              const title = v.name || [v.manufacturer, v.model].filter(Boolean).join(' ') || 'Vehicle';
                              const subBits = [reg && `Reg: ${reg}`].filter(Boolean);
                              return (
                                <div key={i} style={{ border: UI.border, borderRadius: 8, padding: 8, background: UI.bgAlt, minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, color: UI.text, overflowWrap: 'anywhere' }}>🚗 {title}</div>
                                  {subBits.length > 0 && (
                                    <div style={{ color: '#374151', fontSize: 13, marginTop: 4, overflowWrap: 'anywhere' }}>
                                      {subBits.join(' • ')}
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
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>Job Notes</div>
                          {jobNotesText && (
                            <div style={{ whiteSpace: 'pre-wrap', color: UI.text, fontSize: 14, background: UI.bgAlt, border: UI.border, borderRadius: 8, padding: 10, minWidth: 0, overflowWrap: 'anywhere' }}>
                              {jobNotesText}
                            </div>
                          )}
                          {hasNotesByDate && (
                            <div style={{ marginTop: 10, display: 'grid', gap: 6, minWidth: 0 }}>
                              {Object.keys(job.notesByDate)
                                .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                                .sort()
                                .map((dateKey) => {
                                  const note = job.notesByDate[dateKey];
                                  if (!note) return null;
                                  const nice = new Date(dateKey).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
                                  return (
                                    <div key={dateKey} style={{ fontSize: 13, color: UI.text, overflowWrap: 'anywhere' }}>
                                      <strong style={{ color: UI.muted }}>{nice}:</strong> {note}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Timesheets */}
                    <div style={{ background: '#fff', border: UI.border, borderRadius: UI.radius, padding: 14, minWidth: 0 }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>
                        Linked Timesheets ⏱️
                        <span style={{ marginLeft: 8, fontWeight: 500, color: UI.muted, fontSize: 13 }}>
                          ({(timesheetsByJob[job.id] || []).length} found)
                        </span>
                      </h4>
                      {cards.length ? (
                        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>{cards.map((card, i) => <div key={i}>{card}</div>)}</div>
                      ) : (
                        <div style={{ color: UI.muted, padding: 10, border: '1px dashed #d1d5db', borderRadius: 6 }}>
                          No timesheet days found for this job yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Actions (sticky below page header) */}
                  <div style={{ display: 'grid', gap: 12, alignSelf: 'start', position: 'sticky', top: LAYOUT.HEADER_H + LAYOUT.STICKY_GAP, minWidth: 0 }}>
                    {/* Status */}
                    <div style={{ backgroundColor: '#eef2ff', padding: 14, borderRadius: 8, border: '1px solid #a5b4fc', minWidth: 0 }}>
                      <h4 style={{ marginTop: 0, marginBottom: 10, fontSize: 16 }}>Update Status</h4>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {['Ready to Invoice', 'Needs Action', 'Complete'].map((opt) => {
                          const active = selected === opt;
                          const color = statusColor(opt);
                          return (
                            <button
                              key={opt}
                              onClick={() => {
                                if (!isPaid) setSelectedStatusByJob((prev) => ({ ...prev, [job.id]: opt }));
                              }}
                              disabled={isPaid}
                              style={{
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: active ? `2px solid ${color}` : '1px solid #c7d2fe',
                                background: active ? `${color}20` : '#eef2ff',
                                color: active ? color : '#1f2937',
                                fontWeight: 700,
                                cursor: isPaid ? 'not-allowed' : 'pointer',
                                opacity: isPaid ? 0.5 : 1,
                                fontSize: 13,
                              }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => {
                          const chosen = selectedStatusByJob[job.id] ?? currentDbStatus;
                          if (chosen !== currentDbStatus) saveJobStatus(job.id, chosen);
                        }}
                        disabled={isPaid || (selectedStatusByJob[job.id] ?? currentDbStatus) === currentDbStatus}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#111827',
                          color: '#fff',
                          fontWeight: 700,
                          cursor: 'pointer',
                          opacity: isPaid || (selectedStatusByJob[job.id] ?? currentDbStatus) === currentDbStatus ? 0.5 : 1,
                          fontSize: 14,
                          width: '100%',
                        }}
                      >
                        Save Status Change
                      </button>
                    </div>

                    {/* Notes & PO */}
                    <div style={{ background: UI.bgAlt, padding: 14, borderRadius: 8, border: UI.border, minWidth: 0 }}>
                      <h4 style={{ marginTop: 0, marginBottom: 10, fontSize: 16 }}>Notes & PO</h4>

                      <label style={{ fontWeight: 700, display: 'block', marginBottom: 6, fontSize: 12, color: UI.muted }}>General Summary</label>
                      <textarea
                        rows={3}
                        value={dayNotes?.[job.id]?.general || ''}
                        onChange={(e) =>
                          setDayNotes((prev) => ({
                            ...prev,
                            [job.id]: { ...(prev?.[job.id] || {}), general: e.target.value },
                          }))
                        }
                        placeholder="Add general summary…"
                        style={{
                          width: '100%',
                          border: '1px solid #d1d5db',
                          borderRadius: 8,
                          padding: 8,
                          fontSize: 13,
                          resize: 'vertical',
                          background: '#fff',
                          marginBottom: 10,
                        }}
                      />
                      <button
                        onClick={() => saveJobSummary(job.id)}
                        style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 14, width: '100%' }}
                      >
                        Save Summary
                      </button>

                      <div style={{ marginTop: 12 }}>
                        <label style={{ fontWeight: 700, display: 'block', marginBottom: 6, fontSize: 12, color: UI.muted }}>Purchase Order (PO)</label>
                        <input
                          type="text"
                          defaultValue={job.po || ''}
                          onBlur={(e) => updateDoc(doc(db, 'bookings', job.id), { po: e.target.value })}
                          placeholder="Enter PO reference…"
                          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: 8, fontSize: 13, background: '#fff' }}
                        />
                      </div>
                    </div>

                    {/* Attachments */}
                    <div style={{ background: '#fff', padding: 14, borderRadius: 8, border: UI.border, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>
                        {job.pdfUrl ? 'Job Attachment (PDF)' : 'Upload Job Attachment'}
                      </div>

                      {job.pdfUrl && (
                        <div style={{ marginBottom: 8 }}>
                          <a href={job.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: UI.brand, textDecoration: 'underline', fontSize: 14 }}>
                            View Current PDF
                          </a>
                        </div>
                      )}

                      {Array.isArray(job.attachments) && job.attachments.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Attachments</div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {job.attachments.map((att, i) => (
                              <li key={i} style={{ fontSize: 13 }}>
                                <a href={att.url} target="_blank" rel="noopener noreferrer">
                                  {att.name}
                                </a>
                                <span style={{ color: UI.muted }}>
                                  {' '}• {(att.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <input type="file" accept="application/pdf" onChange={(e) => onPdfSelect(job.id, e.target.files?.[0])} style={{ marginBottom: 8, fontSize: 14 }} />

                      <button
                        type="button"
                        onClick={() => uploadPdfForJob(job.id)}
                        disabled={uploadingByJob[job.id] || !fileSelected}
                        style={{
                          backgroundColor: '#111827',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 12px',
                          cursor: uploadingByJob[job.id] || !fileSelected ? 'not-allowed' : 'pointer',
                          opacity: uploadingByJob[job.id] || !fileSelected ? 0.6 : 1,
                          fontSize: 14,
                          width: '100%',
                        }}
                      >
                        {uploadingByJob[job.id]
                          ? `Uploading… ${progressByJob[job.id] ?? 0}%`
                          : fileSelected
                            ? job.pdfUrl ? 'Replace / Add PDF' : 'Upload PDF'
                            : 'Select file'}
                      </button>
                      {uploadError && <p style={{ color: 'red', fontSize: 12, marginTop: 4 }}>{uploadError}</p>}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}
