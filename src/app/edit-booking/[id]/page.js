"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../firebaseConfig";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";




export default function CreateBookingPage() {
  const router = useRouter();

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
    "Transport Van": []
  });
  const [equipmentGroups, setEquipmentGroups] = useState({});
const [openEquipGroups, setOpenEquipGroups] = useState({});

  
  const [openGroups, setOpenGroups] = useState({
    "Small Tracking Vehicles": false,
    "Large Tracking Vehicles": false,
    "Low Loaders": false,
    "Transport Lorry": false,
    "Transport Van": false
  });
  
  const params = useParams();
  const bookingId = params.id;
  const [contact, setContact] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  
  

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
          .filter(emp => (emp.jobTitle || "").toLowerCase() === "driver")
          .map(emp => emp.name || emp.fullName || emp.id)
      );
      setFreelancerList(
        allEmployees
          .filter(emp => (emp.jobTitle || "").toLowerCase() === "freelancer")
          .map(emp => emp.name || emp.fullName || emp.id)
      );
  
      // Group vehicles
      const grouped = {
        "Bike": [],
        "Electric Tracking Vehicles": [],
        "Small Tracking Vehicles": [],
        "Large Tracking Vehicles": [],
        "Low Loaders": [],
        "Transport Lorry": [],
        "Transport Van": []
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
          setEmployees(b.employees || []);
          setVehicles(b.vehicles || []);
          setEquipment(b.equipment || []);
          setIsSecondPencil(b.isSecondPencil || false);
          setNotes(b.notes || "");
          setNotesByDate(b.notesByDate || {});
          setStatus(b.status || "Confirmed");
          setShootType(b.shootType || "Day");
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
    if (bookingId && b.jobNumber === jobNumber) return false; // exclude current booking

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
      if (bookingId && b.jobNumber === jobNumber) return false; // exclude current booking
  
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
  

  const handleSubmit = async (status = "Confirmed") => {
    console.log("📋 Submitting booking for ID:", bookingId);
    if (!startDate) return alert("Please select a start date.");
    if (isRange && !endDate) return alert("Please select an end date.");

    const isDuplicateJobNumber = allBookings.some(
      (b) =>
        b.jobNumber?.trim().toLowerCase() === jobNumber.trim().toLowerCase() &&
        (!bookingId || b.id !== bookingId) // ignore current booking when editing
    );

    

    const customNames = customEmployee
      ? customEmployee.split(",").map(name => name.trim())
      : [];

    const cleanedEmployees = employees
      .filter(name => name !== "Other")
      .concat(customNames);

    for (const employee of cleanedEmployees) {
      if (isEmployeeOnHoliday(employee)) {
        alert(`${employee} is on holiday during the selected dates.`);
        return;
      }
    }

    let bookingDates = [];
    if (isRange && startDate && endDate) {
      const current = new Date(startDate);
      const end = new Date(endDate);
      while (current <= end) {
        bookingDates.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
    } else {
      bookingDates = [new Date(startDate).toISOString().split("T")[0]];
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
  notes,
  notesByDate: filteredNotesByDate, // ✅ updated here
  status,
  bookingDates,
  shootType,
  pdfURL: pdfURL || null,
  ...(isRange
    ? {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        date: null // ✅ clear single date if switching from single-day
      }
    : {
        date: new Date(startDate).toISOString(),
        startDate: null,       // ✅ clear range dates if switching from range
        endDate: null
      }),
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
      router.push("/dashboard");

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

  

<form onSubmit={(e) => { e.preventDefault(); handleSubmit(status); }}>
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
    console.log("🌀 Status changed to:", e.target.value);
    setStatus(e.target.value);
  }}
  style={{ 
    width: "100%",
    height: "40px",
    marginBottom: 20,
    padding: "8px",
    fontSize: "16px"
  }}
>
  <option value="Confirmed">Confirmed</option>
  <option value="First Pencil">First Pencil</option>
  <option value="Second Pencil">Second Pencil</option>
</select>

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
              <option value="Travel Day">Travel Day</option>
              <option value="On Set">On Set</option>
              <option value="Night Shoot">Night Shoot</option>
              <option value="Turnaround Day">Turnaround Day</option>
              <option value="Other">Other</option>
            </select>

            {isOther && (
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
            )}
          </div>
        );
      });
    })()}
  </div>
)}


      
      <h2>Precision Driver</h2><br />
      {[...employeeList, "Other"].map(name => {
  const isBooked  = bookedEmployees.includes(name);
  const isHoliday = isEmployeeOnHoliday(name);
  const disabled  = isBooked || isHoliday;

  return (
    <label key={name} style={{ display: "block", marginBottom: 5 }}>
      <input
        type="checkbox"
        value={name}
        disabled={disabled}
        checked={employees.includes(name)}
        onChange={(e) =>
          setEmployees(e.target.checked
            ? [...employees, name]
            : employees.filter(n => n !== name)
          )
        }
      />{" "}
      <span style={{ color: disabled ? "grey" : "#333" }}>
        {name} {isBooked && "(Booked)"} {isHoliday && "(On Holiday)"}
      </span>
    </label>
  );
})}

<h3 style={{ marginTop: 20 }}>Freelancers</h3><br />
{[...freelancerList, "Other"].map(name => {
  const isBooked = bookedEmployees.includes(name);
  const isHoliday = isEmployeeOnHoliday(name);
  const disabled = isBooked || isHoliday;

  return (
    <label key={name} style={{ display: "block", marginBottom: 5 }}>
      <input
        type="checkbox"
        value={name}
        disabled={disabled}
        checked={employees.includes(name)}
        onChange={(e) =>
          setEmployees(
            e.target.checked
              ? [...employees, name]
              : employees.filter(n => n !== name)
          )
        }
      />{" "}
      <span style={{ color: disabled ? "grey" : "#333" }}>
        {name} {isBooked && "(Booked)"} {isHoliday && "(On Holiday)"}
      </span>
    </label>
  );
})}






      {employees.includes("Other") && (
        <input
          type="text"
          placeholder="Other employee(s), comma-separated"
          value={customEmployee}
          onChange={(e) => setCustomEmployee(e.target.value)}
          style={{ width: "100%", marginTop: 8 }}
        />
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

  <p><strong>Drivers / Freelancers:</strong> {employees.concat(customEmployee ? customEmployee.split(",").map(n => n.trim()) : []).join(", ") || "None"}</p>

  <p><strong>Vehicles:</strong> {
  Object.values(vehicleGroups)
    .flat()
    .filter(v => vehicles.includes(v))
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
