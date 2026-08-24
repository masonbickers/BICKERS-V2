"use client";

import { useSearchParams } from "next/navigation";
import DashboardPage from "./DashboardPageImpl";

export default function DashboardClientWrapper() {
  const searchParams = useSearchParams();
  const bookingSaved =
    searchParams.get("success") === "true" || searchParams.get("saved") === "true";
  const initialDate = searchParams.get("date") || "";
  const initialView = searchParams.get("view") || "week";
  const initialBookingId = searchParams.get("booking") || "";

  return (
    <DashboardPage
      bookingSaved={bookingSaved}
      initialDate={initialDate}
      initialView={initialView}
      initialBookingId={initialBookingId}
    />
  );
}
