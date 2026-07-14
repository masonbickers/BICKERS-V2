import fs from "node:fs";
import path from "node:path";
import { TENANT_COLLECTION_MANIFEST } from "../src/app/config/tenantCollections.js";

let adminListDocuments;

const REQUIRED_USER_FIELDS = ["uid", "email", "role", "companyId", "isEnabled", "appAccess"];

const COMPANY_SCOPED_COLLECTIONS = ["users", ...TENANT_COLLECTION_MANIFEST];

const clean = (value) => String(value || "").trim();
const cleanEmail = (value) => clean(value).toLowerCase();

function loadEnvFileIfNeeded() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL && process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return;
  }

  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key]) continue;

      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.replace(/\\n/g, "\n");
    }
  }
}

function normalizeDoc({ id, data }) {
  return { id, ...(data || {}) };
}

function userUid(user = {}) {
  return clean(user.uid || user.id);
}

function employeeUid(employee = {}) {
  return clean(employee.authUid || employee.uid);
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

function missingUserFields(users) {
  return users
    .map((user) => ({
      id: user.id,
      uid: userUid(user),
      email: cleanEmail(user.email),
      missing: REQUIRED_USER_FIELDS.filter((field) => {
        if (field === "appAccess") return !user.appAccess || typeof user.appAccess !== "object";
        if (field === "isEnabled") return typeof user.isEnabled !== "boolean";
        return !clean(user[field]);
      }),
    }))
    .filter((row) => row.missing.length > 0);
}

function employeeUserLinkReport(users, employees) {
  const employeeIds = new Set(employees.map((employee) => clean(employee.id)).filter(Boolean));
  const userUids = new Set(users.map(userUid).filter(Boolean));
  const employeesByUid = groupBy(employees, employeeUid);
  const usersByEmployeeId = groupBy(users, (user) => clean(user.employeeId));
  const employeeById = employees.reduce((acc, employee) => {
    const id = clean(employee.id);
    if (id) acc[id] = employee;
    return acc;
  }, {});
  const employeesByAuthUid = employees.reduce((acc, employee) => {
    const uid = employeeUid(employee);
    if (uid) acc[uid] = employee;
    return acc;
  }, {});

  return {
    employeesMissingAuthUid: employees
      .filter((employee) => !employeeUid(employee))
      .map((employee) => ({
        employeeId: employee.id,
        companyId: clean(employee.companyId),
        email: cleanEmail(employee.email || employee.workEmail || employee.personalEmail || employee.emailAddress),
        name: clean(employee.name || employee.fullName || [employee.firstName, employee.lastName].filter(Boolean).join(" ")),
      })),
    usersWithoutEmployeeLink: users
      .filter((user) => {
        const uid = userUid(user);
        return !clean(user.employeeId) && uid && !employeesByAuthUid[uid];
      })
      .map((user) => ({
        userId: userUid(user),
        companyId: clean(user.companyId),
        role: clean(user.role),
        email: cleanEmail(user.email),
      })),
    duplicateEmployeeAuthLinks: Object.entries(employeesByUid)
      .filter(([, rows]) => rows.length > 1)
      .map(([uid, rows]) => ({ uid, employeeIds: rows.map((row) => row.id) })),
    duplicateUserEmployeeLinks: Object.entries(usersByEmployeeId)
      .filter(([, rows]) => rows.length > 1)
      .map(([employeeId, rows]) => ({ employeeId, userIds: rows.map(userUid) })),
    orphanedUserLinks: users
      .filter((user) => clean(user.employeeId) && !employeeIds.has(clean(user.employeeId)))
      .map((user) => ({
        userId: userUid(user),
        employeeId: clean(user.employeeId),
        email: cleanEmail(user.email),
      })),
    orphanedEmployeeLinks: employees
      .filter((employee) => employeeUid(employee) && !userUids.has(employeeUid(employee)))
      .map((employee) => ({
        employeeId: employee.id,
        uid: employeeUid(employee),
        email: cleanEmail(employee.email || employee.workEmail || employee.personalEmail || employee.emailAddress),
      })),
    companyMismatchLinks: users
      .map((user) => {
        const employee =
          employeeById[clean(user.employeeId)] ||
          employeesByAuthUid[userUid(user)];
        if (!employee) return null;
        const userCompanyId = clean(user.companyId);
        const employeeCompanyId = clean(employee.companyId);
        if (!userCompanyId || !employeeCompanyId || userCompanyId === employeeCompanyId) return null;
        return {
          userId: userUid(user),
          userEmail: cleanEmail(user.email),
          userCompanyId,
          employeeId: clean(employee.id),
          employeeCompanyId,
        };
      })
      .filter(Boolean),
  };
}

async function missingCompanyIdReport() {
  const report = {};

  for (const collectionName of COMPANY_SCOPED_COLLECTIONS) {
    const docs = (await adminListDocuments(collectionName)).map(normalizeDoc);
    const missing = docs
      .filter((doc) => !clean(doc.companyId))
      .map((doc) => ({
        id: doc.id,
        label: clean(doc.email || doc.name || doc.registration || doc.jobNumber || doc.title),
      }));

    report[collectionName] = {
      total: docs.length,
      missingCompanyId: missing.length,
      examples: missing.slice(0, 25),
    };
  }

  return report;
}

async function main() {
  loadEnvFileIfNeeded();
  ({ adminListDocuments } = await import("../src/app/api/_firebaseAdminRest.js"));

  const [userDocs, employeeDocs] = await Promise.all([
    adminListDocuments("users"),
    adminListDocuments("employees"),
  ]);
  const users = userDocs.map(normalizeDoc);
  const employees = employeeDocs.map(normalizeDoc);
  const links = employeeUserLinkReport(users, employees);
  const missingCompanyId = await missingCompanyIdReport();

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    summary: {
      users: users.length,
      employees: employees.length,
      usersMissingRequiredFields: missingUserFields(users).length,
      employeesMissingAuthUid: links.employeesMissingAuthUid.length,
      usersWithoutEmployeeLink: links.usersWithoutEmployeeLink.length,
      duplicateEmployeeAuthLinks: links.duplicateEmployeeAuthLinks.length,
      duplicateUserEmployeeLinks: links.duplicateUserEmployeeLinks.length,
      orphanedUserLinks: links.orphanedUserLinks.length,
      orphanedEmployeeLinks: links.orphanedEmployeeLinks.length,
      companyMismatchLinks: links.companyMismatchLinks.length,
    },
    usersMissingRequiredFields: missingUserFields(users),
    employeeUserLinks: links,
    missingCompanyId,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("Auth access repair report failed:", error);
  process.exitCode = 1;
});
