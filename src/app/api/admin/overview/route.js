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

const VALID_SECTIONS = new Set(["access", "sick", "holiday", "activity", "audit"]);

const dayKey = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const activityHistoryDocsForDay = (docs, selectedDay) =>
  docs.flatMap((row) => {
    const history = Array.isArray(row.data?.history) ? row.data.history : [];
    if (!history.length) {
      return [row.data?.updatedAt, row.data?.createdAt].some((value) => dayKey(value) === selectedDay)
        ? [row]
        : [];
    }
    const selectedHistory = history.filter((entry) =>
      dayKey(entry?.timestamp || entry?.updatedAt || row.data?.updatedAt || row.data?.createdAt) === selectedDay
    );
    return selectedHistory.length
      ? [{ ...row, data: { ...row.data, history: selectedHistory } }]
      : [];
  });

const activityDocsForDay = (docs, selectedDay, fields) =>
  docs.filter(({ data }) => fields.some((field) => dayKey(data?.[field]) === selectedDay));

export async function GET(req) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (admin.error) return admin.error;

    const url = new URL(req.url);
    const section = String(url.searchParams.get("section") || "access").trim().toLowerCase();
    if (!VALID_SECTIONS.has(section)) return jsonError("Unknown admin overview section.", 400);

    const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("day") || "")
      ? url.searchParams.get("day")
      : new Date().toISOString().slice(0, 10);

    const requestedCollections = {
      access: ["users", "employees"],
      sick: ["employees", "sickLeave"],
      holiday: ["employees", "holidays"],
      activity: ["users", "sickLeave", "bookings", "maintenanceBookings", "maintenanceJobs", "holidays"],
      audit: ["adminAuditLogs"],
    }[section];

    const entries = await Promise.all(
      requestedCollections.map(async (collectionName) => {
        const options = collectionName === "adminAuditLogs"
          ? { maxDocuments: 250, orderBy: "createdAt desc" }
          : {};
        return [collectionName, await adminListDocuments(collectionName, options)];
      })
    );
    const loaded = Object.fromEntries(entries);
    const users = loaded.users || [];
    const employees = loaded.employees || [];
    const sickLeave = loaded.sickLeave || [];
    const adminAuditLogs = loaded.adminAuditLogs || [];
    const bookings = loaded.bookings || [];
    const maintenanceBookings = loaded.maintenanceBookings || [];
    const maintenanceJobs = loaded.maintenanceJobs || [];
    const holidays = loaded.holidays || [];

    const scopedUsers = filterDocsForAdminCompany(users, admin.userData);
    const scopedEmployees = filterDocsForAdminCompany(employees, admin.userData);
    const scopedSickLeave = filterDocsForAdminCompany(sickLeave, admin.userData);
    const scopedAuditLogs = filterDocsForAdminCompany(adminAuditLogs, admin.userData);
    const scopedBookings = filterDocsForAdminCompany(bookings, admin.userData);
    const scopedMaintenanceBookings = filterDocsForAdminCompany(maintenanceBookings, admin.userData);
    const scopedMaintenanceJobs = filterDocsForAdminCompany(maintenanceJobs, admin.userData);
    const scopedHolidays = filterDocsForAdminCompany(holidays, admin.userData);

    const activityBookings = section === "activity"
      ? activityHistoryDocsForDay(scopedBookings, selectedDay)
      : scopedBookings;
    const activityMaintenanceBookings = section === "activity"
      ? activityHistoryDocsForDay(scopedMaintenanceBookings, selectedDay)
      : scopedMaintenanceBookings;
    const activityMaintenanceJobs = section === "activity"
      ? activityDocsForDay(scopedMaintenanceJobs, selectedDay, ["updatedAtServer", "updatedAt", "createdAt"])
      : scopedMaintenanceJobs;
    const activityHolidays = section === "activity"
      ? activityDocsForDay(scopedHolidays, selectedDay, ["updatedAt", "createdAt", "startDate"])
      : scopedHolidays;
    const activitySickLeave = section === "activity"
      ? activityDocsForDay(scopedSickLeave, selectedDay, ["updatedAt", "createdAt", "startDate"])
      : scopedSickLeave;
    const activityUsers = section === "activity"
      ? activityDocsForDay(scopedUsers, selectedDay, ["updatedAt", "createdAt"])
      : scopedUsers;

    return Response.json({
      ok: true,
      section,
      users: section === "access" ? mergeAccessUsers(scopedUsers, scopedEmployees) : activityUsers.map(withId),
      employees: scopedEmployees.map(withId).sort(sortByText("name")),
      sickLeave: activitySickLeave.map(withId).sort(sortNewest),
      adminAuditLogs: scopedAuditLogs.map(withId).sort(sortNewest).slice(0, 250),
      bookings: activityBookings.map(withId),
      maintenanceBookings: activityMaintenanceBookings.map(withId),
      maintenanceJobs: activityMaintenanceJobs.map(withId),
      holidays: activityHolidays.map(withId),
    });
  } catch (error) {
    console.error("Admin overview load failed:", error);
    return jsonError(error?.message || "Could not load admin overview.", 500);
  }
}
