
import layoutStyles from "./page.styles.module.css";import { notFound } from "next/navigation";
import ActivityTrackingHarness from "./ActivityTrackingHarness";

export const dynamic = "force-dynamic";

export default function ActivityTrackingE2EPage() {
  if (process.env.NODE_ENV === "production" || process.env.MAINTENANCE_E2E_HARNESS !== "1") notFound();
  return (
    <main className={layoutStyles.extracted1}>
      <ActivityTrackingHarness />
    </main>
  );
}
