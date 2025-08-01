// components/ViewBookingModal.jsx
"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebaseConfig";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function ViewBookingModal({ id, onClose }) {
  const [booking, setBooking] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const fetchBooking = async () => {
      const ref = doc(db, "bookings", id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setBooking(snap.data());
      } else {
        alert("Booking not found");
        onClose();
      }
    };
    if (id) fetchBooking();
  }, [id]);

  if (!id || !booking) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.6)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10000,
    }}>
      <div style={{
        background: "#111",
        color: "#fff",
        padding: "30px",
        borderRadius: "12px",
        width: "90%",
        maxWidth: "900px",
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        <h2>Booking Details</h2>
        <table style={{ width: "100%", marginTop: "20px" }}>
          <tbody>
            <tr><td style={cell}><strong>Job Number</strong></td><td style={cell}>{booking.jobNumber}</td></tr>
            <tr><td style={cell}><strong>Client</strong></td><td style={cell}>{booking.client}</td></tr>
            <tr><td style={cell}><strong>Location</strong></td><td style={cell}>{booking.location}</td></tr>
            <tr><td style={cell}><strong>Start</strong></td><td style={cell}>{new Date(booking.startDate).toDateString()}</td></tr>
            <tr><td style={cell}><strong>End</strong></td><td style={cell}>{new Date(booking.endDate).toDateString()}</td></tr>
            <tr><td style={cell}><strong>Status</strong></td><td style={cell}>{booking.status}</td></tr>
          </tbody>
        </table>

        <div style={{ marginTop: "20px", textAlign: "right" }}>
          <button onClick={onClose} style={{ padding: "10px 16px", background: "#333", color: "#fff", borderRadius: "6px", border: "none", marginRight: "8px" }}>
            Close
          </button>
          <button onClick={() => router.push(`/edit-booking/${id}`)} style={{ padding: "10px 16px", background: "#1976d2", color: "#fff", borderRadius: "6px", border: "none" }}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

const cell = {
  padding: "8px 10px",
  borderBottom: "1px solid #333",
};
