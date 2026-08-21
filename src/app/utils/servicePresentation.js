import { getRecurringMaintenanceWorkflow } from "./maintenanceSchema.js";
import { calculateNextMaintenanceDue } from "./maintenanceRecord.js";
import { getRegisterComplianceState } from "./vehicleRegisterPresentation.js";
import { dateOnlyString, formatDateForDisplay, toDateLike } from "./serviceRecordCompat.js";

const serviceWorkflow = getRecurringMaintenanceWorkflow("service");

export const SERVICE_WARNING_DAYS = Number(serviceWorkflow?.warningWeeks || 0) * 7;

export const resolveServiceRecordDate = (record = {}) =>
  record?.serviceDateOnly ||
  record?.serviceDate ||
  record?.completedDate ||
  record?.completedAt ||
  record?.createdAt ||
  record?.updatedAt ||
  "";

export const getServiceRecordPresentation = (record = {}) => {
  const dateValue = resolveServiceRecordDate(record);
  const serviceType = String(record?.serviceType || "").trim();
  const bookingRef = String(record?.bookingRef || "").trim();
  const provider = String(record?.provider || record?.signedBy || record?.completedBy || "").trim();

  return {
    dateValue,
    dateOnly: dateOnlyString(dateValue),
    dateDisplay: formatDateForDisplay(dateValue) || "-",
    title: serviceType || bookingRef || String(record?.title || "").trim() || "Service record",
    serviceType,
    bookingRef,
    provider,
    location: String(record?.location || "").trim(),
  };
};

export const reconcileServiceSchedule = (
  vehicle = {},
  { completedDate = "", dueDate = "" } = {}
) => {
  const recordedLastService = dateOnlyString(vehicle?.lastService || vehicle?.lastServiceDate);
  const recordedNextService = dateOnlyString(
    dueDate || vehicle?.nextService || vehicle?.nextServiceDate || vehicle?.serviceDueDate
  );
  const latestCompletion = dateOnlyString(completedDate);

  if (!latestCompletion) {
    return {
      lastServiceDate: recordedLastService,
      nextServiceDate: recordedNextService,
      supersededDueDate: false,
    };
  }

  const lastServiceDate =
    !recordedLastService || latestCompletion > recordedLastService
      ? latestCompletion
      : recordedLastService;
  const calculatedNextService = calculateNextMaintenanceDue({
    maintenanceTypeId: "service",
    completedDate: latestCompletion,
    vehicle,
  });
  const completionIsLatest = !recordedLastService || latestCompletion >= recordedLastService;
  const dueWasSuperseded = Boolean(recordedNextService && recordedNextService <= latestCompletion);
  const nextServiceDate =
    completionIsLatest && calculatedNextService
      ? calculatedNextService
      : dueWasSuperseded
        ? ""
        : recordedNextService;

  return {
    lastServiceDate,
    nextServiceDate,
    supersededDueDate: dueWasSuperseded,
  };
};

const startOfDay = (value) => {
  const parsed = toDateLike(value);
  return parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null;
};

export const getServiceDuePresentation = (
  vehicle = {},
  { dueDate, referenceDate = new Date() } = {}
) => {
  const compliance = getRegisterComplianceState(vehicle, "service");
  if (compliance.status === "not-applicable") {
    return {
      status: "not-applicable",
      dueDate: null,
      dueDateValue: "",
      dateDisplay: "N/A",
      daysUntilDue: null,
      reason: compliance.reason,
    };
  }

  const dueDateValue = dateOnlyString(dueDate === undefined ? compliance.value : dueDate);
  const due = startOfDay(dueDateValue);
  const today = startOfDay(referenceDate);
  if (!due || !today) {
    return {
      status: "unknown",
      dueDate: null,
      dueDateValue: "",
      dateDisplay: "-",
      daysUntilDue: null,
      reason: "No service due date recorded",
    };
  }

  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86400000);
  const status = daysUntilDue < 0
    ? "overdue"
    : daysUntilDue <= SERVICE_WARNING_DAYS
      ? "soon"
      : "ok";

  return {
    status,
    dueDate: due,
    dueDateValue,
    dateDisplay: formatDateForDisplay(dueDateValue),
    daysUntilDue,
    reason: "",
  };
};
