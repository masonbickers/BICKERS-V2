"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { Calendar as BigCalendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer";


export default function WallViewCalendarPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [notes, setNotes] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("week"); // ✅ Add this line


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        fetchBookings();
        fetchHolidays();
        fetchNotes();
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchBookings = async () => {
    const snapshot = await getDocs(collection(db, "bookings"));
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setBookings(data);
  };

  const fetchHolidays = async () => {
    const snapshot = await getDocs(collection(db, "holidays"));
    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: `${data.employee} - Holiday`,
        start: new Date(data.startDate),
        end: new Date(data.endDate),
        allDay: true,
        status: "Holiday",
        employee: data.employee,
      };
    });
    setHolidays(events);
  };

  const handleFullscreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  };
  

  const fetchNotes = async () => {
    const snapshot = await getDocs(collection(db, "notes"));
    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.text || "Note",
        start: new Date(data.date),
        end: new Date(data.date),
        allDay: true,
        status: "Note",
      };
    });
    setNotes(events);
  };

  if (!user)
    return <p style={{ textAlign: "center", marginTop: 50 }}>Loading calendar...</p>;

  const events = [
    ...bookings.map((b) => ({
      ...b,
      title: b.client || "",
      start: new Date(b.startDate || b.date),
      end: new Date(b.endDate || b.date),
      allDay: true,
      status: b.status || "Confirmed",
    })),
    ...holidays,
    ...notes,
  ];

  return (
<div style={{
  position: "fixed",
  top: 0,
  left: 0,
  height: "100vh",
  width: "100vw",
  zIndex: 9999,
  backgroundColor: "#f9fafb",
  padding: "1rem"
}}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: "bold",color: "#000" }}>Calendar</h1>
        <div>
          <button onClick={() => setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() - 7)))} style={navBtn}>
            ← Previous Week
          </button>
          <button onClick={() => setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() + 7)))} style={navBtn}>
            Next Week →
          </button>
          <button onClick={handleFullscreen} style={{ ...navBtn, backgroundColor: "#2563eb", color: "#fff" }}>
            ⛶ Fullscreen
            </button>
          <button onClick={() => router.push("/dashboard")} style={{ ...navBtn, backgroundColor: "#ef4444", color: "#fff" }}>
            ✖ Close View
          </button>
        </div>
      </div>

      <style jsx global>{`
        .rbc-time-view, .rbc-time-header, .rbc-time-content, .rbc-day-slot {
          border-width: 2px !important;
        }
        .rbc-time-header-cell, .rbc-timeslot-group, .rbc-day-bg {
          border-width: 2px !important;
        }
      `}</style>

   

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
            dayLayoutAlgorithm="overlap"
            toolbar={false}
            nowIndicator={false} // 
            getNow={() => new Date(2000, 0, 1)} 
            
            style={{
  
              borderRadius: "12px",
              background: "#fff",
              padding: "0px",
            }}
            onSelectEvent={(e) => {
              if (e.status === "Holiday") {
                router.push(`/edit-holiday/${e.id}`);
              } else if (e.id) {
                router.push(`/view-booking/${e.id}`);
              }
            }}
            
            
            components={{
                header: ({ date, label }) => (
                    <div
                      style={{
                        color: "#000",       // your new weekday color
                        fontWeight: "600",      // optional
                        textAlign: "center",    // same alignment as default
                      }}
                    >
                      {label}
                    </div>
                  ),

            
              
              event: ({ event }) => {
                const note = event.noteToShow;
            
                const employeeInitials = Array.isArray(event.employees)
                  ? event.employees
                      .map(name =>
                        name
                          .split(" ")
                          .map(part => part[0]?.toUpperCase())
                          .join("")
                      )
                      .join(", ")
                  : "";


            
                return (
                  <div
                    title={note || ""}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      fontSize: "1rem",
                      lineHeight: "1.4",
                      color: "#000",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      fontFamily: "'Montserrat', 'Arial', sans-serif",
                      textAlign: "left",
                      alignItems: "flex-start",
                      padding: "4px",
                      margin: 0,
                      boxSizing: "border-box"
                    }}

                    
                  >
                   {event.status === "Holiday" ? (
                      <>
                        {event.status === "Holiday" ? (
                    <>
                      <span>{event.employee}</span>
                      <span style={{ fontStyle: "italic", opacity: 0.7 }}>On Holiday</span>
                    </>
                  ) : (
                    <>

                      <span style={{ fontWeight: "bold" }}>{event.title}</span>
                     
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
                          <span
                            style={{
                              backgroundColor: "rgba(255,255,255,0.15)",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              fontSize: "0.85rem",
                              fontWeight: "bold"
                            }}
                          >
                            {employeeInitials}
                          </span>
            
                          <span
  style={{
    backgroundColor:
      event.shootType === "Night"
        ? "purple"
        : event.shootType === "Day"
        ? "yellow"
        : "#4caf50", // default green
    color: event.shootType === "Night" ? "#fff" : "#000",
    padding: "1px 6px",
    borderRadius: "4px",
    fontSize: "0.85rem",
    fontWeight: "bold"
  }}
>
  {event.jobNumber}
</span>



                        </div>
            
                        <span>{event.client}</span>
                        {Array.isArray(event.vehicles) && event.vehicles.map((v, i) => (
                           <span key={i}>{v}</span>
                           ))}
                        <span>{event.equipment}</span>
                        <span>{event.location}</span>
                        <span>{event.notes}</span>
                        

        {event.notesByDate && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            fontStyle: "italic",
            fontWeight: 500,
            opacity: 0.6,
            fontSize: "0.75rem",
            marginTop: "4px"
          }}>
            {Object.entries(event.notesByDate)
              .sort(([a], [b]) => new Date(a) - new Date(b))
              .map(([date, note]) => {
                const formattedDate = new Date(date).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "2-digit",
                });
                return <div key={date}>{formattedDate}: {note}</div>;
              })}
          </div>
        )}



                      </>
                    )}
                  </div>
                );
              }
            }}
            
            
            
            
            eventPropGetter={(event) => {
              const status = event.status || "Confirmed";
            
              const colours = {
                "Confirmed": "#4caf50",       // Green
                "First Pencil": "#2196f3",    // Blue
                "Second Pencil": "#ffeb3b",   // Yellow
                "Holiday": "#d3d3d3",         // 🔴 Red for holiday
              };
            
              return {
                style: {
                  backgroundColor: colours[status] || "#ccc",
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
        );

      }
      
      const navBtn = {
        backgroundColor: "#e5e7eb",
        color: "#111827",
        padding: "8px 12px",
        margin: "0 4px",
        borderRadius: "6px",
        fontWeight: "bold",
        fontSize: "1rem",
        cursor: "pointer",
        border: "1px solid #ccc",
      };
      