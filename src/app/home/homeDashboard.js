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
