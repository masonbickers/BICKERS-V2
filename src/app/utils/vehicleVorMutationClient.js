"use client";

import {
  addHistoricVehicleVorWithInspection,
  updateVehicleVorState,
} from "@/app/utils/maintenanceMutationClient";
import {
  addHistoricVorPeriod,
  archiveVehicleHistoricVorPeriod,
  correctVehicleHistoricVorPeriod,
  releaseVehicleAfterCompletedCompliance,
  scheduleVehicleReturnInspection,
  startVehicleVorPeriod,
} from "@/app/utils/vorPeriods";

export const VEHICLE_VOR_OPERATIONS = Object.freeze({
  START: "start",
  SCHEDULE_RETURN: "schedule_return",
  RELEASE: "release",
  ADD_HISTORIC: "add_historic",
  CORRECT_HISTORIC: "correct_historic",
  ARCHIVE_HISTORIC: "archive_historic",
});

export function applyVehicleVorOperation(vehicle = {}, operation, payload = {}, actor = {}) {
  const now = new Date().toISOString();
  switch (operation) {
    case VEHICLE_VOR_OPERATIONS.START:
      return startVehicleVorPeriod(vehicle, payload, { startedAt: now });
    case VEHICLE_VOR_OPERATIONS.SCHEDULE_RETURN:
      return scheduleVehicleReturnInspection(vehicle, payload, { requestedAt: now });
    case VEHICLE_VOR_OPERATIONS.RELEASE:
      return releaseVehicleAfterCompletedCompliance(vehicle, payload, { completedAt: now, releasedBy: actor });
    case VEHICLE_VOR_OPERATIONS.ADD_HISTORIC:
      return addHistoricVorPeriod(vehicle, { ...payload, migratedBy: actor }, { mutatedAt: now, mutatedBy: actor });
    case VEHICLE_VOR_OPERATIONS.CORRECT_HISTORIC:
      return correctVehicleHistoricVorPeriod(vehicle, payload.recordId, payload.changes, {
        reason: payload.reason,
        correctedAt: now,
        correctedBy: actor,
      });
    case VEHICLE_VOR_OPERATIONS.ARCHIVE_HISTORIC:
      return archiveVehicleHistoricVorPeriod(vehicle, payload.recordId, {
        reason: payload.reason,
        archivedAt: now,
        archivedBy: actor,
      });
    default:
      throw new Error("Unsupported VOR/SORN mutation.");
  }
}

export async function mutateVehicleVor({ vehicleId, operation, payload = {} }) {
  if (!vehicleId) throw new Error("Vehicle id is required.");
  if (operation === VEHICLE_VOR_OPERATIONS.ADD_HISTORIC) {
    return addHistoricVehicleVorWithInspection({ vehicleId, ...payload });
  }
  const result = await updateVehicleVorState({ vehicleId, operation, payload });
  return result?.vehicle || null;
}
