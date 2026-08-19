import assert from "node:assert/strict";
import test from "node:test";

import { buildCommonMaintenanceProviders } from "../src/app/utils/maintenanceProviders.js";

test("common maintenance providers are deduplicated and ordered by usage", () => {
  assert.deepEqual(
    buildCommonMaintenanceProviders([
      { provider: "Hills" },
      { provider: "Ray Goudys" },
      { provider: " hills " },
      { provider: "" },
      { provider: "Ray Goudys" },
      { provider: "Ray Goudys" },
    ]),
    ["Ray Goudys", "Hills"]
  );
});

test("common maintenance providers respect the supplied limit", () => {
  assert.deepEqual(
    buildCommonMaintenanceProviders(
      [{ provider: "C" }, { provider: "A" }, { provider: "B" }],
      { limit: 2 }
    ),
    ["A", "B"]
  );
});

test("removed provider suggestions stay hidden without changing historical records", () => {
  const records = [
    { provider: "Hills5Ways" },
    { provider: "Rackhams" },
    { provider: "HILLS5WAYS" },
  ];

  assert.deepEqual(
    buildCommonMaintenanceProviders(records, { excludedProviders: [" hills5ways "] }),
    ["Rackhams"]
  );
  assert.equal(records.length, 3);
});
