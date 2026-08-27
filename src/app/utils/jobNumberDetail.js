import {
  buildBookingDerivedFields,
  buildNextLifecycle,
  buildNextStatusHistory,
  buildSynchronizedVehicleStatus,
  canonicalBookingStatus,
  isInactiveBookingStatus,
} from "./bookingLifecycle.js";

export const REOPENED_BOOKING_STATUS = "Enquiry";

export function formatProductionIdentity(job = {}, fallback = "Booking") {
  const values = [job.client, job.production]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const uniqueValues = values.filter(
    (value, index) =>
      values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index
  );
  return uniqueValues.join(" · ") || fallback;
}

export function isLockedJobStatus(status = "") {
  return isInactiveBookingStatus(status) && canonicalBookingStatus(status) !== "Deleted";
}

export function lockedBookingMessage(status = "") {
  const label = canonicalBookingStatus(status);
  return `This booking is marked ${label} and is view-only. Invoicing and timesheets are not required.`;
}

export function buildReopenBookingPayload(job = {}, { timestamp, actor = {} } = {}) {
  const changedAt = timestamp || new Date().toISOString();
  const previousStatus = canonicalBookingStatus(job.status);
  const actorEmail = String(actor.email || "Unknown").trim() || "Unknown";
  const actorUid = String(actor.uid || "").trim();
  const statusHistory = buildNextStatusHistory(
    job.statusHistory,
    previousStatus,
    REOPENED_BOOKING_STATUS,
    changedAt,
    { email: actorEmail, uid: actorUid }
  );
  const lifecycle = buildNextLifecycle(
    job.lifecycle,
    previousStatus,
    REOPENED_BOOKING_STATUS,
    changedAt
  );
  const derivedFields = buildBookingDerivedFields({
    ...job,
    status: REOPENED_BOOKING_STATUS,
  });

  return {
    status: REOPENED_BOOKING_STATUS,
    vehicleStatus: buildSynchronizedVehicleStatus(job, REOPENED_BOOKING_STATUS),
    statusChangedAt: changedAt,
    lastEditedBy: actorEmail,
    lastEditedByUid: actorUid,
    updatedAt: changedAt,
    statusHistory,
    lifecycle,
    ...derivedFields,
    history: [
      ...(Array.isArray(job.history) ? job.history : []),
      {
        action: "Reopened",
        user: actorEmail,
        timestamp: changedAt,
        changes: [`Status: ${previousStatus} to ${REOPENED_BOOKING_STATUS}`],
        details: `Reopened from ${previousStatus}. Allocations require review.`,
      },
    ],
  };
}
