// src/app/components/EditMaintenanceBookingForm.jsx
//  Updated to match the NEW MaintenanceBookingForm + vehicle-edit page behaviour
//  Ensures maintenanceBookings always have usable Date fields (startDate/endDate + appointmentDate for single day)
//  Writes ISO helper fields too (appointmentDateISO/startDateISO/endDateISO) for easy UI
//  Conflict checks ignore Cancelled/Declined and exclude current booking
//  If status becomes "Completed": updates vehicle last/next (MOT or Service) using vehicle frequencies
//  Cancel updates booking + vehicle summary
//  Delete deletes booking + clears vehicle summary IF it was linked to this bookingId

"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./EditMaintenanceBookingForm.styles.module.css";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Modal } from "@/app/components/ui";
import DatePicker from "react-multi-date-picker";
import { datePickerValues, formatUkDate } from "@/app/utils/dateDisplay";
import { db } from "../../../firebaseConfig";
import { ADDITIONAL_MAINTENANCE_WORKFLOWS } from "../utils/maintenanceSchema";
import {
  bookingToDateKeys as serviceBookingToDateKeys,
  normalizeMaintenanceType,
} from "../utils/maintenanceBookingPresentation";
import { buildMaintenanceBickersReference } from "../utils/maintenanceRecord";
import {
  cancelMaintenanceBooking,
  deleteMaintenanceBooking,
  rescheduleMaintenanceBooking,
  updateMaintenanceBooking,
} from "../utils/maintenanceMutationClient";
import {
  arrayUnion,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import {
  maintenanceBookingParticipatesInConflict,
  maintenanceBookingsCompete,
} from "@/app/utils/maintenanceBookingFormState";
import { getMaintenanceScheduleRule } from "@/app/utils/maintenanceMutationPolicy";
import { buildCommonMaintenanceProviders } from "@/app/utils/maintenanceProviders";

const INSPECTION_WORK_OPTIONS = ADDITIONAL_MAINTENANCE_WORKFLOWS.map((workflow) => ({
  value: workflow.maintenanceTypeId,
  label: workflow.label,
}));
const INSPECTION_WORK_IDS = new Set(INSPECTION_WORK_OPTIONS.map((option) => option.value));

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
  const notesRef = useRef(null);
  const fieldPrefix = useId();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const canArchiveRequirement = useMemo(() => {
    const role = String(
      dataAccessState?.userDoc?.role || dataAccessState?.userDoc?.platformRole || ""
    ).trim().toLowerCase();
    return ["admin", "platformadmin", "platform_admin"].includes(role);
  }, [dataAccessState?.userDoc?.platformRole, dataAccessState?.userDoc?.role]);
  const canManageProviderOptions = canArchiveRequirement;
  const [vehicleId, setVehicleId] = useState(vehicleIdProp || "");
  const [vehicle, setVehicle] = useState(null);
  const [booking, setBooking] = useState(null);

  // form fields
  const [type, setType] = useState("MOT"); // "MOT" | "SERVICE"
  const [status, setStatus] = useState("Booked");
  const [inspectionTypeIds, setInspectionTypeIds] = useState(["pmi", "brake_test"]);

  const [isMultiDay, setIsMultiDay] = useState(false);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customDates, setCustomDates] = useState([]);

  const [provider, setProvider] = useState("");
  const [providerOptions, setProviderOptions] = useState([]);
  const [bookingRef, setBookingRef] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduleExceptionReason, setScheduleExceptionReason] = useState("");
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

  useEffect(() => {
    const field = notesRef.current;
    if (!field) return;
    field.style.height = "auto";
    const nextHeight = Math.min(field.scrollHeight, 160);
    field.style.height = `${Math.max(nextHeight, 42)}px`;
    field.style.overflowY = field.scrollHeight > 160 ? "auto" : "hidden";
  }, [notes]);

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
    if (safeType === "INSPECTION") return "Inspection / Compliance";
    if (safeType === "WORK") return "Work";
    return safeType;
  }, [safeType]);

  const title = `Edit ${typeLabel} booking`;
  const bookingSettingsSummary = `${typeLabel} · ${status} · ${
    useCustomDates ? "Selected dates" : isMultiDay ? "Multi-day" : "Single day"
  }`;

  const vehicleLabel = useMemo(() => {
    if (vehicle) return vehicle.name || vehicle.registration || vehicle.reg || "Unknown vehicle";
    return vehicleId ? "Unknown vehicle" : "";
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

  const scheduleRule = useMemo(() => getMaintenanceScheduleRule({
    type: safeType,
    legalDueDate: booking?.sourceDueDate,
    legalDueWeeks: booking?.sourceDueIsoWeek ? [booking.sourceDueIsoWeek] : [],
    bookingDates: selectedDateKeys,
  }), [safeType, booking?.sourceDueDate, booking?.sourceDueIsoWeek, selectedDateKeys]);
  const outsideDueWeek = scheduleRule.outsideLegalWeek;

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

    const overlaps = existing.filter((b) => {
      if (b.id === bookingId) return false;

      if (!maintenanceBookingParticipatesInConflict(b)) return false;

      const existingKeys = serviceBookingToDateKeys(b);
      if (!existingKeys.length) return false;
      const selectedKeySet = new Set(bookingDates.keys);
      return existingKeys.some((key) => selectedKeySet.has(key));
    });

    const conflict =
      overlaps.find((candidate) =>
        maintenanceBookingsCompete(candidate, safeType, inspectionTypeIds)
      ) || overlaps[0];

    if (!conflict) return null;
    const conflictKeys = serviceBookingToDateKeys(conflict);

    const bs =
      toDate(conflict.startDate) ||
      toDate(conflict.date) ||
      toDate(conflict.appointmentDate) ||
      ymdToDate(conflictKeys[0]) ||
      null;

    const be =
      toDate(conflict.endDate) ||
      toDate(conflict.date) ||
      toDate(conflict.appointmentDate) ||
      ymdToDate(conflictKeys[conflictKeys.length - 1]) ||
      bs;

    return {
      id: conflict.id,
      type: conflict.type || "Maintenance",
      status: conflict.status || "Booked",
      from: bs,
      to: be,
      provider: conflict.provider || "",
      blocking: maintenanceBookingsCompete(conflict, safeType, inspectionTypeIds),
    };
  }, [existing, bookingDates.keys, bookingId, safeType, inspectionTypeIds]);

  useEffect(() => {
    if (!activeConflict) {
      setConflictMsg("");
      return;
    }
    setConflictMsg(
      `${activeConflict.blocking ? "Conflict" : "Allowed overlap"}: This vehicle already has a maintenance booking overlapping ${fmt(
        activeConflict.from
      )} → ${fmt(activeConflict.to)} (${activeConflict.type}, ${activeConflict.status})${
        activeConflict.provider ? ` — ${activeConflict.provider}` : ""
      }.${activeConflict.blocking ? "" : " Different maintenance types can be completed during the same visit."}`
    );
  }, [activeConflict]);

  /* ───────────────── load booking + vehicle + existing bookings ───────────────── */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, {
        collectionName: "maintenanceBookings",
        operation: "load edit maintenance booking form data",
      });
      setLoading(false);
      setExisting([]);
      setProviderOptions([]);
      setLoadError("Could not load booking access.");
      return;
    }

    const run = async () => {
      if (!bookingId) return;

      setLoading(true);
      setLoadError("");

      const [bSnap, equipmentSnap, providerSnap, providerSettingsSnap] = await Promise.all([
        getDoc(doc(db, "maintenanceBookings", bookingId)),
        getDocs(tenantCollectionQuery(db, "equipment", dataAccessState)),
        getDocs(tenantCollectionQuery(db, "maintenanceBookings", dataAccessState)),
        getDoc(doc(db, "settings", "maintenanceProviders")).catch(() => null),
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
      setScheduleExceptionReason(String(b.scheduleExceptionReason || ""));
      setInspectionTypeIds(
        Array.isArray(b.maintenanceTypeIds) && b.maintenanceTypeIds.length
          ? b.maintenanceTypeIds.filter((item) => INSPECTION_WORK_IDS.has(item))
          : ["pmi", "brake_test"]
      );

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
      setAppointmentTime(b.appointmentTime || "");
      setBookingRef(b.bookingRef || "");
      setLocation(b.location || "");
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
      setProviderOptions(
        buildCommonMaintenanceProviders(providerSnap.docs.map((d) => d.data()), {
          excludedProviders: providerSettingsSnap?.data()?.hiddenProviders,
        })
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
        const snap = await getDocs(
          tenantCollectionQuery(db, "maintenanceBookings", dataAccessState, [
            where("vehicleId", "==", resolvedVehicleId),
          ])
        );
        setExisting(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } else {
        setExisting([]);
      }

      setLoading(false);
    };

    run().catch((e) => {
      if (
        !handleFirestoreAccessError(e, {
          collectionName: "maintenanceBookings",
          operation: "load edit maintenance booking form data",
        })
      ) {
        console.error("[EditMaintenanceBookingForm] load error:", e);
      }
      setLoading(false);
      setExisting([]);
      setProviderOptions([]);
      setLoadError("Could not load booking. Please refresh.");
    });
  }, [accessKey, bookingId, canManageProviderOptions, dataAccessState, vehicleIdProp]);

  const selectedProviderOption = providerOptions.find(
    (option) => option.toLocaleLowerCase("en-GB") === provider.trim().toLocaleLowerCase("en-GB")
  );

  const removeSelectedProviderOption = async () => {
    if (!canManageProviderOptions || !selectedProviderOption) return;
    if (!await systemDialogs.confirmSystem(`Remove “${selectedProviderOption}” from the garage suggestions?\n\nHistorical maintenance bookings will not be changed.`)) return;

    const previousOptions = providerOptions;
    setProviderOptions((current) => current.filter((option) => option !== selectedProviderOption));
    try {
      await setDoc(
        doc(db, "settings", "maintenanceProviders"),
        {
          hiddenProviders: arrayUnion(selectedProviderOption),
          updatedAt: serverTimestamp(),
          updatedBy: dataAccessState.user?.email || "Unknown",
        },
        { merge: true }
      );
    } catch (error) {
      setProviderOptions(previousOptions);
      if (!handleFirestoreAccessError(error, { collectionName: "settings", operation: "remove maintenance provider suggestion" })) {
        console.error("Failed removing maintenance provider suggestion:", error);
        systemDialogs.showSystemNotification("Could not remove this garage suggestion. Please try again.");
      }
    }
  };

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
    if (safeType === "INSPECTION" && inspectionTypeIds.length === 0) return false;

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

    if (activeConflict?.blocking) return false;
    if (scheduleRule.blocked) return false;
    if (scheduleRule.requiresExceptionReason && !scheduleExceptionReason.trim()) return false;
    return true;
  }, [
    saving,
    loading,
    bookingId,
    vehicleId,
    selectedEquipment,
    safeType,
    inspectionTypeIds,
    useCustomDates,
    customDates,
    isMultiDay,
    appointmentDate,
    startDate,
    endDate,
    activeConflict,
    scheduleRule,
    scheduleExceptionReason,
  ]);

  const handleClose = () => {
    if (typeof onClose === "function") onClose();
  };

  const toggleEquipment = (name, checked) => {
    setSelectedEquipment((prev) =>
      checked ? Array.from(new Set([...prev, name])) : prev.filter((item) => item !== name)
    );
  };

  const persistBooking = async (nextStatus, failureMessage) => {
    if (!canSubmit) return;

    const start = bookingDates.start;
    const end = bookingDates.end;
    if (!start || !end) return;

    setFormError("");
    setSaving(true);
    try {
      const previousDateKeys = serviceBookingToDateKeys(booking);
      const datesChanged = previousDateKeys.join("|") !== bookingDates.keys.join("|");
      if (datesChanged) {
        await rescheduleMaintenanceBooking({
          bookingId,
          updates: {
            dateKeys: bookingDates.keys,
            bookingDates: bookingDates.keys,
            appointmentDateISO: bookingDates.keys.length === 1 ? bookingDates.keys[0] : "",
            appointmentTime,
            startDateISO: bookingDates.keys.length > 1 ? bookingDates.keys[0] : "",
            endDateISO: bookingDates.keys.length > 1 ? bookingDates.keys.at(-1) : "",
          },
          reason: scheduleExceptionReason,
        });
      }
      const savedBooking = await updateMaintenanceBooking({
        bookingId,
        booking,
        vehicleId,
        vehicle,
        vehicleLabel,
        type: safeType,
        status: nextStatus,
        useCustomDates,
        isMultiDay,
        appointmentDate,
        appointmentTime,
        startDate,
        endDate,
        dateKeys: bookingDates.keys,
        provider,
        bookingRef,
        location,
        cost: booking?.cost || "",
        notes,
        equipment: selectedEquipment,
        authState: dataAccessState,
        maintenanceTypeIds: safeType === "INSPECTION" ? inspectionTypeIds : [],
        scheduleExceptionReason,
      });

      if (typeof onSaved === "function") onSaved(savedBooking);
      else if (typeof onClose === "function") onClose();
    } catch (err) {
      console.error("[EditMaintenanceBookingForm] save error:", err);
      setFormError(failureMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await persistBooking(status, "Failed to update maintenance booking. Please try again.");
  };

  const handleCancel = async () => {
    if (!bookingId) return;
    if (!await systemDialogs.confirmSystem("Cancel this appointment and return its legal requirement to Due — not booked?")) return;

    setFormError("");
    setSaving(true);
    try {
      const cancelledBooking = await cancelMaintenanceBooking({
        bookingId,
        booking,
        vehicleId,
        vehicle,
        authState: dataAccessState,
      });

      setBooking((prev) =>
        prev ? { ...prev, status: cancelledBooking.status, history: cancelledBooking.history } : prev
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

  const handleDelete = async () => {
    if (!bookingId) return;
    if (!await systemDialogs.confirmSystem("Archive this maintenance booking? Its audit history will be retained.")) return;
    const reason = await systemDialogs.promptSystem("Reason for cancelling this legal maintenance requirement:", "");
    if (!String(reason || "").trim()) return;

    setFormError("");
    setSaving(true);
    try {
      const deletedBooking = await deleteMaintenanceBooking({
        bookingId,
        booking,
        vehicleId,
        vehicle,
        authState: dataAccessState,
        reason,
      });

      if (typeof onSaved === "function") onSaved(deletedBooking);
      else if (typeof onClose === "function") onClose();
    } catch (e) {
      console.error("[EditMaintenanceBookingForm] delete error:", e);
      setFormError(
        "Could not archive booking. Please check your permissions and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!bookingId) return null;

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow="Maintenance booking"
      title={title}
      description={
            <span className={layoutStyles.extracted5}>
              <b className={layoutStyles.extracted6}>{vehicleLabel || "—"}</b>
              <span className={layoutStyles.statusBadge}>{status}</span>
              {buildMaintenanceBickersReference(booking || {}) ? (
                <span className={layoutStyles.dueWeekBadge}>
                  {buildMaintenanceBickersReference(booking)}
                </span>
              ) : null}
              {booking?.sourceDueIsoWeek ? (
                <span className={layoutStyles.dueWeekBadge}>Due {booking.sourceDueIsoWeek}</span>
              ) : null}
            </span>
      }
      size="lg"
      density="compact"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={saving}>Close</Button>
          <Button type="submit" form={`${fieldPrefix}-form`} size="sm" disabled={!canSubmit || loading} loading={saving}>Save changes</Button>
        </>
      }
    >

        {loadError ? (
          <div
            className={layoutStyles.extracted9}
          >
            {loadError}
          </div>
        ) : null}
        {formError ? (
          <div
            className={layoutStyles.extracted10}
          >
            {formError}
          </div>
        ) : null}

        {loading ? (
          <div className={layoutStyles.extracted11}>Loading booking...</div>
        ) : (
          <form id={`${fieldPrefix}-form`} onSubmit={handleSubmit} className={layoutStyles.extracted12}>
            <section className={layoutStyles.bookingSettings}>
              <div className={layoutStyles.sectionHeader}>Booking settings <span>{bookingSettingsSummary}</span></div>
              <div className={layoutStyles.bookingSettingsGrid}>
                <div className={layoutStyles.extracted13}>
                  <label htmlFor={`${fieldPrefix}-type`} className={layoutStyles.extracted14}>Maintenance type</label>
                  <select id={`${fieldPrefix}-type`} className={layoutStyles.extracted18} value={safeType} onChange={(e) => setType(e.target.value)}>
                    <option value="MOT">MOT</option>
                    <option value="SERVICE">Service</option>
                    <option value="INSPECTION">Inspection / Compliance</option>
                    <option value="WORK">Work / Maintenance</option>
                  </select>
                </div>

                <div className={layoutStyles.extracted16}>
                  <label htmlFor={`${fieldPrefix}-status`} className={layoutStyles.extracted17}>Status</label>
                  <select id={`${fieldPrefix}-status`} value={status} onChange={(e) => setStatus(e.target.value)} className={layoutStyles.extracted18}>
                    <option value="Booked">Booked</option>
                    <option value="In Progress">In Progress</option>
                  </select>
                </div>

                <div className={layoutStyles.extracted19}>
                  <label htmlFor={`${fieldPrefix}-booking-mode`} className={layoutStyles.extracted20}>Booking type</label>
                  <select
                    id={`${fieldPrefix}-booking-mode`}
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
                    className={layoutStyles.extracted21}
                  >
                    <option value="single">Single day</option>
                    <option value="multi">Multi-day workshop</option>
                    <option value="custom">Non-consecutive dates</option>
                  </select>
                </div>

                {safeType === "INSPECTION" ? (
                  <fieldset className={layoutStyles.inspectionOptions}>
                    <legend className={layoutStyles.extracted14}>Inspection work</legend>
                    <div>
                      {INSPECTION_WORK_OPTIONS.map(({ value, label }) => (
                        <label key={value}>
                          <input
                            type="checkbox"
                            checked={inspectionTypeIds.includes(value)}
                            onChange={(event) => setInspectionTypeIds((current) => event.target.checked ? [...new Set([...current, value])] : current.filter((item) => item !== value))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </div>
            </section>

            {booking?.sourceDueIsoWeek && (outsideDueWeek || scheduleRule.blocked) ? (
              <div className={layoutStyles.isoWarning}>
                <strong>
                  {scheduleRule.state === "after_expiry"
                    ? "MOT appointment is after the legal expiry date."
                    : scheduleRule.state === "service_advisory"
                    ? "Service is outside its planned week — allowed."
                    : "Inspection is outside the legal due week."}
                </strong>
                <span>
                  Due {booking.sourceDueIsoWeek}
                  {sourceDueDateObj ? ` (${sourceDueDateObj.toLocaleDateString("en-GB")})` : ""}.
                </span>
                {scheduleRule.requiresExceptionReason ? <div>
                    <label htmlFor={`${fieldPrefix}-schedule-exception-reason`}>
                      Reason for moving outside the due week
                    </label>
                    <input
                      id={`${fieldPrefix}-schedule-exception-reason`}
                      value={scheduleExceptionReason}
                      onChange={(event) => setScheduleExceptionReason(event.target.value)}
                      placeholder="Required"
                      required
                      className={layoutStyles.extracted18}
                    />
                </div> : null}
              </div>
            ) : null}

            {useCustomDates ? (
              <>
                <div className={layoutStyles.extracted22}>
                  <label id={`${fieldPrefix}-selected-dates-label`} className={layoutStyles.extracted23}>Selected dates</label>
                  <DatePicker
                    multiple
                    value={datePickerValues(customDates)}
                    format="DD/MM/YYYY"
                    inputProps={{ "aria-labelledby": `${fieldPrefix}-selected-dates-label` }}
                    onChange={(vals) => {
                      const normalised = (Array.isArray(vals) ? vals : [])
                        .map((v) => (typeof v?.format === "function" ? v.format("YYYY-MM-DD") : String(v)))
                        .filter(Boolean)
                        .sort();
                      setCustomDates(normalised);
                    }}
                  />
                  {customDates.length > 0 ? (
                    <div className={layoutStyles.extracted24}>
                      {customDates.map((date) => formatUkDate(date)).join(", ")}
                    </div>
                  ) : null}
                </div>

                <div className={layoutStyles.extracted25}>
                  <label htmlFor={`${fieldPrefix}-appointment-time`} className={layoutStyles.extracted26}>Appointment time</label>
                  <input
                    id={`${fieldPrefix}-appointment-time`}
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className={layoutStyles.extracted27}
                  />
                </div>
              </>
            ) : !isMultiDay ? (
              <>
                <div className={layoutStyles.extracted28}>
                  <label htmlFor={`${fieldPrefix}-appointment-date`} className={layoutStyles.extracted29}>Appointment date</label>
                  <input
                    id={`${fieldPrefix}-appointment-date`}
                    type="date"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    required
                    className={layoutStyles.extracted30}
                  />
                </div>

                <div className={layoutStyles.extracted31}>
                  <label htmlFor={`${fieldPrefix}-appointment-time`} className={layoutStyles.extracted32}>Appointment time</label>
                  <input
                    id={`${fieldPrefix}-appointment-time`}
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className={layoutStyles.extracted33}
                  />
                </div>
              </>
            ) : (
              <>
                <div className={layoutStyles.extracted34}>
                  <label htmlFor={`${fieldPrefix}-start-date`} className={layoutStyles.extracted35}>Start date</label>
                  <input
                    id={`${fieldPrefix}-start-date`}
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className={layoutStyles.extracted36}
                  />
                </div>

                <div className={layoutStyles.extracted37}>
                  <label htmlFor={`${fieldPrefix}-end-date`} className={layoutStyles.extracted38}>End date</label>
                  <input
                    id={`${fieldPrefix}-end-date`}
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    className={layoutStyles.extracted39}
                  />
                </div>

                <div className={layoutStyles.extracted40}>
                  <label htmlFor={`${fieldPrefix}-appointment-time`} className={layoutStyles.extracted41}>Appointment time</label>
                  <input
                    id={`${fieldPrefix}-appointment-time`}
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className={layoutStyles.extracted42}
                  />
                </div>
              </>
            )}

            {/* Conflict */}
            {conflictMsg ? (
              <div
                className={`${layoutStyles.extracted43} ${!activeConflict?.blocking ? layoutStyles.allowedOverlap : ""}`}
              >
                <div className={layoutStyles.extracted44}>
                  {activeConflict?.blocking ? "Booking conflict" : "Existing maintenance on this date — allowed"}
                </div>
                <div>{conflictMsg}</div>
              </div>
            ) : null}

            {/* Details */}
            <section className={layoutStyles.additionalDetails}>
              <div className={layoutStyles.sectionHeader}>Optional workshop details</div>
              <div className={layoutStyles.additionalDetailsGrid}>
            <div className={layoutStyles.extracted45}>
              <label htmlFor={`${fieldPrefix}-provider`} className={layoutStyles.extracted46}>Provider / garage</label>
              <div className={layoutStyles.providerInputRow}>
                <input
                  id={`${fieldPrefix}-provider`}
                  list={`${fieldPrefix}-provider-options`}
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder={providerOptions.length ? "Select or type a garage" : "Type a garage"}
                  autoComplete="off"
                  className={layoutStyles.extracted47}
                />
                {canManageProviderOptions && selectedProviderOption ? (
                  <button type="button" className={layoutStyles.removeProviderButton} onClick={removeSelectedProviderOption}>
                    Remove
                  </button>
                ) : null}
              </div>
              <datalist id={`${fieldPrefix}-provider-options`}>
                {providerOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
            </div>

            <div className={layoutStyles.extracted48}>
              <label htmlFor={`${fieldPrefix}-booking-ref`} className={layoutStyles.extracted49}>Garage booking reference</label>
              <input id={`${fieldPrefix}-booking-ref`} value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} className={layoutStyles.extracted50} />
            </div>

            <div
              className={`${layoutStyles.extracted51} ${
                safeType === "SERVICE" ? layoutStyles.serviceLocationField : ""
              }`}
            >
              <label htmlFor={`${fieldPrefix}-location`} className={layoutStyles.extracted52}>Location</label>
              <input id={`${fieldPrefix}-location`} value={location} onChange={(e) => setLocation(e.target.value)} className={layoutStyles.extracted53} />
            </div>

            <div className={layoutStyles.extracted57}>
              <label htmlFor={`${fieldPrefix}-equipment-search`} className={layoutStyles.extracted58}>Book equipment off</label>
              {equipmentOptions.length ? (
                <div className={layoutStyles.extracted59}>
                  <div className={layoutStyles.extracted60}>
                    <input
                      id={`${fieldPrefix}-equipment-search`}
                      role="combobox"
                      aria-expanded={equipmentSearchOpen && Boolean(equipmentSearch.trim())}
                      aria-controls={`${fieldPrefix}-equipment-options`}
                      aria-autocomplete="list"
                      value={equipmentSearch}
                      onChange={(e) => {
                        setEquipmentSearch(e.target.value);
                        setEquipmentSearchOpen(true);
                      }}
                      onFocus={() => setEquipmentSearchOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEquipmentSearchOpen(false);
                        }
                      }}
                      placeholder="Search equipment by name or category..."
                      className={layoutStyles.extracted61}
                    />

                    {equipmentSearchOpen && equipmentSearch.trim() ? (
                      <div id={`${fieldPrefix}-equipment-options`} role="listbox" className={layoutStyles.extracted62}>
                        {filteredEquipmentOptions.length ? (
                          filteredEquipmentOptions.map(({ category, name }) => {
                            const checked = selectedEquipment.includes(name);
                            return (
                              <label
                                key={`${category}:${name}`}
                                role="option"
                                aria-selected={checked}
                                className={layoutStyles.extracted63}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleEquipment(name, e.target.checked)}
                                />
                                <span className={layoutStyles.extracted64}>
                                  <span className={layoutStyles.extracted65}>{name}</span>
                                  <span className={layoutStyles.extracted66}>{category}</span>
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <div className={layoutStyles.extracted67}>No equipment matches that search.</div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {selectedEquipment.length ? (
                    <div className={layoutStyles.extracted68}>
                      {selectedEquipment.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleEquipment(name, false)}
                          className={layoutStyles.extracted69}
                          title="Remove equipment"
                        >
                          {name} <span className={layoutStyles.extracted70}>X</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={layoutStyles.extracted71}>No equipment found.</div>
              )}
            </div>

            <div className={layoutStyles.extracted72}>
              <label htmlFor={`${fieldPrefix}-notes`} className={layoutStyles.extracted73}>Notes</label>
              <textarea
                ref={notesRef}
                id={`${fieldPrefix}-notes`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={1}
                placeholder="Drop-off times, contact, what to fix, etc…"
                className={layoutStyles.extracted74}
              />
            </div>
              </div>
            </section>

            <div className={layoutStyles.bookingActionGrid}>
              <details className={layoutStyles.destructiveActions}>
                <summary>Cancel or archive</summary>
                <p>Cancel keeps the legal requirement active. Archive is only for an incorrect requirement.</p>
                <div>
                  <button type="button" onClick={handleCancel} disabled={saving}>
                    Cancel appointment
                  </button>
                  {canArchiveRequirement ? (
                    <button type="button" onClick={handleDelete} disabled={saving}>
                      Archive requirement
                    </button>
                  ) : null}
                </div>
              </details>
            </div>
          </form>
        )}
    </Modal>
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
  color: "var(--color-text)",
  background: "var(--color-canvas)",
  border: "1px solid var(--color-border)",
  boxShadow: "0 22px 60px rgba(15,23,42,0.28)",
};

const headerRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  background: "var(--color-surface)",
  borderBottom: "1px solid var(--color-border)",
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
  color: "var(--color-text-muted)",
  fontWeight: 700,
};

const modalMeta = {
  marginTop: 4,
  fontSize: 12,
  color: "var(--color-text-muted)",
  fontWeight: 700,
};

const closeBtn = {
  width: 34,
  height: 34,
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  color: "var(--color-text-muted)",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  lineHeight: 1,
};

const label = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 900,
  color: "var(--color-text-muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: ".035em",
};

const input = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text)",
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
  border: "1px solid var(--shell-muted)",
  borderRadius: 999,
  background: "var(--color-brand-soft)",
  color: "var(--color-brand)",
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const chipRemove = {
  color: "var(--color-text-muted)",
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
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  padding: 6,
  boxShadow: "0 14px 30px rgba(15,23,42,0.18)",
};

const equipmentResultItem = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid transparent",
  borderRadius: 8,
  background: "var(--color-surface)",
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
  color: "var(--color-text)",
  fontSize: 13,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const equipmentResultCategory = {
  color: "var(--color-text-muted)",
  fontSize: 11.5,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const emptySearchState = {
  padding: "10px 12px",
  color: "var(--color-text-muted)",
  fontSize: 12.5,
  fontWeight: 800,
};

const helperText = {
  marginTop: 8,
  fontSize: 12,
  color: "var(--color-text-muted)",
  lineHeight: 1.4,
};

const feedbackError = {
  margin: 12,
  border: "1px solid var(--color-danger-border)",
  background: "var(--color-danger-soft)",
  color: "var(--color-danger)",
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
  border: "1px solid var(--color-brand)",
  background: "var(--color-brand)",
  color: "var(--color-white)",
  fontWeight: 900,
  fontSize: 14,
  boxShadow: "0 6px 12px rgba(31,75,122,0.16)",
};
