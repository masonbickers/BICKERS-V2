const clean = (value) => String(value ?? "").trim().toLowerCase();

const uniqueValues = (values) =>
  Array.from(new Set(values.map(clean).filter(Boolean)));

const intersects = (left, right) => left.some((value) => right.includes(value));

const comparableIdentityMatch = (left, right) => {
  if (!left.length || !right.length) return null;
  return intersects(left, right);
};

export function timesheetDetailPath(id) {
  return `/timesheet-id/${encodeURIComponent(String(id ?? "").trim())}`;
}

export function timesheetDocumentId(employeeCode, weekStart) {
  const code = String(employeeCode ?? "").trim();
  const week = String(weekStart ?? "").trim().slice(0, 10);
  if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return "";
  return `${code}_${week}`;
}

export function parseTimesheetDocumentId(value) {
  const match = String(value ?? "").trim().match(/^(.*)_(\d{4}-\d{2}-\d{2})$/);
  if (!match || !match[1]) return null;
  return { employeeCode: match[1], weekStart: match[2] };
}

export const TIMESHEET_DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function normalizeTimesheetDays(days = {}) {
  return Object.fromEntries(
    TIMESHEET_DAY_NAMES.map((day) => {
      const lower = day.toLowerCase();
      return [lower, days?.[lower] ?? days?.[day] ?? null];
    })
  );
}

export function getTimesheetWorkflowStatus(timesheet = {}) {
  if (
    timesheet.approved === true ||
    String(timesheet.status || "").trim().toLowerCase() === "approved" ||
    timesheet.approvedAt
  ) {
    return "approved";
  }
  if (
    timesheet.submitted === true ||
    String(timesheet.status || "").trim().toLowerCase() === "submitted" ||
    timesheet.submittedAt
  ) {
    return "submitted";
  }
  return "draft";
}

export function isApprovedHolidayRecord(holiday = {}) {
  if (holiday.deleted === true || holiday.isDeleted === true) return false;

  const status = clean(holiday.status);
  if (status) return status === "approved" || status === "accepted";
  return holiday.approved === true;
}

export function isPendingHolidayRecord(holiday = {}) {
  if (holiday.deleted === true || holiday.isDeleted === true) return false;

  const status = clean(holiday.status);
  if (status) return status === "requested";
  return holiday.approved !== true;
}

export function holidayMatchesTimesheetEmployee(timesheet = {}, holiday = {}) {
  const groups = [
    [
      uniqueValues([timesheet.employeeId, timesheet.userId, timesheet.uid]),
      uniqueValues([holiday.employeeId, holiday.userId, holiday.uid]),
    ],
    [
      uniqueValues([timesheet.employeeCode, timesheet.userCode, timesheet.code, timesheet.staffCode]),
      uniqueValues([holiday.employeeCode, holiday.userCode, holiday.code, holiday.staffCode]),
    ],
    [
      uniqueValues([timesheet.employeeEmail, timesheet.email, timesheet.userEmail]),
      uniqueValues([holiday.employeeEmail, holiday.email, holiday.userEmail]),
    ],
    [
      uniqueValues([timesheet.employeeName, timesheet.name, timesheet.fullName]),
      uniqueValues([holiday.employeeName, holiday.employee, holiday.name, holiday.fullName]),
    ],
  ];

  for (const [timesheetValues, holidayValues] of groups) {
    const result = comparableIdentityMatch(timesheetValues, holidayValues);
    if (result !== null) return result;
  }

  return false;
}

export function parseTimesheetDate(raw) {
  if (!raw) return null;
  if (typeof raw?.toDate === "function") return raw.toDate();
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "object" && typeof raw.seconds === "number") {
    return new Date(raw.seconds * 1000);
  }
  if (typeof raw === "string") {
    const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function toDateKey(raw) {
  const date = parseTimesheetDate(raw);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const booleanish = (value) => {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value === 1;
  const text = clean(value);
  if (["true", "1", "yes", "y", "on"].includes(text)) return true;
  if (["false", "0", "no", "off", "n"].includes(text)) return false;
  return null;
};

const normalizedPeriod = (value, fallback = "") => {
  const period = String(value || "").trim().toUpperCase();
  return period === "AM" || period === "PM" ? period : fallback;
};

export function getHolidayDayMeta(holiday = {}, ymd = "") {
  const dateKey = String(ymd || "").slice(0, 10);
  if (!dateKey) return { applies: false, halfDay: false, period: "" };

  const startKey =
    toDateKey(holiday.startDate || holiday.from || holiday.fromDate || holiday.startDateISO) ||
    String(holiday.holidayDateKeys?.[0] || holiday.date || holiday.dateISO || "").slice(0, 10);
  const endKeys = Array.isArray(holiday.holidayDateKeys) ? holiday.holidayDateKeys : [];
  const endKey =
    toDateKey(holiday.endDate || holiday.to || holiday.toDate || holiday.endDateISO) ||
    String(endKeys[endKeys.length - 1] || startKey).slice(0, 10);

  const applies = Boolean(startKey && endKey && dateKey >= startKey && dateKey <= endKey);
  if (!applies) return { applies: false, halfDay: false, period: "" };

  const singleDay = startKey === endKey;
  if (dateKey === startKey && booleanish(holiday.startHalfDay) === true) {
    return {
      applies: true,
      halfDay: true,
      period: normalizedPeriod(holiday.startAMPM || holiday.startAmpm, "AM"),
    };
  }

  if (!singleDay && dateKey === endKey && booleanish(holiday.endHalfDay) === true) {
    return {
      applies: true,
      halfDay: true,
      period: normalizedPeriod(holiday.endAMPM || holiday.endAmpm, "PM"),
    };
  }

  const legacyPeriod = normalizedPeriod(
    holiday.halfDayPeriod || holiday.halfDayType || holiday.startAMPM || holiday.startAmpm
  );
  const legacyHalfDay = singleDay && (
    legacyPeriod || String(holiday.duration || "").toLowerCase().includes("half")
  );

  return {
    applies: true,
    halfDay: Boolean(legacyHalfDay),
    period: legacyHalfDay ? legacyPeriod : "",
  };
}

export function combineTimesheetDayHours({
  workedHours = 0,
  holidayHours = 0,
  holidayKind = "none",
  mode = "missing",
} = {}) {
  const worked = Math.max(0, Number(workedHours) || 0);
  const holiday = Math.max(0, Number(holidayHours) || 0);

  if (holidayKind === "half") return worked + holiday;
  if (holidayKind === "full") return holiday;
  if (mode === "off" || mode === "unpaid") return 0;
  return worked;
}

export function getWeekEndingDate(weekStart) {
  const date = parseTimesheetDate(weekStart);
  if (!date) return null;
  const result = new Date(date);
  result.setDate(result.getDate() + 6);
  return result;
}
