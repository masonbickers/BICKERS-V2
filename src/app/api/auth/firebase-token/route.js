import { auth, currentUser } from "@clerk/nextjs/server";
import {
  adminCreateDocument,
  adminListDocuments,
  createFirebaseCustomToken,
} from "@/app/api/_firebaseAdminRest";
import { isAccountDisabled } from "@/app/utils/accountAccess";
import { preferredVerifiedEmail } from "@/app/utils/clerkFirebaseLink";

export const runtime = "nodejs";

const DIRECTORY_CACHE_TTL_MS = 30000;
const ADMIN_READ_RETRY_DELAYS_MS = [0, 250, 750];
const directoryCache = {
  expiresAt: 0,
  value: null,
  inFlight: null,
};

const wait = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

async function loadIdentityDirectory() {
  if (directoryCache.value && directoryCache.expiresAt > Date.now()) {
    return directoryCache.value;
  }
  if (directoryCache.inFlight) return directoryCache.inFlight;

  directoryCache.inFlight = (async () => {
    let lastError = null;
    for (const delayMs of ADMIN_READ_RETRY_DELAYS_MS) {
      if (delayMs) await wait(delayMs);
      try {
        const value = await Promise.all([
          adminListDocuments("users"),
          adminListDocuments("employees"),
        ]);
        directoryCache.value = value;
        directoryCache.expiresAt = Date.now() + DIRECTORY_CACHE_TTL_MS;
        return value;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Identity directory is unavailable.");
  })();

  try {
    return await directoryCache.inFlight;
  } finally {
    directoryCache.inFlight = null;
  }
}

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const cleanValue = (value) => String(value || "").trim();
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const explicitUid = (value) => {
  const uid = cleanValue(value);
  return UID_PATTERN.test(uid) ? uid : "";
};

const recordEmails = (record = {}) =>
  ["email", "workEmail", "personalEmail", "emailAddress", "contactEmail"]
    .map((key) => normalizeEmail(record[key]))
    .filter(Boolean);

const recordClerkIds = (record = {}) =>
  [record?.clerkUserId, record?.auth?.clerkUserId].map(cleanValue).filter(Boolean);

const hasConflictingClerkIds = (record = {}) => new Set(recordClerkIds(record)).size > 1;

function explicitClerkUid(clerkUser) {
  const rawValues = [clerkUser?.externalId, clerkUser?.privateMetadata?.firebaseUid]
    .map(cleanValue)
    .filter(Boolean);
  const normalizedValues = rawValues.map(explicitUid);
  const values = [...new Set(normalizedValues.filter(Boolean))];
  return {
    invalid: normalizedValues.some((value) => !value) || values.length > 1,
    uid: values.length === 1 ? values[0] : "",
  };
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

function canonicalRole(value) {
  const role = cleanValue(value).toLowerCase();
  if (role === "platformadmin") return "platformAdmin";
  if (role === "admin") return "admin";
  return "user";
}

function explicitWorkspaceAccess(record = {}) {
  const source = record?.appAccess && typeof record.appAccess === "object" ? record.appAccess : {};
  const configured = typeof source.user === "boolean" || typeof source.service === "boolean";
  return {
    configured,
    appAccess: {
      user: source.user === true,
      service: source.service === true,
    },
  };
}

function isEmployeeDisabled(record = {}) {
  return (
    isAccountDisabled(record) ||
    String(record?.status || "").trim().toLowerCase() === "disabled"
  );
}

function headerValue(headers, name) {
  return String(headers?.get?.(name) || "").trim();
}

function clientIp(req) {
  const forwarded = headerValue(req?.headers, "x-forwarded-for");
  return (
    headerValue(req?.headers, "cf-connecting-ip") ||
    headerValue(req?.headers, "x-real-ip") ||
    String(forwarded.split(",")[0] || "").trim() ||
    ""
  );
}

async function denyBridge(req, clerkUserId, email, reason, message, status = 403) {
  try {
    await adminCreateDocument("loginSecurityLogs", {
      uid: "",
      email,
      clerkUserId,
      loginMethod: "clerk-firebase-bridge",
      status: "blocked",
      outcome: "blocked",
      reason,
      ip: clientIp(req),
      userAgent: headerValue(req?.headers, "user-agent"),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[clerk-firebase-token] blocked access log failed:", error);
  }
  return Response.json({ error: message }, { status });
}

export async function POST(req) {
  try {
    const { isAuthenticated, userId: clerkUserId } = await auth();
    if (!isAuthenticated || !clerkUserId) {
      return denyBridge(req, "", "", "Clerk session missing", "Not signed in with Clerk.", 401);
    }

    const clerkUser = await currentUser();
    const email = preferredVerifiedEmail(clerkUser);
    if (!email) {
      return denyBridge(
        req,
        clerkUserId,
        "",
        "Verified Clerk email missing",
        "A verified Clerk email address is required."
      );
    }
    if (!email.endsWith("@bickers.co.uk")) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Clerk email domain denied",
        "Only @bickers.co.uk accounts can access this app."
      );
    }

    const [users, employees] = await loadIdentityDirectory();

    const clerkUid = explicitClerkUid(clerkUser);
    if (clerkUid.invalid) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Conflicting explicit Clerk UID links",
        "Account identity links require manual review."
      );
    }

    const clerkLinkedUsers = users.filter(({ data }) => recordClerkIds(data).includes(clerkUserId));
    if (clerkLinkedUsers.length > 1) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Duplicate canonical Clerk links",
        "Account identity links require manual review."
      );
    }

    const uidCandidates = [];
    if (clerkUid.uid) uidCandidates.push(clerkUid.uid);
    const clerkLinkedUser = clerkLinkedUsers[0] || null;
    if (clerkLinkedUser) {
      const linkedUid = explicitUid(clerkLinkedUser.data?.uid);
      if (!linkedUid || clerkLinkedUser.id !== linkedUid) {
        return denyBridge(
          req,
          clerkUserId,
          email,
          "Canonical UID conflict",
          "Canonical account identity requires manual review."
        );
      }
      uidCandidates.push(linkedUid);
    }

    const uniqueUidCandidates = [...new Set(uidCandidates)];
    if (uniqueUidCandidates.length !== 1) {
      const hasEmailHint =
        users.some(({ data }) => recordEmails(data).includes(email)) ||
        employees.some(({ data }) => recordEmails(data).includes(email));
      return denyBridge(
        req,
        clerkUserId,
        email,
        uniqueUidCandidates.length > 1 ? "Conflicting explicit UID links" : "Explicit UID link missing",
        hasEmailHint
          ? "A matching account exists but requires an explicit UID link."
          : "No explicit account UID link was found."
      );
    }

    const uid = uniqueUidCandidates[0];
    const canonicalRow = users.find(({ id }) => id === uid) || null;
    const canonicalUser = canonicalRow?.data || null;
    if (canonicalUser) {
      if (explicitUid(canonicalUser.uid) !== uid) {
        return denyBridge(
          req,
          clerkUserId,
          email,
          "Canonical UID conflict",
          "Canonical account identity requires manual review."
        );
      }
      const linkedClerkIds = recordClerkIds(canonicalUser);
      if (hasConflictingClerkIds(canonicalUser) || (linkedClerkIds.length && !linkedClerkIds.includes(clerkUserId))) {
        return denyBridge(
          req,
          clerkUserId,
          email,
          "Canonical Clerk link conflict",
          "Canonical account identity requires manual review."
        );
      }
      if (isEmployeeDisabled(canonicalUser)) {
        return denyBridge(req, clerkUserId, email, "Canonical account disabled", "This account has been disabled.");
      }
      const canonicalEmails = recordEmails(canonicalUser);
      if (canonicalEmails.length && !canonicalEmails.includes(email)) {
        return denyBridge(
          req,
          clerkUserId,
          email,
          "Canonical email conflict",
          "Canonical account identity requires manual review."
        );
      }
    }

    const employeeLinks = employees.map((row) => ({ ...row, link: employeeUidLink(row.data) }));
    const relevantConflicts = employeeLinks.filter(({ data, link }) => {
      if (!link.conflict) return false;
      const rawLinkedUids = [data?.authUid, data?.uid].map(explicitUid).filter(Boolean);
      return rawLinkedUids.includes(uid) || recordEmails(data).includes(email);
    });
    if (relevantConflicts.length) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Conflicting employee UID fields",
        "Employee identity links require manual review."
      );
    }
    const linkedEmployees = employeeLinks.filter(({ link }) => !link.conflict && link.uid === uid);
    if (linkedEmployees.length > 1) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Duplicate employee UID links",
        "Employee identity links require manual review."
      );
    }
    const employeeLinkedElsewhere = employeeLinks.some(
      ({ data, link }) =>
        !link.conflict && link.uid && link.uid !== uid && recordEmails(data).includes(email)
    );
    if (employeeLinkedElsewhere) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Employee linked to another UID",
        "Employee identity links require manual review."
      );
    }

    const role = canonicalRole(canonicalUser?.role);
    const isPlatformAdmin = role === "platformAdmin";
    const isAdmin = isPlatformAdmin || role === "admin";
    const employeeRow = isAdmin ? null : linkedEmployees[0] || null;
    const employee = employeeRow?.data || null;

    if (!isAdmin && !employee) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Explicit employee UID link missing",
        "No explicitly linked employee access record was found."
      );
    }
    if (employee && isEmployeeDisabled(employee)) {
      return denyBridge(req, clerkUserId, email, "Employee account disabled", "This account has been disabled.");
    }
    if (employee) {
      const employeeEmails = recordEmails(employee);
      if (employeeEmails.length && !employeeEmails.includes(email)) {
        return denyBridge(
          req,
          clerkUserId,
          email,
          "Employee email conflict",
          "Employee identity links require manual review."
        );
      }
      if (canonicalUser?.employeeId && cleanValue(canonicalUser.employeeId) !== employeeRow.id) {
        return denyBridge(
          req,
          clerkUserId,
          email,
          "Canonical employee link conflict",
          "Employee identity links require manual review."
        );
      }
    }

    const canonicalCompanyId = cleanValue(canonicalUser?.companyId);
    const employeeCompanyId = cleanValue(employee?.companyId);
    if (canonicalCompanyId && employeeCompanyId && canonicalCompanyId !== employeeCompanyId) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Company link conflict",
        "Company access requires manual review."
      );
    }
    const companyId = canonicalCompanyId || employeeCompanyId;
    if (!companyId && !isPlatformAdmin) {
      return denyBridge(req, clerkUserId, email, "Company access missing", "Company access is not configured.");
    }

    const workspaceSource = isAdmin ? canonicalUser : employee;
    const workspace = explicitWorkspaceAccess(workspaceSource || {});
    if (!workspace.configured) {
      return denyBridge(
        req,
        clerkUserId,
        email,
        "Workspace access missing",
        "Workspace access is not configured."
      );
    }

    const customToken = createFirebaseCustomToken(uid, {
      authMethod: "clerk",
      clerkUserId,
      companyEmail: email,
      verifiedClerkEmail: true,
      identityLinkVersion: 2,
      identityEmployeeId: employeeRow?.id || "",
      identityCompanyId: companyId,
    });

    return Response.json({ customToken, uid, email });
  } catch (error) {
    console.error("[clerk-firebase-token] failed:", error);
    return Response.json(
      {
        error: "The application session service is temporarily unavailable. Retrying...",
        code: "SESSION_BRIDGE_UNAVAILABLE",
      },
      { status: 503 }
    );
  }
}
