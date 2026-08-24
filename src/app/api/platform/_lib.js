import { adminCreateDocument, adminListDocuments, adminReadDocument } from "@/app/api/_firebaseAdminRest";
import { requirePlatformAdminFromRequest } from "@/app/api/admin/_lib";

export function cleanId(value) {
  return String(value || "").trim();
}

export function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function headerValue(headers, name) {
  return String(headers?.get?.(name) || "").trim();
}

export function clientIp(req) {
  const forwarded = headerValue(req.headers, "x-forwarded-for");
  return (
    headerValue(req.headers, "cf-connecting-ip") ||
    headerValue(req.headers, "x-real-ip") ||
    String(forwarded.split(",")[0] || "").trim() ||
    ""
  );
}

export async function requirePlatformAdmin(req) {
  return requirePlatformAdminFromRequest(req);
}

export async function readExistingDocument(collection, documentId) {
  const id = cleanId(documentId);
  if (!id || id.includes("/")) return null;
  return adminReadDocument(collection, id);
}

export async function writePlatformAudit(req, actor, {
  action,
  targetType,
  targetId,
  companyId = "",
  before = null,
  after = null,
  details = {},
} = {}) {
  const nowIso = new Date().toISOString();
  await adminCreateDocument("adminAuditLogs", {
    actorUid: actor?.uid || "",
    actorEmail: actor?.email || "",
    actorRole: "platformAdmin",
    targetType: targetType || "platform",
    targetId: cleanId(targetId),
    companyId: companyId || before?.companyId || after?.companyId || "",
    action: action || "Platform API action",
    area: "Platform API",
    before,
    after,
    details,
    ip: req ? clientIp(req) : "",
    userAgent: req ? headerValue(req.headers, "user-agent") : "",
    createdAt: nowIso,
  });
}

function userRecordUid({ id, data } = {}) {
  return cleanId(data?.uid || id);
}

function employeeRecordUid({ data } = {}) {
  return cleanId(data?.authUid || data?.uid);
}

function groupBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

export async function buildEmployeeUserLinkReport() {
  const [employeeDocs, userDocs] = await Promise.all([
    adminListDocuments("employees"),
    adminListDocuments("users"),
  ]);
  const employeeIds = new Set(employeeDocs.map(({ id }) => cleanId(id)).filter(Boolean));
  const userUids = new Set(userDocs.map(userRecordUid).filter(Boolean));
  const employeesByUid = groupBy(employeeDocs, employeeRecordUid);
  const usersByEmployeeId = groupBy(userDocs, ({ data }) => cleanId(data?.employeeId));

  const duplicateEmployeeAuthLinks = Object.entries(employeesByUid)
    .filter(([, rows]) => rows.length > 1)
    .map(([uid, rows]) => ({
      uid,
      employeeIds: rows.map(({ id }) => id),
    }));

  const duplicateUserEmployeeLinks = Object.entries(usersByEmployeeId)
    .filter(([, rows]) => rows.length > 1)
    .map(([employeeId, rows]) => ({
      employeeId,
      userIds: rows.map(({ id, data }) => cleanId(data?.uid || id)),
    }));

  const orphanedUserLinks = userDocs
    .filter(({ data }) => cleanId(data?.employeeId) && !employeeIds.has(cleanId(data.employeeId)))
    .map(({ id, data }) => ({
      userId: cleanId(data?.uid || id),
      employeeId: cleanId(data?.employeeId),
      email: cleanEmail(data?.email),
    }));

  const orphanedEmployeeLinks = employeeDocs
    .filter((employee) => employeeRecordUid(employee) && !userUids.has(employeeRecordUid(employee)))
    .map(({ id, data }) => ({
      employeeId: id,
      uid: cleanId(data?.authUid || data?.uid),
      email: cleanEmail(data?.email || data?.workEmail || data?.personalEmail || data?.emailAddress),
    }));

  return {
    duplicateEmployeeAuthLinks,
    duplicateUserEmployeeLinks,
    orphanedUserLinks,
    orphanedEmployeeLinks,
  };
}

export async function validateEmployeeUserLink({ uid, employeeId }) {
  const cleanUid = cleanId(uid);
  const cleanEmployeeId = cleanId(employeeId);
  const [employeeDocs, userDocs] = await Promise.all([
    adminListDocuments("employees"),
    adminListDocuments("users"),
  ]);
  const conflicts = [];
  const targetEmployee = employeeDocs.find(({ id }) => cleanId(id) === cleanEmployeeId);
  const targetUser = userDocs.find((user) => userRecordUid(user) === cleanUid || cleanId(user.id) === cleanUid);

  if (!targetEmployee) conflicts.push("Employee not found.");
  if (!targetUser) conflicts.push("User not found.");

  const targetEmployeeUid = targetEmployee ? employeeRecordUid(targetEmployee) : "";
  if (targetEmployeeUid && targetEmployeeUid !== cleanUid) {
    conflicts.push("Employee is already linked to another auth user.");
  }

  const targetUserEmployeeId = targetUser ? cleanId(targetUser.data?.employeeId) : "";
  if (targetUserEmployeeId && targetUserEmployeeId !== cleanEmployeeId) {
    conflicts.push("Auth user is already linked to another employee.");
  }

  const otherEmployeesForUid = employeeDocs.filter(
    (employee) => cleanId(employee.id) !== cleanEmployeeId && employeeRecordUid(employee) === cleanUid
  );
  if (otherEmployeesForUid.length) {
    conflicts.push("Auth user is already linked from another employee record.");
  }

  const otherUsersForEmployee = userDocs.filter(
    (user) => userRecordUid(user) !== cleanUid && cleanId(user.data?.employeeId) === cleanEmployeeId
  );
  if (otherUsersForEmployee.length) {
    conflicts.push("Employee is already linked from another user record.");
  }

  return {
    ok: conflicts.length === 0,
    conflicts,
    report: await buildEmployeeUserLinkReport(),
  };
}

export function jsonOk(payload = {}) {
  return Response.json({ ok: true, ...payload });
}
