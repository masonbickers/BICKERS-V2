"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "@/firebaseConfig";
import { doc, onSnapshot, deleteDoc, collection, getDocs } from "firebase/firestore";

// helpers
const fmtDate = (d) => new Date(d).toDateString();
const formatCrew = (employees) => {
  if (!Array.isArray(employees) || employees.length === 0) return "—";
  return employees
    .map((emp) => {
      if (typeof emp === "string") return emp;
      if (!emp || typeof emp !== "object") return "";
      return (
        emp.name?.toString().trim() ||
        [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim() ||
        emp.displayName?.toString().trim() ||
        emp.email?.toString().trim() ||
        ""
      );
    })
    .filter(Boolean)
    .join(", ");
};

export default function ViewBookingPage() {
  const { id } = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);

  // live booking
  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "bookings", id);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setBooking({ id: snap.id, ...snap.data() });
      else {
        alert("Booking not found");
        router.push("/dashboard");
      }
    });
    return () => unsub();
  }, [id, router]);

  // load vehicles (for registration lookups)
  useEffect(() => {
    const loadVehicles = async () => {
      const snapshot = await getDocs(collection(db, "vehicles"));
      setAllVehicles(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };
    loadVehicles();
  }, []);

  if (!booking) return <p style={{ padding: 24 }}>Loading…</p>;

  const {
    jobNumber,
    client,
    contactEmail,
    contactNumber,
    location,
    status,
    employees,
    vehicles = [],
    equipment = [],
    notes,
    notesByDate = {},
    bookingDates,
    startDate,
    endDate,
    date,
    hasHS,
    hasRiskAssessment,
    hasHotel,
    hasRiggingAddress,
    riggingAddress,
    callTime,
    shootType,
    isCrewed,
  } = booking;

  const datesDisplay = Array.isArray(bookingDates) && bookingDates.length
    ? bookingDates.join(", ")
    : (startDate && endDate)
      ? `${fmtDate(startDate)} → ${fmtDate(endDate)}`
      : date
        ? fmtDate(date)
        : "Not set";

  return (
    <div style={{
      maxWidth: 900, margin: "40px auto", padding: 20,
      color: "#111", background: "#fff", borderRadius: 8,
      boxShadow: "0 2px 12px rgba(0,0,0,.08)", fontFamily: "Arial, sans-serif"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Booking {jobNumber}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={pill}>{shootType || "Day"}</span>
          <span style={{ ...pill, background: "#eee", color: "#111" }}>{status || "Confirmed"}</span>
          {isCrewed ? <span style={{ ...pill, background: "#4caf50", color: "#fff" }}>CREWED</span> : null}
        </div>
      </div>

      {/* Badges row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ ...pill, background: hasHS ? "#4caf50" : "#f44336", color: "#fff" }}>HS {hasHS ? "✓" : "✗"}</span>
        <span style={{ ...pill, background: hasRiskAssessment ? "#4caf50" : "#f44336", color: "#fff" }}>RA {hasRiskAssessment ? "✓" : "✗"}</span>
        <span style={{ ...pill, background: hasHotel ? "#4caf50" : "#f44336", color: "#fff" }}>Hotel {hasHotel ? "✓" : "✗"}</span>
        <span title={hasRiggingAddress ? (riggingAddress || "") : ""} style={{ ...pill, background: hasRiggingAddress ? "#4caf50" : "#f44336", color: "#fff" }}>
          Rigging {hasRiggingAddress ? "✓" : "✗"}
        </span>
        {callTime ? <span style={{ ...pill, background: "#111", color: "#fff" }}>Call {callTime}</span> : null}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <Row label="Production" value={client || "—"} />
          <Row label="Email" value={contactEmail || "—"} />
          <Row label="Mobile" value={contactNumber || "—"} />
          <Row label="Location" value={location || "—"} />
          <Row label="Date(s)" value={datesDisplay} />
          <Row label="Crew" value={formatCrew(employees)} />
          <Row
            label="Vehicles"
            value={
              vehicles.length
                ? vehicles.map((v, i) => {
                    const name = (typeof v === "string" ? v : (v?.name || "")).trim();
                    const reg  =
                      (typeof v === "object" && v?.registration) ||
                      allVehicles.find(x => x.name?.trim() === name)?.registration;
                    return <div key={i}>{name}{reg ? ` – ${String(reg).toUpperCase()}` : ""}</div>;
                  })
                : "—"
            }
          />
          <Row label="Equipment" value={equipment.length ? equipment.join(", ") : "—"} />
          <Row label="Notes" value={notes || "—"} />
        </tbody>
      </table>

      {/* Per-day notes */}
      {!!notesByDate && Object.keys(notesByDate).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "16px 0 8px" }}>Day Notes</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {Object.entries(notesByDate)
              .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k)) // only real dates
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([d, note]) => (
                <div key={d} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, background: "#fafafa" }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{d}</div>
                  <div style={{ fontSize: 14 }}>{note || "—"}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ textAlign: "center", marginTop: 24, display: "flex", justifyContent: "center", gap: 12 }}>
        <button onClick={() => router.push(`/edit-booking/${booking.id || id}`)} style={btn("#1976d2")}>Edit Booking</button>
        <button
          onClick={async () => {
            if (!confirm("Delete this booking?")) return;
            await deleteDoc(doc(db, "bookings", booking.id || id));
            alert("Booking deleted");
            router.push("/dashboard");
          }}
          style={btn("#d32f2f")}
        >
          Delete Booking
        </button>
        <button onClick={() => router.back()} style={btn("#555")}>Back</button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <tr>
      <td style={cell}><strong>{label}</strong></td>
      <td style={cell}>{value}</td>
    </tr>
  );
}

const pill = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
};

const cell = {
  padding: "10px 8px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};

const btn = (bg) => ({
  padding: "10px 16px",
  backgroundColor: bg,
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
});
