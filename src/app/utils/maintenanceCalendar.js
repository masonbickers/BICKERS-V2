"use client";

import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  CALENDAR_REMINDER_WORKFLOW_KEYS,
  buildAssetLabel,
  getCanonicalDueDate,
  getIsoWeekLabel,
  getMaintenanceTypeId,
  isVehicleOutOfUse,
} from "./maintenanceSchema.js";
import {
  getMaintenanceDueState,
  maintenanceRequirementKey,
  normalizeMaintenanceRecord,
} from "./maintenanceRecord.js";

const INACTIVE_MAINTENANCE_BOOKING_STATUSES = new Set([
  "archived",
  "cancelled",
  "canceled",
  "closed",
  "deleted",
  "declined",
  "superseded",
]);

const CLOSED_MAINTENANCE_BOOKING_STATUSES = new Set([
  ...INACTIVE_MAINTENANCE_BOOKING_STATUSES,
  "complete",
  "completed",
]);

const INACTIVE_MAINTENANCE_JOB_STATUSES = new Set([
  "closed",
  "complete",
  "completed",
  "archived",
  "cancelled",
  "canceled",
  "deleted",
]);

export const shouldExcludeFromWorkDiary = (event = {}) =>
  String(event.status || "").trim().toLowerCase() === "maintenance";

export const toDateLike = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const startOfLocalDay = (value) => {
  const date = toDateLike(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
};

export const addDaysToDate = (value, amount) => {
  const date = startOfLocalDay(value);
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const toYmdDate = (value) => {
  const date = toDateLike(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isInactiveMaintenanceBooking = (status) =>
  INACTIVE_MAINTENANCE_BOOKING_STATUSES.has(String(status || "").trim().toLowerCase());

export const isOpenMaintenanceBooking = (booking = {}, now = new Date()) => {
  const status = String(booking.status || "").trim().toLowerCase();
  if (
    CLOSED_MAINTENANCE_BOOKING_STATUSES.has(status) ||
    status.includes("cancel") ||
    status.includes("declin")
  ) {
    return false;
  }

  const bookingDates = Array.isArray(booking.bookingDates)
    ? booking.bookingDates.map(toDateLike).filter(Boolean)
    : [];
  const end =
    toDateLike(booking.endDate) ||
    toDateLike(booking.endDateISO) ||
    bookingDates.sort((a, b) => b.getTime() - a.getTime())[0] ||
    toDateLike(booking.appointmentDate) ||
    toDateLike(booking.appointmentDateISO) ||
    toDateLike(booking.startDate) ||
    toDateLike(booking.startDateISO) ||
    toDateLike(booking.date);
  const today = startOfLocalDay(now);
  const bookingEnd = startOfLocalDay(end);

  return !today || !bookingEnd || bookingEnd.getTime() >= today.getTime();
};

const maintenanceBookingDateKeys = (booking = {}) => {
  if (Array.isArray(booking.bookingDates) && booking.bookingDates.length) {
    return booking.bookingDates
      .map((value) => toYmdDate(value))
      .filter(Boolean)
      .sort();
  }

  const appointment = toYmdDate(
    booking.appointmentDateISO || booking.appointmentDate || booking.date
  );
  if (appointment) return [appointment];

  const start = startOfLocalDay(booking.startDateISO || booking.startDate);
  const end = startOfLocalDay(
    booking.endDateISO || booking.endDate || booking.startDateISO || booking.startDate
  );
  if (!start || !end) return [];

  const keys = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toYmdDate(cursor));
    cursor = addDaysToDate(cursor, 1);
  }
  return keys;
};

export const buildActiveInspectionMetaByVehicle = (
  maintenanceBookings,
  now = new Date()
) => {
  const map = {};

  for (const booking of maintenanceBookings || []) {
    if (!isOpenMaintenanceBooking(booking, now)) continue;
    if (String(booking?.type || "").trim().toUpperCase() !== "INSPECTION") continue;

    const vehicleId = String(booking?.vehicleId || "").trim();
    if (!vehicleId) continue;

    if (!map[vehicleId]) {
      map[vehicleId] = {
        sourceDueKeys: new Set(),
        sourceDueWeeks: new Set(),
        bookedWeeks: new Set(),
        bookings: [],
      };
    }

    const meta = map[vehicleId];
    const sourceDueKey = String(booking.sourceDueKey || "").trim();
    const sourceDueWeek = String(booking.sourceDueIsoWeek || "").trim();
    if (sourceDueKey) meta.sourceDueKeys.add(sourceDueKey);
    if (sourceDueWeek) meta.sourceDueWeeks.add(sourceDueWeek);

    const dateKeys = maintenanceBookingDateKeys(booking);
    dateKeys.forEach((key) => meta.bookedWeeks.add(getIsoWeekLabel(key)));
    const firstDateKey = dateKeys[0] || "";
    meta.bookings.push({
      id: booking.id,
      firstDateKey,
      firstDate: firstDateKey ? startOfLocalDay(firstDateKey) : null,
    });
  }

  return map;
};

export const isMaintenanceCalendarEventDraggable = (event = {}) => {
  const bookingStatus = String(event.bookingStatus || event.status || "")
    .trim()
    .toLowerCase();
  const isClosed =
    CLOSED_MAINTENANCE_BOOKING_STATUSES.has(bookingStatus) ||
    bookingStatus.includes("cancel") ||
    bookingStatus.includes("declin");

  if (event.__collection === "maintenanceBookings") {
    return Boolean(event.__parentId || event.id) && !isClosed;
  }

  if (event.kind === "MAINTENANCE_APPOINTMENT") {
    return Boolean(event.vehicleId) && !isClosed;
  }

  if (event.__collection === "vehicleDueDates") {
    return Boolean(event.vehicleId) && !isClosed;
  }

  return false;
};

export const isMaintenanceMoveOutsideDueWeek = (event = {}, targetDate) => {
  const targetWeek = getIsoWeekLabel(toYmdDate(targetDate));
  if (!targetWeek) return false;
  const legalWeeks = new Set(
    [
      event.legalDueIsoWeek,
      event.sourceDueIsoWeek,
      ...(Array.isArray(event.canonicalItems)
        ? event.canonicalItems.map((item) => item?.legalDueIsoWeek)
        : []),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  return legalWeeks.size > 0 && !legalWeeks.has(targetWeek);
};

export const buildMaintenanceBookingDraftFromDueEvent = (event = {}, targetDate) => {
  const vehicleId = String(event.vehicleId || "").trim();
  const defaultDate = toYmdDate(targetDate);
  const legalDueDate = toYmdDate(
    event.dueDate || event.appointmentDateISO || event.start
  );
  if (!vehicleId || !defaultDate || !legalDueDate) return null;

  const typeIds = Array.isArray(event.maintenanceTypeIds) && event.maintenanceTypeIds.length
    ? [...new Set(event.maintenanceTypeIds.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))]
    : event.maintenanceTypeId
    ? [String(event.maintenanceTypeId).trim().toLowerCase()]
    : [];
  const kind = String(event.kind || "").trim().toUpperCase();
  const type =
    kind === "MOT" || kind === "MOT_BOOKING"
      ? "MOT"
      : kind === "SERVICE" || kind === "SERVICE_BOOKING"
      ? "SERVICE"
      : "INSPECTION";
  const maintenanceTypeIds = type === "INSPECTION" ? typeIds : [];
  const dueIsoWeek = String(event.sourceDueIsoWeek || "").trim() || getIsoWeekLabel(legalDueDate);

  return {
    vehicleId,
    type,
    defaultDate,
    requestedRecordId:
      event.__collection === "maintenanceBookings"
        ? String(event.__parentId || event.id || "").split("__")[0]
        : "",
    sourceDueDate: legalDueDate,
    sourceDueIsoWeek: dueIsoWeek,
    sourceDueKey:
      String(event.sourceDueKey || "").trim() ||
      `${(maintenanceTypeIds.length ? maintenanceTypeIds : [type.toLowerCase()]).join("+")}__${vehicleId}__${legalDueDate}`,
    defaultMaintenanceTypeIds: maintenanceTypeIds,
  };
};

export const isActiveMaintenanceJob = (status) =>
  !INACTIVE_MAINTENANCE_JOB_STATUSES.has(String(status || "").trim().toLowerCase());

export const getMaintenanceBookingKind = (booking = {}) => {
  const type = String(booking.type || booking.maintenanceType || "").trim().toUpperCase();
  if (type === "MOT") return "MOT_BOOKING";
  if (type === "SERVICE") return "SERVICE_BOOKING";
  if (type === "INSPECTION") return "INSPECTION_BOOKING";
  return "MAINTENANCE_BOOKING";
};

const maintenanceInspectionTypeLabel = (maintenanceTypeIds = []) => {
  const selected = new Set(
    (Array.isArray(maintenanceTypeIds) ? maintenanceTypeIds : [])
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const labelByType = new Map(
    ADDITIONAL_MAINTENANCE_WORKFLOWS.map((workflow) => [
      workflow.maintenanceTypeId,
      workflow.label,
    ])
  );
  const preferredOrder = [
    "brake_test",
    "pmi",
    ...ADDITIONAL_MAINTENANCE_WORKFLOWS.map((workflow) => workflow.maintenanceTypeId),
  ];
  const labels = [...new Set(preferredOrder)]
    .filter((typeId) => selected.has(typeId))
    .map((typeId) => labelByType.get(typeId) || typeId.replaceAll("_", " "));
  return labels.length ? labels.join(" / ") : "Inspection";
};

export const getMaintenanceDisplayTypeIds = (booking = {}, canonicalRecord = null) => {
  const rawType = String(booking.type || booking.maintenanceType || "").trim().toUpperCase();
  if (rawType !== "INSPECTION") {
    return (Array.isArray(booking.maintenanceTypeIds) ? booking.maintenanceTypeIds : [])
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
  }

  const canonical = canonicalRecord || normalizeMaintenanceRecord(booking, { id: booking.id });
  const supportedTypeIds = new Set(
    ADDITIONAL_MAINTENANCE_WORKFLOWS.map((workflow) => workflow.maintenanceTypeId)
  );
  const relevantItems = (Array.isArray(canonical?.items) ? canonical.items : []).filter((item) =>
    supportedTypeIds.has(String(item?.maintenanceTypeId || "").trim().toLowerCase())
  );
  const completed = relevantItems.filter((item) => item.status === "completed");
  const outstanding = relevantItems.filter((item) => item.status !== "completed");
  const displayItems = canonical?.status === "completed"
    ? completed.length ? completed : relevantItems
    : outstanding.length ? outstanding : relevantItems;

  return [...new Set(displayItems.map((item) => item.maintenanceTypeId))];
};

export const getMaintenanceDisplayType = (booking = {}) => {
  const rawType = String(booking.type || booking.maintenanceType || "").trim().toUpperCase();
  if (rawType === "INSPECTION") {
    return maintenanceInspectionTypeLabel(getMaintenanceDisplayTypeIds(booking));
  }

  const explicit = String(booking.maintenanceTypeLabel || "").trim();
  if (explicit) return explicit.toUpperCase();

  const other = String(booking.maintenanceTypeOther || "").trim();
  if (other) return other.toUpperCase();

  if (rawType === "MOT") return "MOT";
  if (rawType === "SERVICE") return "SERVICE";
  if (rawType === "WORK") return "WORK";
  if (rawType) return rawType;

  return "MAINTENANCE";
};

export const reconcileMaintenanceEventVehicle = (event = {}, vehicle = null) => {
  if (!vehicle) {
    return {
      ...event,
      vehicleResolution: "not-found",
    };
  }

  const vehicleLabel = buildAssetLabel(vehicle);
  const typeLabel = getMaintenanceDisplayType(event);
  const provider = String(event.provider || "").trim();

  return {
    ...event,
    vehicleId: String(vehicle.id || event.vehicleId || "").trim(),
    vehicleLabel,
    vehicleName: String(vehicle.name || vehicle.vehicleName || "").trim(),
    vehicleRegistration: String(
      vehicle.registration || vehicle.reg || vehicle.registrationNumber || ""
    )
      .trim()
      .toUpperCase(),
    title: [vehicleLabel, typeLabel, provider].filter(Boolean).join(" - "),
    vehicleResolution: "register",
  };
};

const groupConsecutiveYmdDates = (dates) => {
  const sortedDates = [...new Set(dates)].sort();
  const ranges = [];

  for (const ymd of sortedDates) {
    const start = startOfLocalDay(ymd);
    if (!start) continue;

    const lastRange = ranges[ranges.length - 1];
    if (!lastRange) {
      ranges.push({ startYmd: ymd, endYmd: ymd, dates: [ymd] });
      continue;
    }

    const expectedNext = toYmdDate(addDaysToDate(lastRange.endYmd, 1));
    if (ymd === expectedNext) {
      lastRange.endYmd = ymd;
      lastRange.dates.push(ymd);
    } else {
      ranges.push({ startYmd: ymd, endYmd: ymd, dates: [ymd] });
    }
  }

  return ranges;
};

export const buildMaintenanceBookingEvents = (maintenanceBookings, options = {}) => {
  const {
    getVehicleLabel,
    groupConsecutiveDates = false,
    titleSeparator = " - ",
    includeStatus = true,
    statusLabel = "Maintenance",
  } = options;

  return (maintenanceBookings || []).flatMap((booking) => {
    if (isInactiveMaintenanceBooking(booking.status)) return [];

    const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
    const canonicalStatus = canonical.status;

    const dates = canonical.schedule.bookingDates;
    const kind = getMaintenanceBookingKind(booking);
    const displayTypeIds = getMaintenanceDisplayTypeIds(booking, canonical);
    const typeLabel = getMaintenanceDisplayType({
      ...booking,
      status: canonicalStatus,
      items: canonical.items,
      maintenanceTypeIds: displayTypeIds,
    });
    const vehicleId = booking.vehicleId || null;
    const label = getVehicleLabel
      ? getVehicleLabel(booking)
      : booking.vehicleLabel || booking.vehicleName || booking.title || booking.jobNumber || "Vehicle";
    const provider = String(booking.provider || "").trim();
    const lifecycleLabel = canonicalStatus === "requested"
      ? "Due — not yet arranged"
      : canonicalStatus === "booked"
      ? "Confirmed booking"
      : String(booking.status || canonicalStatus || "Maintenance");
    const legalDueDates = canonical.items
      .map((item) => item.legalDueDateISO)
      .filter(Boolean)
      .sort();
    const legalDueDateISO = legalDueDates[0] || "";
    const dueState = getMaintenanceDueState({
      maintenanceTypeId: canonical.items[0]?.maintenanceTypeId,
      dueDate: legalDueDateISO,
      asOfDate: options.asOfDate || new Date(),
    });
    const baseTitle = `${label}${titleSeparator}${typeLabel}${titleSeparator}${lifecycleLabel}` +
      (provider ? `${titleSeparator}${provider}` : "");

    if (dates.length) {
      const dateRanges = groupConsecutiveDates
        ? groupConsecutiveYmdDates(dates)
        : dates.map((ymd) => ({ startYmd: ymd, endYmd: ymd, dates: [ymd] }));

      return dateRanges
        .map(({ startYmd, endYmd, dates: rangeDates }) => {
          const start = startOfLocalDay(startYmd);
          const end = startOfLocalDay(endYmd);
          if (!start) return null;

          const isRange = startYmd !== endYmd;
          return {
            ...booking,
            __collection: "maintenanceBookings",
            __parentId: booking.id,
            __occurrence: startYmd,
            __occurrences: rangeDates,
            id: isRange ? `${booking.id}__${startYmd}_${endYmd}` : `${booking.id}__${startYmd}`,
            title: baseTitle,
            kind,
            vehicleId,
            bookingStatus: lifecycleLabel,
            maintenanceLifecycleLabel: lifecycleLabel,
            dueState: dueState.state,
            recordStatus: canonicalStatus,
            requirementKey: canonical.requirementKey,
            canonicalItems: canonical.items,
            maintenanceTypeIds: displayTypeIds,
            legalDueDateISO,
            legalDueDates,
            legalDueIsoWeek: canonical.items[0]?.legalDueIsoWeek || "",
            maintenanceTypeId: getMaintenanceTypeId(booking),
            maintenanceType: booking.maintenanceType || "",
            maintenanceTypeOther: booking.maintenanceTypeOther || "",
            maintenanceTypeLabel: typeLabel,
            start,
            end: addDaysToDate(end || start, 1),
            allDay: true,
            ...(includeStatus ? { status: statusLabel } : {}),
          };
        })
        .filter(Boolean);
    }

    const requestedDueDate = canonicalStatus === "requested"
      ? canonical.items.map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] || ""
      : "";
    const start =
      startOfLocalDay(requestedDueDate) ||
      startOfLocalDay(booking.startDateISO) ||
      startOfLocalDay(booking.startDate) ||
      startOfLocalDay(booking.date) ||
      startOfLocalDay(booking.start) ||
      startOfLocalDay(booking.startDay) ||
      startOfLocalDay(booking.appointmentDateISO) ||
      startOfLocalDay(booking.appointmentDate);
    if (!start) return [];

    const end =
      startOfLocalDay(booking.endDateISO) ||
      startOfLocalDay(booking.endDate) ||
      startOfLocalDay(booking.end) ||
      start;
    const safeEnd = end && end >= start ? end : start;

    return [
      {
        ...booking,
        __collection: "maintenanceBookings",
        __parentId: booking.id,
        id: booking.id,
        title: baseTitle,
        kind,
        vehicleId,
        bookingStatus: lifecycleLabel,
        maintenanceLifecycleLabel: lifecycleLabel,
        dueState: dueState.state,
        recordStatus: canonicalStatus,
        requirementKey: canonical.requirementKey,
        canonicalItems: canonical.items,
        maintenanceTypeIds: displayTypeIds,
        legalDueDateISO,
        legalDueDates,
        legalDueIsoWeek: canonical.items[0]?.legalDueIsoWeek || "",
        maintenanceTypeId: getMaintenanceTypeId(booking),
        maintenanceType: booking.maintenanceType || "",
        maintenanceTypeOther: booking.maintenanceTypeOther || "",
        maintenanceTypeLabel: typeLabel,
        start,
        end: addDaysToDate(safeEnd, 1),
        allDay: true,
        ...(includeStatus ? { status: statusLabel } : {}),
      },
    ];
  });
};

const maintenanceAppointmentKey = (event = {}) => {
  const vehicleId = String(event?.vehicleId || "").trim();
  const dateKey = toYmdDate(event?.appointmentDateISO || event?.start);
  const isoWeek = getIsoWeekLabel(dateKey);
  const typeIds = (Array.isArray(event?.maintenanceTypeIds)
    ? event.maintenanceTypeIds
    : Array.isArray(event?.canonicalItems)
    ? event.canonicalItems.map((item) => item?.maintenanceTypeId)
    : []
  )
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => ["pmi", "brake_test"].includes(item))
    .sort();
  if (!vehicleId || !isoWeek || !typeIds.length) return "";
  return `${vehicleId}|${isoWeek}|${[...new Set(typeIds)].join("+")}`;
};

const eventRequirementKey = (event = {}) => {
  const explicit = String(event?.requirementKey || "").trim();
  if (explicit) return explicit;
  const items = Array.isArray(event?.canonicalItems)
    ? event.canonicalItems
    : (Array.isArray(event?.maintenanceTypeIds) ? event.maintenanceTypeIds : [event?.maintenanceTypeId])
        .filter(Boolean)
        .map((maintenanceTypeId) => ({
          maintenanceTypeId,
          legalDueDateISO: toYmdDate(event?.dueDate || event?.appointmentDateISO || event?.start),
          legalDueIsoWeek: String(event?.sourceDueIsoWeek || event?.legalDueIsoWeek || "").trim(),
        }));
  const canonicalKey = maintenanceRequirementKey({
    companyId: event?.companyId,
    vehicleId: event?.vehicleId,
    items,
  });
  return canonicalKey || String(event?.sourceDueKey || "").trim();
};

export const dedupeMaintenanceCalendarEvents = (events = []) => {
  const actualBookingKeys = new Set(
    (Array.isArray(events) ? events : [])
      .filter(
        (event) =>
          event?.__collection === "maintenanceBookings" &&
          String(event?.kind || "").toUpperCase() === "INSPECTION_BOOKING"
      )
      .map(maintenanceAppointmentKey)
      .filter(Boolean)
  );
  const seenIds = new Set();
  const persistedRequirementKeys = new Set(
    (Array.isArray(events) ? events : [])
      .filter((event) => event?.__collection === "maintenanceBookings")
      .map(eventRequirementKey)
      .filter(Boolean)
  );
  return (Array.isArray(events) ? events : []).filter((event) => {
    const id = String(event?.id || "").trim();
    if (id && seenIds.has(id)) return false;
    if (id) seenIds.add(id);

    if (
      event?.__collection === "vehicleDueDates" &&
      persistedRequirementKeys.has(eventRequirementKey(event))
    ) {
      return false;
    }

    if (
      event?.__collection === "vehicleDueDates" &&
      String(event?.kind || "").toUpperCase() === "MAINTENANCE_APPOINTMENT"
    ) {
      const key = maintenanceAppointmentKey(event);
      if (key && actualBookingKeys.has(key)) return false;
    }
    return true;
  });
};

export const buildMaintenanceJobEvents = (maintenanceJobs, options = {}) => {
  const {
    includeStatus = true,
    statusLabel = "Maintenance",
  } = options;

  return (maintenanceJobs || [])
    .filter((job) => isActiveMaintenanceJob(job.status))
    .map((job) => {
      const when = startOfLocalDay(job.plannedDate || job.dueDate);
      if (!when) return null;

      const statusText = String(job.status || "planned")
        .replaceAll("_", " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());

      return {
        ...job,
        id: `maintenanceJob__${job.id}`,
        __parentId: job.id,
        __collection: "maintenanceJobs",
        title: job.assetLabel || job.title || "Maintenance Job",
        kind: "MAINTENANCE",
        vehicleId: String(job.assetId || "").trim(),
        maintenanceTypeId: getMaintenanceTypeId(job) || String(job.type || "maintenance").trim().toLowerCase(),
        maintenanceType: job.type || "maintenance",
        maintenanceTypeLabel: `Job Card (${statusText})`,
        workflowStatus: String(job.status || "planned").trim().toLowerCase(),
        start: when,
        end: addDaysToDate(when, 1),
        allDay: true,
        ...(includeStatus ? { status: statusLabel } : {}),
      };
    })
    .filter(Boolean);
};

const CANONICAL_CALENDAR_STATUS_PRIORITY = Object.freeze({
  completed: 60,
  in_progress: 50,
  booked: 40,
  deferred: 30,
  requested: 20,
});

const maintenanceRecordTimestamp = (record = {}) => {
  const raw =
    record.updatedAt ||
    record.updatedAtISO ||
    record.lastEditedAt ||
    record.createdAt ||
    record.createdAtISO ||
    "";
  const date = toDateLike(raw);
  return date ? date.getTime() : 0;
};

const preferredCanonicalBooking = (left = {}, right = {}) => {
  const leftCanonical = normalizeMaintenanceRecord(left, { id: left.id });
  const rightCanonical = normalizeMaintenanceRecord(right, { id: right.id });
  const leftManual = left.scheduleManuallyAdjusted === true ? 1 : 0;
  const rightManual = right.scheduleManuallyAdjusted === true ? 1 : 0;
  if (leftManual !== rightManual) return leftManual > rightManual ? left : right;

  const leftPriority = CANONICAL_CALENDAR_STATUS_PRIORITY[leftCanonical.status] || 0;
  const rightPriority = CANONICAL_CALENDAR_STATUS_PRIORITY[rightCanonical.status] || 0;
  if (leftPriority !== rightPriority) return leftPriority > rightPriority ? left : right;

  const leftUpdated = maintenanceRecordTimestamp(left);
  const rightUpdated = maintenanceRecordTimestamp(right);
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated ? left : right;
  return String(left.id || "").localeCompare(String(right.id || "")) <= 0 ? left : right;
};

export const selectCanonicalMaintenanceBookings = (maintenanceBookings = []) => {
  const byRequirement = new Map();
  const withoutRequirement = [];

  (Array.isArray(maintenanceBookings) ? maintenanceBookings : []).forEach((booking) => {
    if (isInactiveMaintenanceBooking(booking?.status)) return;
    const canonical = normalizeMaintenanceRecord(booking, { id: booking?.id });
    if (!Object.hasOwn(CANONICAL_CALENDAR_STATUS_PRIORITY, canonical.status)) return;
    if (!canonical.requirementKey) {
      withoutRequirement.push(booking);
      return;
    }
    const existing = byRequirement.get(canonical.requirementKey);
    byRequirement.set(
      canonical.requirementKey,
      existing ? preferredCanonicalBooking(existing, booking) : booking
    );
  });

  return [...byRequirement.values(), ...withoutRequirement];
};

export const getMaintenanceRecordDisplayDates = (record = {}) => {
  const canonical = normalizeMaintenanceRecord(record, { id: record?.id });
  const rawStatus = String(record?.status || "").trim().toLowerCase().replaceAll("_", " ");
  const status = canonical.status === "requested" && ["planned", "scheduled"].includes(rawStatus)
    ? "booked"
    : canonical.status;
  const legalDueDates = canonical.items
    .map((item) => toYmdDate(item?.legalDueDateISO))
    .filter(Boolean)
    .sort();
  const appointmentDates = canonical.schedule.bookingDates
    .map(toYmdDate)
    .filter(Boolean)
    .sort();
  const completionDates = canonical.items
    .map((item) => toYmdDate(item?.completionDateISO))
    .filter(Boolean)
    .sort();
  const legalDueDateISO = legalDueDates[0] || "";
  const appointmentDateISO = appointmentDates[0] || "";
  const completionDateISO =
    completionDates.at(-1) ||
    toYmdDate(record?.completedDate) ||
    toYmdDate(record?.dateCompleted) ||
    toYmdDate(record?.completedAtISO) ||
    "";

  const displayDateISO = status === "requested"
    ? legalDueDateISO
    : status === "deferred"
      ? appointmentDateISO || legalDueDateISO
      : status === "completed"
        ? completionDateISO || appointmentDateISO || legalDueDateISO
        : appointmentDateISO || legalDueDateISO;

  return {
    status,
    requirementKey: canonical.requirementKey,
    canonicalItems: canonical.items,
    legalDueDates,
    legalDueDateISO,
    appointmentDates,
    appointmentDateISO,
    completionDateISO,
    displayDateISO,
  };
};

/**
 * Canonical event pipeline shared by every maintenance calendar surface.
 * Vehicle due fields deliberately are not accepted here: unarranged work must
 * first exist as an auditable Requested maintenanceBookings record.
 */
export const buildMaintenanceCalendarEvents = ({
  maintenanceBookings = [],
  maintenanceJobs = [],
  vehicles = [],
  asOfDate = new Date(),
} = {}) => {
  const vehicleById = new Map(
    (Array.isArray(vehicles) ? vehicles : [])
      .map((vehicle) => [String(vehicle?.id || "").trim(), vehicle])
      .filter(([vehicleId]) => Boolean(vehicleId))
  );

  // A canonical booking without a live vehicle record is an orphan. This can
  // happen when a vehicle was deleted before cascade deletion was introduced;
  // never let those stale records continue to appear on shared calendars.
  const canonicalBookings = selectCanonicalMaintenanceBookings(maintenanceBookings)
    .filter((booking) => vehicleById.has(String(booking?.vehicleId || "").trim()));
  const bookingEvents = buildMaintenanceBookingEvents(canonicalBookings, {
    asOfDate,
    groupConsecutiveDates: true,
    titleSeparator: " - ",
    getVehicleLabel: (booking) => {
      const vehicle = vehicleById.get(String(booking?.vehicleId || "").trim());
      return vehicle
        ? buildAssetLabel(vehicle)
        : booking?.vehicleLabel || booking?.vehicleName || booking?.title || booking?.jobNumber || "Unknown vehicle";
    },
  }).map((event) => {
    const vehicle = vehicleById.get(String(event?.vehicleId || "").trim());
    return vehicle ? reconcileMaintenanceEventVehicle(event, vehicle) : event;
  });

  const jobEvents = buildMaintenanceJobEvents(maintenanceJobs)
    .filter((event) => vehicleById.has(String(event?.vehicleId || "").trim()))
    .map((event) => {
      const vehicle = vehicleById.get(String(event?.vehicleId || "").trim());
      return {
        ...event,
        assetLabel: buildAssetLabel(vehicle),
        vehicleLabel: buildAssetLabel(vehicle),
        title: event.title || buildAssetLabel(vehicle),
        vehicleResolution: "register",
      };
    });

  return dedupeMaintenanceCalendarEvents([...bookingEvents, ...jobEvents]);
};

export const buildBookedMetaByVehicle = (maintenanceBookings, now = new Date()) => {
  const map = {};

  for (const booking of maintenanceBookings || []) {
    const vehicleId = String(booking?.vehicleId || "").trim();
    if (!vehicleId || !isOpenMaintenanceBooking(booking, now)) continue;

    const typeRaw = String(booking.type || "").toUpperCase();
    const type = typeRaw === "SERVICE" ? "service" : typeRaw === "MOT" ? "mot" : "";
    if (!type) continue;

    const appt =
      toDateLike(booking.appointmentDate) ||
      toDateLike(booking.appointmentDateISO) ||
      toDateLike(booking.startDate) ||
      toDateLike(booking.startDateISO) ||
      null;
    if (!appt) continue;

    if (!map[vehicleId]) {
      map[vehicleId] = { mot: { has: false, earliestAppt: null }, service: { has: false, earliestAppt: null } };
    }

    map[vehicleId][type].has = true;
    const current = map[vehicleId][type].earliestAppt;
    if (!current || appt.getTime() < current.getTime()) {
      map[vehicleId][type].earliestAppt = appt;
    }
  }

  return map;
};

export const buildVehicleDueEvents = (vehicles, options = {}) => {
  const {
    bookedMetaByVehicle = {},
    getVehicleLabel,
    isApptAfterExpiry = () => false,
  } = options;

  return (vehicles || []).flatMap((vehicle) => {
    if (isVehicleOutOfUse(vehicle)) return [];

    const vehicleId = String(vehicle.id || "").trim();
    const label = getVehicleLabel ? getVehicleLabel(vehicle) : vehicleId || "Vehicle";
    const bookedMeta = bookedMetaByVehicle[vehicleId] || null;
    const motDue = getCanonicalDueDate(vehicle, "mot");
    const serviceDue = getCanonicalDueDate(vehicle, "service");
    const maintenanceWorkflows = ADDITIONAL_MAINTENANCE_WORKFLOWS
      .filter((workflow) => CALENDAR_REMINDER_WORKFLOW_KEYS.includes(workflow.key))
      .map((workflow) => ({
        ...workflow,
        due: getCanonicalDueDate(vehicle, workflow.dueKey),
      }));

    const items = [
      {
        kind: "MOT",
        due: motDue,
        titleLabel: "MOT Due",
        maintenanceTypeLabel: "MOT",
        booked: !!bookedMeta?.mot?.has,
        bookingStatus:
          bookedMeta?.mot?.has && isApptAfterExpiry(bookedMeta?.mot?.earliestAppt, motDue)
            ? "Booked (After Expiry)"
            : bookedMeta?.mot?.has
            ? "Booked"
            : "",
      },
      {
        kind: "SERVICE",
        due: serviceDue,
        titleLabel: "Service Due",
        maintenanceTypeLabel: "SERVICE",
        booked: !!bookedMeta?.service?.has,
        bookingStatus: bookedMeta?.service?.has ? "Booked" : "",
      },
    ];

    const dueEvents = items
      .map((item) => {
        const start = startOfLocalDay(item.due);
        if (!start) return null;

        return {
          id: `due:${vehicleId}:${item.kind}:${toYmdDate(start)}`,
          __collection: "vehicleDueDates",
          vehicleId,
          title: `${label} - ${item.titleLabel}`,
          kind: item.kind,
          dueDate: start,
          appointmentDateISO: toYmdDate(start),
          booked: item.booked,
          bookingStatus: item.bookingStatus,
          maintenanceTypeLabel: item.maintenanceTypeLabel,
          maintenanceTypeId: item.kind === "MOT" ? "mot" : "service",
          start,
          end: addDaysToDate(start, 1),
          allDay: true,
          status: "Due",
        };
      })
      .filter(Boolean)
      .filter((item) => {
        if (!item.booked) return true;
        return item.kind === "MOT" && item.bookingStatus.includes("After Expiry");
      });

    const additionalAppointmentsByDate = maintenanceWorkflows.reduce((acc, item) => {
      const dateKey = toYmdDate(item.due);
      if (!dateKey) return acc;
      const combineByWeek = ["pmi", "brake_test"].includes(item.maintenanceTypeId);
      const isoWeek = getIsoWeekLabel(dateKey);
      const groupKey = combineByWeek ? `iso:${isoWeek}` : `date:${dateKey}`;
      if (!acc[groupKey]) {
        acc[groupKey] = { dateKey, isoWeek, items: [] };
      }
      if (dateKey < acc[groupKey].dateKey) acc[groupKey].dateKey = dateKey;
      acc[groupKey].items.push(item);
      return acc;
    }, {});

    const appointmentEvents = Object.values(additionalAppointmentsByDate)
      .map(({ dateKey, isoWeek, items: appointmentItems }) => {
        const start = startOfLocalDay(dateKey);
        if (!start || !appointmentItems.length) return null;
        const appointmentLabel = `${appointmentItems.map((item) => item.label).join(" / ")} appointment`;
        return {
          id: `appointment:${vehicleId}:${dateKey}:${appointmentItems.map((item) => item.key).join("_")}`,
          __collection: "vehicleDueDates",
          vehicleId,
          title: `${label} - ${appointmentLabel}`,
          kind: "MAINTENANCE_APPOINTMENT",
          appointmentDateISO: dateKey,
          booked: false,
          bookingStatus: "Appointment",
          maintenanceTypeLabel: appointmentLabel,
          maintenanceTypes: appointmentItems.map((item) => item.label),
          maintenanceKeys: appointmentItems.map((item) => item.key),
          maintenanceTypeIds: appointmentItems.map((item) => item.maintenanceTypeId),
          sourceDueIsoWeek: isoWeek,
          requiresMaintenanceDocuments: true,
          requiresBrakeTestDocument: appointmentItems.some((item) => item.key === "brake_test"),
          requiresPmiDocument: appointmentItems.some((item) => item.key === "pmi"),
          start,
          end: addDaysToDate(start, 1),
          allDay: true,
          status: "Due",
        };
      })
      .filter(Boolean);

    const completedAppointmentsByDate = maintenanceWorkflows.flatMap((workflow) => [
      {
        key: workflow.key,
        maintenanceTypeId: workflow.maintenanceTypeId,
        date: vehicle[workflow.lastField],
        label: workflow.label,
        completedAt: "",
      },
      ...(Array.isArray(vehicle[workflow.historyField]) ? vehicle[workflow.historyField] : []).map((item) => ({
        key: workflow.key,
        maintenanceTypeId: workflow.maintenanceTypeId,
        date: item?.completedDate,
        label: workflow.label,
        completedAt: item?.completedAt || "",
        documents: Array.isArray(item?.documents) ? item.documents : [],
      })),
    ]).reduce((acc, item) => {
      const dateKey = toYmdDate(item.date);
      if (!dateKey) return acc;
      if (!acc[dateKey]) acc[dateKey] = [];
      const existing = acc[dateKey].find((row) => row.key === item.key);
      if (existing) {
        existing.documents = [
          ...(Array.isArray(existing.documents) ? existing.documents : []),
          ...(Array.isArray(item.documents) ? item.documents : []),
        ];
        existing.completedAt = [existing.completedAt, item.completedAt].filter(Boolean).sort().at(-1) || "";
        return acc;
      }
      acc[dateKey].push(item);
      return acc;
    }, {});

    const completedAppointmentEvents = Object.entries(completedAppointmentsByDate)
      .map(([dateKey, appointmentItems]) => {
        const start = startOfLocalDay(dateKey);
        if (!start || !appointmentItems.length) return null;
        const appointmentLabel = `${appointmentItems.map((item) => item.label).join(" / ")} appointment`;
        const documents = appointmentItems.flatMap((item) => (Array.isArray(item.documents) ? item.documents : []));
        const brakeDocuments = appointmentItems
          .filter((item) => item.key === "brake_test")
          .flatMap((item) => (Array.isArray(item.documents) ? item.documents : []));
        const pmiDocuments = appointmentItems
          .filter((item) => item.key === "pmi")
          .flatMap((item) => (Array.isArray(item.documents) ? item.documents : []));
        return {
          id: `completed-appointment:${vehicleId}:${dateKey}:${appointmentItems.map((item) => item.key).join("_")}`,
          __collection: "vehicleDueDates",
          vehicleId,
          title: `${label} - ${appointmentLabel}`,
          kind: "MAINTENANCE_APPOINTMENT",
          appointmentDateISO: dateKey,
          booked: false,
          bookingStatus: "Completed",
          maintenanceTypeLabel: appointmentLabel,
          maintenanceTypes: appointmentItems.map((item) => item.label),
          maintenanceKeys: appointmentItems.map((item) => item.key),
          maintenanceTypeIds: appointmentItems.map((item) => item.maintenanceTypeId),
          documents,
          hasMaintenanceDocuments: documents.length > 0,
          requiresMaintenanceDocuments: true,
          requiresBrakeTestDocument: appointmentItems.some((item) => item.key === "brake_test"),
          requiresPmiDocument: appointmentItems.some((item) => item.key === "pmi"),
          hasBrakeTestDocument: brakeDocuments.length > 0,
          hasPmiDocument: pmiDocuments.length > 0,
          completedAt: appointmentItems.map((item) => item.completedAt).filter(Boolean).sort().at(-1) || dateKey,
          start,
          end: addDaysToDate(start, 1),
          allDay: true,
          status: "Due",
        };
      })
      .filter(Boolean);

    return [...dueEvents, ...appointmentEvents, ...completedAppointmentEvents];
  });
};
