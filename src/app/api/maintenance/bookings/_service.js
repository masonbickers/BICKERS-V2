import "server-only";

import crypto from "node:crypto";

import {
  adminCommitDocumentPatches,
  adminListDocuments,
  adminReadDocument,
} from "@/app/api/_firebaseAdminRest";
import { ADDITIONAL_MAINTENANCE_WORKFLOWS } from "@/app/utils/maintenanceSchema";
import { buildAdditionalMaintenanceCompletionPatch } from "@/app/utils/additionalMaintenanceCompletion";
import {
  buildAnnualMaintenanceForecast,
  buildAnnualMaintenancePersistencePayload,
  reconcileAnnualMaintenanceForecast,
} from "@/app/utils/maintenanceForecast";
import {
  buildNextRequestedMaintenanceRecords,
  calculateNextMaintenanceDue,
  completeCanonicalMaintenanceItems,
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
  rescheduleCrossesLegalIsoWeek,
} from "@/app/utils/maintenanceMutationPolicy";

const text = (value) => String(value || "").trim();
const safeArray = (value) => (Array.isArray(value) ? value : []);
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
  if (typeIds.some((id) => ["pmi", "brake_test", "tacho_inspection", "tacho_download", "tail_lift", "loler"].includes(id))) return "INSPECTION";
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
  const booking = await adminReadDocument("maintenanceBookings", bookingId);
  if (!booking) {
    const error = new Error("Maintenance booking not found.");
    error.status = 404;
    throw error;
  }
  assertTenant(booking, companyId);
  const vehicleId = text(booking.vehicleId);
  const vehicle = vehicleId ? await adminReadDocument("vehicles", vehicleId) : null;
  if (vehicle) assertTenant(vehicle, companyId);
  return { booking: { id: bookingId, ...booking }, vehicle: vehicle ? { id: vehicleId, ...vehicle } : null };
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
  const dueDate = maintenanceDateOnly(payload.sourceDueDate || payload.sourceDueDateISO);
  const dueWeek = text(payload.sourceDueIsoWeek) || maintenanceIsoWeekLabel(dueDate);
  const id = text(payload.requestedRecordId) || maintenanceRequirementDocumentId(text(payload.sourceDueKey)) || crypto.randomUUID();
  const existing = await adminReadDocument("maintenanceBookings", id);
  if (existing) {
    assertTenant(existing, companyId);
    const existingStatus = normalizeMaintenanceRecord(existing, { id }).status;
    if (existingStatus !== "requested") {
      throw new Error(`Existing ${existingStatus} maintenance records cannot be replaced through creation.`);
    }
  }
  const timestamp = nowISO();
  const record = {
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
    createdAt: existing?.createdAt || timestamp,
    createdBy: existing?.createdBy || actor.email,
    createdByUid: existing?.createdByUid || actor.uid,
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(existing?.history), historyEntry(existing ? "Booked" : "Created", actor, [`Status: ${titleStatus(status)}`], timestamp)],
  };
  const writes = [{ collection: "maintenanceBookings", documentId: id, patch: record, exists: existing ? true : false }];
  const vehicle = record.vehicleId ? await adminReadDocument("vehicles", record.vehicleId) : null;
  if (vehicle) {
    assertTenant(vehicle, companyId);
    record.companyId = record.companyId || text(vehicle.companyId);
  }
  if (vehicle && status === "booked") writes.push({ collection: "vehicles", documentId: record.vehicleId, patch: { ...bookingSummaryPatch({ ...record, id }, dates, status), updatedAt: timestamp }, exists: true });
  await adminCommitDocumentPatches(writes);
  return { id, ...record };
};

const rescheduleMutation = async ({ payload, actor, companyId }) => {
  const { booking, vehicle } = await readContext(text(payload.bookingId), companyId);
  const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
  if (!["booked", "in_progress", "deferred"].includes(canonical.status)) throw new Error("Only an active booked appointment can be rescheduled.");
  const dates = bookingDates(payload.updates || {});
  if (!dates.length) throw new Error("Choose a valid appointment date.");
  const legalWeeks = new Set(canonical.items.map((item) => item.legalDueIsoWeek).filter(Boolean));
  const crossesLegalWeek = rescheduleCrossesLegalIsoWeek([...legalWeeks], dates);
  const reason = text(payload.reason);
  if (crossesLegalWeek && !reason) throw new Error("A reason is required when moving outside the legal ISO week.");
  const timestamp = nowISO();
  const patch = {
    ...scheduleFields(dates, payload.updates?.appointmentTime || booking.appointmentTime),
    ...(booking.workshop && typeof booking.workshop === "object"
      ? { workshop: { ...booking.workshop, bookedDate: dates[0], plannedDate: dates[0] } }
      : {}),
    scheduleExceptionReason: crossesLegalWeek ? reason : "",
    scheduleManuallyAdjusted: true,
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(booking.history), historyEntry("Rescheduled", actor, [
      `Booking dates: ${canonical.schedule.bookingDates.join(", ") || "Unknown"} -> ${dates.join(", ")}`,
      reason ? `Reason: ${reason}` : "",
    ], timestamp)],
  };
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch, exists: true }];
  if (vehicle) writes.push({ collection: "vehicles", documentId: vehicle.id, patch: { ...bookingSummaryPatch(booking, dates, canonical.status), updatedAt: timestamp }, exists: true });
  await adminCommitDocumentPatches(writes);
  return { id: booking.id, ...booking, ...patch, vehiclePatch: writes[1]?.patch || null };
};

const completionVehiclePatch = ({ booking, vehicle, typeIds, completedDate, documentsByType, actor, allCompleted }) => {
  if (!vehicle) return null;
  const timestamp = nowISO();
  const patch = { ...(allCompleted ? clearSummary(vehicle, booking.id) : {}), updatedAt: timestamp };
  if (typeIds.includes("mot")) {
    patch.lastMOT = completedDate; patch.lastMot = completedDate; patch.lastMotDate = completedDate;
    patch.nextMOT = ""; patch.nextMot = ""; patch.nextMotDate = ""; patch.motDueDate = ""; patch.motExpiryDate = "";
    patch.motAwaitingDvsaConfirmation = true;
    patch.motAwaitingDvsaCompletionDate = completedDate;
    patch.motAwaitingDvsaSince = timestamp;
    patch.motAwaitingDvsaBookingId = booking.id;
    patch.motHistory = [...safeArray(vehicle.motHistory).filter((item) => text(item.bookingId) !== booking.id), {
      maintenanceTypeId: "mot", completedDate, bookingId: booking.id, source: "maintenance_booking",
      provider: text(booking.provider), bookingRef: text(booking.bookingRef), notes: text(booking.notes), recordedAt: timestamp,
    }];
  }
  if (typeIds.includes("service")) {
    patch.lastService = completedDate;
    patch.nextService = calculateNextMaintenanceDue({ maintenanceTypeId: "service", completedDate });
    patch.serviceHistory = [...safeArray(vehicle.serviceHistory).filter((item) => text(item.bookingId) !== booking.id), {
      maintenanceTypeId: "service", completedDate, bookingId: booking.id, source: "maintenance_booking", recordedAt: timestamp,
    }];
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
  const { booking, vehicle } = await readContext(text(payload.bookingId), companyId);
  const completedDate = maintenanceDateOnly(payload.completedISO);
  if (!completedDate) throw new Error("Enter the actual completion date.");
  const canonical = normalizeMaintenanceRecord(booking, { id: booking.id });
  if (!["booked", "in_progress", "deferred"].includes(canonical.status)) throw new Error("Only an active booked appointment can be completed.");
  const selected = selectedOnly
    ? safeArray(payload.maintenanceTypeIds).map(normalizeMaintenanceTypeId)
    : canonical.items.filter((item) => item.status !== "completed").map((item) => item.maintenanceTypeId);
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
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch: bookingPatch, exists: true }];
  if (vehiclePatch) writes.push({ collection: "vehicles", documentId: vehicle.id, patch: vehiclePatch, exists: true });

  const recurrence = buildNextRequestedMaintenanceRecords({ canonicalRecord: canonical, completedTypeIds: available, completionDateISO: completedDate, vehicle: { ...vehicle, ...vehiclePatch } });
  const createdIds = [];
  for (const record of recurrence) {
    const id = maintenanceRequirementDocumentId(record.requirementKey);
    if (!id || await adminReadDocument("maintenanceBookings", id)) continue;
    const persisted = {
      ...record,
      ...scheduleFields(record.schedule?.bookingDates || [], ""),
      status: titleStatus(record.status),
      companyId: companyId || text(record.companyId),
      createdAt: timestamp, updatedAt: timestamp, createdBy: "recurrence", lastEditedBy: "recurrence",
      history: [historyEntry("Recurring appointment scheduled", actor, [`Source completion: ${booking.id}`], timestamp)],
    };
    writes.push({ collection: "maintenanceBookings", documentId: id, patch: persisted, exists: false });
    createdIds.push(id);
  }
  const recurrenceCreatedTypeIds = new Set(
    recurrence.flatMap((record) => safeArray(record.items).map((item) => item.maintenanceTypeId))
  );
  const retryTypeIds = available.filter((id) =>
    ["mot", "service", "pmi", "brake_test", "tacho_inspection", "tacho_download", "tail_lift", "loler"].includes(id) &&
    !recurrenceCreatedTypeIds.has(id)
  );
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
  await adminCommitDocumentPatches(writes);
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
  const { booking, vehicle } = await readContext(text(payload.bookingId), companyId);
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
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch, exists: true }];
  const vehiclePatch = vehicle ? { ...clearSummary(vehicle, booking.id), updatedAt: timestamp } : null;
  if (vehiclePatch) writes.push({ collection: "vehicles", documentId: vehicle.id, patch: vehiclePatch, exists: true });
  await adminCommitDocumentPatches(writes);
  return { id: booking.id, ...patch, vehiclePatch };
};

const editMutation = async ({ payload, actor, companyId }) => {
  const { booking } = await readContext(text(payload.bookingId), companyId);
  const current = normalizeMaintenanceRecord(booking, { id: booking.id }).status;
  const next = normalizeMaintenanceRecordStatus(payload.status || booking.status);
  if (["completed", "cancelled", "archived"].includes(next)) throw new Error("Use the dedicated completion, cancellation or archive operation.");
  if (!["requested", "booked", "in_progress", "deferred"].includes(current)) throw new Error("Terminal maintenance records cannot be edited.");
  if (bookingDates(payload).join() !== bookingDates(booking).join()) throw new Error("Use the dedicated reschedule operation to change appointment dates.");
  assertMaintenanceTransition(current, next);
  const timestamp = nowISO();
  const patch = {
    status: titleStatus(next), provider: text(payload.provider), bookingRef: text(payload.bookingRef), location: text(payload.location),
    cost: text(payload.cost), notes: text(payload.notes), equipment: safeArray(payload.equipment),
    lastEditedBy: actor.email, lastEditedByUid: actor.uid, updatedAt: timestamp,
    history: [...safeArray(booking.history), historyEntry("Edited", actor, [`Status: ${booking.status} -> ${titleStatus(next)}`], timestamp)],
  };
  await adminCommitDocumentPatches([{ collection: "maintenanceBookings", documentId: booking.id, patch, exists: true }]);
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
  const { booking, vehicle } = await readContext(text(payload.bookingId), companyId);
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
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch, exists: true }];
  const vehiclePatch = vehicle && dates.length ? { ...bookingSummaryPatch(booking, dates, nextStatus), updatedAt: timestamp } : null;
  if (vehiclePatch) writes.push({ collection: "vehicles", documentId: vehicle.id, patch: vehiclePatch, exists: true });
  await adminCommitDocumentPatches(writes);
  return { id: booking.id, ...booking, ...patch, vehiclePatch };
};

const updateDocumentsMutation = async ({ payload, actor, companyId }) => {
  const { booking, vehicle } = await readContext(text(payload.bookingId), companyId);
  const allowedTypeIds = new Set(normalizeMaintenanceRecord(booking, { id: booking.id }).items.map((item) => item.maintenanceTypeId));
  const suppliedItems = safeArray(payload.items);
  const items = safeArray(booking.items).map((existingItem) => {
    const typeId = normalizeMaintenanceTypeId(existingItem.maintenanceTypeId);
    const supplied = suppliedItems.find((item) => normalizeMaintenanceTypeId(item.maintenanceTypeId) === typeId);
    if (!supplied || !allowedTypeIds.has(typeId)) return existingItem;
    const documents = safeArray(supplied.documents);
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
  const writes = [{ collection: "maintenanceBookings", documentId: booking.id, patch: bookingPatch, exists: true }];
  let vehiclePatch = null;
  if (vehicle && payload.vehiclePatch && typeof payload.vehiclePatch === "object") {
    const allowedFields = new Set(ADDITIONAL_MAINTENANCE_WORKFLOWS.flatMap((workflow) => [workflow.documentsField, workflow.historyField]));
    vehiclePatch = Object.fromEntries(Object.entries(payload.vehiclePatch).filter(([key]) => allowedFields.has(key)));
    if (Object.keys(vehiclePatch).length) writes.push({ collection: "vehicles", documentId: vehicle.id, patch: { ...vehiclePatch, updatedAt: timestamp }, exists: true });
  }
  await adminCommitDocumentPatches(writes);
  return { id: booking.id, items, history: bookingPatch.history, vehiclePatch };
};

const vorTransitionMutation = async ({ payload, actor, companyId }) => {
  const vehicleId = text(payload.vehicleId);
  const vehicle = await adminReadDocument("vehicles", vehicleId);
  if (!vehicle) throw new Error("Vehicle not found.");
  assertTenant(vehicle, companyId);
  const all = await adminListDocuments("maintenanceBookings");
  const candidates = getVorInspectionCancellationCandidates(all.map((entry) => ({ id: entry.id, ...entry.data })).filter((booking) => text(booking.vehicleId) === vehicleId), { vehicle: { id: vehicleId, ...vehicle, ...payload.vehiclePayload }, offRoadDate: payload.offRoadDate });
  const timestamp = nowISO();
  let vehiclePatch = { ...(payload.vehiclePayload || {}), updatedAt: timestamp };
  const writes = candidates.map((booking) => {
    Object.assign(vehiclePatch, clearSummary({ ...vehicle, ...vehiclePatch }, booking.id));
    return { collection: "maintenanceBookings", documentId: booking.id, patch: buildVorInspectionCancellationPatch(booking, { cancelledAt: timestamp, cancelledBy: actor, cancellationSource: payload.cancellationSource, sourceRecordId: payload.sourceRecordId }), exists: true };
  });
  writes.push({ collection: "vehicles", documentId: vehicleId, patch: vehiclePatch, exists: true });
  await adminCommitDocumentPatches(writes);
  return { cancelledIds: candidates.map((booking) => booking.id), vehicleUpdate: vehiclePatch };
};

const forecastMutation = async ({ payload, actor, companyId }) => {
  const vehicle = payload.vehicle?.id ? payload.vehicle : { id: text(payload.vehicleId), ...(await adminReadDocument("vehicles", text(payload.vehicleId))) };
  if (!vehicle?.id) throw new Error("Vehicle not found.");
  assertTenant(vehicle, companyId);
  const year = Number(payload.year);
  const all = await adminListDocuments("maintenanceBookings");
  const existing = all.map((entry) => ({ id: entry.id, ...entry.data })).filter((booking) => text(booking.vehicleId) === vehicle.id);
  const forecast = buildAnnualMaintenanceForecast({ vehicle, year, companyId, includedTypeIds: payload.includedTypeIds });
  const reconciliation = reconcileAnnualMaintenanceForecast({ forecast, existingBookings: existing, vehicleId: vehicle.id, year, todayISO: maintenanceDateOnly(payload.today || new Date()), includedTypeIds: payload.includedTypeIds });
  const timestamp = nowISO();
  const writes = [];
  const createdIds = [];
  for (const record of reconciliation.create) {
    const id = record.id || maintenanceRequirementDocumentId(record.requirementKey);
    if (!id || await adminReadDocument("maintenanceBookings", id)) continue;
    writes.push({ collection: "maintenanceBookings", documentId: id, patch: { ...buildAnnualMaintenancePersistencePayload(record, { createdBy: actor.email, nowISO: timestamp }), createdAt: timestamp, updatedAt: timestamp }, exists: false });
    createdIds.push(id);
  }
  reconciliation.supersede.forEach((record) => writes.push({ collection: "maintenanceBookings", documentId: record.id, patch: { status: "Archived", archiveReason: "Schedule changed; replaced by canonical forecast.", archivedAtISO: timestamp, updatedAt: timestamp, history: [...safeArray(record.history), historyEntry("Superseded by schedule", actor, ["Automatic appointment replaced."], timestamp)] }, exists: true }));
  if (writes.length) await adminCommitDocumentPatches(writes);
  return { createdIds, supersededIds: reconciliation.supersede.map((record) => record.id), preservedIds: reconciliation.preserve.map((record) => record.id).filter(Boolean) };
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
  if (operation === "vor_transition") return vorTransitionMutation({ payload, actor, companyId });
  if (operation === "sync_forecast") return forecastMutation({ payload, actor, companyId });
  throw new Error("Unsupported maintenance mutation operation.");
};
