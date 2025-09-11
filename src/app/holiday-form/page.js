"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { signOut } from "firebase/auth";
import { collection, addDoc, getDocs } from "firebase/firestore";

export default function HolidayForm() {
  const router = useRouter();
  const [employee, setEmployee] = useState("");
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState("");     // yyyy-mm-dd
  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid"); // "Paid" | "Unpaid" | "Accrued"
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
        }));
        setEmployees(data);
      } catch (error) {
        console.error("Failed to fetch employees:", error);
      }
    };
    fetchEmployees();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!employee || !startDate || !endDate || !holidayReason) {
      alert("Please fill in all fields");
      return;
    }
    // simple date sanity
    const s = new Date(startDate);
    const eDate = new Date(endDate);
    if (isNaN(+s) || isNaN(+eDate) || s > eDate) {
      alert("End date must be the same or after start date.");
      return;
    }

    // Normalized flags so your reporting can detect unpaid / accrued
    const isUnpaid = paidStatus === "Unpaid";
    const isAccrued = paidStatus === "Accrued";
    const paid = paidStatus === "Paid"; // convenience

    // (Optional) a string field many dashboards look for
    const leaveType = paidStatus; // e.g. "Unpaid" (your analyzer checks strings for 'unpaid')

    try {
      const holidayData = {
        employee,
        startDate,   // keep ISO string; your reports do new Date(str)
        endDate,     // keep ISO string
        holidayReason,
        paidStatus,  // "Paid" | "Unpaid" | "Accrued"
        isUnpaid,    // boolean for your unpaid counter
        isAccrued,   // boolean if it's an accrued (TOIL) day off
        paid,        // boolean convenience
        leaveType,   // mirrors paidStatus
        createdAt: new Date(),
        status: "approved",   // 👈 force auto-approve on web

      };

      await addDoc(collection(db, "holidays"), holidayData);
      alert("Holiday request saved successfully!");
      router.push("/dashboard");
    } catch (err) {
      console.error("Error saving holiday request: ", err);
      alert("Failed to save holiday request. Please try again.");
    }
  };

  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  const handleCancel = () => {
    router.push("/dashboard");
  };

  return (
    <div style={mainContainerStyle}>
      <main style={mainContentStyle}>
        <div style={headerStyle}>
          <button onClick={handleHome} style={backButtonStyle}>Back</button>
        </div>

        <h1 style={pageTitleStyle}>Holiday Booking</h1>

        <div style={formContainerStyle}>
          <h2 style={formTitleStyle}>Book Employee Holiday</h2>
          <form onSubmit={handleSubmit}>
            {/* Employee Dropdown */}
            <div style={inputContainerStyle}>
              <label style={labelStyle}>Employee Name</label>
              <select
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                required
                style={inputStyle}
              >
                <option value="" disabled>Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                style={inputStyle}
              />
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                style={inputStyle}
              />
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Reason</label>
              <textarea
                value={holidayReason}
                onChange={(e) => setHolidayReason(e.target.value)}
                placeholder="Reason for holiday"
                required
                style={inputStyle}
              />
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Leave Type</label>
              <select
                value={paidStatus}
                onChange={(e) => setPaidStatus(e.target.value)}
                required
                style={inputStyle}
              >
                <option value="Paid">Paid holiday</option>
                <option value="Unpaid">Unpaid holiday</option>
                <option value="Accrued">Accrued day (TOIL)</option>
              </select>
            </div>

            <button type="submit" style={buttonStyle}>Submit Holiday</button>
            <button type="button" onClick={handleCancel} style={cancelButtonStyle}>Cancel</button>
          </form>
        </div>
      </main>
    </div>
  );
}

/* 🔷 Styles (unchanged) */
const mainContainerStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  backgroundColor: "#1e1e1e",
  color: "#fff",
  minHeight: "100vh",
  padding: "40px",
};
const mainContentStyle = {
  maxWidth: "800px",
  width: "100%",
  backgroundColor: "#121212",
  padding: "20px",
  borderRadius: "10px",
  boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
};
const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};
const backButtonStyle = {
  backgroundColor: "#f44336",
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  fontSize: "14px",
  cursor: "pointer",
  borderRadius: "6px",
};
const pageTitleStyle = {
  fontSize: "32px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "20px",
};
const formContainerStyle = {
  backgroundColor: "#222",
  padding: "30px",
  borderRadius: "8px",
  boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
};
const formTitleStyle = {
  fontSize: "24px",
  fontWeight: "bold",
  marginBottom: "20px",
  color: "#fff",
};
const inputContainerStyle = { marginBottom: "15px" };
const labelStyle = {
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "5px",
  display: "block",
  color: "#fff",
};
const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "10px",
  borderRadius: "6px",
  border: "1px solid #444",
  fontSize: "14px",
  backgroundColor: "#333",
  color: "#fff",
};
const buttonStyle = {
  width: "100%",
  padding: "12px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "20px",
};
const cancelButtonStyle = {
  width: "100%",
  padding: "12px",
  backgroundColor: "#f44336",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "10px",
};
