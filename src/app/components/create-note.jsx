// src/app/components/create-note.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { addDoc, collection, getDocs } from "firebase/firestore";

export default function CreateNote({ onClose, onSaved, defaultDate = "" }) {
  const router = useRouter();

  const [employee, setEmployee] = useState("");
  const [noteText, setNoteText] = useState("");

  const [isMultiDay, setIsMultiDay] = useState(false);
  const [noteDate, setNoteDate] = useState(defaultDate || ""); // yyyy-mm-dd
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState(""); // yyyy-mm-dd

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

  /* ---------------- Helpers ---------------- */
  const getDateRange = (start, end) => {
    const arr = [];
    const d = new Date(start);
    const last = new Date(end);

    // normalise to local midnight to avoid DST weirdness
    d.setHours(0, 0, 0, 0);
    last.setHours(0, 0, 0, 0);

    while (d <= last) {
      arr.push(d.toISOString().split("T")[0]);
      d.setDate(d.getDate() + 1);
    }
    return arr;
  };

  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!noteText.trim()) return false;

    if (isMultiDay) return !!startDate && !!endDate;
    return !!noteDate;
  }, [saving, noteText, isMultiDay, startDate, endDate, noteDate]);

  const handleBack = () => {
    if (typeof onClose === "function") return onClose();
    router.push("/dashboard");
  };

  /* ---------------- Save note(s) ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!noteText.trim()) {
      alert("Note text cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      /* MULTI-DAY NOTE ----------------------------------------------------- */
      if (isMultiDay) {
        if (!startDate || !endDate) {
          alert("Select both start and end dates.");
          setSaving(false);
          return;
        }

        const s = new Date(startDate);
        const ed = new Date(endDate);
        if (isNaN(+s) || isNaN(+ed) || s > ed) {
          alert("End date must be the same or after start date.");
          setSaving(false);
          return;
        }

        const range = getDateRange(startDate, endDate);

        for (const date of range) {
          await addDoc(collection(db, "notes"), {
            employee: employee || "",
            date,
            text: noteText.trim(),
            startDate,
            endDate,
            isMultiDay: true,
            createdAt: new Date(),
          });
        }
      }

      /* SINGLE DAY NOTE ---------------------------------------------------- */
      else {
        if (!noteDate) {
          alert("Please select a date.");
          setSaving(false);
          return;
        }

        await addDoc(collection(db, "notes"), {
          employee: employee || "",
          date: noteDate,
          text: noteText.trim(),
          isMultiDay: false,
          createdAt: new Date(),
        });
      }

      if (typeof onSaved === "function") onSaved();

      if (typeof onClose === "function") onClose();
      else router.push("/dashboard");
    } catch (err) {
      console.error("Error saving note:", err);
      alert("Failed to save note. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={headerRow}>
          <h2 style={modalTitle}>Add Note</h2>
          <button onClick={handleBack} style={closeBtn} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          {/* Employee */}
          <div>
            <label style={label}>Employee (optional)</label>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              style={input}
            >
              <option value="">No one specific</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type toggle */}
          <div>
            <label style={label}>Note Type</label>
            <select
              value={isMultiDay ? "multi" : "single"}
              onChange={(e) => setIsMultiDay(e.target.value === "multi")}
              style={input}
            >
              <option value="single">Single Day</option>
              <option value="multi">Multi-Day</option>
            </select>
          </div>

          {/* Date fields */}
          {!isMultiDay ? (
            <div>
              <label style={label}>Date</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
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

          {/* Text */}
          <div>
            <label style={label}>Note</label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="Write note..."
              required
              style={{ ...input, resize: "vertical", paddingTop: 12 }}
            />
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
            {saving ? "Saving..." : "Save changes"}
          </button>

          <button type="button" onClick={handleBack} style={dangerBtn}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

/* -------------------- styles to match HolidayForm -------------------- */

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

/**
 * ✅ Fixes your “dropdown colour clash”:
 * - keep field text white
 * - give selects/inputs a consistent translucent bg
 * - explicitly style option background/text so they’re readable
 */
const input = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  backgroundColor: "rgba(255,255,255,0.14)",
  color: "#fff", // ✅ readable always
  outline: "none",
  fontSize: 14,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  appearance: "none",
};

/* Extra: makes dropdown options readable across browsers */
const globalOptionCSS = `
select option {
  background: #0b0b0b !important;
  color: #fff !important;
}
`;

// If you don’t want to rely on global CSS, add this once in your app.
// For now, we inject it locally:
if (typeof document !== "undefined" && !document.getElementById("create-note-option-css")) {
  const style = document.createElement("style");
  style.id = "create-note-option-css";
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
