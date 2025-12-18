// src/app/vehicle-usage/page.js
"use client";

import React, { useEffect, useMemo, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";

/* ───────────────────────────────────────────
   Mini design system (matches Jobs Home)
─────────────────────────────────────────── */
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
  danger: "#dc2626",
  ok: "#16a34a",
  amber: "#d97706",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };

const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const cardBase = {
  ...surface,
  padding: 16,
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};

const grid = (cols = 4) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: UI.gap,
});

const chip = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f1f5f9",
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const chipSoft = { ...chip, background: UI.brandSoft, borderColor: "#dbeafe", color: UI.brand };

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
  if (kind === "pill") {
    return {
      padding: "8px 10px",
      borderRadius: 999,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: UI.text,
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

const inputBase = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 13.5,
  background: "#fff",
};
const smallLabel = { fontSize: 12, color: UI.muted, fontWeight: 800 };

const tableWrap = { ...surface, boxShadow: "none", overflow: "hidden" };
const th = { padding: "10px 12px", fontSize: 12, color: UI.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid #eef2f7", textAlign: "left", background: "#f8fafc" };
const td = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };

const divider = { height: 1, background: "#e5e7eb", margin: "14px 0" };

const keyframes = `
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;
const skeleton = {
  height: 12,
  borderRadius: 6,
  background: "linear-gradient(90deg, rgba(0,0,0,0.05), rgba(0,0,0,0.08), rgba(0,0,0,0.05))",
  backgroundSize: "200% 100%",
  animation: "shimmer 1400ms infinite",
};

/* ───────────────────────────────────────────
   Notes list (from your dropdown)
─────────────────────────────────────────── */
const NOTE_OPTIONS = [
  "1/2 Day Travel",
  "Night Shoot",
  "Shoot Day",
  "Other",
  "Rehearsal Day",
  "Rest Day",
  "Rig Day",
  "Standby Day",
  "Spilt Day",
  "Travel Day",
  "Travel Time",
  "Turnaround Day",
  "Recce Day",
];

/* ───────────────────────────────────────────
   Date helpers
─────────────────────────────────────────── */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISODateLocal(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}
function parseISODateLocal(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [Y, M, D] = String(s).split("-").map((n) => +n);
  return new Date(Y, M - 1, D);
}
function daysBetweenInclusive(fromISO, toISO) {
  const a = parseISODateLocal(fromISO);
  const b = parseISODateLocal(toISO);
  if (!a || !b) return [];
  const out = [];
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) out.push(toISODateLocal(d));
  return out;
}
function startOfTodayLocal() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}
function fmtPretty(iso) {
  const d = parseISODateLocal(iso);
  if (!d) return iso || "—";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

/* ───────────────────────────────────────────
   Vehicle label helper
─────────────────────────────────────────── */
function buildVehicleLabel(v) {
  const name = String(v?.name || v?.vehicleName || v?.displayName || v?.model || "").trim();
  const reg = String(v?.reg || v?.registration || v?.regNumber || v?.regNo || "").trim().toUpperCase();
  if (name && reg) return `${name} (${reg})`;
  return name || reg || "—";
}

/* ───────────────────────────────────────────
   Firestore: collection name & doc id shape
─────────────────────────────────────────── */
const USAGE_COLLECTION = "vehicleUsageNotes"; // ✅ create this collection
const usageDocId = (vehicleId, dateISO) => `${vehicleId}__${dateISO}`;

/*
Doc shape (recommended):
vehicleUsageNotes/{vehicleId__YYYY-MM-DD}:
{
  vehicleId: string,
  dateISO: "YYYY-MM-DD",
  note: string,            // one of NOTE_OPTIONS
  otherText?: string,      // if note === "Other"
  jobId?: string,          // optional
  jobLabel?: string,       // optional
  updatedAt: timestamp,
  updatedBy: string
}
*/

/* ───────────────────────────────────────────
   Page
─────────────────────────────────────────── */
export default function VehicleUsagePage() {
  // Range defaults: last 14 days
  const today = startOfTodayLocal();
  const defaultTo = toISODateLocal(today);
  const defaultFrom = toISODateLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13));

  const [loading, setLoading] = useState(true);

  // data
  const [vehicles, setVehicles] = useState([]); // [{id,label,category}]
  const [usageMap, setUsageMap] = useState(new Map()); // key: `${vehicleId}__${dateISO}` => doc

  // filters
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [noteFilter, setNoteFilter] = useState("all");
  const [q, setQ] = useState("");

  // ui
  const [editModal, setEditModal] = useState(null); // {vehicleId,dateISO,current}
  const [savingKey, setSavingKey] = useState(null);

  // load vehicles + usage notes (initial)
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const [vSnap, uSnap] = await Promise.all([
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, USAGE_COLLECTION)),
        ]);

        const vRows = vSnap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            category: data.category || "",
            label: buildVehicleLabel(data) || d.id,
          };
        });

        vRows.sort((a, b) => a.label.localeCompare(b.label));

        const m = new Map();
        uSnap.docs.forEach((d) => {
          const data = d.data() || {};
          const k = usageDocId(data.vehicleId || "", data.dateISO || "");
          if (data.vehicleId && data.dateISO) m.set(k, { id: d.id, ...data });
        });

        if (!alive) return;
        setVehicles(vRows);
        setUsageMap(m);
      } catch (e) {
        console.error("vehicle usage load error:", e);
        if (!alive) return;
        setVehicles([]);
        setUsageMap(new Map());
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const dayKeys = useMemo(() => {
    // clamp if user picks invalid
    const a = parseISODateLocal(fromDate);
    const b = parseISODateLocal(toDate);
    if (!a || !b) return [];
    const start = a <= b ? fromDate : toDate;
    const end = a <= b ? toDate : fromDate;
    return daysBetweenInclusive(start, end);
  }, [fromDate, toDate]);

  const vehiclesFiltered = useMemo(() => {
    let list = vehicles;

    if (vehicleFilter !== "all") list = list.filter((v) => v.id === vehicleFilter);

    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter((v) => `${v.label} ${v.category}`.toLowerCase().includes(s));
    }

    return list;
  }, [vehicles, vehicleFilter, q]);

  const rows = useMemo(() => {
    // row per vehicle per day
    const out = [];
    for (const v of vehiclesFiltered) {
      for (const d of dayKeys) {
        const k = usageDocId(v.id, d);
        const noteDoc = usageMap.get(k) || null;
        const note = noteDoc?.note || "";
        if (noteFilter !== "all") {
          if (!noteDoc) continue; // filter requires set note
          if (note !== noteFilter) continue;
        }
        out.push({
          vehicleId: v.id,
          vehicleLabel: v.label,
          category: v.category || "—",
          dateISO: d,
          noteDoc,
        });
      }
    }

    // newest first
    out.sort((a, b) => (a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : a.vehicleLabel.localeCompare(b.vehicleLabel)));
    return out;
  }, [vehiclesFiltered, dayKeys, usageMap, noteFilter]);

  const kpis = useMemo(() => {
    const totalSlots = vehiclesFiltered.length * dayKeys.length;
    let filled = 0;
    const counts = new Map();
    for (const r of rows) {
      if (r.noteDoc?.note) {
        filled++;
        const n = r.noteDoc.note;
        counts.set(n, (counts.get(n) || 0) + 1);
      }
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      totalSlots,
      filled,
      missing: Math.max(0, totalSlots - filled),
      top,
    };
  }, [rows, vehiclesFiltered.length, dayKeys.length]);

  const openEdit = (vehicleId, dateISO) => {
    const k = usageDocId(vehicleId, dateISO);
    const existing = usageMap.get(k) || null;

    setEditModal({
      vehicleId,
      dateISO,
      note: existing?.note || "",
      otherText: existing?.otherText || "",
      jobId: existing?.jobId || "",
      jobLabel: existing?.jobLabel || "",
    });
  };

  const saveEdit = async () => {
    if (!editModal?.vehicleId || !editModal?.dateISO) return;

    const { vehicleId, dateISO } = editModal;
    const k = usageDocId(vehicleId, dateISO);
    setSavingKey(k);

    try {
      const who =
        auth?.currentUser?.displayName ||
        auth?.currentUser?.email ||
        "Supervisor";

      const ref = doc(db, USAGE_COLLECTION, k);

      const payload = {
        vehicleId,
        dateISO,
        note: String(editModal.note || "").trim(),
        otherText: String(editModal.otherText || "").trim(),
        jobId: String(editModal.jobId || "").trim(),
        jobLabel: String(editModal.jobLabel || "").trim(),
        updatedAt: serverTimestamp(),
        updatedBy: who,
      };

      // Normalise: only keep otherText when note === "Other"
      if (payload.note !== "Other") payload.otherText = "";
      // Normalise: if empty note, treat as clearing the entry
      // (We still write doc; keeps history. If you want true delete, say so.)
      await setDoc(ref, payload, { merge: true });

      // refresh local map
      const fresh = await getDoc(ref);
      const data = fresh.exists() ? fresh.data() : payload;

      setUsageMap((prev) => {
        const next = new Map(prev);
        next.set(k, { id: k, ...data });
        return next;
      });

      setEditModal(null);
    } catch (e) {
      console.error("save usage note error:", e);
      alert("Could not save. Please try again.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <HeaderSidebarLayout>
      <style>{keyframes}</style>
      <style>{`
        input:focus, button:focus, select:focus, textarea:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
          border-color: #bfdbfe !important;
        }
        button:disabled { opacity: .55; cursor: not-allowed; }
      `}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Vehicle Usage</h1>
            <div style={sub}>
              Set a <b>day note</b> for what each vehicle is doing per day (e.g., Shoot Day, Travel Day, Rig Day).
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={chip}>{loading ? "Loading…" : `${vehiclesFiltered.length} vehicles`}</div>
            <div style={chipSoft}>
              Filled: <b style={{ marginLeft: 6 }}>{kpis.filled}</b> / {kpis.totalSlots}
            </div>
            <div style={chip}>Missing: <b style={{ marginLeft: 6 }}>{kpis.missing}</b></div>
          </div>
        </div>

        {/* Controls */}
        <section style={cardBase}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 220 }}>
              <div style={smallLabel}>Search vehicles</div>
              <input
                style={inputBase}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type vehicle name / reg / category…"
              />
            </div>

            <div style={{ minWidth: 170 }}>
              <div style={smallLabel}>From</div>
              <input
                type="date"
                style={inputBase}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div style={{ minWidth: 170 }}>
              <div style={smallLabel}>To</div>
              <input
                type="date"
                style={inputBase}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            <div style={{ minWidth: 240 }}>
              <div style={smallLabel}>Vehicle</div>
              <select style={inputBase} value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}>
                <option value="all">All vehicles</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 240 }}>
              <div style={smallLabel}>Note type</div>
              <select style={inputBase} value={noteFilter} onChange={(e) => setNoteFilter(e.target.value)}>
                <option value="all">All (incl. blank)</option>
                {NOTE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={btn("ghost")}
                onClick={() => {
                  setQ("");
                  setVehicleFilter("all");
                  setNoteFilter("all");
                  setFromDate(defaultFrom);
                  setToDate(defaultTo);
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={divider} />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={chipSoft}>{dayKeys.length} days in range</span>
            {kpis.top.length ? (
              <>
                <span style={chip}>Top notes:</span>
                {kpis.top.map(([n, c]) => (
                  <span key={n} style={chip}>
                    {n}: <b style={{ marginLeft: 6 }}>{c}</b>
                  </span>
                ))}
              </>
            ) : (
              <span style={chip}>No notes set yet for this range.</span>
            )}
          </div>
        </section>

        {/* Table */}
        <section style={{ ...cardBase, marginTop: UI.gap, padding: 0 }}>
          <div style={{ padding: 16, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: UI.text }}>Per-day notes</div>
              <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
                Click <b>Edit</b> to set what a vehicle is doing on that date.
              </div>
            </div>
            <div style={chip}>{loading ? "Loading…" : `${rows.length} rows`}</div>
          </div>

          <div style={tableWrap}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Vehicle</th>
                    <th style={th}>Category</th>
                    <th style={th}>Day Note</th>
                    <th style={th}>Job</th>
                    <th style={th}>Updated</th>
                    <th style={{ ...th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <>
                      {[...Array(8)].map((_, i) => (
                        <tr key={i}>
                          <td style={td}><div style={{ ...skeleton, width: 120 }} /></td>
                          <td style={td}><div style={{ ...skeleton, width: 220 }} /></td>
                          <td style={td}><div style={{ ...skeleton, width: 120 }} /></td>
                          <td style={td}><div style={{ ...skeleton, width: 180 }} /></td>
                          <td style={td}><div style={{ ...skeleton, width: 140 }} /></td>
                          <td style={td}><div style={{ ...skeleton, width: 160 }} /></td>
                          <td style={{ ...td, textAlign: "right" }}><div style={{ ...skeleton, width: 90, marginLeft: "auto" }} /></td>
                        </tr>
                      ))}
                    </>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...td, textAlign: "center", color: UI.muted }}>
                        No rows to show. Try widening the date range or clearing filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const n = r.noteDoc?.note || "";
                      const other = r.noteDoc?.otherText || "";
                      const updatedAt = r.noteDoc?.updatedAt?.toDate?.() || (r.noteDoc?.updatedAt ? new Date(r.noteDoc.updatedAt) : null);
                      const updatedBy = r.noteDoc?.updatedBy || "";
                      const jobLabel = r.noteDoc?.jobLabel || r.noteDoc?.jobId || "";

                      const noteDisplay = n
                        ? n === "Other" && other
                          ? `Other — ${other}`
                          : n
                        : "—";

                      return (
                        <tr key={`${r.vehicleId}__${r.dateISO}`}>
                          <td style={td}>{fmtPretty(r.dateISO)}</td>
                          <td style={td}>
                            <div style={{ fontWeight: 900, color: UI.text }}>{r.vehicleLabel}</div>
                            <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>{r.vehicleId}</div>
                          </td>
                          <td style={td}>{r.category}</td>
                          <td style={td}>
                            <span
                              style={{
                                ...chip,
                                background: n ? UI.brandSoft : "#f1f5f9",
                                borderColor: n ? "#dbeafe" : "#e5e7eb",
                                color: n ? UI.brand : UI.text,
                              }}
                              title={noteDisplay}
                            >
                              {noteDisplay.length > 42 ? `${noteDisplay.slice(0, 42)}…` : noteDisplay}
                            </span>
                          </td>
                          <td style={td}>{jobLabel || "—"}</td>
                          <td style={td}>
                            {updatedAt ? (
                              <>
                                <div style={{ fontWeight: 800, color: UI.text, fontSize: 12 }}>{updatedAt.toLocaleString()}</div>
                                <div style={{ color: UI.muted, fontSize: 12 }}>{updatedBy}</div>
                              </>
                            ) : (
                              <span style={{ color: UI.muted }}>—</span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              style={btn("ghost")}
                              onClick={() => openEdit(r.vehicleId, r.dateISO)}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* Edit modal */}
      {editModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.32)",
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: "min(92vw, 620px)",
              background: "#fff",
              border: UI.border,
              borderRadius: UI.radius,
              boxShadow: UI.shadowHover,
              padding: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 950, color: UI.text }}>Set day note</div>
                <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
                  {fmtPretty(editModal.dateISO)} •{" "}
                  <b>
                    {(vehicles.find((v) => v.id === editModal.vehicleId)?.label) || editModal.vehicleId}
                  </b>
                </div>
              </div>
              <button type="button" style={btn("ghost")} onClick={() => setEditModal(null)}>
                Close
              </button>
            </div>

            <div style={divider} />

            <div style={grid(2)}>
              <div>
                <div style={smallLabel}>Note</div>
                <select
                  style={inputBase}
                  value={editModal.note}
                  onChange={(e) => setEditModal((m) => ({ ...m, note: e.target.value }))}
                >
                  <option value="">Select note</option>
                  {NOTE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

                {editModal.note === "Other" && (
                  <div style={{ marginTop: 10 }}>
                    <div style={smallLabel}>Other note</div>
                    <input
                      style={inputBase}
                      value={editModal.otherText}
                      onChange={(e) => setEditModal((m) => ({ ...m, otherText: e.target.value }))}
                      placeholder="e.g., Bodyshop / Prep / Off road…"
                    />
                  </div>
                )}
              </div>

              <div>
                <div style={smallLabel}>Job (optional)</div>
                <input
                  style={inputBase}
                  value={editModal.jobLabel}
                  onChange={(e) => setEditModal((m) => ({ ...m, jobLabel: e.target.value }))}
                  placeholder='e.g., "#1042" or "Netflix unit"'
                />
                <div style={{ marginTop: 10 }}>
                  <div style={smallLabel}>Job ID (optional)</div>
                  <input
                    style={inputBase}
                    value={editModal.jobId}
                    onChange={(e) => setEditModal((m) => ({ ...m, jobId: e.target.value }))}
                    placeholder="Firestore booking id (optional)"
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, color: UI.muted, fontSize: 12, lineHeight: 1.5 }}>
              Tip: leave <b>Note</b> blank to effectively clear the cell (it will show as “—”).
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button type="button" style={btn("ghost")} onClick={() => setEditModal(null)} disabled={!!savingKey}>
                Cancel
              </button>
              <button
                type="button"
                style={btn("primary")}
                onClick={saveEdit}
                disabled={!!savingKey}
              >
                {savingKey ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </HeaderSidebarLayout>
  );
}
