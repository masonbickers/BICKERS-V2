import {
  adminCompanyId,
  canAccessCompany,
  isPlatformAdminAccess,
  jsonError,
  requireAdminFromRequest,
} from "../../_lib";
import {
  adminCreateDocument,
  adminDeleteDocument,
  adminPatchDocument,
  adminReadDocument,
} from "../../../_firebaseAdminRest";
import { isAdminEmail } from "@/app/utils/adminAccess";

const ROLE_ALIASES = {
  platformadmin: "platformAdmin",
  user: "user",
  admin: "admin",
};
const ALLOWED_WORKSPACES = new Set(["user", "service"]);

function cleanUserId(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function headerValue(headers, name) {
  return String(headers?.get?.(name) || "").trim();
}

function clientIp(req) {
  const forwarded = headerValue(req.headers, "x-forwarded-for");
  return (
    headerValue(req.headers, "cf-connecting-ip") ||
    headerValue(req.headers, "x-real-ip") ||
    String(forwarded.split(",")[0] || "").trim() ||
    ""
  );
}

function auditPayload({ action, actor, targetUserId, details = {}, before = null, after = null, req = null }) {
  const nowIso = new Date().toISOString();
  const companyId = details.companyId || before?.companyId || after?.companyId || "";
  return {
    action,
    area: "Access",
    actorEmail: actor.email || "",
    actorUid: actor.uid || "",
    actorRole: actor.role || "",
    targetType: "user",
    targetId: targetUserId,
    companyId,
    targetUserId,
    before,
    after,
    ip: req ? clientIp(req) : "",
    userAgent: req ? headerValue(req.headers, "user-agent") : "",
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

    const targetBefore = await adminReadDocument("users", targetUserId);
    if (!targetBefore) return jsonError("Access account not found.", 404);

    const actorIsPlatformAdmin = isPlatformAdminAccess(admin.userData);
    const actorCompanyId = adminCompanyId(admin.userData);
    if (!canAccessCompany(admin.userData, targetBefore.companyId)) {
      return jsonError("You can only manage users in your company.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const nowIso = new Date().toISOString();

    if (action === "setRole") {
      const role = ROLE_ALIASES[String(body?.role || "").trim().toLowerCase()];
      if (!role) return jsonError("Invalid role.", 400);
      if (role === "platformAdmin" && !actorIsPlatformAdmin) {
        return jsonError("Platform Admin role can only be assigned by Platform Admin.", 403);
      }

      await adminPatchDocument(
        "users",
        targetUserId,
        {
          role,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "admin",
          updatedByUid: admin.verifiedUser.uid,
        }
      );
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: "Set user role",
          actor: admin.verifiedUser,
          targetUserId,
          before: targetBefore,
          after: { ...(targetBefore || {}), role },
          req,
          details: { role },
        })
      );
      return Response.json({ ok: true });
    }

    if (action === "setEnabled") {
      const isEnabled = body?.isEnabled;
      if (typeof isEnabled !== "boolean") return jsonError("Invalid enabled value.", 400);

      await adminPatchDocument(
        "users",
        targetUserId,
        {
          isEnabled,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "admin",
          updatedByUid: admin.verifiedUser.uid,
        }
      );
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: isEnabled ? "Enabled user" : "Disabled user",
          actor: admin.verifiedUser,
          targetUserId,
          before: targetBefore,
          after: { ...(targetBefore || {}), isEnabled },
          req,
          details: { isEnabled },
        })
      );
      return Response.json({ ok: true });
    }

    if (action === "setCompany") {
      const companyId = String(body?.companyId || "").trim().toLowerCase();
      if (!companyId || companyId.includes("/")) return jsonError("Invalid company id.", 400);
      if (!actorIsPlatformAdmin && companyId !== actorCompanyId) {
        return jsonError("You can only assign users to your company.", 403);
      }

      await adminPatchDocument(
        "users",
        targetUserId,
        {
          companyId,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "admin",
          updatedByUid: admin.verifiedUser.uid,
        }
      );
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: "Set user company",
          actor: admin.verifiedUser,
          targetUserId,
          before: targetBefore,
          after: { ...(targetBefore || {}), companyId },
          req,
          details: { companyId },
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

      await adminPatchDocument(
        "users",
        targetUserId,
        {
          appAccess: { user: userAccess, service: serviceAccess },
          defaultWorkspace,
          isService: serviceAccess,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "admin",
          updatedByUid: admin.verifiedUser.uid,
        }
      );
      await writeAuditLog(
        admin.idToken,
        auditPayload({
          action: "Set user access",
          actor: admin.verifiedUser,
          targetUserId,
          before: targetBefore,
          after: {
            ...(targetBefore || {}),
            appAccess: { user: userAccess, service: serviceAccess },
            defaultWorkspace,
            isService: serviceAccess,
          },
          req,
          details: {
            appAccess: { user: userAccess, service: serviceAccess },
            defaultWorkspace,
          },
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
    if (!canAccessCompany(admin.userData, targetUser.companyId)) {
      return jsonError("You can only delete users in your company.", 403);
    }

    const targetEmail = cleanEmail(targetUser.email);
    const actorEmail = cleanEmail(admin.verifiedUser.email);
    if (targetUserId === admin.verifiedUser.uid || (targetEmail && targetEmail === actorEmail)) {
      return jsonError("You cannot delete your own access account.", 400);
    }
    if (targetEmail && isAdminEmail(targetEmail)) {
      return jsonError("Admin gate accounts cannot be deleted.", 400);
    }

    const userDocIds = [targetUserId];

    await Promise.all([
      ...userDocIds.map((id) => adminDeleteDocument("users", id)),
    ]);

    await writeAuditLog(
      admin.idToken,
      auditPayload({
        action: "Deleted access account",
        actor: admin.verifiedUser,
        targetUserId,
        before: targetUser,
        after: null,
        req,
        details: {
          email: targetEmail,
          deletedUserDocIds: userDocIds,
        },
      })
    );

    return Response.json({
      ok: true,
      deletedUserDocs: userDocIds.length,
    });
  } catch (error) {
    console.error("Admin access delete failed:", error);
    return jsonError(error?.message || "Failed to delete access account.", 500);
  }
}
