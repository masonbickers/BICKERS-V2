export const VEHICLE_REALTIME_FIELDS = Object.freeze([
  "vorHistory",
  "operationalStatus",
  "fleetStatus",
  "vehicleStatus",
  "status",
  "vorStartedAt",
  "vorEndedAt",
  "activeVorRecordId",
  "pendingReturnInspection",
  "maintenanceCountdownPause",
  "complianceVor",
  "updatedAt",
]);

export const shouldApplyRealtimeSnapshot = (metadata = {}) =>
  metadata?.hasPendingWrites !== true;

export function mergeVehicleRealtimeState(localVehicle = {}, remoteVehicle = {}) {
  const next = { ...(localVehicle || {}) };
  VEHICLE_REALTIME_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(remoteVehicle || {}, field)) {
      next[field] = remoteVehicle[field];
    }
  });
  return next;
}
