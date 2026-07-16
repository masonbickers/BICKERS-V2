"use client";

import layoutStyles from "./page.styles.module.css";
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
        className={layoutStyles.extracted1}
      >
        <main className={layoutStyles.extracted2}>
          <h1 className={layoutStyles.extracted3}>Booking Options</h1>

          <div
            className={layoutStyles.extracted4}
          >
          {bookingOptions.map((item, idx) => (
            <div key={idx} className={layoutStyles.extracted5} onClick={() => router.push(item.link)}>
              <h2 className={layoutStyles.extracted6}>{item.title}</h2>
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
  color: "var(--color-white)",
  border: "none",
  fontSize: 16,
  padding: "10px 0",
  textAlign: "left",
  cursor: "pointer",
  borderBottom: "1px solid var(--color-text)"
};

const cardStyle = {
  backgroundColor: "var(--color-surface)",
  padding: "20px",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  cursor: "pointer",
  transition: "transform 0.2s ease",
  height: "100%",
};
