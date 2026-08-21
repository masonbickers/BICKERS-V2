import { getRecurringMaintenanceWorkflow } from "./maintenanceSchema.js";
import { getRegisterComplianceState } from "./vehicleRegisterPresentation.js";
import { dateOnlyString, formatDateForDisplay, toDateLike } from "./serviceRecordCompat.js";

const motWorkflow = getRecurringMaintenanceWorkflow("mot");

export const MOT_WARNING_DAYS = Number(motWorkflow?.warningWeeks || 0) * 7;

const startOfDay = (value) => {
  const parsed = toDateLike(value);
  return parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null;
};

export const getMotDuePresentation = (
  vehicle = {},
  { dueDate = "", referenceDate = new Date() } = {}
) => {
  const compliance = getRegisterComplianceState(vehicle, "mot");
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

  if (vehicle?.motAwaitingDvsaConfirmation) {
    return {
      status: "awaiting-dvsa",
      dueDate: null,
      dueDateValue: "",
      dateDisplay: "Awaiting DVSA confirmation",
      daysUntilDue: null,
      reason: "Completed MOT is awaiting DVSA confirmation",
    };
  }

  const dueDateValue = dateOnlyString(dueDate || compliance.value);
  const due = startOfDay(dueDateValue);
  const today = startOfDay(referenceDate);
  if (!due || !today) {
    return {
      status: "unknown",
      dueDate: null,
      dueDateValue: "",
      dateDisplay: "-",
      daysUntilDue: null,
      reason: "No MOT expiry date recorded",
    };
  }

  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86400000);
  const status = daysUntilDue < 0
    ? "overdue"
    : daysUntilDue <= MOT_WARNING_DAYS
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
