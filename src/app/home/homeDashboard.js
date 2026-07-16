const DAY_MS = 24 * 60 * 60 * 1000;

export function toDashboardDate(value) {
  if (!value) return null;
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDashboardDay(value) {
  const date = toDashboardDate(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
}

export function normalizeVehicleKey(vehicle) {
  const value = vehicle && typeof vehicle === "object"
    ? vehicle.id || vehicle.registration || vehicle.reg || vehicle.name
    : vehicle;
  return String(value || "").trim().toLowerCase();
}

export function buildWindowCounts(events, referenceDate, windowDays) {
  const start = toDashboardDate(referenceDate);
  const end = start ? new Date(start.getTime() + Number(windowDays || 0) * DAY_MS) : null;
  const counts = { total: 0, enquiry: 0, "first pencil": 0, "second pencil": 0, confirmed: 0 };
  if (!start || !end) return counts;
  events.forEach((event) => {
    const eventStart = toDashboardDate(event?.start);
    if (!eventStart || eventStart < start || eventStart > end) return;
    const status = String(event?.status || "").trim().toLowerCase();
    counts.total += 1;
    if (Object.prototype.hasOwnProperty.call(counts, status) && status !== "total") counts[status] += 1;
  });
  return counts;
}

export function buildFollowUpQueue(events, referenceDate, hours = 72) {
  const start = toDashboardDate(referenceDate);
  if (!start) return [];
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  return events.filter((event) => {
    const eventStart = toDashboardDate(event?.start);
    return String(event?.status || "").toLowerCase() === "first pencil"
      && eventStart && eventStart >= start && eventStart <= end;
  }).sort((a, b) => toDashboardDate(a.start) - toDashboardDate(b.start));
}

export function buildPreparationQueue(events, bookings, referenceDate, vehicleLabel, days = 2) {
  const start = toDashboardDate(referenceDate);
  if (!start) return [];
  const end = new Date(start.getTime() + days * DAY_MS);
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));
  return events.filter((event) => {
    const eventStart = toDashboardDate(event?.start);
    return eventStart && eventStart >= start && eventStart <= end;
  }).sort((a, b) => toDashboardDate(a.start) - toDashboardDate(b.start)).map((event) => ({
    id: event.id,
    jobNumber: event.jobNumber,
    vehicles: (event.vehicles || []).map((vehicle) => vehicleLabel(vehicle)),
    equipment: (event.equipment || []).join(", "),
    notes: bookingById.get(event.id)?.notes || "-",
    start: toDashboardDate(event.start),
  }));
}

export function buildSchedulingConflicts(events) {
  const firmByVehicle = new Map();
  const conflicts = [];
  const seen = new Set();
  events.filter((event) => ["confirmed", "first pencil"].includes(String(event?.status || "").toLowerCase())).forEach((event) => {
    (event.vehicles || []).forEach((vehicle) => {
      const key = normalizeVehicleKey(vehicle);
      if (!key) return;
      if (!firmByVehicle.has(key)) firmByVehicle.set(key, []);
      firmByVehicle.get(key).push(event);
    });
  });
  events.filter((event) => String(event?.status || "").toLowerCase() === "second pencil").forEach((second) => {
    const secondStart = toDashboardDate(second.start);
    const secondEnd = toDashboardDate(second.end) || secondStart;
    if (!secondStart || !secondEnd) return;
    (second.vehicles || []).forEach((vehicle) => {
      const vehicleKey = normalizeVehicleKey(vehicle);
      if (!vehicleKey) return;
      (firmByVehicle.get(vehicleKey) || []).forEach((firm) => {
        const firmStart = toDashboardDate(firm.start);
        const firmEnd = toDashboardDate(firm.end) || firmStart;
        if (!firmStart || !firmEnd || secondStart > firmEnd || firmStart > secondEnd) return;
        const key = `${vehicleKey}__${second.id}__${firm.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        conflicts.push({ vehicle, second, firm });
      });
    });
  });
  return conflicts.sort((a, b) => toDashboardDate(a.second.start) - toDashboardDate(b.second.start));
}

export function buildFleetBuckets(events, referenceDate, dueDays = 21) {
  const today = startOfDashboardDay(referenceDate);
  const dueEnd = today ? new Date(today.getTime() + dueDays * DAY_MS) : null;
  const buckets = { overdueMOT: [], overdueService: [], motDueSoon: [], serviceDueSoon: [] };
  if (!today || !dueEnd) return buckets;
  events.forEach((event) => {
    if (event?.booked || !["MOT", "SERVICE"].includes(event?.kind)) return;
    const dueDate = startOfDashboardDay(event.dueDate);
    if (!dueDate) return;
    if (dueDate < today) buckets[event.kind === "MOT" ? "overdueMOT" : "overdueService"].push(event);
    else if (dueDate <= dueEnd) buckets[event.kind === "MOT" ? "motDueSoon" : "serviceDueSoon"].push(event);
  });
  Object.values(buckets).forEach((items) => items.sort((a, b) => startOfDashboardDay(a.dueDate) - startOfDashboardDay(b.dueDate)));
  return buckets;
}

const ATTENTION_SEVERITY = { critical: 0, urgent: 1, upcoming: 2 };

function readableVehicle(vehicle) {
  if (vehicle && typeof vehicle === "object") {
    return String(vehicle.name || vehicle.registration || vehicle.reg || vehicle.id || "Vehicle").trim();
  }
  return String(vehicle || "Vehicle").trim() || "Vehicle";
}

function attentionDate(value) {
  const date = toDashboardDate(value);
  return date ? date.toISOString() : null;
}

export function buildOperationalSummary({
  events = [],
  referenceDate,
  windowDays = 30,
  followUps = [],
  preparation = [],
  conflicts = [],
  overdueMOT = [],
  overdueService = [],
  availability = {},
} = {}) {
  const bookingAvailable = availability.bookings !== false;
  const fleetAvailable = availability.fleet !== false;
  const upcoming = buildWindowCounts(events, referenceDate, windowDays).total;

  return [
    {
      key: "upcoming",
      label: "Upcoming jobs",
      value: bookingAvailable ? upcoming : null,
      period: `Next ${windowDays} days`,
      tone: "neutral",
      available: bookingAvailable,
      actionTarget: { kind: "route", href: "/dashboard?view=month" },
    },
    {
      key: "follow-up",
      label: "Pencils to follow up",
      value: bookingAvailable ? followUps.length : null,
      period: "Starting within 72 hours",
      tone: followUps.length ? "urgent" : "positive",
      available: bookingAvailable,
      actionTarget: { kind: "attention", type: "first-pencil" },
    },
    {
      key: "preparation",
      label: "Preparation due",
      value: bookingAvailable ? preparation.length : null,
      period: "Starting within 2 days",
      tone: preparation.length ? "upcoming" : "positive",
      available: bookingAvailable,
      actionTarget: { kind: "route", href: "/preplist-dashboard" },
    },
    {
      key: "conflicts",
      label: "Scheduling conflicts",
      value: bookingAvailable ? conflicts.length : null,
      period: "All future overlaps",
      tone: conflicts.length ? "critical" : "positive",
      available: bookingAvailable,
      actionTarget: { kind: "attention", type: "scheduling-conflict" },
    },
    {
      key: "fleet",
      label: "Fleet overdue",
      value: fleetAvailable ? overdueMOT.length + overdueService.length : null,
      period: "MOT and service today",
      tone: overdueMOT.length || overdueService.length ? "critical" : "positive",
      available: fleetAvailable,
      actionTarget: { kind: "route", href: "/vehicle-home" },
    },
  ];
}

export function buildAttentionQueue({
  conflicts = [],
  followUps = [],
  preparation = [],
  overdueMOT = [],
  overdueService = [],
  vehicleLabel = readableVehicle,
} = {}) {
  const items = [];

  conflicts.forEach((conflict) => {
    const vehicle = vehicleLabel(conflict.vehicle);
    const secondId = String(conflict?.second?.id || "").trim();
    const firmId = String(conflict?.firm?.id || "").trim();
    if (!secondId || !firmId) return;
    items.push({
      id: `conflict:${normalizeVehicleKey(conflict.vehicle)}:${secondId}:${firmId}`,
      type: "scheduling-conflict",
      severity: "critical",
      title: `${vehicle} has an allocation conflict`,
      detail: `${conflict.second.jobNumber || "Second pencil"} overlaps ${conflict.firm.jobNumber || "firm booking"}`,
      dueAt: attentionDate(conflict.second.start),
      actionTarget: { kind: "booking", id: secondId },
    });
  });

  const addFleetItems = (events, kind, href) => {
    events.forEach((event) => {
      const sourceId = String(event?.vehicleId || event?.id || event?.sourceId || "").trim();
      if (!sourceId) return;
      const label = String(event.vehicleLabel || event.name || event.registration || event.title || "Vehicle").trim();
      items.push({
        id: `${kind}:${sourceId}`,
        type: kind,
        severity: "critical",
        title: `${label} ${kind === "mot-overdue" ? "MOT" : "service"} is overdue`,
        detail: "No compliant appointment is currently booked",
        dueAt: attentionDate(event.dueDate),
        actionTarget: { kind: "route", href },
      });
    });
  };
  addFleetItems(overdueMOT, "mot-overdue", "/mot-overview");
  addFleetItems(overdueService, "service-overdue", "/service-overview");

  followUps.forEach((event) => {
    const id = String(event?.id || "").trim();
    if (!id) return;
    items.push({
      id: `follow-up:${id}`,
      type: "first-pencil",
      severity: "urgent",
      title: `Follow up ${event.jobNumber || "first-pencil booking"}`,
      detail: `${event.client || "Client not recorded"} · decision needed before the start date`,
      dueAt: attentionDate(event.start),
      actionTarget: { kind: "booking", id },
    });
  });

  preparation.forEach((item) => {
    const id = String(item?.id || "").trim();
    if (!id) return;
    items.push({
      id: `preparation:${id}`,
      type: "preparation",
      severity: "upcoming",
      title: `Prepare job ${item.jobNumber || "booking"}`,
      detail: [item.vehicles?.join(", "), item.equipment].filter(Boolean).join(" · ") || "Review vehicles, equipment and notes",
      dueAt: attentionDate(item.start),
      actionTarget: { kind: "booking", id },
    });
  });

  const deduplicated = Array.from(new Map(items.map((item) => [item.id, item])).values());
  return deduplicated.sort((a, b) => {
    const severity = ATTENTION_SEVERITY[a.severity] - ATTENTION_SEVERITY[b.severity];
    if (severity) return severity;
    const aDate = toDashboardDate(a.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDate = toDashboardDate(b.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aDate - bDate || a.title.localeCompare(b.title);
  });
}

export function filterCalendarEvents(events = [], enabledSources = []) {
  const enabled = new Set(enabledSources);
  if (!enabled.size) return [];
  return events.filter((event) => enabled.has(event?.sourceType));
}
