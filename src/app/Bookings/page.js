"use client";
import { useSearchParams } from "next/navigation";

export default function BookingPage() {
  const searchParams = useSearchParams();
  const date = searchParams.get("date");

  return (
    <div style={{ padding: 40 }}>
      <h1>📅 Booking for: {date}</h1>
      <p>This is where you can show or add booking details.</p>
    </div>
  );
}
