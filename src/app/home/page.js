"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import "@fullcalendar/common/main.css";   // ✅ base styles


import { db } from "../../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { usePathname } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import moment from "moment";




const parseDate = (val) => {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  return new Date(val);
};

const CustomMonthDateCellWrapper = ({ children }) => (
  <div style={{
    minHeight: "120px",
    height: "auto",
    overflow: "visible",
    display: "flex",
    flexDirection: "column",
    flexWrap: "nowrap"
  }}>
    {children}
  </div>
);





export default function HomePage() {
  const router = useRouter();
  const [bookings, setBookings] = useState([]);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const pathname = usePathname(); // Add this in your component
  const [maintenanceBookings, setMaintenanceBookings] = useState([]);

  
  useEffect(() => {
    const fetchMaintenanceBookings = async () => {
      const snap = await getDocs(collection(db, "workBookings"));
      const events = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: `${data.vehicleName} - ${data.maintenanceType || "Maintenance"}`,
          start: new Date(data.startDate),
          end: new Date(data.endDate || data.startDate),
          allDay: true,
          status: "maintenance", // Add this so color logic works
        };
      });
      setMaintenanceBookings(events);
    };
  
    fetchMaintenanceBookings();
  }, []);
  
  
  

  useEffect(() => {
    const fetchBookings = async () => {
      const snap = await getDocs(collection(db, "bookings"));
      setBookings(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      console.log("Bookings:", snap.docs.map((doc) => doc.data()));


      const vehicleSnap = await getDocs(collection(db, "vehicles"));
  setVehicles(vehicleSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };
    fetchBookings();
  }, []);

  const now = new Date();
  const twoDaysFromNow = new Date(now);
  twoDaysFromNow.setDate(now.getDate() + 2);

  const today = new Date();
    const threeWeeksFromNow = new Date();
    threeWeeksFromNow.setDate(today.getDate() + 21);

    const upcomingOrOverdueMaintenance = vehicles.filter((v) => {
      const nextMOT = v.nextMOT ? new Date(v.nextMOT) : null;
      const nextService = v.nextService ? new Date(v.nextService) : null;
    
      return (
        (nextMOT && nextMOT <= threeWeeksFromNow) ||
        (nextService && nextService <= threeWeeksFromNow)
      );
    });
    
    const motDueSoon = vehicles.filter((v) => {
      const nextMOT = v.nextMOT ? new Date(v.nextMOT) : null;
      return nextMOT && nextMOT <= threeWeeksFromNow;
    });
    
    const serviceDueSoon = vehicles.filter((v) => {
      const nextService = v.nextService ? new Date(v.nextService) : null;
      return nextService && nextService <= threeWeeksFromNow;
    });
    

    const getColorByStatus = (status = "") => {
      const s = status.toLowerCase(); // 🔑 ensure consistent matching
    
      switch (s) {
        case "confirmed": return "#f3f970";       // lime yellow
        case "second pencil": return "#f73939";   // bright red
        case "first pencil": return "#89caf5";    // pastel blue
        case "cancelled": return "#ef4444";       // deep red
        case "maintenance": return "#f97316";     // orange
        case "travel": return "#38bdf8";          // cyan
        case "holiday": return "#d3d3d3";         // light grey
        case "workshop": return "#c084fc";        // purple
        default: return "#2563eb";                // fallback blue
      }
    };
    
    

  
  const prepList = bookings
    .map((b) => ({
      id: b.id,
      jobNumber: b.jobNumber || "—",
      vehicles: Array.isArray(b.vehicles) ? b.vehicles : [],
      equipment: b.equipment || "—",
      notes: b.notes || "—",
      start: parseDate(b.startDate || b.date),
    }))
    .filter((e) => e.start && e.start >= now && e.start <= twoDaysFromNow);

  const askAssistant = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
      });
      const data = await res.json();
      setResponse(data.reply || "No response.");
    } catch (error) {
      console.error("ChatGPT error:", error);
      setResponse("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <HeaderSidebarLayout>
<div style={{
  display: "flex",
  minHeight: "100vh",
  fontFamily: "Arial, sans-serif",
  backgroundColor: "#f4f4f5"
}}>
      {/* Sidebar */}

<div
  style={{
    flex: 1,
    padding: "20px 40px",
    backgroundColor: "#f4f4f5", // 👈 fixes the black background
    minHeight: "100vh",         // 👈 ensures full height coverage
    overflowY: "auto"
  }}
>
  <main>



        <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 25, color: "#1f2937" }}>
          Home test
        </h1>
        <div
  style={{
    display: "flex",
    gap: "30px",
    marginBottom: "40px",
    flexWrap: "wrap",
    justifyContent: "space-between"
  }}
>
  <div style={statCardStyle}>
    <div style={statCardCount}>{bookings.length}</div>
    <div style={statCardLabel}>Bookings</div>
  </div>

  <div style={statCardStyle}>
    <div style={statCardCount}>{bookings.filter(b => b.vehicles?.length).length}</div>
    <div style={statCardLabel}>Vehicle Uses</div>
  </div>

  <div style={statCardStyle}>
    <div style={statCardCount}>{prepList.length}</div>
    <div style={statCardLabel}>Jobs in next 2 days</div>
  </div>

  <div style={statCardStyle}>
    <div style={statCardCount}>{motDueSoon.length}</div>
    <div style={statCardLabel}>MOT Due</div>
  </div>

  <div style={statCardStyle}>
    <div style={statCardCount}>{serviceDueSoon.length}</div>
    <div style={statCardLabel}>Service Due</div>
  </div>
</div>




        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {/* Work Calendar */}
          <section style={calendarCardStyle}>
            <h2 style={cardHeader}>Work Calendar</h2>
            <div style={{ overflow: "visible" }}>
            <FullCalendar
  plugins={[dayGridPlugin, interactionPlugin]}
  initialView="dayGridMonth"
  headerToolbar={{
    left: "prev,next today",
    center: "title",
    right: "dayGridMonth,dayGridWeek,dayGridDay",
  }}
  contentHeight="auto"
  events={[
    // Bookings
    ...bookings.map((b) => ({
      id: b.id,
      title:
        b.status?.toLowerCase() === "maintenance"
          ? `${b.jobNumber} - ${b.client || "Maintenance"}`
          : `${b.jobNumber} - ${b.client || "—"}`,
      start: parseDate(b.startDate || b.date),
      end: parseDate(b.endDate || b.date),
      allDay: true,
      backgroundColor: getColorByStatus(b.status),
    })),
    // Maintenance Events
    ...maintenanceBookings.map((m) => ({
      ...m,
      backgroundColor: getColorByStatus(m.status),
    })),
  ]}
  eventClick={(info) => {
    const id = info.event.id;
    const type = info.event.extendedProps.type;
  
    if (id) {
      if (type === "workBookings") {
        router.push(`/view-maintenance/${id}`); // 👈 maintenance route
      } else {
        router.push(`/view-booking/${id}`); // 👈 normal booking route
      }
    }
  }}
  
  eventDidMount={(info) => {
    info.el.style.color = "#000";
    const fcContent = info.el.querySelector(".fc-event-title");
    if (fcContent) {
      fcContent.style.color = "#000";
      fcContent.style.fontWeight = "600";
    }
  }}
/>


<div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "20px" }}>
  {[
    { label: "Confirmed", color: "#f3f970" },
    { label: "First Pencil", color: "#89caf5" },
    { label: "Second Pencil", color: "#f73939" },
    { label: "Maintenance", color: "#f97316" },


  ].map((item) => (
    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 14,
        height: 14,
        backgroundColor: item.color,
        border: "1px solid #ccc",
        borderRadius: 2
      }}></div>
      <span style={{ fontSize: 14, color: "#1f2937" }}>{item.label}</span>
    </div>
  ))}
</div>




            </div>
          </section>

          {/* Booking Summary with Chat Assistant */}
          <section style={cardStyle}>
            <h2 style={cardHeader}>Booking Summary</h2>
   
            <button style={buttonStyle} onClick={() => router.push("/create-booking")}>
       + Add Booking
      </button>

            {/* ChatGPT Assistant UI */}
            <div style={{ marginTop: 30 }}>
            <h2 style={cardHeader}>Assistant</h2>
            
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the assistant about bookings, holidays and vehicle maintenance etc."
                rows={3}
                style={{ width: "100%", padding: 10, fontSize: 14 }}
              />
              <button
                onClick={askAssistant}
                disabled={loading}
                style={{
                  marginTop: 10,
                  padding: "10px 16px",
                  backgroundColor: "#000000",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                {loading ? "Asking..." : "Ask Assistant"}
              </button>
              {response && (
                <div style={{
                    whiteSpace: "pre-wrap",
                    background: "#f3f4f6",
                    padding: 12,
                    borderRadius: 6,
                    marginTop: 20,
                    border: "1px solid #d1d5db"
                  }}>
                  <strong>Assistant:</strong>
                  <p>{response}</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Prep List */}
        <section style={{ ...cardStyle, marginTop: 24 }}>
          <h2 style={cardHeader}>Prep List (Next 2 Days)</h2>
          {prepList.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", color: "#000" }}>
              <thead>
                <tr>
                  <th style={thTd}>Job #</th>
                  <th style={thTd}>Vehicles</th>
                  <th style={thTd}>Equipment</th>
                  <th style={thTd}>Notes</th>
                  <th style={thTd}>Start Date</th>
                </tr>
              </thead>
              <tbody>
                {prepList.map((item) => (
                  <tr key={item.id}>
                    <td style={thTd}>{item.jobNumber}</td>
                    <td style={thTd}>{item.vehicles.join(", ") || "—"}</td>
                    <td style={thTd}>{item.equipment}</td>
                    <td style={thTd}>{item.notes}</td>
                    <td style={thTd}>{item.start ? moment(item.start).format("MMM D, YYYY") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No jobs starting in the next 2 days.</p>
          )}
        </section>

        <section style={{ ...cardStyle, marginTop: 24 }}>
  <h2 style={cardHeader}>MOT & Service Needed (Next 3 Weeks)</h2>
  {motDueSoon.length > 0 || serviceDueSoon.length > 0 ? (
    <table style={{ width: "100%", borderCollapse: "collapse", color: "#000" }}>
      <thead>
        <tr>
          <th style={thTd}>Vehicle</th>
          <th style={thTd}>Category</th>
          <th style={thTd}>Next MOT</th>
          <th style={thTd}>Next Service</th>
        </tr>
      </thead>
      <tbody>
      {motDueSoon.map(vehicle => (
          <tr key={vehicle.id}>
            <td style={thTd}>{vehicle.name}</td>
            <td style={thTd}>{vehicle.category}</td>
            <td style={thTd}>
              {vehicle.nextMOT ? moment(vehicle.nextMOT).format("MMM D, YYYY") : "—"}
            </td>
            <td style={thTd}>
              {vehicle.nextService ? moment(vehicle.nextService).format("MMM D, YYYY") : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p>✅ No MOT or service due in the next 3 weeks.</p>
  )}
</section>

      </main>
    </div>
  
      </div>
    </HeaderSidebarLayout>
  );
}

// Styles
const cardStyle = {
  backgroundColor: "#fff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  color: "#000",
  flex: 1,
  minWidth: 280,
};

const calendarCardStyle = {
  ...cardStyle,
  flexBasis: "70%",
  flexGrow: 1,
  flexShrink: 0,
};

const cardHeader = {
  fontSize: 20,
  marginBottom: 15,
};

const thTd = {
  border: "1px solid #ddd",
  padding: "8px",
  textAlign: "left",
};



const statBoxStyle = {
  backgroundColor: "#fff",
  padding: "16px 24px",
  borderRadius: 8,
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  fontWeight: "bold",
  color: "#1f2937",
  minWidth: 150
};
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

const statCardStyle = {
  flex: "1 1 200px",
  backgroundColor: "#fff", // ✅ light grey background
  padding: "24px",
  borderRadius: "8px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};


const statCardCount = {
  fontSize: "32px",
  fontWeight: "bold",
  color: "#111827",
  marginBottom: "0px",
};

const statCardLabel = {
  fontSize: "14px",
  color: "#4b5563",
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
