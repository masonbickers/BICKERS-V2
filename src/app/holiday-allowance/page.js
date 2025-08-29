"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, updateDoc, addDoc, deleteDoc, doc as fsDoc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import format from "date-fns/format";

// ---------- helpers ----------
const thisYear = new Date().getFullYear();
const DEFAULT_ALLOWANCE = 11;

// count Mon–Fri between two dates inclusive
function countWeekdays(start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// normalize name field from various employee docs
function pickName(x = {}) {
  return x.name || x.fullName || x.employee || x.employeeName || x.displayName || "";
}

// ---------- page ----------
export default function EmployeesAdminPage() {
  const [loading, setLoading] = useState(true);

  // employees from Firestore
  const [rows, setRows] = useState([]); // [{id,name,holidayAllowance,carriedOverDays}]
  const [edits, setEdits] = useState({}); // {id: {name,holidayAllowance,carriedOverDays}}
  const [saving, setSaving] = useState({}); // {id: boolean}

  // computed usage from holidays by name (this year)
  const [usedByName, setUsedByName] = useState({}); // {name: number}

  // UI
  const [q, setQ] = useState("");

  // add form
  const [newName, setNewName] = useState("");
  const [newAllowance, setNewAllowance] = useState(DEFAULT_ALLOWANCE);
  const [newCarry, setNewCarry] = useState(0);
  const [adding, setAdding] = useState(false);

  // load employees + usage
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Employees
        const empSnap = await getDocs(collection(db, "employees"));
        const list = empSnap.docs.map((d) => {
          const x = d.data() || {};
          return {
            id: d.id,
            name: pickName(x),
            holidayAllowance: Number(x.holidayAllowance ?? DEFAULT_ALLOWANCE),
            carriedOverDays: Number(x.carriedOverDays ?? 0),
          };
        });

        // Holidays usage (by name)
        const holSnap = await getDocs(collection(db, "holidays"));
        const used = {};
        holSnap.docs.forEach((d) => {
          const x = d.data() || {};
          const name = x.employee;
          if (!name || !x.startDate || !x.endDate) return;
          const start = new Date(x.startDate);
          const end = new Date(x.endDate);
          if (start.getFullYear() !== end.getFullYear()) return; // ignore cross-year
          if (start.getFullYear() !== thisYear) return; // only current year

          const days = countWeekdays(start, end);
          used[name] = (used[name] || 0) + days;
        });

        setRows(list);
        setUsedByName(used);

        // seed edit buffers
        const seed = {};
        for (const r of list) {
          seed[r.id] = {
            name: r.name,
            holidayAllowance: r.holidayAllowance,
            carriedOverDays: r.carriedOverDays,
          };
        }
        setEdits(seed);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(term));
  }, [rows, q]);

  const balanceFor = (r) => {
    const used = usedByName[r.name] || 0;
    const e = edits[r.id] || {};
    const allowance = Number(e.holidayAllowance ?? r.holidayAllowance ?? DEFAULT_ALLOWANCE);
    const carry = Number(e.carriedOverDays ?? r.carriedOverDays ?? 0);
    return allowance + carry - used;
  };

  const onEdit = (id, key, val) => {
    setEdits((p) => ({
      ...p,
      [id]: {
        ...p[id],
        [key]: key === "name" ? val : Number(val),
      },
    }));
  };

  const saveRow = async (r) => {
    const e = edits[r.id] || {};
    const name = (e.name ?? r.name).trim();
    const allowance = Number(e.holidayAllowance ?? r.holidayAllowance ?? DEFAULT_ALLOWANCE);
    const carry = Number(e.carriedOverDays ?? r.carriedOverDays ?? 0);

    if (!name) return alert("Name is required.");
    if (allowance < 0 || carry < 0) return alert("Numbers must be ≥ 0.");

    setSaving((p) => ({ ...p, [r.id]: true }));
    try {
      await updateDoc(fsDoc(db, "employees", r.id), {
        name,
        holidayAllowance: allowance,
        carriedOverDays: carry,
      });

      // reflect in table
      setRows((list) =>
        list.map((row) =>
          row.id === r.id ? { ...row, name, holidayAllowance: allowance, carriedOverDays: carry } : row
        )
      );
      alert(`Saved ${name}.`);
    } catch (e2) {
      alert(`Failed to save: ${e2?.message || e2}`);
    } finally {
      setSaving((p) => ({ ...p, [r.id]: false }));
    }
  };

  const deleteRow = async (r) => {
    if (!confirm(`Delete employee "${r.name}"? This removes their allowance record.`)) return;
    setSaving((p) => ({ ...p, [r.id]: true }));
    try {
      await deleteDoc(fsDoc(db, "employees", r.id));
      setRows((list) => list.filter((x) => x.id !== r.id));
      const cp = { ...edits };
      delete cp[r.id];
      setEdits(cp);
      alert("Deleted.");
    } catch (e2) {
      alert(`Failed to delete: ${e2?.message || e2}`);
    } finally {
      setSaving((p) => ({ ...p, [r.id]: false }));
    }
  };

  const addEmployee = async () => {
    const name = newName.trim();
    const allowance = Number(newAllowance);
    const carry = Number(newCarry);

    if (!name) return alert("Name is required.");
    if (allowance < 0 || carry < 0) return alert("Numbers must be ≥ 0.");

    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "employees"), {
        name,
        holidayAllowance: allowance,
        carriedOverDays: carry,
      });
      const newRow = { id: docRef.id, name, holidayAllowance: allowance, carriedOverDays: carry };
      setRows((l) => [newRow, ...l]);
      setEdits((p) => ({ ...p, [docRef.id]: { ...newRow } }));
      setNewName("");
      setNewAllowance(DEFAULT_ALLOWANCE);
      setNewCarry(0);
      alert("Employee added.");
    } catch (e2) {
      alert(`Failed to add: ${e2?.message || e2}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: 32, minHeight: "100vh", background: "#f4f4f5" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Employees — Holiday Allowances</h1>

        {/* Add employee */}
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Add Employee</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              style={inputText}
            />
            <input
              type="number"
              min={0}
              value={newAllowance}
              onChange={(e) => setNewAllowance(e.target.value)}
              placeholder="Allowance"
              style={inputNum}
            />
            <input
              type="number"
              min={0}
              value={newCarry}
              onChange={(e) => setNewCarry(e.target.value)}
              placeholder="Carried Over"
              style={inputNum}
            />
            <button onClick={addEmployee} disabled={adding} style={btnPrimary}>
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search employees…"
              style={{ ...inputText, maxWidth: 360 }}
            />
            <div style={{ color: "#6b7280" }}>
              Current Year: <strong>{thisYear}</strong>
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ ...card, marginTop: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Allowance</th>
                <th style={th}>Carry Over</th>
                <th style={th}>Total</th>
                <th style={th}>Used ({thisYear})</th>
                <th style={th}>Balance</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={7}>Loading…</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td style={td} colSpan={7}>No employees found.</td></tr>
              ) : (
                filteredRows.map((r) => {
                  const e = edits[r.id] || {};
                  const name = e.name ?? r.name;
                  const allowance = Number(e.holidayAllowance ?? r.holidayAllowance ?? DEFAULT_ALLOWANCE);
                  const carry = Number(e.carriedOverDays ?? r.carriedOverDays ?? 0);
                  const used = usedByName[r.name] || 0;
                  const total = allowance + carry;
                  const balance = total - used;

                  return (
                    <tr key={r.id}>
                      <td style={td}>
                        <input
                          value={name}
                          onChange={(ev) => onEdit(r.id, "name", ev.target.value)}
                          style={{ ...inputText, minWidth: 200 }}
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="number"
                          min={0}
                          value={allowance}
                          onChange={(ev) => onEdit(r.id, "holidayAllowance", ev.target.value)}
                          style={inputNum}
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="number"
                          min={0}
                          value={carry}
                          onChange={(ev) => onEdit(r.id, "carriedOverDays", ev.target.value)}
                          style={inputNum}
                        />
                      </td>
                      <td style={td}>{total}</td>
                      <td style={td}>{used}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{balance}</td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button onClick={() => saveRow(r)} disabled={!!saving[r.id]} style={btnPrimary}>
                            {saving[r.id] ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => deleteRow(r)} disabled={!!saving[r.id]} style={btnDanger}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
            Tip: “Used” is calculated from the <code>holidays</code> collection (Mon–Fri only, {thisYear}).
            Make sure <code>holidays.employee</code> exactly matches the employee’s <code>name</code> here.
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

// ---------- styles ----------
const card = {
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  padding: 16,
};

const th = {
  textAlign: "left",
  borderBottom: "2px solid #e5e7eb",
  padding: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
  background: "#f8fafc",
};

const td = {
  borderBottom: "1px solid #f1f5f9",
  padding: 10,
  verticalAlign: "middle",
};

const inputText = {
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "8px 10px",
  outline: "none",
  background: "#fff",
};

const inputNum = {
  ...inputText,
  width: 110,
};

const btnPrimary = {
  background: "#111827",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "8px 12px",
  cursor: "pointer",
};

const btnDanger = {
  background: "#ef4444",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "8px 12px",
  cursor: "pointer",
};
