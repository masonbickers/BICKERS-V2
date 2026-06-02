// src/app/components/MaintenanceBookingForm.jsx
//  Matches the UPDATED vehicle-edit page logic
//  Creates maintenanceBookings doc with real Date objects (calendar-safe)
//  Writes summary fields back to vehicle
//  If status === "Completed": updates core due dates (last + next) using vehicle frequencies
//  Conflict check ignores Cancelled/Declined and compares proper date ranges

"use client";

import { useEffect, useMemo, useState } from "react";
import DatePicker from "react-multi-date-picker";
import { db } from "../../../firebaseConfig";
import { getIsoWeekLabel } from "../utils/maintenanceSchema";
import {
  bookingToDateKeys as serviceBookingToDateKeys,
  createMaintenanceBooking,
  normalizeMaintenanceType,
} from "../utils/maintenanceBookingService";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

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
  const [appointmentTime, setAppointmentTime] = useState("");
  const [startDate, setStartDate] = useState(defaultDate || "");
  const [endDate, setEndDate] = useState(defaultDate || "");
  const [customDates, setCustomDates] = useState(defaultDate ? [defaultDate] : []);

  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [equipmentGroups, setEquipmentGroups] = useState({});
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentSearchOpen, setEquipmentSearchOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(
    Array.isArray(initialEquipment) ? initialEquipment.filter(Boolean) : []
  );

  const [saving, setSaving] = useState(false);
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

  const safeType = normalizeMaintenanceType(type);
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

      setEquipmentGroups(groupedEquipment);

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
      const savedBooking = await createMaintenanceBooking({
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
        bookingRef: "",
        location: "",
        cost: "",
        notes,
        equipment: selectedEquipment,
        sourceDueDate,
        sourceDueIsoWeek,
        sourceDueKey,
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
    <div style={overlay}>
      <div style={modal}>
        <div style={headerRow}>
          <div>
            <h2 style={modalTitle}>{title}</h2>
            <div style={modalSubtitle}>
              Vehicle: <b style={{ color: "#0f172a" }}>{vehicleLabel || "Equipment only"}</b>
            </div>
          </div>

          <button onClick={handleClose} style={closeBtn} aria-label="Close" type="button">
            X
          </button>
        </div>

        {formError ? (
          <div style={feedbackError}>{formError}</div>
        ) : null}

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
                color: "#0f172a",
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
            <>
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

              <div style={fieldBlock}>
                <label style={label}>Appointment time</label>
                <input
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  style={input}
                />
              </div>
            </>
          ) : !isMultiDay ? (
            <>
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

              <div style={fieldBlock}>
                <label style={label}>Appointment time</label>
                <input
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  style={input}
                />
              </div>
            </>
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

              <div style={fieldBlock}>
                <label style={label}>Appointment time</label>
                <input
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
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
                marginBottom: 0,
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
              placeholder="Drop-off times, contact, what to fix, etc..."
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

          <div style={{ ...fullWidth, ...helperText, marginTop: 0 }}>
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
