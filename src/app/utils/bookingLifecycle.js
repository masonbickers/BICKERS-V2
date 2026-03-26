const STATUS_ALIASES = {
  cancelled: "Cancelled",
  canceled: "Cancelled",
  complete: "Complete",
  completed: "Complete",
  confirmed: "Confirmed",
  deleted: "Deleted",
  dnh: "DNH",
  enquiry: "Enquiry",
  inquiry: "Enquiry",
  "first pencil": "First Pencil",
  "second pencil": "Second Pencil",
  lost: "Lost",
  postponed: "Postponed",
};

const LIFECYCLE_FIELD_BY_STATUS = {
  Enquiry: "enquiryAt",
  "First Pencil": "firstPencilAt",
  "Second Pencil": "secondPencilAt",
  Confirmed: "confirmedAt",
  Complete: "completedAt",
  Cancelled: "cancelledAt",
  DNH: "dnhAt",
  Lost: "lostAt",
  Postponed: "postponedAt",
  Deleted: "deletedAt",
};

const TERMINAL_STATUSES = new Set([
  "Cancelled",
  "Complete",
  "DNH",
  "Deleted",
  "Lost",
  "Postponed",
]);

const WON_STATUSES = new Set(["Complete"]);
const LOST_STATUSES = new Set(["Cancelled", "DNH", "Deleted", "Lost", "Postponed"]);
const TENTATIVE_STATUSES = new Set(["Enquiry", "First Pencil", "Second Pencil"]);

function toSafeDate(raw) {
  if (!raw) return null;
  if (typeof raw?.toDate === "function") return raw.toDate();
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDay(raw) {
  const date = toSafeDate(raw);
  if (!date) return null;
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function diffWholeDays(fromRaw, toRaw) {
  const from = toSafeDate(fromRaw);
  const to = toSafeDate(toRaw);
  if (!from || !to) return null;

  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((end - start) / 86400000);
}

export function canonicalBookingStatus(rawStatus) {
  const cleaned = String(rawStatus || "").trim();
  if (!cleaned) return "Unknown";

  const alias = STATUS_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;

  return cleaned;
}

export function bookingStatusCategory(rawStatus) {
  const status = canonicalBookingStatus(rawStatus);
  if (TENTATIVE_STATUSES.has(status)) return "tentative";
  if (status === "Confirmed") return "confirmed";
  if (WON_STATUSES.has(status)) return "won";
  if (LOST_STATUSES.has(status)) return "lost";
  return "active";
}

export function bookingOutcomeCategory(rawStatus) {
  const status = canonicalBookingStatus(rawStatus);
  if (WON_STATUSES.has(status)) return "won";
  if (LOST_STATUSES.has(status)) return "lost";
  return "open";
}

export function buildInitialStatusHistory(status, timestamp, actor = {}) {
  const canonicalStatus = canonicalBookingStatus(status);
  return [
    {
      from: null,
      to: canonicalStatus,
      changedAt: timestamp,
      changedBy: actor.email || "Unknown",
      changedByUid: actor.uid || "",
      reason: "Created",
    },
  ];
}

export function buildNextStatusHistory(existingHistory = [], fromStatus, toStatus, timestamp, actor = {}) {
  const prior = Array.isArray(existingHistory) ? existingHistory : [];
  const from = canonicalBookingStatus(fromStatus);
  const to = canonicalBookingStatus(toStatus);

  if (from === to) return prior;

  return [
    ...prior,
    {
      from,
      to,
      changedAt: timestamp,
      changedBy: actor.email || "Unknown",
      changedByUid: actor.uid || "",
      reason: "Status changed",
    },
  ];
}

export function buildInitialLifecycle(status, timestamp) {
  const canonicalStatus = canonicalBookingStatus(status);
  const lifecycle = {
    openedAt: timestamp,
    currentStatus: canonicalStatus,
    currentStatusSince: timestamp,
    lastStatusChangeAt: timestamp,
    closedAt: TERMINAL_STATUSES.has(canonicalStatus) ? timestamp : null,
    closedReason: TERMINAL_STATUSES.has(canonicalStatus) ? canonicalStatus : null,
    firstClosedAt: TERMINAL_STATUSES.has(canonicalStatus) ? timestamp : null,
  };

  const statusField = LIFECYCLE_FIELD_BY_STATUS[canonicalStatus];
  if (statusField) lifecycle[statusField] = timestamp;

  return lifecycle;
}

export function buildNextLifecycle(existingLifecycle = {}, fromStatus, toStatus, timestamp) {
  const next = { ...(existingLifecycle || {}) };
  const from = canonicalBookingStatus(fromStatus);
  const to = canonicalBookingStatus(toStatus);

  if (!next.openedAt) next.openedAt = timestamp;
  next.currentStatus = to;
  next.lastStatusChangeAt = timestamp;

  if (from !== to || !next.currentStatusSince) {
    next.currentStatusSince = timestamp;
  }

  const statusField = LIFECYCLE_FIELD_BY_STATUS[to];
  if (statusField && !next[statusField]) {
    next[statusField] = timestamp;
  }

  if (TERMINAL_STATUSES.has(to)) {
    if (!next.firstClosedAt) next.firstClosedAt = timestamp;
    next.closedAt = timestamp;
    next.closedReason = to;
  } else {
    next.closedAt = null;
    next.closedReason = null;
  }

  return next;
}

export function buildBookingDerivedFields({
  status,
  bookingDates = [],
  createdAt,
  employees = [],
  vehicles = [],
  equipment = [],
  additionalContacts = [],
  attachments = [],
  requiredCrewCount = 0,
  allocatedCrewCount = 0,
} = {}) {
  const canonicalStatus = canonicalBookingStatus(status);
  const statusCategory = bookingStatusCategory(canonicalStatus);
  const outcomeCategory = bookingOutcomeCategory(canonicalStatus);

  const bookingDayKeys = Array.from(
    new Set(
      (Array.isArray(bookingDates) ? bookingDates : [])
        .map((value) => toIsoDay(value))
        .filter(Boolean)
    )
  ).sort();

  const firstBookingDate = bookingDayKeys[0] || null;
  const lastBookingDate = bookingDayKeys[bookingDayKeys.length - 1] || null;
  const bookingLengthDays = bookingDayKeys.length;
  const leadTimeDays =
    createdAt && firstBookingDate ? diffWholeDays(createdAt, firstBookingDate) : null;

  const requiredCrew = Number(requiredCrewCount) || 0;
  const allocatedCrew = Number(allocatedCrewCount) || 0;

  return {
    analyticsVersion: 1,
    statusCanonical: canonicalStatus,
    statusCategory,
    outcomeCategory,
    isTentativeStatus: TENTATIVE_STATUSES.has(canonicalStatus),
    isTerminalStatus: TERMINAL_STATUSES.has(canonicalStatus),
    firstBookingDate,
    lastBookingDate,
    bookingLengthDays,
    bookingDayCount: bookingLengthDays,
    isMultiDayBooking: bookingLengthDays > 1,
    leadTimeDays,
    employeeCount: Array.isArray(employees) ? employees.length : 0,
    vehicleCount: Array.isArray(vehicles) ? vehicles.length : 0,
    equipmentCount: Array.isArray(equipment) ? equipment.length : 0,
    additionalContactCount: Array.isArray(additionalContacts) ? additionalContacts.length : 0,
    attachmentCount: Array.isArray(attachments) ? attachments.length : 0,
    hasAttachments: Array.isArray(attachments) && attachments.length > 0,
    requiredCrewCountDerived: requiredCrew,
    allocatedCrewCountDerived: allocatedCrew,
    crewAllocationRatio:
      requiredCrew > 0 ? Math.round((allocatedCrew / requiredCrew) * 1000) / 1000 : null,
  };
}
