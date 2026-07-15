const clean = (value) => String(value ?? "").trim().toLowerCase();

const cleanCode = (value) => {
  const text = clean(value);
  return /^\d+$/.test(text) ? text.replace(/^0+/, "") || "0" : text;
};

const unique = (values, normalise = clean) =>
  Array.from(new Set(values.map(normalise).filter(Boolean)));

const nestedValues = (value, keys) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => nestedValues(item, keys));
  if (typeof value !== "object") return [];
  return keys.map((key) => value[key]);
};

const comparableMatch = (timesheetValues, holidayValues) => {
  if (!timesheetValues.length || !holidayValues.length) return null;
  return timesheetValues.some((value) => holidayValues.includes(value));
};

export function isApprovedHolidayForTimesheet(holiday = {}) {
  if (holiday.deleted === true || holiday.isDeleted === true) return false;
  const status = clean(holiday.status);
  if (status) return status === "approved" || status === "accepted";
  return holiday.approved === true;
}

export function holidayMatchesTimesheetEmployee(timesheet = {}, holiday = {}) {
  const holidayEmployee = holiday.employee;
  const groups = [
    [
      unique(
        [timesheet.employeeCode, timesheet.userCode, timesheet.code, timesheet.staffCode],
        cleanCode
      ),
      unique(
        [
          holiday.employeeCode,
          holiday.userCode,
          holiday.code,
          holiday.staffCode,
          ...nestedValues(holidayEmployee, ["employeeCode", "userCode", "code", "staffCode"]),
        ],
        cleanCode
      ),
    ],
    [
      unique([timesheet.employeeId, timesheet.userId, timesheet.uid]),
      unique([
        holiday.employeeId,
        holiday.userId,
        holiday.uid,
        ...nestedValues(holidayEmployee, ["employeeId", "userId", "uid", "id"]),
      ]),
    ],
    [
      unique([timesheet.employeeEmail, timesheet.email, timesheet.userEmail]),
      unique([
        holiday.employeeEmail,
        holiday.email,
        holiday.userEmail,
        ...nestedValues(holidayEmployee, ["employeeEmail", "email", "userEmail"]),
      ]),
    ],
    [
      unique([timesheet.employeeName, timesheet.name, timesheet.fullName]),
      unique([
        typeof holidayEmployee === "string" ? holidayEmployee : "",
        holiday.employeeName,
        holiday.name,
        holiday.fullName,
        ...nestedValues(holidayEmployee, ["employeeName", "name", "fullName", "label"]),
      ]),
    ],
  ];

  for (const [timesheetValues, holidayValues] of groups) {
    const match = comparableMatch(timesheetValues, holidayValues);
    if (match !== null) return match;
  }

  return false;
}
