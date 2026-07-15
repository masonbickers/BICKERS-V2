"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { addDoc, collection, getDocs, onSnapshot, serverTimestamp, Timestamp } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { ArrowLeft, CalendarCheck2, CheckCircle2, FileCheck2, History, Paperclip, Save, Search, ShieldAlert, ShieldCheck, Upload, X } from "lucide-react";
import { auth, db, storage } from "../../../../firebaseConfig";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";

const UI = {
  radius: "var(--radius-md)",
  shadowSm: "var(--shadow-sm)",
  border: "var(--border-default)",
  bg: "var(--color-canvas)",
  card: "var(--color-surface)",
  text: "var(--color-text)",
  muted: "var(--color-text-muted)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-soft)",
  brandBorder: "var(--color-brand-border)",
  danger: "var(--legacy-color-dc2626)",
  amber: "var(--legacy-color-d97706)",
  green: "var(--legacy-color-16a34a)",
};

const TRAINING_ITEMS = [
  { id: "staff-training", label: "Staff Training", type: "Training" },
  { id: "first-aid-training", label: "First Aid Training", type: "Training" },
  { id: "computer-display-testing", label: "Computer Display Testing", type: "Training" },
  { id: "uniform", label: "Uniform Issue / Briefing", type: "Record" },
  { id: "policy-review", label: "Policy Review", type: "Policy" },
  { id: "welfare-policy", label: "Welfare Policy", type: "Policy" },
  { id: "workshop-risk-assessment", label: "Workshop Risk Assessment", type: "Policy" },
  { id: "tracking-risk-assessment", label: "Tracking Risk Assessment", type: "Policy" },
  { id: "coshh", label: "COSHH", type: "Policy" },
];

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-3)",
  flexWrap: "wrap",
  marginBottom: 14,
};
const h1 = { margin: 0, fontSize: "var(--font-size-xl)", lineHeight: 1.08, fontWeight: 750, color: UI.text, letterSpacing: 0 };
const sub = { margin: "6px 0 0", color: UI.muted, fontSize: 13.5, lineHeight: 1.45 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...surface, padding: "var(--space-3)" };
const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: "-0.01em" };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 5, lineHeight: 1.45 };
const smallLabel = { margin: 0, color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const input = {
  width: "100%",
  minHeight: "var(--control-height-md)",
  padding: "7px 10px",
  borderRadius: UI.radius,
  border: UI.border,
  outline: "none",
  fontSize: "var(--font-size-sm)",
  background: "var(--color-white)",
  color: UI.text,
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "6px 9px",
      borderRadius: UI.radius,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, var(--color-white) 0%, var(--legacy-color-f8fbfe) 100%)",
      color: UI.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 10px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.75)",
      fontSize: 12.5,
      lineHeight: 1.2,
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 10px",
    borderRadius: UI.radius,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, var(--legacy-color-2a5f96) 0%, var(--color-brand) 100%)",
    color: "var(--color-white)",
    fontWeight: 850,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: "var(--font-size-sm)",
    lineHeight: 1.2,
  };
};

const employeeDisplayName = (employee = {}) =>
  employee.name ||
  employee.fullName ||
  [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
  employee.email ||
  employee.id ||
  "Employee";

const lower = (value) => String(value || "").trim().toLowerCase();

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(+date) ? null : date;
};

const fmtDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-GB") : "-";
};

const dateInputValue = (value) => {
  const date = toDate(value);
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const timestampFromDateInput = (value) => {
  if (!value) return null;
  const [yyyy, mm, dd] = value.split("-").map(Number);
  if (!yyyy || !mm || !dd) return null;
  return Timestamp.fromDate(new Date(yyyy, mm - 1, dd));
};

const safeFileName = (name) =>
  String(name || "document")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "document";

const daysUntil = (value) => {
  const date = toDate(value);
  if (!date) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((target - start) / 86400000);
};

const statusFor = (record) => {
  if (!record) return { label: "No record", tone: "brand", icon: FileCheck2 };
  const diff = daysUntil(record.expiresAt);
  if (diff != null && diff < 0) return { label: "Expired", tone: "danger", icon: ShieldAlert };
  if (diff != null && diff <= 30) return { label: "Due soon", tone: "amber", icon: CalendarCheck2 };
  return { label: "Current", tone: "green", icon: ShieldCheck };
};

const toneStyle = (tone) => {
  if (tone === "danger") return { background: "var(--legacy-color-fee2e2)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" };
  if (tone === "amber") return { background: "var(--color-warning-soft)", color: "var(--color-warning)", border: "1px solid var(--color-warning-border)" };
  if (tone === "green") return { background: "var(--legacy-color-dcfce7)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" };
  return { background: UI.brandSoft, color: UI.brand, border: `1px solid ${UI.brandBorder}` };
};

export default function TrainingPolicyPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [drafts, setDrafts] = useState({});
  const [openHistoryItem, setOpenHistoryItem] = useState("");
  const [savingItem, setSavingItem] = useState("");
  const [toast, setToast] = useState("");
  const [loadNotice, setLoadNotice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (reportDataAccessBlocked(gate, { collectionName: "employees", operation: "Load training policy records" })) {
      setLoading(false);
      return undefined;
    }

    const loadEmployees = async () => {
      try {
        const employeeSnap = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
        const employeeList = employeeSnap.docs
          .map((employeeDoc) => ({ id: employeeDoc.id, ...employeeDoc.data() }))
          .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b)));

        setEmployees(employeeList);
        setSelectedEmployeeId((current) => current || employeeList[0]?.id || "");
      } catch (error) {
        console.warn("Failed to load employees:", error);
        setLoadNotice("Employees could not be loaded for this session.");
      } finally {
        setLoading(false);
      }
    };

    loadEmployees();

    const unsubscribe = onSnapshot(
      tenantCollectionQuery(db, "employeeTrainingRecords", dataAccessState),
      (snap) => setRecords(snap.docs.map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))),
      (error) => {
        console.warn("Failed to load employee training records:", error);
        setRecords([]);
      }
    );

    return () => unsubscribe();
  }, [accessKey, dataAccessState]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredEmployees = useMemo(() => {
    const needle = lower(searchTerm);
    return employees.filter((employee) => employeeDisplayName(employee).toLowerCase().includes(needle));
  }, [employees, searchTerm]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) || filteredEmployees[0] || null,
    [employees, filteredEmployees, selectedEmployeeId]
  );

  useEffect(() => {
    if (!selectedEmployeeId && filteredEmployees[0]) {
      setSelectedEmployeeId(filteredEmployees[0].id);
    }
  }, [filteredEmployees, selectedEmployeeId]);

  const selectedRecords = useMemo(
    () =>
      records
        .filter((record) => record.employeeId === selectedEmployee?.id)
        .sort((a, b) => (toDate(b.createdAt)?.getTime() || toDate(b.completedAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || toDate(a.completedAt)?.getTime() || 0)),
    [records, selectedEmployee?.id]
  );

  const recordsByItem = useMemo(() => {
    const grouped = new Map();
    selectedRecords.forEach((record) => {
      const key = record.itemName || "";
      const current = grouped.get(key) || [];
      current.push(record);
      grouped.set(key, current);
    });
    return grouped;
  }, [selectedRecords]);

  const summary = useMemo(() => {
    const latest = TRAINING_ITEMS.map((item) => recordsByItem.get(item.label)?.[0] || null).filter(Boolean);
    return {
      current: latest.filter((record) => statusFor(record).label === "Current").length,
      dueSoon: latest.filter((record) => statusFor(record).label === "Due soon").length,
      expired: latest.filter((record) => statusFor(record).label === "Expired").length,
    };
  }, [recordsByItem]);

  const updateDraft = (itemName, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [itemName]: {
        ...(prev[itemName] || {}),
        [field]: value,
      },
    }));
  };

  const updateDraftDocuments = (itemName, fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setDrafts((prev) => {
      const current = prev[itemName]?.documents || [];
      return {
        ...prev,
        [itemName]: {
          ...(prev[itemName] || {}),
          documents: [...current, ...incoming],
        },
      };
    });
  };

  const removeDraftDocument = (itemName, index) => {
    setDrafts((prev) => ({
      ...prev,
      [itemName]: {
        ...(prev[itemName] || {}),
        documents: (prev[itemName]?.documents || []).filter((_, fileIndex) => fileIndex !== index),
      },
    }));
  };

  const saveRecord = async (item) => {
    if (!selectedEmployee) return;
    const draft = drafts[item.label] || {};
    const completedAt = timestampFromDateInput(draft.completedAt);
    const expiresAt = timestampFromDateInput(draft.expiresAt);
    const documentsToUpload = Array.isArray(draft.documents) ? draft.documents : [];

    if (!completedAt && !expiresAt && !String(draft.notes || "").trim() && !documentsToUpload.length) {
      alert("Add a completed date, expiry date, note, or document before saving.");
      return;
    }

    setSavingItem(item.label);
    try {
      const user = auth.currentUser;
      const uploadedDocuments = [];

      for (const file of documentsToUpload) {
        const path = `h-and-s/training-policy/${selectedEmployee.id}/${item.id}/${Date.now()}-${safeFileName(file.name)}`;
        const ref = storageRef(storage, path);
        const snapshot = await uploadBytes(ref, file, { contentType: file.type || "application/octet-stream" });
        const url = await getDownloadURL(snapshot.ref);
        uploadedDocuments.push({
          name: file.name || "Document",
          path,
          url,
          type: file.type || "",
          size: file.size || 0,
          uploadedAt: new Date().toISOString(),
        });
      }

      await addDoc(collection(db, "employeeTrainingRecords"), tenantPayload(dataAccessState, {
        employeeId: selectedEmployee.id,
        employeeName: employeeDisplayName(selectedEmployee),
        itemId: item.id,
        itemName: item.label,
        itemType: item.type,
        completedAt,
        expiresAt,
        notes: String(draft.notes || "").trim(),
        documents: uploadedDocuments,
        recordedBy: user?.displayName || user?.email || "Unknown user",
        createdAt: serverTimestamp(),
      }));
      setDrafts((prev) => ({ ...prev, [item.label]: {} }));
      setToast(`${item.label} saved for ${employeeDisplayName(selectedEmployee)}`);
    } catch (error) {
      console.error("Failed to save training record:", error);
      alert("Could not save training record.");
    } finally {
      setSavingItem("");
    }
  };

  return (
    <HeaderSidebarLayout>
      <main style={pageWrap}>
        <div style={headerBar}>
          <div>
            <button type="button" onClick={() => router.push("/h-and-s")} style={{ ...btn("ghost"), marginBottom: 10 }}>
              <ArrowLeft size={15} />
              Back to H&S
            </button>
            <h1 style={h1}>Training & Policy Records</h1>
            <div style={sub}>Track employee training, policy acknowledgements and expiry dates.</div>
          </div>
          {toast ? (
            <div style={{ ...toneStyle("green"), display: "inline-flex", alignItems: "center", gap: "var(--space-2)", borderRadius: "var(--radius-md)", padding: "9px 12px", fontWeight: 900, fontSize: "var(--font-size-sm)" }}>
              <CheckCircle2 size={16} />
              {toast}
            </div>
          ) : null}
        </div>

        <section className="training-shell">
          <aside style={panel}>
            {loadNotice ? (
              <div style={{ ...toneStyle("amber"), borderRadius: "var(--radius-md)", padding: "9px 10px", fontSize: 12.5, fontWeight: 850, marginBottom: 10 }}>
                {loadNotice}
              </div>
            ) : null}
            <label style={{ display: "block", marginBottom: 10 }}>
              <p style={smallLabel}>Find employee</p>
              <div style={{ position: "relative", marginTop: 6 }}>
                <Search size={15} color={UI.muted} style={{ position: "absolute", left: 10, top: 11 }} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search name..."
                  style={{ ...input, paddingLeft: "var(--space-8)" }}
                />
              </div>
            </label>

            <div style={{ display: "grid", gap: 7 }}>
              {filteredEmployees.map((employee) => {
                const active = employee.id === selectedEmployee?.id;
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => {
                      setSelectedEmployeeId(employee.id);
                      setOpenHistoryItem("");
                    }}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${active ? UI.brand : UI.brandBorder}`,
                      background: active ? UI.brandSoft : "var(--color-white)",
                      color: active ? UI.brand : UI.text,
                      borderRadius: "var(--radius-md)",
                      padding: "11px 12px",
                      cursor: "pointer",
                      fontWeight: 900,
                      boxShadow: active ? "inset 3px 0 0 var(--color-brand)" : "none",
                    }}
                  >
                    {employeeDisplayName(employee)}
                  </button>
                );
              })}
              {!filteredEmployees.length ? (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", fontWeight: 800, padding: 10 }}>
                  {loading ? "Loading employees..." : "No employees found."}
                </div>
              ) : null}
            </div>
          </aside>

          <section style={{ display: "grid", gap: "var(--space-3)", alignContent: "start" }}>
            <div style={panel}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={titleMd}>{selectedEmployee ? employeeDisplayName(selectedEmployee) : "Select an employee"}</h2>
                  <div style={hint}>Latest training and policy activity.</div>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <span style={{ ...toneStyle("green"), borderRadius: "var(--radius-pill)", padding: "5px 9px", fontSize: "var(--font-size-xs)", fontWeight: 900 }}>{summary.current} current</span>
                  <span style={{ ...toneStyle("amber"), borderRadius: "var(--radius-pill)", padding: "5px 9px", fontSize: "var(--font-size-xs)", fontWeight: 900 }}>{summary.dueSoon} due soon</span>
                  <span style={{ ...toneStyle("danger"), borderRadius: "var(--radius-pill)", padding: "5px 9px", fontSize: "var(--font-size-xs)", fontWeight: 900 }}>{summary.expired} expired</span>
                </div>
              </div>

              {selectedRecords.slice(0, 5).length ? (
                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  {selectedRecords.slice(0, 5).map((record) => (
                    <span key={record.id} style={{ border: UI.border, background: "var(--legacy-color-f8fbfe)", color: UI.text, borderRadius: "var(--radius-pill)", padding: "6px 9px", fontSize: 12.5, fontWeight: 850 }}>
                      {record.itemName} / expires {fmtDate(record.expiresAt)}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ color: UI.muted, fontSize: "var(--font-size-sm)", fontWeight: 800 }}>No training or policy records saved for this employee yet.</div>
              )}
            </div>

            <div className="training-card-grid">
              {TRAINING_ITEMS.map((item) => {
                const itemRecords = recordsByItem.get(item.label) || [];
                const latest = itemRecords[0] || null;
                const state = statusFor(latest);
                const StateIcon = state.icon;
                const draft = drafts[item.label] || {};
                const historyOpen = openHistoryItem === item.label;

                return (
                  <article key={item.id} style={{ ...surface, padding: 14 }}>
                    <div style={sectionHeader}>
                      <div>
                        <h3 style={{ margin: 0, color: UI.text, fontSize: "var(--font-size-lg)", fontWeight: 900 }}>{item.label}</h3>
                        <div style={{ ...hint, marginTop: 5 }}>{item.type}</div>
                      </div>
                      <span style={{ ...toneStyle(state.tone), display: "inline-flex", alignItems: "center", gap: 6, borderRadius: "var(--radius-pill)", padding: "5px 9px", fontSize: "var(--font-size-xs)", fontWeight: 900 }}>
                        <StateIcon size={14} />
                        {state.label}
                      </span>
                    </div>

                    <div style={{ display: "grid", gap: "var(--space-1)", marginBottom: "var(--space-3)", color: UI.muted, fontSize: "var(--font-size-sm)", fontWeight: 750 }}>
                      <div>Completed: {latest ? fmtDate(latest.completedAt) : "-"}</div>
                      <div>Expires: {latest ? fmtDate(latest.expiresAt) : "-"}</div>
                      <div>Documents: {latest?.documents?.length ? latest.documents.length : "-"}</div>
                    </div>

                    <div className="training-form-grid">
                      <label>
                        <p style={smallLabel}>Completed</p>
                        <input type="date" value={draft.completedAt ?? dateInputValue(latest?.completedAt)} onChange={(event) => updateDraft(item.label, "completedAt", event.target.value)} style={input} />
                      </label>
                      <label>
                        <p style={smallLabel}>Expires</p>
                        <input type="date" value={draft.expiresAt ?? dateInputValue(latest?.expiresAt)} onChange={(event) => updateDraft(item.label, "expiresAt", event.target.value)} style={input} />
                      </label>
                    </div>

                    <label style={{ display: "block", marginTop: 10 }}>
                      <p style={smallLabel}>Notes</p>
                      <textarea
                        value={draft.notes ?? ""}
                        onChange={(event) => updateDraft(item.label, "notes", event.target.value)}
                        rows={2}
                        placeholder="Optional note..."
                        style={{ ...input, resize: "vertical", lineHeight: 1.35 }}
                      />
                    </label>

                    <div style={{ marginTop: 10 }}>
                      <p style={smallLabel}>Documents</p>
                      <label style={{ ...btn("ghost"), width: "100%", minHeight: 40, marginTop: 6 }}>
                        <Upload size={15} />
                        Add Documents
                        <input
                          type="file"
                          multiple
                          onChange={(event) => {
                            updateDraftDocuments(item.label, event.target.files);
                            event.target.value = "";
                          }}
                          style={{ display: "none" }}
                        />
                      </label>

                      {draft.documents?.length ? (
                        <div style={{ display: "grid", gap: 6, marginTop: "var(--space-2)" }}>
                          {draft.documents.map((file, index) => (
                            <div key={`${file.name}-${file.size}-${index}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", border: UI.border, borderRadius: "var(--radius-md)", background: "var(--legacy-color-f8fbfe)", padding: "7px 8px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, color: UI.text, fontSize: 12.5, fontWeight: 850 }}>
                                <Paperclip size={13} style={{ flex: "0 0 auto" }} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                              </span>
                              <button type="button" onClick={() => removeDraftDocument(item.label, index)} aria-label={`Remove ${file.name}`} style={{ border: 0, background: "transparent", color: UI.danger, cursor: "pointer", padding: 2, display: "inline-flex" }}>
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {latest?.documents?.length ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "var(--space-2)" }}>
                          {latest.documents.map((document, index) => (
                            <a key={`${document.path || document.url || document.name}-${index}`} href={document.url} target="_blank" rel="noreferrer" style={{ ...toneStyle("brand"), display: "inline-flex", alignItems: "center", gap: 5, borderRadius: "var(--radius-pill)", padding: "5px 8px", fontSize: "var(--font-size-xs)", fontWeight: 900, textDecoration: "none" }}>
                              <Paperclip size={12} />
                              {document.name || "Document"}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <button type="button" onClick={() => saveRecord(item)} disabled={!selectedEmployee || savingItem === item.label} style={{ ...btn("primary"), width: "100%", minHeight: 42, marginTop: "var(--space-3)" }}>
                      <Save size={15} />
                      {savingItem === item.label ? "Saving..." : "Save Record"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpenHistoryItem(historyOpen ? "" : item.label)}
                      style={{ marginTop: 9, border: 0, background: "transparent", color: UI.brand, padding: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 900 }}
                    >
                      <History size={13} style={{ verticalAlign: "-2px", marginRight: "var(--space-1)" }} />
                      {historyOpen ? "Hide History" : "View History"}
                    </button>

                    {historyOpen ? (
                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        {itemRecords.length ? (
                          itemRecords.map((record) => (
                            <div key={record.id} style={{ border: UI.border, borderRadius: "var(--radius-md)", background: "var(--color-surface-subtle)", padding: "8px 9px", color: UI.text, fontSize: 12.5, fontWeight: 800 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
                                <span>Completed {fmtDate(record.completedAt)}</span>
                                <span>Expires {fmtDate(record.expiresAt)}</span>
                              </div>
                              {record.notes ? <div style={{ marginTop: 5, color: UI.muted }}>{record.notes}</div> : null}
                              {record.documents?.length ? (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                  {record.documents.map((document, index) => (
                                    <a key={`${document.path || document.url || document.name}-${index}`} href={document.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: UI.brand, textDecoration: "none", fontSize: "var(--font-size-xs)", fontWeight: 900 }}>
                                      <Paperclip size={12} />
                                      {document.name || "Document"}
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                              <div style={{ marginTop: 5, color: UI.muted }}>Recorded by {record.recordedBy || "-"}</div>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: UI.muted, fontSize: 12.5, fontWeight: 800 }}>No history for this item.</div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </section>

        <style jsx>{`
          .training-shell {
            display: grid;
            grid-template-columns: 300px minmax(0, 1fr);
            gap: 12px;
            align-items: start;
          }

          .training-card-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }

          .training-form-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          @media (max-width: 1250px) {
            .training-card-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 840px) {
            .training-shell,
            .training-card-grid,
            .training-form-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </main>
    </HeaderSidebarLayout>
  );
}
