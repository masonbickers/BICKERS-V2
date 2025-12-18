// src/app/components/EditHolidayForm.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function EditHolidayForm({ holidayId, onClose, onSaved }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [employee, setEmployee] = useState("");
  const [employees, setEmployees] = useState([]);

  const [isMultiDay, setIsMultiDay] = useState(true);

  const [holidayDate, setHolidayDate] = useState(""); // yyyy-mm-dd (single)
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState(""); // yyyy-mm-dd

  // ✅ Half-day support (same schema as create)
  const [startHalfDay, setStartHalfDay] = useState(false);
  const [startAMPM, setStartAMPM] = useState("AM");
  const [endHalfDay, setEndHalfDay] = useState(false);
  const [endAMPM, setEndAMPM] = useState("PM");

  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");

  /* ---------------- helpers ---------------- */
  const ymdToDate = (ymd) => {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(+dt) ? null : dt;
  };

  const dateToYMD = (val) => {
    if (!val) return "";
    const d = val?.toDate ? val.toDate() : val instanceof Date ? val : new Date(val);
    if (Number.isNaN(+d)) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const sameYMD = (a, b) =>
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const handleBack = () => {
    if (typeof onClose === "function") return onClose();
    router.push("/dashboard");
  };

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

  /* ---------------- Load holiday ---------------- */
  useEffect(() => {
    const run = async () => {
      if (!holidayId) return;

      setLoading(true);
      try {
        const ref = doc(db, "holidays", String(holidayId));
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setLoading(false);
          alert("Holiday not found.");
          handleBack();
          return;
        }

        const rec = snap.data() || {};

        const sYMD = dateToYMD(rec.startDate);
        const eYMD = dateToYMD(rec.endDate || rec.startDate);

        const sD = ymdToDate(sYMD);
        const eD = ymdToDate(eYMD);
        const isSingle = sD && eD ? sameYMD(sD, eD) : sYMD && eYMD && sYMD === eYMD;

        setEmployee(rec.employee || "");
        setPaidStatus(rec.paidStatus || (rec.paid === false ? "Unpaid" : "Paid"));
        setHolidayReason(rec.holidayReason || rec.notes || "");

        setIsMultiDay(!isSingle);

        // dates
        if (isSingle) {
          setHolidayDate(sYMD);
          setStartDate(sYMD);
          setEndDate(eYMD);
        } else {
          setHolidayDate("");
          setStartDate(sYMD);
          setEndDate(eYMD);
        }

        // half-day (new schema preferred; fallback to legacy)
        const legacyHalf = rec.halfDay === true;
        const legacyWhen =
          (String(rec.halfDayPeriod || rec.halfDayType || "").toUpperCase() === "PM"
            ? "PM"
            : "AM");

        const sHalf = !!rec.startHalfDay || (isSingle && legacyHalf);
        const sWhen = (rec.startAMPM || (isSingle && legacyHalf ? legacyWhen : "AM")) === "PM" ? "PM" : "AM";

        const eHalf = !!rec.endHalfDay; // for multi-day end half
        const eWhen = (rec.endAMPM || "PM") === "AM" ? "AM" : "PM";

        setStartHalfDay(sHalf);
        setStartAMPM(sWhen);
        setEndHalfDay(eHalf);
        setEndAMPM(eWhen);

        setLoading(false);
      } catch (err) {
        console.error("Failed to load holiday:", err);
        setLoading(false);
        alert("Failed to load holiday.");
        handleBack();
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holidayId]);

  // If single-day, keep end half settings aligned with start (for consistent HR parsing)
  useEffect(() => {
    if (!isMultiDay) {
      setEndHalfDay(startHalfDay);
      setEndAMPM(startAMPM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiDay, startHalfDay, startAMPM]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (saving) return false;
    if (!holidayId) return false;

    if (!employee) return false;
    if (!holidayReason.trim()) return false;
    if (!paidStatus) return false;

    if (isMultiDay) return !!startDate && !!endDate;
    return !!holidayDate;
  }, [
    loading,
    saving,
    holidayId,
    employee,
    holidayReason,
    paidStatus,
    isMultiDay,
    startDate,
    endDate,
    holidayDate,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!holidayId) return;

    if (!employee) return alert("Please select an employee.");
    if (!holidayReason.trim()) return alert("Please enter a reason.");
    if (!paidStatus) return alert("Please select paid status.");

    setSaving(true);

    try {
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

      const startAsDate = ymdToDate(finalStart);
      const endAsDate = ymdToDate(finalEnd);
      const single = startAsDate && endAsDate ? sameYMD(startAsDate, endAsDate) : false;

      const payload = {
        employee,
        startDate: startAsDate,
        endDate: endAsDate,

        // half-day schema (same as create)
        startHalfDay: !!startHalfDay,
        startAMPM: startHalfDay ? startAMPM : null,
        endHalfDay: single ? false : !!endHalfDay,
        endAMPM: single ? null : endHalfDay ? endAMPM : null,

        holidayReason: holidayReason.trim(),
        paidStatus,

        // keep your pipeline consistent
        status: "requested",

        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "holidays", String(holidayId)), payload);

      if (typeof onSaved === "function") onSaved();
      if (typeof onClose === "function") onClose();
      else router.push("/dashboard");
    } catch (err) {
      console.error("Error updating holiday:", err);
      alert("Failed to update holiday. Please try again.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!holidayId) return;
    const ok = confirm("Delete this holiday entry? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, "holidays", String(holidayId)));
      if (typeof onSaved === "function") onSaved();
      if (typeof onClose === "function") onClose();
      else router.push("/holiday-usage");
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={headerRow}>
          <div style={{ display: "grid", gap: 2 }}>
            <h2 style={modalTitle}>{loading ? "Loading…" : "Edit Holiday"}</h2>
       
          </div>

          <button onClick={handleBack} style={closeBtn} aria-label="Close" type="button">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          {/* Employee */}
          <div>
            <label style={label}>Employee</label>
            <select value={employee} onChange={(e) => setEmployee(e.target.value)} style={input} required>
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
              disabled={loading}
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
                disabled={loading}
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
                  disabled={loading}
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
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* Half day controls */}
          <div style={halfWrap}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,0.92)" }}>Half day</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                  {isMultiDay ? "Use start and/or end half day." : "Single day can be AM or PM."}
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={startHalfDay}
                  onChange={(e) => setStartHalfDay(e.target.checked)}
                  disabled={loading}
                />
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                  {isMultiDay ? "Start half" : "Half day"}
                </span>
              </label>
            </div>

            {startHalfDay ? (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                <div>
                  <label style={label}>Start AM / PM</label>
                  <select
                    value={startAMPM}
                    onChange={(e) => setStartAMPM(e.target.value)}
                    style={input}
                    disabled={loading}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>

                {isMultiDay ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <label style={{ ...label, marginBottom: 0 }}>End half day</label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={endHalfDay}
                          onChange={(e) => setEndHalfDay(e.target.checked)}
                          disabled={loading}
                        />
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>End half</span>
                      </label>
                    </div>

                    {endHalfDay ? (
                      <div style={{ marginTop: 8 }}>
                        <label style={label}>End AM / PM</label>
                        <select
                          value={endAMPM}
                          onChange={(e) => setEndAMPM(e.target.value)}
                          style={input}
                          disabled={loading}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : isMultiDay ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <label style={{ ...label, marginBottom: 0 }}>End half day</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={endHalfDay}
                      onChange={(e) => setEndHalfDay(e.target.checked)}
                      disabled={loading}
                    />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>End half</span>
                  </label>
                </div>

                {endHalfDay ? (
                  <div style={{ marginTop: 8 }}>
                    <label style={label}>End AM / PM</label>
                    <select
                      value={endAMPM}
                      onChange={(e) => setEndAMPM(e.target.value)}
                      style={input}
                      disabled={loading}
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

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
              disabled={loading}
            />
          </div>

          {/* Paid vs unpaid */}
          <div>
            <label style={label}>Paid status</label>
            <select
              value={paidStatus}
              onChange={(e) => setPaidStatus(e.target.value)}
              style={input}
              disabled={loading}
            >
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
            {saving ? "Saving..." : "Update holiday"}
          </button>

          <div style={{ display: "grid", gap: 10 }}>
            <button
              type="button"
              onClick={handleDelete}
              style={dangerBtn}
              disabled={loading || saving}
            >
              Delete holiday
            </button>

            <button type="button" onClick={handleBack} style={ghostBtn} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------- styles (matching your create) -------------------- */

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 999, // keep above drawer
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

const halfWrap = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 12,
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

const ghostBtn = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.88)",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};
