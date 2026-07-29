import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSynchronizedVehicleStatus,
  isInactiveBookingStatus,
} from "../src/app/utils/bookingLifecycle.js";

test("synchronizes every stored and attached vehicle status", () => {
  const job = {
    vehicleStatus: {
      "vehicle-1": "Confirmed",
      "M2": "First Pencil",
    },
    vehicles: [
      {
        id: "vehicle-1",
        name: "MERCEDES A45S - M2 SON",
        registration: "M2",
      },
      "Camera Car",
    ],
  };

  assert.deepEqual(
    buildSynchronizedVehicleStatus(job, "ready_to_invoice"),
    {
      "vehicle-1": "Ready to Invoice",
      M2: "Ready to Invoice",
      "MERCEDES A45S - M2 SON": "Ready to Invoice",
      "Camera Car": "Ready to Invoice",
    }
  );
});

test("creates a status map when a booking did not already have one", () => {
  assert.deepEqual(
    buildSynchronizedVehicleStatus(
      { vehicles: [{ id: "vehicle-2", name: "Tracking Car" }] },
      "Ready to Invoice"
    ),
    {
      "vehicle-2": "Ready to Invoice",
      "Tracking Car": "Ready to Invoice",
    }
  );
});

test("recognizes statuses that must release booking resources", () => {
  for (const status of ["DNH", "lost", "Postponed", "Cancelled", "canceled", "Deleted"]) {
    assert.equal(isInactiveBookingStatus(status), true, status);
  }

  for (const status of ["Enquiry", "Confirmed", "Complete", "Ready to Invoice"]) {
    assert.equal(isInactiveBookingStatus(status), false, status);
  }
});

test("synchronizes inactive vehicle statuses using canonical labels", () => {
  const booking = {
    vehicles: ["vehicle-1", "vehicle-2"],
    vehicleStatus: { "vehicle-1": "Confirmed" },
  };

  assert.deepEqual(buildSynchronizedVehicleStatus(booking, "canceled"), {
    "vehicle-1": "Cancelled",
    "vehicle-2": "Cancelled",
  });
});
