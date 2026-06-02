import { NextResponse } from "next/server";
import {
  adminCreateDocument,
  adminListDocuments,
  adminPatchDocument,
  createFirebaseCustomToken,
} from "@/app/api/_firebaseAdminRest";

export const runtime = "nodejs";

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
  const isHybrid = role === "hybrid";
  const appAccess = {
    user: isHybrid || !isService,
    service: isHybrid || isService,
  };

  return {
    appAccess,
    defaultWorkspace:
      employee.defaultWorkspace === "service" && appAccess.service ? "service" : "user",
    role: isHybrid ? "hybrid" : isService && !appAccess.user ? "service" : "user",
    isService,
  };
}

function safeUid(candidate) {
  const value = String(candidate || "").trim();
  if (!value) return "";
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
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
  try {
    const { email, userCode } = await req.json();
    const cleanEmail = normalize(email);
    const cleanCode = normalize(userCode);

    if (!cleanEmail.endsWith("@bickers.co.uk") || !cleanCode) {
      return NextResponse.json({ error: "Invalid email or user code." }, { status: 401 });
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
      return NextResponse.json({ error: "Invalid email or user code." }, { status: 401 });
    }

    const matchingUsers = users.filter(({ data }) => normalize(data?.email) === cleanEmail);
    const employeeUid = safeUid(employee.data?.authUid) || safeUid(employee.data?.uid);
    const existingUser = chooseExistingUserForLogin(matchingUsers, employeeUid);
    if (matchingUsers.length > 0 && !existingUser && !employeeUid) {
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
      isEnabled: true,
      isService: access.isService,
      role: existingUser?.data?.role || access.role,
      appAccess: access.appAccess,
      defaultWorkspace: access.defaultWorkspace,
      updatedAt: now,
    });

    const customToken = createFirebaseCustomToken(uid, {
      authMethod: "userCode",
      companyEmail: cleanEmail,
      employeeId: employee.id,
    });

    await adminCreateDocument("loginSecurityLogs", {
      uid,
      email: cleanEmail,
      loginMethod: "user-code-issued",
      employeeId: employee.id,
      createdAt: now,
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
    console.error("User code login failed", error);
    return NextResponse.json(
      { error: error?.message || "Could not sign in with user code." },
      { status: 500 }
    );
  }
}
