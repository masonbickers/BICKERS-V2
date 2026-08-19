"use client";

import { auth } from "../../../firebaseConfig";

const mutationRequest = async (operation, payload = {}) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in before changing a maintenance booking.");
  const response = await fetch("/api/maintenance/bookings/mutate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operation, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Maintenance update failed.");
  return result;
};

export const createMaintenanceBooking = (payload) => mutationRequest("create", { payload });
export const updateMaintenanceBooking = (payload) => mutationRequest("edit", { payload });
export const rescheduleMaintenanceBooking = (payload) => mutationRequest("reschedule", { payload });
export const completeMaintenanceBooking = (payload) => mutationRequest("complete", { payload });
export const completeMaintenanceBookingItems = (payload) => mutationRequest("complete_items", { payload });
export const cancelMaintenanceBooking = (payload) => mutationRequest("cancel", { payload });
export const deleteMaintenanceBooking = (payload) => mutationRequest("archive", { payload });
export const createMaintenanceWorkBooking = (payload) => mutationRequest("create_work", { payload });
export const updateMaintenanceWorkBooking = (payload) => mutationRequest("update_work", { payload });
export const commitVehicleVorTransition = (payload) => mutationRequest("vor_transition", { payload });
export const addHistoricVehicleVorWithInspection = (payload) => mutationRequest("add_historic_vor", { payload });
export const linkHistoricVorFirstUseInspection = (payload) => mutationRequest("link_historic_vor_inspection", { payload });
export const syncVehicleAnnualMaintenanceForecast = (payload) => mutationRequest("sync_forecast", { payload });
export const updateMaintenanceDocuments = (payload) => mutationRequest("update_documents", { payload });
export const updateVehicleVorState = (payload) => mutationRequest("vehicle_vor", { payload });
