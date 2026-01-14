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
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

/* ───────────────────────────────────────────
   Admin gate (ONLY these emails)
─────────────────────────────────────────── */
const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

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

/* ───────────────────────────────────────────
   Timestamp-safe helpers (fixes {seconds,nanoseconds} crash)
─────────────────────────────────────────── */
const toDateSafe = (v) => {
  try {
    if (!v) return null;
    if (v?.toDate && typeof v.toDate === "function") return v.toDate(); // Firestore Timestamp
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000); // Timestamp-like
    if (v instanceof Date) return v;
    if (typeof v === "number") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00");
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
};

const fmtYMD = (v) => {
  if (!v) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = toDateSafe(v);
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toISO = (d) => (d ? d : "");

const tsToMs = (t) => {
  if (!t) return 0;
  if (typeof t?.toMillis === "function") return t.toMillis();
  const asDate = t instanceof Date ? t : new Date(t);
  const ms = asDate.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const bestUserDoc = (a, b) => {
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
  const [usersMeta, setUsersMeta] = useState({
    rawCount: 0,
    dedupedCount: 0,
    duplicates: 0,
  });

  const [employees, setEmployees] = useState([]);
  const [allowances, setAllowances] = useState([]);
  const [sickLeaves, setSickLeaves] = useState([]);

  // Sick form (add)
  const [newSick, setNewSick] = useState({
    employeeId: "",
    startDate: "",
    endDate: "",
    reason: "",
    notes: "",
  });

  // ✅ Sick edit state
  const [editingSick, setEditingSick] = useState(null); // {id, employeeId, startDate, endDate, reason, notes}
  const [savingSick, setSavingSick] = useState(false);

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
    await Promise.all([
      fetchUsers(),
      fetchEmployees(),
      fetchAllowances(),
      fetchSickLeaves(),
    ]);
  };

  const fetchUsers = async () => {
    const snap = await getDocs(
      query(collection(db, "users"), orderBy("email", "asc"))
    );
    const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byEmail = new Map();
    const rawCount = raw.length;

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
    const snap = await getDocs(
      query(collection(db, "employees"), orderBy("name", "asc"))
    );
    setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const fetchAllowances = async () => {
    const snap = await getDocs(collection(db, "holidayAllowances"));
    setAllowances(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const fetchSickLeaves = async () => {
    const snap = await getDocs(
      query(collection(db, "sickLeave"), orderBy("createdAt", "desc"))
    );
    setSickLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  /* ───────────────────────────────────────────
     Access management
  ──────────────────────────────────────────── */
  const updateUserRole = async (userId, role) => {
    await updateDoc(doc(db, "users", userId), {
      role,
      updatedAt: serverTimestamp(),
    });
    showToast("ok", "Role updated");
    await fetchUsers();
  };

  const toggleUserEnabled = async (userId, current) => {
    await updateDoc(doc(db, "users", userId), {
      isEnabled: !current,
      updatedAt: serverTimestamp(),
    });
    showToast("ok", !current ? "User enabled" : "User disabled");
    await fetchUsers();
  };

  /* ───────────────────────────────────────────
     Holiday allowance management (legacy table)
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
     Sick leave (add)
  ──────────────────────────────────────────── */
  const addSickLeave = async () => {
    if (!newSick.employeeId) return showToast("warn", "Select an employee");
    if (!newSick.startDate || !newSick.endDate)
      return showToast("warn", "Pick start + end date");

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

    setNewSick({
      employeeId: "",
      startDate: "",
      endDate: "",
      reason: "",
      notes: "",
    });
    showToast("ok", "Sick leave recorded");
    await fetchSickLeaves();
  };

  /* ───────────────────────────────────────────
     Sick leave (edit)
  ──────────────────────────────────────────── */
  const startEditSick = (s) => {
    setEditingSick({
      id: s.id,
      employeeId: s.employeeId || "",
      startDate: fmtYMD(s.startDate) === "—" ? "" : fmtYMD(s.startDate),
      endDate: fmtYMD(s.endDate) === "—" ? "" : fmtYMD(s.endDate),
      reason: s.reason || "",
      notes: s.notes || "",
    });
  };

  const cancelEditSick = () => setEditingSick(null);

  const saveEditSick = async () => {
    if (!editingSick) return;

    if (!editingSick.employeeId) return showToast("warn", "Select an employee");
    if (!editingSick.startDate || !editingSick.endDate)
      return showToast("warn", "Pick start + end date");

    const days = daysBetweenInclusive(editingSick.startDate, editingSick.endDate);
    if (days <= 0) return showToast("warn", "Dates look invalid");

    setSavingSick(true);
    try {
      await updateDoc(doc(db, "sickLeave", editingSick.id), {
        employeeId: editingSick.employeeId,
        startDate: editingSick.startDate, // stored as yyyy-mm-dd
        endDate: editingSick.endDate, // stored as yyyy-mm-dd
        days,
        reason: editingSick.reason || "",
        notes: editingSick.notes || "",
        updatedAt: serverTimestamp(),
        updatedBy: me?.email || "",
      });

      showToast("ok", "Sick leave updated");
      setEditingSick(null);
      await fetchSickLeaves();
    } catch (e) {
      showToast("error", e?.message || "Failed to update");
    } finally {
      setSavingSick(false);
    }
  };

  const deleteSickLeave = async (id) => {
    if (!confirm("Delete this sick leave record?")) return;
    try {
      await deleteDoc(doc(db, "sickLeave", id));
      showToast("ok", "Deleted");
      await fetchSickLeaves();
    } catch (e) {
      showToast("error", e?.message || "Failed to delete");
    }
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
      <div
        style={{
          padding: 22,
          background: UI.bg,
          minHeight: "calc(100vh - 60px)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: UI.gap,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: UI.text }}>
              Admin
            </div>
            <div style={{ color: UI.muted, marginTop: 4 }}>
              Only <b>{ADMIN_EMAILS.join(", ")}</b> can access this page.
            </div>
            <div style={{ color: UI.muted, marginTop: 6, fontSize: 12 }}>
              Users: {usersMeta.dedupedCount} (raw {usersMeta.rawCount}, duplicates{" "}
              {usersMeta.duplicates})
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="Search employees (name or email)…"
              style={topSearchStyle}
            />

            <button
              onClick={() => router.push("/deleted-bookings")}
              style={btnStyle}
              title="View deleted bookings"
            >
              Deleted bookings
            </button>

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
              color:
                toast.type === "ok"
                  ? UI.ok
                  : toast.type === "warn"
                  ? UI.warn
                  : UI.danger,
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
                                title={
                                  locked
                                    ? "This account is part of the admin gate"
                                    : "Enable/disable this user"
                                }
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
          {activeTab === Tabs.HOLIDAY && <EmployeesHolidayAllowancesTab />}

          {/* SICK */}
          {activeTab === Tabs.SICK && (
            <Card title="Sick Leave" subtitle="Add, edit and view records">
              {/* Add sick leave */}
              <div style={panelStyle}>
                <div style={{ fontWeight: 1000, color: UI.text, marginBottom: 10 }}>
                  Add sick leave
                </div>

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
                          {e.name || "Unnamed"}
                          {e.email ? ` (${e.email})` : ""}
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
                      setNewSick({
                        employeeId: "",
                        startDate: "",
                        endDate: "",
                        reason: "",
                        notes: "",
                      })
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

              {/* Edit sick leave */}
              {editingSick && (
                <div
                  style={{
                    ...panelStyle,
                    border: `1px solid ${UI.brand}`,
                    background: UI.brandSoft,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 1000, color: UI.text }}>Edit sick leave</div>
                    <div style={{ fontSize: 12, color: UI.muted }}>
                      Record: <b>{editingSick.id}</b>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <div style={labelStyle}>Employee</div>
                      <select
                        value={editingSick.employeeId}
                        onChange={(e) => setEditingSick((p) => ({ ...p, employeeId: e.target.value }))}
                        style={inputStyle}
                      >
                        <option value="">Select employee…</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name || "Unnamed"}
                            {e.email ? ` (${e.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={labelStyle}>Start date</div>
                      <input
                        type="date"
                        value={editingSick.startDate}
                        onChange={(e) => setEditingSick((p) => ({ ...p, startDate: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <div style={labelStyle}>End date</div>
                      <input
                        type="date"
                        value={editingSick.endDate}
                        onChange={(e) => setEditingSick((p) => ({ ...p, endDate: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <div style={labelStyle}>Reason</div>
                      <input
                        value={editingSick.reason}
                        onChange={(e) => setEditingSick((p) => ({ ...p, reason: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>Notes</div>
                      <input
                        value={editingSick.notes}
                        onChange={(e) => setEditingSick((p) => ({ ...p, notes: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button onClick={cancelEditSick} style={btnStyle}>
                      Cancel
                    </button>
                    <button
                      onClick={saveEditSick}
                      disabled={savingSick}
                      style={{
                        ...btnStyle,
                        border: `1px solid ${UI.brand}`,
                        background: UI.brand,
                        color: "#fff",
                        fontWeight: 1000,
                      }}
                    >
                      {savingSick ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              )}

              {/* Records table */}
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
                      <Th>Actions</Th>
                    </tr>
                  </thead>

                  <tbody>
                    {sickLeaves.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={emptyTd}>
                          No sick leave records yet.
                        </td>
                      </tr>
                    ) : (
                      sickLeaves.map((s) => {
                        const emp = employees.find((e) => e.id === s.employeeId);
                        return (
                          <tr key={s.id} style={rowStyle}>
                            <Td>
                              <div style={{ fontWeight: 900, color: UI.text }}>
                                {emp?.name || "Unknown"}
                              </div>
                              <div style={{ fontSize: 12, color: UI.muted }}>
                                {emp?.email || ""}
                              </div>
                            </Td>

                            <Td style={{ whiteSpace: "nowrap" }}>{fmtYMD(s.startDate)}</Td>
                            <Td style={{ whiteSpace: "nowrap" }}>{fmtYMD(s.endDate)}</Td>

                            <Td>
                              <span style={{ fontWeight: 1000, color: UI.text }}>
                                {s.days ?? "—"}
                              </span>
                            </Td>

                            <Td>{s.reason || "—"}</Td>
                            <Td style={{ color: UI.muted }}>{s.notes || "—"}</Td>

                            <Td>
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                <button
                                  onClick={() => startEditSick(s)}
                                  style={{
                                    ...btnStyle,
                                    border: `1px solid ${UI.brand}`,
                                    background: UI.brandSoft,
                                    color: UI.brand,
                                    fontWeight: 1000,
                                  }}
                                >
                                  Edit
                                </button>

                                <button
                                  onClick={() => deleteSickLeave(s.id)}
                                  style={{
                                    ...btnStyle,
                                    border: "1px solid #fecaca",
                                    background: "#fee2e2",
                                    color: UI.danger,
                                    fontWeight: 1000,
                                  }}
                                >
                                  Delete
                                </button>
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
        </div>

        <div style={{ marginTop: 18, color: UI.muted, fontSize: 12 }}>
          Collections expected: <code>users</code>, <code>employees</code>,{" "}
          <code>holidays</code>, <code>sickLeave</code>. (Legacy optional:{" "}
          <code>holidayAllowances</code>)
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
        <div style={{ fontSize: 16, fontWeight: 1000, color: UI.text }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ marginTop: 4, color: UI.muted, fontSize: 13 }}>
            {subtitle}
          </div>
        )}
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

/* ────────────────────────────────────────────────────────────────
   Holiday Allowances Tab (Employees collection + Holidays usage)
──────────────────────────────────────────────────────────────── */
const HA_thisYear = new Date().getFullYear();
const HA_nextYear = HA_thisYear + 1;

const HA_MAX_CARRY = 5;
const HA_DEFAULT_PATTERN = "full_time";

// Base entitlement rules (Full time = 22)
const HA_BASE_FULL_TIME = 22;
const HA_ENTITLEMENT = {
  full_time: HA_BASE_FULL_TIME,
  four_days: HA_BASE_FULL_TIME * (4 / 5),
  three_days: HA_BASE_FULL_TIME * (3 / 5),
};

const HA_PATTERN_LABEL = {
  full_time: "Full time",
  four_days: "4 days / week",
  three_days: "3 days / week",
};

function HA_entitlementFor(pattern) {
  const v = HA_ENTITLEMENT[pattern] ?? HA_ENTITLEMENT.full_time;
  return Math.round(v);
}

function HA_countWeekdays(start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function HA_pickName(x = {}) {
  return (
    x.name ||
    x.fullName ||
    x.employee ||
    x.employeeName ||
    x.displayName ||
    ""
  );
}

const HA_asNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const HA_clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function HA_balanceTone(bal) {
  if (bal < 0) return "bad";
  if (bal <= 2) return "warn";
  return "good";
}

function HA_Pill({ tone = "default", children }) {
  const tones = {
    default: { bg: "#f3f4f6", fg: "#111827", br: "#e5e7eb" },
    good: { bg: "#dcfce7", fg: "#14532d", br: "#bbf7d0" },
    warn: { bg: "#fff7ed", fg: "#7c2d12", br: "#fed7aa" },
    bad: { bg: "#fee2e2", fg: "#7f1d1d", br: "#fecaca" },
    info: { bg: UI.brandSoft, fg: UI.brand, br: "#dbeafe" },
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

function HA_StatTile({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "#fff", br: "#e5e7eb" },
    soft: { bg: UI.brandSoft, br: "#dbeafe" },
    warn: { bg: "#fff7ed", br: "#fed7aa" },
  };
  const t = tones[tone] || tones.default;
  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.br}`,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: UI.muted,
          fontWeight: 900,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 20,
          fontWeight: 950,
          color: UI.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EmployeesHolidayAllowancesTab() {
  const [loading, setLoading] = useState(true);
  const [yearView, setYearView] = useState(HA_thisYear);

  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState({});
  const [edits, setEdits] = useState({});
  const [usedByYearName, setUsedByYearName] = useState({});
  const [q, setQ] = useState("");

  const [newName, setNewName] = useState("");
  const [newPattern, setNewPattern] = useState(HA_DEFAULT_PATTERN);
  const [newCarry, setNewCarry] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const empSnap = await getDocs(collection(db, "employees"));
        const list = empSnap.docs.map((d) => {
          const x = d.data() || {};
          const pattern = x.workPattern || HA_DEFAULT_PATTERN;
          return {
            id: d.id,
            name: HA_pickName(x),
            workPattern: pattern,
            holidayAllowance: HA_asNum(
              x.holidayAllowance,
              HA_entitlementFor(pattern)
            ),
            carriedOverDays: HA_asNum(x.carriedOverDays, 0),
            holidayAllowances: x.holidayAllowances || {},
            carryOverByYear: x.carryOverByYear || {},
          };
        });

        const holSnap = await getDocs(collection(db, "holidays"));
        const used = { [HA_thisYear]: {}, [HA_nextYear]: {} };

        holSnap.docs.forEach((d) => {
          const x = d.data() || {};
          const name = x.employee;
          if (!name || !x.startDate || !x.endDate) return;

          // ✅ can be string OR Timestamp
          const start = toDateSafe(x.startDate);
          const end = toDateSafe(x.endDate);
          if (!start || !end) return;

          if (start.getFullYear() !== end.getFullYear()) return;
          const yr = start.getFullYear();
          if (yr !== HA_thisYear && yr !== HA_nextYear) return;

          const days = HA_countWeekdays(start, end);
          used[yr][name] = (used[yr][name] || 0) + days;
        });

        setRows(list);
        setUsedByYearName(used);

        const seed = {};
        for (const r of list) {
          const pattern = r.workPattern || HA_DEFAULT_PATTERN;
          const base = HA_entitlementFor(pattern);

          const allowThis =
            r.holidayAllowances?.[String(HA_thisYear)] !== undefined
              ? HA_asNum(r.holidayAllowances[String(HA_thisYear)], base)
              : HA_asNum(r.holidayAllowance, base);

          const carryThis =
            r.carryOverByYear?.[String(HA_thisYear)] !== undefined
              ? HA_asNum(r.carryOverByYear[String(HA_thisYear)], 0)
              : HA_asNum(r.carriedOverDays, 0);

          const allowNext =
            r.holidayAllowances?.[String(HA_nextYear)] !== undefined
              ? HA_asNum(r.holidayAllowances[String(HA_nextYear)], base)
              : base;

          const storedNextCarry =
            r.carryOverByYear?.[String(HA_nextYear)] !== undefined
              ? HA_asNum(r.carryOverByYear[String(HA_nextYear)], 0)
              : undefined;

          const usedThis = used[HA_thisYear]?.[r.name] || 0;
          const balThis = allowThis + carryThis - usedThis;
          const autoNextCarry = HA_clamp(balThis, 0, HA_MAX_CARRY);

          seed[r.id] = {
            name: r.name,
            workPattern: pattern,
            byYear: {
              [HA_thisYear]: {
                holidayAllowance: allowThis,
                carriedOverDays: carryThis,
              },
              [HA_nextYear]: {
                holidayAllowance: allowNext,
                carriedOverDays:
                  storedNextCarry !== undefined
                    ? HA_clamp(storedNextCarry, 0, HA_MAX_CARRY)
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

  const filteredRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => (r.name || "").toLowerCase().includes(term));
  }, [rows, q]);

  const usedForYearByName = (yr, name) => usedByYearName?.[yr]?.[name] || 0;

  const getPattern = (r) =>
    edits?.[r.id]?.workPattern ?? r.workPattern ?? HA_DEFAULT_PATTERN;

  const getAllowanceForYear = (r, yr) => {
    const pattern = getPattern(r);
    const fallback = HA_entitlementFor(pattern);

    const slot = edits?.[r.id]?.byYear?.[yr] || {};
    if (slot.holidayAllowance !== undefined)
      return HA_asNum(slot.holidayAllowance, fallback);

    const mapVal = r.holidayAllowances?.[String(yr)];
    if (mapVal !== undefined) return HA_asNum(mapVal, fallback);

    return HA_asNum(r.holidayAllowance, fallback);
  };

  const getCarryForYear = (r, yr) => {
    const slot = edits?.[r.id]?.byYear?.[yr] || {};
    if (slot.carriedOverDays !== undefined)
      return HA_asNum(slot.carriedOverDays, 0);

    const mapVal = r.carryOverByYear?.[String(yr)];
    if (mapVal !== undefined) return HA_asNum(mapVal, 0);

    return HA_asNum(r.carriedOverDays, 0);
  };

  const balanceForYear = (r, yr) => {
    const allowance = getAllowanceForYear(r, yr);
    const carry = getCarryForYear(r, yr);
    const used = usedForYearByName(yr, r.name);
    return allowance + carry - used;
  };

  const onEditName = (id, val) =>
    setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), name: val } }));

  const onEditPattern = (r, pattern) => {
    const id = r.id;
    const derived = HA_entitlementFor(pattern);

    setEdits((p) => {
      const prev = p[id] || {};
      const byYear = { ...(prev.byYear || {}) };

      byYear[HA_thisYear] = {
        ...(byYear[HA_thisYear] || {}),
        holidayAllowance: derived,
      };
      byYear[HA_nextYear] = {
        ...(byYear[HA_nextYear] || {}),
        holidayAllowance: derived,
      };

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
            holidayAllowance: HA_asNum(val, 0),
          },
        },
      },
    }));
  };

  const onEditCarry = (r, val) => {
    const yr = yearView;
    let nextVal = HA_asNum(val, 0);

    if (yr === HA_nextYear) nextVal = HA_clamp(nextVal, 0, HA_MAX_CARRY);
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

  const saveRow = async (r) => {
    const e = edits?.[r.id] || {};
    const name = (e.name ?? r.name ?? "").trim();
    const pattern = e.workPattern ?? r.workPattern ?? HA_DEFAULT_PATTERN;

    if (!name) return alert("Name is required.");

    const allowance = getAllowanceForYear(r, yearView);
    const carry = getCarryForYear(r, yearView);

    if (allowance < 0 || carry < 0) return alert("Numbers must be ≥ 0.");
    if (yearView === HA_nextYear && carry > HA_MAX_CARRY)
      return alert(`Carry over cannot exceed ${HA_MAX_CARRY} days.`);

    const yrKey = String(yearView);

    setSaving((p) => ({ ...p, [r.id]: true }));
    try {
      const nextAllowances = {
        ...(r.holidayAllowances || {}),
        [yrKey]: allowance,
      };
      const nextCarry = { ...(r.carryOverByYear || {}), [yrKey]: carry };

      const legacyPatch =
        yearView === HA_thisYear
          ? { holidayAllowance: allowance, carriedOverDays: carry }
          : {};

      await updateDoc(doc(db, "employees", r.id), {
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
                ...(yearView === HA_thisYear
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

  const deleteRow = async (r) => {
    if (!confirm(`Delete employee "${r.name}"?`)) return;

    setSaving((p) => ({ ...p, [r.id]: true }));
    try {
      await deleteDoc(doc(db, "employees", r.id));

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

  const addEmployee = async () => {
    const name = (newName || "").trim();
    const pattern = newPattern || HA_DEFAULT_PATTERN;
    if (!name) return alert("Name is required.");

    const allowance = HA_entitlementFor(pattern);
    const carry = Math.max(0, HA_asNum(newCarry, 0));

    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "employees"), {
        name,
        workPattern: pattern,
        holidayAllowance: allowance,
        carriedOverDays: carry,
        holidayAllowances: { [String(HA_thisYear)]: allowance },
        carryOverByYear: { [String(HA_thisYear)]: carry },
      });

      const newRow = {
        id: docRef.id,
        name,
        workPattern: pattern,
        holidayAllowance: allowance,
        carriedOverDays: carry,
        holidayAllowances: { [String(HA_thisYear)]: allowance },
        carryOverByYear: { [String(HA_thisYear)]: carry },
      };

      setRows((l) => [newRow, ...l]);
      setEdits((p) => ({
        ...p,
        [docRef.id]: {
          name,
          workPattern: pattern,
          byYear: {
            [HA_thisYear]: { holidayAllowance: allowance, carriedOverDays: carry },
            [HA_nextYear]: { holidayAllowance: allowance, carriedOverDays: 0 },
          },
        },
      }));

      setNewName("");
      setNewPattern(HA_DEFAULT_PATTERN);
      setNewCarry(0);

      alert("Employee added.");
    } catch (err) {
      alert(`Failed to add: ${err?.message || err}`);
    } finally {
      setAdding(false);
    }
  };

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

  return (
    <Card
      title="Employees — Holiday Allowances"
      subtitle={`Work pattern sets base allowance (FT = ${HA_BASE_FULL_TIME}). Carry into next year capped at ${HA_MAX_CARRY}.`}
    >
      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={pillStyle}>Viewing: {yearView}</span>
          <select
            value={yearView}
            onChange={(e) => setYearView(Number(e.target.value))}
            style={selectStyle}
          >
            <option value={HA_thisYear}>{HA_thisYear} (Current)</option>
            <option value={HA_nextYear}>{HA_nextYear} (Next)</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employees…"
            style={topSearchStyle}
          />
          <span style={{ color: UI.muted, fontSize: 12 }}>
            Showing <b>{filteredRows.length}</b>
          </span>
        </div>
      </div>

      {/* Add employee */}
      <div style={{ ...panelStyle, marginTop: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 1000, color: UI.text }}>Add employee</div>
          <HA_Pill tone="info">Base: {HA_entitlementFor(newPattern)} days</HA_Pill>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.9fr 0.8fr auto",
            gap: 10,
            marginTop: 10,
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            style={inputStyle}
          />
          <select
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            style={selectStyle}
          >
            <option value="full_time">{HA_PATTERN_LABEL.full_time}</option>
            <option value="four_days">{HA_PATTERN_LABEL.four_days}</option>
            <option value="three_days">{HA_PATTERN_LABEL.three_days}</option>
          </select>
          <input
            type="number"
            min={0}
            value={newCarry}
            onChange={(e) => setNewCarry(e.target.value)}
            placeholder={`Carry (${HA_thisYear})`}
            style={cellInputStyle}
          />
          <button
            onClick={addEmployee}
            disabled={adding}
            style={{
              ...btnStyle,
              border: `1px solid ${UI.brand}`,
              background: UI.brand,
              color: "#fff",
              fontWeight: 1000,
            }}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0,1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <HA_StatTile label="People" value={kpis.people} tone="soft" />
        <HA_StatTile label="Used" value={kpis.totalUsed} />
        <HA_StatTile label="Allowance" value={kpis.totalAllowance} />
        <HA_StatTile label="Carry" value={kpis.totalCarry} tone="warn" />
        <div style={{ gridColumn: "1 / -1" }}>
          <HA_StatTile
            label="Total balance"
            value={kpis.totalBalance}
            tone={kpis.totalBalance < 0 ? "warn" : "soft"}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Work Pattern</Th>
              <Th>Allowance</Th>
              <Th>Carry</Th>
              <Th>Total</Th>
              <Th>Used</Th>
              <Th>Balance</Th>
              <Th>Actions</Th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={emptyTd}>
                  Loading…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={emptyTd}>
                  No employees found.
                </td>
              </tr>
            ) : (
              filteredRows.map((r, idx) => {
                const e = edits?.[r.id] || {};
                const name = e.name ?? r.name;

                const pattern = e.workPattern ?? r.workPattern ?? HA_DEFAULT_PATTERN;
                const allowance = getAllowanceForYear(r, yearView);
                const carry = getCarryForYear(r, yearView);
                const used = usedForYearByName(yearView, r.name);

                const total = allowance + carry;
                const balance = total - used;

                const balThis = balanceForYear(r, HA_thisYear);
                const recommendedCarry = HA_clamp(balThis, 0, HA_MAX_CARRY);

                return (
                  <tr key={r.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <Td>
                      <input
                        value={name}
                        onChange={(ev) => onEditName(r.id, ev.target.value)}
                        style={{ ...inputStyle, minWidth: 220 }}
                      />
                    </Td>

                    <Td>
                      <select
                        value={pattern}
                        onChange={(ev) => onEditPattern(r, ev.target.value)}
                        style={selectStyle}
                      >
                        <option value="full_time">{HA_PATTERN_LABEL.full_time}</option>
                        <option value="four_days">{HA_PATTERN_LABEL.four_days}</option>
                        <option value="three_days">{HA_PATTERN_LABEL.three_days}</option>
                      </select>

                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <HA_Pill tone="gray">Base {HA_entitlementFor(pattern)}</HA_Pill>
                        {pattern !== "full_time" ? (
                          <HA_Pill tone="info">Pro-rata</HA_Pill>
                        ) : (
                          <HA_Pill tone="good">FT</HA_Pill>
                        )}
                      </div>
                    </Td>

                    <Td>
                      <input
                        type="number"
                        min={0}
                        value={allowance}
                        onChange={(ev) => onEditAllowance(r.id, ev.target.value)}
                        style={cellInputStyle}
                      />
                    </Td>

                    <Td>
                      <div style={{ display: "grid", gap: 6 }}>
                        <input
                          type="number"
                          min={0}
                          max={yearView === HA_nextYear ? HA_MAX_CARRY : undefined}
                          value={carry}
                          onChange={(ev) => onEditCarry(r, ev.target.value)}
                          style={cellInputStyle}
                        />
                        {yearView === HA_nextYear ? (
                          <div style={{ fontSize: 12, color: UI.muted }}>
                            Recommended (from {HA_thisYear} balance): <b>{recommendedCarry}</b> •{" "}
                            {HA_thisYear} bal: <b>{balThis}</b>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: UI.muted }}>Current-year carry</div>
                        )}
                      </div>
                    </Td>

                    <Td>
                      <HA_Pill tone="info">{total}</HA_Pill>
                    </Td>
                    <Td>
                      <HA_Pill tone="gray">{used}</HA_Pill>
                    </Td>
                    <Td>
                      <HA_Pill tone={HA_balanceTone(balance)}>{balance}</HA_Pill>
                    </Td>

                    <Td>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={() => saveRow(r)}
                          disabled={!!saving[r.id]}
                          style={{
                            ...btnStyle,
                            border: `1px solid ${UI.brand}`,
                            background: UI.brand,
                            color: "#fff",
                            fontWeight: 1000,
                          }}
                        >
                          {saving[r.id] ? "Saving…" : `Save (${yearView})`}
                        </button>

                        <button
                          onClick={() => deleteRow(r)}
                          disabled={!!saving[r.id]}
                          style={{
                            ...btnStyle,
                            border: "1px solid #fecaca",
                            background: "#fee2e2",
                            color: UI.danger,
                            fontWeight: 1000,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, color: UI.muted, fontSize: 12, lineHeight: 1.55 }}>
        Tip: “Used” is calculated from the <code>holidays</code> collection (Mon–Fri only). Ensure{" "}
        <code>holidays.employee</code> matches the employee <code>name</code> exactly.
      </div>
    </Card>
  );
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

const rowStyle = {
  background: UI.card,
};
