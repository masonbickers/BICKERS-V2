"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth, db } from "../../../../firebaseConfig";
import { signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc} from "firebase/firestore";

export default function EditNoteForm() {
  const router = useRouter();
  const params = useParams();
  const noteId = params?.id;

  const [employee, setEmployee] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [noteText, setNoteText] = useState("");
  const [employees, setEmployees] = useState([]);

  

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const docRef = doc(db, "notes", noteId);
        const noteSnap = await getDoc(docRef);
        if (noteSnap.exists()) {
          const data = noteSnap.data();
          setEmployee(data.employee || "");
          setNoteDate(data.date);
          setNoteText(data.text);
        }
      } catch (error) {
        console.error("Failed to fetch note:", error);
      }
    };

    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
        }));
        setEmployees(data);
      } catch (error) {
        console.error("Failed to fetch employees:", error);
      }
    };

    if (noteId) {
      fetchNote();
      fetchEmployees();
    }
  }, [noteId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!noteDate || !noteText) {
      alert("Please fill in the date and note text.");
      return;
    }

    try {
      await updateDoc(doc(db, "notes", noteId), {
        employee,
        date: noteDate,
        text: noteText,
        updatedAt: new Date(),
      });
      alert("Note updated successfully!");
      router.push("/dashboard");
    } catch (err) {
      console.error("Error updating note: ", err);
      alert("Failed to update note. Please try again.");
    }
  };

  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  const handleCancel = () => {
    router.push("/dashboard");
  };

  const handleDelete = async () => {
    const confirmDelete = confirm("Are you sure you want to delete this note?");
    if (!confirmDelete) return;
  
    try {
      await deleteDoc(doc(db, "notes", noteId));
      alert("Note deleted successfully!");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting note:", error);
      alert("Failed to delete the note. Please try again.");
    }
  };
  

  return (
    <div style={mainContainerStyle}>
      <main style={mainContentStyle}>
        <div style={headerStyle}>

          <button onClick={handleHome} style={backButtonStyle}>Back</button>
        </div>

        <h1 style={pageTitleStyle}>Edit Note</h1>

        <div style={formContainerStyle}>
          <h2 style={formTitleStyle}>Update Note</h2>
          <form onSubmit={handleSubmit}>
            <div style={inputContainerStyle}>
              <label style={labelStyle}>Employee (optional)</label>
              <select
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                style={inputStyle}
              >
                <option value="">No one specific</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                required
                style={inputStyle}
              />
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Note Text</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                required
                style={inputStyle}
              />
            </div>

            <button type="submit" style={buttonStyle}>Update Note</button>
            <button type="button" onClick={handleCancel} style={cancelButtonStyle}>Cancel</button>

            <button
                type="button"
                onClick={handleDelete}
                style={{
                    ...cancelButtonStyle,
                    backgroundColor: "#880808", // darker red
                    marginTop: "10px",
                }}
                >
                Delete Note
            </button>

          </form>
        </div>
      </main>
    </div>
  );
}

// 🔷 Styles (reuse from original NoteForm)
const mainContainerStyle = { display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#1e1e1e", color: "#fff", minHeight: "100vh", padding: "40px" };
const mainContentStyle = { maxWidth: "800px", width: "100%", backgroundColor: "#121212", padding: "20px", borderRadius: "10px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" };
const logoStyle = { width: "180px", height: "auto" };
const backButtonStyle = { backgroundColor: "#f44336", color: "#fff", border: "none", padding: "8px 16px", fontSize: "14px", cursor: "pointer", borderRadius: "6px" };
const pageTitleStyle = { fontSize: "32px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" };
const formContainerStyle = { backgroundColor: "#222", padding: "30px", borderRadius: "8px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)" };
const formTitleStyle = { fontSize: "24px", fontWeight: "bold", marginBottom: "20px", color: "#fff" };
const inputContainerStyle = { marginBottom: "15px" };
const labelStyle = { fontSize: "14px", fontWeight: "600", marginBottom: "5px", display: "block", color: "#fff" };
const inputStyle = { width: "100%", padding: "12px", marginBottom: "10px", borderRadius: "6px", border: "1px solid #444", fontSize: "14px", backgroundColor: "#333", color: "#fff" };
const buttonStyle = { width: "100%", padding: "12px", backgroundColor: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "20px" };
const cancelButtonStyle = { width: "100%", padding: "12px", backgroundColor: "#f44336", color: "#fff", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" };
