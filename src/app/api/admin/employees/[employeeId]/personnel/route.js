import "server-only";

import {
  adminCommitDocumentPatches,
  adminReadDocumentWithMetadata,
} from "@/app/api/_firebaseAdminRest";
import {
  canAccessCompany,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";
import { pickPrivateEmployeeFields } from "@/app/utils/employeePersonnel";

export const runtime = "nodejs";

const safeId = (value) => {
  const id = String(value || "").trim();
  return id && id.length <= 180 && !id.includes("/") ? id : "";
};

export async function PUT(req, context) {
  try {
    const auth = await requireAdminFromRequest(req);
    if (auth.error) return auth.error;

    const { employeeId: rawEmployeeId } = await context.params;
    const employeeId = safeId(rawEmployeeId);
    if (!employeeId) return jsonError("Valid employee ID is required.", 400);

    const employeeSnapshot = await adminReadDocumentWithMetadata("employees", employeeId);
    if (!employeeSnapshot) return jsonError("Employee not found.", 404);

    const companyId = String(employeeSnapshot.data.companyId || "").trim();
    if (!companyId || !canAccessCompany(auth.userData, companyId)) {
      return jsonError("Employee company access denied.", 403);
    }

    const body = await req.json().catch(() => ({}));
    if (!body.privateRecord || typeof body.privateRecord !== "object" || Array.isArray(body.privateRecord)) {
      return jsonError("Private employee record is required.", 400);
    }

    const existingPersonnel = await adminReadDocumentWithMetadata("employeePersonnel", employeeId);
    const now = new Date().toISOString();
    const updatedBy = auth.verifiedUser.email || auth.verifiedUser.uid || "Administrator";
    const privatePatch = {
      ...pickPrivateEmployeeFields(body.privateRecord),
      employeeId,
      companyId,
      schemaVersion: 1,
      updatedAt: now,
      updatedBy,
    };

    await adminCommitDocumentPatches([
      {
        collection: "employeePersonnel",
        documentId: employeeId,
        patch: privatePatch,
        ...(existingPersonnel?.updateTime ? { updateTime: existingPersonnel.updateTime } : {}),
      },
    ]);

    return Response.json({ ok: true, employeeId, updatedAt: now });
  } catch (error) {
    console.error("[employee personnel update]", error);
    return jsonError(error?.message || "Could not update employee personnel record.", 500);
  }
}
