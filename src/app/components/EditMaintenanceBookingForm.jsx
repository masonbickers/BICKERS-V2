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
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [selectedEquipment, setSelectedEquipment] = useState([]);

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

  const resolveFreqWeeks = (explicitFreq, lastISO, nextISO) => {
    const explicit = Number(explicitFreq || 0);
    if (explicit > 0) return explicit;

    const last = parseISOorBlank(lastISO);
    const next = parseISOorBlank(nextISO);
    if (!last || !next) return 0;

    const diffMs = next.getTime() - last.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays <= 0) return 0;

    return Math.max(1, Math.round(diffDays / 7));
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
  const bookingToDateKeys = (bookingSource) => {
    if (Array.isArray(bookingSource?.bookingDates) && bookingSource.bookingDates.length) {
      return bookingSource.bookingDates
        .map((value) => String(value || "").slice(0, 10))
        .filter(Boolean)
        .sort();
    }

    const appointmentISO = String(bookingSource?.appointmentDateISO || "").slice(0, 10);
    const startISO = String(bookingSource?.startDateISO || "").slice(0, 10);
    const endISO = String(bookingSource?.endDateISO || "").slice(0, 10);
    if (appointmentISO) return [appointmentISO];
    if (startISO && endISO) return enumerateDaysYMD(startISO, endISO);

    const start = toDate(
      bookingSource?.startDate || bookingSource?.date || bookingSource?.appointmentDate
    );
    const end = toDate(
      bookingSource?.endDate ||
        bookingSource?.date ||
        bookingSource?.appointmentDate ||
        bookingSource?.startDate
    );
    if (!start || !end) return [];
    return enumerateDaysYMD(dateToYMD(start), dateToYMD(end));
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
    const raw = String(type || "").trim().toUpperCase();
    if (raw === "SERVICE") return "SERVICE";
    if (raw === "MOT") return "MOT";
    return raw || "MAINTENANCE";
  }, [type]);

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

      const existingKeys = bookingToDateKeys(b);
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

      const [bSnap, equipmentSnap] = await Promise.all([
        getDoc(doc(db, "maintenanceBookings", bookingId)),
        getDocs(collection(db, "equipment")),
      ]);
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
      const bType = String(
        b.maintenanceTypeLabel || b.maintenanceTypeOther || b.type || b.maintenanceType || b.kind || "MAINTENANCE"
      ).toUpperCase();
      setType(bType);
      setStatus(b.status || "Booked");

      const dateKeys = bookingToDateKeys(b);
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
      setEquipmentOptions(
        equipmentSnap.docs
          .map((d) => {
            const data = d.data() || {};
            return String(data.name || data.label || d.id || "").trim();
          })
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      );

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
    if (!vehicleId) return false;

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
  }, [saving, loading, bookingId, vehicleId, useCustomDates, customDates, isMultiDay, appointmentDate, startDate, endDate, activeConflict]);

  const handleClose = () => {
    if (typeof onClose === "function") onClose();
  };

  const toggleEquipment = (name, checked) => {
    setSelectedEquipment((prev) =>
      checked ? Array.from(new Set([...prev, name])) : prev.filter((item) => item !== name)
    );
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
    const effectiveIsMultiDay = isMultiDay;

    const completedISO =
      status === "Completed"
        ? completionISOFromBooking({ isMultiDay: effectiveIsMultiDay, appointmentDate, startDate, endDate })
        : "";

    if (safeType === "MOT") {
      const motFreqWeeks = resolveFreqWeeks(vehicle?.motFreq, vehicle?.lastMOT, vehicle?.nextMOT);

      const updates = {
        motBookedStatus: status,
        motBookedOn: todayISO(),
        motAppointmentDate: !effectiveIsMultiDay ? appointmentDate : "",
        motBookingStartDate: effectiveIsMultiDay ? startDate : "",
        motBookingEndDate: effectiveIsMultiDay ? endDate : "",
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
    } else if (safeType === "SERVICE") {
      const serviceFreqWeeks = resolveFreqWeeks(
        vehicle?.serviceFreq,
        vehicle?.lastService,
        vehicle?.nextService
      );

      const updates = {
        serviceBookedStatus: status,
        serviceBookedOn: todayISO(),
        serviceAppointmentDate: !effectiveIsMultiDay ? appointmentDate : "",
        serviceBookingStartDate: effectiveIsMultiDay ? startDate : "",
        serviceBookingEndDate: effectiveIsMultiDay ? endDate : "",
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
    } else {
      await updateDoc(vRef, {
        workBookedStatus: status,
        workBookingId: bookingId,
        workBookingDate: !effectiveIsMultiDay ? appointmentDate : "",
        workBookingStartDate: effectiveIsMultiDay ? startDate : "",
        workBookingEndDate: effectiveIsMultiDay ? endDate : "",
        workProvider: provider.trim(),
        workBookingRef: bookingRef.trim(),
        workLocation: location.trim(),
        workCost: cost ? String(cost).trim() : "",
        workBookingNotes: notes.trim(),
        updatedAt: serverTimestamp(),
      });
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
      const isNonConsecutive = useCustomDates;
      const effectiveIsMultiDay = isNonConsecutive || isMultiDay;
      const firstSelectedDate = bookingDates.keys[0] || "";
      const lastSelectedDate = bookingDates.keys[bookingDates.keys.length - 1] || firstSelectedDate;
      const apptDateObj = !effectiveIsMultiDay ? ymdToDate(appointmentDate) : null;
      const completedISO =
        status === "Completed"
          ? completionISOFromBooking({
              isMultiDay: effectiveIsMultiDay,
              appointmentDate: effectiveIsMultiDay ? firstSelectedDate : appointmentDate,
              startDate: effectiveIsMultiDay ? firstSelectedDate : startDate,
              endDate: effectiveIsMultiDay ? lastSelectedDate : endDate,
            })
          : "";

      // 1) Update booking doc (calendar-safe Dates + ISO helpers)
      const bookingPayload = {
        kind: "MAINTENANCE",
        type: safeType,
        vehicleId,
        vehicleLabel: vehicleLabel || "",
        status,
        isMultiDay: effectiveIsMultiDay,
        startDate: start,
        endDate: end,
        appointmentDate: apptDateObj,
        bookingDates: bookingDates.keys,
        appointmentDateISO: !effectiveIsMultiDay ? appointmentDate : "",
        startDateISO: effectiveIsMultiDay ? firstSelectedDate : "",
        endDateISO: effectiveIsMultiDay ? lastSelectedDate : "",
        completedAtISO: completedISO || "",
        provider: provider.trim(),
        bookingRef: bookingRef.trim(),
        location: location.trim(),
        cost: cost ? String(cost).trim() : "",
        notes: notes.trim(),
        equipment: selectedEquipment,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "maintenanceBookings", bookingId), bookingPayload);

      // 2) Sync vehicle summary (and last/next if Completed)
      await syncVehicleSummary({
        safeType,
        status,
        isMultiDay: effectiveIsMultiDay,
        appointmentDate: effectiveIsMultiDay ? firstSelectedDate : appointmentDate,
        startDate: effectiveIsMultiDay ? firstSelectedDate : startDate,
        endDate: effectiveIsMultiDay ? lastSelectedDate : endDate,
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
          isMultiDay: useCustomDates || isMultiDay,
          appointmentDate: bookingDates.keys[0] || appointmentDate,
          startDate: bookingDates.keys[0] || startDate,
          endDate: bookingDates.keys[bookingDates.keys.length - 1] || endDate,
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

  //  REAL DELETE
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
        const shouldClearWork = String(vDoc.workBookingId || "") === String(bookingId);

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
        if (shouldClearWork) {
          Object.assign(clears, {
            workBookingId: "",
            workBookedStatus: "",
            workBookingDate: "",
            workBookingStartDate: "",
            workBookingEndDate: "",
            workProvider: "",
            workBookingRef: "",
            workLocation: "",
            workCost: "",
            workBookingNotes: "",
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
            x
          </button>
        </div>

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
              {equipmentOptions.length ? (
                <div style={pickerGrid}>
                  {equipmentOptions.map((name) => {
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

const pickerGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
