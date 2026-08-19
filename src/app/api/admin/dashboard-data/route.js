import { requireActiveUserFromRequest, jsonError } from "@/app/api/admin/_lib";
import { adminListDocuments } from "@/app/api/_firebaseAdminRest";
import { BICKERS_DEPLOYMENT_DEFAULTS } from "@/app/config/deploymentConfigCore";

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
  const activeUser = await requireActiveUserFromRequest(req, { module: "diary" });
  if (activeUser.error) return activeUser.error;
  const isPlatformAdmin = activeUser.userData?.role === "platformAdmin";
  const companyId = String(activeUser.userData?.companyId || "").trim();

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
        const visibleDocs = docs.filter(({ data }) => {
          if (isPlatformAdmin) return true;
          const documentCompanyId = String(data?.companyId || "").trim();
          if (documentCompanyId) return documentCompanyId === companyId;
          return companyId === BICKERS_DEPLOYMENT_DEFAULTS.companyId;
        });
        return [
          collectionName,
          visibleDocs.map(({ id, data }) => ({ id, ...(data || {}) })),
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
