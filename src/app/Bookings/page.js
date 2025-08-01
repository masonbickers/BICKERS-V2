"use client";

import { Suspense } from "react";
import BookingPage from "./BookingPage"; // adjust path if it's in a different folder

export default function BookingsWrapperPage() {
  return (
    <Suspense fallback={<div>Loading booking...</div>}>
      <BookingPage />
    </Suspense>
  );
}
