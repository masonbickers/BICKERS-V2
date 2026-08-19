import { adminPatchDocument, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { jsonError, requireAdminFromRequest } from "@/app/api/admin/_lib";
import { normalizeAlertRecipients } from "@/app/utils/maintenanceAlerts";

export const runtime = "nodejs";

export async function GET(request) {
  const admin = await requireAdminFromRequest(request);
  if (admin.error) return admin.error;
  const settings = await adminReadDocument("settings", "maintenanceNotifications").catch(() => null);
  return Response.json({
    settings: {
      enabled: settings?.enabled !== false,
      warningRecipients: normalizeAlertRecipients(settings?.warningRecipients),
      immediateVorRecipients: normalizeAlertRecipients(settings?.immediateVorRecipients),
      digestRecipients: normalizeAlertRecipients(settings?.digestRecipients),
    },
  });
}
export async function PATCH(request) {
  try {
    const admin = await requireAdminFromRequest(request);
    if (admin.error) return admin.error;
    const body = await request.json();
    const settings = {
      enabled: body?.enabled !== false,
      warningRecipients: normalizeAlertRecipients(body?.warningRecipients),
      immediateVorRecipients: normalizeAlertRecipients(body?.immediateVorRecipients),
      digestRecipients: normalizeAlertRecipients(body?.digestRecipients),
      updatedAt: new Date().toISOString(),
      updatedBy: {
        uid: admin.verifiedUser.uid,
        email: admin.verifiedUser.email || "",
      },
    };
    await adminPatchDocument("settings", "maintenanceNotifications", settings);
    return Response.json({ settings });
  } catch (error) {
    console.error("Maintenance notification settings update failed:", error);
    return jsonError("Could not save maintenance notification settings.", 500);
  }
}
