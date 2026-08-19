const validNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function getHolidayCarryOverWindow(year, now = new Date()) {
  const leaveYear = Number(year);
  const current = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isInteger(leaveYear) || Number.isNaN(current.getTime())) {
    return { active: false, deadlinePassed: false, start: null, deadline: null };
  }

  const start = new Date(leaveYear, 0, 1);
  const deadline = new Date(leaveYear, 3, 1);
  const timestamp = current.getTime();

  return {
    active: timestamp >= start.getTime() && timestamp < deadline.getTime(),
    deadlinePassed: timestamp >= deadline.getTime(),
    start,
    deadline,
  };
}

export function resolveHolidayCarryOver({ carried = 0, usedByDeadline = 0, year, now = new Date() } = {}) {
  const granted = validNumber(carried);
  const used = Math.min(granted, validNumber(usedByDeadline));
  const window = getHolidayCarryOverWindow(year, now);
  const effective = window.deadlinePassed ? used : granted;

  return {
    ...window,
    granted,
    used,
    effective,
    expired: window.deadlinePassed ? Math.max(0, Number((granted - used).toFixed(2))) : 0,
  };
}
