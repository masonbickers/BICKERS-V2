"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";


export default function EmployeeListPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState("none");
  const applyFilter = (list) => {
    switch (filter) {
      case "jobTitle":
        return [...list].sort((a, b) => a.jobTitle.localeCompare(b.jobTitle));
      case "name":
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case "dob":
        return [...list].sort((a, b) => new Date(a.dob) - new Date(b.dob));
      default:
        return list;
    }
  };
  
  const filteredEmployees = applyFilter(employees);
  


  useEffect(() => {
    const fetchEmployees = async () => {
      const snapshot = await getDocs(collection(db, "employees"));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setEmployees(data);
    };

    fetchEmployees();
  }, []);

  return (
    <HeaderSidebarLayout>
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#333", fontFamily: "Arial, sans-serif" }}>
      {/* Sidebar */}


     


      {/* Main */}
      <main style={{ flex: 1, padding: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>Employee Information</h1>

        <EmployeeCSVImport onImportComplete={() => window.location.reload()} />

        <div style={{ marginBottom: 20 }}>
          <label style={{ marginRight: 10 }}>Sort By:</label>
          <select onChange={(e) => setFilter(e.target.value)} style={inputStyle}>
            <option value="none">None</option>
            <option value="jobTitle">Job Title (A–Z)</option>
            <option value="name">Name (A–Z)</option>
            <option value="dob">DOB (Oldest First)</option>
          </select>
        </div>


        <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <thead style={{ backgroundColor: "#1976d2", color: "#fff" }}>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>DOB</th>
              <th style={thStyle}>Licence Number</th>
              <th style={thStyle}>Job Title</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Mobile</th>
              <th style={thStyle}>Edit</th>
            </tr>
          </thead>
          <tbody>
          {filteredEmployees.map(employee => (
              <tr key={employee.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={tdStyle}>{employee.name}</td>
                <td style={tdStyle}>{employee.dob}</td>
                <td style={tdStyle}>{employee.licenceNumber}</td>
                <td style={tdStyle}>{employee.jobTitle}</td>
                <td style={tdStyle}>{employee.email}</td>
                <td style={tdStyle}>{employee.mobile}</td>
                <td style={tdStyle}>
                  <button
                    style={editButton}
                    onClick={() => router.push(`/edit-employee/${employee.id}`)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 30, textAlign: "right" }}>
          <button style={addButton} onClick={() => router.push("/add-employee")}>Add Employee</button>
        </div>
      </main>
    </div>
    </HeaderSidebarLayout>
  );
}

const navButton = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid #333",
};

const thStyle = {
  padding: 12,
  textAlign: "left",
  fontWeight: "bold",
};

const tdStyle = {
  padding: 12,
  textAlign: "left",
};

const addButton = {
  padding: "10px 20px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const editButton = {
  padding: "6px 12px",
  backgroundColor: "#4caf50",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
};

import Papa from "papaparse";
import { addDoc } from "firebase/firestore";

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
              jobTitle: employee.jobTitle || "",
              email: employee.email || "",
              mobile: employee.mobile || ""
            });
          } catch (err) {
            console.error("❌ Error importing employee:", err);
          }
        }

        alert("✅ Employee data imported successfully!");
        onImportComplete();
      },
    });
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontWeight: "bold", marginRight: 12 }}>Import Employee CSV:</label>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
    </div>
  );
}
const inputStyle = {
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: "4px",
};
