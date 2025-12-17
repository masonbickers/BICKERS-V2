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
  return x.name || x.fullName || x.employee || x.employeeName || x.displayName || "";
}

const asNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ────────────────────────────────────────────────────────────────
   MINI DESIGN SYSTEM (matches your newer pages)
──────────────────────────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 18,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  shadowHover: "0 10px 24px rgba(0,0,0,0.10)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "#eff6ff",
  danger: "#ef4444",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };

const card = {
  background: UI.card,
  borderRadius: UI.radius,
  border: UI.border,
  boxShadow: UI.shadowSm,
};

const cardPad = { padding: 14 };

const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 900,
};

const input = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: UI.radiusSm,
  padding: "10px 12px",
  outline: "none",
  background: "#fff",
  fontSize: 14,
};

const inputNum = { ...input, width: 140 };

const select = { ...input, fontWeight: 800 };

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: UI.text,
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  if (kind === "danger") {
    return {
      padding: "10px 12px",
      borderRadius: UI.radiusSm,
      border: "1px solid #fecaca",
      background: "#fee2e2",
      color: "#7f1d1d",
      fontWeight: 900,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    padding: "10px 12px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: UI.brand,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
};

function Pill({ tone = "default", children }) {
  const tones = {
    default: { bg: "#f3f4f6", fg: "#111827", br: "#e5e7eb" },
    good: { bg: "#dcfce7", fg: "#14532d", br: "#bbf7d0" },
    warn: { bg: "#fff7ed", fg: "#7c2d12", br: "#fed7aa" },
    bad: { bg: "#fee2e2", fg: "#7f1d1d", br: "#fecaca" },
    info: { bg: "#e0f2fe", fg: "#0c4a6e", br: "#bae6fd" },
    gray: { bg: "#e5e7eb", fg: "#374151", br: "#d1d5db" },
  };
  const t = tones[tone] || tones.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.br}`,
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function StatTile({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "#fff", br: "#e5e7eb" },
    soft: { bg: UI.brandSoft, br: "#dbeafe" },
    warn: { bg: "#fff7ed", br: "#fed7aa" },
  };
  const t = tones[tone] || tones.default;
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.br}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950, color: UI.text }}>{value}</div>
    </div>
  );
}

function balanceTone(bal) {
  if (bal < 0) return "bad";
  if (bal <= 2) return "warn";
  return "good";
}

/* ────────────────────────────────────────────────────────────────
   PAGE
──────────────────────────────────────────────────────────────── */
export default function EmployeesAdminPage() {
  const [loading, setLoading] = useState(true);

  // Year being viewed/edited
  const [yearView, setYearView] = useState(thisYear);

  // Employees list (raw rows from Firestore, normalised)
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState({});

  // Edit buffer
  const [edits, setEdits] = useState({});

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
            holidayAllowances: x.holidayAllowances || {},
            carryOverByYear: x.carryOverByYear || {},
          };
        });

        const holSnap = await getDocs(collection(db, "holidays"));
        const used = { [thisYear]: {}, [nextYear]: {} };

        holSnap.docs.forEach((d) => {
          const x = d.data() || {};
          const name = x.employee;
          if (!name || !x.startDate || !x.endDate) return;

          const start = new Date(x.startDate);
          const end = new Date(x.endDate);

          if (start.getFullYear() !== end.getFullYear()) return;

          const yr = start.getFullYear();
          if (yr !== thisYear && yr !== nextYear) return;

          const days = countWeekdays(start, end);
          used[yr][name] = (used[yr][name] || 0) + days;
        });

        setRows(list);
        setUsedByYearName(used);

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

          const storedNextCarry =
            r.carryOverByYear?.[String(nextYear)] !== undefined
              ? asNum(r.carryOverByYear[String(nextYear)], 0)
              : undefined;

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
                  storedNextCarry !== undefined ? clamp(storedNextCarry, 0, MAX_CARRY) : autoNextCarry,
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

  /* ---------------- carry getter ---------------- */
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
    setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), name: val } }));
  };

  const onEditPattern = (r, pattern) => {
    const id = r.id;
    const derived = entitlementFor(pattern);

    setEdits((p) => {
      const prev = p[id] || {};
      const byYear = { ...(prev.byYear || {}) };

      byYear[thisYear] = { ...(byYear[thisYear] || {}), holidayAllowance: derived };
      byYear[nextYear] = { ...(byYear[nextYear] || {}), holidayAllowance: derived };

      return { ...p, [id]: { ...prev, workPattern: pattern, byYear } };
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

  const onEditCarry = (r, val) => {
    const yr = yearView;
    let nextVal = asNum(val, 0);

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

      const legacyPatch = yearView === thisYear ? { holidayAllowance: allowance, carriedOverDays: carry } : {};

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
                ...(yearView === thisYear ? { holidayAllowance: allowance, carriedOverDays: carry } : {}),
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

  /* ---------------- derived KPIs ---------------- */
  const kpis = useMemo(() => {
    const totalPeople = filteredRows.length;
    let totalAllowance = 0;
    let totalCarry = 0;
    let totalUsed = 0;

    filteredRows.forEach((r) => {
      totalAllowance += getAllowanceForYear(r, yearView);
      totalCarry += getCarryForYear(r, yearView);
      totalUsed += usedForYearByName(yearView, r.name);
    });

    const total = totalAllowance + totalCarry;
    const totalBalance = total - totalUsed;

    return {
      people: totalPeople,
      totalAllowance: Number(totalAllowance.toFixed(0)),
      totalCarry: Number(totalCarry.toFixed(0)),
      totalUsed: Number(totalUsed.toFixed(0)),
      totalBalance: Number(totalBalance.toFixed(0)),
    };
  }, [filteredRows, yearView, edits, usedByYearName]);

  /* ---------------- render ---------------- */
  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Employees — Holiday Allowances</h1>
            <div style={sub}>
              Work pattern sets base allowance (<b>Full time = 22</b>). Carry over is capped at <b>{MAX_CARRY}</b> days.
              Next-year carry is editable.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={chip}>Viewing: {yearView}</span>
            <select
              value={yearView}
              onChange={(e) => setYearView(Number(e.target.value))}
              style={{ ...select, width: 180 }}
            >
              <option value={thisYear}>{thisYear} (Current)</option>
              <option value={nextYear}>{nextYear} (Next)</option>
            </select>
          </div>
        </div>

        {/* Top grid: Add + Filters + KPI */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.9fr)",
            gap: UI.gap,
            marginTop: 14,
            alignItems: "start",
          }}
        >
          {/* Add employee */}
          <div style={{ ...card, ...cardPad }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950, color: UI.text }}>Add employee</div>
              <Pill tone="info">Base: {entitlementFor(newPattern)} days</Pill>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 0.8fr auto", gap: 10, marginTop: 12 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" style={input} />
              <select value={newPattern} onChange={(e) => setNewPattern(e.target.value)} style={select}>
                <option value="full_time">{PATTERN_LABEL.full_time}</option>
                <option value="four_days">{PATTERN_LABEL.four_days}</option>
                <option value="three_days">{PATTERN_LABEL.three_days}</option>
              </select>

              <input
                type="number"
                min={0}
                value={newCarry}
                onChange={(e) => setNewCarry(e.target.value)}
                placeholder={`Carry (${thisYear})`}
                style={inputNum}
              />

              <button onClick={addEmployee} disabled={adding} style={btn()}>
                {adding ? "Adding…" : "Add"}
              </button>
            </div>

            <div style={{ marginTop: 10, color: UI.muted, fontSize: 12, lineHeight: 1.4 }}>
              Adds per-year values for {thisYear}. You can pre-fill {nextYear} by switching year view and saving.
            </div>
          </div>

          {/* Filters + KPIs */}
          <div style={{ display: "grid", gap: UI.gap }}>
            <div style={{ ...card, ...cardPad }}>
              <div style={{ fontWeight: 950, color: UI.text, marginBottom: 10 }}>Search</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees…" style={input} />
              <div style={{ marginTop: 10, color: UI.muted, fontSize: 12 }}>
                Showing <b>{filteredRows.length}</b> employee{filteredRows.length === 1 ? "" : "s"}.
              </div>
            </div>

            <div style={{ ...card, ...cardPad }}>
              <div style={{ fontWeight: 950, color: UI.text, marginBottom: 10 }}>Totals ({yearView})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <StatTile label="People" value={kpis.people} tone="soft" />
                <StatTile label="Used" value={kpis.totalUsed} />
                <StatTile label="Allowance" value={kpis.totalAllowance} />
                <StatTile label="Carry" value={kpis.totalCarry} tone="warn" />
                <div style={{ gridColumn: "1 / -1" }}>
                  <StatTile label="Total balance" value={kpis.totalBalance} tone={kpis.totalBalance < 0 ? "warn" : "soft"} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ ...card, marginTop: UI.gap }}>
          <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 950, color: UI.text }}>Allowances table</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={chip}>Carry cap: {MAX_CARRY}</span>
              <span style={chip}>Base FT: {BASE_FULL_TIME}</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Work Pattern</th>
                  <th style={th}>Allowance</th>
                  <th style={th}>Carry</th>
                  <th style={th}>Total</th>
                  <th style={th}>Used</th>
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
                  filteredRows.map((r, idx) => {
                    const e = edits?.[r.id] || {};
                    const name = e.name ?? r.name;

                    const pattern = e.workPattern ?? r.workPattern ?? DEFAULT_PATTERN;
                    const allowance = getAllowanceForYear(r, yearView);
                    const carry = getCarryForYear(r, yearView);
                    const used = usedForYearByName(yearView, r.name);

                    const total = allowance + carry;
                    const balance = total - used;

                    const balThis = balanceForYear(r, thisYear);
                    const recommendedCarry = clamp(balThis, 0, MAX_CARRY);

                    const zebra = idx % 2 === 0 ? "#fff" : "#f8fafc";

                    return (
                      <tr key={r.id} style={{ background: zebra }}>
                        <td style={td}>
                          <input
                            value={name}
                            onChange={(ev) => onEditName(r.id, ev.target.value)}
                            style={{ ...input, minWidth: 220 }}
                          />
                        </td>

                        <td style={td}>
                          <select
                            value={pattern}
                            onChange={(ev) => onEditPattern(r, ev.target.value)}
                            style={{ ...select, minWidth: 190 }}
                          >
                            <option value="full_time">{PATTERN_LABEL.full_time}</option>
                            <option value="four_days">{PATTERN_LABEL.four_days}</option>
                            <option value="three_days">{PATTERN_LABEL.three_days}</option>
                          </select>

                          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Pill tone="gray">Base {entitlementFor(pattern)}</Pill>
                            {pattern !== "full_time" ? <Pill tone="info">Pro-rata</Pill> : <Pill tone="good">FT</Pill>}
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
                          <div style={{ display: "grid", gap: 6 }}>
                            <input
                              type="number"
                              min={0}
                              max={yearView === nextYear ? MAX_CARRY : undefined}
                              value={carry}
                              onChange={(ev) => onEditCarry(r, ev.target.value)}
                              style={inputNum}
                            />

                            {yearView === nextYear ? (
                              <div style={{ fontSize: 12, color: UI.muted, lineHeight: 1.35 }}>
                                Recommended (from {thisYear} balance): <b>{recommendedCarry}</b> • {thisYear} bal: <b>{balThis}</b>
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: UI.muted }}>
                                {yearView === thisYear ? "Current-year carry" : "Carry"}
                              </div>
                            )}
                          </div>
                        </td>

                        <td style={td}>
                          <Pill tone="info">{total}</Pill>
                        </td>

                        <td style={td}>
                          <Pill tone="gray">{used}</Pill>
                        </td>

                        <td style={td}>
                          <Pill tone={balanceTone(balance)}>{balance}</Pill>
                        </td>

                        <td style={td}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button onClick={() => saveRow(r)} disabled={!!saving[r.id]} style={btn()}>
                              {saving[r.id] ? "Saving…" : `Save (${yearView})`}
                            </button>

                            <button onClick={() => deleteRow(r)} disabled={!!saving[r.id]} style={btn("danger")}>
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
          </div>

          <div style={{ padding: 14, borderTop: "1px solid #e5e7eb", color: UI.muted, fontSize: 12, lineHeight: 1.55 }}>
            <div>
              Tip: “Used” is calculated from the <code>holidays</code> collection (Mon–Fri only). Ensure{" "}
              <code>holidays.employee</code> matches the employee <code>name</code> exactly.
            </div>
            <div>
              Carry into next year is capped at <b>{MAX_CARRY}</b> days. You can override the recommended amount.
            </div>
          </div>
        </div>

        {/* Year rollover info */}
        <div style={{ ...card, marginTop: UI.gap, ...cardPad }}>
          <div style={{ fontWeight: 950, color: UI.text, marginBottom: 6 }}>What happens when the year changes?</div>
          <div style={{ color: "#374151", fontSize: 13, lineHeight: 1.6 }}>
            On <b>1 January {nextYear}</b>, this page automatically treats {nextYear} as the “current year”.
            It will read/write:
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
              <li>
                <code>employees.holidayAllowances["{nextYear}"]</code> and <code>employees.carryOverByYear["{nextYear}"]</code>
              </li>
              <li>
                The dropdown becomes <b>{nextYear}</b> (Current) and <b>{nextYear + 1}</b> (Next)
              </li>
            </ul>
            <div style={{ marginTop: 10, color: UI.muted }}>
              Legacy fields (<code>holidayAllowance</code>, <code>carriedOverDays</code>) are only kept in sync when saving the
              “current year” (for compatibility with older pages).
            </div>
          </div>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ────────────────────────────────────────────────────────────────
   TABLE STYLES
──────────────────────────────────────────────────────────────── */
const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  position: "sticky",
  top: 0,
  zIndex: 1,
  fontWeight: 950,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const td = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};
