"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

/* ───────────────────────────────────────────
   Admin gate (ONLY these emails)
─────────────────────────────────────────── */
const ADMIN_EMAILS = ["mason@bickers.co.uk", "paul@bickers.co.uk"];

/* ───────────────────────────────────────────
   Mini design system (matches your style)
─────────────────────────────────────────── */
const UI = {
  radius: 14,
  radiusSm: 10,
  gap: 16,
  shadowSm: "0 4px 14px rgba(0,0,0,0.06)",
  border: "1px solid #e5e7eb",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  brand: "#1d4ed8",
  brandSoft: "rgba(29, 78, 216, 0.10)",
  danger: "#b91c1c",
  ok: "#15803d",
  warn: "#b45309",
};

const Tabs = {
  ACCESS: "Access",
  HOLIDAY: "Holiday Allowance",
  SICK: "Sick Leave",
};

const toISO = (d) => (d ? d : "");

const tsToMs = (t) => {
  // Firestore Timestamp has toMillis()
  if (!t) return 0;
  if (typeof t?.toMillis === "function") return t.toMillis();
  // if it was saved as Date or string
  const asDate = t instanceof Date ? t : new Date(t);
  const ms = asDate.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const bestUserDoc = (a, b) => {
  // Choose the "best" doc between a and b:
  // 1) Prefer doc where doc.id === doc.uid (canonical uid doc)
  // 2) Then prefer newer updatedAt
  // 3) Then newer createdAt
  // 4) Otherwise keep existing
  const aIsUidDoc = a?.uid && a?.id === a.uid;
  const bIsUidDoc = b?.uid && b?.id === b.uid;
  if (aIsUidDoc && !bIsUidDoc) return a;
  if (!aIsUidDoc && bIsUidDoc) return b;

  const aUpdated = tsToMs(a?.updatedAt);
  const bUpdated = tsToMs(b?.updatedAt);
  if (aUpdated !== bUpdated) return aUpdated > bUpdated ? a : b;

  const aCreated = tsToMs(a?.createdAt);
  const bCreated = tsToMs(b?.createdAt);
  if (aCreated !== bCreated) return aCreated > bCreated ? a : b;

  return a;
};

const daysBetweenInclusive = (startISO, endISO) => {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const ms = e.getTime() - s.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  return isNaN(days) ? 0 : Math.max(0, days);
};

export default function AdminPage() {
  const router = useRouter();

  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState(Tabs.ACCESS);

  const [qText, setQText] = useState("");
  const [toast, setToast] = useState(null);

  // Data
  const [users, setUsers] = useState([]); // de-duped list
  const [usersMeta, setUsersMeta] = useState({ rawCount: 0, dedupedCount: 0, duplicates: 0 });

  const [employees, setEmployees] = useState([]);
  const [allowances, setAllowances] = useState([]);
  const [sickLeaves, setSickLeaves] = useState([]);

  // Sick form
  const [newSick, setNewSick] = useState({
    employeeId: "",
    startDate: "",
    endDate: "",
    reason: "",
    notes: "",
  });

  const filteredEmployees = useMemo(() => {
    const q = qText.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const name = (e.name || "").toLowerCase();
      const email = (e.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [employees, qText]);

  const allowanceByEmployeeId = useMemo(() => {
    const m = new Map();
    allowances.forEach((a) => m.set(a.employeeId, a));
    return m;
  }, [allowances]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2200);
  };

  /* ───────────────────────────────────────────
     Auth + Admin gate
  ──────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          router.push("/login");
          return;
        }
        const email = (u.email || "").toLowerCase();
        if (!ADMIN_EMAILS.includes(email)) {
          router.push("/home");
          return;
        }
        setMe(u);
        await bootstrap();
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────────────────────────────────────────
     Fetch
  ──────────────────────────────────────────── */
  const bootstrap = async () => {
    await Promise.all([fetchUsers(), fetchEmployees(), fetchAllowances(), fetchSickLeaves()]);
  };

  const fetchUsers = async () => {
    // Get raw docs
    const snap = await getDocs(query(collection(db, "users"), orderBy("email", "asc")));
    const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // De-dupe by email, choose best doc per email
    const byEmail = new Map();
    let rawCount = raw.length;

    for (const r of raw) {
      const email = (r.email || "").toLowerCase().trim();
      if (!email) continue;

      const existing = byEmail.get(email);
      if (!existing) byEmail.set(email, r);
      else byEmail.set(email, bestUserDoc(existing, r));
    }

    const deduped = Array.from(byEmail.values()).sort((a, b) =>
      (a.email || "").localeCompare(b.email || "")
    );

    setUsers(deduped);
    setUsersMeta({
      rawCount,
      dedupedCount: deduped.length,
      duplicates: Math.max(0, rawCount - deduped.length),
    });
  };

  const fetchEmployees = async () => {
    const snap = await getDocs(query(collection(db, "employees"), orderBy("name", "asc")));
    setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const fetchAllowances = async () => {
    const snap = await getDocs(collection(db, "holidayAllowances"));
    setAllowances(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const fetchSickLeaves = async () => {
    const snap = await getDocs(query(collection(db, "sickLeave"), orderBy("createdAt", "desc")));
    setSickLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  /* ───────────────────────────────────────────
     Access management
  ──────────────────────────────────────────── */
  const updateUserRole = async (userId, role) => {
    await updateDoc(doc(db, "users", userId), { role, updatedAt: serverTimestamp() });
    showToast("ok", "Role updated");
    await fetchUsers();
  };

  const toggleUserEnabled = async (userId, current) => {
    await updateDoc(doc(db, "users", userId), { isEnabled: !current, updatedAt: serverTimestamp() });
    showToast("ok", !current ? "User enabled" : "User disabled");
    await fetchUsers();
  };

  /* ───────────────────────────────────────────
     Holiday allowance management
  ──────────────────────────────────────────── */
  const upsertAllowance = async (employeeId, patch) => {
    const ref = doc(db, "holidayAllowances", employeeId);
    const existing = await getDoc(ref);

    const base = existing.exists()
      ? existing.data()
      : {
          employeeId,
          annualAllowanceDays: 28,
          carryOverDays: 0,
          usedDays: 0,
          createdAt: serverTimestamp(),
        };

    await setDoc(
      ref,
      {
        ...base,
        ...patch,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showToast("ok", "Holiday allowance saved");
    await fetchAllowances();
  };

  /* ───────────────────────────────────────────
     Sick leave
  ──────────────────────────────────────────── */
  const addSickLeave = async () => {
    if (!newSick.employeeId) return showToast("warn", "Select an employee");
    if (!newSick.startDate || !newSick.endDate) return showToast("warn", "Pick start + end date");

    const startDate = toISO(newSick.startDate);
    const endDate = toISO(newSick.endDate);

    const days = daysBetweenInclusive(startDate, endDate);
    if (days <= 0) return showToast("warn", "Dates look invalid");

    await addDoc(collection(db, "sickLeave"), {
      employeeId: newSick.employeeId,
      startDate,
      endDate,
      days,
      reason: newSick.reason || "",
      notes: newSick.notes || "",
      createdAt: serverTimestamp(),
      createdBy: me?.email || "",
    });

    setNewSick({ employeeId: "", startDate: "", endDate: "", reason: "", notes: "" });
    showToast("ok", "Sick leave recorded");
    await fetchSickLeaves();
  };

  /* ───────────────────────────────────────────
     Render
  ──────────────────────────────────────────── */
  if (checking) {
    return (
      <HeaderSidebarLayout>
        <div style={{ padding: 22, color: UI.muted }}>Checking admin access…</div>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <div style={{ padding: 22, background: UI.bg, minHeight: "calc(100vh - 60px)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: UI.gap, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: UI.text }}>Admin</div>
            <div style={{ color: UI.muted, marginTop: 4 }}>
              Only <b>{ADMIN_EMAILS.join(", ")}</b> can access this page.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="Search employees (name or email)…"
              style={topSearchStyle}
            />
            <button onClick={bootstrap} style={btnStyle} title="Refresh">
              Refresh
            </button>
          </div>
        </div>


        {/* Tabs */}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          {Object.values(Tabs).map((t) => {
            const active = t === activeTab;
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  ...btnStyle,
                  border: active ? `1px solid ${UI.brand}` : UI.border,
                  background: active ? UI.brandSoft : UI.card,
                  fontWeight: 900,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* Toast */}
        {toast && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: UI.radiusSm,
              border: UI.border,
              background:
                toast.type === "ok"
                  ? "rgba(21,128,61,0.08)"
                  : toast.type === "warn"
                  ? "rgba(180,83,9,0.10)"
                  : "rgba(185,28,28,0.10)",
              color: toast.type === "ok" ? UI.ok : toast.type === "warn" ? UI.warn : UI.danger,
              fontWeight: 900,
            }}
          >
            {toast.message}
          </div>
        )}

        {/* Content */}
        <div style={{ marginTop: 16, display: "grid", gap: UI.gap }}>
          {/* ACCESS */}
          {activeTab === Tabs.ACCESS && (
            <Card title="Manage Access" subtitle="One line per user (de-duped by email)">
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <Th>Email</Th>
                      <Th>Role</Th>
                      <Th>Enabled</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={emptyTd}>
                          No users found in Firestore <code>users</code> collection.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        const email = (u.email || "").toLowerCase();
                        const locked = ADMIN_EMAILS.includes(email);
                        const enabled = u.isEnabled ?? true;

                        return (
                          <tr key={u.id} style={rowStyle}>
                            <Td>
                              <div style={{ fontWeight: 900, color: UI.text, whiteSpace: "nowrap" }}>
                                {u.email || "—"}
                                {locked && <span style={pillStyle}>Admin gate</span>}
                              </div>
                              <div style={{ fontSize: 12, color: UI.muted }}>
                                {u.name || u.displayName || ""}
                              </div>
                            </Td>

                            <Td>
                              <select
                                value={u.role || "user"}
                                onChange={(e) => updateUserRole(u.id, e.target.value)}
                                style={selectStyle}
                              >
                                <option value="user">user</option>
                                <option value="manager">manager</option>
                                <option value="admin">admin</option>
                              </select>
                            </Td>

                            <Td>
                              <span style={{ fontWeight: 900, color: enabled ? UI.ok : UI.danger }}>
                                {enabled ? "Enabled" : "Disabled"}
                              </span>
                            </Td>

                            <Td>
                              <button
                                disabled={locked}
                                onClick={() => toggleUserEnabled(u.id, enabled)}
                                style={{
                                  ...btnStyle,
                                  background: locked ? "#f1f5f9" : UI.card,
                                  cursor: locked ? "not-allowed" : "pointer",
                                  color: locked ? UI.muted : UI.text,
                                  fontWeight: 900,
                                }}
                                title={locked ? "This account is part of the admin gate" : "Enable/disable this user"}
                              >
                                {enabled ? "Disable" : "Enable"}
                              </button>
                            </Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* HOLIDAY */}
          {activeTab === Tabs.HOLIDAY && (
            <Card title="Holiday Allowance" subtitle="Single line per employee (no expand/collapse)">
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th>Annual</Th>
                      <Th>Carry Over</Th>
                      <Th>Used</Th>
                      <Th>Remaining</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={emptyTd}>
                          No employees found.
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const a = allowanceByEmployeeId.get(emp.id) || {
                          employeeId: emp.id,
                          annualAllowanceDays: 28,
                          carryOverDays: 0,
                          usedDays: 0,
                        };

                        const total =
                          Number(a.annualAllowanceDays || 0) + Number(a.carryOverDays || 0);
                        const used = Number(a.usedDays || 0);
                        const remaining = Math.max(0, total - used);

                        return (
                          <tr key={emp.id} style={rowStyle}>
                            <Td>
                              <div style={{ fontWeight: 900, color: UI.text }}>{emp.name || "Unnamed"}</div>
                              <div style={{ fontSize: 12, color: UI.muted }}>{emp.email || ""}</div>
                            </Td>

                            <Td>
                              <input
                                type="number"
                                value={a.annualAllowanceDays ?? ""}
                                onChange={(e) =>
                                  upsertAllowance(emp.id, {
                                    annualAllowanceDays: Number(e.target.value || 0),
                                  })
                                }
                                style={cellInputStyle}
                              />
                            </Td>

                            <Td>
                              <input
                                type="number"
                                value={a.carryOverDays ?? ""}
                                onChange={(e) =>
                                  upsertAllowance(emp.id, {
                                    carryOverDays: Number(e.target.value || 0),
                                  })
                                }
                                style={cellInputStyle}
                              />
                            </Td>

                            <Td>
                              <input
                                type="number"
                                value={a.usedDays ?? ""}
                                onChange={(e) =>
                                  upsertAllowance(emp.id, {
                                    usedDays: Number(e.target.value || 0),
                                  })
                                }
                                style={cellInputStyle}
                              />
                            </Td>

                            <Td>
                              <div style={{ fontWeight: 1000, color: remaining <= 5 ? UI.warn : UI.ok }}>
                                {remaining}
                              </div>
                              <div style={{ fontSize: 12, color: UI.muted }}>
                                Total {total} • Used {used}
                              </div>
                            </Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* SICK */}
          {activeTab === Tabs.SICK && (
            <Card title="Sick Leave" subtitle="Add sick leave and view records">
              <div style={panelStyle}>
                <div style={{ fontWeight: 1000, color: UI.text, marginBottom: 10 }}>Add sick leave</div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Employee</div>
                    <select
                      value={newSick.employeeId}
                      onChange={(e) => setNewSick((s) => ({ ...s, employeeId: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">Select employee…</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || "Unnamed"}{e.email ? ` (${e.email})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={labelStyle}>Start date</div>
                    <input
                      type="date"
                      value={newSick.startDate}
                      onChange={(e) => setNewSick((s) => ({ ...s, startDate: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div style={labelStyle}>End date</div>
                    <input
                      type="date"
                      value={newSick.endDate}
                      onChange={(e) => setNewSick((s) => ({ ...s, endDate: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
                  <div>
                    <div style={labelStyle}>Reason</div>
                    <input
                      value={newSick.reason}
                      onChange={(e) => setNewSick((s) => ({ ...s, reason: e.target.value }))}
                      placeholder="e.g. Flu"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div style={labelStyle}>Notes</div>
                    <input
                      value={newSick.notes}
                      onChange={(e) => setNewSick((s) => ({ ...s, notes: e.target.value }))}
                      placeholder="Optional notes…"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    onClick={() =>
                      setNewSick({ employeeId: "", startDate: "", endDate: "", reason: "", notes: "" })
                    }
                    style={btnStyle}
                  >
                    Clear
                  </button>
                  <button
                    onClick={addSickLeave}
                    style={{
                      ...btnStyle,
                      border: `1px solid ${UI.brand}`,
                      background: UI.brand,
                      color: "#fff",
                      fontWeight: 1000,
                    }}
                  >
                    Save sick leave
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th>Start</Th>
                      <Th>End</Th>
                      <Th>Days</Th>
                      <Th>Reason</Th>
                      <Th>Notes</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {sickLeaves.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={emptyTd}>
                          No sick leave records yet.
                        </td>
                      </tr>
                    ) : (
                      sickLeaves.map((s) => {
                        const emp = employees.find((e) => e.id === s.employeeId);
                        return (
                          <tr key={s.id} style={rowStyle}>
                            <Td>
                              <div style={{ fontWeight: 900, color: UI.text }}>{emp?.name || "Unknown"}</div>
                              <div style={{ fontSize: 12, color: UI.muted }}>{emp?.email || ""}</div>
                            </Td>
                            <Td style={{ whiteSpace: "nowrap" }}>{s.startDate || "—"}</Td>
                            <Td style={{ whiteSpace: "nowrap" }}>{s.endDate || "—"}</Td>
                            <Td>
                              <span style={{ fontWeight: 1000, color: UI.text }}>{s.days ?? "—"}</span>
                            </Td>
                            <Td>{s.reason || "—"}</Td>
                            <Td style={{ color: UI.muted }}>{s.notes || "—"}</Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div style={{ marginTop: 18, color: UI.muted, fontSize: 12 }}>
          Collections expected: <code>users</code>, <code>employees</code>, <code>holidayAllowances</code>,{" "}
          <code>sickLeave</code>.
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ───────────────────────────────────────────
   UI bits
─────────────────────────────────────────── */
function Card({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: UI.card,
        border: UI.border,
        borderRadius: UI.radius,
        boxShadow: UI.shadowSm,
        padding: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 1000, color: UI.text }}>{title}</div>
        {subtitle && <div style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}>{subtitle}</div>}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Th({ children }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, style }) {
  return <td style={{ ...tdStyle, ...(style || {}) }}>{children}</td>;
}

/* ───────────────────────────────────────────
   Styles
─────────────────────────────────────────── */
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle = {
  textAlign: "left",
  padding: "10px",
  borderBottom: UI.border,
  fontSize: 12,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "10px",
  borderBottom: UI.border,
  verticalAlign: "middle",
  color: UI.text,
};

const rowStyle = {
  background: UI.card,
};

const emptyTd = {
  padding: 12,
  color: UI.muted,
};

const btnStyle = {
  padding: "10px 12px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: UI.card,
  cursor: "pointer",
  fontWeight: 800,
};

const topSearchStyle = {
  width: 320,
  maxWidth: "80vw",
  padding: "10px 12px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  outline: "none",
  background: UI.card,
  fontWeight: 700,
};

const pillStyle = {
  marginLeft: 8,
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 999,
  border: `1px solid ${UI.brand}`,
  background: UI.brandSoft,
  color: UI.brand,
  fontWeight: 900,
};

const selectStyle = {
  padding: "8px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  background: UI.card,
  fontWeight: 800,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 900,
  color: UI.muted,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  outline: "none",
  background: UI.card,
  fontWeight: 800,
  color: UI.text,
};

const cellInputStyle = {
  width: 110,
  maxWidth: "100%",
  padding: "8px 10px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  outline: "none",
  background: UI.card,
  fontWeight: 900,
  color: UI.text,
};

const panelStyle = {
  border: UI.border,
  borderRadius: UI.radius,
  background: "#f8fafc",
  padding: 12,
  marginBottom: 12,
};
