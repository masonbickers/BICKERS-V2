import { adminListDocuments, adminPatchDocument, adminReadDocument } from "../../_firebaseAdminRest";
import { readBearerToken, verifyFirebaseIdToken } from "../../admin/_lib";

const ADMIN_EMAILS = [
  "mason@bickers.co.uk",
  "paul@bickers.co.uk",
  "adam@bickers.co.uk",
];

function normalizeAppAccess(raw = {}) {
  if (isDisabledAccess(raw)) {
    return { user: false, service: false };
  }

  const role = String(raw?.role || "").trim().toLowerCase();
  const legacyService = raw?.isService === true || role === "service";
  const legacyHybrid = role === "hybrid";
  const fallback = {
    user: legacyHybrid || !legacyService,
    service: legacyHybrid || legacyService,
  };
  const incoming = raw?.appAccess && typeof raw.appAccess === "object" ? raw.appAccess : {};
  const normalized = {
    user: typeof incoming.user === "boolean" ? incoming.user : fallback.user,
    service: typeof incoming.service === "boolean" ? incoming.service : fallback.service,
  };

  if (!normalized.user && !normalized.service) {
    return { ...normalized, user: true };
  }

  return normalized;
}

function isDisabledAccess(raw = {}) {
  return (
    raw?.active === false ||
    raw?.archived === true ||
    raw?.isArchived === true ||
    raw?.disabled === true ||
    raw?.appDisabled === true ||
    String(raw?.role || "").trim().toLowerCase() === "archived"
  );
}

function deriveRoleFromAccess(appAccess) {
  if (appAccess.user && appAccess.service) return "hybrid";
  if (appAccess.service) return "service";
  return "employee";
}

function resolveDefaultWorkspace(raw = {}, appAccess) {
  const requested = String(raw?.defaultWorkspace || "").trim().toLowerCase();
  if (requested === "service" && appAccess.service) return "service";
  if (requested === "user" && appAccess.user) return "user";
  return appAccess.user ? "user" : "service";
}

function sameEmail(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

async function findEmployeeForUser({ uid, email }) {
  const rows = await adminListDocuments("employees");
  const match = rows.find(({ id, data }) => {
    return (
      id === uid ||
      data?.uid === uid ||
      data?.authUid === uid ||
      sameEmail(data?.email, email)
    );
  });
  return match ? { id: match.id, ...match.data } : null;
}

export async function POST(req) {
  try {
    const idToken = readBearerToken(req);
    const verifiedUser = await verifyFirebaseIdToken(idToken);
    if (!verifiedUser?.uid) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }

    const uid = verifiedUser.uid;
    const currentUserDoc = (await adminReadDocument("users", uid)) || {};
    const email = String(verifiedUser.email || currentUserDoc.email || "").trim().toLowerCase();

    if (currentUserDoc?.isEnabled === false) {
      return Response.json({ error: "Account disabled." }, { status: 403 });
    }

    const isAdmin = ADMIN_EMAILS.includes(email) || currentUserDoc?.role === "admin";
    const employee = isAdmin ? null : await findEmployeeForUser({ uid, email });
    const disabledByEmployee = !isAdmin && employee && isDisabledAccess(employee);
    const appAccess = isAdmin ? { user: true, service: true } : normalizeAppAccess(employee || currentUserDoc);
    const role = disabledByEmployee ? "archived" : isAdmin ? "admin" : deriveRoleFromAccess(appAccess);
    const defaultWorkspace = isAdmin ? "user" : resolveDefaultWorkspace(employee || currentUserDoc, appAccess);

    const patch = {
      uid,
      email,
      isEnabled: !disabledByEmployee,
      role,
      isService: !!appAccess.service,
      appAccess,
      defaultWorkspace,
      updatedAt: new Date().toISOString(),
      accessMirroredAt: new Date().toISOString(),
    };

    const displayName = employee?.name || employee?.fullName || employee?.employeeName;
    if (displayName && !currentUserDoc?.name) patch.name = displayName;
    if (employee?.id || employee?.employeeId) patch.employeeId = employee.id || employee.employeeId;

    await adminPatchDocument("users", uid, patch);

    return Response.json({ ok: true, access: patch });
  } catch (error) {
    console.error("[bootstrap-access] failed:", error);
    return Response.json({ error: "Could not refresh account access." }, { status: 500 });
  }
}
