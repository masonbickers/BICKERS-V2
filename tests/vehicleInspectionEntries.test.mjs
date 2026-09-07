import assert from "node:assert/strict";
import test from "node:test";
import { vehicleInspectionEntries } from "../src/app/utils/vehicleInspectionEntries.js";

test("backdated completed inspections are available ahead of newer bookings, independent of VOR dates", () => {
  const entries = vehicleInspectionEntries([
    { id: "later", vehicleId: "hiab", type: "INSPECTION", status: "Booked", appointmentDate: "2026-09-07" },
    { id: "completed", vehicleId: "hiab", type: "INSPECTION", status: "Completed", completedAtISO: "2026-08-10" },
    { id: "other-vehicle", vehicleId: "other", type: "INSPECTION", status: "Completed", completedAtISO: "2026-08-10" },
    { id: "cancelled", vehicleId: "hiab", type: "INSPECTION", status: "Cancelled" },
    { id: "archived", vehicleId: "hiab", type: "INSPECTION", status: "Archived" },
    { id: "mot", vehicleId: "hiab", type: "MOT", status: "Booked" },
  ], "hiab", "2026-08-10");
  assert.deepEqual(entries.map((entry) => entry.booking.id), ["completed", "later"]);
  assert.equal(entries[0].date, "2026-08-10");
  assert.equal(entries[0].status, "completed");
});

test("canonical separate PMI and brake-test items retain their actual completion dates", () => {
  const entries = vehicleInspectionEntries([
    { id: "brake", vehicleId: "hiab", maintenanceTypeIds: ["brake_test"], status: "Completed", items: [{ maintenanceTypeId: "brake_test", completionDateISO: "2026-08-10" }] },
    { id: "pmi", vehicleId: "hiab", maintenanceTypeIds: ["pmi"], status: "Booked", items: [{ maintenanceTypeId: "pmi" }], schedule: { bookingDates: ["2026-08-09"] } },
  ], "hiab");
  assert.deepEqual(entries.map(({ date }) => date), ["2026-08-10", "2026-08-09"]);
  assert.deepEqual(entries[0].items.map((item) => item.maintenanceTypeId), ["brake_test"]);
});
