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
  const [openEquipmentGroups, setOpenEquipmentGroups] = useState({});
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

      const defaultOpenGroups = {};
      Object.keys(groupedEquipment).forEach((category) => {
        defaultOpenGroups[category] = false;
      });

      setEquipmentGroups(groupedEquipment);
      setOpenEquipmentGroups(defaultOpenGroups);

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

  useEffect(() => {
    if (!Object.keys(equipmentGroups).length) return;
    setOpenEquipmentGroups((prev) => {
      const next = { ...(prev || {}) };
      Object.entries(equipmentGroups).forEach(([category, items]) => {
        if (Array.isArray(items) && items.some((name) => selectedEquipment.includes(name))) {
          next[category] = true;
        } else if (typeof next[category] !== "boolean") {
          next[category] = false;
        }
      });
      return next;
    });
  }, [equipmentGroups, selectedEquipment]);

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
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Vehicle: <b style={{ color: "rgba(255,255,255,0.92)" }}>{vehicleLabel || "—"}</b>
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              Booking ID: <b style={{ color: "rgba(255,255,255,0.8)" }}>{bookingId}</b>
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
          <div style={{ padding: 14, color: "rgba(255,255,255,0.75)", fontSize: 13 }}>Loading booking…</div>
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
                  <div style={{ marginTop: 8, fontSize: 12.5, color: "rgba(255,255,255,0.78)" }}>
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
              {Object.keys(equipmentGroups).length ? (
                <div style={categoryGrid}>
                  {Object.entries(equipmentGroups).map(([category, items]) => {
                    const isOpen = openEquipmentGroups[category] || false;

                    return (
                      <div key={category} style={categoryCard}>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenEquipmentGroups((prev) => ({
                              ...prev,
                              [category]: !prev[category],
                            }))
                          }
                          style={categoryToggle}
                        >
                          <span>{isOpen ? "v" : ">"} {category}</span>
                          <span style={categoryCount}>{items.length}</span>
                        </button>

                        {isOpen && (
                          <div style={pickerGrid}>
                            {items.map((name) => {
                              const checked = selectedEquipment.includes(name);
                              return (
                                <label key={name} style={pickerItem}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => toggleEquipment(name, e.target.checked)}
                                  />{" "}
                                  {name}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
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

            <div style={{ ...fullWidth, fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
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
  width: "min(820px, 96vw)",
  maxHeight: "90vh",
  overflowY: "auto",
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

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
  alignItems: "start",
};

const fieldBlock = {
  minWidth: 0,
};

const fullWidth = {
  gridColumn: "1 / -1",
};

const categoryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const categoryCard = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  overflow: "hidden",
};

const categoryToggle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  border: "none",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.95)",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};

const categoryCount = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 22,
  height: 22,
  padding: "0 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 900,
};

const pickerGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.08)",
};

const pickerItem = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "rgba(255,255,255,0.92)",
};

const helperText = {
  fontSize: 12,
  color: "rgba(255,255,255,0.65)",
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
