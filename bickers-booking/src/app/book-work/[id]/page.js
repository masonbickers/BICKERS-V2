"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "../../../../firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
} from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

export default function BookWorkPage() {
  const { id } = useParams();
  const router = useRouter();

  const [vehicle, setVehicle] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [mode, setMode] = useState("single");
  const [maintenanceType, setMaintenanceType] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [existingBookings, setExistingBookings] = useState([]);

  useEffect(() => {
    const fetchVehicle = async () => {
      const ref = doc(db, "vehicles", id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setVehicle({ id, ...snap.data() });
      }
    };
    if (id) fetchVehicle();
  }, [id]);

  const checkExistingBookings = async () => {
    if (!startDate) return;

    const q = query(
      collection(db, "workBookings"),
      where("vehicleId", "==", id)
    );
    const snapshot = await getDocs(q);
    const bookings = snapshot.docs.map((doc) => doc.data());

    const start = new Date(startDate);
    const end = new Date(mode === "multi" && endDate ? endDate : startDate);

    const conflicts = bookings.filter((b) => {
      const bStart = new Date(b.startDate);
      const bEnd = new Date(b.endDate || b.startDate);
      return start <= bEnd && end >= bStart;
    });

    setExistingBookings(conflicts);
  };

  const handleSubmit = async () => {
    if (!startDate || (!maintenanceType && mode !== "offroad")) {
      alert("Please select a date and maintenance type.");
      return;
    }

    const q = query(collection(db, "workBookings"), where("vehicleId", "==", id));
    const snapshot = await getDocs(q);
    const bookings = snapshot.docs.map((doc) => doc.data());

    const start = new Date(startDate);
    const end = new Date(mode === "multi" && endDate ? endDate : startDate);

    const conflicts = bookings.filter((b) => {
      const bStart = new Date(b.startDate);
      const bEnd = new Date(b.endDate || b.startDate);
      return start <= bEnd && end >= bStart;
    });

    if (conflicts.length > 0) {
      alert("This vehicle is already booked for maintenance during the selected date(s).");
      setExistingBookings(conflicts);
      return;
    }

    const record = {
      vehicleId: id,
      vehicleName: vehicle?.name || vehicle?.registration,
      startDate,
      endDate: mode === "multi" && endDate ? endDate : startDate,
      maintenanceType: maintenanceType === "Other" ? customReason : maintenanceType || "Off Road",
      notes,
      createdAt: new Date().toISOString(),
      status: mode === "offroad" ? "Off Road" : "Scheduled",
    };

    await addDoc(collection(db, "workBookings"), record);
    alert("Maintenance work booked.");
    resetForm();
  };

  const resetForm = () => {
    setStartDate("");
    setEndDate("");
    setMode("single");
    setMaintenanceType("");
    setCustomReason("");
    setNotes("");
    setExistingBookings([]);
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: 40, maxWidth: 700, color: "#111" }}>
        <h1>Book Maintenance for Vehicle</h1>
        <h2 style={{ marginTop: 10, color: "#111" }}>
          {vehicle?.name || vehicle?.registration || "Loading..."}
        </h2>

        <label style={label}>Booking Mode</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={() => setMode("single")} style={mode === "single" ? activeMode : modeBtn}>Single Day</button>
          <button onClick={() => setMode("multi")} style={mode === "multi" ? activeMode : modeBtn}>Multi-Day</button>
          <button onClick={() => setMode("offroad")} style={mode === "offroad" ? activeMode : modeBtn}>Off Road Until Fixed</button>
        </div>

        <label style={label}>Start Date</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={input} />

        {mode === "multi" && (
          <>
            <label style={label}>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={input} />
          </>
        )}

        {mode !== "offroad" && (
          <>
            <label style={label}>Maintenance Type</label>
            <select value={maintenanceType} onChange={(e) => setMaintenanceType(e.target.value)} style={input}>
              <option value="">Select…</option>
              <option value="General Service">General Service</option>
              <option value="Brake Test">Brake Test</option>
              <option value="Tyre Change">Tyre Change</option>
              <option value="Oil Change">Oil Change</option>
              <option value="Engine Check">Engine Check</option>
              <option value="Inspection">Inspection</option>
              <option value="Other">Other</option>
            </select>

            {maintenanceType === "Other" && (
              <>
                <label style={label}>Custom Reason</label>
                <input type="text" value={customReason} onChange={(e) => setCustomReason(e.target.value)} style={input} />
              </>
            )}
          </>
        )}

        <label style={label}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} style={{ ...input, height: 100 }} />

        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button onClick={checkExistingBookings} style={checkBtn}>🔍 Check Availability</button>
          <button onClick={handleSubmit} style={submitBtn}>✅ Book Maintenance</button>
          <button onClick={() => router.push("/vehicles")} style={cancelBtn}>❌ Cancel</button>
        </div>

        {existingBookings.length > 0 && (
          <div style={{ marginTop: 30 }}>
            <h3 style={{ color: "#dc2626" }}>⚠️ Conflicting Bookings:</h3>
            <ul>
              {existingBookings.map((b, i) => (
                <li key={i}>
                  {b.startDate} → {b.endDate || b.startDate}: {b.maintenanceType}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </HeaderSidebarLayout>
  );
}

// Styles
const label = { display: "block", marginTop: 20, fontWeight: 600 };
const input = {
  width: "100%",
  padding: "10px",
  borderRadius: "6px",
  border: "1px solid #ccc",
  fontSize: 14,
  marginTop: 5,
};
const submitBtn = {
  marginTop: 20,
  padding: "10px 20px",
  backgroundColor: "#10b981",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 16,
};
const cancelBtn = {
  ...submitBtn,
  backgroundColor: "#ef4444",
};
const checkBtn = {
  ...submitBtn,
  backgroundColor: "#3b82f6",
};
const modeBtn = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#f3f4f6",
  cursor: "pointer",
};
const activeMode = {
  ...modeBtn,
  backgroundColor: "#10b981",
  color: "#fff",
  border: "none",
};
