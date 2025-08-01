"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function EditEquipmentPage() {
  const router = useRouter();
  const { id } = useParams();
  const [equipment, setEquipment] = useState(null);

  useEffect(() => {
    const fetchEquipment = async () => {
      const ref = doc(db, "equipment", id);
      const snap = await getDoc(ref);
      if (snap.exists()) setEquipment(snap.data());
    };
    if (id) fetchEquipment();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updatedEquipment = { ...equipment, [name]: value };

    // Auto-calculate nextInspection
    if (
      (name === "lastInspection" || name === "inspectionFrequency") &&
      updatedEquipment.lastInspection &&
      updatedEquipment.inspectionFrequency
    ) {
      const lastDate = new Date(updatedEquipment.lastInspection);
      const frequencyWeeks = parseInt(updatedEquipment.inspectionFrequency, 10);

      if (!isNaN(lastDate) && !isNaN(frequencyWeeks)) {
        const nextDate = new Date(lastDate);
        nextDate.setDate(lastDate.getDate() + frequencyWeeks * 7);
        updatedEquipment.nextInspection = nextDate.toISOString().split("T")[0];
      }
    }

    setEquipment(updatedEquipment);
  };

  const handleSave = async () => {
    const ref = doc(db, "equipment", id);
    await updateDoc(ref, equipment);
    alert("Equipment updated.");
    router.push("/equipment");
  };

  const handleDelete = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete this equipment?");
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, "equipment", id));
      alert("Equipment deleted.");
      router.push("/equipment");
    } catch (err) {
      console.error("Error deleting equipment:", err);
      alert("Failed to delete equipment.");
    }
  };

  if (!equipment) return <div>Loading...</div>;

  return (
    <HeaderSidebarLayout>
      <div style={pageStyle}>
        <h1 style={title}>Edit Equipment – {equipment.name}</h1>
        <div style={layoutWrapper}>
          <div style={leftColumn}>
            <Section title="Equipment Information">
              <Grid columns={2}>
                <Field label="Name" name="name" value={equipment.name} onChange={handleChange} />
                <Field label="Serial Number" name="serialNumber" value={equipment.serialNumber} onChange={handleChange} />
                <Field label="Category" name="category" value={equipment.category} onChange={handleChange} />
                <div>
                  <label style={labelStyle}>Status</label>
                  <select name="status" value={equipment.status || ""} onChange={handleChange} style={inputField}>
                    <option value="">Select status…</option>
                    <option value="Available">Available</option>
                    <option value="Not Available">Not Available</option>
                  </select>
                </div>
                <Field label="Asset No." name="asset" value={equipment.asset} onChange={handleChange} />
              </Grid>
            </Section>

            <Section title="Inspection">
              <Grid columns={3}>
                <Field
                  label="Last Inspection"
                  name="lastInspection"
                  value={equipment.lastInspection || ""}
                  onChange={handleChange}
                  type="date"
                />
                <Field
                  label="Frequency (weeks)"
                  name="inspectionFrequency"
                  value={equipment.inspectionFrequency || ""}
                  onChange={handleChange}
                  type="number"
                />
                <Field
                  label="Next Inspection Due"
                  name="nextInspection"
                  value={equipment.nextInspection || ""}
                  onChange={handleChange}
                  type="date"
                />
              </Grid>
            </Section>
          </div>

          <div style={rightColumn}>
            <h3 style={sectionTitle}>Notes</h3>
            <textarea
              name="notes"
              value={equipment.notes || ""}
              onChange={handleChange}
              rows={20}
              style={noteStyle}
            />
          </div>
        </div>

        <div style={buttonRow}>
          <button onClick={handleSave} style={saveBtn}>💾 Save</button>
          <button onClick={() => router.back()} style={cancelBtn}>← Cancel</button>
          <button onClick={handleDelete} style={deleteBtn}>🗑️ Delete</button>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

// Components
function Field({ label, name, value, onChange, type = "text" }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} name={name} value={value || ""} onChange={onChange} style={inputField} />
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
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16 }}>
      {children}
    </div>
  );
}

// Styles
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
