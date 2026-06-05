import fs from "node:fs";
import path from "node:path";

let adminListDocuments;
let adminPatchDocument;

const dryRun = !process.argv.includes("--write");

const clean = (value) => String(value || "").trim();
const key = (value) => clean(value).toLowerCase();

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

      const [, envKey, rawValue] = match;
      if (process.env[envKey]) continue;

      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[envKey] = value.replace(/\\n/g, "\n");
    }
  }
}

function employeeDisplayName(employee) {
  return clean(employee.name || employee.fullName || employee.employeeName);
}

function employeePrimaryCode(employee) {
  return clean(employee.userCode || employee.employeeCode || employee.code || employee.loginCode);
}

function addUnique(map, value, employee) {
  const mapKey = key(value);
  if (!mapKey) return;
  const existing = map.get(mapKey);
  if (!existing) {
    map.set(mapKey, employee);
    return;
  }
  if (existing.id !== employee.id) {
    map.set(mapKey, null);
  }
}

function buildEmployeeIndexes(employees) {
  const byCode = new Map();
  const byName = new Map();

  employees.forEach((employee) => {
    [
      employee.userCode,
      employee.employeeCode,
      employee.code,
      employee.loginCode,
    ].forEach((value) => addUnique(byCode, value, employee));

    [
      employee.name,
      employee.fullName,
      employee.employeeName,
      employee.displayName,
    ].forEach((value) => addUnique(byName, value, employee));
  });

  return { byCode, byName };
}

function patchForTimesheet(timesheet, employee) {
  const patch = {};
  const canonicalName = employeeDisplayName(employee);
  const canonicalCode = employeePrimaryCode(employee);

  if (canonicalName && clean(timesheet.employeeName) !== canonicalName) {
    patch.employeeName = canonicalName;
  }
  if (canonicalCode && clean(timesheet.employeeCode) !== canonicalCode) {
    patch.employeeCode = canonicalCode;
  }
  if (employee.id && clean(timesheet.employeeId) !== employee.id) {
    patch.employeeId = employee.id;
  }
  if (employee.companyId && clean(timesheet.companyId) !== clean(employee.companyId)) {
    patch.companyId = clean(employee.companyId);
  }

  return patch;
}

async function main() {
  loadEnvFileIfNeeded();
  ({ adminListDocuments, adminPatchDocument } = await import("../src/app/api/_firebaseAdminRest.js"));

  const [employeeDocs, timesheetDocs] = await Promise.all([
    adminListDocuments("employees"),
    adminListDocuments("timesheets"),
  ]);

  const employees = employeeDocs.map(({ id, data }) => ({ id, ...(data || {}) }));
  const timesheets = timesheetDocs.map(({ id, data }) => ({ id, ...(data || {}) }));
  const { byCode, byName } = buildEmployeeIndexes(employees);

  const repairs = [];
  const unresolved = [];
  const ambiguous = [];

  timesheets.forEach((timesheet) => {
    const codeMatch = byCode.get(key(timesheet.employeeCode));
    const nameMatch = byName.get(key(timesheet.employeeName));
    const match = codeMatch || nameMatch || null;

    if (codeMatch === null || nameMatch === null) {
      ambiguous.push({
        id: timesheet.id,
        weekStart: timesheet.weekStart || "",
        employeeCode: timesheet.employeeCode || "",
        employeeName: timesheet.employeeName || "",
      });
      return;
    }

    if (!match) {
      unresolved.push({
        id: timesheet.id,
        weekStart: timesheet.weekStart || "",
        employeeCode: timesheet.employeeCode || "",
        employeeName: timesheet.employeeName || "",
      });
      return;
    }

    const patch = patchForTimesheet(timesheet, match);
    if (!Object.keys(patch).length) return;

    repairs.push({
      id: timesheet.id,
      weekStart: timesheet.weekStart || "",
      from: {
        employeeCode: timesheet.employeeCode || "",
        employeeName: timesheet.employeeName || "",
        employeeId: timesheet.employeeId || "",
        companyId: timesheet.companyId || "",
      },
      to: patch,
    });
  });

  const report = {
    mode: dryRun ? "dry-run" : "write",
    employees: employees.length,
    timesheets: timesheets.length,
    repairs: repairs.length,
    unresolved: unresolved.length,
    ambiguous: ambiguous.length,
    repairExamples: repairs.slice(0, 20),
    unresolvedExamples: unresolved.slice(0, 20),
    ambiguousExamples: ambiguous.slice(0, 20),
  };

  console.log(JSON.stringify(report, null, 2));

  if (dryRun || !repairs.length) return;

  for (const repair of repairs) {
    await adminPatchDocument("timesheets", repair.id, {
      ...repair.to,
      updatedAt: new Date().toISOString(),
      updatedBy: "repair:timesheet-employees",
    });
  }

  console.log(`Applied ${repairs.length} timesheet employee repair(s).`);
}

main().catch((error) => {
  console.error("Timesheet employee repair failed:", error);
  process.exitCode = 1;
});
