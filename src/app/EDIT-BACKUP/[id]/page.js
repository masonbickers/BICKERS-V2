"use client";

import { useState, useEffect } from "react";
import { db } from "../../../firebaseConfig";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { useParams } from "next/navigation";

import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DatePicker from "react-multi-date-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../../firebaseConfig"; // ✅ use this




export default function CreateBookingPage() {
  const router = useRouter();
  const { id } = useParams();

  const [equipment, setEquipment] = useState([]);
  const [pdfURL, setPdfURL] = useState(null);


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






  const [employeeList, setEmployeeList] = useState([]);
  useEffect(() => {

    useEffect(() => {
  const fetchBooking = async () => {
    const ref = doc(db, "bookings", id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      setJobNumber(data.jobNumber || "");
      setClient(data.client || "");
      setContactNumber(data.contactNumber || "");
      setContactEmail(data.contactEmail || "");
      setLocation(data.location || "");
      setEmployees(data.employees || []);
      setVehicles(data.vehicles || []);
      setEquipment(data.equipment || []);
      setNotes(data.notes || "");
      setNotesByDate(data.notesByDate || {});
      setStatus(data.status || "Confirmed");
      setShootType(data.shootType || "Day");
      setIsSecondPencil(data.isSecondPencil || false);

      if (data.date) {
        setStartDate(data.date.slice(0, 10));
        setIsRange(false);
      } else if (data.startDate && data.endDate) {
        setStartDate(data.startDate.slice(0, 10));
        setEndDate(data.endDate.slice(0, 10));
        setIsRange(true);
      }

      setPdfURL(data.pdfUrl || null);
    }
  };

  if (id) fetchBooking();
}, [id]);

    
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

      const workSnap = await getDocs(collection(db, "workBookings"));
const maintenanceData = workSnap.docs.map(doc => doc.data());
setMaintenanceBookings(maintenanceData);




      // 🔹 5. Load and group vehicles
      const vehicleSnap = await getDocs(collection(db, "vehicles"));
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
        const vehicle = {
          name: data.name,
          registration: data.registration || "",
        };
        
        if (category.includes("small")) grouped["Small Tracking Vehicles"].push(vehicle);
        else if (category.includes("bike")) grouped["Bike"].push(vehicle);                    
        else if (category.includes("electric")) grouped["Electric Tracking Vehicles"].push(vehicle);       
        else if (category.includes("large")) grouped["Large Tracking Vehicles"].push(vehicle);
        else if (category.includes("low loader")) grouped["Low Loaders"].push(vehicle);
        else if (category.includes("lorry")) grouped["Transport Lorry"].push(vehicle);
        else if (category.includes("van")) grouped["Transport Van"].push(vehicle);
      });
      
      
  
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
    if (!startDate) return alert("Please select a start date.");
    if (isRange && !endDate) return alert("Please select an end date.");

    const isDuplicateJobNumber = allBookings.some(
      (b) => b.jobNumber?.trim().toLowerCase() === jobNumber.trim().toLowerCase()
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

    // ✅ Check if file is selected
console.log("📎 Selected PDF:", pdfFile);

// ✅ Step: Upload PDF before creating the booking object
let pdfUrlToSave = null;

if (pdfFile && pdfFile.name) {
  try {
    const storageRef = ref(storage, `pdfs/${jobNumber}_${pdfFile.name}`);
    const uploadResult = await uploadBytes(storageRef, pdfFile);
    pdfUrlToSave = await getDownloadURL(uploadResult.ref);

    setPdfURL(pdfUrlToSave); // ✅ ADD THIS LINE
  } catch (error) {
    console.error("PDF upload error:", error);
    alert("Failed to upload PDF: " + error.message);
    return;
  }
}




// ✅ Step: Now define the booking object
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
  notesByDate,
  status,
  bookingDates,
  shootType,
  pdfUrl: pdfUrlToSave, // ✅ now it's correct!
  ...(isRange
    ? {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString()
      }
    : { date: new Date(startDate).toISOString() }),
};

    try {
      await updateDoc(doc(db, "bookings", id), bookingData);
alert("Booking updated successfully");
router.push("/dashboard");

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

  

<form onSubmit={(e) => { e.preventDefault(); handleSubmit(status); }}
> 
  <div style={{
    display: "flex",
    gap: "30px",
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
    fontSize: "16px"
  }} 

  /><br />

  {/* Status Dropdown */}
  <h3>Status</h3><br />
  <select 
    value={status} 
    onChange={(e) => setStatus(e.target.value)} 
    style={{ 
      width: "100%",
      height: "40px",           // adjust height of dropdown
      marginBottom: 20,
      padding: "8px",
      fontSize: "16px"
    }}
  >
    <option value="Confirmed">Confirmed</option>
    <option value="First Pencil">First Pencil</option>
    <option value="Second Pencil">Second Pencil</option>

  </select><br />

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
  placeholder="Enter email address"
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
  placeholder="Enter phone number"
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
      {!isRange && startDate && (
  <div style={{ marginBottom: "20px" }}>
    <h4>Note for the Day</h4>
    <select
      value={notesByDate[startDate] || ""}
      onChange={(e) =>
        setNotesByDate({ ...notesByDate, [startDate]: e.target.value })
      }
      style={{
        width: "100%",
        padding: "8px",
        fontSize: "14px",
        borderRadius: "4px",
        border: "1px solid #ccc",
        marginBottom: notesByDate[startDate] === "Other" ? "8px" : "0"
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

    {notesByDate[startDate] === "Other" && (
      <input
        type="text"
        placeholder="Enter custom note"
        value={notesByDate[`${startDate}-other`] || ""}
        onChange={(e) =>
          setNotesByDate({
            ...notesByDate,
            [startDate]: "Other",
            [`${startDate}-other`]: e.target.value
          })
        }
        style={{
          width: "100%",
          padding: "8px",
          fontSize: "14px",
          borderRadius: "4px",
          border: "1px solid #ccc"
        }}
      />
    )}
  </div>
)}

      {isRange && (
        <>
          <label>End Date</label><br />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /><br /><br />
        </>
      )}
      {isRange && startDate && endDate && (
        <div>
  <h4>Notes for Each Day</h4>
  {(() => {
    const days = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      const dateStr = curr.toISOString().split("T")[0];
      days.push(dateStr);
      curr.setDate(curr.getDate() + 1);
    }
    return days.map(date => {
      const selectedNote = notesByDate[date] || "";
      const isOther = selectedNote === "Other";
      const customOtherValue = notesByDate[`${date}-other`] || "";

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
              marginBottom: isOther ? "8px" : "0"
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
              value={customOtherValue}
              onChange={(e) =>
                setNotesByDate({
                  ...notesByDate,
                  [date]: "Other",
                  [`${date}-other`]: e.target.value
                })
              }
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "14px",
                borderRadius: "4px",
                border: "1px solid #ccc"
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
  const isMaintenance = maintenanceBookedVehicles.includes(vehicle.name);
  const disabled = isBooked || isMaintenance;


  return (
    <label key={vehicle.id || vehicle.name} style={{ display: "block", marginLeft: 10, marginBottom: 5 }}>
      <input
  type="checkbox"
  value={vehicle.name}
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
  {isMaintenance && " (Maintenance)"}
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
  const isOpen = openEquipmentGroups[group] || false;

  return (
    <div key={group} style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() =>
          setOpenEquipmentGroups(prev => ({ ...prev, [group]: !prev[group] }))
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
        {isOpen ? "▼" : "►"} {group.toUpperCase()} ({items.length})
      </button>

      {isOpen && (
        <div style={{ paddingLeft: 10 }}>
          {items.map(item => {
            const isBooked = bookedEquipment.includes(item);
            const disabled = isBooked;

            return (
              <label key={item} style={{ display: "block", marginBottom: 5 }}>
                <input
                  type="checkbox"
                  value={item}
                  disabled={disabled}
                  checked={equipment.includes(item)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setEquipment([...equipment, item]);
                    } else {
                      setEquipment(equipment.filter(i => i !== item));
                    }
                  }}
                />{" "}
                <span style={{ color: disabled ? "grey" : "#333" }}>
                  {item} {isBooked && "(Booked)"}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
})}



    </div>
  </div>

  {/* Notes and PDF Upload */}
  <div style={{ marginTop: 30 }}>
    <h2>Attach Quote PDF</h2><br />
    <input
  id="pdfUpload"
  name="pdfUpload"
  type="file"
  accept="application/pdf"
  onChange={(e) => {
    const file = e.target.files[0];
    setPdfFile(file);
    if (file) {
      const previewURL = URL.createObjectURL(file);
      setPdfURL(previewURL); // ✅ Temporary preview
    }
  }}
/>



{pdfFile && (
  <p style={{ marginTop: "8px", color: "#333" }}>
    📄 Selected: <strong>{pdfFile.name}</strong>
  </p>
)}


  </div>

  <div style={{ marginTop: 30 }}>
    <h2>Additional Notes</h2><br />
    <textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      rows={4}
      style={{ width: "100%" }}
      placeholder="Anything extra to include for this booking..."
    />
  </div>

  <div style={{ marginTop: 30, display: "flex", gap: 10 }}>
    <button type="submit" style={buttonStyle}>Save Booking</button>
    
    <button
  type="button"
  onClick={() => router.push("/dashboard")}
  style={{ ...buttonStyle, backgroundColor: "#ccc", color: "#000" }}
>
  Cancel
</button>
<button
  type="button"
  onClick={async () => {
    const confirmDelete = confirm("Are you sure you want to delete this booking?");
    if (confirmDelete) {
      await deleteDoc(doc(db, "bookings", id));
      alert("Booking deleted");
      router.push("/dashboard");
    }
  }}
  style={{
    padding: "10px 20px",
    backgroundColor: "#d32f2f",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    marginLeft: "12px",
  }}
>
  Delete Booking
</button>

  </div>
</form>

<div style={{ marginTop: 40, padding: 20, backgroundColor: "#e0f7fa", borderRadius: 8 }}>
  <h2 style={{ marginBottom: 10 }}>📋 Booking Summary</h2>

  <p><strong>Job Number:</strong> {jobNumber}</p>
  <p><strong>Status:</strong> {status}</p>
  <p><strong>Shoot Type:</strong> {shootType}</p>
  <p><strong>Client:</strong> {client}</p>
  <p><strong>Contact Email:</strong> {contactEmail}</p>
  <p><strong>Contact Number:</strong> {contactNumber}</p>
  <p><strong>Location:</strong> {location}</p>
  <p>
    <strong>Dates:</strong>{" "}
    {isRange
      ? `${startDate || "N/A"} → ${endDate || "N/A"}`
      : startDate || "N/A"}
  </p>

  <p><strong>Employees:</strong> {employees.concat(customEmployee ? customEmployee.split(",").map(n => n.trim()) : []).join(", ") || "None selected"}</p>

  <p><strong>Vehicles:</strong> {vehicles.join(", ") || "None selected"}</p>

  <p><strong>Equipment:</strong> {equipment.join(", ") || "None selected"}</p>

  <p><strong>Notes:</strong> {notes || "None added"}</p>

  {pdfURL && (
  <p>
    <strong>Attached PDF:</strong>{" "}
    <a href={pdfURL} target="_blank" rel="noopener noreferrer">
      View Quote
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
