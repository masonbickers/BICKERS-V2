import {
  HGV_COMPLIANCE_TYPES,
  complianceDateOnly,
} from "./hgvCompliance.js";
import {
  RECURRING_MAINTENANCE_WORKFLOWS,
  getIsoWeekLabel,
} from "./maintenanceSchema.js";
import { getMaintenanceDueState } from "./maintenanceRecord.js";
import { isVehicleMaintenanceTypeEnabled } from "./maintenanceForecast.js";

const safeText = (value) => String(value || "").trim();

const asUtcDate = (value) => {
  const ymd = complianceDateOnly(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;
};

const alertIdPart = (value) =>
  safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";

export const normalizeAlertRecipients = (...values) =>
  Array.from(
    new Set(
      values
        .flat(Infinity)
        .map((value) => safeText(value).toLowerCase())
        .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    )
  );

export const buildMaintenanceWarningAlerts = (
  vehicle = {},
  { asOfDate = new Date(), evaluatedAt = new Date().toISOString() } = {}
) => {
  if (!asUtcDate(asOfDate)) return [];
  const vehicleId = safeText(vehicle.id);
  const registration = safeText(vehicle.registration || vehicle.reg || vehicle.name);

  return RECURRING_MAINTENANCE_WORKFLOWS.flatMap((workflow) => {
      if (!isVehicleMaintenanceTypeEnabled(vehicle, workflow)) return [];
      const dueDate = (workflow.nextFields || [workflow.nextField])
        .map((field) => complianceDateOnly(vehicle[field]))
        .find(Boolean) || "";
      if (!dueDate) return [];
      const dueState = getMaintenanceDueState({
        maintenanceTypeId: workflow.maintenanceTypeId,
        dueDate,
        asOfDate,
      });
      if (!["warning", "due", "overdue"].includes(dueState.state)) return [];

      const type = workflow.maintenanceTypeId;
      const label = workflow.label;
      return [{
        id: `maintenance-warning-${alertIdPart(vehicleId)}-${type}-${dueDate}`,
        category: "maintenance",
        severity: dueState.state === "warning" ? "warning" : "urgent",
        alertType: "due_warning",
        state: "open",
        vehicleId,
        companyId: safeText(vehicle.companyId),
        registration,
        maintenanceTypeId: type,
        maintenanceTypeLabel: label,
        dueDateISO: dueDate,
        dueIsoWeek: getIsoWeekLabel(dueDate),
        warningStartedDateISO: dueState.warningStartDateISO,
        dueState: dueState.state,
        detectedAt: evaluatedAt,
        title: `${label} due ISO week ${getIsoWeekLabel(dueDate)}`,
        message: `${registration || "Vehicle"} ${label.toLowerCase()} is ${dueState.state} (ISO week ${getIsoWeekLabel(dueDate)}).`,
      }];
    });
};

export const buildMaintenanceVorAlert = (
  vehicle = {},
  complianceVor = {},
  { evaluatedAt = new Date().toISOString() } = {}
) => {
  const vehicleId = safeText(vehicle.id);
  const startedDate = complianceDateOnly(complianceVor.startedDate || evaluatedAt);
  const reasons = Object.values(complianceVor.reasons || {})
    .filter(
      (reason) =>
        HGV_COMPLIANCE_TYPES.includes(safeText(reason?.type).toLowerCase()) &&
        !safeText(reason?.resolvedAt)
    )
    .map((reason) => safeText(reason?.type))
    .filter(Boolean);
  if (!vehicleId || !reasons.length) return null;
  const registration = safeText(vehicle.registration || vehicle.reg || vehicle.name);
  return {
    id: `maintenance-vor-${alertIdPart(vehicleId)}-${startedDate}`,
    category: "maintenance",
    severity: "critical",
    alertType: "automatic_vor",
    state: "open",
    vehicleId,
    companyId: safeText(vehicle.companyId),
    registration,
    maintenanceTypeIds: reasons,
    detectedAt: evaluatedAt,
    startedDateISO: startedDate,
    title: `${registration || "Vehicle"} automatically placed VOR`,
    message: `Incomplete compliance work: ${reasons.join(", ").replaceAll("_", " ")}.`,
  };
};

export const buildMaintenanceScheduleExceptionAlert = (
  booking = {},
  { evaluatedAt = new Date().toISOString() } = {}
) => {
  const status = safeText(booking.status).toLowerCase();
  if (["archived", "cancelled", "canceled", "complete", "completed", "closed", "deleted", "superseded"].includes(status)) {
    return null;
  }

  const bookingDates = [
    ...(Array.isArray(booking.bookingDates) ? booking.bookingDates : []),
    booking.appointmentDateISO,
    booking.startDateISO,
  ]
    .map(complianceDateOnly)
    .filter(Boolean)
    .sort();
  const legalItems = Array.isArray(booking.items) ? booking.items : [];
  const legalWeeks = new Set(
    [
      booking.legalDueIsoWeek,
      booking.sourceDueIsoWeek,
      ...legalItems.map((item) => item?.legalDueIsoWeek || item?.sourceDueIsoWeek),
    ]
      .map(safeText)
      .filter(Boolean)
  );
  const bookedWeeks = new Set(bookingDates.map(getIsoWeekLabel).filter(Boolean));
  const outsideLegalWeek =
    legalWeeks.size > 0 && bookedWeeks.size > 0 && [...bookedWeeks].some((week) => !legalWeeks.has(week));
  if (!outsideLegalWeek) return null;

  const vehicleId = safeText(booking.vehicleId);
  const bookingId = safeText(booking.id);
  if (!vehicleId || !bookingId) return null;
  const registration = safeText(
    booking.registration || booking.vehicleRegistration || booking.vehicleLabel || booking.vehicleName
  );
  const dueDateISO = [
    booking.legalDueDateISO,
    booking.sourceDueDateISO,
    booking.sourceDueDate,
    ...legalItems.map((item) => item?.legalDueDateISO || item?.sourceDueDateISO),
  ]
    .map(complianceDateOnly)
    .filter(Boolean)
    .sort()[0] || "";
  const dueIsoWeek = [...legalWeeks].sort()[0] || getIsoWeekLabel(dueDateISO);
  const appointmentDateISO = bookingDates[0] || "";
  const reason = safeText(booking.scheduleExceptionReason);

  return {
    id: `maintenance-schedule-exception-${alertIdPart(bookingId)}`,
    category: "maintenance",
    severity: "warning",
    alertType: "schedule_exception",
    state: "open",
    vehicleId,
    companyId: safeText(booking.companyId),
    registration,
    bookingId,
    dueDateISO,
    dueIsoWeek,
    appointmentDateISO,
    detectedAt: evaluatedAt,
    title: `${registration || "Vehicle"} appointment outside legal ISO week`,
    message: `Appointment moved to ${appointmentDateISO}; the legal deadline remains ${dueIsoWeek || dueDateISO}.${reason ? ` Reason: ${reason}` : ""}`,
  };
};
