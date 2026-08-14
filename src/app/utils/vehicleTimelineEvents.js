const safeArr = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value || "").trim();

const MAINTENANCE_TYPE_LABELS = Object.freeze({
  pmi: "PMI inspection",
  brake_test: "Brake test",
  mot: "MOT",
  service: "Service",
  tacho_inspection: "Tacho inspection",
  tacho_download: "Tacho download",
  tail_lift: "Tail-lift inspection",
  loler: "LOLER inspection",
  repair: "Repair",
  work: "Maintenance work",
});

const recordMaintenanceTypeIds = (record = {}) =>
  [...new Set([
    record.maintenanceTypeId,
    ...safeArr(record.maintenanceTypeIds),
    ...safeArr(record.items).map((item) => item?.maintenanceTypeId),
  ].map((item) => text(item).toLowerCase()).filter(Boolean))];

export const timelineMaintenanceBookingLabel = (record = {}) => {
  const typeIds = new Set(recordMaintenanceTypeIds(record));
  if (typeIds.has("pmi") && typeIds.has("brake_test")) {
    return "PMI + brake test inspection";
  }
  const labels = [...typeIds].map((typeId) => MAINTENANCE_TYPE_LABELS[typeId]).filter(Boolean);
  if (labels.length) return labels.join(" + ");
  const fallback = text(record.title || record.maintenanceType || record.type);
  return fallback && fallback.toUpperCase() !== "INSPECTION" ? fallback : "Inspection";
};

export const timelineMaintenanceOriginLabel = (record = {}) => {
  if (record.scheduleManuallyAdjusted === true) return "Automatic appointment manually moved";
  const source = text(record.origin?.source || record.source).toLowerCase();
  if (["automatic_schedule", "completion_recurrence", "forecast_sync"].includes(source)) {
    return "Automatic forecast appointment";
  }
  if (["manual", "user", "workshop"].includes(source)) return "Manual appointment";
  return "";
};

export const isArchivedTimelineRecord = (record = {}) =>
  ["archive", "archived"].includes(text(record.status).toLowerCase());

const eventMaintenanceTypeIds = (event = {}) =>
  [...new Set(safeArr(event.maintenanceTypeIds).map((item) => text(item).toLowerCase()).filter(Boolean))];

const completedTitle = (typeIds, fallback) => {
  const types = new Set(typeIds);
  if (types.has("pmi") && types.has("brake_test")) return "PMI and brake test completed";
  if (types.has("pmi")) return "PMI inspection completed";
  if (types.has("brake_test")) return "Brake test completed";
  if (types.has("service")) return "Vehicle service completed";
  if (types.has("mot")) return "MOT completed";
  return fallback;
};

export const mergeVehicleTimelineEvents = (events = []) => {
  const merged = [];
  safeArr(events).forEach((event) => {
    if (event.timelineKind !== "maintenance_completion") {
      merged.push(event);
      return;
    }
    const typeIds = eventMaintenanceTypeIds(event);
    const existing = merged.find((candidate) => {
      if (candidate.timelineKind !== "maintenance_completion" || candidate.date !== event.date) {
        return false;
      }
      if (event.bookingId && candidate.bookingId === event.bookingId) return true;
      const candidateTypes = new Set(eventMaintenanceTypeIds(candidate));
      return typeIds.some((typeId) => candidateTypes.has(typeId));
    });
    if (!existing) {
      merged.push({ ...event, maintenanceTypeIds: typeIds });
      return;
    }
    existing.bookingId = existing.bookingId || event.bookingId;
    existing.maintenanceTypeIds = [
      ...new Set([...eventMaintenanceTypeIds(existing), ...typeIds]),
    ];
    existing.title = completedTitle(existing.maintenanceTypeIds, existing.title || event.title);
    existing.description = existing.description || event.description;
    existing.details = [...new Set([...safeArr(existing.details), ...safeArr(event.details)])];
    if (event.tone === "success") existing.tone = "success";
  });

  const seen = new Set();
  return merged.filter((event) => {
    const key = `${event.type}|${event.date}|${event.title}|${event.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dateOnly = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(parsed?.getTime?.())
    ? ""
    : parsed.toISOString().slice(0, 10);
};

export const partitionVehicleTimelineEvents = (
  events = [],
  asOfDate = new Date()
) => {
  const asOf = dateOnly(asOfDate);
  const upcoming = [];
  const past = [];
  safeArr(events).forEach((event) => {
    const eventDate = dateOnly(event.date);
    const isUpcoming =
      eventDate > asOf ||
      (eventDate === asOf && event.timelineKind === "maintenance_booking");
    (isUpcoming ? upcoming : past).push(event);
  });
  upcoming.sort((left, right) => left.date.localeCompare(right.date));
  past.sort((left, right) => right.date.localeCompare(left.date));
  return { upcoming, past };
};

const displayDate = (value) => {
  const iso = dateOnly(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Date not recorded";
};

const calculateDuration = (startValue, endValue = new Date()) => {
  const start = new Date(`${dateOnly(startValue)}T00:00:00`);
  const end = new Date(`${dateOnly(endValue)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
};

export const buildVorTimelineEvents = (vehicle = {}, now = new Date()) =>
  safeArr(vehicle.vorHistory).filter((record) => !isArchivedTimelineRecord(record)).flatMap((record, index) => {
    const startDate = dateOnly(record.offRoadDate || record.startedAt);
    if (!startDate) return [];
    const endDate = dateOnly(record.returnedDate || record.completedAt);
    const days =
      Number.isFinite(Number(record.durationDays)) && Number(record.durationDays) >= 0
        ? Number(record.durationDays)
        : calculateDuration(startDate, endDate || now);
    const durationLabel =
      days === null ? "" : `${days} ${days === 1 ? "day" : "days"}`;
    const events = [
      {
        id: `vor-start-${record.id || index}`,
        sourceRecordId: record.id || "",
        type: "status",
        date: startDate,
        title: "Status changed: Active → VOR",
        description: record.reason || "Vehicle taken off the fleet.",
        details: [
          endDate
            ? `VOR period began ${displayDate(startDate)}`
            : `VOR since ${displayDate(startDate)}${
                durationLabel ? ` · ${durationLabel}` : ""
              }`,
          record.approvedBy ? `Approved by ${record.approvedBy}` : "",
          record.approvedPosition || "",
          record.offRoadOdometer ? `${record.offRoadOdometer} mi` : "",
        ].filter(Boolean),
        tone: "danger",
      },
    ];

    if (endDate) {
      events.push({
        id: `vor-return-${record.id || index}`,
        sourceRecordId: record.id || "",
        type: "status",
        date: endDate,
        title: "Status changed: VOR → Active",
        description: `Vehicle was VOR from ${displayDate(startDate)} to ${displayDate(
          endDate
        )}${durationLabel ? ` (${durationLabel})` : ""}.`,
        details: [
          record.firstUseInspectionDate
            ? `First-use PMI: ${displayDate(record.firstUseInspectionDate)}`
            : "",
          record.removedBy ? `Authorised by ${record.removedBy}` : "",
          record.removedPosition || "",
          record.returnOdometer ? `${record.returnOdometer} mi` : "",
        ].filter(Boolean),
        tone: "success",
      });
    }

    return events;
  });
