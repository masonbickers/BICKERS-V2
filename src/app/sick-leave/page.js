"use client";

import layoutStyles from "./page.styles.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db } from "../../../firebaseConfig";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { UI_TOKENS } from "@/app/utils/uiTokens";

/* ───────────────────────────────────────────
   Mini design system
─────────────────────────────────────────── */
const UI = UI_TOKENS;

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const card = { ...surface, padding: 16 };
const sectionHeader = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 };
const titleMd = { fontSize: 16, fontWeight: 900, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12, marginTop: 4 };

const chip = (kind = "neutral") => {
  if (kind === "good") return { padding: "6px 10px", borderRadius: 999, border: `1px solid ${UI.goodBorder}`, background: UI.goodBg, color: UI.good, fontSize: 12, fontWeight: 900 };
  if (kind === "warn") return { padding: "6px 10px", borderRadius: 999, border: `1px solid ${UI.warnBorder}`, background: UI.warnBg, color: UI.warn, fontSize: 12, fontWeight: 900 };
  if (kind === "danger") return { padding: "6px 10px", borderRadius: 999, border: `1px solid ${UI.dangerBorder}`, background: UI.dangerBg, color: UI.danger, fontSize: 12, fontWeight: 900 };
  return { padding: "6px 10px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-surface-hover)", color: UI.text, fontSize: 12, fontWeight: 900 };
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return { padding: "10px 12px", borderRadius: UI.radiusSm, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: UI.text, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" };
  }
  if (kind === "danger") {
    return { padding: "8px 10px", borderRadius: UI.radiusSm, border: `1px solid ${UI.dangerBorder}`, background: UI.dangerBg, color: UI.danger, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" };
  }
  return { padding: "10px 12px", borderRadius: UI.radiusSm, border: `1px solid ${UI.brand}`, background: UI.brand, color: "var(--color-surface)", fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" };
};

const grid2 = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 };
const label = { display: "block", fontSize: 12, fontWeight: 900, color: UI.text, marginBottom: 6 };
const input = { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--color-border)", outline: "none", fontSize: 13.5, background: "var(--color-surface)" };
const textarea = { ...input, minHeight: 92, resize: "vertical" };
const divider = { height: 1, background: "var(--color-border)", margin: "14px 0" };

const tableWrap = { overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 12, background: "var(--color-surface)" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-surface-subtle)", zIndex: 1, whiteSpace: "nowrap" };
const td = { padding: "10px 12px", borderBottom: "1px solid var(--color-surface-hover)", verticalAlign: "top" };

/* ───────── date helpers ───────── */
function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}
function ymdToDate(ymd) {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(+dt) ? null : dt;
}
function fmt(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function eachDateInclusive(start, end) {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const out = [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function buildBreakdown(record, includeWeekends = false) {
  const s = toDate(record.startDate);
  const e = toDate(record.endDate) || s;
  if (!s || !e) return [];

  const days = eachDateInclusive(s, e);
  const single = s && e ? fmt(s) === fmt(e) : false;
  const startHalf = !!record.startHalfDay;
  const endHalf = !!record.endHalfDay;

  return days
    .map((d, idx) => {
      const weekend = isWeekend(d);
      if (!includeWeekends && weekend) return null;

      let label = "Full day";
      if (single) {
        if (startHalf || endHalf) label = "Half day";
      } else {
        if (idx === 0 && startHalf) label = "Half day";
        else if (idx === days.length - 1 && endHalf) label = "Half day";
        else label = weekend ? "Weekend (ignored)" : "Full day";
      }

      return {
        key: d.toISOString(),
        date: d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }),
        label,
        muted: weekend,
      };
    })
    .filter(Boolean);
}
function daysForRecord(record) {
  const breakdown = buildBreakdown(record, false);
  let total = 0;
  for (const row of breakdown) {
    const lbl = String(row.label || "").toLowerCase();
    if (lbl.startsWith("full")) total += 1;
    else if (lbl.startsWith("half")) total += 0.5;
  }
  return total;
}
function normaliseName(n) {
  return String(n || "").trim().replace(/\s+/g, " ").toLowerCase();
}
function titleCase(n) {
  return String(n || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function yearOf(d) {
  const dt = toDate(d);
  return dt ? dt.getFullYear() : null;
}

/*  IMPORTANT: default export MUST be a component */
export default function Page() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startHalfDay, setStartHalfDay] = useState(false);
  const [endHalfDay, setEndHalfDay] = useState(false);
  const [reason, setReason] = useState("Illness");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("recorded");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

  const selectedEmployee = useMemo(() => {
    if (!employeeId) return null;
    return employees.find((e) => e.id === employeeId) || null;
  }, [employeeId, employees]);

  useEffect(() => {
    if (selectedEmployee?.name) setEmployeeName(selectedEmployee.name);
  }, [selectedEmployee]);

  const fetchAll = async () => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "sickLeave", operation: "load sick leave" });
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const snap = await getDocs(tenantCollectionQuery(db, "sickLeave", dataAccessState));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      all.sort((a, b) => (+toDate(b.createdAt) || 0) - (+toDate(a.createdAt) || 0));
      setRecords(all);
    } catch (e) {
      console.error("Error fetching sick leave:", e);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "load sick leave employees" });
      setEmployees([]);
      setLoadingEmployees(false);
      return undefined;
    }

    (async () => {
      setLoadingEmployees(true);
      try {
        const snap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        if (mounted) setEmployees(list);
      } catch (e) {
        console.error("Error fetching employees:", e);
        if (mounted) setEmployees([]);
      } finally {
        if (mounted) setLoadingEmployees(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, dataAccessState]);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!employeeId && !String(employeeName || "").trim()) return false;
    if (!startDate) return false;
    return true;
  }, [saving, employeeId, employeeName, startDate]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;

    try {
      setSaving(true);

      const s = ymdToDate(startDate);
      const eDate = ymdToDate(endDate) || s;
      if (!s) throw new Error("Start date missing");

      let start = s;
      let end = eDate;
      if (end && start && end < start) {
        const tmp = start;
        start = end;
        end = tmp;
      }

      const empName = String(employeeName || selectedEmployee?.name || "").trim();
      const payload = {
        employeeId: employeeId || null,
        employeeName: empName || "Unknown",
        startDate: start,
        endDate: end,
        startHalfDay: !!startHalfDay,
        endHalfDay: !!endHalfDay,
        reason: reason || "Illness",
        status: status || "recorded",
        notes: notes || "",
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "sickLeave"), tenantPayload(dataAccessState, payload));

      alert(" Sick leave recorded");
      setEmployeeId("");
      setEmployeeName("");
      setStartDate("");
      setEndDate("");
      setStartHalfDay(false);
      setEndHalfDay(false);
      setReason("Illness");
      setStatus("recorded");
      setNotes("");

      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(` Could not save sick leave.\n${err?.message || ""}`);
    } finally {
      setSaving(false);
    }
  };

  const setRecordStatus = async (id, next) => {
    try {
      await updateDoc(doc(db, "sickLeave", id), tenantPayload(dataAccessState, { status: next }));
      await fetchAll();
    } catch (e) {
      console.error(e);
      alert(" Failed to update status");
    }
  };

  const removeRecord = async (id) => {
    if (!confirm("Delete this sick leave record?")) return;
    try {
      await deleteDoc(doc(db, "sickLeave", id));
      await fetchAll();
    } catch (e) {
      console.error(e);
      alert(" Failed to delete record");
    }
  };

  const years = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      const ys = yearOf(r.startDate);
      const ye = yearOf(r.endDate);
      if (ys) set.add(ys);
      if (ye) set.add(ye);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [records]);

  const filtered = useMemo(() => {
    const q = normaliseName(search);
    return records.filter((r) => {
      const name = normaliseName(r.employeeName || "");
      if (q && !name.includes(q)) return false;

      if (yearFilter !== "all") {
        const y = Number(yearFilter);
        const ys = yearOf(r.startDate);
        const ye = yearOf(r.endDate);
        if (ys !== y && ye !== y) return false;
      }
      return true;
    });
  }, [records, search, yearFilter]);

  const totalsByEmployee = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const name = titleCase(r.employeeName || "Unknown");
      const key = normaliseName(name);
      const days = daysForRecord(r);
      map.set(key, { name, days: (map.get(key)?.days || 0) + days });
    }
    const arr = Array.from(map.values()).map((x) => ({ ...x, days: Number(x.days.toFixed(2)) }));
    arr.sort((a, b) => b.days - a.days);
    return arr;
  }, [filtered]);

  const totalDays = useMemo(() => totalsByEmployee.reduce((sum, r) => sum + (r.days || 0), 0), [totalsByEmployee]);

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div className={layoutStyles.extracted1}>
          <div>
            <h1 style={h1}>Sick leave</h1>
            <div style={sub}>Add sick days and track totals (weekdays only, half-days supported).</div>
          </div>
          <div className={layoutStyles.extracted2}>
            <button style={btn("ghost")} type="button" onClick={() => router.push("/hr")}>
              Back to HR
            </button>
            <span style={chip(loading ? "warn" : "good")}>{loading ? "Loading…" : `${filtered.length} records`}</span>
            <span style={chip("neutral")}>{`${Number(totalDays.toFixed(2))} days total`}</span>
          </div>
        </div>

        <section style={card}>
          <div className={layoutStyles.extracted3}>
            <div>
              <h2 style={titleMd}>Record sick leave</h2>
              <div style={hint}>Firestore collection: <b>sickLeave</b></div>
            </div>
            <span style={chip(canSave ? "good" : "warn")}>{canSave ? "Ready" : "Missing info"}</span>
          </div>

          <form onSubmit={submit} className={layoutStyles.extracted4}>
            <div className={layoutStyles.extracted5}>
              <div className={layoutStyles.extracted6}>
                <label style={label}>Employee</label>
                <select className={layoutStyles.extracted7} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={loadingEmployees}>
                  <option value="">{loadingEmployees ? "Loading employees…" : "Select employee (optional)"}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {String(e.name || "Unnamed")}
                    </option>
                  ))}
                </select>
                <div style={hint}>If you don’t select, type a name below.</div>
              </div>

              <div className={layoutStyles.extracted8}>
                <label style={label}>Employee name (manual override)</label>
                <input className={layoutStyles.extracted9} value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="e.g. John Smith" />
              </div>

              <div>
                <label style={label}>Start date</label>
                <input className={layoutStyles.extracted10} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>

              <div>
                <label style={label}>End date</label>
                <input className={layoutStyles.extracted11} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                <div style={hint}>Leave blank for single-day.</div>
              </div>

              <div className={layoutStyles.extracted12}>
                <div className={layoutStyles.extracted13}>
                  <div style={{ fontWeight: 900, color: UI.text, fontSize: 13 }}>Start half day</div>
                  <label className={layoutStyles.extracted14}>
                    <input type="checkbox" checked={startHalfDay} onChange={(e) => setStartHalfDay(e.target.checked)} />
                    <span style={{ fontSize: 13, color: UI.muted }}>Half day</span>
                  </label>
                </div>
              </div>

              <div className={layoutStyles.extracted15}>
                <div className={layoutStyles.extracted16}>
                  <div style={{ fontWeight: 900, color: UI.text, fontSize: 13 }}>End half day</div>
                  <label className={layoutStyles.extracted17}>
                    <input type="checkbox" checked={endHalfDay} onChange={(e) => setEndHalfDay(e.target.checked)} />
                    <span style={{ fontSize: 13, color: UI.muted }}>Half day</span>
                  </label>
                </div>
              </div>

              <div>
                <label style={label}>Reason</label>
                <select className={layoutStyles.extracted18} value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="Illness">Illness</option>
                  <option value="Injury">Injury</option>
                  <option value="Medical appointment">Medical appointment</option>
                  <option value="Mental health">Mental health</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={label}>Status</label>
                <select className={layoutStyles.extracted19} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="recorded">Recorded</option>
                  <option value="pending">Pending</option>
                  <option value="certified">Certified</option>
                </select>
              </div>

              <div className={layoutStyles.extracted20}>
                <label style={label}>Notes</label>
                <textarea className={layoutStyles.extracted21} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>

            <div className={layoutStyles.extracted22} />

            <div className={layoutStyles.extracted23}>
              <button type="button" style={btn("ghost")} onClick={() => fetchAll()} disabled={saving}>
                Refresh
              </button>
              <button type="submit" style={btn()} disabled={!canSave}>
                {saving ? "Saving…" : "Save sick leave"}
              </button>
            </div>
          </form>
        </section>

        <section style={{ ...card, marginTop: UI.gap }}>
          <div className={layoutStyles.extracted24}>
            <div>
              <h2 style={titleMd}>All records</h2>
              <div style={hint}>Search and filter, then update status or delete.</div>
            </div>

            <div className={layoutStyles.extracted25}>
              <input className={layoutStyles.extracted26} placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className={layoutStyles.extracted27} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="all">All years</option>
                {years.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>Loading sick leave…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13 }}>No sick leave records found.</div>
          ) : (
            <div className={layoutStyles.extracted28}>
              <table className={layoutStyles.extracted29}>
                <thead>
                  <tr>
                    <th className={layoutStyles.extracted30}>Employee</th>
                    <th className={layoutStyles.extracted31}>From</th>
                    <th className={layoutStyles.extracted32}>To</th>
                    <th className={layoutStyles.extracted33}>Days</th>
                    <th className={layoutStyles.extracted34}>Reason</th>
                    <th className={layoutStyles.extracted35}>Status</th>
                    <th className={layoutStyles.extracted36}>Notes</th>
                    <th className={layoutStyles.extracted37}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const fromD = toDate(r.startDate);
                    const toD = toDate(r.endDate) || fromD;
                    const days = daysForRecord(r);
                    const statusLower = String(r.status || "").toLowerCase();
                    const statusStyle =
                      statusLower === "certified" ? chip("good") : statusLower === "pending" ? chip("warn") : chip("neutral");
                    const notesText = String(r.notes || "").trim() || "—";

                    return (
                      <tr key={r.id}>
                        <td className={layoutStyles.extracted38}><b>{titleCase(r.employeeName || "Unknown")}</b></td>
                        <td className={layoutStyles.extracted39}>{fmt(fromD)}</td>
                        <td className={layoutStyles.extracted40}>{fmt(toD)}</td>
                        <td className={layoutStyles.extracted41}>{days}</td>
                        <td className={layoutStyles.extracted42}>{r.reason || "—"}</td>
                        <td className={layoutStyles.extracted43}><span style={statusStyle}>{titleCase(r.status || "recorded")}</span></td>
                        <td className={layoutStyles.extracted44} title={notesText}>
                          <div className={layoutStyles.extracted45}>{notesText}</div>
                        </td>
                        <td className={layoutStyles.extracted46}>
                          <div className={layoutStyles.extracted47}>
                            <button type="button" style={btn("ghost")} onClick={() => setRecordStatus(r.id, "recorded")}>Recorded</button>
                            <button type="button" style={btn("ghost")} onClick={() => setRecordStatus(r.id, "pending")}>Pending</button>
                            <button type="button" style={btn("ghost")} onClick={() => setRecordStatus(r.id, "certified")}>Certified</button>
                            <button type="button" style={btn("danger")} onClick={() => removeRecord(r.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ marginTop: UI.gap, color: UI.muted, fontSize: 12 }}>
          Counting: weekdays only (Mon–Fri). Half day on start/end counts as 0.5.
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}
