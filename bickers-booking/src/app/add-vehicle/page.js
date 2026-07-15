"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, addDoc } from "firebase/firestore";

export default function AddVehiclePage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    registrationNumber: "",
    category: "",
    lastService: "",
    nextService: "",
    lastMOT: "",
    nextMOT: "",
    mileage: "",
    notes: ""
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "mileage" ? parseInt(value || "0") : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "vehicles"), formData);
      alert("✅ Vehicle added");
      router.push("/vehicles");
    } catch (err) {
      console.error("Error adding vehicle:", err);
      alert("❌ Failed to add vehicle");
    }
  };

  const handleCancel = () => {
    router.push("/vehicles");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#111", fontFamily: "Arial, sans-serif" }}>
      {/* Sidebar */}


      {/* Main Content */}
      <main style={{ flex: 1, padding: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 24 }}>Add Vehicle</h1>

        <form onSubmit={handleSubmit}>
          {/* Grid Input Fields */}
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
             {[
              { label: "Name", name: "name", type: "text", required: true },
              { label: "Registration Number", name: "registrationNumber", type: "text", required: true },
              { label: "Last Service", name: "lastService", type: "date", required: false },
              { label: "Next Service", name: "nextService", type: "date", required: false },
              { label: "Last MOT", name: "lastMOT", type: "date", required: false },
              { label: "Next MOT", name: "nextMOT", type: "date", required: false },
              { label: "Mileage", name: "mileage", type: "number", required: true }
            ].map(({ label, name, type, required }) => (
              <div key={name}>
                <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>{label}</label>
                <input
                  type={type}
                  name={name}
                  value={formData[name]}
                  onChange={handleChange}
                  required={required}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #ccc",
                    borderRadius: 6
                  }}
                />
              </div>
            ))}
            

            {/* Category Dropdown */}
            <div>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Category</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 6
                }}
              >
                <option value="">Select Category</option>
                <option value="Fleet Vehicle">Fleet</option>
                <option value="Lifting Vans">Lifting Van</option>
                <option value="Bike">Bike</option>
                <option value="Lorry">Lorry</option>
                <option value="Taurus">Taurus</option>
                <option value="Electric Tracking Vehicles">Electric</option>
                <option value="Pod Cars">Pod Cars</option>
                <option value="HGV Trailers">HGV Trailers</option>


                

              </select>
            </div>
          </div>

          {/* Notes Field */}
          <div style={{ marginTop: 40 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 6 }}>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              style={{
                width: "100%",
                height: 120,
                padding: 12,
                border: "1px solid #ccc",
                borderRadius: 6
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: 30, display: "flex", gap: 12 }}>
            <button
              type="submit"
              style={{
                backgroundColor: "#1976d2",
                color: "#fff",
                padding: "10px 20px",
                border: "none",
                borderRadius: 4,
                cursor: "pointer"
              }}
            >
              Save Vehicle
            </button>

            <button
              type="button"
              onClick={handleCancel}
              style={{
                backgroundColor: "#999",
                color: "#fff",
                padding: "10px 20px",
                border: "none",
                borderRadius: 4,
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
