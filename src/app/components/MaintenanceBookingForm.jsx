// src/app/components/MaintenanceBookingForm.jsx
// ✅ Matches the UPDATED vehicle-edit page logic
// ✅ Creates maintenanceBookings doc with real Date objects (calendar-safe)
// ✅ Writes summary fields back to vehicle
// ✅ If status === "Completed": updates core due dates (last + next) using vehicle frequencies
// ✅ Conflict check ignores Cancelled/Declined and compares proper date ranges

"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

/**
 * Props:
 * - vehicleId (required)
 * - type: "MOT" | "SERVICE"
 * - defaultDate: "YYYY-MM-DD" (optional)
 * - onClose() (optional)
 * - onSaved(payload) (optional)
 */
export default function MaintenanceBookingForm({
  vehicleId,
  type = "MOT",
  defaultDate = "",
  onClose,
  onSaved,
}) {
  const [vehicle, setVehicle] = useState(null);

  // form fields
  const [status, setStatus] = useState("Booked");
  const [isMultiDay, setIsMultiDay] = useState(false);

  const [appointmentDate, setAppointmentDate] = useState(defaultDate || "");
  const [startDate, setStartDate] = useState(defaultDate || "");
  const [endDate, setEndDate] = useState(defaultDate || "");

  const [provider, setProvider] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);

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

  const safeType = String(type || "").toUpperCase() === "SERVICE" ? "SERVICE" : "MOT";
  const title = safeType === "MOT" ? "Book MOT" : "Book Service";

  const vehicleLabel = useMemo(() => {
    const v = vehicle || {};
    return v.name || v.registration || v.reg || vehicleId || "";
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
      const st = String(b.status || "").toLowerCase();
      if (st.includes("cancel")) return false;
      if (st.includes("declin")) return false;

      // ✅ robust date extraction
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
  }, [existing, bookingDates.start, bookingDates.end]);

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

  /* ───────────────── load vehicle + existing bookings ───────────────── */
  useEffect(() => {
    const run = async () => {
      if (!vehicleId) return;

      // vehicle
      const vSnap = await getDoc(doc(db, "vehicles", vehicleId));
      if (vSnap.exists()) setVehicle({ id: vSnap.id, ...vSnap.data() });

      // existing bookings
      const qy = query(collection(db, "maintenanceBookings"), where("vehicleId", "==", vehicleId));
      const snap = await getDocs(qy);
      setExisting(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };

    run().catch((e) => {
      console.error("[MaintenanceBookingForm] load error:", e);
      setExisting([]);
    });
  }, [vehicleId]);

  // keep multi-day dates in sync when toggling
  useEffect(() => {
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
    if (saving) return false;
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
  }, [saving, vehicleId, isMultiDay, appointmentDate, startDate, endDate, activeConflict]);

  const handleClose = () => {
    if (typeof onClose === "function") onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const start = bookingDates.start;
    const end = bookingDates.end;
    if (!start || !end) return;

    setSaving(true);
    try {
      const nowISO = todayISO();

      const apptDateObj = !isMultiDay ? ymdToDate(appointmentDate) : null;
      const completedISO =
        status === "Completed"
          ? completionISOFromBooking({ isMultiDay, appointmentDate, startDate, endDate })
          : "";

      // 1) Create booking doc (calendar-safe Dates)
      const bookingPayload = {
        kind: "MAINTENANCE",
        type: safeType, // MOT | SERVICE
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const created = await addDoc(collection(db, "maintenanceBookings"), bookingPayload);

      // 2) Update vehicle summary + (if completed) core due dates
      const vRef = doc(db, "vehicles", vehicleId);

      if (safeType === "MOT") {
        const motFreqWeeks = Number(vehicle?.motFreq || 0);

        const updates = {
          motBookedStatus: status,
          motBookedOn: nowISO,
          motAppointmentDate: !isMultiDay ? appointmentDate : "",
          motBookingStartDate: isMultiDay ? startDate : "",
          motBookingEndDate: isMultiDay ? endDate : "",
          motProvider: provider.trim(),
          motBookingRef: bookingRef.trim(),
          motLocation: location.trim(),
          motCost: cost ? String(cost).trim() : "",
          motBookingNotes: notes.trim(),
          motBookingId: created.id,
          updatedAt: serverTimestamp(),
        };

        if (completedISO) {
          updates.lastMOT = completedISO;
          updates.nextMOT = calcNextFromWeeks(completedISO, motFreqWeeks);

          // optional clear summary appointment fields once completed
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
          serviceBookedOn: nowISO,
          serviceAppointmentDate: !isMultiDay ? appointmentDate : "",
          serviceBookingStartDate: isMultiDay ? startDate : "",
          serviceBookingEndDate: isMultiDay ? endDate : "",
          serviceProvider: provider.trim(),
          serviceBookingRef: bookingRef.trim(),
          serviceLocation: location.trim(),
          serviceCost: cost ? String(cost).trim() : "",
          serviceBookingNotes: notes.trim(),
          serviceBookingId: created.id,
          updatedAt: serverTimestamp(),
        };

        if (completedISO) {
          updates.lastService = completedISO;
          updates.nextService = calcNextFromWeeks(completedISO, serviceFreqWeeks);

          // optional clear summary appointment fields once completed
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

      if (typeof onSaved === "function") onSaved({ id: created.id, ...bookingPayload });
      if (typeof onClose === "function") onClose();
    } catch (err) {
      console.error("[MaintenanceBookingForm] save error:", err);
      alert("Failed to save maintenance booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={headerRow}>
          <div>
            <h2 style={modalTitle}>{title}</h2>
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Vehicle: <b style={{ color: "rgba(255,255,255,0.92)" }}>{vehicleLabel || "—"}</b>
            </div>
          </div>

          <button onClick={handleClose} style={closeBtn} aria-label="Close" type="button">
            ✕
          </button>
        </div>

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
            {saving ? "Saving..." : "Create booking"}
          </button>

          <button type="button" onClick={handleClose} style={dangerBtn}>
            Cancel
          </button>

          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
            Saves to <b>maintenanceBookings</b> and links it back to the vehicle document.
            {status === "Completed" ? (
              <>
                {" "}
                Also updates <b>last</b> + <b>next</b> due dates automatically.
              </>
            ) : null}
          </div>
        </form>
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
  cursor: "pointer",
};
