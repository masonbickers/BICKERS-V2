import { requireAdminFromRequest, jsonError } from "@/app/api/admin/_lib";
import { adminListDocuments } from "@/app/api/_firebaseAdminRest";

const DASHBOARD_COLLECTIONS = [
  "bookings",
  "holidays",
  "notes",
  "recces",
  "maintenanceBookings",
  "maintenanceJobs",
  "vehicles",
  "deletedBookings",
  "equipment",
];

export async function GET(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;

  try {
    const entries = await Promise.all(
      DASHBOARD_COLLECTIONS.map(async (collectionName) => {
        const docs = await adminListDocuments(collectionName);
        return [
          collectionName,
          docs.map(({ id, data }) => ({ id, ...(data || {}) })),
        ];
      })
    );

    return Response.json({
      ok: true,
      collections: Object.fromEntries(entries),
    });
  } catch (error) {
    console.error("[dashboard-data] admin load failed:", error);
    return jsonError("Dashboard data load failed.", 500);
  }
}
