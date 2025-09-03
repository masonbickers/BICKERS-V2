"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../firebaseConfig";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const employeeId = params.id;

  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    dob: "",
    licenceNumber: "",
    jobTitle: [] // ✅ now an array
  });

  const jobOptions = [
    "Driver",
    "Freelance",
    "Workshop",
    "Head and Arm Tech",
    "U-Crane Driver",
    "Transport Driver",
    "Arm Operator",
    "Stunts",
    "Camera Operator",
  ];

  useEffect(() => {
    const fetchEmployee = async () => {
      const docRef = doc(db, "employees", employeeId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        // ✅ Ensure jobTitle is always an array
        setFormData({
          ...data,
          jobTitle: Array.isArray(data.jobTitle) ? data.jobTitle : [data.jobTitle].filter(Boolean),
        });
      } else {
        alert("Employee not found");
        router.push("/employees");
      }
    };
    if (employeeId) fetchEmployee();
  }, [employeeId, router]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleJobCheckbox = (job) => {
    setFormData((prev) => {
      const selectedJobs = prev.jobTitle.includes(job)
        ? prev.jobTitle.filter((j) => j !== job) // remove if already selected
        : [...prev.jobTitle, job]; // add if not selected
      return { ...prev, jobTitle: selectedJobs };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const docRef = doc(db, "employees", employeeId);
      await updateDoc(docRef, formData);
      alert("✅ Employee updated");
      router.push("/employees");
    } catch (err) {
      console.error("Error updating employee:", err);
      alert("❌ Failed to update employee");
    }
  };

  const handleCancel = () => {
    router.push("/employees");
  };

  const handleDelete = async () => {
    const confirmDelete = confirm("Are you sure you want to delete this employee?");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "employees", employeeId));
      alert("🗑️ Employee deleted");
      router.push("/employees");
    } catch (err) {
      console.error("Error deleting employee:", err);
      alert("❌ Failed to delete employee");
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#333" }}>
      <main style={{ flex: 1, padding: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>Edit Employee</h1>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 500 }}>
          {[
            { label: "Full Name", name: "name", type: "text" },
            { label: "Mobile Number", name: "mobile", type: "tel" },
            { label: "Email", name: "email", type: "email" },
            { label: "Date of Birth", name: "dob", type: "date" },
            { label: "Driving Licence Number", name: "licenceNumber", type: "text" }
          ].map(({ label, name, type }) => (
            <div key={name}>
              <label style={{ display: "block", marginBottom: 6 }}>{label}</label>
              <input
                type={type}
                name={name}
                value={formData[name]}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #ccc"
                }}
              />
            </div>
          ))}

          {/* ✅ Job Titles as Checkboxes */}
          <div>
            <label style={{ display: "block", marginBottom: 6 }}>Job Title(s)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {jobOptions.map((job) => (
                <label key={job} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    checked={formData.jobTitle.includes(job)}
                    onChange={() => handleJobCheckbox(job)}
                  />
                  {job}
                </label>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <button type="submit" style={{
            backgroundColor: "#1976d2",
            color: "#fff",
            padding: "10px 20px",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}>
            Save Changes
          </button>

          {/* Cancel & Delete Buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                backgroundColor: "#999",
                color: "#fff",
                padding: "10px 20px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleDelete}
              style={{
                backgroundColor: "#d32f2f",
                color: "#fff",
                padding: "10px 20px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Delete Employee
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
