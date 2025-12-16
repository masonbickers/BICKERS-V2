"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  doc as fsDoc,
} from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";

/* ────────────────────────────────────────────────────────────────
   CONFIG
──────────────────────────────────────────────────────────────── */
const thisYear = new Date().getFullYear();
const nextYear = thisYear + 1;

const MAX_CARRY = 5;
const DEFAULT_PATTERN = "full_time";

// Base entitlement rules (Full time = 22)
const BASE_FULL_TIME = 22;
const ENTITLEMENT = {
  full_time: BASE_FULL_TIME,
  four_days: BASE_FULL_TIME * (4 / 5),
  three_days: BASE_FULL_TIME * (3 / 5),
};

const PATTERN_LABEL = {
  full_time: "Full time",
  four_days: "4 days / week",
  three_days: "3 days / week",
};

function entitlementFor(pattern) {
  const v = ENTITLEMENT[pattern] ?? ENTITLEMENT.full_time;
  // rounded to whole days (change to Math.round(v * 2)/2 if you want halves)
  return Math.round(v);
}

/* ────────────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────────── */
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

function pickName(x = {}) {
  return (
    x.name ||
    x.fullName ||
    x.employee ||
    x.employeeName ||
    x.displayName ||
    ""
  );
}

const asNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ────────────────────────────────────────────────────────────────
   PAGE
──────────────────────────────────────────────────────────────── */
export default function EmployeesAdminPage() {
  const [loading, setLoading] = useState(true);

  // Year being viewed/edited
  const [yearView, setYearView] = useState(thisYear);

  // Employees list (raw rows from Firestore, normalised)
  const [rows, setRows] = useState([]); // [{id,name,workPattern,holidayAllowances,carryOverByYear,holidayAllowance,carriedOverDays}]
  const [saving, setSaving] = useState({}); // { [id]: bool }

  // Edit buffer
  const [edits, setEdits] = useState({}); // { [id]: { name, workPattern, byYear: { [year]: { holidayAllowance, carriedOverDays } } } }

  // Holiday usage per year per name: { [year]: { [employeeName]: usedDays } }
  const [usedByYearName, setUsedByYearName] = useState({});

  // UI filters
  const [q, setQ] = useState("");

  // Add form
  const [newName, setNewName] = useState("");
  const [newPattern, setNewPattern] = useState(DEFAULT_PATTERN);
  const [newCarry, setNewCarry] = useState(0);
  const [adding, setAdding] = useState(false);

  /* ---------------- load employees + holidays usage ---------------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Employees
        const empSnap = await getDocs(collection(db, "employees"));
        const list = empSnap.docs.map((d) => {
          const x = d.data() || {};
          const pattern = x.workPattern || DEFAULT_PATTERN;
          return {
            id: d.id,
            name: pickName(x),
            workPattern: pattern,

            // legacy (kept for compatibility)
            holidayAllowance: asNum(x.holidayAllowance, entitlementFor(pattern)),
            carriedOverDays: asNum(x.carriedOverDays, 0),

            // per-year maps
            holidayAllowances: x.holidayAllowances || {}, // { "2025": 22, ... }
            carryOverByYear: x.carryOverByYear || {}, // { "2025": 2, ... }
          };
        });

        // Holidays usage for thisYear + nextYear
        const holSnap = await getDocs(collection(db, "holidays"));
        const used = { [thisYear]: {}, [nextYear]: {} };

        holSnap.docs.forEach((d) => {
          const x = d.data() || {};
          const name = x.employee;
          if (!name || !x.startDate || !x.endDate) return;

          const start = new Date(x.startDate);
          const end = new Date(x.endDate);

          // ignore cross-year items
          if (start.getFullYear() !== end.getFullYear()) return;

          const yr = start.getFullYear();
          if (yr !== thisYear && yr !== nextYear) return;

          const days = countWeekdays(start, end);
          used[yr][name] = (used[yr][name] || 0) + days;
        });

        setRows(list);
        setUsedByYearName(used);

        // Seed edits buffer
        const seed = {};
        for (const r of list) {
          const pattern = r.workPattern || DEFAULT_PATTERN;
          const base = entitlementFor(pattern);

          const allowThis =
            r.holidayAllowances?.[String(thisYear)] !== undefined
              ? asNum(r.holidayAllowances[String(thisYear)], base)
              : asNum(r.holidayAllowance, base);

          const carryThis =
            r.carryOverByYear?.[String(thisYear)] !== undefined
              ? asNum(r.carryOverByYear[String(thisYear)], 0)
              : asNum(r.carriedOverDays, 0);

          const allowNext =
            r.holidayAllowances?.[String(nextYear)] !== undefined
              ? asNum(r.holidayAllowances[String(nextYear)], base)
              : base;

          // next-year carry defaults to auto-derive from days left this year,
          // but we *allow editing*, so initial value uses:
          // stored next-year carry OR auto-derive (capped)
          const storedNextCarry =
            r.carryOverByYear?.[String(nextYear)] !== undefined
              ? asNum(r.carryOverByYear[String(nextYear)], 0)
              : undefined;

          // compute auto carry based on this year's balance (using *stored* values)
          const usedThis = used[thisYear]?.[r.name] || 0;
          const balThis = allowThis + carryThis - usedThis;
          const autoNextCarry = clamp(balThis, 0, MAX_CARRY);

          seed[r.id] = {
            name: r.name,
            workPattern: pattern,
            byYear: {
              [thisYear]: { holidayAllowance: allowThis, carriedOverDays: carryThis },
              [nextYear]: {
                holidayAllowance: allowNext,
                carriedOverDays:
                  storedNextCarry !== undefined
                    ? clamp(storedNextCarry, 0, MAX_CARRY)
                    : autoNextCarry,
              },
            },
          };
        }
        setEdits(seed);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  /* ---------------- derived: filtered rows ---------------- */
  const filteredRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => (r.name || "").toLowerCase().includes(term));
  }, [rows, q]);

  /* ---------------- usage getter ---------------- */
  const usedForYearByName = (yr, name) => usedByYearName?.[yr]?.[name] || 0;

  /* ---------------- pattern getter ---------------- */
  const getPattern = (r) => edits?.[r.id]?.workPattern ?? r.workPattern ?? DEFAULT_PATTERN;

  /* ---------------- allowance getter ---------------- */
  const getAllowanceForYear = (r, yr) => {
    const pattern = getPattern(r);
    const fallback = entitlementFor(pattern);

    const slot = edits?.[r.id]?.byYear?.[yr] || {};
    if (slot.holidayAllowance !== undefined) return asNum(slot.holidayAllowance, fallback);

    const mapVal = r.holidayAllowances?.[String(yr)];
    if (mapVal !== undefined) return asNum(mapVal, fallback);

    return asNum(r.holidayAllowance, fallback);
  };

  /* ---------------- carry getter (editable buffer first) ---------------- */
  const getCarryForYear = (r, yr) => {
    const slot = edits?.[r.id]?.byYear?.[yr] || {};
    if (slot.carriedOverDays !== undefined) return asNum(slot.carriedOverDays, 0);

    const mapVal = r.carryOverByYear?.[String(yr)];
    if (mapVal !== undefined) return asNum(mapVal, 0);

    return asNum(r.carriedOverDays, 0);
  };

  /* ---------------- balance for a given year ---------------- */
  const balanceForYear = (r, yr) => {
    const allowance = getAllowanceForYear(r, yr);
    const carry = getCarryForYear(r, yr);
    const used = usedForYearByName(yr, r.name);
    return allowance + carry - used;
  };

  /* ---------------- edits ---------------- */
  const onEditName = (id, val) => {
    setEdits((p) => ({
      ...p,
      [id]: { ...(p[id] || {}), name: val },
    }));
  };

  const onEditPattern = (r, pattern) => {
    const id = r.id;
    const derived = entitlementFor(pattern);

    setEdits((p) => {
      const prev = p[id] || {};
      const byYear = { ...(prev.byYear || {}) };

      // When pattern changes, set both years’ allowance to derived (still manually editable after)
      byYear[thisYear] = { ...(byYear[thisYear] || {}), holidayAllowance: derived };
      byYear[nextYear] = { ...(byYear[nextYear] || {}), holidayAllowance: derived };

      return {
        ...p,
        [id]: {
          ...prev,
          workPattern: pattern,
          byYear,
        },
      };
    });
  };

  const onEditAllowance = (id, val) => {
    const yr = yearView;
    setEdits((p) => ({
      ...p,
      [id]: {
        ...(p[id] || {}),
        byYear: {
          ...((p[id] || {}).byYear || {}),
          [yr]: {
            ...(((p[id] || {}).byYear || {})[yr] || {}),
            holidayAllowance: asNum(val, 0),
          },
        },
      },
    }));
  };

  // ✅ now editable for next year too (but capped at 5)
  const onEditCarry = (r, val) => {
    const yr = yearView;
    let nextVal = asNum(val, 0);

    // cap carry over for ANY year? only next year needs hard cap at 5 per your rule
    if (yr === nextYear) nextVal = clamp(nextVal, 0, MAX_CARRY);
    else nextVal = Math.max(0, nextVal);

    setEdits((p) => ({
      ...p,
      [r.id]: {
        ...(p[r.id] || {}),
        byYear: {
          ...((p[r.id] || {}).byYear || {}),
          [yr]: {
            ...(((p[r.id] || {}).byYear || {})[yr] || {}),
            carriedOverDays: nextVal,
          },
        },
      },
    }));
  };

  /* ---------------- save ---------------- */
  const saveRow = async (r) => {
    const e = edits?.[r.id] || {};
    const name = (e.name ?? r.name ?? "").trim();
    const pattern = e.workPattern ?? r.workPattern ?? DEFAULT_PATTERN;

    if (!name) return alert("Name is required.");

    const allowance = getAllowanceForYear(r, yearView);
    const carry = getCarryForYear(r, yearView);

    if (allowance < 0 || carry < 0) return alert("Numbers must be ≥ 0.");
    if (yearView === nextYear && carry > MAX_CARRY) return alert(`Carry over cannot exceed ${MAX_CARRY} days.`);

    const yrKey = String(yearView);

    setSaving((p) => ({ ...p, [r.id]: true }));
    try {
      const nextAllowances = { ...(r.holidayAllowances || {}), [yrKey]: allowance };
      const nextCarry = { ...(r.carryOverByYear || {}), [yrKey]: carry };

      // legacy sync only for current year (keeps other pages working)
      const legacyPatch =
        yearView === thisYear
          ? { holidayAllowance: allowance, carriedOverDays: carry }
          : {};

      await updateDoc(fsDoc(db, "employees", r.id), {
        name,
        workPattern: pattern,
        holidayAllowances: nextAllowances,
        carryOverByYear: nextCarry,
        ...legacyPatch,
      });

      setRows((list) =>
        list.map((row) =>
          row.id === r.id
            ? {
                ...row,
                name,
                workPattern: pattern,
                holidayAllowances: nextAllowances,
                carryOverByYear: nextCarry,
                ...(yearView === thisYear
                  ? { holidayAllowance: allowance, carriedOverDays: carry }
                  : {}),
              }
            : row
        )
      );

      alert(`Saved ${name} (${yearView}).`);
    } catch (err) {
      alert(`Failed to save: ${err?.message || err}`);
    } finally {
      setSaving((p) => ({ ...p, [r.id]: false }));
    }
  };

  /* ---------------- delete ---------------- */
  const deleteRow = async (r) => {
    if (!confirm(`Delete employee "${r.name}"? This removes their allowance record.`)) return;

    setSaving((p) => ({ ...p, [r.id]: true }));
    try {
      await deleteDoc(fsDoc(db, "employees", r.id));

      setRows((list) => list.filter((x) => x.id !== r.id));
      setEdits((p) => {
        const cp = { ...p };
        delete cp[r.id];
        return cp;
      });

      alert("Deleted.");
    } catch (err) {
      alert(`Failed to delete: ${err?.message || err}`);
    } finally {
      setSaving((p) => ({ ...p, [r.id]: false }));
    }
  };

  /* ---------------- add employee ---------------- */
  const addEmployee = async () => {
    const name = (newName || "").trim();
    const pattern = newPattern || DEFAULT_PATTERN;
    if (!name) return alert("Name is required.");

    const allowance = entitlementFor(pattern);
    const carry = Math.max(0, asNum(newCarry, 0));

    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "employees"), {
        name,
        workPattern: pattern,

        // legacy
        holidayAllowance: allowance,
        carriedOverDays: carry,

        // per-year
        holidayAllowances: { [String(thisYear)]: allowance },
        carryOverByYear: { [String(thisYear)]: carry },
      });

      const newRow = {
        id: docRef.id,
        name,
        workPattern: pattern,
        holidayAllowance: allowance,
        carriedOverDays: carry,
        holidayAllowances: { [String(thisYear)]: allowance },
        carryOverByYear: { [String(thisYear)]: carry },
      };

      setRows((l) => [newRow, ...l]);
      setEdits((p) => ({
        ...p,
        [docRef.id]: {
          name,
          workPattern: pattern,
          byYear: {
            [thisYear]: { holidayAllowance: allowance, carriedOverDays: carry },
            [nextYear]: { holidayAllowance: allowance, carriedOverDays: 0 },
          },
        },
      }));

      setNewName("");
      setNewPattern(DEFAULT_PATTERN);
      setNewCarry(0);

      alert("Employee added.");
    } catch (err) {
      alert(`Failed to add: ${err?.message || err}`);
    } finally {
      setAdding(false);
    }
  };

  /* ---------------- render ---------------- */
  return (
    <HeaderSidebarLayout>
      <div style={{ padding: 32, minHeight: "100vh", background: "#f4f4f5" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
              Employees — Holiday Allowances
            </h1>
            <div style={{ color: "#6b7280" }}>
              Work pattern sets base allowance (Full time = 22). Carry over is capped at {MAX_CARRY} days. Next-year carry is editable.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: "#6b7280" }}>Viewing Year</div>
            <select
              value={yearView}
              onChange={(e) => setYearView(Number(e.target.value))}
              style={{ ...inputText, padding: "8px 10px", minWidth: 160 }}
            >
              <option value={thisYear}>{thisYear} (Current)</option>
              <option value={nextYear}>{nextYear} (Next)</option>
            </select>
          </div>
        </div>

        {/* Add employee */}
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Add Employee</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              style={inputText}
            />

            <select
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              style={{ ...inputText, minWidth: 180 }}
            >
              <option value="full_time">{PATTERN_LABEL.full_time}</option>
              <option value="four_days">{PATTERN_LABEL.four_days}</option>
              <option value="three_days">{PATTERN_LABEL.three_days}</option>
            </select>

            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Base allowance: <strong>{entitlementFor(newPattern)}</strong>
            </div>

            <input
              type="number"
              min={0}
              value={newCarry}
              onChange={(e) => setNewCarry(e.target.value)}
              placeholder={`Carried Over (${thisYear})`}
              style={inputNum}
            />

            <button onClick={addEmployee} disabled={adding} style={btnPrimary}>
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search employees…"
              style={{ ...inputText, maxWidth: 360 }}
            />
            <div style={{ color: "#6b7280" }}>
              Showing usage for: <strong>{yearView}</strong>
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ ...card, marginTop: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Work Pattern</th>
                <th style={th}>Allowance ({yearView})</th>
                <th style={th}>Carry Over ({yearView})</th>
                <th style={th}>Total</th>
                <th style={th}>Used ({yearView})</th>
                <th style={th}>Balance</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td style={td} colSpan={8}>
                    Loading…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td style={td} colSpan={8}>
                    No employees found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const e = edits?.[r.id] || {};
                  const name = e.name ?? r.name;

                  const pattern = e.workPattern ?? r.workPattern ?? DEFAULT_PATTERN;
                  const allowance = getAllowanceForYear(r, yearView);
                  const carry = getCarryForYear(r, yearView);
                  const used = usedForYearByName(yearView, r.name);

                  const total = allowance + carry;
                  const balance = total - used;

                  // show what their days-left-this-year are, and recommended carry
                  const balThis = balanceForYear(r, thisYear);
                  const recommendedCarry = clamp(balThis, 0, MAX_CARRY);

                  return (
                    <tr key={r.id}>
                      <td style={td}>
                        <input
                          value={name}
                          onChange={(ev) => onEditName(r.id, ev.target.value)}
                          style={{ ...inputText, minWidth: 200 }}
                        />
                      </td>

                      <td style={td}>
                        <select
                          value={pattern}
                          onChange={(ev) => onEditPattern(r, ev.target.value)}
                          style={{ ...inputText, minWidth: 180 }}
                        >
                          <option value="full_time">{PATTERN_LABEL.full_time}</option>
                          <option value="four_days">{PATTERN_LABEL.four_days}</option>
                          <option value="three_days">{PATTERN_LABEL.three_days}</option>
                        </select>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                          Base: <strong>{entitlementFor(pattern)}</strong> days
                        </div>
                      </td>

                      <td style={td}>
                        <input
                          type="number"
                          min={0}
                          value={allowance}
                          onChange={(ev) => onEditAllowance(r.id, ev.target.value)}
                          style={inputNum}
                        />
                      </td>

                      <td style={td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <input
                            type="number"
                            min={0}
                            max={yearView === nextYear ? MAX_CARRY : undefined}
                            value={carry}
                            onChange={(ev) => onEditCarry(r, ev.target.value)}
                            style={inputNum}
                          />
                          {yearView === nextYear && (
                            <div style={{ fontSize: 12, color: "#6b7280" }}>
                              Recommended (from {thisYear} balance): <strong>{recommendedCarry}</strong>{" "}
                              <span style={{ marginLeft: 6 }}>
                                (balance {thisYear}: {balThis})
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td style={td}>{total}</td>
                      <td style={td}>{used}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{balance}</td>

                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => saveRow(r)}
                            disabled={!!saving[r.id]}
                            style={btnPrimary}
                          >
                            {saving[r.id] ? "Saving…" : `Save (${yearView})`}
                          </button>
                          <button
                            onClick={() => deleteRow(r)}
                            disabled={!!saving[r.id]}
                            style={btnDanger}
                          >
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

          <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12, lineHeight: 1.5 }}>
            <div>
              Tip: “Used” is calculated from the <code>holidays</code> collection (Mon–Fri only). Ensure <code>holidays.employee</code> matches the employee’s <code>name</code> exactly.
            </div>
            <div>
              Carry over into next year is capped at <strong>{MAX_CARRY}</strong> days. You can edit it (e.g. override the recommended amount).
            </div>
          </div>
        </div>

        {/* What happens when next year comes */}
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>What happens when the year changes?</h3>
          <div style={{ color: "#374151", lineHeight: 1.6 }}>
            <div style={{ marginBottom: 10 }}>
              On <strong>1 January {nextYear}</strong>, the page automatically treats {nextYear} as the “current year”
              (because <code>thisYear</code> is based on <code>new Date().getFullYear()</code>).
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Your saved values in <code>employees.holidayAllowances["{nextYear}"]</code> and{" "}
                <code>employees.carryOverByYear["{nextYear}"]</code> become the active allowance + carry for that year.
              </li>
              <li>
                The dropdown will then show <strong>{nextYear}</strong> as “Current” and <strong>{nextYear + 1}</strong> as “Next”.
              </li>
              <li>
                You can pre-fill {nextYear + 1} at the end of {nextYear} the same way you’re doing now.
              </li>
            </ul>
            <div style={{ marginTop: 10, color: "#6b7280" }}>
              Note: your other pages that still rely on the legacy fields (<code>holidayAllowance</code>,{" "}
              <code>carriedOverDays</code>) will only stay correct if they’re updated to read from the per-year maps too.
              Right now this page only keeps legacy fields in sync for the current year you’re editing.
            </div>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ────────────────────────────────────────────────────────────────
   STYLES
──────────────────────────────────────────────────────────────── */
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
  width: 160,
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
