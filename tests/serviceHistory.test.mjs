import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServiceHistoryItems,
  ensureServiceHistoryForLastService,
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
