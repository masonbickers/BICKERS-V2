import assert from "node:assert/strict";
import test from "node:test";
import { getMaintenanceCreationDisposition } from "../src/app/utils/maintenanceMutationPolicy.js";
import { buildMaintenanceCalendarEvents } from "../src/app/utils/maintenanceCalendar.js";

const reminder = {
  id: "inspection-due",
  vehicleId: "lorry-02",
  type: "INSPECTION",
  status: "Booked",
  origin: { source: "automatic_schedule" },
  bookingDates: ["2026-09-07"],
  sourceDueDateISO: "2026-09-07",
  maintenanceTypeIds: ["pmi", "brake_test"],
  items: ["pmi", "brake_test"].map((maintenanceTypeId) => ({
    maintenanceTypeId, status: "booked", legalDueDateISO: "2026-09-07",
  })),
};
const intent = {
  existing: reminder, id: reminder.id, status: "booked",
  dates: ["2026-09-07"], typeIds: ["pmi", "brake_test"], vehicleId: reminder.vehicleId,
};
const calendarStatus = (booking) => buildMaintenanceCalendarEvents({
  vehicles: [{ id: reminder.vehicleId, name: "U-Crane Lorry 02" }],
  maintenanceBookings: [booking], asOfDate: "2026-09-07",
})[0]?.bookingStatus;

test("same-date confirmation of an automatic PMI/brake reminder must write, even without optional garage details", () => {
  assert.equal(calendarStatus(reminder), "Due — not yet arranged");
  assert.equal(getMaintenanceCreationDisposition(intent), "arrange");
  const confirmed = { ...reminder, arrangedAt: "2026-09-07T13:00:00Z", arrangedBy: "admin@example.test" };
  assert.equal(calendarStatus(confirmed), "Confirmed booking");
  assert.equal(getMaintenanceCreationDisposition({ ...intent, existing: confirmed }), "idempotent");
});

test("an automatic reminder can be arranged on a different appointment date", () => {
  assert.equal(getMaintenanceCreationDisposition({ ...intent, dates: ["2026-09-09"] }), "arrange");
});

test("creation does not replace confirmed, completed, or different-vehicle/item bookings", () => {
  for (const override of [
    { existing: { ...reminder, arrangedAt: "2026-09-01T10:00:00Z" }, dates: ["2026-09-09"] },
    { existing: { ...reminder, status: "Completed" } },
    { vehicleId: "other-lorry" },
    { typeIds: ["pmi"] },
  ]) assert.throws(() => getMaintenanceCreationDisposition({ ...intent, ...override }), /cannot be replaced/);
});

test("new and requested bookings retain their existing creation paths", () => {
  assert.equal(getMaintenanceCreationDisposition({ ...intent, existing: null }), "create");
  assert.equal(getMaintenanceCreationDisposition({ ...intent, existing: { ...reminder, status: "Requested" } }), "arrange");
});
