"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function EditVehiclePage() {
  const router = useRouter();
  const { id } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const fetchCategories = async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      const allCats = snapshot.docs.map((d) => d.data().category).filter((c) => c);
      setCategories(Array.from(new Set(allCats)));
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchVehicle = async () => {
      const ref = doc(db, "vehicles", id);
      const snap = await getDoc(ref);
      if (snap.exists()) setVehicle(snap.data());
    };
    if (id) fetchVehicle();
  }, [id]);

  useEffect(() => {
    if (vehicle?.lastMOT && vehicle?.motFreq) {
      const d = new Date(vehicle.lastMOT);
      d.setDate(d.getDate() + parseInt(vehicle.motFreq, 10) * 7);
      const iso = d.toISOString().split("T")[0];
      if (vehicle.nextMOT !== iso) setVehicle((p) => ({ ...p, nextMOT: iso }));
    }
  }, [vehicle?.lastMOT, vehicle?.motFreq, vehicle?.nextMOT]);

  useEffect(() => {
    if (vehicle?.lastService && vehicle?.serviceFreq) {
      const d = new Date(vehicle.lastService);
      d.setDate(d.getDate() + parseInt(vehicle.serviceFreq, 10) * 7);
      const iso = d.toISOString().split("T")[0];
      if (vehicle.nextService !== iso) setVehicle((p) => ({ ...p, nextService: iso }));
    }
  }, [vehicle?.lastService, vehicle?.serviceFreq, vehicle?.nextService]);

  // Auto-calc next Tacho
useEffect(() => {
  if (vehicle?.lastTacho && vehicle?.tachoFreq) {
    const d = new Date(vehicle.lastTacho);
    d.setDate(d.getDate() + parseInt(vehicle.tachoFreq, 10) * 7);
    const iso = d.toISOString().split("T")[0];
    if (vehicle.nextTacho !== iso) setVehicle((p) => ({ ...p, nextTacho: iso }));
  }
}, [vehicle?.lastTacho, vehicle?.tachoFreq, vehicle?.nextTacho]);

// Auto-calc next Brake Test
useEffect(() => {
  if (vehicle?.lastBrakeTest && vehicle?.brakeTestFreq) {
    const d = new Date(vehicle.lastBrakeTest);
    d.setDate(d.getDate() + parseInt(vehicle.brakeTestFreq, 10) * 7);
    const iso = d.toISOString().split("T")[0];
    if (vehicle.nextBrakeTest !== iso) setVehicle((p) => ({ ...p, nextBrakeTest: iso }));
  }
}, [vehicle?.lastBrakeTest, vehicle?.brakeTestFreq, vehicle?.nextBrakeTest]);

// Auto-calc next PMI
useEffect(() => {
  if (vehicle?.lastPMI && vehicle?.pmiFreq) {
    const d = new Date(vehicle.lastPMI);
    d.setDate(d.getDate() + parseInt(vehicle.pmiFreq, 10) * 7);
    const iso = d.toISOString().split("T")[0];
    if (vehicle.nextPMI !== iso) setVehicle((p) => ({ ...p, nextPMI: iso }));
  }
}, [vehicle?.lastPMI, vehicle?.pmiFreq, vehicle?.nextPMI]);

// Auto-calc next RFL
useEffect(() => {
  if (vehicle?.lastRFL && vehicle?.rflFreq) {
    const d = new Date(vehicle.lastRFL);
    d.setDate(d.getDate() + parseInt(vehicle.rflFreq, 10) * 7);
    const iso = d.toISOString().split("T")[0];
    if (vehicle.nextRFL !== iso) setVehicle((p) => ({ ...p, nextRFL: iso }));
  }
}, [vehicle?.lastRFL, vehicle?.rflFreq, vehicle?.nextRFL]);

// Auto-calc next Tacho Download
useEffect(() => {
  if (vehicle?.lastTachoDownload && vehicle?.tachoDownloadFreq) {
    const d = new Date(vehicle.lastTachoDownload);
    d.setDate(d.getDate() + parseInt(vehicle.tachoDownloadFreq, 10) * 7);
    const iso = d.toISOString().split("T")[0];
    if (vehicle.nextTachoDownload !== iso) setVehicle((p) => ({ ...p, nextTachoDownload: iso }));
  }
}, [vehicle?.lastTachoDownload, vehicle?.tachoDownloadFreq, vehicle?.nextTachoDownload]);

// Auto-calc next Tail-lift
useEffect(() => {
  if (vehicle?.lastTailLift && vehicle?.tailLiftFreq) {
    const d = new Date(vehicle.lastTailLift);
    d.setDate(d.getDate() + parseInt(vehicle.tailLiftFreq, 10) * 7);
    const iso = d.toISOString().split("T")[0];
    if (vehicle.nextTailLift !== iso) setVehicle((p) => ({ ...p, nextTailLift: iso }));
  }
}, [vehicle?.lastTailLift, vehicle?.tailLiftFreq, vehicle?.nextTailLift]);

// Auto-calc next LOLER
useEffect(() => {
  if (vehicle?.lastLoler && vehicle?.lolerFreq) {
    const d = new Date(vehicle.lastLoler);
    d.setDate(d.getDate() + parseInt(vehicle.lolerFreq, 10) * 7);
    const iso = d.toISOString().split("T")[0];
    if (vehicle.nextLoler !== iso) setVehicle((p) => ({ ...p, nextLoler: iso }));
  }
}, [vehicle?.lastLoler, vehicle?.lolerFreq, vehicle?.nextLoler]);


  const handleChange = (e) => {
    const { name, value } = e.target;
    setVehicle((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    const ref = doc(db, "vehicles", id);
    await updateDoc(ref, vehicle);
    alert("Vehicle updated.");
    router.push("/vehicles");
  };

  const goToBookWorkPage = () => {
    router.push(`/book-work/${id}`);
  };
  
  const handleDelete = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete this vehicle?");
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, "vehicles", id));
      alert("Vehicle deleted.");
      router.push("/vehicles");
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      alert("Failed to delete vehicle.");
    }
  };

  if (!vehicle) return <div>Loading...</div>;

  return (
    <HeaderSidebarLayout>
      <div style={pageStyle}>
        <h1 style={title}>Edit Vehicle – {vehicle.name || vehicle.registration}</h1>
        <div style={layoutWrapper}>
          <div style={leftColumn}>
            <Section title="Main Information">
              <Grid columns={2}>
                <Field label="Name" name="name" value={vehicle.name} onChange={handleChange} />
                <Field label="Registration" name="registration" value={vehicle.registration} onChange={handleChange} />
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
                <Field label="Odometer" name="odometer" value={vehicle.odometer} onChange={handleChange} />
                <Field label="MOT Certificate" name="motCertificate" value={vehicle.motCertificate} onChange={handleChange} />
                

                <Field label="Chassis No." name="Chassis No." value={vehicle.chassis} onChange={handleChange} />
                <div>
  <label style={labelStyle}>Tax Status</label>
  <div style={{ padding: "8px 12px", background: "#f0f0f0", borderRadius: 4 }}>
    {vehicle.taxStatus || "N/A"}
  </div>
</div>

<div>
  <label style={labelStyle}>Insurance Status</label>
  <div style={{ padding: "8px 12px", background: "#f0f0f0", borderRadius: 4 }}>
    {vehicle.insuranceStatus || "N/A"}
  </div>
</div>

               
                <SelectField label="Warrenty" name="Warrenty" value={vehicle.chassis} onChange={handleChange} options={["Yes", "No"]} />

              </Grid>
            </Section>

            <Section title="Due Dates & Intervals">
  <Grid columns={4}>
    {/* MOT */}
    <DateField label="Last MOT" name="lastMOT" value={vehicle.lastMOT} onChange={handleChange} />
    <Field label="MOT Freq (weeks)" name="motFreq" value={vehicle.motFreq} onChange={handleChange} />
    <DateField label="Next MOT" name="nextMOT" value={vehicle.nextMOT} onChange={handleChange} />
    <Field label="MOT ISO Week" name="motISOWeek" value={vehicle.motISOWeek} onChange={handleChange} />

    {/* Service */}
    <DateField label="Last Service" name="lastService" value={vehicle.lastService} onChange={handleChange} />
    <Field label="Service Freq (weeks)" name="serviceFreq" value={vehicle.serviceFreq} onChange={handleChange} />
    <DateField label="Next Service" name="nextService" value={vehicle.nextService} onChange={handleChange} />
    <Field label="Service ISO Week" name="serviceISOWeek" value={vehicle.serviceISOWeek} onChange={handleChange} />


  </Grid>
</Section>


            <Section title="Additional Details">
              <Grid columns={4}>

                    {/* Tacho Inspection */}
              <DateField label="Last Tacho Inspection" name="lastTacho" value={vehicle.lastTacho} onChange={handleChange} />
              <Field label="Tacho Freq (weeks)" name="tachoFreq" value={vehicle.tachoFreq} onChange={handleChange} />
              <DateField label="Next Tacho Inspection" name="nextTacho" value={vehicle.nextTacho} onChange={handleChange} />
              <Field label="Tacho ISO Week" name="tachoISOWeek" value={vehicle.tachoISOWeek} onChange={handleChange} />

              {/* Brake Test */}
              <DateField label="Last Brake Test" name="lastBrakeTest" value={vehicle.lastBrakeTest} onChange={handleChange} />
              <Field label="Brake Test Freq (weeks)" name="brakeTestFreq" value={vehicle.brakeTestFreq} onChange={handleChange} />
              <DateField label="Next Brake Test" name="nextBrakeTest" value={vehicle.nextBrakeTest} onChange={handleChange} />
              <Field label="Brake Test ISO Week" name="brakeISOWeek" value={vehicle.brakeISOWeek} onChange={handleChange} />

              {/* PMI Inspection */}
              <DateField label="Last PMI Inspection" name="lastPMI" value={vehicle.lastPMI} onChange={handleChange} />
              <Field label="PMI Freq (weeks)" name="pmiFreq" value={vehicle.pmiFreq} onChange={handleChange} />
              <DateField label="Next PMI Inspection" name="nextPMI" value={vehicle.nextPMI} onChange={handleChange} />
              <Field label="PMI ISO Week" name="pmiISOWeek" value={vehicle.pmiISOWeek} onChange={handleChange} />

              {/* RFL (Road Tax) */}
              <DateField label="Last RFL" name="lastRFL" value={vehicle.lastRFL} onChange={handleChange} />
              <Field label="RFL Freq (weeks)" name="rflFreq" value={vehicle.rflFreq} onChange={handleChange} />
              <DateField label="Next RFL" name="nextRFL" value={vehicle.nextRFL} onChange={handleChange} />
              <Field label="RFL ISO Week" name="rflISOWeek" value={vehicle.rflISOWeek} onChange={handleChange} />

          {/* Tacho Download */}
          <DateField label="Last Tacho Download" name="lastTachoDownload" value={vehicle.lastTachoDownload} onChange={handleChange} />
          <Field label="Tacho Download Freq (weeks)" name="tachoDownloadFreq" value={vehicle.tachoDownloadFreq} onChange={handleChange} />
          <DateField label="Next Tacho Download" name="nextTachoDownload" value={vehicle.nextTachoDownload} onChange={handleChange} />
          <Field label="Tacho Download ISO Week" name="tachoDownloadISOWeek" value={vehicle.tachoDownloadISOWeek} onChange={handleChange} />

            {/* Tail-lift */}
            <DateField label="Last Tail-lift Inspection" name="lastTailLift" value={vehicle.lastTailLift} onChange={handleChange} />
            <Field label="Tail-lift Freq (weeks)" name="tailLiftFreq" value={vehicle.tailLiftFreq} onChange={handleChange} />
            <DateField label="Next Tail-lift Inspection" name="nextTailLift" value={vehicle.nextTailLift} onChange={handleChange} />
            <Field label="Tail-lift ISO Week" name="tailLiftISOWeek" value={vehicle.tailLiftISOWeek} onChange={handleChange} />

            {/* LOLER */}
            <DateField label="Last LOLER Inspection" name="lastLoler" value={vehicle.lastLoler} onChange={handleChange} />
            <Field label="LOLER Freq (weeks)" name="lolerFreq" value={vehicle.lolerFreq} onChange={handleChange} />
            <DateField label="Next LOLER Inspection" name="nextLoler" value={vehicle.nextLoler} onChange={handleChange} />
            <Field label="LOLER ISO Week" name="lolerISOWeek" value={vehicle.lolerISOWeek} onChange={handleChange} />

              </Grid>
            </Section>
          </div>

          <div style={rightColumn}>
            <h3 style={sectionTitle}>Notes</h3>
            <textarea name="notes" value={vehicle.notes || ""} onChange={handleChange} rows={20} style={noteStyle} />
          </div>
        </div>

        <div style={buttonRow}>
        <button onClick={goToBookWorkPage} style={bookWorkBtn}>🚗 Book Work</button>
          <button onClick={handleSave} style={saveBtn}>💾 Save</button>
          <button onClick={() => router.back()} style={cancelBtn}>← Cancel</button>
          <button onClick={handleDelete} style={deleteBtn}>🗑️ Delete</button>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

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

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <h2 style={sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function Grid({ columns = 2, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16 }}>{children}</div>;
}

const pageStyle = { padding: 40, backgroundColor: "#f9fafb", fontFamily: "Arial, sans-serif", color: "#333333" };
const title = { fontSize: 24, fontWeight: "bold", marginBottom: 20, color: "#111111" };
const layoutWrapper = { display: "flex", gap: 30, marginBottom: 30 };
const leftColumn = { flex: 3 };
const rightColumn = { flex: 2 };
const sectionTitle = { fontSize: 16, fontWeight: "bold", marginBottom: 10, color: "#111111" };
const labelStyle = { display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "#111111" };
const inputField = { width: "100%", padding: 8, fontSize: 13, border: "1px solid #ccc", borderRadius: 4, backgroundColor: "#ffffff", color: "#333333" };
const noteStyle = { width: "100%", padding: 10, fontSize: 14, border: "1px solid #ccc", borderRadius: 4, backgroundColor: "#ffffff", color: "#333333" };
const buttonRow = { marginTop: 30, display: "flex", gap: 10 };
const saveBtn = { padding: "10px 20px", backgroundColor: "#1976d2", color: "#ffffff", border: "none", borderRadius: 6, fontSize: 16, cursor: "pointer" };
const cancelBtn = { padding: "10px 20px", backgroundColor: "#6b7280", color: "#ffffff", border: "none", borderRadius: 6, fontSize: 16, cursor: "pointer" };
const deleteBtn = { padding: "10px 20px", backgroundColor: "#dc2626", color: "#ffffff", border: "none", borderRadius: 6, fontSize: 16, cursor: "pointer" };
const bookWorkBtn = {
  padding: "10px 20px",
  backgroundColor: "#10b981", // green
  color: "#ffffff",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  cursor: "pointer"
};
