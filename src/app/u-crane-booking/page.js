"use client";

import { useState, useEffect } from "react";
import { db } from "../../../firebaseConfig";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DatePicker from "react-multi-date-picker";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../../firebaseConfig"; // ✅ use this
import { auth } from "../../../firebaseConfig";




export default function CreateBookingPage() {
  const router = useRouter();
  const [equipment, setEquipment] = useState([]);



  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employees, setEmployees] = useState([]);
  const [customEmployee, setCustomEmployee] = useState("");
  const [vehicles, setVehicles] = useState([]);
  const [equipmentGroups, setEquipmentGroups] = useState({
    "A-Frame": [],
    "Trailer": [],
    "Battery": [],
    "Tow Dolly": [],
    "Lorry Trailer": []
  });
  
  const [openEquipmentGroups, setOpenEquipmentGroups] = useState({
    "A-Frame": false,
    "Trailer": false,
    "Battery": false,
    "Tow Dolly": false,
    "Lorry Trailer": false
  });
  

  const [isSecondPencil, setIsSecondPencil] = useState(false);
  const [isCrewed, setIsCrewed] = useState(false);
  const [hasHS, setHasHS] = useState(false);            // Health & Safety
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);  // Risk Assessment
  const [notes, setNotes] = useState("");
  const [quoteFile, setQuoteFile] = useState(null);
  const [quoteURL, setQuoteURL] = useState(null);
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [status, setStatus] = useState("Confirmed");
  const [shootType, setShootType] = useState("Day");
  const [notesByDate, setNotesByDate] = useState({});
  const [freelancers, setFreelancers] = useState([]);
  const [freelancerList, setFreelancerList] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState({
    "Bike": [],
    "Electric Tracking Vehicles": [],  
    "Small Tracking Vehicles": [],
    "Large Tracking Vehicles": [],
    "Low Loaders": [],
    "Transport Lorry": [],
    "Transport Van": []
  });
  const [openGroups, setOpenGroups] = useState({
    "Electric Tracking Vehicles": false,  
    "Small Tracking Vehicles": false,
    "Small Tracking Vehicles": false,
    "Large Tracking Vehicles": false,
    "Low Loaders": false,
    "Transport Lorry": false,
    "Transport Van": false
  });
  
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);

const inputStyle = {
  width: "90%",
  height: "28px",
  marginBottom: "12px",
  padding: "4px 6px",
  fontSize: "14px",
  border: "1px solid #ccc",
  borderRadius: "4px",
};





  const [employeeList, setEmployeeList] = useState([]);
  useEffect(() => {

    
    const loadData = async () => {
      // 🔹 1. Load all bookings
      const bookingSnap = await getDocs(collection(db, "bookings"));
      const bookings = bookingSnap.docs.map(doc => doc.data());
      setAllBookings(bookings);
  
      // 🔹 2. Auto-generate next job number like "0001", "0002"
      const jobNumbers = bookings
        .map(b => b.jobNumber)
        .filter(jn => /^\d+$/.test(jn)) // only pure numeric job numbers
        .map(jn => parseInt(jn, 10));
  
      const max = jobNumbers.length > 0 ? Math.max(...jobNumbers) : 0;
      const nextJobNumber = String(max + 1).padStart(4, "0");
      setJobNumber(nextJobNumber);

      // 🔹 6. Load equipment from Firestore
      const equipmentSnap = await getDocs(collection(db, "equipment"));
      const groupedEquip = {
        "A-Frame": [],
        "Trailer": [],
        "Battery": [],
        "Tow Dolly": [],
        "Lorry Trailer": []
      };
      const openEquip = {
        "A-Frame": false,
        "Trailer": false,
        "Battery": false,
        "Tow Dolly": false,
        "Lorry Trailer": false
      };
      
      equipmentSnap.docs.forEach(doc => {
        const data = doc.data();
        const category = data.category || "Uncategorised";
        const name = data.name || data.label || "Unnamed Equipment";
      
        if (groupedEquip[category]) {
          groupedEquip[category].push(name);
        } else {
          if (!groupedEquip["Uncategorised"]) groupedEquip["Uncategorised"] = [];
          if (!openEquip["Uncategorised"]) openEquip["Uncategorised"] = false;
          groupedEquip["Uncategorised"].push(name);
        }
      });
      
      setEquipmentGroups(groupedEquip);
      setOpenEquipmentGroups(openEquip);
      

  
      // 🔹 3. Load holidays
      const holidaySnap = await getDocs(collection(db, "holidays"));
      setHolidayBookings(holidaySnap.docs.map(doc => doc.data()));
  
      // 🔹 4. Load employee and freelancer list
      const empSnap = await getDocs(collection(db, "employees"));
      const allEmployees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
setEmployeeList(allEmployees);

  
setFreelancerList(
  allEmployees
    .filter(emp => {
      if (!emp.jobTitle) return false;

      if (Array.isArray(emp.jobTitle)) {
        return emp.jobTitle.some(
          jt => jt.toLowerCase().trim() === "freelancer"
        );
      }

      if (typeof emp.jobTitle === "string") {
        return emp.jobTitle.toLowerCase().trim() === "freelancer";
      }

      return false;
    })
    .map(emp => emp.name || emp.fullName || emp.id)
);


      const workSnap = await getDocs(collection(db, "workBookings"));
const maintenanceData = workSnap.docs.map(doc => doc.data());
setMaintenanceBookings(maintenanceData);



// 🔹 5. Load and group vehicles
const vehicleSnap = await getDocs(collection(db, "vehicles"));
const grouped = {
  "U-Crane": [],
  "Transport Lorry": []
};


vehicleSnap.docs.forEach(doc => {
  const data = doc.data();
  console.log("🚗 Vehicle fetched:", data); // ✅ log raw data
  const category = (data.category || "").trim().toLowerCase();
  const vehicle = {
    name: data.name,
    registration: data.registration || "",
  };

  if (category.includes("u-crane")) grouped["U-Crane"].push(vehicle);
else if (category.includes("lorry") && !category.includes("trailer")) {
  // only include vehicles whose name starts with "U-Crane Lorry"
  if (vehicle.name && vehicle.name.toLowerCase().startsWith("u-crane lorry")) {
    grouped["Transport Lorry"].push(vehicle);
  }
}

});

console.log("✅ Grouped vehicles:", grouped);
setVehicleGroups(grouped);

    };
  
    // ✅ Call async loader
    loadData();
  }, []);

  
  
  

  

  const isEmployeeOnHoliday = (employeeName) => {
    const selectedStart = new Date(startDate);
    const selectedEnd = isRange ? new Date(endDate) : selectedStart;

    

    return holidayBookings.some(h => {
      if (h.employee !== employeeName) return false;
      const holidayStart = new Date(h.startDate);
      const holidayEnd = new Date(h.endDate);

      return (
        (selectedStart >= holidayStart && selectedStart <= holidayEnd) ||
        (selectedEnd >= holidayStart && selectedEnd <= holidayEnd) ||
        (selectedStart <= holidayStart && selectedEnd >= holidayEnd)
      );
    });
  };

  const selectedDates = (() => {
    if (!startDate) return [];
    const dates = [];
    const start = new Date(startDate);
    const end = isRange && endDate ? new Date(endDate) : start;
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  })();
  
  const bookedVehicles = allBookings
    .filter(b => {
      const bookingDates = b.bookingDates || [];
      return bookingDates.some(date => selectedDates.includes(date));
    })
    .flatMap(b => b.vehicles || []);

    const bookedEquipment = allBookings
  .filter(b => {
    const bookingDates = b.bookingDates || [];
    return bookingDates.some(date => selectedDates.includes(date));
  })
  .flatMap(b => b.equipment || []);

  
  const bookedEmployees = allBookings
    .filter(b => {
      const dateToCheck = startDate;
      const bDate = b.date?.slice(0, 10);
      const bStart = b.startDate?.slice(0, 10);
      const bEnd = b.endDate?.slice(0, 10);
      if (!dateToCheck) return false;
      return (
        (bDate && bDate === dateToCheck) ||
        (bStart && bEnd && dateToCheck >= bStart && dateToCheck <= bEnd)
      );
    })
    .flatMap(b => b.employees || []);

    const maintenanceBookedVehicles = maintenanceBookings
  .filter(b => {
    const start = new Date(b.startDate);
    const end = new Date(b.endDate || b.startDate);
    return selectedDates.some(dateStr => {
      const d = new Date(dateStr);
      return d >= start && d <= end;
    });
  })
  .map(b => b.vehicleName); 

  const handleSubmit = async (status = "Confirmed") => {
if (status !== "Enquiry") {
  if (!startDate) return alert("Please select a start date.");
  if (isRange && !endDate) return alert("Please select an end date.");
}


    const isDuplicateJobNumber = allBookings.some(
      (b) => b.jobNumber?.trim().toLowerCase() === jobNumber.trim().toLowerCase()
    );

const customNames = customEmployee
  ? customEmployee.split(",").map(name => name.trim())
  : [];

const cleanedEmployees = employees
  .filter(e => e.name !== "Other")
  .map(e => e.name)   // ✅ ensure array of strings
  .concat(customNames);

for (const employee of cleanedEmployees) {
  if (isEmployeeOnHoliday(employee)) {
    alert(`${employee} is on holiday during the selected dates.`);
    return;
  }
}


let bookingDates = [];
if (status !== "Enquiry") {
  if (isRange && startDate && endDate) {
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      bookingDates.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }
  } else if (startDate) {
    bookingDates = [new Date(startDate).toISOString().split("T")[0]];
  }
}


// ✅ Upload Excel Quote (resumable, with metadata)
// ✅ Upload Excel/CSV Quote
let quoteUrlToSave = null;

if (quoteFile) {
  try {
    console.log("📂 Uploading file:", quoteFile);

    // Create storage reference
    const storageRef = ref(storage, `quotes/${jobNumber}_${quoteFile.name}`);

    // ✅ Ensure correct metadata for Excel/CSV
    const metadata = {
      contentType:
        quoteFile.type ||
        (quoteFile.name.endsWith(".csv")
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    };

    // 🔹 Resumable upload
    const uploadTask = uploadBytesResumable(storageRef, quoteFile, metadata);

    // Wait until upload completes
    await new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`⏳ Upload is ${progress.toFixed(0)}% done`);
        },
        (error) => {
          console.error("❌ Upload failed:", error);
          reject(error);
        },
        async () => {
          // Success — get file URL
          quoteUrlToSave = await getDownloadURL(uploadTask.snapshot.ref);
          setQuoteURL(quoteUrlToSave);
          console.log("✅ Upload successful, URL:", quoteUrlToSave);
          resolve();
        }
      );
    });
  } catch (error) {
    alert("Failed to upload Excel/CSV: " + error.message);
    return;
  }
} else {
  quoteUrlToSave = null; // no file attached
}





// ✅ Step: Now define the booking object
// ✅ Step: Now define the booking object with user + timestamps
const user = auth.currentUser;

const booking = {
  jobNumber,
  client,
  contactNumber,
  contactEmail,
  location,
  employees: cleanedEmployees,
  vehicles,
  equipment,
  isSecondPencil,
  isCrewed, 
  notes,
  notesByDate,
  status,
  bookingDates,
  shootType,
  hasHS,
  hasRiskAssessment,



quoteUrl: quoteUrlToSave,

...(status !== "Enquiry"
  ? (isRange
      ? { startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString() }
      : { date: new Date(startDate).toISOString() })
  : {}), // ✅ enquiry has no dates


  // 🔹 new fields
  createdBy: user?.email || "Unknown",
  lastEditedBy: user?.email || "Unknown",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),

  // 🔹 NEW audit trail
  history: [
    {
      action: "Created",
      user: user?.email || "Unknown",
      timestamp: new Date().toISOString(),
    },
  ],
};

    try {
      await addDoc(collection(db, "bookings"), booking);
      alert("Booking Saved ✅");
      router.push("/dashboard?saved=true");
    } catch (err) {
      console.error("❌ Error saving booking:", err);
      alert("Failed to save booking ❌\n\n" + err.message);
    }
  };

  return (
    <HeaderSidebarLayout>
    <div
  style={{
    display: "flex",
    minHeight: "100vh",
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#f4f4f5",
  }}
>



      {/* ── Main Container (your original content) */}
      <div
  style={{
    flex: 1,
    padding: "20px 40px",
    color: "#333",
   // 👈 pushes it right of the sidebar
  }}
>


<h1 style={{ color: "#111", marginBottom: "20px" }}>➕ Create New Booking</h1>

  
<form
  onSubmit={(e) => {
    e.preventDefault();
    handleSubmit(status);
  }}
>
  <div
    style={{
      display: "flex",
      gap: "40px", // space between columns
      flexWrap: "wrap",
      alignItems: "flex-start",
      marginTop: "20px",
      backgroundColor: "#f9f9f9",
      padding: "30px",
      borderRadius: "10px",
      boxShadow: "0 3px 10px rgba(0, 0, 0, 0.08)",
      fontSize: "14px",
      lineHeight: "1.6",
    }}
  >
{/* Column 1: Job Info */}
<div style={{ flex: "1 1 300px", minWidth: "280px" }}>
  {/* Job Number */}
  <h3 style={{ marginBottom: "6px" }}>Job Number</h3>
  <input
    value={jobNumber}
    onChange={(e) => setJobNumber(e.target.value)}
    required
    style={{
      width: "90%",
      height: "28px",
      marginBottom: "12px",
      padding: "4px 6px",
      fontSize: "14px",
    }}
  />

  {/* Status Dropdown */}
  <h3 style={{ marginBottom: "6px" }}>Status</h3>
  <select
    value={status}
    onChange={(e) => setStatus(e.target.value)}
    style={{
      width: "90%",
      height: "28px",
      marginBottom: "12px",
      padding: "4px 6px",
      fontSize: "14px",
    }}
  >
    <option value="Confirmed">Confirmed</option>
    <option value="First Pencil">First Pencil</option>
    <option value="Second Pencil">Second Pencil</option>
    <option value="Enquiry">Enquiry</option>
  </select>

  {/* Shoot Type Dropdown */}
  <h3 style={{ marginBottom: "6px" }}>Shoot Type</h3>
  <select
    value={shootType}
    onChange={(e) => setShootType(e.target.value)}
    style={{
      width: "90%",
      height: "28px",
      marginBottom: "12px",
      padding: "4px 6px",
      fontSize: "14px",
    }}
  >
    <option value="Day">Day</option>
    <option value="Night">Night</option>
  </select>

  {/* Production Company */}
  <h3 style={{ marginBottom: "6px" }}>Production Company</h3>
  <input
    value={client}
    onChange={(e) => setClient(e.target.value)}
    required
    style={{
      width: "90%",
      height: "28px",
      marginBottom: "12px",
      padding: "4px 6px",
      fontSize: "14px",
    }}
  />



  {/* Contact Email */}
  <h3 style={{ marginBottom: "6px" }}>Contact Email</h3>
  <input
    type="email"
    value={contactEmail}
    onChange={(e) => setContactEmail(e.target.value)}
    required
    style={{
      width: "90%",
      height: "28px",
      marginBottom: "12px",
      padding: "4px 6px",
      fontSize: "14px",
    }}
  />

  {/* Contact Number */}
  <h3 style={{ marginBottom: "6px" }}>Contact Number</h3>
  <input
    type="text"
    value={contactNumber}
    onChange={(e) => setContactNumber(e.target.value)}
    required
    style={{
      width: "90%",
      height: "28px",
      marginBottom: "12px",
      padding: "4px 6px",
      fontSize: "14px",
    }}
  />

  {/* Location */}
  <h3 style={{ marginBottom: "6px" }}>Location</h3>
  <textarea
    value={location}
    onChange={(e) => setLocation(e.target.value)}
    rows={2}
    required
    style={{
      width: "90%",
      minHeight: "40px", // slightly taller than inputs
      marginBottom: "12px",
      padding: "4px 6px",
      fontSize: "14px",
      resize: "vertical",
    }}
  />
</div>


{/* Column 2: Dates + Crew */}
<div style={{ flex: "1 1 300px", minWidth: "280px" }}>
  <h3>Dates</h3>
  <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
    <input
      type="checkbox"
      checked={isRange}
      onChange={() => setIsRange(!isRange)}
    />
    Multi-day
  </label>

  <input
    type="date"
    value={startDate}
    onChange={(e) => setStartDate(e.target.value)}
    required
    style={inputStyle}
  />
  {isRange && (
    <input
      type="date"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
      required
      style={inputStyle}
    />
  )}

  {/* Crew Roles */}
  <h3 style={{ marginTop: "10px" }}>Crew</h3>
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr", // ✅ 2 columns
      gap: "20px",
    }}
  >
    {[
      { role: "Precision Driver", key: "u-crane driver" },
      { role: "Arm Operator", key: "arm operator" },
      { role: "Arm & Head Tech", key: "Head and Arm Tech" },
       { role: "Transport Driver", key: "transport driver" },
           { role: "Camera Operator", key: "camera operator" }, // ✅ new

    ].map(({ role, key }) => (
      <div key={role} style={{ marginBottom: "1px" }}>
        <h4 style={{ marginBottom: "6px" }}>{role}</h4>
        {employeeList
          .filter(
            (emp) =>
              Array.isArray(emp.jobTitle) &&
              emp.jobTitle.some(
                (jt) => jt.toLowerCase().trim() === key.toLowerCase().trim()
              )
          )
          .map((emp) => {
            const isBooked = bookedEmployees.includes(emp.name);
            const isHoliday = isEmployeeOnHoliday(emp.name);
            const disabled = isBooked || isHoliday;

            return (
              <label
                key={emp.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "6px",
                  fontSize: "16px",
                }}
              >
                <input
                  type="checkbox"
                  value={emp.name}
                  disabled={disabled}
                  checked={employees.some(
                    (e) => e.name === emp.name && e.role === role
                  )}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setEmployees([...employees, { role, name: emp.name }]);
                    } else {
                      setEmployees(
                        employees.filter(
                          (sel) =>
                            !(sel.name === emp.name && sel.role === role)
                        )
                      );
                    }
                  }}
                />
                <span style={{ color: disabled ? "grey" : "#333" }}>
                  {emp.name} {isBooked && "(Booked)"}{" "}
                  {isHoliday && "(On Holiday)"}
                </span>
              </label>
            );
          })}
      </div>
    ))}
  </div>
</div>


    {/* Column 3: Vehicles */}
    <div style={{ flex: "1 1 300px", minWidth: "280px" }}>
      <h3>Vehicles</h3>
      {["U-Crane", "Transport Lorry"].map((group) => (
        <div key={group} style={{ marginBottom: "15px" }}>
          <h4 style={{ marginBottom: "6px" }}>{group}</h4>
          {vehicleGroups[group]?.length > 0 ? (
            vehicleGroups[group].map((vehicle) => (
              <label
                key={vehicle.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "6px",
                }}
              >
                <input
                  type="checkbox"
                  value={vehicle.name}
                  checked={vehicles.includes(vehicle.name)}
                  onChange={(e) =>
                    setVehicles(
                      e.target.checked
                        ? [...vehicles, vehicle.name]
                        : vehicles.filter((v) => v !== vehicle.name)
                    )
                  }
                />
                <span>
                  {vehicle.name}{" "}
                  {vehicle.registration && `– ${vehicle.registration}`}
                </span>
              </label>
            ))
          ) : (
            <p style={{ fontSize: "12px", color: "#666" }}>
              No vehicles in this category
            </p>
          )}
        </div>
      ))}
    </div>
  </div>

  {/* Notes */}
  <div style={{ marginTop: 20 }}>
    <h3>Notes</h3>
    <textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      rows={4}
      style={{
        width: "100%",
        padding: "8px",
        fontSize: "16px",
        border: "1px solid #ccc",
        borderRadius: "4px",
      }}
      placeholder="Anything extra to include..."
    />
  </div>

  {/* Safety + Legal */}
  <div style={{ marginTop: 20 }}>
    <label>
      <input
        type="checkbox"
        checked={hasHS}
        onChange={(e) => setHasHS(e.target.checked)}
      />{" "}
      Health & Safety Completed
    </label>
    <br />
    <label>
      <input
        type="checkbox"
        checked={hasRiskAssessment}
        onChange={(e) => setHasRiskAssessment(e.target.checked)}
      />{" "}
      Risk Assessment Completed
    </label>
    <br />
    <label>
      <input type="checkbox" /> Terms & Conditions Accepted
    </label>
    <br />
    <label>
      <input type="checkbox" /> Insurance Verified
    </label>
  </div>

  {/* Actions */}
  <div style={{ marginTop: 30, display: "flex", gap: 10 }}>
    <button type="submit" style={buttonStyle}>
      Save U-Crane Booking
    </button>
    <button
      type="button"
      onClick={() => router.push("/dashboard")}
      style={{ ...buttonStyle, backgroundColor: "#ccc", color: "#000" }}
    >
      Cancel
    </button>
  </div>
</form>




<div style={{ marginTop: 40, padding: 20, backgroundColor: "#e0f7fa", borderRadius: 8 }}>
  <h2 style={{ marginBottom: 10 }}>Booking Summary</h2>

  <p><strong>Job Number:</strong> {jobNumber}</p>
  <p><strong>Status:</strong> {status}</p>
  <p><strong>Shoot Type:</strong> {shootType}</p>
  <p><strong>Client:</strong> {client}</p>
  <p><strong>Contact Email:</strong> {contactEmail}</p>
  <p><strong>Contact Number:</strong> {contactNumber}</p>
  <p><strong>Location:</strong> {location}</p>
  <p><strong>Health & Safety:</strong> {hasHS ? "✅ Completed" : "❌ Not Done"}</p>
  <p><strong>Risk Assessment:</strong> {hasRiskAssessment ? "✅ Completed" : "❌ Not Done"}</p>

  <p>
    <strong>Dates:</strong>{" "}
    {isRange
      ? `${startDate || "N/A"} → ${endDate || "N/A"}`
      : startDate || "N/A"}
  </p>

<p>
  <strong>Employees:</strong>{" "}
  {[
    ...employees.map(e => {
      if (typeof e === "string") return e; // plain string
      if (e && typeof e === "object") return `${e.role || "Role"} – ${e.name || "Unknown"}`;
      return "Unknown";
    }),
    ...(customEmployee ? customEmployee.split(",").map(n => n.trim()) : [])
  ].join(", ") || "None selected"}
</p>


  <p><strong>Vehicles:</strong> {vehicles.join(", ") || "None selected"}</p>

  <p><strong>Equipment:</strong> {equipment.join(", ") || "None selected"}</p>

  <p><strong>Notes:</strong> {notes || "None added"}</p>

{quoteURL && (
  <p>
    <strong>Attached Quote:</strong>{" "}
    <a href={quoteURL} target="_blank" rel="noopener noreferrer">
      Download Excel
    </a>
  </p>
)}

</div>


      </div>
    </div>
    </HeaderSidebarLayout>
  );
}

const buttonStyle = {
  marginRight: "10px",
  marginTop: "10px",
  padding: "8px 12px",
  backgroundColor: "#4caf50",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};


const navButton = {
  background: "transparent",
  border: "none",
  color: "#fff",
  fontSize: "16px",
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid #333",
};
