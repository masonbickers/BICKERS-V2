"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../firebaseConfig";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

export default function EditHolidayPage() {
  const router = useRouter();
  const params = useParams();
  const holidayId = params.id;
  

  const [employee, setEmployee] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const fetchHoliday = async () => {
      if (!holidayId) return;
      const docRef = doc(db, "holidays", holidayId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setEmployee(data.employee);
        setStartDate(data.startDate);
        setEndDate(data.endDate);
        setHolidayReason(data.holidayReason);
        setPaidStatus(data.paidStatus || "Paid");
      }
    };

    const fetchEmployees = async () => {
      const snapshot = await getDocs(collection(db, "employees"));
      const employeeData = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setEmployees(employeeData);
    };

    fetchHoliday();
    fetchEmployees();
  }, [holidayId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employee || !startDate || !endDate || !holidayReason) {
      alert("Please fill in all fields");
      return;
    }

    try {
      const docRef = doc(db, "holidays", holidayId);
      await updateDoc(docRef, {
        employee,
        startDate,
        endDate,
        holidayReason,
        paidStatus
      });
      alert("Holiday updated successfully!");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error updating holiday: ", error);
      alert("Failed to update holiday.");
    }
  };

  const handleCancel = () => router.push("/dashboard");
  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  const handleDelete = async () => {
    if (!holidayId) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this holiday?");
    if (!confirmDelete) return;
  
    try {
      await deleteDoc(doc(db, "holidays", holidayId));
      alert("Holiday deleted.");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting holiday: ", error);
      alert("Failed to delete holiday.");
    }
  };
  

  return (
    <div style={mainContainerStyle}>
      <main style={mainContentStyle}>
        <div style={headerStyle}>
<button onClick={() => router.back()} style={backButtonStyle}>
  ← Back
</button>

        </div>

        <h1 style={pageTitleStyle}>Edit Holiday</h1>

        <div style={formContainerStyle}>
          <h2 style={formTitleStyle}>Update Holiday Info</h2>
          <form onSubmit={handleSubmit}>
            <div style={inputContainerStyle}>
              <label style={labelStyle}>Employee Name</label>
              <select value={employee} onChange={(e) => setEmployee(e.target.value)} required style={inputStyle}>
                <option value="" disabled>Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={inputStyle} />
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required style={inputStyle} />
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Holiday Reason</label>
              <textarea value={holidayReason} onChange={(e) => setHolidayReason(e.target.value)} required style={inputStyle} />
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Paid or Unpaid</label>
              <select value={paidStatus} onChange={(e) => setPaidStatus(e.target.value)} required style={inputStyle}>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>

            <button type="submit" style={buttonStyle}>Update Holiday</button>

            <button type="button" onClick={handleDelete} style={{...cancelButtonStyle, backgroundColor: "#888", // Optional: grey styling for delete 
            marginTop: "10px"
  }}
>
  Delete Holiday
</button>

          </form>
        </div>
      </main>
    </div>
  );
}

// Style definitions match original HolidayForm styles
const mainContainerStyle = { display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: "#1e1e1e", color: "#fff", minHeight: "100vh", padding: "40px" };
const mainContentStyle = { maxWidth: "800px", width: "100%", backgroundColor: "#121212", padding: "20px", borderRadius: "10px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" };
const logoStyle = { width: "180px", height: "auto" };
const backButtonStyle = { backgroundColor: "#f44336", color: "#fff", border: "none", padding: "8px 16px", fontSize: "14px", cursor: "pointer", borderRadius: "6px" };
const pageTitleStyle = { fontSize: "32px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" };
const formContainerStyle = { backgroundColor: "#222", padding: "30px", borderRadius: "8px", boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)" };
const formTitleStyle = { fontSize: "24px", fontWeight: "bold", marginBottom: "20px", color: "#fff" };
const inputContainerStyle = { marginBottom: "15px" };
const labelStyle = { fontSize: "14px", fontWeight: "600", marginBottom: "5px", display: "block", color: "#fff" };
const inputStyle = { width: "100%", padding: "12px", marginBottom: "10px", borderRadius: "6px", border: "1px solid #444", fontSize: "14px", backgroundColor: "#333", color: "#fff" };
const buttonStyle = { width: "100%", padding: "12px", backgroundColor: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "20px" };
const cancelButtonStyle = { width: "100%", padding: "12px", backgroundColor: "#f44336", color: "#fff", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" };
