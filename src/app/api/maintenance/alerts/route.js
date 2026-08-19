import { adminListDocuments } from "@/app/api/_firebaseAdminRest";
import { filterDocsForAdminCompany, jsonError, requireActiveUserFromRequest } from "@/app/api/admin/_lib";
import {
  buildMaintenanceScheduleExceptionAlert,
  buildMaintenanceWarningAlerts,
} from "@/app/utils/maintenanceAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const access = await requireActiveUserFromRequest(request, { module: "maintenance" });
    if (access.error) return access.error;
    const [documents, vehicleDocuments, bookingDocuments] = await Promise.all([
      adminListDocuments("maintenanceAlerts"),
      adminListDocuments("vehicles"),
      adminListDocuments("maintenanceBookings"),
    ]);
    const storedRows = filterDocsForAdminCompany(documents, access.userData)
      .map((document) => ({ id: document.id, ...(document.data || {}) }))
      .filter((alert) => alert.state === "open");
    const evaluatedAt = new Date().toISOString();
    const liveDueRows = filterDocsForAdminCompany(vehicleDocuments, access.userData).flatMap(
      (document) => buildMaintenanceWarningAlerts(
        { id: document.id, ...(document.data || {}) },
        { asOfDate: new Date(), evaluatedAt }
      )
    );
    const liveScheduleRows = filterDocsForAdminCompany(bookingDocuments, access.userData)
      .map((document) => buildMaintenanceScheduleExceptionAlert(
        { id: document.id, ...(document.data || {}) },
        { evaluatedAt }
      ))
      .filter(Boolean);
    const rows = [...storedRows, ...liveDueRows, ...liveScheduleRows]
      .reduce((byId, alert) => byId.set(alert.id, alert), new Map())
      .values();
    const sortedRows = [...rows].sort((left, right) =>
      String(right.detectedAt || "").localeCompare(String(left.detectedAt || ""))
    );
    return Response.json({ alerts: sortedRows, count: sortedRows.length });
  } catch (error) {
    console.error("Maintenance alerts read failed:", error);
    return jsonError("Could not load maintenance alerts.", 500);
  }
}
