// Canonical maintenance record contract.
//
// Legal due dates describe when work must be completed. Booking dates describe
// when the work is planned. They are deliberately separate: rescheduling a
// diary appointment must never silently move a compliance deadline.

export const MAINTENANCE_RECORD_SCHEMA_VERSION = 1;

export const MAINTENANCE_TYPE_IDS = Object.freeze([
  "mot",
  "service",
  "pmi",
  "brake_test",
  "repair",
  "work",
  "tacho_inspection",
  "tacho_download",
  "tail_lift",
  "loler",
  "other",
]);

export const MAINTENANCE_RECORD_STATUSES = Object.freeze([
  "requested",
  "booked",
  "in_progress",
  "completed",
  "cancelled",
  "deferred",
  "archived",
]);

export const MAINTENANCE_SCHEDULE_RULES = Object.freeze({
  mot: Object.freeze({
    nextDueSource: "dvsa",
    warningWeeks: 3,
    autoVorAfterDueWeek: true,
  }),
  service: Object.freeze({
    nextDueSource: "completion",
    intervalMonths: 12,
    warningWeeks: 4,
    autoVorAfterDueWeek: false,
  }),
  pmi: Object.freeze({
    nextDueSource: "completion",
    intervalWeeks: 8,
    warningWeeks: 1,
    autoVorAfterDueWeek: true,
  }),
  brake_test: Object.freeze({
    nextDueSource: "completion",
    intervalWeeks: 8,
    warningWeeks: 1,
    autoVorAfterDueWeek: true,
  }),
});

const text = (value) => String(value || "").trim();
const safeArray = (value) => (Array.isArray(value) ? value : []);

const EVIDENCE_REQUIRED_TYPE_IDS = new Set(["pmi", "brake_test"]);

export const maintenanceDateOnly = (value) => {
  if (!value) return "";
  if (typeof value?.toDate === "function") return maintenanceDateOnly(value.toDate());
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }
  const iso = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : maintenanceDateOnly(parsed);
};

const localDate = (value) => {
  const match = maintenanceDateOnly(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (value, days) => {
  const date = localDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return maintenanceDateOnly(date);
};

const addCalendarMonths = (value, months) => {
  const date = localDate(value);
  if (!date) return "";
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(months || 0));
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return maintenanceDateOnly(date);
};

export const maintenanceIsoWeekParts = (value) => {
  const source = localDate(value);
  if (!source) return null;
  const date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year, week };
};

export const maintenanceIsoWeekLabel = (value) => {
  const parts = maintenanceIsoWeekParts(value);
  return parts ? `${parts.year}-W${String(parts.week).padStart(2, "0")}` : "";
};

export const maintenanceIsoWeekStart = (value) => {
  const date = localDate(value);
  if (!date) return "";
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return maintenanceDateOnly(date);
};

export const normalizeMaintenanceTypeId = (value) => {
  const raw = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    inspection: "pmi",
    eight_week_inspection: "pmi",
    eight_weekly_inspection: "pmi",
    brake: "brake_test",
    braketest: "brake_test",
    mot_test: "mot",
    annual_service: "service",
    repairs: "repair",
  };
  const normalized = aliases[raw] || raw;
  return MAINTENANCE_TYPE_IDS.includes(normalized) ? normalized : "other";
};

export const normalizeMaintenanceRecordStatus = (value) => {
  const raw = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (["complete", "closed", "done"].includes(raw)) return "completed";
  if (["planned", "appointment", "scheduled"].includes(raw)) return "booked";
  if (["deleted", "declined", "inactive"].includes(raw)) return "archived";
  if (["inprogress", "underway"].includes(raw)) return "in_progress";
  return MAINTENANCE_RECORD_STATUSES.includes(raw) ? raw : "requested";
};

const bookingDateKeys = (record = {}) => {
  const explicit = safeArray(record.bookingDates)
    .map(maintenanceDateOnly)
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)].sort();

  const single = maintenanceDateOnly(
    record.appointmentDateISO || record.appointmentDate || record.date
  );
  if (single) return [single];

  const start = maintenanceDateOnly(record.startDateISO || record.startDate);
  const end = maintenanceDateOnly(record.endDateISO || record.endDate || start);
  if (!start || !end) return [];

  const dates = [];
  let cursor = start;
  while (cursor && cursor <= end && dates.length < 370) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
};

const recordTypeIds = (record = {}) => {
  const explicit = safeArray(record.maintenanceTypeIds)
    .map(normalizeMaintenanceTypeId)
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];

  const explicitOne = text(record.maintenanceTypeId);
  if (explicitOne) return [normalizeMaintenanceTypeId(explicitOne)];

  const core = text(record.type || record.maintenanceType || record.kind).toUpperCase();
  if (core === "INSPECTION") return ["pmi", "brake_test"];
  if (core === "MOT") return ["mot"];
  if (core === "SERVICE") return ["service"];
  if (core === "REPAIR") return ["repair"];
  if (core === "WORK" || core === "MAINTENANCE") return ["work"];
  return ["other"];
};

const itemForType = (record, maintenanceTypeId, recordStatus) => {
  const existing = safeArray(record.items).find(
    (item) => normalizeMaintenanceTypeId(item?.maintenanceTypeId || item?.type) === maintenanceTypeId
  ) || {};
  const legalDueDateISO = maintenanceDateOnly(
    existing.legalDueDateISO ||
      existing.sourceDueDateISO ||
      existing.dueDateISO ||
      record.sourceDueDateISO ||
      record.sourceDueDate
  );
  return {
    maintenanceTypeId,
    status: normalizeMaintenanceRecordStatus(existing.status || recordStatus),
    result: text(existing.result || record.result).toLowerCase(),
    legalDueDateISO,
    legalDueIsoWeek:
      text(existing.legalDueIsoWeek || existing.sourceDueIsoWeek || record.sourceDueIsoWeek) ||
      maintenanceIsoWeekLabel(legalDueDateISO),
    completionDateISO: maintenanceDateOnly(
      existing.completionDateISO || existing.completedDate || record.completedAtISO
    ),
    nextDueDateISO: maintenanceDateOnly(existing.nextDueDateISO || existing.nextDueDate),
    evidenceStatus: text(existing.evidenceStatus || "").toLowerCase() || "not_recorded",
    documents: safeArray(existing.documents).filter(Boolean),
  };
};

export const maintenanceRequirementKey = ({
  companyId = "",
  vehicleId = "",
  items = [],
  maintenanceTypeIds = [],
  legalDueDateISO = "",
  legalDueIsoWeek = "",
} = {}) => {
  const normalizedItems = safeArray(items)
    .map((item) => ({
      maintenanceTypeId: normalizeMaintenanceTypeId(item?.maintenanceTypeId || item?.type),
      legalDueDateISO: maintenanceDateOnly(
        item?.legalDueDateISO || item?.sourceDueDateISO || item?.dueDateISO || legalDueDateISO
      ),
      legalDueIsoWeek:
        text(item?.legalDueIsoWeek || item?.sourceDueIsoWeek || legalDueIsoWeek) ||
        maintenanceIsoWeekLabel(
          item?.legalDueDateISO || item?.sourceDueDateISO || item?.dueDateISO || legalDueDateISO
        ),
    }))
    .filter((item) => item.maintenanceTypeId !== "other");
  const fallbackItems = safeArray(maintenanceTypeIds).map((typeId) => ({
    maintenanceTypeId: normalizeMaintenanceTypeId(typeId),
    legalDueDateISO: maintenanceDateOnly(legalDueDateISO),
    legalDueIsoWeek: text(legalDueIsoWeek) || maintenanceIsoWeekLabel(legalDueDateISO),
  }));
  const itemParts = (normalizedItems.length ? normalizedItems : fallbackItems)
    .map(
      (item) =>
        `${item.maintenanceTypeId}@${item.legalDueDateISO || item.legalDueIsoWeek || "unscheduled"}`
    )
    .sort();
  const asset = text(vehicleId);
  if (!asset || !itemParts.length) return "";
  return ["maintenance-requirement-v1", text(companyId) || "legacy", asset, itemParts.join("+")].join("|");
};

export const maintenanceRequirementDocumentId = (requirementKey) => {
  const value = text(requirementKey);
  if (!value) return "";
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `req_${(hash >>> 0).toString(36)}_${value.length.toString(36)}`;
};

export const buildRequestedMaintenanceRecord = ({
  companyId = "",
  vehicleId = "",
  vehicleLabel = "",
  items = [],
  maintenanceTypeIds = [],
  legalDueDateISO = "",
  legalDueIsoWeek = "",
  source = "maintenance_schedule",
  sourceId = "",
  workshop = null,
} = {}) => {
  const normalizedItems = (safeArray(items).length
    ? safeArray(items)
    : safeArray(maintenanceTypeIds).map((maintenanceTypeId) => ({
        maintenanceTypeId,
        legalDueDateISO,
        legalDueIsoWeek,
      })))
    .map((item) => {
      const dueDate = maintenanceDateOnly(item?.legalDueDateISO || legalDueDateISO);
      return {
        maintenanceTypeId: normalizeMaintenanceTypeId(item?.maintenanceTypeId || item?.type),
        status: "requested",
        result: "",
        legalDueDateISO: dueDate,
        legalDueIsoWeek:
          text(item?.legalDueIsoWeek || legalDueIsoWeek) || maintenanceIsoWeekLabel(dueDate),
        completionDateISO: "",
        nextDueDateISO: "",
        evidenceStatus: "not_recorded",
        documents: [],
      };
    })
    .filter((item) => item.maintenanceTypeId !== "other");
  const requirementKey = maintenanceRequirementKey({ companyId, vehicleId, items: normalizedItems });
  const typeIds = normalizedItems.map((item) => item.maintenanceTypeId);
  const coreType = typeIds.every((typeId) => typeId === "mot")
    ? "MOT"
    : typeIds.every((typeId) => typeId === "service")
    ? "SERVICE"
    : typeIds.some((typeId) => ["repair", "work"].includes(typeId))
    ? "WORK"
    : "INSPECTION";
  const firstDueDate = normalizedItems.map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] || "";
  const firstDueWeek = normalizedItems.map((item) => item.legalDueIsoWeek).filter(Boolean).sort()[0] || "";
  return {
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    companyId: text(companyId),
    vehicleId: text(vehicleId),
    vehicleLabel: text(vehicleLabel),
    kind: "MAINTENANCE",
    type: coreType,
    maintenanceTypeId: typeIds.length === 1 ? typeIds[0] : "combined",
    maintenanceTypeIds: typeIds,
    sourceDueDateISO: firstDueDate,
    sourceDueIsoWeek: firstDueWeek,
    equipment: [],
    status: "requested",
    items: normalizedItems,
    schedule: {
      bookingDates: [],
      appointmentDateISO: "",
      startDateISO: "",
      endDateISO: "",
      bookedIsoWeeks: [],
    },
    requirementKey,
    sourceDueKey: requirementKey,
    origin: { source: text(source) || "maintenance_schedule", sourceId: text(sourceId) },
    workshop: workshop && typeof workshop === "object" ? { ...workshop } : null,
    audit: { createdAt: "", createdBy: "system", updatedAt: "", updatedBy: "system", history: [] },
    legacy: { sourceCollection: "", sourceId: text(sourceId), sourceDueKey: requirementKey },
};
};

export const buildScheduledMaintenanceBooking = (options = {}) => {
  const requested = buildRequestedMaintenanceRecord(options);
  const appointmentDateISO =
    maintenanceDateOnly(options.appointmentDateISO) ||
    requested.items.map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] ||
    "";
  const bookedIsoWeek = maintenanceIsoWeekLabel(appointmentDateISO);
  return {
    ...requested,
    status: "booked",
    items: requested.items.map((item) => ({ ...item, status: "booked" })),
    schedule: {
      bookingDates: appointmentDateISO ? [appointmentDateISO] : [],
      appointmentDateISO,
      startDateISO: "",
      endDateISO: "",
      bookedIsoWeeks: bookedIsoWeek ? [bookedIsoWeek] : [],
    },
  };
};

export const maintenanceCompletionEvidenceIssues = (
  canonicalRecord,
  maintenanceTypeIds = [],
  documentsByType = {}
) => {
  const selected = new Set(safeArray(maintenanceTypeIds).map(normalizeMaintenanceTypeId));
  return safeArray(canonicalRecord?.items)
    .filter(
      (item) => selected.has(item.maintenanceTypeId) && EVIDENCE_REQUIRED_TYPE_IDS.has(item.maintenanceTypeId)
    )
    .filter((item) => {
      const attached = [
        ...safeArray(item.documents),
        ...safeArray(documentsByType?.[item.maintenanceTypeId]),
      ].filter(Boolean);
      return item.evidenceStatus !== "attached" && attached.length === 0;
    })
    .map((item) => `missing_evidence:${item.maintenanceTypeId}`);
};

export const normalizeMaintenanceRecord = (record = {}, { id = "" } = {}) => {
  const status = normalizeMaintenanceRecordStatus(record.status);
  const dates = bookingDateKeys(record);
  const first = dates[0] || "";
  const last = dates.at(-1) || first;
  const typeIds = recordTypeIds(record);

  const items = typeIds.map((typeId) => itemForType(record, typeId, status));
  const explicitRequirementKey = text(record.requirementKey);
  const computedRequirementKey = maintenanceRequirementKey({
      companyId: record.companyId,
      vehicleId: record.vehicleId || record.assetId,
      items,
    });
  const requirementKey = explicitRequirementKey.startsWith("maintenance-requirement-v1|")
    ? explicitRequirementKey
    : computedRequirementKey || explicitRequirementKey || text(record.sourceDueKey);

  return {
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    id: text(id || record.id),
    companyId: text(record.companyId),
    vehicleId: text(record.vehicleId || record.assetId),
    vehicleLabel: text(record.vehicleLabel || record.assetLabel),
    equipment: safeArray(record.equipment).filter(Boolean),
    status,
    items,
    schedule: {
      bookingDates: dates,
      appointmentDateISO: dates.length === 1 ? first : "",
      startDateISO: dates.length > 1 ? first : "",
      endDateISO: dates.length > 1 ? last : "",
      bookedIsoWeeks: [...new Set(dates.map(maintenanceIsoWeekLabel).filter(Boolean))],
    },
    audit: {
      createdAt: record.createdAt || "",
      createdBy: text(record.createdBy),
      updatedAt: record.updatedAt || "",
      updatedBy: text(record.lastEditedBy || record.updatedBy),
      history: safeArray(record.history),
    },
    requirementKey,
    origin: {
      source: text(record.origin?.source || record.source || record.sourceCollection),
      sourceId: text(record.origin?.sourceId || record.sourceRef || record.sourceId),
    },
    workshop:
      record.workshop && typeof record.workshop === "object"
        ? { ...record.workshop }
        : record.assetId || record.plannedDate || record.priority
        ? {
            title: text(record.title),
            priority: text(record.priority || "normal").toLowerCase(),
            plannedDateISO: maintenanceDateOnly(record.plannedDate),
            dueDateISO: maintenanceDateOnly(record.dueDate),
            provider: text(record.provider),
            assignedToName: text(record.assignedToName),
            completionNotes: text(record.completionNotes),
            totalCost: text(record.totalCost),
            poNumber: text(record.poNumber),
            invoiceRef: text(record.invoiceRef),
          }
        : null,
    legacy: {
      sourceCollection: text(record.sourceCollection),
      sourceId: text(record.sourceId || id || record.id),
      sourceDueKey: text(record.sourceDueKey),
    },
  };
};

export const validateMaintenanceRecord = (record = {}) => {
  const issues = [];
  if (record.schemaVersion !== MAINTENANCE_RECORD_SCHEMA_VERSION) issues.push("unsupported_schema_version");
  if (!text(record.vehicleId) && !safeArray(record.equipment).length) issues.push("missing_asset_link");
  if (!safeArray(record.items).length) issues.push("missing_maintenance_items");
  if (["booked", "in_progress"].includes(record.status) && !record.schedule?.bookingDates?.length) {
    issues.push("active_record_missing_booking_date");
  }
  const seen = new Set();
  safeArray(record.items).forEach((item) => {
    const typeId = normalizeMaintenanceTypeId(item?.maintenanceTypeId);
    if (seen.has(typeId)) issues.push(`duplicate_item:${typeId}`);
    seen.add(typeId);
    if (item?.legalDueDateISO && item?.legalDueIsoWeek && maintenanceIsoWeekLabel(item.legalDueDateISO) !== item.legalDueIsoWeek) {
      issues.push(`due_week_mismatch:${typeId}`);
    }
    if (item?.status === "completed" && !item?.completionDateISO) {
      issues.push(`completed_item_missing_date:${typeId}`);
    }
  });
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
};

export const calculateNextMaintenanceDue = ({
  maintenanceTypeId,
  completedDate,
  dvsaExpiryDate = "",
  frequencyWeeks = 0,
  frequencyMonths = 0,
} = {}) => {
  const typeId = normalizeMaintenanceTypeId(maintenanceTypeId);
  const completed = maintenanceDateOnly(completedDate);
  if (typeId === "mot") return maintenanceDateOnly(dvsaExpiryDate);
  if (!completed) return "";
  if (Number(frequencyWeeks) > 0) return addDays(completed, Number(frequencyWeeks) * 7);
  if (typeId === "service") return addCalendarMonths(completed, 12);
  if (typeId === "pmi" || typeId === "brake_test") return addDays(completed, 8 * 7);
  if (Number(frequencyMonths) > 0) return addCalendarMonths(completed, Number(frequencyMonths));
  return "";
};

const recurrenceInputForType = (maintenanceTypeId, vehicle = {}) => {
  const typeId = normalizeMaintenanceTypeId(maintenanceTypeId);
  const frequencyFields = {
    service: ["serviceFreq"],
    pmi: ["pmiFreq", "eightWeekInspectionFreq"],
    brake_test: ["brakeTestFreq"],
    tacho_inspection: ["tachoFreq", "tachoInspectionFreq"],
    tacho_download: ["tachoDownloadFreq"],
    tail_lift: ["tailLiftFreq"],
    loler: ["lolerFreq", "lOLERFreq"],
  }[typeId] || [];
  const frequencyWeeks = frequencyFields
    .map((field) => Number(vehicle?.[field] || 0))
    .find((value) => value > 0) || 0;
  const dvsaExpiryDate = [
    vehicle?.nextMOT,
    vehicle?.nextMot,
    vehicle?.motExpiryDate,
    vehicle?.dvsaMotExpiryDate,
  ]
    .map(maintenanceDateOnly)
    .find(Boolean) || "";
  return { typeId, frequencyWeeks, dvsaExpiryDate };
};

export const buildNextRequestedMaintenanceRecords = ({
  canonicalRecord,
  completedTypeIds = [],
  completionDateISO = "",
  vehicle = {},
} = {}) => {
  const selected = new Set(safeArray(completedTypeIds).map(normalizeMaintenanceTypeId));
  const completedDate = maintenanceDateOnly(completionDateISO);
  if (!canonicalRecord || !completedDate || !selected.size) return [];

  const nextItems = safeArray(canonicalRecord.items)
    .filter((item) => selected.has(item.maintenanceTypeId))
    .map((item) => {
      const recurrence = recurrenceInputForType(item.maintenanceTypeId, vehicle);
      const nextDueDateISO = calculateNextMaintenanceDue({
        maintenanceTypeId: item.maintenanceTypeId,
        completedDate,
        dvsaExpiryDate: recurrence.dvsaExpiryDate,
        frequencyWeeks: recurrence.frequencyWeeks,
      });
      if (!nextDueDateISO || nextDueDateISO <= completedDate) return null;
      return {
        maintenanceTypeId: item.maintenanceTypeId,
        legalDueDateISO: nextDueDateISO,
        legalDueIsoWeek: maintenanceIsoWeekLabel(nextDueDateISO),
      };
    })
    .filter(Boolean);

  const groups = new Map();
  nextItems.forEach((item) => {
    const combineInspection = ["pmi", "brake_test"].includes(item.maintenanceTypeId);
    const key = combineInspection
      ? `inspection:${item.legalDueIsoWeek}`
      : `${item.maintenanceTypeId}:${item.legalDueDateISO}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  });

  return [...groups.values()].map((items) =>
    buildScheduledMaintenanceBooking({
      companyId: canonicalRecord.companyId,
      vehicleId: canonicalRecord.vehicleId,
      vehicleLabel: canonicalRecord.vehicleLabel,
      items,
      appointmentDateISO: items.map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] || "",
      source: "completion_recurrence",
      sourceId: canonicalRecord.id,
    })
  );
};

export const getMaintenanceDueState = ({ maintenanceTypeId, dueDate, asOfDate = new Date() } = {}) => {
  const typeId = normalizeMaintenanceTypeId(maintenanceTypeId);
  const due = maintenanceDateOnly(dueDate);
  const asOf = maintenanceDateOnly(asOfDate);
  const dueWeekStart = maintenanceIsoWeekStart(due);
  const asOfValue = localDate(asOf)?.getTime();
  if (!due || !dueWeekStart || !asOfValue) {
    return { state: "missing", warning: false, vorRequired: false, dueIsoWeek: "" };
  }
  const rule = MAINTENANCE_SCHEDULE_RULES[typeId] || {};
  const warningStart = addDays(dueWeekStart, -(Number(rule.warningWeeks || 0) * 7));
  const overdueStart = addDays(dueWeekStart, 7);
  const asOfTime = localDate(asOf).getTime();
  const overdue = asOfTime >= localDate(overdueStart).getTime();
  const dueNow = asOfTime >= localDate(dueWeekStart).getTime();
  const warning = asOfTime >= localDate(warningStart).getTime();
  return {
    state: overdue ? "overdue" : dueNow ? "due" : warning ? "warning" : "upcoming",
    warning,
    vorRequired: overdue && rule.autoVorAfterDueWeek === true,
    dueIsoWeek: maintenanceIsoWeekLabel(due),
    warningStartDateISO: warningStart,
    overdueStartDateISO: overdueStart,
  };
};

export const buildMaintenanceReschedule = (canonicalRecord, bookingDates = []) => {
  const dates = [...new Set(safeArray(bookingDates).map(maintenanceDateOnly).filter(Boolean))].sort();
  const first = dates[0] || "";
  const last = dates.at(-1) || first;
  return {
    ...canonicalRecord,
    schedule: {
      bookingDates: dates,
      appointmentDateISO: dates.length === 1 ? first : "",
      startDateISO: dates.length > 1 ? first : "",
      endDateISO: dates.length > 1 ? last : "",
      bookedIsoWeeks: [...new Set(dates.map(maintenanceIsoWeekLabel).filter(Boolean))],
    },
    // Items, including their legal due dates, are intentionally untouched.
    items: safeArray(canonicalRecord?.items).map((item) => ({ ...item })),
  };
};

export const completeCanonicalMaintenanceItems = (
  canonicalRecord,
  maintenanceTypeIds = [],
  completedDate,
  { documentsByType = {} } = {}
) => {
  const completionDateISO = maintenanceDateOnly(completedDate);
  const selected = new Set(
    safeArray(maintenanceTypeIds).map(normalizeMaintenanceTypeId).filter((typeId) => typeId !== "other")
  );
  if (!completionDateISO || !selected.size) {
    return {
      ...canonicalRecord,
      items: safeArray(canonicalRecord?.items).map((item) => ({ ...item })),
      completedTypeIds: [],
      allCompleted: false,
    };
  }
  const completedTypeIds = [];
  const items = safeArray(canonicalRecord?.items).map((item) => {
    if (!selected.has(item.maintenanceTypeId)) return { ...item };
    const documents = [
      ...safeArray(item.documents),
      ...safeArray(documentsByType?.[item.maintenanceTypeId]),
    ].filter(Boolean);
    completedTypeIds.push(item.maintenanceTypeId);
    return {
      ...item,
      status: "completed",
      result: "passed",
      completionDateISO,
      evidenceStatus: documents.length ? "attached" : item.evidenceStatus === "attached" ? "attached" : "pending",
      documents,
    };
  });
  return {
    ...canonicalRecord,
    items,
    completedTypeIds,
    allCompleted: items.length > 0 && items.every((item) => item.status === "completed"),
  };
};
