"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db, storage } from "../../../firebaseConfig";
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  dataAccessKey,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
  useDataAccessState,
} from "@/app/utils/firestoreAccess";
import { companyStoragePath } from "@/app/utils/storageAccess";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  FileUp,
  FolderOpen,
  Info,
  RefreshCcw,
  Save,
  UserRound,
  Users,
} from "lucide-react";

/* Mini design system */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  good: "#15803d",
  goodBg: "#ecfdf3",
  goodBorder: "#bbf7d0",
  warn: "#b45309",
  warnBg: "#fffbeb",
  warnBorder: "#fde68a",
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
const card = { ...surface, padding: 12 };

const sectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};
const titleMd = { fontSize: 17, fontWeight: 800, color: UI.text, margin: 0, letterSpacing: 0 };
const hint = { color: UI.muted, fontSize: 12.5, marginTop: 6, lineHeight: 1.4 };

const formShell = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 320px",
  gap: UI.gap,
  alignItems: "start",
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const label = { display: "block", fontSize: 11.5, fontWeight: 900, color: UI.muted, textTransform: "uppercase", marginBottom: 6 };
const input = {
  width: "100%",
  minHeight: 36,
  padding: "7px 9px",
  borderRadius: UI.radiusSm,
  border: UI.border,
  outline: "none",
  fontSize: 13,
  background: "#fff",
  color: UI.text,
};
const textarea = { ...input, minHeight: 74, resize: "vertical" };
const divider = { height: 1, background: "#dde5ee", margin: "4px 0" };

const chip = (kind = "neutral") => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  if (kind === "good") return { ...base, border: `1px solid ${UI.goodBorder}`, background: UI.goodBg, color: UI.good };
  if (kind === "warn") return { ...base, border: `1px solid ${UI.warnBorder}`, background: UI.warnBg, color: UI.warn };
  return { ...base, border: `1px solid ${UI.brandBorder}`, background: UI.brandSoft, color: UI.text };
};

const btn = (kind = "primary") => {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
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
    gap: 7,
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

const iconBox = (color = UI.brand, bg = UI.brandSoft, border = UI.brandBorder) => ({
  width: 34,
  height: 34,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: bg,
  color,
  border: `1px solid ${border}`,
  flex: "0 0 auto",
});

const progressTrack = {
  height: 9,
  borderRadius: 999,
  border: UI.border,
  background: "#eef3f8",
  overflow: "hidden",
};

const focusCss = `
  input:focus, select:focus, textarea:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
  button:disabled { opacity: .55; cursor: not-allowed; }
  @media (max-width: 1180px) {
    .upload-contract-form-shell,
    .upload-contract-grid { grid-template-columns: 1fr !important; }
  }
`;

function safeStr(v) {
  return String(v ?? "").trim();
}

export default function UploadContractPage() {
  const router = useRouter();
  const dataAccessState = useDataAccessState();
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);

  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [docType, setDocType] = useState("Contract");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [notes, setNotes] = useState("");

  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const selectedEmployee = useMemo(() => {
    if (!employeeId) return null;
    return employees.find((e) => e.id === employeeId) || null;
  }, [employeeId, employees]);

  const uploadName = safeStr(employeeName) || safeStr(selectedEmployee?.name) || "Unknown";
  const fileSize = file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : "-";
  const statusKind = saving || file ? "good" : "warn";
  const statusText = saving ? `Uploading ${Math.round(progress)}%` : file ? "File selected" : "No file";

  useEffect(() => {
    let mounted = true;
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return undefined;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "load contract upload employees" });
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
          .sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name)));
        if (mounted) setEmployees(list);
      } catch (e) {
        console.error("Failed to load employees:", e);
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
    if (selectedEmployee?.name) setEmployeeName(selectedEmployee.name);
  }, [selectedEmployee]);

  const validate = () => {
    if (!employeeId && !safeStr(employeeName)) return "Pick an employee (or type a name).";
    if (!file) return "Choose a file to upload.";
    return null;
  };

  const resetForm = () => {
    setEmployeeId("");
    setEmployeeName("");
    setDocType("Contract");
    setEffectiveDate("");
    setNotes("");
    setFile(null);
    setProgress(0);
  };

  const onUpload = async (e) => {
    e.preventDefault();
    if (saving) return;

    const err = validate();
    if (err) {
      alert(err);
      return;
    }

    try {
      setSaving(true);
      setProgress(0);

      const empName = safeStr(employeeName) || safeStr(selectedEmployee?.name) || "Unknown";
      const empId = employeeId || null;

      const cleanType = safeStr(docType) || "Document";
      const timestamp = Date.now();
      const originalName = file.name || "upload";
      const safeOriginal = originalName.replace(/[^\w.\-() ]+/g, "_");
      const storagePath = companyStoragePath(
        dataAccessState,
        `hr/contracts/${empId || empName}/${timestamp}_${safeOriginal}`
      );

      const ref = storageRef(storage, storagePath);
      const task = uploadBytesResumable(ref, file);

      await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
            setProgress(Math.max(0, Math.min(100, pct)));
          },
          (error) => reject(error),
          () => resolve()
        );
      });

      const url = await getDownloadURL(task.snapshot.ref);

      await addDoc(collection(db, "hrDocuments"), tenantPayload(dataAccessState, {
        employeeId: empId,
        employeeName: empName,
        docType: cleanType,
        effectiveDate: effectiveDate || null,
        notes: notes || "",
        fileName: originalName,
        fileType: file.type || "",
        fileSize: file.size || 0,
        storagePath,
        url,
        createdAt: serverTimestamp(),
      }));

      alert("Uploaded successfully");
      resetForm();
    } catch (error) {
      console.error("Upload failed:", error);
      alert(`Upload failed.\n${error?.message || ""}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <style>{focusCss}</style>

      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Upload documents</h1>
            <div style={sub}>Add contracts and HR documents to an employee record.</div>
          </div>
          <button style={btn("ghost")} type="button" onClick={() => router.push("/employees")}>
            <ArrowLeft size={14} /> Back to employees
          </button>
        </div>

        <form onSubmit={onUpload} className="upload-contract-form-shell" style={formShell}>
          <section style={card}>
            <div style={sectionHeader}>
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <span style={iconBox(UI.brand, UI.brandSoft)}>
                  <FileUp size={17} />
                </span>
                <div>
                  <h2 style={titleMd}>New Upload</h2>
                  <div style={hint}>PDF, Word and image documents are supported.</div>
                </div>
              </div>
              <span style={chip(statusKind)}>
                {file ? <CheckCircle2 size={13} /> : <Info size={13} />}
                {statusText}
              </span>
            </div>

            <div className="upload-contract-grid" style={grid2}>
              <Field icon={Users} labelText="Employee" full>
                <select style={input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={loadingEmployees}>
                  <option value="">{loadingEmployees ? "Loading employees..." : "Select employee (optional)"}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {safeStr(e.name) || "Unnamed"}
                      {e.jobTitle ? ` - ${Array.isArray(e.jobTitle) ? e.jobTitle.join(", ") : e.jobTitle}` : ""}
                    </option>
                  ))}
                </select>
                <div style={hint}>Select an employee, or type a manual name below.</div>
              </Field>

              <Field icon={UserRound} labelText="Employee name" full>
                <input
                  style={input}
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="e.g. John Smith"
                />
              </Field>

              <Field icon={FileText} labelText="Document type">
                <select style={input} value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="Contract">Contract</option>
                  <option value="P45">P45</option>
                  <option value="P60">P60</option>
                  <option value="ID">ID</option>
                  <option value="Certificate">Certificate</option>
                  <option value="Other">Other</option>
                </select>
              </Field>

              <Field icon={CalendarDays} labelText="Effective date">
                <input style={input} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
              </Field>

              <Field icon={FolderOpen} labelText="File" full>
                <input
                  style={{ ...input, padding: "7px 9px" }}
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <div style={hint}>{file ? `${file.name} - ${fileSize}` : "Choose a file to upload."}</div>
              </Field>

              <Field icon={Info} labelText="Notes" full>
                <textarea
                  style={textarea}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes, for example signed copy, renewal, or right-to-work."
                />
              </Field>
            </div>
          </section>

          <aside style={{ display: "grid", gap: UI.gap }}>
            <section style={card}>
              <div style={sectionHeader}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <span style={iconBox("#15803d", "#ecfdf3", "#bbf7d0")}>
                    <Save size={17} />
                  </span>
                  <div>
                    <h2 style={titleMd}>Upload Status</h2>
                    <div style={hint}>Progress updates while the file is saving.</div>
                  </div>
                </div>
              </div>

              <div style={divider} />

              <div style={{ display: "grid", gap: 10 }}>
                <div style={progressTrack}>
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, progress))}%`,
                      height: "100%",
                      background: UI.brand,
                      transition: "width .2s ease",
                    }}
                  />
                </div>
                <span style={chip(progress >= 100 ? "good" : "neutral")}>
                  {saving ? `Uploading ${Math.round(progress)}%` : "Ready"}
                </span>
                <button type="submit" style={btn()} disabled={saving}>
                  <FileUp size={14} /> {saving ? "Uploading..." : "Upload"}
                </button>
                <button type="button" style={btn("ghost")} onClick={resetForm} disabled={saving}>
                  <RefreshCcw size={14} /> Reset
                </button>
              </div>
            </section>

            <section style={card}>
              <div style={sectionHeader}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <span style={iconBox("#7c3aed", "#f5f3ff", "#ddd6fe")}>
                    <Info size={17} />
                  </span>
                  <div>
                    <h2 style={titleMd}>Save Location</h2>
                    <div style={hint}>Metadata is stored with the uploaded file link.</div>
                  </div>
                </div>
              </div>
              <div style={divider} />
              <KeyValue labelText="Employee" value={uploadName} />
              <KeyValue labelText="Document" value={docType} />
              <KeyValue labelText="Date" value={effectiveDate || "-"} />
              <KeyValue labelText="File size" value={fileSize} />
              <KeyValue labelText="Storage" value="hr/contracts/..." />
              <KeyValue labelText="Firestore" value="hrDocuments" />
            </section>
          </aside>
        </form>
      </div>
    </HeaderSidebarLayout>
  );
}

function Field({ icon: Icon, labelText, full = false, children }) {
  return (
    <div style={full ? { gridColumn: "1 / -1" } : undefined}>
      <label style={label}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon size={13} />
          {labelText}
        </span>
      </label>
      {children}
    </div>
  );
}

function KeyValue({ labelText, value }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "7px 0",
        borderBottom: "1px solid #edf2f7",
        fontSize: 12.5,
      }}
    >
      <span style={{ color: UI.muted, fontWeight: 800 }}>{labelText}</span>
      <span style={{ color: UI.text, fontWeight: 800, textAlign: "right", overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}
