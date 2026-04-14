// src/app/components/MaintenanceBookingForm.jsx
//  Matches the UPDATED vehicle-edit page logic
//  Creates maintenanceBookings doc with real Date objects (calendar-safe)
//  Writes summary fields back to vehicle
//  If status === "Completed": updates core due dates (last + next) using vehicle frequencies
//  Conflict check ignores Cancelled/Declined and compares proper date ranges

"use client";

import { useEffect, useMemo, useState } from "react";
import DatePicker from "react-multi-date-picker";
import { auth, db } from "../../../firebaseConfig";
import { getIsoWeekLabel } from "../utils/maintenanceSchema";
import {
  buildMaintenanceHistoryEntry,
  getMaintenanceAuditIdentity,
} from "../utils/maintenanceAudit";
import {
  mergeInspectionHistory,
  mergeMaintenanceHistory,
} from "../utils/inspectionHistory";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  writeBatch,
  where,
} from "firebase/firestore";

/**
 * Props:
 * - vehicleId (optional)
 * - type: "MOT" | "SERVICE" | "INSPECTION" | "WORK"
 * - defaultDate: "YYYY-MM-DD" (optional)
 * - onClose() (optional)
 * - onSaved(payload) (optional)
 */
export default function MaintenanceBookingForm({
  vehicleId,
  type = "MOT",
  defaultDate = "",
  initialEquipment = [],
  sourceDueDate = "",
  sourceDueIsoWeek = "",
  sourceDueKey = "",
  onClose,
  onSaved,
}) {
  const [vehicle, setVehicle] = useState(null);

  // form fields
  const [status, setStatus] = useState("Booked");
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [useCustomDates, setUseCustomDates] = useState(false);

  const [appointmentDate, setAppointmentDate] = useState(defaultDate || "");
  const [startDate, setStartDate] = useState(defaultDate || "");
  const [endDate, setEndDate] = useState(defaultDate || "");
  const [customDates, setCustomDates] = useState(defaultDate ? [defaultDate] : []);

  const [provider, setProvider] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [openEquipmentGroups, setOpenEquipmentGroups] = useState({});
  const [selectedEquipment, setSelectedEquipment] = useState(
    Array.isArray(initialEquipment) ? initialEquipment.filter(Boolean) : []
  );

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
  const bookingToDateKeys = (booking) => {
    if (Array.isArray(booking?.bookingDates) && booking.bookingDates.length) {
      return booking.bookingDates
        .map((value) => String(value || "").slice(0, 10))
        .filter(Boolean)
        .sort();
    }

    const appointmentISO = String(booking?.appointmentDateISO || "").slice(0, 10);
    const startISO = String(booking?.startDateISO || "").slice(0, 10);
    const endISO = String(booking?.endDateISO || "").slice(0, 10);
    if (appointmentISO) return [appointmentISO];
    if (startISO && endISO) return enumerateDaysYMD(startISO, endISO);

    const start = toDate(booking?.startDate || booking?.date || booking?.appointmentDate);
    const end = toDate(booking?.endDate || booking?.date || booking?.appointmentDate || booking?.startDate);
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

  const normalizedType = String(type || "").toUpperCase();
  const safeType =
    normalizedType === "SERVICE"
      ? "SERVICE"
      : normalizedType === "WORK"
      ? "WORK"
      : normalizedType === "INSPECTION"
      ? "INSPECTION"
      : "MOT";
  const title =
    safeType === "MOT"
      ? "Book MOT"
      : safeType === "SERVICE"
      ? "Book Service"
      : safeType === "INSPECTION"
      ? "Book 8 Week Inspection"
      : "Book Work";
  const sourceDueDateObj = useMemo(() => ymdToDate(String(sourceDueDate || "").slice(0, 10)), [sourceDueDate]);
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
    !!sourceDueIsoWeek &&
    !!selectedInspectionWeek &&
    selectedInspectionWeek !== sourceDueIsoWeek;

  const vehicleLabel = useMemo(() => {
    const v = vehicle || {};
    return v.name || v.registration || v.reg || vehicleId || "";
  }, [vehicle, vehicleId]);

  const selectedDateKeys = useMemo(() => {
    if (useCustomDates) return [...customDates].filter(Boolean).slice().sort();
    if (!isMultiDay) return appointmentDate ? [appointmentDate] : [];
    return enumerateDaysYMD(startDate, endDate);
  }, [useCustomDates, customDates, isMultiDay, appointmentDate, startDate, endDate]);

  const bookingDates = useMemo(() => {
    const first = selectedDateKeys[0] || "";
    const last = selectedDateKeys[selectedDateKeys.length - 1] || first;
    return {
      start: ymdToDate(first),
      end: ymdToDate(last),
      keys: selectedDateKeys,
    };
  }, [selectedDateKeys]);

  const activeConflict = useMemo(() => {
    setConflictMsg("");

    if (!bookingDates.keys.length) return null;

    const conflict = existing.find((b) => {
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
  }, [existing, bookingDates.keys]);

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

  /* ───────────────── load vehicle + existing bookings ───────────────── */
  useEffect(() => {
    const run = async () => {
      const equipmentSnapPromise = getDocs(collection(db, "equipment"));
      const vehicleSnapPromise = vehicleId ? getDoc(doc(db, "vehicles", vehicleId)) : Promise.resolve(null);
      const existingSnapPromise = vehicleId
        ? getDocs(query(collection(db, "maintenanceBookings"), where("vehicleId", "==", vehicleId)))
        : Promise.resolve(null);

      const [vSnap, equipmentSnap, existingSnap] = await Promise.all([
        vehicleSnapPromise,
        equipmentSnapPromise,
        existingSnapPromise,
      ]);

      if (vSnap?.exists()) {
        setVehicle({ id: vSnap.id, ...vSnap.data() });
      } else {
        setVehicle(null);
      }
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

      setExisting(existingSnap ? existingSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : []);
    };

    run().catch((e) => {
      console.error("[MaintenanceBookingForm] load error:", e);
      setExisting([]);
    });
  }, [vehicleId]);

  useEffect(() => {
    setSelectedEquipment(Array.isArray(initialEquipment) ? initialEquipment.filter(Boolean) : []);
  }, [initialEquipment]);

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
    if (saving) return false;
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
  }, [saving, vehicleId, selectedEquipment, useCustomDates, customDates, isMultiDay, appointmentDate, startDate, endDate, activeConflict]);

  const buildVehicleSummaryUpdates = ({
    bookingId,
    statusValue,
    effectiveIsMultiDay,
    appointmentDateValue,
    firstSelectedDate,
    lastSelectedDate,
    completedISO,
    nowISO,
  }) => {
    if (!vehicleId) return null;

    if (safeType === "MOT") {
      const motFreqWeeks = resolveFreqWeeks(vehicle?.motFreq, vehicle?.lastMOT, vehicle?.nextMOT);
      const updates = {
        motBookedStatus: statusValue,
        motBookedOn: nowISO,
        motAppointmentDate: !effectiveIsMultiDay ? appointmentDateValue : "",
        motBookingStartDate: effectiveIsMultiDay ? firstSelectedDate : "",
        motBookingEndDate: effectiveIsMultiDay ? lastSelectedDate : "",
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
        updates.motHistory = mergeMaintenanceHistory(vehicle?.motHistory, {
          completedDate: completedISO,
          bookingId,
          provider: provider.trim(),
          bookingRef: bookingRef.trim(),
          notes: notes.trim(),
          recordedAt: new Date().toISOString(),
        });
        updates.motAppointmentDate = "";
        updates.motBookingStartDate = "";
        updates.motBookingEndDate = "";
        updates.motProvider = "";
        updates.motBookingRef = "";
        updates.motLocation = "";
        updates.motCost = "";
        updates.motBookingNotes = "";
      }

      return updates;
    }

    if (safeType === "SERVICE") {
      const serviceFreqWeeks = resolveFreqWeeks(
        vehicle?.serviceFreq,
        vehicle?.lastService,
        vehicle?.nextService
      );
      const updates = {
        serviceBookedStatus: statusValue,
        serviceBookedOn: nowISO,
        serviceAppointmentDate: !effectiveIsMultiDay ? appointmentDateValue : "",
        serviceBookingStartDate: effectiveIsMultiDay ? firstSelectedDate : "",
        serviceBookingEndDate: effectiveIsMultiDay ? lastSelectedDate : "",
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
        updates.serviceHistory = mergeMaintenanceHistory(vehicle?.serviceHistory, {
          completedDate: completedISO,
          bookingId,
          provider: provider.trim(),
          bookingRef: bookingRef.trim(),
          notes: notes.trim(),
          recordedAt: new Date().toISOString(),
        });
        updates.serviceAppointmentDate = "";
        updates.serviceBookingStartDate = "";
        updates.serviceBookingEndDate = "";
        updates.serviceProvider = "";
        updates.serviceBookingRef = "";
        updates.serviceLocation = "";
        updates.serviceCost = "";
        updates.serviceBookingNotes = "";
      }

      return updates;
    }

    if (safeType === "INSPECTION") {
      const updates = {
        inspectionBookedStatus: statusValue,
        inspectionBookedOn: nowISO,
        inspectionAppointmentDate: !effectiveIsMultiDay ? appointmentDateValue : "",
        inspectionBookingStartDate: effectiveIsMultiDay ? firstSelectedDate : "",
        inspectionBookingEndDate: effectiveIsMultiDay ? lastSelectedDate : "",
        inspectionProvider: provider.trim(),
        inspectionBookingRef: bookingRef.trim(),
        inspectionLocation: location.trim(),
        inspectionCost: cost ? String(cost).trim() : "",
        inspectionBookingNotes: notes.trim(),
        inspectionBookingId: bookingId,
        updatedAt: serverTimestamp(),
      };

      if (completedISO) {
        updates.eightWeekInspectionStart = completedISO;
        updates.nextEightWeekInspection = calcNextFromWeeks(completedISO, 8);
        updates.eightWeekInspectionISOWeek = getIsoWeekLabel(updates.nextEightWeekInspection);
        updates.eightWeekInspectionHistory = mergeInspectionHistory(
          vehicle?.eightWeekInspectionHistory,
          {
            completedDate: completedISO,
            bookingId,
            provider: provider.trim(),
            bookingRef: bookingRef.trim(),
            notes: notes.trim(),
            recordedAt: new Date().toISOString(),
          }
        );
        updates.inspectionAppointmentDate = "";
        updates.inspectionBookingStartDate = "";
        updates.inspectionBookingEndDate = "";
        updates.inspectionProvider = "";
        updates.inspectionBookingRef = "";
        updates.inspectionLocation = "";
        updates.inspectionCost = "";
        updates.inspectionBookingNotes = "";
      }

      return updates;
    }

    return {
      workBookedStatus: statusValue,
      workBookingId: bookingId,
      workBookingDate: !effectiveIsMultiDay ? appointmentDateValue : "",
      workBookingStartDate: effectiveIsMultiDay ? firstSelectedDate : "",
      workBookingEndDate: effectiveIsMultiDay ? lastSelectedDate : "",
      workProvider: provider.trim(),
      workBookingRef: bookingRef.trim(),
      workLocation: location.trim(),
      workCost: cost ? String(cost).trim() : "",
      workBookingNotes: notes.trim(),
      updatedAt: serverTimestamp(),
    };
  };

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

    setSaving(true);
    try {
      const nowISO = todayISO();
      const nowAuditIso = new Date().toISOString();
      const auditUser = getMaintenanceAuditIdentity(auth.currentUser);

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

      // 1) Create booking doc (calendar-safe Dates)
      const bookingPayload = {
        kind: "MAINTENANCE",
        type: safeType, // MOT | SERVICE
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
        sourceDueDateISO: String(sourceDueDate || "").slice(0, 10),
        sourceDueIsoWeek: String(sourceDueIsoWeek || "").trim(),
        sourceDueKey: String(sourceDueKey || "").trim(),
        createdBy: auditUser.email,
        createdByUid: auditUser.uid,
        lastEditedBy: auditUser.email,
        lastEditedByUid: auditUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        history: [
          buildMaintenanceHistoryEntry({
            action: "Created",
            user: auditUser,
            timestamp: nowAuditIso,
          }),
        ],
      };

      const bookingDocRef = doc(collection(db, "maintenanceBookings"));
      const batch = writeBatch(db);
      batch.set(bookingDocRef, bookingPayload);

      const vehicleSummaryUpdates = buildVehicleSummaryUpdates({
        bookingId: bookingDocRef.id,
        statusValue: status,
        effectiveIsMultiDay,
        appointmentDateValue: appointmentDate,
        firstSelectedDate,
        lastSelectedDate,
        completedISO,
        nowISO,
      });

      if (vehicleId && vehicleSummaryUpdates) {
        batch.update(doc(db, "vehicles", vehicleId), vehicleSummaryUpdates);
      }

      await batch.commit();

      if (typeof onSaved === "function") onSaved({ id: bookingDocRef.id, ...bookingPayload });
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
              Vehicle: <b style={{ color: "rgba(255,255,255,0.92)" }}>{vehicleLabel || "Equipment only"}</b>
            </div>
          </div>

          <button onClick={handleClose} style={closeBtn} aria-label="Close" type="button">
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} style={formGrid}>
          {/* Type */}
          <div style={fieldBlock}>
            <label style={label}>Maintenance type</label>
            <input
              style={input}
              value={
                safeType === "MOT"
                  ? "MOT"
                  : safeType === "SERVICE"
                  ? "Service"
                  : safeType === "INSPECTION"
                  ? "8 Week Inspection"
                  : "Work"
              }
              readOnly
            />
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
                  const seed = bookingDates.keys.length
                    ? bookingDates.keys.slice()
                    : defaultDate
                    ? [defaultDate]
                    : [];
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

          {safeType === "INSPECTION" && sourceDueDateObj ? (
            <div
              style={{
                gridColumn: "1 / -1",
                border: `1px solid ${inspectionOutsideDueWeek ? "rgba(245,158,11,0.5)" : "rgba(59,130,246,0.35)"}`,
                background: inspectionOutsideDueWeek ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.10)",
                color: "#e5eefb",
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              Due week: <b>{sourceDueIsoWeek || "Unknown"}</b> for{" "}
              <b>{sourceDueDateObj.toLocaleDateString("en-GB")}</b>.
              {inspectionOutsideDueWeek ? " This booking sits outside the due ISO week." : " This booking is inside the due ISO week."}
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
            {saving ? "Saving..." : "Create booking"}
          </button>

          <button type="button" onClick={handleClose} style={{ ...dangerBtn, ...fullWidth }}>
            Cancel
          </button>

          <div style={{ ...fullWidth, fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
            Saves to <b>maintenanceBookings</b>
            {vehicleId ? " and links it back to the vehicle document." : " as an equipment-only booking."}
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
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
  marginTop: 10,
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.08)",
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
  cursor: "pointer",
};
