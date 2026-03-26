"use client";

import React from "react";
import { useRouter } from "next/navigation";
import HeaderSidebarLayout from "@/app/components/HeaderSidebarLayout";


export default function CreateBookingPage() {
  const router = useRouter();

  const bookingOptions = [
    {
      title: "Create Booking",
      description: "Schedule a new booking including crew, vehicles and location.",
      link: "/create-booking"
    },
    {
      title: "Recce Booking",
      description: "Book a recce to inspect locations before a shoot using the main booking form.",
      link: "/create-booking"
    },
    {
      title: "Stunt Booking",
      description: "Schedule a stunt-specific booking using the main booking form.",
      link: "/create-booking"
    }
  ];

  return (
    <HeaderSidebarLayout>
      <div
        style={{
          backgroundColor: "#f4f4f5",
          color: "#333",
          fontFamily: "Arial, sans-serif",
          padding: "24px 20px 32px",
        }}
      >
        <main style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>Booking Options</h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
              alignItems: "stretch",
            }}
          >
          {bookingOptions.map((item, idx) => (
            <div key={idx} style={cardStyle} onClick={() => router.push(item.link)}>
              <h2 style={{ marginBottom: 10 }}>{item.title}</h2>
              <p>{item.description}</p>
            </div>
          ))}
          </div>
        </main>
      </div>
    </HeaderSidebarLayout>
  );
}

const navButton = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid #333"
};

const cardStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  cursor: "pointer",
  transition: "transform 0.2s ease",
  height: "100%",
};
