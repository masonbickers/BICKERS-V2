"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../firebaseConfig";
import { doc, getDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

export default function ViewBookingPage() {
  const { id } = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);

  // Load booking
  useEffect(() => {
    const fetchBooking = async () => {
      const ref = doc(db, "bookings", id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setBooking(snap.data());
      } else {
        alert("Booking not found");
      }
    };
    fetchBooking();
  }, [id]);

  // Load all vehicles
  useEffect(() => {
    const loadVehicles = async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      const vehicles = snapshot.docs.map((doc) => doc.data());
      setAllVehicles(vehicles);
    };
    loadVehicles();
  }, []);

  if (!booking) return <p>Loading...</p>;

  return (
    <div style={{ maxWidth: "800px", margin: "40px auto", padding: "20px", color: "#fff", background: "#111", borderRadius: "8px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ textAlign: "center", marginBottom: "30px" }}>Booking Details</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr><td style={cell}><strong>Job Number</strong></td><td style={cell}>{booking.jobNumber}</td></tr>
          <tr><td style={cell}><strong>Client</strong></td><td style={cell}>{booking.client}</td></tr>
          <tr><td style={cell}><strong>Email</strong></td><td style={cell}>{booking.contactEmail || "Not provided"}</td></tr>
          <tr><td style={cell}><strong>Mobile</strong></td><td style={cell}>{booking.contactNumber || "Not provided"}</td></tr>
          <tr><td style={cell}><strong>Location</strong></td><td style={cell}>{booking.location}</td></tr>
          <tr>
            <td style={cell}><strong>Date(s)</strong></td>
            <td style={cell}>
              {booking.startDate && booking.endDate
                ? `${new Date(booking.startDate).toDateString()} → ${new Date(booking.endDate).toDateString()}`
                : booking.date
                  ? new Date(booking.date).toDateString()
                  : "Not set"}
            </td>
          </tr>
          <tr><td style={cell}><strong>Employees</strong></td><td style={cell}>{(booking.employees || []).join(", ")}</td></tr>
          <tr>
            <td style={cell}><strong>Vehicles</strong></td>
            <td style={cell}>
              {(booking.vehicles || []).map((name, i) => {
                const match = allVehicles.find(v => v.name === (typeof name === "object" ? name.name : name));
                const displayName = typeof name === "object" ? name.name : name;
                const registration = name?.registration || match?.registration;
                return (
                  <div key={i}>
                    {displayName}{registration ? ` (${registration})` : ""}
                  </div>
                );
              })}
            </td>
          </tr>
          <tr><td style={cell}><strong>Equipment</strong></td><td style={cell}>{(booking.equipment || []).join(", ")}</td></tr>
          <tr><td style={cell}><strong>Notes</strong></td><td style={cell}>{booking.notes || "None"}</td></tr>
          <tr><td style={cell}><strong>Status</strong></td><td style={cell}>{booking.status}</td></tr>
        </tbody>
      </table>

      <div style={{ textAlign: "center", marginTop: "30px", display: "flex", justifyContent: "center", gap: "12px" }}>
        <button
          onClick={() => router.push(`/edit-booking/${id}`)}
          style={buttonStyle("#1976d2")}
        >
          Edit Booking
        </button>

        <button
          onClick={async () => {
            const confirmDelete = confirm("Are you sure you want to delete this booking?");
            if (confirmDelete) {
              await deleteDoc(doc(db, "bookings", id));
              alert("Booking deleted");
              router.push("/dashboard");
            }
          }}
          style={buttonStyle("#d32f2f")}
        >
          Delete Booking
        </button>

        <button
          onClick={() => router.back()}

          style={buttonStyle("#555")}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const cell = {
  padding: "12px 8px",
  borderBottom: "1px solid #444",
};

const buttonStyle = (bg) => ({
  padding: "10px 20px",
  backgroundColor: bg,
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer"
});
