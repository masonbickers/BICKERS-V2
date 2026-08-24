import "server-only";

import {
  adminCommitDocumentPatches,
  adminCreateDocument,
  adminReadDocumentWithMetadata,
} from "@/app/api/_firebaseAdminRest";
import {
  canAccessCompany,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";

export const runtime = "nodejs";

const safeId = (value) => {
  const id = String(value || "").trim();
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};

export async function PUT(req, context) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (auth.error) return auth.error;
    const { userId: rawUserId } = await context.params;
    const userId = safeId(rawUserId);
    if (!userId) return jsonError("Valid user ID is required.", 400);
    const body = await req.json().catch(() => ({}));
    if (typeof body.financeAccess !== "boolean") {
      return jsonError("financeAccess must be true or false.", 400);
    }
    const userSnapshot = await adminReadDocumentWithMetadata("users", userId);
    if (!userSnapshot) return jsonError("User not found.", 404);
    const companyId = String(userSnapshot.data.companyId || "").trim();
    if (!companyId || !canAccessCompany(auth.userData, companyId)) {
      return jsonError("User company access denied.", 403);
    }
    const canonicalEmployeeId = safeId(userSnapshot.data.employeeId);
    const requestedEmployeeId = safeId(body.employeeId);
    if (canonicalEmployeeId && requestedEmployeeId && canonicalEmployeeId !== requestedEmployeeId) {
      return jsonError("Requested employee does not match the canonical user link.", 409);
    }
    const employeeId = canonicalEmployeeId || requestedEmployeeId;
    const employeeSnapshot = employeeId
      ? await adminReadDocumentWithMetadata("employees", employeeId)
      : null;
    if (
      employeeSnapshot &&
      String(employeeSnapshot.data.companyId || "").trim() !== companyId
    ) {
      return jsonError("Linked employee and user companies do not match.", 409);
    }
    const employeeUserId = safeId(employeeSnapshot?.data?.authUid || employeeSnapshot?.data?.uid);
    if (employeeSnapshot && employeeUserId !== userId && canonicalEmployeeId !== employeeId) {
      return jsonError("Employee is not linked to this canonical user.", 409);
    }
    const now = new Date().toISOString();
    const actor = auth.verifiedUser.email || auth.verifiedUser.uid || "Administrator";
    const writes = [
      {
        collection: "users",
        documentId: userId,
        patch: { financeAccess: body.financeAccess, updatedAt: now, updatedBy: actor },
        updateTime: userSnapshot.updateTime,
      },
    ];
    if (employeeSnapshot) {
      writes.push({
        collection: "employees",
        documentId: employeeId,
        patch: { financeAccess: body.financeAccess, updatedAt: now, updatedBy: actor },
        updateTime: employeeSnapshot.updateTime,
      });
    }
    await adminCommitDocumentPatches(writes);
    await adminCreateDocument("adminAuditLogs", {
      action: body.financeAccess ? "finance_access_granted" : "finance_access_revoked",
      actorUid: auth.verifiedUser.uid,
      actorEmail: auth.verifiedUser.email || "",
      targetUserId: userId,
      targetEmployeeId: employeeId || null,
      companyId,
      before: { financeAccess: userSnapshot.data.financeAccess === true },
      after: { financeAccess: body.financeAccess },
      createdAt: now,
    });
    return Response.json({ ok: true, userId, employeeId: employeeId || null, financeAccess: body.financeAccess });
  } catch (error) {
    console.error("[finance access update]", error);
    return jsonError(error?.message || "Could not update finance access.", 500);
  }
}
