"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../firebaseConfig";
import { collection, addDoc } from "firebase/firestore";
import Image from 'next/image';


export default function AddEmployeePage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    dob: "",
    licenceNumber: "",
    jobTitle: ""
  });

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "employees"), formData);
      alert("✅ Employee added");
      router.push("/employees");
    } catch (err) {
      console.error("Error adding employee:", err);
      alert("❌ Failed to add employee");
    }
  };

  const handleCancel = () => {
    router.push("/employees");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#333" }}>


      <main style={{ flex: 1, padding: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>Add Employee</h1>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 500 }}>
          {[
            { label: "Full Name", name: "name", type: "text" },
            { label: "Mobile Number", name: "mobile", type: "tel" },
            { label: "Email", name: "email", type: "email" },
            { label: "Date of Birth", name: "dob", type: "date" },
            { label: "Driving Licence Number", name: "licenceNumber", type: "text" },
            { label: "Job Title", name: "jobTitle", type: "text" }
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

          <button type="submit" style={{
            backgroundColor: "#1976d2",
            color: "#fff",
            padding: "10px 20px",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}>
            Save Employee
          </button>

          <button
            type="button"
            onClick={handleCancel}
            style={{
              marginTop: 10,
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
        </form>
      </main>
    </div>
  );
}
