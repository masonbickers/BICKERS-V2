import test from "node:test";
import assert from "node:assert/strict";
import {
  SHARED_RATE_RULES,
  applySharedRateToTemplates,
  normalizeSharedRatePrice,
  nextQuoteTemplateRevision,
  sharedRateLineStatus,
  summarizeSharedRates,
} from "../src/app/utils/quoteTemplateSharedRates.js";
import { FULL_SIZE_TRACKING_QUOTE_TEMPLATES } from "../src/app/utils/quoteTemplates.js";
import { mergeQuoteTemplatesWithDefaults } from "../src/app/utils/quoteTemplateDefaults.js";

test("unmatched lines are template-only and quantity does not determine linkage", () => {
  assert.deepEqual(sharedRateLineStatus({ description: "Vehicle-specific camera platform" }), { id: "template", label: "Template Only" });
  assert.equal(sharedRateLineStatus({ description: "To Services of Driver/Technician per 10hr Cont Day", qty: "3" }).id, "shared");
});

test("revision checks reject stale saves and increment current saves", () => {
  assert.equal(nextQuoteTemplateRevision(4, 4), 5);
  assert.throws(() => nextQuoteTemplateRevision(3, 4), (error) => error.code === "quote-template-conflict");
});

test("custom and excluded lines do not create linked variance", () => {
  const line = { description: "To Services of Driver/Technician per 10hr Cont Day", unitPrice: "585.00", totalMode: "auto" };
  const templates = [
    { id: "linked", lineItems: [line] },
    { id: "custom", lineItems: [{ ...line, totalMode: "tbc", isCustomPrice: true }] },
    { id: "excluded", excludeFromSharedRates: true, lineItems: [{ ...line, unitPrice: "680.00" }] },
  ];
  const summary = summarizeSharedRates(templates).find((item) => item.id === "driver_day");
  assert.equal(summary.hasVariance, false);
  assert.equal(summary.updateLineCount, 1);
  assert.equal(summary.lockedLineCount, 1);
  assert.equal(summary.excludedTemplateCount, 1);
});

test("shared rate application preserves custom and excluded lines", () => {
  const rule = SHARED_RATE_RULES.find((item) => item.id === "driver_day");
  const line = { description: "To Services of Driver/Technician per 10hr Cont Day", unitPrice: "500.00", totalMode: "tbc" };
  const updated = applySharedRateToTemplates([
    { id: "linked", lineItems: [line] },
    { id: "custom", lineItems: [{ ...line, isCustomPrice: true }] },
    { id: "excluded", excludeFromSharedRates: true, lineItems: [line] },
  ], rule, { unitPrice: "585.00", totalMode: "auto" });
  assert.equal(updated[0].lineItems[0].unitPrice, "585.00");
  assert.equal(updated[1].lineItems[0].unitPrice, "500.00");
  assert.equal(updated[2].lineItems[0].unitPrice, "500.00");
});

test("applying the overtime shared rate also standardizes its wording", () => {
  const rule = SHARED_RATE_RULES.find((item) => item.id === "overtime_1_5");
  const updated = applySharedRateToTemplates([{
    id: "linked",
    lineItems: [{
      description: "Overtime Charged @ 1.5T (Inc. Pre-Calls & Call Times Prior to 07:00)",
      unitPrice: "80.00",
      totalMode: "tbc",
    }],
  }], rule, { unitPrice: "87.75", totalMode: "tbc" });

  assert.equal(
    updated[0].lineItems[0].description,
    "Overtime - 1.5x hourly rate: after 10 hours and for pre-call/call time before 07:00."
  );
});

test("travel meal and room-only hotel charges are linked shared rates", () => {
  const summaries = summarizeSharedRates([{
    id: "travel",
    lineItems: [
      { description: "Travel Meal Allowance per man per day", unitPrice: "22.00", totalMode: "tbc" },
      { description: "Hotel Per Man Per Room", unitPrice: "TBC", totalMode: "production" },
      { description: "Hotel & Overnight charge if Tracking Vehicle is pre-rigged & left rigged between shoot days", unitPrice: "TBC", totalMode: "tbc" },
    ],
  }]);

  assert.equal(summaries.find((item) => item.id === "travel_meal")?.occurrenceCount, 1);
  assert.equal(summaries.find((item) => item.id === "hotel_room")?.occurrenceCount, 1);
  assert.equal(sharedRateLineStatus({ description: "Hotel & Overnight charge if Tracking Vehicle is pre-rigged" }).id, "template");
});

test("standard travel shared rates cover all templates without capturing specialist lines", () => {
  const templates = mergeQuoteTemplatesWithDefaults([], FULL_SIZE_TRACKING_QUOTE_TEMPLATES);
  const summaries = summarizeSharedRates(templates);

  for (const id of ["overnight_meal", "recce_travel_time", "london_home_counties", "congestion_ulez", "clean_air"]) {
    const summary = summaries.find((item) => item.id === id);
    assert.equal(summary?.templateCount, 54, id);
    assert.equal(summary?.occurrenceCount, 54, `${id} should update exactly one standard line per template`);
  }

  assert.equal(sharedRateLineStatus({ description: "Hotel & Overnight charge if Tracking Vehicle is pre-rigged" }).id, "template");
  assert.equal(sharedRateLineStatus({ description: "Recce Travel Day (When recce is outside the London area)" }).id, "template");
  assert.equal(sharedRateLineStatus({ description: "ULEZ Charge per vehicle" }).id, "template");
  assert.equal(sharedRateLineStatus({ description: "Recce Hours Travel Time (When recce is outside the London area)" }).id, "shared");
});

test("shared rate prices accept currency values, blank and TBC", () => {
  assert.deepEqual(normalizeSharedRatePrice("585"), { valid: true, value: "585.00" });
  assert.deepEqual(normalizeSharedRatePrice(""), { valid: true, value: "" });
  assert.deepEqual(normalizeSharedRatePrice("tbc"), { valid: true, value: "TBC" });
  assert.equal(normalizeSharedRatePrice("£5x").valid, false);
  assert.equal(normalizeSharedRatePrice("-1").valid, false);
});
