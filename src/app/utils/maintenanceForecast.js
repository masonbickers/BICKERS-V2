import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  getCanonicalDueDate,
  isMotNotApplicable,
  isServiceNotApplicable,
  isVehicleOutOfUse,
} from "./maintenanceSchema.js";
import {
  buildScheduledMaintenanceBooking,
  maintenanceDateOnly,
  maintenanceIsoWeekLabel,
  maintenanceRequirementDocumentId,
  normalizeMaintenanceRecord,
} from "./maintenanceRecord.js";

const text = (value) => String(value || "").trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const AUTOMATIC_CALENDAR_MAINTENANCE_TYPE_IDS = Object.freeze([
  "mot",
  "service",
  "pmi",
  "brake_test",
]);

export const INSPECTION_MAINTENANCE_TYPE_IDS = Object.freeze(["pmi", "brake_test"]);

const normalizedIncludedTypeIds = (includedTypeIds) =>
  new Set(
    (Array.isArray(includedTypeIds)
      ? includedTypeIds
      : AUTOMATIC_CALENDAR_MAINTENANCE_TYPE_IDS
    )
      .map((value) => text(value).toLowerCase())
      .filter((value) => AUTOMATIC_CALENDAR_MAINTENANCE_TYPE_IDS.includes(value))
  );

const localDate = (value) => {
  const match = maintenanceDateOnly(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
};

const addWeeks = (value, weeks) => {
  const date = localDate(value);
  if (!date || !Number.isFinite(Number(weeks)) || Number(weeks) <= 0) return "";
  date.setDate(date.getDate() + Number(weeks) * 7);
  return maintenanceDateOnly(date);
};

const yearOf = (value) => Number(maintenanceDateOnly(value).slice(0, 4) || 0);

const vehicleLabel = (vehicle = {}) => {
  const name = text(vehicle.name || vehicle.vehicleName || vehicle.title);
  const registration = text(vehicle.registration || vehicle.reg).toUpperCase();
  if (name && registration && !name.toUpperCase().includes(registration)) {
    return `${name} (${registration})`;
  }
  return name || registration || text(vehicle.id) || "Vehicle";
};

const additionalUiKeyByType = Object.freeze({
  tacho_inspection: "tachoInspection",
  brake_test: "brakeTest",
  pmi: "pmiInspection",
  tacho_download: "tachoDownload",
  tail_lift: "tailLift",
  loler: "loler",
});

export const isVehicleMaintenanceTypeEnabled = (vehicle = {}, workflow = {}) => {
  const uiKey = additionalUiKeyByType[workflow.maintenanceTypeId] || workflow.dueKey;
  if (list(vehicle.hiddenAdditionalMaintenance).includes(uiKey)) return false;
  return Boolean(
    maintenanceDateOnly(vehicle[workflow.nextField]) ||
      maintenanceDateOnly(vehicle[workflow.lastField]) ||
      Number(vehicle[workflow.frequencyField] || 0) > 0
  );
};

const occurrencesForYear = ({ firstDueDateISO, frequencyWeeks, year, single = false }) => {
  let cursor = maintenanceDateOnly(firstDueDateISO);
  if (!cursor || !Number.isInteger(Number(year))) return [];
  if (single) return yearOf(cursor) === Number(year) ? [cursor] : [];

  const weeks = Number(frequencyWeeks || 0);
  if (!(weeks > 0)) return yearOf(cursor) === Number(year) ? [cursor] : [];

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  let guard = 0;
  while (cursor < start && guard < 1000) {
    cursor = addWeeks(cursor, weeks);
    guard += 1;
  }

  const dates = [];
  while (cursor && cursor <= end && dates.length < 1000) {
    if (cursor >= start) dates.push(cursor);
    cursor = addWeeks(cursor, weeks);
  }
  return dates;
};

const scheduledRecord = ({ companyId, vehicle, items, appointmentDateISO, year }) => {
  const record = buildScheduledMaintenanceBooking({
    companyId: text(vehicle.companyId) || text(companyId),
    vehicleId: text(vehicle.id),
    vehicleLabel: vehicleLabel(vehicle),
    items,
    appointmentDateISO,
    source: "automatic_schedule",
    sourceId: text(vehicle.id),
  });
  return {
    ...record,
    id: maintenanceRequirementDocumentId(record.requirementKey),
    forecastYear: Number(year),
    scheduleManuallyAdjusted: false,
    origin: {
      ...record.origin,
      source: "automatic_schedule",
      sourceId: text(vehicle.id),
    },
  };
};

export const buildAnnualMaintenanceForecast = ({
  vehicle = {},
  year,
  companyId = "",
  includedTypeIds,
} = {}) => {
  const forecastYear = Number(year);
  if (!text(vehicle.id) || !Number.isInteger(forecastYear)) return [];
  const includedTypes = normalizedIncludedTypeIds(includedTypeIds);
  const pendingReturnInspection =
    String(vehicle?.pendingReturnInspection?.status || "").trim().toLowerCase() ===
    "inspection_required";
  const suppressVorInspectionForecast = isVehicleOutOfUse(vehicle) && !pendingReturnInspection;

  const items = [];
  const addOccurrences = (maintenanceTypeId, dueDateISO, frequencyWeeks, single = false) => {
    occurrencesForYear({ firstDueDateISO: dueDateISO, frequencyWeeks, year: forecastYear, single })
      .forEach((legalDueDateISO) => {
        items.push({
          maintenanceTypeId,
          legalDueDateISO,
          legalDueIsoWeek: maintenanceIsoWeekLabel(legalDueDateISO),
        });
      });
  };

  if (includedTypes.has("mot") && !isMotNotApplicable(vehicle)) {
    addOccurrences("mot", getCanonicalDueDate(vehicle, "mot"), 0, true);
  }
  if (includedTypes.has("service") && !isServiceNotApplicable(vehicle)) {
    addOccurrences(
      "service",
      getCanonicalDueDate(vehicle, "service"),
      Number(vehicle.serviceFreq || 52)
    );
  }

  ADDITIONAL_MAINTENANCE_WORKFLOWS.forEach((workflow) => {
    if (!includedTypes.has(workflow.maintenanceTypeId)) return;
    if (
      suppressVorInspectionForecast &&
      INSPECTION_MAINTENANCE_TYPE_IDS.includes(workflow.maintenanceTypeId)
    ) {
      return;
    }
    if (!isVehicleMaintenanceTypeEnabled(vehicle, workflow)) return;
    const dueDateISO = maintenanceDateOnly(vehicle[workflow.nextField]);
    const configuredWeeks = Number(vehicle[workflow.frequencyField] || 0);
    const frequencyWeeks =
      configuredWeeks > 0
        ? configuredWeeks
        : ["pmi", "brake_test"].includes(workflow.maintenanceTypeId)
        ? 8
        : 0;
    // The diary only needs the next legal inspection appointment. Later PMI /
    // brake cycles are created after the current inspection is completed and
    // the vehicle's next due dates advance.
    addOccurrences(
      workflow.maintenanceTypeId,
      dueDateISO,
      frequencyWeeks,
      INSPECTION_MAINTENANCE_TYPE_IDS.includes(workflow.maintenanceTypeId)
    );
  });

  const groups = new Map();
  items.forEach((item) => {
    const combine = ["pmi", "brake_test"].includes(item.maintenanceTypeId);
    const key = combine
      ? `pmi-brake:${item.legalDueIsoWeek}`
      : `${item.maintenanceTypeId}:${item.legalDueDateISO}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  });

  return [...groups.values()]
    .map((groupItems) => {
      const sortedItems = [...groupItems].sort((a, b) =>
        `${a.legalDueDateISO}:${a.maintenanceTypeId}`.localeCompare(
          `${b.legalDueDateISO}:${b.maintenanceTypeId}`
        )
      );
      return scheduledRecord({
        companyId,
        vehicle,
        items: sortedItems,
        appointmentDateISO: sortedItems[0]?.legalDueDateISO || "",
        year: forecastYear,
      });
    })
    .filter((record) => record.id)
    .sort((a, b) =>
      `${a.schedule.appointmentDateISO}:${a.requirementKey}`.localeCompare(
        `${b.schedule.appointmentDateISO}:${b.requirementKey}`
      )
    );
};

const automaticSources = new Set([
  "automatic_schedule",
  "vehicle_maintenance_schedule",
  "maintenance_schedule",
  "completion_recurrence",
  "safe_reconciliation",
]);
const terminalStatuses = new Set(["completed", "cancelled", "archived"]);
const recreationBlockingStatuses = new Set(["completed", "cancelled"]);

export const reconcileAnnualMaintenanceForecast = ({
  forecast = [],
  existingBookings = [],
  vehicleId = "",
  year,
  todayISO = maintenanceDateOnly(new Date()),
  includedTypeIds,
} = {}) => {
  const targetYear = Number(year);
  const includedTypes = normalizedIncludedTypeIds(includedTypeIds);
  const relevant = list(existingBookings)
    .map((source) => ({ source, canonical: normalizeMaintenanceRecord(source, { id: source.id }) }))
    .filter(({ canonical }) =>
      canonical.vehicleId === text(vehicleId) &&
      canonical.items.length > 0 &&
      canonical.items.every((item) => includedTypes.has(item.maintenanceTypeId))
    );
  const byRequirementKey = new Map();
  relevant.forEach((entry) => {
    if (entry.canonical.requirementKey) {
      byRequirementKey.set(entry.canonical.requirementKey, [
        ...(byRequirementKey.get(entry.canonical.requirementKey) || []),
        entry,
      ]);
    }
  });

  const create = [];
  const preserve = [];
  const blocked = [];
  const duplicate = [];
  const desiredKeys = new Set();
  const occupiedDocumentIds = new Set(
    list(existingBookings).map((booking) => text(booking?.id)).filter(Boolean)
  );
  const withAvailableDocumentId = (record) => {
    if (!occupiedDocumentIds.has(record.id)) {
      occupiedDocumentIds.add(record.id);
      return record;
    }
    let attempt = 1;
    let replacementId = "";
    do {
      replacementId = maintenanceRequirementDocumentId(
        `${record.requirementKey}|active-replacement:${attempt}`
      );
      attempt += 1;
    } while (occupiedDocumentIds.has(replacementId));
    occupiedDocumentIds.add(replacementId);
    return { ...record, id: replacementId };
  };

  list(forecast).forEach((record) => {
    desiredKeys.add(record.requirementKey);
    const matches = byRequirementKey.get(record.requirementKey) || [];
    if (!matches.length) {
      create.push(record);
      return;
    }
    const blocker = matches.find(({ source, canonical }) =>
      recreationBlockingStatuses.has(canonical.status) ||
      (canonical.status === "archived" &&
        !automaticSources.has(text(source.origin?.source || canonical.origin?.source)))
    );
    if (blocker) {
      blocked.push(blocker.source);
      matches.filter((entry) => entry !== blocker).forEach(({ source }) => duplicate.push(source));
      return;
    }
    const active = matches.find(({ canonical }) => !terminalStatuses.has(canonical.status));
    if (active) {
      preserve.push(active.source);
      matches.filter((entry) => entry !== active).forEach(({ source }) => duplicate.push(source));
      return;
    }

    // Archived automatic records remain immutable history, but must not leave a
    // legally required cycle without one active booked appointment.
    matches.forEach(({ source }) => preserve.push(source));
    create.push(withAvailableDocumentId(record));
  });

  const supersede = relevant
    .filter(({ source, canonical }) => {
      if (desiredKeys.has(canonical.requirementKey)) return false;
      if (!automaticSources.has(text(source.origin?.source || canonical.origin?.source))) return false;
      if (source.scheduleManuallyAdjusted === true) return false;
      if (terminalStatuses.has(canonical.status)) return false;
      const appointmentDate = canonical.schedule.bookingDates[0] || "";
      const forecastRecordYear = Number(source.forecastYear || yearOf(appointmentDate));
      return forecastRecordYear === targetYear && (!todayISO || appointmentDate >= todayISO);
    })
    .map(({ source }) => source);

  return { create, preserve, blocked, duplicate, supersede };
};

export const buildAnnualMaintenancePersistencePayload = (
  record,
  { createdBy = "system", nowISO = new Date().toISOString() } = {}
) => {
  const appointmentDateISO = maintenanceDateOnly(record?.schedule?.appointmentDateISO);
  const typeIds = list(record?.items).map((item) => item.maintenanceTypeId);
  const type = typeIds.length === 1 && typeIds[0] === "mot"
    ? "MOT"
    : typeIds.length === 1 && typeIds[0] === "service"
    ? "SERVICE"
    : typeIds.some((typeId) => ["repair", "work"].includes(typeId))
    ? "WORK"
    : "INSPECTION";
  return {
    schemaVersion: record.schemaVersion,
    kind: "MAINTENANCE",
    type,
    maintenanceTypeId: typeIds[0] || "work",
    maintenanceTypeIds: typeIds,
    companyId: record.companyId,
    vehicleId: record.vehicleId,
    vehicleLabel: record.vehicleLabel,
    status: "Booked",
    items: list(record.items).map((item) => ({ ...item, status: "booked" })),
    bookingDates: appointmentDateISO ? [appointmentDateISO] : [],
    appointmentDateISO,
    startDateISO: "",
    endDateISO: "",
    requirementKey: record.requirementKey,
    sourceDueKey: record.requirementKey,
    sourceDueDateISO:
      list(record.items).map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] || "",
    sourceDueIsoWeek:
      list(record.items).map((item) => item.legalDueIsoWeek).filter(Boolean).sort()[0] || "",
    origin: record.origin,
    forecastYear: Number(record.forecastYear || appointmentDateISO.slice(0, 4) || 0) || null,
    scheduleManuallyAdjusted: false,
    createdBy,
    lastEditedBy: createdBy,
    history: [{
      action: "Booked",
      user: createdBy,
      timestamp: nowISO,
      changes: [`Annual schedule appointment created for ${appointmentDateISO}.`],
    }],
    createdAt: nowISO,
    updatedAt: nowISO,
  };
};
