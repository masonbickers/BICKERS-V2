import {
  buildRequestedMaintenanceRecord,
  maintenanceDateOnly,
  maintenanceRequirementDocumentId,
} from "./maintenanceRecord.js";

const text = (value) => String(value || "").trim();

export const motReconciliationJobId = (bookingId, completedDateISO) => {
  const completed = maintenanceDateOnly(completedDateISO);
  return bookingId && completed
    ? `recurrence_${text(bookingId)}_${completed.replaceAll("-", "")}`
    : "";
};

export const buildMotDvsaReconciliationPlan = ({
  vehicle = {},
  vehiclePatch = {},
  nowISO = new Date().toISOString(),
} = {}) => {
  const bookingId = text(vehicle.motAwaitingDvsaBookingId);
  const completedDateISO = maintenanceDateOnly(vehicle.motAwaitingDvsaCompletionDate);
  const legalDueDateISO = maintenanceDateOnly(
    vehiclePatch.nextMOT || vehiclePatch.nextMot || vehiclePatch.motExpiryDate
  );
  const confirmed = vehiclePatch.motDvsaConfirmationStatus === "confirmed";
  if (!bookingId || !completedDateISO || !legalDueDateISO || !confirmed) return null;

  const requested = buildRequestedMaintenanceRecord({
    companyId: text(vehicle.companyId),
    vehicleId: text(vehicle.id),
    vehicleLabel: text(
      vehicle.name || vehicle.vehicleName || vehicle.registration || vehicle.reg || vehicle.id
    ),
    items: [{ maintenanceTypeId: "mot", legalDueDateISO }],
    source: "dvsa_reconciliation",
    sourceId: bookingId,
  });
  const dueItemId = maintenanceRequirementDocumentId(requested.requirementKey);
  const jobId = motReconciliationJobId(bookingId, completedDateISO);
  return {
    bookingId,
    completedDateISO,
    legalDueDateISO,
    dueItemId,
    jobId,
    requestedRecord: {
      ...requested,
      id: dueItemId,
      status: "Requested",
      items: requested.items.map((item) => ({ ...item, status: "requested" })),
      bookingDates: [],
      appointmentDateISO: "",
      startDateISO: "",
      endDateISO: "",
      createdAt: nowISO,
      updatedAt: nowISO,
      createdBy: "dvsa_reconciliation",
      lastEditedBy: "dvsa_reconciliation",
      history: [{
        action: "MOT due item created after DVSA confirmation",
        user: "dvsa_reconciliation",
        timestamp: nowISO,
        changes: [
          `Completed MOT booking: ${bookingId}`,
          `DVSA-confirmed legal due date: ${legalDueDateISO}`,
        ],
      }],
    },
  };
};
