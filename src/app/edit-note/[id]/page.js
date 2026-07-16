"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "../../../../firebaseConfig";
import { signOut } from "firebase/auth";
import {
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

/* ----------------------------- Page Component ----------------------------- */
export default function EditNotePage() {
  const router = useRouter();
  const { id } = useParams(); // note id from URL
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // form state
  const [employee, setEmployee] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [noteText, setNoteText] = useState("");
  const [blocksEmployeeBooking, setBlocksEmployeeBooking] = useState(false);

  // lists
  const [employees, setEmployees] = useState([]);

  /* --------------------------- fetch employees list --------------------------- */
  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "load edit note employees" });
      setEmployees([]);
      return;
    }

    (async () => {
      try {
        const snapshot = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data()?.name || "",
        }));
        setEmployees(data);
      } catch (e) {
        console.error("Failed to fetch employees:", e);
      }
    })();
  }, [accessKey, dataAccessState]);

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
        setBlocksEmployeeBooking(Boolean(n.blocksEmployeeBooking));
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
      await updateDoc(ref, tenantPayload(dataAccessState, {
        employee,
        blocksEmployeeBooking,
        date: noteDate,
        text: noteText,
        updatedAt: serverTimestamp(),
      }));
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
      <div className={layoutStyles.extracted1}>
        <main className={layoutStyles.extracted2}>
          <div className={layoutStyles.extracted3}>
            <button onClick={handleHome} className={layoutStyles.extracted4}>Back</button>
          </div>
          <h1 className={layoutStyles.extracted5}>Edit Note</h1>
          <p>Loading…</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className={layoutStyles.extracted6}>
        <main className={layoutStyles.extracted7}>
          <div className={layoutStyles.extracted8}>
            <button onClick={handleHome} className={layoutStyles.extracted9}>Back</button>
          </div>
          <h1 className={layoutStyles.extracted10}>Edit Note</h1>
          <p className={layoutStyles.extracted11}>{error}</p>
          <button onClick={() => router.push("/dashboard")} className={layoutStyles.extracted12}>Go to dashboard</button>
        </main>
      </div>
    );
  }

  return (
    <div className={layoutStyles.extracted13}>
      <main className={layoutStyles.extracted14}>
        <div className={layoutStyles.extracted15}>
          <button onClick={handleHome} className={layoutStyles.extracted16}>Back</button>
        </div>

        <h1 className={layoutStyles.extracted17}>Edit Note</h1>

        <div className={layoutStyles.extracted18}>
          <h2 className={layoutStyles.extracted19}>Update Note</h2>
          <form onSubmit={handleSave}>
            <div className={layoutStyles.extracted20}>
              <label className={layoutStyles.extracted21}>Employee (optional)</label>
              <select
                value={employee}
                onChange={(e) => {
                  setEmployee(e.target.value);
                  if (!e.target.value) setBlocksEmployeeBooking(false);
                }}
                className={layoutStyles.extracted22}
              >
                <option value="">No one specific</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <label className={layoutStyles.extracted23}>
              <input
                type="checkbox"
                checked={blocksEmployeeBooking}
                onChange={(e) => setBlocksEmployeeBooking(e.target.checked)}
                disabled={!employee}
              />
              <span>Mark employee unavailable for bookings</span>
            </label>

            <div className={layoutStyles.extracted24}>
              <label className={layoutStyles.extracted25}>Date</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                required
                className={layoutStyles.extracted26}
              />
            </div>

            <div className={layoutStyles.extracted27}>
              <label className={layoutStyles.extracted28}>Note Text</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your note here..."
                required
                rows={5}
                className={layoutStyles.extracted29}
              />
            </div>

            <button type="submit" style={{ ...buttonStyle, opacity: saving ? 0.7 : 1 }} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={handleCancel} className={layoutStyles.extracted30}>
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
  backgroundColor: "var(--shell-sidebar-bg)",
  color: "var(--color-white)",
  minHeight: "100vh",
  padding: "40px",
};

const mainContentStyle = {
  maxWidth: "800px",
  width: "100%",
  backgroundColor: "var(--shell-sidebar-bg)",
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
  backgroundColor: "var(--color-warning)",
  color: "var(--color-white)",
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
  backgroundColor: "var(--shell-sidebar-bg)",
  padding: "30px",
  borderRadius: "8px",
  boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
};

const formTitleStyle = {
  fontSize: "24px",
  fontWeight: "bold",
  marginBottom: "20px",
  color: "var(--color-white)",
};

const inputContainerStyle = { marginBottom: "15px" };

const labelStyle = {
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "5px",
  display: "block",
  color: "var(--color-white)",
};

const checkRowStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 15,
  color: "var(--color-white)",
  fontSize: 14,
  fontWeight: 700,
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "10px",
  borderRadius: "6px",
  border: "1px solid var(--color-brand-hover)",
  fontSize: "14px",
  backgroundColor: "var(--shell-sidebar-bg)",
  color: "var(--color-white)",
};

const buttonStyle = {
  width: "100%",
  padding: "12px",
  backgroundColor: "var(--color-info)",
  color: "var(--color-white)",
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
  backgroundColor: "var(--color-success-accent)",
  color: "var(--color-text)",
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
  backgroundColor: "var(--color-warning)",
  color: "var(--color-white)",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "800",
  cursor: "pointer",
  marginTop: "10px",
};
