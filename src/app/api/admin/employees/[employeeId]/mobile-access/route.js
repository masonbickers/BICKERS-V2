import "server-only";

import crypto from "node:crypto";
import {
  adminCommitDocumentPatches,
  adminCreateDocument,
  adminListDocuments,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { getFirebaseAuthAdmin } from "@/app/api/_firebaseAuthAdmin";
import {
  canAccessCompany,
  jsonError,
  requireAdminFromRequest,
} from "@/app/api/admin/_lib";

export const runtime = "nodejs";

const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  process.env.FIREBASE_API_KEY ||
  "";

const VALID_ACTIONS = new Set(["approve", "resendInvite", "invalidateEmail"]);
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return clean(value).toLowerCase();
}

function safeId(value) {
  const id = clean(value);
  return id && id.length <= 180 && !id.includes("/") ? id : "";
}

function safeUid(value) {
  const uid = clean(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : "";
}

function employeeIsBlocked(employee = {}) {
  return (
    employee.status === "disabled" ||
    employee.isEnabled === false ||
    employee.archived === true ||
    employee.isArchived === true ||
    employee.disabled === true ||
    employee.appDisabled === true ||
    employee.active === false
  );
}

function employeeHasWorkspace(employee = {}) {
  return employee?.appAccess?.user === true || employee?.appAccess?.service === true;
}

function employeePrimaryEmail(employee = {}) {
  return cleanEmail(employee.email || employee.workEmail || employee.emailAddress);
}

function employeeUidCandidates(employeeId, employee, users) {
  const values = [
    employee.authUid,
    employee.uid,
    employee.codeLoginUid,
    employee.userId,
    employee?.auth?.uid,
  ];

  for (const row of users) {
    if (clean(row?.data?.employeeId) === employeeId) {
      values.push(row.id, row?.data?.uid, row?.data?.authUid);
    }
  }

  return [...new Set(values.map(safeUid).filter(Boolean))];
}

function stableEmployeeUid(employeeId) {
  const direct = safeUid(`employee_${employeeId}`);
  if (direct) return direct;
  return `employee_${crypto.createHash("sha256").update(employeeId).digest("hex")}`;
}

function uidLinkedToAnotherEmployee(uid, employeeId, employees) {
  return employees.some(({ id, data = {} }) => {
    if (id === employeeId) return false;
    return [data.authUid, data.uid, data.codeLoginUid, data.userId, data?.auth?.uid]
      .map(safeUid)
      .filter(Boolean)
      .includes(uid);
  });
}

function resolveCanonicalUid(employeeId, employee, employees, users) {
  const candidates = employeeUidCandidates(employeeId, employee, users);
  if (candidates.length > 1) {
    throw new Error(
      "This employee has conflicting login identities. Resolve them in Employee Linking before approval."
    );
  }

  const uid = candidates[0] || stableEmployeeUid(employeeId);
  if (uidLinkedToAnotherEmployee(uid, employeeId, employees)) {
    throw new Error(
      "This login identity is linked to another employee. Resolve it in Employee Linking before approval."
    );
  }
  return uid;
}

async function sendFirebasePasswordSetupEmail(email) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error("Firebase invitation email is not configured.");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(
      FIREBASE_WEB_API_KEY
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-Locale": "en-GB",
      },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const firebaseCode = clean(payload?.error?.message);
    throw new Error(
      `Firebase invitation email failed: ${firebaseCode || response.status}`
    );
  }
}

async function writeAudit({ action, auth, employeeId, companyId, before, after, details = {} }) {
  try {
    await adminCreateDocument("adminAuditLogs", {
      action,
      area: "Access",
      actorEmail: auth.verifiedUser.email || "",
      actorUid: auth.verifiedUser.uid || "",
      actorRole: auth.userData.role || "",
      targetType: "employee",
      targetId: employeeId,
      companyId,
      before: before || null,
      after: after || null,
      details,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Mobile access audit failed:", error);
  }
}

async function findAuthUser(authAdmin, uid, email, employee = {}) {
  let userByUid = null;
  let userByEmail = null;

  try {
    userByUid = await authAdmin.getUser(uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  try {
    userByEmail = await authAdmin.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  if (userByEmail && userByEmail.uid !== uid) {
    throw new Error(
      "That email already belongs to a different login. Resolve it in Employee Linking before approval."
    );
  }

  const previousApprovedEmail = cleanEmail(
    employee?.mobileAccess?.previousApprovedEmail || employee?.mobileAccess?.approvedEmail
  );
  if (
    userByUid?.email &&
    cleanEmail(userByUid.email) !== email &&
    cleanEmail(userByUid.email) !== previousApprovedEmail
  ) {
    throw new Error(
      "This employee login is attached to a different email. Resolve it in Employee Linking before approval."
    );
  }

  return userByUid;
}

function mobileAccessPatch(employee, patch) {
  return {
    ...(employee?.mobileAccess && typeof employee.mobileAccess === "object"
      ? employee.mobileAccess
      : {}),
    ...patch,
  };
}

function hasPasswordProvider(authUser) {
  return Array.isArray(authUser?.providerData)
    && authUser.providerData.some((provider) => provider?.providerId === "password");
}

export async function POST(req, context) {
  let employeeId = "";
  let employee = null;
  let authContext = null;
  let canonicalUid = "";
  let companyId = "";
  let attemptId = "";

  try {
    authContext = await requireAdminFromRequest(req);
    if (authContext.error) return authContext.error;

    const params = await context.params;
    employeeId = safeId(params?.employeeId);
    if (!employeeId) return jsonError("Valid employee ID is required.", 400);

    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action);
    if (!VALID_ACTIONS.has(action)) {
      return jsonError("Unknown mobile access action.", 400);
    }

    employee = await adminReadDocument("employees", employeeId);
    if (!employee) return jsonError("Employee not found.", 404);

    companyId = clean(employee.companyId);
    if (!companyId || !canAccessCompany(authContext.userData, companyId)) {
      return jsonError("Employee company access denied.", 403);
    }

    const [employees, users] = await Promise.all([
      adminListDocuments("employees"),
      adminListDocuments("users"),
    ]);
    canonicalUid = resolveCanonicalUid(employeeId, employee, employees, users);
    const authAdmin = getFirebaseAuthAdmin();

    if (action === "invalidateEmail") {
      const pendingAccess = mobileAccessPatch(employee, {
        status: "pending",
        previousApprovedEmail:
          cleanEmail(employee?.mobileAccess?.approvedEmail) || employeePrimaryEmail(employee),
        approvedEmail: "",
        invalidatedAt: new Date().toISOString(),
        invalidatedByUid: authContext.verifiedUser.uid || "",
        invalidatedByEmail: authContext.verifiedUser.email || "",
      });
      await adminCommitDocumentPatches([
        {
          collection: "employees",
          documentId: employeeId,
          patch: { mobileAccess: pendingAccess },
        },
        {
          collection: "users",
          documentId: canonicalUid,
          patch: { mobileAccessStatus: "pending" },
        },
      ]);
      try {
        await authAdmin.updateUser(canonicalUid, {
          password: crypto.randomBytes(48).toString("base64url"),
        });
        await authAdmin.revokeRefreshTokens(canonicalUid);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
      await writeAudit({
        action: "Invalidated mobile access after email change",
        auth: authContext,
        employeeId,
        companyId,
        before: employee.mobileAccess || null,
        after: pendingAccess,
      });
      return Response.json({ ok: true, status: "pending", authUid: canonicalUid });
    }

    if (employeeIsBlocked(employee)) {
      return jsonError("Activate this employee before approving mobile access.", 409);
    }
    if (!employeeHasWorkspace(employee)) {
      return jsonError("Enable a User or Service workspace before approving mobile access.", 409);
    }

    const email = employeePrimaryEmail(employee);
    if (!VALID_EMAIL.test(email)) {
      return jsonError("Add a valid primary work email before approving mobile access.", 409);
    }

    const duplicateEmployee = employees.find(
      ({ id, data }) =>
        id !== employeeId &&
        !employeeIsBlocked(data) &&
        employeePrimaryEmail(data) === email
    );
    if (duplicateEmployee) {
      return jsonError("That primary email is already used by another active employee.", 409);
    }

    const currentStatus = clean(employee?.mobileAccess?.status) || "pending";
    if (action === "resendInvite" && !["invited", "invite_failed"].includes(currentStatus)) {
      return jsonError("Only an invited or failed invitation can be resent.", 409);
    }

    const existingAuthUser = await findAuthUser(authAdmin, canonicalUid, email, employee);
    const now = new Date().toISOString();
    attemptId = crypto.randomUUID();
    const provisioningAccess = mobileAccessPatch(employee, {
      status: "provisioning",
      approvedEmail: email,
      approvedAt: employee?.mobileAccess?.approvedAt || now,
      approvedByUid: authContext.verifiedUser.uid || "",
      approvedByEmail: authContext.verifiedUser.email || "",
      inviteAttemptId: attemptId,
      inviteError: "",
    });

    const existingUser = users.find(({ id }) => id === canonicalUid)?.data || {};
    const appAccess = employee.appAccess || { user: true, service: false };
    await adminCommitDocumentPatches([
      {
        collection: "employees",
        documentId: employeeId,
        patch: {
          authUid: canonicalUid,
          uid: canonicalUid,
          mobileAccess: provisioningAccess,
        },
      },
      {
        collection: "users",
        documentId: canonicalUid,
        patch: {
          uid: canonicalUid,
          authUid: canonicalUid,
          employeeId,
          email,
          displayName: employee.name || employee.displayName || "Employee",
          companyId,
          role: existingUser.role || "user",
          appAccess,
          defaultWorkspace:
            employee.defaultWorkspace === "service" && appAccess.service === true
              ? "service"
              : "user",
          isEnabled: existingUser.isEnabled !== false,
          mobileAccessStatus: "provisioning",
          updatedAt: now,
        },
      },
    ]);

    const authUpdate = {
      email,
      displayName: employee.name || employee.displayName || undefined,
      disabled: false,
    };
    if (!hasPasswordProvider(existingAuthUser)) {
      authUpdate.password = crypto.randomBytes(48).toString("base64url");
    }
    if (existingAuthUser) {
      await authAdmin.updateUser(canonicalUid, authUpdate);
    } else {
      await authAdmin.createUser({ uid: canonicalUid, ...authUpdate });
    }
    await authAdmin.revokeRefreshTokens(canonicalUid);
    await sendFirebasePasswordSetupEmail(email);

    const invitedAt = new Date().toISOString();
    const invitedAccess = mobileAccessPatch(employee, {
      ...provisioningAccess,
      status: "invited",
      previousApprovedEmail: "",
      inviteSentAt: invitedAt,
      inviteError: "",
    });
    await adminCommitDocumentPatches([
      {
        collection: "employees",
        documentId: employeeId,
        patch: {
          authUid: canonicalUid,
          uid: canonicalUid,
          mobileAccess: invitedAccess,
          auth: {
            ...(employee.auth || {}),
            uid: canonicalUid,
            email,
            passwordEnabled: true,
          },
        },
      },
      {
        collection: "users",
        documentId: canonicalUid,
        patch: { mobileAccessStatus: "invited", updatedAt: invitedAt },
      },
    ]);

    await writeAudit({
      action: action === "resendInvite"
        ? "Resent mobile setup invitation"
        : "Approved mobile app access",
      auth: authContext,
      employeeId,
      companyId,
      before: employee.mobileAccess || null,
      after: invitedAccess,
      details: {
        authUid: canonicalUid,
        email,
        existingPasswordPreserved: hasPasswordProvider(existingAuthUser),
      },
    });

    return Response.json({
      ok: true,
      status: "invited",
      email,
      authUid: canonicalUid,
      inviteSentAt: invitedAt,
    });
  } catch (error) {
    console.error("[employee mobile access]", error);
    if (employee && employeeId && attemptId) {
      const failedAt = new Date().toISOString();
      const failedAccess = mobileAccessPatch(employee, {
        status: "invite_failed",
        inviteAttemptId: attemptId,
        inviteFailedAt: failedAt,
        inviteError: "Invitation could not be sent.",
      });
      await adminCommitDocumentPatches([
        {
          collection: "employees",
          documentId: employeeId,
          patch: { mobileAccess: failedAccess },
        },
        ...(canonicalUid
          ? [{
              collection: "users",
              documentId: canonicalUid,
              patch: { mobileAccessStatus: "invite_failed", updatedAt: failedAt },
            }]
          : []),
      ]).catch(() => {});
      if (authContext) {
        await writeAudit({
          action: "Mobile setup invitation failed",
          auth: authContext,
          employeeId,
          companyId,
          before: employee.mobileAccess || null,
          after: failedAccess,
          details: { reason: error?.message || "Unknown error" },
        });
      }
    }
    return jsonError(error?.message || "Could not configure mobile app access.", 500);
  }
}
