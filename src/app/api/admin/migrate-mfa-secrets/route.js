import { adminCreateDocument, adminListDocuments, adminPatchDocument } from "../../_firebaseAdminRest";
import { jsonError, requireAdminFromRequest } from "../_lib";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;

    const users = await adminListDocuments("users");
    const nowIso = new Date().toISOString();
    let migrated = 0;

    for (const user of users) {
      const legacySecret = String(user.data?.mfaSecret || "").trim();
      if (!user.id || !legacySecret) continue;

      await adminPatchDocument("mfaSecrets", user.id, {
        secret: legacySecret,
        enrolledAt: user.data?.mfaEnrolledAt || nowIso,
        migratedAt: nowIso,
        updatedAt: nowIso,
        userEmail: user.data?.email || "",
      });

      await adminPatchDocument(
        "users",
        user.id,
        {
          mfaEnabled: true,
          mfaMethod: "totp",
          updatedAt: nowIso,
        },
        { deleteFields: ["mfaSecret"] }
      );

      migrated += 1;
    }

    await adminCreateDocument("adminAuditLogs", {
      action: "Migrated MFA secrets",
      area: "Access",
      actorEmail: admin.verifiedUser.email || "",
      actorUid: admin.verifiedUser.uid || "",
      targetUserId: "",
      details: { migrated },
      createdAt: nowIso,
    });

    return Response.json({ ok: true, migrated });
  } catch (error) {
    console.error("MFA secret migration failed:", error);
    return jsonError(error?.message || "MFA secret migration failed.", 500);
  }
}
