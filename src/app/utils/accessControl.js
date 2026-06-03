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
 * @property {"user"} role
 * @property {boolean} isService
 * @property {EmployeeAppAccess} appAccess
 * @property {"user"|"service"} defaultWorkspace
 * @property {"user"} effectiveRole
 * @property {boolean} hasUserAccess
 * @property {boolean} hasServiceAccess
 */

export const WORKSPACE_ROUTES = {
  user: "/screens/homescreen",
  service: "/service/home",
};

export const ACTIVE_WORKSPACE_KEY = "activeWorkspace";

export const PLATFORM_ROLES = [
  "platformAdmin",
  "admin",
  "user",
];

export const PLATFORM_MODULES = [
  ["diary", "Diary"],
  ["bookings", "Bookings"],
  ["workshop", "Workshop"],
  ["hr", "HR"],
  ["timesheets", "Timesheets"],
  ["holidays", "Holidays"],
  ["finance", "Finance"],
  ["invoices", "Invoices"],
  ["vehicles", "Vehicles"],
  ["equipment", "Equipment"],
  ["settings", "Settings"],
  ["assistant", "Assistant"],
];

export const REQUIRED_USER_ACCESS_FIELDS = [
  "role",
  "appAccess",
  "defaultWorkspace",
  "companyId",
  "isEnabled",
];

export const ROLE_DEFINITIONS = {
  platformAdmin: {
    label: "Platform Admin",
    scope: "All companies",
    defaultWorkspace: "user",
    description: "Server-verified super admin with platform-wide company, user, security and audit access.",
  },
  admin: {
    label: "Admin",
    scope: "Application admin",
    defaultWorkspace: "user",
    description: "Manages application users, access, MFA resets and admin workflows.",
  },
  user: {
    label: "User",
    scope: "Application user",
    defaultWorkspace: "user",
    description: "Standard access controlled by appAccess and module settings.",
  },
};

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

export const ADMIN_PATH_PREFIXES = [
  "/admin",
  "/platform-admin",
  "/employees",
  "/add-employee",
  "/edit-employee",
  "/deleted-bookings",
];

export const DEFAULT_FEATURE_FLAGS = {
  diary: true,
  bookings: true,
  workshop: true,
  vehicles: true,
  equipment: true,
  hr: true,
  uCrane: true,
  jobSheets: true,
  employees: true,
  hAndS: true,
  statistics: true,
  timesheets: true,
  holidays: true,
  finance: true,
  invoices: true,
  assistant: true,
  mobileApp: true,
  pushNotifications: true,
  passkeys: true,
  mfa: true,
  userCodeLogin: false,
  settings: true,
};

export const MODULE_ROUTE_PREFIXES = {
  diary: ["/dashboard", "/booking-page", "/wall-view"],
  bookings: ["/bookings", "/create-booking", "/edit-booking", "/booking-drafts", "/book-work", "/deleted-bookings", "/dashboard", "/booking-page", "/wall-view"],
  workshop: ["/workshop", "/service", "/service-home", "/service-overview", "/maintenance", "/maintenance-jobs", "/mot-overview", "/mot-history-sync", "/defects", "/general", "/immediate", "/usage-overview"],
  vehicles: ["/vehicle-home", "/vehicles", "/vehicle-edit", "/vehicle-info", "/vehicle-activity", "/vehicle-checks", "/vehicle-checkid", "/equipment", "/add-equipment", "/edit-equipment", "/mot-overview", "/mot-history-sync", "/preplist", "/preplist-dashboard"],
  equipment: ["/equipment", "/add-equipment", "/edit-equipment"],
  hr: ["/hr", "/hr-policies", "/holiday-allowance", "/holiday-form", "/holiday-usage", "/sick-leave", "/timesheets", "/timesheet-id"],
  employees: ["/employees", "/employee-home", "/add-employee", "/edit-employee"],
  uCrane: ["/u-crane", "/u-crane-booking", "/u-crane-crew", "/u-crane-edit"],
  jobSheets: ["/job-home", "/job-sheet", "/job-numbers", "/job-summary", "/stunt-prep", "/preplist", "/preplist-dashboard"],
  hAndS: ["/h-and-s", "/defects"],
  statistics: ["/statistics"],
  timesheets: ["/timesheets", "/timesheet-id"],
  holidays: ["/holiday-allowance", "/holiday-form", "/holiday-usage"],
  finance: ["/finance-dashboard", "/finance-home", "/finance-queue", "/invoice", "/invoice-view", "/ready-invoice", "/invoiced", "/paid"],
  invoices: ["/finance-dashboard", "/finance-queue", "/invoice", "/invoice-view", "/ready-invoice", "/invoiced", "/paid"],
  assistant: ["/assistant"],
  settings: ["/settings"],
};

export function normalizeFeatureFlags(...sources) {
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

export function moduleForPath(pathname = "") {
  const path = String(pathname || "").toLowerCase();
  const entries = Object.entries(MODULE_ROUTE_PREFIXES).sort((a, b) => {
    const longestA = Math.max(...a[1].map((prefix) => prefix.length));
    const longestB = Math.max(...b[1].map((prefix) => prefix.length));
    return longestB - longestA;
  });

  for (const [moduleKey, prefixes] of entries) {
    if (prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return moduleKey;
    }
  }

  return null;
}

export function isModuleEnabledForPath(pathname, featureFlags = DEFAULT_FEATURE_FLAGS) {
  const moduleKey = moduleForPath(pathname);
  if (!moduleKey) return true;
  return normalizeFeatureFlags(featureFlags)[moduleKey] !== false;
}

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
  if (
    raw?.active === false ||
    raw?.archived === true ||
    raw?.isArchived === true ||
    raw?.disabled === true ||
    raw?.appDisabled === true ||
    String(raw?.role || "").trim().toLowerCase() === "archived"
  ) {
    return { user: false, service: false };
  }

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

export function normalizePlatformRole(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  const aliases = {
    platformadmin: "platformAdmin",
    "platform admin": "platformAdmin",
    superadmin: "platformAdmin",
    "super admin": "platformAdmin",
    companyadmin: "admin",
    manager: "user",
    employee: "user",
    readonlyuser: "user",
    "read-only user": "user",
    "read only user": "user",
    service: "user",
    hybrid: "user",
    archived: "user",
  };
  return aliases[key] || PLATFORM_ROLES.find((role) => role.toLowerCase() === key) || "user";
}

export function derivePlatformRoleFromAccess(raw = {}) {
  const normalizedRole = normalizePlatformRole(raw?.role);
  return normalizedRole === "platformAdmin" || normalizedRole === "admin" ? normalizedRole : "user";
}

export function getRoleDefinition(role) {
  const normalizedRole = normalizePlatformRole(role);
  return ROLE_DEFINITIONS[normalizedRole] || ROLE_DEFINITIONS.user;
}

export function roleCanAccessWorkspace(role, workspace, appAccess = {}) {
  const normalizedRole = normalizePlatformRole(role);
  if (normalizedRole === "platformAdmin" || normalizedRole === "admin") return true;
  if (workspace === "service") {
    return !!appAccess.service;
  }
  return normalizedRole === "user" && !!appAccess.user;
}

export function getRoleModulePermission(role, moduleKey) {
  const normalizedRole = normalizePlatformRole(role);
  if (normalizedRole === "platformAdmin") return "All companies";
  if (normalizedRole === "admin") return "Admin";
  return "App access";
}

export function getPermissionMatrixRows(moduleEntries = PLATFORM_MODULES, roles = PLATFORM_ROLES) {
  return moduleEntries.map(([moduleKey, moduleLabel]) => ({
    moduleKey,
    moduleLabel,
    permissions: roles.reduce((acc, role) => {
      acc[role] = getRoleModulePermission(role, moduleKey);
      return acc;
    }, {}),
  }));
}

export function getRequiredAccessFieldStatus(user = {}) {
  const appAccess = normalizeAppAccess(user);
  const defaultWorkspace = resolveDefaultWorkspace(user, appAccess);
  return [
    {
      field: "role",
      value: normalizePlatformRole(user?.role),
      status: user?.role ? "Configured" : "Defaulted",
      detail: "Canonical role used by platform permission checks.",
    },
    {
      field: "appAccess",
      value: `user: ${appAccess.user ? "yes" : "no"}, service: ${appAccess.service ? "yes" : "no"}`,
      status: appAccess.user || appAccess.service ? "Configured" : "Missing",
      detail: "Controls user and service workspace entry.",
    },
    {
      field: "defaultWorkspace",
      value: defaultWorkspace,
      status: user?.defaultWorkspace ? "Configured" : "Defaulted",
      detail: "Initial workspace after sign-in.",
    },
    {
      field: "companyId",
      value: user?.companyId || "-",
      status: user?.companyId ? "Configured" : "Missing",
      detail: "Required for company-scoped roles.",
    },
    {
      field: "isEnabled",
      value: user?.isEnabled === false ? "false" : "true",
      status: user?.isEnabled === false ? "Disabled" : "Enabled",
      detail: "Master switch for platform access.",
    },
  ];
}

export function deriveRoleFromAccess(appAccess) {
  return "user";
}

export function resolveDefaultWorkspace(raw = {}, appAccess = normalizeAppAccess(raw)) {
  const requested = String(raw?.defaultWorkspace || "").trim().toLowerCase();
  if (requested === "service" && appAccess.service) return "service";
  if (requested === "user" && appAccess.user) return "user";
  if (!appAccess.user && !appAccess.service) return "user";
  return appAccess.user ? "user" : "service";
}

export function resolveEmployeeAccess(raw = {}, { isAdmin = false } = {}) {
  const appAccess = isAdmin
    ? { user: true, service: true }
    : normalizeAppAccess(raw);
  const role = "user";
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

export function hasMirroredAccessRecord(raw = {}) {
  const role = String(raw?.role || "").trim().toLowerCase();
  return (
    raw?.appAccess && typeof raw.appAccess === "object"
  ) || ["platformadmin", "admin", "companyadmin", "manager", "user", "employee", "service", "hybrid", "archived"].includes(role);
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

export function isAdminPath(pathname = "") {
  const path = String(pathname || "").toLowerCase();
  return ADMIN_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
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
