"use client";
import { useEffect, useState } from "react";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar as BigCalendar, Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer";
import { collection, getDocs, addDoc } from "firebase/firestore";

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingSaved = searchParams.get("success") === "true";

  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [calendarView, setCalendarView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const navButtonStyle = {
    padding: "6px 12px",
    backgroundColor: "#1976d2",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer"
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        fetchBookings();
      }
    });
    return () => unsubscribe();
  }, [router]);
  
  

  const handleHome = async () => {
    await signOut(auth);
    router.push("/home");
  };

  const fetchBookings = async () => {
    const snapshot = await getDocs(collection(db, "bookings"));
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setBookings(data);
  };

  const saveBooking = async (booking) => {
    await addDoc(collection(db, "bookings"), booking);
    setShowModal(false);
    fetchBookings();
    alert("Booking added ✅");
  };

  if (!user) return <p>Loading...</p>;

  const today = new Date().toISOString().split("T")[0];

  const todaysJobs = bookings.filter((b) => {
    if (b.bookingDates && Array.isArray(b.bookingDates)) {
      return b.bookingDates.includes(today);
    }
    const singleDate = b.date?.split("T")[0];
    const start = b.startDate?.split("T")[0];
    const end = b.endDate?.split("T")[0];
    return singleDate === today || (start && end && today >= start && today <= end);
  });

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 20px", fontFamily: "Arial, sans-serif", color: "#b" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 30 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
          <h1 style={{ margin: 0 }}></h1>
          <button onClick={handleHome} style={HomeButtonStyle}>back</button>
        </div>
      </div>

      {bookingSaved && (
        <div style={successBanner}>✅ Booking saved successfully!</div>

      )}

      
      

      <div style={cardStyle}>
        <h2 style={cardHeaderStyle}>Work Diary</h2>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ marginBottom: 20 }}>
            <span style={{ marginRight: 10 }}>Calendar View:</span>
            <button
              onClick={() => setCalendarView("week")}
              style={{
                marginRight: 10,
                padding: "6px 12px",
                backgroundColor: calendarView === "week" ? "#1976d2" : "#eee",
                color: calendarView === "week" ? "#fff" : "#000",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Week
            </button>
            <button
              onClick={() => setCalendarView("month")}
              style={{
                padding: "6px 12px",
                backgroundColor: calendarView === "month" ? "#1976d2" : "#eee",
                color: calendarView === "month" ? "#fff" : "#000",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Month
            </button>
          </div>
        </div>

        {calendarView === "week" && (
          <div style={{ display: "flex", justifyContent: "flex-start", gap: 10, marginBottom: 20 }}>
            <button
              onClick={() => setCurrentDate(prev => new Date(prev.setDate(prev.getDate() - 7)))}
              style={navButtonStyle}
            >
              ← Previous Week
            </button>

            <button
              onClick={() => setCurrentDate(prev => new Date(prev.setDate(prev.getDate() + 7)))}
              style={navButtonStyle}
            >
              Next Week →
            </button>
          </div>
        )}


<BigCalendar
          localizer={localizer}
          events={bookings.map((b) => ({
            ...b,
            title: "",
            start: new Date(b.startDate || b.date),
            end: new Date(
              b.endDate
                ? new Date(new Date(b.endDate).setDate(new Date(b.endDate).getDate() + 1))
                : new Date(b.date)
            ),
            allDay: true,
          }))}
          view={calendarView}
          views={["week", "month"]}
          onView={(view) => setCalendarView(view)}
          startAccessor="start"
          endAccessor="end"
          popup={true}
          allDayAccessor={() => true}
          allDaySlot={true}
          date={currentDate}
          onNavigate={(date) => setCurrentDate(date)}
          dayLayoutAlgorithm="no-overlap"
          toolbar={false}
          style={{ height: 600, borderRadius: "12px", background: "#fff", padding: "10px" }}
          onSelectEvent={(event) => router.push(`/view-booking/${event.id}`)}
          components={{
            event: ({ event }) => {
              const todayKey = new Date(event.start).toISOString().split("T")[0];
              const note = event.notesByDate?.[todayKey];
              return (
                <div
                  title={note ? ` ${note}` : ""}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    fontSize: "0.8rem",
                    lineHeight: "1.4",
                    color: "#fff",
                    fontWeight: 500,
                  }}
                >
                  <strong>{event.jobNumber}</strong>
                  <span>{event.client}</span>
                  <span>{event.location}</span>
                  <span>{event.status}</span>
                  {note && (
                    <span style={{ fontStyle: "italic", fontWeight: 1000, textTransform: 'uppercase', opacity: 0.9 }}>
                      {note}
                    </span>
                  )}
                </div>
              );
            },
          }}
          eventPropGetter={(event) => {
            let backgroundColor = "#4caf50";
            if (event.status === "First Pencil") backgroundColor = "#1976d2";
            if (event.status === "Second Pencil") backgroundColor = "#ff9800";
            return {
              style: {
                backgroundColor,
                borderRadius: "1px",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
                padding: "4px 4px",
                border: "none",
                color: "#fff",
                cursor: "pointer",
              },
            };
          }}
        />
      </div>

      <div style={{ ...cardStyle, marginTop: "20px" }}>
        <h2 style={cardHeaderStyle}>Todays Jobs</h2>
        {todaysJobs.length === 0 ? (
          <p>No jobs today.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px" }}>Job Number</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Client</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Location</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {todaysJobs.map((b, i) => (
                <tr key={i} style={{ borderTop: "1px solid #ddd" }}>
                  <td style={{ padding: "8px" }}>{b.jobNumber}</td>
                  <td style={{ padding: "8px" }}>{b.client}</td>
                  <td style={{ padding: "8px" }}>{b.location}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => router.push(`/edit-booking/${b.id}`)} style={{ marginRight: 8 }}>
                      Edit Booking
                    </button>
                    <button onClick={() => router.push(`/view-booking/${b.id}`)}>
                      View Booking
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>



      <div style={cardStyle}>
  <h2 style={cardHeaderStyle}>Upcoming Bookings</h2>
  {["Confirmed", "First Pencil", "Second Pencil"].map((status) => {
    
    const filtered = bookings
      .filter((b) => (b.status || "Confirmed") === status)
      .sort((a, b) => new Date(a.date || a.startDate) - new Date(b.date || b.startDate));

    return (
      <div key={status} style={{ marginTop: "20px" }}>
        <h3 style={{ color: "#1976d2", marginBottom: "10px" }}>{status} Bookings</h3>
        {filtered.length === 0 ? (
          <p>No {status.toLowerCase()} bookings.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px" }}>Date</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Job Number</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Client</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Location</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr key={i} style={{ borderTop: "1px solid #ddd" }}>
                  <td style={{ padding: "8px" }}>{new Date(b.date || b.startDate).toDateString()}</td>
                  <td style={{ padding: "8px" }}>{b.jobNumber}</td>
                  <td style={{ padding: "8px" }}>{b.client}</td>
                  <td style={{ padding: "8px" }}>{b.location}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => router.push(`/edit-booking/${b.id}`)}>Edit Booking</button>
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



      <div style={twoColumnWrapper}>
        <div style={columnBox}>
          <div style={{ ...cardStyle, cursor: "pointer" }} onClick={() => router.push("/contacts")}>
            <h2 style={cardHeaderStyle}>Contacts</h2>
            <p style={{ marginTop: "10px", color: "#1976d2" }}>Click to view contact details</p>
          </div>

          <div style={cardStyle}>
            <h2 style={cardHeaderStyle}>Company Updates</h2>
          </div>
        </div>

        <div style={columnBox}>
          <div style={cardStyle}>
            <h2 style={cardHeaderStyle}>Quick Actions</h2>
            <button style={buttonStyle} onClick={() => router.push("/create-booking")}>Add Booking</button>
            <button style={buttonStyle} onClick={() => router.push("/holiday-form")}>Holiday Booking</button>
            <button style={buttonStyle}>Add Contact</button>
          </div>

          <div style={{ ...cardStyle, cursor: "pointer" }} onClick={() => router.push("/statistics")}>
            <h2 style={cardHeaderStyle}>📊 Statistics</h2>
            <p style={{ marginTop: "10px", color: "#1976d2" }}>Click to view analytics and trends</p>
          </div>

        </div>
      </div>

      {showModal && (
        <div style={modalBackdrop}>
          <div style={modalBox}>
            <h3>Add Booking for {selectedDate?.toDateString()}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const client = e.target.client.value;
                const location = e.target.location.value;
                saveBooking({ date: selectedDate.toISOString(), client, location });
              }}
            >
              <input name="client" placeholder="Client" required /><br /><br />
              <input name="location" placeholder="Location" required /><br /><br />
              <button type="submit">Save</button>
              <button type="button" onClick={() => setShowModal(false)} style={{ marginLeft: 10 }}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 🔷 Styles
const cardStyle = {
  backgroundColor: "#f9f9f9",
  padding: "20px",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
  color: "#333",
  marginBottom: "20px"
};

const cardHeaderStyle = {
  marginBottom: "10px",
  color: "#111"
};

const buttonStyle = {
  marginRight: "10px",
  marginTop: "10px",
  padding: "8px 12px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer"
};

const HomeButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#f44336"
};

const successBanner = {
  backgroundColor: "#d4edda",
  color: "#155724",
  padding: "10px 20px",
  borderRadius: "5px",
  marginBottom: "20px",
  border: "1px solid #c3e6cb"
};

const modalBackdrop = {
  position: "fixed",
  top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center"
};

const modalBox = {
  background: "#fff",
  padding: "20px",
  borderRadius: "8px",
  width: "300px"
};

const twoColumnWrapper = {
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "20px"
};

const columnBox = {
  flex: "1 1 48%"
};
