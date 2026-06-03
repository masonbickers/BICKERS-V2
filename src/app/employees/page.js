"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, getDocs, addDoc } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { useAuth } from "@/app/context/authContext";
import {
  dataAccessKey,
  handleFirestoreAccessError,
  reportDataAccessBlocked,
  resolveDataAccess,
  tenantCollectionQuery,
  tenantPayload,
} from "@/app/utils/firestoreAccess";
import Papa from "papaparse";
import {
  ContactRound,
  FileText,
  FileUp,
  IdCard,
  Pencil,
  SlidersHorizontal,
  UserPlus,
  Users,
} from "lucide-react";

/* Mini design system */
const UI = {
  radius: 8,
  radiusSm: 8,
  gap: 12,
  shadowSm: "0 1px 2px rgba(15,23,42,0.05)",
  shadowHover: "0 8px 18px rgba(15,23,42,0.08)",
  border: "1px solid #d7dee8",
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
  green: "#16a34a",
  greenSoft: "#dcfce7",
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

const chip = {
  padding: "5px 9px",
  borderRadius: 999,
  border: `1px solid ${UI.brandBorder}`,
  background: UI.brandSoft,
  color: UI.text,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const chipSoft = {
  ...chip,
  background: UI.brandSoft,
  borderColor: UI.brandBorder,
  color: UI.brand,
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
  if (kind === "success") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      padding: "6px 9px",
      borderRadius: UI.radiusSm,
      border: "1px solid #86efac",
      background: UI.greenSoft,
      color: "#065f46",
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
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

const input = {
  minHeight: 36,
  padding: "7px 9px",
  border: UI.border,
  borderRadius: UI.radiusSm,
  background: "#fff",
  fontSize: 13,
  outline: "none",
  color: UI.text,
};

const cardBase = {
  ...surface,
  padding: 12,
  background: "#ffffff",
  transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease",
};

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

const toolsGrid = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 270px",
  gap: UI.gap,
  alignItems: "stretch",
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  marginBottom: UI.gap,
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

const tableWrap = { overflow: "auto", border: UI.border, borderRadius: UI.radius, background: "#fff" };
const tableEl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 };
const th = {
  textAlign: "left",
  padding: "9px 11px",
  borderBottom: "1px solid #eef2f7",
  position: "sticky",
  top: 0,
  background: "#f6f8fb",
  zIndex: 1,
  whiteSpace: "nowrap",
  fontWeight: 900,
  color: UI.muted,
  fontSize: 11.5,
  textTransform: "uppercase",
};
const td = { padding: "9px 11px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle", color: UI.text };

const badge = {
  background: UI.brandSoft,
  border: `1px solid ${UI.brandBorder}`,
  color: UI.brand,
  fontSize: 12,
  fontWeight: 800,
  padding: "4px 8px",
  borderRadius: 999,
  display: "inline-block",
};

const rowHover = `
  tr[data-row="true"]:hover td {
    background: #fbfdff;
  }
  input:focus, select:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(29,78,216,0.15);
    border-color: #bfdbfe !important;
  }
  @media (max-width: 1180px) {
    .employees-tools-grid,
    .employees-summary-grid { grid-template-columns: 1fr !important; }
  }
`;

function isEmployeeRecord(employee = {}) {
  const role = String(employee.role || "").trim().toLowerCase();
  const employmentType = String(employee.employmentType || employee.contractType || employee.employeeType || "")
    .trim()
    .toLowerCase();
  const jobTitleBlob = Array.isArray(employee.jobTitle)
    ? employee.jobTitle.join(" ").toLowerCase()
    : String(employee.jobTitle || "").toLowerCase();

  if (
    employee.deleted === true ||
    employee.isDeleted === true ||
    employee.archived === true ||
    employee.isArchived === true ||
    employee.active === false ||
    employee.appDisabled === true
  ) return false;
  if (employee.isService === true) return false;
  if (role === "service" || role === "hybrid") return false;
  if (role === "freelancer" || role === "freelance") return false;
  if (employmentType.includes("freelance")) return false;
  if (jobTitleBlob.includes("freelance")) return false;
  return true;
}

function getPersonnelStatus(employee = {}) {
  const file = employee.personnelFile || {};
  const passport = employee.passport || file.passport || {};
  const drivingLicence = employee.drivingLicence || file.drivingLicence || {};
  const emergencyContacts = Array.isArray(employee.emergencyContacts)
    ? employee.emergencyContacts
    : Array.isArray(file.emergencyContacts)
      ? file.emergencyContacts
      : [];
  const documents = Array.isArray(employee.personnelDocuments)
    ? employee.personnelDocuments
    : Array.isArray(file.documents)
      ? file.documents
      : [];
  const hasPassport = Boolean(employee.passportNumber || passport.number || passport.documentUrl);
  const hasLicence = Boolean(employee.licenceNumber || employee.licenseNumber || drivingLicence.number || drivingLicence.documentUrl);
  const emergencyCount = emergencyContacts.filter((row) =>
    [row?.name, row?.phone, row?.email].some((value) => String(value || "").trim())
  ).length;
  const documentCount =
    documents.filter((row) =>
      [row?.type, row?.title, row?.reference, row?.documentUrl].some((value) => String(value || "").trim())
    ).length +
    (passport.documentUrl ? 1 : 0) +
    (drivingLicence.documentUrl ? 1 : 0);

  return { hasPassport, hasLicence, emergencyCount, documentCount };
}

export default function EmployeeListPage() {
  const router = useRouter();
  const authAccess = useAuth() || {};
  const dataAccessState = useMemo(
    () => ({
      user: authAccess.user,
      userDoc: authAccess.userDoc,
      isEnabled: authAccess.isEnabled,
      accessReady: authAccess.accessReady,
    }),
    [authAccess.accessReady, authAccess.isEnabled, authAccess.user, authAccess.userDoc]
  );
  const accessKey = useMemo(() => dataAccessKey(dataAccessState), [dataAccessState]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState("none");

  const filteredEmployees = useMemo(() => {
    switch (filter) {
      case "jobTitle":
        return [...employees].sort((a, b) => (a.jobTitle?.[0] || "").localeCompare(b.jobTitle?.[0] || ""));
      case "name":
        return [...employees].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      case "dob":
        return [...employees].sort((a, b) => new Date(a.dob) - new Date(b.dob));
      default:
        return employees;
    }
  }, [employees, filter]);
  const jobTitleCount = useMemo(() => {
    const titles = new Set();
    employees.forEach((employee) => {
      if (Array.isArray(employee.jobTitle)) {
        employee.jobTitle.forEach((title) => title && titles.add(String(title).trim()));
      } else if (employee.jobTitle) {
        titles.add(String(employee.jobTitle).trim());
      }
    });
    return titles.size;
  }, [employees]);
  const personnelMetrics = useMemo(() => {
    return employees.reduce(
      (acc, employee) => {
        const status = getPersonnelStatus(employee);
        if (status.emergencyCount > 0) acc.withEmergency += 1;
        if (status.documentCount > 0) acc.withDocuments += 1;
        if (status.hasPassport || status.hasLicence || status.emergencyCount > 0 || status.documentCount > 0) {
          acc.started += 1;
        }
        return acc;
      },
      { started: 0, withEmergency: 0, withDocuments: 0 }
    );
  }, [employees]);

  useEffect(() => {
    const gate = resolveDataAccess(dataAccessState);
    if (gate.checking) return;
    if (!gate.allowed) {
      reportDataAccessBlocked(gate, { collectionName: "employees", operation: "read employees" });
      return;
    }

    const fetchEmployees = async () => {
      const snapshot = await getDocs(tenantCollectionQuery(db, "employees", dataAccessState));
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter(isEmployeeRecord);
      setEmployees(data);
    };
    fetchEmployees().catch((error) => {
      if (!handleFirestoreAccessError(error, { collectionName: "employees", operation: "read employees" })) {
        console.error("[employees] load error:", error);
      }
    });
  }, [accessKey, dataAccessState]);

  return (
    <HeaderSidebarLayout>
      <style>{rowHover}</style>

      <div style={pageWrap}>
        {/* Header */}
        <div style={headerBar}>
          <div>
            <h1 style={h1}>Employee Personnel Files</h1>
            <div style={sub}>Open each employee file to manage contact details, right-to-work, licence, emergency contacts and HR documents.</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <span style={chip}>{employees.length} employees</span>
            <button style={btn()} onClick={() => router.push("/add-employee")} type="button">
              <UserPlus size={14} /> Add employee
            </button>
          </div>
        </div>

        <div className="employees-summary-grid" style={summaryGrid}>
          <MetricCard label="Employees" value={employees.length} icon={Users} />
          <MetricCard label="Files Started" value={personnelMetrics.started} icon={FileText} tone="soft" />
          <MetricCard label="Emergency Contacts" value={personnelMetrics.withEmergency} icon={ContactRound} tone="soft" />
          <MetricCard label="HR Documents" value={personnelMetrics.withDocuments} icon={IdCard} tone="soft" />
        </div>

        {/* Tools row */}
        <div className="employees-tools-grid" style={toolsGrid}>
          <div style={cardBase}>
            <div style={sectionHeader}>
              <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                <span style={iconBox(UI.brand, UI.brandSoft)}>
                  <FileUp size={17} />
                </span>
                <div>
                  <h2 style={titleMd}>CSV Import</h2>
                  <div style={hint}>
                    Upload a CSV with columns: <b>name</b>, <b>dob</b>, <b>licenceNumber</b>, <b>jobTitle</b>, <b>email</b>, <b>mobile</b>.
                  </div>
                </div>
              </div>
              <EmployeeCSVImport dataAccessState={dataAccessState} onImportComplete={() => window.location.reload()} />
            </div>
          </div>

          <div style={cardBase}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <span style={iconBox(UI.brand, UI.brandSoft)}>
                <SlidersHorizontal size={17} />
              </span>
              <div>
                <h2 style={{ ...titleMd, fontSize: 15 }}>Sort</h2>
                <div style={hint}>Order the employee table.</div>
              </div>
            </div>
            <select onChange={(e) => setFilter(e.target.value)} style={{ ...input, width: 220 }}>
              <option value="none">None</option>
              <option value="jobTitle">Job Title (A-Z)</option>
              <option value="name">Name (A-Z)</option>
              <option value="dob">DOB (Oldest First)</option>
            </select>
          </div>
        </div>

        {/* Employee Table */}
        <section style={{ ...cardBase, marginTop: UI.gap }}>
          <div style={sectionHeader}>
            <div>
              <h2 style={titleMd}>Personnel File Register</h2>
              <div style={hint}>Click open file to update employment, passport, licence, emergency and document records.</div>
            </div>
            <span style={chipSoft}>{filteredEmployees.length} listed</span>
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
                  <th style={th}>Personnel file</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const personnel = getPersonnelStatus(employee);
                  return (
                  <tr key={employee.id} data-row="true">
                    <td style={td}>
                      <div style={{ fontWeight: 850 }}>{employee.name || "-"}</div>
                    </td>
                    <td style={td}>{employee.dob || "-"}</td>
                    <td style={td}>{employee.licenceNumber || "-"}</td>

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
                        employee.jobTitle || "-"
                      )}
                    </td>

                    <td style={td}>
                      <div style={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {employee.email || "-"}
                      </div>
                    </td>
                    <td style={td}>{employee.mobile || "-"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ ...badge, background: personnel.hasPassport ? "#ecfdf5" : "#f8fafc" }}>
                          Passport {personnel.hasPassport ? "added" : "missing"}
                        </span>
                        <span style={{ ...badge, background: personnel.hasLicence ? "#ecfdf5" : "#f8fafc" }}>
                          Licence {personnel.hasLicence ? "added" : "missing"}
                        </span>
                        <span style={{ ...badge, background: personnel.emergencyCount ? "#ecfdf5" : "#f8fafc" }}>
                          Emergency {personnel.emergencyCount}
                        </span>
                        <span style={{ ...badge, background: personnel.documentCount ? "#eff6ff" : "#f8fafc" }}>
                          Docs {personnel.documentCount}
                        </span>
                      </div>
                    </td>
                    <td style={td}>
                      <button style={btn("success")} onClick={() => router.push(`/edit-employee/${employee.id}`)} type="button">
                        <Pencil size={14} /> Open file
                      </button>
                    </td>
                  </tr>
                  );
                })}

                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td style={{ ...td, color: UI.muted }} colSpan={8}>
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

function MetricCard({ label, value, icon: Icon, tone = "default" }) {
  const colors =
    tone === "soft"
      ? { bg: UI.brandSoft, border: UI.brandBorder, fg: UI.brand }
      : { bg: "#ffffff", border: "#d7dee8", fg: UI.brand };

  return (
    <div style={{ ...surface, padding: 11, minHeight: 92, boxShadow: "none", background: colors.bg, border: `1px solid ${colors.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ color: UI.muted, fontSize: 11.5, fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
        <span style={iconBox(colors.fg, "#fff", colors.border)}>
          <Icon size={17} />
        </span>
      </div>
      <div style={{ marginTop: 10, color: UI.text, fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

/* CSV Import */
function EmployeeCSVImport({ onImportComplete, dataAccessState }) {
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
            await addDoc(collection(db, "employees"), tenantPayload(dataAccessState, {
              name: employee.name,
              dob: employee.dob,
              licenceNumber: employee.licenceNumber,
              jobTitle: employee.jobTitle ? employee.jobTitle.split(",").map((j) => j.trim()) : [],
              email: employee.email || "",
              mobile: employee.mobile || "",
            }));
          } catch (err) {
            if (!handleFirestoreAccessError(err, { collectionName: "employees", operation: "import employee" })) {
              console.error("Error importing employee:", err);
            }
          }
        }

        alert("Employee data imported successfully!");
        onImportComplete?.();
      },
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <label style={{ ...btn("ghost"), cursor: "default" }}>
        <FileUp size={14} /> Upload CSV
      </label>
      <input type="file" accept=".csv" onChange={handleFileUpload} style={{ fontSize: 12.5, color: UI.muted }} />
    </div>
  );
}
