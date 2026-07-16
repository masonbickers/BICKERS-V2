"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardPage from "../dashboard/DashboardPageImpl";

function UCraneDashboard() {
  const searchParams = useSearchParams();
  const bookingSaved =
    searchParams.get("success") === "true" || searchParams.get("saved") === "true";
  const initialDate = searchParams.get("date") || "";
  const initialView = searchParams.get("view") || "week";

  return (
    <DashboardPage
      mode="u-crane"
      bookingSaved={bookingSaved}
      initialDate={initialDate}
      initialView={initialView}
    />
  );
}

export default function UCranePage() {
  return (
    <Suspense fallback={null}>
      <UCraneDashboard />
    </Suspense>
  );
}
