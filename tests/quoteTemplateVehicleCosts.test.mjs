import test from "node:test";
import assert from "node:assert/strict";
import { summarizeQuoteTemplateVehicleCosts } from "../src/app/utils/quoteTemplateVehicleCosts.js";

const template = (id, name, vehicle, price, extraLines = []) => ({
  id,
  serviceDescription: name,
  lineItems: [
    { section: "Equipment - Daily Rates", description: vehicle, unitPrice: price, totalMode: "auto" },
    ...extraLines,
  ],
});

test("vehicle-cost summary uses the first equipment line as the template vehicle", () => {
  const summary = summarizeQuoteTemplateVehicleCosts([
    template("a", "Template A", "Silverado Elite Tracking Vehicle", "800.00", [
      { section: "Equipment - Daily Rates", description: "5K Generator", unitPrice: "180.00" },
    ]),
    { id: "recce", lineItems: [{ section: "Labour", description: "Recce", unitPrice: "585.00" }] },
  ]);

  assert.equal(summary.entries.length, 1);
  assert.equal(summary.entries[0].vehicleName, "Silverado Elite Tracking Vehicle");
  assert.equal(summary.entries[0].unitPrice, "800.00");
});

test("vehicle-cost summary identifies matching costs and inconsistent vehicle prices", () => {
  const summary = summarizeQuoteTemplateVehicleCosts([
    template("mini-old", "Mini old", "Mini Cooper Tracking Vehicle", "690"),
    template("mini-new", "Mini new", "Mini Cooper Tracking Vehicle", "700.00"),
    template("cheyenne", "Cheyenne", "Cheyenne Elite Tracking Vehicle", "700"),
  ]);

  const mini = summary.entries.filter((entry) => entry.vehicleName.startsWith("Mini"));
  const cheyenne = summary.entries.find((entry) => entry.vehicleName.startsWith("Cheyenne"));
  assert.equal(summary.uniqueVehicleCount, 2);
  assert.equal(summary.varianceVehicleCount, 1);
  assert.equal(summary.sharedCostCount, 1);
  assert.ok(mini.every((entry) => entry.hasVehiclePriceDifference));
  assert.equal(cheyenne.sharesCostWithOtherVehicles, true);
  assert.equal(cheyenne.costVehicleCount, 2);
  assert.equal(summary.priceGroups.length, 2);
  assert.deepEqual(
    summary.priceGroups.find((group) => group.priceKey === "700.00").vehicles.map((vehicle) => vehicle.vehicleName),
    ["Cheyenne Elite Tracking Vehicle", "Mini Cooper Tracking Vehicle"]
  );
});
