"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth, db } from "../../../../firebaseConfig";
import { signOut } from "firebase/auth";
import { doc, getDoc, getDocs, updateDoc, deleteDoc} from "firebase/firestore";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

export default function EditNoteForm() {
  const router = useRouter();
  const params = useParams();
  const noteId = params?.id;
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [employee, setEmployee] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [noteText, setNoteText] = useState("");
  const [blocksEmployeeBooking, setBlocksEmployeeBooking] = useState(false);
  const [employees, setEmployees] = useState([]);

  

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "load note edit employees" });
      setEmployees([]);
      return;
    }

    const fetchNote = async () => {
      try {
        const docRef = doc(db, "notes", noteId);
        const noteSnap = await getDoc(docRef);
        if (noteSnap.exists()) {
          const data = noteSnap.data();
          setEmployee(data.employee || "");
          setBlocksEmployeeBooking(Boolean(data.blocksEmployeeBooking));
          setNoteDate(data.date);
          setNoteText(data.text);
        }
      } catch (error) {
        console.error("Failed to fetch note:", error);
      }
    };

    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
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
  }, [accessKey, dataAccessState, noteId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!noteDate || !noteText) {
      alert("Please fill in the date and note text.");
      return;
    }

    try {
      await updateDoc(doc(db, "notes", noteId), tenantPayload(dataAccessState, {
        employee,
        blocksEmployeeBooking,
        date: noteDate,
        text: noteText,
        updatedAt: new Date(),
      }));
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
    <div className={layoutStyles.extracted1}>
      <main className={layoutStyles.extracted2}>
        <div className={layoutStyles.extracted3}>

          <button onClick={handleHome} className={layoutStyles.extracted4}>Back</button>
        </div>

        <h1 className={layoutStyles.extracted5}>Edit Note</h1>

        <div className={layoutStyles.extracted6}>
          <h2 className={layoutStyles.extracted7}>Update Note</h2>
          <form onSubmit={handleSubmit}>
            <div className={layoutStyles.extracted8}>
              <label className={layoutStyles.extracted9}>Employee (optional)</label>
              <select
                value={employee}
                onChange={(e) => {
                  setEmployee(e.target.value);
                  if (!e.target.value) setBlocksEmployeeBooking(false);
                }}
                className={layoutStyles.extracted10}
              >
                <option value="">No one specific</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <label className={layoutStyles.extracted11}>
              <input
                type="checkbox"
                checked={blocksEmployeeBooking}
                onChange={(e) => setBlocksEmployeeBooking(e.target.checked)}
                disabled={!employee}
              />
              <span>Mark employee unavailable for bookings</span>
            </label>

            <div className={layoutStyles.extracted12}>
              <label className={layoutStyles.extracted13}>Date</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                required
                className={layoutStyles.extracted14}
              />
            </div>

            <div className={layoutStyles.extracted15}>
              <label className={layoutStyles.extracted16}>Note Text</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                required
                className={layoutStyles.extracted17}
              />
            </div>

            <button type="submit" className={layoutStyles.extracted18}>Update Note</button>
            <button type="button" onClick={handleCancel} className={layoutStyles.extracted19}>Cancel</button>

            <button
                type="button"
                onClick={handleDelete}
                className={layoutStyles.extracted20}
                >
                Delete Note
            </button>

          </form>
        </div>
      </main>
    </div>
  );
}

//  Styles (reuse from original NoteForm)
const mainContainerStyle = { display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "var(--shell-sidebar-bg)", color: "var(--color-white)", minHeight: "100vh", padding: "40px" };
const mainContentStyle = { maxWidth: "800px", width: "100%", backgroundColor: "var(--shell-sidebar-bg)", padding: "20px", borderRadius: "10px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" };
const logoStyle = { width: "180px", height: "auto" };
const backButtonStyle = { backgroundColor: "var(--color-warning)", color: "var(--color-white)", border: "none", padding: "8px 16px", fontSize: "14px", cursor: "pointer", borderRadius: "6px" };
const pageTitleStyle = { fontSize: "32px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" };
const formContainerStyle = { backgroundColor: "var(--shell-sidebar-bg)", padding: "30px", borderRadius: "8px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)" };
const formTitleStyle = { fontSize: "24px", fontWeight: "bold", marginBottom: "20px", color: "var(--color-white)" };
const inputContainerStyle = { marginBottom: "15px" };
const labelStyle = { fontSize: "14px", fontWeight: "600", marginBottom: "5px", display: "block", color: "var(--color-white)" };
const checkRowStyle = { display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 15, color: "var(--color-white)", fontSize: 14, fontWeight: 700 };
const inputStyle = { width: "100%", padding: "12px", marginBottom: "10px", borderRadius: "6px", border: "1px solid var(--color-brand-hover)", fontSize: "14px", backgroundColor: "var(--shell-sidebar-bg)", color: "var(--color-white)" };
const buttonStyle = { width: "100%", padding: "12px", backgroundColor: "var(--color-info)", color: "var(--color-white)", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "20px" };
const cancelButtonStyle = { width: "100%", padding: "12px", backgroundColor: "var(--color-warning)", color: "var(--color-white)", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" };
