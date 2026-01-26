// src/app/components/EditMaintenanceBookingForm.jsx
// ✅ Updated to match the NEW MaintenanceBookingForm + vehicle-edit page behaviour
// ✅ Ensures maintenanceBookings always have usable Date fields (startDate/endDate + appointmentDate for single day)
// ✅ Writes ISO helper fields too (appointmentDateISO/startDateISO/endDateISO) for easy UI
// ✅ Conflict checks ignore Cancelled/Declined and exclude current booking
// ✅ If status becomes "Completed": updates vehicle last/next (MOT or Service) using vehicle frequencies
// ✅ Cancel updates booking + vehicle summary
// ✅ Delete deletes booking + clears vehicle summary IF it was linked to this bookingId

"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  deleteDoc,
} from "firebase/firestore";

/**
 * Props:
 * - bookingId (required)  -> maintenanceBookings doc id
 * - vehicleId (optional)  -> if omitted, loads from booking doc
 * - onClose() (optional)
 * - onSaved(payload) (optional)
 */
export default function EditMaintenanceBookingForm({
  bookingId,
  vehicleId: vehicleIdProp,
  onClose,
  onSaved,
}) {
  const [vehicleId, setVehicleId] = useState(vehicleIdProp || "");
  const [vehicle, setVehicle] = useState(null);
  const [booking, setBooking] = useState(null);

  // form fields
  const [type, setType] = useState("MOT"); // "MOT" | "SERVICE"
  const [status, setStatus] = useState("Booked");

  const [isMultiDay, setIsMultiDay] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [provider, setProvider] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // conflict checks
  const [existing, setExisting] = useState([]);
  const [conflictMsg, setConflictMsg] = useState("");

  /* ───────────────── helpers ───────────────── */
  const ymdToDate = (ymd) => {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(+dt) ? null : dt;
  };

  const dateToYMD = (d) => {
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const clampISODate = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  };
  const todayISO = () => clampISODate(new Date());

  const parseISOorBlank = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const calcNextFromWeeks = (lastISO, freqWeeks) => {
    const last = parseISOorBlank(lastISO);
    const w = Number(freqWeeks || 0);
    if (!last || !w) return "";
    const d = new Date(last);
    d.setDate(d.getDate() + w * 7);
    return clampISODate(d);
  };

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
  };

  const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    const as = startOfDay(aStart).getTime();
    const ae = endOfDay(aEnd).getTime();
    const bs = startOfDay(bStart).getTime();
    const be = endOfDay(bEnd).getTime();
    return as <= be && bs <= ae;
  };

  const fmt = (d) => {
    if (!d) return "—";
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const completionISOFromBooking = ({ isMultiDay, appointmentDate, endDate, startDate }) => {
    if (!isMultiDay) return appointmentDate || "";
    return endDate || startDate || "";
  };

  const safeType = useMemo(() => {
    return String(type || "").toUpperCase() === "SERVICE" ? "SERVICE" : "MOT";
  }, [type]);

  const title = safeType === "MOT" ? "Edit MOT booking" : "Edit Service booking";

  const vehicleLabel = useMemo(() => {
    if (vehicle) return vehicle.name || vehicle.registration || vehicle.reg || vehicleId || "";
    return vehicleId || "";
  }, [vehicle, vehicleId]);

  const bookingDates = useMemo(() => {
    if (!isMultiDay) {
      const d = ymdToDate(appointmentDate);
      return { start: d, end: d };
    }
    return { start: ymdToDate(startDate), end: ymdToDate(endDate) };
  }, [isMultiDay, appointmentDate, startDate, endDate]);

  const activeConflict = useMemo(() => {
    setConflictMsg("");
    if (!bookingDates.start || !bookingDates.end) return null;

    const conflict = existing.find((b) => {
      if (b.id === bookingId) return false;

      const st = String(b.status || "").toLowerCase();
      if (st.includes("cancel")) return false;
      if (st.includes("declin")) return false;

      const bs =
        toDate(b.startDate) ||
        toDate(b.date) ||
        toDate(b.appointmentDate) ||
        null;

      const be =
        toDate(b.endDate) ||
        toDate(b.date) ||
        toDate(b.appointmentDate) ||
        bs;

      if (!bs || !be) return false;
      return rangesOverlap(bookingDates.start, bookingDates.end, bs, be);
    });

    if (!conflict) return null;

    const bs =
      toDate(conflict.startDate) ||
      toDate(conflict.date) ||
      toDate(conflict.appointmentDate) ||
      null;

    const be =
      toDate(conflict.endDate) ||
      toDate(conflict.date) ||
      toDate(conflict.appointmentDate) ||
      bs;

    return {
      id: conflict.id,
      type: conflict.type || "Maintenance",
      status: conflict.status || "Booked",
      from: bs,
      to: be,
      provider: conflict.provider || "",
    };
  }, [existing, bookingDates.start, bookingDates.end, bookingId]);

  useEffect(() => {
    if (!activeConflict) {
      setConflictMsg("");
      return;
    }
    setConflictMsg(
      `⚠️ Conflict: This vehicle already has a maintenance booking overlapping ${fmt(
        activeConflict.from
      )} → ${fmt(activeConflict.to)} (${activeConflict.type}, ${activeConflict.status})${
        activeConflict.provider ? ` — ${activeConflict.provider}` : ""
      }.`
    );
  }, [activeConflict]);

  /* ───────────────── load booking + vehicle + existing bookings ───────────────── */
  useEffect(() => {
    const run = async () => {
      if (!bookingId) return;

      setLoading(true);

      const bSnap = await getDoc(doc(db, "maintenanceBookings", bookingId));
      if (!bSnap.exists()) {
        setLoading(false);
        alert("Booking not found.");
        return;
      }

      const b = { id: bSnap.id, ...(bSnap.data() || {}) };
      setBooking(b);

      const resolvedVehicleId = vehicleIdProp || b.vehicleId || "";
      setVehicleId(resolvedVehicleId);

      // type/status
      const bType = String(b.type || b.kind || "MOT").toUpperCase();
      setType(bType === "SERVICE" ? "SERVICE" : "MOT");
      setStatus(b.status || "Booked");

      // dates: prefer ISO helper fields if present, else derive from Date/Timestamp fields
      const apptISO = String(b.appointmentDateISO || "").trim();
      const sISO = String(b.startDateISO || "").trim();
      const eISO = String(b.endDateISO || "").trim();

      const apptObj = b.appointmentDate ? toDate(b.appointmentDate) : null;
      const sObj = b.startDate ? toDate(b.startDate) : null;
      const eObj = b.endDate ? toDate(b.endDate) : null;

      if (apptISO || apptObj) {
        // single day
        setIsMultiDay(Boolean(b.isMultiDay) ? true : false); // respect stored flag if present
        if (!b.isMultiDay) {
          const ymd = apptISO || (apptObj ? dateToYMD(apptObj) : "");
          setIsMultiDay(false);
          setAppointmentDate(ymd);
          setStartDate(ymd);
          setEndDate(ymd);
        } else {
          // stored as multi-day but has appt fields; fall back to start/end
          const ys = sISO || (sObj ? dateToYMD(sObj) : apptISO || (apptObj ? dateToYMD(apptObj) : ""));
          const ye = eISO || (eObj ? dateToYMD(eObj) : ys);
          setIsMultiDay(true);
          setStartDate(ys);
          setEndDate(ye);
          setAppointmentDate(ys);
        }
      } else {
        // multi-day
        const ys = sISO || (sObj ? dateToYMD(sObj) : "");
        const ye = eISO || (eObj ? dateToYMD(eObj) : ys);
        setIsMultiDay(true);
        setStartDate(ys);
        setEndDate(ye);
        setAppointmentDate(ys);
      }

      setProvider(b.provider || "");
      setBookingRef(b.bookingRef || "");
      setLocation(b.location || "");
      setCost(b.cost ? String(b.cost) : "");
      setNotes(b.notes || "");

      // vehicle
      if (resolvedVehicleId) {
        const vSnap = await getDoc(doc(db, "vehicles", resolvedVehicleId));
        if (vSnap.exists()) setVehicle({ id: vSnap.id, ...vSnap.data() });
      } else {
        setVehicle(null);
      }

      // existing bookings
      if (resolvedVehicleId) {
        const qy = query(collection(db, "maintenanceBookings"), where("vehicleId", "==", resolvedVehicleId));
        const snap = await getDocs(qy);
        setExisting(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } else {
        setExisting([]);
      }

      setLoading(false);
    };

    run().catch((e) => {
      console.error("[EditMaintenanceBookingForm] load error:", e);
      setLoading(false);
      setExisting([]);
      alert("Could not load booking. Please refresh.");
    });
  }, [bookingId, vehicleIdProp]);

  // keep multi-day dates in sync when toggling
  useEffect(() => {
    if (loading) return;

    if (!isMultiDay) {
      setStartDate(appointmentDate || "");
      setEndDate(appointmentDate || "");
    } else {
      setStartDate((p) => p || appointmentDate || "");
      setEndDate((p) => p || appointmentDate || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiDay]);

  const canSubmit = useMemo(() => {
    if (saving || loading) return false;
    if (!bookingId) return false;
    if (!vehicleId) return false;

    if (!isMultiDay) {
      if (!appointmentDate) return false;
    } else {
      if (!startDate || !endDate) return false;
      const s = ymdToDate(startDate);
      const e = ymdToDate(endDate);
      if (!s || !e) return false;
      if (+s > +e) return false;
    }

    if (activeConflict) return false;
    return true;
  }, [saving, loading, bookingId, vehicleId, isMultiDay, appointmentDate, startDate, endDate, activeConflict]);

  const handleClose = () => {
    if (typeof onClose === "function") onClose();
  };

  const syncVehicleSummary = async ({
    safeType,
    status,
    isMultiDay,
    appointmentDate,
    startDate,
    endDate,
    provider,
    bookingRef,
    location,
    cost,
    notes,
    bookingId,
  }) => {
    if (!vehicleId) return;
    const vRef = doc(db, "vehicles", vehicleId);

    const completedISO =
      status === "Completed"
        ? completionISOFromBooking({ isMultiDay, appointmentDate, startDate, endDate })
        : "";

    if (safeType === "MOT") {
      const motFreqWeeks = Number(vehicle?.motFreq || 0);

      const updates = {
        motBookedStatus: status,
        motBookedOn: todayISO(),
        motAppointmentDate: !isMultiDay ? appointmentDate : "",
        motBookingStartDate: isMultiDay ? startDate : "",
        motBookingEndDate: isMultiDay ? endDate : "",
        motProvider: provider.trim(),
        motBookingRef: bookingRef.trim(),
        motLocation: location.trim(),
        motCost: cost ? String(cost).trim() : "",
        motBookingNotes: notes.trim(),
        motBookingId: bookingId,
        updatedAt: serverTimestamp(),
      };

      if (completedISO) {
        updates.lastMOT = completedISO;
        updates.nextMOT = calcNextFromWeeks(completedISO, motFreqWeeks);

        // optional clear summary details once completed
        updates.motAppointmentDate = "";
        updates.motBookingStartDate = "";
        updates.motBookingEndDate = "";
        updates.motProvider = "";
        updates.motBookingRef = "";
        updates.motLocation = "";
        updates.motCost = "";
        updates.motBookingNotes = "";
      }

      await updateDoc(vRef, updates);
    } else {
      const serviceFreqWeeks = Number(vehicle?.serviceFreq || 0);

      const updates = {
        serviceBookedStatus: status,
        serviceBookedOn: todayISO(),
        serviceAppointmentDate: !isMultiDay ? appointmentDate : "",
        serviceBookingStartDate: isMultiDay ? startDate : "",
        serviceBookingEndDate: isMultiDay ? endDate : "",
        serviceProvider: provider.trim(),
        serviceBookingRef: bookingRef.trim(),
        serviceLocation: location.trim(),
        serviceCost: cost ? String(cost).trim() : "",
        serviceBookingNotes: notes.trim(),
        serviceBookingId: bookingId,
        updatedAt: serverTimestamp(),
      };

      if (completedISO) {
        updates.lastService = completedISO;
        updates.nextService = calcNextFromWeeks(completedISO, serviceFreqWeeks);

        // optional clear summary details once completed
        updates.serviceAppointmentDate = "";
        updates.serviceBookingStartDate = "";
        updates.serviceBookingEndDate = "";
        updates.serviceProvider = "";
        updates.serviceBookingRef = "";
        updates.serviceLocation = "";
        updates.serviceCost = "";
        updates.serviceBookingNotes = "";
      }

      await updateDoc(vRef, updates);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const start = bookingDates.start;
    const end = bookingDates.end;
    if (!start || !end) return;

    setSaving(true);
    try {
      const apptDateObj = !isMultiDay ? ymdToDate(appointmentDate) : null;
      const completedISO =
        status === "Completed"
          ? completionISOFromBooking({ isMultiDay, appointmentDate, startDate, endDate })
          : "";

      // 1) Update booking doc (calendar-safe Dates + ISO helpers)
      const bookingPayload = {
        kind: "MAINTENANCE",
        type: safeType,
        vehicleId,
        vehicleLabel: vehicleLabel || "",
        status,
        isMultiDay,
        startDate: start,
        endDate: end,
        appointmentDate: apptDateObj,
        appointmentDateISO: !isMultiDay ? appointmentDate : "",
        startDateISO: isMultiDay ? startDate : "",
        endDateISO: isMultiDay ? endDate : "",
        completedAtISO: completedISO || "",
        provider: provider.trim(),
        bookingRef: bookingRef.trim(),
        location: location.trim(),
        cost: cost ? String(cost).trim() : "",
        notes: notes.trim(),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "maintenanceBookings", bookingId), bookingPayload);

      // 2) Sync vehicle summary (and last/next if Completed)
      await syncVehicleSummary({
        safeType,
        status,
        isMultiDay,
        appointmentDate,
        startDate,
        endDate,
        provider,
        bookingRef,
        location,
        cost,
        notes,
        bookingId,
      });

      if (typeof onSaved === "function") onSaved({ id: bookingId, ...bookingPayload });
      if (typeof onClose === "function") onClose();
    } catch (err) {
      console.error("[EditMaintenanceBookingForm] save error:", err);
      alert("Failed to update maintenance booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!bookingId) return;
    if (!confirm("Mark this booking as Cancelled?")) return;

    setSaving(true);
    try {
      // booking
      await updateDoc(doc(db, "maintenanceBookings", bookingId), {
        status: "Cancelled",
        updatedAt: serverTimestamp(),
      });

      // vehicle summary
      if (vehicleId) {
        await syncVehicleSummary({
          safeType,
          status: "Cancelled",
          isMultiDay,
          appointmentDate,
          startDate,
          endDate,
          provider,
          bookingRef,
          location,
          cost,
          notes,
          bookingId,
        });
      }

      if (typeof onSaved === "function") onSaved({ id: bookingId, status: "Cancelled" });
      if (typeof onClose === "function") onClose();
    } catch (e) {
      console.error("[EditMaintenanceBookingForm] cancel error:", e);
      alert("Could not cancel booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ✅ REAL DELETE
  const handleDelete = async () => {
    if (!bookingId) return;
    if (!confirm("Delete this maintenance booking permanently? This cannot be undone.")) return;

    setSaving(true);
    try {
      // refresh vehicle doc for linkage check
      let vDoc = vehicle;
      if (!vDoc && vehicleId) {
        const vSnap = await getDoc(doc(db, "vehicles", vehicleId));
        if (vSnap.exists()) vDoc = { id: vSnap.id, ...vSnap.data() };
      }

      // 1) delete booking
      await deleteDoc(doc(db, "maintenanceBookings", bookingId));

      // 2) clear summary fields if vehicle points at this booking
      if (vehicleId && vDoc) {
        const vRef = doc(db, "vehicles", vehicleId);
        const shouldClearMot = String(vDoc.motBookingId || "") === String(bookingId);
        const shouldClearService = String(vDoc.serviceBookingId || "") === String(bookingId);

        const clears = {};
        if (shouldClearMot) {
          Object.assign(clears, {
            motBookingId: "",
            motBookedStatus: "",
            motBookedOn: "",
            motAppointmentDate: "",
            motBookingStartDate: "",
            motBookingEndDate: "",
            motProvider: "",
            motBookingRef: "",
            motLocation: "",
            motCost: "",
            motBookingNotes: "",
            motBookingFiles: [],
          });
        }
        if (shouldClearService) {
          Object.assign(clears, {
            serviceBookingId: "",
            serviceBookedStatus: "",
            serviceBookedOn: "",
            serviceAppointmentDate: "",
            serviceBookingStartDate: "",
            serviceBookingEndDate: "",
            serviceProvider: "",
            serviceBookingRef: "",
            serviceLocation: "",
            serviceCost: "",
            serviceBookingNotes: "",
          });
        }

        if (Object.keys(clears).length) {
          await updateDoc(vRef, { ...clears, updatedAt: serverTimestamp() });
        }
      }

      if (typeof onSaved === "function") onSaved({ id: bookingId, deleted: true });
      if (typeof onClose === "function") onClose();
    } catch (e) {
      console.error("[EditMaintenanceBookingForm] delete error:", e);
      alert(
        "Could not delete booking. If you see 'Missing or insufficient permissions', update your Firestore rules to allow deletes for this collection."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!bookingId) return null;

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={headerRow}>
          <div>
            <h2 style={modalTitle}>{title}</h2>
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Vehicle: <b style={{ color: "rgba(255,255,255,0.92)" }}>{vehicleLabel || "—"}</b>
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              Booking ID: <b style={{ color: "rgba(255,255,255,0.8)" }}>{bookingId}</b>
            </div>
          </div>

          <button onClick={handleClose} style={closeBtn} aria-label="Close" type="button">
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 14, color: "rgba(255,255,255,0.75)", fontSize: 13 }}>Loading booking…</div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            {/* Type */}
            <div>
              <label style={label}>Maintenance type</label>
              <input style={input} value={safeType === "MOT" ? "MOT" : "Service"} readOnly />
            </div>

            {/* Status */}
            <div>
              <label style={label}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
                <option value="Requested">Requested</option>
                <option value="Booked">Booked</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Single vs multi */}
            <div>
              <label style={label}>Booking type</label>
              <select
                value={isMultiDay ? "multi" : "single"}
                onChange={(e) => setIsMultiDay(e.target.value === "multi")}
                style={input}
              >
                <option value="single">Single day (appointment)</option>
                <option value="multi">Multi-day (off-road / workshop)</option>
              </select>
            </div>

            {!isMultiDay ? (
              <div>
                <label style={label}>Appointment date</label>
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  required
                  style={input}
                />
              </div>
            ) : (
              <>
                <div>
                  <label style={label}>Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    style={input}
                  />
                </div>

                <div>
                  <label style={label}>End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    style={input}
                  />
                </div>
              </>
            )}

            {/* Conflict */}
            {conflictMsg ? (
              <div
                style={{
                  border: "1px solid rgba(239,68,68,0.45)",
                  background: "rgba(239,68,68,0.12)",
                  color: "rgba(255,255,255,0.92)",
                  borderRadius: 12,
                  padding: 10,
                  fontSize: 13,
                  lineHeight: 1.35,
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Booking conflict</div>
                <div>{conflictMsg}</div>
              </div>
            ) : null}

            {/* Details */}
            <div>
              <label style={label}>Provider / garage</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} style={input} />
            </div>

            <div>
              <label style={label}>Booking reference</label>
              <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} style={input} />
            </div>

            <div>
              <label style={label}>Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={input} />
            </div>

            <div>
              <label style={label}>Cost (optional)</label>
              <input value={cost} onChange={(e) => setCost(e.target.value)} style={input} />
            </div>

            <div>
              <label style={label}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Drop-off times, contact, what to fix, etc…"
                style={{ ...input, minHeight: 80, resize: "vertical", paddingTop: 12 }}
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...primaryBtn,
                opacity: canSubmit ? 1 : 0.55,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>

            {/* Cancel */}
            <button
              type="button"
              onClick={handleCancel}
              style={{
                ...dangerBtn,
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
              disabled={saving}
            >
              Mark as Cancelled
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={handleDelete}
              style={{
                ...dangerBtn,
                border: "1px solid rgba(239,68,68,0.85)",
                background: "linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)",
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
              disabled={saving}
            >
              Delete booking permanently
            </button>

            <button type="button" onClick={handleClose} style={ghostBtn} disabled={saving}>
              Close
            </button>

            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
              Updates <b>maintenanceBookings</b> and keeps the linked fields on the vehicle document in sync.
              {status === "Completed" ? (
                <>
                  {" "}
                  Also updates <b>last</b> + <b>next</b> due dates automatically.
                </>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* -------------------- styles (match HolidayForm vibe) -------------------- */
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 90,
  padding: 16,
};

const modal = {
  width: "min(520px, 95vw)",
  borderRadius: 16,
  padding: 18,
  color: "#fff",
  background: "linear-gradient(180deg, rgba(22,22,22,0.95) 0%, rgba(12,12,12,0.98) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
  backdropFilter: "blur(10px)",
};

const headerRow = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const modalTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0.2,
};

const closeBtn = {
  border: "none",
  background: "transparent",
  color: "#cbd5e1",
  fontSize: 20,
  cursor: "pointer",
  padding: 6,
  lineHeight: 1,
};

const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(255,255,255,0.85)",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  backgroundColor: "rgba(255,255,255,0.14)",
  color: "#fff",
  outline: "none",
  fontSize: 14,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  appearance: "none",
};

const primaryBtn = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(37,99,235,0.55)",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
};

const dangerBtn = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(185,28,28,0.55)",
  background: "linear-gradient(180deg, #991b1b 0%, #7f1d1d 100%)",
  color: "#fee2e2",
  fontWeight: 800,
  fontSize: 14,
};

const ghostBtn = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "#e2e8f0",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
