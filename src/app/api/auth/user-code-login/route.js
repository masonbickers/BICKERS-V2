import { NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  adminCreateDocument,
  adminListDocuments,
  adminPatchDocument,
  adminReadDocument,
  createFirebaseCustomToken,
} from "@/app/api/_firebaseAdminRest";

export const runtime = "nodejs";

const DEFAULT_COMPANY_ID = "bickers-action";
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 8;
const RATE_LIMIT_LOCK_MS = 30 * 60 * 1000;

const normalize = (value) => String(value || "").trim().toLowerCase();

function valuesFrom(data, fields) {
  return fields
    .map((field) => normalize(data?.[field]))
    .filter(Boolean);
}

function employeeEmails(employee) {
  return valuesFrom(employee, [
    "email",
    "workEmail",
    "personalEmail",
    "emailAddress",
    "contactEmail",
  ]);
}

function employeeCodes(employee) {
  return valuesFrom(employee, [
    "userCode",
    "employeeCode",
    "code",
    "loginCode",
  ]);
}

function isDisabledRecord(data = {}) {
  return (
    data.isEnabled === false ||
    data.active === false ||
    data.archived === true ||
    data.isArchived === true ||
    data.disabled === true ||
    data.appDisabled === true ||
    normalize(data.role) === "archived"
  );
}

function resolveAccess(employee = {}, existingUser = {}) {
  const existingAccess =
    existingUser.appAccess && typeof existingUser.appAccess === "object"
      ? existingUser.appAccess
      : null;
  if (existingAccess) {
    return {
      appAccess: {
        user: existingAccess.user !== false,
        service: existingAccess.service === true,
      },
      defaultWorkspace:
        existingUser.defaultWorkspace === "service" && existingAccess.service === true
          ? "service"
          : "user",
      role: existingUser.role || "user",
      isService: existingUser.isService === true,
    };
  }

  const role = normalize(employee.role);
  const isService = employee.isService === true || role === "service";
  const appAccess = {
    user: role === "hybrid" || !isService,
    service: role === "hybrid" || isService,
  };

  return {
    appAccess,
    defaultWorkspace:
      employee.defaultWorkspace === "service" && appAccess.service ? "service" : "user",
    role: "user",
    isService,
  };
}

function safeUid(candidate) {
  const value = String(candidate || "").trim();
  if (!value) return "";
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
}

function hashKey(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 48);
}

function clientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return normalize(forwarded.split(",")[0] || req.headers.get("x-real-ip") || "unknown");
}

function userAgent(req) {
  return String(req.headers.get("user-agent") || "").trim();
}

async function writeLoginSecurityLog(row) {
  try {
    await adminCreateDocument("loginSecurityLogs", {
      uid: row.uid || "",
      email: normalize(row.email),
      loginMethod: row.loginMethod || "user-code",
      status: row.status || "",
      outcome: row.outcome || row.status || "",
      reason: row.reason || "",
      employeeId: row.employeeId || "",
      ip: row.ip || "",
      userAgent: row.userAgent || "",
      createdAt: row.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Login security log failed:", error);
  }
}

async function writeUserCodeAudit(row) {
  try {
    await adminCreateDocument("adminAuditLogs", {
      actorUid: row.uid || "",
      actorEmail: row.email || "",
      actorRole: "user",
      targetType: "auth",
      targetId: row.uid || row.email || "",
      companyId: row.companyId || "",
      action: "Setup-code login token issued",
      area: "Login Security",
      before: null,
      after: {
        uid: row.uid || "",
        email: normalize(row.email),
        loginMethod: "user-code",
      },
      details: row.details || {},
      ip: row.ip || "",
      userAgent: row.userAgent || "",
      createdAt: row.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    console.error("User-code audit log failed:", error);
  }
}

function rateLimitId(email, ip) {
  return hashKey(`${normalize(email)}|${normalize(ip)}`);
}

function codeAttemptId(code) {
  return hashKey(normalize(code));
}

async function userCodeLoginAllowed() {
  const company = await adminReadDocument("platformCompanies", DEFAULT_COMPANY_ID);
  return company?.security?.userCodeLogin === true;
}

async function readRateLimit(email, ip) {
  const id = rateLimitId(email, ip);
  const data = (await adminReadDocument("setupCodeRateLimits", id)) || {};
  const now = Date.now();
  const windowStartedAt = Date.parse(data.windowStartedAt || "") || 0;
  const lockedUntil = Date.parse(data.lockedUntil || "") || 0;

  if (lockedUntil > now) {
    return { id, blocked: true, lockedUntil: data.lockedUntil };
  }

  if (!windowStartedAt || now - windowStartedAt > RATE_LIMIT_WINDOW_MS) {
    return { id, attempts: 0, windowStartedAt: new Date(now).toISOString(), blocked: false };
  }

  return {
    id,
    attempts: Number(data.attempts || 0),
    windowStartedAt: data.windowStartedAt,
    blocked: false,
  };
}

async function recordRateLimitFailure(limit, email, ip, code) {
  const now = Date.now();
  const attempts = Number(limit.attempts || 0) + 1;
  const lockedUntil =
    attempts >= RATE_LIMIT_MAX_ATTEMPTS
      ? new Date(now + RATE_LIMIT_LOCK_MS).toISOString()
      : "";

  await adminPatchDocument("setupCodeRateLimits", limit.id, {
    emailHash: hashKey(email),
    ipHash: hashKey(ip),
    codeHash: codeAttemptId(code),
    attempts,
    windowStartedAt: limit.windowStartedAt || new Date(now).toISOString(),
    lockedUntil,
    lastFailedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  });
}

async function recordRateLimitSuccess(limit, email, ip) {
  await adminPatchDocument("setupCodeRateLimits", limit.id, {
    emailHash: hashKey(email),
    ipHash: hashKey(ip),
    attempts: 0,
    lockedUntil: "",
    lastSuccessAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function userMatchesUid(user, uid) {
  if (!uid || !user) return false;
  return safeUid(user.id) === uid || safeUid(user.data?.uid) === uid;
}

function userHasStableUid(user) {
  const id = safeUid(user?.id);
  const uid = safeUid(user?.data?.uid);
  return !!id && !!uid && id === uid;
}

function chooseExistingUserForLogin(matchingUsers, employeeUid) {
  const activeUsers = matchingUsers.filter(({ data }) => !isDisabledRecord(data));

  return (
    activeUsers.find((user) => userMatchesUid(user, employeeUid)) ||
    activeUsers.find(userHasStableUid) ||
    activeUsers.find(({ data }) => data?.mfaEnabled === true && data?.mfaMethod === "totp") ||
    activeUsers[0] ||
    null
  );
}

export async function POST(req) {
  if (process.env.ALLOW_LEGACY_FIREBASE_LOGIN !== "true") {
    return NextResponse.json(
      { error: "Setup-code login has moved to Clerk." },
      { status: 410 }
    );
  }

  let cleanEmail = "";
  let cleanCode = "";
  let ip = "";
  let ua = "";
  try {
    const { email, userCode } = await req.json();
    cleanEmail = normalize(email);
    cleanCode = normalize(userCode);
    ip = clientIp(req);
    ua = userAgent(req);

    if (!cleanEmail.endsWith("@bickers.co.uk") || !cleanCode) {
      await writeLoginSecurityLog({
        email: cleanEmail,
        loginMethod: "user-code",
        status: "failed",
        reason: "Invalid email or missing setup code",
        ip,
        userAgent: ua,
      });
      return NextResponse.json({ error: "Invalid email or setup code." }, { status: 401 });
    }

    if (!(await userCodeLoginAllowed())) {
      await writeLoginSecurityLog({
        email: cleanEmail,
        loginMethod: "user-code",
        status: "blocked",
        reason: "Setup-code login disabled",
        ip,
        userAgent: ua,
      });
      return NextResponse.json(
        { error: "Setup-code login is currently disabled. Please use your password or passkey." },
        { status: 403 }
      );
    }

    const rateLimit = await readRateLimit(cleanEmail, ip);
    if (rateLimit.blocked) {
      await writeLoginSecurityLog({
        email: cleanEmail,
        loginMethod: "user-code",
        status: "rate-limited",
        reason: `Locked until ${rateLimit.lockedUntil || "later"}`,
        ip,
        userAgent: ua,
      });
      return NextResponse.json(
        { error: "Too many setup-code attempts. Try again later." },
        { status: 429 }
      );
    }

    const [employees, users] = await Promise.all([
      adminListDocuments("employees"),
      adminListDocuments("users"),
    ]);

    const employee = employees.find(({ data }) => {
      if (isDisabledRecord(data)) return false;
      return employeeEmails(data).includes(cleanEmail) && employeeCodes(data).includes(cleanCode);
    });

    if (!employee) {
      await recordRateLimitFailure(rateLimit, cleanEmail, ip, cleanCode);
      await writeLoginSecurityLog({
        email: cleanEmail,
        loginMethod: "user-code",
        status: "failed",
        reason: "Invalid setup-code credentials",
        ip,
        userAgent: ua,
      });
      return NextResponse.json({ error: "Invalid email or setup code." }, { status: 401 });
    }

    const matchingUsers = users.filter(({ data }) => normalize(data?.email) === cleanEmail);
    const employeeUid = safeUid(employee.data?.authUid) || safeUid(employee.data?.uid);
    const disabledMatchingUser = matchingUsers.find(({ data }) => isDisabledRecord(data));
    if (disabledMatchingUser && (!employeeUid || userMatchesUid(disabledMatchingUser, employeeUid))) {
      await recordRateLimitFailure(rateLimit, cleanEmail, ip, cleanCode);
      await writeLoginSecurityLog({
        uid: disabledMatchingUser.id || disabledMatchingUser.data?.uid || "",
        email: cleanEmail,
        loginMethod: "user-code",
        status: "blocked",
        reason: "Disabled access account",
        employeeId: employee.id,
        ip,
        userAgent: ua,
      });
      return NextResponse.json({ error: "This account is disabled." }, { status: 403 });
    }

    const existingUser = chooseExistingUserForLogin(matchingUsers, employeeUid);
    if (matchingUsers.length > 0 && !existingUser && !employeeUid) {
      await recordRateLimitFailure(rateLimit, cleanEmail, ip, cleanCode);
      await writeLoginSecurityLog({
        email: cleanEmail,
        loginMethod: "user-code",
        status: "failed",
        reason: "Disabled access account",
        ip,
        userAgent: ua,
      });
      return NextResponse.json({ error: "This account is disabled." }, { status: 403 });
    }

    const uid =
      employeeUid ||
      safeUid(existingUser?.data?.uid) ||
      safeUid(existingUser?.id) ||
      safeUid(`employee_${employee.id}`);
    if (!uid) {
      return NextResponse.json({ error: "Could not resolve user account." }, { status: 500 });
    }

    const access = resolveAccess(employee.data, existingUser?.data || {});
    const now = new Date().toISOString();
    const employeeCode =
      employee.data?.userCode ||
      employee.data?.employeeCode ||
      employee.data?.code ||
      cleanCode;

    await adminPatchDocument("users", uid, {
      ...(existingUser ? {} : { createdAt: now }),
      uid,
      email: cleanEmail,
      name: existingUser?.data?.name || employee.data?.name || employee.data?.fullName || "",
      employeeId: employee.id,
      employeeCode,
      companyId: existingUser?.data?.companyId || employee.data?.companyId || DEFAULT_COMPANY_ID,
      isEnabled: true,
      isService: access.isService,
      role: existingUser?.data?.role || access.role,
      appAccess: access.appAccess,
      defaultWorkspace: access.defaultWorkspace,
      updatedAt: now,
    });

    await recordRateLimitSuccess(rateLimit, cleanEmail, ip);

    const customToken = createFirebaseCustomToken(uid, {
      authMethod: "userCode",
      companyEmail: cleanEmail,
      employeeId: employee.id,
    });

    await writeLoginSecurityLog({
      uid,
      email: cleanEmail,
      loginMethod: "user-code-issued",
      status: "success",
      employeeId: employee.id,
      createdAt: now,
      ip,
      userAgent: ua,
    });
    await writeUserCodeAudit({
      uid,
      email: cleanEmail,
      companyId: existingUser?.data?.companyId || employee.data?.companyId || DEFAULT_COMPANY_ID,
      createdAt: now,
      ip,
      userAgent: ua,
      details: { employeeId: employee.id },
    });

    return NextResponse.json({
      customToken,
      employee: {
        id: employee.id,
        name: employee.data?.name || employee.data?.fullName || "",
        email: cleanEmail,
        userCode: String(employeeCode || cleanCode),
        role: access.role,
        isService: access.isService,
        appAccess: access.appAccess,
        defaultWorkspace: access.defaultWorkspace,
        timesheetDefaults: employee.data?.timesheetDefaults || null,
        yardStartTime: employee.data?.yardStartTime || employee.data?.yardStart || "",
        yardEndTime: employee.data?.yardEndTime || employee.data?.yardEnd || "",
        officeStartTime:
          employee.data?.officeStartTime || employee.data?.officeStart || "",
        officeEndTime: employee.data?.officeEndTime || employee.data?.officeEnd || "",
        timesheetDefaultType: employee.data?.timesheetDefaultType || "",
      },
      session: {
        role: access.role,
        employeeId: employee.id,
        isService: access.isService || access.appAccess.service === true,
        appAccess: access.appAccess,
        defaultWorkspace: access.defaultWorkspace,
      },
    });
  } catch (error) {
    console.error("Setup-code login failed", error);
    await writeLoginSecurityLog({
      email: cleanEmail,
      loginMethod: "user-code",
      status: "failed",
      reason: error?.message || "Setup-code login route error",
      ip,
      userAgent: ua,
    });
    return NextResponse.json(
      { error: error?.message || "Could not sign in with setup code." },
      { status: 500 }
    );
  }
}
