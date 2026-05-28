// src/app/components/EditMaintenanceBookingForm.jsx
//  Updated to match the NEW MaintenanceBookingForm + vehicle-edit page behaviour
//  Ensures maintenanceBookings always have usable Date fields (startDate/endDate + appointmentDate for single day)
//  Writes ISO helper fields too (appointmentDateISO/startDateISO/endDateISO) for easy UI
//  Conflict checks ignore Cancelled/Declined and exclude current booking
//  If status becomes "Completed": updates vehicle last/next (MOT or Service) using vehicle frequencies
//  Cancel updates booking + vehicle summary
//  Delete deletes booking + clears vehicle summary IF it was linked to this bookingId

"use client";

import { useEffect, useMemo, useState } from "react";
import DatePicker from "react-multi-date-picker";
import { db } from "../../../firebaseConfig";
import { getIsoWeekLabel } from "../utils/maintenanceSchema";
import {
  bookingToDateKeys as serviceBookingToDateKeys,
  cancelMaintenanceBooking,
  deleteMaintenanceBooking,
  normalizeMaintenanceType,
  updateMaintenanceBooking,
} from "../utils/maintenanceBookingService";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
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
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customDates, setCustomDates] = useState([]);

  const [provider, setProvider] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentSearchOpen, setEquipmentSearchOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState([]);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

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

  const enumerateDaysYMD = (startYMD, endYMD) => {
    const start = ymdToDate(startYMD);
    const end = ymdToDate(endYMD);
    if (!start || !end) return [];
    const out = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      out.push(dateToYMD(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  };
  const isConsecutiveYMDList = (dates) => {
    if (!Array.isArray(dates) || dates.length <= 1) return true;
    for (let i = 1; i < dates.length; i += 1) {
      const prev = ymdToDate(dates[i - 1]);
      const next = ymdToDate(dates[i]);
      if (!prev || !next) return false;
      const diff = Math.round((next.getTime() - prev.getTime()) / 86400000);
      if (diff !== 1) return false;
    }
    return true;
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

  const safeType = useMemo(() => normalizeMaintenanceType(type), [type]);

  const typeLabel = useMemo(() => {
    if (safeType === "SERVICE") return "Service";
    if (safeType === "MOT") return "MOT";
    if (safeType === "INSPECTION") return "8 Week Inspection";
    if (safeType === "WORK") return "Work";
    return safeType;
  }, [safeType]);

  const title = `Edit ${typeLabel} booking`;

  const vehicleLabel = useMemo(() => {
    if (vehicle) return vehicle.name || vehicle.registration || vehicle.reg || vehicleId || "";
    return vehicleId || "";
  }, [vehicle, vehicleId]);

  const selectedDateKeys = useMemo(() => {
    if (useCustomDates) return [...customDates].filter(Boolean).slice().sort();
    if (!isMultiDay) return appointmentDate ? [appointmentDate] : [];
    return enumerateDaysYMD(startDate, endDate);
  }, [useCustomDates, customDates, isMultiDay, appointmentDate, startDate, endDate]);

  const bookingDates = useMemo(() => {
    const first = selectedDateKeys[0] || "";
    const last = selectedDateKeys[selectedDateKeys.length - 1] || first;
    return { start: ymdToDate(first), end: ymdToDate(last), keys: selectedDateKeys };
  }, [selectedDateKeys]);

  const sourceDueDateObj = useMemo(
    () => ymdToDate(String(booking?.sourceDueDate || "").slice(0, 10)),
    [booking?.sourceDueDate]
  );

  const selectedInspectionWeek = useMemo(() => {
    const seed = useCustomDates
      ? customDates[0] || ""
      : isMultiDay
      ? startDate || ""
      : appointmentDate || "";
    return seed ? getIsoWeekLabel(seed) : "";
  }, [useCustomDates, customDates, isMultiDay, startDate, appointmentDate]);

  const inspectionOutsideDueWeek =
    safeType === "INSPECTION" &&
    !!booking?.sourceDueIsoWeek &&
    !!selectedInspectionWeek &&
    selectedInspectionWeek !== booking.sourceDueIsoWeek;

  const equipmentOptions = useMemo(
    () =>
      Object.entries(equipmentGroups)
        .flatMap(([category, items]) =>
          (Array.isArray(items) ? items : []).map((name) => ({
            category,
            name,
            search: `${category} ${name}`.toLowerCase(),
          }))
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [equipmentGroups]
  );

  const filteredEquipmentOptions = useMemo(() => {
    const queryText = equipmentSearch.trim().toLowerCase();
    if (!queryText) return equipmentOptions.slice(0, 10);
    return equipmentOptions.filter((item) => item.search.includes(queryText)).slice(0, 10);
  }, [equipmentOptions, equipmentSearch]);

  const activeConflict = useMemo(() => {
    setConflictMsg("");
    if (!bookingDates.keys.length) return null;

    const conflict = existing.find((b) => {
      if (b.id === bookingId) return false;

      const st = String(b.status || "").toLowerCase();
      if (st.includes("cancel")) return false;
      if (st.includes("declin")) return false;

      const existingKeys = serviceBookingToDateKeys(b);
      if (!existingKeys.length) return false;
      const selectedKeySet = new Set(bookingDates.keys);
      return existingKeys.some((key) => selectedKeySet.has(key));
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
  }, [existing, bookingDates.keys, bookingId]);

  useEffect(() => {
    if (!activeConflict) {
      setConflictMsg("");
      return;
    }
    setConflictMsg(
      `Warning Conflict: This vehicle already has a maintenance booking overlapping ${fmt(
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
      setLoadError("");

      const [bSnap, equipmentSnap] = await Promise.all([
        getDoc(doc(db, "maintenanceBookings", bookingId)),
        getDocs(collection(db, "equipment")),
      ]);
      if (!bSnap.exists()) {
        setLoading(false);
        setLoadError("Booking not found.");
        return;
      }

      const b = { id: bSnap.id, ...(bSnap.data() || {}) };
      setBooking(b);

      const resolvedVehicleId = vehicleIdProp || b.vehicleId || "";
      setVehicleId(resolvedVehicleId);

      // type/status
      const bType = String(
        b.maintenanceTypeLabel || b.maintenanceTypeOther || b.type || b.maintenanceType || b.kind || "MAINTENANCE"
      ).toUpperCase();
      setType(bType);
      setStatus(b.status || "Booked");

      const dateKeys = serviceBookingToDateKeys(b);
      const apptISO = String(b.appointmentDateISO || "").trim();
      const apptObj = b.appointmentDate ? toDate(b.appointmentDate) : null;
      const singleDate = apptISO || (apptObj ? dateToYMD(apptObj) : "") || dateKeys[0] || "";

      if (dateKeys.length > 1 && !isConsecutiveYMDList(dateKeys)) {
        setUseCustomDates(true);
        setCustomDates(dateKeys);
        setIsMultiDay(false);
        setAppointmentDate(dateKeys[0] || "");
        setStartDate(dateKeys[0] || "");
        setEndDate(dateKeys[dateKeys.length - 1] || "");
      } else if (dateKeys.length > 1) {
        setUseCustomDates(false);
        setCustomDates([]);
        setIsMultiDay(true);
        setAppointmentDate(dateKeys[0] || "");
        setStartDate(dateKeys[0] || "");
        setEndDate(dateKeys[dateKeys.length - 1] || "");
      } else {
        setUseCustomDates(false);
        setCustomDates([]);
        setIsMultiDay(false);
        setAppointmentDate(singleDate);
        setStartDate(singleDate);
        setEndDate(singleDate);
      }

      setProvider(b.provider || "");
      setBookingRef(b.bookingRef || "");
      setLocation(b.location || "");
      setCost(b.cost ? String(b.cost) : "");
      setNotes(b.notes || "");
      setSelectedEquipment(
        Array.isArray(b.equipment)
          ? b.equipment
              .map((item) => (typeof item === "string" ? item : item?.name || item?.label || ""))
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : []
      );
      const groupedEquipment = {};
      equipmentSnap.docs.forEach((d) => {
        const data = d.data() || {};
        const category = String(data.category || "Other").trim() || "Other";
        const name = String(data.name || data.label || d.id || "").trim();
        if (!name) return;
        if (!groupedEquipment[category]) groupedEquipment[category] = [];
        groupedEquipment[category].push(name);
      });

      Object.keys(groupedEquipment).forEach((category) => {
        groupedEquipment[category].sort((a, b) => a.localeCompare(b));
      });

      setEquipmentGroups(groupedEquipment);

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
      setLoadError("Could not load booking. Please refresh.");
    });
  }, [bookingId, vehicleIdProp]);

  // keep date fields in sync when toggling modes
  useEffect(() => {
    if (loading) return;
    if (useCustomDates) return;

    if (!isMultiDay) {
      setStartDate(appointmentDate || "");
      setEndDate(appointmentDate || "");
    } else {
      setStartDate((p) => p || appointmentDate || "");
      setEndDate((p) => p || appointmentDate || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiDay, useCustomDates]);

  const canSubmit = useMemo(() => {
    if (saving || loading) return false;
    if (!bookingId) return false;
    if (!vehicleId && selectedEquipment.length === 0) return false;

    if (useCustomDates) {
      if (!customDates.length) return false;
    } else if (!isMultiDay) {
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
  }, [
    saving,
    loading,
    bookingId,
    vehicleId,
    selectedEquipment,
    useCustomDates,
    customDates,
    isMultiDay,
    appointmentDate,
    startDate,
    endDate,
    activeConflict,
  ]);

  const handleClose = () => {
    if (typeof onClose === "function") onClose();
  };

  const toggleEquipment = (name, checked) => {
    setSelectedEquipment((prev) =>
      checked ? Array.from(new Set([...prev, name])) : prev.filter((item) => item !== name)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const start = bookingDates.start;
    const end = bookingDates.end;
    if (!start || !end) return;

    setFormError("");
    setSaving(true);
    try {
      const savedBooking = await updateMaintenanceBooking({
        bookingId,
        booking,
        vehicleId,
        vehicle,
        vehicleLabel,
        type: safeType,
        status,
        useCustomDates,
        isMultiDay,
        appointmentDate,
        startDate,
        endDate,
        dateKeys: bookingDates.keys,
        provider,
        bookingRef,
        location,
        cost,
        notes,
        equipment: selectedEquipment,
      });

      if (typeof onSaved === "function") onSaved(savedBooking);
      else if (typeof onClose === "function") onClose();
    } catch (err) {
      console.error("[EditMaintenanceBookingForm] save error:", err);
      setFormError("Failed to update maintenance booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!bookingId) return;
    if (!confirm("Mark this booking as Cancelled?")) return;

    setFormError("");
    setSaving(true);
    try {
      const cancelledBooking = await cancelMaintenanceBooking({
        bookingId,
        booking,
        vehicleId,
        vehicle,
      });

      setBooking((prev) =>
        prev ? { ...prev, status: "Cancelled", history: cancelledBooking.history } : prev
      );

      if (typeof onSaved === "function") onSaved(cancelledBooking);
      else if (typeof onClose === "function") onClose();
    } catch (e) {
      console.error("[EditMaintenanceBookingForm] cancel error:", e);
      setFormError("Could not cancel booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  //  REAL DELETE
  const handleDelete = async () => {
    if (!bookingId) return;
    if (!confirm("Delete this maintenance booking permanently? This cannot be undone.")) return;

    setFormError("");
    setSaving(true);
    try {
      const deletedBooking = await deleteMaintenanceBooking({
        bookingId,
        booking,
        vehicleId,
        vehicle,
      });

      if (typeof onSaved === "function") onSaved(deletedBooking);
      else if (typeof onClose === "function") onClose();
    } catch (e) {
      console.error("[EditMaintenanceBookingForm] delete error:", e);
      setFormError(
        "Could not delete booking. If permissions are blocking the delete, check the Firestore rules for this collection."
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
            <div style={modalSubtitle}>
              Vehicle: <b style={{ color: "#0f172a" }}>{vehicleLabel || "—"}</b>
            </div>
            <div style={modalMeta}>
              Booking ID: <b>{bookingId}</b>
            </div>
          </div>

          <button onClick={handleClose} style={closeBtn} aria-label="Close" type="button">
            x
          </button>
        </div>

        {loadError ? (
          <div
            style={{
              marginBottom: 12,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 12.5,
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            {loadError}
          </div>
        ) : null}
        {formError ? (
          <div
            style={{
              marginBottom: 12,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 12.5,
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            {formError}
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: 14, color: "#5f6f82", fontSize: 13, fontWeight: 800 }}>Loading booking...</div>
        ) : (
          <form onSubmit={handleSubmit} style={formGrid}>
            {/* Type */}
            <div style={fieldBlock}>
              <label style={label}>Maintenance type</label>
              <input style={input} value={typeLabel} readOnly />
            </div>

            {/* Status */}
            <div style={fieldBlock}>
              <label style={label}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
                <option value="Requested">Requested</option>
                <option value="Booked">Booked</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Single vs multi */}
            <div style={fieldBlock}>
              <label style={label}>Booking type</label>
              <select
                value={useCustomDates ? "custom" : isMultiDay ? "multi" : "single"}
                onChange={(e) => {
                  const mode = e.target.value;
                  if (mode === "custom") {
                    const seed = bookingDates.keys.length ? bookingDates.keys.slice() : [];
                    setUseCustomDates(true);
                    setIsMultiDay(false);
                    setCustomDates(seed);
                    if (seed[0]) {
                      setAppointmentDate(seed[0]);
                      setStartDate(seed[0]);
                      setEndDate(seed[seed.length - 1] || seed[0]);
                    }
                    return;
                  }

                  if (useCustomDates) {
                    const first = (customDates?.[0] || "").slice(0, 10);
                    setAppointmentDate(first || appointmentDate || "");
                    setStartDate(first || "");
                    setEndDate(first || "");
                    setCustomDates([]);
                  }

                  setUseCustomDates(false);
                  setIsMultiDay(mode === "multi");
                }}
                style={input}
              >
                <option value="single">Single day (appointment)</option>
                <option value="multi">Multi-day (off-road / workshop)</option>
                <option value="custom">Multi-day (non-consecutive)</option>
              </select>
            </div>

            {safeType === "INSPECTION" ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  border: `1px solid ${inspectionOutsideDueWeek ? "rgba(245,158,11,0.5)" : "rgba(59,130,246,0.35)"}`,
                  background: inspectionOutsideDueWeek ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.10)",
                  color: "#0f172a",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                  lineHeight: 1.4,
                  fontWeight: 750,
                }}
              >
                Inspection cadence is currently fixed at <b>8 weeks</b> from the vehicle's inspection cycle.
                {sourceDueDateObj ? (
                  <>
                    {" "}Due week: <b>{booking?.sourceDueIsoWeek || "Unknown"}</b> for{" "}
                    <b>{sourceDueDateObj.toLocaleDateString("en-GB")}</b>.
                    {inspectionOutsideDueWeek
                      ? " This booking sits outside the due ISO week."
                      : " This booking is inside the due ISO week."}
                  </>
                ) : (
                  " Change the cycle from the lorry's vehicle edit page if a different cadence is needed."
                )}
              </div>
            ) : null}

            {useCustomDates ? (
              <div style={{ ...fieldBlock, ...fullWidth }}>
                <label style={label}>Selected dates</label>
                <DatePicker
                  multiple
                  value={customDates}
                  format="YYYY-MM-DD"
                  onChange={(vals) => {
                    const normalised = (Array.isArray(vals) ? vals : [])
                      .map((v) => (typeof v?.format === "function" ? v.format("YYYY-MM-DD") : String(v)))
                      .filter(Boolean)
                      .sort();
                    setCustomDates(normalised);
                  }}
                />
                {customDates.length > 0 ? (
                  <div style={helperText}>
                    {customDates.join(", ")}
                  </div>
                ) : null}
              </div>
            ) : !isMultiDay ? (
              <div style={fieldBlock}>
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
                <div style={fieldBlock}>
                  <label style={label}>Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    style={input}
                  />
                </div>

                <div style={fieldBlock}>
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
                  ...fullWidth,
                  ...feedbackError,
                  margin: 0,
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Booking conflict</div>
                <div>{conflictMsg}</div>
              </div>
            ) : null}

            {/* Details */}
            <div style={fieldBlock}>
              <label style={label}>Provider / garage</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} style={input} />
            </div>

            <div style={fieldBlock}>
              <label style={label}>Booking reference</label>
              <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} style={input} />
            </div>

            <div style={fieldBlock}>
              <label style={label}>Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={input} />
            </div>

            <div style={fieldBlock}>
              <label style={label}>Cost (optional)</label>
              <input value={cost} onChange={(e) => setCost(e.target.value)} style={input} />
            </div>

            <div style={{ ...fieldBlock, ...fullWidth }}>
              <label style={label}>Book equipment off</label>
              {equipmentOptions.length ? (
                <div style={equipmentSearchShell}>
                  <div style={equipmentSearchBox}>
                    <input
                      value={equipmentSearch}
                      onChange={(e) => {
                        setEquipmentSearch(e.target.value);
                        setEquipmentSearchOpen(true);
                      }}
                      onFocus={() => setEquipmentSearchOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEquipmentSearchOpen(false);
                      }}
                      placeholder="Search equipment by name or category..."
                      style={input}
                    />

                    {equipmentSearchOpen && equipmentSearch.trim() ? (
                      <div style={equipmentResults}>
                        {filteredEquipmentOptions.length ? (
                          filteredEquipmentOptions.map(({ category, name }) => {
                            const checked = selectedEquipment.includes(name);
                            return (
                              <label key={`${category}:${name}`} style={equipmentResultItem}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleEquipment(name, e.target.checked)}
                                />
                                <span style={equipmentResultText}>
                                  <span style={equipmentResultName}>{name}</span>
                                  <span style={equipmentResultCategory}>{category}</span>
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <div style={emptySearchState}>No equipment matches that search.</div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {selectedEquipment.length ? (
                    <div style={selectedEquipmentWrap}>
                      {selectedEquipment.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleEquipment(name, false)}
                          style={selectedEquipmentChip}
                          title="Remove equipment"
                        >
                          {name} <span style={chipRemove}>X</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={helperText}>No equipment found.</div>
              )}
            </div>

            <div style={{ ...fieldBlock, ...fullWidth }}>
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
                ...fullWidth,
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
                ...fullWidth,
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
                ...fullWidth,
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

            <button type="button" onClick={handleClose} style={{ ...ghostBtn, ...fullWidth }} disabled={saving}>
              Close
            </button>

            <div style={{ ...fullWidth, ...helperText, marginTop: 0 }}>
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

/* -------------------- styles -------------------- */
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.56)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 18,
};

const modal = {
  width: "min(800px, calc(100vw - 32px))",
  maxHeight: "90vh",
  overflowY: "auto",
  borderRadius: 8,
  padding: 0,
  color: "#0f172a",
  background: "#f3f6f9",
  border: "1px solid #d7dee8",
  boxShadow: "0 22px 60px rgba(15,23,42,0.28)",
};

const headerRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  background: "#ffffff",
  borderBottom: "1px solid #d7dee8",
};

const modalTitle = {
  margin: 0,
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 900,
  letterSpacing: 0,
};

const modalSubtitle = {
  marginTop: 4,
  fontSize: 12.5,
  color: "#5f6f82",
  fontWeight: 700,
};

const modalMeta = {
  marginTop: 4,
  fontSize: 12,
  color: "#7b8794",
  fontWeight: 700,
};

const closeBtn = {
  width: 34,
  height: 34,
  border: "1px solid #d7dee8",
  borderRadius: 8,
  background: "#ffffff",
  color: "#5f6f82",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  lineHeight: 1,
};

const label = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 900,
  color: "#52657a",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: ".035em",
};

const input = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #c8d6e3",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  outline: "none",
  fontSize: 14,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  appearance: "none",
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  alignItems: "start",
  padding: 12,
};

const fieldBlock = {
  minWidth: 0,
};

const fullWidth = {
  gridColumn: "1 / -1",
};

const equipmentSearchShell = {
  display: "grid",
  gap: 8,
};

const equipmentSearchBox = {
  position: "relative",
};

const selectedEquipmentWrap = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const selectedEquipmentChip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #b8c8d8",
  borderRadius: 999,
  background: "#e8f2fb",
  color: "#1f4b7a",
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const chipRemove = {
  color: "#5f6f82",
  fontSize: 11,
  fontWeight: 900,
};

const equipmentResults = {
  display: "grid",
  gap: 6,
  position: "absolute",
  top: 42,
  left: 0,
  right: 0,
  zIndex: 20,
  maxHeight: 245,
  overflowY: "auto",
  border: "1px solid #d7dee8",
  borderRadius: 8,
  background: "#ffffff",
  padding: 6,
  boxShadow: "0 14px 30px rgba(15,23,42,0.18)",
};

const equipmentResultItem = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid transparent",
  borderRadius: 8,
  background: "#ffffff",
  padding: "8px 10px",
  minWidth: 0,
  cursor: "pointer",
};

const equipmentResultText = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const equipmentResultName = {
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const equipmentResultCategory = {
  color: "#5f6f82",
  fontSize: 11.5,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const emptySearchState = {
  padding: "10px 12px",
  color: "#5f6f82",
  fontSize: 12.5,
  fontWeight: 800,
};

const helperText = {
  marginTop: 8,
  fontSize: 12,
  color: "#5f6f82",
  lineHeight: 1.4,
};

const feedbackError = {
  margin: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 12.5,
  fontWeight: 800,
  lineHeight: 1.45,
};

const primaryBtn = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #1f4b7a",
  background: "#1f4b7a",
  color: "#fff",
  fontWeight: 900,
  fontSize: 14,
  boxShadow: "0 6px 12px rgba(31,75,122,0.16)",
};

const dangerBtn = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(185,28,28,0.14)",
};

const ghostBtn = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #b8c8d8",
  background: "#ffffff",
  color: "#1f4b7a",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
};
