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
   Helpers
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
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 600,
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
   NEW: status auto-complete helpers
─────────────────────────────────────────────────────────────*/
// Local "YYYY-MM-DD" without time-zone surprises
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

// Decide the last date a booking runs: bookingDates[] > endDate > date/startDate
const getLastBookingDateISO = (b) => {
  if (Array.isArray(b.bookingDates) && b.bookingDates.length) {
    return latestOf(b.bookingDates);
  }
  const end = b.endDate ? toLocalISODate(b.endDate) : null;
  const single = (b.date || b.startDate) ? toLocalISODate(b.date || b.startDate) : null;
  return end || single || null;
};

/* ────────────────────────────────────────────────────────────
   Day Details (full info for a single day)
─────────────────────────────────────────────────────────────*/
const DayDetails = ({ day, iso, entry, jobId }) => {
  const hours = getHours(entry);
  const mode = String(entry?.mode ?? '').toLowerCase();
  const explicitlyLinked = entry?.bookingId === jobId;

  const Row = ({ label, children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6, fontSize: 12 }}>
      <div style={{ color: '#6b7280' }}>{label}</div>
      <div style={{ color: '#111827' }}>{children}</div>
    </div>
  );

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 10,
        background: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: '#111827' }}>{day}</div>
        <div style={{ color: '#6b7280', fontSize: 12 }}>{iso || '—'}</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#111827', fontWeight: 700 }}>{hours.toFixed(1)}h</div>
      </div>

      <Row label="Mode">
        <span style={{ fontWeight: 700, color: explicitlyLinked ? '#059669' : '#111827' }}>
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
   Timesheet renderer — ONLY corresponding job days + full info
─────────────────────────────────────────────────────────────*/
const renderTimesheet = (ts, job, vehicleMap, onlyJobDays = true) => {
  const dayMap = ts.days || {};
  const jobDates = new Set(Array.isArray(job.bookingDates) ? job.bookingDates : []);
  const snapshotByDay = ts.jobSnapshot?.byDay || {}; // { Monday: [{bookingId,...}], ... }

  // Build ISO date per weekday for this timesheet
  const ws = parseDateFlexible(ts.weekStart);
  const isoByDay = {};
  if (ws) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      isoByDay[dayOrder[i]] = format(d, 'yyyy-MM-dd');
    }
  }

  // Relevant days = explicit link OR snapshot link OR date match
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
  if (onlyJobDays && daysToRender.length === 0) return null; // nothing to show for this timesheet

  return (
    <div
      style={{
        border: '1px solid #d1d5db',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        backgroundColor: ts.submitted ? '#f9fafb' : '#fff7ed',
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 8,
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: 8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 'bold', color: '#1f2937' }}>
          Week of {ws ? format(ws, 'dd/MM/yyyy') : '—'}
        </div>
        <div style={{ fontSize: 14, color: '#4b5563' }}>
          <strong>Emp:</strong> {ts.employeeName || ts.employeeCode || '—'}
        </div>
        {onlyJobDays && (
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Showing {daysToRender.length} day{daysToRender.length !== 1 ? 's' : ''} for this job
          </div>
        )}
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
          }}
        >
          Open →
        </a>
      </div>

      {/* compact summary — only relevant days */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${daysToRender.length}, 1fr)`,
          marginTop: 8,
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        {daysToRender.map((day, i) => {
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
          let color = '#111827';
          const emphasise = explicitlyLinked;

          if (mode === 'holiday') {
            label = 'HOL';
            color = '#78350f';
          } else if (mode === 'off' || hours === 0) {
            label = 'OFF';
            color = '#4b5563';
          } else if (mode === 'yard') {
            label = emphasise ? 'Yard*' : 'Yard';
            color = emphasise ? '#1050ff' : '#1e40af';
          } else if (mode === 'travel') {
            label = emphasise ? 'Travel*' : 'Travel';
            color = emphasise ? '#068f66' : '#065f46';
          } else if (mode === 'onset' || mode === 'set' || mode === 'work') {
            label = emphasise ? 'Set*' : 'Set';
            color = '#059669';
          }

          return (
            <div
              key={day}
              style={{
                padding: '4px 2px',
                borderRight: i < daysToRender.length - 1 ? '1px dashed #e5e7eb' : 'none',
                opacity: mode === 'off' ? 0.7 : 1,
              }}
            >
              <div style={{ fontWeight: 600, color }}>
                {day.slice(0, 3)} <span style={{ color: '#6b7280' }}>({iso || '—'})</span>
              </div>
              <div style={{ color, fontWeight: 700, margin: '2px 0' }}>{label}</div>
              <div style={{ color: hours > 0 ? '#111827' : '#9ca3af' }}>{hours.toFixed(1)}h</div>
            </div>
          );
        })}
      </div>

      {/* full details for each relevant day */}
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {daysToRender.map((day) => (
          <DayDetails
            key={day}
            day={day}
            iso={isoByDay[day]}
            entry={dayMap[day] || {}}
            jobId={job.id}
          />
        ))}
      </div>

      {/* job vehicles (kept; detailed list shows in header card) */}
      {Array.isArray(job.vehicles) && job.vehicles.length > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px solid #e5e7eb',
            fontSize: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <strong style={{ color: '#4b5563' }}>Job Vehicles:</strong>
          {job.vehicles.map((nameOrObj, idx) => {
            const key =
              (nameOrObj && typeof nameOrObj === 'object' && (nameOrObj.id || nameOrObj.registration || nameOrObj.name)) ||
              (typeof nameOrObj === 'string' ? nameOrObj : '');
            const v = vehicleMap[key] || (typeof nameOrObj === 'object' ? nameOrObj : { name: String(nameOrObj || '') });
            const reg = (v.registration || '').toString().toUpperCase();
            const title = [v.manufacturer, v.model].filter(Boolean).join(' ');
            return (
              <span key={idx} style={{ color: '#059669', fontWeight: 700 }}>
                🚗 {v.name || title || 'Vehicle'} {reg ? `(${reg})` : ''}
              </span>
            );
          })}
        </div>
      )}
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
  const [vehicleMap, setVehicleMap] = useState({}); // ← full vehicle objects by multiple keys

  const [pdfFileByJob, setPdfFileByJob] = useState({});
  const [uploadingByJob, setUploadingByJob] = useState({});
  const [progressByJob, setProgressByJob] = useState({});
  const [errorByJob, setErrorByJob] = useState({});

  const isJobNumber = useMemo(() => {
    if (!jobId) return false;
    return typeof jobId === 'string' && jobId.length > 5 && jobId.includes('-');
  }, [jobId]);

  // Hydrate job.vehicles with full vehicle objects
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
        // 1) fetch bookings (main + related by prefix)
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

        // 2) fetch timesheets (group mapping)
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

        // 3) vehicles map (FULL OBJECTS, keyed by id, name, registration)
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

  /* ────────────────────────────────────────────────────────────
     Auto-flip Confirmed → Complete when last date has passed
  ─────────────────────────────────────────────────────────────*/
  const [autoCompleteRan, setAutoCompleteRan] = useState(false);
  useEffect(() => {
    if (autoCompleteRan || !relatedJobs.length) return;

    const todayISO = toLocalISODate(new Date());

    const candidates = relatedJobs.filter((j) => {
      const status = String(j.status || '').trim();
      if (status !== 'Confirmed') return false;
      const lastISO = getLastBookingDateISO(j);
      return lastISO && lastISO < todayISO;
    });

    if (!candidates.length) {
      setAutoCompleteRan(true);
      return;
    }

    (async () => {
      try {
        const batch = writeBatch(db);
        candidates.forEach((j) => {
          batch.update(doc(db, 'bookings', j.id), {
            status: 'Complete',
            statusAutoCompletedAt: serverTimestamp(),
            statusAutoCompletedReason: 'Ended before today (job page auto-complete)',
          });
        });
        await batch.commit();

        // reflect in UI
        setStatusByJob((prev) => {
          const next = { ...prev };
          candidates.forEach((j) => (next[j.id] = 'Complete'));
          return next;
        });
        setSelectedStatusByJob((prev) => {
          const next = { ...prev };
          candidates.forEach((j) => (next[j.id] = 'Complete'));
          return next;
        });
      } catch (e) {
        console.error('Auto-complete status update failed:', e);
      } finally {
        setAutoCompleteRan(true);
      }
    })();
  }, [relatedJobs, autoCompleteRan]);

  const computeIsPaid = (job) =>
    job.status === 'Paid' || (job.invoiceStatus && job.invoiceStatus.toLowerCase().includes('paid'));

  const saveJobStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
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

  // Upload + save pdfUrl AND push into attachments[]
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
            pdfUrl: url, // keep single field for convenience if you already use it
          });

          // update local state so UI reflects immediately
          setRelatedJobs((prev) =>
            prev.map((j) =>
              j.id !== jid
                ? j
                : {
                    ...j,
                    pdfUrl: url,
                    attachments: Array.isArray(j.attachments)
                      ? [...j.attachments, attachment]
                      : [attachment],
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

  return (
    <HeaderSidebarLayout>
      <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#ffffff', color: '#000', padding: '40px 24px' }}>
        <button
          onClick={() => router.back()}
          style={{ backgroundColor: '#e5e7eb', padding: '8px 16px', borderRadius: 8, marginBottom: 30, border: 'none', cursor: 'pointer', fontSize: 14 }}
        >
          ← Back to Job Sheet
        </button>

        <h1 style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 30 }}>Job #{prefix}</h1>

        {relatedJobs.map((rawJob) => {
          // Enrich vehicles for display
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

          // Only render timesheet cards that have at least one corresponding job day
          const cards = timesheets
            .map((ts) => renderTimesheet(ts, job, vehicleMap, true)) // true = only job days
            .filter(Boolean);

          // Pull notes variants
          const jobNotesText = [job.jobNotes, job.notes, job.generalNotes].filter(Boolean).join('\n\n');
          const hasNotesByDate = job.notesByDate && typeof job.notesByDate === 'object' && Object.keys(job.notesByDate).length > 0;

          return (
            <div
              key={job.id}
              style={{
                border: job.id === jobId ? '2px solid #2563eb' : '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 24,
                marginBottom: 30,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 24,
                backgroundColor: job.id === jobId ? '#eff6ff' : '#fff',
              }}
            >
              {/* Block 1: Main Job Info (+ full vehicles + job notes display) */}
              <div
                style={{
                  gridColumn: 'span 1',
                  backgroundColor: '#fff',
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', fontSize: 18 }}>
                  {job.client || 'Booking'} ({job.jobNumber || job.id})
                  <span style={{ marginLeft: 12 }}>
                    <StatusPill value={currentDbStatus} />
                  </span>
                  {isPaid && <span style={{ marginLeft: 8 }}><PaidPill /></span>}
                </h3>

                <div style={{ marginBottom: 10 }}>
                  <strong>Location:</strong> {job.location || '—'}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <strong>Team:</strong> {renderEmployees(job.employees) || '—'}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <strong>Dates:</strong>
                  <div style={{ marginTop: 4 }}>{renderDateBlock(job)}</div>
                </div>

                {/* Vehicles — full info */}
                {Array.isArray(job.vehicles) && job.vehicles.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Vehicles (full details)</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {job.vehicles.map((v, i) => {
                        const reg = (v.registration || '').toString().toUpperCase();
                        const title = v.name || [v.manufacturer, v.model].filter(Boolean).join(' ') || 'Vehicle';
                        const subBits = [
                          reg && `Reg: ${reg}`,
                 
                        ].filter(Boolean);
                        return (
                          <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#fafafa' }}>
                            <div style={{ fontWeight: 700, color: '#111827' }}>🚗 {title}</div>
                            {subBits.length > 0 && (
                              <div style={{ color: '#374151', fontSize: 13, marginTop: 4 }}>
                                {subBits.join(' • ')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Read-only Job Notes */}
                {(jobNotesText || hasNotesByDate) && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Job Notes (read-only)</div>
                    {jobNotesText && (
                      <div style={{ whiteSpace: 'pre-wrap', color: '#111827', fontSize: 14, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                        {jobNotesText}
                      </div>
                    )}
                    {hasNotesByDate && (
                      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                        {Object.keys(job.notesByDate)
                          .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                          .sort()
                          .map((dateKey) => {
                            const note = job.notesByDate[dateKey];
                            if (!note) return null;
                            const nice = new Date(dateKey).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
                            return (
                              <div key={dateKey} style={{ fontSize: 13, color: '#111827' }}>
                                <strong style={{ color: '#6b7280' }}>{nice}:</strong> {note}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

                {/* PDF upload + list */}
                <div style={{ marginTop: 20, padding: 12, borderRadius: 8, border: '1px dashed #cbd5e1', background: '#f8fafc' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    {job.pdfUrl ? 'Job Attachment (PDF)' : 'Upload Job Attachment'}
                  </div>

                  {job.pdfUrl && (
                    <div style={{ marginBottom: 8 }}>
                      <a href={job.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline', fontSize: 14 }}>
                        View Current PDF
                      </a>
                    </div>
                  )}

                  {Array.isArray(job.attachments) && job.attachments.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Attachments</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {job.attachments.map((att, i) => (
                          <li key={i} style={{ fontSize: 13 }}>
                            <a href={att.url} target="_blank" rel="noopener noreferrer">
                              {att.name}
                            </a>
                            <span style={{ color: '#6b7280' }}>
                              {' '}• {(att.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => onPdfSelect(job.id, e.target.files?.[0])}
                    style={{ marginBottom: 8, fontSize: 14 }}
                  />

                  <button
                    type="button"
                    onClick={() => uploadPdfForJob(job.id)}
                    disabled={uploadingByJob[job.id] || !fileSelected}
                    style={{
                      backgroundColor: '#111827',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 12px',
                      cursor: uploadingByJob[job.id] || !fileSelected ? 'not-allowed' : 'pointer',
                      opacity: uploadingByJob[job.id] || !fileSelected ? 0.6 : 1,
                      fontSize: 14,
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

                {/* Edit/Delete */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, gap: 8 }}>
                  <button
                    onClick={() => router.push(`/edit-booking/${job.id}`)}
                    style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
                  >
                    Edit Booking
                  </button>
                  <button
                    onClick={() => deleteJob(job.id)}
                    style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Block 2: Notes & PO (editable summary stays the same) */}
              <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ backgroundColor: '#f9fafb', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <h4 style={{ marginTop: 0, fontSize: 16 }}>Notes & PO</h4>

                  <label style={{ fontWeight: 600, display: 'block', marginBottom: 6, fontSize: 13 }}>General Summary</label>
                  <textarea
                    rows={3}
                    value={dayNotes?.[job.id]?.general || ''}
                    onChange={(e) =>
                      setDayNotes((prev) => ({
                        ...prev,
                        [job.id]: { ...(prev?.[job.id] || {}), general: e.target.value },
                      }))
                    }
                    placeholder="Add general summary for this job…"
                    style={{
                      width: '100%',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      padding: 8,
                      fontSize: 13,
                      resize: 'vertical',
                      background: '#fff',
                      marginBottom: 12,
                    }}
                  />
                  <button
                    onClick={() => saveJobSummary(job.id)}
                    style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
                  >
                    Save Summary
                  </button>

                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6, fontSize: 13 }}>Purchase Order (PO)</label>
                    <input
                      type="text"
                      defaultValue={job.po || ''}
                      onBlur={(e) => updateDoc(doc(db, 'bookings', job.id), { po: e.target.value })}
                      placeholder="Enter PO reference…"
                      style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: 8, fontSize: 13, background: '#fff' }}
                    />
                  </div>
                </div>

                {/* Block 3: Status */}
                <div style={{ backgroundColor: '#eef2ff', padding: 16, borderRadius: 8, border: '1px solid #a5b4fc', flexGrow: 1 }}>
                  <h4 style={{ marginTop: 0, fontSize: 16 }}>Update Status</h4>

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
                            borderRadius: 6,
                            border: active ? `2px solid ${color}` : '1px solid #c7d2fe',
                            background: active ? `${color}20` : '#eef2ff',
                            color: active ? color : '#1f2937',
                            fontWeight: 600,
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
                      borderRadius: 6,
                      border: 'none',
                      background: '#111827',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity:
                        isPaid || (selectedStatusByJob[job.id] ?? currentDbStatus) === currentDbStatus ? 0.5 : 1,
                      fontSize: 14,
                    }}
                  >
                    Save Status Change
                  </button>
                </div>
              </div>

              {/* Block 4: Linked Timesheets (only corresponding days, with full info) */}
              <div
                style={{
                  gridColumn: '1 / -1',
                  backgroundColor: '#ffffff',
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  marginTop: 8,
                }}
              >
                <h4 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>
                  Linked Timesheets ⏱️
                  <span style={{ marginLeft: 8, fontWeight: 500, color: '#6b7280', fontSize: 14 }}>
                    ({(timesheetsByJob[job.id] || []).length} found)
                  </span>
                </h4>

                {(() => {
                  const cards = (timesheetsByJob[job.id] || [])
                    .slice()
                    .sort((a, b) => {
                      const t = (v) => parseDateFlexible(v)?.getTime() || 0;
                      return t(b.weekStart) - t(a.weekStart);
                    })
                    .map((ts) => renderTimesheet(ts, job, vehicleMap, true))
                    .filter(Boolean);

                  return cards.length ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {cards.map((card, i) => (
                        <div key={i}>{card}</div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#6b7280', padding: 10, border: '1px dashed #d1d5db', borderRadius: 6 }}>
                      No timesheet days found for this job yet.
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </HeaderSidebarLayout>
  );
}
