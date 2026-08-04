"use client";

import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import {
  ADDITIONAL_MAINTENANCE_WORKFLOWS,
  getIsoWeekLabel,
  getMaintenanceTypeId,
  maintenanceTypeIdForCoreType,
} from "./maintenanceSchema";
import { buildAdditionalMaintenanceCompletionPatch } from "./additionalMaintenanceCompletion";
import {
  evaluateHgvCompliance,
  isHgvComplianceVehicle,
  syncCanonicalPmiAliases,
} from "./hgvCompliance";
import {
  buildMaintenanceChangeList,
  buildMaintenanceCreatedHistoryEntry,
  buildMaintenanceHistoryEntry,
  getMaintenanceAuditIdentity,
} from "./maintenanceAudit";
import { tenantCollectionQuery, tenantPayload } from "./firestoreAccess";
import { mergeMaintenanceHistory } from "./inspectionHistory";
import { resolveCompletedMotExpiry } from "./motExpiry";
import { resolveMaintenanceBookedOn } from "./maintenanceBookingLifecycle";
import {
  calculateNextMaintenanceDue,
  completeCanonicalMaintenanceItems,
  MAINTENANCE_RECORD_SCHEMA_VERSION,
  maintenanceDateOnly,
  maintenanceIsoWeekLabel,
  maintenanceCompletionEvidenceIssues,
  maintenanceRequirementDocumentId,
  normalizeMaintenanceRecord,
  normalizeMaintenanceRecordStatus,
  normalizeMaintenanceTypeId,
} from "./maintenanceRecord";
import {
  buildAnnualMaintenanceForecast,
  reconcileAnnualMaintenanceForecast,
} from "./maintenanceForecast";
import {
  buildVorInspectionCancellationPatch,
  getVorInspectionCancellationCandidates,
  isVorAffectedMaintenanceBooking,
} from "./vorBookingPolicy";
export { isVorAffectedMaintenanceBooking } from "./vorBookingPolicy";

export const normalizeMaintenanceType = (type) => {
  const raw = String(type || "").trim().toUpperCase();
  if (raw === "SERVICE") return "SERVICE";
  if (raw === "INSPECTION") return "INSPECTION";
  if (raw === "WORK") return "WORK";
  if (raw === "MOT") return "MOT";
  return "MOT";
};

export const ymdToDate = (ymd) => {
  if (!ymd) return null;
  const [year, month, day] = String(ymd).slice(0, 10).split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const dateToYMD = (value) => {
  const date = toDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const todayISO = () => dateToYMD(new Date());

export const enumerateDaysYMD = (startYMD, endYMD) => {
  const start = ymdToDate(startYMD);
  const end = ymdToDate(endYMD);
  if (!start || !end) return [];

  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(dateToYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

export const bookingToDateKeys = (booking) => {
  if (Array.isArray(booking?.bookingDates) && booking.bookingDates.length) {
    return booking.bookingDates
      .map((value) => String(value || "").slice(0, 10))
      .filter(Boolean)
      .sort();
  }

  const appointmentISO = String(booking?.appointmentDateISO || "").slice(0, 10);
  const startISO = String(booking?.startDateISO || "").slice(0, 10);
  const endISO = String(booking?.endDateISO || "").slice(0, 10);
  if (appointmentISO) return [appointmentISO];
  if (startISO && endISO) return enumerateDaysYMD(startISO, endISO);

  const start = toDate(booking?.startDate || booking?.date || booking?.appointmentDate);
  const end = toDate(booking?.endDate || booking?.date || booking?.appointmentDate || booking?.startDate);
  if (!start || !end) return [];
  return enumerateDaysYMD(dateToYMD(start), dateToYMD(end));
};

export const isConsecutiveYMDList = (dates) => {
  if (!Array.isArray(dates) || dates.length <= 1) return true;
  const sorted = [...dates].sort();
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = ymdToDate(sorted[index - 1]);
    const current = ymdToDate(sorted[index]);
    if (!previous || !current) return false;
    const diffDays = Math.round((current.getTime() - previous.getTime()) / 86400000);
    if (diffDays !== 1) return false;
  }
  return true;
};

export const normalizeBookingDateInput = ({
  useCustomDates = false,
  isMultiDay = false,
  appointmentDate = "",
  startDate = "",
  endDate = "",
  dateKeys = [],
}) => {
  const keys = [...new Set((dateKeys || []).map((value) => String(value || "").slice(0, 10)).filter(Boolean))].sort();
  const effectiveKeys = keys.length
    ? keys
    : useCustomDates
    ? []
    : isMultiDay
    ? enumerateDaysYMD(startDate, endDate)
    : appointmentDate
    ? [String(appointmentDate).slice(0, 10)]
    : [];

  const firstSelectedDate = effectiveKeys[0] || "";
  const lastSelectedDate = effectiveKeys[effectiveKeys.length - 1] || firstSelectedDate;
  const effectiveIsMultiDay = Boolean(useCustomDates || isMultiDay || effectiveKeys.length > 1);

  return {
    keys: effectiveKeys,
    firstSelectedDate,
    lastSelectedDate,
    effectiveIsMultiDay,
    startDateObject: ymdToDate(firstSelectedDate),
    endDateObject: ymdToDate(lastSelectedDate),
    appointmentDateObject: !effectiveIsMultiDay ? ymdToDate(firstSelectedDate || appointmentDate) : null,
    appointmentDateISO: !effectiveIsMultiDay ? firstSelectedDate || String(appointmentDate || "").slice(0, 10) : "",
    startDateISO: effectiveIsMultiDay ? firstSelectedDate : "",
    endDateISO: effectiveIsMultiDay ? lastSelectedDate : "",
  };
};

export const getMaintenanceCompletionISO = ({ isMultiDay, appointmentDate, startDate, endDate }) => {
  if (!isMultiDay) return String(appointmentDate || "").slice(0, 10);
  return String(endDate || startDate || "").slice(0, 10);
};

export const calcNextMaintenanceDue = (lastISO, freqWeeks) => {
  const last = ymdToDate(lastISO) || toDate(lastISO);
  const weeks = Number(freqWeeks || 0);
  if (!last || !weeks) return "";
  const next = new Date(last);
  next.setDate(next.getDate() + weeks * 7);
  return dateToYMD(next);
};

export const calcNextDueFromCycle = (anchorISO, completedISO, freqWeeks) => {
  const anchor = ymdToDate(anchorISO) || toDate(anchorISO);
  const completed = ymdToDate(completedISO) || toDate(completedISO);
  const weeks = Number(freqWeeks || 0);
  if (!anchor || !weeks) return completedISO ? calcNextMaintenanceDue(completedISO, weeks) : "";

  const next = new Date(anchor);
  next.setDate(next.getDate() + weeks * 7);

  if (completed) {
    while (next.getTime() <= completed.getTime()) {
      next.setDate(next.getDate() + weeks * 7);
    }
  }

  return dateToYMD(next);
};

export const resolveMaintenanceFreqWeeks = (explicitFreq, lastISO, nextISO) => {
  const explicit = Number(explicitFreq || 0);
  if (explicit > 0) return explicit;

  const last = ymdToDate(lastISO) || toDate(lastISO);
  const next = ymdToDate(nextISO) || toDate(nextISO);
  if (!last || !next) return 0;

  const diffDays = Math.round((next.getTime() - last.getTime()) / 86400000);
  if (diffDays <= 0) return 0;
  return Math.max(1, Math.round(diffDays / 7));
};

const cleanObject = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));

const trimText = (value) => String(value || "").trim();

const coreTypeForMaintenanceItems = (items = []) => {
  const typeIds = [...new Set((Array.isArray(items) ? items : []).map((item) => normalizeMaintenanceTypeId(item?.maintenanceTypeId)))];
  if (typeIds.length === 1 && typeIds[0] === "mot") return "MOT";
  if (typeIds.length === 1 && typeIds[0] === "service") return "SERVICE";
  if (typeIds.some((typeId) => ["pmi", "brake_test", "tacho_inspection", "tacho_download", "tail_lift", "loler"].includes(typeId))) {
    return "INSPECTION";
  }
  return "WORK";
};

const scheduledAppointmentPayload = (record, auditUser) => {
  const type = coreTypeForMaintenanceItems(record.items);
  const bookedItems = record.items.map((item) => ({ ...item, status: "booked" }));
  const typeIds = bookedItems.map((item) => item.maintenanceTypeId);
  const firstDue = record.items.map((item) => item.legalDueDateISO).filter(Boolean).sort()[0] || "";
  const firstWeek = record.items.map((item) => item.legalDueIsoWeek).filter(Boolean).sort()[0] || "";
  const appointmentDateISO = maintenanceDateOnly(record.schedule?.appointmentDateISO) || firstDue;
  return {
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    kind: "MAINTENANCE",
    type,
    maintenanceTypeId: typeIds[0] || "work",
    maintenanceTypeIds: typeIds,
    companyId: record.companyId,
    vehicleId: record.vehicleId,
    vehicleLabel: record.vehicleLabel,
    status: "Booked",
    items: bookedItems,
    bookingDates: appointmentDateISO ? [appointmentDateISO] : [],
    appointmentDateISO,
    startDateISO: "",
    endDateISO: "",
    requirementKey: record.requirementKey,
    sourceDueKey: record.requirementKey,
    sourceDueDateISO: firstDue,
    sourceDueIsoWeek: firstWeek,
    origin: record.origin,
    forecastYear: Number(record.forecastYear || appointmentDateISO.slice(0, 4) || 0) || null,
    scheduleManuallyAdjusted: record.scheduleManuallyAdjusted === true,
    workshop: record.workshop || null,
    createdBy: auditUser.email || "system",
    createdByUid: auditUser.uid || "",
    lastEditedBy: auditUser.email || "system",
    lastEditedByUid: auditUser.uid || "",
    history: [
      {
        action: "Booked",
        user: auditUser.email || "system",
        userUid: auditUser.uid || "",
        timestamp: new Date().toISOString(),
        changes: [`Scheduled appointment created automatically for ${appointmentDateISO || firstWeek || "the next cycle"}`],
      },
    ],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
};

export const syncVehicleAnnualMaintenanceForecast = async ({
  vehicle,
  year,
  maintenanceBookings = [],
  authState = null,
  today = new Date(),
  includedTypeIds,
} = {}) => {
  if (!vehicle?.id) return { createdIds: [], supersededIds: [], preservedIds: [] };
  const forecast = buildAnnualMaintenanceForecast({
    vehicle,
    year,
    companyId:
      vehicle.companyId || authState?.companyId || authState?.currentCompanyId || "",
    includedTypeIds,
  });
  const reconciliation = reconcileAnnualMaintenanceForecast({
    forecast,
    existingBookings: maintenanceBookings,
    vehicleId: vehicle.id,
    year,
    todayISO: maintenanceDateOnly(today),
    includedTypeIds,
  });
  if (!reconciliation.create.length && !reconciliation.supersede.length) {
    return {
      createdIds: [],
      supersededIds: [],
      preservedIds: reconciliation.preserve.map((record) => record.id).filter(Boolean),
    };
  }

  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const batch = writeBatch(db);
  const createdIds = [];
  const safeCreates = [];
  for (const record of reconciliation.create) {
    const id = record.id || maintenanceRequirementDocumentId(record.requirementKey);
    if (!id) continue;
    const current = await getDoc(doc(db, "maintenanceBookings", id));
    if (current.exists()) continue;
    safeCreates.push({ id, record });
  }
  safeCreates.forEach(({ id, record }) => {
    batch.set(
      doc(db, "maintenanceBookings", id),
      tenantPayload(authState, scheduledAppointmentPayload(record, auditUser))
    );
    createdIds.push(id);
  });

  const nowAuditIso = new Date().toISOString();
  const supersededIds = [];
  reconciliation.supersede.forEach((record) => {
    if (!record?.id) return;
    batch.update(doc(db, "maintenanceBookings", record.id), tenantPayload(authState, {
      status: "Archived",
      archivedAtISO: maintenanceDateOnly(today),
      archiveReason: "Schedule changed; replaced by the canonical annual forecast.",
      lastEditedBy: auditUser.email || "system",
      lastEditedByUid: auditUser.uid || "",
      history: [
        ...(Array.isArray(record.history) ? record.history : []),
        buildMaintenanceHistoryEntry({
          action: "Superseded by schedule",
          user: auditUser,
          timestamp: nowAuditIso,
          changes: ["Untouched automatic appointment archived after the vehicle schedule changed."],
        }),
      ],
      updatedAt: serverTimestamp(),
    }));
    supersededIds.push(record.id);
  });
  await batch.commit();
  return {
    createdIds,
    supersededIds,
    preservedIds: reconciliation.preserve.map((record) => record.id).filter(Boolean),
  };
};

const repairAnnualForecastAfterCompletion = async ({
  vehicle,
  vehiclePatch,
  completionDateISO,
  authState,
} = {}) => {
  if (!vehicle?.id || !completionDateISO) return;
  const snapshot = await getDocs(
    tenantCollectionQuery(db, "maintenanceBookings", authState, [])
  );
  const bookings = snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() || {}) }));
  const completedYear = Number(maintenanceDateOnly(completionDateISO).slice(0, 4));
  const updatedVehicle = { ...vehicle, ...(vehiclePatch || {}) };
  for (const year of [completedYear, completedYear + 1]) {
    await syncVehicleAnnualMaintenanceForecast({
      vehicle: updatedVehicle,
      year,
      maintenanceBookings: bookings,
      authState,
      today: completionDateISO,
    });
  }
};

// Retained as a compatibility shim for older callers. Automatic appointments are
// now persisted only by syncVehicleAnnualMaintenanceForecast.
export const ensureScheduledMaintenanceAppointments = async () => ({
  createdIds: [],
  promotedIds: [],
  candidateCount: 0,
  promotionCount: 0,
});
const normalizeTime = (value) => {
  const clean = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(clean) ? clean : "";
};

const activeSummaryClears = (type) => {
  if (type === "MOT") {
    return {
      motProvider: "",
      motBookingRef: "",
      motLocation: "",
      motCost: "",
      motBookingNotes: "",
    };
  }
  if (type === "SERVICE") {
    return {
      serviceProvider: "",
      serviceBookingRef: "",
      serviceLocation: "",
      serviceCost: "",
      serviceBookingNotes: "",
    };
  }
  if (type === "INSPECTION") {
    return {
      inspectionProvider: "",
      inspectionBookingRef: "",
      inspectionLocation: "",
      inspectionCost: "",
      inspectionBookingNotes: "",
    };
  }
  return {
    workProvider: "",
    workBookingRef: "",
    workLocation: "",
    workCost: "",
    workBookingNotes: "",
  };
};

export const buildVehicleMaintenanceSummaryUpdates = ({
  type,
  vehicle = {},
  bookingId,
  status,
  isMultiDay,
  appointmentDate,
  appointmentTime = "",
  startDate,
  endDate,
  provider = "",
  bookingRef = "",
  notes = "",
  completedISO = "",
  bookingCreatedAt = "",
  nowISO = todayISO(),
  maintenanceTypeIds = [],
  auditUser = {},
}) => {
  const safeType = normalizeMaintenanceType(type);
  const doneISO = String(completedISO || "").slice(0, 10);
  const finalizeUpdates = (candidateUpdates) => {
    if (!isHgvComplianceVehicle(vehicle)) return candidateUpdates;
    const candidate = { ...vehicle, ...candidateUpdates };
    if (safeType === "INSPECTION" && doneISO) {
      Object.assign(
        candidateUpdates,
        syncCanonicalPmiAliases(candidate, { asOfDate: doneISO || nowISO })
      );
    }
    const compliance = evaluateHgvCompliance(
      { ...candidate, ...candidateUpdates },
      { asOfDate: doneISO || nowISO, evaluatedAt: new Date().toISOString() }
    );
    candidateUpdates.complianceVor = compliance.complianceVor;
    return candidateUpdates;
  };
  const activeAppointmentDate = doneISO ? "" : !isMultiDay ? String(appointmentDate || "").slice(0, 10) : "";
  const activeAppointmentTime = doneISO ? "" : normalizeTime(appointmentTime);
  const activeStartDate = doneISO ? "" : isMultiDay ? String(startDate || "").slice(0, 10) : "";
  const activeEndDate = doneISO ? "" : isMultiDay ? String(endDate || startDate || "").slice(0, 10) : "";

  if (safeType === "MOT") {
    const motFreqWeeks = resolveMaintenanceFreqWeeks(vehicle?.motFreq, vehicle?.lastMOT, vehicle?.nextMOT);
    const calculatedMotExpiry = calcNextMaintenanceDue(doneISO, motFreqWeeks);
    const nextMotExpiry = resolveCompletedMotExpiry({
      vehicle,
      fallbackExpiry: calculatedMotExpiry,
    });
    const updates = {
      motBookingId: bookingId,
      motBookedStatus: status,
      motBookedOn: resolveMaintenanceBookedOn({
        bookingId,
        summaryBookingId: vehicle?.motBookingId,
        summaryBookedOn: vehicle?.motBookedOn,
        bookingCreatedAt,
        fallbackISO: nowISO,
      }),
      motAppointmentDate: activeAppointmentDate,
      motAppointmentTime: activeAppointmentTime,
      motBookingStartDate: activeStartDate,
      motBookingEndDate: activeEndDate,
      ...activeSummaryClears("MOT"),
      updatedAt: serverTimestamp(),
    };

    if (doneISO) {
      updates.lastMOT = doneISO;
      updates.lastMot = doneISO;
      updates.nextMOT = nextMotExpiry;
      updates.nextMot = nextMotExpiry;
      updates.nextMotDate = nextMotExpiry;
      updates.motDueDate = nextMotExpiry;
      updates.motExpiryDate = nextMotExpiry;
      updates.motISOWeek = getIsoWeekLabel(nextMotExpiry);
      updates.motHistory = mergeMaintenanceHistory(vehicle?.motHistory, {
        maintenanceTypeId: "mot",
        completedDate: doneISO,
        bookingId,
        provider: trimText(provider),
        bookingRef: trimText(bookingRef),
        notes: trimText(notes),
        recordedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        completedBy: auditUser,
        source: "maintenance_booking",
        documents: [],
      });
    }
    return cleanObject(finalizeUpdates(updates));
  }

  if (safeType === "SERVICE") {
    const updates = {
      serviceBookingId: bookingId,
      serviceBookedStatus: status,
      serviceBookedOn: resolveMaintenanceBookedOn({
        bookingId,
        summaryBookingId: vehicle?.serviceBookingId,
        summaryBookedOn: vehicle?.serviceBookedOn,
        bookingCreatedAt,
        fallbackISO: nowISO,
      }),
      serviceAppointmentDate: activeAppointmentDate,
      serviceAppointmentTime: activeAppointmentTime,
      serviceBookingStartDate: activeStartDate,
      serviceBookingEndDate: activeEndDate,
      ...activeSummaryClears("SERVICE"),
      updatedAt: serverTimestamp(),
    };

    if (doneISO) {
      updates.lastService = doneISO;
      updates.nextService = calculateNextMaintenanceDue({
        maintenanceTypeId: "service",
        completedDate: doneISO,
      });
      updates.serviceHistory = mergeMaintenanceHistory(vehicle?.serviceHistory, {
        maintenanceTypeId: "service",
        completedDate: doneISO,
        bookingId,
        provider: trimText(provider),
        bookingRef: trimText(bookingRef),
        notes: trimText(notes),
        recordedAt: new Date().toISOString(),
      });
    }
    return cleanObject(finalizeUpdates(updates));
  }

  if (safeType === "INSPECTION") {
    const updates = {
      inspectionBookingId: bookingId,
      inspectionBookedStatus: status,
      inspectionBookedOn: resolveMaintenanceBookedOn({
        bookingId,
        summaryBookingId: vehicle?.inspectionBookingId,
        summaryBookedOn: vehicle?.inspectionBookedOn,
        bookingCreatedAt,
        fallbackISO: nowISO,
      }),
      inspectionAppointmentDate: activeAppointmentDate,
      inspectionAppointmentTime: activeAppointmentTime,
      inspectionBookingStartDate: activeStartDate,
      inspectionBookingEndDate: activeEndDate,
      ...activeSummaryClears("INSPECTION"),
      updatedAt: serverTimestamp(),
    };

    if (doneISO) {
      const selected = new Set(
        (Array.isArray(maintenanceTypeIds) && maintenanceTypeIds.length
          ? maintenanceTypeIds
          : ["pmi", "brake_test"]
        ).map((item) => String(item || "").trim().toLowerCase())
      );
      const workflows = ADDITIONAL_MAINTENANCE_WORKFLOWS.filter((workflow) =>
        selected.has(workflow.maintenanceTypeId)
      );
      const completionPatch = buildAdditionalMaintenanceCompletionPatch({
        vehicle,
        workflows,
        completedDate: doneISO,
        completedAt: new Date().toISOString(),
        auditUser,
        bookingId,
        source: "maintenance_booking",
        provider,
        bookingRef,
        notes,
      });
      Object.assign(updates, completionPatch || {});
    }
    return cleanObject(finalizeUpdates(updates));
  }

  return cleanObject(finalizeUpdates({
    workBookingId: bookingId,
    workBookedStatus: status,
    workBookingDate: activeAppointmentDate,
    workBookingTime: activeAppointmentTime,
    workBookingStartDate: activeStartDate,
    workBookingEndDate: activeEndDate,
    ...activeSummaryClears("WORK"),
    updatedAt: serverTimestamp(),
  }));
};

export const buildClearVehicleMaintenanceSummaryUpdates = ({ vehicle = {}, bookingId }) => {
  const clears = {};

  if (String(vehicle?.motBookingId || "") === String(bookingId)) {
    Object.assign(clears, {
      motBookingId: "",
      motBookedStatus: "",
      motBookedOn: "",
      motAppointmentDate: "",
      motAppointmentTime: "",
      motBookingStartDate: "",
      motBookingEndDate: "",
      motBookingFiles: [],
      ...activeSummaryClears("MOT"),
    });
  }

  if (String(vehicle?.serviceBookingId || "") === String(bookingId)) {
    Object.assign(clears, {
      serviceBookingId: "",
      serviceBookedStatus: "",
      serviceBookedOn: "",
      serviceAppointmentDate: "",
      serviceAppointmentTime: "",
      serviceBookingStartDate: "",
      serviceBookingEndDate: "",
      ...activeSummaryClears("SERVICE"),
    });
  }

  if (String(vehicle?.inspectionBookingId || "") === String(bookingId)) {
    Object.assign(clears, {
      inspectionBookingId: "",
      inspectionBookedStatus: "",
      inspectionBookedOn: "",
      inspectionAppointmentDate: "",
      inspectionAppointmentTime: "",
      inspectionBookingStartDate: "",
      inspectionBookingEndDate: "",
      ...activeSummaryClears("INSPECTION"),
    });
  }

  if (String(vehicle?.workBookingId || "") === String(bookingId)) {
    Object.assign(clears, {
      workBookingId: "",
      workBookedStatus: "",
      workBookingDate: "",
      workBookingTime: "",
      workBookingStartDate: "",
      workBookingEndDate: "",
      ...activeSummaryClears("WORK"),
    });
  }

  return Object.keys(clears).length ? { ...clears, updatedAt: serverTimestamp() } : {};
};

const resolveVehicleSnapshot = async (vehicleId, vehicle) => {
  if (vehicle) return vehicle;
  if (!vehicleId) return null;
  const snap = await getDoc(doc(db, "vehicles", vehicleId));
  return snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
};

const resolveBookingSnapshot = async (bookingId, booking) => {
  if (booking) return booking;
  if (!bookingId) return null;
  const snap = await getDoc(doc(db, "maintenanceBookings", bookingId));
  return snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
};

const buildCanonicalBookingItems = ({
  type,
  status,
  completedAtISO,
  sourceDueDate,
  sourceDueIsoWeek,
  maintenanceTypeIds,
  existingBooking,
}) => {
  const safeType = normalizeMaintenanceType(type);
  const typeIds = safeType === "INSPECTION"
    ? [...new Set(
        (Array.isArray(maintenanceTypeIds) && maintenanceTypeIds.length
          ? maintenanceTypeIds
          : ["pmi", "brake_test"]
        ).map(normalizeMaintenanceTypeId)
      )]
    : [normalizeMaintenanceTypeId(maintenanceTypeIdForCoreType(safeType))];
  const priorItems = new Map(
    (Array.isArray(existingBooking?.items) ? existingBooking.items : []).map((item) => [
      normalizeMaintenanceTypeId(item?.maintenanceTypeId || item?.type),
      item,
    ])
  );
  const legalDueDateISO = maintenanceDateOnly(
    sourceDueDate || existingBooking?.sourceDueDateISO || existingBooking?.sourceDueDate
  );
  const legalDueIsoWeek =
    trimText(sourceDueIsoWeek || existingBooking?.sourceDueIsoWeek) ||
    maintenanceIsoWeekLabel(legalDueDateISO);

  return typeIds.map((maintenanceTypeId) => {
    const prior = priorItems.get(maintenanceTypeId) || {};
    return cleanObject({
      ...prior,
      maintenanceTypeId,
      status: normalizeMaintenanceRecordStatus(status || prior.status),
      legalDueDateISO: maintenanceDateOnly(
        prior.legalDueDateISO || prior.sourceDueDateISO || legalDueDateISO
      ),
      legalDueIsoWeek:
        trimText(prior.legalDueIsoWeek || prior.sourceDueIsoWeek) || legalDueIsoWeek,
      completionDateISO:
        String(status || "").trim().toLowerCase() === "completed"
          ? maintenanceDateOnly(completedAtISO)
          : maintenanceDateOnly(prior.completionDateISO || prior.completedDate),
      evidenceStatus: trimText(prior.evidenceStatus) || "not_recorded",
    });
  });
};

const buildBookingPayload = ({
  type,
  vehicleId,
  vehicleLabel,
  status,
  dateInfo,
  appointmentTime,
  provider,
  bookingRef,
  location,
  cost,
  notes,
  equipment,
  sourceDueDate = "",
  sourceDueIsoWeek = "",
  sourceDueKey = "",
  existingBooking = null,
  auditUser,
  maintenanceTypeIds = [],
  scheduleExceptionReason = "",
}) => {
  const completedAtISO =
    status === "Completed"
      ? getMaintenanceCompletionISO({
          isMultiDay: dateInfo.effectiveIsMultiDay,
          appointmentDate: dateInfo.appointmentDateISO || dateInfo.firstSelectedDate,
          startDate: dateInfo.firstSelectedDate,
          endDate: dateInfo.lastSelectedDate,
        })
      : "";
  const canonicalItems = buildCanonicalBookingItems({
    type,
    status,
    completedAtISO,
    sourceDueDate,
    sourceDueIsoWeek,
    maintenanceTypeIds,
    existingBooking,
  });

  return cleanObject({
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    kind: "MAINTENANCE",
    type: normalizeMaintenanceType(type),
    maintenanceTypeId: maintenanceTypeIdForCoreType(type),
    maintenanceTypeIds:
      normalizeMaintenanceType(type) === "INSPECTION"
        ? [...new Set(
            (Array.isArray(maintenanceTypeIds) && maintenanceTypeIds.length
              ? maintenanceTypeIds
              : ["pmi", "brake_test"]
            ).map((item) => String(item || "").trim().toLowerCase())
          )]
        : undefined,
    vehicleId,
    vehicleLabel: vehicleLabel || "",
    status,
    isMultiDay: dateInfo.effectiveIsMultiDay,
    startDate: dateInfo.startDateObject,
    endDate: dateInfo.endDateObject,
    appointmentDate: dateInfo.appointmentDateObject,
    bookingDates: dateInfo.keys,
    appointmentDateISO: dateInfo.appointmentDateISO,
    appointmentTime: normalizeTime(appointmentTime),
    startDateISO: dateInfo.startDateISO,
    endDateISO: dateInfo.endDateISO,
    completedAtISO,
    items: canonicalItems,
    provider: trimText(provider),
    bookingRef: trimText(bookingRef),
    location: trimText(location),
    cost: cost ? String(cost).trim() : "",
    notes: trimText(notes),
    equipment: Array.isArray(equipment) ? equipment : [],
    sourceDueDateISO: String(sourceDueDate || existingBooking?.sourceDueDateISO || "").slice(0, 10),
    sourceDueIsoWeek: trimText(sourceDueIsoWeek || existingBooking?.sourceDueIsoWeek || ""),
    sourceDueKey: trimText(sourceDueKey || existingBooking?.sourceDueKey || ""),
    requirementKey: trimText(existingBooking?.requirementKey || sourceDueKey || existingBooking?.sourceDueKey || ""),
    origin: existingBooking?.origin || { source: "manual", sourceId: "" },
    forecastYear:
      Number(existingBooking?.forecastYear || dateInfo.firstSelectedDate.slice(0, 4) || 0) || null,
    scheduleManuallyAdjusted:
      existingBooking?.origin?.source === "automatic_schedule"
        ? true
        : existingBooking?.scheduleManuallyAdjusted === true,
    scheduleExceptionReason: trimText(scheduleExceptionReason || existingBooking?.scheduleExceptionReason),
    createdBy: existingBooking?.createdBy || auditUser.email,
    createdByUid: existingBooking?.createdByUid || auditUser.uid,
    lastEditedBy: auditUser.email,
    lastEditedByUid: auditUser.uid,
    updatedAt: serverTimestamp(),
  });
};

export const createMaintenanceBooking = async ({
  vehicleId,
  type,
  status,
  useCustomDates = false,
  isMultiDay = false,
  appointmentDate = "",
  appointmentTime = "",
  startDate = "",
  endDate = "",
  dateKeys = [],
  provider = "",
  bookingRef = "",
  location = "",
  cost = "",
  notes = "",
  equipment = [],
  sourceDueDate = "",
  sourceDueIsoWeek = "",
  sourceDueKey = "",
  vehicle = null,
  vehicleLabel = "",
  authState = null,
  maintenanceTypeIds = [],
  requestedRecordId = "",
  scheduleExceptionReason = "",
}) => {
  const dateInfo = normalizeBookingDateInput({
    useCustomDates,
    isMultiDay,
    appointmentDate,
    startDate,
    endDate,
    dateKeys,
  });
  if (!dateInfo.startDateObject || !dateInfo.endDateObject) {
    throw new Error("Maintenance booking needs a valid date.");
  }

  const safeType = normalizeMaintenanceType(type);
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const nowAuditIso = new Date().toISOString();
  const vehicleSnapshot = await resolveVehicleSnapshot(vehicleId, vehicle);
  const resolvedVehicleLabel =
    vehicleLabel ||
    vehicleSnapshot?.name ||
    vehicleSnapshot?.registration ||
    vehicleSnapshot?.reg ||
    vehicleId ||
    "";
  const deterministicId =
    trimText(requestedRecordId) || maintenanceRequirementDocumentId(trimText(sourceDueKey));
  const bookingRefDoc = deterministicId
    ? doc(db, "maintenanceBookings", deterministicId)
    : doc(collection(db, "maintenanceBookings"));
  const requestedSnapshot = deterministicId ? await getDoc(bookingRefDoc) : null;
  const existingRequested = requestedSnapshot?.exists()
    ? { id: requestedSnapshot.id, ...(requestedSnapshot.data() || {}) }
    : null;
  const bookingPayload = buildBookingPayload({
    type: safeType,
    vehicleId,
    vehicleLabel: resolvedVehicleLabel,
    status,
    dateInfo,
    appointmentTime,
    provider,
    bookingRef,
    location,
    cost,
    notes,
    equipment,
    sourceDueDate,
    sourceDueIsoWeek,
    sourceDueKey,
    existingBooking: existingRequested,
    auditUser,
    maintenanceTypeIds,
    scheduleExceptionReason,
  });
  const payload = tenantPayload(authState, {
    ...bookingPayload,
    cancellationReason: "",
    cancellationSource: "",
    cancellationSourceRecordId: "",
    cancelledAtISO: "",
    cancelledBy: null,
    createdAt: existingRequested?.createdAt || serverTimestamp(),
    history: [
      ...(Array.isArray(existingRequested?.history) ? existingRequested.history : []),
      existingRequested
        ? buildMaintenanceHistoryEntry({
            action: "Booked",
            user: auditUser,
            timestamp: nowAuditIso,
            changes: [
              `Status: ${String(existingRequested.status || "Requested")} -> ${status}`,
              ...(scheduleExceptionReason ? [`Outside due week reason: ${scheduleExceptionReason}`] : []),
            ],
          })
        : buildMaintenanceCreatedHistoryEntry({
            booking: bookingPayload,
            user: auditUser,
            timestamp: nowAuditIso,
          }),
    ],
  });

  const completedISO = payload.completedAtISO || "";
  const batch = writeBatch(db);
  batch.set(bookingRefDoc, payload, { merge: Boolean(existingRequested) });

  if (vehicleId && vehicleSnapshot) {
    batch.update(
      doc(db, "vehicles", vehicleId),
      tenantPayload(authState, buildVehicleMaintenanceSummaryUpdates({
        type: safeType,
        vehicle: vehicleSnapshot,
        bookingId: bookingRefDoc.id,
        status,
        isMultiDay: dateInfo.effectiveIsMultiDay,
        appointmentDate: dateInfo.appointmentDateISO || dateInfo.firstSelectedDate,
        appointmentTime,
        startDate: dateInfo.firstSelectedDate,
        endDate: dateInfo.lastSelectedDate,
        provider,
        bookingRef,
        notes,
        completedISO,
        sourceDueDate,
        bookingCreatedAt: nowAuditIso,
        maintenanceTypeIds,
        auditUser,
      }))
    );
  }

  await batch.commit();
  return { id: bookingRefDoc.id, ...payload };
};

export const updateMaintenanceBooking = async ({
  bookingId,
  booking = null,
  vehicleId,
  type,
  status,
  useCustomDates = false,
  isMultiDay = false,
  appointmentDate = "",
  appointmentTime = "",
  startDate = "",
  endDate = "",
  dateKeys = [],
  provider = "",
  bookingRef = "",
  location = "",
  cost = "",
  notes = "",
  equipment = [],
  vehicle = null,
  vehicleLabel = "",
  authState = null,
  maintenanceTypeIds = [],
  scheduleExceptionReason = "",
}) => {
  const existingBooking = await resolveBookingSnapshot(bookingId, booking);
  if (!existingBooking) throw new Error("Maintenance booking not found.");

  const resolvedVehicleId = vehicleId || existingBooking.vehicleId || "";
  const vehicleSnapshot = await resolveVehicleSnapshot(resolvedVehicleId, vehicle);
  const safeType = normalizeMaintenanceType(type || existingBooking.type);
  const normalizedRequestedStatus = String(status || existingBooking.status || "")
    .trim()
    .toLowerCase();
  if (normalizedRequestedStatus === "completed" || normalizedRequestedStatus === "complete") {
    throw new Error("Use the maintenance completion action to complete this booking.");
  }
  if (normalizedRequestedStatus === "cancelled" || normalizedRequestedStatus === "canceled") {
    throw new Error("Use the maintenance cancellation action to cancel this booking.");
  }
  const currentCanonicalStatus = normalizeMaintenanceRecord(existingBooking, { id: bookingId }).status;
  const nextCanonicalStatus = normalizeMaintenanceRecordStatus(status || existingBooking.status);
  const allowedTransitions = {
    requested: new Set(["booked"]),
    booked: new Set(["booked", "in_progress"]),
    in_progress: new Set(["in_progress", "booked"]),
    deferred: new Set(["deferred", "booked"]),
  };
  if (
    allowedTransitions[currentCanonicalStatus] &&
    !allowedTransitions[currentCanonicalStatus].has(nextCanonicalStatus)
  ) {
    throw new Error(`Invalid maintenance transition: ${currentCanonicalStatus} -> ${nextCanonicalStatus}.`);
  }
  const previousSafeType = normalizeMaintenanceType(existingBooking.type);
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const nowAuditIso = new Date().toISOString();
  const dateInfo = normalizeBookingDateInput({
    useCustomDates,
    isMultiDay,
    appointmentDate,
    startDate,
    endDate,
    dateKeys,
  });
  if (!dateInfo.startDateObject || !dateInfo.endDateObject) {
    throw new Error("Maintenance booking needs a valid date.");
  }

  const payload = buildBookingPayload({
    type: safeType,
    vehicleId: resolvedVehicleId,
    vehicleLabel:
      vehicleLabel ||
      vehicleSnapshot?.name ||
      vehicleSnapshot?.registration ||
      vehicleSnapshot?.reg ||
      existingBooking.vehicleLabel ||
      "",
    status,
    dateInfo,
    appointmentTime,
    provider,
    bookingRef,
    location,
    cost,
    notes,
    equipment,
    existingBooking,
    auditUser,
    maintenanceTypeIds:
      maintenanceTypeIds.length
        ? maintenanceTypeIds
        : existingBooking.maintenanceTypeIds || [],
    scheduleExceptionReason,
  });
  const changeLines = buildMaintenanceChangeList(existingBooking, payload);
  payload.history = [
    ...(Array.isArray(existingBooking.history) ? existingBooking.history : []),
    buildMaintenanceHistoryEntry({
      action: "Edited",
      user: auditUser,
      timestamp: nowAuditIso,
      changes: changeLines,
    }),
  ];

  const scopedPayload = tenantPayload(authState, payload);
  const batch = writeBatch(db);
  batch.update(doc(db, "maintenanceBookings", bookingId), scopedPayload);

  if (resolvedVehicleId && vehicleSnapshot) {
    const typeChangeClears =
      previousSafeType !== safeType
        ? buildClearVehicleMaintenanceSummaryUpdates({
            vehicle: vehicleSnapshot,
            bookingId,
          })
        : {};
    const vehicleUpdates = buildVehicleMaintenanceSummaryUpdates({
      type: safeType,
      vehicle: vehicleSnapshot,
      bookingId,
      status,
      isMultiDay: dateInfo.effectiveIsMultiDay,
      appointmentDate: dateInfo.appointmentDateISO || dateInfo.firstSelectedDate,
      appointmentTime,
      startDate: dateInfo.firstSelectedDate,
      endDate: dateInfo.lastSelectedDate,
      provider,
      bookingRef,
      notes,
      completedISO: payload.completedAtISO || "",
      sourceDueDate: payload.sourceDueDateISO || existingBooking.sourceDueDateISO || "",
      bookingCreatedAt: existingBooking.createdAt || nowAuditIso,
      maintenanceTypeIds:
        maintenanceTypeIds.length
          ? maintenanceTypeIds
          : existingBooking.maintenanceTypeIds || [],
      auditUser,
    });

    batch.update(
      doc(db, "vehicles", resolvedVehicleId),
      tenantPayload(authState, { ...typeChangeClears, ...vehicleUpdates })
    );
  }

  await batch.commit();
  return { id: bookingId, ...scopedPayload };
};

export const rescheduleMaintenanceBooking = async ({
  bookingId,
  booking = null,
  updates = {},
  reason = "",
  authState = null,
}) => {
  const existingBooking = await resolveBookingSnapshot(bookingId, booking);
  if (!existingBooking) throw new Error("Maintenance booking not found.");
  const canonical = normalizeMaintenanceRecord(existingBooking, { id: bookingId });
  if (canonical.status === "requested") {
    throw new Error("Book this maintenance requirement before moving its appointment.");
  }
  if (!["booked", "in_progress", "deferred"].includes(canonical.status)) {
    throw new Error("Only a booked or in-progress maintenance appointment can be moved.");
  }
  const proposed = { ...existingBooking, ...updates };
  const targetDateKeys = bookingToDateKeys(proposed);
  if (!targetDateKeys.length) throw new Error("Choose a valid appointment date.");
  const legalWeeks = new Set(canonical.items.map((item) => item.legalDueIsoWeek).filter(Boolean));
  const bookedWeeks = new Set(targetDateKeys.map(maintenanceIsoWeekLabel).filter(Boolean));
  const outsideLegalWeek =
    legalWeeks.size > 0 && [...bookedWeeks].some((week) => !legalWeeks.has(week));
  const scheduleExceptionReason = trimText(reason || proposed.scheduleExceptionReason);
  if (outsideLegalWeek && !scheduleExceptionReason) {
    throw new Error("Enter a reason for moving this appointment outside its legal due ISO week.");
  }
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const nowAuditIso = new Date().toISOString();
  const previousDates = canonical.schedule.bookingDates;
  const patch = tenantPayload(authState, {
    ...updates,
    status: canonical.status === "in_progress" ? "In Progress" : "Booked",
    scheduleExceptionReason: outsideLegalWeek ? scheduleExceptionReason : "",
    scheduleManuallyAdjusted:
      existingBooking?.origin?.source === "automatic_schedule"
        ? true
        : existingBooking?.scheduleManuallyAdjusted === true,
    lastEditedBy: auditUser.email,
    lastEditedByUid: auditUser.uid,
    history: [
      ...(Array.isArray(existingBooking.history) ? existingBooking.history : []),
      buildMaintenanceHistoryEntry({
        action: "Rescheduled",
        user: auditUser,
        timestamp: nowAuditIso,
        changes: [
          `Booking dates: ${previousDates.join(", ") || "Unknown"} -> ${targetDateKeys.join(", ")}`,
          ...(scheduleExceptionReason ? [`Reason: ${scheduleExceptionReason}`] : []),
        ],
      }),
    ],
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "maintenanceBookings", bookingId), patch);
  return { id: bookingId, ...existingBooking, ...patch };
};

export const completeMaintenanceBookingItems = async ({
  bookingId,
  maintenanceTypeIds = [],
  booking = null,
  vehicleId = "",
  vehicle = null,
  completedISO = "",
  authState = null,
  documentsByType = {},
}) => {
  const existingBooking = await resolveBookingSnapshot(bookingId, booking);
  if (!existingBooking) throw new Error("Maintenance booking not found.");
  const selected = new Set(
    (Array.isArray(maintenanceTypeIds) ? maintenanceTypeIds : [])
      .map(normalizeMaintenanceTypeId)
      .filter((typeId) => typeId !== "other")
  );
  if (!selected.size) throw new Error("Select at least one maintenance item to complete.");

  const dateKeys = bookingToDateKeys(existingBooking);
  const completionDate =
    maintenanceDateOnly(completedISO) ||
    dateKeys.at(-1) ||
    maintenanceDateOnly(existingBooking.appointmentDateISO || existingBooking.startDateISO);
  if (!completionDate) throw new Error("This booking needs a valid completion date.");

  const canonical = normalizeMaintenanceRecord(existingBooking, { id: bookingId });
  if (canonical.status === "requested") {
    throw new Error("Book this maintenance requirement before marking any item complete.");
  }
  const selectedAvailable = new Set(
    canonical.items
      .filter((item) => item.status !== "completed")
      .map((item) => item.maintenanceTypeId)
      .filter((typeId) => selected.has(typeId))
  );
  if (!selectedAvailable.size) throw new Error("The selected items are not part of this booking.");

  const evidenceIssues = maintenanceCompletionEvidenceIssues(
    canonical,
    [...selectedAvailable],
    documentsByType
  );

  const completedRecord = completeCanonicalMaintenanceItems(
    canonical,
    [...selectedAvailable],
    completionDate,
    { documentsByType }
  );
  const items = completedRecord.items;
  const allCompleted = completedRecord.allCompleted;
  const nextStatus = allCompleted ? "Completed" : "Booked";
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const nowAuditIso = new Date().toISOString();
  const labels = [...selectedAvailable].map((typeId) =>
    ADDITIONAL_MAINTENANCE_WORKFLOWS.find((workflow) => workflow.maintenanceTypeId === typeId)?.label || typeId
  );
  const history = [
    ...(Array.isArray(existingBooking.history) ? existingBooking.history : []),
    buildMaintenanceHistoryEntry({
      action: "Maintenance items completed",
      user: auditUser,
      timestamp: nowAuditIso,
      changes: [
        ...labels.map((label) => `${label}: completed on ${completionDate}`),
        ...evidenceIssues.map((issue) =>
          issue.endsWith(":pmi")
            ? "PMI inspection evidence outstanding"
            : "Brake-test evidence outstanding"
        ),
      ],
    }),
  ];

  const resolvedVehicleId = vehicleId || existingBooking.vehicleId || "";
  const vehicleSnapshot = await resolveVehicleSnapshot(resolvedVehicleId, vehicle);
  const batch = writeBatch(db);
  const bookingPatch = tenantPayload(authState, {
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    items,
    status: nextStatus,
    completedAtISO: allCompleted ? completionDate : "",
    lastEditedBy: auditUser.email,
    lastEditedByUid: auditUser.uid,
    history,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "maintenanceBookings", bookingId), bookingPatch);
  let vehiclePatch = null;
  if (resolvedVehicleId && vehicleSnapshot) {
    const workflows = ADDITIONAL_MAINTENANCE_WORKFLOWS.filter((workflow) =>
      selectedAvailable.has(workflow.maintenanceTypeId)
    );
    const completionPatch = buildAdditionalMaintenanceCompletionPatch({
      vehicle: vehicleSnapshot,
      workflows,
      completedDate: completionDate,
      completedAt: nowAuditIso,
      auditUser,
      bookingId,
      source: "maintenance_booking",
      provider: existingBooking.provider || "",
      bookingRef: existingBooking.bookingRef || "",
      notes: existingBooking.notes || "",
    }) || {};
    vehiclePatch = tenantPayload(authState, {
      ...completionPatch,
      inspectionBookedStatus: nextStatus,
      ...(allCompleted
        ? buildClearVehicleMaintenanceSummaryUpdates({ vehicle: vehicleSnapshot, bookingId })
        : {}),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, "vehicles", resolvedVehicleId), vehiclePatch);
  }

  await batch.commit();
  if (resolvedVehicleId && vehicleSnapshot) {
    repairAnnualForecastAfterCompletion({
      vehicle: { ...vehicleSnapshot, id: resolvedVehicleId },
      vehiclePatch,
      completionDateISO: completionDate,
      authState,
    }).catch((error) => {
      console.error("Could not reforecast annual maintenance after partial completion:", error);
    });
  }
  return {
    id: bookingId,
    ...bookingPatch,
    items,
    status: nextStatus,
    completedAtISO: allCompleted ? completionDate : "",
    vehiclePatch,
    nextRequestedRecordIds: [],
  };
};

export const cancelMaintenanceBooking = async ({
  bookingId,
  booking = null,
  vehicleId = "",
  vehicle = null,
  authState = null,
  cancellationReason = "",
  cancellationSource = "manual",
  sourceRecordId = "",
  cancellationMode = "appointment",
}) => {
  const existingBooking = await resolveBookingSnapshot(bookingId, booking);
  if (!existingBooking) throw new Error("Maintenance booking not found.");

  const resolvedVehicleId = vehicleId || existingBooking.vehicleId || "";
  const vehicleSnapshot = await resolveVehicleSnapshot(resolvedVehicleId, vehicle);
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const nowAuditIso = new Date().toISOString();
  const returnToRequested =
    String(cancellationMode || "appointment").trim().toLowerCase() !== "requirement" &&
    String(cancellationSource || "manual").trim() !== "requirement_cancelled";
  const nextStatus = returnToRequested ? "Requested" : "Cancelled";
  const history = [
    ...(Array.isArray(existingBooking.history) ? existingBooking.history : []),
    buildMaintenanceHistoryEntry({
      action: returnToRequested ? "Appointment cancelled" : "Cancelled",
      user: auditUser,
      timestamp: nowAuditIso,
      changes: [
        `Status: ${String(existingBooking.status || "Blank")} -> ${nextStatus}`,
        ...(cancellationReason ? [`Reason: ${cancellationReason}`] : []),
      ],
    }),
  ];

  const batch = writeBatch(db);
  const canonical = normalizeMaintenanceRecord(existingBooking, { id: bookingId });
  batch.update(doc(db, "maintenanceBookings", bookingId), tenantPayload(authState, {
    status: nextStatus,
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    items: canonical.items.map((item) => ({
      ...item,
      status: returnToRequested ? "requested" : "cancelled",
    })),
    ...(returnToRequested
      ? {
          bookingDates: [],
          appointmentDate: null,
          appointmentDateISO: "",
          startDate: null,
          startDateISO: "",
          endDate: null,
          endDateISO: "",
        }
      : {}),
    lastEditedBy: auditUser.email,
    lastEditedByUid: auditUser.uid,
    cancellationReason: String(cancellationReason || "").trim(),
    cancellationSource: String(cancellationSource || "manual").trim(),
    cancellationSourceRecordId: String(sourceRecordId || "").trim(),
    cancelledAtISO: nowAuditIso,
    cancelledBy: auditUser,
    history,
    updatedAt: serverTimestamp(),
  }));

  const clears = buildClearVehicleMaintenanceSummaryUpdates({ vehicle: vehicleSnapshot, bookingId });
  if (resolvedVehicleId && Object.keys(clears).length) {
    batch.update(doc(db, "vehicles", resolvedVehicleId), tenantPayload(authState, clears));
  }

  await batch.commit();
  return { id: bookingId, status: nextStatus, history };
};

export const cancelVorInspectionBookings = async ({
  bookings = [],
  vehicleId = "",
  vehicle = null,
  offRoadDate = "",
  authState = null,
  cancellationSource = "vehicle_vor_transition",
  sourceRecordId = "",
} = {}) => {
  const candidates = getVorInspectionCancellationCandidates(bookings, {
    vehicle: vehicle || {},
    offRoadDate,
  });
  const cancelled = await Promise.all(
    candidates.map((booking) =>
      cancelMaintenanceBooking({
        bookingId: booking.id,
        booking,
        vehicleId,
        vehicle,
        authState,
        cancellationReason: "Vehicle became VOR; previous PMI/brake plans are no longer valid",
        cancellationSource,
        sourceRecordId,
        cancellationMode: "requirement",
      })
    )
  );
  return {
    cancelledIds: cancelled.map((item) => item.id),
    cancelled,
    candidates,
  };
};

export const commitVehicleVorTransition = async ({
  vehicleId = "",
  vehiclePayload = {},
  bookings = [],
  vehicle = null,
  offRoadDate = "",
  authState = null,
  cancellationSource = "vehicle_vor_transition",
  sourceRecordId = "",
} = {}) => {
  if (!String(vehicleId || "").trim()) throw new Error("Vehicle id is required.");
  const vehicleSnapshot = vehicle || vehiclePayload || {};
  const candidates = getVorInspectionCancellationCandidates(bookings, {
    vehicle: vehicleSnapshot,
    offRoadDate,
  });
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const cancelledAt = new Date().toISOString();
  const batch = writeBatch(db);
  let vehicleUpdate = { ...vehiclePayload };
  candidates.forEach((booking) => {
    Object.assign(
      vehicleUpdate,
      buildClearVehicleMaintenanceSummaryUpdates({
        vehicle: { ...vehicleSnapshot, ...vehicleUpdate },
        bookingId: booking.id,
      })
    );
    batch.update(
      doc(db, "maintenanceBookings", booking.id),
      tenantPayload(authState, {
        ...buildVorInspectionCancellationPatch(booking, {
          cancelledAt,
          cancelledBy: auditUser,
          cancellationSource,
          sourceRecordId,
        }),
        updatedAt: serverTimestamp(),
      })
    );
  });
  batch.update(
    doc(db, "vehicles", vehicleId),
    tenantPayload(authState, { ...vehicleUpdate, updatedAt: serverTimestamp() })
  );
  await batch.commit();
  return {
    cancelledIds: candidates.map((booking) => booking.id),
    candidates,
    vehicleUpdate,
  };
};

export const deleteMaintenanceBooking = async ({
  bookingId,
  booking = null,
  vehicleId = "",
  vehicle = null,
  authState = null,
  reason = "",
}) => {
  const role = String(
    authState?.userDoc?.role || authState?.userDoc?.platformRole || authState?.userDoc?.accessRole || ""
  ).trim().toLowerCase();
  if (!["admin", "platformadmin", "platform_admin"].includes(role)) {
    throw new Error("Only an authorised administrator can cancel a legal maintenance requirement.");
  }
  const archiveReason = trimText(reason);
  if (!archiveReason) {
    throw new Error("Enter a reason for cancelling this maintenance requirement.");
  }
  const existingBooking = await resolveBookingSnapshot(bookingId, booking);
  if (!existingBooking) throw new Error("Maintenance booking not found.");
  const resolvedVehicleId = vehicleId || existingBooking?.vehicleId || "";
  const vehicleSnapshot = await resolveVehicleSnapshot(resolvedVehicleId, vehicle);
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const archivedAtISO = new Date().toISOString();
  const canonical = normalizeMaintenanceRecord(existingBooking, { id: bookingId });
  const history = [
    ...(Array.isArray(existingBooking.history) ? existingBooking.history : []),
    buildMaintenanceHistoryEntry({
      action: "Archived",
      user: auditUser,
      timestamp: archivedAtISO,
      changes: [
        `Status: ${String(existingBooking.status || "Blank")} -> Archived`,
        `Reason: ${archiveReason}`,
      ],
    }),
  ];

  const batch = writeBatch(db);
  batch.update(doc(db, "maintenanceBookings", bookingId), tenantPayload(authState, {
    status: "Archived",
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    items: canonical.items.map((item) => ({ ...item, status: "archived" })),
    archivedAtISO,
    archivedBy: auditUser,
    archiveReason,
    history,
    updatedAt: serverTimestamp(),
  }));

  const clears = buildClearVehicleMaintenanceSummaryUpdates({ vehicle: vehicleSnapshot, bookingId });
  if (resolvedVehicleId && Object.keys(clears).length) {
    batch.update(doc(db, "vehicles", resolvedVehicleId), clears);
  }

  await batch.commit();
  return { id: bookingId, archived: true, status: "Archived", history };
};

export const completeMaintenanceBooking = async ({
  bookingId,
  booking = null,
  vehicleId = "",
  vehicle = null,
  completedISO = "",
  authState = null,
  documentsByType = {},
}) => {
  const existingBooking = await resolveBookingSnapshot(bookingId, booking);
  if (!existingBooking) throw new Error("Maintenance booking not found.");

  const resolvedVehicleId = vehicleId || existingBooking.vehicleId || "";
  const vehicleSnapshot = await resolveVehicleSnapshot(resolvedVehicleId, vehicle);
  const safeType = normalizeMaintenanceType(existingBooking.type);
  const dateKeys = bookingToDateKeys(existingBooking);
  const firstSelectedDate = dateKeys[0] || "";
  const lastSelectedDate = dateKeys[dateKeys.length - 1] || firstSelectedDate;
  const resolvedCompletedISO =
    String(completedISO || "").slice(0, 10) ||
    getMaintenanceCompletionISO({
      isMultiDay: dateKeys.length > 1 || Boolean(existingBooking.isMultiDay),
      appointmentDate: firstSelectedDate,
      startDate: firstSelectedDate,
      endDate: lastSelectedDate,
    });

  if (!resolvedCompletedISO) {
    throw new Error("This booking needs a valid booking date before it can be completed.");
  }

  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const nowAuditIso = new Date().toISOString();
  const canonical = normalizeMaintenanceRecord(existingBooking, { id: bookingId });
  if (canonical.status === "requested") {
    throw new Error("Book this maintenance requirement before marking it complete.");
  }
  const selectedTypeIds = canonical.items
    .filter((item) => item.status !== "completed")
    .map((item) => item.maintenanceTypeId);
  const completionCoreType = safeType === "WORK"
    ? selectedTypeIds.length === 1 && selectedTypeIds[0] === "mot"
      ? "MOT"
      : selectedTypeIds.length === 1 && selectedTypeIds[0] === "service"
      ? "SERVICE"
      : selectedTypeIds.some((typeId) => ["pmi", "brake_test"].includes(typeId))
      ? "INSPECTION"
      : "WORK"
    : safeType;
  const evidenceIssues = maintenanceCompletionEvidenceIssues(
    canonical,
    selectedTypeIds,
    documentsByType
  );
  const completedRecord = completeCanonicalMaintenanceItems(
    canonical,
    selectedTypeIds,
    resolvedCompletedISO,
    { documentsByType }
  );
  const history = [
    ...(Array.isArray(existingBooking.history) ? existingBooking.history : []),
    buildMaintenanceHistoryEntry({
      action: "Completed",
      user: auditUser,
      timestamp: nowAuditIso,
      changes: [
        `Status: ${String(existingBooking.status || "Blank")} -> Completed`,
        `Completed date: ${resolvedCompletedISO}`,
        ...evidenceIssues.map((issue) =>
          issue.endsWith(":pmi")
            ? "PMI inspection evidence outstanding"
            : "Brake-test evidence outstanding"
        ),
      ],
    }),
  ];

  const batch = writeBatch(db);
  batch.update(doc(db, "maintenanceBookings", bookingId), tenantPayload(authState, {
    status: "Completed",
    maintenanceTypeId:
      getMaintenanceTypeId(existingBooking) || maintenanceTypeIdForCoreType(safeType),
    completedAtISO: resolvedCompletedISO,
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    items: completedRecord.items,
    lastEditedBy: auditUser.email,
    lastEditedByUid: auditUser.uid,
    history,
    updatedAt: serverTimestamp(),
  }));
  let vehiclePatch = null;
  if (resolvedVehicleId && vehicleSnapshot) {
    vehiclePatch = buildVehicleMaintenanceSummaryUpdates({
      type: completionCoreType,
      vehicle: vehicleSnapshot,
      bookingId,
      status: "Completed",
      isMultiDay: dateKeys.length > 1 || Boolean(existingBooking.isMultiDay),
      appointmentDate: firstSelectedDate,
      startDate: firstSelectedDate,
      endDate: lastSelectedDate,
      provider: existingBooking.provider || "",
      bookingRef: existingBooking.bookingRef || "",
      notes: existingBooking.notes || "",
      completedISO: resolvedCompletedISO,
      sourceDueDate: existingBooking.sourceDueDateISO || "",
      bookingCreatedAt: existingBooking.createdAt || nowAuditIso,
      maintenanceTypeIds: selectedTypeIds,
    });
    batch.update(doc(db, "vehicles", resolvedVehicleId), tenantPayload(authState, vehiclePatch));
  }

  await batch.commit();
  if (resolvedVehicleId && vehicleSnapshot) {
    repairAnnualForecastAfterCompletion({
      vehicle: { ...vehicleSnapshot, id: resolvedVehicleId },
      vehiclePatch,
      completionDateISO: resolvedCompletedISO,
      authState,
    }).catch((error) => {
      console.error("Could not reforecast annual maintenance after completion:", error);
    });
  }
  return {
    id: bookingId,
    status: "Completed",
    completedAtISO: resolvedCompletedISO,
    history,
    vehiclePatch,
    items: completedRecord.items,
    nextRequestedRecordIds: [],
  };
};

const canonicalWorkshopStatus = (value) => {
  const status = String(value || "").trim().toLowerCase().replaceAll("_", " ");
  if (status === "planned" || status === "requested") return "Requested";
  if (status === "booked") return "Booked";
  if (status === "in progress") return "In Progress";
  if (["completed", "ready to invoice", "closed"].includes(status)) return "Completed";
  if (["cancelled", "canceled", "archived"].includes(status)) return "Archived";
  return "Requested";
};

export const createMaintenanceWorkBooking = async ({ job = {}, authState = null }) => {
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const nowAuditIso = new Date().toISOString();
  const itemType = normalizeMaintenanceTypeId(job.type || "repair");
  const dueDate = maintenanceDateOnly(job.dueDate);
  const plannedDate = maintenanceDateOnly(job.plannedDate);
  const status = canonicalWorkshopStatus(job.status || "planned");
  const workshop = cleanObject({
    ...job,
    status: String(job.status || "planned").trim().toLowerCase(),
    dueDate,
    plannedDate,
  });
  const payload = cleanObject({
    schemaVersion: MAINTENANCE_RECORD_SCHEMA_VERSION,
    kind: "MAINTENANCE",
    type: "WORK",
    origin: { source: "workshop", sourceId: "" },
    vehicleId: trimText(job.assetId || job.vehicleId),
    vehicleLabel: trimText(job.assetLabel || job.vehicleLabel),
    status,
    maintenanceTypeId: itemType,
    maintenanceTypeIds: [itemType],
    items: [{
      maintenanceTypeId: itemType,
      status: normalizeMaintenanceRecordStatus(status),
      legalDueDateISO: dueDate,
      legalDueIsoWeek: maintenanceIsoWeekLabel(dueDate),
      completionDateISO: status === "Completed" ? maintenanceDateOnly(job.completedAt || nowAuditIso) : "",
      evidenceStatus: "not_required",
    }],
    workshop,
    title: trimText(job.title),
    notes: trimText(job.notes),
    createdAt: nowAuditIso,
    createdAtServer: serverTimestamp(),
    updatedAt: nowAuditIso,
    updatedAtServer: serverTimestamp(),
    createdBy: auditUser.email,
    lastEditedBy: auditUser.email,
    history: [buildMaintenanceHistoryEntry({
      action: "Requested",
      user: auditUser,
      timestamp: nowAuditIso,
      changes: ["Workshop maintenance requirement created"],
    })],
  });
  const reference = await addDoc(
    collection(db, "maintenanceBookings"),
    tenantPayload(authState, payload)
  );
  return { id: reference.id, ...payload };
};

export const updateMaintenanceWorkBooking = async ({
  bookingId,
  patch = {},
  authState = null,
}) => {
  const existingBooking = await resolveBookingSnapshot(bookingId);
  if (!existingBooking) throw new Error("Maintenance work record not found.");
  const auditUser = getMaintenanceAuditIdentity(auth.currentUser);
  const nowAuditIso = new Date().toISOString();
  const currentWorkshop = existingBooking.workshop && typeof existingBooking.workshop === "object"
    ? existingBooking.workshop
    : {};
  const nextWorkshop = cleanObject({ ...currentWorkshop, ...patch });
  const status = canonicalWorkshopStatus(patch.status || nextWorkshop.status || existingBooking.status);
  const itemType = normalizeMaintenanceTypeId(
    patch.type || nextWorkshop.type || existingBooking.maintenanceTypeId || "repair"
  );
  const dueDate = maintenanceDateOnly(patch.dueDate || nextWorkshop.dueDate);
  const scheduledDate = maintenanceDateOnly(
    patch.bookedDate || patch.plannedDate || nextWorkshop.bookedDate || nextWorkshop.plannedDate
  );
  const existingItems = Array.isArray(existingBooking.items) ? existingBooking.items : [];
  const items = (existingItems.length ? existingItems : [{ maintenanceTypeId: itemType }]).map((item) => ({
    ...item,
    maintenanceTypeId: normalizeMaintenanceTypeId(item.maintenanceTypeId || itemType),
    status: normalizeMaintenanceRecordStatus(status),
    legalDueDateISO: maintenanceDateOnly(item.legalDueDateISO || dueDate),
    legalDueIsoWeek: item.legalDueIsoWeek || maintenanceIsoWeekLabel(item.legalDueDateISO || dueDate),
    completionDateISO:
      status === "Completed"
        ? maintenanceDateOnly(item.completionDateISO || patch.completedAt || nowAuditIso)
        : maintenanceDateOnly(item.completionDateISO),
  }));
  const payload = tenantPayload(authState, {
    status,
    maintenanceTypeId: itemType,
    maintenanceTypeIds: [itemType],
    items,
    workshop: nextWorkshop,
    ...(status === "Requested" || !scheduledDate
      ? {}
      : {
          bookingDates: [ymdToDate(scheduledDate)],
          appointmentDate: ymdToDate(scheduledDate),
          appointmentDateISO: scheduledDate,
          startDate: ymdToDate(scheduledDate),
          startDateISO: scheduledDate,
          endDate: ymdToDate(scheduledDate),
          endDateISO: scheduledDate,
        }),
    title: trimText(patch.title || nextWorkshop.title || existingBooking.title),
    notes: trimText(patch.notes || nextWorkshop.notes || existingBooking.notes),
    updatedAt: nowAuditIso,
    updatedAtServer: serverTimestamp(),
    lastEditedBy: auditUser.email,
    history: [
      ...(Array.isArray(existingBooking.history) ? existingBooking.history : []),
      buildMaintenanceHistoryEntry({
        action: "Workshop updated",
        user: auditUser,
        timestamp: nowAuditIso,
        changes: [`Status: ${existingBooking.status || "Requested"} -> ${status}`],
      }),
    ],
  });
  await updateDoc(doc(db, "maintenanceBookings", bookingId), payload);
  return { id: bookingId, ...existingBooking, ...payload };
};
