// src/app/components/MaintenanceBookingForm.jsx
//  Matches the UPDATED vehicle-edit page logic
//  Creates maintenanceBookings doc with real Date objects (calendar-safe)
//  Writes summary fields back to vehicle
//  If status === "Completed": updates core due dates (last + next) using vehicle frequencies
//  Conflict check ignores Cancelled/Declined and compares proper date ranges

"use client";

import * as systemDialogs from "@/app/utils/systemNotifications";
import layoutStyles from "./MaintenanceBookingForm.styles.module.css";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Modal } from "@/app/components/ui";
import DatePicker from "react-multi-date-picker";
import { db } from "../../../firebaseConfig";
import { ADDITIONAL_MAINTENANCE_WORKFLOWS } from "../utils/maintenanceSchema";
import {
  bookingToDateKeys as serviceBookingToDateKeys,
  normalizeMaintenanceType,
} from "../utils/maintenanceBookingPresentation";
import { createMaintenanceBooking } from "../utils/maintenanceMutationClient";
import { getMaintenanceScheduleRule } from "../utils/maintenanceMutationPolicy";
import { buildCommonMaintenanceProviders } from "../utils/maintenanceProviders";
import { arrayUnion, doc, getDoc, getDocs, serverTimestamp, setDoc, where } from "firebase/firestore";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import {
  EMPTY_EQUIPMENT_SELECTION,
  equipmentSelectionKey,
  equipmentSelectionsEqual,
  maintenanceBookingsCompete,
  maintenanceBookingParticipatesInConflict,
  normalizeEquipmentSelection,
} from "@/app/utils/maintenanceBookingFormState";

const INSPECTION_WORK_OPTIONS = ADDITIONAL_MAINTENANCE_WORKFLOWS.map((workflow) => ({
  value: workflow.maintenanceTypeId,
  label: workflow.label,
}));
const INSPECTION_WORK_IDS = new Set(INSPECTION_WORK_OPTIONS.map((option) => option.value));

/**
 * Props:
 * - vehicleId (optional)
 * - type: "MOT" | "SERVICE" | "INSPECTION" | "WORK"
 * - defaultDate: "YYYY-MM-DD" (optional)
 * - onClose() (optional)
 * - onSaved(payload) (optional)
 * - saveBooking(payload) (optional test/integration seam; defaults to trusted mutation client)
 */
export default function MaintenanceBookingForm({
  vehicleId,
  type = "MOT",
  defaultDate = "",
  initialEquipment = EMPTY_EQUIPMENT_SELECTION,
  sourceDueDate = "",
  sourceDueIsoWeek = "",
  sourceDueKey = "",
  requestedRecordId = "",
  defaultMaintenanceTypeIds = ["pmi", "brake_test"],
  onClose,
  onSaved,
  saveBooking = createMaintenanceBooking,
}) {
  const notesRef = useRef(null);
  const fieldPrefix = useId();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const canManageProviderOptions = useMemo(() => {
    const role = String(
      dataAccessState?.userDoc?.role || dataAccessState?.userDoc?.platformRole || ""
    ).trim().toLowerCase();
    return ["admin", "platformadmin", "platform_admin"].includes(role);
  }, [dataAccessState?.userDoc?.platformRole, dataAccessState?.userDoc?.role]);
  const [vehicle, setVehicle] = useState(null);

  // form fields
  const [maintenanceType, setMaintenanceType] = useState(() =>
    normalizeMaintenanceType(type)
  );
  const [status, setStatus] = useState("Booked");
  const [inspectionTypeIds, setInspectionTypeIds] = useState(() => {
    const selected = Array.isArray(defaultMaintenanceTypeIds)
      ? defaultMaintenanceTypeIds.filter((item) => INSPECTION_WORK_IDS.has(item))
      : [];
    return selected.length ? selected : ["pmi", "brake_test"];
  });
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [useCustomDates, setUseCustomDates] = useState(false);

  const [appointmentDate, setAppointmentDate] = useState(defaultDate || "");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [startDate, setStartDate] = useState(defaultDate || "");
  const [endDate, setEndDate] = useState(defaultDate || "");
  const [customDates, setCustomDates] = useState(defaultDate ? [defaultDate] : []);

  const [provider, setProvider] = useState("");
  const [providerOptions, setProviderOptions] = useState([]);
  const [bookingRef, setBookingRef] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduleExceptionReason, setScheduleExceptionReason] = useState("");
  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentSearchOpen, setEquipmentSearchOpen] = useState(false);
  const initialEquipmentKey = equipmentSelectionKey(initialEquipment);
  const [selectedEquipment, setSelectedEquipment] = useState(() =>
    normalizeEquipmentSelection(initialEquipment)
  );

  const [saving, setSaving] = useState(false);
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

  const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
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

  const safeType = normalizeMaintenanceType(maintenanceType);
  const title =
    safeType === "MOT"
      ? "Book MOT"
      : safeType === "SERVICE"
      ? "Book Service"
      : safeType === "INSPECTION"
      ? "Book Inspection / Compliance Work"
      : "Book Work";
  const bookingSettingsSummary = `${
    safeType === "INSPECTION" ? "Inspection / Compliance" : safeType === "SERVICE" ? "Service" : safeType
  } · ${status} · ${useCustomDates ? "Selected dates" : isMultiDay ? "Multi-day" : "Single day"}`;
  const sourceDueDateObj = useMemo(() => ymdToDate(String(sourceDueDate || "").slice(0, 10)), [sourceDueDate]);
  const vehicleLabel = useMemo(() => {
    const v = vehicle || {};
    return v.name || v.registration || v.reg || (vehicleId ? "Unknown vehicle" : "");
  }, [vehicle, vehicleId]);

  const selectedDateKeys = useMemo(() => {
    if (useCustomDates) return [...customDates].filter(Boolean).slice().sort();
    if (!isMultiDay) return appointmentDate ? [appointmentDate] : [];
    return enumerateDaysYMD(startDate, endDate);
  }, [useCustomDates, customDates, isMultiDay, appointmentDate, startDate, endDate]);

  const scheduleRule = useMemo(() => getMaintenanceScheduleRule({
    type: safeType,
    legalDueDate: sourceDueDate,
    legalDueWeeks: sourceDueIsoWeek ? [sourceDueIsoWeek] : [],
    bookingDates: selectedDateKeys,
  }), [safeType, sourceDueDate, sourceDueIsoWeek, selectedDateKeys]);
  const outsideDueWeek = scheduleRule.outsideLegalWeek;

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

    const overlaps = existing.filter((b) => {
      if (requestedRecordId && String(b.id || "") === String(requestedRecordId)) return false;
      if (!maintenanceBookingParticipatesInConflict(b)) return false;
      const existingKeys = serviceBookingToDateKeys(b);
      if (!existingKeys.length) return false;
      const selectedKeySet = new Set(bookingDates.keys);
      return existingKeys.some((key) => selectedKeySet.has(key));
    });

    const conflict =
      overlaps.find((booking) =>
        maintenanceBookingsCompete(booking, safeType, inspectionTypeIds)
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
  }, [existing, bookingDates.keys, requestedRecordId, safeType, inspectionTypeIds]);

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

  /* ───────────────── load vehicle + existing bookings ───────────────── */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, {
        collectionName: "maintenanceBookings",
        operation: "load maintenance booking form data",
      });
      setEquipmentGroups({});
      setExisting([]);
      setProviderOptions([]);
      return;
    }

    const run = async () => {
      const equipmentSnapPromise = getDocs(tenantCollectionQuery(db, "equipment", dataAccessState));
      const vehicleSnapPromise = vehicleId ? getDoc(doc(db, "vehicles", vehicleId)) : Promise.resolve(null);
      const existingSnapPromise = vehicleId
        ? getDocs(
            tenantCollectionQuery(db, "maintenanceBookings", dataAccessState, [
              where("vehicleId", "==", vehicleId),
            ])
          )
        : Promise.resolve(null);
      const providerSnapPromise = getDocs(
        tenantCollectionQuery(db, "maintenanceBookings", dataAccessState)
      );
      const providerSettingsPromise = getDoc(
        doc(db, "settings", "maintenanceProviders")
      ).catch(() => null);

      const [vSnap, equipmentSnap, existingSnap, providerSnap, providerSettingsSnap] = await Promise.all([
        vehicleSnapPromise,
        equipmentSnapPromise,
        existingSnapPromise,
        providerSnapPromise,
        providerSettingsPromise,
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

      setEquipmentGroups(groupedEquipment);

      setExisting(existingSnap ? existingSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : []);
      setProviderOptions(
        buildCommonMaintenanceProviders(providerSnap.docs.map((d) => d.data()), {
          excludedProviders: providerSettingsSnap?.data()?.hiddenProviders,
        })
      );
    };

    run().catch((e) => {
      if (
        !handleFirestoreAccessError(e, {
          collectionName: "maintenanceBookings",
          operation: "load maintenance booking form data",
        })
      ) {
        console.error("[MaintenanceBookingForm] load error:", e);
      }
      setExisting([]);
      setProviderOptions([]);
    });
  }, [accessKey, canManageProviderOptions, dataAccessState, vehicleId]);

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

  useEffect(() => {
    const nextSelection = normalizeEquipmentSelection(initialEquipment);
    setSelectedEquipment((currentSelection) =>
      equipmentSelectionsEqual(currentSelection, nextSelection)
        ? currentSelection
        : nextSelection
    );
  }, [initialEquipmentKey]);

  const equipmentOptions = useMemo(
    () =>
      Object.entries(equipmentGroups)
        .flatMap(([category, items]) =>
          (Array.isArray(items) ? items : []).map((name) => ({
            category,
            name,
            search: `${name} ${category}`.toLowerCase(),
          }))
        )
        .sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category)),
    [equipmentGroups]
  );

  const filteredEquipmentOptions = useMemo(() => {
    const queryText = equipmentSearch.trim().toLowerCase();
    if (!queryText) return [];
    return equipmentOptions.filter((item) => item.search.includes(queryText)).slice(0, 10);
  }, [equipmentOptions, equipmentSearch]);

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
  }, [saving, vehicleId, selectedEquipment, safeType, inspectionTypeIds, useCustomDates, customDates, isMultiDay, appointmentDate, startDate, endDate, activeConflict, scheduleRule, scheduleExceptionReason]);

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
    setFormError("");
    try {
      const savedBooking = await saveBooking({
        vehicleId,
        vehicleLabel,
        vehicle,
        type: safeType,
        status,
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
        cost: "",
        notes,
        equipment: selectedEquipment,
        sourceDueDate,
        sourceDueIsoWeek,
        sourceDueKey,
        authState: dataAccessState,
        maintenanceTypeIds: safeType === "INSPECTION" ? inspectionTypeIds : [],
        requestedRecordId,
        scheduleExceptionReason,
      });

      if (typeof onSaved === "function") onSaved(savedBooking);
      else if (typeof onClose === "function") onClose();
    } catch (err) {
      console.error("[MaintenanceBookingForm] save error:", err);
      setFormError("Failed to save maintenance booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow="Maintenance booking"
      title={title}
      description={<>Vehicle: <b>{vehicleLabel || "Equipment only"}</b></>}
      size="lg"
      density="compact"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form={`${fieldPrefix}-form`} size="sm" disabled={!canSubmit} loading={saving}>Create booking</Button>
        </>
      }
    >

        {formError ? (
          <div className={layoutStyles.extracted8}>{formError}</div>
        ) : null}

        <form id={`${fieldPrefix}-form`} onSubmit={handleSubmit} className={layoutStyles.extracted9}>
          <section className={layoutStyles.bookingSettings}>
            <div className={layoutStyles.sectionHeader}>Booking settings <span>{bookingSettingsSummary}</span></div>
            <div className={layoutStyles.bookingSettingsGrid}>
          {/* Type */}
          <div className={layoutStyles.extracted10}>
            <label htmlFor={`${fieldPrefix}-type`} className={layoutStyles.extracted11}>Maintenance type</label>
            <select
              id={`${fieldPrefix}-type`}
              className={layoutStyles.extracted15}
              value={safeType}
              onChange={(e) => setMaintenanceType(e.target.value)}
            >
              <option value="MOT">MOT</option>
              <option value="SERVICE">Service</option>
              <option value="INSPECTION">Inspection / Compliance</option>
              <option value="WORK">Work / Maintenance</option>
            </select>
          </div>

          {/* Status */}
          <div className={layoutStyles.extracted13}>
            <label htmlFor={`${fieldPrefix}-status`} className={layoutStyles.extracted14}>Status</label>
            <select id={`${fieldPrefix}-status`} value={status} onChange={(e) => setStatus(e.target.value)} className={layoutStyles.extracted15}>
              <option value="Requested">Requested</option>
              <option value="Booked">Booked</option>
            </select>
          </div>

          {/* Single vs multi */}
          <div className={layoutStyles.extracted16}>
            <label htmlFor={`${fieldPrefix}-booking-mode`} className={layoutStyles.extracted17}>Booking type</label>
            <select
              id={`${fieldPrefix}-booking-mode`}
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
              className={layoutStyles.extracted18}
            >
              <option value="single">Single day (appointment)</option>
              <option value="multi">Multi-day (off-road / workshop)</option>
              <option value="custom">Multi-day (non-consecutive)</option>
            </select>
          </div>

          {safeType === "INSPECTION" ? (
            <fieldset className={layoutStyles.inspectionOptions}>
              <legend className={layoutStyles.extracted11}>Inspection / compliance work</legend>
              <div>
                {INSPECTION_WORK_OPTIONS.map(({ value, label }) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={inspectionTypeIds.includes(value)}
                      onChange={(event) =>
                        setInspectionTypeIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, value])]
                            : current.filter((item) => item !== value)
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              {inspectionTypeIds.length === 0 ? (
                <div className={layoutStyles.inspectionError}>
                  Select at least one inspection or compliance item.
                </div>
              ) : null}
            </fieldset>
          ) : null}
            </div>
          </section>

          {sourceDueDateObj ? (
            <div
              style={{
                gridColumn: "1 / -1",
                border: `1px solid ${outsideDueWeek ? "rgba(245,158,11,0.5)" : "rgba(59,130,246,0.35)"}`,
                background: outsideDueWeek ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.10)",
                color: "var(--color-text)",
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              This work is legally due on{" "}
              <b>{sourceDueDateObj.toLocaleDateString("en-GB")}</b> in week{" "}
              <b>{sourceDueIsoWeek || "Unknown"}</b>.
              {scheduleRule.state === "inspection_exception"
                ? " This inspection sits outside the legal ISO week and requires a reason."
                : scheduleRule.state === "service_advisory"
                ? " This service is outside its planned week, which is allowed."
                : scheduleRule.state === "after_expiry"
                ? " The MOT appointment is after its legal expiry date and cannot be booked."
                : safeType === "MOT"
                ? " The MOT appointment is on or before its legal expiry date."
                : " This booking is inside the planned ISO week."}
              {scheduleRule.requiresExceptionReason ? (
                <div style={{ marginTop: 8 }}>
                  <label htmlFor={`${fieldPrefix}-schedule-exception-reason`} style={{ display: "block", fontWeight: 800, marginBottom: 5 }}>
                    Reason for booking outside the due week
                  </label>
                  <input
                    id={`${fieldPrefix}-schedule-exception-reason`}
                    value={scheduleExceptionReason}
                    onChange={(event) => setScheduleExceptionReason(event.target.value)}
                    placeholder="Required for the compliance audit trail"
                    className={layoutStyles.extracted15}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {useCustomDates ? (
            <>
              <div className={layoutStyles.extracted19}>
                <label id={`${fieldPrefix}-selected-dates-label`} className={layoutStyles.extracted20}>Selected dates</label>
                <DatePicker
                  multiple
                  value={customDates}
                  format="YYYY-MM-DD"
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
                  <div className={layoutStyles.extracted21}>
                    {customDates.join(", ")}
                  </div>
                ) : null}
              </div>

              <div className={layoutStyles.extracted22}>
                <label htmlFor={`${fieldPrefix}-appointment-time`} className={layoutStyles.extracted23}>Appointment time</label>
                <input
                  id={`${fieldPrefix}-appointment-time`}
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className={layoutStyles.extracted24}
                />
              </div>
            </>
          ) : !isMultiDay ? (
            <>
              <div className={layoutStyles.extracted25}>
                <label htmlFor={`${fieldPrefix}-appointment-date`} className={layoutStyles.extracted26}>Appointment date</label>
                <input
                  id={`${fieldPrefix}-appointment-date`}
                  type="date"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  required
                  className={layoutStyles.extracted27}
                />
              </div>

              <div className={layoutStyles.extracted28}>
                <label htmlFor={`${fieldPrefix}-appointment-time`} className={layoutStyles.extracted29}>Appointment time</label>
                <input
                  id={`${fieldPrefix}-appointment-time`}
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className={layoutStyles.extracted30}
                />
              </div>
            </>
          ) : (
            <>
              <div className={layoutStyles.extracted31}>
                <label htmlFor={`${fieldPrefix}-start-date`} className={layoutStyles.extracted32}>Start date</label>
                <input
                  id={`${fieldPrefix}-start-date`}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className={layoutStyles.extracted33}
                />
              </div>

              <div className={layoutStyles.extracted34}>
                <label htmlFor={`${fieldPrefix}-end-date`} className={layoutStyles.extracted35}>End date</label>
                <input
                  id={`${fieldPrefix}-end-date`}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className={layoutStyles.extracted36}
                />
              </div>

              <div className={layoutStyles.extracted37}>
                <label htmlFor={`${fieldPrefix}-appointment-time`} className={layoutStyles.extracted38}>Appointment time</label>
                <input
                  id={`${fieldPrefix}-appointment-time`}
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className={layoutStyles.extracted39}
                />
              </div>
            </>
          )}

          {/* Conflict */}
          {conflictMsg ? (
            <div
              className={`${layoutStyles.extracted40} ${!activeConflict?.blocking ? layoutStyles.allowedOverlap : ""}`}
            >
              <div className={layoutStyles.extracted41}>
                {activeConflict?.blocking ? "Booking conflict" : "Existing maintenance on this date — allowed"}
              </div>
              <div>{conflictMsg}</div>
            </div>
          ) : null}

          {/* Details */}
          <section className={layoutStyles.additionalDetails}>
            <div className={layoutStyles.sectionHeader}>Optional workshop details</div>
            <div className={layoutStyles.additionalDetailsGrid}>
          <div className={layoutStyles.extracted42}>
            <label htmlFor={`${fieldPrefix}-provider`} className={layoutStyles.extracted43}>Provider / garage</label>
            <div className={layoutStyles.providerInputRow}>
              <input
                id={`${fieldPrefix}-provider`}
                list={`${fieldPrefix}-provider-options`}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder={providerOptions.length ? "Select or type a garage" : "Type a garage"}
                autoComplete="off"
                className={layoutStyles.extracted44}
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

          <div className={layoutStyles.extracted42}>
            <label htmlFor={`${fieldPrefix}-booking-ref`} className={layoutStyles.extracted43}>Garage booking reference</label>
            <input id={`${fieldPrefix}-booking-ref`} value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} className={layoutStyles.extracted44} />
          </div>

          <div className={layoutStyles.extracted42}>
            <label htmlFor={`${fieldPrefix}-location`} className={layoutStyles.extracted43}>Location</label>
            <input id={`${fieldPrefix}-location`} value={location} onChange={(e) => setLocation(e.target.value)} className={layoutStyles.extracted44} />
          </div>

          <div className={layoutStyles.extracted45}>
            <label htmlFor={`${fieldPrefix}-equipment-search`} className={layoutStyles.extracted46}>Book equipment off</label>
            {equipmentOptions.length ? (
              <div className={layoutStyles.extracted47}>
                <div className={layoutStyles.extracted48}>
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
                    className={layoutStyles.extracted49}
                  />

                  {equipmentSearchOpen && equipmentSearch.trim() ? (
                    <div id={`${fieldPrefix}-equipment-options`} role="listbox" className={layoutStyles.extracted50}>
                      {filteredEquipmentOptions.length ? (
                        filteredEquipmentOptions.map(({ category, name }) => {
                          const checked = selectedEquipment.includes(name);
                          return (
                            <label
                              key={`${category}:${name}`}
                              role="option"
                              aria-selected={checked}
                              className={layoutStyles.extracted51}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggleEquipment(name, e.target.checked)}
                              />
                              <span className={layoutStyles.extracted52}>
                                <span className={layoutStyles.extracted53}>{name}</span>
                                <span className={layoutStyles.extracted54}>{category}</span>
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <div className={layoutStyles.extracted55}>No equipment matches that search.</div>
                      )}
                    </div>
                  ) : null}
                </div>

                {selectedEquipment.length ? (
                  <div className={layoutStyles.extracted56}>
                    {selectedEquipment.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleEquipment(name, false)}
                        className={layoutStyles.extracted57}
                        title="Remove equipment"
                      >
                        {name} <span className={layoutStyles.extracted58}>X</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={layoutStyles.extracted59}>No equipment found.</div>
            )}
          </div>

          <div className={layoutStyles.extracted60}>
            <label htmlFor={`${fieldPrefix}-notes`} className={layoutStyles.extracted61}>Notes</label>
            <textarea
              ref={notesRef}
              id={`${fieldPrefix}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="Drop-off times, contact, what to fix, etc..."
              className={layoutStyles.extracted62}
            />
          </div>
            </div>
          </section>

        </form>
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

const dangerBtn = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-danger)",
  background: "var(--color-danger)",
  color: "var(--color-white)",
  fontWeight: 900,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 6px 12px rgba(185,28,28,0.14)",
};
