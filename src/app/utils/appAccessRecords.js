import {
  derivePlatformRoleFromAccess,
  normalizeAppAccess,
  resolveDefaultWorkspace,
} from "./accessControl.js";

export const DEFAULT_COMPANY_ID = "bickers-action";

export function cleanAccessEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function cleanAccessString(value) {
  return String(value || "").trim();
}

export function normalizeEmployeeEnabledState(employee = {}) {
  return !(
    employee?.status === "disabled" ||
    employee?.isEnabled === false ||
    employee?.archived === true ||
    employee?.disabled === true ||
    employee?.active === false ||
    employee?.appDisabled === true
  );
}

export function normalizeAccessRecordContext({
  uid = "",
  employeeId = "",
  employee = {},
  user = {},
} = {}) {
  const normalizedUid = cleanAccessString(uid || user.uid || employee.authUid || employee.uid);
  const normalizedEmployeeId = cleanAccessString(employeeId || user.employeeId || employee.employeeId);
  const email = cleanAccessEmail(
    user.email ||
      employee.email ||
      employee.workEmail ||
      employee.personalEmail ||
      employee.emailAddress
  );
  const displayName = cleanAccessString(
    user.displayName ||
      user.name ||
      employee.displayName ||
      employee.name ||
      employee.fullName ||
      employee.employeeName
  );
  const phoneNumber = cleanAccessString(
    employee.phoneNumber ||
      employee.mobile ||
      employee.phone ||
      user.phoneNumber ||
      user.phone
  );
  const companyId = cleanAccessString(user.companyId || employee.companyId || DEFAULT_COMPANY_ID);
  const appAccess = normalizeAppAccess({ ...employee, ...user });
  const defaultWorkspace = resolveDefaultWorkspace({ ...employee, ...user }, appAccess);
  const role = derivePlatformRoleFromAccess(user.role || employee.role ? { role: user.role || employee.role } : {});
  const isEnabled = user.isEnabled === false ? false : normalizeEmployeeEnabledState(employee);

  return {
    uid: normalizedUid,
    employeeId: normalizedEmployeeId,
    email,
    displayName,
    phoneNumber,
    companyId,
    appAccess,
    defaultWorkspace,
    role,
    isEnabled,
  };
}

export function buildEmployeeAccessPatch(context = {}) {
  const access = normalizeAccessRecordContext(context);
  const existingEmails = Array.isArray(context.employee?.emails) ? context.employee.emails : [];
  const emails = [...new Set([...existingEmails, access.email].map(cleanAccessEmail).filter(Boolean))];

  return {
    companyId: access.companyId,
    uid: access.uid,
    authUid: access.uid,
    auth: {
      ...(context.employee?.auth && typeof context.employee.auth === "object" ? context.employee.auth : {}),
      uid: access.uid,
      email: access.email,
      phoneNumber: access.phoneNumber,
      passwordEnabled: true,
      phoneVerified: context.employee?.auth?.phoneVerified === true || context.employee?.phoneVerified === true,
    },
    email: access.email,
    emails,
    name: access.displayName,
    fullName: access.displayName,
    employeeName: access.displayName,
    isEnabled: access.isEnabled,
    appAccess: access.appAccess,
    role: "user",
    isService: !!access.appAccess.service,
    defaultWorkspace: access.defaultWorkspace,
    phoneNumber: access.phoneNumber,
  };
}

export function buildUserAccessPatch(context = {}) {
  const access = normalizeAccessRecordContext(context);

  return {
    uid: access.uid,
    email: access.email,
    role: access.role,
    companyId: access.companyId,
    isEnabled: access.isEnabled,
    appAccess: access.appAccess,
    defaultWorkspace: access.defaultWorkspace,
    employeeId: access.employeeId,
    displayName: access.displayName,
    name: access.displayName,
    fullName: access.displayName,
    phoneNumber: access.phoneNumber,
    phone: access.phoneNumber,
    isService: !!access.appAccess.service,
  };
}
