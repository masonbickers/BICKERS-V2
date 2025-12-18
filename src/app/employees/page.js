"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, getDocs, addDoc } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import Papa from "papaparse";

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
  green: "#16a34a",
  greenSoft: "#dcfce7",
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

const chipSoft = {
  ...chip,
  background: UI.brandSoft,
  borderColor: "#dbeafe",
  color: UI.brand,
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
  if (kind === "success") {
    return {
      padding: "8px 10px",
      borderRadius: UI.radiusSm,
      border: "1px solid #86efac",
      background: UI.greenSoft,
      color: "#065f46",
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

const input = {
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  fontSize: 13.5,
  outline: "none",
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
  fontWeight: 900,
  color: UI.text,
};
const td = { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", color: UI.text };

const badge = {
  background: UI.brandSoft,
  border: "1px solid #dbeafe",
  color: UI.brand,
  fontSize: 12,
  fontWeight: 900,
  padding: "4px 8px",
  borderRadius: 999,
  display: "inline-block",
};

const rowHover = `
  tr[data-row="true"]:hover td {
    background: rgba(239,246,255,0.55);
  }
  input:focus, select:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
`;

export default function EmployeeListPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState("none");

  const applyFilter = (list) => {
    switch (filter) {
      case "jobTitle":
        return [...list].sort((a, b) => (a.jobTitle?.[0] || "").localeCompare(b.jobTitle?.[0] || ""));
      case "name":
        return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      case "dob":
        return [...list].sort((a, b) => new Date(a.dob) - new Date(b.dob));
      default:
        return list;
    }
  };

  const filteredEmployees = useMemo(() => applyFilter(employees), [employees, filter]);

  useEffect(() => {
    const fetchEmployees = async () => {
      const snapshot = await getDocs(collection(db, "employees"));
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setEmployees(data);
    };
    fetchEmployees();
  }, []);

  return (
    <HeaderSidebarLayout>
      <style>{rowHover}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Employee information</h1>
            <div style={sub}>View, sort, and update employee records. Import via CSV when needed.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={chip}>{employees.length} employees</span>
            <span style={chipSoft}>Employees</span>
          </div>
        </div>

        {/* Tools row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: UI.gap, alignItems: "start" }}>
          <div style={{ ...surface, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900, color: UI.text }}>CSV import</div>
                <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>
                  Upload a CSV with columns: <b>name</b>, <b>dob</b>, <b>licenceNumber</b>, <b>jobTitle</b>, <b>email</b>, <b>mobile</b>
                </div>
              </div>
              <EmployeeCSVImport onImportComplete={() => window.location.reload()} />
            </div>
          </div>

          <div style={{ ...surface, padding: 16 }}>
            <div style={{ fontWeight: 900, color: UI.text, marginBottom: 10 }}>Sort</div>
            <select onChange={(e) => setFilter(e.target.value)} style={{ ...input, width: 220 }}>
              <option value="none">None</option>
              <option value="jobTitle">Job Title (A–Z)</option>
              <option value="name">Name (A–Z)</option>
              <option value="dob">DOB (Oldest First)</option>
            </select>
          </div>
        </div>

        {/* Employee Table */}
        <section style={{ ...surface, marginTop: UI.gap, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 900, color: UI.text }}>Employee table</div>
              <div style={{ color: UI.muted, fontSize: 12, marginTop: 4 }}>Click edit to update an employee record.</div>
            </div>
            <button style={btn()} onClick={() => router.push("/add-employee")} type="button">
              + Add employee
            </button>
          </div>

          <div style={tableWrap}>
            <table style={tableEl}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>DOB</th>
                  <th style={th}>Licence number</th>
                  <th style={th}>Job title</th>
                  <th style={th}>Email</th>
                  <th style={th}>Mobile</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} data-row="true">
                    <td style={td}>
                      <div style={{ fontWeight: 900 }}>{employee.name || "—"}</div>
                    </td>
                    <td style={td}>{employee.dob || "—"}</td>
                    <td style={td}>{employee.licenceNumber || "—"}</td>

                    <td style={td}>
                      {Array.isArray(employee.jobTitle) && employee.jobTitle.length ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {employee.jobTitle.map((job, i) => (
                            <span key={i} style={badge}>
                              {job}
                            </span>
                          ))}
                        </div>
                      ) : (
                        employee.jobTitle || "—"
                      )}
                    </td>

                    <td style={td}>
                      <div style={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {employee.email || "—"}
                      </div>
                    </td>
                    <td style={td}>{employee.mobile || "—"}</td>
                    <td style={td}>
                      <button style={btn("success")} onClick={() => router.push(`/edit-employee/${employee.id}`)} type="button">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td style={{ ...td, color: UI.muted }} colSpan={7}>
                      No employees found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </HeaderSidebarLayout>
  );
}

/* ---------- CSV Import ---------- */
function EmployeeCSVImport({ onImportComplete }) {
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function (results) {
        const employees = results.data;

        for (const employee of employees) {
          const isValid = employee.name && employee.dob && employee.licenceNumber;
          if (!isValid) continue;

          try {
            await addDoc(collection(db, "employees"), {
              name: employee.name,
              dob: employee.dob,
              licenceNumber: employee.licenceNumber,
              jobTitle: employee.jobTitle ? employee.jobTitle.split(",").map((j) => j.trim()) : [],
              email: employee.email || "",
              mobile: employee.mobile || "",
            });
          } catch (err) {
            console.error("❌ Error importing employee:", err);
          }
        }

        alert("✅ Employee data imported successfully!");
        onImportComplete?.();
      },
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <label style={{ fontWeight: 900, color: UI.text }}>Upload CSV</label>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
    </div>
  );
}
