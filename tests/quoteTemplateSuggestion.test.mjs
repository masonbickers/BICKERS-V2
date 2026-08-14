import test from "node:test";
import assert from "node:assert/strict";

import { findSuggestedQuoteTemplateForVehicles } from "../src/app/utils/quoteTemplateSuggestion.js";

const templates = [
  { id: "cheyenne", file: "Cheyenne.xls", serviceDescription: "Cheyenne Elite Tracking Vehicle" },
  { id: "pod-car", file: "Pod Car.xls", serviceDescription: "Pod Car / Top Driver Car" },
  { id: "low-loader-1", file: "Low Loader No 1.xls", serviceDescription: "Artic Low Loader No.1" },
  { id: "low-loader-2", file: "Low Loader No 2.xls", serviceDescription: "Artic Low Loader No.2" },
];

test("the most specific assigned vehicle match wins", () => {
  const result = findSuggestedQuoteTemplateForVehicles(
    ["Cheyenne (LUI 6733)", "Pod Car (Q3) (AO13 XMY)"],
    templates
  );

  assert.equal(result?.id, "pod-car");
});

test("numbered vehicle variants select their matching template", () => {
  const result = findSuggestedQuoteTemplateForVehicles(["Low Loader No.2 / U-C"], templates);

  assert.equal(result?.id, "low-loader-2");
});

test("no suggestion is made without a matching assigned vehicle", () => {
  assert.equal(findSuggestedQuoteTemplateForVehicles(["Support Van"], templates), null);
});
