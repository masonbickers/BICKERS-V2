const normalise = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const INACTIVE_EMPLOYMENT_STATUSES = new Set([
  "archived",
  "deleted",
  "disabled",
  "ended",
  "former",
  "inactive",
  "left",
  "leaver",
  "removed",
  "terminated",
]);

const HIDDEN_HOLIDAY_USAGE_EMPLOYEE_NAMES = new Set(["paul bickers"]);

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
};

export function employeeDisplayName(employee = {}) {
  return String(
    employee.name ||
      employee.fullName ||
      employee.employeeName ||
      employee.displayName ||
      employee.employee ||
      ""
  ).trim();
}

export function shouldShowInHolidayUsageOverview(employeeOrName = {}) {
  const name =
    typeof employeeOrName === "string"
      ? employeeOrName
      : employeeDisplayName(employeeOrName);
  return !HIDDEN_HOLIDAY_USAGE_EMPLOYEE_NAMES.has(normalise(name));
}

export function isCurrentEmployeeRecord(employee = {}) {
  if (!employee || typeof employee !== "object") return false;

  if (
    employee.deleted === true ||
    employee.isDeleted === true ||
    employee.removed === true ||
    employee.isRemoved === true ||
    employee.archived === true ||
    employee.isArchived === true ||
    employee.active === false
  ) {
    return false;
  }

  const role = normalise(employee.role);
  if (role === "archived" || role === "deleted" || role === "removed") return false;

  const lifecycleStatus = normalise(
    employee.employmentStatus || employee.lifecycleStatus || employee.employeeStatus
  );
  return !INACTIVE_EMPLOYMENT_STATUSES.has(lifecycleStatus);
}

export function employeeIdentityValues(employee = {}) {
  return [
    employee.id,
    employee.employeeId,
    employee.employeeCode,
    employee.userCode,
    employee.code,
    employee.staffCode,
    employee.authUid,
    employee.uid,
    employee.userId,
    employee.email,
    employee.workEmail,
    employee.personalEmail,
    employeeDisplayName(employee),
    ...asArray(employee.aliases),
    ...asArray(employee.nameAliases),
    ...asArray(employee.previousNames),
  ]
    .map(normalise)
    .filter(Boolean);
}

function recordIdentityValues(record = {}) {
  if (typeof record !== "object" || record === null) return [normalise(record)].filter(Boolean);

  const nestedEmployee =
    record.employee && typeof record.employee === "object" ? record.employee : {};

  return [
    record.employeeId,
    record.employeeCode,
    record.userCode,
    record.staffCode,
    record.employeeEmail,
    record.employeeName,
    record.displayName,
    typeof record.employee === "string" ? record.employee : "",
    ...employeeIdentityValues(nestedEmployee),
  ]
    .map(normalise)
    .filter(Boolean);
}

export function createCurrentEmployeeDirectory(employees = []) {
  const currentEmployees = (Array.isArray(employees) ? employees : []).filter(isCurrentEmployeeRecord);
  const byIdentity = new Map();

  currentEmployees.forEach((employee) => {
    employeeIdentityValues(employee).forEach((identity) => {
      if (!byIdentity.has(identity)) byIdentity.set(identity, employee);
    });
  });

  const resolve = (recordOrIdentity) => {
    const identities = recordIdentityValues(recordOrIdentity);
    for (const identity of identities) {
      const employee = byIdentity.get(identity);
      if (employee) return employee;
    }
    return null;
  };

  return {
    employees: currentEmployees,
    matches: (recordOrIdentity) => Boolean(resolve(recordOrIdentity)),
    resolve,
  };
}
