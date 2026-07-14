import { adminCreateDocument, adminReadDocument } from "../_firebaseAdminRest";
import { isAdminEmail, isPlatformAdminEmail } from "@/app/utils/adminAccess";
import { evaluateActiveMember } from "../_accessPolicy";

const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  process.env.FIREBASE_API_KEY ||
  "AIzaSyBiKz88kMEAB5C-oRn3qN6E7KooDcmYTWE";

const FIREBASE_PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "bickers-booking";

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export function readBearerToken(req) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
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

async function writeBlockedAccessLog(req, verifiedUser, reason) {
  try {
    await adminCreateDocument("loginSecurityLogs", {
      uid: verifiedUser?.uid || "",
      email: verifiedUser?.email || "",
      loginMethod: "protected-api",
      status: "blocked",
      outcome: "blocked",
      reason,
      ip: req ? clientIp(req) : "",
      userAgent: req ? headerValue(req.headers, "user-agent") : "",
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Blocked access log failed:", error);
  }
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1] || "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

export async function verifyFirebaseIdToken(idToken) {
  if (!idToken || !FIREBASE_WEB_API_KEY) return null;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const user = Array.isArray(data?.users) ? data.users[0] : null;
  if (!user?.localId) return null;
  const tokenPayload = decodeJwtPayload(idToken);
  const email = String(
    user.email ||
      tokenPayload.email ||
      tokenPayload.companyEmail ||
      ""
  ).trim().toLowerCase();

  return {
    uid: user.localId,
    email,
  };
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("mapValue" in value) {
    return firestoreFieldsToJs(value.mapValue?.fields || {});
  }
  if ("arrayValue" in value) {
    return (value.arrayValue?.values || []).map(firestoreValueToJs);
  }
  return undefined;
}

function firestoreFieldsToJs(fields = {}) {
  return Object.entries(fields).reduce((acc, [key, value]) => {
    acc[key] = firestoreValueToJs(value);
    return acc;
  }, {});
}

export function jsToFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(jsToFirestoreValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.entries(value).reduce((acc, [key, nestedValue]) => {
          acc[key] = jsToFirestoreValue(nestedValue);
          return acc;
        }, {}),
      },
    };
  }
  return { stringValue: String(value) };
}

function buildUpdateMask(fieldPaths) {
  const params = new URLSearchParams();
  fieldPaths.forEach((fieldPath) => params.append("updateMask.fieldPaths", fieldPath));
  params.append("currentDocument.exists", "true");
  return params.toString();
}

export async function readFirestoreDocument(collection, documentId, idToken) {
  const res = await fetch(
    `${FIRESTORE_BASE_URL}/${collection}/${encodeURIComponent(documentId)}`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    }
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore read failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return firestoreFieldsToJs(data.fields || {});
}

export async function updateFirestoreDocument(collection, documentId, patch, idToken, options = {}) {
  const fields = Object.entries(patch).reduce((acc, [key, value]) => {
    if (!options.deleteFields?.includes(key)) {
      acc[key] = jsToFirestoreValue(value);
    }
    return acc;
  }, {});

  const fieldPaths = [...Object.keys(patch), ...(options.deleteFields || [])];
  const res = await fetch(
    `${FIRESTORE_BASE_URL}/${collection}/${encodeURIComponent(documentId)}?${buildUpdateMask(fieldPaths)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore update failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function createFirestoreDocument(collection, data, idToken) {
  const fields = Object.entries(data).reduce((acc, [key, value]) => {
    acc[key] = jsToFirestoreValue(value);
    return acc;
  }, {});

  const res = await fetch(`${FIRESTORE_BASE_URL}/${collection}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore create failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function requireAdminFromRequest(req) {
  const access = await requireActiveMemberFromRequest(req, { roles: ["admin", "platformAdmin"] });
  if (access.error) return access;
  return access;
}

export async function requireActiveMemberFromRequest(req, options = {}) {
  const idToken = readBearerToken(req);
  const verifiedUser = await verifyFirebaseIdToken(idToken);
  if (!verifiedUser?.uid) {
    await writeBlockedAccessLog(req, null, "Not signed in");
    return { error: jsonError("Not signed in.", 401) };
  }

  const userData = await adminReadDocument("users", verifiedUser.uid);
  if (!userData) {
    await writeBlockedAccessLog(req, verifiedUser, "Missing user access record");
    return { error: jsonError("No active application access record was found.", 403) };
  }

  const role = String(userData?.role || "").trim();
  const emailAdminRole = isPlatformAdminEmail(verifiedUser.email)
    ? "platformAdmin"
    : isAdminEmail(verifiedUser.email)
      ? "admin"
      : "";
  const normalizedRole = emailAdminRole || normalizeServerRole(role);

  const decision = evaluateActiveMember({
    verifiedUser,
    userData,
    role: normalizedRole,
    expectedCompanyId: String(options.companyId || "").trim(),
    allowedRoles: Array.isArray(options.roles) ? options.roles : [],
  });
  if (!decision.allowed) {
    await writeBlockedAccessLog(req, verifiedUser, decision.reason);
    return { error: jsonError(`${decision.reason}.`, decision.status) };
  }
  const companyId = decision.companyId;

  const method = String(req?.method || "GET").toUpperCase();
  if (!options.allowDuringMaintenance && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const platformSettings = (await adminReadDocument("settings", "platform")) || {};
    if (platformSettings.maintenanceMode === true) {
      return {
        error: Response.json(
          { error: "The system is in maintenance mode. Writes are temporarily frozen." },
          { status: 503, headers: { "Retry-After": "3600" } }
        ),
      };
    }
  }

  return {
    idToken,
    verifiedUser,
    companyId,
    userData: { ...userData, companyId, role: normalizedRole || role || userData?.role || "" },
  };
}

export async function requirePlatformAdminFromRequest(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin;
  if (!isPlatformAdminAccess(admin.userData)) {
    await writeBlockedAccessLog(req, admin.verifiedUser, "Platform admin access required");
    return { error: jsonError("Platform admin access required.", 403) };
  }
  return admin;
}

export function normalizeServerRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (["platformadmin", "platform admin", "superadmin", "super admin"].includes(value)) return "platformAdmin";
  if (["admin", "companyadmin", "company admin"].includes(value)) return "admin";
  return "user";
}

export function isPlatformAdminAccess(userData = {}) {
  return normalizeServerRole(userData?.role) === "platformAdmin";
}

export function adminCompanyId(userData = {}) {
  return String(userData?.companyId || "").trim();
}

export function canAccessCompany(adminUserData = {}, companyId = "") {
  if (isPlatformAdminAccess(adminUserData)) return true;
  const targetCompanyId = String(companyId || "").trim();
  return !!targetCompanyId && targetCompanyId === adminCompanyId(adminUserData);
}

export function filterDocsForAdminCompany(docs = [], adminUserData = {}) {
  if (isPlatformAdminAccess(adminUserData)) return docs;
  const companyId = adminCompanyId(adminUserData);
  if (!companyId) return [];
  return docs.filter(({ data }) => String(data?.companyId || "").trim() === companyId);
}
