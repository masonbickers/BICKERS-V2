import { notFound } from "next/navigation";
import ActivityTrackingHarness from "./ActivityTrackingHarness";

export const dynamic = "force-dynamic";

export default function ActivityTrackingE2EPage() {
  if (process.env.NODE_ENV === "production" || process.env.MAINTENANCE_E2E_HARNESS !== "1") notFound();
  return (
    <main style={{ padding: 24, background: "#f5f5f5", minHeight: "100vh" }}>
      <ActivityTrackingHarness />
    </main>
  );
}
