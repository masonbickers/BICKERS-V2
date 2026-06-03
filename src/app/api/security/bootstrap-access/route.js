import { adminCreateDocument, adminListDocuments, adminPatchDocument, adminReadDocument } from "../../_firebaseAdminRest";
import { readBearerToken, verifyFirebaseIdToken } from "../../admin/_lib";
import { isAdminEmail, isPlatformAdminEmail } from "@/app/utils/adminAccess";

const DEFAULT_COMPANY_ID = "bickers-action";
const DEFAULT_FEATURE_FLAGS = {
  diary: true,
  bookings: true,
  workshop: true,
  vehicles: true,
  equipment: true,
  uCrane: true,
  jobSheets: true,
  employees: true,
  hr: true,
  hAndS: true,
  statistics: true,
  timesheets: true,
  holidays: true,
  finance: true,
  invoices: true,
  assistant: true,
  settings: true,
  mfa: true,
  passkeys: true,
  userCodeLogin: false,
  mobileApp: true,
  pushNotifications: true,
};

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

function normalizeFeatureFlags(...sources) {
  return sources.reduce(
    (acc, source) => {
      const flags = source && typeof source === "object" ? source : {};
      Object.keys(DEFAULT_FEATURE_FLAGS).forEach((key) => {
        if (typeof flags[key] === "boolean") acc[key] = flags[key];
      });
      return acc;
    },
    { ...DEFAULT_FEATURE_FLAGS }
  );
}

async function resolveFeatureFlags(companyId) {
  const id = String(companyId || DEFAULT_COMPANY_ID).trim() || DEFAULT_COMPANY_ID;
  const [platformFeaturesDoc, platformDoc, companyDoc] = await Promise.all([
    adminReadDocument("settings", "platformFeatures"),
    adminReadDocument("settings", "platform"),
    adminReadDocument("platformCompanies", id),
  ]);
  const globalFlags =
    platformFeaturesDoc?.featureFlags ||
    platformFeaturesDoc?.features ||
    platformDoc?.featureFlags ||
    platformDoc?.features ||
    {};
  const companyFlags = companyDoc?.modules || companyDoc?.featureFlags || {};
  return normalizeFeatureFlags(globalFlags, companyFlags);
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

function deriveRoleFromAccess() {
  return "user";
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (["platformadmin", "platform admin", "superadmin", "super admin"].includes(value)) return "platformAdmin";
  if (["admin", "companyadmin", "company admin"].includes(value)) return "admin";
  return "user";
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

async function writeBootstrapAudit(req, actor, before, after) {
  try {
    await adminCreateDocument("adminAuditLogs", {
      actorUid: actor?.uid || "",
      actorEmail: actor?.email || "",
      actorRole: after?.role || "",
      targetType: "user",
      targetId: actor?.uid || "",
      companyId: after?.companyId || before?.companyId || "",
      action: "Bootstrapped account access",
      area: "Security",
      before,
      after,
      ip: clientIp(req),
      userAgent: headerValue(req.headers, "user-agent"),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[bootstrap-access] audit failed:", error);
  }
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function valuesEqual(left, right) {
  return stableJson(left ?? null) === stableJson(right ?? null);
}

function accessPatchChanged(currentUserDoc = {}, patch = {}) {
  return Object.entries(patch).some(([key, value]) => {
    if (key === "updatedAt" || key === "accessMirroredAt") return false;
    return !valuesEqual(currentUserDoc?.[key], value);
  });
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
    const mfaSecretDoc = (await adminReadDocument("mfaSecrets", uid)) || {};
    const email = String(verifiedUser.email || currentUserDoc.email || "").trim().toLowerCase();

    if (currentUserDoc?.isEnabled === false) {
      return Response.json({ error: "Account disabled." }, { status: 403 });
    }

    const currentRole = normalizeRole(currentUserDoc?.role);
    const isPlatformAdmin = currentRole === "platformAdmin" || isPlatformAdminEmail(email);
    const isAdmin = isPlatformAdmin || currentRole === "admin" || isAdminEmail(email);
    const employee = isAdmin ? null : await findEmployeeForUser({ uid, email });
    if (!isAdmin && !employee && !currentUserDoc?.role) {
      return Response.json({ error: "No server access record found for this account." }, { status: 403 });
    }
    const disabledByEmployee = !isAdmin && employee && isDisabledAccess(employee);
    const appAccess = isAdmin ? { user: true, service: true } : normalizeAppAccess(employee || currentUserDoc);
    const role = isPlatformAdmin ? "platformAdmin" : isAdmin ? "admin" : deriveRoleFromAccess(appAccess);
    const defaultWorkspace = isAdmin ? "user" : resolveDefaultWorkspace(employee || currentUserDoc, appAccess);

    const now = new Date().toISOString();
    const patch = {
      uid,
      email,
      isEnabled: !disabledByEmployee,
      role,
      isService: !!appAccess.service,
      appAccess,
      defaultWorkspace,
    };
    if (isAdmin) patch.companyId = currentUserDoc.companyId || DEFAULT_COMPANY_ID;
    if (currentUserDoc?.companyId || employee?.companyId) patch.companyId = currentUserDoc.companyId || employee.companyId;

    const hasPrivateMfaSecret = String(mfaSecretDoc?.secret || "").trim().length > 0;
    if (hasPrivateMfaSecret && currentUserDoc?.mfaResetRequired !== true) {
      patch.mfaEnabled = true;
      patch.mfaMethod = "totp";
      patch.mfaResetRequired = false;
      if (mfaSecretDoc.enrolledAt && !currentUserDoc?.mfaEnrolledAt) {
        patch.mfaEnrolledAt = mfaSecretDoc.enrolledAt;
      }
    }

    const hasPrivateMfaSecret = String(mfaSecretDoc?.secret || "").trim().length > 0;
    if (hasPrivateMfaSecret && currentUserDoc?.mfaResetRequired !== true) {
      patch.mfaEnabled = true;
      patch.mfaMethod = "totp";
      patch.mfaResetRequired = false;
      if (mfaSecretDoc.enrolledAt && !currentUserDoc?.mfaEnrolledAt) {
        patch.mfaEnrolledAt = mfaSecretDoc.enrolledAt;
      }
    }

    const displayName = employee?.name || employee?.fullName || employee?.employeeName;
    if (displayName && !currentUserDoc?.name) patch.name = displayName;
    if (employee?.id || employee?.employeeId) patch.employeeId = employee.id || employee.employeeId;

    const featureFlags = await resolveFeatureFlags(patch.companyId);
    const shouldWrite = !currentUserDoc?.uid || accessPatchChanged(currentUserDoc, patch);
    const writePatch = shouldWrite
      ? {
          ...patch,
          updatedAt: now,
          accessMirroredAt: now,
        }
      : {};
    const access = { ...currentUserDoc, ...patch, ...(shouldWrite ? writePatch : {}), featureFlags };

    if (shouldWrite) {
      await adminPatchDocument("users", uid, writePatch);
      await writeBootstrapAudit(req, verifiedUser, currentUserDoc, access);
    }

    return Response.json({ ok: true, repaired: shouldWrite, access });
  } catch (error) {
    console.error("[bootstrap-access] failed:", error);
    return Response.json({ error: "Could not refresh account access." }, { status: 500 });
  }
}
