import {
  adminCreateDocument,
  adminDeleteDocument,
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { jsonError, requirePlatformAdminFromRequest } from "@/app/api/admin/_lib";
import { buildEmployeeUserLinkReport, validateEmployeeUserLink } from "@/app/api/platform/_lib";
import { TENANT_COLLECTION_MANIFEST } from "@/app/config/tenantCollections";

export const runtime = "nodejs";

const DEFAULT_COMPANY_ID = "bickers-action";
const COMPANY_STATUSES = new Set(["active", "suspended", "archived"]);
const BUSINESS_COLLECTIONS = TENANT_COLLECTION_MANIFEST;
const FEATURE_FLAGS = {
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
  mobileApp: true,
  pushNotifications: true,
};

const DEFAULT_BRANDING = {
  appName: "BAS Software",
  companyLogo: "",
  platformLogo: "/bas-software-logo.png",
  primaryColor: "#0f172a",
  secondaryColor: "#0369a1",
  accentColor: "#f59e0b",
  sidebarColor: "#0f172a",
  loginTitle: "BAS Software",
  loginSubtitle: "Secure company access",
  mobileAppName: "BAS Mobile",
};

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function cleanId(value) {
  return String(value || "").trim();
}

function normalizeAccessRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "platformadmin" || role === "superadmin") return "platformAdmin";
  if (role === "admin" || role === "companyadmin") return "admin";
  return "user";
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeFeatureFlags(raw = {}) {
  return Object.keys(FEATURE_FLAGS).reduce((acc, key) => {
    acc[key] = bool(raw?.[key], FEATURE_FLAGS[key]);
    return acc;
  }, {});
}

function normalizeBranding(raw = {}) {
  return Object.keys(DEFAULT_BRANDING).reduce((acc, key) => {
    const value = raw?.[key];
    acc[key] = typeof value === "string" ? value.trim().slice(0, 500) : DEFAULT_BRANDING[key];
    return acc;
  }, {});
}

function cleanInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function defaultCompany() {
  return {
    id: DEFAULT_COMPANY_ID,
    name: "Bickers Action",
    domain: "bickers.co.uk",
    status: "active",
    plan: "platform",
    maxUsers: 50,
    modules: {
      diary: true,
      bookings: true,
      workshop: true,
      hr: true,
      finance: true,
      assistant: true,
      vehicles: true,
      equipment: true,
      uCrane: true,
      jobSheets: true,
      employees: true,
      timesheets: true,
      holidays: true,
      hAndS: true,
      statistics: true,
      invoices: true,
      mobileApp: true,
      pushNotifications: true,
      mfa: true,
      settings: true,
    },
    security: {
      mfaRequired: true,
      loginAlerts: true,
      locationAlerts: true,
      rememberMfaDays: 30,
      selfSignup: false,
    },
    rules: {
      disabledUsersBlocked: true,
      adminActionsServerOnly: true,
      auditLoggingRequired: true,
      mfaResetByAdminsOnly: true,
    },
    limits: {
      storageLimitGb: 0,
      featureLimits: "",
    },
    quotas: {
      dvla: { hourlyPerUser: 30, dailyPerCompany: 300 },
      ai: { hourlyPerUser: 20, dailyPerCompany: 100 },
    },
    branding: DEFAULT_BRANDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function serializeCompany(id, data = {}) {
  const base = id === DEFAULT_COMPANY_ID ? defaultCompany() : {};
  return {
    ...base,
    ...data,
    id,
    modules: { ...(base.modules || {}), ...(data.modules || {}) },
    security: { ...(base.security || {}), ...(data.security || {}) },
    quotas: {
      dvla: { ...(base.quotas?.dvla || {}), ...(data.quotas?.dvla || {}) },
      ai: { ...(base.quotas?.ai || {}), ...(data.quotas?.ai || {}) },
    },
    rules: { ...(base.rules || {}), ...(data.rules || {}) },
    limits: { ...(base.limits || {}), ...(data.limits || {}) },
    branding: { ...(base.branding || DEFAULT_BRANDING), ...(data.branding || {}) },
  };
}

function publicUser({ id, data = {} }) {
  const appAccess = data.appAccess && typeof data.appAccess === "object" ? data.appAccess : {};
  const role = String(data.role || "").trim().toLowerCase();
  const legacyService = data.isService === true || role === "service";
  const legacyHybrid = role === "hybrid";
  const userAccess =
    typeof appAccess.user === "boolean" ? appAccess.user : legacyHybrid || !legacyService;
  const serviceAccess =
    typeof appAccess.service === "boolean" ? appAccess.service : legacyHybrid || legacyService;

  return {
    id,
    uid: data.uid || id,
    email: cleanEmail(data.email),
    name: data.name || data.displayName || "",
    role: normalizeAccessRole(data.role),
    isEnabled: data.isEnabled !== false,
    appAccess: {
      user: userAccess,
      service: serviceAccess,
    },
    defaultWorkspace: data.defaultWorkspace || "user",
    companyId: data.companyId || DEFAULT_COMPANY_ID,
    phoneVerified: data.phoneVerified === true,
    mfaEnabled: data.mfaEnabled === true,
    mfaMethod: data.mfaMethod || "",
    mfaResetRequired: data.mfaResetRequired === true,
    passkeyEnabled: data.passkeyEnabled === true,
    employeeId: data.employeeId || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

function publicEmployee({ id, data = {} }) {
  return {
    id,
    uid: data.uid || "",
    authUid: data.authUid || "",
    email: cleanEmail(data.email || data.workEmail || data.personalEmail || data.emailAddress),
    name: data.name || data.fullName || data.employeeName || "",
    role: data.role || "employee",
    active: data.active !== false && data.archived !== true && data.disabled !== true,
    isService: data.isService === true,
    companyId: data.companyId || DEFAULT_COMPANY_ID,
    userCodePresent: !!(data.userCode || data.employeeCode || data.code || data.loginCode),
    updatedAt: data.updatedAt || "",
  };
}

function accessUserFromEmployee(employee = {}) {
  const uid = cleanId(employee.authUid || employee.uid);
  if (!uid) return null;
  const role = String(employee.role || "").trim().toLowerCase();
  const isService = employee.isService === true || role === "service";
  return {
    id: uid,
    uid,
    email: cleanEmail(employee.email || employee.workEmail || employee.personalEmail || employee.emailAddress),
    name: employee.name || employee.fullName || employee.employeeName || "",
    role: "user",
    isEnabled: employee.isEnabled !== false && employee.disabled !== true && employee.archived !== true,
    appAccess: { user: !isService, service: isService },
    defaultWorkspace: isService ? "service" : "user",
    companyId: employee.companyId || DEFAULT_COMPANY_ID,
    phoneVerified: employee.phoneVerified === true,
    mfaEnabled: false,
    mfaMethod: "",
    mfaResetRequired: false,
    passkeyEnabled: false,
    employeeId: employee.id || employee.employeeId || "",
    source: "employee-link",
    createdAt: employee.createdAt || "",
    updatedAt: employee.updatedAt || "",
  };
}

function mergeAccessUsers(userDocs = [], employeeDocs = []) {
  const byUid = new Map();

  userDocs.forEach((doc) => {
    const user = publicUser(doc);
    const uid = cleanId(user.uid || user.id);
    if (uid) byUid.set(uid, { ...user, uid });
  });

  employeeDocs.map(publicEmployee).forEach((employee) => {
    const linkedUser = accessUserFromEmployee(employee);
    if (!linkedUser) return;
    const existing = byUid.get(linkedUser.uid);
    byUid.set(linkedUser.uid, {
      ...linkedUser,
      ...(existing || {}),
      email: existing?.email || linkedUser.email,
      name: existing?.name || linkedUser.name,
      companyId: existing?.companyId || linkedUser.companyId,
      employeeId: existing?.employeeId || linkedUser.employeeId,
      source: existing ? existing.source || "users" : linkedUser.source,
    });
  });

  return Array.from(byUid.values()).sort((a, b) =>
    String(a.email || a.uid || a.id || "").localeCompare(String(b.email || b.uid || b.id || ""))
  );
}

function isPushTokenUserDoc(data = {}) {
  const keys = Object.keys(data || {}).filter((key) => data[key] !== undefined && data[key] !== "");
  if (!keys.length) return false;
  const deviceFields = new Set([
    "deviceToken",
    "deviceTokens",
    "fcmToken",
    "pushToken",
    "expoPushToken",
    "token",
    "deviceId",
    "deviceName",
    "platform",
    "createdAt",
    "updatedAt",
    "lastSeenAt",
  ]);
  const hasToken = keys.some((key) => /token/i.test(key));
  return hasToken && keys.every((key) => deviceFields.has(key));
}

function duplicateUserGroups(users = []) {
  const byEmail = users.reduce((acc, user) => {
    const email = cleanEmail(user.data?.email);
    if (!email) return acc;
    if (!acc[email]) acc[email] = [];
    acc[email].push(user);
    return acc;
  }, {});
  return Object.entries(byEmail)
    .filter(([, rows]) => rows.length > 1)
    .map(([email, rows]) => ({ email, rows }));
}

function cleanupTask(id, label, rows, safeAction, { canRun = false, destructive = false, businessData = false } = {}) {
  return {
    id,
    label,
    count: rows.length,
    safeAction,
    canRun,
    destructive,
    businessData,
    preview: rows.slice(0, 12),
  };
}

async function listBusinessDocsMissingCompanyId() {
  const businessMissing = [];
  await Promise.all(
    BUSINESS_COLLECTIONS.map(async (collectionName) => {
      try {
        const docs = await adminListDocuments(collectionName);
        const missing = docs
          .filter(({ data }) => !data.companyId)
          .map(({ id, data }) => ({
            collection: collectionName,
            id,
            label: data.jobNumber || data.name || data.title || data.email || data.vehicleName || data.registration || "",
            createdAt: data.createdAt || data.updatedAt || data.date || data.start || "",
          }));
        businessMissing.push(...missing);
      } catch (error) {
        businessMissing.push({ collection: collectionName, id: "scan-error", label: error?.message || "Could not scan collection" });
      }
    })
  );
  return businessMissing;
}

async function buildCleanupPreview({ userDocs, employeeDocs }) {
  const users = userDocs.map(publicUser);
  const employees = employeeDocs.map(publicEmployee);
  const employeeById = new Set(employees.map((employee) => employee.id).filter(Boolean));
  const duplicateGroups = duplicateUserGroups(userDocs);
  const duplicateRows = duplicateGroups.flatMap(({ email, rows }) =>
    rows.map(({ id, data }) => ({ id, email, uid: data.uid || id, isEnabled: data.isEnabled !== false, role: data.role || "" }))
  );
  const disabledDuplicateRows = duplicateGroups.flatMap(({ email, rows }) =>
    rows
      .filter(({ data }) => data.isEnabled === false || data.disabled === true || data.appDisabled === true)
      .map(({ id, data }) => ({ id, email, uid: data.uid || id, role: data.role || "" }))
  );
  const userWithoutEmployeeLink = users
    .filter((user) => user.role !== "platformAdmin" && user.role !== "admin")
    .filter((user) => !user.employeeId || !employeeById.has(user.employeeId))
    .map((user) => ({ id: user.id, uid: user.uid, email: user.email, companyId: user.companyId, employeeId: user.employeeId || "" }));
  const employeesWithoutAuthUid = employees
    .filter((employee) => !employee.authUid && !employee.uid)
    .map((employee) => ({ id: employee.id, name: employee.name, email: employee.email, companyId: employee.companyId }));
  const legacyMfaSecretUsers = userDocs
    .filter(({ data }) => String(data?.mfaSecret || "").trim())
    .map(({ id, data }) => ({ id, uid: data.uid || id, email: cleanEmail(data.email), companyId: data.companyId || DEFAULT_COMPANY_ID }));
  const pushTokenUserRows = userDocs
    .filter(({ data }) => isPushTokenUserDoc(data))
    .map(({ id, data }) => ({ id, deviceName: data.deviceName || data.deviceId || id, platform: data.platform || "", updatedAt: data.updatedAt || "" }));
  const linkReport = await buildEmployeeUserLinkReport();

  const businessMissing = await listBusinessDocsMissingCompanyId();

  return [
    cleanupTask("usersWithoutEmployeeLink", "Users without employee link", userWithoutEmployeeLink, "Preview and link manually in Employee Linking.", { businessData: false }),
    cleanupTask("employeesWithoutAuthUid", "Employees without authUid", employeesWithoutAuthUid, "Preview and link manually in Employee Linking.", { businessData: false }),
    cleanupTask("duplicateEmployeeAuthLinks", "Duplicate employee auth links", linkReport.duplicateEmployeeAuthLinks, "Review and repair so each auth user links to one employee.", { businessData: false }),
    cleanupTask("duplicateUserEmployeeLinks", "Duplicate user employee links", linkReport.duplicateUserEmployeeLinks, "Review and repair so each employee links to one auth user.", { businessData: false }),
    cleanupTask("orphanedUserLinks", "Orphaned user employee links", linkReport.orphanedUserLinks, "Review users whose employeeId no longer points to an employee.", { businessData: false }),
    cleanupTask("orphanedEmployeeLinks", "Orphaned employee auth links", linkReport.orphanedEmployeeLinks, "Review employees whose authUid no longer points to a user.", { businessData: false }),
    cleanupTask("duplicateUsers", "Duplicate users", duplicateRows, "Preview before choosing a primary access row.", { businessData: false }),
    cleanupTask("legacyMfaSecret", "Legacy users.mfaSecret", legacyMfaSecretUsers, "Clear legacy secret fields from users after mfaSecrets/{uid} is confirmed.", { canRun: true }),
    cleanupTask("disabledDuplicateRows", "Disabled duplicate rows", disabledDuplicateRows, "Can delete only disabled duplicate access rows after confirmation.", { canRun: true, destructive: true }),
    cleanupTask("pushTokenUsers", "Push tokens incorrectly stored in users", pushTokenUserRows, "Can delete push-token-only user documents after confirmation.", { canRun: true, destructive: true }),
    cleanupTask("businessDocsMissingCompanyId", "Business docs missing companyId", businessMissing, "Preview first, then backfill with an explicitly selected company.", { canRun: true, businessData: true }),
  ];
}

function sanitizeCompanyPatch(raw = {}) {
  const patch = {};

  if ("name" in raw) patch.name = String(raw.name || "").trim().slice(0, 120);
  if ("domain" in raw) patch.domain = String(raw.domain || "").trim().toLowerCase().slice(0, 120);
  if ("status" in raw) {
    const status = String(raw.status || "").trim().toLowerCase();
    if (!COMPANY_STATUSES.has(status)) {
      throw new Error("Invalid company status.");
    }
    patch.status = status;
  }
  if ("plan" in raw) {
    const plan = String(raw.plan || "").trim().toLowerCase();
    if (!["trial", "standard", "platform", "enterprise"].includes(plan)) {
      throw new Error("Invalid company plan.");
    }
    patch.plan = plan;
  }
  if ("maxUsers" in raw) patch.maxUsers = cleanInt(raw.maxUsers, 25, 1, 5000);

  if (raw.modules && typeof raw.modules === "object") {
    patch.modules = {
      diary: bool(raw.modules.diary, true),
      bookings: bool(raw.modules.bookings, true),
      workshop: bool(raw.modules.workshop, true),
      vehicles: bool(raw.modules.vehicles, true),
      equipment: bool(raw.modules.equipment, true),
      uCrane: bool(raw.modules.uCrane, true),
      jobSheets: bool(raw.modules.jobSheets, true),
      employees: bool(raw.modules.employees, true),
      hr: bool(raw.modules.hr, true),
      hAndS: bool(raw.modules.hAndS, true),
      statistics: bool(raw.modules.statistics, true),
      timesheets: bool(raw.modules.timesheets, true),
      holidays: bool(raw.modules.holidays, true),
      finance: bool(raw.modules.finance, true),
      invoices: bool(raw.modules.invoices, true),
      assistant: bool(raw.modules.assistant, true),
      mobileApp: bool(raw.modules.mobileApp, true),
      pushNotifications: bool(raw.modules.pushNotifications, true),
      mfa: bool(raw.modules.mfa, true),
      settings: bool(raw.modules.settings, true),
    };
  }

  if (raw.security && typeof raw.security === "object") {
    patch.security = {
      mfaRequired: bool(raw.security.mfaRequired, true),
      loginAlerts: bool(raw.security.loginAlerts, true),
      locationAlerts: bool(raw.security.locationAlerts, true),
      rememberMfaDays: cleanInt(raw.security.rememberMfaDays, 30, 0, 90),
      selfSignup: bool(raw.security.selfSignup, false),
    };
  }

  if (raw.rules && typeof raw.rules === "object") {
    patch.rules = {
      disabledUsersBlocked: bool(raw.rules.disabledUsersBlocked, true),
      adminActionsServerOnly: bool(raw.rules.adminActionsServerOnly, true),
      auditLoggingRequired: bool(raw.rules.auditLoggingRequired, true),
      mfaResetByAdminsOnly: bool(raw.rules.mfaResetByAdminsOnly, true),
    };
  }

  if (raw.limits && typeof raw.limits === "object") {
    patch.limits = {
      storageLimitGb: cleanInt(raw.limits.storageLimitGb, 0, 0, 1000000),
      featureLimits: String(raw.limits.featureLimits || "").trim().slice(0, 2000),
    };
  }

  if (raw.quotas && typeof raw.quotas === "object") {
    patch.quotas = {
      dvla: {
        hourlyPerUser: cleanInt(raw.quotas?.dvla?.hourlyPerUser, 30, 1, 10000),
        dailyPerCompany: cleanInt(raw.quotas?.dvla?.dailyPerCompany, 300, 1, 100000),
      },
      ai: {
        hourlyPerUser: cleanInt(raw.quotas?.ai?.hourlyPerUser, 20, 1, 10000),
        dailyPerCompany: cleanInt(raw.quotas?.ai?.dailyPerCompany, 100, 1, 100000),
      },
    };
  }

  if (raw.branding && typeof raw.branding === "object") {
    patch.branding = normalizeBranding(raw.branding);
  }

  return patch;
}

async function requirePlatformAdmin(req) {
  const admin = await requirePlatformAdminFromRequest(req);
  if (admin.error) return admin;
  if (String(admin.userData?.role || "").trim().toLowerCase() !== "platformadmin") {
    return { error: jsonError("Platform admin access required.", 403) };
  }
  return admin;
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

function requestMeta(req) {
  if (!req) return {};
  return {
    ip: clientIp(req),
    userAgent: headerValue(req.headers, "user-agent"),
  };
}

async function writeAudit(action, actor, details = {}, req = null) {
  try {
    await adminCreateDocument("adminAuditLogs", {
      action,
      area: "Platform",
      actorEmail: actor.email || "",
      actorUid: actor.uid || "",
      actorRole: "platformAdmin",
      targetType: details.targetType || "company",
      targetId: details.targetId || details.companyId || "",
      companyId: details.companyId || "",
      targetUserId: details.targetUserId || "",
      before: details.before || null,
      after: details.after || null,
      ...requestMeta(req),
      details,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Platform audit log failed:", error);
  }
}

export async function GET(req) {
  try {
    const admin = await requirePlatformAdmin(req);
    if (admin.error) return admin.error;

    const [companyDocs, userDocs, employeeDocs, auditDocs, loginLogDocs, passkeyDocs, platformSettingsDoc, platformFeaturesDoc, platformBrandingDoc] = await Promise.all([
      adminListDocuments("platformCompanies"),
      adminListDocuments("users"),
      adminListDocuments("employees"),
      adminListDocuments("adminAuditLogs"),
      adminListDocuments("loginSecurityLogs"),
      adminListDocuments("passkeyCredentials"),
      adminReadDocument("settings", "platform"),
      adminReadDocument("settings", "platformFeatures"),
      adminReadDocument("settings", "platformBranding"),
    ]);
    const platformSettings = {
      ...(platformSettingsDoc || {}),
      featureFlags: normalizeFeatureFlags(platformFeaturesDoc?.featureFlags || platformFeaturesDoc?.features || platformSettingsDoc?.featureFlags || platformSettingsDoc?.features || {}),
      branding: normalizeBranding(platformBrandingDoc?.branding || platformBrandingDoc || platformSettingsDoc?.branding || {}),
      platformFeatures: platformFeaturesDoc || {},
      platformBranding: platformBrandingDoc || {},
    };

    const companies = companyDocs.map(({ id, data }) => serializeCompany(id, data));
    if (!companies.some((company) => company.id === DEFAULT_COMPANY_ID)) {
      companies.unshift(defaultCompany());
    }

    const employees = employeeDocs
      .map(publicEmployee)
      .sort((a, b) => a.name.localeCompare(b.name));

    const users = mergeAccessUsers(userDocs, employeeDocs);

    const passkeyCountsByUid = passkeyDocs.reduce((acc, { data }) => {
      const uid = String(data?.uid || "").trim();
      if (uid) acc[uid] = (acc[uid] || 0) + 1;
      return acc;
    }, {});

    const audits = auditDocs
      .map(({ id, data }) => ({
        id,
        actorUid: data.actorUid || "",
        actorEmail: data.actorEmail || "",
        actorRole: data.actorRole || "",
        targetType: data.targetType || data.details?.targetType || "",
        targetId: data.targetId || data.targetUserId || data.companyId || "",
        targetUserId: data.targetUserId || "",
        companyId: data.companyId || data.details?.companyId || "",
        action: data.action || "",
        area: data.area || "",
        before: data.before || null,
        after: data.after || null,
        ip: data.ip || "",
        userAgent: data.userAgent || "",
        details: data.details || {},
        createdAt: data.createdAt || "",
      }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 250);

    const loginLogs = loginLogDocs
      .map(({ id, data }) => ({
        id,
        email: cleanEmail(data.email),
        uid: data.uid || "",
        loginMethod: data.loginMethod || data.method || "",
        status: data.status || data.outcome || "",
        outcome: data.outcome || data.status || "",
        reason: data.reason || data.emailFailure || "",
        employeeId: data.employeeId || "",
        ip: data.ip || "",
        location: data.location || "",
        userAgent: data.userAgent || "",
        device: data.device || data.deviceInfo || data.deviceType || "",
        emailSent: data.emailSent === true,
        emailFailure: data.emailFailure || "",
        createdAt: data.createdAt || "",
      }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 250);
    const cleanupPreview = await buildCleanupPreview({ userDocs, employeeDocs });

    return Response.json({
      ok: true,
      companies,
      employees,
      users: users.map((user) => ({
        ...user,
        passkeyCount: passkeyCountsByUid[user.uid] || passkeyCountsByUid[user.id] || 0,
      })),
      stats: {
        companies: companies.length,
        users: users.length,
        employees: employeeDocs.length,
        disabledUsers: users.filter((user) => !user.isEnabled).length,
        mfaMissing: users.filter((user) => !user.mfaEnabled).length,
      },
      audits,
      loginLogs,
      cleanupPreview,
      platformSettings,
    });
  } catch (error) {
    console.error("Platform admin load failed:", error);
    return jsonError(error?.message || "Could not load platform admin.", 500);
  }
}

export async function POST(req) {
  try {
    const admin = await requirePlatformAdmin(req);
    if (admin.error) return admin.error;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const nowIso = new Date().toISOString();

    if (action === "saveCompany") {
      const incomingId = slugify(body.companyId || body.company?.id || body.company?.name);
      const companyId = incomingId || DEFAULT_COMPANY_ID;
      const patch = sanitizeCompanyPatch(body.company || {});
      const existing = await adminReadDocument("platformCompanies", companyId);
      const before = existing ? serializeCompany(companyId, existing) : null;

      if (!patch.name && companyId !== DEFAULT_COMPANY_ID) {
        return jsonError("Company name is required.", 400);
      }

      const after = serializeCompany(companyId, {
        ...(before || {}),
        ...patch,
        id: companyId,
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
        createdAt: before?.createdAt || body.company?.createdAt || nowIso,
      });

      await adminPatchDocument("platformCompanies", companyId, {
        ...after,
        id: companyId,
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
      });

      const statusChanged = before?.status !== after.status;
      const auditAction = !before
        ? "Created platform company"
        : statusChanged && after.status === "suspended"
          ? "Suspended platform company"
          : statusChanged && after.status === "archived"
            ? "Archived platform company"
            : statusChanged && after.status === "active"
              ? "Activated platform company"
              : "Updated platform company";

      await writeAudit(auditAction, admin.verifiedUser, { companyId, before, after }, req);

      return Response.json({ ok: true, companyId });
    }

    if (action === "saveGlobalFeatureFlags") {
      const [beforePlatform, beforeFeatures] = await Promise.all([
        adminReadDocument("settings", "platform"),
        adminReadDocument("settings", "platformFeatures"),
      ]);
      const before = beforeFeatures || beforePlatform || {};
      const featureFlags = normalizeFeatureFlags(body.featureFlags || {});
      const after = {
        ...before,
        featureFlags,
        features: featureFlags,
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
        updatedByUid: admin.verifiedUser.uid,
      };

      await Promise.all([
        adminPatchDocument("settings", "platformFeatures", after),
        adminPatchDocument("settings", "platform", {
          ...(beforePlatform || {}),
          featureFlags,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "platform-admin",
          updatedByUid: admin.verifiedUser.uid,
        }),
      ]);
      await writeAudit("Updated global feature flags", admin.verifiedUser, {
        targetType: "settings",
        targetId: "settings/platformFeatures",
        before,
        after,
      }, req);
      return Response.json({ ok: true, featureFlags });
    }

    if (action === "saveGlobalBranding") {
      const before = (await adminReadDocument("settings", "platformBranding")) || {};
      const branding = normalizeBranding(body.branding || {});
      const after = {
        ...before,
        ...branding,
        branding,
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
        updatedByUid: admin.verifiedUser.uid,
      };

      await adminPatchDocument("settings", "platformBranding", after);
      await writeAudit("Updated global branding", admin.verifiedUser, {
        targetType: "settings",
        targetId: "settings/platformBranding",
        before,
        after,
      }, req);
      return Response.json({ ok: true, branding });
    }

    if (action === "saveCompanyFeatureFlags") {
      const companyId = slugify(body.companyId);
      if (!companyId) return jsonError("Company id is required.", 400);

      const existing = await adminReadDocument("platformCompanies", companyId);
      const before = existing ? serializeCompany(companyId, existing) : serializeCompany(companyId, {});
      const flags = normalizeFeatureFlags(body.featureFlags || {});
      const after = serializeCompany(companyId, {
        ...before,
        modules: {
          ...(before.modules || {}),
          ...flags,
        },
        security: {
          ...(before.security || {}),
          mfaRequired: flags.mfa,
        },
        featureFlags: {
          mobileApp: flags.mobileApp,
          pushNotifications: flags.pushNotifications,
        },
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
      });

      await adminPatchDocument("platformCompanies", companyId, after);
      await writeAudit("Updated company feature flags", admin.verifiedUser, {
        targetType: "company",
        targetId: companyId,
        companyId,
        before,
        after,
      }, req);
      return Response.json({ ok: true, companyId });
    }

    if (action === "saveCompanyBranding") {
      const companyId = slugify(body.companyId);
      if (!companyId) return jsonError("Company id is required.", 400);

      const existing = await adminReadDocument("platformCompanies", companyId);
      const before = existing ? serializeCompany(companyId, existing) : serializeCompany(companyId, {});
      const branding = normalizeBranding(body.branding || {});
      const after = serializeCompany(companyId, {
        ...before,
        branding,
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
      });

      await adminPatchDocument("platformCompanies", companyId, after);
      await writeAudit("Updated company branding", admin.verifiedUser, {
        targetType: "company",
        targetId: companyId,
        companyId,
        before,
        after,
      }, req);
      return Response.json({ ok: true, companyId, branding });
    }

    if (action === "deleteCompany") {
      const companyId = slugify(body.companyId);
      if (!companyId) return jsonError("Company id is required.", 400);
      if (companyId === DEFAULT_COMPANY_ID) {
        return jsonError("The primary company cannot be deleted.", 400);
      }

      const [existing, userDocs, employeeDocs] = await Promise.all([
        adminReadDocument("platformCompanies", companyId),
        adminListDocuments("users"),
        adminListDocuments("employees"),
      ]);
      const linkedUsers = userDocs.filter(({ data }) => (data.companyId || DEFAULT_COMPANY_ID) === companyId).length;
      const linkedEmployees = employeeDocs.filter(({ data }) => (data.companyId || DEFAULT_COMPANY_ID) === companyId).length;
      if (linkedUsers || linkedEmployees) {
        return jsonError(
          `Company cannot be deleted because it has ${linkedUsers} linked users and ${linkedEmployees} linked employees. Archive it instead.`,
          400
        );
      }

      await adminDeleteDocument("platformCompanies", companyId);
      await writeAudit("Deleted platform company", admin.verifiedUser, {
        companyId,
        before: existing ? serializeCompany(companyId, existing) : null,
        after: null,
      }, req);
      return Response.json({ ok: true });
    }

    if (action === "linkEmployeeUser") {
      const employeeId = cleanId(body.employeeId);
      const userId = cleanId(body.userId);
      if (!employeeId || employeeId.includes("/")) return jsonError("Invalid employee id.", 400);
      if (!userId || userId.includes("/")) return jsonError("Invalid user id.", 400);

      const [employee, user] = await Promise.all([
        adminReadDocument("employees", employeeId),
        adminReadDocument("users", userId),
      ]);
      if (!employee) return jsonError("Employee not found.", 404);
      if (!user) return jsonError("User not found.", 404);

      const uid = cleanId(user.uid || userId);
      const validation = await validateEmployeeUserLink({ uid, employeeId });
      if (!validation.ok) {
        return jsonError(validation.conflicts.join(" "), 409);
      }
      const before = {
        employee: publicEmployee({ id: employeeId, data: employee }),
        user: publicUser({ id: userId, data: user }),
      };

      await Promise.all([
        adminPatchDocument("employees", employeeId, {
          authUid: uid,
          uid,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "platform-admin",
          updatedByUid: admin.verifiedUser.uid,
        }),
        adminPatchDocument("users", userId, {
          employeeId,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "platform-admin",
          updatedByUid: admin.verifiedUser.uid,
        }),
      ]);

      await writeAudit("Linked employee to user", admin.verifiedUser, {
        targetType: "employeeLink",
        targetId: `${employeeId}:${userId}`,
        companyId: employee.companyId || user.companyId || DEFAULT_COMPANY_ID,
        targetUserId: userId,
        before,
        after: { employeeId, userId, uid },
      }, req);
      return Response.json({ ok: true });
    }

    if (action === "unlinkEmployeeUser") {
      const employeeId = cleanId(body.employeeId);
      const userId = cleanId(body.userId);
      if (!employeeId && !userId) return jsonError("Employee id or user id is required.", 400);
      if (employeeId && employeeId.includes("/")) return jsonError("Invalid employee id.", 400);
      if (userId && userId.includes("/")) return jsonError("Invalid user id.", 400);

      const [employee, user] = await Promise.all([
        employeeId ? adminReadDocument("employees", employeeId) : Promise.resolve(null),
        userId ? adminReadDocument("users", userId) : Promise.resolve(null),
      ]);
      const linkedUserId = userId || cleanId(employee?.authUid || employee?.uid);
      const linkedUser = user || (linkedUserId ? await adminReadDocument("users", linkedUserId) : null);
      const before = {
        employee: employeeId && employee ? publicEmployee({ id: employeeId, data: employee }) : null,
        user: linkedUserId && linkedUser ? publicUser({ id: linkedUserId, data: linkedUser }) : null,
      };

      await Promise.all([
        employeeId
          ? adminPatchDocument(
              "employees",
              employeeId,
              {
                updatedAt: nowIso,
                updatedBy: admin.verifiedUser.email || "platform-admin",
                updatedByUid: admin.verifiedUser.uid,
              },
              { deleteFields: ["authUid", "uid"] }
            )
          : Promise.resolve(),
        linkedUserId
          ? adminPatchDocument(
              "users",
              linkedUserId,
              {
                updatedAt: nowIso,
                updatedBy: admin.verifiedUser.email || "platform-admin",
                updatedByUid: admin.verifiedUser.uid,
              },
              { deleteFields: ["employeeId"] }
            )
          : Promise.resolve(),
      ]);

      await writeAudit("Unlinked employee and user", admin.verifiedUser, {
        targetType: "employeeLink",
        targetId: `${employeeId || "-"}:${linkedUserId || "-"}`,
        companyId: employee?.companyId || linkedUser?.companyId || DEFAULT_COMPANY_ID,
        targetUserId: linkedUserId || "",
        before,
        after: { employeeId, userId: linkedUserId || "" },
      }, req);
      return Response.json({ ok: true });
    }

    if (action === "repairDuplicateEmployeeLink") {
      const employeeId = cleanId(body.employeeId);
      if (!employeeId || employeeId.includes("/")) return jsonError("Invalid employee id.", 400);

      const [employee, employeeDocs] = await Promise.all([
        adminReadDocument("employees", employeeId),
        adminListDocuments("employees"),
      ]);
      if (!employee) return jsonError("Employee not found.", 404);
      const uid = cleanId(employee.authUid || employee.uid);
      if (!uid) return jsonError("Employee has no linked UID to repair.", 400);

      const duplicates = employeeDocs.filter(({ id, data }) => id !== employeeId && cleanId(data.authUid || data.uid) === uid);
      await Promise.all([
        ...duplicates.map(({ id }) =>
          adminPatchDocument(
            "employees",
            id,
            {
              updatedAt: nowIso,
              updatedBy: admin.verifiedUser.email || "platform-admin",
              updatedByUid: admin.verifiedUser.uid,
            },
            { deleteFields: ["authUid", "uid"] }
          )
        ),
        adminPatchDocument("users", uid, {
          employeeId,
          updatedAt: nowIso,
          updatedBy: admin.verifiedUser.email || "platform-admin",
          updatedByUid: admin.verifiedUser.uid,
        }),
      ]);

      await writeAudit("Repaired duplicate employee links", admin.verifiedUser, {
        targetType: "employeeLink",
        targetId: employeeId,
        companyId: employee.companyId || DEFAULT_COMPANY_ID,
        targetUserId: uid,
        before: { uid, duplicateEmployeeIds: duplicates.map(({ id }) => id) },
        after: { employeeId, userId: uid, clearedEmployeeIds: duplicates.map(({ id }) => id) },
      }, req);
      return Response.json({ ok: true, clearedEmployees: duplicates.length });
    }

    if (action === "runCleanupTask") {
      const taskId = cleanId(body.taskId);
      if (body.confirm !== true) return jsonError("Cleanup actions require explicit confirmation.", 400);

      const userDocs = await adminListDocuments("users");

      if (taskId === "legacyMfaSecret") {
        const targets = userDocs.filter(({ data }) => String(data?.mfaSecret || "").trim());
        await Promise.all(
          targets.map(({ id }) =>
            adminPatchDocument(
              "users",
              id,
              {
                legacyMfaSecretClearedAt: nowIso,
                legacyMfaSecretClearedBy: admin.verifiedUser.email || "platform-admin",
                legacyMfaSecretClearedByUid: admin.verifiedUser.uid,
                updatedAt: nowIso,
              },
              { deleteFields: ["mfaSecret"] }
            )
          )
        );
        await writeAudit("Cleanup cleared legacy users.mfaSecret", admin.verifiedUser, {
          targetType: "cleanup",
          targetId: taskId,
          before: { count: targets.length, ids: targets.map(({ id }) => id) },
          after: { cleared: targets.length },
        }, req);
        return Response.json({ ok: true, changed: targets.length });
      }

      if (taskId === "disabledDuplicateRows") {
        const duplicateGroups = duplicateUserGroups(userDocs);
        const targets = duplicateGroups.flatMap(({ rows }) =>
          rows.filter(({ data }) => data.isEnabled === false || data.disabled === true || data.appDisabled === true)
        );
        await Promise.all(targets.map(({ id }) => adminDeleteDocument("users", id)));
        await writeAudit("Cleanup deleted disabled duplicate user rows", admin.verifiedUser, {
          targetType: "cleanup",
          targetId: taskId,
          before: { count: targets.length, ids: targets.map(({ id }) => id) },
          after: { deleted: targets.length },
        }, req);
        return Response.json({ ok: true, changed: targets.length });
      }

      if (taskId === "pushTokenUsers") {
        const targets = userDocs.filter(({ data }) => isPushTokenUserDoc(data));
        await Promise.all(targets.map(({ id }) => adminDeleteDocument("users", id)));
        await writeAudit("Cleanup deleted push-token-only user rows", admin.verifiedUser, {
          targetType: "cleanup",
          targetId: taskId,
          before: { count: targets.length, ids: targets.map(({ id }) => id) },
          after: { deleted: targets.length },
        }, req);
        return Response.json({ ok: true, changed: targets.length });
      }

      if (taskId === "businessDocsMissingCompanyId") {
        const companyId = slugify(body.companyId || DEFAULT_COMPANY_ID) || DEFAULT_COMPANY_ID;
        const company = await adminReadDocument("platformCompanies", companyId);
        if (!company) {
          return jsonError("Choose an existing company before backfilling business documents.", 400);
        }

        const missingDocs = (await listBusinessDocsMissingCompanyId()).filter(({ id }) => id !== "scan-error");
        await Promise.all(
          missingDocs.map(({ collection, id }) =>
            adminPatchDocument(collection, id, {
              companyId,
              tenantBackfilledAt: nowIso,
              tenantBackfilledBy: admin.verifiedUser.email || "platform-admin",
              tenantBackfilledByUid: admin.verifiedUser.uid,
              updatedAt: nowIso,
            })
          )
        );

        const collectionCounts = missingDocs.reduce((acc, { collection }) => {
          acc[collection] = (acc[collection] || 0) + 1;
          return acc;
        }, {});

        await writeAudit("Cleanup backfilled business companyId", admin.verifiedUser, {
          targetType: "tenantScope",
          targetId: "businessCollections",
          companyId,
          before: {
            count: missingDocs.length,
            collections: collectionCounts,
            ids: missingDocs.slice(0, 100).map(({ collection, id }) => `${collection}/${id}`),
          },
          after: { companyId, changed: missingDocs.length },
        }, req);

        return Response.json({ ok: true, changed: missingDocs.length, companyId });
      }

      return jsonError("This cleanup task is preview-only or unknown.", 400);
    }

    return jsonError("Unknown platform action.", 400);
  } catch (error) {
    console.error("Platform admin action failed:", error);
    return jsonError(error?.message || "Platform admin action failed.", 500);
  }
}
