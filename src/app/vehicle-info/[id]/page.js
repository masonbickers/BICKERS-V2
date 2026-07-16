"use client";

import layoutStyles from "./page.styles.module.css";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { db } from "../../../../firebaseConfig";

import Papa from "papaparse";
import { addDoc, collection, doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";

const getVehicleOdometerValue = (vehicle) => {
  const candidates = [vehicle?.odometer, vehicle?.serviceOdometer, vehicle?.mileage];
  for (const candidate of candidates) {
    const numeric = Number(String(candidate ?? "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
};


export default function VehicleInfoPage() {
  const router = useRouter();
  const pathname = usePathname();
  const id = pathname.split("/").pop();
  const [editableVehicle, setEditableVehicle] = useState(null);
  const handleSave = async () => {
    try {
      const docRef = doc(db, "vehicles", id);
      const odometer = getVehicleOdometerValue(editableVehicle);
      const registration = String(
        editableVehicle?.registration || editableVehicle?.reg || editableVehicle?.registrationNumber || ""
      ).trim();
      const manufacturer = String(editableVehicle?.manufacturer || editableVehicle?.make || "").trim();
      const nextMot = String(editableVehicle?.nextMOT || editableVehicle?.nextMot || editableVehicle?.nextMotDate || "").trim();
      const lastMot = String(editableVehicle?.lastMOT || editableVehicle?.lastMot || "").trim();
      const nextService = String(editableVehicle?.nextService || editableVehicle?.nextServiceDate || "").trim();
      await updateDoc(docRef, {
        ...editableVehicle,
        registration,
        reg: registration,
        registrationNumber: registration,
        manufacturer,
        make: manufacturer,
        lastMOT: lastMot,
        lastMot,
        nextMOT: nextMot,
        nextMot,
        nextMotDate: nextMot,
        motDueDate: nextMot,
        nextService,
        nextServiceDate: nextService,
        serviceDueDate: nextService,
        odometer,
        mileage: odometer,
        serviceOdometer: odometer,
      });
      alert(" Vehicle updated");
      router.push("/vehicles");  // or reload if needed
    } catch (err) {
      console.error("Error updating vehicle:", err);
      alert(" Failed to update vehicle");
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
      alert(" Vehicle deleted");
      router.push("/vehicles");
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      alert(" Failed to delete vehicle");
    }
  };

  if (!vehicle) return <div className={layoutStyles.extracted1}>Loading vehicle data...</div>;

  return (
    <div className={layoutStyles.extracted2}>
      {/* Sidebar */}


      {/* Main Content */}
      <main className={layoutStyles.extracted3}>
        <button
          onClick={() => router.push("/vehicles")}
          className={layoutStyles.extracted4}
        >
          ← Back to Vehicles
        </button>

        <VehicleCSVImport />

        <h1 className={layoutStyles.extracted5}>Vehicle Details: {vehicle.name} ({vehicle.category})</h1>

        <div className={layoutStyles.extracted6}>
          <Field label="Name" value={vehicle.name} />
          <div>
            <label className={layoutStyles.extracted7}>Category</label>
            <select
              value={editableVehicle?.category || ""}
              onChange={(e) => setEditableVehicle({ ...editableVehicle, category: e.target.value })}
              className={layoutStyles.extracted8}
            >
              <option value="Bike">Bike</option>
              <option value="Small">Small</option>
              <option value="Large">Large</option>
              <option value="Lorry">Lorry</option>
            </select>
          </div>

          <Field label="Registration Number" value={vehicle.registration} />
          <Field label="Odometer" value={getVehicleOdometerValue(vehicle).toLocaleString()} suffix="mi" />
          <div>
  <label className={layoutStyles.extracted9}>Last Service</label>
  <input
    type="date"
    value={editableVehicle?.lastService || ""}
    onChange={(e) => setEditableVehicle({ ...editableVehicle, lastService: e.target.value })}
    className={layoutStyles.extracted10}
  />
</div>

<div>
  <label className={layoutStyles.extracted11}>Next Service</label>
  <input
    type="date"
    value={editableVehicle?.nextService || ""}
    onChange={(e) => setEditableVehicle({ ...editableVehicle, nextService: e.target.value })}
    className={layoutStyles.extracted12}
  />
</div>

<div>
  <label className={layoutStyles.extracted13}>Last MOT</label>
  <input
    type="date"
    value={editableVehicle?.lastMOT || ""}
    onChange={(e) => setEditableVehicle({ ...editableVehicle, lastMOT: e.target.value })}
    className={layoutStyles.extracted14}
  />
</div>

<div>
  <label className={layoutStyles.extracted15}>Next MOT</label>
  <input
    type="date"
    value={editableVehicle?.nextMOT || ""}
    onChange={(e) => setEditableVehicle({ ...editableVehicle, nextMOT: e.target.value })}
    className={layoutStyles.extracted16}
  />
</div>

        </div>

        

        <div className={layoutStyles.extracted17}>
          <h2 className={layoutStyles.extracted18}>Notes</h2>
          <textarea
            value={editableVehicle?.notes || ""}
            onChange={(e) => setEditableVehicle({ ...editableVehicle, notes: e.target.value })}
            className={layoutStyles.extracted19}
          />
        </div>

        <div className={layoutStyles.extracted20}>
        <button
          onClick={handleSave}
          className={layoutStyles.extracted21}
        >
          Save Changes
        </button>


          <button
            onClick={handleDelete}
            className={layoutStyles.extracted22}
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
      <label className={layoutStyles.extracted23}>{label}</label>
      <input
        defaultValue={value}
        className={layoutStyles.extracted24}
        onChange={(e) => onChange(e.target.value)} />
      
      {suffix && <span className={layoutStyles.extracted25}>{suffix}</span>}
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
            const odometer = Number(vehicle.odometer || vehicle.serviceOdometer || vehicle.mileage || 0);
            const registration = vehicle.registration || vehicle.reg || vehicle.registrationNumber || "";
            const manufacturer = vehicle.manufacturer || vehicle.make || "";
            const nextMot = vehicle.nextMOT || vehicle.nextMot || vehicle.nextMotDate || vehicle.motDueDate || "";
            const nextService = vehicle.nextService || vehicle.nextServiceDate || vehicle.serviceDueDate || "";
            await addDoc(collection(db, "vehicles"), {
              name: vehicle.name || vehicle.make || "",
              category: vehicle.category || vehicle.model || "",
              registration,
              reg: registration,
              registrationNumber: registration,
              manufacturer,
              make: manufacturer,
              odometer,
              mileage: odometer,
              serviceOdometer: odometer,
              lastService: vehicle.lastService,
              nextService,
              nextServiceDate: nextService,
              serviceDueDate: nextService,
              lastMOT: vehicle.lastMOT || vehicle.lastMot || "",
              lastMot: vehicle.lastMOT || vehicle.lastMot || "",
              nextMOT: nextMot,
              nextMot,
              nextMotDate: nextMot,
              motDueDate: nextMot,
              notes: vehicle.notes || ""
            });
          } catch (err) {
            console.error(" Error importing vehicle:", err);
          }
        }

        alert(" Vehicle data imported successfully!");
      },
    });
  };

  return (
    <div className={layoutStyles.extracted26}>
      <label className={layoutStyles.extracted27}>Import Vehicle CSV:</label>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
    </div>
  );
}

const navButton = {
  background: "transparent",
  color: "var(--color-white)",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid var(--color-text)"
};
