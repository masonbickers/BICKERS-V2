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
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("week");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        fetchBookings();
        fetchMaintenance();
        fetchHolidays();
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchBookings = async () => {
    const snapshot = await getDocs(collection(db, "bookings"));
    setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

  const fetchMaintenance = async () => {
    const snapshot = await getDocs(collection(db, "maintenanceBookings"));
    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        start: new Date(data.startDate),
        end: new Date(data.endDate),
        allDay: true,
        status: "Maintenance",
        vehicleName: data.vehicleName,
        maintenanceType: data.maintenanceType,
        notes: data.notes || "",
      };
    });
    setMaintenanceBookings(events);
  };

  const fetchHolidays = async () => {
    const snapshot = await getDocs(collection(db, "holidays"));
    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        start: new Date(data.startDate),
        end: new Date(
          new Date(data.endDate).setDate(new Date(data.endDate).getDate())
        ),
        allDay: true,
        status: "Holiday",
        employee: data.employee,
      };
    });
    setHolidays(events);
  };

  if (!user)
    return <p style={{ textAlign: "center", marginTop: 50 }}>Loading calendar...</p>;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: "100vw",
        zIndex: 9999,
        backgroundColor: "#f4f4f5",
        padding: "0.8rem",
        overflow: "hidden",
      }}
    >
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.6rem",
        }}
      >
        <h1 style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#000" }}>
          Work Diary
        </h1>
        <div>
          <button
            onClick={() =>
              setCurrentDate((prev) => {
                const newDate = new Date(prev);
                newDate.setDate(newDate.getDate() - 7);
                return newDate;
              })
            }
            style={navBtn}
          >
            ← Previous
          </button>
          <button
            onClick={() =>
              setCurrentDate((prev) => {
                const newDate = new Date(prev);
                newDate.setDate(newDate.getDate() + 7);
                return newDate;
              })
            }
            style={navBtn}
          >
            Next →
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ ...navBtn, backgroundColor: "#ef4444", color: "#fff" }}
          >
            ✖ Close
          </button>
        </div>
      </div>

      {/* Month Label */}
      <h1
        style={{
          textAlign: "center",
          fontSize: "1.7rem",
          fontWeight: "bold",
          marginBottom: "0.6rem",
        }}
      >
        {currentDate.toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        })}
      </h1>

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
              start,
              end,
              allDay: true,
              status: b.status || "Confirmed",
            };
          }),
          ...maintenanceBookings,
          ...holidays,
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
        allDaySlot
        dayLayoutAlgorithm="no-overlap"
        toolbar={false}
        nowIndicator={false}
        getNow={() => new Date(2000, 0, 1)}
        formats={{
          dayFormat: (date, culture, loc) =>
            loc.format(date, "EEE dd", culture),
        }}
        dayPropGetter={(date) => {
          const today = new Date();
          const isToday =
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
          return {
            style: {
              backgroundColor: isToday ? "rgba(137, 174, 255, 0.3)" : undefined,
              border: isToday ? "1px solid #3f82ff" : undefined,
            },
          };
        }}
        style={{
          borderRadius: "12px",
          background: "#fff",
          padding: "0px",
          height: "85vh",
        }}
        onSelectEvent={(e) => {
          if (e.status === "Holiday") {
            router.push(`/edit-holiday/${e.id}`);
          } else if (e.status === "Maintenance") {
            router.push(`/edit-maintenance/${e.id}`);
          } else if (e.id) {
            router.push(`/view-booking/${e.id}`);
          }
        }}
        components={{
          event: ({ event }) => {
            const employeeInitials = Array.isArray(event.employees)
              ? event.employees
                  .map((name) =>
                    name
                      .split(" ")
                      .map((part) => part[0]?.toUpperCase())
                      .join("")
                  )
                  .join(", ")
              : "";

            return (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  fontSize: "0.8rem",
                  lineHeight: "1.3",
                  color: "#000",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  fontFamily: "'Montserrat', 'Arial', sans-serif",
                  textAlign: "left",
                  padding: "3px",
                }}
              >
                {event.status === "Holiday" ? (
                  <>
                    <span>{event.employee}</span>
                    <span style={{ fontStyle: "italic", opacity: 0.7 }}>
                      On Holiday
                    </span>
                  </>
                ) : event.status === "Maintenance" ? (
                  <>
                    <span style={{ fontWeight: "bold" }}>{event.vehicleName}</span>
                    <span>{event.maintenanceType}</span>
                    {event.notes && (
                      <span style={{ fontStyle: "italic", opacity: 0.7 }}>
                        {event.notes}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "2px",
                      }}
                    >
                      {/* Status label (left) */}
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: "bold",
                          backgroundColor: "#fff",
                          border: "1px solid #000",
                          borderRadius: "4px",
                          padding: "1px 4px",
                          marginRight: "6px",
                        }}
                      >
                        {event.status}
                      </span>

                      {/* Job Number (right) */}
                      <span
                        style={{
                          backgroundColor:
                            event.shootType === "Night"
                              ? "purple"
                              : event.shootType === "Day"
                              ? "white"
                              : "#4caf50",
                          color: event.shootType === "Night" ? "#fff" : "#000",
                          padding: "1px 4px",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          border: "1px solid #000",
                        }}
                      >
                        {event.jobNumber}
                      </span>
                    </div>

                    {/* Booking details */}
                    <span>{event.client}</span>
                    {Array.isArray(event.vehicles) &&
                      event.vehicles.map((v, i) => (
                        <span key={i}>
                          {typeof v === "object"
                            ? `${v.name}${v.registration ? ` – ${v.registration}` : ""}`
                            : v}
                        </span>
                      ))}
                    <span>{event.location}</span>
                    <span style={{ fontStyle: "italic", opacity: 0.7 }}>
                      {event.notes}
                    </span>
                  </>
                )}
              </div>
            );
          },
        }}
        eventPropGetter={(event) => {
          const status = event.status || "Confirmed";
          const colours = {
            Confirmed: "#f3f970",
            "First Pencil": "#89caf5",
            "Second Pencil": "#f73939",
            Holiday: "#d3d3d3",
            Maintenance: "#f97316",
            Complete: "#7AFF6E",
            "Action Required": "#FF973B",
          };
          return {
            style: {
              backgroundColor: colours[status] || "#ccc",
              color: "#000",
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
  backgroundColor: "#505050",
  color: "#fff",
  padding: "5px 8px",
  margin: "0 3px",
  borderRadius: "6px",
  fontWeight: "bold",
  fontSize: "0.75rem",
  cursor: "pointer",
  border: "none",
};
