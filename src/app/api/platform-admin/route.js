import {
  adminCreateDocument,
  adminDeleteDocument,
  adminListDocuments,
  adminPatchDocument,
} from "@/app/api/_firebaseAdminRest";
import { jsonError, requireAdminFromRequest } from "@/app/api/admin/_lib";

export const runtime = "nodejs";

const PLATFORM_ADMIN_EMAILS = new Set(["mason@bickers.co.uk"]);
const DEFAULT_COMPANY_ID = "bickers-action";

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

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
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
      workshop: true,
      hr: true,
      finance: true,
      assistant: true,
    },
    security: {
      mfaRequired: true,
      passkeysAllowed: true,
      loginAlerts: true,
      locationAlerts: true,
      rememberMfaDays: 30,
      userCodeLogin: true,
      selfSignup: false,
    },
    rules: {
      disabledUsersBlocked: true,
      adminActionsServerOnly: true,
      auditLoggingRequired: true,
      mfaResetByAdminsOnly: true,
    },
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
    rules: { ...(base.rules || {}), ...(data.rules || {}) },
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
    role: data.role || "user",
    isEnabled: data.isEnabled !== false,
    appAccess: {
      user: userAccess,
      service: serviceAccess,
    },
    defaultWorkspace: data.defaultWorkspace || "user",
    companyId: data.companyId || DEFAULT_COMPANY_ID,
    mfaEnabled: data.mfaEnabled === true,
    mfaMethod: data.mfaMethod || "",
    mfaResetRequired: data.mfaResetRequired === true,
    passkeyEnabled: data.passkeyEnabled === true,
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

function sanitizeCompanyPatch(raw = {}) {
  const patch = {};

  if ("name" in raw) patch.name = String(raw.name || "").trim().slice(0, 120);
  if ("domain" in raw) patch.domain = String(raw.domain || "").trim().toLowerCase().slice(0, 120);
  if ("status" in raw) {
    const status = String(raw.status || "").trim().toLowerCase();
    if (!["active", "suspended", "setup", "locked"].includes(status)) {
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
      workshop: bool(raw.modules.workshop, true),
      hr: bool(raw.modules.hr, true),
      finance: bool(raw.modules.finance, true),
      assistant: bool(raw.modules.assistant, true),
    };
  }

  if (raw.security && typeof raw.security === "object") {
    patch.security = {
      mfaRequired: bool(raw.security.mfaRequired, true),
      passkeysAllowed: bool(raw.security.passkeysAllowed, true),
      loginAlerts: bool(raw.security.loginAlerts, true),
      locationAlerts: bool(raw.security.locationAlerts, true),
      rememberMfaDays: cleanInt(raw.security.rememberMfaDays, 30, 0, 90),
      userCodeLogin: bool(raw.security.userCodeLogin, true),
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

  return patch;
}

async function requirePlatformAdmin(req) {
  const admin = await requireAdminFromRequest(req);
  if (admin.error) return admin;
  if (!PLATFORM_ADMIN_EMAILS.has(cleanEmail(admin.verifiedUser.email))) {
    return { error: jsonError("Platform admin access required.", 403) };
  }
  return admin;
}

async function writeAudit(action, actor, details = {}) {
  try {
    await adminCreateDocument("adminAuditLogs", {
      action,
      area: "Platform",
      actorEmail: actor.email || "",
      actorUid: actor.uid || "",
      targetUserId: details.targetUserId || "",
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

    const [companyDocs, userDocs, employeeDocs, auditDocs, loginLogDocs, passkeyDocs] = await Promise.all([
      adminListDocuments("platformCompanies"),
      adminListDocuments("users"),
      adminListDocuments("employees"),
      adminListDocuments("adminAuditLogs"),
      adminListDocuments("loginSecurityLogs"),
      adminListDocuments("passkeyCredentials"),
    ]);

    const companies = companyDocs.map(({ id, data }) => serializeCompany(id, data));
    if (!companies.some((company) => company.id === DEFAULT_COMPANY_ID)) {
      companies.unshift(defaultCompany());
    }

    const users = userDocs
      .map(publicUser)
      .filter((user) => user.email)
      .sort((a, b) => a.email.localeCompare(b.email));

    const employees = employeeDocs
      .map(publicEmployee)
      .sort((a, b) => a.name.localeCompare(b.name));

    const passkeyCountsByUid = passkeyDocs.reduce((acc, { data }) => {
      const uid = String(data?.uid || "").trim();
      if (uid) acc[uid] = (acc[uid] || 0) + 1;
      return acc;
    }, {});

    const audits = auditDocs
      .map(({ id, data }) => ({ id, ...data }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 80);

    const loginLogs = loginLogDocs
      .map(({ id, data }) => ({
        id,
        email: cleanEmail(data.email),
        uid: data.uid || "",
        loginMethod: data.loginMethod || data.method || "",
        status: data.status || "",
        employeeId: data.employeeId || "",
        createdAt: data.createdAt || "",
      }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 120);

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

      if (!patch.name && companyId !== DEFAULT_COMPANY_ID) {
        return jsonError("Company name is required.", 400);
      }

      await adminPatchDocument("platformCompanies", companyId, {
        ...patch,
        id: companyId,
        updatedAt: nowIso,
        updatedBy: admin.verifiedUser.email || "platform-admin",
        createdAt: body.company?.createdAt || nowIso,
      });

      await writeAudit("Saved platform company", admin.verifiedUser, {
        companyId,
        name: patch.name || companyId,
      });

      return Response.json({ ok: true, companyId });
    }

    if (action === "deleteCompany") {
      const companyId = slugify(body.companyId);
      if (!companyId) return jsonError("Company id is required.", 400);
      if (companyId === DEFAULT_COMPANY_ID) {
        return jsonError("The primary company cannot be deleted.", 400);
      }

      await adminDeleteDocument("platformCompanies", companyId);
      await writeAudit("Deleted platform company", admin.verifiedUser, { companyId });
      return Response.json({ ok: true });
    }

    return jsonError("Unknown platform action.", 400);
  } catch (error) {
    console.error("Platform admin action failed:", error);
    return jsonError(error?.message || "Platform admin action failed.", 500);
  }
}
