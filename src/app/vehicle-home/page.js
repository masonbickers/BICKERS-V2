"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { Calendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { localizer } from "../utils/localizer";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import { useMemo } from "react"; // (at the top of your file if not already)






export default function VehiclesHomePage() {
  const router = useRouter();
  const [workBookings, setWorkBookings] = useState([]);
  const [usageData, setUsageData] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [overdueMOTCount, setOverdueMOTCount] = useState(0);
  const [overdueServiceCount, setOverdueServiceCount] = useState(0);

  

  

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchVehicleMaintenance = async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      const vehicles = snapshot.docs.map(doc => doc.data());
      const today = new Date();
  
      let motOverdue = 0;
      let serviceOverdue = 0;
  
      vehicles.forEach(vehicle => {
        const motDate = vehicle.motDate?.toDate
        ? vehicle.motDate.toDate()
        : vehicle.motDate
        ? new Date(vehicle.motDate)
        : null;
      
      const serviceDate = vehicle.serviceDate?.toDate
        ? vehicle.serviceDate.toDate()
        : vehicle.serviceDate
        ? new Date(vehicle.serviceDate)
        : null;
      
  
        if (motDate && motDate < today) motOverdue++;
        if (serviceDate && serviceDate < today) serviceOverdue++;
      });
  
      setOverdueMOTCount(motOverdue);
      setOverdueServiceCount(serviceOverdue);
    };
  
    fetchVehicleMaintenance();
  }, []);
  

  useEffect(() => {
    const fetchUsage = async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const bookingsRef = collection(db, "bookings");
      const snapshot = await getDocs(bookingsRef);

      const vehicleCounts = {};

      

      snapshot.forEach((doc) => {
        const data = doc.data();
        const date = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate);
        const vehicleList = data.vehicles || [];
        const bookingDates = data.bookingDates || [];
        
        bookingDates.forEach(dateStr => {
          const date = new Date(dateStr);
          if (date >= startOfMonth && date <= endOfMonth) {
            vehicleList.forEach(vehicleName => {
              vehicleCounts[vehicleName] = (vehicleCounts[vehicleName] || 0) + 1;
            });
          }
        });
        
      });

      const usageArray = Object.entries(vehicleCounts).map(([name, usage]) => ({
        name,
        usage
      }));

      setUsageData(usageArray);
    };

    fetchUsage();
  }, []);

  useEffect(() => {
    const fetchMaintenanceEvents = async () => {
      const snapshot = await getDocs(collection(db, "workBookings"));
      const events = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          title: `${data.vehicleName} - ${data.maintenanceType}`,
          start: new Date(data.startDate),
          end: new Date(data.endDate || data.startDate),
          allDay: true
        };
      });
      setWorkBookings(events);
    };

    fetchMaintenanceEvents();
  }, []);

  const handleSelectEvent = (event) => {
    setSelectedEvent(event);
  };

  const vehicleSections = useMemo(() => [
    {
      title: `MOT Schedule${overdueMOTCount > 0 ? ` – ${overdueMOTCount} overdue` : ""}`,
      description: "View and manage MOT due dates for all vehicles.",
      link: "/mot-overview"
    },
    {
      title: `Service History${overdueServiceCount > 0 ? ` – ${overdueServiceCount} overdue` : ""}`,
      description: "Track past and upcoming vehicle servicing.",
      link: "/service-overview"
    },
    {
      title: "Vehicle Usage Logs",
      description: "Monitor vehicle usage across bookings and trips.",
      link: "/usage-overview"
    },
    {
      title: "Vehicle List",
      description: "View, edit or delete vehicles currently in the system.",
      link: "/vehicles"
    },
    {
      title: "Equipment List",
      description: "View, edit or delete equipment currently in the system.",
      link: "/equipment"
    }
  ], [overdueMOTCount, overdueServiceCount]);
  


  return (
    <HeaderSidebarLayout>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          backgroundColor: "#f4f4f5",
          color: "#333",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <main style={{ flex: 1, padding: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
            Vehicle Management
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20
            }}
          >
            

            {vehicleSections.map((section, idx) => (
              <div
                key={idx}
                style={cardStyle}
                onClick={() => router.push(section.link)}
              >
                <h2 style={{ marginBottom: 10 }}>{section.title}</h2>
                <p>{section.description}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 40 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: "bold",
                marginBottom: 10
              }}
            >
              Vehicle Usage (This Month)
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={usageData}
                margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="usage" fill="#1976d2" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 40 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: "bold",
                marginBottom: 10
              }}
            >
              MOT & Service Calendar
            </h2>
            <div
              style={{
                height: "calc(100vh - 250px)",
                backgroundColor: "#fff",
                padding: 20,
                borderRadius: 8
              }}
            >
              {mounted && (
                <Calendar
                  localizer={localizer}
                  events={workBookings}
                  startAccessor="start"
                  endAccessor="end"
                  defaultView="month"
                  views={["month", "week", "work_week", "day", "agenda"]}
                  popup
                  showMultiDayTimes
                  style={{ height: "100%" }}
                  dayPropGetter={() => ({
                    style: {
                      minHeight: "120px"
                    }
                  })}
                  onSelectEvent={handleSelectEvent}
                />
              )}
            </div>
          </div>

          {selectedEvent && (
            <div
              style={{
                position: "fixed",
                top: 100,
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "#fff",
                padding: 20,
                borderRadius: 8,
                boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
                zIndex: 1000
              }}
            >
              <h3>{selectedEvent.title}</h3>
              <p>
                <strong>Start:</strong>{" "}
                {selectedEvent.start.toLocaleDateString()}
              </p>
              <p>
                <strong>End:</strong>{" "}
                {selectedEvent.end.toLocaleDateString()}
              </p>
              <button onClick={() => setSelectedEvent(null)}>Close</button>
            </div>
          )}
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

const cardStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  cursor: "pointer",
  transition: "transform 0.2s ease"
};
