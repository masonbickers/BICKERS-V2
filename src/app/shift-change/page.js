"use client";

import React, { useEffect, useMemo, useState } from "react";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { auth, db } from "../../../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Timer,
  XCircle,
} from "lucide-react";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const ADMIN_EMAILS = new Set([
  "mason@bickers.co.uk",
]);

const UI = {
  radius: "var(--radius-md)",
  border: "var(--border-default)",
  bg: "var(--color-canvas)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-soft)",
  brandBorder: "var(--color-brand-border)",
  green: "var(--legacy-color-15803d)",
  greenSoft: "var(--legacy-color-ecfdf3)",
  greenBorder: "var(--color-success-border)",
  amber: "var(--legacy-color-b45309)",
  amberSoft: "var(--legacy-color-fffbeb)",
  amberBorder: "var(--legacy-color-fde68a)",
  red: "var(--legacy-color-b91c1c)",
  redSoft: "var(--legacy-color-fee2e2)",
  redBorder: "var(--color-danger-border)",
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const ymdLabel = (value) => {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
};
const userEmail = () => String(auth.currentUser?.email || "").trim().toLowerCase();
const userName = () => String(auth.currentUser?.displayName || auth.currentUser?.email || "Unknown").trim();
const employeeName = (employee = {}) =>
  String(employee.name || employee.employeeName || employee.fullName || employee.displayName || "").trim();

export default function ShiftChangePage() {
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({
    employeeId: "",
    date: todayISO(),
    startTime: "",
    finishTime: "",
    reason: "",
    createApproved: false,
  });

  const isAdmin = ADMIN_EMAILS.has(userEmail());

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === form.employeeId) || null,
    [employees, form.employeeId]
  );

  const stats = useMemo(() => {
    const active = requests.filter((row) => row.status !== "declined" && row.status !== "cancelled");
    return {
      requested: requests.filter((row) => row.status === "requested").length,
      approvedToday: active.filter((row) => row.status === "approved" && row.date === todayISO()).length,
      upcoming: active.filter((row) => String(row.date || "") >= todayISO()).length,
    };
  }, [requests]);

  const loadData = async () => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "shiftChangeRequests", operation: "load shift changes" });
      setEmployees([]);
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [employeeSnap, shiftSnap] = await Promise.all([
        getDocs(tenantCollectionQuery(db, "employees", dataAccessState)),
        getDocs(tenantCollectionQuery(db, "shiftChangeRequests", dataAccessState)),
      ]);

      const employeeRows = employeeSnap.docs
        .map((snap) => ({ id: snap.id, ...(snap.data() || {}) }))
        .filter((employee) => employeeName(employee))
        .sort((a, b) => employeeName(a).localeCompare(employeeName(b)));

      const requestRows = shiftSnap.docs
        .map((snap) => ({ id: snap.id, ...(snap.data() || {}) }))
        .sort((a, b) => {
          const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
          if (dateCompare) return dateCompare;
          return String(b.createdAt?.seconds || "").localeCompare(String(a.createdAt?.seconds || ""));
        });

      setEmployees(employeeRows);
      setRequests(requestRows);

      if (!form.employeeId && employeeRows.length) {
        const own = employeeRows.find(
          (employee) => String(employee.email || "").trim().toLowerCase() === userEmail()
        );
        setForm((current) => ({ ...current, employeeId: (own || employeeRows[0]).id }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch((error) => {
      console.error("Failed loading shift changes:", error);
      setToast("Could not load shift changes.");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, dataAccessState]);

  const saveRequest = async (event) => {
    event.preventDefault();
    if (!selectedEmployee) return setToast("Pick an employee.");
    if (!form.date || !form.startTime || !form.finishTime) return setToast("Add date, start and finish time.");

    setSaving(true);
    setToast("");
    try {
      const status = isAdmin && form.createApproved ? "approved" : "requested";
      const nowUser = {
        uid: auth.currentUser?.uid || "",
        email: userEmail(),
        name: userName(),
      };
      await addDoc(collection(db, "shiftChangeRequests"), tenantPayload(dataAccessState, {
        employeeId: selectedEmployee.id,
        employeeName: employeeName(selectedEmployee),
        employeeEmail: String(selectedEmployee.email || "").trim().toLowerCase(),
        date: form.date,
        startTime: form.startTime,
        finishTime: form.finishTime,
        reason: form.reason.trim(),
        status,
        requestedByUid: nowUser.uid,
        requestedByEmail: nowUser.email,
        requestedByName: nowUser.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(status === "approved"
          ? {
              approvedByUid: nowUser.uid,
              approvedByEmail: nowUser.email,
              approvedByName: nowUser.name,
              approvedAt: serverTimestamp(),
            }
          : {}),
      }));

      setForm((current) => ({
        ...current,
        date: todayISO(),
        startTime: "",
        finishTime: "",
        reason: "",
        createApproved: false,
      }));
      setToast(status === "approved" ? "Approved shift change added." : "Shift change requested.");
      await loadData();
    } catch (error) {
      console.error("Failed saving shift change:", error);
      setToast("Could not save shift change.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (row, status) => {
    if (!isAdmin) return;
    setSaving(true);
    setToast("");
    try {
      const patch = {
        status,
        updatedAt: serverTimestamp(),
      };
      if (status === "approved") {
        patch.approvedByUid = auth.currentUser?.uid || "";
        patch.approvedByEmail = userEmail();
        patch.approvedByName = userName();
        patch.approvedAt = serverTimestamp();
      }
      if (status === "declined") {
        patch.declinedByUid = auth.currentUser?.uid || "";
        patch.declinedByEmail = userEmail();
        patch.declinedByName = userName();
        patch.declinedAt = serverTimestamp();
      }
      await updateDoc(doc(db, "shiftChangeRequests", row.id), tenantPayload(dataAccessState, patch));
      setToast(status === "approved" ? "Shift change approved." : "Shift change declined.");
      await loadData();
    } catch (error) {
      console.error("Failed updating shift change:", error);
      setToast("Could not update shift change.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Quick Shift Change</h1>
            <div style={sub}>
              Fast approved start/finish changes so operations and H&S know who is working when.
            </div>
          </div>
          <button type="button" style={btn("ghost")} onClick={loadData} disabled={loading}>
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>

        {toast ? <div style={notice}>{toast}</div> : null}

        <div className="shift-change-kpis" style={kpiGrid}>
          <Stat label="Awaiting Approval" value={stats.requested} icon={Clock3} tone="amber" />
          <Stat label="Approved Today" value={stats.approvedToday} icon={ShieldCheck} tone="green" />
          <Stat label="Upcoming Active" value={stats.upcoming} icon={Timer} tone="brand" />
        </div>

        <div className="shift-change-layout" style={layout}>
          <section style={panel}>
            <div style={sectionHeader}>
              <div>
                <h2 style={titleMd}>Add Shift Change</h2>
                <div style={hint}>Managers can tick “approve now” for changes already agreed.</div>
              </div>
              <Plus size={18} color={UI.brand} />
            </div>

            <form onSubmit={saveRequest} style={formGrid}>
              <Field label="Employee">
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm((current) => ({ ...current, employeeId: e.target.value }))}
                  style={input}
                >
                  <option value="">Select employee...</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employeeName(employee)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))}
                  style={input}
                />
              </Field>
              <Field label="Start">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((current) => ({ ...current, startTime: e.target.value }))}
                  style={input}
                />
              </Field>
              <Field label="Finish">
                <input
                  type="time"
                  value={form.finishTime}
                  onChange={(e) => setForm((current) => ({ ...current, finishTime: e.target.value }))}
                  style={input}
                />
              </Field>
              <Field label="Reason / note" full>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
                  placeholder="Optional: childcare, appointment, agreed early start, etc."
                  style={{ ...input, minHeight: 78, resize: "vertical" }}
                />
              </Field>
              {isAdmin ? (
                <label style={checkRow}>
                  <input
                    type="checkbox"
                    checked={form.createApproved}
                    onChange={(e) => setForm((current) => ({ ...current, createApproved: e.target.checked }))}
                  />
                  Approve immediately
                </label>
              ) : null}
              <button type="submit" style={btn()} disabled={saving}>
                {saving ? "Saving..." : form.createApproved ? "Add approved shift" : "Request shift change"}
              </button>
            </form>
          </section>

          <section style={panel}>
            <div style={sectionHeader}>
              <div>
                <h2 style={titleMd}>Shift Changes</h2>
                <div style={hint}>Approved changes are the H&S source of truth for altered hours.</div>
              </div>
              <div style={chip}>{requests.length} records</div>
            </div>

            {loading ? (
              <div style={empty}>Loading shift changes...</div>
            ) : requests.length === 0 ? (
              <div style={empty}>No shift changes yet.</div>
            ) : (
              <div style={list}>
                {requests.map((row) => (
                  <ShiftCard
                    key={row.id}
                    row={row}
                    isAdmin={isAdmin}
                    saving={saving}
                    onApprove={() => updateStatus(row, "approved")}
                    onDecline={() => updateStatus(row, "declined")}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </HeaderSidebarLayout>
  );
}

function Field({ label, children, full = false }) {
  return (
    <label style={{ display: "grid", gap: 6, gridColumn: full ? "1 / -1" : undefined }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, icon: Icon, tone }) {
  const colors = {
    brand: [UI.brand, UI.brandSoft, UI.brandBorder],
    green: [UI.green, UI.greenSoft, UI.greenBorder],
    amber: [UI.amber, UI.amberSoft, UI.amberBorder],
  };
  const [color, bg, border] = colors[tone] || colors.brand;
  return (
    <div style={statCard}>
      <span style={iconBox(color, bg, border)}><Icon size={17} /></span>
      <div>
        <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 800 }}>{label}</div>
        <div style={{ color: UI.text, fontSize: 24, fontWeight: 900, marginTop: 3 }}>{value}</div>
      </div>
    </div>
  );
}

function ShiftCard({ row, isAdmin, saving, onApprove, onDecline }) {
  const status = String(row.status || "requested").toLowerCase();
  const statusStyle =
    status === "approved"
      ? pill(UI.green, UI.greenSoft, UI.greenBorder)
      : status === "declined"
      ? pill(UI.red, UI.redSoft, UI.redBorder)
      : pill(UI.amber, UI.amberSoft, UI.amberBorder);

  return (
    <div style={requestCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, color: UI.text }}>{row.employeeName || "Unknown employee"}</div>
          <div style={{ marginTop: "var(--space-1)", color: UI.muted, fontSize: 12.5, fontWeight: 750 }}>
            {ymdLabel(row.date)} · {row.startTime || "--:--"} to {row.finishTime || "--:--"}
          </div>
        </div>
        <span style={statusStyle}>{status.replace(/\b\w/g, (m) => m.toUpperCase())}</span>
      </div>
      {row.reason ? <div style={reasonBox}>{row.reason}</div> : null}
      <div style={{ color: UI.muted, fontSize: "var(--font-size-xs)", fontWeight: 750 }}>
        Requested by {row.requestedByName || row.requestedByEmail || "-"}
        {row.approvedByName ? ` · Approved by ${row.approvedByName}` : ""}
      </div>
      {isAdmin && status === "requested" ? (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" style={btn("approve")} onClick={onApprove} disabled={saving}>
            <CheckCircle2 size={14} /> Approve
          </button>
          <button type="button" style={btn("decline")} onClick={onDecline} disabled={saving}>
            <XCircle size={14} /> Decline
          </button>
        </div>
      ) : null}
    </div>
  );
}

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { margin: 0, color: UI.text, fontSize: "var(--font-size-xl)", fontWeight: 750, lineHeight: 1.08 };
const sub = { marginTop: 6, color: UI.muted, fontSize: 13.5, lineHeight: 1.45 };
const panel = { background: UI.card, border: UI.border, borderRadius: UI.radius, padding: "var(--space-3)", boxShadow: "0 1px 2px rgba(15,23,42,0.05)" };
const sectionHeader = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 };
const titleMd = { margin: 0, fontSize: 17, fontWeight: 900, color: UI.text };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };
const layout = { display: "grid", gridTemplateColumns: "minmax(320px, 0.8fr) minmax(0, 1.2fr)", gap: "var(--space-3)", alignItems: "start" };
const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-3)" };
const statCard = { ...panel, display: "flex", alignItems: "center", gap: 10 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 };
const labelStyle = { color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".035em" };
const input = { width: "100%", minHeight: "var(--control-height-md)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-md)", padding: "8px 10px", color: UI.text, background: "var(--color-white)", fontSize: 13.5 };
const checkRow = { gridColumn: "1 / -1", display: "inline-flex", alignItems: "center", gap: "var(--space-2)", color: UI.text, fontSize: "var(--font-size-sm)", fontWeight: 850 };
const notice = { marginBottom: "var(--space-3)", border: `1px solid ${UI.brandBorder}`, background: UI.brandSoft, color: UI.text, borderRadius: UI.radius, padding: "9px 11px", fontSize: "var(--font-size-sm)", fontWeight: 800 };
const chip = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: "var(--radius-pill)", border: `1px solid ${UI.brandBorder}`, background: UI.brandSoft, color: UI.text, fontSize: "var(--font-size-xs)", fontWeight: 850 };
const list = { display: "grid", gap: "var(--space-2)", maxHeight: 650, overflowY: "auto", paddingRight: 2 };
const requestCard = { border: UI.border, borderRadius: UI.radius, background: "var(--color-white)", padding: 11, display: "grid", gap: "var(--space-2)" };
const reasonBox = { border: "1px solid var(--legacy-color-e5e7eb)", borderRadius: "var(--radius-md)", background: "var(--color-surface-subtle)", padding: "8px 9px", color: UI.text, fontSize: "var(--font-size-sm)", lineHeight: 1.4 };
const empty = { border: "1px dashed var(--color-border-strong)", borderRadius: UI.radius, padding: 18, color: UI.muted, fontSize: "var(--font-size-sm)", fontWeight: 800, textAlign: "center" };
const iconBox = (color, bg, border) => ({
  width: 34,
  height: 34,
  borderRadius: "var(--radius-md)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color,
  background: bg,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});
const pill = (color, bg, border) => ({
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  padding: "5px 8px",
  borderRadius: "var(--radius-pill)",
  border: `1px solid ${border}`,
  background: bg,
  color,
  fontSize: "var(--font-size-xs)",
  fontWeight: 900,
});
const btn = (kind = "primary") => {
  if (kind === "approve") return { ...buttonBase, border: `1px solid ${UI.greenBorder}`, background: UI.greenSoft, color: UI.green };
  if (kind === "decline") return { ...buttonBase, border: `1px solid ${UI.redBorder}`, background: UI.redSoft, color: UI.red };
  if (kind === "ghost") return { ...buttonBase, border: `1px solid ${UI.brandBorder}`, background: "var(--color-white)", color: UI.text };
  return { ...buttonBase, border: `1px solid ${UI.brand}`, background: UI.brand, color: "var(--color-white)", gridColumn: "1 / -1" };
};
const buttonBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  padding: "8px 10px",
  borderRadius: UI.radius,
  fontSize: 12.5,
  fontWeight: 900,
  cursor: "pointer",
};
