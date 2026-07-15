import {
  adminListDocuments,
  adminPatchDocument,
} from "../src/app/api/_firebaseAdminRest.js";
import {
  getTimesheetWorkflowStatus,
  normalizeTimesheetDays,
  timesheetDocumentId,
} from "../src/app/utils/timesheetDetail.js";

const clean = (value) => String(value ?? "").trim().toLowerCase();

const values = (record, keys) =>
  Array.from(new Set(keys.map((key) => clean(record?.[key])).filter(Boolean)));

function exactEmployeeMatch(timesheet, employees) {
  const groups = [
    [["employeeId", "userId", "uid"], ["id", "employeeId", "userId", "uid"]],
    [["employeeCode", "userCode", "code", "staffCode"], ["userCode", "employeeCode", "code", "staffCode"]],
    [["employeeEmail", "email", "userEmail"], ["email", "workEmail", "contactEmail"]],
    [["employeeName", "name", "fullName"], ["name", "fullName", "employeeName"]],
  ];

  for (const [timesheetKeys, employeeKeys] of groups) {
    const left = values(timesheet, timesheetKeys);
    if (!left.length) continue;
    const matches = employees.filter((employee) =>
      values(employee, employeeKeys).some((value) => left.includes(value))
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
  }
  return null;
}

export function normalizeLegacyTimesheet(timesheet, employee = null) {
  const status = getTimesheetWorkflowStatus(timesheet);
  const employeeCode = String(
    timesheet.employeeCode || employee?.userCode || employee?.employeeCode || employee?.code || ""
  ).trim();
  const weekStart = String(timesheet.weekStart || "").trim().slice(0, 10);

  return {
    ...timesheet,
    schemaVersion: 1,
    employeeId: String(timesheet.employeeId || employee?.id || employee?.employeeId || "").trim(),
    employeeCode,
    employeeName: String(timesheet.employeeName || employee?.name || employee?.fullName || "").trim(),
    employeeEmail: String(
      timesheet.employeeEmail || employee?.email || employee?.workEmail || ""
    ).trim().toLowerCase(),
    weekStart,
    days: normalizeTimesheetDays(timesheet.days || {}),
    status,
    submitted: status === "submitted" || status === "approved",
    approved: status === "approved",
  };
}

export function planTimesheetMigration(timesheetDocs, employeeDocs) {
  const employees = employeeDocs.map(({ id, data }) => ({ id, ...(data || {}) }));
  const existingIds = new Set(timesheetDocs.map(({ id }) => id));

  return timesheetDocs.map(({ id, data }) => {
    const source = { id, ...(data || {}) };
    const employee = exactEmployeeMatch(source, employees);
    const normalized = normalizeLegacyTimesheet(source, employee);
    delete normalized.id;
    const targetId = timesheetDocumentId(normalized.employeeCode, normalized.weekStart);

    if (!targetId) return { action: "manual-review", id, reason: "missing employee code or Monday", normalized };
    if (id === targetId) return { action: "normalize", id, targetId, normalized };
    if (existingIds.has(targetId)) {
      return { action: "collision", id, targetId, reason: "canonical document already exists", normalized };
    }
    return { action: "copy", id, targetId, normalized };
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const [timesheets, employees] = await Promise.all([
    adminListDocuments("timesheets"),
    adminListDocuments("employees"),
  ]);
  const plan = planTimesheetMigration(timesheets, employees);

  if (apply) {
    for (const item of plan) {
      if (item.action === "normalize") {
        await adminPatchDocument("timesheets", item.id, item.normalized);
      } else if (item.action === "copy") {
        await adminPatchDocument("timesheets", item.targetId, item.normalized);
        await adminPatchDocument("timesheets", item.id, {
          migratedTo: item.targetId,
          migratedAt: new Date().toISOString(),
        });
      }
    }
  }

  const summary = plan.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", summary, plan }, null, 2));
}

if (process.argv[1]?.endsWith("migrate-timesheet-contract.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
