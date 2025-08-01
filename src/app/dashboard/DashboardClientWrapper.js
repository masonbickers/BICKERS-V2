"use client";

import { useSearchParams } from "next/navigation";
import DashboardPage from "./DashboardPageImpl";

export default function DashboardClientWrapper() {
  const searchParams = useSearchParams();
  const bookingSaved = searchParams.get("success") === "true";

  return <DashboardPage bookingSaved={bookingSaved} />;
}
