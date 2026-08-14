import { adminCompanyId, jsonError, requireActiveUserFromRequest } from "@/app/api/admin/_lib";
import { mutateMaintenanceBooking } from "../_service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const access = await requireActiveUserFromRequest(request, {
    module: "service",
    requireServiceWorkspace: true,
  });
  if (access.error) return access.error;
  try {
    const body = await request.json();
    const result = await mutateMaintenanceBooking({
      operation: String(body?.operation || "").trim(),
      payload: body?.payload || {},
      actor: {
        uid: access.verifiedUser.uid,
        email: access.verifiedUser.email || access.userData.email || "",
        role: access.userData.role || "user",
      },
      companyId: adminCompanyId(access.userData),
    });
    return Response.json(result);
  } catch (error) {
    console.error("Maintenance mutation failed:", error);
    return jsonError(error instanceof Error ? error.message : "Maintenance mutation failed.", error?.status || 400);
  }
}
