"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
} from "firebase/firestore";

export default function NoteForm() {
  const router = useRouter();

  const [employee, setEmployee] = useState("");
  const [noteText, setNoteText] = useState("");

  const [isMultiDay, setIsMultiDay] = useState(false);
  const [noteDate, setNoteDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [employees, setEmployees] = useState([]);

  /* ---------------- Fetch employees ---------------- */
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        setEmployees(
          snapshot.docs.map((d) => ({ id: d.id, name: d.data().name }))
        );
      } catch (err) {
        console.error("Failed to load employees", err);
      }
    };
    fetchEmployees();
  }, []);

  /* ---------------- Helpers ---------------- */
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

  /* ---------------- Save note(s) ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!noteText.trim()) return alert("Note text cannot be empty.");

    try {
      /* MULTI-DAY NOTE ----------------------------------------------------- */
      if (isMultiDay) {
        if (!startDate || !endDate)
          return alert("Select both start and end dates.");

        const range = getDateRange(startDate, endDate);

        for (const date of range) {
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

      /* SINGLE DAY NOTE ---------------------------------------------------- */
      else {
        if (!noteDate) return alert("Please select a date.");

        await addDoc(collection(db, "notes"), {
          employee,
          date: noteDate,
          text: noteText,
          createdAt: new Date(),
        });
      }

      alert("Note saved!");
      router.push("/dashboard");

    } catch (err) {
      console.error("Error saving note:", err);
      alert("Failed to save note.");
    }
  };

  /* ---------------- Navigation ---------------- */
  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  const handleCancel = () => {
    router.push("/dashboard");
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={pageWrap}>
      <main style={card}>
        {/* Header */}
        <div style={header}>
          <button onClick={handleHome} style={backBtn}>← Back</button>
        </div>

        <h1 style={title}>Add Note</h1>

        <div style={formWrap}>
          <h2 style={formTitle}>Create Note</h2>

          <form onSubmit={handleSubmit}>

            {/* Employee */}
            <div style={inputGroup}>
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
            <div style={inputGroup}>
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
              <div style={inputGroup}>
                <label style={label}>Date</label>
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
                <div style={inputGroup}>
                  <label style={label}>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={input}
                    required
                  />
                </div>

                <div style={inputGroup}>
                  <label style={label}>End Date</label>
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

            {/* Text */}
            <div style={inputGroup}>
              <label style={label}>Note Text</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your note..."
                rows={4}
                style={{ ...input, resize: "vertical" }}
                required
              />
            </div>

            {/* Buttons */}
            <button type="submit" style={saveBtn}>Save Note</button>
            <button type="button" onClick={handleCancel} style={cancelBtn}>
              Cancel
            </button>

          </form>
        </div>
      </main>
    </div>
  );
}

/* ---------------- Styled Components ---------------- */

const pageWrap = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  backgroundColor: "#1e1e1e",
  color: "#fff",
  minHeight: "100vh",
  padding: "40px",
};

const card = {
  maxWidth: 800,
  width: "100%",
  backgroundColor: "#121212",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};

const backBtn = {
  backgroundColor: "#f44336",
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  fontSize: 14,
  cursor: "pointer",
  borderRadius: 6,
};

const title = {
  fontSize: 32,
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: 20,
};

const formWrap = {
  backgroundColor: "#222",
  padding: 30,
  borderRadius: 8,
  boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
};

const formTitle = {
  fontSize: 24,
  fontWeight: "bold",
  marginBottom: 20,
};

const inputGroup = {
  marginBottom: 16,
};

const label = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 6,
  display: "block",
};

const input = {
  width: "100%",
  padding: 12,
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
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: 10,
};

const cancelBtn = {
  width: "100%",
  padding: 12,
  backgroundColor: "#f44336",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: 10,
};
