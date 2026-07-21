import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const KNOWN_MODULES = [
  "diary", "bookings", "workshop", "vehicles", "equipment", "uCrane", "jobSheets",
  "employees", "hr", "hAndS", "statistics", "timesheets", "holidays", "finance",
  "invoices", "assistant", "settings", "mobileApp",
  "pushNotifications",
];

const clean = (value) => String(value || "").trim();
const normalizeEmail = (value) => clean(value).toLowerCase();
const validUid = (value) => UID_PATTERN.test(clean(value)) ? clean(value) : "";
const dataOf = (row = {}) => row.data && typeof row.data === "object" ? row.data : row;
const idOf = (row = {}) => clean(row.id || row.documentId);

function explicitLink(record = {}, fields = []) {
  const raw = fields.map((field) => clean(record?.[field])).filter(Boolean);
  const normalized = raw.map(validUid);
  const values = [...new Set(normalized.filter(Boolean))];
  return {
    conflict: normalized.some((value) => !value) || values.length > 1,
    uid: values.length === 1 ? values[0] : "",
  };
}

function clerkIds(record = {}) {
  return [record.clerkUserId, record.auth?.clerkUserId].map(clean).filter(Boolean);
}

function recordEmails(record = {}) {
  return ["email", "workEmail", "personalEmail", "emailAddress", "contactEmail"]
    .map((field) => normalizeEmail(record[field]))
    .filter(Boolean);
}

function clerkEmails(record = {}) {
  const rows = record.email_addresses || record.emailAddresses || [];
  return rows
    .filter((row) => clean(row?.verification?.status).toLowerCase() === "verified")
    .map((row) => normalizeEmail(row.email_address || row.emailAddress))
    .filter(Boolean);
}

function clerkUidLink(record = {}) {
  return explicitLink({
    externalId: record.external_id ?? record.externalId,
    firebaseUid: record.private_metadata?.firebaseUid ?? record.privateMetadata?.firebaseUid,
  }, ["externalId", "firebaseUid"]);
}

function isDisabled(record = {}) {
  return record.isEnabled === false || record.active === false || record.archived === true ||
    record.isArchived === true || record.disabled === true || record.appDisabled === true ||
    clean(record.status).toLowerCase() === "disabled" || clean(record.role).toLowerCase() === "archived";
}

function hasWorkspaceConfig(record = {}) {
  return record.appAccess && typeof record.appAccess === "object" &&
    (typeof record.appAccess.user === "boolean" || typeof record.appAccess.service === "boolean");
}

function group(rows, keyFn) {
  const result = new Map();
  for (const row of rows) {
    const key = clean(keyFn(row));
    if (!key) continue;
    result.set(key, [...(result.get(key) || []), row]);
  }
  return result;
}

export function analyzeIdentityInventory(input = {}) {
  const users = (input.users || []).map((row) => ({ id: idOf(row), data: dataOf(row) }));
  const employees = (input.employees || []).map((row) => ({ id: idOf(row), data: dataOf(row) }));
  const clerkUsers = (input.clerkUsers || []).map((row) => ({ id: clean(row.id), data: row }));
  const settings = (input.settings || []).map((row) => ({ id: idOf(row), data: dataOf(row) }));
  const companies = (input.platformCompanies || []).map((row) => ({ id: idOf(row), data: dataOf(row) }));

  const userById = new Map(users.map((row) => [row.id, row]));
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  const clerkById = new Map(clerkUsers.map((row) => [row.id, row]));
  const employeeLinks = employees.map((row) => ({ ...row, link: explicitLink(row.data, ["authUid", "uid"]) }));
  const clerkLinks = clerkUsers.map((row) => ({ ...row, link: clerkUidLink(row.data) }));
  const employeesByUid = group(employeeLinks.filter((row) => !row.link.conflict), (row) => row.link.uid);
  const canonicalByClerkId = group(users.flatMap((row) => clerkIds(row.data).map((id) => ({ id, userId: row.id }))), (row) => row.id);
  const clerkByUid = group(clerkLinks.filter((row) => !row.link.conflict), (row) => row.link.uid);

  const confirmed = {
    employeesMissingFirebaseUid: employeeLinks.filter((row) => !row.link.uid && !row.link.conflict).map((row) => ({ employeeId: row.id })),
    conflictingEmployeeUidLinks: employeeLinks.filter((row) => row.link.conflict).map((row) => ({ employeeId: row.id })),
    duplicateEmployeeUidLinks: [...employeesByUid.entries()].filter(([, rows]) => rows.length > 1)
      .map(([uid, rows]) => ({ uid, employeeIds: rows.map((row) => row.id) })),
    canonicalUidMismatches: users.filter((row) => !validUid(row.data.uid) || row.id !== validUid(row.data.uid))
      .map((row) => ({ userId: row.id, recordedUid: validUid(row.data.uid) })),
    orphanedEmployeeFirebaseLinks: employeeLinks.filter((row) => row.link.uid && !userById.has(row.link.uid))
      .map((row) => ({ employeeId: row.id, uid: row.link.uid })),
    canonicalUsersMissingEmployeeLinks: users.filter((row) => {
      const role = clean(row.data.role).toLowerCase();
      if (role === "admin" || role === "platformadmin") return false;
      return !(employeesByUid.get(row.id) || []).length;
    }).map((row) => ({ userId: row.id })),
    duplicateCanonicalClerkLinks: [...canonicalByClerkId.entries()].filter(([, rows]) => rows.length > 1)
      .map(([clerkUserId, rows]) => ({ clerkUserId, userIds: rows.map((row) => row.userId) })),
    duplicateClerkUidLinks: [...clerkByUid.entries()].filter(([, rows]) => rows.length > 1)
      .map(([uid, rows]) => ({ uid, clerkUserIds: rows.map((row) => row.id) })),
    conflictingClerkUidLinks: clerkLinks.filter((row) => row.link.conflict).map((row) => ({ clerkUserId: row.id })),
    orphanedCanonicalClerkLinks: users.flatMap((row) => clerkIds(row.data)
      .filter((id) => !clerkById.has(id)).map((id) => ({ userId: row.id, clerkUserId: id }))),
    orphanedClerkUidLinks: clerkLinks.filter((row) => row.link.uid && !userById.has(row.link.uid))
      .map((row) => ({ clerkUserId: row.id, uid: row.link.uid })),
    employeesMissingClerkLinks: employeeLinks.filter((row) => {
      if (!row.link.uid || row.link.conflict) return false;
      const user = userById.get(row.link.uid);
      return !(user && clerkIds(user.data).length) && !(clerkByUid.get(row.link.uid) || []).length;
    }).map((row) => ({ employeeId: row.id, uid: row.link.uid })),
    canonicalEmployeeMismatches: users.flatMap((row) => {
      const employeeId = clean(row.data.employeeId);
      if (!employeeId) return [];
      const employee = employeeById.get(employeeId);
      const link = employee ? explicitLink(employee.data, ["authUid", "uid"]) : null;
      return !employee || link.conflict || link.uid !== row.id ? [{ userId: row.id, employeeId }] : [];
    }),
    crossCompanyLinkConflicts: employeeLinks.flatMap((row) => {
      if (!row.link.uid || row.link.conflict) return [];
      const user = userById.get(row.link.uid);
      const userCompanyId = clean(user?.data?.companyId);
      const employeeCompanyId = clean(row.data.companyId);
      return userCompanyId && employeeCompanyId && userCompanyId !== employeeCompanyId
        ? [{ userId: row.link.uid, employeeId: row.id, userCompanyId, employeeCompanyId }]
        : [];
    }),
    disabledRecordsWithActiveLinks: [
      ...users.filter((row) => isDisabled(row.data) && (validUid(row.data.uid) || clerkIds(row.data).length))
        .map((row) => ({ type: "user", id: row.id })),
      ...employeeLinks.filter((row) => isDisabled(row.data) && row.link.uid)
        .map((row) => ({ type: "employee", id: row.id })),
    ],
    usersMissingWorkspaceConfiguration: users.filter((row) => !hasWorkspaceConfig(row.data)).map((row) => ({ userId: row.id })),
    employeesMissingWorkspaceConfiguration: employees.filter((row) => !hasWorkspaceConfig(row.data)).map((row) => ({ employeeId: row.id })),
    globalModuleFieldsMissing: [],
    companyModuleConfigurationMissing: [],
  };

  const platformFeatures = settings.find((row) => row.id === "platformFeatures")?.data || {};
  const platform = settings.find((row) => row.id === "platform")?.data || {};
  const globalFlags = platformFeatures.featureFlags || platformFeatures.features || platform.featureFlags || platform.features || {};
  confirmed.globalModuleFieldsMissing = KNOWN_MODULES.filter((key) => typeof globalFlags[key] !== "boolean")
    .map((module) => ({ module }));

  const usedCompanyIds = new Set([
    ...users.map((row) => clean(row.data.companyId)),
    ...employees.map((row) => clean(row.data.companyId)),
  ].filter(Boolean));
  const companyById = new Map(companies.map((row) => [row.id, row]));
  confirmed.companyModuleConfigurationMissing = [...usedCompanyIds].flatMap((companyId) => {
    const record = companyById.get(companyId)?.data || {};
    const flags = record.modules || record.featureFlags || {};
    const missingModules = KNOWN_MODULES.filter((key) => typeof flags[key] !== "boolean");
    return missingModules.length ? [{ companyId, missingModules }] : [];
  });

  const uncertainEmailOnlyMatches = employeeLinks.flatMap((employee) => {
    if (employee.link.uid || employee.link.conflict) return [];
    const emails = new Set(recordEmails(employee.data));
    const matches = clerkUsers.filter((clerk) => clerkEmails(clerk.data).some((email) => emails.has(email)));
    return matches.length ? [{ employeeId: employee.id, possibleClerkUserIds: matches.map((row) => row.id), reason: "email-only match" }] : [];
  });

  return {
    summary: Object.fromEntries(Object.entries(confirmed).map(([key, rows]) => [key, rows.length])),
    confirmed,
    uncertain: { emailOnlyMatches: uncertainEmailOnlyMatches },
  };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(\"|')(.*)\1$/, "$2").replace(/\\n/g, "\n");
  }
}

async function listClerkUsers(secret) {
  const users = [];
  for (let offset = 0; ; offset += 500) {
    const response = await fetch(`https://api.clerk.com/v1/users?limit=500&offset=${offset}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Clerk user inventory failed with HTTP ${response.status}.`);
    const body = await response.json();
    const page = Array.isArray(body) ? body : body?.data || [];
    users.push(...page);
    if (page.length < 500) return users;
  }
}

async function loadProductionInventory(projectId) {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL || !process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error("Firebase service-account credentials are required.");
  }
  if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is required.");
  const configuredProject = clean(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (configuredProject && configuredProject !== projectId) {
    throw new Error(`Configured Firebase project ${configuredProject} does not match requested project ${projectId}.`);
  }
  process.env.FIREBASE_PROJECT_ID = projectId;
  const { adminListDocuments } = await import("../src/app/api/_firebaseAdminRest.js");
  const [users, employees, settings, platformCompanies, clerkUsers] = await Promise.all([
    adminListDocuments("users"),
    adminListDocuments("employees"),
    adminListDocuments("settings"),
    adminListDocuments("platformCompanies"),
    listClerkUsers(process.env.CLERK_SECRET_KEY),
  ]);
  return { users, employees, settings, platformCompanies, clerkUsers };
}

async function main() {
  const args = process.argv.slice(2);
  const fixtureArg = args.find((arg) => arg.startsWith("--fixture="));
  const projectArg = args.find((arg) => arg.startsWith("--project="));
  const production = args.includes("--production");
  if (fixtureArg && production) throw new Error("Choose fixture or production mode, not both.");

  let input;
  let mode;
  if (fixtureArg) {
    const fixturePath = path.resolve(ROOT, fixtureArg.slice("--fixture=".length));
    input = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    mode = "fixture";
  } else if (production) {
    if (process.env.IDENTITY_INVENTORY_CONFIRM_READ_ONLY !== "1") {
      throw new Error("Set IDENTITY_INVENTORY_CONFIRM_READ_ONLY=1 to acknowledge read-only production access.");
    }
    const projectId = clean(projectArg?.slice("--project=".length));
    if (!projectId) throw new Error("--project is required in production mode.");
    input = await loadProductionInventory(projectId);
    mode = `production-read-only:${projectId}`;
  } else {
    throw new Error("Use --fixture=<path> or explicitly approved --production --project=<id> mode.");
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mode, ...analyzeIdentityInventory(input) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(`Identity inventory execution failed: ${error.message}`);
    process.exitCode = 1;
  });
}
