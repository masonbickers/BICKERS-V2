import { adminListDocuments } from "../../_firebaseAdminRest";
import { filterDocsForAdminCompany, jsonError, requireAdminFromRequest } from "../_lib";

const withId = ({ id, data }) => ({ id, ...(data || {}) });

const cleanEmail = (value) => String(value || "").trim().toLowerCase();

const employeeEmail = (employee = {}) =>
  cleanEmail(employee.email || employee.workEmail || employee.personalEmail || employee.emailAddress);

const employeeName = (employee = {}) =>
  String(employee.name || employee.fullName || employee.employeeName || "").trim();

const accessUserFromEmployee = (employee = {}) => {
  const uid = String(employee.authUid || employee.uid || "").trim();
  if (!uid) return null;
  const isService = employee.isService === true || String(employee.role || "").trim().toLowerCase() === "service";
  return {
    id: uid,
    uid,
    email: employeeEmail(employee),
    name: employeeName(employee),
    role: "user",
    isEnabled: employee.isEnabled !== false && employee.disabled !== true && employee.archived !== true,
    appAccess: {
      user: !isService,
      service: isService,
    },
    defaultWorkspace: isService ? "service" : "user",
    companyId: employee.companyId || "bickers-action",
    employeeId: employee.id || employee.employeeId || "",
    phoneVerified: employee.phoneVerified === true,
    mfaEnabled: false,
    mfaMethod: "",
    mfaResetRequired: false,
    source: "employee-link",
    createdAt: employee.createdAt || "",
    updatedAt: employee.updatedAt || "",
  };
};

const mergeAccessUsers = (userDocs = [], employeeDocs = []) => {
  const byUid = new Map();
  const indexUser = (user) => {
    const uid = String(user.uid || user.id || "").trim();
    if (!uid) return;
    byUid.set(uid, { ...(byUid.get(uid) || {}), ...user, id: user.id || uid, uid });
  };

  userDocs.map(withId).forEach(indexUser);

  employeeDocs.map(withId).forEach((employee) => {
    const fromEmployee = accessUserFromEmployee(employee);
    if (!fromEmployee) return;
    const existing = byUid.get(fromEmployee.uid);
    byUid.set(fromEmployee.uid, {
      ...fromEmployee,
      ...(existing || {}),
      email: cleanEmail(existing?.email) || fromEmployee.email,
      name: existing?.name || existing?.displayName || fromEmployee.name,
      companyId: existing?.companyId || fromEmployee.companyId,
      employeeId: existing?.employeeId || fromEmployee.employeeId,
      source: existing ? existing.source || "users" : fromEmployee.source,
    });
  });

  return Array.from(byUid.values()).sort(sortByText("email"));
};

const sortByText = (field) => (a, b) =>
  String(a?.[field] || "").localeCompare(String(b?.[field] || ""));

const sortNewest = (a, b) =>
  new Date(b?.createdAt || b?.updatedAt || 0).getTime() -
  new Date(a?.createdAt || a?.updatedAt || 0).getTime();

export async function GET(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;

    const [
      users,
      employees,
      holidayAllowances,
      sickLeave,
      adminAuditLogs,
      bookings,
      maintenanceBookings,
      maintenanceJobs,
      holidays,
    ] = await Promise.all([
      adminListDocuments("users"),
      adminListDocuments("employees"),
      adminListDocuments("holidayAllowances"),
      adminListDocuments("sickLeave"),
      adminListDocuments("adminAuditLogs"),
      adminListDocuments("bookings"),
      adminListDocuments("maintenanceBookings"),
      adminListDocuments("maintenanceJobs"),
      adminListDocuments("holidays"),
    ]);

    const scopedUsers = filterDocsForAdminCompany(users, admin.userData);
    const scopedEmployees = filterDocsForAdminCompany(employees, admin.userData);
    const scopedHolidayAllowances = filterDocsForAdminCompany(holidayAllowances, admin.userData);
    const scopedSickLeave = filterDocsForAdminCompany(sickLeave, admin.userData);
    const scopedAuditLogs = filterDocsForAdminCompany(adminAuditLogs, admin.userData);
    const scopedBookings = filterDocsForAdminCompany(bookings, admin.userData);
    const scopedMaintenanceBookings = filterDocsForAdminCompany(maintenanceBookings, admin.userData);
    const scopedMaintenanceJobs = filterDocsForAdminCompany(maintenanceJobs, admin.userData);
    const scopedHolidays = filterDocsForAdminCompany(holidays, admin.userData);

    return Response.json({
      ok: true,
      users: mergeAccessUsers(scopedUsers, scopedEmployees),
      employees: scopedEmployees.map(withId).sort(sortByText("name")),
      holidayAllowances: scopedHolidayAllowances.map(withId),
      sickLeave: scopedSickLeave.map(withId).sort(sortNewest),
      adminAuditLogs: scopedAuditLogs.map(withId).sort(sortNewest).slice(0, 250),
      bookings: scopedBookings.map(withId),
      maintenanceBookings: scopedMaintenanceBookings.map(withId),
      maintenanceJobs: scopedMaintenanceJobs.map(withId),
      holidays: scopedHolidays.map(withId),
    });
  } catch (error) {
    console.error("Admin overview load failed:", error);
    return jsonError(error?.message || "Could not load admin overview.", 500);
  }
}
