"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { db, storage } from "../../../firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";

/* ───────────────────────────────────────────
   Mini design system (matches your Jobs Home)
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
  good: "#065f46",
  goodBg: "#d1fae5",
  goodBorder: "#86efac",
  warn: "#92400e",
  warnBg: "#fffbeb",
  warnBorder: "#fde68a",
  danger: "#991b1b",
  dangerBg: "#fee2e2",
  dangerBorder: "#fecaca",
};

const pageWrap = { padding: "24px 18px 40px", background: UI.bg, minHeight: "100vh" };
const headerBar = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16,
};
const h1 = { color: UI.text, fontSize: 26, lineHeight: 1.15, fontWeight: 900, letterSpacing: "-0.01em", margin: 0 };
const sub = { color: UI.muted, fontSize: 13, marginTop: 6 };
const surface = { background: UI.card, borderRadius: UI.radius, border: UI.border, boxShadow: UI.shadowSm };

const card = { ...surface, padding: 16 };
const sectionHeader = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};
const titleMd = { fontSize: 16, fontWeight: 900, color: UI.text, margin: 0 };
const hint = { color: UI.muted, fontSize: 12, marginTop: 4 };

const grid2 = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const label = { display: "block", fontSize: 12, fontWeight: 900, color: UI.text, marginBottom: 6 };
const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 13.5,
  background: "#fff",
};
const textarea = { ...input, minHeight: 96, resize: "vertical" };

const divider = { height: 1, background: "#e5e7eb", margin: "14px 0" };

const chip = (kind = "neutral") => {
  if (kind === "good") return { padding: "6px 10px", borderRadius: 999, border: `1px solid ${UI.goodBorder}`, background: UI.goodBg, color: UI.good, fontSize: 12, fontWeight: 900 };
  if (kind === "warn") return { padding: "6px 10px", borderRadius: 999, border: `1px solid ${UI.warnBorder}`, background: UI.warnBg, color: UI.warn, fontSize: 12, fontWeight: 900 };
  if (kind === "danger") return { padding: "6px 10px", borderRadius: 999, border: `1px solid ${UI.dangerBorder}`, background: UI.dangerBg, color: UI.danger, fontSize: 12, fontWeight: 900 };
  return { padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f1f5f9", color: UI.text, fontSize: 12, fontWeight: 900 };
};

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
      border: `1px solid ${UI.dangerBorder}`,
      background: UI.dangerBg,
      color: UI.danger,
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

const tableWrap = { overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 };
const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  position: "sticky",
  top: 0,
  background: "#f8fafc",
  zIndex: 1,
  whiteSpace: "nowrap",
};
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };

function safeStr(v) {
  return String(v ?? "").trim();
}

export default function UploadContractPage() {
  const router = useRouter();

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingEmployees(true);
      try {
        const snap = await getDocs(collection(db, "employees"));
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
  }, []);

  useEffect(() => {
    // Auto-fill employee name if selected
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
      alert(`❌ ${err}`);
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
      const ext = originalName.includes(".") ? originalName.split(".").pop() : "";
      const safeOriginal = originalName.replace(/[^\w.\-() ]+/g, "_");
      const storagePath = `hr/contracts/${empId || empName}/${timestamp}_${safeOriginal}`;

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

      // Save metadata in Firestore (create a "hrDocuments" collection)
      await addDoc(collection(db, "hrDocuments"), {
        employeeId: empId,
        employeeName: empName,
        docType: cleanType, // Contract | P45 | P60 | ID | Certificate | Other
        effectiveDate: effectiveDate || null,
        notes: notes || "",
        fileName: originalName,
        fileType: file.type || "",
        fileSize: file.size || 0,
        storagePath,
        url,
        createdAt: serverTimestamp(),
      });

      alert("✅ Uploaded successfully");
      resetForm();
    } catch (error) {
      console.error("Upload failed:", error);
      alert(`❌ Upload failed.\n${error?.message || ""}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Upload documents</h1>
            <div style={sub}>Upload contracts and HR docs to Storage and save metadata to Firestore.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button style={btn("ghost")} type="button" onClick={() => router.push("/employees")}>
              Back to employees
            </button>
          </div>
        </div>

        <section style={card}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>New upload</h2>
              <div style={hint}>Supported: PDF / DOCX / Images. (Whatever your Storage rules allow.)</div>
            </div>
            <div style={chip(file ? "good" : "warn")}>{file ? "File selected" : "No file"}</div>
          </div>

          <form onSubmit={onUpload} style={{ display: "grid", gap: 14 }}>
            <div style={grid2}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Employee</label>
                <select
                  style={input}
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  disabled={loadingEmployees}
                >
                  <option value="">{loadingEmployees ? "Loading employees…" : "Select employee (optional)"}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {safeStr(e.name) || "Unnamed"} {e.jobTitle ? `• ${Array.isArray(e.jobTitle) ? e.jobTitle.join(", ") : e.jobTitle}` : ""}
                    </option>
                  ))}
                </select>
                <div style={hint}>If you don’t select, type a name below (useful for freelancers).</div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Employee name (manual override)</label>
                <input
                  style={input}
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="e.g. John Smith"
                />
              </div>

              <div>
                <label style={label}>Document type</label>
                <select style={input} value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="Contract">Contract</option>
                  <option value="P45">P45</option>
                  <option value="P60">P60</option>
                  <option value="ID">ID</option>
                  <option value="Certificate">Certificate</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label style={label}>Effective date</label>
                <input style={input} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                <div style={hint}>Optional (useful for contracts / renewals).</div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>File</label>
                <input
                  style={{ ...input, padding: "9px 12px" }}
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <div style={hint}>
                  {file ? (
                    <>
                      <b>{file.name}</b> • {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </>
                  ) : (
                    "Choose a file to upload."
                  )}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Notes</label>
                <textarea
                  style={textarea}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes (e.g. signed copy, renewal, right-to-work, etc.)"
                />
              </div>
            </div>

            <div style={divider} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={chip(progress >= 100 ? "good" : "neutral")}>
                  {saving ? `Uploading… ${Math.round(progress)}%` : "Ready"}
                </span>
                <div style={{ width: 240, height: 10, borderRadius: 999, border: "1px solid #e5e7eb", background: "#f1f5f9", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(0, Math.min(100, progress))}%`,
                      background: UI.brand,
                      transition: "width .2s ease",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={btn("ghost")} onClick={resetForm} disabled={saving}>
                  Reset
                </button>
                <button type="submit" style={btn()} disabled={saving}>
                  {saving ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section style={{ ...card, marginTop: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Where this saves</h2>
              <div style={hint}>
                Storage: <b>hr/contracts/…</b> • Firestore: <b>hrDocuments</b>
              </div>
            </div>
            <span style={chip("neutral")}>Info</span>
          </div>

          <div style={tableWrap}>
            <table style={tableEl}>
              <thead>
                <tr>
                  <th style={th}>Field</th>
                  <th style={th}>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={td}><b>employeeId</b></td>
                  <td style={td}>{employeeId || "null (manual name used)"}</td>
                </tr>
                <tr>
                  <td style={td}><b>employeeName</b></td>
                  <td style={td}>{safeStr(employeeName) || safeStr(selectedEmployee?.name) || "Unknown"}</td>
                </tr>
                <tr>
                  <td style={td}><b>docType</b></td>
                  <td style={td}>{docType}</td>
                </tr>
                <tr>
                  <td style={td}><b>effectiveDate</b></td>
                  <td style={td}>{effectiveDate || "null"}</td>
                </tr>
                <tr>
                  <td style={td}><b>url</b></td>
    
                </tr>
                <tr>
                  <td style={td}><b>storagePath</b></td>
                  <td style={td}><span style={{ color: UI.muted }}>hr/contracts/…</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}
