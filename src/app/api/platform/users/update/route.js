import { adminListDocuments, adminPatchDocument, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { jsonError } from "@/app/api/admin/_lib";
import { cleanId, jsonOk, requirePlatformAdmin, writePlatformAudit } from "../../_lib";
import { buildUserAccessPatch } from "@/app/utils/appAccessRecords";

export const runtime = "nodejs";

const ROLE_ALIASES = {
  platformadmin: "platformAdmin",
  user: "user",
  admin: "admin",
};
const ALLOWED_WORKSPACES = new Set(["user", "service"]);

const cleanEmail = (value) => String(value || "").trim().toLowerCase();

async function findEmployeeForUid(uid) {
  const employees = await adminListDocuments("employees");
  return employees.find(({ data }) => cleanId(data?.authUid || data?.uid) === uid) || null;
}

function seedUserFromEmployee(uid, employeeDoc) {
  const employee = employeeDoc?.data || {};
  const employeeId = employeeDoc?.id || employee.employeeId || "";
  return {
    ...buildUserAccessPatch({ uid, employeeId, employee, user: { role: "user" } }),
    createdAt: new Date().toISOString(),
    accessCreatedFrom: "employee-link",
  };
}

function cleanPatch(raw = {}) {
  const patch = {};

  if ("role" in raw) {
    const role = ROLE_ALIASES[String(raw.role || "").trim().toLowerCase()];
    if (!role) throw new Error("Invalid role.");
    patch.role = role;
  }
  if ("isEnabled" in raw) {
    if (typeof raw.isEnabled !== "boolean") throw new Error("Invalid enabled value.");
    patch.isEnabled = raw.isEnabled;
  }
  if ("companyId" in raw) {
    const companyId = cleanId(raw.companyId).toLowerCase();
    if (!companyId || companyId.includes("/")) throw new Error("Invalid company id.");
    patch.companyId = companyId;
  }
  if ("appAccess" in raw) {
    const appAccess = raw.appAccess && typeof raw.appAccess === "object" ? raw.appAccess : {};
    patch.appAccess = { user: appAccess.user === true, service: appAccess.service === true };
    patch.isService = patch.appAccess.service;
  }
  if ("defaultWorkspace" in raw) {
    const defaultWorkspace = String(raw.defaultWorkspace || "").trim().toLowerCase();
    if (!ALLOWED_WORKSPACES.has(defaultWorkspace)) throw new Error("Invalid default workspace.");
    patch.defaultWorkspace = defaultWorkspace;
  }
  if ("employeeId" in raw) patch.employeeId = cleanId(raw.employeeId);
  if ("phoneVerified" in raw) patch.phoneVerified = raw.phoneVerified === true;

  return patch;
}

export async function POST(req) {
  try {
    const admin = await requirePlatformAdmin(req);
    if (admin.error) return admin.error;

    const body = await req.json().catch(() => ({}));
    const uid = cleanId(body.uid || body.userId);
    if (!uid || uid.includes("/")) return jsonError("Valid uid is required.", 400);
    if (uid === admin.verifiedUser.uid && body.patch?.isEnabled === false) {
      return jsonError("You cannot disable your own platform admin account.", 400);
    }

    const existing = await adminReadDocument("users", uid);
    const employeeDoc = existing ? null : await findEmployeeForUid(uid);
    if (!existing && !employeeDoc) {
      return jsonError("User access record not found. Link this Firebase user to an employee before updating access.", 404);
    }
    const before = existing || seedUserFromEmployee(uid, employeeDoc);

    const patch = cleanPatch(body.patch || body);
    if (!Object.keys(patch).length) return jsonError("No supported user fields supplied.", 400);

    const nowIso = new Date().toISOString();
    const after = {
      ...before,
      ...patch,
      updatedAt: nowIso,
      updatedBy: admin.verifiedUser.email || "platform-admin",
      updatedByUid: admin.verifiedUser.uid,
    };

    await adminPatchDocument("users", uid, {
      ...patch,
      updatedAt: nowIso,
      updatedBy: admin.verifiedUser.email || "platform-admin",
      updatedByUid: admin.verifiedUser.uid,
    });
    await writePlatformAudit(req, admin.verifiedUser, {
      action: cleanId(body.action) || "Updated platform user",
      targetType: "user",
      targetId: uid,
      before,
      after,
      details: { changedFields: Object.keys(patch) },
    });

    return jsonOk({ user: after });
  } catch (error) {
    console.error("[platform/users/update] failed:", error);
    return jsonError(error?.message || "Could not update user.", 500);
  }
}
