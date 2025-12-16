"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  addDoc,
} from "firebase/firestore";

export default function EditNoteModal({ id, onClose }) {
  const [employee, setEmployee] = useState("");
  const [noteText, setNoteText] = useState("");

  const [noteDate, setNoteDate] = useState("");
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [employees, setEmployees] = useState([]);

  /* ---------------- LOAD NOTE + EMPLOYEES ---------------- */
  useEffect(() => {
    if (!id) return;

    const load = async () => {
      const snap = await getDoc(doc(db, "notes", id));

      if (snap.exists()) {
        const d = snap.data();
        setEmployee(d.employee || "");
        setNoteText(d.text || "");

        if (d.startDate && d.endDate) {
          setIsMultiDay(true);
          setStartDate(d.startDate);
          setEndDate(d.endDate);
        } else {
          const raw = d.date || "";
          const formatted =
            typeof raw === "string" && raw.includes("T")
              ? raw.split("T")[0]
              : raw;

          setNoteDate(formatted);
        }
      }

      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, name: d.data().name })));
    };

    load();
  }, [id]);

  /* ---------------- DATE HELPERS ---------------- */
  const getDateRange = (start, end) => {
    const arr = [];
    const d = new Date(start);
    const last = new Date(end);

    while (d <= last) {
      arr.push(d.toISOString().split("T")[0]);
      d.setDate(d.getDate() + 1);
    }
    return arr;
  };

  const fetchNotesForRange = async (start, end) => {
    const range = getDateRange(start, end);
    let allNotes = [];

    for (const date of range) {
      const qy = query(collection(db, "notes"), where("date", "==", date));
      const snap = await getDocs(qy);
      allNotes.push(...snap.docs);
    }

    return allNotes;
  };

  /* ---------------- SAVE NOTE(S) ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return alert("Add note text.");

    try {
      /* MULTI-DAY MODE */
      if (isMultiDay) {
        if (!startDate || !endDate)
          return alert("Select start & end dates.");

        const range = getDateRange(startDate, endDate);
        const existing = await fetchNotesForRange(startDate, endDate);

        const existingDates = new Set(existing.map((n) => n.data().date));

        // Update all existing notes in range
        for (const n of existing) {
          await updateDoc(doc(db, "notes", n.id), {
            employee,
            date: n.data().date,
            text: noteText,
            startDate,
            endDate,
            updatedAt: new Date(),
          });
        }

        // Create missing days
        for (const date of range) {
          if (!existingDates.has(date)) {
            await addDoc(collection(db, "notes"), {
              employee,
              date,
              text: noteText,
              startDate,
              endDate,
              createdAt: new Date(),
            });
          }
        }
      }

      /* SINGLE-DAY MODE */
      else {
        await updateDoc(doc(db, "notes", id), {
          employee,
          date: noteDate,
          text: noteText,
          updatedAt: new Date(),
        });
      }

      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save.");
    }
  };

  /* ---------------- DELETE NOTE(S) ---------------- */
  const handleDelete = async () => {
    if (!confirm("Delete this note or entire series?")) return;

    try {
      if (isMultiDay) {
        const notes = await fetchNotesForRange(startDate, endDate);
        for (const n of notes) {
          await deleteDoc(doc(db, "notes", n.id));
        }
      } else {
        await deleteDoc(doc(db, "notes", id));
      }

      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to delete.");
    }
  };

  /* ---------------- UI ---------------- */
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "95vw",
          backgroundColor: "#121212",
          color: "#fff",
          padding: 24,
          borderRadius: 10,
          boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>
            Edit Note
          </h2>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#9ca3af",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Employee */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Employee (optional)
            </label>
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
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Note Type
            </label>
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
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4 }}>
                Date
              </label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                style={input}
                required
              />
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 4 }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={input}
                  required
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 4 }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={input}
                  required
                />
              </div>
            </>
          )}

          {/* Note text */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Note Text
            </label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              style={{ ...input, resize: "vertical" }}
              required
            />
          </div>

          <button type="submit" style={saveBtn}>
            Save changes
          </button>

          <button type="button" onClick={handleDelete} style={deleteBtn}>
            Delete note{isMultiDay ? "s" : ""}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Styles ---------------- */

const input = {
  width: "100%",
  padding: 10,
  borderRadius: 6,
  border: "1px solid #444",
  backgroundColor: "#333",
  color: "#fff",
};

const saveBtn = {
  width: "100%",
  padding: 12,
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 8,
};

const deleteBtn = {
  width: "100%",
  padding: 12,
  backgroundColor: "#880808",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 8,
};
