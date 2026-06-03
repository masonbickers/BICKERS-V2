import { jsonError } from "@/app/api/admin/_lib";
import { cleanId, jsonOk, requirePlatformAdmin, writePlatformAudit } from "../_lib";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const admin = await requirePlatformAdmin(req);
    if (admin.error) return admin.error;

    const body = await req.json().catch(() => ({}));
    const action = cleanId(body.action);
    if (!action) return jsonError("Audit action is required.", 400);

    await writePlatformAudit(req, admin.verifiedUser, {
      action,
      targetType: cleanId(body.targetType) || "platform",
      targetId: cleanId(body.targetId),
      companyId: cleanId(body.companyId),
      before: body.before || null,
      after: body.after || null,
      details: body.details && typeof body.details === "object" ? body.details : {},
    });

    return jsonOk();
  } catch (error) {
    console.error("[platform/audit-log] failed:", error);
    return jsonError(error?.message || "Could not write audit log.", 500);
  }
}
