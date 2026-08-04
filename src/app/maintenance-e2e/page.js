import { notFound } from "next/navigation";
import MaintenanceWorkflowHarness from "./MaintenanceWorkflowHarness";

export const dynamic = "force-dynamic";

export default function MaintenanceE2EPage() {
  if (process.env.NODE_ENV === "production" || process.env.MAINTENANCE_E2E_HARNESS !== "1") notFound();
  return <MaintenanceWorkflowHarness />;
}
