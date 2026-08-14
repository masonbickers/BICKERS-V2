export const ACTIVITY_POLICY_VERSION = "2026-08-11-v1";
export const ACTIVITY_BUCKET_MINUTES = 5;
export const DEFAULT_IDLE_MINUTES = 10;
export const DEFAULT_FLAG_MINUTES = 15;
export const DEFAULT_ACTIVITY_TIMEZONE = "Europe/London";

export const WEEK_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DEFAULT_WORK_SCHEDULE = Object.freeze({
  timezone: DEFAULT_ACTIVITY_TIMEZONE,
  days: {
    monday: { working: true, start: "08:00", end: "16:30" },
    tuesday: { working: true, start: "08:00", end: "16:30" },
    wednesday: { working: true, start: "08:00", end: "16:30" },
    thursday: { working: true, start: "08:00", end: "16:30" },
    friday: { working: true, start: "08:00", end: "16:30" },
    saturday: { working: false, start: "08:00", end: "16:30" },
    sunday: { working: false, start: "08:00", end: "16:30" },
  },
});

const DAY_LOOKUP = {
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
  Sun: "sunday",
};

const cleanTime = (value, fallback) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : fallback;

export function normalizeWorkSchedule(value = {}) {
  const sourceDays = value?.days && typeof value.days === "object" ? value.days : {};
  return {
    timezone: String(value?.timezone || DEFAULT_ACTIVITY_TIMEZONE),
    days: Object.fromEntries(
      WEEK_DAYS.map((day) => {
        const fallback = DEFAULT_WORK_SCHEDULE.days[day];
        const source = sourceDays[day] || {};
        return [day, {
          working: source.working == null ? fallback.working : source.working === true,
          start: cleanTime(source.start, fallback.start),
          end: cleanTime(source.end, fallback.end),
        }];
      })
    ),
  };
}

export function normalizeActivitySettings(value = {}) {
  return {
    enabled: value?.enabled !== false,
    policyVersion: String(value?.policyVersion || ACTIVITY_POLICY_VERSION),
    idleMinutes: Math.min(30, Math.max(5, Number(value?.idleMinutes) || DEFAULT_IDLE_MINUTES)),
    flagMinutes: Math.min(120, Math.max(5, Number(value?.flagMinutes) || DEFAULT_FLAG_MINUTES)),
    fallbackSchedule: normalizeWorkSchedule(value?.fallbackSchedule || {}),
  };
}

const timeMinutes = (value) => {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

export function zonedDateParts(value, timezone = DEFAULT_ACTIVITY_TIMEZONE) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    day: DAY_LOOKUP[parts.weekday] || "monday",
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function isInsideWorkSchedule(value, scheduleValue) {
  const schedule = normalizeWorkSchedule(scheduleValue);
  const local = zonedDateParts(value, schedule.timezone);
  const dayIndex = WEEK_DAYS.indexOf(local.day);
  const today = schedule.days[local.day];
  const previousDay = WEEK_DAYS[(dayIndex + 6) % 7];
  const previous = schedule.days[previousDay];

  if (today.working) {
    const start = timeMinutes(today.start);
    const end = timeMinutes(today.end);
    if (end > start && local.minutes >= start && local.minutes < end) return true;
    if (end <= start && local.minutes >= start) return true;
  }

  if (previous.working) {
    const start = timeMinutes(previous.start);
    const end = timeMinutes(previous.end);
    if (end <= start && local.minutes < end) return true;
  }
  return false;
}

export function describeScheduleForDate(value, scheduleValue) {
  const schedule = normalizeWorkSchedule(scheduleValue);
  const local = zonedDateParts(value, schedule.timezone);
  const day = schedule.days[local.day];
  return day.working ? `${day.start}-${day.end}` : "Non-working day";
}

export function activityCategoryForPath(pathname = "") {
  const path = String(pathname).toLowerCase();
  if (/^\/(job|booking|review-queue|completed-quotes|quote)/.test(path)) return "Jobs & quotes";
  if (path.startsWith("/enquiry")) return "Enquiries";
  if (/^\/(maintenance|workshop|mot-|vehicle|service|defects)/.test(path)) return "Fleet & maintenance";
  if (/^\/(timesheet|hr|employee|sick-leave|shift-change)/.test(path)) return "People & timesheets";
  if (/^\/(finance|receipt|invoiced|paid)/.test(path)) return "Finance";
  if (/^\/(admin|platform-admin|settings)/.test(path)) return "Administration";
  if (path.startsWith("/h-and-s") || path.startsWith("/hgv-compliance")) return "Compliance";
  return "General";
}

export function workspaceForPath(pathname = "") {
  return /^\/(maintenance|workshop|mot-|vehicle|service|defects)/.test(String(pathname).toLowerCase())
    ? "service"
    : "user";
}

export function buildActivitySessions(buckets = [], { gapMinutes = 10 } = {}) {
  const ordered = [...buckets]
    .filter((row) => row?.uid && row?.bucketStart)
    .sort((a, b) => new Date(a.bucketStart) - new Date(b.bucketStart));
  const sessions = [];
  const latestByUser = new Map();
  for (const bucket of ordered) {
    const at = new Date(bucket.bucketStart);
    const previous = latestByUser.get(bucket.uid);
    const sameUser = !!previous;
    const gap = previous ? (at.getTime() - new Date(previous.endAt).getTime()) / 60000 : Infinity;
    if (!previous || !sameUser || gap > gapMinutes) {
      const nextSession = {
        uid: bucket.uid,
        employeeId: bucket.employeeId || "",
        companyId: bucket.companyId || "",
        email: bucket.email || "",
        startAt: bucket.bucketStart,
        endAt: bucket.bucketEnd || bucket.bucketStart,
        activeSeconds: Number(bucket.activeSeconds) || 0,
        inHoursSeconds: bucket.inHours ? Number(bucket.activeSeconds) || 0 : 0,
        outOfHoursSeconds: bucket.inHours ? 0 : Number(bucket.activeSeconds) || 0,
        categories: { [bucket.category || "General"]: Number(bucket.activeSeconds) || 0 },
        workspaces: { [bucket.workspace || "user"]: Number(bucket.activeSeconds) || 0 },
        actionCount: Number(bucket.actionCount) || 0,
        bucketIds: [bucket.id].filter(Boolean),
        dateKey: bucket.dateKey || "",
        scheduleLabel: bucket.scheduleLabel || "",
        scheduleSource: bucket.scheduleSource || "company",
      };
      sessions.push(nextSession);
      latestByUser.set(bucket.uid, nextSession);
      continue;
    }
    previous.endAt = bucket.bucketEnd || bucket.bucketStart;
    previous.activeSeconds += Number(bucket.activeSeconds) || 0;
    if (bucket.inHours) previous.inHoursSeconds += Number(bucket.activeSeconds) || 0;
    else previous.outOfHoursSeconds += Number(bucket.activeSeconds) || 0;
    previous.categories[bucket.category || "General"] =
      (previous.categories[bucket.category || "General"] || 0) + (Number(bucket.activeSeconds) || 0);
    previous.workspaces[bucket.workspace || "user"] =
      (previous.workspaces[bucket.workspace || "user"] || 0) + (Number(bucket.activeSeconds) || 0);
    previous.actionCount += Number(bucket.actionCount) || 0;
    if (bucket.id) previous.bucketIds.push(bucket.id);
  }
  return sessions.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}
