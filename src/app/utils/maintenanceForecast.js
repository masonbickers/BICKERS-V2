import {
  RECURRING_MAINTENANCE_WORKFLOWS,
  getConfiguredMaintenanceFrequencyWeeks,
  isMotNotApplicable,
  isServiceNotApplicable,
  isVehicleOutOfUse,
} from "./maintenanceSchema.js";
import {
  buildRequestedMaintenanceRecord,
  calculateNextMaintenanceDue,
  maintenanceDateOnly,
  maintenanceIsoWeekLabel,
  maintenanceRequirementDocumentId,
  normalizeMaintenanceRecord,
} from "./maintenanceRecord.js";

const text = (value) => String(value || "").trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const AUTOMATIC_CALENDAR_MAINTENANCE_TYPE_IDS = Object.freeze(
  RECURRING_MAINTENANCE_WORKFLOWS.map((workflow) => workflow.maintenanceTypeId)
);

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
  tacho_calibration: "tachoCalibration",
});

export const isVehicleMaintenanceTypeEnabled = (vehicle = {}, workflow = {}) => {
  const uiKey = additionalUiKeyByType[workflow.maintenanceTypeId] || workflow.dueKey;
  const hiddenTypes = new Set(list(vehicle.hiddenAdditionalMaintenance).map((value) => text(value)));
  if (
    [uiKey, workflow.key, workflow.maintenanceTypeId]
      .filter(Boolean)
      .some((value) => hiddenTypes.has(text(value)))
  ) {
    return false;
  }
  const hasDate = [...(workflow.nextFields || [workflow.nextField]), ...(workflow.lastFields || [workflow.lastField])]
    .some((field) => maintenanceDateOnly(vehicle[field]));
  const hasAuthoritativeDueDate = workflow.dvsaAuthoritative === true &&
    (workflow.nextFields || [workflow.nextField]).some((field) => maintenanceDateOnly(vehicle[field]));
  if (hasAuthoritativeDueDate) return true;
  return hasDate && getConfiguredMaintenanceFrequencyWeeks(vehicle, workflow) > 0;
};

const requestedRecord = ({ companyId, vehicle, items, year }) => {
  const record = buildRequestedMaintenanceRecord({
    companyId: text(vehicle.companyId) || text(companyId),
    vehicleId: text(vehicle.id),
    vehicleLabel: vehicleLabel(vehicle),
    items,
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
  RECURRING_MAINTENANCE_WORKFLOWS.forEach((workflow) => {
    if (!includedTypes.has(workflow.maintenanceTypeId)) return;
    if (workflow.maintenanceTypeId === "mot" && isMotNotApplicable(vehicle)) return;
    if (workflow.maintenanceTypeId === "service" && isServiceNotApplicable(vehicle)) return;
    if (
      suppressVorInspectionForecast &&
      INSPECTION_MAINTENANCE_TYPE_IDS.includes(workflow.maintenanceTypeId)
    ) {
      return;
    }
    if (!isVehicleMaintenanceTypeEnabled(vehicle, workflow)) return;
    const dueDateISO = (workflow.nextFields || [workflow.nextField])
      .map((field) => maintenanceDateOnly(vehicle[field]))
      .find(Boolean) || (() => {
        const completedDate = (workflow.lastFields || [workflow.lastField])
          .map((field) => maintenanceDateOnly(vehicle[field]))
          .find(Boolean);
        return calculateNextMaintenanceDue({
          maintenanceTypeId: workflow.maintenanceTypeId,
          completedDate,
          frequencyWeeks: getConfiguredMaintenanceFrequencyWeeks(vehicle, workflow),
        });
      })();
    if (!dueDateISO || yearOf(dueDateISO) !== forecastYear) return;
    items.push({
      maintenanceTypeId: workflow.maintenanceTypeId,
      legalDueDateISO: dueDateISO,
      legalDueIsoWeek: maintenanceIsoWeekLabel(dueDateISO),
    });
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
      return requestedRecord({
        companyId,
        vehicle,
        items: sortedItems,
        year: forecastYear,
      });
    })
    .filter((record) => record.id)
    .sort((a, b) =>
      `${a.sourceDueDateISO}:${a.requirementKey}`.localeCompare(
        `${b.sourceDueDateISO}:${b.requirementKey}`
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
const activeRequirementStatuses = new Set(["requested", "booked", "in_progress", "deferred"]);
const confirmedLegacyStatuses = new Set(["booked", "in_progress", "deferred"]);
const automaticArchiveTerms = ["future schedule reset", "supersed", "obsolete", "replaced by canonical"];

const isVorTransitionCancellation = (source, canonical) =>
  canonical.status === "cancelled" &&
  text(source?.cancellationSource).toLowerCase() === "vehicle_vor_transition";

const itemTypeKey = (items = []) =>
  list(items).map((item) => text(item?.maintenanceTypeId).toLowerCase()).filter(Boolean).sort().join("+");

const sameTrustedCompany = (record, canonical) =>
  Boolean(text(record?.companyId)) && text(record.companyId) === text(canonical?.companyId);

const explicitLegalRequirementMatch = (record, canonical) => {
  if (!sameTrustedCompany(record, canonical)) return false;
  if (text(record.vehicleId) !== text(canonical.vehicleId)) return false;
  if (itemTypeKey(record.items) !== itemTypeKey(canonical.items)) return false;
  if (!list(record.items).length || list(record.items).some((item) => !maintenanceDateOnly(item.legalDueDateISO))) {
    return false;
  }
  if (list(canonical.items).some((item) => !maintenanceDateOnly(item.legalDueDateISO))) return false;

  const combinedInspection = itemTypeKey(record.items) === "brake_test+pmi";
  return list(record.items).every((desiredItem) => {
    const existingItem = list(canonical.items).find(
      (item) => item.maintenanceTypeId === desiredItem.maintenanceTypeId
    );
    if (!existingItem) return false;
    if (combinedInspection) {
      return maintenanceIsoWeekLabel(existingItem.legalDueDateISO) ===
        maintenanceIsoWeekLabel(desiredItem.legalDueDateISO);
    }
    return maintenanceDateOnly(existingItem.legalDueDateISO) ===
      maintenanceDateOnly(desiredItem.legalDueDateISO);
  });
};

const isLegacyConfirmedRequirementCandidate = (record, { source, canonical }) => {
  if (!sameTrustedCompany(record, canonical)) return false;
  if (text(record.vehicleId) !== text(canonical.vehicleId)) return false;
  if (itemTypeKey(record.items) !== itemTypeKey(canonical.items)) return false;
  if (!confirmedLegacyStatuses.has(canonical.status)) return false;
  if (text(source.requirementKey) || text(source.sourceDueKey)) return false;
  if (list(canonical.items).some((item) => maintenanceDateOnly(item.legalDueDateISO))) return false;

  const desiredWeeks = [...new Set(
    list(record.items).map((item) => maintenanceIsoWeekLabel(item.legalDueDateISO)).filter(Boolean)
  )];
  if (desiredWeeks.length !== 1) return false;
  return list(canonical.schedule?.bookingDates).some(
    (date) => maintenanceIsoWeekLabel(date) === desiredWeeks[0]
  );
};

const isAutomaticallyArchivedObsolete = (source, canonical) => {
  if (canonical.status !== "archived") return false;
  if (!automaticSources.has(text(source.origin?.source || canonical.origin?.source))) return false;
  if (source.scheduleManuallyAdjusted === true) return false;
  const auditText = [
    source.archiveReason,
    ...list(source.history).flatMap((entry) => [entry?.action, ...list(entry?.changes)]),
  ].map((value) => text(value).toLowerCase()).join(" ");
  return automaticArchiveTerms.some((term) => auditText.includes(term));
};

export const reconcileAnnualMaintenanceForecast = ({
  forecast = [],
  existingBookings = [],
  vehicleId = "",
  year,
  todayISO = maintenanceDateOnly(new Date()),
  includedTypeIds,
  restoreVorCancelledAppointments = false,
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
  const combinedInspectionForecasts = list(forecast).filter(
    (record) => itemTypeKey(record.items) === "brake_test+pmi"
  );
  const isStandaloneInspectionRequestSuperseded = (source, canonical) => {
    if (canonical.status !== "requested" || source.scheduleManuallyAdjusted === true) return false;
    const existingType = itemTypeKey(canonical.items);
    if (!INSPECTION_MAINTENANCE_TYPE_IDS.includes(existingType)) return false;
    const existingItem = canonical.items[0];
    const existingWeek = maintenanceIsoWeekLabel(existingItem?.legalDueDateISO);
    if (!existingWeek) return false;

    return combinedInspectionForecasts.some((record) => {
      if (text(record.vehicleId) !== canonical.vehicleId) return false;
      if (
        text(record.companyId) &&
        text(canonical.companyId) &&
        text(record.companyId) !== text(canonical.companyId)
      ) {
        return false;
      }
      const replacementItem = list(record.items).find(
        (item) => text(item?.maintenanceTypeId).toLowerCase() === existingType
      );
      return maintenanceIsoWeekLabel(replacementItem?.legalDueDateISO) === existingWeek;
    });
  };
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
  const ambiguous = [];
  const reactivate = [];
  const restore = [];
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
  const uniqueEntries = (entries) => {
    const seen = new Set();
    return entries.filter(({ source }) => {
      const key = text(source?.id) || source;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  list(forecast).forEach((record) => {
    desiredKeys.add(record.requirementKey);
    const exactMatches = byRequirementKey.get(record.requirementKey) || [];
    const explicitMatches = relevant.filter(({ canonical }) =>
      explicitLegalRequirementMatch(record, canonical)
    );
    const legalMatches = uniqueEntries([...exactMatches, ...explicitMatches]);

    const activeExactMatches = exactMatches.filter(({ canonical }) =>
      activeRequirementStatuses.has(canonical.status)
    );
    if (activeExactMatches.length) {
      const [active, ...duplicates] = activeExactMatches;
      preserve.push(active.source);
      duplicates.forEach(({ source }) => duplicate.push(source));
      return;
    }

    const activeExplicitMatches = explicitMatches.filter(({ canonical }) =>
      activeRequirementStatuses.has(canonical.status)
    );
    if (activeExplicitMatches.length > 1) {
      activeExplicitMatches.forEach(({ source }) => {
        ambiguous.push(source);
        preserve.push(source);
      });
      return;
    }
    if (activeExplicitMatches.length === 1) {
      preserve.push(activeExplicitMatches[0].source);
      return;
    }

    const legacyCandidates = relevant.filter((entry) =>
      isLegacyConfirmedRequirementCandidate(record, entry)
    );
    if (legacyCandidates.length > 1) {
      legacyCandidates.forEach(({ source }) => {
        ambiguous.push(source);
        preserve.push(source);
      });
      return;
    }
    if (legacyCandidates.length === 1) {
      preserve.push(legacyCandidates[0].source);
      return;
    }

    if (restoreVorCancelledAppointments) {
      const cancelledForVor = relevant.filter(({ source, canonical }) =>
        isVorTransitionCancellation(source, canonical) &&
        itemTypeKey(record.items) === itemTypeKey(canonical.items)
      );
      if (cancelledForVor.length) {
        const desiredAppointmentDate = maintenanceDateOnly(record.sourceDueDateISO) ||
          list(record.items).map((item) => maintenanceDateOnly(item.legalDueDateISO)).find(Boolean);
        const matchingAppointment = cancelledForVor.find(({ canonical }) =>
          list(canonical.schedule?.bookingDates)
            .map(maintenanceDateOnly)
            .includes(desiredAppointmentDate)
        );
        cancelledForVor.forEach(({ source }) => preserve.push(source));
        if (matchingAppointment) {
          reactivate.push({ source: matchingAppointment.source, forecast: record });
        } else {
          restore.push({
            record: withAvailableDocumentId(record),
            appointmentDateISO: desiredAppointmentDate,
            replaces: cancelledForVor[0].source,
          });
        }
        return;
      }
    }

    const blocker = legalMatches.find(({ source, canonical }) =>
      recreationBlockingStatuses.has(canonical.status) ||
      (canonical.status === "archived" && !isAutomaticallyArchivedObsolete(source, canonical))
    );
    if (blocker) {
      blocked.push(blocker.source);
      legalMatches.filter((entry) => entry !== blocker).forEach(({ source }) => duplicate.push(source));
      return;
    }
    const active = legalMatches.find(({ canonical }) => !terminalStatuses.has(canonical.status));
    if (active) {
      preserve.push(active.source);
      legalMatches.filter((entry) => entry !== active).forEach(({ source }) => duplicate.push(source));
      return;
    }

    if (!legalMatches.length) {
      create.push(record);
      return;
    }

    // Archived automatic records remain immutable history, but must not leave a
    // legally required cycle without one active due item.
    legalMatches.forEach(({ source }) => preserve.push(source));
    create.push(withAvailableDocumentId(record));
  });

  relevant.forEach(({ source, canonical }) => {
    if (desiredKeys.has(canonical.requirementKey)) return;
    if (isStandaloneInspectionRequestSuperseded(source, canonical)) return;
    const originSource = text(source.origin?.source || canonical.origin?.source);
    const shouldPreserve =
      ["booked", "in_progress", "deferred"].includes(canonical.status) ||
      source.scheduleManuallyAdjusted === true ||
      !automaticSources.has(originSource);
    if (shouldPreserve && !preserve.some((record) => record.id === source.id)) {
      preserve.push(source);
    }
  });

  const supersede = relevant
    .filter(({ source, canonical }) => {
      if (desiredKeys.has(canonical.requirementKey)) return false;
      const replacesStandaloneInspection = isStandaloneInspectionRequestSuperseded(source, canonical);
      if (
        !replacesStandaloneInspection &&
        !automaticSources.has(text(source.origin?.source || canonical.origin?.source))
      ) return false;
      if (source.scheduleManuallyAdjusted === true) return false;
      if (canonical.status !== "requested") return false;
      const dueDate = canonical.items.map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] || "";
      const forecastRecordYear = Number(source.forecastYear || yearOf(dueDate));
      return forecastRecordYear === targetYear;
    })
    .map(({ source }) => source);

  return { create, preserve, blocked, duplicate, ambiguous, reactivate, restore, supersede };
};

export const buildAnnualMaintenancePersistencePayload = (
  record,
  { createdBy = "system", nowISO = new Date().toISOString() } = {}
) => {
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
    status: "Requested",
    items: list(record.items).map((item) => ({ ...item, status: "requested" })),
    bookingDates: [],
    appointmentDateISO: "",
    startDateISO: "",
    endDateISO: "",
    requirementKey: record.requirementKey,
    sourceDueKey: record.requirementKey,
    sourceDueDateISO:
      list(record.items).map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] || "",
    sourceDueIsoWeek:
      list(record.items).map((item) => item.legalDueIsoWeek).filter(Boolean).sort()[0] || "",
    origin: record.origin,
    forecastYear: Number(record.forecastYear || record.sourceDueDateISO?.slice(0, 4) || 0) || null,
    scheduleManuallyAdjusted: false,
    createdBy,
    lastEditedBy: createdBy,
    history: [{
      action: "Due item created",
      user: createdBy,
      timestamp: nowISO,
      changes: [`Unarranged maintenance requirement created for ${record.sourceDueDateISO}.`],
    }],
    createdAt: nowISO,
    updatedAt: nowISO,
  };
};
