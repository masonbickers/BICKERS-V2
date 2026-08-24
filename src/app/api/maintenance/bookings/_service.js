import "server-only";

import crypto from "node:crypto";

import {
  adminCommitDocumentPatches,
  adminCommitDocumentPatchesWithSequence,
  adminListDocuments,
  adminReadDocument,
  adminReadDocumentWithMetadata,
} from "@/app/api/_firebaseAdminRest";
import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  RECURRING_MAINTENANCE_WORKFLOWS,
  getConfiguredMaintenanceFrequencyWeeks,
} from "@/app/utils/maintenanceSchema";
import { buildAdditionalMaintenanceCompletionPatch } from "@/app/utils/additionalMaintenanceCompletion";
import {
  maintenanceDocumentId,
  normalizeMaintenanceDocumentList,
} from "@/app/utils/maintenanceDocuments";
import {
  buildAnnualMaintenanceForecast,
  buildAnnualMaintenancePersistencePayload,
  reconcileAnnualMaintenanceForecast,
} from "@/app/utils/maintenanceForecast";
import {
  buildMaintenanceBickersReference,
  buildRequestedMaintenanceRecord,
  buildNextRequestedMaintenanceRecords,
  calculateNextMaintenanceDue,
  completeCanonicalMaintenanceItems,
  formatMaintenanceBickersReference,
  maintenanceDateOnly,
  maintenanceIsoWeekLabel,
  maintenanceRequirementDocumentId,
  normalizeMaintenanceRecord,
  normalizeMaintenanceRecordStatus,
  normalizeMaintenanceTypeId,
} from "@/app/utils/maintenanceRecord";
import {
  buildVorInspectionCancellationPatch,
  getVorInspectionCancellationCandidates,
} from "@/app/utils/vorBookingPolicy";
import {
  assertInitialMaintenanceStatus,
  assertMaintenanceTransition,
  buildAtomicRescheduleWriteSet,
  getMaintenanceScheduleRule,
} from "@/app/utils/maintenanceMutationPolicy";
import {
  addHistoricVorPeriod,
  archiveVehicleHistoricVorPeriod,
  correctVehicleHistoricVorPeriod,
  historicVorFirstUseBookingIntent,
  releaseVehicleAfterCompletedCompliance,
  scheduleVehicleReturnInspection,
  startVehicleVorPeriod,
  vehicleReturnInspectionBookingIntent,
} from "@/app/utils/vorPeriods";

const text = (value) => String(value || "").trim();
const safeArray = (value) => (Array.isArray(value) ? value : []);
const withBickersReference = (record, id) => ({
  ...record,
  bickersReference: buildMaintenanceBickersReference(record, { id }),
});
const commitMaintenanceWrites = (writes, companyId = "") => {
  const newBookingIndexes = writes
    .map((write, index) => ({ write, index }))
    .filter(({ write }) =>
      write.collection === "maintenanceBookings" &&
      (write.exists === false ||
        (Object.prototype.hasOwnProperty.call(write.patch || {}, "bickersReference") &&
          !text(write.patch?.bickersReference))) &&
      !/^\d{6,}$/.test(text(write.patch?.bickersReference))
    )
    .map(({ index }) => index);
  if (!newBookingIndexes.length) return adminCommitDocumentPatches(writes);
  const sequenceByIndex = new Map(newBookingIndexes.map((index, offset) => [index, offset]));
  return adminCommitDocumentPatchesWithSequence({
    writes,
    counterCollection: "systemCounters",
    counterDocumentId: `maintenance_${text(companyId) || "default"}`,
    allocationCount: newBookingIndexes.length,
    applySequence: (pendingWrites, firstSequence) => pendingWrites.map((write, index) => {
      const offset = sequenceByIndex.get(index);
      if (offset === undefined) return write;
      return {
        ...write,
        patch: {
          ...write.patch,
          bickersReference: formatMaintenanceBickersReference(firstSequence + offset),
        },
      };
    }),
  });
};
const nowISO = () => new Date().toISOString();
const titleStatus = (status) => ({
  requested: "Requested",
  booked: "Booked",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  deferred: "Deferred",
  archived: "Archived",
}[status] || "Requested");

const coreType = (type, typeIds = []) => {
  const requested = text(type).toUpperCase();
  if (["MOT", "SERVICE", "INSPECTION", "WORK"].includes(requested)) return requested;
  if (typeIds.length === 1 && typeIds[0] === "mot") return "MOT";
  if (typeIds.length === 1 && typeIds[0] === "service") return "SERVICE";
  if (typeIds.some((id) => ["pmi", "brake_test", "tacho_inspection", "tacho_download", "tail_lift", "loler", "tacho_calibration"].includes(id))) return "INSPECTION";
  return "WORK";
};

const inputTypeIds = (payload = {}) => {
  const type = coreType(payload.type);
  const values = safeArray(payload.maintenanceTypeIds).map(normalizeMaintenanceTypeId).filter((id) => id !== "other");
  if (values.length) return [...new Set(values)];
  if (type === "MOT") return ["mot"];
  if (type === "SERVICE") return ["service"];
  if (type === "INSPECTION") return ["pmi", "brake_test"];
  return [normalizeMaintenanceTypeId(payload.maintenanceTypeId || "work")];
};

const bookingDates = (payload = {}) => {
  const explicit = safeArray(payload.dateKeys || payload.bookingDates).map(maintenanceDateOnly).filter(Boolean);
  if (explicit.length) return [...new Set(explicit)].sort();
  const appointment = maintenanceDateOnly(payload.appointmentDate || payload.appointmentDateISO);
  if (appointment) return [appointment];
  const start = maintenanceDateOnly(payload.startDate || payload.startDateISO);
  const end = maintenanceDateOnly(payload.endDate || payload.endDateISO || start);
  if (!start || !end || start > end) return [];
  const dates = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const finish = new Date(`${end}T12:00:00Z`);
  while (cursor <= finish && dates.length < 370) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const scheduleFields = (dates, appointmentTime = "") => ({
  bookingDates: dates,
  appointmentDateISO: dates.length === 1 ? dates[0] : "",
  appointmentDate: dates.length === 1 ? dates[0] : null,
  appointmentTime: /^\d{2}:\d{2}$/.test(text(appointmentTime)) ? text(appointmentTime) : "",
  startDateISO: dates.length > 1 ? dates[0] : "",
  startDate: dates.length > 1 ? dates[0] : null,
  endDateISO: dates.length > 1 ? dates.at(-1) : "",
  endDate: dates.length > 1 ? dates.at(-1) : null,
  isMultiDay: dates.length > 1,
});

const historyEntry = (action, actor, changes, timestamp = nowISO()) => ({
  action,
  user: actor.email || actor.uid,
  userUid: actor.uid,
  timestamp,
  changes: safeArray(changes).filter(Boolean),
});

const assertTenant = (record, companyId) => {
  if (companyId && record?.companyId && text(record.companyId) !== companyId) {
    const error = new Error("Maintenance record belongs to another company.");
    error.status = 403;
    throw error;
  }
};

const readContext = async (bookingId, companyId) => {
  const bookingSnapshot = await adminReadDocumentWithMetadata("maintenanceBookings", bookingId);
  if (!bookingSnapshot) {
    const error = new Error("Maintenance booking not found.");
    error.status = 404;
    throw error;
  }
  const booking = bookingSnapshot.data;
  assertTenant(booking, companyId);
  const vehicleId = text(booking.vehicleId);
  const vehicle = vehicleId ? await adminReadDocument("vehicles", vehicleId) : null;
  if (vehicle) assertTenant(vehicle, companyId);
  return {
    booking: { id: bookingId, ...booking },
    bookingUpdateTime: bookingSnapshot.updateTime,
    vehicle: vehicle ? { id: vehicleId, ...vehicle } : null,
  };
};

const clearSummary = (vehicle = {}, bookingId = "") => {
  const patch = {};
  const groups = [
    ["mot", ["BookingId", "BookedStatus", "BookedOn", "AppointmentDate", "AppointmentTime", "BookingStartDate", "BookingEndDate"]],
    ["service", ["BookingId", "BookedStatus", "BookedOn", "AppointmentDate", "AppointmentTime", "BookingStartDate", "BookingEndDate"]],
    ["inspection", ["BookingId", "BookedStatus", "BookedOn", "AppointmentDate", "AppointmentTime", "BookingStartDate", "BookingEndDate"]],
    ["work", ["BookingId", "BookedStatus", "BookingDate", "BookingTime", "BookingStartDate", "BookingEndDate"]],
  ];
  groups.forEach(([prefix, suffixes]) => {
    if (text(vehicle[`${prefix}BookingId`]) !== text(bookingId)) return;
    suffixes.forEach((suffix) => { patch[`${prefix}${suffix}`] = ""; });
  });
  return patch;
};

const bookingSummaryPatch = (booking, dates, status) => {
  const ids = inputTypeIds(booking);
  const type = coreType(booking.type, ids);
  const prefix = type === "MOT" ? "mot" : type === "SERVICE" ? "service" : type === "INSPECTION" ? "inspection" : "work";
  const isWork = prefix === "work";
  return {
    [`${prefix}BookingId`]: booking.id,
    [`${prefix}BookedStatus`]: titleStatus(status),
    [`${prefix}${isWork ? "BookingDate" : "AppointmentDate"}`]: dates.length === 1 ? dates[0] : "",
    [`${prefix}${isWork ? "BookingTime" : "AppointmentTime"}`]: text(booking.appointmentTime),
    [`${prefix}BookingStartDate`]: dates.length > 1 ? dates[0] : "",
    [`${prefix}BookingEndDate`]: dates.length > 1 ? dates.at(-1) : "",
  };
};

const canonicalItems = ({ typeIds, status, dueDate, dueWeek, existing = [] }) => {
  const prior = new Map(safeArray(existing).map((item) => [normalizeMaintenanceTypeId(item.maintenanceTypeId), item]));
  return typeIds.map((maintenanceTypeId) => ({
    ...(prior.get(maintenanceTypeId) || {}),
    maintenanceTypeId,
    status,
    legalDueDateISO: maintenanceDateOnly(prior.get(maintenanceTypeId)?.legalDueDateISO || dueDate),
    legalDueIsoWeek: text(prior.get(maintenanceTypeId)?.legalDueIsoWeek || dueWeek) || maintenanceIsoWeekLabel(dueDate),
    completionDateISO: "",
    evidenceStatus: text(prior.get(maintenanceTypeId)?.evidenceStatus) || "not_recorded",
    documents: safeArray(prior.get(maintenanceTypeId)?.documents),
  }));
};

const createMutation = async ({ payload, actor, companyId }) => {
  const status = assertInitialMaintenanceStatus(payload.status || "booked");
  const dates = bookingDates(payload);
  if (status === "booked" && !dates.length) throw new Error("A booked maintenance appointment needs a valid date.");
  const typeIds = inputTypeIds(payload);
  const id = text(payload.requestedRecordId) || maintenanceRequirementDocumentId(text(payload.sourceDueKey)) || crypto.randomUUID();
  const existingSnapshot = await adminReadDocumentWithMetadata("maintenanceBookings", id);
  const existing = existingSnapshot?.data || null;
  if (existing) {
    assertTenant(existing, companyId);
    const existingCanonical = normalizeMaintenanceRecord(existing, { id });
    const existingStatus = existingCanonical.status;
    const sameTypeIds = [...existingCanonical.items.map((item) => item.maintenanceTypeId)].sort().join("|") ===
      [...typeIds].sort().join("|");
    const sameDates = existingCanonical.schedule.bookingDates.join("|") === dates.join("|");
    const sameVehicle = text(existingCanonical.vehicleId) === text(payload.vehicleId || existingCanonical.vehicleId);
    if (existingStatus === "booked" && status === "booked" && sameTypeIds && sameDates && sameVehicle) {
      return { id, ...existing, idempotent: true };
    }
    if (existingStatus !== "requested") {
      throw new Error(`Existing ${existingStatus} maintenance records cannot be replaced through creation.`);
    }
  }
  const dueDate = maintenanceDateOnly(
    payload.sourceDueDate || payload.sourceDueDateISO || existing?.sourceDueDateISO
  );
  const dueWeek = text(payload.sourceDueIsoWeek || existing?.sourceDueIsoWeek) || maintenanceIsoWeekLabel(dueDate);
  const scheduleRule = getMaintenanceScheduleRule({
    type: coreType(payload.type, typeIds),
    legalDueDate: dueDate,
    legalDueWeeks: dueWeek ? [dueWeek] : [],
    bookingDates: dates,
  });
  if (scheduleRule.requiresAcknowledgement && payload.motExpiryAcknowledged !== true) {
    throw new Error("Acknowledge that the MOT will be expired on the appointment date before booking.");
  }
  if (scheduleRule.requiresExceptionReason && !text(payload.scheduleExceptionReason)) {
    throw new Error("A reason is required when moving an inspection outside the legal ISO week.");
  }
  const timestamp = nowISO();
  const arrangedNow = Boolean(existing && status === "booked" && dates.length);
  const record = withBickersReference({
    ...(existing || {}),
    schemaVersion: 1,
    kind: "MAINTENANCE",
    companyId: companyId || text(existing?.companyId),
    vehicleId: text(payload.vehicleId || existing?.vehicleId),
    vehicleLabel: text(payload.vehicleLabel || existing?.vehicleLabel),
    type: coreType(payload.type, typeIds),
    maintenanceTypeId: typeIds.length === 1 ? typeIds[0] : "combined",
    maintenanceTypeIds: typeIds,
    status: titleStatus(status),
    items: canonicalItems({ typeIds, status, dueDate, dueWeek, existing: existing?.items }),
    ...scheduleFields(dates, payload.appointmentTime),
    provider: text(payload.provider), bookingRef: text(payload.bookingRef), location: text(payload.location),
    cost: text(payload.cost), notes: text(payload.notes), equipment: safeArray(payload.equipment),
    ...(payload.workshop && typeof payload.workshop === "object" ? { workshop: payload.workshop, title: text(payload.title) } : {}),
    sourceDueDateISO: dueDate, sourceDueIsoWeek: dueWeek, sourceDueKey: text(payload.sourceDueKey),
    requirementKey: text(existing?.requirementKey || payload.sourceDueKey),
    scheduleExceptionReason: text(payload.scheduleExceptionReason),
    motExpiryAcknowledged: scheduleRule.requiresAcknowledgement,
    motExpiryAcknowledgedAt: scheduleRule.requiresAcknowledgement ? timestamp : "",
    motExpiryAcknowledgedBy: scheduleRule.requiresAcknowledgement ? actor.email : "",
    motExpiryAcknowledgedByUid: scheduleRule.requiresAcknowledgement ? actor.uid : "",
    createdAt: existing?.createdAt || timestamp,
    createdBy: existing?.createdBy || actor.email,
    createdByUid: existing?.createdByUid || actor.uid,
    ...(arrangedNow
      ? { arrangedAt: timestamp, arrangedBy: actor.email, arrangedByUid: actor.uid }
      : {}),
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(existing?.history), historyEntry(arrangedNow ? "Workshop date confirmed" : existing ? "Booked" : "Created", actor, [
      `Status: ${titleStatus(status)}`,
      arrangedNow ? `Workshop date: ${dates.join(", ")}` : "",
      dueDate ? `Legal due date: ${dueDate}` : "",
      scheduleRule.requiresAcknowledgement ? "Expired MOT appointment acknowledged" : "",
    ], timestamp)],
  }, id);
  const writes = [{
    collection: "maintenanceBookings",
    documentId: id,
    patch: record,
    ...(existingSnapshot?.updateTime ? { updateTime: existingSnapshot.updateTime } : { exists: false }),
  }];
  const vehicle = record.vehicleId ? await adminReadDocument("vehicles", record.vehicleId) : null;
  if (vehicle) {
    assertTenant(vehicle, companyId);
    record.companyId = record.companyId || text(vehicle.companyId);
  }
  if (vehicle && status === "booked") writes.push({ collection: "vehicles", documentId: record.vehicleId, patch: { ...bookingSummaryPatch({ ...record, id }, dates, status), updatedAt: timestamp }, exists: true });
  await commitMaintenanceWrites(writes, companyId);
  return { id, ...record };
};

const rescheduleMutation = async ({ payload, actor, companyId }) => {
  const { booking, bookingUpdateTime, vehicle } = await readContext(text(payload.bookingId), companyId);
  const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
  if (!["booked", "in_progress", "deferred"].includes(canonical.status)) throw new Error("Only an active booked appointment can be rescheduled.");
  const dates = bookingDates(payload.updates || {});
  if (!dates.length) throw new Error("Choose a valid appointment date.");
  const legalWeeks = new Set(canonical.items.map((item) => item.legalDueIsoWeek).filter(Boolean));
  const legalDueDate = canonical.items.map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] || "";
  const scheduleRule = getMaintenanceScheduleRule({
    type: booking.type,
    legalDueDate,
    legalDueWeeks: [...legalWeeks],
    bookingDates: dates,
  });
  const reason = text(payload.reason);
  if (scheduleRule.requiresAcknowledgement && payload.motExpiryAcknowledged !== true) {
    throw new Error("Acknowledge that the MOT will be expired on the appointment date before booking.");
  }
  if (scheduleRule.requiresExceptionReason && !reason) throw new Error("A reason is required when moving an inspection outside the legal ISO week.");
  const timestamp = nowISO();
  const patch = {
    ...scheduleFields(dates, payload.updates?.appointmentTime || booking.appointmentTime),
    ...(booking.workshop && typeof booking.workshop === "object"
      ? { workshop: { ...booking.workshop, bookedDate: dates[0], plannedDate: dates[0] } }
      : {}),
    scheduleExceptionReason: scheduleRule.requiresExceptionReason ? reason : "",
    motExpiryAcknowledged: scheduleRule.requiresAcknowledgement,
    motExpiryAcknowledgedAt: scheduleRule.requiresAcknowledgement ? timestamp : "",
    motExpiryAcknowledgedBy: scheduleRule.requiresAcknowledgement ? actor.email : "",
    motExpiryAcknowledgedByUid: scheduleRule.requiresAcknowledgement ? actor.uid : "",
    scheduleManuallyAdjusted: true,
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(booking.history), historyEntry("Rescheduled", actor, [
      `Booking dates: ${canonical.schedule.bookingDates.join(", ") || "Unknown"} -> ${dates.join(", ")}`,
      reason ? `Reason: ${reason}` : "",
      scheduleRule.requiresAcknowledgement ? "Expired MOT appointment acknowledged" : "",
    ], timestamp)],
  };
  const vehiclePatch = vehicle
    ? { ...bookingSummaryPatch(booking, dates, canonical.status), updatedAt: timestamp }
    : null;
  const writes = buildAtomicRescheduleWriteSet({
    bookingId: booking.id,
    bookingPatch: patch,
    bookingUpdateTime,
    vehicleId: vehicle?.id,
    vehiclePatch,
  });
  await commitMaintenanceWrites(writes, companyId);
  return { id: booking.id, ...booking, ...patch, vehiclePatch: writes[1]?.patch || null };
};

const completionVehiclePatch = ({ booking, vehicle, typeIds, completedDate, documentsByType, actor, allCompleted }) => {
  if (!vehicle) return null;
  const timestamp = nowISO();
  const patch = { ...(allCompleted ? clearSummary(vehicle, booking.id) : {}), updatedAt: timestamp };
  if (typeIds.includes("mot")) {
    const documents = normalizeMaintenanceDocumentList(documentsByType?.mot, {
      maintenanceTypeId: "mot",
      sourceRecordId: booking.id,
      uploadedBy: actor,
    });
    patch.lastMOT = completedDate; patch.lastMot = completedDate; patch.lastMotDate = completedDate;
    patch.nextMOT = ""; patch.nextMot = ""; patch.nextMotDate = ""; patch.motDueDate = ""; patch.motExpiryDate = "";
    patch.motAwaitingDvsaConfirmation = true;
    patch.motAwaitingDvsaCompletionDate = completedDate;
    patch.motAwaitingDvsaSince = timestamp;
    patch.motAwaitingDvsaBookingId = booking.id;
    patch.motHistory = [...safeArray(vehicle.motHistory).filter((item) => text(item.bookingId) !== booking.id), {
      maintenanceTypeId: "mot", completedDate, bookingId: booking.id, source: "maintenance_booking",
      provider: text(booking.provider), bookingRef: text(booking.bookingRef), notes: text(booking.notes), documents, recordedAt: timestamp,
    }];
    if (documents.length) {
      const incomingIds = new Set(documents.map(maintenanceDocumentId));
      patch.motDocuments = [
        ...normalizeMaintenanceDocumentList(vehicle.motDocuments, { maintenanceTypeId: "mot" })
          .filter((document) => !incomingIds.has(maintenanceDocumentId(document))),
        ...documents,
      ];
    }
  }
  if (typeIds.includes("service")) {
    const documents = normalizeMaintenanceDocumentList(documentsByType?.service, {
      maintenanceTypeId: "service",
      sourceRecordId: booking.id,
      uploadedBy: actor,
    });
    patch.lastService = completedDate;
    patch.nextService = calculateNextMaintenanceDue({
      maintenanceTypeId: "service",
      completedDate,
      frequencyWeeks: getConfiguredMaintenanceFrequencyWeeks(vehicle, "service"),
    });
    patch.serviceISOWeek = patch.nextService ? maintenanceIsoWeekLabel(patch.nextService) : "";
    patch.serviceHistory = [...safeArray(vehicle.serviceHistory).filter((item) => text(item.bookingId) !== booking.id), {
      maintenanceTypeId: "service", completedDate, bookingId: booking.id, source: "maintenance_booking", documents, recordedAt: timestamp,
    }];
    if (documents.length) {
      const incomingIds = new Set(documents.map(maintenanceDocumentId));
      patch.serviceDocuments = [
        ...normalizeMaintenanceDocumentList(vehicle.serviceDocuments, { maintenanceTypeId: "service" })
          .filter((document) => !incomingIds.has(maintenanceDocumentId(document))),
        ...documents,
      ];
    }
  }
  const workflows = ADDITIONAL_MAINTENANCE_WORKFLOWS.filter((workflow) => typeIds.includes(workflow.maintenanceTypeId));
  if (workflows.length) Object.assign(patch, buildAdditionalMaintenanceCompletionPatch({
    vehicle: { ...vehicle, ...patch }, workflows, completedDate, completedAt: timestamp,
    documentsByKey: documentsByType, auditUser: actor, bookingId: booking.id,
    provider: booking.provider, bookingRef: booking.bookingRef, notes: booking.notes, source: "maintenance_booking",
  }) || {});
  return patch;
};

const completeMutation = async ({ payload, actor, companyId, selectedOnly }) => {
  const { booking, bookingUpdateTime, vehicle } = await readContext(text(payload.bookingId), companyId);
  const completedDate = maintenanceDateOnly(payload.completedISO);
  if (!completedDate) throw new Error("Enter the actual completion date.");
  const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
  if (canonical.status === "completed") {
    const sameCompletion = canonical.items
      .filter((item) => !selectedOnly || safeArray(payload.maintenanceTypeIds).map(normalizeMaintenanceTypeId).includes(item.maintenanceTypeId))
      .every((item) => item.status === "completed" && item.completionDateISO === completedDate);
    if (sameCompletion) {
      const recurrence = buildNextRequestedMaintenanceRecords({
        canonicalRecord: canonical,
        completedTypeIds: canonical.items.map((item) => item.maintenanceTypeId),
        completionDateISO: completedDate,
        vehicle: vehicle || {},
      });
      if (canonical.items.some((item) => item.maintenanceTypeId === "mot")) {
        const confirmedDueDate = maintenanceDateOnly(
          vehicle?.nextMOT || vehicle?.nextMot || vehicle?.motExpiryDate
        );
        if (confirmedDueDate) {
          recurrence.push(buildRequestedMaintenanceRecord({
            companyId: canonical.companyId,
            vehicleId: canonical.vehicleId,
            vehicleLabel: canonical.vehicleLabel,
            items: [{ maintenanceTypeId: "mot", legalDueDateISO: confirmedDueDate }],
            source: "dvsa_reconciliation",
            sourceId: booking.id,
          }));
        }
      }
      return {
        id: booking.id,
        ...booking,
        idempotent: true,
        nextRequestedRecordIds: recurrence
          .map((record) => maintenanceRequirementDocumentId(record.requirementKey))
          .filter(Boolean),
        recurrenceStatus: "completed",
      };
    }
  }
  if (!["booked", "in_progress", "deferred"].includes(canonical.status)) throw new Error("Only an active booked appointment can be completed.");
  const selected = selectedOnly
    ? safeArray(payload.maintenanceTypeIds).map(normalizeMaintenanceTypeId)
    : canonical.items.filter((item) => item.status !== "completed").map((item) => item.maintenanceTypeId);
  const selectedItems = selected
    .map((id) => canonical.items.find((item) => item.maintenanceTypeId === id))
    .filter(Boolean);
  if (
    selectedItems.length > 0 &&
    selectedItems.every((item) => item.status === "completed" && item.completionDateISO === completedDate)
  ) {
    const recurrence = buildNextRequestedMaintenanceRecords({
      canonicalRecord: canonical,
      completedTypeIds: selected,
      completionDateISO: completedDate,
      vehicle: vehicle || {},
    });
    return {
      id: booking.id,
      ...booking,
      idempotent: true,
      nextRequestedRecordIds: recurrence
        .map((record) => maintenanceRequirementDocumentId(record.requirementKey))
        .filter(Boolean),
      recurrenceStatus: "completed",
    };
  }
  const available = selected.filter((id) => canonical.items.some((item) => item.maintenanceTypeId === id && item.status !== "completed"));
  if (!available.length) throw new Error("Select at least one incomplete maintenance item.");
  const completed = completeCanonicalMaintenanceItems(canonical, available, completedDate, { documentsByType: payload.documentsByType || {} });
  const timestamp = nowISO();
  const nextStatus = completed.allCompleted ? "completed" : "booked";
  const bookingPatch = {
    status: titleStatus(nextStatus), items: completed.items, completedAtISO: completed.allCompleted ? completedDate : "",
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(booking.history), historyEntry(selectedOnly ? "Maintenance items completed" : "Completed", actor, [
      ...available.map((id) => `${id}: completed on ${completedDate}`),
    ], timestamp)],
  };
  const vehiclePatch = completionVehiclePatch({ booking, vehicle, typeIds: available, completedDate, documentsByType: payload.documentsByType || {}, actor, allCompleted: completed.allCompleted });
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch: bookingPatch, updateTime: bookingUpdateTime }];
  if (vehiclePatch) writes.push({ collection: "vehicles", documentId: vehicle.id, patch: vehiclePatch, exists: true });

  const recurrence = buildNextRequestedMaintenanceRecords({ canonicalRecord: canonical, completedTypeIds: available, completionDateISO: completedDate, vehicle: { ...vehicle, ...vehiclePatch } });
  const createdIds = [];
  for (const record of recurrence) {
    const inspectionTypeIds = safeArray(record.items)
      .map((item) => item.maintenanceTypeId)
      .filter((id) => ["pmi", "brake_test"].includes(id));
    if (inspectionTypeIds.length === 2) {
      for (const item of record.items) {
        const individual = buildRequestedMaintenanceRecord({
          companyId: record.companyId,
          vehicleId: record.vehicleId,
          vehicleLabel: record.vehicleLabel,
          items: [item],
          source: "completion_recurrence",
          sourceId: booking.id,
        });
        const individualId = maintenanceRequirementDocumentId(individual.requirementKey);
        const individualSnapshot = individualId
          ? await adminReadDocumentWithMetadata("maintenanceBookings", individualId)
          : null;
        const individualCanonical = individualSnapshot
          ? normalizeMaintenanceRecord(individualSnapshot.data, { id: individualId })
          : null;
        if (
          individualSnapshot &&
          individualCanonical?.status === "requested" &&
          individualSnapshot.data.scheduleManuallyAdjusted !== true
        ) {
          writes.push({
            collection: "maintenanceBookings",
            documentId: individualId,
            updateTime: individualSnapshot.updateTime,
            patch: {
              status: "Archived",
              archiveReason: "Replaced by the combined PMI and Brake Test requirement.",
              archivedAtISO: timestamp,
              updatedAt: timestamp,
              history: [
                ...safeArray(individualSnapshot.data.history),
                historyEntry("Combined inspection successor created", actor, [
                  `Replaced by requirement: ${record.requirementKey}`,
                ], timestamp),
              ],
            },
          });
        }
      }
    }
    let id = maintenanceRequirementDocumentId(record.requirementKey);
    if (!id) continue;
    let existingSuccessor = await adminReadDocument("maintenanceBookings", id);
    if (existingSuccessor) {
      const successorStatus = normalizeMaintenanceRecord(existingSuccessor, { id }).status;
      if (["requested", "booked", "in_progress", "deferred"].includes(successorStatus)) {
        createdIds.push(id);
        continue;
      }
      if (["completed", "cancelled"].includes(successorStatus)) continue;
      let attempt = 1;
      let foundActiveReplacement = false;
      while (attempt < 100) {
        id = maintenanceRequirementDocumentId(`${record.requirementKey}|active-replacement:${attempt}`);
        existingSuccessor = await adminReadDocument("maintenanceBookings", id);
        attempt += 1;
        if (!existingSuccessor) break;
        const replacementStatus = normalizeMaintenanceRecord(existingSuccessor, { id }).status;
        if (["requested", "booked", "in_progress", "deferred"].includes(replacementStatus)) {
          createdIds.push(id);
          foundActiveReplacement = true;
          break;
        }
        if (["completed", "cancelled"].includes(replacementStatus)) {
          foundActiveReplacement = true;
          break;
        }
      }
      if (foundActiveReplacement) continue;
      if (existingSuccessor) continue;
    }
    const persisted = withBickersReference({
      ...record,
      ...scheduleFields(record.schedule?.bookingDates || [], ""),
      status: titleStatus(record.status),
      companyId: companyId || text(record.companyId),
      createdAt: timestamp, updatedAt: timestamp, createdBy: "recurrence", lastEditedBy: "recurrence",
      history: [historyEntry("Recurring due item created", actor, [`Source completion: ${booking.id}`], timestamp)],
    }, id);
    writes.push({ collection: "maintenanceBookings", documentId: id, patch: persisted, exists: false });
    createdIds.push(id);
  }
  const recurrenceCreatedTypeIds = new Set(
    recurrence.flatMap((record) => safeArray(record.items).map((item) => item.maintenanceTypeId))
  );
  const retryTypeIds = available.filter((id) => id === "mot" && !recurrenceCreatedTypeIds.has(id));
  let recurrenceStatus = "completed";
  if (retryTypeIds.length) {
    recurrenceStatus = "partial_failure";
    const reconciliationId = `recurrence_${booking.id}_${completedDate.replaceAll("-", "")}`;
    const existingJob = await adminReadDocument("maintenanceReconciliationJobs", reconciliationId);
    if (!existingJob) writes.push({
      collection: "maintenanceReconciliationJobs",
      documentId: reconciliationId,
      exists: false,
      patch: {
        kind: "maintenance_recurrence",
        status: "pending",
        companyId,
        bookingId: booking.id,
        vehicleId: text(booking.vehicleId),
        completedDateISO: completedDate,
        maintenanceTypeIds: retryTypeIds,
        attempts: 0,
        nextAttemptAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastError: retryTypeIds.includes("mot") ? "Awaiting DVSA confirmation" : "Next due date unavailable",
      },
    });
  }
  await commitMaintenanceWrites(writes, companyId);
  return {
    id: booking.id,
    ...bookingPatch,
    vehiclePatch,
    nextRequestedRecordIds: createdIds,
    recurrenceStatus,
    ...(recurrenceStatus === "partial_failure"
      ? { partialFailure: { code: "recurrence_pending", message: "Completion saved; follow-up scheduling is queued for reconciliation." } }
      : {}),
  };
};

const terminalMutation = async ({ payload, actor, companyId, archive }) => {
  const actorRole = text(actor.role).toLowerCase().replaceAll(/[^a-z]/g, "");
  if (archive && !["admin", "platformadmin"].includes(actorRole)) {
    const error = new Error("Only an authorised administrator can archive a legal maintenance requirement.");
    error.status = 403;
    throw error;
  }
  const { booking, bookingUpdateTime, vehicle } = await readContext(text(payload.bookingId), companyId);
  const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
  if (["completed", "cancelled", "archived"].includes(canonical.status)) throw new Error(`Cannot ${archive ? "archive" : "cancel"} a terminal maintenance record.`);
  const reason = text(payload.reason || payload.cancellationReason);
  if (archive && !reason) throw new Error("Enter a reason for archiving this maintenance requirement.");
  const timestamp = nowISO();
  const status = archive ? "archived" : text(payload.cancellationMode).toLowerCase() === "requirement" ? "cancelled" : "requested";
  const patch = {
    status: titleStatus(status),
    items: canonical.items.map((item) => ({ ...item, status })),
    ...(status === "requested" ? scheduleFields([], "") : {}),
    ...(archive ? { archivedAtISO: timestamp, archivedBy: actor, archiveReason: reason } : { cancellationReason: reason, cancelledAtISO: timestamp, cancelledBy: actor }),
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(booking.history), historyEntry(archive ? "Archived" : "Cancelled", actor, [`Status: ${booking.status} -> ${titleStatus(status)}`, reason ? `Reason: ${reason}` : ""], timestamp)],
  };
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch, updateTime: bookingUpdateTime }];
  const vehiclePatch = vehicle ? { ...clearSummary(vehicle, booking.id), updatedAt: timestamp } : null;
  if (vehiclePatch) writes.push({ collection: "vehicles", documentId: vehicle.id, patch: vehiclePatch, exists: true });
  await commitMaintenanceWrites(writes, companyId);
  return { id: booking.id, ...patch, vehiclePatch };
};

const editMutation = async ({ payload, actor, companyId }) => {
  const { booking, bookingUpdateTime } = await readContext(text(payload.bookingId), companyId);
  const current = normalizeMaintenanceRecord(booking, { id: booking.id }).status;
  const next = normalizeMaintenanceRecordStatus(payload.status || booking.status);
  if (["completed", "cancelled", "archived"].includes(next)) throw new Error("Use the dedicated completion, cancellation or archive operation.");
  if (!["requested", "booked", "in_progress", "deferred"].includes(current)) throw new Error("Terminal maintenance records cannot be edited.");
  if (bookingDates(payload).join() !== bookingDates(booking).join()) throw new Error("Use the dedicated reschedule operation to change appointment dates.");
  assertMaintenanceTransition(current, next);
  const timestamp = nowISO();
  const patch = {
    bickersReference: buildMaintenanceBickersReference(booking, { id: booking.id }),
    status: titleStatus(next), provider: text(payload.provider), bookingRef: text(payload.bookingRef), location: text(payload.location),
    cost: text(payload.cost), notes: text(payload.notes), equipment: safeArray(payload.equipment),
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(booking.history), historyEntry("Edited", actor, [`Status: ${booking.status} -> ${titleStatus(next)}`], timestamp)],
  };
  await commitMaintenanceWrites([{ collection: "maintenanceBookings", documentId: booking.id, patch, updateTime: bookingUpdateTime }], companyId);
  return { id: booking.id, ...booking, ...patch };
};

const createWorkMutation = ({ payload, actor, companyId }) => {
  const job = payload.job || {};
  const plannedDate = maintenanceDateOnly(job.bookedDate || job.plannedDate);
  return createMutation({
    actor,
    companyId,
    payload: {
      vehicleId: job.assetId || job.vehicleId,
      vehicleLabel: job.assetLabel || job.vehicleLabel,
      type: "WORK",
      maintenanceTypeId: job.type || "repair",
      maintenanceTypeIds: [job.type || "repair"],
      status: plannedDate ? "Booked" : "Requested",
      appointmentDate: plannedDate,
      sourceDueDate: job.dueDate,
      provider: job.provider,
      notes: job.notes,
      title: job.title,
      workshop: { ...job, status: text(job.status || "planned").toLowerCase() },
    },
  });
};

const updateWorkMutation = async ({ payload, actor, companyId }) => {
  const { booking, bookingUpdateTime, vehicle } = await readContext(text(payload.bookingId), companyId);
  const input = payload.patch || {};
  const currentWorkshop = booking.workshop && typeof booking.workshop === "object" ? booking.workshop : {};
  const workshop = { ...currentWorkshop, ...input };
  const rawStatus = text(input.status || workshop.status || booking.status).toLowerCase().replaceAll("_", " ");
  const nextStatus = ["booked"].includes(rawStatus) ? "booked"
    : ["in progress", "inprogress"].includes(rawStatus) ? "in_progress"
    : ["deferred", "awaiting parts", "qa"].includes(rawStatus) ? "deferred"
    : "requested";
  if (["completed", "complete", "closed", "cancelled", "canceled", "archived"].includes(rawStatus)) {
    throw new Error("Use the dedicated completion, cancellation or archive operation.");
  }
  const requestedDate = maintenanceDateOnly(input.bookedDate || input.plannedDate);
  const existingDate = bookingDates(booking)[0] || "";
  if (requestedDate && requestedDate !== existingDate) {
    throw new Error("Use the dedicated reschedule operation to change appointment dates.");
  }
  const date = existingDate || maintenanceDateOnly(workshop.bookedDate || workshop.plannedDate);
  const dates = date ? [date] : bookingDates(booking);
  if (["booked", "in_progress"].includes(nextStatus) && !dates.length) throw new Error("Choose an appointment date before booking workshop work.");
  const timestamp = nowISO();
  const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
  const patch = {
    status: titleStatus(nextStatus),
    items: canonical.items.map((item) => ({ ...item, status: nextStatus })),
    workshop,
    title: text(input.title || workshop.title || booking.title),
    notes: text(input.notes || workshop.notes || booking.notes),
    ...scheduleFields(dates, booking.appointmentTime),
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(booking.history), historyEntry("Workshop job updated", actor, [`Status: ${booking.status} -> ${titleStatus(nextStatus)}`], timestamp)],
  };
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch, updateTime: bookingUpdateTime }];
  const vehiclePatch = vehicle && dates.length ? { ...bookingSummaryPatch(booking, dates, nextStatus), updatedAt: timestamp } : null;
  if (vehiclePatch) writes.push({ collection: "vehicles", documentId: vehicle.id, patch: vehiclePatch, exists: true });
  await commitMaintenanceWrites(writes, companyId);
  return { id: booking.id, ...booking, ...patch, vehiclePatch };
};

const updateDocumentsMutation = async ({ payload, actor, companyId }) => {
  const { booking, bookingUpdateTime, vehicle } = await readContext(text(payload.bookingId), companyId);
  const allowedTypeIds = new Set(normalizeMaintenanceRecord(booking, { id: booking.id }).items.map((item) => item.maintenanceTypeId));
  const suppliedItems = safeArray(payload.items);
  const items = safeArray(booking.items).map((existingItem) => {
    const typeId = normalizeMaintenanceTypeId(existingItem.maintenanceTypeId);
    const supplied = suppliedItems.find((item) => normalizeMaintenanceTypeId(item.maintenanceTypeId) === typeId);
    if (!supplied || !allowedTypeIds.has(typeId)) return existingItem;
    const documents = normalizeMaintenanceDocumentList(supplied.documents, {
      maintenanceTypeId: typeId,
      sourceRecordId: booking.id,
      uploadedBy: actor,
    });
    return { ...existingItem, documents, evidenceStatus: documents.length ? "attached" : "not_recorded" };
  });
  const timestamp = nowISO();
  const bookingPatch = {
    items,
    lastEditedBy: actor.email,
    lastEditedByUid: actor.uid,
    updatedAt: timestamp,
    history: [...safeArray(booking.history), historyEntry("Evidence updated", actor, ["Maintenance evidence attachments changed"], timestamp)],
  };
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch: bookingPatch, updateTime: bookingUpdateTime }];
  let vehiclePatch = null;
  if (vehicle) {
    vehiclePatch = {};
    RECURRING_MAINTENANCE_WORKFLOWS
      .filter((workflow) => allowedTypeIds.has(workflow.maintenanceTypeId))
      .forEach((workflow) => {
        const supplied = suppliedItems.find(
          (item) => normalizeMaintenanceTypeId(item.maintenanceTypeId) === workflow.maintenanceTypeId
        );
        if (!supplied) return;
        const priorBookingItem = safeArray(booking.items).find(
          (item) => normalizeMaintenanceTypeId(item.maintenanceTypeId) === workflow.maintenanceTypeId
        );
        const priorIds = new Set(safeArray(priorBookingItem?.documents).map(maintenanceDocumentId).filter(Boolean));
        const nextDocuments = normalizeMaintenanceDocumentList(supplied.documents, {
          maintenanceTypeId: workflow.maintenanceTypeId,
          sourceRecordId: booking.id,
          uploadedBy: actor,
        });
        vehiclePatch[workflow.documentsField] = [
          ...normalizeMaintenanceDocumentList(vehicle[workflow.documentsField], {
            maintenanceTypeId: workflow.maintenanceTypeId,
          }).filter((document) => !priorIds.has(maintenanceDocumentId(document))),
          ...nextDocuments,
        ];
        vehiclePatch[workflow.historyField] = safeArray(vehicle[workflow.historyField]).map((entry) =>
          text(entry?.bookingId) === booking.id
            ? { ...entry, documents: nextDocuments }
            : entry
        );
      });
    if (Object.keys(vehiclePatch).length) {
      writes.push({
        collection: "vehicles",
        documentId: vehicle.id,
        patch: { ...vehiclePatch, updatedAt: timestamp },
        exists: true,
      });
    }
  }
  await commitMaintenanceWrites(writes, companyId);
  return { id: booking.id, items, history: bookingPatch.history, vehiclePatch };
};

const vorTransitionMutation = async ({ payload, actor, companyId }) => {
  const vehicleId = text(payload.vehicleId);
  const vehicle = await adminReadDocument("vehicles", vehicleId);
  if (!vehicle) throw new Error("Vehicle not found.");
  assertTenant(vehicle, companyId);
  const all = await adminListDocuments("maintenanceBookings");
  const candidates = getVorInspectionCancellationCandidates(all.map((entry) => ({ id: entry.id, ...entry.data, __updateTime: entry.updateTime })).filter((booking) => text(booking.vehicleId) === vehicleId), { vehicle: { id: vehicleId, ...vehicle, ...payload.vehiclePayload }, offRoadDate: payload.offRoadDate });
  const timestamp = nowISO();
  let vehiclePatch = { ...(payload.vehiclePayload || {}), updatedAt: timestamp };
  const writes = candidates.map((booking) => {
    Object.assign(vehiclePatch, clearSummary({ ...vehicle, ...vehiclePatch }, booking.id));
    return { collection: "maintenanceBookings", documentId: booking.id, patch: buildVorInspectionCancellationPatch(booking, { cancelledAt: timestamp, cancelledBy: actor, cancellationSource: payload.cancellationSource, sourceRecordId: payload.sourceRecordId }), updateTime: booking.__updateTime };
  });
  writes.push({ collection: "vehicles", documentId: vehicleId, patch: vehiclePatch, exists: true });
  await commitMaintenanceWrites(writes, companyId);
  return { cancelledIds: candidates.map((booking) => booking.id), vehicleUpdate: vehiclePatch };
};

const VEHICLE_VOR_MUTATION_FIELDS = [
  "operationalStatus", "fleetStatus", "vehicleStatus", "status",
  "vorStartedAt", "vorEndedAt", "activeVorRecordId", "vorHistory",
  "vorHistoryLastMutatedAt", "vorHistoryLastMutatedBy",
  "maintenanceCountdownPause", "pendingReturnInspection", "complianceVor",
  "odometer", "nextPMI", "nextEightWeekInspection", "nextLorryInspection",
  "pmiISOWeek", "eightWeekInspectionISOWeek", "lorryInspectionISOWeek",
  "nextBrakeTest", "brakeISOWeek",
];

const vehicleVorPatch = (vehicle = {}) => Object.fromEntries(
  VEHICLE_VOR_MUTATION_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(vehicle, field))
    .map((field) => [field, vehicle[field]])
);

const applyVehicleVorMutation = (vehicle, operation, payload, actor, timestamp) => {
  if (operation === "start") {
    return startVehicleVorPeriod(vehicle, payload, { startedAt: timestamp });
  }
  if (operation === "schedule_return") {
    return scheduleVehicleReturnInspection(vehicle, payload, { requestedAt: timestamp });
  }
  if (operation === "release") {
    return releaseVehicleAfterCompletedCompliance(vehicle, payload, {
      completedAt: timestamp,
      releasedBy: actor,
    });
  }
  if (operation === "correct_historic") {
    return correctVehicleHistoricVorPeriod(vehicle, payload.recordId, payload.changes, {
      reason: payload.reason,
      correctedAt: timestamp,
      correctedBy: actor,
    });
  }
  if (operation === "archive_historic") {
    return archiveVehicleHistoricVorPeriod(vehicle, payload.recordId, {
      reason: payload.reason,
      archivedAt: timestamp,
      archivedBy: actor,
    });
  }
  throw new Error("Unsupported VOR/SORN mutation.");
};

const vehicleVorMutation = async ({ payload, actor, companyId }) => {
  const vehicleId = text(payload.vehicleId);
  if (!vehicleId) throw new Error("Vehicle id is required.");
  const snapshot = await adminReadDocumentWithMetadata("vehicles", vehicleId);
  if (!snapshot) throw new Error("Vehicle not found.");
  assertTenant(snapshot.data, companyId);

  const timestamp = nowISO();
  const currentVehicle = { id: vehicleId, ...snapshot.data };
  const updatedVehicle = applyVehicleVorMutation(
    currentVehicle,
    text(payload.operation),
    payload.payload || {},
    actor,
    timestamp
  );
  const writes = [];
  let bookingId = "";
  let bookingSummary = {};

  if (text(payload.operation) === "schedule_return") {
    const intent = vehicleReturnInspectionBookingIntent(updatedVehicle);
    if (!intent) throw new Error("Return inspection booking details are incomplete.");
    const allBookings = await adminListDocuments("maintenanceBookings");
    const matching = allBookings
      .map((entry) => ({ id: entry.id, ...entry.data }))
      .find((booking) => {
        if (text(booking.vehicleId) !== vehicleId) return false;
        if (["cancelled", "declined", "archived", "deleted", "closed", "superseded"].includes(normalizeMaintenanceRecordStatus(booking.status))) return false;
        const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
        const typeIds = new Set(canonical.items.map((item) => item.maintenanceTypeId));
        return canonical.schedule.bookingDates.includes(intent.appointmentDateISO) &&
          typeIds.has("pmi") && typeIds.has("brake_test");
      });
    bookingId = text(matching?.id) || maintenanceRequirementDocumentId(intent.sourceDueKey);
    if (!matching) {
      const dueWeek = maintenanceIsoWeekLabel(intent.sourceDueDateISO);
      const booking = withBickersReference({
        schemaVersion: 1,
        kind: "MAINTENANCE",
        companyId: companyId || text(snapshot.data.companyId),
        vehicleId,
        vehicleLabel: intent.vehicleLabel,
        type: intent.type,
        maintenanceTypeId: "combined",
        maintenanceTypeIds: intent.maintenanceTypeIds,
        status: intent.status,
        items: canonicalItems({
          typeIds: intent.maintenanceTypeIds,
          status: "booked",
          dueDate: intent.sourceDueDateISO,
          dueWeek,
        }),
        ...scheduleFields([intent.appointmentDateISO], ""),
        sourceDueDateISO: intent.sourceDueDateISO,
        sourceDueIsoWeek: dueWeek,
        sourceDueKey: intent.sourceDueKey,
        requirementKey: intent.sourceDueKey,
        origin: intent.origin,
        sourceVorPeriodId: intent.sourceVorPeriodId,
        notes: intent.notes,
        createdAt: timestamp,
        createdBy: actor.email,
        createdByUid: actor.uid,
        lastEditedBy: actor.email,
        lastEditedByUid: actor.uid,
        updatedAt: timestamp,
        history: [historyEntry("Return-to-fleet inspection booked", actor, [
          `Workshop date: ${intent.appointmentDateISO}`,
          "PMI and brake test required before vehicle release",
        ], timestamp)],
      }, bookingId);
      writes.push({
        collection: "maintenanceBookings",
        documentId: bookingId,
        patch: booking,
        exists: false,
      });
    }
    updatedVehicle.pendingReturnInspection = {
      ...updatedVehicle.pendingReturnInspection,
      bookingId,
    };
    bookingSummary = bookingSummaryPatch({
      id: bookingId,
      type: "INSPECTION",
      maintenanceTypeIds: intent.maintenanceTypeIds,
    }, [intent.appointmentDateISO], "booked");
  }

  const patch = {
    ...vehicleVorPatch(updatedVehicle),
    ...bookingSummary,
    updatedAt: timestamp,
  };
  writes.push({
    collection: "vehicles",
    documentId: vehicleId,
    patch,
    updateTime: snapshot.updateTime,
  });
  await commitMaintenanceWrites(writes, companyId);
  return { vehicle: { ...currentVehicle, ...patch }, bookingId: bookingId || null };
};

const HISTORIC_VOR_PATCH_FIELDS = [
  "vorHistory", "vorHistoryLastMutatedAt", "vorHistoryLastMutatedBy",
];

const addHistoricVorMutation = async ({ payload, actor, companyId }) => {
  const vehicleId = text(payload.vehicleId);
  const storedVehicle = await adminReadDocument("vehicles", vehicleId);
  if (!storedVehicle) throw new Error("Vehicle not found.");
  assertTenant(storedVehicle, companyId);

  const timestamp = nowISO();
  const periodId = text(payload.periodId) || `vor-history-${crypto.randomUUID()}`;
  const currentVehicle = { id: vehicleId, ...storedVehicle };
  const updatedVehicle = addHistoricVorPeriod(currentVehicle, {
    ...payload,
    id: periodId,
    migratedBy: actor,
  }, { mutatedAt: timestamp, mutatedBy: actor });
  const period = safeArray(updatedVehicle.vorHistory).find((entry) => text(entry.id) === periodId);
  const bookingIntent = historicVorFirstUseBookingIntent(currentVehicle, period);
  const writes = [];
  let bookingId = "";

  if (bookingIntent) {
    const all = await adminListDocuments("maintenanceBookings");
    const matching = all
      .map((entry) => ({ id: entry.id, ...entry.data }))
      .find((booking) => {
        if (text(booking.vehicleId) !== vehicleId) return false;
        if (["cancelled", "declined", "archived", "deleted", "closed", "superseded"].includes(normalizeMaintenanceRecordStatus(booking.status))) return false;
        const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
        const types = new Set(canonical.items.map((item) => item.maintenanceTypeId));
        return canonical.schedule.bookingDates.includes(bookingIntent.appointmentDateISO) &&
          types.has("pmi") && types.has("brake_test");
      });

    bookingId = text(matching?.id) || maintenanceRequirementDocumentId(bookingIntent.sourceDueKey);
    if (!matching) {
      const dueWeek = maintenanceIsoWeekLabel(bookingIntent.appointmentDateISO);
      const typeIds = bookingIntent.maintenanceTypeIds;
      const booking = withBickersReference({
        schemaVersion: 1,
        kind: "MAINTENANCE",
        companyId: companyId || text(storedVehicle.companyId),
        vehicleId,
        vehicleLabel: bookingIntent.vehicleLabel,
        type: "INSPECTION",
        maintenanceTypeId: "combined",
        maintenanceTypeIds: typeIds,
        status: "Booked",
        items: canonicalItems({ typeIds, status: "booked", dueDate: bookingIntent.sourceDueDateISO, dueWeek }),
        ...scheduleFields([bookingIntent.appointmentDateISO], ""),
        sourceDueDateISO: bookingIntent.sourceDueDateISO,
        sourceDueIsoWeek: dueWeek,
        sourceDueKey: bookingIntent.sourceDueKey,
        requirementKey: bookingIntent.sourceDueKey,
        origin: bookingIntent.origin,
        sourceVorPeriodId: periodId,
        notes: bookingIntent.notes,
        createdAt: timestamp,
        createdBy: actor.email,
        createdByUid: actor.uid,
        lastEditedBy: actor.email,
        lastEditedByUid: actor.uid,
        updatedAt: timestamp,
        history: [historyEntry("First-use inspection booked from historic VOR", actor, [
          `Workshop date: ${bookingIntent.appointmentDateISO}`,
          `Historic VOR period: ${periodId}`,
        ], timestamp)],
      }, bookingId);
      writes.push({ collection: "maintenanceBookings", documentId: bookingId, patch: booking, exists: false });
    }
    period.linkedFirstUseInspectionBookingId = bookingId;
  }

  const vehiclePatch = Object.fromEntries(HISTORIC_VOR_PATCH_FIELDS.map((field) => [field, updatedVehicle[field]]));
  if (bookingIntent) {
    Object.assign(vehiclePatch, bookingSummaryPatch({ id: bookingId, type: "INSPECTION", maintenanceTypeIds: ["pmi", "brake_test"] }, [bookingIntent.appointmentDateISO], "booked"));
  }
  vehiclePatch.updatedAt = timestamp;
  writes.push({ collection: "vehicles", documentId: vehicleId, patch: vehiclePatch, exists: true });
  await commitMaintenanceWrites(writes, companyId);
  return { vehicle: { ...currentVehicle, ...vehiclePatch }, periodId, bookingId: bookingId || null };
};

const linkHistoricVorInspectionMutation = async ({ payload, actor, companyId }) => {
  const vehicleId = text(payload.vehicleId);
  const periodId = text(payload.periodId);
  const storedVehicle = await adminReadDocument("vehicles", vehicleId);
  if (!storedVehicle) throw new Error("Vehicle not found.");
  assertTenant(storedVehicle, companyId);
  const history = safeArray(storedVehicle.vorHistory);
  const period = history.find((entry) => text(entry.id) === periodId);
  if (!period) throw new Error("Historic VOR/SORN period not found.");
  if (normalizeMaintenanceRecordStatus(period.status) === "archived") throw new Error("Archived VOR/SORN periods cannot create bookings.");

  const intent = historicVorFirstUseBookingIntent({ id: vehicleId, ...storedVehicle }, period);
  if (!intent) throw new Error("Enter a first-use inspection date before creating the booking.");
  const all = await adminListDocuments("maintenanceBookings");
  const matching = all
    .map((entry) => ({ id: entry.id, ...entry.data }))
    .find((booking) => {
      if (text(booking.vehicleId) !== vehicleId) return false;
      if (["cancelled", "declined", "archived", "deleted", "closed", "superseded"].includes(normalizeMaintenanceRecordStatus(booking.status))) return false;
      const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
      const types = new Set(canonical.items.map((item) => item.maintenanceTypeId));
      return canonical.schedule.bookingDates.includes(intent.appointmentDateISO) && types.has("pmi") && types.has("brake_test");
    });
  const bookingId = text(matching?.id) || maintenanceRequirementDocumentId(intent.sourceDueKey);
  const timestamp = nowISO();
  const writes = [];

  if (!matching) {
    const dueWeek = maintenanceIsoWeekLabel(intent.appointmentDateISO);
    const typeIds = intent.maintenanceTypeIds;
    writes.push({
      collection: "maintenanceBookings",
      documentId: bookingId,
      exists: false,
      patch: withBickersReference({
        schemaVersion: 1, kind: "MAINTENANCE",
        companyId: companyId || text(storedVehicle.companyId),
        vehicleId, vehicleLabel: intent.vehicleLabel,
        type: "INSPECTION", maintenanceTypeId: "combined", maintenanceTypeIds: typeIds,
        status: "Booked",
        items: canonicalItems({ typeIds, status: "booked", dueDate: intent.sourceDueDateISO, dueWeek }),
        ...scheduleFields([intent.appointmentDateISO], ""),
        sourceDueDateISO: intent.sourceDueDateISO, sourceDueIsoWeek: dueWeek,
        sourceDueKey: intent.sourceDueKey, requirementKey: intent.sourceDueKey,
        origin: intent.origin, sourceVorPeriodId: periodId, notes: intent.notes,
        createdAt: timestamp, createdBy: actor.email, createdByUid: actor.uid,
        lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
        history: [historyEntry("First-use inspection linked to historic VOR", actor, [
          `Workshop date: ${intent.appointmentDateISO}`,
          `Historic VOR period: ${periodId}`,
        ], timestamp)],
      }, bookingId),
    });
  }

  const linkedHistory = history.map((entry) => text(entry.id) === periodId
    ? { ...entry, linkedFirstUseInspectionBookingId: bookingId, firstUseInspectionLinkedAt: timestamp, firstUseInspectionLinkedBy: actor }
    : entry);
  writes.push({
    collection: "vehicles",
    documentId: vehicleId,
    exists: true,
    patch: {
      vorHistory: linkedHistory,
      vorHistoryLastMutatedAt: timestamp,
      vorHistoryLastMutatedBy: actor,
      ...bookingSummaryPatch({ id: bookingId, type: "INSPECTION", maintenanceTypeIds: ["pmi", "brake_test"] }, [intent.appointmentDateISO], "booked"),
      updatedAt: timestamp,
    },
  });
  await commitMaintenanceWrites(writes, companyId);
  return { periodId, bookingId, idempotent: Boolean(matching) };
};

const forecastMutation = async ({ payload, actor, companyId }) => {
  const vehicle = payload.vehicle?.id ? payload.vehicle : { id: text(payload.vehicleId), ...(await adminReadDocument("vehicles", text(payload.vehicleId))) };
  if (!vehicle?.id) throw new Error("Vehicle not found.");
  assertTenant(vehicle, companyId);
  const year = Number(payload.year);
  const all = await adminListDocuments("maintenanceBookings");
  const existing = all.map((entry) => ({ id: entry.id, ...entry.data, __updateTime: entry.updateTime })).filter((booking) => text(booking.vehicleId) === vehicle.id);
  const forecast = buildAnnualMaintenanceForecast({ vehicle, year, companyId, includedTypeIds: payload.includedTypeIds });
  const reconciliation = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: existing,
    vehicleId: vehicle.id,
    year,
    todayISO: maintenanceDateOnly(payload.today || new Date()),
    includedTypeIds: payload.includedTypeIds,
    restoreVorCancelledAppointments: payload.restoreVorCancelledAppointments === true,
  });
  const timestamp = nowISO();
  const writes = [];
  const createdIds = [];
  for (const record of reconciliation.create) {
    const id = record.id || maintenanceRequirementDocumentId(record.requirementKey);
    if (!id || await adminReadDocument("maintenanceBookings", id)) continue;
    const persisted = withBickersReference({ ...buildAnnualMaintenancePersistencePayload(record, { createdBy: actor.email, nowISO: timestamp }), createdAt: timestamp, updatedAt: timestamp }, id);
    writes.push({ collection: "maintenanceBookings", documentId: id, patch: persisted, exists: false });
    createdIds.push(id);
  }
  const reactivatedIds = [];
  for (const entry of reconciliation.reactivate) {
    const id = text(entry.source?.id);
    const appointmentDates = bookingDates(entry.source);
    if (!id || !appointmentDates.length) continue;
    const typeIds = safeArray(entry.forecast?.items).map((item) => item.maintenanceTypeId);
    writes.push({
      collection: "maintenanceBookings",
      documentId: id,
      updateTime: entry.source.__updateTime,
      patch: {
        status: "Booked",
        items: safeArray(entry.forecast.items).map((item) => ({ ...item, status: "booked" })),
        maintenanceTypeId: typeIds[0] || "work",
        maintenanceTypeIds: typeIds,
        requirementKey: entry.forecast.requirementKey,
        sourceDueKey: entry.forecast.requirementKey,
        sourceDueDateISO: entry.forecast.sourceDueDateISO,
        sourceDueIsoWeek: entry.forecast.sourceDueIsoWeek,
        origin: entry.forecast.origin,
        forecastYear: entry.forecast.forecastYear,
        reactivatedAfterVorAtISO: timestamp,
        lastEditedBy: actor.email,
        lastEditedByUid: actor.uid,
        updatedAt: timestamp,
        history: [
          ...safeArray(entry.source.history),
          historyEntry("Reactivated after VOR", actor, [
            `Appointment restored for ${appointmentDates.join(", ")}.`,
          ], timestamp),
        ],
      },
    });
    reactivatedIds.push(id);
  }
  const restoredIds = [];
  for (const entry of reconciliation.restore) {
    const id = text(entry.record?.id);
    const appointmentDate = maintenanceDateOnly(entry.appointmentDateISO);
    if (!id || !appointmentDate || await adminReadDocument("maintenanceBookings", id)) continue;
    const base = buildAnnualMaintenancePersistencePayload(entry.record, {
      createdBy: actor.email,
      nowISO: timestamp,
    });
    writes.push({
      collection: "maintenanceBookings",
      documentId: id,
      exists: false,
      patch: withBickersReference({
        ...base,
        ...scheduleFields([appointmentDate], ""),
        status: "Booked",
        items: safeArray(base.items).map((item) => ({ ...item, status: "booked" })),
        restoredAfterVor: true,
        replacesVorCancelledBookingId: text(entry.replaces?.id),
        createdAt: timestamp,
        updatedAt: timestamp,
        history: [historyEntry("Replacement appointment created after VOR", actor, [
          `Appointment created for ${appointmentDate}.`,
          entry.replaces?.id ? `Replaces cancelled appointment: ${entry.replaces.id}` : "",
        ], timestamp)],
      }, id),
    });
    restoredIds.push(id);
  }
  reconciliation.supersede.forEach((record) => writes.push({ collection: "maintenanceBookings", documentId: record.id, patch: { status: "Archived", archiveReason: "Schedule changed; replaced by canonical forecast.", archivedAtISO: timestamp, updatedAt: timestamp, history: [...safeArray(record.history), historyEntry("Superseded by schedule", actor, ["Automatic appointment replaced."], timestamp)] }, updateTime: record.__updateTime }));
  if (writes.length) await commitMaintenanceWrites(writes, companyId);
  return {
    createdIds,
    supersededIds: reconciliation.supersede.map((record) => record.id),
    preservedIds: reconciliation.preserve.map((record) => record.id).filter(Boolean),
    duplicateIds: reconciliation.duplicate.map((record) => record.id).filter(Boolean),
    blockedIds: reconciliation.blocked.map((record) => record.id).filter(Boolean),
    reactivatedIds,
    restoredIds,
  };
};

export const mutateMaintenanceBooking = async ({ operation, payload = {}, actor, companyId }) => {
  if (operation === "create") return createMutation({ payload, actor, companyId });
  if (operation === "edit") return editMutation({ payload, actor, companyId });
  if (operation === "reschedule") return rescheduleMutation({ payload, actor, companyId });
  if (operation === "complete") return completeMutation({ payload, actor, companyId, selectedOnly: false });
  if (operation === "complete_items") return completeMutation({ payload, actor, companyId, selectedOnly: true });
  if (operation === "cancel") return terminalMutation({ payload, actor, companyId, archive: false });
  if (operation === "archive") return terminalMutation({ payload, actor, companyId, archive: true });
  if (operation === "create_work") return createWorkMutation({ payload, actor, companyId });
  if (operation === "update_work") return updateWorkMutation({ payload, actor, companyId });
  if (operation === "update_documents") return updateDocumentsMutation({ payload, actor, companyId });
  if (operation === "vehicle_vor") return vehicleVorMutation({ payload, actor, companyId });
  if (operation === "vor_transition") return vorTransitionMutation({ payload, actor, companyId });
  if (operation === "add_historic_vor") return addHistoricVorMutation({ payload, actor, companyId });
  if (operation === "link_historic_vor_inspection") return linkHistoricVorInspectionMutation({ payload, actor, companyId });
  if (operation === "sync_forecast") return forecastMutation({ payload, actor, companyId });
  throw new Error("Unsupported maintenance mutation operation.");
};
