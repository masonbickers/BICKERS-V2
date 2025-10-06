"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../firebaseConfig";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs, addDoc } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth } from "../../../../firebaseConfig";





export default function CreateBookingPage() {
  const router = useRouter();
  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);
  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employees, setEmployees] = useState([]);
  const [customEmployee, setCustomEmployee] = useState("");
  const [vehicles, setVehicles] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [isSecondPencil, setIsSecondPencil] = useState(false)
  const [isCrewed, setIsCrewed] = useState(false); 
  const [notes, setNotes] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [status, setStatus] = useState("Confirmed");
  const [shootType, setShootType] = useState("Day");
  const [notesByDate, setNotesByDate] = useState({});
  const [freelancers, setFreelancers] = useState([]);
  const [freelancerList, setFreelancerList] = useState([]);
  const [vehicleGroups, setVehicleGroups] = useState({
    "Small Tracking Vehicles": [],
    "Large Tracking Vehicles": [],
    "Low Loaders": [],
    "Transport Lorry": [],
    "Transport Van": [],
    "Other Vehicles": [] 
  });
  const [equipmentGroups, setEquipmentGroups] = useState({});
const [openEquipGroups, setOpenEquipGroups] = useState({});

  
  const [openGroups, setOpenGroups] = useState({
    "Small Tracking Vehicles": false,
    "Large Tracking Vehicles": false,
    "Low Loaders": false,
    "Transport Lorry": false,
    "Transport Van": false,
      "Other Vehicles": false
  });
  
  const params = useParams();
  const bookingId = params.id;
  const [contact, setContact] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  
  // NEW: status reason state
const [statusReasons, setStatusReasons] = useState([]);
const [statusReasonOther, setStatusReasonOther] = useState("");



  const [employeeList, setEmployeeList] = useState([]);
  useEffect(() => {
    const loadData = async () => {
      // ✅ Fetch bookings, holidays, employees, and vehicles
const [bookingSnap, holidaySnap, empSnap, vehicleSnap, equipSnap] = await Promise.all([
        getDocs(collection(db, "bookings")),
        getDocs(collection(db, "holidays")),
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "vehicles")),
        getDocs(collection(db, "equipment")), // ✅ NEW
      ]);
  
      const bookings = bookingSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAllBookings(bookings);
  
      // Load holidays
      setHolidayBookings(holidaySnap.docs.map(doc => doc.data()));
  
      // Load employee/freelancer list
      const allEmployees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
setEmployeeList(
  allEmployees
    .filter(emp =>
      Array.isArray(emp.jobTitle)
        ? emp.jobTitle.some(j => j.toLowerCase() === "driver")
        : (emp.jobTitle || "").toLowerCase() === "driver"
    )
    .map(emp => ({
      id: emp.id,
      name: emp.name || emp.fullName || emp.id,
      jobTitle: emp.jobTitle
    }))
);

setFreelancerList(
  allEmployees
    .filter(emp => {
      const titles = Array.isArray(emp.jobTitle)
        ? emp.jobTitle.map(j => j.toLowerCase())
        : [(emp.jobTitle || "").toLowerCase()];
      return titles.includes("freelancer") || titles.includes("freelance");
    })
    .map(emp => ({
      id: emp.id,
      name: emp.name || emp.fullName || emp.id,
      jobTitle: emp.jobTitle
    }))
);


  
      // Group vehicles
      const grouped = {
        "Bike": [],
        "Electric Tracking Vehicles": [],
        "Small Tracking Vehicles": [],
        "Large Tracking Vehicles": [],
        "Low Loaders": [],
        "Transport Lorry": [],
        "Transport Van": [],
          "Other Vehicles": []  
      };

      vehicleSnap.docs.forEach(doc => {
        const data = doc.data();
        const category = (data.category || "").trim().toLowerCase();
        const name = data.name?.trim();
        const registration = data.registration?.trim();
      
        if (!name) return;
      
        const vehicleInfo = { name, registration };
      
        if (category.includes("bike")) grouped["Bike"].push(vehicleInfo);
        else if (category.includes("electric")) grouped["Electric Tracking Vehicles"].push(vehicleInfo);
        else if (category.includes("small")) grouped["Small Tracking Vehicles"].push(vehicleInfo);
        else if (category.includes("large")) grouped["Large Tracking Vehicles"].push(vehicleInfo);
        else if (category.includes("low loader")) grouped["Low Loaders"].push(vehicleInfo);
        else if (category.includes("lorry")) grouped["Transport Lorry"].push(vehicleInfo);
        else if (category.includes("van")) grouped["Transport Van"].push(vehicleInfo);
          else grouped["Other Vehicles"].push(vehicleInfo);   // ✅ catch-all

      });
      
      
      setVehicleGroups(grouped);
  
      // ✅ If editing, load the booking by ID and prefill form
      if (bookingId) {
        console.log("🔍 Loading booking for ID:", bookingId);

          const ref = doc(db, "bookings", bookingId);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            console.error("❌ No booking found for ID:", bookingId);
          } else {
            console.log("✅ Booking found:", snap.data());
          }

        if (snap.exists()) {
          const b = snap.data();
          setJobNumber(b.jobNumber || "");
          setClient(b.client || "");
          setContactEmail(b.contactEmail || "");
          setContactNumber(b.contactNumber || "");
          setLocation(b.location || "");
          setIsRange(!!b.startDate && !!b.endDate);
          setStartDate((b.startDate || b.date || "").slice(0, 10));
          setEndDate((b.endDate || "").slice(0, 10));
          setStatusReasons(b.statusReasons || []);
setStatusReasonOther(b.statusReasonOther || "");

          // normalise employees: supports old string data + new object format
setEmployees(
  (b.employees || []).map(e =>
    typeof e === "string" ? { role: "Precision Driver", name: e } : e
  )
);

// vehicles stay as string names
setVehicles(b.vehicles || []);

          setEquipment(b.equipment || []);
          setIsSecondPencil(b.isSecondPencil || false);
          setNotes(b.notes || "");
          setNotesByDate(b.notesByDate || {});
          setStatus(b.status || "Confirmed");
          setShootType(b.shootType || "Day");
          setIsCrewed(b.isCrewed || false);
          setHasHS(b.hasHS || false);
          setHasRiskAssessment(b.hasRiskAssessment || false);

        }
      }
      const groupedEquip = {};
    equipSnap.docs.forEach(doc => {
      const data = doc.data();
      const category = (data.category || "Other").trim();
      const name = data.name?.trim();
      if (!name) return;
      if (!groupedEquip[category]) groupedEquip[category] = [];
      groupedEquip[category].push(name);
    });

    setEquipmentGroups(groupedEquip);

    // ✅ Set initial open state for each category
    const openEquip = {};
    Object.keys(groupedEquip).forEach(cat => {
      openEquip[cat] = false;
    });
    setOpenEquipGroups(openEquip);
  };
  
    
  
    loadData();
  }, [bookingId]);
  

  

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

  const bookedVehicles = allBookings
  .filter(b => {
if (bookingId && b.id === bookingId) return false; // exclude by document id

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
  .flatMap(b => b.vehicles || []);

const bookedEmployees = allBookings
  .filter(b => {
if (bookingId && b.id === bookingId) return false; // exclude by document id

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
  .flatMap(b => b.employees || [])
  .map(e => (typeof e === "string" ? e : e.name));


const handleSubmit = async () => {
  console.log("📋 Submitting booking for ID:", bookingId);

  if (status !== "Enquiry") {
    if (!startDate) return alert("Please select a start date.");
    if (isRange && !endDate) return alert("Please select an end date.");
  }

  // ✅ NEW: reason validation goes here
  const needsReason = ["Lost", "Postponed", "Cancelled"].includes(status);
  if (needsReason) {
    if (!statusReasons.length) return alert("Please choose at least one reason.");
    if (statusReasons.includes("Other") && !statusReasonOther.trim()) {
      return alert("Please enter the 'Other' reason.");
    }
  }




    

const customNames = customEmployee
  ? customEmployee.split(",").map(name => name.trim()).filter(Boolean)
  : [];

const cleanedEmployees = [
  ...employees.filter(e => e.name !== "Other"),
  ...customNames.map(n => ({ role: "Precision Driver", name: n })),
];


for (const employee of cleanedEmployees) {
  if (isEmployeeOnHoliday(employee.name)) {
    alert(`${employee.name} is on holiday during the selected dates.`);
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

    
    let pdfURL = null;
    if (pdfFile) {
      const storage = getStorage();
      const storageRef = ref(storage, `booking_pdfs/${Date.now()}_${pdfFile.name}`);
      const snapshot = await uploadBytes(storageRef, pdfFile);
      pdfURL = await getDownloadURL(snapshot.ref);
    }
    
// Clean up notesByDate to only include currently selected dates
const filteredNotesByDate = {};
bookingDates.forEach(date => {
  filteredNotesByDate[date] = notesByDate[date] || "";
});

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
  hasHS,
  hasRiskAssessment,
  notes,
  notesByDate: filteredNotesByDate,
  status,
  bookingDates,
  shootType,
  pdfURL: pdfURL || null,

  // Save reasons only when applicable
  ...(["Lost", "Postponed", "Cancelled"].includes(status) && {
    statusReasons,
    statusReasonOther: statusReasons.includes("Other") ? statusReasonOther.trim() : "",
  }),

  ...(status !== "Enquiry"
    ? (isRange
        ? {
            startDate: new Date(startDate).toISOString(),
            endDate: new Date(endDate).toISOString(),
            date: null
          }
        : {
            date: new Date(startDate).toISOString(),
            startDate: null,
            endDate: null
          })
    : {}),

  lastEditedBy: user?.email || "Unknown",
  updatedAt: new Date().toISOString(),
};



    try {
      if (bookingId) {
        console.log("📦 Updating booking with ID:", bookingId);
        console.log("➡️ Booking data to update:", booking);
      
        const bookingRef = doc(db, "bookings", bookingId);

        console.log("➡️ Booking data to update:", booking);
        try {
          await updateDoc(bookingRef, booking);
          console.log("🔥 UpdateDoc ran");
          console.log("✅ Booking updated successfully");
        } catch (err) {
          console.error("❌ Firestore update error:", err);
          alert("Update failed: " + err.message);
        }
      }
       else {
        await addDoc(collection(db, "bookings"), booking);
      }
      
alert(bookingId ? "Booking Updated ✅" : "Booking Saved ✅");
router.back();  // ✅ return to previous page instead of forcing dashboard


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
  }}
>


<h1 style={{ color: "#111", marginBottom: "20px" }}>
  {bookingId ? "✏️ Edit Booking" : "➕ Create New Booking"}
</h1>

  

<form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>

<div style={{
  display: "flex",
  gap: "30px",
  alignItems: "flex-start", // ✅ ensures columns align top
  flexWrap: "wrap",
  marginTop: "20px",
  backgroundColor: "#f9f9f9",
  padding: "20px",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)"
}}>

    
    {/* Column 1: Job Info */}
    {/* Column 1: Job Info Section */}
<div style={{ flex: "1 1 300px" }}>
  
  {/* Job Number Field */}
  <h2>Job Number</h2><br />
<input
  value={jobNumber}
  onChange={(e) => setJobNumber(e.target.value)}
  required
  style={{
    width: "100%",
    height: "40px",
    marginBottom: 20,
    padding: "8px",
    fontSize: "16px",
    backgroundColor: bookingId ? "#eee" : "white",
    color: bookingId ? "#666" : "#000",
    cursor: bookingId ? "not-allowed" : "text"
  }}
/>

<br />


  {/* Status Dropdown */}
<h3>Status</h3><br />
<select
  value={status}
  onChange={(e) => {
    const next = e.target.value;
    setStatus(next);

    // Clear reasons if moving away from Lost/Postponed/Cancelled
    if (!["Lost", "Postponed", "Cancelled"].includes(next)) {
      setStatusReasons([]);
      setStatusReasonOther("");
    }
  }}
  style={{
    width: "100%",
    height: "40px",
    marginBottom: 20,
    padding: "8px",
    fontSize: "16px",
  }}
>
  <option value="Confirmed">Confirmed</option>
  <option value="First Pencil">First Pencil</option>
  <option value="Second Pencil">Second Pencil</option>
  <option value="Enquiry">Enquiry</option>
  <option value="DNH">DNH</option>

  {/* NEW */}
  <option value="Lost">Lost</option>
  <option value="Postponed">Postponed</option>
  <option value="Cancelled">Cancelled</option>
</select>

{["Lost","Postponed","Cancelled"].includes(status) && (
  <div
    style={{
      border: "1px solid #ddd",
      borderRadius: 8,
      padding: 12,
      marginTop: -10,
      marginBottom: 20,
      background: "#fafafa",
    }}
  >
    <h4 style={{ margin: "0 0 10px" }}>Reason</h4>

    {["Cost", "Weather", "Competitor", "DNH", "Other"].map((r) => (
      <label key={r} style={{ display: "inline-block", marginRight: 16, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={statusReasons.includes(r)}
          onChange={() =>
            setStatusReasons((prev) =>
              prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
            )
          }
        />{" "}
        {r}
      </label>
    ))}

    {statusReasons.includes("Other") && (
      <div style={{ marginTop: 10 }}>
        <input
          type="text"
          placeholder="Other reason..."
          value={statusReasonOther}
          onChange={(e) => setStatusReasonOther(e.target.value)}
          style={{ width: "100%", padding: 8, fontSize: 14 }}
        />
      </div>
    )}
  </div>
)}



  {/* Shoot Type Dropdown */}
  <h3>Shoot Type</h3><br />
  <select 
    value={shootType} 
    onChange={(e) => setShootType(e.target.value)} 
    style={{ 
      width: "100%",
      height: "40px",
      marginBottom: 20,
      padding: "8px",
      fontSize: "16px"
    }}
  >
    <option value="Day">Day</option>
    <option value="Night">Night</option>
  </select><br />

  {/* Client Textarea */}
  <h3>Client</h3><br />
  <textarea 
    value={client} 
    onChange={(e) => setClient(e.target.value)} 
    rows={2} 
    required 
    style={{ 
      width: "100%", 
      height: "40px",          // override rows if needed
      padding: "8px",
      fontSize: "16px"
    }} 
  /><br /><br />

{/* Contact Email */}
<h3>Contact Email</h3><br />
<input
  type="email"
  value={contactEmail}
  onChange={(e) => setContactEmail(e.target.value)}
  style={{
    width: "100%",
    height: "40px",
    marginBottom: 20,
    padding: "8px",
    fontSize: "16px"
  }}
/><br />

{/* Contact Number */}
<h3>Contact Number</h3><br />
<input
  type="text"
  value={contactNumber}
  onChange={(e) => setContactNumber(e.target.value)}
  style={{
    width: "100%",
    height: "40px",
    marginBottom: 20,
    padding: "8px",
    fontSize: "16px"
  }}
/><br />



  {/* Location Textarea */}
  <h3>Location</h3><br />
  <textarea 
    value={location} 
    onChange={(e) => setLocation(e.target.value)} 
    rows={2} 
    required 
    style={{ 
      width: "100%", 
      height: "40px",
      padding: "8px",
      fontSize: "16px"
    }} 
  /><br /><br />
</div>


    {/* Column 2: Dates + Employees */}
    <div style={{ flex: "1 1 300px",
     columnGap: "60px",
      flexWrap: "wrap",
      marginTop: "0px"}}>
    <h2>Date</h2><br />
      <label><input type="checkbox" checked={isRange} onChange={() => setIsRange(!isRange)} /> Multi-day booking</label><br /><br />
      <label>{isRange ? "Start Date" : "Date"}</label><br />
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /><br /><br />
      {isRange && (
        <>
          <label>End Date</label><br />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /><br /><br />
        </>
      )}
  {startDate && (
  <div style={{ marginTop: 20 }}>
    <h4>{isRange ? "Notes for Each Day" : "Note for the Day"}</h4>
    {(() => {
      const days = [];
      const start = new Date(startDate);
      const end = isRange && endDate ? new Date(endDate) : start;
      const curr = new Date(start);

      while (curr <= end) {
        const dateStr = curr.toISOString().split("T")[0];
        days.push(dateStr);
        curr.setDate(curr.getDate() + 1);
      }

      return days.map((date) => {
        const selectedNote = notesByDate[date] || "";
        const isOther = selectedNote === "Other";
        const customNote = notesByDate[`${date}-other`] || "";

        return (
          <div key={date} style={{ marginBottom: 10 }}>
            <label>{new Date(date).toDateString()}</label><br />

            <select
              value={selectedNote}
              onChange={(e) =>
                setNotesByDate({ ...notesByDate, [date]: e.target.value })
              }
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "14px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                marginBottom: isOther ? "8px" : "0",
              }}
            >
     <option value="">Select note</option>
<option value="1/2 Day Travel">1/2 Day Travel</option>
<option value="Night Shoot">Night Shoot</option>
<option value="On Set">Shoot Day</option>
<option value="Other">Other</option>
<option value="Rehearsal Day">Rehearsal Day</option>
<option value="Rest Day">Rest Day</option>
<option value="Rig Day">Rig Day</option>
<option value="Standby Day">Standby Day</option>
<option value="Travel Day">Travel Day</option>
<option value="Travel Time">Travel Time</option>
<option value="Turnaround Day">Turnaround Day</option>
<option value="Recce Day">Recce Day</option>


            </select>

           {isOther ? (
  <div style={{ marginTop: "6px" }}>
    <input
      type="text"
      placeholder="Enter custom note"
      value={customNote}
      onChange={(e) =>
        setNotesByDate({
          ...notesByDate,
          [date]: "Other",
          [`${date}-other`]: e.target.value,
        })
      }
      style={{
        width: "100%",
        padding: "8px",
        fontSize: "14px",
        borderRadius: "4px",
        border: "1px solid #ccc",
      }}
    />
  </div>
) : null}

          </div>
        );
      });
    })()}
  </div>
)}


      
<h2>Precision Driver</h2><br />
{[...employeeList, { id: "other", name: "Other" }].map(emp => {
  const name = emp.name;
  const isBooked  = bookedEmployees.includes(name);
  const isHoliday = isEmployeeOnHoliday(name);
  const disabled  = isBooked || isHoliday || isCrewed; // ✅ disable if crewed

  return (
    <label key={emp.id || name} style={{ display: "block", marginBottom: 5 }}>
<input
  type="checkbox"
  value={name}
  disabled={disabled}
  checked={employees.some(e => e.name === name && e.role === "Precision Driver")}
  onChange={(e) =>
    setEmployees(
      e.target.checked
        ? [...employees, { role: "Precision Driver", name }]
        : employees.filter(sel => !(sel.name === name && sel.role === "Precision Driver"))
    )
  }
/>
{" "}
      <span style={{ color: disabled ? "grey" : "#333" }}>
        {name} {isBooked && "(Booked)"} {isHoliday && "(On Holiday)"}
      </span>
    </label>
  );
})}


{/* Booking Crewed Toggle */}
<div style={{ marginTop: 12, marginBottom: 12 }}>
  <label style={{ fontWeight: 600 }}>
    <input
      type="checkbox"
      checked={isCrewed}
      onChange={(e) => setIsCrewed(e.target.checked)}
    />{" "}
    Booking Crewed
  </label>
</div>

<h3 style={{ marginTop: 20 }}>Freelancers</h3><br />
{[...freelancerList, { id: "other", name: "Other" }].map(emp => {
  const name = emp.name || emp; // handle string fallback
  const isBooked = bookedEmployees.includes(name);
  const isHoliday = isEmployeeOnHoliday(name);
  const disabled = isBooked || isHoliday;

  return (
    <label key={emp.id || name} style={{ display: "block", marginBottom: 5 }}>
      <input
        type="checkbox"
        value={name}
        disabled={disabled}
        checked={employees.some(e => e.name === name && e.role === "Freelancer")}
        onChange={(e) =>
          setEmployees(
            e.target.checked
              ? [...employees, { role: "Freelancer", name }]
              : employees.filter(sel => !(sel.name === name && sel.role === "Freelancer"))
          )
        }
      />{" "}
      <span style={{ color: disabled ? "grey" : "#333" }}>
        {name} {isBooked && "(Booked)"} {isHoliday && "(On Holiday)"}
      </span>
    </label>
  );
})}







{employees.some(e => e.name === "Other") && (

  <div style={{ marginTop: 8 }}>
    <input
      type="text"
      placeholder="Other employee(s), comma-separated"
      value={customEmployee}
      onChange={(e) => setCustomEmployee(e.target.value)}
      style={{ width: "100%", marginBottom: "8px" }}
    />

    {/* Render custom employees as checkboxes */}
{customEmployee
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean)
  .map((name) => (
    <label key={name} style={{ display: "block", marginBottom: 5 }}>
      <input
        type="checkbox"
        checked={employees.some(e => e.role === "Precision Driver" && e.name === name)}
        onChange={(e) => {
          if (e.target.checked) {
            setEmployees([...employees, { role: "Precision Driver", name }]);
          } else {
            setEmployees(employees.filter(e => !(e.role === "Precision Driver" && e.name === name)));
          }
        }}
      />{" "}
      <span>{name}</span>
    </label>
  ))}

  </div>
)}

    </div>

    

    {/* Column 3: Vehicles + Equipment */}
    <div style={{ flex: "1 1 300px" }}>
    <h2>Vehicles</h2>
    {Object.entries(vehicleGroups).map(([group, items]) => {
  const isOpen = openGroups[group] || false;

  return (
    <div key={group} style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() =>
          setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }))
        }
        style={{
          backgroundColor: "#4b4b4b",
          color: "#fff",
          padding: "8px 12px",
          border: "none",
          borderRadius: 4,
          width: "100%",
          textAlign: "left",
          marginBottom: 5,
          cursor: "pointer"
        }}
      >
        {isOpen ? "▼" : "►"} {group.toUpperCase()}
      </button>

      {isOpen && (
        <div style={{ paddingLeft: 10 }}>
{items.map(vehicle => {
  const isBooked = bookedVehicles.includes(vehicle.name);
  const disabled = isBooked;

  return (
    <label key={vehicle.name} style={{ display: "block", marginBottom: 5 }}>
      <input
        type="checkbox"
        value={`${vehicle.name}`}
        disabled={disabled}
        checked={vehicles.includes(vehicle.name)}
        onChange={(e) => {
          if (e.target.checked) {
            setVehicles([...vehicles, vehicle.name]);
          } else {
            setVehicles(vehicles.filter(v => v !== vehicle.name));
          }
        }}
      />{" "}
      <span style={{ color: disabled ? "grey" : "#333" }}>
        {vehicle.name}
        {vehicle.registration && ` – ${vehicle.registration}`}
        {isBooked && " (Booked)"}
      </span>
    </label>
  );
})}



        </div>
      )}
    </div>
  );
})}


<br />
<h2>Equipment</h2>
{Object.entries(equipmentGroups).map(([group, items]) => {
  const isOpen = openEquipGroups[group] || false;

  return (
    <div key={group} style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() =>
          setOpenEquipGroups(prev => ({ ...prev, [group]: !prev[group] }))
        }
        style={{
          backgroundColor: "#4b4b4b",
          color: "#fff",
          padding: "8px 12px",
          border: "none",
          borderRadius: 4,
          width: "100%",
          textAlign: "left",
          marginBottom: 5,
          cursor: "pointer"
        }}
      >
        {isOpen ? "▼" : "►"} {group.toUpperCase()}
      </button>

      {isOpen && (
        <div style={{ paddingLeft: 10 }}>
          {items.map((item) => (
            <label key={item} style={{ display: "block", marginBottom: 5 }}>
              <input
                type="checkbox"
                value={item}
                checked={equipment.includes(item)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setEquipment([...equipment, item]);
                  } else {
                    setEquipment(equipment.filter(i => i !== item));
                  }
                }}
              />{" "}
              <span style={{ color: "#333" }}>{item}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
})}

    </div>
  </div>

  {/* Notes and PDF Upload */}
  <div style={{ marginTop: 30 }}>
    <label>Attach Quote PDF</label><br />
    <input
      type="file"
      accept="application/pdf"
      onChange={(e) => setPdfFile(e.target.files[0])}
    />
  </div>

  <div style={{ marginTop: 30 }}>
    <label>Additional Notes</label><br />
    <textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      rows={4}
      style={{ width: "100%" }}
      placeholder="Anything extra to include for this booking..."
    />
  </div>

  {/* Health & Safety Checkbox */}
<div style={{ marginTop: 20 }}>
  <label style={{ fontWeight: 600 }}>
    <input
      type="checkbox"
      checked={hasHS}
      onChange={(e) => setHasHS(e.target.checked)}
    />{" "}
    Health & Safety Completed
  </label>
</div>

{/* Risk Assessment Checkbox */}
<div style={{ marginTop: 10 }}>
  <label style={{ fontWeight: 600 }}>
    <input
      type="checkbox"
      checked={hasRiskAssessment}
      onChange={(e) => setHasRiskAssessment(e.target.checked)}
    />{" "}
    Risk Assessment Completed
  </label>
</div>


  <div style={{ marginTop: 30, display: "flex", gap: 10 }}>
  <button type="submit" style={buttonStyle}>
  {bookingId ? "Update Booking" : "Save Booking"}
</button>

    <button
  type="button"
  onClick={() => router.back()}
  style={{ ...buttonStyle, backgroundColor: "#ccc", color: "#000" }}
>
  Cancel
</button>
  </div>
</form>

<div style={{
  flex: "1 1 300px",
  backgroundColor: "#f1f5f9",
  padding: "20px",
  borderRadius: "8px",
  maxHeight: "100%",
}}>
  <h2 style={{ marginBottom: 20 }}>📋 Summary</h2>

  <p><strong>Job Number:</strong> {jobNumber}</p>
  <p><strong>Status:</strong> {status}</p>
  <p><strong>Shoot Type:</strong> {shootType}</p>
  <p><strong>Client:</strong> {client}</p>
  <p><strong>Email:</strong> {contactEmail}</p>
  <p><strong>Phone:</strong> {contactNumber}</p>
  <p><strong>Location:</strong> {location}</p>
  <p><strong>Dates:</strong> {isRange ? `${startDate} → ${endDate}` : startDate}</p>

<p><strong>Drivers:</strong> {
  employees.filter(e => e.role === "Precision Driver").map(e => e.name).join(", ") || "None"
}</p>

<p><strong>Freelancers:</strong> {
  employees.filter(e => e.role === "Freelancer").map(e => e.name).join(", ") || "None"
}</p>


<p><strong>Vehicles:</strong> {
  Object.values(vehicleGroups)
    .flat()
    .filter(v => vehicles.includes(v.name))
    .map(v => v.registration ? `${v.name} – ${v.registration}` : v.name)
    .join(", ") || "None"
}</p>

  <p><strong>Equipment:</strong> {equipment.join(", ") || "None"}</p>
  <p><strong>Notes:</strong> {notes || "None"}</p>
  {pdfFile && <p><strong>PDF:</strong> {pdfFile.name}</p>}

  {isRange && Object.keys(notesByDate).length > 0 && (
    <>
      <h4 style={{ marginTop: 15 }}>Notes Per Day:</h4>
      <ul>
        {Object.entries(notesByDate).map(([date, note]) => (
          <li key={date}><strong>{date}:</strong> {note || "—"}</li>
        ))}
      </ul>
    </>
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
