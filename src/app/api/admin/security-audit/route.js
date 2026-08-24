import { adminListDocuments } from "../../_firebaseAdminRest";
import { jsonError, requireAdminFromRequest } from "../_lib";

export const runtime = "nodejs";

const clean = (value) => String(value || "").trim();
const cleanEmail = (value) => clean(value).toLowerCase();

const isDisabledRecord = (data = {}) =>
  data.isEnabled === false ||
  data.active === false ||
  data.archived === true ||
  data.isArchived === true ||
  data.disabled === true ||
  data.appDisabled === true ||
  clean(data.role).toLowerCase() === "archived";

function maskPhone(value) {
  const raw = clean(value).replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.length <= 5) return "***";
  return `${raw.slice(0, 3)}***${raw.slice(-4)}`;
}

function hasText(value) {
  return clean(value).length > 0;
}

function isDeviceOnlyUserDoc(data = {}) {
  const keys = Object.keys(data).filter((key) => data[key] !== undefined);
  if (!keys.length || !hasText(data.expoPushToken)) return false;

  const deviceFields = new Set([
    "expoPushToken",
    "fcmToken",
    "deviceToken",
    "deviceId",
    "deviceName",
    "platform",
    "updatedAt",
    "createdAt",
    "lastSeenAt",
    "lastUpdated",
  ]);

  return keys.every((key) => deviceFields.has(key));
}

function employeeEmails(data = {}) {
  return [
    data.email,
    data.workEmail,
    data.personalEmail,
    data.emailAddress,
    data.contactEmail,
  ]
    .map(cleanEmail)
    .filter(Boolean);
}

function employeeUids(data = {}) {
  return [data.uid, data.authUid]
    .map(clean)
    .filter(Boolean);
}

function findEmployeeMatches(user, employees) {
  const uidCandidates = new Set([user.id, user.uid].map(clean).filter(Boolean));
  const email = cleanEmail(user.email);

  return employees.filter(({ id, data }) => {
    if (uidCandidates.has(clean(id))) return true;
    if (employeeUids(data).some((uid) => uidCandidates.has(uid))) return true;
    return email && employeeEmails(data).includes(email);
  });
}

function statusFromIssues({ enabled, criticalIssues, warnings }) {
  if (!enabled) return "disabled";
  if (criticalIssues.length) return "fail";
  if (warnings.length) return "warn";
  return "pass";
}

function summarizeUser({
  id,
  data = {},
  employees,
  mfaSecretIds,
  passkeyCounts,
  emailCounts,
}) {
  if (isDeviceOnlyUserDoc(data)) {
    return {
      source: "devices",
      id,
      uid: clean(id),
      email: "",
      name: "",
      role: "-",
      enabled: false,
      appAccess: {
        user: false,
        service: false,
      },
      defaultWorkspace: "-",
      isService: false,
      phone: "",
      mfaPhoneNumber: "",
      phoneVerified: false,
      mfaEnabled: false,
      mfaMethod: "",
      mfaResetRequired: false,
      mfaEnrolledAt: "",
      privateMfaSecretPresent: false,
      legacyMfaSecretPresent: false,
      passkeyCount: 0,
      employeeIds: [],
      employeeCodePresent: false,
      duplicateEmailCount: 0,
      status: "device",
      issues: ["Push-token device record, not a login account"],
    };
  }

  const uid = clean(data.uid || id);
  const email = cleanEmail(data.email);
  const role = clean(data.role || "");
  const enabled = !isDisabledRecord(data);
  const appAccess = data.appAccess && typeof data.appAccess === "object" ? data.appAccess : {};
  const userAccess = appAccess.user === true;
  const serviceAccess = appAccess.service === true;
  const defaultWorkspace = clean(data.defaultWorkspace || "");
  const phoneVerified = data.phoneVerified === true;
  const mfaEnabled = data.mfaEnabled === true && data.mfaMethod === "totp";
  const mfaResetRequired = data.mfaResetRequired === true;
  const legacyMfaSecretPresent = hasText(data.mfaSecret);
  const privateMfaSecretPresent = mfaSecretIds.has(id) || (uid && mfaSecretIds.has(uid));
  const duplicateEmailCount = email ? emailCounts.get(email) || 0 : 0;
  const matchedEmployees = findEmployeeMatches({ id, uid, email }, employees);
  const passkeyCount = (uid && passkeyCounts.get(uid)) || passkeyCounts.get(id) || 0;

  const criticalIssues = [];
  const warnings = [];

  if (!email) criticalIssues.push("Missing email");
  if (!uid) criticalIssues.push("Missing uid");
  if (uid && id !== uid) warnings.push("User document id does not match uid");
  if (!role) warnings.push("Missing role");

  if (enabled) {
    if (role !== "admin" && !userAccess && !serviceAccess) {
      criticalIssues.push("No user/service app access");
    }
    if (defaultWorkspace === "user" && !userAccess && role !== "admin") {
      warnings.push("Default workspace is user but user access is off");
    }
    if (defaultWorkspace === "service" && !serviceAccess && role !== "admin") {
      warnings.push("Default workspace is service but service access is off");
    }
    if (!defaultWorkspace) warnings.push("Missing default workspace");
    if (!phoneVerified) warnings.push("Phone not verified");
    if (!mfaEnabled) {
      criticalIssues.push("Authenticator MFA not ready");
    } else if (!privateMfaSecretPresent && !legacyMfaSecretPresent) {
      criticalIssues.push("MFA enabled but no secret found");
    } else if (!privateMfaSecretPresent && legacyMfaSecretPresent) {
      warnings.push("MFA secret still needs private-store migration");
    }
    if (mfaResetRequired) criticalIssues.push("MFA reset required");
  }

  if (enabled && role === "admin" && (!userAccess || !serviceAccess)) {
    warnings.push("Admin missing full appAccess cleanup fields");
  }
  if (enabled && duplicateEmailCount > 1) warnings.push(`Duplicate active user docs for email (${duplicateEmailCount})`);
  if (enabled && legacyMfaSecretPresent) warnings.push("Legacy mfaSecret still present on user doc");
  if (enabled && !matchedEmployees.length) warnings.push("No linked employee record found");

  const status = statusFromIssues({ enabled, criticalIssues, warnings });

  return {
    source: "users",
    id,
    uid,
    email,
    name: data.name || data.displayName || "",
    role: role || "-",
    enabled,
    appAccess: {
      user: userAccess,
      service: serviceAccess,
    },
    defaultWorkspace: defaultWorkspace || "-",
    isService: data.isService === true,
    phone: maskPhone(data.phone),
    mfaPhoneNumber: maskPhone(data.mfaPhoneNumber),
    phoneVerified,
    mfaEnabled,
    mfaMethod: clean(data.mfaMethod || ""),
    mfaResetRequired,
    mfaEnrolledAt: data.mfaEnrolledAt || "",
    privateMfaSecretPresent,
    legacyMfaSecretPresent,
    passkeyCount,
    employeeIds: matchedEmployees.map(({ id: employeeId }) => employeeId),
    employeeCodePresent: matchedEmployees.some(({ data: employee }) =>
      [employee.userCode, employee.employeeCode, employee.code, employee.loginCode].some(hasText)
    ),
    duplicateEmailCount,
    status,
    issues: [...criticalIssues, ...warnings],
  };
}

function summarizeEmployeeOnly({ id, data = {} }) {
  const email = employeeEmails(data)[0] || "";
  const uid = clean(data.uid || data.authUid);
  const disabled = isDisabledRecord(data);
  const employeeCodePresent = [data.userCode, data.employeeCode, data.code, data.loginCode].some(hasText);
  const appOnly = !disabled && employeeCodePresent && !uid;
  const noLogin = !disabled && !employeeCodePresent && !uid;
  const issues = appOnly
    ? ["App-only employee record, no web login account"]
    : noLogin
      ? ["Employee record has no app code or web login"]
    : ["Employee has no matching users access record"];
  if (!email) issues.push("Missing employee email");
  if (!uid && !appOnly && !noLogin) issues.push("No linked Firebase uid/authUid");

  return {
    source: "employees",
    id: "",
    uid,
    email,
    name: data.name || data.fullName || data.employeeName || "",
    role: clean(data.role || "-"),
    enabled: !disabled,
    appAccess: {
      user: data.appAccess?.user === true,
      service: data.appAccess?.service === true || data.isService === true,
    },
    defaultWorkspace: clean(data.defaultWorkspace || "-"),
    isService: data.isService === true,
    phone: "",
    mfaPhoneNumber: "",
    phoneVerified: false,
    mfaEnabled: false,
    mfaMethod: "",
    mfaResetRequired: false,
    mfaEnrolledAt: "",
    privateMfaSecretPresent: false,
    legacyMfaSecretPresent: false,
    passkeyCount: 0,
    employeeIds: [id],
    employeeCodePresent,
    duplicateEmailCount: 0,
    status: disabled ? "disabled" : appOnly ? "app" : noLogin ? "noLogin" : "warn",
    issues: disabled ? ["Employee/access record is disabled or archived"] : issues,
  };
}

export async function GET(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;

    const [users, employees, mfaSecrets, passkeys] = await Promise.all([
      adminListDocuments("users"),
      adminListDocuments("employees"),
      adminListDocuments("mfaSecrets"),
      adminListDocuments("passkeyCredentials"),
    ]);

    const emailCounts = users.reduce((acc, { data }) => {
      if (isDeviceOnlyUserDoc(data) || isDisabledRecord(data)) return acc;
      const email = cleanEmail(data?.email);
      if (email) acc.set(email, (acc.get(email) || 0) + 1);
      return acc;
    }, new Map());

    const passkeyCounts = passkeys.reduce((acc, { data }) => {
      const uid = clean(data?.uid);
      if (uid) acc.set(uid, (acc.get(uid) || 0) + 1);
      return acc;
    }, new Map());

    const mfaSecretIds = new Set(
      mfaSecrets
        .filter(({ data }) => hasText(data?.secret))
        .map(({ id }) => clean(id))
        .filter(Boolean)
    );

    const rows = users.map((user) =>
      summarizeUser({
        ...user,
        employees,
        mfaSecretIds,
        passkeyCounts,
        emailCounts,
      })
    );

    const userEmails = new Set(rows.map((row) => cleanEmail(row.email)).filter(Boolean));
    const userUids = new Set(rows.flatMap((row) => [row.id, row.uid]).map(clean).filter(Boolean));
    const employeeOnlyRows = employees
      .filter(({ id, data }) => {
        const hasEmailMatch = employeeEmails(data).some((email) => userEmails.has(email));
        const hasUidMatch = [id, ...employeeUids(data)].some((uid) => userUids.has(clean(uid)));
        return !hasEmailMatch && !hasUidMatch;
      })
      .map(summarizeEmployeeOnly);

    const allRows = [...rows, ...employeeOnlyRows].sort((a, b) => {
      const statusOrder = { fail: 0, warn: 1, pass: 2, app: 3, noLogin: 4, disabled: 5, device: 6 };
      const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (statusDiff) return statusDiff;
      return cleanEmail(a.email).localeCompare(cleanEmail(b.email));
    });

    const summary = allRows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] = (acc[row.status] || 0) + 1;
        if (row.legacyMfaSecretPresent) acc.legacyMfaSecrets += 1;
        if (row.duplicateEmailCount > 1) acc.duplicateUserDocs += 1;
        if (row.enabled && !row.mfaEnabled) acc.mfaNotReady += 1;
        if (row.enabled && row.mfaEnabled && !row.privateMfaSecretPresent) acc.privateMfaMissing += 1;
        return acc;
      },
      {
        total: 0,
        pass: 0,
        warn: 0,
        fail: 0,
        app: 0,
        noLogin: 0,
        disabled: 0,
        device: 0,
        legacyMfaSecrets: 0,
        duplicateUserDocs: 0,
        mfaNotReady: 0,
        privateMfaMissing: 0,
      }
    );

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary,
      rows: allRows,
    });
  } catch (error) {
    console.error("Security audit failed:", error);
    return jsonError(error?.message || "Security audit failed.", 500);
  }
}
