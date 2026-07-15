"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { db } from "../../../../firebaseConfig";

import Papa from "papaparse";
import { doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";


export default function VehicleInfoPage() {
  const router = useRouter();
  const pathname = usePathname();
  const id = pathname.split("/").pop();
  const [editableVehicle, setEditableVehicle] = useState(null);
  const handleSave = async () => {
    try {
      const docRef = doc(db, "vehicles", id);
      await updateDoc(docRef, editableVehicle);
      alert("✅ Vehicle updated");
      router.push("/vehicles");  // or reload if needed
    } catch (err) {
      console.error("Error updating vehicle:", err);
      alert("❌ Failed to update vehicle");
    }
  };
  
  

  const [vehicle, setVehicle] = useState(null);

  useEffect(() => {
    const fetchVehicle = async () => {
      try {
        const docRef = doc(db, "vehicles", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setVehicle(data);
          setEditableVehicle(data); 
        } else {
          alert("Vehicle not found");
          router.push("/vehicles");
        }
      } catch (err) {
        console.error("Error fetching vehicle:", err);
        alert("Failed to load vehicle");
      }
    };

    if (id) fetchVehicle();
  }, [id, router]);
  
 
  
  const handleDelete = async () => {
    const confirmed = window.confirm("Are you sure you want to delete this vehicle?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "vehicles", id));
      alert("✅ Vehicle deleted");
      router.push("/vehicles");
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      alert("❌ Failed to delete vehicle");
    }
  };

  if (!vehicle) return <div style={{ padding: 40, color: '#000' }}>Loading vehicle data...</div>;

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", fontFamily: "Arial, sans-serif", color: "#111" }}>
      {/* Sidebar */}


      {/* Main Content */}
      <main style={{ flex: 1, padding: 40 }}>
        <button
          onClick={() => router.push("/vehicles")}
          style={{ marginBottom: 16, padding: "8px 16px", border: "none", borderRadius: 4, backgroundColor: "#555", color: "#fff", cursor: "pointer", width: "fit-content" }}
        >
          ← Back to Vehicles
        </button>

        <VehicleCSVImport />

        <h1 style={{ fontSize: 28, marginBottom: 24 }}>Vehicle Details: {vehicle.name} ({vehicle.category})</h1>

        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          <Field label="Name" value={vehicle.name} />
          <div>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Category</label>
            <select
              value={editableVehicle?.category || ""}
              onChange={(e) => setEditableVehicle({ ...editableVehicle, category: e.target.value })}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
            >
              <option value="Bike">Bike</option>
              <option value="Small">Small</option>
              <option value="Large">Large</option>
              <option value="Lorry">Lorry</option>
            </select>
          </div>

          <Field label="Registration Number" value={vehicle.registration} />
          <Field label="Mileage" value={(vehicle.mileage || 0).toLocaleString()} suffix="mi" />
          <div>
  <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Last Service</label>
  <input
    type="date"
    value={editableVehicle?.lastService || ""}
    onChange={(e) => setEditableVehicle({ ...editableVehicle, lastService: e.target.value })}
    style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
  />
</div>

<div>
  <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Next Service</label>
  <input
    type="date"
    value={editableVehicle?.nextService || ""}
    onChange={(e) => setEditableVehicle({ ...editableVehicle, nextService: e.target.value })}
    style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
  />
</div>

<div>
  <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Last MOT</label>
  <input
    type="date"
    value={editableVehicle?.lastMOT || ""}
    onChange={(e) => setEditableVehicle({ ...editableVehicle, lastMOT: e.target.value })}
    style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
  />
</div>

<div>
  <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>Next MOT</label>
  <input
    type="date"
    value={editableVehicle?.nextMOT || ""}
    onChange={(e) => setEditableVehicle({ ...editableVehicle, nextMOT: e.target.value })}
    style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
  />
</div>

        </div>

        

        <div style={{ marginTop: 40 }}>
          <h2 style={{ marginBottom: 12 }}>Notes</h2>
          <textarea
            value={editableVehicle?.notes || ""}
            onChange={(e) => setEditableVehicle({ ...editableVehicle, notes: e.target.value })}
            style={{ width: "100%", height: 120, padding: 12, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
        <button
          onClick={handleSave}
          style={{
            padding: "10px 20px",
            backgroundColor: "#1976d2",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          Save Changes
        </button>


          <button
            onClick={handleDelete}
            style={{
              padding: "10px 20px",
              backgroundColor: "#d32f2f",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer"
            }}
          >
            Delete Vehicle
          </button>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, suffix }) {
  return (
    <div>
      <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>{label}</label>
      <input
        defaultValue={value}
        style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        onChange={(e) => onChange(e.target.value)} />
      
      {suffix && <span style={{ marginLeft: 8 }}>{suffix}</span>}
    </div>
  );
}

function VehicleCSVImport() {
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function (results) {
        const vehicles = results.data;

        for (const vehicle of vehicles) {
          try {
            await addDoc(collection(db, "vehicles"), {
              make: vehicle.name,
              model: vehicle.category,
              registrationNumber: vehicle.registrationNumber,
              mileage: Number(vehicle.mileage),
              lastService: vehicle.lastService,
              nextService: vehicle.nextService,
              lastMOT: vehicle.lastMOT,
              nextMOT: vehicle.nextMOT,
              notes: vehicle.notes || ""
            });
          } catch (err) {
            console.error("❌ Error importing vehicle:", err);
          }
        }

        alert("✅ Vehicle data imported successfully!");
      },
    });
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontWeight: "bold", marginRight: 12 }}>Import Vehicle CSV:</label>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
    </div>
  );
}

const navButton = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid #333"
};
