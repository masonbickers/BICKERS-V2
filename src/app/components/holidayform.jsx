// src/app/components/holidayform.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { addDoc, collection, getDocs } from "firebase/firestore";

export default function HolidayForm({ onClose, onSaved, defaultDate = "" }) {
  const router = useRouter();

  const [employee, setEmployee] = useState("");

  const [isMultiDay, setIsMultiDay] = useState(true);

  const [holidayDate, setHolidayDate] = useState(defaultDate || ""); // yyyy-mm-dd (single)
  const [startDate, setStartDate] = useState(defaultDate || ""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState(defaultDate || ""); // yyyy-mm-dd

  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");

  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  /* ---------------- Fetch employees ---------------- */
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs
          .map((d) => ({ id: d.id, name: d.data()?.name }))
          .filter((x) => x.name);
        setEmployees(list);
      } catch (e) {
        console.error("Failed to fetch employees:", e);
      }
    };
    fetchEmployees();
  }, []);

  const handleBack = () => {
    if (typeof onClose === "function") return onClose();
    router.push("/dashboard");
  };

  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!employee) return false;
    if (!holidayReason.trim()) return false;
    if (!paidStatus) return false;

    if (isMultiDay) return !!startDate && !!endDate;
    return !!holidayDate;
  }, [saving, employee, holidayReason, paidStatus, isMultiDay, startDate, endDate, holidayDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!employee) return alert("Please select an employee.");
    if (!holidayReason.trim()) return alert("Please enter a reason.");
    if (!paidStatus) return alert("Please select paid status.");

    setSaving(true);

    try {
      // Validate dates
      let finalStart = "";
      let finalEnd = "";

      if (isMultiDay) {
        if (!startDate || !endDate) {
          setSaving(false);
          return alert("Select both start and end dates.");
        }

        const s = new Date(startDate);
        const ed = new Date(endDate);
        if (Number.isNaN(+s) || Number.isNaN(+ed) || s > ed) {
          setSaving(false);
          return alert("End date must be the same or after start date.");
        }

        finalStart = startDate;
        finalEnd = endDate;
      } else {
        if (!holidayDate) {
          setSaving(false);
          return alert("Please select a date.");
        }
        finalStart = holidayDate;
        finalEnd = holidayDate;
      }

      await addDoc(collection(db, "holidays"), {
        employee,
        startDate: finalStart,
        endDate: finalEnd,
        holidayReason: holidayReason.trim(),
        paidStatus,
        createdAt: new Date(),
      });

      if (typeof onSaved === "function") onSaved();
      if (typeof onClose === "function") onClose();
      else router.push("/dashboard");
    } catch (err) {
      console.error("Error saving holiday:", err);
      alert("Failed to save holiday. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={headerRow}>
          <h2 style={modalTitle}>Add Holiday</h2>
          <button onClick={handleBack} style={closeBtn} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          {/* Employee */}
          <div>
            <label style={label}>Employee</label>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              style={input}
              required
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type toggle */}
          <div>
            <label style={label}>Holiday Type</label>
            <select
              value={isMultiDay ? "multi" : "single"}
              onChange={(e) => setIsMultiDay(e.target.value === "multi")}
              style={input}
            >
              <option value="single">Single Day</option>
              <option value="multi">Multi-Day</option>
            </select>
          </div>

          {/* Dates */}
          {!isMultiDay ? (
            <div>
              <label style={label}>Date</label>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                required
                style={input}
              />
            </div>
          ) : (
            <>
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
            </>
          )}

          {/* Reason */}
          <div>
            <label style={label}>Reason</label>
            <textarea
              value={holidayReason}
              onChange={(e) => setHolidayReason(e.target.value)}
              rows={3}
              placeholder="e.g. Family holiday / Sick / Appointment..."
              required
              style={{ ...input, minHeight: 70, resize: "vertical", paddingTop: 12 }}
            />
          </div>

          {/* Paid vs unpaid */}
          <div>
            <label style={label}>Paid status</label>
            <select value={paidStatus} onChange={(e) => setPaidStatus(e.target.value)} style={input}>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
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
            {saving ? "Saving..." : "Save holiday"}
          </button>

          <button type="button" onClick={handleBack} style={dangerBtn}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

/* -------------------- styles (same as your create-note) -------------------- */

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
  background:
    "linear-gradient(180deg, rgba(22,22,22,0.95) 0%, rgba(12,12,12,0.98) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
  backdropFilter: "blur(10px)",
};

const headerRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
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

const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(255,255,255,0.85)",
  marginBottom: 6,
};

const input = {
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

const globalOptionCSS = `
select option {
  background: #0b0b0b !important;
  color: #fff !important;
}
`;

if (typeof document !== "undefined" && !document.getElementById("holiday-form-option-css")) {
  const style = document.createElement("style");
  style.id = "holiday-form-option-css";
  style.innerHTML = globalOptionCSS;
  document.head.appendChild(style);
}

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
