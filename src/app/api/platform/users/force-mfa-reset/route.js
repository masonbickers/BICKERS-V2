import { adminPatchDocument, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { jsonError } from "@/app/api/admin/_lib";
import { cleanId, jsonOk, requirePlatformAdmin, writePlatformAudit } from "../../_lib";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const admin = await requirePlatformAdmin(req);
    if (admin.error) return admin.error;

    const body = await req.json().catch(() => ({}));
    const uid = cleanId(body.uid || body.userId);
    if (!uid || uid.includes("/")) return jsonError("Valid uid is required.", 400);

    const before = await adminReadDocument("users", uid);
    if (!before) return jsonError("User not found.", 404);

    const nowIso = new Date().toISOString();
    const userPatch = {
      mfaEnabled: false,
      mfaMethod: "",
      mfaResetRequired: true,
      mfaResetAt: nowIso,
      mfaResetBy: admin.verifiedUser.email || "platform-admin",
      mfaResetByUid: admin.verifiedUser.uid,
      updatedAt: nowIso,
      updatedBy: admin.verifiedUser.email || "platform-admin",
      updatedByUid: admin.verifiedUser.uid,
    };

    await Promise.all([
      adminPatchDocument("users", uid, userPatch, { deleteFields: ["mfaSecret", "mfaEnrolledAt"] }),
      adminPatchDocument(
        "mfaSecrets",
        uid,
        {
          resetAt: nowIso,
          resetBy: admin.verifiedUser.email || "platform-admin",
          resetByUid: admin.verifiedUser.uid,
          updatedAt: nowIso,
        },
        { deleteFields: ["secret", "pendingSecret", "pendingCreatedAt", "enrolledAt"] }
      ),
    ]);

    const after = { ...before, ...userPatch };
    await writePlatformAudit(req, admin.verifiedUser, {
      action: "Forced user MFA reset",
      targetType: "user",
      targetId: uid,
      before,
      after,
    });

    return jsonOk({ user: after });
  } catch (error) {
    console.error("[platform/users/force-mfa-reset] failed:", error);
    return jsonError(error?.message || "Could not force MFA reset.", 500);
  }
}
