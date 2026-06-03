import { adminPatchDocument, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { jsonError } from "@/app/api/admin/_lib";
import { cleanId, jsonOk, requirePlatformAdmin, validateEmployeeUserLink, writePlatformAudit } from "../../_lib";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const admin = await requirePlatformAdmin(req);
    if (admin.error) return admin.error;

    const body = await req.json().catch(() => ({}));
    const uid = cleanId(body.uid || body.userId);
    const employeeId = cleanId(body.employeeId);
    if (!uid || uid.includes("/")) return jsonError("Valid uid is required.", 400);
    if (!employeeId || employeeId.includes("/")) return jsonError("Valid employeeId is required.", 400);

    const validation = await validateEmployeeUserLink({ uid, employeeId });
    if (!validation.ok) {
      return jsonError(validation.conflicts.join(" "), 409);
    }

    const [userBefore, employeeBefore] = await Promise.all([
      adminReadDocument("users", uid),
      adminReadDocument("employees", employeeId),
    ]);
    if (!userBefore) return jsonError("User not found.", 404);
    if (!employeeBefore) return jsonError("Employee not found.", 404);

    const nowIso = new Date().toISOString();
    const employeeAfter = {
      ...employeeBefore,
      authUid: uid,
      uid,
      updatedAt: nowIso,
      updatedBy: admin.verifiedUser.email || "platform-admin",
      updatedByUid: admin.verifiedUser.uid,
    };
    const userAfter = {
      ...userBefore,
      employeeId,
      companyId: userBefore.companyId || employeeBefore.companyId || "",
      updatedAt: nowIso,
      updatedBy: admin.verifiedUser.email || "platform-admin",
      updatedByUid: admin.verifiedUser.uid,
    };

    await Promise.all([
      adminPatchDocument("employees", employeeId, {
        authUid: uid,
        uid,
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
        updatedByUid: admin.verifiedUser.uid,
      }),
      adminPatchDocument("users", uid, {
        employeeId,
        companyId: userAfter.companyId,
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
        updatedByUid: admin.verifiedUser.uid,
      }),
    ]);

    await writePlatformAudit(req, admin.verifiedUser, {
      action: "Linked employee to user",
      targetType: "employeeLink",
      targetId: employeeId,
      companyId: userAfter.companyId,
      before: { user: userBefore, employee: employeeBefore },
      after: { user: userAfter, employee: employeeAfter },
      details: { uid, employeeId },
    });

    return jsonOk({ user: userAfter, employee: employeeAfter });
  } catch (error) {
    console.error("[platform/employee-linking/link] failed:", error);
    return jsonError(error?.message || "Could not link employee and user.", 500);
  }
}
