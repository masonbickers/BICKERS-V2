function parseYMD(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  if (typeof value === "string") {
    const strictDate = parseYMD(value);
    if (strictDate) return strictDate;
  }

  const date = new Date(value);
  return Number.isNaN(+date) ? null : date;
}

export function holidayApprovalYear(holiday = {}) {
  const start = toDate(holiday.startDate);
  const end = toDate(holiday.endDate) || start;

  if (!start || !end || start.getFullYear() !== end.getFullYear()) return null;
  return start.getFullYear();
}

export function holidayApprovalStatus(holiday = {}) {
  return String(holiday.status || "").trim().toLowerCase();
}

export function isHolidayAwaitingApproval(holiday, year) {
  const status = holidayApprovalStatus(holiday);
  return (status === "requested" || !status) && holidayApprovalYear(holiday) === year;
}

export function isHolidayDeleteAwaitingApproval(holiday, year) {
  const status = holidayApprovalStatus(holiday);
  return (
    (status === "delete_requested" || status === "delete-requested") &&
    holidayApprovalYear(holiday) === year
  );
}

export function getHolidayApprovalQueueCounts(holidays, year) {
  return (Array.isArray(holidays) ? holidays : []).reduce(
    (counts, holiday) => {
      if (isHolidayAwaitingApproval(holiday, year)) counts.requests += 1;
      if (isHolidayDeleteAwaitingApproval(holiday, year)) counts.deletes += 1;
      return counts;
    },
    { requests: 0, deletes: 0 }
  );
}
