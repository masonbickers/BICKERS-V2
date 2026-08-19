import { requireAdminFromRequest, jsonError } from "@/app/api/admin/_lib";
import { adminListDocuments } from "@/app/api/_firebaseAdminRest";

const PRIORITY_COLLECTIONS = ["bookings"];

const SUPPORTING_COLLECTIONS = [
  "holidays",
  "notes",
  "recces",
  "maintenanceBookings",
  "maintenanceJobs",
  "vehicles",
  "deletedBookings",
  "equipment",
];

const DASHBOARD_COLLECTIONS = [...PRIORITY_COLLECTIONS, ...SUPPORTING_COLLECTIONS];

export async function GET(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin.error;

  try {
    const scope = new URL(req.url).searchParams.get("scope") || "all";
    const collectionNames =
      scope === "priority"
        ? PRIORITY_COLLECTIONS
        : scope === "supporting"
          ? SUPPORTING_COLLECTIONS
          : DASHBOARD_COLLECTIONS;

    const entries = await Promise.all(
      collectionNames.map(async (collectionName) => {
        const docs = await adminListDocuments(collectionName);
        return [
          collectionName,
          docs.map(({ id, data }) => ({ id, ...(data || {}) })),
        ];
      })
    );

    return Response.json({
      ok: true,
      scope,
      collections: Object.fromEntries(entries),
    });
  } catch (error) {
    console.error("[dashboard-data] admin load failed:", error);
    return jsonError("Dashboard data load failed.", 500);
  }
}
