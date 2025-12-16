// src/app/components/EditHolidayForm.jsx
"use client";

import { useState, useEffect } from "react";
import { db } from "../../../firebaseConfig";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";

export default function EditHolidayForm({ holidayId, onDone, onBack }) {
  const [employee, setEmployee] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ---------------------------- Load data ---------------------------- */

  useEffect(() => {
    if (!holidayId) return;

    const load = async () => {
      /* Holiday */
      const ref = doc(db, "holidays", holidayId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data();
        setEmployee(d.employee || "");
        setStartDate(d.startDate || "");
        setEndDate(d.endDate || "");
        setHolidayReason(d.holidayReason || "");
        setPaidStatus(d.paidStatus || "Paid");
      }

      /* Employees list */
      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(
        empSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
        }))
      );

      setLoading(false);
    };

    load();
  }, [holidayId]);

  /* ----------------------------- Handlers ---------------------------- */

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await updateDoc(doc(db, "holidays", holidayId), {
        employee,
        startDate,
        endDate,
        holidayReason,
        paidStatus,
      });

      alert("Holiday updated.");
      onDone?.();
    } catch (err) {
      console.error(err);
      alert("Failed to update holiday.");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this holiday?")) return;

    try {
      await deleteDoc(doc(db, "holidays", holidayId));
      alert("Holiday deleted.");
      onDone?.();
    } catch (err) {
      console.error(err);
      alert("Failed to delete holiday.");
    }
  };

  if (loading) return <p style={{ color: "#fff" }}>Loading…</p>;

  /* ------------------------------- UI ------------------------------- */

  return (
    <div style={{ color: "#fff" }}>
      {/* Title (no close button — modal wrapper handles that) */}
      <div style={{ marginBottom: 16 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          Edit Holiday
        </h3>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        {/* Employee */}
        <div>
          <label style={label}>Employee</label>
          <select
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            required
            style={input}
          >
            <option value="">Select Employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.name}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>

        {/* Dates */}
        <div>
          <label style={label}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            style={input}
          />
        </div>

        <div>
          <label style={label}>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            style={input}
          />
        </div>

        {/* Reason */}
        <div>
          <label style={label}>Reason</label>
          <textarea
            value={holidayReason}
            onChange={(e) => setHolidayReason(e.target.value)}
            rows={3}
            required
            style={{ ...input, minHeight: 70, resize: "vertical" }}
          />
        </div>

        {/* Paid vs unpaid */}
        <div>
          <label style={label}>Paid status</label>
          <select
            value={paidStatus}
            onChange={(e) => setPaidStatus(e.target.value)}
            style={input}
          >
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>

        {/* Save */}
        <button
          type="submit"
          style={{
            padding: "12px 0",
            borderRadius: 8,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
          }}
        >
          Save changes
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          style={{
            padding: "10px 0",
            borderRadius: 8,
            background: "#7f1d1d",
            color: "#fca5a5",
            fontWeight: 600,
            border: "1px solid #b91c1c",
            cursor: "pointer",
          }}
        >
          Delete holiday
        </button>
      </form>
    </div>
  );
}

/* ---------------------------- Shared Styles ---------------------------- */

const label = {
  fontSize: 13,
  marginBottom: 4,
  display: "block",
  color: "#e5e7eb",
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  backgroundColor: "#333",
  border: "1px solid #444",
  color: "#fff",
  fontSize: 14,
  outline: "none",
};
