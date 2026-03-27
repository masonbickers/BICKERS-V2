"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import EditMaintenanceBookingForm from "./EditMaintenanceBookingForm";
import MaintenanceBookingForm from "./MaintenanceBookingForm";

const EMPTY_VALUE = "-";

const toJsDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (value) => {
  const d = toJsDate(value);
  return d ? d.toLocaleDateString("en-GB") : EMPTY_VALUE;
};

const fmtText = (value) => {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  return String(value);
};

const formatNamedList = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return EMPTY_VALUE;

  const values = items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";

      const name = String(item.name || item.vehicleName || item.label || "").trim();
      const registration = String(item.registration || item.reg || "").trim().toUpperCase();
      if (name && registration) return `${name} (${registration})`;
      return name || registration || "";
    })
    .filter(Boolean);

  return values.length ? values.join(", ") : EMPTY_VALUE;
};

const deriveType = (event = {}) => {
  const kind = String(event.kind || "").toUpperCase();
  if (kind.includes("MOT")) return "MOT";
  if (kind.includes("SERVICE")) return "SERVICE";
  if (kind.includes("INSPECTION")) return "INSPECTION";
  return String(event.maintenanceType || event.type || "MAINTENANCE").toUpperCase();
};

export default function DashboardMaintenanceModal({ event, onClose }) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState(null);
  const [booking, setBooking] = useState(null);
  const [job, setJob] = useState(null);
  const [showBookType, setShowBookType] = useState("");
  const [showEditBooking, setShowEditBooking] = useState(false);
  const [showEditJob, setShowEditJob] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jobType, setJobType] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobPlannedDate, setJobPlannedDate] = useState("");
  const [jobDueDate, setJobDueDate] = useState("");
  const [jobPriority, setJobPriority] = useState("normal");
  const [jobStatus, setJobStatus] = useState("planned");
  const [jobNotes, setJobNotes] = useState("");

  const vehicleId = String(event?.vehicleId || "").trim();
  const bookingId = String(event?.__parentId || event?.id || "").trim();
  const eventType = deriveType(event);
  const isDueEvent =
    event?.__collection === "vehicleDueDates" ||
    event?.kind === "MOT" ||
    event?.kind === "SERVICE" ||
    event?.kind === "INSPECTION";
  const isMaintenanceJob = event?.__collection === "maintenanceJobs";
  const isBookingLikeEvent = !isDueEvent && !isMaintenanceJob && !!bookingId;
  const canBook =
    !!vehicleId &&
    (eventType === "MOT" || eventType === "SERVICE" || eventType === "INSPECTION");
  const canDeleteBooking = isBookingLikeEvent;
  const canEditBooking = isBookingLikeEvent;
  const canManageJob = isMaintenanceJob && !!bookingId;

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      try {
        if (vehicleId) {
          const vSnap = await getDoc(doc(db, "vehicles", vehicleId));
          if (active && vSnap.exists()) {
            setVehicle({ id: vSnap.id, ...(vSnap.data() || {}) });
          }
        }

        if (isBookingLikeEvent && bookingId) {
          const bSnap = await getDoc(doc(db, "maintenanceBookings", bookingId));
          if (active && bSnap.exists()) {
            setBooking({ id: bSnap.id, ...(bSnap.data() || {}) });
          }
        }

        if (event?.__collection === "maintenanceJobs" && bookingId) {
          const jSnap = await getDoc(doc(db, "maintenanceJobs", bookingId));
          if (active && jSnap.exists()) {
            const jobData = { id: jSnap.id, ...(jSnap.data() || {}) };
            setJob(jobData);
            setJobType(String(jobData.type || "").trim().toLowerCase() || "repair");
            setJobTitle(String(jobData.title || "").trim());
            setJobPlannedDate(String(jobData.plannedDate || "").slice(0, 10));
            setJobDueDate(String(jobData.dueDate || "").slice(0, 10));
            setJobPriority(String(jobData.priority || "normal").trim().toLowerCase());
            setJobStatus(String(jobData.status || "planned").trim().toLowerCase());
            setJobNotes(String(jobData.notes || ""));
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [vehicleId, bookingId, event?.__collection, isBookingLikeEvent]);

  const vehicleLabel = useMemo(() => {
    if (vehicle?.name && vehicle?.registration) {
      return `${vehicle.name} (${String(vehicle.registration).toUpperCase()})`;
    }
    if (vehicle?.name) return vehicle.name;
    if (event?.title) return event.title;
    return vehicleId || "Vehicle";
  }, [vehicle, event?.title, vehicleId]);

  const rangeText = useMemo(() => {
    const source = booking || job || event || {};
    const appointment = source.appointmentDate || source.appointmentDateISO;
    if (appointment) return fmtDate(appointment);
    if (source.startDate || source.endDate) {
      return `${fmtDate(source.startDate || source.start)} -> ${fmtDate(source.endDate || source.end)}`;
    }
    if (source.start || source.end) {
      return `${fmtDate(source.start)} -> ${fmtDate(source.end)}`;
    }
    return EMPTY_VALUE;
  }, [booking, job, event]);

  const bookingDetails = useMemo(() => {
    const source = booking || job || event || {};
    const appointment = source.appointmentDate || source.appointmentDateISO;
    const start = source.startDate || source.startDateISO || source.start;
    const end = source.endDate || source.endDateISO || source.end;
    const hasAppointment = !!appointment;
    const hasExplicitRange =
      !!source.startDate ||
      !!source.endDate ||
      !!source.startDateISO ||
      !!source.endDateISO;
    const isSingleDay = hasAppointment && !hasExplicitRange;
    const isMultiDay = hasExplicitRange;

    return {
      status: fmtText(source.status || source.bookingStatus || event?.status),
      bookingType: isMultiDay ? "Multi-day" : isSingleDay ? "Single day" : EMPTY_VALUE,
      isSingleDay,
      isMultiDay,
      appointmentDate: isSingleDay && hasAppointment ? fmtDate(appointment) : EMPTY_VALUE,
      startDate: isMultiDay && start ? fmtDate(start) : EMPTY_VALUE,
      endDate: isMultiDay && end ? fmtDate(end) : EMPTY_VALUE,
      provider: fmtText(source.provider),
      bookingRef: fmtText(source.bookingRef),
      location: fmtText(source.location),
      cost: fmtText(source.cost),
      notes: fmtText(source.notes),
      vehicles: formatNamedList(source.vehicles),
      equipment: formatNamedList(source.equipment),
    };
  }, [booking, job, event]);

  if (!event || loading) return null;

  const handleDelete = async () => {
    if (!canDeleteBooking || deleting) return;
    const ok = window.confirm("Delete this maintenance booking?");
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "maintenanceBookings", bookingId));
      onClose?.();
    } catch (error) {
      console.error("[DashboardMaintenanceModal] delete failed:", error);
      alert("Could not delete booking.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteJob = async () => {
    if (!canManageJob || deleting) return;
    const ok = window.confirm("Delete this maintenance job?");
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "maintenanceJobs", bookingId));
      onClose?.();
    } catch (error) {
      console.error("[DashboardMaintenanceModal] maintenance job delete failed:", error);
      alert("Could not delete maintenance job.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveJob = async () => {
    if (!canManageJob || savingJob) return;
    if (!jobTitle.trim()) return alert("Enter a job title.");

    setSavingJob(true);
    try {
      const patch = {
        type: String(jobType || "repair").trim().toLowerCase(),
        title: jobTitle.trim(),
        plannedDate: String(jobPlannedDate || "").trim(),
        dueDate: String(jobDueDate || "").trim(),
        priority: String(jobPriority || "normal").trim().toLowerCase(),
        status: String(jobStatus || "planned").trim().toLowerCase(),
        notes: String(jobNotes || "").trim(),
        updatedAt: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      };
      await updateDoc(doc(db, "maintenanceJobs", bookingId), patch);
      setJob((prev) => ({ ...(prev || {}), ...patch }));
      setShowEditJob(false);
      onClose?.();
    } catch (error) {
      console.error("[DashboardMaintenanceModal] maintenance job save failed:", error);
      alert("Could not update maintenance job.");
    } finally {
      setSavingJob(false);
    }
  };

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={modal}>
        <div style={header}>
          <div>
            <div style={eyebrow}>Dashboard Maintenance</div>
            <h2 style={title}>{eventType === "MAINTENANCE" ? "Maintenance" : eventType}</h2>
          </div>
          <button onClick={onClose} style={closeBtn} type="button" aria-label="Close">
            x
          </button>
        </div>

        <div style={card}>
          <Row label="Vehicle" value={vehicleLabel} />
          <Row label="Type" value={eventType} />
          <Row label="Status" value={isDueEvent ? event?.bookingStatus || "Due" : bookingDetails.status} />
          <Row
            label={isDueEvent ? "Due Date" : "Date(s)"}
            value={isDueEvent ? fmtDate(event?.dueDate || event?.start) : rangeText}
          />
          {isDueEvent && event?.isoWeek ? <Row label="ISO Week" value={event.isoWeek} /> : null}
          {canEditBooking && <Row label="Booking Type" value={bookingDetails.bookingType} />}
          {canEditBooking && bookingDetails.isSingleDay && (
            <Row label="Appointment" value={bookingDetails.appointmentDate} />
          )}
          {canEditBooking && bookingDetails.isMultiDay && (
            <Row label="Start Date" value={bookingDetails.startDate} />
          )}
          {canEditBooking && bookingDetails.isMultiDay && (
            <Row label="End Date" value={bookingDetails.endDate} />
          )}
          <Row label="Provider" value={bookingDetails.provider} />
          {canEditBooking && <Row label="Reference" value={bookingDetails.bookingRef} />}
          {canEditBooking && <Row label="Location" value={bookingDetails.location} />}
          {canEditBooking && <Row label="Cost" value={bookingDetails.cost} />}
          {canEditBooking && <Row label="Vehicles" value={bookingDetails.vehicles} />}
          {canEditBooking && <Row label="Equipment" value={bookingDetails.equipment} />}
          <Row label="Notes" value={bookingDetails.notes} />
        </div>

        <div style={actions}>
          {canBook && (
            <button
              type="button"
              style={primaryBtn}
              onClick={() =>
                setShowBookType(
                  eventType === "SERVICE"
                    ? "SERVICE"
                    : eventType === "INSPECTION"
                    ? "INSPECTION"
                    : "MOT"
                )
              }
            >
              {eventType === "SERVICE"
                ? "Book Service"
                : eventType === "INSPECTION"
                ? "Book Inspection"
                : "Book MOT"}
            </button>
          )}

          {vehicleId && (
            <button
              type="button"
              style={ghostBtn}
              onClick={() => router.push(`/vehicle-edit/${encodeURIComponent(vehicleId)}`)}
            >
              Open Vehicle
            </button>
          )}

          {canEditBooking && (
            <button type="button" style={primaryBtn} onClick={() => setShowEditBooking(true)}>
              Edit Booking
            </button>
          )}

          {canManageJob && (
            <button type="button" style={primaryBtn} onClick={() => setShowEditJob((prev) => !prev)}>
              {showEditJob ? "Close Editor" : "Edit Job"}
            </button>
          )}

          {canEditBooking && bookingId && (
            <button
              type="button"
              style={ghostBtn}
              onClick={() => router.push(`/maintenance/${encodeURIComponent(bookingId)}`)}
            >
              Open Booking
            </button>
          )}

          {canManageJob && (
            <button
              type="button"
              style={ghostBtn}
              onClick={() => router.push("/maintenance-jobs")}
            >
              Open Jobs
            </button>
          )}

          {canDeleteBooking && (
            <button type="button" style={dangerBtn} onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Booking"}
            </button>
          )}

          {canManageJob && (
            <button type="button" style={dangerBtn} onClick={handleDeleteJob} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Job"}
            </button>
          )}
        </div>

        {showBookType && vehicleId && (
          <div style={{ marginTop: 12 }}>
            <MaintenanceBookingForm
              vehicleId={vehicleId}
              type={showBookType}
              defaultDate={
                (event?.dueDate ? new Date(event.dueDate) : toJsDate(event?.start))
                  ?.toISOString?.()
                  .slice(0, 10) || ""
              }
              sourceDueDate={
                (event?.dueDate ? new Date(event.dueDate) : toJsDate(event?.start))
                  ?.toISOString?.()
                  .slice(0, 10) || ""
              }
              sourceDueIsoWeek={event?.isoWeek || ""}
              sourceDueKey={String(event?.id || "")}
              onClose={() => setShowBookType("")}
              onSaved={() => {
                setShowBookType("");
                onClose?.();
              }}
            />
          </div>
        )}

        {showEditBooking && canEditBooking && (
          <EditMaintenanceBookingForm
            bookingId={bookingId}
            vehicleId={vehicleId || undefined}
            onClose={() => setShowEditBooking(false)}
            onSaved={() => {
              setShowEditBooking(false);
              onClose?.();
            }}
          />
        )}

        {showEditJob && canManageJob && (
          <div style={jobEditorCard}>
            <div style={jobEditorTitle}>Edit Maintenance Job</div>
            <div style={jobGrid}>
              <Field label="Type">
                <select value={jobType} onChange={(e) => setJobType(e.target.value)} style={fieldInput}>
                  <option value="service">Service</option>
                  <option value="mot">MOT</option>
                  <option value="inspection">Inspection</option>
                  <option value="repair">Repair</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} style={fieldInput}>
                  <option value="planned">Planned</option>
                  <option value="awaiting_parts">Awaiting Parts</option>
                  <option value="in_progress">In Progress</option>
                  <option value="qa">QA</option>
                  <option value="complete">Complete</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Job Title" full>
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Planned Date">
                <input type="date" value={jobPlannedDate} onChange={(e) => setJobPlannedDate(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Due Date">
                <input type="date" value={jobDueDate} onChange={(e) => setJobDueDate(e.target.value)} style={fieldInput} />
              </Field>
              <Field label="Priority">
                <select value={jobPriority} onChange={(e) => setJobPriority(e.target.value)} style={fieldInput}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
              <Field label="Notes" full>
                <textarea value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} rows={4} style={{ ...fieldInput, resize: "vertical" }} />
              </Field>
            </div>
            <div style={jobEditorActions}>
              <button type="button" style={ghostBtn} onClick={() => setShowEditJob(false)} disabled={savingJob}>
                Cancel
              </button>
              <button type="button" style={primaryBtn} onClick={handleSaveJob} disabled={savingJob}>
                {savingJob ? "Saving..." : "Save Job"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={row}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value || EMPTY_VALUE}</div>
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div style={full ? fullField : undefined}>
      <div style={fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
  padding: 16,
};

const modal = {
  width: "min(720px, 96vw)",
  maxHeight: "90vh",
  overflow: "auto",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  padding: 16,
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const eyebrow = {
  fontSize: 12,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const title = {
  margin: "4px 0 0",
  fontSize: 24,
  color: "#0f172a",
};

const closeBtn = {
  border: "none",
  background: "transparent",
  fontSize: 24,
  lineHeight: 1,
  color: "#64748b",
  cursor: "pointer",
};

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  background: "#fafafa",
};

const row = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px dashed #e5e7eb",
};

const labelStyle = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 800,
  textTransform: "uppercase",
};

const valueStyle = {
  fontSize: 14,
  color: "#0f172a",
  fontWeight: 600,
};

const actions = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 12,
};

const primaryBtn = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #1d4ed8",
  background: "#1d4ed8",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const ghostBtn = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerBtn = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const jobEditorCard = {
  marginTop: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  background: "#fafafa",
};

const jobEditorTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 12,
};

const jobGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldLabel = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 800,
  textTransform: "uppercase",
  marginBottom: 6,
};

const fieldInput = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
};

const fullField = {
  gridColumn: "1 / -1",
};

const jobEditorActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 12,
};
