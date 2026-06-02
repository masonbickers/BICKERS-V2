import {
  jsonError,
  requireAdminFromRequest,
  updateFirestoreDocument,
} from "../../_lib";
import {
  adminCreateDocument,
  adminDeleteDocument,
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
} from "../../../_firebaseAdminRest";

const ALLOWED_ROLES = new Set(["user", "manager", "admin"]);
const ALLOWED_WORKSPACES = new Set(["user", "service"]);
const ADMIN_EMAILS = new Set(["mason@bickers.co.uk"]);

function cleanUserId(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
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

    if (action === "setAccess") {
      const appAccess = body?.appAccess && typeof body.appAccess === "object" ? body.appAccess : {};
      const userAccess = appAccess.user === true;
      const serviceAccess = appAccess.service === true;
      const defaultWorkspace = String(body?.defaultWorkspace || "").trim().toLowerCase();

      if (!userAccess && !serviceAccess) {
        return jsonError("At least one workspace must remain enabled.", 400);
      }
      if (!ALLOWED_WORKSPACES.has(defaultWorkspace)) {
        return jsonError("Invalid default workspace.", 400);
      }
      if (defaultWorkspace === "user" && !userAccess) {
        return jsonError("Default workspace must be enabled.", 400);
      }
      if (defaultWorkspace === "service" && !serviceAccess) {
        return jsonError("Default workspace must be enabled.", 400);
      }

      await updateFirestoreDocument(
        "users",
        targetUserId,
        {
          appAccess: { user: userAccess, service: serviceAccess },
          defaultWorkspace,
          isService: serviceAccess,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "admin",
          updatedByUid: admin.verifiedUser.uid,
        },
        admin.idToken
      );
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: "Set user access",
          actor: admin.verifiedUser,
          targetUserId,
          details: {
            appAccess: { user: userAccess, service: serviceAccess },
            defaultWorkspace,
          },
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

    if (action === "resetAccount") {
      const targetUser = await adminReadDocument("users", targetUserId);
      const uidCandidates = new Set(
        [targetUserId, targetUser?.uid].map(cleanUserId).filter(Boolean)
      );
      const passkeys = await adminListDocuments("passkeyCredentials");
      const targetPasskeys = passkeys.filter(({ data }) => uidCandidates.has(cleanUserId(data?.uid)));

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
            passkeyEnabled: false,
            accountResetRequired: true,
            accountResetAt: nowIso,
            accountResetBy: admin.verifiedUser.email || "admin",
            accountResetByUid: admin.verifiedUser.uid,
            updatedAt: nowIso,
            updatedBy: admin.verifiedUser.email || "admin",
            updatedByUid: admin.verifiedUser.uid,
          },
          admin.idToken,
          { deleteFields: ["mfaSecret", "mfaEnrolledAt", "passkeyRegisteredAt"] }
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
        ...targetPasskeys.map(({ id }) => adminDeleteDocument("passkeyCredentials", id)),
        ...[...uidCandidates].map((uid) => adminDeleteDocument("passkeyChallenges", uid)),
      ]);
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: "Reset user account security",
          actor: admin.verifiedUser,
          targetUserId,
          details: { deletedPasskeys: targetPasskeys.length },
        })
      );
      return Response.json({ ok: true, deletedPasskeys: targetPasskeys.length });
    }

    return jsonError("Unknown admin action.", 400);
  } catch (error) {
    console.error("Admin user action failed:", error);
    return jsonError(error?.message || "Admin action failed.", 500);
  }
}

export async function DELETE(req, context) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;

    const params = await context.params;
    const targetUserId = cleanUserId(params?.userId);
    if (!targetUserId || targetUserId.includes("/")) {
      return jsonError("Invalid user id.", 400);
    }

    const targetUser = await adminReadDocument("users", targetUserId);
    if (!targetUser) return jsonError("Access account not found.", 404);

    const targetEmail = cleanEmail(targetUser.email);
    const actorEmail = cleanEmail(admin.verifiedUser.email);
    if (targetUserId === admin.verifiedUser.uid || (targetEmail && targetEmail === actorEmail)) {
      return jsonError("You cannot delete your own access account.", 400);
    }
    if (targetEmail && ADMIN_EMAILS.has(targetEmail)) {
      return jsonError("Admin gate accounts cannot be deleted.", 400);
    }

    const uidCandidates = [
      ...new Set([targetUserId, targetUser.uid].map(cleanUserId).filter(Boolean)),
    ];
    const passkeys = await adminListDocuments("passkeyCredentials");
    const targetPasskeys = passkeys.filter(({ data }) =>
      uidCandidates.includes(cleanUserId(data?.uid))
    );
    const userDocIds = [targetUserId];
    const mfaSecretIds = [
      ...new Set(uidCandidates),
    ];

    await Promise.all([
      ...userDocIds.map((id) => adminDeleteDocument("users", id)),
      ...mfaSecretIds.map((id) => adminDeleteDocument("mfaSecrets", id)),
      ...targetPasskeys.map(({ id }) => adminDeleteDocument("passkeyCredentials", id)),
      ...uidCandidates.map((uid) => adminDeleteDocument("passkeyChallenges", uid)),
    ]);

    await writeAuditLog(
      admin.idToken,
      auditPayload({
        action: "Deleted access account",
        actor: admin.verifiedUser,
        targetUserId,
        details: {
          email: targetEmail,
          deletedUserDocIds: userDocIds,
          deletedMfaSecretIds: mfaSecretIds,
          deletedPasskeys: targetPasskeys.length,
        },
      })
    );

    return Response.json({
      ok: true,
      deletedUserDocs: userDocIds.length,
      deletedMfaSecrets: mfaSecretIds.length,
      deletedPasskeys: targetPasskeys.length,
    });
  } catch (error) {
    console.error("Admin access delete failed:", error);
    return jsonError(error?.message || "Failed to delete access account.", 500);
  }
}
