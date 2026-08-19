import { adminCreateDocument, adminListDocuments, adminPatchDocument, adminReadDocument } from "../../_firebaseAdminRest";
import { readBearerToken, verifyFirebaseIdToken } from "../../admin/_lib";
import { isAccountDisabled } from "@/app/utils/accountAccess";

const DEFAULT_FEATURE_FLAGS = {
  diary: false,
  bookings: false,
  workshop: false,
  vehicles: false,
  equipment: false,
  uCrane: false,
  jobSheets: false,
  employees: false,
  hr: false,
  hAndS: false,
  statistics: false,
  timesheets: false,
  holidays: false,
  finance: false,
  invoices: false,
  assistant: false,
  settings: false,
  mfa: false,
  passkeys: false,
  userCodeLogin: false,
  mobileApp: false,
  pushNotifications: false,
};

function explicitAppAccess(raw = {}) {
  const incoming = raw?.appAccess && typeof raw.appAccess === "object" ? raw.appAccess : {};
  return {
    configured: typeof incoming.user === "boolean" || typeof incoming.service === "boolean",
    appAccess: {
      user: incoming.user === true,
      service: incoming.service === true,
    },
  };
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
  const id = String(companyId || "").trim();
  const [platformFeaturesDoc, platformDoc, companyDoc] = await Promise.all([
    adminReadDocument("settings", "platformFeatures"),
    adminReadDocument("settings", "platform"),
    id ? adminReadDocument("platformCompanies", id) : Promise.resolve(null),
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
    raw?.isEnabled === false ||
    raw?.active === false ||
    raw?.archived === true ||
    raw?.isArchived === true ||
    raw?.disabled === true ||
    raw?.appDisabled === true ||
    String(raw?.status || "").trim().toLowerCase() === "disabled" ||
    String(raw?.role || "").trim().toLowerCase() === "archived"
  );
}

function deriveRoleFromAccess() {
  return "user";
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "platformadmin") return "platformAdmin";
  if (value === "admin") return "admin";
  return "user";
}

function resolveDefaultWorkspace(raw = {}, appAccess) {
  const requested = String(raw?.defaultWorkspace || "").trim().toLowerCase();
  if (requested === "service" && appAccess.service) return "service";
  if (requested === "user" && appAccess.user) return "user";
  if (appAccess.user) return "user";
  if (appAccess.service) return "service";
  return "";
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

const ACCESS_AUDIT_FIELDS = [
  "uid",
  "companyId",
  "employeeId",
  "role",
  "isEnabled",
  "isService",
  "appAccess",
  "defaultWorkspace",
  "featureFlags",
  "mfaEnabled",
  "mfaMethod",
  "mfaResetRequired",
  "mfaEnrolledAt",
];

function accessAuditSnapshot(record) {
  if (!record || typeof record !== "object") return null;
  return ACCESS_AUDIT_FIELDS.reduce((snapshot, field) => {
    if (record[field] !== undefined) snapshot[field] = record[field];
    return snapshot;
  }, {});
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
      before: accessAuditSnapshot(before),
      after: accessAuditSnapshot(after),
      ip: clientIp(req),
      userAgent: headerValue(req.headers, "user-agent"),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[bootstrap-access] audit failed:", error);
  }
}

async function writeBootstrapBlocked(req, actor, reason) {
  try {
    await adminCreateDocument("loginSecurityLogs", {
      uid: actor?.uid || "",
      email: actor?.companyEmail || actor?.email || "",
      clerkUserId: actor?.clerkUserId || "",
      loginMethod: "access-bootstrap",
      status: "blocked",
      outcome: "blocked",
      reason,
      ip: clientIp(req),
      userAgent: headerValue(req.headers, "user-agent"),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[bootstrap-access] blocked access log failed:", error);
  }
}

async function denyBootstrap(req, actor, reason, message, status = 403) {
  await writeBootstrapBlocked(req, actor, reason);
  return Response.json({ error: message }, { status });
}

const cleanValue = (value) => String(value || "").trim();
const normalizeEmail = (value) => cleanValue(value).toLowerCase();
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function explicitUid(value) {
  const uid = cleanValue(value);
  return UID_PATTERN.test(uid) ? uid : "";
}

function employeeUidLink(data = {}) {
  const rawValues = [data?.authUid, data?.uid].map(cleanValue).filter(Boolean);
  const normalizedValues = rawValues.map(explicitUid);
  const values = [...new Set(normalizedValues.filter(Boolean))];
  return {
    conflict: normalizedValues.some((value) => !value) || values.length > 1,
    uid: values.length === 1 ? values[0] : "",
  };
}

function recordEmails(record = {}) {
  return ["email", "workEmail", "personalEmail", "emailAddress", "contactEmail"]
    .map((key) => normalizeEmail(record?.[key]))
    .filter(Boolean);
}

function recordClerkIds(record = {}) {
  return [record?.clerkUserId, record?.auth?.clerkUserId].map(cleanValue).filter(Boolean);
}

function hasConflictingClerkIds(record = {}) {
  return new Set(recordClerkIds(record)).size > 1;
}

async function findEmployeesForUid(uid) {
  const rows = await adminListDocuments("employees");
  const inspected = rows.map((row) => ({ ...row, link: employeeUidLink(row.data) }));
  return {
    conflicts: inspected.filter(({ data, link }) =>
      link.conflict && [data?.authUid, data?.uid].map(cleanValue).includes(uid)
    ),
    matches: inspected.filter(({ link }) => !link.conflict && link.uid === uid),
  };
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
      return denyBootstrap(req, verifiedUser, "Firebase identity missing", "Not signed in.", 401);
    }

    const uid = explicitUid(verifiedUser.uid);
    const email = normalizeEmail(verifiedUser.companyEmail);
    if (
      !uid ||
      verifiedUser.authMethod !== "clerk" ||
      verifiedUser.verifiedClerkEmail !== true ||
      Number(verifiedUser.identityLinkVersion) !== 2 ||
      !cleanValue(verifiedUser.clerkUserId) ||
      !email ||
      !email.endsWith("@bickers.co.uk")
    ) {
      return denyBootstrap(
        req,
        verifiedUser,
        "Verified Clerk bridge assurance missing",
        "A verified Clerk application session is required."
      );
    }

    const currentUserDoc = await adminReadDocument("users", uid);
    if (currentUserDoc && explicitUid(currentUserDoc.uid) !== uid) {
      return denyBootstrap(
        req,
        verifiedUser,
        "Canonical UID conflict",
        "Canonical account identity requires manual review."
      );
    }
    if (currentUserDoc && (isAccountDisabled(currentUserDoc) || isDisabledAccess(currentUserDoc))) {
      return denyBootstrap(req, verifiedUser, "Canonical account disabled", "Account disabled.");
    }
    if (currentUserDoc) {
      const clerkIds = recordClerkIds(currentUserDoc);
      if (hasConflictingClerkIds(currentUserDoc) || (clerkIds.length && !clerkIds.includes(verifiedUser.clerkUserId))) {
        return denyBootstrap(
          req,
          verifiedUser,
          "Canonical Clerk link conflict",
          "Canonical account identity requires manual review."
        );
      }
      const canonicalEmails = recordEmails(currentUserDoc);
      if (canonicalEmails.length && !canonicalEmails.includes(email)) {
        return denyBootstrap(
          req,
          verifiedUser,
          "Canonical email conflict",
          "Canonical account identity requires manual review."
        );
      }
    }

    const currentRole = normalizeRole(currentUserDoc?.role);
    const isPlatformAdmin = currentRole === "platformAdmin";
    const isAdmin = isPlatformAdmin || currentRole === "admin";
    if (isAdmin && !currentUserDoc) {
      return denyBootstrap(
        req,
        verifiedUser,
        "Administrative canonical account missing",
        "Canonical administrative access requires manual review."
      );
    }

    const employeeResolution = await findEmployeesForUid(uid);
    if (employeeResolution.conflicts.length || employeeResolution.matches.length > 1) {
      return denyBootstrap(
        req,
        verifiedUser,
        employeeResolution.conflicts.length ? "Conflicting employee UID fields" : "Duplicate employee UID links",
        "Employee identity links require manual review."
      );
    }
    const employeeRow = isAdmin ? null : employeeResolution.matches[0] || null;
    const employee = employeeRow?.data || null;
    if (!isAdmin && !employee) {
      return denyBootstrap(
        req,
        verifiedUser,
        "Explicit employee UID link missing",
        "No explicitly linked employee access record was found."
      );
    }
    const expectedEmployeeId = cleanValue(verifiedUser.identityEmployeeId);
    if ((employeeRow?.id || "") !== expectedEmployeeId) {
      return denyBootstrap(
        req,
        verifiedUser,
        "Employee link changed after bridge",
        "Employee identity links require manual review."
      );
    }
    if (employee && isDisabledAccess(employee)) {
      return denyBootstrap(req, verifiedUser, "Employee account disabled", "Account disabled.");
    }
    if (employee) {
      const employeeEmails = recordEmails(employee);
      if (employeeEmails.length && !employeeEmails.includes(email)) {
        return denyBootstrap(
          req,
          verifiedUser,
          "Employee email conflict",
          "Employee identity links require manual review."
        );
      }
      if (currentUserDoc?.employeeId && cleanValue(currentUserDoc.employeeId) !== employeeRow.id) {
        return denyBootstrap(
          req,
          verifiedUser,
          "Canonical employee link conflict",
          "Employee identity links require manual review."
        );
      }
    }

    const canonicalCompanyId = cleanValue(currentUserDoc?.companyId);
    const employeeCompanyId = cleanValue(employee?.companyId);
    if (canonicalCompanyId && employeeCompanyId && canonicalCompanyId !== employeeCompanyId) {
      return denyBootstrap(
        req,
        verifiedUser,
        "Company link conflict",
        "Company access requires manual review."
      );
    }
    const companyId = canonicalCompanyId || employeeCompanyId;
    if (!companyId && !isPlatformAdmin) {
      return denyBootstrap(req, verifiedUser, "Company access missing", "Company access is not configured.");
    }
    if (cleanValue(verifiedUser.identityCompanyId) !== companyId) {
      return denyBootstrap(
        req,
        verifiedUser,
        "Company link changed after bridge",
        "Company access requires manual review."
      );
    }

    const workspaceSource = isAdmin ? currentUserDoc : employee;
    const workspace = explicitAppAccess(workspaceSource || {});
    if (!workspace.configured) {
      return denyBootstrap(
        req,
        verifiedUser,
        "Workspace access missing",
        "Workspace access is not configured."
      );
    }
    const appAccess = workspace.appAccess;
    const role = isPlatformAdmin ? "platformAdmin" : isAdmin ? "admin" : deriveRoleFromAccess();
    const defaultWorkspace = resolveDefaultWorkspace(workspaceSource || {}, appAccess);

    const now = new Date().toISOString();
    const patch = {
      uid,
      email,
      isEnabled: true,
      role,
      isService: !!appAccess.service,
      appAccess,
      defaultWorkspace,
    };
    if (companyId) patch.companyId = companyId;

    const mfaSecretDoc = (await adminReadDocument("mfaSecrets", uid)) || {};
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
    if (employeeRow?.id) patch.employeeId = employeeRow.id;

    const featureFlags = await resolveFeatureFlags(companyId);
    patch.featureFlags = featureFlags;
    const shouldWrite = !currentUserDoc || accessPatchChanged(currentUserDoc, patch);
    const writePatch = shouldWrite
      ? {
          ...patch,
          updatedAt: now,
          accessMirroredAt: now,
        }
      : {};
    const access = { ...(currentUserDoc || {}), ...patch, ...(shouldWrite ? writePatch : {}), featureFlags };

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
