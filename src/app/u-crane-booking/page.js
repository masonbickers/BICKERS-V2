"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebaseConfig";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import DatePicker from "react-multi-date-picker";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../../firebaseConfig"; //  use this
import { auth } from "../../../firebaseConfig";
import { useAuth } from "@/app/context/authContext";
import { dataAccessKey, tenantCollectionQuery, tenantPayload } from "@/app/utils/firestoreAccess";

/* ───────────────────────────────────────────
   U-Crane roles (must match Crew Manager page)
─────────────────────────────────────────── */
const UCRANE_ROLES = [
  { role: "Precision Driver", key: "u-crane driver" },
  { role: "Arm Operator", key: "arm operator" },
  { role: "Arm & Head Tech", key: "Head and Arm Tech" },
  { role: "Transport Driver", key: "transport driver" },
  { role: "Camera Operator", key: "camera operator" },
];

const norm = (v) => String(v ?? "").trim().toLowerCase();

const getDisplayName = (row) =>
  row?.name ||
  row?.fullName ||
  [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim() ||
  row?.displayName ||
  row?.email ||
  row?.id ||
  "Unknown";

export default function CreateBookingPage() {
  const router = useRouter();
  const authState = useAuth();
  const accessKey = dataAccessKey(authState);
  const [equipment, setEquipment] = useState([]);

  const [jobNumber, setJobNumber] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Selected crew (still stores objects {role, name})
  const [employees, setEmployees] = useState([]);
  const [customEmployee, setCustomEmployee] = useState("");

  const [vehicles, setVehicles] = useState([]);
  const [equipmentGroups, setEquipmentGroups] = useState({
    "A-Frame": [],
    Trailer: [],
    Battery: [],
    "Tow Dolly": [],
    "Lorry Trailer": [],
  });

  const [openEquipmentGroups, setOpenEquipmentGroups] = useState({
    "A-Frame": false,
    Trailer: false,
    Battery: false,
    "Tow Dolly": false,
    "Lorry Trailer": false,
  });

  const [isSecondPencil, setIsSecondPencil] = useState(false);
  const [isCrewed, setIsCrewed] = useState(false);
  const [hasHS, setHasHS] = useState(false);
  const [hasRiskAssessment, setHasRiskAssessment] = useState(false);
  const [notes, setNotes] = useState("");
  const [quoteFile, setQuoteFile] = useState(null);
  const [quoteURL, setQuoteURL] = useState(null);
  const [allBookings, setAllBookings] = useState([]);
  const [holidayBookings, setHolidayBookings] = useState([]);
  const [unavailableNotes, setUnavailableNotes] = useState([]);
  const [status, setStatus] = useState("Confirmed");
  const [shootType, setShootType] = useState("Day");
  const [notesByDate, setNotesByDate] = useState({});

  // Warning old freelancer vars kept but no longer used for selection
  const [freelancers, setFreelancers] = useState([]);
  const [freelancerList, setFreelancerList] = useState([]);

  const [vehicleGroups, setVehicleGroups] = useState({
    Bike: [],
    "Electric Tracking Vehicles": [],
    "Small Tracking Vehicles": [],
    "Large Tracking Vehicles": [],
    "Low Loaders": [],
    "Transport Lorry": [],
    "Transport Van": [],
  });

  const [openGroups, setOpenGroups] = useState({
    "Electric Tracking Vehicles": false,
    "Small Tracking Vehicles": false,
    "Large Tracking Vehicles": false,
    "Low Loaders": false,
    "Transport Lorry": false,
    "Transport Van": false,
  });

  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);

  const inputStyle = {
    width: "100%",
    height: "34px",
    marginBottom: "10px",
    padding: "6px 9px",
    fontSize: "14px",
    border: "1px solid #d2dce8",
    borderRadius: "8px",
    boxSizing: "border-box",
    backgroundColor: "#fff",
    color: "#0f172a",
  };

  const textAreaStyle = {
    ...inputStyle,
    height: "auto",
    minHeight: "54px",
    resize: "vertical",
  };

  const labelHeadingStyle = {
    marginBottom: "5px",
    color: "#516174",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  };

  const formColumnStyle = {
    flex: "1 1 300px",
    minWidth: "280px",
    padding: "12px",
    border: "1px solid #dde5ef",
    borderRadius: "8px",
    backgroundColor: "#ffffff",
  };

  const safetyHeaderStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
    gap: "8px",
    marginBottom: "12px",
    padding: "10px 12px",
    backgroundColor: "#ffffff",
    border: "1px solid #d7dee8",
    borderRadius: "8px",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
  };

  const safetyCheckStyle = {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    margin: 0,
    fontSize: "14px",
    fontWeight: 700,
    color: "#0f172a",
  };

  //  This will now include Employees + U-Crane Freelancers,
  // filtered by uCraneVisible + role key in uCraneRoles
  const [crewPool, setCrewPool] = useState([]);

  // Keep employee list too (used elsewhere), but crew selection will use crewPool
  const [employeeList, setEmployeeList] = useState([]);

  useEffect(() => {
    if (!authState?.user) return undefined;
    const loadData = async () => {
      // - 1. Load all bookings
      const bookingSnap = await getDocs(tenantCollectionQuery(db, "bookings", authState));
      const bookings = bookingSnap.docs.map((doc) => doc.data());
      setAllBookings(bookings);

      // - 2. Auto-generate next job number
      const jobNumbers = bookings
        .map((b) => b.jobNumber)
        .filter((jn) => /^\d+$/.test(jn))
        .map((jn) => parseInt(jn, 10));

      const max = jobNumbers.length > 0 ? Math.max(...jobNumbers) : 0;
      const nextJobNumber = String(max + 1).padStart(4, "0");
      setJobNumber(nextJobNumber);

      // - 3. Load equipment
      const equipmentSnap = await getDocs(tenantCollectionQuery(db, "equipment", authState));
      const groupedEquip = {
        "A-Frame": [],
        Trailer: [],
        Battery: [],
        "Tow Dolly": [],
        "Lorry Trailer": [],
      };
      const openEquip = {
        "A-Frame": false,
        Trailer: false,
        Battery: false,
        "Tow Dolly": false,
        "Lorry Trailer": false,
      };

      equipmentSnap.docs.forEach((doc) => {
        const data = doc.data();
        const category = data.category || "Uncategorised";
        const name = data.name || data.label || "Unnamed Equipment";

        if (groupedEquip[category]) groupedEquip[category].push(name);
        else {
          if (!groupedEquip["Uncategorised"]) groupedEquip["Uncategorised"] = [];
          if (!openEquip["Uncategorised"]) openEquip["Uncategorised"] = false;
          groupedEquip["Uncategorised"].push(name);
        }
      });

      setEquipmentGroups(groupedEquip);
      setOpenEquipmentGroups(openEquip);

      // - 4. Load holidays
      const holidaySnap = await getDocs(tenantCollectionQuery(db, "holidays", authState));
      setHolidayBookings(holidaySnap.docs.map((doc) => doc.data()));

      const noteSnap = await getDocs(tenantCollectionQuery(db, "notes", authState));
      setUnavailableNotes(
        noteSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((note) => note.blocksEmployeeBooking === true)
      );

      // - 5. Load employees (HR)
      const empSnap = await getDocs(tenantCollectionQuery(db, "employees", authState));
      const allEmployees = empSnap.docs.map((doc) => ({
        id: doc.id,
        __collection: "employees",
        ...doc.data(),
      }));
      setEmployeeList(allEmployees);

      // - 6. Load U-Crane freelancers
      const freeSnap = await getDocs(tenantCollectionQuery(db, "uCraneFreelancers", authState));
      const allFreelancers = freeSnap.docs.map((doc) => ({
        id: doc.id,
        __collection: "uCraneFreelancers",
        ...doc.data(),
      }));

      //  Combine into crewPool (ONLY those set Visible in manager)
      const combined = [...allEmployees, ...allFreelancers]
        .filter((p) => p?.uCraneVisible === true)
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

      setCrewPool(combined);

      // - 7. Load maintenance bookings
      const workSnap = await getDocs(tenantCollectionQuery(db, "workBookings", authState));
      const maintenanceData = workSnap.docs.map((doc) => doc.data());
      setMaintenanceBookings(maintenanceData);

      // - 8. Load and group vehicles (unchanged)
      const vehicleSnap = await getDocs(tenantCollectionQuery(db, "vehicles", authState));
      const grouped = {
        "U-Crane": [],
        "Transport Lorry": [],
      };

      vehicleSnap.docs.forEach((doc) => {
        const data = doc.data();
        const category = (data.category || "").trim().toLowerCase();
        const vehicle = {
          name: data.name,
          registration: data.registration || "",
        };

        if (category.includes("u-crane")) grouped["U-Crane"].push(vehicle);
        else if (category.includes("lorry") && !category.includes("trailer")) {
          if (vehicle.name && vehicle.name.toLowerCase().startsWith("u-crane lorry")) {
            grouped["Transport Lorry"].push(vehicle);
          }
        }
      });

      setVehicleGroups(grouped);
    };

    loadData();
  }, [accessKey, authState]);

  const isEmployeeOnHoliday = (employeeName) => {
    const selectedStart = new Date(startDate);
    const selectedEnd = isRange ? new Date(endDate) : selectedStart;

    return holidayBookings.some((h) => {
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

  const selectedBookingDateStrings = () => {
    if (!startDate) return [];
    const out = [];
    const current = new Date(startDate);
    const end = isRange && endDate ? new Date(endDate) : new Date(startDate);
    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    while (current <= end) {
      out.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }
    return out;
  };

  const getEmployeeUnavailableNote = (employeeName) => {
    const target = String(employeeName || "").trim().toLowerCase();
    if (!target) return null;
    const dateSet = new Set(selectedBookingDateStrings());
    if (!dateSet.size) return null;

    return (
      unavailableNotes.find((note) => {
        const noteEmployee = String(note.employee || note.employeeName || "").trim().toLowerCase();
        if (noteEmployee !== target) return false;
        const noteDate = String(note.date || note.startDate || "").slice(0, 10);
        return noteDate && dateSet.has(noteDate);
      }) || null
    );
  };

  const isEmployeeUnavailableByNote = (employeeName) => Boolean(getEmployeeUnavailableNote(employeeName));

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
    .filter((b) => {
      const bookingDates = b.bookingDates || [];
      return bookingDates.some((date) => selectedDates.includes(date));
    })
    .flatMap((b) => b.vehicles || []);

  const bookedEquipment = allBookings
    .filter((b) => {
      const bookingDates = b.bookingDates || [];
      return bookingDates.some((date) => selectedDates.includes(date));
    })
    .flatMap((b) => b.equipment || []);

  const bookedEmployees = allBookings
    .filter((b) => {
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
    .flatMap((b) => b.employees || []);

  const maintenanceBookedVehicles = maintenanceBookings
    .filter((b) => {
      const start = new Date(b.startDate);
      const end = new Date(b.endDate || b.startDate);
      return selectedDates.some((dateStr) => {
        const d = new Date(dateStr);
        return d >= start && d <= end;
      });
    })
    .map((b) => b.vehicleName);

  //  Helper: crew options per role based on uCraneRoles
  const crewOptionsForRole = useMemo(() => {
    const map = {};
    for (const { role, key } of UCRANE_ROLES) {
      map[role] = crewPool.filter((p) => {
        const roles = Array.isArray(p.uCraneRoles) ? p.uCraneRoles : [];
        return roles.some((r) => String(r).trim() === key);
      });
    }
    return map;
  }, [crewPool]);

  const handleSubmit = async (status = "Confirmed") => {
    if (status !== "Enquiry") {
      if (!startDate) return alert("Please select a start date.");
      if (isRange && !endDate) return alert("Please select an end date.");
    }

    const isDuplicateJobNumber = allBookings.some(
      (b) => b.jobNumber?.trim().toLowerCase() === jobNumber.trim().toLowerCase()
    );

    const customNames = customEmployee
      ? customEmployee.split(",").map((name) => name.trim())
      : [];

    const cleanedEmployees = employees
      .filter((e) => e.name !== "Other")
      .map((e) => e.name)
      .concat(customNames);

    for (const employee of cleanedEmployees) {
      if (isEmployeeOnHoliday(employee)) {
        alert(`${employee} is on holiday during the selected dates.`);
        return;
      }
      const unavailableNote = getEmployeeUnavailableNote(employee);
      if (unavailableNote) {
        alert(
          `${employee} is marked unavailable on a note during the selected dates.${unavailableNote.text ? `\n\nNote: ${unavailableNote.text}` : ""}`
        );
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

    //  Upload Quote
    let quoteUrlToSave = null;

    if (quoteFile) {
      try {
        const storageRef = ref(storage, `quotes/${jobNumber}_${quoteFile.name}`);
        const metadata = {
          contentType:
            quoteFile.type ||
            (quoteFile.name.endsWith(".csv")
              ? "text/csv"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        };

        const uploadTask = uploadBytesResumable(storageRef, quoteFile, metadata);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress =
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              console.log(`⏳ Upload is ${progress.toFixed(0)}% done`);
            },
            (error) => reject(error),
            async () => {
              quoteUrlToSave = await getDownloadURL(uploadTask.snapshot.ref);
              setQuoteURL(quoteUrlToSave);
              resolve();
            }
          );
        });
      } catch (error) {
        alert("Failed to upload Excel/CSV: " + error.message);
        return;
      }
    }

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
        ? isRange
          ? {
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate).toISOString(),
            }
          : { date: new Date(startDate).toISOString() }
        : {}),

      createdBy: user?.email || "Unknown",
      createdByUid: user?.uid || "",
      lastEditedBy: user?.email || "Unknown",
      lastEditedByUid: user?.uid || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      history: [
        {
          action: "Created",
          user: user?.email || "Unknown",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      await addDoc(collection(db, "bookings"), tenantPayload(authState, booking));
      alert("Booking Saved ");
      router.push("/u-crane?saved=true");
    } catch (err) {
      console.error(" Error saving booking:", err);
      alert("Failed to save booking \n\n" + err.message);
    }
  };

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          fontFamily: "Inter, system-ui, Arial, sans-serif",
          backgroundColor: "#f3f6f9",
        }}
      >
        <div
          style={{
            flex: 1,
            padding: "16px",
            color: "#0f172a",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <h1 style={{ color: "#0f172a", margin: 0, fontSize: "22px", fontWeight: 850 }}>
              Create U-Crane Booking
            </h1>
            <div style={{ color: "#5f6f82", marginTop: 5, fontSize: "13.5px", fontWeight: 700 }}>
              Add U-Crane work using the same structure and diary logic as the calendar.
            </div>
          </div>

          <div style={safetyHeaderStyle}>
            <label style={safetyCheckStyle}>
              <input
                type="checkbox"
                checked={hasHS}
                onChange={(e) => setHasHS(e.target.checked)}
              />
              Health & Safety Completed
            </label>

            <label style={safetyCheckStyle}>
              <input
                type="checkbox"
                checked={hasRiskAssessment}
                onChange={(e) => setHasRiskAssessment(e.target.checked)}
              />
              Risk Assessment Completed
            </label>

            <label style={safetyCheckStyle}>
              <input type="checkbox" /> Terms & Conditions Accepted
            </label>

            <label style={safetyCheckStyle}>
              <input type="checkbox" /> Insurance Verified
            </label>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(status);
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "flex-start",
                marginTop: "12px",
                backgroundColor: "#ffffff",
                padding: "12px",
                border: "1px solid #d7dee8",
                borderRadius: "8px",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                fontSize: "14px",
                lineHeight: "1.45",
              }}
            >
              {/* Column 1: Job Info */}
              <div style={formColumnStyle}>
                <h3 style={labelHeadingStyle}>Job Number</h3>
                <input
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  required
                  style={inputStyle}
                />

                <h3 style={labelHeadingStyle}>Status</h3>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={inputStyle}
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="First Pencil">First Pencil</option>
                  <option value="Second Pencil">Second Pencil</option>
                  <option value="Enquiry">Enquiry</option>
                </select>

                <h3 style={labelHeadingStyle}>Shoot Type</h3>
                <select
                  value={shootType}
                  onChange={(e) => setShootType(e.target.value)}
                  style={inputStyle}
                >
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>

                <h3 style={labelHeadingStyle}>Production Company</h3>
                <input
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  required
                  style={inputStyle}
                />

                <h3 style={labelHeadingStyle}>Contact Email</h3>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                  style={inputStyle}
                />

                <h3 style={labelHeadingStyle}>Contact Number</h3>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  required
                  style={inputStyle}
                />

                <h3 style={labelHeadingStyle}>Location</h3>
                <textarea
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  rows={2}
                  required
                  style={textAreaStyle}
                />
              </div>

              {/* Column 2: Dates + Crew */}
              <div style={formColumnStyle}>
                <h3 style={{ ...labelHeadingStyle, fontSize: "13px", color: "#0f172a" }}>Dates</h3>
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

                {/*  Crew Roles (NOW uses crew manager controls) */}
                <h3 style={{ ...labelHeadingStyle, fontSize: "13px", color: "#0f172a", marginTop: "10px" }}>Crew</h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "20px",
                  }}
                >
                  {UCRANE_ROLES.map(({ role, key }) => (
                    <div key={role} style={{ marginBottom: "1px" }}>
                      <h4 style={{ margin: "0 0 6px", color: "#334155", fontSize: "13px" }}>{role}</h4>

                      {(crewOptionsForRole[role] || []).map((person) => {
                        const personName = getDisplayName(person);
                        const isBooked = bookedEmployees.includes(personName);
                        const isHoliday = isEmployeeOnHoliday(personName);
                        const isUnavailable = isEmployeeUnavailableByNote(personName);
                        const disabled = isBooked || isHoliday || isUnavailable;

                        return (
                          <label
                            key={`${person.__collection}:${person.id}:${role}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              marginBottom: "6px",
                              fontSize: "14px",
                            }}
                          >
                            <input
                              type="checkbox"
                              value={personName}
                              disabled={disabled}
                              checked={employees.some(
                                (e) => e.name === personName && e.role === role
                              )}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEmployees([...employees, { role, name: personName }]);
                                } else {
                                  setEmployees(
                                    employees.filter(
                                      (sel) => !(sel.name === personName && sel.role === role)
                                    )
                                  );
                                }
                              }}
                            />
                            <span style={{ color: disabled ? "grey" : "#333" }}>
                              {personName}{" "}
                              {person.__collection === "uCraneFreelancers" ? "(Freelancer)" : ""}
                              {isBooked && " (Booked)"} {isHoliday && " (On Holiday)"} {isUnavailable && " (Unavailable)"}
                            </span>
                          </label>
                        );
                      })}

                      {(crewOptionsForRole[role] || []).length === 0 && (
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
                          No crew set as visible for this role.
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Optional custom names */}
                <div style={{ marginTop: 12 }}>
                  <h4 style={{ margin: "0 0 6px", color: "#334155", fontSize: "13px" }}>
                    Add custom crew (comma separated)
                  </h4>
                  <input
                    value={customEmployee}
                    onChange={(e) => setCustomEmployee(e.target.value)}
                    placeholder="e.g. John Smith, Jane Doe"
                    style={{ ...inputStyle, width: "100%" }}
                  />
                </div>
              </div>

              {/* Column 3: Vehicles */}
              <div style={formColumnStyle}>
                <h3 style={{ ...labelHeadingStyle, fontSize: "13px", color: "#0f172a" }}>Vehicles</h3>
                {["U-Crane", "Transport Lorry"].map((group) => {
                  const groupLabel = group === "Transport Lorry" ? "HGV" : group;
                  return (
                  <div key={group} style={{ marginBottom: "15px" }}>
                    <h4 style={{ margin: "0 0 6px", color: "#334155", fontSize: "13px" }}>{groupLabel}</h4>
                    {vehicleGroups[group]?.length > 0 ? (
                      vehicleGroups[group].map((vehicle, index) => (
                        <label
                          key={`${group}-${vehicle.id || vehicle.name || "vehicle"}-${vehicle.registration || ""}-${index}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            marginBottom: "6px",
                            fontSize: "14px",
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
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div
              style={{
                marginTop: 12,
                backgroundColor: "#ffffff",
                border: "1px solid #d7dee8",
                borderRadius: "8px",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                padding: "12px",
              }}
            >
              <h3 style={{ ...labelHeadingStyle, fontSize: "13px", color: "#0f172a" }}>Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  fontSize: "14px",
                  border: "1px solid #d2dce8",
                  borderRadius: "8px",
                  boxSizing: "border-box",
                  color: "#0f172a",
                  }}
                placeholder="Anything extra to include..."
              />
            </div>

            {/* Actions */}
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="submit" style={buttonStyle}>
                Save U-Crane Booking
              </button>
              <button
                type="button"
                onClick={() => router.push("/u-crane")}
                style={{
                  ...buttonStyle,
                  background: "linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%)",
                  color: "#0f172a",
                  border: "1px solid #c8d6e3",
                  boxShadow: "none",
                }}
              >
                Cancel
              </button>
            </div>
          </form>

          <div
            style={{
              marginTop: 12,
              padding: 14,
              backgroundColor: "#ffffff",
              border: "1px solid #d7dee8",
              borderRadius: 8,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
            }}
          >
            <h2 style={{ margin: "0 0 10px", color: "#0f172a", fontSize: "16px" }}>
              Booking Summary
            </h2>

            <p>
              <strong>Job Number:</strong> {jobNumber}
            </p>
            <p>
              <strong>Status:</strong> {status}
            </p>
            <p>
              <strong>Shoot Type:</strong> {shootType}
            </p>
            <p>
              <strong>Client:</strong> {client}
            </p>
            <p>
              <strong>Contact Email:</strong> {contactEmail}
            </p>
            <p>
              <strong>Contact Number:</strong> {contactNumber}
            </p>
            <p>
              <strong>Location:</strong> {location}
            </p>
            <p>
              <strong>Health & Safety:</strong>{" "}
              {hasHS ? " Completed" : " Not Done"}
            </p>
            <p>
              <strong>Risk Assessment:</strong>{" "}
              {hasRiskAssessment ? " Completed" : " Not Done"}
            </p>

            <p>
              <strong>Dates:</strong>{" "}
              {isRange ? `${startDate || "N/A"} → ${endDate || "N/A"}` : startDate || "N/A"}
            </p>

            <p>
              <strong>Employees:</strong>{" "}
              {[
                ...employees.map((e) => {
                  if (typeof e === "string") return e;
                  if (e && typeof e === "object")
                    return `${e.role || "Role"} – ${e.name || "Unknown"}`;
                  return "Unknown";
                }),
                ...(customEmployee ? customEmployee.split(",").map((n) => n.trim()) : []),
              ].join(", ") || "None selected"}
            </p>

            <p>
              <strong>Vehicles:</strong> {vehicles.join(", ") || "None selected"}
            </p>

            <p>
              <strong>Equipment:</strong> {equipment.join(", ") || "None selected"}
            </p>

            <p>
              <strong>Notes:</strong> {notes || "None added"}
            </p>

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
  marginTop: "0",
  padding: "8px 13px",
  background: "linear-gradient(180deg, #2a5f96 0%, #1f4b7a 100%)",
  color: "#fff",
  border: "1px solid #1f4b7a",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 8px 18px rgba(31, 75, 122, 0.16)",
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
