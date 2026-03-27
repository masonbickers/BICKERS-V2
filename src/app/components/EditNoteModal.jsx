"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../../firebaseConfig";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

export default function EditNoteModal({ id, onClose }) {
  const [employee, setEmployee] = useState("");
  const [noteText, setNoteText] = useState("");

  const [isMultiDay, setIsMultiDay] = useState(false);
  const [noteDate, setNoteDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      const [noteSnap, employeeSnap] = await Promise.all([
        getDoc(doc(db, "notes", id)),
        getDocs(collection(db, "employees")),
      ]);

      if (noteSnap.exists()) {
        const data = noteSnap.data() || {};
        setEmployee(data.employee || "");
        setNoteText(data.text || "");

        if (data.startDate && data.endDate) {
          setIsMultiDay(true);
          setStartDate(String(data.startDate || "").slice(0, 10));
          setEndDate(String(data.endDate || "").slice(0, 10));
          setNoteDate("");
        } else {
          const rawDate = String(data.date || "").trim();
          setIsMultiDay(false);
          setNoteDate(rawDate.includes("T") ? rawDate.split("T")[0] : rawDate);
          setStartDate("");
          setEndDate("");
        }
      }

      setEmployees(
        employeeSnap.docs
          .map((d) => ({ id: d.id, name: d.data()?.name }))
          .filter((item) => item.name)
      );
    };

    load().catch((error) => {
      console.error("Failed to load note:", error);
      alert("Failed to load note.");
      onClose?.();
    });
  }, [id, onClose]);

  const getDateRange = (start, end) => {
    const out = [];
    const cursor = new Date(start);
    const last = new Date(end);

    cursor.setHours(0, 0, 0, 0);
    last.setHours(0, 0, 0, 0);

    while (cursor <= last) {
      out.push(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  };

  const fetchNotesForRange = async (start, end) => {
    const range = getDateRange(start, end);
    let noteDocs = [];

    for (const date of range) {
      const snap = await getDocs(query(collection(db, "notes"), where("date", "==", date)));
      noteDocs = noteDocs.concat(snap.docs);
    }

    return noteDocs;
  };

  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!noteText.trim()) return false;

    if (isMultiDay) return !!startDate && !!endDate;
    return !!noteDate;
  }, [saving, noteText, isMultiDay, startDate, endDate, noteDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) {
      alert("Note text cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      if (isMultiDay) {
        if (!startDate || !endDate) {
          alert("Select start & end dates.");
          setSaving(false);
          return;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (Number.isNaN(+start) || Number.isNaN(+end) || start > end) {
          alert("End date must be the same or after start date.");
          setSaving(false);
          return;
        }

        const range = getDateRange(startDate, endDate);
        const existing = await fetchNotesForRange(startDate, endDate);
        const existingDates = new Set(existing.map((noteDoc) => noteDoc.data()?.date).filter(Boolean));

        for (const noteDoc of existing) {
          await updateDoc(doc(db, "notes", noteDoc.id), {
            employee: employee || "",
            date: noteDoc.data()?.date || "",
            text: noteText.trim(),
            startDate,
            endDate,
            isMultiDay: true,
            updatedAt: new Date(),
          });
        }

        for (const date of range) {
          if (existingDates.has(date)) continue;
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
      } else {
        if (!noteDate) {
          alert("Please select a date.");
          setSaving(false);
          return;
        }

        await updateDoc(doc(db, "notes", id), {
          employee: employee || "",
          date: noteDate,
          text: noteText.trim(),
          isMultiDay: false,
          startDate: "",
          endDate: "",
          updatedAt: new Date(),
        });
      }

      onClose?.();
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Failed to save note. Please try again.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete this note${isMultiDay ? " series" : ""}?`)) return;

    setSaving(true);
    try {
      if (isMultiDay) {
        const notes = await fetchNotesForRange(startDate, endDate);
        for (const noteDoc of notes) {
          await deleteDoc(doc(db, "notes", noteDoc.id));
        }
      } else {
        await deleteDoc(doc(db, "notes", id));
      }

      onClose?.();
    } catch (error) {
      console.error("Error deleting note:", error);
      alert("Failed to delete note.");
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={headerRow}>
          <h2 style={modalTitle}>Edit Note</h2>
          <button onClick={onClose} style={closeBtn} aria-label="Close" type="button">
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={label}>Employee (optional)</label>
            <select value={employee} onChange={(e) => setEmployee(e.target.value)} style={input}>
              <option value="">No one specific</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

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

          <button type="button" onClick={handleDelete} style={dangerBtn} disabled={saving}>
            Delete note{isMultiDay ? "s" : ""}
          </button>

          <button type="button" onClick={onClose} style={secondaryBtn} disabled={saving}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

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
  gap: 12,
  marginBottom: 12,
};

const modalTitle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: "0.01em",
};

const closeBtn = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  borderRadius: 10,
  width: 36,
  height: 36,
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
};

const label = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.78)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontSize: 14,
  outline: "none",
};

const primaryBtn = {
  width: "100%",
  padding: 12,
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  marginTop: 4,
};

const dangerBtn = {
  width: "100%",
  padding: 12,
  backgroundColor: "#8b1e1e",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn = {
  width: "100%",
  padding: 12,
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};
