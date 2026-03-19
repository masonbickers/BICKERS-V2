import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

/**
 * @typedef {Object} EmployeeAppAccess
 * @property {boolean} user
 * @property {boolean} service
 *
 * @typedef {Object} ResolvedEmployeeAccess
 * @property {"employee"|"service"|"hybrid"} role
 * @property {boolean} isService
 * @property {EmployeeAppAccess} appAccess
 * @property {"user"|"service"} defaultWorkspace
 * @property {"employee"|"service"|"hybrid"} effectiveRole
 * @property {boolean} hasUserAccess
 * @property {boolean} hasServiceAccess
 */

export const WORKSPACE_ROUTES = {
  user: "/screens/homescreen",
  service: "/service/home",
};

export const ACTIVE_WORKSPACE_KEY = "activeWorkspace";

export const SERVICE_PATH_PREFIXES = [
  "/service",
  "/service-home",
  "/service-overview",
  "/mot-overview",
  "/maintenance",
  "/maintenance-jobs",
  "/vehicle-checks",
  "/vehicle-checkid",
  "/defects",
  "/book-work",
  "/general",
  "/immediate",
  "/usage-overview",
  "/workshop",
];

export function inferAccessFromLegacyFields(raw = {}) {
  const role = String(raw?.role || "").trim().toLowerCase();
  const legacyService = raw?.isService === true || role === "service";
  const legacyHybrid = role === "hybrid";

  return {
    user: legacyHybrid || !legacyService,
    service: legacyHybrid || legacyService,
  };
}

export function normalizeAppAccess(raw = {}) {
  const fallback = inferAccessFromLegacyFields(raw);
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

export function deriveRoleFromAccess(appAccess) {
  if (appAccess.user && appAccess.service) return "hybrid";
  if (appAccess.service) return "service";
  return "employee";
}

export function resolveDefaultWorkspace(raw = {}, appAccess = normalizeAppAccess(raw)) {
  const requested = String(raw?.defaultWorkspace || "").trim().toLowerCase();
  if (requested === "service" && appAccess.service) return "service";
  if (requested === "user" && appAccess.user) return "user";
  return appAccess.user ? "user" : "service";
}

export function resolveEmployeeAccess(raw = {}, { isAdmin = false } = {}) {
  const appAccess = isAdmin
    ? { user: true, service: true }
    : normalizeAppAccess(raw);
  const role = isAdmin ? "hybrid" : deriveRoleFromAccess(appAccess);
  const defaultWorkspace = resolveDefaultWorkspace(raw, appAccess);

  return {
    role,
    isService: !!appAccess.service,
    appAccess,
    defaultWorkspace,
    effectiveRole: role,
    hasUserAccess: !!appAccess.user,
    hasServiceAccess: !!appAccess.service,
  };
}

export function validateEmployeeAccessDraft(draft) {
  const access = {
    user: !!draft?.appAccess?.user,
    service: !!draft?.appAccess?.service,
  };
  const errors = {};

  if (!access.user && !access.service) {
    errors.appAccess = "At least one workspace must be enabled.";
  }

  if (draft?.defaultWorkspace === "service" && !access.service) {
    errors.defaultWorkspace = "Default workspace must match an enabled access.";
  }

  if (draft?.defaultWorkspace === "user" && !access.user) {
    errors.defaultWorkspace = "Default workspace must match an enabled access.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function getStoredActiveWorkspace(storage) {
  if (!storage) return null;
  try {
    const value = storage.getItem(ACTIVE_WORKSPACE_KEY);
    return value === "user" || value === "service" ? value : null;
  } catch {
    return null;
  }
}

export function setStoredActiveWorkspace(storage, workspace) {
  if (!storage || (workspace !== "user" && workspace !== "service")) return;
  try {
    storage.setItem(ACTIVE_WORKSPACE_KEY, workspace);
  } catch {}
}

export function getWorkspaceForPath(pathname = "") {
  const path = String(pathname || "").toLowerCase();
  return SERVICE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ? "service"
    : "user";
}

export function isWorkspaceAllowed(access, workspace) {
  if (!access) return false;
  if (workspace === "service") return !!access.hasServiceAccess;
  return !!access.hasUserAccess;
}

export function isPathAllowedForAccess(pathname, access) {
  return isWorkspaceAllowed(access, getWorkspaceForPath(pathname));
}

export function getWorkspaceRoute(workspace) {
  return workspace === "service" ? WORKSPACE_ROUTES.service : WORKSPACE_ROUTES.user;
}

export function resolveInitialWorkspace(access, preferredWorkspace) {
  if (!access) return "user";
  if (preferredWorkspace === "service" && access.hasServiceAccess) return "service";
  if (preferredWorkspace === "user" && access.hasUserAccess) return "user";
  return access.defaultWorkspace || (access.hasUserAccess ? "user" : "service");
}

export function selectLandingRoute(access, preferredWorkspace) {
  return getWorkspaceRoute(resolveInitialWorkspace(access, preferredWorkspace));
}

async function querySingleEmployeeBy(db, field, value) {
  if (!value) return null;
  const snap = await getDocs(query(collection(db, "employees"), where(field, "==", value), limit(1)));
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

export async function findEmployeeForUser(db, user) {
  if (!db || !user) return null;

  const candidates = [
    ["uid", user.uid],
    ["authUid", user.uid],
    ["email", String(user.email || "").trim()],
    ["email", String(user.email || "").trim().toLowerCase()],
  ];

  for (const [field, value] of candidates) {
    const row = await querySingleEmployeeBy(db, field, value);
    if (row) return row;
  }

  return null;
}
