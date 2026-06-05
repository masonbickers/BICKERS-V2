import { Suspense } from "react";
import DashboardClientWrapper from "./DashboardClientWrapper";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DashboardClientWrapper />
    </Suspense>
  );
}
