import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServiceHistoryItems,
  ensureServiceHistoryForLastService,
  resolveLatestCoreServiceCompletionDate,
} from "../src/app/utils/serviceHistory.js";

test("a last-service date without a linked record is retained with honest provenance", () => {
  const history = ensureServiceHistoryForLastService([], "2026-03-21");

  assert.equal(history.length, 1);
  assert.equal(history[0].completedDate, "2026-03-21");
  assert.equal(history[0].bookingRef, "Recorded service date");
  assert.match(history[0].notes, /no linked service completion record/i);
});

test("service history combines structured and vehicle history without duplicate dates", () => {
  const items = buildServiceHistoryItems({
    vehicle: {
      lastService: "2026-03-21",
      serviceHistory: [
        { completedDate: "2026-03-21", bookingRef: "Legacy entry" },
        { completedDate: "2025-03-22", bookingRef: "Annual service" },
      ],
    },
    serviceRecords: [
      {
        id: "record-1",
        serviceDateOnly: "2026-03-21",
        serviceType: "Full service",
      },
    ],
  });

  assert.deepEqual(items.map((item) => item.completedDate), ["2026-03-21", "2025-03-22"]);
  assert.equal(items[0].serviceRecordId, "record-1");
  assert.equal(items[1].sourceLabel, "Vehicle service date");
});

test("service history keeps distinct structured records completed on the same day", () => {
  const items = buildServiceHistoryItems({
    vehicle: { serviceHistory: [] },
    serviceRecords: [
      { id: "record-1", serviceDateOnly: "2026-03-21", serviceType: "Minor service" },
      { id: "record-2", serviceDateOnly: "2026-03-21", serviceType: "Follow-up repair" },
    ],
  });

  assert.deepEqual(items.map((item) => item.serviceRecordId), ["record-1", "record-2"]);
});

test("service history preserves service type, reference, provider, and actual location", () => {
  const [item] = buildServiceHistoryItems({
    vehicle: {},
    serviceRecords: [{
      id: "record-1",
      serviceDateOnly: "2026-03-21",
      serviceType: "Full service",
      bookingRef: "SV-104",
      provider: "Fleet Garage",
      signedBy: "Technician",
      location: "Workshop 2",
      registration: "AB12 CDE",
    }],
  });

  assert.equal(item.title, "Full service");
  assert.equal(item.serviceType, "Full service");
  assert.equal(item.bookingRef, "SV-104");
  assert.equal(item.provider, "Fleet Garage");
  assert.equal(item.location, "Workshop 2");
});

test("latest core service completion ignores newer general repairs", () => {
  const completedDate = resolveLatestCoreServiceCompletionDate({
    vehicle: {
      lastService: "2026-08-19",
      serviceHistory: [{ completedDate: "2026-08-19", bookingId: "service-booking-1" }],
    },
    serviceRecords: [
      { serviceDateOnly: "2026-09-01", serviceType: "General repair" },
      { serviceDateOnly: "2026-08-19", serviceType: "Full service" },
    ],
  });

  assert.equal(completedDate, "2026-08-19");
});

test("latest core service completion recognises structured service records", () => {
  assert.equal(
    resolveLatestCoreServiceCompletionDate({
      serviceRecords: [
        { serviceDateOnly: "2026-07-01", serviceType: "Interim service" },
        { serviceDateOnly: "2026-07-10", serviceType: "Brake repair" },
      ],
    }),
    "2026-07-01"
  );
});
