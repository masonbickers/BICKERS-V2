"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig"; // Import Firebase auth and db
import { signOut } from "firebase/auth";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { useEffect } from "react";

export default function HolidayForm() {
  const router = useRouter();
  const [employee, setEmployee] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [holidayReason, setHolidayReason] = useState("");
  const [paidStatus, setPaidStatus] = useState("Paid");


  // Handle form submission and saving to Firestore
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Ensure all fields are filled
    if (!employee || !startDate || !endDate || !holidayReason) {
      alert("Please fill in all fields");
      return;
    }

    try {
      // Create the holiday object to be saved
      const holidayData = {
        employee,
        startDate,
        endDate,
        holidayReason,
        createdAt: new Date(),
      };

      // Save to Firestore
      await addDoc(collection(db, "holidays"), holidayData);
      alert("Holiday request saved successfully!");
      
      // Redirect back to the dashboard
      router.push("/dashboard");
    } catch (err) {
      console.error("Error saving holiday request: ", err);
      alert("Failed to save holiday request. Please try again.");
    }
  };

  // Handle the home button click (logout)
  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  // Handle cancel button click (redirect to dashboard)
  const handleCancel = () => {
    router.push("/dashboard"); // Redirect to dashboard if canceling
  };

  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
        }));
        console.log("Fetched employees:", data); // 👈 add this
        setEmployees(data);
      } catch (error) {
        console.error("Failed to fetch employees:", error);
      }
    };
  
    fetchEmployees();
  }, []);
  
  

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
              <label style={labelStyle}>Holiday Reason</label>
              <textarea
                value={holidayReason}
                onChange={(e) => setHolidayReason(e.target.value)}
                placeholder="Reason for holiday"
                required
                style={inputStyle}
              />
            </div>

            <div style={inputContainerStyle}>
              <label style={labelStyle}>Paid or Unpaid</label>
              <select
                value={paidStatus}
                onChange={(e) => setPaidStatus(e.target.value)}
                required
                style={inputStyle}
              >
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
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

// 🔷 Styles
const mainContainerStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  backgroundColor: "#1e1e1e", // Dark background for the page
  color: "#fff", // White text color
  minHeight: "100vh",
  padding: "40px",
};

const mainContentStyle = {
  maxWidth: "800px",
  width: "100%",
  backgroundColor: "#121212", // Dark content background
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

const logoStyle = {
  width: "180px",
  height: "auto",
};

const backButtonStyle = {
  backgroundColor: "#f44336", // Red back button
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
  backgroundColor: "#222", // Dark card background
  padding: "30px",
  borderRadius: "8px",
  boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
};

const formTitleStyle = {
  fontSize: "24px",
  fontWeight: "bold",
  marginBottom: "20px",
  color: "#fff", // Title in white for contrast
};

const inputContainerStyle = {
  marginBottom: "15px",
};

const labelStyle = {
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "5px",
  display: "block",
  color: "#fff", // Label in white for contrast
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "10px",
  borderRadius: "6px",
  border: "1px solid #444",
  fontSize: "14px",
  backgroundColor: "#333", // Dark background for input fields
  color: "#fff", // White text for input fields
};

const buttonStyle = {
  width: "100%",
  padding: "12px",
  backgroundColor: "#1976d2", // Blue button for submitting
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
  backgroundColor: "#f44336", // Red button for cancelling
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "10px",
};
