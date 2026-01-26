// src/app/vehicle-edit/[id]/page.js
// ✅ UPDATED: MOT/SERVICE bookings now support CREATE + EDIT from this page
// ✅ Sync: When booking status is "Completed", it updates core due dates (last + next) automatically
// ✅ Keeps: your auto-calcs + frequencies logic unchanged
// ✅ Ensures: maintenanceBookings docs always store usable Date objects for calendar

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  addDoc,
  collection,
  getDocs,
  doc as fsDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db, storage } from "../../../../firebaseConfig";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import EditMaintenanceBookingForm from "@/app/components/EditMaintenanceBookingForm";

/* ───────────────── UI tokens (match your newer pages) ───────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 16,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};
const title = { margin: 0, fontSize: 26, fontWeight: 950, letterSpacing: "-0.01em", color: UI.text };
const subtitle = { marginTop: 6, fontSize: 12.5, color: UI.muted };

const card = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...card, padding: 14 };

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
      textDecoration: "none",
    };
  }
  if (kind === "danger") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.red}`,
      background: UI.red,
      color: "#fff",
      fontWeight: 950,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  if (kind === "success") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.green}`,
      background: UI.green,
      color: "#fff",
      fontWeight: 950,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const inputField = {
  width: "100%",
  padding: "10px 10px",
  fontSize: 13.5,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  color: UI.text,
  outline: "none",
};

const textarea = {
  ...inputField,
  minHeight: 140,
  resize: "vertical",
  lineHeight: 1.35,
};

const sectionTitle = {
  margin: "0 0 10px",
  fontSize: 14,
  fontWeight: 950,
  color: UI.text,
  letterSpacing: ".01em",
};

const sectionMeta = { marginTop: -6, marginBottom: 10, fontSize: 12, color: UI.muted };

const grid = (cols = 2) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: 12,
});

/* ───────────────── helpers ───────────────── */
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

const safeArr = (v) => (Array.isArray(v) ? v : []);

const getMotBookingStatus = ({ motBookedStatus, motAppointmentDate, nextMOT }) => {
  const appt = parseISOorBlank(motAppointmentDate);
  const expiry = parseISOorBlank(nextMOT);

  if (!appt && !motBookedStatus) return "";
  if (appt) {
    if (expiry && appt.getTime() > expiry.getTime()) return "Booked (After Expiry)";
    return "Booked";
  }
  return motBookedStatus || "";
};

const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  const as = startOfDay(aStart).getTime();
  const ae = endOfDay(aEnd).getTime();
  const bs = startOfDay(bStart).getTime();
  const be = endOfDay(bEnd).getTime();
  return as <= be && bs <= ae;
};

const ymdToDate = (ymd) => {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(+dt) ? null : dt;
};

/* ✅ completion helpers (sync bookings -> core due dates) */
const completionISOFromBooking = ({ isMultiDay, appointmentDate, endDate, startDate }) => {
  if (!isMultiDay) return appointmentDate || "";
  return endDate || startDate || "";
};

const computeNextDueFromCompletion = (completedISO, freqWeeks) => {
  return calcNextFromWeeks(completedISO, freqWeeks);
};

/* ───────────────── page ───────────────── */
export default function EditVehiclePage() {
  const router = useRouter();
  const { id } = useParams();

  const [vehicle, setVehicle] = useState(null);
  const [categories, setCategories] = useState([]);
  const [uploadingField, setUploadingField] = useState(null);
  const [saving, setSaving] = useState(false);

  // booking modals (create)
  const [showMotBooking, setShowMotBooking] = useState(false);
  const [showServiceBooking, setShowServiceBooking] = useState(false);

  // booking modals (edit)
  const [editBookingId, setEditBookingId] = useState(null);

  // categories list
  useEffect(() => {
    const fetchCategories = async () => {
      const snap = await getDocs(collection(db, "vehicles"));
      const allCats = snap.docs.map((d) => d.data()?.category).filter(Boolean);
      setCategories(Array.from(new Set(allCats)).sort((a, b) => a.localeCompare(b)));
    };
    fetchCategories().catch(console.error);
  }, []);

  const reloadVehicle = async () => {
    if (!id) return;
    const refDoc = fsDoc(db, "vehicles", id);
    const snap = await getDoc(refDoc);
    if (snap.exists()) setVehicle({ id: snap.id, ...snap.data() });
  };

  // load vehicle
  useEffect(() => {
    if (!id) return;
    reloadVehicle().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Single, consistent auto-calc engine
  useEffect(() => {
    if (!vehicle) return;

    const updates = {};

    // MOT expiry due
    const nextMOT = calcNextFromWeeks(vehicle.lastMOT, vehicle.motFreq);
    if (nextMOT && vehicle.nextMOT !== nextMOT) updates.nextMOT = nextMOT;

    // Service
    const nextService = calcNextFromWeeks(vehicle.lastService, vehicle.serviceFreq);
    if (nextService && vehicle.nextService !== nextService) updates.nextService = nextService;

    // Tacho Inspection
    const nextTacho = calcNextFromWeeks(vehicle.lastTacho, vehicle.tachoFreq);
    if (nextTacho && vehicle.nextTacho !== nextTacho) updates.nextTacho = nextTacho;

    // Brake Test
    const nextBrakeTest = calcNextFromWeeks(vehicle.lastBrakeTest, vehicle.brakeTestFreq);
    if (nextBrakeTest && vehicle.nextBrakeTest !== nextBrakeTest) updates.nextBrakeTest = nextBrakeTest;

    // PMI
    const nextPMI = calcNextFromWeeks(vehicle.lastPMI, vehicle.pmiFreq);
    if (nextPMI && vehicle.nextPMI !== nextPMI) updates.nextPMI = nextPMI;

    // RFL
    const nextRFL = calcNextFromWeeks(vehicle.lastRFL, vehicle.rflFreq);
    if (nextRFL && vehicle.nextRFL !== nextRFL) updates.nextRFL = nextRFL;

    // Tacho Download
    const nextTachoDownload = calcNextFromWeeks(vehicle.lastTachoDownload, vehicle.tachoDownloadFreq);
    if (nextTachoDownload && vehicle.nextTachoDownload !== nextTachoDownload)
      updates.nextTachoDownload = nextTachoDownload;

    // Tail-lift
    const nextTailLift = calcNextFromWeeks(vehicle.lastTailLift, vehicle.tailLiftFreq);
    if (nextTailLift && vehicle.nextTailLift !== nextTailLift) updates.nextTailLift = nextTailLift;

    // LOLER
    const nextLoler = calcNextFromWeeks(vehicle.lastLoler, vehicle.lolerFreq);
    if (nextLoler && vehicle.nextLoler !== nextLoler) updates.nextLoler = nextLoler;

    // Tacho Calibration
    const nextTachoCalibration = calcNextFromWeeks(vehicle.lastTachoCalibration, vehicle.tachoCalibrationFreq);
    if (nextTachoCalibration && vehicle.nextTachoCalibration !== nextTachoCalibration)
      updates.nextTachoCalibration = nextTachoCalibration;

    // Lorry Inspection
    const nextLorryInspection = calcNextFromWeeks(vehicle.lastLorryInspection, vehicle.lorryInspectionFreq);
    if (nextLorryInspection && vehicle.nextLorryInspection !== nextLorryInspection)
      updates.nextLorryInspection = nextLorryInspection;

    // Derived MOT booking status (only derives when not explicitly completed/cancelled)
    const derivedMotStatus = getMotBookingStatus({
      motBookedStatus: vehicle.motBookedStatus,
      motAppointmentDate: vehicle.motAppointmentDate,
      nextMOT: updates.nextMOT ?? vehicle.nextMOT,
    });
    if (
      derivedMotStatus &&
      vehicle.motBookedStatus !== "Completed" &&
      vehicle.motBookedStatus !== "Cancelled" &&
      vehicle.motBookedStatus !== derivedMotStatus
    ) {
      updates.motBookedStatus = derivedMotStatus;
    }

    if (vehicle.motAppointmentDate && !vehicle.motBookedOn) {
      updates.motBookedOn = todayISO();
    }

    if (Object.keys(updates).length) setVehicle((p) => ({ ...p, ...updates }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vehicle?.lastMOT,
    vehicle?.motFreq,
    vehicle?.lastService,
    vehicle?.serviceFreq,
    vehicle?.lastTacho,
    vehicle?.tachoFreq,
    vehicle?.lastBrakeTest,
    vehicle?.brakeTestFreq,
    vehicle?.lastPMI,
    vehicle?.pmiFreq,
    vehicle?.lastRFL,
    vehicle?.rflFreq,
    vehicle?.lastTachoDownload,
    vehicle?.tachoDownloadFreq,
    vehicle?.lastTailLift,
    vehicle?.tailLiftFreq,
    vehicle?.lastLoler,
    vehicle?.lolerFreq,
    vehicle?.tachoCalibrationFreq,
    vehicle?.lastTachoCalibration,
    vehicle?.lastLorryInspection,
    vehicle?.lorryInspectionFreq,
    vehicle?.motAppointmentDate,
    vehicle?.motBookedOn,
    vehicle?.motBookedStatus,
  ]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setVehicle((prev) => ({ ...prev, [name]: value }));
  };

  const handleMotChange = (e) => {
    const { name, value } = e.target;

    setVehicle((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "motAppointmentDate") {
        if (value && !next.motBookedOn) next.motBookedOn = todayISO();
      }

      const derived = getMotBookingStatus({
        motBookedStatus: next.motBookedStatus,
        motAppointmentDate: next.motAppointmentDate,
        nextMOT: next.nextMOT,
      });

      if (next.motAppointmentDate && next.motBookedStatus !== "Completed" && next.motBookedStatus !== "Cancelled") {
        next.motBookedStatus = derived || "Booked";
      }

      return next;
    });
  };

  const handleSave = async () => {
    if (!vehicle?.id) return;
    setSaving(true);
    try {
      const refDoc = fsDoc(db, "vehicles", vehicle.id);
      const payload = { ...vehicle };
      delete payload.id;
      await updateDoc(refDoc, { ...payload, updatedAt: serverTimestamp() });
      alert("Vehicle updated.");
      router.push("/vehicles");
    } catch (e) {
      console.error(e);
      alert("Could not save vehicle.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm("Are you sure you want to delete this vehicle?");
    if (!ok) return;
    try {
      await deleteDoc(fsDoc(db, "vehicles", id));
      alert("Vehicle deleted.");
      router.push("/vehicles");
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      alert("Failed to delete vehicle.");
    }
  };

  const goToBookWorkPage = () => router.push(`/book-work/${id}`);

  const handleFileUpload = async (e, field) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !id) return;

    setUploadingField(field);
    try {
      const existing = safeArr(vehicle?.[field]);
      const uploaded = [];

      for (const file of files) {
        const sRef = storageRef(storage, `vehicles/${id}/${field}/${Date.now()}-${file.name}`);
        const snap = await uploadBytes(sRef, file);
        const url = await getDownloadURL(snap.ref);
        uploaded.push({ name: file.name, url });
      }

      const updatedList = [...existing, ...uploaded];
      await updateDoc(fsDoc(db, "vehicles", id), {
        [field]: updatedList,
        updatedAt: serverTimestamp(),
      });

      setVehicle((prev) => ({ ...prev, [field]: updatedList }));
      e.target.value = "";
    } catch (err) {
      console.error("File upload error:", err);
      alert("Error uploading files.");
    } finally {
      setUploadingField(null);
    }
  };

  const headerLabel = useMemo(() => {
    if (!vehicle) return "";
    return vehicle.name || vehicle.registration || vehicle.reg || vehicle.id;
  }, [vehicle]);

  const hasMotBooking = Boolean(vehicle?.motBookingId);
  const hasServiceBooking = Boolean(vehicle?.serviceBookingId);

  if (!vehicle) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={{ ...panel, textAlign: "center", color: UI.muted }}>Loading vehicle…</div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  const motStatusPill = (() => {
    const status = vehicle.motBookedStatus || "";
    if (!status) return null;

    const styles = {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 950,
      border: "1px solid #e5e7eb",
      background: "#fff",
      color: UI.text,
      whiteSpace: "nowrap",
    };

    let dot = UI.brand;
    if (status.includes("After Expiry")) dot = UI.red;
    else if (status === "Booked") dot = UI.green;
    else if (status === "Requested") dot = UI.amber;
    else if (status === "Completed") dot = UI.green;

    return (
      <div style={styles} title="MOT booking status">
        <span style={{ width: 10, height: 10, borderRadius: 999, background: dot, display: "inline-block" }} />
        {status}
      </div>
    );
  })();

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        input:focus,
        select:focus,
        textarea:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29, 78, 216, 0.14);
          border-color: #bfdbfe !important;
        }
        select option {
          background: #fff;
          color: #0f172a;
        }
      `}</style>

      <div style={pageWrap}>
        <div style={topBar}>
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={title}>Edit Vehicle — {headerLabel}</h1>
              {motStatusPill}
            </div>
            <div style={subtitle}>Edit details, due dates, paperwork, attachments, notes — and create/edit MOT / Service bookings.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => setShowMotBooking(true)} style={btn("success")}>
              Book MOT
            </button>
            {hasMotBooking ? (
              <button
                onClick={() => setEditBookingId(vehicle.motBookingId)}
                style={btn("ghost")}
                title="Edit the MOT booking record"
              >
                Edit MOT Booking
              </button>
            ) : null}

            <button onClick={() => setShowServiceBooking(true)} style={btn("success")}>
              Book Service
            </button>
            {hasServiceBooking ? (
              <button
                onClick={() => setEditBookingId(vehicle.serviceBookingId)}
                style={btn("ghost")}
                title="Edit the Service booking record"
              >
                Edit Service Booking
              </button>
            ) : null}

            <button onClick={goToBookWorkPage} style={btn("success")}>
              Book Work
            </button>
            <button onClick={handleSave} style={btn()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleDelete} style={btn("danger")}>
              Delete
            </button>
          </div>
        </div>

        {/* ✅ CREATE Booking modals */}
        {showMotBooking ? (
          <MaintenanceBookingForm
            vehicleId={id}
            type="MOT"
            defaultDate={vehicle?.nextMOT || ""}
            vehicleSnapshot={vehicle}
            onClose={() => setShowMotBooking(false)}
            onSaved={async () => {
              setShowMotBooking(false);
              await reloadVehicle();
            }}
          />
        ) : null}

        {showServiceBooking ? (
          <MaintenanceBookingForm
            vehicleId={id}
            type="SERVICE"
            defaultDate={vehicle?.nextService || ""}
            vehicleSnapshot={vehicle}
            onClose={() => setShowServiceBooking(false)}
            onSaved={async () => {
              setShowServiceBooking(false);
              await reloadVehicle();
            }}
          />
        ) : null}

        {/* ✅ EDIT Booking modal */}
        {editBookingId ? (
          <EditMaintenanceBookingForm
            bookingId={editBookingId}
            onClose={() => setEditBookingId(null)}
            onSaved={async () => {
              setEditBookingId(null);
              await reloadVehicle();
            }}
          />
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: UI.gap, alignItems: "start" }}>
          {/* LEFT: Main form */}
          <div style={{ display: "flex", flexDirection: "column", gap: UI.gap }}>
            {/* Main Information */}
            <div style={panel}>
              <h2 style={sectionTitle}>Main Information</h2>
              <div style={grid(2)}>
                <Field label="Name" name="name" value={vehicle.name} onChange={handleChange} />
                <Field label="Registration" name="registration" value={vehicle.registration || vehicle.reg} onChange={handleChange} />
                <Field label="Manufacturer" name="manufacturer" value={vehicle.manufacturer} onChange={handleChange} />
                <Field label="Model" name="model" value={vehicle.model} onChange={handleChange} />

                <div>
                  <label style={labelStyle}>Category</label>
                  <select name="category" value={vehicle.category || ""} onChange={handleChange} style={inputField}>
                    <option value="">Select category…</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <Field label="Chassis No." name="chassis" value={vehicle.chassis} onChange={handleChange} />
                <Field label="Odometer" name="odometer" value={vehicle.odometer} onChange={handleChange} />
                <Field label="MOT Certificate" name="motCertificate" value={vehicle.motCertificate} onChange={handleChange} />

                <div>
                  <label style={labelStyle}>Tax Status</label>
                  <select name="taxStatus" value={vehicle.taxStatus || "Taxed"} onChange={handleChange} style={inputField}>
                    <option value="Taxed">Taxed</option>
                    <option value="Sorn">Sorn</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Insurance Status</label>
                  <select
                    name="insuranceStatus"
                    value={vehicle.insuranceStatus || "Insured"}
                    onChange={handleChange}
                    style={inputField}
                  >
                    <option value="Insured">Insured</option>
                    <option value="Not Insured">Not Insured</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>

                <SelectField label="Warranty" name="warranty" value={vehicle.warranty} onChange={handleChange} options={["Yes", "No"]} />
                <DateField label="Warranty Expiry" name="warrantyExpiry" value={vehicle.warrantyExpiry} onChange={handleChange} />
              </div>
            </div>

            {/* Due Dates & Intervals */}
            <div style={panel}>
              <h2 style={sectionTitle}>Core Due Dates</h2>
              <div style={sectionMeta}>Edit the last date + frequency; “next” will auto-calculate.</div>

              <div style={grid(4)}>
                <DateField label="Last MOT" name="lastMOT" value={vehicle.lastMOT} onChange={handleChange} />
                <Field label="MOT Freq (weeks)" name="motFreq" value={vehicle.motFreq} onChange={handleChange} />
                <DateField label="Next MOT (Expiry)" name="nextMOT" value={vehicle.nextMOT} onChange={handleChange} />
                <Field label="MOT ISO Week" name="motISOWeek" value={vehicle.motISOWeek} onChange={handleChange} />

                <DateField label="Last Service" name="lastService" value={vehicle.lastService} onChange={handleChange} />
                <Field label="Service Freq (weeks)" name="serviceFreq" value={vehicle.serviceFreq} onChange={handleChange} />
                <DateField label="Next Service" name="nextService" value={vehicle.nextService} onChange={handleChange} />
                <Field label="Service ISO Week" name="serviceISOWeek" value={vehicle.serviceISOWeek} onChange={handleChange} />
              </div>
            </div>

            {/* MOT Booking (summary) */}
            <div style={panel}>
              <h2 style={sectionTitle}>MOT Booking (Summary)</h2>
              <div style={sectionMeta}>These fields are updated automatically when you create/edit a booking via the modals above.</div>

              <div style={grid(4)}>
                <SelectField
                  label="Booking Status"
                  name="motBookedStatus"
                  value={vehicle.motBookedStatus || ""}
                  onChange={handleMotChange}
                  options={["Requested", "Booked", "Completed", "Cancelled", "Booked (After Expiry)"]}
                />
                <DateField label="Booked On" name="motBookedOn" value={vehicle.motBookedOn || ""} onChange={handleMotChange} />
                <DateField
                  label="MOT Appointment Date"
                  name="motAppointmentDate"
                  value={vehicle.motAppointmentDate || ""}
                  onChange={handleMotChange}
                />
                <Field label="Provider / Garage" name="motProvider" value={vehicle.motProvider || ""} onChange={handleMotChange} />

                <Field label="Booking Ref" name="motBookingRef" value={vehicle.motBookingRef || ""} onChange={handleMotChange} />
                <Field label="Booked By" name="motBookedBy" value={vehicle.motBookedBy || ""} onChange={handleMotChange} />
                <Field label="Location" name="motLocation" value={vehicle.motLocation || ""} onChange={handleMotChange} />
                <Field label="Cost (optional)" name="motCost" value={vehicle.motCost || ""} onChange={handleMotChange} />
              </div>

              <div style={{ marginTop: 12 }}>
                <TextAreaField
                  label="MOT Booking Notes"
                  name="motBookingNotes"
                  value={vehicle.motBookingNotes || ""}
                  onChange={handleMotChange}
                  placeholder="Anything relevant: drop-off time, contacts, reminders, requirements…"
                />
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <FileUploadField
                  label="MOT Booking Files (emails/quotes/etc.)"
                  field="motBookingFiles"
                  files={vehicle.motBookingFiles}
                  onUpload={handleFileUpload}
                  uploadingField={uploadingField}
                />
              </div>
            </div>

            {/* Additional Maintenance (as per your snippet) */}
            <div style={panel}>
              <h2 style={sectionTitle}>Additional Maintenance</h2>
              <div style={grid(4)}>
                <DateField label="Last Tacho Inspection" name="lastTacho" value={vehicle.lastTacho} onChange={handleChange} />
                <Field label="Tacho Freq (weeks)" name="tachoFreq" value={vehicle.tachoFreq} onChange={handleChange} />
                <DateField label="Next Tacho Inspection" name="nextTacho" value={vehicle.nextTacho} onChange={handleChange} />
                <Field label="Tacho ISO Week" name="tachoISOWeek" value={vehicle.tachoISOWeek} onChange={handleChange} />

                <DateField label="Last Brake Test" name="lastBrakeTest" value={vehicle.lastBrakeTest} onChange={handleChange} />
                <Field label="Brake Test Freq (weeks)" name="brakeTestFreq" value={vehicle.brakeTestFreq} onChange={handleChange} />
                <DateField label="Next Brake Test" name="nextBrakeTest" value={vehicle.nextBrakeTest} onChange={handleChange} />
                <Field label="Brake Test ISO Week" name="brakeISOWeek" value={vehicle.brakeISOWeek} onChange={handleChange} />

                <DateField label="Last PMI Inspection" name="lastPMI" value={vehicle.lastPMI} onChange={handleChange} />
                <Field label="PMI Freq (weeks)" name="pmiFreq" value={vehicle.pmiFreq} onChange={handleChange} />
                <DateField label="Next PMI Inspection" name="nextPMI" value={vehicle.nextPMI} onChange={handleChange} />
                <Field label="PMI ISO Week" name="pmiISOWeek" value={vehicle.pmiISOWeek} onChange={handleChange} />

                <DateField label="Last RFL" name="lastRFL" value={vehicle.lastRFL} onChange={handleChange} />
                <Field label="RFL Freq (weeks)" name="rflFreq" value={vehicle.rflFreq} onChange={handleChange} />
                <DateField label="Next RFL" name="nextRFL" value={vehicle.nextRFL} onChange={handleChange} />
                <Field label="RFL ISO Week" name="rflISOWeek" value={vehicle.rflISOWeek} onChange={handleChange} />

                <DateField label="Last Tacho Download" name="lastTachoDownload" value={vehicle.lastTachoDownload} onChange={handleChange} />
                <Field label="Tacho Download Freq (weeks)" name="tachoDownloadFreq" value={vehicle.tachoDownloadFreq} onChange={handleChange} />
                <DateField label="Next Tacho Download" name="nextTachoDownload" value={vehicle.nextTachoDownload} onChange={handleChange} />
                <Field label="Tacho DL ISO Week" name="tachoDownloadISOWeek" value={vehicle.tachoDownloadISOWeek} onChange={handleChange} />

                <DateField label="Last Tail-lift Insp." name="lastTailLift" value={vehicle.lastTailLift} onChange={handleChange} />
                <Field label="Tail-lift Freq (weeks)" name="tailLiftFreq" value={vehicle.tailLiftFreq} onChange={handleChange} />
                <DateField label="Next Tail-lift Insp." name="nextTailLift" value={vehicle.nextTailLift} onChange={handleChange} />
                <Field label="Tail-lift ISO Week" name="tailLiftISOWeek" value={vehicle.tailLiftISOWeek} onChange={handleChange} />

                <DateField label="Last LOLER" name="lastLoler" value={vehicle.lastLoler} onChange={handleChange} />
                <Field label="LOLER Freq (weeks)" name="lolerFreq" value={vehicle.lolerFreq} onChange={handleChange} />
                <DateField label="Next LOLER" name="nextLoler" value={vehicle.nextLoler} onChange={handleChange} />
                <Field label="LOLER ISO Week" name="lolerISOWeek" value={vehicle.lolerISOWeek} onChange={handleChange} />
              </div>
            </div>

            {/* (rest of your page continues as before...) */}
          </div>

          {/* RIGHT: Notes + quick info */}
          <div style={{ position: "sticky", top: 18, alignSelf: "start", display: "flex", flexDirection: "column", gap: UI.gap }}>
            <div style={panel}>
              <h2 style={sectionTitle}>Notes</h2>
              <textarea
                name="notes"
                value={vehicle.notes || ""}
                onChange={handleChange}
                rows={14}
                style={textarea}
                placeholder="General notes for this vehicle…"
              />
            </div>

            <div style={panel}>
              <h2 style={sectionTitle}>Quick Links</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button style={btn("ghost")} onClick={() => router.push("/vehicles")}>
                  Vehicles List
                </button>
                <button style={btn("ghost")} onClick={() => router.push("/vehicle-checks")}>
                  Vehicle Checks
                </button>
                <button style={btn("ghost")} onClick={goToBookWorkPage}>
                  Book Work
                </button>
              </div>
            </div>

            <div style={panel}>
              <h2 style={sectionTitle}>Next Dates</h2>
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                <MiniLine label="Next MOT (Expiry)" value={vehicle.nextMOT} />
                <MiniLine label="MOT Appointment" value={vehicle.motAppointmentDate} />
                <MiniLine label="MOT Booked On" value={vehicle.motBookedOn} />
                <MiniLine label="Next Service" value={vehicle.nextService} />
                <MiniLine label="Next RFL" value={vehicle.nextRFL} />
                <MiniLine label="Next Tacho" value={vehicle.nextTacho} />
                <MiniLine label="Next Brake Test" value={vehicle.nextBrakeTest} />
                <MiniLine label="Next PMI" value={vehicle.nextPMI} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={goToBookWorkPage} style={btn("success")}>
            Book Work
          </button>
          <button onClick={handleSave} style={btn()} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ───────────────── Booking Modal Component (inline) ─────────────────
   - Creates doc in maintenanceBookings
   - Updates vehicle summary fields for MOT or SERVICE
   - ✅ If status === Completed: sync core due dates (last + next)
   - ✅ Ensures booking doc always has usable date fields:
       startDate/endDate ALWAYS Date objects
       appointmentDate stored as Date for single day
*/
function MaintenanceBookingForm({ vehicleId, type = "MOT", defaultDate = "", vehicleSnapshot, onClose, onSaved }) {
  const safeType = String(type || "").toUpperCase() === "SERVICE" ? "SERVICE" : "MOT";
  const title = safeType === "MOT" ? "Book MOT" : "Book Service";

  const [saving, setSaving] = useState(false);

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

  const [existing, setExisting] = useState([]);
  const [conflictMsg, setConflictMsg] = useState("");

  const vehicleLabel = useMemo(() => {
    const v = vehicleSnapshot || {};
    return v.name || v.registration || v.reg || vehicleId || "";
  }, [vehicleSnapshot, vehicleId]);

  // load existing bookings for this vehicle
  useEffect(() => {
    const run = async () => {
      if (!vehicleId) return;
      const qy = query(collection(db, "maintenanceBookings"), where("vehicleId", "==", vehicleId));
      const snap = await getDocs(qy);
      setExisting(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    run().catch((e) => {
      console.error("[MaintenanceBookingForm] fetch existing failed:", e);
      setExisting([]);
    });
  }, [vehicleId]);

  // keep multi-day fields aligned
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

      const bs = toDate(b.startDate) || toDate(b.date) || toDate(b.appointmentDate) || null;
      const be = toDate(b.endDate) || toDate(b.date) || toDate(b.appointmentDate) || bs;
      if (!bs || !be) return false;

      return rangesOverlap(bookingDates.start, bookingDates.end, bs, be);
    });

    return conflict || null;
  }, [existing, bookingDates.start, bookingDates.end]);

  useEffect(() => {
    if (!activeConflict) {
      setConflictMsg("");
      return;
    }
    const bs = toDate(activeConflict.startDate) || toDate(activeConflict.date) || toDate(activeConflict.appointmentDate);
    const be = toDate(activeConflict.endDate) || toDate(activeConflict.date) || toDate(activeConflict.appointmentDate);

    setConflictMsg(
      `⚠️ This vehicle already has an overlapping maintenance booking (${activeConflict.type || "Maintenance"} — ${
        activeConflict.status || "Booked"
      }) from ${bs ? bs.toLocaleDateString("en-GB") : "?"} → ${be ? be.toLocaleDateString("en-GB") : "?"}.`
    );
  }, [activeConflict]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const start = bookingDates.start;
    const end = bookingDates.end;
    if (!start || !end) return;

    setSaving(true);
    try {
      // ✅ ALWAYS write real Date objects into maintenanceBookings
      const apptDateObj = !isMultiDay ? ymdToDate(appointmentDate) : null;

      const completedISO =
        status === "Completed"
          ? completionISOFromBooking({ isMultiDay, appointmentDate, startDate, endDate })
          : "";

      // 1) create booking doc
      const bookingPayload = {
        kind: "MAINTENANCE",
        type: safeType, // MOT | SERVICE
        vehicleId,
        vehicleLabel,
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

      // 2) update vehicle summary fields (+ sync core due dates on completion)
      const vRef = fsDoc(db, "vehicles", vehicleId);

      if (safeType === "MOT") {
        const motFreqWeeks = Number(vehicleSnapshot?.motFreq || 0);

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
          motBookingId: created.id,
          updatedAt: serverTimestamp(),
        };

        // ✅ completed -> push core due dates forward
        if (completedISO) {
          updates.lastMOT = completedISO;
          updates.nextMOT = computeNextDueFromCompletion(completedISO, motFreqWeeks);

          // Optional: clear appointment summary fields once completed
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
        const serviceFreqWeeks = Number(vehicleSnapshot?.serviceFreq || 0);

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
          serviceBookingId: created.id,
          updatedAt: serverTimestamp(),
        };

        // ✅ completed -> push core due dates forward
        if (completedISO) {
          updates.lastService = completedISO;
          updates.nextService = computeNextDueFromCompletion(completedISO, serviceFreqWeeks);

          // Optional: clear appointment summary fields once completed
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
    } catch (err) {
      console.error("[MaintenanceBookingForm] save error:", err);
      alert("Failed to create booking.");
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

          <button onClick={onClose} style={closeBtn} aria-label="Close" type="button">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={modalLabel}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={modalInput}>
              <option value="Requested">Requested</option>
              <option value="Booked">Booked</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label style={modalLabel}>Booking type</label>
            <select value={isMultiDay ? "multi" : "single"} onChange={(e) => setIsMultiDay(e.target.value === "multi")} style={modalInput}>
              <option value="single">Single day (appointment)</option>
              <option value="multi">Multi-day (off-road / workshop)</option>
            </select>
          </div>

          {!isMultiDay ? (
            <div>
              <label style={modalLabel}>Appointment date</label>
              <input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} required style={modalInput} />
            </div>
          ) : (
            <>
              <div>
                <label style={modalLabel}>Start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={modalInput} />
              </div>
              <div>
                <label style={modalLabel}>End date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={modalInput} />
              </div>
            </>
          )}

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

          <div>
            <label style={modalLabel}>Provider / garage</label>
            <input value={provider} onChange={(e) => setProvider(e.target.value)} style={modalInput} />
          </div>

          <div>
            <label style={modalLabel}>Booking reference</label>
            <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} style={modalInput} />
          </div>

          <div>
            <label style={modalLabel}>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={modalInput} />
          </div>

          <div>
            <label style={modalLabel}>Cost (optional)</label>
            <input value={cost} onChange={(e) => setCost(e.target.value)} style={modalInput} />
          </div>

          <div>
            <label style={modalLabel}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...modalInput, minHeight: 80, resize: "vertical", paddingTop: 12 }}
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

          <button type="button" onClick={onClose} style={dangerBtn}>
            Cancel
          </button>

          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            Saves to <b>maintenanceBookings</b> + updates the vehicle summary fields.
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

/* ───────────────── small components ───────────────── */
function Field({ label, name, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="text" name={name} value={value || ""} onChange={onChange} style={inputField} />
    </div>
  );
}

function DateField({ label, name, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="date" name={name} value={value || ""} onChange={onChange} style={inputField} />
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select name={name} value={value || ""} onChange={onChange} style={inputField}>
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({ label, name, value, onChange, placeholder }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
        name={name}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        rows={6}
        style={{ ...textarea, minHeight: 140 }}
      />
    </div>
  );
}

function FileUploadField({ label, field, files, onUpload, uploadingField }) {
  const isUploading = uploadingField === field;
  const list = Array.isArray(files) ? files : [];

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" multiple onChange={(e) => onUpload(e, field)} />
        {isUploading ? <span style={{ fontSize: 12, color: UI.muted }}>Uploading…</span> : null}
      </div>

      {list.length ? (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {list.map((f, idx) => (
            <a
              key={`${field}-${idx}`}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 13,
                color: UI.brand,
                fontWeight: 800,
                textDecoration: "none",
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
              }}
              title={f.url}
            >
              {f.name || `File ${idx + 1}`} →
            </a>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 12, color: UI.muted }}>No files uploaded.</div>
      )}
    </div>
  );
}

function MiniLine({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: UI.muted, fontWeight: 900 }}>{label}</span>
      <span style={{ color: UI.text, fontWeight: 950 }}>{value || "—"}</span>
    </div>
  );
}

/* ───────────────── modal styles (HolidayForm vibe) ───────────────── */
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

const modalLabel = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(255,255,255,0.85)",
  marginBottom: 6,
};

const modalInput = {
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
