import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/app/quote/[id]/page.js", import.meta.url),
  "utf8"
);

test("loading a quote template does not add a discount automatically", () => {
  const loadTemplate = source.match(/const loadTemplate = \(templateId\) => \{[\s\S]*?\n  \};/)?.[0] || "";

  assert.match(
    loadTemplate,
    /lineItems:\s*template\.lineItems\.filter\(\(item\) => !isDiscountLine\(item\)\)\.map\(cloneTemplateItem\)/
  );
});

test("discounts are only created by the explicit discount action", () => {
  const addDiscountLine = source.match(/const addDiscountLine = \(section = ""\) => \{[\s\S]*?\n  \};/)?.[0] || "";

  assert.match(addDiscountLine, /description:\s*"Discount"/);
  assert.match(addDiscountLine, /totalMode:\s*"discount"/);
});
