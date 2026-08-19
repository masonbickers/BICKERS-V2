const DEFAULT_TIME_ZONE = "Europe/London";

function clean(value) {
  return String(value || "").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
}

function zonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isoFromUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

export function getPreviousTimesheetWeekStart(
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  const parts = zonedDateParts(now, timeZone);
  const localDate = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  );
  const weekday = localDate.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday - 7);
  return isoFromUtcDate(localDate);
}

export function isTimesheetSubmitted(timesheet) {
  if (!timesheet) return false;
  const status = cleanLower(timesheet.status);
  return (
    timesheet.submitted === true ||
    timesheet.approved === true ||
    Boolean(timesheet.submittedAt) ||
    Boolean(timesheet.approvedAt) ||
    status === "submitted" ||
    status === "approved" ||
    status.startsWith("approved")
  );
}

export function getEmployeeTimesheetCode(employee = {}) {
  return clean(
    employee.userCode ||
      employee.employeeCode ||
      employee.code ||
      employee.staffCode ||
      employee.timesheetCode
  );
}

export function isTimesheetReminderEmployee(employee = {}) {
  const role = cleanLower(employee.role);
  const employmentType = cleanLower(
    employee.employmentType || employee.contractType || employee.employeeType
  );
  const jobTitle = Array.isArray(employee.jobTitle)
    ? employee.jobTitle.join(" ").toLowerCase()
    : cleanLower(employee.jobTitle);
  const name = [employee.name, employee.fullName, employee.employeeName]
    .map(cleanLower)
    .filter(Boolean)
    .join(" ");
  const appAccess =
    employee.appAccess && typeof employee.appAccess === "object"
      ? employee.appAccess
      : {};

  if (
    employee.deleted === true ||
    employee.isDeleted === true ||
    employee.archived === true ||
    employee.isArchived === true ||
    employee.active === false ||
    employee.isEnabled === false ||
    employee.appDisabled === true
  ) {
    return false;
  }
  if (employee.isService === true && appAccess.user !== true) return false;
  if (
    employee.preview === true ||
    employee.isPreview === true ||
    employee.test === true ||
    employee.isTest === true
  ) {
    return false;
  }
  if (["service", "freelancer", "freelance"].includes(role)) return false;
  if (employmentType.includes("freelance") || jobTitle.includes("freelance")) return false;
  if (/\b(preview lane|test employee|demo employee)\b/.test(name)) return false;
  return Boolean(getEmployeeTimesheetCode(employee));
}

function userUid(user = {}) {
  return clean(user.uid || user.id);
}

export function resolveEmployeeUserUid(employee = {}, users = []) {
  const directUid = clean(employee.authUid || employee.uid || employee.userId);
  const employeeId = clean(employee.id || employee.employeeId);
  const employeeEmails = new Set(
    [employee.email, employee.contactEmail, employee.workEmail]
      .map(cleanLower)
      .filter(Boolean)
  );

  if (directUid) {
    const directUser = users.find((user) => userUid(user) === directUid);
    if (directUser) return userUid(directUser);
  }

  if (employeeId) {
    const linkedUser = users.find(
      (user) => clean(user.employeeId) === employeeId
    );
    if (linkedUser) return userUid(linkedUser);
  }

  if (employeeEmails.size) {
    const emailUser = users.find((user) => employeeEmails.has(cleanLower(user.email)));
    if (emailUser) return userUid(emailUser);
  }

  return "";
}

