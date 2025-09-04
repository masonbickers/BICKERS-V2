"use client";
import { useEffect, useState } from "react";
import { db } from "../../../firebaseConfig";
import { doc, getDoc, getDocs, deleteDoc, collection } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function ViewBookingModal({ id, onClose }) {
  const [booking, setBooking] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);
  const router = useRouter();

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

  useEffect(() => {
    const loadVehicles = async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      const vehicles = snapshot.docs.map((doc) => doc.data());
      setAllVehicles(vehicles);
    };
    loadVehicles();
  }, []);

  const handleDelete = async () => {
    const confirmDelete = confirm("Are you sure you want to delete this booking?");
    if (!confirmDelete) return;

    await deleteDoc(doc(db, "bookings", id));
    alert("Booking deleted");
    onClose();
  };

  if (!booking) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ marginBottom: "20px" }}>Booking Details</h2>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}
        >
          <tbody>
            <Row label="Job Number" value={booking.jobNumber} />
            <Row label="Client" value={booking.client} />
            <Row label="Email" value={booking.contactEmail || "Not provided"} />
            <Row label="Mobile" value={booking.contactNumber || "Not provided"} />
            <Row label="Location" value={booking.location} />
            <Row
              label="Date(s)"
              value={
                booking.startDate && booking.endDate
                  ? `${new Date(booking.startDate).toDateString()} → ${new Date(
                      booking.endDate
                    ).toDateString()}`
                  : booking.date
                  ? new Date(booking.date).toDateString()
                  : "Not set"
              }
            />
<Row
  label="Employees"
  value={
    (booking.employees || [])
      .map(e => (typeof e === "string" ? e : `${e.role} – ${e.name}`))
      .join(", ") || "None"
  }
/>
            <tr>
              <td style={cell}>
                <strong>Vehicles</strong>
              </td>
              <td style={cell}>
                {(booking.vehicles || []).map((name, i) => {
                  const match = allVehicles.find(
                    (v) => v.name === (typeof name === "object" ? name.name : name)
                  );
                  const displayName = typeof name === "object" ? name.name : name;
                  const registration = name?.registration || match?.registration;
                  return (
                    <div key={i}>
                      {displayName}
                      {registration ? ` (${registration})` : ""}
                    </div>
                  );
                })}
              </td>
            </tr>
            <Row label="Equipment" value={(booking.equipment || []).join(", ")} />
            <Row label="Notes" value={booking.notes || "None"} />
            <Row label="Status" value={booking.status} />
          </tbody>
        </table>

        {/* 🔹 Created + Last Edited info */}
        <div style={{ marginTop: "15px", fontSize: "0.85rem", color: "#444" }}>
          {booking?.createdBy && (
            <div>
              Created by <strong>{booking.createdBy}</strong>
              {booking?.createdAt && (
                <> on {new Date(booking.createdAt).toLocaleString("en-GB")}</>
              )}
            </div>
          )}
          {booking?.lastEditedBy && (
            <div style={{ marginTop: "5px" }}>
              Last edited by <strong>{booking.lastEditedBy}</strong>
              {booking?.updatedAt && (
                <> on {new Date(booking.updatedAt).toLocaleString("en-GB")}</>
              )}
            </div>
          )}
        </div>

        <div style={buttonGroupStyle}>
          <button
            onClick={() => router.push(`/edit-booking/${id}`)}
            style={editBtnStyle}
          >
            Edit
          </button>
          <button onClick={handleDelete} style={deleteBtnStyle}>
            Delete
          </button>
          <button onClick={onClose} style={closeBtnStyle}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <tr>
      <td style={cell}>
        <strong>{label}</strong>
      </td>
      <td style={cell}>{value}</td>
    </tr>
  );
}

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
};

const modalStyle = {
  background: "#fff",
  padding: 30,
  borderRadius: 10,
  maxWidth: "700px",
  width: "90%",
  color: "#000",
  boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
};

const cell = {
  padding: "12px 8px",
  borderBottom: "1px solid #ccc",
  verticalAlign: "top",
};

const buttonGroupStyle = {
  marginTop: 30,
  display: "flex",
  justifyContent: "center",
  gap: "12px",
};

const editBtnStyle = {
  padding: "10px 20px",
  backgroundColor: "#1976d2",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};

const deleteBtnStyle = {
  padding: "10px 20px",
  backgroundColor: "#d32f2f",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};

const closeBtnStyle = {
  padding: "10px 20px",
  backgroundColor: "#777",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};
