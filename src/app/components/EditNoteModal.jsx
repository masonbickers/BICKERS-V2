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
  updateDoc,
  where,
} from "firebase/firestore";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { Check, StickyNote, Trash2, X } from "lucide-react";

export default function EditNoteModal({ id, onClose }) {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [employee, setEmployee] = useState("");
  const [noteText, setNoteText] = useState("");
  const [blocksEmployeeBooking, setBlocksEmployeeBooking] = useState(false);

  const [isMultiDay, setIsMultiDay] = useState(false);
  const [noteDate, setNoteDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "notes", operation: "load edit note" });
      onClose?.();
      return;
    }

    const load = async () => {
      const [noteSnap, employeeSnap] = await Promise.all([
        getDoc(doc(db, "notes", id)),
        getDocs(tenantCollectionQuery(db, "employees", dataAccessState)),
      ]);

      if (noteSnap.exists()) {
        const data = noteSnap.data() || {};
        setEmployee(data.employee || "");
        setNoteText(data.text || "");
        setBlocksEmployeeBooking(Boolean(data.blocksEmployeeBooking));

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
  }, [accessKey, dataAccessState, id, onClose]);

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
      const snap = await getDocs(
        tenantCollectionQuery(db, "notes", dataAccessState, [where("date", "==", date)])
      );
      noteDocs = noteDocs.concat(snap.docs);
    }

    return noteDocs;
  };

  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!noteText.trim()) return false;
    if (blocksEmployeeBooking && !employee) return false;

    if (isMultiDay) return !!startDate && !!endDate;
    return !!noteDate;
  }, [saving, noteText, blocksEmployeeBooking, employee, isMultiDay, startDate, endDate, noteDate]);

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
          await updateDoc(doc(db, "notes", noteDoc.id), tenantPayload(dataAccessState, {
            employee: employee || "",
            blocksEmployeeBooking,
            date: noteDoc.data()?.date || "",
            text: noteText.trim(),
            startDate,
            endDate,
            isMultiDay: true,
            updatedAt: new Date(),
          }));
        }

        for (const date of range) {
          if (existingDates.has(date)) continue;
          await addDoc(collection(db, "notes"), tenantPayload(dataAccessState, {
            employee: employee || "",
            blocksEmployeeBooking,
            date,
            text: noteText.trim(),
            startDate,
            endDate,
            isMultiDay: true,
            createdAt: new Date(),
          }));
        }
      } else {
        if (!noteDate) {
          alert("Please select a date.");
          setSaving(false);
          return;
        }

        await updateDoc(doc(db, "notes", id), tenantPayload(dataAccessState, {
          employee: employee || "",
          blocksEmployeeBooking,
          date: noteDate,
          text: noteText.trim(),
          isMultiDay: false,
          startDate: "",
          endDate: "",
          updatedAt: new Date(),
        }));
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
          <div style={titleRow}>
            <span style={iconBox}>
              <StickyNote size={18} />
            </span>
            <div>
              <div style={eyebrow}>Dashboard note</div>
              <h2 style={modalTitle}>Edit Note</h2>
            </div>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={form}>
          <div style={formGrid}>
            <div style={fieldGroup}>
              <label style={label}>Employee</label>
              <select
                value={employee}
                onChange={(e) => {
                  setEmployee(e.target.value);
                  if (!e.target.value) setBlocksEmployeeBooking(false);
                }}
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

            <div style={fieldGroup}>
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
          </div>

          <label style={{ ...checkRow, opacity: employee ? 1 : 0.62 }}>
            <input
              type="checkbox"
              checked={blocksEmployeeBooking}
              onChange={(e) => setBlocksEmployeeBooking(e.target.checked)}
              disabled={!employee}
            />
            <span>Mark employee unavailable for bookings</span>
          </label>
          {blocksEmployeeBooking && !employee ? (
            <div style={helpText}>Select an employee to block bookings for this note.</div>
          ) : null}

          {!isMultiDay ? (
            <div style={fieldGroup}>
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
            <div style={formGrid}>
              <div style={fieldGroup}>
                <label style={label}>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  style={input}
                />
              </div>

              <div style={fieldGroup}>
                <label style={label}>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  style={input}
                />
              </div>
            </div>
          )}

          <div style={fieldGroup}>
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

          <div style={actions}>
            <button type="button" onClick={handleDelete} style={dangerBtn} disabled={saving}>
              <Trash2 size={15} />
              Delete note{isMultiDay ? "s" : ""}
            </button>
            <span style={{ flex: "1 1 auto" }} />
            <button type="button" onClick={onClose} style={secondaryBtn} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...primaryBtn,
                opacity: canSubmit ? 1 : 0.55,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              <Check size={15} />
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const UI = {
  brand: "var(--legacy-color-1f4b7a)",
  brandSoft: "var(--legacy-color-edf3f8)",
  brandBorder: "var(--legacy-color-c8d6e3)",
  border: "var(--legacy-color-d7dee8)",
  text: "var(--legacy-color-0f172a)",
  muted: "var(--legacy-color-5f6f82)",
  danger: "var(--legacy-color-dc2626)",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 90,
  padding: 16,
};

const modal = {
  width: "min(560px, 95vw)",
  borderRadius: 8,
  padding: 14,
  color: UI.text,
  background: "var(--legacy-color-ffffff)",
  border: `1px solid ${UI.border}`,
  boxShadow: "0 18px 46px rgba(15,23,42,0.24)",
};

const headerRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: "1px solid var(--legacy-color-e2e8f0)",
};

const titleRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const iconBox = {
  width: 38,
  height: 38,
  borderRadius: 8,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.brand,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
};

const eyebrow = {
  color: UI.muted,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginBottom: 2,
};

const modalTitle = {
  margin: 0,
  fontSize: 19,
  lineHeight: 1.1,
  fontWeight: 900,
  color: UI.text,
};

const closeBtn = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: `1px solid ${UI.border}`,
  background: "var(--legacy-color-f8fbfe)",
  color: UI.muted,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const form = {
  display: "grid",
  gap: 12,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
};

const fieldGroup = {
  display: "grid",
  gap: 6,
};

const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: "var(--legacy-color-475569)",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const checkRow = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: UI.text,
  fontSize: 13,
  fontWeight: 800,
  border: `1px solid ${UI.border}`,
  background: "var(--legacy-color-f8fbfe)",
  borderRadius: 8,
  padding: "9px 10px",
};

const helpText = {
  marginTop: -4,
  color: "var(--legacy-color-991b1b)",
  fontSize: 12,
  fontWeight: 700,
};

const input = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: 8,
  border: "1px solid var(--legacy-color-cbd5e1)",
  backgroundColor: "var(--legacy-color-ffffff)",
  color: UI.text,
  outline: "none",
  fontSize: 14,
  fontWeight: 700,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
};

const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  minWidth: 132,
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${UI.brand}`,
  background: "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--legacy-color-1f4b7a) 100%)",
  color: "var(--legacy-color-fff)",
  fontWeight: 800,
  fontSize: 13,
  boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
  cursor: "pointer",
};

const dangerBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  minWidth: 124,
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--legacy-color-fecaca)",
  background: "var(--legacy-color-fef2f2)",
  color: "var(--legacy-color-991b1b)",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const secondaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 98,
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, var(--legacy-color-ffffff) 0%, var(--legacy-color-f8fbfe) 100%)",
  color: UI.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const actions = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  paddingTop: 2,
};
