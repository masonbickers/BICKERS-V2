// src/app/components/create-note.jsx
"use client";

import layoutStyles from "./create-note.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { Check, StickyNote, X } from "lucide-react";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";

export default function CreateNote({ onClose, onSaved, defaultDate = "" }) {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [employee, setEmployee] = useState("");
  const [noteText, setNoteText] = useState("");
  const [blocksEmployeeBooking, setBlocksEmployeeBooking] = useState(false);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [noteDate, setNoteDate] = useState(defaultDate || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "load note employees" });
      setEmployees([]);
      return;
    }

    const fetchEmployees = async () => {
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        const list = snap.docs
          .map((d) => ({ id: d.id, name: d.data()?.name }))
          .filter((x) => x.name);
        setEmployees(list);
      } catch (e) {
        console.error("Failed to fetch employees:", e);
      }
    };
    fetchEmployees();
  }, [accessKey, dataAccessState]);

  const getDateRange = (start, end) => {
    const arr = [];
    const d = new Date(start);
    const last = new Date(end);

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
    if (blocksEmployeeBooking && !employee) return false;
    if (isMultiDay) return !!startDate && !!endDate;
    return !!noteDate;
  }, [saving, noteText, blocksEmployeeBooking, employee, isMultiDay, startDate, endDate, noteDate]);

  const handleBack = () => {
    if (typeof onClose === "function") return onClose();
    router.push("/dashboard");
  };

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
          alert("Select both start and end dates.");
          setSaving(false);
          return;
        }

        const s = new Date(startDate);
        const ed = new Date(endDate);
        if (Number.isNaN(+s) || Number.isNaN(+ed) || s > ed) {
          alert("End date must be the same or after start date.");
          setSaving(false);
          return;
        }

        const range = getDateRange(startDate, endDate);

        for (const date of range) {
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

        await addDoc(collection(db, "notes"), tenantPayload(dataAccessState, {
          employee: employee || "",
          blocksEmployeeBooking,
          date: noteDate,
          text: noteText.trim(),
          isMultiDay: false,
          createdAt: new Date(),
        }));
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
    <div className={layoutStyles.extracted1}>
      <div style={modal}>
        <div className={layoutStyles.extracted2}>
          <div className={layoutStyles.extracted3}>
            <span style={iconBox}>
              <StickyNote size={18} />
            </span>
            <div>
              <div style={eyebrow}>Dashboard note</div>
              <h2 style={modalTitle}>Add Note</h2>
            </div>
          </div>
          <button onClick={handleBack} style={closeBtn} aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={layoutStyles.extracted4}>
          <div className={layoutStyles.extracted5}>
            <div className={layoutStyles.extracted6}>
              <label className={layoutStyles.extracted7}>Employee</label>
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

            <div className={layoutStyles.extracted8}>
              <label className={layoutStyles.extracted9}>Note Type</label>
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
            <div className={layoutStyles.extracted10}>Select an employee to block bookings for this note.</div>
          ) : null}

          {!isMultiDay ? (
            <div className={layoutStyles.extracted11}>
              <label className={layoutStyles.extracted12}>Date</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                required
                style={input}
              />
            </div>
          ) : (
            <div className={layoutStyles.extracted13}>
              <div className={layoutStyles.extracted14}>
                <label className={layoutStyles.extracted15}>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  style={input}
                />
              </div>

              <div className={layoutStyles.extracted16}>
                <label className={layoutStyles.extracted17}>End Date</label>
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

          <div className={layoutStyles.extracted18}>
            <label className={layoutStyles.extracted19}>Note</label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="Write note..."
              required
              style={{ ...input, resize: "vertical", paddingTop: 12 }}
            />
          </div>

          <div className={layoutStyles.extracted20}>
            <button type="button" onClick={handleBack} style={secondaryBtn}>
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
              {saving ? "Saving..." : "Save Note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const UI = UI_TOKENS;

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
  background: "var(--color-surface)",
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
  borderBottom: "1px solid var(--color-border)",
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
  background: "var(--color-surface-subtle)",
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
  color: "var(--color-text-muted)",
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
  background: "var(--color-surface-subtle)",
  borderRadius: 8,
  padding: "9px 10px",
};

const helpText = {
  marginTop: -4,
  color: "var(--color-danger)",
  fontSize: 12,
  fontWeight: 700,
};

const input = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: 8,
  border: "1px solid var(--color-border-strong)",
  backgroundColor: "var(--color-surface)",
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
  background: "linear-gradient(180deg, var(--color-brand-hover) 0%, var(--color-brand) 100%)",
  color: "var(--color-white)",
  fontWeight: 800,
  fontSize: 13,
  boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
};

const secondaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 98,
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${UI.brandBorder}`,
  background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-subtle) 100%)",
  color: UI.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
};

const actions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
  paddingTop: 2,
};
