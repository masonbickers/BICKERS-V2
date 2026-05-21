"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { ArrowLeft, CalendarCheck2, CheckCircle2, FileCheck2, History, Plus, Save, Search, ShieldCheck, Upload } from "lucide-react";
import { auth, db, storage } from "../../../../firebaseConfig";
import { getHsRegisterTemplate, PPE_ISSUE_ITEMS } from "@/app/utils/hsRegister";

const UI = {
  radius: 8,
  radiusSm: 8,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
};

const pageWrap = { padding: "16px 16px 32px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};
const h1 = { color: UI.text, fontSize: 22, lineHeight: 1.08, fontWeight: 750, letterSpacing: 0, margin: 0 };
const sub = { color: UI.muted, fontSize: 13.5, lineHeight: 1.45, marginTop: 6 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };
const panel = { ...surface, padding: 12 };
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
  minHeight: 36,
  padding: "7px 10px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
};

const ppeTh = {
  padding: "7px 8px",
  background: UI.brand,
  color: "#fff",
  borderBottom: "1px solid #183d64",
  borderRight: "1px solid rgba(255,255,255,0.16)",
  textAlign: "left",
  fontSize: 11.5,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const ppeTd = {
  padding: "5px 7px",
  borderBottom: "1px solid #dbe1ea",
  borderRight: "1px solid #e5eaf0",
  fontSize: 12.5,
  color: UI.text,
  verticalAlign: "middle",
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: `1px solid ${UI.brandBorder}`,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
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
    padding: "6px 9px",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.brand}`,
    background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)",
    fontSize: 12.5,
    lineHeight: 1.2,
  };
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "string") {
    const raw = value.trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
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
  if (!value) return Timestamp.fromDate(new Date());
  const [yyyy, mm, dd] = String(value).split("-").map(Number);
  if (!yyyy || !mm || !dd) return Timestamp.fromDate(new Date());
  return Timestamp.fromDate(new Date(yyyy, mm - 1, dd));
};

const addDaysInputValue = (value, days) => {
  const date = toDate(value) || new Date();
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return dateInputValue(next);
};

const nextDueFromLastCompleted = (lastCompleted, frequencyWeeks) => {
  if (!lastCompleted) return "";
  const weeks = Math.max(1, Number(frequencyWeeks) || 1);
  return addDaysInputValue(lastCompleted, weeks * 7);
};

const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const certificateDocuments = (item = {}) => {
  const docs = Array.isArray(item.certificateDocuments) ? item.certificateDocuments.filter(Boolean) : [];
  if (docs.length) return docs;
  if (item.certificateUrl) {
    return [
      {
        name: item.certificateName || "Certificate",
        path: item.certificatePath || "",
        url: item.certificateUrl,
        uploadedAt: item.certificateUploadedAt || "",
      },
    ];
  }
  return [];
};

const frequencyLabelFromWeeks = (weeks) => {
  const value = Math.max(1, Number(weeks) || 1);
  if (value === 52) return "Annual";
  if (value === 26) return "6 months";
  if (value === 104) return "2 years";
  if (value === 260) return "5 years";
  return `${value} ${value === 1 ? "week" : "weeks"}`;
};

const frequencyOptions = [
  { weeks: 1, label: "1 week" },
  { weeks: 2, label: "2 weeks" },
  { weeks: 4, label: "4 weeks" },
  { weeks: 12, label: "12 weeks" },
  { weeks: 26, label: "6 months" },
  { weeks: 52, label: "Annual" },
  { weeks: 104, label: "2 years" },
  { weeks: 260, label: "5 years" },
];

const WORKSHOP_CHECK_ITEMS = [
  { id: "tidiness", label: "Tidiness" },
  { id: "fireAlarmTest", label: "Fire Alarm Test" },
  { id: "fireExtinguishers", label: "Fire Extinguishers" },
  { id: "emergencyExits", label: "Emergency Exits" },
  { id: "hazardsFuelBatteries", label: "Hazards: Fuel, Batteries etc" },
  { id: "electricalEquipment", label: "Electrical Equipment" },
  { id: "machineGuards", label: "Machine Guards" },
  { id: "slipTripHazards", label: "Slip, Trip Hazards" },
  { id: "emergencyLighting", label: "Emergency Lighting" },
  { id: "restroomHygiene", label: "Restroom Hygiene" },
];

const defaultWorkshopResults = () =>
  WORKSHOP_CHECK_ITEMS.reduce((acc, item) => {
    acc[item.id] = "ok";
    return acc;
  }, {});

const todayIssueDate = () => new Date().toLocaleDateString("en-GB");

const lower = (value) => String(value || "").trim().toLowerCase();

const splitPpeHistory = (value) =>
  String(value || "")
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

const employeeDisplayName = (employee = {}) =>
  employee.name ||
  employee.fullName ||
  [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
  employee.email ||
  employee.id ||
  "Employee";

const todayStart = () => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
};

const daysUntil = (value) => {
  const date = toDate(value);
  if (!date) return null;
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((target - todayStart()) / 86400000);
};

const safeFileName = (name) =>
  String(name || "certificate")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "certificate";

function registerState(item) {
  const explicit = lower(item.status);
  const diff = daysUntil(item.nextDue);
  const missingDate = !item.nextDue && (item.area === "inspection" || item.area === "policy" || item.area === "training");
  const missingCertificate = Boolean(item.certificateRequired && !item.certificateUrl);

  if (explicit === "complete") return { label: "Complete", tone: "green" };
  if (explicit === "booked") return { label: "Booked", tone: "brand" };
  if (missingDate) return { label: "Needs date", tone: "amber" };
  if (diff != null && diff < 0) return { label: "Overdue", tone: "danger" };
  if (missingCertificate) return { label: "Needs cert", tone: "amber" };
  if (diff != null && diff <= 30) return { label: "Due soon", tone: "amber" };
  return { label: "OK", tone: "green" };
}

function toneStyle(tone) {
  if (tone === "danger") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  if (tone === "amber") return { background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" };
  if (tone === "green") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  return { background: UI.brandSoft, color: UI.brand, border: `1px solid ${UI.brandBorder}` };
}

function PpeIssueRegisterPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [openHistoryItem, setOpenHistoryItem] = useState("");
  const [issuingItem, setIssuingItem] = useState("");
  const [toast, setToast] = useState("");
  const [loadNotice, setLoadNotice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const employeeSnap = await getDocs(collection(db, "employees"));
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
      collection(db, "ppeIssueRecords"),
      (snap) => {
        setRecords(snap.docs.map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() })));
      },
      (error) => {
        console.warn("Failed to load PPE issue records:", error);
        setRecords([]);
      }
    );

    return () => unsubscribe();
  }, []);

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
        .filter((recordItem) => recordItem.employeeId === selectedEmployee?.id)
        .sort((a, b) => (toDate(b.issuedAt)?.getTime() || 0) - (toDate(a.issuedAt)?.getTime() || 0)),
    [records, selectedEmployee?.id]
  );

  const recordsByItem = useMemo(() => {
    const grouped = new Map();
    selectedRecords.forEach((recordItem) => {
      const key = recordItem.itemName || "";
      const current = grouped.get(key) || [];
      current.push(recordItem);
      grouped.set(key, current);
    });
    return grouped;
  }, [selectedRecords]);

  const issueToday = async (itemName) => {
    if (!selectedEmployee) return;
    setIssuingItem(itemName);
    try {
      const user = auth.currentUser;
      await addDoc(collection(db, "ppeIssueRecords"), {
        employeeId: selectedEmployee.id,
        employeeName: employeeDisplayName(selectedEmployee),
        itemName,
        issuedAt: Timestamp.fromDate(new Date()),
        issuedBy: user?.displayName || user?.email || "Unknown user",
        createdAt: serverTimestamp(),
      });
      setToast(`${itemName} issued to ${employeeDisplayName(selectedEmployee)}`);
    } catch (error) {
      console.error("Failed to issue PPE:", error);
      alert("Could not save PPE issue record.");
    } finally {
      setIssuingItem("");
    }
  };

  const ppeTheme = {
    bg: UI.bg,
    panel: UI.card,
    panel2: "#f8fbfe",
    border: "#d7dee8",
    text: UI.text,
    muted: UI.muted,
    accent: UI.brand,
    accentSoft: UI.brandSoft,
    green: UI.green,
  };

  return (
    <HeaderSidebarLayout>
      <main style={{ minHeight: "100vh", background: ppeTheme.bg, padding: "16px 16px 32px", color: ppeTheme.text }}>
        <div style={headerBar}>
          <div>
            <button
              type="button"
              onClick={() => router.push("/h-and-s")}
              style={{ ...btn("ghost"), marginBottom: 10 }}
            >
              <ArrowLeft size={15} />
              Back to H&S
            </button>
            <h1 style={{ ...h1, color: ppeTheme.text }}>PPE Issue Register</h1>
            <div style={{ ...sub, color: ppeTheme.muted }}>Employee, PPE item, Issue Today. History is kept automatically.</div>
          </div>
          {toast ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid #bbf7d0",
                background: "#dcfce7",
                color: "#166534",
                borderRadius: 8,
                padding: "9px 12px",
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              <CheckCircle2 size={16} />
              {toast}
            </div>
          ) : null}
        </div>

        <section className="ppe-shell">
          <aside style={{ ...panel, padding: 12 }}>
            {loadNotice ? (
              <div
                style={{
                  border: "1px solid #fed7aa",
                  background: "#fff7ed",
                  color: "#9a3412",
                  borderRadius: 8,
                  padding: "9px 10px",
                  fontSize: 12.5,
                  fontWeight: 850,
                  marginBottom: 10,
                }}
              >
                {loadNotice}
              </div>
            ) : null}
            <label style={{ display: "block", marginBottom: 10 }}>
              <p style={{ ...smallLabel, color: ppeTheme.muted }}>Find employee</p>
              <div style={{ position: "relative", marginTop: 6 }}>
                <Search size={15} color={ppeTheme.muted} style={{ position: "absolute", left: 10, top: 11 }} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search name..."
                  style={{
                    ...input,
                    paddingLeft: 32,
                    background: "#fff",
                    border: UI.border,
                    color: ppeTheme.text,
                  }}
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
                      border: `1px solid ${active ? ppeTheme.accent : ppeTheme.border}`,
                      background: active ? ppeTheme.accentSoft : "#ffffff",
                      color: active ? ppeTheme.accent : ppeTheme.text,
                      borderRadius: 8,
                      padding: "11px 12px",
                      cursor: "pointer",
                      fontWeight: 900,
                      boxShadow: active ? "inset 3px 0 0 #1f4b7a" : "none",
                    }}
                  >
                    {employeeDisplayName(employee)}
                  </button>
                );
              })}
              {!filteredEmployees.length ? (
                <div style={{ color: ppeTheme.muted, fontSize: 13, fontWeight: 800, padding: 10 }}>
                  {loading ? "Loading employees..." : "No employees found."}
                </div>
              ) : null}
            </div>
          </aside>

          <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div style={{ ...panel, padding: 14 }}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={{ ...titleMd, color: ppeTheme.text }}>{selectedEmployee ? employeeDisplayName(selectedEmployee) : "Select an employee"}</h2>
                  <div style={{ ...hint, color: ppeTheme.muted }}>Recent PPE activity</div>
                </div>
                <History size={18} color={ppeTheme.accent} />
              </div>
              {selectedRecords.slice(0, 4).length ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedRecords.slice(0, 4).map((recordItem) => (
                    <span
                      key={recordItem.id}
                      style={{
                        border: `1px solid ${ppeTheme.border}`,
                        background: ppeTheme.panel2,
                        color: ppeTheme.text,
                        borderRadius: 999,
                        padding: "6px 9px",
                        fontSize: 12.5,
                        fontWeight: 850,
                      }}
                    >
                      {recordItem.itemName} / {fmtDate(recordItem.issuedAt)}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ color: ppeTheme.muted, fontSize: 13, fontWeight: 800 }}>No PPE has been issued for this employee yet.</div>
              )}
            </div>

            <div className="ppe-card-grid">
              {PPE_ISSUE_ITEMS.map((ppe) => {
                const itemRecords = recordsByItem.get(ppe.label) || [];
                const latest = itemRecords[0] || null;
                const historyOpen = openHistoryItem === ppe.label;

                return (
                  <article
                    key={ppe.id}
                    style={{
                      ...surface,
                      padding: 14,
                      background: "#ffffff",
                      transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <h3 style={{ margin: 0, color: ppeTheme.text, fontSize: 16, fontWeight: 900 }}>{ppe.label}</h3>
                        <div style={{ marginTop: 7, color: ppeTheme.muted, fontSize: 13, fontWeight: 750 }}>
                          Latest: {latest ? fmtDate(latest.issuedAt) : "Never issued"}
                        </div>
                        <div style={{ marginTop: 3, color: ppeTheme.muted, fontSize: 13, fontWeight: 750 }}>
                          Total issued: {itemRecords.length}
                        </div>
                      </div>
                      <ShieldCheck size={18} color={latest ? ppeTheme.green : ppeTheme.muted} />
                    </div>

                    <button
                      type="button"
                      onClick={() => issueToday(ppe.label)}
                      disabled={!selectedEmployee || issuingItem === ppe.label}
                      style={{
                        width: "100%",
                        marginTop: 14,
                        minHeight: 44,
                        border: `1px solid ${selectedEmployee ? UI.brand : "#cbd5e1"}`,
                        borderRadius: 8,
                        background: selectedEmployee ? "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)" : "#e2e8f0",
                        color: "#fff",
                        fontWeight: 950,
                        cursor: selectedEmployee ? "pointer" : "not-allowed",
                        fontSize: 14,
                        boxShadow: selectedEmployee ? "0 8px 18px rgba(31,75,122,0.18), inset 0 1px 0 rgba(255,255,255,0.16)" : "none",
                      }}
                    >
                      {issuingItem === ppe.label ? "Issuing..." : "Issue Today"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpenHistoryItem(historyOpen ? "" : ppe.label)}
                      style={{
                        marginTop: 9,
                        border: 0,
                        background: "transparent",
                        color: ppeTheme.accent,
                        padding: 0,
                        cursor: "pointer",
                        fontSize: 12.5,
                        fontWeight: 900,
                      }}
                    >
                      {historyOpen ? "Hide History" : "View History"}
                    </button>

                    {historyOpen ? (
                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        {itemRecords.length ? (
                          itemRecords.map((recordItem) => (
                            <div
                              key={recordItem.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                border: UI.border,
                                borderRadius: 8,
                                background: "#f8fafc",
                                padding: "8px 9px",
                                color: ppeTheme.text,
                                fontSize: 12.5,
                                fontWeight: 800,
                              }}
                            >
                              <span>{fmtDate(recordItem.issuedAt)}</span>
                              <span style={{ color: ppeTheme.muted }}>{recordItem.issuedBy || "-"}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: ppeTheme.muted, fontSize: 12.5, fontWeight: 800 }}>No history for this item.</div>
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
          .ppe-shell {
            display: grid;
            grid-template-columns: 300px minmax(0, 1fr);
            gap: 12px;
            align-items: start;
          }

          .ppe-card-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
          }

          @media (max-width: 1250px) {
            .ppe-card-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 840px) {
            .ppe-shell,
            .ppe-card-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </main>
    </HeaderSidebarLayout>
  );
}

export default function HsRegisterDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");

  if (id === "ppe-issue-register") {
    return <PpeIssueRegisterPage />;
  }

  return <LegacyHsRegisterDetailPage />;
}

function LegacyHsRegisterDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");
  const template = useMemo(() => getHsRegisterTemplate(id), [id]);

  const [record, setRecord] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedPpeHistory, setSelectedPpeHistory] = useState(null);
  const [checkDraft, setCheckDraft] = useState({
    checkedAt: "",
    reading: "",
    frequencyWeeks: "1",
    completedBy: "",
    certificateFile: null,
    workshopResults: defaultWorkshopResults(),
    notes: "",
  });
  const [checkHistory, setCheckHistory] = useState([]);
  const [completingCheck, setCompletingCheck] = useState(false);
  const [historyUploadId, setHistoryUploadId] = useState("");

  const item = useMemo(() => ({ ...(template || {}), ...(record || {}), ...form, id }), [form, id, record, template]);
  const state = registerState(item);
  const isPpeRegister = item.area === "ppe";
  const isCuttingFluidCheck = id === "cutting-fluid-ph";
  const isPatTestingCheck = id === "pat-testing";
  const isFireSafetyCheck = id === "fire-safety";
  const isFireAlarmServiceCheck = id === "fire-alarm-service";
  const isMaskFittingCheck = id === "mask-fitting";
  const isHealthScreeningCheck = id === "health-screening";
  const isGasCheck = id === "gas";
  const isEicrPatCheck = id === "eicr-pat";
  const isPolicyReviewCheck = id === "policy-review";
  const isWelfarePolicyCheck = id === "welfare-policy";
  const isWorkshopRiskAssessmentCheck = id === "workshop-risk-assessment";
  const isTrackingRiskAssessmentCheck = id === "tracking-risk-assessment";
  const isCoshhCheck = id === "coshh";
  const isFireRiskAssessmentCheck = id === "fire-risk-assessment";
  const isWorkshopWeeklyCheck = id === "weekly-workshop-check";
  const isCustomCertificateCheck = Boolean(item.customRegisterItem && item.certificateRequired);
  const isCertificateCheck = isPatTestingCheck || isFireSafetyCheck || isFireAlarmServiceCheck || isMaskFittingCheck || isHealthScreeningCheck || isGasCheck || isEicrPatCheck || isPolicyReviewCheck || isWelfarePolicyCheck || isWorkshopRiskAssessmentCheck || isTrackingRiskAssessmentCheck || isFireRiskAssessmentCheck || isCoshhCheck || isCustomCertificateCheck;
  const isManagedCheck = isCuttingFluidCheck || isCertificateCheck || isWorkshopWeeklyCheck;

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [snap, employeeSnap] = await Promise.all([
          getDoc(doc(db, "hsRegister", id)),
          getDocs(collection(db, "employees")),
        ]);
        const data = snap.exists() ? snap.data() : {};
        const employeeList = employeeSnap.docs
          .map((employeeDoc) => ({ id: employeeDoc.id, ...employeeDoc.data() }))
          .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b)));

        setEmployees(employeeList);
        setRecord(data);
        setForm({
          nextDue: data.nextDue || "",
          lastCompleted: data.lastCompleted || "",
          status: data.status || "",
          owner: data.owner || template?.owner || "",
          frequencyWeeks: data.frequencyWeeks || template?.frequencyWeeks || 1,
          frequency: data.frequency || template?.frequency || "",
          reference: data.reference || "",
          location: data.location || "",
          notes: data.notes || template?.notes || "",
          certificateNotes: data.certificateNotes || "",
          ppeIssueRows: data.ppeIssueRows || {},
        });
        setCheckDraft({
          checkedAt: dateInputValue(new Date()),
          reading: "",
          frequencyWeeks: String(data.frequencyWeeks || template?.frequencyWeeks || 1),
          completedBy: auth.currentUser?.displayName || auth.currentUser?.email || "",
          certificateFile: null,
          workshopResults: defaultWorkshopResults(),
          notes: "",
        });
      } catch (error) {
        console.error("Failed to load H&S register item:", error);
        alert("Could not load H&S register item.");
      } finally {
        setLoading(false);
      }
    };
    if (id) run();
  }, [id, template?.frequency, template?.frequencyWeeks, template?.notes, template?.owner]);

  useEffect(() => {
    if (!isManagedCheck) return undefined;

    const unsubscribe = onSnapshot(
      collection(db, "hsCheckRecords"),
      (snap) => {
        const rows = snap.docs
          .map((recordDoc) => ({ id: recordDoc.id, ...recordDoc.data() }))
          .filter((row) => row.registerId === id)
          .sort((a, b) => (toDate(b.checkedAt)?.getTime() || 0) - (toDate(a.checkedAt)?.getTime() || 0));
        setCheckHistory(rows);
      },
      (error) => {
        console.warn("Failed to load H&S check history:", error);
        setCheckHistory([]);
      }
    );

    return () => unsubscribe();
  }, [id, isManagedCheck]);

  useEffect(() => {
    if (!isManagedCheck || !form.lastCompleted) return;
    const calculatedNextDue = nextDueFromLastCompleted(form.lastCompleted, form.frequencyWeeks);
    if (calculatedNextDue && calculatedNextDue !== form.nextDue) {
      setForm((prev) => ({ ...prev, nextDue: calculatedNextDue }));
    }
  }, [form.frequencyWeeks, form.lastCompleted, form.nextDue, isManagedCheck]);

  useEffect(() => {
    if (!isManagedCheck || form.lastCompleted || !checkHistory.length) return;
    const latest = checkHistory[0];
    const lastCompleted = dateInputValue(latest.checkedAt);
    const frequencyWeeks = Number(form.frequencyWeeks || latest.frequencyWeeks || template?.frequencyWeeks || 1);
    const nextDue = nextDueFromLastCompleted(lastCompleted, frequencyWeeks);

    if (lastCompleted) {
      setForm((prev) => ({
        ...prev,
        lastCompleted,
        frequencyWeeks,
        frequency: frequencyLabelFromWeeks(frequencyWeeks),
        nextDue,
      }));
    }
  }, [checkHistory, form.frequencyWeeks, form.lastCompleted, isManagedCheck, template?.frequencyWeeks]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updatePpeCell = (employee, ppeId, value) => {
    setForm((prev) => {
      const currentRows = prev.ppeIssueRows || {};
      const currentEmployee = currentRows[employee.id] || {};
      return {
        ...prev,
        ppeIssueRows: {
          ...currentRows,
          [employee.id]: {
            ...currentEmployee,
            employeeName: employeeDisplayName(employee),
            [ppeId]: value,
          },
        },
      };
    });
  };

  const addPpeIssueDate = async (employee, ppeId) => {
    const date = todayIssueDate();
    const currentRows = form.ppeIssueRows || {};
    const currentEmployee = currentRows[employee.id] || {};
    const existing = String(currentEmployee[ppeId] || "").trim();
    const nextValue = existing
      ? existing.split(/[,;\n]+/).map((part) => part.trim()).includes(date)
        ? existing
        : `${existing}, ${date}`
      : date;
    const nextRows = {
      ...currentRows,
      [employee.id]: {
        ...currentEmployee,
        employeeName: employeeDisplayName(employee),
        [ppeId]: nextValue,
      },
    };

    setForm((prev) => ({ ...prev, ppeIssueRows: nextRows }));
    await save({ ppeIssueRows: nextRows });
  };

  const ppeStats = useMemo(() => {
    const rows = form.ppeIssueRows || {};
    const totalCells = employees.length * PPE_ISSUE_ITEMS.length;
    const issuedCells = employees.reduce((count, employee) => {
      const row = rows[employee.id] || {};
      return count + PPE_ISSUE_ITEMS.filter((ppe) => String(row[ppe.id] || "").trim()).length;
    }, 0);

    return {
      employees: employees.length,
      issuedCells,
      missingCells: Math.max(0, totalCells - issuedCells),
    };
  }, [employees, form.ppeIssueRows]);

  const selectedHistoryEntries = useMemo(
    () => splitPpeHistory(selectedPpeHistory?.value),
    [selectedPpeHistory?.value]
  );

  const save = async (patch = form) => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "hsRegister", id),
        {
          ...patch,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setRecord((prev) => ({ ...(prev || {}), ...patch }));
    } catch (error) {
      console.error("Failed to save H&S register item:", error);
      alert("Could not save H&S register item.");
    } finally {
      setSaving(false);
    }
  };

  const completeManagedCheck = async () => {
    const checkedAtInput = checkDraft.checkedAt || dateInputValue(new Date());
    const lastCompleted = checkedAtInput;
    const reading = String(checkDraft.reading || "").trim();
    const notes = String(checkDraft.notes || "").trim();
    const frequencyWeeks = Math.max(1, Number(form.frequencyWeeks || checkDraft.frequencyWeeks) || 1);
    const checkedAt = timestampFromDateInput(checkedAtInput);
    const nextDue = nextDueFromLastCompleted(lastCompleted, frequencyWeeks);
    const user = auth.currentUser;
    const completedBy = String(user?.displayName || user?.email || "Unknown user").trim();

    setCompletingCheck(true);
    try {
      let certificatePatch = {};
      if (isCertificateCheck && checkDraft.certificateFile) {
        const file = checkDraft.certificateFile;
        const path = `h-and-s/certificates/${id}/checks/${Date.now()}-${safeFileName(file.name)}`;
        const ref = storageRef(storage, path);
        const snapshot = await uploadBytes(ref, file, { contentType: file.type || "application/octet-stream" });
        const url = await getDownloadURL(snapshot.ref);
        const certificateDoc = {
          name: file.name,
          path,
          url,
          uploadedAt: new Date().toISOString(),
        };
        certificatePatch = {
          certificateName: file.name,
          certificatePath: path,
          certificateUrl: url,
          certificateDocuments: [certificateDoc],
        };
      }

      await addDoc(collection(db, "hsCheckRecords"), {
        registerId: id,
        itemName: item.item || (isPatTestingCheck ? "PAT testing" : isFireSafetyCheck ? "Fire safety inspection" : isFireAlarmServiceCheck ? "Fire alarm service" : isMaskFittingCheck ? "Mask fitting" : isHealthScreeningCheck ? "Health screening" : isGasCheck ? "Gas regulator" : isEicrPatCheck ? "EICR / PAT test" : isPolicyReviewCheck ? "Policy review" : isWelfarePolicyCheck ? "Welfare policy" : isWorkshopRiskAssessmentCheck ? "Workshop risk assessment" : isTrackingRiskAssessmentCheck ? "Tracking risk assessment" : isFireRiskAssessmentCheck ? "Fire RA" : isCoshhCheck ? "COSHH" : "Cutting fluid pH check"),
        checkedAt,
        frequencyWeeks,
        reading,
        ...(isWorkshopWeeklyCheck ? { workshopResults: checkDraft.workshopResults || defaultWorkshopResults() } : {}),
        notes,
        completedBy,
        ...certificatePatch,
        createdAt: serverTimestamp(),
      });

      const patch = {
        lastCompleted,
        nextDue,
        frequencyWeeks,
        frequency: frequencyLabelFromWeeks(frequencyWeeks),
        status: "complete",
        certificateNotes: isCertificateCheck
          ? checkDraft.certificateFile
            ? `Latest certificate: ${checkDraft.certificateFile.name}`
            : form.certificateNotes || ""
          : reading
            ? `Latest pH reading: ${reading}`
            : form.certificateNotes || "",
        ...(certificatePatch.certificateUrl
          ? {
              certificateName: certificatePatch.certificateName,
              certificatePath: certificatePatch.certificatePath,
              certificateUrl: certificatePatch.certificateUrl,
              certificateDocuments: certificatePatch.certificateDocuments,
              certificateUploadedAt: new Date().toISOString(),
            }
          : {}),
      };
      await save(patch);
      setCheckDraft((prev) => ({
        ...prev,
        checkedAt: dateInputValue(new Date()),
        reading: "",
        frequencyWeeks: String(frequencyWeeks),
        completedBy,
        certificateFile: null,
        workshopResults: defaultWorkshopResults(),
        notes: "",
      }));
    } catch (error) {
      console.error("Failed to complete H&S check:", error);
      alert(error?.code === "storage/unauthorized" ? "Could not upload certificate. Please check Firebase Storage permissions for H&S certificates." : "Could not complete check.");
    } finally {
      setCompletingCheck(false);
    }
  };

  const downloadCuttingFluidData = () => {
    const rows = [
      ["Cutting fluid pH check export"],
      ["Item", item.item || "Cutting fluid pH check"],
      ["Section", item.section || ""],
      ["Owner", form.owner || item.owner || ""],
      ["Frequency", frequencyLabelFromWeeks(form.frequencyWeeks, form.frequency)],
      ["Last Completed", fmtDate(form.lastCompleted)],
      ["Next Due", fmtDate(form.nextDue)],
      ["Status", state.label],
      ["Reference", form.reference || ""],
      ["Location / Person", form.location || ""],
      ["General Notes", form.notes || ""],
      ["Evidence Notes", form.certificateNotes || ""],
      [],
      ["Check Date", "pH Reading", "Notes", "Completed By", "Created At"],
      ...checkHistory.map((entry) => [
        fmtDate(entry.checkedAt),
        entry.reading || "",
        entry.notes || "",
        entry.completedBy || "",
        fmtDate(entry.createdAt),
      ]),
    ];

    downloadCsv(`cutting-fluid-ph-${dateInputValue(new Date())}.csv`, rows);
  };

  const uploadCertificate = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = `h-and-s/certificates/${id}/${Date.now()}-${safeFileName(file.name)}`;
      const ref = storageRef(storage, path);
      const snapshot = await uploadBytes(ref, file, { contentType: file.type || "application/octet-stream" });
      const url = await getDownloadURL(snapshot.ref);
      const certificateDoc = {
        name: file.name,
        path,
        url,
        uploadedAt: new Date().toISOString(),
      };
      const nextDocuments = [...certificateDocuments(item), certificateDoc];
      const patch = {
        certificateName: file.name,
        certificatePath: path,
        certificateUrl: url,
        certificateDocuments: nextDocuments,
        certificateUploadedAt: new Date().toISOString(),
      };
      await save(patch);
    } catch (error) {
      console.error("Failed to upload H&S certificate:", error);
      alert("Could not upload certificate.");
    } finally {
      setUploading(false);
    }
  };

  const uploadHistoryCertificate = async (entry, file) => {
    if (!entry?.id || !file) return;
    setHistoryUploadId(entry.id);
    try {
      const path = `h-and-s/certificates/${id}/checks/${entry.id}-${Date.now()}-${safeFileName(file.name)}`;
      const ref = storageRef(storage, path);
      const snapshot = await uploadBytes(ref, file, { contentType: file.type || "application/octet-stream" });
      const url = await getDownloadURL(snapshot.ref);
      const certificateDoc = {
        name: file.name,
        path,
        url,
        uploadedAt: new Date().toISOString(),
      };
      const nextEntryDocuments = [...certificateDocuments(entry), certificateDoc];
      const patch = {
        certificateName: file.name,
        certificatePath: path,
        certificateUrl: url,
        certificateDocuments: nextEntryDocuments,
        certificateUploadedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "hsCheckRecords", entry.id), patch);

      setCheckHistory((prev) =>
        prev.map((row) => (row.id === entry.id ? { ...row, ...patch } : row))
      );

      const nextRegisterDocuments = [...certificateDocuments(item), certificateDoc];
      await save({
        certificateName: file.name,
        certificatePath: path,
        certificateUrl: url,
        certificateDocuments: nextRegisterDocuments,
        certificateUploadedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to upload history certificate:", error);
      alert(error?.code === "storage/unauthorized" ? "Could not upload certificate. Please check Firebase Storage permissions for H&S certificates." : "Could not upload certificate.");
    } finally {
      setHistoryUploadId("");
    }
  };

  if (!template && !record && !loading) {
    return (
      <HeaderSidebarLayout>
        <main style={pageWrap}>
          <button type="button" style={btn("ghost")} onClick={() => router.push("/h-and-s")}>
            <ArrowLeft size={15} />
            Back to H&S
          </button>
          <div style={{ ...panel, marginTop: 12 }}>H&S register item not found.</div>
        </main>
      </HeaderSidebarLayout>
    );
  }

  return (
    <HeaderSidebarLayout>
      <main style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>{item.item || "H&S register item"}</h1>
            <div style={sub}>
              {item.section || "-"} / {item.frequency || "-"} / {item.owner || "-"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" style={btn("ghost")} onClick={() => router.push("/h-and-s")}>
              <ArrowLeft size={15} />
              Back
            </button>
            {isCuttingFluidCheck ? (
              <button type="button" style={btn("ghost")} onClick={downloadCuttingFluidData}>
                <FileCheck2 size={15} />
                Download Data
              </button>
            ) : null}
            <button type="button" style={btn("primary")} onClick={() => save()} disabled={saving || loading}>
              <Save size={15} />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <section className="hs-detail-grid">
          <div style={{ display: "grid", gap: 12 }}>
            {isPpeRegister ? (
              <div style={panel}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={titleMd}>Employee PPE issue register</h2>
                    <div style={hint}>
                      Record what PPE each employee has been issued. Use dates, quantities or short notes in each cell.
                    </div>
                  </div>
                  <span style={{ ...toneStyle("brand"), borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 900 }}>
                    {ppeStats.employees} employees
                  </span>
                </div>

                <div style={{ overflowX: "auto", border: UI.border, borderRadius: UI.radius }}>
                  <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={ppeTh}>Employee</th>
                        {PPE_ISSUE_ITEMS.map((ppe) => (
                          <th key={ppe.id} style={ppeTh}>
                            {ppe.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee, index) => {
                        const issueRow = form.ppeIssueRows?.[employee.id] || {};
                        const bg = index % 2 === 0 ? "#ffffff" : "#f8fafc";

                        return (
                          <tr key={employee.id} style={{ background: bg }}>
                            <td style={{ ...ppeTd, fontWeight: 900, minWidth: 180 }}>
                              {employeeDisplayName(employee)}
                            </td>
                            {PPE_ISSUE_ITEMS.map((ppe) => (
                              <td key={ppe.id} style={ppeTd}>
                                <div style={{ display: "grid", gridTemplateColumns: "minmax(92px, 1fr) 28px 28px", gap: 5, alignItems: "center" }}>
                                  <input
                                    value={issueRow[ppe.id] || ""}
                                    onChange={(event) => updatePpeCell(employee, ppe.id, event.target.value)}
                                    placeholder="Date / qty"
                                    style={{
                                      ...input,
                                      minHeight: 28,
                                      padding: "4px 6px",
                                      fontSize: 12,
                                      fontWeight: 800,
                                    }}
                                  />
                                  <button
                                    type="button"
                                    title={`Add today's date for ${ppe.label}`}
                                    onClick={() => addPpeIssueDate(employee, ppe.id)}
                                    disabled={saving}
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      border: `1px solid ${UI.brandBorder}`,
                                      background: UI.brandSoft,
                                      color: UI.brand,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      cursor: saving ? "not-allowed" : "pointer",
                                    }}
                                  >
                                    <Plus size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    title={`View issue history for ${ppe.label}`}
                                    onClick={() =>
                                      setSelectedPpeHistory({
                                        employeeName: employeeDisplayName(employee),
                                        ppeLabel: ppe.label,
                                        value: issueRow[ppe.id] || "",
                                      })
                                    }
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 8,
                                      border: `1px solid ${UI.brandBorder}`,
                                      background: "#fff",
                                      color: UI.brand,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <History size={14} />
                                  </button>
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                      {!employees.length ? (
                        <tr>
                          <td style={{ ...ppeTd, color: UI.muted }} colSpan={PPE_ISSUE_ITEMS.length + 1}>
                            No employees found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {isManagedCheck ? (
              <div style={panel}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={titleMd}>
                      Complete {isPatTestingCheck ? "PAT check" : isFireSafetyCheck ? "fire safety check" : isFireAlarmServiceCheck ? "fire alarm service" : isMaskFittingCheck ? "mask fitting" : isHealthScreeningCheck ? "health screening" : isGasCheck ? "gas regulator check" : isEicrPatCheck ? "EICR / PAT check" : isPolicyReviewCheck ? "policy review" : isWelfarePolicyCheck ? "welfare policy" : isWorkshopRiskAssessmentCheck ? "workshop risk assessment" : isTrackingRiskAssessmentCheck ? "tracking risk assessment" : isFireRiskAssessmentCheck ? "Fire RA" : isCoshhCheck ? "COSHH" : isWorkshopWeeklyCheck ? "workshop check" : item.item || "check"}
                    </h2>
                    <div style={hint}>Record the check result. The page keeps every completed check in history.</div>
                  </div>
                </div>

                {isWorkshopWeeklyCheck ? (
                  <div className="workshop-check-grid">
                    {WORKSHOP_CHECK_ITEMS.map((checkItem) => (
                      <label key={checkItem.id} style={{ border: UI.border, borderRadius: UI.radius, background: "#f8fafc", padding: 10 }}>
                        <p style={smallLabel}>{checkItem.label}</p>
                        <select
                          value={checkDraft.workshopResults?.[checkItem.id] || "ok"}
                          onChange={(event) =>
                            setCheckDraft((prev) => ({
                              ...prev,
                              workshopResults: {
                                ...(prev.workshopResults || defaultWorkshopResults()),
                                [checkItem.id]: event.target.value,
                              },
                            }))
                          }
                          style={{ ...input, marginTop: 5 }}
                        >
                          <option value="ok">OK</option>
                          <option value="issue">Issue</option>
                          <option value="na">N/A</option>
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}

                <div className="hs-check-form">
                  <label>
                    <p style={smallLabel}>Check date</p>
                    <input
                      type="date"
                      value={checkDraft.checkedAt || ""}
                      onChange={(event) => setCheckDraft((prev) => ({ ...prev, checkedAt: event.target.value }))}
                      style={input}
                    />
                  </label>
                  {isCuttingFluidCheck ? (
                    <label>
                      <p style={smallLabel}>pH reading</p>
                      <input
                        value={checkDraft.reading || ""}
                        onChange={(event) => setCheckDraft((prev) => ({ ...prev, reading: event.target.value }))}
                        placeholder="e.g. 8.7"
                        style={input}
                      />
                    </label>
                  ) : null}
                  <label>
                    <p style={smallLabel}>Completed by</p>
                    <input
                      value={auth.currentUser?.displayName || auth.currentUser?.email || "Signed-in user"}
                      readOnly
                      style={input}
                    />
                  </label>
                  {isCertificateCheck ? (
                    <>
                      <label>
                        <p style={smallLabel}>Certificate</p>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                          onChange={(event) => setCheckDraft((prev) => ({ ...prev, certificateFile: event.target.files?.[0] || null }))}
                          style={{ ...input, padding: "6px 8px" }}
                        />
                      </label>
                    </>
                  ) : null}
                  <label>
                    <p style={smallLabel}>Notes</p>
                    <input
                      value={checkDraft.notes || ""}
                      onChange={(event) => setCheckDraft((prev) => ({ ...prev, notes: event.target.value }))}
                      placeholder="Optional note..."
                      style={input}
                    />
                  </label>
                  <button
                    type="button"
                    style={{ ...btn("primary"), minHeight: 36 }}
                    onClick={completeManagedCheck}
                    disabled={completingCheck || saving}
                  >
                    <CheckCircle2 size={15} />
                    {completingCheck ? "Completing..." : "Complete Check"}
                  </button>
                </div>
              </div>
            ) : null}

            <div style={panel}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={titleMd}>Register details</h2>
                  <div style={hint}>Core information, review dates and notes for this H&S record.</div>
                </div>
                <span style={{ ...toneStyle(state.tone), borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 900 }}>
                  {loading ? "Loading..." : state.label}
                </span>
              </div>

              <div className="hs-form-grid">
                <Field label="Section" value={item.section || "-"} readOnly />
                {isManagedCheck ? (
                  <label>
                    <p style={smallLabel}>Frequency</p>
                    <div style={{ display: "grid", gap: 6 }}>
                      <select
                        value={String(form.frequencyWeeks || 1)}
                        onChange={(event) => {
                          const weeks = Math.max(1, Number(event.target.value) || 1);
                          const nextDue = nextDueFromLastCompleted(form.lastCompleted, weeks);
                          setForm((prev) => ({
                            ...prev,
                            frequencyWeeks: weeks,
                            frequency: frequencyLabelFromWeeks(weeks),
                            ...(nextDue ? { nextDue } : {}),
                          }));
                        }}
                        style={input}
                      >
                        {!frequencyOptions.some((option) => option.weeks === Number(form.frequencyWeeks)) ? (
                          <option value={String(form.frequencyWeeks || 1)}>{frequencyLabelFromWeeks(form.frequencyWeeks || 1)}</option>
                        ) : null}
                        {frequencyOptions.map((option) => (
                          <option key={option.weeks} value={String(option.weeks)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                ) : (
                  <Field label="Frequency" value={item.frequency || "-"} readOnly />
                )}
                <Field label="Evidence Type" value={item.evidenceLabel || "-"} readOnly />
                <Field label="Owner" value={form.owner || ""} onChange={(value) => updateForm("owner", value)} />
                <Field label="Next Due" value={fmtDate(form.nextDue)} readOnly />
                <Field label="Last Completed" value={fmtDate(form.lastCompleted)} readOnly />
                <Field label="Status" type="select" value={form.status || ""} onChange={(value) => updateForm("status", value)} />
                <Field label="Reference" value={form.reference || ""} onChange={(value) => updateForm("reference", value)} />
                <Field label="Location / Person" value={form.location || ""} onChange={(value) => updateForm("location", value)} />
              </div>
            </div>

            <div style={panel}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={titleMd}>Information</h2>
                  <div style={hint}>Record notes, certificate notes and any context needed for the next review.</div>
                </div>
              </div>
              <div className="hs-notes-grid">
                <label>
                  <p style={smallLabel}>General notes</p>
                  <textarea
                    value={form.notes || ""}
                    onChange={(event) => updateForm("notes", event.target.value)}
                    rows={7}
                    style={{ ...input, resize: "vertical", lineHeight: 1.35 }}
                    placeholder="Notes about this H&S item..."
                  />
                </label>
                <label>
                  <p style={smallLabel}>Certificate / evidence notes</p>
                  <textarea
                    value={form.certificateNotes || ""}
                    onChange={(event) => updateForm("certificateNotes", event.target.value)}
                    rows={7}
                    style={{ ...input, resize: "vertical", lineHeight: 1.35 }}
                    placeholder="Certificate details, inspection comments, expiry notes..."
                  />
                </label>
              </div>
            </div>

            {isManagedCheck ? (
              <div style={panel}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={titleMd}>Check history</h2>
                    <div style={hint}>Newest completed checks first.</div>
                  </div>
                  <History size={18} color={UI.brand} />
                </div>

                {checkHistory.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {checkHistory.map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          border: UI.border,
                          borderRadius: UI.radius,
                          background: "#f8fafc",
                          padding: 10,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ color: UI.text, fontWeight: 900 }}>{fmtDate(entry.checkedAt)}</span>
                          <span style={{ ...toneStyle("brand"), borderRadius: 999, padding: "3px 7px", fontSize: 12, fontWeight: 900 }}>
                            {entry.reading ? `pH ${entry.reading}` : certificateDocuments(entry).length ? `${certificateDocuments(entry).length} document${certificateDocuments(entry).length === 1 ? "" : "s"}` : entry.workshopResults ? `${Object.values(entry.workshopResults).filter((value) => value === "issue").length} issues` : "Completed"}
                          </span>
                        </div>
                        {entry.workshopResults ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {WORKSHOP_CHECK_ITEMS.map((checkItem) => {
                              const value = entry.workshopResults?.[checkItem.id] || "ok";
                              const tone = value === "issue" ? "danger" : value === "na" ? "amber" : "green";
                              return (
                                <span key={checkItem.id} style={{ ...toneStyle(tone), borderRadius: 999, padding: "3px 7px", fontSize: 11.5, fontWeight: 850 }}>
                                  {checkItem.label}: {value === "na" ? "N/A" : value === "issue" ? "Issue" : "OK"}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                        {certificateDocuments(entry).length ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                            {certificateDocuments(entry).map((docItem, index) => (
                              <a
                                key={`${docItem.url}-${index}`}
                                href={docItem.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: UI.brand, fontSize: 12.5, fontWeight: 900 }}
                              >
                                {docItem.name || `Document ${index + 1}`}
                              </a>
                            ))}
                          </div>
                        ) : null}
                        {isCertificateCheck ? (
                          <label
                            style={{
                              ...btn("ghost"),
                              display: "inline-flex",
                              marginTop: 8,
                              width: "fit-content",
                              opacity: historyUploadId === entry.id ? 0.65 : 1,
                            }}
                          >
                            <Upload size={14} />
                            {historyUploadId === entry.id ? "Uploading..." : "Add to this entry"}
                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                              disabled={historyUploadId === entry.id}
                              style={{ display: "none" }}
                              onChange={(event) => uploadHistoryCertificate(entry, event.target.files?.[0])}
                            />
                          </label>
                        ) : null}
                        {entry.notes ? <div style={{ marginTop: 7, color: UI.muted, fontSize: 12.5, fontWeight: 750 }}>{entry.notes}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: UI.muted, fontSize: 13, fontWeight: 750 }}>
                    No completed checks recorded yet.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div style={panel}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={{ ...titleMd, fontSize: 15 }}>Certificate</h2>
                  <div style={hint}>{item.certificateRequired ? "Evidence is required for this item." : "Evidence is optional for this item."}</div>
                </div>
                <FileCheck2 size={18} color={UI.brand} />
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ border: UI.border, borderRadius: UI.radius, padding: 10, background: "#fbfdff" }}>
                  <p style={smallLabel}>Current evidence</p>
                  <div style={{ marginTop: 6, fontWeight: 900, color: UI.text }}>
                    {certificateDocuments(item).length ? `${certificateDocuments(item).length} document${certificateDocuments(item).length === 1 ? "" : "s"} uploaded` : "No certificate uploaded"}
                  </div>
                  <div style={{ marginTop: 4, color: UI.muted, fontSize: 12.5 }}>
                    Uploaded: {fmtDate(item.certificateUploadedAt)}
                  </div>
                  {certificateDocuments(item).length ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {certificateDocuments(item).map((docItem, index) => (
                        <a key={`${docItem.url}-${index}`} href={docItem.url} target="_blank" rel="noreferrer" style={{ ...btn("ghost"), textDecoration: "none" }}>
                          {docItem.name || `Document ${index + 1}`}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>

                <label style={{ ...btn("primary"), width: "100%" }}>
                  <Upload size={15} />
                  {uploading ? "Uploading..." : "Upload certificate"}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                    style={{ display: "none" }}
                    onChange={(event) => uploadCertificate(event.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            <div style={panel}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={{ ...titleMd, fontSize: 15 }}>Quick status</h2>
                  <div style={hint}>At-a-glance record health.</div>
                </div>
                <ShieldCheck size={18} color={UI.brand} />
              </div>
              {isPpeRegister ? (
                <>
                  <InfoRow label="Employees" value={ppeStats.employees} icon={ShieldCheck} />
                  <InfoRow label="PPE entries" value={ppeStats.issuedCells} icon={FileCheck2} />
                  <InfoRow label="Missing cells" value={ppeStats.missingCells} icon={CalendarCheck2} />
                </>
              ) : null}
              <InfoRow label="Next due" value={fmtDate(item.nextDue)} icon={CalendarCheck2} />
              <InfoRow label="Evidence" value={item.certificateUrl ? "Attached" : item.certificateRequired ? "Missing" : "Optional"} icon={FileCheck2} />
              <InfoRow label="Status" value={state.label} icon={ShieldCheck} />
            </div>

            {isPpeRegister ? (
              <div style={panel}>
                <div style={sectionHeader}>
                  <div>
                    <h2 style={{ ...titleMd, fontSize: 15 }}>PPE issue history</h2>
                    <div style={hint}>Select the history icon in any PPE cell to review recorded issue entries.</div>
                  </div>
                  <History size={18} color={UI.brand} />
                </div>

                {selectedPpeHistory ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ border: UI.border, borderRadius: UI.radius, background: "#fbfdff", padding: 10 }}>
                      <p style={smallLabel}>Employee</p>
                      <div style={{ marginTop: 5, color: UI.text, fontWeight: 900 }}>{selectedPpeHistory.employeeName}</div>
                      <div style={{ marginTop: 3, color: UI.muted, fontSize: 12.5 }}>{selectedPpeHistory.ppeLabel}</div>
                    </div>

                    {selectedHistoryEntries.length ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        {selectedHistoryEntries.map((entry, index) => (
                          <div
                            key={`${entry}-${index}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              border: UI.border,
                              borderRadius: UI.radius,
                              background: "#fff",
                              padding: "8px 10px",
                            }}
                          >
                            <span style={{ color: UI.text, fontWeight: 900 }}>{entry}</span>
                            <span style={{ color: UI.muted, fontSize: 12, fontWeight: 800 }}>#{index + 1}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: UI.muted, fontSize: 13, fontWeight: 750 }}>
                        No issue history has been recorded for this employee and PPE item yet.
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: UI.muted, fontSize: 13, fontWeight: 750 }}>
                    No PPE cell selected.
                  </div>
                )}
              </div>
            ) : null}
          </aside>
        </section>

        <style jsx>{`
          .hs-detail-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 360px;
            gap: 12px;
            align-items: start;
          }

          .hs-form-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
          }

          .hs-notes-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .hs-check-form {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
            gap: 10px;
            align-items: end;
          }

          .workshop-check-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 12px;
          }

          @media (max-width: 1100px) {
            .hs-detail-grid {
              grid-template-columns: 1fr;
            }

            .hs-check-form,
            .workshop-check-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 760px) {
            .hs-form-grid,
            .hs-notes-grid,
            .hs-check-form,
            .workshop-check-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </main>
    </HeaderSidebarLayout>
  );
}

function Field({ label, value, onChange, readOnly = false, type = "text" }) {
  if (type === "select") {
    return (
      <label>
        <p style={smallLabel}>{label}</p>
        <select value={value} onChange={(event) => onChange(event.target.value)} style={input}>
          <option value="">Auto</option>
          <option value="booked">Booked</option>
          <option value="complete">Complete</option>
        </select>
      </label>
    );
  }

  return (
    <label>
      <p style={smallLabel}>{label}</p>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        style={{ ...input, background: readOnly ? "#f8fafc" : "#fff", fontWeight: readOnly ? 850 : 700 }}
      />
    </label>
  );
}

function InfoRow({ label, value, icon: Icon }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 8, alignItems: "center", padding: "9px 0", borderTop: "1px solid #eef2f7" }}>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: UI.brandSoft,
          color: UI.brand,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${UI.brandBorder}`,
        }}
      >
        <Icon size={15} />
      </span>
      <div>
        <div style={{ color: UI.muted, fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
        <div style={{ color: UI.text, fontSize: 13.5, fontWeight: 900, marginTop: 2 }}>
          {value === undefined || value === null || value === "" ? "-" : value}
        </div>
      </div>
    </div>
  );
}
