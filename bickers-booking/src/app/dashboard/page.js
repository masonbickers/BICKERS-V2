import React, { Suspense } from "react";
import DashboardClientWrapper from "./DashboardClientWrapper";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <DashboardClientWrapper />
    </Suspense>
  );
}
