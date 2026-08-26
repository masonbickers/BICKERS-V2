import test from "node:test";
import assert from "node:assert/strict";

import { getQuoteBuilderValidation } from "../src/app/utils/quoteBuilderValidation.js";

test("an empty quote cannot be printed or saved", () => {
  assert.deepEqual(getQuoteBuilderValidation({ quoteName: "", lineItems: [] }), {
    hasName: false,
    hasLines: false,
    canPrint: false,
    canSave: false,
    message: "Add a quote name and choose a template or start from scratch.",
  });
});

test("a manual quote with a name and line can be printed and saved", () => {
  const result = getQuoteBuilderValidation({
    quoteName: "Manual vehicle quote",
    lineItems: [{ description: "Vehicle hire" }],
  });

  assert.equal(result.canPrint, true);
  assert.equal(result.canSave, true);
  assert.equal(result.message, "");
});

test("a template is not required when valid manual content exists", () => {
  const result = getQuoteBuilderValidation({
    quoteName: "Custom quote",
    templateId: "",
    lineItems: [{ description: "Custom line" }],
  });

  assert.equal(result.canSave, true);
});

test("missing name and missing lines report focused guidance", () => {
  assert.equal(
    getQuoteBuilderValidation({ quoteName: "", lineItems: [{}] }).message,
    "Add a quote name before saving."
  );
  assert.equal(
    getQuoteBuilderValidation({ quoteName: "Named quote", lineItems: [] }).message,
    "Choose a template or start from scratch before saving."
  );
});
