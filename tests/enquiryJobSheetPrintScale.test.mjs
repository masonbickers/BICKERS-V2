import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8"
);
const jobSheetStyles = readFileSync(
  new URL("../src/app/components/EnquiryActionJobSheet.module.css", import.meta.url),
  "utf8"
);

test("printable enquiry job sheets ignore the signed-in interface scale", () => {
  assert.match(
    globals,
    /html\[data-interface-scale\] body\.printing-enquiry-action-sheet \.app-shell-root[\s\S]*?zoom:\s*1 !important;[\s\S]*?width:\s*100% !important;[\s\S]*?height:\s*auto !important;/
  );
});

test("printable enquiry job sheets remove hidden application content from pagination", () => {
  assert.match(
    globals,
    /body\.printing-enquiry-action-sheet \*:not\(:has\(\.enquiry-action-sheet-print-root\)\)[\s\S]*?display:\s*none !important;/
  );
  assert.match(
    globals,
    /body\.printing-enquiry-action-sheet \*:has\(\.enquiry-action-sheet-print-root\)[\s\S]*?height:\s*auto !important;[\s\S]*?min-height:\s*0 !important;/
  );
});

test("the printed form is centred and its Arial title stays black", () => {
  assert.match(
    jobSheetStyles,
    /\.sheet\s*\{[\s\S]*?width:\s*520\.48pt;[\s\S]*?margin:\s*0 auto;/
  );
  assert.match(
    jobSheetStyles,
    /\.sheet h1\s*\{[\s\S]*?margin:\s*0 0 9\.1pt;[\s\S]*?color:\s*#000 !important;[\s\S]*?font-family:\s*Arial[\s\S]*?font-size:\s*28pt;/
  );
  assert.match(
    globals,
    /:where\(h1\):not\(\.quote-print-page h1\):not\(\.enquiry-action-sheet-print-root h1\)/
  );
});
