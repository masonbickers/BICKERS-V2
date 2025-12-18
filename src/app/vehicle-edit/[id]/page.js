// src/app/vehicle-edit/[id]/page.js  (or your current route file)
// ✅ Full upgraded EditVehiclePage (same “maintenance system” look/feel)
// ✅ Cleaner auto-calcs, safer date handling, editable Tax/Insurance, better layout, nicer file uploads

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  getDocs,
  doc as fsDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, storage } from "../../../../firebaseConfig";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

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
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

const parseISOorBlank = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
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

/* ───────────────── page ───────────────── */
export default function EditVehiclePage() {
  const router = useRouter();
  const { id } = useParams();

  const [vehicle, setVehicle] = useState(null);
  const [categories, setCategories] = useState([]);
  const [uploadingField, setUploadingField] = useState(null);
  const [saving, setSaving] = useState(false);

  // categories list
  useEffect(() => {
    const fetchCategories = async () => {
      const snap = await getDocs(collection(db, "vehicles"));
      const allCats = snap.docs.map((d) => d.data()?.category).filter(Boolean);
      setCategories(Array.from(new Set(allCats)).sort((a, b) => a.localeCompare(b)));
    };
    fetchCategories().catch(console.error);
  }, []);

  // load vehicle
  useEffect(() => {
    const fetchVehicle = async () => {
      const refDoc = fsDoc(db, "vehicles", id);
      const snap = await getDoc(refDoc);
      if (snap.exists()) setVehicle({ id: snap.id, ...snap.data() });
    };
    if (id) fetchVehicle().catch(console.error);
  }, [id]);

  // Single, consistent auto-calc engine
  useEffect(() => {
    if (!vehicle) return;

    const updates = {};

    // MOT
    const nextMOT = calcNextFromWeeks(vehicle.lastMOT, vehicle.motFreq);
    if (nextMOT && vehicle.nextMOT !== nextMOT) updates.nextMOT = nextMOT;

    // Service
    const nextService = calcNextFromWeeks(vehicle.lastService, vehicle.serviceFreq);
    if (nextService && vehicle.nextService !== nextService) updates.nextService = nextService;

    // Tacho Inspection (your fields are lastTacho/nextTacho)
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
    vehicle?.lastTachoCalibration,
    vehicle?.tachoCalibrationFreq,
    vehicle?.lastLorryInspection,
    vehicle?.lorryInspectionFreq,
  ]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setVehicle((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!vehicle?.id) return;
    setSaving(true);
    try {
      const refDoc = fsDoc(db, "vehicles", vehicle.id);
      const payload = { ...vehicle };
      delete payload.id; // keep id out of doc
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

  if (!vehicle) {
    return (
      <HeaderSidebarLayout>
        <div style={pageWrap}>
          <div style={{ ...panel, textAlign: "center", color: UI.muted }}>Loading vehicle…</div>
        </div>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <style jsx global>{`
        input:focus, select:focus, textarea:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29,78,216,0.14);
          border-color: #bfdbfe !important;
        }
      `}</style>

      <div style={pageWrap}>
        <div style={topBar}>
          <div>
            <h1 style={title}>Edit Vehicle — {headerLabel}</h1>
            <div style={subtitle}>Edit details, due dates, paperwork, attachments, and notes.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={goToBookWorkPage} style={btn("success")}>Book Work</button>
            <button onClick={handleSave} style={btn()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleDelete} style={btn("danger")}>Delete</button>
          </div>
        </div>

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
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <Field label="Chassis No." name="chassis" value={vehicle.chassis} onChange={handleChange} />
                <Field label="Odometer" name="odometer" value={vehicle.odometer} onChange={handleChange} />
                <Field label="MOT Certificate" name="motCertificate" value={vehicle.motCertificate} onChange={handleChange} />

                {/* Make these editable + persisted (solves your earlier “UI only” issue) */}
                <div>
                  <label style={labelStyle}>Tax Status</label>
                  <select
                    name="taxStatus"
                    value={vehicle.taxStatus || "Taxed"}
                    onChange={handleChange}
                    style={inputField}
                  >
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

                <SelectField
                  label="Warranty"
                  name="warranty"
                  value={vehicle.warranty}
                  onChange={handleChange}
                  options={["Yes", "No"]}
                />
                <DateField
                  label="Warranty Expiry"
                  name="warrantyExpiry"
                  value={vehicle.warrantyExpiry}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Due Dates & Intervals */}
            <div style={panel}>
              <h2 style={sectionTitle}>Core Due Dates</h2>
              <div style={sectionMeta}>Edit the last date + frequency; “next” will auto-calculate.</div>

              <div style={grid(4)}>
                <DateField label="Last MOT" name="lastMOT" value={vehicle.lastMOT} onChange={handleChange} />
                <Field label="MOT Freq (weeks)" name="motFreq" value={vehicle.motFreq} onChange={handleChange} />
                <DateField label="Next MOT" name="nextMOT" value={vehicle.nextMOT} onChange={handleChange} />
                <Field label="MOT ISO Week" name="motISOWeek" value={vehicle.motISOWeek} onChange={handleChange} />

                <DateField label="Last Service" name="lastService" value={vehicle.lastService} onChange={handleChange} />
                <Field label="Service Freq (weeks)" name="serviceFreq" value={vehicle.serviceFreq} onChange={handleChange} />
                <DateField label="Next Service" name="nextService" value={vehicle.nextService} onChange={handleChange} />
                <Field label="Service ISO Week" name="serviceISOWeek" value={vehicle.serviceISOWeek} onChange={handleChange} />
              </div>
            </div>

            {/* Additional Maintenance */}
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

            {/* Lorry-only */}
            <div style={panel}>
              <h2 style={sectionTitle}>Lorries Only</h2>
              <div style={sectionMeta}>Keep here so the page works for all vehicles but stays organised.</div>

              <div style={grid(4)}>
                <DateField label="Last Tacho Calibration" name="lastTachoCalibration" value={vehicle.lastTachoCalibration} onChange={handleChange} />
                <Field label="Tacho Cal Freq (weeks)" name="tachoCalibrationFreq" value={vehicle.tachoCalibrationFreq} onChange={handleChange} />
                <DateField label="Next Tacho Calibration" name="nextTachoCalibration" value={vehicle.nextTachoCalibration} onChange={handleChange} />
                <Field label="Tacho Cal ISO Week" name="tachoCalibrationISOWeek" value={vehicle.tachoCalibrationISOWeek} onChange={handleChange} />

                <DateField label="Last Lorry Inspection" name="lastLorryInspection" value={vehicle.lastLorryInspection} onChange={handleChange} />
                <Field label="Lorry Insp. Freq (weeks)" name="lorryInspectionFreq" value={vehicle.lorryInspectionFreq} onChange={handleChange} />
                <DateField label="Next Lorry Inspection" name="nextLorryInspection" value={vehicle.nextLorryInspection} onChange={handleChange} />
                <Field label="Lorry ISO Week" name="lorryInspectionISOWeek" value={vehicle.lorryInspectionISOWeek} onChange={handleChange} />
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <FileUploadField
                  label="Tacho Calibration Files"
                  field="tachoCalibrationFiles"
                  files={vehicle.tachoCalibrationFiles}
                  onUpload={handleFileUpload}
                  uploadingField={uploadingField}
                />
                <FileUploadField
                  label="Lorry Inspection Files"
                  field="lorryInspectionFiles"
                  files={vehicle.lorryInspectionFiles}
                  onUpload={handleFileUpload}
                  uploadingField={uploadingField}
                />
              </div>
            </div>

            {/* Paperwork + history */}
            <div style={panel}>
              <h2 style={sectionTitle}>Paperwork & History</h2>
              <div style={grid(2)}>
                <TextAreaField
                  label="Service History"
                  name="serviceHistory"
                  value={vehicle.serviceHistory}
                  onChange={handleChange}
                  placeholder="Major services, repairs, notes…"
                />
                <TextAreaField
                  label="Pre-checks / Walkaround Notes"
                  name="preChecks"
                  value={vehicle.preChecks}
                  onChange={handleChange}
                  placeholder="Defects found, actions taken…"
                />
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <FileUploadField
                  label="Service History Files"
                  field="serviceHistoryFiles"
                  files={vehicle.serviceHistoryFiles}
                  onUpload={handleFileUpload}
                  uploadingField={uploadingField}
                />
                <FileUploadField
                  label="Pre-checks Attachments"
                  field="preChecksFiles"
                  files={vehicle.preChecksFiles}
                  onUpload={handleFileUpload}
                  uploadingField={uploadingField}
                />
              </div>
            </div>

            {/* DVLA / V5 */}
            <div style={panel}>
              <h2 style={sectionTitle}>V5, Certificates & DVLA</h2>
              <div style={grid(4)}>
                <SelectField label="V5 Present" name="v5Present" value={vehicle.v5Present} onChange={handleChange} options={["Yes", "No", "Pending"]} />
                <Field label="V5 Reference" name="v5Reference" value={vehicle.v5Reference} onChange={handleChange} />
                <Field label="Certificate Type" name="certificateType" value={vehicle.certificateType} onChange={handleChange} />
                <Field label="Certificate Ref" name="certificateRef" value={vehicle.certificateRef} onChange={handleChange} />

                <DateField label="DVLA Date" name="dvlaDate" value={vehicle.dvlaDate} onChange={handleChange} />
                <Field label="DVLA Ref" name="dvlaRef" value={vehicle.dvlaRef} onChange={handleChange} />
                <SelectField label="DVLA Status" name="dvlaStatus" value={vehicle.dvlaStatus} onChange={handleChange} options={["Not Started", "In Progress", "Completed"]} />
                <Field label="DVLA Contact" name="dvlaContact" value={vehicle.dvlaContact} onChange={handleChange} />
              </div>

              <div style={{ marginTop: 12 }}>
                <TextAreaField
                  label="DVLA Notes"
                  name="dvlaNotes"
                  value={vehicle.dvlaNotes}
                  onChange={handleChange}
                  placeholder="Correspondence, forms sent, etc."
                />
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <FileUploadField label="V5 & Certificate Files" field="v5Files" files={vehicle.v5Files} onUpload={handleFileUpload} uploadingField={uploadingField} />
                <FileUploadField label="DVLA Paperwork Files" field="dvlaFiles" files={vehicle.dvlaFiles} onUpload={handleFileUpload} uploadingField={uploadingField} />
              </div>
            </div>
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
                <button style={btn("ghost")} onClick={() => router.push("/vehicles")}>Vehicles List</button>
                <button style={btn("ghost")} onClick={() => router.push("/vehicle-checks")}>Vehicle Checks</button>
                <button style={btn("ghost")} onClick={goToBookWorkPage}>Book Work</button>
              </div>
            </div>

            <div style={panel}>
              <h2 style={sectionTitle}>Next Dates</h2>
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                <MiniLine label="Next MOT" value={vehicle.nextMOT} />
                <MiniLine label="Next Service" value={vehicle.nextService} />
                <MiniLine label="Next RFL" value={vehicle.nextRFL} />
                <MiniLine label="Next Tacho" value={vehicle.nextTacho} />
                <MiniLine label="Next Brake Test" value={vehicle.nextBrakeTest} />
                <MiniLine label="Next PMI" value={vehicle.nextPMI} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom actions (nice when you scroll) */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
     
          <button onClick={goToBookWorkPage} style={btn("success")}>Book Work</button>
          <button onClick={handleSave} style={btn()} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </HeaderSidebarLayout>
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
          <option key={opt} value={opt}>{opt}</option>
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
