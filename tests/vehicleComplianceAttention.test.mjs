import assert from "node:assert/strict";
import test from "node:test";

import { buildVehicleComplianceAttention } from "../src/app/utils/vehicleComplianceAttention.js";

const now = new Date(2026, 6, 28);

test("surfaces the U-Crane inspection gap and near-term maintenance dates", () => {
  const items = buildVehicleComplianceAttention(
    {
      category: "HGV",
      nextMOT: "2026-09-30",
      nextService: "2026-09-30",
      nextRFL: "2026-10-01",
      insuredUntil: "2027-01-30",
      nextTacho: "2027-10-15",
      nextBrakeTest: "2026-08-05",
      nextPMI: "2026-08-05",
      nextTachoDownload: "2026-07-29",
      lastTachoDownload: "2026-06-03",
      tachoDownloadFreq: 8,
    },
    {
      now,
      requireEightWeekInspection: true,
      enabledAdditional: [
        "tachoInspection",
        "brakeTest",
        "pmiInspection",
        "tachoDownload",
      ],
    }
  );

  assert.deepEqual(
    items.filter((item) => item.status !== "in-date").map((item) => [
      item.key,
      item.status,
      item.daysRemaining,
    ]),
    [
      ["eight-week-inspection", "missing", null],
      ["tachoDownload", "due-soon", 1],
      ["brakeTest", "due-soon", 8],
      ["pmiInspection", "due-soon", 8],
    ]
  );
});

test("exempt schedules and disabled maintenance lines are excluded", () => {
  const items = buildVehicleComplianceAttention(
    {
      motNotApplicable: true,
      serviceApplicable: false,
      nextRFL: "2027-01-01",
      insuredUntil: "2027-01-01",
      nextBrakeTest: "2026-07-20",
    },
    { now, enabledAdditional: [] }
  );

  assert.equal(items.some((item) => item.key === "mot"), false);
  assert.equal(items.some((item) => item.key === "service"), false);
  assert.equal(items.some((item) => item.key === "brakeTest"), false);
});

test("out-of-use vehicles and retained plates do not produce operational warnings", () => {
  assert.deepEqual(
    buildVehicleComplianceAttention({ operationalStatus: "Out of use" }, { now }),
    []
  );
  assert.deepEqual(
    buildVehicleComplianceAttention(
      { category: "Number Plates On Retention", retentionExpiry: "2026-08-01" },
      { now }
    ),
    []
  );
});

test("DVSA and calculated sources are identified without changing stored dates", () => {
  const items = buildVehicleComplianceAttention(
    {
      motHistorySyncedAt: "2026-07-17T11:32:00.000Z",
      nextMOT: "2026-09-30",
      lastService: "2025-10-01",
      serviceFreq: 52,
      nextService: "2026-09-30",
      nextRFL: "2027-01-01",
      insuredUntil: "2027-01-01",
    },
    { now }
  );

  assert.equal(items.find((item) => item.key === "mot")?.source, "DVSA");
  assert.equal(items.find((item) => item.key === "service")?.source, "Calculated");
});
