export const VEHICLE_BOOKING_COLLECTIONS = Object.freeze([
  { collection: "maintenanceBookings", vehicleFields: ["vehicleId"] },
  { collection: "maintenanceJobs", vehicleFields: ["vehicleId", "assetId"] },
  { collection: "workBookings", vehicleFields: ["vehicleId"] },
]);

const text = (value) => String(value || "").trim();

export const isRecordLinkedToVehicle = (record = {}, vehicleId = "", vehicleFields = []) => {
  const expected = text(vehicleId);
  if (!expected) return false;
  return vehicleFields.some((field) => text(record?.[field]) === expected);
};

export const linkedVehicleBookingDocuments = ({ documents = [], vehicleId, vehicleFields, companyId = "" }) => {
  const tenant = text(companyId);
  return documents.filter((document) => {
    const data = document?.data || {};
    if (tenant && data.companyId && text(data.companyId) !== tenant) return false;
    return isRecordLinkedToVehicle(data, vehicleId, vehicleFields);
  });
};
