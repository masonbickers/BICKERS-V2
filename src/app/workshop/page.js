"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";
import moment from "moment";

export default function WorkshopPrepPage() {
  const [bookings, setBookings] = useState([]);
  const [prepList, setPrepList] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const bookingSnap = await getDocs(collection(db, "bookings"));
      const bookingsData = bookingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBookings(bookingsData);

      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      const list = bookingsData
        .map((b) => ({
          id: b.id,
          jobNumber: b.jobNumber || "—",
          vehicles: Array.isArray(b.vehicles) ? b.vehicles : [],
          equipment: b.equipment || "—",
          notes: b.notes || "—",
          start: new Date(b.startDate || b.date),
        }))
        .filter((e) => {
          const date = new Date(e.start);
          return (
            date.toDateString() === today.toDateString() ||
            date.toDateString() === tomorrow.toDateString()
          );
        });

      setPrepList(list);
    };

    fetchData();
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#f9fafb",
        padding: "20px 40px",
        overflowY: "auto",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "20px" }}>
        Workshop Prep List (Today & Tomorrow)
      </h1>
      {prepList.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle}>Job #</th>
              <th style={cellStyle}>Vehicles</th>
              <th style={cellStyle}>Equipment</th>
              <th style={cellStyle}>Notes</th>
              <th style={cellStyle}>Start Date</th>
            </tr>
          </thead>
          <tbody>
            {prepList.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle}>{item.jobNumber}</td>
                <td style={cellStyle}>{item.vehicles.join(", ") || "—"}</td>
                <td style={cellStyle}>{item.equipment}</td>
                <td style={cellStyle}>{item.notes}</td>
                <td style={cellStyle}>{moment(item.start).format("MMM D, YYYY")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No vehicles need prep for today or tomorrow.</p>
      )}
    </div>
  );
}

const cellStyle = {
  border: "1px solid #ddd",
  padding: "8px",
  textAlign: "left",
};
