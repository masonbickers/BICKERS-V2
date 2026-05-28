"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot } from "firebase/firestore";
import { LayoutDashboard, Plus, Search, FileText, PencilLine } from "lucide-react";
import { db } from "../../../firebaseConfig";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";
import ViewBookingModal from "../components/ViewBookingModal";

const UI = {
  bg: "#f3f6f9",
  card: "#ffffff",
  text: "#0f172a",
  muted: "#5f6f82",
  border: "1px solid #d7dee8",
  radius: 8,
  shadow: "0 1px 2px rgba(15,23,42,0.05)",
  brand: "#1f4b7a",
  brandSoft: "#edf3f8",
  brandBorder: "#c8d6e3",
};

const pageWrap = {
  padding: "16px 16px 32px",
  background: UI.bg,
  minHeight: "100vh",
};

const card = {
  background: UI.card,
  border: UI.border,
  borderRadius: UI.radius,
  boxShadow: UI.shadow,
  padding: 12,
};

const pageHeader = {
  ...card,
  marginBottom: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const btn = (kind = "ghost") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 11px",
  borderRadius: UI.radius,
  border: kind === "primary" ? `1px solid ${UI.brand}` : `1px solid ${UI.brandBorder}`,
  background: kind === "primary" ? UI.brand : "#fff",
  color: kind === "primary" ? "#fff" : UI.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: kind === "primary" ? "0 8px 18px rgba(31,75,122,0.16)" : UI.shadow,
});

const h1Style = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.08,
  fontWeight: 900,
  color: UI.text,
};

const pageSub = {
  marginTop: 6,
  color: UI.muted,
  fontSize: 13.5,
  lineHeight: 1.45,
};

const searchBox = {
  ...card,
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const input = {
  width: "100%",
  border: "none",
  outline: "none",
  fontSize: 14,
  color: UI.text,
  background: "transparent",
};

const row = {
  border: UI.border,
  borderRadius: UI.radius,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  background: "#fff",
  boxShadow: UI.shadow,
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "3px 8px",
  background: UI.brandSoft,
  border: `1px solid ${UI.brandBorder}`,
  color: UI.brand,
  fontSize: 11,
  fontWeight: 900,
};

const fmtDate = (value) => {
  if (!value) return "-";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const enquiryDateText = (booking) => {
  if (Array.isArray(booking.bookingDates) && booking.bookingDates.length) {
    return booking.bookingDates.map(fmtDate).join(", ");
  }
  if (booking.startDate && booking.endDate) return `${fmtDate(booking.startDate)} to ${fmtDate(booking.endDate)}`;
  return fmtDate(booking.startDate || booking.date);
};

export default function EnquiryPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snap) => {
      setBookings(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    return () => unsub();
  }, []);

  const enquiries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings
      .filter((booking) => String(booking.status || "").trim().toLowerCase() === "enquiry")
      .filter((booking) => {
        if (!q) return true;
        return [booking.jobNumber, booking.client, booking.location, booking.contactEmail, booking.contactNumber]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const au = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(a.updatedAt || a.createdAt || 0);
        const bu = b.updatedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(b.updatedAt || b.createdAt || 0);
        return bu.getTime() - au.getTime();
      });
  }, [bookings, search]);

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) || null,
    [bookings, selectedBookingId]
  );

  return (
    <HeaderSidebarLayout>
      <div style={pageWrap}>
        <div style={pageHeader}>
          <div>
            <h1 style={h1Style}>Enquiries</h1>
            <div style={pageSub}>Saved enquiry jobs that are not shown on the calendar.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn("primary")} onClick={() => router.push("/create-booking?status=Enquiry")}>
              <Plus size={14} />
              New Enquiry
            </button>
            <button type="button" style={btn()} onClick={() => router.push("/dashboard")}>
              <LayoutDashboard size={14} />
              Dashboard
            </button>
          </div>
        </div>

        <div style={searchBox}>
          <Search size={16} color={UI.muted} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search enquiries..."
            style={input}
          />
          <span style={pill}>{enquiries.length}</span>
        </div>

        <div style={card}>
          {enquiries.length === 0 ? (
            <div style={{ color: UI.muted, fontSize: 13.5 }}>No enquiries found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {enquiries.map((booking) => (
                <div key={booking.id} style={row}>
                  <div style={{ minWidth: 260, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: UI.brandSoft,
                        border: `1px solid ${UI.brandBorder}`,
                        color: UI.brand,
                        flex: "0 0 auto",
                      }}
                    >
                      <FileText size={17} />
                    </span>
                    <div>
                      <div style={{ fontWeight: 900, color: UI.text }}>
                        {booking.jobNumber || "No Job #"} - {booking.client || "No production"}
                      </div>
                      <div style={{ color: UI.muted, fontSize: 12.5, marginTop: 3 }}>
                        {enquiryDateText(booking)} - {booking.location || "No location"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" style={btn()} onClick={() => setSelectedBookingId(booking.id)}>
                      <FileText size={14} />
                      View
                    </button>
                    <button type="button" style={btn("primary")} onClick={() => router.push(`/edit-booking/${booking.id}`)}>
                      <PencilLine size={14} />
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedBookingId && (
          <ViewBookingModal
            id={selectedBookingId}
            initialBooking={selectedBooking}
            initialVehicles={[]}
            onClose={() => setSelectedBookingId(null)}
          />
        )}
      </div>
    </HeaderSidebarLayout>
  );
}
