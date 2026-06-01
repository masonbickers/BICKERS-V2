import {
  jsonError,
  requireAdminFromRequest,
  updateFirestoreDocument,
} from "../../_lib";
import { adminCreateDocument, adminPatchDocument } from "../../../_firebaseAdminRest";

const ALLOWED_ROLES = new Set(["user", "manager", "admin"]);

function cleanUserId(value) {
  return String(value || "").trim();
}

function auditPayload({ action, actor, targetUserId, details = {} }) {
  const nowIso = new Date().toISOString();
  return {
    action,
    area: "Access",
    actorEmail: actor.email || "",
    actorUid: actor.uid || "",
    targetUserId,
    details,
    createdAt: nowIso,
  };
}

async function writeAuditLog(idToken, payload) {
  try {
    await adminCreateDocument("adminAuditLogs", payload);
  } catch (error) {
    console.error("Admin audit log failed:", error);
  }
}

export async function PATCH(req, context) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;

    const params = await context.params;
    const targetUserId = cleanUserId(params?.userId);
    if (!targetUserId || targetUserId.includes("/")) {
      return jsonError("Invalid user id.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const nowIso = new Date().toISOString();

    if (action === "setRole") {
      const role = String(body?.role || "").trim().toLowerCase();
      if (!ALLOWED_ROLES.has(role)) return jsonError("Invalid role.", 400);

      await updateFirestoreDocument(
        "users",
        targetUserId,
        {
          role,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "admin",
          updatedByUid: admin.verifiedUser.uid,
        },
        admin.idToken
      );
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: "Set user role",
          actor: admin.verifiedUser,
          targetUserId,
          details: { role },
        })
      );
      return Response.json({ ok: true });
    }

    if (action === "setEnabled") {
      const isEnabled = body?.isEnabled;
      if (typeof isEnabled !== "boolean") return jsonError("Invalid enabled value.", 400);

      await updateFirestoreDocument(
        "users",
        targetUserId,
        {
          isEnabled,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "admin",
          updatedByUid: admin.verifiedUser.uid,
        },
        admin.idToken
      );
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: isEnabled ? "Enabled user" : "Disabled user",
          actor: admin.verifiedUser,
          targetUserId,
          details: { isEnabled },
        })
      );
      return Response.json({ ok: true });
    }

    if (action === "resetMfa") {
      await Promise.all([
        updateFirestoreDocument(
          "users",
          targetUserId,
          {
            mfaEnabled: false,
            mfaMethod: "",
            mfaResetRequired: true,
            mfaResetAt: nowIso,
            mfaResetBy: admin.verifiedUser.email || "admin",
            mfaResetByUid: admin.verifiedUser.uid,
            updatedAt: nowIso,
            updatedBy: admin.verifiedUser.email || "admin",
            updatedByUid: admin.verifiedUser.uid,
          },
          admin.idToken,
          { deleteFields: ["mfaSecret", "mfaEnrolledAt"] }
        ),
        adminPatchDocument(
          "mfaSecrets",
          targetUserId,
          {
            resetAt: nowIso,
            resetBy: admin.verifiedUser.email || "admin",
            resetByUid: admin.verifiedUser.uid,
            updatedAt: nowIso,
          },
          { deleteFields: ["secret", "pendingSecret", "pendingCreatedAt", "enrolledAt"] }
        ),
      ]);
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: "Reset user MFA",
          actor: admin.verifiedUser,
          targetUserId,
        })
      );
      return Response.json({ ok: true });
    }

    return jsonError("Unknown admin action.", 400);
  } catch (error) {
    console.error("Admin user action failed:", error);
    return jsonError(error?.message || "Admin action failed.", 500);
  }
}
