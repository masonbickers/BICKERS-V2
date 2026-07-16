"use client";

import layoutStyles from "./page.styles.module.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { signOut } from "firebase/auth";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { Check, StickyNote } from "lucide-react";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";

export default function NoteForm() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const today = new Date().toISOString().split("T")[0];

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
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "load note form employees" });
      setEmployees([]);
      return;
    }

    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        setEmployees(
          snapshot.docs
            .map((d) => ({ id: d.id, name: d.data().name }))
            .filter((item) => item.name)
        );
      } catch (err) {
        console.error("Failed to load employees", err);
      }
    };
    fetchEmployees();
  }, [accessKey, dataAccessState]);

  const canSubmit = useMemo(() => {
    if (saving) return false;
    if (!noteText.trim()) return false;
    if (blocksEmployeeBooking && !employee) return false;
    if (isMultiDay) return !!startDate && !!endDate;
    return !!noteDate;
  }, [saving, noteText, blocksEmployeeBooking, employee, isMultiDay, startDate, endDate, noteDate]);

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

      alert("Note saved!");
      router.push("/dashboard");
    } catch (err) {
      console.error("Error saving note:", err);
      alert("Failed to save note.");
      setSaving(false);
    }
  };

  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  const handleCancel = () => {
    router.push("/dashboard");
  };

  return (
    <div style={pageWrap}>
      <main style={card}>
        <div className={layoutStyles.extracted1}>
          <div className={layoutStyles.extracted2}>
            <span style={iconBox}>
              <StickyNote size={18} />
            </span>
            <div>
              <div style={eyebrow}>Dashboard note</div>
              <h1 style={title}>Add Note</h1>
            </div>
          </div>
          <button onClick={handleHome} style={secondaryBtn} type="button">
            Back
          </button>
        </div>

        <form onSubmit={handleSubmit} className={layoutStyles.extracted3}>
          <div className={layoutStyles.extracted4}>
            <div className={layoutStyles.extracted5}>
              <label className={layoutStyles.extracted6}>Employee</label>
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

            <div className={layoutStyles.extracted7}>
              <label className={layoutStyles.extracted8}>Note Type</label>
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

          {!isMultiDay ? (
            <div className={layoutStyles.extracted9}>
              <label className={layoutStyles.extracted10}>Date</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                style={noteDate === today ? todayInput : input}
                required
              />
            </div>
          ) : (
            <div className={layoutStyles.extracted11}>
              <div className={layoutStyles.extracted12}>
                <label className={layoutStyles.extracted13}>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={startDate === today ? todayInput : input}
                  required
                />
              </div>

              <div className={layoutStyles.extracted14}>
                <label className={layoutStyles.extracted15}>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={endDate === today ? todayInput : input}
                  required
                />
              </div>
            </div>
          )}

          <div className={layoutStyles.extracted16}>
            <label className={layoutStyles.extracted17}>Note</label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Write note..."
              rows={4}
              style={{ ...input, resize: "vertical", paddingTop: 12 }}
              required
            />
          </div>

          <div className={layoutStyles.extracted18}>
            <button type="button" onClick={handleCancel} style={secondaryBtn}>
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
      </main>
    </div>
  );
}

const UI = UI_TOKENS;

const pageWrap = {
  minHeight: "100vh",
  background: "var(--color-canvas)",
  padding: "16px",
  color: UI.text,
};

const card = {
  maxWidth: 720,
  width: "100%",
  margin: "0 auto",
  background: "var(--color-surface)",
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
  padding: 14,
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: "1px solid var(--color-border)",
  flexWrap: "wrap",
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

const title = {
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 900,
  margin: 0,
  color: UI.text,
};

const form = {
  display: "grid",
  gap: 12,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const todayInput = {
  ...input,
  border: "1px solid rgba(31,75,122,0.72)",
  backgroundColor: "color-mix(in srgb, var(--color-canvas) 95%, transparent)",
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
