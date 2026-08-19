import {
  adminCreateDocument,
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import {
  canAccessCompany,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";
import { normalizeActivitySettings, normalizeWorkSchedule } from "@/app/utils/activityTracking";

export async function GET(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;
    const url = new URL(req.url);
    const companyId = String(url.searchParams.get("companyId") || admin.userData?.companyId || "").trim();
    if (!canAccessCompany(admin.userData, companyId)) return jsonError("Company access denied.", 403);
    const settings = normalizeActivitySettings((await adminReadDocument("activityTrackingSettings", companyId)) || {});
    return Response.json({ ok: true, companyId, settings });
  } catch (error) {
    console.error("Activity settings load failed:", error);
    return jsonError(error?.message || "Activity settings could not be loaded.", 500);
  }
}

export async function PUT(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;
    const body = await req.json().catch(() => ({}));
    const companyId = String(body?.companyId || admin.userData?.companyId || "").trim();
    if (!canAccessCompany(admin.userData, companyId)) return jsonError("Company access denied.", 403);
    const now = new Date().toISOString();

    if (body?.employeeId) {
      const employeeId = String(body.employeeId).trim();
      const employee = await adminReadDocument("employees", employeeId);
      if (!employee || !canAccessCompany(admin.userData, employee.companyId)) return jsonError("Employee access denied.", 403);
      const workSchedule = normalizeWorkSchedule(body.workSchedule || {});
      await adminPatchDocument("employees", employeeId, { workSchedule, updatedAt: now });
      await adminCreateDocument("adminAuditLogs", {
        companyId: employee.companyId, actorUid: admin.verifiedUser.uid, actorEmail: admin.verifiedUser.email || "",
        action: "employeeWorkScheduleUpdated", area: "activity", targetId: employeeId, createdAt: now,
      });
      return Response.json({ ok: true, workSchedule });
    }

    const settings = normalizeActivitySettings(body?.settings || {});
    await adminPatchDocument("activityTrackingSettings", companyId, {
      ...settings,
      companyId,
      updatedAt: now,
      updatedByUid: admin.verifiedUser.uid,
      updatedByEmail: admin.verifiedUser.email || "",
    });
    await adminCreateDocument("adminAuditLogs", {
      companyId, actorUid: admin.verifiedUser.uid, actorEmail: admin.verifiedUser.email || "",
      action: "activityTrackingSettingsUpdated", area: "activity", targetId: companyId, createdAt: now,
    });
    return Response.json({ ok: true, settings });
  } catch (error) {
    console.error("Activity settings update failed:", error);
    return jsonError(error?.message || "Activity settings could not be saved.", 500);
  }
}
