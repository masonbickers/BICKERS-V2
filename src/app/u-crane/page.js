// src/app/dashboard/page.js
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar as BigCalendar, Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer";
import { collection, getDocs, addDoc } from "firebase/firestore";
import useUserRole from "../hooks/useUserRole";
import ViewBookingModal from "../components/ViewBookingModal";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { Check } from "lucide-react";








const Dashboard = () => {
  const userRole = useUserRole();

  if (!userRole) return <div>Loading...</div>;

  return (
    
    <div>
      {userRole === "admin" && <button>Delete Booking</button>}
      {userRole !== "viewer" && <button>Create Booking</button>}
      {/* rest of your dashboard */}
    </div>
  );
};

export default function DashboardPage({ bookingSaved }) {

  const router = useRouter();
  const searchParams = useSearchParams();

  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [calendarView, setCalendarView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidays, setHolidays] = useState([]);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(null);
  const [notes, setNotes] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState(null);


const navButton = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid #333",
};

  const navButtonStyle = {
    padding: "6px 12px",
    backgroundColor: "#505050",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  };

  // Sidebar item style
  const sidebarItemStyle = {
    background: "transparent",
    color: "#fff",
    border: "none",
    fontSize: "16px",
    padding: "10px 0",
    textAlign: "left",
    cursor: "pointer",
  };



  
  useEffect(() => {
    fetchBookings();
    fetchHolidays();
    fetchNotes();
    fetchVehicles();
  }, []);
  
  
  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

const fetchBookings = async () => {
  const snapshot = await getDocs(collection(db, "bookings"));
  const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // ✅ Only include bookings that use the U-Crane
  const uCraneBookings = data.filter((b) => {
    if (Array.isArray(b.vehicles)) {
      return b.vehicles.some((v) => {
        if (typeof v === "string") {
          return v.toLowerCase().includes("u-crane");
        }
        if (typeof v === "object") {
          return (
            v.name?.toLowerCase().includes("u-crane") ||
            v.type?.toLowerCase().includes("u-crane")
          );
        }
        return false;
      });
    }
    return false;
  });

  setBookings(uCraneBookings);
};


  const saveBooking = async (booking) => {
    await addDoc(collection(db, "bookings"), booking);
    setShowModal(false);
    fetchBookings();
    alert("Booking added ✅");
  };

  const fetchHolidays = async () => {
    const snapshot = await getDocs(collection(db, "holidays"));
    const holidayEvents = snapshot.docs.map(doc => {
      const data = doc.data();
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
  
      return {
        id: doc.id,
        title: `${data.employee} - Holiday`,
        start,
        end: new Date(end.setDate(end.getDate())), // 👈 include full last day
        allDay: true,
        status: "Holiday",
        employee: data.employee,
      };
    });
    setHolidays(holidayEvents);
  };

  const [maintenanceBookings, setMaintenanceBookings] = useState([]);

  const [vehiclesData, setVehiclesData] = useState([]);

  const fetchVehicles = async () => {
    const snapshot = await getDocs(collection(db, "vehicles"));
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setVehiclesData(data);
  };
  
  
  
  


  const fetchNotes = async () => {
    const snapshot = await getDocs(collection(db, "notes"));
    const noteEvents = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.text || "Note",
        start: new Date(data.date),
        end: new Date(data.date),
        allDay: true,
        status: "Note",
        employee: data.employee || ""
      };
    });
    setNotes(noteEvents);
  };
  
  
  



  const today = new Date().toISOString().split("T")[0];

  const todaysJobs = bookings.filter((b) => {
    if (b.bookingDates && Array.isArray(b.bookingDates)) {
      return b.bookingDates.includes(today);
    }
    const singleDate = b.date?.split("T")[0];
    const start = b.startDate?.split("T")[0];
    const end = b.endDate?.split("T")[0];
    return (
      singleDate === today ||
      (start && end && today >= start && today <= end)
    );
  });



  return (
    <HeaderSidebarLayout>
<div
  style={{
    display: "flex",
    minHeight: "100vh",
    width: "100%",          // ✅ ensures full width
    overflowX: "hidden",    // ✅ stops sideways scrolling
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#f4f4f5",
  }}
>

      {/* ←── Sidebar */}
           {/* Sidebar */}


      {/* ── Main Container (your original content) */}
<div
  style={{
    flex: 1,
    padding: "20px 40px",
    color: "#333",
    minWidth: 0,           // ✅ allows flexbox to shrink properly
  }}
>

  




        {/* Success Banner */}
        {bookingSaved && (
          <div style={successBanner}>
            ✅ Booking saved successfully!
          </div>
        )}

        {/* Work Diary / Calendar */}
        <div style={cardStyle}>
          <h2 style={cardHeaderStyle}>U-Crane Work Diary</h2>

        {/* Month + Year title */}
<h3 style={{ 
  textAlign: "center", 
  margin: "0px 0 0px 0", 
  fontSize: "1.5rem", 
  fontWeight: "bold" 
}}>
  {currentDate.toLocaleDateString("en-GB", { month: "long" })}
</h3>

        

        
          
          
          {/* Week Nav */}
          {calendarView === "week" && (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 20,
    }}
  >
    {/* Week navigation buttons */}
    <div style={{ display: "flex", gap: 10 }}>
    <button
  onClick={() =>
    setCurrentDate(prev => {
      const newDate = new Date(prev); // create a copy
      newDate.setDate(newDate.getDate() - 7); // move back 7 days
      return newDate;
    })
  }
  style={navButtonStyle}
>
  ← Previous Week
</button>
      <button
  onClick={() =>
    setCurrentDate(prev => {
      const newDate = new Date(prev); // create a copy
      newDate.setDate(newDate.getDate() + 7); // move forward 7 days
      return newDate;
    })
  }
  style={navButtonStyle}
>
  Next Week →
</button>

    </div>

    {/* Add buttons */}
    <div style={{ display: "flex", gap: 10,  }}>
     <button style={buttonStyle} onClick={() => router.push("/u-crane-booking")}>
  + Add U-Crane Booking
</button>

   
    </div>
  </div>
)}




          {/* Calendar */}
          <BigCalendar
            localizer={localizer}
            events={[
              ...bookings.map((b) => {
                const start = new Date(b.startDate || b.date);
                const end = new Date(
                  
                  b.endDate
                    ? new Date(new Date(b.endDate).setDate(new Date(b.endDate).getDate()))
                    : new Date(b.date)
                );
            
                return {
                  ...b,
                  title: b.client || "",
                  start,
                  end,
                  allDay: true,
                  status: b.status || "Confirmed",
                };
              }),
              ...maintenanceBookings,
            ]}
            
            
            
            
            
            
            view={calendarView}
            views={["week", "month"]}
            onView={(v) => setCalendarView(v)}
            date={currentDate}
            onNavigate={(d) => setCurrentDate(d)}
            onSelectSlot={({ start }) => {
              setNoteDate(start);
              setNoteText(""); // or load existing note if implemented later
              setNoteModalOpen(true);
            }}
            selectable
            
            startAccessor="start"
            endAccessor="end"
            popup
            allDayAccessor={() => true}
            allDaySlot
            dayLayoutAlgorithm="no-overlap"
            toolbar={false}
            nowIndicator={false} // 
            getNow={() => new Date(2000, 0, 1)} 
              formats={{
                        dayFormat: (date, culture, localizer) =>
                          localizer.format(date, "EEEE dd", culture), // ✅ "Monday 25"
                      }}
            
              // ✅ Highlight today's column
  dayPropGetter={(date) => {
    const today = new Date();
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    return {
      style: {
        backgroundColor: isToday ? "rgba(137, 174, 255, 0.3)" : undefined, // light yellow
        border: isToday ? "1px solid #3f82ffff" : undefined,               // gold border
      },
    };
  }}

            style={{
  
              borderRadius: "12px",
              background: "#fff",
              padding: "0px",
            }}
 onSelectEvent={(e) => {
  if (e.status === "Holiday") {
    router.push(`/edit-holiday/${e.id}`);
  } else if (e.status === "Note") {
    router.push(`/note/${e.id}`);
  } else if (e.id) {
    setSelectedBookingId(e.id);
  }
}}

            
            
            components={{
              event: ({ event }) => {
                const note = event.noteToShow;
            
  const employeeInitials = Array.isArray(event.employees)
  ? event.employees
      .map(e => {
        if (typeof e === "string") {
          return e
            .split(" ")
            .map(part => part[0]?.toUpperCase())
            .join("");
        }
        if (e && typeof e === "object" && e.name) {
          return e.name
            .split(" ")
            .map(part => part[0]?.toUpperCase())
            .join("");
        }
        return "";
      })
      .filter(Boolean)
      .join(", ")
  : "";

            
                return (
                 <div
  title={note || ""}
  style={{
    display: "flex",
    flexDirection: "column",
    fontSize: "0.85rem",
    lineHeight: "1.4",
    color: "#000",
    fontWeight: 600,
    textTransform: "uppercase",
    fontFamily: "'Montserrat', 'Arial', sans-serif",
    textAlign: "left",
    alignItems: "flex-start",
    padding: "4px",
    margin: 0,
    boxSizing: "border-box",
    whiteSpace: "normal",     // ✅ allow wrapping
    wordBreak: "break-word",  // ✅ break long words
    height: "auto",           // ✅ let height grow with content
    overflow: "visible",      // ✅ make sure nothing is clipped
  }}
>

                   {event.status === "Holiday" ? (
                      <>
                       {event.status === "Holiday" ? (
  <>
    <span>{event.employee}</span>
    <span style={{ fontStyle: "italic", opacity: 0.7 }}>On Holiday</span>
  </>
) : event.status === "Maintenance" ? (
  <>
    <span style={{ fontWeight: "bold" }}>{event.vehicleName}</span>
    <span style={{ textTransform: "capitalize" }}>{event.maintenanceType}</span>
    {event.notes && (
      <span style={{ fontStyle: "italic", opacity: 0.7 }}>{event.notes}</span>
    )}
  </>
)
 : (
  <>



    {/* existing booking layout */}
    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
      <span style={{ fontWeight: "bold" }}>{event.client}</span>
      <span>{event.jobNumber}</span>
    </div>
    {Array.isArray(event.vehicles) && event.vehicles.map((v, i) => (
  <span key={i}>
    {typeof v === "object"
      ? `${v.name}${v.registration ? ` – ${v.registration}` : ""}`
      : v}
  </span>
))}


    <span>{event.location}</span>
<span
  style={{
    fontWeight: "normal",
    fontStyle: "italic",
    fontSize: "0.85 rem",
    opacity: 1,
  }}
>
  {event.notes}
</span>

  </>
)}


                      </>
                    ) : (

                      <>
                       <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: "2px"
  }}
>
  {/* Left side: employee initials */}
  <span
    style={{
      backgroundColor: "white",
      padding: "1px 6px",
      borderRadius: "4px",
      fontSize: "0.85rem",
      fontWeight: "normal",
      border: "1px solid #000"
    }}
  >
    {employeeInitials}
  </span>

  {/* Right side: status + CREWED + job number */}
  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#333" }}>
        {event.status}
      </span>

      {/* ✅ CREWED sits directly below status */}
      {event.isCrewed && (
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: "bold",
            color: "#333",
            marginTop: "-5px",
          }}
        >
             <Check size={12} strokeWidth={3} /> Crew
        </span>
      )}
    </div>

    <span
      style={{
        backgroundColor:
          event.shootType === "Night"
            ? "purple"
            : event.shootType === "Day"
            ? "white"
            : "#4caf50",
        color: event.shootType === "Night" ? "#fff" : "#000",
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "1rem",
        fontWeight: "bold",
        border: "1px solid #000"
      }}
    >
      {event.jobNumber}
    </span>
  </div>
</div>



          
            
<span>{event.client}</span>
{Array.isArray(event.vehicles) && event.vehicles.map((v, i) => (
   <span key={i}>{v}</span>
))}
<span>{event.equipment}</span>
<span>{event.location}</span>
<span
  style={{
    fontWeight: "normal",
    opacity: 0.8,
  }}
>
  {event.notes}
</span>



{event.notesByDate && (
  <div
    style={{
      display: "flex",
      gap: "12px",
      marginTop: "4px",
      flexWrap: "wrap",
    }}
  >



    {Array.from(
      { length: Math.ceil(Object.entries(event.notesByDate).length / 4) },
      (_, colIndex) => {
        const chunk = Object.entries(event.notesByDate)
          .sort(([a], [b]) => new Date(a) - new Date(b))
          .slice(colIndex * 4, colIndex * 4 + 4);

        return (
          <div key={colIndex} style={{ display: "flex", flexDirection: "column" }}>
            {chunk.map(([date, note]) => {
              const formattedDate = new Date(date).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "2-digit",
              });

              return (
                <div
                  key={date}
                  style={{
                    fontSize: "0.75rem",
                    fontStyle: "italic",
                    fontWeight: 500,
                    opacity: 0.7,
                  }}
                >
                  {formattedDate}: {note}
                </div>
              );
            })}
          </div>
        );
      }
    )}
  </div>
)}

{/* H&S + Risk Assessment indicators */}
<div
  style={{
    display: "flex",
    gap: "6px",
    marginTop: "6px",
    alignSelf: "flex-start",
  }}
>
  <span
    style={{
      fontSize: "0.75rem",
      fontWeight: "normal",
      padding: "2px 4px",
      borderRadius: "4px",
      backgroundColor: event.hasHS ? "#4caf50" : "#f44336",
      color: "#ffffffff",
      border: "1px solid #000",   // ✅ Black border added
    }}
  >
    H&S {event.hasHS ? "✓" : "✗"}
  </span>

  <span
    style={{
      fontSize: "0.75rem",
      fontWeight: "normal",
      padding: "2px 4px",
      borderRadius: "4px",
      backgroundColor: event.hasRiskAssessment ? "#4caf50" : "#f44336",
      color: "#fff",
      border: "1px solid #000",   // ✅ Black border added
    }}
  >
    RA {event.hasRiskAssessment ? "✓" : "✗"}
  </span>
</div>



                      </>
                    )}
                  </div>
                );
              }
            }}
            
            
            
            
            eventPropGetter={(event) => {
              const status = event.status || "Confirmed";
              const defaultColor = {
                "Confirmed": "#f3f970",
                "First Pencil": "#89caf5",
                "Second Pencil": "#f73939",
                "Holiday": "#d3d3d3",
                "Maintenance": "#f97316",
                "Complete": "#7AFF6E",
                "Action Required": "##FF973B",

              }[status] || "#ccc";
            
              let highlightColor = defaultColor;
            
              // 🔴 Check for non-taxed or non-insured vehicles
              if (Array.isArray(event.vehicles)) {
                const risky = event.vehicles.some((v) =>
                  typeof v === "object" &&
                  (v.taxStatus?.toLowerCase() !== "Sorn" ||
                   v.insuranceStatus?.toLowerCase() !== "Not Insured")
                );
            
                if (risky) {
                  highlightColor = "#e53935"; // red
                }
              }
            
              return {
                style: {
                  backgroundColor: highlightColor,
                  color: "#fff",
                  fontWeight: "bold",
                  padding: "0",
                  borderRadius: "6px",
                  border: "2px solid #222",
                  boxShadow: "0 2px 2px rgba(0,0,0,0.25)",
                },
              };
            }}
            
            
            
            
            
          />
        </div>

        <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
  <h2 style={cardHeaderStyle}>Holiday + Notes Calendar</h2>
  <div style={{ display: "flex", gap: "10px" }}>
    <button
      style={{
        padding: "6px 12px",
        backgroundColor: "#505050",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer"
      }}
      onClick={() => router.push("/holiday-form")}
    >
      + Add Holiday
    </button>
    <button
  style={{
    padding: "6px 12px",
    backgroundColor: "#505050",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer"
  }}
  onClick={() => router.push("/note-form")}
>
  + Add Note
</button>

  </div>
</div>
  <BigCalendar
    localizer={localizer}
    events={[
      ...holidays.map((h) => ({
        ...h,
        title: h.title,
        start: new Date(h.start),
        end: new Date(h.end),
        allDay: true,
        status: "Holiday",
      })),
      ...notes.map((n) => ({
        ...n,
        title: n.title || "Note",
        start: new Date(n.start),
        end: new Date(n.end),
        allDay: true,
        status: "Note",
        
      })),
    ]}
    
    view={calendarView}
    views={["week", "month"]}
    onView={(v) => setCalendarView(v)}
    date={currentDate}
    onNavigate={(d) => setCurrentDate(d)}
    selectable
    startAccessor="start"
    endAccessor="end"
    popup
    allDayAccessor={() => true}
    allDaySlotsimp
    dayLayoutAlgorithm="overlap"
    toolbar={false}
    nowIndicator={false}
    getNow={() => new Date(2000, 0, 1)}
    onSelectEvent={(e) => {
      if (e.status === "Holiday") {
        router.push(`/edit-holiday/${e.id}`);
      } else if (e.status === "Note") {
        router.push(`/note/${e.id}`);
      }
    }}
    
    style={{
 
      borderRadius: "12px",
      background: "#fff",
      padding: "10px",
    }}
    components={{
      event: ({ event }) => (
        
        
        <div
          title={event.title}
            style={{
            display: "flex",
            flexDirection: "column",
            fontSize: "0.85rem",
            lineHeight: "1.4",
            color: "#000",
            fontWeight: 600,
            textTransform: "uppercase",
            fontFamily: "'Montserrat', 'Arial', sans-serif",
            textAlign: "left",
            alignItems: "flex-start",
            padding: "4px",
            margin: 0,
            boxSizing: "border-box",
            overflow: "visible",           // ✅ allows content to overflow naturally
            whiteSpace: "normal",          // ✅ allows text wrapping
            wordBreak: "break-word",       // ✅ breaks long words
            minHeight: "100px",            // ✅ ensures enough vertical space
            height: "auto",                // ✅ don't clip based on height
          }}

        >
          {event.status === "Holiday" ? (
            <>
              <span>{event.employee}</span>
              <span style={{ fontStyle: "italic", opacity: 0.7 }}>
                On Holiday
              </span>
            </>
          ) : (

            <>
              <span>{event.employee}</span>
              <span style={{ fontWeight: "bold" }}>{event.title}</span>
              <span style={{ fontStyle: "italic", opacity: 0.7 }}>
                Note
              </span>
            </>
          )}
      </div>
  ),
}}

    eventPropGetter={(event) => ({
      style: {
        backgroundColor: event.status === "Holiday" ? "#d3d3d3" : "#9e9e9e", // ← Add note colour
        color: "#000",
        fontWeight: "bold",
        padding: "0",
        borderRadius: "6px",
        border: "2px solid #999",
        boxShadow: "0 2px 2px rgba(0,0,0,0.25)",
      },
    })}

    // ✅ ADD THIS JUST BELOW
    dayPropGetter={(date) => ({
      style: {
        borderRight: "1px solid #ccc",  // vertical divider between days
        borderTop: "1px solid #ccc",    // optional: adds a line under day headers
      },
    })}
  />

</div>


{/* Today's Jobs */}
<div style={{ ...cardStyle, marginTop: "20px" }}>
<h2 style={cardHeaderStyle}>U-Crane Jobs Today</h2>
  {todaysJobs.length === 0 ? (
    <p>No jobs today.</p>
  ) : (
    <table style={{
      width: "100%",
      borderCollapse: "collapse",
      marginTop: "1rem",
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
    }}>
      <colgroup>
        <col style={{ width: "15%" }} />
        <col style={{ width: "15%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "10%" }} />
      </colgroup>
      <thead style={{ backgroundColor: "#d3d3d3" }}>
        <tr>
          <th style={{ textAlign: "left", padding: "12px 10px" }}>Date</th>
          <th style={{ textAlign: "left", padding: "12px 10px" }}>Job Number</th>
          <th style={{ textAlign: "left", padding: "12px 10px" }}>Production</th>
          <th style={{ textAlign: "left", padding: "12px 10px" }}>Location</th>
          <th style={{ textAlign: "left", padding: "12px 10px" }}>Crew</th>
          <th style={{ textAlign: "left", padding: "12px 10px" }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {todaysJobs.map((b, i) => (
          <tr key={i}
            style={{
              borderTop: "1px solid #ddd",
              backgroundColor: i % 2 === 0 ? "#fff" : "#d3d3d3",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0f0f0")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#fff" : "#d3d3d3")}
          >
            <td style={{ padding: "10px", verticalAlign: "middle" }}>{new Date(b.date || b.startDate).toDateString()}</td>
            <td style={{ padding: "10px", verticalAlign: "middle" }}>{b.jobNumber}</td>
            <td style={{ padding: "10px", verticalAlign: "middle" }}>{b.client || "—"}</td>
            <td style={{ padding: "10px", verticalAlign: "middle" }}>{b.location || "—"}</td>
       <td style={{ padding: "10px", verticalAlign: "middle" }}>
  {Array.isArray(b.employees) && b.employees.length > 0
    ? b.employees.join(", ")
    : "—"}

  {b.isCrewed && (
    <div
      style={{
        marginTop: "4px",
        display: "inline-block",
        padding: "2px 6px",
        backgroundColor: "#4caf50",
        color: "#fff",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: "bold",
      }}
    >
      CREWED
    </div>
  )}
</td>

            <td style={{
              padding: "10px",
              verticalAlign: "middle",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <button onClick={() => setSelectedBookingId(b.id)}
                style={{
                  padding: "6px 10px",
                  backgroundColor: "#444",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}>
                View
              </button>
              <button onClick={() => router.push(`/edit-booking/${b.id}`)}
                style={{
                  padding: "6px 10px",
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}>
                Edit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</div>

{/* Upcoming Bookings */}
<div style={{ ...cardStyle, marginTop: "40px" }}>
<h2 style={cardHeaderStyle}>Upcoming U-Crane Bookings</h2>
  {["Confirmed", "First Pencil", "Second Pencil"].map((status) => {
    const todayDate = new Date().toISOString().split("T")[0];
    const filtered = bookings
      .filter((b) => {
        const bookingStatus = b.status || "Confirmed";
        if (bookingStatus !== status) return false;

        const end = b.endDate?.split("T")[0];
        const date = b.date?.split("T")[0];
        const latestDate = end || date;

        return latestDate >= todayDate;
      })
      .sort((a, b) =>
        new Date(a.date || a.startDate) - new Date(b.date || b.startDate)
      );

    return (
      <div key={status} style={{ marginTop: "20px" }}>
        <h3 style={{ color: "#000000", marginBottom: "10px" }}>{status} Bookings</h3>
        {filtered.length === 0 ? (
          <p>No {status.toLowerCase()} bookings.</p>
        ) : (
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "1rem",
            fontFamily: "Arial, sans-serif",
            fontSize: "14px",
          }}>
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead style={{ backgroundColor: "#d3d3d3" }}>
              <tr>
                <th style={{ textAlign: "left", padding: "12px 10px" }}>Date</th>
                <th style={{ textAlign: "left", padding: "12px 10px" }}>Job Number</th>
                <th style={{ textAlign: "left", padding: "12px 10px" }}>Production</th>
                <th style={{ textAlign: "left", padding: "12px 10px" }}>Location</th>
                <th style={{ textAlign: "left", padding: "12px 10px" }}>Crew</th>
                <th style={{ textAlign: "left", padding: "12px 10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr key={i}
                  style={{
                    borderTop: "1px solid #ddd",
                    backgroundColor: i % 2 === 0 ? "#fff" : "#d3d3d3",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0f0f0")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#fff" : "#d3d3d3")}
                >
                  <td style={{ padding: "10px", verticalAlign: "middle" }}>{new Date(b.date || b.startDate).toDateString()}</td>
                  <td style={{ padding: "10px", verticalAlign: "middle" }}>{b.jobNumber}</td>
                  <td style={{ padding: "10px", verticalAlign: "middle" }}>{b.client || "—"}</td>
                  <td style={{ padding: "10px", verticalAlign: "middle" }}>{b.location || "—"}</td>
                 <td style={{ padding: "10px", verticalAlign: "middle" }}>
  {Array.isArray(b.employees) && b.employees.length > 0
    ? b.employees.join(", ")
    : "—"}

  {b.isCrewed && (
    <div
      style={{
        marginTop: "4px",
        display: "inline-block",
        padding: "2px 6px",
        backgroundColor: "#4caf50",
        color: "#fff",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: "bold",
      }}
    >
      CREWED
    </div>
  )}
</td>

                  <td style={{
                    padding: "10px",
                    verticalAlign: "middle",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}>
                    <button onClick={() => setSelectedBookingId(b.id)}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: "#444",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}>
                      View
                    </button>
                    <button onClick={() => router.push(`/edit-booking/${b.id}`)}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: "#1976d2",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  })}
</div>




        {/* Two-column section */}
        <div style={twoColumnWrapper}>
          <div style={columnBox}>
  
        
          </div>
        </div>

        {/* Modal */}
        {showModal && (
          <div style={modalBackdrop}>
            <div style={modalBox}>
              <h3>Add Booking for {selectedDate?.toDateString()}</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const client = e.target.client.value;
                  const location = e.target.location.value;
                  saveBooking({
                    date: selectedDate.toISOString(),
                    client,
                    location,
                  });
                }}
              >
                <input name="client" placeholder="Client" required />
                <br />
                <br />
                <input name="location" placeholder="Location" required />
                <br />
                <br />
                <button type="submit">Save</button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ marginLeft: 10 }}
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
    {selectedBookingId && (
  <ViewBookingModal
    id={selectedBookingId}
    onClose={() => setSelectedBookingId(null)}
  />
)}

    </HeaderSidebarLayout>
 );
}


// 🔷 Styles
const cardStyle = {
  backgroundColor: "#f9f9f9",
  padding: "20px",
  borderRadius: "4px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
  color: "#333",
  marginBottom: "20px",
};

const cardHeaderStyle = {
  marginBottom: "10px",
  color: "#111",
};

const buttonStyle = {
  marginRight: "10px",
  marginTop: "10px",
  padding: "8px 12px",
  backgroundColor: "#505050",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};

const HomeButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#505050",
};

const successBanner = {
  backgroundColor: "#d4edda",
  color: "#155724",
  padding: "10px 20px",
  borderRadius: "5px",
  marginBottom: "20px",
  border: "1px solid #c3e6cb",
};

const twoColumnWrapper = {
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "20px",
};

const columnBox = {
  flex: "1 1 48%",
};

const modalBackdrop = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const modalBox = {
  background: "#fff",
  padding: "20px",
  borderRadius: "8px",
  width: "300px",
};

