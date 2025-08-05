"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enGB from "date-fns/locale/en-GB";
import "react-big-calendar/lib/css/react-big-calendar.css";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";


const locales = { "en-GB": enGB };


const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

function stringToColour(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 70%, 70%)`;
}

export default function HolidayUsagePage() {
  const [holidayData, setHolidayData] = useState({});
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [employeeColours, setEmployeeColours] = useState({});
  const router = useRouter();

  useEffect(() => {
    const fetchHolidays = async () => {
      const snapshot = await getDocs(collection(db, "holidays"));
      const usage = {};
      const events = {};
      const eventList = [];
      const currentYear = new Date().getFullYear();

      snapshot.docs.forEach((doc) => {
        const { employee, startDate, endDate } = doc.data();
        if (!employee || !startDate || !endDate) return;

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (
          start.getFullYear() !== end.getFullYear() ||
          start.getFullYear() !== currentYear
        ) {
          return;
        }

        let count = 0;
        const current = new Date(start);
        while (current <= end) {
          const day = current.getDay();
          if (day !== 0 && day !== 6) count++;
          current.setDate(current.getDate() + 1);
        }

        if (!usage[employee]) usage[employee] = 0;
        usage[employee] += count;

        const colour = stringToColour(employee);
        if (!events[employee]) events[employee] = colour;

        eventList.push({
          title: `${employee} Holiday`,
          start: start,
          end: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
          allDay: true,
          employee,
        });
      });

      setHolidayData(usage);
      setEmployeeColours(events);
      setCalendarEvents(eventList);
    };

    fetchHolidays();
  }, []);

  const eventStyleGetter = (event) => {
    const bg = employeeColours[event.employee] || "#ccc";
    return {
      style: {
        backgroundColor: bg,
        borderRadius: "6px",
        border: "none",
        color: "#000",
        padding: "4px",
      },
    };
  };

  return (
        <HeaderSidebarLayout>

    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "#f4f4f5", color: "#333", fontFamily: "Arial, sans-serif", padding: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: "bold" }}>📅 Holiday Usage (January to December)</h1>
        <button
          onClick={() => router.push("/holiday-form")}
          style={{
            backgroundColor: "#333",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: "6px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          ➕ Add Holiday
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", marginBottom: 50 }}>
        <thead style={{ backgroundColor: "#ddd" }}>
          <tr>
            <th style={th}>Employee</th>
            <th style={th}>Total Days Used</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(holidayData).map(([employee, days], index) => (
            <tr key={index}>
              <td style={td}>{employee}</td>
              <td style={td}>{days}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>🗓️ Holiday Calendar</h2>
      <div style={{ height: "80vh", background: "#fff", borderRadius: 10, padding: 20 }}>
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          views={["month", "week"]}
          defaultView="month"
          style={{ height: "100%" }}
          eventPropGetter={eventStyleGetter}
        />
      </div>
    </div>
    </HeaderSidebarLayout>
  );
}

const th = {
  textAlign: "left",
  borderBottom: "2px solid #ccc",
  padding: "12px",
  fontWeight: "bold",
};

const td = {
  padding: "12px",
  borderBottom: "1px solid #eee",
};
