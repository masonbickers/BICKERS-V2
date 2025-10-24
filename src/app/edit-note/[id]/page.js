"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../firebaseConfig";
import { signOut } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

/* ----------------------------- Page Component ----------------------------- */
export default function EditNotePage() {
  const router = useRouter();
  const { id } = useParams(); // note id from URL

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // form state
  const [employee, setEmployee] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [noteText, setNoteText] = useState("");

  // lists
  const [employees, setEmployees] = useState([]);

  /* --------------------------- fetch employees list --------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data()?.name || "",
        }));
        setEmployees(data);
      } catch (e) {
        console.error("Failed to fetch employees:", e);
      }
    })();
  }, []);

  /* ------------------------------- fetch the note ------------------------------ */
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    (async () => {
      try {
        const ref = doc(db, "notes", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError("Note not found.");
          setLoading(false);
          return;
        }
        const n = snap.data();
        setEmployee(n.employee || "");
        // handle date as yyyy-mm-dd
        const raw = n.date || n.noteDate;
        const dateISO = toISODateOnly(raw);
        setNoteDate(dateISO || "");
        setNoteText(n.text || n.noteText || "");
      } catch (e) {
        console.error(e);
        setError("Failed to load note.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  /* --------------------------------- actions --------------------------------- */
  const handleSave = async (e) => {
    e.preventDefault();
    if (!noteDate || !noteText) {
      alert("Please fill in the date and note text.");
      return;
    }
    try {
      setSaving(true);
      const ref = doc(db, "notes", id);
      await updateDoc(ref, {
        employee,
        date: noteDate,
        text: noteText,
        updatedAt: serverTimestamp(),
      });
      alert("Note updated!");
      router.push("/dashboard");
    } catch (e) {
      console.error("Update failed:", e);
      alert("Failed to update note.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    try {
      setDeleting(true);
      await deleteDoc(doc(db, "notes", id));
      alert("Note deleted.");
      router.push("/dashboard");
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Failed to delete note.");
    } finally {
      setDeleting(false);
    }
  };

  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  const handleCancel = () => {
    router.push("/dashboard");
  };

  /* ---------------------------------- UI ---------------------------------- */
  if (loading) {
    return (
      <div style={mainContainerStyle}>
        <main style={mainContentStyle}>
          <div style={headerStyle}>
            <button onClick={handleHome} style={backButtonStyle}>Back</button>
          </div>
          <h1 style={pageTitleStyle}>Edit Note</h1>
          <p>Loading…</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div style={mainContainerStyle}>
        <main style={mainContentStyle}>
          <div style={headerStyle}>
            <button onClick={handleHome} style={backButtonStyle}>Back</button>
          </div>
          <h1 style={pageTitleStyle}>Edit Note</h1>
          <p style={{ color: "#ff6b6b" }}>{error}</p>
          <button onClick={() => router.push("/dashboard")} style={buttonStyle}>Go to dashboard</button>
        </main>
      </div>
    );
  }

  return (
    <div style={mainContainerStyle}>
      <main style={mainContentStyle}>
        <div style={headerStyle}>
          <button onClick={handleHome} style={backButtonStyle}>Back</button>
        </div>

        <h1 style={pageTitleStyle}>Edit Note</h1>

        <div style={formContainerStyle}>
          <h2 style={formTitleStyle}>Update Note</h2>
          <form onSubmit={handleSave}>
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
                placeholder="Write your note here..."
                required
                rows={5}
                style={inputStyle}
              />
            </div>

            <button type="submit" style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={handleCancel} style={cancelButtonStyle}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              style={{ ...dangerButtonStyle, opacity: deleting ? 0.7 : 1 }}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete Note"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------- tiny helpers ------------------------------- */
function toISODateOnly(value) {
  if (!value) return "";
  // Firestore Timestamp?
  if (value?.toDate) {
    const d = value.toDate();
    return formatYMD(d);
  }
  // JS Date or string
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return formatYMD(d);
}

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------------------------------- styles --------------------------------- */
// (reused from your Add Note page)
const mainContainerStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  backgroundColor: "#1e1e1e",
  color: "#fff",
  minHeight: "100vh",
  padding: "40px",
};

const mainContentStyle = {
  maxWidth: "800px",
  width: "100%",
  backgroundColor: "#121212",
  padding: "20px",
  borderRadius: "10px",
  boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const backButtonStyle = {
  backgroundColor: "#f44336",
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  fontSize: "14px",
  cursor: "pointer",
  borderRadius: "6px",
};

const pageTitleStyle = {
  fontSize: "32px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "20px",
};

const formContainerStyle = {
  backgroundColor: "#222",
  padding: "30px",
  borderRadius: "8px",
  boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
};

const formTitleStyle = {
  fontSize: "24px",
  fontWeight: "bold",
  marginBottom: "20px",
  color: "#fff",
};

const inputContainerStyle = { marginBottom: "15px" };

const labelStyle = {
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "5px",
  display: "block",
  color: "#fff",
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "10px",
  borderRadius: "6px",
  border: "1px solid #444",
  fontSize: "14px",
  backgroundColor: "#333",
  color: "#fff",
};

const buttonStyle = {
  width: "100%",
  padding: "12px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "20px",
};

const cancelButtonStyle = {
  width: "100%",
  padding: "12px",
  backgroundColor: "#9e9e9e",
  color: "#111",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "10px",
};

const dangerButtonStyle = {
  width: "100%",
  padding: "12px",
  backgroundColor: "#e53935",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "800",
  cursor: "pointer",
  marginTop: "10px",
};
