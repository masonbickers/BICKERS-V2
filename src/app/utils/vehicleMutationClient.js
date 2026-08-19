"use client";

import { auth } from "../../../firebaseConfig";

export async function deleteVehicleAndBookings(vehicleId) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in before deleting a vehicle.");

  const response = await fetch(`/api/vehicles/${encodeURIComponent(vehicleId)}/delete`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Vehicle deletion failed.");
  return result;
}
